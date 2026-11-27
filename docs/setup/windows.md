# Set up Yonder on Windows

Yonder runs on Windows 10 and 11.

## Install

1. Open PowerShell, and run the installer:

   ```powershell
   irm https://download.yonder.so/install.ps1 | iex
   ```

2. Scan the QR code at the end with the phone app.
3. Open **Yonder** in the Start menu for the window. Edge shows it.
4. When Claude Code is missing, Yonder installs it. To sign in, open the
   link on the Agents tab, approve, and paste the code into Yonder.

## How it runs

- The bridge starts at each log-in.
- Yonder updates itself each hour when no call is live.
- For dictation, press Windows + H in the prompt box.
- The `yonder` command works as on Linux: `open`, `pair`, `update`,
  `restart`, `logs` and `uninstall`.

## Build from the source

`bun run release-windows --no-upload` builds Yonder for Windows into
`windows/out`. For the development commands, read
[CONTRIBUTING.md](../../CONTRIBUTING.md).
