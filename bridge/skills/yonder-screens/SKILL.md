---
name: yonder-screens
description: Build or change a screen of the Yonder app on the phone and the Mac - a theme, a style, the colors, the accent, the light and dark look, or a whole own front end in ~/.config/yonder/themes/<name>/. Use when a task names a Yonder screen, theme, style, layout or skin, when the working folder is under ~/.config/yonder/themes/ (or its old link ui/), or when the customize tool of Yonder sent the task. Covers the folder, the window.yonder API, the theme tokens, the parts that each screen must have, the check, the preview, the rollback, fork and rename.
---

# Yonder screens

Yonder installs this skill for Claude Code. The source is
`bridge/skills/yonder-screens/` in the Yonder repository, and the bridge
also serves it at `$YONDER_BRIDGE/ui?guide` (`http://127.0.0.1:7787` when
`YONDER_BRIDGE` is not set).

A screen is the look of the Yonder app on the phone and the Mac. The app
is a skeleton: the link to the computer, the voice call, the native parts
and the phone abilities. A screen sits on top of it and reaches it only
through the API `window.yonder`.

## Two kinds of screen

- A **style** is one `screen.json` with values for the default screen:
  the colors, the font, the corners, the density, the glass, the talk
  layout, the tabs and some words. It cannot break the app. Read
  [references/style.md](references/style.md).
- An **own screen** (`"kind": "screen"`) is a web page that replaces the
  whole screen, in a sandboxed frame. Read
  [references/api.md](references/api.md) and
  [references/patterns.md](references/patterns.md).

Use a style when the user wants other colors, fonts, words or tabs. Use
an own screen only when the user wants another layout.

## The folder

Each screen of the user is a folder: `~/.config/yonder/themes/<name>/`. The
name has `a` to `z`, `0` to `9` and `-`.

| File | What it is |
|---|---|
| `screen.json` | The manifest: `name`, `about`, `kind`, the values of a style, `tools` and `abilities`. You change it. |
| `index.html` | The page of an own screen, with its local `.js`, `.css`, pictures and fonts. You change it. |
| `package.json` | Optional. With a `build` script, the computer runs `bun run build` and takes `dist/index.html` (or the folder in `"dist"` of screen.json). |
| `source/` | Only after an import: the link to the folder of the user, or a Git clone. Change the files there. |
| `1.json`, `1.html`, `2.json` ... | The versions. The computer makes them. Never write or change them. |
| `state.json` | The notes, the bad marks and the hash of the source. The computer makes it. Never change it. |
| `build.log` | The output of the last build, and the reason that a change did not become a version. |
| `CLAUDE.md` | A short note that points to this skill. The computer writes it. |

## How a change gets to the phone

1. Change `screen.json` or `index.html` (or the files in `source/`).
2. After 2 seconds with no change, the computer runs the build (when
   there is one). It puts each local script, style sheet, picture and
   font into one page. A path to the web stays as it is and shows
   nothing, because the page has no network.
3. The computer runs the check (see "The check"). It saves the page as
   the next version only when the check passes and the page changed.
4. Each phone that shows this screen gets the new version in seconds.

The page must be 4 MB or less, and 1 MB or less when gzipped. A build
must give one entry script with no dynamic imports. For Vite, use
`vite-plugin-singlefile`.

## The parts that each own screen must have

The user leaves the default screen for your page. So the page must still
do the main jobs of Yonder. Do not remove one of these parts unless the
user asks for it.

1. **`yonder.ready()`**. Call it as soon as the page draws. A page that
   does not call it in 5 seconds, or that throws first, is marked bad.
2. **The tabs Tasks, Done and Closed.** Tasks has the agents with the
   status `running`. Done has `waiting`, `done` and `failed`. Closed has
   the list of `yonder.mice.closed()`. Use `yonder.word` for the word of
   the user, such as "Tasks", never a fixed word.
3. **The project switcher.** Put `<y-projects></y-projects>` of the kit
   in the top bar. It shows the project with two small arrows, and a tap
   opens all the projects over the page, as in the default screen. Show
   only the agents of `yonder.projects.current()`: the path `"*"` is All
   projects. Draw your own only when the user asks for it.
4. **The approval cards.** Show each item of `yonder.approvals.list()`
   with Allow and Deny, and answer with `yonder.approvals.answer()`. A
   agent waits until the user answers.
5. **The call.** A button that starts and ends the voice call
   (`yonder.call.*`), with the state from `yonder.call.on()`. Show it
   only when `available` of the state is not `false`: a computer has no
   calls.
6. **The light and the dark look.** Use only the CSS variables of the
   theme, or rules on `:root[data-theme="dark"]`. Never set fixed colors
   for the text and the background.
7. **Your own components.** A page gets no native control. Draw each
   control with the kit (`y-button`, `y-tabs`, `y-field` ...) or with your
   own HTML and CSS. Give each control a size of 44 px or more. The
   attach menu, the action sheets, the buttons, the pickers and the
   approval cards are yours to draw; each of their actions is a call of
   the API (`yonder.attach.*`, `yonder.mice.*`, `yonder.approvals.*`).
   Only the camera and the pickers of photos and files stay the ones of
   iOS.

On the iPhone, only the default screen (`yonder`) has the native controls
of iOS: the glass tab bar and buttons, the switches, the menus, the
alerts and the attach sheet. Each other theme, also a style, gets the
page forms of these controls in its own look. A style with `glass: off`
gets flat sheets and boxes with a line, and `font: mono` adds the marks
of a terminal (`>` rows, `*` choices, small letters).
8. **A way back.** Keep a button that calls `yonder.settings.open()`, so
   the user can pick another screen.

The app keeps each page clear of the traffic lights of the Mac and of the
notch of the phone. Start the page at 0,0. Do not add space at the top,
and do not read a safe area. On the phone the page goes down under the
home bar. The CSS variable `--under` is the height of the home bar (34 px
on an iPhone with Face ID, 0 on the Mac). Put `padding-bottom:
var(--under)` on the last part of the page, such as the tab bar or the
text box. `y-page` of the kit does it for you.

## The check

Before the computer saves a version of an own screen, it opens the page
with made-up agents in headless Google Chrome, at the size of the Mac
window (1000 by 664 px) and of the phone (402 by 812 px). The version
fails when the page:

- throws an error,
- does not call `yonder.ready()` in 5 seconds, or
- cuts a text or a control at the left, the top or the right edge. A part
  in a list that scrolls or clips to the side is not cut.

The reason goes into `build.log`, and `customize` with `use` gives it
too, such as: `the control "Call" goes 24 px past the right edge at 402 by
812 px (the phone)`. Fix the page, and the next change makes the version.

To run the check yourself before you finish (with the build, and with no
new version):

```sh
curl -s -X POST "${YONDER_BRIDGE:-http://127.0.0.1:7787}/ui" -d '{"action":"check","name":"<name>"}'
```

It gives `{"ok":true}`, or `{"ok":false,"error":"..."}`. A computer with no
Google Chrome skips the check. The 5-second `ready()` check of the app
stays there.

## Preview

1. Get the newest version with a stand-in API and three made-up agents:
   `curl -s "${YONDER_BRIDGE:-http://127.0.0.1:7787}/ui?name=<name>&try" -o try.html`
2. Take pictures in headless Chrome at 402 by 874 px, in the light and
   the dark look. Add `--force-dark-mode` for the dark look. Look at the
   pictures.
3. Show it on the phones: the `customize` tool of Yonder with `use` and
   the name.

## Rollback

- A version never changes. To go back, use an older number:
  `customize` with `use` and `my-chat@2`, or the versions in Settings ›
  Appearance.
- A page that fails on the phone is marked bad. The phone then shows the
  newest good version, else the default screen, with a toast.
- A shake of the phone asks "Undo the screen change?" for 10 minutes
  after a change.
- `customize` with `reset`, the Settings, and the quick action "Default
  screen" of the app icon go back to the default screen.

## Fork and rename

- `customize` with `fork` and a sample or a screen makes a copy that the
  user owns, such as "My Terminal", and uses it. A sample never changes,
  so `customize` with `change` forks a sample first.
- `customize` with `rename` gives a screen the new name in `words`. A
  sample becomes a screen of the user first. The folder name stays, and
  the rename makes a new version. A page can call
  `yonder.screen.rename(id, name)`. You can also change `name` in
  `screen.json`.

The `customize` actions are `list`, `use`, `reset`, `fork`, `versions`,
`new`, `import`, `change`, `rename` and `delete`. The samples are `yonder` (the
default), `dashboard`, `big`, `terminal`, `omarchy`, `playful`, `duet` and
`grok-bot`. The page of `dashboard` is a good start for an own screen. `duet`
and `grok-bot` give each agent a picture, and fit the keyboard of the phone.
`bun bridge/themes-e2e.ts` in the Yonder repository checks them on the phone.

## Finish

1. Run the check, and look at the pictures in the light and the dark
   look.
2. Call the `customize` tool of Yonder with `use` and the name.
3. Tell the user that a shake of the phone, or "use the default
   screen", goes back.
