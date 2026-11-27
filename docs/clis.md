# Agents in any CLI

## Status

Phases 1 and 2 are built:
Codex, Antigravity, OpenCode, Cursor, Grok Build and Copilot run Yonder
agents, next to Claude Code. "Agents in other CLIs" under Workers in
`docs/wiki.md` tells how they work now. These parts differ from the plan
below:

- Each other CLI has a group of rows in the Agents tab, not a page of
  its own.
- The rows and the menus show the name of the CLI, not a logo.
- Phase 3 (ACP and approvals on the phone) and phase 4 are not built.

All the agents get one structure, and they keep running when the bridge
or the app restarts. Phase 3 started: the ACP host (`bridge/acp-host.ts`) is built, and Codex (through
`codex-acp`) and OpenCode (`opencode acp`) run in it, and so does
Hermes (`hermes acp`). Antigravity,
Cursor, Grok Build and Copilot still run one process for each turn,
because nobody could sign in to them on the test Mac to test them on ACP.
Approvals on the phone and an "Add an agent" row are not built yet. The
wiki tells how the host works ("Agents in other CLIs").

## The plan

A plan only: how Yonder can start agents in other tools, not only in
Claude Code: Codex, OpenCode, Antigravity, Gemini CLI and the Grok CLI.
It uses Happy (happy.engineering) for the list of tools that it supports,
and plans the Settings page where the user connects them. The facts are
from the docs, the source code and the `--help` of each tool. "Not
verified" marks a fact that nobody checked in the source or by a run.

## The words

- A **CLI** is a program that runs a coding agent: Claude Code, Codex,
  the Antigravity CLI, OpenCode, Cursor and the others.
- An **agent** is still one Yonder worker, as in "agent 3". Each agent
  runs in one CLI, and keeps that CLI for all its turns.
- A **headless run** is a run of a CLI with no terminal. The CLI gets the
  prompt as an argument, writes its events as JSON lines, and stops at
  the end of the turn.
- The word "agent" has two meanings in the code already: a worker, and a
  Claude Code agent type (`--agent`, from `.claude/agents`). "Provider"
  is the voice of a call (Grok or OpenAI). So the code, the Settings and
  Grok use "CLI" for this, and only "CLI".
- In Yonder, "Grok" is the voice. So the coding CLI of xAI is always
  "Grok Build", its official name.

## The answer

- Yonder can support each CLI that the user named. All of them have a
  headless run, a session ID, and a resume of that session by its ID.
- Gemini CLI is a special case. On 2026-06-18 Google moved the free, Pro
  and Ultra users of Gemini CLI to the Antigravity CLI (`agy`). So
  "Gemini" in Yonder means the Antigravity CLI.
- Claude Code keeps `claude --bg`. Nothing changes for it.
- Each other CLI runs one detached process for each turn. The process
  writes its JSON events to a log of Yonder, and the next turn resumes
  the session by its ID. Happy runs the Antigravity CLI the same way. An
  earlier bridge ran `claude -p` the same way.
- One new file, `bridge/clis.ts`, has one row for each CLI: how to find
  it, check its sign-in, start and resume a turn, read its events, and
  open the session in a terminal.
- Phase 1 is Codex, end to end. Phase 2 adds the Antigravity CLI,
  OpenCode, Cursor, Grok Build and Copilot, one row each. Phase 3 adds
  ACP, only when the user wants approvals on the phone or a CLI that the
  table does not have.
- The Settings get an Agents tab. It shows the CLIs on this Mac with
  their version and their sign-in, the default CLI of new agents, and a
  page for each CLI with its model, effort, permissions and usage.
- Grok gets a `cli` input on `start_worker`, for "use Codex".

## What Happy and the other apps support

### Happy

From the source of `slopus/happy` at commit `3d809c7` (2026-10-05). The
npm package `happy` is 1.2.5 (2026-09-22).

- Happy runs these CLIs: Claude Code (`happy`), Codex (`happy codex`),
  the Antigravity CLI (`happy agy`, from 2026-07-10), Gemini CLI
  (`happy gemini`, now deprecated), each ACP CLI from a terminal (`happy
  acp opencode`, `happy acp -- <command>`), OpenClaw, and its own Happy
  Agent (built on Pi). It has no Cursor.
- The app offers only four in its Agent picker: Claude Code, Codex,
  Antigravity and Happy. The others start only from a terminal.
- How Happy runs each one:
  - Claude Code: the real terminal view on the computer, and the Claude
    Agent SDK when the phone drives it. A key press moves the session.
  - Codex: `codex app-server --listen stdio://`, a JSON-RPC server. Codex
    sends each approval to Happy, and Happy sends it to the phone. Happy
    left `codex mcp-server` on 2026-03-04, because a model change lost the
    context and a cancel hung.
  - The Antigravity CLI: one `agy --print` process for each turn, with
    `--conversation <id>`, `--model`, and `--sandbox` or
    `--dangerously-skip-permissions`.
  - The ACP CLIs: the ACP SDK (`@agentclientprotocol/sdk`). Happy answers
    each permission request.
- The Happy daemon starts each session as a detached process, or in a
  tmux window.
- Detection: `command -v` for each CLI at the start and every 20 seconds.
  Happy reads no version and no sign-in state. The picker hides a CLI
  that is not installed. The screen of a machine has a "CLI
  Availability" group with "Installed" or "Not found" for each CLI.
- Settings, Agents: a group for each CLI with the rows Permission, Model
  and Effort. Each row shows "Default (X)", and the first choice is "Use
  code default". Codex also has "Custom model…".
- Sign-in: each CLI keeps its own. For Claude Code, the app only says
  "Run the following command in your terminal: $ happy connect claude".
- Permission modes: Codex has Auto, Workspace, Read, Yolo and Default.
  The Antigravity CLI has Default (`--sandbox`) and Yolo.
- Limits: Gemini is deprecated, because its sign-in fails for personal
  accounts. Only Claude Code and Codex can resume and fork. In Happy, the
  Antigravity CLI shows no tool calls.

What Yonder takes from Happy: a process for each turn of the Antigravity
CLI, the Permission, Model and Effort rows for each CLI with "<CLI>
default" first, and a picker without the CLIs that are off. What Yonder
does better: the version, the sign-in and how each CLI pays are in the
Settings, the sessions need no wrapper, and the user talks.

### The other apps

- **T3 Code**: Codex, Claude Code, Cursor, Grok Build, OpenCode,
  Antigravity, Pi, and an "ACP Registry" driver that searches the
  registry or takes a command with its arguments. Settings, Providers has
  a card for each one: the version, "Authenticated as <email>", "Not
  found" or "Disabled", "Continue authentication", an Enable switch, a
  "Binary path" field, environment variables, models with favorites, and
  more instances for other accounts.
- **Paseo**: Claude Code, Codex, OpenCode, Pi, OMP, Antigravity and Muse
  Code. Its docs say that 30 more ACP CLIs install from a catalog in the
  app (not verified). Custom CLIs go in `~/.paseo/config.json`. For
  Antigravity, "Full access is the only permission mode".
- **Emdash**: about 35 CLIs, each in a terminal (PTY). It scans the PATH
  and shows if each CLI is installed and its version, with Refresh.
- **Orca**: 27 CLIs and "Any other CLI agent". Settings, Agents has the
  installed CLIs with a switch, Yolo or Manual permissions, and the
  arguments and environment variables of each CLI (from the docs only).

### Who supports which CLI

| CLI | Happy | T3 Code | Paseo | Yonder plan |
| --- | --- | --- | --- | --- |
| Claude Code | yes | yes | yes | today |
| Codex | yes | yes | yes | phase 1 |
| Antigravity CLI | yes | yes | yes | phase 2 |
| OpenCode | from a terminal (ACP) | yes | yes | phase 2 |
| Cursor | not built in | yes | not built in | phase 2 |
| Grok Build | not built in | yes | not built in | phase 2 |
| Gemini CLI | deprecated | no | no | only if a user asks |
| Any ACP CLI | from a terminal | yes (registry) | catalog | phase 3 |

## What each CLI gives

### Claude Code (today)

- `claude --bg` with a daemon that keeps the session between turns, the
  agent view (`claude agents`) with working, blocked and done, and a
  transcript in `~/.claude/projects`. The wiki has the details, under
  Workers.

### Codex (OpenAI)

- 0.160.1, 2026-10-05. Install: `npm install -g @openai/codex`, `brew
  install --cask codex`, or `curl -fsSL
  https://chatgpt.com/codex/install.sh | sh`.
- Sign-in: `codex login` (the browser), `codex login --device-auth` (a
  code for another device), or an API key. `codex login status` tells if
  it is signed in. A ChatGPT plan works in a headless run.
- Headless run: `codex exec --json "<prompt>"`. The first event is
  `thread.started` with the `thread_id`. Then come `turn.started`,
  `item.started`, `item.updated`, `item.completed`, and `turn.completed`
  or `turn.failed`.
- Resume: `codex exec resume <thread id> "<message>"`.
- A headless run never asks: its approval policy is always `never`. The
  sandbox flags are `--yolo` (no sandbox, full access), `-s
  workspace-write` (edits only in the folder) and `-s read-only`. Without
  `-s`, it takes the sandbox of `config.toml`, so the bridge always gives
  one.
- Model: `-m`. Effort: `-c model_reasoning_effort=low|medium|high|xhigh`.
  Some models have more values.
- The spoken prompt: `-c developer_instructions="…"`. The tools of Yonder:
  `-c 'mcp_servers.yonder.url="http://127.0.0.1:7787/mcp"'`. The `-c`
  flags apply to one run, and do not change `config.toml`.
- Stop: `SIGINT` interrupts the turn. Terminal: `codex resume <thread
  id>`. Its picker hides headless sessions, but an ID opens them.
- Session files: `~/.codex/sessions/<y>/<m>/<d>/rollout-<time>-<thread
  id>.jsonl`. Files older than 7 days become `.jsonl.zst`, and 0.160 also
  has an SQLite store of threads.
- A daemon exists: `codex app-server daemon start` (experimental). It
  keeps threads alive after the caller ends, and the status of a thread
  can say `waitingOnApproval`.
- ACP: no native mode. The adapter is `@agentclientprotocol/codex-acp`.
- On a test Mac: `codex` 0.118.0 from npm (under nvm) did not start. Its
  platform binary was missing, and it failed with `ENOENT`. A reinstall
  fixes it.

### The Antigravity CLI and Gemini CLI (Google)

- On 2026-06-18 Gemini CLI stopped serving the free, Pro and Ultra users,
  and the Antigravity CLI took its place. Gemini CLI still gets releases
  (0.62.0 on 2026-09-29) for enterprise licenses and API keys.
- Antigravity is not only an IDE. Its CLI is `agy`. Install: `curl -fsSL
  https://antigravity.google/cli/install.sh | bash`.
- Sign-in: a Google account (Free, Pro or Ultra quotas), cached after one
  sign-in in a terminal. Or a Gemini API key.
- Headless run: `agy -p "<prompt>" --output-format stream-json`. The JSON
  gives a `conversation_id`. Resume: `--conversation <id>`.
- Flags: `--model`, `--effort`, `--agent`, `--mode`,
  `--dangerously-skip-permissions`.
- The tools of Yonder: `agy mcp add` writes the config of the user. A
  flag for one run is not verified.
- The spoken prompt: no flag found, so it goes in the `<voice-call>`
  block (see below).
- ACP: a separate binary, `agy_acp_server`, with its own sign-in.
- Gemini CLI, for a user with an enterprise license: `gemini -p "<prompt>"
  -o stream-json`, `--resume <id>`, `-y` (never ask), `--skip-trust`, and
  `gemini --acp`. Its MCP servers are only in settings files.

### OpenCode

- 1.18.34, 2026-09-30. Install: `curl -fsSL https://opencode.ai/install |
  bash`, or `npm install -g opencode-ai`.
- Sign-in: `opencode providers login`. It takes a ChatGPT Plus or Pro
  plan, a GitHub Copilot plan, OpenCode Zen, or a key of more than 75
  providers. It does not take a Claude plan.
- Headless run: `opencode run "<prompt>" --format json`. The events are
  `step_start`, `text`, `tool_use`, `step_finish` and `error`, each with
  the `sessionID`. Resume: `opencode run -s <id> "<message>"`.
- Never ask: `--auto`. Without it, `run` refuses each request that asks.
- Model: `-m provider/model`. Effort: `--variant minimal|high|max`. It has
  its own agents (`--agent <name>`), such as plan.
- The tools of Yonder: the environment variable `OPENCODE_CONFIG_CONTENT`
  with `{"mcp": {"yonder": {"type": "remote", "url": "…"}}}`, for one run.
  The spoken prompt can go in the same JSON as `instructions` (not
  verified).
- A server: `opencode serve --port <n>`, with an HTTP API for the
  sessions, their status, the permissions and the events.
- Terminal: `opencode -s <id>`. Its sessions are in SQLite
  (`~/.local/share/opencode/opencode.db`). `opencode export <id>` gives
  one session as JSON.
- ACP: `opencode acp`.
- An OpenRouter key works too. That key pays for each token.

### Hermes Agent

- 0.23.1, 2026-11-10. Hermes Agent of Nous Research. Install:
  `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`.
  `--non-interactive` skips the setup, and `--skip-browser` skips
  Chromium. It puts `hermes` in `~/.local/bin`, and its files in
  `~/.hermes`.
- Sign-in: `hermes model` (or `hermes setup`). It takes Nous Portal, a
  ChatGPT plan (`openai-codex`), SuperGrok, a key of many providers, or a
  local server (Ollama, LM Studio, llama.cpp) as `custom` with a
  `base_url`. It needs a model with a context of 64k tokens or more.
- Set `hermes config set auth.adopt_external_logins false` (the Install
  command of Yonder does it). Else Hermes
  borrows the sign-in of Codex or Claude Code. Their refresh tokens are
  single-use, so a refresh by Hermes can sign that CLI out.
- ACP: `hermes acp`, with no extra install in 0.23. Modes `default`,
  `accept_edits` and `dont_ask`. The options are `model`
  (`provider:model`), `reasoning_effort` (none to ultra) and
  `edit_approval_policy`. It can load, resume, list and fork sessions,
  and the ACP session ID is the ID of `hermes sessions list`.
- The tools of Yonder: an HTTP MCP server in `session/new` works, but
  `mcpCapabilities.http` is not set.
- Terminal: `hermes --resume <id>`.
- One prompt: `hermes -z "<prompt>"` (0.23.2, 2026-11-18). It prints
  only the answer, and exits with 2 when the model fails, with the
  error on stdout. `-m` takes `provider:model`, as the ACP option does.
  It allows each tool with no question: with the default toolsets a
  local model ran a shell command from the prompt. `-t todo` gives
  only the todo tools, and `--ignore-rules` skips AGENTS.md, SOUL.md,
  the memory and the skills. Each run leaves a session with the source
  `oneshot` in `hermes sessions list`, and the pickers hide it. It
  starts the same gateway as `hermes acp`. Yonder writes the title of
  an agent of Hermes with it (`ask` of the row in `bridge/clis.ts`).
- `hermes acp` starts a Hermes gateway (`gateway run --idle-exit`)
  through launchd. It stops by itself when it is idle.

### Cursor CLI

- 2026.10.01. Install: `curl https://cursor.com/install -fsS | bash`. The
  binary is `agent`, also linked as `cursor-agent`.
- Sign-in: `agent login`. `agent status --format json` tells if it is
  signed in. A Cursor plan works in a headless run.
- Headless run: `agent -p "<prompt>" --output-format stream-json`. Each
  event has the `session_id`. Resume: `agent -p --resume <chat id>
  "<message>"`.
- Never ask: `--force` (also `--yolo`), with `--trust` for the folder.
  Without `--force`, the headless run only proposes the edits. `--mode
  plan` plans, and `--mode ask` only answers.
- The tools of Yonder: only in `.cursor/mcp.json` of the project or of
  the user, with `--approve-mcps`. No flag for one run.
- The spoken prompt: no flag, so it goes in the `<voice-call>` block.
- A headless run also writes a transcript in the format of Claude Code
  (its folder is not verified).
- ACP: `agent acp`.
- On a test Mac: the build of 2025-09-12, not signed in.

### Grok Build (xAI)

- The official coding CLI of xAI. Install: `curl -fsSL
  https://x.ai/cli/install.sh | bash`, or npm `@xai-official/grok`. The
  binary is `grok`. The community CLI `superagent-ai/grok-cli` also
  installs a `grok` binary and uses `~/.grok/`, so do not install both.
  T3 Code uses Grok Build.
- Sign-in: `grok login` (the browser, or `--device-auth`), with a
  SuperGrok or X Premium+ plan since 2026-05-25. Or `XAI_API_KEY`, which
  pays for each token. The xAI key of Yonder is for the voice, so the row
  of Grok Build must say when it uses a key.
- Headless run: `grok -p "<prompt>" --output-format streaming-json`.
  `streaming-messages-json` gives the stream JSON of Claude Code. The JSON
  has the `sessionId`. Resume: `-r <id>`.
- Never ask: `--yolo`, or `--permission-mode bypassPermissions`. Model:
  `-m`. Effort: `--effort`. The spoken prompt: `--rules <text>`.
- The tools of Yonder: no flag for one run. It reads `.mcp.json` and the
  MCP config of Claude Code. So the Claude Code row of the Settings can
  give the tools to Grok Build too (not verified).
- A server: `grok agent serve`, ACP over a WebSocket, keeps its state
  when a client connects again. `grok sessions list` lists the sessions.
- ACP: `grok agent stdio`.

### GitHub Copilot CLI

- Install: `npm install -g @github/copilot`. The binary is `copilot`.
- Sign-in: `copilot login` or `GH_TOKEN`, with a Copilot plan. Copilot
  has a free plan.
- Headless run: `copilot -p "<prompt>" --output-format json`. Resume:
  `--resume=<id>`. `--session-id` sets the ID of a new session.
- Never ask: `--allow-all-tools` (or `--yolo`) and `--no-ask-user`.
  Model: `--model`. Effort: `--effort`.
- The tools of Yonder: `--additional-mcp-config=<JSON>`, for one run.
- A server: `copilot --headless --port <n>`. ACP: `copilot --acp`.

### The other CLIs

Most of them have a headless run with JSON and a resume by ID, so one
row in the table can add each of them later.

- **Amp**: `amp -x "<prompt>" --stream-json`, `amp threads continue`. A
  free plan, or a paid one.
- **Factory Droid**: `droid exec "<prompt>" -o stream-json`, `-s <id>`,
  `--auto high`. ACP native.
- **Qwen Code**: `qwen -p "<prompt>" --output-format stream-json`,
  `--resume <id>`, `--yolo`. Its free sign-in closed on 2026-04-15 (one
  secondary source). ACP native.
- **Kimi Code**: `kimi -p "<prompt>" --output-format stream-json`, `-S
  <id>`. A headless run never asks. ACP native.
- **Pi**: `pi -p` with `--mode json`, `--session <id>`. It never asks. It
  signs in with a Claude, ChatGPT or Copilot plan.
- **Goose**: `goose run -t "<prompt>" --output-format stream-json`, with
  `--with-streamable-http-extension <url>` for MCP. ACP native.
- **Cline**: `cline "<prompt>" --json`, `--id <id>`, `--auto-approve
  true`. ACP native.
- **Kiro**: `kiro-cli chat --no-interactive --output-format stream-json`.
  A headless run needs `KIRO_API_KEY`, only on the Pro plan and higher.
  A resume by ID is not verified.
- **Crush**: `crush run`, `-s <id>`. Its JSON output is not verified. No
  ACP.
- **Auggie**: `auggie -p "<prompt>" --output-format json`, `-c`. ACP
  native.
- **Aider**: no JSON output and no sessions. It does not fit.

### ACP (the Agent Client Protocol)

- A protocol of Zed and JetBrains. Version 1 is stable (schema 1.24.1,
  2026-09-30), and a draft of version 2 exists.
- One JSON-RPC protocol over stdio: `session/new` (with `cwd` and
  `mcpServers`), `session/prompt`, `session/update`,
  `session/request_permission`, `session/cancel`, `session/load`,
  `session/resume` and `session/list`. A model is a config option of the
  session, not a method.
- An official registry of CLIs:
  `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`.
  The TypeScript SDK is `@agentclientprotocol/sdk` 1.7.0.
- Native in Grok Build, Copilot, Gemini CLI, Qwen Code, Kimi, Goose,
  OpenCode, Cursor, Cline, Auggie, Droid and more. Adapters exist for
  Codex (`codex-acp`) and for Claude Code (`claude-agent-acp`).
- The adapter for Claude Code is built on the Claude Agent SDK. The wiki
  says: do not use the Claude Agent SDK, use the `claude` CLI. So Claude
  Code stays on `claude --bg`.
- An ACP CLI over stdio stops when its client stops. After a restart of
  the bridge, `session/load` gives back the history, but the turn that
  ran is lost. The bridge restarts often (`restart_bridge`, each
  rebuild), so ACP needs a separate host process that keeps the turns
  alive.
- ACP gives one thing that a headless run does not: each permission
  request, live. So phase 3 can bring "waiting", and Allow and Deny on
  the phone.

## How Yonder runs a CLI

### The rule

A CLI fits Yonder when it has these three things:

1. A headless run that gives a session ID.
2. A headless resume of that session with a new message.
3. A headless run that never stops to ask.

Then one process for each turn fits the poll and the queue of the bridge
with the smallest change. Each CLI in the phases above has all three. A
CLI without them waits for phase 3 (ACP, or its own server).

### Claude Code does not change

Claude Code keeps `claude --bg`, its agent view and its transcript. It is
the only CLI with a daemon that keeps a session alive between turns, and
that tells when a session waits for the user.

### One process for each turn

An earlier bridge ran `claude -p` this way, and that code kept workers
running when the bridge restarts. Use the same design for the other CLIs.

1. A turn starts with `Bun.spawn` and `detached: true`. The output goes
   to a log in `~/.config/yonder/runs/`, one file for each turn. So the
   turn continues when the bridge restarts, when the app rebuilds, and
   when the app quits.
2. The bridge reads the session ID from the first events of the log, as
   `send()` reads the short ID of `claude --bg` today. A new agent gets
   its ID from it.
3. The poll of every 2 seconds (`refresh()`) checks each such agent. A
   live process means running, with the last tool call or text as the
   activity. An ended process means done or failed, from its last event
   and its exit code. The final message is the result.
4. A message to a running agent goes into its queue, as today. When the
   turn ends, the queue starts the next turn with a headless resume.
5. Stop and `now: true` end the process group: `SIGINT`, then `SIGTERM`
   after 3 seconds. Then a resume continues the session. Test this for
   each CLI (see Open questions).
6. A new bridge finds each running turn by the pid in `state.json`. As
   the old code did, it checks that the pid still runs the same binary,
   because macOS can give the number to another process.
7. `open_in_terminal` runs the resume of the CLI in Ghostty, for example
   `codex resume <id>`. It refuses while a turn runs, as it does today
   for a worker of an older bridge.
8. `close_worker` ends a running turn. `remove_worker` deletes the logs of
   Yonder. The CLI keeps its own session files.

The resume of Claude Code has a problem that the others do not have: a
message to a live session starts a copy, so `resume()` stops the session
first and waits for the roster of the daemon. A headless turn has no live
session between turns, so it needs none of that. A new model or effort
also needs no copy: the next turn gets the new flags.

The bridge runs in the login shell of the user (`start_bridge` in
`src-tauri/src/main.rs`). So `Bun.which` finds a CLI on the same PATH as
a terminal.

### The status

| Status | Claude Code | A CLI with headless runs |
| --- | --- | --- |
| running | the agent view says working | the process of the turn runs |
| waiting | the agent view says blocked: a question or a permission | never (see below) |
| done | the agent view says done | the process ended after its final message |
| failed | the agent view says failed | an error event, or an exit code that is not 0 |
| closed | the user closed it | the user closed it |

A headless run never stops to ask, so an agent in such a CLI never
waits. When it ends its turn with a question, it is done, and Clef sets
the purple dot (`attention`), as it does today for a result that needs
the user. Phase 3 can bring "waiting" back.

### The conversation

`turns()` and `lastTurn()` read the transcript of Claude Code today. For
each other CLI, the bridge reads its own logs: the JSON events of each
turn, and the prompt that it sent.

- The JSON output is the public interface of each CLI. The session files
  are internal, and they change. Codex 0.160 compresses its files after 7
  days and adds an SQLite store. OpenCode keeps SQLite.
- Each CLI gets one parser that gives the same `Turn` list: the prompts,
  the text of the answers, one line for each tool call, and the diff of
  an edit when the events have one.
- So the turns that the user does in a terminal (`codex resume`) do not
  show in Yonder. Later, a reader of the session files can add them.

### The tools of Yonder and the spoken prompt

- Each agent gets the MCP server `yonder` for its run only, with no
  change to the settings of the user, as Claude Code gets it today with
  `--mcp-config`. Codex, OpenCode and Copilot have a way for one run.
  Cursor and Grok Build have none, and for the Antigravity CLI it is not
  verified. Their agents get the tools only when the user turns on the
  switch of that CLI in the Settings.
- `SPOKEN` (the prompt that asks for a short spoken end) goes in with the
  system-prompt flag of the CLI: `developer_instructions` for Codex,
  `--rules` for Grok Build.
- A CLI with no such flag gets `SPOKEN` in a `<voice-call>` block at the
  top of each prompt. `typed()` already hides that block in the
  conversation view, so this needs no new code.
- `SPOKEN` says "their voice app for Claude Code". Make it "their voice
  app for coding agents".

### Model, effort and permissions

- The table gives each CLI its models in order of power, its efforts and
  its permission modes.
- Phase 1: Clef picks only the effort for a CLI other than Claude Code.
  The model is the default of the CLI, the model of its page in the
  Settings, or the model that the user names. Later each CLI gets tiers,
  so that Clef can pick the model too.
- The `mode` input of the tools keeps the four values of Claude Code.
  Each CLI maps them to its own flags, and refuses a mode that it does
  not have. The app shows the names of each CLI:

| Yonder value | Codex | Antigravity CLI | OpenCode | Cursor | Grok Build |
| --- | --- | --- | --- | --- | --- |
| `bypassPermissions` (default) | Full access: `--yolo` | Full access: `--dangerously-skip-permissions` | Full access: `--auto` | Full access: `--force --trust` | Full access: `--yolo` |
| `auto` | Workspace write: `-s workspace-write` | Sandbox: `--sandbox` (Happy uses it) | none | none | not verified |
| `acceptEdits` | none: it waits | none | none | none | none |
| `plan` | Read only: `-s read-only` | `--mode` (not verified) | the plan agent (not verified) | Plan: `--mode plan` | not verified |

### What needs Claude Code still

- `ask()` runs `claude -p` with Haiku for the summaries, and with Sonnet
  for `review_workers`. A Mac with no Claude Code has no summaries and no
  review. Later: run them in the default CLI with a small model, or with
  Clef.
- `titleOf`, `pick` and `worthTelling` use Clef (Workers AI). They work
  for each CLI.
- Sub-agents (21A, 21B), Claude Code agent types (`--agent`), the slash
  commands and the outside sessions (terminal and background) stay
  Claude Code only in phase 1.

## What changes in the bridge

| Place in `bridge/main.ts` | Today | Change |
| --- | --- | --- |
| `CLAUDE` | the path of `claude` | stays; `bridge/clis.ts` finds the other CLIs |
| `Worker` | no CLI | `cli?: string`; no value means Claude Code, so the old agents keep working |
| `MODES`, `EFFORTS`, `LATEST`, `TIERS` | Claude Code only | stay for Claude Code; each other CLI has its own lists in its row |
| `options()` | the flags of `claude` | stays; each other CLI builds its own arguments in its row |
| `background()`, `send()`, `resume()` | `claude --bg`, the copy and the roster | a branch for the other CLIs: the headless run above |
| `agents()`, `control()`, `halt()` | `claude agents`, `claude stop`, `claude rm` | a branch: the pid and the process group |
| `refresh()`, `follow()` | the state of the agent view | a branch: the process and the log |
| `transcriptFile()`, `transcript()`, `turns()`, `lastTurn()` | the transcript of Claude Code | a parser for each CLI, with the same output |
| `pick()` | Clef picks a Claude model and an effort, for "a Claude Code agent" | for another CLI, Clef picks the effort only; the words say "a coding agent" |
| `SPOKEN` | "voice app for Claude Code" | "voice app for coding agents" |
| `trust()` | `~/.claude.json` | each CLI has its own trust flag in its row (`--trust`, `--skip-trust`) |
| `open_in_terminal` | `claude attach` or `claude --resume` | the resume of the CLI |
| `remove_worker` | `claude rm` | deletes the logs of Yonder |
| `claudeUsage()` | the API of the Claude plan | stays; Codex gets a reader of its session files |
| `/claude-mcp` | `claude mcp add` | stays; `/clis/mcp` does the same for each other CLI |
| `start_worker`, `list_workers`, `get_worker` | no CLI | a `cli` input and a `cli` field (see Grok) |

Put the table of the CLIs in one new file, `bridge/clis.ts`, next to
`preview.ts` and `relay.ts`. Each row gives:

- the name, the binary, and the minimum version;
- how to check that it starts (`--version`) and that it is signed in;
- the arguments of a new turn and of a resume;
- a parser of one JSON line: the session ID, the activity, the text,
  done or failed;
- the models, the efforts and the permission modes;
- the MCP flag, the system-prompt flag, and the trust flag;
- the resume for Ghostty;
- the sign-in and the install commands.

Claude Code gets a row for the checks and the Settings only. Its runs keep
the code that they have now.

## What changes in the app and for Grok

### Grok

- `start_worker` gets a `cli` input. Its values are the CLIs that are on
  in the Settings. "Set it only when the user names a CLI, such as 'use
  Codex' or 'ask Antigravity'. Leave it out for the default of the
  Settings."
- The description of `start_worker` says "Start a Claude Code worker".
  Make it "Start an agent in a CLI".
- Grok takes "Gemini" for the Antigravity CLI, unless Gemini CLI is on.
- `list_workers` and `get_worker` give the CLI of each agent. Grok says
  it only when it is not the default: "Codex agent 4 is done."
- `message_worker` keeps the CLI of the agent. A model or a mode that
  the CLI does not have returns an error with the valid values.
- "Give this to Codex" or "ask Antigravity for a second opinion on 3":
  Grok calls `get_worker` with `full`, then `start_worker` in the other
  CLI with the result as context. This is one rule in the prompt, with
  no new tool.
- The prompt of Grok (`src/App.tsx`, from line 3918) says "the voice of
  a team of Claude Code agents" and "Claude Code gives the status". Make
  them name the CLIs that are on.
- `call_status` (`src/voice.ts`) gives the Claude Code usage. It also
  gives the usage of each CLI that has numbers.

### The app

- The New agent view gets a CLI menu, first in the row of menus, only
  when two or more CLIs are on. The model, effort and permission menus
  then show the values of that CLI.
- On the phone the row has three menus at 13 px already, and only the
  permission menu shrinks. So on the phone the CLI
  menu is a round button with the logo of the CLI and no text.
- Each agent row shows a small logo of its CLI before the name, only when
  two or more CLIs are on. The logos are small files in `public/clis/`,
  as `public/ghostty.png` is. The icons of `src/icons.tsx` are Lucide
  line icons, which have no brand logos.
- The three dots of an agent show the model, effort and permission menus
  of its CLI. Open in Ghostty is an item of that menu on the Mac. The
  title says "Open this session in Codex, in Ghostty" for a Codex agent.
- The labels of the outside sessions ("Own terminal", "Background · not
  Yonder") stay Claude Code.
- The demo on the yonder.so landing page must change too when the CLI
  menu and the logos ship.

## The Settings page

### An Agents tab

The Settings get an Agents tab, after General. The rows of General that
are for Claude Code only move into the page of Claude Code in this tab:
Default model, Minimum, Maximum, Permissions, and the Claude Code row of
the tools of Yonder. The wiki says that General was too busy, so this
also makes General shorter. Summaries and Call history stay in General.
The routes of the bridge (`/model`, `/mode`, `/claude-mcp`) do not change.

```
Settings
 General   Agents   Appearance   Voice   Usage

 NEW AGENTS
 ┌──────────────────────────────────────────────────┐
 │ CLI                              [Claude Code ▾] │
 │ New agents run in it, unless you name another.   │
 └──────────────────────────────────────────────────┘

 CLIS
 ┌──────────────────────────────────────────────────┐
 │ ◆ Claude Code                             On   › │
 │   2.1.290 · Claude plan                          │
 ├──────────────────────────────────────────────────┤
 │ ◆ Codex                            [Reinstall] › │
 │   Does not start                                 │
 ├──────────────────────────────────────────────────┤
 │ ◆ OpenCode                                Off  › │
 │   1.18.31 · OpenRouter key, pays per token       │
 ├──────────────────────────────────────────────────┤
 │ ◆ Cursor                             [Sign in] › │
 │   2025.09.12 · Not signed in                     │
 ├──────────────────────────────────────────────────┤
 │ ◆ Antigravity                        [Install] › │
 │   Not installed                                  │
 ├──────────────────────────────────────────────────┤
 │ ◆ Grok Build                         [Install] › │
 │   Not installed                                  │
 └──────────────────────────────────────────────────┘
 Yonder looks for these CLIs on this Mac. [Check again]
```

The rows above show the state of a test Mac.

- Each row has the logo, the name, and one line: the version and how the
  CLI pays ("Claude plan", "ChatGPT plan", "OpenRouter key, pays per
  token"), or what is wrong. None of the other apps shows how a CLI pays.
- The bridge finds the binary with `Bun.which`, and runs `--version`. On
  this Mac `codex` exists, but it fails with `ENOENT`. So the check runs
  the binary, and the row says "Does not start", with Reinstall.
- The switch (On or Off) tells if Grok and the New agent view offer the
  CLI. Only a CLI that starts and is signed in can be on.
- The CLI menu of New agents has only the CLIs that are on.
- The bridge checks when the Settings open, and on Check again. It does
  not poll, because the CLIs change rarely.
- A tap on a row opens the page of that CLI. On the phone it opens as a
  page with a back button, as the Settings page does.

### The page of a CLI

```
 ‹ Agents                 Codex

 ┌──────────────────────────────────────────────────┐
 │ Version                                 0.160.1  │
 │ Account                         ChatGPT plan     │
 │ Path                   /opt/homebrew/bin/codex   │
 │ [Check again]                        [Sign in]   │
 └──────────────────────────────────────────────────┘
 NEW AGENTS
 ┌──────────────────────────────────────────────────┐
 │ Model                         [Codex default ▾]  │
 │ Effort                                [Auto ▾]   │
 │ Permissions                    [Full access ▾]   │
 └──────────────────────────────────────────────────┘
 TOOLS OF YONDER
 ┌──────────────────────────────────────────────────┐
 │ All Codex sessions                    Off | On   │
 │ Yonder agents always have them.                  │
 └──────────────────────────────────────────────────┘
 USAGE
 ┌──────────────────────────────────────────────────┐
 │ 5 hours                 34% used · resets 16:15  │
 │ Week                    10% used · resets Mon    │
 └──────────────────────────────────────────────────┘
```

- Model: "<CLI> default" first, as in Happy. Then the models of the CLI.
- Effort: Auto first, so that Clef picks it. Then the efforts of the CLI.
  A CLI with no effort has no Effort row.
- Permissions: only the modes of the CLI that never stop to ask.
- Yonder plugins: the same switch as the Claude Code row today. On adds
  `yonder` to the MCP servers of the CLI for all its sessions, also in a
  terminal. It is off until the user turns it on, for the same reason as
  the Claude Code row: it changes the settings of the user, and gives
  each session tools that start and remove agents. For the Antigravity
  CLI, Cursor and Grok Build, it is the only way to give their agents
  the tools.
- Usage: only for a CLI that gives numbers (see below).
- The page of Claude Code has the rows that leave General: Default model,
  Minimum, Maximum, Permissions, and Yonder plugins.
- No "Binary path" field and no environment variables, as T3 Code and
  Orca have. Add them when a CLI is not on the PATH of the login shell.

### Sign in

- Each sign-in is the login command of the CLI, for example `codex
  login`. It opens the browser of the Mac. So on the Mac, Sign in opens a
  new Ghostty tab with that command, as `open_in_terminal` does. When the
  user comes back to the Settings, the bridge checks again.
- On the phone, the button says "Sign in on the Mac". A confirm dialog
  says that it opens a terminal on the Mac, and that the user must finish
  there.
- Codex and Grok Build can sign in with a device code (`--device-auth`).
  For them, the bridge runs the command, and the phone shows the link and
  the code. Then the user signs in from the phone. The output of these
  commands is not verified.
- Yonder never asks for a key, and never reads or copies the token of a
  CLI. Each CLI keeps its own sign-in, as the wiki says for Claude Code:
  the work uses the plan of the user.

### Install

- Install and Reinstall show a confirm dialog with the exact command and
  where it comes from, for example `npm install -g @openai/codex@latest`.
  On OK, the command runs in a new Ghostty tab, so that the user sees it.
- This runs a command on the Mac from a tap, also from the phone. So it
  always needs the confirm dialog, as a closed tunnel does.

### Usage

- The Usage tab has the card of Claude Code today. It gets one card for
  each CLI that gives numbers, with the same meters.
- Codex writes its limits in each `token_count` event of its session
  files: `rate_limits.primary` (the 5 hours), `rate_limits.secondary`
  (the week), each with `used_percent` and `resets_at`, and `plan_type`.
  A session file of Codex has them, and the source of Codex
  0.160.1 still has them (`TokenCountEvent` in
  `codex-rs/protocol/src/protocol.rs`). So the card needs no API call.
  The files are internal, so the card says "No numbers yet" when the
  format changes.

### The routes of the bridge

- `GET /clis` gives each CLI: the name, if it starts, the version, the
  path, if it is signed in, how it pays, on or off, the models, the
  efforts, the modes, and the usage.
- `POST /clis` sets the default CLI, a switch, or the model, the effort
  and the mode of new agents of one CLI. `state.json` keeps them.
- `POST /clis/login` and `POST /clis/install` open the command in
  Ghostty. `POST /clis/mcp` adds or removes `yonder` in the MCP servers
  of one CLI.

## Phases

### Phase 0: the test Mac

- Reinstall Codex: `npm install -g @openai/codex@latest`, or `brew
  install --cask codex`.
- Sign in: `codex login`, with the ChatGPT plan.

Without this, phase 1 cannot run a real Codex turn on the test Mac.

### Phase 1: Codex, end to end

Codex comes first. Each other voice app with a second CLI supports it, and it has the fullest headless run: a session ID, a
resume, no questions, MCP and a prompt for one run, and usage in its
files.

1. `bridge/clis.ts`: the table with Claude Code (checks only) and Codex.
2. `Worker.cli`, a runner of one process for each turn, and the branches in
   `send`, `resume`, `halt`, `refresh` and `follow`.
3. The parser of Codex: the activity, the result, done or failed, and
   the `Turn` list from the logs.
4. `open_in_terminal` with `codex resume`, and `remove_worker` with the
   logs.
5. `GET /clis` and `POST /clis`, the Agents tab with the list, the page
   of Claude Code (the rows from General), the page of Codex, and the
   Usage card of Codex.
6. Grok: the `cli` input, the descriptions of the tools, and the prompt.
7. The app: the CLI menu of New agent, the logos, and the three dots.
8. `bridge/clis-check.ts` with a recorded Codex stream.
9. The wiki (the CLIs under Workers, and the Agents tab under Mac app),
   and the landing demo.

### Phase 2: one row for each CLI

In this order: the Antigravity CLI, OpenCode, Cursor, Grok Build and
Copilot. Each one needs a row in the table, a parser, a recorded stream
for the check, and a logo. Add Gemini CLI only if a user with an
enterprise license asks.

### Phase 3: ACP and approvals, only when needed

Built: the host, Codex and OpenCode on ACP. Still to do, in
this order:

1. Cursor (`cursor-agent acp`), Copilot (`copilot --acp --stdio`) and
   Grok Build (`grok agent stdio`) on ACP, each when it is signed in and
   tested. Antigravity and Pi have no ACP mode.
2. Approvals: a permission request in the host waits, the agent shows as
   waiting, and the phone shows Allow and Deny, also in the push.
3. "Add an agent": a row in the Agents tab with the agents of the ACP
   registry. Built (`bridge/registry.ts`). Any ACP command
   that is not in the registry is still to do.
4. Commands from ACP: `available_commands_update` gives the commands of
   each agent, in place of the folders of `skills` in `bridge/clis.ts`.

The plan before the build:

- When: the user wants to approve actions from the phone, or wants a CLI
  that the table does not have.
- A small host process (`bridge/acp-host.ts`) that the bridge starts
  detached. It keeps the ACP CLIs alive when the bridge restarts. The
  bridge talks to it on a local socket.
- An "Add a CLI" row in the Agents tab: a choice from the ACP registry,
  or a command.
- A permission request makes the agent "waiting". The phone shows Allow
  and Deny, also in the push.
- A CLI with its own server that lives on (the Codex daemon, `opencode
  serve`, `grok agent serve`) can take the place of the host for that
  CLI.

### Agents on a server (to test)

This section plans agents on a server that Yonder reaches over SSH, also
Claude Code. Nothing of this is built or tested.

- The ACP host already speaks HTTP on a socket, so the same host can run
  on a Linux server. The bridge can reach its socket through
  `ssh -L <local socket>:<remote socket>`. The bridge reads the logs of
  the turns from files, so the host needs a route that gives a log from
  an offset (`GET /log`), and `followRun` and `runTurns` must read it.
  To test: an SSH tunnel that stays up, and a host that the bridge
  installs and starts over SSH, as One does with its connector.
- Codex and OpenCode on the server sign in there once (`codex login
  --device-auth`, `opencode auth login`).
- Claude Code on a server: `claude setup-token` ("Set up a long-lived
  authentication token (requires Claude subscription)") signs in a
  server with the plan of the user, and `claude --bg` and `claude agents`
  run there as on the Mac. So the host on the server can also run the
  Claude Code agents there, with the same commands as the bridge on the
  Mac. To test: `--bg` on a Linux server with no screen, and the token of
  `setup-token` in `CLAUDE_CODE_OAUTH_TOKEN`.
- Claude Code also has `--remote-control`, which lets the Claude app
  reach a session. It is a channel of Anthropic, not of Yonder.

### Phase 4: ideas for later

- When the Claude Code week is near its limit, Grok offers to start the
  agent in Codex.
- "Ask Codex to review agent 3": a second opinion from another CLI.
- One request to two CLIs, then a comparison, as Orca does.
- A default CLI for each project.
- The summaries in the default CLI when Claude Code is not installed.

## Checks

- Do not run `bun run test`. It starts six real Claude Code sessions.
- Add `bridge/clis-check.ts`, as the other `*-check.ts` files. It sends a
  recorded event stream of each CLI (in `bridge/fixtures/`) through its
  parser, and checks the session ID, the activity, the final text, and
  done or failed. It uses no credits.
- `bun run check` and `bun run check-bridge` must pass. `check-bridge`
  starts no agents.
- Before a release, start one small task in each CLI by hand on this Mac.

## Open questions

- Stop in the middle of a turn: does each CLI save its session when the
  bridge sends `SIGINT`, so that a resume continues it? Test each CLI.
- Does `codex exec` still refuse a folder that is not a git repository
  without `--skip-git-repo-check`? Yonder starts agents in any folder.
- The flags of `codex exec resume`: does it take `--json`, `-s` and the
  `-c` flags in the same place as `codex exec`? Check its `--help` after
  the reinstall.
- The terms of each plan: Yonder runs only the official CLI with the
  sign-in of the user, and never touches a token. Read the terms of each
  provider before the launch, for a CLI that another app starts.
- Summaries on a Mac with no Claude Code (see "What needs Claude Code
  still").
- The outside sessions of the other CLIs: Yonder lists the Claude Code
  sessions that it did not start. A later step can list the sessions of
  Codex from its folder.
- Two sources on the Antigravity CLI disagree on the time limit of a
  headless run (`--print-timeout`): 5 minutes, or no limit. Check it
  before phase 2.

## Sources

- Happy: github.com/slopus/happy (`packages/happy-cli/src/claude`,
  `src/codex/codexAppServerClient.ts`, `src/agent/acp/AcpBackend.ts`,
  `src/agy/cliArgs.ts`, `src/daemon/run.ts`, `src/utils/detectCLI.ts`;
  `packages/happy-app/sources/app/(app)/new/index.tsx`,
  `settings/agents.tsx`, `sources/utils/harnessCatalog.ts`,
  `sources/components/modelModeOptions.ts`).
- Codex: github.com/openai/codex, tag `rust-v0.160.1` (`codex-rs/exec`,
  `codex-rs/app-server-daemon`, `codex-rs/rollout`,
  `codex-rs/protocol/src/protocol.rs`); learn.chatgpt.com/docs/auth and
  the config reference.
- Antigravity: antigravity.google/docs/cli/headless,
  github.com/google-antigravity/antigravity-cli, and
  developers.googleblog.com, "Transitioning Gemini CLI to Antigravity
  CLI". Gemini CLI: github.com/google-gemini/gemini-cli, tag `v0.62.0`.
- OpenCode: opencode.ai/docs (server, providers, permissions, config,
  acp), github.com/anomalyco/opencode, tag `v1.18.34`.
- Cursor: cursor.com/docs/cli (parameters, output format,
  authentication, headless, acp, changelog).
- Grok Build: github.com/xai-org/grok-build, x.ai/news/grok-build-cli.
- Copilot: docs.github.com/en/copilot/reference/cli-command-reference.
- ACP: github.com/agentclientprotocol/agent-client-protocol,
  github.com/agentclientprotocol/registry.
- T3 Code: github.com/pingdotgg/t3code. Paseo: paseo.sh/docs. Emdash:
  emdash.com/docs/providers. Orca: onorca.dev/docs/settings.
