# Talking to Yonder

- **At launch:** The app never starts a call by itself, also after a
  rebuild. The user starts each call with the call button, the key of
  the call (see Keys) or the menu bar icon, as on the phone. Else Grok
  greets the user by voice after each rebuild.
- **Keys:** a tap of a key alone, or a shortcut, in any app, does one of
  three things. The Keys section of the settings (Mac only) has one row
  for each thing, with one button that shows its key, such as Right ⌘.
  These rows are under Anywhere. Under In Yonder are the shortcuts of the
  window, with a button each too: New chat (⌘T), New project (⌘N), Open
  folder (⌘O), Talk (⇧⌘D), Effort (⌘E), Switch project (⌘D), All
  projects (⌘A; in a field with text it selects all), Rename
  agent (⌘R), Find (⌘F), Close agent (⌘↩), Settings (⌘S), Back (⌘←) and
  Forward (⌘→).
  - Switch project (⌘D, `projectKey`) works as ⌘Tab of the Mac in the
    lists: a hold of ⌘ shows the icons of All projects, Yonder and the
    starred projects in a row in the middle of the window, the last used
    first, as ⌘Tab (`recentProjects` in localStorage). Each ⌘D or arrow
    moves one, and the release of ⌘ opens that project. A quick ⌘D goes
    back to the project before, with no switcher. The rail has the same
    order, and its icons have no names. Escape closes it. It works in an
    open agent too, so Talk is ⇧⌘D, not ⌘D.
  - Find (⌘F) selects the search of the view: the Settings, the Projects
    view, the Canvas tab or the Search tab. On the Agents, Done, Saved and
    Closed tabs it goes to the Search tab, which finds an agent in all
    the projects. In an open agent, a field in place of the name finds
    words in the chat: each match gets a mark, the field shows "2/14",
    Enter goes to the next match, ⇧Enter to the match before, and Escape
    closes the field. Only the loaded turns match, not the older turns
    that load on a scroll up. ⌘F works in a text field too.
  - `config.json` holds them as `newChatKey`, `newProjectKey`,
    `openFolderKey`, `talkKey`, `effortKey`, `renameKey`, `findKey`,
    `closeKey`, `settingsKey`, `backKey` and `forwardKey`, with the names of a shortcut below, but
    no modifier key alone. `hit` in `src/Settings.tsx` matches a key
    down by the place of the key or by its letter, so ⌘W stays the key
    with W on it on another layout. One shortcut does one thing.
  - New chat, New project and Open folder are items of the menu, so
    `set_menu_keys` of `src-tauri/src/main.rs` changes their shortcuts.
    An older Mac app has no `set_menu_keys`, and its menu keeps ⌘T, ⌘N
    and ⌘O. The tabs (⌘1 to ⌘5), the zoom (⌘+, ⌘− and ⌘0) and the
    arrows stay fixed.
  - A click on the button records the next key: a modifier key that goes
    up alone, such as Left ⌃, or a shortcut, such as ⌃⌥K or F13. Delete
    alone turns the thing off, and Escape or a click stops the recording.
    Any key can be set, in the settings and in `config.json`.
  - `config.json` holds the keys: `newAgentKey` and `voiceNoteKey`. A
    name is `right-command`, `right-option`, `right-shift`,
    `right-control`, `left-command` and the other left keys for a tap
    alone, a shortcut such as `ctrl+option+k`, `cmd+shift+space` or
    `f13`, or `off`. The modifiers are `ctrl`, `option` (or `alt`),
    `shift` and `cmd`. A key that types, such as `k` or `space`, needs a
    modifier, and only F1 to F20 go alone. A name that Yonder does not
    know is off, and `app.log` says so. A change by hand applies when the
    settings or an agent opens. Keys that an older version kept in
    `localStorage` go to `config.json` at the first load.
  - The tap only listens, so the front app gets a shortcut too. A ⌘
    shortcut of the menu of Yonder, such as ⌘N, does its menu item when
    the button records it, so write it in `config.json`.
  - A name is read by `parse_key` of `src-tauri/src/main.rs`, so a new
    name needs a new build of the Mac app. An older Mac app reads only
    the three right keys, and any other name is off.
  - New agent (Right ⌘ by default) opens the notch (see Notch), and a
    second tap sends the words. During a call it ends the call, and the
    notch opens when the call has ended, as the + button does.
  - Escape closes an open notch and drops its words, as the X does. It
    also stops a voice note.
  - Voice note (off by default) listens, and a second tap pastes
    the words where you were (see Voice note). It does nothing during a
    call. With the window of Yonder in front, it is the talk bar of the
    open agent, as ⇧⌘D, and a second tap sends, as Enter (see Voice
    note).
  - Call (Off by default) starts the voice call or ends it. While the call
    is on, you and Yonder discuss things like on a phone call.
  - One key does one thing: a key that one thing gets goes to Off for
    the others. Keys from before the voice note that give right ⌥ to
    another thing set Voice note to Off. The page keeps a copy of the keys in `localStorage` (`keys`) and
    gives them to `set_keys` of `src-tauri/src/main.rs`.
  - The key codes and the flag bits are in `KEYS` of `main.rs`, from
    `Events.h` of Carbon and `IOLLEvent.h`. Without the bit of the right
    key, the left key held down hides the release of the right one.
  - `src-tauri/src/main.rs` reads the keys with a CGEventTap, which
    needs Input Monitoring. Without it, macOS creates the tap but never turns
  it on, so the app checks `CGPreflightListenEventAccess` first, and it
  turns the tap on again each second. The state goes to
  `~/.config/yonder/app.log`.
- **Menu bar:** the Yonder icon is the orb: two wobbly rings, a little
  off from each other, as on the talk button (`src/Orb.tsx`). It is a
  template icon, so macOS makes it black or white for the menu bar. It
  turns red while a call is live. A click starts or ends the call.
  Escape also ends a live call, on any screen. The PNGs of 64 px come
  from the `ring` function of
  `src/Orb.tsx` at time 0, with a stroke of 8 and the outer ring moved
  12 units up and right.
- **The notch of a call:** while a call of the Mac is live, the notch
  has two small sides: the orb at the left and the time of the call at
  the right. A click goes through it to the menu bar. It is small,
  because it only shows that a call is on.
  - The time starts when the call is live (`connectedAt` of
    `src/voice.ts`, the `since` of `set_call_live`), as the call button
    counts. While the call connects, the notch shows no time. Else the
    time of the notch does not match the call button.
  - The window sends the loudness of the call (`call_level`, the louder
    of the microphone and the voice of Yonder, through `size` of
    `src/Levels.tsx`) ten times a second, so the orb moves with both
    voices. In a silence it breathes a little (`rest`).
  - The app writes `call <ms>` (0 while it connects), `level <0 to 1>`
    and `end` to the stdin of the helper (see Wake word).
  - It is a panel of its own (`callPanel`), because a panel that once
    ignored the mouse keeps the clicks on its clear parts after it stops
    ignoring it.
- **Locked screen:** while a call is live, the app runs `caffeinate -i`,
  so the Mac does not go to sleep when the screen locks, and the call
  stays on. The display still sleeps. When the call ends, or the app
  quits, caffeinate stops.
  A call on the phone keeps the Mac awake too: the phone sends
  `POST /awake` to the bridge when the call starts and each minute
  after. Each ping runs `caffeinate -i -t 120`,
  so the Mac sleeps again 2 minutes after a call on the phone ends or
  drops.
- **Wake word:** Off, with no switch in the settings. The app sends
  `set_wake` off to the
  Mac app and `wake(false)` to the Android app at each start (`wake` in
  `src/App.tsx`), and the code of the helper stays. The Mac keeps the
  microphone of dictation open for 5 minutes after a dictation (see
  Dictation), and "Hey Yonder" would hear "Yonder" in the words. With the
  wake word on, "Hey Yonder" opens the notch of a new agent on the Mac
  (see Notch), and on Android it starts the call.
  - `src-tauri/wake/main.swift` is a helper that the build compiles
    with `swiftc` (`build.rs`) into `src-tauri/binaries/`. Tauri puts it
    in the bundle as `Contents/MacOS/yonder-wake`. It uses the speech recognition of Apple
    on the Mac only (`requiresOnDeviceRecognition`), so no audio leaves
    the Mac. For each transcript with "hey yonder" in it, it opens the
    notch and prints `wake`, which goes to `app.log`. "Yonder" alone
    does not wake it, else talk to an agent on a phone near the Mac
    opens the notch.
  - `src-tauri/src/main.rs` runs the helper during a call, and while the
    switch is on or a key opens the notch (see Keys). With the switch on
    and no call, the helper gets `--wake` and listens for "Hey Yonder".
    Else it has no microphone until the notch opens, and it closes the
    microphone when the notch closes. During a call it only shows the
    notch of the call. A change between the two kinds starts the helper
    again, and the kill waits for its end, so the microphone is closed
    before the call or the dictation of the window opens it. The app
    writes `open` (the key of the notch), `escape`, `call` and `end` to
    its stdin.
    A helper that stopped by itself starts again at the next tap of the
    key of the notch.
  - The microphone stays open while the helper listens for "Hey Yonder",
    so macOS shows the orange microphone dot all the time. No API turns
    the dot off.
  - With Default in the Microphone row (see Microphone), the helper
    listens for "Hey Yonder" on the built-in microphone of the
    Mac (`chosenMic` in `wake/main.swift`), also when AirPods are the
    input of macOS. AirPods with an open microphone play all sound in the
    low quality of a phone call, and the helper listens all the time. The
    dictation of the notch in this mode uses the same built-in
    microphone. A Mac with no built-in microphone uses the input of
    macOS. So AirPods keep their normal sound.
  - The helper records with a capture session (`AVCaptureSession`) on
    that one device (`startMic`), not with the input node of
    `AVAudioEngine`. On macOS that node records from an aggregate of the
    input and the output of macOS, and the engine puts the aggregate
    back after each change of its device. So the engine takes the
    microphone of the AirPods again, and the AirPods stay in the low
    quality, also with the built-in microphone chosen.
  - The app stops the helper when a call starts to connect, and waits for
    it to stop before the call opens the microphone. A silent MacBook
    microphone has another cause (see Echo cancellation below).
  - macOS asks for the Speech Recognition permission of Yonder when the
    switch first turns on, because Yonder starts the helper. So
    `NSSpeechRecognitionUsageDescription` is in `src-tauri/Info.plist`.
    Without it, macOS kills the helper (a TCC crash).
  - The helper starts a new recognition task after each end, each notch,
    and each minute, because a task ends after silence. No task runs
    while the notch listens. If the helper
    stops by itself, it starts again after the next call or a new turn
    of the switch. Its errors go to `~/.config/yonder/app.log`.
  - The switch needs a rebuild of the Mac app the first time.
  - Android has "Hey Yonder" too. `Wake.kt` (next to
    `MainActivity.kt`) uses the `SpeechRecognizer` of the phone, the one
    on the phone when it has one (Android 12 and later), so no audio
    leaves the phone. It listens only while the app is on the screen,
    the switch is on, and no call or dictation has the microphone
    (`YonderAndroid.wake` and `YonderAndroid.busy`, called from
    `src/App.tsx` and `src/dictate.ts`). For each "yonder" in the words,
    it sends the window event `yonder-wake`, and the window starts a
    call. The settings show the switch only on an Android app that has
    `wake`, so it needs `bun run install-android` once. The screen-off
    case needs a foreground service with a notification, and is not
    built. Some phones play a short tone at each new recognition.
- **Notch:** "Hey Yonder" on the Mac opens a black shape that grows out
  of the notch of the MacBook, as the Dynamic Island of the iPhone. You
  talk, and the words start a new agent. The key of the notch
  (right ⌘ by default, see Keys) opens it too, and a second tap sends.
  The call still starts with the key of the call, the menu bar icon and
  the call button.
  - The small orb of the talk view (`src/Orb.tsx`, with no dots) is at
    the left of the notch, and an X is at its right. The words show
    under them, in two lines at most. The newest line is at the bottom,
    and the shape is as tall as the words.
  - The start chime of the dictation plays when the notch opens. A send
    plays the whoosh of a new agent (see Send sound), and the X, the
    close with no words and a send with no words play the end chime.
    Else a send sounds as if the notch turns on and off at once.
    `resources` of `tauri.conf.json` puts `public/whoosh.m4a` in
    `Contents/Resources` of the app, where the helper finds it
    (`Bundle.main`).
  - A click on the notch, or "send it" at the end of the words, sends
    the words. "Send it" sends only when no new word comes for 0.7 s, so
    "send it to the server" inside a task does not send. The send
    removes "send it" from the task. The X drops the words. With no
    words in 8 s, the notch closes, because another "yonder" woke it.
  - The send closes the notch at once (see Instant actions in
    `CLAUDE.md`). Then the helper gets the last text and calls
    `start_worker` on `/mcp` of the bridge with no project. So the
    bridge picks the project from the task, as the New agent view of
    All projects does. A failure opens the notch again for 6 s, with
    the reason in red.
  - The notch is an `NSPanel` with `nonactivatingPanel`, at the level
    `mainMenu + 3` over the menu bar, on each Space and over apps in
    full screen. A click on it does not make Yonder the active app, so
    the app of the user keeps the keyboard. The helper is an app with
    no Dock icon (`accessory`).
  - The panel goes on the active screen (`NSScreen.main`, the screen of
    the window with the keyboard), over its notch, or under the middle
    of its menu bar on a screen with no notch. Else, with the work on a
    second monitor, the notch shows on the MacBook. The small notch of a
    call stays on the screen where the call started. On a 16 inch
    MacBook Pro the notch is 185 by 32 points, and the open notch is
    440 points wide.
  - On a screen with no notch, such as an external monitor, the shape
    grows out of nothing and shrinks back into nothing, not into a
    black bar of the size of a notch. On a MacBook the shape grows out
    of the notch and goes
    back into it. The big notch, the notch of a call and the voice note
    all do this (`closedSize` in `Notch`).
  - Nothing of the shape fades. macOS fades the panel out in about
    0.1 s at `orderOut`, 0.45 s after the close starts. By then the shape
    is gone, or on a MacBook it is behind the notch: the closed shape
    has the size of the notch itself, also the curves of its top
    corners. So the shape seems to go into the top of the screen. Else
    the curves stay out on the menu bar of the MacBook and fade with the
    panel.
  - A small shape keeps the look of the notch: `NotchShape` makes its
    curves smaller with the shape, so they never cross. The panel is 20
    points wider than the shape, because the spring opens the shape up
    to 17 points wider for a moment. Else the edge of the panel cuts
    the curves of the top corners in that moment.
  - The helper has the microphone already, so the sound goes to the
    dictation with no gap after "Hey Yonder". It gives the sound to
    `yonder-dictate` (see Dictation), which is next to it in
    `Contents/MacOS`: PCM16 at 16 kHz on stdin, and JSON lines with the
    text on stdout. So the words are as good as in the talk view. The
    words before the notch opens are lost: say "Hey Yonder", and then
    the task.
  - A call that starts, or a dictation in the window, stops the helper.
    The notch then goes, with its words.
  - `yonder-wake --demo` shows the open notch for 30 s with sample words
    and no microphone, to see its look.
  - Not built yet: a click on the menu bar icon to send (it starts the
    call), and the words in the same breath as "Hey Yonder" (they need
    the sound from before the wake word).
- **Voice note:** tap right ⌥ (see Keys) in any app, talk, and tap it
  again. The words go into the text field where the cursor was, with a
  space after them for the next note.
  - It is a small notch, as the notch of a call: the orb at its left,
    and at its right the icon of the app where the words go and seven
    bars that scroll with the voice. The words do not show, and it has
    no X. A click on the notch pastes too. It listens until the second
    tap, with no limit of 8 s. "Send it" does nothing in it. A failure,
    such as "Copied", shows in the big notch.
  - The bars: a step each 1/15 s takes the loudest moment, and each bar
    chases its height.
    `yonder-wake --demo-note` shows it with a fake voice.
  - The window in front at the first tap is the destination: the app
    and its focused window, through Accessibility, because a second
    window of the same app is the usual interruption. If another window
    is in front when the words are ready, that window comes back first
    (raise, `kAXFrontmostAttribute`, `activate`), and the paste waits
    up to 1.2 s for it. Else the words stay on the clipboard, and the
    notch says "Copied. Press ⌘V to paste."
  - The paste borrows the clipboard: it puts the words on it, posts ⌘V
    at the HID tap, and puts back all of the old clipboard after
    0.75 s, also an image. A paste is faster than typed keys, and it
    gives the right letters on each keyboard layout.
  - The key of the notch does nothing during a voice note, and the key
    of the voice note does nothing while the notch listens for a new
    agent.
  - The key acts at its press, not at the release of a tap, and it can
    be held: press right ⌥, talk, and let go. A
    release after 0.5 s (`HOLD`) ends what that press started, and the
    words go. A tap still starts, and the next press ends. Another key,
    modifier or click while it is down drops what its press started,
    with no end sound, because then it was a shortcut such as ⌥E.
    `watch_keys` of `src-tauri/src/main.rs`
    gives Down, Tap, Hold or Cut (`Edge`), and `note_key` sends
    `talk-key` at the press, then `talk-key-up` or `talk-key-cut` to
    the window (`keyPress` and `useDictation` in `src/App.tsx`), or
    `note`, then `note-up` or `note-cut` to the helper (`releaseNote`
    and `cutNote` in `wake/main.swift`). The key of the notch and the
    key of the call still act at the release of a tap. A release while
    the microphone of the window still opens sends as soon as it is on.
  - In Yonder the key is the talk bar: with the window in front,
    `tap_key` of `src-tauri/src/main.rs` sends `talk-key` to the page in
    place of the voice note. In an agent, the tap opens the talk bar, as
    ⌘D does, and a second tap sends, as Enter does, also in the big talk
    view of a new agent. With no agent open, the press starts a new
    agent in the talk view, as the + button does, and a hold sends at
    the release. A voice note or a notch that listens (`HELPER_MIC`,
    from "mic on" and "mic off" of the helper) still gets the tap, so a
    note from another app still ends with a tap in Yonder. An older Mac
    app starts a voice note in Yonder, which pastes into the focused
    field of Yonder.
  - The tap also works in the New agent view with the text box (New
    chat): it opens the talk view, as the microphone of the box does. In
    a talk view that does not listen, after Escape or a failure, the tap
    starts the dictation again, as a tap on the orb. The Mac app logs
    each tap of the key in `app.log` with two values: the window in
    front, and the microphone of the helper. The tap goes to the window
    only when the first is true and the second is false.
  - The code is `src-tauri/wake/Note.swift` (`Destination`, `Paste`,
    `deliver`) and the note mode of `Notch` in `wake/main.swift`. The
    app writes `note` to the stdin of the helper. `build.rs` compiles
    each `.swift` file of a helper folder.
  - It needs the Accessibility permission, for the questions to the
    other app and for the ⌘V. Yonder starts the helper, so the permission
    of Yonder should apply, as for the microphone. This is not tested
    yet. Without the permission, the first tap opens the request of
    macOS, and the notch says "Allow Yonder in Accessibility, then tap
    again."
  - The text comes from `yonder-dictate`, as in the notch.
  - Not built: the small bars under the text cursor (the notch shows the
    words instead), the pause of Spotify and Music while it listens (it
    needs the Automation permission), and a filter for words that a
    model makes up in a silence. When `yonder-dictate` gives no text,
    nothing is pasted.
- **Microphone:** the Voice section of the settings of the Mac has a Microphone row. Default
  follows the input of macOS. The choice stays in `localStorage` (`mic`),
  and `getMic` in `src/voice.ts` asks for it as a wish, so the default
  microphone takes its place when the chosen one is gone. The names show
  only after Yonder got the microphone once. The choice helps when one
  microphone sends almost silence in the calls (see Echo cancellation).
  - The choice is for all of Yonder on the Mac: the
    calls, the dictation of the window, the notch, the voice note and
    "Hey Yonder". The window keeps the name of the microphone too
    (`micName`), and `set_audio` gives it to the helper as `--mic`,
    because the helper knows the devices of macOS by name and not by the
    id of WebKit. A change of the name starts the helper again. So the
    microphone of the Mac keeps AirPods in high quality: AirPods with an
    open microphone play all sound in the low quality of a phone call.
  - Under the Microphone row is the switch Pause music (`pauseMusic`, on
    by default). See "Music pauses while Yonder listens".
- **How Yonder talks.** The rules for how the voice talks, in Markdown,
  such as "one or two short sentences" and "never read file paths
  aloud", are the file `~/.config/yonder/talk.md` of the bridge. The
  bridge writes the default, `bridge/talk.md`, when the file is missing.
  The settings do not show it. The voice changes it itself when the user
  asks for another way of talking ("talk shorter", "stop saying great"):
  it calls `change_talk` with a rule to add, or words of a rule to take
  out, and follows the change at once. Each call reads the file (GET
  `/talk`, which the phone reaches through the relay): the app puts it
  in the section "Voice & Communication Style" of the prompt for Grok,
  OpenAI and ElevenLabs (`loadTalk` and `instructions` in
  `src/App.tsx`), and the bridge adds it to the prompt of the brain of a
  Claude call (`brainArgs` in `bridge/brain.ts`). Any other request
  about how the voice acts still goes to an agent in "yonder". Only how
  the voice talks is in the file. The rules that keep the agents safe
  stay in the code, such as the check of each close in `runTool`, so a
  change cannot remove them.
- **Walkie-talkie:** a switch in the Voice section of the settings
  (`walkieTalkie` in `config.json`, off by default), with a Speech
  model row under it (`speechModel` in `config.json`,
  `bridge/settings/voice.json`). An agent turns it on or off with
  `"walkieTalkie": true` or `false` in `~/.config/yonder/config.json`,
  or with `POST /settings` and `{"key": "walkieTalkie", "value": true}`.
  The app reads it at the start, when the Settings close and when an
  agent opens. It is not in `phone.json`, because the Mac app does not
  read that file. With it on, a chat with
  an agent is voice both ways: the user sends a voice note, and the
  brief of the answer plays aloud when the turn of the agent ends, as
  the Listen item does. The speech to text model runs on the computer.
  - The speech model is a whisper.cpp model file on the computer, such
    as `ggml-large-v3-turbo.bin`. The voice note goes to
    `/dictate` with `stt=whisper` (`stt(true)` in `src/bridge.ts`), also
    from the phone, which then does not use its own recognizer. The
    bridge collects the parts and runs `whisper-cli -np -nt -m <model>`
    on a WAV file at the end (`whisper` in `bridge/dictate.ts`). So the
    words show only at the end, as with Voxtype. On a recent Apple silicon Mac a
    short note took about 0.6 s.
  - An empty Speech model takes a model that another app downloaded
    (`MODELS` of `bridge/recording.ts`). With no model or no
    `whisper-cli`, the speech model of the computer makes the text, so
    the switch never stops a dictation. A path with no file gives the
    error "No speech model at <path>".
  - The voice calls keep their own speech model (`stt()` with no
    argument), because whisper gives no words while the user talks, and
    a call needs them to stop the speech of Yonder.
  - The app holds the audio from the voice note (`holdAudio`) until the
    answer plays, because iOS starts a sound only near a tap. A new
    voice note, a call, another agent or the back button drops it.
  - The reply is not the brief of Listen. The agent answers the last
    message as "I", to "you", in 1 to 4 sentences (`WALKIE` in
    `bridge/main.ts`, `walkie` of `/summary`). Haiku writes it with the
    summary, only while the switch is on. A summary from before the switch
    has no reply, so the brief plays. Listen in the three dots still
    speaks the brief. The first person makes it feel like a talk with
    the agent.
  - After the reply, a Replay button floats over the message box. A tap
    plays the reply again. It goes when the user talks, sends a message or
    opens another agent.
  - The answer speaks with `/speak`, as Listen: it needs `XAI_API_KEY`
    on the computer, or a staff account.
  - `bun bridge/dictate-check.ts` checks the whisper path when a model
    and `whisper-cli` are on the Mac.
- **Dictation:** the big talk button (`Talk` in `src/App.tsx`), on the
  Mac and on the phone, when no call is live. It is in the New agent
  view of the + button, and the microphone button at the right of the
  prompt box of an agent opens it. On the Mac, ⌘D in an open agent opens
  it too, when no call is live.
  The dictation starts when the view opens. A tap on the orb or Enter sends the words, and Escape drops
  them. `Talk` uses `useDictation`. A back or a call while the
  microphone starts also stops it.
  - The phone makes the words itself
    (`dictateOnPhone` in `src/dictate.ts`). The iPhone uses the speech
    recognizer of iOS (`SFSpeechRecognizer`, `Dictate.swift`, the
    `dictation` command of `ios/src/lib.rs`), on the iPhone when iOS has
    the model for the language. Android uses its `SpeechRecognizer`
    (`Dictation.kt`, `YonderAndroid.dictation`), the one on the phone
    when the phone has one (Android 12 and later), as "Hey Yonder" does.
    So the sound does not go to the computer. Else a Windows bridge
    fails with "Press Windows + H to dictate on Windows."
  - An iPhone with iOS 26 or later uses `SpeechAnalyzer`
    with `SpeechTranscriber`, as the Mac does. It works only on the
    iPhone, so iOS asks only for the microphone. The prompt for speech
    recognition says that the speech goes to Apple, also when it stays
    on the iPhone. The first dictation in a language
    waits while iOS downloads the model. An older iPhone, or a language
    with no model, uses `SFSpeechRecognizer` and its prompt.
    The first note of a dictation in `call.log` names the recognizer.
  - The page asks the phone for the words and the level of the orb each
    50 ms (`start`, `poll`, `stop`, `cancel`). A task of the recognizer
    ends after a pause, so a new one starts, and its words go after the
    old ones, as in the fast words of `yonder-dictate`. On the iPhone
    the new request gets the sound at once, so no word is lost between
    two tasks. After the stop, the recognizer gets 1.5 s for the last
    words. iOS adds the punctuation. Android has none.
  - From iOS 18 a task of the recognizer also goes on after a pause, but
    its words start again. The result at the end of each utterance has
    metadata (`speechRecognitionMetadata`), and it is not final. The
    next results have only the new words. So `Dictate.swift` keeps the
    words of each utterance at that result. The last result of the task
    repeats the last utterance with the same start
    (`speechStartTimestamp`), and it does not go in again. Else a long
    dictation with pauses loses all but its last utterance. macOS 26
    does the same. A recognizer that gives no metadata before its end,
    as on iOS 17, keeps the words at the end of each task. The fast
    words of `yonder-dictate` have the same fix.
  - The iPhone gives the loudest 20 ms of the sound since the last poll
    (`db`), and the page makes the bar of the orb from it with `QUIET`
    and `LOUD` of `src/dictate.ts`, as on the Mac. So a new tune of the
    orb goes over the air. The level of the whole buffer of the tap,
    about 100 ms, is quieter than the 20 ms frames of the Mac, and with
    it the orb barely moves. `call.log` gets the "first voice" (a bar of 0.25 after
    the 700 ms of the chime), the size of the first buffer, the loudest
    `db`, and the longest time between two polls.
  - On the Mac the first sound comes in about 250 ms. Each dictation, on the Mac and
    on the phone, also writes to `call.log` the first frame of the orb,
    the frame where the orb gets the voice, and at the end the count of
    frames and the longest gap between two (`watchOrb` in
    `src/dictate.ts`). A late "the orb gets the voice" after an early
    "first voice" tells that the page drew late, not the microphone.
  - A voice on the MacBook microphone can stay under -45 dBFS, so a
    fixed scale from -50 to -30 dBFS barely moves the orb. So the bottom
    of the scale
    follows the silence of the room (`scale` in `src/dictate.ts`): it
    falls at once to a quieter frame and rises 1 dB each second. The bar
    starts 6 dB over that floor and is full 20 dB over the start, and it
    never starts higher than -50 dBFS. Each end writes the floor and the
    loudest dBFS of each 500 ms to `call.log` ("levels").
  - On the iPhone the page plays no sound during the dictation and does
    not touch `navigator.audioSession`. The start chime plays in the
    audio engine of `Dictate.swift`. Else the microphone of iOS gives
    no sound. The engine starts again after a change of
    the audio or the end of an interruption. Each poll gives the events
    of the audio (`notes`: the first buffer, an interruption, a restart),
    and the page writes them to `call.log`. The end of a dictation lets
    go of the audio session of iOS.
  - A start whose microphone reads 0 Hz tries again with a new audio
    engine each 0.1 s, for up to 1 s. The microphone can read 0 Hz while
    the route changes, as when AirPods change to their microphone. If
    it still fails, the start lets go of the audio session, so the music
    of another app plays again. The error then names the cause when iOS
    refused the session ("the microphone is busy: …").
  - The iPhone asks one time for the speech recognition
    (`NSSpeechRecognitionUsageDescription` in `ios/Info.ios.plist`).
    Android asks for the microphone through the web view, as at the first
    call, when it does not have it yet. The Android manifest has a query
    for `android.speech.RecognitionService`, because from Android 11 an
    app sees the recognizer only with it.
  - The bridge still makes the words on the Mac, and on the phone when
    the user chose Parakeet (a model of the Mac), Soniox or
    Deepgram (only the bridge has their keys). An older app with no
    `dictation` also uses the bridge. The microphone that waits for a dictation
    (`warmMic`) and the sound for an offline Mac (see the outbox) are
    only for that path now. The Claude call (`src/brain.ts`) still
    hears the user through the bridge.
  - The button is the orb (`src/Orb.tsx`), our own design in plain
    SVG, with no canvas. It is two thick wobbly rings, as a circle drawn
    by hand (like the logo of Headspace): an ink ring inside and a red
    ring (`--red`) with a red glow outside. In dark mode the ink ring is
    `--text`. In light mode the orb is a neon light: a white ink ring
    with a pink rim, a hot pink ring (`#ff2d55`) with a wide glow of
    three blurs, and a soft pink wash behind them. Both rings follow
    the same shape, but the red ring drifts a little in its own way, so
    the rings overlap and part as in a print that is a little off. The
    level of the microphone (through the gate of `size` in
    `src/Levels.tsx`, then a square root) makes the rings bounce and
    wobble more, through two springs of Motion (`useSpring`) with a low
    damping, so the rings move smoothly and overshoot a little. The red
    spring is softer, so the red ring follows the voice a little late.
    Without a voice they move slowly. Small dots of light (a radius of
    0.4 to 1.2) leave the ring at random places, drift slowly out a
    little to the side, and fade (a sine of their age). Each dot drifts
    a little at random on each frame. Without a voice about two come
    each second. A voice sprinkles out up to about 40 more each second,
    and it multiplies the speed and the shake of all dots by up to four,
    as a wind. One dot in three has the color of the ink ring, the
    others are red. The dots are SVG circles in a group under the rings.
    Each glow is a CSS `blur()` on an SVG of its own: the orb is a stack
    of five SVGs (`far`, `mid`, `near`, `rim` and `sharp`), and each one
    has copies of the rings. Only `sharp` has the dots, and a thin pink
    stroke gives the white dots their rim in light mode. The dots fly
    over the whole box, so a blurred layer with dots draws and blurs its
    whole box again on each frame. On a Galaxy S9 a frame takes about
    57 ms with the dots in `near` and `rim`, and about 27 ms without.
    `app.css` gives each layer its blur and hides the parts that a theme
    does not use. The SVGs have `will-change: transform`, so WebKit
    gives each blur to the GPU, and each frame draws only the plain
    paths. The glows are not SVG filters, because WebKit draws an SVG
    filter on the CPU again on each frame. The microphone icon is in
    the middle until the dictation starts. The box of the orb is 3.125
    times the button (500 px, one pixel for each unit of the SVGs), so
    that the glow and the dots are not cut, and the button has no
    shadow. Under it, a gray "Tap to send" shines (a light band moves
    across it, as the ShinyText of React Bits), or the line says what
    to do. Under that line, the words show in 20 px text in a box of two
    lines: the newest line is at the bottom, and the older lines go up
    with a spring and fade out at the top. The text area has a fixed
    height, so the orb does not move.
  - In an agent, a small talk bar takes the place of the prompt box,
    and the Summary and Chat views stay on the screen, so the user can
    read the chat while they talk. The bar has the orb at 35 % of its
    size (56 px, with CSS `zoom`, so the blurs and the dots keep their
    look), and the status line under it, but no words. No line is on
    top of the bar, also on the Mac. Its rings move
    up to 2.5 times more for a quiet voice (`boost` of `Orb`), because
    at 35 % the same voice moves them only a third as many pixels. The
    small orb pops in faster (`orb-pop-fast`, 0.4 s): it starts at half
    its size, with no hold as a dot. Else it shows long after the
    microphone is on (about 0.25 s). The boost is a compressor (`lift`):
    a full level stays at 1, because a plain multiply makes a loud voice
    huge. On the phone the paper clip is at its left, and the X is at
    its right. A tap in the bar sends, and a tap on the chat does not.
    The big talk view hides the chat, so it is only for a new agent.
    While the user talks, the words so far fill a bubble of the user at
    the end of the chat and of the texts, after the text that was in the
    box, as the message that goes. A new word keeps the end in view only
    while the user is there: a user who scrolled up keeps the place,
    and the bubble fills below. The words go
    to the agent after the text that was in the box, and the Chat view
    opens at the end of the chat. The Chat panel loses its scroll
    position while it is hidden, so the view goes to the end again in
    the next frame. Else on the phone the chat stays at the top after a
    voice note from the Summary view. Escape, the X or a call closes the
    talk bar and drops the words. The back button goes back to the
    agents, and also drops them. The microphone button
    is 36 px, so that a thumb hits it. On the phone the prompt box is
    as the message bar of Signal: a round paper clip at the left, and a round
    text field with the microphone (an icon of 40 px) inside it at its
    right. A padding of 14 px lifts both off the bottom edge. When the
    box has text, the microphone hides, and a round blue send button
    of 44 px with a white arrow shows outside the field at its right.
    It sends the message and keeps the keyboard open. The Mac has no
    send button. The send button shows also when the box is empty and
    attachments wait, such as a location or a photo, so that they can go
    alone. Then the microphone stays in the field: only words hide it.
    A tap on the edge of the box, as next to or under the send button,
    puts the cursor in the field. It does not open the attach sheet,
    although the box is a label, and the first button of a label
    without a "for" is its control: the plus. A long word, as a pasted
    code, breaks onto the next line in the field. Else the field grows
    to the width of the word and pushes the send button off the screen.
    The words in the field are in the font of the app at
    15 px, not in mono at 16 px.
  - A small Cancel button floats at the bottom of the talk view, in
    the New agent view and in an agent. It closes the view and drops
    the words. Cancel is a round X with the look and the size of the
    paper clip and the menus (26 px, and 36 px on the phone), with
    24 px of space above it. On the phone, the X and the menus stay
    above the home bar: the New agent view stops at `--under`. Else on
    Android the X sits on the buttons of the navigation bar. While the
    dictation is on, the status line says "Tap to send": a tap on the
    orb or anywhere else in the talk view sends the words, but a tap on
    a button, a link or a menu does not.
    The status line under the orb stays on one line, and an end that
    does not fit becomes "...". The New agent view says "Tap and talk.
    It starts in" and the project.
    While the talk view is open and no call is on, the call button and
    the + button are hidden, because they have no use there.
  - `src/dictate.ts` records with the worklet of the calls, without echo
    cancellation, so macOS starts no voice processing and the first words
    are not lost. It makes PCM16 at 16 kHz (32 KB for each second) and
    sends a part each 150 ms to `POST /dictate?id=...` of the bridge, the
    last one with `end`. The phone sends through the relay. Each answer
    holds the text so far: the text of the part before it, because the
    helper needs a moment for the new part.
  - `bridge/dictate.ts` runs `yonder-dictate` for each dictation and
    writes the parts to its stdin. The helper (`src-tauri/dictate/main.swift`,
    built by `build.rs` as `yonder-wake` is) makes the text with the
    `SpeechAnalyzer` of Apple (macOS 26 and later), on the Mac only, in
    the language of the Mac. The first use on a Mac downloads the model.
    The bridge finds the helper next to the compiled bridge, or in
    `src-tauri/binaries/`. It stops a helper 30 s after its last part.
    `bun bridge/dictate-check.ts` checks the helper with `say`.
  - A dictation with no sound ends at once with no text.
    `SpeechAnalyzer` never ends an input with no sound. Else the helper
    stays, its caller waits, and the notch leaves one helper after each
    dictation with no sound. The check of the helper tests this case
    too.
  - The helper uses `SpeechTranscriber`, the newest speech model of
    Apple. The macOS 27 SDK has no newer one. It does not use the
    `fastResults` option, which gives each word about 1 s after the
    user says it, but with less accurate words ("write" comes as
    "right"). The fast words of `SFSpeechRecognizer` already show while
    the user talks. In a test with `say`, the last text came 0.1 s after
    the end of the sound, with and without the option.
  - Settings, Voice, Speech to text (for each user, with only the models
    whose key or helper the computer has) picks the model of the dictation and of the Claude call: Apple (the helper), Parakeet (see below),
    Soniox (`stt-rt-v5`) or Deepgram (`nova-3-general`). Each device keeps its choice in localStorage (`stt`),
    and the app adds `&stt=soniox` or `&stt=deepgram` to each
    `/dictate` (`stt()` in `src/bridge.ts`). The bridge then opens one
    WebSocket for each dictation or turn, and sends the parts to it.
    It reads `SONIOX_API_KEY` or `DEEPGRAM_API_KEY` from
    `~/.config/yonder/.env`. With no key, the dictation fails with
    "Put SONIOX_API_KEY=... in ~/.config/yonder/.env". The Grok, OpenAI
    and ElevenLabs calls hear the user with their own models, so the
    choice does not change them.
  - Parakeet (`&stt=parakeet`) is a better speech
    model on the Mac. The bridge then runs `yonder-parakeet`
    (`src-tauri/parakeet/main.swift`) in place of `yonder-dictate`,
    with the same stdin and the same JSON lines. The model is Parakeet
    TDT 0.6B v2 of NVIDIA, English only, through the Swift package
    FluidAudio, with Core ML on the Neural Engine. No sound leaves the
    Mac. After each 0.5 s of new sound, the helper makes the text of
    all the sound again, so the words show while the user talks. The
    first dictation downloads the model (about 450 MB) to
    `~/Library/Application Support/FluidAudio/Models`.
  - The choice is a dropdown with three Parakeet
    versions: "Parakeet v2" (`parakeet`, English only), "Parakeet v3"
    (`parakeet-v3`) and "Parakeet ultra" (`parakeet-ultra`). v3 and
    ultra also know 24 more languages of Europe. The bridge gives the
    version to `yonder-parakeet` as its first argument.
  - A test of 11 local models used 5 minutes of a real voice (screen
    recordings and voice notes), and counted
    the wrong words against a transcript checked by hand. Parakeet v2
    had 1.2 %, Parakeet ultra 1.9 %, Qwen3-ASR 1.7B 2.2 %, Whisper
    large-v3 2.4 %, Apple 2.6 % and Whisper large-v3-turbo 5.7 %.
    Deepgram, in the cloud, had 0.9 %. Apple wrote "one. 5 millimetre"
    for "1.5 millimeters" and "Congress" for "condos". Parakeet made the
    text of 10 s of sound in about 0.1 s.
  - `build.rs` does not build `yonder-parakeet`, because it needs a
    Swift package. Run `swift build -c release` in
    `src-tauri/parakeet`. The bridge finds
    `.build/release/yonder-parakeet` there, so only a Mac with this
    repository has it. `bun bridge/dictate-check.ts` checks it too when
    it is built.
  - Two models make the text. `SpeechAnalyzer` is right more often, but
    it gives the words in bursts about 1 s apart. The older
    `SFSpeechRecognizer` (on the device, as "Hey Yonder") gives a new
    word about each 0.25 s, but it drops and changes more words. So the
    helper shows the words of `SpeechAnalyzer`, and after them the newer
    words of `SFSpeechRecognizer`. When `SpeechAnalyzer` catches up, its
    words take their place and correct them. The fast words go after the
    same word as the last word of `SpeechAnalyzer`, the one nearest to
    its place and 3 words away at most. Else the count of the words
    decides. A count alone loses words, and a match far back repeats
    half of the text. After a pause the fast words start again in the
    same task, as on the iPhone (see above), so the helper keeps the
    words of each utterance. The last text, which goes to
    the agent, is `SpeechAnalyzer` only. Without the permission for speech
    recognition, the text is `SpeechAnalyzer` only. In a test with `say`
    at the pace of speech, a word showed about 0.4 s sooner on average,
    and the text changed 7 times in 3.5 s, not 3 times.
  - On a recent Apple silicon Mac, with an 8-second clip from `say`, `SpeechAnalyzer`
    took 0.25 s and got each word right. whisper.cpp small.en took 1.0 s,
    large-v3-turbo took 1.5 s, and both wrote "foam" for "phone".
    `webkitSpeechRecognition` shows in the WebView of the app but does
    not work outside Safari (WebKit bug 239816).
  - "Hey Yonder" stops during dictation, because it would hear "Yonder"
    in the words.
  - The start of a dictation writes the time of each step to
    `call.log`: the microphone, the worklet, the first frame and the
    first sound. "Hey Yonder" stops before the microphone opens, and
    the context resumes when the restart of the audio suspends it. When
    the orb starts late while the microphone already records, the log
    shows which step waits.
  - The phone opens the microphone of dictation at the tap on the +
    button or on the microphone of the prompt box (`warmMic` in
    `src/dictate.ts`), before the talk view renders. iOS needs about
    0.7 s (sometimes 1.4 s) to open the microphone, so the wait starts
    before the view is on the screen. A microphone that no dictation takes in 3 s
    closes. `call.log` says how many ms the tap came before the start.
    The Mac does not do this, because "Hey Yonder" must stop before its
    microphone opens. During a call, the call has the microphone.
  - The tap comes only about 8 ms before the start, so it saves almost
    no time: the iPhone can still need 0.7 s to 3.6 s for the
    microphone. A microphone that is still open gives its sound in about
    20 ms. So the end of a dictation on the phone
    keeps its microphone open for 60 s (`LINGER_MS`), and the next
    dictation takes it at once. While it waits, the orange dot of
    iOS stays on, and the side buttons change the call volume. It
    closes when the app goes to the background and when a call starts
    (`dropMic`). A kept microphone that ended or went mute is closed,
    and a new one opens. The first dictation after a start of the app
    still waits for iOS. The `microphone` line of `call.log` gives the
    name of the microphone, because a Bluetooth microphone, such as
    AirPods, can open slower.
  - The Mac app keeps the microphone of dictation open, with its
    AudioContext and its worklet, for 5 minutes after the end of the
    last dictation (`MAC_LINGER_MS` in `src/dictate.ts`). The first
    dictation opens it, and each dictation starts the 5 minutes again.
    A switch to another app does not close it, so the orange dot of
    macOS does not turn off and on. A call closes it. So a dictation
    starts to record at once. In
    `call.log` a dictation that opens the microphone waits about
    0.75 s for it and 0.5 s more for the first frame. A dictation that
    takes the open microphone gets its first frame in about 30 ms
    (`call.log`), and in 0 to 20 ms in `bun bridge/dictate-e2e.ts`
    with the fake microphone of Chrome. A change of the microphone in
    the settings opens a new one at the next dictation. The microphone
    does not open with the window, so it stays off for a user who only
    types. So the first dictation after the 5 minutes waits for the
    microphone again.
  - Each line of that log says `phone` or `mac`. It also gives the state
    of the AudioContext when it is made and after the worklet, and if
    its resume ends. With no frame 1.5 s after the start, a `no frame`
    line gives the state of the audio, of the microphone track (live,
    muted, sample rate), of the page and of the audio session.
  - A dictation can get no first frame after the iPhone app comes back
    from the background, and then each later dictation in that page
    fails too. One suspect is an AudioContext that closes when the page
    hides, so the page makes no AudioContext for clicks. A second
    suspect is the AudioContext that `chime(false)` makes at each
    cancel, which closes only when its tone ends.
  - The helper comes with a build of the Mac app (`install-app`). A
    bridge with no `/dictate` answers 404, and the box says "Restart
    the bridge".
  - The bars of the box get the loudness from the frames of the
    worklet (20 ms each), on a log scale: still at `QUIET` (-50 dBFS)
    and full at `LOUD` (-30 dBFS). Dictation has no gain control, so
    one microphone can be 20 dB quieter than another. The top of the
    scale does not follow the loudest frame, else the orb bounces too
    much and is huge for a loud voice. Only the quiet voices get a
    lift: the square root in `Orb` and the `boost` of the small orb.
    The call log gets the loudest frame of each dictation
    ("loudest -33 dBFS"), to tune `QUIET` and `LOUD`.
  - When the last part fails after the stop (the relay or the bridge),
    the words that came so far still go as the text, so the orb
    always sends them.
  - The bars have the color of the text, and their center lines up
    with the button.
  - The relay lets a phone use only the paths in `PATHS` of
    `bridge/relay.ts`, so `/dictate`, `/model` and `/mode` are in it.
    Else the phone says "Dictation failed: A phone cannot use this
    path.", or it cannot change the Minimum, Maximum or Permissions rows
    of the Settings. A change of `PATHS` needs `restart_bridge`.
- **Echo cancellation:** always on. `getMic` in `src/voice.ts` asks
  for echo cancellation, noise suppression and gain control, so WebKit
  uses the voice processing of macOS (VPIO). It keeps the voice of Grok
  out of the microphone, so the user can interrupt Grok. No setting
  turns it off.
  - **The output device matters.** The voice processing uses the
    default output of macOS as its echo reference. With the MacBook
    microphone and the built-in speakers it loads the tuning of the Mac
    (`ispk-imic-misc-ulnk` in the system log), and it works: in a test,
    the voice of the user came through at 0.3 to 0.4, Grok's voice at
    0.001 to 0.015 after about 1 s, and the user's voice during Grok at
    0.3 to 0.4. With an external monitor (DisplayPort) as the output
    it loads a generic tuning (`airp-imic-misc-ulnk`) that turns the
    microphone array down by about 40 dB. Grok then hears nothing: peak
    0.000 to 0.005 in real calls, and 0.002 against 0.011 to 0.020 with
    the silent BlackHole output in a control test. The DELL at 48 kHz
    does not help. The iPhone microphone works with the DELL, because the
    voice processing uses another tuning for it.
  - So the call checks the name of the default output
    (`enumerateDevices`, device `default`). With a built-in Mac
    microphone and an output that is not built-in speakers or
    headphones, the call shows a notice under the call button. The
    `call start` line of `call.log` names the output, or lists all the
    outputs when the page cannot tell the default one.
  - Echo cancellation off made the start worse, not better: WebKit
    prepares a voice processing unit anyway and throws it away after
    about 3 s, which restarts the audio devices again (WebKit bug
    272964). Off also meant that the user could not interrupt Grok.
- **Start of the microphone:** after `getUserMedia`, macOS needs about
  2.2 s before the microphone sends sound, because it rebuilds its audio
  devices for the voice processing. When the page makes its AudioContext
  before the microphone, the stream stops for about 0.7 s two to four
  times in the first seconds (the "mic: no frame for ..." lines of
  `call.log`), and the menu bar shows the microphone go off and on. So
  `openMic` opens the microphone at the click on "Start call", while the
  token and the lists load, and `startCall` makes the AudioContext after
  the microphone. That removed the gaps in a test app, which starts a
  new WebKit audio process each time and gets its first frame only
  after about 2.3 s. Yonder's WebKit audio process stays warm, so its
  first frame comes at once, and the two gaps still come after it. So
  "End call" and the start chime come only when the microphone is
  steady: 2.5 s after it opened, and 5 frames in a row with no gap (at
  most 6 s, then the call goes on). `call.log` says "mic: steady after
  ... ms". Else the first seconds of each call do not hear the user.
- **Start chime:** a call starts with a short tone up, and ends with a
  tone down (`chime` in `src/voice.ts`). The start tone plays on the
  AudioContext of the call, not on a second AudioContext.
  The talk view (New agent, and the microphone of a conversation) plays
  the same start tone when its microphone is on, on the AudioContext of
  the dictation (`dictate` in `src/dictate.ts`). Cancel, a back, or
  Escape while it listens plays the end tone. A send plays no tone. A
  tone on a second AudioContext while the microphone opens is not
  heard. The tone plays at the first frame of the microphone, about
  100 ms after it opens, because the first frame tells that the restart
  of the audio is done. Its level stays at 0.2 through both notes and
  then fades in 0.4 s, so the second note is heard too. The dictation
  sets the audio session of iOS to `play-and-record`, as a call does.
- **A media pause stops the call:** during a call, Yonder's page is the
  "Now Playing" app of macOS (`com.apple.WebKit.GPU`, playing). A media
  pause then suspends the AudioContext of the call, and the microphone
  stops: the play/pause key, AirPods, or a tool that pauses the "Now
  Playing" app when the microphone turns on, and sends play when it
  turns off. Such a tool
  suspends each call, so the call hears nothing and "Connecting…" takes
  6 s, and at the end its play starts the music of another app. So the
  call
  resumes its AudioContext at once when something suspends it
  (`ctx.onstatechange` in `src/voice.ts`). In a test the audio ran again
  13 ms after the pause. The Media Session API does not help: WebKit
  suspends the audio also when the page has action handlers, and the
  page cannot report that it does not play. The Siri daemon
  (`corespeechd`) and the "Hey Yonder" helper also react to the
  microphone, but they do not cause the gaps.
- **Music pauses while Yonder listens:** on the Mac, a call, the
  dictation of the window, and the notch or the voice note pause the
  media of other apps, such as Spotify or a video in Chrome. The media
  plays again 1.5 s after the microphone closes, when AirPods are back
  in high quality, because AirPods with an open microphone play all
  sound in the low quality of a phone call. `hush` in `src-tauri/src/main.rs` does it with
  `media-control` (Homebrew), and without it nothing pauses. The window
  calls `set_mic` (`src/dictate.ts`), the call `set_call_live`, and the
  notch helper prints `mic on` and `mic off`. `hush` pauses only an app
  that plays, never Yonder's own page (`com.apple.WebKit`), and at the
  end plays only the app that it paused.
  The switch Pause music in the settings (Voice) turns the pause off and
  on (`set_audio`).
- **Updates during a call:** The voice agent does not announce results.
  The screen shows the status of each agent. Ask about an agent or a
  project, and the voice agent tells you the result. When an agent starts
  to wait on you, or has a result that needs you, the voice agent asks in
  the next pause if you want an update.
