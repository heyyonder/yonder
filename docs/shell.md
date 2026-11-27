# The thin shell

The rule: most users get Yonder from the App Store or Google Play, and they never build it. So the store app is a thin shell
that never limits what people can do:

1. The shell gives each ability of the phone to the bridge and the agents
   through one general API with the yes of the user.
2. The Mac of the user shapes the app: the layout, the tabs, the colors,
   the components and the words. The bridge and the config drive it, and
   it reaches the phone over the air with no notice.
3. Only web content and data come over the air. No native code is
   downloaded.

The first ability, `get_location`, set the pattern of the channel. The
look config, the `customize` tool, the theming, the Canvas and the pinned
tabs are in `docs/canvas.md`.

## Abilities

One channel for all abilities, as `get_location` has:

- The bridge keeps each ask in memory: `{ id, ability, args }`. It asks
  the phone of the live call, else the phone of the last message, else
  the phone that polled last.
- The phone takes its asks with its `/show` poll, every 3 seconds while
  Yonder is open, and answers with the result or `{ error }`.
- The phone names the abilities that it has in each poll, from the page
  (`src/abilities.ts`), which checks the version of the native shell. So
  an old app never gets an ask that it cannot do, and the bridge says so.
- The agents get one MCP tool, `phone`, with the ability and its args. The
  voice agent keeps a named tool where its words matter, such as
  `get_location`.
- A log line for each ask names who asked, the ability and the outcome,
  with no data (`phone.log`, which replaces `location.log`).
- An artifact of the Canvas never calls an ability. Only the bridge and
  the agents do (App Review Guideline 4.7.2).

The yes of the user:

- An ability that shows its own iOS screen gets its yes from that
  screen: the camera, the share sheet, the contact picker, the event
  editor, Face ID, the file picker.
- An ability with an iOS permission asks once, as iOS does: location,
  microphone, notifications, photos.
- Location goes out only when the user asks for it.
- A read of the clipboard shows the paste prompt of iOS.
- An ask that needs the screen while the app is in the background waits
  for the user: the phone gets a push, and the ask runs when the app
  opens.

| Ability | Today | The native batch adds |
|---|---|---|
| location | web geolocation | nothing |
| take a photo | page camera input, only after a tap | `take_photo`: the camera with no tap on the page |
| pick or read photos | `recent_photos`, `photo`, the page picker | nothing |
| save a photo | the page share sheet, only after a tap | `save_photo`, with add-only access |
| record sound | `getUserMedia` | nothing |
| notify | the notifications plugin | Approve and Deny on a push: the category, and the choice of a push to the page |
| Face ID | the biometric plugin | nothing |
| haptics | the plugin, impact only | `haptics:default`: also success, warning, error and selection |
| clipboard | the page, only after a tap | `pasteboard`: read and write with no tap |
| share | `navigator.share`, only after a tap | `share`: text, link and files with no tap |
| files | the dialog plugin picks; the share sheet saves | nothing |
| contacts | none | `pick_contact`: the picker of iOS, which needs no permission |
| calendar | none | `add_event`: the event editor of iOS, which needs no permission |
| open an app or a Shortcut | the opener plugin: web, mail and phone links | `open_url` for each scheme, and the `yonder://` scheme for the answers of Shortcuts |
| the state of the phone | none | `device`: battery, Low Power Mode, heat, network |
| the badge of the app | none | `badge` |
| keep the screen on | none | `keep_awake` |
| scan, sign in, buy, dictate, Live Activity, CarPlay | built | nothing |

A Shortcut is the way to each ability that the shell does not have, such
as HomeKit, Health or Reminders: an agent runs a Shortcut of the user by
name, and the Shortcut sends its answer back to `yonder://`.

## The look and the layout from the Mac

- The look lives in `phone.json` on each Mac: the theme
  tokens, the tabs, and the words. `src/phone-config.ts` syncs it.
- `/front` gives a version of `phone.json`, so the phone syncs a change
  in about 5 seconds, not only when it opens.
- The page turns the tokens into CSS variables. It sends the colors to
  the native parts as props, so a new theme also colors the native parts
  with no build.

The native kit, version 5 of the native chrome (`src/chrome.ts`,
`ChromeState.swift`). Each new prop has a fallback, so an older app keeps
the page control:

- A button: visible text, an SF Symbol or an icon of the page, a shape
  (circle, capsule, rounded rectangle) with its width and height, the
  color of its glass, the color of its icon and text, a badge, and the
  prominent glass.
- A tab: a badge and an SF Symbol. The bar: the color of the open tab.
- A segmented control, as a twin of the page control.
- An alert or a confirmation dialog from props: a title, a message and
  the buttons. It gives back the button.
- A sheet from props, for an approval and any short form: a title, the
  agent, rows of a label and a value, an amount, a field for a one-time
  code (iOS fills it from Messages), choices, a terms link, two buttons,
  Face ID before the answer, and an end time. It gives back
  `{ button, value, choice }`.
- The cover of a new load: a picture of the screen over the web view
  while a new screen loads in front, so it comes in with no flash.

## Live delivery

This part is built ("Live changes of the screen" in `docs/wiki/install.md`):

- The bridge builds the screen after each commit that changes it.
- A new screen with only new CSS goes into the running page at once,
  also during a call.
- Another screen loads when the app goes to the background. With the
  cover of version 5, it also loads in front after 3 seconds with no
  touch.
- A screen that fails goes back to the last good screen.
- A store user has no source on the Mac. Their app changes through the
  config and the web content of the Canvas, which come over the air in
  the same way, and the screen comes with each new version of the Mac
  app.

## App Store rules

- Over the air: only JavaScript and CSS that WebKit runs, and data. Apple
  allows it when it does not change the main purpose of the app
  (Developer Program License Agreement 3.3.1(B), Guideline 2.5.2).
- Each ability is a feature of Yonder itself, with the yes of the user.
- An artifact of the Canvas gets no ability (Guideline 4.7.2). A screen
  of the user gets only the abilities that its screen.json names, each
  after a yes of the user on the phone, through the API of Yonder
  (docs/screen-api.md).

## The native batch

One build of the iPhone app for all of the above. Ask the user before the
build for the iPhone and before TestFlight. The Android app gets the same
abilities through the page, and its native gaps in a later APK.

The code is on `main`, and its commit has the line
`Native-Optional: yes` (`needs` in `version.ts`): each new part has a
fallback in the page, so the phones with an older app keep their new
screens over the air. The parts:

- `Abilities.swift`: the abilities `share`, `copy`, `paste`, `photo`,
  `save_photo`, `contact`, `event`, `device`, `badge`, `awake`,
  `confirm`, `open`, `sheet` and `push_action`. One command, `ability`,
  runs each one, so a new ability needs no new command. `abilities` lists
  them for the poll of the page.
- `KitSheet.swift`: the sheet from props, for an approval of the Canvas
  and any short form.
- Version 5 of the native chrome (`ChromeState.swift`, `GlassButton.swift`,
  `GlassTabBar.swift`): the props of the kit above.
- `native_cover`: the picture of the screen during a new load in front.
- Push: the category `approval` with Approve (Face ID, opens the app) and
  Deny, and a proxy in front of the delegate of the notifications
  plugin, which gives the choice to the page (`yonder:push`).
- The `yonder://` scheme (`yonder:opened` on the page, `opened`), also for
  the new task links (`src/NewTask.tsx`).
- The quick action "Default screen" on the icon: the next start runs the
  screen of the install and clears `ui` of `phone.json`.
- The haptics of success, warning, error and selection.
- CarPlay names the agents with the word of the user.
- `NSPhotoLibraryAddUsageDescription` for `save_photo`. The event editor
  and the contact picker run outside the app on iOS 17 and need no
  permission.
