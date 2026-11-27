// The end-to-end check of the project switcher: `bun bridge/switcher-e2e.ts`. It needs the network (relay.yonder.so) and
// Chrome for Testing, so GitHub does not run it. It uses no credits: a test bridge with fake agents and projects, and a phone
// page in headless Chrome that pairs through the relay. In each sample (the styles Yonder, Terminal, Omarchy, Big button and
// Playful, and the page Dashboard), in the light and the dark look, at 320 and 375 pt, it taps the pill of the
// project, checks that the full page of the projects opens (All projects, the starred projects, then the others) with no
// empty box for a project with no favicon, picks a project, and checks that the pill shows it. The screenshots go to the
// shots folder that it prints.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-switcher-e2e-"));
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
mkdirSync(CONFIG, { recursive: true });
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.

// Four projects: two starred (landing with a favicon, time with none), and two others (nova-studio-website, a long
// name with a favicon, and notes with none). One agent in landing and one in nova-studio-website.
const SVG = (color: string, letter: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><rect width="18" height="18" rx="4" fill="${color}"/><text x="9" y="13" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="sans-serif">${letter}</text></svg>`;
const dir = (name: string, icon?: string) => {
  const path = join(TMP, name);
  mkdirSync(path, { recursive: true });
  if (icon) writeFileSync(join(path, "favicon.svg"), icon);
  return path;
};
const landing = dir("landing", SVG("#ff6b3d", "L"));
const time = dir("time");
const studio = dir("nova-studio-website", SVG("#7c4dd6", "S"));
const notes = dir("notes");
const now = Date.now();
const workers = [
  [1, "Hero copy", "landing", landing, "done"],
  [2, "Price table", "nova-studio-website", studio, "done"],
].map(([num, name, project, path, status], i) => ({ id: `w${i}`, num, sessionId: `00000000-0000-4000-8000-00000000000${i}`, name, project, path, task: name, status, activity: "", result: "Done.", unread: false, startedAt: now - 60_000, updatedAt: now - i * 60_000 }));
writeFileSync(join(CONFIG, "state.json"), JSON.stringify({ workers, extra: [landing, time, studio, notes], starred: [landing, time], scan: false }));
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ agentName: { one: "task", many: "tasks" }, sumUp: false }));

const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--use-mock-keychain", "--password-store=basic", "--disable-features=IsolateSandboxedIframes", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdout: "ignore", stderr: "ignore" });
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
  const page = async (expression: string, contextId?: number) => {
    const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, ...(contextId && { contextId }) });
    if (r.exceptionDetails) throw new Error(`page: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
    return r.result.value;
  };
  // An expression in the frame of the Dashboard sample. Its DOM events reach the page.
  const frame = async (expression: string) => {
    const { frameTree } = await cdp("Page.getFrameTree");
    const child = (frameTree.childFrames ?? []).find((f: any) => f.frame.url === "about:srcdoc");
    if (process.env.DEBUG) console.log(JSON.stringify((frameTree.childFrames ?? []).map((f: any) => f.frame.url)));
    if (!child) return undefined;
    const { executionContextId } = await cdp("Page.createIsolatedWorld", { frameId: child.frame.id, worldName: "e2e" });
    return page(expression, executionContextId);
  };
  const until = async (check: () => Promise<unknown>, what: string, ms = 40_000) => {
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(250)) if (await check().catch(() => false)) return console.log(`ok: ${what}`);
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, "failed.png"), Buffer.from(data, "base64"));
    throw new Error(`FAIL: timed out: ${what} (the screen: ${join(SHOTS, "failed.png")})`);
  };
  const shot = async (name: string) => {
    await Bun.sleep(600);
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
    console.log(`shot: ${join(SHOTS, name)}`);
  };
  const size = async (width: number, mode: string) => {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: Math.round(width * 2.17), deviceScaleFactor: 2, mobile: true });
    await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: mode }] });
  };
  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await size(375, "light");
  await cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: 59, bottom: 34 } });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until(() => page("document.readyState === 'complete'"), "the page loads");
  await page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); return true })()`);

  const load = async (ui: string, mode: string) => {
    await page(`(localStorage.setItem('ui', ${JSON.stringify(ui)}), localStorage.setItem('theme', ${JSON.stringify(mode)}), localStorage.removeItem('selected'), true)`);
    await cdp("Page.reload");
    await until(() => page("document.readyState === 'complete' && !!document.querySelector('[role=tab]')"), `${ui} ${mode} shows`);
    await Bun.sleep(1200);
  };
  const ORDER = "All projects,landing,time,nova-studio-website,notes";
  // UIS=terminal,dashboard runs only those samples.
  for (const ui of process.env.UIS?.split(",") ?? ["yonder", "terminal", "omarchy", "big", "playful", "dashboard"]) {
    for (const [mode, width] of [["light", 375], ["dark", 320], ["light", 320], ["dark", 375]] as const) {
      await size(width, mode);
      await load(ui, mode);
      const tag = `${ui}-${mode}-${width}`;
      if (ui === "dashboard") {
        await until(async () => !!(await frame("!!document.querySelector('y-projects .y-pill')")), `${tag}: the pill shows`);
        await frame("document.querySelector('y-projects .y-pill').click(), true");
        await until(async () => (await frame("document.querySelectorAll('.y-projects-page .y-prow').length")) >= 5, `${tag}: the projects page opens`);
        await until(async () => (await frame("document.querySelectorAll('.y-projects-page img:not([hidden])').length")) >= 2, `${tag}: the favicons load`);
        const rows = await frame("[...document.querySelectorAll('.y-projects-page .y-pname')].map((e) => e.textContent).join()");
        assert(rows === ORDER, `${tag}: All projects, then the starred, then the others (${rows})`);
        assert((await frame("document.querySelector('.y-prow.y-rest .y-pname')?.textContent")) === "nova-studio-website", `${tag}: a line goes over the first project that is not starred`);
        // No empty box: each shown favicon has a picture, and a project with none has no box at all.
        const empty = await frame("[...document.querySelectorAll('.y-projects-page .y-pick')].filter((b) => { const i = b.querySelector('img'); return i && !i.hidden && !i.src; }).length");
        assert(empty === 0, `${tag}: no empty favicon box`);
        await shot(`${tag}-open.png`);
        // The search keeps only the projects with the words.
        const found = await frame("(() => { const i = document.querySelector('.y-projects-page input'); i.value = 'no'; i.dispatchEvent(new Event('input')); return [...document.querySelectorAll('.y-projects-page .y-prow')].filter((r) => !r.hidden).map((r) => r.textContent).join(); })()");
        assert(found === "notes", `${tag}: the search finds notes (${found})`);
        await frame("(() => { const i = document.querySelector('.y-projects-page input'); i.value = ''; i.dispatchEvent(new Event('input')); return true; })()");
        if (mode === "light" && width === 375) {
          await frame("[...document.querySelectorAll('.y-projects-page .y-pick')].find((b) => b.textContent.includes('landing')).click(), true");
          await until(async () => (await frame("document.querySelector('y-projects .y-pill span')?.textContent")) === "landing" && !(await frame("!!document.querySelector('.y-projects-page')")), `${tag}: a pick closes the page and the pill shows landing`);
          await shot(`${tag}-picked.png`);
        }
      } else {
        await until(() => page("!!document.querySelector('.title .select')"), `${tag}: the pill shows`);
        if (mode === "light" && width === 375) await shot(`${tag}-closed.png`);
        await page("document.querySelector('.title .select').click(), true");
        await until(() => page("document.querySelectorAll('.projects li:not(.tools)').length >= 5"), `${tag}: the projects page opens`);
        const rows = await page("[...document.querySelectorAll('.projects li:not(.tools) .label')].map((e) => e.textContent).join()");
        assert(rows === ORDER, `${tag}: All projects, then the starred, then the others (${rows})`);
        assert(await page("document.querySelector('.projects li.rest .label')?.textContent === 'nova-studio-website'"), `${tag}: a line goes over the first project that is not starred`);
        await shot(`${tag}-open.png`);
        // A long name with a favicon ends with an ellipsis, and the two small arrows stay in the title.
        if (width === 320) {
          await page("[...document.querySelectorAll('.projects .pick')].find((b) => b.textContent.includes('nova-studio')).click(), true");
          await until(() => page("document.querySelector('.title .select span')?.textContent === 'nova-studio-website'"), `${tag}: a pick shows the long name`);
          const fits = await page("(() => { const t = document.querySelector('.title').getBoundingClientRect(), c = document.querySelector('.title .select svg').getBoundingClientRect(), n = document.querySelector('.title .select span'); return c.right <= t.right + 1 && c.width > 0 && n.scrollWidth >= n.clientWidth; })()");
          assert(fits, `${tag}: the long name fits with its arrows`);
          await shot(`${tag}-long.png`);
          continue;
        }
        if (mode === "light" && width === 375) {
          await page("[...document.querySelectorAll('.projects .pick')].find((b) => b.textContent.includes('landing')).click(), true");
          await until(() => page("document.querySelector('.title .select span')?.textContent === 'landing'"), `${tag}: a pick shows landing in the pill`);
          await shot(`${tag}-picked.png`);
        }
      }
    }
  }
  console.log(`\nAll checks passed. The shots: ${SHOTS}`);
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  rmSync(HOME, { recursive: true, force: true });
}
process.exit(0); // The socket of the relay keeps Bun open.
