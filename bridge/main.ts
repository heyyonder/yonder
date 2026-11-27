// The Yonder bridge. It starts Claude Code workers, tracks them, and serves
// them as MCP tools at http://127.0.0.1:7787/mcp. The voice agent in the app
// is one MCP client; any other agent can connect the same way.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync, chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir, hostname, release, uptime, userInfo } from "node:os";
import { basename, delimiter, dirname, extname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { dlopen } from "bun:ffi";
import { clipboardFiles } from "./clipboard";
import { findMedia, keepPages, keepShown, type Media, serve, shown, uncut } from "./media";
import { logApproval, MAX_BYTES, openCanvas, parseElapsed } from "./canvas";
import { shot } from "./shot";
import { applyPending, exportSetup, keepBefore, KEY_FILES, moveBroken, parseSetup, planImport, readSafe, writeFiles, writeSafe } from "./backup";
import { buildVideo, recordScreen, stopRecording, VIDEOS } from "./recording";
import { dictate, hasParakeet } from "./dictate";
import { labelOf, setBridgePort, startPreview, type Site } from "./preview";
import { startRemote } from "./remote";
import { startUploads } from "./upload";
import { computerName, connectRelay, deviceId, LAN_PORT, type Peer, qrCode, qrText, RELAY_MARK } from "./relay";
import { choosePort, cookie, DEFAULT_PORT, lockHolder, mineListens, newToken, portFree, sameToken, sameUser, savedPort } from "./peer";
import { unb64 } from "../src/link";
import { inTab, itemIn, itemOf, REF, runWith, siteFits, startVault, type Values } from "./vault";
import { elevenToken, speak } from "./eleven";
import { appTool, brainRoute, hangUp, startBrain } from "./brain";
import { addedCli, CLIS, type Found, grokLimits, inspect, locate, run, sessionOf, steps as runSteps, type Turn as CliTurn } from "./clis";
import { installTool, toolsInfo } from "./tools";
import { answer, install as installRun, loginOf, logins, type SignIn, signedOut, signIn, stopLogin } from "./logins";
import { type Added, BUILT_IN, install, registry } from "./registry";
import { acpHost } from "./acp";
import { designPrompt, eventPrompt, fullWake, nextRun, outputLines, remindAt, retryOf, signed, timingText, type Timing } from "./schedule";
import { keepOpen } from "./keep-open";
import { handoffText } from "./handoff";
import { check as checkScreen, DEFAULT as DEFAULT_SCREEN, fork as forkScreen, refreshRules, importScreen, lastError, list as listScreens, rename as renameScreen, markBad, remove as removeScreen, read as readScreen, SAMPLES as SCREEN_SAMPLES, starter, take as takeScreen, tryPage, versions as screenVersions, watch as watchScreens, type Look } from "./ui";
import { syncer } from "./sync";
import * as People from "./people";
import { check as checkLink, parse as parseLink, prune as pruneNonces } from "./link";
import { type AgentName, callName, type Naming, prOf, stripNoun, swap, voiceRef } from "../src/names";
// The compiled bridge of a downloaded app carries a copy of the README for about_yonder. CLAUDE.md and the wiki stay out
// of the public download, because they name the owner, the city and the servers. From source, the bridge reads them.
import README from "../README.md" with { type: "file" };
// The icon of Yonder, for the ~/Yonder project (homeProject), which is an empty folder with no icon of its own.
import YONDER_ICON from "../public/favicon.svg" with { type: "file" };
// The schema of the Settings (/settings): the phone draws each row from it.
import { SCHEMA as SETTINGS_SCHEMA, SECTIONS as SETTING_SECTIONS } from "./settings/index";
// The skill for each agent that builds a screen: in ~/.claude/skills/ and at /ui?guide, also in a compiled bridge.
import { GUIDE as SCREEN_GUIDE, installSkill } from "./skill";
import { installMod } from "./mod";
import DEFAULT_TALK from "./talk.md" with { type: "file" };
import SETUP_GUIDE from "./setup-guide.md" with { type: "text" };
import { commitOf, IOS_APP, iosNativeChanged, version } from "../version";
import UPDATES from "../channel.json";
import { accept } from "../updates/pick";

const HOME = homedir();
// A check bridge: YONDER_PORT names another port. It gets its own folder, so it has no state, .env, relay token or
// preview of the live bridge. Else a check bridge uses the live folder, takes the phone relay, and the live bridge stops.
const TEST = !!Number(process.env.YONDER_PORT) && Number(process.env.YONDER_PORT) !== DEFAULT_PORT;
const CONFIG = join(HOME, TEST ? `.config/yonder-${process.env.YONDER_PORT}` : ".config/yonder");
// The live bridge takes `port` of config.json, 7787 by default. When another OS user of this computer holds that port,
// it takes the next free port and saves it in config.json (bridge/peer.ts). When a program of this user holds it, or
// bridge.pid names a bridge that runs, a bridge runs already. Two bridges on one folder fight over the relay,
// and the port alone is no lock, because a user can edit `port`. A restart starts the new bridge while the old one still
// stops, so this one waits up to 5 seconds, and then stops before it joins the relay.
const LOCK = join(CONFIG, "bridge.pid");
const PORT = TEST ? Number(process.env.YONDER_PORT) : livePort();
function livePort() {
  for (let i = 0; i < 25; i++, Bun.sleepSync(200)) {
    const holder = lockHolder(LOCK);
    const port = holder ? undefined : choosePort(savedPort(join(CONFIG, "config.json")), portFree, mineListens);
    if (port) {
      mkdirSync(CONFIG, { recursive: true, mode: 0o700 });
      writeFileSync(LOCK, String(process.pid));
      return port;
    }
    if (i === 24) console.error(holder ? `The bridge ${holder} of this folder runs already. This bridge stops.` : `Port ${savedPort(join(CONFIG, "config.json"))} is in use by a program of this user, so a bridge runs already. This bridge stops.`);
  }
  process.exit(1);
}
setBridgePort(PORT);
const STATE = join(CONFIG, "state.json");
// The runs of the schedules that ended well, one JSON line each (settle).
const RUNS_LOG = join(CONFIG, "schedule-runs.jsonl");
keepShown(join(CONFIG, "shown.txt"));
// The apps of the Canvas tab (bridge/canvas.ts). A chat shows each one where its agent made it, as a picture.
const canvas = openCanvas(join(CONFIG, "canvas"));
keepPages(join(CONFIG, "canvas"));
// The Linux install (omarchy/install.sh) puts dist/ next to the compiled bridge, and its service gives that folder.
const ROOT = process.env.YONDER_ROOT ?? resolve(import.meta.dir, "..");
// Linux is Omarchy, another Linux desktop or a server (docs/omarchy.md): xdg-open, wl-copy or xclip, and systemd in place
// of open, pbcopy and launchd.
// Windows (windows/install.ps1): explorer, Set-Clipboard and the loop of `yonder serve` in place of the service.
const LINUX = process.platform === "linux";
const WINDOWS = process.platform === "win32";
const MAC = process.platform === "darwin";
// Windows names the variable "Path". The bridge reads and sets PATH for its child processes, and two names would give a
// child two values, so it gets the one name. Windows reads the names of variables with no case.
if (WINDOWS) {
  const path = process.env.PATH ?? process.env.Path ?? "";
  delete process.env.Path;
  process.env.PATH = path;
}
const OPEN = LINUX ? "xdg-open" : WINDOWS ? "explorer" : "open";
// The clipboard of Linux: wl-copy on Wayland, else xclip or xsel on X11. The installer names the package that is missing.
const linuxCopy = () =>
  process.env.WAYLAND_DISPLAY && Bun.which("wl-copy") ? ["wl-copy"]
  : Bun.which("xclip") ? ["xclip", "-selection", "clipboard"]
  : Bun.which("xsel") ? ["xsel", "--clipboard", "--input"]
  : ["wl-copy"];
// Puts text on the clipboard. On Windows the text goes in a variable of the environment, which keeps each character:
// clip.exe reads its input in the code page of the console.
const copy = async (text: string) => {
  const cmd = LINUX ? linuxCopy() : ["pbcopy"];
  const p = WINDOWS
    ? Bun.spawn(["powershell", "-NoProfile", "-Command", "Set-Clipboard -Value $env:YONDER_COPY"], { env: { ...process.env, YONDER_COPY: text } })
    : Bun.spawn(cmd, { stdin: new Blob([text]) });
  if (await p.exited) throw new Error(`${WINDOWS ? "Set-Clipboard" : cmd[0]} failed.`);
};
// False in the compiled bridge of a downloaded app (src-tauri/release.ts). That Mac has no repository, so there is no
// git, no dist/, no rebuild and no update over the air.
const SOURCE = existsSync(join(ROOT, ".git"));
// While this file exists, the app starts a call at launch, then deletes it.
// Omarchy keeps the projects in ~/Work, so a new project goes there. Windows does the same.
const ROOTS = [...(MAC ? [] : [join(HOME, "Work")]), join(HOME, "Sites"), join(HOME, "Developer")];
const CLAUDE = Bun.which("claude") ?? join(HOME, WINDOWS ? ".local/bin/claude.exe" : ".local/bin/claude");
const SUMMARIZER = join(CONFIG, "summarizer");
mkdirSync(SUMMARIZER, { recursive: true });
// One quick step in the Chrome of the user, for the browser tool. browser-harness runs this Python with its
// helpers, and it prints one JSON line. read uses a side session (js with target_id), so it does not move the
// tab that browser-harness controls for an agent. The tab that browser-harness controls has 🐴 in its title.
const BROWSER = `
import json, os
a = json.loads(os.environ["YONDER_BROWSER"])
def clean(t): return {"title": t["title"].removeprefix("🐴 "), "url": t["url"]}
try:
    tabs = list_tabs(False)
    if a["action"] == "open":
        activate_tab(cdp("Target.createTarget", url=a["url"])["targetId"])
        out = {"opened": a["url"]}
    elif a["action"] == "tabs":
        out = {"tabs": [clean(t) for t in tabs]}
    else:
        t = next((t for t in tabs if t["url"] == a["front"]), tabs[0] if tabs else None)
        if not t: raise RuntimeError("Chrome has no open tab.")
        text = js("document.body.innerText", target_id=t["targetId"]) or ""
        out = {**clean(t), "text": "\\n".join(l.strip() for l in text.splitlines() if l.strip())[:3000]}
except Exception as e:
    out = {"error": str(e)}
print(json.dumps(out))
`;
// The app window in production and in development. A request from any other
// web page is refused, so that a web site cannot start workers on this Mac.
// YONDER_TEST_ORIGIN: the page of a check on another port (bridge/vault-e2e.ts), only on a test bridge. The dev server
// (localhost:1420) counts only for the source copy, because any program can serve a page on that port.
const ORIGINS = ["tauri://localhost", ...(SOURCE ? ["http://localhost:1420"] : []), `http://127.0.0.1:${PORT}`, ...(process.env.YONDER_TEST_ORIGIN && TEST ? [process.env.YONDER_TEST_ORIGIN] : [])];
const SPOKEN =
  "The user talks to you through Yonder, their voice app for Claude Code. When the user says \"Yonder\", they mean that app. " +
  (SOURCE ? `Its source code is in ${ROOT}. ` : "") +
  "Yonder, the voice assistant, reads your final message aloud to the user, who does not look at the screen. " +
  "End your final message with one or two short plain sentences, 30 words or less in total: what you did. " +
  "Do not put code, file paths or lists in those sentences. " +
  "Yonder shows pictures, videos, sounds and PDFs in the conversation of the agent: each media URL or full file path that a message names. " +
  "To make media with Visual Sandbox, use the vsb CLI. Put the URL of each picture, video or sound that you make (for vsb, its cdn.visualsandbox.com URL) " +
  "or the full path of its file in your final message, before the last sentences. Name each one once: its URL or its path, not both. " +
  "Put a path that has a space in backticks, or the chat cuts it at the space. " +
  "Do not open media in Preview or another app, and do not ask where to save it, unless the user asks. " +
  "Put each link or artifact that you make in your final message. The user sees it in the chat. " +
  "When your work changes what a page, a screen or an app looks like, take a screenshot of the result when the work is done, " +
  "and put the full path of the PNG file in your final message, before the last sentences. " +
  "For a web page, use headless Chrome, not the browser of the user. Skip the screenshot only when the work changes nothing that the user can see. " +
  // The chat shows a page of the Canvas as a card that opens it, and a screenshot cannot open it.
  "For a page that you show with show_app, put the path that show_app gives in your final message in place of a screenshot, before the last sentences. " +
  "The chat then shows the page there as a card that opens it. " +
  "When the task is done, say that it is done and stop. Do not offer next steps, and do not ask to rebuild, reinstall or restart anything. " +
  "Do not rebuild, reinstall or restart Yonder or any other app yourself unless the user asks for it in this task. " +
  // A restart of the bridge only pauses the connection, and the app and the workers keep running.
  (SOURCE ? `The one exception: when you change the bridge of Yonder (${join(ROOT, "bridge")}), call restart_bridge yourself when the work is committed. ` : "") +
  "When you start a dev server for the user to see, start it in a new session, so it keeps running after you stop. The Mac has no setsid command: use Python os.setsid. Name its URL, such as http://localhost:5173, in your final message. " +
  "Yonder then shows it to the user on any device. " +
  "Ask a question only if you cannot go on without an answer, and then end with that question. " +
  // Else an agent takes a word that speech to text wrote wrong, and says that it cannot do a task that it can do.
  "The user speaks, and speech to text can write a word wrong, such as `ancient` for `agent` or `effort`. " +
  "Read each message for what the user most likely means, and do that. Ask only when two meanings are equally likely. " +
  // With Steer, a new message stops the turn (resume), and Claude Code writes "No response requested." as the reply of
  // that turn. Else an agent takes the line as its own and says sorry for it.
  "When a new message of the user stops your turn, Claude Code writes \"No response requested.\" as your reply. " +
  "You did not write it. Do not name it or say sorry for it: do the task. " +
  // 1Password for the agents (docs/secrets.md): `op` asks for Touch ID on the Mac, and the user is often away.
  "For a login, a password or a key from 1Password, call use_secret of Yonder, not `op`: the user approves it on the phone or in Yonder on the Mac, " +
  "and `op` waits for the user at the Mac. " +
  // Payments (docs/canvas.md): the sheet opens the page of Stripe or Link, and the user pays there, so an agent never pays.
  "To pay, such as a top-up of Visual Sandbox (`vsb topup`), call ask_user of Yonder with kind pay and the link of the payment page. Never pay yourself. " +
  "Before you say that you cannot do a thing, look at the tools of Yonder (the yonder MCP server). They can do much for you.";
// Unless the caller asks for a model or an effort, Clef picks them from the task, inside the Model and Effort ranges of
// the Settings (pick). MODEL is the fallback when Clef fails and the range allows it.
const MODEL = "claude-opus-5-5";
// The latest model of each family. Update this list when a new model comes out.
const LATEST: Record<string, string> = {
  opus: MODEL,
  fable: "claude-fable-5-2",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
};
// The aliases of LATEST in order of power and cost, for the Model range of the Settings.
const TIERS = ["haiku", "sonnet", "opus", "fable"];
const MAX_RUNNING = 25; // Yonder starts no more workers while this many run.
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
// The permission modes of Claude Code that a worker can run in. Bypass skips each question but a few, such as an rm of the
// working folder, and those wait for Allow or Deny in the app (ASK). Auto lets a classifier
// approve the safe actions. Accept edits allows the edits, but a command waits for Allow or Deny in the app (ASK). Plan
// only plans. A background worker has no one to answer a question, so the
// modes that ask about each action (manual, dontAsk) are not here.
const MODES = ["bypassPermissions", "auto", "acceptEdits", "plan"] as const;
const ICONS = ["", "public/", "static/", "app/", "src/app/", "src/", "assets/"].flatMap((dir) =>
  ["favicon.svg", "favicon.png", "favicon.ico", "icon.svg", "icon.png", "apple-touch-icon.png"].map((file) => dir + file),
);
// The icon search does not go into these folders. It also skips folders whose names start with a dot.
const HEAVY = new Set(["node_modules", "dist", "build", "out", "target", "vendor", "venv", "coverage", "__pycache__", "Pods", "DerivedData"]);

// "waiting" means that the agent finished its turn with a question for the user.
type Status = "running" | "waiting" | "done" | "failed" | "closed";
type Worker = {
  id: string;
  num: number; // The user can say "agent 3".
  sessionId: string;
  name: string;
  project: string; // The name of its workspace when it started or moved. The key stays `project` for the old apps.
  workspace?: string; // The id of its workspace (config.json `workspaces`). None: the group of its folder.
  path: string; // The folder that it works in.
  task: string;
  status: Status;
  activity: string;
  // A running agent that waits on its background tasks (monitoringOf): "only" when its turn ended, "also" when its turn
  // runs beside them. No value: the turn runs with no background task, or the agent does not run.
  monitoring?: "only" | "also";
  result: string;
  unread: boolean; // The user has not read the last result: the blue dot.
  attention?: boolean; // Clef says that the result needs the user: the purple dot. It stays after a read.
  answered?: boolean; // Clef says that the user asked a question and the agent answered it: the purple circle on the Completed tab.
  // The user set the status by hand: completed (done), or stopped its turn (waiting). It stays until its session works again.
  marked?: boolean;
  // The voice agent asked that the agent closes when its turn ends ("deploy it and close"), unless something came up (closeItself).
  closeWhenDone?: boolean;
  // The start gave the name (start_worker, a schedule), so the agent keeps it: no rename by the agent, the title model or the PR.
  // The agent that started it already picked the name that it wanted.
  ownName?: boolean;
  // The ID of a new agent before its session started (showStarting). The --mcp-config of the session keeps it in its
  // address for all turns, so the tools of the agent, such as use_secret, find the agent by it too (byCaller).
  startId?: string;
  // The agent called with the key that proves its ID (mcpUrl, callerOf), so a call with its ID and no key is forged.
  keyed?: boolean;
  closedItself?: boolean; // The bridge closed the agent for closeWhenDone: its row says "Closed itself". A new turn clears it.
  // Who closed the agent with close_worker: "you" (the app window or a phone), "voice" (the voice agent or the Claude call),
  // the number of the agent that closed it, or "mcp" (another MCP client, such as the Claude app). No value: it closed
  // itself, or its session ended. A new turn clears it.
  closedBy?: "you" | "voice" | "mcp" | number;
  // The picture of the agent in a screen that draws one, such as Grok Bot: the name of a shape of that screen and a
  // color. The bridge only keeps it.
  avatar?: Avatar;
  // The user saved the agent for later: it shows on the Saved tab while it runs and when it is done, until a close or an unsave.
  // A new turn or a complete does not take it off the tab.
  saved?: boolean;
  startedAt: number; // The start of the last turn.
  createdAt?: number; // The start of the first turn: the app shows how long ago the agent started.
  updatedAt: number;
  // Set for a Claude Code session that Yonder did not start. Yonder can read
  // it, but it cannot send it messages or stop it.
  kind?: "terminal" | "background";
  // Tokens in the context now, and the size of the window when Claude Code reports it.
  context?: { used: number; window?: number };
  pid?: number; // The process of a terminal session, of a turn in another CLI, or of a worker of an older bridge, so that Yonder can end it.
  // The CLI of the agent, a key of CLIS in clis.ts, such as "codex". No value means Claude Code.
  cli?: string;
  profile?: string; // The ID of the profile of the agent (Profile), which gives its CLI its flags, variables and folder.
  // The person who started the agent, an id of `people` in config.json (docs/multi-user.md). No value: the main person.
  owner?: string;
  // The logs of the turns of an agent in another CLI, oldest first: each path without its .jsonl, .err or .txt (the prompt).
  runs?: string[];
  // The session this agent left when a profile moved it to another CLI. The next message copies that conversation into
  // the new CLI, then this field goes. A failed message puts the old session back.
  carry?: { cli?: string; sessionId: string; runs?: string[]; profile?: string };
  effort?: (typeof EFFORTS)[number];
  model?: string;
  mode?: (typeof MODES)[number];
  planned?: boolean; // A Claude Code agent in Plan mode showed its plan (ExitPlanMode), so the next message approves it.
  agent?: string; // A Claude Code agent (`--agent`), from .claude/agents of the project or of the user.
  queue?: string[]; // Messages that the worker gets as its next turn when its turn ends.
  // The earlier sessions of the worker. Each message starts a new background session, and
  // Claude Code keeps the old one in its agent view, so remove_worker deletes them all.
  past?: string[];
  cwd?: string; // The folder of the agent now, when it moved, for example into a git worktree.
  // Set for a sub-agent that an agent started with the Agent tool: the id of that agent, and the letter after its number (21B).
  parent?: string;
  letter?: string;
  // A question that waits for the user: a tool call that waits for Allow or Deny (the PermissionRequest hook below), with the
  // tool and its command, file or address, or an approval of ask_user with its kind (docs/canvas.md). 1Password asks with
  // the kind `secret` and its `seals` (bridge/vault.ts). `until` is the time when it expires.
  ask?: Ask;
  // The device of the call that started the agent with build_app: its artifact opens there.
  showOn?: string;
  schedule?: string; // The ID of the schedule that started the agent (Schedule).
  tries?: number; // The retries of a run of a schedule so far (settle).
};
type Ask = {
  id: string;
  tool: string;
  text: string;
  kind?: "yes-no" | "code" | "choice" | "pay" | "terms" | "secret";
  title?: string;
  rows?: [string, string][];
  amount?: string;
  choices?: string[];
  link?: string;
  faceId?: boolean;
  // A yes from the Mac counts after Touch ID or the password of the Mac, which the bridge asks itself (ownerCheck).
  touchId?: boolean;
  until?: number;
  seals?: Record<string, string>;
};
type Avatar = { shape: string; color: string };
// A workspace, the one group of agents (config.json `workspaces`, docs/wiki/workspaces.md). The code keeps the old
// name Project. `path` is its folder, or, with `home` false, the folder where its new agents start (noFolder).
// `id` is missing for a folder that is no workspace: a scanned folder or a path that a call gives.
type Project = { id?: string; name: string; path: string; starred: boolean; pinned?: boolean; home?: false; description?: string; profile?: string };
// A recurring agent: at each start, the bridge starts a worker with the task in the project, as start_worker does. It
// is for agents that must run on this computer, with its CLIs and logins. `next` is the time of the next start.
// `missed` is the last start that did not happen, and why.
// `retries` is how many times a run that fails or is not done continues (settle), 2 when it is not set. A trigger is a
// schedule with `event` (what starts it, in words) in place of a timing. Claude Code sets it up (the design action):
// a `script`, whose each new line of output starts it (pollScript), or a `hook`, a web request to its address (hookAt).
// Its `next` is 0.
type Schedule = Timing & {
  id: string;
  name: string;
  project: string;
  task: string;
  cli?: string;
  model?: string;
  effort?: (typeof EFFORTS)[number];
  mode?: (typeof MODES)[number];
  paused?: boolean;
  // The id of a profile (Profile). Each start runs as that profile: its CLI, its sign-in and its settings.
  // No profile: the start uses `cli`, or the CLI row of the Agents tab when `cli` is not set.
  profile?: string;
  next: number;
  createdAt: number;
  missed?: { at: number; why: string };
  retries?: number;
  // A trigger: what starts it, in the words of the user, such as "a new error in Sentry for yonder".
  event?: string;
  // A webhook trigger: the signing secret of the service. With it, the trigger takes only signed requests (signed).
  secret?: string;
  // A script trigger: the hashes of the lines that its first run found or that started an agent. None: the next run
  // notes its lines.
  seen?: string[];
  // The person who saved the schedule (`people` in config.json). Its agents get this owner.
  owner?: string;
};

// A reminder (the remind tool): a text that comes to the phones as a push at `at` (ms). It starts no agent.
type Reminder = { id: string; text: string; at: number; tries?: number; owner?: string }; // owner: as Worker.owner

// Only this OS user reads the folder: it holds the prompts, the summaries, the calls and the pastes. mkdir sets the mode
// only for a new folder, so chmod also fixes a folder from before.
mkdirSync(CONFIG, { recursive: true, mode: 0o700 });
chmodSync(CONFIG, 0o700);
// The key files of an import with keys (importConfig) go in place before anything reads them.
applyPending(CONFIG);
// `windows` holds the context window of each model, as workers report it, so
// that sessions with the same model show their window too. `names` holds the
// names that the user gave to sessions that Yonder did not start, and
// `numbers` holds the number of each of those sessions. `stars` is an old key with the session IDs that the user starred.
// `avatars` holds the avatar of each of those sessions (Worker.avatar).
// `summaries` holds the summary of each session, and the hash of the last answer that it sums up (`key`).
const state: {
  workers: Worker[];
  starred: string[];
  stars: string[];
  extra: string[];
  hidden: string[];
  scan: boolean;
  windows: Record<string, number>;
  names: Record<string, string>;
  avatars: Record<string, Avatar>;
  numbers: Record<string, number>;
  summaries: Record<string, { key: string; text: string; next?: string; spoken?: string; walkie?: string }>;
  preview: boolean; // The Tunnel row of the Settings. Off: no previews, also not on the Mac.
  models: string[]; // The Model range of the Settings: the least and the most powerful alias of TIERS that Clef can pick. Equal ends: that model.
  defaultModel: string; // The Default row of the Settings: "auto" (Clef picks in the Model range) or the alias of TIERS that each new worker that names no model gets.
  efforts: (typeof EFFORTS)[number][]; // The Effort range of the Settings: the lowest and the highest effort of EFFORTS that Clef can pick.
  approved: string[]; // The projects that the user let Yonder open through the tunnel of the edge.
  mode: (typeof MODES)[number]; // The Permissions row of the Settings for each new worker that names no mode. Never plan.
  sumUp: boolean; // The Summaries row of the Settings. Off: Haiku writes no new summaries, and the app shows no Summary tab.
  steer: boolean; // The Steer row of the Settings. On: a message to a running worker never waits in the queue of the bridge (message_worker).
  agentName: AgentName; // The word of the user for an agent and the icon of the Agents tab, such as "bot" (src/names.ts).
  agentNaming: Naming; // How Yonder calls each agent: "numbers" ("Bot 2"), "names" ("Jack") or "projects" ("Sundial").
  cli: string; // The CLI row of the Agents tab: the CLI of each new agent that names none. "claude" is Claude Code.
  // The rows of each other CLI in the Agents tab: its switch (no value: on when it starts and is signed in), and the model,
  // the effort and the permission mode of its new agents (no value: the default of the CLI, Clef, and the Permissions row).
  clis: Record<string, { on?: boolean; model?: string; effort?: string; mode?: string; autoUpdate?: boolean }>;
  profiles: Profile[]; // The profiles of the Agents tab, in the order of adding.
  projectProfiles: Record<string, string>; // The default profile of each project: the profile id, by project path (set_project_profile).
  added?: Added[]; // The agents that the user added from the ACP registry (registry.ts), in the order of adding.
  abouts?: Record<string, string>; // The descriptions that describe_project saved, by project path. They come before the files in aboutOf.
  schedules: Schedule[];
  reminders: Reminder[];
  linkNonces?: Record<string, number>; // The nonces of the new task links that started a task, with the time of the start (bridge/link.ts).
  workspacesMigrated?: number; // The time when the projects became config.json `workspaces` (migrateWorkspaces). It runs once.
} = {
  workers: [],
  starred: [],
  stars: [],
  extra: [],
  hidden: [],
  // A new install lists only the folders that the user adds. An install that has a state.json already also lists each folder in ROOTS.
  scan: existsSync(STATE),
  windows: {},
  names: {},
  avatars: {},
  numbers: {},
  summaries: {},
  preview: true,
  models: ["haiku", "fable"],
  defaultModel: "auto",
  efforts: ["low", "max"],
  approved: [],
  mode: "bypassPermissions",
  sumUp: true,
  steer: false,
  agentName: { one: "agent", many: "agents" },
  agentNaming: "numbers",
  cli: "claude",
  clis: {},
  schedules: [],
  reminders: [],
  // A broken state.json, such as one that a crash cut short, moves aside, and its .bak applies (bridge/backup.ts).
  ...(readSafe(STATE).data ?? {}),
};
// An old state.json has one Agent model (`model`): an alias becomes a range of one model.
{
  const old = (state as { model?: string }).model;
  if (old && old in LATEST) state.models = [old, old];
  delete (state as { model?: string }).model;
}
// An old state.json keeps the short texts of the Texts tab, which is gone.
delete (state as { texts?: unknown }).texts;
// An old bug left agents with their Starting ID ("new1"), so several agents had one ID, and a click on one opened
// another. Each such agent gets its own ID.
for (const w of state.workers) if (/^new\d+$/.test(w.id)) w.id = !w.cli && w.sessionId && !state.workers.some((x) => x.id === w.sessionId.slice(0, 6)) ? w.sessionId.slice(0, 6) : newId();
// The value of `list` nearest to `value` inside the range [lo, hi] of the Settings.
const clamp = <T extends string>(list: readonly T[], [lo, hi]: T[], value: string) =>
  list[Math.min(Math.max(list.indexOf(value as T), list.indexOf(lo)), list.indexOf(hi))];
// config.json holds the settings of the Settings tab and the settings that the user or a Claude Code agent writes by
// hand, so that an agent can change any of them. The bridge reads the file again when it changes, so an edit needs no
// restart, and a hand edit that does not pass the check of its key is left out.
// `defaultFolder`: the folder of a new agent whose task names no project, such as "~/notes".
// `agentName`: the word of the user for an agent, such as { "one": "bot", "many": "bots", "icon": "<svg …>" }, for the
// screen, the voice and the descriptions of the tools (src/names.ts).
// `agentNaming`: how Yonder calls each agent on the screen, in the voice and in the pushes: "numbers" ("Bot 2"), "names"
// ("Jack") or "projects" ("Sundial"). The number stays the ID of the tools.
// The keys of SETTINGS stay `state.preview` and so on in the code: accessors that are not enumerable read and write
// config.json, so they are not in state.json.
const CONFIG_FILE = join(CONFIG, "config.json");
// The screens of the user (bridge/ui.ts), and the screen in use: `ui` in phone.json, which the phones sync.
const SCREENS = join(CONFIG, "ui");
installSkill(HOME);
// Yonder's own mod (bridge/mod.ts): each Claude Code worker loads it, and it posts what the mods of the agent show to
// /mods, by session ID, with the time of the post. The mod posts each 30 seconds, so an older drawing is of a session
// that ended.
const MOD = installMod(join(CONFIG, "mod"));
const mods = new Map<string, { at: number; band?: unknown; panes: unknown[]; status: string[]; toasts: { at: number }[] }>();
refreshRules(SCREENS);
const PHONE_FILE = join(CONFIG, "phone.json");
const screenInUse = (): string => {
  try {
    return JSON.parse(readFileSync(PHONE_FILE, "utf8")).ui || DEFAULT_SCREEN;
  } catch {
    return DEFAULT_SCREEN;
  }
};
// A screen with its own theme brings it, as a pick on the phone does (src/look.ts). A screen of the user goes in with
// its version, "my-chat@2", so that a new version changes phone.json and reaches the phone: a second `use` of
// "my-chat" after a new version left the file as it was, and the phone kept the old version.
const setScreen = (id: string) => {
  const [name, n] = id.split("@");
  const one = SCREEN_SAMPLES[name] ? undefined : readScreen(SCREENS, name, Number(n) || undefined);
  const look = one?.look ?? SCREEN_SAMPLES[name]();
  editJson(PHONE_FILE, (c) => {
    if (id === DEFAULT_SCREEN) delete c.ui;
    else c.ui = one ? `${name}@${one.n}` : id;
  });
};
// The Chat sample is gone: phone.json set to it goes back to the default.
if (screenInUse() === "chat" && !existsSync(join(SCREENS, "chat"))) setScreen(DEFAULT_SCREEN);
// Deletes a screen of the user. The phones go back to the default first when it is in use.
const deleteScreen = (name: string) => {
  if (screenInUse().split("@")[0] === name) setScreen(DEFAULT_SCREEN);
  removeScreen(SCREENS, name);
};
const buildTask = (name: string, words: string) =>
  `Build a screen for the Yonder app on the phone of the user, in this folder (the screen "${name}"). The user said: "${words}". ` +
  `Use the skill yonder-screens first. Then change screen.json and index.html (the sample to start from is in them), check and test the new version as the skill says, and call the customize tool of Yonder with use and "${name}".`;
const changeTask = (name: string, words: string) =>
  `Change the screen "${name}" of the Yonder app on the phone of the user, in this folder. The user said: "${words}". ` +
  `Use the skill yonder-screens first. Change only what the user asked, and keep the rest. Check and test the new version as the skill says, and call the customize tool of Yonder with use and "${name}".`;
// The guide for the agent that sets up Yonder (bridge/setup-guide.md), at /setup-guide with the address of this bridge.
// It is for each CLI, so it is no skill of Claude Code: the agent reads it with curl. The last step of the first run
// starts an agent with setupTask (POST /setup-agent), on the CLI that the user picked there. A user can give the same
// sentence to an agent in a terminal. The agent sets up the config, the look and the rest, in any CLI.
const setupGuide = () => SETUP_GUIDE.replaceAll("{bridge}", `http://127.0.0.1:${PORT}`);
const setupTask = () => `Set up Yonder for me. First read the guide with \`curl -s http://127.0.0.1:${PORT}/setup-guide\`. Then follow it step by step.`;
// Builds a new screen from the words of the user: Build your own on the phone, and customize with new by voice.
async function newScreen(words: string, from = "dashboard") {
  const { name, dir } = starter(SCREENS, words, from);
  const w = await startWorker({ project: dir, task: buildTask(name, words), name: "Screen builder" });
  return { name, worker: w.id, num: w.num };
}
// A new version of a source folder (bridge/ui.ts) shows at once on the phones when its screen is in use. Each bridge
// watches the ui/ folder of its own config folder, so a test bridge on another port (bridge/screens-e2e.ts) makes its
// versions too.
setInterval(
  () =>
    void watchScreens(SCREENS, (name) => {
      if (screenInUse().split("@")[0] === name) setScreen(name);
    }).catch((e) => console.error(`Yonder screens: ${(e as Error).message}`)),
  3000,
);
const range = (list: readonly string[], r: unknown) =>
  Array.isArray(r) && r.length === 2 && r.every((v) => list.includes(v)) && list.indexOf(r[0]) <= list.indexOf(r[1]);
const isBool = (v: unknown) => typeof v === "boolean";
const SETTINGS: Record<string, { fallback: unknown; ok: (v: any) => boolean }> = {
  preview: { fallback: true, ok: isBool },
  models: { fallback: ["haiku", "fable"], ok: (v) => range(TIERS, v) },
  defaultModel: { fallback: "auto", ok: (v) => v === "auto" || TIERS.includes(v) },
  efforts: { fallback: ["low", "max"], ok: (v) => range(EFFORTS, v) },
  mode: { fallback: "bypassPermissions", ok: (v) => MODES.includes(v) && v !== "plan" },
  sumUp: { fallback: true, ok: isBool },
  steer: { fallback: false, ok: isBool },
  agentName: {
    fallback: { one: "agent", many: "agents" },
    ok: (v) => !!v && typeof v === "object" && [v.one, v.many].every((w) => typeof w === "string" && !!w.trim()) && (v.icon === undefined || typeof v.icon === "string"),
  },
  agentNaming: { fallback: "numbers", ok: (v) => ["numbers", "names", "projects"].includes(v) },
  cli: { fallback: "claude", ok: (v) => typeof v === "string" && !!v },
  clis: { fallback: {}, ok: (v) => !!v && typeof v === "object" && !Array.isArray(v) },
  profiles: { fallback: [], ok: (v) => Array.isArray(v) && v.every((p) => typeof p?.id === "string" && typeof p.name === "string" && typeof p.cli === "string") },
  // The paths are of this computer, so the key does not sync, as `cli`.
  projectProfiles: { fallback: {}, ok: (v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((id) => typeof id === "string") },
};
// The schema of the Settings (bridge/settings/, one file for each section, docs/screen-api.md), with the settings that the user adds in
// ~/.config/yonder/settings.json. The phone draws each section from it, and /settings writes a value to config.json, so a
// new setting is one entry, with no new build of the app. A `custom` control is a named part of the app, such as the
// sign-in of 1Password.
type Setting = { key: string; label: string; section: string; control: string; type?: string; default?: unknown; store?: "config" | "phone" | "claude"; on?: unknown; sync?: boolean; help?: string; options?: { value: string }[]; min?: number; max?: number };
const settingsSchema = (): Setting[] => {
  let own: Setting[] = [];
  try {
    own = JSON.parse(readFileSync(join(CONFIG, "settings.json"), "utf8"));
  } catch {}
  const ours = SETTINGS_SCHEMA as Setting[];
  const taken = new Set(ours.map((s) => s.key));
  return [...ours, ...(Array.isArray(own) ? own.filter((s) => s && typeof s.key === "string" && !taken.has(s.key) && s.label && s.section && s.control) : [])];
};
// True when a value fits the type of its setting, and the check of SETTINGS for a key that the bridge uses.
const fitsSetting = (s: Setting, v: any) => {
  // A key with no type, such as agentName, uses the check in SETTINGS.
  const typed = s.type === "boolean" ? typeof v === "boolean"
    : s.type === "number" ? typeof v === "number" && Number.isFinite(v) && !(v < (s.min ?? -Infinity)) && !(v > (s.max ?? Infinity))
    : s.type === "enum" ? !!s.options?.some((o) => o.value === v)
    : s.type === "list" ? Array.isArray(v) && v.every((x) => typeof x === "string")
    : s.type === "string" ? typeof v === "string"
    : !s.type && !!SETTINGS[s.key]?.ok(v);
  return typed && (!SETTINGS[s.key] || SETTINGS[s.key].ok(v));
};
let configCache = { mtime: -1, text: "", data: {} as Record<string, any>, bad: false };
function config(): Record<string, any> & { defaultFolder?: string } {
  let mtime = 0;
  try {
    mtime = statSync(CONFIG_FILE).mtimeMs;
  } catch {}
  if (mtime === configCache.mtime) return configCache.data;
  try {
    const text = mtime ? readFileSync(CONFIG_FILE, "utf8") : "";
    configCache = { mtime, text, data: text.trim() ? JSON.parse(text) : {}, bad: false };
    for (const [key, { ok }] of Object.entries(SETTINGS))
      if (key in configCache.data && !ok(configCache.data[key])) {
        console.error(`The ${key} of ${CONFIG_FILE} is not valid, so the default applies: ${JSON.stringify(configCache.data[key])}.`);
        delete configCache.data[key];
      }
  } catch (e) {
    // A file that is not valid JSON keeps the last good settings, and the bridge does not write over it, until it is valid again.
    console.error(`Cannot read ${CONFIG_FILE}: ${(e as Error).message}`);
    // At the start there are no last good settings, so the copy of the last save applies (bridge/backup.ts).
    let data = configCache.data;
    if (configCache.mtime === -1)
      try {
        data = JSON.parse(readFileSync(`${CONFIG_FILE}.bak`, "utf8"));
        console.error(`The bridge uses ${CONFIG_FILE}.bak until ${CONFIG_FILE} is valid again.`);
      } catch {}
    configCache = { ...configCache, data, mtime, bad: true };
  }
  return configCache.data;
}
// A key that config.json does not have comes from state.json of an older bridge, or else its default.
// Each read gives the object in the cache, so a change in place, such as `state.clis[id].on = true`, is saved too.
for (const [key, { fallback, ok }] of Object.entries(SETTINGS)) {
  const old = (state as Record<string, unknown>)[key];
  delete (state as Record<string, unknown>)[key];
  if (!(key in config())) config()[key] = ok(old) ? old : structuredClone(fallback);
  Object.defineProperty(state, key, {
    enumerable: false,
    get: () => (key in config() ? config()[key] : (config()[key] = structuredClone(fallback))),
    set: (v) => void (config()[key] = v),
  });
}
// `port`: the port of this bridge, which the Mac app, the watchdog and the tools read. `token`: the secret of this
// bridge (bridge/peer.ts). The user or an agent can edit both; a new port counts after a restart of the bridge.
if (config().port !== PORT) config().port = PORT;
if (typeof config().token !== "string" || (config().token as string).length < 16) config().token = newToken();
const bridgeToken = () => (typeof config().token === "string" ? (config().token as string) : "");
// The bridge writes config.json only when a setting changed. Both files go through a copy and a rename, so a reader
// never sees half a file, and the file before the save stays as .bak (writeSafe).
const save = () => {
  writeSafe(STATE, JSON.stringify(state, null, 2));
  const text = `${JSON.stringify(config(), null, 2)}\n`;
  if (configCache.bad || text === configCache.text) return;
  // Only the user can read it, because it can hold the keys of `trustedLinkSources` (bridge/link.ts).
  writeSafe(CONFIG_FILE, text);
  configCache = { ...configCache, mtime: statSync(CONFIG_FILE).mtimeMs, text };
};
save();

// The people of this environment (bridge/people.ts, docs/multi-user.md): `people` in config.json, which an agent edits, and
// which the bridge reads again at each request. It is not in SETTINGS, so the bridge never writes a default for one person,
// and a list that is not valid keeps the last good list in place of none: one bad edit does not move all tasks to one person.
let goodPeople: People.Person[] = [];
let badPeople = "";
// The person of the pick in the pairing window, for the next phone that pairs (POST /relay?person=).
let pairPick: { person: string; until: number } | undefined;
// The paired phones, as devices of people. `relay` is declared further down, so a call before its line gives no phones.
const pairedPhones = (): People.Device[] => {
  try {
    return relay?.status().phones.map((p) => ({ id: deviceId(p.pub), name: p.name })) ?? [];
  } catch {
    return [];
  }
};
function people(): People.Person[] {
  const v = config().people;
  if (v === undefined) return (goodPeople = []);
  if (!People.ok(v)) {
    const text = JSON.stringify(v);
    if (text !== badPeople) console.error(`The people of ${CONFIG_FILE} are not valid (docs/wiki/workers.md, People), so the last good people apply: ${text.slice(0, 300)}`);
    badPeople = text;
    return goodPeople;
  }
  badPeople = "";
  // A paired phone that the file does not list goes into it, so the file always shows each paired phone.
  const next = People.adopt(v, pairedPhones(), pairPick && pairPick.until > Date.now() ? pairPick.person : undefined);
  if (!next) return (goodPeople = v);
  pairPick = undefined;
  config().people = next;
  save();
  return (goodPeople = next);
}
// The person of a request: the person of its phone, the owner of the calling agent, or the person of the phone of the live
// call for the Claude brain. No people: no person, and Yonder works as for one person.
function personFor(device: string, caller = "", brain = "") {
  const list = people();
  if (!list.length) return undefined;
  const from = !device && caller ? byCaller(caller) : undefined;
  if (from) return People.ownerOf(list, from.owner);
  if (!device && brain && Date.now() < callUntil && callDevice) return People.personOf(list, callDevice);
  return People.personOf(list, device);
}
// The phones that get the answers of a task: the phones of its owner. Undefined: each phone, as for one person.
function phonesOf(owner?: string) {
  const list = people();
  if (!People.shared(list)) return undefined;
  return People.devicesOf(list, People.ownerOf(list, owner), pairedPhones().map((d) => d.id));
}
// The settings that follow the user to each device (bridge/sync.ts): each setting of the schema with "sync", as
// "<store>:<key>", and each screen of the user, as "screen:<name>". The screen in use (`ui`) goes with no version,
// because each computer numbers the versions of a screen in its own way. `sync` in config.json is the Sync switch of
// the Account settings, and it stays on each device.
// A broken phone.json gives its .bak (bridge/backup.ts), and the next save moves it aside.
const readPhone = (): Record<string, unknown> => readSafe(PHONE_FILE, console.error, false).data ?? {};
// The questions of the first run (src/Setup.tsx) are only for a new install: a computer that has a phone.json or agents
// already is marked as onboarded at each start.
if (!readPhone().onboarded && (existsSync(PHONE_FILE) || state.workers.length)) editJson(PHONE_FILE, (c) => void (c.onboarded = "on"));
// Full Disk Access of the bridge, for the folder step of the first run: the bridge and the agents in spare hosts have
// the grant of Yonder.app (the "Full Disk Access" bullet in docs/wiki/bridge.md). Without it, macOS refuses to
// list ~/Library/Safari, which each Mac has. (macOS 27 has no TCC database in the Library of the user.) null on Linux and
// Windows, which have no such step.
const diskAccess = () => {
  if (process.platform !== "darwin") return null;
  try {
    readdirSync(join(HOME, "Library/Safari"));
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT" ? null : false;
  }
};
// The export and the import of the setup (bridge/backup.ts, docs/wiki/projects.md "Backup"): Export and Import in the General
// settings, the tools export_config and import_config, and POST /setup-export and /setup-import. A user
// without a Yonder account keeps the setup, and an agent can apply an export with no clicks.
const setupNow = () => ({ config: config(), phone: readPhone(), state: state as Record<string, any> });
function exportConfig(path: string | undefined, keys: boolean) {
  const day = new Date().toISOString().slice(0, 10);
  const file = expand(path?.trim() || join(HOME, "Downloads", `yonder-setup-${keys ? "with-keys-" : ""}${day}.json`));
  const setup = exportSetup(CONFIG, setupNow(), keys);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(setup, null, 2)}\n`, { mode: 0o600 });
  return { path: file, keys, schedules: setup.state.schedules?.length ?? 0, files: Object.keys(setup.files) };
}
function importConfig(text: string, keys: boolean) {
  const setup = parseSetup(text);
  config();
  if (configCache.bad) throw new Error(`${CONFIG_FILE} is not valid JSON, so the import would write over it. Fix the file first.`);
  const now = Date.now();
  const plan = planImport(setup, setupNow(), keys, (k, v) => !SETTINGS[k] || SETTINGS[k].ok(v), (p) => {
    try {
      return readFileSync(join(CONFIG, p));
    } catch {}
  });
  // A schedule of the file starts next at its next time from now, not at once. A reminder that is past does not come.
  const added: Schedule[] = (plan.state.schedules ?? []).filter((x: Schedule) => !state.schedules.some((y) => y.id === x.id));
  for (const s of added) if (s.next && s.next < now && !isTrigger(s)) s.next = nextRun(s, now) ?? 0;
  if (plan.state.reminders) plan.state.reminders = plan.state.reminders.filter((r: Reminder) => state.reminders.some((x) => x.id === r.id) || r.at > now);
  const backup = keepBefore(CONFIG);
  const c = config();
  for (const [k, v] of Object.entries(plan.config)) c[k] = v;
  Object.assign(state, plan.state);
  writeFiles(CONFIG, plan.files);
  editJson(PHONE_FILE, (p) => Object.assign(p, plan.phone));
  save();
  // The key files wait in import-keys/ (writeFiles), and the new bridge puts them in place at its start (applyPending).
  const restart = Object.keys(plan.files).some((f) => KEY_FILES.includes(f));
  if (restart)
    setTimeout(() => {
      try {
        restartBridge();
      } catch (e) {
        console.error(`Yonder import: ${(e as Error).message}`);
      }
    }, 1000);
  return {
    backup,
    keys: setup.keys && keys,
    settings: Object.keys(setup.config).length,
    schedules: added.length,
    files: Object.keys(plan.files),
    skipped: plan.skipped,
    restart,
  };
}
const synced = () => settingsSchema().filter((s) => s.sync && (s.store === "config" || s.store === "phone"));
const sync = syncer({
  file: join(CONFIG, "sync.json"),
  site: process.env.YONDER_SITE || "https://yonder.so",
  on: () => config().sync !== false,
  read: () => {
    const c = config();
    const p = readPhone();
    const out: Record<string, unknown> = {};
    for (const s of synced()) {
      const v = (s.store === "config" ? c : p)[s.key];
      if (v !== undefined) out[`${s.store}:${s.key}`] = s.key === "ui" && typeof v === "string" ? v.split("@")[0] : v;
    }
    // The profiles go up with no variables, folder or program: those can hold a key or a path of this computer.
    if (state.profiles.length) out["config:profiles"] = state.profiles.map(({ env: _, folder: __, program: ___, ...p }) => p);
    for (const { name } of listScreens(SCREENS))
      try {
        out[`screen:${name}`] = readScreen(SCREENS, name).look;
      } catch {} // Each version of it failed.
    return out;
  },
  write: (key, v) => {
    const at = key.indexOf(":");
    const [store, name] = [key.slice(0, at), key.slice(at + 1)];
    if (store === "screen") {
      if (v !== null) takeScreen(SCREENS, name, v as Look);
      else if (existsSync(join(SCREENS, name))) deleteScreen(name);
      return;
    }
    // The profiles of the account, with the variables, the folder and the program of this computer. The default profile
    // (cli) stays on each computer, and each computer signs in to a profile on its own (makeFolder, then Sign in).
    // shortcut: the newest list wins whole, so two computers that add a profile in the same 30 seconds keep one. Merge by id
    // when that happens.
    if (key === "config:profiles") {
      const list = v ?? [];
      if (!SETTINGS.profiles.ok(list)) throw new Error(`profiles cannot be ${JSON.stringify(v)}.`);
      const old = state.profiles;
      state.profiles = (list as Profile[]).map((p) => {
        const here = old.find((x) => x.id === p.id);
        return { ...p, ...(here?.env && { env: here.env }), ...(here?.folder && { folder: here.folder }), ...(here?.program && { program: here.program }) };
      });
      for (const p of state.profiles) if (p.own && p.cli === "claude" && !old.some((x) => x.id === p.id && x.own)) makeFolder(p);
      if (old.some((p) => p.id === state.cli) && !profileOf(state.cli)) state.cli = "claude";
      save();
      return;
    }
    const s = synced().find((x) => x.store === store && x.key === name);
    if (!s) return;
    // A value from the account passes the same check as a value of the Settings.
    if (store === "config") {
      if (v !== null && !(SETTINGS[name] ? SETTINGS[name].ok(v) : fitsSetting(s, v))) throw new Error(`${name} cannot be ${JSON.stringify(v)}.`);
      v === null ? delete config()[name] : (config()[name] = v);
      save();
    } else if (name === "ui") setScreen(typeof v === "string" ? v : DEFAULT_SCREEN);
    else if (v === null || ["string", "number", "boolean"].includes(typeof v)) editJson(PHONE_FILE, (c) => (v === null ? delete c[name] : (c[name] = v)));
  },
});
// A change of a setting goes up within 30 seconds, and a change of another device comes within 10 minutes.
setTimeout(() => void sync.run(true), 5000);
setInterval(() => void sync.run(), 30_000);
// A bridge that starts from a Claude Code terminal must not pass that session
// to its workers. FORCE_COLOR of that terminal also colors the short ID in
// the output of `claude --bg`, and then `send` cannot read it.
// YONDER_BRIDGE: the address of this bridge, for a curl of an agent and for the mod (bridge/mod-register.js), because the
// port is not always 7787 (bridge/peer.ts). YONDER_TOKEN: the token of the bridge, so the calls of the workers need no
// check of the user. Another user cannot read the environment of a process. A copy of `env` reads the token of now.
const env: Record<string, string | undefined> = Object.fromEntries([
  ...Object.entries(process.env).filter(([k]) => (!/^CLAUDE/.test(k) || k === "CLAUDE_CONFIG_DIR") && k !== "FORCE_COLOR"),
  ["YONDER_BRIDGE", `http://127.0.0.1:${PORT}`],
]);
Object.defineProperty(env, "YONDER_TOKEN", { get: bridgeToken, enumerable: true });
// macOS ties a privacy grant of a bare binary to its path, and each update of Claude Code has a new path
// (~/.local/share/claude/versions/<version>). So a process of Claude Code that is its own responsible process, such as a
// worker after Yonder.app quits, asks again for Files & Folders after each update, and Privacy & Security keeps one entry
// for each version. Claude Code starts its daemon, spare hosts and workers through CLAUDE_CODE_PROCESS_WRAPPER, with the
// binary of the version first. This launcher runs that version from ClaudeCode.app, so that all versions share the one
// entry of com.anthropic.claude-code.
if (MAC) {
  const launcher = join(CONFIG, "claude-launcher");
  writeFileSync(
    launcher,
    `#!/bin/sh
bin=$1; shift
app=$HOME/.local/share/claude/ClaudeCode.app/Contents/MacOS/claude
# Only the newest version replaces the link in the app, as Claude Code does. An older version, such as one of a daemon that
# runs since before the update, runs from its own path, so that the app never runs a mix of versions.
if [ "$bin" -ef "$HOME/.local/bin/claude" ] && [ ! "$bin" -ef "$app" ] && [ -d "\${app%/*}" ]; then
  ln -f "$bin" "$app.$$" && mv -f "$app.$$" "$app"
fi
[ "$bin" -ef "$app" ] && exec "$app" "$@"
exec "$bin" "$@"
`,
    { mode: 0o755 },
  );
  env.CLAUDE_CODE_PROCESS_WRAPPER = launcher;
}

// The profiles of the Agents tab, as the instances of T3 Code: a CLI with a name, extra flags and environment variables.
// A profile of Claude Code with `own` has its own config folder (CLAUDE_CONFIG_DIR), so its agents have their own login,
// settings, MCP servers and history. Each folder has its own background service, so the agent list, `stop` and `rm`
// run once for each folder. `folder` is only for a hand edit of config.json, for
// a folder that the user already has. `program` is the CLI to run in place of the one on the PATH. `ownMcp`: the agents of
// an own folder get only the MCP servers of that folder, not the ones of the user (defaultMcp).
type Profile = { id: string; name: string; cli: string; own?: boolean; ownMcp?: boolean; folder?: string; program?: string; flags?: string; env?: Record<string, string> };
const tilde = (path: string) => (path.startsWith("~/") ? join(HOME, path.slice(2)) : path);
const profileOf = (id?: string) => (id ? state.profiles.find((p) => p.id === id) : undefined);
const claudeDir = (p?: Profile) => (p?.own ? tilde(p.folder || `~/.claude-${p.id}`) : (process.env.CLAUDE_CONFIG_DIR ?? join(HOME, ".claude")));
// .claude.json is in the folder of a profile, but next to ~/.claude for the folder of the user.
const claudeJson = (p?: Profile) => (p?.own ? join(claudeDir(p), ".claude.json") : join(process.env.CLAUDE_CONFIG_DIR ?? HOME, ".claude.json"));
// The config folders of Claude Code: the folder of the user first, then the own folder of each profile.
const claudeDirs = () => [...new Set([claudeDir(), ...state.profiles.filter((p) => p.cli === "claude" && p.own).map(claudeDir)])];
const envOf = (p?: Profile): Record<string, string> =>
  p ? { ...env, ...(p.own && p.cli === "claude" && { CLAUDE_CONFIG_DIR: claudeDir(p) }), ...p.env } : (env as Record<string, string>);
// The extra flags as arguments: split at the spaces, and a quoted part is one argument.
const flagsOf = (p?: Profile) => (p?.flags?.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((a) => a.replace(/^(["'])(.*)\1$/, "$2"));
// The flags that Yonder sets itself to start and follow an agent.
const OWN_FLAGS = /^(-p|--print|--bg|--background|-r|--resume|-c|--continue|--session-id|-n|--name|--output-format|--fork-session)(=|$)/;

// Each worker is a Claude Code background session (`claude --bg`), so it also
// shows in the agent view of Claude Code, and it keeps running when the bridge
// stops. Workers of older bridges ran `claude -p` and wrote their output to LOGS.
const LOGS = join(CONFIG, "workers");
// The logs of the turns of the agents in other CLIs (clis.ts): <run>.jsonl (the output), .err and .txt (the prompt).
const RUNS = join(CONFIG, "runs");
mkdirSync(RUNS, { recursive: true });
// The spoken prompt in a file, for a CLI that reads its instructions from a file, such as OpenCode.
// The bridge writes it at each turn, with the word of the user for an agent (`say`).
const SPOKEN_FILE = join(CONFIG, "spoken.md");
// How the voice of the calls talks (GET /talk). The voice changes it with change_talk when the user asks. The bridge
// writes the default (bridge/talk.md) when the file is missing, and each call reads it, for each voice. The rules that keep the
// agents safe stay in the code (runTool in src/voice.ts), so an edit cannot remove them.
const TALK = join(CONFIG, "talk.md");
if (!existsSync(TALK)) writeFileSync(TALK, readFileSync(DEFAULT_TALK, "utf8"));
const readTalk = () => {
  try {
    return readFileSync(TALK, "utf8");
  } catch {
    return readFileSync(DEFAULT_TALK, "utf8");
  }
};
// The ACP host (acp-host.ts), which keeps the agents of the ACP CLIs, such as Codex and OpenCode, alive while the
// bridge restarts.
const acp = acpHost(CONFIG, SOURCE, env);
// The state of each other CLI on this Mac (clis.ts). A check runs `--version` and the sign-in check of the CLI, so it
// runs when the bridge starts, when the Agents tab opens, and at most once a minute for a new turn.
const checked: Record<string, Found & { at: number }> = {};
const checking = new Map<string, Promise<Found>>();
function cliState(id: string, fresh = false): Promise<Found> {
  const known = checked[id];
  if (known && !fresh && Date.now() - known.at < 60_000) return Promise.resolve(known);
  if (!checking.has(id))
    checking.set(
      id,
      inspect(CLIS[id])
        .catch((e) => ({ error: String(e) }))
        .then((f) => (checked[id] = { ...f, at: Date.now() }))
        .finally(() => checking.delete(id)),
    );
  return checking.get(id)!;
}
for (const a of state.added ?? []) CLIS[a.id] = addedCli(a);
for (const id in CLIS) void cliState(id);
// Grok and the New agent view offer a CLI that is on: one that the user turned on, or by default one that starts and
// is signed in. Claude Code is always on.
const cliOn = (id: string) => id === "claude" || (state.clis[id]?.on ?? (!!checked[id]?.path && !checked[id].error && !!checked[id].account));
// One transcript for each voice call: a JSON line for each thing that the user or Grok said.
const CALLS = join(CONFIG, "calls");
// The `caffeinate` of the last /awake ping of a call on the phone, or its `systemd-inhibit` on Linux.
let awake: ReturnType<typeof Bun.spawn> | undefined;
// On Windows, a PowerShell that keeps the computer awake for 2 minutes, as `caffeinate -i -t 120`. The flag of
// SetThreadExecutionState stops when the process ends. It goes as -EncodedCommand, so no quote needs an escape.
const AWAKE_WINDOWS = Buffer.from(
  `Add-Type -Name Power -Namespace Yonder -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
[Yonder.Power]::SetThreadExecutionState(0x80000001) | Out-Null
Start-Sleep 120`,
  "utf16le",
).toString("base64");
// The user works in the app on the computer until this time: each input there pings /here. The phones then get no push,
// because the user sees the news on the computer.
let hereUntil = 0;
// `w`: the task of the push, so that it goes only to the phones of its owner (docs/multi-user.md). The user at the computer
// is the main person, so a push of a task of another person still goes then.
const push = (title: string, body: string, w?: { owner?: string }) => {
  const to = w && phonesOf(w.owner);
  if (Date.now() < hereUntil && (!to || People.ownerOf(people(), w!.owner) === People.mainOf(people()))) return;
  void relay?.push(title, body, to);
};
// A call is live until this time: the /awake pings of the phone and of the window on Omarchy. The bar shows it (/status).
let callUntil = 0;
// The device of those pings: get_location asks the phone of the live call first.
let callDevice = "";
// The windows of the app on Linux and Windows (a page of this bridge, not Tauri). The call key (POST /call) reaches them
// through /events.
const windows = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();
function toWindows(text: string) {
  for (const w of windows)
    try {
      w.enqueue(encoder.encode(text));
    } catch {
      windows.delete(w);
    }
}
// A comment every 20 seconds keeps the streams open.
setInterval(() => toWindows(": ping\n\n"), 20_000);
mkdirSync(CALLS, { recursive: true });
// The full prompt that an agent got during a call, with the voice-call block. A click on a question of the
// user in the transcript of the call shows it.
const logSent = (call: string | undefined, num: number, text: string) =>
  call && appendFileSync(join(CALLS, `${call}.jsonl`), JSON.stringify({ at: Date.now(), who: "sent", num, text: text.slice(0, 20000) }) + "\n");
// The images that the user pastes or drops in the app. A worker reads them by their path. The attachments go after
// `fileDays` (pruneFiles).
const IMAGES = join(CONFIG, "images");
mkdirSync(IMAGES, { recursive: true });
// The text that the user pastes on the phone. It goes to the agent as an image does, and the agent reads the file.
const PASTES = join(CONFIG, "pastes");
mkdirSync(PASTES, { recursive: true });
// The files that the user attaches on the phone, such as a PDF. Each one is in its own folder, so it keeps its name.
const FILES = join(CONFIG, "files");
mkdirSync(FILES, { recursive: true });
// The largest file that the phone or send_file gives an agent. A 4K video of the iPhone is about 4.5 MB a second.
const MAX_FILE = 2_000_000_000;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
// One session in `claude agents --json --all`. `state` is set for background
// sessions: working, blocked (it waits on the user) or done. A session without
// a pid has ended.
// `dir` is the config folder that lists it (claudeDirs).
// `waitingFor` names what a waiting session waits on, such as "permission prompt".
type Agent = { id: string; sessionId: string; cwd: string; kind: string; pid?: number; name?: string; status?: string; waitingFor?: string; state?: string; startedAt?: number; dir?: string };
// The summary runs of `claude -p` (see summarize) show as interactive sessions in their own folder, and Yonder skips them.
// A test bridge on another port has its own folder (~/.config/yonder-7801/summarizer), so Yonder skips those too. Else
// the runs of a test bridge show in the list as agents named "summarizer-79".
const summarizer = (cwd: string) => !!cwd && basename(cwd) === "summarizer" && dirname(dirname(cwd)) === dirname(CONFIG) && basename(dirname(cwd)).startsWith("yonder");
// The end-to-end check (bridge/check.ts) starts its workers in a temporary `yonder-check-XXXXXX` folder. The bridge that
// runs the check lists them as its own workers, and each other bridge skips them.
const checkRun = (cwd: string) => /^yonder-check-\w{6}$/.test(basename(cwd));
// The list has the sessions of each config folder (claudeDirs). The folder of a profile that never ran gives none.
const listOf = async (dir: string, i: number) => {
  // A computer with only Hermes or another CLI has no Claude Code, and so no sessions. Else the log got an error each 2 seconds.
  if (!existsSync(CLAUDE)) return [];
  // The list of the phone waits for this read, and a phone with no answer in 10 seconds shows Disconnected. So a Claude
  // Code that does not answer stops after 5 seconds, also on a computer whose agents run on Hermes.
  const text = await new Response(Bun.spawn([CLAUDE, "agents", "--json", "--all"], { env: i ? { ...env, CLAUDE_CONFIG_DIR: dir } : env, stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 5000 }).stdout).text();
  try {
    return (JSON.parse(text) as Agent[]).map((a) => ({ ...a, dir }));
  } catch (e) {
    if (!i) throw e;
    return [];
  }
};
const agents = async (): Promise<Agent[]> => (await Promise.all(claudeDirs().map(listOf))).flat().filter((a) => !summarizer(a.cwd));
// The commands of a background session take the short ID, the first 8 characters of the session ID. A session of a
// profile with its own folder needs the environment of that profile.
const control = (command: "stop" | "rm", w: Pick<Worker, "sessionId" | "profile">, sessionId = w.sessionId) =>
  Bun.spawn([CLAUDE, command, sessionId.slice(0, 8)], { env: envOf(profileOf(w.profile)), stdout: "ignore", stderr: "ignore" }).exited;
// The messages that Claude Code holds for the turn that runs: typed in (typeIn) and not given to the agent yet. A stop
// drops them, so the
// bridge takes them back before it stops a live session. The transcript has an "enqueue" for each message, and a "remove"
// when the agent got it. The events come newest first, so the search ends at the prompt of the turn. A stopped session
// keeps the "enqueue" of a message that the bridge took back, so the callers skip a message that the bridge holds.
async function untaken(w: Worker) {
  // A "dequeue" with no text, when the turn ended, takes one message too.
  const taken = new Map<string, number>();
  const out: string[] = [];
  for (const e of await transcript(w.path, w.sessionId)) {
    if (e.type === "user" && typeof e.message?.content === "string") break;
    if (e.type !== "queue-operation") continue;
    const text = typeof e.content === "string" ? e.content : "";
    const n = taken.get(text) ?? 0;
    if (e.operation !== "enqueue") taken.set(text, n + 1);
    else if (n) taken.set(text, n - 1);
    else if (taken.get("")) taken.set("", taken.get("")! - 1);
    else if (text) out.unshift(text);
  }
  return out;
}

// Stops the session of a worker. A worker of an older bridge ran `claude -p` in
// its own process group, and the negative pid ends that group. The messages that
// the session did not take yet go to the front of the queue of the bridge.
async function halt(w: Worker) {
  if (w.cli) return stopRun(w);
  // A stop does not end the hook of a question, so the stop answers Deny, and the dialog goes away on each device.
  if (w.ask) {
    const id = w.ask.id;
    delete w.ask;
    asks.get(id)?.end({ allow: false });
  }
  const lost = (inRoster(w.sessionId) ? await untaken(w) : []).filter((m) => !w.queue?.includes(m));
  if (lost.length) w.queue = [...lost, ...(w.queue ?? [])];
  await control("stop", w);
  try {
    if (w.pid && w.status === "running") process.kill(-w.pid, "SIGTERM");
  } catch {}
  // Claude Code writes the prompt of a resumed turn a few seconds after the turn starts, and a stop before that drops
  // it: a second Escape, one second after the first sent the queue, loses the message. So a prompt that
  // the transcript does not have goes back to the front of the queue. Only a resume of the last minute: a long turn
  // pushes its prompt out of the end of the transcript that the bridge reads. A slash command shows in the transcript in
  // other words, so it never comes back.
  const back = await unsaid(w);
  if (back) w.queue = [back, ...(w.queue ?? [])];
}
// The prompt of the last resume of a stopped worker, when the transcript does not have it since that resume. resume
// needs it too: with Steer, each message stops the turn, and else three quick messages leave only the first.
async function unsaid(w: Worker) {
  const r = resumed.get(w.id);
  resumed.delete(w.id);
  if (!r || r.text.startsWith("/") || Date.now() - r.at > 60_000) return;
  for (let i = 0; i < 50 && inRoster(w.sessionId); i++) await Bun.sleep(100);
  const said = (await transcript(w.path, w.sessionId)).some(
    (e) => e.type === "user" && Date.parse(e.timestamp) >= r.at && typeof e.message?.content === "string" && e.message.content.includes(r.text.slice(0, 200)),
  );
  return said ? undefined : r.text;
}
// The prompt of the last resume of each worker, for halt and resume, and the time before its send.
const resumed = new Map<string, { text: string; at: number }>();

// The turn of an agent in another CLI is one detached process, in its own process group (clis.ts). Only the bridge
// that started it gets its exit code. `ours` holds the processes of this bridge.
const exits = new Map<number, number>();
const ours = new Set<number>();
// A turn runs while its process lives. After a restart of the bridge, macOS can give the pid to another program, so
// the command must still name the binary of the CLI.
// shortcut: the command check only roughly guards against a reused pid, as the bridge did for `claude -p`.
const alive = (pid?: number) => {
  try {
    return !!pid && process.kill(pid, 0);
  } catch {
    return false;
  }
};
function runs(w: Worker) {
  const pid = w.pid;
  if (!pid || exits.has(pid)) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // shortcut: Windows has no ps, so a reused pid counts as a run there. Read the command with Get-CimInstance if it matters.
  if (ours.has(pid) || WINDOWS) return true;
  const command = Bun.spawnSync(["ps", "-p", String(pid), "-o", "command="]).stdout.toString();
  return (CLIS[w.cli ?? ""]?.bins ?? []).some((bin) => command.includes(bin));
}
// Ends the turn of an agent in another CLI: SIGINT to its process group, as Ctrl+C in a terminal, so that the CLI can
// save its session for the next turn. A turn that still runs after 3 seconds gets SIGTERM.
async function stopRun(w: Worker) {
  if (CLIS[w.cli ?? ""]?.acp) return void (await acp.cancel(w.sessionId));
  if (!runs(w)) return;
  // Windows has no process groups, so the signal goes to the process.
  const pid = WINDOWS ? w.pid! : -w.pid!;
  try {
    process.kill(pid, "SIGINT");
  } catch {}
  for (let i = 0; i < 30 && runs(w); i++) await Bun.sleep(100);
  try {
    if (runs(w)) process.kill(pid, "SIGTERM");
  } catch {}
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// The word and the naming of the user for an agent (agentName and agentNaming in config.json, src/names.ts).
const agentWord = (): AgentName => ({ ...state.agentName, naming: state.agentNaming });
// A text of the bridge for a client or a worker, with the word of the user for an agent: "Agent 4" is "Task 4" (`swap`).
// The MCP tools call the agents by the same word as the screen does.
const say = (text: string) => swap(text, state.agentName);
// What a push calls an agent: "Bot 2", "Jack" or "Sundial".
const pushName = (w: Worker) => callName(w, state.workers, agentWord());
// The first words of a task, as the name of a worker that got no name: three words at most.
// A name from Grok keeps six words at most, so it fits on the first line of the agent row.
const nameFrom = (task: string, most = 3) => task.replace(/\s+/g, " ").trim().split(" ").slice(0, most).join(" ").replace(/[.,;:!?]+$/, "");
// Each agent gets the lowest number that no open agent has. A closed agent
// gives its number back, so the numbers stay short to say. When a new agent
// takes it, the closed agent has no number (0) until it runs again.
function freeNum() {
  const taken = new Set([...state.workers.filter((w) => w.status !== "closed").map((w) => w.num), ...Object.values(state.numbers)]);
  let n = 1;
  while (taken.has(n)) n++;
  for (const w of state.workers) if (w.status === "closed" && w.num === n) w.num = 0;
  return n;
}
// An agent that runs again keeps its number, or gets a new one when an open agent has it now.
function keepNum(w: Worker) {
  if (!w.num || state.workers.some((x) => x !== w && x.status !== "closed" && x.num === w.num)) w.num = freeNum();
}
// A new agent that the bridge lost before Claude Code started its session. An agent in another CLI keeps its log,
// and a slow CLI can give the session ID after the start.
state.workers = state.workers.filter((w) => w.sessionId || w.runs?.length);
// A restart of the computer ends each session. A running agent then waits for a message, as after stop_worker, and a
// waiting agent keeps waiting. The mark holds the status, else the first poll finds no process and closes the agent.
// A run of a schedule gets no mark: the poll finds it failed, and it continues (settle).
const booted = Date.now() - uptime() * 1000;
for (const w of state.workers) {
  if ((w.status as string) === "stopped") w.status = "closed"; // The name of older bridges.
  if (((w.status === "running" && !w.schedule) || w.status === "waiting") && w.updatedAt < booted) {
    if (w.status === "running") Object.assign(w, { status: "waiting", activity: "", monitoring: undefined, result: "The computer restarted.", unread: false, attention: false, answered: false, updatedAt: Date.now() });
    w.marked = true;
  }
  w.name ||= nameFrom(w.task);
  if (w.status !== "closed") keepNum(w);
  w.attention ??= w.unread; // In an old state.json, unread holds the answer of Clef.
  delete w.ask; // The hook of a question asks again when the bridge comes back.
}
// The project that holds Yonder: the repository, or the workspace folder around it.
const holdsRoot = (path: string) => ROOT === path || ROOT.startsWith(`${path}${sep}`);
const isDir = (path: string) => existsSync(path) && statSync(path).isDirectory();
const expand = (path: string) => resolve(path.replace(/^~(?=$|[\\/])/, HOME));

// The folders that an older install lists by itself (`state.scan`): each folder in ROOTS. They are no
// workspaces. A start, a move or a pick of Clef in one of them makes it a workspace (adoptFolder).
function scanned(): string[] {
  return (state.scan ? ROOTS : []).flatMap((root) => {
    try {
      return readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => join(root, d.name))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    } catch {
      return [];
    }
  });
}
// The projects of an older bridge: the scanned folders and the added folders, with no hidden folder,
// in the order of the screen. Only migrateWorkspaces reads them.
function oldProjects(): Project[] {
  const list = [...new Set([...scanned(), ...state.extra])].filter((path) => !state.hidden.includes(path)).map((path) => ({
    name: basename(path),
    path,
    starred: state.starred.includes(path),
    ...(holdsRoot(path) && { pinned: true }),
  }));
  const rank = (p: Project) => (p.pinned ? -1 : p.starred ? state.starred.indexOf(p.path) : state.starred.length);
  return list.sort((a, b) => rank(a) - rank(b));
}

// config.json `workspaces`: the workspaces in the order of the screen. The user and the agents edit the file, so the
// bridge checks each entry on its own: a bad entry is left out with its error (list_workspaces gives the errors), and
// the others stay. The bridge never writes over an entry that it left out. Each workspace is a named group with at
// most one folder.
type WorkspaceEntry = { id: string; name: string; folder?: string; description?: string; starred?: boolean; profile?: string };
const WORKSPACE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
let workspaceErrors: string[] = [];
let workspaceCheck = { text: "\0", list: [] as WorkspaceEntry[] };
function workspaceEntries(): WorkspaceEntry[] {
  const raw = config().workspaces;
  const text = JSON.stringify(raw ?? null);
  if (text === workspaceCheck.text) return workspaceCheck.list;
  const errors: string[] = [];
  const list: WorkspaceEntry[] = [];
  const ids = new Set<string>();
  const folders = new Set<string>();
  if (raw !== undefined && !Array.isArray(raw)) errors.push("`workspaces` must be a list, so no workspace shows.");
  (Array.isArray(raw) ? raw : []).forEach((w: any, i: number) => {
    const bad = (why: string) => void errors.push(`workspaces[${i}]${typeof w?.id === "string" ? ` (${w.id})` : ""} is left out: ${why}`);
    if (!w || typeof w !== "object" || Array.isArray(w)) return bad("it is not an object.");
    if (typeof w.id !== "string" || !WORKSPACE_ID.test(w.id)) return bad('its id must be lowercase letters, digits, "-" or "_", such as "music".');
    if (ids.has(w.id)) return bad("another workspace has the same id.");
    if (typeof w.name !== "string" || !w.name.trim()) return bad("it has no name.");
    if (w.folder != null && (typeof w.folder !== "string" || !w.folder.trim())) return bad("its folder must be a path, such as \"~/Sites/music\".");
    const folder = typeof w.folder === "string" && w.folder.trim() ? expand(w.folder.trim()) : undefined;
    if (folder && folders.has(folder)) return bad(`another workspace has the folder ${folder}. A folder is the home of one workspace only.`);
    if (w.description != null && typeof w.description !== "string") return bad("its description must be a text.");
    if (!folder && !w.description?.trim()) return bad("a workspace with no folder needs a description.");
    if (w.starred != null && typeof w.starred !== "boolean") return bad("starred must be true or false.");
    if (w.profile != null && typeof w.profile !== "string") return bad("profile must be the name or the id of a profile.");
    ids.add(w.id);
    if (folder) folders.add(folder);
    list.push({
      id: w.id,
      name: w.name.trim(),
      ...(folder && { folder }),
      ...(w.description?.trim() && { description: w.description.trim() }),
      ...(w.starred && { starred: true }),
      ...(w.profile?.trim() && { profile: w.profile.trim() }),
    });
  });
  if (errors.join("\n") !== workspaceErrors.join("\n")) for (const e of errors) console.error(`${CONFIG_FILE}: ${e}`);
  workspaceErrors = errors;
  workspaceCheck = { text, list };
  return list;
}
// The folder where the new agents of a workspace with no folder start: the default folder of config.json, else ~/Yonder.
const noFolder = () => {
  const f = config().defaultFolder;
  const path = typeof f === "string" && f.trim() ? expand(f.trim()) : "";
  return path && isDir(path) ? path : join(HOME, "Yonder");
};
function projects(): Project[] {
  // A config.json that was not valid JSON at the start of the bridge moves the projects when it is valid again.
  if (!state.workspacesMigrated && !migrating) migrateWorkspaces();
  const list = workspaceEntries().map((w): Project => ({
    id: w.id,
    name: w.name,
    path: w.folder ?? noFolder(),
    starred: !!w.starred,
    ...(w.folder && holdsRoot(w.folder) && { pinned: true }),
    ...(!w.folder && { home: false as const }),
    ...(w.description && { description: w.description }),
    ...(w.profile && { profile: w.profile }),
  }));
  // Yonder comes first, then the starred workspaces, then the others, each in the order of config.json.
  const rank = (p: Project) => (p.pinned ? 0 : p.starred ? 1 : 2);
  return list.sort((a, b) => rank(a) - rank(b));
}
// The key of a workspace on the screen and in the tools: its folder, or "workspace:<id>" for one with no folder. The
// screen keys each workspace by it, as it keyed each project by its path, so the old apps keep working.
const keyOf = (p: Project) => (p.home === false ? `workspace:${p.id}` : p.path);
// True when the worker belongs to the workspace: by its id, else, for a worker of an older bridge, by its folder.
const isIn = (w: Pick<Worker, "workspace" | "path">, p: Project) => (w.workspace && p.id ? w.workspace === p.id : p.home !== false && w.path === p.path);
// The workspace with a folder that holds the path most closely, as the screen groups the agents.
const deepestOf = (path: string, ps: Project[]) =>
  ps.filter((p) => p.home !== false && (path === p.path || path.startsWith(`${p.path}${sep}`) || path.startsWith(`${p.path}/`))).sort((a, b) => b.path.length - a.path.length)[0];
const toTilde = (path: string) => (path === HOME || path.startsWith(`${HOME}${sep}`) ? `~${path.slice(HOME.length)}` : path);
// The entries of config.json as they are, also the ones that the check left out, for an edit in place.
function rawWorkspaces(): any[] {
  if (configCache.bad) throw new Error(`${CONFIG_FILE} is not valid JSON, so Yonder does not change it. Fix the file first.`);
  const raw = config().workspaces;
  if (raw === undefined) return (config().workspaces = []);
  if (!Array.isArray(raw)) throw new Error(`\`workspaces\` in ${CONFIG_FILE} is not a list. Fix the file first.`);
  return raw;
}
// A new id from the name, such as "music" or "music-2", that no entry has.
function newWorkspaceId(name: string, taken = new Set(rawWorkspaces().map((w) => w?.id))) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}
// Adds a workspace at the end of config.json, or gives the one that has the folder already.
function addWorkspace(w: { name: string; folder?: string; description?: string }): Project {
  const folder = w.folder ? expand(w.folder) : undefined;
  const have = folder && projects().find((p) => p.home !== false && p.path === folder);
  if (have) return have;
  if (!w.name.trim()) throw new Error("A workspace needs a name.");
  if (!folder && !w.description?.trim()) throw new Error("A workspace with no folder needs a description: one or two sentences on what it is for.");
  const raw = rawWorkspaces();
  const id = newWorkspaceId(w.name);
  raw.push({ id, name: w.name.trim(), ...(folder && { folder: toTilde(folder) }), ...(w.description?.trim() && { description: w.description.trim().slice(0, 300) }) });
  save();
  return projects().find((p) => p.id === id)!;
}
// Changes the entry of a workspace in config.json: `change` gets a copy and gives the new entry. A new entry that the
// check of workspaceEntries would leave out throws, and the file stays as it was.
function editWorkspace(p: Project, change: (entry: any) => any) {
  if (!p.id) throw new Error(`${p.name} is a folder, not a workspace. Add it with add_workspace first.`);
  const raw = rawWorkspaces();
  const at = raw.findIndex((w) => w?.id === p.id);
  if (at < 0) throw new Error(`There is no workspace "${p.id}".`);
  const next = change({ ...raw[at] });
  if (typeof next.name !== "string" || !next.name.trim()) throw new Error("A workspace needs a name.");
  const folder = typeof next.folder === "string" && next.folder.trim() ? expand(next.folder.trim()) : undefined;
  const other = folder && projects().find((x) => x.id !== p.id && x.home !== false && x.path === folder);
  if (other) throw new Error(`The folder ${folder} is the home of the workspace ${other.name} already. A folder is the home of one workspace only.`);
  if (!folder && !(typeof next.description === "string" && next.description.trim())) throw new Error("A workspace with no folder needs a description: one or two sentences on what it is for.");
  raw[at] = next;
  save();
}
// A scanned folder with no workspace becomes one when an agent starts or moves there, so its agents group under it, as
// they did under its project. Another folder, such as the folder of a screen, stays no workspace.
const adoptFolder = (p: Project): Project => (p.id || !scanned().includes(p.path) ? p : addWorkspace({ name: p.name, folder: p.path }));

// The projects of an older bridge become workspaces. Each project that the user chose or used becomes a workspace with its
// folder: the pinned one, the starred ones, the added ones, and each project with an agent, a schedule, a profile or a
// saved about. A scanned folder that nobody used does not. It runs once (`workspacesMigrated`), keeps the entries that
// config.json has already, and leaves the old keys of state.json and config.json as they are, so an older bridge still
// reads its projects.
let migrating = false;
function migrateWorkspaces() {
  if (state.workspacesMigrated || configCache.bad || migrating) return;
  migrating = true;
  try {
    moveProjects();
  } finally {
    migrating = false;
  }
}
function moveProjects() {
  const raw = config().workspaces;
  if (raw !== undefined && !Array.isArray(raw)) return console.error(`\`workspaces\` in ${CONFIG_FILE} is not a list, so the projects do not move into it.`);
  const old = oldProjects();
  const deepest = (path: string) => old.filter((p) => path === p.path || path.startsWith(`${p.path}${sep}`)).sort((a, b) => b.path.length - a.path.length)[0];
  const keep = new Set<string>();
  for (const p of old) if (p.pinned || p.starred || state.extra.includes(p.path)) keep.add(p.path);
  for (const path of [...state.workers.map((w) => w.path), ...state.schedules.map((s) => s.project)]) {
    const p = path && deepest(path);
    if (p) keep.add(p.path);
  }
  for (const path of [...Object.keys(state.projectProfiles ?? {}), ...Object.keys(state.abouts ?? {})]) if (old.some((p) => p.path === path)) keep.add(path);
  const list: any[] = raw ?? [];
  const taken = new Set(list.map((w) => w?.id));
  const folders = new Set(list.map((w) => typeof w?.folder === "string" && expand(w.folder)));
  for (const p of old) {
    if (!keep.has(p.path) || folders.has(p.path)) continue;
    const id = newWorkspaceId(p.name, taken);
    taken.add(id);
    const about = state.abouts?.[p.path];
    const profile = state.projectProfiles?.[p.path];
    list.push({ id, name: p.name, folder: toTilde(p.path), ...(p.starred && { starred: true }), ...(about && { description: about }), ...(profile && { profile }) });
  }
  config().workspaces = list;
  const ps = projects();
  for (const w of state.workers) if (!w.workspace && w.path) w.workspace = deepestOf(w.path, ps)?.id;
  state.workspacesMigrated = Date.now();
  save();
  console.log(`The projects became ${list.length} workspaces in ${CONFIG_FILE}.`);
}
migrateWorkspaces();

// The folders and files of a project, two levels deep, for project_overview. It skips
// dot folders and HEAVY folders, and it shows at most 25 entries in each folder.
function tree(path: string, depth = 0): string[] {
  let entries;
  try {
    entries = readdirSync(path, { withFileTypes: true }).filter((e) => !e.name.startsWith(".") && !HEAVY.has(e.name));
  } catch {
    return [];
  }
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  const pad = "  ".repeat(depth);
  const lines = entries.slice(0, 25).flatMap((e) =>
    e.isDirectory() ? [`${pad}${e.name}/`, ...(depth < 1 ? tree(join(path, e.name), depth + 1) : [])] : [`${pad}${e.name}`],
  );
  return entries.length > 25 ? [...lines, `${pad}… ${entries.length - 25} more`] : lines;
}

// Finds a workspace from a spoken name ("visual sandbox"), its id, its key ("workspace:music"), or a path. A scanned
// folder with no workspace still counts after the workspaces, as a folder: adoptFolder makes it a workspace when an agent
// starts there.
function findProject(name: string): Project {
  const all = projects();
  if (name.startsWith("workspace:")) {
    const p = all.find((x) => x.id === name.slice("workspace:".length));
    if (!p) throw new Error(`There is no workspace "${name.slice("workspace:".length)}". Call list_workspaces or ask the user.`);
    return p;
  }
  if (name.startsWith("~") || isAbsolute(name)) {
    const path = expand(name);
    if (!isDir(path)) throw new Error(`There is no folder at ${path}.`);
    return all.find((p) => p.home !== false && p.path === path) ?? { name: basename(path), path, starred: false };
  }
  const key = norm(name);
  const folders: Project[] = scanned()
    .filter((path) => !all.some((p) => p.home !== false && p.path === path))
    .map((path) => ({ name: basename(path), path, starred: false }));
  const exact = all.filter((p) => norm(p.name) === key || norm(p.id ?? "") === key);
  if (exact.length) return exact[0];
  const exactFolder = folders.find((p) => norm(p.name) === key);
  if (exactFolder) return exactFolder;
  const near = key.length >= 3 ? all.filter((p) => norm(p.name).includes(key)) : [];
  if (near.length === 1) return near[0];
  const nearFolders = !near.length && key.length >= 3 ? folders.filter((p) => norm(p.name).includes(key)) : [];
  if (nearFolders.length === 1) return nearFolders[0];
  const both = [...near, ...nearFolders];
  throw new Error(
    both.length
      ? `"${name}" matches ${both.map((p) => p.name).join(", ")}. Ask the user which one.`
      : `There is no workspace named "${name}". Call list_workspaces or ask the user.`,
  );
}

// Finds a worker from its id, its number ("3", "agent 3"), its name, or the newest worker in a project.
// With `sub`, it also finds a sub-agent: "21B", or the id that the app gives it, "<id of the agent>/<id of the sub-agent>".
// Only reads and messages take a sub-agent. A stop of a sub-agent would stop the session of its agent.
// The agents come first: the id of agent 9 was "82391a", which also reads as sub-agent A of agent 82391.
async function findWorker(ref: string, sub = false): Promise<Worker> {
  const key = norm(ref);
  // "Bot 3" is 3, and in the names mode "Jack" is 1 (src/names.ts).
  const num = stripNoun(ref, agentWord()).match(/^\s*(?:agent\s*|#)?(\d+)\s*$/i)?.[1];
  // In the projects mode an agent is also its project and its number: "Sundial 7".
  const [, project, inProject] = ref.match(/^(.+?)\s+(\d+)\s*$/) ?? [];
  const all = await allSessions();
  const w =
    all.find((w) => w.id === ref) ??
    // A new agent has a short ID until its session ID comes (showStarting). A screen that opened it then still asks with
    // that ID (Sentry YONDER-P).
    all.find((w) => w.startId === ref) ??
    // A session that Yonder did not start has the 8-character ID of Claude Code, and a message makes it a worker with a
    // 6-character ID (adopt). A screen that opened it still asks with the 8 characters (Sentry YONDER-K).
    all.find((w) => ref.length >= 8 && w.sessionId.toLowerCase().startsWith(ref.toLowerCase())) ??
    all.find((w) => Number(num) > 0 && w.num === Number(num)) ??
    all.find((w) => !!project && w.num === Number(inProject) && norm(w.project) === norm(project)) ??
    all.find((w) => norm(w.name) === key) ??
    all.filter((w) => norm(w.project) === key).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (w) return w;
  const part = ref.match(/^\s*(?:agent\s*|#)?(\d+)\s*([a-z]{1,2})\s*$/i) ?? ref.match(/^(.+)\/(a[0-9a-f]+)$/);
  if (!part) throw new Error(`There is no worker "${ref}". Call list_workers.`);
  if (!sub) throw new Error(`${ref} is a sub-agent. Move its agent, and the sub-agent moves with it. Yonder can read it and send it messages, but it cannot stop, close, rename or star it.`);
  const s = (await subagents(await findWorker(part[1]))).find((s) => s.letter === part[2].toUpperCase() || s.id.endsWith(`/${part[2]}`));
  if (!s) throw new Error(`Agent ${part[1]} has no sub-agent ${part[2]}. Call get_worker for its sub-agents.`);
  return s;
}

// The sub-agents that an agent started with the Agent tool, oldest first. Claude Code keeps the transcript of each one
// in the folder of the session, with a meta file that gives its description and its type. Each one gets the number
// of its agent and a letter: 21A, 21B, 21C. The sessionId of a sub-agent is the path of its transcript, so
// transcript, turns, lastTurn and the summary read it as they read a session.
// shortcut: only the current session; a worker that moved to a copy (a new model or effort) loses the sub-agents of `past`.
const letter = (i: number): string => (i >= 26 ? letter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
async function subagents(w: Worker): Promise<Worker[]> {
  if (w.parent) return [];
  const dir = join(transcriptFile(w.path, w.sessionId).slice(0, -".jsonl".length), "subagents");
  if (!isDir(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ f, stat: statSync(join(dir, f)) }))
    .sort((a, b) => a.stat.birthtimeMs - b.stat.birthtimeMs);
  return Promise.all(
    files.map(async ({ f, stat }, i): Promise<Worker> => {
      const agentId = f.slice("agent-".length, -".jsonl".length);
      const meta = (() => { try { return JSON.parse(readFileSync(join(dir, f.replace(/\.jsonl$/, ".meta.json")), "utf8")); } catch { return {}; } })();
      const sessionId = `${w.sessionId}/subagents/agent-${agentId}`;
      const last = await lastTurn(w.path, sessionId);
      // A sub-agent ends its turn, or it writes while it works. One that stopped in the middle, with its agent, is closed.
      const status: Status = last.ended ? "done" : w.status === "running" || Date.now() - stat.mtimeMs < 120_000 ? "running" : "closed";
      return {
        id: `${w.id}/${agentId}`, num: w.num, letter: letter(i), parent: w.id, sessionId, name: meta.description || agentId,
        project: w.project, workspace: w.workspace, path: w.path, task: meta.description ?? "", status, activity: status === "running" ? last.activity : "",
        result: last.text, unread: false, startedAt: stat.birthtimeMs, createdAt: stat.birthtimeMs, updatedAt: last.at || stat.mtimeMs,
        context: last.used ? { used: last.used, window: state.windows[last.model] } : undefined,
        model: last.model || undefined, agent: meta.agentType,
      };
    }),
  );
}
const label = (w: Worker) => `${w.num || ""}${w.letter ?? ""}`;

// The tabs of the app. Agents has only the running agents, and completed (the Done tab) the waiting, done and failed
// agents, with the agents that need the user at the top. The app has the same rule (tabOf in src/App.tsx).
// Saved has the open agents that the user saved for later (`saved`), also while they run, so that they are not on the
// Done or Agents tab.
const TABS = ["agents", "completed", "saved", "closed"] as const;
const tabOf = (w: Worker): (typeof TABS)[number] => (w.status === "closed" ? "closed" : w.saved ? "saved" : w.status === "running" ? "agents" : "completed");
// The order of a tab on the screen (`lists` in src/App.tsx): by number on the Agents tab, the agents that need the user and
// then the newest result first on the Done and Saved tabs, and the agent closed last first on the Closed tab.
const screenOrder = (tab: (typeof TABS)[number]) => (a: Worker, b: Worker) => {
  const needsYou = (w: Worker) => w.status === "waiting" || !!w.attention;
  return tab === "closed"
    ? b.updatedAt - a.updatedAt
    : tab === "agents"
      ? (a.num || 1e9) - (b.num || 1e9) || b.updatedAt - a.updatedAt
      : Number(needsYou(b)) - Number(needsYou(a)) || b.updatedAt - a.updatedAt;
};
// The project of a worker as the app groups it (`groups` in src/App.tsx): the longest project path that holds its folder.
// The group of a worker, as the screen shows it: the key of its workspace (keyOf), else the deepest workspace folder that
// holds its folder, else its own folder.
const groupOf = (w: Worker, ps: Project[]) => {
  const own = w.workspace && ps.find((p) => p.id === w.workspace);
  if (own) return keyOf(own);
  const p = deepestOf(w.path, ps);
  return p ? keyOf(p) : w.path;
};

// One worker, or all the workers on one tab of a project. A group skips terminal sessions,
// because Yonder did not start them.
// `person`: with two people or more, a group holds only the agents of that person, as the list of that person shows them
// (docs/multi-user.md), so "close all on Done" of one person never closes a task of another person.
async function targets(ref?: string, tab?: (typeof TABS)[number], project?: string, person?: People.Person): Promise<Worker[]> {
  // Grok sometimes gives the project as the worker too. The tab then wins, or only the newest agent closes.
  if (ref && !tab) return [await findWorker(ref)];
  if (!tab) throw new Error("Give a worker or a tab.");
  // A tab with no project is the group in all the projects, as the app shows it with "All projects" selected.
  // Else Grok guesses the projects one by one, and the closed agents of the other projects stay.
  // The app sends the project as it groups the agents (groupOf), so an agent in a subfolder, such as yonder/app under
  // the project yonder, is in the group. An exact match of the path leaves those agents on the Closed tab.
  const path = project && keyOf(findProject(project));
  const ps = projects();
  const group = people();
  const mine = (w: Worker) => !person || !People.shared(group) || People.ownerOf(group, w.owner) === person;
  return (await allSessions()).filter(
    (w) => (!path || w.path === path || groupOf(w, ps) === path) && w.kind !== "terminal" && tabOf(w) === tab && mine(w),
  );
}

// Yonder starts and messages only its own workers.
function own(w: Worker) {
  if (w.kind) throw new Error(`${w.project} (${w.id}) is a Claude Code session in a ${w.kind}. Yonder can read it, but it cannot send it messages or stop it.`);
  return w;
}
// A session that Yonder did not start becomes a worker, with the same number: a message to a background session, a
// close, and a lost start of this bridge (startOf), which gets its start ID back. It continues under the same session ID.
function adopt(s: Worker, startId?: string) {
  const { kind, pid, ...rest } = s;
  const w: Worker = { ...rest, id: s.sessionId.slice(0, 6), name: state.names[s.sessionId] ?? s.name, unread: false, ...(startId && { startId }) };
  delete state.numbers[s.sessionId];
  delete state.names[s.sessionId];
  delete state.avatars[s.sessionId];
  state.workers.unshift(w);
  save();
  return w;
}

// One line that says what a tool call does, like the Claude Code agent list.
function describe(path: string, { name, input = {} }: { name: string; input?: Record<string, unknown> }) {
  const detail = input.description ?? input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.query ?? "";
  return `${name} ${String(detail).split("\n")[0].replace(`${path}/`, "")}`.trim().slice(0, 120);
}

// The head of a tool call as the terminal of Claude Code writes it: the name, and the main input in brackets, such as
// "Bash(git status)". Claude Code calls an Edit "Update", and names an MCP tool by its server.
function head(path: string, { name, input = {} }: { name: string; input?: Record<string, unknown> }) {
  const main = input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.query ?? input.prompt ?? input.description;
  const arg = main !== undefined ? String(main) : Object.keys(input).length ? JSON.stringify(input) : "";
  const mcp = name.match(/^mcp__(.+?)__(.+)$/);
  const label = mcp ? `${mcp[1]} - ${mcp[2]} (MCP)` : name === "Edit" || name === "MultiEdit" ? "Update" : name;
  return `${label}(${arg.split("\n")[0].replace(`${path}/`, "").slice(0, 160)})`;
}
// The text of a tool result.
const resultText = (block: any) =>
  typeof block.content === "string" ? block.content : [...(block.content ?? [])].map((c) => c.text ?? (c.type === "image" ? "[Image]" : "")).join("\n");
// The first 3 lines of a tool result, as the terminal of Claude Code shows them under the call, and the count of the
// lines after them. A Read gives only its count of lines, as in the terminal.
function firstLines(name: string, text: string) {
  const lines = text.replace(/\s+$/, "").split("\n");
  if (!text.trim()) return { out: ["(No content)"] };
  if (name === "Read") return { out: [text.trim() === "[Image]" ? "Read image" : `Read ${lines.length} line${lines.length === 1 ? "" : "s"}`] };
  return { out: lines.slice(0, 3).map((l) => l.slice(0, 300)), ...(lines.length > 3 && { more: lines.length - 3 }) };
}

// The changed lines of an Edit or a Write, from the result that Claude Code saves in the transcript:
// the hunks of `structuredPatch`, or all the lines of a new file. At most 200 lines for each call.
const DIFF_LINES = 200;
function patch(result: Record<string, any>): Hunk[] | undefined {
  const hunks: Hunk[] =
    result.type === "create" && typeof result.content === "string"
      ? [{ old: 0, new: 1, lines: result.content.replace(/\n$/, "").split("\n").map((l: string) => `+${l}`) }]
      : Array.isArray(result.structuredPatch)
        ? result.structuredPatch.map((h: any) => ({ old: h.oldStart, new: h.newStart, lines: h.lines }))
        : [];
  let left = DIFF_LINES;
  const out = hunks
    .map((h) => {
      const lines = h.lines.slice(0, Math.max(0, left)).map((l) => l.slice(0, 500));
      left -= h.lines.length;
      return { ...h, lines };
    })
    .filter((h) => h.lines.length);
  if (left < 0) out.push({ old: 0, new: 0, lines: [`… ${-left} more lines`] });
  return out.length ? out : undefined;
}

// The tokens that one answer had in its context.
type Usage = { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number };
const used = (u: Usage) =>
  (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0);

// The transcript file of a session. Claude Code keeps it in the folder of the
// working directory. A session that moved into a git worktree keeps it in the
// folder of the worktree, so look in all the folders when the first is empty.
const PROJECTS = join(HOME, ".claude/projects");
const moved = new Map<string, string>();
// A session of a profile with its own folder is in the projects folder of that folder (claudeDirs).
function transcriptFile(cwd: string, sessionId: string) {
  const name = `${sessionId}.jsonl`;
  const roots = [PROJECTS, ...claudeDirs().slice(1).map((dir) => join(dir, "projects"))];
  const first = join(PROJECTS, cwd.replace(/[^a-zA-Z0-9]/g, "-"), name);
  // After a change of profile the session is in two folders (copySession), and Claude Code writes only to the copy of the
  // new profile. So the newest file wins. Else the agent shows its old answer.
  // The same holds for a session in a git worktree that moves to a profile: else the path in `moved` keeps the old copy,
  // and the agent shows "running" with no answer while it answers.
  const newest = (dir: string) =>
    roots.map((root) => join(root, dir, name)).filter((path) => existsSync(path)).reduce<string | undefined>((a, b) => (!a || statSync(b).mtimeMs > statSync(a).mtimeMs ? b : a), undefined);
  const here = newest(cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  if (here) return here;
  const known = moved.get(sessionId);
  if (known && existsSync(known)) return newest(basename(dirname(known))) ?? known;
  for (const root of roots)
    for (const dir of existsSync(root) ? readdirSync(root) : []) {
      const path = join(root, dir, name);
      if (existsSync(path)) {
        moved.set(sessionId, path);
        return newest(dir) ?? path;
      }
    }
  return first;
}
// A worker of an old state.json has no createdAt. Its first transcript tells when it started.
for (const w of state.workers)
  if (!w.createdAt) try { w.createdAt = statSync(transcriptFile(w.path, w.past?.[0] ?? w.sessionId)).birthtimeMs; } catch { w.createdAt = w.startedAt; }

// The transcript that Claude Code saves for every session, newest line first.
async function transcript(cwd: string, sessionId: string, bytes = 512_000) {
  const file = Bun.file(transcriptFile(cwd, sessionId));
  if (!(await file.exists())) return [];
  const events: Record<string, any>[] = [];
  for (const line of (await file.slice(Math.max(0, file.size - bytes)).text()).split("\n").reverse()) {
    try {
      const event = JSON.parse(line);
      // Each line of the transcript of a sub-agent is a sidechain (see subagents).
      if (!event.isSidechain || sessionId.includes("/")) events.push(event);
    } catch {}
  }
  return events;
}

// The last turns of a session, oldest first: the prompts, the text of the answers,
// and one short line for each tool call. Claude Code keeps the session in one
// transcript across resumed turns, so this is the full history.
// An edit or a write also gives its changed lines, as Claude Code shows them.
// A turn also gives the pictures, videos and sounds that it names (media.ts).
type Hunk = { old: number; new: number; lines: string[] };
// A tool call with no result yet is `running`, for example a build that the agent waits for.
// With `full` (the Context tab), a tool call also gives its ID, the first lines of its result (`out`, and `more` lines
// after them) and `error`, and the thinking of the agent shows as its own turn, as in the terminal of Claude Code.
type Turn = {
  who: "user" | "assistant" | "tool" | "thinking";
  text: string;
  diff?: Hunk[];
  media?: Media[];
  running?: true;
  id?: string;
  out?: string[];
  more?: number;
  error?: true;
};
// The transcript keeps a slash command as XML tags. This gives it back as the user typed it.
// The voice-call block is context for the agent only, so the user sees only the request. The images block shows as the
// pictures of the turn (turns), not as text. Claude Code joins queued messages into one turn, so a turn can have more
// than one block.
// A message that a sub-agent gets with SendMessage is a meta turn in its transcript, in words that Claude Code puts around it.
// It shows as the user typed it.
const RELAYED = /^The coordinator sent a message while you were working:\n([\s\S]*?)\n\nAddress this before completing your current task\.$/;
// A message to a terminal session (peerSend) is a meta turn too, in the words of Claude Code for a message from another
// session, after the words of the bridge (FROM_USER). It also shows as the user typed it.
const PEER = /^(?:Another Claude session|A peer session) sent a message(?: while you were working)?:\n([\s\S]*?)\n\nThis came from another Claude session[\s\S]*$/;
const FROM_USER = "The user sent this from Yonder, their voice app, as a follow-up in this conversation:\n\n";
// Claude Code writes "No response requested." in place of a reply that the safety classifier of Anthropic stopped, after
// its notice "... safeguards stopped the response above". The app names the classifier in its place. Else the agent
// shows only "No response requested.", and the user thinks that the relay stalled.
const CLASSIFIER = /safeguards stopped the response|stopped by a safety classifier/;
const STOPPED = "Anthropic's safety classifier stopped this reply.";
const classified = (events: Record<string, any>[]) =>
  events.some((e) => (e.type === "system" || e.isMeta) && CLASSIFIER.test(String(e.content ?? e.message?.content ?? "")));
const noReply = (event: Record<string, any>, text: string) => event.message?.model === "<synthetic>" && text.trim() === "No response requested.";
const unstopped = (flagged: boolean, event: Record<string, any>, text: string) => (flagged && noReply(event, text) ? STOPPED : text);
// Claude Code also writes "No response requested." when a turn ends with no text from the model, such as after a tool
// result with no classifier notice. Then it tells the user nothing, so it does not show.
const visible = (flagged: boolean, event: Record<string, any>, text: string) => !!text.trim() && (flagged || !noReply(event, text));
// A location that the user attached is a pasted file (attachLocation in src/App.tsx). Its words take the place of its
// block, so the chat of the app shows a map of it.
const located = (block: string) =>
  block.split("\n").filter((l) => l.startsWith(`${PASTES}${sep}`) && existsSync(l)).map((l) => readFileSync(l, "utf8")).filter((t) => t.startsWith("My location: ")).join("\n\n");
const typed = (text: string) => {
  text = text.replace(/<pasted-text>([\s\S]*?)<\/pasted-text>/g, (block, inner) => located(inner) || block);
  // Each block that the bridge adds goes (see message_worker): the pictures, videos and recordings show as media, not
  // as their paths, not as text in the bubble of the user.
  text = text.replace(/<(voice-call|device|images|pasted-text|files|screen-recording|videos|from)>[\s\S]*?<\/\1>/g, "").replace(/\n{3,}/g, "\n\n").replace(RELAYED, "$1").replace(PEER, "$1").replace(FROM_USER, "");
  const name = text.match(/<command-name>(.*?)<\/command-name>/)?.[1];
  return name ? `${name} ${text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] ?? ""}` : text;
};
// An attached video or screen recording is a folder, with video.mp4, video.mov or screen.mov in it. This names the video file, so
// that it shows in the bubble of the user (findMedia keeps only a file that exists).
const clips = (text: string) =>
  text.replace(/<(videos|screen-recording)>([\s\S]*?)<\/\1>/g, (_, _tag, inner: string) =>
    inner.split("\n").filter((l) => isAbsolute(l)).flatMap((l) => [`${l}/video.mp4`, `${l}/video.mov`, `${l}/screen.mov`]).join("\n"));
// The bytes of a local picture as a short key, so that a copy of a picture that the user attached does not show again.
// An agent can copy an attached picture to read it, and else the copy shows again in its answer. The key is kept
// by the path and the time of the change, so each file is read one time.
// shortcut: the keys stay for the life of the bridge, about 60 bytes for each picture.
const prints = new Map<string, string>();
const printOf = (m: Media) => {
  if (m.kind !== "image" || !isAbsolute(m.src)) return m.src;
  const key = `${m.src}:${m.v}`;
  if (!prints.has(key)) prints.set(key, (() => { try { return Bun.hash(readFileSync(m.src)).toString(36); } catch { return m.src; } })());
  return prints.get(key)!;
};
// The last item of a list that passes a test. The TypeScript lib of the bridge has no findLast.
function lastOf<T>(list: T[], ok: (item: T) => unknown): T | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (ok(list[i])) return list[i];
}
// The error of a run that a CLI wrote to stderr: the lines that name an error, else the last 3 lines.
function stderrOf(base: string) {
  const lines = textOf(`${base}.err`).split("\n").map((l) => l.trim()).filter(Boolean);
  const errors = lines.filter((l) => /error/i.test(l));
  return (errors.length ? errors : lines).slice(-3).join("\n");
}
// The text of a file, or "" when it does not exist.
const textOf = (path: string) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};
// The turns of an agent in another CLI, oldest first, from the logs of Yonder: the prompt of each turn, then the text
// and the tool calls of the CLI. As in turns, a picture, video or sound shows one time, at its newest mention, and a
// picture that the user attached shows only in the message of the user.
async function runTurns(w: Worker, count: number, bytes = 512_000) {
  const cli = CLIS[w.cli!];
  const out: Turn[] = [];
  for (const base of w.runs ?? []) {
    const prompt = textOf(`${base}.txt`);
    if (prompt) out.push({ who: "user", text: typed(prompt).trim().slice(0, 20_000), media: findMedia(clips(prompt)) });
    for (const s of cli ? await runSteps(cli, `${base}.jsonl`, bytes) : []) {
      if (s.text?.trim()) out.push({ who: "assistant", text: s.text.trim().slice(0, 20_000), media: findMedia(s.text) });
      else if (s.tool) out.push({ who: "tool", text: describe(w.path, s.tool) });
      else if (s.error) out.push({ who: "assistant", text: `${cli!.name}: ${s.error}` });
    }
  }
  const attached = new Set(out.filter((t) => t.who === "user").flatMap((t) => t.media ?? []).map(printOf));
  const seen = new Set<string>();
  for (const t of out.reverse()) {
    const media = (t.media ?? []).filter((m) => !seen.has(m.src) && (t.who === "user" || !attached.has(printOf(m)))).slice(0, 8);
    for (const m of media) seen.add(m.src);
    if (media.length) t.media = media;
    else delete t.media;
  }
  return out.reverse().slice(-count);
}
async function turns(w: Worker, count: number, bytes?: number, full = false) {
  if (w.cli) return runTurns(w, count, bytes);
  const out: Turn[] = [];
  // The result of a tool call comes after the call, so it comes first here, newest first.
  const diffs = new Map<string, Hunk[]>();
  const results = new Map<string, { media?: Media[]; text: string; error?: boolean }>();
  // Each picture, video or sound shows one time, at its newest mention. That is often the
  // last message, where the agent names what it made. At most 8 for each turn. A picture that the user attached shows
  // only in the message of the user, and not again where the agent reads it or a copy of it (printOf).
  const events = await transcript(w.path, w.sessionId, bytes);
  const flagged = classified(events);
  const attached = new Set(
    events
      .filter((e) => e.type === "user" || e.attachment?.type === "queued_command")
      .flatMap((e) => { const c = e.message?.content ?? e.attachment?.prompt; return typeof c === "string" ? [c] : Array.isArray(c) ? c.map((b) => b.text ?? "") : []; })
      .flatMap((text) => [...text.matchAll(/<images>([\s\S]*?)<\/images>/g)].flatMap((m) => findMedia(m[1]).map(printOf))),
  );
  const seen = new Set<string>();
  const fresh = (text: string, tool?: boolean, user?: boolean): { media?: Media[] } => {
    const media = findMedia(text, tool).filter((m) => !seen.has(m.src) && (user || !attached.has(printOf(m)))).slice(0, 8);
    for (const m of media) seen.add(m.src);
    return media.length ? { media } : {};
  };
  for (const event of events) {
    const content = event.message?.content;
    // A message that came in the middle of a turn (typeIn, or typed in Claude Code) is an attachment after a tool result.
    const midTurn = event.type === "attachment" && event.attachment?.type === "queued_command" && event.attachment.commandMode === "prompt";
    if (midTurn && typeof event.attachment.prompt === "string" && event.attachment.prompt.trim()) {
      const text = event.attachment.prompt;
      out.push({ who: "user", text: typed(text).trim().slice(0, 20_000), ...fresh(clips(text), false, true) });
      if (out.length >= count) break;
      continue;
    }
    if ((event.type !== "assistant" && event.type !== "user") || (event.isMeta && !RELAYED.test(content) && !PEER.test(content)) || event.isCompactSummary) continue;
    const diff = event.toolUseResult && patch(event.toolUseResult);
    if (diff && Array.isArray(content) && content[0]?.tool_use_id) diffs.set(content[0].tool_use_id, diff);
    const blocks = typeof content === "string" ? [{ type: "text", text: content }] : [...(content ?? [])].reverse();
    for (const block of blocks) {
      // Claude Code tells the agent that a background command ended in a user turn. The user did not type it, so it
      // does not show. Else it shows in a blue bubble as a message of the user.
      if (block.type === "text" && event.type === "user" && block.text.trimStart().startsWith("<task-notification>")) continue;
      if (block.type === "text" && visible(flagged, event, block.text))
        out.push({ who: event.type, text: typed(unstopped(flagged, event, block.text)).trim().slice(0, 20_000), ...fresh(event.type === "user" ? clips(block.text) : block.text, false, event.type === "user") });
      else if (block.type === "tool_result") {
        const text = resultText(block);
        results.set(block.tool_use_id, { ...fresh(text, true), text, error: block.is_error });
      } else if (block.type === "tool_use") {
        const diff = diffs.get(block.id);
        const result = results.get(block.id);
        // A picture that the agent read shows too, for example a vsb result that it downloaded to look at.
        const read: { media?: Media[] } = block.name === "Read" ? fresh(`\`${block.input?.file_path}\``) : {};
        const media = [...(result?.media ?? []), ...(read.media ?? [])];
        const detail = full && { id: block.id, ...(result && !diff && firstLines(block.name, result.text)), ...(result?.error && { error: true as const }) };
        out.push({ who: "tool", text: full ? head(w.path, block) : describe(w.path, block), ...(diff && { diff }), ...(media.length && { media }), ...detail, ...(!result && { running: true as const }) });
      } else if (full && block.type === "thinking" && block.thinking?.trim()) out.push({ who: "thinking", text: block.thinking.trim().slice(0, 20_000) });
    }
    if (out.length >= count) break;
  }
  return out.slice(0, count).reverse();
}

// The full input and result of one tool call, for a tap on the call in the Context tab. The list of the turns has only
// the first lines, because the app reads it every 3 seconds.
async function toolCall(w: Worker, id: string) {
  let input: unknown;
  let output = "";
  for (const e of await transcript(w.path, w.sessionId, 4_000_000))
    for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
      if (b.type === "tool_use" && b.id === id) input = b.input;
      if (b.type === "tool_result" && b.tool_use_id === id) output = resultText(b);
    }
  if (input === undefined) throw new Error("No such tool call");
  return { input, output: output.length > 100_000 ? `${output.slice(0, 100_000)}\n… ${output.length - 100_000} more characters` : output };
}

// The words of a prompt or an answer, without the images and the recording that the app adds.
const said = (t: Turn) => t.text.split(/<images>|<pasted-text>|<screen-recording>/)[0].trim();

// The last steps of a session, so that an agent can read into it.
const steps = async (w: Worker, count = 12) =>
  (await turns(w, count)).map((t) => `${t.who}: ${t.who === "tool" ? t.text : t.text.slice(0, 400)}`);

// The status of a background session, from the state that the agent view of Claude Code shows.
const STATES: Record<string, Status | undefined> = { working: "running", blocked: "waiting", done: "done", failed: "failed" };
const fromState = (state?: string) => STATES[state ?? ""];
// Claude Code can leave a finished background session "working" after its turn ended, with an idle process.
// Such a session is done.
// A background shell keeps the process "busy". A new turn starts idle for a moment, so the check waits 30
// seconds after the last step and after the start of the turn.
// A turn that ended while a background shell runs also counts: Claude Code lists it as working and busy until the shell
// ends, but a turn that waits on a Monitor as done. Else an agent that waits for another agent stays on the Tasks tab
// for minutes. When the shell ends, its notice starts a new turn, and the agent runs again.
// `waits` is false for an agent that closes itself or a run of a schedule: their close or retry would stop the shell.
const stuck = (a: Agent, ended: boolean, since: number, waits: boolean) =>
  a.state === "working" && (a.status === "idle" || waits) && ended && Date.now() - since > 30_000;
// Claude Code lists the whole session as blocked while one sub-agent waits for an approval, also when the main turn runs on.
// Else an agent works on the Done tab: a sub-agent from before a restart of its session can wait on an approval that no hook
// gets. The time when the bridge first saw each block, by worker. A main step after it means the agent runs.
const blockedSince = new Map<string, number>();
const runsOn = (ended: boolean, lastStep: number, since: number) => !ended && lastStep > since + 5000;
// A running agent whose turn ended still runs a background task, such as a wait or a Monitor: the app then shows
// "Monitoring", and "Yondering…" only while a turn runs. Else an agent that waits for a check shows "Yondering…" for hours.
const monitoringOf = (status: Status, last: { ended: boolean; watching: number }): Worker["monitoring"] =>
  status !== "running" ? undefined : last.ended ? "only" : last.watching ? "also" : undefined;

// The Claude Code sessions on this Mac, from `claude agents --json --all`. They
// give the state of each worker, and the other sessions, for example a session
// in a terminal. Read again at most every 2 seconds, and at least every 2
// seconds, so that the bridge sees a finished worker without a client.
// allSessions gives the workers, then the other sessions. It reads the workers after the read of the sessions, because
// a read can make a session a worker (adopt).
let sessions: Worker[] = [];
let sessionsAt = 0;
let reading: Promise<void> | undefined;
async function allSessions() {
  if (!reading && Date.now() - sessionsAt > 2000) {
    sessionsAt = Date.now();
    reading = refresh()
      .catch((e) => console.error("Cannot read the Claude Code sessions:", e))
      .finally(() => (reading = undefined));
  }
  await reading;
  // Outside sessions off (General in the Settings): the lists and the tools show only the agents of Yonder.
  return config().outsideSessions === false ? [...state.workers] : [...state.workers, ...sessions];
}
setInterval(allSessions, 2000);

async function refresh() {
  const list = await agents();
  const bySession = new Map<string, Agent[]>();
  for (const a of list) bySession.set(a.sessionId.toLowerCase(), [...(bySession.get(a.sessionId.toLowerCase()) ?? []), a]);
  // After a change of profile the session is in two folders (copySession), and the old folder lists it as stopped. The
  // folder of the current profile wins. Else agents on the new profile show as closed while they run.
  const listed = (w: Worker) => {
    const all = bySession.get(w.sessionId.toLowerCase()) ?? [];
    return all.find((a) => a.dir === claudeDir(profileOf(w.profile))) ?? all.find((a) => a.pid) ?? all[0];
  };
  for (const w of state.workers) {
    if (!w.sessionId && !w.runs?.length) continue; // A new agent that starts now.
    await (w.cli ? followRun(w) : follow(w, listed(w))).catch((e) => console.error(`Cannot follow worker ${w.id}:`, e));
    sendQueued(w);
  }
  const found = await readSessions(list);
  // A live background session that this bridge started, but whose agent it lost, becomes that agent again. A restart of
  // the bridge between `claude --bg` and its answer (send) drops the agent at the start, and else its session shows as a
  // background session that Yonder did not start.
  for (const s of found) {
    const id = s.kind === "background" ? startOf(s) : undefined;
    // A start that runs now (send) keeps the start ID as its id until Claude Code lists the session.
    if (id && !state.workers.some((w) => w.id === id || w.startId === id)) adopt(s, id);
  }
  sessions = found.filter((s) => !state.workers.some((w) => w.sessionId === s.sessionId));
  preload([...state.workers, ...sessions]);
}

// Follows one worker through its background session. Claude Code gives the
// status: working, blocked (it waits on the user) or done. Yonder only closes
// and removes sessions. The user can also continue a worker in the agent view
// of Claude Code, and Yonder follows it. A worker of an older bridge ran
// `claude -p`: while it runs, Claude Code lists it as a terminal session
// without a state.
async function follow(w: Worker, a?: Agent) {
  const live = !!a?.pid;
  // A question for Allow or Deny holds the status at waiting, while Claude Code says working. It goes away when Claude Code
  // no longer waits on it: the user answered in a terminal, or Bypass denied an rm of a critical path by itself after 2
  // minutes. Claude Code lists the question a moment after the hook asks, so the check waits 10 seconds.
  if (w.ask && live) {
    // Any wait counts, because the prompt of a sub-agent can have another `waitingFor` than "permission prompt".
    if (w.ask.kind || a!.status === "waiting" || Date.now() - w.updatedAt < 10_000) return;
    asks.get(w.ask.id)?.end({ allow: false, expired: true });
  }
  // A closed worker stays closed, and a worker that the user marked as completed stays done, until its session works again.
  // Claude Code lists a stopped session as working for a moment, so the mark holds for 8 seconds.
  if ((w.status === "closed" || w.marked) && !(live && a!.state === "working" && !(w.marked && Date.now() - w.updatedAt < 8000))) return;
  delete w.marked;
  // Claude Code lists a new turn after a moment, and until then the old state of the session.
  if (w.status === "running" && Date.now() - w.startedAt < 8000 && !(live && a!.state === "working")) return;
  // A session without a pid has ended: it finished, it failed, or someone closed it outside Yonder. A failed session shows
  // as failed, not closed, so the user sees the error.
  const known: Status | undefined = a?.state ? (live ? fromState(a.state) : a.state === "done" || a.state === "failed" ? a.state : "closed") : undefined;
  if (known !== "waiting") blockedSince.delete(w.id);
  else if (!blockedSince.has(w.id)) blockedSince.set(w.id, Date.now());
  // A blocked agent reads its transcript at each check, to see a main turn that runs on (runsOn).
  if (known && known === w.status && known !== "running" && known !== "waiting" && w.result) return;
  if (!known && !live && w.status !== "running") return; // A worker of an older bridge that ended.
  const last = await lastTurn(w.path, w.sessionId);
  // The user stopped or completed the worker while the transcript loaded. Without this, a stop in that moment kept the
  // worker as running for good, because the mark then stops each later check.
  if (w.marked) return;
  const status: Status =
    known === "running" && stuck(a!, last.ended, Math.max(last.at, w.startedAt, a!.startedAt ?? 0), last.endedAt >= w.startedAt && !w.closeWhenDone && !w.schedule) ? "done"
    : known === "waiting" && runsOn(last.ended, last.at, blockedSince.get(w.id)!) ? "running"
    : known ?? (live ? (a!.status === "busy" ? "running" : "done") : last.ended ? "done" : last.at ? "closed" : "failed");
  // A turn that the user interrupted waits for the next message, as after stop_worker. Claude Code can list it as
  // working with an idle process for good, and else the app shows "Yondering…" after a stop.
  if (status === "running" && last.stopped >= w.startedAt) {
    if (w.status === "waiting") return;
    Object.assign(w, { status: "waiting", activity: "", monitoring: undefined, result: "The user stopped this turn.", unread: false, attention: false, answered: false, closeWhenDone: undefined, updatedAt: Date.now() });
    return save();
  }
  // A question that no hook gets, such as a sandbox request, has an answer only in a terminal, so the result says so.
  const other = live && ["sandbox request", "worker request", "dialog open"].includes(a!.waitingFor ?? "") ? a!.waitingFor : "";
  if (other) last.text = `${last.text}\n\nIt waits for you in the terminal (${other}). Open it in the terminal to answer.`.trim();
  // The end of the turn before this one does not count: until the transcript has the new prompt, the agent works.
  await settle(w, status, { ...last, monitoring: monitoringOf(status, { ...last, ended: last.ended && last.endedAt >= w.startedAt }) }, "Claude Code did not start the session.");
}

// Follows the turn of an agent in another CLI (clis.ts), from its process and its log. The process runs: the agent
// runs, with its last step as the activity. The process ended: the turn is done, with the last text as the result,
// or failed, with the error. A stop, a close and a mark of the user set the status themselves.
async function followRun(w: Worker) {
  const base = w.runs?.at(-1);
  const cli = CLIS[w.cli!];
  // A new turn has a moment to start, and a stop in resume has a moment to end the turn before it.
  if (!base || !cli || w.status !== "running" || Date.now() - w.startedAt < 3000) return;
  if (!w.sessionId && (w.sessionId = await sessionOf(cli, `${base}.jsonl`))) save();
  let live = !cli.acp && runs(w);
  const list = await runSteps(cli, `${base}.jsonl`, live || cli.acp ? 512_000 : 4_000_000);
  // A turn in the ACP host runs until the host writes its end, or until the host stops.
  if (cli.acp) live = alive(w.pid) && !list.some((s) => s.done || s.error);
  // A stop or a new turn came while the log loaded.
  if (w.runs?.at(-1) !== base || w.status !== "running") return;
  const text = lastOf(list, (s) => s.text?.trim())?.text?.trim() ?? "";
  const step = lastOf(list, (s) => s.text?.trim() || s.tool);
  const model = lastOf(list, (s) => s.model)?.model ?? "";
  const activity = step?.tool ? describe(w.path, step.tool) : (step?.text?.trim().split("\n")[0].slice(0, 120) ?? "");
  const last = { text, activity, used: 0, model, cwd: "", prompt: textOf(`${base}.txt`) };
  if (live) return settle(w, "running", last);
  // Each CLI ends a good turn with an end event, so a turn with no end failed, also with some text, and so did a turn
  // with no text. The result is the error of the CLI, else the end of its stderr.
  const error = lastOf(list, (s) => s.error)?.error;
  const failed = !list.some((s) => s.done) || !text;
  await settle(w, failed ? "failed" : "done", last, `${cli.name}: ${(error || stderrOf(base) || "it stopped with no answer.").slice(0, 600)}`);
}

// The project that a Claude Code agent worked in during its last turn, from the folders in its tool calls: the paths of
// its reads and edits, and the paths in its Bash commands. Each tool call counts once for each project. It gives a
// project only when the agent worked there in 3 calls or more, and in more than twice as many calls as in its own project.
// The text of a write or an edit does not count, so a file that only names another project does not move the agent.
// An agent of the + button can start in the wrong project, and an agent that runs Bash in the Yonder folder works on
// Yonder.
// shortcut: only absolute paths count, so a plain "cd ../x" and the relative commands after it are not seen.
const PATHS = new RegExp(`(?:~|${HOME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})/[^\\s'"\`;|&)<>,\\\\]+`, "g");
async function workedIn(w: Worker): Promise<Project | undefined> {
  // The home folder as a project would take each path outside the other projects, such as ~/.claude.
  const ps = projects();
  // An agent of a workspace with no folder works across the computer, so it stays in its workspace.
  if (ps.some((p) => p.id === w.workspace && p.home === false)) return;
  // The scanned folders that are no workspace count too, as their projects did. A move to one makes it a workspace.
  const folders = scanned().filter((f) => !ps.some((p) => p.home !== false && p.path === f)).map((f): Project => ({ name: basename(f), path: f, starred: false }));
  const all = [...ps.filter((p) => p.home !== false && p.path !== HOME), ...folders].sort((a, b) => b.path.length - a.path.length);
  const counts = new Map<Project, number>();
  // The events come newest first, so the last turn ends at the prompt of the user, which is not a tool result.
  for (const e of await transcript(w.path, w.sessionId)) {
    const content = e.message?.content;
    if (e.type === "user" && (typeof content === "string" || !content?.some((b: any) => b.type === "tool_result"))) break;
    if (e.type !== "assistant") continue;
    for (const block of content ?? []) {
      if (block.type !== "tool_use") continue;
      const { content: _c, new_string: _n, old_string: _o, ...input } = block.input ?? {};
      const paths = JSON.stringify(input).match(PATHS) ?? [];
      const hit = new Set(paths.map((p) => expand(p)).map((p) => all.find((x) => p === x.path || p.startsWith(`${x.path}${sep}`))).filter((p) => !!p));
      for (const p of hit) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  const own = [...counts].find(([p]) => p.path === w.path)?.[1] ?? 0;
  const [best, n] = [...counts].filter(([p]) => p.path !== w.path).sort((a, b) => b[1] - a[1])[0] ?? [];
  return best && n! >= 3 && n! > 2 * own ? best : undefined;
}

// The end of a follow: the new status and result, the dots, a push to the phones, and the next turn of the queue.
// `failure` is the result of a failed turn.
async function settle(w: Worker, status: Status, last: { text: string; activity: string; used: number; model: string; cwd: string; prompt: string; apiError?: boolean; monitoring?: Worker["monitoring"] }, failure = "") {
  const before = JSON.stringify(w);
  // A run of a schedule whose session died is a failed run, not a close: it gets a retry and a push (below). A session can
  // die with its daemon (freeDaemon), and else the run shows as closed, with no push. Each
  // later read of the dead session gives "closed" again, and stays quiet as "failed". A session that dies after its turn stays closed.
  if (status === "closed" && w.schedule && (w.status === "running" || w.status === "failed")) [status, failure] = ["failed", "The session stopped before the end of the task."];
  // A run of a schedule whose turn ends on an error of the API failed, with no need for Clef, such as
  // "API Error: Your computer went to sleep mid-response" while the Mac sleeps. Else it closes with no retry.
  if (status === "done" && w.schedule && w.status === "running" && last.apiError) [status, failure] = ["failed", last.text];
  let closing: { failed?: boolean } | undefined; // The turn ended, and the agent must close when done.
  if (last.used) w.context = { used: last.used, window: state.windows[last.model] ?? w.context?.window };
  // An alias such as "fable" becomes the full name of the model.
  if (last.model) w.model = last.model;
  w.cwd = last.cwd && last.cwd !== w.path ? last.cwd : undefined;
  if (status === "running") w.activity = last.activity || w.activity;
  w.monitoring = status === "running" ? last.monitoring : undefined;
  // A turn that ended because its CLI is signed out shows the card of that CLI (lostLogin), and a good turn hides it. A
  // profile with its own folder signs in on its own page.
  const cliId = w.cli ?? (profileOf(w.profile)?.own ? undefined : "claude");
  if (cliId && status !== "running" && w.status === "running") {
    if (w.cli ? status === "failed" && SIGNED_OUT_OTHER.test(failure) : SIGNED_OUT_CLAUDE.test(`${failure}\n${last.text}`.trim())) lostLogin(cliId, cliName(cliId));
    else if (status === "done" && loginOf(cliId)?.step === "signed-out") stopLogin(cliId);
  }
  const ownProfile = !w.cli && profileOf(w.profile)?.own ? profileOf(w.profile) : undefined;
  if (ownProfile && status !== "running" && w.status === "running" && SIGNED_OUT_CLAUDE.test(`${failure}\n${last.text}`.trim())) lostProfile(claudeDir(ownProfile));
  // The login of Claude Code expired, and another `claude`, such as one of `ask`, refreshed it at the same moment. The turn
  // then stops at once with "Could not refresh your login because another Claude Code process is refreshing it". A
  // "Continue." a minute later works. So the queue
  // sends one "Continue." 30 seconds later, and the phones get no push.
  if (status !== "running" && w.status === "running" && !w.cli && !w.queue?.length && !loginRetried.has(w.id) && /another Claude Code process is refreshing it/.test(last.text)) {
    loginRetried.add(w.id);
    w.queue = ["Continue."];
    queueTries.set(w.id, Date.now() + 20_000);
  }
  // Claude Code refused the turn for the limit of the account, such as "You've hit your session limit · resets 2am". The
  // folder is full until the reset (limitHit), and the agent continues at once on another profile with room (roomFor),
  // with no push. Two full profiles do not loop: the second refusal finds no profile with room. A queued message moves
  // the agent too. The meter of the profile can lag, so the refusal of Claude Code decides, not the meter.
  else if (status !== "running" && w.status === "running" && !w.cli && (await limitHit(last.text, ownProfile ? claudeDir(ownProfile) : undefined)) && !w.queue?.length && (await roomFor(w))) {
    w.queue = ["Continue."];
  }
  // Claude Code can say that a turn ended before the transcript has the text of its answer. Else the agent is done with
  // no result for good, and Grok knows nothing of its answer. The next read gets the text.
  // shortcut: a worker with no text at all reads its transcript every 2 seconds.
  else if (status === w.status) w.result ||= last.text;
  else {
    const judged = status === "done" ? await worthTelling(last.prompt || w.task, last.text || w.result) : undefined;
    Object.assign(w, {
      result: status === "failed" ? failure : last.text || w.result,
      activity: "",
      // Each new result is unread. A waiting or failed worker always needs the user. A done worker needs the user only when Clef says so.
      // A turn that runs again (runsOn) has no new result.
      unread: status !== "closed" && status !== "running",
      attention: judged?.attention ?? (status !== "closed" && status !== "running"),
      answered: judged?.answered ?? false,
    });
    // A run of a schedule that failed, or that Clef judges not done (worthTelling), continues in the same session with no
    // push, up to the retries of its schedule. After the last one, the push says "Failed", so a run
    // that dies in the middle does not go unseen.
    // A run that Clef could not judge checks its own work in one more turn, so a run with no check never counts as done.
    // A run cut by a sleep continues for free, at the next full wake (sendQueued) (retryOf).
    // shortcut: a resume that fails each time (sendQueued) tries again each 10 seconds with no push; give up after N sends if it happens.
    const s = w.schedule && w.status === "running" ? state.schedules.find((x) => x.id === w.schedule) : undefined;
    const bad = !!s && (status === "failed" || (status === "done" && judged?.failed !== false));
    const retry = bad && !w.queue?.length ? retryOf(status, failure, judged?.failed, w.tries ?? 0, s!.retries ?? 2) : undefined;
    if (retry) {
      if (retry.counts) w.tries = (w.tries ?? 0) + 1;
      w.queue = [retry.text];
      console.log(`Schedule ${s!.name}: agent ${w.num} continues (${retry.counts ? `retry ${w.tries}` : "a free retry after a sleep"}): ${endOf(status === "failed" ? failure : w.result)}`);
    }
    // A run that ends well goes into the log once: closeWhenDone of the run (runSchedule) is still on only for its own turns.
    if (s && status === "done" && !bad && w.closeWhenDone)
      appendFileSync(RUNS_LOG, JSON.stringify({ at: Date.now(), schedule: s.id, name: s.name, agent: w.num, tries: w.tries ?? 0, result: endOf(w.result) }) + "\n");
    // The flag of closeWhenDone holds for the turns of its message, also the turns of the queue. It stays on until
    // closeItself decides, so a restart of the bridge during the wait for the summary does not lose the close (closeLeft).
    if (w.closeWhenDone && !w.queue?.length) {
      if (status === "closed") delete w.closeWhenDone;
      else closing = { failed: judged?.failed };
    }
    // An agent that stops (done, failed or waiting on the user) sends a push to the phones, unless its queue starts the next
    // turn at once. An agent that must close when done sends its own push (closeItself).
    const tried = w.tries ? ` after ${w.tries} ${w.tries === 1 ? "retry" : "retries"}` : "";
    if (status !== "closed" && status !== "running" && !w.queue?.length && !closing) push(pushTitle(w), `${status === "failed" || bad ? `Failed${tried}: ` : status === "waiting" ? "Waits for you: " : ""}${endOf(w.result)}`, w);
  }
  // A Claude Code agent that worked in another project moves there when its turn ends, as move_worker does.
  if (w.status === "running" && status === "done" && !w.cli && !w.kind && w.sessionId) {
    const found = await workedIn(w).catch(() => undefined);
    const to = found && adoptFolder(found);
    if (to) {
      console.log(`Agent ${w.num} worked in ${to.name}, so it moves there from ${w.project}.`);
      Object.assign(w, { project: to.name, workspace: to.id, path: to.path, cwd: undefined });
    }
  }
  w.status = status;
  if (status !== "closed") keepNum(w);
  if (JSON.stringify(w) === before) return;
  w.updatedAt = Date.now();
  save();
  if (closing) void closeItself(w, closing.failed).catch((e) => console.error(`Agent ${w.num} cannot close itself:`, e));
}

// The title of a push about an agent: its number or name, and its title.
const pushTitle = (w: Worker) => `${w.num ? `${pushName(w)} · ` : ""}${w.name}`;
// The last paragraph of a result, for a push: plain text, 200 characters at most.
const endOf = (result: string) => {
  const end = result.trim().split(/\n\s*\n/).pop()!.replace(/[*_`#>]/g, "").trim();
  return end.length > 200 ? `${end.slice(0, 199)}…` : end;
};

// An agent with closeWhenDone closes itself when its turn ends, so that the voice agent need not come back to close it.
// The bridge decides, not the agent:
// the agent stays open when it failed, asks a question, or leaves something for the user (keepOpen). It then gets the
// purple dot, and the phones get a push with the reason. A question for Allow or Deny comes in the middle of the turn,
// so the agent waits with the flag on, and closes after the rest of the turn. The close is the close of close_worker,
// so undo takes it back. It takes the place of the last close of the user in undo.
async function closeItself(w: Worker, failed?: boolean) {
  // The summary comes in about 3 seconds, also for the app. Without it after 15 seconds, the result and Clef decide alone.
  await Promise.race([summary(w), Bun.sleep(15_000)]);
  const why = keepOpen(w.status, w.result, failed, needs(summaryOf(w) ?? ""), nextOf(w));
  await inTurn(w.id, async () => {
    // A new message, a stop, a close or a removal came while the summary loaded.
    if (!state.workers.includes(w) || w.marked || w.status === "running" || w.status === "closed") return;
    if (why) {
      Object.assign(w, { attention: true, answered: false, closeWhenDone: undefined });
      save();
      // A reason with its question or next step says enough ("Kept open: it asks: Push it now?").
      return push(pushTitle(w), why.includes(": ") ? `Kept open: ${why}` : `Kept open: ${why}. ${endOf(w.result)}`, w);
    }
    last = { tool: "close_worker", to: "closed", before: [{ w, was: { ...w, closedItself: undefined } }] };
    await closeOne(w, true);
    sessionsAt = 0; // Read the sessions again on the next call.
    push(pushTitle(w), `Closed itself: ${endOf(w.result)}`, w);
  });
}

// A bridge that stopped while an agent with closeWhenDone waited for its close closes it at the start. Else a restart
// during the wait of up to 15 seconds loses the close.
async function closeLeft() {
  for (const w of state.workers)
    // A question for Allow or Deny (ask) comes in the middle of the turn, so its agent closes after the rest of the turn.
    if (w.closeWhenDone && !w.queue?.length && !w.ask && ["done", "failed", "waiting"].includes(w.status))
      void worthTelling(w.task, w.result).then((j) => closeItself(w, j.failed)).catch((e) => console.error(`Agent ${w.num} cannot close itself:`, e));
}

// Closes an agent of Yonder: close_worker, and an agent that closes itself (closeItself).
async function closeOne(w: Worker, itself = false, by?: Worker["closedBy"]) {
  await halt(w);
  // A closed agent needs nothing from the user, so it loses its dots.
  Object.assign(w, { status: "closed", activity: "", unread: false, attention: false, answered: false, marked: undefined, saved: undefined, closeWhenDone: undefined, closedItself: itself || undefined, closedBy: itself ? undefined : by, updatedAt: Date.now() });
  save();
}

// One message_worker call at a time for each agent. Grok can send one request in two or three calls at
// once ("There's a screenshot attached.", "Continue."). Each call saw the agent as not running, so each
// call resumed the session, and Claude Code started a copy for each extra call. This made
// stray copies with no turn.
// stop_worker, unqueue and the send of the queue (sendQueued) also change the queue, so they wait in the same line.
const sending = new Map<string, Promise<unknown>>();
async function inTurn<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const turn = sending.get(key)?.catch(() => {}).then(fn) ?? fn();
  sending.set(key, turn);
  try {
    return await turn;
  } finally {
    if (sending.get(key) === turn) sending.delete(key);
  }
}

// When a turn ends, the poll sends the queue as the next turn. A send that fails tries again each 10 seconds. Else
// a failed send leaves the agent done with its queue, and the user must tap Send now. A closed worker keeps its queue, and so does a worker that the user stopped
// (marked): the next message_worker sends it. The send waits in the line of the agent (inTurn), so it never races
// Send now, Edit or Delete.
const queueTries = new Map<string, number>();
const loginRetried = new Set<string>();
function sendQueued(w: Worker) {
  // A run of a schedule waits for a full wake: in a dark wake the Mac sleeps again soon, and cuts the turn (awakeMac).
  const due = () => w.queue?.length && w.status !== "running" && w.status !== "closed" && !w.marked && (!w.schedule || awakeMac());
  if (!due() || Date.now() - (queueTries.get(w.id) ?? 0) < 10_000) return;
  queueTries.set(w.id, Date.now());
  inTurn(w.id, async () => {
    if (!due()) return;
    try {
      await sendQueue(w, w.queue!);
      queueTries.delete(w.id);
    } catch (e) {
      console.error(`Cannot send the queue of worker ${w.id}:`, e);
      w.activity = `${w.queue!.length} queued messages not sent: ${(e as Error).message}`;
      save();
    }
  });
}

// Sends the first turn of a queue to a worker, and keeps the rest in its queue. A running worker stops its turn first.
// If the send fails, the queue stays as it was.
async function sendQueue(w: Worker, queue: string[], change: Pick<Worker, "model" | "effort" | "mode"> & { profile?: string } = {}) {
  const old = w.queue;
  const [text, rest] = nextTurn(queue);
  w.queue = rest.length ? rest : undefined;
  try {
    await resume(w, text, change);
  } catch (e) {
    w.queue = old;
    throw e;
  }
  save();
}

// A message to a running worker goes into its current turn, as a message that the user types in Claude Code while the
// agent works: Claude Code gives it to the agent after the next tool call. The bridge opens the live background session
// with `claude attach` in a terminal of Bun, types the message, presses Enter, and closes the terminal. The session
// keeps running. It types 4 characters at a time, because Claude Code takes a
// larger piece, also a bracketed paste of 655 characters, as pasted text: it then wraps the whole message in
// <pasted_content>, and the agent may not follow it. Enter in an open menu picks an item, so a message that opens
// one at its start (/ ! ? # & @) or has a tab does not go this way. It returns false when Claude Code did not take
// the message, and the message then waits in the queue of the bridge.
async function typeIn(w: Worker, text: string) {
  if (w.cli || /^[/!?#&@]/.test(text) || text.includes("\t") || !inRoster(w.sessionId)) return false;
  const since = Date.now();
  const decoder = new TextDecoder();
  let screen = "";
  const proc = Bun.spawn([CLAUDE, "attach", w.sessionId.slice(0, 8)], {
    cwd: w.path,
    env: { ...envOf(profileOf(w.profile)), TERM: "xterm-256color" },
    terminal: { cols: 120, rows: 40, data: (_t, d) => void (screen += decoder.decode(d, { stream: true })) },
  });
  try {
    // The prompt box is ready when the line under it shows.
    for (let i = 0; i < 40 && !screen.includes("for agents"); i++) await Bun.sleep(200);
    if (!screen.includes("for agents")) throw new Error("the prompt box of the session did not show");
    await Bun.sleep(300);
    // A space at the end closes the menu of an @ file or a path in the last word.
    const keys = `${text} `;
    for (let i = 0; i < keys.length; i += 4) {
      proc.terminal!.write(keys.slice(i, i + 4));
      await Bun.sleep(4);
    }
    await Bun.sleep(300);
    proc.terminal!.write("\r");
    // Claude Code writes the message to the transcript as "enqueue", or as a new prompt when the turn just ended.
    const sent = (e: Record<string, any>) =>
      Date.parse(e.timestamp) >= since &&
      ((e.type === "queue-operation" && e.operation === "enqueue" && e.content?.trim() === text.trim()) ||
        (e.type === "user" && typeof e.message?.content === "string" && e.message.content.trim() === text.trim()));
    for (let i = 0; i < 25; i++) {
      await Bun.sleep(200);
      if ((await transcript(w.path, w.sessionId, 256_000)).slice(0, 40).some(sent)) return true;
    }
    throw new Error("Claude Code did not take the message in 5 seconds");
  } catch (e) {
    console.error(`Cannot type a message into worker ${w.id}, so it waits in the queue:`, (e as Error).message);
    return false;
  } finally {
    proc.kill();
  }
}

// A slash command runs only at the start of a prompt, so it goes alone as one turn.
// The next turn is the first slash command, or the messages before the next slash command.
function nextTurn(queue: string[]): [string, string[]] {
  const cut = queue.findIndex((m, i) => i > 0 && m.startsWith("/"));
  const n = queue[0].startsWith("/") ? 1 : cut < 0 ? queue.length : cut;
  return [queue.slice(0, n).join("\n\n"), queue.slice(n)];
}

async function readSessions(all: Agent[]): Promise<Worker[]> {
  const ours = new Set(state.workers.map((w) => w.sessionId.toLowerCase()));
  // A session without a pid has ended.
  const list = all.filter((s) => s.sessionId && s.cwd && s.pid && !ours.has(s.sessionId.toLowerCase()) && !checkRun(s.cwd));
  // A session that ended gives its number back.
  const before = JSON.stringify(state.numbers);
  state.numbers = Object.fromEntries(list.filter((s) => state.numbers[s.sessionId]).map((s) => [s.sessionId, state.numbers[s.sessionId]]));
  for (const s of list) state.numbers[s.sessionId] ||= freeNum();
  if (JSON.stringify(state.numbers) !== before) save();
  // A session belongs to the deepest project that holds its folder, as on the screen: an agent in
  // ~/Sites/yonder/app is in the project "yonder".
  // A session in a scanned folder that is no workspace, such as ~/Developer/tool, makes it one (adoptFolder), as its
  // project showed in an older bridge. Else ~/Developer, a workspace too, would take it.
  const folders = list.length ? scanned() : [];
  for (const s of list) {
    const folder = folders.find((f) => s.cwd === f || s.cwd.startsWith(`${f}${sep}`));
    const ws = folder && deepestOf(s.cwd, projects());
    if (folder && (!ws || ws.path.length < folder.length)) adoptFolder({ name: basename(folder), path: folder, starred: false });
  }
  const known = projects();
  const projectOf = (cwd: string) => deepestOf(cwd, known)?.name ?? basename(cwd);
  return Promise.all(
    list.map(async (s): Promise<Worker> => {
      const last = await lastTurn(s.cwd, s.sessionId);
      // A background session gives the state of the agent view. A terminal session gives only busy or idle.
      const status: Status = stuck(s, last.ended, Math.max(last.at, s.startedAt ?? 0), false) ? "done" : fromState(s.state) ?? (s.status === "busy" ? "running" : "done");
      // Claude Code calls a session "yonder-92" until the user names it. The AI title says more.
      const folder = basename(s.cwd);
      const project = projectOf(s.cwd);
      const derived = !s.name || (s.name.startsWith(`${folder}-`) && s.name.length === folder.length + 3);
      const name = state.names[s.sessionId] ?? (derived ? last.title || s.name || folder : s.name);
      // The short ID of Claude Code, 8 characters. A worker keeps the 6-character ID of its first
      // session, also after it moves to a copy, so a session ID of 6 characters can be the same.
      return {
        id: s.sessionId.slice(0, 8).toLowerCase(), num: state.numbers[s.sessionId], sessionId: s.sessionId, name, project, workspace: deepestOf(s.cwd, known)?.id, path: s.cwd,
        task: last.prompt, status, activity: status === "running" ? last.activity : "", monitoring: monitoringOf(status, last), result: last.text, unread: false,
        startedAt: s.startedAt ?? Date.now(), createdAt: s.startedAt, updatedAt: last.at || s.startedAt || Date.now(),
        kind: s.kind === "background" ? "background" : "terminal",
        context: last.used ? { used: last.used, window: state.windows[last.model] } : undefined,
        pid: s.pid,
        // The profile whose folder lists the session, so that a stop or a resume reaches its daemon. Else
        // close_worker sends `claude stop` to the daemon of ~/.claude.
        profile: state.profiles.find((p) => p.own && p.cli === "claude" && claudeDir(p) === s.dir)?.id,
        model: last.model || undefined,
        effort: (last.effort as Worker["effort"]) || undefined,
        avatar: state.avatars[s.sessionId],
        cwd: last.cwd && last.cwd !== s.cwd ? last.cwd : undefined,
      };
    }),
  );
}

// The last thing that a session said or did, from the end of its transcript.
// The text that Claude Code writes as a user turn when the user interrupts a turn. The app shows it as "Interrupted".
const INTERRUPTED = /^\[Request interrupted by user/;
const interruptedBy = (content: unknown) =>
  typeof content === "string" ? INTERRUPTED.test(content) : Array.isArray(content) && content.some((b) => b.type === "text" && INTERRUPTED.test(b.text ?? ""));
async function lastTurn(cwd: string, sessionId: string) {
  const turn = { text: "", activity: "", at: 0, used: 0, model: "", effort: "", title: "", prompt: "", ended: false, endedAt: 0, watching: 0, cwd: "", stopped: 0, apiError: false };
  const events = await transcript(cwd, sessionId);
  // An agent that moved into a git worktree works there now, and its dev server runs there.
  turn.cwd = events.find((e) => e.cwd)?.cwd ?? "";
  // Claude Code says "busy" while a background shell runs, such as a dev server, even after the turn ended.
  const latest = events.find((e) => e.type === "user" || e.type === "assistant" || e.subtype === "turn_duration");
  turn.ended = latest?.subtype === "turn_duration" || latest?.message?.stop_reason === "end_turn";
  if (turn.ended) turn.endedAt = Date.parse(latest!.timestamp) || 0;
  // The background tasks that still run: a command with run_in_background, or a Monitor. The events come newest first,
  // so the end of a task comes before its start: a task-notification with a status (an event of a Monitor has none), or
  // a TaskStop. A notice that the session did not take before it stopped is only in the queue (queue-operation).
  // shortcut: only the last 512 KB of the transcript counts, and a task that died with its process stays open in it.
  const ends = new Set<string>();
  for (const e of events) {
    const content = e.message?.content ?? (e.attachment?.type === "queued_command" ? e.attachment.prompt : e.type === "queue-operation" ? e.content : undefined);
    for (const b of typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content : []) {
      if (b.type === "tool_use" && (b.name === "TaskStop" || b.name === "KillShell")) ends.add(b.input?.task_id ?? b.input?.shell_id);
      if (b.type === "text" && e.type !== "assistant")
        for (const n of (b.text ?? "").split("<task-notification>").slice(1)) if (n.includes("<status>")) ends.add(n.match(/<task-id>(\w+)/)?.[1] ?? "");
      const start = b.type === "tool_result" && resultText(b).match(/^(?:Command running in background with ID: |Monitor started \(task )(\w+)/)?.[1];
      if (start && !ends.has(start)) turn.watching++;
    }
  }
  // Escape in Claude Code, or stop_worker, ends the turn with this marker, the time of the stop.
  if (latest?.type === "user" && interruptedBy(latest.message?.content)) turn.stopped = Date.parse(latest.timestamp) || 0;
  turn.title = events.find((e) => e.type === "ai-title")?.aiTitle ?? "";
  turn.prompt = events.find((e) => e.type === "last-prompt")?.lastPrompt ?? "";
  const flagged = classified(events);
  for (const event of events) {
    if (event.type !== "assistant") continue;
    turn.at ||= Date.parse(event.timestamp) || 0;
    turn.used ||= event.message?.usage ? used(event.message.usage) : 0;
    // Claude Code writes "<synthetic>" for the messages that it makes itself, such as an API error.
    if (event.message?.model?.startsWith("claude")) turn.model ||= event.message.model;
    turn.effort ||= event.effort ?? "";
    for (const block of [...(event.message?.content ?? [])].reverse()) {
      if (!turn.activity && block.type === "tool_use") turn.activity = describe(cwd, block);
      if (block.type === "text" && visible(flagged, event, block.text)) {
        turn.text = unstopped(flagged, event, block.text.trim());
        turn.activity ||= turn.text.split("\n")[0].slice(0, 120);
        // The last text is an error of the API that Claude Code wrote itself, such as "API Error: Your computer went to sleep".
        turn.apiError = !!event.isApiErrorMessage;
        return turn;
      }
    }
  }
  return turn;
}

// An older bridge did not find the transcript of a worker that moved into a git worktree, so such a worker finished
// with no result.
for (const w of state.workers) if (w.status === "done" && !w.result) w.result = (await lastTurn(w.path, w.sessionId)).text;
// An app (a page of the Canvas tab) that the user did not save goes to the archive `appDays` after its last version
// (config.json, 7 by default, 0 keeps all), at the start and then once a day. The page of an agent that still runs stays.
const pruneApps = () => {
  const days = Number(config().appDays);
  canvas.prune(Number.isFinite(days) ? days : 7, (a) => !!a.worker && ["running", "waiting"].includes(state.workers.find((w) => w.id === a.worker)?.status ?? ""));
};
pruneApps();
setInterval(pruneApps, 86_400_000);
// The attachments of the agents (pictures, pastes, files and videos) go `fileDays` after they came (config.json, 30 by
// default, 0 keeps all), at the start and then once a day. A 4K video is 300 MB.
const pruneFiles = () => {
  const days = Number(config().fileDays ?? 30);
  if (!(days > 0)) return;
  for (const dir of [IMAGES, PASTES, FILES, VIDEOS])
    for (const name of existsSync(dir) ? readdirSync(dir) : [])
      try {
        if (Date.now() - statSync(join(dir, name)).mtimeMs > days * 86_400_000) rmSync(join(dir, name), { recursive: true, force: true });
      } catch {}
};
pruneFiles();
setInterval(pruneFiles, 86_400_000);

// The name of a worker comes from the first words of the user, and speech to text can spell a word wrong. So the
// worker corrects its name when it understands the task, or when the task changes.
// shortcut: the prompt keeps the name of the start, so a worker can rename itself again after the user renames it.
const named = (w: Worker) =>
  ` Yonder shows you to the user as agent ${w.num}, with the name "${w.name}". ` +
  (w.ownName
    ? "Keep this name. Do not call rename_worker for yourself unless the user asks for a new name. "
    : "The name comes from the first words of the user, and speech to text can spell a word wrong. " +
      `When a word of the name is wrong, or the task changes so that the name does not fit the task of the user, ` +
      `call rename_worker with worker "${w.num}" and a new name of two to six words. ` +
      'A task about one pull request has the name "PR <number> - <its topic in one or two words>", such as "PR 359 - Date picker". ') +
  `To change your own effort, model, mode or profile when the user asks, call message_worker with worker "${w.num}", ` +
  'the new value, and the message "." as your last step. Your turn then continues on the new value. ' +
  // Else an agent writes "I close myself now" and stays open.
  `When the task says to close yourself when done, call message_worker with worker "${w.num}", the message "." and closeWhenDone true. ` +
  "Yonder then closes you when your turn ends, unless you ask a question or leave something to the user. Never write that you close yourself or that you are closed. " +
  // "Move the conversation to another agent" starts a new agent and closes this one. "Send an agent to explore X" or
  // "separate these into 2 agents" are side tasks: else the user talks to a closed agent. So only a move of this
  // conversation closes.
  'When the user says to move this conversation to a new agent, such as "move this to a new agent" or "continue this in a new agent", call start_worker in your project. ' +
  "Its task must carry the conversation, because the new agent cannot read it: the request of the user, what you did, what is left, the decisions, and the paths and links. " +
  `Then call message_worker with worker "${w.num}", the message "." and closeWhenDone true, as your last step. ` +
  'A request to start, send or split work into other agents, such as "send an agent to look into X" or "separate these into 2 agents", is not a move: start them and stay open. ' +
  "Set closeWhenDone on yourself only for these two requests: close yourself, or move this conversation." +
  // No one answers a question during a run of a schedule, so a question ends the run with no result.
  (w.schedule ? " A schedule or a trigger of Yonder started you, and no user answers during this run. Do not stop to ask a question: do the whole task, then report the result in short." : "");

// The settings of each worker. A background session has no one at its terminal, so:
// - Each question about a tool call goes to the bridge (POST /ask), and the app and the Mac show Allow and Deny. The first
//   answer counts. The hook asks again after a restart of the bridge.
// - Bypass also asks about a few calls: an rm of a critical path (the working folder, a parent of it or the home folder),
//   an `ask` rule and an MCP tool that needs the user. Without the hook, such a question shows only in a terminal.
// - The MCP servers of the project start with no question. Else a question about ~/.claude/.mcp.json holds each new
//   agent in Auto, Accept edits and Plan mode, and the agent shows as closed. Bypass already starts them so.
const ASK = JSON.stringify({
  enableAllProjectMcpServers: true,
  hooks: {
    PermissionRequest: [{ hooks: [{ type: "command", timeout: 86400,
      command: `in=$(cat); while :; do printf '%s' "$in" | curl -sf -H 'content-type: application/json' -H "x-yonder-token: \${YONDER_TOKEN:-}" --data-binary @- http://127.0.0.1:${PORT}/ask && exit 0; sleep 2; done` }] }],
  },
});

// The settings of a session: ASK, and the variables of the profile. A background session gets its
// environment from the background service of Claude Code, not from the `claude --bg` that starts it, so the variables go
// in the `env` of the settings. A variable in the environment of `claude --bg` does not reach the agent.
// The env also has YONDER_BRIDGE and YONDER_TOKEN (bridge/peer.ts), for the MCP header, the mod and a curl of the agent.
// So the settings go in a file that only the user can read: the other users of the computer can read the arguments of
// a process. Each start writes the file again, so a new token reaches the next session.
const settingsOf = (w: Worker) => {
  const vars = profileOf(w.profile)?.env;
  const file = join(CONFIG, `session-settings${w.profile ? `-${w.profile.replace(/[^\w-]/g, "_")}` : ""}.json`);
  writeFileSync(file, JSON.stringify({ ...JSON.parse(ASK), env: { ...vars, YONDER_BRIDGE: `http://127.0.0.1:${PORT}`, YONDER_TOKEN: bridgeToken() } }), { mode: 0o600 });
  chmodSync(file, 0o600);
  return ["--settings", file];
};
// The MCP servers of the user (`mcpServers` of ~/.claude.json) for a new session of a profile with its own folder, unless
// the Default MCP servers switch of that profile is off (`ownMcp`). They go in a file that only the user can read,
// because a server can have a key in its `env`. Each start writes the file again, so a new server reaches the next
// agent. Else the folder of a profile has none of the MCP servers of the user.
const MCP_DEFAULT = join(CONFIG, "mcp-default.json");
function defaultMcp(p?: Profile) {
  if (!p?.own || p.cli !== "claude" || p.ownMcp) return [];
  const { yonder: _, ...servers } = (existsSync(claudeJson()) ? JSON.parse(readFileSync(claudeJson(), "utf8")).mcpServers : undefined) ?? {};
  writeFileSync(`${MCP_DEFAULT}.yonder`, JSON.stringify({ mcpServers: servers }), { mode: 0o600 });
  renameSync(`${MCP_DEFAULT}.yonder`, MCP_DEFAULT);
  return [MCP_DEFAULT];
}

// The options of a new session. A background session keeps them for all its turns.
// Bypass uses --dangerously-skip-permissions, the flag that workers had before the modes.
const options = (w: Worker) => [
  // The extra flags of the profile come first, so a flag of Yonder that comes again, such as --model, wins.
  ...flagsOf(profileOf(w.profile)),
  // The tools of Yonder for each worker, with no entry in the settings of the user.
  // --mcp-config takes all the values up to the next flag, so it must not come last. Else it takes the prompt
  // as a second file, and each new worker fails at once with "MCP config file not found".
  // `worker` names the agent for use_secret, so its card on the phone says which agent asks. use_secret waits up to 10
  // minutes for the phone, then runs the command. Without `timeout`, Claude Code drops a call with no first byte in 60
  // seconds, and this server answers only at the end.
  // Claude Code puts YONDER_TOKEN of its environment in the header, so the token is not in the arguments, which other
  // users of the computer can read. A session with no YONDER_TOKEN sends an empty header, and the check of the user passes it.
  "--mcp-config", JSON.stringify({ mcpServers: { yonder: { type: "http", url: mcpUrl(w), headers: { "x-yonder-token": "${YONDER_TOKEN:-}" }, timeout: 30 * 60_000 } } }), ...defaultMcp(profileOf(w.profile)),
  // Yonder's own mod. A resume with no options keeps it, as the other options of the start.
  ...(MOD ? ["--plugin-dir", MOD] : []),
  ...((w.mode ?? state.mode) === "bypassPermissions" ? ["--dangerously-skip-permissions"] : ["--permission-mode", w.mode ?? state.mode]),
  ...settingsOf(w),
  "--model", w.model ?? MODEL, "--effort", w.effort ?? "high", "--append-system-prompt", say(SPOKEN + named(w)), "--name", w.name,
  ...(w.agent ? ["--agent", w.agent] : []),
];

// The Claude Code agents that a worker in the folder can start as: the files in .claude/agents of
// the folder and of the user. The name in the front matter is the name for `--agent`.
// One line on what a project is, for list_projects: the description that describe_project saved, or else the
// description in package.json, or else the first line of prose in the README or CLAUDE.md.
// `saved` false skips the saved description of a project: a workspace keeps its own (`description`), and the move to the
// workspaces copied each saved one there, so an emptied description does not bring the old one back.
function aboutOf(path: string, saved = true): string | undefined {
  if (saved && state.abouts?.[path]) return state.abouts[path];
  try {
    const pkg = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
    if (typeof pkg.description === "string" && pkg.description.trim()) return pkg.description.trim().slice(0, 200);
  } catch {}
  for (const f of ["README.md", "readme.md", "CLAUDE.md"]) {
    try {
      const line = readFileSync(join(path, f), "utf8")
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l && !/^(#|<|!\[|\[!\[|---|```|\|)/.test(l));
      if (line) return line.slice(0, 200);
    } catch {}
  }
}
const agentsIn = (path: string) =>
  [join(path, ".claude/agents"), join(HOME, ".claude/agents")].flatMap((dir) =>
    existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => {
          const text = readFileSync(join(dir, f), "utf8");
          return { name: text.match(/^name:\s*(.+)$/m)?.[1].trim() ?? f.slice(0, -3), description: text.match(/^description:\s*(.+)$/m)?.[1].trim().slice(0, 200) };
        })
      : [],
  );

// Asks Cloudflare's Clef model questions about the input, and returns its answers. It throws
// without a Workers AI key, and when Clef fails or takes more than `ms` (3 seconds by default).
// The start of an agent gives Clef 10 seconds (START_CLEF): Clef can take 2.6 to 8.6 seconds. Else most picks of the
// project time out, and agents such as "on yonder ..." start in the busiest project.
const START_CLEF = 10_000;
async function clef(input: Record<string, string>, questions: Record<string, unknown>, ms = 3000): Promise<Record<string, any>> {
  // Each computer uses its own Cloudflare key: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN in .env.
  // Yonder ships no key, so with none Clef is off and the callers use their fallbacks.
  const account_id = dotenv("CLOUDFLARE_ACCOUNT_ID");
  const ai_token = dotenv("CLOUDFLARE_AI_TOKEN");
  if (!account_id || !ai_token) throw new Error("no Workers AI key: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN in .env");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account_id}/ai/run/@cf/cloudflare/clef`, {
    method: "POST",
    headers: { authorization: `Bearer ${ai_token}` },
    signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ model: "clef", state: input, questions }),
  });
  const answers = ((await res.json()) as any).result?.answers;
  if (!answers) throw new Error(`no answers (HTTP ${res.status})`);
  return answers;
}

// A title of two or three words (six at most) for a new agent without a name, such as one from the + button of the app.
// Haiku writes it through `ask`, on the Claude subscription of the user, in 2 to 3 seconds. The first three words of the
// task, such as "Start an agent", tell too little. The title runs only on the account of the user, so each computer
// gets one with no other key.
// It returns "" when the model fails or writes a sentence, not a title.
// It runs in the CLI of the agent when that CLI has a run of one prompt (askFor), such as Hermes.
async function titleOf(task: string, w: Asker) {
  const system = 'Write a title of two or three words that tells what a coding agent does for this task, such as "Fix dictation key". A complex task can have up to six words. Answer with the title only.';
  // Without the quotes the model answered the task itself.
  const input = `The task, which you must not do or answer:\n"""\n${task.slice(0, 2000)}\n"""\nThe title:`;
  try {
    const answer = await askFor(w, system, input);
    // A title has six words at most, so it fits on the first line of the agent row. A longer answer keeps its first six words.
    // A model of another CLI can put the title in backticks.
    const title = String(answer ?? "").trim().replace(/^["'*`]+|["'*.`]+$/g, "");
    const words = title.split(/\s+/);
    // A small model in another CLI can answer with a tool call as JSON, which is not a title.
    return title && words.length <= 8 && !/[\n{}]/.test(title) ? words.slice(0, 6).join(" ") : "";
  } catch (e) {
    console.error("No title for the new agent:", e);
    return "";
  }
}

// The name of a task about one pull request: "PR 359 - Date picker", the number and the topic in one or two words, so that
// the list tells what the PR is about. Haiku writes the topic from the title of the PR (gh), or from the task when gh cannot
// read it, such as in a folder that is not a repository. The bridge writes the form, so that it stays the same. A name
// such as "Check PR 359 merge" does not tell what PR 359 is about.
async function prName(pr: { num: string; ref: string }, task: string, w: Asker & Pick<Worker, "path">) {
  const cwd = w.path;
  const gh = Bun.which("gh");
  const read = gh ? await run([gh, "pr", "view", pr.ref, "--json", "title", "-q", ".title"], 15_000, env, cwd).catch(() => undefined) : undefined;
  const about = read?.code === 0 && read.out ? read.out : task;
  const system = 'Write the topic of this pull request in one or two words, such as "Date picker". Answer with the topic only.';
  try {
    const answer = await askFor(w, system, `The pull request, which you must not review or answer:\n"""\n${about.slice(0, 2000)}\n"""\nThe topic:`);
    const topic = answer.trim().replace(/^["'*`]+|["'*.`]+$/g, "");
    // A cut topic, such as "Tone of", tells nothing, so a third word stays and a longer answer gives no name.
    return topic && topic.split(/\s+/).length <= 3 && !/[\n{}]/.test(topic) ? `PR ${pr.num} - ${topic}` : "";
  } catch (e) {
    console.error("No topic for the PR:", e);
    return "";
  }
}

// The project of a new agent from the + button of All projects, which gives no project. Clef picks it from the task
// in about a second, out of all the projects. When the task names no project, or Clef fails, the agent goes to the
// project that the user works on now (`busiest`), else to the first project.
function firstGuess(): Project {
  const all = projects();
  return busiest(all, recentAgents()) ?? defaultProject() ?? all[0] ?? homeProject();
}
// A Mac with no project, such as a new install, gets ~/Yonder as its project, so that the first agent can start.
function homeProject(): Project {
  const path = yonderFolder();
  state.hidden = state.hidden.filter((p) => p !== path);
  if (!state.extra.includes(path)) state.extra.push(path);
  save();
  try {
    return addWorkspace({ name: "Yonder", folder: path });
  } catch (e) {
    console.error(`No workspace for ${path}: ${(e as Error).message}`);
    return { name: "Yonder", path, starred: false };
  }
}
// ~/Yonder, made when it is not there: an empty folder with a git repository. A workspace with no folder starts its
// agents there when config.json has no default folder (noFolder).
function yonderFolder() {
  const path = join(HOME, "Yonder");
  if (!isDir(path)) {
    mkdirSync(path, { recursive: true });
    // A new Windows PC can have no git, and then the folder stays a plain folder.
    if (Bun.which("git")) Bun.spawnSync(["git", "init", "-q"], { cwd: path });
  }
  return path;
}
// Claude Code trusts the home folder for one session at a time, so `claude --bg` refuses it: "Workspace not trusted. The
// home directory is trusted one session at a time". The bridge does not save a trust for the home folder, because a
// trust also counts for each folder under it that is not in git. So an agent for the home folder starts in ~/Yonder.
const notHome = (p: Project) => (resolve(p.path).toLowerCase() === resolve(HOME).toLowerCase() ? homeProject() : p);
// The project of `defaultFolder` in config.json, also when the folder is not on the list of projects.
function defaultProject(): Project | undefined {
  const folder = config().defaultFolder;
  if (typeof folder !== "string" || !folder.trim()) return;
  const path = expand(folder.trim());
  if (!isDir(path)) return void console.error(`The defaultFolder of ${CONFIG_FILE} is not a folder: ${path}.`);
  return projects().find((p) => p.home !== false && p.path === path) ?? { name: basename(path), path, starred: false };
}
// The agents of the last day that Yonder started, newest first.
const recentAgents = (but?: Worker) =>
  state.workers.filter((w) => w !== but && !w.kind && w.path && Date.now() - w.updatedAt < 86_400_000).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
// The project with the most recent agents. A tie goes to the project of the newest agent.
function busiest(all: Project[], recent: Worker[]) {
  const count = (p: Project) => recent.filter((w) => isIn(w, p)).length;
  return recent.map((w) => all.find((p) => isIn(w, p))).filter((p) => p).sort((a, b) => count(b!) - count(a!))[0];
}
// When the user last worked in a project: the newest change of its folder, its git index, or its folder of Claude Code
// sessions. shortcut: the mtimes of three paths, not of every file. A save deep in the tree with no commit and no new
// session does not count.
function editedAt(path: string) {
  return Math.max(0, ...[path, join(path, ".git/index"), join(PROJECTS, path.replace(/[^a-zA-Z0-9]/g, "-"))].map((f) => {
    try {
      return statSync(f).mtimeMs;
    } catch {
      return 0;
    }
  }));
}
// Clef also gets the age of each project, and the recent agents in it. When two projects fit the task, such as
// acme-site and acme-portfolio, it picks the one that the user edited last.
// A task that names no project goes to the project that the user works on now, also when it shares a word with a quiet
// project. Else Clef can send a task about dictation in Yonder to another dictation app, while the user works on Yonder.
// The agents in the criteria fix only some of those picks, so a rule in code decides. shortcut: a task that tells the
// work of a quiet project but not its name, such as "fix the invoice PDF", goes to the busy project too; the user moves
// the agent then. A pick out of the latest projects (below) counts too, and does not go to the busy project.
async function projectOf(task: string, fallback: Project, self: Worker): Promise<Project> {
  // The workspaces, and the scanned folders that are no workspace, as Clef saw all the projects in an older bridge.
  // A pick of a folder becomes a workspace in startWorker (adoptFolder).
  const ws = projects();
  const taken = new Set(ws.map((p) => norm(p.name)));
  const all: Project[] = [...ws, ...scanned().filter((path) => !ws.some((p) => p.home !== false && p.path === path) && !taken.has(norm(basename(path)))).map((path) => ({ name: basename(path), path, starred: false }))];
  const recent = recentAgents(self);
  const agentsIn = (p: Project) => recent.filter((w) => isIn(w, p));
  // A workspace with no folder has no edits, so its newest agent tells when the user worked in it.
  const lastAt = (p: Project) => (p.home === false ? Math.max(0, ...state.workers.filter((w) => isIn(w, p)).map((w) => w.updatedAt)) : editedAt(p.path));
  const ages = all.map((p) => ({ p, days: Math.floor((Date.now() - lastAt(p)) / 86_400_000), agents: agentsIn(p) }))
    .sort((a, b) => b.agents.length - a.agents.length || a.days - b.days);
  const age = (days: number) => (days < 1 ? "today" : days < 3650 ? `${days} days ago` : "never");
  // Clef also gets what each of the latest projects is: the 15 first ones with recent agents or an edit in the last
  // 3 days. Else a task such as "build a toggle switch like this with our components" gets "(none)", because Clef
  // does not know which project holds the components. shortcut: not the about of all ~250 projects, so the pick stays fast.
  const latest = new Set(ages.filter((a) => a.agents.length || a.days < 3).slice(0, 15).map((a) => a.p));
  const about = ({ p, days, agents }: (typeof ages)[number]) => {
    const what = p.description ?? (latest.has(p) && p.home !== false && aboutOf(p.path, !p.id));
    return `The ${p.id ? "workspace" : "project"} ${p.name}${what ? ` (${what})` : ""}, last edited ${age(days)}` + (agents.length ? `. The user works on it now: ${agents.length} recent agents, such as ${agents.slice(0, 4).map((w) => `"${w.name}"`).join(", ")}` : "");
  };
  try {
    const { project, named } = await clef({ task: task.slice(0, 4000) }, {
      project: {
        type: "choice",
        instructions: "A user gave this task to a coding agent. Which project folder is it for? The user mostly works on the projects with recent agents, so when the task fits one of them, pick it over a project that only shares a word with the task. When two or more projects fit the task, such as projects with similar names, pick the one that the user edited most recently. A task to build, fix or change a thing that fits the work of a project that the user works on now, such as \"our components\" or \"the app\", is for that project, also when the task does not name it.",
        criteria: Object.fromEntries([...ages.map((a) => [a.p.name, about(a)]), ["(none)", "The task is not about the work of any project, such as a personal errand, a reminder or a note."]]),
      },
      named: {
        type: "choice",
        instructions: "Does the task name the project, app or website that it is for? A name can be misspelled or in spoken words, such as \"Nova Kite\" for novakite.",
        criteria: { yes: "The task names it.", no: "The task names no project, app or website." },
      },
    }, START_CLEF);
    // A task that does not say or show its project goes to the default folder of config.json.
    if (project?.choice === "(none)" && named?.choice !== "yes") return defaultProject() ?? fallback;
    const p = all.find((x) => x.name === project?.choice) ?? fallback;
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (named?.choice === "yes" || norm(task).includes(norm(p.name)) || agentsIn(p).length || latest.has(p) || !agentsIn(fallback).length) return p;
    console.error(`The task names no project, so the agent starts in ${fallback.name}, where the user works now, not in ${p.name}.`);
    return fallback;
  } catch (e) {
    // With no Clef, a latest project that the task names as a word wins over the busy project, so "on yonder ..." goes to
    // yonder. shortcut: only the latest projects, because names such as "app" and "phone" are plain words.
    const inTask = [...latest].sort((a, b) => b.name.length - a.name.length).find((p) => new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(task));
    console.error(`Clef cannot pick the project, so the agent starts in ${(inTask ?? fallback).name}: ${(e as Error).message}`);
    return inTask ?? fallback;
  }
}

// When the caller gives no effort, Clef picks it from the task: low for a question,
// high for normal work, xhigh or max only for a very complex and long task. When the caller gives no model, the same
// call of Clef picks the model. Each choice then moves into its range of the
// Settings, and a range of one value needs no Clef.
// When Clef fails, it is high effort on MODEL, moved into the ranges.
// shortcut: the tiers assume Haiku < Sonnet < Opus < Fable in power and cost; change the criteria when a new model comes out.
async function pick(task: string, w: Pick<Worker, "effort" | "model" | "cli">) {
  // An agent in another CLI gets the model and the effort of its CLI in the Agents tab. With no model there, the CLI
  // picks its own default model. With no effort there, Clef picks the effort, with no range: the ranges are Claude Code's.
  const other = w.cli ? state.clis[w.cli] : undefined;
  if (w.cli) {
    w.model ||= other?.model || undefined;
    w.effort ||= (other?.effort as Worker["effort"]) || undefined;
    if (w.effort || !CLIS[w.cli]?.efforts) return;
  }
  // The Default model of the Settings acts as a model that the user names: it is not moved into the range.
  if (!w.cli && !w.model && state.defaultModel in LATEST) w.model = LATEST[state.defaultModel];
  if (!w.cli && !w.model && state.models[0] === state.models[1]) w.model = LATEST[state.models[0]];
  if (!w.cli && !w.effort && state.efforts[0] === state.efforts[1]) w.effort = state.efforts[0];
  const auto = !w.cli && !w.model;
  if (w.effort && !auto) return;
  try {
    const answers = await clef({ task: task.slice(0, 4000) }, {
      ...(!w.effort && {
        effort: {
          type: "choice",
          instructions: "A user gave this task to a coding agent. How hard must the agent think?",
          criteria: {
            low: "A question, a lookup, an explanation or a tiny edit, such as a typo. No planning.",
            high: "Normal work: implement a feature, fix a bug, refactor some code, write a document.",
            xhigh: "A large task over many files or systems, with a lot of planning, that takes a long time.",
            max: "A very complex and long task: a new system, a hard bug nobody found, or a big migration. Only for the hardest work.",
          },
        },
      }),
      ...(auto && {
        model: {
          type: "choice",
          instructions: "A user gave this task to a Claude Code agent. Which Claude model must do it? Pick the smallest model that does it well.",
          criteria: {
            haiku: "A quick question, a lookup or a status check, with no change to code.",
            sonnet: "A small, clear change: a typo, a copy change, a small style fix, or a simple script.",
            opus: "Normal work: implement a feature, fix a bug, refactor code, research, write a document or review code.",
            fable: "The hardest work: a new system, a large migration, or a hard bug that other agents did not find.",
          },
        },
      }),
    });
    const effort = ["low", "high", "xhigh", "max"].includes(answers.effort?.choice) ? answers.effort.choice : "high";
    if (!w.effort) w.effort = w.cli ? effort : clamp(EFFORTS, state.efforts, effort);
    if (auto) w.model = LATEST[clamp(TIERS, state.models, answers.model?.choice in LATEST ? answers.model.choice : "opus")];
  } catch (e) {
    console.error(`Clef cannot pick the effort and the model, so the worker runs on high effort: ${(e as Error).message}`);
    w.effort ??= w.cli ? "high" : clamp(EFFORTS, state.efforts, "high");
    if (auto) w.model = LATEST[clamp(TIERS, state.models, "opus")];
  }
}

// When a worker finishes, Clef decides if the user must hear its result: when the user
// asked a question, or when the agent could not do all the work. Such a result gets the
// attention flag, so the app shows a purple dot and Grok tells about it. A task that the agent
// did as asked stays quiet. When Clef fails, the result needs the user. When the user asked a question
// and the agent did the work, the result is also answered, so the app shows a purple circle, not a green one.
// A green circle looks like a normal done task.
async function worthTelling(request: string, message: string) {
  try {
    const { kind, done } = await clef(
      // The voice-call and images blocks that the app adds are not the request.
      { request: request.split(/<voice-call>|<images>|<pasted-text>|<screen-recording>|<device>|<from>/)[0].trim().slice(0, 4000), final_message: message.slice(-4000) },
      {
        kind: {
          type: "choice",
          instructions: "What did the user want from the agent in this request?",
          criteria: {
            answer: "To know something: an answer to a question, a check, research, an explanation, a review or a plan.",
            change: "A change: build, fix, add or update code, a file, a design or a setting.",
          },
        },
        done: {
          type: "choice",
          instructions: "Did the agent do the work that the user asked for?",
          criteria: {
            no: "The agent could not do the work, did only part of it, or stopped at an error. The user must fix something or decide something.",
            yes: 'The agent did the work. Notes such as "I did not rebuild", "I did not test it on screen" or "it works after the next rebuild" are normal and do not count.',
          },
        },
      },
    );
    // shortcut: a fixed cut. On 19 results, the failures gave 0.82 to 0.98 and the finished tasks 0.12 to 0.58.
    const failed = done.probabilities.no >= 0.75;
    return { attention: kind.choice === "answer" || failed, answered: kind.choice === "answer" && !failed, failed };
  } catch (e) {
    console.error(`Clef cannot judge the result, so it needs the user: ${(e as Error).message}`);
    // No verdict on the work, so an agent that must close when done asks the summary (closeItself).
    return { attention: true, answered: false, failed: undefined };
  }
}

// The gist of the whole conversation of an agent in 3 to 5 short points in very easy English, one on each line:
// what it is about, and the verdict or what the user must do. A question of the agent to the user is the last point. The app shows it on the Summary tab. A hidden
// `claude -p` on Haiku writes it in about 3 seconds, on the Claude subscription, so it costs no money. The summary stays until the
// agent gives a new answer. A new status, a read result or a star does not write it again. A running agent keeps its
// last summary. Two calls for the same session share one request.
const summarizing = new Map<string, Promise<string>>();
// "t" marked the summaries that give the substance (the names, numbers and findings), so the older ones were written again.
// Else a summary says "Agent gave six name options", and Grok tells the user only "It brainstormed product names."
// "n" marks the summaries with the next step (`next`), so the older ones are written again.
// "s" marks the summaries with the spoken brief (`spoken`), so the older ones are written again.
// "b" marks the briefs of only the last answer.
// "l" marks the longer summaries of 3 to 5 points.
const answerKey = (w: Worker) => "l" + Bun.hash(w.result ?? "").toString(36);
// The summary of the last answer, for the voice agent. A running agent has none: its summary is of the turn before.
const summaryOf = (w: Worker) =>
  w.status !== "running" && state.summaries[w.sessionId]?.key === answerKey(w) ? state.summaries[w.sessionId].text : undefined;
// The next step of the user in 2 to 5 words, such as "Push it", for the third line of a row on the Done tab.
const nextOf = (w: Worker) => (summaryOf(w) ? state.summaries[w.sessionId].next : undefined);
// The last point of a summary: the verdict, or what the user must do or decide. For a waiting agent, its question.
const needs = (summary: string) => summary.split("\n").pop()!.replace(/^- /, "");
// A failure or an empty transcript tries again after 1 minute when the app asks, and after 5 minutes in preload. Else
// a failure of the one call of the app leaves "Summing up…" on the screen, because the app does not ask again.
// The user sees it on agents that they started outside Yonder, which are often done when the user opens them.
const failedAt = new Map<string, number>();
function summary(w: Worker, wait = 60_000): Promise<string> {
  const cached = state.summaries[w.sessionId];
  if (cached?.key === answerKey(w) || (cached && w.status === "running")) return Promise.resolve(cached.text);
  if (w.status === "running" || !state.sumUp || !w.sessionId || Date.now() - (failedAt.get(w.sessionId) ?? 0) < wait) return Promise.resolve(cached?.text ?? "");
  if (!summarizing.has(w.sessionId))
    summarizing.set(
      w.sessionId,
      summarize(w)
        .then((text) => (text || failedAt.set(w.sessionId, Date.now()), text))
        .catch((e) => (failedAt.set(w.sessionId, Date.now()), console.error(`Cannot sum up worker ${w.id}:`, e), cached?.text ?? ""))
        .finally(() => summarizing.delete(w.sessionId)),
    );
  return summarizing.get(w.sessionId)!;
}
// The summary of each finished or waiting agent is ready before the user opens it: the workers, the other sessions,
// and the agents that finished before the bridge started. Three at a time, newest first. A closed agent has the
// summary from before the user closed it.
function preload(list: Worker[]) {
  if (!state.sumUp) return;
  for (const w of [...list].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (summarizing.size >= 3) return;
    if (!w.sessionId || !["done", "failed", "waiting"].includes(w.status) || state.summaries[w.sessionId]?.key === answerKey(w)) continue;
    if (!summarizing.has(w.sessionId)) summary(w, 300_000);
  }
}
// A hidden `claude -p`, on the Claude subscription, so it costs no money. It has no tools, MCP servers, settings or
// session file. It returns the text of the answer. With no effort, thinking is off: Haiku on low effort still thought
// for 30 seconds. review_workers gives Sonnet on high effort, which thinks.
// It runs on the login of the default profile when that profile has its own folder: else an expired login of the plain
// folder leaves each new agent with the first words of its task as its name, and summaries fail. When the
// default has no usage left, it runs on another profile with room (roomy). A refusal for the limit marks that folder
// full (limitHit), and the question goes once more, to the next profile with room.
async function ask(system: string, input: string, model = "haiku", effort?: string, again = true): Promise<string> {
  const p = await roomy();
  const own = p?.own && p.cli === "claude";
  const login = own ? envOf(p) : env;
  const proc = Bun.spawn(
    [CLAUDE, "-p", "--model", model, ...(effort ? ["--effort", effort] : []), "--tools", "", "--strict-mcp-config", "--setting-sources", "",
      "--no-session-persistence", "--output-format", "json", "--system-prompt", system],
    { cwd: SUMMARIZER, env: effort ? login : { ...login, MAX_THINKING_TOKENS: "0" }, stdin: new Blob([input]), stdout: "pipe", stderr: "ignore" },
  );
  const timer = setTimeout(() => proc.kill(), 120_000);
  const out = await new Response(proc.stdout).text().finally(() => clearTimeout(timer));
  await proc.exited;
  const reply = (() => { try { return JSON.parse(out); } catch { return {}; } })();
  if (reply.is_error && again && (await limitHit(String(reply.result), own ? claudeDir(p) : undefined))) return ask(system, input, model, effort, false);
  if (reply.is_error || !reply.result) throw new Error(`no answer from ${model} (${reply.result ?? `exit ${proc.exitCode}`})`);
  return String(reply.result);
}

// The name of an agent (titleOf, prName) comes from the CLI of the agent when that CLI has a run of one prompt
// (Cli.ask), such as `hermes -z`: on the sign-in of its profile, with the model of the agent, of its CLI row in the
// Agents tab, or the default model of the CLI. So the CLI, the profile and the model of config.json are the setting,
// and there is no switch for it. Such a user can have no Claude Code at all: else each agent of Hermes on
// such a computer keeps the first words of its task. The CLI has no system prompt, so the prompt has both parts. A run
// that fails keeps the first words, and does not go to Claude Code. Each other CLI, and each summary, brief and review
// (ask), stays on Haiku: those run on each answer, and a key of Hermes can pay for each token.
type Asker = Pick<Worker, "cli" | "profile" | "model">;
async function askFor(w: Asker, system: string, input: string) {
  const cli = CLIS[w.cli ?? ""];
  if (!cli?.ask) return ask(system, input);
  const found = await cliState(cli.id);
  if (!found.path) throw new Error(`${cli.name} is not installed`);
  const argv = [found.path, ...cli.ask(`${system}\n\n${input}`, w.model || state.clis[cli.id]?.model || undefined)];
  const r = await run(argv, 120_000, { ...env, ...profileOf(w.profile)?.env }, SUMMARIZER);
  if (r.code !== 0 || !r.out) throw new Error(`no answer from ${cli.name} (${(r.err || r.out || `exit ${r.code}`).slice(0, 200)})`);
  return r.out;
}

// The prompt of review_workers. Each Yonder agent ends with "test it" or "ready to push", so those notes do not keep an agent.
const REVIEW =
  "You help the user tidy up a list of Claude Code agents. For each agent to review, in the same order, write one line:\n" +
  "Agent <number>: <its main result, 15 words or less>. <Close or Keep>: <the reason, 8 words or less>.\n" +
  "Give the substance, with the actual names, numbers or answer: \"Suggests Plus, Pro and Team.\", not \"Brainstormed product names.\"\n" +
  "Close: the agent needs nothing more from the user. Its work is done, or another agent does or did the same work, or the result no longer matters. " +
  "A note such as \"ready to push\", \"test it\", \"try it\" or \"rebuild to see it\" is a normal end of the work, so it is Close.\n" +
  "Keep: the user must still act, or the agent still works. It runs, it asks a question, the user must pick or decide something, " +
  "or it failed and no other agent fixes it.\n" +
  "Write very easy English: short, common words. Leave out code, file paths, commands and jargon. No headings, no other text, no Markdown.";

// The prompt of the spoken brief of the listen button of a conversation, which the app speaks with the voice of Grok (/speak).
const BRIEF =
  "You tell the user aloud what a coding agent just answered to the last message of the user. " +
  "Write 2 to 5 short sentences about only that last answer: what the agent found, made, changed or said, why, " +
  "and what it asks or needs from the user. When it asks a question, end with that question and its options. " +
  "Give the names, numbers and options, as a friend who read it would say them. The task is only for context: do not retell it. " +
  "Call the agent \"it\", never \"I\". Write very easy English. No lists, no Markdown, no code, no file paths, no other text.";
// The prompt of the reply of Walkie-talkie (`walkieTalkie` in config.json): the agent answers the last message aloud as
// itself, to the user, as in a chat, not as the third-person brief.
const WALKIE =
  "You are a coding agent, and you answer the last message of the user aloud, as yourself, as in a voice chat. " +
  "Turn your last written answer into 1 to 4 short spoken sentences: say \"I\" for yourself and \"you\" for the user. " +
  "Answer the last message directly: what you found, made or changed, and what you need from the user. " +
  "When you ask a question, end with that question and its options. Give the names, numbers and options. " +
  "Do not greet, do not retell the task, and do not describe the answer from outside. " +
  "Write very easy English. No lists, no Markdown, no code, no file paths, no other text.";
// The word of the user for an agent in a summary and a brief, such as "task" (agentName in config.json). Haiku writes it
// in place of "agent", so the screen and the tools read "The task found".
const wordRule = () => {
  const { one, many } = { one: "agent", many: "", ...state.agentName };
  return one === "agent" ? "" : ` The user calls a Yonder agent a "${one}" (plural "${many || `${one}s`}"). Write that word for it, never "agent".`;
};

// shortcut: summaries of removed agents stay in state.json, about 600 bytes each. Prune them when the file grows.
async function summarize(w: Worker) {
  const key = answerKey(w);
  const list = await turns(w, 400, 4_000_000);
  const lines = list.map((t) =>
    t.who === "tool" ? `  tool: ${t.text.slice(0, 150)}` : `${t.who === "user" ? "user" : "agent"}: ${said(t).slice(0, 2000)}`,
  );
  if (!lines.length) return "";
  // The last message of the user and the whole answer to it, for the spoken brief. A second run of Haiku writes the
  // brief from only these, at the same time as the summary. A brief of the whole
  // conversation tells the first report again after a short second answer, and the user hears nothing of the new
  // answer. Haiku does that also with the last answer marked at the end of the whole conversation.
  const at = list.map((t) => t.who).lastIndexOf("user");
  const asked = at < 0 ? typed(w.task ?? "").trim() : said(list[at]);
  const answered = list.slice(at + 1).filter((t) => t.who === "assistant").map(said).join("\n\n");
  // The first request, when the turns start later.
  if (!lines[0].startsWith("user") && w.task) lines.unshift(`user: ${typed(w.task).trim().slice(0, 2000)}`);
  let text = lines.join("\n");
  if (text.length > 40_000) text = `${text.slice(0, 8000)}\n…\n${text.slice(-32_000)}`;
  if (w.status === "waiting") text += "\n\n(The agent now waits for an answer from the user.)";
  const last =
    `The task of the agent:\n${typed(w.task ?? "").trim().slice(0, 500)}\n\nThe last message of the user:\n${asked.slice(0, 2000)}\n\n` +
    `The last answer of the agent:\n${answered.slice(-6000)}${w.status === "waiting" ? "\n\n(The agent now waits for an answer from the user.)" : ""}`;
  const clean = (t: string) => t.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const spoken = ask(BRIEF + wordRule(), last).then(clean, () => undefined);
  // Only with Walkie-talkie on, so Haiku does not run a third time on each answer for nothing.
  const walkie = config().walkieTalkie === true ? ask(WALKIE, last).then(clean, () => undefined) : undefined;
  const reply = (await ask(
    "You sum up the whole conversation of a coding agent for its user, from the first request to now. " +
      "Give the gist in 3 to 5 points, one on each line, each starting with \"- \" and 20 words or less. " +
      "Keep to that limit: name only the most important names, numbers or facts, never a full list. " +
      "Use 5 points when the work has many parts. Write very easy English: short, common words and short sentences. " +
      "Leave out code, file paths, commands and jargon. " +
      "Give the substance, not a description of the work: the actual answer, names, numbers, causes, options or findings. " +
      "Write \"Best names: Starter, Pro, Team.\", not \"The agent gave six name options.\" " +
      "Write \"The login failed because the token expired.\", not \"The agent found the cause.\" " +
      "The first point gives the main result: what the agent found, made or changed. " +
      "The last point gives the verdict: done, or what the user must do or decide now. " +
      "When the last agent message asks the user a question, the last point is that question itself, short, with its options, ending with \"?\". " +
      "Do not write that the agent waits or awaits a decision. " +
      "Do not repeat the request. No headings, no other text, no Markdown, no file paths. " +
      "After the points, write one more line that starts with \"Next: \" and gives the next step of the user in 2 to 5 words, " +
      "as a short command: \"Next: Push it\", \"Next: Pick a token\", \"Next: Run migration, then push\", \"Next: Read the answer\", " +
      "\"Next: Test on the phone\". When the work is done and the user need not do anything, write \"Next: Done\"." + wordRule(),
    text,
  ));
  // The app shows the next step on one line, so a longer one loses its end words.
  const NEXT = /^\s*(?:[-*•]\s*)?\**Next\**:\**\s*(.+)$/i;
  const next = reply.split("\n").map((l) => l.match(NEXT)?.[1]).find(Boolean)?.replace(/\*\*/g, "").replace(/[.!]+$/, "").trim().split(/\s+/).slice(0, 5).join(" ");
  const answer = reply
    // Haiku sometimes puts a heading over the points, so only the points stay.
    .split("\n")
    .filter((l) => /^\s*(?:[-*•]|\d+[.)])\s/.test(l) && !NEXT.test(l))
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((l) => `- ${l}`)
    .join("\n");
  if (!answer) throw new Error("no summary: Haiku wrote no points");
  state.summaries[w.sessionId] = { key, text: answer, next, spoken: await spoken, walkie: await walkie };
  save();
  return answer;
}

// The gist of an agent for the summarize button of its row: its task and where it stands, in 1 or 2 sentences.
async function gist(w: Worker) {
  const list = await turns(w, 60, 1_000_000).catch(() => []);
  let text = list.map((t) => (t.who === "tool" ? `  tool: ${t.text.slice(0, 100)}` : `${t.who === "user" ? "user" : "agent"}: ${said(t).slice(0, 1500)}`)).join("\n");
  if (text.length > 12_000) text = text.slice(-12_000);
  const status = w.status === "running" ? `It runs now${w.activity ? `: ${w.activity}` : ""}.` : `Its status: ${w.status}.`;
  const answer = await ask(
    "You tell the user in 1 or 2 short sentences, 35 words or less, what a coding agent's task is and where it stands now: " +
      "done, still working on what, or what it needs from the user. Write very easy English. " +
      "No lists, no Markdown, no code, no file paths, no other text." + wordRule(),
    `The task:\n${typed(w.task ?? w.name).trim().slice(0, 1500)}\n\n${status}\n\nThe end of the conversation:\n${text || "(none)"}`,
    LATEST.haiku,
  );
  return answer.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

// The last argument is the prompt. "--" before it stops Claude Code from reading a prompt that starts with "-" as an
// option. Else a pasted crash report that starts with "-----" fails with "unknown option".
// A profile gives its program and its environment.
const background = async (cwd: string, args: string[], p?: Profile) => {
  const bin = p?.program ? (Bun.which(tilde(p.program)) ?? tilde(p.program)) : CLAUDE;
  const proc = Bun.spawn([bin, "--bg", ...args.slice(0, -1), "--", ...args.slice(-1)], { cwd, env: envOf(p), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  return Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
};

// A side question (/btw), as /btw of Claude Code: a copy of the session answers from the conversation, with no tools,
// and saves nothing. The session goes on and never sees the question. The MCP client of the app stops waiting after
// 60 seconds, so the copy gets 55 seconds and a low effort.
async function sideQuestion(w: Worker, question: string) {
  const p = profileOf(w.profile);
  const bin = p?.program ? (Bun.which(tilde(p.program)) ?? tilde(p.program)) : CLAUDE;
  const prompt =
    "<system-reminder>This is a side question of the user. Your main work goes on in another process, and the conversation does not keep this answer. " +
    `Answer at once and briefly, from what you know now. You have no tools here, so do not offer to do something.</system-reminder>\n\n${question}`;
  const args = ["-p", "--resume", w.sessionId, "--fork-session", "--no-session-persistence", "--tools", "", "--strict-mcp-config", "--settings", JSON.stringify({ disableAllHooks: true })];
  const proc = Bun.spawn([bin, ...args, "--model", w.model ?? MODEL, "--effort", "low", "--output-format", "json", "--", prompt], { cwd: w.path, env: envOf(p), stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 55_000 });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (proc.signalCode) throw new Error(`Agent ${w.num} gave no answer in 55 seconds.`);
  let r: { result?: string; is_error?: boolean } = {};
  try {
    r = JSON.parse(out);
  } catch {}
  if (r.is_error || !r.result) throw new Error(`Agent ${w.num} gave no answer: ${(r.result || err || out).trim().slice(-300)}`);
  return r.result;
}

// Changes a JSON file of Claude Code through a copy and a rename, so that Claude Code never reads half a file.
// A new server can have no such file yet.
// shortcut: a read and a write of a file that Claude Code also writes; a lost write is possible but unlikely.
function editJson(file: string, change: (config: any) => void) {
  // phone.json keeps a .bak, as state.json and config.json do. The files of Claude Code get none.
  if (file === PHONE_FILE) {
    const read = readSafe(file, console.error, false);
    // A broken file is kept as phone.json.broken-<time>, so the save neither loses it nor makes it the .bak.
    if (read.from !== "file" && existsSync(file)) moveBroken(file, "not valid JSON");
    const phone = read.data ?? {};
    change(phone);
    return writeSafe(file, JSON.stringify(phone, null, 2));
  }
  const config = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  change(config);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.yonder`, JSON.stringify(config, null, 2), { mode: existsSync(file) ? statSync(file).mode : 0o600 });
  renameSync(`${file}.yonder`, file);
}

// `claude --bg` refuses a folder that Claude Code does not trust, and for a git
// repository the trust of a parent folder does not count. `claude -p` did not
// ask. Yonder starts workers only where the user asks, so it saves the trust in
// ~/.claude.json, as the trust prompt of `claude` does.
// On Windows, Claude Code reads the key with \ in some places and with / in others, so both spellings get the trust.
const trust = (path: string, p?: Profile) =>
  editJson(claudeJson(p), (config) => {
    config.projects ??= {};
    for (const key of WINDOWS ? [path, path.replaceAll("\\", "/")] : [path])
      config.projects[key] = { ...config.projects[key], hasTrustDialogAccepted: true };
  });

// `claude --bg` also refuses bypass permissions, the default mode of Yonder, until the user accepts its disclaimer
// once in a terminal. Else each new agent on a Linux server fails with this error, and the phone has no
// terminal for it. So Yonder saves the key that the disclaimer saves. It must be in the
// user settings, because the background session reads it only there.
const consent = (p?: Profile) => editJson(join(claudeDir(p), "settings.json"), (config) => (config.skipDangerousModePermissionPrompt = true));

// With no login, `claude --bg` starts the session, and its only answer is "Not logged in · Please run /login". So
// the bridge checks first, and starts the setup below. An old Claude Code with no `auth status` counts as logged in.
// The Settings show the result.
let claudeLoggedIn = true;
const loggedIn = async () => {
  const auth = await run([CLAUDE, "auth", "status"], 10_000, env).catch(() => undefined);
  return (claudeLoggedIn = !/"loggedIn":\s*false/.test(auth?.out ?? ""));
};
void loggedIn();
// The plain folder needs a sign-in only when the default of this computer runs Claude Code in it. Else the card shows
// while the default is a profile of Claude Code with its own folder, or another CLI, such as Hermes, that is signed in.
const plainNeeded = () => {
  const p = profileOf(state.cli);
  return p ? p.cli === "claude" && !p.own : state.cli === "claude";
};
// The default profile of this computer when it is a profile of Claude Code with its own account. Then no agent of Yonder
// uses the folder of the user (~/.claude), which is the login of `claude` in the terminal: a new agent that names Claude
// Code, an old agent on that folder at its next message, and "default" of message_worker go to that profile. So
// Yonder stays apart from the login of the terminal.
function ownDefault() {
  const p = profileOf(state.cli);
  return p?.own && p.cli === "claude" ? p : undefined;
}
// The account of a profile with its own folder, such as "work@company.com · Team", or "" when it is not signed in.
const accounts: Record<string, string> = {};
// The own folders whose login Claude Code could not refresh (lostProfile). `claude auth status` still says "loggedIn" for
// them, so such a profile shows as not signed in until its stored login is good again, after a new sign-in on its page.
const lostDirs = new Set<string>();
function lostProfile(dir: string) {
  const p = state.profiles.find((x) => x.own && x.cli === "claude" && claudeDir(x) === dir);
  if (!p || lostDirs.has(dir)) return;
  lostDirs.add(dir);
  accounts[p.id] = "";
  push(`${p.name} is signed out`, `Sign in to it again in the Settings, Profiles, ${p.name}.`);
}
async function accountOf(p: Profile) {
  if (lostDirs.has(claudeDir(p))) {
    if (!((storedLogin(claudeDir(p))?.expiresAt ?? 0) > Date.now())) return (accounts[p.id] = "");
    lostDirs.delete(claudeDir(p));
  }
  const auth = await run([CLAUDE, "auth", "status"], 10_000, envOf(p)).catch(() => undefined);
  let a: { loggedIn?: boolean; email?: string; subscriptionType?: string } = {};
  try {
    a = JSON.parse(auth?.out ?? "{}");
  } catch {}
  const plan = a.subscriptionType ? a.subscriptionType[0].toUpperCase() + a.subscriptionType.slice(1) : "";
  return (accounts[p.id] = a.loggedIn ? [a.email ?? "Claude", plan].filter(Boolean).join(" · ") : "");
}
async function ready(p?: Profile) {
  if (p?.own && p.cli === "claude") {
    if (await accountOf(p)) return;
    throw new Error(`The profile ${p.name} is not signed in on ${hostname()}. Sign in to it in the Settings, Profiles, ${p.name}.`);
  }
  if (existsSync(CLAUDE) && (await loggedIn())) return;
  // A missing Claude Code installs only when the user asks for it (cli with install, or Install in the Agents tab). The
  // user can use Hermes or another CLI and never Claude Code.
  // These errors also show on the screen when the user starts an agent there, so they speak to the user. The hint for the
  // voice agent is in the description of the cli tool, so the phone never shows "call cli with install" (YONDER-1E).
  if (!existsSync(CLAUDE))
    throw new Error(`Claude Code is not installed on ${hostname()}. The Agents tab of the Settings can install it, or start the agent on another CLI.`);
  lostLogin("claude", "Claude Code");
  setUp();
  throw new Error(`Claude Code is not signed in on ${hostname()}. The Agents tab of Yonder shows the card to sign in.`);
}
// A new task with no profile of its own, and each summary, goes to the default profile. When that login of Claude Code
// has used all of its session or its week, the work goes to the first other profile with its own account and room. An
// unknown meter counts as room. Else the user must sign in again in the terminal to use another subscription.
async function roomy(p = profileOf(state.cli)) {
  const full = async (o?: Profile) => {
    const used = await usageFor("claude", false, o?.own ? claudeDir(o) : undefined);
    return (used.session ?? 0) >= 100 || (used.week ?? 0) >= 100;
  };
  if ((p ? p.cli : state.cli) !== "claude" || !(await full(p))) return p;
  for (const o of state.profiles) if (o !== p && o.cli === "claude" && o.own && (accounts[o.id] ?? (await accountOf(o))) && !(await full(o))) return o;
  return p;
}
// The profile that an agent moves to with its next message, or undefined when it stays. An agent on the folder of the user
// moves to the default profile (ownDefault). An agent on a profile that has used all of its session or its week moves to
// another profile with room (roomy), because the turn would fail at once.
async function roomFor(w: Worker) {
  const on = profileOf(w.profile);
  if (w.cli || w.kind || !(on ? on.own && on.cli === "claude" : ownDefault())) return;
  const to = await roomy(on);
  return to && to !== on ? to : undefined;
}
// The folders of Claude Code that answered "You've hit your session limit · resets 2am (Europe/Paris)", with the meter
// and the end of that limit. The usage meter can lag behind the limit: Claude Code can refuse each turn of a profile
// while its meter says 94%, and then no agent moves to the other profile. Until the reset, usageFor gives
// that meter as 100. The reset comes from the meter, or is one hour later when the meter does not know it.
const limitHits = new Map<string, { meter: "session" | "week"; until: number }>();
async function limitHit(text: string, dir?: string) {
  // The whole answer is the one line of Claude Code, so an answer that only quotes it does not count.
  const kind = text.trim().match(/^You've hit your (\w+) limit · resets [^\n]*$/)?.[1];
  if (!kind) return false;
  const meter = kind === "session" ? "session" : "week";
  const limits = (await claudeUsage(false, dir).catch(() => undefined))?.limits as { name: string; resets_at: string | null }[] | undefined;
  const row = limits?.find((l) => (meter === "session" ? l.name === "Current session" : l.name.startsWith("Week,")));
  const reset = Date.parse(row?.resets_at ?? "");
  limitHits.set(dir ?? claudeDir(), { meter, until: reset > Date.now() ? reset : Date.now() + 3_600_000 });
  console.log(`Claude Code in ${dir ?? claudeDir()} has no ${meter} usage left.`);
  return true;
}

// The setup of Claude Code on a new computer, with no terminal. A new computer can have no Claude Code and then no
// login, and each fix needs a terminal there. So the bridge runs the
// installer of Claude Code, then `claude auth login` (claudeSignIn), and the Agents tab shows the card of the sign-in, on
// the Mac and on the phone (logins.ts). An install that fails waits for Try again. `force` installs again, also over a
// Claude Code that is there.
const CLAUDE_INSTALL = WINDOWS
  ? ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"]
  : ["bash", "-c", "curl -fsSL https://claude.ai/install.sh | bash"];
function setUp(force = false) {
  const l = loginOf("claude");
  if (!force && l && l.step !== "signed-out" && !l.error) return;
  if (!force && existsSync(CLAUDE)) return claudeSignIn();
  installRun("claude", "Claude Code", CLAUDE_INSTALL, env, async () => {
    claudeVersion = (await run([CLAUDE, "--version"], 10_000, env).catch(() => undefined))?.out.match(/\d+\.\d+\.\d+/)?.[0] ?? "";
    if (!(await loggedIn())) claudeSignIn();
  });
}
// The sign-in of Claude Code. `claude auth login` prints a link, and reads the code (`<code>#<state>`) that the page of
// the link shows after the approval. It has no device sign-in. The page of a profile with its own folder signs in that
// folder, as "claude:<id>".
const CLAUDE_SIGN_IN: SignIn = { args: ["auth", "login"], url: /visit: (https:\S+)/, paste: true };
const claudeKey = (p?: Profile) => (p ? `claude:${p.id}` : "claude");
function claudeSignIn(p?: Profile) {
  signIn(claudeKey(p), p?.name ?? "Claude Code", CLAUDE, CLAUDE_SIGN_IN, envOf(p), async () => {
    if (!(p ? await accountOf(p) : await loggedIn())) return false;
    // The login of `claude auth login` does not set the onboarding as done, as `/login` in `claude` does. A
    // background session with no onboarding can stop at its first screens.
    editJson(claudeJson(p), (config) => (config.hasCompletedOnboarding = true));
    return true;
  });
}

// A CLI that an agent found signed out gets its card in the Agents tab and one push, until its sign-in or a good turn.
// The login of Claude Code can expire after some days with no use, and else the user finds out only at the Mac.
function lostLogin(id: string, name: string) {
  if (loginOf(id)) return;
  signedOut(id, name);
  push(`${name} is signed out`, `Sign in from the Agents tab of Yonder. ${hostname()} waits for it.`);
}
// The words of a turn that failed for its sign-in. Claude Code ends such a turn with one line that ends with "Please
// run /login", so an answer that only names that line does not count. The other CLIs give their error as the failure.
// `claude auth status` still says "loggedIn": true when the token expired, so these words are the sign of an expired login.
const SIGNED_OUT_CLAUDE =
  /(^|\n)((API Error: 40[13]|Invalid API key|OAuth token (has expired|has been revoked|revoked)|Login expired|Not logged in|Invalid bearer token)[^\n]*Please run \/login|Failed to authenticate: OAuth session expired[^\n]*)\s*$/i;
const SIGNED_OUT_OTHER = /authentication required|not (signed|logged) in|(sign|log) ?in again|please (sign|log) ?in|re-?authenticate|refresh token (has expired|was already used|was revoked)|token expired|unauthori[sz]ed|\b401\b/i;

// Starts the install or the sign-in of a CLI, types the code of the page into its sign-in, or stops it: the cards of the
// Agents tab and cli with login. A CLI that is not installed is installed first, and its sign-in follows.
async function cliLogin(id: string, action: "login" | "install" | "code" | "cancel" = "login", code = "") {
  if (action === "cancel") return stopLogin(id);
  if (action === "code") return answer(id, code);
  if (id === "claude") {
    stopLogin("claude");
    return setUp(action === "install");
  }
  const cli = CLIS[id];
  if (!cli) throw new Error(`Yonder knows no CLI "${id}". The CLIs: claude, ${Object.keys(CLIS).join(", ")}.`);
  const f = await cliState(id, true);
  const signInNow = async (bin: string) => {
    if (!cli.signIn) throw new Error(`${cli.name} signs in only in a terminal. Sign in in the CLIs of the Settings of Yonder, on the computer.`);
    signIn(id, cli.name, bin, cli.signIn, env, async () => !!(await cliState(id, true)).account);
  };
  if (action === "install" || !f.path || f.error) {
    if (!cli.install) throw new Error(`${cli.name} has no install command. Remove it, and add it again in the Agents tab of the Settings.`);
    return installRun(id, cli.name, WINDOWS ? ["cmd", "/c", cli.install] : ["/bin/sh", "-c", cli.install], env, async () => {
      const after = await cliState(id, true);
      if (after.path && !after.error && !after.account && cli.signIn) await signInNow(after.path);
    });
  }
  return signInNow(f.path);
}
// The link of a sign-in comes in about a second, so the card and cli with login wait for it, 5 seconds at most.
async function withLink(id: string) {
  for (let i = 0; i < 50 && loginOf(id)?.step === "login" && !loginOf(id)?.url && !loginOf(id)?.error; i++) await Bun.sleep(100);
  return loginOf(id);
}
// The CLIs of this computer for cli with status: installed or not, signed in or not, and the install or sign-in that runs.
async function cliStatus() {
  const installed = existsSync(CLAUDE);
  const claude = { id: "claude", name: "Claude Code", installed, version: claudeVersion || undefined, signedIn: installed && (await loggedIn()) && loginOf("claude")?.step !== "signed-out" };
  const others = await Promise.all(
    Object.entries(CLIS).map(async ([id, cli]) => {
      const f = await cliState(id);
      return {
        id, name: cli.name, installed: !!f.path && !f.error, version: f.version, signedIn: !!f.account && loginOf(id)?.step !== "signed-out", account: f.account,
        ...(f.error && { error: f.error }), ...(!cli.signIn && { terminalOnly: true }),
      };
    }),
  );
  return [claude, ...others].map((c) => ({ ...c, ...(loginOf(c.id) && { login: loginOf(c.id) }) }));
}
// The own folder of a new profile of Claude Code. It shares the rules, the skills, the agents and the commands of the user
// through links, so only the login, the settings, the MCP servers and the history are its own. The settings start as a copy.
// The onboarding and the consent are done, as for the folder of the user.
function makeFolder(p: Profile) {
  const dir = claudeDir(p);
  if (dir === claudeDir()) return;
  mkdirSync(dir, { recursive: true });
  for (const name of ["CLAUDE.md", "skills", "agents", "commands"])
    if (existsSync(join(claudeDir(), name)) && !existsSync(join(dir, name)))
      try {
        symlinkSync(join(claudeDir(), name), join(dir, name));
      } catch (e) {
        console.error(`Cannot link ${name} into ${dir}:`, e);
      }
  if (existsSync(join(claudeDir(), "settings.json")) && !existsSync(join(dir, "settings.json"))) copyFileSync(join(claudeDir(), "settings.json"), join(dir, "settings.json"));
  consent(p);
  editJson(claudeJson(p), (config) => (config.hasCompletedOnboarding = true));
}


// Starts a turn of a worker as a Claude Code background session. `args` picks the
// conversation (a new one, a resumed one, or a copy of another) and ends with the prompt.
async function send(w: Worker, args: string[]) {
  // A new worker has no id yet, or the short ID of showStarting. An agent that moves to Claude Code has an id and an
  // empty session, and it must stay.
  const born = !w.id || starting.has(w);
  // A new worker that the limit refuses leaves the list. Else each refused start keeps its "Starting" row with no
  // session, and the row counts as running until the user closes it (Sentry YONDER-Y).
  if (state.workers.filter((x) => x !== w && x.status === "running").length >= MAX_RUNNING) {
    if (born) (state.workers = state.workers.filter((x) => x !== w)), save();
    throw new Error(`${MAX_RUNNING} workers run now, which is the limit. Wait until one finishes, or close one.`);
  }
  const prev = { status: w.status, activity: w.activity, startedAt: w.startedAt };
  // A second message now waits in the queue, and the poll waits for the new turn.
  Object.assign(w, { status: "running", monitoring: undefined, startedAt: Date.now() });
  keepNum(w);
  // The folder of a new profile also needs the trust and the consent once.
  const p = profileOf(w.profile);
  try {
    await ready(p);
    let [out, err, code] = await background(w.path, args, p);
    // A new computer fails at both, first at the disclaimer, then at the trust of the folder.
    for (let i = 0; i < 2; i++) {
      const text = `${out}\n${err}`;
      const untrusted = text.match(/Workspace not trusted\. Run `claude` in (.+?) once/)?.[1];
      if (untrusted) trust(untrusted, p);
      else if (text.includes("requires accepting the disclaimer")) consent(p);
      else break;
      [out, err, code] = await background(w.path, args, p);
    }
    const id = `${out}\n${err}`.match(/backgrounded · ([0-9a-f]{8})/)?.[1];
    if (code || !id) throw new Error(`Claude Code did not start the session: ${(err || out).trim().slice(-300)}`);
    // A new session and a copy get their ID from Claude Code.
    for (let i = 0; i < 20 && !w.sessionId.startsWith(id); i++) {
      const a = (await agents()).find((a) => a.id === id);
      if (a) {
        if (w.sessionId) (w.past ??= []).push(w.sessionId);
        w.sessionId = a.sessionId;
      } else await Bun.sleep(250);
    }
    if (!w.sessionId.startsWith(id)) throw new Error(`Claude Code started the session ${id}, but does not list it.`);
  } catch (e) {
    if (born) state.workers = state.workers.filter((x) => x !== w);
    Object.assign(w, prev);
    save();
    throw e;
  }
  if (born) (w.startId = w.id || undefined), (w.id = w.sessionId.slice(0, 6)), starting.delete(w);
  keepNum(w);
  // New work goes to the top of the list.
  state.workers = [w, ...state.workers.filter((x) => x !== w)];
  Object.assign(w, { model: w.model ?? MODEL, effort: w.effort ?? "high", mode: w.mode ?? state.mode, activity: "Starting", unread: false, attention: false, answered: false, marked: undefined, closedItself: undefined, closedBy: undefined, startedAt: Date.now(), updatedAt: Date.now() });
  save();
}

// `claude stop` returns before the daemon of Claude Code lets the session go, and a resume before that starts a copy.
// A copy cannot reach the sub-agents of the session. A second message to a sub-agent can start a copy
// 5 ms before the daemon lets the old session go. So the resume waits until the roster of the daemon drops the
// session, 5 seconds at most. The roster holds the live sessions by short ID.
// Each config folder has its own daemon and roster (claudeDirs).
const ROSTER = join(HOME, ".claude/daemon/roster.json");
const inRoster = (sessionId: string) =>
  [ROSTER, ...claudeDirs().slice(1).map((dir) => join(dir, "daemon/roster.json"))].some((file) => {
    if (!existsSync(file)) return false;
    try {
      return !!JSON.parse(readFileSync(file, "utf8")).workers?.[sessionId.slice(0, 8)];
    } catch {
      return true; // The daemon writes the file now.
    }
  });

// The projects folder of a profile. A profile with its own account keeps sessions in its config folder.
const projectsRoot = (p?: Profile) => (p?.own && p.cli === "claude" ? join(claudeDir(p), "projects") : PROJECTS);
// Copies a Claude Code session into the folder of another profile, so the same conversation continues on that
// account. Claude Code reads the session from the projects folder of CLAUDE_CONFIG_DIR. So an agent continues when
// one profile has used its week.
function copySession(w: Worker, sessionId: string, to?: Profile) {
  const src = projectsRoot(profileOf(w.profile));
  const dst = projectsRoot(to);
  if (src === dst || !sessionId) return;
  const file = transcriptFile(w.path, sessionId);
  if (!existsSync(file)) return;
  const destDir = join(dst, basename(dirname(file)));
  mkdirSync(destDir, { recursive: true });
  copyFileSync(file, join(destDir, basename(file)));
  const side = file.slice(0, -".jsonl".length);
  if (existsSync(side) && statSync(side).isDirectory()) cpSync(side, join(destDir, basename(side)), { recursive: true });
}
// A CLI id or a CLI name. Undefined means Claude Code. Null means the words are not a CLI.
function cliNamed(name: string): string | undefined | null {
  const key = norm(name);
  const id = key === "claude" || key === "claudecode" ? "claude" : (Object.keys(CLIS).find((k) => norm(k) === key || norm(CLIS[k].name) === key) ?? ALIASES[key]);
  if (id === "claude") return undefined;
  return id && CLIS[id] ? id : null;
}
// The CLI and the profile that `id` asks for. Undefined when `id` is not a profile and not a CLI.
// "" and "default" and the name of the current CLI clear the profile and stay on that CLI. For Claude Code they give the
// default profile when it has its own account (ownDefault).
function targetOf(w: Worker, id: string): { cli?: string; profile?: string } | undefined {
  const cli = w.cli ?? "claude";
  const clear = !id.trim() || norm(id) === "default" || norm(id) === norm(cli) || norm(id) === norm(cliName(cli));
  if (clear) return !w.cli && ownDefault() ? { profile: state.cli } : { cli: w.cli };
  const next = findProfile(id);
  if (next) return { cli: next.cli === "claude" ? undefined : next.cli, profile: next.id };
  const named = cliNamed(id);
  if (named === null) return undefined;
  return { cli: named };
}
function effortFits(cli: string | undefined, effort: string) {
  if (!cli) return (EFFORTS as readonly string[]).includes(effort);
  const efforts = CLIS[cli]?.efforts;
  return !!efforts && effort in efforts;
}
function modeFits(cli: string | undefined, mode: string) {
  if (!cli) return (MODES as readonly string[]).includes(mode);
  return !!CLIS[cli]?.modes[mode as (typeof MODES)[number]];
}
// Moves an agent onto a CLI and a profile. A different CLI keeps the old session in `carry` and starts a new session
// on the next message. The same CLI keeps the session. A Claude Code profile also copies the session file.
function applyCli(w: Worker, cli: string | undefined, profile?: string) {
  const from = w.cli ?? "claude";
  const to = cli ?? "claude";
  if (from === to && (profile ?? "") === (w.profile ?? "")) return false;
  if (from !== to) {
    if (w.sessionId || w.runs?.length) {
      w.carry = { cli: w.cli, sessionId: w.sessionId, runs: w.runs, profile: w.profile };
      // `past` is only for Claude Code sessions. remove_worker deletes those.
      if (!w.cli && w.sessionId) (w.past ??= []).push(w.sessionId);
      w.sessionId = "";
      delete w.runs;
    }
    if (cli) w.cli = cli;
    else delete w.cli;
    delete w.model;
    delete w.agent;
    if (w.effort && !effortFits(cli, w.effort)) delete w.effort;
    if (w.mode && !modeFits(cli, w.mode)) w.mode = modeOf(cli);
  } else if (!w.cli && w.sessionId) copySession(w, w.sessionId, profile ? findProfile(profile) : undefined);
  if (profile) w.profile = profile;
  else delete w.profile;
  return true;
}
// Sets the profile of an agent. `id` is a profile id or name, a CLI id or name, or "" for the current CLI with no
// profile. A profile of another CLI moves the agent to that CLI. Returns true when the profile or the CLI changed.
function setProfile(w: Worker, id: string) {
  const target = targetOf(w, id);
  if (!target) throw new Error(`There is no profile "${id}". The profiles: ${state.profiles.map((p) => p.name).join(", ") || "none"}.`);
  return applyCli(w, target.cli, target.profile);
}
// The old session, for the first message on the new CLI (handoffText). The new CLI stores that text in its own
// session. Later messages resume the new session and do not copy again.
async function handoff(w: Worker, carry: NonNullable<Worker["carry"]>, text: string) {
  const ghost: Worker = { ...w, cli: carry.cli, sessionId: carry.sessionId, runs: carry.runs, profile: carry.profile };
  const files = carry.cli ? (carry.runs ?? []).flatMap((base) => [`${base}.txt`, `${base}.jsonl`]) : carry.sessionId ? [transcriptFile(w.path, carry.sessionId)] : [];
  // The whole file: the start records of Claude Code are large, so the first prompt of a short session can be outside
  // the last 512 KB.
  return handoffText(await turns(ghost, 2000, Infinity), cliName(carry.cli ?? "claude"), files.filter((f) => existsSync(f)), text);
}
// Continues a worker. A live background session must stop first, or Claude Code
// starts a copy, and so does an option on the resume. A worker of an older
// bridge ran `claude -p`, so it has no saved options yet. A new model, effort or
// profile passes all the options, so the worker moves to a copy of its session
// with the same conversation. The old session goes into `past`. A profile of
// another CLI stops the old turn, then starts a new session on that CLI. The
// first message of that session carries the old conversation.
async function resume(w: Worker, text: string, change: Pick<Worker, "model" | "effort" | "mode"> & { profile?: string } = {}) {
  // An agent with no usage left, or on the folder of the user, moves to another profile with its next message (roomFor).
  const to = change.profile === undefined ? await roomFor(w) : undefined;
  if (to) {
    console.log(`Agent ${w.num} moves from ${profileOf(w.profile)?.name ?? "the login of the terminal"} to the profile ${to.name}.`);
    change = { ...change, profile: to.id };
  }
  // Stop the turn on the CLI that has it, before a change of profile can move the agent.
  let background = false;
  if (w.cli) {
    if (w.status === "running") {
      w.startedAt = Date.now();
      await stopRun(w);
    }
  } else {
    background = !!w.sessionId && (await agents()).some((a) => a.kind === "background" && a.sessionId.toLowerCase() === w.sessionId.toLowerCase());
    // A stop in the middle of a turn: the poll waits 8 seconds for a running worker, so it does not take the stop as the end of the task.
    if (w.status === "running") w.startedAt = Date.now();
    if (background) {
      // The messages that the session did not take yet come before the new text, or wait in the queue before a command.
      const lost = (inRoster(w.sessionId) ? await untaken(w) : []).filter((m) => !text.includes(m) && !w.queue?.includes(m));
      if (lost.length && text.startsWith("/")) w.queue = [...lost, ...(w.queue ?? [])];
      else if (lost.length) text = [...lost, text].join("\n\n");
      // Stop on the profile that owns the session, before a change of profile.
      await control("stop", w);
      for (let i = 0; i < 50 && inRoster(w.sessionId); i++) await Bun.sleep(100);
      const back = await unsaid(w);
      if (back && text.startsWith("/")) w.queue = [back, ...(w.queue ?? [])];
      else if (back) text = [back, text].join("\n\n");
    }
  }
  const at = Date.now();
  const before = {
    model: w.model, effort: w.effort, mode: w.mode, profile: w.profile, cli: w.cli, sessionId: w.sessionId,
    runs: w.runs && [...w.runs], carry: w.carry, agent: w.agent, past: w.past && [...w.past], planned: w.planned,
  };
  const restore = () => {
    w.sessionId = before.sessionId;
    if (before.model) w.model = before.model; else delete w.model;
    if (before.effort) w.effort = before.effort; else delete w.effort;
    if (before.mode) w.mode = before.mode; else delete w.mode;
    if (before.profile) w.profile = before.profile; else delete w.profile;
    if (before.cli) w.cli = before.cli; else delete w.cli;
    if (before.runs) w.runs = before.runs; else delete w.runs;
    if (before.carry) w.carry = before.carry; else delete w.carry;
    if (before.agent) w.agent = before.agent; else delete w.agent;
    if (before.past) w.past = before.past; else delete w.past;
    if (before.planned) w.planned = true;
  };
  try {
    if (change.profile !== undefined) setProfile(w, change.profile);
    // A reply to a plan approves it, as in Claude Code: the worker goes on in a copy of its session, in the mode of the
    // Settings. A message before the plan of Claude Code (planned) adds to the task and keeps Plan mode. Another CLI ends
    // its plan with its turn.
    // shortcut: a reply that only changes the plan also ends plan mode; add a "keep planning" input if the user asks for it.
    if (w.mode === "plan" && !change.mode && (w.planned || w.cli)) w.mode = modeOf(w.cli);
    delete w.planned;
    if (change.model) w.model = change.model;
    if (change.effort) {
      if (effortFits(w.cli, change.effort)) w.effort = change.effort;
      else delete w.effort;
    }
    if (change.mode) w.mode = change.mode;
    const carry = w.carry;
    delete w.carry;
    const prompt = carry ? await handoff(w, carry, text) : text;
    if (w.cli) await runTurn(w, prompt);
    else {
      // The mode can change without change.mode: the approval of a plan.
      const changed = !!(change.model || change.effort || w.mode !== before.mode || (before.profile ?? "") !== (w.profile ?? "") || (before.cli ?? "") !== (w.cli ?? ""));
      await send(w, [...(w.sessionId ? ["--resume", w.sessionId] : []), ...(background && !changed ? [] : options(w)), prompt]);
    }
  } catch (e) {
    restore();
    save();
    throw e;
  }
  if (!w.cli) resumed.set(w.id, { text, at });
}

// The permission mode of a new agent that names none: the mode of its CLI in the Agents tab, else the Permissions row
// of the Settings when the CLI has that mode, else Bypass, which each CLI has.
function modeOf(cli?: string): (typeof MODES)[number] {
  const modes = cli && CLIS[cli]?.modes;
  if (!modes) return state.mode;
  const own = state.clis[cli!]?.mode as (typeof MODES)[number] | undefined;
  return own && modes[own] ? own : modes[state.mode] ? state.mode : "bypassPermissions";
}
const cliName = (id: string) => (id === "claude" ? "Claude Code" : (CLIS[id]?.name ?? id));
// The CLI of a new agent, from the words of the user or the CLI row of the Agents tab. Undefined is Claude Code.
const ALIASES: Record<string, string> = { claudecode: "claude", gemini: "antigravity", agy: "antigravity", grokbuild: "grok", cursoragent: "cursor", githubcopilot: "copilot", hermesagent: "hermes" };
// A profile by its ID or its name, as the user says it ("work" or "Claude Work").
const findProfile = (name?: string) => (name?.trim() ? state.profiles.find((p) => norm(p.id) === norm(name) || norm(p.name) === norm(name)) : undefined);
function cliFor(name?: string) {
  const key = norm(name || (profileOf(state.cli)?.cli ?? state.cli));
  // A CLI by its ID or its name, also an added agent with a dash in its ID, such as "qwen-code". An agent that the user
  // added under the name of an alias, such as Gemini CLI, wins over the alias.
  const id = Object.keys(CLIS).find((k) => norm(k) === key || norm(CLIS[k].name) === key) ?? ALIASES[key] ?? key;
  if (id !== "claude" && !CLIS[id]) throw new Error(`Yonder knows no CLI "${name}". The CLIs: claude, ${Object.keys(CLIS).join(", ")}.`);
  return id === "claude" ? undefined : id;
}
// A Claude Code agent takes only a Claude model: "use GPT Image" names a model of Visual Sandbox, and Claude Code cannot
// run it. "Opus" always means the latest Opus, because the alias of Claude Code can start an older one. Another CLI
// takes the name as it is, and the CLI refuses a model that it does not have.
function modelFor(cli: string | undefined, model?: string) {
  if (!model || cli) return model || undefined;
  if (!/^(claude|fable|opus|sonnet|haiku|best|default)[\w.\[\]-]*$/i.test(model)) throw new Error("Only a Claude model. Put an image, video or sound model in the task.");
  return LATEST[model.toLowerCase().replace(/^claude-/, "")] ?? model;
}
// A worker id for an agent in another CLI. The session IDs of some CLIs start with the time, so their first
// characters, which Claude Code workers use, repeat.
function newId() {
  let id: string;
  do id = Math.random().toString(16).slice(2, 8);
  while (state.workers.some((w) => w.id === id));
  return id;
}

// Installs a new Grok harness when Auto update is on and a newer stable version exists. Claude Code updates
// itself. Cursor and Copilot update on their next run when the switch is on. A check that fails stays quiet.
async function refreshHarnesses(only?: string) {
  const ids = only ? [only] : Object.keys(CLIS);
  for (const id of ids) {
    if (id !== "grok" || state.clis[id]?.autoUpdate === false) continue;
    const found = await cliState(id).catch(() => undefined);
    if (!found?.path) continue;
    const check = await run([found.path, "update", "--check", "--json"], 30_000).catch(() => undefined);
    if (!check || check.code) continue;
    let info: { updateAvailable?: boolean; currentVersion?: string; latestVersion?: string } = {};
    try {
      info = JSON.parse(check.out);
    } catch {
      continue;
    }
    if (!info.updateAvailable) continue;
    console.log(`Updating Grok ${info.currentVersion ?? ""} to ${info.latestVersion ?? ""}`);
    const up = await run([found.path, "update"], 300_000).catch((e) => ({ code: 1, out: "", err: String(e) }));
    if (up.code) console.error(`Grok update failed: ${up.err || up.out}`);
    else await cliState(id, true);
  }
}
setTimeout(() => void refreshHarnesses().catch((e) => console.error("Harness update:", e)), 20_000);
setInterval(() => void refreshHarnesses().catch((e) => console.error("Harness update:", e)), 6 * 60 * 60 * 1000);

// Starts a turn of an agent in another CLI (clis.ts): a detached process in its own process group, with its JSON lines
// in a log of RUNS, so that it keeps running when the bridge restarts. A new agent waits up to 5 seconds for its
// session ID, so that a CLI that fails at once, such as one that is not signed in, gives its error to the caller. A
// slower CLI gives the ID later, and followRun reads it.
async function runTurn(w: Worker, text: string) {
  const cli = CLIS[w.cli!];
  const found = await cliState(w.cli!);
  if (!cli) throw new Error(`Yonder knows no CLI "${w.cli}".`);
  if (!found.path || found.error)
    throw new Error(`${cli.name} ${found.path ? `does not start (${found.error})` : "is not installed on this Mac"}. The Agents tab of the Settings can install it.`);
  // A new worker has no id, or the short ID of showStarting. An agent that moves here from another CLI has an id and an
  // empty session: it keeps the id.
  const born = !w.id || starting.has(w);
  // A new worker that the limit refuses leaves the list, as in send.
  if (state.workers.filter((x) => x !== w && x.status === "running").length >= MAX_RUNNING) {
    if (born) (state.workers = state.workers.filter((x) => x !== w)), save();
    throw new Error(`${MAX_RUNNING} workers run now, which is the limit. Wait until one finishes, or close one.`);
  }
  const mode = w.mode ?? modeOf(w.cli);
  if (!cli.modes[mode]) throw new Error(`${cli.name} has no ${mode} mode. Its modes: ${Object.keys(cli.modes).join(", ")}.`);
  const opening = !w.sessionId;
  // A CLI that writes the session ID late gets one from the bridge (Cli.preset).
  const preset = opening && cli.preset ? crypto.randomUUID() : "";
  const prev = { status: w.status, activity: w.activity, startedAt: w.startedAt };
  Object.assign(w, { status: "running", monitoring: undefined, startedAt: Date.now() });
  keepNum(w);
  const base = join(RUNS, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
  writeFileSync(`${base}.txt`, text);
  const spoken = say(SPOKEN);
  writeFileSync(SPOKEN_FILE, spoken);
  const turn: CliTurn = {
    prompt: cli.spoken ? text : `${text}\n\n<voice-call>\n${spoken}\n</voice-call>`,
    cwd: w.path, session: preset || w.sessionId || undefined, fresh: !!preset, model: w.model, effort: w.effort, mode, mcp: mcpUrl(w),
    spoken, spokenFile: SPOKEN_FILE,
  };
  const path = `${dirname(found.path)}${delimiter}${env.PATH ?? ""}`;
  if (cli.acp) {
    // The ACP host starts the CLI, or takes the one of the last turn, and gives the session when it is open.
    const start = cli.acp.start(found.path, turn);
    try {
      const r = await acp.turn({
        command: start.argv,
        env: { PATH: path, ...start.env, ...profileOf(w.profile)?.env },
        cwd: w.path,
        session: w.sessionId || undefined,
        prompt: turn.prompt,
        mode: cli.acp.modes[mode],
        model: start.model,
        effort: start.effort,
        mcp: cli.mcpRun ? [{ name: "yonder", url: turn.mcp }] : [],
        http: start.http,
        base,
        permission: mode === "bypassPermissions" ? "allow" : "reject",
      });
      Object.assign(w, { pid: r.pid, mode, runs: [...(w.runs ?? []), base], sessionId: r.session });
      if (born) (w.id = newId()), starting.delete(w);
      // An added agent that opened a session is signed in.
      const added = state.added?.find((a) => a.id === w.cli && !a.ready);
      if (added) {
        added.ready = true;
        CLIS[added.id] = addedCli(added);
        void cliState(added.id, true);
      }
    } catch (e) {
      if (born) state.workers = state.workers.filter((x) => x !== w);
      Object.assign(w, prev);
      save();
      for (const ext of ["jsonl", "err", "txt"]) rmSync(`${base}.${ext}`, { force: true });
      const why = (e as Error).message;
      if (!/authentication required|not (signed|logged) in/i.test(why)) throw new Error(`${cli.name} stopped: ${why.slice(0, 600)}`);
      // An agent of the registry has no sign-in check, so the message of the agent tells how to sign in.
      if (cli.found) throw new Error(`${cli.name} is signed out. ${why.slice(0, 600)}`);
      lostLogin(cli.id, cli.name);
      throw new Error(`${cli.name} is signed out. The Agents tab of Yonder shows the card to sign in again.`);
    }
  } else {
    let pid = 0;
    try {
      // A profile gives its program, its flags after the program, and its variables.
      const prof = profileOf(w.profile);
      // Auto update is on unless the switch of this CLI is off. Off keeps the flag that stops the CLI from updating itself.
      const updateOff = state.clis[w.cli!]?.autoUpdate === false;
      const args = cli.args!(turn).filter((a) => updateOff || (a !== "--no-auto-update" && a !== "--disable-auto-update"));
      const proc = Bun.spawn([prof?.program ? tilde(prof.program) : found.path, ...flagsOf(prof), ...args], {
        cwd: w.path,
        env: { ...env, PATH: path, ...cli.env?.(turn), ...prof?.env },
        detached: true,
        // stdin is /dev/null, or the prompt for a CLI that reads it there: an open pipe makes some CLIs wait for good.
        stdin: cli.stdin ? Bun.file(`${base}.txt`) : "ignore",
        stdout: Bun.file(`${base}.jsonl`),
        stderr: Bun.file(`${base}.err`),
      });
      pid = proc.pid;
      ours.add(pid);
      void proc.exited.then((code) => exits.set(pid, code));
      proc.unref();
    } catch (e) {
      if (born) state.workers = state.workers.filter((x) => x !== w);
      Object.assign(w, prev);
      save();
      throw new Error(`${cli.name} did not start: ${(e as Error).message}`);
    }
    Object.assign(w, { pid, mode, runs: [...(w.runs ?? []), base], sessionId: preset || w.sessionId });
    if (born) (w.id = newId()), starting.delete(w);
    if (opening) {
      // The session ID from the first lines, or, when the bridge picked it, 2 seconds for a CLI that fails at once.
      for (let i = 0; i < (preset ? 8 : 20) && !exits.has(pid) && !(w.sessionId && !preset); i++) {
        await Bun.sleep(250);
        w.sessionId ||= await sessionOf(cli, `${base}.jsonl`);
      }
      w.sessionId ||= await sessionOf(cli, `${base}.jsonl`);
      const list = exits.has(pid) ? await runSteps(cli, `${base}.jsonl`) : [];
      const error = lastOf(list, (s) => s.error)?.error;
      if (exits.has(pid) && (!w.sessionId || ((error || exits.get(pid)) && !list.some((s) => s.done)))) {
        if (born) state.workers = state.workers.filter((x) => x !== w);
        save();
        const why = (error || stderrOf(base) || `exit code ${exits.get(pid)}`).slice(0, 600);
        for (const ext of ["jsonl", "err", "txt"]) rmSync(`${base}.${ext}`, { force: true });
        if (cli.signIn && SIGNED_OUT_OTHER.test(why)) {
          lostLogin(cli.id, cli.name);
          throw new Error(`${cli.name} is signed out: ${why} The Agents tab of Yonder shows the card to sign in.`);
        }
        throw new Error(`${cli.name} stopped: ${why}`);
      }
    }
  }
  // New work goes to the top of the list.
  state.workers = [w, ...state.workers.filter((x) => x !== w)];
  Object.assign(w, { activity: "Starting", unread: false, attention: false, answered: false, marked: undefined, closedItself: undefined, closedBy: undefined, startedAt: Date.now(), updatedAt: Date.now() });
  save();
}

// The start ID of a live background session that this bridge started: `claude --bg` got it in the address of its
// --mcp-config (options), and the roster of the daemon keeps those arguments. A test bridge has another port.
function startOf(s: Pick<Worker, "sessionId" | "profile">) {
  try {
    const args: string[] = JSON.parse(readFileSync(join(claudeDir(profileOf(s.profile)), "daemon/roster.json"), "utf8")).workers?.[s.sessionId.slice(0, 8)]?.dispatch?.launch?.args ?? [];
    return args.join(" ").match(new RegExp(`//127\\.0\\.0\\.1:${PORT}/mcp\\?worker=(\\w+)[&"]`))?.[1];
  } catch {} // No roster, or the daemon writes it now: the next refresh reads it again.
}

// Starts a worker: the start_worker tool, and each start of a schedule (Schedule). It returns when the session runs.
type Start = { project: string; task: string; name?: string; cli?: string; profile?: string; effort?: Worker["effort"]; model?: string; mode?: Worker["mode"]; agent?: string; schedule?: string; closeWhenDone?: boolean; owner?: string };
async function startWorker({ project, task, name, cli, profile, effort, model, mode, agent, schedule, closeWhenDone, owner }: Start, prompt = task) {
  // The defaults of the person who starts it (`people` in config.json): a workspace when the start names none, and a profile
  // when it names no CLI and no profile. A default that does not resolve is left out, so it never stops a start.
  const person = owner ? People.ownerOf(people(), owner) : undefined;
  if (!project.trim() && person?.workspace) {
    try {
      findProject(person.workspace);
      project = person.workspace;
    } catch (e) {
      console.error(`The workspace "${person.workspace}" of ${person.name} in people of ${CONFIG_FILE} does not resolve, so Yonder picks one: ${(e as Error).message}`);
    }
  }
  if (!profile?.trim() && !cli?.trim() && person?.profile && (profileOf(person.profile) ?? findProfile(person.profile))) profile = person.profile;
  // The + button of All projects gives no project. The agent shows at once in a first guess, and moves to the
  // project of the task before its first turn, so the work runs in the right folder.
  const auto = !project.trim();
  const p = notHome(auto ? firstGuess() : adoptFolder(findProject(project)));
  // A workspace with no folder starts its agents in the default folder, else in ~/Yonder, which can be missing.
  if (p.home === false && p.path === join(HOME, "Yonder")) yonderFolder();
  // `profile` is a profile id or name. A profile in the place of a CLI still works. No CLI and no profile: the CLI row of the Agents tab.
  const named = profile?.trim() ? profileOf(profile) ?? findProfile(profile) : undefined;
  if (profile?.trim() && !named) throw new Error(`There is no profile "${profile}". The profiles: ${state.profiles.map((x) => x.name).join(", ") || "none"}.`);
  // Claude Code by name is the default profile too, when that profile has its own account (ownDefault).
  const claudeNamed = !named && !!cli?.trim() && !findProfile(cli) && !cliFor(cli) && !!ownDefault();
  const prof = named ?? findProfile(cli) ?? (cli?.trim() && !claudeNamed ? undefined : await defaultProfile(p, claudeNamed));
  const other = prof ? (prof.cli === "claude" ? undefined : prof.cli) : cliFor(cli);
  if (other && !CLIS[other]) throw new Error(`The profile ${prof?.name} runs ${other}, which is not on this Mac.`);
  if (other && mode && !CLIS[other].modes[mode]) throw new Error(`${CLIS[other].name} has no ${mode} mode. Its modes: ${Object.keys(CLIS[other].modes).join(", ")}.`);
  if (other && agent?.trim()) throw new Error(`Only Claude Code has agents such as "${agent}". Leave out the agent, or start the worker in Claude Code.`);
  // The ID comes from the CLI when the session starts.
  const w: Worker = {
    id: "", num: freeNum(), sessionId: "", name: name?.trim() ? nameFrom(name, 6) : nameFrom(task) || "Attachment", project: p.name, workspace: p.id, path: p.path, task,
    status: "running", activity: "", result: "", unread: false, startedAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
    cli: other,
    profile: prof?.id,
    effort,
    model: modelFor(other, model),
    mode,
    agent: agent?.trim() || undefined,
    schedule,
    closeWhenDone: closeWhenDone || undefined,
    ownName: !!name?.trim() || undefined,
    owner: person?.id,
  };
  showStarting(w);
  // The first words of the task show until the title comes. Haiku takes a few seconds, so a rename in that time stays.
  const first = w.name;
  // A task of only attachments, such as a pasted screenshot, gets its title and its model from the paths of the prompt.
  const about = task.trim() || prompt;
  const pr = prOf(about);
  const retitle = (title: string) => title && w.name === first && (w.name = title) && save();
  if (!name?.trim() && !pr) void titleOf(about, w).then(retitle);
  const [guess] = await Promise.all([auto && projectOf(task, p, w), pick(about, w)]);
  const to = guess && notHome(adoptFolder(guess));
  if (to && (to.path !== w.path || to.id !== w.workspace)) {
    if (to.home === false && to.path === join(HOME, "Yonder")) yonderFolder();
    Object.assign(w, { project: to.name, workspace: to.id, path: to.path });
    // The project of the guess can have its own default profile.
    // shortcut: only a profile of the same CLI applies, because pick chose the model for that CLI; a move to another CLI when the user asks for it.
    if (!named && !cli?.trim()) {
      const again = await defaultProfile(to);
      if ((again ? (again.cli === "claude" ? undefined : again.cli) : cliFor()) === w.cli) w.profile = again?.id;
    }
    save();
  }
  // After the move, so that gh reads the PR in the repository of the project. It replaces the name of Grok too, because
  // Grok does not know the topic of the PR.
  if (pr && !w.ownName) void prName(pr, about, w).then(retitle);
  if (w.cli) await runTurn(w, prompt);
  else await send(w, [...options(w), prompt]);
  return w;
}

// The profile of a new agent that names no profile: the default profile of its workspace (`profile` in config.json), else
// the default profile of the Settings, or another profile with room (roomy). `claude`: the task names Claude Code, so only
// a profile of Claude Code fits. A workspace can have its own profile, such as its own subscription. A folder that is no workspace still reads `projectProfiles`, the key of the projects.
async function defaultProfile(ws: Project, claude = false) {
  const mine = ws.id ? (ws.profile ? profileOf(ws.profile) ?? findProfile(ws.profile) : undefined) : profileOf(state.projectProfiles[ws.path]);
  const want = mine && (!claude || mine.cli === "claude") ? mine : profileOf(state.cli);
  const p = await roomy(want);
  if (p !== want) console.log(`The profile ${want?.name} has no usage left, so the new agent starts on ${p?.name}.`);
  return p;
}

// The schedules (Schedule). A check every 30 seconds starts each schedule that is due. The check sets the next start
// before the start, so the next check does not start it again. A Mac that sleeps runs no check: when it wakes fully, a schedule
// that was due starts once, and its next start counts from then, so the starts that the sleep missed do not pile up.
// A schedule whose agent of the last start still runs skips the start. A start that fails or skips sends a push, and
// the push of settle tells when the agent finishes, fails or waits on the user.
// The CLI and the profile of a schedule, from a save. `profile` is a profile name or id, or "" or "default" to clear
// it. `cli` is a CLI, or a profile name. A profile sets the CLI. A clear of a profile also clears the CLI that the
// profile set, so the next start uses the CLI row of the Agents tab. A schedule that had no profile keeps its CLI.
function setScheduleRunner(s: Schedule, cli: string | undefined, profile: string | undefined) {
  let nextCli = s.cli;
  let nextProfile = s.profile;
  if (cli !== undefined) {
    const asProfile = cli.trim() ? findProfile(cli) : undefined;
    if (asProfile) {
      nextProfile = asProfile.id;
      nextCli = asProfile.cli;
    } else if (cli.trim()) {
      nextCli = cliFor(cli) ?? "claude";
      nextProfile = undefined;
    } else {
      nextCli = undefined;
      nextProfile = undefined;
    }
  }
  if (profile !== undefined) {
    const clear = !profile.trim() || norm(profile) === "default";
    if (clear) {
      const had = nextProfile;
      nextProfile = undefined;
      if (had && cli === undefined) nextCli = undefined;
    } else {
      const chosen = findProfile(profile);
      if (!chosen) throw new Error(`There is no profile "${profile}". The profiles: ${state.profiles.map((p) => p.name).join(", ") || "none"}.`);
      if (cli !== undefined && cli.trim()) {
        const asked = findProfile(cli)?.cli ?? cliFor(cli) ?? "claude";
        if (asked !== chosen.cli) throw new Error(`The profile ${chosen.name} runs ${cliName(chosen.cli)}, not ${cliName(asked)}.`);
      }
      nextProfile = chosen.id;
      nextCli = chosen.cli;
    }
  }
  return { cli: nextCli, profile: nextProfile };
}
const findSchedule = (ref: string) => {
  const key = norm(ref);
  const s = state.schedules.find((x) => x.id === ref.trim()) ?? state.schedules.find((x) => norm(x.name) === key) ?? state.schedules.find((x) => key.length >= 3 && norm(x.name).includes(key));
  if (!s) throw new Error(`There is no schedule "${ref}". The schedules: ${state.schedules.map((x) => `${x.name} (${x.id})`).join(", ") || "none"}.`);
  return s;
};
// The agent of the last start of a schedule, while it runs. A run with a retry in its queue (settle) still runs.
const runOf = (s: Schedule) => state.workers.find((w) => w.schedule === s.id && (w.status === "running" || (w.status === "failed" && !!w.queue?.length)));
const isTrigger = (s: Timing & { event?: string }) => !!(s.event || s.hook || s.script);
// A trigger runs on text that anyone can write, such as the message of an error, so it never runs in Bypass: it runs in
// its own mode, or in Auto, because of the risk of prompt injection.
const triggerMode = (mode?: Schedule["mode"]) => (mode && mode !== "bypassPermissions" ? mode : "auto");
const runMode = (s: Schedule) => (isTrigger(s) ? triggerMode(s.mode) : s.mode);
// `prompt` is the task with an event, for a trigger (eventPrompt).
async function runSchedule(s: Schedule, prompt?: string) {
  const busy = runOf(s);
  if (busy) throw new Error(`Agent ${busy.num} of the last start still runs, so the schedule did not start another.`);
  // A removed profile does not fall back to another account. A CLI that is not installed, or a profile that is not
  // signed in, fails in startWorker. The check stores that text and sends one push (checkSchedules).
  const named = s.profile ? profileOf(s.profile) ?? findProfile(s.profile) : findProfile(s.cli);
  if (s.profile && !named) throw new Error(`The profile of this schedule was removed. Pick another profile in Settings, ${isTrigger(s) ? "Triggers" : "Schedules"}, ${s.name}.`);
  const w = await startWorker({
    project: s.project, task: s.task, name: s.name, cli: named ? undefined : s.cli, profile: named?.id,
    // A run closes itself when it ends well, and stays open when it fails or leaves something for the user (closeItself).
    effort: s.effort, model: s.model, mode: runMode(s), schedule: s.id, closeWhenDone: true, owner: s.owner,
  }, prompt).catch((e) => {
    const msg = (e as Error).message;
    if (named && !msg.includes(named.name)) throw new Error(`${named.name}: ${msg}`);
    throw e;
  });
  delete s.missed;
  save();
  return w;
}
// The reason why a start did not happen, for the page of the schedule, and a push. A trigger sends a push only for a new
// reason, so a burst of events, or a poll of Sentry each minute, sends one push.
function miss(s: Schedule, why: string) {
  const again = isTrigger(s) && s.missed?.why === why;
  s.missed = { at: Date.now(), why };
  save();
  if (!again) push(`${isTrigger(s) ? "Trigger" : "Schedule"} · ${s.name}`, `Did not start: ${why}`.slice(0, 240));
}
const startDue = (s: Schedule, prompt?: string) => void runSchedule(s, prompt).catch((e) => miss(s, (e as Error).message));
// A Mac in a dark wake (the lid closed, a wake of a minute for the network) starts no run, and sends no retry of a run
// (sendQueued). Else a run starts in a dark wake, and the Mac sleeps in the middle of it.
let wakeAt = 0;
let woke = true;
function awakeMac() {
  if (!MAC) return true;
  if (Date.now() - wakeAt > 5000) {
    wakeAt = Date.now();
    woke = fullWake(Bun.spawnSync(["/usr/bin/pmset", "-g", "systemstate"]).stdout.toString());
  }
  return woke;
}
// A running worker, such as a run of a schedule, holds idle sleep off, as a call does (/awake). The Mac sleeps after
// 1 minute with no use once no worker runs. A closed lid still puts the Mac to sleep, and the run then continues at the next full wake.
// shortcut: only on the Mac; add systemd-inhibit and SetThreadExecutionState as /awake does if runs stop in idle sleep there.
let runAwake: ReturnType<typeof Bun.spawn> | undefined;
// The reminders that are due go to the phones as a push. A push needs no full wake, so a dark wake sends it too, and a
// reminder that a sleep missed goes once at the next wake. It leaves the list before the push, so the next check does
// not send it again. A push that reached no phone, such as right after a wake with no network yet, tries again at the
// next checks. It goes also while the user works on the Mac (no hereUntil): only the phone shows a reminder.
// shortcut: it gives up after 20 checks (10 minutes) with no phone; keep it longer if a reminder gets lost that way.
async function sendReminders(now: number) {
  const due = state.reminders.filter((r) => r.at <= now);
  if (!due.length) return;
  state.reminders = state.reminders.filter((r) => r.at > now);
  save();
  for (const r of due) {
    const sent = (await relay?.push("Reminder", r.text.slice(0, 240), phonesOf(r.owner)).catch(() => 0)) ?? 0;
    console.log(`Reminder ${r.id}: ${sent ? `sent to ${sent} phone${sent > 1 ? "s" : ""}` : "no phone got it"}: ${r.text}`);
    if (sent || (r.tries ?? 0) >= 19) continue;
    state.reminders.push({ ...r, tries: (r.tries ?? 0) + 1 });
    save();
  }
}
function checkSchedules() {
  const now = Date.now();
  void sendReminders(now);
  if (MAC && runAwake?.exitCode !== null && state.workers.some((w) => w.status === "running"))
    runAwake = Bun.spawn(["/usr/bin/caffeinate", "-i", "-t", "60"], { stdout: "ignore", stderr: "ignore" });
  if (!awakeMac()) return;
  for (const s of state.schedules) {
    // A schedule with no timing, such as a trigger of an old bridge, never starts by the clock.
    if (s.paused || isTrigger(s) || (!s.every && !s.cron) || s.next > now) continue;
    s.next = nextRun(s, now) ?? 0;
    if (!s.next) s.paused = true;
    save();
    startDue(s);
  }
}
setInterval(checkSchedules, 30_000);
// A web request to the address of a trigger: https://mcp.yonder.so/<id>/hook/<hook> through the relay, or /hook/<hook>
// on this computer, such as an agent that starts to fix a new error in Sentry. It answers before the start, because Sentry waits only 1 second. The body goes into the
// prompt as data (eventPrompt). With a signing secret, a request needs the signature of its service (signed). An event
// that comes while the agent of the last start runs waits in the queue of that agent, so the agents of one trigger do
// not change the same files at the same time, and no event is lost. A script trigger needs no address on the web.
// shortcut: at most 5 events wait for one agent, and a later one only shows under Past runs; start a second agent if bursts of events matter.
async function hookAt(req: Request, prefix: string) {
  const key = Buffer.from(new URL(req.url).pathname.slice(prefix.length));
  const s = state.schedules.find((x) => !!x.hook && x.hook.length === key.length && timingSafeEqual(Buffer.from(x.hook), key));
  if (!s) return new Response("Not found", { status: 404 });
  if (req.method !== "POST") return new Response("Send a POST to start the trigger.", { status: 405 });
  const body = await req.text();
  if (s.secret && !signed(req.headers, body, s.secret)) return new Response("The signature is missing or wrong.", { status: 401 });
  if (s.paused) return new Response("The trigger is off, so no agent starts.");
  const prompt = eventPrompt(s.task, body);
  const busy = runOf(s);
  if (busy && (busy.queue?.length ?? 0) >= 5) {
    miss(s, `Agent ${busy.num} still runs, with 5 events in its queue, so this event did not start.`);
    return new Response("Too many events wait for the agent.", { status: 429 });
  }
  if (!busy) startDue(s, prompt);
  else {
    busy.queue = [...(busy.queue ?? []), prompt];
    save();
  }
  return new Response(busy ? `Agent ${busy.num} gets it when its turn ends.` : "Started.", { status: 202 });
}
// A script trigger (`script`). Each minute the bridge runs the script with sh in the folder of the project, and each
// new line of its output starts the agent, with the line as data. Claude Code writes the script (designPrompt), so a
// trigger can watch anything that a command or an API can see: a file, a folder, a CLI, an inbox, or a service such as
// Sentry. It is one universal trigger, in place of a built-in kind for each service. The first run
// after a save only notes its lines, so the lines that were there before start no agent. One agent runs at a time: a
// line counts as seen only when its agent starts, so the other new lines wait for a later run. A run that waits on the
// user does not count as running.
// One run of a script at a time: a second call, such as Run now during the run of the minute, gets the run that runs.
// shortcut: reads the whole output and keeps its last 100 lines; cap the read if a script prints megabytes.
const polls = new Map<string, Promise<Worker | undefined>>();
const pollTrigger = (s: Schedule) => {
  let poll = polls.get(s.id);
  if (!poll) polls.set(s.id, (poll = pollScript(s).finally(() => polls.delete(s.id))));
  return poll;
};
async function pollScript(s: Schedule) {
  const proc = Bun.spawn(["/bin/sh", "-c", s.script!], { cwd: s.project, env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(`Script: it ended with ${code}${err.trim() ? `: ${err.trim().split("\n").pop()!.slice(0, 160)}` : ""}.`);
  if (s.missed?.why.startsWith("Script: ")) delete s.missed;
  const key = (line: string) => Bun.hash(line).toString(36);
  const lines = outputLines(out);
  if (!s.seen) {
    s.seen = lines.map(key);
    return void save();
  }
  const fresh = lines.find((l) => !s.seen!.includes(key(l)));
  if (!fresh) return void save();
  const w = await runSchedule(s, eventPrompt(s.task, fresh));
  s.seen = [...s.seen, key(fresh)].slice(-500);
  save();
  return w;
}
setInterval(() => {
  for (const s of state.schedules) if (s.script && !s.paused && !runOf(s)) pollTrigger(s).catch((e) => miss(s, (e as Error).message));
}, 60_000);
// The schedule as the app and the voice agent see it: the name of its project, the timing in words, the next start in
// local time, and the agents of its past starts, the newest first.
// The past starts are the agents of the schedule that Yonder still has, so a removed agent leaves the list. `ok` is the
// last runs that ended well, from the log (RUNS_LOG), also of removed agents.
// shortcut: reads the whole log at each list, fine for years of daily runs; rotate it if it grows to megabytes.
const okRuns = (): { at: number; schedule: string; name: string; agent?: number; tries: number; result: string }[] => {
  try {
    return readFileSync(RUNS_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};
const scheduleInfo = (s: Schedule) => {
  // A profile name that an older save put in `cli` still resolves. A removed profile keeps its id.
  const bound = s.profile ? profileOf(s.profile) ?? findProfile(s.profile) : findProfile(s.cli);
  // A webhook trigger gives the address to paste into the webhook settings of a service. It has none while the relay is
  // not connected. The signing secret never leaves the bridge, and `signed` says that it has one.
  const address = s.hook ? connectorAddress() : undefined;
  const { secret, seen, ...rest } = s;
  return {
    ...rest,
    ...(address && { hookUrl: `${address}/hook/${s.hook}` }),
    ...(secret && { signed: true }),
    mode: runMode(s),
    project: projects().find((p) => keyOf(p) === s.project)?.name ?? basename(s.project),
    path: s.project,
    when: isTrigger(s) && !s.hook && !s.script ? "Not set up" : timingText(s),
    retries: s.retries ?? 2,
    profile: bound?.id ?? (s.profile || undefined),
    ...(bound && { profileName: bound.name }),
    ...(s.profile && !bound && { profileMissing: true }),
    ...(!bound && !s.profile && s.cli && { cliName: cliName(s.cli) }),
    nextAt: s.paused || isTrigger(s) ? undefined : new Date(s.next).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    runs: state.workers
      .filter((w) => w.schedule === s.id)
      .sort((a, b) => (b.createdAt ?? b.startedAt) - (a.createdAt ?? a.startedAt))
      .slice(0, 10)
      .map((w) => ({ id: w.id, num: w.num, name: w.name, status: w.status, at: w.createdAt ?? w.startedAt, unread: w.unread, attention: w.attention })),
    ok: okRuns().filter((r) => r.schedule === s.id).slice(-5).reverse(),
  };
};

// The copy that a message to a terminal session started, by the session ID of that session. A later message goes to
// that copy, and does not start one more copy. A message into the session itself comes as a message from another
// session, and Claude Code does not take such a message as the approval of the user.
const forks = new Map<string, Worker>();

// A new agent shows in the list at once, as "Starting", with a short ID of its own until Claude Code gives
// the session ID, a few seconds later.
// send and runTurn know a new agent by this set, not by an empty ID, because the short ID is not empty.
let starts = 0;
const starting = new WeakSet<Worker>();
function showStarting(w: Worker) {
  // The time makes the ID unique also after a restart of the bridge, because the agent keeps it as startId.
  Object.assign(w, { id: `new${Date.now()}${++starts}`, activity: "Starting" });
  starting.add(w);
  state.workers.unshift(w);
  save();
}

// The app puts the summary in the prompt of Grok. Else Grok knows only that an agent waits, and says "It needs your
// reply to continue."
// The paths of the logs of an agent in another CLI stay in the bridge.
// The profile of an agent for list_workers: its profile name, or else its CLI, such as "Claude Code".
const profileName = (w: Worker) => profileOf(w.profile)?.name ?? w.profile ?? cliName(w.cli ?? "claude");
const brief = ({ runs, ...w }: Worker) => ({ ...w, ...(w.profile && { profile: profileOf(w.profile)?.name ?? w.profile }), result: w.result.slice(-400), summary: summaryOf({ ...w, runs }), next: nextOf({ ...w, runs }) });
const SMALL = new Set("the and for that this with about from what was were did does any update agent agents one".split(" "));

// Each tool replies with JSON, or with the error text and isError.
// The other computers of the phone, for the agents of this Mac (the other_computer tool). The bridge reaches each
// computer that a phone introduced through the relay itself (askPeer). The phone carries only a call that the bridge
// cannot send, such as one to a computer with an older bridge. While the app is on the screen or in a
// call, the phone POSTs /elsewhere every 3 seconds with the names of its other computers and the results of the calls
// it ran, and takes the new calls.
// Each phone that polls keeps its own list, and a call goes only to a phone that knows that computer. Else a second
// phone, paired with this Mac only, takes half of the calls and answers "The phone is paired only with".
type Remote = { id: number; computer: string; tool: string; arguments: Record<string, unknown> };
const remote = { phones: new Map<string, { computers: string[]; seen: number }>(), queue: [] as Remote[], next: 1, waits: new Map<number, (r: { text: string; error?: boolean }) => void>() };
const nearPhones = () => [...remote.phones.values()].filter((p) => Date.now() - p.seen < 15_000);
const phoneNear = () => nearPhones().length > 0;
// As pickMac in src/link.ts: the name of the computer has the word.
const knows = (computers: string[], name: string) => computers.some((c) => c.toLowerCase().includes(name.trim().toLowerCase()));
function askPhone(computer: string, tool: string, args: Record<string, unknown>) {
  const id = remote.next++;
  remote.queue.push({ id, computer, tool, arguments: args });
  return new Promise<{ text: string; error?: boolean }>((done) => {
    const timer = setTimeout(() => {
      remote.waits.delete(id);
      remote.queue = remote.queue.filter((r) => r.id !== id);
      done({ text: "The phone gave no answer in 60 seconds.", error: true });
    }, 60_000);
    remote.waits.set(id, (r) => (clearTimeout(timer), remote.waits.delete(id), done(r)));
  });
}
// A call to another computer through the relay, with no phone (`peers` in bridge/relay.ts), and an MCP client of its
// own, as in src/elsewhere.ts. A call through the phone fails while the app is in the background or in a call: "The
// Yonder app is not open on the phone".
// `offline`: the call did not leave this Mac, so the phone can carry it with no risk of a second run.
const peerClients = new WeakMap<object, Promise<Client>>();
async function askPeer(p: Peer, tool: string, args: Record<string, unknown>) {
  const fetch = relay!.reach(p);
  let client = peerClients.get(fetch);
  if (!client) {
    const c = new Client({ name: "yonder-peer", version: "0.1.0" });
    peerClients.set(fetch, (client = c.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:7787/mcp"), { fetch })).then(() => c)));
  }
  try {
    const res = await (await client).callTool({ name: tool, arguments: args });
    return { text: (res.content as { text?: string }[]).map((x) => x.text ?? "").join(""), ...(res.isError ? { error: true } : {}) };
  } catch (e) {
    peerClients.delete(fetch);
    const why = (e as Error).message;
    // An older bridge refuses the key of this Mac, and so does one that the phone did not tell yet.
    const text = /not paired with the Mac/.test(why)
      ? `${p.name} does not know this computer yet. It needs the newest Yonder, and then the Yonder app must open on the phone once while ${p.name} is on.`
      : /does not let/.test(why)
        ? `${p.name} does not let this computer reach it. The user can change it on the phone in Settings, Environment, in the details of ${p.name}.`
        : `${p.name} gave no answer: ${why}`;
    return { text, error: true, offline: !!(e as { offline?: boolean }).offline };
  }
}
// The peer with that name: the same name, else the only name with the word, as pickMac in src/link.ts. Else the words for the agent.
function pickPeer(peers: Peer[], name: string): Peer | string {
  const word = name.trim().toLowerCase();
  const exact = peers.filter((p) => p.name.toLowerCase() === word);
  const near = exact.length ? exact : peers.filter((p) => p.name.toLowerCase().includes(word));
  if (near.length === 1) return near[0];
  return `${near.length ? "" : `No other computer matches "${name}". `}Ask the user which one: ${(near.length ? near : peers).map((p) => p.name).join(", ")}.`;
}

async function reply(fn: () => unknown): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(worded(await fn())) }] };
  } catch (e) {
    return { content: [{ type: "text", text: say((e as Error).message) }], isError: true };
  }
}
// The words of the bridge in a result have the word of the user for an agent (`say`): a text, and the note, said and
// error of an object. The other fields stay, because a task, a result, a name or a path has the words of the user or
// of an agent, which the client can pass back to a tool.
function worded(out: unknown) {
  if (typeof out === "string") return say(out);
  if (!out || typeof out !== "object" || Array.isArray(out)) return out;
  const o = { ...(out as Record<string, unknown>) };
  for (const k of ["note", "said", "error"]) if (typeof o[k] === "string") o[k] = say(o[k] as string);
  return o;
}
// The phone gives each start_worker and message_worker a key. When the relay drops the phone during the call, the phone
// sends the call again with the same key, and gets the answer of the first run (`queue` in src/bridge.ts). So an agent
// never starts two times (Sentry YONDER-1).
// shortcut: the keys live in memory for 10 minutes, so a resend after a restart of the bridge runs again; save them if that matters.
const keyed = new Map<string, Promise<CallToolResult>>();
function replyOnce(key: string | undefined, fn: () => unknown) {
  if (!key) return reply(fn);
  let run = keyed.get(key);
  if (!run) {
    keyed.set(key, (run = reply(fn)));
    void run.then(() => setTimeout(() => keyed.delete(key), 600_000));
  }
  return run;
}

// A HEIC photo of an iPhone gets a JPEG beside it, because an agent reads only PNG, JPEG, GIF and WebP. sips is on macOS only.
async function readable(path: string) {
  const jpeg = path.replace(/\.hei[cf]$/i, ".jpg");
  if (jpeg !== path) await Promise.resolve().then(() => Bun.spawn(["sips", "-s", "format", "jpeg", path, "--out", jpeg], { stdout: "ignore", stderr: "ignore" }).exited).catch(() => {});
  return existsSync(jpeg) ? jpeg : path;
}
// A file for an agent from send_file or create_upload: in FILES/<task>/<id>/<name>, or a video in
// VIDEOS/<task>/<id>/video.<ext>. `task` is the id of the agent that gets it, or none.
const isVideo = (name: string) => /\.(mov|mp4|m4v|webm|mkv)$/i.test(name);
function placeFile(name: string, task = "") {
  const dir = join(isVideo(name) ? VIDEOS : FILES, task, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, isVideo(name) ? `video${extname(name).toLowerCase()}` : name);
}
// The work on a file that came whole. A video gets its keyframes and the words of its sound (buildVideo), because an
// agent cannot watch a video, and its folder is the path for the agent. The original stays.
async function readyFile(path: string, name: string) {
  const size = statSync(path).size;
  if (!size || size > MAX_FILE) throw new Error(`Send a file of ${MAX_FILE / 1e9} GB or less.`);
  if (!isVideo(name)) return { path: await readable(path), name, size };
  const { thumb, ...made } = await buildVideo(dirname(path), path);
  return { ...made, name, size };
}
// A file that the user copied in Finder, at its own place: nothing is copied, and the agent gets its path. A video gets
// a folder with a link to the file, its frames and timeline.md, and a picture gets a thumb for the prompt box. Each
// other file, and a video that ffmpeg cannot read, gives only its path and its name.
// A folder gives its path with `folder`, and the app types the path in the prompt box.
async function localFile(path: string) {
  if (!isAbsolute(path) || !existsSync(path)) throw new Error("Yonder cannot find the file.");
  const name = basename(path);
  if (statSync(path).isDirectory()) return { path, name, folder: true };
  if (isVideo(name)) {
    const dir = join(VIDEOS, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const link = join(dir, `video${extname(name).toLowerCase()}`);
    mkdirSync(dir, { recursive: true });
    symlinkSync(path, link);
    try {
      const { seconds, thumb } = await buildVideo(dir, link);
      return { path: dir, seconds, thumb };
    } catch {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) {
    const proc = Bun.spawn(["ffmpeg", "-v", "error", "-i", path, "-frames:v", "1", "-vf", "scale=-2:176", "-q:v", "5", "-f", "mjpeg", "-"], { stdout: "pipe", stderr: "ignore" });
    const [jpeg, code] = await Promise.all([new Response(proc.stdout).arrayBuffer(), proc.exited]);
    if (!code && jpeg.byteLength) return { path, thumb: `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}` };
  }
  return { path, name };
}
// The original of a video that the user copied in Finder (localFile), for the agent.
const originOf = (dir: string) => {
  const link = readdirSync(dir).find((f) => f.startsWith("video.") && lstatSync(join(dir, f)).isSymbolicLink());
  return link ? `${dir}\n(the video is at ${readlinkSync(join(dir, link))})` : dir;
};
async function keepFile(name: string, write: (path: string) => Promise<unknown>) {
  name = basename(name).replace(/[^\w. -]/g, "_").replace(/^\.+/, "") || "file";
  const path = placeFile(name);
  try {
    await write(path);
    return await readyFile(path, name);
  } catch (e) {
    rmSync(dirname(path), { recursive: true, force: true });
    throw e;
  }
}
// create_upload: a file from the code tool of the Claude app, in parts through the relay, encrypted to this computer
// (bridge/upload.ts). When the whole file is there, the agent of the upload gets it with the message, or a new agent
// starts with it. So the Claude app can send a large file, such as a video of 335 MB.
const uploads = startUploads(join(CONFIG, "uploads.json"), {
  max: MAX_FILE,
  place: (u, name) => placeFile(name, u.worker || "new"),
  finish: async (u) => {
    const made = await readyFile(u.file, u.name);
    const message = u.message.trim() || `The user sent ${u.name} from the Claude app.`;
    // The file stays when the message fails, such as for an agent that the user removed, and the client can give it.
    try {
      const w = u.worker
        ? await ownTool("message_worker", { worker: u.worker, message, files: [made.path] })
        : await ownTool("start_worker", { project: "", name: "", task: message, files: [made.path] });
      return { ...made, agent: w.num };
    } catch (e) {
      return { ...made, not_given: `${(e as Error).message} Give path in files of message_worker or start_worker.` };
    }
  },
});
// A tool of this bridge, called as a client calls it, such as message_worker for an upload that came whole.
async function ownTool(name: string, args: Record<string, unknown>) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const res = await mcpRequest(new Request(`http://127.0.0.1:${PORT}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body }), "");
  const { result } = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
  const text = result.content.map((c) => c.text).join("");
  if (result.isError) throw new Error(text);
  return JSON.parse(text);
}
// The address of an upload, as its client sees it, without /send.sh.
const uploadAt = (req: Request, prefix: string) => {
  const url = new URL(req.url);
  return uploads.handle(req, url.pathname.slice(prefix.length), url.origin + url.pathname.replace(/\/send\.sh$/, ""));
};
// The downloads of send_file that run, by url.
const downloads = new Map<string, ReturnType<typeof keepFile>>();
// shortcut: a server with no Content-Length can send more than MAX_FILE before the size check; stream with a count if that matters.
async function downloadFile(url: string, name?: string) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30 * 60_000) });
  if (!res.ok) throw new Error(`The link answered ${res.status}.`);
  if (Number(res.headers.get("content-length")) > MAX_FILE) throw new Error(`Send a file of ${MAX_FILE / 1e9} GB or less.`);
  const given = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(res.headers.get("content-disposition") ?? "")?.[1];
  const type = res.headers.get("content-type")?.split(";")[0] ?? "";
  let file = name || decodeURIComponent(given ?? "") || decodeURIComponent(basename(new URL(res.url).pathname)) || "file";
  if (!extname(file)) file += { "video/quicktime": ".mov", "video/mp4": ".mp4", "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" }[type] ?? "";
  return keepFile(file, (path) => Bun.write(path, res));
}

// The device of a request: the id of a phone, which the relay sets, "mac" for the app window, or "" for another program
// on this Mac, such as an agent. A GET from the window can come with no Origin, so /show takes "mac" for it.
const deviceOf = (req: Request) => req.headers.get("x-yonder-device") ?? (req.headers.get("origin") ? "mac" : "");
// The device of the last message that the user sent from Yonder. preview with open and a local url opens a site there.
let lastDevice = "mac";
// The device of the last message of each person, when two people or more share this computer (docs/multi-user.md).
const lastDevices = new Map<string, string>();
// The device of the last message of a person, or of anyone when one person uses this computer.
const lastDeviceOf = (person?: People.Person) => (person && People.shared(people()) && lastDevices.get(person.id)) || lastDevice;
// The sites that the Claude call opens on a device with preview (the old show_on_device), until their device
// takes them with /show. A site that no device takes in a minute goes, so that a phone that opens Yonder much later does
// not open an old site.
// `attach` (send_file) asks a phone to open the attach sheet in the chat of that agent, or of a new agent (""). Any
// phone takes it, one time, in 10 minutes, so that the user can open Yonder from the push.
// A site has its name (`title`), and `frame` false when the viewer of the Mac cannot show it.
type ToShow = { id: number; device: string; url?: string; title?: string; frame?: false; attach?: string };
const SHOW_TIME = 60_000;
const fresh = (s: ToShow) => Date.now() - s.id < (s.attach === undefined ? SHOW_TIME : 600_000);
let toShow: ToShow[] = [];
// The ids of /show only go up, so the `after` of a device skips each site and each ask that it took.
let showId = 0;
const nextShowId = () => (showId = Math.max(Date.now(), showId + 1));

// The abilities of the phone (docs/shell.md): the bridge asks a phone for one, such as its location (get_location) or
// its share sheet (the `phone` tool), by an id in /show. The phone takes each ask with its /show poll and answers with
// POST /answer?id=. The asks live only in memory, and the bridge keeps no answer: phone.log has who asked for what and
// the outcome, with no data. Each ability of the phone works the same way as get_location, so that the store app never
// limits what the agents can do.
const phoneAsks = new Map<number, { device: string; ability: string; args: Record<string, unknown>; done: (answer: Record<string, unknown>) => void }>();
// The phones that can answer: the time of their last /show poll, and the abilities that they name in it. A screen from
// before the abilities polls with `locate`, which is the location only. An app from before get_location is not here.
const polled = new Map<string, { at: number; abilities: Set<string> }>();
// The screen of each device, from its /show poll (`screen`): the size of the window in CSS px, the pixel ratio, the safe
// areas (top, right, bottom, left), the size of the frame of the viewer of an app, and the look. The agents get it in
// show_app and build_app, so that they make a page for that exact space.
type ScreenSize = { width: number; height: number; ratio: number; safe: number[]; frame: number[]; dark: boolean; at: number };
// The sizes stay in displays.json (not the screens of ui/), so the agents know the phone also after a restart of the bridge, before it polls.
const SCREEN_FILE = join(CONFIG, "displays.json");
const screens = new Map<string, ScreenSize>(existsSync(SCREEN_FILE) ? Object.entries(JSON.parse(readFileSync(SCREEN_FILE, "utf8"))) : []);
const keepScreen = (device: string, s: Omit<ScreenSize, "at">) => {
  const was = screens.get(device);
  screens.set(device, { ...s, at: Date.now() });
  if (!was || JSON.stringify({ ...was, at: 0 }) !== JSON.stringify({ ...s, at: 0 })) writeFileSync(SCREEN_FILE, JSON.stringify(Object.fromEntries(screens)));
};
function parseScreen(text: string): Omit<ScreenSize, "at"> | undefined {
  const m = text.match(/^(\d+)x(\d+)@([\d.]+);(\d+),(\d+),(\d+),(\d+);(\d+)x(\d+);(light|dark)$/);
  if (!m) return undefined;
  const n = m.slice(1, 10).map(Number);
  return { width: n[0], height: n[1], ratio: n[2], safe: n.slice(3, 7), frame: n.slice(7, 9), dark: m[10] === "dark" };
}
// The start time of each process (parseElapsed in bridge/canvas.ts).
const startTimes = (pids: number[]) =>
  pids.length ? parseElapsed(Bun.spawnSync(["ps", "-o", "pid=,etime=", "-p", pids.join(",")]).stdout.toString()) : new Map<number, number>();
// The words for the agents: the screen of the phone of the call or of the last message, else the newest phone, else the
// Mac. An app is made for the phone first, so a phone wins over the window of the Mac.
function screenNote() {
  const phones = [...screens].filter(([d]) => isPhone(d)).sort((a, b) => b[1].at - a[1].at);
  const s = [Date.now() < callUntil ? callDevice : "", lastDevice].filter(isPhone).map((d) => screens.get(d)).find(Boolean) ?? phones[0]?.[1] ?? screens.get("mac");
  if (!s) return "";
  const [top, right, bottom, left] = s.safe;
  const safe = [top && `${top} px at the top`, bottom && `${bottom} px at the bottom`, left && `${left} px at the left`, right && `${right} px at the right`].filter(Boolean).join(", ");
  const phone = [...screens].some(([d, x]) => x === s && isPhone(d));
  return `The ${phone ? "phone" : "Mac window"} of the user is ${s.width}x${s.height} CSS px at ${s.ratio}x${safe ? `, with safe areas of ${safe}` : ""}, in the ${s.dark ? "dark" : "light"} look. ` +
    `An app shows in a frame of ${s.frame[0]}x${s.frame[1]} CSS px, under the Save and Close buttons, so the page needs no safe area of its own. Make the page fit that frame: it scrolls only when it must.`;
}
const isPhone = (device: string) => !!device && device !== "mac";
const phoneName = (device: string) => relay?.status().phones.find((p) => deviceId(p.pub) === device)?.name ?? "the phone";
const audit = (who: string, device: string, ability: string, outcome: string) =>
  appendFileSync(join(CONFIG, "phone.log"), `${new Date().toISOString()} ${who} asked ${phoneName(device)} for ${ability}: ${outcome}\n`);
// The pin of a phone with its place name and address from OpenStreetMap (Nominatim), when it answers in 3 seconds.
// shortcut: Nominatim gets the pin, with no key. Its policy allows one request each second, plenty for asks by voice.
// CLGeocoder in a Swift helper of the Mac app keeps the pin with Apple, if that matters.
async function placed(pin: Record<string, unknown>) {
  const latitude = Number(pin.latitude), longitude = Number(pin.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("The phone sent no location.");
  const place = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${latitude}&lon=${longitude}`, {
    headers: { "user-agent": "Yonder (https://yonder.so)" },
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => r.json())
    .then((j: { name?: string; display_name?: string }) => ({ place: j.name || undefined, address: j.display_name }), () => ({}));
  const pinned = `${latitude},${longitude}`;
  return { latitude, longitude, accuracy_meters: pin.accuracy_meters, at: pin.at, ...place, map: `https://maps.apple.com/?ll=${pinned}&q=${pinned}` };
}
// With Yonder closed on each phone, the ask sends a push and waits this long for a phone to open Yonder. A call of the
// connector ends after 60 seconds at the relay, so this wait and the answer of the phone (30 seconds) stay under it.
const OPEN_WAIT = 25_000;
// Asks the open phone of the live call, else of the last message, else the phone that polled last, for one ability.
// `from` is the device of the MCP request, and `brain` the Claude call, for phone.log. `wait`: an ability that shows a
// screen, such as the share sheet, waits for the user, so it gets more time.
// iOS gives the location only to an app on the screen (When In Use), so a closed app cannot answer by itself. So a
// push asks the user to open Yonder, and the same call gets the answer. A notice needs no app: it goes as the push.
// `person`: the person of the request. When two people or more share this computer, only the phones of that person can
// answer, and only they get the push (docs/multi-user.md).
async function useAbility(ability: string, args: Record<string, unknown>, from: string, brain: string, wait = 30_000, person?: People.Person) {
  // A phone polls each 3 seconds while Yonder is open, so 15 seconds with no poll means that it cannot answer.
  const open = (d: string) => Date.now() - (polled.get(d)?.at ?? 0) <= 15_000;
  const mine = person && People.shared(people()) ? People.devicesOf(people(), person, pairedPhones().map((d) => d.id)) : undefined;
  const ours = (d: string) => !mine || mine.includes(d);
  const newest = () => [...polled].filter(([d]) => ours(d)).sort((a, b) => b[1].at - a[1].at)[0]?.[0] ?? "";
  const last = mine ? lastDevices.get(person!.id) ?? "" : lastDevice;
  let device = [Date.now() < callUntil ? callDevice : "", last].find((d) => isPhone(d) && ours(d) && open(d)) ?? newest();
  const who = brain ? "the Claude call" : from === "mac" ? "the voice agent on the Mac" : "an agent on this Mac";
  try {
    if (!open(device) && ability === "notify" && (await relay?.push(String(args.title ?? "Yonder"), String(args.body ?? ""), mine))) {
      audit(who, device, ability, "given as a push");
      return { ok: true, push: true };
    }
    let told = 0;
    if (!open(device)) {
      told = (await relay?.push("Yonder", ability === "location" ? "Tap to send your location." : "Tap to open Yonder. An agent needs the phone.", mine)) ?? 0;
      for (const end = Date.now() + OPEN_WAIT; told && Date.now() < end && !open(newest()); ) await Bun.sleep(300);
      device = newest();
    }
    const seen = polled.get(device);
    if (!seen || !open(device))
      throw new Error(
        told
          ? `Yonder did not open on ${phoneName(device)} in ${OPEN_WAIT / 1000} seconds. A push asks the user to open it. Try again when Yonder is open.`
          : `${device ? `Yonder is not open on ${phoneName(device)}` : "No phone has Yonder open"}. Ask the user to open Yonder on the phone, then try again.`,
      );
    if (!seen.abilities.has(ability))
      throw new Error(`The Yonder app on ${phoneName(device)} cannot do "${ability}" yet. It can do: ${[...seen.abilities].join(", ")}. A newer phone app adds more.`);
    const id = nextShowId();
    const answer = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        phoneAsks.delete(id);
        reject(new Error(`${phoneName(device)} gave no answer in ${wait / 1000} seconds. Ask the user to unlock the phone with Yonder open, then try again.`));
      }, wait);
      phoneAsks.set(id, { device, ability, args, done: (a) => (clearTimeout(timer), phoneAsks.delete(id), resolve(a)) });
    });
    if (answer.error) throw new Error(String(answer.error));
    audit(who, device, ability, told ? "given after a push" : "given");
    return answer;
  } catch (e) {
    audit(who, device, ability, `failed: ${(e as Error).message}`);
    throw e;
  }
}
// get_location: the pin of the phone, with its place name.
const locatePhone = async (from: string, brain: string, person?: People.Person) => placed(await useAbility("location", {}, from, brain, undefined, person));
// The abilities of the `phone` tool, with their args, for its description. The page does them (src/abilities.ts), and
// each phone names the ones that its app has. A new ability needs a line here and one there, and a native one also a
// new phone app.
const ABILITIES: Record<string, string> = {
  haptic: '{ style: "light" | "medium" | "heavy" | "soft" | "rigid" | "success" | "warning" | "error" | "selection" } a tap that the user feels',
  notify: "{ title, body } a notice on the phone, also when Yonder is in the background",
  open: "{ url } opens a link, an app or a Shortcut (shortcuts://run-shortcut?name=...) on the phone",
  face_id: "{ reason, passcode } asks the user for Face ID (passcode: true allows the passcode of the phone); gives { ok }",
  share: "{ text?, url? } opens the share sheet of the phone with them; gives the app that the user chose",
  copy: "{ text } puts text on the clipboard of the phone",
  paste: "gives the text on the clipboard of the phone; iOS asks the user first",
  photo: "opens the camera; the user takes a photo, and it comes back as { path } on this Mac",
  save_photo: "{ url } saves a picture or a video from a link of this Mac to the Photos of the phone",
  contact: "opens the contact picker; gives the name, the phones and the emails of the contact that the user picks",
  event: "{ title, start, end?, location?, notes?, url? } opens the event editor of the calendar, filled in; start and end as ISO dates",
  device: "the battery level and charge, Low Power Mode, the heat, and the network of the phone",
  badge: "{ count } the number on the icon of the Yonder app; 0 removes it",
  awake: "{ on } keeps the screen of the phone on, or lets it sleep again",
};

// The week meter of a usage list. Claude Code names it "Week, all models". Grok names it "Week".
const weekPercent = (limits?: { name: string; percent: number }[]) => {
  const week = limits?.find((l) => l.name === "Week" || l.name.startsWith("Week,"));
  return typeof week?.percent === "number" ? Math.round(week.percent) : undefined;
};
// The session meter (5 hours) of a usage list. Only Claude Code has it.
const sessionPercent = (limits?: { name: string; percent: number }[]) => {
  const session = limits?.find((l) => l.name === "Current session");
  return typeof session?.percent === "number" ? Math.round(session.percent) : undefined;
};
// The percent of the week and of the session that a CLI or a Claude profile has used. A failure leaves them out.
// A CLI puts its meters on its usage list. An own Claude profile reads the login in its folder.
async function usageFor(cli: string, fresh: boolean, dir?: string): Promise<{ week?: number; session?: number }> {
  let used: { week?: number; session?: number } = {};
  try {
    const limits = cli === "claude" ? (await claudeUsage(fresh, dir)).limits as { name: string; percent: number }[] | undefined : (await cliState(cli)).usage;
    used = { week: weekPercent(limits), session: sessionPercent(limits) };
  } catch {}
  // A folder that Claude Code refused for its limit is full until the reset, also when the meter lags (limitHit).
  const hit = cli === "claude" ? limitHits.get(dir ?? claudeDir()) : undefined;
  if (hit && hit.until > Date.now()) used[hit.meter] = 100;
  return used;
}
// The CLIs of the Agents tab: Claude Code, then the others with their state on this Mac. The other rows of Claude Code
// have their own routes (/model, /mode, /claude-mcp).
let claudeVersion = "";
void run([CLAUDE, "--version"], 10_000, env).then((v) => (claudeVersion = v.out.match(/\d+\.\d+\.\d+/)?.[0] ?? ""), () => {});
async function clisInfo(fresh = false) {
  const others = await Promise.all(
    Object.entries(CLIS).map(async ([id, cli]) => {
      const f = await cliState(id, fresh);
      const own = state.clis[id] ?? {};
      return {
        id, name: cli.name, path: f.path, version: f.version, account: f.account, error: f.error, on: cliOn(id),
        install: cli.install, login: [basename(f.path ?? cli.bins[0]), ...cli.login].join(" "), signIn: !!cli.signIn,
        models: f.models ?? [], efforts: Object.keys(cli.efforts ?? {}),
        modes: Object.entries(cli.modes).map(([mode, m]) => ({ mode, name: m!.name })),
        model: own.model ?? "", effort: own.effort ?? "", mode: modeOf(id), autoUpdate: own.autoUpdate !== false,
        mcp: cli.mcp && f.path ? f.mcp : undefined, mcpRun: cli.mcpRun, usage: f.usage,
        week: weekPercent(f.usage) ?? (id === "claude" ? undefined : (await usageFor(id, fresh)).week), session: sessionPercent(f.usage),
      };
    }),
  );
  if (fresh) await loggedIn();
  // The usage of the folder of the user only while it is the login of Yonder: with an own default profile it is the login of
  // the terminal, and each read of the same account brings a 429 nearer (ownDefault).
  const claudeUsed = ownDefault() ? {} : await usageFor("claude", fresh);
  const claude = {
    id: "claude", name: "Claude Code", path: existsSync(CLAUDE) ? CLAUDE : undefined, version: claudeVersion, install: CLAUDE_INSTALL.at(-1), account: claudeLoggedIn ? "Claude plan" : undefined,
    on: true, models: [], efforts: [], modes: [], model: "", effort: "", mode: state.mode, ...claudeUsed,
    autoUpdate: state.clis.claude?.autoUpdate !== false,
  };
  // Each profile is an entry too, with the menus of its CLI (`base`), so the New agent view and the CLI row offer it.
  // `week` and `session` are the percents of the weekly and the session allowance that this profile has used.
  const profiles = await Promise.all(
    state.profiles.map(async (p) => {
      const base = p.cli === "claude" ? claude : others.find((o) => o.id === p.cli);
      const own = p.own && p.cli === "claude";
      return {
        ...base, id: p.id, name: p.name, base: p.cli, on: !!base,
        account: own ? (fresh || !(p.id in accounts) ? await accountOf(p) : accounts[p.id]) || undefined : base?.account,
        usage: undefined, mcp: undefined,
        ...(own ? await usageFor("claude", fresh, claudeDir(p)) : { week: base?.week, session: base?.session }),
        profile: { own: !!p.own, ownMcp: !!p.ownMcp, folder: own ? claudeDir(p) : undefined, program: p.program ?? "", flags: p.flags ?? "", env: p.env ?? {} },
      };
    }),
  );
  const fine = state.cli === "claude" || cliOn(state.cli) || !!profileOf(state.cli);
  return { cli: fine ? state.cli : "claude", clis: [claude, ...others, ...profiles] };
}

// Ghostty is in /Applications or ~/Applications. Else a terminal opens in Terminal, and the app shows a terminal icon.
const hasGhostty = () => MAC && ["/Applications", join(HOME, "Applications")].some((d) => existsSync(join(d, "Ghostty.app")));

// Opens a command in a terminal, so that the user sees it. On the Mac: a new tab in the front window of the running
// Ghostty, through its AppleScript, and a new window only when Ghostty has no window. The tab keeps `title`, also when
// the command sets the terminal title. `open -na` started a second Ghostty, which restored its old windows in front of
// the new one. That stays the fallback when macOS does not let the bridge control Ghostty. On Linux: the terminal that
// the user picked (xdg-terminal-exec, which Omarchy has), started by uwsm as Omarchy starts its apps. On another Linux
// desktop: the first terminal of a short list, in the folder, with its flag that runs a command. On Windows: Windows
// Terminal, or a console window when it is not there.
async function inTerminal(cwd: string, argv: string[], title: string) {
  if (WINDOWS) {
    // `start` takes the first quoted word as the title, so its command line is written here, not quoted by Bun.
    const wt = Bun.which("wt");
    const q = (a: string) => (/[\s"]/.test(a) ? `"${a}"` : a);
    if (wt) Bun.spawn([wt, "-d", cwd, "--title", title, ...argv], { env, stdio: ["ignore", "ignore", "ignore"] });
    else Bun.spawn(["cmd", `/c start "${title}" /d "${cwd}" ${argv.map(q).join(" ")}`], { env, stdio: ["ignore", "ignore", "ignore"], windowsVerbatimArguments: true });
    return;
  }
  if (LINUX) {
    // shortcut: nobody has tried these flags on each desktop. Add a terminal to the list when a user names one.
    const known: [string, string[]][] = [["gnome-terminal", ["--"]], ["ptyxis", ["--"]], ["kgx", ["--"]], ["konsole", ["-e"]],
      ["xfce4-terminal", ["-x"]], ["kitty", []], ["alacritty", ["-e"]], ["ghostty", ["-e"]], ["x-terminal-emulator", ["-e"]]];
    const other = Bun.which("xdg-terminal-exec") ? undefined : known.find(([name]) => Bun.which(name));
    const terminal = other ? [other[0], ...other[1], ...argv] : ["xdg-terminal-exec", `--dir=${cwd}`, ...argv];
    Bun.spawn(Bun.which("uwsm-app") ? ["uwsm-app", "--", ...terminal] : terminal, { cwd, env, stdio: ["ignore", "ignore", "ignore"] });
    return;
  }
  if (!hasGhostty()) {
    // Without Ghostty: a new window of Terminal, the terminal of macOS.
    const q = (a: string) => `'${a.replaceAll("'", `'\\''`)}'`;
    const script = ["on run argv", 'tell application "Terminal"', "activate", "do script (item 1 of argv)", "end tell", "end run"];
    Bun.spawn(["osascript", ...script.flatMap((l) => ["-e", l]), `cd ${q(cwd)} && ${argv.map(q).join(" ")}`], { env });
    return;
  }
  const script = ["on run argv", 'tell application "Ghostty"', "activate",
    "set cfg to {initial working directory:item 1 of argv, command:item 2 of argv}",
    "if (count of windows) is 0 then", "set t to selected tab of (new window with configuration cfg)",
    "else", "set t to new tab in front window with configuration cfg", "end if",
    'perform action ("set_tab_title:" & item 3 of argv) on focused terminal of t', "end tell", "end run"];
  const osa = Bun.spawn(["osascript", ...script.flatMap((l) => ["-e", l]), cwd, argv.join(" "), title], { env, stderr: "pipe" });
  if (await osa.exited) Bun.spawn(["open", "-na", "Ghostty.app", "--args", "--window-save-state=never", `--working-directory=${cwd}`, "-e", ...argv], { env });
}

// The last close, complete or remove, with each agent as it was before, so that `undo` can take it back.
// A shake of the phone undoes it. It is outside `server`, because each request gets a new server: else each undo says
// "There is nothing to undo."
let last: { tool: string; to: Status | ""; before: { w: Worker; was: Worker }[] } | undefined;
// The MCP annotations of the tools (server() below). With no annotations, MCP takes each tool as one that deletes. Else
// the Claude app gives "approval timed out after 30s; not executed" for build_app and message_worker, most
// likely from its own ask before such a tool (docs/wiki/preview.md, "Yonder in the Claude app"). So each tool says what it does.
const READ_ONLY = new Set(["list_workspaces", "list_folders", "list_workers", "review_workers", "get_worker", "read_file", "list_secrets", "about_yonder",
  "workspace_overview", "get_usage", "get_location"]);
const DESTRUCTIVE = new Set(["remove_workspace", "close_worker", "remove_worker", "remove_app", "use_secret"]);
// `brain`: the call of a Claude brain (bridge/brain.ts), which gets end_call too. `caller`: the worker whose session
// calls, from the address in its --mcp-config.
// `signal`: the MCP request ends, such as when the agent stops, so ask_user stops waiting.
function server(device = "", brain = "", caller = "", signal = new AbortController().signal) {
  const mcp = new McpServer({ name: "yonder", version: "0.1.0" });
  // The person of this request (docs/multi-user.md). No people in config.json: undefined, and nothing changes.
  const me = personFor(device, caller, brain);
  // Each description has the word of the user for an agent, such as "bot" (agentName in config.json), as the screen
  // does: the description of the tool and of each input. The tool names and the input names stay. Each request gets a
  // new server, so a client gets a new word when it lists the tools again, such as at the start of a call.
  const register = mcp.registerTool.bind(mcp);
  // Each tool also gets its MCP annotations: a client, such as the Claude app, can ask the user before a tool that
  // changes something, and before a tool that deletes or releases. A tool with no annotations is a delete for MCP.
  mcp.registerTool = ((name: string, def: { description?: string; inputSchema?: Record<string, z.ZodType> }, cb: unknown) =>
    register(name, {
      ...def,
      description: def.description && say(def.description),
      ...(def.inputSchema && {
        // `worker.optional()` has the description inside.
        inputSchema: Object.fromEntries(Object.entries(def.inputSchema).map(([k, v]) => {
          const text = v.description ?? (v as { unwrap?: () => z.ZodType }).unwrap?.().description;
          return [k, text ? v.describe(say(text)) : v];
        })),
      }),
      annotations: READ_ONLY.has(name) ? { readOnlyHint: true } : { readOnlyHint: false, destructiveHint: DESTRUCTIVE.has(name) },
    } as never, cb as never)) as typeof mcp.registerTool;
  const worker = z.string().describe("The agent number, the worker id, or a workspace name for the newest worker in that workspace");
  // Reads and messages also take a sub-agent of an agent.
  const workerOrSub = z.string().describe("The agent number, a sub-agent (\"21B\": the second sub-agent of agent 21), the worker id, or a workspace name for the newest worker in that workspace");
  // The Yonder app fills this in with the last words of the voice call, and Grok never sees it.
  const context = z.string().optional().describe("The last words of the voice call. The Yonder app fills this in.");
  // The app fills this in with the images, the files and the videos that the user attached in the window.
  // `renamed` still takes its old name, `images`.
  const files = z.array(z.string()).optional().describe(
    "Paths on this computer of the files for the agent: photos, videos, documents and pasted text. " +
      "The Yonder app fills this in with what the user attached. Another client gives the paths that send_file returned.",
  );
  const call = z.string().regex(/^\d+$/).optional().describe("The ID of the voice call. The Yonder app fills this in.");
  const key = z.string().max(64).optional().describe("The key of the call, so that a call that the app sends again runs one time. The Yonder app fills this in.");
  // The bridge closes the worker when the turn ends, unless something came up (closeItself).
  const closeWhenDone = z.boolean().optional().describe(
    'True: Yonder closes the worker when this work is done, so you need not come back to close it. Set it when the user gives the work and then says to close, ' +
      'such as "deploy it and close it", "then close", "do that and you\'re done" or "close it when it is done". Then do NOT call close_worker. ' +
      "It closes only when nothing came up. When the worker fails, asks a question, waits for an approval or leaves a decision to the user, it stays open, " +
      "and the phone gets a push with the reason. It then is a normal worker again.",
  );
  // A group of agents is one tab of the app, so the bridge selects them, not Grok. The values are in backticks, so that
  // the word of the user for an agent (`say`) does not change `agents`.
  const tab = z.enum(TABS).optional()
    .describe("A group instead of one worker: `agents` (running), `completed` (the Done tab: waiting, done or failed), `saved` (the agents saved for later, also when they run) or `closed`");
  const groupProject = z.string().optional().describe("With tab: the workspace of the group. Leave it out for the group in all the workspaces.");
  const ULTRATHINK = 'When the user says "ultrathink", keep that word: it asks Claude Code for deeper reasoning.';
  const withContext = (text: string, context?: string, images: string[] = []) => {
    // Claude Code reasons deeper on a turn only for the one word "ultrathink", and speech to text can write "ultra think".
    text = text.replace(/\bultra[\s-]+think\b/gi, "ultrathink");
    context = context?.replace(/\bultra[\s-]+think\b/gi, "ultrathink");
    // The blocks would become the arguments of a slash command.
    if (text.startsWith("/")) return text;
    const videos = images.filter((p) => p.startsWith(`${VIDEOS}${sep}`));
    const texts = images.filter((p) => p.startsWith(`${PASTES}${sep}`));
    // A picture that the user pasted. Each other path, such as a PDF or a file of send_file, is a file.
    const others = images.filter((p) => ![videos, texts].some((list) => list.includes(p)));
    const pictures = others.filter((p) => !p.startsWith(`${FILES}${sep}`) && /\.(png|jpe?g|gif|webp)$/i.test(p));
    const files = others.filter((p) => !pictures.includes(p));
    // A block that only repeats the words of the request adds tokens and nothing else.
    const plain = (s: string) => s.toLowerCase().replace(/\W+/g, " ").trim();
    const repeats = context?.split("\n").every((l) => l.startsWith("User: ") && plain(text).includes(plain(l.slice(6))));
    if (device) lastDevice = device;
    if (device && me) lastDevices.set(me.id, device);
    return [
      text,
      context && !repeats && `<voice-call>\nThe user said this by voice. The last words of the call, for context:\n${context}\n</voice-call>`,
      pictures.length && `<images>\nThe user attached these images to this message. Read each one before you start:\n${pictures.join("\n")}\n</images>`,
      texts.length && `<pasted-text>\nThe user pasted text for this message. Read each file before you start:\n${texts.join("\n")}\n</pasted-text>`,
      files.length && `<files>\nThe user attached these files to this message. Read each one before you start:\n${files.join("\n")}\n</files>`,
      videos.length &&
        `<videos>\nThe user attached these videos. Before you start, read timeline.md in each folder below, then the frames that it names:\n${videos.map((v) => (existsSync(v) ? originOf(v) : v)).join("\n")}\n</videos>`,
      // Who sends it, when two people or more share this computer (docs/multi-user.md).
      me && People.shared(people()) && People.fromTag(me),
    ]
      .filter(Boolean)
      .join("\n\n");
  };
  const effort = z.enum(EFFORTS).optional().describe(
    "How hard the worker thinks. Leave it out, and Clef picks it from the task: low for a question, high for normal work, xhigh or max for a very complex task. " +
      "Set it only when the user asks for an effort.",
  );
  const mode = z.enum(MODES).optional().describe(
    "The permission mode of the worker: bypassPermissions (it never asks), auto (a classifier approves the safe actions), " +
      "acceptEdits (it edits files, but each command waits for the user), or plan (it only makes a plan; a reply to the plan approves it). " +
      "Another CLI has bypassPermissions and some of the others; its error lists them. " +
      "Leave it out, and the Permissions row of the Settings applies. Set it only when the user asks for a mode, such as \"plan mode\" or \"auto mode\".",
  );
  // modelFor checks the model for the CLI of the agent.
  const model = z
    .string()
    .optional()
    .describe(
      `The model of the worker. For Claude Code: an alias for the latest model, "fable", "opus", "sonnet" or "haiku", or a full name such as "claude-fable-5-2". ` +
        `For another CLI: a model of that CLI, such as "gpt-5.5" for Codex. ` +
        `Leave it out, and Clef picks the model from the task, inside the Model range of the Settings. Set it only when the user asks for a model. ` +
        `An image, video or sound model, such as GPT Image, Nano Banana, Kling or ElevenLabs, goes in the task, never here.`,
    );
  // The CLIs that are on, for Grok. The description is made when a client connects, such as at the start of a call.
  const ons = ["claude", ...Object.keys(CLIS)].filter(cliOn);
  const cli = z
    .string()
    .optional()
    .describe(
      `The CLI that runs the agent: ${ons.map((id) => `"${id}" (${cliName(id)})`).join(", ")}` +
        `${state.profiles.length ? `, or a profile of the user: ${state.profiles.map((p) => `"${p.name}" (${cliName(p.cli)})`).join(", ")}` : ""}. ` +
        `Set it only when the user names a CLI or a profile, such as "use Codex", "ask Grok" or "use my work profile". "Gemini" means "antigravity". ` +
        `Leave it out for the default: the profile of the workspace (\`profile\` in list_workspaces), else the profile of the Settings, ${profileOf(state.cli)?.name ?? cliName(state.cli)}. ` +
        `A profile that the user names wins over both.`,
    );

  mcp.registerTool(
    "other_computer",
    {
      description:
        "Act on another computer of the user, such as a second Mac or a PC that is paired with the same phone. This computer reaches it through the relay, also while the Yonder app on the phone is closed. " +
        'Use it only when the user names another computer, such as "on the Mac mini". Leave computer out to list the other computers. ' +
        "With tool and arguments, it runs any tool of Yonder there, with the same arguments as on this computer, such as rename_worker, close_worker, star_worker, read_file or open_link. " +
        "An agent runs on that computer, in a workspace of that computer, and its numbers are of that computer. " +
        "The rules of each tool are the same as on this computer: ask the user first where you ask first here. The other computer must be on and awake.",
      inputSchema: {
        computer: z.string().optional().describe('The name of the other computer, such as "Mac mini". Leave it out to list them.'),
        // Any tool: the other bridge checks the name and the arguments, and knows the old names of RENAMED. So the
        // voice agent can rename or close an agent on another computer.
        tool: z.string().optional().describe("The name of the tool to call there, such as close_worker. list_workers if left out. rebuild_app updates Yonder there to its newest version. cli checks, installs and signs in to its CLIs, such as Claude Code."),
        arguments: z.record(z.string(), z.unknown()).optional().describe("The arguments of that tool, as on this Mac."),
      },
    },
    async ({ computer, tool, arguments: args }) => {
      const peers = relay?.peers() ?? [];
      if (!peers.length && !phoneNear())
        return { content: [{ type: "text", text: "This computer knows no other computer yet. The Yonder app on the phone tells each computer about the others when it opens. Ask the user to open the app." }], isError: true };
      if (!computer) return reply(() => ({ computers: [...new Set([...peers.map((p) => p.name), ...nearPhones().flatMap((p) => p.computers)])] }));
      if (tool === "other_computer") return { content: [{ type: "text", text: "Call other_computer on this computer, with the name of the other computer." }], isError: true };
      const peer = pickPeer(peers, computer);
      // An older bridge knows `project`, not `workspace`, and drops a key that it does not know. So the
      // call carries both, and a newer bridge keeps `workspace` (renamed). A tool that the other bridge does not know,
      // such as list_workspaces, goes again with its old name.
      const sent = args && "workspace" in args && !("project" in args) ? { ...args, project: args.workspace } : (args ?? {});
      const ask = (name: string) => askPeer(peer as Exclude<typeof peer, string>, name, sent);
      let r: { text: string; error?: boolean; offline?: boolean } | undefined = typeof peer === "string" ? undefined : await ask(tool ?? "list_workers");
      const before = tool && r?.error && /not found|unknown tool/i.test(r.text) ? OLD_NAMES[tool] : undefined;
      if (before) r = await ask(before);
      // The phone carries a call that no peer took, such as one to a computer with an older bridge.
      if ((!r || r.offline) && phoneNear()) r = await askPhone(computer, before ?? tool ?? "list_workers", sent);
      r ??= { text: peer as string, error: true };
      return { content: [{ type: "text", text: r.text }], ...(r.error && { isError: true }) };
    },
  );
  // The workspaces (config.json `workspaces`, docs/wiki/workspaces.md). Each tool takes a workspace by its name, its id,
  // its key ("workspace:<id>") or its folder (findProject). The old project tools are old names in RENAMED.
  const workspaceOut = (p: Project) => {
    const agents = agentsIn(p.path);
    const about = p.description ?? (p.home !== false ? aboutOf(p.path, false) : undefined);
    const prof = p.profile ? profileOf(p.profile) ?? findProfile(p.profile) : undefined;
    return {
      id: p.id,
      name: p.name,
      path: keyOf(p),
      ...(p.home !== false && { folder: p.path }),
      starred: p.starred,
      ...(p.pinned && { pinned: true }),
      ...(about && { about }),
      ...(p.description && { description: p.description }),
      ...(agents.length && { agents }),
      ...(prof && { profile: prof.name }),
      ...(p.profile && !prof && { profileMissing: p.profile }),
    };
  };
  // A folder that is no workspace becomes one when the user acts on it, as a star or a profile of a project did.
  const asWorkspace = (p: Project) => (p.id ? p : addWorkspace({ name: p.name, folder: p.path }));
  const CONFIG_NOTE = `The workspaces live in \`workspaces\` of ${toTilde(CONFIG_FILE)}, so an agent can also edit that file: docs/wiki/workspaces.md has the format.`;
  mcp.registerTool(
    "list_workspaces",
    {
      description:
        "List the workspaces: the groups of agents, such as \"Music\" or \"sundial\", in the order of the screen. Starred workspaces come first. " +
        "`path` is the key of a workspace for the other tools. `folder` is its home folder, where its Claude Code agents start; a workspace with no folder has a description instead. " +
        "about is one line on what the workspace is. When a workspace has no about, or its about is wrong or out of date, and you learn what it is, save a better one with edit_workspace. Call workspace_overview for more. " +
        "`agents` gives the Claude Code subagent types of the workspace (from .claude/agents), for the `agent` input of start_worker. " +
        "`profile` is the default profile of the workspace, which each new agent there uses (set_workspace_profile). A workspace with no `profile` uses the default profile of the Settings. " +
        `\`errors\` lists the entries of the file that Yonder left out, and why. ${CONFIG_NOTE}`,
      inputSchema: {
        query: z.string().optional().describe("Part of a workspace name. Leave it out to list all workspaces."),
        plain: z.boolean().optional().describe("True for the bare list, with no errors."),
      },
    },
    ({ query, plain }) =>
      reply(() => {
        const list = projects().filter((p) => !query || norm(p.name).includes(norm(query)) || norm(p.id ?? "").includes(norm(query))).map(workspaceOut);
        return !plain && workspaceErrors.length ? { workspaces: list, errors: workspaceErrors } : list;
      }),
  );
  mcp.registerTool(
    "set_workspace_profile",
    {
      description:
        "Set the default profile of a workspace, such as \"use my work account for Sundial\". Each new agent in the workspace then starts on it, unless the request names another profile. " +
        "The agents that run keep their profile: to move one, give profile to message_worker. list_workspaces shows the profile of each workspace.",
      inputSchema: {
        workspace: z.string().describe("The workspace name, id or folder"),
        profile: z.string().describe(`The profile name, such as "work". "default" removes the profile of the workspace, so the default profile of the Settings applies. The profiles: ${state.profiles.map((p) => `"${p.name}"`).join(", ") || "none"}.`),
      },
    },
    ({ workspace, profile }) =>
      reply(() => {
        const clear = !profile.trim() || norm(profile) === "default";
        const prof = clear ? undefined : findProfile(profile);
        if (!clear && !prof) throw new Error(`There is no profile "${profile}". The profiles: ${state.profiles.map((x) => x.name).join(", ") || "none"}.`);
        const p = asWorkspace(findProject(workspace));
        editWorkspace(p, ({ profile: _, ...e }) => (prof ? { ...e, profile: prof.id } : e));
        return { name: p.name, path: keyOf(p), profile: prof?.name ?? `${profileOf(state.cli)?.name ?? cliName(state.cli)} (the default of the Settings)` };
      }),
  );
  mcp.registerTool(
    "add_workspace",
    {
      description:
        "Add a workspace: a named group of agents. Give folder to add a folder from anywhere on this Mac as a workspace: its Claude Code agents start there. " +
        `Give newFolder true to make an empty folder with a git repository in ${ROOTS[0].replace(HOME, "~")} ("create a new project"), then call start_worker in it with what the user wants to make. ` +
        "Give only name and description for a workspace with no folder, such as \"Music\": its agents work across the computer. " +
        `A folder is the home of one workspace only, so a folder that has one gives that workspace. ${CONFIG_NOTE}`,
      inputSchema: {
        name: z.string().optional().describe("The name, such as \"Music\". Leave it out with folder for the folder name. With newFolder, \"recipe app\" becomes the folder \"recipe-app\"."),
        folder: z.string().optional().describe("The home folder: an absolute path, or a path that starts with ~"),
        description: z.string().optional().describe("What the workspace is for, in 300 characters or less. A workspace with no folder needs it."),
        newFolder: z.boolean().optional().describe("True to make a new, empty folder for the workspace"),
        // The New Project item of the File menu gives the folder that the user picked. Grok leaves it out.
        parent: z.string().optional().describe(`With newFolder: the folder to put it in. Leave it out for ${ROOTS[0].replace(HOME, "~")}.`),
      },
    },
    ({ name, folder, description, newFolder, parent }) =>
      reply(() => {
        if (newFolder) {
          const slug = (name ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "");
          if (!slug) throw new Error(`"${name ?? ""}" is not a usable folder name.`);
          const path = join(parent ? expand(parent) : ROOTS[0], slug);
          if (existsSync(path)) throw new Error(`The folder ${slug} is there already, at ${path}. Add it as a workspace with folder, or ask the user for another name.`);
          mkdirSync(path, { recursive: true });
          Bun.spawnSync(["git", "init", "-q"], { cwd: path });
          return workspaceOut(addWorkspace({ name: slug, folder: path, description }));
        }
        if (folder?.trim()) {
          const full = expand(folder.trim());
          if (!isDir(full)) throw new Error(`There is no folder at ${full}.`);
          return workspaceOut(addWorkspace({ name: name?.trim() || basename(full), folder: full, description }));
        }
        return workspaceOut(addWorkspace({ name: name ?? "", description }));
      }),
  );
  mcp.registerTool(
    "list_folders",
    {
      description:
        "List the folders in a folder of this Mac, to find a folder for add_workspace. " +
        "The phone uses it for its folder picker.",
      inputSchema: { path: z.string().optional().describe("An absolute path, or a path that starts with ~. Leave it out for the home folder.") },
    },
    ({ path }) =>
      reply(async () => {
        const full = expand(path || "~");
        // For Desktop, Documents, Downloads and iCloud Drive, macOS asks on the Mac the first time, and the read waits
        // for the answer. So the bridge stops the wait after 5 s, and tells the phone to look at the Mac.
        const entries = await Promise.race([
          readdir(full, { withFileTypes: true }),
          new Promise<never>((_, no) =>
            setTimeout(() => no(new Error(`macOS asks on the Mac for access to ${basename(full)}. Click Allow on the Mac, then try again.`)), 5000)),
        ]).catch((e) => {
          if (e.code === "EPERM" || e.code === "EACCES") throw new Error(`Yonder has no access to ${full}. Allow it in System Settings > Privacy & Security > Files and Folders.`);
          if (e.code === "ENOENT" || e.code === "ENOTDIR") throw new Error(`There is no folder at ${full}.`);
          throw e;
        });
        const folders = entries
          .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
          .map((d) => ({ name: d.name, path: join(full, d.name) }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
        return { name: full === "/" ? "/" : basename(full), path: full, parent: full === "/" ? undefined : dirname(full), folders };
      }),
  );
  mcp.registerTool(
    "edit_workspace",
    {
      description:
        "Change a workspace: its name, its home folder, or its description. Save one or two sentences on what a workspace is and what the user does in it, so that later calls know it. " +
        `Call it when list_workspaces shows no about or a wrong one, or when the workspace changes. ${CONFIG_NOTE}`,
      inputSchema: {
        workspace: z.string().describe("The workspace name, id or folder"),
        name: z.string().optional().describe("A new name"),
        folder: z.string().optional().describe("A new home folder: an absolute path, or a path that starts with ~. An empty text removes the folder, and the workspace then needs a description."),
        description: z.string().optional().describe("What the workspace is, in 300 characters or less. An empty text removes it."),
      },
    },
    ({ workspace, name, folder, description }) =>
      reply(() => {
        const full = folder?.trim() ? expand(folder.trim()) : undefined;
        if (full && !isDir(full)) throw new Error(`There is no folder at ${full}.`);
        const p = asWorkspace(findProject(workspace));
        editWorkspace(p, (e) => {
          const next = { ...e };
          if (name?.trim()) next.name = name.trim();
          if (description !== undefined) {
            if (description.trim()) next.description = description.trim().slice(0, 300);
            else delete next.description;
          }
          if (folder !== undefined) {
            if (full) next.folder = toTilde(full);
            else delete next.folder;
          }
          return next;
        });
        return workspaceOut(projects().find((x) => x.id === p.id)!);
      }),
  );
  mcp.registerTool(
    "remove_workspace",
    {
      description:
        "Take a workspace off the list. Its folder and its files stay on the disk, and its agents stay, in the group of their folder. " +
        "Call it only when the user asks to remove a workspace. add_workspace puts it back.",
      inputSchema: { workspace: z.string().describe("The workspace name, id or folder") },
    },
    ({ workspace }) =>
      reply(() => {
        const p = findProject(workspace);
        if (p.pinned) throw new Error("Yonder is always on the list. It cannot be removed.");
        if (p.id) {
          const raw = rawWorkspaces();
          raw.splice(raw.findIndex((e) => e?.id === p.id), 1);
          save();
        }
        return { removed: keyOf(p) };
      }),
  );
  mcp.registerTool(
    "star_workspace",
    {
      description:
        "Star or unstar a workspace, or put the starred workspaces in a new order. Starred workspaces go to the top of the list, and Yonder always stays first. " +
        'Give workspace and starred for one workspace, or order for the order ("put sundial at the top").',
      inputSchema: {
        workspace: z.string().optional().describe("The workspace name, id or folder"),
        starred: z.boolean().optional(),
        order: z.array(z.string()).optional().describe("The starred workspaces, names or keys, in the new order"),
      },
    },
    ({ workspace, starred, order }) =>
      reply(() => {
        if (order) {
          const ids = [...new Set(order.map((o) => findProject(o)).filter((p) => p.id && p.starred).map((p) => p.id))];
          const raw = rawWorkspaces();
          const first = ids.map((id) => raw.find((e) => e?.id === id));
          // A starred workspace that the list leaves out goes after the others.
          raw.splice(0, raw.length, ...first, ...raw.filter((e) => !first.includes(e)));
          save();
          return projects().filter((p) => p.starred).map(keyOf);
        }
        if (!workspace || starred === undefined) throw new Error("Give workspace and starred, or order.");
        const p = asWorkspace(findProject(workspace));
        const raw = rawWorkspaces();
        const at = raw.findIndex((e) => e?.id === p.id);
        const [{ starred: _, ...e }] = raw.splice(at, 1);
        // A new star goes after the other starred workspaces, as it did for the projects.
        if (starred) raw.push({ ...e, starred: true });
        else raw.splice(at, 0, e);
        save();
        return { path: keyOf(p), starred };
      }),
  );
  mcp.registerTool(
    "start_worker",
    {
      description:
        "Start a new agent (a worker) for a new task, job, request or question: Claude Code, or another CLI that the user names, in a workspace. It returns at once, and the agent runs in the background. " +
        "Put the full request in the task, in the words of the user. Each new request gets a new worker, also when a worker in the same workspace runs or finished, unless the user reads the conversation of a worker in the app.",
      inputSchema: {
        workspace: z.string().describe("The workspace name or id, or an absolute folder path. Empty: Yonder picks the workspace from the task, or the default folder of the user"),
        task: z.string().describe(`What the worker must do. ${ULTRATHINK}`),
        name: z
          .string()
          .describe(
            "A title of two or three words that tells what the worker does, such as \"Fix dictation key\". A complex task can have up to six words. " +
              "For a task about one pull request: \"PR <number> - <its topic in one or two words>\", such as \"PR 359 - Date picker\". " +
              "Do not use the first words of the request, such as \"think about how we\".",
          ),
        cli,
        effort,
        model,
        mode,
        agent: z
          .string()
          .optional()
          .describe(
            "A Claude Code `agent` for the worker, from the `agents` of the workspace in list_workspaces. Only Claude Code has them. " +
              "Set it only when the user names one, such as \"start the tech lead `agent`\".",
          ),
        closeWhenDone,
        context,
        files,
        call,
        key,
      },
    },
    ({ workspace: project = "", task, name, cli, effort, model, mode, agent, closeWhenDone, context, files, call, key }) =>
      replyOnce(key, async () => {
        const prompt = withContext(task, context, files);
        const w = await startWorker({ project, task, name, cli, effort, model, mode, agent, closeWhenDone, owner: me?.id }, prompt);
        logSent(call, w.num, prompt);
        return brief(w);
      }),
  );
  mcp.registerTool(
    "schedule",
    {
      description:
        "List, add, change, run or remove the schedules of the user. A schedule starts an agent with the same prompt in a workspace at set times, on this computer, " +
        "so the agent has the CLIs and the logins of this computer. A profile on the schedule runs each start with the CLI, the sign-in and the settings of that profile. " +
        "Each start is a normal agent, marked Scheduled, and the phone gets a push when it finishes or fails. " +
        'Use it when the user asks for work that repeats, such as "every morning at 9, check the sales", and for a change to a schedule, such as "pause the daily video". ' +
        "A start that the computer missed while it slept runs once when it wakes fully (not in a dark wake with the lid closed). A schedule whose last agent still runs skips the start. " +
        "A run whose session stops early, fails, or that a check judges not done continues in the same session, up to the retries of the schedule (2 by default). After the last one, the phone gets a push. " +
        "A run that a sleep cuts continues by itself at the next full wake, and that retry is free. " +
        'A trigger is a schedule that an event starts in place of a timing, and the event can be anything. Use one when the user asks to start an agent when something happens, such as "when a new error comes in to Sentry, fix it" or "when a file comes into Downloads, sort it". ' +
        "To make one, save it with name, workspace, task and event (what starts it, in the words of the user), then call design with its id. Claude Code then sets it up in an agent: " +
        "a script that Yonder runs each minute, whose each new line of output starts the agent with the line as data, for anything that a command or an API can see, such as Sentry or GitHub. " +
        "Only when nothing can be polled, it makes a webhook: each web request to the hookUrl of the trigger starts the agent, with the body as data, and the user pastes the hookUrl into the service. " +
        "A trigger that an agent saves stays off until the user turns it on (paused false), in the app or by voice, so the user can check the script first. " +
        "A trigger runs in Auto mode, never in Bypass, because anyone can write the text of an event.",
      inputSchema: {
        action: z.enum(["list", "save", "run", "design", "remove"]).describe(
          "list: the schedules, with the next start and the agents of the past starts. save: add a schedule (no id), or change one (id: only the given fields change). run: start it now. " +
            "design: start an agent that sets up a trigger from its event: it writes the script, or makes the webhook. remove: delete it.",
        ),
        id: z.string().optional().describe("The schedule to change, run or remove: its id or its name. Leave it out to add a schedule."),
        name: z.string().optional().describe('A title of two to six words, such as "Sundial daily video". Each agent of the schedule gets it.'),
        workspace: z.string().optional().describe("The workspace name or id, or an absolute folder path. A new schedule needs it."),
        task: z.string().optional().describe('What the agent does at each start, in the words of the user. It can start a skill or a command, such as "/daily-video". A new schedule needs it.'),
        every: z.number().min(0.25).optional().describe("Start every this many hours, counted from the last start. The first start is one period after the save."),
        at: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).optional().describe('Start each day at this local time, "HH:MM" in 24 hours, such as "09:00".'),
        weekdays: z.boolean().optional().describe("With at: only from Monday to Friday."),
        cron: z.string().optional().describe('Any other timing: a cron line of 5 fields in local time, such as "0 9 * * 1" for Mondays at 9:00.'),
        event: z.string().optional().describe('What starts a trigger, in the words of the user, such as "a new error in Sentry for yonder". A new trigger needs it, and design sets the trigger up from it.'),
        script: z.string().optional().describe(
          "The script of a trigger. Yonder runs it with sh each minute in the folder of the workspace, for 60 seconds at most. Each line that it prints is one event, and each new line starts the agent, with the line as data. " +
            "Print the same line for the same event each time, with no counts or times. The first run only notes its lines. Read a token from the config of its CLI, and never put a secret in the script.",
        ),
        webhook: z.boolean().optional().describe("True gives a trigger a hookUrl in place of a script: each web request to it starts the agent. Use it only when no command or API can see the event."),
        secret: z.string().optional().describe("The signing secret of a webhook trigger, from the webhook settings of the service. With it, the trigger takes only requests that Sentry, GitHub, Linear or Stripe signed. An empty text removes it."),
        paused: z.boolean().optional().describe("True pauses the schedule. False starts it again."),
        retries: z.number().int().min(0).max(5).optional().describe("How many times a run that stops early, fails or is not done continues before Yonder gives up. 2 by default, 0 for none."),
        cli,
        profile: z.string().optional().describe(
          'The profile that runs each start: its name, such as "work". It gives the CLI, the sign-in and the settings. ' +
            '"default" uses no profile: the CLI of the schedule, or the CLI row of the Agents tab. Set it when the user names a profile for the schedule.',
        ),
        effort: z.enum(["auto", ...EFFORTS]).optional().describe(`${effort.description} "auto" lets Clef pick it again at each start.`),
        model: model.describe(`${model.description} "auto" lets Clef pick it again at each start.`),
        mode,
      },
    },
    ({ action, id, name, workspace: project, task, every, at, weekdays, cron, event, script, webhook, secret, paused, retries, cli, profile, effort, model, mode }) =>
      reply(async () => {
        if (action === "list") return { schedules: state.schedules.map(scheduleInfo) };
        const found = id?.trim() ? findSchedule(id) : undefined;
        if (action === "run" || action === "remove" || action === "design") {
          if (!found) throw new Error("Give the id or the name of the schedule.");
          if (action === "remove") {
            state.schedules = state.schedules.filter((x) => x !== found);
            save();
            return { removed: found.id };
          }
          // The agent that sets up a trigger is a normal agent with the profile of the trigger: the user sees it, and it
          // can ask a question.
          if (action === "design") {
            if (!isTrigger(found)) throw new Error(`"${found.name}" is a schedule with a timing, not a trigger.`);
            return brief(await startWorker({ project: found.project, name: `Set up ${found.name}`, task: designPrompt(found), cli: found.cli, profile: found.profile }));
          }
          // Run now of a script trigger runs the script at once, because the task needs an event.
          if (found.script) {
            const started = await pollTrigger(found);
            return started ? brief(started) : { ...scheduleInfo(found), note: "No new line in the output of the script." };
          }
          if (isTrigger(found) && !found.hook) throw new Error(`The trigger "${found.name}" is not set up yet. Call design, or tap Set up with Claude Code in Settings, Triggers.`);
          const w = await runSchedule(found);
          // A run now of "every N hours" starts the period again.
          if (found.every) found.next = nextRun(found, Date.now())!;
          save();
          return brief(w);
        }
        const [h, m] = (at ?? "").split(":").map(Number);
        // The secret of a trigger is 122 random bits, and it stays when a save names the webhook again.
        const hook = webhook ? { hook: found?.hook ?? crypto.randomUUID().replace(/-/g, "") } : undefined;
        const timing: Timing | undefined = every ? { every } : at ? { cron: `${m} ${h} * * ${weekdays ? "1-5" : "*"}` } : cron?.trim() ? { cron: cron.trim().replace(/\s+/g, " ") } : hook ?? (script?.trim() ? { script: script.trim() } : undefined);
        if (timing?.cron && nextRun(timing, Date.now()) === undefined)
          throw new Error(`"${timing.cron}" is not a cron line that runs. It has 5 fields, minute hour day month weekday, such as "0 9 * * 1-5".`);
        const timed = !!(timing?.every || timing?.cron);
        if (timed && event?.trim()) throw new Error("A schedule has a timing, and a trigger has an event: give only one of them.");
        if (!found && (!project?.trim() || !task?.trim() || !(timing || event?.trim())))
          throw new Error("A new schedule needs a project, a task, and a timing: every, at or cron. A new trigger needs an event in place of the timing.");
        const s: Schedule = found ?? { id: Math.random().toString(36).slice(2, 8), name: "", project: "", task: "", next: 0, createdAt: Date.now(), owner: me?.id };
        const trigger = !timed && !!(timing || event?.trim() || isTrigger(s));
        if (trigger && mode === "bypassPermissions") throw new Error("A trigger runs on text that anyone can write, such as the message of an error, so it cannot run in Bypass. Use auto, acceptEdits or plan.");
        // An agent can read text that anyone wrote, so a trigger that an agent saves, with its script, its webhook or its
        // task, stays off until the user turns it on in the app or by voice.
        if (caller && trigger && paused === false) throw new Error("Only the user can turn a trigger on, in Settings, Triggers, or by voice. A trigger that an agent saves stays off.");
        // Each check throws for a value that cannot start, so the schedule never fails at each start.
        const p = project?.trim() ? findProject(project) : undefined;
        const runner = setScheduleRunner(s, cli, profile);
        // A removed profile keeps its CLI in `cli`, so a pause or a new name of its schedule still saves.
        const runCli = runner.profile ? findProfile(runner.profile)?.cli ?? runner.cli ?? "claude" : runner.cli || (profileOf(state.cli)?.cli ?? state.cli);
        const other = runCli === "claude" ? undefined : runCli;
        if (other && !CLIS[other]) throw new Error(`Yonder knows no CLI "${runCli}".`);
        // A trigger checks its run mode (runMode), so a CLI with no Auto mode fails at the save, not at the first event.
        const useMode = mode ?? (trigger ? triggerMode(s.mode) : s.mode);
        if (other && useMode && !CLIS[other].modes[useMode]) throw new Error(`${CLIS[other].name} has no ${useMode} mode. Its modes: ${Object.keys(CLIS[other].modes).join(", ")}.`);
        const prevCli = (s.profile ? profileOf(s.profile)?.cli ?? findProfile(s.profile)?.cli : undefined) ?? (s.cli || (profileOf(state.cli)?.cli ?? state.cli));
        let picked = model === undefined ? s.model : model === "auto" ? undefined : modelFor(other, model);
        // A model of the old CLI does not follow a change of profile.
        if (model === undefined && prevCli !== runCli) picked = undefined;
        // A workspace with no folder goes in by its key, "workspace:<id>", so each start finds it again.
        if (p) s.project = keyOf(adoptFolder(p));
        if (task?.trim()) s.task = task.trim();
        if (name?.trim()) s.name = nameFrom(name, 6);
        s.name ||= nameFrom(s.task, 4);
        if (runner.profile) s.profile = runner.profile;
        else delete s.profile;
        if (runner.cli) s.cli = runner.cli;
        else delete s.cli;
        if (effort) s.effort = effort === "auto" ? undefined : effort;
        if (model !== undefined || prevCli !== runCli) {
          if (picked) s.model = picked;
          else delete s.model;
        }
        if (mode) s.mode = mode;
        // A schedule in Bypass that becomes a trigger runs in Auto (runMode), and the page of the app sends no mode.
        if (trigger && s.mode === "bypassPermissions") delete s.mode;
        if (timing) {
          const before = s.script;
          delete s.every;
          delete s.cron;
          delete s.hook;
          delete s.script;
          Object.assign(s, timing);
          if (!s.hook) delete s.secret;
          // A timing makes a trigger a schedule again. A new script notes its lines at its first run, so the lines that
          // are there now start no agent.
          if (timed) delete s.event;
          if (!s.script || s.script !== before) delete s.seen;
        }
        if (event?.trim()) {
          // An event makes a schedule a trigger, which starts at no set time.
          s.event = event.trim();
          delete s.every;
          delete s.cron;
        }
        if (secret !== undefined && s.hook) {
          if (secret.trim()) s.secret = secret.trim();
          else delete s.secret;
        }
        // A script that starts again after a pause notes its lines again, as a schedule counts from now.
        if (paused === false && s.paused && s.script) delete s.seen;
        if (paused !== undefined) s.paused = paused || undefined;
        if (caller && trigger) s.paused = true;
        if (retries !== undefined) s.retries = retries;
        // A new timing, or a schedule that starts again after a pause, counts from now, so it does not start at once. A trigger has no next start.
        if (timing || event?.trim() || !found || (paused === false && s.next < Date.now())) s.next = nextRun(s, Date.now()) ?? 0;
        if (!found) state.schedules.push(s);
        save();
        return scheduleInfo(s);
      }),
  );
  mcp.registerTool(
    "remind",
    {
      description:
        "Add, list or remove the reminders of the user. A reminder is a short text that comes to the phone as a push from Yonder at a time, also when Yonder is closed on the phone and no agent runs. " +
        'Use it when the user asks to be reminded of something, such as "remind me to set the HDR profile picture on X in 24 hours" or "remind me at 9 to call Anna". It starts no agent, so do not use start_worker or schedule for it. ' +
        "A reminder that the computer missed while it slept comes once when it wakes.",
      inputSchema: {
        action: z.enum(["save", "list", "remove"]).describe("save: add a reminder. list: the reminders that did not come yet. remove: delete one."),
        text: z.string().optional().describe('save: what to remind the user of, in short, such as "Set the HDR profile picture on X".'),
        minutes: z.number().positive().optional().describe("save: in this many minutes from now. 24 hours is 1440."),
        at: z.string().optional().describe('save: at this local time of the computer, in place of minutes: "HH:MM" in 24 hours (the next such time), or "YYYY-MM-DD HH:MM".'),
        id: z.string().optional().describe("remove: the id of the reminder, from save or list."),
      },
    },
    ({ action, text, minutes, at, id }) =>
      reply(async () => {
        const info = (r: Reminder) => ({ id: r.id, text: r.text, at: new Date(r.at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) });
        if (action === "list") return { reminders: [...state.reminders].sort((a, b) => a.at - b.at).map(info) };
        if (action === "remove") {
          const r = state.reminders.find((x) => x.id === id?.trim());
          if (!r) throw new Error(`There is no reminder "${id ?? ""}". The reminders: ${state.reminders.map((x) => `${x.text} (${x.id})`).join(", ") || "none"}.`);
          state.reminders = state.reminders.filter((x) => x !== r);
          save();
          return { removed: r.id };
        }
        if (!text?.trim()) throw new Error("A reminder needs a text.");
        const when = remindAt(Date.now(), minutes, at);
        if (!when) throw new Error('A reminder needs minutes from now, or at: a local time "HH:MM" or "YYYY-MM-DD HH:MM" that is not in the past.');
        const r: Reminder = { id: Math.random().toString(36).slice(2, 8), text: text.trim(), at: when, ...(me && { owner: me.id }) };
        state.reminders.push(r);
        save();
        return info(r);
      }),
  );
  // A push now, from an agent or a script (docs/wiki/workers.md, "Notify"). It goes also while the user works on the Mac (no
  // hereUntil), as a reminder does: the agent asked for it.
  mcp.registerTool(
    "notify",
    {
      description:
        "Send a push notification to the phone of the user now. It comes also when Yonder is closed on the phone. " +
        "Use it only when the user asks to be pinged, or when the task says to tell the user at a point in the work, such as \"ping me when the deploy is live\". " +
        "An agent that ends its turn sends a push by itself, so do not use it for the end of a task. For a later time, use remind.",
      inputSchema: {
        text: z.string().min(1).describe("The text of the push, in short. 240 characters at most."),
        title: z.string().optional().describe("The title of the push. With no title: the name of the agent that calls, or \"Yonder\"."),
      },
    },
    ({ text, title }) =>
      reply(async () => {
        const from = byCaller(caller);
        const head = (title?.trim() || (from ? pushTitle(from) : "Yonder")).slice(0, 100);
        const sent = (await relay?.push(head, text.trim().slice(0, 240), phonesOf(me?.id ?? from?.owner)).catch(() => 0)) ?? 0;
        return sent ? { sent } : { sent, note: "No phone got it: no phone is paired with push on, or the push key of Apple is missing." };
      }),
  );
  mcp.registerTool(
    "message_worker",
    {
      description:
        "Send a message to an existing agent (a worker), so that it continues the same conversation: answer it, reply to it, tell it more or correct it. It returns at once. " +
        "Use it only to answer, continue, correct or add to the task of that worker, when the user names the worker, or when the user reads the conversation of that worker in the app. " +
        "A reply to the result of a worker that you just told about (the user rejects, changes or builds on it) goes to that worker. A new task goes to start_worker. " +
        "One request goes to one worker. When the user changes the worker in the middle of the words (\"or actually, tell 11\"), only the last worker gets it. " +
        "If the worker runs, the message goes into its current turn, and the worker gets it after its next step, as a message that the user types in Claude Code while it works. " +
        "If that is not possible, the message waits in a queue, and the worker gets all its queued messages as its next turn when it finishes. " +
        "With the Steer setting on, it never waits: the worker stops its turn and continues at once with the message. " +
        "With now, or with a new model, effort, mode or profile, a running worker stops its turn and continues at once with the message, in the same conversation. " +
        "A background session that Yonder did not start becomes a worker with the same number, and continues the same session. " +
        "A message to a sub-agent (\"tell 21B to ...\") goes to its agent, which passes it on with SendMessage. " +
        'A message that starts with "/btw " is a side question, as /btw of Claude Code: the agent answers at once from its conversation, with no tools, also while it runs. ' +
        "It does not stop, the conversation does not keep the question, and the result has the answer. " +
        "For a terminal session, it starts a copy of that session as a new worker, with the same context, " +
        "and the session itself does not change. A later message goes to the same copy. " +
        'With closeWhenDone, Yonder closes the worker when the work of this message is done. To only close a running worker when it is done, send "." with closeWhenDone: it gets no new message.',
      inputSchema: {
        worker: workerOrSub,
        message: z.string().describe(`The message. When the user only changes the model, the effort, the mode or the profile, use "." ${ULTRATHINK}`),
        now: z
          .boolean()
          .optional()
          .describe("True: a running worker stops its turn and gets the message at once, such as added context or a correction. Leave it out to queue the message."),
        effort: z.enum(EFFORTS).optional().describe("A new effort for the worker, from this message on. Set it only when the user asks for an effort."),
        model: model.describe(`${model.description} A new model for the worker, from this message on.`),
        mode: mode.describe(`${mode.description} A new mode for the worker, from this message on.`),
        profile: z
          .string()
          .optional()
          .describe(
            'A profile or a CLI for this agent from this message on: a profile name, such as "work", or a CLI name, such as "grok". ' +
              'A profile of another CLI copies the conversation into that CLI, and the same agent goes on there. ' +
              '"default" uses the current CLI with no profile, and for Claude Code the default profile of this computer. Set it only when the user asks to change the profile or the CLI.',
          ),
        closeWhenDone: closeWhenDone.describe(`${closeWhenDone.description} False takes it back. Not for a sub-agent.`),
        context,
        files,
        call,
        key,
      },
    },
    ({ worker, message: words, now, effort, model, mode, profile: asked, closeWhenDone, context, files, call, key }) =>
      replyOnce(key, async () => {
        let found = await findWorker(worker, true);
        // A side question gets its answer now, also while the agent runs. It does not wait in the line of the agent.
        const side = /^\/btw(?:\s|$)/.test(words.trim()) ? words.trim().slice(4).trim() : undefined;
        if (side !== undefined) {
          if (!side) throw new Error("Write the question after /btw.");
          if (found.parent || found.cli || !found.sessionId) throw new Error(`Agent ${found.num} cannot answer /btw. Only a Claude Code agent with a conversation can.`);
          return { num: found.num, answer: await sideQuestion(found, side) };
        }
        if (found.parent) {
          if (closeWhenDone) throw new Error("A sub-agent cannot close. Send the message without closeWhenDone.");
          closeWhenDone = undefined; // The message goes to its agent, which must not lose its own flag.
        }
        // Only the agent can reach its sub-agent, with SendMessage. It gets the message as its next turn, as any message.
        // Haiku can take words such as "[Yonder] The user sends..." for a prompt injection, so these words are plain.
        if (found.parent) {
          const sub = found;
          found = await findWorker(sub.parent!);
          if (found.kind === "terminal") throw new Error(`Agent ${found.num} runs in a terminal, so Yonder cannot reach its sub-agents. Message it in its terminal.`);
          words =
            `Please send a message from me to your sub-agent "${sub.name}" (agent ID ${sub.id.split("/")[1]}) with the SendMessage tool, ` +
            `to: "${sub.id.split("/")[1]}". Send it the text between the lines word for word. Then tell me its answer.\n\n---\n${words}\n---`;
        }
        // The model and the mode must suit the CLI that this message leaves the agent on. A profile can move it.
        if (asked !== undefined && asked.trim() && !targetOf(found, asked)) throw new Error(`There is no profile "${asked.trim()}". The profiles: ${state.profiles.map((p) => p.name).join(", ") || "none"}.`);
        const dest = asked !== undefined ? targetOf(found, asked)!.cli : found.cli;
        model = modelFor(dest, model);
        const its = dest ? CLIS[dest] : undefined;
        if (its && mode && !its.modes[mode]) throw new Error(`${its.name} has no ${mode} mode. Its modes: ${Object.keys(its.modes).join(", ")}.`);
        const message = withContext(words, context, files);
        const out = await inTurn(found.kind ? found.sessionId : found.id, deliver);
        logSent(call, out.num, message);
        return out;
        async function deliver() {
          const fork = found.kind === "terminal" ? forks.get(found.sessionId) : undefined;
          let w = fork && state.workers.includes(fork) ? fork : found;
          // A background session that Yonder did not start becomes a worker (adopt). Only a terminal session gets a
          // copy, because its terminal owns it.
          if (w.kind === "background") w = adopt(w);
          if (w.kind === "terminal") {
            const copy: Worker = {
              id: "", num: freeNum(), sessionId: "", name: `${w.name} (copy)`, project: w.project, workspace: w.workspace, path: w.path, task: words,
              status: "running", activity: "", result: "", unread: false, startedAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
              profile: w.profile,
              avatar: w.avatar,
              effort,
              model,
              mode,
              closeWhenDone: closeWhenDone || undefined,
            };
            if (asked !== undefined) {
              const hold: Worker = { ...copy, sessionId: w.sessionId, cli: w.cli, profile: w.profile };
              if (setProfile(hold, asked)) {
                copy.profile = hold.profile;
                copy.cli = hold.cli;
                copy.carry = hold.carry;
                copy.sessionId = hold.sessionId;
                copy.runs = hold.runs;
                copy.past = hold.past;
                copy.model = hold.model ?? model;
                copy.effort = hold.effort ?? effort;
                copy.mode = hold.mode ?? mode;
                copy.agent = hold.agent;
              }
            }
            const moved = !!(copy.cli || copy.carry);
            const carried = copy.carry;
            delete copy.carry;
            const prompt = carried ? await handoff(copy, carried, message) : message;
            showStarting(copy);
            await pick(words, copy);
            if (moved) {
              if (copy.cli) await runTurn(copy, prompt);
              else await send(copy, [...(copy.sessionId ? ["--resume", copy.sessionId] : []), ...options(copy), prompt]);
            } else await send(copy, ["--resume", w.sessionId, "--fork-session", ...options(copy), message]);
            forks.set(w.sessionId, copy);
            return { ...brief(copy), note: `A copy of the terminal session ${w.id}. That session did not change.` };
          }
          // "" asks for the current CLI with no profile. A profile or a CLI that the worker has already is no change.
          // An unknown name must fail here. Else "Grok" on a Claude agent with no profile
          // looks like "already on the CLI", and "Continue." returns "No change" with no error.
          let profile: string | undefined;
          if (asked !== undefined) {
            const key = asked.trim();
            const target = targetOf(w, key);
            if (!target) throw new Error(`There is no profile "${key}". The profiles: ${state.profiles.map((p) => p.name).join(", ") || "none"}.`);
            if (target.cli !== w.cli || (target.profile ?? "") !== (w.profile ?? "")) profile = key;
          }
          // A model, an effort, a mode or a profile that the worker has already is no change, and a bare "." to a running
          // worker then does nothing. Else a phone that sends the same effort with "Continue." again and again stops
          // the turn and makes a copy of the session each time. The log tells which device sends a change.
          // The placeholder is ".", and an older phone or theme still sends "Continue.".
          if (model || effort || mode || profile !== undefined) console.error(`message_worker to worker ${w.id} from ${device || "an agent"}: ${JSON.stringify({ words, model, effort, mode, profile, now })}`);
          if (model === w.model) model = undefined;
          if (effort === w.effort) effort = undefined;
          if (mode === w.mode) mode = undefined;
          // The flag holds for the turn of this message, or for the turn that runs now. A message to an agent that does
          // not run starts a new turn, so the flag of the turn before goes.
          if (closeWhenDone !== undefined || (w.closeWhenDone && w.status !== "running")) {
            w.closeWhenDone = closeWhenDone || undefined;
            save();
          }
          if (w.status === "running" && !now && !model && !effort && !mode && profile === undefined && [".", "Continue."].includes(words.trim()) && !files?.length)
            return { ...brief(w), note: closeWhenDone ? `No new message. Yonder closes worker ${w.id} when its turn ends, unless it fails, asks a question or leaves something to the user.` : `No change. Worker ${w.id} runs on these settings already.` };
          // A message to a running worker goes into its current turn (typeIn). Else it waits in the queue of the
          // bridge, because one session runs one turn at a time. With the Steer row on, it never waits: the turn
          // stops, and the worker continues at once with the message, as with now, as the steer of T3 Code.
          // Steer does not try typeIn: a typed message waits for the next step, and else the user must still tap it.
          if (w.status === "running" && !now && !model && !effort && !mode && profile === undefined && !state.steer) {
            if (!w.queue?.length && (await typeIn(w, message)))
              return { ...brief(w), note: `Sent. Worker ${w.id} gets it after its next step, in the turn that runs now.` };
            w.queue = [...(w.queue ?? []), message];
            save();
            return { ...brief(w), note: `Queued. Worker ${w.id} gets ${w.queue.length} queued messages when it finishes.` };
          }
          // A message that did not go does not leave its closeWhenDone for a later turn.
          await sendQueue(w, [...(w.queue ?? []), message], { model, effort, mode, profile }).catch((e) => {
            if (closeWhenDone) delete w.closeWhenDone;
            throw e;
          });
          return brief(w);
        }
      }),
  );
  mcp.registerTool(
    "stop_worker",
    {
      description:
        "Interrupt an agent: stop the current turn of a running worker, as Escape does in Claude Code. The worker stays open on the Agents tab and waits for the next message, " +
        "in the same conversation. Its queued messages stay in the queue, and the next message_worker sends them first. " +
        "With send, the worker gets its queued messages at once as its next turn, in place of the rest of the current turn. " +
        "With send and message, it gets only that queued message now, and the other queued messages wait for the end of that turn. " +
        "Call it when the user asks to interrupt an agent or to stop what it does now (\"interrupt 3\", \"stop 3, wait\"). To close an agent, call close_worker.",
      inputSchema: {
        worker,
        send: z.boolean().optional().describe("True: the queued messages go to the worker now. Leave it out to only stop the turn."),
        message: z.string().optional().describe("With send: the start of the one queued message to send now. Leave it out to send all of them."),
      },
    },
    // The app sends one queued message when the user taps its bubble: only the message that the user tapped.
    ({ worker, send, message }) =>
      reply(async () => {
        const w = own(await findWorker(worker));
        return inTurn(w.id, async () => {
          // With send and no queue of the bridge, the messages that went into the turn that runs (typeIn) go now. They
          // wait in the queue of Claude Code. Else Escape with only such a message stops the turn and keeps the message
          // back.
          if (send && !message && !w.queue?.length && !w.cli && inRoster(w.sessionId)) {
            const held = await untaken(w);
            if (held.length) w.queue = held;
          }
          if (send && message) {
            let i = w.queue?.findIndex((q) => q.startsWith(message)) ?? -1;
            // A message that went into the turn that runs (typeIn) waits in the queue of Claude Code. The others there
            // move to the queue of the bridge, so that resume sends only this one, and they wait for the end of its turn.
            // A tap on its dotted bubble sends it.
            if (i < 0 && message.trim() && !w.cli && inRoster(w.sessionId)) {
              const held = await untaken(w);
              const one = held.find((m) => m.trim().startsWith(message.trim()));
              if (one) (w.queue = [one, ...held.filter((m) => m !== one && !w.queue?.includes(m)), ...(w.queue ?? [])]), (i = 0);
            }
            if (i < 0) throw new Error(`Agent ${w.num} has no queued message that starts with "${message.slice(0, 60)}". It may have got it already.`);
            const [one] = w.queue!.splice(i, 1);
            if (!w.queue!.length) w.queue = undefined;
            try {
              await resume(w, one);
            } catch (e) {
              (w.queue ??= []).splice(i, 0, one);
              throw e;
            }
            save();
          } else if (send && w.queue?.length) await sendQueue(w, w.queue);
          else if (w.status === "running" || w.ask) { // An open question of Allow or Deny shows as waiting, but the turn runs.
            await halt(w);
            // The mark keeps the status until the session works again. Without it, the stopped session shows as
            // closed, and the queue starts the next turn at once.
            // The user takes over, so the agent no longer closes when done.
            Object.assign(w, { status: "waiting", activity: "", result: "The user stopped this turn.", unread: false, attention: false, answered: false, marked: true, closeWhenDone: undefined, updatedAt: Date.now() });
            save();
          }
          return brief(w);
        });
      }),
  );
  mcp.registerTool(
    "unqueue",
    {
      description:
        "Take one message out of the queue of a worker, before the worker gets it. The app uses it when the user edits or drops a queued message. " +
        "Call it when the user takes back a message that waits in the queue of an agent.",
      inputSchema: {
        worker,
        message: z.string().describe("The start of the queued message."),
      },
    },
    ({ worker, message }) =>
      reply(async () => {
        const w = own(await findWorker(worker));
        return inTurn(w.id, async () => {
          const i = w.queue?.findIndex((q) => q.startsWith(message)) ?? -1;
          if (i < 0) throw new Error(`Agent ${w.num} has no queued message that starts with "${message.slice(0, 60)}". It may have got it already.`);
          w.queue!.splice(i, 1);
          if (!w.queue!.length) w.queue = undefined;
          save();
          return brief(w);
        });
      }),
  );
  mcp.registerTool(
    "list_workers",
    {
      description:
        "Count, list or find the agents (workers, tasks). It gives `counts`, the number of agents on each tab of the app, " +
        "and `list`, one short line for each agent: number, name, project (its workspace), status, profile (the account or the CLI that it runs on), minutes ago and the gist, " +
        "in the order of the screen, at most `limit` (20). `more` is the number of agents that the list leaves out. " +
        "For \"how many agents are on the Done tab?\", read `counts`: never count the list. Give `tab` to list only one tab, and `workspace` to keep one workspace. " +
        "Status is running (on the Agents tab), waiting (it needs an answer from the user to go on, on the Done tab), done or failed (on the Done tab), or closed (on the Closed tab: the user closed it or marked it as done). " +
        "An agent with saved true is not closed, and is on the Saved tab, also while it runs: the user saved it for later. " +
        "It also lists the other Claude Code sessions on this Mac, with kind terminal or background. A message to a background session continues it as a worker. A message to a terminal session starts a copy. " +
        "With query, it searches the agents of all the workspaces, also the done and closed ones, and gives the best matches first. " +
        "Use it before start_worker when the user asks about earlier work or an agent by its work (\"the landing page push\"). " +
        "With full set to true, it gives the whole record of each agent, as the app needs it: that is too long for a voice call.",
      inputSchema: {
        query: z.string().optional().describe("Words about the work, such as \"landing page push\". Leave it out to list all the workers."),
        tab: z.enum(TABS).optional().describe("Only the agents of one tab: `agents` (running), `completed` (the Done tab: waiting, done or failed), `saved` (saved for later, also when they run) or `closed`"),
        workspace: z.string().optional().describe("Only the agents of one workspace, as the app groups them. `counts` then counts only that workspace."),
        limit: z.number().int().min(1).optional().describe("The most agents in the list: 20 if left out, 8 with query."),
        full: z.boolean().optional().describe("True for the whole record of each agent, with no counts. Only the app needs it."),
        scope: z.enum(["mine", "all"]).optional().describe(
          "Only when two people or more share this computer: `mine` (the default) lists only the agents of the person who asks, `all` the agents of each person, such as for \"what is Marco doing?\".",
        ),
      },
    },
    // All the workers: the app shows each of them. A list of only the newest hides agents on the Closed and Completed
    // tabs.
    // `site` is the web server of the agent, for the Preview button of the app.
    ({ query, tab, workspace: project, limit, full, scope }) =>
      reply(async () => {
        const path = project && keyOf(findProject(project));
        const ps = path ? projects() : [];
        // With two people or more, each person gets only their own agents, unless the call asks for all (docs/multi-user.md).
        const group = people();
        const shared = !!me && People.shared(group);
        const own = (w: Worker) => !shared || scope === "all" || People.ownerOf(group, w.owner) === me;
        const ownerName = (w: Worker) => shared && { owner: People.ownerOf(group, w.owner)?.name };
        // `counts` and `list` match the tabs of the app, with the terminal sessions (`lists` in src/App.tsx).
        const mine = (await allSessions()).filter((w) => (!path || groupOf(w, ps) === path) && own(w));
        const all = tab ? mine.filter((w) => tabOf(w) === tab) : mine;
        // A closed agent gets a short task, result and summary: the phone polls this list every 3 seconds through the
        // relay, and 316 closed agents make it 876 KB, so the phone shows "Reconnecting…".
        const cut = (s: string | undefined, end = false) => s && (s.length > 200 ? (end ? s.slice(-200) : s.slice(0, 200)) : s);
        if (full)
          return all.map((w) => {
            const b = { ...brief(w), site: siteOf(w) };
            return w.status === "closed" ? { ...b, task: cut(b.task)!, result: cut(b.result, true)!, summary: cut(b.summary) } : b;
          });
        // A full list of 274 agents is 485 KB, about 113K tokens: too long for a voice call.
        if (!query) {
          const counts = Object.fromEntries(TABS.map((t) => [t, mine.filter((w) => tabOf(w) === t).length]));
          const list = (tab ? [tab] : TABS).flatMap((t) => all.filter((w) => tabOf(w) === t).sort(screenOrder(t)));
          const n = limit ?? 20;
          // One line for each agent: the main result of its summary, what it does now, or the end of its result.
          const line = (w: Worker) =>
            ((w.status === "running" && w.activity) || state.summaries[w.sessionId]?.text.split("\n")[0].replace(/^- /, "") || w.result.slice(-200) || w.task)
              .replace(/\s+/g, " ").trim().slice(0, 200);
          return {
            counts,
            list: list.slice(0, n).map((w) => ({
              num: w.num, id: w.id, name: w.name, project: w.project, status: w.status, ...(w.saved && { saved: true }), kind: w.kind, profile: profileName(w),
              ...ownerName(w), minutesAgo: Math.floor((Date.now() - w.updatedAt) / 60_000), summary: line(w),
            })),
            ...(list.length > n && { more: list.length - n }),
          };
        }
        // A worker matches each word of the query that is in its name, task, project, summary or result.
        // The words can come in any order: "landing page push" finds "Push landing page".
        // Small words such as "the" are in each worker, so they do not count.
        const words = query.toLowerCase().split(/\W+/).filter((s) => s.length > 2 && !SMALL.has(s));
        const hits = all
          .map((w) => {
            const text = norm([w.name, w.task, w.project, state.summaries[w.sessionId]?.text, w.result].join(" "));
            const name = norm(w.name);
            // A word in the name counts twice, because the name tells the work best.
            return { w, score: words.reduce((n, s) => n + (name.includes(s) ? 2 : text.includes(s) ? 1 : 0), 0) };
          })
          .filter((h) => h.score)
          .sort((a, b) => b.score - a.score || b.w.updatedAt - a.w.updatedAt)
          .slice(0, limit ?? 8);
        // Only a short gist of each match, so that the answer stays small for the voice agent.
        return hits.map(({ w }) => ({
          num: w.num, id: w.id, name: w.name, project: w.project, status: w.status, kind: w.kind, profile: profileName(w), ...ownerName(w),
          minutesAgo: Math.floor((Date.now() - w.updatedAt) / 60_000),
          task: w.task.replace(/\s+/g, " ").slice(0, 200),
          summary: state.summaries[w.sessionId]?.text ?? w.result.replace(/\s+/g, " ").slice(-300),
        }));
      }),
  );
  // "Give me a summary of all": one line for each agent of a tab, and which ones the user can close. Sonnet on high
  // effort judges it, because it sees all the agents at once and finds the work that another agent did again. Else Grok
  // gives only the counts of the agents.
  mcp.registerTool(
    "review_workers",
    {
      description:
        "Sum up all the agents of one tab, and say which ones the user can close. It gives one line for each agent, in the order of the screen: " +
        "what it did, then Close or Keep with the reason. Sonnet reads the summaries and the other agents of the same workspaces, " +
        "so it also finds the work that another agent did again. Call it when the user asks for a summary of all the agents of a tab " +
        "(\"give me a summary of all\"). It takes about 10 seconds, and 20 seconds for a long tab.",
      inputSchema: {
        tab: z.enum(TABS).describe("The tab of the group: `agents` (running), `completed` (the Done tab: waiting, done or failed), `saved` (the agents saved for later, also when they run) or `closed`"),
        workspace: groupProject,
      },
    },
    ({ tab, workspace: project }) =>
      reply(async () => {
        // The order of the screen.
        const group = (await targets(undefined, tab, project, me)).sort(screenOrder(tab));
        if (!group.length) return `No agents on the ${tab} tab.`;
        const paths = new Set(group.map((w) => w.path));
        const others = state.workers
          .filter((w) => paths.has(w.path) && w.num && !w.parent && !group.includes(w))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 20);
        const task = (w: Worker, n: number) => typed(w.task).replace(/\s+/g, " ").trim().slice(0, n);
        // Only the summary and the task. With the attention flag of Clef, Haiku said Keep for "test it" in one of two runs.
        const input =
          "The agents to review:\n\n" +
          group
            .map((w) =>
              [
                // An old closed agent has no number, so its name stands in, never its worker id: Grok does not read ids aloud.
                `${label(w) ? `Agent ${label(w)}, "${w.name}"` : `Agent "${w.name}"`} in ${w.project}: ${w.status}` +
                  `${w.status === "running" ? "" : `, ${Math.floor((Date.now() - w.updatedAt) / 60_000)} minutes ago`}.`,
                `  Task: ${task(w, 300)}`,
                `  Summary: ${(state.summaries[w.sessionId]?.text ?? w.result.replace(/\s+/g, " ").slice(-300)).replace(/\n/g, " ")}`,
              ].join("\n"),
            )
            .join("\n\n") +
          `\n\nThe other agents of the same projects:\n${others.map((w) => `- Agent ${w.num}, "${w.name}": ${w.status}. Task: ${task(w, 160)}`).join("\n") || "None."}`;
        // The model sometimes adds a heading, blank lines or Markdown, so only the lines with a verdict stay.
        // A line of an agent with no number sometimes has no "Agent" word.
        const lines = (await ask(REVIEW, input, LATEST.sonnet, "high"))
          .split("\n")
          .map((l) => l.replace(/\*\*/g, "").replace(/^[\s*•-]+/, "").trim())
          .filter((l) => /\b(Close|Keep):/.test(l));
        if (!lines.length) throw new Error("Sonnet wrote no review. Tell about the agents from your prompt instead.");
        return lines.map(say);
      }),
  );
  mcp.registerTool(
    "get_worker",
    {
      description:
        "Check on one agent (a worker) or session: the current status, the gist of its last message (its last lines), the context use, and its last steps. " +
        "quietMinutes is the time since its last step: a running worker that is quiet for many minutes can be stuck. " +
        "With full set to true, it gives the whole last message and the last prompts and answers of the conversation, " +
        "so that you can answer a question about the work of the agent yourself. " +
        "This marks the result as read.",
      inputSchema: {
        worker: workerOrSub,
        full: z.boolean().optional().describe("True for the whole last message and the last prompts and answers, to answer a question about the work"),
      },
    },
    ({ worker, full }) =>
      reply(async () => {
        const w = await findWorker(worker, true);
        w.unread = false;
        save();
        // An agent in another CLI has its last step in updatedAt (followRun).
        const at = w.cli ? w.updatedAt : (await lastTurn(w.path, w.sessionId)).at;
        const quietMinutes = at ? Math.floor((Date.now() - at) / 60_000) : undefined;
        const subs = (await subagents(w)).map((s) => `${label(s)} "${s.name}" (${s.status})`);
        const subagentsOf = subs.length ? { subagents: subs } : {};
        const { runs, ...shown } = w; // The paths of the logs stay in the bridge.
        if (full) {
          // The words of the conversation, without the tool calls: the last 8 prompts and answers, newest last.
          // Else Grok sees only the end of the last message, and sends a question back to the agent
          // that its last answer already answered.
          const talk = (await turns(w, 60, 4_000_000)).filter((t) => t.who !== "tool").slice(-8);
          const conversation = talk.map((t) => `${t.who === "user" ? "user" : "agent"}: ${said(t).slice(-3000)}`);
          return { ...shown, result: w.result.trim().slice(-6000), summary: state.summaries[w.sessionId]?.text, conversation, recent: await steps(w, 6), quietMinutes, ...subagentsOf };
        }
        // Only the gist: the last lines of the last message, where the worker sums up.
        const gist = w.result.trim().split("\n").filter((l) => l.trim()).slice(-6).join("\n").slice(-800);
        return { ...shown, result: gist, summary: state.summaries[w.sessionId]?.text, recent: await steps(w, 4), quietMinutes, ...subagentsOf };
      }),
  );
  mcp.registerTool(
    "rename_worker",
    {
      description:
        "Rename an agent (a worker) or a session. For a terminal or background session, the name shows in Yonder only. " +
        "With shape and color, it gives the agent its picture in a screen that draws one, such as Grok Bot.",
      inputSchema: {
        worker,
        name: z.string().optional(),
        shape: z.string().regex(/^[a-z0-9-]{1,24}$/).optional().describe('A shape of the screen, such as "cloud". Give it with color.'),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('A color, such as "#ff6700". Give it with shape.'),
      },
    },
    ({ worker, name, shape, color }) =>
      reply(async () => {
        const w = await findWorker(worker);
        if (!shape !== !color) throw new Error("Give shape and color together.");
        if (name === undefined && !shape) throw new Error("Give a name, or a shape and a color.");
        if (name !== undefined) {
          if (w.kind) state.names[w.sessionId] = name;
          else w.name = name;
        }
        const avatar = shape && color ? { shape, color: color.toLowerCase() } : undefined;
        if (avatar) {
          if (w.kind) state.avatars[w.sessionId] = avatar;
          else w.avatar = avatar;
        }
        save();
        sessionsAt = 0; // Read the sessions again on the next call.
        return { id: w.id, name: name ?? w.name, ...(avatar && { avatar }) };
      }),
  );
  // An agent of each CLI moves between workspaces. Each CLI resumes
  // a session by its ID. The next turn runs in the new folder: send and runTurn use w.path, and an ACP CLI resumes
  // with that folder (acp-host.ts). The profile stays on the agent, so the CLI, the sign-in and the settings of that
  // profile stay too. Claude Code keeps the transcript in the folder of the old project, and transcriptFile finds it.
  // A sub-agent has no session of its own, so it follows its agent (subagents). A terminal session and a background
  // session that Yonder did not start keep the folder of their own process, so they cannot move.
  mcp.registerTool(
    "move_worker",
    {
      description:
        "Move an agent to another workspace. It keeps its conversation, its CLI and its profile, and it works in the folder of the new workspace from its next message. An agent that moves to a workspace with no folder keeps its folder. " +
        "A running agent ends its current turn in the old folder. A sub-agent moves with its agent. Only agents that Yonder started can move.",
      inputSchema: { worker, workspace: z.string().describe("The new workspace name or id, or an absolute folder path") },
    },
    ({ worker, workspace: project }) =>
      reply(async () => {
        const w = await findWorker(worker);
        if (w.kind) throw new Error(`Agent ${w.num} is a ${w.kind} session that Yonder did not start, so it cannot move.`);
        const p = adoptFolder(findProject(project));
        if (p.path === w.path && (!p.id || p.id === w.workspace)) return { ...brief(w), note: `Agent ${w.num} is in ${p.name} already.` };
        const from = w.project;
        if (p.home === false && p.path === join(HOME, "Yonder")) yonderFolder();
        // The CLI, the profile, the session and the model stay. The workspace changes, and its folder when it has one.
        // An agent that moves into a workspace with no folder keeps its own folder, so its session and its files stay.
        Object.assign(w, { project: p.name, workspace: p.id, ...(p.home !== false && { path: p.path, cwd: undefined }) });
        save();
        const prof = profileOf(w.profile);
        const kept = prof ? ` It keeps the profile ${prof.name}.` : "";
        return { ...brief(w), note: `Moved from ${from} to ${p.name}.${w.status === "running" ? " Its current turn ends in the old folder." : ""}${kept}` };
      }),
  );
  mcp.registerTool(
    "star_worker",
    {
      description:
        "Save an agent for later, or unsave it. The agent moves to the Saved tab, out of the Done tab, and its session stays as it is. " +
        "A closed agent comes back as done. It stays on the Saved tab while it runs and when it is done. A close takes it off the Saved tab, and saved false puts it back on the Done or Agents tab. " +
        'Call it with saved true when the user asks to save, star, pin or keep an agent, or to put it on the Saved tab ("save 4 for later", "star 4", "later"), and with saved false for "unsave 4" or "unstar 4".',
      // `starred` is the old name of `saved`: the star and the save of an agent are one thing.
      inputSchema: { worker, saved: z.boolean().optional().describe("True saves the agent for later, on the Saved tab"), starred: z.boolean().optional().describe("The same as saved") },
    },
    ({ worker, starred, saved = starred }) =>
      reply(async () => {
        const w = await findWorker(worker);
        if (saved === undefined) throw new Error("Give saved.");
        // Only an agent of Yonder keeps the flag. A closed agent was stopped, so it comes back as done, as after a complete.
        own(w);
        if (saved && w.status === "closed") Object.assign(w, { status: "done", marked: true, closedItself: undefined, closedBy: undefined });
        w.saved = saved || undefined;
        save();
        sessionsAt = 0; // Read the sessions again on the next call.
        return { id: w.id, num: w.num, saved: w.saved ?? false };
      }),
  );
  mcp.registerTool(
    "open_in_terminal",
    {
      description:
        "Open one of Yonder's workers in Ghostty, as an interactive session of its CLI with the same conversation. " +
        "A Claude Code worker can run. Use it ONLY when the user names the terminal or Ghostty. For \"open it\" or \"open agent 19\" alone, show the agent on the screen instead. " +
        "To make a done, failed or closed worker run again, use message_worker.",
      inputSchema: { worker },
    },
    ({ worker }) =>
      reply(async () => {
        const w = own(await findWorker(worker));
        // An agent in another CLI opens with the resume of its CLI, between its turns: during a turn its headless
        // process owns the session.
        if (w.cli) {
          if (w.status === "running") throw new Error(`Agent ${w.num} still runs in ${cliName(w.cli)}. Wait until it finishes, or stop it.`);
          if (!w.sessionId) throw new Error(`${cliName(w.cli)} gave agent ${w.num} no session to open.`);
          const { path } = await cliState(w.cli);
          if (!path) throw new Error(`${cliName(w.cli)} is not installed on this Mac.`);
          const resume = CLIS[w.cli].terminal(w.sessionId);
          if (!resume.length) throw new Error(`${cliName(w.cli)} cannot open a session in a terminal.`);
          await inTerminal(w.path, [path, ...resume], `${w.num} · ${w.name}`);
          return { opened: w.id, name: w.name };
        }
        // A live background session opens with `claude attach`, also while it runs. A finished session has no
        // process to attach to, and a worker of an older bridge has no background session, so they open with --resume.
        const background = (await agents()).some((a) => a.kind === "background" && a.pid && a.sessionId.toLowerCase() === w.sessionId.toLowerCase());
        if (!background && w.status === "running") throw new Error(`Worker ${w.id} is still running. Wait until it finishes, or close it.`);
        // A profile with its own folder opens with that folder.
        const folder = profileOf(w.profile)?.own && !WINDOWS ? ["env", `CLAUDE_CONFIG_DIR=${claudeDir(profileOf(w.profile))}`] : [];
        await inTerminal(w.path, [...folder, CLAUDE, ...(background ? ["attach", w.sessionId.slice(0, 8)] : ["--resume", w.sessionId])], `${w.num} · ${w.name}`);
        return { opened: w.id, name: w.name };
      }),
  );
  mcp.registerTool(
    "open_folder",
    {
      description:
        "Open a folder of this Mac in a Finder window, or show a file selected in its folder. " +
        "Use it ONLY when the user names Finder or a folder (\"open it in Finder\", \"open the folder of that recording\"). " +
        "When the user asks to read a file or a note, call read_file instead, and never open Finder.",
      inputSchema: { path: z.string().describe("An absolute path, a path that starts with ~, or a workspace name") },
    },
    ({ path }) =>
      reply(() => {
        const full = path.startsWith("~") || isAbsolute(path) ? uncut(expand(path)) : findProject(path).path;
        if (!existsSync(full)) throw new Error(`There is nothing at ${full}.`);
        // A file opens its folder with the file selected, so that Finder never opens the file in an app. On Omarchy,
        // Nautilus selects it through the FileManager1 call of D-Bus.
        if (LINUX && !isDir(full))
          Bun.spawn(["gdbus", "call", "--session", "--dest", "org.freedesktop.FileManager1", "--object-path", "/org/freedesktop/FileManager1",
            "--method", "org.freedesktop.FileManager1.ShowItems", `['${pathToFileURL(full).href.replace(/'/g, "%27")}']`, ""]);
        // Explorer reads `/select,"<path>"` as one word, so its command line is written here, not quoted by Bun.
        else if (WINDOWS) Bun.spawn(isDir(full) ? [OPEN, full] : [OPEN, `/select,"${full}"`], { windowsVerbatimArguments: !isDir(full) });
        else Bun.spawn(isDir(full) ? [OPEN, full] : ["open", "-R", full]);
        return { opened: full };
      }),
  );
  mcp.registerTool(
    "read_file",
    {
      description:
        "Read the text of a file on this Mac, such as a note, a log or a README, so that you can read it aloud or answer from it. " +
        "Use it when the user says \"read the note\" or \"read it\" for a file whose path you know, for example from the result of an agent. " +
        "It gives the last 8000 characters of a long file.",
      inputSchema: { path: z.string().describe("An absolute path, or a path that starts with ~") },
    },
    ({ path }) =>
      reply(() => {
        const full = expand(path);
        if (!existsSync(full) || isDir(full)) throw new Error(`There is no file at ${full}.`);
        const text = readFileSync(full, "utf8");
        // shortcut: the end of a long file, because a log or a note list puts the newest text last.
        return { path: full, chars: text.length, text: text.length > 8000 ? "…" + text.slice(-8000) : text };
      }),
  );
  mcp.registerTool(
    "open_link",
    {
      description:
        "Open a web link in the default browser of this Mac, in front of the user. Use it when the user asks to open a link from the result of an agent, such as yonder.so. " +
        "The app also calls it when the user clicks a link in the chat.",
      inputSchema: { url: z.string().describe("The address, such as https://yonder.so or yonder.so") },
    },
    ({ url }) =>
      reply(() => {
        const full = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
        // Only web and mail links: `open` also starts apps for file: and other schemes.
        if (!/^(https?|mailto):/i.test(full)) throw new Error(`Yonder opens only http, https and mailto links, not ${full}.`);
        Bun.spawn([OPEN, full]);
        return { opened: full };
      }),
  );
  // The Canvas tab (docs/canvas.md): the pages of the agents and of the voice agent, and the approvals of the agents. An agent
  // gives its number, so the bridge knows whose page or approval it is.
  const ownAgent = (agent?: string) => {
    const mine = byCaller(caller);
    if (mine || !agent) return mine;
    const num = Number(agent.match(/\d+/)?.[0]);
    const w = state.workers.find((x) => x.num === num && !x.parent);
    if (!w) throw new Error(`There is no agent ${agent} that Yonder started.`);
    return w;
  };
  // The icon of an app, as show_app and change_app take it. One style for all icons, so the Canvas tab looks as one set. An
  // emoji on the red accent tile looks old.
  const icon = z
    .string()
    .optional()
    .describe(
      "The icon of the app, in the style of a modern app icon: one square SVG of 20 KB or less, viewBox 0 0 64 64. " +
        "The background is a <rect> that fills the whole square, with no rx (the app rounds the corners), and a gradient of two close shades of one hue, lighter at the top left. " +
        "On it, one simple white glyph that shows what the app is, in the middle 32 units: plain geometric shapes, solid fills or a stroke of 4 or more with round caps and joins. " +
        "Add one more color only when the glyph needs it, such as a yellow sun. No text, no emoji, no outlines, no shadows and no thin details. " +
        "Give it one gentle CSS animation of 3 to 6 seconds that moves a part of the glyph a little.",
    );
  mcp.registerTool(
    "show_app",
    {
      description:
        "Show the user a page (an artifact) that you made, such as a comparison, a chart, a plan or a status board, as an app in the Canvas tab of Yonder. " +
        "It is one HTML file of 1 MB or less, made for a phone first, with its CSS and scripts inside, and pictures as data URLs or https URLs. " +
        "Use the CSS variables --bg, --text, --muted, --line and --accent, so that the page follows the look of the app. Its links open in the browser of the phone. " +
        "For a form or a choice, use a sheet from the bottom, never a dialog in the middle: the frame ends at the top of the keyboard, so a sheet fixed at the bottom sits on it. " +
        "To send a change to this Mac, the page calls parent.postMessage({ yonderSend: data }, \"*\"), and gets back { yonderSent: data, ok }. The bridge writes data as a JSON file in the inbox folder next to the page, for a job on this Mac to read and delete. " +
        `${screenNote()} ` +
        "Give html, or path: the full path of an .html file that you wrote. Give icon with a new app. " +
        "An agent can have several apps, and each shows as its own card in the chat of the agent. A page with a new title makes a new app. A page with the title of one of your apps adds a new version of it, and a page with no title adds a new version of your newest app. The old versions stay. The voice agent makes a new app each time, unless it gives id. " +
        "With id (the id or the name of an app) and a page, it adds a new version of that app. With id alone, the voice agent opens the app again. With id and version, it brings back that version as the newest. " +
        "A page of an agent never opens by itself: it shows in the chat of the agent and in the Canvas tab, and the user opens it there. A page of the voice agent opens at once on the screen of the call. " +
        "A web app, or a site that needs a server, is not an artifact: run its server, and it shows in the Canvas tab as a site.",
      inputSchema: {
        title: z.string().max(80).optional().describe('A title of two to five words, such as "Paris vs Dubai". A new app needs it. The same title adds a new version, and a new title makes a new app. With id, a new title renames the app.'),
        html: z.string().optional().describe("The whole page"),
        path: z.string().optional().describe("The full path of an .html file, in place of html"),
        icon,
        id: z.string().optional().describe("The id or the name of an app: for a new version, to open it again, or with version to bring back an old version"),
        version: z.number().int().positive().optional().describe("With id: the version to bring back"),
        agent: z.string().optional().describe("Your agent number, as Yonder shows you to the user. Each agent gives it."),
        call,
      },
    },
    ({ title, html, path, icon, id, version, agent, call }) =>
      reply(() => {
        const w = ownAgent(agent);
        if (path && !html) {
          if (!path.endsWith(".html") || !existsSync(path)) throw new Error(`${path} is not an .html file.`);
          if (statSync(path).size > MAX_BYTES) throw new Error("An artifact is 1 MB or less. Make the page smaller, or run a larger page as a site.");
          html = readFileSync(path, "utf8");
        }
        const named = id ? canvas.find(id) : undefined;
        if (id && !named) throw new Error(`No app has the id or the name ${id}.`);
        // A page with the title of an app of the agent, or with no title, is a new version of that app or of its newest app.
        // A new title makes a new app, so a task can send several apps, each with its own card in the chat.
        const mine = named ?? (w ? canvas.of(w.id, title) : undefined);
        const a = html ? canvas.put({ id: mine?.id, title, html, icon, worker: w?.id, call: w ? undefined : brain || call })
          : named && version ? canvas.back(named.id, version)
          : named && (title || icon) ? canvas.change(named.id, { title, icon })
          : named;
        if (!a) throw new Error("Give html or path for a new app.");
        const page = { id: a.id, path: canvas.path(a), title: a.title };
        // A new version of an app that the user archived, or of an agent whose app the user deleted forever, stays in the
        // archive: it does not open, and it sends no push. Else archived apps of agents come back.
        if (html && a.archived)
          return { ...page, version: a.versions, archived: true, shows: "The user removed this app, so the new version stays in the archive and does not show. Do not call show_app for it again unless the user asks." };
        // Grok opens the page from this result, and the Claude call gets an app event. The page of an agent, or of another
        // program on this Mac, never opens by itself: the user opens it from the chat or the Canvas tab. Also show_app
        // with id alone does not open it. Else the page covers the work of the user in Yonder.
        // An agent of build_app sends a push when no call is live.
        if (brain) appTool(brain, "show_app", page);
        const live = Date.now() < callUntil;
        if (w?.showOn && !live) push(`${pushName(w)} made ${a.title}`, "It is in the Canvas tab.", w);
        const shows = !w && (device || brain)
          ? "It opens now on the screen of the user."
          : w
            ? "It shows in your chat and in the Canvas tab, and the user opens it there. Put its path in your final message in place of a screenshot: the chat shows it there as a card that opens it."
            : "It shows in the Canvas tab, and the user opens it there.";
        return { ...page, version: a.versions, shows, ...(!a.icon && { icon: "The app has no icon yet: give icon in the next call." }) };
      }),
  );
  mcp.registerTool(
    "send_file",
    {
      description:
        "Send a file to an agent: a photo, a video, a PDF or any document that is not on this computer yet. " +
        "With url (a public https link) or data (base64), this computer saves the file and returns its path. Then give the path in files of start_worker or message_worker. " +
        "A video also gets its keyframes and the words of its sound, because an agent cannot watch a video. The original stays. " +
        "With neither url nor data, Yonder opens the attach sheet on the phone of the user, in the chat of worker, and sends a push. " +
        "The user picks the file there, and it goes to the agent end to end encrypted with the next message of the user. " +
        "For a file that the user attached in the Claude app, use create_upload from your code tool. When you have no code tool, use this push: tell the user to tap it and pick the file again in Yonder.",
      inputSchema: {
        url: z.string().optional().describe("A public https link to the file, such as a shared link of Dropbox or Google Drive"),
        data: z.string().optional().describe("The file in base64, 500 KB or less"),
        name: z.string().optional().describe("The file name with its extension, such as clip.mov. Needed with data"),
        worker: z.string().optional().describe("With neither url nor data: the agent whose chat opens on the phone. Leave it out for a new agent"),
      },
    },
    ({ url, data, name, worker }) =>
      reply(async () => {
        if (data) {
          const bytes = Buffer.from(data, "base64");
          if (!name?.trim()) throw new Error("Give name with data, such as notes.pdf.");
          if (bytes.byteLength > 750_000) throw new Error("data takes 500 KB or less. Give a url, or leave both out, and the user picks the file in Yonder.");
          return keepFile(name, (path) => Bun.write(path, bytes));
        }
        if (url) {
          if (!/^https:\/\//i.test(url)) throw new Error("Give a public https link.");
          // A big download or video takes longer than a call of the Claude app (60 seconds). The work goes on, and the
          // same url later gives its result.
          let job = downloads.get(url);
          if (!job) {
            downloads.set(url, (job = downloadFile(url, name)));
            job.then(() => setTimeout(() => downloads.delete(url), 600_000), () => downloads.delete(url));
          }
          const done = await Promise.race([job, Bun.sleep(45_000)]);
          return done ?? { working: "The download or the keyframes take longer. Call send_file again with the same url in a minute to get the path." };
        }
        const w = worker ? await findWorker(worker) : undefined;
        toShow = [...toShow.filter(fresh), { id: nextShowId(), device: "phone", attach: w?.id ?? "" }];
        push("Pick a file", w ? `For ${pushName(w)}. Tap to open Yonder.` : "For a new agent. Tap to open Yonder.", w ?? (me && { owner: me.id }));
        return {
          asked: `Yonder sent a push to the phone of the user. When Yonder opens in the next 10 minutes, it shows ${w ? `the chat of agent ${w.num}` : "a new agent"} with the attach sheet.`,
          tell: "Tap the push, or open Yonder, then pick the file and send it with a message.",
        };
      }),
  );
  mcp.registerTool(
    "create_upload",
    {
      description:
        "Upload a file from your code tool to Yonder, for an agent: a video, a photo or a document of any size, such as a file that the user attached in the Claude app " +
        "(in /mnt/user-data/uploads). It gives a link for one file, for 2 hours, and the command for it. Run the command in your code tool (bash), with the path of the file: " +
        "curl -fsS https://mcp.yonder.so/<id>/upload/<token>/send.sh | bash -s -- /mnt/user-data/uploads/IMG_1472.mov " +
        "The script encrypts the file to the computer of the user (X25519 and AES-256), so Cloudflare and the relay cannot read it, and sends it in the background in parts with curl, 16 at a time. " +
        "The command shows the progress, such as 142/335 MB, for up to 60 seconds, so it ends before the time limit of the code tool. " +
        "When it says \"Still sending\", run the same command again, until it prints the result (a JSON with path and agent). " +
        "A run again only shows the progress, or starts the sender again when it stopped, and the sender sends only the missing parts. " +
        "Yonder then gives the file to worker with message. A video also gets its keyframes and the words of its sound, because an agent cannot watch a video; the original stays. " +
        "If the code tool cannot reach mcp.yonder.so, tell the user to allow that domain in the settings of the Claude app (Capabilities).",
      inputSchema: {
        worker: z.string().optional().describe("The agent that gets the file. Leave it out to start a new agent with message as its task"),
        message: z.string().optional().describe("What the agent must do with the file, in the words of the user"),
      },
    },
    ({ worker, message }) =>
      reply(async () => {
        const w = worker ? await findWorker(worker) : undefined;
        // With no relay, the link works only on this computer, such as for Claude Code here.
        const relayed = connectorAddress();
        const { token, until } = uploads.create(w?.id ?? "", message ?? "");
        const url = `${relayed ?? `http://127.0.0.1:${PORT}`}/upload/${token}`;
        return {
          command: `curl -fsS ${url}/send.sh | bash -s -- /path/of/the/file`,
          again: "When the command says Still sending, run the same command again until it prints the result.",
          ...(!relayed && { local: "Yonder is not connected to its relay now, so this link works only on the computer of Yonder." }),
          until,
          then: w ? `When the whole file is there, agent ${w.num} gets it with the message.` : "When the whole file is there, a new agent starts with the message and the file.",
        };
      }),
  );
  mcp.registerTool(
    "build_app",
    {
      description:
        "Start a new agent that builds an app (a page, an artifact) for the Canvas tab, such as the weather in two cities, a chart, a plan or a status of the work. " +
        "Use it when the user asks to see something as a page, a card, an app or an artifact, and it needs research or work. When it is ready, the page shows in the Canvas tab and in the chat of the agent, and the user opens it there. " +
        "For a small page that you can write yourself, call show_app. It returns at once, as start_worker.",
      inputSchema: {
        workspace: z.string().describe("The workspace name or id, or an absolute folder path. Empty: Yonder picks the workspace from the task, or the default folder of the user"),
        task: z.string().describe("What the page must show, in the words of the user"),
        name: z.string().describe('A title of two or three words, such as "Weather card"'),
        context,
        files,
        call,
        key,
      },
    },
    ({ workspace: project = "", task, name, context, files, call, key }) =>
      replyOnce(key, async () => {
        const rules =
          `Make the result an app for the phone of the user: one HTML file of 1 MB or less, with its CSS and scripts inside. ${screenNote()} ` +
          "When it is ready, call show_app of Yonder with your agent number, a title, the page and an icon: a small square SVG with a subtle CSS animation that shows what the app is. Then say in one sentence what it shows.";
        const prompt = withContext(`${task}\n\n${rules}`, context, files);
        const w = await startWorker({ project, task, name, owner: me?.id }, prompt);
        w.showOn = Date.now() < callUntil && callDevice ? callDevice : device || lastDeviceOf(me);
        save();
        logSent(call, w.num, prompt);
        return brief(w);
      }),
  );
  // A site of this computer by its label or by the name that the user gave it, with its pid (preview.scan).
  const siteNamed = async (name: string) => {
    const n = norm(name);
    // The Canvas tab names a site by the name of the user, the name from Haiku, or its port, such as ":5180".
    const port = /^:?(\d+)$/.exec(name.trim())?.[1];
    const named = (all: Site[]) =>
      all.find((x) => x.label === name.trim().toLowerCase()) ??
      all.find((x) => [canvas.site(x.label).name, canvas.site(x.label).auto].some((t) => !!t && norm(t) === n) || norm(x.label) === n || (!!port && String(x.port) === port));
    const site = named(await preview.recent()) ?? named(await preview.scan());
    if (!site) throw new Error(`No app has the name ${name}. The pages: ${canvas.list().map((a) => a.title).join(", ") || "none"}. The sites: ${(await preview.recent()).map((x) => x.label).join(", ") || "none"}.`);
    return site;
  };
  mcp.registerTool(
    "change_app",
    {
      description:
        "Rename an app of the Canvas tab, save it, unsave it, give it a new icon, or restore it from the archive. An app is a page that an agent made (an artifact), or a web site of this computer. " +
        "A saved app stays at the top of the Canvas tab and never goes to the archive by itself. A page that is not saved goes to the archive 7 days after its last version, with its files. " +
        "Call it when the user asks to rename, save, keep, pin, unsave or unpin an app, to give it a new icon (draw the icon yourself), or to restore or unarchive an app. " +
        "To change the page itself, message the agent that made it, or call show_app with its id.",
      inputSchema: {
        app: z.string().describe("The id of a page, its name, or the name of a site, such as yonder-landing"),
        title: z.string().max(80).optional().describe("A new name"),
        saved: z.boolean().optional().describe("True saves the app, false unsaves it"),
        archived: z.boolean().optional().describe("False restores an archived page to the Canvas tab"),
        icon,
      },
    },
    ({ app, title, saved, archived, icon }) =>
      reply(async () => {
        const a = canvas.find(app);
        if (a) {
          if (archived === false) canvas.restore(a.id);
          const c = canvas.change(a.id, { title, icon, saved });
          return { app: c.id, title: c.title, saved: !!c.saved, archived: !!c.archived };
        }
        const site = await siteNamed(app);
        const m = canvas.changeSite(site.label, { ...(title?.trim() && { name: title.trim().slice(0, 80) }), saved, icon });
        return { site: site.label, title: m.name ?? site.label, saved: !!m.saved };
      }),
  );
  mcp.registerTool(
    "remove_app",
    {
      description:
        "Remove an app from the Canvas tab: a page that an agent made, or a web site. Call it only when the user asks to delete, remove or archive that app. " +
        "A page goes to the archive of the Canvas tab with its versions and its files, and change_app with archived false or undo brings it back. " +
        "Set forever only when the user explicitly asks to delete the page forever or permanently: then its files go too. " +
        "An address that the user added goes from the list. " +
        "The row of a dev server hides until its server starts again, its tunnel closes, and the server keeps running.",
      inputSchema: {
        app: z.string().describe("The id of a page, its name, or the name of a site"),
        forever: z.boolean().optional().describe("True deletes the page and its files. Only when the user explicitly asks to delete it forever or permanently."),
      },
    },
    ({ app, forever }) =>
      reply(async () => {
        const a = canvas.find(app);
        if (a) {
          if (forever) canvas.remove(a.id);
          else canvas.archive(a.id);
          last = { tool: "remove_app", to: "", before: [] };
          return forever ? { deleted: a.title, undo: "The undo tool brings it back." } : { archived: a.title, undo: "change_app with archived false, or the undo tool, brings it back." };
        }
        const site = await siteNamed(app);
        if (site.url) return preview.remove(site.label);
        if (preview.status().open.some((o) => o.label === site.label)) await preview.stop(site.label);
        canvas.changeSite(site.label, { hidden: site.pid });
        return { removed: site.label };
      }),
  );
  // Only an agent asks the user: the voice and the Claude brain have a device or a call.
  // An agent asks on its row (askUser). A voice agent, such as Grok, the Claude call or the Claude app, has no row, so
  // it asks with the native sheet of the phone (useAbility). The phone tool has no confirm and no sheet.
  {
    mcp.registerTool(
      "ask_user",
      {
        description:
          "Ask the user on the screen of their phone, and wait for the answer: a yes or a no, a one-time code, a choice, a payment, or terms to accept. " +
          "The phone shows a sheet at once, or a push when Yonder is closed. Use it before a step that needs the user: a payment, terms, a 2FA code that came to the phone of the user, or a choice. " +
          "Kinds: yes-no; code (the user types a one-time code, which comes back in value); choice (give choices; the pick comes back in choice); " +
          "pay (a payment: give link, the payment page, such as the Stripe Checkout link of `vsb topup` or the approval_url of a Link spend request, and amount, and rows such as Shop and Item; " +
          "Pay opens the page on the device of the user, who pays there. A yes means only that the page opened, so check the result, such as with `vsb balance`. Never click Pay yourself); " +
          "terms (terms to accept: give link, the address of the terms; Face ID on the phone or Touch ID on the Mac; after a yes, click Agree in the Chrome of the user). Never put a password, a card number or a code into the ask. " +
          'It waits up to 10 minutes (5 for pay), and gives { answer: "yes" | "no" | "expired", value?, choice? }.',
        inputSchema: {
          agent: z.string().optional().describe("An agent: your agent number, as Yonder shows you to the user. A voice agent leaves it out"),
          kind: z.enum(["yes-no", "code", "choice", "pay", "terms"]),
          title: z.string().max(80).describe('A short title, such as "Renew yonder.so" or "Code for GitHub"'),
          text: z.string().max(400).optional().describe("One or two sentences: what you do after a yes"),
          rows: z.array(z.array(z.string().max(120)).length(2)).max(8).optional().describe('Pairs of a label and a value, such as [["Shop", "Namecheap"], ["Card", "Visa ·· 4242"]]'),
          amount: z.string().max(40).optional().describe('For pay: the amount with its currency, such as "$24.00"'),
          choices: z.array(z.string().max(80)).min(2).max(6).optional().describe("For choice: the options"),
          link: z.string().max(2000).optional().describe("For pay: the address of the payment page. For terms: the address of the terms"),
          minutes: z.number().min(1).max(10).optional().describe("How long the ask waits. The default is 10 minutes, and 5 for pay."),
        },
      },
      ({ agent, kind, title, text, rows, amount, choices, link, minutes }) =>
        reply(async () => {
          const w = ownAgent(agent);
          if (kind === "choice" && !choices?.length) throw new Error("A choice needs choices.");
          if (kind === "pay" && !amount) throw new Error("A payment needs an amount.");
          if (kind === "pay" && !link) throw new Error("A payment needs link, the address of its payment page, such as the link of vsb topup.");
          if (link && !/^https:\/\//.test(link)) throw new Error("The link must start with https://.");
          // A payment needs no Face ID in Yonder: Pay only opens its page, and the page of Stripe or Link asks the user.
          const faceId = kind === "terms";
          const until = Date.now() + (minutes ?? (kind === "pay" ? 5 : 10)) * 60_000;
          if (!w) {
            const sheet = {
              title, subtitle: text, amount, faceId, expires: until,
              rows: rows?.map(([label, value]) => ({ label, value })),
              code: kind === "code" ? {} : undefined,
              choices: choices?.map((c) => ({ id: c, title: c })),
              terms: link ? { title: kind === "pay" ? `Pay on ${new URL(link).host}` : title, url: link } : undefined,
              buttons: [{ id: "yes", title: kind === "terms" ? "Agree" : kind === "yes-no" ? "Yes" : "Done" }, { id: "no", title: kind === "yes-no" ? "No" : "Cancel", role: "cancel" }],
            };
            const a: Record<string, unknown> = await useAbility("sheet", sheet, device, brain, until - Date.now() + 5000, me).catch((e: Error) => (/no answer in/.test(e.message) ? { expired: true } : Promise.reject(e)));
            const answer = a.expired ? "expired" : a.button === "yes" ? "yes" : "no";
            logApproval(CONFIG, { kind, agent: 0, title, answer, device: device || "voice", faceId: faceId && answer === "yes" });
            return { answer, ...(typeof a.value === "string" && a.value && { value: a.value }), ...(typeof a.choice === "string" && a.choice && { choice: a.choice }) };
          }
          const a = await askUser(w, { tool: title, text: text ?? "", kind, title, rows: rows as [string, string][] | undefined, amount, choices, link, faceId, touchId: faceId && process.platform === "darwin", until }, signal);
          const answer = a.expired ? "expired" : a.allow ? "yes" : "no";
          logApproval(CONFIG, { kind, agent: w.num, title, answer, device: a.device, faceId: faceId && a.allow });
          return { answer, ...(a.value && { value: a.value }), ...(a.choice && { choice: a.choice }) };
        }),
    );
  }
  mcp.registerTool(
    "connect_claude",
    {
      description:
        "Connect the Claude app (on the phone, the web or the desktop) to Yonder, as a custom connector. Claude can then use the tools of Yonder. " +
        "It gives the address of the connector and a code of 6 digits that works one time, for 5 minutes. connected names the apps that are connected now. " +
        "Tell the user: in Claude, open Customize (Settings in an older app), then Connectors, then Add, then Add custom connector, and paste the address. Then type the code on the page that opens. " +
        "When that page opens, the code also comes to the phone as a push. " +
        "Read the code to the user digit by digit. revoke: true disconnects each Claude app instead, and gives no code.",
      inputSchema: {
        revoke: z.boolean().optional().describe("true to disconnect each Claude app"),
        code: z.boolean().optional().describe("false gives only the address and the connected apps, with no new code"),
      },
    },
    ({ revoke, code }) => reply(() => (revoke ? connector.revoke() : code === false ? connector.address() : connector.connect())),
  );
  mcp.registerTool(
    "copy_to_clipboard",
    {
      description:
        "Put text on the clipboard of this Mac, so that the user can paste it. Use it when the user says \"copy that\" or \"copy the command\". " +
        "Give the exact text, such as the command from the result of an agent, with no quotes or words around it. " +
        "Universal Clipboard also gives it to the iPhone of the user.",
      inputSchema: { text: z.string().describe("The exact text to copy") },
    },
    ({ text }) =>
      reply(async () => {
        await copy(text);
        return { copied: text.length };
      }),
  );
  mcp.registerTool(
    "preview",
    {
      description:
        "Open, share, list or stop a web site of this Mac, such as the dev server of an agent or a workspace, on the phone or on any device, through the private tunnel of Yonder, at a private HTTPS address that only the user can open. The sites show in the Canvas tab. " +
        "open: show the site to the user. Call it when the user asks to see, open or preview the site of an agent or a workspace (\"show me the site of agent 3\"). " +
        "share: put a link for another person on the clipboard, for some minutes. stop: close a preview, so that it is not open outside the Mac (\"close the preview of sundial\", \"turn off the tunnel of sundial\"). list: the sites of the Canvas tab: the web servers of the agents that are not closed, the open and the starred ones, and the addresses that the user added, each with its `label`, its `name` or `auto` (the name that the user sees), and `open` for each one that is open outside the Mac. Each other server of the Mac does not show. " +
        "add: tunnel any address that the user names, such as localhost:3000, http://10.0.0.12:8080 or example.com, with `url`. It shows in the Canvas tab and its tunnel opens. open with `url` adds the address the same way and also shows it to the user (\"open localhost 3000 on my phone\", \"open example.com in the tunnel\"). " +
        "stop turns the tunnel of a site off and keeps its row (\"disable localhost-3000\"); open turns it on again. remove: take an added address out of the Canvas tab (\"remove localhost 3000 from the tunnel list\"). stop and remove also take `url`. " +
        "clean: take each site whose tunnel is off and that the user did not save out of the Canvas tab in one call (\"clean up the tunnels\", \"clear the unused tunnels\"). An added address goes, and the row of a dev server hides until its server starts again. The servers keep running. " +
        "An agent does not open a site: open with url gives it back unopened. Name the URL, such as http://localhost:5173/about, in your final message, and the user opens it from the chat. " +
        "When no web server runs, start or message the agent to start its dev server. " +
        "The first open on the phone, and the first share, of a project needs a yes from the user: the result then says what to ask.",
      inputSchema: {
        action: z.enum(["open", "share", "stop", "list", "add", "remove", "clean"]),
        worker: z.string().optional().describe("A site name from list (such as yonder-landing), the agent number, the worker id, or a workspace name"),
        port: z.number().optional().describe("The port of the server, only when the user names one"),
        url: z.string().optional().describe("Any address that the user names, such as localhost:3000, 3000, http://10.0.0.12:8080 or example.com. With open or share it adds the address first. With stop or remove it names the site"),
        minutes: z.number().optional().describe("With share: how long the link works. Leave it out for 60"),
        mac: z.boolean().optional().describe("The Yonder app fills this in."),
        confirmed: z.boolean().optional().describe("Set it to true only after the user said yes to the question that the last result asked"),
      },
    },
    ({ action, worker: given, port: givenPort, url, minutes, mac, confirmed }) =>
      reply(async () => {
        const full = url && (/^https?:\/\//i.test(url) ? url : `http://${url}`);
        // An agent, or another program on this Mac, never opens a site or its tunnel by itself: the user opens it from the
        // link in the chat. Else the site covers the work of the user in Yonder. The Claude call still opens one.
        if (action === "open" && full && !device && !brain)
          return { opens: false, note: "Yonder does not open a site by itself. Name its URL in your final message: the chat shows it as a link, and the user opens it there." };
        if (action === "open" && full && !device && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+/i.test(full)) {
          const s = preview.sites().find((x) => !x.url && x.port === Number(new URL(full).port));
          const meta = s && canvas.site(s.label);
          const on = lastDeviceOf(me);
          toShow = [...toShow.filter(fresh), { id: nextShowId(), device: on, url: full, ...(s && { title: meta?.name ?? meta?.auto ?? s.title, ...(s.frame === false && { frame: false as const }) }) }];
          return { opens: full, on: on === "mac" ? "the Mac" : "the phone" };
        }
        if (!state.preview && action !== "stop" && action !== "remove") throw new Error("The Tunnel is off in the Settings of Yonder. Tell the user to turn it on there first.");
        if (action === "add") return preview.add(url ?? String(givenPort ?? ""));
        // The sites that nobody uses, each as remove_app takes one: its tunnel is off and the user did not save it. So
        // an agent can clean up the tunnels.
        if (action === "clean") {
          const open = new Set(preview.status().open.map((o) => o.label));
          const cleaned: string[] = [];
          const kept: string[] = [];
          for (const s of await preview.scan()) {
            if (s.pid && canvas.site(s.label).hidden === s.pid) continue;
            if (open.has(s.label) || canvas.site(s.label).saved) kept.push(s.label);
            else (s.url ? preview.remove(s.label) : canvas.changeSite(s.label, { hidden: s.pid }), cleaned.push(s.label));
          }
          return { cleaned, kept };
        }
        // An address names its site: open and share add it first, so that one call shows any address to the user.
        const worker = !url ? given : action === "open" || action === "share" ? (await preview.add(url)).added : labelOf(url);
        const port = url ? undefined : givenPort;
        if (action === "remove") return preview.remove(worker ?? "");
        if (action === "list") {
          // Only the sites that the user needs: its tunnel is open, the user starred it, the user or an agent added its
          // address, or it is a site of an agent that is not closed (sitesOf). Each other server of the Mac, such as a
          // server of another program, does not show, because those sites have no meaning for the user.
          const open = new Set(preview.status().open.map((o) => o.label));
          const all = await preview.scan();
          const agents = state.workers.filter((w) => w.status !== "closed").sort((a, b) => b.updatedAt - a.updatedAt);
          const owner = new Map<string, Worker>();
          for (const w of agents) for (const s of sitesOf(w, all)) if (!owner.has(s.label)) owner.set(s.label, w);
          const sites = all.filter(
            (x) => (!x.pid || canvas.site(x.label).hidden !== x.pid) && (open.has(x.label) || !!canvas.site(x.label).saved || !!x.url || owner.has(x.label)),
          );
          const started = startTimes(sites.map((x) => x.pid).filter(Boolean));
          // `seen`: the start of its server, else the first time the bridge saw it, for the order of the Canvas tab.
          // `num`: the newest agent of the site, for the second line of its row.
          return sites.map(({ pid, ...site }) => {
            const by = agents.filter((w) => sitesOf(w, [site]).length);
            const { name, auto, saved, icon } = canvas.site(site.label);
            if (!name && !auto) nameSite(site, by);
            return { ...site, open: open.has(site.label), seen: started.get(pid) ?? canvas.seen(site.label), ...(by[0]?.num && { num: by[0].num }), ...(name && { name }), ...(auto && { auto }), ...(saved && { saved }), ...(icon && { icon }) };
          });
        }
        // The site of an agent: the server in its folder. Else the newest worker of a project, or the project itself.
        // A preview closes by its name, also when its server no longer runs.
        if (action === "stop" && worker && preview.status().open.some((o) => o.label === worker)) return preview.stop(worker);
        let path: string | undefined;
        let chosen: { label: string; port: number } | undefined;
        if (worker && !port) {
          // A site by its name, such as yonder-landing. Else an agent by its id, number or name (the Preview button gives
          // the id). Else a project, whose site is the server in its folder.
          // A site by its name, such as a tap in the Canvas tab, uses the last scan and does not wait for the sessions
          // of Claude Code. An agent or a project scans again, because its server can be new.
          let sites = await preview.recent();
          if (!sites.some((s) => s.label === worker.toLowerCase().trim())) sites = await preview.scan();
          const num = Number(worker.match(/^\s*(?:agent\s*|#)?(\d+)\s*$/i)?.[1]);
          const named = sites.find((s) => s.label === worker.toLowerCase().trim());
          const all = named ? [] : await allSessions();
          const w = named ? undefined : all.find((x) => x.id === worker) ?? all.find((x) => num > 0 && x.num === num) ?? all.find((x) => norm(x.name) === norm(worker));
          const site = named ?? (w && siteOf(w, sites));
          // The sites that run, so that Grok can pick one at once.
          if (w && !site)
            throw new Error(`Agent ${w.num || w.id} runs no web server that Yonder can see. These sites run now: ${sites.map((s) => s.label).join(", ") || "none"}. Call preview again with one of them as the worker, or ask the agent to start its dev server and to name its URL.`);
          // A named site stays that site: an added address can share its port with a server of a project.
          if (site) chosen = site;
          else path = findProject(worker).path;
        }
        if (action === "stop") return preview.stop(chosen?.label ?? (port ? String(port) : (worker ?? "")));
        const pick = (all: Site[]) =>
          all.find((s) => s.label === chosen?.label) ?? all.find((s) => (port ? s.port === port : s.path === path || s.path.startsWith(`${path}${sep}`)));
        // A server that started after the last scan is not in it, so a miss scans again.
        const site = pick(await preview.recent()) ?? pick(await preview.scan());
        // A tap on a localhost link gives the port. "Ask the agent…" is for the voice agent. The phone shows it with the
        // word of the user, such as "Ask the task…", under a link whose server stopped.
        if (!site) throw new Error(port ? `Nothing runs on port ${port}.` : "No web server runs there. Ask the agent to start its dev server.");
        // On the Mac, the site opens in the browser of the Mac, from localhost: no tunnel is necessary.
        if (action === "open" && mac) {
          Bun.spawn([OPEN, site.url ?? `http://localhost:${site.port}`]);
          return { opened: site.label, title: site.title, port: site.port, where: "the browser of the Mac" };
        }
        // Each time that the tunnel of a site is closed, the user says yes before Yonder opens it. Else a
        // link in a chat opens a closed tunnel again with no question. An address that the user typed needs no yes: the user added it to tunnel it.
        if (preview.status().on && !site.url && !preview.status().open.some((o) => o.label === site.label) && !confirmed)
          return {
            confirm: { project: site.project, label: site.label, port: site.port, title: site.title },
            note: `The tunnel of ${site.project} is closed. Ask the user: "Open ${site.project}, port ${site.port}, through the private tunnel of Yonder?" Call preview again with confirmed true only after the user says yes.`,
          };
        const opened = await preview.open({ label: site.label, minutes: action === "share" ? (minutes ?? 60) : undefined });
        if (action === "open") return opened;
        // A share link goes to the clipboard, and never to the voice agent. Universal Clipboard gives it to the iPhone.
        await copy(opened.url);
        return { shared: opened.label, title: opened.title, minutes: minutes ?? 60, copied: true };
      }),
  );
  mcp.registerTool(
    "browser",
    {
      description:
        "Do one quick step in the user's Chrome with browser-harness: read the tab that the user sees (its address, title and text), " +
        "list the open tabs, or open a web page in a new tab. Use it when the user says \"open Google\" or asks what is on the current tab. " +
        "For a task of more steps in the browser, such as a checkout, a flight search or a form, start a worker instead. Workers know browser-harness.",
      inputSchema: {
        action: z.enum(["read", "tabs", "open"]).describe("read: the tab that the user sees. tabs: all the open tabs. open: the url in a new tab"),
        url: z.string().optional().describe("With open: the address, such as google.com, or a search URL such as https://www.google.com/search?q=..."),
      },
    },
    ({ action, url }) =>
      reply(async () => {
        if (action === "open" && !url) throw new Error("To open a page, give its url.");
        // browser-harness makes each tab that it attaches look visible, so the tab that the user sees comes from
        // Chrome itself. macOS asks one time if Yonder can control Chrome. Without that, or while that question
        // waits on the screen, read takes the first tab. Linux and Windows have no AppleScript, so read takes the first tab there too.
        const front =
          action === "read" && MAC
            ? (await new Response(Bun.spawn(["osascript", "-e",
                'if application "Google Chrome" is running then tell application "Google Chrome" to get URL of active tab of front window'],
              { stderr: "ignore", timeout: 5_000 }).stdout).text()).trim()
            : "";
        const args = { action, url: url && (/^https?:\/\//i.test(url) ? url : `https://${url}`), front };
        // Yonder does not install browser-harness by itself: the user installs it in the Tools section of the Settings.
        const harness = locate("browser-harness") ?? locate("browser-harness.exe");
        if (!harness) throw new Error("browser-harness is not installed. Tell the user to install it in Settings, Tools.");
        const run = Bun.spawn([harness], {
          stdin: new TextEncoder().encode(BROWSER),
          stderr: "pipe",
          env: { ...env, YONDER_BROWSER: JSON.stringify(args) },
          timeout: 20_000,
        });
        const [out, err] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);
        const last = out.trim().split("\n").pop() ?? "";
        let result: Record<string, unknown>;
        try {
          result = JSON.parse(last);
        } catch {
          throw new Error(`browser-harness failed: ${(err.trim() || out.trim()).slice(-300) || "no output"}`);
        }
        if (result.error) throw new Error(`browser-harness: ${result.error}`);
        return result;
      }),
  );
  // 1Password for the agents (docs/secrets.md). Not for the voice or the Claude brain, which have a device or a call.
  if (!device && !brain) {
    mcp.registerTool(
      "use_secret",
      {
        description:
          "Use a login or a key from the user's 1Password, with a yes from the user on the phone, or with Touch ID in Yonder on the Mac. You never get the value. " +
          "run: a shell command that runs in your folder with the secrets in env or on stdin, as `op run` does; you get its output with each value hidden. " +
          "fill: fields of the page in the tab of browser-harness that you control, and the secret to type into each; the tab must be on a website of the item. " +
          // No vault name in this text: the word of the user for an agent (`swap`) would also change a vault named Agent.
          "A secret is a reference op://<vault>/<item>/<field>, such as op://<vault>/GitHub/token, or the field \"one-time password?attribute=otp\" for a code. " +
          "list_secrets gives the vaults and the items. When two items have the same title, use the ID of the item in place of its title. " +
          "The call waits until the user answers, 10 minutes at most. A yes lasts some minutes for the same items and use, " +
          "so ask for all the secrets of a step in one call. Use this in place of `op`, which needs the user at the Mac.",
        inputSchema: {
          why: z.string().describe("What you need it for, in a few words. The card on the phone shows it."),
          run: z.string().optional().describe("A shell command, such as `gh release create v1.2`"),
          env: z.record(z.string(), z.string()).optional().describe("With run: variable names and their secrets, such as { \"GITHUB_TOKEN\": \"op://Agent/GitHub/token\" }"),
          stdin: z.string().optional().describe("With run: one secret for the standard input of the command, such as for `metaads auth login`"),
          fill: z.record(z.string(), z.string()).optional()
            .describe("CSS selectors of fields and the secret for each, such as { \"input[name=username]\": \"op://Agent/Instagram/username\", \"input[name=password]\": \"op://Agent/Instagram/password\" }"),
          minutes: z.number().int().min(0).max(60).optional().describe("How long the yes lasts for more uses with no new card. 10 if left out, 0 for one use"),
        },
      },
      (args, extra) => reply(() => useSecret(caller, args, extra.signal)),
    );
    mcp.registerTool(
      "list_secrets",
      {
        description:
          "The 1Password items that use_secret can use, with no values: vault, title, ID, category and websites. The list is from the last yes on the phone. " +
          "connected is false when the user has not pasted the token of the service account on the phone yet.",
        inputSchema: {},
      },
      () => reply(() => ({ ...vault.status(), list: vault.items() })),
    );
  }
  mcp.registerTool(
    "undo",
    {
      description:
        "Undo the last close, complete or remove of agents, or the last archive or delete of an app, from the app, from the voice or from any other client. Each agent goes back to its tab as it was, and an app comes back with its versions, " +
        "and an agent that ran continues its turn. A removed agent cannot come back. " +
        "Call it when the user asks to undo that, to take it back, or to reopen the agents that were just closed or completed.",
      inputSchema: { check: z.boolean().optional().describe("True: change nothing, and only tell what an undo takes back.") },
    },
    ({ check }) =>
      reply(async () => {
        // An archived or deleted app comes back with its versions (remove_app).
        if (last?.tool === "remove_app") {
          const r = canvas.removed();
          if (check) return { tool: "remove_app", app: r?.a.title, forever: !!r?.forever, agents: [] };
          last = undefined;
          const a = canvas.undo();
          if (!a) throw new Error("There is nothing to undo.");
          return { tool: "undo", app: a.title };
        }
        // An agent that changed again after the close (a message made it run) stays as it is now.
        const back = (last?.before ?? []).filter(({ w }) => last!.tool === "remove_worker" || (state.workers.includes(w) && w.status === last!.to));
        if (!last || !back.length) throw new Error("There is nothing to undo.");
        const agents = back.map(({ was }) => ({ num: was.num, name: was.name, status: was.status }));
        if (check) return { tool: last.tool, agents };
        if (last.tool === "remove_worker") throw new Error("A removed agent cannot come back.");
        last = undefined;
        for (const { w, was } of back) {
          // The close stopped its turn, so it continues with a new turn.
          Object.assign(w, was, was.status === "running" && { status: "waiting" });
          keepNum(w);
          save();
          if (was.status === "running") await inTurn(w.id, () => sendQueue(w, [...(w.queue ?? []), "Continue."]));
        }
        sessionsAt = 0; // Read the sessions again on the next call.
        return { tool: "undo", agents };
      }),
  );
  // How the voice talks (TALK). The voice changes the file when the user asks for another way of talking, and the
  // Settings show no field for it: Yonder changes it itself, when the user asks.
  mcp.registerTool(
    "change_talk",
    {
      description:
        "Change how you talk in the calls: the rules of your section \"Voice & Communication Style\", which stay for all the next calls. " +
        "Call it when the user asks you to talk in another way from now on, such as shorter, with more detail, in other words, or to stop saying something. " +
        "Give add for a new rule, and remove with words of an existing rule to take it out. Follow the change at once.",
      inputSchema: {
        add: z.string().optional().describe('A new rule in one short sentence, such as "Never say great."'),
        remove: z.string().optional().describe("Words of the rule to take out, as in your section, at least 8 letters."),
      },
    },
    ({ add, remove }) =>
      reply(async () => {
        let lines = readTalk().split("\n");
        const words = remove?.trim().toLowerCase() ?? "";
        if (words) {
          if (words.length < 8) throw new Error("Give more words of the rule to take out.");
          const kept = lines.filter((l) => !l.toLowerCase().includes(words));
          if (kept.length === lines.length) throw new Error(`No rule has the words "${remove}".`);
          lines = kept;
        }
        if (add?.trim()) lines.push(`- ${add.trim().replace(/^-\s*/, "")}`);
        writeFileSync(TALK, `${lines.join("\n").trim()}\n`);
        return { saved: true };
      }),
  );
  mcp.registerTool(
    "close_worker",
    {
      description:
        "Close an agent (a worker): stop its session, also while it runs. The worker moves to the Closed tab, and message_worker continues it later. " +
        "For a terminal or background session, this ends its Claude Code process. Call it when the user asks to stop or close an agent. " +
        "\"Close\", \"close it\" or \"done\" is a close with NO done, from each status and each tab: a running, waiting or done agent moves to the Closed tab. " +
        "With done, it marks the agent as completed instead: it stops its session if it runs or waits, and moves it to the Done tab with the status done. " +
        "Set done ONLY when the user says \"mark it done\", \"mark it as completed\" or \"completed\". A finished agent is on the Done tab already. " +
        "For a group (\"close the completed ones\", \"mark the done ones as completed\"), give the tab and the workspace, not the worker: the bridge selects the agents.",
      inputSchema: {
        worker: worker.optional(),
        tab,
        workspace: groupProject,
        done: z.boolean().optional().describe('True marks it as completed, on the Done tab, in place of the Closed tab. Only for "mark it done" or "completed", never for "close"'),
        call,
      },
    },
    ({ worker, tab, workspace: project, done, call }) =>
      reply(async () => {
        if (done) return complete(worker, tab, project);
        const closed = [];
        last = { tool: "close_worker", to: "closed", before: [] };
        // Who closes (closedBy): the voice sends the ID of its call, the app window and a phone have a device, and an agent
        // calls from the address in its --mcp-config.
        const from = byCaller(caller);
        const by = call || brain ? "voice" : device ? "you" : (from?.num ?? "mcp");
        for (let w of await targets(worker, tab, project, me)) {
          // A session that Yonder did not start ends, then becomes a worker (adopt), so it shows on the Closed tab. Else
          // such a close stops nothing, says "done" with no error, and the agent stays on the Done tab.
          if (w.kind === "terminal") process.kill(w.pid!, "SIGTERM");
          else if (w.kind === "background" && (await control("stop", w)) && inRoster(w.sessionId))
            throw new Error(`Claude Code cannot stop ${w.project} (${w.id}), so it stays open.`);
          if (w.kind) w = adopt(w);
          last.before.push({ w, was: { ...w } });
          await closeOne(w, w === from, by);
          closed.push(w);
        }
        sessionsAt = 0; // Read the sessions again on the next call.
        return !tab ? brief(closed[0]) : { closed: closed.map((w) => w.num) };
      }),
  );
  // close_worker with done. The undo of the app still names it complete_worker (`last`).
  async function complete(worker?: string, tab?: (typeof TABS)[number], project?: string) {
        const completed = [];
        last = { tool: "complete_worker", to: "done", before: [] };
        for (const w of await targets(worker, tab, project, me)) {
          if (!w.kind) last.before.push({ w, was: { ...w } });
          // A session that Yonder did not start leaves the lists when it stops, so it cannot show as completed.
          if (w.kind && worker) own(w);
          if (w.kind) continue;
          if (w.status === "running" || w.status === "waiting") await halt(w);
          // The user marked it, so it needs nothing from the user and loses its dots.
          Object.assign(w, { status: "done", activity: "", unread: false, attention: false, answered: false, marked: true, queue: undefined, closeWhenDone: undefined, updatedAt: Date.now() });
          save();
          completed.push(w);
        }
        sessionsAt = 0; // Read the sessions again on the next call.
        return !tab ? brief(completed[0]) : { completed: completed.map((w) => w.num) };
  }
  mcp.registerTool(
    "remove_worker",
    {
      description:
        "Remove or delete an agent (a worker) or a background session: stop it, and take it off all the lists, also off the background sessions of Claude Code (`claude agents`). " +
        "The conversation stays saved in Claude Code. Call it only when the user asks to remove or delete an agent. " +
        "For a group (\"delete the closed ones\"), give the tab and the workspace, not the worker: the bridge selects the agents. " +
          "For the group in all the workspaces, give only the tab.",
      inputSchema: { worker: worker.optional(), tab, workspace: groupProject },
    },
    ({ worker, tab, workspace: project }) =>
      reply(async () => {
        // All the agents of a group at once: each `claude stop` and `claude rm` takes about half a second,
        // so one at a time, a long Closed tab emptied over half a minute.
        const removed = await targets(worker, tab, project, me);
        last = { tool: "remove_worker", to: "", before: removed.map((w) => ({ w, was: { ...w } })) };
        await Promise.all(removed.map(async (w) => {
          if (w.kind === "terminal") throw new Error(`${w.project} (${w.id}) is a terminal session, so Yonder cannot remove it. Close it instead.`);
          if (w.kind) await control("stop", w);
          else await halt(w);
          // The CLI keeps its own sessions. Yonder deletes its logs of the turns.
          if (w.cli && CLIS[w.cli]?.acp && w.sessionId) await acp.close(w.sessionId);
          if (w.cli) for (const base of w.runs ?? []) for (const ext of ["jsonl", "err", "txt"]) rmSync(`${base}.${ext}`, { force: true });
          else await Promise.all([w.sessionId, ...(w.past ?? [])].map((id) => control("rm", w, id)));
          if (!w.kind) {
            for (const ext of ["in", "jsonl", "err"]) rmSync(join(LOGS, `${w.id}.${ext}`), { force: true });
            state.workers = state.workers.filter((x) => x !== w);
            save();
          }
        }));
        sessionsAt = 0; // Read the sessions again on the next call.
        return !tab
          ? { removed: removed[0].id, project: removed[0].project, ...(!removed[0].cli && { resume: `claude --resume ${removed[0].sessionId}` }) }
          : { removed: removed.map((w) => w.num), note: "A removed agent cannot come back to the lists." };
      }),
  );
  // The wiki has one file for each part in docs/wiki/, and index.md lists them, so a call sends one part and not the
  // whole wiki. The topics in the description come from the index, so Grok can pick a part with no second call.
  const wiki = join(ROOT, "docs/wiki");
  const topics = SOURCE
    ? readFileSync(join(wiki, "index.md"), "utf8").replace(/\n {2}/g, " ").match(/^- \[[a-z-]+\]\([a-z-]+\.md\): .*$/gm)?.map((l) => l.replace(/^- \[([a-z-]+)\]\([^)]+\): /, "$1: ")) ?? []
    : [];
  mcp.registerTool(
    "about_yonder",
    {
      description:
        "The wiki of Yonder: what it is, what it can do, how it works, and the newest changes. " +
        "Call it before you answer a question about Yonder itself. With no topic, it gives the list of the parts and the newest changes. " +
        "With a topic, it gives the list and that part." +
        (topics.length ? ` The topics:\n${topics.join("\n")}` : ""),
      inputSchema: { topic: z.string().optional().describe("The part of the wiki, such as voice-agent or phone. Leave it out for the newest changes.") },
    },
    // Read at each call, so that each change to the wiki is live at once, also before a rebuild.
    // The commits tell if the source is newer than the running app.
    ({ topic }) => {
      if (!SOURCE) return { content: [{ type: "text", text: readFileSync(README, "utf8") }] };
      const index = readFileSync(join(wiki, "index.md"), "utf8");
      if (topic) {
        const file = join(wiki, `${topic}.md`);
        // Only a plain name, so that a topic cannot read a file outside the wiki.
        const text = /^[a-z-]+$/.test(topic) && topic !== "index" && existsSync(file)
          ? `${index}\n\n${readFileSync(file, "utf8")}`
          : `${index}\n\nThe wiki has no topic "${topic}". Call about_yonder again with a topic of the list above.`;
        return { content: [{ type: "text", text }] };
      }
      const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: ROOT }).stdout.toString().trim();
      const text =
        `${index}\n\nSource: version ${version(ROOT)}, commit ${git("rev-parse", "--short", "HEAD")}. ` +
        "If the running app has an older version, the newer changes need a rebuild.\n\n" +
        `Newest changes:\n${git("log", "-20", "--format=- %s")}`;
      return { content: [{ type: "text", text }] };
    },
  );
  mcp.registerTool(
    "workspace_overview",
    {
      description:
        "The gist of a workspace: its description, the file tree of its folder, two levels deep, and its README. " +
        "Call it when the user asks what a workspace is, what it does or what is in it, before you start an agent for that.",
      inputSchema: { workspace: z.string().describe("The workspace name, id or folder") },
    },
    async ({ workspace: project }) => {
      try {
        const { name, path, home, description } = findProject(project);
        if (home === false) return { content: [{ type: "text", text: `Workspace ${name}, with no folder: ${description}` }] };
        const readme = readdirSync(path).find((f) => /^readme(\.(md|txt|rst))?$/i.test(f)) ?? readdirSync(path).find((f) => f === "CLAUDE.md");
        const text =
          `Workspace ${name} at ${path}.${description ? `\n\n${description}` : ""}\n\nFile tree:\n${tree(path).join("\n")}\n\n` +
          (readme ? `${readme}:\n${readFileSync(join(path, readme), "utf8").slice(0, 8000)}` : "The folder has no README.");
        return { content: [{ type: "text", text }] };
      } catch (e) {
        return { content: [{ type: "text", text: (e as Error).message }], isError: true };
      }
    },
  );
  mcp.registerTool(
    "rebuild_app",
    {
      description:
        "Get the newest version of Yonder. A change to the screen only builds the front end again, and the Mac app and the phone reload it in a few seconds. " +
        "A change to the native Mac app rebuilds and reinstalls it, in about a minute. The current call ends when you stop talking, on the Mac and on the phone. " +
        "The app opens with no call. Call it only when the user asks to rebuild, reload, update or restart Yonder or the app, or to get its latest version. " +
        "When the result has upToDate, nothing is new: tell the user that Yonder is up to date, with the version. Then the call stays on.",
      inputSchema: { build: z.string().optional().describe("The Yonder app fills this in. Leave it out.") },
    },
    ({ build }) =>
      reply(() => {
        if (!SOURCE) {
          if (!LINUX && !WINDOWS)
            throw new Error("This copy of Yonder is a download of the Mac app. It checks yonder.so every 10 minutes and installs a new version by itself, when the window is not in front. Until then the call button shows 'Update available', and a click on it installs the new version at once.");
          if (updating) return { started: true, reload: "an update of Yonder runs now" };
          return update(true).then((to) => (to ? { started: true, version: to, reload: "the bridge restarts into the new version in about a minute" } : { upToDate: true, version: readFileSync(join(ROOT, "version"), "utf8").trim() }));
        }
        if (rebuild?.exitCode === null) throw new Error("A rebuild of Yonder runs now.");
        if (frontBuild?.exitCode === null && !shellChanged()) return { started: true, reload: "the new screen builds now, and the app loads it in a few seconds" };
        // Nothing is new when dist/ has the screen of the newest commit, the Mac app needs no rebuild, and the caller
        // runs dist/. A commit that changed no part of the screen does not build it again (`builtFront`).
        const dist = join(ROOT, "dist", "build.txt");
        const latest = existsSync(dist) ? readFileSync(dist, "utf8") : "";
        if (!shellChanged() && builtFront()) {
          if (!build || build === latest) return { upToDate: true, version: latest };
          return { started: false, reload: `version ${latest} is built, so the app loads it when the call ends` };
        }
        if (!shellChanged()) {
          // Only the front end (and maybe the bridge) changed. The app reloads when /front gives the new build.
          rebuild = spawnBuild(true, REBUILD_LOG);
          rebuild.exited.then((code) => {
            if (!code && !Bun.spawnSync(["git", "diff", "--quiet", STARTED, "HEAD", "--", "bridge"], { cwd: ROOT }).success) restartBridge();
          });
          return { started: true, reload: "only the front end changed, so the app reloads in a few seconds", log: REBUILD_LOG };
        }
        // install-app quits the app, so the bridge runs it in its own process group.
        // A failed build does not quit the app. Then the old app keeps running.
        rebuild = Bun.spawn(
          ["/bin/sh", "-c", `bun run install-app > '${REBUILD_LOG}' 2>&1 || open -a Yonder`],
          { cwd: ROOT, env, detached: true, stdio: ["ignore", "ignore", "ignore"] },
        );
        return { started: true, log: REBUILD_LOG };
      }),
  );
  mcp.registerTool(
    "restart_bridge",
    {
      description:
        "Restart the bridge with its newest source. The app and the call keep running, and the workers keep working. " +
        "The bridge tools are back after about 2 seconds. Call it when the user asks to rebuild or restart the bridge, or after a change to the source of the bridge.",
      inputSchema: {},
    },
    () =>
      reply(() => {
        if (rebuild?.exitCode === null) throw new Error("A rebuild of Yonder runs now, and it restarts the bridge too.");
        restartBridge();
        return { restarting: true, back_in_seconds: 2 };
      }),
  );
  // The numbers of the weekly percent in the title bar (claudeUsage, as /claude-usage), in the words of call_status, so
  // each voice agent and each other MCP client can say them. The plan does not split the usage by agent, so the running
  // agents come with their context use.
  mcp.registerTool(
    "get_usage",
    {
      description:
        "The plan usage of the active profile, the same numbers as the weekly percent in the title bar of Yonder. " +
        "For Claude Code this is /usage in Claude Code: the percent used of the week and of the current 5-hour session, and when each resets. " +
        "For Grok this is /usage in Grok: the percent used of the week, and when it resets. " +
        "usage_of names the profile. usage gives its meters. " +
        "It also gives the running agents with the most context in use, with their model and effort. " +
        "Call it when the user asks about the usage, the limits, the weekly or session limit, how much is left, when it resets, or which agents use the most.",
      inputSchema: {},
    },
    () =>
      reply(async () => {
        const plan = await planUsage();
        const lines = (limits?: { name: string; percent: number; resets_at: string | null }[]) =>
          limits?.map((l) => `${l.name}: ${l.percent}% used${l.resets_at ? `, resets ${resets(l.resets_at)}` : ""}`);
        const running = state.workers
          .filter((w) => w.status === "running" && w.num && !w.parent)
          .sort((a, b) => (b.context?.used ?? 0) - (a.context?.used ?? 0))
          .slice(0, 5)
          .map((w) => ({ num: w.num, name: w.name, project: w.project, model: w.model ?? (w.cli ? undefined : MODEL), effort: w.effort, context: w.context }));
        return {
          usage_of: plan.name,
          usage: lines(plan.limits) ?? `Not read: ${plan.error ?? "loading"}`,
          ...(plan.cli === "claude" && {
            claude_code_usage: lines(plan.limits) ?? `Not read: ${plan.error ?? "loading"}`,
            claude_code_usage_read: plan.at ? `${Math.round((Date.now() - plan.at) / 60_000)} minutes ago${plan.error ? `. The last check failed: ${plan.error}` : ""}` : undefined,
          }),
          running,
        };
      }),
  );
  mcp.registerTool(
    "customize",
    {
      description:
        "Change the look, the style or the layout of the Yonder app on the phones and the Mac window of this computer: its screen, the default (\"yonder\"), a sample (\"dashboard\", \"big\" for Big button, \"terminal\", \"omarchy\", \"playful\", \"duet\" or \"grok-bot\"), or a screen of the user's own in ~/.config/yonder/ui/<name>/. " +
        "list: the samples, the screens of the user with their versions, and the screen in use. use: show a screen on the phones and the Mac window in about 10 seconds (a name, or name@version for one version). " +
        "reset: back to the default screen. fork: copy a sample or a screen into a new screen of the user's own (\"My Terminal\"), and use it. versions: the versions of a screen of the user, the newest first. " +
        "change: the one step for each change of the look, the theme or the layout, with the words of the user, such as \"make the buttons bigger\" or \"the terminal one, but with green text\". " +
        "It changes the screen in use, or the screen that you give. When that screen is a sample or the default, change forks it first into a screen of the user, because a sample never changes. Then an agent changes that screen, and the phones show the new version when it is ready. Each old version stays, so use with name@version goes back. " +
        "new: build a new screen from the words of the user, such as \"a screen with only one chat\": an agent starts in a new screen folder and shows the screen when it is ready. " +
        "delete: delete a screen of the user with all its versions; the default screen shows when it was in use. " +
        "import: make a folder on this computer or a Git URL (from) a screen of the user; the folder stays the source, and each change of it reaches the phones in seconds. Import only what the user trusts: its build runs on this computer. " +
        "rename: give a screen of the user (or the screen in use) the new name in words; a sample becomes a screen of the user first. " +
        `The agents that build a screen use the skill yonder-screens, also at http://127.0.0.1:${PORT}/ui?guide. ` +
        "Call it only when the user asks to see, try, change, undo or reset the screen, the style or the layout of the app. For light mode, dark mode or the theme of the system, call set_theme.",
      inputSchema: {
        action: z.enum(["list", "use", "reset", "fork", "versions", "new", "import", "change", "delete", "rename"]),
        screen: z.string().optional().describe("The sample or the screen of the user, such as \"terminal\", \"my-chat\" or \"my-chat@2\". Fork, versions and change take the screen in use when it is empty. For import, the name of the new screen (optional)."),
        words: z.string().optional().describe("For new and change: what the user wants, in their words. For rename: the new name."),
        from: z.string().optional().describe("For import: the folder (such as ~/Sites/my-front) or the Git URL. For new: the sample to start from, \"dashboard\" when empty."),
      },
    },
    ({ action, screen, words, from }) =>
      reply(async () => {
        const id = screen?.trim() || "";
        if (action === "new") {
          if (!words?.trim()) throw new Error("Give the words of the user for the new screen.");
          const n = await newScreen(words.trim(), from?.trim() || "dashboard");
          return { ...n, note: `Agent ${n.num} builds the screen ${n.name}, and shows it on the phones when it is ready.` };
        }
        // A change in one step: a sample, or the default, becomes a screen of the user first.
        if (action === "change") {
          if (!words?.trim()) throw new Error("Give the words of the user for the change.");
          let name = (id || screenInUse()).split("@")[0];
          const forked = !!SCREEN_SAMPLES[name];
          if (forked) {
            name = forkScreen(SCREENS, name).name;
            setScreen(name);
          }
          const w = await startWorker({ project: join(SCREENS, name), task: changeTask(name, words.trim()), name: "Screen change" });
          return {
            name,
            forked,
            worker: w.id,
            num: w.num,
            note: `${forked ? `The sample is now the screen ${name} of the user. ` : ""}Agent ${w.num} changes it, and the phones show the new version when it is ready. The old versions stay.`,
          };
        }
        if (action === "import") {
          if (!from?.trim()) throw new Error("Give the folder or the Git URL to import.");
          const m = await importScreen(SCREENS, tilde(from.trim()), id || undefined);
          setScreen(m.name);
          return { name: m.name, version: m.n, source: m.dir, note: "It is in use now. Each change of the source reaches the phones in seconds." };
        }
        if (action === "list")
          return {
            in_use: screenInUse(),
            samples: Object.entries(SCREEN_SAMPLES).map(([id, f]) => ({ id, name: f().name, about: f().about })),
            mine: listScreens(SCREENS).map((m) => ({ name: m.name, title: m.title, kind: m.kind, newest: m.versions[0]?.n, folder: join(SCREENS, m.name) })),
          };
        if (action === "reset") return setScreen(DEFAULT_SCREEN), "The phones show the default screen in about 5 seconds.";
        if (action === "use") {
          if (!id) throw new Error("Give the screen to use.");
          setScreen(id);
          const failed = lastError(SCREENS, id.split("@")[0]);
          if (failed) return `The last change of ${id} did not become a version: ${failed} Fix it in the folder; the next change makes the version. Until then the phones show the newest good version.`;
          return `The phones and the Mac window show ${id} in about 10 seconds. A shake of the phone, or customize with reset, goes back.`;
        }
        if (action === "rename") {
          if (!words?.trim()) throw new Error("Give the new name in words.");
          let name = (id || screenInUse()).split("@")[0];
          if (SCREEN_SAMPLES[name]) {
            name = forkScreen(SCREENS, name).name;
            setScreen(name);
          }
          await renameScreen(SCREENS, name, words);
          return `The screen ${name} is now called ${words.trim().slice(0, 40)}.`;
        }
        if (action === "delete") {
          if (!id) throw new Error("Give the screen to delete.");
          deleteScreen(id.split("@")[0]);
          return `The screen ${id.split("@")[0]} is deleted.`;
        }
        if (action === "fork") {
          const f = forkScreen(SCREENS, id || screenInUse());
          setScreen(f.name);
          return { name: f.name, version: f.n, folder: join(SCREENS, f.name), note: "It is in use now." };
        }
        return { screen: (id || screenInUse()).split("@")[0], versions: screenVersions(SCREENS, (id || screenInUse()).split("@")[0]) };
      }),
  );
  // The voice of the app has its own set_theme (src/voice.ts), so a client with a device does not get a second one. The
  // Claude app and the brain get this one, so the Claude app switches the theme by voice.
  if (!device)
    mcp.registerTool(
      "set_theme",
      {
        description:
          "Switch the Yonder app on the phones of this computer to light mode, dark mode, or the theme of the system (system: it follows the light or dark mode of the phone). " +
          "The phones change in a few seconds. Call it when the user asks for light mode, dark mode, night mode or the system theme.",
        inputSchema: { theme: z.enum(["light", "dark", "system"]) },
      },
      ({ theme }) =>
        reply(() => {
          editJson(PHONE_FILE, (c) => void (c.theme = theme));
          return `The phones use the ${theme === "system" ? "theme of the system" : `${theme} theme`} in a few seconds.`;
        }),
    );
  // The export and the import of the setup (exportConfig), for the agents. The voice of the app does not get them.
  if (!device) {
    mcp.registerTool(
      "export_config",
      {
        description:
          "Save the setup of Yonder on this computer to one JSON file: the settings (config.json, with the workspaces and the profiles), the settings of the phones (phone.json), " +
          "the projects, the schedules, the reminders, talk.md and the own screens. Without keys (the default) it leaves out each key, token and pairing. " +
          "With keys it also holds .env, the pairing of the phones and the relay (relay.json), 1Password (vault.json), the connector of the Claude app and the tunnel: " +
          "anyone with that file can reach this computer, so set keys only when the user asks for the keys in words. Call it when the user asks to back up, save or export the Yonder setup.",
        inputSchema: {
          path: z.string().optional().describe("Where to save it. Default: ~/Downloads/yonder-setup-<date>.json"),
          keys: z.boolean().optional().describe("True to include the keys, tokens and pairings. Only when the user asks for them."),
        },
      },
      ({ path, keys }) => reply(() => exportConfig(path, keys === true)),
    );
    mcp.registerTool(
      "import_config",
      {
        description:
          "Apply a file that export_config or Export in the Settings made to the Yonder setup of this computer, with no restart of the app. It merges: settings, workspaces, profiles, projects, " +
          "schedules and the phone settings of the file win, and what only this computer has stays. A schedule or a reminder that is here already stays as it is, and a screen file that is here stays. " +
          "First it copies the current files to ~/.config/yonder/backups/before-import-<time>/. Without keys (the default) it never changes a key, token, port or pairing. " +
          "With keys, and only when the file holds them, it also writes them, and the bridge restarts in a second to load them. " +
          "Call it when the user gives an exported Yonder setup to apply or restore.",
        inputSchema: {
          path: z.string().describe("The path of the exported JSON file"),
          keys: z.boolean().optional().describe("True to also apply the keys, tokens and pairings of the file. Only when the user asks for it."),
        },
      },
      ({ path, keys }) => reply(() => importConfig(readFileSync(expand(path), "utf8"), keys === true)),
    );
  }
  // The app on the phone has its own get_location (src/voice.ts), so its Grok does not get a second tool of that name.
  if (!isPhone(device))
    mcp.registerTool(
      "get_location",
      {
        description:
          "Get the current location of the user from the GPS of the Yonder app on their phone: the latitude, the longitude, the accuracy in meters, " +
          "the time of the fix, the place name and the address when known, and a map link. It asks the phone of the live call, else the phone that the user used last, and takes a few seconds. " +
          "Call it when the user asks where they are, or asks to log, save, pin or share the place where they are, or asks for something near them, " +
          "such as \"where am I\", \"log this spot in Mind\", \"save this place\" or \"coffee near me\". Never call it when the user did not ask. " +
          "When Yonder is closed on the phone, a push asks the user to open it, and the call waits up to 25 seconds for it. " +
          "It fails with a clear message when Location is off for Yonder or Yonder does not open.",
        inputSchema: {},
      },
      () => reply(() => locatePhone(device, brain, me)),
    );
  // The other abilities of the phone, for the agents, the Grok of the Mac and the Claude call (docs/shell.md). The Grok of
  // the phone has its own tools there.
  const SCREEN = new Set(["share", "photo", "contact", "event", "confirm", "face_id", "paste", "save_photo", "sheet"]);
  if (!isPhone(device))
    mcp.registerTool(
      "phone",
      {
        description:
          "Use an ability of the phone of the user through the Yonder app: " +
          Object.entries(ABILITIES).map(([name, what]) => `${name}: ${what}`).join("; ") +
          ". It asks the phone of the live call, else the phone that the user used last. An ability that opens a screen waits up to 2 minutes for the user. " +
          "Use it only for what the user asked, or what their task needs. When Yonder is closed on the phone, notify goes as a push, and each other ability sends a push that asks the user to open Yonder and waits up to 25 seconds. " +
          "It fails with a clear message when Yonder does not open or the app of the phone cannot do that ability yet.",
        inputSchema: {
          ability: z.enum(Object.keys(ABILITIES) as [string, ...string[]]).describe("The ability"),
          args: z.record(z.string(), z.unknown()).optional().describe("The args of the ability, as its description gives them"),
        },
      },
      ({ ability, args }) =>
        reply(() => useAbility(ability, args ?? {}, device, brain, SCREEN.has(ability) ? 120_000 : 30_000, me)),
    );
  // The install and the sign-in of the CLIs from the phone (logins.ts), so that a
  // voice agent can say "Claude Code is signed out, do you want to sign in?" and walk the user through it.
  mcp.registerTool(
    "cli",
    {
      description:
        "The coding CLIs on this computer, such as Claude Code, Codex, Cursor and Grok. status: installed or not, the version, signed in or not, and an install or a sign-in that runs now. " +
        "Call status when the user asks if a CLI is signed in, logged in or installed, or when an agent cannot start because its CLI is signed out. " +
        "login: sign in to a CLI from the phone, with no terminal, and install it first when needed. install installs it again. cancel stops a sign-in. " +
        "Yonder runs the sign-in of the CLI, and a card shows at the top of the Agents tab of Yonder, on the phone and on the computer. " +
        "Tell the user to tap Sign in on the card and to sign in on the page that opens. A Claude Code page then shows a code: the user pastes it into the card. " +
        "For the other CLIs the card copies a one-time code, which the user pastes on the page. Do not read a link or a code aloud. " +
        "When an agent cannot start because its CLI is signed out or not installed, ask the user if they want to sign in or install it now, or start the agent on another CLI that is installed (status lists them). " +
        "Call login when the user asks to sign in, log in or install a CLI, or says yes to that question. Never install a CLI without a yes.",
      inputSchema: {
        action: z.enum(["status", "login", "install", "cancel"]),
        cli: z.string().optional().describe('For login, install and cancel: "claude" (Claude Code), "codex", "cursor", "grok" (Grok), or another id of status.'),
      },
    },
    ({ cli, action }) =>
      reply(async () => {
        if (action === "status") return cliStatus();
        if (!cli) throw new Error("Give the CLI.");
        const word = cli.trim().toLowerCase();
        const id = word === "claude" || /claude/.test(word) ? "claude" : (Object.keys(CLIS).find((k) => k === word || CLIS[k].name.toLowerCase() === word || CLIS[k].name.toLowerCase().startsWith(word)) ?? word);
        await cliLogin(id, action);
        const l = await withLink(id);
        if (action === "cancel") return { said: `The sign-in of ${cliName(id)} stopped.` };
        if (!l) return { said: `${cliName(id)} is signed in on ${hostname()}.` };
        if (l.error) return { error: l.error };
        if (l.step === "install") return { said: `Yonder installs ${cliName(id)} on ${hostname()} now. Its sign-in card shows in the Agents tab when the install is done.` };
        return { said: `The sign-in card of ${cliName(id)} is at the top of the Agents tab of Yonder. Tap Sign in on it.${l.paste ? " Then paste the code of the page into the card." : ""}` };
      }),
  );
  // Grok gets end_call and the tools of the screen from the app. The brain of a Claude call gets them here, so the
  // user can hang up and switch the screen by voice there too.
  if (brain) {
    mcp.registerTool(
      "end_call",
      { description: "End this voice call, as a hang-up. The call ends when your last words play.", inputSchema: {} },
      () => reply(() => hangUp(brain)),
    );
    // The app gets each one with GET /brain and does it (src/brain.ts).
    // shortcut: the brain hears "Done." before the app does it, so an error of the app, such as "No project matches",
    // does not reach the brain. Wait for the result of the app if that matters.
    mcp.registerTool(
      "show_tab",
      {
        description:
          "Open one tab of the Yonder app: projects (the list of workspaces), `agents` (running), " +
          "completed (the Done tab: waiting, done or failed, with the agents that need the user at the top), saved (the agents that the user saved for later), closed (the agents that the user closed), preview (the Canvas tab: the approvals " +
          "that wait for the user, then the apps: the pages that the agents made and the web sites that run on the Mac with their tunnels), or calls (the transcripts of past calls). It closes an open conversation and shows the list. The selected project stays.",
        inputSchema: { tab: z.enum(["projects", "agents", "completed", "saved", "closed", "preview", "calls"]) },
      },
      ({ tab }) => reply(() => appTool(brain, "show_tab", { tab })),
    );
    mcp.registerTool(
      "show_agent",
      {
        description: "Open the conversation of one agent on the screen of the Yonder app, with its workspace and its tab.",
        inputSchema: { agent: z.string().describe('The number of the agent, such as "19".') },
      },
      ({ agent }) => reply(() => appTool(brain, "show_agent", { agent })),
    );
    // The app still takes show_project with `project`, so an older app works too.
    mcp.registerTool(
      "show_workspace",
      {
        description: "Select a workspace in the Yonder app and open its agents on the screen.",
        inputSchema: { workspace: z.string().describe("The name of the workspace, as in the list of workspaces.") },
      },
      ({ workspace }) => reply(() => appTool(brain, "show_project", { project: workspace })),
    );
  }
  return mcp;
}

const REBUILD_LOG = join(CONFIG, "rebuild.log");
let rebuild: ReturnType<typeof Bun.spawn> | undefined;

// macOS gives the privacy grants of an app, such as Full Disk Access, also to each process that the app starts. The app
// stays the "responsible process" of each child and grandchild, also after a parent between them exits, but only while the
// app runs. When it quits, macOS holds each of them responsible for itself, with no grant. So the bridge, the daemon of
// Claude Code and the agents read the folders of Chrome, Mail and Messages only when Yonder.app is their responsible
// process. Else a bridge of the watchdog, or of an app that quit, gives no grant to the agents, and browser-harness in
// an agent cannot read the DevToolsActivePort file of Chrome.
// By its design, Claude Code moves each session that does not start in a spare host into ClaudeCode.app
// (macDisclaimResponsibility in its pty host). Such a session gets only the grants of ClaudeCode.app. For those sessions,
// add ~/.local/share/claude/ClaudeCode.app to Full Disk Access. Its path, its bundle ID com.anthropic.claude-code and
// its signature requirement (the identifier and the team Q6L2SF6YDW of Anthropic) do not change at an update. A grant to
// ~/.local/share/claude/versions/<version> stops at the next update, because each version has a new path.
// A pid that does not run gives -1.
const responsible = MAC
  ? dlopen("/usr/lib/libSystem.B.dylib", { responsibility_get_pid_responsible_for_pid: { args: ["i32"], returns: "i32" } }).symbols.responsibility_get_pid_responsible_for_pid
  : (pid: number) => pid;
// The pids of the Yonder apps that run: the app of install-app, a download, or `tauri dev`. A check bridge on another port
// has no app.
const apps = () => (MAC && !TEST ? Bun.spawnSync(["pgrep", "-u", String(process.getuid?.()), "-x", "yonder"]).stdout.toString().split("\n").filter(Boolean).map(Number) : []);

// Starts this bridge again with its newest source. The compiled bridge of a downloaded app starts again as it is.
function restartBridge() {
  // A bridge that does not compile never comes back, so check the source first.
  if (SOURCE) {
    const build = Bun.spawnSync([process.execPath, "build", "--target=bun", import.meta.path, "--outdir", join(CONFIG, "bridge-check")], { env: { ...env, NO_COLOR: "1" } });
    rmSync(join(CONFIG, "bridge-check"), { recursive: true, force: true });
    if (build.exitCode) throw new Error(`The bridge source does not compile, so the old bridge keeps running:\n${build.stderr.toString().slice(-2000)}`);
  }
  // In the compiled bridge, process.execPath is the bridge itself, not bun.
  const start = SOURCE ? `'${process.execPath}' '${import.meta.path}'` : `'${process.execPath}'`;
  // The new bridge gets the responsible process of this one (see `responsible`). While Yonder runs, a bridge with another
  // responsible process, such as one of the watchdog, only exits. The app then starts the new bridge with its own grants
  // (start_bridge in src-tauri/src/main.rs), after about 15 seconds in place of 2.
  const running = apps();
  const orphan = running.length > 0 && !running.includes(responsible(process.pid));
  // The new bridge waits until this one frees the port. The app is stateless over MCP, so it needs no reconnect.
  setTimeout(() => {
    // Under systemd (the service of omarchy/install.sh sets INVOCATION_ID), the bridge only exits, and Restart=always
    // starts it again. Its KillMode=process keeps the workers, so a bridge of its own would stay too and race for the port.
    // On Windows the loop of `yonder serve` (windows/yonder.ps1) starts it again in the same way.
    if (!process.env.INVOCATION_ID && !WINDOWS && !orphan)
      Bun.spawn(["/bin/sh", "-c", `sleep 1; exec ${start} >> '${join(CONFIG, "bridge.log")}' 2>&1`], {
        env: process.env,
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      }).unref();
    void Promise.resolve(relay?.stop("The bridge restarts")).then(() => process.exit(0));
  }, 300);
}

// The commit that this bridge started from, so that an update restarts it only when bridge/ changed.
const STARTED = SOURCE ? Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: ROOT }).stdout.toString().trim() : "";

// Builds dist/ in .dist-new and puts it in place only when the build works, so the apps never load half a build.
const spawnBuild = (install: boolean, log: string) =>
  Bun.spawn(["/bin/sh", "-c", `(${install ? "bun install && " : ""}bun run build --outDir .dist-new && rm -rf dist && mv .dist-new dist) > '${log}' 2>&1`], { cwd: ROOT, env });
// The screen builds by itself. After a commit that changes the screen, the bridge builds dist/ again, and the Mac app
// and the phones load it a few seconds later with no tap (src/front.ts), so a change of the screen by voice needs no
// Update button. FRONT are the inputs of the build: src/ and the files that src/
// imports from outside it ("../" in src/). A commit that changes none of them builds nothing, so the phones do not
// download the same screen again. An agent can edit the checkout itself, so the build waits while these paths are not
// the same as HEAD: else the phones would get edits that are not done. The commit of each build is dist/commit.txt.
// Only the bridge on port 7787 builds: a check on another port (bun run check-bridge) must not build the same dist/.
// shortcut: reads HEAD every 3 seconds; watch .git/refs if that ever costs.
const FRONT = ["src", "public", "index.html", "vite.config.ts", "version.ts", "channel.json", "package.json", "bun.lock", "bridge/talk.md", "bridge/settings"];
const FRONT_LOG = join(CONFIG, "front-build.log");
let frontBuild: ReturnType<typeof Bun.spawn> | undefined;
const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: ROOT });
// True when dist/ has the screen of HEAD (`head`, else the HEAD of the checkout).
function builtFront(head = "HEAD") {
  const file = join(ROOT, "dist", "commit.txt");
  const from = existsSync(file) ? readFileSync(file, "utf8").trim() : "";
  return !!from && git("diff", "--quiet", from, head, "--", ...FRONT).success;
}
if (SOURCE && PORT === 7787) {
  let seen = "";
  setInterval(() => {
    if (rebuild?.exitCode === null || frontBuild?.exitCode === null) return;
    const head = git("rev-parse", "HEAD").stdout.toString().trim();
    if (!head || head === seen) return;
    if (builtFront(head)) return void (seen = head);
    // --no-optional-locks: the check takes no lock of the index, so a commit of an agent at the same time works.
    if (git("--no-optional-locks", "status", "--porcelain", "--", ...FRONT).stdout.length) return;
    seen = head;
    const file = join(ROOT, "dist", "commit.txt");
    const from = existsSync(file) ? readFileSync(file, "utf8").trim() : "";
    frontBuild = spawnBuild(!from || !git("diff", "--quiet", from, head, "--", "package.json", "bun.lock").success, FRONT_LOG);
    frontBuild.exited.then((code) => code && console.error(`Yonder: the screen did not build, see ${FRONT_LOG}`));
  }, 3000);
}

// A TestFlight build of the dev environment. After a commit that changes the native iPhone app
// (`IOS_APP` in version.ts), the bridge runs `bun run testflight`. The screen goes over the air,
// so a commit that changes only src/ uploads nothing. The upload waits while ios/ is not the same
// as HEAD: an agent that still edits the checkout is not done. One upload runs at a time. A newer
// native commit during an upload starts the next upload when the first one ends. The script
// detaches, so a restart of the bridge does not stop it. The lock file is the record across that
// restart. Only this bridge uploads. A check bridge on another port must not. The log is
// testflight.log.
const TESTFLIGHT_LOG = join(CONFIG, "testflight.log");
let flight: ReturnType<typeof Bun.spawn> | undefined;
let flightHead = "";
function testflightBusy() {
  const pidFile = join(CONFIG, "testflight.lock", "pid");
  if (!existsSync(pidFile)) return false;
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}
if (SOURCE && PORT === 7787 && MAC) {
  setInterval(() => {
    if (flight?.exitCode === null || testflightBusy()) return;
    const head = git("rev-parse", "HEAD").stdout.toString().trim();
    if (!head || head === flightHead) return;
    // --no-optional-locks: the check takes no lock of the index, so a commit at the same time works.
    if (git("--no-optional-locks", "status", "--porcelain", "--", ...IOS_APP).stdout.length) return;
    const uploaded = existsSync(join(CONFIG, "testflight.txt")) ? readFileSync(join(CONFIG, "testflight.txt"), "utf8").trim() : "";
    const n = Number(uploaded.split(".")[2]);
    const from = commitOf(n, ROOT);
    if (!iosNativeChanged(from, head, ROOT)) return void (flightHead = head);
    const keys = existsSync(join(CONFIG, "release.env")) ? readFileSync(join(CONFIG, "release.env"), "utf8") : "";
    if (!/^APPLE_API_KEY=\S/m.test(keys) || !/^APPLE_API_ISSUER=\S/m.test(keys)) {
      console.error("Yonder: TestFlight has no App Store Connect key in release.env");
      return void (flightHead = head);
    }
    flightHead = head;
    flight = Bun.spawn(["/bin/sh", "-c", `sh ios/store/testflight.sh >> '${TESTFLIGHT_LOG}' 2>&1`], {
      cwd: ROOT,
      env,
      detached: true,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    flight.unref();
    flight.exited.then((code) => code && console.error(`Yonder: TestFlight did not upload, see ${TESTFLIGHT_LOG}`));
  }, 3000);
}

// True when src-tauri/ changed after the build of the installed Mac app, so that an update needs a full rebuild.
// install-app gives the app the version "2.B.N" (version.ts), so commit N after BASE is its source. An app
// of an older install has the version "1.N.0", and commit N of all the history is its source.
// shortcut: the count finds the commit only on a linear main. A miss gives true, a full rebuild.
let shell = { at: 0, changed: true };
function shellChanged() {
  // Linux and Windows have no native shell to rebuild: the window is the page of the bridge.
  if (!SOURCE || !MAC) return false;
  if (Date.now() - shell.at < 30_000) return shell.changed;
  const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: ROOT });
  const [major, b, last] = Bun.spawnSync(["plutil", "-extract", "CFBundleShortVersionString", "raw", "/Applications/Yonder.app/Contents/Info.plist"]).stdout.toString().trim().split(".");
  const n = Number(last) || Number(b);
  // A version "1.N.0" finds no commit, so it gets a full rebuild.
  const commit = major === "2" ? commitOf(n, ROOT) : "";
  shell = { at: Date.now(), changed: !commit || !git("diff", "--quiet", commit, "HEAD", "--", "src-tauri").success };
  return shell.changed;
}

// The key in .env of each voice provider (VOICE_PROVIDERS of src/voice.ts) and each speech to text of the cloud (STT of
// bridge/dictate.ts). A Claude call speaks with ElevenLabs. `parakeet` in `keys` is the helper of the three Parakeet models.
const VOICE_KEYS = { grok: "XAI_API_KEY", openai: "OPENAI_API_KEY", elevenlabs: "ELEVENLABS_API_KEY", claude: "ELEVENLABS_API_KEY", soniox: "SONIOX_API_KEY", deepgram: "DEEPGRAM_API_KEY" };

// Gives the app a short-lived token for the realtime API of Grok or of OpenAI, so that the
// API key stays in this process.
function dotenv(name: string) {
  const file = existsSync(join(CONFIG, ".env")) ? readFileSync(join(CONFIG, ".env"), "utf8") : "";
  return file.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1].trim();
}

async function token(openai: boolean) {
  const name = openai ? "OPENAI_API_KEY" : "XAI_API_KEY";
  const key = dotenv(name);
  if (!key) return Response.json({ error: `Put ${name}=... in ${CONFIG}/.env` }, { status: 500 });
  // The model of the OpenAI call is here only: the token gives it to the app (src/voice.ts).
  const res = await fetch(openai ? "https://api.openai.com/v1/realtime/client_secrets" : "https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(openai
      ? { expires_after: { anchor: "created_at", seconds: 300 }, session: { type: "realtime", model: "gpt-realtime-2.1" } }
      : { expires_after: { seconds: 300 } }),
  });
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}

// The car mode of the iPhone app: the CarPlay screen and its Swift call (docs/carplay.md). The rules of the car live
// here, so that a change needs no new app and no App Review. The car gets them at the start of each call, and again
// while the call runs: the prompt, the tools, and the agents for the list of the car screen.
// The tools are an allow list: a new tool stays off in the car until somebody adds it here. The tools of a screen,
// read_file, the photos, the pairing, add, create and delete, rebuild_app and restart_bridge stay off.
const CAR_TOOLS = new Set(["list_workers", "get_worker", "start_worker", "message_worker", "close_worker", "list_workspaces", "workspace_overview", "about_yonder", "get_usage"]);
const CAR_STATUS: Record<Status, string> = { running: "Running", waiting: "Waits for you", done: "Done", failed: "Failed", closed: "Closed" };
// The tool definitions of the MCP server, in the form of the realtime API of xAI. The app fills in `context` and
// `files`, so Grok does not see them.
let carTools: object[] | undefined;
async function carToolList() {
  if (carTools) return carTools;
  const [inside, outside] = InMemoryTransport.createLinkedPair();
  await server().connect(inside);
  const client = new Client({ name: "yonder-car", version: "0.1.0" });
  await client.connect(outside);
  const { tools } = await client.listTools();
  await client.close();
  carTools = tools
    .filter((t) => CAR_TOOLS.has(t.name))
    .map(({ name, description, inputSchema: { $schema, ...parameters } }) => {
      const { context, files, call, ...properties } = (parameters.properties ?? {}) as Record<string, unknown>;
      return { type: "function", name, description, parameters: { ...parameters, properties } };
    });
  return carTools;
}
// `zone` is the time zone of the phone, such as "Europe/Paris". The screen "watch" gives the prompt of the Apple
// Watch app (docs/watch.md): the same call and the same tools, but the user does not drive and can look at the phone.
type Screen = "car" | "watch";
async function car(zone: string, screen: Screen = "car") {
  const watch = screen === "watch";
  const isNews = (w: Worker) => w.status === "waiting" || (!!w.attention && w.unread && w.status !== "closed");
  // The agents of Yonder that are not closed, with the news first. The user closed the others on purpose.
  const agents = state.workers
    .filter((w) => w.num && !w.parent && w.status !== "closed")
    .sort((a, b) => Number(isNews(b)) - Number(isNews(a)) || b.updatedAt - a.updatedAt)
    .slice(0, 20);
  const lines = agents.map((w) =>
    [
      `- ${voiceRef(w, state.workers, agentWord())}, "${w.name}", in ${w.project}: ${CAR_STATUS[w.status].toLowerCase()}` +
        `${w.status === "running" ? "" : `, ${Math.round((Date.now() - w.updatedAt) / 60_000)} minutes ago`}` +
        `${isNews(w) && w.status !== "waiting" ? ", needs the user's attention" : ""}${w.unread ? ", unread" : ""}.`,
      w.task && `  Task: ${w.task.replace(/\s+/g, " ").slice(0, 160)}`,
      w.result && `  End of its last message: ${w.result.replace(/\s+/g, " ").slice(-300)}`,
      summaryOf(w) && `  Summary: ${summaryOf(w)!.replace(/\n/g, " ")}`,
      w.status === "waiting" && summaryOf(w) && `  What it needs from the user: ${needs(summaryOf(w)!)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  let time: string;
  try {
    time = new Date().toLocaleString("en-US", { timeZone: zone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  } catch {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    time = new Date().toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }
  // The prompt has the word of the user for an agent, such as "bot" (agentName in config.json, src/names.ts).
  const instructions = swap(`## Role & Persona
You are Yonder, the voice of a team of Claude Code agents on the user's Mac. You are calm, quick and direct.
${watch ?"The user talks to you through Yonder on an Apple Watch. The screen of the watch is small, and the user can be on the move." : "The user drives a car and talks to you through CarPlay. The user cannot look at a screen."}

## Objective
Turn what the user says into work for the agents, keep track of the agents, and tell the user what they did. You never do the coding work yourself.

## Conversation Flow
${state.agentNaming === "numbers" ? "" : `- Call each agent by the name before its number in the lines of the section "Agents", such as "${callName(agents[0] ?? { num: 1, project: "Yonder" }, state.workers, agentWord())}". The tools take the number.\n`}- To start work, first say only "Agent started.", and then call start_worker in the same answer. Give start_worker the workspace, the full request in the words of the user, and a title of two or three words that tells what the agent does (up to six words for a complex task).
- Each new request gets a new agent. Call message_worker ONLY when the user answers, continues or corrects an agent, or tells a named agent to do something ("tell 3 to ..."). Then first say only "Sent to" and the number, such as "Sent to 3.", and call message_worker in the same answer.
- When the user changes the agent or the request in the middle of the words ("or actually", "no wait", "I mean"), only the words after the change count.
- When the user takes back what they said ("never mind", "forget it", "scratch that"), call NO tool, and say only "Okay."
- The user often stops to think. When the words stop in the middle of a sentence or end with "um", "uh" or "and", the user is not done: call NO tool, and say nothing.
- To check on the agents, call list_workers. It gives the count of each tab, so for "how many are done?" read counts, and give tab to list one tab. With query, it searches all the agents, also the done ones. To read into one agent, call get_worker. With full set to true, it gives the whole last message.
- When the user gives work and then says to close the agent ("deploy it and close it", "then close", "do that and you're done"), it is ONE action: set closeWhenDone to true on that start_worker or message_worker, do NOT call close_worker, and add "It closes itself when done." after your first words. It stays open when it fails, asks a question or leaves a decision, and the phone tells why.
- To stop or close an agent ("stop it", "close it", "done"), call close_worker with its number and NO done, also for a done agent: it moves to the Closed tab. To interrupt an agent and keep it open ("interrupt 3", "stop 3, wait"), call stop_worker. Only when the user says "mark it done" or "completed", call close_worker with done set to true. Close an agent only when the user asks for it.
- When the user asks if an agent can close ("are we good to close 4?"), call get_worker for it, and give your advice in one or two sentences with the reason: it still runs, it waits on a question, or it finished. Close it only after a yes.
- When you do more than one action in one answer, say each action with its agent number, such as "Closed 12 and started 3." NEVER leave out an action.
- When the user asks about Yonder itself, call about_yonder with the topic of the question. When the user asks what a workspace or a project is, call workspace_overview. Answer in one or two sentences.
- If you are not sure which workspace the user means, use list_workspaces to search the list of workspaces. If it is still not clear, give start_worker an empty workspace: Yonder picks the workspace from the task, or the default folder of the user. Do not ask.
- When the user asks a quick question about the world or the news, use web_search, or x_search for posts on X, and answer it yourself.
- When the user asks to end the call ("end call", "hang up", "bye"), call end_call and say only a short goodbye.
- At the start of the call, say in one sentence how many agents wait for the user or have a result that needs the user, and ask if the user wants to go through them. If none, say only "Hi."
- Go through the agents one at a time.
- ${watch ? "On the watch" : "In the car"}, you cannot show anything on a screen, read files, use the photos, pair a phone, add, create or delete workspaces, remove agents, or rebuild or restart Yonder. When the user asks for one of these, say that it does not work ${watch ?"on the watch, but works in Yonder on the phone or the Mac" : "in the car"}.

## Guardrails & Escalation
- Talk only about the user's work, the agents and the projects, and quick questions about the world.
${watch ? "" : "- NEVER tell the user to look at the phone or to pick it up.\n"}- When you ask the user a question, wait for the answer. Do NOT call a tool for that action in the same answer.

## Voice & Communication Style
- ${watch ? "The user listens on a watch" : "The user drives"}, so keep it short: one or two short sentences. Give the gist first, and give details only when the user asks.
- Spoken words only: no markdown, no lists, no emojis.
- When you tell about one agent, say ONE sentence of 20 words or less: the substance of what it found, made or changed, from its summary, such as the actual names, numbers or answer, or what it needs from the user. NEVER say only the kind of work, such as "It brainstormed product names.": say the names.
- When the user asks what an agent wants, needs, asks or waits for ("what does number one want from us?"), say in one or two sentences the question or the decision itself, from its line "What it needs from the user", and the reason. When it has no such line, call get_worker with full set to true first. NEVER answer only that it waits for a reply: the user sees that on the screen.
- When the user asks what an agent says or said, call get_worker with full set to true first. Then tell the details in two to four short sentences: what it found or did, why, and what it needs. When the user asks for a better summary or more details, answer yourself from that result. NEVER call message_worker for that.
- NEVER read code, file paths, links, worker ids or long lists aloud. You can say agent numbers.
- Call the workers "agents".

## Time & Place
It is now ${time}. The user is in ${zone.split("/").pop()!.replace(/_/g, " ")} (time zone ${zone}).

## Workspaces
${projects().map((p) => p.name).join(", ")}

## Agents
${lines.join("\n") || "None."}`, state.agentName);
  return {
    instructions,
    tools: [
      // xAI runs these on its side.
      { type: "web_search" },
      { type: "x_search" },
      ...(await carToolList()),
      // The car runs this one itself.
      { type: "function", name: "end_call", description: "End this voice call, as a hang-up. The call ends when you stop talking.", parameters: { type: "object", properties: {} } },
    ],
    agents: agents.map((w) => ({ num: w.num, name: w.name, project: w.project, status: CAR_STATUS[w.status], news: isNews(w) })),
    // The word of the user for an agent, such as "Bot" and "Bots" (agentName in config.json), for the tab of CarPlay.
    word: { one: agentWord().one, many: agentWord().many },
  };
}

// The real Grok spend from the xAI billing records, the same numbers as the xAI console.
// It needs a management key (xAI console, Settings, Management Keys), not the API key.
// The usage is in USD. The invoice preview is in USD cents, and a credit is negative.
// The credit left is the prepaid credit minus the credit that this month already used, as in the console.
// shortcut: kept for 60 s, because the rate limit of the management API is not documented.
// `fresh` (the pull to refresh of the settings) skips the cache.
let usage: { at: number; body: unknown } | undefined;
let team: string | undefined;
async function grokUsage(fresh = false) {
  if (usage && Date.now() - usage.at < (fresh ? 0 : 60_000)) return usage.body;
  const key = dotenv("XAI_MANAGEMENT_KEY");
  if (!key) return { error: `Put XAI_MANAGEMENT_KEY=... in ${CONFIG}/.env. Make the key in the xAI console, Settings, Management Keys.` };
  const api = async (path: string, body?: unknown) => {
    const res = await fetch(`https://management-api.x.ai${path}`, {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`xAI ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.json();
  };
  try {
    if (!team) {
      const v = await api("/auth/management-keys/validation");
      team = v.scope === "SCOPE_TEAM" && v.scopeId ? v.scopeId : v.teamId;
    }
    // The API takes local time, and the end time is not included.
    const pad = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 00:00:00`;
    const now = new Date();
    const [used, balance] = await Promise.all([
      api(`/v1/billing/teams/${team}/usage`, {
        analyticsRequest: {
          timeRange: {
            startTime: pad(new Date(now.getFullYear(), now.getMonth(), 1)),
            endTime: pad(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          timeUnit: "TIME_UNIT_NONE",
          values: [{ name: "usd", aggregation: "AGGREGATION_SUM" }],
          groupBy: ["description"],
          filters: [],
        },
      }),
      api(`/v1/billing/teams/${team}/postpaid/invoice/preview`),
    ]);
    const lines = (used.timeSeries ?? [])
      .map((t: { group: string[]; dataPoints: { values: number[] }[] }) => ({
        item: t.group.join(" "),
        usd: t.dataPoints.reduce((sum, p) => sum + (p.values[0] ?? 0), 0),
      }))
      .filter((l: { usd: number }) => l.usd > 0)
      .sort((a: { usd: number }, b: { usd: number }) => b.usd - a.usd);
    const body = {
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      month_usd: lines.reduce((sum: number, l: { usd: number }) => sum + l.usd, 0),
      lines,
      credit_usd: -(Number(balance.coreInvoice?.prepaidCredits?.val ?? 0) - Number(balance.coreInvoice?.prepaidCreditsUsed?.val ?? 0)) / 100,
    };
    usage = { at: Date.now(), body };
    return body;
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// The Claude Code plan limits, the same numbers as /usage in Claude Code: the current session (5 hours) and the week.
// The bridge reads the sign-in of Claude Code from the keychain. Claude Code refreshes the token itself.
// The endpoint answers 429 to frequent requests, also to the requests of Claude Code itself. So the bridge asks at most
// every 2 minutes (a fresh request: 30 seconds), and waits 5 minutes after an error, also for a fresh request.
// The answer always gives the last good numbers with their time (`at`), and the error of the last request in plain words.
// The last good numbers stay in claude-usage.json, so that a restart of the bridge does not show an error in their place.
const CLAUDE_USAGE = join(CONFIG, "claude-usage.json");
let claudeLimits: { at: number; error?: string } | undefined;
let claudeGood: { limits: unknown[]; at: number } | undefined = (() => {
  try {
    return JSON.parse(readFileSync(CLAUDE_USAGE, "utf8"));
  } catch {}
})();
async function claudeUsage(fresh = false, dir?: string) {
  // A profile with its own folder has its own login. Its numbers stay in memory. The default login stays in the file.
  if (dir) return claudeUsageIn(dir, fresh);
  const wait = claudeLimits?.error ? 300_000 : fresh ? 30_000 : 120_000;
  if (!claudeLimits || Date.now() - claudeLimits.at >= wait) {
    const body = await fetchClaudeUsage();
    claudeLimits = { at: Date.now(), error: "error" in body ? body.error : undefined };
    if ("limits" in body) {
      claudeGood = { limits: body.limits, at: Date.now() };
      writeFileSync(CLAUDE_USAGE, JSON.stringify(claudeGood));
    }
  }
  return { ...claudeGood, error: claudeLimits.error };
}
// The last good numbers of each own folder stay in claude-usage-dirs.json too. The endpoint can answer 429 after a
// restart of the bridge, and without them the row of a profile then shows no usage for 5 minutes.
const CLAUDE_DIRS_USAGE = join(CONFIG, "claude-usage-dirs.json");
const claudeDirsUsage = new Map<string, { at?: { at: number; error?: string }; good?: { limits: unknown[]; at: number } }>(
  (() => {
    try {
      return Object.entries(JSON.parse(readFileSync(CLAUDE_DIRS_USAGE, "utf8"))).map(([dir, good]) => [dir, { good: good as { limits: unknown[]; at: number } }]);
    } catch {
      return [];
    }
  })(),
);
async function claudeUsageIn(dir: string, fresh: boolean) {
  const slot = claudeDirsUsage.get(dir) ?? {};
  const wait = slot.at?.error ? 300_000 : fresh ? 30_000 : 120_000;
  if (!slot.at || Date.now() - slot.at.at >= wait) {
    const body = await fetchClaudeUsage(dir);
    slot.at = { at: Date.now(), error: "error" in body ? body.error : undefined };
    if ("limits" in body) slot.good = { limits: body.limits, at: Date.now() };
    claudeDirsUsage.set(dir, slot);
    if ("limits" in body) writeFileSync(CLAUDE_DIRS_USAGE, JSON.stringify(Object.fromEntries([...claudeDirsUsage].filter(([, x]) => x.good).map(([d, x]) => [d, x.good]))));
  }
  return { ...slot.good, error: slot.at?.error };
}
// The usage of the active profile: Claude Code for a Claude profile, Grok for a Grok profile, and the
// meters of another CLI when it has them. The Usage section and the title bar show this.
async function planUsage(fresh = false) {
  const p = profileOf(state.cli);
  const cli = p?.cli ?? (state.cli === "claude" || CLIS[state.cli] ? state.cli : "claude");
  const name = p?.name ?? (cli === "claude" ? "Claude Code" : (CLIS[cli]?.name ?? cli));
  const id = p?.id ?? cli;
  if (cli === "claude") {
    const body = await claudeUsage(fresh, p?.own ? claudeDir(p) : undefined);
    return { id, cli, name, limits: body.limits as { name: string; percent: number; resets_at: string | null }[] | undefined, at: body.at, error: body.error };
  }
  if (!CLIS[cli]?.usage) return { id, cli, name, error: `${name} has no usage numbers.` };
  try {
    const limits = cli === "grok" ? await grokLimits(fresh) : await CLIS[cli].usage!("");
    return limits?.length ? { id, cli, name, limits, at: Date.now() } : { id, cli, name, at: Date.now(), error: `${name} has no usage numbers.` };
  } catch (e) {
    return { id, cli, name, at: Date.now(), error: (e as Error).message };
  }
}
// Claude Code refreshes its login only when it runs, so the login of a profile with no agent expires after some hours.
// Such a profile then shows no usage. A tiny run of Claude Code in that folder
// refreshes the login in the background, at most once in 30 minutes, and the next read gets the numbers. The read starts
// it when the stored login is past its expiresAt, or gets 401 or 403. The check of the status alone misses an expired login.
// A refresh that fails for good, such as "Failed to authenticate: OAuth session expired and could not be refreshed",
// marks the profile as signed out (lostProfile).
const refreshed = new Map<string, number>();
function refreshLogin(dir: string) {
  if (Date.now() - (refreshed.get(dir) ?? 0) < 1_800_000) return;
  refreshed.set(dir, Date.now());
  const proc = Bun.spawn(
    [CLAUDE, "-p", "--model", "haiku", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--system-prompt", "Answer with one word."],
    { cwd: SUMMARIZER, env: { ...env, CLAUDE_CONFIG_DIR: dir, MAX_THINKING_TOKENS: "0" }, stdin: new Blob(["Hi"]), stdout: "pipe", stderr: "pipe", timeout: 60_000 },
  );
  void Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]).then(([out, err]) => {
    delete claudeDirsUsage.get(dir)?.at;
    if (SIGNED_OUT_CLAUDE.test(`${out}\n${err}`.trim())) lostProfile(dir);
  });
}
// Each profile with its own account stays signed in while the bridge runs, also when no agent and no app uses it: every
// 30 minutes the bridge reads its usage, and the read of an expired login starts its refresh. So each profile
// stays signed in, and the app shows the usage of each one. Only the live
// bridge does it, not a check bridge, so a second bridge does not refresh the same folder at the same time.
if (!TEST) setInterval(() => state.profiles.forEach((p) => p.own && p.cli === "claude" && void usageFor("claude", false, claudeDir(p))), 1_800_000);
// The login of Claude Code in a folder (`claudeAiOauth`). Linux and Windows keep it in a file, with the same JSON as the
// Keychain item of the Mac. A profile with its own folder keeps its login in that folder: on the Mac its Keychain item has
// the first 8 hex digits of the SHA-256 of the folder at the end of the name.
function storedLogin(dir?: string): { accessToken?: string; expiresAt?: number } | undefined {
  const root = dir ?? process.env.CLAUDE_CONFIG_DIR ?? join(HOME, ".claude");
  const file = join(root, ".credentials.json");
  const service = dir ? `Claude Code-credentials-${new Bun.CryptoHasher("sha256").update(dir).digest("hex").slice(0, 8)}` : "Claude Code-credentials";
  const keychain = MAC ? Bun.spawnSync(["security", "find-generic-password", "-s", service, "-w"]) : undefined;
  const login = keychain ? (keychain.exitCode === 0 ? keychain.stdout.toString() : "") : existsSync(file) ? readFileSync(file, "utf8") : "";
  return login ? JSON.parse(login).claudeAiOauth : undefined;
}
async function fetchClaudeUsage(dir?: string): Promise<{ limits: unknown[] } | { error: string }> {
  try {
    // A profile with its own folder reads its own login, so the Usage section does not show another account.
    const oauth = storedLogin(dir);
    const token = oauth?.accessToken;
    if (!token) return { error: dir ? "This profile is not signed in." : "Claude Code is not signed in. Run claude, then /login." };
    if (dir && (oauth?.expiresAt ?? Infinity) < Date.now()) {
      refreshLogin(dir);
      return { error: "The sign-in of this profile expired. Yonder refreshes it now." };
    }
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
    });
    if (res.status === 429) return { error: "Anthropic limits how often Yonder can read the usage. Yonder tries again in 5 minutes." };
    if (res.status === 401 || res.status === 403) {
      if (dir) refreshLogin(dir);
      return { error: "The sign-in of Claude Code expired. Run claude, then /login." };
    }
    if (!res.ok) {
      const message = await res.json().then((j) => j?.error?.message, () => undefined);
      return { error: `Anthropic did not give the usage (${message ?? `error ${res.status}`}). Yonder tries again in 5 minutes.` };
    }
    const data = await res.json();
    const names: Record<string, string> = { session: "Current session", weekly_all: "Week, all models" };
    return {
      limits: (data.limits ?? []).map((l: { kind: string; percent: number; resets_at: string | null; scope?: { model?: { display_name?: string } } }) => ({
        name: names[l.kind] ?? `Week, ${l.scope?.model?.display_name ?? l.kind}`,
        percent: l.percent,
        resets_at: l.resets_at,
      })),
    };
  } catch {
    return { error: "Yonder could not reach Anthropic for the usage. It tries again in 5 minutes." };
  }
}
// The reset time as the app says it (resets in src/App.tsx), in the time zone of this computer.
function resets(at: string) {
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return days === 0 ? `at ${time}` : days === 1 ? `tomorrow at ${time}` : `${d.toLocaleDateString("en-US", { weekday: "long" })} at ${time}`;
}

// The icon of a project, from the top folder or else from the nearest subfolder, 4 levels down at most.
// shortcut: cached until the bridge restarts, so a new icon shows after the next restart.
const icons = new Map<string, string | undefined>();
function findIcon(root: string) {
  let level = [root];
  for (let depth = 0; depth <= 4 && level.length; depth++) {
    for (const dir of level) {
      const file = ICONS.map((f) => join(dir, f)).find((f) => existsSync(f));
      if (file) return file;
    }
    level = level.flatMap((dir) => {
      try {
        return readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !HEAVY.has(d.name))
          .map((d) => join(dir, d.name))
          .sort();
      } catch {
        return [];
      }
    });
  }
}

// The slash commands that the prompt box of the app offers: the skills and the custom commands
// of the user, of the project and of each enabled plugin, then the built-in commands of Claude Code.
// A background session shows a built-in command on its own screen, so `terminal` opens it in Ghostty.
// An agent of another CLI gets only the skills of that CLI (Cli.skills).
type Command = { name: string; description: string; terminal?: boolean };
const BUILTINS: Command[] = [
  { name: "btw", description: "Ask a side question. The agent does not stop, and the chat does not keep it." },
  { name: "compact", description: "Make the conversation shorter, to free context." },
  { name: "init", description: "Write a CLAUDE.md for this project." },
  { name: "review", description: "Review a pull request." },
  { name: "security-review", description: "Do a security review of the changes on this branch." },
  { name: "code-review", description: "Review the changes for bugs." },
  { name: "simplify", description: "Clean up the changed code." },
  ...[
    ["context", "Show the context use."],
    ["cost", "Show the cost and the usage limits."],
    ["usage", "Show the usage limits."],
    ["model", "Change the model."],
    ["effort", "Change the effort."],
    ["mcp", "Show the MCP servers."],
    ["memory", "Edit the memory files."],
    ["status", "Show the version, the model and the account."],
    ["config", "Open the settings."],
    ["doctor", "Check the install of Claude Code."],
    ["login", "Sign in to an Anthropic account."],
    ["logout", "Sign out of the Anthropic account."],
  ].map(([name, description]) => ({ name, description: `${description} Opens in Ghostty.`, terminal: true })),
];

// The name and the first sentence of the description in the frontmatter of a SKILL.md or a command file.
function command(file: string, fallback: string, prefix = ""): Command | undefined {
  let text: string;
  try {
    text = readFileSync(file, "utf8").slice(0, 4000);
  } catch {
    return;
  }
  const head = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const name = head.match(/^name:\s*["']?([^"'\n]+)/m)?.[1].trim() || fallback;
  // A description can go on the next lines (`description: |` or `>`), indented.
  const raw = head.match(/^description:[ \t]*(.*(?:\n[ \t]+.*)*)/m)?.[1] ?? "";
  const description = raw.replace(/^[|>][-+]?/, "").replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim();
  return { name: prefix + name, description: description.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? description.slice(0, 160) };
}

function commands(project: string | null, cli: string | null) {
  const claude = join(HOME, ".claude");
  const read = (path: string) => {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return {};
    }
  };
  const list = (dir: string) => {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  };
  const scan = (dir: string, prefix = "") => [
    ...list(join(dir, "skills")).map((d) => command(join(dir, "skills", d.name, "SKILL.md"), d.name, prefix)),
    ...list(join(dir, "commands")).filter((d) => d.name.endsWith(".md")).map((d) => command(join(dir, "commands", d.name), d.name.slice(0, -3), prefix)),
  ];
  const other = cli && cli !== "claude" ? CLIS[cli] : undefined;
  if (other) {
    const found = (other.skills?.(project ?? HOME) ?? []).flatMap((dir) => list(dir).map((d) => command(join(dir, d.name, "SKILL.md"), d.name)));
    const seen = new Set<string>();
    return found.filter((c): c is Command => !!c && !seen.has(c.name) && !!seen.add(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  }
  const enabled = read(join(claude, "settings.json")).enabledPlugins ?? {};
  const installed = read(join(claude, "plugins", "installed_plugins.json")).plugins ?? {};
  const plugins = Object.keys(enabled)
    .filter((id) => enabled[id] === true)
    .flatMap((id) => {
      const install = (installed[id] ?? []).find((i: { scope: string; projectPath?: string }) => i.scope === "user" || i.projectPath === project);
      return install ? scan(install.installPath, `${id.split("@")[0]}:`) : [];
    });
  const found = [...(project ? scan(join(project, ".claude")) : []), ...scan(claude), ...plugins].filter((c): c is Command => !!c);
  const seen = new Set<string>();
  return [...found.sort((a, b) => a.name.localeCompare(b.name)), ...BUILTINS].filter((c) => !seen.has(c.name) && seen.add(c.name));
}

function favicon(path: string | null) {
  const project = projects().find((p) => p.home !== false && p.path === path);
  if (project && !icons.has(project.path)) icons.set(project.path, findIcon(project.path) ?? (project.path === join(HOME, "Yonder") ? YONDER_ICON : undefined));
  const file = project && icons.get(project.path);
  if (!file) return new Response(null, { status: 404 });
  // An emoji favicon is an SVG with one <text>. Its own position often cuts the emoji off, so draw it again in the center.
  const emoji = file.endsWith(".svg") && /^\s*<svg[^>]*>\s*<text[^>]*>([^<]{1,16})<\/text>\s*<\/svg>\s*$/.exec(readFileSync(file, "utf8"))?.[1];
  if (emoji) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="50" font-size="80" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`;
    return new Response(svg, { headers: { "content-type": "image/svg+xml", ...ICON_CACHE } });
  }
  return new Response(Bun.file(file), { headers: ICON_CACHE });
}
// The Mac app keeps a favicon for an hour, and then shows the kept one at once while it asks again. Without it, each
// visit to All projects loads each favicon again, and they show late.
const ICON_CACHE = { "cache-control": "max-age=3600, stale-while-revalidate=604800" };


// The Yonder module of the Omarchy bar: the microphone of Omarchy's own bar (󰍬), then the agents that run, wait on the
// user (?) and have a new result (✓). A click starts or ends the call, as right ⌘ on the Mac (omarchy/install.sh).
async function barStatus() {
  const all = await allSessions();
  const running = all.filter((w) => w.status === "running").length;
  const waiting = all.filter((w) => w.status === "waiting").length;
  const done = all.filter((w) => w.status === "done" && w.unread).length;
  const live = Date.now() < callUntil;
  const counts = [running && `${running} running`, waiting && `${waiting} waiting on you`, done && `${done} new results`].filter(Boolean);
  return {
    text: ["\u{F036C}", running && `${running}`, waiting && `?${waiting}`, done && `✓${done}`].filter(Boolean).join(" "),
    tooltip: `Yonder${counts.length ? `: ${counts.join(", ")}` : ""}\n${live ? "On a call. Click to end it." : "Click to start a call."} Right-click to open Yonder.`,
    class: live ? "active" : "",
  };
}

// The phone relay: YONDER_RELAY=wss://... in .env, else the live relay. A Mac with no such line, such as a copy
// from yonder.so, showed only an error in Pair a phone. The request of a phone runs on this server
// through fetch, so it passes the same Host and Origin checks. See docs/mobile.md.
const DEFAULT_RELAY = "wss://relay.yonder.so";
// The team of the Apple Developer account signs the APNs token of the pushes.
// Only the live bridge joins the relay, also when a check copies the .env into its own folder.
// The app version and the kind of this computer, for the backstage. A download has a version file, and a copy
// with source has git. The installer sets YONDER_SERVER in the service of a server with no desktop, for example over SSH.
function hostInfo() {
  let app = existsSync(join(ROOT, "version")) ? readFileSync(join(ROOT, "version"), "utf8").trim() : "";
  if (!app) try { app = version(); } catch {}
  const kind = MAC ? "Mac" : WINDOWS ? "Windows" : process.env.YONDER_SERVER ? "Linux server" : "Linux";
  return { app, model: MAC ? kind : `${kind} ${release()}` };
}
// A request of a phone names http://127.0.0.1:7787 on the wire (LOCAL in relay.ts), so it goes to the port of this
// bridge, with the token.
const local = (req: Request) => {
  const { pathname, search } = new URL(req.url);
  const to = new Request(`http://127.0.0.1:${PORT}${pathname}${search}`, req);
  to.headers.set("x-yonder-token", bridgeToken());
  return fetch(to);
};
const joinRelay = (url: string) =>
  !TEST
    ? connectRelay(url, CONFIG, dotenv("APNS_TEAM_ID") ?? "C5338FSGXJ", local, hostInfo(), (req, id) => {
        const path = new URL(req.url).pathname;
        return path.startsWith(`/${id}/upload/`) ? uploadAt(req, `/${id}/upload/`) : path.startsWith(`/${id}/hook/`) ? hookAt(req, `/${id}/hook/`) : connector.handleAt(req, id);
        // When another user of this computer has LAN_PORT, any free port: the phone gets it through /lan.
      }, portFree(LAN_PORT, "0.0.0.0") ? LAN_PORT : 0)
    : undefined;
let relay = joinRelay(dotenv("YONDER_RELAY") ?? DEFAULT_RELAY);
// The Relay tab of Pair a phone: another relay, or "" for the default. It writes YONDER_RELAY in .env, and joins the new
// relay at once. The keys and the room stay the same, but a phone keeps the relay of its pairing, so it must pair again.
async function setRelay(url: string) {
  url = url.trim().replace(/\/+$/, "");
  if (url && !/^wss?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(url)) throw new Error("The relay must be a wss:// address.");
  const file = join(CONFIG, ".env");
  const lines = (existsSync(file) ? readFileSync(file, "utf8") : "").split("\n").filter((l) => !l.startsWith("YONDER_RELAY="));
  if (url && url !== DEFAULT_RELAY) lines.splice(lines.at(-1) === "" ? -1 : lines.length, 0, `YONDER_RELAY=${url}`);
  writeFileSync(file, lines.join("\n"), { mode: 0o600 });
  await relay?.stop("The relay changed");
  relay = joinRelay(url || DEFAULT_RELAY);
}
// The app (stop_bridge in src-tauri/src/main.rs) and install-app stop the bridge with SIGTERM. A signal skips the exit
// handlers, so the bridge exits by itself: the relay gets a clean close, and the exit handlers stop cloudflared.
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => void Promise.resolve(relay?.stop("The bridge stopped")).then(() => process.exit(0)));
// Yonder Preview, when preview.json is in the folder of Yonder. Without it, the scan still finds the sites for the Mac.
const preview = startPreview(CONFIG, projects, (req) => connector.handle(req));
// What yonder.so makes the tunnel of this computer for: the public key of its relay identity, which stays the same, and
// its name, as the pairing gives it to a phone.
function computerId() {
  try {
    const id = JSON.parse(readFileSync(join(CONFIG, "relay.json"), "utf8")).pub as string;
    const computer = computerName(CONFIG);
    return { id, computer };
  } catch {}
}
// A request to the MCP of the bridge. Stateless: a new server and transport for each request.
// The old names of the renamed tools, such as the tools of the Canvas tab, which is now Apps. A call with an old name
// still works, so a client with an old list of the tools does not break, and only the new names are in the list.
// shortcut: keep them until no client calls an old name; the bridge logs each call with one.
// Some tools merged into one: an old name also gives its arguments, such as done for complete_worker.
type Args = Record<string, unknown>;
const RENAMED: Record<string, [string, (a: Args) => Args]> = {
  show_artifact: ["show_app", (a) => a],
  build_artifact: ["build_app", (a) => a],
  show_on_device: ["preview", (a) => ({ ...a, action: "open" })],
  complete_worker: ["close_worker", (a) => ({ ...a, done: true })],
  cli_status: ["cli", (a) => ({ ...a, action: "status" })],
  cli_login: ["cli", (a) => ({ action: "login", ...a })],
  // The project tools became workspace tools. renamed() gives `project` as `workspace` first.
  list_projects: ["list_workspaces", (a) => ({ ...a, plain: true })],
  set_project_profile: ["set_workspace_profile", (a) => a],
  add_project: ["add_workspace", (a) => ({ folder: a.path })],
  create_project: ["add_workspace", (a) => ({ name: a.name, newFolder: true, ...(a.folder !== undefined && { parent: a.folder }) })],
  remove_project: ["remove_workspace", (a) => a],
  describe_project: ["edit_workspace", (a) => ({ workspace: a.workspace, description: a.text ?? "" })],
  star_project: ["star_workspace", (a) => a],
  order_projects: ["star_workspace", (a) => ({ order: a.projects })],
  project_overview: ["workspace_overview", (a) => a],
  show_project: ["show_workspace", (a) => a],
};
// The old name of each workspace tool that kept its arguments, for a call to an older bridge (other_computer).
const OLD_NAMES: Record<string, string> = Object.fromEntries(
  ["list_projects", "set_project_profile", "remove_project", "star_project", "project_overview", "show_project"].map((old) => [RENAMED[old][0], old]),
);
const loggedNames = new Set<string>();
// True for a phone screen "2.B.N" with N below 902 (x-yonder-app of bridge/relay.ts).
const oldScreen = (req: Request) => Number(/^2\.\d+\.(\d+)$/.exec(req.headers.get("x-yonder-app") ?? "")?.[1] ?? Infinity) < 902;
async function renamed(req: Request) {
  if (req.method !== "POST") return req;
  const text = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Request(req.url, { method: "POST", headers: req.headers, body: text, signal: req.signal });
  }
  for (const m of [body].flat() as { method?: string; params?: { name?: string; arguments?: Args } }[]) {
    const p = m?.method === "tools/call" ? m.params : undefined;
    if (!p?.name) continue;
    // A phone screen before 2.B.902 (448337a8) reads list_workers as the full array, and `counts` and `list`
    // make each of its polls fail, so it shows Offline. The App Store app 2.107.750 runs such a screen until it gets an
    // app of iOS build 922 or later.
    if (p.name === "list_workers" && oldScreen(req)) p.arguments = { full: true, ...p.arguments };
    // The argument `images` of start_worker, message_worker and build_app is now `files`.
    const a = p.arguments;
    // The argument `project` of each tool is now `workspace`. A call with both keeps `workspace`, so a
    // client can send both to a bridge of either age (other_computer).
    if (a && "project" in a) {
      if (!loggedNames.has(`${p.name} project`)) console.log(`Yonder tools: the old argument project of ${p.name} is workspace`), loggedNames.add(`${p.name} project`);
      if (!("workspace" in a)) a.workspace = a.project;
      delete a.project;
    }
    if (a && Array.isArray(a.images)) {
      if (!loggedNames.has(`${p.name} images`)) console.log(`Yonder tools: the old argument images of ${p.name} is files`), loggedNames.add(`${p.name} images`);
      a.files = [...new Set([...(Array.isArray(a.files) ? a.files : []), ...a.images])];
      delete a.images;
    }
    // The location of the phone tool is get_location now.
    const [to, args] = p.name === "phone" && p.arguments?.ability === "location" ? ["get_location", () => ({})] as const : RENAMED[p.name] ?? [];
    if (!to || !args) continue;
    if (!loggedNames.has(p.name)) console.log(`Yonder tools: the old name ${p.name} is ${to}`), loggedNames.add(p.name);
    [p.name, p.arguments] = [to, args(p.arguments ?? {})];
  }
  return new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(body), signal: req.signal });
}
// The tools that a list does not show, and that a call still reaches. list_folders is for the folder picker of the
// phone. rebuild_app (the Update button of the app) and restart_bridge are for the copy with the source: a user of a
// download does not change the bridge.
const HIDDEN = new Set(["list_folders", ...(SOURCE ? [] : ["rebuild_app", "restart_bridge"])]);
async function unlisted(res: Response) {
  const body = await res.json();
  for (const m of [body].flat()) if (m?.result?.tools) m.result.tools = m.result.tools.filter((t: { name: string }) => !HIDDEN.has(t.name));
  return Response.json(body, { status: res.status });
}
async function mcpRequest(req: Request, device: string, brain = "", caller = "") {
  // No stream of server messages: this server never sends one, and an idle stream times out.
  if (req.method === "GET") return new Response(null, { status: 405 });
  req = await renamed(req);
  const listing = req.method === "POST" && (await req.clone().text()).includes('"tools/list"');
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server(device, brain, caller, req.signal).connect(transport);
  const res = await transport.handleRequest(req);
  return listing && res.ok ? unlisted(res) : res;
}
// Yonder in the Claude app, as a custom connector, through the relay (and the tunnel of Yonder Preview for the first
// connectors). Its token is the lock, so it gets no device, as a CLI on this Mac. When the page of Claude opens, the
// open code goes to the phones, also while the user works on the Mac, because the page can be on the phone.
const connector = startRemote(CONFIG, () => preview.status().suffix, (req) => mcpRequest(req, ""), connectorAddress, (code) =>
  void relay?.push("Code for Claude", `${code.slice(0, 3)} ${code.slice(3)}`));
// The address of the connector on the relay: https://mcp.yonder.so/<id> on the relay of Yonder, or the host of a relay
// of the user's own, which answers the same paths. Undefined while the relay is not connected. The old
// address https://tunnel.yonder.so/<id>/mcp still works.
function connectorAddress() {
  const s = relay?.status();
  if (!s?.connected || !s.connector) return;
  return `${s.relay === DEFAULT_RELAY ? "https://mcp.yonder.so" : new URL(s.relay.replace(/^ws/, "http")).origin}/${s.connector}`;
}
// The web servers of an agent, the best first: each one that its last message names ("The site runs on
// http://localhost:5173"), then each one in its git worktree. A server in the main folder of a project belongs to the
// project, not to one agent, and it can be a tool, such as the graph of codebase-memory. So it is not the site of an
// agent.
function sitesOf<T extends { path: string; port: number; label: string }>(w: Worker, sites: T[]) {
  const inside = (dir: string) => (s: { path: string }) => !!s.path && (s.path === dir || s.path.startsWith(`${dir}${sep}`));
  const named = [...w.result.matchAll(/(?:localhost|127\.0\.0\.1|\[::1\]):(\d{2,5})/g)].map((m) => Number(m[1]));
  // A message can also name the private address of a preview, such as https://sundial-sam.yonder.so. Else "show me the
  // website" after such an address makes Grok ask the agent.
  const suffix = preview.status().suffix;
  const labels = suffix ? [...w.result.matchAll(new RegExp(`https://([a-z0-9-]+)${suffix.replace(/\./g, "\\.")}`, "g"))].map((m) => m[1]) : [];
  return [
    ...new Set([
      ...sites.filter((s) => named.includes(s.port) && inside(w.cwd ?? w.path)(s)),
      ...sites.filter((s) => labels.includes(s.label)),
      // Only a git worktree: else an agent in a folder of many projects gets each server in it, also the graph of
      // codebase-memory, as its site in the Canvas tab.
      ...(w.cwd && /[/\\]\.claude[/\\]worktrees[/\\][^/\\]+$/.test(w.cwd) ? sites.filter(inside(w.cwd)) : []),
    ]),
  ];
}
// The web server of an agent: the first of sitesOf.
function siteOf(w: Worker, sites = preview.sites()) {
  const site = sitesOf(w, sites)[0];
  return site ? { label: site.label, port: site.port, title: site.title } : undefined;
}
// The name of a site from Haiku, such as "Landing page" in place of ":5180", so that the user knows what each site is.
// It runs once for each label while the bridge runs, three at a time, and the list never waits for it. A site keeps
// its name (`auto` in canvas/state.json).
const naming = new Set<string>();
let namesAsked = 0;
function nameSite(s: { label: string; project: string; worktree?: string; port: number; title: string; url?: string }, by: Worker[]) {
  if (naming.has(s.label) || namesAsked >= 3) return;
  naming.add(s.label);
  namesAsked++;
  const facts = [
    `Project folder: ${s.project}`,
    s.worktree && `Git worktree: ${s.worktree}`,
    s.url ? `Address: ${s.url}` : `Port: ${s.port}`,
    s.title && `Page title: ${s.title}`,
    ...by.slice(0, 3).map((w) => `Task of an agent in its folder: ${w.name}`),
  ].filter(Boolean).join("\n");
  const system =
    "You name a web site for a list of apps on a phone. Answer with the name only: two to four words, in sentence case, " +
    "that say what the site is, such as \"Landing page\" or \"Invoice dashboard\". No port, no \"localhost\", no quotes and no period.";
  void ask(system, facts)
    .then((text) => {
      const auto = text.trim().split("\n")[0].replace(/^["'“]+|["'”.]+$/g, "").slice(0, 40).trim();
      if (auto) canvas.changeSite(s.label, { auto });
    }, () => {})
    .finally(() => namesAsked--);
}

// The answer of the user to an ask: Allow or Deny, the code of a `code` ask, the pick of a `choice` ask, and the device
// that answered. `expired`: no answer came before `until`.
type Answer = { allow: boolean; value?: string; choice?: string; device?: string; expired?: true };
// The questions of the workers that wait for the user, by the id in `ask` of the worker: the tool calls that wait for
// Allow or Deny, and the approvals of ask_user (docs/canvas.md).
const asks = new Map<string, { ask: Ask; end: (a: Answer) => void }>();
function askUser(w: Worker, question: Omit<Ask, "id">, signal: AbortSignal) {
  return new Promise<Answer>((resolve) => {
    const ask = { id: crypto.randomUUID().slice(0, 8), ...question };
    // A tap of the user sets the agent to running. A stop (halt) removes `ask` first, and keeps the status that it sets.
    const end = (a: Answer) => {
      clearTimeout(timer);
      asks.delete(ask.id);
      touching.get(ask.id)?.abort();
      if (w.ask?.id === ask.id) {
        delete w.ask;
        Object.assign(w, { status: "running", activity: a.allow ? ask.tool : "", startedAt: Date.now(), updatedAt: Date.now() });
        save();
      }
      resolve(a);
    };
    const timer = ask.until ? setTimeout(() => end({ allow: false, expired: true }), ask.until - Date.now()) : undefined;
    asks.set(ask.id, { ask, end });
    // The session ended or stopped while it waited, so the question goes away.
    signal.addEventListener("abort", () => (clearTimeout(timer), asks.delete(ask.id), w.ask?.id === ask.id && (delete w.ask, save())));
    Object.assign(w, { ask, status: "waiting", activity: "", unread: true, attention: true, answered: false, updatedAt: Date.now() });
    save();
    const what = ask.kind ? `Asks you: ${ask.title}${ask.amount ? ` · ${ask.amount}` : ""}` : `Waits for you: ${ask.tool} ${ask.text}`;
    // Only a phone can say yes to an ask with Face ID and no Touch ID, so its push goes also while the user works on the computer.
    if (ask.faceId && !ask.touchId) void relay?.push(`${w.num ? `${pushName(w)} · ` : ""}${w.name}`, what.slice(0, 200), phonesOf(w.owner));
    else push(`${w.num ? `${pushName(w)} · ` : ""}${w.name}`, what.slice(0, 200), w);
  });
}

// 1Password for the agents (bridge/vault.ts, docs/secrets.md). The token of the service account is sealed to the phones.
const vault = startVault(CONFIG);
// The requests for 1Password that wait for a yes on a phone, by the id in `ask`. The yes carries the key that opens the
// token, so a tap that a program fakes on /permission can only deny.
type Yes = { key: Uint8Array<ArrayBuffer>; device: string };
const secretAsks = new Map<string, (yes?: Yes) => void>();
const SECRET_WAIT = 10 * 60_000; // As an approval of the Canvas (docs/canvas.md).
function askSecret(w: Worker, card: { title: string; text: string; rows: [string, string][] }, signal: AbortSignal) {
  return new Promise<Yes | undefined>((resolve) => {
    const id = crypto.randomUUID().slice(0, 8);
    const end = (yes?: Yes) => {
      clearTimeout(timer);
      secretAsks.delete(id);
      asks.delete(id);
      touching.get(id)?.abort();
      if (w.ask?.id === id) {
        delete w.ask;
        Object.assign(w, { status: "running", activity: yes ? "1Password" : "", startedAt: Date.now(), updatedAt: Date.now() });
        save();
      }
      resolve(yes);
    };
    const timer = setTimeout(() => end(), SECRET_WAIT);
    secretAsks.set(id, end);
    // On a Mac, the window of Yonder can approve with Touch ID and its own key (/vault/approve).
    const ask: Ask = { id, tool: "1Password", text: card.text, kind: "secret", title: card.title, rows: card.rows, faceId: true, touchId: process.platform === "darwin", until: Date.now() + SECRET_WAIT, seals: vault.seals() };
    // Deny in the app comes on /permission, as for the other questions, and so does a stop of the agent (halt).
    asks.set(id, { ask, end: (a) => !a.allow && end() });
    signal.addEventListener("abort", () => end());
    Object.assign(w, { ask, status: "waiting", activity: "", unread: true, attention: true, answered: false, updatedAt: Date.now() });
    save();
    // A Mac window with a seal can say yes, so the push waits while the user works on the Mac. Else only a phone can.
    const title = `${w.num ? `${pushName(w)} · ` : ""}${w.name}`;
    const body = `Waits for you: 1Password, ${card.title}`.slice(0, 200);
    if (ask.touchId && vault.macReady()) push(title, body, w);
    else void relay?.push(title, body, phonesOf(w.owner));
  });
}

// The agent whose session calls, from the address in its --mcp-config: its ID, or its ID before the session started.
// The ID alone is not enough, else each agent that Yonder starts gets "use_secret works only for an agent that
// Yonder started": a new agent gets its ID from its session, after the --mcp-config of the session has the first ID.
const byCaller = (caller: string) => (caller ? state.workers.find((x) => x.id === caller || x.startId === caller) : undefined);
// The key of an agent in the address of its MCP server: an HMAC of its ID with a secret that only the bridge keeps
// (worker-key, mode 600). The ID of an agent is public (list_workers), so without the key a program or another computer
// could call as that agent, such as use_secret within its yes. The workers do not get the secret, so one agent cannot
// make the key of another. A program of this user can still read the file, or the address of a worker in `ps`.
const WORKER_KEY = join(CONFIG, "worker-key");
let workerSecret = "";
function workerKey(id: string) {
  if (!workerSecret) {
    if (!existsSync(WORKER_KEY)) writeFileSync(WORKER_KEY, randomBytes(32).toString("hex"), { mode: 0o600 });
    workerSecret = readFileSync(WORKER_KEY, "utf8").trim();
  }
  return createHmac("sha256", workerSecret).update(`worker ${id}`).digest("hex").slice(0, 32);
}
function mcpUrl(w: Worker) {
  return `http://127.0.0.1:${PORT}/mcp?worker=${w.id}&key=${workerKey(w.id)}`;
}
// The agent of an MCP request: its ID, "" for none, or undefined for a forged ID. The first call with a valid key marks
// the agent (`keyed`), and from then on its ID alone is refused. An agent whose session has an address from before the
// key never sends one, so it keeps working with its ID alone.
function callerOf(url: URL) {
  const id = url.searchParams.get("worker") ?? "";
  const key = url.searchParams.get("key");
  if (key === null) return id && byCaller(id)?.keyed ? undefined : id;
  if (!sameToken(key, workerKey(id))) return undefined;
  const w = byCaller(id);
  if (w && !w.keyed) (w.keyed = true), save();
  return id;
}

// use_secret: a yes on the phone or with Touch ID in the Mac window, or a yes of the last minutes for the same agent, items and use. Then the command runs
// with the secrets, or the fields of the page get them. The agent gets the output or the count, never a value.
type SecretUse = { why: string; run?: string; env?: Record<string, string>; stdin?: string; fill?: Record<string, string>; minutes?: number };
async function useSecret(caller: string, a: SecretUse, signal: AbortSignal) {
  const w = byCaller(caller);
  if (!w) throw new Error("use_secret works only for an agent that Yonder started.");
  if (!a.run === !a.fill) throw new Error("Give run or fill, one of the two.");
  if (a.fill && (a.env || a.stdin)) throw new Error("env and stdin go with run.");
  const refs = [...new Set([...Object.values(a.run ? (a.env ?? {}) : (a.fill ?? {})), ...(a.stdin ? [a.stdin] : [])])];
  if (!refs.length) throw new Error("Name at least one secret, as op://<vault>/<item>/<field>.");
  const bad = refs.find((r) => !REF.test(r));
  if (bad) throw new Error(`${bad} is not a 1Password reference. Write op://<vault>/<item>/<field>, and call list_secrets for the items.`);
  // The key of a kept yes: a run counts again only with the same command, folder, env and stdin, so a yes for one command
  // never gives a value to another command, such as one that prints it in base64. A fill counts again on the same site.
  const use = a.run ? JSON.stringify([w.cwd ?? w.path, a.run, a.env ?? {}, a.stdin ?? ""]) : "fill";
  const minutes = a.minutes ?? 10;
  const harness = a.fill ? (locate("browser-harness") ?? locate("browser-harness.exe")) : undefined;
  if (a.fill && !harness) throw new Error("browser-harness is not installed. Tell the user to install it in Settings, Tools.");
  const site = harness ? (await inTab(harness, {})).site : undefined;
  if (harness && !site?.startsWith("http")) throw new Error("The tab of browser-harness is on no web site. Open the sign-in page first.");
  const line = { agent: w.num, name: w.name, refs, use: a.run ?? site, why: a.why };
  let values: Values | undefined = vault.find(w.id, refs, use, site);
  if (values) vault.log({ ...line, answer: "kept" });
  else {
    if (!vault.status().connected)
      throw new Error("1Password is not connected. Ask the user to paste the token of the 1Password service account on the phone: Settings, General, 1Password.");
    // The websites of the items from the last yes, so a fill that cannot go to this site asks nothing. The read checks again.
    const known = vault.items();
    const early = site && refs.find((r) => {
      const item = itemIn(r, known);
      return item && !siteFits(site, item.sites);
    });
    if (early) throw new Error(`${site} is not a website of the 1Password item ${itemOf(early)}, so nothing was asked or filled.`);
    // An agent has one card at a time: a second card would take the place of the first.
    if (w.ask) throw new Error("Another request of this agent waits for the user. Wait for its answer, then ask again.");
    const yes = await askSecret(w, {
      // The title of each item, also for a reference by ID, such as for two items named google.com.
      title: [...new Set(refs.map((r) => itemIn(r, known)?.title ?? itemOf(r)))].join(", "),
      text: a.why,
      rows: [
        ["Vault", [...new Set(refs.map((r) => r.slice(5).split("/")[0]))].join(", ")],
        ["Use", a.run ?? `Sign in on ${new URL(site!).host}`],
        ["For", minutes ? `${minutes} min` : "Once"],
      ],
    }, signal);
    if (!yes) {
      vault.log({ ...line, answer: "no" });
      throw new Error("The user did not approve it. Do not ask again unless the user says so.");
    }
    try {
      values = await vault.read(yes.device, yes.key, refs);
      const off = site ? refs.find((r) => !siteFits(site, values!.get(r)!.sites)) : undefined;
      if (off) throw new Error(`${site} is not a website of the 1Password item ${itemOf(off)}, so nothing was filled.`);
    } catch (e) {
      vault.log({ ...line, answer: "yes", device: yes.device, faceId: true, error: (e as Error).message });
      throw e;
    }
    if (minutes) vault.keep({ worker: w.id, refs, use, site, until: Date.now() + minutes * 60_000, values });
    vault.log({ ...line, answer: "yes", device: yes.device, faceId: true, minutes });
  }
  const secret = (ref: string) => values.get(ref)!.value;
  if (a.run) {
    const env = Object.fromEntries(Object.entries(a.env ?? {}).map(([name, ref]) => [name, secret(ref)]));
    return runWith(a.run, w.cwd ?? w.path, env, a.stdin && secret(a.stdin), [...values.values()].map((v) => v.value));
  }
  return inTab(harness!, { site, fill: Object.entries(a.fill!).map(([selector, ref]) => [selector, secret(ref)]) });
}
// A request through the relay from a paired phone. The relay sets this header with a value that lives only in the memory of
// the bridge, so a program on this Mac cannot send it. `x-yonder-device` alone is a header that any program can set.
const fromPhone = (req: Request) => req.headers.get("x-yonder-relay") === RELAY_MARK;
// The open prompts of Touch ID, by the id of the ask. The end of the ask closes its prompt.
const touching = new Map<string, AbortController>();
// Touch ID, or the password of the Mac, that the bridge asks itself through LocalAuthentication, so a program on this Mac
// cannot fake the yes. macOS names osascript in the dialog. A test bridge never asks: YONDER_OWNER_CHECK=yes gives a yes
// there, and the live bridge ignores it.
async function ownerCheck(reason: string, signal: AbortSignal) {
  if (TEST) return process.env.YONDER_OWNER_CHECK === "yes";
  const jxa = `ObjC.import("LocalAuthentication"); function run(argv) { const c = $.LAContext.alloc.init; let done = null;
    c.evaluatePolicyLocalizedReasonReply(2, argv[0], (ok) => { done = ok; });
    while (done === null) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1));
    return done ? "yes" : "no"; }`;
  const p = Bun.spawn(["osascript", "-l", "JavaScript", "-e", jxa, reason], { stdout: "pipe", stderr: "ignore" });
  signal.addEventListener("abort", () => p.kill(), { once: true });
  return (await new Response(p.stdout).text()).trim() === "yes";
}
// The GET routes with a cost or a change, which a page of another site must not open blind (`sec-fetch-site`).
const BLIND = new Set(["/gist", "/summary", "/setup", "/logins", "/sync", "/show", "/conversation", "/token"]);
// The new task links whose sheet is open, by nonce, with the time of the check of /link.
const linkSheets = new Map<string, number>();

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req, http) {
    const origin = req.headers.get("origin");
    // The Host check stops DNS rebinding. The Origin check stops other web pages.
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.get("host") ?? "") || (origin && !ORIGINS.includes(origin))) {
      return new Response("Forbidden", { status: 403 });
    }
    const cors: Record<string, string> = origin
      ? {
          "access-control-allow-origin": origin,
          "access-control-allow-headers": "content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id, x-yonder-token",
          "access-control-allow-methods": "GET, POST, PUT, DELETE",
          "access-control-expose-headers": "mcp-session-id",
        }
      : {};
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    // Only this OS user: a request with the token of config.json, with its cookie, or from a program of this user
    // (bridge/peer.ts). So the other user of a shared computer cannot reach this bridge. The token is the fast way: the
    // check of the user runs lsof.
    const key = bridgeToken();
    const byCookie = sameToken(cookie(req.headers.get("cookie"), `yonder-${PORT}`), key);
    const client = http.requestIP(req)?.port;
    if (!byCookie && !sameToken(req.headers.get("x-yonder-token"), key) && !(await sameUser(client, PORT, TEST)))
      // On a computer with one user, this line is a bug.
      return console.error(`Refused ${req.method} ${new URL(req.url).pathname} from port ${client}: not a program of this user, and no token.`), new Response(`This bridge belongs to another user of this computer. The port of your own bridge is "port" in ${join(CONFIG, "config.json")}.`, { status: 403, headers: cors });

    const url = new URL(req.url);
    // An <img> or a link of another web page sends no Origin, so the Origin check passes it. These routes cost money or
    // change something, so they refuse a request with no Origin that the browser marks as from another site.
    const site = req.headers.get("sec-fetch-site");
    if (!origin && (site === "cross-site" || site === "same-site") && BLIND.has(url.pathname)) return new Response("Forbidden", { status: 403 });
    let res: Response;
    if (url.pathname === "/mcp") {
      // A tool can wait for the user, such as ask_user for up to 10 minutes, so the idle timeout of Bun (10 seconds) is off.
      http.timeout(req, 0);
      const caller = callerOf(url);
      res = caller === undefined
        ? new Response("The key in this address does not match the agent.", { status: 403, headers: cors })
        : await mcpRequest(req, deviceOf(req), url.searchParams.get("brain") ?? "", caller);
    } else if (url.pathname === "/show") {
      // The sites that preview opens on this device. `after` is the newest site that the device has, so those go.
      const device = deviceOf(req) || "mac";
      const after = Number(url.searchParams.get("after")) || 0;
      toShow = toShow.filter((s) => fresh(s) && !(s.device === device && s.id <= after));
      // A phone names its abilities in `abilities`, and also gets its asks (useAbility). A screen from before the abilities
      // polls with `locate` and gets only the asks for its location, with `locate: true`, which it answers.
      const names = url.searchParams.get("abilities")?.split(",").filter(Boolean) ?? (url.searchParams.has("locate") ? ["location"] : undefined);
      const asking = !!names && isPhone(device);
      if (asking) polled.set(device, { at: Date.now(), abilities: new Set(names) });
      const screen = parseScreen(url.searchParams.get("screen") ?? "");
      if (screen) keepScreen(device, screen);
      const mine = asking ? [...phoneAsks].filter(([id, a]) => a.device === device && id > after).map(([id, a]) => ({ id, ability: a.ability, args: a.args, locate: a.ability === "location" || undefined })) : [];
      const shows = toShow.filter((s) => s.device === device || (s.device === "phone" && asking));
      toShow = toShow.filter((s) => s.attach === undefined || !shows.includes(s));
      res = Response.json([...shows, ...mine].sort((a, b) => a.id - b.id));
    } else if ((url.pathname === "/answer" || url.pathname === "/location") && req.method === "POST" && url.searchParams.has("id")) {
      // The answer of a phone to an ask: the result, or `error`. A screen from before the abilities answers its location
      // at /location.
      const body = await req.json().catch(() => ({}));
      const ask = phoneAsks.get(Number(url.searchParams.get("id")));
      const mine = ask?.device === deviceOf(req);
      if (mine) ask!.done(body);
      res = new Response(null, { status: mine ? 204 : 404 });
    } else if (url.pathname === "/location" && req.method === "POST") {
      // The pin for the get_location of the Grok of the phone, which gets the place name here and goes to phone.log.
      const body = await req.json().catch(() => ({}));
      res = await placed(body).then(
        (pin) => (audit("the voice agent on the phone", deviceOf(req), "location", `given, within ${pin.accuracy_meters} m`), Response.json(pin)),
        (e) => new Response((e as Error).message, { status: 400 }),
      );
    } else if (url.pathname === "/token" && req.method === "POST") {
      // The ElevenLabs model: the app sends the tools and the audio rate of the call, and gets a signed URL.
      const key = dotenv("ELEVENLABS_API_KEY");
      const { tools, rate } = await req.json();
      res = !key
        ? Response.json({ error: `Put ELEVENLABS_API_KEY=... in ${CONFIG}/.env` }, { status: 500 })
        : await elevenToken(key, join(CONFIG, "elevenlabs.json"), tools, rate).then((d) => Response.json(d), (e) => Response.json({ error: (e as Error).message }, { status: 502 }));
    } else if (url.pathname === "/token") {
      // `?check`: the voice and speech to text providers whose key is in .env, for the pickers of the Settings and the
      // call button (src/App.tsx). `key` is the xAI key alone, for a phone app from before `keys`.
      // `?provider=openai`: a token for an OpenAI call, from the OPENAI_API_KEY of this Mac.
      res = url.searchParams.has("check")
        ? Response.json({ key: !!dotenv("XAI_API_KEY"), keys: [...Object.entries(VOICE_KEYS).filter(([, name]) => dotenv(name)).map(([id]) => id), ...(hasParakeet() ? ["parakeet"] : [])] })
        : await token(url.searchParams.get("provider") === "openai");
    } else if (url.pathname === "/car") {
      res = Response.json(await car(url.searchParams.get("zone") ?? "", (url.searchParams.get("screen") ?? "car") as Screen));
    } else if (url.pathname === "/grok-usage") {
      res = Response.json(await grokUsage(url.searchParams.has("fresh")));
    } else if (url.pathname === "/claude-usage") {
      const fresh = url.searchParams.has("fresh");
      res = Response.json({ ...(ownDefault() ? {} : await claudeUsage(fresh)), plan: await planUsage(fresh) });
    } else if (url.pathname === "/commands") {
      // The slash commands for the prompt box, with the skills of the project at `path`.
      res = Response.json(commands(url.searchParams.get("path"), url.searchParams.get("cli")));
    } else if (url.pathname === "/favicon") {
      res = favicon(url.searchParams.get("path"));
      // The favicon.svg of a project can hold a script. Opened as an address, it runs in a sandbox, not on the origin of the bridge.
      res.headers.set("content-security-policy", "sandbox");
    } else if (url.pathname === "/media") {
      // A picture, a video or a sound that a conversation shows, or a picture that the user attached. The bridge serves no
      // other file. A queued message is not in the conversation yet, and its pictures load too.
      const path = url.searchParams.get("path") ?? "";
      // A URL that a conversation shows comes through the bridge too, because its server can refuse the page (CORS). The
      // phone saves a picture of Visual Sandbox this way.
      if (/^https?:/.test(path)) {
        const got = shown.has(path) ? await fetch(path).catch(() => undefined) : undefined;
        res = got?.ok ? new Response(got.body, { headers: { "content-type": got.headers.get("content-type") ?? "application/octet-stream" } }) : new Response(null, { status: 404 });
      } else res = (shown.has(path) || dirname(path) === IMAGES || canvas.has(path)) && existsSync(path) ? serve(Bun.file(path), req.headers.get("range")) : new Response(null, { status: 404 });
      // The app shows a page in a sandboxed frame. Opened as an address, it is sandboxed too, so its scripts cannot read the bridge.
      // Each other file runs no script: an SVG of a conversation, opened as an address, ran on the origin of the bridge,
      // which the Origin check lets in, so it could start an agent through /mcp.
      res.headers.set("content-security-policy", canvas.has(path) ? "sandbox allow-scripts" : "sandbox");
    } else if (url.pathname === "/shot") {
      // The still of a page of the Canvas tab at the size of its card in a chat, in the colors of the screen (bridge/shot.ts).
      // A chat that waits for several stills can wait longer than the 10 seconds of Bun.
      http.timeout(req, 0);
      const q = url.searchParams;
      const path = q.get("path") ?? "";
      const [w, h, scale] = ["w", "h", "s"].map((k) => Number(q.get(k)));
      const vars = q.get("look") ?? "";
      const fits = Number.isInteger(w) && Number.isInteger(h) && w >= 100 && w <= 1200 && h >= 100 && h <= 2400 && (scale === 1 || scale === 2);
      const file = canvas.has(path) && existsSync(path) && fits && vars.length < 2000 && !/[<>{}]/.test(vars)
        ? await shot(path, { w, h, scale, vars, dark: q.has("dark") }).catch(() => undefined)
        : undefined;
      res = file ? new Response(Bun.file(file)) : new Response(null, { status: 404 });
    } else if (url.pathname === "/canvas" && req.method === "POST") {
      // A message of a page in the viewer to this computer: { path, message } (canvas.send, docs/canvas.md).
      const { path, message } = await req.json().catch(() => ({}));
      try {
        canvas.send(String(path ?? ""), message);
        res = new Response(null, { status: 204 });
      } catch (e) {
        res = new Response((e as Error).message, { status: 400 });
      }
    } else if (url.pathname === "/canvas") {
      // The pages of the Canvas tab, the newest first, with the file of the newest version for /media (docs/canvas.md). The
      // pages in the archive come only with ?all, which the screen of the archive asks for: a screen from before the
      // archive knows no `archived`, and its delete brought the page back with the next load.
      const all = url.searchParams.has("all");
      res = Response.json(
        canvas.list().filter((a) => all || !a.archived).map((a) => {
          const w = a.worker ? state.workers.find((x) => x.id === a.worker) : undefined;
          return { ...a, path: canvas.path(a), ...(w && { num: w.num, name: w.name }) };
        }),
      );
    } else if (url.pathname === "/save" && req.method === "POST") {
      // The ↓ of the viewer of the app: a copy of a picture or a video in the Downloads folder of this computer. `src` is a
      // path or a URL that a conversation shows. A body is the bytes of a file of another computer, with its `name`.
      const src = url.searchParams.get("src") ?? "";
      const name = basename(url.searchParams.get("name") || (/^https?:/.test(src) ? new URL(src).pathname : src)) || "file";
      const from = !src ? await req.arrayBuffer()
        : !shown.has(src) && dirname(src) !== IMAGES ? undefined
        : /^https?:/.test(src) ? await fetch(src).then((r) => (r.ok ? r.arrayBuffer() : undefined), () => undefined)
        : existsSync(src) ? Bun.file(src) : undefined;
      if (!from) res = new Response(null, { status: 404 });
      // A tap on a PDF of this computer opens the file where it is, so each tap does not make a new copy.
      else if (url.searchParams.has("open") && from instanceof Blob && /\.pdf$/i.test(src)) (Bun.spawn([OPEN, src]), (res = Response.json({ path: src })));
      else {
        // A file of the same name stays, and the copy gets " 2", " 3" and so on, as in Finder.
        const dot = name.lastIndexOf(".");
        const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
        let to = join(homedir(), "Downloads", name);
        for (let n = 2; existsSync(to); n++) to = join(homedir(), "Downloads", `${stem} ${n}${ext}`);
        await Bun.write(to, from);
        // A tap on a PDF of another computer opens the copy. Only a PDF: `open` also starts an app or a script.
        if (url.searchParams.has("open") && /\.pdf$/i.test(to)) Bun.spawn([OPEN, to]);
        res = Response.json({ path: to });
      }
    } else if (url.pathname === "/log" && req.method === "POST") {
      // The app window has no console that a person or an agent can read, so it logs here.
      appendFileSync(join(CONFIG, "call.log"), `${new Date().toISOString()} ${(await req.text()).slice(0, 2000)}\n`);
      res = new Response(null, { status: 204 });
    } else if (url.pathname === "/awake" && req.method === "POST") {
      // A call on the phone pings each minute, so the Mac stays awake when its screen locks. The Mac app has its own caffeinate.
      // Each ping holds idle sleep off for 2 minutes, so a phone that drops lets the Mac sleep again. The window on Omarchy
      // pings too, and systemd-inhibit holds sleep off there. `?end` comes at the end of a call. On the Mac, the last
      // caffeinate still runs out by itself. Not `idle`: on Linux it would also stop the lock of the screen.
      const end = url.searchParams.has("end");
      callUntil = end ? 0 : Date.now() + 75_000;
      callDevice = end ? "" : deviceOf(req);
      if (!end || !MAC) awake?.kill();
      if (!end)
        try {
          awake = Bun.spawn(LINUX ? ["systemd-inhibit", "--what=sleep", "--who=Yonder", "--why=A Yonder call is live", "sleep", "120"]
            : WINDOWS ? ["powershell", "-NoProfile", "-EncodedCommand", AWAKE_WINDOWS]
            : ["/usr/bin/caffeinate", "-i", "-t", "120"], { stdout: "ignore", stderr: "ignore" });
        } catch {
          awake = undefined; // A Linux with no systemd-inhibit, such as a container.
        }
      res = new Response(null, { status: 204 });
    } else if (url.pathname === "/here" && req.method === "POST") {
      // The app on the computer pings this on input, 30 seconds apart at most. 90 seconds with no input lets the pushes start again.
      hereUntil = Date.now() + 90_000;
      res = new Response(null, { status: 204 });
    } else if (url.pathname === "/events") {
      // The stream of the call key for the windows on Omarchy. The idle timeout of Bun (10 seconds) is off for it.
      http.timeout(req, 0);
      let self: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({ start: (c) => void windows.add((self = c)), cancel: () => void windows.delete(self) });
      res = new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
    } else if (url.pathname === "/call") {
      // The call key of Linux and Windows (`yonder call`): POST starts or ends the call in the newest open window, so two
      // windows never start two calls. GET only counts the windows.
      if (req.method === "POST")
        for (const w of [...windows].reverse())
          try {
            w.enqueue(encoder.encode("event: toggle-call\ndata: {}\n\n"));
            break;
          } catch {
            windows.delete(w);
          }
      res = Response.json({ windows: windows.size });
    } else if (url.pathname === "/status") {
      // The Yonder module of the Omarchy bar (`yonder status`): Waybar-style JSON. The class "active" lights it during a call.
      res = Response.json(await barStatus());
    } else if (url.pathname === "/transcript" && req.method === "POST") {
      // The ID is the start time of the call, so it is also the file name.
      const id = url.searchParams.get("call") ?? "";
      if (!/^\d+$/.test(id)) return new Response("Bad call ID", { status: 400, headers: cors });
      const { who, text } = await req.json();
      appendFileSync(join(CALLS, `${id}.jsonl`), JSON.stringify({ at: Date.now(), who, text: String(text).slice(0, 20000) }) + "\n");
      res = new Response(null, { status: 204 });
    } else if (url.pathname === "/speak" && req.method === "POST") {
      // The voice of a Claude call: ElevenLabs speaks one text of the brain (speak in bridge/eleven.ts). With `voice`,
      // a voice of Grok speaks it as MP3: the brief of the listen button of a conversation (src/App.tsx).
      const { text, voice } = await req.json().catch(() => ({}));
      const name = voice ? "XAI_API_KEY" : "ELEVENLABS_API_KEY";
      const key = dotenv(name);
      res = !key
        ? Response.json({ error: `Put ${name}=... in ${CONFIG}/.env` }, { status: 500 })
        : typeof text !== "string" || !text.trim() || text.length > 5000
        ? new Response("Send a text of 5,000 characters or less.", { status: 400 })
        : voice
        ? await fetch("https://api.x.ai/v1/tts", {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({ text, voice_id: String(voice), language: "en" }),
          }).then(async (r) => (r.ok ? new Response(r.body, { headers: { "content-type": "audio/mpeg" } }) : new Response(`xAI refused the speech (${r.status}): ${(await r.text()).slice(0, 400)}`, { status: 502 })))
        : await speak(key, text);
    } else if (url.pathname === "/brain") {
      // The brain of a Claude call (bridge/brain.ts): the app hears and speaks, and a Claude Code session decides.
      res = await brainRoute(req, url, (call) => startBrain(CLAUDE, `http://127.0.0.1:${PORT}/mcp`, LATEST.sonnet, call, env, SUMMARIZER, readTalk()));
    } else if (url.pathname === "/image" && req.method === "POST") {
      // An image that the user pasted or dropped. The bridge picks the file name and returns the path.
      const ext = IMAGE_TYPES[req.headers.get("content-type") ?? ""];
      const bytes = await req.arrayBuffer();
      if (!ext || !bytes.byteLength || bytes.byteLength > 20_000_000)
        return new Response("Send one PNG, JPEG, GIF or WebP image of 20 MB or less.", { status: 400, headers: cors });
      const path = join(IMAGES, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`);
      writeFileSync(path, new Uint8Array(bytes));
      res = Response.json({ path });
    } else if (url.pathname === "/clipboard-files") {
      // The paths of files that the user copied, or with `drag` the files of the last drag, such as a drop from Finder.
      // The page cannot read them: WebKit hides a file URL.
      res = Response.json({ paths: await clipboardFiles(url.searchParams.has("drag") ? "Apple CFPasteboard drag" : "") });
    } else if (url.pathname === "/local" && req.method === "POST") {
      // A file that the user copied in Finder (localFile). The relay does not pass this route, so only this Mac names a path.
      http.timeout(req, 0);
      res = await localFile(url.searchParams.get("path") ?? "").then((r) => Response.json(r), (e) => new Response((e as Error).message, { status: 400 }));
    } else if (url.pathname === "/record" && req.method === "POST") {
      // The record button of the Mac (recordScreen), with the name of the microphone of the settings (`mic`).
      // It answers when the recording ends: the path of the video, or null on Escape.
      // The relay does not pass this route.
      http.timeout(req, 0);
      res = await recordScreen(url.searchParams.get("mic") ?? "").then((r) => Response.json(r), (e) => new Response((e as Error).message, { status: 409 }));
    } else if (url.pathname === "/record/stop" && req.method === "POST") {
      stopRecording();
      res = new Response(null, { status: 204 });
    } else if (url.pathname === "/paste" && req.method === "POST") {
      // Text that the user pasted. The relay takes 1 MiB at most for each request of the phone.
      const text = await req.text();
      if (!text.trim() || text.length > 1_000_000) return new Response("Send text of 1 MB or less.", { status: 400, headers: cors });
      const path = join(PASTES, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`);
      writeFileSync(path, text);
      res = Response.json({ path });
    } else if (url.pathname.startsWith("/hook/")) {
      res = await hookAt(req, "/hook/");
    } else if (url.pathname.startsWith("/upload/")) {
      // create_upload (bridge/upload.ts). The last part makes the keyframes of a video, which can take more than 10 seconds.
      http.timeout(req, 0);
      res = await uploadAt(req, "/upload/");
    } else if (url.pathname === "/file" && req.method === "POST") {
      // A file that the user attached, such as a PDF. It keeps its name, so the agent knows its type. It comes in parts
      // with the same `id`, because the relay takes 1 MiB at most for each request of the phone. The part with `end`
      // gives the path. A request with no id is the whole file, as from an older app.
      const name = basename(url.searchParams.get("name") ?? "").replace(/[^\w. -]/g, "_").replace(/^\.+/, "") || "file";
      const id = url.searchParams.get("id");
      if (id !== null && !/^[a-z0-9]{8,40}$/.test(id)) return new Response("Send a file with an id of 8 to 40 lowercase letters and digits.", { status: 400, headers: cors });
      const dir = join(FILES, id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      const path = join(dir, name);
      mkdirSync(dir, { recursive: true });
      appendFileSync(path, new Uint8Array(await req.arrayBuffer()));
      const end = id === null || url.searchParams.has("end");
      const size = statSync(path).size;
      if (size > MAX_FILE || (end && !size)) {
        rmSync(dir, { recursive: true, force: true });
        return new Response(`Send one file of ${MAX_FILE / 1e9} GB or less.`, { status: 400, headers: cors });
      }
      res = Response.json(end ? { path: await readable(path) } : { ok: true });
    } else if (url.pathname === "/video" && req.method === "POST") {
      // A video that the user attached, in parts, because the relay takes 1 MiB at most for each request of the phone.
      // Each part goes to the end of the file of `id`. The part with `end` makes the frames and the words, and returns the folder.
      const id = url.searchParams.get("id") ?? "";
      const type = req.headers.get("content-type") ?? "";
      if (!/^[a-z0-9]{8,40}$/.test(id) || !type.startsWith("video/"))
        return new Response("Send a video with an id of 8 to 40 lowercase letters and digits.", { status: 400, headers: cors });
      const dir = join(VIDEOS, id);
      const file = join(dir, `video.${{ "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v" }[type] ?? "mp4"}`);
      mkdirSync(dir, { recursive: true });
      appendFileSync(file, new Uint8Array(await req.arrayBuffer()));
      if (statSync(file).size > MAX_FILE) {
        rmSync(dir, { recursive: true, force: true });
        return new Response(`Send a video of ${MAX_FILE / 1e9} GB or less.`, { status: 400, headers: cors });
      }
      res = url.searchParams.has("end")
        ? await buildVideo(dir, file).then(
            (r) => Response.json(r),
            (e) => (rmSync(dir, { recursive: true, force: true }), new Response((e as Error).message, { status: 400 })),
          )
        : Response.json({ ok: true });
    } else if (url.pathname === "/dictate" && req.method === "POST") {
      // The microphone button of the prompt box and the Claude call: the sound in parts, and the text so far
      // (bridge/dictate.ts). `stt` picks another speech to text model: parakeet on this Mac, one of the cloud, such
      // as soniox, or "whisper", the own model of Walkie-talkie (`speechModel`).
      const id = url.searchParams.get("id") ?? "";
      if (!/^[a-z0-9]{8,40}$/.test(id)) return new Response("Send the sound with an id of 8 to 40 lowercase letters and digits.", { status: 400, headers: cors });
      res = await dictate(id, new Uint8Array(await req.arrayBuffer()), url.searchParams.has("end"), url.searchParams.get("stt") ?? "", dotenv, String(config().speechModel ?? "")).then(
        (text) => Response.json({ text }),
        (e) => new Response((e as Error).message, { status: 500 }),
      );
    } else if (url.pathname === "/calls") {
      // The 50 newest calls, newest first.
      const ids = readdirSync(CALLS)
        .filter((f) => /^\d+\.jsonl$/.test(f))
        .map((f) => Number(f.slice(0, -6)))
        .sort((a, b) => b - a)
        .slice(0, 50);
      res = Response.json(
        ids.map((id) => ({
          id,
          lines: readFileSync(join(CALLS, `${id}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)),
        })),
      );
    } else if (url.pathname === "/conversation") {
      // The conversation of one agent for the app: the last `count` turns (300 at first) of the last 4 MB of its
      // transcript for each 300 turns. The app asks for 300 more when the user scrolls to the top of the Context tab.
      // The relay sends one answer in one frame of 1 MiB, so the oldest turns go until the answer is 900 KB or less.
      // shortcut: so a chat shows about 900 KB of turns at most; send pages with a cursor if the user needs more.
      // The user reads it now, so the result is read. The purple dot stays.
      const count = Math.min(Math.max(Math.round(Number(url.searchParams.get("count"))) || 300, 1), 6000);
      res = await findWorker(url.searchParams.get("worker") ?? "", true).then(
        async (w) => {
          if (w.unread) (w.unread = false), save();
          let list = await turns(w, count, (4_000_000 * Math.max(count, 300)) / 300, true);
          let body = JSON.stringify(list);
          while (Buffer.byteLength(body) > 900_000 && list.length > 1) (list = list.slice(Math.ceil(list.length / 10))), (body = JSON.stringify(list));
          return new Response(body, { headers: { "content-type": "application/json" } });
        },
        (e) => new Response((e as Error).message, { status: 404 }),
      );
    } else if (url.pathname === "/tool") {
      // The full input and result of one tool call, when the user opens it in the Context tab.
      res = await findWorker(url.searchParams.get("worker") ?? "").then(
        async (w) => Response.json(await toolCall(w, url.searchParams.get("id") ?? "")),
        (e) => new Response((e as Error).message, { status: 404 }),
      ).catch((e) => new Response((e as Error).message, { status: 404 }));
    } else if (url.pathname === "/subagents") {
      // The sub-agents of one agent, for the Agents tab of its conversation view.
      res = await findWorker(url.searchParams.get("worker") ?? "").then(
        async (w) => Response.json(await subagents(w)),
        (e) => new Response((e as Error).message, { status: 404 }),
      );
    } else if (url.pathname === "/summary") {
      // One paragraph about the whole conversation of an agent, for the top of its conversation view.
      res = await findWorker(url.searchParams.get("worker") ?? "", true).then(
        async (w) => {
          const text = await summary(w);
          const s = summaryOf(w) ? state.summaries[w.sessionId] : undefined;
          return Response.json({ summary: text, spoken: s?.spoken, walkie: s?.walkie });
        },
        (e) => new Response((e as Error).message, { status: 404 }),
      );
    } else if (url.pathname === "/gist") {
      // One or two sentences on the task of an agent and where it stands now, for the summarize button of an agent row on
      // the Mac. Haiku 5.5 writes it fresh each time, from the end of the conversation.
      res = await findWorker(url.searchParams.get("worker") ?? "", true).then(
        async (w) => Response.json({ gist: await gist(w) }),
        (e) => new Response((e as Error).message, { status: 404 }),
      ).catch((e) => new Response((e as Error).message, { status: 500 }));
    } else if (url.pathname === "/mods") {
      // What the mods of an agent show (bridge/mod.ts): POST from Yonder's own mod in the worker, never from a phone, and
      // GET for its conversation view. {} when no mod posted in the last 90 seconds. A toast goes after 15 seconds.
      if (req.method === "POST" && !fromPhone(req)) {
        const m = await req.json().catch(() => ({}));
        if (typeof m.session === "string") mods.set(m.session, { at: Date.now(), band: m.band, panes: Array.isArray(m.panes) ? m.panes : [], status: Array.isArray(m.status) ? m.status.map(String) : [], toasts: Array.isArray(m.toasts) ? m.toasts : [] });
        res = new Response(null, { status: 204 });
      } else
        res = await findWorker(url.searchParams.get("worker") ?? "").then(
          (w) => {
            const { at, toasts = [], ...m } = mods.get(w.sessionId) ?? { at: 0 };
            return Response.json(Date.now() - at < 90_000 ? { ...m, toasts: toasts.filter((t) => Date.now() - t.at < 15_000) } : {});
          },
          (e) => new Response((e as Error).message, { status: 404 }),
        );
    } else if (url.pathname === "/preview") {
      // The Tunnel row of the Settings: GET it, or POST { on }. Off ends each open preview and its links.
      // POST { tunnel } gives this computer the tunnel that the app got from yonder.so for it (src/account.ts).
      // `tunnel` says if this computer has one, and `id` and `computer` are what yonder.so makes it for.
      const body = req.method === "POST" ? await req.json() : {};
      if ("on" in body) {
        state.preview = !!body.on;
        if (!state.preview) for (const o of preview.status().open) preview.stop(o.label);
        save();
      }
      try {
        if (body.tunnel) preview.setup(body.tunnel);
        const s = preview.status();
        res = Response.json({ on: state.preview, approved: state.approved, suffix: s.suffix, tunnel: s.on, ...(!s.on && computerId()) });
      } catch (e) {
        res = new Response((e as Error).message, { status: 400 });
      }
    } else if (url.pathname === "/settings") {
      // The Settings from the schema: GET gives the schema and the values of config.json, POST { key, value } writes one
      // value of config.json after the check of its type. The values of phone.json stay on each phone (src/api.ts).
      const all = settingsSchema();
      const body = req.method === "POST" ? await req.json() : undefined;
      const one = body && all.find((s) => s.key === body.key && (s.store === "config" || s.store === "claude"));
      if (body && (!one || !fitsSetting(one, body.value))) res = Response.json({ error: `${String(body.key)} cannot be ${JSON.stringify(body.value)}.` }, { status: 400 });
      else {
        if (one?.store === "claude") {
          // A key of settings.json of Claude Code, in each of its config folders. A switch with `on` writes that value, and
          // off deletes the key.
          const v = one.on === undefined ? body.value : body.value ? one.on : undefined;
          for (const dir of claudeDirs().filter((d) => existsSync(d))) editJson(join(dir, "settings.json"), (c) => (v === undefined ? delete c[one.key] : (c[one.key] = v)));
        } else if (one) {
          if (one.key in SETTINGS) (state as Record<string, unknown>)[one.key] = body.value;
          else editJson(CONFIG_FILE, (c) => void (c[one.key] = body.value));
          save();
          // The Tunnel off ends each open preview and its links, as /preview does.
          if (one.key === "preview" && !body.value) for (const o of preview.status().open) preview.stop(o.label);
        }
        const c = config();
        // The sections in order, and a section of the user (a setting of ~/.config/yonder/settings.json with a section that
        // the Settings do not have) at the end, with its id as its name.
        const known = new Set(SETTING_SECTIONS.map((s) => s.id));
        const sections = [
          ...SETTING_SECTIONS.map(({ settings: _, ...s }) => s),
          ...[...new Set(all.map((s) => s.section).filter((id) => !known.has(id)))].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1).replace(/-/g, " "), icon: "settings" })),
        ];
        // The line under the Sync switch says when the last sync was, or why it failed.
        // A setting of Claude Code shows the value of the folder of the default profile.
        let claude: Record<string, unknown> = {};
        try {
          claude = JSON.parse(readFileSync(join(claudeDir(profileOf(state.cli)), "settings.json"), "utf8"));
        } catch {}
        const values = all.filter((s) => s.store === "config" || s.store === "claude").map((s) => [s.key, s.store === "claude" ? (s.on === undefined ? (claude[s.key] ?? s.default) : !!claude[s.key])
          : s.key === "computerName" ? computerName(CONFIG) : s.key in SETTINGS ? (state as Record<string, unknown>)[s.key] : (c[s.key] ?? s.default)]);
        res = Response.json({ sections, schema: all.map((s) => (s.key === "sync" ? { ...s, help: sync.note() } : s)), values: Object.fromEntries(values) });
      }
    } else if (url.pathname === "/summaries") {
      // The Summaries row of the Settings: GET it, or POST { on }.
      if (req.method === "POST") {
        const body = await req.json();
        if (typeof body.on === "boolean") state.sumUp = body.on;
        save();
      }
      res = Response.json({ on: state.sumUp });
    } else if (url.pathname === "/steer") {
      // The Steer row of the Settings: GET it, or POST { on }.
      if (req.method === "POST") {
        state.steer = !!(await req.json()).on;
        save();
      }
      res = Response.json({ on: state.steer });
    } else if (url.pathname === "/clis") {
      // The Profiles section: GET the CLIs on this Mac (?fresh checks them again), or POST { cli } for the default
      // profile, or { id } with on, model, effort, mode, mcp or autoUpdate for one CLI.
      if (req.method === "POST") {
        const body = await req.json();
        if (body.cli === "claude" || CLIS[body.cli] || profileOf(body.cli)) state.cli = body.cli;
        const cli = CLIS[body.id];
        if (cli || body.id === "claude") {
          const own = (state.clis[body.id] ??= {});
          if (typeof body.autoUpdate === "boolean") {
            own.autoUpdate = body.autoUpdate;
            if (body.autoUpdate) void refreshHarnesses(String(body.id));
          }
          if (cli && typeof body.on === "boolean") own.on = body.on;
          if (cli && typeof body.model === "string") own.model = body.model.trim() || undefined;
          if (cli && typeof body.effort === "string") own.effort = EFFORTS.includes(body.effort) ? body.effort : undefined;
          if (cli && body.mode in cli.modes) own.mode = body.mode;
          // The tools of Yonder in all the sessions of the CLI, with its own command, as the Claude Code row does.
          const path = checked[body.id]?.path;
          if (cli && typeof body.mcp === "boolean" && cli.mcp && path) {
            await cli.mcp.remove(path).catch(() => {});
            if (body.mcp) await cli.mcp.add(path, `http://127.0.0.1:${PORT}/mcp`).catch((e) => console.error(`Cannot add yonder to ${cli.name}:`, e));
            await cliState(body.id, true);
          }
        }
        save();
      }
      res = Response.json(await clisInfo(url.searchParams.has("fresh")));
    } else if (url.pathname === "/setup") {
      // The sign-in of a profile with its own folder (the page of the profile), and the setup of Claude Code for a screen
      // from before /logins: GET gives { step, url, error }, or {} when it is ready, and starts the sign-in when it is
      // needed. POST { code } gives the code of the page to the sign-in, and POST {} starts it again.
      const p = profileOf(url.searchParams.get("profile") ?? undefined);
      const key = claudeKey(p);
      if (req.method === "POST") {
        http.timeout(req, 90);
        const code = String((await req.json()).code ?? "").trim();
        if (code && loginOf(key)?.url) await answer(key, code);
        else if (p) claudeSignIn(p);
        else cliLogin("claude");
      } else if (p) {
        if (!loginOf(key) && !(await accountOf(p))) claudeSignIn(p);
      } else if (plainNeeded() && !loginOf(key)?.error && existsSync(CLAUDE) && !claudeLoggedIn) setUp();
      const l = loginOf(key);
      res = Response.json(l && l.step !== "signed-out" ? { step: l.step, url: l.url, error: l.error } : {});
    } else if (url.pathname === "/setup-guide") {
      res = new Response(setupGuide(), { headers: { "content-type": "text/markdown; charset=utf-8" } });
    } else if (url.pathname === "/setup-agent" && req.method === "POST") {
      // The last step of the first run: an agent on the default CLI sets up the rest with the user (setupTask).
      const w = await startWorker({ project: homeProject().path, task: setupTask(), name: "Set up Yonder" });
      res = Response.json({ id: w.id, num: w.num });
    } else if ((url.pathname === "/setup-export" || url.pathname === "/setup-import") && req.method === "POST") {
      // Export and Import of the General settings (exportConfig): { keys } saves the file in Downloads of this computer,
      // and { text, keys } applies the text of a file.
      const body = (await req.json().catch(() => ({}))) as { text?: unknown; keys?: unknown };
      try {
        res = Response.json(url.pathname === "/setup-export" ? exportConfig(undefined, body.keys === true) : importConfig(String(body.text ?? ""), body.keys === true));
      } catch (e) {
        res = Response.json({ error: (e as Error).message }, { status: 400 });
      }
    } else if (url.pathname === "/config-file") {
      // The Config file row of Settings, General: GET gives the path and the text of config.json, for the phone. POST
      // opens it in the text editor of this computer.
      if (req.method === "POST") {
        Bun.spawn(MAC ? ["open", "-t", CONFIG_FILE] : WINDOWS ? ["cmd", "/c", "start", "", CONFIG_FILE] : ["xdg-open", CONFIG_FILE], { env, stdout: "ignore", stderr: "ignore" });
        res = Response.json({ path: CONFIG_FILE });
      } else res = Response.json({ path: CONFIG_FILE, text: existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, "utf8") : "" });
    } else if (url.pathname === "/logins") {
      // The cards of the Agents tab: the install and the sign-in of each CLI (logins.ts). GET gives them, and starts the
      // sign-in of Claude Code when it is installed and not signed in. A missing Claude Code waits for Install on its
      // page, or for an agent that needs it: the user can start with Hermes or another CLI. POST { id, action, code } runs cliLogin. The
      // sign-ins of the profiles show only on their pages.
      let error: string | undefined;
      if (req.method === "POST") {
        http.timeout(req, 90);
        const { id, action, code } = await req.json();
        error = await cliLogin(String(id), action, String(code ?? "")).then(async () => void (await withLink(String(id))), (e) => (e as Error).message);
      } else if (plainNeeded() && !loginOf("claude")?.error && existsSync(CLAUDE) && !claudeLoggedIn) setUp();
      res = error ? Response.json({ error }, { status: 400 }) : Response.json(logins().filter((l) => !l.id.includes(":")));
    } else if (url.pathname === "/profiles" && req.method === "POST") {
      // The page of a profile in the Settings: POST { profile } adds or changes one, and POST { remove } removes one. It
      // gives the CLIs of /clis. The folder of a removed profile stays, with its login and its history.
      const body = await req.json();
      const fail = (error: string) => Response.json({ error }, { status: 400 });
      if (typeof body.remove === "string") {
        if (state.workers.some((w) => w.profile === body.remove && w.status === "running"))
          res = fail("Agents of this profile still run. Stop them first.");
        else {
          const gone = profileOf(body.remove);
          state.profiles = state.profiles.filter((p) => p.id !== body.remove);
          if (state.cli === body.remove) state.cli = "claude";
          // The schedules keep the id. The next start does not run, and the page shows why.
          for (const s of state.schedules)
            if (s.profile === body.remove) s.missed = { at: Date.now(), why: `The profile ${gone?.name ?? "of this schedule"} was removed. Pick another profile.` };
          save();
          res = Response.json(await clisInfo());
        }
      } else {
        const v = body.profile ?? {};
        const name = String(v.name ?? "").trim();
        const flags = String(v.flags ?? "").trim();
        const vars = Object.fromEntries(Object.entries(v.env ?? {}).map(([k, x]) => [k.trim(), String(x)]).filter(([k]) => k));
        const bad = flagsOf({ flags } as Profile).find((f) => OWN_FLAGS.test(f));
        const badName = Object.keys(vars).find((k) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k));
        if (!name) res = fail("Give the profile a name.");
        else if (v.cli !== "claude" && !CLIS[v.cli]) res = fail(`Yonder knows no CLI "${v.cli}".`);
        else if (bad) res = fail(`Yonder sets ${bad} itself. Remove it from the extra flags.`);
        else if (badName) res = fail(`"${badName}" is not a name for a variable. Use letters, digits and _.`);
        else {
          // A new profile gets an ID from its name, which is not the ID or the name of a CLI or of another profile.
          const old = profileOf(v.id);
          const taken = (id: string) => id === "claude" || !!CLIS[id] || !!ALIASES[id] || state.profiles.some((p) => p !== old && p.id === id);
          let id = old?.id ?? (norm(name.replace(/^claude\s+/i, "")) || "profile");
          for (let i = 2; !old && taken(id); i++) id = `${norm(name) || "profile"}${i}`;
          const p: Profile = { id, name, cli: v.cli, ...(v.own && v.cli === "claude" && { own: true }), ...(v.own && v.cli === "claude" && v.ownMcp && { ownMcp: true }), ...(old?.folder && { folder: old.folder }),
            ...(String(v.program ?? "").trim() && { program: String(v.program).trim() }), ...(flags && { flags }), ...(Object.keys(vars).length && { env: vars }) };
          state.profiles = old ? state.profiles.map((x) => (x === old ? p : x)) : [...state.profiles, p];
          if (p.own) makeFolder(p);
          save();
          res = Response.json({ ...(await clisInfo()), id });
        }
      }
    } else if (url.pathname === "/agents/registry") {
      // The agents of the ACP registry that the user can add in the Agents tab, with no agent that has a row of its own.
      const added = new Set((state.added ?? []).map((a) => a.id));
      const list = await registry(CONFIG).catch((e) => (console.error("Cannot read the ACP registry:", e), []));
      res = Response.json(list.filter((e) => !BUILT_IN[e.id]).map((e) => ({ id: e.id, name: e.name, description: e.description, version: e.version, added: added.has(e.id) })));
    } else if (url.pathname === "/agents/add" && req.method === "POST") {
      // Adds an agent of the ACP registry: a download, or an npx or uvx command. It is then a CLI of the Agents tab. A
      // download can take longer than the 10 seconds that Bun gives a quiet request.
      http.timeout(req, 300);
      const { id } = await req.json();
      const entry = (await registry(CONFIG)).find((e) => e.id === id && !BUILT_IN[e.id]);
      if (!entry) res = Response.json({ error: `The ACP registry has no agent "${id}" to add.` }, { status: 404 });
      else
        try {
          const a = await install(entry, CONFIG);
          state.added = [...(state.added ?? []).filter((x) => x.id !== a.id), a];
          CLIS[a.id] = addedCli(a);
          // The user added it to use it, so it is on before its first sign-in.
          state.clis[a.id] = { ...state.clis[a.id], on: true };
          save();
          res = Response.json(await clisInfo(true));
        } catch (e) {
          res = Response.json({ error: (e as Error).message }, { status: 500 });
        }
    } else if (url.pathname === "/agents/remove" && req.method === "POST") {
      // Removes an added agent from the Agents tab. Its agents stay, but they cannot run again.
      const { id } = await req.json();
      state.added = (state.added ?? []).filter((a) => a.id !== id);
      if (!CLIS[id]?.found) res = Response.json({ error: `"${id}" is no added agent.` }, { status: 404 });
      else {
        delete CLIS[id];
        delete state.clis[id];
        if (state.cli === id) state.cli = "claude";
        save();
        res = Response.json(await clisInfo());
      }
    } else if (url.pathname === "/clis/terminal" && req.method === "POST") {
      // Install, reinstall or sign in to a CLI in a terminal tab of the Mac, so that the user sees the command and answers
      // its questions. The app shows the command and asks first, because a tap on the phone runs it too.
      const { id, action } = await req.json();
      const cli = CLIS[id];
      if (!cli || !["install", "login"].includes(action)) res = Response.json({ error: `No CLI "${id}" or no action "${action}".` }, { status: 400 });
      else {
        const quote = (a: string) => `'${a.replace(/'/g, "'\\''")}'`;
        const command = action === "login" ? [checked[id]?.path ?? cli.bins[0], ...cli.login].map(quote).join(" ") : cli.install;
        const script = join(CONFIG, `terminal-${id}.sh`);
        const done = "When it is done, close this tab and press Check in the Agents tab of Yonder.";
        // Windows has no sh: cmd runs the command and keeps its window open.
        if (WINDOWS) await inTerminal(HOME, ["cmd", "/k", action === "login" ? [checked[id]?.path ?? cli.bins[0], ...cli.login].join(" ") : cli.install], cli.name);
        else {
          writeFileSync(script, `#!/bin/sh\nprintf '%s\\n\\n' ${quote(`$ ${command}`)}\n${command}\nprintf '\\n%s\\n' ${quote(done)}\nexec "\${SHELL:-/bin/zsh}" -l\n`, { mode: 0o755 });
          await inTerminal(HOME, ["/bin/sh", script], cli.name);
        }
        res = Response.json({ ok: true });
      }
    } else if (url.pathname === "/tools") {
      // The Tools section of the Settings: GET the tools on this computer, or POST { id } to install one (bridge/tools.ts).
      // A tool that is a folder, such as The Mind, becomes a workspace, as add_workspace does.
      if (req.method === "POST")
        installTool(String((await req.json()).id), env, (folder) => {
          if (!state.extra.includes(folder)) state.extra.push(folder);
          state.hidden = state.hidden.filter((p) => p !== folder);
          save();
          try {
            addWorkspace({ name: basename(folder), folder });
          } catch (e) {
            console.error(`No workspace for ${folder}: ${(e as Error).message}`);
          }
        });
      res = Response.json(toolsInfo());
    } else if (url.pathname === "/claude-mcp") {
      // The Claude Code row of the Settings: is `yonder` an MCP server of each Claude Code session of the user? GET it, or
      // POST { on }, which runs `claude mcp add` or `claude mcp remove`. Only the user turns it on: it changes the settings
      // of Claude Code, and gives each session the tools of Yonder.
      const run = (...a: string[]) => Bun.spawn([CLAUDE, "mcp", ...a], { env, stdout: "ignore", stderr: "ignore" }).exited;
      if (req.method === "POST") {
        await run("remove", "--scope", "user", "yonder");
        if ((await req.json()).on) await run("add", "--scope", "user", "--transport", "http", "yonder", `http://127.0.0.1:${PORT}/mcp`);
      }
      res = Response.json({ on: (await run("get", "yonder")) === 0 });
    } else if (url.pathname === "/model") {
      // The Model and Effort ranges of the Settings: GET them, or POST { models } and { efforts }, each [lo, hi] in order,
      // and { defaultModel }: "auto" or an alias of TIERS. `model` is the default model, else the model of a range of one,
      // else "auto", for the model menu of a new agent.
      if (req.method === "POST") {
        const { models, efforts, defaultModel } = await req.json();
        if (SETTINGS.defaultModel.ok(defaultModel)) state.defaultModel = defaultModel;
        if (SETTINGS.models.ok(models)) state.models = models;
        if (SETTINGS.efforts.ok(efforts)) state.efforts = efforts;
        save();
      }
      const model = state.defaultModel !== "auto" ? state.defaultModel : state.models[0] === state.models[1] ? state.models[0] : "auto";
      res = Response.json({ model, defaultModel: state.defaultModel, models: state.models, efforts: state.efforts });
    } else if (url.pathname === "/ask" && req.method === "POST") {
      // The PermissionRequest hook of a worker (ASK). It waits, with no time limit, until the user taps Allow or Deny.
      http.timeout(req, 0);
      const q = await req.json();
      // A new turn gets its session ID a moment after its start.
      let w: Worker | undefined;
      for (let i = 0; i < 20 && !(w = state.workers.find((x) => x.sessionId === q.session_id)); i++) await Bun.sleep(500);
      if (!w) res = Response.json({});
      // A question of the agent (AskUserQuestion) goes to the card of the app as a choice, one question after the other,
      // and the picks go back as its answers. With no decision, a background session waits for its own dialog, which no
      // one sees. Deny lets the user answer in the conversation.
      // shortcut: one pick for a multiSelect question, and no "Other" text; add them to the card if the user asks.
      else if (q.tool_name === "AskUserQuestion") {
        const input = q.tool_input ?? {};
        const answers: Record<string, string> = {};
        let answer: Answer | undefined;
        for (const one of input.questions ?? []) {
          answer = await askUser(w, { tool: "Question", text: "", kind: "choice", title: one.question, choices: one.options.map((o: { label: string }) => o.label) }, req.signal);
          if (!answer.allow || !answer.choice) break;
          answers[one.question] = answer.choice;
        }
        res = Response.json(
          answer?.expired ? {}
          : answer && !answer.choice ? { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: "The user answers in the conversation. Ask the question in plain text as the last words of your message, and end your turn." } } }
          : { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow", updatedInput: { ...input, answers } } } },
        );
      }
      // The plan of Plan mode ends the turn, and the reply of the user approves it (resume). With no decision, a background
      // session waits for its own dialog, which no one sees, for many minutes.
      else if (q.tool_name === "ExitPlanMode") {
        w.planned = true;
        save();
        res = Response.json({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: "Yonder shows the plan to the user, who answers in a new message. Write the whole plan as your last message now, and end your turn. Do not call ExitPlanMode again in this turn." } } });
      } else {
        const input = q.tool_input ?? {};
        const text = String(input.command ?? input.file_path ?? input.url ?? input.pattern ?? input.query ?? "");
        const { allow, expired } = await askUser(w, { tool: q.tool_name, text }, req.signal);
        // An expired question (follow) gets no decision: Claude Code no longer waits on it.
        res = Response.json(expired ? {} : { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: allow ? { behavior: "allow" } : { behavior: "deny", message: "The user denied this in Yonder." } } });
      }
    } else if (url.pathname === "/permission" && req.method === "POST") {
      // Allow or Deny from the app, on the phone or on the Mac: { id, allow }, with the `value` of a code or the `choice`. The
      // first answer counts, and a later one finds no question. A yes to an ask with Face ID (terms) counts from a phone,
      // where the app asks for Face ID first, only through the relay (fromPhone). On a Mac (touchId), a yes from this Mac
      // counts after Touch ID that the bridge asks itself (ownerCheck). A 1Password ask also needs a key, so its yes comes on
      // /vault/approve, and here only its Deny counts. A payment has no Face ID here: its yes only opens its page, and only
      // the user pays on that page, so an agent on this Mac cannot pay with a yes of its own.
      http.timeout(req, 0);
      const { id, allow, value, choice } = await req.json();
      const device = deviceOf(req);
      const mac = !!allow && !!asks.get(id)?.ask.touchId && asks.get(id)?.ask.kind !== "secret" && !fromPhone(req);
      if (mac && touching.has(id)) res = Response.json({ ok: false });
      else {
        let touched = false;
        if (mac) {
          const stop = new AbortController();
          touching.set(id, stop);
          touched = await ownerCheck(`approve "${asks.get(id)!.ask.title}" in Yonder`, stop.signal).finally(() => touching.delete(id));
        }
        // The phone can answer, or the ask can end, while the prompt is open.
        const q = asks.get(id);
        const ok = !!q && (!allow || !q.ask.faceId || fromPhone(req) || touched);
        if (ok) q.end({ allow: !!allow, device, ...(typeof value === "string" && { value: value.slice(0, 100) }), ...(typeof choice === "string" && { choice: choice.slice(0, 100) }) });
        res = Response.json(q && !ok ? { ok, error: mac ? "Touch ID did not approve it." : "Approve it on the phone, with Face ID." } : { ok });
      }
    } else if ((url.pathname === "/link" || url.pathname === "/link/start") && req.method === "POST") {
      // A new task link (bridge/link.ts). POST { url } to /link checks it for the sheet of the app. /link/start checks it
      // again after the yes of the user with Face ID or Touch ID, uses up its nonce and starts the task. A start needs a
      // check at most 10 minutes before, and judges the time stamp at the time of that check, so a sheet that waits 9
      // minutes for the user still starts. The answer never has the key of the source.
      http.timeout(req, 0);
      const { url: link } = await req.json().catch(() => ({}));
      const start = url.pathname === "/link/start";
      const used = (state.linkNonces ??= {});
      pruneNonces(used);
      for (const [nonce, at] of linkSheets) if (Date.now() - at > 10 * 60_000) linkSheets.delete(nonce);
      let l: ReturnType<typeof checkLink> | undefined;
      let why = "";
      try {
        const at = start ? linkSheets.get(parseLink(String(link)).nonce) : Date.now();
        if (!at) throw new Error("the link has no open sheet");
        l = checkLink(String(link), config().trustedLinkSources, used, at);
        linkSheets.set(l.nonce, at);
      } catch (e) {
        why = (e as Error).message;
        console.error(`Yonder blocked a new task link: ${why}`);
      }
      if (!l) res = Response.json({ error: why }, { status: 403 });
      else if (!start) {
        const model = state.defaultModel !== "auto" ? state.defaultModel : state.models[0] === state.models[1] ? state.models[0] : "auto";
        res = Response.json({ source: l.source, folder: l.folder, name: l.name, prompt: l.prompt, mode: state.mode, model });
      } else {
        linkSheets.delete(l.nonce);
        used[l.nonce] = Date.now();
        save();
        res = await startWorker({ project: l.folder, task: l.prompt, name: l.name }).then(
          (w) => Response.json({ id: w.id, num: w.num }),
          (e) => Response.json({ error: (e as Error).message }, { status: 500 }),
        );
      }
    } else if (url.pathname === "/agent-name") {
      // The word of the user for an agent and the icon of the Agents tab (`agentName` in config.json, src/names.ts).
      res = Response.json(agentWord());
    } else if (url.pathname === "/vault") {
      // The 1Password row of the settings: GET the state, or POST { token } from a phone (bridge/vault.ts). Only a phone
      // connects, so no program on the Mac can put in a token of its own.
      if (req.method !== "POST") res = Response.json(vault.status());
      else if (!fromPhone(req)) res = new Response("Only a paired phone can connect 1Password.", { status: 403 });
      else {
        const { token } = await req.json();
        res = await vault.connect(String(token ?? "")).then(() => Response.json(vault.status()), (e) => Response.json({ error: (e as Error).message }, { status: 400 }));
      }
    } else if (url.pathname === "/vault/approve" && req.method === "POST") {
      // Approve: { id, key }, the key that opens the seal of the phone that sent it. The window of Yonder on this Mac also
      // sends `pub`, the public key of its own key, and its key counts only after Touch ID that the bridge asks itself
      // (ownerCheck), so a program on this Mac cannot use it. A Mac window that is new to 1Password gets in with that Touch
      // ID, and its seal comes with the next yes, which for this one request only a phone can give.
      http.timeout(req, 0);
      const { id, key, pub } = await req.json();
      const ask = String(id);
      const later = "Approve this one on the phone. Next time, this Mac approves.";
      if (fromPhone(req)) {
        // A Mac window that works as another computer comes through the relay too, with no key for this bridge.
        const answer = key ? secretAsks.get(ask) : undefined;
        answer?.({ key: unb64(String(key)), device: deviceOf(req) });
        res = Response.json(answer ? { ok: true } : { ok: false, error: "Approve it on the phone." });
      } else if (!secretAsks.has(ask) || process.platform !== "darwin" || typeof pub !== "string" || !pub) res = Response.json({ ok: false });
      else if (touching.has(ask)) {
        // Two requests for one card: a program can ask first, so that the Touch ID of the user lets in its key. Both fail.
        touching.get(ask)!.abort();
        res = Response.json({ ok: false, error: "Approve it on the phone." });
      } else if (!vault.isMac(pub) && !vault.macFree()) res = Response.json({ ok: false, error: "Approve it on the phone. To let this window approve, paste the token again on the phone." });
      else if (vault.isMac(pub) && !vault.seals()[deviceId(pub)]) res = Response.json({ ok: false, error: later });
      else {
        const known = vault.isMac(pub);
        const stop = new AbortController();
        touching.set(ask, stop);
        const touched = await ownerCheck(known ? `approve 1Password for "${asks.get(ask)?.ask.title}" in Yonder` : "let this Mac approve 1Password in Yonder", stop.signal).finally(() => touching.delete(ask));
        // The phone can answer, or the ask can end, while the prompt is open.
        const answer = secretAsks.get(ask);
        if (!touched || !answer) res = Response.json({ ok: false, ...(answer && { error: "Touch ID did not approve it." }) });
        else if (!known) {
          const added = vault.addMac(pub);
          if (added) void relay?.push("1Password", later);
          res = Response.json({ ok: false, error: added ? later : "Approve it on the phone." });
        } else {
          answer({ key: unb64(String(key)), device: deviceId(pub) });
          res = Response.json({ ok: true });
        }
      }
    } else if (url.pathname === "/talk") {
      // How the voice talks (TALK), for the prompt of a call. The voice changes it with change_talk.
      res = Response.json({ text: readTalk() });
    } else if (url.pathname === "/access") {
      // The folder step of the first run: GET { disk }. POST opens Full Disk Access in System Settings on this Mac, and
      // shows Yonder.app in the Finder, to drag into the list.
      if (req.method === "POST" && diskAccess() === false) {
        Bun.spawn(["open", "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"]);
        const app = process.execPath.match(/^(.*?\.app)\//)?.[1] ?? "/Applications/Yonder.app";
        if (existsSync(app)) Bun.spawn(["open", "-R", app]);
      }
      res = Response.json({ disk: diskAccess() });
    } else if (url.pathname === "/mode") {
      // The Permissions row of the Settings: GET it, or POST { mode } with a mode of MODES, but not plan.
      if (req.method === "POST") {
        const { mode } = await req.json();
        if (SETTINGS.mode.ok(mode)) state.mode = mode;
        save();
      }
      res = Response.json({ mode: state.mode });
    } else if (url.pathname === "/peer") {
      // A request of the Mac app to another computer, such as the chat of one of its agents: ?computer=<name>&path=<path>.
      // This bridge reaches it through the relay (reach in bridge/relay.ts), and that bridge lets in only PEER_PATHS. A
      // phone cannot use /peer (PATHS in bridge/relay.ts), and it reaches the other computers itself. So the
      // Mac opens the agents of the other computers too.
      const peer = relay?.peers().find((p) => p.name === url.searchParams.get("computer"));
      const path = url.searchParams.get("path") ?? "";
      if (!peer || !path.startsWith("/")) res = new Response("This computer does not know that computer.", { status: 404 });
      else {
        const body = req.method === "GET" || req.method === "HEAD" ? undefined : new Uint8Array(await req.arrayBuffer());
        res = await relay!.reach(peer)(`http://127.0.0.1:7787${path}`, { method: req.method, headers: req.headers, body }).catch((e) => new Response(`${peer.name} gave no answer: ${(e as Error).message}`, { status: 502 }));
        // The answer of the other computer comes on the origin of this bridge, which passes the Origin check, and the relay
        // drops its headers. So a page from there, such as a page of its /media, runs only in a sandbox, as /media here.
        res.headers.set("content-security-policy", "sandbox allow-scripts");
      }
    } else if (url.pathname === "/elsewhere" && req.method === "POST") {
      // The poll of the phone for other_computer: { computers, results }, and the answer is { calls }.
      const { computers, results } = (await req.json()) as { computers?: string[]; results?: { id: number; text: string; error?: boolean }[] };
      remote.phones.set(deviceOf(req), { computers: computers ?? [], seen: Date.now() });
      for (const r of results ?? []) remote.waits.get(r.id)?.(r);
      // A call that no phone knows goes to any phone, which answers why.
      const near = nearPhones();
      const mine = (c: Remote) => knows(computers ?? [], c.computer) || !near.some((p) => knows(p.computers, c.computer));
      const calls = remote.queue.filter(mine);
      remote.queue = remote.queue.filter((c) => !mine(c));
      res = Response.json({ calls });
    } else if (url.pathname === "/people") {
      // The people of this computer and the person of this device, for the owner badge and the mine/all switch of the app
      // (docs/multi-user.md). One person or none: an empty list, and the app shows no part for more than one person.
      const list = people();
      const me = personFor(deviceOf(req));
      res = Response.json(People.shared(list) ? { people: list.map((p) => ({ id: p.id, name: p.name, ...(p === People.mainOf(list) && { main: true }) })), me: me?.id ?? null } : { people: [], me: null });
    } else if (url.pathname === "/sync") {
      // The sign-in of the backup of the settings (bridge/sync.ts): GET tells if this computer has one, and POST { token }
      // gives it. The app of the computer gives its own after a sign-in, and null after a sign-out. A paired phone only
      // gives its sign-in to a computer with none, so a phone cannot sign a computer out or move it to another account.
      // GET ?run syncs first, as bridge/sync-e2e.ts does.
      if (url.searchParams.has("run")) await sync.run(true);
      if (req.method === "POST") {
        const token = (await req.json().catch(() => ({}))).token;
        if (!fromPhone(req) || (typeof token === "string" && !sync.status().token)) sync.signIn(typeof token === "string" && token ? token : null);
      }
      res = Response.json(sync.status());
    } else if (url.pathname === "/phone-config") {
      // phone.json: the settings that each phone keeps, such as the theme and the fonts, so that the
      // user or a Claude Code agent can change them on the Mac. GET it, or POST a patch, where null removes a key. The
      // phone pulls the file when it opens or comes to the front, and pushes its own changes (src/phone-config.ts).
      const file = join(CONFIG, "phone.json");
      if (req.method === "POST") {
        const patch = await req.json();
        editJson(file, (c) => {
          for (const [k, v] of Object.entries(patch ?? {})) v === null ? delete c[k] : (c[k] = v);
        });
      }
      try {
        res = Response.json(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
      } catch (e) {
        res = Response.json({ error: `${file} is not valid JSON: ${(e as Error).message}` }, { status: 500 });
      }
    } else if (url.pathname === "/ui") {
      // The screens of the user (bridge/ui.ts, src/look.ts): GET lists them, GET ?name= gives one version (&n=, else the
      // newest good one), and &try gives a page to test in a browser. POST forks, marks a bad version, or starts Build
      // your own: a folder with the rules and an agent that builds the screen from the words of the user.
      try {
        if (req.method === "POST") {
          const b = await req.json();
          if (b.action === "fork") res = Response.json(forkScreen(SCREENS, String(b.from)));
          else if (b.action === "delete") res = Response.json((deleteScreen(String(b.name)), { ok: true }));
          else if (b.action === "rename") res = Response.json({ n: await renameScreen(SCREENS, String(b.name), String(b.title ?? "")) });
          else if (b.action === "bad") res = Response.json({ good: markBad(SCREENS, String(b.name), Number(b.n) || undefined, String(b.error ?? "")) });
          else if (b.action === "build" && String(b.words ?? "").trim()) res = Response.json(await newScreen(String(b.words), String(b.from ?? "dashboard")));
          else if (b.action === "check") {
            const error = await checkScreen(SCREENS, String(b.name));
            res = Response.json(error ? { ok: false, error } : { ok: true });
          } else res = Response.json({ error: "The action is fork, bad, delete, check (with name) or build (with words)." }, { status: 400 });
        } else if (url.searchParams.has("guide")) {
          res = new Response(SCREEN_GUIDE, { headers: { "content-type": "text/markdown; charset=utf-8" } });
        } else if (url.searchParams.has("name")) {
          const name = url.searchParams.get("name")!;
          // A front end from before a sample asks for it as a screen of the user, so a new sample shows before the update.
          const one = SCREEN_SAMPLES[name] && !existsSync(join(SCREENS, name)) ? { look: SCREEN_SAMPLES[name]() } : readScreen(SCREENS, name, Number(url.searchParams.get("n")) || undefined);
          // A large page goes gzipped, because the relay sends one answer in one frame of 1 MiB. src/look.ts unzips it.
          const body = JSON.stringify(one.look);
          res = url.searchParams.has("try")
            ? new Response(tryPage(one.look), { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "sandbox allow-scripts" } })
            : body.length > 500_000
              ? new Response(Bun.gzipSync(body), { headers: { "content-type": "application/gzip" } })
              : new Response(body, { headers: { "content-type": "application/json" } });
        } else res = Response.json({ screens: listScreens(SCREENS) });
      } catch (e) {
        res = Response.json({ error: (e as Error).message }, { status: 400 });
      }
    } else if (url.pathname === "/version") {
      // The version of the source, so that the app can tell how many commits it is behind. `full` gives "2.B.N"
      // (version.ts), and no `full` gives the commit count N, for an older screen.
      const full = SOURCE ? version(ROOT) : "";
      res = Response.json(url.searchParams.has("full") ? full : Number(full.split(".")[2]) || 0);
    } else if (url.pathname === "/relay") {
      // File > Pair Phone: GET the relay and the paired phones, POST a new pairing code with its QR code, DELETE a phone,
      // PUT ?url= another relay ("" for the default).
      // A new code lets a new device in with the paths of a phone, also the yes of 1Password and of the approvals. So on a
      // Mac each code needs Touch ID that the bridge asks itself (ownerCheck), and two asks at the same time both fail,
      // so a program cannot ride on the Touch ID of the user. Linux and Windows have no such prompt: there the push to the
      // paired phones (pair in bridge/relay.ts) tells of each new phone.
      let owner = true;
      if (req.method === "POST" && process.platform === "darwin") {
        http.timeout(req, 0);
        if (touching.has("pair")) touching.get("pair")!.abort(), (owner = false);
        else {
          const stop = new AbortController();
          req.signal.addEventListener("abort", () => stop.abort(), { once: true });
          touching.set("pair", stop);
          owner = await ownerCheck("pair a new phone with Yonder", stop.signal).finally(() => touching.delete("pair"));
        }
      }
      if (!owner) res = Response.json({ error: "Touch ID did not approve a new pairing code." }, { status: 403 });
      else if (!relay) res = Response.json({ error: "Only the live bridge connects to the phone relay, not a check bridge." }, { status: 404 });
      else if (req.method === "PUT")
        res = await setRelay(url.searchParams.get("url") ?? "")
          .then(() => Response.json({ ...relay!.status(), default: DEFAULT_RELAY }))
          .catch((e) => Response.json({ error: (e as Error).message }, { status: 400 }));
      else if (req.method === "POST") {
        // The person of the next phone (?person=: an id, or the name of a new person), from the pick of the pairing window.
        // The first pick of a person who is not the main person starts `people` in config.json, with the phones that are
        // paired now for the main person (docs/multi-user.md).
        const person = url.searchParams.get("person")?.trim().slice(0, 60);
        if (person) {
          const now = people();
          const main = userInfo().username.replace(/^./, (c) => c.toUpperCase()) || "Me";
          if (!now.length && person.toLowerCase() !== main.toLowerCase() && person !== People.newId([], main)) {
            config().people = People.start(pairedPhones(), main);
            save();
          }
          pairPick = { person, until: Date.now() + 5 * 60_000 };
        } else pairPick = undefined;
        res = await relay
          .pair()
          .then(async (code) => Response.json({ ...code, qr: await qrCode(code.link), ...(LINUX && { text: qrText(code.link) }) }))
          .catch((e) => Response.json({ error: (e as Error).message }, { status: 500 }));
      } else if (req.method === "DELETE") {
        const pub = url.searchParams.get("phone") ?? "";
        res = Response.json(relay.remove(pub));
        // An unpaired phone goes from `people` too. An edit of the file never unpairs: an unpair removes a key.
        const list = config().people;
        const next = People.ok(list) ? People.drop(list, deviceId(pub)) : undefined;
        if (next) (config().people = next), save();
      }
      else res = Response.json({ ...relay.status(), default: DEFAULT_RELAY });
    } else if (url.pathname === "/front") {
      // The build of the front end in dist/, so that the Mac app and the phone get a new one. `shell`: the Mac app needs a full rebuild.
      // ?bundle gives the phone the whole front end, gzipped, because the relay sends a response in one frame of 1 MiB at most.
      const dist = join(ROOT, "dist");
      const build = existsSync(join(dist, "build.txt")) ? readFileSync(join(dist, "build.txt"), "utf8") : "";
      // The phone app that the screen needs (`needs` in version.ts). An older dist/ has none.
      const needs = existsSync(join(dist, "needs.json")) ? JSON.parse(readFileSync(join(dist, "needs.json"), "utf8")) : undefined;
      // `code`: the JS with no build ID (vite.config.ts), so a build with only new CSS swaps its CSS in the running page,
      // and `css` the path of that CSS for the Mac. An older dist/ has no code.
      const code = existsSync(join(dist, "code.txt")) ? readFileSync(join(dist, "code.txt"), "utf8") : undefined;
      // `platform`: the app names the Mac only when the bridge runs on one (docs/omarchy.md). `building`: a rebuild or an
      // update runs now, so the update button says "Updating…" before a click. Else it says "Update
      // available", and a click gives the error "A rebuild of Yonder runs now". A build of the
      // screen after a commit is no update for the user, so it is not `building`. `testflight`: the last TestFlight
      // upload of this Mac (`bun run testflight`), so the iPhone names a newer app in Settings.
      if (!url.searchParams.has("bundle")) {
        const css = existsSync(join(dist, "index.html")) ? /<link[^>]+href="(\/assets\/[^"]+\.css)"/.exec(readFileSync(join(dist, "index.html"), "utf8"))?.[1] : undefined;
        const testflight = SOURCE && existsSync(join(CONFIG, "testflight.txt")) ? readFileSync(join(CONFIG, "testflight.txt"), "utf8").trim() : undefined;
        // `config`: the version of phone.json, so a change of the look or the settings reaches the phone in seconds.
        const config = existsSync(join(CONFIG, "phone.json")) ? statSync(join(CONFIG, "phone.json")).mtimeMs : 0;
        // `channel`: where this environment comes from, dev for a bridge that runs from the source folder, else the
        // channel of its install (channel.json). Settings shows it next to the version.
        res = Response.json({ build, needs, code, css, testflight, config, channel: SOURCE ? "dev" : UPDATES.channel, shell: shellChanged(), platform: process.platform, ghostty: hasGhostty(), building: rebuild?.exitCode === null || updating });
      } else {
        const html = readFileSync(join(dist, "index.html"), "utf8");
        const asset = (re: RegExp) => readFileSync(join(dist, re.exec(html)![1]), "utf8");
        const bundle = { build, needs, code, js: asset(/<script[^>]+src="\/([^"]+)"/), css: asset(/<link[^>]+href="\/(assets\/[^"]+\.css)"/) };
        res = new Response(Bun.gzipSync(JSON.stringify(bundle)), { headers: { "content-type": "application/gzip" } });
      }
    } else if (req.method === "GET" && existsSync(join(ROOT, "dist", "index.html"))) {
      // The Mac app loads the front end from here (src/main.tsx), so a new build needs only a reload, not a rebuild.
      // On Windows, normalize gives "\" for "/", so the test strips both separators.
      const file = join(ROOT, "dist", normalize(url.pathname).replace(/^[\\/]+/, "") || "index.html");
      res = file.startsWith(join(ROOT, "dist")) && existsSync(file) && statSync(file).isFile()
        ? new Response(Bun.file(file), { headers: { "cache-control": "no-cache" } })
        : new Response("Not found", { status: 404 });
    } else {
      res = new Response("Yonder bridge. MCP is at /mcp.", { status: url.pathname === "/" ? 200 : 404 });
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    // The page of the bridge (the Mac app) gets the token as a cookie, so its images, its event stream and its fetches
    // need no check of the user. A page of another origin never gets it: SameSite=Strict.
    if (!byCookie && key && req.method === "GET" && (url.pathname === "/" || req.headers.get("sec-fetch-site") === "same-origin"))
      res.headers.append("set-cookie", `yonder-${PORT}=${key}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
    return res;
  },
});
console.log(`Yonder bridge on http://127.0.0.1:${PORT}/mcp, claude at ${CLAUDE}`);
closeLeft();

// The daemon of Claude Code gives its responsible process to the sessions of its spare hosts (see `responsible`). A
// daemon that started outside Yonder.app, such as from a terminal, or under an app that quit, stops when a bridge of the
// app starts. Its sessions keep running (--keep-workers), and the next `claude --bg` starts a new daemon under the app.
// The first session of a new daemon gets no spare host.
// A session with no daemon for about a minute dies (daemon.log: 5 of 12 died after 65 seconds). A restart_bridge
// that stops the daemon while sessions work, with no `claude --bg` after it, kills them all, also the runs of the
// schedules. So the bridge stops the daemon only when no session works, and
// else checks again each minute.
// shortcut: only the daemon of ~/.claude, not the daemons of the folders of the profiles (claudeDirs). An idle session
// can still die; start a new daemon right after the stop if that matters.
let freeing: ReturnType<typeof setInterval> | undefined;
async function freeDaemon() {
  try {
    const daemon = Number(JSON.parse(readFileSync(ROSTER, "utf8")).supervisorPid);
    const its = responsible(daemon);
    if (its > 0 && its !== responsible(process.pid)) {
      if ((await agents()).some((a) => a.pid && fromState(a.state) === "running")) return;
      console.log(`The daemon of Claude Code (pid ${daemon}) runs outside Yonder.app, and no session works, so the bridge stops it. Its sessions keep running.`);
      Bun.spawn([CLAUDE, "daemon", "stop", "--any", "--keep-workers"], { env, stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    }
  } catch {} // No daemon has run yet.
  clearInterval(freeing);
}
if (apps().includes(responsible(process.pid))) {
  freeing = setInterval(freeDaemon, 60_000);
  void freeDaemon();
}

// A Linux install updates itself. The Mac app does too, when its window is not in front (check_update in src-tauri/src/main.rs). Else a
// server gets a fix only from `yonder update` over SSH. One minute after the start, and then
// each hour, the bridge reads the version of the last release. For another version, and with no live call, it runs
// the installer for that version. The installer restarts the service, and KillMode=process keeps the installer
// running. Its output goes to bridge.log. A failed install tries again an hour later. Windows does the same with
// windows/install.ps1, which stops the loop of `yonder serve` and this bridge, and starts them again.
// rebuild_app calls it too, so the phone or an agent of another computer can update a download now. It gives the version that it installs, or undefined when the copy is up to date.
let updating = false;
// The random ID of this computer, which the update server hashes into a bucket for a slow rollout. The Mac app keeps
// the same file.
function installId() {
  const file = join(CONFIG, "install-id");
  const id = existsSync(file) ? readFileSync(file, "utf8").trim() : "";
  if (id) return id;
  const made = crypto.randomUUID();
  writeFileSync(file, made);
  return made;
}
async function update(now = false) {
  if (updating || (!now && Date.now() < callUntil)) return;
  const have = existsSync(join(ROOT, "version")) ? readFileSync(join(ROOT, "version"), "utf8").trim() : "";
  // The update server (channel.json, "Update server" in docs/wiki/install.md) answers for this install: a slow rollout, a stop or a
  // rollback. 204 is no update. With no answer, the static file of the copies from before it; the query gets past
  // the cache of Cloudflare.
  const platform = WINDOWS ? "windows" : "linux";
  const answer =
    (await fetch(`${UPDATES.server}/${UPDATES.channel}/${platform}?id=${installId()}&v=${have}`).then((r) => (r.status === 204 ? "" : r.ok ? r.text() : undefined), () => undefined)) ??
    (await fetch(`https://download.yonder.so/latest-${platform}.txt?${Date.now()}`).then((r) => (r.ok ? r.text() : undefined), () => undefined));
  if (answer === undefined) throw new Error("download.yonder.so gave no version.");
  // Only a newer version, or an older one that the server marks as a rollback: a test install from $env:YONDER_ZIP
  // stays, and does not go back to the release a minute later.
  const latest = accept(answer, have);
  if (!latest) return;
  updating = true;
  console.log(`Updating Yonder ${have || "(no version)"} to ${latest}`);
  // Windows: a detached PowerShell of an update runs nothing, with no word in bridge.log, because it has
  // no console. So a short PowerShell in the hidden console of the loop starts the installer with Start-Process, in a
  // hidden console of its own, which lives on when the installer stops this bridge. The output goes to update.log,
  // because the cmd of the loop holds bridge.log open.
  const script = `$ProgressPreference = 'SilentlyContinue'; $env:YONDER_VERSION = '${latest}'; ` +
    `irm 'https://download.yonder.so/install.ps1?${latest}' | iex *>&1 | Out-File -Append -Encoding utf8 "$HOME\\.config\\yonder\\update.log"`;
  const proc = Bun.spawn(WINDOWS
    ? ["powershell", "-NoProfile", "-Command",
      `Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', '${Buffer.from(script, "utf16le").toString("base64")}'`]
    : ["bash", "-c", `curl -fsSL 'https://download.yonder.so/install.sh?${latest}' | bash`], {
    env: { ...env, YONDER_VERSION: latest },
    detached: !WINDOWS,
    stdio: ["ignore", "inherit", "inherit"],
  });
  proc.unref();
  // The PowerShell of Windows ends at once, so a second update waits 10 minutes, while the installer works.
  void proc.exited.then(() => setTimeout(() => (updating = false), WINDOWS ? 600_000 : 0));
  return latest;
}
if ((LINUX || WINDOWS) && !SOURCE && !TEST) {
  const quiet = () => void update().catch(() => {});
  setTimeout(quiet, 60_000);
  setInterval(quiet, 3_600_000);
}
