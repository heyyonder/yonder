// The end-to-end check of the Context tab and its rows in the Settings: `bun bridge/context-e2e.ts`. It needs the network
// (relay.yonder.so) and Chrome for Testing, so GitHub does not run it. It uses no credits: a test bridge with one fake agent and
// its transcript, and a phone page in headless Chrome that pairs through the relay. The screenshots of the phone go to
// the shots folder that it prints.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-context-e2e-"));
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

// Agent 7 changed the hero of a landing page: two messages of the user, the thinking, four tool calls and two answers.
const SESSION = "00000000-0000-4000-8000-000000000007";
const now = Date.now();
const at = (s: number) => new Date(now - 120_000 + s * 1000).toISOString();
const ANSWER = "The hero now says **Talk to your agents**, and the button is blue. The build passes.";
writeFileSync(
  join(CONFIG, "state.json"),
  JSON.stringify({
    workers: [{ id: "w7", num: 7, sessionId: SESSION, name: "Landing hero", project: "landing", path: PROJECT, task: "Change the hero", status: "done", activity: "", result: ANSWER, unread: false, startedAt: now, updatedAt: now }],
    // The summary of the last answer is in the state already (its key is answerKey in bridge/main.ts), so no Haiku runs.
    summaries: {
      [SESSION]: {
        key: "l" + Bun.hash(ANSWER).toString(36),
        next: "Done",
        text: [
          "- The hero of the landing page now says Talk to your agents, in place of Your agents, by voice.",
          "- The button of the hero is blue now, and the build of the page passes.",
          "- The change is on main as commit a1b2c3d, so nothing waits for you.",
          "- Done: you can check the new hero on the landing page.",
        ].join("\n"),
      },
    },
  }),
);
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ agentName: { one: "mouse", many: "mice" } }));
const tool = (id: string, name: string, input: object, s: number) => ({ type: "assistant", timestamp: at(s), message: { role: "assistant", model: "claude-opus-5-5", content: [{ type: "tool_use", id, name, input }] } });
const result = (id: string, text: string, s: number) => ({ type: "user", timestamp: at(s), message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: text }] } });
const say = (text: string, s: number) => ({ type: "assistant", timestamp: at(s), message: { role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text }] } });
const events = [
  { type: "user", timestamp: at(0), message: { role: "user", content: "Make the hero say Talk to your agents, and make the button blue." } },
  { type: "assistant", timestamp: at(2), message: { role: "assistant", model: "claude-opus-5-5", content: [{ type: "thinking", thinking: "The hero is in src/Hero.jsx. I change the words and the color of the button, then build.", signature: "x" }] } },
  tool("t1", "Read", { file_path: join(PROJECT, "src/Hero.jsx") }, 3),
  result("t1", "export function Hero() {\n  return <h1>Your agents, by voice</h1>\n}\n", 4),
  tool("t2", "Edit", { file_path: join(PROJECT, "src/Hero.jsx"), old_string: "Your agents, by voice", new_string: "Talk to your agents" }, 5),
  result("t2", "The file was updated.", 6),
  tool("t3", "Bash", { command: "bun run build --mode production --outDir dist", description: "Build the landing page" }, 7),
  result("t3", "vite v6.3.5 building for production...\n✓ 41 modules transformed.\ndist/index.html 0.61 kB\ndist/assets/index.js 212 kB\n✓ built in 1.2s", 9),
  say(ANSWER, 10),
  { type: "user", timestamp: at(30), message: { role: "user", content: "Nice. Is it on main?" } },
  tool("t4", "Bash", { command: "git log --oneline -1", description: "Show the last commit" }, 31),
  result("t4", "a1b2c3d The hero says Talk to your agents", 32),
  say("Yes. The change is on main as a1b2c3d.", 33),
];
const transcript = join(HOME, ".claude", "projects", PROJECT.replace(/[^a-zA-Z0-9]/g, "-"));
mkdirSync(transcript, { recursive: true });
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
  const { connectRelay } = await import(join(WT, "bridge/relay.ts"));
  const relay = connectRelay("wss://relay.yonder.so", CONFIG, process.env.APNS_TEAM_ID ?? "", (req: Request) => {
    const u = new URL(req.url);
    u.port = String(PORT);
    return fetch(new Request(u, req));
  });
  const { link } = await relay.pair();
  const set = (key: string, value: unknown) =>
    fetch(`http://127.0.0.1:${PORT}/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value }) }).then((r) => r.json());

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
  // The app reads the values of the Settings again when an agent opens.
  const reopen = async () => {
    await click("[aria-label='Back to the mice']");
    await until("!document.querySelector('.convo')", "the agent closes");
    await click(".worker.row", "Landing hero");
    await until("document.querySelectorAll('.convo > li').length > 0", "the Context tab shows the conversation");
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

  // 1. Normal, with blue bubbles: the defaults. No Chat tab.
  await click("[role=tab]", "Done");
  await until("[...document.querySelectorAll('.worker.row')].some((r) => r.textContent.includes('Landing hero'))", "agent 7 is on the Done tab");
  await click(".worker.row", "Landing hero");
  await until("document.querySelectorAll('.convo > li').length > 0", "the Context tab shows the conversation");
  assert((await page(`[...document.querySelectorAll('.convo-tabs [role=tab]')].map((t) => t.textContent).join()`)) === "Context", "the agent has only the Context tab, and no Summary or Chat tab");
  assert(await page(`getComputedStyle(document.querySelector('.convo.bubbles > .user')).backgroundColor === 'rgb(11, 132, 254)'`), "a message of the user is a blue bubble");
  assert((await page(`document.querySelectorAll('.convo .tool').length`)) === 4 && (await page(`!document.querySelector('.convo .thinking details').open`)), "Normal shows the 4 tool calls and the closed thinking");
  await shot("1-context-normal.png");

  // 2. Minimal: only the messages.
  await set("contextDetail", "minimal");
  await reopen();
  await until("!document.querySelector('.convo .tool, .convo .thinking')", "Minimal shows no tool call and no thinking");
  await shot("2-context-minimal.png");

  // 3. Verbose: the thinking open and each command in full.
  await set("contextDetail", "verbose");
  await reopen();
  await until("document.querySelector('.convo.verbose .thinking details')?.open === true", "Verbose opens the thinking");
  await shot("3-context-verbose.png");

  // 4. Normal with Group tool calls.
  await set("contextDetail", "normal");
  await set("contextGroup", true);
  await reopen();
  await until("document.querySelectorAll('.convo .tool-group').length === 2", "Group puts the tool calls in a row in one line");
  await shot("4-context-grouped.png");

  // 6. The Terminal sample decides that the messages of the user are gray rows, not blue bubbles (`bubbles` of its look).
  await page("localStorage.setItem('ui', 'terminal')");
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && document.documentElement.dataset.bubbles === 'off'", "Terminal turns the bubbles off");
  await page(`(() => { const t = [...document.querySelectorAll('.tablist [role=tab]')].find((e) => e.textContent.toLowerCase().includes('done')); if (t && t.getAttribute('aria-selected') !== 'true') t.click(); })()`);
  await until("[...document.querySelectorAll('.worker.row')].some((r) => r.textContent.includes('Landing hero'))", "agent 7 shows in Terminal");
  if (!(await page("!!document.querySelector('.convo')"))) await click(".worker.row", "Landing hero");
  await until("document.querySelectorAll('.convo > li.user').length > 0", "the Context tab shows the conversation in Terminal");
  assert(await page(`getComputedStyle(document.querySelector('.convo > .user')).backgroundColor !== 'rgb(11, 132, 254)'`), "a message of the user in Terminal is not a blue bubble");
  await shot("6-terminal.png");
  console.log(`shots: ${SHOTS}`);
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  if (!process.env.KEEP) rmSync(join(TMP, "home"), { recursive: true, force: true });
}
// The socket of the relay keeps the process alive.
process.exit(0);
