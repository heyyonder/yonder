// Check two people on one bridge (docs/multi-user.md): `bun bridge/people-e2e.ts`. It runs bridge/main.ts on a free port
// with an empty home folder, as bridge/start-check.ts does, so it does not touch the live bridge, and it starts no workers.
// A request with `x-yonder-device` stands in for a phone of a person.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}

const free = Bun.serve({ port: 0, fetch: () => new Response() });
const PORT = free.port;
free.stop();
const BASE = `http://127.0.0.1:${PORT}`;
const home = realpathSync(mkdtempSync(join(tmpdir(), "yonder-people-")));
const CONFIG = join(home, `.config/yonder-${PORT}`);
mkdirSync(CONFIG, { recursive: true });
// A stand-in for Claude Code, as in start-check: no sessions.
mkdirSync(join(home, ".local/bin"), { recursive: true });
// It keeps the arguments of each start, so the check reads the prompt, and it lists the started session as done.
writeFileSync(
  join(home, ".local/bin/claude"),
  `#!/bin/sh
a="${home}/agent.json"
if [ "$1" = agents ]; then printf '['; [ -f "$a" ] && cat "$a"; echo ']'; exit 0; fi
# Only a start (--bg) makes a session. The bridge also runs other calls, such as a check of the version.
case " $* " in *" --bg "*) ;; *) exit 0 ;; esac
printf '%s\\n' "$@" >> "${home}/claude-args.txt"
printf '{"id":"abcd1234","sessionId":"abcd1234-0000-4000-8000-000000000000","cwd":"${home}/work","kind":"background","pid":1,"status":"idle","state":"done","startedAt":1}' > "$a"
echo "backgrounded · abcd1234"
`,
  { mode: 0o755 },
);
const WORK = join(home, "work");
mkdirSync(WORK);
const PIERRE = { id: "pierre", name: "Pierre", main: true, devices: [{ id: "PPPP1111PPPP1111" }] };
const MARCO = { id: "marco", name: "Marco", profile: "Marco CC", workspace: "no-such-workspace", devices: [{ id: "MMMM2222MMMM2222" }] };
const config = (extra: Record<string, unknown>) => {
  const file = join(CONFIG, "config.json");
  const now = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...now, ...extra }));
};
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ sumUp: false, textUp: false, people: [PIERRE, MARCO], profiles: [{ id: "pm", name: "Marco CC", cli: "claude" }] }));
const task = (id: string, num: number, owner?: string) => ({ id, num, sessionId: `00000000-0000-4000-8000-00000000000${num}`, name: id, project: "work", path: WORK, task: id, status: "done", activity: "", result: "", unread: false, startedAt: 1, updatedAt: 1, ...(owner && { owner }) });
writeFileSync(join(CONFIG, "state.json"), JSON.stringify({ workers: [task("old1", 1), task("pier2", 2, "pierre"), task("marc3", 3, "marco")] }));

const { CLAUDE_CONFIG_DIR: _, ...parent } = process.env;
const bridge = Bun.spawn(["bun", join(import.meta.dir, "main.ts")], { env: { ...parent, HOME: home, YONDER_PORT: String(PORT), YONDER_OWNER_CHECK: "no", PATH: `${join(home, ".local/bin")}:${parent.PATH}` }, stdout: "ignore", stderr: "pipe" });

// One MCP client for each device: a phone of Pierre, a phone of Marco, and no device (a program on the computer).
const clients = new Map<string, Client>();
async function call(device: string, name: string, args: Record<string, unknown> = {}) {
  let client = clients.get(device);
  if (!client) {
    client = new Client({ name: "people-check", version: "0.1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: device ? { "x-yonder-device": device } : {} } }));
    clients.set(device, client);
  }
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[]).map((c) => c.text).join("");
  if (res.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
}
const ids = async (device: string, args: Record<string, unknown> = {}) =>
  ((await call(device, "list_workers", { full: true, ...args })) as { id: string }[]).map((w) => w.id).sort().join();
const people = (device: string) => fetch(`${BASE}/people`, { headers: device ? { "x-yonder-device": device } : {} }).then((r) => r.json());
const P = "PPPP1111PPPP1111";
const M = "MMMM2222MMMM2222";

try {
  let up = false;
  for (let i = 0; i < 150 && !up && bridge.exitCode === null; i++) {
    up = await fetch(`${BASE}/mcp`).then(() => true, () => false);
    if (!up) await Bun.sleep(100);
  }
  assert(up, `the bridge starts on port ${PORT}`);

  const pm = await people(M);
  assert(pm.me === "marco" && pm.people.map((p: { id: string }) => p.id).join() === "pierre,marco" && pm.people[0].main, "/people names the people and the person of the phone");
  assert((await people("")).me === "pierre", "a program on the computer is the main person");
  assert((await ids(M)) === "marc3", "Marco lists only his tasks");
  { const got = await ids(P); assert(got === "old1,pier2", `Pierre lists his tasks and the tasks with no owner (got ${got})`); }
  assert((await ids(M, { scope: "all" })) === "marc3,old1,pier2", "scope all lists the tasks of each person");
  const short = await call(M, "list_workers", { scope: "all" });
  assert(short.list.find((w: { id: string }) => w.id === "marc3")?.owner === "Marco" && short.counts.completed === 3, "the short list names the owner of each task in scope all");

  // A schedule and a reminder keep the person who saved them.
  await call(M, "schedule", { action: "save", name: "Daily", project: WORK, task: "check", every: 24 });
  await call(M, "remind", { action: "save", text: "call the bank", minutes: 600 });
  await Bun.sleep(300);
  const state = JSON.parse(readFileSync(join(CONFIG, "state.json"), "utf8"));
  assert(state.schedules.find((s: { name: string }) => s.name === "Daily")?.owner === "marco", "a schedule keeps the person who saved it");
  assert(state.reminders.find((r: { text: string }) => r.text === "call the bank")?.owner === "marco", "a reminder keeps the person who set it");

  // A start of Marco: the task gets his owner and his default profile, and the prompt tells the agent who speaks. The
  // stand-in fails the start, so no agent runs.
  await call(M, "start_worker", { project: WORK, task: "fix the build", name: "Fix build", model: "sonnet", effort: "low" }).catch(() => {});
  let args = "";
  for (let i = 0; i < 100 && !args.includes("fix the build"); i++) await Bun.sleep(100), (args = (() => { try { return readFileSync(join(home, "claude-args.txt"), "utf8"); } catch { return ""; } })());
  assert(args.includes("fix the build") && args.includes("<from>Marco</from>"), "the prompt of a start of Marco ends with <from>Marco</from>");
  const started = JSON.parse(readFileSync(join(CONFIG, "state.json"), "utf8")).workers.find((w: { task: string }) => w.task === "fix the build");
  assert(started?.owner === "marco" && started.profile === "pm", "a start of Marco has his owner and his default profile");

  // A message of Pierre to the task of Marco tells the agent that Pierre speaks. The owner stays Marco.
  await call(P, "message_worker", { worker: started.id, message: "also update the docs" }).catch(() => {});
  let resumed = "";
  for (let i = 0; i < 100 && !resumed.includes("also update the docs"); i++) await Bun.sleep(100), (resumed = readFileSync(join(home, "claude-args.txt"), "utf8"));
  assert(resumed.slice(resumed.indexOf("also update the docs")).includes("<from>Pierre</from>"), "a message of Pierre ends with <from>Pierre</from>");
  const after = JSON.parse(readFileSync(join(CONFIG, "state.json"), "utf8")).workers.find((w: { id: string }) => w.id === started.id);
  assert(after?.owner === "marco", "a message of another person keeps the owner");

  // A default workspace that does not resolve is left out: a start with no project still starts.
  let failed = "";
  await call(M, "start_worker", { project: "", task: "no project here", name: "Free", model: "sonnet", effort: "low" }).catch((e) => (failed = (e as Error).message));
  assert(!/no-such-workspace/.test(failed), `a bad default workspace does not stop a start${failed ? ` (${failed})` : ""}`);

  // The lists before the edits of the file, which the checks below compare with.
  const marcos = await ids(M);
  const everyone = await ids(M, { scope: "all" });
  assert(marcos.split(",").includes(started.id) && !marcos.includes("pier2") && everyone.includes("pier2"), "the new tasks of Marco are in his list only");

  // "Close all on Done" of Marco closes only his tasks.
  await call(M, "close_worker", { tab: "completed" });
  const closed = JSON.parse(readFileSync(join(CONFIG, "state.json"), "utf8")).workers as { id: string; status: string }[];
  assert(closed.find((w) => w.id === "marc3")?.status === "closed" && closed.find((w) => w.id === "pier2")?.status === "done" && closed.find((w) => w.id === "old1")?.status === "done", "a group close of Marco leaves the tasks of Pierre open");

  // An agent moves the phone of Marco to Pierre with an edit of the file: it applies at the next request.
  config({ people: [{ ...PIERRE, devices: [...PIERRE.devices, ...MARCO.devices] }, { ...MARCO, devices: [] }] });
  await Bun.sleep(50);
  assert((await people(M)).me === "pierre" && (await ids(M)) === "old1,pier2", "an edit of the file moves a phone at once, with no restart");
  config({ people: [PIERRE, { ...MARCO, name: "Marc" }] });
  await Bun.sleep(50);
  assert((await people(M)).people[1].name === "Marc" && (await ids(M)) === marcos, "a rename keeps the tasks of the person");

  // A list that is not valid keeps the last good list.
  config({ people: [PIERRE, { ...MARCO, devices: PIERRE.devices }] });
  await Bun.sleep(50);
  assert((await people(M)).me === "marco" && (await ids(M)) === marcos, "a list that is not valid keeps the last good list");
  assert(Array.isArray(JSON.parse(readFileSync(join(CONFIG, "config.json"), "utf8")).people), "the bridge does not write over a list that is not valid");

  // One person, or none: Yonder works as for one person.
  config({ people: [PIERRE] });
  await Bun.sleep(50);
  assert((await people(M)).people.length === 0 && (await ids(M)) === everyone, "one person: no switch and no filter");
  const file = JSON.parse(readFileSync(join(CONFIG, "config.json"), "utf8"));
  delete file.people;
  writeFileSync(join(CONFIG, "config.json"), JSON.stringify(file));
  await Bun.sleep(50);
  assert((await people(M)).people.length === 0 && (await ids(M)) === everyone, "no people key: no switch and no filter");
  assert(!("people" in JSON.parse(readFileSync(join(CONFIG, "config.json"), "utf8"))), "the bridge writes no people key for one person");
  await call(M, "start_worker", { project: WORK, task: "one person task", name: "One", model: "sonnet", effort: "low" }).catch(() => {});
  let solo = "";
  for (let i = 0; i < 100 && !solo.includes("one person task"); i++) await Bun.sleep(100), (solo = readFileSync(join(home, "claude-args.txt"), "utf8"));
  assert(solo.includes("one person task") && !solo.slice(solo.indexOf("one person task")).includes("<from>"), "one person: the prompt has no <from> tag");
} finally {
  for (const c of clients.values()) await c.close().catch(() => {});
  bridge.kill();
  await bridge.exited;
  if (bridge.exitCode && bridge.exitCode !== 143 && bridge.signalCode !== "SIGTERM") console.error(await new Response(bridge.stderr).text());
  rmSync(home, { recursive: true, force: true });
}
console.log("people-e2e: all checks pass");
