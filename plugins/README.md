# Plugins

A Yonder plugin is a Claude Code plugin. Yonder adds no new format. A
plugin can give the agents skills, commands, hooks, MCP servers and
subagents. When a plugin draws a mod (a band above the prompt, a pane, a
status line or a toast), Yonder shows it in the chat of the agent.

## Where the plugins are

| Folder | What it holds |
| --- | --- |
| `plugins/yonder/` | Yonder's own mod. It sends what the other mods of an agent draw to the bridge (`POST /mods`), and the screen shows it (`src/Mods.tsx`). |
| `~/.config/yonder/plugins/<name>/` | Your plugins, one folder for each. |

The bridge writes Yonder's own mod to `~/.config/yonder/mod/` at each
start (`bridge/mod.ts`). It makes `~/.config/yonder/plugins/` at start
too. Each Claude Code agent gets both folders with `--plugin-dir`, and
Claude Code loads each plugin in the folder of your plugins. An empty
folder loads nothing.

## Make a plugin

1. Make the folder `~/.config/yonder/plugins/<name>/`.
2. Add `.claude-plugin/plugin.json` with the `name`, the `version` and
   the `description` of the plugin.
3. Add the parts of the plugin, such as `skills/<skill>/SKILL.md`,
   `commands/`, `agents/` or `hooks/hooks.json`. The plugin docs of
   Claude Code tell the format of each part.
4. Start a new agent. Each new Claude Code agent loads the plugin.

`plugins/yonder/` is an example with hooks:

```
plugins/yonder/
  .claude-plugin/plugin.json   the name, the version and the description
  hooks/hooks.json             the hooks module: ./register.js
  hooks/register.js            the module, with the types of Claude Code in comments
```

A plugin is a Claude Code plugin, so the same folder also works in
Claude Code with no Yonder: `claude --plugin-dir <folder>`.

## The limits

- Only the Claude Code agents load the plugins. Codex, OpenCode and the
  agents of the ACP registry do not.
- The voice agent does not get the tools of a plugin. It uses them
  through an agent.
- A plugin runs with all the rights of your user. Install only a plugin
  that you trust.
