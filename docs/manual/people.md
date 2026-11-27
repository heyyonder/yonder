# People on one computer

Two people or more can use one computer at the same time, each with their
own phone. Each person starts their own agents and gets their own
answers.

All the people share one account on the computer, the same files and the
same agents. The owner of an agent is a label that sends its answers to
the right phone. It is not a lock.

## Add a person

1. Pair the phone of the new person: open **File › Pair Phone** on the
   Mac. When a phone is paired already, the window has a **Person** field.
2. Type the name of the person, and scan the QR code with their phone.

Or tell an agent: "add Sam as a person on this computer".

## What changes with two people or more

- Each agent has an **owner**: the person who started it.
- The questions, the approvals and the notifications of an agent go to
  the phones of its owner.
- The app has a **Mine / Everyone** switch, and each row shows the name
  of its owner.
- Each person can have their own default profile and default workspace.

With one person, none of this shows, and Yonder works as before.

## Change people by hand

The people are in `people` of `~/.config/yonder/config.json`. You or an
agent can edit them, and the change applies at once:

```json
{
  "people": [
    { "id": "alex", "name": "Alex", "main": true, "profile": "hermes" },
    { "id": "sam", "name": "Sam", "workspace": "music" }
  ]
}
```

The **main** person owns the Mac window and the agents with no owner. The
full rules are in the wiki.

## Separate accounts on one computer

People who want fully separate setups can each use their own OS account
on the computer, such as two macOS users. Each account runs its own
Yonder, with its own bridge, port, phones and agents. The bridge of one
account refuses the programs of the other account.
