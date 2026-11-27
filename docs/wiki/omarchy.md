# Omarchy

Yonder on Omarchy, the Linux of DHH (Arch, Hyprland, the Quickshell bar),
so that people can control it on the go with Yonder. The research, the
plan and the tools that exist already are in `docs/omarchy.md`. Nobody
has run it on a real Omarchy computer yet.

- **What runs there:** the same bridge, compiled with
  `bun build --compile --target=bun-linux-x64` (and `arm64`). The phone
  apps and the relay need no change: a phone pairs with an Omarchy
  computer as with a Mac. The window is the page of the bridge in
  Chromium, not Tauri.
- **Install:** `curl -fsSL https://download.yonder.so/omarchy.sh | bash`
  (`omarchy/install.sh`, also for a server: see "Linux server"). It puts the bridge and `dist/` in
  `~/.local/share/yonder`, the `yonder` command in `~/.local/bin`, and
  the service in `~/.config/systemd/user`. It adds the launcher, the key
  Super + Y in `~/.config/hypr/bindings.lua`, and a command module in the
  bar (through `omarchy-shell-config`). Then it shows the QR code for the
  phone. A second run updates it, and `yonder uninstall` removes it. The
  settings and the pairings stay in `~/.config/yonder`. The bridge also
  runs it by itself for each new version ("Updates itself" in "Linux
  server").
- **Release:** `bun run release-omarchy` (`omarchy/release.ts`) builds
  `yonder-linux-x64.tar.gz` and `yonder-linux-arm64.tar.gz`, and puts them
  and `omarchy.sh` on download.yonder.so. `--no-upload` keeps them in
  `omarchy/out`.
- **The service** (`omarchy/yonder.service`) starts with the graphical
  session, so the bridge has `WAYLAND_DISPLAY` for `wl-copy` and
  `xdg-open`. `KillMode=process`: a restart of the service ends only the
  bridge, and the supervisor of Claude Code and the workers keep running.
  Under systemd (`INVOCATION_ID`), `restart_bridge` only exits, and
  `Restart=always` starts the bridge again. `OMARCHY_AGENT_CLAUDE_HOME=`
  keeps the workers on the Main Claude account, also when the user
  switches accounts in Omarchy. The log is `~/.config/yonder/bridge.log`,
  as on the Mac (`yonder logs`).
- **The bridge on Linux** (`LINUX` in `bridge/main.ts`): `xdg-open` for
  `open`, `wl-copy` for `pbcopy`, the `ShowItems` call of D-Bus for a file
  in Finder, `xdg-terminal-exec` (through `uwsm-app`) for Ghostty, the
  Claude login from `~/.claude/.credentials.json` in place of the
  Keychain, `qrcode-generator` in the bridge for the QR code (`bridge/relay.ts`), and
  `~/Work` as the folder of a new project. Dictation sends the sound to
  `voxtype transcribe` at the end (`bridge/dictate.ts`), so the words show
  only at the end. Without Voxtype, the error names Install > AI >
  Dictation. "Hey Yonder" and the front tab of the browser tool are
  Mac-only for now.
  - Voxtype needs `libasound.so.2`, which Ubuntu Server 24.04 does not
    have. The installer installs it (`libasound2t64`, `libasound2` or
    `alsa-lib`) with `sudo -n`, so it asks for no password. With no such
    sudo, it prints the command. Else the installer only says "Voxtype
    did not install", and `yonder update` does not help. A test on a
    clean Ubuntu Server VM (Lima, arm64) installs Yonder, and a fake
    phone sends a spoken sentence through the relay to `/dictate`.
    Voxtype gives the sentence back word for word.
  - The iPhone and Android do not use Voxtype for dictation. They use
    their own recognizer (see Dictation). Only Walkie-talkie with no
    `whisper-cli`, and an old phone app, send the sound to the computer.
- **The window:** `yonder open` focuses the window (a Hyprland client
  whose class has `127.0.0.1`), or starts Chromium with
  `--app=http://127.0.0.1:7787/`, its own profile in
  `~/.config/yonder/window` and `--autoplay-policy=no-user-gesture-required`.
  The own profile makes a new Chromium process, so the flags apply also
  when the browser of the user runs. Without the autoplay flag, a call
  from the key would start with no click in the page, and its sound would
  stay off. An update replaces `~/.local/share/yonder`, so the profile is
  not there. The window starts on the Omarchy style (see "Screens and
  styles"). A pick of another style in Settings stays.
- **The call key:** Super + Y runs `yonder call`, which POSTs `/call`.
  The bridge sends `toggle-call` to each window through `GET /events`
  (Server-Sent Events, with the idle timeout of Bun off). With no window,
  `yonder call` opens one, waits until it listens, and sends the key
  again. On the Mac, Rust sends the same event (the key of the call).
- **The bar:** a `command` module in `~/.config/omarchy/shell.json` runs
  `yonder status` every 3 seconds (`GET /status`): the microphone glyph
  of Omarchy (󰍬), then the running agents, `?` and the agents that wait
  on the user, and `✓` and the new results. The class `active` lights it
  during a call. A click starts or ends the call, a right click opens
  the window, and a middle click shows the QR code in a terminal.
- **The call state:** the window pings `POST /awake` each minute during
  a call, as the phone does, and `/awake?end` at the end. The bridge then
  holds `systemd-inhibit --what=sleep` (not `idle`, so the screen still
  locks), and `/status` shows the call. On the Mac, the end clears only
  the call state: the last `caffeinate` of the phone still runs out.
- **The words:** `/front` gives `platform`. On Linux, `forHost` in
  `src/front.ts` turns "Mac" into "computer" and "Finder" into "the file
  manager" in the prompt and the tool descriptions of Grok. The texts on
  the screen still say "Mac" in some places.
- **The window outside Tauri:** no "Hey Yonder" row,
  and Add folder opens the picker of the phone (`src/FolderPicker.tsx`).
  The Settings have the Pair row for the QR code.
- **Checked** in an `archlinux` container (x86_64): the install, the
  files, the binding, the launcher, the QR code through a local relay,
  `/status`, `/events` with `/call` (also after 12 seconds), `/awake`
  and its end, the error texts with no Claude login, no Voxtype, no
  `wl-copy` and no `xdg-open`, `restart_bridge` under systemd, and
  `yonder uninstall`. Not checked: systemd itself, Hyprland, the bar,
  Chromium and its sound, Voxtype, and the phone with a real pairing.
- `bun run check-bridge` checks `/status` and `/call`. `check-relay`
  checks the QR code of Linux, as a GIF and as terminal text.

## Other Linux desktops

Yonder on each Linux desktop, not only Omarchy: GNOME (Ubuntu, Fedora),
KDE Plasma, Xfce and others. Same build, same `omarchy/install.sh`, same
`yonder` command.

- **The mode** of an install is a server or a desktop. `YONDER_SERVER=1`
  or `YONDER_DESKTOP=1` picks it. Else a second run keeps the mode of the
  service: the desktop unit has `Environment=YONDER_DESKTOP=1`, and the
  server unit `Environment=YONDER_SERVER=1`. So an update from the bridge,
  which has no display, never makes a desktop a server. Else the installer
  sees a desktop by `hyprctl` or `omarchy-shell-config`, by
  `WAYLAND_DISPLAY` or `DISPLAY`, or by an active
  `graphical-session.target` of the user. Over SSH only the session
  counts: the display of `ssh -X` is not a desktop of that computer.
- **Omarchy** is a desktop with `~/.local/share/omarchy` (or
  `omarchy-shell-config`). The folder shows Omarchy also to an update from
  the bridge, whose `PATH` has no Omarchy commands. Omarchy keeps what it
  had: the unit as it is in the release, the bar, its own Claude Code.
- **Another desktop** gets the unit with the `PATH` of the install shell,
  as a server does. The unit starts with `graphical-session.target`, which
  GNOME and KDE Plasma start. Xfce, MATE, Cinnamon and others never start
  it, so `~/.config/autostart/yonder.desktop` imports the display into the
  user manager and starts the service at each login. The install also
  imports the display of its own shell, not over SSH. When Claude Code is
  missing, the installer installs it and runs its login, as on a server.
- **The call key:** Super + Y. On GNOME it is a custom shortcut of
  Settings > Keyboard, written with `gsettings` under
  `custom-keybindings/yonder/`, only when no other GNOME key is
  Super + Y. The installer writes it only once, so a key that the user
  changes stays, and an update from the bridge does not touch it. On
  Hyprland with no Omarchy, and on KDE and the other desktops, the
  installer prints how to bind `yonder call`. KDE has no simple way to add
  a global shortcut from a script.
- **The window:** `yonder open` starts the first browser of the Chromium
  family (Chrome, Chromium, Brave, Edge, Vivaldi) with `--app`, its own
  profile in `~/.config/yonder/window` and the autoplay flag. A browser
  from a snap reads no hidden folder of the home folder, so its profile is
  in `~/snap/<name>/common/yonder-window`. With no such browser, the page
  opens in the default browser. There is one window at most: when a
  window listens on `/events`, `yonder open` brings it to the front on
  Hyprland or with `wmctrl` on X11. GNOME and KDE on Wayland let no app
  raise the window of another app, so there a notice says that Yonder is
  open. The bridge also sends the call key to the newest window only, so
  two windows never start two calls.
- **The bridge on another desktop:** `wl-copy` on Wayland, else `xclip`
  or `xsel` for the clipboard. With no `xdg-terminal-exec`, a terminal
  opens in the first of `gnome-terminal`, `ptyxis`, `kgx`, `konsole`,
  `xfce4-terminal`, `kitty`, `alacritty`, `ghostty` and
  `x-terminal-emulator`, in the folder of the agent.
- **Hints:** the installer names a missing `lsof`, `wl-clipboard` or
  `xclip` with the install command of `apt-get`, `dnf`, `zypper` or
  `pacman`. `yonder uninstall` also removes the autostart entry and the
  GNOME shortcut.
- **Not done:** no bar or tray icon outside Omarchy, and no key on KDE.
- **Released** with `bun run release-omarchy`, before a test on a real
  Linux desktop. Each Linux bridge installs it by itself within an hour.
  The landing site names a Linux desktop: the download page has a Linux
  block for a desktop or a server, and the invite email has one Linux
  line.
- **Checked** on the Mac, with stand-in Linux commands, 47 checks: the
  mode on GNOME, KDE, Xfce, Omarchy, Hyprland, a server, SSH and
  `ssh -X`, each update and second run, the units, the autostart entry,
  the GNOME shortcut, the key that GNOME uses already, the key that the
  user took away, `yonder uninstall`, and the browser of `yonder open`.
  `bun run check-bridge` checks that the call key reaches only the
  newest window. Not checked: a real Linux desktop, the real
  `gsettings`, the browsers, the terminals and `wmctrl`.

## Linux server

Yonder on a Linux server with no screen, for example a cloud computer
that the user reaches over SSH. The install shows a QR code in the SSH
view, so that a phone can link a remote computer with Claude Code, not
only a Mac with a window.

- **Same build as Omarchy:** the tarball of `bun run release-omarchy` and
  the same `omarchy/install.sh`. The release puts the installer on
  download.yonder.so as `install.sh` and as `omarchy.sh`, and
  `yonder update` uses `install.sh`. The command is
  `curl -fsSL https://download.yonder.so/install.sh | bash`. The bridge,
  the phone apps and the relay need no change: the phone pairs with a
  server as with another Mac (Pair a computer in Environment).
- **Server mode:** the installer picks it when it sees no desktop: no
  `hyprctl` or `omarchy-shell-config`, no display (over SSH a display
  does not count), and no active `graphical-session.target` of the user.
  `YONDER_SERVER=1` forces it, and a second run keeps it ("Other Linux
  desktops"). In server mode the installer adds no launcher, no key and
  no module of the bar.
- **The service on a server:** the installer writes `yonder.service`
  with `WantedBy=default.target` and without `graphical-session.target`,
  which never starts on a server. It puts the `PATH` of the install
  shell in the service, because a service does not read `.bashrc`, and
  on a server `claude` is often in an npm folder, in nvm or in
  `~/.local/bin`. It runs `loginctl enable-linger`, so the bridge starts
  at boot and keeps running after the SSH session ends. When polkit
  refuses linger, the installer prints the `sudo` command. `yonder
  uninstall` leaves linger on and prints the command that turns it off.
- **Checks of the installer:** it names each missing tool with the
  install command of `apt-get`, `dnf` or `pacman`. Ubuntu and Debian
  servers have no `jq`. Yonder needs no `qrencode`. With no systemd, or when
  `systemctl --user` does not answer (a login with `su` or `sudo`), it
  stops with an error. It also tells to add `~/.local/bin` to the `PATH`.
- **No agent in the installer:** the first setup only shows the QR code
  to link the phone, also for a user who wants another agent, such as
  Hermes, first. A Ctrl+C in a login of Claude Code would also end the
  installer before the QR code. So the installer installs no agent and
  shows the QR code. The bridge does not install Claude Code by itself
  when the Agents tab opens (GET `/logins` and `/setup`). It starts only
  the sign-in of a Claude Code that is installed. The page of Claude
  Code in the Agents tab has an Install button when it is missing, and
  an agent on a missing Claude Code does not start: Grok asks the user
  first and installs it only on a yes (`ready`). The error of `ready`
  speaks to the user, because the screen shows it when the user starts
  an agent there, and the description of the `cli` tool tells Grok to
  ask. Else the phone shows "call cli with install only on a yes". The
  installer writes each folder of the `PATH` once, so the unit does not
  grow, and `~/.local/bin`, where the installer of Claude Code puts it,
  is in it.
- **The first agent:** the first agent on a server fails when nobody
  accepted the disclaimer of bypass permissions there. So the bridge
  accepts it, trusts the folder, and checks the login of Claude Code
  before each start (the bullets on `claude --bg` in Workers). A missing
  login starts the sign-in of Claude Code, and the app shows the link to
  sign in (the bullets on the setup in Workers). A missing install does
  not start by itself.
  - GET `/logins` starts the sign-in of Claude Code only when the default
    profile runs Claude Code in `~/.claude` (`plainNeeded`). Else a user
    with Hermes as the default, signed in, sees "Sign in to Claude Code"
    on the list.
  - The read of the Claude Code sessions (`claude agents`, each 2
    seconds) stops after 5 seconds, because the list of the phone waits
    for it, and a phone with no answer in 10 seconds shows Disconnected.
  - A screen from before 2.B.902 reads `list_workers` with no
    arguments as the full array, but the bridge gives `counts` and `list`
    there, so each poll of such a phone fails. A phone with such a
    screen, such as an App Store app of 2.107.750, can take no newer
    screen until it gets an app of iOS build 922 or later. So the relay
    gives the bridge the screen version of the phone (`x-yonder-app`),
    and the bridge adds `full: true` to `list_workers` for a screen below
    N 902 (`oldScreen` in `bridge/main.ts`). The relay statistics
    (`RelaySession`) show the versions.
- **Updates itself:** each Linux bridge (servers and Omarchy,
  `LINUX && !SOURCE` on port 7787) reads
  `https://download.yonder.so/latest-linux.txt` one minute after its
  start and then each hour, as the Mac app reads `latest.json`. So a fix
  gets to a server with no `yonder update` over SSH. When that version
  is newer than the one in `~/.local/share/yonder/version`, and no call
  is live (`callUntil`, which the pings of a call on `/awake` set), the
  bridge runs the installer with `YONDER_VERSION`. The installer then
  gets `yonder-linux-<arch>-<version>.tar.gz`, a name that the cache of
  Cloudflare cannot have old, and it shows no QR code. Its output goes to
  `bridge.log`. The installer restarts the service, and
  `KillMode=process` keeps the installer running to its end. A failed
  install tries again an hour later. An older version in the file does
  not replace a newer one, so a test install of a new build stays. Else
  a test build goes back to the release one minute after its start. So
  a bad release needs a newer release, not an older version in the
  file. The release writes the `version` file into the tarball, uploads
  `latest-linux.txt` after the tarballs, and purges it, `install.sh` and
  `omarchy.sh` from the cache. An update from the bridge has the `PATH`
  of the service, so the installer writes each folder of the `PATH`
  once, and the unit does not grow. An install with no updater needs
  one `yonder update`. Checked: the `PATH` of the unit stays the same
  after an update (Ubuntu 24.04, GNU tools), and shellcheck. Not
  checked: a real update under systemd.
- **The QR code** shows at the end of the install, from `yonder pair`,
  and works in the SSH terminal. The bridge draws it as text in half
  blocks (`qrText` in `bridge/relay.ts`, the `text` of POST `/relay`), so
  Yonder needs no `qrencode`. When a phone pairs, `yonder pair` clears the
  code from the screen. A second scan of a used code gets "This code
  paired <phone> already", not "No pairing code is open", while the code
  has not run out. Else a pairing that worked shows an error.
- **npm:** the name `yonder` on npm belongs to another package (2022).
  The installer does the job of an npm package with no Node, so there is
  no npm package.
- **Checked** in an `ubuntu:24.04` container (arm64) with systemd,
  polkit and SSH: the error with no `jq`, the install over SSH, the unit
  (`default.target`, the `PATH`), linger, the QR code with the live
  relay, the bridge that ran a `claude` in `~/.npm-global/bin`, the
  bridge after a restart of the container with no login, a second
  install, `yonder status` and `yonder uninstall`. After the upload,
  `curl -fsSL https://download.yonder.so/install.sh |
  bash` gave the same result in a new container. Not checked: a real
  phone that pairs, real workers, a server with no polkit, and the x64
  build, because Docker on the test Mac does not run x86_64
  images.
- **The x64 build** is `bun-linux-x64-baseline`, which needs no AVX2.
  The default build of Bun needs AVX2, and some virtual servers (the
  `kvm64` CPU of Proxmox, cheap VPS) do not have it. There the default
  build stops with "Illegal instruction".
- **On the screen** the Environment section and the pairing screen say
  "computer" and tell the `yonder pair` way. Other texts of the phone
  app still say "Mac" for a server, as for Omarchy.
