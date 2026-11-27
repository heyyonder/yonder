// Check the Canvas tab of the bridge (docs/canvas.md): `bun bridge/canvas-check.ts`. It starts bridge/main.ts on a free port
// with an empty home folder and one agent in its state, and starts no worker, so it uses no credits. It checks that an
// artifact keeps its versions and comes through /canvas and /media, that a new page of an agent does not open by itself,
// that show_app with id alone opens it only on a screen that knows the Canvas, that an agent can have several apps, that the tools learn the screen of the phone, that an app
// can be renamed, saved, deleted and brought back, and that ask_user waits for the answer of /permission, with Face ID
// only from a phone.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}

const free = Bun.serve({ port: 0, fetch: () => new Response() });
const PORT = free.port;
free.stop();
const BASE = `http://127.0.0.1:${PORT}`;
const home = realpathSync(mkdtempSync(join(tmpdir(), "yonder-home-")));
const config = join(home, ".config", `yonder-${PORT}`);
mkdirSync(config, { recursive: true });
// Agent 1 started with build_app during a call on the Mac, so its pages open on the Mac.
const now = Date.now();
const agent = { id: "w1", num: 1, sessionId: "s1", name: "Weather card", project: "check", path: home, task: "Compare the weather", status: "done", activity: "", result: "Done.", unread: false, startedAt: now, updatedAt: now, showOn: "mac" };
writeFileSync(join(config, "state.json"), JSON.stringify({ workers: [agent] }));
const bridge = Bun.spawn(["bun", join(import.meta.dir, "main.ts")], { env: { ...process.env, HOME: home, YONDER_PORT: String(PORT) }, stdout: "ignore", stderr: "inherit" });
// The app of the Mac sends its origin, so the bridge takes it as the device "mac".
const app = { origin: "http://localhost:1420", "content-type": "application/json" };

try {
  let up = false;
  for (let i = 0; i < 150 && !up && bridge.exitCode === null; i++) {
    up = await fetch(`${BASE}/mcp`).then(() => true, () => false);
    if (!up) await Bun.sleep(100);
  }
  assert(up, `the bridge starts on port ${PORT}`);
  const client = new Client({ name: "yonder-canvas-check", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
    const text = (res.content as { text: string }[]).map((c) => c.text).join("");
    if (res.isError) throw new Error(`${name}: ${text}`);
    return JSON.parse(text);
  };

  // A page of an agent never opens by itself, also in a call and with id alone.
  const first = await call("show_app", { agent: "1", title: "Paris vs Dubai", html: "<p>8°</p>" });
  assert(first.version === 1 && first.path.endsWith(`${first.id}/1.html`), "show_app keeps a new page");
  await fetch(`${BASE}/awake`, { method: "POST", headers: app });
  const second = await call("show_app", { agent: "1", id: first.id, html: "<p>9°</p>" });
  assert(second.version === 2 && /your chat/.test(second.shows) && !/opens now/.test(second.shows), "a new version of an agent does not open by itself");
  const none = await fetch(`${BASE}/show?after=0&canvas`, { headers: app }).then((r) => r.json());
  assert(none.length === 0, "/show gives no new page of an agent");
  const reopened = await call("show_app", { agent: "1", id: first.id });
  assert(reopened.version === 2 && /your chat/.test(reopened.shows) && !/opens now/.test(reopened.shows), "show_app of an agent with id alone does not open the app");
  assert((await fetch(`${BASE}/show?after=0&canvas`, { headers: app }).then((r) => r.json())).length === 0, "/show gives no page that an agent opens again");
  await fetch(`${BASE}/awake?end`, { method: "POST", headers: app });

  const list = await fetch(`${BASE}/canvas?all`, { headers: app }).then((r) => r.json());
  assert(list[0]?.id === first.id && list[0].num === 1 && list[0].versions === 2, "/canvas lists the page with its agent");
  const page = await fetch(`${BASE}/media?path=${encodeURIComponent(list[0].path)}`, { headers: app });
  assert((await page.text()) === "<p>9°</p>" && /sandbox/.test(page.headers.get("content-security-policy") ?? ""), "/media gives the newest version, sandboxed");
  const state = await fetch(`${BASE}/media?path=${encodeURIComponent(join(config, "canvas", "state.json"))}`, { headers: app });
  assert(state.status === 404, "/media gives no other file of the canvas");
  const send = (path: string) => fetch(`${BASE}/canvas`, { method: "POST", headers: app, body: JSON.stringify({ path, message: { add: "milk" } }) });
  const sent = await send(list[0].path);
  const inbox = join(config, "canvas", first.id, "inbox");
  assert(sent.status === 204 && JSON.parse(readFileSync(join(inbox, readdirSync(inbox)[0]), "utf8")).add === "milk", "a page sends a message to the inbox of its app");
  assert((await send(join(config, "canvas", "state.json"))).status === 400, "a message needs a page of an app");
  let big = "";
  await call("show_app", { agent: "1", title: "Big", html: "x".repeat(1_000_001) }).catch((e) => (big = e.message));
  assert(/1 MB/.test(big), "a page over 1 MB is refused");

  // The Canvas tab: the apps of an agent, with their icons; the screen of the phone; a rename, a save, a delete and an undo.
  const third = await call("show_app", { agent: "1", title: "paris VS dubai", html: "<p>10°</p>", icon: "<svg viewBox='0 0 64 64'><rect width='64' height='64'/></svg>" });
  assert(third.id === first.id && third.version === 3 && !third.icon, "a page with the title of an app of the agent is a new version of it, with its icon");
  const phone = { "x-yonder-device": "phone-check" };
  await fetch(`${BASE}/show?after=0&canvas&abilities=location&screen=${encodeURIComponent("402x874@3;62,0,34,0;402x726;dark")}`, { headers: phone });
  const tools = await new Client({ name: "yonder-canvas-check-2", version: "0.1.0" });
  await tools.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  const listed = (await tools.listTools()).tools;
  const show = listed.find((t) => t.name === "show_app");
  assert(!listed.some((t) => t.name === "show_artifact" || t.name === "build_artifact"), "the old names of the tools are not in the list");
  assert(/402x874 CSS px at 3x, with safe areas of 62 px at the top, 34 px at the bottom, in the dark look/.test(show?.description ?? "") && /402x726/.test(show?.description ?? ""), "show_app tells the screen of the phone");
  await tools.close();
  await call("change_app", { app: "paris vs dubai", title: "Weather", saved: true });
  const changed = (await fetch(`${BASE}/canvas?all`, { headers: app }).then((r) => r.json()))[0];
  assert(changed.title === "Weather" && changed.saved && changed.icon?.startsWith("<svg"), "change_app renames and saves an app by its name");
  const pages = () => fetch(`${BASE}/canvas?all`, { headers: app }).then((r) => r.json()) as Promise<{ id: string; archived?: number; versions: number }[]>;
  assert((await call("remove_app", { app: "weather" })).archived === "Weather" && (await pages()).find((a) => a.id === first.id)?.archived, "remove_app moves the app to the archive, with its files");
  const liveOnly = await fetch(`${BASE}/canvas`, { headers: app }).then((r) => r.json());
  assert(!liveOnly.some((a: { id: string }) => a.id === first.id), "/canvas with no ?all leaves the archive out, so a screen from before the archive does not bring the app back");
  const reshown = await call("show_app", { agent: "1", html: "<p>12°</p>" });
  assert(reshown.archived && reshown.version === 4 && (await pages()).find((a) => a.id === first.id)?.archived, "a new page of the agent goes into the archive, and does not bring the app back");
  assert((await call("undo", { check: true })).forever === false && (await call("undo")).app === "Weather" && !(await pages()).find((a) => a.id === first.id)?.archived, "undo brings an archived app back");
  await call("remove_app", { app: "weather" });
  assert(!(await call("change_app", { app: "weather", archived: false })).archived, "change_app with archived false restores the app");
  await call("remove_app", { app: "weather", forever: true });
  assert(!(await pages()).some((a) => a.id === first.id), "remove_app with forever deletes the app");
  assert((await call("undo", { check: true })).forever && (await call("undo")).app === "Weather" && (await pages())[0]?.versions === 4, "undo brings the deleted app back with its versions");
  const byOldName = await call("show_artifact", { agent: "1", id: first.id, html: "<p>11°</p>" });
  assert(byOldName.id === first.id, "show_artifact still works as the old name of show_app");
  // A task can send several apps: a new title makes a new app, and a page with no title is a new version
  // of the newest app of the agent.
  const other = await call("show_app", { agent: "1", title: "Dubai hotels", html: "<p>Hotels</p>" });
  const again = await call("show_app", { agent: "1", html: "<p>Hotels 2</p>" });
  assert(other.id !== first.id && other.version === 1 && again.id === other.id && again.version === 2, "a new title makes a second app of the agent, and a page with no title is a new version of the newest one");
  // The still of the card: the size of the card, the colors of the screen, and nothing for a file outside the canvas.
  const still = (path: string, w = 343) => fetch(`${BASE}/shot?path=${encodeURIComponent(path)}&w=${w}&h=522&s=2&look=${encodeURIComponent("--bg:#123456")}&dark`, { headers: app });
  const png = await still(again.path);
  const bytes = new Uint8Array(await png.clone().arrayBuffer());
  const chrome = await Bun.file("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome").exists();
  assert(!chrome || (png.headers.get("content-type") === "image/png" && new DataView(bytes.buffer).getUint32(16) === 686), "/shot gives the still of a page at the size of its card");
  assert((await still(join(config, "canvas", "state.json"))).status === 404 && (await still(again.path, 5000)).status === 404, "/shot gives no other file and no size out of range");

  // ask_user waits until the app answers. `whenAsked` gives the ask that agent 1 shows, as the app reads it.
  const whenAsked = async () => {
    for (let i = 0; i < 50; i++) {
      const w = (await call("list_workers", { full: true })).find((x: { num: number }) => x.num === 1);
      if (w?.ask) return w.ask;
      await Bun.sleep(100);
    }
  };
  const answer = (body: object) => fetch(`${BASE}/permission`, { method: "POST", headers: app, body: JSON.stringify(body) }).then((r) => r.json());
  const code = call("ask_user", { agent: "1", kind: "code", title: "Code for GitHub", text: "GitHub sent a code to your phone." });
  const ask = await whenAsked();
  assert(ask?.kind === "code" && ask.until > Date.now() && !ask.faceId, "agent 1 shows the ask of a code");
  // Bun ends a request with no answer after 10 seconds, unless the route turns that off.
  await Bun.sleep(11_000);
  assert((await answer({ id: ask.id, allow: true, value: "482913" })).ok, "the app sends the code after 11 seconds");
  const got = await code;
  assert(got.answer === "yes" && got.value === "482913", "ask_user gives the code to the agent");

  assert(await call("ask_user", { agent: "1", kind: "pay", title: "Top up", amount: "$20.00" }).then(() => false, (e: Error) => /link/.test(e.message)), "a payment with no link of its page is refused");
  const pay = call("ask_user", { agent: "1", kind: "pay", title: "Top up Visual Sandbox", amount: "$20.00", link: "https://checkout.stripe.com/c/pay/cs_test_a1", rows: [["Shop", "Visual Sandbox"]] });
  const payAsk = await whenAsked();
  assert(!payAsk?.faceId && payAsk.link === "https://checkout.stripe.com/c/pay/cs_test_a1" && payAsk.until - Date.now() <= 5 * 60_000, "a payment carries its page, needs no Face ID in Yonder, and waits 5 minutes");
  assert((await answer({ id: payAsk.id, allow: true })).ok && (await pay).answer === "yes", "the Mac opens the page of a payment too");
  const terms = call("ask_user", { agent: "1", kind: "terms", title: "Paid Apps Agreement", link: "https://developer.apple.com/support/terms/" });
  const termsAsk = await whenAsked();
  const yes = await answer({ id: termsAsk.id, allow: true });
  assert(termsAsk.faceId && !yes.ok && /phone/.test(yes.error), "a yes to terms from the Mac is refused");
  assert((await answer({ id: termsAsk.id, allow: false })).ok && (await terms).answer === "no", "a no from the Mac counts, and the agent gets it");

  const log = readFileSync(join(config, "approvals.jsonl"), "utf8");
  assert(log.split("\n").filter(Boolean).length === 3 && !log.includes("482913"), "approvals.jsonl has each answer, and no code");

  // close_worker with done marks agent 1 as completed, and complete_worker still works as its old name.
  assert((await call("close_worker", { worker: "1", done: true })).status === "done", "close_worker with done marks an agent as completed");
  assert((await call("complete_worker", { worker: "1" })).status === "done", "complete_worker still works as the old name of close_worker with done");
  // A close of an agent on the Done tab moves it to the Closed tab.
  assert((await call("close_worker", { worker: "1" })).status === "closed", "close_worker moves a done agent to the Closed tab");
} finally {
  bridge.kill();
  await bridge.exited;
  rmSync(home, { recursive: true, force: true });
}
