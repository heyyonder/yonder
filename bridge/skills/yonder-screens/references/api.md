# The API of a page: window.yonder

Each own screen gets `window.yonder` before its own scripts run. It is
the same API that the default screen uses (`src/api.ts`), with the gates
of a page (`src/OwnScreen.tsx`). `bun bridge/skill-check.ts` fails when a
call of the page is not in this file, or when this file names a call
that the page does not have.

Each call gives a promise. An error is an `Error` with a message for the
user. Each `on...(fn)` gives a function that stops the listener.

## The page

| Call | What it does |
|---|---|
| `yonder.ready()` | Tells the app that the page shows. Call it as soon as the page draws. |
| `yonder.theme()` | The look in use: `"light"` or `"dark"`. The `<html>` of the page also has `data-theme`. |
| `yonder.on("theme", fn)` | `fn(theme)` when the look changes (Light, Dark or System in the Settings). |
| `yonder.word` | The word of the user for an agent: `{ one, many, One, Many, naming }`, such as `task` and `Tasks`. Show it, never a fixed word such as "agents". `naming` is `numbers`, `names` or `projects`: with `names` or `projects`, show no `#` before `label`. |
| `yonder.icon(name)` | The SVG of an icon of Yonder as text, such as `mic`, `phone`, `settings`, `check`, `back`, `plus`, `search` or `message`. |
| `yonder.icons` | The names of all the icons. |

## The agents (the tasks)

| Call | What it does |
|---|---|
| `yonder.mice.list()` | The open agents: `{ id, num, label, name, project, task, status, activity, summary, next, model, effort, context, startedAt, createdAt, updatedAt, unread, attention, avatar, owner }`. `owner` is there only when two people share the computer (see The people). `status` is `running`, `waiting`, `done` or `failed`. `context` is a percent. `next` is the question of an agent that waits. `label` is what the screen shows for an agent: its number, such as `2`, or its name, such as `Jack`. Show `label`, not `num`. `avatar` is `{ shape, color }` when the user picked a picture for the agent, else it is not there. The calls take `id`. |
| `yonder.mice.closed()` | The closed agents, for the Closed tab, in the same shape. |
| `yonder.mice.on(fn)` | `fn(list)` on each change of the open agents. |
| `yonder.mice.start(task, project?, images?, opts?)` | A new agent. With no project, Yonder picks one from the task. `images` are the paths from `yonder.attach`. `opts` is `{ model, effort, mode }` from `yonder.mice.choices()`. Gives `{ num, id }`. |
| `yonder.mice.send(id, text, images?, opts?)` | A message to an agent, with the paths from `yonder.attach` and the same `opts`. To change only the model, the effort or the mode of an agent, send `"."` with `opts`. |
| `yonder.mice.choices()` | The lists for the pickers of a theme: `{ models, efforts, modes }`, each a list of `{ value, label }`. |
| `yonder.mice.stop(id)` | Stops the turn of an agent. |
| `yonder.mice.done(id)` | Marks an agent as done (Complete). |
| `yonder.mice.close(id)` | Closes an agent. It goes to the Closed tab. |
| `yonder.mice.rename(id, name)` | Gives an agent a new name. |
| `yonder.mice.avatar(id, { shape, color })` | Gives an agent its picture: the name of a shape of your page (`a` to `z`, `0` to `9` and `-`, 24 or less) and a color such as `#ff6700`. The bridge keeps it, so each phone and each Mac show the same picture. An agent with no `avatar` gets a picture from the page: the samples `duet` and `grok-bot` save a surprise one with the id of the agent as the seed, so two phones save the same one, and wait 5 seconds after the start of an agent, so the look that the user picked on another phone comes first. A page that saves nothing draws a default from `num`. |
| `yonder.chat.get(id)` | The chat of an agent: `[{ who, text }]`, where `who` is `user`, `assistant` or `tool`. Ask again every few seconds while it shows. |

## The people

Two people or more can share one computer, each with their own phones (`people` in `config.json`). Each agent then has
`owner`, the id of the person who started it. No `owner` means the main person. With one person, the list is empty: show
no part for people.

| Call | What it does |
|---|---|
| `yonder.people.list()` | `{ people, me }`: each person as `{ id, name, main }`, and `me`, the id of the person of this device. One person or none: `people` is empty. |
| `yonder.people.scope()` | `"mine"` (the agents of `me` only, the default) or `"all"` (the agents of each person). |
| `yonder.people.setScope(scope)` | Changes the scope. `yonder.mice.list()` follows it at the next change of the list. |

## Attach

The actions of an attach menu. The camera and the pickers of photos and
files stay the ones of iOS. Draw the menu yourself, and call one of these
from the tap of the user.

| Call | What it does |
|---|---|
| `yonder.attach.camera()` | Opens the camera. Gives `{ path }` of the photo on the computer, or `null` when the user takes none in 2 minutes. |
| `yonder.attach.photo()` | Opens the photo picker. Gives `{ path }` or `null`. |
| `yonder.attach.file()` | Opens the file picker. Gives `{ path }` or `null`. |
| `yonder.attach.paste()` | Attaches the clipboard: a picture, or the text as a file. Gives `{ path }` or `null`. |
| `yonder.attach.location()` | Attaches the location of the phone as a map. Gives `{ path }` or `null`. |
| `yonder.attach.version()` | Attaches the version of the app on this phone and the version of the environment on the computer. Gives `{ path }` or `null`. |

Give the paths to `yonder.mice.send` or `yonder.mice.start` in `images`.

## The call

| Call | What it does |
|---|---|
| `yonder.call.state()` | `{ phase, since, muted, available }`. `phase` is `idle`, `connecting` or `live`. `since` is the start time. `available` is false on a computer: calls are only on the phone. |
| `yonder.call.on(fn)` | `fn(state)` on each change. |
| `yonder.call.start()` | Starts the voice call. The phone owns the microphone. |
| `yonder.call.end()` | Ends the call. |
| `yonder.call.mute()` | Mutes or unmutes the microphone. |

## Dictation

Speech to text with no call. Name `dictation` in `abilities` of
screen.json. A call stops it.

| Call | What it does |
|---|---|
| `yonder.dictation.start()` | Opens the microphone. |
| `yonder.dictation.on(fn)` | `fn({ text })` with the words so far, or `fn({ error })`. `yonder.on("dictation", fn)` is the same. |
| `yonder.dictation.stop()` | Closes the microphone, and gives the whole text. |
| `yonder.dictation.cancel()` | Closes the microphone, and drops the words. |

## The workspaces

A workspace is a named group of agents, with one home folder or none.
`path` is the key of a workspace: its folder, or `"workspace:<id>"` for
a workspace with no folder.

| Call | What it does |
|---|---|
| `yonder.workspaces.list()` | The workspaces: `{ id, name, path, starred, folder?, description? }`. |
| `yonder.workspaces.current()` | The workspace of the switcher: `{ name, path }`. The path `"*"` is All workspaces. |
| `yonder.workspaces.select(path)` | Picks the workspace of the switcher. `"*"` is All workspaces. The default screen follows it. |
| `yonder.workspaces.on(fn)` | `fn(workspace)` when the workspace of the switcher changes. `yonder.on("project", fn)` is the same. |
| `yonder.workspaces.star(path, starred)` | Stars or unstars a workspace. The starred workspaces come after All workspaces and Yonder. |
| `yonder.workspaces.icon(path)` | The favicon of a workspace as a data URL, or `""` when it has none. Show no empty box for `""`. |

`yonder.projects` is the old name of `yonder.workspaces`, with the same
calls: `yonder.projects.list`, `yonder.projects.current`,
`yonder.projects.select`, `yonder.projects.on`, `yonder.projects.star`
and `yonder.projects.icon`. An older screen that uses it still works.

## The approvals

| Call | What it does |
|---|---|
| `yonder.approvals.list()` | The questions that wait for the user: `{ id, kind, mouse, title, rows, faceId }`. `kind` is `permission` for a tool to allow, or another kind for an approval of an app. `mouse` is the number of the agent. `rows` are the lines of the card. |
| `yonder.approvals.answer(id, allow, extra?)` | Allows or denies. An approval with `faceId` needs a yes from the phone; it asks for no Face ID. `extra` is `{ value }` or `{ choice }` when the card asks for one. |

`yonder.mice.on` also fires when an approval comes or goes, so read the
list again there.

## The settings and the screens

| Call | What it does |
|---|---|
| `yonder.settings.get()` | The settings of this phone: `theme`, `chatFont`, `chatSize` and the other keys of phone.json. |
| `yonder.settings.schema()` | Each setting of the Settings, with its `key`, `label`, `section`, `control` and `value`. |
| `yonder.settings.set(key, value)` | Changes a setting of the phone. A page cannot change a setting of the computer. |
| `yonder.settings.open()` | Opens the Settings of Yonder over the page. |
| `yonder.screen.list()` | `{ samples, mine }`: the samples and the screens of the user. |
| `yonder.screen.use(id)` | Shows another screen. `"yonder"` is the default screen. |
| `yonder.screen.rename(id, name)` | Gives a screen of the user a new name. It gives `{ n }`: the new version, or `null` when nothing changed. |
| `yonder.usage.get()` | The Claude Code usage: `{ week, session }` in percent, and `limits`. |
| `yonder.apps.list()` | The apps of the agents that are not in the archive, the newest first: `{ id, title, icon, at, mouse, saved }`. `icon` is SVG markup, one emoji, or a picture as a data URL, or it is not there. Each screen has an Canvas tab. |
| `yonder.apps.archived()` | The apps in the archive, with `archived`: the time when each one went there. Its files stay on the computer. |
| `yonder.apps.open(id)` | Opens an app over the screen, in the viewer of Yonder. |
| `yonder.apps.archive(id)` | Moves an app to the archive. A delete of an app is an archive. |
| `yonder.apps.restore(id)` | Brings an app back from the archive. |
| `yonder.apps.remove(id)` | Deletes an app and its files forever. Yonder asks the user first. Use it only for an app in the archive. |
| `settings.appsView` | `"list"` or `"grid"`: how the user wants the Canvas tab, from `yonder.settings.get()`. Show the apps as a grid of icons with the name under each when it is `"grid"`, and change it with `yonder.settings.set("appsView", ...)`. |

## The phone and the tools

| Call | What it does |
|---|---|
| `yonder.phone.ability(name, args)` | An ability of the phone. Name each one in `abilities` of screen.json. The user says yes once on the phone. See the list below. |
| `yonder.tool(name, args)` | Any other MCP tool of Yonder, only when `tools` of screen.json names it. For the Canvas tab: `show_app`, `change_app` and `remove_app` (it archives a page; `forever` deletes it), and `preview` with `{ "action": "list" }` for the sites. |

### The abilities of the phone

| Name | Args | What it does |
|---|---|---|
| `location` | | The location: `{ latitude, longitude, accuracy_meters, at, map }`. |
| `haptic` | `{ style }`: `light`, `medium`, `heavy`, `soft` or `rigid` | A tap that the user feels. |
| `notify` | `{ title, body }` | A notification on the phone. |
| `open` | `{ url }` | Opens a link of any scheme. |
| `face_id` | `{ reason }` | Asks for Face ID: `{ ok }`. |
| `photo` | | Takes a photo with the camera. |
| `save_photo` | `{ url, name }` | Saves a picture in Photos. |

The native app of the phone adds these, when its version has them:

| Name | Args | What it does |
|---|---|---|
| `share` | `{ text, url, files }` | The share sheet. |
| `copy` | `{ text }` | Puts the text on the clipboard. |
| `paste` | | The text of the clipboard. |
| `contact` | | The contact picker. |
| `event` | `{ title, start, end, location, notes, url }` | The editor of a calendar event. |
| `device` | | The state of the phone, such as the battery and the network. |
| `badge` | `{ count }` | The number on the app icon. |
| `awake` | `{ on }` | Keeps the screen on. |
| `confirm` | `{ title, message, buttons }` | A native dialog. Each button is `{ id, title }`. |
| `sheet` | | A native sheet of the kit of the phone. |

A name that the phone does not have gives an error. So catch it, and
hide the part that needs it.

## Version 1

The samples use some short calls of version 1. They still work, but use
the calls above in a new page.

| Call | Same as |
|---|---|
| `yonder.mice()` | `yonder.mice.list()` |
| `yonder.mouse(id)` | `yonder.chat.get(id)` |
| `yonder.send(id, text)` | `yonder.mice.send(id, text)` |
| `yonder.start(task, project)` | `yonder.mice.start(task, project)` |
| `yonder.done(id)` | `yonder.mice.done(id)` |
| `yonder.close(id)` | `yonder.mice.close(id)` |
| `yonder.on("mice", fn)` | `yonder.mice.on(fn)` |
| `yonder.on("call", fn)` | `yonder.call.on(fn)` |
| `yonder.open("settings" \| "default")` | `yonder.settings.open()`, `yonder.screen.use("yonder")` |

## What a page cannot do

- It has no network. Each call goes through this API.
- It has no storage of the app and no keys.
- It cannot read the files of the computer or change other screens.
- It runs in a sandboxed frame. An error in it never breaks the call, the
  Settings or the shake.
