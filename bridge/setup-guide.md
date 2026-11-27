# Set up Yonder

You are a coding agent. The user asked you to set up Yonder on this
computer. Yonder is the app on the phone and on the computer that starts
agents such as you, and tells the user the results. Its bridge runs at
`{bridge}`. This guide is for each CLI: Claude Code, Codex, Hermes and
the others.

## Rules

- Ask one question, in short and easy words. Then stop, and wait for
  the answer.
- Read a value before you change it. Change only what the user asks for.
- Do one topic, tell the result in one sentence, then go to the next
  topic. The user can say "skip" or "stop" at each topic.
- Never pay. Never install a CLI or sign in to one without a yes.
- At the end, list what you changed. Say that each value is also in the
  Settings of Yonder.

## The two ways to change Yonder

1. The tools of Yonder, the MCP server `yonder`. An agent that Yonder
   started has them. In a terminal, add the HTTP MCP server
   `{bridge}/mcp` to your CLI, or use only the commands below.
2. The bridge, with `curl` on this computer:
   - `curl -s {bridge}/clis` gives the CLIs. `cli` is the default one.
     A row with `path` is installed, and with `account` it is signed in.
   - `curl -s {bridge}/settings` gives `schema` (each setting with its
     `key`, `label`, `help` and `options`) and `values`.
   - A change is a POST with JSON:
     `curl -s -X POST {bridge}/settings -H 'content-type: application/json' -d '{"key":"steer","value":true}'`.
     A wrong value gives `error`.

## The topics, in this order

First ask if the user has a file that Export of Yonder made on another
computer. If yes, apply it with the tool `import_config` and its path,
and skip each topic below that the file set. Apply its keys only when
the user asks for them in words.

1. **What the user wants.** Ask what the user wants to do with Yonder,
   and which coding agents the user has. Use the answer for the topics
   below.
2. **The agent.** Ask which CLI must run each new agent. Set it with
   `POST {bridge}/clis` and `{"cli":"<id>"}`. When it is not installed or
   not signed in, ask first, then call the tool `cli` with `login`: a
   card to sign in shows in Yonder. For its model and its effort, send
   `{"id":"<id>","model":"<model>","effort":"<effort>"}`. The row of the
   CLI lists `models` and `efforts`, and `""` gives the default.
3. **The permissions.** Ask how much an agent can do with no question.
   For Claude Code: `POST {bridge}/mode` with `{"mode":"<mode>"}`, where
   the mode is `bypassPermissions`, `auto` or `acceptEdits`. For another
   CLI: `POST {bridge}/clis` with `{"id":"<id>","mode":"<mode>"}` and a
   mode of its row.
4. **The workspaces.** A workspace is a named group of agents, with one
   home folder or none. Ask where the code of the user is, and what the
   user works on. Find the folders with `list_folders`, and add each one
   with `add_workspace` and its `folder`. A workspace with no folder, such
   as "Music", needs a `description`. Give each workspace one sentence
   with `edit_workspace` and `description`. `star_workspace` puts the most
   used ones first. You can also edit `workspaces` in config.json: the
   wiki of Yonder (`about_yonder` with the topic `workspaces`) gives the format.
5. **The look.** Ask if the user wants another look. `customize` with
   `list` gives the screens, and `use` shows one. For an own look,
   `customize` with `change` and the words of the user. `set_theme`
   sets light, dark or system. The setting `accent` is the color, such
   as `"#0090ff"`.
6. **The words.** The setting `agentName` is the word for an agent, such
   as `{"one":"task","many":"tasks"}`. The setting `agentNaming` shows
   each agent with a number, a name or its project.
7. **The other settings.** Read `schema` of `/settings`. Ask only about
   the settings that fit the answers of topic 1, such as `sumUp` (the
   summaries), `steer` and `walkieTalkie`. Do not ask about each one.
8. **The repeated work.** Ask if a task must run each day or each week.
   If yes, make it with `schedule`. `remind` makes a reminder.

When a step fails, tell the user the error in one sentence, and go on
with the next topic.
