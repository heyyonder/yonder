# Two people on one environment

## Status

Built. This document is the plan, checked against the code. "People" in `docs/wiki.md` tells how it works
now. `bun run check-people` checks it.

## The goal

Yonder is a personal remote control for one computer. This plan adds one
thing: two people (or more) work on that computer at the same time. Each
person starts their own tasks and gets their own answers back, on their own
phone, at the same time.

Keep it simple. This is not an access control system. All people share one
OS account, the same files and the same agents, so the owner of a task is a
label that sends the answers to the right phone. It is not a lock.

## The direction

- One environment, one bridge, one OS account. The fixed port
  (`LAN_PORT = 7786`) is not a problem, because there is only one bridge.
- People are separate only inside Yonder.
- The default screen stays for one person. A part for more than one person
  shows only when the environment has two people or more, or when a screen
  of the user shows it (the screen API).
- No billing. No changes to the open source docs: another task does them.

## What the code has now

- Each paired phone is a `Phone` in `relay.json` (`bridge/relay.ts:78`).
- The relay sets `x-yonder-device` on each request of a phone. `deviceOf()`
  (`bridge/main.ts:3949`) gives the phone ID, `"mac"` for the app window,
  or `""` for another program, such as an agent.
- `mcpRequest()` gives the device to each MCP tool call, so `start_worker`
  and `message_worker` know the phone when the voice agent or the app
  calls them.
- A `Worker` (`bridge/main.ts:207`) has no owner. The messages are in the
  session log of each CLI, not in the bridge.
- `config.json` applies an edit live: `config()` reads it again when the
  file changes, skips a value that is not valid, and keeps the last good
  settings when the JSON is not valid.

## The plan

### 1. People in config.json

The people go in `people` of `~/.config/yonder/config.json`. An agent can
see, add and rename people, move a device to another person, and set the
defaults of a person, only with an edit of this file. The bridge applies
the edit at the next request, with no click and no restart.

`relay.json` is the wrong file: it holds the private key of the computer,
and the bridge writes over it at each connect of a phone.

```json
{
  "people": [
    {
      "id": "alex",
      "name": "Alex",
      "main": true,
      "profile": "hermes",
      "workspace": "yonder",
      "devices": [{ "id": "Xq3vL9aT2mKp8sWe", "name": "Alex's iPhone" }]
    },
    {
      "id": "sam",
      "name": "Sam",
      "profile": "hermes-sam",
      "devices": [{ "id": "Hb7nR4cY1uJd6fQo", "name": "Sam's iPhone" }]
    }
  ]
}
```

- `id`: a short word that never changes. Tasks keep it in `owner`.
- `name`: the name on the badge and in the `<from>` tag.
- `main`: the person of the Mac window and of the old tasks. With no
  `main`, the first person is the main person.
- `profile`: the default profile of a new task of this person. No value
  means `defaultProfile`.
- `workspace`: the default workspace of a new task that names none: a
  workspace id or name, or a project name or folder, as `start_worker`
  takes it. No value: Yonder picks one, as before.
- `devices`: the paired phones of the person. `id` is `deviceId()` of the
  phone (`bridge/relay.ts:65`), the same value as `x-yonder-device`.
  `name` is a label that the bridge writes.

The rules:

- No `people` key means one person: Yonder works as today.
- To move a device, take its entry out of one `devices` list and put it
  in another.
- A pairing adds the new phone to the file. The pairing window on the Mac
  asks for the person only when a phone is paired already.
- A paired phone that the file does not list belongs to the main person.
- An edit of the file never pairs or unpairs a phone. An unpair stays in
  the pairing window, because it removes a key.
- A device in two lists or a duplicate `id` is not valid. The bridge logs
  it and keeps the last good `people`.

### 2. An owner on each task

- Add `owner?: string` (a person ID) to `Worker`. No value means the main
  person. This covers the old tasks and the sessions that Yonder did not
  start.
- A phone or the voice agent starts a task: the owner is the person of the
  device.
- An agent starts a task (`start_worker`, device `""`): the owner of the
  calling agent (`byCaller`).
- A schedule: add `owner` to the schedule, and its tasks get it.
- Each message gets a tag in its text, as the `<device>` block now:
  `<from>Alex</from>`. The tag stays in the session log, and the agent
  sees who speaks. The bridge strips it for the display
  (`bridge/main.ts:1350`).
- The owner of a task never changes. A message from another person gets a
  tag, not a new owner.

### 3. The answers go to the person who started the task

Each of these goes now to all phones or to the phone of the last message.
Send it to the phones of the owner of the task:

- The pushes (`relay.push()` sends to each phone now).
- The asks and the approvals: permissions, `ask_user`, the 1Password
  prompt of `use_secret`, and the payment pages.
- `preview` and `show_app` of a task.
- The phone abilities, such as `get_location` (`useAbility` falls back to
  the last device or the newest phone now).

Keep the last device (`lastDevice`) for each person, not one for the
bridge.

1Password stays as it is. The agent vault belongs to the computer, and all
people of the computer share it. Only its approval prompt goes to the
owner of the task.

### 4. Each person sees their own tasks

- The task feed and `list_workers` get a scope: `mine` (the default with
  two people or more) or `all`. The filter is in the bridge, so the voice
  agent, the car and the watch also see only the tasks of their person.
- "What is Sam doing?" calls `list_workers` with `all`.
- The phone shows a `mine`/`all` switch and a small owner badge, only with
  two people or more.
- The screen API gets `people`, `me` and the `owner` of each task, so a
  screen of the user can show them in its own way.

### 5. Defaults for each person

`start_worker` uses `profile` and `workspace` of the person when the call
gives none. A profile with `own` gives a person their own memory and login.
That is an option, not the default, because two people on one environment
usually want to share memory.

## Build order

Each step is one commit that works alone. Each commit that changes what
Yonder does updates `docs/wiki.md` in the same commit.

1. `people` in `config.json`, its check, the pairing that writes it, and
   `deviceOf()` → person. The "People" section of the wiki gives the format
   and the rules above, so the agents know how to edit it. A check script
   edits the file and reads the person of a device back with no restart.
2. `owner` on tasks and schedules, and the `<from>` tag.
3. The answers to the owner: pushes, asks, approvals, previews and the
   phone abilities.
4. The scope in the feed, `list_workers` and the voice prompt, the switch,
   the badge, and the screen API.
5. The defaults of each person in `start_worker`.

The build put steps 1 to 5 in one change, with a reminder that also keeps
its person, and `bridge/people-e2e.ts`, which runs a test bridge with two
people.

## Not in this plan

- One look and one set of settings for the computer. All phones share
  them, as today.
- No lock between people. Each person can read each task with `all`.
- The other computers that a phone introduces (`peers`) stay linked for
  all agents, as today.
- The unread dot stays one for each task.
