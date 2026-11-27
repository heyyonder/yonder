# Settings files

Yonder keeps its settings in `~/.config/yonder/` on your computer. You or
an agent can edit these files by hand. Yonder reads each change with no
restart.

| File | What it holds |
|---|---|
| `config.json` | The settings of the computer: the workspaces, the profiles, the people, the model range, the permissions, the word for an agent, the name of the computer, and the `port` and `token` of the bridge. |
| `phone.json` | The settings of the phone, such as the theme and the fonts. |
| `.env` | The keys, such as `XAI_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN` for Clef, and `YONDER_RELAY` for your own relay. |
| `state.json` | The agents, the stars and the schedules. |

> [!CAUTION]
> `.env` and `relay.json` hold keys. Do not share them.

Each save keeps the file before it as `<file>.bak`. To copy your setup to
another computer, read [Back up and move](backup.md).

All the files are listed in [How Yonder works](../guide.md#where-the-data-lives).
