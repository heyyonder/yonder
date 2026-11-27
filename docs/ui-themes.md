# Screens and styles

Status: phase 1 and phase 2 are built. "Built" below tells what the code does, and "Not
built yet" tells the gaps. This design builds on the thin shell
(`docs/shell.md`) and on the customization of the Canvas
(`docs/canvas.md`, "Customization").

## Why

Yonder uses the Claude Code that already runs on the computer of the
user, on the plan of the user. So it needs no expensive API. Yonder is
the interface between a person and their computer. The goal is to give
people the full power of their computer from their phone, and to let
them own it.

The screen is part of what they own. A user downloads a default screen,
or picks one of several screens, and can then build an own one: an agent
builds a custom screen to manage the agents, or only an own chat.

## In short

- A new user gets **Yonder**, the default screen, the moment the app
  opens. It needs no setup.
- Settings › Appearance › Screen shows a **gallery** of six samples
  with clearly different styles. A tap shows a sample live, on the real
  agents, and the user keeps it or goes back.
- **Build your own**: the user says what they want, and an agent builds
  the screen on the Mac. Each later request makes a new version, and the
  phone gets it in seconds.
- A screen is one of two kinds:
  - A **style** is data: one JSON file that changes the colors, the
    font, the shapes, the density, the tabs and the words of the default
    screen. It cannot break the app.
  - An **own screen** is a page that an agent wrote. It replaces the
    whole screen, in a sandboxed frame, and it reaches Yonder only
    through a small SDK.
- Each change makes a new version, and no version changes after it is
  made. A version that fails goes back to the last good version by
  itself. The default screen is always there under each own screen, and
  a quick action on the app icon opens it from anywhere.

## The samples

The four style samples change only the values of a style file. That is the test of the format. When a sample
needed more than these values, it became an own screen.

## The three layers on the phone

| Layer | What it holds | Who changes it | How it changes |
|---|---|---|---|
| The shell | The native kit, the phone abilities, the audio of the call, the pushes, the quick action | Only Yonder | A store release |
| The host screen | The encrypted link, the call, the default screen, the style engine, the frame for own screens, the gallery, the safe floor | Only Yonder | Over the air, with no notice |
| The screen of the user | A style or an own screen | The user and the agents, on the Mac | Over the air in seconds |

The host screen is the web code of Yonder that runs today. The default
screen stays in it, so the default never depends on a file on the Mac.

## A style

A style is one JSON file. The host screen reads it and draws the default
screen with its values. A value that is not valid keeps its default, and
an unknown key does nothing. So a style cannot break the app.

The keys are the keys that `phone.json` has today, the keys of the
Canvas, and some new keys: `talk`, `copy`, and `font`, `density` and `glass` in
`look`.

| Key | Values | Owner |
|---|---|---|
| `name`, `about` | The name and one line for the gallery | This design |
| `kind` | `style` or `screen` | This design |
| `from` | The sample and version that it came from, such as `terminal@1` | This design |
| `theme` | `light` or `dark` | phone.json today |
| `theme: auto` | The look of the phone | This design |
| `accent`, `chatFont`, `chatSize`, `summaryFont`, `summarySize` | As today | phone.json today |
| `look` | The color tokens for `dark` and `light`, and `radius` (only 0, sharp corners, changes the screen) | The Canvas |
| `look.font` | `system`, `rounded`, `serif` or `mono` | This design |
| `look.density` | `compact`, `normal` or `large` | This design |
| `look.glass` | `on` (Liquid Glass) or `off` (flat, with a line, and a tab bar of the full width on the bottom edge, also on iOS 26) | This design |
| `talk` | `bar` (the call button on top and a text box) or `big` (one big call button on the home tab, a big call screen, and hold to talk in a chat) | This design |
| `tabs` | The tabs: order, titles, icons, which show | The Canvas |
| `canvas` | The sections of the Canvas tab | The Canvas |
| `copy` | The words of the screen, by ID: `title`, `call`, `endCall` and `message` | This design |

The tokens are the CSS variables of `src/app.css`: `bg`, `panel`,
`hover`, `text`, `muted`, `line`, `accent`, `accent-text`, `green`,
`red`, `amber`, `blue`, `purple`, `live` and `page`. A style adds two
tokens for the call button: `call` and `call-text`.

The word for an agent (`agentName`, such as helpers) and the names of the
agents (`agentNaming`) stay in `config.json`. The voice, the
pushes and the tool descriptions use them too, so a style does not
change them. A style only uses them.

The Terminal sample, as a file:

```json
{
  "name": "Terminal",
  "about": "Mono type, green on black.",
  "kind": "style",
  "theme": "dark",
  "look": {
    "dark": { "bg": "#0b0b0b", "text": "#e2e2e2", "muted": "#7b7b7b", "line": "#242424",
              "accent": "#3ddc84", "accent-text": "#0b0b0b", "live": "#ff5f56" },
    "radius": 0, "font": "mono", "density": "compact", "glass": "off"
  },
  "tabs": [{ "id": "agents", "title": "agents" }, { "id": "completed", "title": "done" },
           { "id": "closed", "title": "closed" }, { "id": "preview", "title": "apps" }, { "id": "search", "title": "find" }],
  "copy": { "title": "~/all", "call": "$ call", "endCall": "■ end", "message": "> _" }
}
```

The native parts of iOS 26 take the colors of the text and the theme, as
before. A glass color and a shape for them (`glass`, `shape`, the props
of version 5 of the native kit) are not sent yet, so `glass:
off` and sharp corners change only the controls of the page.

## An own screen

An own screen is a page that an agent wrote: one HTML file with its CSS
and its scripts inside, of 1 MB or less, as an artifact of the Canvas.
The host shows it full screen in `<iframe sandbox="allow-scripts"
srcdoc>`, over the default screen. The host puts the SDK in front of
the page.

Why a page in a frame, and not a copy of `src/`:

- A store user has no source of Yonder on the Mac (`docs/shell.md`). A
  page needs no source and no build.
- A page of a few hundred lines is a task that an agent does well in
  minutes. `src/App.tsx` alone has about 5,800 lines.
- The host keeps the call, the link and the keys. So each update of
  Yonder reaches the users of own screens too, and the page cannot read
  what it does not need.
- The host is outside the page, so it can see a page that fails, and go
  back.

### The SDK

The page calls `window.yonder`. Each call goes to the host with
`postMessage`, and the host runs it through the encrypted link, as the
default screen does.

| Call | What it does | Today it is |
|---|---|---|
| `yonder.ready()` | Tells the host that the page shows. | New |
| `yonder.mice()`, `yonder.on("mice", fn)` | The agents, and each change. | `list_workers` |
| `yonder.mouse(id)`, `yonder.on("chat", fn)` | The chat of an agent, and each new message. | `get_worker` |
| `yonder.send(id, text)` | A message to an agent. | `message_worker` |
| `yonder.start(task, project)` | A new agent. | `start_worker` |
| `yonder.done(id)`, `yonder.close(id)` | Complete or close an agent. | `close_worker` with `done`, `close_worker` |
| `yonder.call.start()`, `.end()`, `.mute()`, `yonder.on("call", fn)` | The call of the host: its state, its level and its words. | The call of the app |
| `yonder.dictation.start()`, `.stop()`, `.cancel()`, `.on(fn)` | Speech to text: the words so far as events, and the whole text at the stop. Each screen has it. | The dictation of the prompt box |
| `yonder.open(place)` | Opens a screen of the host: `settings` or `default`. A page shows the chat of an agent itself. | New |
| `yonder.look` | The tokens of the active style, also as CSS variables in the page. | The Canvas |
| `yonder.tool(name, args)` | Another tool of the bridge, only when `tools` in the file names it. | The tools of the bridge |

The rules of a page:

- It starts at 0,0 of its frame. The host keeps the frame clear of the
  traffic lights and the title bar of the Mac (36 px at the top) and of
  the notch of the phone, so no page can go under them.
- On the phone the frame goes down to the bottom edge, under the home
  bar, and the page gets its space as `--under`, so a tab bar sits on
  the edge.
- A new version of it passes the check of `bridge/screen-lint.ts` at
  the Mac and the phone size before it goes live: no error, a call of
  `yonder.ready()`, and no text or control cut at an edge.

- It gets no phone ability, as an artifact gets none (Guideline 4.7.2).
  The call and the talk view are features of the host, with the
  permissions of Yonder.
- It gets no network. The frame has `connect-src 'none'`, and each call
  goes through the host.
- It gets no keys, no cookies, and no storage of the app.
- The calls of the table need no entry. `yonder.tool` reaches only the
  tools that `tools` in the file names. The gallery shows what a page
  can do: "This screen can read your agents, send messages and start
  agents."

The JSON file of an own screen has `"kind": "screen"`, `"page"` (the
HTML file of the version), `"sdk": 1`, `"tools"`, and the keys of a
style for its tokens.

## Where it lives

```
themes/<name>/                   The samples. They ship in the screen bundle, so the store app has them.
  theme.json  page.html  shots/  The style, the page of an own screen, and the pictures (themes/README.md).
themes/index.ts                  The list of the samples, for the screen and the bridge.
~/.config/yonder/themes/<name>/  Each screen of the user, one folder for each. ui/ is a link to themes/.
  1.json  2.json  3.json         One file for each version. A version never changes.
  3.html                         The page of version 3 of an own screen.
  CLAUDE.md                      The rules for the agents that change this screen.
  state.json                     The bad versions, and the agent and the request of each version.
~/.config/yonder/phone.json      "ui": "my-terminal" (the newest good version) or "my-terminal@2" (one version).
```

- The screens of the user were in `~/.config/yonder/ui/` before. At
  start, the bridge renames `ui/` to `themes/` when only `ui/` is
  there, and makes `ui/` a link to `themes/` (`screensRoot` in
  `bridge/ui.ts`). So an agent in the old path keeps working. The key
  `ui` of `phone.json` and the route `/ui` keep their names, because
  the phone apps in the stores use them.
- The `ui` key goes into `KEYS` of `src/phone-config.ts`. So the phone
  gets a change in about 5 seconds, through the version of `phone.json`
  in `/front`.
- The bridge serves the files of a version through the encrypted link
  (`/ui/<name>/<n>`), as it serves the artifacts of the Canvas. The
  phone keeps each version in its cache, so the screen opens with no
  network too.
- The order of the values: the default, then the active screen (`ui`),
  then the keys that the user set in `phone.json` by hand or in
  Settings. When the user picks a screen, the bridge moves these keys
  into the log, so the screen shows as it was made. Undo puts them back.
- Each Mac has its own `phone.json`, so the screen follows the Mac in
  use, as the look of the Canvas does.
- A screen folder is plain files. A user can copy it, put it in git, or
  send it to a friend.

## Switch, preview, fork, change, roll back

All of them work by voice and in Settings. The `customize` tool has
`list`, `use`, `reset`, `fork` and `versions`. The Canvas can add `get`
and `set` for the tabs and the sections of the Canvas.

- **Switch.** Settings › Appearance › Screen lists the samples, then the
  screens of the user, then "Build your own". Or the
  user says "Use the terminal screen." The phone shows the new screen at
  once, and the bridge writes `ui`.
- **Preview.** A tap on a row shows the screen live, on the real agents,
  with a bar: "Keep Terminal?" with Back and Keep. With no tap, the old
  screen comes back after 30 seconds. A style goes into the running page
  with no reload. An own screen loads in its frame over the host.
- **Fork.** Fork copies a sample or a screen into
  `~/.config/yonder/themes/<name>/1.json`, with `from`. Only a fork can
  change: a sample never changes, so a Yonder update cannot overwrite
  the work of a user. An agent can bring the changes of a newer sample
  into a fork when the user asks.
- **Change.** The user asks the voice agent or an agent: "Make the green
  blue." The agent writes the next version, and never edits a version
  in place. The phone gets it in seconds. A change to a sample makes a
  fork first.
- **Roll back.** The row of the screen in use opens its versions, each
  with its note, its time and Use. Or the user asks the voice agent for
  a version (`customize` with `use` and `my-chat@2`). A shake in the 10
  minutes after a change asks "Undo the screen change?".

## Build your own

1. The user taps "Build your own", or says "Build me a screen with only
   one chat."
2. Yonder starts an agent, "Screen builder", in a new folder
   `~/.config/yonder/themes/<name>/`, and opens its chat. The folder starts
   with `starter/` (the sample in use, else Dashboard) and a `CLAUDE.md`
   with the rules, the values of a style and the SDK.
3. The agent writes version 1. It tests a page at 402 px in headless
   Chrome with `/ui?name=<name>&n=1&try`, a page with a stand-in SDK
   and made-up agents.
4. The agent calls `customize` with `use`, and the phone shows the new
   screen. A shake or "use the default screen" goes back.
5. Each later request ("make the mic bigger") goes to the same agent, or
   to a new agent in the same folder, and makes the next version.

The rules in the `CLAUDE.md` of a screen folder:

- Make a style when the values of a style are enough. Make a page only
  when the layout must change.
- A page is one HTML file of 1 MB or less, and it uses only the SDK.
- Call `yonder.ready()` as soon as the page shows.
- Keep a way to start a call and a way to open the Settings
  (`yonder.open("settings")`).
- Test at 402 px, in the light and the dark look, before each version.
- Write a new version. Never change a version that exists.

## The safe floor

A broken screen must never lock the user out. Each layer below catches
what the layer before it misses.

1. **A style is data.** A bad value keeps its default. A style cannot
   remove the call button or the Settings.
2. **A page that fails the check.** The computer checks each new
   version of a page at the Mac and the phone size before it saves it
   (`bridge/screen-lint.ts`). A page that throws, that does not call
   `yonder.ready()`, or that cuts a text or a control at an edge
   becomes no version. The reason goes to `build.log` and to the answer
   of `customize` with `use`, so the agent fixes it first.
3. **A page that does not start.** The host waits 5 seconds for
   `yonder.ready()`. The SDK sends each error of the page to the host.
   When the page does not start, or throws before it is ready, the host
   marks the version as bad in `state.json` and shows the newest good
   version. With no good version, it shows the default screen. A toast
   says "My Chat v4 did not start. Back on v3." with Fix it, which
   gives the error to the agent of that screen.
4. **A page that starts but is no use,** such as a page with no call
   button. The user can say "Go back to the default screen" in a call,
   shake the phone (the shake asks "Undo the screen change?", as it asks
   for a close today), or pick the default in Settings. The host owns
   the call, the shake and the Settings, so the page cannot hide them.
5. **A page that freezes the web view,** such as a loop that never ends.
   The frame runs in the same web view, so the host freezes too. The
   quick action of the app icon, "Default screen", opens Yonder with
   the screen of the install, and the page clears `ui`. It works
   whatever the page does. It is native, so it comes in the native
   batch.
6. **A host screen that fails.** The host already goes back to the last
   good host screen, and then to the screen of the install.

## App Store rules

- A style is data of the user. It changes how the app looks, not what
  the app is.
- An own screen is web content that WebKit runs, from the Mac of the
  user, made when the user asks for it. Apple allows such code when it
  does not change the main purpose of the app (Guideline 2.5.2, and
  3.3.1(B) of the Developer Program License Agreement). Yonder stays a
  voice front end for the computer of the user, with or without it.
- A page gets no phone ability (Guideline 4.7.2). The host does the
  call and the talk view itself, as features of Yonder.
- The default screen works fully with no style and no page. So App
  Review sees the full app with no file from a Mac.

## Built, and not built yet

Built over the air, with no native build:

- The style engine: `src/look.ts` puts the tokens and the font in a
  `<style id="look">`, and the knobs as attributes of `<html>`
  (`data-sharp`, `data-glass`, `data-density`, `data-talk`), which
  `src/app.css` reads. `copy`, `tabsOf` and `tabTitle` give the words
  and the tabs to `src/App.tsx`.
- The samples in `themes/`, with the pages of Dashboard, Duet and Grok Bot. There is no
  Chat sample.
- The Screen settings in Settings › Appearance (`src/Looks.tsx`): the
  samples, Mine with the versions, Make X mine, Back to the default
  screen, and Build your own. The bar of a preview (`PreviewBar`).
- The frame and the SDK (`src/OwnScreen.tsx`), the 5-second
  `yonder.ready()` check, the bad versions and the toast.
- `ui` in `KEYS` of `src/phone-config.ts`, the route `/ui` and the
  `customize` tool in `bridge/main.ts`, the folders and the rules of a
  screen in `bridge/ui.ts`, and `/ui` in `PATHS` of `bridge/relay.ts`.
- The shake: "Undo the screen change?" for 10 minutes after a change,
  and "Use the default screen?" on an own screen.
- The quick action "Default screen" clears `ui`.
- Checks: `bun bridge/ui-check.ts`, and the `customize` lines of
  `bun run check-bridge`.

Built over the air: the controls of a theme. Only the
default screen has native controls on the iPhone. Each other theme draws
the tab bar, the buttons, the switches, the pickers, the alerts, the
attach sheet, the action sheet of the three dots and the approval cards
in its own look (`src/ask.tsx`, `src/Attach.tsx`, the flat rules of
`src/app.css` for `glass: off` and `font: mono`). A page reaches the
same actions with `yonder.attach.*`, `yonder.mice.choices()` and the
`images` and `opts` of `yonder.mice.start` and `yonder.mice.send`.

Not built yet:

- Hold to talk in a chat for `talk: big`. The big call button and the
  big call screen are built.
- A glass color and a shape for the native parts (see above).
- `yonder.native` for pages, and the share of a screen.
- The landing demo does not show the gallery yet.

## Phases

### Phase 1: styles and the gallery

No native build. It goes over the air.

- The style engine in the host: the tokens, `font`, `density`, `glass`,
  `talk` and `copy` on the default screen, and the colors and shapes as
  props for the native kit of version 5.
- `themes/` with the style samples.
- `ui` in `KEYS`, `/ui` in the bridge and in `PATHS` of
  `bridge/relay.ts`, and `list`, `use`, `fork` and `versions` on
  `customize`.
- The Screen list in Settings › Appearance, the preview bar, the
  Versions list, and the shake for a screen change.
- The landing demo shows the gallery, as `CLAUDE.md` asks.

### Phase 2: own screens and Build your own

- The frame, the SDK, `yonder.ready()`, the bad versions and the toast.
- The Dashboard sample, written on the SDK. It is the starter of each
  new page.
- The Screen builder: the start of the agent, `SDK.md`, the `CLAUDE.md`
  of a screen folder, and the test data of the SDK.

### Phase 3: the native floor and more

- The quick action "Default screen", in the native batch.
- Native parts for pages (`yonder.native`), from the native kit.
- Share a screen: a file or a link, and an agent that brings it in.

## Where each part is designed

| Part | Design |
|---|---|
| The shell, the abilities, the native kit, the live delivery, the rollback of the host screen, the quick action | `docs/shell.md` |
| The look keys, `customize`, the Canvas, the artifacts, the pinned tabs | `docs/canvas.md` |
| `agentName` and `agentNaming` in `config.json` | The settings of the agents |
| The gallery, styles as files, `ui`, own screens, the SDK, the Screen builder, the versions, the safe floor | This design |

## Open questions

1. The screen follows the Mac in use, as the look of the Canvas does. So
   a switch to the work Mac also changes the screen. Is that right, or
   should the phone keep one screen for all its computers?
2. A page gets only the SDK, no network. A screen that shows the
   weather then needs an agent to fetch the data, as a pinned tab of
   the Canvas does. Is that limit right?
