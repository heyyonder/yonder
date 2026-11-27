// The end-to-end check of /btw, the side question: `bun bridge/btw-e2e.ts`. It needs the network (relay.yonder.so) and
// Chrome for Testing, so GitHub does not run it. It uses no credits: a stand-in `claude` answers, and a phone page in headless
// Chrome pairs through the relay. The screenshot goes to the shots folder that it prints.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-btw-e2e-"));
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
const PROJECT = join(TMP, "landing");
mkdirSync(CONFIG, { recursive: true });
mkdirSync(PROJECT, { recursive: true });
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.

// The stand-in `claude` writes each call into a log, lists no sessions, and answers each `-p` with one answer.
const BIN = join(TMP, "bin");
const CALLS = join(TMP, "claude-calls.log");
const ANSWER = "It runs on port **5173**, from `vite.config.ts`.";
mkdirSync(BIN);
writeFileSync(
  join(BIN, "claude"),
  `#!/bin/sh\necho "$*" >> '${CALLS}'\n[ "$1" = agents ] && echo '[]'\n[ "$1" = -p ] && echo '${JSON.stringify({ type: "result", is_error: false, result: ANSWER })}'\nexit 0\n`,
  { mode: 0o755 },
);

const SESSION = "00000000-0000-4000-8000-000000000007";
const now = Date.now();
writeFileSync(
  join(CONFIG, "state.json"),
  JSON.stringify({ workers: [{ id: "w7", num: 7, sessionId: SESSION, name: "Landing hero", project: "landing", path: PROJECT, task: "Change the hero", status: "done", activity: "", result: "Done.", unread: false, startedAt: now, updatedAt: now }] }),
);
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ sumUp: false, textUp: false }));
const transcript = join(HOME, ".claude", "projects", PROJECT.replace(/[^a-zA-Z0-9]/g, "-"));
mkdirSync(transcript, { recursive: true });
const events = [
  { type: "user", timestamp: new Date(now - 60_000).toISOString(), message: { role: "user", content: "Make the hero say Talk to your agents." } },
  { type: "assistant", timestamp: new Date(now - 50_000).toISOString(), message: { role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "The hero now says **Talk to your agents**." }] } },
];
writeFileSync(join(transcript, `${SESSION}.jsonl`), events.map((e) => JSON.stringify({ ...e, sessionId: SESSION, cwd: PROJECT })).join("\n") + "\n");

const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdout: "ignore", stderr: "ignore" });
const env = { ...process.env, HOME, PATH: `${BIN}:${process.env.PATH}`, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK };
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
  const click = (selector: string, text = "") =>
    page(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); e?.click(); return !!e; })()`);
  const type = async (text: string) => {
    await page("document.querySelector('.convo-foot textarea').focus()");
    await cdp("Input.insertText", { text });
  };
  const enter = async () => {
    for (const type of ["keyDown", "keyUp"]) await cdp("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  };
  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
  await cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: 62, bottom: 34 } });
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until("document.readyState === 'complete'", "the page loads");
  await page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); localStorage.setItem('theme', 'light'); localStorage.setItem('convoView', 'chat'); return true })()`);
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", "the paired app shows");
  await Bun.sleep(1500);
  await click("[role=tab]", "Done");
  await until("[...document.querySelectorAll('.worker.row')].some((r) => r.textContent.includes('Landing hero'))", "agent 7 is on the Done tab");
  await click(".worker.row", "Landing hero");
  await until("document.querySelectorAll('.convo > li').length > 0", "the conversation shows");

  // A bare /btw: the list of commands has it, and Enter on the whole name asks for the question.
  await type("/btw");
  await until("[...document.querySelectorAll('.commands li')].some((l) => l.textContent.includes('btw'))", "the list of commands has /btw");
  await enter();
  await until("document.querySelector('.send-error')?.textContent.includes('Write the question after /btw.')", "a bare /btw asks for the question");
  await until("document.querySelector('.convo-foot textarea').value === '/btw'", "the bare /btw goes back into the prompt box");

  await type(" What port does the dev server use?");
  await enter();
  await until("document.querySelector('.convo .side .assistant')?.textContent.includes('5173')", "the side answer shows at the end of the chat");
  assert(await page("document.querySelector('.convo .side > p').textContent === '/btw What port does the dev server use?'"), "the side card shows the question");
  assert(!(await page("[...document.querySelectorAll('.convo > .user')].some((u) => u.textContent.includes('/btw'))")), "the side question is not a sent message");
  const calls = readFileSync(CALLS, "utf8").split("\n");
  assert(calls.some((c) => c.startsWith(`-p --resume ${SESSION} --fork-session --no-session-persistence --tools  --strict-mcp-config`)), "a copy of the session with no tools answers, and saves nothing");
  assert(!calls.some((c) => c.startsWith("--bg") || c.startsWith("stop")), "the agent does not stop and gets no turn");
  await Bun.sleep(700);
  const { data } = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, "btw.png"), Buffer.from(data, "base64"));
  console.log(`shot: ${join(SHOTS, "btw.png")}`);

  await click(".convo .side > .icon");
  await until("!document.querySelector('.convo .side')", "the × closes the side answer");
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  if (!process.env.KEEP) rmSync(join(TMP, "home"), { recursive: true, force: true });
}
// The socket of the relay keeps the process alive.
process.exit(0);
