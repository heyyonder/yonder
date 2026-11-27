// The end-to-end check of 1Password for the agents (docs/secrets.md): `bun bridge/vault-e2e.ts`. It needs the network
// (relay.yonder.so) and Chrome for Testing, so GitHub does not run it. It uses no credits, no 1Password and no real secret:
// a test bridge on port 7797 with fake items, its own relay identity, a phone page in headless Chrome that pairs through
// the relay, and a fake agent that calls use_secret over MCP. The screenshots of the cards go to the shots folder that
// it prints. Two traps: a Unix socket path has 104 characters at most (BH_TMP_DIR), and the relay in this process and the
// test bridge must share RELAY_MARK (YONDER_RELAY_MARK).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME, closeChrome } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-vault-e2e-"));
const SHOTS = join(TMP, "shots");
mkdirSync(SHOTS, { recursive: true });
const HOME = join(TMP, "home");
const PORT = 7797;
const CONFIG = join(HOME, ".config", `yonder-${PORT}`);
mkdirSync(CONFIG, { recursive: true });
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
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.

// A sign-in page for the fill.
const loginPort = free();
const login = Bun.serve({
  port: loginPort,
  fetch: () => new Response(`<!doctype html><title>Sign in</title><form><input id=user name=username><input id=pass type=password name=password></form>`, { headers: { "content-type": "text/html" } }),
});
const SITE = `http://localhost:${loginPort}`;
const SECRETS = { token: "ghp_FAKEVALUE_123456", user: "sam-test", pass: "pw-FAKE-987" };
const FAKE = {
  items: [
    { vault: "Agent", title: "GitHub", category: "ApiCredentials", sites: [], fields: { token: SECRETS.token } },
    { vault: "Agent", title: "Site", category: "Login", sites: [SITE], fields: { username: SECRETS.user, password: SECRETS.pass } },
    { vault: "Agent", title: "Other", category: "Login", sites: ["https://example.com"], fields: { password: "other-FAKE-555" } },
  ],
};
// A fake agent that Yonder started: use_secret needs a worker of the bridge.
writeFileSync(join(CONFIG, "state.json"), JSON.stringify({
  workers: [{ id: "abc123", num: 7, sessionId: "00000000-0000-4000-8000-000000000007", name: "Deploy landing", project: "test", path: TMP, task: "Test", status: "done", activity: "", result: "", unread: false, startedAt: Date.now(), updatedAt: Date.now() }],
}));

// Headless Chrome, with its own profile: the phone page, and the tab of browser-harness.
const chromePort = free();
const chrome = Bun.spawn([CHROME, "--headless=new", `--remote-debugging-port=${chromePort}`, `--user-data-dir=${join(TMP, "chrome")}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdout: "ignore", stderr: "ignore" });
// A short folder for the socket of browser-harness: a Unix socket path has 104 characters at most.
const BH_TMP = mkdtempSync("/tmp/yv-");
const vitePort = free();
const env = { ...process.env, HOME, BH_TMP_DIR: BH_TMP, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK, YONDER_VAULT_FAKE: JSON.stringify(FAKE), YONDER_OWNER_CHECK: "yes", YONDER_TEST_ORIGIN: `http://localhost:${vitePort}`, BU_NAME: "yondervaulttest", BU_CDP_URL: `http://127.0.0.1:${chromePort}` };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });

const procs = [chrome, bridge, vite];
try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/vault`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false), fetch(`http://127.0.0.1:${chromePort}/json/version`).then(() => true, () => false)]);
    if (up.every(Boolean)) break;
    await Bun.sleep(200);
  }
  // The relay of the test bridge, in this process, as the live bridge has it in its own process.
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
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(250)) if (await page(expression).catch(() => false)) return;
    throw new Error(`FAIL: timed out: ${what}`);
  };
  const shot = async (name: string) => {
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, name), Buffer.from(data, "base64"));
    console.log(`shot: ${join(SHOTS, name)}`);
  };
  await cdp("Page.enable");
  await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 2, mobile: true });
  // Face ID of the test: the biometric plugin says yes. Each other command of Tauri fails, as in a browser.
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__faceIds = 0; window.__TAURI_INTERNALS__ = { invoke: (cmd) => cmd === "plugin:biometric|authenticate" ? (window.__faceIds++, Promise.resolve()) : Promise.reject(new Error("no Tauri: " + cmd)), transformCallback: () => 0, unregisterCallback: () => {}, metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } } };`,
  });
  await cdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
  await until("document.readyState === 'complete'", "the page loads");
  await page(`(async () => { const L = await import('/src/link.ts'); await L.savePairing(await L.pair(${JSON.stringify(link)}, 'iPhone')); return true })()`);
  await cdp("Page.reload");
  await until("document.readyState === 'complete' && !!document.querySelector('.tablist, nav, main')", "the paired app shows");
  await Bun.sleep(1500);

  // 1. No token yet: the agent hears how to connect.
  const client = new Client({ name: "fake-agent", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp?worker=abc123`)));
  const use = (args: Record<string, unknown>) => client.callTool({ name: "use_secret", arguments: args }, undefined, { timeout: 600_000 });
  const text = (r: any) => (r.content as { text: string }[]).map((c) => c.text).join("");
  const early = await use({ why: "Publish the release", run: "true", env: { GH: "op://Agent/GitHub/token" } });
  assert(early.isError && /not connected/.test(text(early)), "with no token, use_secret says how to connect");

  // 2. The phone gives the token in Settings, General, 1Password.
  const tokenOk = await page(`(async () => {
    const B = await import('/src/bridge.ts');
    const r = await B.bridgeFetch('/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'ops_FAKE_TOKEN' }) });
    return r.status + ' ' + JSON.stringify(await r.json());
  })()`);
  assert(tokenOk.startsWith("200") && tokenOk.includes('"connected":true'), `the phone connects 1Password through the relay (${tokenOk})`);
  const stored = readFileSync(join(CONFIG, "vault.json"), "utf8");
  assert(!stored.includes("ops_FAKE_TOKEN") && !stored.includes(SECRETS.token), "vault.json holds no token and no value");
  const listed = JSON.parse(text(await client.callTool({ name: "list_secrets", arguments: {} })));
  assert(listed.connected && listed.list.some((i: { title: string }) => i.title === "Site"), "list_secrets gives the items with no values");
  assert(!JSON.stringify(listed).includes(SECRETS.pass), "list_secrets has no value");

  // 3. A run: the card shows on the phone, a tap approves with no Face ID, and the agent gets the output with the value hidden.
  const run = use({ why: "Publish the release", run: 'printf "token=%s len=" "$GH"; printf "%s" "$GH" | wc -c | tr -d " "', env: { GH: "op://Agent/GitHub/token" }, minutes: 5 });
  await until("[...document.querySelectorAll('.approval-title')].some(e => e.textContent === 'GitHub')", "the card shows on the phone");
  await Bun.sleep(400);
  await shot("card-run.png");
  const cardText = await page("document.querySelector('.attach-sheet.approval').innerText");
  assert(cardText.includes("Agent 7") && cardText.includes("Approve") && cardText.includes("5 min"), `the card names the agent, the use and the minutes (${cardText})`);
  await page("[...document.querySelectorAll('.attach-sheet.approval button')].find(b => b.textContent.startsWith('Approve')).click()");
  const ran = await run;
  const out = JSON.parse(text(ran));
  assert(!ran.isError && out.output === `token=<1Password> len=${SECRETS.token.length}` && out.exit === 0, `the command got the value, and its output hides it (${out.output})`);
  assert(await page("window.__faceIds") === 0, "Approve asks for no Face ID");
  await until("!document.querySelector('.attach-sheet.approval')", "the card goes away");

  // 4. The same agent, command and item in the next minutes: no new card. Another command asks again, so a yes never gives
  // the value to a command that prints it in another form.
  const again = await use({ why: "Publish the release", run: 'printf "token=%s len=" "$GH"; printf "%s" "$GH" | wc -c | tr -d " "', env: { GH: "op://Agent/GitHub/token" } });
  assert(!again.isError && JSON.parse(text(again)).output === out.output && (await page("window.__faceIds")) === 0, "the same command in the minutes of the yes needs no card");
  const leak = use({ why: "Publish the release", run: 'printf %s "$GH" | base64', env: { GH: "op://Agent/GitHub/token" } });
  await until("[...document.querySelectorAll('.approval-title')].some(e => e.textContent === 'GitHub')", "another command with the same item shows a new card");
  await page("[...document.querySelectorAll('.attach-sheet.approval button')].find(b => b.textContent === 'Deny').click()");
  assert((await leak).isError, "the yes of one command does not cover another command");
  await until("!document.querySelector('.attach-sheet.approval')", "the card goes away");

  // 5. Deny.
  const denied = use({ why: "Read the other login", run: "true", env: { P: "op://Agent/Other/password" }, minutes: 0 });
  await until("[...document.querySelectorAll('.approval-title')].some(e => e.textContent === 'Other')", "the second card shows");
  await page("[...document.querySelectorAll('.attach-sheet.approval button')].find(b => b.textContent === 'Deny').click()");
  const no = await denied;
  assert(no.isError && /did not approve/.test(text(no)), "Deny on the phone refuses the request");

  // 5b. The window of Yonder on a Mac: a desktop page of the app, whose requests to the bridge of the user (7787) go to
  // the test bridge. Touch ID (a yes here, YONDER_OWNER_CHECK) lets the key of the window in, the phone approves that one
  // request, and from the next request the card of the Mac approves alone with its own key (approveOnMac in src/Vault.tsx).
  if (process.platform === "darwin") {
    const { b64, newKeys, rawKey } = await import(join(WT, "src/link.ts"));
    const askOf = async () => {
      for (let i = 0; i < 100; i++, await Bun.sleep(100)) {
        const a = JSON.parse(readFileSync(join(CONFIG, "state.json"), "utf8")).workers.find((w: { id: string }) => w.id === "abc123")?.ask;
        if (a?.kind === "secret") return a;
      }
      throw new Error("FAIL: no 1Password ask");
    };
    const macApprove = (body: object) =>
      fetch(`http://127.0.0.1:${PORT}/vault/approve`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:1420" }, body: JSON.stringify(body) }).then((r) => r.json());
    const target = (await (await fetch(`http://127.0.0.1:${chromePort}/json/new?about:blank`, { method: "PUT" })).json()) as { webSocketDebuggerUrl: string };
    const mws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (mws.onopen = r));
    let mid = 0;
    const mwaits = new Map<number, (d: any) => void>();
    const mcdp = (method: string, params: object = {}) =>
      new Promise<any>((resolve, reject) => {
        const n = ++mid;
        mwaits.set(n, (d) => (d.error ? reject(new Error(`${method}: ${JSON.stringify(d.error)}`)) : resolve(d.result)));
        mws.send(JSON.stringify({ id: n, method, params }));
      });
    mws.onmessage = (m) => {
      const d = JSON.parse(String(m.data));
      if (d.id) mwaits.get(d.id)?.(d), mwaits.delete(d.id);
      // Never the bridge of the user: each request to 7787 goes to the test bridge.
      else if (d.method === "Fetch.requestPaused") void mcdp("Fetch.continueRequest", { requestId: d.params.requestId, url: d.params.request.url.replace(":7787", `:${PORT}`) });
    };
    const mpage = async (expression: string) => {
      const r = await mcdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`mac page: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
      return r.result.value;
    };
    const muntil = async (expression: string, what: string, ms = 40_000) => {
      for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(250)) if (await mpage(expression).catch(() => false)) return;
      throw new Error(`FAIL: timed out: ${what}`);
    };
    await mcdp("Fetch.enable", { patterns: [{ urlPattern: "http://127.0.0.1:7787/*" }] });
    await mcdp("Emulation.setDeviceMetricsOverride", { width: 1100, height: 760, deviceScaleFactor: 2, mobile: false });
    await mcdp("Page.enable");
    // No Welcome screen of a new Mac app, and no first run after it.
    await mcdp("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('welcomed', '1')" });
    await mcdp("Page.navigate", { url: `http://localhost:${vitePort}/` });
    await muntil("document.readyState === 'complete'", "the Mac page loads");
    const button = "[...document.querySelectorAll('.attach-sheet.approval button')].find(b => b.textContent === 'Approve with Touch ID')";
    const errorText = "[...document.querySelectorAll('.attach-sheet.approval p.approval-text')].map(e => e.textContent).join(' ')";

    const first = use({ why: "Read the user name", run: 'test -n "$U" && echo set', env: { U: "op://Agent/Site/username" }, minutes: 0 });
    const ask1 = await Promise.race([askOf(), first.then((r) => { throw new Error(`FAIL: use_secret ended first: ${text(r)}`); })]);
    assert(ask1.touchId === true, "a 1Password ask on a Mac has touchId");
    assert(!(await macApprove({ id: ask1.id, key: "AAAA" })).ok, "a program on the Mac with no key of a Mac window cannot approve");
    await muntil(`!!${button}`, "the Mac card shows Approve with Touch ID");
    await Bun.sleep(400);
    const { data } = await mcdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, "card-mac.png"), Buffer.from(data, "base64"));
    console.log(`shot: ${join(SHOTS, "card-mac.png")}`);
    await mpage(`${button}.click()`);
    await muntil(`(${errorText}).includes('on the phone')`, "the first Touch ID lets the window in and sends this one to the phone");
    const macs = JSON.parse(readFileSync(join(CONFIG, "vault.json"), "utf8")).macs;
    assert(macs?.length === 1, "vault.json has the key of the window");
    const other = b64(await rawKey((await newKeys()).publicKey));
    const refused = await macApprove({ id: ask1.id, key: "", pub: other });
    assert(!refused.ok && /paste the token again/.test(refused.error), `a second Mac key cannot get in (${JSON.stringify(refused)})`);
    await page(`(async () => { const V = await import('/src/Vault.tsx'); await V.approveSecret(${JSON.stringify(ask1)}); return true })()`);
    assert(!(await first).isError, "the phone approves the first request");

    const second = use({ why: "Read the user name", run: 'test -n "$U" && echo set', env: { U: "op://Agent/Site/username" }, minutes: 0 });
    const ask2 = await askOf();
    assert(Object.keys(ask2.seals).length >= 2, "the next ask has a seal for the window and the phone");
    await muntil(`!!${button} && !(${errorText}).includes('phone')`, "the next Mac card shows");
    await mpage(`${button}.click()`);
    const got = await second;
    assert(!got.isError && JSON.parse(text(got)).output === "set", "the card of the Mac approves with Touch ID and its own key, and the command gets the value");
    await muntil("!document.querySelector('.attach-sheet.approval')", "the Mac card goes away");
    mws.close();
    await fetch(`http://127.0.0.1:${chromePort}/json/close/${target.webSocketDebuggerUrl.split("/").pop()}`);
  }

  // 6. A fill: the tab of browser-harness is on the sign-in page, and the fields get the values.
  const bh = Bun.spawn(["browser-harness"], { env, stdin: new TextEncoder().encode(`new_tab(${JSON.stringify(SITE)})\nwait_for_load()\nprint(page_info()["url"])\n`), stdout: "pipe", stderr: "pipe" });
  const opened = (await new Response(bh.stdout).text()).trim();
  assert(opened.startsWith(SITE), `browser-harness opened the sign-in page (${opened || (await new Response(bh.stderr).text()).slice(-300)})`);
  const fill = use({ why: "Sign in", fill: { "#user": "op://Agent/Site/username", "#pass": "op://Agent/Site/password" } });
  await Promise.race([until("[...document.querySelectorAll('.approval-title')].some(e => e.textContent === 'Site')", "the fill card shows"), fill.then((r) => { throw new Error("FAIL: the fill ended with no card: " + text(r)); })]);
  await Bun.sleep(400);
  await shot("card-fill.png");
  await page("[...document.querySelectorAll('.attach-sheet.approval button')].find(b => b.textContent.startsWith('Approve')).click()");
  const filled = await fill;
  assert(!filled.isError && JSON.parse(text(filled)).filled === 2 && !text(filled).includes(SECRETS.pass), "the fill typed 2 fields and gave back no value");
  const tabs = (await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json()) as { url: string; webSocketDebuggerUrl: string }[];
  const tab = new WebSocket(tabs.find((t) => t.url.startsWith(SITE))!.webSocketDebuggerUrl);
  await new Promise((r) => (tab.onopen = r));
  const values = await new Promise<string>((resolve) => {
    tab.onmessage = (m) => resolve(JSON.parse(String(m.data)).result.result.value);
    tab.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "document.querySelector('#user').value + '|' + document.querySelector('#pass').value", returnByValue: true } }));
  });
  assert(values === `${SECRETS.user}|${SECRETS.pass}`, "the sign-in page has the username and the password");
  tab.close();

  // 7. A fill on a site that is not a website of the item fills nothing.
  await until("!document.querySelector('.attach-sheet.approval')", "no card is open on the phone");
  const bad = await use({ why: "Sign in", fill: { "#pass": "op://Agent/Other/password" }, minutes: 0 });
  assert(bad.isError && /is not a website of the 1Password item Other, so nothing was asked/.test(text(bad)) && !(await page("!!document.querySelector('.attach-sheet.approval')")), `a fill on a site that is not a website of its item asks nothing (${text(bad)})`);

  // 8. The log has each answer and no value.
  const log = readFileSync(join(CONFIG, "approvals.jsonl"), "utf8");
  const lines = log.trim().split("\n").map((l) => JSON.parse(l));
  assert(["yes", "kept", "no"].every((a) => lines.some((l) => l.answer === a)) && lines.every((l) => l.kind === "secret"), `the log has the answers (${lines.map((l) => l.answer).join(", ")})`);
  assert(![SECRETS.token, SECRETS.user, SECRETS.pass, "ops_FAKE_TOKEN"].some((v) => log.includes(v)) && !readFileSync(join(TMP, "bridge.log"), "utf8").includes(SECRETS.token), "no value or token in the log or the output of the bridge");

  // The 1Password row in Settings, General, on the phone.
  await page("document.querySelector('button[aria-label=Settings]').click()");
  await until("[...document.querySelectorAll('button.row.nav')].some(b => b.textContent.trim().startsWith('General'))", "the settings open");
  await page("[...document.querySelectorAll('button.row.nav')].find(b => b.textContent.trim().startsWith('General')).click()");
  await until("[...document.querySelectorAll('.group .row span')].some(e => e.textContent.startsWith('1Password'))", "the 1Password row shows");
  await page("[...document.querySelectorAll('.group .row span')].find(e => e.textContent.startsWith('1Password')).scrollIntoView({ block: 'center' })");
  await until("[...document.querySelectorAll('.group .row span')].find(e => e.textContent.startsWith('1Password')).textContent.includes('items')", "the 1Password row loads its state", 10_000).catch(() => {});
  const row = await page("[...document.querySelectorAll('.group .row span')].find(e => e.textContent.startsWith('1Password')).textContent");
  assert(row.includes("Agent") && row.includes("3 items"), `the settings row shows the vault (${row})`);
  await shot("settings-row.png");
  await client.close();
  ws.close();
  relay.stop?.("test done");
  console.log("ALL OK");
} finally {
  await closeChrome(chrome, join(TMP, "chrome"));
  for (const p of procs) p.kill();
  login.stop(true);
  Bun.spawnSync(["browser-harness", "--reload"], { env, stdout: "ignore", stderr: "ignore" });
  rmSync(BH_TMP, { recursive: true, force: true });
  rmSync(join(TMP, "home"), { recursive: true, force: true });
  rmSync(join(TMP, "chrome"), { recursive: true, force: true });
}
