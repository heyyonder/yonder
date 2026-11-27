# Agents

An agent is one coding session that does one task. Each agent is a real
session of its CLI on your computer, such as `claude --bg` for Claude
Code.

## Start an agent

- Tap **+**, type or say the task, and send it.
- Name the workspace in your words, such as "In shop, fix the checkout
  button". With no workspace, Yonder picks one from the task.
- Name a CLI or a profile, such as "use Codex" or "use my work profile",
  to choose who does the work. See [Profiles](profiles.md).
- Attach files with the paper clip. A video also gets its key frames and
  the words of its sound.

When you name no model and no effort, Yonder picks them from the task: a
small model for a question, and the strongest model for a large change.

## The tabs

| Tab | What it shows |
|---|---|
| **Agents** | The agents that run now. |
| **Done** | The agents that finished, failed, or wait for your answer. |
| **Saved** | The agents that you saved for later, also while they run. |
| **Closed** | The agents that you closed. |

A dot on an agent tells its state: an agent that waits for you, or a
result that you did not read yet.

## Follow and answer an agent

- Tap an agent to open its chat. You see its messages and its steps live.
- When an agent asks a question, it shows on the Done tab. Answer in the
  chat.
- When an agent needs your yes, an **approval** card comes up from the
  bottom of the screen. Approve or deny it there.

## Send a message

Type in the chat of the agent. A message to a running agent waits in a
queue until the agent finishes its turn. You can take a message back
before it goes.

A new model, effort or profile for an agent starts a copy of its session
with the same conversation.

## Stop, close and remove

| Action | What it does |
|---|---|
| **Stop** | Stops the turn that runs now. The agent stays. |
| **Close** | Stops the agent and moves it to the Closed tab. A message continues it. |
| **Mark as done** | Closes the agent as completed. |
| **Remove** | Stops the agent and takes it off all the lists. |

## Organize your agents

- **Star** an agent to show it first in its tab.
- **Rename** an agent. A Claude Code agent shows its own title until you
  rename it.
- **Move** an agent to another workspace. It keeps its conversation, and
  works in the new folder from its next message.
- **Save** an agent for later, so that it stays on the Saved tab.

## Continue in a terminal

Each agent is a normal session of its CLI. To work with a Claude Code
agent in a terminal:

```sh
claude attach <short id>
```

The agent view of Claude Code (`claude agents`) also lists the agents of
Yonder. Your other Claude Code sessions show in Yonder too, marked
"terminal" or "background".
