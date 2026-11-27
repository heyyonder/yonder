// The end-to-end check of the Saved tab: `bun bridge/saved-e2e.ts`. It needs the network (relay.yonder.so) and Google
// Chrome, so GitHub does not run it. It uses no credits: a test bridge with four fake agents, a phone page in headless
// Chrome that pairs through the relay, and a Mac page whose calls to the bridge go to the test bridge. The screenshots go
// to the shots folder that it prints.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-saved-e2e-"));
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
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });

const procs = [chrome, bridge, vite];
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

  // 1. The phone: six tabs, the saved agent on the Saved tab, and Save for later from the menu of a row.
  const phone = await open();
  await phone.cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await phone.cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
  await phone.cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: 62, bottom: 34 } });
  await phone.cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await phone.until("document.readyState === 'complete'", "the page loads");
  await phone.page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); return true })()`);
  await phone.cdp("Page.reload");
  await phone.until("document.querySelectorAll('[role=tab]').length >= 6", "the paired app shows its tabs");
  const tabs = await phone.page("[...document.querySelectorAll('[role=tab]')].map((t) => t.textContent.trim()).join()");
  assert(/Done,.*Saved,Closed/.test(tabs), `the tab bar has Saved after Done (${tabs})`);
  const fits = await phone.page("[...document.querySelectorAll('[role=tab] span')].every((s) => s.scrollWidth <= s.clientWidth + 1)");
  assert(fits, "each name of the six tabs fits in its tab");
  await phone.click("[role=tab]", "Saved");
  await phone.until(`${phone.rows} === 'Try a new mega menu'`, "the Saved tab shows the saved agent");
  await phone.shot("1-phone-saved.png");
  await phone.click("[role=tab]", "Done");
  await phone.until(`${phone.rows}.includes('Add Apple Pay')`, "the Done tab shows the other agents");
  await phone.menu("Add Apple Pay");
  const items = await phone.page("[...document.querySelectorAll('.menu .menu-item')].map((e) => e.textContent).join()");
  assert(items === "Save for later,Copy Link,Close,Delete", `the menu of a row has Save for later (${items})`);
  await phone.shot("2-phone-menu.png");
  await phone.click(".menu .menu-item", "Save for later");
  await phone.until(`!${phone.rows}.includes('Add Apple Pay')`, "Save for later takes the agent off the Done tab at once");
  for (let i = 0; i < 40 && !(await workers()).w2?.saved; i++) await Bun.sleep(250);
  assert((await workers()).w2?.saved, "the bridge keeps the save");
  await phone.click("[role=tab]", "Saved");
  await phone.until(`${phone.rows}.includes('Add Apple Pay')`, "the agent shows on the Saved tab");
  await phone.shot("3-phone-saved-two.png");

  // 2. The Mac: the bookmark of a saved agent puts it back on the Done tab.
  const mac = await open();
  await mac.cdp("Emulation.setDeviceMetricsOverride", { width: 1100, height: 760, deviceScaleFactor: 2, mobile: false });
  await mac.cdp("Fetch.enable", { patterns: [{ urlPattern: "http://127.0.0.1:7787/*" }] });
  mac.events.push((d) => d.method === "Fetch.requestPaused" && void mac.cdp("Fetch.continueRequest", { requestId: d.params.requestId, url: d.params.request.url.replace(":7787", `:${PORT}`) }).catch(() => {}));
  await mac.cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await mac.until("document.readyState === 'complete'", "the Mac page loads");
  await Bun.sleep(1500);
  await mac.click("button", "Skip");
  await mac.until("[...document.querySelectorAll('[role=tab]')].some((t) => t.textContent.includes('Saved'))", "the Mac shows the Saved tab");
  await mac.click("[role=tab]", "Saved");
  await mac.until(`${mac.rows}.includes('Try a new mega menu')`, "the Mac shows the saved agents");
  await mac.shot("4-mac-saved.png");
  await mac.click(".worker.row", "Try a new mega menu");
  await mac.until("!!document.querySelector('button[title=Unsave]')", "a saved agent has the bookmark to unsave it");
  await mac.shot("5-mac-open.png");
  await mac.click("button[title=Unsave]");
  for (let i = 0; i < 40 && (await workers()).w3?.saved; i++) await Bun.sleep(250);
  assert(!(await workers()).w3?.saved, "the bookmark puts the agent back on the Done tab");
  await mac.until(`!${mac.rows}.includes('Try a new mega menu')`, "the agent leaves the Saved tab");
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
}
process.exit(0);
