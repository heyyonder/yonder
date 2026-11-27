# Themes

The built-in themes of Yonder, one folder for each:

| File | What it is |
| --- | --- |
| `theme.json` | The theme: a style (values for the default screen), or an own screen with `"kind": "screen"`. |
| `page.html` | The page of an own screen. A style has none. |
| `shots/` | The pictures of the gallery below. |

`index.ts` is the list of the themes, in the order of the gallery. The
screen (`src/look.ts`) and the bridge (`bridge/ui.ts`) both read it.

The format of a theme, the tokens of a style and the `window.yonder`
SDK of an own screen are in the skill
[`bridge/skills/yonder-screens/`](../bridge/skills/yonder-screens/SKILL.md).
The design is in [`docs/ui-themes.md`](../docs/ui-themes.md).

## Make a theme

1. Tell an agent of Yonder what you want, such as "make me a screen with
   big buttons and a dark terminal look". The agent uses the skill, and
   builds the theme on your computer in `~/.config/yonder/themes/<name>/`.
2. Try it on the phone and on the computer. Each change is a new version:
   `1.json`, `2.json`, and `<n>.html` for the page of an own screen.
3. Keep the version that you like. Settings › Appearance shows each
   version, and Use goes back to an older one.

## Share a theme

1. Fork this repository.
2. Make the folder `themes/<name>/`. The name has `a` to `z`, `0` to `9`
   and `-`.
3. Copy the newest version of your theme from
   `~/.config/yonder/themes/<name>/`: `<n>.json` to `theme.json`, and
   `<n>.html` to `page.html` for an own screen.
4. Add one line to `index.ts`, and one more import for a page. Name
   the theme in the list of samples of the skill too
   (`bun run check-skill` checks it).
5. Run `bun bridge/themes-e2e.ts` with `THEMES=<name>` to make the
   pictures in `shots/`, and add a row to the gallery below.
6. Run `bun run check` and `bun run build`, and open a pull request.

## The gallery

These are the pictures of each built-in theme, for the theme gallery. Each theme shows the same made-up data from
`bridge/fixtures/themes-mock.ts`: seven agents, the chat of the agent
"Landing hero", and the approval "Ship to the App Store?". So the
pictures of two themes compare.

`bun bridge/themes-e2e.ts` takes them again, into the `shots/` folder of
each theme. It runs the app of `src/`
in WebKit, the engine of the iPhone, at the size of an iPhone 17 Pro
(402 by 874 px, at 2x), with the notch and the home bar.

Each theme has three views, in the light and the dark look:

| View | Files |
| --- | --- |
| The agents | `agents-light.webp`, `agents-dark.webp` |
| An approval | `approval-light.webp`, `approval-dark.webp` |
| A chat | `chat-light.webp`, `chat-dark.webp` |

| Theme | The agents | An approval | A chat |
| --- | --- | --- | --- |
| Yonder | <img src="yonder/shots/agents-light.webp" width="160"> | <img src="yonder/shots/approval-light.webp" width="160"> | <img src="yonder/shots/chat-light.webp" width="160"> |
| Dashboard | <img src="dashboard/shots/agents-light.webp" width="160"> | <img src="dashboard/shots/approval-light.webp" width="160"> | <img src="dashboard/shots/chat-light.webp" width="160"> |
| Big button | <img src="big/shots/agents-light.webp" width="160"> | <img src="big/shots/approval-light.webp" width="160"> | <img src="big/shots/chat-light.webp" width="160"> |
| Terminal | <img src="terminal/shots/agents-light.webp" width="160"> | <img src="terminal/shots/approval-light.webp" width="160"> | <img src="terminal/shots/chat-light.webp" width="160"> |
| Omarchy | <img src="omarchy/shots/agents-light.webp" width="160"> | <img src="omarchy/shots/approval-light.webp" width="160"> | <img src="omarchy/shots/chat-light.webp" width="160"> |
| Playful | <img src="playful/shots/agents-light.webp" width="160"> | <img src="playful/shots/approval-light.webp" width="160"> | <img src="playful/shots/chat-light.webp" width="160"> |
| Duet | <img src="duet/shots/agents-light.webp" width="160"> | <img src="duet/shots/approval-light.webp" width="160"> | <img src="duet/shots/chat-light.webp" width="160"> |
| Grok Bot | <img src="grok-bot/shots/agents-light.webp" width="160"> | <img src="grok-bot/shots/approval-light.webp" width="160"> | <img src="grok-bot/shots/chat-light.webp" width="160"> |
