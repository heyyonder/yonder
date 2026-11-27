# Yonder Canvas

Status: built as the Canvas tab (the "Apps" part of the wiki,
`docs/wiki/apps.md`). Phase 1 is built: the Canvas tab, the artifacts
and the approvals. `docs/wiki/apps.md` tells how it works. Phases 2
to 4 are a proposal.

## The idea

Yonder is the voice-first agentic OS that you can reach from anywhere.
The Canvas is the screen of that OS. When an agent wants to show the user
something, it makes a real web page on the Mac. The phone shows the page
in its web view. It is not a video stream, so it has no lag. The agents
build on the Mac, so a change shows in seconds, with no app release.

The Canvas is one surface for four things:

1. **Sites**: the web servers of the projects, such as a dev server or
   Storybook. This is the Tunnel tab of today.
2. **Artifacts**: small pages that agents make to answer the user, such
   as the weather in Paris and in Dubai. Each agent keeps its own
   artifacts: its canvas.
3. **Approvals**: an agent that needs the user asks with a native sheet:
   a yes or a no, a 2FA code, a payment (such as a Stripe Checkout
   page), a password from 1Password, or terms. A password and terms
   need a yes from the phone, with no Face ID, or Touch ID on a Mac.
4. **Live views** (phase 4): a live picture of one browser tab, only for
   a step that needs the real session, such as a captcha.

The user also gets **pinned tabs** (phase 3): "give me a tab with all my
analytics" becomes a page that stays in the tab bar.

## The rule: a thin shell that never limits

The rule: most users get Yonder from the App Store or
Google Play, and they do not build it. So the store app is a thin,
general shell, and it never limits them.

- **The phone abilities are an API.** Location, camera, photos,
  microphone, notifications, Face ID, haptics, clipboard, share and
  files are one API with permissions. The bridge and the agents call it.
  `get_location` is the first ability.
- **All the UI comes from the Mac of the user.** The tabs, the layout,
  the colors, the themes, the components and the words come from the
  Mac and its config. The agents of the user change them when the user
  asks, and the phone gets the change over the air.
- **The native parts are a fixed kit.** The page gives each native part
  its place, size, icon, text, color and visibility. Only a
  new kind of part, or a new native behavior, needs a store update.
- **The page code updates by itself,** with no blue button.
- **App Store:** only web content and data come over the air, never
  native code.

So the Canvas, the customization and the pinned tabs are page code and
data on top of the API and the native kit (`docs/shell.md`).

## Customization

Customization is a main part of the Canvas, not an extra. The user asks
in words, and an agent changes the app.

### What the user can change

| Part | The user says | What changes |
|---|---|---|
| The look | "Make it a warm light look." | The color tokens, the corner radius and the font, for the light and the dark look. The native parts take the same colors. |
| The tabs | "Put Canvas first." "Hide Closed." | The tab list: the order, the titles, the icons, and which tabs show. |
| The Canvas | "Put the weather card on top." | The sections of the Canvas tab and their order: pinned pages, approvals, artifacts and sites. |
| New screens | "Give me a tab with all my analytics." | An agent builds a page, and the page becomes a tab or a section of the Canvas (phase 3). |
| The words | "Call my agents helpers." | `agentName` (the word, and the icon of the tab) and `agentNaming` in config.json, which exist. |

### Where it lives

- The look is in `~/.config/yonder/phone.json` on each Mac, next to
  `theme` and `accent`, which are there today. `src/phone-config.ts`
  already syncs this file with the phone. So the user and each agent
  can read and edit the look as a file.
- Each Mac has its own file. The phone takes the look of the computer in
  use, as it does today for the other settings.
- A sketch of the new keys (phase 2 fixes them):

```json
{
  "look": { "dark": { "bg": "#161616", "accent": "#ececec", "live": "#ff5c61" }, "light": {}, "radius": 16 },
  "tabs": [{ "id": "preview", "title": "Canvas", "icon": "layers" }, { "id": "agents" }, { "id": "completed" }, { "pin": "a7f3", "title": "Analytics", "icon": "chart" }],
  "canvas": ["pin:wx1", "approvals", "artifacts", "sites"]
}
```

- The tokens are the CSS variables of `src/app.css`: `bg`, `panel`,
  `hover`, `text`, `muted`, `line`, `accent`, `accent-text`, `green`,
  `red`, `amber`, `blue`, `purple`, `live` and the glass tints. A key
  that is not in the file keeps its default.

### How a change gets to the phone

1. The user asks the voice agent or an agent.
2. It calls `customize`, a new MCP tool, with `get`, `set` or `reset`.
   The bridge checks each value, writes phone.json, and logs the change.
3. The phone gets the change in about 5 seconds, with no reload: `/front`
   has a version of phone.json, so the phone syncs the
   file when it changes. The Canvas adds its keys to `KEYS` in
   `src/phone-config.ts`.
4. The page sets the tokens as CSS variables. It sends the colors to the
   native parts as props (see "The contract with the native shell"), so the glass
   and the tab bar change too.
5. The phone shows "Agent 4 changed the look" with Undo.

### The contract with the native shell

The design of the native shell is `docs/shell.md`.

- **The native shell owns** the phone abilities, the native kit, the live
  delivery of the screen and the fast path.
- **The Canvas owns** the look config, `customize`, the theming, the
  Canvas and the pinned tabs.
- **Native props of kit version 5** (`chromeVersion >= 5`): a button
  takes `glass` (the color of its glass), `color` (its icon and text),
  `text`, `symbol`, `shape` (circle, capsule or rect), `w`, `h`, `badge`
  and `prominent`. The tab bar takes `tint` (the open tab). Each tab
  item takes `badge` and `symbol` next to its id, title and icon. The
  page sends resolved CSS colors, such as `#hex` or `rgb(…)`. An older
  app ignores these props, so the page keeps its own controls as the
  fallback.
- **The approval sheet** is one general native sheet from props: the
  title, the agent, rows of label and value, the amount, a one-time-code
  field, choices, a terms link, two buttons (one can be destructive),
  Face ID first, and the end time. It gives back `{ button, value,
  choice }`, or null when the user closes it or it expires. The sheet of
  the page is the fallback.
- **Abilities for the Canvas:** Face ID and haptics through their
  plugins today, then the success, warning and selection haptics, the
  native `share` and `pasteboard`, and Approve and Deny on a push from
  the native batch. For a push with Approve and Deny, the bridge sends
  `category: "approval"` and the id of the ask in the data of the push.
- **Artifacts never call an ability.** Only the bridge and the agents do,
  with the yes of the user.

### Safety

- The look is data. A bad value falls back to its default, and an
  unknown key does nothing.
- The look cannot remove the call button or the Settings. So the user
  can always say "reset my look", and the voice agent calls `customize`
  with `reset`.
- Each change goes into the log with the agent that made it. Undo and
  the `undo` tool take it back.
- An agent changes the look only when the user asks for it.

### Artifacts follow the look

The bridge puts the tokens of the look into each artifact as CSS
variables. So a page that an agent makes looks like the app by default,
and it changes with the next theme.

## What exists, and what is new

Most of the parts exist. The Canvas joins them.

| Part | Exists today | New for the Canvas |
|---|---|---|
| Sites | The Tunnel tab: the sites of all the computers, the filter, the switches. A site opens in the browser of Yonder (SFSafariViewController on iOS, Custom Tabs on Android), which already has "Open in Safari" or "Open in Chrome". | The tab becomes the Canvas tab. Its value stays `preview`. |
| Pictures in a chat | `/media` with the `shown` list, and the cache of the phone (`useBridgeSrc` and `loadBlob` in `src/bridge.ts`). | An artifact is one more kind of media: an HTML file in a sandboxed frame. |
| Approvals | `askUser` and the `/ask` hook, `ask` of the agent, `/permission`, and the "Allow X?" dialog. The `secret` kind for 1Password (`docs/secrets.md`). | `ask` gets a kind, a title, rows, an amount, a code field, choices, Face ID and an expiry time. |
| Face ID | `unlock()` in `src/Lock.tsx` (the biometric plugin). | It moves to the API of the phone abilities. |
| Phone settings | phone.json and `src/phone-config.ts`, with `theme` and `accent`. | The keys `look`, `tabs` and `canvas`, and the `customize` tool. |
| Open on a device | `show_on_device`, `toShow` and `/show` (a poll every 3 seconds on the phone). | An item of `/show` can be an artifact, not only an address. |
| The Claude call | The `app` events of `GET /brain` (`show_tab`). | `show_artifact` and `preview` give `app` events too. |
| Schedules | The schedules. | A pinned tab gets new data from a schedule (phase 3). |
| Native controls | The twins (`data-native`, `data-icon`, `data-glyph`, `chromeVersion`). | The native kit (`docs/shell.md`). |

## The tools of the voice agent

During a call, the user says "show me an artifact of what we're
building", and the page opens on the phone at once.

| Tool | What it does |
|---|---|
| `show_artifact` (new) | The voice agent gives the HTML itself and a title. The bridge keeps it and opens it on the device of the call. With only `id`, it opens an artifact again. With `id` and HTML, it adds a version. An agent gives `path` (a file that it built) in place of HTML. |
| `build_artifact` (new) | For a larger page. It starts an agent with the task and the rules of an artifact. The agent calls `show_artifact` when the page is ready, and the page opens on the device of the call. When the call ended, a push tells the user. It is `start_worker` with one more sentence. It has its own name only because a voice agent picks a tool by its name. |
| `customize` (new) | Gets, sets or resets the look, the tabs and the Canvas sections. See "Customization". |
| `show_tab` with `preview` (exists) | Opens the Canvas tab. This is "show_canvas". |
| `preview` with `open` (exists) | Opens a site in the browser of Yonder, through the tunnel. This is "open_preview". |
| `ask_user` (new, for agents) | Asks for an approval and waits for the answer. See "Approvals". |

How the artifact gets to the device of the call:

| Who calls | The path |
|---|---|
| Grok | The app runs each tool of Grok through `/mcp`, so the result comes back to the phone of the call. The app opens the artifact from the result, with no poll. |
| The Claude brain | Its tools come through `/mcp?brain=<call>`. The bridge gives an `app` event in `GET /brain`, as for `show_tab`, and only the device of that call reads it. `preview` with `open` needs the same `app` event, because today its result stays in the bridge. |
| Each agent, also of `build_artifact` | Nothing opens by itself, also with `id` alone. The artifact shows in the chat of the agent and in the Canvas, with a dot until the user sees it. An agent does not open a site either. |

## Artifacts

- An artifact is one HTML file of 1 MB or less, with its CSS and its
  scripts inside. Its pictures are data URLs or https URLs. It is made
  for a phone first. A larger page or an app is a site.
- The bridge keeps each version in
  `~/.config/yonder/canvas/<id>/<version>.html`, and the list in
  `state.json`: the id, the title, the agent or the call, the versions
  and the times.
- The chat of the agent shows each artifact where it came, as it shows
  a picture now. The card shows a still of the page
  (`/shot`), and only a tap opens the live page. The sheet of the agent gets a Canvas tab next to Chat,
  with only its artifacts, the newest first. That is the canvas of the
  agent.
- An artifact of the voice agent belongs to its call. It shows in the
  transcript of that call and in the Canvas.
- The phone gets the HTML through the encrypted link, as a picture, and
  keeps it in the same cache. So an artifact opens at once the next
  time, also with no network.
- The phone shows it in `<iframe sandbox="allow-scripts" srcdoc>`. The
  page cannot read the app, its keys, its cookies or the other
  artifacts, and it gets no native ability. Its links open in the
  browser of Yonder.
- A page sends a change to its computer with
  `parent.postMessage({ yonderSend: data }, "*")`, and gets
  `{ yonderSent: data, ok }` back. The bridge writes the data as a JSON
  file in `canvas/<id>/inbox/`, for a job of the user to read and
  delete (`canvas.send` in `bridge/canvas.ts`).
- On iOS the viewer ends at the top of the keyboard while a text field
  of the page has the focus, so a sheet fixed at the bottom of the page
  sits on the keyboard. A form or a choice in a page is a sheet from the
  bottom, never a dialog in the middle.
- A tap opens it full screen, with Share, Pin and Close. Share gives the
  file, or a link through the tunnel for some minutes.
- The artifacts of a closed agent go after 30 days, unless the user
  pinned one.

### Why artifacts do not use the tunnel

Artifacts must be end-to-end encrypted. The tunnel is Cloudflare Tunnel. Cloudflare ends the TLS,
so Cloudflare can read each page (`docs/wiki/preview.md`). The
relay link of Yonder is end to end: the relay cannot read it. So
artifacts go through the relay link, and sites keep the tunnel. There are two more gains: an artifact needs no
tunnel, and it shows also when the Tunnel is off.

## Approvals

An agent calls `ask_user`, and the call waits for the answer. The kinds:

| Kind | Example | Face ID (none in Yonder) |
|---|---|---|
| `yes-no` | "Can I delete the old branch?" | No |
| `code` | The 2FA code that GitHub sent by text. The field has the `one-time-code` type, so iOS offers the code from Messages. | No |
| `choice` | "Plus or Pro?" | No |
| `pay` | A payment page: a Stripe Checkout link, such as the link of `vsb topup`, or the approval page of a Link spend request (the `create-payment-credential` skill). The sheet shows the task, the shop, the amount, why, and the host of the page. Pay opens the page, and the user pays there. | On the page |
| `secret` | A password, a key or a code from 1Password (`docs/secrets.md`). The sheet shows the item, the vault, the site and the use. | Phone, or Touch ID on a Mac |
| `terms` | The terms of a service, with a link to read them. | Phone, or Touch ID on a Mac |

- The approval has the shape of the `secret` kind: `{ id, kind, title, rows:
  [[label, value]], faceId, until }`. The Canvas adds `amount`,
  `choices` and `code` where a kind needs them.
- An approval expires at `until`: after 10 minutes by default, and after
  5 minutes for `pay`. The bridge starts each agent with an
  `MCP_TOOL_TIMEOUT` that is longer than that, so the call can wait.
- The phone shows the approval sheet at once when the app is open, and
  sends a push when it is not. The Canvas lists each approval that waits
  at the top.
- Face ID comes from the API of the phone abilities (today `unlock()`). The
  passcode of the phone is the fallback, as for the Face ID lock.
- **Payments.** The agent asks with `pay` and the `link` of the
  payment page, such as the Stripe Checkout link of `vsb topup`. Pay
  opens that page on the device: Safari on the phone, the browser on the
  Mac. The user pays there, and Stripe or Link asks for Face ID or a
  code. Yonder never keeps or charges a card, and the agent never clicks
  Pay. A yes means only that the page opened, so the agent checks the
  result, such as with `vsb balance`. The Page row is the host of the
  link, not a text of the agent. A `pay` with no link is refused.
- **Passwords** (`docs/secrets.md`). The 1Password token is
  sealed to the pairing key of the phone, so only the phone can open it.
  After Face ID, the phone sends a key to `/vault/approve`, and the
  agent gets the secret for that one use. The log never holds a value.
  The Canvas sheet shows the `secret` kind and keeps the Approve handler
  of the vault (`approveSecret` in `src/vault.ts`).
- The prompts of today ("Allow Bash?") use the same sheet. A question of
  an agent (`AskUserQuestion`) can use the choice sheet too. Today
  `/ask` skips it, and it goes to the chat.
- The bridge writes each approval to `~/.config/yonder/approvals.jsonl`:
  the time, the kind, the agent, the question, the answer, the device,
  and Face ID yes or no. It never writes a password, a code or a card.
- After a yes, the agent does the work on the Mac itself. In a browser
  it uses browser-harness and the Chrome of the user, as today. A native
  app needs computer use, with the mouse and the keyboard as the CUA
  drivers do it (phase 2).
- The approvals need `/permission` in `PATHS` of `bridge/relay.ts`,
  else Allow and Deny on the phone get 403 through the relay.

## Pinned tabs (phase 3)

- "Give me a tab with all my analytics": an agent builds an artifact,
  and `customize` adds it to `tabs`. Or it goes into `canvas` as a
  section, such as the weather on top of the Canvas.
- A schedule runs an agent or a script that writes new data
  into the folder of the artifact. The page reads only the files of its
  own folder, through the app and the encrypted link.
- A page that needs a phone ability, such as the location, never calls
  it. The agent asks for it through the API of the phone abilities, with the yes
  of the user, and writes the result into the data of the page.
- On iOS 26, Search can move to the round button at the end of the tab
  bar, as in the apps of Apple, so that more tabs fit.

## Live view (phase 4)

- A live view is only for a step that needs the real session, such as a
  captcha. The agent calls `live_view` with the tab and the part of the
  page that matters (a CSS selector).
- The research is in `docs/tunnel.md` ("Live View"). WebRTC sent a tab
  as video at about 300 kbps. JPEG pictures of the CDP screencast took
  about 2,000 kbps.
- The first version sends the CDP screencast of that one tab through the
  encrypted link, and the phone shows only the part. A captcha changes
  little, so pictures are enough. WebRTC, with the TURN of Cloudflare,
  comes when the pictures are too slow.
- Taps and keys go back to the tab with CDP (`Input.dispatchMouseEvent`
  and `Input.insertText`).
- The view ends when the agent says done, when the part leaves the page,
  or after 5 minutes.

## Live UI: the audit, and what changed

From an audit of the live UI:

- The iPhone app is a Tauri shell with a web view. Each start loads the
  screen of the installed build. Then `startFront` (`src/front.ts`) runs
  a newer screen from `localStorage` in its place. The phone downloads
  that screen from the bridge (`/front?bundle`, about 430 KB, through
  the relay). Android works the same way. For example, an iPhone runs
  TestFlight 2.89.461 with the screen 2.89.473 over the air.
- The Mac app from the source loads its page live from the bridge, so a
  change shows in seconds.
- Nothing builds `dist/` by itself. A tap on Update, or an update by
  voice, runs `vite build`. So the blue button does two jobs: it builds
  the new screen, and on the iPhone it also loads it.
- The iPhone loads a new screen only after that tap or at its next
  start. This was a precaution against black screens. Their cause, `paint_window`, is fixed: it painted a full-screen window
  of UIKit over the app.
- A screen that does not show the app in 8 seconds goes back to the
  screen of the install, not to the last good screen.
- The native controls are twins (`src/chrome.ts`). The page already
  gives them their place, size, icon, label, tint, state, visibility,
  menu items with SF Symbols, and the titles and icons of the tabs.
  Swift fixes their kinds, their shapes and the glass. A button has no
  text, and a tab has no badge.

What changed later:

- The screen updates with no button. The bridge
  builds `dist/` by itself after each commit that changes the screen. A
  build with only new CSS goes into the running page at once, also
  during a call. Another build loads when the app goes to the
  background. A screen that fails goes back to the last good screen.
- `get_location` is the first phone ability that
  each agent and each voice agent can call.

The native shell gets the rest of the API of the phone abilities and the
kit with more props. The Canvas needs from its one native build: a badge
on a tab, the native approval sheet, and Approve and Deny on a push. The
Canvas tab itself needs no native change, because the tab bar already
takes its title and its icon from the page.

## App Store rules

- Yonder downloads only web content and data. Apple allows code that
  WebKit or JavaScriptCore runs, when that code does not change the main
  purpose of the app (Developer Program License Agreement 3.3.1(B), App
  Review Guideline 2.5.2).
- Guideline 4.7.2 says that an app must not give native features to web
  content that it did not make. So an artifact and a pinned page get no
  native ability. The bridge and the agents call the API of the phone, and
  the app draws the approval sheet itself.
- Each phone ability asks the user through the system prompt, with its
  purpose string, and Yonder adds its own yes for each agent.
- A look, a tab list and a page are data of the user. They change how
  the app looks, not what the app is.

## Security

- Each artifact and each live view shows only what its agent gives it.
  A sandboxed frame cannot read the app, the other artifacts or the
  keys. Phase 1 tests that the frame cannot call a native command of
  Tauri.
- Artifacts, approvals and live views go through the encrypted link.
  Only sites use the tunnel, and only after a yes or a switch.
- An approval expires by itself, a live view ends by itself, and a share
  link ends after some minutes, as today.
- Each approval and each change of the look goes into a log.

## Phases

### Phase 1 (MVP): the Canvas, artifacts and approvals

It needs no native build: the phone gets it over the air, and the bridge
restarts.

- The bridge: `bridge/canvas.ts` (the store, the versions and the list),
  the tools `show_artifact`, `build_artifact` and `ask_user`, the route
  `/canvas` (the list and the files), the larger `ask` with the kinds
  of the approvals, the `call` path, the `app` events for the Claude brain, and
  `/canvas` in `PATHS` of `bridge/relay.ts`.
- The app: the Canvas tab in place of the Tunnel tab, with its sections
  in the default order of `canvas`. The artifact frame in a chat, the
  full-screen viewer, and the approval sheet of the page with Face ID
  for all the kinds, also `pay` and `secret`.
- The landing demo shows the Canvas tab, as `CLAUDE.md` asks. The wiki
  gets a Canvas section.
- The tests: a call that asks for an artifact (headless Chrome with two
  computers), a `pay` and a `secret` approval with Face
  ID in the simulator, and `bun run check-bridge`.

### Phase 2: customization and native approvals

- The `customize` tool and the keys `look`, `tabs` and `canvas`. The
  tokens become CSS variables and native props, and the toast gives
  Undo.
- The native approval sheet, the badge of the tab, and Approve and Deny
  on a push, from the native kit.
- Computer use for native apps after a yes.

### Phase 3: pinned tabs

- A page as a tab or as a Canvas section, new data from a schedule, and
  phone data through the API of the phone abilities.

### Phase 4: live view

- `live_view`, the cropped screencast, taps and keys, and the end by
  itself. Then WebRTC if the pictures are too slow.

## Open questions

1. The live view starts with screencast pictures, and WebRTC comes only
   if they are too slow. Is that right?
2. The look comes from the Mac in use, so a switch to the work Mac also
   changes the look. Is that right?
