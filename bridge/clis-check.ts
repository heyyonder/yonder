// Check the agents in other CLIs (clis.ts): `bun run check-clis`. It uses no network and no credits.
// Part one sends the recorded stream of each CLI in bridge/fixtures/ through its parser, and a log of the ACP host
// through the parser of the ACP CLIs.
// Part two starts a bridge on a free port with an empty home folder and a fake Codex (fixtures/fake-cli.ts) and a fake
// ACP adapter (fixtures/fake-acp.ts) first on its PATH, and runs one agent in the ACP host through a start, a second
// message, a stop, a restart of the bridge, a restart of the host and a removal.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIS, sessionOf, steps } from "./clis";
import { install } from "./registry";

function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}
const FIXTURES = join(import.meta.dir, "fixtures");

// Part one. Each recorded turn gives its session ID, its tool calls once each, its last text, and its end. Each recorded
// failure gives an error and no end.
const EXPECT: Record<string, { session: string; tools: number; text: RegExp }> = {
  antigravity: { session: "THREAD", tools: 3, text: /All 12 tests pass/ },
  cursor: { session: "THREAD", tools: 3, text: /test passes now/ },
  grok: { session: "THREAD", tools: 3, text: /tests pass now/ },
  copilot: { session: "THREAD", tools: 2, text: /tests pass now/ },
};
for (const [id, expect] of Object.entries(EXPECT)) {
  const cli = CLIS[id];
  const list = await steps(cli, join(FIXTURES, `${id}.jsonl`));
  assert((await sessionOf(cli, join(FIXTURES, `${id}.jsonl`))) === expect.session, `${id}: the session ID`);
  assert(list.filter((s) => s.tool).length === expect.tools, `${id}: ${expect.tools} tool calls, each once`);
  assert(expect.text.test(list.filter((s) => s.text).pop()?.text ?? ""), `${id}: the last text is the answer`);
  assert(list.some((s) => s.done) && !list.some((s) => s.error), `${id}: the turn ends with no error`);
  const failed = join(FIXTURES, `${id}-failed.jsonl`);
  if (existsSync(failed)) {
    const bad = await steps(cli, failed);
    assert(bad.some((s) => s.error) && !bad.some((s) => s.done), `${id}: a failed turn gives its error`);
  }
}

// The log of a turn in the ACP host: one line for each step, the same for each ACP CLI.
const acpLog = await steps(CLIS.codex, join(FIXTURES, "acp.jsonl"));
const said = acpLog.filter((s) => s.tool).map((s) => `${s.tool!.name} ${Object.values(s.tool!.input ?? {}).filter(Boolean).join(" ")}`);
assert((await sessionOf(CLIS.codex, join(FIXTURES, "acp.jsonl"))) === "THREAD", "acp: the session ID");
assert(
  said.join("|") === "Bash sed -i '' 's/Readme/README/' README.md|Edit /p/README.md|Tool yonder.list_workers|Allowed curl example.com",
  `acp: the tool calls by kind, and the permission (${said.join("|")})`,
);
assert(acpLog.filter((s) => s.text).pop()?.text === "The README title is fixed." && acpLog.some((s) => s.done) && acpLog.some((s) => s.model === "gpt-5.5"), "acp: the answer, the model and the end");
const acpBad = await steps(CLIS.opencode, join(FIXTURES, "acp-failed.jsonl"));
assert(acpBad.some((s) => s.error) && !acpBad.some((s) => s.done), "acp: a failed turn gives its error");

// An agent of the ACP registry: the bridge downloads its archive, checks the sha256 and unpacks it, and a wrong sha256
// stops it. An npx agent runs its package through npx.
{
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "yonder-registry-")));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "agent"), "#!/bin/sh\necho fake-agent\n", { mode: 0o755 });
  Bun.spawnSync(["tar", "-czf", join(dir, "agent.tar.gz"), "-C", join(dir, "src"), "agent"]);
  const data = readFileSync(join(dir, "agent.tar.gz"));
  const server = Bun.serve({ port: 0, fetch: () => new Response(data) });
  const platform = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch === "arm64" ? "aarch64" : "x86_64"}`;
  const entry = (sha256: string) => ({
    id: "fake",
    name: "Fake",
    version: "1.0.0",
    description: "",
    distribution: { binary: { [platform]: { archive: `http://127.0.0.1:${server.port}/agent.tar.gz`, cmd: "./agent", args: ["acp"], sha256 } } },
  });
  try {
    const a = await install(entry(createHash("sha256").update(data).digest("hex")), dir);
    assert(a.command.at(-1) === "acp" && Bun.spawnSync([a.command[0]]).stdout.toString().trim() === "fake-agent", "registry: a download unpacks and runs");
    rmSync(join(dir, "agents"), { recursive: true });
    const bad = await install(entry("0".repeat(64)), dir).then(() => "", (e) => (e as Error).message);
    assert(/checksum/.test(bad), "registry: a download with a wrong sha256 stops");
    const npx = await install({ id: "n", name: "N", version: "1", description: "", distribution: { npx: { package: "some-agent@1.0.0", args: ["--acp"] } } }, dir);
    assert(npx.command.slice(1).join(" ") === "-y some-agent@1.0.0 --acp" && npx.login.at(-1) === "some-agent@1.0.0", "registry: an npx agent runs its package");
  } finally {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}

// Part two.
const free = Bun.serve({ port: 0, fetch: () => new Response() });
const PORT = free.port;
free.stop();
const BASE = `http://127.0.0.1:${PORT}`;
const home = realpathSync(mkdtempSync(join(tmpdir(), "yonder-clis-")));
const bin = join(home, "bin");
const project = join(home, "project");
const log = join(home, "fake.log");
mkdirSync(bin);
mkdirSync(project);
for (const name of ["codex", "cursor-agent"])
  writeFileSync(join(bin, name), `#!/bin/sh\nexec bun ${JSON.stringify(join(FIXTURES, "fake-cli.ts"))} ${name} "$@"\n`, { mode: 0o755 });
// The bridge finds the ACP adapter next to the binary of Codex.
writeFileSync(join(bin, "codex-acp"), `#!/bin/sh\nexec bun ${JSON.stringify(join(FIXTURES, "fake-acp.ts"))}\n`, { mode: 0o755 });
// A fake Hermes: the fake ACP agent for its turns, and fake-cli.ts for its version and for `-z`, the title of a new agent.
writeFileSync(join(bin, "hermes"), `#!/bin/sh\n[ "$1" = acp ] && exec bun ${JSON.stringify(join(FIXTURES, "fake-acp.ts"))}\nexec bun ${JSON.stringify(join(FIXTURES, "fake-cli.ts"))} hermes "$@"\n`, { mode: 0o755 });
const config = join(home, `.config/yonder-${PORT}`);
const socket = join(config, "acp.sock").length < 100 ? join(config, "acp.sock") : join("/tmp", `yonder-acp-${createHash("sha1").update(config).digest("hex").slice(0, 10)}.sock`);
const host = async (): Promise<number | undefined> => (await fetch("http://acp/health", { unix: socket }).then((r) => r.json(), () => ({}))).pid;
const start = () =>
  Bun.spawn(["bun", join(import.meta.dir, "main.ts")], {
    env: { ...process.env, HOME: home, YONDER_PORT: String(PORT), PATH: `${bin}:${process.env.PATH}`, FAKE_LOG: log },
    stdout: "ignore",
    stderr: "ignore",
  });
type Call = { pid: number; cli: string; method: string; params: any; config?: string };
const calls = (method: string) => readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Call).filter((c) => c.cli === "codex-acp" && c.method === method);
const alive = (pid: number) => {
  try {
    return process.kill(pid, 0);
  } catch {
    return false;
  }
};

// An agent of the ACP registry with a dash in its ID, as the user added it: here the fake adapter of Codex.
mkdirSync(config, { recursive: true });
const fake = join(bin, "codex-acp");
writeFileSync(join(config, "state.json"), JSON.stringify({ added: [{ id: "fake-acp", name: "Fake ACP", version: "1.0.0", command: [fake], login: [fake], ready: true }] }));
let bridge = start();
let client: Client;
const connect = async () => {
  let up = false;
  for (let i = 0; i < 150 && !up && bridge.exitCode === null; i++) {
    up = await fetch(`${BASE}/mcp`).then(() => true, () => false);
    if (!up) await Bun.sleep(100);
  }
  if (!up) throw new Error("FAIL: the bridge does not start");
  client = new Client({ name: "yonder-clis-check", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
};
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[]).map((c) => c.text).join("");
  if (res.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
};
const agent = async (id: string) => (await call("list_workers", { full: true })).find((w: { id: string }) => w.id === id);
async function until(id: string, status: string, seconds: number) {
  for (let i = 0; i < seconds * 4; i++) {
    const w = await agent(id);
    if (w?.status === status) return w;
    await Bun.sleep(250);
  }
  throw new Error(`FAIL: agent ${id} is not ${status} after ${seconds} seconds: ${JSON.stringify(await agent(id))}`);
}

try {
  await connect();
  // A summary would run `claude -p` on Haiku, which uses credits.
  await fetch(`${BASE}/summaries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: false }) });

  const clis = await fetch(`${BASE}/clis?fresh`).then((r) => r.json());
  const row = clis.clis.find((c: { id: string }) => c.id === "codex");
  assert(row?.path?.startsWith(bin) && row.version === "0.160.1" && row.account === "ChatGPT plan" && row.on, "/clis finds the fake Codex, its version and its plan");

  const started = await call("start_worker", { project, task: "Fix the README title", name: "Fix README", cli: "codex" });
  assert(started.cli === "codex" && /^[0-9a-f]{6}$/.test(started.id) && started.sessionId === "019a1b2c-3d4e-7f00-8a00-000000000001", "start_worker starts a Codex agent with its session ID");
  const id = started.id;
  const made = calls("newSession")[0];
  assert(made.params.mcpServers.some((m: { name: string; url: string }) => m.name === "yonder" && m.url.startsWith(`${BASE}/mcp?worker=`)), "the session gets the tools of Yonder");
  assert(JSON.parse(made.config!).developer_instructions, "the adapter gets the spoken prompt");
  assert(calls("setSessionMode")[0]?.params.modeId === "agent-full-access", "the agent runs in Full access");
  assert(calls("prompt")[0].params.prompt[0].text.startsWith("Fix the README title"), "the prompt goes to the session");
  const done = await until(id, "done", 15);
  assert(/README title is fixed/.test(done.result), "the agent is done with the last text as its result");

  await call("message_worker", { worker: id, message: "Add a test" });
  await until(id, "done", 15);
  const second = calls("prompt")[1];
  assert(second.params.sessionId === started.sessionId && second.pid === calls("prompt")[0].pid && calls("initialize").length === 1, "a message continues the same session in the same process");

  const turns = await fetch(`${BASE}/conversation?worker=${id}`).then((r) => r.json());
  const said = turns.map((t: { who: string; text: string }) => `${t.who}: ${t.text}`);
  assert(said[0] === "user: Fix the README title" && said.some((t: string) => t.startsWith("tool: Bash sed")) && said.includes("user: Add a test"), "the conversation shows the prompts, the tool calls and the answers");

  // A stop cancels the turn in the ACP host, and the agent waits for the next message.
  await call("message_worker", { worker: id, message: "SLOW work" });
  await Bun.sleep(1500);
  assert((await agent(id)).status === "running", "a slow turn runs");
  await call("stop_worker", { worker: id });
  assert(calls("cancel").length === 1 && (await agent(id)).status === "waiting", "stop_worker cancels the turn, and the agent waits");

  // A turn keeps running in the ACP host when the bridge restarts, and the new bridge follows it to its end.
  await call("message_worker", { worker: id, message: "SLOW again" });
  await Bun.sleep(2000);
  bridge.kill();
  await bridge.exited;
  const hostPid = await host();
  assert(hostPid && alive(hostPid), "the turn runs on in the ACP host when the bridge stops");
  bridge = start();
  await connect();
  const after = await until(id, "done", 30);
  assert(/README title is fixed/.test(after.result) && (await host()) === hostPid, "the new bridge follows the turn to its end, in the same host");

  // After a restart of the host, the next turn starts the adapter again and resumes the session.
  process.kill(hostPid!);
  for (let i = 0; i < 20 && alive(hostPid!); i++) await Bun.sleep(100);
  await call("message_worker", { worker: id, message: "Add docs" });
  await until(id, "done", 15);
  assert(calls("resumeSession")[0]?.params.sessionId === started.sessionId && (await host()) !== hostPid, "a new host resumes the session");

  // A CLI that fails at once gives its error to the caller, and no agent stays.
  const failed = await call("start_worker", { project, task: "Fix it", name: "Fix it", cli: "cursor" }).then(() => "", (e) => (e as Error).message);
  assert(/Authentication required/.test(failed) && !(await call("list_workers", { full: true })).some((w: { cli?: string }) => w.cli === "cursor"), "a Cursor that is not signed in fails the start with its error");

  // The cards of the sign-ins (bridge/logins.ts): the failed start shows the card of Cursor. A tap starts its sign-in in a
  // pseudo-terminal, the card gets the link, and it goes when the sign-in ends and the check finds Cursor signed in.
  const cards = async () => (await fetch(`${BASE}/logins`).then((r) => r.json())) as { id: string; step: string; url?: string; code?: string }[];
  const gone = async (id: string) => {
    for (let i = 0; i < 40 && (await cards()).some((l) => l.id === id); i++) await Bun.sleep(250);
    return !(await cards()).some((l) => l.id === id);
  };
  assert((await cards()).some((l) => l.id === "cursor" && l.step === "signed-out"), "an agent that fails for its sign-in shows the card of its CLI");
  const tapped = await fetch(`${BASE}/logins`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "cursor", action: "login" }) }).then((r) => r.json());
  assert(tapped.find((l: { id: string }) => l.id === "cursor")?.url === "https://cursor.com/loginDeepControl?challenge=abc&uuid=def&mode=login&redirectTarget=cli", "Sign in starts the sign-in of Cursor, and the card gets its link");
  assert(await gone("cursor"), "the card goes when the sign-in ends");
  // cli_login gives the card of a device sign-in, with its one-time code.
  const asked = await call("cli", { action: "login", cli: "Codex" });
  const codex = (await cards()).find((l) => l.id === "codex");
  assert(/Agents tab/.test(asked.said) && codex?.url === "https://auth.openai.com/codex/device" && codex.code === "ABCD-12345", "cli_login starts the device sign-in of Codex, and the card has its link and its code");
  assert(await gone("codex"), "the card of Codex goes when its sign-in ends");
  const status = await call("cli", { action: "status" });
  assert(status.find((c: { id: string }) => c.id === "codex")?.signedIn && status.some((c: { id: string }) => c.id === "claude"), "cli_status lists Claude Code and the other CLIs with their sign-ins");
  assert(/knows no CLI/.test(await call("cli_login", { cli: "nope" }).then(() => "", (e) => (e as Error).message)), "cli_login refuses a CLI that Yonder does not know");

  const last = calls("prompt").at(-1)!.pid;
  await call("remove_worker", { worker: id });
  for (let i = 0; i < 20 && alive(last); i++) await Bun.sleep(100);
  assert(!(await agent(id)) && !readdirSync(join(home, `.config/yonder-${PORT}/runs`)).length && !alive(last), "remove_worker removes the agent, its logs and its process");

  const other = await call("start_worker", { project, task: "Fix the README title", name: "Fix README", cli: "fake-acp" });
  assert(other.cli === "fake-acp" && /README title is fixed/.test((await until(other.id, "done", 15)).result), "an added agent with a dash in its ID runs in the ACP host");

  // closeWhenDone: with no Clef and no summary here, nothing can tell that nothing came up, so the agent stays open,
  // with the purple dot, and loses the flag (bridge/keep-open.ts checks the rule itself).
  assert((await call("message_worker", { worker: other.id, message: "Add a test", closeWhenDone: true })).closeWhenDone, "message_worker sets closeWhenDone");
  await until(other.id, "done", 15);
  await Bun.sleep(1500);
  const kept = await agent(other.id);
  assert(kept.status === "done" && kept.attention && !kept.closeWhenDone && !kept.closedItself, "an agent with closeWhenDone that cannot be checked stays open, with the purple dot");
  await call("remove_worker", { worker: other.id });

  // The title of an agent of Hermes with no name comes from `hermes -z`, with the model of the agent, not from Claude Code.
  const hermes = await call("start_worker", { project, task: "Make the title of the README better", name: "", cli: "hermes", model: "custom:llama3.2-64k" });
  let named = await agent(hermes.id);
  for (let i = 0; i < 40 && named?.name !== "Fix Hermes Title"; i++) await Bun.sleep(250), (named = await agent(hermes.id));
  const run = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((c) => c.cli === "hermes")?.args as string[] | undefined;
  assert(named?.name === "Fix Hermes Title", "an agent of Hermes with no name gets its title from Hermes");
  assert(run?.[0] === "-z" && /^Write a title[^]*Make the title of the README better/.test(run[1]) && run.slice(2).join(" ") === "-m custom:llama3.2-64k --ignore-rules -t todo",
    "the title is one hidden run of `hermes -z`, with the model of the agent, no rules and no tools for files or the shell");
  await until(hermes.id, "done", 15);
  await call("remove_worker", { worker: hermes.id });
  // An ACP error that the agent did not catch gives its details, not only "Internal error" (Sentry YONDER-1G).
  mkdirSync(join(home, "broken"));
  const broken = await call("start_worker", { project: join(home, "broken"), task: "Fix it", name: "Fix it", cli: "hermes" }).then(() => "", (e) => (e as Error).message);
  assert(/Internal error: No model is set\. Run hermes model\./.test(broken), `an agent of Hermes that fails at its start gives the reason: ${broken}`);

  // The last step of the first run: an agent on the default CLI sets up the rest, with the guide of the bridge.
  await fetch(`${BASE}/clis`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cli: "codex" }) });
  const helper = await fetch(`${BASE}/setup-agent`, { method: "POST" }).then((r) => r.json());
  const setup = await until(helper.id, "done", 15);
  const guide = await fetch(`${BASE}/setup-guide`).then((r) => r.text());
  assert(setup.cli === "codex" && setup.name === "Set up Yonder" && setup.task.includes(`curl -s ${BASE}/setup-guide`), "the setup agent starts on the default CLI, and its task names the guide of this bridge");
  assert(guide.includes(`${BASE}/settings`) && !guide.includes("{bridge}") && /\/clis[^]*add_workspace[^]*customize/.test(guide), "the guide has the address of this bridge, and the steps for the CLI, the projects and the look");
  await call("remove_worker", { worker: helper.id });
} finally {
  bridge.kill();
  await bridge.exited;
  // The ACP host runs detached, so it outlives the bridge.
  const left = await host();
  if (left) process.kill(left);
  rmSync(home, { recursive: true, force: true });
}
