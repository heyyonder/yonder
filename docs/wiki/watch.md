# Apple Watch

The watch app follows the plan of `docs/watch.md`. It is the car screen
on the wrist: a Talk button, the call, and the list of the agents.

- The watch app is plain SwiftUI in `ios/gen/apple/YonderWatch`
  (`YonderWatchApp.swift` and `WatchModel.swift`), the target
  `YonderWatch` of `project.yml`, with the bundle ID
  `com.vladartym.yonder.watchkitapp`. The iPhone app embeds it in
  `Yonder.app/Watch`, so it ships with each iPhone build. The watch has
  no web view, so no React and no Tauri.
- The first screen is a Talk button with the Yonder face, and under it the
  list of the agents: the name, the project and a dot with the color of
  the status. A tap on an agent starts a call, and Grok says what that
  agent did or needs, as in the car. During a call, the screen shows the
  face, the state (One moment, Listening, Speaking, Muted), Mute and End.
- The call is personal within the limits of CallKit. The system
  call screen of watchOS takes no background, so the watch sets what
  CallKit allows: the Yonder face as `iconTemplateImageData` (CallKit uses
  only its alpha), and a caller name with `CXCallUpdate`: the agent of the
  call, or "Yonder · N working". The call screen of the app shows moving
  bars (`Wave`), the last answer of Grok as a caption (`CarCall.onSaid`),
  a light tap on the wrist when Grok starts to speak, and a notification
  tap when an agent gets news.
- A call from the green button of the system call screen on a watch
  with no pairing ends at once with "Open Yonder on the iPhone to link
  this watch." Else it shows "One moment" until the user presses End.
- The call is `CarCall.swift`, with `CarLink.swift` and `CarStore.swift`,
  the same files as the car. watchOS opens a WebSocket only during a
  CallKit call (TN3135), and the relay and Grok both use WebSockets. So
  the watch asks CallKit for a call, sets the audio category
  `.playAndRecord` with the mode `.voiceChat`, and starts `CarCall` only
  when CallKit activates the audio session. With `callKit: true`,
  `CarCall` does not open or close the audio session itself. End and Mute
  also go through CallKit. `UIBackgroundModes` has `voip`. Nobody has
  checked yet that the call stays on when the user lowers the wrist. If
  watchOS or App Review refuses `voip` with no PushKit, try `audio`, as in
  the iPhone app.
- A failed call can show only "Call Failed" from CallKit, and the app then closes. So `problem` is in `UserDefaults`, and the reason shows under Talk when the app opens again. A reset of CallKit gives its own reason. The green button of the system call screen starts a call with no tap on Talk, so `CXStartCallAction` takes its UUID when no call runs.
- The watch shows its version under Talk, and saves each step of a call (`step` in `WatchModel.swift`). When the app opens with a step still saved, the call stopped there, such as after a crash, and the screen says "The last call stopped at" that step. `CarCall` gives its own steps through `onStep` (the request to the Mac, the token, the microphone, the connection to Grok).
- The watch does not call `setVoiceProcessingEnabled`, a likely crash on watchOS: the mode `.voiceChat` gives the echo cancellation there.
- The crash reports of the watch are on the iPhone under `ProxiedDevice-*/YonderWatch-*.ips`; `xcrun devicectl device info files --domain-type systemCrashLogs` lists them. Most watches are arm64_32, where `Int` has 32 bits. So `CarCall` makes the name of its transcript from the milliseconds as `Int64`, else the number overflows and the app stops at once. Watch for the same overflow in all code that the watch shares.
- watchOS does not ask for the microphone by itself, and with no permission the microphone gives silence. So `talk()` asks for the permission of the microphone before the first call. `CarCall` also writes the format of the microphone and the loudest sample of the first 5 seconds to the log of the Mac (`call.log`, lines with `[watch]` and `audio:`), so that a silent microphone shows there.
- The microphone of the watch can have 3 channels at 48000 Hz, and the converter from 3 channels to mono gives only silence. So `tap()` in `CarCall` mixes the channels to mono itself, and logs the loudest sample of each channel in the first 5 seconds.
- The mix is very quiet, at most about 0.01 of full scale, so the VAD of Grok hears nobody. On watchOS, `tap()` multiplies the mix by 4 (`gain`; 12 clips the voice at 32767), and the log gives the loudest sample after 5 s and after 30 s.
- The watch needs no open iPhone app for a call: it connects to the relay and to Grok by itself, over the Wi-Fi of the watch or through the iPhone. "No internet connection" means that the watch had no network at that moment.
- To hear the microphone of the watch: each watch call sends its first 15 seconds, as Grok gets them, to `/paste` as a WAV in base64 with the prefix `yonder-watch-wav:` (the relay has no path for a file, and 1 MiB at most). Find it with `grep -l yonder-watch-wav ~/.config/yonder/pastes/*`, and decode the text after the prefix with `base64 -d`.
- Outside a call, the watch cannot reach the Mac. It shows the list of the
  agents from its last call, which it keeps in `UserDefaults`.
- The pairing: the watch makes its own P-256 key in its Keychain
  (`CarStore`), and sends the public key to the phone in the application
  context of WatchConnectivity. `WatchLink.swift` in the iPhone app keeps
  it. `linkCar` of `src/bridge.ts` calls the `watch_link` command after
  `car_link`, and posts the key to `/watch-key`. The bridge keeps it as
  `watch` of that phone (`bridge/relay.ts`), so Revoke of the phone
  removes the watch too. The watch has its own path, so that an older
  bridge with no watch refuses the key and keeps the key of the car. `watch_link` also sends the pairing
  of the car (the relay, the room, the key of the Mac and the Yonder
  account) to the watch. When a new key of the watch arrives while the
  phone app runs, Swift calls `window.yonderLinkCar`, which runs
  `linkCar` again. Until the Mac has the key, the watch says "Open Yonder
  on the iPhone to link this watch with the Mac."
- The prompt: the watch asks for `/car?screen=watch`. It is the car prompt,
  but the user is on a watch, not in a car, and Grok can say that a tool
  works in Yonder on the phone or the Mac. The tools are `CAR_TOOLS`.
- Tauri (cargo-mobile2) runs xcodebuild with `-sdk iphoneos`. The `-sdk`
  option forces the iPhone SDK on each target, also on the watch, and the
  build fails. `ios/bin/xcodebuild` replaces `-sdk iphoneos` with
  `-destination generic/platform=iOS` (and the same for the simulator),
  so that each target builds with its own SDK. `bun run ios` and
  `bun run sim` put `ios/bin` first in PATH. Delete the wrapper when
  cargo-mobile2 builds with a destination.
- `bun run testflight` writes the version into the Info.plist of the watch
  too, for the same reason as the Live Activity (ITMS-90473).
- `xcodegen` writes the Info.plist of each target from `project.yml`. It
  removes a key that is only in the plist, so the `CFBundleDisplayName`
  of `YonderIsland` is in `project.yml`. After `xcodegen`, put back the
  committed `yonder-ios_iOS/Info.plist`: Tauri adds the keys of
  `Info.ios.plist` to it, and xcodegen removes them. Run `xcodegen` with an
  empty `Externals` folder, or it adds groups for the build folders.
- A new Swift file in `Sources/yonder-ios` needs `xcodegen` too, because
  the committed `project.pbxproj` lists each file. Else
  `bun run install-ios` fails with an error such as "Undefined symbols:
  _yonder_shrink_video".
- Checks: the watch app compiles for watchOS (arm64 and
  arm64_32) and for the watch simulator. `bun run ios build` makes an IPA
  with `Yonder.app/Watch/YonderWatch.app`, signed with the team
  `C5338FSGXJ`, and the simulator build has the watch app too. A Mac with
  no watchOS simulator runtime cannot run it there, and the simulator always allows
  WebSockets, so only a real watch can test the call. Test it with Wi-Fi
  and Bluetooth of the iPhone off in Settings (not in Control Center), and
  again with the iPhone near.
- An older bridge has no `/car?screen=watch` and no `watch` key.
  `watch_link` is native, so the watch app comes with a new build of the
  phone app.
- A development build (`bun run install-ios`) can put the watch app on
  the watch only when the watch is a registered device of the team.
  TestFlight has no such limit: a TestFlight build carries the watch app
  (see the TestFlight notes under Phone). Install Yonder from TestFlight
  on the iPhone. The watch then installs the watch app by itself when
  "Automatic App Install" is on in the Watch app of the iPhone. If it is
  off, tap Install next to Yonder under "Available Apps" there.
- Not built yet: a complication, an App Intent for Siri and the Action
  button, and a list of the agents from the phone before a call (phase 3
  of `docs/watch.md`).
