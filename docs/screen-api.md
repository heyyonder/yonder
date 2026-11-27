# The screen API of Yonder

This is the design of the screen API of Yonder, for the developers of
Yonder. The agents that build a screen use the skill `yonder-screens`
(see below). The design and its reasons are in `docs/ui-themes.md`.

## The idea

The phone app is a skeleton: the link to the computer, the voice call,
the native parts and the phone abilities. Each front end runs on top of
it and reaches it only through one API, `yonder`. The default screen of
Yonder is one front end among many. A front end of the user is a folder
on the computer, and the computer sends it to the phone over the air.

| Front end | Where it runs | How it reaches the API |
|---|---|---|
| Yonder (the default) | In the app itself (`src/App.tsx`) | `import { yonder } from "./api"` |
| Chat, Dashboard (samples) | A sandboxed frame | `window.yonder` |
| A screen of the user | A sandboxed frame | `window.yonder` |

The two ways have the same calls and the same answers. `src/api.ts` is
the only code that talks to the bridge, the call and the abilities for a
front end. `src/OwnScreen.tsx` only passes the calls of a frame to it,
with the gates below.

## The skill for the agents

The guide for each agent that builds or changes a screen is the skill
`yonder-screens`: `bridge/skills/yonder-screens/SKILL.md` with its
`references/` (the API of a page, the theme tokens and the values of a
style, the kit and the patterns). The bridge writes it into
`~/.claude/skills/yonder-screens/` at each start (`bridge/skill.ts`), so
each Claude Code agent finds it. `/ui?guide` gives the whole skill as one
page, and the `CLAUDE.md` of each screen folder points to it.

`bun bridge/skill-check.ts` fails when the skill does not match the real
API: a call of `window.yonder` (`src/OwnScreen.tsx`), a token, a class of
the kit, an ability, a tab, a look key, a sample, an action of
`customize` or a size of the check that the skill does not name, or a
call that the skill names and the page does not have. The GitHub check
runs it. So a change of the API changes the skill in the same commit.

Its last step is the layout check. It opens each section of the
Settings in each sample theme and in a custom screen, in the light and
the dark look, at 320 and 375 pt. It fails when two parts of a row
overlap, when a part leaves its row, or when a text is cut or spills
(an ellipsis is allowed). To check another part of the screen, such as
a sheet, a menu or a dialog, add a case to `CASES` in step 8: a name,
`open`, the selector of its rows, and `close`.

## Settings from one schema

The Settings come from one schema, as the settings of VS Code.

- **The schema** is the folder `bridge/settings/`: one file for each
  section, which is one page of the Settings, such as `general.json`,
  `agents.json` or `appearance.json`. A file has the `id`, the `name`
  and the `icon` of its section, `only` (`phone`, or `mac` for the Mac
  app), and `settings`, the rows of the page in order.
  `bridge/settings/index.ts` gives the order of the sections, and the
  Settings list them in that order. The name of Agents is the word of
  the user, such as Tasks.
- The user adds settings in `~/.config/yonder/settings.json`, a list of
  settings, each with a `section`: the id of a section, or a new id,
  which adds a page at the end of the list. A setting has `key`,
  `label` and `control`: `toggle`, `dropdown`, `segmented`, `text`, `number`,
  `slider`, `list`, or `custom` with a `component` name. A setting with
  a value also has `type` (`boolean`, `string`, `number`, `enum` or
  `list`), `default` and `store`: `config` for config.json of the
  computer, `phone` for phone.json, `claude` for a key of `settings.json` of
  Claude Code in each of its config folders, such as `advisorModel`,
  or `device` for one device only, such
  as Isolate computers: its value stays in the localStorage of that
  device, never goes into phone.json, and never syncs. A `claude`
  switch with `on` writes that value when it is on, and deletes the key
  when it is off. `help` is the note under its box,
  `group` puts rows in one box, `words` are other words for the search,
  `options` (`{ value, label }`) are for a menu, and `min`, `max` and
  `step` are for a number. `only` (`phone` or `mac`) shows a row on one
  device. `sync: true` backs the value up to the Yonder account, so it
  follows the user to each device (`bridge/sync.ts`). A setting with no
  `sync` stays on its computer. Never mark a path, a login, a key or a
  setting of one device, such as the Tunnel or the wake word.
- **The route** `/settings`: GET gives the schema and the values of
  config.json. POST `{ key, value }` writes one value of config.json
  after the check of its type and of the check of the key in
  `SETTINGS` of `bridge/main.ts`. A value of phone.json stays on each
  phone, which syncs it.
- **The page**: `SchemaRows` in `src/Settings.tsx` draws the rows of one
  section in the order of the schema. A `custom` row is a named part of
  the app, which the section gives in `parts`. General comes all from
  the schema (`update`, `pair`, `lock`, `push`, `vault`, the Tunnel, the
  Summaries and the Chat). In Agents and Usage, the plain rows of the
  schema show at one place, and the other rows are still parts of the
  page. The search finds each setting of the schema by its label and
  its words.
- **A new setting** is one entry in the schema. A new key goes into
  config.json with no new build. The bridge or a screen reads it there.

## The rebuild of the default screen

The default screen uses the same API as an own screen. The
default is `src/App.tsx` and its parts (`Settings.tsx`, `Vault.tsx`,
`Schedules.tsx`, `Attach.tsx`, `Lock.tsx` and the other parts in
`src/*.tsx`). `bun src/api-check.ts` counts their direct calls to the
bridge, the voice and Tauri (`bridgeFetch`, `link.fetch`, `callTool`,
`call`, `invoke`). The count is 0, and the check fails
when it goes up.

The calls on the API: the tool calls of `App.tsx` (the list of the
agents, the actions of an agent, the projects, a new agent, undo), the chat
(`yonder.chat.*`), the attachments (`yonder.media.*`,
`yonder.recording.*`), the commands of the native shell
(`yonder.native.*`), the routes of App.tsx and of the parts of the
Settings, the asks of the Canvas (`yonder.show.*`), and the settings
(`yonder.settings.*`). A chat of another computer gives the fetch of
that computer after the id, such as `yonder.chat.get(id, link.fetch)`.
`yonder.chat.get` fails with the reason of the bridge when the chat does
not load, and takes the number of turns as the third argument. These calls are for the default screen only: a page gets
only the calls of the list in `src/OwnScreen.tsx`.

## The handoff

Built: the API, the frame host, the kit, the phone
abilities with the yes of the user, the screens folder with the build,
the gzip and the import, `customize` with `new` and `import`, the guide
at `/ui?guide`, the Settings from one schema, and the move of each direct
call of the default screen onto the API. What is left:

1. **The other sections of the Settings on the schema.** Steer, Tunnel, Summaries, Detail, Group tool calls and Agent names
   are rows of the schema. Word for an agent is the named part
   `agentName`. Voice, Appearance (Theme, Color, the fonts), Keys and
   the rows of Profiles (Permissions, the model, the ranges: their
   schema entries are there as `custom`) still draw their rows in the
   page. A section with `"home": false` stays out of the home list.
2. **The pages of a section of the user** show only the plain rows of
   the schema: a section of the app draws its rows where its page puts
   `SchemaRows`.
3. **Undo of a setting.** `/settings` keeps no old value, so `undo`
   cannot take a change back.
4. **The fetches given as values.** The check does not see a fetch that
   the code gives as a value, such as `postJson(bridgeFetch, ...)`,
   `useCanvas(..., link.fetch)`, `/media` and `/speak`.
5. **The kit** is a copy of the look of the default screen, not the same
   code.
6. **A computer with an older bridge.** An older bridge
   has no `/settings`. `yonder.settings.schema()` then gives the schema
   of the build with the defaults, so General can show a wrong value
   after a switch to that computer, until its bridge updates.
