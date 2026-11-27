// The end-to-end check of the safe saves, the export and the import (bridge/backup.ts): `bun bridge/backup-e2e.ts`.
// It runs two bridges of this source on free ports, each with its own empty home folder, so it does not touch the live
// bridge on port 7787 or ~/.config/yonder. It starts no workers and uses no credits.
// - Bridge A starts with a broken state.json and a good .bak: it must start, keep the broken file, and use the .bak.
// - Export of A without keys and with keys, through the tool and the route of the Settings.
// - Import into bridge B: a merge with no key, then with keys, after which B restarts by itself.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const assert = (ok: unknown, what: string) => {
  if (!ok) throw new Error(`backup-e2e failed: ${what}`);
  console.log(`ok - ${what}`);
};
const freePort = () => {
  const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = s.port;
  s.stop(true);
  return port;
};
const homes: string[] = [];
const ports: number[] = [];
const procs: Bun.Subprocess[] = [];
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));

// A home folder with a stand-in `claude` that lists no sessions, and the files of the config folder.
function home(port: number, files: Record<string, string>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "yonder-backup-home-")));
  homes.push(dir);
  mkdirSync(join(dir, ".local/bin"), { recursive: true });
  writeFileSync(join(dir, ".local/bin/claude"), "#!/bin/sh\necho '[]'\n");
  chmodSync(join(dir, ".local/bin/claude"), 0o755);
  const config = join(dir, `.config/yonder-${port}`);
  mkdirSync(config, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(config, name), text);
  return { dir, config };
}
const { CLAUDE_CONFIG_DIR: _, ...parent } = process.env;
async function start(port: number, dir: string) {
  ports.push(port);
  procs.push(Bun.spawn(["bun", join(import.meta.dir, "main.ts")], { env: { ...parent, HOME: dir, YONDER_PORT: String(port), YONDER_OWNER_CHECK: "no", PATH: `${join(dir, ".local/bin")}:${parent.PATH}` }, stdout: "ignore", stderr: "ignore" }));
  return up(port);
}
async function up(port: number) {
  for (let i = 0; i < 300; i++) {
    if (await fetch(`http://127.0.0.1:${port}/mcp`).then(() => true, () => false)) return;
    await Bun.sleep(100);
  }
  throw new Error(`The bridge on port ${port} did not start.`);
}
async function client(port: number) {
  const c = new Client({ name: "yonder-backup-e2e", version: "0.1.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  return async (name: string, args: Record<string, unknown> = {}) => {
    const res = await c.callTool({ name, arguments: args });
    const text = (res.content as { text: string }[]).map((x) => x.text).join("");
    if (res.isError) throw new Error(`${name}: ${text}`);
    return JSON.parse(text);
  };
}
const post = (port: number, path: string, body: object) =>
  fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

try {
  const portA = freePort();
  const schedule = { id: "s1", name: "Daily", project: "/tmp", task: "Say hi", every: 24, next: 1, createdAt: 1, paused: true, retries: 0, secret: "hook-secret" };
  const A = home(portA, {
    "config.json": JSON.stringify({
      token: "tokA",
      port: portA,
      profiles: [{ id: "p1", name: "Work", cli: "claude", env: { API_KEY: "secretA" } }],
      workspaces: [{ id: "ws1", name: "WS One" }],
      defaultModel: "opus",
      sumUp: false,
    }),
    "state.json": '{"workers": [{"id": "w1", "na',
    "state.json.bak": JSON.stringify({ workers: [], extra: ["/tmp/a"], starred: [], hidden: [], schedules: [schedule], reminders: [] }),
    "phone.json": '{"theme": ',
    "phone.json.bak": JSON.stringify({ theme: "dark" }),
    ".env": "XAI_API_KEY=keyA\n",
    "relay.json": JSON.stringify({ pub: "pubA", token: "relay-token-A", phones: [] }, null, 2),
    "remote.json": JSON.stringify({ id: "remote-A", clients: {}, tokens: {} }, null, 2),
    "vault.json": JSON.stringify({ seals: {}, items: [], at: 1 }),
  });
  await start(portA, A.dir);
  assert(true, "bridge A starts with a broken state.json and a broken phone.json");
  assert(readdirSync(A.config).some((f) => f.startsWith("state.json.broken-")), "the broken state.json is kept aside");
  // The first save of phone.json (onboarded) moves the broken file aside and builds on the .bak.
  assert(readdirSync(A.config).some((f) => f.startsWith("phone.json.broken-")) && json(join(A.config, "phone.json")).theme === "dark", "the broken phone.json is kept aside, and its .bak applies");
  assert(json(join(A.config, "state.json")).schedules?.[0]?.id === "s1", "the state of the .bak applies and is saved");
  const callA = await client(portA);
  const tools = await callA("list_workers");
  assert(tools, "bridge A answers a tool");

  const plainPath = join(A.dir, "out", "plain.json");
  const plain = await callA("export_config", { path: plainPath });
  const plainText = readFileSync(plainPath, "utf8");
  assert(plain.path === plainPath && !plain.keys, "export_config writes the file");
  assert(!plainText.includes("tokA") && !plainText.includes("secretA") && !plainText.includes("hook-secret") && !plainText.includes(`"port"`), "the export without keys has no token, port, profile variable or webhook secret");
  assert(plainText.includes('"ws1"') && plainText.includes('"s1"') && plainText.includes('"/tmp/a"'), "the export holds the workspaces, the schedules and the projects");
  const keyed = await post(portA, "/setup-export", { keys: true });
  assert(keyed.path?.startsWith(join(A.dir, "Downloads", "yonder-setup-with-keys-")), "/setup-export with keys saves to Downloads");
  const keyedText = readFileSync(keyed.path, "utf8");
  assert(keyedText.includes("tokA") && JSON.parse(keyedText).files[".env"], "the export with keys holds the token and .env");

  const portB = freePort();
  const B = home(portB, {
    "config.json": JSON.stringify({ token: "tokB", port: portB, profiles: [{ id: "p1", name: "Old", cli: "claude", env: { API_KEY: "secretB" } }], workspaces: [{ id: "wsB", name: "B" }] }),
    "state.json": JSON.stringify({ workers: [], extra: ["/tmp/b"], starred: [], hidden: [], schedules: [], reminders: [] }),
    "phone.json": JSON.stringify({ chatFont: "serif" }),
    ".env": "XAI_API_KEY=keyB\nOWN=1\n",
  });
  await start(portB, B.dir);
  const callB = await client(portB);
  const result = await callB("import_config", { path: plainPath });
  assert(existsSync(join(result.backup, "config.json")) && existsSync(join(result.backup, "state.json")), "the import copies the files before it");
  const cB = json(join(B.config, "config.json"));
  assert(cB.token === "tokB" && cB.port === portB, "the import without keys keeps the token and the port");
  assert(cB.defaultModel === "opus" && cB.sumUp === false, "the settings of the file apply");
  const p1 = cB.profiles.find((p: { id: string }) => p.id === "p1");
  assert(p1.name === "Work" && p1.env.API_KEY === "secretB", "the profile merges and keeps its own variables");
  assert(["ws1", "wsB"].every((id) => cB.workspaces.some((w: { id: string }) => w.id === id)), `the workspaces merge: ${JSON.stringify(cB.workspaces)}`);
  const sB = json(join(B.config, "state.json"));
  const s1 = sB.schedules.find((s: { id: string }) => s.id === "s1");
  assert(s1 && s1.next > Date.now() && sB.extra.includes("/tmp/a") && sB.extra.includes("/tmp/b"), "the schedule and the projects merge, and the schedule starts next in the future");
  const pB = json(join(B.config, "phone.json"));
  assert(pB.theme === "dark" && pB.chatFont === "serif", "phone.json merges");
  assert(existsSync(join(B.config, "state.json.bak")) && existsSync(join(B.config, "phone.json.bak")), "the saves keep a .bak");
  assert(readFileSync(join(B.config, ".env"), "utf8").includes("keyB") && !result.restart, "the import without keys does not touch .env or restart");
  const noKeys = await post(portB, "/setup-import", { text: keyedText, keys: false });
  assert(!noKeys.error && json(join(B.config, "config.json")).token === "tokB", "a file with keys imported without keys changes no key");
  const bad = await post(portB, "/setup-import", { text: "{}", keys: false });
  assert(bad.error?.includes("not an export"), "/setup-import refuses a file that is not an export");
  assert(await callB("list_workers"), "bridge B still answers after the imports");

  const remoteB = readFileSync(join(B.config, "remote.json"), "utf8");
  const withKeys = await post(portB, "/setup-import", { text: keyedText, keys: true });
  assert(withKeys.restart && json(join(B.config, "config.json")).token === "tokA", "the import with keys applies the token and restarts the bridge");
  assert(readFileSync(join(B.config, "remote.json"), "utf8") === remoteB && existsSync(join(B.config, "import-keys", "relay.json")), "the key files wait until the bridge that runs has stopped");
  await Bun.sleep(2500);
  await up(portB);
  assert(await (await client(portB))("list_workers"), "bridge B comes back after the restart");
  await Bun.sleep(1000);
  const env = readFileSync(join(B.config, ".env"), "utf8");
  assert(env.includes("XAI_API_KEY=keyA") && env.includes("OWN=1"), ".env of the file applies and keeps the other variables of B");
  for (const f of ["relay.json", "remote.json", "vault.json"])
    assert(JSON.stringify(json(join(B.config, f))) === JSON.stringify(json(join(A.config, f))), `${f} of B is the one of A after the restart`);
  assert(!existsSync(join(B.config, "import-keys")), "import-keys/ is gone after the start");
  console.log("backup-e2e: all passed");
} finally {
  for (const p of procs) p.kill();
  // The bridge that restartBridge started is no child of this check.
  for (const port of ports) for (const pid of Bun.spawnSync(["lsof", "-ti", `tcp:${port}`, "-sTCP:LISTEN"]).stdout.toString().split("\n").filter(Boolean)) process.kill(Number(pid), "SIGTERM");
  await Bun.sleep(500);
  for (const dir of homes) rmSync(dir, { recursive: true, force: true });
}
