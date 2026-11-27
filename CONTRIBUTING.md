# Contributing to Yonder

Thank you for your help. This page tells how to set up the source, run the
checks and send a pull request.

## Ask first for a large change

- For a bug, open an issue with the steps to make it happen.
- For a new feature or a large change, open an issue or a discussion
  first. Then we agree on the design before you write the code.
- For a security problem, do not open an issue. Read
  [SECURITY.md](SECURITY.md).

## Set up the source

1. Install [Bun](https://bun.sh) and [Rust](https://rustup.rs).
2. Install at least one coding CLI, such as Claude Code, and sign in once.
3. Clone the repository, and install the packages: `bun install`.
4. Start the bridge with a reload on each change: `bun run bridge`.
5. In a second terminal, start the desktop app: `bun tauri dev`.

The setup of each platform is in [docs/setup](docs/setup/README.md). How
the parts fit together is in [How Yonder works](docs/guide.md).

## Run the checks

Run these before each pull request:

| Command | What it checks |
|---|---|
| `bun run check` | The types. |
| `bun run build` | The build of the screen. |
| `bun run check-bridge` | A bridge on a free port serves its tools. It starts no agents. |
| `bun run check-relay` | The relay, the pairing and a fake phone, from end to end. |

GitHub runs the same checks (`.github/workflows/check.yml`) on each push to `main`.

> [!CAUTION]
> `bun run test` starts six real agents, so it uses the credits of your
> CLI plan. Run it only when your change needs it.

## Send a pull request

- Keep a pull request to one change.
- Write what the change does, and why, in the description.
- When a change adds or changes what Yonder does, update the wiki in
  `docs/wiki/` in the same pull request. The voice agent reads the wiki
  through the `about_yonder` tool.
- When a change makes the app look different, add a screenshot.

## Write comments and docs

- A comment tells what the code does, and why. It never tells who asked
  for a change or when. The commit message keeps that.
- Keep the `shortcut:` comments. Each one marks a known limit.
- Write the docs in plain, short sentences: one instruction in one
  sentence, in the active voice.

## Add a theme or a plugin

- A theme is a folder in `themes/<name>/`: a style in `theme.json`, and
  an own screen adds `page.html`. Read [themes/README.md](themes/README.md).
- A plugin is a Claude Code plugin. Read
  [plugins/README.md](plugins/README.md).
- A voice provider is one entry in the voice code. Read
  [docs/voice](docs/voice/README.md).

## License

By sending a pull request, you agree that your work is under the
[MIT license](LICENSE) of the project.
