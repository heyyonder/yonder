// The end-to-end check of the Settings from the schema and of the screens folder (docs/screen-api.md):
// `bun bridge/screens-e2e.ts`. It needs the network (relay.yonder.so) and Chrome for Testing, so GitHub does not run it. It
// uses no credits: a test bridge with three fake agents, and a phone page in headless Chrome that pairs through the relay.
// It does not touch the bridge on port 7787 or ~/.config/yonder. The screenshots of the phone go to the shots folder
// that it prints.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-screens-e2e-"));
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
const UI = join(CONFIG, "ui");
mkdirSync(CONFIG, { recursive: true });
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));

// Three agents that are done, for the rows of the screen. Group tool calls is on in config.json, so the switch shows the
// value of the bridge (GET /settings), not the default of the schema in the build.
const now = Date.now();
const MICE = [
  [12, "Weather card", "weather"],
  [14, "Landing hero", "yonder-landing"],
  [9, "October invoice", "time"],
] as const;
writeFileSync(
  join(CONFIG, "state.json"),
  JSON.stringify({
    workers: MICE.map(([num, name, project]) => {
      const path = join(TMP, project);
      mkdirSync(path, { recursive: true });
      return { id: `w${num}`, num, sessionId: `00000000-0000-4000-8000-0000000000${num}`, name, project, path, task: name, status: "done", activity: "", result: "Done.", unread: false, startedAt: now, updatedAt: now - num * 60_000 };
    }),
  }),
);
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ contextGroup: true, agentName: { one: "mouse", many: "mice" } }));

// The screens folder: a page with a local style sheet and script, and a page with a script of about 1 MB. The bridge
// makes version 1 of each in its first look, about 3 seconds after its start.
const folder = (name: string, files: Record<string, string>) => {
  mkdirSync(join(UI, name), { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(UI, name, f), text);
};
const CSS = (color: string) =>
  `body{background:#fff;color:#1a1a1a}.title{margin:0;padding:64px 20px 14px;font-size:34px;font-weight:700;letter-spacing:-.02em;color:${color}}.y-row{padding-top:12px;padding-bottom:12px}`;
folder("drop-demo", {
  "screen.json": JSON.stringify({ name: "Drop demo", kind: "screen", theme: "light" }),
  "index.html": `<!doctype html><html><head><link rel="stylesheet" href="app.css"></head><body><h1 class="title">Drop demo</h1><div class="y-list" id="list"></div><script src="app.js"></script></body></html>`,
  "app.css": CSS("#1a1a1a"),
  "app.js": `yonder.ready();
const draw = (mice) => document.getElementById("list").replaceChildren(...mice.map((m) => {
  const row = document.createElement("div");
  row.className = "y-row";
  for (const [c, t] of [["y-num", m.label], ["y-name", m.name], ["y-sub", m.project]]) row.append(Object.assign(document.createElement("span"), { className: c, textContent: t }));
  return row;
}));
yonder.mice.list().then(draw);
yonder.mice.on(draw);`,
});
// Random base64 does not pack well: 1 MB of it is about 0.76 MB gzipped. So the version is larger than 500 KB, and /ui
// sends it gzipped, but it stays under the limit of 1 MB gzipped of bridge/ui.ts. 1.5 MB of it is over that limit.
const BLOB = randomBytes(750_000).toString("base64");
folder("big-demo", {
  "screen.json": JSON.stringify({ name: "Large page", kind: "screen", theme: "light" }),
  "index.html": `<!doctype html><html><head><style>body{background:#fff;color:#1a1a1a}h1{margin:0;padding:64px 20px 6px;font-size:34px;font-weight:700;letter-spacing:-.02em}p{margin:0;padding:0 20px;color:#8a8a8a}</style></head><body><h1>Large page</h1><p id="size"></p><script src="app.js"></script></body></html>`,
  "app.js": `const DATA = "${BLOB}";\nyonder.ready();\ndocument.getElementById("size").textContent = (DATA.length / 1e6).toFixed(1) + " MB of script";`,
});

const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--no-first-run", "--no-default-browser-check", "--use-mock-keychain", "--password-store=basic", "--disable-features=IsolateSandboxedIframes", "about:blank"], { stdout: "ignore", stderr: "ignore" });
const env = { ...process.env, HOME, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
const vitePort = free();
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });

const procs = [chrome, bridge, vite];
try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/ui`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false), fetch(`http://127.0.0.1:${chromePort}/json/version`).then(() => true, () => false)]);
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

  // The voice in place of Grok: the customize tool of the test bridge.
  const voice = new Client({ name: "fake-grok", version: "0.1.0" });
  await voice.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`)));
  const customize = async (args: Record<string, unknown>) => {
    const r = await voice.callTool({ name: "customize", arguments: args });
    const text = (r.content as { text: string }[]).map((c) => c.text).join("");
    if (r.isError) throw new Error(`customize: ${text}`);
    return text;
  };

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
  const page = async (expression: string, contextId?: number) => {
    const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, ...(contextId && { contextId }) });
    if (r.exceptionDetails) throw new Error(`page: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
    return r.result.value;
  };
  // The page of an own screen is in a sandboxed frame, so the app cannot read it. CDP reads it in a world of its own. The
  // frame stays in the process of the page (IsolateSandboxedIframes off), as in the web view of the phone.
  const frame = async (expression: string) => {
    const { frameTree } = await cdp("Page.getFrameTree");
    const child = (frameTree.childFrames ?? []).find((f: any) => f.frame.url === "about:srcdoc");
    if (!child) return undefined;
    const { executionContextId } = await cdp("Page.createIsolatedWorld", { frameId: child.frame.id, worldName: "e2e" });
    return page(expression, executionContextId);
  };
  const until = async (check: string | (() => unknown), what: string, ms = 40_000) => {
    const ok = typeof check === "string" ? () => page(check) : check;
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(250)) if (await Promise.resolve().then(ok).catch(() => false)) return;
    // The screen at the failure, for the reason.
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, "failed.png"), Buffer.from(data, "base64"));
    throw new Error(`FAIL: timed out: ${what} (the screen: ${join(SHOTS, "failed.png")})`);
  };
  // A version of a screen of the folder. On a timeout, the log of the build tells why.
  const version = (name: string, n: number) =>
    until(() => existsSync(join(UI, name, `${n}.json`)), `version ${n} of ${name}`).catch((e) => {
      const read = (f: string) => (existsSync(join(UI, name, f)) ? readFileSync(join(UI, name, f), "utf8") : "none");
      throw new Error(`${(e as Error).message}\nbuild.log: ${read("build.log")}\nstate.json: ${read("state.json")}`);
    });
  const shot = async (name: string) => {
    await Bun.sleep(700);
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
    console.log(`shot: ${join(SHOTS, name)}`);
  };
  // A tap: a press and a release of the mouse at the middle of the element, when it stands still (a page slides in).
  const tap = async (selector: string, text = "") => {
    const where = `(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!e) return; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
    let at: { x: number; y: number } | undefined;
    await until(async () => {
      const a = await page(where);
      await Bun.sleep(150);
      const b = await page(where);
      return a && b && a.x === b.x && a.y === b.y && (at = b);
    }, `${selector} ${text} stands still to tap`);
    for (const type of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type, ...at!, button: "left", clickCount: 1 });
  };
  // A tap that opens or closes a page, once more when the page did not change in 3 seconds: a tap in a slide can miss.
  const go = async (selector: string, text: string, check: string, what: string) => {
    for (let i = 0; i < 5; i++) {
      await tap(selector, text);
      if (await until(check, what, 3000).then(() => true, () => false)) return;
    }
    await until(check, what, 1);
  };
  const expect = async (check: string | (() => unknown), what: string) => (await until(check, what), console.log(`ok: ${what}`));
  const rows = "[...document.querySelectorAll('.page .group .row > span:first-child')].map((e) => e.textContent)";
  const on = (label: string) => `(() => { const e = document.querySelector('.page [aria-label=${JSON.stringify(label)}]'); return e && (e.getAttribute('aria-checked') ?? String(e.checked)); })()`;
  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 3, mobile: true });
  // The notch and the home bar of an iPhone, so the frame of an own screen goes under the home bar as on the phone.
  await cdp("Emulation.setSafeAreaInsetsOverride", { insets: { top: 62, bottom: 34 } });
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until("document.readyState === 'complete'", "the page loads");
  await page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); localStorage.setItem('theme', 'light'); return true })()`);
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('[role=tab]')", "the paired app shows");
  await Bun.sleep(1500);

  // 1. General: the rows of the schema, with the values of config.json. A tap turns Summaries off through POST /settings.
  await go("[aria-label=Settings]", "", `${rows}.length === 0 && !!document.querySelector('.row.nav')`, "the Settings open");
  // The list of the sections comes from the files of bridge/settings/, in their order, with the word of the user for Agents.
  const list = "[...document.querySelectorAll('.row.nav span')].map((e) => e.firstChild?.textContent?.trim())";
  await until(`JSON.stringify(${list}.filter((t) => ['Environment', 'General', 'Mice', 'Schedules', 'Usage'].includes(t))) === JSON.stringify(['Environment', 'General', 'Mice', 'Schedules', 'Usage'])`, "the Settings list the sections of bridge/settings/ in order, with Mice for Agents");
  await shot("settings-list.png");
  await go(".row.nav", "General", `${rows}.includes('Tunnel')`, "General opens");
  await expect(`['Tunnel', 'Summaries'].every((l) => ${rows}.includes(l)) && !${rows}.includes('Chat')`, "General shows the rows Tunnel and Summaries, and no Chat row");
  await expect(`${on("Summaries")} === 'true'`, "Summaries is on, as config.json of the test bridge says (GET /settings)");
  await tap(".page [aria-label=Summaries]");
  await expect(() => json(join(CONFIG, "config.json")).sumUp === false && json(join(CONFIG, "config.json")).contextGroup === true, 'a tap on Summaries writes "sumUp": false to config.json (POST /settings)');
  await until(`${on("Summaries")} === 'false'`, "the switch of Summaries is off");
  await shot("settings-general.png");

  // 1b. General: the Context tab rows of the schema, under Summaries. Group tool calls is on, as config.json says, and a
  // tap on Verbose writes "contextDetail": "verbose". The bubbles are part of the screen style, so no row.
  await expect(`['Detail', 'Group tool calls'].every((l) => ${rows}.includes(l)) && !${rows}.includes('Blue bubbles')`, "General shows the rows Detail and Group tool calls, and no Blue bubbles row");
  await expect(`${on("Group tool calls")} === 'true'`, "Group tool calls is on, as config.json says (GET /settings)");
  // Detail is a dropdown: a native <select> on the iPhone, which CDP cannot tap, so the page picks it.
  await page(`(() => { const s = [...document.querySelectorAll('.page .group .row')].find((r) => r.textContent.startsWith('Detail')).querySelector('select'); s.scrollIntoView({ block: 'center' }); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'verbose'); s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`);
  await expect(() => json(join(CONFIG, "config.json")).contextDetail === "verbose", 'a tap on Verbose writes "contextDetail": "verbose" to config.json (POST /settings)');
  await shot("settings-general-context.png");
  await page(`document.querySelector(".page-back[aria-label='Back to Settings']").scrollIntoView({ block: 'start' })`);

  // 1c. Appearance has only the style choices: the theme, the color, the styles, the custom themes and the fonts.
  await go(".page-back[aria-label='Back to Settings']", "", `${rows}.length === 0`, "the list of the sections shows again");
  await go(".row.nav", "Appearance", "!!document.querySelector('.theme-row')", "Appearance opens");
  await expect(`!['Detail', 'Blue bubbles', 'Group tool calls'].some((l) => ${rows}.includes(l)) && ![...document.querySelectorAll('.page .row')].some((e) => /mine$|default screen/.test(e.textContent))`, "Appearance has no toggles of the Context tab and no Make mine or Back to the default screen");
  await shot("settings-appearance.png");
  await page(`document.querySelector(".page-back[aria-label='Back to Settings']").scrollIntoView({ block: 'start' })`);

  // 2. Usage: the Title bar row, a setting of the phone (phone.json).
  await go(".page-back[aria-label='Back to Settings']", "", `${rows}.length === 0`, "the list of the sections shows again");
  await go(".row.nav", "Usage", `${rows}.includes('Title bar')`, "Usage opens");
  await expect(`${rows}.includes('Title bar')`, "Usage shows the Title bar row");
  await shot("settings-usage.png");
  await go(".page-back[aria-label='Back to Settings']", "", `${rows}.length === 0`, "the list of the sections shows again");
  await go(".page-back[aria-label=Back]", "", "!document.querySelector('.row.nav')", "the Settings close");

  // 3. The screens folder: version 1 from the folder, customize use, and the page with the agents on the phone.
  await version("drop-demo", 1);
  const v1 = json(join(UI, "drop-demo", "1.json"));
  const page1 = readFileSync(join(UI, "drop-demo", "1.html"), "utf8");
  assert(v1.name === "Drop demo" && page1.includes("#1a1a1a") && page1.includes("yonder.mice.list") && !/src="app\.js"|href="app\.css"/.test(page1), "version 1 has the style sheet and the script in the page");
  await customize({ action: "use", screen: "drop-demo" });
  assert(json(join(CONFIG, "phone.json")).ui === "drop-demo@1", "customize use writes drop-demo@1 to phone.json");
  await until("document.querySelector('iframe.own-screen')?.title === 'Drop demo'", "the phone shows the frame of Drop demo");
  await until(() => frame("document.querySelectorAll('.y-row').length === 3"), "the page shows the three mice");
  const names = await frame("[...document.querySelectorAll('.y-row .y-name')].map((e) => e.textContent).join(', ')");
  assert(MICE.every(([, n]) => names.includes(n)), `the page shows the mice from yonder.mice.list() (${names})`);
  await shot("screen-folder.png");
  // Past the 5 seconds of yonder.ready(): the version is not bad, so the page called it.
  await Bun.sleep(5500);
  assert(!json(join(UI, "drop-demo", "state.json")).versions?.["1"]?.bad && (await page("document.querySelector('iframe.own-screen')?.title")) === "Drop demo", "the page called yonder.ready(), so the version is good");

  // A change of app.css: version 2, which the bridge puts into phone.json, and which the phone shows with no reload.
  await page("window.__same = 1");
  writeFileSync(join(UI, "drop-demo", "app.css"), CSS("#0a84ff"));
  await version("drop-demo", 2);
  await expect(() => json(join(CONFIG, "phone.json")).ui === "drop-demo@2", "the bridge puts drop-demo@2 into phone.json");
  await until("document.querySelector('iframe.own-screen')?.srcdoc.includes('#0a84ff')", "the phone gets version 2");
  await until(() => frame("getComputedStyle(document.querySelector('.title')).color === 'rgb(10, 132, 255)'"), "the title of the page is blue");
  assert((await page("window.__same")) === 1, "the phone shows the new color of app.css with no reload");

  // 4. A page larger than 500 KB: /ui gzips it, and it passes the relay.
  await version("big-demo", 1);
  const raw = await fetch(`http://127.0.0.1:${PORT}/ui?name=big-demo`);
  const zipped = new Uint8Array(await raw.arrayBuffer());
  assert(raw.headers.get("content-type") === "application/gzip" && zipped.length < 1_000_000 && Bun.gunzipSync(zipped).length > 1_000_000, `/ui sends the large version gzipped (${zipped.length} bytes for ${Bun.gunzipSync(zipped).length})`);
  await customize({ action: "use", screen: "big-demo" });
  await until("document.querySelector('iframe.own-screen')?.title === 'Large page'", "the phone shows the frame of Large page");
  await until(() => frame("document.getElementById('size')?.textContent === '1.0 MB of script'"), "the large page runs on the phone");
  assert((await page("document.querySelector('iframe.own-screen').srcdoc.length")) > 1_000_000, "the large page passes the relay whole");
  await shot("screen-large.png");

  // 4b. The samples. The frame of the Dashboard goes down to the bottom edge, and its tab bar sits on the edge with the
  // home bar of 34 px inside it (`--under`). The Dashboard has the dictation and no Call button. A style with the glass off
  // (Terminal, Big button) keeps the flat buttons of the page; the shots show them.
  await customize({ action: "use", screen: "dashboard" });
  await until("document.querySelector('iframe.own-screen')?.title === 'Dashboard'", "the phone shows the frame of the Dashboard");
  await until(() => frame("!!document.querySelector('#tabs button')"), "the Dashboard draws its tab bar");
  await expect("document.querySelector('iframe.own-screen').getBoundingClientRect().bottom === innerHeight", "the frame of an own screen goes down to the bottom edge");
  await expect(() => frame("getComputedStyle(document.documentElement).getPropertyValue('--under').trim() === '34px' && document.getElementById('tabs').getBoundingClientRect().bottom === innerHeight && getComputedStyle(document.getElementById('tabs')).paddingBottom === '34px'"), "the tab bar of the Dashboard sits on the bottom edge, with the home bar of 34 px inside it");
  // CDP reads the frame in a world of its own, which sees the page but not its `yonder`, so the SDK shows in srcdoc.
  await expect("document.querySelector('iframe.own-screen').srcdoc.includes('dictation: { start: () => ask(\"dictation.start\")')", "a page gets yonder.dictation");
  await expect(() => frame("document.getElementById('go').getAttribute('aria-label') === 'Dictate'"), "the Dashboard has the dictation, on the button of its text box");
  await expect(() => frame("!document.getElementById('call')"), "the Dashboard has no Call button");
  await shot("sample-dashboard.png");
  for (const style of ["terminal", "omarchy", "big"]) {
    await customize({ action: "use", screen: style });
    await until(`!document.querySelector('iframe.own-screen') && document.documentElement.dataset.look === '${style}' && document.documentElement.dataset.glass === 'off' && !!document.querySelector('[role=tab]')`, `the phone shows the style ${style} with the glass off`);
    await shot(`style-${style}.png`);
  }

  // 5. Back to the default screen.
  await customize({ action: "reset" });
  assert(json(join(CONFIG, "phone.json")).ui === undefined, "customize reset removes the screen from phone.json");
  await expect("!document.querySelector('iframe.own-screen') && !!document.querySelector('[role=tab]')", "the phone goes back to the default screen");

  // 6. Settings › Appearance: the styles with their swatches, and the custom themes with their versions. The i of a theme
  // opens its versions, and customize with delete takes a theme away.
  await go("[aria-label=Settings]", "", "!!document.querySelector('.row.nav')", "the Settings open again");
  await go(".row.nav", "Appearance", "!!document.querySelector('.theme-swatch')", "Appearance opens with the swatches");
  await page("document.querySelector('.theme-swatch').closest('.group').previousElementSibling.scrollIntoView({ block: 'start' })");
  await Bun.sleep(400);
  await shot("settings-styles.png");
  await expect("!document.querySelector('.screen-build') && !document.querySelector('[aria-label=\"Describe your screen\"]')", "Appearance has no Build field");
  await until("document.querySelectorAll('.row.theme').length === 2", "Custom themes lists the two screens of the user");
  await tap(".row.theme .info");
  await until("document.querySelectorAll('.screen-version').length >= 3", "the i opens the versions with Delete");
  await page("document.querySelector('.row.theme').scrollIntoView({ block: 'start' })");
  await Bun.sleep(400);
  await shot("settings-themes.png");
  await customize({ action: "delete", screen: "big-demo" });
  assert(!existsSync(join(CONFIG, "ui", "big-demo")), "customize delete takes the folder of a theme away");

  // 7. A tap on a style shows it live with the bar "Keep Dashboard?" (src/Looks.tsx), with no line under the bar. Back
  // goes back. The bar shows over a light page (Dashboard) and a dark one (Terminal).
  for (const [name, file] of [["Dashboard", "keep-bar.png"], ["Terminal", "keep-bar-dark.png"], ["Big button", "keep-bar-big.png"]]) {
    if (!(await page("!!document.querySelector('.theme-row')"))) {
      await go("[aria-label=Settings]", "", "!!document.querySelector('.row.nav')", "the Settings open again");
      await go(".row.nav", "Appearance", "!!document.querySelector('.theme-row')", "Appearance opens");
    }
    await page(`[...document.querySelectorAll('.theme-row')].find((e) => e.textContent.includes(${JSON.stringify(name)})).scrollIntoView({ block: 'center' })`);
    await Bun.sleep(300);
    await tap(".theme-row", name);
    await until("!!document.querySelector('.keep-bar')", `the bar Keep ${name}? shows`);
    await Bun.sleep(1200);
    // Nothing of the screen shows under the bar: no frame and no round button reaches below its top.
    const clear = `(() => { const top = document.querySelector('.keep-bar').getBoundingClientRect().top; const f = document.querySelector('iframe.own-screen'); const r = document.querySelector('.reach'); return (!f || f.getBoundingClientRect().bottom <= top) && (!r || getComputedStyle(r).visibility === 'hidden'); })()`;
    await expect(clear, `nothing of ${name} shows under the bar`);
    await shot(file);
    await tap(".keep-bar button", "Back");
    await until("!document.querySelector('.keep-bar')", `Back ends the preview of ${name}`);
  }
  // 8. The layout of the Settings: each row of each section, in each sample and custom theme, in the light and the dark
  // look, at 320 and 375 pt. A label and a control never overlap, and no text or control is cut or leaves its row. For
  // example, the options of Detail must not cover its label in the Terminal theme.
  // The check of one part of the screen: `rows` is the selector of its rows, whose children must not overlap or leave
  // the row, and whose text must not be cut or spill. The Settings check `.page .group .row`.
  const check = (rows: string, min = 0) => `(() => {
    const out = [];
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const tag = (e) => (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).trim().slice(0, 24);
    for (const row of document.querySelectorAll(${JSON.stringify(rows)})) {
      if (!vis(row)) continue;
      const rr = row.getBoundingClientRect();
      const name = tag(row.querySelector('span') || row);
      if (rr.height < ${min}) out.push(name + ' is ' + Math.round(rr.height) + ' px high, under ${min} px');
      // The hidden field of a picker of the page (Base UI Select) and the swipe actions of a task are not parts that show.
      const kids = [...row.children].filter((e) => vis(e) && !e.matches('input[aria-hidden=true], .swipe-actions'));
      for (let i = 0; i < kids.length; i++) {
        const a = kids[i].getBoundingClientRect();
        if (a.left < rr.left - 1 || a.right > rr.right + 1) out.push(name + ': ' + tag(kids[i]) + ' leaves the row');
        for (let j = i + 1; j < kids.length; j++) {
          const b = kids[j].getBoundingClientRect();
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(name + ': ' + tag(kids[i]) + ' overlaps ' + tag(kids[j]));
        }
      }
      for (const e of row.querySelectorAll('span, small, button, label, .seg')) {
        const st = getComputedStyle(e);
        if (!vis(e) || st.display === 'inline' || st.textOverflow === 'ellipsis' || e.tagName === 'INPUT') continue;
        // A button that goes past its box with a negative margin, for a larger tap area, and stays in the row, is no cut.
        const button = [...e.children].some((k) => k.tagName === 'BUTTON') && [...e.children].every((k) => { const b = k.getBoundingClientRect(); return b.left >= rr.left - 1 && b.right <= rr.right + 1; });
        if (e.scrollWidth > e.clientWidth + 1 && !(button && !e.matches('.seg') && st.overflowX === 'visible')) out.push(name + ': the text of ' + tag(e) + ' is cut or spills');
      }
    }
    return [...new Set(out)];
  })()`;
  // The other parts of the screen to check in each theme, look and width: each case opens its part, gives the selector of
  // its rows, and closes it again. To check a new part, such as a sheet, a menu or a dialog, add a case here.
  type Case = { name: string; open: () => Promise<unknown>; rows: string; min?: number; close: () => Promise<unknown> };
  // The page forms of the native controls, which each theme other than the default draws (src/ask.tsx, src/Attach.tsx,
  // the Approval of src/Canvas.tsx). On the default screen the iPhone shows the native forms, so these cases open
  // nothing there. Summaries are off since step 1, so an open agent has its three dots.
  const themed = "document.documentElement.dataset.look !== 'yonder'";
  const agent = new Client({ name: "fake-agent", version: "0.1.0" });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp?worker=w12`)));
  const openMouse = async () => {
    await page(`[...document.querySelectorAll('[role=tab]')].find((e) => /done/i.test(e.textContent))?.click()`);
    await until("[...document.querySelectorAll('.worker.row')].some((r) => r.textContent.includes('Weather card'))", "the Done tab shows the mice");
    await page("[...document.querySelectorAll('.worker.row')].find((r) => r.textContent.includes('Weather card')).click()");
    await until("!!document.querySelector('.convo-head [aria-label=Attach], .prompt [aria-label=Attach]')", "the mouse opens");
  };
  const closeMouse = async () => {
    await page("document.querySelector(\"[aria-label='Back to the mice']\")?.click()");
    await until("!document.querySelector('.prompt [aria-label=Attach]')", "the mouse closes");
  };
  const when = async (open: () => Promise<unknown>) => (await page(themed)) && open();
  const CASES: Case[] = [
    // The rows of the Done tab: the number, the title and its status line, and the check button inside the row, also
    // in Terminal.
    {
      name: "Task list",
      open: () => page("(() => { [...document.querySelectorAll('[role=tab]')].find((t) => /done/i.test(t.textContent))?.click(); return new Promise((r) => setTimeout(r, 400)) })()"),
      // Under an own screen (Dashboard), the task list of the default screen does not show.
      rows: "html:not(:has(iframe.own-screen)) .worker.row",
      min: 44,
      close: async () => {},
    },
    {
      name: "Action sheet",
      open: () => when(async () => (await openMouse(), await page("document.querySelector('[aria-label=\"More actions\"]').click()"), until("!!document.querySelector('.action-sheet .action-item')", "the action sheet opens"))),
      rows: ".action-sheet .action-item",
      close: () => when(async () => (await page("document.querySelector('.action-cancel').click()"), await until("!document.querySelector('.action-sheet')", "the action sheet closes"), closeMouse())),
    },
    {
      name: "Attach sheet",
      open: () => when(async () => (await openMouse(), await page("document.querySelector('.prompt [aria-label=Attach]').click()"), until("!!document.querySelector('.attach-buttons button')", "the attach sheet opens"))),
      rows: ".attach-sheet .attach-buttons > button",
      close: () => when(async () => (await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }), await until("!document.querySelector('.attach-buttons')", "the attach sheet closes"), closeMouse())),
    },
    {
      name: "Dialog",
      open: () => when(async () => (await page("import('/src/ask.tsx').then((A) => (A.ask('Its 3 versions go away.', { title: 'Delete My Terminal?', okLabel: 'Delete', cancelLabel: 'Cancel' }), true))"), until("!!document.querySelector('.dialog .ask-buttons')", "the dialog opens"))),
      rows: ".dialog .ask-buttons",
      close: () => when(async () => (await page("document.querySelector('.dialog .ask-buttons button').click()"), until("!document.querySelector('.dialog .ask-buttons')", "the dialog closes"))),
    },
    {
      name: "Picker",
      open: () =>
        when(async () => {
          await page("import('/src/api.ts').then((A) => (A.yonder.settings.open(), true))");
          await go(".row.nav:not(.me)", "Mice", "!!document.querySelector('.page .group .select')", "the Mice section opens");
          await page("document.querySelector('.page .group .select').scrollIntoView({ block: 'center' })");
          await tap(".page .group .select");
          await until("!!document.querySelector('.select-menu[data-open] .menu-item')", "the list of the picker opens");
        }),
      rows: ".select-menu[data-open] .menu-item",
      close: () =>
        when(async () => {
          // A tap on the choice that is already in use closes the list and changes nothing.
          await tap(".select-menu[data-open] .menu-item[data-selected]");
          await until("!document.querySelector('.select-menu[data-open]')", "the list of the picker closes");
          await go(".page-back[aria-label='Back to Settings']", "", `${rows}.length === 0`, "the list of the sections shows again");
          await go(".page-back[aria-label=Back]", "", "!document.querySelector('.row.nav')", "the Settings close");
        }),
    },
    // The page of a CLI over the Agents section: Claude Code, then the first other CLI. Each CLI has
    // its own page.
    ...[0, 1].map((n): Case => ({
      name: `Agent page ${n + 1}`,
      open: async () => {
        await page("import('/src/api.ts').then((A) => (A.yonder.settings.open(), true))");
        await go(".row.nav:not(.me)", "Mice", "!!document.querySelector('.page .group .row.nav')", "the Mice section opens");
        await page(`document.querySelectorAll('.page .page .group .row.nav')[${n}].scrollIntoView({ block: 'center' })`);
        await go(`.page .page .group .row.nav:nth-child(${n + 1})`, "", "document.querySelectorAll('.page .page .page .page-title').length === 1", "the page of a CLI opens");
        await Bun.sleep(300);
      },
      rows: ".page .page .page .group .row",
      close: async () => {
        await go(".page-back[aria-label='Back to Mice']", "", "!document.querySelector('.page .page .page')", "the page of the CLI closes");
        await page(`document.querySelector(".page-back[aria-label='Back to Settings']").scrollIntoView({ block: 'start' })`);
        await go(".page-back[aria-label='Back to Settings']", "", `${rows}.length === 0`, "the list of the sections shows again");
        await go(".page-back[aria-label=Back]", "", "!document.querySelector('.row.nav')", "the Settings close");
      },
    })),
    {
      name: "Approval",
      open: () =>
        when(async () => {
          void agent.callTool({ name: "ask_user", arguments: { kind: "pay", title: "Top up Visual Sandbox", amount: "$20.00", text: "You pay on the page of Stripe.", link: "https://checkout.stripe.com/c/pay/cs_test_a1", rows: [["Shop", "Visual Sandbox"], ["Item", "Credit"]] } }, undefined, { timeout: 600_000 }).catch(() => {});
          await until("!!document.querySelector('.approval .approval-amount')", "the approval card opens");
        }),
      rows: ".approval .approval-head, .approval .approval-rows > div",
      close: () => when(async () => (await page("document.querySelector('.approval-no').click()"), until("!document.querySelector('.approval')", "the approval card closes"))),
    },
  ];
  // THEMES=terminal checks one theme, for a quick look at a change.
  const THEMES = process.env.THEMES?.split(",") ?? ["yonder", "dashboard", "big", "terminal", "omarchy", "playful", "drop-demo"];
  const problems: string[] = [];
  let shots = 0;
  for (const width of [320, 375]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height: 874, deviceScaleFactor: 3, mobile: true });
    for (const theme of THEMES)
      for (const mode of ["light", "dark"]) {
        await page(`(async () => { const L = await import('/src/look.ts'); const A = await import('/src/api.ts'); await L.pickScreen(${JSON.stringify(theme)}); await A.yonder.settings.set('theme', ${JSON.stringify(mode)}); await A.yonder.settings.open(); return true })()`);
        await until("!!document.querySelector('.row.nav')", `the Settings open in ${theme} ${mode} at ${width}`);
        await Bun.sleep(300);
        const sections: string[] = await page("[...document.querySelectorAll('.row.nav:not(.me) > span:not(.value)')].map((s) => s.firstChild.textContent.trim())");
        for (const section of sections) {
          // The last sections are under the bottom of the screen in the taller themes.
          await page(`[...document.querySelectorAll('.row.nav:not(.me)')].find((r) => r.textContent.includes(${JSON.stringify(section)})).scrollIntoView({ block: 'center' })`);
          await go(".row.nav:not(.me)", section, `document.querySelector('.page-title:last-of-type') && [...document.querySelectorAll('.page-title')].some((t) => t.textContent === ${JSON.stringify(section)}) && !!document.querySelector('.page .group')`, `${section} opens`);
          await Bun.sleep(250);
          const found: string[] = await page(check(".page .group .row"));
          for (const f of found) problems.push(`${theme} ${mode} ${width}pt ${section}: ${f}`), console.log(`layout: ${theme} ${mode} ${width}pt ${section}: ${f}`);
          const detail = theme === "terminal" && ["General", "Appearance"].includes(section) && width === 375;
          if ((found.length && shots < 6) || detail) {
            await page(`(document.querySelector('.page .seg') || document.querySelector('.page .group')).scrollIntoView({ block: 'center' })`);
            await Bun.sleep(300);
            await shot(detail ? `layout-terminal-${section.toLowerCase()}-${mode}.png` : `layout-${theme}-${mode}-${width}-${section.toLowerCase()}.png`);
            if (!detail || found.length) shots++;
          }
          await page(`document.querySelector(".page-back[aria-label='Back to Settings']").scrollIntoView({ block: 'start' })`);
          await go(".page-back[aria-label='Back to Settings']", "", `${rows}.length === 0`, "the list of the sections shows again");
        }
        await page(`document.querySelector(".page-back[aria-label=Back]").scrollIntoView({ block: 'start' })`);
        await go(".page-back[aria-label=Back]", "", "!document.querySelector('.row.nav')", "the Settings close");
        for (const c of CASES) {
          await c.open();
          const found: string[] = await page(check(c.rows, c.min));
          for (const f of found) problems.push(`${theme} ${mode} ${width}pt ${c.name}: ${f}`), console.log(`layout: ${theme} ${mode} ${width}pt ${c.name}: ${f}`);
          // Each part of the Terminal theme gets a picture, for the look.
          if ((found.length && shots < 6) || theme === "terminal") await shot(`layout-${theme}-${mode}-${width}-${c.name.toLowerCase().replace(/\W+/g, "-")}.png`), found.length && shots++;
          await c.close();
        }
      }
  }
  await page(`(async () => { const L = await import('/src/look.ts'); await L.pickScreen('yonder'); return true })()`);
  writeFileSync(join(SHOTS, "layout.txt"), problems.join("\n") + "\n");
  assert(!problems.length, `no row of the Settings overlaps or cuts its text in any theme, look or width${problems.length ? ` (${problems.length} problems, the first: ${problems.slice(0, 8).join(" | ")})` : ""}`);
  console.log(`shots: ${SHOTS}`);
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  if (!process.env.KEEP) rmSync(join(TMP, "home"), { recursive: true, force: true });
}
// The socket of the relay keeps the process alive.
process.exit(0);
