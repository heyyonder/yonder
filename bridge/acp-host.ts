// The ACP host of Yonder: a small process that keeps the agents of the ACP CLIs (the Agent Client Protocol), such as
// Codex through codex-acp and OpenCode, alive while the bridge restarts. The bridge starts it detached (acp.ts) and
// talks to it over HTTP on a unix socket. It holds one ACP process for each agent, and writes each turn into the log of
// the bridge (`<run>.jsonl`), one normalized line for each step, so followRun and runTurns of main.ts read it as the
// log of any other CLI. All the CLIs share this one structure. docs/clis.md has the plan.
//
// The lines of a log: {type: "session", id}, {type: "model", model}, {type: "text", text} (the pieces of one answer,
// joined), {type: "tool", id, kind, title, input, path}, {type: "permission", id, title, allowed}, {type: "end",
// stopReason} or {type: "error", message} at the end of the turn.
import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const SOCKET = process.env.YONDER_ACP_SOCKET ?? join(homedir(), ".config/yonder/acp.sock");
const VERSION = process.env.YONDER_ACP_VERSION ?? "";
// An agent with no turn for this time stops, to free its memory. Its next turn starts it again and resumes the session.
const IDLE = 30 * 60_000;

// One turn, as the bridge sends it. `permission` answers each permission request: Yonder has no person to ask yet.
type TurnRequest = {
  command: string[];
  env: Record<string, string>;
  cwd: string;
  session?: string;
  prompt: string;
  mode?: string; // An ACP mode of the session, such as "read-only", or a value of its option of the category "mode".
  model?: string;
  effort?: string; // A value of the option of the category "thought_level".
  mcp: { name: string; url: string }[];
  http?: boolean; // The CLI takes HTTP MCP servers also when its capabilities do not say so, as Hermes 0.23 does.
  base: string; // The log of the turn, without .jsonl.
  permission: "allow" | "reject";
};
type Agent = {
  proc: ChildProcess;
  conn: acp.ClientSideConnection;
  sign: string; // The command, the environment and the folder: a change starts the agent again.
  session: string;
  modes: string[];
  mode?: string;
  // The options of the session by category (model, mode, thought_level): the ID, the value now, and the values.
  options: Record<string, { id: string; value: string; values: string[] }>;
  base?: string;
  busy: boolean;
  loading: boolean; // session/load replays the history as updates, and the replay goes in no log.
  text: string; // The pieces of the answer so far.
  calls: Map<string, Record<string, any>>; // The tool calls of the turn, merged from their updates.
  logged: Set<string>;
  permission: "allow" | "reject";
  idle: number;
};
const agents = new Map<string, Agent>();

const log = (a: Agent, line: Record<string, unknown>) => a.base && appendFileSync(`${a.base}.jsonl`, `${JSON.stringify(line)}\n`);
// The answer goes in the log as one line when another step comes, or at the end.
function flush(a: Agent) {
  if (a.text.trim()) log(a, { type: "text", text: a.text });
  a.text = "";
}
// A tool call goes in the log once, when it runs or ends, or when its input is more than a folder. Its first update
// often has only the title.
function call(a: Agent, update: Record<string, any>) {
  const id = update.toolCallId;
  const t = { ...a.calls.get(id), ...Object.fromEntries(Object.entries(update).filter(([, v]) => v != null)) };
  a.calls.set(id, t);
  const input = t.rawInput && typeof t.rawInput === "object" ? t.rawInput : {};
  const ready = ["in_progress", "completed", "failed"].includes(t.status) || Object.keys(input).some((k) => k !== "cwd");
  if (a.logged.has(id) || !ready) return;
  a.logged.add(id);
  flush(a);
  log(a, { type: "tool", id, kind: t.kind, title: t.title, input, path: t.locations?.[0]?.path });
}

// The message of an ACP error, with its data: "Internal error" alone says nothing. The ACP SDKs (TypeScript and Python,
// such as Hermes) put the message of an error that the agent did not catch in data.details (Sentry YONDER-1G).
function text(e: unknown) {
  const { message, data } = (e ?? {}) as { message?: string; data?: unknown };
  const d = (data ?? {}) as { message?: unknown; details?: unknown };
  const more = typeof data === "string" ? data : (d.message ?? d.details ?? "");
  return [message ?? String(e), typeof more === "string" ? more : JSON.stringify(more)].filter(Boolean).join(": ");
}

function end(a: Agent, line: Record<string, unknown>) {
  flush(a);
  log(a, line);
  Object.assign(a, { busy: false, base: undefined, idle: Date.now() });
}

function close(session: string) {
  const a = agents.get(session);
  agents.delete(session);
  a?.proc.kill();
}

// Starts the ACP process of an agent, and opens its session: a new one, or the one of its last turn.
async function open(t: TurnRequest, sign: string): Promise<Agent> {
  const proc = spawn(t.command[0], t.command.slice(1), { cwd: t.cwd, env: { ...process.env, ...t.env }, stdio: ["pipe", "pipe", "pipe"] });
  const a: Agent = {
    proc,
    sign,
    conn: undefined as unknown as acp.ClientSideConnection,
    session: "",
    modes: [],
    options: {},
    busy: false,
    loading: false,
    text: "",
    calls: new Map(),
    logged: new Set(),
    permission: t.permission,
    idle: Date.now(),
  };
  const failed = new Promise<never>((_, reject) => {
    proc.on("error", (e) => reject(new Error(`${t.command[0]} did not start: ${e.message}`)));
    proc.on("exit", (code) => reject(new Error(`${t.command[0]} stopped (exit code ${code}).`)));
  });
  failed.catch(() => {});
  proc.stderr!.on("data", (d) => a.base && appendFileSync(`${a.base}.err`, d));
  proc.on("exit", (code) => {
    if (agents.get(a.session) === a) agents.delete(a.session);
    if (a.busy) end(a, { type: "error", message: `The agent stopped (exit code ${code}).` });
  });
  a.conn = new acp.ClientSideConnection(
    () => ({
      async sessionUpdate({ update }) {
        const u = update as Record<string, any>;
        if (a.loading || !a.base) return;
        if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") a.text += u.content.text;
        else if (u.sessionUpdate === "tool_call" || u.sessionUpdate === "tool_call_update") call(a, u);
        else if (u.sessionUpdate === "config_option_update") {
          options(a, u.configOptions);
          if (a.options.model) log(a, { type: "model", model: a.options.model.value });
        }
      },
      // Yonder asks no person yet: Full access allows once, each other mode refuses once. "Always" would write a rule
      // into the settings of the CLI.
      async requestPermission(p) {
        const allowed = a.permission === "allow";
        const kinds = allowed ? ["allow_once", "allow_always"] : ["reject_once", "reject_always"];
        const option = kinds.map((k) => p.options.find((o) => o.kind === k)).find((o) => o);
        flush(a);
        log(a, { type: "permission", id: p.toolCall.toolCallId, title: p.toolCall.title, allowed });
        return { outcome: option ? { outcome: "selected", optionId: option.optionId } : { outcome: "cancelled" } };
      },
    }),
    acp.ndJsonStream(Writable.toWeb(proc.stdin!) as WritableStream<Uint8Array>, Readable.toWeb(proc.stdout!) as unknown as ReadableStream<Uint8Array>),
  );
  // How the CLI signs in, from its auth methods, for the error of a CLI that is signed out.
  let auth = "";
  try {
    const init = await Promise.race([a.conn.initialize({ protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} }), failed]);
    const ways = (init.authMethods ?? []).map((m) => (m.description || m.name).replace(/\.$/, "")).filter(Boolean);
    auth = ways.length ? `To sign in: ${ways.join("; or ")}.` : "";
    const caps = init.agentCapabilities ?? {};
    const mcpServers = caps.mcpCapabilities?.http || t.http ? t.mcp.map((m) => ({ type: "http" as const, name: m.name, url: m.url, headers: [] })) : [];
    let opened: { modes?: acp.SessionModeState | null; configOptions?: acp.SessionConfigOption[] | null };
    if (!t.session) {
      const r = await Promise.race([a.conn.newSession({ cwd: t.cwd, mcpServers }), failed]);
      a.session = r.sessionId;
      opened = r;
    } else if (caps.sessionCapabilities?.resume) {
      opened = await Promise.race([a.conn.resumeSession({ sessionId: t.session, cwd: t.cwd, mcpServers }), failed]);
      a.session = t.session;
    } else if (caps.loadSession) {
      a.loading = true;
      opened = await Promise.race([a.conn.loadSession({ sessionId: t.session, cwd: t.cwd, mcpServers }), failed]);
      a.loading = false;
      a.session = t.session;
    } else throw new Error("This CLI cannot continue a session.");
    a.modes = opened.modes?.availableModes.map((m) => m.id) ?? [];
    a.mode = opened.modes?.currentModeId;
    options(a, opened.configOptions);
    agents.set(a.session, a);
    return a;
  } catch (e) {
    proc.kill();
    const message = text(e);
    throw new Error(/auth|sign.?in|log.?in|provider|api.?key|config/i.test(message) && auth ? `${message.replace(/\.*$/, "")}. ${auth}` : message);
  }
}

// The options of a session, from its start or from an update. A select can hold its values in groups.
function options(a: Agent, list?: acp.SessionConfigOption[] | null) {
  for (const o of (list ?? []) as Record<string, any>[]) {
    if (!o.category || o.type !== "select") continue;
    const values = (o.options ?? []).flatMap((x: any) => x.options ?? [x]).map((x: any) => String(x.value));
    a.options[o.category] = { id: o.id, value: String(o.currentValue), values };
  }
}
const NAMES: Record<string, string> = { thought_level: "effort" };
async function choose(a: Agent, category: string, value: string) {
  const o = a.options[category];
  if (!o || o.value === value) return;
  if (!o.values.includes(value)) throw new Error(`The CLI has no ${NAMES[category] ?? category} "${value}". It has: ${o.values.slice(0, 12).join(", ")}.`);
  await a.conn.setSessionConfigOption({ sessionId: a.session, configId: o.id, value });
  o.value = value;
}

async function turn(t: TurnRequest) {
  let a = t.session ? agents.get(t.session) : undefined;
  if (a?.busy) throw new Error("The agent still runs a turn.");
  const sign = JSON.stringify([t.command, t.env, t.cwd]);
  if (a && (a.sign !== sign || a.proc.exitCode !== null)) {
    close(a.session);
    a = undefined;
  }
  a ??= await open(t, sign);
  if (t.mode && a.modes.includes(t.mode)) {
    if (t.mode !== a.mode) await a.conn.setSessionMode({ sessionId: a.session, modeId: t.mode });
    a.mode = t.mode;
  } else if (t.mode) await choose(a, "mode", t.mode);
  if (t.model) await choose(a, "model", t.model);
  if (t.effort) await choose(a, "thought_level", t.effort);
  Object.assign(a, { base: t.base, text: "", busy: true, permission: t.permission, calls: new Map(), logged: new Set() });
  log(a, { type: "session", id: a.session });
  if (a.options.model) log(a, { type: "model", model: a.options.model.value });
  const turned = a;
  a.conn.prompt({ sessionId: a.session, prompt: [{ type: "text", text: t.prompt }] }).then(
    (r) => turned.busy && end(turned, { type: "end", stopReason: r.stopReason }),
    (e) => turned.busy && end(turned, { type: "error", message: text(e) }),
  );
  return { session: a.session, pid: process.pid };
}

// A cancel ends the turn as Escape does in the CLI. A turn that does not end in 3 seconds loses its process.
async function cancel(session: string) {
  const a = agents.get(session);
  if (!a?.busy) return;
  await a.conn.cancel({ sessionId: session }).catch(() => {});
  for (let i = 0; i < 30 && a.busy; i++) await Bun.sleep(100);
  if (a.busy) a.proc.kill();
}

setInterval(() => {
  for (const [session, a] of agents) if (!a.busy && Date.now() - a.idle > IDLE) close(session);
}, 60_000);

if (existsSync(SOCKET)) rmSync(SOCKET);
Bun.serve({
  unix: SOCKET,
  // A new agent can take a while: the CLI starts and opens its session. Bun ends a quiet request after 10 seconds by
  // default. Its types refuse idleTimeout with a unix socket, but it works (tested with Bun 1.3.11).
  ...({ idleTimeout: 255 } as {}),
  async fetch(req) {
    const path = new URL(req.url).pathname;
    try {
      const busy = [...agents.values()].filter((a) => a.busy).length;
      if (path === "/health") return Response.json({ pid: process.pid, version: VERSION, busy });
      if (path === "/agents") return Response.json([...agents.values()].map((a) => ({ session: a.session, busy: a.busy, pid: a.proc.pid })));
      const body = req.method === "POST" ? await req.json() : {};
      if (path === "/turn") return Response.json(await turn(body));
      if (path === "/cancel") return Response.json(await cancel(body.session).then(() => ({})));
      if (path === "/close") return Response.json((close(body.session), {}));
      // A new version of the host takes over only when no turn runs, unless the bridge forces it.
      if (path === "/quit") {
        if (busy && !body.force) return Response.json({ error: `${busy} turns run.` }, { status: 409 });
        setTimeout(() => process.exit(0), 100);
        return Response.json({});
      }
      return Response.json({ error: "Not found." }, { status: 404 });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  },
});
console.log(`The ACP host listens on ${SOCKET} (pid ${process.pid}).`);
