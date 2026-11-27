// Yonder: the window, the bridge, the menu bar icon, the keys, "Hey Yonder" and the notch.
use std::{
    cell::Cell,
    fs::OpenOptions,
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    os::unix::process::CommandExt,
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use core_foundation::runloop::{kCFRunLoopCommonModes, kCFRunLoopDefaultMode, CFRunLoop};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType, CallbackResult, EventField,
};
use tauri::{
    menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
}

/// Starts Sentry only in a release build with SENTRY_DSN at build time, so a build from source and a debug build send
/// nothing. The screen (src/main.tsx) sends to the same project. No event holds the host name of the computer.
fn start_sentry(release: String) -> Option<sentry::ClientInitGuard> {
    let dsn = option_env!("SENTRY_DSN").filter(|d| !d.is_empty() && !cfg!(debug_assertions))?;
    let mut options = sentry::ClientOptions::default();
    options.release = Some(release.into());
    options.before_send = Some(std::sync::Arc::new(|mut event| {
        event.server_name = None;
        Some(event)
    }));
    Some(sentry::init((dsn, options)))
}

fn main() {
    let context = tauri::generate_context!();
    // Panics go to Sentry with the version of the build. The guard sends what waits when main ends.
    let _sentry = start_sentry(context.package_info().version.to_string());
    // A restart into an update behind the app in front (`install`) starts with `--quiet`, and takes no focus.
    let quiet = std::env::args().any(|a| a == "--quiet");
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init()).activate_ignoring_other_apps(!quiet);
    // Only a copy for other Macs has the updater (`check_update`).
    let builder = match option_env!("YONDER_RELEASE") {
        Some(_) => builder.plugin(tauri_plugin_updater::Builder::new().build()),
        None => builder,
    };
    // A debug build lets the Tauri MCP server of Claude Code read the page, its logs and its IPC calls, from this Mac only.
    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_mcp_bridge::init_with_config(tauri_plugin_mcp_bridge::Config::localhost_only()));
    builder
        .invoke_handler(tauri::generate_handler![set_call_live, set_mic, set_audio, call_level, set_wake, set_keys, set_menu_keys, auth_sheet, check_update, install_update, opened, owner_check, bridge_port])
        .setup(|app| {
            start_bridge();
            if std::env::args().any(|a| a == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            if option_env!("YONDER_RELEASE").is_some() {
                offer_move(app.handle().clone());
            }
            app.set_menu(menu(app.handle())?)?;
            let _ = APP.set(app.handle().clone());
            unsafe { yonder_watch_swipes(swiped) };
            // No menu bar icon: calls are only on the phone.
            let app = app.handle().clone();
            thread::spawn(move || watch_keys(move |key, edge| tap_key(&app, key, edge)));
            Ok(())
        })
        // The window does the work of each menu item, so it gets the id of the item.
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().0.as_str());
        })
        // The close button hides the window, and Yonder keeps running. Only ⌘Q quits.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(context)
        .expect("Yonder could not start")
        .run(|app, event| match event {
            RunEvent::Exit => {
                stop_bridge();
                stop_wake();
                reopen();
            }
            // A yonder:// link, such as a new task link (bridge/link.ts), goes to the page as `window.yonderOpened(urls, app)`,
            // with the name of the app that sent it, and waits in OPENED for a page that is not there yet (`opened`). The
            // window shows, because the sheet of the link is in it.
            RunEvent::Opened { urls } => {
                let from = sender_app();
                let urls: Vec<String> = urls.iter().map(|u| u.to_string()).collect();
                OPENED.lock().unwrap_or_else(|e| e.into_inner()).extend(urls.iter().map(|u| (u.clone(), from.clone())));
                if let (Some(window), Ok(json), Ok(sender)) = (app.get_webview_window("main"), serde_json::to_string(&urls), serde_json::to_string(&from)) {
                    let _ = window.eval(format!("window.yonderOpened?.({json}, {sender} ?? undefined)"));
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            // A click on the Dock icon shows the hidden window again.
            RunEvent::Reopen { has_visible_windows: false, .. } => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        });
}

/// The items of the menu whose shortcut the settings can change (Keys, set_menu_keys).
static MENU_KEYS: Mutex<Vec<MenuItem<tauri::Wry>>> = Mutex::new(Vec::new());

/// The shortcuts of the menu items from the settings (Keys), by the ID of the item, such as { "new-chat": "Cmd+J" }, or
/// "off" for no shortcut.
#[tauri::command]
fn set_menu_keys(keys: std::collections::HashMap<String, String>) {
    for item in MENU_KEYS.lock().map(|items| items.clone()).unwrap_or_default() {
        if let Some(key) = keys.get(item.id().as_ref()) {
            if let Err(e) = item.set_accelerator((key != "off").then_some(key)) {
                log(&format!("the shortcut {key:?} of {} is not a shortcut: {e}", item.id().as_ref()));
            }
        }
    }
}

/// The default menu of macOS, with New Project, Open Folder and Pair Phone in the File menu, and an Agents menu with New Chat (⌘T).
fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::default(app)?;
    let new_project = MenuItem::with_id(app, "new-project", "New Workspace…", true, Some("CmdOrCtrl+N"))?;
    let open_folder = MenuItem::with_id(app, "open-folder", "Open Folder…", true, Some("CmdOrCtrl+O"))?;
    let new_chat = MenuItem::with_id(app, "new-chat", "New Chat", true, Some("CmdOrCtrl+T"))?;
    if let Ok(mut items) = MENU_KEYS.lock() {
        *items = vec![new_project.clone(), open_folder.clone(), new_chat.clone()];
    }
    for item in menu.items()? {
        // ⌘W closes the open agent in the window (see closeKey in src/App.tsx), so no item closes the window.
        if let MenuItemKind::Submenu(sub) = &item {
            for close in sub.items()? {
                if let MenuItemKind::Predefined(p) = &close {
                    if p.text()?.replace('&', "") == "Close Window" {
                        sub.remove(p)?;
                    }
                }
            }
        }
        if let MenuItemKind::Submenu(file) = item {
            if file.text()? == "File" {
                file.prepend_items(&[
                    &new_project,
                    &open_folder,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "pair-phone", "Pair Phone…", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                ])?;
            }
        }
    }
    // After the View menu, before Window and Help.
    let agents = Submenu::with_items(
        app,
        "Agents",
        true,
        &[
            &new_chat,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "close-completed", "Close Completed", true, None::<&str>)?,
        ],
    )?;
    menu.insert(&agents, menu.items()?.len().saturating_sub(2))?;
    Ok(menu)
}

/// The `caffeinate` process that keeps the Mac awake during a live call.
static CAFFEINATE: Mutex<Option<Child>> = Mutex::new(None);

/// Keeps the Mac awake while a call is live.
/// `caffeinate -i` stops idle sleep, so the call stays on when the screen locks.
/// The display still sleeps. `-w` stops caffeinate when the app quits.
/// `since` is the time in ms when the call went live (connectedAt in src/voice.ts), for the time of the small notch of
/// the call. It is None while the call connects.
#[tauri::command]
fn set_call_live(live: bool, since: Option<f64>) -> tauri::Result<()> {
    if let Ok(mut wake) = WAKE.lock() {
        wake.live = live;
        wake.since = since.filter(|_| live);
        sync_wake(&mut wake);
    }
    hush(live);
    if let Ok(mut awake) = CAFFEINATE.lock() {
        if live && awake.is_none() {
            *awake = Command::new("/usr/bin/caffeinate").args(["-i", "-w", &std::process::id().to_string()]).spawn().ok();
        } else if !live {
            if let Some(mut child) = awake.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    Ok(())
}

/// The dictation of the window opens (true) or closes (false) the microphone (src/dictate.ts).
#[tauri::command]
fn set_mic(on: bool) {
    hush(on);
}

/// The settings of Voice: the switch "Pause music" and the name of the microphone ("" for the input of macOS). The
/// helper of the notch and of "Hey Yonder" gets the name (`--mic`), as the window and the call get the microphone.
#[tauri::command]
fn set_audio(pause: bool, mic: String) {
    if let Ok(mut on) = PAUSE.lock() {
        *on = pause;
    }
    if let Ok(mut wake) = WAKE.lock() {
        wake.mic = mic;
        sync_wake(&mut wake);
    }
}

/// The switch "Pause music" of the settings. On by default.
static PAUSE: Mutex<bool> = Mutex::new(true);
/// True while a call, a dictation or the notch has the microphone.
static MIC: Mutex<bool> = Mutex::new(false);
/// True while the helper has the microphone, for a voice note or the notch.
static HELPER_MIC: AtomicBool = AtomicBool::new(false);
/// The app of "Now Playing" that hush paused, so that the end plays only that app again. Else a bare play starts Spotify
/// after each call.
static PAUSED: Mutex<Option<String>> = Mutex::new(None);

/// Pauses the media of other apps, such as Spotify or a video in Chrome, while Yonder has the microphone, and plays it
/// again after. AirPods with an open microphone play all sound in the low quality of a phone call. `media-control` of Homebrew reads and controls the "Now Playing" app of macOS. Without it,
/// nothing pauses. Yonder's own page (com.apple.WebKit) is never paused, because a pause suspends the call.
fn hush(on: bool) {
    let Ok(mut mic) = MIC.lock() else { return };
    if *mic == on {
        return;
    }
    *mic = on;
    drop(mic);
    thread::spawn(move || {
        // AirPods need about a second to go back to the high quality after the microphone closes.
        // shortcut: a fixed wait; watch the sample rate of the output if music starts muffled.
        if !on {
            thread::sleep(Duration::from_millis(1500));
        }
        let Ok(mut paused) = PAUSED.lock() else { return };
        // The microphone changed again during the wait.
        if MIC.lock().map_or(true, |mic| *mic != on) {
            return;
        }
        let Some(bin) = ["/opt/homebrew/bin/media-control", "/usr/local/bin/media-control"].into_iter().find(|p| Path::new(p).exists()) else { return };
        let now = Command::new(bin).arg("get").output().ok().and_then(|o| serde_json::from_slice::<serde_json::Value>(&o.stdout).ok());
        let app = now.as_ref().and_then(|n| n["bundleIdentifier"].as_str()).unwrap_or_default().to_string();
        let playing = now.as_ref().is_some_and(|n| n["playing"] == true);
        if on && playing && !app.starts_with("com.apple.WebKit") && PAUSE.lock().is_ok_and(|p| *p) {
            if Command::new(bin).arg("pause").status().is_ok_and(|s| s.success()) {
                log(&format!("paused {app} for the microphone"));
                *paused = Some(app);
            }
        } else if !on && paused.take().is_some_and(|p| p == app) && !playing {
            let _ = Command::new(bin).arg("play").status();
            log(&format!("played {app} again"));
        }
    });
}

/// The loudness of the live call, from 0 to 1, about ten times a second from the window, for the orb of the small
/// notch of the call, so the orb moves with the voices.
#[tauri::command]
fn call_level(level: f64) {
    if let Ok(mut wake) = WAKE.lock() {
        if !wake.live {
            return;
        }
        if let Some(stdin) = wake.stdin.as_mut() {
            let _ = stdin.write_all(format!("level {level:.3}\n").as_bytes());
        }
    }
}

/// Shows a sign-in page in the sign-in window of macOS (auth/main.swift), and returns true when the sign-in is done,
/// or false when the user closes the window. The Google sign-in of the page uses it (src/account.ts).
#[tauri::command]
async fn auth_sheet(url: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || Command::new(sidecar("yonder-auth")).arg(url).status().is_ok_and(|s| s.success()))
        .await
        .unwrap_or(false)
}

/// The name of the app that sent the Apple event of this moment, such as "Safari" for a link on a web page, when macOS
/// gives it: the pid of the sender (keySenderPIDAttr of NSAppleEventManager.currentAppleEvent) and the path of its process.
fn sender_app() -> Option<String> {
    use std::ffi::c_void;
    type Id = *mut c_void;
    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const std::ffi::c_char) -> Id;
        fn sel_registerName(name: *const std::ffi::c_char) -> Id;
        fn objc_msgSend();
    }
    #[link(name = "Foundation", kind = "framework")]
    extern "C" {}
    extern "C" {
        fn proc_pidpath(pid: i32, buf: *mut u8, size: u32) -> i32;
    }
    let pid = unsafe {
        let msg = objc_msgSend as unsafe extern "C" fn();
        let send: extern "C" fn(Id, Id) -> Id = std::mem::transmute(msg);
        let send_key: extern "C" fn(Id, Id, u32) -> Id = std::mem::transmute(msg);
        let send_int: extern "C" fn(Id, Id) -> i32 = std::mem::transmute(msg);
        let manager = send(objc_getClass(c"NSAppleEventManager".as_ptr()), sel_registerName(c"sharedAppleEventManager".as_ptr()));
        let event = if manager.is_null() { manager } else { send(manager, sel_registerName(c"currentAppleEvent".as_ptr())) };
        let sender = if event.is_null() { event } else { send_key(event, sel_registerName(c"attributeDescriptorForKeyword:".as_ptr()), u32::from_be_bytes(*b"spid")) };
        if sender.is_null() { 0 } else { send_int(sender, sel_registerName(c"int32Value".as_ptr())) }
    };
    let mut buf = [0u8; 4096];
    let n = if pid > 0 { unsafe { proc_pidpath(pid, buf.as_mut_ptr(), buf.len() as u32) } } else { 0 };
    if n <= 0 {
        return None;
    }
    // "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" is "Google Chrome".
    let path = String::from_utf8_lossy(&buf[..n as usize]).into_owned();
    path.split('/').find_map(|p| p.strip_suffix(".app")).or(path.rsplit('/').next()).map(String::from)
}

/// The yonder:// links that opened the app and that the page did not take yet, each with the app that sent it.
static OPENED: Mutex<Vec<(String, Option<String>)>> = Mutex::new(Vec::new());

/// The links of OPENED, for a page that starts after them (src/abilities.ts). They leave OPENED.
#[tauri::command]
fn opened() -> Vec<(String, Option<String>)> {
    std::mem::take(&mut *OPENED.lock().unwrap_or_else(|e| e.into_inner()))
}

extern "C" {
    /// owner.m, which build.rs compiles into the app.
    fn yonder_owner_check(reason: *const std::ffi::c_char) -> bool;
    fn yonder_watch_swipes(step: extern "C" fn(i32));
}

/// The app, for the swipes of owner.m (`swiped`).
static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// A navigation swipe (owner.m) goes to the page as the "swipe" event, -1 for back and 1 for forward (src/App.tsx).
extern "C" fn swiped(step: i32) {
    if let Some(app) = APP.get() {
        let _ = app.emit("swipe", step);
    }
}

/// Touch ID, with the password of the Mac as the fallback, before the Start of a new task link (src/NewTask.tsx).
/// True for a yes. The app asks itself (owner.m), so the dialog of macOS names Yonder and shows its icon.
#[tauri::command]
async fn owner_check(reason: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || std::ffi::CString::new(reason).is_ok_and(|reason| unsafe { yonder_owner_check(reason.as_ptr()) }))
        .await
        .unwrap_or(false)
}

/// The helper of "Hey Yonder" and of the notch: the switch in the settings, the keys, the live call, and the process.
struct Wake {
    on: bool,
    live: bool,
    /// The key of the notch, the key of the call and the key of the voice note (Settings, Keys), or None for no key.
    notch: Option<Key>,
    call: Option<Key>,
    note: Option<Key>,
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    /// The helper listens for "Hey Yonder" (`--wake`). A change of it starts the helper again.
    listening: bool,
    /// The time when the call went live, in ms.
    since: Option<f64>,
    /// The last line about the call that the helper got: "call <ms>" or "end".
    told: String,
    /// The key of the notch during a call ends the call, and the helper that starts after the call opens the notch.
    open_at: Option<Instant>,
    /// The microphone of the settings by name, and the one that the running helper got. A change starts the helper again.
    mic: String,
    using: String,
}

static WAKE: Mutex<Wake> = Mutex::new(Wake {
    on: false,
    live: false,
    // No key until the window gives the keys of the settings (set_keys), so that macOS asks for no permission of a key
    // that the user turned off.
    notch: None,
    call: None,
    note: None,
    child: None,
    stdin: None,
    listening: false,
    since: None,
    told: String::new(),
    open_at: None,
    mic: String::new(),
    using: String::new(),
});

/// A key of the settings: the key code, and the flags that go with it. For a modifier key alone (KEYS) the flags are the
/// bit of its side, and for a shortcut (KEY_NAMES) the modifiers that are held (MODS).
#[derive(Clone, Copy, PartialEq, Debug)]
struct Key {
    code: i64,
    mods: u64,
}

/// What a key did (watch_keys). A modifier key alone gives Down at its press, then Tap at a release within HOLD, Hold
/// at a later release, or Cut when another key, modifier or click comes while it is down. A shortcut gives Tap at its
/// press. Only the key of the voice note uses Down, Hold and Cut: press, talk, let go (tap_key).
#[derive(Clone, Copy, PartialEq, Debug)]
enum Edge {
    Down,
    Tap,
    Hold,
    Cut,
}

/// A release of a modifier key after this long is the end of a hold, not a tap.
const HOLD: Duration = Duration::from_millis(500);

/// The press of the key of the voice note went to the window (talk-key), not to the helper, so its release goes there too.
static NOTE_TO_WINDOW: AtomicBool = AtomicBool::new(false);

/// The keys that a tap alone can bind (Settings, Keys): the name, the key code (kVK_RightCommand and the others in
/// Events.h of Carbon), and the bit of the key in the flags (NX_DEVICERCMDKEYMASK and the others in IOLLEvent.h).
/// Without the bit, the left key held down hides the release of the right one.
const KEYS: [(&str, i64, u64); 8] = [
    ("right-command", 0x36, 0x10),
    ("right-option", 0x3D, 0x40),
    ("right-shift", 0x3C, 0x04),
    ("right-control", 0x3E, 0x2000),
    ("left-command", 0x37, 0x08),
    ("left-option", 0x3A, 0x20),
    ("left-shift", 0x38, 0x02),
    ("left-control", 0x3B, 0x01),
];
/// The bits of the left and the right Control, Shift, Command and Option keys in the flags. A key of KEYS that goes
/// down while another of them is held makes a shortcut, not a tap.
const SIDES: u64 = 0x01 | 0x02 | 0x04 | 0x08 | 0x10 | 0x20 | 0x40 | 0x2000;
/// The keys of a shortcut by name, such as "ctrl+option+k" or "f13", and their key codes (kVK_ANSI_A and the others in
/// Events.h, as on a US keyboard). The names are those of keyName in src/Settings.tsx. Escape stays the key that closes
/// the notch.
const KEY_NAMES: &[(&str, i64)] = &[
    ("a", 0x00), ("s", 0x01), ("d", 0x02), ("f", 0x03), ("h", 0x04), ("g", 0x05), ("z", 0x06), ("x", 0x07), ("c", 0x08),
    ("v", 0x09), ("b", 0x0B), ("q", 0x0C), ("w", 0x0D), ("e", 0x0E), ("r", 0x0F), ("y", 0x10), ("t", 0x11), ("1", 0x12),
    ("2", 0x13), ("3", 0x14), ("4", 0x15), ("6", 0x16), ("5", 0x17), ("=", 0x18), ("9", 0x19), ("7", 0x1A), ("-", 0x1B),
    ("8", 0x1C), ("0", 0x1D), ("]", 0x1E), ("o", 0x1F), ("u", 0x20), ("[", 0x21), ("i", 0x22), ("p", 0x23),
    ("return", 0x24), ("l", 0x25), ("j", 0x26), ("'", 0x27), ("k", 0x28), (";", 0x29), ("\\", 0x2A), (",", 0x2B),
    ("/", 0x2C), ("n", 0x2D), ("m", 0x2E), (".", 0x2F), ("tab", 0x30), ("space", 0x31), ("`", 0x32), ("delete", 0x33),
    ("f17", 0x40), ("f18", 0x4F), ("f19", 0x50), ("f20", 0x5A), ("f5", 0x60), ("f6", 0x61), ("f7", 0x62), ("f3", 0x63),
    ("f8", 0x64), ("f9", 0x65), ("f11", 0x67), ("f13", 0x69), ("f16", 0x6A), ("f14", 0x6B), ("f10", 0x6D), ("f12", 0x6F),
    ("f15", 0x71), ("home", 0x73), ("pageup", 0x74), ("forwarddelete", 0x75), ("f4", 0x76), ("end", 0x77), ("f2", 0x78),
    ("pagedown", 0x79), ("f1", 0x7A), ("left", 0x7B), ("right", 0x7C), ("down", 0x7D), ("up", 0x7E),
];
/// The modifiers of a shortcut by name, and their bits in the flags (kCGEventFlagMaskControl and the others). The bits
/// say no side, so either Command key makes "cmd".
const MODS: [(&str, u64); 8] = [
    ("ctrl", 0x40000),
    ("control", 0x40000),
    ("option", 0x80000),
    ("opt", 0x80000),
    ("alt", 0x80000),
    ("shift", 0x20000),
    ("cmd", 0x100000),
    ("command", 0x100000),
];
/// The bits of MODS together. Caps Lock, Fn and the bit of the number pad do not change a shortcut.
const HELD: u64 = 0x1E0000;
/// kVK_Escape. It closes the open notch and drops its words, as the X does. During a call it ends the call.
const ESCAPE: i64 = 0x35;

/// The switch "Hey Yonder" in the settings turns the listener on or off.
#[tauri::command]
fn set_wake(on: bool) {
    if let Ok(mut wake) = WAKE.lock() {
        wake.on = on;
        sync_wake(&mut wake);
    }
}

/// A key of the settings by name: a modifier key alone, such as "right-command" (KEYS), or a shortcut, such as "f13" or
/// "ctrl+option+k" (MODS and KEY_NAMES). A key that types, such as "k" or "space", needs a modifier, and only F1 to F20
/// can go alone. None for "off" and for a name that it does not know.
fn parse_key(name: &str) -> Option<Key> {
    let name = name.trim().to_lowercase();
    if let Some(&(_, code, mods)) = KEYS.iter().find(|k| k.0 == name) {
        return Some(Key { code, mods });
    }
    let mut parts: Vec<&str> = name.split('+').collect();
    let last = parts.pop()?;
    let code = KEY_NAMES.iter().find(|k| k.0 == last)?.1;
    let mut mods = 0;
    for part in parts {
        mods |= MODS.iter().find(|m| m.0 == part)?.1;
    }
    let function = last.len() > 1 && last.starts_with('f') && last[1..].bytes().all(|b| b.is_ascii_digit());
    (mods != 0 || function).then_some(Key { code, mods })
}

/// The keys of the settings (Keys): the key that opens the notch, the key that starts or ends the call and the key of
/// the voice note (wake/Note.swift), by name (parse_key), or "off". Each can be any key or shortcut.
#[tauri::command]
fn set_keys(notch: String, call: String, note: Option<String>) {
    let key = |name: String| {
        let key = parse_key(&name);
        if key.is_none() && name != "off" && !name.is_empty() {
            log(&format!("the key {name:?} is not a key that Yonder knows, so it is off"));
        }
        key
    };
    if let Ok(mut wake) = WAKE.lock() {
        wake.notch = key(notch);
        wake.call = key(call);
        wake.note = key(note.unwrap_or_default());
        sync_wake(&mut wake);
    }
}

/// A tap of a key of KEYS, a shortcut of the settings, or Escape. The key of the notch opens the notch, and a second tap
/// sends its words. During a call it ends the call first, as the + button of the window does, and the helper that starts
/// after the call opens the notch. The key of the voice note acts at its press, and a release after a hold ends what
/// that press started (note_key).
fn tap_key(app: &AppHandle, key: Key, edge: Edge) {
    // Each press of a modifier key and each shortcut while it is down come here, so they never wait for the lock:
    // sync_wake can hold it while the helper starts again, and macOS turns off a slow tap.
    let wake = if edge == Edge::Tap { WAKE.lock().ok() } else { WAKE.try_lock().ok() };
    let Some(mut wake) = wake else { return };
    let is = |bound: Option<Key>| bound == Some(key);
    if is(wake.note) {
        if wake.live {
            return;
        }
        drop(wake);
        return note_key(app, key, edge);
    }
    if edge != Edge::Tap {
        return;
    }
    // Escape never starts a helper: with no helper, no notch is open.
    if key.code == ESCAPE && !wake.live {
        if let Some(stdin) = wake.stdin.as_mut() {
            let _ = stdin.write_all(b"escape\n");
        }
        return;
    }
    if is(wake.notch) && !wake.live {
        tell_helper(&mut wake, b"open\n");
        return;
    }
    if is(wake.notch) {
        wake.open_at = Some(Instant::now());
    } else if !is(wake.call) && key.code != ESCAPE {
        return;
    }
    drop(wake);
    let _ = app.emit("toggle-call", ());
}

/// The key of the voice note. During a call the microphone belongs to the call, so it does nothing (tap_key). With the
/// window in front, the key is the talk bar of the open agent (talk-key in src/App.tsx), as ⌘D, and a second press sends.
/// A voice note or a notch that listens still gets the key.
/// The press acts at once, not at the release of a tap, and a release after a hold sends what the press started
/// (talk-key-up, "note-up"): press, talk, let go. Another key while it is down drops what it started (talk-key-cut,
/// "note-cut"), because then it was a shortcut such as ⌥E. A tap still starts, and the next press sends.
fn note_key(app: &AppHandle, key: Key, edge: Edge) {
    // A shortcut has no Down: its Tap is the press.
    let press = edge == Edge::Down || (edge == Edge::Tap && !KEYS.iter().any(|k| k.1 == key.code));
    if press {
        let mic = HELPER_MIC.load(Ordering::SeqCst);
        // The window answers on the main thread, where a command such as set_keys can wait for this lock.
        let front = app.get_webview_window("main").is_some_and(|w| w.is_focused().unwrap_or(false));
        // The log tells which way the press went, so a press that does nothing can be explained.
        log(&format!("the key of the voice note: window in front {front}, microphone of the helper on {mic}"));
        let window = !mic && front;
        NOTE_TO_WINDOW.store(window, Ordering::SeqCst);
        if window {
            let _ = app.emit("talk-key", ());
        } else if let Ok(mut wake) = WAKE.lock() {
            tell_helper(&mut wake, b"note\n");
        }
        return;
    }
    let (event, line): (&str, &[u8]) = match edge {
        Edge::Hold => ("talk-key-up", b"note-up\n"),
        Edge::Cut => ("talk-key-cut", b"note-cut\n"),
        _ => return,
    };
    if NOTE_TO_WINDOW.load(Ordering::SeqCst) {
        let _ = app.emit(event, ());
    } else if let Ok(mut wake) = WAKE.lock() {
        // A release never starts a helper.
        if let Some(stdin) = wake.stdin.as_mut() {
            let _ = stdin.write_all(line);
        }
    }
}

/// Gives a line to the helper: "open" for the key of the notch, "note" for the key of the voice note. A helper that
/// stopped by itself starts again for it.
fn tell_helper(wake: &mut Wake, line: &[u8]) {
    if wake.stdin.as_mut().is_some_and(|stdin| stdin.write_all(line).is_ok()) {
        return;
    }
    if let Some(mut child) = wake.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    wake.stdin = None;
    sync_wake(wake);
    if let Some(stdin) = wake.stdin.as_mut() {
        let _ = stdin.write_all(line);
    }
}

/// Runs the helper (wake/) during a call of the window, and while "Hey Yonder" is on or a key opens the notch or
/// starts a voice note. During a call the microphone belongs to the call, so the helper only shows the small notch of the call. With
/// the switch on and no call, it listens for "Hey Yonder" (`--wake`), and macOS shows the orange microphone dot all the
/// time. Else it opens the microphone only while the notch is open. A change between the two starts the helper again.
/// The kill waits for the end of the helper, so the microphone is closed when set_wake or set_call_live returns, before
/// the dictation of the window or the call opens it (src/dictate.ts, startCall in src/App.tsx). The notch starts the new
/// agent itself, and the helper prints "wake" for each "Hey Yonder", for the log.
fn sync_wake(wake: &mut Wake) {
    let want = wake.live || wake.on || wake.notch.is_some() || wake.note.is_some();
    let listen = wake.on && !wake.live;
    if wake.child.is_some() && (!want || wake.listening != listen || wake.using != wake.mic) {
        if let Some(mut child) = wake.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        wake.stdin = None;
        log("stopped the helper of Hey Yonder and the notch");
    }
    if want && wake.child.is_none() {
        let errors = std::env::var_os("HOME")
            .and_then(|home| OpenOptions::new().create(true).append(true).open(Path::new(&home).join(".config/yonder/app.log")).ok())
            .map_or(Stdio::null(), Stdio::from);
        let mut args: Vec<&str> = if listen { vec!["--wake"] } else { vec![] };
        if !wake.mic.is_empty() {
            args.extend(["--mic", &wake.mic]);
        }
        match Command::new(sidecar("yonder-wake")).args(&args).env("YONDER_BRIDGE", format!("http://127.0.0.1:{}", bridge_port_now())).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(errors).spawn() {
            Ok(mut child) => {
                let out = child.stdout.take().expect("the stdout of yonder-wake");
                thread::spawn(move || {
                    for line in BufReader::new(out).lines().map_while(Result::ok) {
                        match line.as_str() {
                            "wake" => log("heard Hey Yonder"),
                            "mic on" | "mic off" => {
                                let on = line == "mic on";
                                HELPER_MIC.store(on, Ordering::SeqCst);
                                hush(on);
                            }
                            _ => {}
                        }
                    }
                    // A helper that stopped prints no "mic off".
                    HELPER_MIC.store(false, Ordering::SeqCst);
                });
                wake.stdin = child.stdin.take();
                wake.child = Some(child);
                wake.listening = listen;
                wake.using = wake.mic.clone();
                wake.told = "end\n".into();
            }
            Err(e) => log(&format!("yonder-wake did not start: {e}")),
        }
    }
    // The small notch of the call, with the time when it went live (0 while it connects), and the notch of a key that
    // waited for the end of a call.
    let Some(stdin) = wake.stdin.as_mut() else { return };
    let line = if wake.live { format!("call {}\n", wake.since.unwrap_or(0.0)) } else { "end\n".into() };
    if wake.told != line {
        let _ = stdin.write_all(line.as_bytes());
        wake.told = line;
    }
    if !wake.live && wake.open_at.take().is_some_and(|t| t.elapsed() < Duration::from_secs(5)) {
        let _ = stdin.write_all(b"open\n");
    }
}

fn stop_wake() {
    if let Ok(mut wake) = WAKE.lock() {
        if let Some(mut child) = wake.child.take() {
            let _ = child.kill();
        }
    }
}

/// A helper binary in the bundle, next to the app in Contents/MacOS: `externalBin` in tauri.conf.json and release.ts.
fn sidecar(name: &str) -> PathBuf {
    std::env::current_exe().unwrap_or_default().with_file_name(name)
}

/// Writes a line to ~/.config/yonder/app.log, because an app from the Dock has no console.
fn log(line: &str) {
    let Some(home) = std::env::var_os("HOME") else { return };
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(Path::new(&home).join(".config/yonder/app.log")) {
        let seconds = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
        let _ = writeln!(file, "{seconds} {line}");
    }
}

/// `port` of ~/.config/yonder/config.json, which the bridge writes (bridge/peer.ts): 7787, unless another user of this
/// Mac had that port when the bridge started.
fn bridge_port_now() -> u16 {
    std::env::var_os("HOME")
        .and_then(|home| std::fs::read(Path::new(&home).join(".config/yonder/config.json")).ok())
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
        .and_then(|config| config["port"].as_u64())
        .and_then(|p| u16::try_from(p).ok())
        .filter(|p| *p > 1023)
        .unwrap_or(7787)
}

/// True when the bridge of this user answers on the port. A bridge of another user answers 403: it checks the user of
/// each caller. A bridge that is too busy to answer counts, as before. No token goes out, because the port can be
/// the port of another user.
fn bridge_up(port: u16, wait: Duration) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), wait) else { return false };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let request = format!("GET /version HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return true;
    }
    let mut head = [0u8; 12];
    match stream.read(&mut head) {
        Ok(n) => !String::from_utf8_lossy(&head[..n]).contains(" 403"),
        Err(_) => true,
    }
}

/// The port of the bridge of this user, for the page of the app (src/bridge.ts). At the start of the app the bridge
/// can still pick its port, so it waits up to 10 seconds for a bridge of this user on the port of config.json.
/// The capability names only port 7787, so that no other page of 127.0.0.1, such as a site in a frame, can call the
/// commands. A bridge on another port gets the same permissions here, for that port only.
#[tauri::command]
async fn bridge_port(app: AppHandle) -> u16 {
    let port = tauri::async_runtime::spawn_blocking(|| {
        for _ in 0..40 {
            let port = bridge_port_now();
            if bridge_up(port, Duration::from_millis(200)) {
                return port;
            }
            thread::sleep(Duration::from_millis(250));
        }
        bridge_port_now()
    })
    .await
    .unwrap_or(7787);
    if port != 7787 {
        if let Err(e) = app.add_capability(bridge_capability(port)) {
            log(&format!("no permissions for the bridge on port {port}: {e}"));
        }
    }
    port
}

/// The permissions of capabilities/default.json, for the page of the bridge on `port`. The debug plugin is not in a
/// release build, so its permission stays out.
fn bridge_capability(port: u16) -> tauri::ipc::CapabilityBuilder {
    let caps: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap_or_default();
    let permissions = caps["permissions"].as_array().cloned().unwrap_or_default();
    permissions
        .iter()
        .filter_map(|p| p.as_str())
        .filter(|p| !p.starts_with("mcp-bridge:"))
        .fold(tauri::ipc::CapabilityBuilder::new(format!("bridge-{port}")).remote(bridge_origin(port)).window("main"), |c, p| c.permission(p))
}

/// The remote URLs of the page of the bridge on `port`.
fn bridge_origin(port: u16) -> String {
    format!("http://127.0.0.1:{port}/*")
}

/// Starts the bridge in the login shell of the user, so that the bridge and the
/// workers get the same PATH as a terminal. If a bridge already runs, the new one
/// finds the port in use and stops. The app stops the bridge when it quits
/// (`stop_bridge`). The workers keep running, because Claude Code runs them.
fn start_bridge() {
    launch_bridge();
    // If no bridge answers for 15 seconds, start it again. A bridge that a kill or a crash stopped then comes back.
    // The 15 seconds are longer than the start of the login shell and the gap of `restart_bridge`.
    thread::spawn(|| {
        let mut missed = 0;
        loop {
            thread::sleep(Duration::from_secs(5));
            let up = bridge_up(bridge_port_now(), Duration::from_secs(1));
            missed = if up { 0 } else { missed + 1 };
            if missed == 3 {
                log("started the bridge again");
                launch_bridge();
                missed = 0;
            }
        }
    });
}

/// A copy for other Macs (release.ts builds it with YONDER_RELEASE) runs the compiled bridge in its bundle, so it
/// needs no Bun and no repository. The app of `install-app` runs bridge/main.ts from this repository with bun, so a
/// change to the bridge needs only `restart_bridge`.
/// YONDER_ROOT gives the bridge the dist/ of Contents/Resources, so it gives the paired phones the screen of this
/// version over the air, as the bridge of Linux and Windows does.
fn launch_bridge() {
    let bridge = match option_env!("YONDER_RELEASE") {
        // `env`, because zsh runs `exec VAR=x cmd` as a command named "VAR=x".
        Some(_) => format!(
            "env YONDER_ROOT='{}' '{}'",
            sidecar("yonder-bridge").with_file_name("../Resources").display(),
            sidecar("yonder-bridge").display()
        ),
        None => format!("bun '{}'", concat!(env!("CARGO_MANIFEST_DIR"), "/../bridge/main.ts")),
    };
    let command = format!("mkdir -p ~/.config/yonder && exec {bridge} >> ~/.config/yonder/bridge.log 2>&1");
    if let Ok(mut child) = Command::new("/bin/zsh")
        .args(["-lic", &command])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
    {
        thread::spawn(move || child.wait());
    }
}

/// Stops the bridge when the app quits, so that no Yonder process stays in the
/// background. It stops the bridge by its port, because `restart_bridge` starts a
/// new bridge that is not a child of the app.
fn stop_bridge() {
    // Only a process of this user: another user of this Mac can run a bridge of their own.
    let port = bridge_port_now();
    let _ = Command::new("/bin/sh")
        .args(["-c", &format!("lsof -a -u \"$(id -u)\" -tiTCP:{port} -sTCP:LISTEN | xargs kill 2>/dev/null")])
        .status();
    // The bridge closes the relay before it exits. Wait for it, 3 seconds at most, so that an app that starts at once,
    // as after an update, starts its own bridge and does not find the port taken.
    for _ in 0..30 {
        if TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(100)).is_err() {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    log("stopped the bridge");
}

/// A copy for other Macs asks the update server at the start and then every 10 minutes (App.tsx), and the Check button
/// of Settings asks at once. A newer version downloads at once in the background (`start_install`), and the app
/// restarts into it when the user does not look at it, so a Mac does not wait for a click. Check asks the update
/// server, not the bridge: a copy for other Macs has no version of the source. The app of `install-app` gets its
/// updates from this repository (`rebuild_app`), so it has no updater plugin and gets null.
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<String>, String> {
    if option_env!("YONDER_RELEASE").is_none() {
        return Ok(None);
    }
    let update = updater(&app)?.check().await.map_err(|e| e.to_string())?;
    let version = update.as_ref().map(|u| u.version.clone());
    if let Some(update) = update {
        start_install(app, update);
    }
    Ok(version)
}

/// The updater of a copy for other Macs: the update server (channel.json, "Update server" in docs/wiki/install.md) with the install
/// ID of this Mac, then the static latest.json of the copies from before it, when the server gives no feed (404).
/// An older version installs only when the server marks it as a rollback.
fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    use tauri_plugin_updater::UpdaterExt;
    let channel: serde_json::Value = serde_json::from_str(include_str!("../../channel.json")).map_err(|e| e.to_string())?;
    let feed = format!(
        "{}/{}/mac?id={}&v={{{{current_version}}}}",
        channel["server"].as_str().unwrap_or_default(),
        channel["channel"].as_str().unwrap_or_default(),
        install_id()
    );
    let endpoints = [feed.as_str(), "https://download.yonder.so/latest.json"].iter().filter_map(|u| u.parse().ok()).collect();
    app.updater_builder()
        .endpoints(endpoints)
        .map_err(|e| e.to_string())?
        .version_comparator(|current, release| {
            release.version > current || (release.notes.as_deref() == Some("rollback") && release.version < current)
        })
        .build()
        .map_err(|e| e.to_string())
}

/// A random ID of this computer, which the update server hashes into a bucket for a slow rollout. The bridge of a Linux
/// or Windows copy keeps the same file.
fn install_id() -> String {
    use std::io::Read;
    let Some(home) = std::env::var_os("HOME") else { return String::new() };
    let path = Path::new(&home).join(".config/yonder/install-id");
    if let Ok(id) = std::fs::read_to_string(&path) {
        if !id.trim().is_empty() {
            return id.trim().to_string();
        }
    }
    let mut bytes = [0u8; 16];
    if std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut bytes)).is_err() {
        return String::new();
    }
    let id: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let _ = std::fs::create_dir_all(path.parent().unwrap_or(Path::new("/")));
    let _ = std::fs::write(&path, &id);
    id
}

// An update downloads now, or waits for the restart (`install`). Two checks or clicks do not download it two times.
static INSTALLING: AtomicBool = AtomicBool::new(false);
// A click on "Update available": the restart does not wait until the user looks away.
static NOW: AtomicBool = AtomicBool::new(false);
// The restart after an update (`reopen`): Some((behind the app in front, with the window hidden)).
static REOPEN: Mutex<Option<(bool, bool)>> = Mutex::new(None);

/// A click on "Update available" restarts into the new version at once: the whole app, with the bridge and the front
/// end. The update has the signature of the key in `plugins.updater` of tauri.conf.json, and release.ts makes it.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    NOW.store(true, Ordering::SeqCst);
    if INSTALLING.load(Ordering::SeqCst) {
        return Ok(());
    }
    let Some(update) = updater(&app)?.check().await.map_err(|e| e.to_string())? else { return Ok(()) };
    start_install(app, update);
    Ok(())
}

fn start_install(app: AppHandle, update: tauri_plugin_updater::Update) {
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::spawn(move || {
        if let Err(e) = tauri::async_runtime::block_on(install(&app, update)) {
            // The next check, 10 minutes later, tries again.
            log(&format!("the update failed: {e}"));
            NOW.store(false, Ordering::SeqCst);
            INSTALLING.store(false, Ordering::SeqCst);
        }
    });
}

/// The download comes first, and the bundle on disk changes only just before the restart, so the bridge never serves
/// the new screen to the old app. The app restarts when no call is live and the window is not in front: hidden, or
/// behind another app. After a click, it restarts also in front. The window shows "Updating to 2.B.N…" for 3 seconds
/// first, and a call that starts in that time waits until it ends.
async fn install(app: &AppHandle, update: tauri_plugin_updater::Update) -> Result<(), Box<dyn std::error::Error>> {
    log(&format!("downloading version {}", update.version));
    let bytes = update.download(|_, _| {}, || {}).await?;
    let live = || WAKE.lock().map_or(false, |w| w.live);
    let window = || app.get_webview_window("main");
    let away = || window().map_or(true, |w| !w.is_visible().unwrap_or(true) || !w.is_focused().unwrap_or(false));
    loop {
        if !live() && (NOW.load(Ordering::SeqCst) || away()) {
            let _ = app.emit("updating", &update.version);
            thread::sleep(Duration::from_secs(3));
            if !live() {
                break;
            }
        }
        thread::sleep(Duration::from_secs(1));
    }
    log(&format!("installing version {}", update.version));
    update.install(bytes)?;
    // The restart stops the bridge (RunEvent::Exit), and the new app starts the bridge of the new bundle.
    log(&format!("restarting into version {}", update.version));
    let quiet = !NOW.load(Ordering::SeqCst);
    *REOPEN.lock().unwrap() = Some((quiet, quiet && !window().map_or(false, |w| w.is_visible().unwrap_or(true))));
    app.exit(0);
    Ok(())
}

/// After an update with the window not in front, the new app opens behind the app in front (`open -g`, and
/// `--quiet` for `activate_ignoring_other_apps`), and keeps a hidden window hidden (`--hidden`). After a click it opens
/// in front, with no flags. `app.restart()` opens it in front each time, so a release in the middle of work takes the
/// focus. It also passes the flags of this process again, so a click after a quiet start would hide the window.
/// A shell opens the new app only after this process ends (at most 10 seconds, then it kills it). Else the Dock shows
/// a second Yonder next to the old one.
fn reopen() {
    let Some((quiet, hidden)) = *REOPEN.lock().unwrap() else { return };
    // The executable is Yonder.app/Contents/MacOS/yonder.
    let Some(bundle) = std::env::current_exe().ok().and_then(|p| p.ancestors().nth(3).map(Path::to_path_buf)) else { return };
    let wait = r#"i=0; while kill -0 "$0" 2>/dev/null && [ $i -lt 50 ]; do sleep 0.2; i=$((i+1)); done; kill -9 "$0" 2>/dev/null; exec /usr/bin/open "$@""#;
    let mut open = Command::new("/bin/sh");
    open.arg("-c").arg(wait).arg(std::process::id().to_string());
    if quiet {
        open.arg("-g");
    }
    open.arg(bundle).arg("--args");
    if quiet {
        open.arg("--quiet");
    }
    if hidden {
        open.arg("--hidden");
    }
    let _ = open.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
}

/// A copy for other Macs that runs outside Applications asks to move there. macOS runs an app from Downloads in a
/// random read-only folder (App Translocation), and an app in the DMG cannot update itself. On "Move", the app copies
/// its bundle to /Applications, opens that copy and quits. The DMG of Finder cannot hide the bars of its window, so this
/// question is the fallback for a skipped drag.
fn offer_move(app: AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    // The executable is Yonder.app/Contents/MacOS/yonder.
    let Some(bundle) = std::env::current_exe().ok().and_then(|exe| exe.ancestors().nth(3).map(Path::to_path_buf)) else {
        return;
    };
    let home_apps = std::env::var_os("HOME").map(|home| Path::new(&home).join("Applications"));
    if bundle.starts_with("/Applications") || home_apps.is_some_and(|apps| bundle.starts_with(apps)) {
        return;
    }
    app.dialog()
        .message("Yonder runs from the Applications folder, where it can update itself.")
        .title("Move Yonder to Applications?")
        .buttons(MessageDialogButtons::OkCancelCustom("Move to Applications".into(), "Not Now".into()))
        .show(move |yes| {
            if !yes {
                return;
            }
            match move_to_applications(&bundle) {
                Ok(()) => app.exit(0),
                Err(e) => {
                    log(&format!("the move to Applications failed: {e}"));
                    app.dialog()
                        .message(format!("{e}\n\nDrag Yonder into the Applications folder yourself."))
                        .title("Yonder could not move itself")
                        .show(|_| {});
                }
            }
        });
}

/// Copies the bundle to /Applications/Yonder.app in place of an older copy, and opens it when this app has quit.
/// While this app runs, `open` would only bring this app to the front.
fn move_to_applications(bundle: &Path) -> Result<(), String> {
    let target = Path::new("/Applications/Yonder.app");
    let copy = Path::new("/Applications/.Yonder-move.app");
    let running = Command::new("pgrep").args(["-f", "/Applications/Yonder.app/Contents/MacOS/"]).output();
    if running.is_ok_and(|out| out.status.success()) {
        return Err("Another Yonder runs from Applications. Quit it, then open this Yonder again.".into());
    }
    let _ = std::fs::remove_dir_all(copy);
    let ditto = Command::new("ditto").arg(bundle).arg(copy).output().map_err(|e| e.to_string())?;
    if !ditto.status.success() {
        return Err(format!("The copy failed: {}", String::from_utf8_lossy(&ditto.stderr).trim()));
    }
    // The copy keeps the quarantine mark of the download, and macOS would then ask about it again. This copy already
    // passed Gatekeeper, and the user chose Move.
    let _ = Command::new("xattr").args(["-dr", "com.apple.quarantine"]).arg(copy).status();
    if target.exists() {
        std::fs::remove_dir_all(target).map_err(|e| format!("The old Yonder in Applications stays: {e}"))?;
    }
    std::fs::rename(copy, target).map_err(|e| e.to_string())?;
    let pid = std::process::id();
    Command::new("sh")
        .args(["-c", &format!("while kill -0 {pid} 2>/dev/null; do sleep 0.2; done; open /Applications/Yonder.app")])
        .process_group(0)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Calls `on_tap` with the key when a key of KEYS goes down (Down), and when it goes up alone: within HOLD (Tap) or later
/// (Hold). Another key, modifier or click while it is down makes it a shortcut, not a tap (Cut). It also calls `on_tap`
/// for Escape and for each shortcut of the settings (Tap). The tap only listens, so the front app gets the shortcut too.
fn watch_keys(on_tap: impl Fn(Key, Edge)) {
    let down = Cell::new(None::<(i64, u64, Instant)>);
    let cut = |was: Option<(i64, u64, Instant)>| {
        if let Some((code, bit, _)) = was {
            on_tap(Key { code, mods: bit }, Edge::Cut);
        }
    };
    let mut asked = false;
    loop {
        // With every key off, macOS asks for no Input Monitoring.
        if !WAKE.lock().is_ok_and(|wake| wake.notch.is_some() || wake.call.is_some() || wake.note.is_some()) {
            thread::sleep(Duration::from_secs(1));
            continue;
        }
        // Without Input Monitoring, macOS makes the tap but never turns it on.
        if !unsafe { CGPreflightListenEventAccess() } {
            if !asked {
                log("Input Monitoring is off for Yonder, so the keys do nothing. Turn it on, then reopen Yonder.");
                unsafe { CGRequestListenEventAccess() };
                asked = true;
            }
            thread::sleep(Duration::from_secs(5));
            continue;
        }
        // SAFETY: the tap runs only on the run loop of this thread, and the loop
        // below never ends, so the borrowed state lives as long as the tap.
        let tap = unsafe {
            CGEventTap::new_unchecked(
                CGEventTapLocation::Session,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::ListenOnly,
                vec![CGEventType::FlagsChanged, CGEventType::KeyDown, CGEventType::LeftMouseDown, CGEventType::RightMouseDown],
                |_, kind, event| {
                    let code = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                    match KEYS.iter().find(|k| k.1 == code) {
                        Some(&(name, code, bit)) if matches!(kind, CGEventType::FlagsChanged) => {
                            let held = event.get_flags().bits() & SIDES;
                            if held == bit {
                                cut(down.replace(Some((code, bit, Instant::now()))));
                                on_tap(Key { code, mods: bit }, Edge::Down);
                            } else if held == 0 && down.get().is_some_and(|(c, _, _)| c == code) {
                                let (_, _, t) = down.take().unwrap();
                                let edge = if t.elapsed() < HOLD { Edge::Tap } else { Edge::Hold };
                                log(&format!("{name} {}", if edge == Edge::Tap { "tap" } else { "hold" }));
                                on_tap(Key { code, mods: bit }, edge);
                            } else {
                                cut(down.take());
                            }
                        }
                        // A held key repeats, and a repeat of Escape would start the call again after it ends. Only a
                        // key of the settings goes to the log, so the log never holds what the user types.
                        _ if matches!(kind, CGEventType::KeyDown) && event.get_integer_value_field(EventField::KEYBOARD_EVENT_AUTOREPEAT) == 0 => {
                            cut(down.take());
                            let key = Key { code, mods: event.get_flags().bits() & HELD };
                            // try_lock: this runs for each key, and sync_wake can hold the lock while the helper starts
                            // again. macOS turns off a slow tap, so a key in that moment does nothing.
                            let bound = WAKE.try_lock().is_ok_and(|wake| [wake.notch, wake.call, wake.note].contains(&Some(key)));
                            if bound {
                                log("shortcut");
                            }
                            if bound || code == ESCAPE {
                                on_tap(key, Edge::Tap);
                            }
                        }
                        _ => cut(down.take()),
                    }
                    CallbackResult::Keep
                },
            )
        };
        let Ok(tap) = tap else {
            log("macOS refused the event tap for the keys. Trying again in 5 seconds.");
            thread::sleep(Duration::from_secs(5));
            continue;
        };
        let source = tap.mach_port().create_runloop_source(0).expect("a run loop source for the event tap");
        CFRunLoop::get_current().add_source(&source, unsafe { kCFRunLoopCommonModes });
        tap.enable();
        log("listening for the keys");
        loop {
            CFRunLoop::run_in_mode(unsafe { kCFRunLoopDefaultMode }, Duration::from_secs(1), false);
            // macOS turns a tap off after a slow callback, or while a password field
            // has focus, and never turns it on again. So turn it on each second.
            tap.enable();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The capability names only the page of the bridge on 7787. A bridge on another port (bridge/peer.ts) gets its own,
    /// for its port only, so a site of another port of 127.0.0.1 in a frame cannot call the commands.
    #[test]
    fn the_capability_takes_only_the_port_of_the_bridge() {
        let caps: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let fixed: tauri::utils::acl::RemoteUrlPattern = caps["remote"]["urls"][0].as_str().unwrap().parse().unwrap();
        let moved: tauri::utils::acl::RemoteUrlPattern = bridge_origin(7789).parse().unwrap();
        for (pattern, ok, bad) in [(&fixed, "http://127.0.0.1:7787/#storage=x", "http://127.0.0.1:7789/"), (&moved, "http://127.0.0.1:7789/assets/a.js?x=1", "http://127.0.0.1:7787/")] {
            assert!(pattern.test(&ok.parse().unwrap()), "{ok}");
            assert!(!pattern.test(&bad.parse().unwrap()), "{bad}");
            for other in ["http://127.0.0.1:5173/", "http://localhost:7787/", "https://127.0.0.1:7787/", "http://example.com:7787/"] {
                assert!(!pattern.test(&other.parse().unwrap()), "{other}");
            }
        }
        let _ = bridge_capability(7789);
    }

    /// Each name that the recorder of the settings writes (keyName in src/Settings.tsx) is a key here.
    #[test]
    fn parse_key_reads_the_names_of_the_settings() {
        assert_eq!(parse_key("right-command"), Some(Key { code: 0x36, mods: 0x10 }));
        assert_eq!(parse_key("left-control"), Some(Key { code: 0x3B, mods: 0x01 }));
        assert_eq!(parse_key("ctrl+option+k"), Some(Key { code: 0x28, mods: 0xC0000 }));
        assert_eq!(parse_key(" Cmd+Shift+Space "), Some(Key { code: 0x31, mods: 0x120000 }));
        assert_eq!(parse_key("cmd+a"), Some(Key { code: 0x00, mods: 0x100000 }));
        assert_eq!(parse_key("f13"), Some(Key { code: 0x69, mods: 0 }));
        let words = "return tab space delete forwarddelete home end pageup pagedown left right up down - = [ ] \\ ; ' , . / `";
        let letters = ('a'..='z').chain('0'..='9').map(String::from);
        for name in words.split(' ').map(String::from).chain(letters).chain((1..=20).map(|n| format!("f{n}"))) {
            assert!(parse_key(&format!("ctrl+option+shift+cmd+{name}")).is_some(), "{name}");
        }
        for bad in ["off", "", "k", "space", "left", "f", "f13x", "hyper+k", "ctrl+", "escape", "ctrl+escape"] {
            assert_eq!(parse_key(bad), None, "{bad}");
        }
    }
}
