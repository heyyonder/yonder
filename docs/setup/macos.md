# Set up Yonder on macOS

Yonder runs on macOS 26 or later, on Macs with Apple silicon and Intel.

## Install the app

1. Install at least one coding CLI, such as Claude Code, and sign in to it
   once.
2. Download [Yonder.dmg](https://download.yonder.so/Yonder.dmg).
3. Drag Yonder to the Applications folder, and open it.
4. Follow the first run. It asks which CLI you use, and its last step
   starts that agent. The agent then sets up the rest with you: the
   workspaces, the look and the settings.
5. Pair your phone: open **Settings › Pair a phone**, and scan the QR code
   with the phone app.

The Mac app updates itself. It installs only an update that the release
key of Yonder signs.

## Permissions

macOS asks for these permissions:

- **Input Monitoring**, for the keys, such as right ⌘ for the notch. Turn
  on Yonder in **System Settings › Privacy & Security › Input
  Monitoring**, then quit Yonder and open it again. If the key does
  nothing, read `~/.config/yonder/app.log`. It says "listening for the
  keys" when the keys work.
- **Microphone**, at the first dictation.
- **Screen & System Audio Recording**, at the first click on the record
  button of the prompt box.

An attached or recorded video needs `ffmpeg` and `whisper-cli` for its
frames and its words: `brew install ffmpeg whisper-cpp`.

## Let an agent do the setup

Give this to an agent in a terminal, in any CLI:

```
Set up Yonder for me. First read the guide with
`curl -s http://127.0.0.1:7787/setup-guide`. Then follow it step by step.
```

## Build from the source

1. Install [Bun](https://bun.sh) and [Rust](https://rustup.rs).
2. Clone the repository, and install the packages: `bun install`.
3. Change the signing identity in `bundle.macOS.signingIdentity` of
   `src-tauri/tauri.conf.json` to your own certificate. A stable
   certificate keeps the macOS permissions after each rebuild.
4. Build and install the app: `bun run install-app`. This quits Yonder,
   moves the new build to `/Applications`, and opens it.

For voice calls, set up a [voice module](../voice/README.md).

For the development commands, read [CONTRIBUTING.md](../../CONTRIBUTING.md).
