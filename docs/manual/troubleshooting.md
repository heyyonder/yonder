# Troubleshooting

## The phone shows "Offline"

- Make sure that the computer is on, awake and online.
- Keep a Mac on the charger, or keep its lid open. A closed lid on battery
  puts the Mac to sleep.
- On Linux and Windows, run `yonder restart`.

## Right ⌘ does nothing on the Mac

Turn on Yonder in **System Settings › Privacy & Security › Input
Monitoring**, then quit Yonder and open it again. `~/.config/yonder/app.log`
says "listening for the keys" when the keys work.

## An agent does not start

- Open **Settings › Profiles**, and make sure that the CLI is installed
  and signed in.
- Read the end of `~/.config/yonder/bridge.log`.

## The logs

| Log | What it holds |
|---|---|
| `~/.config/yonder/bridge.log` | The bridge and the agents. |
| `~/.config/yonder/call.log` | The voice calls. |
| `~/.config/yonder/app.log` | The desktop app and its keys. |

On Linux and Windows, `yonder logs` shows the log of the bridge.

Still stuck? Open an issue with the steps and the end of the log, with no
keys in it.
