# Set up Yonder on Linux

Yonder runs on Omarchy, GNOME, KDE Plasma, Xfce, and on a server with no
screen that you reach over SSH. The installer needs systemd.

## Install

1. Log in as the user that runs your agents. On a server, log in over SSH.
2. On a server, install the tools of the installer:
   `sudo apt-get install curl jq`.
3. Run the installer:

   ```sh
   curl -fsSL https://download.yonder.so/install.sh | bash
   ```

4. Scan the QR code at the end with the phone app. On a phone that already
   has a computer, use **Settings › Environments › Pair a computer**.
5. On a desktop, open Yonder from the list of apps, or run `yonder open`.
   The window is the page of the bridge in a Chromium browser.

On a server, the installer installs no agent. After the pairing, install
Claude Code, Hermes or another CLI from the Agents tab of the phone.

## How it runs

- The bridge runs as the user service `yonder.service`. On a server, it
  starts at boot and keeps running after you log out
  (`loginctl enable-linger`).
- Yonder updates itself each hour when no call is live.
- Dictation uses Voxtype. The installer installs it when it is missing.

## The `yonder` command

| Command | What it does |
|---|---|
| `yonder open` | Opens the window. |
| `yonder pair` | Shows a new QR code to pair a phone. |
| `yonder update` | Installs the newest version now. |
| `yonder restart` | Restarts the bridge. |
| `yonder logs` | Shows the log of the bridge. |
| `yonder uninstall` | Removes Yonder. Voxtype stays. |

## Build from the source

`bun run release-omarchy --no-upload` builds Yonder for Linux (x86_64 and
arm64) into `omarchy/out`. For the development commands, read
[CONTRIBUTING.md](../../CONTRIBUTING.md).
