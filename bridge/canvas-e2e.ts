// The end-to-end check of the Canvas tab (docs/canvas.md): `bun bridge/canvas-e2e.ts`. It needs the network (relay.yonder.so)
// and Chrome for Testing, so GitHub does not run it. It uses no credits: a test bridge with one fake agent and its transcript,
// a phone page in headless Chrome that pairs through the relay, and MCP calls in place of the agent and of Grok. Face ID
// is a stub that says yes. The screenshots of the phone go to the shots folder that it prints.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";
import { openCanvas } from "./canvas";

const WT = resolve(import.meta.dir, "..");
// The real path: lsof gives /private/var/... for the folder of a server, and a site of an agent matches its folder.
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "yonder-canvas-e2e-")));
const SHOTS = join(TMP, "shots");
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
const PROJECT = join(TMP, "weather");
mkdirSync(CONFIG, { recursive: true });
mkdirSync(PROJECT, { recursive: true });
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.

// Agent 12 made the weather card. Its chat has the request, the call of show_app and its answer. The word of the
// user is "mouse".
const SESSION = "00000000-0000-4000-8000-000000000012";
const REQUEST = "Compare the weather in Paris and Dubai this week, as a card.";
const ANSWER = "Here it is. Dubai is about 23° warmer each day.";
const now = Date.now();
// A web server in the folder of the weather project. It is the site of an agent only when the last message of the agent
// names its port, so agent 13 on this computer and agent 3 on the second computer name it. HOME has no login of Claude
// Code, so Haiku gives no name, and the site shows the title of its page.
const sitePort = free();
const SITE_SAYS = `The forecast page runs on http://localhost:${sitePort}.`;
writeFileSync(
  join(CONFIG, "state.json"),
  JSON.stringify({
    workers: [
      { id: "w12", num: 12, sessionId: SESSION, name: "Weather", project: "weather", path: PROJECT, task: REQUEST, status: "done", activity: "", result: ANSWER, unread: false, startedAt: now, updatedAt: now },
      { id: "w13", num: 13, sessionId: crypto.randomUUID(), name: "Forecast page", project: "weather", path: PROJECT, task: "Make a forecast page.", status: "done", activity: "", result: SITE_SAYS, unread: false, startedAt: now - 1000, updatedAt: now - 1000 },
    ],
  }),
);
const MOUSE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 11.2A4 4 0 1 1 10.4 7.4"/><path d="M13.6 7.4a4 4 0 1 1 3.8 3.8"/><path d="M10.4 7.4a5 5 0 0 1 3.2 0"/><path d="M6.6 11.2c-.5 3.5 2.2 9.3 5.4 9.8 3.2-.5 5.9-6.3 5.4-9.8"/><path d="M9.8 14h.01M14.2 14h.01M12 18.2h.01"/></svg>';
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ sumUp: false, agentName: { one: "mouse", many: "mice", icon: MOUSE } }));

const WEATHER = `<!doctype html><html><head><style>
body{margin:0;padding:20px 18px;font:15px -apple-system,system-ui,sans-serif;background:linear-gradient(#eef3ff,#fff 40%);color:#1d2433}
.top{display:flex;justify-content:space-between;color:#6b7387;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
.card{border-radius:18px;padding:16px;color:#fff}.to{background:linear-gradient(135deg,#4f7df3,#7aa2ff)}.du{background:linear-gradient(135deg,#f39c12,#fbbf24)}
.card b{display:block;font-size:15px}.card big{display:block;font-size:46px;font-weight:700;margin:4px 0}.card small{opacity:.9}
table{width:100%;border-collapse:collapse}td{padding:9px 0;border-bottom:1px solid #e4e8f0}td:first-child{font-weight:600;width:44px}
i{display:inline-block;height:5px;border-radius:3px;margin-right:8px;vertical-align:middle}.b{background:#4f7df3}.o{background:#f59e0b}
p{margin:14px 0 0;font-weight:600}</style></head><body>
<div class="top"><span>This week</span><span>Oct 19 – 25</span></div>
<div class="cards"><div class="card to"><b>Paris</b><big>8°</big><small>Cloudy, wind 24 km/h</small></div><div class="card du"><b>Dubai</b><big>31°</big><small>Sunny, humidity 45%</small></div></div>
<table>${[["Mon", 8, 31], ["Tue", 6, 32], ["Wed", 9, 31], ["Thu", 11, 30], ["Fri", 7, 32], ["Sat", 9, 33], ["Sun", 10, 31]]
  .map(([d, t, u]) => `<tr><td>${d}</td><td><i class="b" style="width:${Number(t) * 6}px"></i>${t}°</td><td><i class="o" style="width:${Number(u) * 4}px"></i>${u}°</td></tr>`)
  .join("")}</table><p>Dubai is about 23° warmer each day.</p></body></html>`;
const BUILDING = `<!doctype html><html><head><style>
body{margin:0;padding:22px 18px;min-height:100vh;box-sizing:border-box;font:15px -apple-system,system-ui,sans-serif;color:#f4f2ff;background:linear-gradient(160deg,#1b1530,#2d2150 60%,#1b1530)}
small{letter-spacing:.12em;text-transform:uppercase;opacity:.7;font-size:11px}h1{margin:6px 0 16px;font-size:26px}
.n{display:flex;gap:26px;margin-bottom:18px}.n b{display:block;font-size:26px}.n span{font-size:12px;opacity:.8}
.r{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-top:1px solid rgb(255 255 255/.12)}
.r div b{display:block}.r div span{font-size:12px;opacity:.7}em{font-style:normal;font-size:11px;padding:3px 8px;border-radius:99px;background:rgb(80 200 140/.2);color:#7ee2a8}
em.run{background:rgb(120 140 255/.2);color:#a9b6ff}em.you{background:rgb(170 120 255/.25);color:#d4b8ff}</style></head><body>
<small>Yonder · Oct 19</small><h1>What we're building</h1>
<div class="n"><div><b>5</b><span>mice at work</span></div><div><b>3</b><span>on main</span></div><div><b>1</b><span>waits for you</span></div></div>
${[["Device mesh", "Each computer reaches the others", "Done", ""], ["Schedules", "Mice that start at set times", "Done", ""], ["Live UI", "Native parts from props, quiet updates", "Running", "run"], ["Canvas", "Sites, artifacts and approvals", "Your yes", "you"], ["Mice", "The new word for agents", "Running", "run"]]
  .map(([t, d, s, c]) => `<div class="r"><div><b>${t}</b><span>${d}</span></div><em class="${c}">${s}</em></div>`)
  .join("")}</body></html>`;
// The icons that the agents draw: a sun with a cloud, and bars, each with a little motion. The bars have no xmlns, as an
// agent can write it, and the app adds it.
const SUN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><style>.r{transform-origin:26px 26px;animation:s 12s linear infinite}.c{animation:d 4s ease-in-out infinite}@keyframes s{to{transform:rotate(360deg)}}@keyframes d{50%{transform:translateX(3px)}}</style><rect width="64" height="64" fill="url(#g)"/><g class="r"><circle cx="26" cy="26" r="9" fill="#fde047"/><path d="M26 9v5M26 38v5M9 26h5M38 26h5M14 14l3.5 3.5M34.5 34.5L38 38M14 38l3.5-3.5M34.5 17.5L38 14" stroke="#fde047" stroke-width="3" stroke-linecap="round"/></g><path class="c" d="M24 50h22a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0-1 13z" fill="#fff"/></svg>`;
const BARS = `<svg viewBox="0 0 64 64"><style>.b{transform-box:fill-box;transform-origin:bottom;animation:h 1.6s ease-in-out infinite}.d1{animation-delay:.2s}.d2{animation-delay:.4s}@keyframes h{50%{transform:scaleY(.55)}}</style><rect width="64" height="64" fill="#7c3aed"/><rect class="b" x="16" y="26" width="8" height="22" rx="3" fill="#fff"/><rect class="b d1" x="28" y="16" width="8" height="32" rx="3" fill="#fff"/><rect class="b d2" x="40" y="30" width="8" height="18" rx="3" fill="#fff"/></svg>`;
// A page that tries to reach the app from its frame, and tells the app what it got.
const PROBE = `<!doctype html><p>probe</p><script>
const out = {};
try { out.parentDocument = String(parent.document.title); } catch (e) { out.parentDocument = "blocked"; }
try { out.parentTauri = typeof parent.__TAURI_INTERNALS__; } catch (e) { out.parentTauri = "blocked"; }
try { localStorage.getItem("x"); out.storage = "open"; } catch (e) { out.storage = "blocked"; }
fetch("http://127.0.0.1:${PORT}/canvas").then((r) => (out.bridge = r.status), () => (out.bridge = "blocked")).finally(() => parent.postMessage({ probe: out }, "*"));
</script>`;

// Agent 12 made the first version of the weather card in its last turn.
const first = openCanvas(join(CONFIG, "canvas")).put({ title: "Paris vs Dubai", html: WEATHER, worker: "w12", icon: SUN });
const shown = { id: first.id, path: join(CONFIG, "canvas", first.id, "1.html"), title: first.title, version: 1, shows: "It shows in your chat and in the Canvas tab, and the user opens it there." };
const transcript = join(HOME, ".claude", "projects", PROJECT.replace(/[^a-zA-Z0-9]/g, "-"));
mkdirSync(transcript, { recursive: true });
const at = (s: number) => new Date(now - 60_000 + s * 1000).toISOString();
const events = [
  { type: "user", timestamp: at(0), message: { role: "user", content: REQUEST } },
  { type: "assistant", timestamp: at(20), message: { role: "assistant", model: "claude-opus-5-5", content: [{ type: "tool_use", id: "t1", name: "mcp__yonder__show_app", input: { title: "Paris vs Dubai" } }] } },
  { type: "user", timestamp: at(21), message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: JSON.stringify(shown) }] }] } },
  { type: "assistant", timestamp: at(22), message: { role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: ANSWER }] } },
];
writeFileSync(join(transcript, `${SESSION}.jsonl`), events.map((e) => JSON.stringify({ ...e, sessionId: SESSION, cwd: PROJECT })).join("\n") + "\n");

const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--no-first-run", "--no-default-browser-check", "--use-mock-keychain", "--password-store=basic", "about:blank"], { stdout: "ignore", stderr: "ignore" });
// A made-up vault for the card of 1Password (bridge/vault.ts reads it in place of 1Password).
const FAKE = { items: [{ vault: "Agent", title: "GitHub", category: "ApiCredentials", sites: [], fields: { token: "ghp_FAKEVALUE_123456" } }] };
const env = { ...process.env, HOME, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK, YONDER_VAULT_FAKE: JSON.stringify(FAKE) };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
// A second computer of the phone: its sites show in the Canvas tab with its name, and its actions go to its own bridge.
const HOME2 = join(TMP, "home2");
const PORT2 = free();
const CONFIG2 = join(HOME2, ".config", `yonder-${PORT2}`);
mkdirSync(CONFIG2, { recursive: true });
// The forecast page (sitePort), and agent 3 of the second computer, which names it too.
const site = Bun.spawn(["bun", "-e", `Bun.serve({ port: ${sitePort}, fetch: () => new Response("<title>Weather site</title><h1>Weather</h1>", { headers: { "content-type": "text/html" } }) })`], { cwd: PROJECT, stdout: "ignore", stderr: "ignore" });
writeFileSync(
  join(CONFIG2, "state.json"),
  JSON.stringify({ workers: [{ id: "w3", num: 3, sessionId: crypto.randomUUID(), name: "Forecast page", project: "weather", path: PROJECT, task: "Make a forecast page.", status: "done", activity: "", result: SITE_SAYS, unread: false, startedAt: now, updatedAt: now }] }),
);
const bridge2 = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env: { ...process.env, HOME: HOME2, YONDER_PORT: String(PORT2), YONDER_RELAY_MARK: MARK }, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge2.log")) });
const vitePort = free();
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });

const procs = [chrome, bridge, bridge2, vite, site];
try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT2}/canvas`).then(() => true, () => false), fetch(`http://127.0.0.1:${PORT}/canvas`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false), fetch(`http://127.0.0.1:${chromePort}/json/version`).then(() => true, () => false)]);
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
  const relay2 = connectRelay("wss://relay.yonder.so", CONFIG2, process.env.APNS_TEAM_ID ?? "", (req: Request) => {
    const u = new URL(req.url);
    u.port = String(PORT2);
    return fetch(new Request(u, req));
  });
  const { link: link2 } = await relay2.pair();

  // The agent and its pages.
  const agent = new Client({ name: "fake-agent", version: "0.1.0" });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp?worker=w12`)));
  const tool = async (name: string, args: Record<string, unknown>) => {
    const r = await agent.callTool({ name, arguments: args }, undefined, { timeout: 600_000 });
    const text = (r.content as { text: string }[]).map((c) => c.text).join("");
    if (r.isError) throw new Error(`${name}: ${text}`);
    return JSON.parse(text);
  };
  const call = new Client({ name: "fake-grok", version: "0.1.0" });
  await call.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`)));
  await call.callTool({ name: "show_app", arguments: { title: "What we're building", html: BUILDING, icon: BARS, call: "7" } });
  // Agent 12 gives no id and no title, so its next page is a new version of its newest app.
  const weather = await tool("show_app", { html: WEATHER.replace("Oct 19 – 25", "Oct 20 – 26") });
  assert(weather.id === first.id && weather.version === 2 && /your chat/.test(weather.shows), "agent 12 adds a version to its app, known by the address of its session");

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
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(250)) if (await page(expression).catch(() => false)) return;
    // The screen at the failure, for the reason.
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
  // The safe area of an iPhone with the Dynamic Island, so that a header on the time or the battery shows in the shots.
  await cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: 62, bottom: 34 } });
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  // Face ID of the test: the biometric plugin says yes. Each other command of Tauri fails, as in a browser. Only the page
  // gets the stub, as Tauri gives its commands only to the page, not to a frame.
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `if (window === window.top) { window.__faceIds = 0; window.__TAURI_INTERNALS__ = { invoke: (cmd, args) => cmd === "plugin:biometric|authenticate" ? (window.__faceIds++, Promise.resolve()) : cmd === "plugin:opener|open_url" ? (window.__opened = args.url, Promise.resolve()) : cmd === "native_chrome" && localStorage.getItem("nativeTest") ? (window.__chrome = JSON.parse(args.state), Promise.resolve(5)) : Promise.reject(new Error("no Tauri: " + cmd)), transformCallback: () => 0, unregisterCallback: () => {}, metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } } }; }`,
  });
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `if (localStorage.getItem("nativeTest")) Object.defineProperty(HTMLInputElement.prototype, "switch", { value: false, writable: true, configurable: true });` });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until("document.readyState === 'complete'", "the page loads");
  await page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link2)}, 'iPhone')); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); localStorage.setItem('theme', 'dark'); return true })()`);
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", "the paired app shows");
  await Bun.sleep(1500);

  // 1. The Canvas tab: the search, then the apps of agent 12 and of a call, each with its icon, in one list with the sites.
  assert(await click("[role=tab]", "Canvas"), "the tab bar has the Canvas tab");
  // The test bridge also sees the dev servers of this Mac, as sites.
  await until("document.querySelectorAll('.app-row[data-id^=\"page/\"] .app-icon img').length === 2", "the Canvas tab shows two apps with their icons");
  assert(await page("!!document.querySelector('.add-site input') && !document.querySelector('.apps-kind')"), "the search always shows, and there is no Apps or Tunnels switch");
  await shot("1-apps.png");
  // The phone told the bridge its screen in its poll, and the tools tell it to the agents.
  // The phone polls each 3 seconds.
  for (let i = 0; i < 40 && !(await Bun.file(join(CONFIG, "displays.json")).exists()); i++) await Bun.sleep(250);
  const desc = (await agent.listTools()).tools.find((t) => t.name === "show_app")?.description ?? "";
  assert(/402x874 CSS px at 2x, with safe areas of 62 px at the top, 34 px at the bottom, in the dark look/.test(desc), `show_app tells the screen of the phone (${desc.match(/The phone[^.]*\./)?.[0]})`);

  // 1b. A long press: the menu of an app. Save puts a pin on it and keeps it at the top.
  const menu = async (title: string) => {
    const box = await page(`(() => { const r = [...document.querySelectorAll('.app-row')].find((e) => e.textContent.includes(${JSON.stringify(title)})).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "right", clickCount: 1 });
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "right", clickCount: 1 });
    await until("!!document.querySelector('.menu .menu-item')", "the menu of an app opens");
  };
  await menu("What we're building");
  assert((await page("[...document.querySelectorAll('.menu .menu-item')].map((e) => e.textContent).join()")) === "Rename,Star,Change icon,Rebuild,Archive,Delete", "the menu has Rename, Star, Change icon, Rebuild, Archive and Delete");
  await shot("1b-menu.png");
  await click(".menu .menu-item", "Star");
  await until("document.querySelector('.app-row')?.textContent.includes('What we') && !!document.querySelector('.app-row .app-pin')", "a saved app shows a star at the top");
  await shot("1d-saved.png");
  for (let i = 0; i < 40 && !(await fetch(`http://127.0.0.1:${PORT}/canvas?all`).then((r) => r.json())).find((a: { saved?: boolean }) => a.saved); i++) await Bun.sleep(250);
  assert((await fetch(`http://127.0.0.1:${PORT}/canvas?all`).then((r) => r.json())).find((a: { title: string }) => a.title === "What we're building")?.saved, "the bridge keeps the save");

  // 1b2. Change icon opens the picker: a search, the icons of the app, Generate and Upload. A pick shows at once on a plain tile, and an
  // upload shows the picture. The bridge keeps each one.
  const iconOf = async (title: string) => (await fetch(`http://127.0.0.1:${PORT}/canvas?all`).then((r) => r.json())).find((a: { title: string }) => a.title === title)?.icon as string | undefined;
  await menu("What we're building");
  await click(".menu .menu-item", "Change icon");
  await until("document.querySelectorAll('.icon-picker .icon-grid button').length === 59 && [...document.querySelectorAll('.icon-picker button')].map((b) => b.textContent).join().endsWith('Generate,Upload')", "Change icon opens the picker with the icons of the app, Generate and Upload");
  assert(await page("!!document.querySelector('.attach-sheet.icon-picker .icon-search') && document.activeElement !== document.querySelector('.icon-search')"), "on the phone the picker is a sheet from the bottom with a search, and the keyboard waits for a tap");
  await shot("1b-icon-picker.png");
  await page("document.querySelector('.icon-picker .icon-search').focus(), true");
  await cdp("Input.insertText", { text: "test" });
  await until("[...document.querySelectorAll('.icon-picker .icon-grid button')].map((b) => b.ariaLabel).join() === 'flask'", "the search finds an icon by its words: test gives the flask");
  await shot("1b-icon-search.png");
  await click(".icon-picker button[aria-label='flask']");
  await until("!document.querySelector('.icon-picker') && !![...document.querySelectorAll('.app-row')].find((e) => e.textContent.includes('What we'))?.querySelector('.app-icon[data-plain] .app-glyph svg')", "a picked icon shows at once on a plain tile");
  for (let i = 0; i < 40 && (await iconOf("What we're building")) !== "flask"; i++) await Bun.sleep(250);
  assert((await iconOf("What we're building")) === "flask", "the bridge keeps the picked icon");
  await menu("What we're building");
  await click(".menu .menu-item", "Change icon");
  await until("!!document.querySelector('.icon-picker input[type=file]')", "the picker opens again");
  const { root } = await cdp("DOM.getDocument");
  const { nodeId } = await cdp("DOM.querySelector", { nodeId: root.nodeId, selector: ".icon-picker input[type=file]" });
  await cdp("DOM.setFileInputFiles", { nodeId, files: [join(WT, "src-tauri/icons/128x128.png")] });
  await until("!document.querySelector('.icon-picker') && !![...document.querySelectorAll('.app-row')].find((e) => e.textContent.includes('What we'))?.querySelector('.app-icon img.picture')", "an uploaded picture shows at once");
  for (let i = 0; i < 40 && !(await iconOf("What we're building"))?.startsWith("data:image/"); i++) await Bun.sleep(250);
  assert((await iconOf("What we're building"))?.startsWith("data:image/png;base64,"), "the bridge keeps the uploaded picture");
  await shot("1b-icon-picture.png");

  // 1c. Archive moves the app at once to the archive, closed under the apps. Its files stay, and undo brings it back.
  const archivedNow = async () => (await fetch(`http://127.0.0.1:${PORT}/canvas?all`).then((r) => r.json())).filter((a: { archived?: number }) => a.archived).length;
  await menu("What we're building");
  await click(".menu .menu-item", "Archive");
  await until("document.querySelectorAll('.app-row[data-id^=\"page/\"]').length === 1 && !!document.querySelector('.archived-title')", "Archive moves the app at once to the archive");
  await click(".archived-title");
  await until("document.querySelectorAll('.app-row[data-id^=\"page/\"]').length === 2", "the archive opens with the app in it");
  await shot("1c-archived.png");
  await click(".archived-title");
  for (let i = 0; i < 40 && (await archivedNow()) !== 1; i++) await Bun.sleep(250);
  assert((await archivedNow()) === 1 && (await fetch(`http://127.0.0.1:${PORT}/canvas?all`).then((r) => r.json())).length === 2, "the bridge keeps the app in the archive, with its files");
  assert((await tool("undo", {})).app === "What we're building", "undo brings the archived app back");
  await until("document.querySelectorAll('.app-row[data-id^=\"page/\"]').length === 2 && !document.querySelector('.archived-title')", "the app is back in the list", 15_000);

  // 1d. The search finds the apps, and also opens an address in place of the + of before. The phone opens no keyboard
  // until a tap in the field.
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  assert(!(await page("document.activeElement === document.querySelector('.add-site input')")), "the search opens no keyboard by itself");
  await page("document.querySelector('.add-site input').focus()");
  await cdp("Input.insertText", { text: "localhost:3000" });
  await until("!!document.querySelector('.app-add')", "an address in the search offers to open it");
  await shot("1c-search.png");
  await click(".add-site button[aria-label='Clear the search']");
  await until("document.querySelector('.add-site input')?.value === '' && !document.querySelector('.app-add')", "the clear button empties the search, and the search stays");

  // 1e. The one list has the pages and the sites of the agents of both computers. A site looks as an app: a name, not
  // its port, and no switch. Each other server of the Mac, such as the dev servers of this Mac, does not show. Star on a
  // site of the second computer goes to the bridge of that computer.
  const farRow = "[...document.querySelectorAll('.app-row[data-id]')].find((e) => !/^(page|site)\\//.test(e.dataset.id))";
  await until(`!!${farRow} && !!document.querySelector('.app-row[data-id^="page/"]') && !!document.querySelector('.app-row[data-id^="site/"]')`, "the sites of the agents of both computers show in the list with the pages", 60_000);
  const siteNames = await page("[...document.querySelectorAll('.app-row[data-id^=\"site/\"] .name')].map((e) => e.textContent).join()");
  assert(siteNames === "Weather site", `only the site that agent 13 names shows for this computer, with the title of its page as its name (${siteNames})`);
  assert(await page("!document.querySelector('.app-row [role=switch], .app-row .age')"), "a site has no switch, as an app");
  await shot("1e-two-computers.png");
  const farName = await page(`(() => { const r = ${farRow}; r.scrollIntoView({ block: "center" }); return r.dataset.id.slice(r.dataset.id.indexOf("/") + 1); })()`);
  const farBox = await page(`(() => { const r = ${farRow}.getBoundingClientRect(); return { x: r.x + r.width / 3, y: r.y + r.height / 2 }; })()`);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: farBox.x, y: farBox.y, button: "right", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: farBox.x, y: farBox.y, button: "right", clickCount: 1 });
  await until("!!document.querySelector('.menu .menu-item')", "the menu of a site of the second computer opens");
  assert((await page("[...document.querySelectorAll('.menu .menu-item')].map((e) => e.textContent).join()")) === "Rename,Star,Change icon,Delete", "a site has Rename, Star, Change icon and Delete");
  await click(".menu .menu-item", "Star");
  const savedThere = () => JSON.parse(readFileSync(join(CONFIG2, "canvas", "state.json"), "utf8")).sites?.[farName]?.saved;
  for (let i = 0; i < 60 && !(await Promise.resolve().then(savedThere).catch(() => false)); i++) await Bun.sleep(250);
  assert(await Promise.resolve().then(savedThere).catch(() => false), `Star on a site of the second computer goes to its own bridge (${farName})`);
  assert(!JSON.parse(readFileSync(join(CONFIG, "canvas", "state.json"), "utf8")).sites?.[farName]?.saved, "the computer in use keeps that site unsaved");

  // 1f. A full swipe to the left archives an app at once, and the loads after it do not bring it back.
  const rowOf = (id: string) => `document.querySelector('.app-row[data-id="${id}"]')`;
  const swipeLeft = async (id: string) => {
    const b = await page(`(() => { const r = ${rowOf(id)}; r.scrollIntoView({ block: "center" }); const b = r.getBoundingClientRect(); return { x: b.right - 30, y: b.top + b.height / 2, w: b.width }; })()`);
    await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x, y: b.y }] });
    for (let dx = 15; dx <= b.w * 0.75; dx += 15) await cdp("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: b.x - dx, y: b.y }] });
    await shot("1f-swipe.png");
    await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const weatherId = `page/${first.id}`;
  await swipeLeft(weatherId);
  await until(`!${rowOf(weatherId)}`, "a full swipe takes the app away", 2000);
  await Bun.sleep(7000);
  await shot("1g-archived.png");
  assert(!(await page(`!!${rowOf(weatherId)}`)), "the archived app stays in the archive after the next loads");
  assert((await fetch(`http://127.0.0.1:${PORT}/canvas?all`).then((r) => r.json())).find((a: { id: string }) => a.id === first.id)?.archived, "the bridge archived the app");
  assert((await tool("undo", {})).app === "Paris vs Dubai", "undo brings it back");
  await until(`!!${rowOf(weatherId)}`, "the app is back after the undo", 15_000);

  // 1h. An archive that fails puts the row back, with the reason.
  const { chmodSync } = await import("node:fs");
  chmodSync(join(CONFIG, "canvas"), 0o555);
  chmodSync(join(CONFIG, "canvas", "state.json"), 0o444);
  await swipeLeft(weatherId);
  await until(`!${rowOf(weatherId)}`, "the row goes at once, also when the archive fails later", 2000);
  await until(`!!${rowOf(weatherId)} && !!document.querySelector('.toast')`, "a failed archive puts the row back, with the reason", 15_000);
  await shot("1h-failed.png");
  chmodSync(join(CONFIG, "canvas", "state.json"), 0o644);
  chmodSync(join(CONFIG, "canvas"), 0o755);
  await page("document.querySelector('.toast')?.click(), true");
  await until("!document.querySelector('.toast')", "a tap closes the reason");

  // 1k. The grid: the button at the top changes the view, and each device keeps it (appsView). A long press on an icon
  // opens the same menu. From the archive, Restore brings an app back, and Delete forever removes it after a yes.
  await click("button[data-native='apps-view']");
  await until("document.querySelectorAll('.app-grid .app-tile').length > 1 && localStorage.getItem('appsView') === 'grid'", "the button shows the apps as a grid, and the device keeps it");
  await shot("1k-grid.png");
  const tileMenu = async (title: string) => {
    const tile = `[...document.querySelectorAll('.app-tile')].find((e) => e.textContent.includes(${JSON.stringify(title)}))`;
    await page(`${tile}.scrollIntoView({ block: "center" }), true`);
    await Bun.sleep(600);
    const box = await page(`(() => { const r = ${tile}.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 3 }; })()`);
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "right", clickCount: 1 });
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "right", clickCount: 1 });
    await until("!!document.querySelector('.menu .menu-item')", "the menu of an icon opens");
  };
  await tileMenu("Paris");
  assert((await page("[...document.querySelectorAll('.menu .menu-item')].map((e) => e.textContent).join()")) === "Rename,Star,Change icon,Rebuild,Archive,Delete", "an icon has the same menu");
  await shot("1k-grid-menu.png");
  await click(".menu .menu-item", "Archive");
  await until(`!document.querySelector('.app-tile[data-id="${weatherId}"]') && !!document.querySelector('.archived-title')`, "Archive on an icon moves it to the archive");
  await click(".archived-title");
  await until(`!!document.querySelector('.app-tile[data-id="${weatherId}"]')`, "the archive shows its icons");
  await shot("1k-grid-archived.png");
  await tileMenu("Paris");
  assert((await page("[...document.querySelectorAll('.menu .menu-item')].map((e) => e.textContent).join()")) === "Restore,Delete forever", "an app in the archive has Restore and Delete forever");
  await click(".menu .menu-item", "Restore");
  await until(`!!document.querySelector('.app-tile[data-id="${weatherId}"]') && !document.querySelector('.archived-title')`, "Restore brings the app back at once");
  for (let i = 0; i < 40 && (await archivedNow()) !== 0; i++) await Bun.sleep(250);
  // A delete forever: the app of the call goes to the archive, then away with its files after the yes.
  const callApp = (await fetch(`http://127.0.0.1:${PORT}/canvas?all`).then((r) => r.json())).find((a: { title: string }) => a.title === "What we're building");
  await tool("remove_app", { app: callApp.id });
  await until("!!document.querySelector('.archived-title')", "an archive from the voice shows in the Canvas tab", 15_000);
  await page("document.querySelector('.archived-title.open') || document.querySelector('.archived-title').click(), window.confirm = () => true, true");
  await tileMenu("What we");
  await click(".menu .menu-item", "Delete forever");
  await until(`!document.querySelector('.app-tile[data-id="page/${callApp.id}"]') && !document.querySelector('.archived-title')`, "Delete forever takes the app away after the yes");
  for (let i = 0; i < 40 && (await fetch(`http://127.0.0.1:${PORT}/canvas?all`).then((r) => r.json())).length !== 1; i++) await Bun.sleep(250);
  assert(!existsSync(join(CONFIG, "canvas", callApp.id)) && (await fetch(`http://127.0.0.1:${PORT}/canvas?all`).then((r) => r.json())).length === 1, "the bridge deleted the app and its files");
  assert((await tool("undo", {})).app === "What we're building", "undo brings the deleted app back");
  // The archive shows in the pictures of each theme. There is no step 1i.
  await tool("remove_app", { app: callApp.id });
  await page("localStorage.setItem('appsView', 'list'), true");

  // 1j. The Canvas tab in each theme of the default screen, in the light and the dark look, as a list and as a grid with
  // the archive open.
  for (const view of ["list", "grid"])
  for (const ui of ["yonder", "big", "terminal", "playful"])
    for (const theme of ["light", "dark"]) {
      await page(`localStorage.setItem('ui', ${JSON.stringify(ui)}), localStorage.setItem('theme', ${JSON.stringify(theme)}), localStorage.setItem('appsView', ${JSON.stringify(view)}), true`);
      await cdp("Page.reload");
      await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", `the app shows in ${ui} ${theme}`);
      // A theme can hide the Canvas tab, as Big button does.
      await Bun.sleep(1500);
      if (!(await page("[...document.querySelectorAll('[role=tab]')].some((e) => /canvas/i.test(e.textContent))"))) {
        console.log(`theme ${ui}: no Canvas tab`);
        continue;
      }
      // A tap right after the load can come before the app is ready, so it taps again until the apps show.
      await until(`(() => { [...document.querySelectorAll('[role=tab]')].find((e) => /canvas/i.test(e.textContent))?.click(); return document.querySelectorAll(${JSON.stringify(view === "grid" ? ".app-tile" : ".app-row")}).length > 0; })()`, `the Canvas tab shows in ${ui} ${theme} as a ${view}`);
      // The grid shows the end of the list, with the archive open: the test bridge also lists each dev server of this Mac.
      if (view === "grid") await page("document.querySelector('.archived-title:not(.open)')?.click(), true");
      await Bun.sleep(600);
      await page(`(() => { const l = document.querySelector('.list.apps'); l.style.scrollBehavior = 'auto'; l.scrollTop = ${view === "grid" ? "l.scrollHeight" : "0"}; return true })()`);
      await Bun.sleep(300);
      await shot(`theme-${ui}-${theme}-${view}.png`);
    }
  await tool("change_app", { app: callApp.id, archived: false });
  await page("localStorage.removeItem('ui'), localStorage.setItem('theme', 'dark'), localStorage.setItem('appsView', 'list'), true");
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", "the app shows in the default look");
  await until("(() => { [...document.querySelectorAll('[role=tab]')].find((e) => /canvas/i.test(e.textContent))?.click(); return document.querySelectorAll('.app-row').length > 1; })()", "the Canvas tab shows again");

  // 1l. The search stays at the top of the list while it scrolls, and the page keeps its height: the tab bar does not
  // move, and it stays over the safe area at the bottom. The search must not push the tab bar under the corners of the
  // iPhone.
  // The top of the bar, the bottom of its tabs, the height of the page and of the window. A flat bar, as in Terminal,
  // fills the space of the home bar, so its tabs, not its box, end over the safe area.
  const bar = "(() => { const r = document.querySelector('.tablist').getBoundingClientRect(); const tabs = Math.max(...[...document.querySelectorAll('.tablist [role=tab]')].map((t) => t.getBoundingClientRect().bottom)); return [Math.round(r.top), Math.round(tabs), document.scrollingElement.scrollHeight, innerHeight].join() })()";
  for (const [w, h] of [[320, 568], [375, 812]])
    for (const ui of ["yonder", "terminal", "playful"])
      for (const theme of ["light", "dark"]) {
        const where = `${ui} ${theme} at ${w} pt`;
        await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
        await page(`localStorage.setItem('ui', ${JSON.stringify(ui)}), localStorage.setItem('theme', ${JSON.stringify(theme)}), true`);
        await cdp("Page.reload");
        await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", `the app shows in ${where}`);
        await Bun.sleep(1500);
        await until("(() => { [...document.querySelectorAll('[role=tab]')].find((e) => /canvas/i.test(e.textContent))?.click(); return document.querySelectorAll('.app-row').length > 1; })()", `the Canvas tab shows in ${where}`);
        await Bun.sleep(800);
        const before = await page(bar);
        const stays = await page("(() => { const l = document.querySelector('.list.apps'); l.style.scrollBehavior = 'auto'; l.scrollTop = l.scrollHeight; const s = l.querySelector('.search-wrap').getBoundingClientRect().top - l.getBoundingClientRect().top; return Math.abs(s) < 2; })()");
        await Bun.sleep(400);
        const after = await page(bar);
        const [top, bottom, height, inner] = after.split(",").map(Number);
        await shot(`search-${ui}-${theme}-${w}.png`);
        assert(stays, `the search stays at the top of the list in ${where}`);
        assert(after === before && height <= inner && bottom <= inner - 34, `the search moves no tab bar in ${where} (${before} → ${after})`);
        assert(top > 0, `the tab bar shows in ${where}`);
        await page("document.querySelector('.list.apps').scrollTop = 0, true");
      }
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
  await page("localStorage.removeItem('ui'), localStorage.setItem('theme', 'dark'), true");
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", "the app shows at 402 pt");
  await until("(() => { [...document.querySelectorAll('[role=tab]')].find((e) => /canvas/i.test(e.textContent))?.click(); return document.querySelectorAll('.app-row').length > 1; })()", "the Canvas tab shows at 402 pt");

  // 2. A payment: the sheet shows the host of its page, and Pay opens the page, where the user pays. No Face ID in Yonder.
  const payLink = "https://checkout.stripe.com/c/pay/cs_test_a1";
  const pay = tool("ask_user", { kind: "pay", title: "Top up Visual Sandbox", amount: "$20.00", text: "Adds credit for the videos of this task. You pay on the page of Stripe.", link: payLink, rows: [["Shop", "Visual Sandbox"], ["Item", "Credit"]] });
  await until("!!document.querySelector('.approval .approval-amount')", "the sheet of the payment shows");
  await shot("2-pay.png");
  assert(await page("document.querySelector('.approval-yes').textContent") === "Pay on checkout.stripe.com", "Pay names the host of the page");
  await click(".approval-yes");
  assert((await pay).answer === "yes" && (await page("window.__opened")) === payLink && (await page("window.__faceIds")) === 0, "Pay opens the page of the payment, with no Face ID in Yonder");

  // 3. A code from Messages.
  const code = tool("ask_user", { kind: "code", title: "Code for GitHub", text: "GitHub sent a code to your phone. Agent 12 types it on the sign-in page in your Chrome." });
  await until("!!document.querySelector('.approval-code')", "the sheet of the code shows");
  await page("document.querySelector('.approval-code').focus()");
  await cdp("Input.insertText", { text: "482913" });
  await shot("3-code.png");
  await click(".approval-yes");
  const got = await code;
  assert(got.answer === "yes" && got.value === "482913", "the code goes to the agent");

  // 4. Terms: a swipe puts the sheet aside, "Needs you" keeps it, and Review shows it again.
  const terms = tool("ask_user", { kind: "terms", title: "Paid Apps Agreement", text: "Agent 12 clicks Agree in App Store Connect after your yes.", link: "https://developer.apple.com/support/terms/", rows: [["From", "Apple"], ["Account", "Sam Lee"]] });
  await until("!!document.querySelector('.approval-link')", "the sheet of the terms shows");
  await shot("4-terms.png");
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until("!document.querySelector('.approval') && !!document.querySelector('.ask-row')", "the terms wait in Needs you");
  await shot("5-needs-you.png");
  await click(".ask-row button", "Review");
  await until("!!document.querySelector('.approval-link')", "Review shows the sheet again");
  await click(".approval-no", "Deny");
  assert((await terms).answer === "no", "Deny goes to the agent");

  // 4b. 1Password: the same card, with no Face ID, and the key of this phone.
  const token = await page(`(async () => { const B = await import('/src/bridge.ts'); const r = await B.bridgeFetch('/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'ops_FAKE_TOKEN' }) }); return r.status })()`);
  assert(token === 200, "the phone connects the 1Password of the test");
  const faces = await page("window.__faceIds");
  const secret = tool("use_secret", { why: "Publish the release", run: 'test -n "$GH" && echo set', env: { GH: "op://Agent/GitHub/token" }, minutes: 0 });
  await until("[...document.querySelectorAll('.approval-title')].some((e) => e.textContent === 'GitHub')", "the card of 1Password is the approval card");
  await shot("9-1password.png");
  await click(".approval-yes");
  assert((await secret).output === "set" && (await page("window.__faceIds")) === faces, "a tap with no Face ID approves 1Password");

  // 5. The chat of agent 12, with its page where it made it, and its Canvas view.
  await click("[role=tab]", "Done");
  await until("[...document.querySelectorAll('.worker.row')].some((r) => r.textContent.includes('Weather'))", "agent 12 is on the Done tab");
  await click(".worker.row", "Weather");
  await until("[...document.querySelectorAll('.convo-tabs [role=tab]')].some((t) => t.textContent === 'Canvas')", "the agent has a Canvas view, with no count");
  await click(".convo-tabs [role=tab]", "Context");
  await until("[...document.querySelectorAll('.convo-panel:not([hidden]) .artifact-card img')].some((i) => i.complete && i.naturalWidth > 0) && !document.querySelector('iframe')", "the chat shows a still of the page in place, and no live page");
  await shot("6-agent-chat.png");
  await click(".convo-tabs [role=tab]", "Canvas");
  await shot("7-agent-app.png");
  await click(".artifact-card .link", "Open");
  await until("!!document.querySelector('.artifact-viewer iframe') && !!document.querySelector('.viewer-pin')", "Open shows the page at full screen, with Save");
  await shot("8-viewer.png");
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until("!document.querySelector('.artifact-viewer')", "the viewer closes");

  // 6. Grok makes a page in a call: the result opens it at once, through the relay.
  await page(`(async () => { const B = await import('/src/bridge.ts'); const C = await import('/src/Canvas.tsx'); C.showArtifact(JSON.parse(await B.callTool('show_app', { title: 'Probe', html: ${JSON.stringify(PROBE)}, call: '7' }))); window.__probe = new Promise((r) => addEventListener('message', (e) => e.data?.probe && r(e.data.probe))); return true })()`);
  const probe = await page("window.__probe");
  assert(probe.parentDocument === "blocked" && probe.parentTauri === "blocked", `a page cannot read the app (${JSON.stringify(probe)})`);
  assert(probe.storage === "blocked" && probe.bridge === "blocked", "a page has no storage and cannot call the bridge");

  // 1Password writes its own lines (kind secret) into the same log.
  const log = readFileSync(join(CONFIG, "approvals.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((l) => l.kind !== "secret");
  assert(log.map((l) => `${l.kind} ${l.answer}`).join(", ") === "pay yes, code yes, terms no" && !JSON.stringify(log).includes("482913"), "approvals.jsonl has each answer, and no code");
  assert(log[0].faceId === false && typeof log[0].device === "string" && log[0].device.length > 0, "the log names the phone, and a payment has no Face ID in Yonder");
  console.log(`shots: ${SHOTS}`);
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  if (!process.env.KEEP) rmSync(join(TMP, "home"), { recursive: true, force: true });
}
// The socket of the relay keeps the process alive.
process.exit(0);
