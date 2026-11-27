# Workspaces

The workspace is the one concept for a group of agents. A workspace is
a named group of agents, such as "Music" or "sundial". It has one home folder or none. It is the only
group of agents in Yonder.

- A Claude Code agent of a workspace starts in its home folder. A
  workspace with no folder, such as one for a Hermes agent that works
  across the computer, starts its agents in `defaultFolder`, else in
  `~/Yonder`.
- Each agent records its own folder (`path`) and the id of its workspace
  (`workspace`). The screen groups the agents by that id. An agent with
  no id, such as one from an older version, goes to the deepest
  workspace folder that holds its folder.
- One folder is the home of one workspace only. A second workspace with
  the same folder is left out with an error.
- Multi-repo workspaces, workspaces on more than one computer, and a
  screen for each workspace come later.

## The config file: the source of the workspaces

The workspaces are the key `workspaces` of `~/.config/yonder/config.json`.
An agent can see, add, change and remove any workspace by an edit of this
file, with no click of the user. The bridge reads the file again when it
changes, and the app loads the list again every 3 seconds on the Mac and
every 10 seconds on the phone. The key does not sync to other computers,
because the folders are of this computer.

The list is in the order of the screen. Yonder comes first, then the
starred workspaces, then the others, each in the order of the file.

```json
{
  "workspaces": [
    { "id": "sundial", "name": "sundial", "folder": "~/Sites/sundial", "starred": true, "profile": "work" },
    { "id": "music", "name": "Music", "description": "Songs and mixes with a Hermes agent." }
  ]
}
```

| Field | Rule |
|---|---|
| `id` | Required. Lowercase letters, digits, `-` and `_`, such as `music`. It is unique, and it never changes: the agents keep it. |
| `name` | Required. The name on the screen and in the voice. |
| `folder` | The home folder: an absolute path, or a path that starts with `~`. At most one. A folder is the home of one workspace only. |
| `description` | One or two sentences on what the workspace is for. Required when there is no folder. Clef reads it when it picks the workspace of a new task. |
| `starred` | `true` puts the workspace at the top. |
| `profile` | The name or the id of a profile. Each new agent in the workspace starts on it, unless the request names another profile. |

- The bridge checks each entry on its own. A bad entry is left out, and
  the other entries stay. `list_workspaces` gives the errors in `errors`,
  such as "workspaces[3] (music) is left out: a workspace with no folder
  needs a description." The bridge logs them too.
- The bridge never writes over an entry that it left out. A file that is
  not valid JSON keeps the last good list, and the bridge does not write
  to it until it is valid again.
- To add a workspace, add an entry with a new id. To attach a folder, set
  `folder`. To remove a workspace, delete its entry: its folder and its
  agents stay, and the agents go back to the group of their folder.

## The tools

`list_workspaces`, `add_workspace` (a folder, a new empty folder with
`newFolder`, or no folder with a description), `edit_workspace` (the name,
the folder or the description), `remove_workspace`, `star_workspace`,
`set_workspace_profile`, `workspace_overview` and `show_workspace`. Each
tool takes a workspace by its name, its id, its key or its folder.

- Each tool that took `project` takes `workspace`. A call with `project`
  still works: the bridge gives it as `workspace` (`renamed` in
  `bridge/main.ts`). `start_worker` with an empty `workspace` lets Yonder
  pick the workspace from the task.
- The old tool names still work, and only the new ones are in the list:
  `list_projects` (it gives a bare list), `add_project`, `create_project`,
  `remove_project`, `describe_project`, `star_project`, `order_projects`,
  `set_project_profile`, `project_overview` and `show_project`.
- The app still calls the old names, so a new app works with an older
  bridge. `other_computer` sends both `workspace` and `project`, and tries
  the old name of a tool that the other bridge does not know.
- The key of a workspace on the screen is its folder, or
  `workspace:<id>` for a workspace with no folder. `window.yonder.workspaces`
  of a screen is the same as `window.yonder.projects`.

## The move from the projects

The first start of a bridge with workspaces makes the workspaces from
the projects, once (`workspacesMigrated` in state.json, `migrateWorkspaces` in
`bridge/main.ts`).

- Each project that the user chose or used becomes a workspace with its
  folder: Yonder, the starred ones, the added ones, and each project with
  an agent, a schedule, a profile or a saved about. The order and the
  stars stay. A saved about becomes the description, and the profile of
  the project becomes the profile of the workspace.
- A folder of `~/Sites` or `~/Developer` that nobody used becomes no
  workspace (`state.scan`). It still answers by its name: an agent that
  starts or moves there, a star, or a pick of Clef makes it a workspace
  (`adoptFolder`).
- The old keys stay as they were: `starred`, `extra`, `hidden` and
  `abouts` of state.json, and `projectProfiles` of config.json. So an
  older bridge still reads its projects after a rollback.
- `bun bridge/workspaces-check.ts` checks the move, the old names, the
  edits of the file and the pick of a new task, with no network.

## The pick of the workspace of a new task

The + button of All workspaces and a voice task with no workspace give an
empty workspace. The bridge picks it as it picks a project (see the
New agent view of the Mac app): Clef chooses from the workspaces and the
scanned folders that are no workspace, with the description, the last
edit and the recent agents of each. A workspace with no folder counts the
time of its newest agent as its last edit. When Clef fails, a workspace
whose name is a word of the task wins, else the busiest workspace.
