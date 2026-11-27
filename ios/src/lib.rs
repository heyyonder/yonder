/// Starts Sentry only in a release build with SENTRY_DSN at build time, so a build from source and a debug build send
/// nothing. No event holds the host name of the device.
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

// Yonder on the iPhone: only the window of the React app, the QR scanner for the pairing, the haptics, the push notifications,
// the browser for Yonder Preview, the subscriptions of the App Store, the Face ID lock, the Live Activity in the Dynamic Island,
// and the dictation.
// The bridge, the menus, the menu bar icon and the right ⌘ key are only in the Mac app (src-tauri).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    // Panics go to Sentry with the version of the build. Swift crashes do not.
    let _sentry = start_sentry(context.package_info().version.to_string());
    #[cfg(target_os = "ios")]
    unsafe {
        yonder_haptics_in_calls();
        // The Talk buttons of Control Center, the Action button, the Lock Screen and Siri (StartCall.swift).
        yonder_intents();
        // The quick action "Default screen" of the icon (Abilities.swift).
        yonder_shell_start();
    }
    let app = tauri::Builder::default().invoke_handler(tauri::generate_handler![island, native_chrome, attach_sheet, quick_look, play_video, paint_window, echo_input, car_link, watch_link, guard_key, guard_sign, read_picked, recent_photos, photo, dictation, auth_sheet, apple_sign_in, phone_lock, ability, abilities, native_cover, launch_action, opened]);
    #[cfg(mobile)]
    let app = app
        .plugin(tauri_plugin_barcode_scanner::init())
        .plugin(tauri_plugin_haptics::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notifications::init())
        .plugin(tauri_plugin_biometric::init());
    // A yonder:// link that opens the app, such as the answer of a Shortcut (the ability "open"), goes to the page as
    // `window.yonderOpened(urls)`, and waits in OPENED for a page that is not there yet (`opened`).
    app.build(context).expect("Yonder could not start").run(|handle, event| {
        #[cfg(target_os = "ios")]
        if let tauri::RunEvent::Opened { urls } = event {
            use tauri::Manager;
            let urls: Vec<String> = urls.iter().map(|u| u.to_string()).collect();
            OPENED.lock().unwrap_or_else(|e| e.into_inner()).extend(urls.clone());
            if let (Some(window), Ok(json)) = (handle.get_webview_window("main"), serde_json::to_string(&urls)) {
                let _ = window.eval(format!("window.yonderOpened?.({json})"));
            }
        }
        #[cfg(not(target_os = "ios"))]
        let _ = (handle, event);
    });
}

#[cfg(target_os = "ios")]
static OPENED: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

// The yonder:// links that opened the app and that the page did not take yet.
#[tauri::command]
fn opened() -> Vec<String> {
    #[cfg(target_os = "ios")]
    return std::mem::take(&mut *OPENED.lock().unwrap_or_else(|e| e.into_inner()));
    #[allow(unreachable_code)]
    Vec::new()
}

// Runs one ability of the phone for the bridge (Abilities.swift, src/abilities.ts, docs/shell.md), and returns false
// for an ability that this app does not have. The answer comes later as `window.yonderAbility(id, answer)`. A sync
// command runs on the main thread, as UIKit needs.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
fn ability(id: String, name: String, args: String) -> bool {
    #[cfg(target_os = "ios")]
    {
        let text = |s: String| std::ffi::CString::new(s).unwrap_or_default();
        let (id, name, args) = (text(id), text(name), text(args));
        return unsafe { yonder_ability(id.as_ptr(), name.as_ptr(), args.as_ptr()) };
    }
    #[allow(unreachable_code)]
    false
}

// The native abilities of this app. The page names them in its poll, so the bridge asks only for these. An app from
// before them has no such command.
#[tauri::command]
fn abilities() -> Vec<String> {
    #[cfg(target_os = "ios")]
    {
        let mut out = [0 as std::ffi::c_char; 1024];
        unsafe { yonder_abilities(out.as_mut_ptr(), out.len()) };
        let json = unsafe { std::ffi::CStr::from_ptr(out.as_ptr()) }.to_string_lossy().into_owned();
        return serde_json::from_str(&json).unwrap_or_default();
    }
    #[allow(unreachable_code)]
    Vec::new()
}

// The picture of the screen over the web view while the page loads a new screen (src/front.ts), or off. False when it
// cannot show.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
fn native_cover(on: bool) -> bool {
    #[cfg(target_os = "ios")]
    return unsafe { yonder_native_cover(on) };
    #[allow(unreachable_code)]
    false
}

// The quick action of the icon that started or woke the app, once: "default-screen", or "".
#[tauri::command]
fn launch_action() -> String {
    #[cfg(target_os = "ios")]
    {
        let mut out = [0 as std::ffi::c_char; 64];
        unsafe { yonder_launch_action(out.as_mut_ptr(), out.len()) };
        return unsafe { std::ffi::CStr::from_ptr(out.as_ptr()) }.to_string_lossy().into_owned();
    }
    #[allow(unreachable_code)]
    String::new()
}

// The Swift side is ios/gen/apple/Sources/yonder-ios/Island.swift, in the Xcode project of the app.
#[cfg(target_os = "ios")]
extern "C" {
    fn yonder_haptics_in_calls();
    fn yonder_intents();
    fn yonder_native_chrome(state: *const std::ffi::c_char) -> i32;
    fn yonder_attach_sheet() -> bool;
    fn yonder_quick_look(path: *const std::ffi::c_char) -> bool;
    fn yonder_play_video(source: *const std::ffi::c_char) -> bool;
    fn yonder_paint_window(dark: bool);
    fn yonder_echo_input(on: bool) -> i32;
    fn yonder_island(running: i32, waiting: i32, done: i32, muted: bool, project: *const std::ffi::c_char, icon: *const std::ffi::c_char);
    fn yonder_car_link(
        relay: *const std::ffi::c_char,
        room: *const std::ffi::c_char,
        mac: *const std::ffi::c_char,
        device: *const std::ffi::c_char,
        account: *const std::ffi::c_char,
        out: *mut std::ffi::c_char,
        size: usize,
    );
    fn yonder_watch_link(out: *mut std::ffi::c_char, size: usize);
    fn yonder_guard_key(out: *mut std::ffi::c_char, size: usize);
    fn yonder_guard_sign(challenge: *const std::ffi::c_char, out: *mut std::ffi::c_char, size: usize);
    fn yonder_shrink_video(input: *const std::ffi::c_char, output: *const std::ffi::c_char) -> bool;
    fn yonder_recent_photos(count: i32, out: *mut std::ffi::c_char, size: usize);
    fn yonder_photo(id: *const std::ffi::c_char, out: *mut std::ffi::c_char, size: usize);
    fn yonder_dictation(op: *const std::ffi::c_char, out: *mut std::ffi::c_char, size: usize);
    fn yonder_auth_sheet(url: *const std::ffi::c_char);
    fn yonder_apple_sign_in();
    fn yonder_phone_lock(watch: bool) -> f64;
    fn yonder_shell_start();
    fn yonder_ability(id: *const std::ffi::c_char, name: *const std::ffi::c_char, args: *const std::ffi::c_char) -> bool;
    fn yonder_abilities(out: *mut std::ffi::c_char, size: usize);
    fn yonder_native_cover(on: bool) -> bool;
    fn yonder_launch_action(out: *mut std::ffi::c_char, size: usize);
}

// Shows the counts of the agents, the mute state of the call and the project in the Dynamic Island, or ends the
// Live Activity when `running` is below 0. `icon` is the favicon of the project, a PNG in base64, or "".
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
fn island(running: i32, waiting: i32, done: i32, muted: bool, project: Option<String>, icon: Option<String>) {
    #[cfg(target_os = "ios")]
    {
        // An older front end sends no project and no icon.
        let text = |s: Option<String>| std::ffi::CString::new(s.unwrap_or_default()).unwrap_or_default();
        let (project, icon) = (text(project), text(icon));
        unsafe { yonder_island(running, waiting, done, muted, project.as_ptr(), icon.as_ptr()) }
    }
}

// Shows the native tab bar and round buttons in the Liquid Glass of iOS 26, from the state that the page sends as
// JSON (src/chrome.ts). It returns the version of the native chrome, or 0 before iOS 26 and off the iPhone: the page
// then keeps its own controls. A sync command runs on the main thread, as UIKit needs. The Swift side is
// NativeChrome.swift.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
fn native_chrome(state: String) -> i32 {
    #[cfg(target_os = "ios")]
    {
        let state = std::ffi::CString::new(state).unwrap_or_default();
        return unsafe { yonder_native_chrome(state.as_ptr()) };
    }
    #[allow(unreachable_code)]
    0
}

// Opens the attach sheet of the iPhone as a sheet of iOS (AttachSheet in NativeChrome.swift). It returns false before
// iOS 26 and off the iPhone: the page then shows its own sheet. The choice comes back to the page as the choice of the
// native menu "attach" (src/chrome.ts).
#[tauri::command]
fn attach_sheet() -> bool {
    #[cfg(target_os = "ios")]
    {
        return unsafe { yonder_attach_sheet() };
    }
    #[allow(unreachable_code)]
    false
}

// Opens a picture or a video of the chat in Quick Look, the viewer of iOS. The page sends the bytes of the file as the
// raw body and its name in the header `name`, and this writes them to tmp/look of the app. It returns false when Quick
// Look cannot show the file, so the page opens its own viewer. The command is async, so a large video is written off
// the main thread. The Swift side is QuickLook.swift.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
async fn quick_look(request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    #[cfg(target_os = "ios")]
    {
        let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("Quick Look needs the bytes of a file.".into()) };
        // Only a plain name, so that the file stays in the folder.
        let name: String = request.headers().get("name").and_then(|v| v.to_str().ok()).unwrap_or("file")
            .chars().filter(|c| c.is_alphanumeric() || ".-_ ".contains(*c)).collect();
        let name = name.trim_start_matches('.');
        let dir = std::env::temp_dir().join("look");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(if name.is_empty() { "file" } else { name });
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        let path = std::ffi::CString::new(path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
        return Ok(unsafe { yonder_quick_look(path.as_ptr()) });
    }
    #[allow(unreachable_code)]
    Ok(false)
}

// Plays a video of the chat in the player of iOS, which turns with the phone. The page sends the bytes of its blob with
// the header `name`, or only the header `url` for a video of the web, which the player streams. The folder keeps only
// the last video, because the player has no event when it closes. Returns false when iOS cannot play it, and the page
// then plays it in its own viewer, as an older app does. The Swift side is QuickLook.swift.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
async fn play_video(request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    #[cfg(target_os = "ios")]
    {
        let source = match (request.headers().get("url").and_then(|v| v.to_str().ok()), request.body()) {
            (Some(url), _) if url.starts_with("https://") || url.starts_with("http://") => url.to_string(),
            (_, tauri::ipc::InvokeBody::Raw(bytes)) => {
                // Only a plain name, so that the file stays in the folder.
                let name: String = request.headers().get("name").and_then(|v| v.to_str().ok()).unwrap_or("video.mp4")
                    .chars().filter(|c| c.is_alphanumeric() || ".-_ ".contains(*c)).collect();
                let name = name.trim_start_matches('.');
                let dir = std::env::temp_dir().join("video");
                let _ = std::fs::remove_dir_all(&dir);
                std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                let path = dir.join(if name.is_empty() { "video.mp4" } else { name });
                std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
                path.to_string_lossy().into_owned()
            }
            _ => return Err("The player needs the bytes or the URL of a video.".into()),
        };
        let source = std::ffi::CString::new(source).map_err(|e| e.to_string())?;
        return Ok(unsafe { yonder_play_video(source.as_ptr()) });
    }
    #[allow(unreachable_code)]
    Ok(false)
}

// Gives the window behind the web view the color of the app. The keyboard makes the web view shorter, and the
// window shows under the bar of the keyboard. The Swift side is Island.swift.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
fn paint_window(dark: bool) {
    #[cfg(target_os = "ios")]
    unsafe { yonder_paint_window(dark) }
}

// Turns the echo cancellation of iOS on or off, and returns its state: -1 for no such option, 0 off, 1 on, and 2 off
// with no built-in speaker. `openMic` in src/voice.ts calls it. The Swift side is Island.swift.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
fn echo_input(on: bool) -> i32 {
    #[cfg(target_os = "ios")]
    return unsafe { yonder_echo_input(on) };
    #[allow(unreachable_code)]
    -1
}

// Gives the pairing of the phone to the call of the CarPlay screen, and returns the public key of the car, which the
// web app then gives to the Mac (`linkCar` in src/bridge.ts). The Swift side is CarPlay.swift. See docs/carplay.md.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
fn car_link(relay: String, room: String, mac: String, device: String, account: Option<String>) -> String {
    #[cfg(target_os = "ios")]
    {
        let text = |s: String| std::ffi::CString::new(s).unwrap_or_default();
        let (relay, room, mac, device, account) = (text(relay), text(room), text(mac), text(device), text(account.unwrap_or_default()));
        let mut out = [0 as std::ffi::c_char; 128];
        unsafe { yonder_car_link(relay.as_ptr(), room.as_ptr(), mac.as_ptr(), device.as_ptr(), account.as_ptr(), out.as_mut_ptr(), out.len()) };
        return unsafe { std::ffi::CStr::from_ptr(out.as_ptr()) }.to_string_lossy().into_owned();
    }
    #[allow(unreachable_code)]
    String::new()
}

// The public key of Face ID for the relay (GUARD in bridge/relay.ts), made the first time, or "" when the phone cannot
// make one. An app from before it has no such command, so the settings hide the row. The Swift side is Guard.swift.
#[tauri::command]
async fn guard_key() -> String {
    #[cfg(target_os = "ios")]
    {
        let mut out = [0 as std::ffi::c_char; 128];
        unsafe { yonder_guard_key(out.as_mut_ptr(), out.len()) };
        return unsafe { std::ffi::CStr::from_ptr(out.as_ptr()) }.to_string_lossy().into_owned();
    }
    #[allow(unreachable_code)]
    String::new()
}

// Signs a challenge of the Mac after Face ID or the passcode, or gives "" when the user cancels. The command is async,
// so it waits for the prompt off the main thread.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
async fn guard_sign(challenge: String) -> String {
    #[cfg(target_os = "ios")]
    {
        let challenge = std::ffi::CString::new(challenge).unwrap_or_default();
        let mut out = [0 as std::ffi::c_char; 128];
        unsafe { yonder_guard_sign(challenge.as_ptr(), out.as_mut_ptr(), out.len()) };
        return unsafe { std::ffi::CStr::from_ptr(out.as_ptr()) }.to_string_lossy().into_owned();
    }
    #[allow(unreachable_code)]
    String::new()
}

// Gives the pairing of the car call to the Apple Watch app, and returns the public key of the watch, or "" before the
// watch app first ran. The web app gives the key to the Mac. The Swift side is WatchLink.swift. See docs/watch.md.
#[tauri::command]
fn watch_link() -> String {
    #[cfg(target_os = "ios")]
    {
        let mut out = [0 as std::ffi::c_char; 128];
        unsafe { yonder_watch_link(out.as_mut_ptr(), out.len()) };
        return unsafe { std::ffi::CStr::from_ptr(out.as_ptr()) }.to_string_lossy().into_owned();
    }
    #[allow(unreachable_code)]
    String::new()
}

// Gives the screen the bytes of a photo, a video or a file that the user picked, and deletes the file. The dialog
// plugin copies a photo into Library/Caches of the app and a file into tmp, and `recent_photos` and `photo` write
// into Library/Caches. So only a file in one of these two folders can be read.
// A video goes as an MP4 of 720p at most (ShrinkVideo.swift), or as it is if AVFoundation cannot write it. The command
// is async, so Tauri runs it off the main thread: a sync command blocked the screen while it read a large video.
// The export waits up to a minute, so it runs on a blocking thread, one video at a time. Else each picked video holds a
// thread of the async runtime, and the dictation, the photos and Quick Look wait for the exports.
#[cfg(target_os = "ios")]
static SHRINK: std::sync::Mutex<()> = std::sync::Mutex::new(());
#[tauri::command]
async fn read_picked(path: String) -> Result<tauri::ipc::Response, String> {
    let home = std::path::PathBuf::from(std::env::var("HOME").map_err(|e| e.to_string())?);
    let file = std::fs::canonicalize(path.trim_start_matches("file://")).map_err(|e| e.to_string())?;
    let inside = |dir: &str| std::fs::canonicalize(home.join(dir)).is_ok_and(|d| file.starts_with(d));
    if !inside("Library/Caches") && !inside("tmp") {
        return Err("Yonder reads only the files that the user picked.".into());
    }
    let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
        #[allow(unused_mut)]
        let mut read = file.clone();
        #[cfg(target_os = "ios")]
        if matches!(file.extension().and_then(|e| e.to_str()).map(str::to_lowercase).as_deref(), Some("mov" | "mp4" | "m4v")) {
            let small = file.with_extension("small.mp4");
            let c = |p: &std::path::Path| std::ffi::CString::new(p.to_string_lossy().as_bytes()).map_err(|e| e.to_string());
            let _one = SHRINK.lock().unwrap_or_else(|e| e.into_inner());
            if unsafe { yonder_shrink_video(c(&file)?.as_ptr(), c(&small)?.as_ptr()) } {
                read = small;
            }
        }
        let bytes = std::fs::read(&read).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&file);
        let _ = std::fs::remove_file(&read);
        Ok(bytes)
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

// The newest photos and videos of the library, for the attach sheet: the path of a JSON file, which the screen reads
// with `read_picked`. The commands are async, so they run off the main thread while the Swift side waits for the
// permission and the photos. The Swift side is Island.swift.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
async fn recent_photos(count: i32) -> Result<String, String> {
    #[cfg(target_os = "ios")]
    {
        let mut out = [0 as std::ffi::c_char; 1024];
        unsafe { yonder_recent_photos(count, out.as_mut_ptr(), out.len()) };
        let path = unsafe { std::ffi::CStr::from_ptr(out.as_ptr()) }.to_string_lossy().into_owned();
        return if path.is_empty() { Err("Yonder has no access to the photos.".into()) } else { Ok(path) };
    }
    #[allow(unreachable_code)]
    Err("Only the iPhone shows the recent photos.".into())
}

// One photo or video of `recent_photos`, by its id: the path of its file, which the screen reads with `read_picked`.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
async fn photo(id: String) -> Result<String, String> {
    #[cfg(target_os = "ios")]
    {
        let id = std::ffi::CString::new(id).map_err(|e| e.to_string())?;
        let mut out = [0 as std::ffi::c_char; 1024];
        unsafe { yonder_photo(id.as_ptr(), out.as_mut_ptr(), out.len()) };
        let path = unsafe { std::ffi::CStr::from_ptr(out.as_ptr()) }.to_string_lossy().into_owned();
        return if path.is_empty() { Err("Yonder cannot read this photo.".into()) } else { Ok(path) };
    }
    #[allow(unreachable_code)]
    Err("Only the iPhone shows the recent photos.".into())
}

// The dictation of the prompt box with the speech recognizer of the iPhone itself (src/dictate.ts). `op` is start, poll,
// stop or cancel, and the answer is an error or the JSON of the words. The command is async, so a start waits for the
// permissions off the main thread. The Swift side is Dictate.swift.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
async fn dictation(op: String) -> String {
    #[cfg(target_os = "ios")]
    {
        let op = std::ffi::CString::new(op).unwrap_or_default();
        let mut out = vec![0 as std::ffi::c_char; 1 << 16];
        unsafe { yonder_dictation(op.as_ptr(), out.as_mut_ptr(), out.len()) };
        return unsafe { std::ffi::CStr::from_ptr(out.as_ptr()) }.to_string_lossy().into_owned();
    }
    #[allow(unreachable_code)]
    "this phone has no dictation of its own.".into()
}

// Opens a sign-in page in the sign-in window of iOS (AuthSheet.swift), and returns false off the iPhone, where the page
// opens the browser. The result comes back to the page as `window.yonderAuthSheet` (src/account.ts).
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
fn auth_sheet(url: String) -> bool {
    #[cfg(target_os = "ios")]
    {
        let url = std::ffi::CString::new(url).unwrap_or_default();
        unsafe { yonder_auth_sheet(url.as_ptr()) };
        return true;
    }
    #[allow(unreachable_code)]
    false
}

// Starts Sign in with Apple (AppleSignIn.swift) and returns true. With `start` false, it only returns true, so the page
// knows that this app has it. An app from before it, the Mac and Android have no such command, so the page hides the
// button. The identity token comes back to the page as `window.yonderAppleSignIn` (src/account.ts).
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
fn apple_sign_in(start: bool) -> bool {
    #[cfg(target_os = "ios")]
    {
        if start {
            unsafe { yonder_apple_sign_in() };
        }
        return true;
    }
    #[allow(unreachable_code)]
    false
}

// The time of the last lock of the phone, in milliseconds since 1970, or 0, for the grace time of the Face ID lock
// (src/Lock.tsx). With `watch`, the app stays awake for a moment when it leaves the screen, to hear the lock. The Swift
// side is Island.swift.
#[tauri::command]
#[cfg_attr(not(target_os = "ios"), allow(unused_variables))]
fn phone_lock(watch: bool) -> f64 {
    #[cfg(target_os = "ios")]
    return unsafe { yonder_phone_lock(watch) };
    #[allow(unreachable_code)]
    0.0
}
