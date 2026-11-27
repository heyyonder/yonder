# Security

Yonder runs coding agents on your computer, so we take security reports
seriously.

## Report a problem

Do not open a public issue for a security problem.

1. Open the **Security** tab of this repository, and click **Report a
   vulnerability**. If that does not work, write to hello@yonder.so.
2. Tell us what the problem is, how to make it happen, and what an
   attacker can do with it.
3. We answer as soon as we can, and we tell you when the fix is out.

## What is in scope

- The bridge: the MCP server on `127.0.0.1` and its HTTP endpoints.
- The pairing and the end-to-end encryption between the phone and the
  computer.
- The relay in [`relay/`](relay/).
- The phone apps and the desktop apps.
- The updater of the apps.

## How Yonder protects you

- The bridge listens only on `127.0.0.1`. It refuses requests from web
  pages other than the Yonder window.
- A request passes only from a program of the same OS user, or with the
  secret `token` of `~/.config/yonder/config.json`.
- The relay forwards only encrypted frames. Each frame is AES-256-GCM, with
  keys from an ECDH handshake that only your own devices can make.
- The Mac app installs only an update that the release key of Yonder signs.

## Known limits

- The phone runs the screen (the JS and the CSS) that a paired computer
  sends over the air, and these bundles are not signed yet. So the phone
  takes a new screen from only one computer: the first that it uses, or
  the one with "Screen updates" in Settings, Environment. A bad screen
  from that computer can still use the keys of the phone. Signed bundles
  are planned.
- On a Mac, each new pairing code needs Touch ID. Linux and Windows have
  no such prompt, so any program of the user can make a code there. Each
  new pairing sends a push to the phones that were paired before.
- Each program of your OS user can read the token of the bridge, so the
  bridge cannot tell such a program from the Yonder window or an agent.

> [!WARNING]
> By default the agents run with `--dangerously-skip-permissions`, and each
> program of your OS user can call the bridge. Change the permissions of
> the agents in the Permissions row of the Settings.

The full design is in [How Yonder works](docs/guide.md#security).
