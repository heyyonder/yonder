# Bridge

- The bridge is the only process that starts workers. Yonder's own voice
  agent is one MCP client of it. Any other agent can connect the same way.
- The tools: `list_projects`, `add_project`, `create_project`, `remove_project`, `star_project` (also the order), `start_worker`,
  `message_worker`, `stop_worker`, `unqueue`, `list_workers` (with `query`, it searches the agents), `review_workers`, `get_worker`, `rename_worker`, `move_worker`, `star_worker`,
  `close_worker` (with `done`, it marks as completed), `remove_worker`, `open_in_terminal` (opens a worker in
  Ghostty with `claude attach`), `open_folder`, `read_file`, `copy_to_clipboard`, `open_link` (a web link in the default browser of the Mac), `preview` (see Yonder Preview; an agent cannot open a site with it), `connect_claude` (see Yonder in the Claude app), `browser`,
  `project_overview`, `rebuild_app`, `restart_bridge`, `about_yonder`, `schedule` (see Schedules), `remind` (see Reminders), `notify` (see Notify), `use_secret` and `list_secrets` for the agents only (see Secrets from 1Password), `show_app`, `build_app`, `change_app` and `remove_app` (see Apps), `ask_user`, `set_theme`, `customize`, `get_location`, `phone`, `get_usage`, `other_computer` and `cli`.
- Some old tools merge into other tools, so that fewer tools overlap.
  `show_on_device` is `preview` with `open` and a local `url`.
  `complete_worker` is `close_worker` with `done`. `cli_status` and
  `cli_login` are `cli` with `status` and `login`. `order_projects` is
  `star_project` with `order`. The `phone` tool lost `location` (call
  `get_location`), and `confirm` and `sheet` (call `ask_user`). A call
  with an old name still works with its arguments: `RENAMED` and
  `renamed` in `bridge/main.ts` change it before the server gets it, and
  log each old name one time. `other_computer` takes any name, so it
  can still send `cli_status` and `cli_login` to a peer with an older
  bridge, which knows only them.
- The hidden tools (`HIDDEN` in `bridge/main.ts`): a list of
  the tools does not show them, and a call still reaches them.
  `list_folders` is for the folder picker of the phone, so no voice agent
  and no agent sees it. `rebuild_app` and `restart_bridge` show only on
  the copy with the source: a user of a download does not change the
  bridge, and the Update button of the app still calls `rebuild_app`.
  `browser` stays for each user. `create_project` names the default
  folder of the computer (`~/Sites` on the Mac), and `customize` names no
  file of the source.
- `ask_user` works for each client. An agent asks on
  its row. A voice agent (Grok, the Claude call, the Claude
  app) has no row, so it asks with the native sheet of the phone, and
  the phone gives the answer. The guard of the voice against a close
  that the user did not ask for (`GROUPS` in `src/voice.ts`) checks
  `close_worker`, so it also guards a close with `done`.
- The bridge gives each worker the MCP server `yonder` with
  `--mcp-config` when it starts the worker, so the workers have the tools
  on a new Mac too, with no change to the settings of Claude Code. The
  Yonder plugins row of Claude Code in the Agents section of the Settings
  (off until the user turns it on) runs
  `claude mcp add --scope user --transport http yonder
  http://127.0.0.1:7787/mcp`, or `claude mcp remove`, for each other
  session, such as one in a terminal. Yonder does not add it by itself,
  because it changes the settings of the user and gives each session
  tools that start and remove agents. The bridge is then the MCP server `yonder` of each Claude
  Code session on this Mac. So each agent, a worker or a session in a
  terminal, can call the tools of Yonder. The workers get all the tools, also `start_worker`,
  `remove_worker` and `rebuild_app`. `MAX_RUNNING` stops a loop of new
  workers, and the prompt of the workers forbids a rebuild that the user
  did not ask for.
- `--mcp-config` takes all the values up to the next flag, so the bridge
  puts it first in the options of a worker, never last. Else it takes
  the prompt as a second config file, and each new worker fails at once
  with "MCP config file not found". A worker whose session fails at the
  start shows as failed, on the Completed tab, not as closed. Else the
  user sees a new agent close by itself.
- Yonder has no tool that opens a pop-up card on the phone or the Mac.
  The chat already shows the artifacts and the results of the agents.
- An agent, or another program on this Mac, does not open a site or its
  tunnel. `preview` with `open` and a `url` gives `opens: false` and
  tells the agent to name the URL in its final message, and the user
  opens it from the chat. The Claude call still opens a local site on
  the device of the last message that the user sent from Yonder. The
  phone opens the site as a tap on a localhost link of a chat: in the
  browser of Yonder, through the tunnel. When the tunnel of the site is
  closed, or the Tunnel is off, the phone first asks the user the same
  yes or no question as for a tap. The Mac opens the site in its
  browser. Else a site, an app or a tunnel opens by itself while the
  user does something else in Yonder.
- Each device has an id: `mac` for the window of the Mac app, and for a
  phone the last 16 characters of its public key, as `linkCar` makes it.
  The relay sets the header `x-yonder-device` on each request of a phone,
  after it drops the headers that the phone sent, so a phone cannot act
  as another device. A request with an Origin and no such header comes
  from the window of the Mac.
- The bridge keeps each site in memory. The app asks `/show` each second
  on the Mac, and each 3 seconds on the phone. `after` gives the newest
  site that the app has, so the bridge drops the sites up to it. A site
  that no device takes in a minute goes, so that a phone that opens
  Yonder much later does not open an old site. Grok does not get the
  tool (`src/voice.ts`): it opens a site with `preview`. `bun run
  check-bridge` checks the tool and `/show`, and `bun run check-relay`
  checks that the bridge gets the id of the phone.
- `move_worker` moves an agent to another project. The agent keeps its
  conversation, its CLI and its profile, and it works in the new folder
  from its next message. Each CLI resumes the session by its ID. Claude
  Code keeps the transcript in the folder of the old project in
  `~/.claude/projects`, and the bridge finds it there. A running agent
  ends its current turn in the old folder. A sub-agent moves with its
  agent. A terminal session and a background session that Yonder did not
  start cannot move, because Yonder does not own that process. Only the
  agents that Yonder started can move.
- On the screen, Move to in the menu of an agent row (a long press on
  the phone, a right-click on the Mac) opens a picker (`MovePicker` in
  `src/App.tsx`): the card of an approval from the bottom edge, on the
  phone and on the Mac, as the icon picker of an app (`Picker` in
  `src/Canvas.tsx`). Yonder shows no modal dialog in the middle, also
  on the Mac. It has a search and the projects in the order of
  the Projects view, without the project of the agent. The names that
  start with the search come first, and Enter picks the first project.
  A pick moves the agent with `move_worker`. A submenu of more than 200
  projects is too long, so the picker has a search. On the Mac, a drag
  of an agent row onto a project of
  All projects (its title or one of its rows) moves the agent there too.
  The row moves at once. An agent of any CLI has Move to and the drag.
  A session that Yonder did not start and a sub-agent have neither.
- An agent also moves by itself when it worked in another project. When
  a turn of a Claude Code agent ends as done, the bridge reads the tool
  calls of that turn (`workedIn` in `bridge/main.ts`): the paths of the
  reads and edits, and the paths in the Bash commands. Each tool call
  counts once for each project. The agent moves to another project when
  it worked there in 3 calls or more, and in more than twice as many
  calls as in its own project. The text of a write or an edit does not
  count. Only absolute paths count, so a plain `cd ../x` is not seen.
  This fixes an agent that the + button started in the wrong project.
- `list_workers` with `query` searches the name, the task, the project,
  the summary and the result of each agent, in all the projects. Each word
  of the query counts once, and twice in the name, so the words can come
  in any order. Small words such as "the" do not count. It gives the 8
  best matches, newest first for the same score, each with only its
  number, status, task and summary, so that the answer stays small.
- `list_workers` with no `query` gives `counts`, the number of agents on
  each tab (agents, completed, saved, closed), and `list`, one short line
  for each agent: number, name, project, status, minutes ago and one
  line of its summary. The list is in the order of the screen, tab after
  tab, and has at most `limit` agents (20). `more` gives the number that
  it leaves out. `tab` keeps one tab, and `project` keeps one project,
  with the same rules as the app (`tabOf`, and the longest project path
  that holds the folder of the agent). `full` set to true gives the
  whole record of each agent. The app and `elsewhere` ask for it, and a
  bridge of an older version gives it with no arguments too. Else the
  whole list of 274 agents is 485 KB, about 113K tokens, and a voice
  call refuses it. Grok
  of the app gives the project on the screen as `project`.
- In the `full` list, a closed agent has only the first 200 characters
  of its task and its summary, and the last 200 of its result. The phone
  polls the list every 3 seconds through the relay, and the relay cannot
  compress the encrypted answer. Else a list of 322 agents (316 closed)
  is 876 KB, and on a slow link the phone stays on "Reconnecting…" and
  the pictures of the chat do not load.
- `review_workers` sums up all the agents of one tab (`tab`, and the
  `project` that the app adds as for a group) and says which ones the
  user can close. It gives one line for each agent, in the order of the
  screen: "Agent 4: Added a rule to name each action. Close: changes
  saved." Sonnet 5.5 on high effort writes the lines, with the same
  hidden `claude -p` as the summaries (`ask()`), but with thinking on.
  It takes about 18 seconds for 24 agents. Haiku is faster (3 seconds
  for 4 agents), but Sonnet sees more: on 24 agents, it saw that another
  agent already built the CarPlay support, and that the Google Play step
  of the subscriptions was still open. Its input is the number, the status, the task and the summary
  of each agent, and the 20 newest other agents of the same projects, so
  that it finds the work that another agent did again. Close means that
  the agent needs nothing more from the user. Notes such as "test it" or
  "ready to push" end each Yonder task, so they do not keep an agent.
  Keep means that the agent runs, asks a question, waits for a decision,
  or failed with no fix. The input has no attention flag of Clef: with
  it, Haiku said Keep for "test it" in one of two runs. An old closed
  agent has no number, so its line gives its name, never its worker id.
  The bridge keeps each line with "Close:" or "Keep:", because the model
  sometimes leaves out the word "Agent" before a name. The car has no
  tabs, so the car does not get the tool.
- `get_worker` gives only the gist of an agent: the last 6 lines of its
  last message, and its last 4 steps. Else Grok reads a whole result
  aloud.
- `get_worker` with `full` gives the whole last message (6000 characters
  at most), the last 8 prompts and answers of the conversation with no
  tool calls, and the last 6 steps. When the user asks a question about
  the work of one agent ("what happens if ...?", "why did it ...?"),
  Grok calls it first and answers from it. Grok sends the question to
  the agent only when that result does not answer it. Else Grok sees
  only the end of the last message, and sends the agent a question that
  its answer already covers.
- Each agent has a summary: the gist of its whole conversation in 3 to 5
  short points, 20 words or less each, in very easy English: short,
  common words, and no code, file paths, commands or jargon. The points
  give the substance: the actual names, numbers, causes or findings,
  never only the kind of work. The first point gives the main result,
  and the last point gives the verdict: done, or what the user must do
  now. When the agent asks the user a question, for example while it
  waits, the last point is that question with its options. A point such
  as "Agent suggested six naming styles" is not enough: the point gives
  the names. The key of each summary starts with "l". A new prefix makes
  the bridge write the older summaries again.
  A second run of Haiku, at the same time, writes the spoken brief
  (`spoken`, `BRIEF` in `bridge/main.ts`): 2 to 5 short sentences about
  only the last answer of the agent, with its names, numbers and
  question, and the agent as "it". It gets only the task, the last
  message of the user and the whole answer to it. `/summary` gives it
  with the summary, for Listen in the three dots of a conversation (see the
  Phone), so the brief is ready before the tap. The brief has its own
  run, because the run of the summary reads the whole conversation:
  after a short second answer, it tells the first report again, also
  with the last answer marked at the end.
  The bridge sends the transcript (the prompts, the answers, and one
  short line for each tool call, 40000 characters at most) to a hidden
  `claude -p` on Haiku, with no tools, no MCP servers, no settings and
  no session file. It takes about 3 seconds, and it runs on the Claude
  subscription, so it costs no money. Thinking must be off
  (`MAX_THINKING_TOKENS=0`): with low effort, Haiku still thought for
  30 seconds. `--bare` cannot work, because it reads only an API key.
  The run shows in `claude agents` as an interactive session, so it
  runs in `~/.config/yonder/summarizer`, and the bridge skips sessions
  in that folder. A test bridge on another port runs its summaries in
  `~/.config/yonder-<port>/summarizer`, and the bridge skips those
  folders too. Else they show as agents named "summarizer-79". Clef
  stays on Workers AI. The bridge writes
  the summary only when an agent gives a new answer, so it is ready
  before the user opens the agent. `state.summaries` keeps each summary
  by session ID, with a hash of the last answer (`key`). A new status, a
  read result or a star does not write it again.
  Every 2 seconds the bridge also writes the missing summaries of the
  done, failed and waiting agents: the workers, the other sessions, and
  the agents that finished before the bridge started. It writes 3 at a
  time, newest first, and tries a failure again after 5 minutes. So the
  summary is ready when the user opens an agent, also an agent that
  Yonder did not start.
  `/summary?worker=<number or id>` gives it to the app, and writes it
  first when it is still missing. After a failure it tries again after
  1 minute, and it never answers with an error. While the summary is
  missing, the app asks again every 10 seconds. Else one failure (such
  as the weekly limit of Claude, or a login that two processes refresh)
  leaves "Summing up…" until the user opens the agent again. The app keeps each summary that it
  got, and shows it at once when the user opens the agent again. A
  running agent keeps its last summary. `get_worker` gives it to Grok
  too. The bridge writes a summary of the old paragraph form again.
- The Context tab shows the messages of the user as bubbles (see the
  Mac app). The sent and the queued messages show in one list, in
  the order that the user sent them, with their pictures. `/media` of
  the bridge serves each picture in `~/.config/yonder/images`, because a
  queued message is not in the conversation yet.
- The Settings have a Summaries row (On or Off), in the General section, after
  the Tunnel row. On is the default. The bridge keeps it in `state.json`
  (`sumUp`), and `GET` or `POST /summaries` with `{ on }` reads or sets
  it. The phone can reach it through the relay. Off stops each new
  summary: `summary()` gives only the summary that the bridge already
  has, and `preload()` does nothing. The summaries that the bridge
  already has stay. Grok then reads the end of the last answer in place
  of a summary. The app shows no Summary tab (see the Mac app).
- `/conversation?worker=<number or id>` gives the conversation of one
  agent to the app. The bridge reads the Claude Code transcript in
  `~/.claude/projects`, because it keeps all the resumed turns of a
  session. This works for workers and for the other sessions. It gives
  the last 300 entries at most, from the last 4 MB. `&count=` asks for
  more entries, and the bridge then reads 4 MB more for each 300. The
  relay sends one answer in one frame of 1 MiB, so the bridge removes
  the oldest entries until the answer is 900 KB or less. Each entry also
  gives the pictures, videos and sounds that it names (see the Mac app).
- The Context tab loads 300 more entries when the user scrolls near its
  top, until a load gives no more, and the entries that the user sees
  stay in place. When the load fails, or the Mac gives no answer in 20
  seconds, the tab shows the reason in the place of the chat, sends it
  to Sentry, and loads again every 3 seconds until it works, also for an
  agent that does not run. Else the Context tab of a big agent (500k
  tokens of context) can stay blank on the phone. The bridge restarts often, and each restart ends
  the requests of the phones. A network miss during a restart waits
  for the next load. The reason shows when that load also fails. A
  drop of the socket of the phone, to the relay or to the Mac on the
  local network, is also such a miss, and so is no answer in 20
  seconds. Else the phone shows "The relay closed the connection." at
  once (Sentry YONDER-11). A POST to `/mcp` that dies in the restart
  goes again after the bridge answers `/front`. Else the Mac shows "Load
  failed" for that call (Sentry YONDER-B). The Update button has its own
  fix.
- The Context tab loads again each 3 seconds while the agent runs. Claude
  Code can say that a turn ended before the transcript has the last
  answer. So for 60 seconds after a new status, the tab also loads again
  until its last entry is an answer. Else a done agent shows its last
  tool call with no answer, as if it still runs.
- Sub-agents: an agent that uses the Agent tool starts sub-agents in its
  own session. Claude Code keeps the transcript of each one in
  `<session id>/subagents/agent-<agent id>.jsonl`, next to the transcript
  of the session, with a `.meta.json` that gives the description and the
  type. `/subagents?worker=` gives them to the app, oldest first, and each
  one gets the number of its agent and a letter: 21A, 21B, 21C. The
  `sessionId` of a sub-agent is the path of its transcript
  (`<session id>/subagents/agent-<agent id>`), so `/conversation`,
  `/summary` and `get_worker` read it as a session. A sub-agent is done
  when its last turn ended. It runs while its agent runs or while its
  transcript changed in the last 2 minutes. Else it is closed.
  `get_worker` of an agent lists its sub-agents for Grok.
- Only the agent can reach its sub-agent, with the SendMessage tool. So
  `message_worker` with "21B" sends agent 21 a message that asks it to
  pass the text on word for word with SendMessage, and to say the
  answer. It goes through the queue as any message. The sub-agent gets
  it as a meta turn ("The coordinator sent a message while you were
  working: ..."), and the chat shows only the text of the user. The
  wording is plain, because Haiku takes a wording such as "[Yonder] The
  user sends ..." for a prompt injection. A copy of a
  session cannot reach the sub-agents of the old session ("No
  transcript found for agent ID"). So after a new model or effort, the
  Agents view of the agent is empty. An agent in a terminal cannot pass
  messages, so the bridge refuses them. The tools that stop, close,
  remove, rename or star an agent refuse a sub-agent, because a stop of
  a sub-agent stops the session of its agent.
- A worker that moves into a git worktree writes its transcript in the
  folder of the worktree, not of the project. When the project folder
  has no transcript, the bridge looks for the session ID in all the
  folders of `~/.claude/projects`. Else such a worker shows "No
  conversation yet" and no result. At start, the bridge reads the
  result again for each done worker with no result.
- `about_yonder` takes a `topic`, the name of a part of the wiki
  (`docs/wiki/index.md` lists them). With a topic, it returns the index
  and that part. With no topic, it returns the index, the source version
  and the 20 newest commits. The whole wiki is too large for each call.
  The description of the tool lists the topics from the index, so Grok
  picks a part with no second call. The bridge reads the files at each
  call, so a change to the wiki is live before a rebuild. A copy for another Mac gives only the copy of `README.md`
  in its binary, with no version and no commits.
- `project_overview` gives the gist of a project: its file tree, two
  levels deep, and its README (or `CLAUDE.md` when it has no README),
  8000 characters at most. The tree skips dot folders and the `HEAVY`
  folders, and it shows 25 entries in each folder at most. Grok calls it
  when the user asks what a project is or what is in it.
- "Rebuild Yonder", "reload Yonder", "update Yonder" or "restart the
  app": Grok calls `rebuild_app` and says a short line. These four words
  mean the same for the app: get the latest version. Only "restart the bridge" calls `restart_bridge`.
  When `src-tauri/` did not change after the build of the installed app,
  `rebuild_app` only builds `dist/` again (in less than a second), and
  restarts the bridge when `bridge/` changed. The Mac app and the phone
  then reload the new front end (see "Install the app"). Otherwise the
  bridge runs `bun run install-app` in its own process group, because
  that command quits the app. The app ends the call when Grok stops
  talking, before the build is done, so xAI does not bill the build time.
  The new app starts no call (see
  "At launch"). The build output goes to `~/.config/yonder/rebuild.log`.
  A failed build does not quit the old app. A copy for another Mac has no
  source, so `rebuild_app` says that the app installs a new version by
  itself, and that a click on "Update available" installs it at once.
  A Windows or Linux download has no source too, but there `rebuild_app`
  installs the newest release at once, or returns `upToDate`.
  `other_computer` can call `rebuild_app`, so the phone or an agent of the
  Mac can update another computer.
- A voice update needs no click. `rebuild_app` ends the call when Grok
  stops talking, on the Mac and on the phone, and the new front end then
  loads by itself. When nothing is new, `rebuild_app` builds nothing and
  returns `upToDate` with the version: `dist/` has the newest commit, the
  Mac app needs no rebuild, and the app that asks runs `dist/` (the app
  sends its build in the hidden `build` input). Grok then says "Yonder is
  up to date", and the call stays on. Else the user must tap "Update
  available" on the phone after each "update Yonder".
- `install-app` runs `bun install` before the build. Else a rebuild
  fails when a package is in `package.json` but not in `node_modules`,
  for example after another agent installed it only in its worktree.
- `install-app` stops the bridge on port 7787 before it opens the new app,
  so that the app starts the new bridge. Workers keep running, because
  Claude Code runs them. Else the old bridge stays, and the conversation
  view shows "No conversation yet" after a rebuild.
- `install-app` quits the old app with `pkill -ax yonder`. Without `-a`,
  `pkill` on macOS skips its own ancestors. The app starts the bridge, and
  the bridge starts the rebuild, so the app is an ancestor of `pkill`.
  Else the old app stays open after a rebuild by voice, and `open` only
  shows the old app again.
- A worker that changes the bridge calls `restart_bridge` itself when
  its work is committed, also while other agents run. The system prompt
  of each worker in the Yonder source says so.
- "Restart the bridge" or "rebuild the bridge": Grok calls
  `restart_bridge`. The bridge runs its source from this repository with
  `bun`, so it needs no build. The compiled bridge of a copy for another
  Mac starts again as it is. The bridge first compiles its source with
  `bun build`. If that fails, it returns the error and keeps running.
  Then it starts a new bridge that waits 1 second, and it exits. The new
  bridge is up after about 2 seconds. A bridge that Yonder.app is not
  responsible for only exits while the app runs, and the app starts the
  new bridge after about 15 seconds (see Full Disk Access below). The
  app and the call stay on, and the app needs no reconnect, because the
  MCP server is stateless. After `rebuild_app`, the app and the bridge
  start again 1 second apart. `restart_bridge` also works from the
  phone: the relay connects again after a few seconds, and the call
  stays on.
- Names: Grok names each new worker with two or three words, and up to
  six words for a complex task. The bridge passes the name to
  `claude --name`. The bridge cuts a longer name to six words, so it fits
  on the first line of the agent row. A session that Claude Code named itself ("yonder-92")
  shows its latest `ai-title` from the transcript instead.
- A task about one pull request has the name "PR 359 - Date picker": the
  number of the PR, and its topic in one or two words. `prOf` in
  `src/names.ts` finds the one PR in the task: "PR 359", "pull request
  #359" or a link to the PR. A bare "#359" is not a PR. After the start,
  `prName` in `bridge/main.ts` reads the title of the PR with
  `gh pr view` in the project folder, and Haiku writes the topic. When gh
  cannot read the PR, Haiku writes the topic from the task. For an agent
  of Hermes, Hermes writes the topic (`askFor`). This name
  replaces the name of Grok, because Grok does not know the topic. A
  rename before the name comes stays. The system prompt of each worker
  and the `name` of `start_worker` have the same rule. Else a name such
  as "Check DS PR 359 merge" does not tell what the PR is about.
- Each Claude Code worker knows its number and its name from its system
  prompt. When a word of the name is wrong, or the task changes, the
  worker gives itself a new name with `rename_worker`. Speech to text can
  spell a word of the first request wrong.
- Each agent knows that speech to text can write a word wrong, such as
  "ancient" for "agent" or "effort". It does what the user most likely
  means, and it looks at the tools of Yonder before it says that it
  cannot do a thing. A Claude Code worker changes its own effort, model
  or mode with `message_worker` on its own number. Else an agent says
  that it cannot change its effort.
- Numbers: each agent has a number, so that the user can say "agent 3".
  An agent gets the lowest number that no open agent has, and a closed
  agent gives its number back. When a new agent takes that number, the
  closed agent shows no number. When it runs again, it keeps its number,
  or gets a new one if an open agent has it now. So the numbers stay
  small. The tools take the number as the worker. Workers keep it in
  `state.workers`, and other sessions keep it in `state.numbers`.
- Two agents that start at the same time get different numbers. An
  agent joins `state.workers` only when its session starts, so two
  `start_worker` calls in one answer can take the same free number. The
  bridge checks the number again when the agent joins the list, and the
  second agent takes the next free number.
- IDs: a worker keeps the first 6 characters of its first session ID,
  also after a message moves it to a copy. Another session gets the first
  8 characters, the short ID of Claude Code. Else an agent and its first
  session can have the same ID, and React leaves copies of the row of
  the agent on the Completed tab, under "No completed agents".
- Claude Code gives the status of each agent, and Yonder does not decide
  it. In `claude agents --json --all`, a background session has the
  `state` `working` (status `running`), `blocked` (status `waiting`: it
  needs an answer from the user) or `done`. A terminal session has no
  state, only `busy` (running) or `idle` (done), so it never shows as
  waiting. In the list, the row of a terminal session says "Own
  terminal", and the row of a background session says "Background ·
  not Yonder". A plain label "terminal" looks like a Yonder agent.
  Yonder only closes and removes sessions. The bridge runs no Clef check
  (Cloudflare Workers AI) for the status.
- Claude Code can leave a finished background session `working`, with
  the process `idle`. The bridge then treats it as done when the
  transcript ended the turn 30 seconds ago or more. Else an agent stays
  `working` for minutes after its last answer. A background shell (`run_in_background`) keeps the session `working`
  and `busy` after the turn ends, but a Monitor lets Claude Code list
  it as `done`. The bridge treats both the same: an agent whose turn
  ended goes to the Done tab, and the notice of the shell starts a new
  turn that brings it back to the Tasks tab. Else an agent that waits
  for another worker sits on the Tasks tab for minutes. An agent that closes itself
  and a run of a schedule keep running until the shell ends, because
  their close or retry would stop the shell.
- A running agent gets `monitoring` from the bridge (`monitoringOf`):
  `only` when its turn ended and a background task keeps the session
  busy, and `also` when its turn runs and a background task runs beside
  it. A background task is a command with `run_in_background` or a
  Monitor. Its start is the tool result "Command running in background
  with ID" or "Monitor started (task", and its end is a
  `task-notification` with a `<status>`, or a `TaskStop`. Only the last
  512 KB of the transcript counts. Else an agent that waits in the
  background for hours shows "Yondering…" all that time.
- When the user asks if a running agent is done ("is number five
  done?"), Grok calls `get_worker` before it answers, and never says
  "it's still running" from the screen alone. `get_worker` gives the
  status and `quietMinutes`, the time since the last step. A running
  agent that is quiet for 10 minutes or more may be stuck, and Grok says
  so.
- "How's number 10 doing?" for a running agent: Grok also calls
  `get_worker` first, and says what the agent does now from its activity
  and recent steps, never from its name or task. "Is it?" or "look into
  the context" calls `get_worker` with `full`, and never `message_worker`.
  Else Grok tells old work from the task, and a "Continue." with `now`
  stops the turn of the agent.
- Status `closed`: the user closed the agent (`close_worker`, or the stop
  button on its row). Its session stops, and it moves to the Closed tab.
  A message continues it. If the user continues it in Claude Code, it
  shows as running again. A session that ends outside Yonder before its
  turn is done also shows as closed. Older bridges called this status
  `stopped`, and the bridge changes it to `closed` when it starts.
- Stop (`stop_worker`): the user stops the current turn of a running
  agent, as Escape does in Claude Code. The bridge stops the session,
  and the agent shows as waiting on the Agents tab, with no dots and no
  push. The result says "The user stopped this turn." The `marked` flag
  holds the status until the session works again. Without it, the poll
  shows the stopped session as closed, and the queue starts the next
  turn at once. The queue stays, and the next message sends it first.
  With `send`, the queue goes at once as the next turn, in place of the
  rest of the current turn (the stop button in the app). With `send` and `message`, only the queued message
  that starts with `message` goes now, and the others stay in the
  queue. A tap on a queued bubble in the app does this. It also finds a
  message that waits in the queue of Claude Code (typed into the current turn, `untaken`). The
  other messages there move to the queue of the bridge, so only the
  tapped one goes now. The poll also checks `marked` again after it
  reads the transcript: else a stop in that moment keeps the agent as
  running for good. `bun bridge/check.ts` checks Stop, Send now and
  `unqueue`.
  `send` with an empty queue of the bridge sends the messages that wait
  in the queue of Claude Code. Else Escape with only such a message
  stops the turn and keeps the message back.
  A stop can also come a moment after a resume, before Claude Code
  writes the prompt of the new turn to the transcript. That stop drops
  the prompt. So `halt` checks the transcript for the prompt of a resume
  of the last minute (`resumed`). A prompt that is not there goes back
  to the front of the queue. Else a second Escape, one second after the
  first sent the queue, loses the message of the user.
- `list_workers` also shows the other Claude Code sessions on this Mac, from
  `claude agents --json --all` (only the sessions with a pid). The bridge reads their transcripts in
  `~/.claude/projects` for the last steps and the context use. A message to
  a terminal session starts a copy of that session (see Workers).
  A message to a background session makes it a worker (see Workers).
  The switch Outside sessions in General of the Settings (`outsideSessions`
  in `config.json`) hides these sessions. Off, the lists, Grok and the
  tools show only the agents of Yonder.
- Each agent shows its context use. On the agent row, the context use and
  the time of the turn are 11 px and lighter than the muted text, so the
  row has more white space.
  The time of the turn shows minutes and seconds ("4m 05s", or "1h 05m"
  after an hour), so the user sees it tick. The seconds have two digits,
  so the width stays the same. The context and the time are in one span,
  "182k · 4m 05s", so the dot has the same space on each side.
  The context and the time are on the second line of the row, after the
  model, the effort and "7m ago", with a dot before them. So the name has
  the full width of the row, and a title of five or six words fits on
  one line. The model text gets the ellipsis on a narrow row, never the
  time.
  The window size of each model is in
  `state.windows`. The `-p` workers of older bridges saved it from their
  `result` event.
- Every 2 seconds the bridge reads `claude agents --json --all`. The
  `state` of each worker gives its status: `working` is running, `blocked`
  is waiting, `done` is done. The transcript gives the activity, the
  result and the context use. The user can also open a worker in the agent
  view of Claude Code and continue it there, and Yonder follows it.
- A message to a running worker goes into its current turn, as in Claude
  Code: the agent gets it after its next tool call, and does not wait for
  the end of the turn (`typeIn`). The bridge opens the live background
  session with `claude attach` in a terminal of Bun, types the message,
  presses Enter, and closes the terminal. The session keeps running. The
  transcript then has a `queue-operation` "enqueue" with the message, and
  later a `queued_command` attachment after a tool result. The
  conversation view shows that attachment as a message of the user. The
  bridge types 4 characters at a time: Claude Code takes a larger piece,
  also a bracketed paste of 655 characters, as pasted text, and wraps the
  whole message in `<pasted_content>`, which the agent may not follow. A
  message that starts with / ! ? # & or @, a message with a tab, a message
  to an agent of another CLI, and a message after others that wait in the
  queue of the bridge go into the queue of the bridge. So does a message
  when Claude Code does not write the "enqueue" in 5 seconds. A message
  that went into the turn has no Edit, Delete or Send now, because
  Claude Code holds it. A stop of the session drops the messages that
  Claude Code holds and did not give to the agent yet. So before the
  bridge stops a live session (`halt`, `resume`), it reads them from the
  transcript (`untaken`: each "enqueue" with no "remove" or "dequeue"
  after it, since the prompt of the turn). Stop puts them back at the
  front of the queue of the bridge, and the app shows them as queued.
  A resume sends them before the new message.
- A message that cannot go into the turn goes into the `queue` of that
  worker. When the turn ends, the bridge sends all the queued messages as one turn. A
  closed worker keeps its queue, and the next message sends it too.
  The poll sends the queue (`sendQueued`). When the send fails, the poll
  tries again each 10 seconds, and the bridge log gets the error. Else
  one failed try leaves the agent done with its message in the queue,
  and the user must tap Send now.
- The Settings have a Steer row in General (On or Off). Off is the default. The bridge keeps it in
  `config.json` (`steer`), and `GET` or `POST /steer` with `{ on }`
  reads or sets it, also from the phone through the relay. On: a
  message to a running worker never waits in the queue of the bridge.
  The worker stops its turn at once and continues with the queue and the
  message, as with `now`. The session keeps the work of the stopped
  turn, so the agent continues from it. It works as the steer of T3
  Code. Steer does not try `typeIn`, so the message shows as a normal
  bubble, not a dotted one. `typeIn` often fails ("the prompt box of the
  session did not show"), and a typed message waits for the next step
  of the agent.
- A message that waits in the current turn shows the pictures of the
  user from the screen, not from the bridge. These pictures stay for 30
  minutes.
- With Steer, each message stops the turn that the message before it
  started. Claude Code writes the prompt of a turn a few seconds after
  the start, so `resume` adds the prompt of the last resume when the
  transcript does not have it (`unsaid`), as `halt` does. Else of three
  quick messages, only the first stays.
- A pasted or attached image shows in the prompt box at once, and its
  upload runs behind it. A send waits for the upload. Else an Enter right
  after the paste sends the message without the image.
- A message or a new task can be only its attachments, such as a pasted
  screenshot with no words. The send button then shows with an empty box,
  in a conversation and in the typed New agent view. The bridge then titles
  the agent and picks its model from the paths in the prompt.
  `unqueue` takes one message out of the queue, by the start of its
  text. `message_worker`, `stop_worker` and `unqueue` wait in one line
  for each agent (`inTurn`), and so does the send of the poll, so two of
  them never change the queue at the same time.
- A slash command runs only when it starts the prompt. So a message that
  starts with "/" goes alone as one turn, with no voice-call, image or
  video block: these blocks become the arguments of the command. The
  queue sends the messages before a slash command as one turn, then the
  command alone. This also applies with `now`: the queued messages go
  first, and the command goes in the next turn. The transcript keeps a
  command as `<command-name>` XML,
  and the conversation view shows it as the user typed it. `/commands`
  gives the app the list of commands (see the Mac app).
- `/btw <question>` is a side question, as `/btw` of Claude Code.
  `message_worker` does not send it to
  the agent, and it does not wait in the queue. `sideQuestion` in
  `bridge/main.ts` runs `claude -p --resume <session> --fork-session
  --no-session-persistence --tools ""` with no MCP servers, no hooks
  and a low effort. That copy answers from the conversation so far, also
  while the agent runs, and saves nothing. The agent does not stop and
  never sees the question. The result of the tool has `answer`, so Grok
  can read it aloud. The app shows the question and the answer at the end
  of the chat in a card with a dotted edge, and the × closes it. The card
  stays until the user closes it or asks another side question. The MCP
  client of the app waits 60 seconds, so the copy gets 55 seconds. Only
  a Claude Code agent with a conversation answers it, not a sub-agent. A
  `/btw` with no question gives "Write the question after /btw." Each
  side question reads the whole conversation again with no prompt cache
  (about 4 to 7 seconds for 100k tokens). `bun bridge/btw-e2e.ts` checks
  it with a stand-in `claude`, so it uses no credits.
- The conversation view hides the `<voice-call>` block of a prompt, so
  the user sees only the request. The agent still gets the block as
  context. Each other block that
  the bridge adds goes too: `<images>`, `<pasted-text>`, `<files>`,
  `<screen-recording>` (of an old conversation), `<videos>` and
  `<device>` (`typed`). An attached video or an old screen recording
  shows as a video in the bubble of the user:
  `video.mp4` or `screen.mov` of its folder (`clips`), not as the words
  and the folder of a `<videos>` block.
- The app starts the bridge in the login shell of the user, so that workers
  get the same PATH as a terminal. When the app quits, it stops the bridge
  on port 7787, so no Yonder process stays in the background. The workers
  keep running, because Claude Code runs them.
- If no bridge answers on port 7787 for 15 seconds, the app starts the
  bridge again and writes "started the bridge again" to `app.log`. The 15
  seconds are longer than the start of the login shell and the gap of
  `restart_bridge`. A second bridge finds the port in use and stops, so a
  start too many does no harm. Else a bridge that stops leaves the app
  without a bridge, and without a call, until the user quits it.
- The bridge and the agents get the Full Disk Access of Yonder.app. macOS
  gives the grants of an app, such as Full Disk Access, also to each
  process that the app starts. The app stays the "responsible process" of
  each child and grandchild, also after a parent between them exits, but
  only while the app runs. A process of the watchdog, of a terminal, or of
  an app that quit gets none of the grants of Yonder. An agent from such
  a chain cannot read the `DevToolsActivePort` file of Chrome
  ("Operation not permitted"), so browser-harness cannot connect again
  after Chrome restarts.
  - While Yonder runs, the watchdog only stops a bridge that does not work,
    and the app starts the new bridge (`source_bridge` in
    `bridge/watchdog.sh`).
  - `restart_bridge` gives the new bridge the responsible process of the
    old bridge. A bridge with another responsible process only exits while
    the app runs. The app then starts the new bridge after about 15
    seconds, in place of 2.
  - At its start, a bridge of the app stops the daemon of Claude Code when
    the app is not the responsible process of the daemon, such as after a
    quit of the app or a start from a terminal. It runs
    `claude daemon stop --any --keep-workers`, so the sessions keep
    running, and the next `claude --bg` starts a new daemon under the app.
    It checks only the daemon of `~/.claude`, not the daemons of profiles.
    A session with no daemon for about a minute dies, so the bridge stops
    the daemon only when no session works, and else checks again each
    minute (`freeDaemon`, see the bug of the daemon in Schedules).
  - The daemon gives its responsible process to each session in a spare
    host. By its design, Claude Code moves each other session into
    `~/.local/share/claude/ClaudeCode.app` (`macDisclaimResponsibility`),
    with only the grants of that app. The first session of a new daemon is
    such a session. For those sessions, add that app to Full Disk Access.
    Its path, its bundle ID `com.anthropic.claude-code` and its signature
    requirement (the identifier and the team `Q6L2SF6YDW`) do not change at
    an update. A grant to `~/.local/share/claude/versions/<version>` stops
    at the next update, because each version has a new path.
  - On a Mac, the bridge writes `~/.config/yonder/claude-launcher` and
    sets it as `CLAUDE_CODE_PROCESS_WRAPPER` for each agent. Claude Code
    starts its daemon, spare hosts and workers through it, with the
    binary of one version first. The launcher runs that version from
    `ClaudeCode.app`, so a process with no app as its responsible process
    uses the one privacy entry of `com.anthropic.claude-code`. Else such a
    process runs from its version path, and Files & Folders gets a new
    entry, such as "2.1.316", at each update. The
    newest version replaces the link in the app. An older version runs
    from its own path, so the app never runs a mix of versions. A daemon
    that runs since before the bridge start uses the launcher only after
    its next start. The Chrome native host of Claude Code still runs
    from the version path, because Chrome starts it, not Yonder.
  - An agent that runs keeps the responsible process that it had.
  - `responsibility_get_pid_responsible_for_pid` of libSystem gives the
    responsible process of a pid (`responsible` in `bridge/main.ts`, or
    `python3` with `ctypes`). A process whose app quit gives its own pid.
- The watchdog (`bridge/watchdog.sh`) keeps Yonder working when nobody is
  at the Mac. launchd runs it all the time as
  `com.vladartym.yonder.watchdog`, also after a login. Every 30 seconds it
  checks the app and the bridge, so that the user can work for a day
  with only the phone.
  - It does not keep the Mac awake. The bridge does that while a worker
    runs or a call is live, so the Mac sleeps when nobody uses Yonder.
    A closed lid still puts the Mac to sleep. The phone cannot reach a
    sleeping Mac.
  - When Yonder does not run, it opens the app, at most once in 10
    minutes. So, to quit Yonder for a longer time, stop the watchdog first.
  - When the bridge does not answer for 1 minute, or has no phone relay
    while the relay answers, it starts the bridge again, as the app does.
    While Yonder runs, it only stops the bridge, and the app starts the
    new bridge, so that the agents get the Full Disk Access of the app.
    It stops the old bridge with SIGTERM, and with SIGKILL after 5
    seconds. A bridge in a busy loop never runs its SIGTERM handler. Else
    such a bridge holds port 7787 at 100% CPU, each new bridge stops with
    `EADDRINUSE`, and the phone does not connect.
    A relay that the Mac cannot reach is not a fault of the bridge. A
    bridge that another bridge pushed out of the relay room (code 4000)
    does not connect again by itself.
  - After 3 minutes, it runs the last bridge that worked: a bundle in
    `~/.config/yonder/bridge-fallback`. `restart_bridge` compiles the
    source first, but a bridge that compiles can still stop at its start.
    The app then starts the broken source again every 15 seconds. When a
    file of the bridge changes, the watchdog tries the source again, and
    after 3 more minutes it goes back to the fallback.
  - A bridge that ran for 10 minutes, with no change to its files after
    its start, becomes the new fallback (`bun build`). The first fallback
    does not wait. `--define import.meta.dir` keeps the folder of the
    source, so the fallback serves `dist/`, finds `.git`, and runs
    `rebuild_app` as the source does. `code` in the script lists the files
    of the bridge. Add a file there when the bridge imports a new file
    outside `bridge/`.
  - "Restart the bridge" on the fallback starts the fallback again,
    because `restart_bridge` starts its own file. The watchdog goes back to
    the source at the next change to the bridge.
  - It does nothing while `install-app` runs, because that command quits
    the app and opens the new one. It never rebuilds the app: a failed
    build keeps the old app, and the same source gives the same failure.
  - The log is `~/.config/yonder/watchdog.log`. `zsh bridge/watchdog.sh
    install` starts it, and `uninstall` stops it. Run `install` again after
    a change to the script. `install` uses the script of the main checkout,
    never one of a worktree. `zsh bridge/watchdog.sh check` runs the steps
    on port 7797 with a copy of the bridge. It does not touch the live
    bridge.
- A bridge on another port (`YONDER_PORT`, for a check) uses the folder
  `~/.config/yonder-<port>`, not `~/.config/yonder`. So it has no state,
  `.env`, relay token or preview of the live bridge, and it never joins the
  phone relay. Else a check bridge with the live folder takes the relay
  room ("Another bridge took the room"), the phones lose the Mac, and the
  live bridge stops.
- The bridge listens only on 127.0.0.1. It refuses other web pages (Origin
  check) and DNS rebinding (Host check). A paired phone reaches it only
  through the relay (see Phone). The dev server of the app
  (`http://localhost:1420`) passes the Origin check only on the source
  copy, because any program can serve a page on that port.
- An `<img>` or a link of another web page sends no Origin. So the routes
  with a cost or a change (`/gist`, `/summary`, `/setup`, `/logins`,
  `/sync`, `/show`, `/conversation` and `/token`) refuse a request with no
  Origin when `Sec-Fetch-Site` is `cross-site` or `same-site`.
- The page of the bridge, `http://127.0.0.1:7787`, passes the Origin
  check. So a file that the bridge serves and that the user did not
  write runs no script there: `/media` and `/favicon` send
  `Content-Security-Policy: sandbox`, and a page of the Canvas and the
  `&try` page of a screen send `sandbox allow-scripts`. Else an SVG of a
  conversation, opened as an address, can start an agent through `/mcp`.
- State is in `~/.config/yonder/state.json`. The xAI key is in
  `~/.config/yonder/.env`. The bridge sets the folder to mode 700 at each
  start and writes `state.json` with mode 600, so another OS user cannot
  read the prompts, the summaries, the calls or the pastes.

## Two OS users on one computer

Two people, such as Bob and Mary, can each run their own Yonder on one
Mac, each in their own macOS user account. Each bridge then gets its own
port and refuses the programs of the other user. For one user, nothing
changes: the bridge keeps port 7787, and each program of that user
passes. This is a safety net. It is not the plan
for more people on one bridge (`docs/multi-user.md`).

- **The port.** The live bridge takes `port` of
  `~/.config/yonder/config.json`, else 7787 (`bridge/peer.ts`).
  - When a program of this user holds that port, or `bridge.pid` of the
    config folder names a bridge that runs, a bridge of this user runs
    already. The new bridge waits up to 5 seconds, because a restart starts
    it while the old bridge still stops. Then it stops before it joins the
    relay. The app, the watchdog and `restart_bridge` need this.
    The port alone is no lock: after an edit of `port`, the app finds no
    bridge on the new port and starts one, and only `bridge.pid` stops it.
  - When a program of another user holds it (`lsof -a -u` finds no
    listener of this user), the bridge takes the next free port. It
    skips 7786 (the phones on the local network) and 7788 (the tunnel of
    Yonder Preview). It saves the new port in `config.json`, so the port
    stays the same at each start.
  - The local network port of the phones is 7786. When another user has
    it, the bridge takes any free port, and the phone gets it through
    `/lan`.
- **Who reads the port.** The Mac app reads `port` of `config.json`
  (`bridge_port_now` in `src-tauri/src/main.rs`): the check that the
  bridge runs, the stop of the bridge, and the address of the notch
  helper (`YONDER_BRIDGE`). The first page of the app (`tauri://`) asks
  for it with the command `bridge_port`, and then loads the page of the
  bridge on that port. The page of the bridge uses its own address. The
  watchdog, `omarchy/yonder` and the workers (`YONDER_BRIDGE`) read it
  too. An app of an older version keeps 7787.
- **The permissions of the app.** `capabilities/default.json` names only
  `http://127.0.0.1:7787/*`. A bridge on another port gets the same
  permissions at run time, for that port only (`bridge_capability`). A
  site of another port of 127.0.0.1, such as a dev site in a frame of the
  window, can never call the commands of the app.
- **The address on the wire.** A phone and another computer always name
  the bridge `http://127.0.0.1:7787` (`LOCAL` in `bridge/relay.ts`,
  `WIRE` in `src/bridge.ts`). The bridge sends each such request to its
  own port (`local` in `bridge/main.ts`). So a phone needs no new pairing
  when the port changes.
- **The relay.** Each live bridge joins the relay, also on a port other
  than 7787. Each user pairs their own phone, in their own relay room.
- **Who can call the bridge.** After the Host and Origin checks, a
  request passes only with one of these:
  - The header `x-yonder-token` with `token` of `config.json`.
  - The cookie `yonder-<port>` with the token. The page of the bridge
    gets it with its first GET (HttpOnly, SameSite=Strict), so its
    images, its event stream and its fetches pass at once.
  - A caller that runs as this OS user. The bridge finds the program at
    the other end of the connection with `lsof -a -u <uid>` on the Mac
    (about 0.1 seconds, one run for all the calls that wait), and with
    `/proc/net/tcp` on Linux. So each program of the user that worked
    before still works with no token: an older app, an agent with
    `curl`, another CLI, the hooks and the checks.
  - Any other call gets 403, with the path of `config.json`, and
    `bridge.log` gets a line "Refused ...". On a computer with one user,
    such a line is a bug. lsof runs with `-b`, so a network volume that
    does not answer cannot block it. A failed lsof refuses the calls of
    that run, but the token, the cookie and the relay still pass.
- **The token.** The bridge makes it at its first start (24 random
  bytes) and keeps it in `config.json` with mode 600. The user or an
  agent can change it, and the new value counts at once. The workers get
  it in their environment (`YONDER_TOKEN`, with `YONDER_BRIDGE`), which
  another user cannot read. Claude Code runs a worker from its daemon,
  with the environment of the daemon, so the two go in the `env` of the
  settings of the session: a file with mode 600
  (`session-settings*.json` in the config folder), not the arguments.
  Claude Code puts the token in the MCP header from there, so it is never
  in the arguments of a process, which another user can read. The relay
  adds it to each request of a phone. A copy or an export of the settings
  must leave out `token` and `port` (`export_config` does).
- **Windows** has no check of the user and never moves the port: a
  second user there gets "the bridge runs already".
- **A check bridge** (`YONDER_PORT` set to a port other than 7787) keeps
  its own folder and never joins the relay. `YONDER_PEER=none` makes each
  caller of a check bridge another user, and `YONDER_FOREIGN_PORTS`
  makes a port count as the port of another user. `bun run check-port`
  checks all of this with no credits.
- **Limits.** A worker that started on another port before a change of
  the port still calls the old port. The dev builds of the screen and
  TestFlight run only on a bridge from source on port 7787. A cookie does
  not know the port, so the page of the bridge sends its cookie to each
  port of 127.0.0.1 that it calls; the page calls only its own bridge. A
  program that runs as root, not as the user, now needs the token. The
  path for two users ran only in the checks (`YONDER_PEER`,
  `YONDER_FOREIGN_PORTS`), not yet with two real accounts.
