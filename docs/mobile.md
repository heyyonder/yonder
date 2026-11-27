# Yonder on the phone

This is the plan for a Yonder app on the phone. With it, the user can go
on a walk and talk to Yonder while the agents work.

## Goal

The phone shows the same projects, agents and conversations as the Mac app,
and it makes the same voice call. The agents still do the work on the Mac.

## What is built

The relay, the Mac side, the pairing, the iPhone app and the Android app are
built. The iPhone app is in `ios/`, and `bun run install-ios` installs it on the
iPhone over the cable (set `IPHONE` to the ID of the iPhone). The Android app is in `android/` (see "The Android app").

| File | What it does |
|---|---|
| The relay repository (yonder-relay) | The relay: a WebSocket server in Bun (`main.ts`). It forwards frames and reads none of them. It is its own repository, cloned in the folder `relay` next to this app, so that users can read it and run their own. Its README tells how. |
| `bridge/relay.ts` | The Mac side: the connection to the relay, the pairing, the requests of the phones, and the QR code. |
| `src/link.ts` | The encryption for both sides, and the phone client: `pair()` and `linkFetch()`. |
| `src/PairPhone.tsx` | File > Pair Phone in the Mac app: the QR code and the paired phones. |
| `relay/check.ts` | `bun run check-relay`: a fake phone pairs and uses a fake bridge through the relay. |
| `ios/` | The iPhone app: its own Tauri shell with the QR scanner, and the Xcode project in `ios/gen/apple`. |
| `android/` | The Android app: its own Tauri shell with the QR scanner, and the Android Studio project in `android/gen/android`. |
| `src/Pair.tsx` | The first screen on the phone: scan the QR code of the Mac, or paste its link. |

- `bun run check-relay` passes 34 checks with the relay in the process. It
  passes 27 checks against the live relay: the check cannot see the frames
  in the container or stop it. The GitHub workflow checks out the public
  relay repository and runs the relay in the process.
- `roomOf` is in `bridge/relay.ts` and in `main.ts` of the relay. Both make
  the same hash of the token. If they differ, the phone cannot find the Mac,
  and `check-relay` fails.
- A fake phone also used the real bridge through a local relay: the MCP
  client of the app, with `linkFetch` as its `fetch`, listed the 22 tools and
  called `list_projects`.
- The bridge starts the relay connection only after a restart, and the menu
  item shows only after a rebuild of the app.

## What stays on the Mac

- The bridge, the workers and the project folders stay on the Mac. The workers
  run `claude` on the files of the Mac, with the Claude login of the Mac.
- The phone is one more client of the bridge, as the Mac app is now. The
  tools, the Grok prompt and the workers do not change.
- The voice audio goes from the phone directly to `wss://api.x.ai`. Only the
  token request and the tool calls go through the Mac, so the path to the Mac
  does not slow down the voice.
- The Mac must stay awake. The Yonder app does not have to run, but the
  bridge must run.
  - The bridge can start `caffeinate -is -w <its pid>`, so that the Mac does
    not sleep on the charger.
  - **Caution:** a closed lid on battery puts the Mac to sleep anyway. Keep
    the Mac on the charger, or keep the lid open.
  - After a restart of the Mac, nothing starts the bridge until you open
    Yonder. A launchd agent can start the bridge at login.

## Decision: our own relay, not Tailscale

The first plan used Tailscale: `tailscale serve` on the Mac, and the Tailscale
app on the phone. Yonder uses an own relay with QR pairing instead:

- The phone needs only the Yonder app. It needs no VPN app and no Tailscale
  account.
- The relay runs in a Docker container on our own server.
- One QR scan links the phone to the Mac. There are no accounts.
- The relay forwards only encrypted bytes. It cannot read or change the
  messages.

The cost is more code and one server to maintain. Tailscale stays the quick
fallback: it needs no code on the relay side, only the change of the Host
check in the bridge.

## How the relay works

```
Phone app ──wss──► Relay (Docker, on a server) ◄──wss── Bridge on the Mac
              only encrypted bytes go through the relay
Phone app ──wss──► xAI realtime API (the voice, direct)
```

1. The bridge opens an outbound WebSocket to the relay, so the Mac needs no
   open port. It connects again after a drop or a sleep.
2. The phone opens a WebSocket to the relay with the room of the Mac.
3. The relay forwards each frame between the phone and the bridge. It gives
   each phone connection a number, so that more phones can connect at the
   same time.
4. The phone sends an encrypted HTTP request, for example `POST /mcp`. The
   bridge runs it on its own endpoints and sends back the encrypted response.
   So each endpoint of the bridge works on the phone with no extra code.
5. The bridge accepts only the paths that the app needs (`/mcp`, `/token`,
   `/conversation`, `/calls` and others). The phone cannot pair other phones.

The room comes from a secret token of the Mac: the room is a hash of the
token. The phone knows the room from the QR code, but only the Mac knows the
token. So the phone cannot take the place of the Mac on the relay.

## Pairing with a QR code

1. In Yonder on the Mac, click File > Pair Phone. The app shows a QR code.
2. The QR code holds the relay address, the room, the public key of the Mac
   and a one-time pairing secret.
3. The phone scans the code, makes its own key pair, and connects to the
   relay.
4. The phone proves that it knows the pairing secret. The bridge saves the
   public key of the phone. Now the two devices trust only each other's keys.
5. The pairing secret works one time, for 5 minutes. A photo of an old QR
   code is of no use.
6. The same dialog lists the paired phones. Remove a phone there, and the
   bridge refuses its key.

## Encryption

- Each device has an ECDH key pair on the P-256 curve, not X25519, because
  the WebCrypto of Bun has no X25519. P-256
  works in Bun and in the web view of iOS, with no extra library.
- Each connection starts with a handshake: the phone and the Mac send new
  ephemeral public keys. The keys of the connection come from HKDF-SHA256 over
  two ECDH results: the long-term keys and the ephemeral keys. The pairing
  also adds the pairing secret.
- Only the real Mac and the real phone can make these keys. The relay has
  neither private key, so it cannot read or change a frame.
- Each frame is AES-256-GCM, with one key for each direction. The nonce is a
  counter. The receiver accepts only the next counter, so a replayed frame
  fails. A new connection has new keys, so a frame from an old connection
  fails too. Without this, a relay could replay a `start_worker` request and
  start an agent again.
- The private key of the Mac is in `~/.config/yonder/relay.json` (mode 600).
  The private key of the phone cannot leave the phone (a non-extractable
  WebCrypto key).

**Warning:** the relay must never serve the page of the phone app. If it did,
a hacked relay could send a page that steals the keys, and the end-to-end
encryption would protect nothing. So the phone app must be a real app that
holds its own code.

## The phone app: Tauri for iOS

Yes, the phone app can use the same React code. Tauri 2 builds iOS apps from
the same project (`tauri ios init`), and the app runs the React code in the web
view of iOS.

- **Transport:** on the phone, each bridge request goes through the relay
  client (`src/link.ts`) instead of `http://127.0.0.1:7787`. The MCP client of
  the app already accepts a custom `fetch`, so the tools need no change.
- **Desktop parts:** the app already hides the right ⌘ key, the menus and
  "Add folder" outside Tauri. On the phone it also hides Ghostty, screen
  recording and Finder.
- **New on the phone:** a QR scanner (the Tauri barcode scanner plugin), a
  safe store for the pairing, and a layout for the safe areas of the screen.
- **Install:** an iPhone build needs Xcode. A free Apple account installs the
  app for 7 days. The Apple Developer Program ($99 a year) gives TestFlight.

## The Dynamic Island

During a call, the iPhone app shows a Live Activity: the favicon of the
project on the screen at the left of the Dynamic Island, and the counts of
the running, waiting and done agents at the right. The Yonder icon shows
only when the project has no favicon. A long press shows the name of the
project and the counts with words. The Lock Screen shows the same.

| File | What it does |
|---|---|
| `ios/gen/apple/YonderIsland/YonderIsland.swift` | The widget extension: the views of the island and of the Lock Screen. |
| `ios/gen/apple/YonderIsland/YonderAttributes.swift` | The counts, the mute state, and the name and the favicon of the project. The app and the extension both compile this file. |
| `ios/gen/apple/YonderIsland/CallIntent.swift` | The mute and end buttons (iOS 17). The app and the extension both compile this file, and iOS runs it in the app. |
| `ios/gen/apple/Sources/yonder-ios/Island.swift` | The app side: it starts, updates and ends the Live Activity. |
| `ios/src/lib.rs` | The `island` command, which calls `Island.swift`. |
| `src/App.tsx` | The effect that sends the counts while a call is live, and ends the Live Activity after the call. |

- The Live Activity shows only during a call. Without a call, iOS stops the
  app soon after it leaves the screen, so the counts would stay old. To keep
  it on after a call, the bridge can update it through Apple push with an
  ActivityKit push token (`apns-push-type: liveactivity`).
- iOS starts a Live Activity only while the app is on the screen. A call
  starts with a tap, so this is always true.
- iOS does not show the Live Activity of the app on the screen in the
  island. A Live Activity lasts 8 hours at most.
- While the app is on the screen, the island shows Now Playing when Grok
  speaks. The effect in `src/App.tsx` sets `navigator.mediaSession.metadata`
  during a call, with the favicon of the project as the artwork. Without
  it, the island showed a black square.
- The widget extension cannot read the files of the app or load a URL, so
  the favicon comes with the data, as a PNG in base64. The app draws the
  favicon at 48, 32 or 24 px, and takes the first that is 3000 characters
  or less, because ActivityKit takes 4 KB of data at most for each update.
  A larger favicon shows no icon.
- Only an iPhone 14 Pro or later has the Dynamic Island. Other iPhones show
  the row on the Lock Screen.
- To see it in the simulator without a call, change the condition of
  `island` in `src/App.tsx` to `true` for one build, then go to the home
  screen (`axe button home`). Do not commit that change. The phone runs the
  front end of the bridge when its build is newer (see "Install the app" in
  `docs/wiki.md`), so give the test build a higher number: make a temporary
  commit with the change, build, and then remove the commit.

### Hand edits in `ios/gen/apple`

`tauri ios init` writes `ios/gen/apple` again. After a new init, put back
the `YonderIsland` and `YonderShare` targets, the `aps-environment` property of the
entitlements, the `CallIntent.swift` source of the app, the weak
`AppIntents.framework` and `TARGETED_DEVICE_FAMILY: 1` of both targets (the
iPhone only, see "The stores") in `project.yml`. Then run `xcodegen generate` in
`ios/gen/apple`. xcodegen needs the folders `Externals` and `assets`.
`NSSupportsLiveActivities` is in `ios/Info.ios.plist`, which Tauri adds to
the plist of the app at each build.

## The share extension

`YonderShare` in `ios/gen/apple` puts Yonder in the share sheet of iOS.
The user shares a link, such as a post on X or Instagram, a text, or
photos, videos and documents. A sheet shows the link
or the file names, a field for a message, and "Send to": "New agent"
or one of the agents that are not closed. Send calls `start_worker` with
no project and no name, so the bridge picks the project and the title, or
`message_worker` with the number of the agent. The task is the message,
then the link.

- The extension has no web view, so it uses the Swift link of CarPlay
  (`CarLink.swift` and `CarStore.swift`). The app gives the car key to
  the Mac at each start (`linkCar` in `src/bridge.ts`), so the bridge
  knows the key already.
- `CarStore` keeps the pairing and the key in the Keychain group of the
  app (`<team ID>.com.vladartym.yonder`, with the Apple team of the app). The extension reads it with
  `keychain-access-groups` in `YonderShare.entitlements`. The app needs
  no new entitlement.
- When the Mac is offline, the sheet shows the error and stays open. It
  does not queue the share, as the outbox of the web app does.
- Photos, videos and documents: the extension copies each
  file while the other app lets it read the file, then sends the original
  to the bridge in parts of 768 KB, one at a time: a video to `/video`,
  which makes its keyframes and the words of its sound, and each other
  file to `/file`, which keeps its name and makes a JPEG of a HEIC photo.
  The Send button shows only the percent. Then `files` of `start_worker`
  or `message_worker` gets the paths. A 4K video of 335 MB is about 440
  parts, so the sheet must stay open for a few minutes.
- The bundle ID is `com.vladartym.yonder.share`. The App Store profile is
  "Yonder App Store yonder.share", in `ios/store/AppStoreExport.plist`.
  `bun run testflight` writes the version of the app into
  `YonderShare/Info.plist`, as for the island.
- A phone app from before the extension needs one rebuild.

## The locked screen

iOS can stop the microphone of a web view when the screen locks. The app
has the background audio mode and
`navigator.audioSession.type = "play-and-record"`, and the call gets the
microphone again when iOS ends the track. Reports say that iOS 17.5 and
later keep the microphone of a web view in the background with the audio
mode. The simulator has a mock microphone and ended the track, so only a
locked iPhone can give the answer. It decides how much native code the app
needs:

1. Turn on the background audio mode of the app, and test a walk with the
   phone locked in a pocket.
2. If the microphone stops, move the Grok audio and the WebSocket to native
   Swift (AVAudioEngine), as a Tauri plugin. CallKit can make the call act
   like a phone call, with AirPods and lock-screen controls.

Android silences the microphone of an app that is not on the screen. The
emulator shows it in `dumpsys audio`: about 10 seconds after
the screen locked, the recording of the web view was "silenced", and Android
marked the app as cached, so it can freeze the app. So during a call, the
Android app keeps a foreground service on (`CallService.kt`), with the type
"microphone" and a wake lock. Its notification shows on Android 13 and later
only with the notification permission, which the app does not ask for yet
(see "Not built yet"). The service runs without it. With the service on, the
microphone stayed on for 20 seconds with the screen locked, and the page got
10 audio frames each second. A real walk with an Android phone is not done
yet.

## The Android app

The Android app runs the same React code
in `src/` as the iPhone app, in its own Tauri shell in `android/`.

### Set up the Mac

This Mac has these tools now.

1. Install Android Studio. Its Java (JBR 21) runs Gradle. `/usr/bin/java` is
   Java 8, and Gradle does not run on it.
2. Install the NDK with the SDK manager of Android Studio, or run
   `sdkmanager "ndk;29.0.14206865"`.
3. Run `rustup target add aarch64-linux-android`. `tauri android init` also
   added the targets for armv7, x86 and x86_64.

`bun run android ...` sets `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME` (the
newest NDK) when they are not set, and runs the Tauri CLI with
`TAURI_APP_PATH=android`.

### Commands

- `bun run emu` builds the debug APK for arm64, starts the emulator
  `pushtest` (Pixel 7, Android 15) with no window when it is off, and installs
  and opens the app. `EMU=<name>` selects another emulator. When the emulator
  does not exist, the script stops and lists the emulators. Make one in the
  Device Manager of Android Studio. A start from a quick-boot snapshot takes
  about 10 seconds.
- `bun run install-android` installs the debug APK on an Android phone on the
  USB cable. Turn on USB debugging on the phone first.
- The APK is
  `android/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.
- In a worktree, set `CARGO_TARGET_DIR` to the `android/target` of the main
  checkout, as for iOS. The first build compiles all of Tauri for Android.

### What is different on Android

- The back gesture of Android closes an open menu or picture, then the settings, then
  the open conversation or call (`onBackButtonPress` in `src/App.tsx`). At
  the list, the app goes to the background (`YonderAndroid.background()`),
  and a live call stays on. The default of Tauri ended the app.
- During a scan, the back gesture stops the scan, and the field for the link
  shows (`src/Pair.tsx`). The scanner does not end the promise of a stopped
  scan, so the app ends it.
- The scanner of Android does not ask for the camera, as iOS does. So the app
  asks first. Without this, the scan failed with "No permission to use
  camera".
- The web view of Android gives `env(safe-area-inset-*)` only for a cutout of
  the screen. So `MainActivity.kt` gives the sizes of the status bar and the
  navigation bar to the page (`YonderAndroid.bars()`), and `src/main.tsx`
  sets `--inset-*` for the CSS. Else the gesture bar covers the message
  box.
- The keyboard makes the web view shorter, so that the message box stays
  above the keyboard. Else the keyboard covers the message box.
- The icons of the system bars follow the theme of the app
  (`YonderAndroid.dark()`). Else the dark theme has dark icons.
- A long press on a row does not select its text.
- A call keeps `CallService.kt` on (`YonderAndroid.call()` in
  `src/voice.ts`). See "The locked screen".
- The photo button opens the photo picker of Android. It has no camera
  choice.
- The Paired phones list of the Mac shows the phone as "Android".

### Hand edits in `android/gen/android`

`tauri android init` writes `android/gen/android` again. After a new init,
put these edits back:

- `MainActivity.kt` and `CallService.kt` in
  `app/src/main/java/com/vladartym/yonder`.
- `app/src/main/res/drawable/ic_call.xml`: the white bird in the
  notification of a live call.
- `app/src/main/AndroidManifest.xml`: the permissions for the microphone, the
  foreground service and the wake lock, the `CallService` entry, and
  `adjustResize`.
- The icons: in the repository, run
  `TAURI_APP_PATH=android bunx tauri icon android/icons/icons.json`. The
  adaptive icon is the bird of `android-fg.svg` on the red background.
  Then delete the desktop and iOS icons that the command writes in
  `android/icons`.
- The template had a "Hello World" layout and colors that nothing used. We
  deleted them.
- `app/build.gradle.kts`: the release signing with the upload key, and
  `app/proguard-rules.pro`: the keep rule (see "Google Play").
- `app/src/main/AndroidManifest.xml`: no TV launcher (see "Google Play").

### Test in the emulator

1. Run `bun run emu`.
2. Make a pairing code:
   `curl -X POST http://127.0.0.1:7787/relay`, and approve with Touch ID.
3. Tap "Scan the code", allow the camera, then press back
   (`adb shell input keyevent 4`). The scan stops, and the field for the link
   shows. The camera of the emulator shows only a test image.
4. Put the link in the field through the DevTools of the web view. The debug
   build allows them: open `chrome://inspect` in Chrome on the Mac. An agent
   can forward the socket with
   `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` (the pid
   comes from `adb shell pidof com.vladartym.yonder`). Then it evaluates code
   that sets the value of `.pair-link` and sends a keydown of Enter. Do not
   type the link with `adb shell input text`, because the link has `%`, `&`
   and `?`.
5. Take a screenshot with `adb exec-out screencap -p > shot.png`. Tap with
   `adb shell input tap <x> <y>`, in pixels (1080 × 2400 on the Pixel 7, 2.625
   pixels for each CSS pixel).
6. Remove the pairing of the emulator when you are done
   (`DELETE /relay?phone=<public key>`).

A microphone test needs no paid Grok call: call `getUserMedia` through the
DevTools, and read `dumpsys audio`. The emulator gives silence from its
virtual microphone.

### Not built yet

- **Push notifications.** Android needs Firebase Cloud Messaging (FCM):
  1. Make a Firebase project, add an Android app with the ID
     `com.vladartym.yonder`, and put its `google-services.json` in
     `android/gen/android/app/`.
  2. Add the `com.google.gms.google-services` Gradle plugin.
  3. Add `tauri-plugin-notifications` with the `push-notifications` feature
     to `android/Cargo.toml` and `android/src/lib.rs`, and
     `notifications:default` to the capabilities.
  4. Ask for the `POST_NOTIFICATIONS` permission (Android 13 and later). This
     also shows the notification of a live call.
  5. Make `bridge/push.ts` send to FCM (HTTP v1, with a service account), and
     let the phone tell the bridge if its token is for APNs or for FCM.

  Until then, `registerForPushNotifications()` fails on Android, and
  `src/bridge.ts` only logs it.

### Google Play

- `bun run play` builds the release bundle (AAB) for all four ABIs, with the
  version "2.B.N" of `version.ts` (see Versions in the wiki), so the `versionCode`
  (1,000,000 + 1000 B + N) grows with each commit. Google Play refuses a `versionCode` that it has
  already seen. The bundle is
  `android/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`.
- The upload key is `~/.config/yonder/android-upload.jks`, and its passwords
  are in `~/.config/yonder/android-upload.properties` (mode 600, out of git).
  `app/build.gradle.kts` reads that file for the release build. Google Play
  re-signs the app with its own app signing key.
- **Caution:** keep a backup of both files. Without the upload key, only a
  key reset through Google support lets you upload again.
- The release build shrinks the code with R8. `proguard-rules.pro` keeps the
  `@JavascriptInterface` methods, because the page calls `YonderAndroid` by
  name.
- The manifest has no TV launcher, because Google Play reviews an app with
  `LEANBACK_LAUNCHER` as a TV app.
- The privacy policy is https://yonder.so/privacy/, and the terms of
  service are https://yonder.so/terms/ (the yonder.so site, private). The
  relay page https://relay.yonder.so/privacy (`privacy.html` of the relay) links
  to the new policy.
- `android/store/` holds the icon, the feature graphic and the screenshots
  of the listing.

### Known issues

- When the back gesture comes before the camera starts, the scanner stays on.
  The plugin stops nothing before the camera starts, and it starts the camera
  after the stop. On the emulator, the first start of the camera takes about
  6 seconds. On a phone, it takes less than one second.
- The emulator has the web view of Chrome 124. A phone gets new versions of
  the web view from Google Play.

## The stores

The screenshots of each store are in `ios/store/` and `android/store/`.
`bun android/store/render.ts ios` makes the iPhone screenshots
(1320 × 2868) from `android/store/screens.html`.

- The iPhone app is for the iPhone only (`TARGETED_DEVICE_FAMILY` 1). The
  web view of an iPad sends the user agent of a Mac, so the app would not
  see a phone there. App Store Connect then asks for no iPad screenshots.
- `ITSAppUsesNonExemptEncryption` is `false` in `ios/Info.ios.plist`: the
  app uses only the encryption of iOS, so it is exempt.
- `bun run testflight` (`ios/store/testflight.sh`) builds the App Store IPA with the version "2.B.N", as
  `bun run play` does. It also writes that version into
  `ios/gen/apple/YonderIsland/Info.plist`, because the extension must have
  the version of the app. Do not commit that change. The script reads
  `APPLE_API_KEY` and `APPLE_API_ISSUER` from `release.env` and uploads
  the IPA with `xcrun altool`. Set `NO_UPLOAD=1` to build the IPA and
  skip the upload. The key file
  must be `~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8`.
  On the dev bridge, a commit that changes `ios/` (not `ios/store/` and
  not a plist only) runs this upload. The log is
  `~/.config/yonder/testflight.log`.
- The export step of `bun run testflight` fails from Claude Code, also
  outside the sandbox. `xcodebuild` says "No Accounts", although Xcode
  shows the account. The team key has the App Manager role, which cannot
  do cloud signing ("Cloud signing permission error"). So upload each
  build by hand:
  1. Run `bun run testflight`. It leaves the archive in
     `ios/gen/apple/build/yonder-ios_iOS.xcarchive`.
  2. Run `open` on the archive. In the Xcode Organizer, click Distribute
     App, App Store Connect, Distribute. Xcode signs the build with the
     account of the user.

  An API key with the Admin role would let the script do all of it.
- Settings, Account, Delete account opens https://yonder.so/account/delete/.
  Both stores need it.

- The phone sells nothing: Yonder is free, with no paid plan. See
  "Subscriptions in the app" in `docs/wiki.md`.

### Hand steps

1. A reviewer needs no Yonder account: a call uses the key of a voice
   provider on the computer. Give the review notes a demo video and a
   live pairing.
2. App Store Connect: make the app (New App).
3. App Store Connect: make a team key in Users and Access, Integrations,
   with the App Manager role. Put the `.p8` file in
   `~/.appstoreconnect/private_keys/`. Then run
   `ASC_KEY_ID=<key id> ASC_ISSUER_ID=<issuer id> bun run testflight`.
4. The subscriptions: none. The app sells nothing in App Store Connect
   or in Google Play.
5. Record the demo video on the iPhone and on an Android phone. Put the Android video on YouTube as
   unlisted.
6. Fill each form of App Store Connect, upload
   `ios/store/screen-1.png` to `screen-5.png`, and attach the video. Submit
   the app, and keep the Mac online during the review.
7. Fill each form of the Play Console.
8. Run the closed test of Google Play: 12 testers or more for 14 days.
   Then apply for production.

## The live relay

The relay runs at `wss://relay.yonder.so`. It runs the public code of the
relay repository (yonder-relay): `main.ts` of the relay does the 15 seconds
rule, `/privacy` and the statistics.

- An older relay name goes to the same relay. A phone keeps the relay
  address of its pairing, so a phone that paired with the older name still
  connects. New QR codes use `relay.yonder.so`.
- A deploy takes only a pushed commit of the relay repository, so the live
  relay is always a commit that people can read. The deploy closes the
  sockets, and the bridge connects again after a few seconds.
- The live relay has no `ROOMS`, so each Mac that downloads Yonder can
  connect. With `ROOMS`, only the rooms in the list can connect, and a
  second laptop of the user stays offline.
- `YONDER_RELAY` in `~/.config/yonder/.env` sets the relay of the bridge.
  The bridge reads it when it starts.
- `RELAY_URL=wss://relay.yonder.so bun run check-relay` passes its checks
  against the live relay, with the 3 MB body, when `ROOMS` is not set.

## Set up the relay on another server

The README of the relay repository (yonder-relay) is the guide for users. A clone of the
repository, a `.env` with `DOMAIN`, and `docker compose up -d --build` start
the relay with Caddy for HTTPS. Then:

1. On the Mac, click File > Pair Phone, open the Relay tab, put
   `wss://relay.example.com` in the field, and click Save. Or put
   `YONDER_RELAY=wss://relay.example.com` in `~/.config/yonder/.env`, and
   restart the bridge ("restart the bridge").
   The bridge makes `~/.config/yonder/relay.json` with the keys of the Mac.
2. Click File > Pair Phone. The dialog shows "Connected to" the relay, and
   the room of the Mac.
3. To keep strangers off the relay, put `ROOMS=<room>` in the `.env` on the
   server, and run `docker compose up -d`. Then only this Mac can connect.

**Caution:** `relay.json` holds the private key of the Mac and the token of
its room. Do not copy it to another Mac. Delete it to make new keys; then pair
each phone again.

To check the relay on the server from the Mac, run
`RELAY_URL=wss://relay.example.com bun run check-relay`. The check uses a
temporary key and room, so it does not change the pairing of the Mac. With
`ROOMS` set, the check cannot connect, because its room is not in the list.

## Order of work

1. Build the relay, the Mac side and the pairing, with a check that runs a fake
   phone. (Done.)
2. Set up the relay at `relay.yonder.so`. (Done.)
3. Build the Tauri iOS app with the relay transport and the QR scanner. (Done.)
4. Build the Tauri Android app from the same code. (Done.)
5. Take a walk with the phone locked in a pocket.
6. Move the audio to Swift only if the walk shows that it is necessary.

## Limits

- A Grok session lasts 30 minutes at most, and the app does not reconnect. A
  long walk reaches that limit.
- A call costs about $0.08 a minute, so about $5 an hour.
- On cellular data, 24 kHz audio instead of 48 kHz uses less data.
- The Android app has no push notifications yet (see "The Android app"). Grok
  does not announce results now either.
