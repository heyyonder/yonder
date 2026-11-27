// The check of the microphone that the Mac keeps open after a dictation (MAC_LINGER_MS in src/dictate.ts):
// `bun bridge/dictate-e2e.ts`. It needs Chrome for Testing, so GitHub does not run it. It uses no bridge and no credits: the
// page of the Mac app in headless Chrome, with the fake microphone of Chrome, a fake Tauri that writes down each command,
// and fake answers of the bridge. The start and a focus must not open the microphone, the first dictation opens it, the
// next one and one after a blur must get the open microphone at once, and the sound of a done agent must play on its
// AudioContext. The dictation starts at once, the orange dot does not turn off and on at each switch of the app, and the
// microphone stays closed while the user only types.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-dictate-e2e-"));
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

const chromePort = free();
const chrome = Bun.spawn(
  [
    CHROME,
    "--headless=new",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${join(TMP, "chrome")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" },
);
const vitePort = free();
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });
const URL_ = `http://localhost:${vitePort}/`;

try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(URL_).then(() => true, () => false), fetch(`http://127.0.0.1:${chromePort}/json/version`).then(() => true, () => false)]);
    if (up.every(Boolean)) break;
    await Bun.sleep(200);
  }
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
  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  // The fake Tauri writes each command to window.__invoked. The fake bridge writes each line of call.log to window.__log
  // and gives no words. window.__micOpened counts the microphones that open, and window.__sources tells for each sound
  // if its AudioContext has the microphone.
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__invoked = [];
      window.__log = [];
      window.__micOpened = 0;
      window.__streams = [];
      window.__sources = [];
      window.__contexts = [];
      const Real = window.AudioContext;
      window.AudioContext = class extends Real { constructor(...a) { super(...a); window.__contexts.push(this); } };
      const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (c) => (window.__micOpened++, gum(c).then((s) => (window.__streams.push(s), s)));
      const msSource = AudioContext.prototype.createMediaStreamSource;
      AudioContext.prototype.createMediaStreamSource = function (s) { this.__mic = true; return msSource.call(this, s); };
      const bufSource = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function () { window.__sources.push({ __mic: !!this.__mic }); return bufSource.call(this); };
      window.__TAURI_INTERNALS__ = {
        invoke: (cmd, args) => (window.__invoked.push(cmd + " " + JSON.stringify(args ?? {})), Promise.resolve()),
        transformCallback: () => 0, unregisterCallback: () => {},
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      };
      const real = window.fetch;
      window.fetch = (url, init) => {
        const u = String(url);
        if (u.includes("/log")) return (window.__log.push(String(init?.body)), Promise.resolve(new Response("{}")));
        if (u.includes("/dictate")) return Promise.resolve(Response.json({ text: "" }));
        return real(url, init);
      };`,
  });
  await cdp("Page.navigate", { url: URL_ });
  for (let i = 0; i < 100 && (await page("document.readyState").catch(() => "")) !== "complete"; i++) await Bun.sleep(200);

  // The AudioContext of the sounds (the first one, src/bridge.ts) is suspended at the start, and a move of the mouse
  // wakes it, so the drip of a done agent starts at the click.
  await Bun.sleep(1000);
  const before = await page("window.__contexts[0]?.state");
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 40, y: 40 });
  await Bun.sleep(500);
  const after = await page("window.__contexts[0]?.state");
  assert(before === "suspended" && after === "running", `a move of the mouse wakes the AudioContext of the sounds (${before}, then ${after})`);

  // No microphone after the start and a focus. Then two dictations, one after a blur, a sound of a done agent, and one
  // after a close (dropMic, as the timer does 5 minutes after the last dictation). The test does not wait for the timer.
  await Bun.sleep(3000);
  const result = (await page(`(async () => {
    const D = await import('/src/dictate.ts');
    const B = await import('/src/bridge.ts');
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 1500));
    const idle = window.__micOpened;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const once = async (ms = 800) => {
      window.__log.length = 0;
      const d = await D.dictate(() => {}, (e) => window.__log.push("error " + e));
      await wait(ms);
      await d.stop();
      return window.__log.filter((l) => l.startsWith("dictation"));
    };
    window.__invoked.length = 0;
    const first = await once();
    const second = await once();
    window.dispatchEvent(new Event("blur"));
    const blurred = await once();
    // The sound of a done agent plays on the AudioContext of the open microphone, not on the suspended one of the sounds.
    const made = window.__sources.length;
    B.ding();
    await wait(300);
    const dingOnMic = window.__sources.slice(made).some((c) => c.__mic);
    D.dropMic();
    window.dispatchEvent(new Event("focus"));
    await wait(2000);
    const focused = await once();
    // A disabled track gives only zeros and stays live and not muted, as the kept microphone of the iPhone does.
    window.__streams.at(-1).getAudioTracks().forEach((t) => (t.enabled = false));
    const dead = await once(2000);
    const afterDead = await once();
    return { idle, first, second, blurred, dingOnMic, focused, dead, afterDead, invoked: window.__invoked };
  })()`)) as { idle: number; first: string[]; second: string[]; blurred: string[]; dingOnMic: boolean; focused: string[]; dead: string[]; afterDead: string[]; invoked: string[] };
  const at = (lines: string[], step: string) => Number(lines.find((l) => l.includes(step))?.match(/after (\d+) ms/)?.[1] ?? NaN);
  const frame = (lines: string[]) => at(lines, "first frame after");
  const open = (lines: string[]) => lines.some((l) => l.includes("the audio of the last dictation is still open"));
  console.log({ firstFrame: { first: frame(result.first), second: frame(result.second), afterBlur: frame(result.blurred), afterFocus: frame(result.focused) } });
  assert(result.idle === 0, `the start and a focus open no microphone (${result.idle} opened)`);
  assert(!open(result.first), "the first dictation opens the microphone");
  assert(open(result.second) && frame(result.second) < 100, `the second dictation takes the open microphone, and gets its first frame at once (${frame(result.second)} ms)`);
  assert(open(result.blurred) && frame(result.blurred) < 100, `after a blur the microphone stays open (${frame(result.blurred)} ms)`);
  assert(result.dingOnMic, "the sound of a done agent plays on the AudioContext of the open microphone");
  assert(!open(result.focused), "after a close, a focus does not open the microphone, and the next dictation opens it");
  const zeros = at(result.dead, "gives only zeros");
  assert(zeros < 1000 && at(result.dead, "first sound after") > zeros, `a kept microphone that gives only zeros is replaced, and the new one gets the sound (${zeros} ms)`);
  assert(open(result.afterDead) && !result.afterDead.some((l) => l.includes("gives only zeros")), "the next dictation takes the new microphone");
  assert(!result.invoked.some((c) => c.startsWith("set_wake")), "a dictation does not touch Hey Yonder");
  console.log("PASS");
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  vite.kill();
  rmSync(TMP, { recursive: true, force: true });
}
