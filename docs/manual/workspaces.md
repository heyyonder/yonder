# Workspaces

A workspace is a named group of agents, such as "shop" or "Music". It has
one home folder or none.

- A Claude Code agent starts in the home folder of its workspace.
- A workspace with no folder suits an agent that works across your
  computer, such as a Hermes agent.
- Star a workspace to show it first.
- Give a workspace a default profile, so that each new agent there uses
  that account.

## Add a workspace

- In the app, add a folder, or make a workspace with no folder and a short
  description.
- Or tell an agent: "add a workspace called Music for my songs, with no
  folder".

## Change workspaces by hand

The workspaces are in `~/.config/yonder/config.json`, so you or an agent
can edit them directly:

```json
{
  "workspaces": [
    { "id": "shop", "name": "shop", "folder": "~/Sites/shop", "starred": true },
    { "id": "music", "name": "Music", "description": "Songs and mixes." }
  ]
}
```

Yonder reads the file again when it changes. A workspace with no folder
needs a description, because Yonder reads it to pick the workspace of a
new task. The full rules are in [How Yonder works](../guide.md#workspaces).
