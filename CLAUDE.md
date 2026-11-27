# Yonder

Yonder is a voice front end for Claude Code on this Mac. You talk to a fast
voice agent. The voice agent sends work to Claude Code workers through a
local bridge, checks on them, and tells you the result in a few short
sentences.

The name means that agents go out "over yonder" to do the work and then
report back.

## Status

The first MVP is built and works. `README.md` is the short public page.
`docs/setup/` tells how to set up each platform, and `docs/guide.md` tells
how each part works and how to connect other agents. In a real voice call,
Grok hears the user, calls `list_workers`, and answers aloud. The voice is
Liora (`liora`).

## Commits

- Commit each feature or fix when it works. Do not ask the user first.
- Commit only your own changes. Other agents can work in this folder at
  the same time, so stage your files or hunks, not `git add -A`.
- A contributor works on a branch of a fork and opens a pull request
  (`CONTRIBUTING.md`). The maintainers keep their release rules in a
  `CLAUDE.md` outside this repository.
- A task is done only when its commits are on `main`. If you work in a git
  worktree, put your commits on `main` before you report the result:
  1. Commit your work in the worktree.
  2. Run `git rebase main` in the worktree, and fix each conflict.
  3. Leave the worktree with `ExitWorktree` (`action: "keep"`). Claude
     Code refuses git commands on the main checkout from inside a
     worktree, also with `git -C`.
  4. In the main checkout, run
     `git merge --ff-only <your branch>`.
  5. If the merge fails because `main` moved, enter the worktree again
     (`EnterWorktree` with `path`), and do steps 2 to 4 again.
- If another agent works on the same files and is not done, wait for it.
  Then merge. Do not leave work on a branch that is not `main`, because
  nobody else merges it.
- New worktrees start from the local `main` (`worktree.baseRef` is `head`
  in `.claude/settings.json`), because the commits on `main` are not
  pushed.
- `docs/wiki/` is the wiki of Yonder, one file for each part. Grok reads
  a part through the `about_yonder` tool when the user asks about Yonder.
  So when a change adds or changes what Yonder does, update the wiki in
  the same commit.
- A comment tells what the code does and why, never who asked or when.
  Git keeps when each change came. The same rule applies to the commit
  messages and to the wiki: they tell what and why, with no dates of
  requests, quotes or names. Without this rule, agents add dated
  comments again.

## Instant actions

- Each tap, click and open in the app changes the screen at once. Then
  the app calls the bridge. Do not wait for the bridge before the screen
  changes, because a wait for the bridge makes the app feel slow.
- For agents, use `act` with a patch (`pending` in `src/App.tsx`). For
  other data, set the state first, then call the bridge, and load the
  true value again when the call fails.
- Only a step that needs a yes or a check first can wait: a confirm
  dialog, Face lock, pairing, sign-in, or a tunnel that opens.

## Same controls everywhere

Use the same native buttons everywhere, so that each screen looks and
acts the same.

- On the phone, an icon button is a glass circle of 44 px: `.glass-plus`,
  or an `.icon` in the title bar, a conversation head or a page head.
- Give each such button `data-native`, `data-icon` and `data-glyph`. On
  iOS 26 it then gets a twin in native Liquid Glass (`src/chrome.ts`).
- An on and off setting is a switch (`OnOff` in `src/Settings.tsx`), the
  switch of iOS on the iPhone. A choice of more than two is a segmented
  control.
- On the iPhone, a dropdown is `Dropdown` in `src/Settings.tsx`: on
  iOS 26 a native glass pill with a native menu, and before iOS 26 a
  native `<select>`. A native button with `data-menu` opens a native
  menu. Elsewhere a menu is the glass menu of the page (`.menu`).
- An approval, a yes of the user before an agent or a link acts, is
  the approval card from the bottom (`Approval` in `src/Canvas.tsx`,
  `.attach-sheet.approval`), on the phone and on the Mac. It is never a
  modal dialog in the middle of the screen.
- A picker, such as Move to of an agent or Change icon of an app, is
  the same card from the bottom (`Picker` in `src/Canvas.tsx`), on the
  phone and on the Mac. Do not make a new modal dialog in the middle of
  the screen.

## The end-to-end test

- Do not run `bun run test` (`bridge/check.ts`) unless the user asks for
  it. It starts six real Claude Code sessions in a `yonder-check-` folder,
  and each session uses credits. A failed run leaves its sessions in the
  list of agents. The release gate of
  `release.yml` runs it before each staging release, with the upgrade
  test (`bun run check-upgrade`). See "Release gates" in
  `docs/wiki/install.md`.
- A check or a script for pictures starts Chrome for Testing (`CHROME` in
  `bridge/test-chrome.ts`), not `/Applications/Google Chrome.app`, and
  stops it with `closeChrome`. After SIGTERM or SIGKILL, Google Chrome
  leaves a copy of its app in the temp folder, and the checks can leave
  hundreds of them.
- A fake phone, a browser page with the user agent of an iPhone, uses
  a test bridge and its own config folder, as `bridge/themes-e2e.ts`
  does. Never point it at the bridge of the user on port 7787. It syncs
  `phone.json` as a real phone does, so its test settings reach the
  phone of the user. Else a screenshot script that forces the default
  screen removes the theme of the user from the real phone.
- To check a change to the bridge, use `bun run check`,
  `bun run check-bridge`, and a `curl` call to one tool of the bridge.
  `check-bridge` starts its own bridge and no workers, so it uses no
  credits. GitHub runs it on each push to `main` and to the `staging`
  branch (`.github/workflows/check.yml`, also called by `release.yml`).
- A push to the `staging` branch of `heyyonder/yonder` starts a release
  for the testers. Only the maintainers push there. See "Release gates"
  and "Production" in `docs/wiki/install.md`.

## Tools for Apple and Tauri work

- `sosumi` (MCP server) gives Apple's documentation, the Human Interface
  Guidelines and the WWDC transcripts as text. Read the API there before
  you write SwiftUI or UIKit code, because the APIs of iOS 26 and later
  can be newer than what you know.
- `xcodebuild` (XcodeBuildMCP) builds and runs the app in the simulator,
  and takes screenshots, the UI tree and videos. Only it shows the native
  SwiftUI parts of the phone.
- `tauri` (MCP server) reads the page, the console, the logs and the IPC
  calls of a debug build of the Mac app (`bun tauri dev`), through
  `tauri-plugin-mcp-bridge` in `src-tauri`. It does not reach the
  installed app. Its screenshot shows only the web view. The iPhone app
  does not have the plugin: version 0.13.1 does not compile for iOS.
- The `native-ios` skill lists the native parts of the iPhone app and how
  to add one.

## Run your changes

- A change only to the screen (`src/`) goes over the air, and needs no
  build. The bridge builds the screen by itself after the commit is on
  `main`, and the apps load it with no tap.
- A change to the bridge (`bridge/`): restart the bridge with
  `restart_bridge` when the work is on `main`. A restart only pauses the
  connection for about 2 seconds. The app, the call and the workers keep
  running, and the messages of the phone wait in a queue.
- A change to a native shell needs a new build. A rebuild of the Mac app
  quits Yonder and ends the live call, so wait until no call is live.
  `bun run install-app` builds, installs and opens Yonder. Do not open
  `src-tauri/target/.../Yonder.app`, and do not copy the build over a
  running Yonder: each of these puts a second Yonder in the Dock.
  `bun run install-ios` is the debug build of the phone on the cable, and
  it needs `IPHONE`.

## Settings by hand

`~/.config/yonder/config.json` holds the settings of the Mac, such as the
model range, the permission mode and `defaultFolder`.
`~/.config/yonder/phone.json` holds the settings of the phone, such as the
theme and the fonts. You or the user can edit both by hand, with no
restart. The keys and their values are in `docs/wiki/projects.md`.

## Architecture

```
You (voice)
   │  microphone / speaker
   ▼
Voice agent ── Grok (xAI) realtime voice API, in the app window
   │  function tools = the MCP tools of the bridge
   ▼
Bridge ── bridge/main.ts, an MCP server at http://127.0.0.1:7787/mcp
   │  starts, tracks and resumes workers        ▲
   ▼                                             │ any other MCP client
Workers ── claude --bg, one background session for each task, in a project folder
```

## The wiki

`docs/wiki/` tells how Yonder works now, and why: what each part does,
how it works, and each bug that a fix prevents. Git keeps who asked for a
change and when, so the wiki does not. The wiki is large, so it is not in
this file. Claude Code loads this file into each agent, and the wiki in
this file costs each agent many tokens on each turn.

The wiki has one file for each part, and `docs/wiki/index.md` lists the
parts with one line each. A new part needs a line in the index, because
`about_yonder` takes the topics from it.

Before you change a part of Yonder, read its file in the wiki. Search
it with `grep -n` for the names that you change, and read only those
sections.
