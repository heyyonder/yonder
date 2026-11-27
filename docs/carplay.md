# Yonder in CarPlay

This doc tells how difficult it is to put Yonder in CarPlay, and the car
mode below. The sources are at the end. The first build is done, and it
waits for the entitlement of Apple. See "CarPlay" in `docs/wiki.md`.

## The answer

Medium to large. Apple allows this type of app, and the CarPlay screen is
small. The large part is the call. It must move from the web view to
native Swift, because WebKit starts the microphone only in a web view that
is on the screen. Apple must also give the app a CarPlay entitlement, and
each test needs it.

## A separate app, or the whole app in Swift

Can CarPlay be a separate app in Swift, or must the whole app move to
Swift?

- The whole app does not move to Swift. Only the voice call in the car
  must be native. The screens of the phone stay React in Tauri. The car
  part is Swift in the same app, as the Live Activity is now
  (`Island.swift` and `YonderIsland`).
- The phone can keep the call of the web view (`src/voice.ts`). Then the
  app has two calls: the web call on the phone and the Swift call in the
  car. One Swift engine for both is optional. With one engine, the prompt
  and the tools stay the same on the phone and in the car.
- A separate app is possible, because each iPhone app with the
  entitlement shows in CarPlay. But the guide says: "CarPlay apps are not
  separate apps—you add CarPlay support to your existing app." A second
  app needs its own App Store listing, pairing, sign-in and in-app
  purchases. App Review can refuse it as a copy of the same app
  (guideline 4.3(a): "Don't create multiple Bundle IDs of the same app").
  The Swift call engine is the same work in both cases. A separate app in
  plain Swift saves only the tao fix (about 1 day). It adds a second app
  to build, test and send to App Review.
- CarPlay is not an extension of an app, as a widget is. The CarPlay
  scene runs in the iPhone app that has the entitlement.
- The answer: keep CarPlay in the Yonder app.

## CallKit

Is this the same as a call with CallKit? No.

- CallKit gives no audio. It tells iOS that a call is live, and iOS shows
  it as a phone call. The app must still record and play the audio, so a
  CallKit call needs the same Swift call engine. CallKit around the call
  of the web view fails in the car for the same reason: WebKit starts no
  microphone in a web view that is not visible.
- CallKit needs no entitlement. iOS shows a CallKit call on the call
  screen of CarPlay, with Mute and End. But Yonder then has no icon on the
  car screen, so the user starts the call on the phone.
- CallKit does not work in the China App Store. Apple made CallKit for
  calls between people. This research found no rule that forbids a call
  with an AI.

## What Apple allows

- iOS 26.4 added the category "voice-based conversational apps", with the
  entitlement `com.apple.developer.carplay-voice-based-conversation`.
  Request it at https://developer.apple.com/carplay, and agree to the
  CarPlay Entitlement Addendum. Apple examines each request and gives no
  time. In the request, describe Yonder in the words of the rule below: a
  voice assistant that answers requests and does actions.
- ChatGPT has been in this category since April 2026: an animated orb, a
  mute button and an end button, and no text.
- The rules of the category in the CarPlay Developer Guide (June 2026):
  1. Voice is the primary mode at launch. After launch, the app answers
     questions and requests, and does actions.
  2. The app holds the audio session open only while voice is in use.
  3. The app shows no text or images in response to a request.
- While voice is active, the app must show the voice control template
  (`CPVoiceControlTemplate`). In CarPlay, recording is allowed only with
  this template. Since iOS 26.4 the template has 2 action buttons (Mute and
  End for Yonder) and a button at each end of the navigation bar.
- The other templates of the category are the action sheet, alert, grid,
  list, tab bar, information and point of interest templates. The app can
  show 3 templates at most, with the root template.
- CarPlay can start the app on the car screen only, often with the iPhone
  locked. Then the app cannot read files with `NSFileProtectionComplete`,
  or Keychain items with `kSecAttrAccessibleWhenUnlocked` and the other
  "when unlocked" classes.
- The guide says that Xcode and the simulators also need a provisioning
  profile with CarPlay, so each test waits for the entitlement. After the
  approval, turn on the capability for the App ID `com.vladartym.yonder`,
  make a new profile, and sign without automatic signing.
- When the entitlement is in the app, each user sees the Yonder icon in
  CarPlay. It cannot be shown to some users only.

## Why the call cannot stay in the web view

- Now the call runs in the web view (`src/voice.ts`): `getUserMedia`, an
  AudioWorklet and a WebSocket to `wss://api.x.ai/v1/realtime`.
- WebKit starts a capture only in a web view that is visible. In WebKit bug
  259465 a WebKit engineer wrote: "The call to `getUserMedia` never prompts
  because the webview is not visible when it is called." Safari does the
  same in a background tab.
- In the car the iPhone is often locked, and CarPlay can start Yonder with
  no screen on the phone. Then the web view is not visible, or it does not
  exist (see the next section).
- So the call in the car must be all native: the audio, the WebSocket to
  xAI, the token, the tool calls of the bridge and the encryption of the
  relay. Native audio with the tool calls in JavaScript does not work,
  because a launch from the car starts no web view.
- Siri cannot start the call either. On the Apple Developer Forums
  (thread 815725), the answer is that an App Intent cannot start a
  recording while the app is in the background.

## Tauri and the scenes

- Each CarPlay app must use scenes. `ios/Info.ios.plist` needs a
  `UIApplicationSceneManifest` with two configurations:
  `UIWindowSceneSessionRoleApplication` for the phone, and
  `CPTemplateApplicationSceneSessionRoleApplication` for the car. The car
  configuration has the `UISceneClassName` `CPTemplateApplicationScene`,
  and a Swift delegate that conforms to
  `CPTemplateApplicationSceneDelegate`.
- Do not add `UIApplicationSupportsMultipleScenes`. The example of the guide
  for this type of app does not have it, and tao places its window in a
  different way when it is on.
- tao 0.37.1, the window layer of Tauri, answers
  `application:configurationForConnectingSceneSession:options:` for each
  scene, and sets its own `TaoSceneDelegate` for each role
  (`configuration_for_connecting_scene_session` in
  `src/platform_impl/ios/view.rs`). So the car scene gets the delegate of
  tao, and CarPlay never calls the Swift delegate.
- The fix: tao sets `TaoSceneDelegate` only for the window roles. For the
  car role, it returns the configuration of the Info.plist by its name, so
  that the Swift delegate stays. Keep the patched tao in the repository
  with `[patch.crates-io]`, as `ios/swift-rs`, and send the fix to tao.
- With a scene manifest, tao starts the app (`on_app_ready`) only when its
  first scene connects (`did_finish_launching` in
  `src/platform_impl/ios/app_state.rs`). After the fix, a launch from the
  car connects only the car scene. Tauri, the web view and the React app
  then start only when the phone screen opens. So the car delegate and the
  call engine must be plain Swift in the app target, as `Island.swift`.

## The native call engine

- Port the call of `src/voice.ts` (747 lines) to Swift: `AVAudioEngine`
  with voice processing (echo cancellation), PCM16 at 24 kHz, the realtime
  protocol of xAI, the stop of Grok when the user talks, mute, the end of
  the call, and a new session at the 30-minute limit of Grok.
- Port `src/link.ts` (199 lines). CryptoKit has ECDH on P-256, HKDF and
  AES-GCM, so the Swift version is short.
- The tool calls go to the bridge over MCP through the relay. In the car,
  Grok needs only the tools of the bridge. The tools of the phone screen
  (`show`, the theme, the tabs, the photos) stay out. The car needs its own
  short prompt.
- The token comes from the bridge (`/token`), with the xAI key in `.env`.
  A call needs no Yonder account.
- The pairing key is a non-extractable `CryptoKey` in IndexedDB, so Swift
  cannot read it. The engine needs its own key. The web app can register it
  through its link, so the user does not scan the code again. Keep the key
  in the Keychain with `kSecAttrAccessibleAfterFirstUnlock`, or the car
  cannot start a call while the iPhone is locked.
- If the phone also uses this engine (through a Tauri command), "The
  locked screen" in `docs/mobile.md` (a walk with the phone locked in a
  pocket) no longer decides if the audio goes native. See "A separate
  app, or the whole app in Swift".

## The CarPlay screen

- The voice screen is `CPVoiceControlTemplate`, with the states
  Listening, Thinking, Speaking and Mac offline, and the buttons Mute and
  End. The app starts on this screen and starts to listen.
- A list of the agents is allowed. A tab bar can hold two tabs: Voice, which opens first, and Agents
  (`CPListTemplate`). Each row shows the name of an agent and a short
  status, such as Running, Waits for you or Done.
- Correction from the build: the voice control template cannot be a tab.
  The guide says: "The tab bar is a versatile container for Grid,
  Information, List, and Point of interest templates", and "Attempting
  to use an unsupported template triggers an exception at runtime." So
  the Voice tab is a grid with one Talk button, and the voice control
  template shows over the tab bar during a call
  (`presentTemplate`).
- The guide says: "a list template must be used to present a list for
  selection". So a tap on a row must do something. For example, Grok
  then says the result of that agent aloud.
- The screen shows no transcript, no result text and no pictures. The
  guide also says: "Never show the content of messages, texts, or emails
  on the CarPlay screen."
- When the car disconnects (`didDisconnect`), end the call or move it to
  the phone, and close the audio session.

## The demo

The yonder.so landing page has a CarPlay demo with sound: a call of 27 s
in which a user asks for an agent to fix the login bug of a website, and
Yonder answers with Liora. The car screen is drawn in code, in the style
of the CarPlay screen that this document describes.

## Car mode: what is on and what is off

This section tells the best way to turn off features in CarPlay.

- The phone keeps the full React app. The car gets a car mode: the
  CarPlay scene and the Swift call engine. The car mode has only the
  parts that it needs. Most features are off in the car because nobody
  builds them in Swift.
- Keep the rules of the car mode on the bridge, not in Swift: the car
  prompt and the tools for the car. A change to the bridge needs no new
  app and no App Review. The Swift engine gets them from the bridge at
  the start of each car call.
- The tools for the car are an allow list. `MAC_ONLY` in `src/voice.ts`
  is a block list for the phone, but in the car a new tool must stay off
  until somebody adds it.
  - On: `list_workers`, `get_worker`, `start_worker`, `message_worker`,
    `complete_worker`, `close_worker`, `list_projects`,
    `project_overview`, `about_yonder` and `end_call`.
  - Off: the tools of a screen (`show_*`, `set_theme`, `pair_phone`,
    `browser`, `open_*`, `copy_to_clipboard`),
    `read_file`, the photos, the tools that add, create or delete
    (`add_project`, `create_project`, `remove_worker`, `remove_project`),
    `rebuild_app` and `restart_bridge`.
- The car prompt tells Grok that the user drives. Grok answers in one or
  two sentences, and does not read code, paths or long lists. The news in
  a pause (`offerNews` in `src/App.tsx`) suits the car.
- CarPlay shows no notifications of this type of app. In the car, the
  news of the agents comes only by voice, in a pause of the call.
- The car screen has no settings, pairing, sign-in or purchases. The
  guide says: "Never instruct people to pick up their iPhone to perform a
  task." An alert can tell the problem, such as "Yonder is not paired
  with a Mac", without that instruction.
- `didConnect` of the car scene turns the car mode on, and
  `didDisconnect` turns it off. One call runs at a time: a car call
  replaces a call that runs on the phone.

## What to test before the entitlement

- Since iOS 26, CarPlay shows the Live Activities of each app on the
  CarPlay Dashboard. Without the small family, it shows the compact views
  of the Dynamic Island. So the Live Activity of Yonder is likely to show
  there during a call. `.supplementalActivityFamilies([.small])` in
  `YonderIsland` gives it a layout for the car.
- A call that starts on the phone before the drive can possibly continue in
  the car. Nobody has tested this. The web view must keep the microphone
  with the iPhone locked (the open question of `docs/mobile.md`), and the
  audio session of WebKit must go to the car.

## Order of work

1. Request the entitlement. It costs nothing, and it changes nothing in the
   app until the key is in the entitlements file.
2. In a car, test the Live Activity and a call that starts on the phone.
3. Patch tao, and add the scene manifest and the car delegate.
4. Build the native engine, first for the car, then for the phone.
5. Test in the CarPlay Simulator (a Mac app in "Additional Tools for Xcode"
   or Device Hub) with the iPhone on the cable, then in a car.

Status: steps 3 and 4 (for the car) are built. Steps 1, 2
and 5 wait for the user. The iOS simulator does not need the entitlement
of Apple: with the key in `simulator.entitlements`, the CarPlay of the
simulator lists Yonder.

## Size

| Part | Size |
|---|---|
| The entitlement | A form. The wait for Apple is not known. |
| The tao fix and the scene manifest | About 1 day. |
| The CarPlay screen | 1 to 2 days. |
| The native call engine | 1 to 3 weeks. This is most of the work. |
| The tests in the simulator and in a car | Some days. |

## Sources

- CarPlay Developer Guide, June 2026:
  https://developer.apple.com/download/files/CarPlay-Developer-Guide.pdf
- iOS 26.4 and voice apps in CarPlay:
  https://9to5mac.com/2026/02/18/ios-26-4-adds-support-for-voice-based-ai-apps-to-carplay/
- ChatGPT in CarPlay:
  https://www.thurrott.com/a-i/334501/chatgpt-is-now-available-in-apple-carplay-for-ios-26-4-users
- WebKit bug 259465, `getUserMedia` in a web view that is not visible:
  https://bugs.webkit.org/show_bug.cgi?id=259465
- App Intents and recording in the background:
  https://developer.apple.com/forums/thread/815725
- App Review Guidelines, 4.3 Spam:
  https://developer.apple.com/app-store/review/guidelines/#spam
- CallKit calls in CarPlay: WWDC 2017 session 719,
  https://developer.apple.com/videos/play/wwdc2017/719, and
  https://9to5mac.com/2016/09/21/messenger-callkit-carplay-voip/
- CallKit in China: https://developer.apple.com/forums/thread/103083
- tao 0.37.1: `src/platform_impl/ios/view.rs` and `app_state.rs` in
  `~/.cargo/registry/src/*/tao-0.37.1`.
