# CarPlay

CarPlay follows the design of `docs/carplay.md`: one app with a car
mode. The phone keeps the full React app. The car gets only the CarPlay
screen and a call in Swift.

- The rules of the car mode are on the bridge, so that a change needs no
  new app and no App Review. `GET /car?zone=<time zone>` gives the car
  prompt, the car tools and the agents for the list of the car screen.
  A phone reaches it through the relay. The car call gets it at the
  start, and again while the call runs.
- The car tools are an allow list, `CAR_TOOLS` in `bridge/main.ts`:
  `list_workers`, `get_worker`, `start_worker`, `message_worker`,
  `complete_worker`, `close_worker`, `list_projects`,
  `project_overview` and `about_yonder`, with `web_search`, `x_search`
  and `end_call`. A new tool stays off in the car until somebody adds
  it. The tools of a screen, `read_file`, the photos, the pairing, add,
  create and delete, `rebuild_app` and `restart_bridge` are off.
- The car prompt tells Grok that the user drives. Grok answers in one or
  two sentences, reads no code, paths or long lists, and never tells the
  user to pick up the phone. When the user asks for a tool that is off,
  Grok says that it does not work in the car.
- The car call has its own key. The web view keeps the key of the phone
  in IndexedDB, where Swift cannot read it. The phone gives the public
  key of the car to the Mac with `POST /car-key` through its own link,
  and `bridge/relay.ts` keeps it as `car` of that phone. So Revoke of
  the phone also removes the key of the car.
- The web app does this in `linkCar` of `src/bridge.ts`, at each start
  with a pairing and at each change of the account. The `car_link`
  command of `ios/src/lib.rs` gives the relay, the room, the key of the
  Mac and the token of the Yonder account to Swift. Swift keeps them and
  its private key in the Keychain with
  `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, so that the car
  can start a call while the iPhone is locked.
- The car screen is `CarPlay.swift`. A tab bar has two tabs: Voice, a grid with one
  Talk button (the Yonder face), and Agents, the list of the agents with
  their project and status. A tap on an agent starts a call, and Grok
  says what that agent did or needs. During a call, the voice control
  template shows over the tab bar: the Yonder face, One moment,
  Listening, Speaking or Muted, and the buttons Mute and End. No
  settings, pairing, sign-in or purchases. A problem shows as an alert,
  such as "Yonder is not paired with a Mac".
- The voice control template cannot be a tab. The CarPlay Developer
  Guide of June 2026 allows only grid, information, list and point of
  interest templates in a tab bar, and another template is an exception
  at runtime. The guide also allows the microphone in the car only while
  the voice control template is on the screen, so the call starts its
  audio after the template shows.
- When the car shows Yonder the first time after it connects, a call
  starts (`sceneDidBecomeActive`): voice is the first mode of the app, a
  rule of CarPlay. A car call ends a call of the phone app through
  `window.yonderCall`. When the car disconnects, the call ends and the
  audio session closes.
- The car call guards against four bugs. The tool calls of Grok run on
  the main actor, else they change the words of the call from two
  threads. The link to the relay closes when the car disconnects. The
  end handler of a call does not hold the call, else each call stays in
  memory with its audio engine. A call that fails to start closes the
  audio session, else the music of the car stays paused. A microphone
  of 0 Hz, as during a phone call, ends the call with "The microphone
  is not available.", else the app crashes.
- The car call is `CarCall.swift`: `AVAudioEngine` with the voice
  processing of iOS (echo cancellation), PCM16 at 24 kHz, the realtime
  API of xAI with the voice Liora, and the tool calls to the bridge as
  one JSON-RPC request through the relay (`CarLink.swift`, the link of
  `src/link.ts` in CryptoKit). It adds the last words of the call as
  context to `start_worker` and `message_worker`, drops the same request
  a second time within 30 seconds, and gets `/car` again every 15
  seconds for a new prompt and the news of the agents in a pause. The
  token comes from the bridge, or from the Yonder account, which also
  gets the minutes of the call. The checks of `voice.ts` for a message
  to a busy agent, a request in parts and wrong fixed words are not in
  it yet.
- CarPlay can start Yonder with no phone screen. Tauri then does not
  start, so all of the car is plain Swift. tao, the window layer of
  Tauri, gives its own scene delegate to each scene, also to the car, so
  else CarPlay never calls `YonderCarScene`. `ios/tao` is tao 0.37.1 with
  one patch (`declared_configuration` in
  `src/platform_impl/ios/view.rs`): a scene role with its own delegate
  in the Info.plist keeps it. `[patch.crates-io]` in `ios/Cargo.toml`
  uses it. The scene manifest in `ios/Info.ios.plist` has only the car
  scene. The phone window still gets its configuration from tao, and the
  phone app starts as usual (checked in the iOS 27 simulator).
- The entitlement `com.apple.developer.carplay-voice-based-conversation`
  is only in `yonder-ios_iOS/simulator.entitlements`, for simulator
  builds. A device build must not have it until Apple gives it to the
  App ID: the profile must have it, or the signing fails. When Apple
  gives it, add it to `entitlements.properties` in
  `ios/gen/apple/project.yml`, run `xcodegen`, and make a new profile.
  Request it at https://developer.apple.com/carplay.
- Checks: `ios/car-check.swift` runs the Swift link on the Mac against
  the live bridge through the relay, with a test pairing that it
  removes. `ios/carplay-sim.m` turns on the CarPlay screen of a
  simulator. Then the CarPlay home of the simulator lists Yonder.
  `simctl io screenshot` times out on that screen, and no
  tool here can tap it, so the car screen and the car call are not
  tested yet. Xcode 27 has DeviceHub in the place of the Simulator app.
- An older bridge has no `/car` and `/car-key`. Then the car shows
  "Update Yonder on the Mac to use it in the car."
