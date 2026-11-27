// The end-to-end check of `agentNaming` on the screen: `bun bridge/names-e2e.ts`. It needs the network (relay.yonder.so)
// and Chrome for Testing, so GitHub does not run it. It uses no credits: a test bridge with fake agents, and a phone page in
// headless Chrome that pairs through the relay. It shows the Tasks, Done and Closed tabs and a header with the numbers,
// then with the names, also in the Terminal and Dashboard samples, and checks that `label` of yonder.mice.list() has the
// name. The Summaries are off, so no Haiku runs. The screenshots go to the shots folder that it prints.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-names-e2e-"));
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

// Five agents in two projects, and two closed ones: Jack (1), Emma (2), Leo (3), Ruby (4) and Oscar (5).
const now = Date.now();
const AGENTS = [
  [1, "Fix tab bar", "yonder", "waiting"],
  [2, "Hero copy", "landing", "done"],
  [3, "Push notifications", "yonder", "done"],
  [4, "Price table", "landing", "failed"],
  [5, "Old search", "yonder", "closed"],
  [0, "First draft", "landing", "closed"],
] as const;
const workers = AGENTS.map(([num, name, project, status], i) => {
  const path = join(TMP, project);
  mkdirSync(path, { recursive: true });
  const sessionId = `00000000-0000-4000-8000-00000000000${i}`;
  const transcript = join(HOME, ".claude", "projects", path.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(transcript, { recursive: true });
  const at = new Date(now - 60_000).toISOString();
  writeFileSync(
    join(transcript, `${sessionId}.jsonl`),
    [
      { type: "user", timestamp: at, message: { role: "user", content: name } },
      { type: "assistant", timestamp: at, message: { role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: `${name} is done.` }] } },
    ].map((e) => JSON.stringify({ ...e, sessionId, cwd: path })).join("\n") + "\n",
  );
  return { id: `w${i}`, num, sessionId, name, project, path, task: name, status, activity: "", result: `${name} is done.`, unread: false, startedAt: now - 60_000, updatedAt: now - i * 60_000 };
});
writeFileSync(join(CONFIG, "state.json"), JSON.stringify({ workers }));
const naming = (agentNaming: string) => writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ agentName: { one: "task", many: "tasks" }, agentNaming, sumUp: false }));
naming("numbers");

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
  const { connectRelay } = await import(join(WT, "bridge/relay.ts"));
  const relay = connectRelay("wss://relay.yonder.so", CONFIG, process.env.APNS_TEAM_ID ?? "", (req: Request) => {
    const u = new URL(req.url);
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
  const tab = (name: string) => page(`(() => { const t = [...document.querySelectorAll('[role=tab]')].find((e) => e.textContent.toLowerCase().includes(${JSON.stringify(name)})); t?.click(); return !!t; })()`);
  const badges = () => page(`[...document.querySelectorAll('.worker.row .badge')].map((b) => b.textContent).sort().join()`);
  const load = async (ui = "") => {
    await page(`(localStorage.setItem('ui', ${JSON.stringify(ui)}), true)`);
    await cdp("Page.reload");
    await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", "the paired app shows");
    await Bun.sleep(1500);
  };
  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
  await cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: 62, bottom: 34 } });
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until("document.readyState === 'complete'", "the page loads");
  await page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); localStorage.setItem('theme', 'light'); return true })()`);

  for (const mode of ["numbers", "names"] as const) {
    naming(mode);
    await load();
    await tab("done");
    await until("document.querySelectorAll('.worker.row').length >= 4", `the Done tab shows the tasks (${mode})`);
    const want = mode === "numbers" ? "#1,#2,#3,#4" : "Emma,Jack,Leo,Ruby";
    assert((await badges()) === want, `the rows show ${want} (${await badges()})`);
    await shot(`${mode}-1-done.png`);
    await tab("closed");
    await until("[...document.querySelectorAll('.worker.row')].some((r) => r.textContent.includes('Old search'))", `the Closed tab shows the closed tasks (${mode})`);
    await shot(`${mode}-2-closed.png`);
    await tab("done");
    await until("document.querySelectorAll('.worker.row').length >= 4", "back on the Done tab");
    await click(".worker.row", "Hero copy");
    await until("!!document.querySelector('.convo-head .name')", "the task opens");
    const head = await page("document.querySelector('.convo-head .name').textContent");
    assert(head === (mode === "numbers" ? "#2 Hero copy" : "Emma · Hero copy"), `the header is ${head}`);
    await shot(`${mode}-3-header.png`);
    const labels = await page(`import('/src/api.ts').then(({ yonder }) => yonder.mice.list()).then((l) => l.map((m) => m.label).sort().join())`);
    assert(labels === (mode === "numbers" ? "1,2,3,4" : "Emma,Jack,Leo,Ruby"), `yonder.mice.list() gives the label ${labels}`);
  }
  // The names in two samples: Terminal is a style of the default screen, Dashboard a page in a frame with the kit.
  await load("terminal");
  await tab("done");
  await until("document.querySelectorAll('.worker.row').length >= 4", "Terminal shows the tasks");
  assert((await badges()) === "Emma,Jack,Leo,Ruby", "Terminal shows the names");
  await shot("names-4-terminal.png");
  await load("dashboard");
  await until("!!document.querySelector('iframe')", "the Dashboard frame shows");
  await shot("names-5-dashboard.png");
  console.log(`\nAll checks passed. The shots: ${SHOTS}`);
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  rmSync(HOME, { recursive: true, force: true });
}
