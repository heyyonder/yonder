# Windows

Yonder on Windows 10 and 11. The build follows Omarchy: the same bridge,
compiled for Windows, and the page of the bridge as the window. It runs
on a real Windows PC (see the test below).

- **Why not Tauri:** the Mac app (`src-tauri/src/main.rs`) uses the CGEvent
  tap, `caffeinate`, `osascript` and the Swift helpers, which do not build
  on Windows. A Tauri build for Windows needs `cargo-xwin`, LLVM and NSIS
  on a Mac, and a Windows computer for each test. The bridge compiles
  for Windows with Bun alone (`--target=bun-windows-x64-baseline`), and
  the page has a full path outside Tauri (`/events`, the Pair row).
- **Install:** `irm https://download.yonder.so/install.ps1 | iex`
  (`windows/install.ps1`) in PowerShell. It puts the bridge, `dist\`,
  `yonder.ps1` and the icon in `%LOCALAPPDATA%\Yonder`, and
  `bin\yonder.cmd` on the PATH of the user. It adds Yonder and Yonder Call
  to the Start menu, and Yonder to the Startup folder. Then it shows the
  QR code for the phone. A second run updates it, and `yonder uninstall`
  removes it. The settings and the pairings stay in `~\.config\yonder`.
  `irm | iex` runs in the PowerShell of the user, so the installer stops
  with `throw`, never with `exit`, and keeps its variables in a block.
- **Release:** `bun run release-windows` (`windows/release.ts`) builds
  `yonder-windows-x64.zip`, and puts it, `install.ps1` and
  `latest-windows.txt` on download.yonder.so. `--no-upload` keeps them in
  `windows/out`. No page links to the zip, as for the Mac and Linux: the
  landing page sends each download to the waitlist. The x64 build also
  runs on Windows on Arm, through its emulation.
- **The service:** the Startup folder runs `yonder serve` in a hidden
  PowerShell. Its loop runs the bridge, appends its output to
  `bridge.log` through `cmd`, and starts it again 2 seconds after it
  stops, as `Restart=always` on Linux. So `restart_bridge` on Windows only
  exits. `yonder stop` stops the loop first, then the bridge, because
  Windows cannot replace a program that runs. The workers keep running.
- **The window:** `yonder open` brings the window to the front
  (`AppActivate` on the title "Yonder"), or starts Edge with
  `--app=http://127.0.0.1:7787/`, its own profile in
  `~\.config\yonder\window` and `--autoplay-policy=no-user-gesture-required`,
  as Chromium on Omarchy.
- **The call key:** Ctrl + Alt + Y, the key of the Yonder Call shortcut in
  the Start menu. Windows gives a shortcut there a key with no code. It
  runs `yonder call`, which POSTs `/call` as on Omarchy. Windows keeps
  the Windows key combinations for itself, so the key is not Win + Y.
  When the bridge does not run, a note shows for 5 seconds.
- **Pairing:** `yonder pair` prints the QR code in the console, with
  half blocks in white on black, from the GIF of the bridge. The bridge
  makes the QR code with `qrcode-generator`, because Windows has no
  CoreImage and no `qrencode` (`qrCode` in `bridge/relay.ts`). When a
  phone pairs, `yonder pair` writes spaces over the QR code and its
  line of text, and then shows "Paired with" and the name of the phone.
  The code has the error correction L, as `qrencode` in a terminal, and
  a margin of 2: 61 columns and 31 lines. With the error correction M
  and a margin of 4, a link with a name such as `DESKTOP-XXXXXXX` gives
  69 columns and 35 lines, more than a new PowerShell window of 30
  lines. OpenCV and ZXing read it with the black of the console around
  it. A code that fits 30 lines needs a shorter link, so a change in the
  phone apps.
- **Updates itself:** as on Linux. The bridge reads
  `latest-windows.txt` each hour, and with no live call it runs the
  installer with `YONDER_VERSION`. The installer gets
  `yonder-windows-x64-<version>.zip` and shows no QR code. A short
  PowerShell starts the installer with `Start-Process`, in a hidden
  console of its own, and the output goes to
  `~\.config\yonder\update.log`. A child of the bridge that is not
  detached ends with the bridge (the job object of Bun), but the child
  of that child does not. Else an installer that the bridge starts as a
  detached PowerShell, with no console, logs "Updating Yonder" and then
  nothing, and the old version stays. A bridge with that old way needs
  one update by hand.
- **The bridge on Windows** (`WINDOWS` in `bridge/main.ts`): `explorer`
  for `open`, and `explorer /select,` for a file. `Set-Clipboard` takes
  the text from a variable of the environment, because `clip.exe` reads
  its input in the code page of the console. Windows Terminal (`wt`)
  opens a worker, else `cmd /c start`. The login of Claude Code is
  `~\.claude\.credentials.json`, as on Linux. The installer of Claude
  Code can put `claude.exe` in `~\.local\bin` and fail to add it to the
  PATH. The bridge finds it there. With no Claude Code or no login,
  Yonder installs it and signs in with no terminal (the bullets on the
  setup in Workers).
  `SetThreadExecutionState` in PowerShell keeps the computer awake during
  a call. A new project goes to `~\Work`. The words for Grok say
  "computer", as on Linux (`forHost` in `src/front.ts`).
- **Bugs that the port prevents:**
  - `normalize("/")` gives `\` on Windows, so the page route served no
    window. The route now strips both separators.
  - Windows names the PATH `Path`. The bridge sets `PATH` for its
    children, so it renames the variable at the start.
  - Claude Code on Windows reads the trust of a folder in
    `~/.claude.json` with `\` in some places and with `/` in others.
    `trust` writes both keys.
  - The path checks such as ``startsWith(`${dir}/`)`` use `sep`, and the
    checks for an absolute path use `isAbsolute`.
  - `findMedia` (`bridge/media.ts`) also finds a path that starts with a
    drive, such as `C:\`, so a picture that a worker names shows.
  - `explorer /select,"<path>"` gets its quotes by hand, because Bun
    quotes the whole word when the path has a space.
- **Not on Windows yet:** "Hey Yonder", the front tab
  of the browser tool, and the scan of Yonder Preview (no `lsof`: only
  an address that the user adds shows). Dictation in the window says to
  press Windows + H, the voice typing of Windows. Agents in other CLIs
  stop with a signal to the process, because Windows has no process
  groups. No tray icon: the window and the key do its work.
- **Checked on a Mac:** `bun run check`, `bun run check-bridge`, the
  compile and the zip of `release-windows --no-upload`, and the QR code
  of `qrcode-generator`, which OpenCV reads.
- **Release:** `claude --bg` works on Windows: the agent view docs of
  Claude Code tell how background sessions and their supervisor act on
  Windows, and a report from Windows 11 (2.1.157) has `--bg` sessions
  that run. A full test has two parts:
  - A job on a Windows runner of GitHub, with no Claude credits: build
    the zip on Ubuntu (`release-windows --no-upload` needs `zip`), then
    on Windows run `install.ps1` with `YONDER_ZIP`, read `/status`,
    `/call` and `/relay`, and run `yonder stop` and `yonder uninstall`.
  - One real call on a Windows PC, or on a Windows computer in the cloud
    over Remote Desktop: the window, the microphone, the key and a
    worker. A VM on a Mac needs Windows 11 on Arm in Parallels,
    VMware Fusion or UTM, and about 50 GB of free disk.
  The landing page has a Windows card on the download page and a
  Windows button on the home page (both open the waitlist, as for the
  Mac). Yonder ships with no signature on `yonder-bridge.exe`: the
  install through `irm | iex` gets no mark of the web, so SmartScreen
  shows no warning, and only a PC with Smart App Control on blocks it.
  Smart App Control blocks a program with no signature and no
  reputation, and Defender can flag a new program. Azure Artifact
  Signing costs about US$10 a month, and only some countries can use it.
- **Tested** on a Windows PC (Smart App Control off) with no SSH and no
  Remote Desktop, so a worker there did the test, through
  `other_computer`. It installed a zip from the Mac (`YONDER_ZIP`). Each
  of the 14 steps passed:
  - The install takes 5 seconds, and `/status` answers 1.8 seconds
    later. The phone link comes back, and the phone stays paired.
  - The three shortcuts, the key Ctrl + Alt + Y, the `Path` entry and
    `where yonder` are correct.
  - The loop of `yonder serve` starts a killed bridge again in less than
    6 seconds.
  - `yonder open` opens the window in Edge in 1.2 seconds. It shows the
    agents, and a second `yonder open` opens no second window.
  - `yonder call` with no sign-in in the window shows the sign-up page,
    because a call needs an account. So the window of Windows needs a
    sign-in of its own (its Edge profile).
  - The QR code of `POST /relay` is a GIF. Defender flags nothing.
    `yonder-bridge.exe` has no signature.
  - `yonder uninstall` removes the shortcuts, the `Path` entry and the
    folder, and keeps `~\.config\yonder`. An install after it pairs
    with no new scan.
  - A worker that the new bridge starts runs and reports.
  Bugs that the test found, and their fixes:
  - A test build went back to the release one minute after its start,
    because the bridge installed each version that was not its own. Now
    it installs only a newer version (Linux, "Updates itself").
  - `yonder uninstall` printed "The system cannot find the path
    specified." two times, with the exit code 1, and the exit code of
    each `yonder` command was lost: `& exit /b` gave 0. The fix in
    `yonder.cmd`: `(goto) 2>nul` first ends the batch file, and then
    PowerShell runs with its exit code.
  - A worker can stop at once with "Could not refresh your login because
    another Claude Code process is refreshing it (or exited
    mid-refresh)" when the login of Claude Code expired. The bridge only
    reads the login file, but its `ask` (haiku) runs a second `claude`
    while the turn starts, so two processes refresh the login at the
    same moment. A "Continue." one minute later works. So `settle` puts
    one "Continue." in the queue of such a turn, and the queue sends it
    30 seconds later, with no push to the phones. A second failure shows
    as usual.
  - `/version` gives 0, and `/version?full` gives "", on a compiled
    bridge. That is correct: it has no source, and it gets updates from
    `latest.json`.
  - Each error in `bridge.log` printed a long line of the bridge, some
    KB, because `--minify-whitespace` put the code on few lines and Bun
    prints the line of an error. The releases for Windows and Linux now
    compile with no minify, so the line is one line of the source. A
    computer with no Workers AI key logged a stack for each use of
    Clef. The three Clef fallbacks now log one line.
  With the fix of "Updates itself", `rebuild_app` through
  `other_computer` updates the PC with no console window, and the log
  lines stay short.
- **A test with no person at the PC.** The account of the window is
  `yonderAccount` in its `localStorage` (`src/account.ts`), and a token
  of yonder.so lasts a year. So a worker can copy the token of the Mac
  app (the WebKit `localstorage.sqlite3` of `so.yonder.mac`):
  - The Mac serves it once on the local network under a random name,
    and stops the server after the one download. The token never goes
    into a task text or a log.
  - The worker closes the Yonder Edge window, writes `dist\signin.html`
    with `localStorage.setItem("yonderAccount", ...)` and
    `location.replace("/")`, opens the window on that page, and
    deletes the file.
  A call with no person: Edge with `--use-fake-ui-for-media-stream`,
  `--use-fake-device-for-media-stream` and
  `--use-file-for-fake-audio-capture=<wav>` takes a WAV as the
  microphone and loops it. The WAV of `say` is the question "What
  agents are running on this computer?" and 25 seconds of silence
  (`[[slnc 25000]]`, then `afconvert -f WAVE -d LEI16@48000`). After
  the test, the worker opens the window again with `yonder open`, so
  the flags are gone. This passed: the window says "Start call",
  `yonder call` started the call, Grok called `list_workers` and
  answered aloud, and the second `yonder call` ended it. A simulated
  Ctrl + Alt + Y (`SendKeys` "^%y") starts no call.
  The call key, checked with `RegisterHotKey` through `bun:ffi`
  (`BUN_BE_BUN=1` makes `yonder-bridge.exe` act as Bun):
  - Explorer owns Ctrl + Alt + Y through `Yonder Call.lnk`. With the
    hotkey off the shortcut the key was free, and with it back it was
    taken again, so the shortcut works as planned.
  - A press made by a worker (`keybd_event`, `SendKeys`) reaches no
    hotkey at all, not even one that the same test registered. So a
    worker cannot test the key, but a real press can work.
  - `Start-Process` on `Yonder Call.lnk`, the step that Explorer takes
    after the key, starts a call with no console window.
  - The first call stops at the prompt of Edge "127.0.0.1:7787 wants
    to use your microphones", and `yonder call` cannot end a call that
    connects (`toggleCall` does nothing in the phase "connecting"). A
    worker can click Allow with UI Automation (`InvokePattern`). The
    window keeps the permission, so a real call shows no prompt.
