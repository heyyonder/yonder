// The end-to-end check of the accent of the theme (the Color row of Settings › Appearance, applyAccent in
// src/Settings.tsx): `bun bridge/accent-e2e.ts`. It needs the network (relay.yonder.so) and Chrome for Testing, so GitHub does
// not run it. It uses no credits: a test bridge with fake agents, and a phone page in headless Chrome that pairs through
// the relay. It does not touch the bridge on port 7787 or ~/.config/yonder. It takes pictures of the list and of the
// Color row with the default accent, a swatch and a color of the user's own, in the light and the dark theme.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-accent-e2e-"));
const SHOTS = process.env.SHOTS ?? join(TMP, "shots");
mkdirSync(SHOTS, { recursive: true });
const free = () => {
  const s = Bun.serve({ port: 0, fetch: () => new Response() });
  const p = s.port;
  s.stop(true);
  return p;
};
const HOME = join(TMP, "home");
const PORT = free();
const CONFIG = join(HOME, ".config", `yonder-${PORT}`);
mkdirSync(CONFIG, { recursive: true });
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.
const config = () => JSON.parse(readFileSync(join(CONFIG, "config.json"), "utf8"));

// Agents for the rows: two that run and one that waits. An older phone has "violet" in localStorage.
const now = Date.now();
const MICE = [
  [21, "Theme accent colours", "yonder", "running"],
  [14, "Landing hero", "yonder-landing", "running"],
  [9, "October invoice", "time", "waiting"],
] as const;
writeFileSync(
  join(CONFIG, "state.json"),
  JSON.stringify({
    workers: MICE.map(([num, name, project, status]) => {
      const path = join(TMP, project);
      mkdirSync(path, { recursive: true });
      return { id: `w${num}`, num, sessionId: `00000000-0000-4000-8000-0000000000${num}`, name, project, path, task: name, status, activity: status === "running" ? "Editing app.css" : "", result: "Done.", unread: false, startedAt: now, updatedAt: now - num * 60_000 };
    }),
  }),
);
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({}));

const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--use-mock-keychain", "--password-store=basic", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdout: "ignore", stderr: "ignore" });
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
  // A click by the page: the shots need the screens, not the gestures.
  const click = (selector: string, text = "") =>
    until(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); return e && (e.click(), true); })()`, `click ${selector} ${text}`);
  const accent = () => page("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()");
  const appearance = async () => {
    await click("[aria-label=Settings]");
    await click(".row.nav", "Appearance");
    await until("!!document.querySelector('.swatches')", "Appearance shows the Color row");
    await page("document.querySelector('.swatches').scrollIntoView({ block: 'center' })");
  };
  // The list with the field of the sign-in in focus, for its ring.
  const list = async (name: string) => {
    await page("document.querySelector('main input, .panel input')?.focus()");
    await shot(name);
    await page("document.activeElement?.blur()");
  };
  const close = async () => {
    await click(".page-back[aria-label='Back to Settings']");
    await click(".page-back[aria-label=Back]");
    await until("!document.querySelector('.row.nav')", "the Settings close");
  };

  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 3, mobile: true });
  await cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: 62, bottom: 34 } });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until("document.readyState === 'complete'", "the page loads");
  // An older phone with "violet" of phone.json: it gives the color to config.json once.
  await page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); localStorage.setItem('theme', 'light'); localStorage.setItem('accent', 'violet'); return true })()`);
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", "the paired app shows");
  await until(() => config().accent === "#6e56cf", 'the old "violet" of the phone goes to config.json as "#6e56cf"');
  await until(async () => (await accent()) === "#6e56cf", "the app shows violet");

  // Light: the default accent (the red of the brand), then Blue.
  await appearance();
  await page("document.querySelector('.swatch.default').click()");
  await until(() => config().accent === "", 'Default writes "accent": "" to config.json');
  await until(async () => (await accent()) === "#e5484d", "the default accent is the red of Yonder");
  await shot("light-default-settings.png");
  await page("document.querySelector('.swatch[aria-label=Blue]').click()");
  await until(() => config().accent === "#0090ff", 'Blue writes "accent": "#0090ff" to config.json');
  await until(async () => (await accent()) === "#0090ff", "the accent is blue at once");
  await shot("light-blue-settings.png");
  await close();
  await list("light-blue-list.png");

  // Dark: Violet, then a color of the user's own written to config.json by hand, which shows when the Settings open.
  await appearance();
  await click(".page .seg button", "Dark");
  await until("document.documentElement.dataset.theme === 'dark'", "the dark theme");
  await page("document.querySelector('.swatch[aria-label=Violet]').click()");
  await until(() => config().accent === "#6e56cf", 'Violet writes "accent": "#6e56cf"');
  await page("document.querySelector('.swatches').scrollIntoView({ block: 'center' })");
  await shot("dark-violet-settings.png");
  await close();
  await list("dark-violet-list.png");
  writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ ...config(), accent: "#30a46c" }));
  await appearance();
  await until(async () => (await accent()) === "#30a46c", "a color written by hand in config.json shows when the Settings open");
  await shot("dark-green-settings.png");
  await page("document.querySelector('.swatch.default').click()");
  await until(async () => (await accent()) === "#ff5c61", "the default accent of the dark theme is the lighter red");
  await close();
  await list("dark-default-list.png");
  // An agent in the dark theme: the Summary and Context tabs, with the pill in a tint of the accent.
  await click(".tablist button", "Done");
  await click(".worker.row");
  await until("!!document.querySelector('.convo-tabs [data-active]')", "the agent opens with its tabs");
  await shot("dark-default-agent.png");
  // The tabs of the Mac in the dark theme: the same page with no data-phone, at the width of a window.
  await cdp("Emulation.setDeviceMetricsOverride", { width: 900, height: 640, deviceScaleFactor: 2, mobile: false });
  await page("document.querySelector('.page-back, [aria-label=Back]')?.click(); document.documentElement.removeAttribute('data-phone'); true");
  await shot("dark-default-mac-tabs.png");
  // A light color gets near-black text on the accent.
  await page(`(async () => { (await import('/src/Settings.tsx')).applyAccent('#ffd60a'); return true })()`);
  await until(async () => (await page("getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim()")) === "#1d1d1f", "a yellow accent gets near-black text");
  console.log(`shots: ${SHOTS}`);
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  if (!process.env.KEEP) rmSync(join(TMP, "home"), { recursive: true, force: true });
}
// The socket of the relay keeps the process alive.
process.exit(0);
