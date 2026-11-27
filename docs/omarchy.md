# Yonder on Omarchy

The research and the plan: how to build Yonder for Omarchy, so that
people can control the agents on an Omarchy computer from the phone.
Steps 1 and 2 are built: "Omarchy" in `docs/wiki.md` tells how they
work. Nobody has run them on a real Omarchy computer, and the release is
not on download.yonder.so yet (`bun run release-omarchy`). The sources
are at the end.

## Where the build differs from the plan

- The service starts with the graphical session
  (`WantedBy=graphical-session.target`), not with `default.target`. The
  bridge needs `WAYLAND_DISPLAY` for `wl-copy` and `xdg-open`.
- The bridge holds the sleep lock only during a call (the `/awake` pings
  of the phone and of the window). A lock at all times would also stop
  Suspend in the Omarchy menu.
- The window has its own Chromium profile and the flag
  `--autoplay-policy=no-user-gesture-required`. A call from the key
  starts with no click in the page, and Chromium keeps its sound off
  without the flag.
- The bar is a `command` module in `shell.json`, which `install.sh` adds
  through `omarchy-shell-config`. A plugin for the store is not built.
- Dictation was not free. Voxtype types only into a field that has the
  focus, the New agent view has no text field, and the phone sends its
  sound to the computer. So the bridge sends the sound to
  `voxtype transcribe`.
- The installer is `https://download.yonder.so/omarchy.sh`, next to the
  tarballs, not on yonder.so.

## The answer

Yes, and most of Yonder runs on Linux already. Yonder has three parts,
and only one of them is tied to the Mac:

- **The bridge** (`bridge/main.ts`) is Bun and TypeScript. In a test,
  `bun build --compile --target=bun-linux-x64` made one Linux binary of
  100 MB in 1 second. In an `archlinux` container (x86_64), the binary
  started with no Bun installed. It listed its 31 tools and answered
  `list_projects` and `list_workers`. Only `claude` was missing.
- **The phone app and the relay** do not know the system of the
  computer. The bridge connects out to `wss://relay.yonder.so`, and the
  phone pairs with a QR code. The voice audio goes from the phone
  directly to xAI, and the Yonder account pays for it.
- **The Mac app** (`src-tauri/`) is the Mac-only part: the right ⌘ key (a
  CGEvent tap), the menu bar icon, `caffeinate`, and the Swift helpers of
  dictation and "Hey Yonder".

Claude Code runs background sessions on Linux too (`claude --bg`,
`claude agents`, `claude attach`), with the same supervisor and the same
`~/.claude/daemon/roster.json`.

So Yonder for Omarchy is three steps, and each step is useful alone:

1. **The phone controls the Omarchy computer.** The bridge runs as a
   systemd user service, and one command in the terminal shows the QR
   code. The iPhone app and the Android app then work as they do with a
   Mac. This step is the "on the go" part, and it needs no desktop app.
   It is small: about ten changes in the bridge, a service file and an
   installer. About two days, with a test on a real Omarchy computer.
2. **The Yonder window on the Omarchy desktop.** The bridge already
   serves the screen at `http://127.0.0.1:7787/`. Omarchy opens it as a
   web app in Chromium. `Super + Y` starts and ends the call, and a
   module in the Omarchy bar shows the call and the agents.
3. **The other Mac features**, one at a time: "Hey Yonder", the Tunnel
   and the browser tool. Dictation uses Voxtype,
   the dictation of Omarchy.

Omarchy suits Yonder well. It treats coding agents as part of the
desktop, Claude Code is one command away on each install, and its users
are developers. It has no remote control of agents: "Omarchy Server" is
only a plan in its repository. No plugin and no app does what Yonder
does there yet (see "What exists already").

## What Omarchy is

Only the facts that matter for Yonder, from the source of Omarchy 4.0.4
(branch `quattro`), its manual and its news.

- **The system.** Arch Linux, Hyprland (Wayland, with a Lua config),
  and `omarchy-shell`: one Quickshell process that draws the
  bar, the panels, the menu, the notifications and the lock screen.
  Version 4.0.0 removed Waybar, Mako and hypridle. DHH made Omarchy, and
  the Omacom Foundation funds it since August 2026.
- **The users.** About 44,000 stars on GitHub, 200,000 downloads of the
  version 4 ISO in 18 days, and about 35,000 members on Discord.
- **Agents.** `claude`, `codex`, `grok` and ten more come as small mise
  stubs in `~/.local/bin`. `omarchy default agent claude` installs
  Claude Code with `mise use -g claude` (the native binary).
  `Super + Shift + Ctrl + A` opens the default agent in a terminal.
  Agents that Omarchy starts from the home folder start in `~/Work`.
  Omarchy has no hook for "an agent finished".
- **The agents panel.** The bar has an agents icon with the usage limits
  of Claude Code, Codex and Grok. `omarchy-agent-usage-claude` reads
  `claudeAiOauth.accessToken` from `~/.claude/.credentials.json` and
  calls `https://api.anthropic.com/api/oauth/usage`, the same endpoint
  that Yonder calls on the Mac.
- **Several Claude accounts.** `omarchy agent account use work` makes
  each new `claude` start with `CLAUDE_CONFIG_DIR` set to the home of
  that account, through `omarchy-agent-account-exec`. The Main account
  stays in `~/.claude`.
- **Web apps.** `omarchy-webapp-install <name> <url> <icon>` makes a
  launcher. `omarchy-launch-webapp` opens it with `chromium --app=<url>`
  in a frameless window. `http` addresses are allowed.
- **Keys.** The user adds bindings in `~/.config/hypr/bindings.lua`, for
  example `o.bind("SUPER + Y", "Yonder call", "<command>")`. Plain
  `Super + Y` is free in the defaults. `Super + Shift + Y` opens
  YouTube.
- **The bar.** `~/.config/omarchy/shell.json` holds its layout. A
  module of `"type": "command"` runs a script every few seconds, shows
  its text or Waybar-style JSON, and runs `onClick` on a click.
- **Plugins.** A plugin is a git repository with a `manifest.json`
  (`schemaVersion` 1, `id`, `name`, `version`, `kinds`, `entryPoints`).
  The kinds are `bar`, `bar-widget`, `menu`, `overlay`, `panel` and
  `service`, and the entry points are QML files that `omarchy-shell`
  loads, with no sandbox. `omarchy plugin add <git-url> --enable`
  installs one, after the user confirms.
- **The plugin store.** plugins.omarchy.org lists about 5,000 plugins,
  483 of them with the tag `ai`. A GitHub issue submits a plugin, and a
  maintainer reviews it after automatic checks. Three plugins are close
  to Yonder: claude-alerts (a bar badge when a Claude Code agent needs
  the user), Walkie (the bar widget of a paid voice app for dictation)
  and codex-threads (a sidebar of local and remote agent threads).
- **Dictation.** Voxtype (`Super + Ctrl + X`, or hold `F9`) types the
  words into the field that has the focus, also in a web app.
- **Terminal.** `xdg-terminal-exec` opens the default terminal: Foot, or
  Alacritty, Ghostty or Kitty if the user picks one.
- **Packages.** The base install has `chromium`, `jq`, `qrencode`,
  `wl-clipboard`, `ffmpeg`, `gpu-screen-recorder`, `mise` and
  `nautilus`. It does not have `lsof`, `cloudflared` or `bun`.
- **Network.** The firewall (ufw) blocks the connections from outside,
  except LocalSend. The bridge needs none: it listens on 127.0.0.1 and
  connects out to the relay.
- **Theme.** The colors of the current theme are in
  `~/.local/state/omarchy/current/theme/colors.toml`.
- **Hardware.** x86_64 PCs and Intel Macs. The Omarchy M team (since
  2026-09-11) has a beta for M1 and M2 Macs.

## What exists already

This section lists similar systems, also in the plugin store. The store
had 5,060 plugins at the time of the research, 483 of them with the
tag `ai`. No plugin and no app gives a voice call from the phone, also
away from home, that starts and checks many Claude Code agents on an
Omarchy computer. The closest projects started between April and
September 2026, and each has 20 stars or less on GitHub.

### Close to Yonder on Omarchy

| Project | What it does | Phone | Voice | Agents |
|---|---|---|---|---|
| Omarchy-AI (`omarchy-ai.settings`, MIT) | A voice assistant that plans whole jobs and does them with about 90 tools | A page that the computer serves, on the home network or Tailscale | Gemini Live or OpenAI Live, a wake word | Claude Code first, then Codex, in its own task runtime |
| Omodachi (`com.omodachi.host`) | An iPhone and iPad app: an extra screen or the whole desktop, the Omarchy menu, an SSH terminal, the notifications | A native app (in App Store review), on the home network or Tailscale | Dictation through Voxtype only | The default agent in Herdr; a full chat with Codex |
| Omavoice (`io.github.baranskyi.omavoice`) | A voice panel on the desktop (`Super + Ctrl + M`) | No | OpenAI Realtime, about 1.6 cents a minute | One question at a time to `codex exec` or `claude -p` |
| hey-jarvis (`atzingen.jarvis`) | A local voice assistant with a wake word and barge-in | No | Local | Codex or Claude, with consent for each command |

Others: three more assistants of the "Hey Jarvis" kind, Keystroke (a
command palette with voice and Codex, 56 stars), and ssh-mic-bridge
(the microphone over SSH, for Claude Code `/voice` on a server).

### Agent status in the bar

About 20 plugins show the state of the agents in the bar. Many of them
read Herdr, the agent manager that Omarchy ships: `jankeesvw.herdr` (54
stars), `meviusisback.agent-orchestr` and `stappmus.udder` (a
notification when an agent finishes). `idan.claude-alerts`,
`b.codex-notifications` and `apollo.agent-cockpit` read Claude Code or
Codex directly. So the bar module of step 2 is common. It helps users
find Yonder in the store, but it is not the product. Claude Code
sessions in Herdr run in terminals, so `claude agents` lists them, and
Yonder shows them as terminal sessions with no extra work.

### Tools for any system that also work on Omarchy

On Omarchy:

- **Claude Code Remote Control** is part of Claude Code, so each Omarchy
  user has it with Pro or Max. `claude remote-control` serves up to 32
  sessions in one folder and shows a QR code. The Claude app sends text
  to them. It has no voice. This is the free choice to beat.
- **Happy** and **Paseo** are open source, and their clients for the
  computer run on Linux. Paseo has a local voice mode and an encrypted
  relay, the same design as the relay of Yonder.
- **Omnara** has a phone app with a two-way voice.
- **Heard** is for macOS only. **Dispatch** needs the Claude Desktop app.

### What this means for Yonder

- The gap is the voice call from the phone, away from home, with no
  Tailscale, for many Claude Code agents. Omarchy-AI is the nearest. Its
  phone is a web page on the home network or Tailscale, and it runs its
  own task system, not Claude Code background sessions.
- Omodachi and Omarchy-AI need an open port in the firewall for the
  phone. The relay of Yonder needs no open port.
- The Omarchy users install voice and agent plugins already, and no
  project leads. A listing in the store is a cheap way to reach them.

## Step 1: the phone controls the Omarchy computer

### Build

- `src-tauri/release.ts` compiles the bridge for the Mac only. Add
  `bun build --compile --target=bun-linux-x64`, and put the binary on
  `download.yonder.so` next to the DMG. Add `bun-linux-arm64` when
  Omarchy runs on ARM.
- The compiled bridge has no `dist/`, so it serves no screen: `/` gives
  "Yonder bridge. MCP is at /mcp." Step 1 needs no screen. Step 2 needs
  `dist/` next to the binary, and a variable such as `YONDER_ROOT` for
  `ROOT` in `bridge/main.ts`.

### Run

A systemd user service keeps the bridge running. It does the work of the
Mac app (which starts the bridge) and of `bridge/watchdog.sh`. The file is
`omarchy/yonder.service`, and `omarchy/install.sh` turns it on. These
parts of the file are important:

- **`KillMode=process`.** The first `claude agents` call of the bridge
  starts the supervisor of Claude Code, so the supervisor is in the
  control group of the service. With the default
  `KillMode=control-group`, each stop or restart of the service also
  ends the supervisor and all the workers. On the Mac, the workers keep
  running when the bridge stops. Check it with
  `systemd-cgls --user-unit yonder.service` while a worker runs.
- **`restart_bridge` and `KillMode=process` together.**
  `restartBridge()` in `bridge/main.ts` starts a new bridge and then
  exits. With the default kill mode, systemd ends that new bridge, and
  `Restart=always` starts a clean one. With `KillMode=process`, the new
  bridge stays, and it races the bridge of systemd for the port. So under
  systemd, the bridge must only exit. systemd sets `INVOCATION_ID` in
  each service, so the bridge can tell.
- **The PATH.** The Mac app starts the bridge with `zsh -lic`, so that
  the workers get the PATH of a terminal. A user service does not read
  `.bashrc`. When mise has shims, they work with no shell, and the PATH of
  the service puts them before `~/.local/bin`, as Omarchy does. The stubs
  of Omarchy in `~/.local/bin` give `claude`. Check that a worker finds
  `node` and `bun`.
- **`OMARCHY_AGENT_CLAUDE_HOME=`.** `omarchy-agent-account-exec` reads
  this variable, and an empty value pins the Main account. Without it,
  an account switch points `claude` at another `CLAUDE_CONFIG_DIR`,
  which has its own supervisor. Then `claude agents` no longer lists the
  running workers, and `ROSTER` and `PROJECTS` in `bridge/main.ts` (both
  in `~/.claude`) point at the wrong account.

### The Mac-only parts of the bridge

| Where | On the Mac | On Omarchy |
|---|---|---|
| `fetchClaudeUsage` | `security find-generic-password` (Keychain) | `~/.claude/.credentials.json`, the same JSON |
| `qrCode` in `relay.ts` | CoreImage through `osascript` | `qrcode-generator` in the bridge |
| `ROOTS` | `~/Sites`, `~/Developer` | also `~/Work` |
| `open_link`, `preview` | `open <url>` | `xdg-open <url>` |
| `open_folder` | `open`, `open -R` (Finder) | `xdg-open`, and `ShowItems` of `org.freedesktop.FileManager1` (Nautilus) for a file |
| `copy_to_clipboard`, `preview` share | `pbcopy` | `wl-copy` |
| `open_in_terminal` | AppleScript of Ghostty | `uwsm-app -- xdg-terminal-exec --dir=<path> claude attach <id>` |
| `shellChanged` | `plutil` reads `/Applications/Yonder.app` | always false: there is no native shell to rebuild |
| `browser`, `dictate.ts` | AppleScript, Swift helpers | off in step 1 |

Grok must not offer Finder or Ghostty to an Omarchy user. About 180 places
in `src/` and `bridge/` name the Mac: the texts of the screen, the Grok
prompt and the tool descriptions. Let the bridge give its system
(`process.platform`) to the app, and use a neutral word or the name of
the system in these texts. A phone that is paired with a Mac and with an
Omarchy computer must show both correctly.

### Pairing

- The bridge connects to `wss://relay.yonder.so` by default, so the
  installer writes no relay setting.
- `POST /relay` makes the pairing link and its QR code. On Linux,
  `qrCode()` fails, and the whole request fails with error 500. With
  `qrencode`, it works.
- On the Mac, File > Pair Phone opens the pairing. On Omarchy, one
  command shows the QR code in the terminal, and the phone scans it from
  the screen:

  ```sh
  curl -s -X POST http://127.0.0.1:7787/relay | jq -r .link | qrencode -t ANSIUTF8
  ```

- The phone shows the name of the computer. The bridge uses `hostname()`
  when `scutil` is missing, so this works on Linux already.

### Keep the computer awake

- The phone can reach the computer only while it is awake. On the Mac,
  the watchdog runs `caffeinate -i`. On Omarchy, the bridge holds
  `systemd-inhibit --what=sleep` during a call. Omarchy holds such a lock
  during an update. Do not inhibit `idle`, or the screen does not lock.
- **Caution:** logind ignores this lock for the lid of a laptop
  (`LidSwitchIgnoreInhibited=yes` is the default). A closed lid still
  puts the laptop to sleep, as on a Mac on battery. A docked laptop with
  a closed lid stays awake.

## Step 2: the window on the Omarchy desktop

- **The window.** `omarchy-webapp-install Yonder http://127.0.0.1:7787/
  <icon>` makes the launcher. Use `127.0.0.1`, not `localhost`: the
  bridge accepts only the origins in `ORIGINS`, and that list has
  `http://127.0.0.1:7787` but not `http://localhost:7787`. Chromium asks
  one time for the microphone. The call (`src/voice.ts`) needs only
  `getUserMedia`, an AudioWorklet and a WebSocket, and Chromium has all
  three. Updates over the air keep working, because the page comes from
  the bridge.
- **What the page cannot do outside Tauri.** `inTauri` is false, so the
  page sends no `set_call_live` and gets no `toggle-call` or `wake`. It
  has no native menu (Pair Phone, New Project, Open Folder) and no
  folder dialog. The rest works.
- **The call key: the one new mechanism.** `Super + Y` runs a command,
  for example `curl -s -X POST http://127.0.0.1:7787/call`. But the page
  cannot hear it: on the Mac, Rust sends `toggle-call` to the window.
  Add a small event stream from the bridge to the page, such as
  Server-Sent Events on `GET /events`, and let the page listen to it
  when `inTauri` is false. When no window is open, the command opens the
  web app first. A tap of a lone right Super or right Alt, as right ⌘ on
  the Mac, is possible in Hyprland, but many laptops have no right
  Super, and right Alt is AltGr on many layouts.
- **The bar.** For the first test, a `command` module in `shell.json`:
  a small `GET /status` of the bridge gives Waybar-style JSON with the
  Yonder icon (red during a call) and the counts of the running, waiting
  and done agents. `onClick` starts or ends the call. To ship, make it a
  `bar-widget` plugin in its own git repository. `omarchy plugin add`
  puts it in the bar, and the store lists it. Later, its panel can list
  the agents and show the QR code for pairing. The plugin runs in the
  process of the bar, so its QML runs `curl` with a `Process` and holds
  no network code and no audio, as Omavoice does.
- **Keep awake during a call.** On the Mac, `set_call_live` starts
  `caffeinate`. The page can send the call state to the bridge, and the
  bridge holds the sleep lock of step 1.
- **Notifications.** The bridge can run
  `omarchy-notification-send --app-name Yonder` when an agent finishes
  or waits for an answer. `--exec` makes a click open the web app. Do
  not use the app name `omarchy-action`: it passes Do Not Disturb.
- **Dictation.** Voxtype types into the prompt box of the window. Yonder
  needs no dictation of its own on Omarchy.
- **Theme.** The bridge can read `colors.toml` of the current theme and
  give its accent color to the window.

### Why not a Tauri build for Linux

Tauri 2 builds for Linux with WebKitGTK, but it is more work for a worse
window:

- The tray icon gets no click events on Linux. It shows only a menu, in
  a drawer of the Omarchy bar until the user pins it.
- WebKitGTK refuses `getUserMedia` until the app turns on the media
  stream setting and answers the permission request in Rust. It also
  needs the GStreamer plugins.
- The global shortcut plugin of Tauri works on X11 only, and Omarchy
  runs Wayland. The CGEvent tap and the Swift helpers do not build on
  Linux.

## Step 3: the other Mac features

| Feature | On the Mac | On Omarchy |
|---|---|---|
| "Hey Yonder" | `yonder-wake`, the speech model of Apple | a wake word engine, such as openWakeWord |
| The browser tool | AppleScript reads the front tab of Chrome | the CDP of browser-harness, or `hyprctl activewindow` |
| Tunnel | `lsof`, `cloudflared` | the same commands from the Arch packages |

## How to ship it

1. **An installer first:** `curl -fsSL https://download.yonder.so/omarchy.sh | bash`.
   Omarchy itself installs this way. The installer:
   1. Puts the bridge and `dist/` in `~/.local/share/yonder`.
   2. Writes the service file and starts the service.
   3. Adds the web app, one line in `bindings.lua`, and the bar widget
      with `omarchy plugin add`.
   4. Shows the QR code for the phone.
2. **Later, a package in the AUR** (`yonder-bin`), so that
   `omarchy update` also updates Yonder. A package cannot change the
   files of the user, so a `yonder setup` command then does steps 2 to
   4. The compiled bridge has no source, so it gets no update over the
   air, as on the other Macs.
3. **The store.** Submit the bar widget to plugins.omarchy.org with a
   GitHub issue. It needs a README with the install and removal steps,
   and a license.

Calls work as on the Mac: through the Yonder account on yonder.so, or
with an own `XAI_API_KEY` in `.env`.

## Open points

- Nobody has run the bridge on a real Omarchy computer. The test needs
  an x86_64 PC, the Omarchy M beta on an M1 or M2 Mac, or a VM.
- Claude Code docs say that background sessions stop at a shutdown and
  survive a sleep. They say nothing about a logout on Linux. Check that
  the workers keep running after a logout. Omarchy logs in by itself
  after the disk password, so check also if the service needs
  `loginctl enable-linger` to start after a restart. On a server with no
  desktop, the installer turns linger on. In an Ubuntu 24.04 container
  with systemd, the bridge then started at boot with no login (see
  "Linux server" in `docs/wiki.md`). Real workers after a logout are not
  checked yet.
- A user who switches the Claude account in Omarchy expects new agents
  to use it. The service pins the Main account. To follow the switch,
  the bridge must read `omarchy-agent-account-home claude`, and keep one
  supervisor and one roster for each account.
- Voxtype and a Yonder call both use the microphone. Check that they can
  share it under PipeWire.
- Each worker runs with `--dangerously-skip-permissions` by default, and
  each process of the user can call the bridge, as on the Mac.

## How to check it

1. The bridge on Arch, on the Mac (no Omarchy needed):

   ```sh
   bun build --compile --target=bun-linux-x64 bridge/main.ts --outfile /tmp/linux/yonder-bridge
   docker run --rm --platform linux/amd64 -v /tmp/linux:/work archlinux:latest \
     sh -c 'HOME=/tmp/h /work/yonder-bridge >/dev/null 2>&1 & sleep 2; curl -s -H content-type:application/json \
       -H accept:application/json,text/event-stream \
       -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}" http://127.0.0.1:7787/mcp | head -c 300'
   ```

2. On an Omarchy computer: run `omarchy default agent claude` and log
   in. Start the service, pair the phone with the terminal command, and
   start an agent from the phone.
3. While the agent runs, run `systemctl --user restart yonder`. The agent
   must keep running, and the phone must show it again within seconds.
4. Switch the Claude account with `omarchy agent account use`, and check
   that the phone still lists the running agents.

## Sources

- Omarchy source, branch `quattro`: https://github.com/omacom/omarchy
  (`bin/`, `shell/plugins/README.md`, `shell/plugins/agents/`,
  `docs/omarchy-shell.md`, `default/hypr/bindings/`,
  `config/hypr/bindings.lua`, `install/omarchy-base.packages`)
- Omarchy 4.0.0 release notes: https://github.com/omacom/omarchy/releases/tag/v4.0.0
- Omarchy manual, AI: https://github.com/omacom/omarchy/blob/quattro/manual/17-ai.md
- Omarchy manual, web apps: https://github.com/omacom/omarchy/blob/quattro/manual/25-web-apps.md
- Omarchy manual, shell plugins: https://github.com/omacom/omarchy/blob/quattro/manual/32-shell-plugins.md
- Omarchy manual, dictation: https://github.com/omacom/omarchy/blob/quattro/manual/11-text-extraction-dictation.md
- Omarchy manual, other hardware: https://github.com/omacom/omarchy/blob/quattro/manual/49-omarchy-on.md
- Omarchy news, 200,000 ISO downloads (2026-09-02): https://omarchy.org/news/2026/09/quattro-crosses-200000-iso-downloads/
- Omarchy news, Omarchy M (2026-09-11): https://omarchy.org/news/2026/09/introducing-omarchy-m/
- Michael Tsai, the Omacom Foundation (2026-08-26): https://mjtsai.com/blog/2026/08/26/omarchy-and-omacom-foundation/
- The plugin store and its submission rules: https://plugins.omarchy.org, https://github.com/omacom/omarchy-plugin-marketplace
- The catalog of the store (2026-10-05): https://github.com/omacom/omarchy-plugin-marketplace/blob/main/site/catalog.json
- Omarchy-AI: https://github.com/omribenami/Omarchy-AI
- Omodachi: https://github.com/omodachi/omodachi-plugin, https://omodachi.app
- Omavoice: https://github.com/baranskyi/omavoice
- hey-jarvis: https://github.com/Atzingen/hey-jarvis
- Keystroke: https://github.com/evindor/keystroke
- ssh-mic-bridge: https://github.com/drewdunne/omarchy-ssh-mic-bridge
- Agent status plugins: https://github.com/jankeesvw/omarchy-herdr, https://github.com/meviusisback/agent-orchestr, https://github.com/stappmus/Udder, https://github.com/idandeshe/omarchy-claude-alerts, https://github.com/apollopower/omarchy-agent-cockpit
- Other plugins near Yonder: https://github.com/adamperlis/omarchy-walkie, https://github.com/adamritter/omarchy-agent-threads
- Claude Code, Remote Control: https://code.claude.com/docs/en/remote-control.md
- Paseo, voice: https://paseo.sh/docs/voice
- Omnara in the App Store: https://apps.apple.com/app/id6748426727
- Claude Code, agent view and background sessions: https://code.claude.com/docs/en/agent-view.md
- Claude Code, authentication: https://code.claude.com/docs/en/authentication.md
- Tauri, system tray (Linux has no tray click events): https://v2.tauri.app/learn/system-tray/
- global-hotkey, the shortcut crate of Tauri (Linux: X11 only): https://docs.rs/global-hotkey
- Tauri discussion, WebRTC and getUserMedia in WebKitGTK: https://github.com/tauri-apps/tauri/discussions/8426
- systemd, `KillMode`: https://www.freedesktop.org/software/systemd/man/latest/systemd.kill.html
