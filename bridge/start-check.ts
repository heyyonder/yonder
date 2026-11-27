// Check that the bridge starts and serves its tools: `bun run check-bridge`. It needs no network and no running
// bridge, and it starts no workers, so it uses no credits. It runs bridge/main.ts on a free port with an empty home
// folder, so it does not touch the state, the .env or the relay of the live bridge. The GitHub workflow runs it.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAMPLES } from "./ui";
import { make } from "./link";

function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}

const free = Bun.serve({ port: 0, fetch: () => new Response() });
const PORT = free.port;
free.stop();
const MCP = `http://127.0.0.1:${PORT}/mcp`;
const home = realpathSync(mkdtempSync(join(tmpdir(), "yonder-home-")));
// A long chat: one done agent with 3000 prompts and answers (6 MB), for the turns of the Context tab. No summaries, so
// no Haiku.
const LONG = join(home, "long");
const longDir = join(home, ".claude", "projects", LONG.replace(/[^a-zA-Z0-9]/g, "-"));
mkdirSync(longDir, { recursive: true });
// The runner of GitHub has no Claude Code, so the bridge runs a stand-in, first on its PATH, also on a Mac. Else
// the poll fails there, and the run stays running. `agents` lists the
// sessions in fake-agents of the config folder, and `stop` ends one of them, unless it refuses.
mkdirSync(join(home, ".local/bin"), { recursive: true });
writeFileSync(
  join(home, ".local/bin/claude"),
  `#!/bin/sh
d="\${CLAUDE_CONFIG_DIR:-$HOME/.claude}/fake-agents"
case "$1" in
  agents) printf '['; sep=; for f in "$d"/*.json; do [ -f "$f" ] && printf '%s' "$sep" && cat "$f" && sep=,; done; echo ']' ;;
  stop) [ -f "$d/$2.json" ] && [ ! -f "$d/$2.refuse" ] && rm "$d/$2.json" ;;
esac
`,
  { mode: 0o755 },
);
// Background sessions of Claude Code that Yonder did not start, as the stand-in lists them. aaaa1111 in the folder of
// the profile p2 is a lost start of this bridge: the roster of the daemon names its start ID, as a restart of the bridge
// can leave one. dddd4444 has the start ID of agent 9, as a start that runs now. bbbb2222 is in the folder of p2,
// and cccc3333 refuses to stop.
const OUTSIDE = join(home, "outside");
mkdirSync(OUTSIDE);
const fake = (dir: string, short: string, roster?: string) => {
  const sessionId = `${short}-0000-4000-8000-000000000000`;
  mkdirSync(join(home, dir, "fake-agents"), { recursive: true });
  writeFileSync(join(home, dir, "fake-agents", `${short}.json`), JSON.stringify({ id: short, sessionId, cwd: OUTSIDE, kind: "background", pid: process.pid, status: "idle", state: "done", startedAt: 1 }));
  return [short, { sessionId, dispatch: { launch: { args: roster ? ["--mcp-config", JSON.stringify({ mcpServers: { yonder: { type: "http", url: `http://127.0.0.1:${PORT}/mcp?worker=${roster}` } } })] : [] } } }];
};
for (const [dir, sessions] of [[".claude-p2", [fake(".claude-p2", "aaaa1111", "new17000000000002"), fake(".claude-p2", "bbbb2222")]], [".claude", [fake(".claude", "cccc3333"), fake(".claude", "dddd4444", "new17000000000001")]]] as const) {
  mkdirSync(join(home, dir, "daemon"), { recursive: true });
  writeFileSync(join(home, dir, "daemon/roster.json"), JSON.stringify({ workers: Object.fromEntries(sessions) }));
}
writeFileSync(join(home, ".claude/fake-agents/cccc3333.refuse"), "");
mkdirSync(join(home, `.config/yonder-${PORT}`), { recursive: true });
// A trusted source of new task links (bridge/link.ts), with a folder for them.
const LINKS = join(home, "links");
mkdirSync(LINKS);
const LINK_KEY = "ab".repeat(32);
writeFileSync(join(home, `.config/yonder-${PORT}`, "config.json"), JSON.stringify({ sumUp: false, textUp: false, trustedLinkSources: [{ id: "site.example", key: LINK_KEY, folder: LINKS }], profiles: [{ id: "p-agy", name: "Antigravity Work", cli: "antigravity", flags: "--sandbox" }, { id: "p2", name: "Second", cli: "claude", own: true }] }));
const SESSION = "00000000-0000-4000-8000-000000000009";
// Agents 7 and 8 ran and waited before a restart of the computer (updatedAt 1).
const before = (id: string, status: string) => ({ id, num: Number(id[1]), sessionId: `00000000-0000-4000-8000-00000000000${id[1]}`, name: id, project: "long", path: LONG, task: id, status, activity: "", result: "", unread: false, startedAt: 1, updatedAt: 1 });
writeFileSync(join(home, `.config/yonder-${PORT}`, "state.json"), JSON.stringify({ workers: [{ id: "w9", startId: "new17000000000001", num: 9, sessionId: SESSION, name: "Long", project: "long", path: LONG, task: "Long", status: "done", activity: "", result: "", unread: false, startedAt: 1, updatedAt: 1 }, before("w7", "running"), { ...before("w8", "waiting"), keyed: true }, { ...before("w6", "done"), cli: "antigravity", profile: "p-agy", task: "t".repeat(500), result: "r".repeat(500) }, { ...before("w5", "running"), schedule: "s5" }, { ...before("w4", "done"), kind: "terminal" }], schedules: [{ id: "s5", name: "Run", project: LONG, task: "w5", next: Date.now() + 86_400_000, createdAt: 1, every: 24, retries: 0 }] }));
// The log of the runs that ended well (RUNS_LOG): one line of the schedule s5, and one of a schedule that is gone.
writeFileSync(join(home, `.config/yonder-${PORT}`, "schedule-runs.jsonl"), [{ at: 2, schedule: "s5", name: "Run", agent: 5, tries: 0, result: "Posted." }, { at: 3, schedule: "gone", name: "Gone", tries: 1, result: "Done." }].map((r) => JSON.stringify(r) + "\n").join(""));
// Agent 5, a run of a schedule with no retries, died in the middle of its turn.
writeFileSync(join(longDir, "00000000-0000-4000-8000-000000000005.jsonl"), [{ type: "user", message: { role: "user", content: "w5" } }, { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t", name: "Bash", input: {} }] } }].map((e) => JSON.stringify({ ...e, sessionId: "00000000-0000-4000-8000-000000000005", cwd: LONG, timestamp: new Date(Date.now() - 60_000).toISOString() })).join("\n") + "\n");
writeFileSync(
  join(longDir, `${SESSION}.jsonl`),
  Array.from({ length: 3000 }, (_, i) => [
    { type: "user", message: { role: "user", content: `Question ${i}` } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: `Answer ${i} ${"x".repeat(1500)}` }] } },
  ]).flat().map((e) => JSON.stringify({ ...e, sessionId: SESSION, cwd: LONG })).join("\n") + "\n",
);
// fileDays: a picture of 40 days ago goes at the start of the bridge, and a new one stays.
const pictures = join(home, `.config/yonder-${PORT}`, "images");
mkdirSync(pictures, { recursive: true });
writeFileSync(join(pictures, "old.png"), "");
writeFileSync(join(pictures, "new.png"), "");
utimesSync(join(pictures, "old.png"), new Date(Date.now() - 40 * 86_400_000), new Date(Date.now() - 40 * 86_400_000));
// With no CLAUDE_CONFIG_DIR of the agent that runs the check, the bridge writes the settings of Claude Code in the test home.
const { CLAUDE_CONFIG_DIR: _, ...parent } = process.env;
const bridge = Bun.spawn(["bun", join(import.meta.dir, "main.ts")], { env: { ...parent, HOME: home, YONDER_PORT: String(PORT), YONDER_OWNER_CHECK: "no", PATH: `${join(home, ".local/bin")}:${parent.PATH}` }, stdout: "inherit", stderr: "inherit" });

try {
  let up = false;
  for (let i = 0; i < 150 && !up && bridge.exitCode === null; i++) {
    up = await fetch(MCP).then(() => true, () => false);
    if (!up) await Bun.sleep(100);
  }
  assert(up, `the bridge starts on port ${PORT}`);
  assert(!existsSync(join(pictures, "old.png")) && existsSync(join(pictures, "new.png")), "an attachment older than fileDays (30) goes at the start");

  const foreign = await fetch(MCP, { method: "POST", headers: { origin: "https://example.com" } });
  assert(foreign.status === 403, "refuses a request from another web page");
  const rebind = Bun.spawnSync(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-H", `Host: example.com:${PORT}`, MCP]);
  assert(rebind.stdout.toString() === "403", "refuses a request with a foreign Host header");
  const blind = (site: string) => fetch(`http://127.0.0.1:${PORT}/show`, { headers: { "sec-fetch-site": site } }).then((r) => r.status);
  assert((await blind("cross-site")) === 403 && (await blind("same-site")) === 403 && (await blind("none")) === 200, "refuses a GET with a cost or a change from another site with no Origin, such as an <img>");

  // The ↓ of the viewer: /save copies a file to the Downloads folder, and a second copy of the same name gets " 2".
  const save = (q: string, body?: string) => fetch(`http://127.0.0.1:${PORT}/save?${q}`, { method: "POST", body });
  const first = (await (await save("name=cow.png", "a")).json()) as { path: string };
  const second = (await (await save("name=cow.png", "b")).json()) as { path: string };
  assert(first.path === join(home, "Downloads", "cow.png") && second.path === join(home, "Downloads", "cow 2.png"), "/save writes to Downloads with a new name for a second copy");
  assert((await save(`src=${encodeURIComponent("/etc/hosts")}`)).status === 404, "/save refuses a file that no conversation shows");

  const client = new Client({ name: "yonder-start-check", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP)));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { text: string }[]).map((c) => c.text).join("");
    if (res.isError) throw new Error(`${name}: ${text}`);
    return JSON.parse(text);
  };
  const tools = (await client.listTools()).tools.map((t) => t.name);
  assert(["start_worker", "message_worker", "list_workers", "get_worker", "close_worker", "list_workspaces", "get_usage"].every((t) => tools.includes(t)), `lists ${tools.length} tools`);
  const whole = await call("list_workers", { full: true });
  assert(Array.isArray(whole), "list_workers answers with a list");
  // With no arguments, the counts of the tabs and a short list, small enough for a voice call.
  const bare = await call("list_workers");
  const counted = Object.values(bare.counts as Record<string, number>).reduce((a, b) => a + b, 0);
  assert(Object.keys(bare.counts).join() === "agents,completed,saved,closed" && counted === whole.length && bare.list.length === Math.min(20, counted) && !bare.list.some((w: object) => "task" in w),
    `list_workers with no arguments gives the counts and a short list: ${JSON.stringify(bare.counts)}`);
  const done = await call("list_workers", { tab: "completed", limit: 1 });
  assert(done.counts.completed === bare.counts.completed && done.list.length === Math.min(1, done.counts.completed) && done.list.every((w: { status: string; saved?: boolean }) => ["waiting", "done", "failed"].includes(w.status) && !w.saved),
    "list_workers with tab gives only the agents of the Done tab");
  // A restart of the computer ended the sessions of agents 7 and 8. Without the mark, a poll closes them.
  const byId = async () => Object.fromEntries((await call("list_workers", { full: true })).map((w: { id: string }) => [w.id, w]));
  let rebooted = await byId();
  assert(rebooted.w7?.status === "waiting" && rebooted.w7.result === "The computer restarted." && rebooted.w8?.status === "waiting", "after a restart of the computer, a running agent waits and a waiting agent keeps waiting");
  await Bun.sleep(4500);
  rebooted = await byId();
  assert(rebooted.w7?.status === "waiting" && rebooted.w8?.status === "waiting", "they still wait after two polls");
  assert(rebooted.w5?.status === "failed" && rebooted.w5.result === "The session stopped before the end of the task.", "a run of a schedule that died is failed, not closed or waiting");
  // Save for later: the agent goes to the Saved tab, and saved false puts it back on the Done tab.
  await call("star_worker", { worker: "9", saved: true });
  assert((await byId()).w9?.saved === true, "star_worker with saved puts a done agent on the Saved tab");
  await call("star_worker", { worker: "9", saved: false });
  assert(!(await byId()).w9?.saved, "star_worker with saved false puts it back on the Done tab");
  // A star is a save: `starred` is the old name of `saved`.
  await call("star_worker", { worker: "9", starred: true });
  assert((await byId()).w9?.saved === true, "star_worker with starred saves the agent for later");
  await call("star_worker", { worker: "9", saved: false });
  // The plan of Plan mode: the hook denies ExitPlanMode at once, so the turn ends, and the next message approves the plan.
  const plan = await (await fetch(`http://127.0.0.1:${PORT}/ask`, { method: "POST", body: JSON.stringify({ session_id: SESSION, tool_name: "ExitPlanMode", tool_input: { plan: "1. Do it." } }) })).json();
  const planned = JSON.parse(readFileSync(join(home, `.config/yonder-${PORT}`, "state.json"), "utf8")).workers.find((w: { id: string }) => w.id === "w9");
  assert(plan.hookSpecificOutput?.decision?.behavior === "deny" && planned?.planned === true, `the hook ends the turn of a plan, and marks the plan as shown: ${JSON.stringify(plan)}`);
  // A question of the agent: the card shows it as a choice, and the pick goes back as the answer of AskUserQuestion.
  const question = { question: "Which color?", header: "Color", multiSelect: false, options: [{ label: "Red", description: "" }, { label: "Blue", description: "" }] };
  const questioned = fetch(`http://127.0.0.1:${PORT}/ask`, { method: "POST", body: JSON.stringify({ session_id: SESSION, tool_name: "AskUserQuestion", tool_input: { questions: [question] } }) }).then((r) => r.json());
  let card: { id: string; kind?: string; title?: string; choices?: string[] } | undefined;
  for (let i = 0; i < 50 && !card; i++) {
    card = JSON.parse(readFileSync(join(home, `.config/yonder-${PORT}`, "state.json"), "utf8")).workers.find((w: { id: string }) => w.id === "w9")?.ask;
    if (!card) await Bun.sleep(100);
  }
  assert(card?.kind === "choice" && card.title === "Which color?" && card.choices?.join() === "Red,Blue", `a question of the agent shows as a choice on the card: ${JSON.stringify(card)}`);
  await fetch(`http://127.0.0.1:${PORT}/permission`, { method: "POST", body: JSON.stringify({ id: card!.id, allow: true, choice: "Blue" }) });
  const picked = await questioned;
  assert(picked.hookSpecificOutput?.decision?.behavior === "allow" && picked.hookSpecificOutput.decision.updatedInput?.answers?.["Which color?"] === "Blue", `the pick goes back as the answer: ${JSON.stringify(picked)}`);
  // Terms: a yes from the Mac counts only after Touch ID (here a no, YONDER_OWNER_CHECK), and the ask stays. Without Touch ID
  // (Linux, Windows) only the phone can say yes.
  const terms = call("ask_user", { agent: "9", kind: "terms", title: "Paid Apps Agreement", text: "Accept it.", link: "https://developer.apple.com/support/terms/" });
  let termsAsk: { id: string; touchId?: boolean } | undefined;
  for (let i = 0; i < 50 && !termsAsk; i++) {
    termsAsk = JSON.parse(readFileSync(join(home, `.config/yonder-${PORT}`, "state.json"), "utf8")).workers.find((w: { id: string }) => w.id === "w9")?.ask;
    if (!termsAsk) await Bun.sleep(100);
  }
  const mac = process.platform === "darwin";
  assert(!!termsAsk && !!termsAsk.touchId === mac, `a terms ask has touchId only on a Mac: ${JSON.stringify(termsAsk)}`);
  const macYes = await (await fetch(`http://127.0.0.1:${PORT}/permission`, { method: "POST", body: JSON.stringify({ id: termsAsk!.id, allow: true }) })).json();
  assert(macYes.ok === false && macYes.error === (mac ? "Touch ID did not approve it." : "Approve it on the phone, with Face ID."), `a yes from the Mac to terms needs Touch ID: ${JSON.stringify(macYes)}`);
  await fetch(`http://127.0.0.1:${PORT}/permission`, { method: "POST", body: JSON.stringify({ id: termsAsk!.id, allow: false }) });
  assert((await terms).answer === "no", "the terms ask stays after a refused yes, and Deny goes to the agent");
  // The picture of an agent: rename_worker keeps a shape and a color with the name, and refuses a color that is not #rrggbb.
  await call("rename_worker", { worker: "9", shape: "cloud", color: "#FF6700" });
  const pictured = (await byId()).w9;
  assert(pictured?.avatar?.shape === "cloud" && pictured.avatar.color === "#ff6700" && pictured.name, "rename_worker with shape and color gives the agent its avatar and keeps its name");
  assert(await call("rename_worker", { worker: "9", shape: "cloud", color: "red" }).then(() => false, () => true), "rename_worker refuses a color that is not #rrggbb");
  // closedBy: who closed an agent. This client has no device, so it is another MCP client. The voice sends the ID of its
  // call, and an agent calls from the address in its --mcp-config. Agent 6 runs in another CLI with no process, so its
  // close starts nothing.
  await call("close_worker", { worker: "6" });
  assert((await byId()).w6?.closedBy === "mcp", "a close from another MCP client sets closedBy to mcp");
  const short = (await byId()).w6;
  assert(short?.task.length === 200 && short.result.length === 200, `the full list gives a closed agent a short task and result: ${short?.task.length}, ${short?.result.length}`);
  await call("close_worker", { worker: "6", call: "1" });
  assert((await byId()).w6?.closedBy === "voice", "a close with the ID of a call sets closedBy to voice");
  const nine = new Client({ name: "yonder-start-check-agent", version: "0.1.0" });
  await nine.connect(new StreamableHTTPClientTransport(new URL(`${MCP}?worker=w9`)));
  await nine.callTool({ name: "close_worker", arguments: { worker: "6" } });
  assert((await byId()).w6?.closedBy === 9, "a close from agent 9 sets closedBy to 9");
  // Agent 8 got an address with a key (mcpUrl in main.ts), so its public ID alone is a forgery. Agent 9 is from before the
  // key, so its ID alone still works until its session starts again.
  const mode = (file: string) => (statSync(file).mode & 0o777).toString(8);
  const asAgent = (q: string) => fetch(`${MCP}?${q}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }).then((r) => r.status);
  assert((await asAgent("worker=w8")) === 403 && (await asAgent("worker=w8&key=00")) === 403, "a call with the ID of a keyed agent and no key, or a wrong key, is refused");
  const workerSecret = readFileSync(join(home, `.config/yonder-${PORT}`, "worker-key"), "utf8").trim();
  const keyOf = (id: string) => createHmac("sha256", workerSecret).update(`worker ${id}`).digest("hex").slice(0, 32);
  assert((await asAgent(`worker=w8&key=${keyOf("w9")}`)) === 403 && (await asAgent(`worker=w8&key=${keyOf("w8")}`)) === 200, "the key of another agent is refused, and the key of the agent passes");
  assert((await asAgent("worker=w7")) === 200 && (await asAgent(`worker=w7&key=${keyOf("w7")}`)) === 200 && (await asAgent("worker=w7")) === 403, "an agent passes with its ID alone until its first call with a key");
  assert(mode(join(home, `.config/yonder-${PORT}`, "worker-key")) === "600" && !readFileSync(join(home, `.config/yonder-${PORT}`, "config.json"), "utf8").includes(workerSecret), "the secret of the keys has mode 600, and the workers do not get it");
  assert(mode(join(home, `.config/yonder-${PORT}`)) === "700" && mode(join(home, `.config/yonder-${PORT}`, "state.json")) === "600", "only this OS user reads the config folder and state.json");
  // The background sessions of the stand-in (fake): a lost start of this bridge is its agent again, in its profile.
  const outside = await byId();
  assert(outside.aaaa11 && !outside.aaaa11.kind && outside.aaaa11.startId === "new17000000000002" && outside.aaaa11.profile === "Second" && outside.aaaa11.num > 0,
    `a lost start of this bridge is its agent again, with its start ID and its profile: ${JSON.stringify(outside.aaaa11)}`);
  assert(outside.dddd4444?.kind === "background", "a session with the start ID of an agent of Yonder stays outside");
  // close_worker of a background session that Yonder did not start: the stop reaches the folder of its profile, and the
  // session moves to the Closed tab.
  const shut = await call("close_worker", { worker: "bbbb2222" });
  assert(shut.status === "closed" && shut.closedBy === "mcp" && !shut.kind && !existsSync(join(home, ".claude-p2/fake-agents/bbbb2222.json")) && (await byId()).bbbb22?.status === "closed",
    `close_worker stops a background session in the folder of its profile, and moves it to the Closed tab: ${JSON.stringify(shut)}`);
  const stuck = await call("close_worker", { worker: "cccc3333" }).then(() => "", (e: Error) => e.message);
  assert(/cannot stop/.test(stuck) && (await byId()).cccc3333?.kind === "background", `close_worker gives an error when Claude Code cannot stop the session: ${stuck}`);

  // The Context tab: the last 300 turns, more with a count, and never more than one frame of the relay (1 MiB).
  const chat = async (q = "") => {
    const res = await fetch(`http://127.0.0.1:${PORT}/conversation?worker=w9${q}`);
    const body = await res.text();
    return { list: JSON.parse(body) as { text: string }[], size: Buffer.byteLength(body) };
  };
  const [last300, last600] = [await chat(), await chat("&count=600")];
  assert(last300.list.length === 300 && last300.list.at(-1)!.text.startsWith("Answer 2999 "), "/conversation gives the last 300 turns");
  assert(last600.list.length > 300 && last600.list.at(-1)!.text.startsWith("Answer 2999 ") && last600.size <= 900_000, `a count of 600 gives older turns too, in 900 KB or less (${last600.list.length} turns, ${last600.size} bytes)`);
  const all = await chat("&count=6000");
  assert(all.size <= 900_000 && all.list.length > 600 && all.list.length < 6000 && all.list.at(-1)!.text.startsWith("Answer 2999 "), `a count of 6000 drops the oldest turns to fit in 900 KB (${all.list.length} turns, ${all.size} bytes)`);
  assert((await fetch(`http://127.0.0.1:${PORT}/conversation?worker=nobody`)).status === 404, "/conversation of an unknown agent is a 404");

  // A new task link: the sheet gets what it shows and never the key, and a link with no good signature gets nothing.
  const link = (path: string, url: string) => fetch(`http://127.0.0.1:${PORT}${path}`, { method: "POST", body: JSON.stringify({ url }) });
  const good = make(LINK_KEY, "site.example", LINKS, "Link task", "Say hello.");
  const linkSheet = await link("/link", good);
  const linkText = await linkSheet.text();
  assert(linkSheet.ok && JSON.parse(linkText).folder === LINKS && JSON.parse(linkText).prompt === "Say hello." && !linkText.includes(LINK_KEY), "/link gives the sheet of a signed link, with no key");
  assert((await link("/link", good.replace(/sig=[0-9a-f]+/, `sig=${"0".repeat(64)}`))).status === 403, "/link refuses a bad signature");
  assert((await link("/link/start", make(LINK_KEY, "site.example", LINKS, "Link task", "Say hello."))).status === 403, "/link/start refuses a link with no open sheet");

  // The call key and the bar module of Omarchy (omarchy/yonder).
  const status = await fetch(`http://127.0.0.1:${PORT}/status`).then((r) => r.json());
  assert(typeof status.text === "string" && status.class === "", "/status gives the text of the bar, with no call");
  const windows = await fetch(`http://127.0.0.1:${PORT}/call`, { method: "POST" }).then((r) => r.json());
  assert(windows.windows === 0, "/call counts the open windows of the app");
  // Two windows listen on /events. The call key reaches only the newer one, so two windows never start two calls.
  const count = async (n: number) => {
    for (let i = 0; i < 50 && (await fetch(`http://127.0.0.1:${PORT}/call`).then((r) => r.json())).windows !== n; i++) await Bun.sleep(20);
  };
  const listen = () => fetch(`http://127.0.0.1:${PORT}/events`).then((r) => r.body!.getReader());
  const older = listen();
  await count(1);
  const newer = listen();
  await count(2);
  await fetch(`http://127.0.0.1:${PORT}/call`, { method: "POST" });
  const heard = (reader: Promise<ReadableStreamDefaultReader<Uint8Array>>) =>
    Promise.race([reader.then((r) => r.read()).then(({ value }) => new TextDecoder().decode(value)), Bun.sleep(500).then(() => "")]);
  const [a, b] = await Promise.all([heard(older), heard(newer)]);
  assert(a === "" && b.includes("toggle-call"), "/call starts or ends the call in the newest window only");
  for (const reader of [older, newer]) (await reader).cancel();

  // The version "2.B.N" (version.ts), and the commit count N alone for an older screen.
  const full = await fetch(`http://127.0.0.1:${PORT}/version?full`).then((r) => r.json());
  const n = await fetch(`http://127.0.0.1:${PORT}/version`).then((r) => r.json());
  assert(/^2\.\d+\.\d+$/.test(full) && n === Number(full.split(".")[2]), `/version gives ${full}, and ${n} with no full`);

  // The Steer row: off by default, and a POST turns it on.
  const steer = (init?: RequestInit) => fetch(`http://127.0.0.1:${PORT}/steer`, init).then((r) => r.json());
  const off = await steer();
  const on = await steer({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: true }) });
  assert(off.on === false && on.on === true && (await steer()).on === true, "/steer is off by default, and a POST turns it on");

  // agentName in config.json: a hand edit changes the word of /agent-name and of the tool descriptions of a new client.
  const named = () => fetch(`http://127.0.0.1:${PORT}/agent-name`).then((r) => r.json());
  assert((await named()).one === "agent", "/agent-name is agent by default");
  const configFile = join(home, `.config/yonder-${PORT}/config.json`);
  writeFileSync(configFile, JSON.stringify({ ...JSON.parse(await Bun.file(configFile).text()), agentName: { one: "mouse", many: "mice" }, agentNaming: "names" }));
  const mice = new Client({ name: "yonder-start-check-mice", version: "0.1.0" });
  await mice.connect(new StreamableHTTPClientTransport(new URL(MCP)));
  const miceTools = (await mice.listTools()).tools;
  const listed = miceTools.find((t) => t.name === "list_workers")?.description ?? "";
  const input = (miceTools.find((t) => t.name === "get_worker")?.inputSchema.properties as Record<string, { description?: string }>)?.worker?.description ?? "";
  // The words of the bridge in a result follow the word too: an error and a note. The other fields keep their words.
  const text = async (args: Record<string, unknown>) => {
    const res = await mice.callTool({ name: "move_worker", arguments: args });
    return { error: !!res.isError, text: (res.content as { text: string }[]).map((c) => c.text).join("") };
  };
  // An agent of another CLI moves, and it keeps its CLI and its profile. A terminal session that Yonder did not start cannot.
  const OTHER = join(home, "other");
  mkdirSync(OTHER, { recursive: true });
  const moved = await text({ worker: "w6", project: OTHER });
  const cannot = await text({ worker: "w4", project: OTHER });
  mkdirSync(LONG, { recursive: true });
  const stays = await text({ worker: "w9", project: LONG });
  const bins: Record<string, string[]> = { opencode: ["opencode"], copilot: ["copilot"], antigravity: ["agy"], grok: ["grok"], codex: ["codex"], cursor: ["cursor-agent", "agent"], hermes: ["hermes"] };
  const absent = Object.keys(bins).find((id) => bins[id].every((bin) => !Bun.which(bin)));
  const unknownProfile = await mice.callTool({ name: "message_worker", arguments: { worker: "w9", message: "Continue.", profile: "not-a-profile" } });
  // A CLI that is not installed must fail before a process starts, and the agent must keep its session.
  const switched = absent ? await mice.callTool({ name: "message_worker", arguments: { worker: "w9", message: "Continue.", profile: absent } }) : undefined;
  await mice.close();
  assert((await named()).many === "mice" && (await named()).naming === "names" && /\bMice tab\b/.test(listed) && !/\bagents?\b/i.test(listed), `a new client reads "mice" in the tools: ${listed.slice(0, 120)}`);
  assert(/^The mouse number/.test(input) && !/\bagents?\b/i.test(input), `and in the inputs of the tools: ${input.slice(0, 80)}`);
  const movedBody = moved.error ? {} : JSON.parse(moved.text);
  assert(!moved.error && movedBody.path === OTHER && movedBody.cli === "antigravity" && movedBody.profile === "Antigravity Work" && /keeps the profile Antigravity Work/.test(movedBody.note), `an agent of another CLI moves and keeps its profile: ${moved.text}`);
  const saved = JSON.parse(readFileSync(join(home, `.config/yonder-${PORT}`, "state.json"), "utf8")).workers.find((w: { id: string }) => w.id === "w6");
  assert(saved?.path === OTHER && saved.cli === "antigravity" && saved.profile === "p-agy", `the saved agent keeps its CLI and its profile id: ${JSON.stringify(saved)}`);
  assert(cannot.error && /^Mouse \d+ is a terminal session/.test(cannot.text), `an error reads "mice": ${cannot.text}`);
  const note = stays.error ? stays.text : JSON.parse(stays.text).note;
  assert(/^Mouse 9 is in .+ already\.$/.test(note), `a note reads "mice": ${note}`);
  const unknownText = (unknownProfile.content as { text: string }[]).map((c) => c.text).join("");
  assert(unknownProfile.isError && /There is no profile/.test(unknownText) && !/stays on that CLI/.test(unknownText), `an unknown profile fails: ${unknownText}`);
  const profileHelp = ((miceTools.find((t) => t.name === "message_worker")?.inputSchema as { properties?: { profile?: { description?: string } } }).properties?.profile?.description) ?? "";
  assert(/copies the conversation/.test(profileHelp) && !/same CLI/.test(profileHelp), `message_worker tells that a profile can change the CLI: ${profileHelp}`);
  if (switched) {
    const why = (switched.content as { text: string }[]).map((c) => c.text).join("");
    assert(!!switched.isError && /not installed/.test(why), `a missing CLI does not start: ${why}`);
    const kept = JSON.parse(readFileSync(join(home, `.config/yonder-${PORT}`, "state.json"), "utf8")).workers.find((w: { id: string }) => w.id === "w9");
    assert(!kept.cli && kept.sessionId === SESSION && !kept.carry, `a failed change of CLI puts the session back: ${JSON.stringify(kept)}`);
  }

  const tree = join(home, "tree");
  for (const dir of ["b", "A", ".hidden", "node_modules"]) mkdirSync(join(tree, dir), { recursive: true });
  writeFileSync(join(tree, "file.txt"), "");
  const listing = await call("list_folders", { path: tree });
  assert(listing.folders.map((f: { name: string }) => f.name).join() === "A,b", "list_folders gives the folders only, in order, with no dot folders or node_modules");

  // An agent does not open a site, local or not: it names the URL in its final message.
  const shown = await call("preview", { action: "open", url: "localhost:5173/about" });
  assert(shown.opens === false && /final message/.test(shown.note), "preview of an agent does not open a local site");
  const ask = () => fetch(`http://127.0.0.1:${PORT}/show?after=0`).then((r) => r.json());
  assert((await ask()).length === 0, "/show gives no site of an agent");
  const address = await call("preview", { action: "open", url: "example.com" });
  assert(address.opens === false, "preview of an agent does not open the tunnel of an address");
  const old = await call("show_on_device", { url: "localhost:5173/about" });
  assert(old.opens === false, "show_on_device still works as the old name of preview open");

  // get_location: the phone takes the ask with its /show poll and answers with POST /location. location.log has no pin.
  const locate = (after = 0) =>
    fetch(`http://127.0.0.1:${PORT}/show?after=${after}&locate`, { headers: { "x-yonder-device": "pin" } }).then((r) => r.json());
  const answer = async (body: object) => {
    let asked: { id: number; locate?: boolean } | undefined;
    for (let i = 0; i < 50 && !asked; i++) (asked = (await locate()).find((s: { locate?: boolean }) => s.locate)) || (await Bun.sleep(50));
    await fetch(`http://127.0.0.1:${PORT}/location?id=${asked?.id}`, { method: "POST", headers: { "x-yonder-device": "pin" }, body: JSON.stringify(body) });
    return asked;
  };
  const nobody = await client.callTool({ name: "get_location", arguments: {} });
  assert(nobody.isError && /No phone has Yonder open/.test(JSON.stringify(nobody.content)), "get_location fails at once when no phone has Yonder open");
  await locate();
  const pinned = call("get_location");
  const asked = await answer({ latitude: 51.5007, longitude: -0.1246, accuracy_meters: 12, at: "2026-10-19T12:00:00.000Z" });
  const pin = await pinned;
  assert(asked && pin.latitude === 51.5007 && pin.accuracy_meters === 12 && pin.at && pin.map.includes("51.5007"), "get_location gives the pin of the phone");
  assert(!(await locate(asked!.id)).some((s: { locate?: boolean }) => s.locate), "/show drops the ask that the phone answered");
  const denied = client.callTool({ name: "get_location", arguments: {} });
  await answer({ error: "The user did not allow the location." });
  assert(/did not allow/.test(JSON.stringify((await denied).content)), "get_location gives the error of the phone");
  const log = readFileSync(join(home, `.config/yonder-${PORT}`, "phone.log"), "utf8");
  assert(log.includes("for location: given") && log.includes("failed") && !log.includes("51.5"), "phone.log has each ask with no pin");

  // send_file: a small file inline, and with no file an ask to a phone to open the attach sheet. One phone takes it, one
  // time, and the Mac never does.
  const sent = await call("send_file", { data: Buffer.from("hello").toString("base64"), name: "../notes.txt" });
  assert(sent.path?.endsWith("/notes.txt") && readFileSync(sent.path, "utf8") === "hello", "send_file keeps a file of data, with a safe name");
  const picking = await call("send_file", { worker: "9" });
  assert(picking.asked?.includes("agent 9"), "send_file with no file asks the phone");
  const phoneAsk = () => fetch(`http://127.0.0.1:${PORT}/show?after=0&canvas&abilities=location`, { headers: { "x-yonder-device": "pin" } }).then((r) => r.json());
  assert(!(await ask()).some((s: { attach?: string }) => s.attach !== undefined), "the Mac does not get the ask of send_file");
  assert((await phoneAsk()).some((s: { attach?: string }) => s.attach === "w9"), "a phone gets the ask for agent 9 from /show");
  assert(!(await phoneAsk()).some((s: { attach?: string }) => s.attach !== undefined), "the ask goes to a phone one time");
  // create_upload gives a command whose script names its link. With no relay, the link is on this computer.
  const upload = await call("create_upload", { message: "Look at it." });
  const script = /curl -fsS (\S+)\/send\.sh \| bash -s -- /.exec(upload.command)?.[1];
  assert(script && (await (await fetch(`${script}/send.sh`)).text()).includes(script), "create_upload gives a command, and the link serves its script");
  // /file joins the parts of one id, and the part with end gives the path.
  const part = (body: string, end = "") => fetch(`http://127.0.0.1:${PORT}/file?name=a.pdf&id=abcdefgh12${end}`, { method: "POST", body }).then((r) => r.json());
  assert((await part("12")).ok && readFileSync((await part("34", "&end")).path, "utf8") === "1234", "/file joins the parts of one id");
  // /local keeps a file that the user copied in Finder at its place. A video gets a folder with a link to it.
  const local = (path: string) => fetch(`http://127.0.0.1:${PORT}/local?path=${encodeURIComponent(path)}`, { method: "POST" });
  writeFileSync(join(home, "notes.txt"), "hi");
  assert((await (await local(join(home, "notes.txt"))).json()).name === "notes.txt", "/local gives the name of a plain file");
  assert((await local(join(home, "gone.txt"))).status === 400, "/local refuses a file that is not there");
  // A folder gives its path with `folder`, and the app types the path in the prompt box.
  const folder = await (await local(home)).json();
  assert(folder.folder === true && folder.path === home, "/local marks a folder");
  if (Bun.which("ffmpeg")) {
    const mov = join(home, "Screen Recording.mov");
    Bun.spawnSync(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10", "-t", "3", mov]);
    const clip = await (await local(mov)).json();
    assert(clip.seconds === 3 && clip.thumb && realpathSync(join(clip.path, "video.mov")) === mov && existsSync(join(clip.path, "timeline.md")), "/local makes the frames of a video and links to it");
    Bun.spawnSync(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240", "-frames:v", "1", join(home, "shot.png")]);
    assert((await (await local(join(home, "shot.png"))).json()).thumb?.startsWith("data:image/jpeg"), "/local gives a thumb of a picture");
  }

  // The abilities of the phone (docs/shell.md): a newer screen names them in its poll and answers at /answer.
  const abilities = (after = 0) =>
    fetch(`http://127.0.0.1:${PORT}/show?after=${after}&abilities=location,haptic`, { headers: { "x-yonder-device": "pin" } }).then((r) => r.json());
  await abilities();
  const tapped = call("phone", { ability: "haptic", args: { style: "success" } });
  let haptic: { id: number; ability?: string; args?: { style?: string } } | undefined;
  for (let i = 0; i < 50 && !haptic; i++) (haptic = (await abilities()).find((s: { ability?: string }) => s.ability === "haptic")) || (await Bun.sleep(50));
  assert(haptic?.args?.style === "success", "/show gives the ask of an ability with its args");
  await fetch(`http://127.0.0.1:${PORT}/answer?id=${haptic?.id}`, { method: "POST", headers: { "x-yonder-device": "pin" }, body: JSON.stringify({ ok: true }) });
  assert((await tapped).ok === true, "the phone tool gives the answer of the phone");
  const missing = await client.callTool({ name: "phone", arguments: { ability: "contact" } });
  assert(missing.isError && /cannot do \W*contact/.test(JSON.stringify(missing.content)), "the phone tool refuses an ability that the app of the phone does not have");

  // The merged tools: the old names are not in the list, and the release tools are gone.
  const names = (await client.listTools()).tools.map((t) => t.name);
  const gone = ["show_on_device", "complete_worker", "cli_status", "cli_login", "order_projects", "list_projects", "add_project", "create_project", "remove_project", "describe_project", "star_project", "set_project_profile", "project_overview", "ship_staging", "promote_production", "halt_release", "release_status"];
  assert(!names.includes("list_folders") && names.includes("rebuild_app") === names.includes("restart_bridge"), "the list hides list_folders, and rebuild_app and restart_bridge go together");
  assert(gone.every((n) => !names.includes(n)) && ["preview", "close_worker", "cli", "star_workspace", "add_workspace", "edit_workspace", "ask_user"].every((n) => names.includes(n)), "the merged tools replace the old ones in the list");
  const phoneTool = (await client.listTools()).tools.find((t) => t.name === "phone");
  assert(!/confirm:|sheet:|location:/.test(phoneTool?.description ?? ""), "the phone tool has no confirm, sheet or location");
  // ask_user of a voice agent: no agent number, and the phone answers in its native sheet.
  const sheets = (after = 0) =>
    fetch(`http://127.0.0.1:${PORT}/show?after=${after}&abilities=location,haptic,sheet`, { headers: { "x-yonder-device": "pin" } }).then((r) => r.json());
  await sheets();
  const voiceAsk = call("ask_user", { kind: "yes-no", title: "Deploy now?", text: "Agent 3 deploys the site." });
  let sheet: { id: number; ability?: string; args?: { title?: string; buttons?: { id: string }[]; expires?: number } } | undefined;
  for (let i = 0; i < 50 && !sheet; i++) (sheet = (await sheets()).find((x: { ability?: string }) => x.ability === "sheet")) || (await Bun.sleep(50));
  assert(sheet?.args?.title === "Deploy now?" && sheet.args.buttons?.[0]?.id === "yes" && (sheet.args.expires ?? 0) > Date.now(), "ask_user of a voice agent opens the native sheet of the phone");
  await fetch(`http://127.0.0.1:${PORT}/answer?id=${sheet?.id}`, { method: "POST", headers: { "x-yonder-device": "pin" }, body: JSON.stringify({ button: "yes" }) });
  assert((await voiceAsk).answer === "yes", "ask_user gives the yes of the sheet to the voice agent");
  // The workspace order through star_workspace, and its old names.
  const ordered = await call("star_workspace", { order: [] });
  assert(Array.isArray(ordered), "star_workspace with order gives the starred workspaces");
  assert(Array.isArray(await call("star_project", { order: [] })), "star_project still works as the old name of star_workspace");
  assert(Array.isArray(await call("order_projects", { projects: [] })), "order_projects still works as the old name of star_workspace with order");

  // The default profile of a project (set_project_profile). A new agent there starts on it, list_projects shows it,
  // "default" removes it, and list_workers names the profile of each agent. The stand-in signs no profile in, so the
  // start fails at the sign-in of the profile that it picked, and starts no agent.
  const start = (args: Record<string, unknown>) => call("start_worker", { name: "Profile check", task: "Say hi", model: "haiku", effort: "low", ...args }).then(() => "", (e) => (e as Error).message);
  await call("add_project", { path: LONG });
  assert((await call("list_projects", {})).some((p: { path: string }) => p.path === LONG), "add_project and list_projects still work as old names, and list_projects gives a bare list");
  const set = await call("set_project_profile", { project: LONG, profile: "second" });
  const longProject = (await call("list_projects", { query: "long" })).find((p: { path: string }) => p.path === LONG);
  assert(set.profile === "Second" && longProject?.profile === "Second", `set_project_profile sets a profile by its name, and list_projects shows it: ${JSON.stringify(longProject)}`);
  assert(/The profile Second is not signed in/.test(await start({ project: LONG })), "a new agent in the project starts on the profile of the project");
  assert(/The profile Second is not signed in/.test(await start({ workspace: LONG })), "start_worker takes the workspace as `workspace` too");
  const viaNew = (await call("list_workspaces", { query: "long" })) as { path: string; profile?: string; id?: string }[];
  assert(viaNew.find((p) => p.path === LONG)?.profile === "Second" && viaNew.every((p) => p.id), `list_workspaces gives the id and the profile: ${JSON.stringify(viaNew)}`);
  const unknownProject = await client.callTool({ name: "set_project_profile", arguments: { project: LONG, profile: "no such profile" } });
  assert(unknownProject.isError && /There is no profile/.test(JSON.stringify(unknownProject.content)), "set_project_profile refuses a profile that does not exist");
  const back = await call("set_project_profile", { project: LONG, profile: "default" });
  const after = (await call("list_projects", { query: "long" })).find((p: { path: string }) => p.path === LONG);
  assert(/the default of the Settings/.test(back.profile) && !after?.profile, "default removes the profile of the project");
  assert(!/Second/.test(await start({ project: LONG })), "a project with no profile starts on the default profile of the Settings");
  await call("remove_project", { project: LONG });
  const closedList = (await call("list_workers", { tab: "closed", limit: 50 })).list as { id: string; profile: string }[];
  assert(closedList.find((w) => w.id === "w6")?.profile === "Antigravity Work" && closedList.every((w) => w.profile), `list_workers names the profile of each agent: ${JSON.stringify(closedList)}`);
  const startHelp = ((await client.listTools()).tools.find((t) => t.name === "start_worker")?.inputSchema as { properties?: { cli?: { description?: string } } }).properties?.cli?.description ?? "";
  assert(/the profile of the workspace/.test(startHelp) && /wins over both/.test(startHelp), `start_worker tells the order of the profiles: ${startHelp}`);

  // other_computer with two phones: a call goes only to the phone that knows the computer.
  const poll = (device: string, body: object) =>
    fetch(`http://127.0.0.1:${PORT}/elsewhere`, { method: "POST", headers: { "x-yonder-device": device }, body: JSON.stringify(body) }).then((r) => r.json());
  await poll("a", { computers: [] });
  await poll("b", { computers: ["Razer1"] });
  assert((await call("other_computer")).computers.join() === "Razer1", "other_computer lists the computers of each phone");
  const far = call("other_computer", { computer: "razer1" });
  await Bun.sleep(100);
  const [toA, toB] = [await poll("a", { computers: [] }), await poll("b", { computers: ["Razer1"] })];
  assert(toA.calls.length === 0 && toB.calls[0]?.computer === "razer1", "other_computer gives a call only to the phone that knows the computer");
  await poll("b", { computers: ["Razer1"], results: [{ id: toB.calls[0].id, text: "[]" }] });
  assert((await far).length === 0, "other_computer gives the answer of that phone");
  const renamed = call("other_computer", { computer: "razer1", tool: "rename_worker", arguments: { worker: "3", name: "New" } });
  await Bun.sleep(100);
  const toRazer = await poll("b", { computers: ["Razer1"] });
  assert(toRazer.calls[0]?.tool === "rename_worker" && toRazer.calls[0].arguments.worker === "3", "other_computer runs any tool of Yonder there, with its arguments");
  await poll("b", { computers: ["Razer1"], results: [{ id: toRazer.calls[0].id, text: "{}" }] });
  await renamed;
  assert(/on this computer/.test(await call("other_computer", { computer: "razer1", tool: "other_computer" }).then(() => "", (e) => (e as Error).message)), "other_computer does not call other_computer there");

  // A reminder: add, list and remove. It starts no worker.
  const reminder = await call("remind", { action: "save", text: "Set the HDR picture", minutes: 1440 });
  const noTime = await client.callTool({ name: "remind", arguments: { action: "save", text: "x", at: "25:00" } });
  assert(reminder.id && reminder.text === "Set the HDR picture" && noTime.isError, "remind saves a reminder, and refuses a time that is not valid");
  assert((await call("remind", { action: "list" })).reminders.some((r: { id: string }) => r.id === reminder.id), "remind lists the reminder");
  await call("remind", { action: "remove", id: reminder.id });
  assert(!(await call("remind", { action: "list" })).reminders.length, "remind removes the reminder");
  // A push now: the test bridge has no paired phone, so no phone gets it.
  const pinged = await call("notify", { text: "The deploy is live" });
  const empty = await client.callTool({ name: "notify", arguments: { text: "" } });
  assert(pinged.sent === 0 && pinged.note && empty.isError, "notify sends a push, and refuses an empty text");

  // A schedule: add, change, list and remove. It does not run, so it starts no worker.
  const added = await call("schedule", { action: "save", name: "Daily video", project: home, task: "/daily-video", at: "9:05", weekdays: true });
  assert(added.when === "Weekdays at 9:05 AM" && added.next > Date.now() && [1, 2, 3, 4, 5].includes(new Date(added.next).getDay()), "schedule adds a schedule on weekdays at 9:05");
  const paused = await call("schedule", { action: "save", id: "daily video", paused: true, every: 24 });
  assert(paused.id === added.id && paused.paused && paused.when === "Every 24 hours" && paused.cron === undefined, "schedule changes a schedule found by its name");
  assert(added.retries === 2 && (await call("schedule", { action: "save", id: added.id, retries: 0 })).retries === 0, "a schedule has 2 retries by default, and a save changes them");
  const bad = await client.callTool({ name: "schedule", arguments: { action: "save", id: added.id, cron: "0 0 30 2 *" } });
  assert(bad.isError, "schedule refuses a cron line that never runs");
  const runs = (await call("schedule", { action: "list" })).schedules;
  assert(runs.length === 2, "schedule lists the schedules");
  const s5 = runs.find((x: { id: string }) => x.id === "s5");
  assert(s5.ok.length === 1 && s5.ok[0].result === "Posted.", "a schedule lists its runs that ended well, from the log");
  await call("schedule", { action: "remove", id: added.id });
  assert((await call("schedule", { action: "list" })).schedules.length === 1, "schedule removes a schedule");

  // A profile on a schedule. The run uses that profile. A removed profile does not start, and it does not fall back.
  const made = (await fetch(`http://127.0.0.1:${PORT}/profiles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: { name: "Work", cli: "claude" } }) }).then((r) => r.json())) as { id?: string; error?: string };
  assert(made.id, `a profile is added (${made.error ?? ""})`);
  const bound = await call("schedule", { action: "save", name: "Work run", project: home, task: "Say hi", every: 24, profile: "Work" });
  assert(bound.profile === made.id && bound.profileName === "Work" && !bound.profileMissing, "a schedule stores a profile by its name");
  const byCli = await call("schedule", { action: "save", name: "Also work", project: home, task: "Say hi", every: 24, cli: "Work" });
  assert(byCli.profile === made.id, "a profile name in cli binds that profile");
  let unknown = "";
  try {
    await call("schedule", { action: "save", id: bound.id, profile: "no such profile" });
  } catch (e) {
    unknown = (e as Error).message;
  }
  assert(/no profile/.test(unknown), "schedule refuses a profile that does not exist");
  const cleared = await call("schedule", { action: "save", id: bound.id, profile: "default" });
  assert(!cleared.profile && !cleared.profileName, "default clears the profile of a schedule");
  await call("schedule", { action: "save", id: bound.id, profile: made.id });
  // A trigger: a schedule that a web request to /hook/<hook> starts, with no timing.
  const trigger = await call("schedule", { action: "save", name: "Fix errors", project: home, task: "Fix the error", event: "a test request", webhook: true, profile: made.id });
  assert(/^[0-9a-f]{32}$/.test(trigger.hook) && trigger.when === "Webhook" && trigger.event === "a test request" && trigger.next === 0 && !trigger.nextAt && !trigger.hookUrl, "a trigger has a secret hook, no next start, and no public address with no relay");
  // A script trigger. It is off until the profile is gone, so the run of each minute cannot start a real agent.
  const lines = await call("schedule", { action: "save", name: "Watch lines", project: home, task: "Do it", event: "a new line in lines.txt", script: "cat lines.txt", profile: made.id, paused: true });
  assert(lines.when === "Script" && lines.script === "cat lines.txt" && lines.next === 0 && lines.mode === "auto" && trigger.mode === "auto", "a script trigger has no next start, and each trigger runs in Auto mode");
  // A trigger with only its event: Claude Code sets it up later (design).
  const pending = await call("schedule", { action: "save", name: "Sort downloads", project: home, task: "Sort it", event: "a new file in Downloads", profile: made.id });
  assert(pending.when === "Not set up" && pending.event === "a new file in Downloads" && pending.next === 0, "a trigger with only its event is not set up");
  const both = await client.callTool({ name: "schedule", arguments: { action: "save", id: pending.id, every: 24, event: "x" } });
  assert(both.isError, "a save gives a timing or an event, not both");
  // An agent can write a trigger, but the trigger stays off until the user turns it on.
  const byAgent = await nine.callTool({ name: "schedule", arguments: { action: "save", id: trigger.id, task: "Fix the error now" } });
  const onByAgent = await nine.callTool({ name: "schedule", arguments: { action: "save", id: trigger.id, paused: false } });
  const agentSaved = (await call("schedule", { action: "list" })).schedules.find((s: { id: string }) => s.id === trigger.id);
  assert(!byAgent.isError && agentSaved.paused && agentSaved.task === "Fix the error now" && onByAgent.isError, "a trigger that an agent saves stays off, and an agent cannot turn it on");
  const afterRemove = (await fetch(`http://127.0.0.1:${PORT}/profiles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ remove: made.id }) }).then((r) => r.json())) as { clis: { id: string }[] };
  assert(!afterRemove.clis.some((c) => c.id === made.id), "the profile is removed");
  const left = (await call("schedule", { action: "list" })).schedules.find((s: { id: string }) => s.id === bound.id);
  assert(left.profileMissing && /removed/.test(left.missed?.why ?? ""), "a removed profile stays on the schedule, and the page can say so");

  // The trigger lost its profile too, so a request goes as far as the start of the agent, and starts no worker. The text
  // of runSchedule names the page, and the text of the removal does not.
  const hook = (key: string, init?: RequestInit) => fetch(`http://127.0.0.1:${PORT}/hook/${key}`, init);
  // The reason of the last start that did not happen at `at` or later, or "" after 2 seconds.
  const missedAfter = async (id: string, at: number) => {
    for (let i = 0; i < 20; i++, await Bun.sleep(100)) {
      const m = (await call("schedule", { action: "list" })).schedules.find((s: { id: string }) => s.id === id).missed;
      if (m?.at >= at) return m.why as string;
    }
    return "";
  };
  assert((await hook("0".repeat(32), { method: "POST" })).status === 404 && (await hook("")).status === 404 && (await hook(trigger.hook)).status === 405, "a wrong hook is a 404, and a GET starts nothing");
  await call("schedule", { action: "save", id: trigger.id, paused: true });
  assert((await hook(trigger.hook, { method: "POST", body: "{}" })).status === 200, "a trigger that is off starts nothing");
  await call("schedule", { action: "save", id: trigger.id, paused: false });
  const firedAt = Date.now();
  const fired = await hook(trigger.hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "triggered", data: { event: { title: "TypeError" } } }) });
  assert(fired.status === 202 && /Settings, Triggers, Fix errors/.test(await missedAfter(trigger.id, firedAt)), "a POST to the hook answers at once and goes to the start, which refuses the removed profile");
  // A signing secret: only a request with the signature of its service goes to the start. The secret never comes back.
  const withSecret = await call("schedule", { action: "save", id: trigger.id, secret: "s3cret" });
  assert(withSecret.signed && !("secret" in withSecret), "a trigger keeps its signing secret, and says only that it has one");
  const body = JSON.stringify({ action: "created" });
  const github = (secret: string) => ({ "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` });
  assert((await hook(trigger.hook, { method: "POST", body })).status === 401 && (await hook(trigger.hook, { method: "POST", body, headers: github("wrong") })).status === 401, "a request with no signature, or a wrong one, gets 401");
  const signedAt = Date.now();
  const signedPost = await hook(trigger.hook, { method: "POST", body, headers: github("s3cret") });
  assert(signedPost.status === 202 && /Settings, Triggers, Fix errors/.test(await missedAfter(trigger.id, signedAt)), "a request with the right signature goes to the start");
  const bypass = await client.callTool({ name: "schedule", arguments: { action: "save", id: trigger.id, mode: "bypassPermissions" } });
  assert(bypass.isError, "a trigger refuses the Bypass mode");
  const timed = await call("schedule", { action: "save", id: trigger.id, every: 24 });
  assert(!timed.hook && !timed.signed && timed.when === "Every 24 hours" && timed.next > Date.now() && (await hook(trigger.hook, { method: "POST" })).status === 404, "a timing in place of the webhook ends the address and the secret");
  await call("schedule", { action: "remove", id: trigger.id });

  // The script trigger: its first run notes the lines, and a new line goes to the start, which refuses the removed
  // profile, so the line waits for the next run.
  writeFileSync(join(home, "lines.txt"), "a\nb\n");
  await call("schedule", { action: "save", id: lines.id, paused: false });
  const noted = await call("schedule", { action: "run", id: lines.id });
  assert(/No new line/.test(noted.note), "the first run of a script notes its lines and starts no agent");
  writeFileSync(join(home, "lines.txt"), "a\nb\nc\n");
  const runLines = () => call("schedule", { action: "run", id: lines.id }).then(() => "", (e) => (e as Error).message);
  assert(/Settings, Triggers, Watch lines/.test(await runLines()) && /Settings, Triggers, Watch lines/.test(await runLines()), "a new line goes to the start, and waits for the next run when its agent did not start");
  await call("schedule", { action: "save", id: lines.id, script: "echo boom >&2; exit 3" });
  assert(/ended with 3: boom/.test(await runLines()), "a script that fails says why");
  await call("schedule", { action: "remove", id: lines.id });

  // A trigger that is not set up does not run, and design goes as far as the start of the setup agent, which refuses the
  // removed profile, so it starts no agent.
  const failure = (args: Record<string, unknown>) => call("schedule", args).then(() => "", (e) => (e as Error).message);
  assert(/not set up/.test(await failure({ action: "run", id: pending.id })) && /no profile/.test(await failure({ action: "design", id: pending.id })), "a trigger that is not set up does not run, and design starts the setup agent with the profile of the trigger");
  await call("schedule", { action: "remove", id: pending.id });
  let noStart = "";
  try {
    await call("schedule", { action: "run", id: bound.id });
  } catch (e) {
    noStart = (e as Error).message;
  }
  assert(/removed/.test(noStart), "a schedule does not start when its profile was removed");
  await call("schedule", { action: "remove", id: bound.id });
  await call("schedule", { action: "remove", id: byCli.id });

  // The screen of the phones (bridge/ui.ts): a sample, a fork into a screen of the user's own, and the default again.
  const phoneJson = () => JSON.parse(readFileSync(join(home, ".config", `yonder-${PORT}`, "phone.json"), "utf8"));
  assert((await call("customize", { action: "list" })).samples.length === Object.keys(SAMPLES).length, "customize lists each sample");
  await call("customize", { action: "use", screen: "terminal" });
  assert(phoneJson().ui === "terminal" && phoneJson().theme === undefined, "customize uses a sample, and the theme of the app stays (each theme has a light and a dark look)");
  const forked = await call("customize", { action: "fork" });
  assert(forked.name === "my-terminal" && phoneJson().ui === "my-terminal@1", "customize forks the screen in use into a screen of the user, with its version");
  assert((await fetch(`http://127.0.0.1:${PORT}/ui?name=my-terminal`).then((r) => r.json())).name === "My Terminal", "/ui gives a screen of the user");
  // The skill for the agents that build a screen (bridge/skill.ts): in ~/.claude/skills/, at /ui?guide, and named by
  // the note of each screen folder.
  assert(readFileSync(join(home, ".claude/skills/yonder-screens/SKILL.md"), "utf8").startsWith("---\nname: yonder-screens"), "the bridge installs the skill yonder-screens");
  assert((await fetch(`http://127.0.0.1:${PORT}/ui?guide`).then((r) => r.text())).includes("# The API of a page"), "/ui?guide gives the whole skill");
  assert(readFileSync(join(home, ".config", `yonder-${PORT}`, "ui/my-terminal/CLAUDE.md"), "utf8").includes("yonder-screens"), "the note of a screen folder names the skill");
  const checked = await fetch(`http://127.0.0.1:${PORT}/ui`, { method: "POST", body: JSON.stringify({ action: "check", name: "my-terminal" }) }).then((r) => r.json());
  assert(checked.ok === true, "/ui checks a screen with no new version");
  // The Settings from the schema (bridge/settings/): a value of config.json goes only with the type of its setting.
  const setting = (key: string, value: unknown) =>
    fetch(`http://127.0.0.1:${PORT}/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value }) });
  const settings = await fetch(`http://127.0.0.1:${PORT}/settings`).then((r) => r.json());
  const was = settings.values.steer;
  assert(settings.schema.some((s: { key: string }) => s.key === "steer") && typeof was === "boolean", "/settings gives the schema and the values");
  assert((await setting("steer", !was).then((r) => r.json())).values.steer === !was, "/settings writes a value of config.json");
  assert((await setting("steer", "yes")).status === 400 && (await setting("models", ["fable", "haiku"])).status === 400, "/settings refuses a value of the wrong type or out of order");
  assert((await setting("usageBar", false)).status === 400, "/settings does not write a setting of the phone");
  await setting("steer", was);
  // A setting of Claude Code (store "claude") goes into settings.json of its config folder, and off deletes the key.
  const claudeSettings = () => JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
  assert((await setting("advisorModel", true).then((r) => r.json())).values.advisorModel === true && claudeSettings().advisorModel === "fable", "/settings turns on the advisor of Claude Code");
  assert((await setting("advisorModel", false).then((r) => r.json())).values.advisorModel === false && !("advisorModel" in claudeSettings()), "/settings turns off the advisor of Claude Code");
  await call("customize", { action: "reset" });
  assert(phoneJson().ui === undefined, "customize goes back to the default screen");

  // 1Password for the agents (bridge/vault.ts). An agent gets the tools, the voice does not, and only a phone can give
  // the token or a yes. The fake items keep the check away from 1Password.
  assert(["use_secret", "list_secrets"].every((t) => tools.includes(t)), "an agent gets use_secret and list_secrets");
  const voice = new Client({ name: "yonder-start-check-voice", version: "0.1.0" });
  await voice.connect(new StreamableHTTPClientTransport(new URL(MCP), { requestInit: { headers: { origin: "http://localhost:1420" } } }));
  assert(!(await voice.listTools()).tools.some((t) => t.name === "use_secret"), "the voice does not get use_secret");
  await voice.close();
  assert((await call("list_secrets")).connected === false, "list_secrets says that 1Password is not connected");
  const vaultPost = (path: string, body: object) =>
    fetch(`http://127.0.0.1:${PORT}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-yonder-device": "anything" }, body: JSON.stringify(body) });
  assert((await vaultPost("/vault", { token: "ops_FAKE" })).status === 403, "a program on the Mac cannot give a token, also with a device header");
  assert(!(await (await vaultPost("/vault/approve", { id: "x", key: "AAAA" })).json()).ok, "a program on the Mac cannot approve");
  // YONDER_OWNER_CHECK=no stands for a Touch ID that says no. Linux has no prompt, so the check bridge there answers that it has no relay.
  const pairCode = await fetch(`http://127.0.0.1:${PORT}/relay`, { method: "POST" });
  assert(pairCode.status === (process.platform === "darwin" ? 403 : 404), `a new pairing code needs Touch ID on a Mac (${pairCode.status})`);
  const refused = await client.callTool({ name: "use_secret", arguments: { why: "test", run: "true", env: { T: "op://Agent/GitHub/token" } } });
  assert(refused.isError, "use_secret works only for an agent that Yonder started");
  // An agent calls with the ID it had before its session started, as the --mcp-config of each new session has it.
  const born = new Client({ name: "yonder-start-check-born", version: "0.1.0" });
  await born.connect(new StreamableHTTPClientTransport(new URL(`${MCP}?worker=new17000000000001`)));
  const known = await born.callTool({ name: "use_secret", arguments: { why: "test", run: "true", env: { T: "nope" } } });
  const knownText = (known.content as { text: string }[])[0].text;
  assert(known.isError && knownText.includes("is not a 1Password reference"), "use_secret finds an agent by its ID before the session started");
  await born.close();
  await client.close();
} finally {
  bridge.kill();
  await bridge.exited;
  rmSync(home, { recursive: true, force: true });
}
