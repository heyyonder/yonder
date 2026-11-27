// The CLIs other than Claude Code that run Yonder agents: one row for each. The bridge starts one detached process for
// each turn of an agent, with the JSON lines of the CLI in a log, and continues the session by its ID in the next turn.
// So a turn keeps running when the bridge restarts. Claude Code keeps its own path (`claude --bg`) in main.ts, and has a
// row here only for the Settings. docs/clis.md has the research and the plan.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { Added } from "./registry";
import type { SignIn } from "./logins";

const HOME = homedir();

// The permission modes of Yonder (MODES in main.ts). Each CLI maps the modes that it has to its own flags.
export type Mode = "bypassPermissions" | "auto" | "acceptEdits" | "plan";
// One turn of an agent. With no session, the turn starts a new one.
// `fresh`: the bridge picked the ID of a new session (Cli.preset).
// `spokenFile` holds `spoken`, for a CLI that reads instructions from a file.
export type Turn = { prompt: string; cwd: string; session?: string; fresh?: boolean; model?: string; effort?: string; mode: Mode; mcp: string; spoken: string; spokenFile: string };
// What one JSON line of a CLI says. One line can say more than one thing, so a parser gives a list.
export type Step = {
  session?: string;
  text?: string; // Text of the answer. The last text of a turn is its result.
  tool?: { name: string; input?: Record<string, unknown> };
  id?: string; // The ID of a tool call, when the CLI gives its start and its end: steps keeps the first.
  done?: boolean; // The turn ended.
  error?: string;
  model?: string;
};
// A meter of the Usage tab, as the Claude Code usage gives it.
export type Limit = { name: string; percent: number; resets_at: string | null };

export type Cli = {
  id: string;
  name: string;
  bins: string[]; // The names of the binary, the most specific first.
  // Matches the output of --version, so that another program with the same name does not count, such as the `agy` of
  // the Antigravity IDE.
  version: RegExp;
  install: string; // The install command, for a terminal.
  login: string[]; // The arguments of the sign-in, for a terminal.
  signIn?: SignIn; // The sign-in from the phone, with no terminal (logins.ts). A CLI with none signs in in a terminal.
  // How the CLI pays, such as "ChatGPT plan", when it is signed in. Undefined when it is not.
  account(bin: string): Promise<string | undefined>;
  modes: Partial<Record<Mode, { name: string; args: string[] }>>;
  efforts?: Partial<Record<string, string>>; // The effort of Yonder, and the value of the CLI.
  models?(bin: string): Promise<string[]>;
  // True when the bridge picks the ID of a new session, because the CLI writes it late or not at all.
  preset?: boolean;
  args?(t: Turn): string[]; // The arguments of one turn, for a CLI with no ACP.
  env?(t: Turn): Record<string, string>;
  // True when args() or env() give the spoken prompt. Else the bridge adds it to the prompt in a <voice-call> block.
  spoken: boolean;
  stdin?: boolean; // True when the CLI reads the prompt from stdin, not from args().
  parse(line: Record<string, any>): Step[];
  terminal(session: string): string[]; // The arguments that open the session in a terminal.
  // The arguments of a hidden run of one prompt that prints only the answer: the title of a new agent (askFor in
  // main.ts). `model` is the model of the agent, and no model gives the default model of the CLI. A CLI with none gets
  // its titles from Haiku of Claude Code.
  ask?(prompt: string, model?: string): string[];
  // A CLI with an ACP mode runs in the ACP host (acp-host.ts), not as one process for each turn. `start` gives the command
  // of its ACP server, its environment, and the model and the effort that the host sets as options of the session.
  // `modes` gives the ACP mode, or the value of the option "mode", for each mode of Yonder.
  // `http`: the CLI takes the HTTP MCP servers also when its capabilities do not say so, as Hermes 0.23 does.
  acp?: { modes: Partial<Record<Mode, string>>; start(bin: string, t: Turn): { argv: string[]; env?: Record<string, string>; model?: string; effort?: string; http?: boolean } };
  // The folders of the skills of the CLI, which the prompt box offers after "/". With none, the prompt box offers no
  // commands, because a headless run of the CLI does not run them.
  skills?(cwd: string): string[];
  // The tools of Yonder in all the sessions of the CLI, also in a terminal: the switch of the Settings. `has` tells if
  // the CLI has the server `yonder` now.
  mcp?: { add(bin: string, url: string): Promise<void>; remove(bin: string): Promise<void>; has(bin: string): Promise<boolean> };
  mcpRun: boolean; // True when args() or env() give each turn the tools of Yonder.
  usage?(bin: string): Promise<Limit[] | undefined>;
  found?(): Promise<Found>; // The state of a CLI that is no binary on the PATH, such as an agent of the ACP registry.
};

// The folders where the installers put the CLIs. The bridge runs in the login shell of the user, but some setups,
// such as nvm, set the PATH only in an interactive shell.
const nvm = (() => {
  const root = join(HOME, ".nvm/versions/node");
  try {
    return readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map((v) => join(root, v, "bin"));
  } catch {
    return [];
  }
})();
export const DIRS = [...[".local/bin", ".opencode/bin", ".bun/bin", ".npm-global/bin", ".grok/bin"].map((d) => join(HOME, d)), "/opt/homebrew/bin", "/usr/local/bin", ...nvm];
const runnable = (path: string) => {
  try {
    // Windows has no execute bits: a file there runs by its extension.
    return statSync(path).isFile() && (process.platform === "win32" || !!(statSync(path).mode & 0o111));
  } catch {
    return false;
  }
};
// Each path of the binary of a CLI: first on the PATH, then in DIRS.
// The first path of a binary: on the PATH, then in DIRS.
export const locate = (bin: string) => [Bun.which(bin), ...DIRS.map((d) => join(d, bin))].find((p): p is string => !!p && runnable(p));
const candidates = (cli: Cli) =>
  [...new Set(cli.bins.flatMap((bin) => [Bun.which(bin), ...DIRS.map((d) => join(d, bin))]).filter((p): p is string => !!p && runnable(p)))];

// Runs a short command of a CLI and gives its output, also when it fails. The PATH gets the folder of the binary,
// because an npm CLI starts with `#!/usr/bin/env node`, and node is in the same folder.
export async function run(argv: string[], timeout = 10_000, env: Record<string, string | undefined> = process.env, cwd?: string) {
  const path = `${dirname(argv[0])}${delimiter}${env.PATH ?? ""}`;
  const proc = Bun.spawn(argv, { cwd, env: { ...env, PATH: path, NO_COLOR: "1" }, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { out: out.trim(), err: err.trim(), code };
}

// The state of one CLI on this Mac, for the Settings and for Grok.
export type Found = { path?: string; version?: string; account?: string; error?: string; models?: string[]; mcp?: boolean; usage?: Limit[] };
export async function inspect(cli: Cli): Promise<Found> {
  if (cli.found) return cli.found();
  const paths = candidates(cli);
  if (!paths.length) return {};
  let error = "";
  for (const path of paths) {
    const v = await run([path, "--version"]).catch((e) => ({ out: "", err: String(e), code: 1 }));
    const text = v.out || v.err;
    if (v.code !== 0 || !cli.version.test(text)) {
      // The first line that names the error: a stack trace of Node ends with "}".
      const lines = (v.err || v.out).split("\n").map((l) => l.trim().replaceAll(HOME, "~")).filter(Boolean);
      error ||= (lines.find((l) => /error|ENOENT|not found/i.test(l)) ?? lines[0] ?? `exit ${v.code}`).slice(0, 160);
      continue;
    }
    const version = text.match(/\d+\.\d+(?:\.\d+)?(?:[-.\w]*)?/)?.[0] ?? v.out.split("\n")[0];
    const [account, mcp] = await Promise.all([cli.account(path).catch(() => undefined), cli.mcp?.has(path).catch(() => false)]);
    const [models, usage] = await Promise.all([
      account && cli.models ? cli.models(path).catch(() => []) : [],
      account && cli.usage ? cli.usage(path).catch(() => undefined) : undefined,
    ]);
    return { path, version, account, models, usage, ...(cli.mcp && { mcp: !!mcp }) };
  }
  // A binary that does not start: for example an npm install without its platform binary.
  return { path: paths[0], error: error || "It does not start." };
}

// The steps of one run, from its log, in order. A long log gives only its last `bytes`.
export async function steps(cli: Cli, file: string, bytes = 4_000_000): Promise<Step[]> {
  const f = Bun.file(file);
  if (!(await f.exists())) return [];
  const text = await f.slice(Math.max(0, f.size - bytes)).text();
  const out: Step[] = [];
  const ids = new Set<string>();
  for (const line of text.split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      for (const step of cli.parse(JSON.parse(line))) {
        if (step.id && ids.has(step.id)) continue;
        if (step.id) ids.add(step.id);
        out.push(step);
      }
    } catch {}
  }
  return out;
}
// The session ID of a run, from the start of its log.
export async function sessionOf(cli: Cli, file: string) {
  const f = Bun.file(file);
  if (!(await f.exists())) return "";
  for (const line of (await f.slice(0, 256_000).text()).split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      const id = cli.parse(JSON.parse(line)).find((s) => s.session)?.session;
      if (id) return id;
    } catch {}
  }
  return "";
}

const read = (path: string) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};

// The end of a file, with no partial first line.
function tail(path: string, bytes: number) {
  const text = read(path);
  return text.length <= bytes ? text : text.slice(-bytes).replace(/^[^\n]*\n/, "");
}
// The folders and files in a folder, newest name first. Codex names its folders and files by the date.
const newest = (dir: string) => {
  try {
    return readdirSync(dir).filter((n) => !n.startsWith(".")).sort().reverse();
  } catch {
    return [];
  }
};
const hours = (minutes: number) => (minutes === 10_080 ? "Week" : minutes % 60 ? `${minutes} minutes` : `${minutes / 60} hours`);

// The steps of the log of a turn in the ACP host (acp-host.ts). ACP gives each tool call a kind.
const KINDS: Record<string, string> = { execute: "Bash", edit: "Edit", delete: "Delete", move: "Move", read: "Read", search: "Search", fetch: "Fetch" };
export function acpParse(e: Record<string, any>): Step[] {
  if (e.type === "session") return [{ session: e.id }];
  if (e.type === "model") return [{ model: e.model }];
  if (e.type === "text") return [{ text: e.text }];
  if (e.type === "tool") {
    const input = e.input ?? {};
    const detail = { command: input.command, file_path: e.path ?? input.filePath ?? input.file_path ?? input.path, pattern: input.pattern, url: input.url, query: input.query };
    // The title often names the command or the file, so it is the detail when the input names nothing.
    return [{ id: e.id, tool: { name: KINDS[e.kind] ?? "Tool", input: Object.values(detail).some((v) => v) ? detail : { description: e.title } } }];
  }
  if (e.type === "permission") return [{ id: `permission-${e.id}`, tool: { name: e.allowed ? "Allowed" : "Refused", input: { description: e.title } } }];
  if (e.type === "end") return [e.stopReason === "end_turn" ? { done: true } : { error: e.stopReason === "cancelled" ? "The turn was stopped." : `The turn ended early (${e.stopReason}).` }];
  if (e.type === "error") return [{ error: e.message }];
  return [];
}

// OpenAI Codex, through its ACP adapter (codex-acp of the ACP project), which runs the app server of Codex. The adapter
// is installed next to `codex`, else npx gets it. CODEX_PATH makes it run the Codex of the user, and CODEX_CONFIG gives
// the model, the effort and the spoken prompt (`developer_instructions`). A change of one of them starts the adapter
// again, and it resumes the session. A skill or a command of Codex, such as /review, runs as `/name` in the prompt.
const codex: Cli = {
  id: "codex",
  name: "Codex",
  bins: ["codex"],
  version: /codex/i,
  install: "npm install -g @openai/codex@latest @agentclientprotocol/codex-acp@latest",
  login: ["login"],
  // "1. Open this link … https://auth.openai.com/codex/device", then "2. Enter this one-time code (expires in 15 minutes)".
  // A personal ChatGPT account turns device codes on first, in Settings, Security.
  signIn: {
    args: ["login", "--device-auth"], url: /(https:\/\/auth\.openai\.com\/codex\/device\S*)/, code: /one-time code[^\n]*\n\s*([A-Z0-9]{4,}-[A-Z0-9]{4,})/,
    help: [/device code (login|auth\w*) is not enabled/i, "Turn on device code sign-in for Codex in ChatGPT: Settings, Security. Then try again."],
  },
  async account(bin) {
    const r = await run([bin, "login", "status"]);
    const text = `${r.out}\n${r.err}`;
    if (r.code !== 0 || /not logged in/i.test(text)) return undefined;
    return /api key/i.test(text) ? "OpenAI API key, pays per token" : "ChatGPT plan";
  },
  modes: {
    bypassPermissions: { name: "Full access", args: [] },
    auto: { name: "Auto review", args: [] },
    plan: { name: "Read only", args: [] },
  },
  efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "xhigh" },
  // The models that Codex lists for the account, in its order: `debug models` reads its cache or the network.
  async models(bin) {
    const list = JSON.parse((await run([bin, "debug", "models"], 20_000)).out || "{}");
    return (list.models ?? [])
      .filter((m: any) => m.visibility === "list")
      .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((m: any) => m.slug);
  },
  spoken: true,
  mcpRun: true,
  acp: {
    // Auto review: the reviewer of Codex approves the safe steps, and asks only for the others.
    modes: { bypassPermissions: "agent-full-access", auto: "agent", plan: "read-only" },
    start(bin, t) {
      const adapter = join(dirname(bin), "codex-acp");
      const effort = t.effort && codex.efforts![t.effort];
      const config = { developer_instructions: t.spoken, ...(t.model && { model: t.model }), ...(effort && { model_reasoning_effort: effort }) };
      return { argv: existsSync(adapter) ? [adapter] : ["npx", "-y", "@agentclientprotocol/codex-acp@2"], env: { CODEX_PATH: bin, CODEX_CONFIG: JSON.stringify(config) } };
    },
  },
  // The skill roots of Codex 0.161, from the <skills_instructions> of a session: its own, the shared ones of
  // ~/.agents, and its system skills. The project has its skills in .agents or .codex.
  skills: (cwd) => [join(cwd, ".agents/skills"), join(cwd, ".codex/skills"), join(HOME, ".codex/skills"), join(HOME, ".agents/skills"), join(HOME, ".codex/skills/.system")],
  parse: acpParse,
  terminal: (session) => ["resume", session],
  mcp: {
    add: async (bin, url) => void (await run([bin, "mcp", "add", "yonder", "--url", url], 20_000)),
    remove: async (bin) => void (await run([bin, "mcp", "remove", "yonder"])),
    has: async (bin) => (await run([bin, "mcp", "get", "yonder"])).code === 0,
  },
  // The limits of the plan, from the newest token_count event of the newest session files. A window that reset since
  // then does not show.
  async usage() {
    const root = join(HOME, ".codex/sessions");
    let files = 0;
    for (const y of newest(root))
      for (const m of newest(join(root, y)))
        for (const d of newest(join(root, y, m)))
          for (const f of newest(join(root, y, m, d)).filter((n) => n.endsWith(".jsonl"))) {
            if (++files > 5) return undefined;
            for (const line of tail(join(root, y, m, d, f), 512_000).split("\n").reverse()) {
              if (!line.includes('"rate_limits"')) continue;
              try {
                const limits = JSON.parse(line).payload?.rate_limits;
                if (!limits?.primary) continue;
                const windows = [limits.primary, limits.secondary].filter((w) => w && w.resets_at * 1000 > Date.now());
                return windows.length
                  ? windows.map((w) => ({ name: hours(w.window_minutes), percent: Math.round(w.used_percent), resets_at: new Date(w.resets_at * 1000).toISOString() }))
                  : undefined;
              } catch {}
            }
          }
    return undefined;
  },
};

// The Antigravity CLI of Google (`agy`), which took the place of Gemini CLI for personal accounts. The
// Antigravity IDE also links an `agy` that opens the IDE, and its --version gives three lines, so only a bare version
// counts. `agy -p --output-format stream-json` writes init (the conversation ID), step_update (the steps, with the text
// in pieces) and result (the whole answer). It has no sign-in command: the first `agy` in a terminal signs in. Without
// --add-dir a headless run writes into a scratch folder. It has no flag for a system prompt or for an MCP server of one
// run. Its plan mode does not stop at the plan in a headless run, so Yonder does not offer it.
const antigravity: Cli = {
  id: "antigravity",
  name: "Antigravity",
  bins: ["agy"],
  version: /^\d+\.\d+\.\d+$/,
  install: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
  login: [],
  // The sign-in is in the Keychain (or a file without a keyring), or the CLI uses a Gemini API key.
  async account() {
    if (process.env.GEMINI_API_KEY && /"modelProvider"\s*:\s*"gemini"/.test(read(join(HOME, ".gemini/antigravity-cli/settings.json")))) return "Gemini API key, pays per token";
    if (existsSync(join(HOME, ".gemini/antigravity-cli/antigravity-oauth-token"))) return "Google account";
    if (process.platform !== "darwin") return undefined;
    return (await run(["/usr/bin/security", "find-generic-password", "-s", "gemini", "-a", "antigravity"])).code === 0 ? "Google account" : undefined;
  },
  modes: {
    bypassPermissions: { name: "Full access", args: ["--dangerously-skip-permissions"] },
    auto: { name: "Sandbox", args: ["--dangerously-skip-permissions", "--sandbox"] },
  },
  // No efforts: not each model of the CLI takes each effort, and a wrong one fails the turn.
  async models(bin) {
    const r = await run([bin, "--output-format", "json", "models"], 15_000);
    return JSON.parse(r.out || "{}").command?.data?.models?.map((m: any) => m.id) ?? [];
  },
  spoken: false,
  mcpRun: false,
  // A long --print-timeout: the default was 5 minutes before 1.2.6.
  args: (t) => [
    "-p", t.prompt, "--output-format", "stream-json", "--print-timeout", "12h", "--add-dir", t.cwd, "--disable-slash-commands",
    ...antigravity.modes[t.mode]!.args,
    ...(t.model ? ["--model", t.model] : []),
    ...(t.session ? ["--conversation", t.session] : []),
  ],
  parse(e) {
    const session = e.conversation_id ?? e.step_update?.conversation_id ?? e.result?.conversation_id;
    const out: Step[] = session ? [{ session }] : [];
    const step = e.step_update;
    if (step?.step_type === "tool") {
      const p = step.tool_info?.parameters ?? {};
      out.push({ id: `step-${step.step_index}`, tool: { name: step.tool_name ?? step.tool_info?.name ?? "tool", input: { command: p.CommandLine, file_path: p.TargetFile ?? p.AbsolutePath, query: p.Query, url: p.Url } } });
    }
    if (step?.state === "ERROR" && step.tool_info?.error?.message) out.push({ error: step.tool_info.error.message });
    const result = e.result;
    if (e.event === "result" && result) {
      if (result.response?.trim()) out.push({ text: result.response });
      out.push(result.status === "SUCCESS" ? { done: true } : { error: result.error || `The turn ended with ${String(result.status).toLowerCase()}.` });
    }
    if (e.init?.model) out.push({ model: e.init.model });
    return out;
  },
  terminal: (session) => ["--conversation", session],
  mcp: {
    add: async (bin, url) => void (await run([bin, "mcp", "add", "--type", "http", "yonder", url], 20_000)),
    remove: async (bin) => void (await run([bin, "mcp", "remove", "yonder"])),
    has: async (bin) => /^yonder\s/m.test((await run([bin, "mcp", "list"])).out),
  },
};

// The stream JSON of Claude Code, which Cursor and Grok also write: a system init with the session ID, assistant
// messages with text and tool_use blocks, and a result at the end. Grok calls an MCP tool through use_tool.
function claudeStream(e: Record<string, any>): Step[] {
  const out: Step[] = e.session_id ? [{ session: e.session_id }] : [];
  if (e.type === "system" && e.subtype === "init" && e.model && e.model !== "unknown") out.push({ model: e.model });
  if (e.type === "assistant")
    for (const b of e.message?.content ?? []) {
      if (b.type === "text" && b.text) out.push({ text: b.text });
      if (b.type === "tool_use")
        out.push({ id: b.id, tool: b.name === "use_tool" && b.input?.tool_name ? { name: String(b.input.tool_name), input: b.input.tool_input } : { name: b.name, input: b.input } });
    }
  if (e.type === "result") out.push(e.is_error ? { error: [e.result, ...(e.errors ?? [])].filter((x) => typeof x === "string" && x).join(" ") || "The turn failed." } : { done: true });
  return out;
}

// The sign-ins of OpenCode, from its auth.json: "oauth" is a plan, "api" is a key. Only the names and the types are read.
const OPENCODE_NAMES: Record<string, string> = { openai: "ChatGPT", "github-copilot": "Copilot", xai: "SuperGrok", anthropic: "Anthropic", openrouter: "OpenRouter", google: "Gemini" };

// OpenCode, through its own ACP mode (`opencode acp`). Its session has the options model, effort and mode (build or
// plan), and the ACP host sets them. OPENCODE_CONFIG_CONTENT gives the spoken prompt as a file of `instructions`. With no
// sign-in it has free models.
const opencode: Cli = {
  id: "opencode",
  name: "OpenCode",
  bins: ["opencode"],
  version: /^\d+\.\d+\.\d+$/,
  install: "curl -fsSL https://opencode.ai/install | bash",
  login: ["providers", "login"],
  async account() {
    const auth = JSON.parse(read(join(HOME, ".local/share/opencode/auth.json")) || "{}");
    const plans = Object.entries(auth).map(([id, a]: [string, any]) => `${OPENCODE_NAMES[id] ?? id} ${a?.type === "oauth" ? "plan" : "key, pays per token"}`);
    return plans.length ? plans.slice(0, 2).join(", ") : "Free models";
  },
  modes: {
    bypassPermissions: { name: "Full access", args: [] },
    plan: { name: "Plan", args: [] },
  },
  // The models of the providers that it can use. A long list, such as all the models of OpenRouter, does not fit a menu.
  async models(bin) {
    const list = (await run([bin, "models"], 20_000)).out.split("\n").filter((l) => /^\S+\/\S+$/.test(l));
    return list.length <= 50 ? list : [];
  },
  spoken: true,
  mcpRun: true,
  acp: {
    modes: { bypassPermissions: "build", plan: "plan" },
    // Plan mode denies the edits, and here also the shell.
    start: (bin, t) => ({
      argv: [bin, "acp"],
      model: t.model,
      env: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ instructions: [t.spokenFile], ...(t.mode === "plan" && { permission: { bash: "deny" } }) }) },
    }),
  },
  parse: acpParse,
  terminal: (session) => ["-s", session],
};

// The sign-ins of Hermes, from its auth.json (`providers` and `credential_pool`), by provider ID.
const HERMES_HOME = process.env.HERMES_HOME || join(HOME, ".hermes");
// The keys of .env that pay for a model. The other keys, such as FIRECRAWL_API_KEY, are for tools.
const HERMES_KEYS: Record<string, string> = { OPENROUTER: "OpenRouter", OPENAI: "OpenAI", ANTHROPIC: "Anthropic", GEMINI: "Gemini", GOOGLE: "Gemini", XAI: "xAI", DEEPSEEK: "DeepSeek", MISTRAL: "Mistral", NOUS: "Nous", GLM: "GLM", ZAI: "GLM", KIMI: "Kimi", MINIMAX: "MiniMax", NVIDIA: "NVIDIA", DEEPINFRA: "DeepInfra", FIREWORKS: "Fireworks", OLLAMA: "Ollama Cloud", XIAOMI: "Xiaomi", DASHSCOPE: "Qwen", STEPFUN: "StepFun", ARCEEAI: "Arcee" };
const HERMES_NAMES: Record<string, string> = { nous: "Nous Portal", "openai-codex": "ChatGPT plan", "xai-oauth": "SuperGrok plan", "qwen-oauth": "Qwen plan", "minimax-oauth": "MiniMax plan", copilot: "Copilot plan" };

// Hermes Agent of Nous Research, through its own ACP mode (`hermes acp`). Its session has the options model, effort
// (`reasoning_effort`) and the edit policy, and its modes default, accept_edits and dont_ask. Full access is dont_ask,
// and the ACP host allows each command once. It takes the tools of Yonder as an HTTP MCP server of the session, but
// its capabilities do not say so. It has no flag for a system prompt. Its sign-in is `hermes model`, in a terminal.
const hermes: Cli = {
  id: "hermes",
  name: "Hermes",
  bins: ["hermes"],
  version: /^Hermes Agent v\d/,
  // The install turns off the borrowed sign-ins of Codex and Claude Code: a refresh by Hermes can sign that CLI out.
  install: "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --non-interactive --skip-browser && ~/.local/bin/hermes config set auth.adopt_external_logins false",
  login: ["model"],
  // The provider of config.yaml: a local server, a sign-in of auth.json, or a key of .env. With none, undefined.
  async account() {
    const model = read(join(HERMES_HOME, "config.yaml")).match(/^model:\n((?:[ \t]+.*\n|[ \t]*\n)*)/m)?.[1] ?? "";
    const provider = model.match(/^[ \t]+provider:[ \t]*"?([\w-]+)/m)?.[1] ?? "auto";
    const url = model.match(/^[ \t]+base_url:[ \t]*"?([^"\s]+)/m)?.[1] ?? "";
    if (/^(custom|ollama|vllm|llamacpp|lmstudio)$/.test(provider)) return provider === "lmstudio" || /localhost|127\.0\.0\.1/.test(url) ? "Local model" : "Own endpoint";
    let auth: Record<string, any> = {};
    try {
      auth = JSON.parse(read(join(HERMES_HOME, "auth.json")) || "{}");
    } catch {}
    const pool = Object.entries(auth.credential_pool ?? {}).filter(([, v]) => Array.isArray(v) && v.length).map(([k]) => k);
    const logins = [...new Set([...Object.keys(auth.providers ?? {}), ...pool])].map((id) => HERMES_NAMES[id] ?? id);
    const keys = [...read(join(HERMES_HOME, ".env")).matchAll(/^([A-Z]+)_API_KEY=\S/gm)].filter((m) => HERMES_KEYS[m[1]]).map((m) => `${HERMES_KEYS[m[1]]} key, pays per token`);
    const all = [...logins, ...keys];
    return all.length ? all.slice(0, 2).join(", ") : undefined;
  },
  modes: { bypassPermissions: { name: "Full access", args: [] } },
  efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
  spoken: false,
  mcpRun: true,
  acp: {
    modes: { bypassPermissions: "dont_ask" },
    start: (bin, t) => ({ argv: [bin, "acp"], model: t.model, effort: t.effort && hermes.efforts![t.effort], http: true }),
  },
  parse: acpParse,
  terminal: (session) => ["--resume", session],
  // `-z` prints only the answer, and exits with 2 when the model fails. It allows each tool with no question, so the
  // run gets only the toolset `todo`, which reaches no file, no shell and no network, and no rules, memory or skills.
  // The model has the form of the ACP option, such as `custom:llama3.2-64k`. Checked on Hermes 0.23.2.
  ask: (prompt, model) => ["-z", prompt, ...(model ? ["-m", model] : []), "--ignore-rules", "-t", "todo"],
};

// The Cursor CLI (`cursor-agent`, also linked as `agent`). `-p --output-format stream-json` writes the stream JSON of
// Claude Code, but its tool calls are tool_call lines with one `…ToolCall` key, such as shellToolCall or editToolCall.
// A failure writes no JSON: the error goes to stderr. Without --force, a headless run does not run commands or write
// files. Each run updates the CLI after 2 seconds unless --disable-auto-update. It has no flag for a system prompt or
// for an MCP server of one run, and no command to add one: its MCP servers are in ~/.cursor/mcp.json.
const CURSOR_MCP = join(HOME, ".cursor/mcp.json");
const cursor: Cli = {
  id: "cursor",
  name: "Cursor",
  bins: ["cursor-agent", "agent"],
  version: /^\d{4}\.\d{2}\.\d{2}-[0-9a-f]+$/,
  install: "curl https://cursor.com/install -fsS | bash",
  login: ["login"],
  // "If your browser didn't open, use this link: https://cursor.com/loginDeepControl?…". It asks the server until the
  // user signs in on that page.
  signIn: { args: ["login"], url: /(https:\/\/cursor\.com\/loginDeepControl\S+)/ },
  // `status --format json` on a new build, the words on an old one.
  async account(bin) {
    const r = await run([bin, "status", "--format", "json"]);
    try {
      return JSON.parse(r.out).isAuthenticated ? "Cursor plan" : undefined;
    } catch {
      return /logged in as/i.test(`${r.out}\n${r.err}`) && !/not logged in/i.test(`${r.out}\n${r.err}`) ? "Cursor plan" : undefined;
    }
  },
  modes: {
    bypassPermissions: { name: "Full access", args: ["--force"] },
    plan: { name: "Plan", args: ["--mode", "plan"] },
  },
  async models(bin) {
    return [...(await run([bin, "models"], 20_000)).out.matchAll(/^(\S+) - /gm)].map((m) => m[1]);
  },
  spoken: false,
  mcpRun: false,
  args: (t) => [
    "-p", "--output-format", "stream-json", "--trust", "--approve-mcps", "--disable-auto-update",
    ...cursor.modes[t.mode]!.args,
    ...(t.model ? ["--model", t.model] : []),
    ...(t.session ? ["--resume", t.session] : []),
    t.prompt,
  ],
  parse(e) {
    if (e.type !== "tool_call") return claudeStream(e);
    const call = e.tool_call ?? {};
    const key = Object.keys(call).find((k) => k.endsWith("ToolCall")) ?? "";
    const args = call[key]?.args ?? {};
    const kind = key.replace(/ToolCall$/, "");
    const name = kind === "mcp" ? `${args.providerIdentifier ?? "mcp"}.${args.toolName ?? args.name}` : ({ shell: "Bash", edit: "Edit", read: "Read", write: "Write", grep: "Grep", glob: "Glob" }[kind] ?? kind);
    return [{ session: e.session_id }, { id: e.call_id, tool: { name, input: { command: args.command, file_path: args.path, pattern: args.pattern } } }];
  },
  terminal: (session) => ["--resume", session],
  // The file that the Cursor editor shares. The merge keeps the other servers, and a file that is not JSON stays as it is.
  mcp: {
    async add(_, url) {
      const config = existsSync(CURSOR_MCP) ? JSON.parse(read(CURSOR_MCP)) : {};
      config.mcpServers = { ...config.mcpServers, yonder: { url } };
      mkdirSync(join(HOME, ".cursor"), { recursive: true });
      writeFileSync(CURSOR_MCP, `${JSON.stringify(config, null, 2)}\n`);
    },
    async remove() {
      if (!existsSync(CURSOR_MCP)) return;
      const config = JSON.parse(read(CURSOR_MCP));
      if (!config.mcpServers?.yonder) return;
      delete config.mcpServers.yonder;
      writeFileSync(CURSOR_MCP, `${JSON.stringify(config, null, 2)}\n`);
    },
    has: async () => !!JSON.parse(read(CURSOR_MCP) || "{}").mcpServers?.yonder,
  },
};

// The weekly (or monthly) allowance of a Grok sign-in, the same numbers as /usage in Grok.
// GET /v1/billing?format=credits gives creditUsagePercent as 0 to 100. A value under 1 is a fraction.
// The bridge asks at most every 2 minutes, and waits 5 minutes after an error. A throw is the error in plain words.
const GROK_HOME = process.env.GROK_HOME || join(HOME, ".grok");
const grokPercent = (n: unknown) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return;
  const value = n > 0 && n < 1 ? n * 100 : n;
  return Math.round(Math.min(100, Math.max(0, value)));
};
let grokCache: { at: number; limits?: Limit[]; error?: string } | undefined;
function grokFail(error: string): never {
  grokCache = { at: Date.now(), error };
  throw new Error(error);
}
export async function grokLimits(fresh = false): Promise<Limit[]> {
  const wait = grokCache?.error ? 300_000 : fresh ? 30_000 : 120_000;
  if (grokCache && Date.now() - grokCache.at < wait) {
    if (grokCache.error) throw new Error(grokCache.error);
    return grokCache.limits ?? [];
  }
  try {
    const auth = JSON.parse(read(join(GROK_HOME, "auth.json")) || "{}");
    const token = Object.values(auth).find((v: any) => typeof v?.key === "string") as { key: string } | undefined;
    if (!token) grokFail("Grok is not signed in. Run grok, then log in.");
    const res = await fetch("https://cli-chat-proxy.grok.com/v1/billing?format=credits", {
      headers: { authorization: `Bearer ${token.key}`, "x-grok-client-version": "1.0.67" },
    });
    if (res.status === 401 || res.status === 403) grokFail("The sign-in of Grok expired. Run grok, then log in.");
    if (!res.ok) grokFail("Grok did not give the usage. Yonder tries again in 5 minutes.");
    const config = ((await res.json()) as { config?: Record<string, any> }).config ?? {};
    const period = config.currentPeriod ?? {};
    const type = String(period.type ?? "");
    const percent = grokPercent(config.creditUsagePercent);
    if (percent === undefined && !type) grokFail("Grok gave no usage numbers.");
    const name = type.includes("MONTHLY") ? "Month" : "Week";
    const limits = [{ name, percent: percent ?? 0, resets_at: period.end ?? config.billingPeriodEnd ?? null }];
    grokCache = { at: Date.now(), limits };
    return limits;
  } catch (e) {
    if (grokCache?.error) throw e;
    grokFail("Yonder could not reach Grok for the usage. It tries again in 5 minutes.");
  }
}

// Grok, the coding CLI of xAI. The community grok-cli also installs `grok`, but its --version gives only a
// number. Grok writes the session ID only at the end, so the bridge picks it (-s) for a new session. Without
// --always-approve, a headless run cancels each request for a permission, so Full access adds it to
// --permission-mode bypassPermissions. The other modes use only --permission-mode. In a folder that it
// does not trust, a headless run skips AGENTS.md, so the agent trusts its folder, as Claude Code agents do.
const grok: Cli = {
  id: "grok",
  name: "Grok",
  bins: ["grok"],
  version: /^grok \S+ \([0-9a-f]+\)/,
  install: "curl -fsSL https://x.ai/cli/install.sh | bash",
  login: ["login"],
  // "open this URL in your browser: https://accounts.x.ai/oauth2/device?user_code=…", then the code on its own line.
  signIn: { args: ["login", "--device-auth"], url: /(https:\/\/accounts\.x\.ai\/oauth2\/device\S*)/, code: /\n\s*([A-Z0-9]{4}-[A-Z0-9]{4})\s*\n/ },
  // The first line of `grok models` says how it signs in. It makes no model call.
  async account(bin) {
    const first = (await run([bin, "models"], 15_000)).out.split("\n")[0];
    if (/logged in with grok\.com/i.test(first)) return "Grok plan";
    if (/XAI_API_KEY|API key|deployment key/i.test(first)) return "xAI API key, pays per token";
    return undefined;
  },
  modes: {
    bypassPermissions: { name: "Full access", args: ["--permission-mode", "bypassPermissions", "--always-approve"] },
    auto: { name: "Auto", args: ["--permission-mode", "auto"] },
    acceptEdits: { name: "Accept edits", args: ["--permission-mode", "acceptEdits"] },
    plan: { name: "Plan", args: ["--permission-mode", "plan"] },
  },
  efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
  async models(bin) {
    return [...(await run([bin, "models"], 15_000)).out.matchAll(/^\s+[*-]\s+(\S+)/gm)].map((m) => m[1]);
  },
  preset: true,
  spoken: true,
  mcpRun: false,
  args: (t) => [
    "-p", t.prompt, "--output-format", "streaming-messages-json", t.fresh ? "-s" : "-r", t.session!, "--cwd", t.cwd, "--trust", "--no-auto-update",
    "--rules", t.spoken,
    ...grok.modes[t.mode]!.args,
    ...(t.model ? ["-m", t.model] : []),
    ...(t.effort && grok.efforts![t.effort] ? ["--effort", grok.efforts![t.effort]!] : []),
  ],
  parse: claudeStream,
  terminal: (session) => ["--resume", session],
  mcp: {
    add: async (bin, url) => void (await run([bin, "mcp", "add", "--transport", "http", "yonder", url], 20_000)),
    remove: async (bin) => void (await run([bin, "mcp", "remove", "yonder"])),
    has: async (bin) => JSON.parse((await run([bin, "mcp", "list", "--json"])).out || "[]").some((s: any) => s.name === "yonder"),
  },
  usage: () => grokLimits(),
};

// The GitHub Copilot CLI. --session-id starts a session with that ID or continues it, so the bridge picks the ID. Each
// line is a session event: assistant.message (the text and the tool requests), tool.execution_start, session.error,
// and result at the end. A sub-agent's events carry parentToolCallId. Only COPILOT_ALLOW_ALL=true trusts the folder, so
// that a headless run reads its AGENTS.md and MCP servers. It has no flag for a system prompt.
const copilot: Cli = {
  id: "copilot",
  name: "Copilot",
  bins: ["copilot"],
  version: /GitHub Copilot CLI/,
  install: "npm install -g @github/copilot@latest",
  login: ["login"],
  // "To authenticate, visit https://github.com/login/device and enter code 1234-5678" (the docs of GitHub; not run here,
  // because this Mac has no Copilot). It waits for the approval, and no key goes in, so it opens no browser.
  signIn: { args: ["login", "--device-code"], url: /(https:\/\/github\.com\/login\/device)/, code: /enter code ([A-Z0-9]{4}-[A-Z0-9]{4})/ },
  // It has no status command. It takes a token from the environment, its own sign-in, or the sign-in of the gh CLI.
  async account() {
    if (process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return "GitHub token, Copilot plan";
    if (/"loggedInUsers"\s*:\s*\[\s*\{/.test(read(join(HOME, ".copilot/config.json")))) return "Copilot plan";
    const gh = Bun.which("gh");
    return gh && (await run([gh, "auth", "status"])).code === 0 ? "Copilot plan, gh sign-in" : undefined;
  },
  modes: { bypassPermissions: { name: "Full access", args: ["--yolo", "--no-ask-user"] } },
  efforts: { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" },
  // The model IDs that the CLI takes, offline. They are not all open to each account.
  async models(bin) {
    const help = (await run([bin, "help", "config"])).out;
    const block = help.slice(help.search(/^\s*`?model`?:/m));
    return [...block.matchAll(/^\s+- "([^"]+)"/gm)].map((m) => m[1]);
  },
  preset: true,
  spoken: false,
  mcpRun: true,
  args: (t) => [
    "-p", t.prompt, "--output-format", "json", "--session-id", t.session!, "--no-auto-update",
    "--additional-mcp-config", JSON.stringify({ mcpServers: { yonder: { type: "http", url: t.mcp, tools: ["*"] } } }),
    ...copilot.modes[t.mode]!.args,
    ...(t.model ? ["--model", t.model] : []),
    ...(t.effort && copilot.efforts![t.effort] ? ["--reasoning-effort", copilot.efforts![t.effort]!] : []),
  ],
  env: () => ({ COPILOT_ALLOW_ALL: "true" }),
  parse(e) {
    const d = e.data ?? {};
    if (d.parentToolCallId) return [];
    if (e.type === "session.start") return [{ session: d.sessionId }];
    if (e.type === "assistant.message") return d.content?.trim() ? [{ text: d.content }] : [];
    if (e.type === "tool.execution_start") return [{ id: d.toolCallId, tool: { name: d.toolName, input: { ...d.arguments, file_path: d.arguments?.path } } }];
    if (e.type === "session.error") return [{ error: d.message ?? "Error." }];
    if (e.type === "result") return [{ session: e.sessionId }, e.exitCode === 0 ? { done: true } : { error: "The turn failed." }];
    return [];
  },
  terminal: (session) => [`--resume=${session}`],
  mcp: {
    add: async (bin, url) => void (await run([bin, "mcp", "add", "--transport", "http", "yonder", url], 20_000)),
    remove: async (bin) => void (await run([bin, "mcp", "remove", "yonder"])),
    has: async (bin) => (await run([bin, "mcp", "get", "yonder", "--json"])).code === 0,
  },
};

// An agent that the user added from the ACP registry (registry.ts). It runs in the ACP host with the command of the
// registry, in Full access: Yonder asks no person yet. Its sign-in is its own and has no check, so the agent counts as
// signed in after its first session. Until then Sign in opens the agent in a terminal, and a turn that fails gives the
// way of the agent to sign in.
export function addedCli(a: Added): Cli {
  const found = existsSync(a.command[0]);
  return {
    id: a.id,
    name: a.name,
    bins: [],
    version: /./,
    install: "",
    login: a.login.slice(1),
    account: async () => (a.ready ? "Signed in" : undefined),
    found: async () => (found || existsSync(a.command[0]) ? { path: a.command[0], version: a.version, account: a.ready ? "Signed in" : undefined } : {}),
    modes: { bypassPermissions: { name: "Full access", args: [] } },
    spoken: false,
    mcpRun: true,
    acp: { modes: {}, start: () => ({ argv: a.command, env: a.env }) },
    parse: acpParse,
    terminal: () => [],
  };
}

// The other CLIs by id, in the order of the Agents tab.
export const CLIS: Record<string, Cli> = { codex, antigravity, opencode, hermes, cursor, grok, copilot };
