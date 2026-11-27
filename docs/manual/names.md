# Names and numbers

Yonder gives each agent a number, such as **Agent 4**. You can change how
Yonder calls your agents, on the screen, in the voice and in the
notifications.

## How each agent is called

Open **Settings › Appearance › Agent names**:

| Choice | Example |
|---|---|
| **Numbers** (the default) | "Agent 2 finished." |
| **Names** | "Jack finished." Agent 1 is Jack, agent 2 is Emma, and so on. |
| **Workspaces** | The name of the workspace of the agent. |

Each new agent gets the lowest free number, so two open agents never have
the same number or the same name.

## Your own word for an agent

Open **Settings › Appearance › Word for an agent**. Call your agents
"tasks", "workers" or "helpers". Yonder then uses your word everywhere: on
the screen, in the voice, and in the tools that Claude and other MCP
clients see.

An agent can set the word for you, with an icon for the tab, in the key
`agentName` of `~/.config/yonder/config.json`:

```json
{ "agentName": { "one": "task", "many": "tasks", "icon": "clipboard" } }
```

## The name of one agent

Rename one agent from its menu, or tell an agent: "rename agent 4 to
Landing page". The name shows in the list and in the voice.

> [!NOTE]
> A picture for each agent is not built yet.
