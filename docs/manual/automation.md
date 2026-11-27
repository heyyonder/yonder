# Schedules and triggers

## Schedules

A schedule starts an agent at set times, such as "every day at 9:00,
check the new issues in shop". Open **Settings › Schedules**, or tell an
agent to make one.

A schedule has a name, a workspace, a task and a timing. It can also have
its own profile, model and effort. You can pause it, and read its past
runs.

## Triggers

A trigger starts an agent when something happens, such as a new error in
your error tracker. Open **Settings › Triggers**.

A trigger starts in one of two ways:

- **A script.** Yonder runs it each minute in the folder of the workspace.
  Each new line that it prints is one event.
- **A webhook.** A service sends a request to the address of the trigger.

Tap **Set up with Claude Code**, and an agent writes the script with you.

The agents of schedules and triggers run on your own computer, with its
CLIs and its logins.
