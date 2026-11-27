# Screens and styles

Yonder has a default screen, a gallery of other screens, and a screen
of the user's own that an agent builds. The design and its gaps are in
`docs/ui-themes.md`.

- Settings › Appearance › Styles lists eight samples, each with a swatch
  of its colors: Yonder (the default), Dashboard, Big button, Terminal,
  Omarchy, Playful, Duet and Grok Bot. There is no Chat sample: a phone
  or a phone.json set to it goes back to the default
  screen, and a new screen starts from the Dashboard. A tap
  shows the sample live, on the real agents, with "Keep Terminal?", Back
  and Keep. With no answer, the screen goes back after 30 seconds.
- Omarchy (`src/ui/omarchy.json`) is the look of omarchy.org: mono type,
  square corners, flat boxes with a line, and no bubbles. The dark look
  is Tokyo Night, the default theme of Omarchy, with the green of the
  site as the accent. The light look is Catppuccin Latte, a light theme
  of Omarchy. The colors come from the CSS of omarchy.org and from
  `themes/*/colors.toml` in the source of Omarchy. The window on Omarchy
  starts on it, and the phones and the Mac start on Yonder (`HOME` in
  `src/look.ts`).
- The padding is the gutter (16 px) in each style, so the padding is
  even. A square at the start
  of a row (the avatar of the account, the swatch of a style, the icon of
  an app) has the gutter at its left, its top and its bottom. The check
  circle of a task row ends at the gutter on the Mac too. With sharp
  corners (Terminal, Omarchy), the number of a task starts at the gutter
  and the buttons of the title bar end at it. Only the Mac app keeps the
  room of the traffic lights (`data-mac` on `<html>`), and its default
  styles keep the buttons of the title bar 6 px from the round corner of
  the window. The window on Omarchy and on Windows has the gutter at both
  sides.
- A style is data, in `src/ui/<name>.json`: the color tokens for the
  light and the dark look, the font, sharp corners (`radius: 0`), the
  density, the glass, the talk layout (`big`: a round call button and a
  call that fills the screen), the tabs and some words. `src/look.ts`
  puts them on the page, and a wrong value keeps its default.
- With the glass off (Terminal, Big button), the tab bar of the phone is
  flat and full width on the bottom edge, and the iPhone does not show
  the floating glass bar of iOS 26 (`src/chrome.ts`). Terminal shows the
  Closed tab. The bar
  has no padding, so the box of the open tab touches the line over the
  bar and the space of the home bar, with no gap over the box. An open agent has no blur at its edges there:
  the top is solid with a line 6 px under Summary and Context, and the
  bottom is solid from 8 px over the message box, because a blur is out
  of place in Terminal. A band of pixels under the header needs the
  native app, because the page cannot read the pixels under its header,
  so the header stays solid. A web-only band
  fails in the iOS 27 simulator with real flicks: a copy
  of the content under the header that a scroll handler moves trails the
  real text by up to one message, and a copy that a scroll-driven
  animation moves stays in step, but iOS WebKit then drops its SVG
  filter (a `filter: url()` with a composited layer under it shows no
  effect, and on the moving layer itself it draws nothing). With sharp corners (Terminal), each
  segmented control is a box with a line and no track, the open choice
  is in reverse video (the color of the text behind the color of the
  page), and the names are lowercase. Summary and Context fill the
  width, each half as wide. Terminal has no red live color of
  its own: the switches, the primary buttons, the links and the running
  dots take its green accent, and red means only a failure, because
  else the switches and Connect look like errors. A compact style (Terminal)
  has denser Settings: rows of 44 px on the phone and 40 px on the Mac,
  and less space between the groups, the headings and the notes. A row
  that wraps grows, so the layout check still finds no overlap.
- Only the default screen has native controls on the iPhone. Each other
  theme (`themed()` in `src/look.ts`) sends one empty state to the
  native chrome, so the tab bar, the round buttons, the switches and
  the dropdowns are the ones of the page, in the look of the theme. The
  alerts are a dialog of the page (`ask` and `message` of `src/ask.tsx`),
  the attach sheet is the sheet of the page (`src/Attach.tsx`), and the
  three dots of an agent open an action sheet of the page
  (`ActionSheet` of `src/ask.tsx`, from the same items as the native
  menu). The camera and the pickers of photos and files stay the ones
  of iOS. With the glass off, these are flat with a line, and the switch
  is small (36 by 20 px, a square knob in the accent); with the mono
  font, they get the marks of a terminal (`>` rows, `*` choices, small
  letters). The screen in use loads from localStorage before the first
  render, so no native control of the default screen shows for a
  moment at the start, also in a scroll. Each action is in the API of a page too: `yonder.attach.*`,
  `yonder.mice.choices()`, and the files and the model, effort and mode
  of `yonder.mice.start` and `yonder.mice.send`. The layout check
  (`bun bridge/screens-e2e.ts`, step 8) opens each of these parts in
  each theme, look and width.
- Each theme works in the light and the dark look: each sample has
  `look.light` and `look.dark`, and a theme does not set the theme of
  the app. Light, Dark and System in Settings › Appearance decide
  (`theme` in phone.json, also set_theme). A page gets `data-theme` and
  the tokens of the look, and both change live.
- The title of the default screen is the project switcher: the
  favicon and the name of the project with two small arrows, as the
  pill of a dropdown, so it looks like a way to the projects. A tap opens the whole Projects tab: All projects,
  Yonder and the starred projects, then the others under a line. The
  selected project has the accent of the theme. A second tap on the
  pill goes back. The Dashboard and each own screen get the same
  switch as `<y-projects>` of the kit (src/OwnScreen.tsx), which draws
  the same page over the screen in its colors, and
  `yonder.projects.icon` gives it the favicons.
- A theme of the user gets a new name in Settings › Appearance › Custom
  themes (the i of the theme, Name), by voice (`customize` with `rename`
  and the name in `words`; a sample becomes a theme of the user first),
  or from a page (`yonder.screen.rename(id, name)`). The folder keeps its
  name, and the next version has the new name.
- On the Mac, an own screen starts under the title bar of 36 px, so no
  page goes under the traffic lights; the title bar stays in the color of
  the screen and moves the window. Before the bridge saves a new version
  of a page, `bridge/screen-lint.ts` opens it in headless Chrome at the
  Mac and the phone size, and a page that throws, does not call
  `yonder.ready()` or cuts a text or a control at an edge becomes no
  version. The reason is in `build.log` and in `customize` with `use`.
- On the phone, the frame of an own screen goes down to the bottom
  edge, under the home bar, and the page gets the space of the home bar
  as the CSS variable `--under` (`src/OwnScreen.tsx`). The Dashboard
  puts it under its tab bar, and `y-page` of
  the kit under the page. Else the tab bar of the Dashboard stops 34 px
  over the edge, and the glass bar of the default screen shows under it.
- Duet and Grok Bot (`src/ui/duet.html`, `src/ui/grok-bot.html`)
  are own screens that give each agent a picture. Duet has
  the look of Claude Duet: warm paper, a serif title, and a pixel
  creature with a shell color, a hat, eyewear and an extra. Grok Bot has
  the look of the Grok Bot app: a shape and a color. A tap on the name in a chat opens the edit
  sheet: the name, the color and the picture. The sheet fits with no
  scroll, also on an iPhone SE, and each placeholder is one short word,
  so it never wraps. The page never scrolls, and a chat at its last
  message stays there when the keyboard makes it shorter. The button of
  the user is `.self`, not `.me`. Else its rule also matches the bubbles
  of the user in Duet, which are then 48 px wide, one letter on each line.
- On iOS, the frame of an own screen covers only the part of the page
  over the keyboard, as `main` does (`html[data-viewport] .own-screen`
  in `src/app.css`). A text field in the frame tells the app that it
  has the focus (the op `typing` of the SDK in `src/OwnScreen.tsx`), and
  the app runs its own keyboard code (`src/main.tsx`) with the attribute
  `data-frame-typing`, also when iOS 26 makes the web view shorter. Under
  the keyboard the page gets `--under: 0px`, and an update of the front
  end waits while the user types in the frame. So the themes move as
  intended when the keyboard opens and closes. Else iOS slides the
  whole frame up, header and all.
- An own screen (the Dashboard, or a page of an agent) is a page in a
  sandboxed frame over the whole default screen (`src/OwnScreen.tsx`).
  It reaches Yonder only through `window.yonder`: the agents, a chat, a
  message, a new agent, the call, the Settings, and the tools that its
  file names. It gets no network, no phone ability and no storage.
- The picture of an agent: a page gives an agent a
  shape and a color with `yonder.mice.avatar(id, { shape, color })`,
  and `yonder.mice.list()` gives it back as `avatar`. The bridge keeps it
  on the worker (`avatar`, or `avatars` of the state for a session that
  Yonder did not start) through `rename_worker` with `shape` and
  `color`, so each phone and each Mac show the same picture. The bridge
  checks only the form, because the page owns its shapes. Each new
  agent gets a surprise picture: Duet
  and Grok Bot save one for each agent with no picture, with the id of
  the agent as the seed, so two phones save the same one. An agent of
  less than 5 seconds waits, so the look that the user picked for a new
  agent on another phone comes first. A new agent from the + button
  opens at once with a surprise look. A picture of the other screen
  keeps its color, and gets a shape or a creature from its own shape.
- `ui` in phone.json names the screen in use: a sample, `my-chat` (the
  newest good version) or `my-chat@2`. `customize` writes a screen of
  the user with its version, so each new version changes the file and
  reaches the phone. The screens of the user are
  folders in `~/.config/yonder/ui/<name>/`, with one file for each
  version (`<n>.json`, and `<n>.html` for a page). A version never
  changes (`bridge/ui.ts`, the route `/ui`).
- The screens folder: a folder in
  `~/.config/yonder/ui/` with a `screen.json` is the source of its
  versions. The user can drop a theme or a whole
  front end into it, and the phone gets it over the air. Each 3 seconds the
  bridge looks for a change in the `ui/` folder of its own config
  folder. It runs `bun run build` when
  `package.json` has a build script (log in `build.log`), puts each
  local script, style sheet, picture and font into the page, and saves
  the next version when the page changed. A change of the last 2
  seconds waits, so an agent that writes several files makes one
  version. A new version of the screen in use shows on the phones at
  once. A page is 4 MB or less, and 1 MB or less when gzipped, because
  the relay sends one frame of 1 MiB. `/ui?name=` gzips a page larger
  than 500 KB, and the phone unzips it. The phone keeps one version of
  each screen in localStorage.
- Appearance has only the style choices: the theme, the color, Styles,
  Custom themes and the fonts. Yonder
  in Styles is the default screen, and `customize` with `change` makes a
  sample the user's own by itself, so the page has no Make it mine and
  no Back to the default screen.
- A row of the Settings never lets its label and its control overlap:
  the label keeps at least its longest word, and a control that does
  not fit beside it wraps under it, at the right. A long value, such as
  the name of a computer, ends with an ellipsis. Else, for example,
  Minimal, Normal and Verbose cover the label Detail
  in the Terminal theme. The layout check of `bridge/screens-e2e.ts`
  opens each section in each theme, look and width (320 and 375 pt).
- The theme check: `bun bridge/themes-e2e.ts` runs the
  app of `src/` under Vite, paired through the relay, in WebKit (the
  engine of the iPhone) and in Chromium, on a test bridge with the
  made-up data of `bridge/fixtures/themes-mock.ts`: seven agents, a
  chat and an approval. A stand-in for Claude Code lists the running
  agents and starts nothing, so the check uses no credits. It takes
  three pictures of each sample in the light and the dark look (the
  agents, an approval and a chat) into `docs/themes/<theme>/`, for a
  theme gallery: each theme shows the same data. Then it checks Duet
  and Grok Bot on an iPhone 17 Pro, an iPhone 17 and an iPhone SE: the
  page never scrolls, the edit sheet fits, the bubbles sit on their
  side, each placeholder fits on one line, and the frame follows the
  keyboard. A browser has no keyboard, so the check gives the app the
  sizes of the keyboard of iOS, and the app runs its own keyboard code
  with them. It needs the browsers of Playwright (`bunx playwright-core
  install webkit chromium`). The themes must work very well on mobile.
- Each sample has the Apps tab: Yonder, Playful and
  Terminal show all the tabs, Big button lists it after its two tabs,
  and the page of the Dashboard has an Apps tab: `yonder.apps.list()`
  gives the apps, and `yonder.apps.open(id)` opens one over the page,
  in the viewer of Yonder.
- The bar of a preview ("Keep Terminal?") has a place of its own: an own
  screen ends above it, and the round buttons over the tab bar hide
  while it shows. Else the line under the message field of a page
  and the edge of the + button show under the bar.
- Custom themes, under Styles, lists the screens of the user: a swatch,
  the newest version and its age. A tap shows the theme live, as a
  sample. The i opens its versions, with Use on each for a rollback,
  and Delete, which asks first (`customize` with `delete`, and `delete`
  of `/ui`). The Settings have no Build field, because a new theme
  comes by voice.
- "Build me a screen with only one chat" by voice
  (`customize` with `new` and the words): an agent, "Screen builder",
  starts in a new source folder with the rules (`CLAUDE.md`) and the
  sample as version 1. It changes `screen.json` and `index.html`, tests
  the version with `/ui?name=<name>&try`, and calls `customize` with
  `use`. The guide for the agents is the skill `yonder-screens`
  (`bridge/skills/yonder-screens/`). The bridge writes it into
  `~/.claude/skills/` at each start, so each Claude Code agent finds
  it, and serves it as one page at `/ui?guide`. The `CLAUDE.md` of each
  screen folder only points to it, and the bridge writes that note
  again at each start. `POST /ui` with `{"action":"check","name"}` runs
  the build and the check of a folder with no new version.
  `bun run check-skill` fails when the skill and the API of a page do
  not match, and the GitHub check runs it.
- Import (`customize` with `import` and `from`): a folder on the Mac
  stays where it is, as the link `source/` in the screen folder, and a
  Git URL is cloned into `source/`. A folder with no `screen.json` gets
  one as an own screen. Each change of the source reaches the phones.
- The voice agent and the agents have the `customize` tool: `list`,
  `use`, `reset`, `fork`, `versions`, `new`, `import` and `change`.
- A change in one step (`customize` with `change` and the words, such as
  "make the buttons bigger", and `screen` for a screen that is not in
  use): when the screen is a sample or the default, the bridge forks it into a screen of the user and uses it.
  Then an agent, "Screen change", starts in the folder of that screen
  with the words, changes only what the user asked, tests the version
  and calls `customize` with `use`. Each old version stays, so `use`
  with `name@version` goes back. So the
  voice agent needs one call for each change of the look.
- The floor: a page that does not call `yonder.ready()` in 5 seconds, or
  throws before it, is marked bad, and the phone goes back to the newest
  good version, else to the default, with a toast. A shake asks "Undo
  the screen change?" for 10 minutes after a change, and "Use the
  default screen?" on an own screen. The quick action "Default screen"
  of the app icon clears `ui`. It needs TestFlight 2.93.519 or later.
- One front-end API (`src/api.ts`, guide in `docs/screen-api.md`):
  the default screen and each page reach the agents, the chat,
  the call, the projects, the usage, the approvals, the settings, the
  screens, the phone abilities and the tools of the bridge only through
  `yonder`. The default imports it, and a page calls it through the
  frame (`src/OwnScreen.tsx`). So the default is one front
  end among many. `bun src/api-check.ts` counts the direct calls left in
  the default screen. It is 0, and the check fails
  when the count rises.
- A page gets the kit of Yonder (`src/kit/`): CSS parts on the theme and
  the icons of `src/icons.tsx` (`yonder.icon(name)`).
- A page uses a phone ability only when `abilities` of its screen.json
  names it, and the user says yes once on the phone. A new pick of the
  screen asks again. An error of the ability counts as a no.
- Speech to text in a page (`yonder.dictation`): the
  dictation of the prompt box (`src/dictate.ts`) through the frame,
  with the ability `dictation`. The words so far come as events, and
  the stop gives the text. A call stops it. The Dashboard has it on the
  button of its text box: the microphone when the box is
  empty, a stop while the user talks, which sends the words, and Send
  when the box has text. Each screen has a new agent, the chat, the
  call and the dictation.
- The Dashboard sample has no Call button. A call that starts in another way (the Live Activity,
  the Action button, Siri, CarPlay or the Watch) shows LIVE in the top
  bar of the Dashboard, with Mute and End. The sound of a dictation while the computer is offline
  is lost in a page, and the prompt box of the default keeps it.
- Settings from one schema: `bridge/settings/` has
  one file for each section, as one folder for each page of the
  Settings, with the name and the icon of the section and its settings:
  the key, type, default, label, help, store (config.json or
  phone.json) and control of each. The Settings list the sections from
  these files, in the order of `bridge/settings/index.ts`, as the
  Settings of VS Code do. A section with
  `"home": false` stays out of the home list. The phone draws
  General, Steer, Tunnel, Summaries, Detail, Group tool calls, Agent
  names, Word for an agent and the Title bar from it, and `/settings`
  checks and writes a value of config.json. A setting with no type, such
  as `agentName`, uses the check in the bridge. The user adds settings in
  `~/.config/yonder/settings.json`, with no new build. A page reads the
  schema with `yonder.settings.schema()`, and changes only the settings
  of the phone. A setting with `"store": "claude"` is a key of `settings.json` of
  Claude Code, such as Advisor (see Profiles).
- What is left is in "The handoff" of `docs/screen-api.md`.
- Sync of the settings: the settings
  follow the user to each phone, Mac and PC through the Yonder account,
  encrypted on the server, with no sync code. `bridge/sync.ts` backs up
  each setting of the schema with `"sync": true` and each screen of the
  user (the newest good version) to `/api/app/sync` of yonder.so
  (the yonder.so backend, private). The server keeps one object for
  each account, gzipped and encrypted with Fernet, with a version.
  - What syncs: the model and effort ranges, the default model, Steer,
    Summaries, the word and the names of the agents, the Context
    detail and groups, the theme, the color, the fonts, the Title bar,
    the screen in use, the screens of the user, and the profiles with
    no variables, folder or program (see Profiles). Each phone takes its
    look from phone.json of its computer, so the phones follow.
  - What stays on each device: the permission mode, the Tunnel, the
    default folder, the CLIs, the default profile, the variables of the
    profiles, the logins, the wake word,
    the microphone, Face ID, the schedules and the projects (they name
    the folders of one computer). A key, a token, `vault.json`,
    `relay.json` and `.env` never sync: the sync reads only the marked
    keys, never a whole file.
  - The bridge syncs. The app gives it the sign-in (`giveSync` in
    `src/account.ts`, POST `/sync`), as it gives the tunnel, and a
    paired phone gives its own to a computer with none. `sync.json` in
    the config folder keeps the sign-in with mode 600. Sign out in the
    app of the computer ends the sync there. A phone cannot sign a
    computer out.
  - Each key has the time of its last change, and the newer change
    wins, key by key. A delete is a value of null, so a deleted screen
    goes from the other devices too. A device that read an older
    version gets 409 and merges again. The first sync of a device is a
    restore: the account wins, and the device adds only the keys that
    the account does not have. So the first device that signs in sets
    the backup.
  - A change goes up within 30 seconds. A change of another device
    comes within 10 minutes. `GET /sync?run` syncs at once.
  - The Sync settings section of Account has the Sync switch (`sync` in
    config.json, on by default), which turns it off for one device. The
    line under it says when the last sync was, or why it failed. Three
    plain lines tell what syncs (the settings, the look, the custom
    screens), what never syncs (secrets and keys) and what stays on each
    device (folder paths, CLIs, logins), so that sync is clear to the user.
  - Checks: `bun bridge/sync.ts` (the merge) and `bun bridge/sync-e2e.ts`
    (two bridges and a fake yonder.so, with no credits).
- The phone reads `/agent-name` through the relay. Else the phone does
  not get the word of the user for an agent, such as "helper".
