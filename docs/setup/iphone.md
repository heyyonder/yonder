# Set up Yonder on the iPhone

The iPhone app needs iOS 17 or later.

## Install

1. Install Yonder on a computer first: [macOS](macos.md),
   [Windows](windows.md) or [Linux](linux.md).
2. Get Yonder from the
   [App Store](https://apps.apple.com/app/yonder-voice-coding-remote/id6818920603).
3. Open the app, and scan the QR code of your computer.

To add another computer later, open **Settings › Environments › Pair a
computer**. The phone stays connected to each computer.

## Build from the source

You need a Mac with Xcode.

- `bun run sim` builds the app and opens it in the iOS simulator. Set
  `SIM` to the ID of a simulator.
- `bun run install-ios` installs a debug build on an iPhone on the cable.
  Set `IPHONE` to the ID of the iPhone.

A fork must use its own bundle ID and Apple team ID. The details are in
[docs/mobile.md](../mobile.md).
