// The end-to-end check that an open agent stays open: `bun bridge/stay-e2e.ts [Done|Saved] [name] [phone]`. A message
// to a done or saved agent wakes it, and the chat stays open. A new start of the app, as when iOS ends it in the
// background, opens the same chat again. It needs the network (relay.yonder.so) and Google Chrome, so GitHub does not run
// it. It uses no credits: the page fakes the run of the agent. The phone page runs dist/, the screen of the last build.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-stay-"));
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
const PROJECT = join(TMP, "shop");
mkdirSync(CONFIG, { recursive: true });
mkdirSync(PROJECT, { recursive: true });
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.
// Agent 3 is saved already. Agents 1 and 2 are on the Done tab, and agent 4 waits on the user.
const now = Date.now();
const agent = (num: number, name: string, status: string, more = {}) => ({ id: `w${num}`, num, sessionId: `00000000-0000-4000-8000-00000000000${num}`, name, project: "shop", path: PROJECT, task: name, status, activity: "", result: "Done.", unread: false, startedAt: now - num * 600_000, updatedAt: now - num * 60_000, ...more });
writeFileSync(
  join(CONFIG, "state.json"),
  JSON.stringify({ workers: [agent(1, "Fix the cart badge", "done"), agent(2, "Add Apple Pay", "done"), agent(3, "Try a new mega menu", "done", { saved: true }), agent(4, "Pick a payment token", "waiting")] }),
);
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ sumUp: false }));

const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--no-first-run", "--no-default-browser-check", "--use-mock-keychain", "--password-store=basic", "about:blank"], { stdout: "ignore", stderr: "ignore" });
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env: { ...process.env, HOME, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK }, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
// The Mac page reaches the bridge only from this port (ORIGINS in bridge/main.ts).
const vitePort = 1420;

// The vite of the Mac app, when it does not run already.
const vite = (await fetch(`http://localhost:${vitePort}/`).then(() => true, () => false)) ? undefined : Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });
const procs = [chrome, bridge, ...(vite ? [vite] : [])];
try {
  for (let i = 0; i < 300; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/canvas`).then(() => true, () => false), fetch(`http://localhost:${vitePort}/`).then(() => true, () => false), fetch(`http://127.0.0.1:${chromePort}/json/version`).then(() => true, () => false)]);
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
  const client = new Client({ name: "saved-e2e", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`)));
  const workers = async () => {
    const r = await client.callTool({ name: "list_workers", arguments: { full: true } });
    const list = JSON.parse((r.content as { text: string }[]).map((c) => c.text).join("")) as { id: string; saved?: boolean }[];
    return Object.fromEntries(list.map((w) => [w.id, w]));
  };

  // One CDP connection to a page.
  const open = async () => {
    const t = (await (await fetch(`http://127.0.0.1:${chromePort}/json/new?about:blank`, { method: "PUT" })).json()) as { webSocketDebuggerUrl: string };
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const waits = new Map<number, (d: any) => void>();
    const events: ((d: any) => void)[] = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(String(m.data));
      if (d.id) waits.get(d.id)?.(d), waits.delete(d.id);
      else events.forEach((f) => f(d));
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
      await Bun.sleep(700);
      const { data } = await cdp("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
      console.log(`shot: ${join(SHOTS, name)}`);
    };
    const until = async (expression: string, what: string, ms = 40_000) => {
      for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(250)) if (await page(expression).catch(() => false)) return;
      await shot("failed.png");
      throw new Error(`FAIL: timed out: ${what}`);
    };
    const click = (selector: string, text = "") =>
      page(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); e?.click(); return !!e; })()`);
    // A right-click on the row of an agent opens its menu.
    const menu = async (name: string) => {
      const box = await page(`(() => { const r = [...document.querySelectorAll('.worker.row')].find((e) => e.textContent.includes(${JSON.stringify(name)})).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "right", clickCount: 1 });
      await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "right", clickCount: 1 });
      await until("!!document.querySelector('.menu .menu-item')", "the menu of a row opens");
    };
    const rows = `[...document.querySelectorAll('[role=tabpanel]:not([hidden]) .worker.row .name')].map((e) => e.textContent).join()`;
    await cdp("Page.enable");
    await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
    return { cdp, page, shot, until, click, menu, rows, events };
  };

  const TAB = process.argv[2] ?? "Done", NAME = process.argv[3] ?? "Add Apple Pay", ID = NAME === "Add Apple Pay" ? "w2" : "w3", PHONE = process.argv[4] === "phone";
  // The page fakes the run: from the send on (window.__woke), each answer of the bridge shows the agent as running.
  const fake = `(() => {
    const swap = (t) => window.__woke ? t.replace(/(\\\\"id\\\\":\\\\"${ID}\\\\"[^}]*?\\\\"status\\\\":\\\\")(done|waiting)/, "$1running") : t;
    const R = window.Response;
    window.Response = class extends R {
      constructor(body, init) {
        if (window.__woke && body instanceof Uint8Array) body = new TextEncoder().encode(swap(new TextDecoder().decode(body)));
        super(body, init);
      }
    };
    const real = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const body = typeof init?.body === "string" ? init.body : "";
      if (body.includes('"message_worker"')) {
        const id = JSON.parse(body).id;
        return new R(JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "{}" }] } }), { headers: { "content-type": "application/json" } });
      }
      const r = await real(input, init);
      if (!window.__woke || !body.includes('"list_workers"')) return r;
      return new R(swap(await r.text()), { status: r.status, headers: r.headers });
    };
  })()`;
  const mac = await open();
  await mac.cdp("Page.addScriptToEvaluateOnNewDocument", { source: fake });
  if (PHONE) {
    await mac.cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
    await mac.cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
    await mac.cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
    await mac.until("document.readyState === 'complete'", "the page loads");
    await mac.page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); return true })()`);
    await mac.cdp("Page.reload");
    await mac.until("document.querySelectorAll('[role=tab]').length >= 6", "the paired app shows its tabs");
  } else {
    await mac.cdp("Emulation.setDeviceMetricsOverride", { width: 1100, height: 760, deviceScaleFactor: 2, mobile: false });
    await mac.cdp("Fetch.enable", { patterns: [{ urlPattern: "http://127.0.0.1:7787/*" }] });
    mac.events.push((d) => d.method === "Fetch.requestPaused" && void mac.cdp("Fetch.continueRequest", { requestId: d.params.requestId, url: d.params.request.url.replace(":7787", `:${PORT}`) }).catch(() => {}));
    await mac.cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
    await mac.until("document.readyState === 'complete'", "the Mac page loads");
    for (const b of ["Skip", "Later", "Skip"]) await Bun.sleep(800), await mac.click("button", b);
  }
  await mac.until(`[...document.querySelectorAll('[role=tab]')].some((t) => t.textContent.includes('${TAB}'))`, "tabs");
  await mac.click("[role=tab]", TAB);
  await mac.until(`${mac.rows}.includes('${NAME}')`, "row shows");
  await mac.click(".worker.row", NAME);
  await mac.until("!!document.querySelector('.prompt textarea')", "convo opens");
  await mac.shot("1-open.png");
  await mac.page("window.__woke = true");
  await mac.page(`(() => { const t = document.querySelector('.prompt textarea'); t.focus(); return true })()`);
  await mac.cdp("Input.insertText", { text: "hello there" });
  await Bun.sleep(300);
  await mac.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await mac.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  for (let i = 0; i < 12; i++, await Bun.sleep(500)) assert(await mac.page("!!document.querySelector('.prompt textarea')"), `the chat stays open after the send (${i})`);
  await mac.shot("2-after-send.png");
  // A new start of the app, as when iOS ends it in the background: the same agent opens again.
  await mac.cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await mac.until("!!document.querySelector('.prompt textarea')", "a new start opens the same chat again");
  assert((await mac.page("document.body.innerText")).includes(NAME), `the chat of ${NAME} is open after a new start`);
  await mac.shot("3-after-start.png");
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
}
process.exit(0);
