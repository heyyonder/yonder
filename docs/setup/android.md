# Set up Yonder on Android

The Android app needs Android 7 or later.

## Install

1. Install Yonder on a computer first: [macOS](macos.md),
   [Windows](windows.md) or [Linux](linux.md).
2. Download [Yonder.apk](https://download.yonder.so/Yonder.apk) on the
   phone, and install it.
3. Open the app, and scan the QR code of your computer.

## Build from the source

You need Android Studio and its SDK.

- `bun run emu` builds the app and opens it in the Android emulator. Set
  `EMU` to the name of an emulator.
- `bun run install-android` installs a debug build on a phone on the
  cable.

The details are in [docs/mobile.md](../mobile.md).
