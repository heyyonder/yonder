// The end-to-end check of send_file with no file, and of a document from the phone: `bun bridge/attach-e2e.ts`. It
// needs the network (relay.yonder.so) and Chrome for Testing, so GitHub does not run it. It uses no credits: a test bridge
// with a fake agent 7, its own relay identity, and a phone page in headless Chrome that pairs through the relay.
// 1. A client calls send_file with worker 7 and no file. The phone opens the chat of agent 7 with the attach sheet.
// 2. The phone sends a document of 2 MB, in parts through the relay (/file).
// The screenshot goes to the shots folder that it prints.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-attach-e2e-"));
const SHOTS = join(TMP, "shots");
mkdirSync(SHOTS, { recursive: true });
const free = () => {
  const s = Bun.serve({ port: 0, fetch: () => new Response() });
  const p = s.port;
  s.stop(true);
  return p;
};
const PORT = free();
const HOME = join(TMP, "home");
const CONFIG = join(HOME, ".config", `yonder-${PORT}`);
mkdirSync(CONFIG, { recursive: true });
const assert = (ok: unknown, what: string) => {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
};
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ sumUp: false, textUp: false }));
writeFileSync(join(CONFIG, "state.json"), JSON.stringify({
  workers: [{ id: "abc123", num: 7, sessionId: "00000000-0000-4000-8000-000000000007", name: "Edit the video", project: "test", path: TMP, task: "Test", status: "done", activity: "", result: "", unread: false, startedAt: Date.now(), updatedAt: Date.now() }],
}));

const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdout: "ignore", stderr: "ignore" });
const env = { ...process.env, HOME, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
const vitePort = free();
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });

const procs = [chrome, bridge, vite];
try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/mcp`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false), fetch(`http://127.0.0.1:${chromePort}/json/version`).then(() => true, () => false)]);
    if (up.every(Boolean)) break;
    await Bun.sleep(200);
  }
  const { connectRelay } = await import(join(WT, "bridge/relay.ts"));
  const relay = connectRelay("wss://relay.yonder.so", CONFIG, process.env.APNS_TEAM_ID ?? "", (req: Request) => {
    const u = new URL(req.url);
    u.port = String(PORT);
    return fetch(new Request(u, req));
  });
  const { link } = await relay.pair();

  const targets = (await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
  const ws = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waits = new Map<number, (d: any) => void>();
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data));
    if (d.id) waits.get(d.id)?.(d), waits.delete(d.id);
  };
  const cdp = (method: string, params: object = {}) =>
    new Promise<any>((resolve, reject) => {
      const n = ++id;
      waits.set(n, (d) => (d.error ? reject(new Error(`${method}: ${JSON.stringify(d.error)}`)) : resolve(d.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const page = async (expression: string) => {
    const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
    return r.result.value;
  };
  const shot = async (name: string) => {
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
    console.log(`shot: ${join(SHOTS, name)}`);
  };
  const until = async (expression: string, what: string, ms = 40_000) => {
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(250)) if (await page(expression).catch(() => false)) return;
    await shot("failed.png");
    throw new Error(`FAIL: timed out: ${what}`);
  };
  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until("document.readyState === 'complete'", "the page loads");
  await page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); return true })()`);
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('.tablist, nav, main')", "the paired app shows");
  await Bun.sleep(1500);

  // 1. send_file with no file: the phone opens the chat of agent 7 with the attach sheet.
  const client = new Client({ name: "claude-app", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`)));
  const asked = await client.callTool({ name: "send_file", arguments: { worker: "7" } });
  assert(!asked.isError && JSON.stringify(asked.content).includes("agent 7"), "send_file with no file asks the phone");
  await until("!!document.querySelector('.attach-sheet') && document.querySelector('.convo-head')?.textContent.includes('Edit the video')", "the chat of agent 7 opens with the attach sheet");
  await Bun.sleep(600);
  await shot("attach.png");

  // 2. A document of 2 MB from the phone, in parts through the relay.
  const path = await page(`(async () => {
    const { yonder } = await import('/src/api.ts');
    const res = await yonder.media.file(new File([new Uint8Array(2_000_000).fill(65)], 'notes.pdf'));
    return res.ok ? (await res.json()).path : 'refused: ' + await res.text();
  })()`);
  assert(typeof path === "string" && path.endsWith("/notes.pdf") && statSync(path).size === 2_000_000, `the phone sends a document of 2 MB in parts (${path})`);
  await client.close();
  ws.close();
  relay.stop?.("test done");
  console.log("ALL OK");
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  rmSync(join(TMP, "home"), { recursive: true, force: true });
  rmSync(join(TMP, "chrome"), { recursive: true, force: true });
}
