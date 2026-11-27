// The end-to-end check of the keys on the pictures of the chat, on the Mac: `bun bridge/thumbkeys-e2e.ts`. It needs
// Chrome for Testing, so GitHub does not run it. It uses no credits: a test bridge with one fake agent whose answer names
// three pictures. The page of the Mac talks to 127.0.0.1:7787, so CDP sends each of those requests to the test bridge,
// and the bridge of the user gets none. ↓ in the prompt selects the newest picture, the arrows select the others, Enter
// opens the viewer and Escape closes it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-thumbkeys-e2e-"));
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
const PROJECT = join(TMP, "photos");
mkdirSync(CONFIG, { recursive: true });
mkdirSync(PROJECT, { recursive: true });

// Three PNG files of one color each, 160 by 120.
const png = (r: number, g: number, b: number) => {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(Bun.hash.crc32(body) >>> 0, 8 + data.length);
    return out;
  };
  const [w, h] = [160, 120];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0), ihdr.writeUInt32BE(h, 4), (ihdr[8] = 8), (ihdr[9] = 2);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array(h).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
};
const PICS = ["red", "green", "blue"].map((n, i) => {
  const path = join(PROJECT, `${n}.png`);
  writeFileSync(path, png(i === 0 ? 220 : 40, i === 1 ? 180 : 40, i === 2 ? 220 : 40));
  return path;
});

const SESSION = "00000000-0000-4000-8000-000000000009";
const now = Date.now();
const ANSWER = `I made three pictures.\n\n${PICS.join("\n")}\n\nThe pictures are done.`;
writeFileSync(
  join(CONFIG, "state.json"),
  JSON.stringify({ workers: [{ id: "w9", num: 9, sessionId: SESSION, name: "Color pictures", project: "photos", path: PROJECT, task: "Make pictures", status: "done", activity: "", result: "Done.", unread: false, startedAt: now, updatedAt: now }] }),
);
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ sumUp: false, textUp: false }));
const transcript = join(HOME, ".claude", "projects", PROJECT.replace(/[^a-zA-Z0-9]/g, "-"));
mkdirSync(transcript, { recursive: true });
const events = [
  { type: "user", timestamp: new Date(now - 60_000).toISOString(), message: { role: "user", content: "Make three pictures." } },
  { type: "assistant", timestamp: new Date(now - 50_000).toISOString(), message: { role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: ANSWER }] } },
];
writeFileSync(join(transcript, `${SESSION}.jsonl`), events.map((e) => JSON.stringify({ ...e, sessionId: SESSION, cwd: PROJECT })).join("\n") + "\n");

const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--no-first-run", "--no-default-browser-check", "--disable-web-security", "about:blank"], { stdout: "ignore", stderr: "ignore" });
const env = { ...process.env, HOME, YONDER_PORT: String(PORT) };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
const vitePort = free();
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });

const procs = [chrome, bridge, vite];
const deadline = setTimeout(() => (console.error("FAIL: the check took more than 3 minutes"), process.exit(1)), 180_000);
try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/settings`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false), fetch(`http://127.0.0.1:${chromePort}/json/version`).then(() => true, () => false)]);
    if (up.every(Boolean)) break;
    await Bun.sleep(200);
  }
  const targets = (await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
  const ws = new WebSocket(targets.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waits = new Map<number, (d: any) => void>();
  const send = (method: string, params: object) => ws.send(JSON.stringify({ id: ++id, method, params }));
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data));
    if (d.id) waits.get(d.id)?.(d), waits.delete(d.id);
    // Each request to the bridge of the user goes to the test bridge.
    // The bridge allows only the origins of the app, so the request goes with no Origin, and Chrome runs with no CORS.
    if (d.method === "Fetch.requestPaused") {
      const { url, headers } = d.params.request;
      send("Fetch.continueRequest", {
        requestId: d.params.requestId,
        url: url.replace("127.0.0.1:7787", `127.0.0.1:${PORT}`),
        headers: Object.entries(headers as Record<string, string>).filter(([name]) => name.toLowerCase() !== "origin").map(([name, value]) => ({ name, value })),
      });
    }
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
  const until = async (expression: string, what: string, ms = 30_000) => {
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(200)) if (await page(expression).catch(() => false)) return console.log(`ok: ${what}`);
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, "failed.png"), Buffer.from(data, "base64"));
    throw new Error(`FAIL: timed out: ${what} (the screen: ${join(SHOTS, "failed.png")})`);
  };
  const shot = async (name: string) => {
    await Bun.sleep(500);
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
    console.log(`shot: ${join(SHOTS, name)}`);
  };
  const key = async (key: string) => {
    const code = { ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27 }[key];
    const extra = key === "Enter" ? { text: "\r" } : {};
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: code, ...extra });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code });
    await Bun.sleep(300);
  };
  // The name of the picture that has the focus, or the tag of the element.
  const focused = `(() => { const a = document.activeElement; return a?.matches('button.thumb') ? a.title : a?.tagName.toLowerCase(); })()`;

  await cdp("Page.enable");
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "http://127.0.0.1:7787/*" }] });
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1100, height: 760, deviceScaleFactor: 2, mobile: false });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until("document.readyState === 'complete'", "the page loads");
  // No welcome screen of a new Mac.
  await page("localStorage.setItem('welcomed', '1')");
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('.tablist [role=tab]')", "the list of agents shows");
  await page(`[...document.querySelectorAll('.tablist [role=tab]')].find((t) => t.textContent.includes('Done')).click()`);
  await until("[...document.querySelectorAll('.worker.row')].some((r) => r.textContent.includes('Color pictures'))", "the test agent shows on the Done tab");
  await page(`[...document.querySelectorAll('.worker.row')].find((r) => r.textContent.includes('Color pictures')).click()`);
  await until("document.querySelectorAll('.convo button.thumb img').length === 3 && [...document.querySelectorAll('.convo button.thumb img')].every((i) => i.complete && i.naturalWidth)", "the chat shows the three pictures");
  await until("document.activeElement?.tagName === 'TEXTAREA'", "the prompt has the focus");

  await key("ArrowDown");
  assert((await page(focused)) === "blue.png", "↓ in the prompt selects the newest picture");
  await key("ArrowLeft");
  assert((await page(focused)) === "green.png", "← selects the picture before it");
  await key("ArrowUp");
  assert((await page(focused)) === "red.png", "↑ selects the picture before it");
  await key("ArrowUp");
  assert((await page(focused)) === "red.png", "↑ on the first picture stays on it");
  await key("ArrowRight");
  assert((await page(focused)) === "green.png", "→ selects the picture after it");
  await shot("1-selected.png");

  await key("Enter");
  await until("!!document.querySelector('.viewer img')", "Enter opens the viewer");
  assert((await page(`document.querySelector('.viewer img').alt`)) === "green.png", "the viewer shows the selected picture");
  await key("ArrowRight");
  assert((await page(`document.querySelector('.viewer img').alt`)) === "blue.png", "→ in the viewer shows the next picture");
  await shot("2-viewer.png");
  await key("Escape");
  await until("!document.querySelector('.viewer')", "Escape closes the viewer");
  assert(await page("!!document.querySelector('.convo')"), "the agent stays open");
  assert((await page(focused)) === "blue.png", "the selection is on the picture that the viewer showed last");

  await key("ArrowDown");
  assert((await page(focused)) === "textarea", "↓ on the last picture goes back to the prompt");
  await key("ArrowDown");
  await key("Escape");
  assert((await page(focused)) === "textarea" && (await page("!!document.querySelector('.convo')")), "Escape on a picture goes back to the prompt, and the agent stays open");

  await page(`(() => { const t = document.activeElement; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'one\\ntwo'); t.dispatchEvent(new Event('input', { bubbles: true })); t.setSelectionRange(0, 0); })()`);
  await key("ArrowDown");
  assert((await page(focused)) === "textarea", "↓ in the middle of the text moves the caret, and selects no picture");
  console.log(`shots: ${SHOTS}`);
} finally {
  clearTimeout(deadline);
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  if (!process.env.KEEP) rmSync(join(TMP, "home"), { recursive: true, force: true });
}
process.exit(0);
