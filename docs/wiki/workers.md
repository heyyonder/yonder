# Workers

- Each worker is one Claude Code background session (`claude --bg`) in one
  project folder, so it also shows in the agent view of Claude Code
  (`claude agents`) as working, needs input or completed. A `claude -p`
  process shows there only while it runs.
- `claude --bg` ignores `--session-id`. The bridge reads the short ID from
  its output ("backgrounded · 1a2b3c4d") and finds the session ID in
  `claude agents --json --all`. `claude stop`, `claude rm` and `claude
  attach` take the short ID, the first 8 characters of the session ID.
- A new agent or copy joins the list at once, as "Starting", with a
  short ID such as `new1`. Clef picks its effort (and with Auto its model), and Claude Code starts
  its session. Then it gets the first 6 characters of the session ID. If
  the start fails, the bridge removes it. A bridge that stops during a
  start drops the agent when it starts again. The poll does not follow
  an agent without a session ID. So the agent shows when Grok says
  "agent started", not a few seconds later. In a check, the row shows
  after 0.5 seconds, and it gets its session ID after 1.5 seconds.
  Because the agent is in the list during its start, two agents that
  start at once get two numbers. The count of the `new` IDs begins again
  at each bridge restart. So the bridge marks each agent of
  showStarting, and it gives each saved agent with a `new` ID its own ID
  when it starts. Else several agents keep the ID `new1`, and a click on
  one agent opens another.
- The bridge removes `FORCE_COLOR` from the environment of `claude`.
  With `FORCE_COLOR`, the short ID has color codes, and the bridge cannot
  read it. A bridge that starts from a Claude Code terminal can get
  `FORCE_COLOR=3`. Then each new worker starts, but the bridge does not
  save it, so it shows as an outside session, and a message to it starts
  a copy.
- A message to a live session starts a copy of it, and so does an option on
  the resume. So `message_worker` runs `claude stop <short id>`, then
  `claude --bg --resume <session id> "<message>"` with no other options.
  The session keeps the options of its start.
- `claude stop` returns before the daemon of Claude Code lets the session
  go. A resume before that starts a copy. So `resume` waits until
  `~/.claude/daemon/roster.json` drops the short ID, 5 seconds at most.
  The wait takes 0.1 to 0.2 seconds. Else a second message can start a
  copy a few ms before the daemon lets the old session go, and the copy
  cannot reach the sub-agents of the session.
- A message to a background session that Yonder did not start makes it
  a worker, with the same number. The bridge stops the session and
  resumes it under the same session ID, as for a worker. So the message
  goes to the session itself, not to a copy.
  The worker gets a 6-character ID, and the session had the 8-character
  ID of Claude Code. The bridge also finds a worker by the start of its
  session ID, so a screen that still asks with the 8 characters loads
  the chat. Else the phone shows "There is no worker \"7da6a531\""
  (Sentry YONDER-K).
- A message to a terminal session starts a copy of that session
  (`--resume <id> --fork-session`) as a new worker, with the same context.
  The terminal owns the session, so the bridge cannot resume it. A later
  message to the same terminal session goes to the same copy (`forks`).
  The socket of Claude Code for messages between sessions is no option:
  Claude Code puts each such message in a peer frame and never takes it
  as the approval of the user. A copy is a normal worker, so it takes
  the words of the user as typed input.
- Sessions that an agent starts with `claude --bg` itself, not through the
  bridge, are outside sessions. When such a session ends, it has no pid,
  so it leaves the lists of Yonder. The agent view of Claude Code still
  shows it as completed. To keep an agent in Yonder, message it through the bridge.
- The bridge sends one `message_worker` call at a time for each agent.
  Grok sometimes sends one request in two or three calls at once ("There's
  a screenshot attached.", "Continue."). A second call waits, sees the
  agent run, and goes into its queue. Else each call sees the agent as
  not running and resumes the session, and Claude Code starts a copy
  with no turn and no transcript for each extra call.
- A new model, effort or profile on `message_worker` changes a worker, also while
  it runs. The bridge stops the session, then resumes it with all the
  options. Claude Code then starts a copy with the same conversation and
  the new options ("the flags you passed started a copy"), and the worker
  moves to the copy, with the same number. `now: true` stops a running
  turn and sends the message at once, without the queue, so that the user
  can add context or correct an agent while it runs.
- "Mark it as completed": Grok calls `complete_worker`. It stops the
  session if the agent runs or waits, sets the status `done`, and moves
  the agent to the Completed tab. "Close it" still calls `close_worker`
  and moves the agent to the Closed tab. The `marked` flag keeps the
  agent done until its session works again, because Claude Code lists a
  stopped session as closed.
  A bare "completed", "task completed" or "show completed", with no
  agent named, opens the Completed tab (`show_tab`), because the speech
  to text often hears "show" as another word. The app also refuses a
  `close_worker` or `complete_worker` of the agent that Grok started
  less than a minute ago, unless the user said its number. Else a "show
  completed" that comes as "Task completed." stops an agent that Grok
  just started. The correction of the wrong words says "marked as
  completed", not "marked as done", because "done" is the Closed tab.
- The app also refuses each `close_worker`, `complete_worker` and
  `remove_worker` that the last words of the user do not ask for, with
  every voice: Grok, OpenAI and ElevenLabs. The words must have a close
  word ("close", "done", "completed", "remove", "delete", "clean up"),
  or say yes to a question of the voice about it ("Close 14?"). A close
  of a whole tab also needs a group word, such as "all" or "the
  completed ones". When the words of the user are not in yet, the check
  waits up to 3 seconds for them. The voice then asks "Close 3?" and
  waits. The check is `asksClose` and `asksGroup` in `src/names.ts`
  (`bun src/names.ts` tests it), and it runs in `runTool` of
  `src/voice.ts`. A rule in the prompt alone does not stop a voice that
  closes agents with no words from the user, so the important rules are
  in code, and each voice follows them. A Claude call does not go through `runTool`:
  its brain calls the bridge itself (`bridge/brain.ts`).
- "Close it", "done it" and "I'm done with it" are one action: Grok
  calls `close_worker` with no `done`, and the agent moves to the Closed
  tab. This is true on each tab. On the Completed tab, "close this
  agent" moves the completed agent to the Closed tab, and Grok never says
  that it is done already.
- `done` is only for "mark it done", "mark it as completed" or
  "completed". A finished agent goes to the Done tab by itself, so a
  close always goes to the Closed tab. Else a voice sets `done` for a
  plain "close it", and the agent stays on the Done tab. The tool text of `close_worker`,
  the prompts of Grok, the car and the brain say so. `runTool` of
  `src/voice.ts` also drops `done` when the words do not ask for it
  (`asksComplete` in `src/names.ts`). A close word always wins. The
  brain of a Claude call does not go through `runTool`.
- `close_worker` runs `claude stop`. `remove_worker` runs `claude stop`
  and `claude rm`, which also takes the session off the agent view, and
  takes the agent off the lists of Yonder.
- A close of a session that Yonder did not start ends its process: `claude
  stop` for a background session, `SIGTERM` for a terminal session. Then
  the session becomes a worker, with the same number, and moves to the
  Closed tab. The stop goes to the config folder that lists the session,
  as the profile of that folder. When Claude Code cannot stop a session
  that still runs, `close_worker` gives an error. Else a stop that goes
  to `~/.claude` for a session in the folder of a profile stops nothing,
  and the agent stays on the Done tab with no error.
- A restart of the bridge between `claude --bg` and its answer loses the
  new agent: at the start, the bridge drops each agent with no session
  ID. The session then shows as a background session that Yonder did not
  start. So each read of the sessions looks in the roster of the daemon
  (`daemon/roster.json` of the config folder). There the arguments of
  the session have the start ID in the address of its `--mcp-config`.
  When no agent has that start ID, the session becomes that agent again,
  with its start ID. An agent that starts now keeps the start ID as its
  ID, so its session stays outside until `send` saves it.
- "Deploy it and close it": the agent closes itself when its work is
  done, so the voice agent need not come back to close it. Grok sets `closeWhenDone` on that `start_worker` or
  `message_worker`, does not call `close_worker`, and says "Sent to 3.
  It closes itself when done." "Close 3 when it's done" sends
  "." with `closeWhenDone` to the running agent: it gets no new
  message. `false` takes the flag back. A sub-agent cannot close.
  - The bridge decides, not the agent. When the turn ends with no queue,
    `settle` starts `closeItself`. The flag holds through the turns of
    the queue, and a question for Allow or Deny comes in the middle of
    the turn, so the agent closes after the rest of the turn. The flag
    stays on until `closeItself` decides, and `closeLeft` decides at the
    start of the bridge for an agent that still has it. Else a bridge that
    restarts often drops the flag before the wait for the summary. A stop, a close or a complete
    of the user takes the flag off, and so does a new message to an
    agent that does not run.
  - When a task says "then close yourself", the agent sets the flag on
    itself: `message_worker` to its own number with "." and
    `closeWhenDone` (`named` in `bridge/main.ts`). It never writes that
    it closes itself. Else an agent writes "I close myself now" and stays
    open, so the words of the agent and the list do not agree.
  - When the user says to move this conversation to a new agent, the
    agent starts the new agent with the whole conversation in its task,
    and then sets the flag on itself. A request to start, send or split
    work into other agents ("send an agent to look into X", "separate
    these into 2 agents") is not a move, so the agent stays open. Else the
    user talks to a closed agent.
  - `keepOpen` in `bridge/keep-open.ts` gives the reason to stay open
    (`bun bridge/keep-open.ts` tests it): the turn failed, the agent
    waits on the user, the last paragraph of the result asks a question,
    or Clef says that the work is not done (`failed` of `worthTelling`).
    The last point of the summary counts as a question only when the
    result has a question too, because Haiku can turn "It is not pushed"
    into "should I push it?". An answer to
    a question of the user does not keep the agent open: the answer is
    the work. When Clef does not answer, as on a computer without a
    Workers AI key, a next step of the summary that only checks or ships the
    work ("Done", "Test on the phone", "Push it") lets the agent close,
    as in `review_workers`. A choice ("Push it or hold") does not. The
    bridge waits up to 15 seconds for the summary of Haiku.
  - It stays open: it gets the purple dot, and the phones get a push
    that names the reason, such as "Kept open: it asks: Should I push
    it?" or "Kept open: it needs you: Push it or hold".
  - It closes: the same close as `close_worker`, and the phones get the
    push "Closed itself:" with the end of the result. The row on the
    Closed tab says "Closed itself", and the prompt of Grok says so.
    Undo and a shake of the phone take the close back, as for the last
    close of the user, which this close replaces in `undo`.
  - The app refuses a `close_worker` of the agent that got a message
    with `closeWhenDone` in the same turn of the user, because the close
    would stop the new work (`selfClose` in `runTool` of
    `src/voice.ts`).
- Who closed an agent: `close_worker` keeps it in `closedBy` of the
  worker. The row on the Closed tab
  says it in place of the next step, and the prompt of Grok says it too.
  `list_workers` and `get_worker` give it to the agents.
  - "you": a tap in the app window or on a phone, which have a device.
  - "voice": the voice agent, which sends the ID of its call (`call`),
    or the Claude call (`brain`).
  - A number: the agent that closed it, from the address in its
    `--mcp-config` (`?worker=`). An agent that closes itself gets
    `closedItself`, as with `closeWhenDone`.
  - "mcp": another MCP client, such as the Claude app or a CLI on this
    Mac.
  - No value: the session ended by itself, or a bridge of an older
    version closed the agent. A new turn clears it. `bun run check-bridge` tests the
    voice, the agent and the MCP client.
- Each message starts a new background session, and Claude Code keeps the
  old one in its agent view as completed. The bridge keeps the old session
  IDs in `past`, and `remove_worker` runs `claude rm` on each of them.
  Else the agent view of Claude Code still shows the old sessions of a
  removed agent.
- `claude --bg` refuses a folder that Claude Code does not trust, and for a
  git repository the trust of a parent folder does not count. Many
  projects have no trust. So when a start fails with "Workspace not trusted", the bridge sets
  `hasTrustDialogAccepted` for that folder in `~/.claude.json`, as the
  trust prompt of `claude` does, and starts the session again.
- `claude --bg` also refuses bypass permissions, the default mode of
  Yonder, until the user accepts its disclaimer once in a terminal:
  "--bg with bypassPermissions requires accepting the disclaimer first".
  The phone has no terminal for it, so the bridge then sets `skipDangerousModePermissionPrompt` in
  `~/.claude/settings.json`, the key that the disclaimer sets, and starts
  the session again. The background session reads this key only in the
  user settings, not in `--settings`. A new computer fails at both
  checks, first at the disclaimer and then at the trust, so the bridge
  tries up to three times. The README warns that agents have full access.
- Before each start, the bridge runs `claude auth status`. With no login,
  `claude --bg` starts the session, and its only answer is "Not logged
  in · Please run /login", so the user sees an agent that never works.
  So the start fails with "Claude Code is not signed in on <host>. The
  Agents tab of Yonder shows the link to sign in", and the bridge starts
  the setup below. The CLIs row of Claude Code in the Settings shows "Not
  installed" or "Not signed in". The login check reads only
  `"loggedIn": false`, so an old Claude Code with no `auth status`
  still starts. An `ANTHROPIC_API_KEY` passes the check, but a background
  session with a fake key still answers "Not logged in".
- The setup of Claude Code with no terminal (`setUp` and `/setup` in
  `bridge/main.ts`, `ClaudeSetup` in `src/App.tsx`). Yonder installs
  Claude Code and signs it in: the user approves a link and pastes the
  code back into Yonder. Else each fix needs a terminal on that
  computer.
  - When `claude` is missing or `claude auth status` gives
    `"loggedIn": false`, the app (GET `/setup`) or a start of an agent
    starts the setup. With no `claude`, the bridge runs the installer of
    Claude Code: `curl -fsSL https://claude.ai/install.sh | bash`, or
    `irm https://claude.ai/install.ps1 | iex` in PowerShell on Windows.
    The installer puts `claude` in `~/.local/bin`, where the bridge finds
    it also when the PATH does not have it. The app shows a turning icon
    and "Claude Code". An install that fails shows its last line and Try
    again.
  - Then the bridge runs `claude auth login`. It prints "If the browser
    didn't open, visit: <link>". That link is the manual one: its page
    shows a code of the form `<code>#<state>` after the approval, so it
    works on the phone and on another computer. The login reads the code
    on its stdin. `BROWSER=yonder-no-browser` names no program, so the
    login opens no browser on the computer (macOS reads `BROWSER`;
    Windows can still open one there).
  - Over the list of the Agents tab, on the Mac and on the phone, the app
    shows "Sign in to Claude Code" (the link) and a field "Paste the
    code". A paste with a `#` goes at once. POST `/setup` with `code`
    writes it to the login. A code with no `#` gets "Invalid code" from
    Claude Code, and the same login waits. A code that does not fit ends
    the login with "Login failed: Request failed with status code 400",
    and a code fits only the login that printed its link. So the bridge
    starts a new login, and the app shows the new link and "The sign-in
    failed". The app reads `/setup` every 2 seconds during the setup, and
    every 15 seconds else.
  - After the login, the bridge sets `hasCompletedOnboarding` in
    `~/.claude.json`. `claude auth login` does not set it (only its path
    with `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` does), and a background session
    shows the first screens of Claude Code without it.
  - The setup runs in `bridge/logins.ts` with the other CLIs, and the card is `LoginCard` (see "Sign-in and install
    from the phone").
  - Checked on a Mac, with a bridge on port 7899: the
    install into an empty `HOME` with no `~/.local/bin` on the PATH, the
    link, a code with no `#`, and a wrong code, which gave a new link.
    Not checked: a full sign-in with a real code (in a bridge with another
    `HOME`, a real sign-in can write over the login of Claude Code in the
    Keychain), and anything on Windows.
- A resume of a background session starts in the folder that Claude Code
  keeps in `~/.claude/jobs/<short id>/state.json` (`cwd`), not in the
  folder of the worker. When a session moves into a worktree that the
  agent then deletes, each start fails with "Workspace not trusted.
  <path> could not be resolved on disk." The move also leaves the first
  half of the transcript in the folder of the project, so the bridge
  reads an old result. The repair: join the two halves into the
  transcript in the folder of the worker, then set `cwd` and `originCwd`
  in the job state to the folder of the worker.
- `open_in_terminal` runs `claude attach <short id>` in Ghostty for a
  live session, also while the worker runs. A finished session has no
  process to attach to, so it opens with `claude --resume <session id>`. It opens a new tab in the front window of the running Ghostty
  through AppleScript, and a new window only when Ghostty has no window.
  The tab title is the number and the name of the agent, for example
  "9 · Agent details". Claude Code does not change this title. A tab
  keeps the windows few. `open -na` is no option: it starts a second
  Ghostty that puts its restored windows in front.
- On a Mac without Ghostty, `open_in_terminal` opens the session in a new
  window of Terminal, and the button in the title row of an agent shows a
  terminal icon, not the logo of Ghostty.
- Workers survive a restart of the bridge and a rebuild of the app, because
  Claude Code runs the background sessions. A worker that an older bridge
  started with `claude -p` keeps its status. The bridge follows it in
  `claude agents` until its process ends, then reads its result from the
  transcript. A message to it resumes it as a background session with the
  full options.
- A restart of the computer ends each session, but the list of agents
  stays in `state.json`, with its numbers, and done and closed agents keep
  their status. At its first start after the restart, the bridge finds
  each agent that was running (`updatedAt` before the boot time, from
  `os.uptime()`). The agent then waits on the Agents tab, with the result
  "The computer restarted.", as after `stop_worker`. A waiting agent keeps
  waiting. The `marked` flag holds the status, else the first poll finds
  no process and closes the agent. A message continues the agent from its
  transcript. The bridge does not continue the agents by itself, because
  each turn uses credits while no one watches. The queue of an agent waits
  for the next message, as after a stop. The app opens on the Agents tab,
  as at each start. `bun run check-bridge` checks it.
- Do not use the Claude Agent SDK. Use the `claude` CLI so that the work uses
  the Claude subscription.
- Workers run in the permission mode of the Permissions row of the
  Settings, in the Claude Code group of the Agents section: Bypass permissions (the default, with
  `--dangerously-skip-permissions`, so they stop to ask only about a few
  calls, see below), Auto mode
  (`--permission-mode auto`: a classifier approves the safe actions), or
  Accept edits (`--permission-mode acceptEdits`: a command that only
  reads, such as `ls`, runs; another command waits for Allow or Deny,
  and the agent shows as waiting). The bridge keeps the mode in
  `state.json` (`mode`), and `GET` or `POST /mode` reads or sets it. The
  `mode` input of `start_worker` and `message_worker` sets another mode
  for one agent, also Plan mode (`plan`). The third menu of the New agent
  view and the Permissions item of the three dots of an agent set it too.
  The bridge answers the `ExitPlanMode` of a Claude Code agent in Plan
  mode with a deny: the agent writes the plan as its last message and
  ends its turn. Then a message to the agent approves the plan: the agent
  goes on in a copy of its session, in the mode of the Settings, as in
  Claude Code. A message before the plan only adds to the task, and the
  agent stays in Plan mode. Another CLI ends its plan with its turn.
  Without the deny, the background session waits for its own dialog,
  which no one sees, and a reply does not move the live session out of
  Plan mode. Plan is not in the row of the Settings. The modes that ask about each action (`manual`,
  `dontAsk`) are not offered, because no one can answer a background
  agent. The line under the name of an agent shows its mode when it is
  not Bypass.
- In a mode that is not Bypass, a tool call that needs a yes, such as a
  `curl` in Accept edits, shows a dialog in the app on the phone and on
  the Mac: "Allow Bash?" with the command, and Deny and Allow. The first
  tap on any device counts. A stop of the agent answers Deny. The agent shows as waiting, and the phones
  get a push. The bridge gives each such worker a `PermissionRequest`
  hook (`ASK` in `bridge/main.ts`) that posts the question to `/ask` and
  waits. The app answers with `POST /permission { id, allow }`. A plan
  of Plan mode keeps its own path: a reply. A question of the agent
  (`AskUserQuestion`) shows on the same card as a choice, one question
  after the other, and the picks go back to Claude Code as its answers.
  Deny lets the user answer in the conversation: the agent asks the
  question in its message and ends its turn. A multiSelect question gets
  one pick, and the card has no "Other" text. Without the card, the
  background session waits for its own dialog, which no one sees.
  These workers also start the MCP servers of the project with no
  question (`enableAllProjectMcpServers`), as Bypass does. Else the
  question about a `.mcp.json` holds each such agent, and it shows as
  closed. Auto mode needs Haiku 5.5 or a larger model: Haiku 4.5 falls
  back to manual mode.
- Bypass also gets the hook. Bypass still asks about a few calls: an
  `rm` of a critical path (the working folder, a parent of it or the
  home folder), an `ask` rule, and an MCP tool that needs the user.
  Without the hook, such a question shows only in a terminal. Claude
  Code denies such an `rm` by
  itself after 2 minutes. Its variable that stops this
  (`CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT`) works only in the
  environment of the background service, not in `--settings`. So the
  card goes away when `claude agents --json` no longer lists the agent
  as waiting (`follow`): the 2 minutes ended, or the user answered in a
  terminal. The hook then gets no decision. The phone push of such a
  card stays.
- A question that no hook gets, such as a sandbox request or another
  dialog (`waitingFor` of `claude agents --json`), has an answer only in
  a terminal. The result of the agent then ends with "It waits for you
  in the terminal", and Open in terminal of its menu opens it.
- The Settings have, in the Claude Code group of the Agents section, a Default model row above the
  Minimum row. It has Auto, Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable
  5.1. With Auto, Clef picks the model of each new agent inside the
  Minimum and the Maximum (see below). With a model, each new agent that
  names no model gets that model, and Clef picks only the effort. The
  bridge treats it as a model that the user names, so it is not moved
  into the range. The model menu of a new agent starts on it. The bridge
  keeps it in `state.json` (`defaultModel`), and `GET` or `POST /model`
  reads or sets it.
- The Settings have, in the Claude Code group of the Agents section, a Minimum row and a Maximum
  row (`Limits` in `src/Settings.tsx`). Minimum has a dropdown for the
  lowest model and a dropdown for the lowest effort. Maximum has the
  highest model and the highest effort. A lowest choice above the
  highest moves the highest up to it, and the other way round. The
  bridge moves the model and the effort into their
  ranges one by one. Clef picks the model and the effort of a new agent from the
  task (see below), and then the bridge moves each choice into its
  range: the Model range goes from Haiku 5.5 through Sonnet 5.5 and Opus
  5.5 to Fable 5.1, and the Effort range from Low to Max. For example,
  with Sonnet to Opus, a task for which Clef picks Fable runs on Opus.
  Equal ends give one model or one effort, and then Clef does not
  pick it. A new install has the full ranges. The bridge keeps them in
  `state.json` (`models` and `efforts`, each `[lo, hi]`), and `GET` or
  `POST /model` reads or sets them. A change applies to the next new
  agent, not to an agent that runs. A model or an effort that the user or
  Grok names is not moved into the range. The bridge turns a saved
  single model of an older version into a range of that one model, and
  Auto into the full range. The ranges let Clef choose between models
  and efforts. The `model`
  input of `start_worker` sets another model: an alias of Claude Code
  (`fable`, `opus`, `sonnet`, `haiku`) or a full name, such as
  `claude-fable-5-1`. Grok sets it only when the user names a model ("use
  Fable"). After the first turn, the bridge saves the full name from the
  transcript, so the row shows "Fable 5.1". A worker keeps the model of its
  start until a message gives it a new one.
- An alias always means the latest model of its family (`LATEST` in
  `bridge/main.ts`): "opus" is `claude-opus-5-5`. The alias of Claude Code
  can start an older model. Update `LATEST` for each new model.
- The `agent` input of `start_worker` starts the worker as a Claude Code
  agent (`claude --agent <name>`), such as "start the tech lead agent in
  acme". The agents are the files in `.claude/agents` of the project
  and of `~/.claude/agents`. `list_projects` gives them for each project in
  `agents`, with the name from the front matter and the description, so
  Grok can match the words of the user to a name. Grok sets it only when
  the user names an agent. The worker keeps the agent for all its turns.
  For an unknown name, Claude Code does not start, and its error lists the
  agents that it knows.
- The `effort` input of
  `start_worker` sets the effort (low, medium, high, xhigh, max) for all
  the turns of the worker. A background session keeps the options of its
  start. A new effort or model on `message_worker` moves the worker to a
  copy of its session with the new options (see above).
- When Grok gives no effort, Cloudflare's Clef model (Workers AI) picks it
  from the task: low for a question or a tiny edit, high for normal work,
  xhigh for a large task, and max only for a very complex and long task.
  When the caller gives no model, the same
  call of Clef (`pick` in `bridge/main.ts`) also picks the model: Haiku
  for a question or a lookup, Sonnet for a small clear change, Opus for
  normal work, and Fable only for the hardest work. Each choice then
  moves into its range of the Settings (see the Model and Effort rows
  above). When Clef fails, the model is Opus 5.5 and the effort is high,
  also moved into the ranges. In a check, "Fix the typo in the README title" got
  Sonnet and low, and "Rewrite the whole sync engine" got Fable and max.
  Grok sets the effort only when the user asks for one. The bridge reads
  the Workers AI key from `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN`
  in `~/.config/yonder/.env`. Each computer uses its own Cloudflare
  account: Yonder ships no key, so a copy with none has no Clef.
  Without the token, or when Clef fails or takes more than 3 seconds, the
  effort is high. Clef takes about 0.5 seconds.
- When a worker finishes (status `done`), Clef also decides if its result
  needs the user's attention (`worthTelling`). It needs the user when the
  user asked a question (an answer, a check, research, a review or a plan),
  or when the agent could not do all the work. A change that the agent did
  as asked stays quiet: it has no purple dot, and Grok does not bring it
  up as news. A waiting or failed worker always needs the user. When Clef
  fails, the result needs the user. The `attention` flag of a worker holds
  this answer, and the app shows a purple dot. The dot stays after the user
  reads the result. A new turn or `close_worker` clears it.
- A done worker stays on the Completed tab until the user closes it. The
  bridge does not close a done worker by itself, also when it does not
  need the user's attention.
- When the user asked a question and the agent did the work, the result is
  also answered: `worthTelling` sets the `answered` flag of the worker. The
  status dot of a done agent with this flag is purple, not green, on
  the Completed tab and in the header of its conversation. Else an
  answer to a question of the user looks like a normal done task. A
  failed answer (Clef
  says "no" with 0.75 or more) is not answered, and keeps the green dot
  with the purple dot. A new turn, `close_worker`, `complete_worker` and a
  failure of Clef clear the flag.
- Each new result of a worker is unread (the `unread` flag, a blue dot),
  and Clef does not change it. `get_worker` and the conversation view
  (`/conversation`) mark it as read. Grok gives as news only the results
  that need the user and are unread. One dot shows all the news: the
  status dot of each agent is purple when it needs the user's attention, else blue
  when its result is unread, else the color of its status. The rows and
  the header of a conversation show no second blue or purple dot. A
  project on the Projects tab also shows one news dot: purple, else blue.
  The news dot of a project is an `i` with the class `attention` or
  `unread`, and the badge of an agent also gets the class `attention`. So
  the CSS rule of the dot applies only to an `i`. Else the rule makes the
  badge 6 px wide, and the number of the agent covers its name.
- Clef answers only `choice` and `score` questions, with no reason text.
  For "did the agent do the work", the bridge uses the probability of
  "no" (0.75 or more), because normal notes such as "I did not rebuild"
  gave 0.5 to 0.6. On 19 real results, real failures gave 0.82 to 0.98.
- An `--append-system-prompt` tells each worker to end with one or two
  short sentences for speech, 30 words or less. Grok tells about one agent
  in one sentence of 20 words or less, because a long summary is hard to
  hear.
  That sentence gives the substance from the summary, such as the names
  that the agent suggests, never only the kind of work. When the line of
  an agent has no summary and no result, Grok calls `get_worker` first.
- The same prompt tells each worker to take a screenshot when its work
  changes what a page, a screen or an app looks like, and to name the PNG
  path in its final message. The chat view then shows the picture. For a
  web page, the worker uses headless Chrome, not the Chrome of the user.
  A page of the Canvas (`show_app`) gets no screenshot: the worker names
  the path that `show_app` gives in its final message, and the chat shows
  the card of the page there, which opens the page. The prompt and the
  result of `show_app` both say so. A link to the page is quicker to
  use than a screenshot of it.
- Claude Code can say that a turn ended before the transcript has the
  text of the answer. The bridge then reads the transcript again on the
  next poll until the result has text. Else an agent is done with an
  empty result for good, and Grok knows nothing of its answer.
- When the user asks what an agent says ("what does it say?"), Grok calls
  `get_worker` with `full` and tells the details of the last message in
  three to five short sentences (two to four in the car), not only the
  end of the result.
- `list_workers` gives the summary of the last answer of each agent that
  does not run, and the prompt of Grok (also in the car) shows it on the
  line of the agent. For a waiting agent, the line also has "What it
  needs from the user": the last point of the summary, which is its
  question. When the user asks what an agent wants or needs ("what does
  number one want from us?"), Grok says that question and the reason.
  It never says only that the agent waits for a reply, such as "It
  needs your reply to continue.". A rule that makes Grok
  call `get_worker` for each such question also works, but the user
  then waits for a tool call, so the summary is in the prompt instead.
- A request for a summary is a question to Grok, not to the agent:
  "give me a better summary", "more details" or "explain it". Grok
  answers from `get_worker` with `full`, also when the user reads the
  agent, where other requests go to that agent with `message_worker`.
  Grok says nothing about the agent before the result comes. Else Grok
  sends the words to the agent, or guesses an answer before `get_worker`
  returns.
- A yes or no question about a result ("is it good to go?") is a
  question to Grok too. Grok calls `get_worker` with `full` and no
  `message_worker` in that answer, and waits for its result. It asks the
  agent in a later answer, only when the result does not answer it. "Ask
  it" or "ask 7 ..." still sends the question at once.
  Words about the last answer of Grok ("that was a question", "I'm asking
  you") go to no agent. Else Grok calls `get_worker` and
  `message_worker` in the same answer, so it asks before it reads, and
  it sends "That was a question." to an agent.
- The same prompt tells each worker to say that the task is done and stop.
  It does not offer next steps or ask to rebuild, reinstall or restart.
  Else a worker waits on the user instead of done. The prompt also tells each
  worker not to rebuild, reinstall or restart an app unless the user asks.
- The same prompt tells each worker that Yonder shows the media that a
  message names, and to make media with the `vsb` CLI of Visual Sandbox. The worker
  puts the URL or the full path of each picture, video or sound that it
  makes in its final message. The vsb skill tells an agent to open each
  picture in Preview and to ask where to save it. The prompt stops both,
  unless the user asks.
- The bridge saves each worker's session ID, project, task, status, and
  result.
- Workers can run in any folder on the laptop.
- At most 25 workers run at the same time (`MAX_RUNNING`). A start or a
  message over the limit returns an error to Grok, and no worker starts.
  Terminal and background sessions do not count. A refused start leaves no
  row in the list. Else its "Starting" row stays with no session and
  counts as running, and refused starts hold places of the limit until
  the user closes them (Sentry YONDER-Y).

## Mods

- A mod is a Claude Code plugin with a hooks module that draws in the
  terminal: a band above the prompt, a pane, a status line, or a toast. A worker
  runs in a terminal that no one sees, so Yonder shows its mods in the
  app.
- Yonder's own mod is the plugin in `plugins/yonder/`. The bridge writes
  it into `~/.config/yonder/mod/` at each start (`bridge/mod.ts`, with
  text imports of the files, so the compiled bridge contains them), and
  each Claude Code worker loads it with `--plugin-dir`. A resume with no
  options keeps it.
- The plugins of the user are in `~/.config/yonder/plugins/<name>/`.
  The bridge makes the folder at start, and each Claude Code worker gets
  it with a second `--plugin-dir`, after the one of the mod. Claude Code
  loads each child of a folder of plugins, and an empty folder loads
  nothing with no error. Codex, OpenCode and the ACP agents do not load
  plugins (`plugins/README.md`).
- The mod draws nothing itself. It hooks `ui.render` of `AbovePrompt` and
  `Pane`, gives on the tree that the other mods drew, and keeps a copy. It
  also keeps the `ui.status` line of each mod, and each `ui.toast` of the
  last 15 seconds. It posts them to
  `POST /mods` with its session ID when they change, and each 30 seconds.
  The bridge keeps them in memory, and `GET /mods?worker=` gives `{}` when
  no post came in 90 seconds, because the session ended. It gives only
  the toasts of the last 15 seconds.
- A plugin cannot draw the mods of another plugin: `$` has no
  `ui.render`. So the mod reads what Claude Code draws in the terminal of
  the worker. The first `--plugin-dir` sits above each installed plugin
  in the chain, so it sees the tree of a mod that answers without
  `next(e)`. `$.ui.panes()` lists only the panes of the plugin that asks,
  so a close comes from the `ui.close` event.
- The app shows them in the conversation view of the agent
  (`src/Mods.tsx`), where Claude Code draws them, in a monospace font: the
  band over the message box, the status lines and the toasts under it,
  and the panes in a column at the right of the chat on the Mac, or over
  the band on the phone. A toast shows for its time (4 seconds by
  default) from when the app gets it. The app reads `/mods` each 5
  seconds. The mods are in the conversation, not on a separate tab.
- Two switches in Settings › Appearance turn them on and off: Mods
  (`mods` in config.json, on by default) for the computer, and Mods on
  the phone (`modsPhone`, off by default), because the screen of a phone
  is small. Off: the app does not ask for the mods. Read only: a Button shows its label, and a press does
  nothing. The phone reads `/mods` through the relay, and a post from the
  phone is refused.
- An agent of another CLI, a sub-agent, a session that Yonder did not
  start, and a worker that a bridge of an older version started show no
  mods or toasts.
- The mod posts to `YONDER_BRIDGE`, the bridge that started the worker,
  with `YONDER_TOKEN` (see "Two OS users on one computer"). A worker of
  an older bridge posts to port 7787.

## Agents in other CLIs

- Yonder runs agents in other CLIs, not only in Claude Code: Codex,
  OpenCode, Antigravity, Gemini CLI and the Grok CLI. The research and the plan are in `docs/clis.md`. A CLI is a program
  that runs a coding agent. Each agent runs in one CLI and keeps it for
  all its turns. The code says `cli` (`Worker.cli`; no value is Claude
  Code), because "agent" and "provider" have other meanings in Yonder.
- `bridge/clis.ts` has one row for each other CLI: Codex (`codex`),
  Antigravity (`agy`), OpenCode (`opencode`), Hermes (`hermes`),
  Cursor (`cursor-agent`), Grok Build (`grok`, the coding CLI of xAI)
  and Copilot (`copilot`).
  Gemini CLI has no row: on 2026-06-18 Google moved its personal users
  to the Antigravity CLI, so "Gemini" means Antigravity.
- Claude Code keeps `claude --bg`. Codex and OpenCode run in the ACP
  host (see the next items). Each other CLI runs one detached
  process for each turn (`runTurn` in `bridge/main.ts`): its headless
  mode with JSON lines, such as `cursor-agent -p --output-format
  stream-json`, in its own process group. The output goes to `~/.config/yonder/runs/<run>.jsonl`, with
  the prompt in `.txt` and the errors in `.err`. So a turn keeps running
  when the bridge restarts or the app quits, and the next bridge finds it
  by its pid.
- All the CLIs have one structure: the agents keep running when the
  bridge or the app restarts, and any agent can connect. Most other apps
  of this kind drive Codex with `codex app-server` and the other CLIs with
  ACP, the Agent Client Protocol. So each CLI with ACP runs in the ACP
  host. Claude Code stays on `claude --bg`: the page of the Agent SDK
  says "Unless previously approved, Anthropic does not allow third party
  developers to offer claude.ai login or rate limits for their products,
  including agents built on the Claude Agent SDK", and the ACP adapter of
  Claude Code is built on the Agent SDK.
- The ACP host (`bridge/acp-host.ts`) is a Bun process that the bridge
  starts detached when it does not answer (`bridge/acp.ts`). It serves
  HTTP on the unix socket `~/.config/yonder/acp.sock`, and writes
  `acp-host.log` there. It holds one ACP process for each agent, by its
  session ID. An agent with no turn for 30 minutes stops, and its next
  turn starts it again and resumes the session.
- A turn: the bridge sends the command of the ACP server of the CLI, its
  environment, the folder, the session, the prompt, the mode, the model,
  the effort, the tools of Yonder and the path of the log. The host
  starts the CLI or takes the one of the last turn, then `initialize`,
  `session/new` or `session/resume` (else `session/load`, and the replay
  of the history goes in no log), and sets the mode and the options of
  the session. It answers with the session ID when the session is open,
  and the prompt runs on. A new command or environment, such as a new
  effort of Codex, starts the CLI again, and it resumes the session.
- The host writes the log of the turn as one line for each step
  (`session`, `model`, `text`, `tool`, `permission`, then `end` or
  `error`), so one parser (`acpParse` in `bridge/clis.ts`) reads each ACP
  CLI. The pieces of an answer become one `text` line. A tool call goes in
  once, when it runs or ends, with the kind of ACP as its name (Bash,
  Edit, Read, Search, Fetch).
- A turn in the host runs until its log has `end` or `error`, or until
  the host stops (`followRun`). Stop sends `session/cancel`, and a turn
  that does not end in 3 seconds loses its process. `remove_worker`
  closes the process.
- Yonder asks no person yet. Each permission request gets an answer from
  the mode: Full access allows once, and each other mode refuses once.
  "Always" would write a rule into the settings of the CLI. Each answer
  shows in the conversation as "Allowed …" or "Refused …". Allow and Deny
  on the phone are the next step.
- `/health` of the host gives a hash of `acp-host.ts`. A host of another
  version takes over when it runs no turn: the bridge asks it to quit and
  starts the new one. A host with a turn stays until the turn ends.
- The compiled bridge of a downloaded app is one binary
  (`bridge/entry.ts`): with `--acp-host` it is the host. The release
  scripts compile `entry.ts`. Nobody has tested the host on Windows yet
  (a unix socket).
- Codex runs through `codex-acp`, the ACP adapter of the ACP project,
  which runs the app server of Codex. The bridge takes the adapter next to
  `codex` (Install installs both), else `npx`. `CODEX_PATH` makes it run
  the Codex of the user, and `CODEX_CONFIG` gives the model, the effort
  and the spoken prompt (`developer_instructions`). Its modes are Full
  access (`agent-full-access`), Auto review (`agent`: the reviewer of
  Codex approves the safe steps) and Read only (`read-only`).
- OpenCode runs as `opencode acp`. Its session has the options model,
  effort and mode (build or plan), and the host sets them. In a check, a
  real OpenCode agent on a free model ran three turns through a check
  bridge: a shell command, a second message in the same session, and a
  turn that went on while the bridge restarted.
- Hermes (Hermes Agent of Nous Research) runs as `hermes acp`. Its session
  has the options model (`provider:model`, such as
  `custom:llama3.2-64k`), effort (`reasoning_effort`) and an edit policy.
  Full access is its mode `dont_ask`, and the host allows each command
  once. Hermes 0.23 takes the tools of Yonder as an HTTP MCP server, but
  its capabilities do not say so. So its row sets `http` in `acp.start`,
  and the host then sends the server. It has no flag for a system prompt,
  so the spoken prompt goes in a `<voice-call>` block. The sign-in is
  `hermes model` in a terminal. The Agents tab reads the provider from
  `~/.hermes/config.yaml`, `auth.json` and the model keys of `.env`. The
  Install command also sets `auth.adopt_external_logins: false`: else
  Hermes borrows the sign-in of Codex or Claude Code, and its refresh can
  sign that CLI out. In a check, a real Hermes agent on a local Ollama
  model ran through the bridge: a shell command, a second turn, the 51
  tools of Yonder, and a resume in a new Hermes process after the host
  closed it. The title of an agent of Hermes with no name comes from
  `hermes -z`, on the model of the agent (`askFor`, see `titleOf`).
- Add an agent (the Agents tab, under the CLIs) adds any agent of the ACP
  registry (`bridge/registry.ts`,
  `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`),
  except the agents with a row of their own and Claude. The user
  confirms first, and the row shows at once with "…". The bridge
  downloads the archive for the platform, checks its sha256 and unpacks
  it into `~/.config/yonder/agents/<id>/<version>`, or runs an npx or uvx
  package. The agent is then a CLI (`addedCli` in `bridge/clis.ts`,
  `added` in the state), on at once, in Full access. Its sign-in is its
  own and has no check: until its first session it shows Sign in, which
  opens the agent in a terminal, and a turn that fails gives the way to
  sign in from the auth methods of the agent. Grok and the CLI row find
  an agent by its ID or its name, also with a dash in the ID, such as
  `qwen-code`. An agent that the user added under the name of an alias,
  such as Gemini CLI, wins over the alias. The request of an add can
  take 5 minutes, for a big download. The routes are `/agents/registry`, `/agents/add` and
  `/agents/remove`. In a check bridge, goose (a download) and Gemini CLI
  (npx) were added: each started, and each said how to sign in.
- The first lines give the session ID. A new agent waits up to 5 seconds
  for it, so that a CLI that fails at once gives its error to Grok, and
  its logs go. Grok Build writes the ID only at the end, so the bridge
  picks the ID of a new session for Grok Build (`-s`) and Copilot
  (`--session-id`), and waits 2 seconds for an early failure. The next
  message resumes that session, for example `cursor-agent --resume <id>`. A
  worker id of such an agent is 6 random hex digits, because the session
  IDs of some CLIs start with the time.
- Each CLI ends a good turn with an end event (`result` of Antigravity,
  Cursor, Grok Build and Copilot, `end` of the ACP host). A turn with no
  end event failed, also when it wrote some text.
- The bridge gives each CLI of one process for each turn `/dev/null` as
  stdin, because an open pipe made Codex and OpenCode wait for good.
- The poll (`followRun`) reads the log every 2 seconds. A live process
  is running, with its last step as the activity. An ended process is
  done, with its last text as the result, or failed, with the error of
  the CLI or the end of its stderr. Such an agent never waits: its
  headless run never stops to ask. When it ends with a question, Clef
  gives it the purple dot. `settle` is the end of the poll for Claude
  Code and for the other CLIs: the result, the dots, the push and the
  queue.
- Stop, `now: true`, close and complete send `SIGINT` to the process
  group of the turn, then `SIGTERM` after 3 seconds (`stopRun`), or
  `session/cancel` to a turn in the ACP host.
  `open_in_terminal` opens the session with the resume of its CLI in
  Ghostty, between its turns. `remove_worker` deletes the logs; the CLI
  keeps its own sessions. An agent of any CLI can move to another
  project, and it keeps its CLI and its profile. A change of profile to
  another CLI copies the conversation into that CLI. The same agent
  continues there. The first message on the new CLI holds the newest
  turns of the old session, with a line for each tool call, in up to
  40,000 characters (`bridge/handoff.ts`). It also names the files of
  the whole old session, so the agent can read more. A change of
  model, effort or profile on the same CLI keeps the whole session.
  Sub-agents in the list
  and Claude Code agent types stay with Claude Code.
- An agent of another CLI gets only the commands that its CLI can do
  (`skills` in `bridge/clis.ts`, `/commands?cli=`). "/" in the prompt
  box of a Codex agent shows the skills of Codex (`~/.codex/skills`,
  `~/.agents/skills`, the system skills, and `.agents/skills` or
  `.codex/skills` of the project). `codex-acp` runs `/name` at the start
  of a prompt as a skill or as one of its commands, such as `/review`,
  `/compact` and `/status` (its README; not tested yet, because Codex
  was signed out). The other CLIs show no commands, because the commands
  of Claude Code do nothing in another CLI.
- A Codex sign-in that does not refresh any more fails `session/new`
  with "Authentication required", and Yonder says to sign in again in
  the Agents tab. `codex login status` can say "Logged in using
  ChatGPT" while the token does not refresh any more.
- The conversation view reads the logs of Yonder (`runTurns`): the
  prompts, the text and one line for each tool call. Turns that the user
  does in a terminal do not show.
- Each turn gets the tools of Yonder for that run where the CLI can:
  Codex and OpenCode with the session (`mcpServers` of ACP), and Copilot
  with `--additional-mcp-config`.
  The others get them only when the user turns on Yonder plugins of that
  CLI in the Agents tab. Cursor has no command for it, so its switch adds
  `yonder` to `~/.cursor/mcp.json`, which the Cursor editor shares, and
  keeps the other servers of the file. The spoken prompt goes with the system-prompt
  flag of the CLI (`developer_instructions` in `CODEX_CONFIG` for Codex,
  `instructions` of OpenCode, `--rules` for Grok Build), else in a
  `<voice-call>` block after the prompt, which the conversation view
  hides.
- The permission modes keep the four values of Claude Code, and each CLI
  maps the ones that it has, with its own names: Codex has Full access,
  Auto review and Read only. A CLI refuses a mode that the user names and that it does
  not have. A new agent with no mode gets the mode of its CLI in the
  Agents tab, else the Permissions row of Claude Code when the CLI has
  that mode, else Full access. Accept edits exists only in Claude Code,
  because a headless run cannot wait.
- Clef picks only the effort for another CLI, with no range. The model
  is the default of the CLI, unless the Agents tab or the user names one.
- The Settings home list is Profiles, Environments,
  General, Voice, Appearance, Plugins, Schedules, Triggers and Keys. Keys show
  only on the Mac. Usage and Feedback open from the account card. MCP
  opens from Environments. Super user opens from Voice, and only for a
  super user. The id of Profiles stays `agents`.
- General has Default profile and Steer. A new task uses the default
  profile of its computer: each environment has its own (`cli` of its
  `config.json`, which does not sync), and the note under the row names
  the computer. Steer stays off until the user turns it on.
- Environments lists the paired computers on the phone, and This Mac on
  the Mac. Both show the Tunnel switch. Off closes each tunnel. MCP is
  a row on that page.
- Appearance has Word for an agent, Agent names, Summaries, Detail and
  Group tool calls. Word for an agent writes `agentName`. Agent names
  writes `agentNaming`.
- Each CLI has one Auto update switch. It shows on the page of the CLI
  and on each profile of that CLI. A missing `autoUpdate` means on. On
  removes `--no-auto-update` and `--disable-auto-update` from the next
  run. Off keeps those flags. Claude Code also updates on its own.
  When the switch is on and `grok update --check --json` reports a newer
  stable version, the bridge runs `grok update`. The check starts 20
  seconds after the bridge starts, then every 6 hours, and again when
  the user turns the switch on. The Update button still runs the install
  command. The version row loads again after that command ends.
- The Profiles section (the word of the user, such as
  Tasks): each CLI, then the profiles of that CLI, the sign-in cards,
  Add profile, Add an agent and Look again. A row shows the name, the
  model, the permissions and the week percent. Default marks the
  default profile. A right-click on the Mac, or a long press on the
  phone, on a row gives Set as default (`ProfileRow` in
  `src/Settings.tsx`). The page of each CLI and each profile
  that is on also has a Default profile row (`DefaultRow` in
  `src/Profiles.tsx`): Set makes it the default, and On marks the
  default. This row is there because the long press is hidden. A tap
  on a CLI opens its page: a switch (not for Claude Code), Version with
  Install, Reinstall or Update, Account with Sign in, its sign-in card,
  the settings of its new agents (Claude Code: Default model, Minimum,
  Maximum, Permissions, Yonder plugins; another CLI that is on: Model,
  Effort, Permissions, Yonder plugins), and its profiles. Update
  runs the install command again, which gets the latest version. The
  search opens the page of the CLI for its rows. The bridge finds each CLI with
  `Bun.which` and the folders of the installers, runs `--version`, and
  runs its sign-in check (`inspect` in `bridge/clis.ts`), at most once a
  minute or on Check. A binary that does not start shows "Does not
  start" with Reinstall, for example a Codex that fails with `ENOENT`,
  because its npm install has no platform binary. The `agy` of
  the Antigravity IDE opens the IDE and does not count: only a bare
  version is the CLI.
- A CLI that starts and is signed in is on by default. Install and
  Reinstall run the install command with no terminal, after a confirm
  dialog that shows the command, also from the phone. Then the sign-in
  follows. Sign in starts the sign-in of the CLI at once. See "Sign-in
  and install from the phone" below. A CLI with no such sign-in
  (Antigravity, OpenCode, an added agent) still signs in in a new
  Ghostty tab (`/clis/terminal`). Yonder never reads or copies the token
  of a CLI.
- `start_worker` has a `cli` input. Its description lists the CLIs that
  are on. Grok sets it only when the user names a CLI ("use Codex"). The
  New agent view has a CLI menu in a row of its own when two or more
  CLIs are on, and its other menus then show the values of that CLI. An
  agent row shows the name of its CLI, and the three dots of an agent
  show the models, efforts and modes of its CLI.
- The Usage tab shows the 5-hour and the weekly limit of Codex, from the
  `token_count` events in its session files (`~/.codex/sessions`), with
  no API call.
- `bun run check-clis` (`bridge/clis-check.ts`) checks the parser of each
  CLI with the recorded turns in `bridge/fixtures/` and a log of the ACP
  host, and runs an agent in a fake ACP adapter of Codex
  (`fixtures/fake-acp.ts`) through a start, a second message in the same
  process, a stop, a restart of the bridge during a turn, a restart of
  the host and a removal. It uses no credits.

## Sign-in and install from the phone

- The user installs and signs in to the CLIs from the phone, with no
  trip to the Mac. The login of Claude Code expires after some days with
  no use. Then no agent can run, so no agent can fix it: the bridge
  itself must do it.
- `bridge/logins.ts` runs the sign-in command of each CLI in a
  pseudo-terminal (`terminal` of `Bun.spawn`, 2000 columns wide, so that
  a long link stays on one line). Windows gets pipes. It reads the link
  and the one-time code from the output (`signIn` of each row of
  `bridge/clis.ts`). The PATH starts with a folder with an `open` and an
  `xdg-open` that do nothing, and `BROWSER` names that `open`: Cursor
  runs `open <link>` on macOS with no check, and else the link opens in
  the browser of the Mac.
- The sign-in of each CLI, from the output of the real CLIs, each in an
  empty `HOME`:

  | CLI | Command | The user pastes back |
  |---|---|---|
  | Claude Code | `claude auth login` (link of the form `https://claude.com/cai/oauth/authorize?code=true…`) | Yes: the page shows `<code>#<state>`. It has no device sign-in. |
  | Codex | `codex login --device-auth`: `https://auth.openai.com/codex/device` and a code such as `ABCD-12345`, good for 15 minutes. A personal ChatGPT account turns device codes on first (ChatGPT, Settings, Security), and the card then says so. | No |
  | Grok Build | `grok login --device-auth`: `https://accounts.x.ai/oauth2/device?user_code=…` and the code. It can still open the page in the browser of the Mac too (the `webbrowser` crate of Rust uses Launch Services, not the PATH). | No |
  | Cursor | `cursor-agent login`: `https://cursor.com/loginDeepControl?…`, then it asks the server until the user signs in | No |
  | Copilot | `copilot login --device-code`: "visit https://github.com/login/device and enter code 1234-5678" (from the docs of GitHub; not run, because this Mac has no Copilot) | No |
  | OpenCode, Antigravity, an added agent | A terminal tab. OpenCode has free models with no sign-in, and its sign-in asks for a provider first. Antigravity prints its link only in an SSH session. | — |

- A sign-in is good when the CLI exits with 0 and a new check of the CLI
  (`claude auth status`, the `account` of the row) finds it signed in.
  Codex exits with 0 also when the bridge stops it, and `claude auth
  status` says "signed in" also for an expired token, so neither is
  enough alone. A failed Claude Code code starts a new
  sign-in with a new link, as in the setup above.
- The output of a sign-in stays in the memory of the bridge, and never
  goes to the phone or to a log, because the terminal echoes the pasted
  code into it. The phone gets only the step, the link, the one-time
  code of a device sign-in, which the user must see, and an error. An
  error of a paste sign-in is a fixed sentence, never a line of the
  output.
- Install runs the install command of the row (`sh -c`, `cmd /c` on
  Windows), with the folders of the installers on the PATH, because npm
  can be only in nvm. Then the sign-in starts when the CLI is not signed
  in. The card shows a turning icon and the name while it installs.
- The cards (`Logins` and `LoginCard` in `src/App.tsx`) are over the list
  of agents and in the Agents section of the Settings, on the Mac and on
  the phone. The phone also shows the cards of its other computers, with
  "on <name>", through the link of each one (`reach`). A card is one
  button: "Sign in to Codex". On the phone with Face lock on, the tap
  asks for Face ID first, because a sign-in links an account to the
  computer. Then the card copies the one-time code, shows it large, and
  opens the page. The user pastes the code there. For Claude Code the
  card has the field "Paste the code" too. A card goes when its CLI is
  signed in. The cards load every 2 seconds while one shows, else every
  15 seconds.
- A card shows by itself for Claude Code when it is not installed or
  `claude auth status` says it is not signed in (its sign-in starts at
  once, as the setup above). For each CLI, an agent that fails for its
  sign-in shows a card with Sign in: `ready` for Claude Code, the end of
  a turn with one line that ends with "Please run /login"
  (`SIGNED_OUT_CLAUDE`), and a start or turn of another CLI that fails
  with "Authentication required", "not logged in" and the like
  (`SIGNED_OUT_OTHER`). A device code is good for some minutes only, so
  that sign-in starts at the tap, not before. A good turn of that CLI
  hides the card again.
- The phones get one push when a card shows by itself ("Claude Code is
  signed out"), unless the user works in the app on the computer.
- The card of the plain folder (`~/.claude`) does not show by itself when
  the default profile of the computer is a profile of Claude Code with its
  own folder (`plainNeeded` in `bridge/main.ts`). Else that card comes
  back at each switch of project, while the default profile is signed
  in. An agent that uses the plain folder and fails still
  shows the card.
- `/logins`: GET gives the cards of the computer, and POST `{ id,
  action, code }` runs `login`, `install`, `code` or `cancel`
  (`cliLogin`). POST waits up to 5 seconds for the link. `/logins` and
  `/setup` are in the paths of the relay, so the phone shows the card
  when Claude Code is signed out.
- The tools `cli_status` and `cli_login` give the same to the voice
  agent, so it can say "Claude Code is signed out, do you want to sign
  in?" and tell the user to tap the card. The error of a start says to
  ask the user and to call `cli_login`. `other_computer` takes both, so
  each computer of the phone signs in the same way.
- `bun run check-clis` runs the sign-in of a fake Cursor and of a fake
  Codex through a bridge: the card after a failed start, the link, the
  code, and the end.
- `claude auth status` and `codex login status` only check that a token
  is stored. They say "signed in" also when the token expired. So the
  errors of the turns are the main sign, and a card that an agent
  showed stays until a sign-in or a good turn, not until a status
  check. The errors: Claude Code says "Login expired ·
  Please run /login", "OAuth token revoked · Please run /login" or, with
  `-p`, "Failed to authenticate: OAuth session expired". Codex says
  "Your access token could not be refreshed because your refresh token
  has expired". Cursor says "Authentication required". Grok Build says
  "Token expired. Run `grok login` to re-authenticate."
- `claude setup-token` makes a token for one year, but it only prints
  the token, and Claude Code then reads it from an environment
  variable. Yonder would have to keep it, so Yonder does not use it.
- Not done yet: a sign-in of OpenCode for each provider, and a full
  sign-in with a real account through the card. A real test signs in a profile with its own
  folder, so that the sign-in of the running agents stays as it is.

## Profiles

- A profile works as an instance of T3 Code: a CLI with its own name,
  extra flags and environment variables. The
  profiles are in `profiles` of `config.json` (`Profile` in
  `bridge/main.ts`).
- Profiles is its own section. The list shows each CLI,
  then the profiles of that CLI. Add profile starts a profile of the
  default CLI. Default profile is in General. The page of a CLI still
  has its profiles.
- Advisor: a switch under the list of the Profiles
  section. On writes `"advisorModel": "fable"` into `settings.json` of
  each config folder of Claude Code (the folder of the user and the own
  folder of each profile). Off deletes the key, and Claude Code then
  has no advisor. The switch shows the value of the folder of the
  default profile. A new agent reads it when it starts. So the user
  turns the advisor (Fable 5.1) on and off from Yonder.
- The page of each CLI in the Profiles section has a
  Profiles group: a row for each profile of that CLI, with its account
  under the name and "Default" when it is the default profile, which
  opens its page (`src/Profiles.tsx`), and Add profile, which starts a
  profile of that CLI. Each row of the page of a profile has a short line under
  its name that tells what it does, as T3 Code does, so that the settings
  explain themselves.
- The page: Name, CLI, Separate account (only for Claude Code), Default
  MCP servers (only with Separate account), the account and Sign in
  again, and under Advanced, Program and Extra
  flags, then the environment variables (name = value, the value hidden
  as a password). A new profile is saved when it has a name. Each text
  field is saved when it loses the focus.
- One profile has one login, not many logins. Duplicate profile on the page of a saved profile
  makes "<name> copy" with the same CLI, program, flags and variables,
  and opens its page. A copy of Claude Code gets Separate account and a
  new folder, so its page asks for a sign-in to another account.
- Separate account gives a profile of Claude Code its own config folder,
  `~/.claude-<id>` (`CLAUDE_CONFIG_DIR`), so its agents have their own
  login, settings and history. `folder` in `config.json`
  points a profile to a folder that the user already has. The page has no
  field for it, because Yonder makes the folder behind the screen. Off: the profile uses the folder of the user.
- Default MCP servers is on by default. A new session of a profile with
  its own folder then gets the MCP servers of the user (`mcpServers` of
  `~/.claude.json`, with no `yonder`) through a second `--mcp-config`
  (`defaultMcp` in `bridge/main.ts`). They are in
  `~/.config/yonder/mcp-default.json`, which only the user can read,
  because a server can have a key in its `env`. Each start writes the
  file again, so a new server of the user reaches the next agent. Off
  (`ownMcp` in `config.json`): only the servers of the own folder. A
  running session keeps the servers of its start. A server that signs
  in with OAuth, such as a to-do app, needs its own sign-in in each folder.
  The switch replaces a copy of the servers into each folder.
- When the default profile has its own account (`ownDefault` in
  `bridge/main.ts`), no agent of Yonder uses the folder `~/.claude`,
  which is the login of `claude` in the terminal. A new agent that names
  Claude Code starts on the default profile, or on another profile with
  room (`roomy`). An old agent on that folder moves to the default
  profile with its next message, with a copy of its session
  (`resume`). "default" of `message_worker` gives the default profile.
  So Yonder is a standalone app, apart from the login of the terminal.
  The config still comes from
  `~/.claude`: the Default MCP servers and the links of a new folder. A
  profile without its own account still uses `~/.claude`. The row
  Claude Code in Profiles stays, and Set as default on it is the way
  back to the login of the terminal.
- Yonder does not use CLIProxyAPI for two accounts: that proxy keeps the OAuth tokens and sends
  each request itself. The terms of Claude Code allow OAuth only for
  "ordinary use of Claude Code and other native Anthropic applications",
  and developers "may not collect, store, or intermediate Claude.ai
  credentials or session tokens"
  (code.claude.com/docs/en/legal-and-compliance). Each profile of Yonder
  is a sign-in of the unmodified `claude` in its own folder.
- A new own folder gets links to `CLAUDE.md`, `skills`, `agents` and
  `commands` of `~/.claude`, a copy of `settings.json`, the consent of
  bypass and the onboarding (`makeFolder`). So the rules and the skills
  of the user stay the same in each profile.
- The sign-in of a profile is the link and the code of the setup
  (`/setup?profile=<id>`, `ClaudeSetup` with `profile`), with the card
  of "Sign-in and install from the phone". Its sign-in has the key
  `claude:<id>`, so it runs beside the sign-in of the folder of the
  user. Yonder never signs in for the user.
- Each config folder has its own background service of Claude Code. So
  the bridge runs `claude agents` once for each folder (`claudeDirs`),
  reads the transcripts and the roster of each folder, and runs `claude
  stop`, `rm` and `attach` with the environment of the profile of the
  worker (`envOf`). A `claude stop` without the folder fails with "No
  job matching".
- A session of `claude --bg` gets its environment from the background
  service, not from the command that starts it. So the variables of a
  profile go in the `env` of `--settings` (`settingsOf`), with ASK in a
  mode that asks. A variable in the environment of `claude --bg` does
  not reach the agent. For the other CLIs, the
  variables go in the environment of each turn.
- The extra flags come before the flags of Yonder, so a flag of Yonder
  that comes again, such as `--model`, wins. The page refuses the flags
  that Yonder sets itself (`OWN_FLAGS`), such as `--resume`. For an ACP
  CLI, such as Codex, the flags do not reach the CLI.
- A worker keeps its profile (`profile`). Remove profile refuses while
  an agent of the profile runs, and the folder stays with its login and
  its history.
- `start_worker` takes a profile in `cli`, by its ID or its name, such
  as "use my work profile". Its description lists the profiles.
- Each project can have a default profile, so that one project uses one
  subscription. The order for a new agent is: the
  profile that the request names, then the profile of the project, then
  Default profile of the Settings. When that profile has no usage left,
  the agent starts on another profile with room (`roomy`), as with the
  default of the Settings (`defaultProfile` in `bridge/main.ts`).
  - `projectProfiles` in `config.json` holds the profile id by project
    path. It does not sync, because the paths are of this computer. A
    removed profile does not count, so the Settings apply.
  - `set_project_profile` sets it by the profile name, and "default"
    removes it. `list_projects` gives `profile`, the name, for each
    project that has one. `list_workers` gives `profile` for each agent:
    its profile name, or its CLI, such as "Claude Code". So the voice can
    tell the setup and change it in the same call: "use my work
    account for Sundial", "move 4 to my personal profile"
    (`message_worker` with `profile`).
  - A change of the profile of a project changes only the new agents.
    The agents that run keep their profile, and `message_worker` with
    `profile` moves one agent. A schedule with no profile of
    its own starts on the profile of its project.
  - When the voice gives no project, the bridge guesses the project after
    it picked the profile. The profile of the guessed project then
    applies only when it runs the same CLI.
  - In the app, Profile… in the menu of a project row (a right-click on
    the Mac, a long press on the phone) opens the card from the bottom:
    Default and each profile, with a tick at the one in use. The row
    shows the name of the profile after the name of the project. The
    New agent view starts on the profile of the project.
- The card of an open agent has a Profile menu when that CLI has a
  profile. Each row shows the name and the percent of the week, such as
  "Work · 42%". A new agent, the Default profile row and each profile
  row use the same label. The app reads the percent from `/clis`
  (`week`). It loads `/clis` again when an agent or the new-agent sheet
  opens. Claude Code reads the week meter of that profile. An own
  profile reads its own folder. Grok has one week for every profile. A
  missing meter shows the name only.
- `message_worker` takes `profile`: the name or the id, or "default"
  for the CLI itself. The profile must run the same CLI. A running
  agent stops and continues with the message. Any other agent gets the
  profile with its next message. Claude Code copies the session file
  and its session folder into the projects folder of the new profile
  when the folders differ, then resumes it there. A change of profile
  starts a copy of the session, as a new model or effort does.
  The old folder then lists the session as stopped, so the bridge
  follows the session in the folder of the current profile. Else the
  stopped copy wins, and an agent that moves to a new profile goes to
  the Closed tab while it runs. The newest copy of the transcript wins
  also for a session in a git worktree (`transcriptFile`). Else an agent
  that moves from a worktree shows "running" with an old answer.
- The profiles follow the account to each computer (`config:profiles`
  of the sync). Each environment has its own default profile, and a
  profile that is not signed in on a computer signs in there again. The
  name, the CLI, Separate account and the extra
  flags go up. The variables, `folder` and `program` stay on each
  computer, because they can hold a key or a path. A restore keeps the
  variables of that computer. A new profile with Separate account gets
  its folder (`makeFolder`) on each computer, and each computer signs in
  to it on its own: a start there before the sign-in fails with "The
  profile X is not signed in on <computer>". On the screen, that error
  is the toast "X is not signed in." with a Sign in button. The button
  opens the page of that profile, and the page shows its sign-in card.
  The default profile stays
  on each computer. The newest list wins whole, so two computers that
  add a profile in the same 30 seconds keep one. A profile of Codex
  with `CODEX_HOME` in its variables uses the default Codex home on a
  computer where that variable is not set.
- The menus of profiles leave out Claude Code itself when a profile of
  Claude Code has its own account (`pickable` in `src/App.tsx`). These
  menus are Default profile in General, the Profile menu of an open
  agent and the menu of the New agent view. Claude Code stays in a menu
  while it is the value, and the Profiles list keeps its row. Claude
  Code itself is the folder `~/.claude`, the login of `claude` in the
  terminal. So a `/login` in Ghostty changes the account of each agent
  on it. Else it can show the same account as a profile, and each
  account must show as one row.
- A full session or week shows as "out of usage" in place of the
  percents, as "Work · out of usage". The last answer of
  an agent can be the one of Claude Code for a full account, such as
  "You've hit your session limit · resets 11:20pm (UTC)".
  Its third line (`Tag`) is then "Out of usage · resets 11:20pm" in
  red.
- A new task with no profile, and each summary (`ask`), goes to the
  default profile. The default can be a login of Claude Code that has
  used all of its session or its week. Then the work goes to the first
  other profile with its own account and room (`roomy` in
  `bridge/main.ts`). An unknown meter counts as room. The New agent view
  sends the default profile as no CLI, so that the bridge can make this
  choice. An agent on a profile with no usage left moves to a profile
  with room with its next message, with a copy of its session
  (`resume`, `roomFor`). Else a default login that hits its session
  limit again and again makes the user sign in again in the terminal to
  use another subscription.
- The answer of Claude Code for a full account, such as "You've hit
  your session limit · resets 2am (UTC)", marks that folder
  full until the reset of its meter, or for one hour when the meter
  does not know the reset (`limitHit`). The meters of that folder then
  say 100, so `roomy` skips it and its row shows "out of usage". An
  agent whose turn ends with that answer gets "Continue." at once on a
  profile with room, with no push. A summary (`ask`) that gets it goes
  once more to the next profile with room. Two full profiles do not
  loop: the second answer finds no profile with room. Claude Code can
  refuse each turn of a profile while its meter still says 94%, and
  without this mark no agent moves.
- Claude Code refreshes its login only when it runs. So the login of a
  profile with no agent expires after some hours, and its row shows no
  usage. A usage read of an own folder starts a tiny `claude -p` in
  that folder in the background (`refreshLogin`), when the stored login
  is past its `expiresAt` or the read gets 401 or 403. It runs at most
  once in 30 minutes, and the next read gets the numbers. A check of the
  status alone misses the expired login.
- Each profile with its own account stays signed in while the bridge on
  port 7787 runs: every 30 minutes the bridge reads its usage, so an
  expired login gets its refresh also with no agent and no app. A
  refresh that fails for good, or a turn of its agent that fails for
  its login (`SIGNED_OUT_CLAUDE`), marks the profile as signed out
  (`lostProfile`): its row says "Not signed in", its page shows the
  sign-in, `roomy` skips it, and the phones get a push. It stays so
  until its stored login is good again. Two logins of one account work
  side by side: `~/.claude` and a profile with the same account both
  refresh with no error.
- The last good usage of each own folder stays in
  `claude-usage-dirs.json`, so a restart of the bridge keeps the
  numbers of each profile. With an own default profile the bridge does
  not read the usage of `~/.claude`, the login of the terminal. Else,
  when that folder and a profile have the same account, the endpoint
  answers 429 to the reads of both.
- Not done yet: a separate folder for the other CLIs. A profile of
  Codex can set `CODEX_HOME` in its variables.

## People

Two people or more can work on one computer at the same time, each with
their own phone. Each person starts their own tasks and gets their own
answers. The plan is in `docs/multi-user.md`.
All the people share one OS account, the same files and the same agents,
so the owner of a task is a label that sends its answers to the right
phone. It is not a lock.

The people are in `people` of `~/.config/yonder/config.json`. An agent
changes them with an edit of that file. The bridge reads the file at
each request, so the change applies at once, with no click and no
restart. No `people` key, or one person, means that Yonder works as for
one person: no owner filter, no `<from>` tag, and each push goes to each
phone.

```json
{
  "people": [
    {
      "id": "pierre",
      "name": "Pierre",
      "main": true,
      "profile": "hermes",
      "workspace": "yonder",
      "devices": [{ "id": "Xq3vL9aT2mKp8sWe", "name": "Pierre's iPhone" }]
    },
    {
      "id": "marco",
      "name": "Marco",
      "devices": [{ "id": "Hb7nR4cY1uJd6fQo", "name": "Marco's iPhone" }]
    }
  ]
}
```

- `id`: a short word that never changes. Each task keeps it in `owner`.
  To rename a person, change only `name`.
- `name`: the name in the row of a task and in the `<from>` tag.
- `main`: true for one person at most. The main person owns the Mac
  window, the tasks with no owner (the old tasks and the sessions that
  Yonder did not start) and each paired phone that no person lists. With
  no `main`, the first person is the main person.
- `profile`: the default profile of a new task of this person, when the
  start names no CLI and no profile. A name that is not a profile is
  left out.
- `workspace`: the default workspace of a new task of this person that
  names none: a workspace id or name, or a project name or folder, as
  `start_worker` takes it.
- `devices`: the paired phones of the person. `id` is `deviceId()` in
  `bridge/relay.ts`: the last 16 characters of the public key of the
  phone, with no `=`. It is the value of `x-yonder-device`. The bridge
  writes `name`, and does not read it. `GET /relay` lists the paired
  phones with their keys.

How to change it:

- To add a person, add an entry. A person with no devices is valid, so
  an agent can add the person before the phone pairs.
- To move a phone to another person, take its entry out of one
  `devices` list and put it in another.
- A list that is not valid keeps the last good list, and the log of the
  bridge says why. Not valid: two people with one `id`, one device in two
  lists, two main people, a person with no `name`.
- An edit of the file never pairs or unpairs a phone. Remove a phone in
  File > Pair Phone. The bridge then takes it out of `people` too.
- A new phone goes into the file by itself: to the person of the pick of
  the pairing window, or else to the main person.

What changes with two people or more:

- Each task gets `owner`: the person of the phone, the owner of the
  agent that started it (`start_worker` of an agent), or the owner of the
  schedule. A reminder keeps the person who set it.
- Each message of `start_worker` and `message_worker` ends with
  `<from>Name</from>`, so the agent knows who speaks. The chat of the
  app does not show the tag.
- The pushes of a task, its questions, its approvals (also the 1Password
  prompt) and its pick of a file go only to the phones of its owner. The
  1Password vault of the agents is still one for the computer, for all
  the people. When the main person works in the Mac window, the phones
  get no push of the main person, but the other people still get theirs.
- `get_location`, the other abilities of the phone, `preview` of the
  Claude call and the canvas of `build_app` use the last phone of the
  person.
- `list_workers` gives only the tasks of the person who asks. `scope:
  "all"` gives the tasks of each person, with `owner`, the name of the
  person. The task list of the app has a Mine / Everyone switch in the
  title bar, and Everyone shows the name of the owner on each row. With
  one person, the switch does not show.
- The pairing window has a Person field over the code when a phone is
  paired already. A new name makes a new person. The first new person
  makes `people`, with the paired phones for the main person, named after
  the user of the computer.
- `GET /people` gives `{ people: [{ id, name, main }], me }` for the
  screen, and an empty list with one person. A screen of the user reads
  it with `yonder.people.list()`.
- One look and one set of settings stay for the computer. The other
  computers that a phone introduces stay linked for all the agents.

`bun bridge/people.ts` checks the rules of the file.

## Schedules

- A schedule starts an agent again and again at set times, such as
  every 24 hours, an agent in the sundial project that runs its daily
  video skill. The bridge runs all
  the time on the Mac, so it holds the timer. The runs must be on the
  Mac, with its CLIs and its logins.
- Decision: Yonder has its own schedules. The routines of Claude Code
  (`/schedule`) run in the cloud of Anthropic, on a copy of a GitHub
  repository, so they have no CLI and no login of the Mac. `CronCreate`
  of Claude Code lives only in one open session, fires only while that
  session waits, and stops after 7 days.
- A schedule (`Schedule` in `bridge/main.ts`, `schedules` in
  `state.json`) has a name, a project (its path), a task, a timing, and
  an optional profile, CLI, model, effort and mode, and it can be paused.
  `profile` is the id of a profile. Each start runs as that profile: its
  CLI, its sign-in and its settings. No profile: the start uses `cli`, or
  the CLI row of the Agents tab when `cli` is not set. The task can start
  a skill or a command, such as `/daily-report`.
- The timing is `every` (hours, counted from the last start) or `cron`
  (5 fields in the local time of the Mac). Daily at 9:00 is
  `0 9 * * *`, and weekdays at 9:00 is `0 9 * * 1-5`. `bridge/schedule.ts`
  finds the next start, and `bun bridge/schedule.ts` checks it.
- A check every 30 seconds starts each schedule that is due, with
  `startWorker`, the start of `start_worker`. The check sets the next
  start before the start, so the next check does not start it again.
- A Mac that sleeps runs no check. When it wakes, a schedule that was
  due starts one time, and its next start counts from then. So the
  starts that the sleep missed do not pile up.
- A dark wake does not count as a wake. With the lid closed, the Mac
  wakes for a minute at a time for the network, and then sleeps again.
  `pmset -g systemstate` lists `Graphics` only in a full wake
  (`awakeMac`, `fullWake` in `bridge/schedule.ts`). In a dark wake, no
  schedule starts, and no retry of a run goes out (`sendQueued`). Both
  wait for the next full wake.
- While a worker runs, such as a run of a schedule, the bridge holds `caffeinate -i`, so
  the Mac does not go to idle sleep (a Mac can sleep after 1 minute
  with no use). A closed lid still puts the Mac to sleep. Then the run
  continues at the next full wake.
- A schedule whose agent of the last start still runs skips the start.
  A start that skips or fails sends a push ("Did not start: ..."), and
  the page of the schedule shows it under Past runs. The agent of a
  start sends the usual push when it finishes, fails or waits.
- The agent of a start is a normal worker with `schedule` (the ID of the
  schedule), so it shows in the app as any agent. Its row says
  "Scheduled". Its system prompt says that no user answers during the
  run, so it does the whole task and asks no question.
- The tool `schedule` has the actions `list`, `save`, `run` and
  `remove`. Grok and the app both use it. `save` with no `id` adds a
  schedule, and with an `id` (or a name) it changes only the given
  fields. It takes `every`, `at` ("HH:MM") with `weekdays`, or `cron`.
  A new timing, and a schedule that starts again after a pause, count
  the next start from now, so a save never starts the agent at once.
  `run` starts it now, and for `every` the period starts again.
  `model` and `effort` take `auto`, so Clef picks them at each start.
- The Settings have a Schedules section (`src/Schedules.tsx`), on the
  phone and on the Mac: a row for each schedule with its timing, its
  project and its next start, and New schedule. The page of a schedule
  has Name, Project, Profile, the task, Repeat (Every N hours, Daily,
  Weekdays, Cron) with its value, On, Model, Effort, Retries, Run now,
  Past runs and Delete schedule. Profile is Default, or one profile.
  Default follows the CLI of the schedule, or the CLI row of the Agents
  tab. Each change saves at once, as on the page of a profile. A tap on
  a past run opens its agent. A removed profile stays on the schedule.
  The row says Removed, and the next start does not run. A CLI that is
  not installed, or a profile that is not signed in, does not start. The
  page shows the reason under Past runs, and the phone gets one push.
- The past runs are the agents of the schedule that Yonder still has.
  A removed agent leaves the list.
- Each run starts with `closeWhenDone`, so it closes itself when it
  ends well, and the push says "Closed itself: ...". A run that fails,
  asks a question, or leaves something for the user stays open
  (`closeItself`). A retry in the queue holds the close until the last
  turn.
- A run that ends well (done, and Clef does not judge it failed) adds one
  JSON line to `~/.config/yonder/schedule-runs.jsonl`: `at`, `schedule`,
  `name`, `agent`, `tries` and `result` (the end of the result). The
  line comes once for each run: `closeWhenDone` of the run is on only
  for its own turns, so a later message of the user adds no line. The
  `list` action of `schedule` gives the last 5 lines of each schedule
  as `ok`, also of removed agents.
- Retries (`retries` of the schedule, 0 to 5, 2 when not set). A run
  can stop early: its session dies, the computer restarts, or the turn
  fails. A run can also end with a result that Clef judges not done
  (`worthTelling`, the same check that sets the purple dot, on Workers
  AI, so it uses no Claude credits). In each case `settle` puts one
  message in the queue of the agent: "Yonder checked this run of the
  schedule, and the task is not done yet ... Continue from where you
  stopped, and finish the task." The agent continues in the same
  session, with no push, and `tries` on the worker counts the
  retries. After the last retry, the push says "Failed after N
  retries: ...". A run whose session died shows as Failed, not Closed.
  A run with a retry in its queue counts as running, so the next start
  skips. A Mac that sleeps holds the session, and it continues when the
  Mac wakes.
- A turn that ends on an error of the API (`isApiErrorMessage` in the
  transcript, `apiError` of `lastTurn`) is a failed run, with no need
  for Clef. A turn that a sleep cut ("API Error: Your computer went to
  sleep mid-response") gets a free retry: it does not count in
  `tries`, and it goes out at the next full wake. A done run that Clef
  cannot judge checks its own work in one more turn ("Yonder could not
  check this run ..."), with a retry. `retryOf` in `bridge/schedule.ts`
  decides, and `bun bridge/schedule.ts` checks it. The bridge log has a
  line for each retry ("Schedule <name>: agent N continues ..."). So a
  run resumes by itself, with no person in the loop, and checks its
  work.
- The bug of the sleep: without the rules above, a run that starts in a
  dark wake, with the lid closed, ends on "API Error: Your computer went
  to sleep mid-response", and the bridge takes the turn as done, with no
  retry.
- The bug of the daemon: after a reinstall of the app, a new bridge
  takes the daemon of Claude Code as a daemon outside Yonder.app, and
  stops it with `--keep-workers`. When no `claude --bg` comes for some
  minutes, no new daemon takes the sessions, and all of them die
  (`daemon.log`: "adopt: adopted=0 respawned=0 dead=16"). A dead run
  then shows as closed, and a close sends no push. So `freeDaemon` stops
  such a daemon only when no session works, and checks again each
  minute. A run of a schedule that dies retries.

## Reminders

- A reminder is a timed push, such as "remind me to do this in 24
  hours": a push from Yonder then comes to the phone. A schedule starts
  a whole agent, which is too much for a plain reminder.
- A reminder (`Reminder` in `bridge/main.ts`, `reminders` in
  `state.json`) is a text and a time. It starts no agent, and it has no
  screen and no setting.
- The tool `remind` has the actions `save`, `list` and `remove`. Grok,
  the Claude call and the agents use it. `save` takes `text` and
  `minutes` from now, or `at`: "HH:MM" (the next such time) or
  "YYYY-MM-DD HH:MM", in the local time of the computer. A time in the
  past fails (`remindAt` in `bridge/schedule.ts`).
- The check of the schedules (every 30 seconds) sends each due reminder
  with the push of the relay: the title "Reminder" and the text. A tap
  opens Yonder. It goes also when Yonder is closed on the phone, and
  also while the user works on the Mac (it does not use `hereUntil`).
- A reminder needs no full wake, so a dark wake sends it too. A reminder
  that a sleep missed goes one time at the next wake. A reminder that
  reached no phone, such as right after a wake with no network yet,
  tries again at each check, up to 20 times (10 minutes). The log of
  the bridge says "Reminder <id>: sent to 1 phone".

## Notify

- `notify` lets Claude ping the phone at once, with its own title. A
  reminder waits for the next check (up to
  30 seconds) and always has the title "Reminder".
- The tool `notify` takes `text` (240 characters at most) and an
  optional `title`. With no title, the push has the name of the agent
  that calls, or "Yonder". It sends the push of the relay at once, to
  the phones of the person of the call (docs/multi-user.md).
- It goes also while the user works on the Mac (it does not use
  `hereUntil`), because the agent asked for it. It gives `sent`, the
  number of phones that got it. `sent: 0` comes with a note: no phone
  with push, or no key of Apple.
- An agent that ends its turn sends its own push, so an agent uses
  `notify` only when the user asks for a ping in the middle of the
  work, such as "ping me when the deploy is live".
- A script on the Mac calls it through the `/mcp` address of the
  bridge, with the header `x-yonder-token` (the token of
  `config.json`).

## Triggers

- A trigger starts an agent when something happens, as a schedule
  starts one at set times. For example, a new Sentry error starts an
  agent that fixes it.
- A trigger is universal: Claude Code designs it as a script or a
  webhook. A trigger has no kinds, and Sentry is one setup of a trigger,
  as any other service.
- A trigger is a schedule with `event` (what starts it, in the words of
  the user, the When row) in place of a timing. So it has the same page,
  profile, model, effort, retries and Past runs. It starts in one of two
  ways: a `script`, or a `hook` (a webhook). A trigger with only its
  event is "Not set up".
- The Triggers section of the Settings, after Schedules, lists the
  triggers and has New trigger. The page of a trigger has When, the
  task, the Script box (or the URL of a webhook), Set up with Claude
  Code, and On. The Repeat row of a schedule has only the timings. The
  triggers have their own section, because they are hard to find in the
  Schedules section.
- Set up with Claude Code (`design` of the `schedule` tool) starts a
  normal agent in the project of the trigger, with its profile. So the
  user sees it, and it can ask a question. Its task is `designPrompt`
  in `bridge/schedule.ts`, the rules of a script:
  - Yonder runs it with `sh` each minute in the folder of the project,
    for 60 seconds at most.
  - Each line that it prints is one event. The same event prints the
    same line each time, with no counts or times.
  - The first run only notes its lines.
  - A token comes from the config of its CLI, and no secret goes into
    the script. It ends with an error code when the check cannot run.
  - "API" and "command" are both scripts: a script can call any API
    with curl, or any CLI. The agent makes a webhook only when nothing
    can be polled, or when the user asks for one.
- By voice: save with name, project, task and event, then design with
  its id, then "turn it on" (`paused: false`).
- A trigger that an agent saves (a call of the `schedule` tool from a
  worker, with any field) stays off, and an agent cannot turn a trigger
  on. Only the app and the voice call can. An agent can read text that
  anyone wrote, and a script runs each minute with no review, so the
  user checks the script before it runs. A script that the user types in
  the app is not paused.
- A script trigger (`script`, `pollScript`). Each minute the bridge runs
  the script. Each new line of its output (trimmed, the last 100,
  `outputLines`) starts the agent, with the line as data. The first run
  after a save, a new script or a start after a pause only notes its
  lines (`seen`, hashes of the lines). So the lines that were there
  before start no agent.
- One agent of a trigger runs at a time. A line counts as seen only when
  its agent starts, so the other new lines wait for a later run, and a
  start that fails tries again. A run that waits on the user does not
  count as running. A script that ends with an error shows the last line
  of its error under Past runs. A trigger sends a push only for a new
  reason, so a run each minute sends one push. Run now runs the script
  at once.
- A setup for Sentry, such as a trigger "Fix new Sentry errors": a
  script that reads the token of `~/.sentryclirc`, asks Sentry for the
  unresolved issues of `<org>/<project>`, and prints `<shortId> <title> <permalink>` for
  each one with `jq`. `sh` has no `pipefail`, so the script keeps the
  answer of `curl -sfS` in a variable, and ends with 1 when curl fails.
- A schedule with no timing never starts by the clock
  (`checkSchedules`). So a trigger of an older bridge, such as a
  built-in Sentry poll, does nothing.
- Prompt injection is a risk: a webhook on the web starts agents on text
  that anyone can write. So each trigger runs in Auto mode, and a webhook
  can check the signature of its service.
- The mode: a trigger runs in its own mode, or in Auto, never in Bypass
  (`runMode`). A save of a trigger with `mode: bypassPermissions` fails,
  and a schedule in Bypass that becomes a trigger loses that mode. A
  save also fails when the CLI has no such mode: OpenCode, Cursor,
  Copilot and the agents of the ACP registry have no Auto mode. In Auto, a tool
  call that needs a yes shows Allow and Deny on the phone (see the
  permission modes of Workers).
- A webhook trigger (`hook`) is for a service that can only push.
- `hook` is a secret of 32 hex characters (122 random bits). The
  address is `https://mcp.yonder.so/<id>/hook/<hook>`: the address of
  the Claude connector of this computer, then `/hook/` and the secret.
  The relay sends each request under `/<id>/` to this computer over the
  open socket of the bridge, so the relay needs no change. The bridge
  also takes `/hook/<hook>` on 127.0.0.1:7787, for a program on this
  computer and for `bun run check-bridge`. It compares the secret in
  constant time. A wrong secret gets 404, a GET gets 405, and a trigger
  that is off answers 200 and starts nothing.
- The bridge answers 202 before the start, because Sentry waits only 1
  second. The start is the start of a schedule (`runSchedule`). A start
  that fails shows under Past runs and sends one push.
- The prompt is the task, then the event: the body of the request, or
  the line of the script (`eventPrompt` in `bridge/schedule.ts`). Anyone
  can write the text of an event, such as the message of an error. So
  the event is data in a tag with a random part, and the prompt says to
  obey no instruction in it. `eventText` keeps the form of JSON, cuts each text
  to 500 characters and each list to its last 10 items (the last frames
  of a stack trace are where the error is), puts the plain values of
  each object first, and cuts the whole to 12000 characters. A Sentry
  event has about 50 KB, and the prompt is one argument of the CLI.
  `bun bridge/schedule.ts` checks these rules.
- A request that comes while the agent of the last start runs goes into
  the queue of that agent. So two agents of one trigger never change
  the same files at the same time, and no event is lost. At most 5
  events wait. A later one gets 429, and shows under Past runs.
- The signing secret (`secret`, the Signing secret field of the page).
  With it, a request needs the signature of its service, an HMAC-SHA256
  of the body with the secret (`signed`): `sentry-hook-signature` (hex),
  `linear-signature` (hex), `x-hub-signature-256` (`sha256=` and hex,
  GitHub), or `stripe-signature` (`t=<seconds>,v1=<hex>` of
  `<seconds>.<body>`, at most 5 minutes old). A request with no known
  signature, or a wrong one, gets 401. The secret never leaves the
  bridge: the `schedule` tool gives only `signed: true`, and the field
  of the page stays empty and says Set.
- Anyone with the address can start the task of a webhook trigger with
  no signing secret. The address goes to the app and to the voice agent
  in the result of the `schedule` tool. Each new webhook gets a new
  secret.
- A computer that sleeps, or has no connection to the relay, gets no
  request: the relay answers 503, and the service may not send it
  again. A script trigger runs again when the computer wakes.

## Secrets from 1Password

- Agents get logins and keys from the 1Password of the user with a yes
  on the iPhone. Else each `op` prompt needs the user at the Mac. Yonder
  works with 1Password and does not rebuild it. The
  design, the research and the three ways are in `docs/secrets.md`.
- No feature of 1Password takes a yes from the phone: `op`, the SDKs and
  the agent features of 1Password ask for Touch ID on the Mac. So Yonder
  uses a service account, a token that reads only its vaults (here the
  vault "Agent"), and puts its own yes in front of it.
- The token is sealed to each phone that connected in the last 3 days and to the phone that says yes (`bridge/vault.ts`), so an old pairing or a test pairing in headless Chrome gets no seal: ECDH
  with the key of the phone (`vaultKey` in `src/link.ts`), HKDF and
  AES-GCM. `~/.config/yonder/vault.json` keeps only the sealed copies and
  the list of the items (vault, title, category, websites), never the
  token or a value. The token goes from the phone (Settings, General,
  1Password, `src/Vault.tsx`) to the bridge through the encrypted link.
- An agent calls `use_secret` with `why`, the `op://` reference of each
  secret, and `run` (with `env` or `stdin`) or `fill` (CSS selectors of
  the tab of browser-harness). `list_secrets` gives the items with no
  values. Only an agent gets these tools: the bridge gives them to a
  client with no device and no call, and Grok has a device.
- The request is the `ask` of the agent with the kind `secret`: the card
  has the items as the title, the reason, and the rows Vault, Use and
  For. The agent waits. Approve (with no Face ID) makes the key
  of the seal of that phone and sends it to `/vault/approve`. Deny goes to
  `/permission`, as the Allow dialog does. With no answer in 10 minutes,
  the request ends.
- On a Mac, the card says "Approve with Touch ID", so that no ask goes to
  the phone while the user uses Yonder on the Mac. The
  window of Yonder keeps its own ECDH key in IndexedDB, where it cannot be
  read out (`approveOnMac` in `src/Vault.tsx`), and sends the key of its
  seal with its public key. The bridge asks Touch ID itself (`ownerCheck`)
  before it uses that key, so a program on the Mac cannot approve. The
  first time, Touch ID lets the window in (`macs` in `vault.json`), and
  the phone approves that one request, because the window has no seal
  yet. Each yes after it seals the token to the window too. Only one
  window gets in, and a new token from the phone drops it. When the
  window has a seal, the push waits while the user is at the Mac, as for
  the other asks. Before that, the phones get a push at once. The limits
  of this key are in "What it protects" of `docs/secrets.md`.
- The bridge opens the token with the key, reads the secrets with the
  1Password SDK (`@1password/sdk`, the token in memory, because
  `ps -E` shows the environment of a running `op`), and seals the token
  again with new keys, so a key opens a seal only once.
- Run: the command runs in the folder of the agent with the secrets in
  its environment or on its input, and the output comes back with each
  value replaced by `<1Password>`. Fill: `Input.insertText` into each
  field, only when the tab is still on the site of the card and the site
  is a website of the item. A fill to another site asks nothing.
- A yes lasts `minutes` (10 by default, 60 at most, 0 for once) for the
  same agent and items, and for a run only the exact command with the
  same folder, `env` and `stdin` (for a fill, the same site). Another
  command asks again, because the mask hides only the exact value, and
  a command such as `printf %s "$T" | base64` would print it in another
  form. The values stay only in the memory of the bridge.
- Each request, answer and use is a line in
  `~/.config/yonder/approvals.jsonl` (the log of the approvals of the
  Canvas, `docs/canvas.md`), with the references and never a value. On
  Individual and Families plans, 1Password shows no record of what a
  service account read, so this log is the record.
- Only a phone can give the token or a yes: the relay marks each request
  of a phone with `RELAY_MARK`, a value in the memory of the bridge
  (`bridge/relay.ts`). `x-yonder-device` alone is a header that any
  program on the Mac can send.
- The Claude Code workers get the yonder server with `timeout` in
  `--mcp-config`. Without it, Claude Code drops a tool call whose answer
  has no first byte in 60 seconds, and use_secret waits for the phone.
- `/permission` is in the paths that a phone can use (`PATHS` in
  `bridge/relay.ts`). Else the relay answers 403, and Allow and Deny on
  the phone do nothing.
- Limits: all agents run as the same macOS user, so a hostile agent can
  read a value while a command uses it (`ps -E`), or read a filled field.
  No Face ID guards the tap or the key in IndexedDB. The compiled bridge
  of a downloaded app cannot load the SDK yet (its WASM file). A phone
  that pairs again needs the token again.
- Checks: `bun bridge/vault.ts`, and the 1Password part of
  `bun run check-bridge`, with fake items (`YONDER_VAULT_FAKE`).
  `bun bridge/vault-e2e.ts` runs the whole path with fake items: a test
  bridge, its own relay identity, a phone page in headless Chrome that
  pairs through the relay, a run, a second run with no card, Deny, a
  fill and a fill to a wrong site. It needs the network and Chrome, so
  GitHub does not run it, and it uses no credits.
- The agents learn it from one sentence of their prompt (`SPOKEN`): for
  a login or a key from 1Password, call use_secret, not `op`.
- A new agent has a first ID, such as `new1761190000001`
  (`showStarting`), and the `--mcp-config` of its session has that ID in
  `?worker=` for all turns. The agent then gets the ID of its session.
  So the agent keeps the first ID as `startId`, and `byCaller` finds it
  by either ID. Else use_secret refuses each agent that Yonder started
  with "use_secret works only for an agent that Yonder started". The
  first ID has the time in it, so it stays unique after a restart of the
  bridge. An agent of an older bridge has no `startId`, so it still gets
  the refusal.
- The ID of an agent is public (`list_workers`), so the address also has
  `&key=`, an HMAC of the ID with a secret that only the bridge keeps
  (`~/.config/yonder/worker-key`, mode 600, not in the environment of the
  workers), so one agent cannot make the key of another (`mcpUrl`). The
  first call with a valid key marks the agent `keyed`. A call with the ID
  of a keyed agent and no key, or with a wrong key, gets 403
  (`callerOf`). So another computer, or a program that knows only the ID,
  cannot call as that agent, such as use_secret within its yes. A session
  keeps the address of its start, so an agent from before the key never
  sends one and works with its ID alone. The relay drops `worker` and
  `key` from a `/mcp` call of another computer. A program of this user
  can still read the file or the address in `ps`.

## New task links

- A generic link opens a new task, for a site that the user trusts,
  such as the admin page of acme:
  `yonder://new?v=1&source=<id>&folder=<path>&name=<name>&prompt=<text>&ts=<unix seconds>&nonce=<32 hex>&sig=<hex>`,
  each value encoded with `encodeURIComponent`. The code names no site:
  each site is one entry of `trustedLinkSources` in `config.json`.
- Any web page can open a `yonder://` link, so a link is untrusted input
  (prompt injection). A link never starts a task by itself.
- `trustedLinkSources`: `[{ "id": "site.example", "key": "<64 hex>",
  "folder": "/abs/path" }]`. The key stays on the computer: no route
  gives it, the Settings and the sync of the account take only the keys
  of the schema, and the bridge writes `config.json` with the mode 600.
- `sig` is the lowercase hex HMAC-SHA256 of
  `"v1\n" + source + "\n" + folder + "\n" + name + "\n" + ts + "\n" +
  nonce + "\n" + prompt` (the decoded values), with the UTF-8 bytes of the
  key text (not decoded from hex).
- The bridge checks the link (`bridge/link.ts`): a trusted source, the
  signature (constant time), a time stamp at most 600 seconds from now, a
  new nonce (the used ones stay 30 minutes in `state.json`, also over a
  restart), the folder inside the folder of the source after the
  symlinks and `..`, and a prompt of at most 16000 characters.
  `bun bridge/link.ts` checks these rules.
- The page (`src/NewTask.tsx`) gives each `yonder://new` link to `/link`.
  A refused link shows the toast "Yonder blocked a link from an unknown
  source" and no card. A valid link opens the approval card from the
  bottom, as the other approvals: the source (marked Verified), on the
  Mac the app that opened the link, the full folder, the name, the full
  prompt as plain text, and the permission mode and the model from the
  Settings. The link cannot set them. Cancel is the default, the card
  shows the time left and closes after 10 minutes, and a link that comes
  while a card is open is dropped. An approval of Yonder is never a
  modal dialog in the middle.
- Start asks for Face ID on the phone (the ability `face_id` with
  `passcode`), or Touch ID on the Mac (`owner_check`), with the passcode
  or the password as the fallback. The Mac reads "Yonder is trying to
  start a task from <source>. Touch ID or enter your password to
  continue with Yonder." The app asks itself (`src-tauri/owner.m`, which
  `build.rs` compiles into the app), because macOS names the process that
  asks and shows its icon. Else a helper program asks, and the dialog
  shows its name and the icon of a bare program. Then `/link/start` checks the link again, uses up the nonce,
  and starts the task like `start_worker`, in the folder, with the prompt
  and the name. A start needs a check of `/link` at most 10 minutes
  before, and judges the time stamp at the time of that check.
- A test link: `bun bridge/link.ts make <key file> <source> <folder>
  <name> <prompt>`.
