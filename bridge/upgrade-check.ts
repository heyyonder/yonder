// The upgrade test: `bun run check-upgrade`. The bridge of the last release (the Mac app of download.yonder.so) runs on a
// free port with a new home folder that holds settings, a pairing and a done agent. Then the bridge of this source starts
// on the same home folder, and must keep all of it: the update path, not a new install. It starts no workers and uses no
// credits. Only a bridge on port 7787 joins the relay, so the test pairing goes nowhere. The release workflow runs it
// before an upload. `OLD_BRIDGE=<path>` uses a bridge binary on the disk in place of the download. Mac only, because the
// release runner is a Mac. The new bridge serves dist/, so run `bun run build` first.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}

const work = realpathSync(mkdtempSync(join(tmpdir(), "yonder-upgrade-")));
const home = join(work, "home");
// Both bridges run on the same port, because a bridge on a port other than 7787 keeps its state in .config/yonder-<port>.
const free = Bun.serve({ port: 0, fetch: () => new Response() });
const port = free.port;
free.stop();
const config = join(home, `.config/yonder-${port}`);
mkdirSync(config, { recursive: true });

let old = process.env.OLD_BRIDGE;
let released = "a bridge on the disk";
if (!old) {
  const feed = await fetch(`https://download.yonder.so/latest.json?${Date.now()}`).then((r) => r.json());
  released = feed.version;
  const url = feed.platforms["darwin-aarch64"]?.url ?? `https://download.yonder.so/Yonder-${released}.app.tar.gz`;
  const tar = join(work, "Yonder.app.tar.gz");
  await Bun.write(tar, await fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${url}: ${r.status}`)))));
  Bun.spawnSync(["tar", "-xzf", tar, "-C", work, "Yonder.app/Contents/MacOS/yonder-bridge"]);
  old = join(work, "Yonder.app/Contents/MacOS/yonder-bridge");
  // The test is about the state that the released bridge leaves, not about its signature. The signature of 2.97.633 has
  // no allow-unsigned-executable-memory, so macOS kills it at the start, and no release could pass. An ad hoc signature
  // with the entitlements of this source lets each release start here.
  Bun.spawnSync(["codesign", "-f", "-s", "-", "-o", "runtime", "--entitlements", join(import.meta.dir, "../src-tauri/Entitlements.plist"), old]);
}

// The state of a user: settings in config.json, a done agent in state.json, and a paired phone in relay.json.
const worker = { id: "up1", num: 7, sessionId: "00000000-0000-4000-8000-000000000007", name: "Upgrade check agent", project: "tree", path: join(home, "tree"), task: "Check the upgrade", status: "done", activity: "", result: "It works.", unread: false, startedAt: 1, createdAt: 1, updatedAt: 1 };
writeFileSync(join(config, "config.json"), JSON.stringify({ sumUp: false, models: ["haiku", "haiku"], defaultFolder: "~/tree" }, null, 2));
writeFileSync(join(config, "state.json"), JSON.stringify({ workers: [worker] }, null, 2));
const pairing = JSON.stringify({ token: "upgrade-check", key: {}, pub: "pub", phones: [{ pub: "phone", name: "Upgrade check phone", added: 1 }] }, null, 2);
writeFileSync(join(config, "relay.json"), pairing, { mode: 0o600 });

async function run(cmd: string[], label: string, checks: (call: (name: string, args?: Record<string, unknown>) => Promise<any>) => Promise<void>) {
  const mcp = `http://127.0.0.1:${port}/mcp`;
  const bridge = Bun.spawn(cmd, { env: { ...process.env, HOME: home, YONDER_PORT: String(port) }, stdout: "ignore", stderr: "inherit" });
  try {
    let up = false;
    for (let i = 0; i < 300 && !up && bridge.exitCode === null; i++) {
      up = await fetch(mcp).then(() => true, () => false);
      if (!up) await Bun.sleep(100);
    }
    assert(up, `${label} starts`);
    const client = new Client({ name: "yonder-upgrade-check", version: "0.1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(mcp)));
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await client.callTool({ name, arguments: args });
      const text = (res.content as { text: string }[]).map((c) => c.text).join("");
      if (res.isError) throw new Error(`${name}: ${text}`);
      return JSON.parse(text);
    };
    await checks(call);
    await client.close();
  } finally {
    bridge.kill();
    await bridge.exited;
  }
}

const hasAgent = (list: { name: string; status: string }[]) => list.some((w) => w.name === worker.name && w.status === "done");
try {
  await run([old], `the bridge of the release (${released})`, async (call) => {
    assert(hasAgent(await call("list_workers", { full: true })), "the released bridge lists the done agent");
  });
  await run(["bun", join(import.meta.dir, "main.ts")], "the bridge of this source", async (call) => {
    assert(hasAgent(await call("list_workers", { full: true })), "the new bridge keeps the done agent");
    const settings = JSON.parse(readFileSync(join(config, "config.json"), "utf8"));
    assert(settings.sumUp === false && settings.models.join() === "haiku,haiku" && settings.defaultFolder === "~/tree", "the new bridge keeps the settings");
    assert(readFileSync(join(config, "relay.json"), "utf8") === pairing, "the new bridge keeps the pairing");
    const front = await fetch(`http://127.0.0.1:${port}/front`).then((r) => r.json());
    assert(front.build && typeof front.needs?.ios === "number" && typeof front.needs?.android === "number", `/front gives the build ${front.build} and the needs of the phone apps`);
  });
} finally {
  // A CLI that a bridge asked for its version, such as cursor-agent, can still write its config into the home folder.
  await Bun.sleep(2000);
  rmSync(work, { recursive: true, force: true });
}
