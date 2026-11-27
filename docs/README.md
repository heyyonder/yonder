# Yonder docs

These docs are for the people who read, build or change Yonder. To learn
how to use the app, read the [user docs](https://yonder.so/docs/).

## Start here

- [User manual](manual/README.md): how to use each part of the app.
- [How Yonder works](guide.md): the architecture, the words that Yonder
  uses, and a diagram for each core part.
- [Setup](setup/README.md): install Yonder on
  [macOS](setup/macos.md), [Windows](setup/windows.md),
  [Linux](setup/linux.md), the [iPhone](setup/iphone.md) and
  [Android](setup/android.md).
- [Voice](voice/README.md): the optional voice module, and a guide for
  each provider.
- [Contributing](../CONTRIBUTING.md): set up the source, run the checks and
  send a pull request.

## The parts of Yonder

| Doc | What it tells |
|---|---|
| [Agents in any CLI](clis.md) | How Yonder runs Claude Code, Codex and the other CLIs. |
| [Yonder on the phone](mobile.md) | The phone apps, the relay, the pairing and the encryption. |
| [Screens and styles](ui-themes.md) | The themes: a style or a whole own screen. |
| [The screen API](screen-api.md) | The `window.yonder` SDK of an own screen. |
| [Canvas](canvas.md) | The pages, apps and sites that the agents make. |
| [Preview](tunnel.md) | The local site of an agent, on each device. |
| [Agent secrets](secrets.md) | 1Password, with a yes from the phone. |
| [A Claude brain for the voice call](brain.md) | The research on a Claude voice agent. |
| [The thin shell](shell.md) | How the native shells host the one React app. |
| [CarPlay](carplay.md) and [Apple Watch](watch.md) | Yonder in the car and on the wrist. |
| [Omarchy](omarchy.md) | Yonder on the Linux desktop of Omarchy. |
| [The data that Yonder collects](data.md) | What leaves your computer, and where it goes. |

## Reference

- [The wiki](wiki/index.md): how each part works now, and why. The voice
  agent reads it through the `about_yonder` tool.
- [Run your own relay](https://github.com/vladartym/yonder-relay)
- [Themes](../themes/README.md) and [plugins](../plugins/README.md)
- [Security](../SECURITY.md) and the [trademark](../TRADEMARK.md)
