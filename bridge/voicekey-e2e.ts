// The check of a voice call with no account (toggleCall in src/App.tsx, `keys` of /token?check in bridge/main.ts):
// `bun bridge/voicekey-e2e.ts`. It needs the network (relay.yonder.so) and Chrome for Testing, so GitHub does not run
// it. It uses no credits: a test bridge with fake keys, and a phone page in headless Chrome with no sign-in that pairs
// through the relay. It does not touch the bridge on port 7787 or ~/.config/yonder. With no key in .env, the tap of the
// call button shows the toast that asks for a key. With a key, the tap asks the bridge for a token. Settings › Voice
// offers only the providers whose key is in .env. SHOTS=<folder> keeps the picture of the Voice section there.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-voicekey-e2e-"));
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
mkdirSync(CONFIG, { recursive: true });
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({}));
writeFileSync(join(CONFIG, ".env"), "");

const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--use-mock-keychain", "--password-store=basic", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdout: "ignore", stderr: "ignore" });
const env = { ...process.env, HOME, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
const vitePort = free();
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });
const procs = [chrome, bridge, vite];
const timer = setTimeout(() => (console.log("FAIL: the check took more than 3 minutes"), procs.forEach((p) => p.kill()), process.exit(1)), 180_000);

try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/settings`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false), fetch(`http://127.0.0.1:${chromePort}/json/version`).then(() => true, () => false)]);
    if (up.every(Boolean)) break;
    await Bun.sleep(200);
  }
  const check = async () => (await (await fetch(`http://127.0.0.1:${PORT}/token?check`)).json()) as { key: boolean; keys: string[] };
  assert((await check()).keys.length === 0, "with an empty .env, /token?check gives no keys");

  // The token requests of the phone reach the bridge through the relay, so the relay counts them.
  let tokens = 0;
  const { connectRelay } = await import(join(WT, "bridge/relay.ts"));
  const relay = connectRelay("wss://relay.yonder.so", CONFIG, process.env.APNS_TEAM_ID ?? "", (req: Request) => {
    const u = new URL(req.url);
    if (u.pathname === "/token" && !u.searchParams.has("check")) tokens++;
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
  const until = async (check: string | (() => unknown), what: string, ms = 40_000) => {
    const ok = typeof check === "string" ? () => page(check) : check;
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(250)) if (await Promise.resolve().then(ok).catch(() => false)) return console.log(`ok: ${what}`);
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
    until(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); return e && (e.click(), true); })()`, `click ${selector} ${text}`);
  const toast = () => page("document.querySelector('.toast')?.textContent ?? ''") as Promise<string>;

  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 3, mobile: true });
  await cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: 62, bottom: 34 } });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until("document.readyState === 'complete'", "the page loads");
  await page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); localStorage.setItem('theme', 'light'); localStorage.removeItem('yonderAccount'); return true })()`);
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", "the paired app shows, with no sign-in");
  const call = "[data-native=call]";
  await until(`!!document.querySelector('${call}') && !document.querySelector('${call}').disabled`, "a paired phone with no account has the call button");

  await page(`document.querySelector('${call}').click()`);
  await until(async () => (await toast()).includes("Add a voice key"), "with no key, the tap shows the toast that asks for a key");
  assert(await page("[...document.querySelectorAll('.toast-action')].some((b) => b.textContent === 'How')"), "the toast has the How button to the guide");
  assert(tokens === 0, "with no key, the phone asks for no token");
  await page("document.querySelector('.toast')?.click()");

  writeFileSync(join(CONFIG, ".env"), "XAI_API_KEY=xai-test\nOPENAI_API_KEY=sk-test\n");
  assert(JSON.stringify((await check()).keys) === '["grok","openai"]', "with two keys, /token?check gives grok and openai");
  await until("!document.querySelector('.toast')", "the toast closes");
  await page(`document.querySelector('${call}').click()`);
  await until(() => tokens > 0, "with a key that is new since the last check, the tap asks the bridge for a token");
  await until(async () => (await toast()) !== "", "the fake key ends in an error");
  assert(!(await toast()).includes("Add a voice key"), `the error is not the toast that asks for a key (${await toast()})`);
  await page("document.querySelector('.toast')?.click()");

  await click("[aria-label=Settings]");
  await click(".row.nav", "Voice");
  await until("!!document.querySelector('.seg.wide')", "Settings › Voice shows the Model row to a user with no account");
  const offered = (await page("[...document.querySelectorAll('.seg.wide button')].map((b) => b.textContent).join(',')")) as string;
  assert(offered === "Grok,OpenAI", `the Model row offers only the providers with a key (${offered})`);
  await page("document.querySelector('.seg.wide').scrollIntoView({ block: 'start' })");
  await shot("voice-settings.png");
  console.log(`shots: ${SHOTS}`);
} finally {
  clearTimeout(timer);
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  if (!process.env.KEEP) rmSync(join(TMP, "home"), { recursive: true, force: true });
}
// The socket of the relay keeps the process alive.
process.exit(0);
