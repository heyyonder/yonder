# Mac app

- Tauri wraps a React web app. Start it from the Dock.
- The close button of the window only hides the window. Yonder keeps
  running, with the bridge, the menu bar icon, the keys and "Hey Yonder".
  A click on the Dock icon shows the window again. Only ⌘Q (Quit Yonder)
  quits the app.
- Use React and Base UI for the front end.
- Use the light theme by default. The settings switch the light and dark
  theme (on the phone, also a toggle in the title bar).
- The app icon is the Yonder bird: a red cartoon bird with a cream outline
  and black eyes, on a red tile, the red of the "End call" button
  (`--live`, #e5484d). The source art is the red icon of the brand
  files, which are not in the repository. macOS does not round
  the corners of an icon. So the Mac icon follows the macOS icon grid: a
  tile of 824 px with a corner radius of 185 px in a canvas of 1024 px.
  It has a soft shadow and a transparent area around it. `bunx tauri icon`
  made the sizes and `icon.icns` in `src-tauri/icons/` from that PNG of
  1024 px. The tray icons (`tray.png`, `tray-live.png`) are the orb (see
  Menu bar).
  The favicon (`public/favicon.svg`) is the face of the bird with its
  cream outline, on a transparent background, from the face of the
  brand files with a square viewBox.
  The landing page uses the same file.
- A new install of the Mac app opens on the Welcome screen (`Welcome` in
  `src/PairPhone.tsx`), as the first screen of the phone app: the bird on
  the red, "Yonder", a Pair phone button and Skip. Pair phone opens the
  QR code of File > Pair Phone. The screen shows only while the bridge
  has no paired phone (`GET /relay`) and `welcomed` is not in
  `localStorage`, so a Mac that already has a phone never shows it. A
  click on either button sets `welcomed`. An account is not necessary:
  the account is only for voice calls.
- The first run (`src/Setup.tsx`).
  The first screen of a phone with no pairing has How it works: install
  Yonder on the computer (the plain link `yonder.so/download` with Copy,
  Text it and Email it), scan the code, connect the agent. Before the
  camera alert, one screen gives the reason.
  - After the Welcome of the Mac, and after the first pairing of a phone,
    the setup shows each step that is not done yet: Full Disk Access on
    the Mac (`GET` and `POST /access`; the phone only guides, Later skips
    it), the questions, "Your Yonder", the sign-in of the CLI (the
    `Logins` cards), then on the phone the microphone with speech, the
    notifications, and the photos with the location.
  - The questions depend on the answers before. They pick only a built-in
    screen: Big button for a beginner (with the Weekly pill off),
    Terminal for "every day" and "many agents", else Yonder with no
    change. They also set the CLI of new agents (`POST /clis`) and Auto
    mode for a beginner with Claude Code (`POST /mode`). "Your Yonder"
    shows the three, and its Screen row opens the list of Settings ›
    Appearance › Screen.
  - The Agent row of "Your Yonder" opens the list of all the CLIs of
    `GET /clis`, also an agent that the user added. The CLIs that are
    installed and signed in come first, with their plan. The agent is
    the pick of the user, then the answer (`agentFor` in
    `src/Setup.tsx`). With neither, such as after Skip or "None yet", it
    is the default of the computer when that is ready, then the first
    CLI that is ready. So a computer with only Hermes gets Hermes.
    Claude Code is only the proposal for a user who answered and has no
    CLI yet. After Skip with no CLI that is ready, the row says None,
    and Yonder installs nothing. Continue waits for the list of the
    CLIs, so a fast Skip does not leave Claude Code. The user can set
    any CLI, and gets no Claude Code by default.
  - The bridge starts the sign-in of Claude Code on a computer with no
    default yet. When the user picks another CLI, Continue stops that
    sign-in (`POST /logins` with `cancel`), and a Connect step with no
    card goes.
  - The last step, "Let Hermes set up the rest" with the name of the
    CLI, starts an agent on that CLI in `~/Yonder` (`POST
    /setup-agent`). It shows only when the CLI is installed and signed
    in. After Start, the setup ends and the chat of that agent opens,
    because its first answer is a question. The task tells the agent to read the guide at `GET
    /setup-guide` (`bridge/setup-guide.md`, with the address of the
    bridge) with curl. The guide is for each CLI, so it is no skill of
    Claude Code. The agent asks one question at a time, and changes
    Yonder with its tools and with `POST /clis`, `/mode` and
    `/settings`: the CLI of new agents with its model and effort, the
    permissions, the projects, the screen, the word for an agent, the
    other settings and the schedules. A user can give the same task to
    an agent in a terminal (README, "Let your agent set it up"). So the
    agent of the user, in any CLI, has the instructions for each step.
    From the answers it sets keys such as `agentName`, `agentNaming`,
    `steer` and `sumUp`. `bun run check-clis` checks the start and the
    guide with a stand-in Codex.
  - Continue on "Your Yonder" installs the CLI of the answers and starts
    its sign-in, when it is missing or not signed in, and the Connect step
    shows its card. A user who picks Hermes gets Hermes, not Claude Code.
    Skip installs nothing. The bridge does not start the setup of Claude
    Code by itself. Else a new Linux computer shows a Claude sign-in that
    asks for a code before the user can pick a CLI.
  - A scan that pairs shows "Paired" on the button for 1.2 seconds before
    the app moves on. Else a user scans the same code again.
  - `onboarded: "on"` in phone.json (synced, in `KEYS`) marks the
    questions as done for the computer, also after Skip. At each start,
    the bridge sets it when phone.json or agents exist, so existing users
    never see the setup.
  - Apple's rule: a screen before a system alert has one button,
    Continue, and no Skip. Each step goes on after Allow or Don't Allow.
    `permsWait` (localStorage of the phone) holds the push of
    `connectPhone` until the notifications step, and a phone that closed
    during the setup opens on it again.
  - A paired phone with no account has no call, so its main button is New
    task (`guestTask` in `src/App.tsx`), which opens the New chat view, and
    the two + buttons hide.
  - `?setup` (or `?setup=all` for the steps of the phone) opens the setup
    in the dev server, for a check in the browser.
  - Replay setup, in Settings › Super user (only for a super user of
    yonder.so), shows the setup again, with the permission steps on
    the phone. Skip keeps the settings. It is a test tool, so it is not
    in General.
- The bird is the logo of Yonder, and no screen or icon shows the Y:
  also not the lock screen, the Android icon, the notification of a live
  call on Android, and the Play Store icon, feature graphic and pairing
  screenshot.
- The icons inside the app are one set of line icons (`src/icons.tsx`, the
  paths of Lucide): 16 px, a stroke of 2 px, in the color of the text. They
  replace the text symbols ↻, ☀, ☾, ⏏, ★, × and ▶, because iOS showed some
  of them as color emoji. The status glyphs of the title bar counts stay
  text, as in Claude Code.
- The Closed tab and the Close item of the agent menu show a closed door
  (`door`, the Lucide "door-closed").
- The Agents tab shows the head of the Yonder bird (`bird`): the two
  rounded feathers of the logo, the eyes that look to the side, and the
  beak. Visual Sandbox drew it (`vector/quiver-arrow-2`) from the logo
  and the mascot. Its lines are filled shapes (`SOLID`),
  about 0.8 wide. So `PATHS` has the outer and the inner edge of the
  head line, with the feathers, and a stroke of 0.7 (`STROKE`) on them
  makes the head line about 1.5 wide. The eyes keep thin lines and a
  stroke of 0.3 (`SOLID_STROKE`), so they stay open. A smaller view box
  (`VIEW`) draws the bird at about 28 px in the box of 24 px, so its
  head line shows at about 1.75 px. The view box also puts the bird
  1.9 px higher, so its bottom is on the bottom of the Done circle. Its
  edges go a little out of the box (`overflow` visible). The landing
  demo has a copy.
- Each agent shows a small dot in the color of its status, then its
  number in large text, in its row and in the header of its
  conversation: red runs (with a pulsing ring), blue waits on the
  user, green is done, purple is done with an answer, red failed, and
  gray is closed. A closed agent that gave its number back shows only
  the gray dot. The dot replaces the status glyph and the status word,
  so the header has room for its buttons. In a row, the number is 28 px
  and fills the height of the two lines (the name, and the model and
  effort). The number has the color of the text, and only the dot has
  the color of the status. The same badge shows on the Agents,
  Completed and Closed tabs, and on the sub-agent rows.
  The ring of a running agent grows from the dot to 5 px and fades out,
  each 1.6 seconds, as a ping.
  The color of a running agent (`--live`) is the red of the brand and
  the app icon: #e5484d in the light theme and #ff5c61 in the dark
  theme. The Dynamic Island uses #e5484d. The star and the "connecting"
  dot use the orange `--amber` (#d97706 and #f59e0b). A failed agent is red too (`--red`), but its dot does not
  pulse.
- The iPhone app icon is the same bird on a full red square with no
  alpha (`ios/icons/icon.svg`), because iOS rounds the corners itself.
  `bunx tauri icon` made the PNGs of `ios/icons/ios/` from the SVG, and
  `ios/gen/apple/Assets.xcassets/AppIcon.appiconset/` has copies of them.
  These PNGs must have no alpha channel. `tauri icon` adds one, so
  `magick mogrify -alpha off -define png:color-type=2` removed it after
  `tauri icon`.
- `ios/icons/icon.png` is the exception: it must be RGBA, with an alpha
  that is fully opaque. `tauri::generate_context!` reads it, and stops
  the build with "icon ... is not RGBA" when it has no alpha. Then
  `bun run install-ios` fails, and the phone keeps the old icon.
- The window has no gray title bar. Its title bar is in the app color
  (`titleBarStyle: "Overlay"`), and the top strip of 28 px holds the traffic
  lights and moves the window.
- The UI fills the window at each size. The lists, their lines, the line
  under the tabs and the scroll bars go to the edges of the window. Only
  the content keeps a gutter of 16 px.
- The icons of the rows (the favicons of the projects and the number
  circles of the agents) start at the gutter, in line with the text of the
  first tab.
- Keep the UI minimal. The app shows:
  - the title bar row (36 px, next to the traffic lights): an amber dot
    with "Reconnecting…" at the left while the bridge does not answer, and a
    red dot with "Offline" after a minute with no answer (see Phone), the favicon and the name of the selected project in the
    center, and the update and settings buttons at the right.
    A click or a tap on the name opens the Projects tab.
    The title bar shows no "Yonder", no version, no live time and no
    spend, for more space: the version and the spend are in the
    settings, and the time of a live call is on the call button ("End
    call · 0:22"). The theme, the calls of the past and the QR code are
    in the settings, because more buttons cover the title. The buttons
    keep 6 px to the top edge, to the right edge and to each other, and
    their radius of 8 px follows the window corner (about 14 px).
    On the phone, the buttons keep the gutter of 16 px to the right edge,
    so they line up with the mute button.
  - in the settings, the money spent on xAI this month and the credit
    left, from the xAI console, or else the estimate of the money spent
    on Grok. The settings also give about how many tokens the context of Grok holds. xAI sends no
    token counts in `response.done`, so the app counts the characters of
    the current prompt, the words of the call and the tool calls and
    results, and divides by 4. Audio tokens and the tool schemas do not
    count.
  - no update button. The "Update available" pill of the call row (see
    "Install the app") shows when the source has newer commits or the
    native app needs a rebuild. The tooltip of the pill tells how many
    commits the app is behind.
    The bridge gives the commit count of the source (`/version`), and the
    app reads it every 30 seconds. A click on the pill does the same as
    `rebuild_app` by voice: a reload of the front end, or a full rebuild.
    `call_status` gives Grok the source version too.
  - a settings button (sliders) at the right. It opens the settings page,
    as on the phone, with the theme, the calls of the past (Voice, Call history),
    the QR code that pairs a phone (General, Pair a phone, as File > Pair Phone…
    does), the version, and the Claude Code usage (see below). When the
    installed app has another version than the screen, an "App" row
    under the version gives it. Under the
    version, a row gives the state of the source: "Up to date" with a
    Check button, or "2.B.N is ready · 4 new commits" with a red Update
    button. The app reads the version of the source when the settings
    open and every 30 seconds, so the Update button shows without a
    click. Update does the same as the "Update available" pill.
    Update also closes the settings, so the user sees the blue
    "Updating…" pill on the main page.
    The phone has the same row, and its Update calls `rebuild_app`. A
    click ends a live call, and the phone then loads the new front end.
    Else the phone shows an old version with no way to update.
  - the settings page looks like the Settings of iOS: a gray page, and
    groups of rows in white cards with round corners (`.group`, `.row`),
    a row of 44 px at least, a line from edge to edge of the card between
    the rows, a small gray title in capitals over each group, and a
    segmented control for the theme. Each setting that is on or off is a
    switch (`OnOff`, as the switch of a tunnel), not a segmented control
    of Off and On, so that the controls are the same everywhere. A choice
    of more than two stays a segmented control. On the phone a switch has
    the size of the switch of iOS (51 by 31 px).
    On the iPhone each switch, also the switch of a tunnel, is the switch
    of iOS itself: a checkbox with the `switch` attribute of WebKit (iOS
    17.4 and later, `.native-switch`), in the primary color of the app
    (`accent-color`). In the iOS 27 simulator it shows as the switch of
    iOS 26, with its long knob. The Mac, Android and an older iOS keep the
    switch of the page.
    The switch of the Settings of iOS 26 turns its knob into a large lens
    of glass that slides across while the finger is on it. The switch of
    WebKit has the look of iOS at rest, but its knob stays white under
    the finger (checked in the simulator). So with the native chrome each
    switch also gets a real switch of iOS at its place (`NativeToggle.swift`,
    `data-toggle`). A flip shows at once and clicks the switch of the
    page, and the page then sends its state again, so a flip that the page
    refuses, such as Face ID, flips back.
  - the settings page opens on a list of its sections, as the Settings
    of iOS. The account is a card at the top, as the Apple Account in
    iOS: a round avatar with the first letter of the email and the
    email, or "Sign in to Yonder" with the logo of yonder.so and "Sign up
    to get your tunnel", because the account gives a free tunnel and a
    call needs none (only when the Account section shows). Then
    Environment (only on the phone),
    General (the version and the update at the top, the pairing of a
    phone on the Mac, Face ID on the phone, the Tunnel, the summaries
    and the chat), Agents (the settings of new agents first, then the
    CLIs that run agents, see "Agents in other CLIs" under Workers),
    Voice (the model, Hey Yonder, the microphone, the call history and
    the cost), Keys (only in the Mac app: the key of the notch and the
    key of the call), Appearance (the theme, the color, and the font and the
    size of the text of the Context and Summary tabs), Usage (the
    Claude Code usage, and the usage of Codex) and Feedback. Each row has a line icon
    in the color of the text, with no colored square behind it, the
    name, its value in gray (the Mac in use, the CLI of new agents, the
    voice model, the theme, the percent of the week, or Update) and a
    chevron, as Wi-Fi shows its network in iOS. A tap opens the section as a second page, which slides in over the list,
    as in iOS. The back button, the swipe back and the back gesture of
    Android go to the list first, then close the settings. On the phone
    the list stays under the section, 30% to the left, and the swipe
    back moves the section and the list with the finger (`useSwipeBack`
    in `src/App.tsx` moves the parent page of a page in a page). So a
    swipe back in a section does not close all the settings.
  - the Feedback section has a box for a message, "Add a screenshot",
    which opens the photos of the phone, and Send. The app makes the
    screenshot a JPEG of 1600 px at most (`shrink` in `src/App.tsx`) and
    sends it with the message to `POST /api/app/feedback` of yonder.so
    (the landing page repository),
    with no sign-in. The site keeps the report in the admin, where only
    staff see it, and emails the staff. Send clears the form at once and
    shows "Sent". When the send fails, the message and the screenshot
    come back with the error.
    "Add call history" opens the past calls of the Mac as a page, with
    the same rows as the Call history of Voice (`CallRow` in
    `src/App.tsx`, from `/calls` of the bridge). A tap on a call adds
    it: the form shows its date with an x to remove it. The call goes
    with the report as text (`callText` in `src/Settings.tsx`), and the
    admin shows it under the report. The row does not show when the Mac
    gives no calls.
  - a row of a section has only its name and its control. The text that
    tells what the rows do is under their group (`.page-note`), as the
    footer of a group in the Settings of iOS. A row that opens another
    view (Call history, Pair a phone) has a chevron, and a row that does
    one thing at once (Pair a computer, Sign up, Sign in) has its name
    in the primary color, or red when it removes (Sign out, Delete
    account). The dropdowns, the segmented controls and the text buttons
    have one height. On the phone the title is in the center, as in the
    title bar of the app, the rows have text of 16 px, and the search
    field is 44 px high, as the other fields. The space over and under
    the content of a row is close to the 16 px at its sides: a row is
    48 px high on the Mac and 58 px on the phone, and its buttons,
    dropdowns and segmented controls are about 28 px and 30 px high, as
    the switch. In a card, a segmented control has the gray track of iOS,
    so the choice shows in both themes. The text is not in the rows,
    because the dropdowns and the four voice models push it into narrow
    columns of one or two words. Screenshots from headless Chrome (an
    iPhone user agent at 402 px) do not show the native switches and
    glass buttons of iOS.
  - a search field is over the list. It finds the closest settings, not
    only exact matches (`find` in `src/find.ts`, checked by
    `bun test src/find.test.ts`): each setting has other words, so
    "dark mode" finds Theme, "mic" finds Microphone and "bigger text"
    finds the Chat text. A typo also finds a setting ("aparance",
    "microfone"). The results show the section of each setting. A tap
    opens the section, scrolls to the row and flashes it. The search is
    local and instant, with no call to Clef, because the settings have
    only about 40 rows. Add a new row of the settings to `INDEX` in
    `src/Settings.tsx`, or the search does not find it.
  - the Context tab and Summary tab groups of the Appearance section,
    under the Color row, set the font and the size of the chat and of
    the summary. Chat changes the Markdown of the answers, and the headings
    and the code follow its size. Summary changes the points of the
    Summary view. The fonts are System, Serif, Rounded and Mono, and the
    sizes are S, M, L and XL (chat 12, 13, 15 and 17 px, summary 15, 18,
    21 and 24 px; M is the default). Each device keeps its own choice in
    localStorage, and `applyFonts` in `src/Settings.tsx` puts it on CSS
    variables when the app starts.
  - in General, under Summaries, two rows from the schema
    (`bridge/settings/general.json`) set how the Context tab shows the
    conversation. They are not in Appearance, which has only the style
    choices. They work for all the devices, in `config.json`. Detail is
    Minimal (only the messages of the user and the answers, with the
    pictures of the tool calls), Normal (each tool call and the thinking,
    as in the terminal; the default) or Verbose (the thinking open, and
    each command in full, not cut at the end of the line). Group tool
    calls (off by default) puts the tool
    calls in a row in one closed line with their count. The app reads the values when the Settings close and when
    an agent opens, so a change by hand in `config.json` shows with no
    build. Verbose opens no full result by itself, because each `/tool`
    call reads the whole transcript; a tap opens it.
    Each message of the user on the Context tab is a bubble at the
    right in the accent of the theme (`--accent`, the Color row), as in
    iOS Messages; a message that waits keeps its dotted edge with no
    accent. The screen style decides it, not a setting: a look with
    `"bubbles": false` (`data-bubbles="off"`, `src/look.ts`) keeps the
    gray rows at the full width, as the Terminal sample does. The default
    screen keeps the bubbles. The Settings have no row for the bubbles.
  - the Color row of the Appearance section, under Theme, sets the accent
    of the theme (`--accent` and `--accent-text` in `src/app.css`):
    Default, Orange, Green, Teal, Blue, Violet, Pink and Custom, as round
    swatches. Default keeps the accent of the screen in use: the red of
    the brand for Yonder (`#e5484d`, `#ff5c61` in the dark theme), and
    its own for each style, such as the green of Terminal. Its swatch
    shows that color in half of its circle. Custom is a color wheel over
    the native color picker. The accent goes on the open tab (its title,
    and the icon of the tab bar of the phone, also the native one), the
    choice of a segmented control (in the dark theme a tint of the pill),
    the number of a running agent, the live dots (`--live` follows
    `--accent`), the selected project, the focus ring, the caret, the
    prompt box in focus, the primary buttons, the send button, the
    switches, the meters and the links. The call button stays the color
    of the text, because red is the color of a live call. The text on the
    accent is white, or near black on a light color such as yellow.
    `config.json` holds it (`accent`: `""` or a hex color, from the schema
    `bridge/settings/appearance.json`), for all the devices, and
    localStorage keeps a copy for a start with no bridge. `applyAccent` in
    `src/Settings.tsx` puts it on `<html>` over the tokens of the screen,
    at once on a tap, and an own screen gets the new tokens with no
    reload. A change by hand in `config.json` shows when the Settings
    close or an agent opens. A phone with a color of `phone.json` from
    before gives it to `config.json` once. One hex serves the light and
    the dark theme. `bun bridge/accent-e2e.ts` checks it and takes
    pictures.
  - no counts of the agents. The title bar shows no count of the running
    agents and no count of the waiting agents.
  - the menu bar of the app: File > New Project… (⌘N) opens a save
    dialog in `~/Sites`. The name becomes a new folder with a new
    repository (`create_project` with `folder`), and the app shows its
    agents. File > Open Folder… (⌘O) adds any folder as a project
    (`add_project`) and shows its agents. Agents > New Chat (⌘T) opens
    the New agent view with a text box, as the chat button does. ⌘↩ closes the open agent, as the check
    at the top right of its conversation does, and goes back. A running
    agent closes too: it stops first. A sub-agent only goes back. In the
    text box of an open agent, ⌘↩ closes and does not send. In the lists,
    ⌘↩ closes the focused agent row, and the focus goes to the next row.
    In the New agent view, ⌘↩ in the text box sends, and elsewhere it goes
    back as the back button does. ⌘S opens and closes the Settings. The
    menu has no Close Window item, so ⌘W never closes the window.
    Agents > Close Completed closes
    the agents on the Completed tab of the project on the screen
    (`close_worker` with `tab: "completed"`). `main.rs` adds these items
    to the default menu of Tauri and sends the item ID to the window as
    the `menu` event. File > Pair
    Phone… shows the QR code that pairs a phone (see Phone).
  - ⌘+ and ⌘− zoom the content of the tabs in and out (CSS `zoom`, from
    50% to 200%), and ⌘0 sets it back. The header and the call button
    keep their size. The app keeps the zoom in `localStorage`.
  - only the lists scroll. On the Mac, the page itself does not scroll
    (`overflow: hidden` on `html` and `body`). Else the page shows a
    second scroll bar at the right edge of the window, next to the scroll
    bar of the chat.
  - the M key mutes or unmutes the microphone during a call, except in a
    text field. A muted track sends silence, so the call stays on, and the
    call button shows "End call · 0:22 · Muted".
  - the label of the call button is trimmed to the capitals
    (`text-box: trim-both cap alphabetic`), so that the button centers
    the capitals and the digits. Each "·" goes up by 0.065 em to the
    middle of the digits. In SF Pro it sits at the middle of the small
    letters, about 1 px low.
  - during a call on the Mac and on the phone, bars at the right of the
    time in the call button show the voices (`src/Levels.tsx`), as in a
    FaceTime call of iOS. In silence they are a still row of dots. A
    voice makes the dots grow into bars that bounce, higher in the
    middle. A gate keeps the noise of the room at 0. The bars do not move
    from the right to the left all the time, as in Voice Memos, because
    that takes the attention of the user. The prompt box uses the same
    dots while the user talks to it. Solid bars are the microphone, and
    faint bars are Grok. Two `AnalyserNode`s in `src/voice.ts` give the
    loudness. A flat line while the user speaks shows a dead microphone.
    On the phone the bars are 72 px wide, not 110 px, so that the label
    and the bars fit at the left of the mute button.
  - during a call, a round mute button of 52 px at the right of the call
    button, on the Mac and on the phone. It does the same as the M key.
    It shows a microphone, and a filled circle with a crossed microphone
    while the call is muted.
  - an open conversation or call makes the call button and the mute
    button smaller (36 px), so that the conversation gets more space.
    A CSS spring curve (`--spring`, 0.55 seconds) animates the change
    with a small bounce, with no animation library. An ease-out curve of
    0.25 seconds makes the button seem to snap.
    The height animates on the main thread. The first render of the
    chat blocks it for 100 to 230 ms, so the height jumps while the
    width stays smooth. So the chat renders 400 ms after the
    conversation opens, when the button has shrunk. The fetch starts at
    once.
    WebKit also stops the height transition of the button when its
    font-size has a transition, so the height snaps on the iPhone.
    The text of the button is in a `span` with its own font-size
    transition. A test in the WebKit of Playwright shows the smooth
    height.
    The app renders each second (the clock of the call and the poll).
    So the chat renders only when its turns change, and a reload of the
    same conversation keeps the old turns. Else each render parses the
    Markdown of the whole chat again, also on the Summary view, and the
    height jumps.
  - a Projects view: starred projects first, then the projects with agents,
    each with a star, a favicon, one news dot (purple when an agent needs
    the user's attention, else blue when an agent has an unread result), and a
    pulsing red dot when an agent runs. It has no tab in the tab bar: a
    click or a tap on the name of the project in the title bar opens it.
    It is not in the tab bar (`TABS` in `src/App.tsx`),
  - an "All projects" row at the top of the Projects tab. With it
    selected, the Agents, Done and Closed tabs show the agents of all
    the projects at once. Grok then sees all the agents, and asks for
    the project of new work. Close Completed closes the done agents of
    all the projects that do not need the user.
    The app starts on the last tab and project, also the Closed tab.
    It also opens the agent or call that was open before, after an
    update and after any other start.
    A project is always selected: All projects or one project. The
    removal of the selected project selects All projects, and so does a
    selected project that is no longer on the list. So the head never
    says "No project selected".
    The tabs put the agents of each project under a title with the
    favicon and the name of the project, in the order of the Projects
    tab. So an agent row does not name its project again and again.
  - a + button for a new agent without a call. It shows a microphone,
    because the user talks to start the agent. On the Mac it
    is in the title bar. On the phone it is a round liquid glass button of 56 px
    that floats over the rows, at the right, 12 px above the tab bar.
    It has the same glass as the bar, and it hides with the bar in a
    conversation. The tab bar uses the full width, because the button
    in the tab bar takes too much of the bar. It opens the Agents tab with a "New agent" view
    in place of a conversation. The view has no text box: a big round
    talk button, the orb (160 px), is in its middle. The view fades in
    within 50 ms where the list is (`.sheet.fade`), and the list does
    not move under it. The orb starts as a bright dot of about one
    pixel, grows slowly at first to its size, goes past it and bounces
    back (`orb-pop` in `src/app.css`, 1.1 s), and the
    phone gives two taps of the Taptic Engine at the top and the bottom
    of the bounce. The start chime plays when the microphone is on.
    The orb starts from one pixel and holds the dot for 165 ms. A start
    at 3 % with a fast growth shows the orb only from about half its
    size. The dictation (see
    Dictation) starts when the view opens, and the orb moves with the
    voice. A tap on the orb
    or Enter closes the view at once, and the Agents tab shows again.
    Then the last words come, and Yonder calls `start_worker` with them
    and no project, so the bridge picks the project (see below). The
    screen goes back to where the user tapped +: the same tab, project
    and open conversation. The back
    button and the back swipe go there too. On the phone, that
    conversation fades back in 50 ms in place of the slide from the
    right, and the list under it does not move. The new agent grows into
    its list as "Starting", and its conversation does not open. When no
    words come or the start fails, a toast says "Yonder did not hear
    you. Tap + and talk again." or "The agent did not start" and why.
    The view does not wait for the last words and the start. Escape
    drops the words, and a tap on the button then listens again. The +
    button ends a live call, and the view then listens. While a call still
    connects, or when a call starts in the view, the view does not
    listen, the button is off, and the view says to tell Yonder the
    task. When that call ends, the view listens. The attached images go
    with the task. In this view they show under the talk button and its
    words, not under the call button. The + button opens the view on the
    selected project. With one project selected, the agent starts in
    that project, and the screen stays on it. With All projects, the app
    gives no project, and the bridge picks it from the task (`projectOf`
    in `bridge/main.ts`). An open of an agent from All projects does not
    select its project. With All projects, the agent shows at once in
    the project that the user works on now: the project with the most
    agents of the last day, else the first project (Yonder).
    Clef then picks the project of the task out of all the projects, and
    the agent moves there before its first turn, so the work runs in the
    right folder. Clef has 10 seconds for this pick (`START_CLEF`), not
    the 3 seconds of its other questions, because the pick can take 2.6
    to 8.6 seconds. With a shorter limit most picks time out, and a task
    that says "on yonder" starts in the busiest project. Clef also gets the time of the last
    edit of each project. When two projects fit the task, such as
    sundial and sundial-portfolio, it picks the one that the user edited
    last. Clef also gets
    the recent agents of each project, and what each of the latest
    projects is (its about, as in list_projects): the 15 first projects
    with recent agents or an edit in the last 3 days. A task that fits
    the work of one of them, such as "build a toggle switch with our
    components" for nova, a playground of switches and knobs, goes there
    also when it does not name it. "(none)", and so `defaultFolder`, is
    only for a task that is not about the work of a project, such as an
    errand or a note. When the task does not name a
    project, and Clef picks a project with no recent agent that is not
    one of the latest projects, the agent stays in the project that the
    user works on now. A pick out of the latest projects stays. A second
    question to Clef and a check of the project name in the task tell if
    the task names a project. Else Clef can send a task such as "I
    should be able to dictate even if the Mac is offline" to a
    dictation app, while the user works on Yonder. A task that tells the
    work of a quiet project but not its name, such as "fix the invoice
    PDF", also goes to the busy project.
    When Clef fails, a latest project whose name is a word of the task
    wins, else the agent stays in that first guess. Only the latest
    projects count, because names such as "app" and "phone" are plain
    words. The words under the button say "Yonder picks the project."
    The menu of the title picks another project (see the title bar row).
    The head of the view has only the back button. With "All projects"
    selected, the title says "New agent" while the view is open. So the
    user can start agents without the voice.
  - a chat button (a speech bubble) next to the + button, in the title
    bar of the Mac and at its left on the phone. It opens the same New
    agent view with a text box at the bottom in place of the orb, and
    the menus above the box. On the phone, the paper clip is at the left
    of the box, as in a conversation. The box has the focus. Enter starts the
    agent, as the tap on the orb does, Shift+Enter makes a new line,
    and Escape closes the view. The microphone in the box changes the
    view to the orb. The chat button needs no microphone, so it does
    not end a live call.
    An agent of the + button or of the chat button has no name from Grok, so `titleOf` in
    `bridge/main.ts` writes a title of two or three words (six at most) from the
    task with Haiku, through a hidden `claude -p` (`ask`) on the Claude
    subscription of the user, in 2 to 3 s. So the titles run only on
    the account of the user. A rename before the title comes stays.
    An agent of Hermes gets its title from Hermes, not from Claude
    Code: `askFor` in `bridge/main.ts` runs `hermes -z "<prompt>"
    --ignore-rules -t todo`, with `-m` and the model of the agent or of
    the Hermes row of the Agents tab. No model gives the default model
    of Hermes. The run uses the variables of the profile of the agent.
    So the CLI, the profile and the model in `config.json` are the
    setting, and there is no switch for it. `-z` prints only the
    answer, and it allows each tool with no question, so the run gets
    only the toolset `todo`, which reaches no file, no shell and no
    network. A run that fails keeps the first words, and does not go
    to Claude Code. A CLI gets its own titles when its row in
    `bridge/clis.ts` has `ask`: only Hermes has it now. The summaries,
    the briefs and `review_workers` stay on Haiku for each CLI: they
    run on each answer, and a key of Hermes can pay for each token.
    Without the titles of Hermes, on a computer with Hermes and no
    Claude Code, each agent keeps the first words of its task. A small
    local model (`llama3.2`, 3B) in Hermes 0.23.2 names the agent, not
    the task, such as "Coding Task Assistant". Other wordings of the
    prompt make it write a tool call as JSON. `titleOf` refuses an
    answer with braces.
    `bun run check-clis` checks the run with a stand-in Hermes. GitHub
    does not run that check.
    The first three words of the task show until the title comes, and
    stay when the model fails. A change to the titles needs
    `restart_bridge`.
    The talk view has no text box; the chat button opens the view with a
    text box. Clef picks the model and the effort of a
    new agent from the task, inside the Model and Effort ranges of the
    Settings. Two small menus under the words pick
    the model ("Auto model", Opus 5.5, Fable 5.1, Sonnet 5.5, Haiku 5.5)
    and the effort ("Auto effort", Low to Max) before the start. The
    model menu starts on Auto, or on the model of a Model range of one
    model. A click in a
    menu does not send, and Enter and Escape in an open menu belong to
    the menu. On the Mac, ⌘E
    moves the effort one step up, from Auto to Max and back to Auto, as
    ⌘E does in an open agent. A third menu
    picks the permission mode (Bypass permissions, Auto mode, Accept
    edits, Plan mode), as Shift+Tab does in Claude Code. It starts on the
    Permissions row of the Settings.
    The three dots of the agent then change the model, the effort and
    the permission mode (see the conversation view). The card of an open
    agent also has a Profile menu when that CLI has a profile.
    The menus and the paper clip float at the bottom, above Cancel and
    under the words: on the phone, the paper clip in the middle, the
    three menus in one row under it, and the X at the bottom. On a phone
    narrower than 393 px, only the permission menu shrinks, with an
    ellipsis. A wide font, as the monospace of the Terminal look, can
    need the shrink on each phone. With a look, each menu is a Base UI
    select with a hidden input after its button, so the CSS finds the
    last menu with `:last-of-type`. With `:last-child` no menu shrinks,
    and the row runs off both edges of the phone. This order keeps the
    menus in one row. On the phone they are larger: 13 px text, and a
    paper clip of 46 px with a 22 px icon, larger than the X of 36 px
    under it.
  - an Agents tab with the agents of the selected project only, in a style
    like the Claude Code agent list: red runs, blue waits on the user,
    green is done. This tab shows only the agents that run. Each agent row has two lines: the large
    number of the agent (28 px) over both lines (the user says "agent 4"), then the
    name over the model and the effort. A small # comes before the
    number, so that it is clear that the number is the number of the
    agent. The # is fainter than the gray text, in light and dark mode.
    The header of a conversation keeps the dot before the number and
    shows no #. The row has no status dot at its end, after the check
    button: the third line of a row on the Done tab tells the news.
  - a Done tab (the value `completed`, a check icon) with the waiting,
    done and failed agents of the selected project. The starred agents
    are first, then the agents that need the user (`needsYou`: they wait
    on a reply, or Clef gave the result the `attention` flag), then the
    newest result. Each row has a third line (`Tag` in `src/App.tsx`):
    the next step of the user in 2 to 5 words, such as "Run migration,
    then push" or "Pick a token". Haiku writes it with the summary, as a
    last line "Next: ..." (`next` of the summary in `bridge/main.ts`).
    The line is purple when the agent needs the user, blue when it waits
    on a reply, red when it failed, and gray when it needs nothing. It is
    one line, and a long one ends with an ellipsis. It is only text, in
    a medium weight, with no dot of an unread result in front of it.
    Before the summary comes, or with the Summaries off, the line names
    the state, such as "Reply needed". The key of the summaries is "n",
    so a summary with the older key "t" is written again with a next
    step. The count of the tab, in purple, is the number of agents that
    need the user.
    `tabOf` in `src/App.tsx` and in `bridge/main.ts` decides the tab of
    an agent, so the groups of Grok are the same. There is no separate
    Review tab, because an agent on the Done tab can still need a push:
    the colored line on each row says what to do next.
  - a Saved tab (the value `saved`, a bookmark icon) with the agents that
    the user saved for later, so that they are not on the Done tab.
    `saved` is a flag
    of the agent, not a status, so the row keeps its status and its next
    step, and the tab has the order of the Done tab. "Save for later" in
    the menu of a row (a long press, or a right-click on the Mac) and the
    bookmark in the head of a conversation, at the left of the check, save
    the agent. On a saved agent they say "Unsave", and put it back on the
    Done tab. Grok saves with `star_worker` and `saved` (or `starred`, the old name). A new message, a
    complete or a close takes the agent off the Saved tab, so its next
    result shows on the Done tab again. A save of a closed agent brings it
    back as done. An agent saved while it runs, or one that runs again with
    no message from Yonder, shows on the Agents tab, and goes back to the
    Saved tab when its turn ends. After a quiet time in a
    call, Grok offers to close only the agents of the Done tab, never the
    saved ones. The tab counts its agents, and its empty state shows the
    bird of the Closed tab ("Nothing saved").
  - a Closed tab with the closed agents of the selected project, in gray.
    The Closed tab is a trash bin: it shows no count, and an "Empty"
    button under its list removes all its agents. On the phone, the
    button is a pill that floats over the rows, centered above the tab
    bar. It has the look and the size of the Cancel button of the talk
    view, with red text, at the bottom of the tab. On the Mac, it also
    floats over the rows, at the bottom.
    The swipe, the row menu and the menu of the conversation say Close
    for `close_worker` (the Closed tab), and the menu of the conversation
    says Complete for `complete_worker` (the Done tab). Grok
    takes "mark it as done" as a close (the Closed tab). "The done
    ones", "completed" and "finished" are the Done tab.
  - a Tunnel tab, with the web sites that run on the Mac
    (see Yonder Preview).
  - a Search tab, the last tab (a magnifier in the tab bar of the
    phone). Its field finds agents in all the projects, also the done
    and closed ones, by the name, the task, the project, the summary and
    the end of the result. The best match is first (`find` in
    `src/find.ts`, the same search as the settings). The search runs in
    the app, with no call to the bridge, so the results change with each
    key. A tap on a result opens its conversation over the results, and
    the back goes to the results.
    Its field looks like the search of the Projects view, with the same
    space at the sides and no line under it.
  - an empty state in the center of an empty list (`src/Empty.tsx`): a
    small animated picture, a title and one line. The picture is the
    mascot of Yonder, a red aviator bird in a 1930s rubber-hose cartoon
    style: a black flight cap with goggles, a cream scarf, white gloves
    and big black shoes. The Agents tab shows the bird asleep on a cloud
    ("All quiet"), the Completed tab the bird that jumps in confetti
    ("All caught up"), the Closed tab the bird that looks into an empty
    envelope ("Nothing in here"), and the calls the bird that talks into
    a stand microphone ("No calls yet"). The pictures are SVG files
    (`src/empty/`): GPT Image 2.5 Flare of Visual Sandbox drew each pose
    from the bird of the landing page, and `vector/recraft-vectorize`
    traced it. The source art of the bird is in the brand files, which
    are not in the repository. They go into the JS as SVG
    text (`?raw`), because the phone gets only the JS and the CSS of a
    new front end, and into the page as inline SVG, not as an `<img>`, so
    that the CSS of the page can color their paths. The sleep letters
    (`.zzz`) take the text color, and in dark mode a thin light edge goes
    around each bird, so that its black legs, the "?", the microphone
    stand and the confetti show on the dark panel. The bird pops in and
    floats, and it stops with reduced motion.
  - the calls of the past, with the transcripts of the calls, newest
    first. The settings open them in place of the tabs (Voice, Call history), on
    the Mac and on the phone. A click on a call opens its full transcript, with a back
    icon, in the style of the conversation view. A question of the user
    that went to an agent shows "Sent to Agent 12" under it, and a click
    on it shows the full prompt that the agent got, with the voice-call
    block (`sentFor` in `src/App.tsx`). An old call with no full prompts
    shows the words of the tool call of Grok. The calls have no tab,
    because five tabs do not fit on the phone. The glass bar of the
    phone has four tabs: Agents, Done, Closed and Tunnel. Grok opens the
    calls with `show_tab` and `calls`.
  - keys for the tabs: the left and right arrows move one tab, and
    Command 1 to 4 opens the tab in that place. In a text field the
    arrows move the cursor.
  - back and forward, as in a browser: they go to the view before or
    after, that is the tab, the project and the open agent or call. Each
    view is an entry of the history of the page (`history.pushState`),
    so in Chrome the mouse buttons, ⌘[ and ⌘] and the swipe of Chrome
    work. The web view of the Mac app has none of these, so there the
    app gives the mouse buttons (buttons 3 and 4), ⌘← and ⌘→, and the
    navigation swipe (`yonder_watch_swipes` in `src-tauri/owner.m`, the
    "swipe" event). The driver app of some mice maps the back and forward
    buttons to that swipe by default (such as `OSX_GESTURE_BACK`), not to
    buttons 3 and 4, and a swipe with three fingers on the trackpad
    makes it too. So such buttons work with no change in the driver
    app. The swipe with two fingers is a scroll, not a navigation
    swipe, so it does not go back. In a field with text, ⌘← and ⌘→ move
    the cursor. A view goes into the history when it stays for 300 ms.
    Not on the phone.
  - the change of tab: the new panel slides in from the side of its tab,
    and the old panel goes at once (`.panel[inert]` has `display: none`).
    Base UI keeps the old panel until its animations end. Else the old
    panel also gets the slide, and after a reload the first click on a
    project shows both panels at half height for 0.2 s.
  - keys on the Projects tab: the up and down arrows select the previous
    or next project and focus its row, also from the search field. Enter
    or Space opens the agents of the selected project.
    The selected row shows the hover fill from edge to edge, with no ring
    and no round corners, as on the Agents tab.
    Only a mouse shows the hover fill (`@media (hover: hover)`), on the
    projects and on the agent rows. A touch screen keeps `:hover` on the
    row that a finger touched, so on the phone a touched project looks
    selected. So the phone shows the fill only on the selected project.
  - keys on the Agents, Completed and Closed tabs and the calls: the up and down
    arrows focus the previous or next row. Enter or Space opens the
    focused agent or call. In an open conversation or call, the left
    arrow goes back to the list and focuses the row again. The focused
    row shows the hover fill, not a ring. A click on the tab that is
    open also goes back to the list.
  - the time on each agent row: a running agent counts the time of its
    turn. When the agent stops (waiting, done, failed or closed), the
    time stops at the length of that turn.
  - how long ago each agent started, after the model and the effort on
    the second line of its row: "Opus 5.5 · high · 2h ago". The
    time at the right shows only the last turn, so the user could not
    see how long an agent ran in total. The bridge keeps `createdAt` on
    a worker, the start of its first turn. For an older worker with no
    `createdAt`, the bridge reads the creation time of its first
    transcript. Grok also gets "started 2h ago" in the line of each
    agent. The row drops the word "started", because the line is too
    long for the row.
  - a stop button on the row of each running worker, next to its time.
    A click on the button closes the agent and does not open it.
  - no star on an agent: Save for later (the Saved tab) does its job.
    Grok saves an agent with `star_worker` ("star agent 5", "pin it"),
    and `starred` is an old name of `saved`.
  - all the agents. `list_workers` does not stop at the 30 newest
    workers. Else the Closed tab shows only some of the closed agents,
    and the Completed tab hides done agents.
  - the counts of the tabs for Grok: `get_screen` gives the number of
    agents on each tab of the selected project before the list. Else
    Grok counts the lines of the list itself, and gives a wrong count.
  - the order of the rows in each tab: the agents by number (agent 1 at
    the top). A closed agent with no number goes last. A new step, a new
    result or a new status does not move a row, so the rows do not
    change places all the time. The Completed tab is different: the
    agent that finished last is at the top, newest first by `updatedAt`.
    The bridge sorts its list the same way.
    The Closed tab puts the agent that the user closed last at the top.
    The bridge sets `updatedAt` when it closes an agent, and the app
    sorts by it, newest first. The star does not change this order. The
    app also sets `updatedAt` in the instant change of a close
    (`PATCH`), so the agent is at the top before the bridge answers.
    On All projects, the Closed tab also keeps this order: the agent
    closed first is at the bottom, and a project title shows again each
    time the project changes. So an old close is never above a new one.
  - a new agent grows into the list. Its row opens from no height, so
    the rows under it move down, its text slides down into place, and
    the row glows blue for a moment. The app knows each agent of the
    first list from the bridge, and only an agent after that list is
    new. The row plays this once, and only when it shows in the 10
    seconds after the app saw the agent, so a later tab switch does not
    play it. With reduced motion, the row shows at once.
    A new agent first has a short ID such as "new1", and then its
    session ID. The row keeps the key of its first ID (`keyOf`), so a
    new ID or a new title changes only the text of the row, on each
    tab. Else a title that comes in the same update as the session ID
    makes the row grow in again, and the list jumps.
  - a conversation view: a click on an agent row opens the conversation
    of that agent in the tab. It shows the prompts, the answers, and one
    short line for each tool call. An edit or a write also shows its
    changed lines, as Claude Code does: the line numbers, red removed
    lines and green added lines, and the count "(+2 -2)". The bridge
    reads them from the `structuredPatch` that Claude Code saves with the
    tool result in the transcript, 200 lines at most for each call.
    Complete in the menu of the three dots marks a worker as completed
    (`complete_worker`, hidden when the agent is done or failed), and
    moves it to the Done tab. The check at the top right closes the
    agent (`close_worker`), and moves it to the Closed tab, so the menu
    has no Close. After a click the view goes back to the list, on the
    Mac and on the phone. Each icon of the menu has the color of the
    text.
    The menu also has Model, Effort and, when the CLI has a profile,
    Profile. Each shows the current choice at its right and its own
    menu. The models are Opus 5.5, Fable 5.1, Sonnet 5.5 or Haiku 5.5.
    The efforts are Low, Medium, High, Xhigh or Max. Each profile shows
    its name and the percent of its week. The card of the Summary tab has
    these menus, and the three dots keep them too. A
    running agent gets the change at once: the app calls `message_worker`
    with "." and the new model, effort or profile, so the agent
    stops its turn and continues on it. Any other agent gets the change
    with its next message, so the change starts no turn. A terminal
    session and a sub-agent have no Model, Effort or Profile. The model
    names are the aliases of `LATEST` in `bridge/main.ts`, so update
    `MODELS` in `src/App.tsx` with it.
    When the open agent closes in another way, for example by voice, the
    view also goes back to the list of the tab that was open. Else the
    conversation of an agent that Grok closed stays open. Open in
    Ghostty opens the session in a Ghostty
    window, where the user can scroll and continue it. The answers
    show as Markdown (`react-markdown` with GitHub tables), with code in
    mono, like Claude Code. A code block wraps its long lines and does
    not scroll sideways. A wide table grows up to 36em and scrolls
    sideways in its box, and the words in a cell do not break. Else, on
    the phone, the columns squeeze and break words such as "Tokens" in
    two. A tap on a quote of an
    answer, such as a draft of a message, copies its text, and the quote
    shows "Copied" for 1.5 s (`Quote` in `src/App.tsx`). A tap on a link
    in the quote and a selection of text do not copy. An answer has no
    dot before it, so that it does not look like a point of a list. With
    Group tool calls on, the tool calls in a row are in one small card, such as "4 tool calls",
    closed. A tap opens the card and shows each call. A tool call with
    pictures stays out of the card, so the pictures show. The card is
    small and quiet (11 px, no border, less contrast), because the tool
    calls matter little. The open list scrolls sideways, and each call
    shows in full, with no "…" at the end. The tool calls, the code and the prompt
    box use JetBrains Mono, the font of Ghostty on the Mac (`--mono` in
    `src/app.css`). A device without the font, such as the phone, uses
    the system mono. The text of
    the messages uses the font of the app: SF Pro on the Mac and the
    iPhone, and Inter on Windows, Android and Linux (`--sans` in
    `src/app.css`, with the file in `public/fonts/`). Apple allows SF Pro
    only on its own systems, and Inter is the free font that is closest to
    it. A computer that has SF Pro installed uses SF Pro. The messages
    are not in JetBrains Mono, because it is harder to read. A click on
    a link opens it: the Mac opens it
    in its default browser (the `open_link` tool of the bridge), and the
    phone opens it in Safari (the default browser on Android). The
    phone does not open it in a browser inside Yonder, because the
    capabilities allow that browser only for yonder.so. The links have
    no `target="_blank"`, which does nothing in the window of Tauri. A
    bridge without `open_link` puts the link on
    the clipboard. A prompt box under the conversation sends a
    message to the agent (`message_worker`): Enter sends, Shift Enter
    makes a new line. A sent
    message shows at the end of the chat at once, a little faded, and
    stays there until the conversation of the agent has it (`sent` in
    `Conversation`). So the next load of the conversation does not
    remove it. A running agent gets a message after its next
    tool call (see Workers), and a message in the queue of the bridge
    when its turn ends. The queued messages of the agent (`w.queue`, also the
    ones that Grok queued) show at the end of the chat with a dotted
    grey edge, without the voice-call and attachment blocks (`Queued` in
    `src/App.tsx`). A message that the user sends while the agent
    works gets the dotted edge at once (`waits` on `UserTurn`), also
    before the bridge queues it, and also when it goes into the current
    turn. It keeps the edge until the agent reads it. Its pictures show
    in the same bubble, over its words, so a message with only pictures
    gets the dotted bubble too. A message with only pictures starts with
    its `<images>` block, and its bubble shows the picture, not the
    words of the block. A tap or a click on the bubble sends only that
    message (Send now, `stop_worker` with `send` and `message`): it
    stops the turn of the agent, and the other queued messages wait for
    the end of the next turn. The stop button and Escape send all of
    them. A long press on the
    phone, or a right-click on the Mac, opens a menu with Send now,
    Edit and Delete. A tap on a picture in the bubble sends the message
    too, so a tap anywhere on the bubble sends it. A message that
    went into the current turn (`waits`) also sends on a tap, as in
    Claude Code: it stops the turn and goes now. Its menu has only Send
    now. Send now stops the turn and sends the queue at once. While
    messages wait in the queue, the stop button
    and Escape do the same as Send now. A second Stop then stops that
    turn too. Its messages stay in the conversation, so the next
    message continues from them. A message that went into the current
    turn (`waits`) counts too (`toSend`), and the messages that go lose
    their dotted edge at once. Else Escape stops the turn and keeps such
    a message back, its bubble keeps the dotted edge, and the user
    presses Escape again. Edit (it takes the message out of the
    queue with `unqueue` and puts its words back in the prompt box; its
    images stay behind), and Delete (it takes the message out of the
    queue with `unqueue` and drops it). If the agent got the message
    while the list still showed it in the queue, Edit and Delete only
    load the list again, with no error "has no queued message". A
    message of the user shows the pictures
    that it attached, and not its `<images>` block. The block still
    goes to the agent, and the agent's Read of a picture that the user
    attached shows no second copy. A copy of that picture at another
    path shows no second copy too: the bridge compares the bytes
    (`printOf`). Else an agent that copies an attached picture to read
    it shows the picture again in its answer. Claude Code joins queued
    messages into one turn, so the bridge removes each block of the
    turn. When the user scrolls the chat
    up, a round button with a down arrow at the bottom right goes back
    to the end, as in Signal. A message of
    the user is a round bubble (20 px corners) with no border on the
    `--hover` color, as in iOS Messages. Its words are at 15 px, as in
    the prompt box, and it has no "›" arrow. Only a question of a past
    call keeps the arrow, because a tap opens it. The pictures of a
    message of the user show at the right,
    apart from its bubble and before it, with 18 px corners, as in iOS
    Messages (`UserTurn`), so they do not make the bubble tall. A sent
    message that is in the queue shows only
    there. A new agent shows its task at once as its first message, until
    the chat has it, and "Yondering…" shows under it. The New agent view
    sends the task, so it was not a sent message of the conversation.
    Only an agent with no result, in its first turn, shows it, so an old
    agent does not show its first task while its chat loads. So the chat
    of a new agent does not show "No conversation yet." with
    "Yondering…" far under it.
    A short chat starts at the bottom, over the message box, as in
    Messages: the chat is only as high as its turns, and the free space
    is over it. A long chat fills the view and scrolls. A drag down in
    the free space also hides the keyboard. While the agent runs, a stop
    button (a square in a circle)
    shows in the title row of the conversation, at the left of the
    three dots (on the phone, at the top right). It calls
    `stop_worker`, and Escape in the box does the same on the Mac, as in
    Claude Code. Its class is `halt`, not `stop`, because the `.stop`
    class of the row stop button gives it a second square under its
    icon. The stop button of a row on the Agents list is another
    action: it completes the agent. A message to a sub-agent does not
    stay in the chat of the sub-agent. Its
    placeholder is "Send a message" for each status, and 14 px on the
    phone (the text stays 16 px, so iOS does not zoom). The prompt box
    of the Mac is the round glass field of the
    phone. On the Mac, the Chat view keeps the focus in the prompt
    box, as in the terminal of Claude Code: the box gets the focus when
    the Chat view opens, and again after each click in the chat. A click
    that selects text, or a click on a picture, a video or a sound, keeps
    its own focus. In the empty box, the left arrow still goes back to
    the list. Type "/" in the prompt box for the slash commands, as in
    Claude Code: the skills and the custom commands of the user, of the
    project and of each enabled plugin (`my-skills:short`), then the
    built-in commands. The up and down arrows select, and Tab or Enter
    completes the name. Enter on a complete name sends it. A built-in
    command such as `/login`, `/cost` or `/model` opens a dialog on the
    screen of Claude Code, and the agent waits. So after the send, the
    app opens the session in Ghostty, where the user uses the dialog.
    In `claude -p`, `/login` says "isn't available", but a background
    session runs the full screen of Claude Code. While the agent runs,
    the view loads again every 3 seconds. It stays at the
    bottom when the user is at the bottom. A change of tab or project
    closes the view. The Mac shows the agent as the phone does. The row
    of the agent has the back button,
    the name in the center as "#6 Open demo folder", and at the right at
    most two actions. Under the name, small and grey, is the project of
    the agent with its icon, so the user sees where the agent works, also
    after a move. A running agent has the stop button and the three
    dots. An agent that is not running and not closed has the white check
    and the three dots. The check marks the agent as done (`close_worker`)
    and goes back. There are only two actions, because more buttons cut
    the name. The three dots hold the model, the effort,
    the permissions, the profile, Tunnel, Listen, Save for later, Open in Ghostty
    on the Mac, Rename and Complete. Tunnel shows when
    the chat has a site: the last localhost address or private address of
    the tunnel in the messages (`urlsOf` in `src/paths.ts`), else the site
    of the agent. On the Mac a localhost site opens in the viewer of the
    apps, as a site of the Canvas tab. The phone opens it as a tap on its
    link, through the tunnel. So the user does not look for the link. It
    has no status dot and no "#7" badge: the card of the Summary tab has
    the status, the model, the effort, the permissions and the profile, and the
    Preview row of the site. A double click on the name, Rename in the three
    dots, or ⌘R, opens a field that renames the agent in place
    (`rename_worker`). The number stays, Enter or a click outside saves
    the name, and Escape cancels. A sub-agent cannot be renamed. The
    field of the name
    and the Find field take the width of their scroll (`fitField`).
    Else WebKit makes them 1 or 2 px narrower than the text and the
    caret, so a caret at the end scrolls the field and cuts the left
    edge of the first letter: "Wireframe" shows as "Nireframe". The row
    of an agent in
    the list renames it in place too: a double click on its name on
    the Mac, or a double tap on the phone, opens the same field
    (`WorkerRow` in `src/App.tsx`). Enter or a click outside saves the
    name through `rename_worker`, and Escape cancels. An empty name or
    the same name saves nothing. So a single click on the name opens
    the agent after 300 ms (`DOUBLE`), when no second click comes. A
    click on the rest of the row still opens the agent at once. The
    row counts the clicks itself, as the double tap of the viewer, so
    the Mac and the phone act the same. ⌘E moves the effort of the agent
    one step up,
    and from the highest effort back to the lowest. A running agent gets
    the new effort one second after the last press, so it stops its turn
    one time. Under the header, the tabs show
    the views of the agent as a segmented control in the center, as on
    the phone (see below). A line under the tabs shows the profile,
    the model, the effort and the permissions as small dropdowns that
    change the agent, the globe of the site of the agent, and on the Mac
    the context, in each view, on the Mac and on the phone. The profile
    shows the usage of its week. On the phone a long choice ends in "…".
    With only the Context view, the tabs hide. A
    thin bar on the bottom edge of the head shows the part of the context
    window in use. Up in the chat, more than 300 px
    from the end, the tabs and the line hide, and the head ends under
    the row of the agent. The bar stays. They show again at the end,
    with the newest output, as the button that goes to the end. So the
    head of the phone is not too tall. On the Mac the line ends with the
    context as a number too, as "162k / 1M · 16%",
    or only the tokens when the window of the model is not known. The
    phone keeps only the bar. A check in WebKit finds the bar in each
    style, also with glass off, where it lies on the line under the head
    (`bun bridge/contextbar-e2e.ts`). On the Mac, the "Session" and the
    "Weekly" stacks of the title bar show in the top bar of an open
    agent, after the traffic lights,
    at the same place as in the title bar, and a click opens the Usage
    section of the settings. The phone keeps the row
    with no usage, because the name of the agent needs the room. The
    buttons of the title bar, of a conversation, of a settings page and
    of the card are glass circles, as on the phone: 28 px in the title
    bar, which keeps the height of the traffic lights, and 32 px in the
    other places. Else, in a narrow Mac window, "Open in" breaks onto two
    lines, and the chat stops with a hard edge under the tabs. Preview
    is in the card, not in the row. The row of the agent, the tabs and the
    message box float over the content, and the content runs under them
    with the blur of the phone (`.convo-blur`). The message box is the
    round glass field of the phone. Enter sends. The Mac has each paper
    clip of the phone: in
    the prompt box of an agent, in its talk bar, and in the new chat. The
    main screen has none, on the phone and on the Mac. On the Mac a paper
    clip opens the file picker of macOS at once (`openAttach`): any file,
    and a picture or a video goes as one. The phone has the camera, the
    photos and the location, so it opens the attach sheet. The round
    blue send button shows on the Mac too when the box has text. Over an
    open agent, the attached pictures are the stack of the phone, above
    the paper clip, because the agent covers their row under the call
    row. Preview is in the card on both. On the Mac, an open agent with
    no call covers the whole window, as
    on the phone (`cover` in src/App.tsx, `.sheet.cover`), so the title
    bar, the update, the call button and the tabs do not crowd its top.
    The traffic
    lights of macOS stay at the top left, so the row of the agent is under
    a strip of 36 px, as high as the title bar, as in the settings. The row
    reaches up over the strip, so the strip and the empty part of the row
    move the window. The row is not on the line of the traffic lights,
    because there the buttons are too close to the top. An update that
    waits does not show over
    the agent: it shows again on the list. During a call, the title bar
    and the call row stay over the agent, so that the user can end the
    call, and the tabs hide. A change of view moves the line with an
    ease-out curve
    and no bounce. The panel does not slide: the content of the new view
    fades in and rises a little, and the points of the summary come in
    one after another. A slide of the panels with the spring is too
    bouncy. The tabs say Summary and Context. The code and this wiki keep
    the old name `chat` and "Chat" for Context. While the agent runs,
    the end of
    the Context tab shows a shiny "Yondering…", as the spinner of Claude
    Code. The shine is the ShinyText of React Bits, as "Listening" in
    the talk view. No bird shows in front of the word. "Yondering…" shows
    only while a turn runs. When the
    turn ended and the agent waits on a background task, such as a wait
    or a Monitor, it says "Monitoring…", and both words show
    ("Yondering… · Monitoring…") when the turn runs beside such a task
    (`monitoring`, see Workers).
    A turn that the user interrupted shows a gray
    "Interrupted" in the place of the marker "[Request interrupted by
    user]" of Claude Code, and the marker does not show on the Chat
    tab. The bridge sets such an agent to waiting, as `stop_worker`
    does: Claude Code can list it as working with an idle process for
    good. Else the app shows "Yondering…". When the safety classifier
    of Anthropic stops a reply, Claude Code writes "No response
    requested." in its place. The bridge shows "Anthropic's safety
    classifier stopped this reply." there, on the Chat and Context tabs
    and as the result (`unstopped` in bridge/main.ts). A new message
    does not help such a task, because the classifier stops each reply
    again, so start a new task. Else the user sees only "No response
    requested.", and can think that the relay stalled. Claude Code also
    writes "No response requested." when a turn ends with no text from
    the model. With no classifier notice, that line does not show on the
    Chat and Context tabs. The result is then the last real reply of the
    agent (`visible` in bridge/main.ts). Most often the cause is Steer: a
    new message stops a turn before its first text, and Claude Code
    writes the line as the reply of that turn. The agent sees the line
    as its own reply, and can say sorry for it again and again. So
    the prompt of each agent (`SPOKEN`) tells it that it did not write
    the line, and that it must not name it. Summary gives a card, and then the points of the summary (see Bridge), in
    15 px text, with no heading, no task and no last answer. Each point
    is a plain line with no dot in front.
    The card (`agent-card`) shows the context in use with a bar, the
    time of the last turn, and the profile, the model, the effort and the
    permission mode as dropdowns (`Dropdown` of src/Settings.tsx: a native glass
    pill with a native menu on iOS 26). The Profile menu shows only when
    that CLI has a profile. Each row is the name and the percent of the
    week, such as "Work · 42%". A profile of another CLI shows the models
    of that CLI, from its default model, at once. The profile comes first,
    and the models follow it. A change works as in the three
    dots: a running agent continues at once on the new value, and any
    other agent gets it with its next message. A terminal session or a
    sub-agent shows its model and effort as text. On the phone the card
    also has the site of the agent (Yonder Preview) with a native glass
    button, and at the bottom the number, the status, the age and the
    project. The bridge has only the time of the last turn (`startedAt`),
    not the sum of all the turns, so the card says "Last turn".
    Until the points are ready, it shows the activity of a running agent,
    or "Summing up…".
    Chat gives the conversation, as close to the terminal of Claude
    Code as possible. Each tool call shows open, as the terminal shows
    it: a dot, the name and the main input, such as `Bash(git status)`,
    and under it the first 3 lines of the result after "⎿" and
    "… +N lines". A Read shows "Read N lines". The dot is green, red for
    an error (with the result in red), and it blinks while the call
    runs. A tap on a call opens its full input and result, as ctrl+o
    does in the terminal. The bridge gives them only on the tap
    (`/tool`), because the app reads the conversation every 3 seconds.
    The thinking of the agent shows as a closed "✻ Thinking…", and a
    tap opens it. Claude Code saves no thinking text for most sessions,
    and then no row shows. A tap on a tab changes
    the view. The app keeps the last view in `localStorage`
    (`convoView`), so the agent opens on the view that the user saw last.
    The prompt box shows under both views. There is no swipe between the
    views, because the user changes the view with the tabs only: a swipe
    to the right from any point in the view goes back to the list.
    A message to a done, failed or closed agent shows the agent as
    running at once, before the bridge answers. The back button and the
    back swipe then keep the tab: the row of the agent shows for a
    moment, then slides out to the left, and the rows under it move up
    (`leaving` in `src/App.tsx`). The whole row slides, and the red
    Delete button of the swipe does not show at its right. The agent
    shows on the Agents tab
    when the user taps that tab. The conversation stays on its tab
    while it is open, because a new panel loads it again and the sent
    message goes away for a moment.
    With the Summaries row of the Settings off, there is no Summary tab,
    and the app does not ask the bridge for a summary. When Chat is the
    only view (no sub-agents), the segmented control hides
    (`.convo-view.solo`), and the chat moves up into its place. The kept
    view (`convoView`) stays, so the agent opens on Summary again when
    the user turns the row on.
  - a third view, "Subagents 3", when the agent started sub-agents with
    the Agent tool. With the word task the view is "Subtasks 3", not
    "Tasks 3", the name of the tab of all the tasks. Each row shows the
    number of the agent and a letter
    (21A, 21B, 21C) in the color of its status, the description of the
    sub-agent, its type and model, and its time. A tap opens the
    conversation of the sub-agent in place of the agent, with Summary,
    Chat and the prompt box. Its header shows its number and letter, and it
    has no Complete, Close or Ghostty button. The back button goes back to
    the agent. A message in the prompt box goes to the sub-agent through
    its agent (see Bridge). The app tells Grok which sub-agent is open,
    so "tell it to ..." goes to 21B. The app does not keep the Agents
    view in `convoView`, because most agents have no sub-agents.
  - the pictures, videos and sounds of an agent in its conversation view,
    under the turn that names them, with the controls of the web view.
    The bridge finds them (`bridge/media.ts`). A message gives each media
    URL and the full path of each media file that exists. A tool result
    gives only cdn.visualsandbox.com URLs, such as the `result.urls` of
    `vsb run`, because a search can name many files. A Read of a picture
    gives that picture. Each one shows one time, at its newest mention,
    usually the final message. A Markdown image shows nothing, because
    the media row shows it. A local file comes from `/media?path=`, which
    serves only the files that a conversation shows. It answers Range
    headers, because WebKit plays a video only with ranges. The view goes
    to the bottom again when a picture or a video loads. A 3D model or a
    design shows only as a link.
    A hex color in the chat or the summary, such as #e5484d or #fff,
    shows a small square of that color before it (`HEX` and
    `rehypeSwatches` in `src/App.tsx`). A short form needs a letter, so
    "#123" stays an issue number.
    The word "ultrathink" asks Claude Code for deeper reasoning on that
    turn: Claude Code tests `/\bultrathink\b/i` on each prompt, also on a
    prompt of Yonder, and adds a note for the model. As in Claude Code,
    each letter of the word has a color of its rainbow, in a message of
    the user (`rainbow` in `src/App.tsx`, `.ultrathink` in `app.css`).
    On the bubble in the accent, the colors mix with the color of its
    text, so that they show on any accent. In the prompt box, a light
    goes over the word again and again, as in the prompt box of Claude
    Code. A textarea cannot color one word, so a mirror of the text lies
    on the field, with the same box and font, and the text of the field
    itself is clear (`Prompt`). The bridge writes "ultra think" and
    "ultra-think" as "ultrathink" (`withContext` in `bridge/main.ts`),
    because speech to text can split the word, and the `task` and
    `message` of Grok keep the word.
    A click or a tap on a picture or a video opens it in the viewer
    (`MediaItem` and `Zoom` in `src/App.tsx`). The viewer fills the whole
    window in black, with a × button at the top right. A video starts
    below the ×, and ends above its controls, so nothing covers it. The
    ×, Escape, or
    a click next to a picture at 1x closes it. A video in the chat does
    not play there: it shows its first frame and a play button, and the
    viewer plays it with the controls of the app (`Player` in
    `src/App.tsx`): back 10 seconds, play and pause, forward 10
    seconds, a bar to seek, the time that is left, and the sound. The
    controls always show. The skip buttons are round arrows with no
    number. The time counts down, such as "−0:28", and it is the only
    number, so it takes less room. On the phone, the buttons are 44 px
    with larger icons, and the bar to seek is not there: a tap on a skip
    button is easier than a drag on a thin bar. The time is at the left
    end and the sound at the right end. Each style of the gallery draws
    the bar with the same rules: sharp corners in Terminal and Omarchy,
    and the font of the style. Space plays and pauses. A
    right-click, or a long press on the phone, opens the menu of the
    app: Play or Pause, Mute or Unmute, Copy Path (Copy Link for a link
    of the web), Save, and Show in Finder for a file of this computer.
    The viewer does not use the controls of WebKit, which fade the video
    in black under the pointer and hide when the pointer leaves. The
    preview asks for the frame at
    0.1 s (`#t=0.1`), because WebKit draws no frame with
    `preload="metadata"`, and the video is black until the user plays
    it. In the viewer, a pinch with two fingers or on the trackpad, or ⌃
    with the scroll wheel, zooms a picture or a video from 1x to 8x. A double click
    or a double tap zooms to 3x at that point, or back to 1x. A drag or a
    scroll moves the zoomed picture. Safari sends a pinch on the trackpad
    as gesture events, and the phone sends touch events too, so the
    gesture events count only when no pinch of two touches runs. The
    pinch of two fingers reads the touch events, because the pointer
    events zoom in Chrome but not on the iPhone. Each pinch on the
    phone writes one "Phone pinch" line to `call.log`, with the counts of
    the touches, pointers and gesture events, until the pinch works on
    the iPhone. Only the main button of a mouse moves the picture. A
    right-click or a ctrl+click opens the menu, which takes the
    pointerup. Else the picture then follows the mouse. A first finger
    clears the earlier fingers, because the long press of the menu also
    takes the pointerup. A video zooms as a picture does, because the
    bar of its controls seeks, not a drag on the video.
    At 1x, a swipe up or down moves the picture and fades the black, as
    in Photos. A swipe of more than 100 px, or a flick, closes the
    viewer, and a shorter swipe puts the picture back. The pictures
    that the user attached to a message open in the same viewer.
    At 1x, a swipe to the right shows the picture before it in the same
    tab (Chat or Context), and a swipe to the left shows the picture
    after it, if there is one. A swipe of more than 50 px, or a flick,
    moves one picture, and a shorter swipe puts the picture back. On the
    trackpad, a swipe to the side with two fingers moves one picture.
    The row is the pictures of that tab in the order of the chat. A
    video and a picture of a message that waits are not in it.
    On a computer, the left and right arrow keys do the same, and the
    next picture starts at 1x.
    On the Mac, the keys also select a picture in the chat of an agent.
    ↓ at the end of the text of the prompt selects the newest picture or
    video. The arrows select the one before or after it, and Enter opens
    it in the viewer. Escape closes the viewer, and the selection is on
    the picture that the viewer showed last. Escape, or ↓ on the last
    picture, goes back to the prompt. `bun bridge/thumbkeys-e2e.ts`
    checks the keys.
    The iPhone plays each video in the player of iOS
    (`AVPlayerViewController`), when the app has the `play_video`
    command (`yonder_play_video` in `QuickLook.swift`): large buttons
    skip 10 seconds back and forward, with play and pause between them,
    the bar, AirPlay and Picture in Picture. The player turns with the
    phone, so a wide video fills the screen on its side. The app behind
    it stays upright. A video of the Mac goes as the bytes of its blob,
    and a video of the web, such as one of Visual Sandbox, goes as its
    URL, which the player streams. The sound plays also when the switch
    of the phone is on silent, but a live call keeps its audio. An older
    app has no `play_video`, so the video plays in the viewer of the
    page.
    The `quick_look` command (`QuickLook.swift`) opens a file in Quick
    Look, the viewer of iOS: the page sends the bytes of its blob, the
    command writes them to tmp/look, and the file goes when the viewer
    closes. A picture opens in the viewer of the page, not in Quick
    Look, because Quick Look has no swipe to close and its Done button
    is hard to see.
    A ↓ button left of the × saves the picture or the video that the
    viewer shows. On a computer, the bridge copies it to the Downloads
    folder (`POST /save`), with " 2" after the name when a file of that
    name is there, and the ↓ turns to a tick. A URL comes through the
    bridge, because Visual Sandbox gives no CORS headers. On the phone,
    the ↓ opens the share sheet, with Save Image, and Quick Look when the
    share sheet fails. `/media` also serves a URL that a conversation
    shows, so the phone gets its bytes. Android has no share sheet in its
    web view, so the ↓ does nothing there.
    A PDF that a message names, by its full path or by a link, shows as a
    card with its name (`PdfCard` in `src/App.tsx`, the kind `pdf` of
    `bridge/media.ts`). The card loads no bytes until a tap. On the
    iPhone, a tap opens the PDF in Quick Look (`quick_look`), and its
    share button saves it to Files. Another phone opens the share sheet.
    On a computer, a tap opens the PDF (`POST /save?open`): a PDF of
    this computer where it is, and a PDF of another computer as a copy
    in the Downloads folder. `/save` opens only a PDF, because `open`
    also starts an app or a script. So a PDF that an agent makes gets
    onto the phone.
  - the attached images under the call button, 88 px high with their own
    shape. A small × at the top right of each image removes it. A click
    on an image opens it in the viewer of the chat, where a swipe or an
    arrow key shows the other attached pictures. A hold of more than
    0.35 s shows the image large over the dimmed screen until the finger
    or the button lifts (`.peek`), with a light tap on the phone. The
    images stay in one row with the
    gutter of the call button, and the row scrolls left and right. On
    the phone, the images are a
    stack at the bottom left, opposite the + button and at its height:
    the newest image on top, and at most two more under it, turned a
    little and higher, so that their tops show above it, as a stack of
    files in the Dock of the Mac. Each is 50 by 66 px with a white edge and round corners. The top
    image turns 6 degrees to the left. A new image pops in with a spring
    of Motion, and the images under it spring to their new places. A tap
    opens the top image, and the × on its top right corner removes it.
    The images under it have no ×. An open conversation keeps the row at the
    top, because its prompt box is at the bottom. A send takes the
    images off the screen at
    once, as it shows the message at once: each image flies up to the
    right and fades. They come back when the bridge does not take the
    message. A
    dashed blue line shows around the window while the user drags a file
    over it.
- An error shows as a toast (`Toast` in `src/App.tsx`): a liquid glass
  pill at the top of the window, over the screen. It goes away by
  itself after 3 to 10 seconds (longer for a longer text), with a tap,
  or with a swipe up or to the side. A finger moves the toast, and a
  short drag springs it back. The timer stops while a finger holds it.
  A drag down only stretches it a little. The text has no red, and the
  toast has no ×.
- The actions of the user are optimistic: Close, Complete, Delete, Stop, the
  star of an agent or a project, Remove folder and Close Completed change the
  screen at once, before the bridge answers. The app keeps the change
  (`pending` in `src/App.tsx`) in each poll until the bridge answers, then
  reads the agents again. A failed call puts the agent back.
- Each tap, click and open feels instant, and this is a rule for all
  work (`CLAUDE.md`).
  These also change the screen at once: Send now, Edit and Delete
  of a queued message (`act` with a `queue` patch), Stop, a change of
  the model, the effort, the mode or the profile of a running agent, each row of the
  Settings (Preview, Model, Effort, Permissions, Steer, Summaries,
  Claude Code, the CLIs), Remove on the Tunnel tab, and Open Folder,
  the folder picker of the phone and New Project. A failed save of a
  setting loads the true value again. An agent that the user opens
  again shows its last chat at once (`turnsOf`), while the new chat
  loads. Face lock, pairing, sign-in and the tunnel switch still wait,
  because each needs a yes or a check first.
- Grok can also rename and close agents with its tools.
