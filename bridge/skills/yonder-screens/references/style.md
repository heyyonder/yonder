# The theme: tokens, light and dark, and the values of a style

## The light, the dark and the system look

The user picks Light, Dark or System in Settings › Appearance. The screen
does not pick it. So each screen gives both looks:

- A style gives the colors of both looks in `look.light` and `look.dark`.
  A color that it does not give keeps the color of Yonder.
- An own screen uses the tokens below. They change by themselves when the
  look changes. For other rules, use `:root[data-theme="dark"]`, or read
  `yonder.theme()` and `yonder.on("theme", fn)`.

`theme` in screen.json does nothing now. The list of screens shows a
swatch of each look.

## The tokens

The app puts each token into each page as a CSS variable, with the value
of the style and the look in use. Use `var(--bg)`, never a fixed color.

| Token | What it colors |
|---|---|
| `--bg` | The background of the screen. |
| `--page` | The background of a page over the screen, such as a sheet. |
| `--panel` | A box, a card or a button. |
| `--hover` | A row under the pointer or the finger. |
| `--text` | The text. |
| `--muted` | The second text, such as a time or a note. |
| `--line` | A line between rows, and the border of a box. |
| `--accent` | The color of the theme: the selected tab, the active row, a focused field, a primary button, a switch that is on, a link. |
| `--accent-text` | The text on `--accent`. |
| `--green` | An agent that runs. |
| `--red` | An agent that failed, and an error. |
| `--amber` | A warning. |
| `--blue` | An agent that waits for the user. |
| `--purple` | An agent that needs an answer. |
| `--live` | The call while it is live. |
| `--call` | The call button. |
| `--call-text` | The text on the call button. |
| `--sans` | The font of the text. |
| `--mono` | The font of code. |

## The accent

`--accent` is the color of the theme. Each style gives its own accent in
`look.light.accent` and `look.dark.accent`. The user can pick another
accent in Settings › Appearance (the setting `accent`: `""` for the
accent of the screen, or a color such as `"#0090ff"`). Then `--accent`
has that color. So use `--accent` for each active part, and
`--accent-text` for the text on it. Do not use the accent for large
areas.

## The values of a style

| Key | Values |
|---|---|
| `name` | The name in the list of screens. |
| `about` | One line for the list of screens. |
| `kind` | `style` (the default) or `screen` for an own screen. |
| `from` | The sample and the version that it came from, such as `terminal@1`. The computer sets it. |
| `theme` | Nothing. The user picks the look. Older screens have it. |
| `look` | The colors and the knobs below. |
| `look.light`, `look.dark` | The colors of the tokens above, without `--`: `{ "bg": "#ffffff", "accent": "#0090ff" }`. |
| `look.radius` | `0` for sharp corners. Other values do nothing. |
| `look.font` | `system`, `rounded`, `serif` or `mono`. `mono` also gives the controls the marks of a terminal: `>` before the rows of a sheet, `*` before a choice, and small letters. |
| `look.density` | `compact`, `normal` or `large`. |
| `look.rows` | `compact`: each task row is its title and one status line, as in Terminal. Leave it out for the rows of the default screen. |
| `look.glass` | `on` or `off`. `off` gives flat bars, sheets, menus, dialogs and switches with a line and no glass. |
| `look.bubbles` | `false` shows the messages of the user as gray rows, not blue bubbles. |
| `look.icons` | `plain` shows each app of the Canvas tab as an icon of Yonder on a plain tile, picked from its name, as in Terminal. An icon that the user picked or uploaded still shows. Leave it out for the icons that the agents draw. |
| `look.rail` | `starred` shows a column of icons at the left, as the servers of Discord: All projects, then Yonder and the starred projects. A tap selects the project. Leave it out for no rail. |
| `talk` | `bar` or `big`. `big` gives a large call screen. |
| `tabs` | A list of `{ "id", "title" }`. Only these tabs show, in this order. The ids are `agents` (Tasks), `completed` (Done), `closed` (Closed), `preview` (Apps) and `search`. |
| `copy` | Other words for `title`, `call`, `endCall` and `message`. |
| `tools` | Own screen: the MCP tools of Yonder that `yonder.tool` can call. |
| `abilities` | Own screen: the abilities of the phone that `yonder.phone.ability` can use. |

A value that is not valid keeps its default, and an unknown key does
nothing. A tab title or a `copy` value with "agent" or "agents" gets the
word of the user.

## Example: a style

```json
{
  "name": "Ocean",
  "about": "Deep blue, round type.",
  "look": {
    "light": { "bg": "#f4f8fb", "panel": "#ffffff", "text": "#0b2233", "muted": "#5b7183", "line": "#dbe5ec", "accent": "#0077b6", "accent-text": "#ffffff" },
    "dark": { "bg": "#06141f", "panel": "#0d2233", "text": "#e6f1f8", "muted": "#8aa4b6", "line": "#18324a", "accent": "#48cae4", "accent-text": "#06141f" },
    "font": "rounded",
    "density": "normal"
  },
  "tabs": [
    { "id": "agents", "title": "Agents" },
    { "id": "completed", "title": "Done" },
    { "id": "closed", "title": "Closed" },
    { "id": "preview", "title": "Apps" }
  ]
}
```

## Readable colors

Give the text a contrast of 4.5 to 1 or more on its background, in both
looks: `--text` and `--muted` on `--bg` and `--panel`, and
`--accent-text` on `--accent`.
