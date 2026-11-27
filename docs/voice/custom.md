# Your own voice system

The bridge is an MCP server. So any voice agent that can call MCP tools
can be the voice of Yonder: a local model on your laptop, a framework such
as Pipecat or LiveKit, or a voice app that you write.

## Connect it

1. Point your voice agent at the bridge: `http://127.0.0.1:7787/mcp`
   (Streamable HTTP). Use the `port` of `~/.config/yonder/config.json`
   when it is not 7787. A program of another OS user also needs the
   `token` of that file in the header `x-yonder-token`.
2. Give it the tools of the bridge as its function tools.
3. Tell it to call `list_workers` for the state of the agents, and
   `start_worker` for a new task.

```json
{ "mcpServers": { "yonder": { "type": "http", "url": "http://127.0.0.1:7787/mcp" } } }
```

## Use the Claude app

The Claude app can use Yonder as a custom connector, also in its voice
mode. Ask an agent to run the `connect_claude` tool of Yonder. It gives
the address of the connector, through the relay.

## The tools that matter most

| Tool | What it does |
|---|---|
| `list_workers` | Lists the agents and what each one does now. |
| `start_worker` | Starts an agent with a task. It returns at once. |
| `message_worker` | Sends a follow-up to an agent. |
| `get_worker` | Reads the result of one agent. |
| `ask_user` | Asks the user a question on the phone. |

The full list is in [Connect another agent](../guide.md#connect-another-agent).
