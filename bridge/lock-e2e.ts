// The check of the Face ID lock across a new load of the page (src/Lock.tsx): `bun bridge/lock-e2e.ts`. It needs Google
// Chrome, so GitHub does not run it. It uses no bridge, no relay and no credits: a phone page in headless Chrome with a
// fake pairing, a fake Face ID that counts the prompts, a fake time of the last lock of the phone, and a fake visibility.
// An update of the screen loads the page again (src/front.ts), and such a load must not ask for Face ID.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-lock-e2e-"));
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
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdout: "ignore", stderr: "ignore" });
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
  const until = async (expression: string, what: string, ms = 20_000) => {
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(100)) if (await page(expression).catch(() => false)) return;
    throw new Error(`FAIL: timed out: ${what}`);
  };
  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
  // The fakes keep their state in localStorage, so it stays through each new load: the count of the prompts of Face ID
  // (`faceIds`, each one says yes), the time of the last lock of the phone (`phoneLockAt`), and the visibility (`hidden`).
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      const t = (k) => localStorage.getItem("test." + k);
      Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => (t("hidden") ? "hidden" : "visible") });
      Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => !!t("hidden") });
      window.__TAURI_INTERNALS__ = {
        invoke: (cmd) =>
          cmd === "plugin:biometric|authenticate" ? (localStorage.setItem("test.faceIds", String(Number(t("faceIds")) + 1)), Promise.resolve())
          : cmd === "phone_lock" ? Promise.resolve(Number(t("phoneLockAt")))
          : Promise.reject(new Error("no Tauri: " + cmd)),
        transformCallback: () => 0, unregisterCallback: () => {},
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      };`,
  });
  const faceIds = () => page(`Number(localStorage.getItem("test.faceIds"))`) as Promise<number>;
  const locked = () => page(`!!document.querySelector(".lock-screen")`) as Promise<boolean>;
  const set = (k: string, v: string | number) => page(`localStorage.setItem("test.${k}", "${v}")`);
  const visibility = (hidden: boolean) => page(`localStorage.setItem("test.hidden", "${hidden ? "1" : ""}"), document.dispatchEvent(new Event("visibilitychange"))`);
  // A new load of the page as an update makes it, and the wait until the app (or its lock screen) shows again.
  const load = async (how: "Page.reload" | "Page.navigate" = "Page.reload") => {
    await page(`window.__old = true`);
    // A new address, because Chrome makes a load of the same address a reload.
    await cdp(how, how === "Page.navigate" ? { url: `${URL_}?start=${Date.now()}` } : {});
    await until("!window.__old && document.readyState === 'complete' && !!document.querySelector('main, .lock-screen')", "the page loads again");
    await Bun.sleep(700); // The prompt waits 300 ms.
  };

  // The first start, then a fake pairing (the Lock is only on a paired phone), Face lock on, and a new start.
  await cdp("Page.navigate", { url: URL_ });
  await until("document.readyState === 'complete'", "the page loads");
  await page(`(async () => {
    const L = await import('/src/link.ts');
    const key = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const pub = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey))));
    await L.savePairing({ relay: 'ws://127.0.0.1:9', room: 'lock-e2e', mac: 'lock-e2e', pub, key, name: 'Test' });
    localStorage.setItem('faceLock', 'on');
    localStorage.setItem('faceGrace', '0');
    return true;
  })()`);

  await load("Page.navigate");
  assert((await faceIds()) === 1 && !(await locked()), "a new start asks for Face ID one time, and opens");

  await load();
  assert((await faceIds()) === 1 && !(await locked()), "an update in front asks for no Face ID");
  assert(String(await page("window.yonderBoot?.text")).includes("lock open"), "the record of the start notes the open lock");
  await load();
  assert((await faceIds()) === 1 && !(await locked()), "a second update in front asks for no Face ID");

  await visibility(true);
  assert(await locked(), "the app locks when it leaves the screen");
  await load();
  assert((await faceIds()) === 1 && (await locked()), "an update in the background stays locked and asks for nothing behind other apps");
  await visibility(false);
  await Bun.sleep(700);
  assert((await faceIds()) === 2 && !(await locked()), "back in front, Ask again Immediately asks for Face ID");

  await page(`localStorage.setItem("faceGrace", "5")`);
  await set("phoneLockAt", 0);
  await visibility(true);
  await load();
  await load();
  await visibility(false);
  await Bun.sleep(700);
  assert((await faceIds()) === 2 && !(await locked()), "two updates in the background keep the grace time of 5 minutes");

  await visibility(true);
  await set("phoneLockAt", Date.now() + 1);
  await load();
  await visibility(false);
  await Bun.sleep(700);
  assert((await faceIds()) === 3 && !(await locked()), "a lock of the phone after the app left asks again after an update");

  await page(`localStorage.setItem("faceGrace", "0")`);
  // pagehide before the hidden event: the record says open, but the page starts behind another app.
  await set("hidden", "1");
  await load();
  assert((await faceIds()) === 3 && (await locked()), "an update that starts behind another app stays locked");
  await visibility(false);
  await Bun.sleep(700);
  assert((await faceIds()) === 4 && !(await locked()), "and it asks for Face ID in front");

  await load("Page.navigate");
  assert((await faceIds()) === 5, "a new start of the page asks for Face ID, also with the state of an open app");

  await page(`import('/src/bridge.ts').then((b) => (b.away.link = true))`);
  await visibility(true);
  assert(!(await locked()), "a link of Yonder does not lock");
  await load();
  await visibility(false);
  await Bun.sleep(700);
  assert((await faceIds()) === 5 && !(await locked()), "an update during a link of Yonder asks for no Face ID on the way back");

  // The check of the start (src/front.ts) waits for 8 seconds in front: a page that starts hidden is not judged hidden.
  await visibility(true);
  await load();
  await Bun.sleep(9000);
  assert(!/; (shown|empty) (hidden|visible) \d/.test(String(await page("window.yonderBoot?.text"))), "the check of the start waits while the page is behind other apps");
  await visibility(false);
  await Bun.sleep(9500);
  assert(/; shown visible \d/.test(String(await page("window.yonderBoot?.text"))), "the check of the start comes 8 seconds after the page is in front");

  // A screen on trial that starts behind other apps is on trial only in front (`held` in src/front.ts), because iOS can
  // freeze it before the 1.5 seconds that take the mark away, and the next start then marks a good screen bad.
  // The start code of the install puts the mark on the new page, after the old page went behind with the app shown.
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const b = localStorage.getItem("test.try"); if (b) localStorage.setItem("frontTry", b), localStorage.removeItem("test.try"); })()` });
  const build = await page(`import('/src/front.ts').then((f) => f.running.build)`);
  await set("hidden", "1");
  await page(`localStorage.setItem("test.try", ${JSON.stringify(build)}), (window.__old = true)`);
  await cdp("Page.reload");
  await until(`!window.__old && localStorage.getItem("frontTry") === null && !/; look /.test(window.yonderBoot?.text)`, "a screen on trial that starts behind other apps loses its mark before 1.5 seconds");
  assert(true, "a screen on trial that starts behind other apps loses its mark before 1.5 seconds");
  assert(/; render \w+ hidden/.test(String(await page("window.yonderBoot?.text"))), "the record notes a start behind other apps");
  await until("!!document.querySelector('main, .lock-screen')", "the page shows");
  await visibility(false);
  await Bun.sleep(300);
  assert((await page(`localStorage.getItem("frontTry")`)) === null, "back in front, a page that shows the app stays off trial");
  console.log("PASS");
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  vite.kill();
  rmSync(TMP, { recursive: true, force: true });
}
