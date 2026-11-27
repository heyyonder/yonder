// The end-to-end check of a picture in a chat on the phone, through the relay: `bun bridge/images-e2e.ts`. It needs the
// network (relay.yonder.so) and Chrome for Testing, so GitHub does not run it. It uses no credits: a test bridge with one
// fake agent whose answer names a picture of about 2 MB, and a phone page in headless Chrome that pairs through the relay.
// The first load of the picture fails on purpose, as at a restart of the bridge, so the check shows that the phone tries
// again (useBridgeSrc in src/bridge.ts). Then it opens Settings › Environments, which shows the time of the last poll,
// such as "Relay · 180 ms". The screenshots go to the shots folder that it prints.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-images-e2e-"));
const SHOTS = process.env.SHOTS ?? join(TMP, "shots");
mkdirSync(SHOTS, { recursive: true });
const free = () => {
  const s = Bun.serve({ port: 0, fetch: () => new Response() });
  const p = s.port;
  s.stop(true);
  return p;
};
const assert = (ok: unknown, what: string) => {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
};
const HOME = join(TMP, "home");
const PORT = free();
const CONFIG = join(HOME, ".config", `yonder-${PORT}`);
const PROJECT = join(TMP, "photos");
mkdirSync(CONFIG, { recursive: true });
mkdirSync(PROJECT, { recursive: true });
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.

// A PNG of 800 × 800 pixels of noise, about 2 MB, because noise does not compress.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), 8 + data.length);
  return out;
};
const W = 800;
const rows = Buffer.alloc((W * 3 + 1) * W);
for (let i = 0; i < rows.length; i++) rows[i] = i % (W * 3 + 1) === 0 ? 0 : (Math.random() * 256) | 0;
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(W, 4);
ihdr.set([8, 2, 0, 0, 0], 8);
const IMAGE = join(PROJECT, "noise.png");
writeFileSync(IMAGE, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", new Uint8Array())]));

const SESSION = "00000000-0000-4000-8000-000000000003";
const now = Date.now();
const at = (s: number) => new Date(now - 60_000 + s * 1000).toISOString();
const ANSWER = `Here is the picture:\n\n${IMAGE}`;
writeFileSync(
  join(CONFIG, "state.json"),
  JSON.stringify({ workers: [{ id: "w3", num: 3, sessionId: SESSION, name: "Noise picture", project: "photos", path: PROJECT, task: "Make a picture", status: "done", activity: "", result: ANSWER, unread: false, startedAt: now, updatedAt: now }] }),
);
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({}));
const transcript = join(HOME, ".claude", "projects", PROJECT.replace(/[^a-zA-Z0-9]/g, "-"));
mkdirSync(transcript, { recursive: true });
const events = [
  { type: "user", timestamp: at(0), message: { role: "user", content: "Make a picture." } },
  { type: "assistant", timestamp: at(5), message: { role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: ANSWER }] } },
];
writeFileSync(join(transcript, `${SESSION}.jsonl`), events.map((e) => JSON.stringify({ ...e, sessionId: SESSION, cwd: PROJECT })).join("\n") + "\n");

const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdout: "ignore", stderr: "ignore" });
const env = { ...process.env, HOME, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
const vitePort = free();
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });

const procs = [chrome, bridge, vite];
try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/settings`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false), fetch(`http://127.0.0.1:${chromePort}/json/version`).then(() => true, () => false)]);
    if (up.every(Boolean)) break;
    await Bun.sleep(200);
  }
  // The relay of this process answers the phone. The first load of the picture gets a 502, as a dropped load does.
  let loads = 0;
  const { connectRelay } = await import(join(WT, "bridge/relay.ts"));
  const relay = connectRelay("wss://relay.yonder.so", CONFIG, process.env.APNS_TEAM_ID ?? "", (req: Request) => {
    const u = new URL(req.url);
    if (u.pathname === "/media" && ++loads === 1) return Promise.resolve(new Response(null, { status: 502 }));
    u.port = String(PORT);
    return fetch(new Request(u, req));
  });
  const { link } = await relay.pair();

  // CDP to the phone page.
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
  const until = async (expression: string, what: string, ms = 40_000) => {
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(250)) if (await page(expression).catch(() => false)) return console.log(`ok: ${what}`);
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, "failed.png"), Buffer.from(data, "base64"));
    throw new Error(`FAIL: timed out: ${what} (the screen: ${join(SHOTS, "failed.png")})`);
  };
  const shot = async (name: string) => {
    await Bun.sleep(700);
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
    console.log(`shot: ${join(SHOTS, name)}`);
  };
  const click = (selector: string, text = "") =>
    page(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); e?.click(); return !!e; })()`);
  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
  await cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: 62, bottom: 34 } });
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until("document.readyState === 'complete'", "the page loads");
  await page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); localStorage.setItem('theme', 'light'); return true })()`);
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", "the paired app shows");
  await Bun.sleep(1500);

  await click("[role=tab]", "Done");
  await until("[...document.querySelectorAll('.worker.row')].some((r) => r.textContent.includes('Noise picture'))", "agent 3 is on the Done tab");
  const opened = Date.now();
  await click(".worker.row", "Noise picture");
  await until("[...document.querySelectorAll('.media img')].some((i) => i.complete && i.naturalWidth === 800)", "the picture of the chat loads through the relay");
  assert(loads >= 2, `the phone loads the picture again after a failed load (${loads} loads, ${Date.now() - opened} ms)`);
  await shot("1-chat-picture.png");

  await click("[aria-label='Back to the agents']");
  await click("[aria-label=Settings]");
  await until("[...document.querySelectorAll('button, .row, li')].some((e) => e.textContent.trim().startsWith('Environments'))", "the settings show");
  await click("button, .row, li", "Environments");
  await until("/^(Relay|Local) · \\d+ ms$/.test(document.querySelector('.row.computer small')?.textContent ?? '')", "Environments shows the way and the time of the last poll");
  console.log(`tag: ${await page("document.querySelector('.row.computer small').textContent")}`);
  await shot("2-settings-poll-time.png");
  console.log(`shots: ${SHOTS}`);
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  if (!process.env.KEEP) rmSync(join(TMP, "home"), { recursive: true, force: true });
}
// The socket of the relay keeps the process alive.
process.exit(0);
