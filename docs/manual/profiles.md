# Profiles

A profile chooses the agent harness of a task, such as Claude Code, Codex
or Hermes, with its own name, login and options.

Use profiles to:

- keep a work account and a personal account apart,
- give one workspace its own subscription,
- run an agent with extra flags or environment variables.

## Add a profile

1. Open **Settings › Profiles**, and tap **Add profile**.
2. Give it a name, such as "Work", and choose its CLI.
3. For Claude Code, turn on **Separate account**, and sign in. The profile
   then has its own login, settings and history.

Your rules and skills of `~/.claude` stay the same in each profile.

## Which profile an agent gets

1. The profile that your request names, such as "use my work profile".
2. Else the profile of the workspace.
3. Else the default profile of the computer (**Settings › General**).

When that profile has no usage left, Yonder picks another profile of the
same CLI that has room.

## Move an agent to another profile

Open the agent, and choose another profile in its Profile menu. It keeps
its conversation. The new profile must run the same CLI.
