# Yonder on the Apple Watch

This is the plan of the Apple Watch app. Phases 1 and 2
are built, but nobody has run them on a watch yet. See "Apple Watch" in
`docs/wiki/watch.md`. The sources are at the end.

## The answer

Medium, and smaller than CarPlay. The hard part of CarPlay was the call in
Swift, and that call exists now (`CarCall.swift` and `CarLink.swift`). The
watch app is CarPlay without the car: a Talk button, a call with Grok on the
watch, and the list of the agents. About one week of work, after a spike of
one day that proves the call on a real watch.

The watch has no web view, so the React app of the phone cannot run there.
The watch app is plain SwiftUI, as the car screen is plain Swift.

## The rule that decides the design

watchOS lets an app open a WebSocket only in two cases: while the app
streams audio, or while the app runs a call with CallKit (watchOS 9 and
later). Apple calls this "low-level networking" (TN3135), and
`URLSessionWebSocketTask` is part of it. Plain HTTPS with `URLSession` works
at all times.

The relay (`main.ts` of the relay repository, yonder-relay) has only WebSockets, and the realtime API of
xAI is a WebSocket too. So:

- During a call, the watch connects to xAI and to the relay itself, as the
  car does. The call must be a CallKit call.
- Outside a call, the watch cannot reach the bridge. The phone gives the
  watch the data with WatchConnectivity.
- A watch with no phone near (LTE or Wi-Fi only) works only during a call.
  An HTTP path on the relay removes this limit. Add it only if the user
  wants the watch without the phone.

The simulator always allows low-level networking. A test in the simulator
does not prove that the call works on a watch.

## What the user gets

Free, with no watch app:

- The notifications of finished agents. iOS shows the notifications of the
  iPhone on the watch when the iPhone is locked.
- The Live Activity of a call. On watchOS 11 and later, the Smart Stack of
  the watch shows the Live Activities of the iPhone. Check how the Live
  Activity of Yonder looks there. A small layout for the watch is an
  option later.

The first version of the watch app (v1):

- **Talk.** One large button with the Yonder face. A tap starts a CallKit
  call, and Grok talks on the speaker and the microphone of the watch, or
  on AirPods.
- **The call screen.** The Yonder face, the state (One moment, Listening,
  Speaking, Muted), and the buttons Mute and End, as on the car screen.
  Bars move under the face: orange while Grok speaks, blue while it
  listens. The last answer of Grok shows as a caption.
- **The system call screen.** No app can give it a background. It shows
  the outline of the Yonder face as its icon, and a caller name: the agent
  of the call, or "Yonder · 2 working".
- **Taps on the wrist.** A light tap when Grok starts to speak, and a
  notification tap when an agent gets news during a call.
- **Agents.** The list of the agents with their project and status. A tap
  on an agent starts a call, and Grok says what that agent did or needs, as
  on the car screen. During a call, the list comes from `/car`, which
  `CarCall.swift` reads every 15 seconds. Outside a call, the watch shows
  the last list that it saw.

Not in v1: settings, sign-in, purchases, the pairing QR code, text input,
pictures and conversations. The phone does all of these.

## How it works

### The call

- `CarCall.swift` and `CarLink.swift` go into the watch target too. They
  use only AVFoundation, Foundation and CryptoKit, and each of these is on
  watchOS.
- CallKit starts the audio. The watch app asks for a call with
  `CXStartCallAction`. When CallKit activates the audio session
  (`provider(_:didActivate:)`), the call starts its audio engine. Today
  `CarCall` activates the session itself, so it needs a path for CallKit.
- `.defaultToSpeaker` does not exist on watchOS. Put that option in
  `#if os(iOS)`.
- The voice processing of the input node (echo cancellation) exists on
  watchOS 6 and later. Its quality on the small speaker is not known.
- The background mode `voip` in `UIBackgroundModes` keeps the app running
  when the user lowers the wrist. Check it in the spike.
- No PushKit. Yonder never calls the watch in v1, so the watch has no
  incoming calls.

### The pairing

The watch has no camera for the QR code, and it has its own Keychain. So
the phone pairs the watch, as it pairs the car:

1. The watch makes its own P-256 key and keeps it in its Keychain.
2. The watch sends its public key to the phone with WatchConnectivity.
3. The web app gives the key to the Mac through its link, after the key of
   the car (`linkCar` of `src/bridge.ts` and the `watch_link` command).
4. The phone sends the watch the relay, the room, the key of the Mac, the
   device and the token of the Yonder account (`CarPairing`).

On the bridge, `bridge/relay.ts` keeps one `car` key for each phone. Add a
`watch` key next to it, which the phone gives with `/watch-key`. A bridge
from before the watch refuses that path, and keeps the key of the car. The
search for the phone of a session must match the `watch` key too. Revoke of the phone then removes the watch
too, as it removes the car.

### The prompt

`/car` gives the prompt, the tools and the agents. The car prompt says that
the user drives. Add `screen=watch` to `/car`, with a prompt for a small
screen: answers of one or two sentences, no code, no paths and no long
lists. The user can look at the phone. The tools stay the allow list
`CAR_TOOLS`. This change is on the bridge only, so it needs no new app and
no App Review.

### Xcode and the store

- A watchOS app target in `ios/gen/apple/project.yml`, next to
  `YonderIsland`. The bundle ID is `com.vladartym.yonder.watchkitapp`, and
  `WKCompanionAppBundleIdentifier` is `com.vladartym.yonder`. The iPhone
  app embeds it. The deployment target is watchOS 10, for CallKit and the async microphone permission.
- It needs a new App ID and a profile in the Apple team of the app.
- `bun run testflight` must write the version into the Info.plist of the
  watch app too, for the same reason as the Live Activity (ITMS-90473).
- `tauri ios init` writes `ios/gen/apple` again. `project.yml` already has
  edits by hand, and the watch target is one more.
- The watch app is part of the same App Store listing. App Store Connect then asks for watch screenshots. The
  review notes must say that the watch needs the paired iPhone and a Mac.

## Phases

1. **Spike (1 day).** A watch target with one Talk button. It starts a
   CallKit call and runs `CarCall` with a test pairing, as
   `ios/car-check.swift` does. Test it on a real watch. Go or no go:
   - the WebSocket to xAI and to the relay opens during the call,
   - Grok hears the user and the user hears Grok, with no echo,
   - the call stays on when the user lowers the wrist.
2. **v1 (3 to 4 days).** The pairing from the phone, the call screen, the
   list of the agents, and `screen=watch` on the bridge.
3. **Quick start (1 to 2 days).** A complication on the watch face and an
   App Intent "Talk to Yonder" that starts a call. The intent also works
   with Siri, the Action button of the Apple Watch Ultra and the double
   tap. The phone also sends the list of the agents to the watch with
   `updateApplicationContext`, so the list is new before a call.
4. **Later, only if the user asks.** A watch with no phone near: an HTTP
   path on the relay for the list of the agents, and pushes from
   `bridge/push.ts` to the APNs token of the watch.

## Risks

- **App Review.** CallKit is for calls between people. Apple can ask why a
  call with an AI uses it. This research found no rule that forbids it,
  the same as in `docs/carplay.md`.
- **China.** CallKit does not work in the China App Store. The iPhone app
  does not use CallKit now, so this is new for the listing. Either remove
  China from the countries of the app, or turn off the watch call there.
- **The phone wakes in the background.** For the pairing and the list,
  the watch wakes the iPhone app with WatchConnectivity. Tauri can start
  with no screen then, as with CarPlay. Check it in phase 2.
- **Battery.** A call of 10 minutes on LTE uses a large part of the
  battery of a watch. Measure it in the spike.

## The market

Omnara, the nearest older competitor, has an Apple Watch app. The watch is a good fit for Yonder: the user talks,
and the agents do the work at the Mac.

## Checks

- Test on a real watch. In the Settings app of the iPhone (not in Control
  Center), turn off Wi-Fi and Bluetooth, then tap Talk. This is the test of
  TN3135 for a watch with no phone. Then test again with the phone near.
- `ios/car-check.swift` runs the Swift link on the Mac against the live
  bridge. It covers the link of the watch too, because the code is the
  same.

## Sources

- TN3135: Low-level networking on watchOS.
  https://developer.apple.com/documentation/technotes/tn3135-low-level-networking-on-watchos
- CallKit `CXProvider`, watchOS 9 and later.
  https://developer.apple.com/documentation/callkit/cxprovider
- `AVAudioIONode.setVoiceProcessingEnabled(_:)`, watchOS 6 and later.
  https://developer.apple.com/documentation/avfaudio/avaudioionode/setvoiceprocessingenabled(_:)
- `AVAudioSession.CategoryOptions.defaultToSpeaker`, not on watchOS.
  https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/defaulttospeaker
- WatchConnectivity `WCSession`.
  https://developer.apple.com/documentation/watchconnectivity/wcsession
- watchOS 9 brings VoIP calls with CallKit to third-party apps (9to5Mac).
  https://9to5mac.com/2022/06/08/watchos-9-apis-sharing-and-voip-apps/
