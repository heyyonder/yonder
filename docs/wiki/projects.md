# Projects

The projects are workspaces (see Workspaces above). This part tells how
the projects work, and most of it applies to the workspaces with a
folder.


- Yonder keeps a list of project folders that workers can use.
- A new install lists only the folders that the user adds. An older
  install also lists each folder in `~/Sites` and `~/Developer`
  (`state.scan`).
- When Yonder has no project and a new agent names none, the bridge
  makes `~/Yonder` (an empty folder with a git repository), adds it to
  the list, and starts the agent there (`homeProject`).
- A new agent for the home folder also starts in `~/Yonder` (`notHome`).
  Claude Code trusts the home folder for one session at a time, so
  `claude --bg` refuses it: "Workspace not trusted. The home directory is
  trusted one session at a time". The bridge does not save a trust for
  the home folder, because the trust of a folder also counts for each
  folder under it that is not a repository.
- Yonder is not sandboxed, so it needs no permission for `~/Sites` or
  `~/Developer`. macOS asks once for a protected folder, such as
  Desktop, Documents, Downloads or iCloud Drive.
- You can add any folder from anywhere on the laptop.
- While the search of the projects or of the sites has text, its plus
  button is an X. A tap on the X clears the search.
- Add folder, at the right of the search of the projects, also works on
  the phone. The phone cannot show the folder dialog of macOS, so it
  opens a sheet (`src/FolderPicker.tsx`) that starts at the home folder
  of the Mac. Tap a folder to open it, "‹ Back" to go up, and "Add
  <name>" to add the open folder. The sheet reads the folders with the
  bridge tool `list_folders`, which skips dot folders and
  `node_modules`. Grok has the tool too.
  - For Desktop, Documents, Downloads and iCloud Drive, macOS asks on
    the Mac the first time, and the read waits for the answer. So
    `list_folders` stops after 5 seconds and tells the phone to click
    Allow on the Mac. The bridge uses an async `readdir`, so the wait
    does not stop the bridge.
  - The phone needs a bridge with `list_folders`. An older bridge gives
    an error in the sheet until `restart_bridge` or an update.
- "Create a new project": Grok calls `create_project`. It makes an empty
  folder in `~/Sites` with a new repository, and the name becomes the
  folder name ("recipe app" is `recipe-app`). Grok shows the project, and
  starts an agent there with what the user wants to make, or asks first.
  File > New Project… in the app
  does the same, in the folder that the user picks.
- You can star a project. Starred projects go to the top of the list.
- Yonder is always the first project. Drag a starred project, or press
  Option and an up or down arrow, to put it in a new place. The order of
  `state.starred` is the order on the screen, and `order_projects` saves
  it. Grok can also call `order_projects` ("put sundial at the top").
- Right-click a project row and click "Remove folder" to take it off the
  list, or ask Grok ("remove that project"), which calls `remove_project`.
  The folder stays on the disk. The bridge keeps the path in
  `state.hidden`, so a folder in `~/Sites` or `~/Developer` does not come
  back. `add_project` puts it back.
- Show each project's favicon when the project has one. When the top folder
  has no favicon, the bridge uses the nearest favicon in the subfolders, 4 levels
  down at most. It skips `node_modules`, `dist`, `build`, `target`, `vendor`
  and dot folders. The bridge keeps each answer until it restarts.
  An emoji favicon (an SVG with one `<text>`) often puts the emoji partly
  outside its box, so the bridge draws the emoji again in the center.
  A project with no favicon shows no icon and no gap: the name starts
  where the favicon would be, in the Projects tab, the title and the
  titles of All projects (`Favicon` in `src/App.tsx`).
- Save the state of projects and agents, so that you can come back later and
  continue where you stopped.
- Two config files on the Mac hold the settings, so that the user or a
  Claude Code agent can change any of them by hand, from any device:
  each agent runs on the Mac.
- `~/.config/yonder/config.json` holds the settings of the Mac (the
  bridge), for all the devices: `preview` (the Tunnel row), `models` and
  `efforts` (the ranges, such as `["haiku", "fable"]` and
  `["low", "max"]`), `defaultModel` (`"auto"` or a model), `mode`
  (`bypassPermissions`, `auto` or `acceptEdits`), `sumUp` (the Summaries
  row), `contextDetail` (`"minimal"`, `"normal"` or `"verbose"`) and
  `contextGroup` (the Context tab rows of Appearance), `accent` (the
  Color row of Appearance: `""` or a hex color), `steer` (the Steer row), `walkieTalkie` (`true` or `false`) and `speechModel` (a path, see Walkie-talkie), `cli` and `clis` (the Agents tab),
  `projectProfiles` (the default profile of each project in an older version, see Profiles),
  `workspaces` (see Workspaces),
  `defaultFolder`, `agentName`, `agentNaming`, `appDays` and `fileDays`,
  and on the Mac `newAgentKey`, `voiceNoteKey` and the shortcuts of the
  window, such as `closeKey` (see Keys). `port` and `token` are the port
  and the secret of the bridge (see "Two OS users on one computer"). A new
  port counts after a restart of the bridge, a new token at once.
  - `fileDays`: the attachments of the agents (the pictures, pastes,
    files and videos in `~/.config/yonder`) go this many days after they
    came, at the start of the bridge and then once a day (`pruneFiles`).
    The default is 30, and 0 keeps all. A 4K video is 300 MB.
  - The rows of the Settings come from the schema `bridge/settings/`,
    and `/settings` writes their values here. A setting that the user
    adds in `~/.config/yonder/settings.json` (a list in the same form)
    shows in its section and writes its key here, with no new build.
  - The Settings tab writes the file too. The keys stay `state.preview`
    and so on in the code: accessors read and write `config.json`, so
    these keys are not in `state.json`. The bridge moves old keys out
    of `state.json` on its first start.
  - The bridge reads the file again when its time of change moves, so an
    edit needs no restart. The app shows the new value the next time it
    opens the Settings.
  - A value that fails the check of its key, such as the mode `plan`,
    gets the default, and `bridge.log` tells why. A file that is not valid
    JSON keeps the last good settings, or at the start the settings of
    `config.json.bak`, and the bridge does not write over it until it is
    valid again (see Backup and safe saves).
  - `trustedLinkSources`: the sites that can open a new task with a
    signed link (see New task links).
  - `defaultFolder`: the folder of a new agent when the task names no
    project and is not about the work of a project, such as `"~/notes"`
    for an errand or a note. Clef then answers "(none)" for the
    project, and the agent starts there, not in the busiest project. A
    task that fits one of the latest projects goes there (see the New
    agent view of the Mac app). The
    folder does not have to be on the list of projects. With no
    `defaultFolder`, the busiest project gets the agent, else the
    first project.
  - Grok does not ask which project when it is not sure. It gives
    `start_worker` an empty project, and Yonder picks.
  - `agentName`: the word for an agent on the screen, in the voice and in
    the descriptions of the tools, and the icon of the Agents tab. An
    example: `{ "one": "task", "many": "tasks", "icon": "<svg …>" }`. The default
    is `{ "one": "agent", "many": "agents" }` with the bird icon.
    - The code, the tool names, the tab values (`agents`) and the APIs
      keep "agent". `swap` in `src/names.ts` changes each "agent" and
      "agents" of a text to the word, with its capital. `forHost`
      (`src/front.ts`) applies it to the prompt and the tool descriptions
      of the voice, and `voice.ts` to each tool result and each
      `[Yonder app]` note. The bridge applies it to the description of
      each MCP tool when a client connects, and to the prompt of the car,
      the watch and the phone call. The user can still say "agent".
    - The bridge also applies it (`say` in `bridge/main.ts`) to each
      MCP client, such as an agent, Claude Code or the Claude app: the
      description of each input of a tool, each
      error, a result that is only a text, the `note`, `said` and `error`
      of a result, the lines of `review_workers`, and the prompt of each
      agent ("Yonder shows you to the user as task 11"). Haiku writes the
      word in each new summary and spoken brief (`wordRule`). A summary
      from before stays until the agent gives a new answer. The other
      fields of a result keep their words: the task, the result, a name
      and a path have the words of the user or of an agent, and a client
      can give them back to a tool. "Worker" stays, as the tool names do.
    - A path, a file name and a link keep "agent" (`~/.claude/agents/`,
      `agents.json`, `op://Agent/GitHub/token`), and so does "the voice
      agent", which is not an agent of the user. The tab values are in
      backticks, so they stay. Else a tool gets a value such as "tasks
      (running)", which no tool takes.
    - `swap` also changes the article: "an agent" is "a task". A word
      in backticks stays, such as the `agents` field of `list_projects`.
    - `icon` is SVG markup, or the name of an icon of `src/icons.tsx`,
      such as `"clipboard"`. Only its shape counts: it takes the color of
      the text, as the other icons. The page draws it as a CSS mask, so a
      script in it never runs. Its name is `svg-` and a hash of the
      markup, so a new design is a new name for the caches of the page
      and of `NativeChrome.swift`. The native tab bar of iOS 26 already
      takes each icon as a PNG that the page draws (`iconPng`), so a new
      icon needs no new build.
    - The app reads `/agent-name` of the bridge when it opens and every
      10 seconds, so an edit of the file shows in about 10 seconds, on the
      Mac and on the phone. The page keeps the last word in
      `localStorage` (`agentName`) for its first paint. An MCP client,
      such as Claude, gets the new word in the descriptions when it
      lists the tools again, and in the results at once.
    - Not changed: the native CarPlay screen (`CarPlay.swift`) still says
      "Agents", and the referral text of the Settings still says "agents",
      because it goes to other people.
  - `agentNaming`: how Yonder calls each agent on the screen, in the voice
    and in the pushes.
    - `"numbers"` (the default): "Agent 2". The title of a push is
      "Agent 2 · Fix the tabs".
    - `"names"`: a first name from `NAMES` in `src/names.ts`, such as
      "Jack finished". The name follows the number: agent 1 is Jack,
      agent 2 is Emma. Each new agent gets the lowest free number, so two
      open agents never have the same name. An agent that runs again with
      a new number gets a new name.
    - In the names and projects modes, the name is in the place of the
      number on each tab (Tasks, Done, Closed): the row shows "Jack" in
      place of "#2", in a column of 64 px with two lines at most, so the
      titles line up. The head of a conversation shows "Jack · Fix the
      tabs" in place of "#2 Fix the tabs". The undo of a close, the
      runs of a schedule and the labels for VoiceOver use the name too.
      A sub-agent keeps "21B". The voice keeps the number in its lines
      (`voiceRef`).
    - The pages of the screens get it from the one API:
      `yonder.mice.list()` gives `label` ("2", or "Jack"), and
      `yonder.word.naming` gives the mode. The Dashboard sample shows
      `label` with no `#`, and the kit gives `y-num` a wider column for a
      name. The styles (Yonder, Big button, Terminal, Playful) are the
      default screen, so they show the name with no change. `bun bridge/names-e2e.ts` checks it on a phone page and
      takes pictures with the numbers and with the names.
    - `"projects"`: the project, such as "Sundial finished", with the
      number when the project has more open agents: "Sundial 7". The
      first words of a new agent are then "Agent started.", and the voice
      says its name after the result: "It's Sundial."
    - The number stays the ID: each tool takes it. The voice gets each
      agent as "Jack (agent 4)". The bridge (`findWorker`) and the app
      also take "Jack" and "Sundial 7" as a reference.
- `~/.config/yonder/phone.json` holds the settings that each phone keeps:
  `ui` (the screen in use, see "Screens and styles" under Phone),
  `theme` (`light` or `dark`), `chatFont` and `summaryFont`
  (`system`, `serif`, `rounded` or `mono`), `chatSize` (12, 13, 15 or 17)
  and `summarySize` (13, 15, 17 or 21), `usageBar` (`on` or `off`),
  `voiceProvider`, `stt`, `appsView` (`list` or `grid`, the Apps
  tab) and `push` (`on` or `off`, the Notifications switch of the
  iPhone). All phones of the Mac share it.
  - The Show list of the computers (`hiddenComputers`) and the wake word
    (`wake`) stay on each device: they are not in phone.json, and they
    never sync (`"store": "device"` in `bridge/settings/`). Else Isolate
    computers (the switch before the Show list) of one phone reaches each
    phone, each phone tells each computer to forget the others, and
    `other_computer` finds no computer. The wake word
    keeps the microphone open, so a phone must not turn it on for the Mac.
  - The bridge route is `/phone-config`: GET gives the file, and POST
    merges a patch, where null removes a key. The relay lets the phone
    reach it.
  - The phone (`src/phone-config.ts`) pulls the file when the app opens,
    when it comes to the front, and every 10 seconds while it is on the
    screen. Each change on the phone goes into the file. A key that changed in the file since the last pull takes the
    value of the file; a key that changed only on the phone goes into the
    file. When both changed, the file wins. The phone keeps the file of
    the last pull in `phoneConfigSeen`. Each computer has its own
    `phone.json`, so a switch of the computer forgets `phoneConfigSeen`,
    and the phone then pushes its settings to an empty file.
  - The Mac window follows only `ui` of the file, on the pull every 10
    seconds (`follow` in `src/phone-config.ts`). It takes `ui` when the
    file changed since its last pull (`macUiSeen`), and it never writes
    the file, so a pick on the Mac stays on the Mac until the file
    changes. So `customize` with `use` also switches the Mac.
  - Only a phone with a pairing syncs the file. Else a fake iPhone of a
    test (Chromium with the user agent of an iPhone, on the bridge of
    the user, with no pairing) writes its test settings, such as
    `"ui": "yonder"`, into `phone.json`, and the real phone loses its
    theme. A real phone with no pairing reaches no bridge, so the check
    changes nothing for it.
  - `environment` is a one-time order, not a setting: the name of another
    computer that the phone is paired with, such as `"Studio Mac"`, or a
    part of the name. The phone removes the key from the file first, then
    switches to that computer as the Environment section does, also
    during a call. A name that fits no computer, or two, only removes the
    key. So the Mac can switch the phone to another computer. Only the
    phone knows the names of its computers.
  - Face lock is not in the file, because it needs an unlock on the phone
    first. The microphone is not in it, because its value is the ID of
    one device.
  - The Mac app keeps its own theme, colors and fonts in its
    `localStorage`.

## The config file row

Settings, General has a Config file row over Export, with an Open
button. On the Mac, Open shows
`~/.config/yonder/config.json` in the text editor of the computer (`open
-t`; `xdg-open` on Linux, `start` on Windows). On the phone, Open shows
the text of the file under the row, and Hide closes it. The route is
`/config-file`: GET gives `{ path, text }`, and POST opens the file.

## Backup and safe saves

A user without a Yonder account has
no copy of the setup on yonder.so, so the setup must not get lost on the
computer, and it must move to a new computer. The code is
`bridge/backup.ts`.

- An update, a new install or a delete of `Yonder.app` does not touch
  `~/.config/yonder`. The uninstall of Linux and Windows keeps it too.
- Safe saves: the bridge writes `state.json`, `config.json` and
  `phone.json` to a copy and renames the copy into place (`writeSafe`),
  so a crash never leaves half a file. The file before each save stays
  as `<file>.bak`, a hard link, so it costs nothing.
- A broken file: at the start, the bridge moves a broken `state.json` to
  `state.json.broken-<time>` and reads its `.bak` (`readSafe`). For a
  broken `phone.json` it reads the `.bak`, and the next save moves the
  broken file to `phone.json.broken-<time>`. A read does not move it,
  because an editor can be in the middle of its save. Else a broken
  `state.json`, such as one that a crash cut short, stops the bridge at
  each start, and a broken `phone.json` gives the phones no settings. A
  broken `config.json` stays in place, because the
  user edits it by hand: the bridge uses its `.bak` at the start, and
  does not write over the file until it is valid again.
- Export and Import are in General of the Settings, on the Mac and on
  the phone (`src/Backup.tsx`, POST `/setup-export` and
  `/setup-import`). Export saves the file in `~/Downloads` of the
  computer, also from the phone. Import applies a file that the user
  picks.
- The file (`yonder: "setup"`, `version: 1`) holds `config.json` with
  the workspaces, the people and the profiles, `phone.json`, the
  descriptions of the folders (`abouts`) and the project lists from
  before the workspaces (`extra`, `starred`, `hidden`, which only the
  move into workspaces reads), the schedules, the reminders,
  `talk.md`, the own settings (`settings.json`) and the own screens
  (`ui/`). It does not hold the agents and their chats: the chats are in
  the folders of Claude Code.
- Without keys (the default), the export leaves out `port`, `token`,
  `computerName` and `trustedLinkSources` of `config.json`, the `env` of
  each profile, the `devices` of each person (paired phones), and the
  `secret` of each webhook trigger. The `port` belongs to one OS user on
  one computer, so a copy to another computer could collide.
- With keys (the With keys switch, which shows a warning), the export
  also holds those values and `.env`, `relay.json` (the pairing of the
  phones and the relay), `vault.json` (1Password), `remote.json` (the
  connector of the Claude app) and `tunnel.json`. Anyone with that file
  can use the computer. The file is 0600.
- The import merges. A value of the file wins. A list of objects with an
  `id`, such as the profiles, the workspaces and the people, merges by
  id: the entry of the file wins, with the fields of the current entry
  that it does not have, such as the `env` of a profile. What only this
  computer has stays. A schedule or a reminder that is here already
  stays as it is. A screen file that is here already stays.
- An imported schedule starts next at its next time from now, not at
  once. An imported reminder that is past does not come.
- Before it writes, the import copies the current files to
  `~/.config/yonder/backups/before-import-<time>/`. To undo an import,
  copy those files back.
- Without keys, the import never changes a key, a token, the port or a
  pairing, also when the file holds them. With keys, it writes the key
  files of the file (`.env` merges by variable name) to
  `~/.config/yonder/import-keys/` and restarts the bridge after a second.
  The new bridge puts them in place at its start, before it reads them
  (`applyPending`), so the bridge that ran cannot write its old pairing
  over them. A copy of `relay.json` makes this
  computer the same Mac on the relay as the computer of the export, so
  import the keys only to replace that computer, not beside it.
- An import refuses a `config.json` that is not valid JSON, so that it
  does not write over the edit of the user.

### An agent applies an export

An agent of Yonder applies a file with no clicks, through the MCP tools
of the bridge. The voice of the app does not get these tools.

1. Call `import_config` with `path`, the path of the file. Leave out
   `keys`, unless the user asks in words for the keys of the file.
2. Read the answer: `backup` (the folder of the files before), `files`
   (the files that it wrote), `skipped` (each value that it left out, and
   why) and `restart` (true when the bridge restarts to load the keys).
3. When `restart` is true, wait about 3 seconds before the next call of
   a Yonder tool.

To make a file, call `export_config`. `path` is optional (the default is
`~/Downloads/yonder-setup-<date>.json`), and `keys` is true only when the
user asks for the keys. A program with no MCP client can use the routes
of the bridge: `curl -s -X POST http://127.0.0.1:7787/setup-import -H
'content-type: application/json' -d "$(jq -n --rawfile t file.json
'{text: $t}')"`.

The checks are `bun bridge/backup-check.ts` (the module, in a temp
folder) and `bun bridge/backup-e2e.ts` (two bridges on free ports with
their own home folders: a broken `state.json`, the export and the
import). Neither touches the bridge on port 7787, and neither uses
credits.
