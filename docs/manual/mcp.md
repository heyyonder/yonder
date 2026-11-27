# Claude and MCP

Each action of Yonder is an MCP tool of the bridge. So you can use Yonder
from the Claude app, from Claude Code, or from any MCP client.

## Connect the Claude app

1. In Yonder, open **Settings › Environments › MCP**, and tap **Copy**. Or
   tell an agent: "connect Claude".
2. In Claude, open **Customize › Connectors › Add › Add custom connector**.
3. Paste the address, and type the code that Yonder shows.

The connector works in Claude on the web, on the desktop and on the
phone, also in its voice mode. Try:

- "What are my agents doing?"
- "Start an agent in the shop workspace that fixes the checkout button."
- "What did agent 4 find?"
- "Close the agents that are done."

To disconnect, tell an agent: "disconnect Claude from Yonder".

## Connect a local agent

For each Claude Code session on your computer:

```sh
claude mcp add --scope user --transport http yonder http://127.0.0.1:7787/mcp
```

The agents that Yonder starts already have the tools.

The list of tools is in [How Yonder works](../guide.md#connect-another-agent).
