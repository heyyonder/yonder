// The check of Yonder Preview on this Mac: `bun run check-preview`. It needs no network, no Cloudflare and no bridge.
// It runs the HTTP server of bridge/preview.ts with a tunnel.json that has no token, so no cloudflared starts, and a
// test server as a project. Each request is what cloudflared gives the server: plain HTTP, with the Host of the
// preview and the headers of Cloudflare, as a browser at https://api-lab-sam.yonder.test would send it.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NO_TUNNEL, startPreview } from "./preview";

const procs: ReturnType<typeof Bun.spawn>[] = [];
// lsof gives the real path of a folder, and /var is a link to /private/var.
const dir = realpathSync(mkdtempSync(join(tmpdir(), "yonder-preview-")));

function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}
async function until(ok: () => unknown, what: string, ms = 15_000) {
  for (let t = 0; t < ms && !(await ok()); t += 100) await Bun.sleep(100);
  assert(await ok(), what);
}
const freePort = () =>
  new Promise<number>((done) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => done(port));
    });
  });

try {
  // A project with a test server: the headers that it sees, a redirect, its cookie, gzip, the cache, an upload and a WebSocket.
  const api = join(dir, "projects", "api-lab");
  mkdirSync(api, { recursive: true });
  writeFileSync(join(api, "server.ts"), `
    Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), async fetch(req, server) {
      const url = new URL(req.url);
      const h = (name) => req.headers.get(name);
      if (url.pathname === "/ws") return server.upgrade(req, { headers: { "sec-websocket-protocol": "chat" } }) ? undefined : new Response("no", { status: 400 });
      if (url.pathname === "/echo") return Response.json({ host: h("host"), origin: h("origin"), referer: h("referer"), cookie: h("cookie"), cloudflare: h("cf-connecting-ip") ?? h("x-forwarded-proto") });
      if (url.pathname === "/redirect") return new Response(null, { status: 302, headers: { location: "http://localhost:" + process.env.PORT + "/echo?from=redirect" } });
      if (url.pathname === "/cookie") return new Response("set", { headers: { "set-cookie": "lab=1; Domain=localhost; Path=/" } });
      if (url.pathname === "/gz") return new Response(Bun.gzipSync("zipped ".repeat(1000)), { headers: { "content-encoding": "gzip", "content-type": "text/plain" } });
      if (url.pathname === "/dep.js") return new Response("export {}", { headers: { "content-type": "text/javascript", "cache-control": "public, max-age=31536000, immutable" } });
      if (url.pathname === "/upload") { const b = new Uint8Array(await req.arrayBuffer()); return Response.json({ size: b.length, hash: Bun.hash(b).toString() }); }
      return new Response("<title>API lab</title>ok", { headers: { "content-type": "text/html" } });
    }, websocket: { message(ws, m) { ws.send("echo:" + m); } } });`);
  const apiPort = await freePort();
  procs.push(Bun.spawn(["bun", "server.ts"], { cwd: api, env: { ...process.env, PORT: String(apiPort) }, stdout: "ignore", stderr: "ignore" }));

  // The Mac side, with no token: only the HTTP server.
  const yonder = join(dir, "yonder");
  mkdirSync(yonder, { recursive: true });
  const port = await freePort();
  writeFileSync(join(yonder, "tunnel.json"), JSON.stringify({ domain: "yonder.test", name: "sam", port }));
  const mac = startPreview(yonder, () => [{ name: "api-lab", path: api }]);
  // The scan also lists the other web servers of this computer, as localhost-<port>.
  await until(async () => (await mac.scan()).filter((s) => s.project === "api-lab").length === 1, "the scan finds the test server in the project");

  const host = "api-lab-sam.yonder.test";
  const pub = `https://${host}`;
  const get = (path: string, init: RequestInit & { headers?: Record<string, string>; decompress?: boolean } = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      redirect: "manual",
      ...init,
      headers: { host, "cf-connecting-ip": "203.0.113.9", "x-forwarded-proto": "https", "cdn-loop": "cloudflare", ...init.headers },
    } as RequestInit);

  assert((await get("/")).status === 404, "a preview that the user did not open answers 404");
  const opened = await mac.open({ port: apiPort });
  assert(opened.url.startsWith(`${pub}/?yonder-key=`), "open gives the address <label>-<name>.<domain>, one level, with a key");
  assert((await get("/", { headers: { host: "api-lab.yonder.test" } })).status === 404, "a name without the name of the Mac opens nothing");
  assert((await get("/")).status === 403, "without the key, the preview answers 403 and shows nothing of the site");
  const keyPath = opened.url.slice(pub.length);
  const keyed = await get(keyPath);
  const setCookie = keyed.headers.get("set-cookie") ?? "";
  assert(keyed.status === 302 && keyed.headers.get("location") === "/", "the key leaves the address");
  assert(/^__Host-yonder=[^;]+; Path=\/; Secure; HttpOnly; SameSite=Lax/.test(setCookie), "the key becomes an HttpOnly, Secure, SameSite=Lax cookie of this host");
  assert((await get(keyPath)).status === 403, "the same key works one time only");
  const cookie = setCookie.split(";")[0];

  const echo = await (await get("/echo", { method: "POST", body: "x", headers: { cookie, origin: pub, referer: `${pub}/page` } })).json();
  assert(echo.host === `localhost:${apiPort}` && echo.origin === `http://localhost:${apiPort}` && echo.referer === `http://localhost:${apiPort}/page`, "the dev server sees its own Host, Origin and Referer");
  assert(!echo.cookie && !echo.cloudflare, "the dev server never sees the cookie of Yonder or the headers of Cloudflare");
  assert((await get("/redirect", { headers: { cookie } })).headers.get("location") === `${pub}/echo?from=redirect`, "a redirect to localhost goes to the HTTPS address of the preview");
  assert((await get("/cookie", { headers: { cookie } })).headers.get("set-cookie") === "lab=1; Path=/", "a cookie of the dev server for localhost sticks on the preview");
  const gz = await get("/gz", { headers: { cookie, "accept-encoding": "gzip" }, decompress: false });
  assert(gz.headers.get("content-encoding") === "gzip" && Buffer.from(Bun.gunzipSync(new Uint8Array(await gz.arrayBuffer()))).toString() === "zipped ".repeat(1000), "a gzipped answer stays gzipped once");
  assert((await get("/dep.js", { headers: { cookie } })).headers.get("cache-control") === "private, max-age=31536000, immutable", "Cloudflare may not keep a public file of the preview in its cache");
  assert((await get("/echo", { headers: { cookie } })).headers.get("cache-control") === "private", "an answer with no cache header gets private");

  const upload = new Uint8Array(6 << 20).map((_, i) => (i * 31) % 253);
  const sent = await (await get("/upload", { method: "POST", body: upload, headers: { cookie } })).json();
  assert(sent.size === upload.length && sent.hash === Bun.hash(upload).toString(), "an upload of 6 MB comes through whole");

  const socket = await new Promise<string>((done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { protocols: ["x-none", "chat"], headers: { host, cookie, origin: pub } } as any);
    ws.onopen = () => ws.send("hi");
    ws.onmessage = (m) => (done(`${ws.protocol} ${m.data}`), ws.close());
    ws.onerror = () => done("error");
    setTimeout(() => done("timeout"), 5000);
  });
  assert(socket === "chat echo:hi", "a WebSocket goes through, with the protocol that the dev server picked");

  mac.stop("api-lab");
  assert((await get("/", { headers: { cookie } })).status === 404, "a stopped preview answers nothing, also with its cookie");

  // An address that the user typed in the Tunnel tab, here the same server as localhost:<port>.
  let refused = "";
  await mac.add(`localhost:${await freePort()}`).catch((e) => (refused = (e as Error).message));
  assert(refused.startsWith("Nothing answers at"), "an address where nothing answers is not added");
  const added = await mac.add(`localhost:${apiPort}/some/page`);
  assert(added.added === `localhost-${apiPort}` && added.url === `http://localhost:${apiPort}` && added.title === "API lab", "a typed address gets a name, its origin and its title");
  assert((await mac.scan()).some((s) => s.label === added.added && s.url === added.url), "the list shows the typed address with the sites of the projects");
  const typed = { host: `${added.added}-sam.yonder.test` };
  const typedOpen = await mac.open({ label: added.added });
  const typedKey = await get(typedOpen.url.slice(`https://${typed.host}`.length), { headers: typed });
  const typedCookie = (typedKey.headers.get("set-cookie") ?? "").split(";")[0];
  const typedEcho = await (await get("/echo", { headers: { ...typed, cookie: typedCookie, origin: `https://${typed.host}` } })).json();
  assert(typedEcho.host === `localhost:${apiPort}` && typedEcho.origin === `http://localhost:${apiPort}`, "the server of a typed address sees the Host and Origin that the user typed");
  assert((await get("/redirect", { headers: { ...typed, cookie: typedCookie } })).headers.get("location") === `https://${typed.host}/echo?from=redirect`, "a redirect to the typed address goes to the preview");
  mac.remove(added.added);
  assert((await get("/", { headers: { ...typed, cookie: typedCookie } })).status === 404 && !(await mac.scan()).some((s) => s.url), "a removed address leaves the list and answers nothing");
  mac.stopAll();

  // A computer with no tunnel.json, such as a second Mac: the app gives it a tunnel from yonder.so, with no restart.
  const bare = join(dir, "bare");
  mkdirSync(bare, { recursive: true });
  const fresh = startPreview(bare, () => [{ name: "api-lab", path: api }]);
  const thrown = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as Error).message;
    }
  };
  assert(!fresh.status().on && (await fresh.open({ port: apiPort }).catch((e) => (e as Error).message)) === NO_TUNNEL, "a computer with no tunnel says how it gets one");
  assert(thrown(() => fresh.setup({ token: "t", domain: "yonder.test", name: "Work Mac" })), "a name with a space or capitals is refused");
  const freshPort = await freePort();
  fresh.setup({ token: "not-a-real-token", domain: "yonder.test", name: "work", port: freshPort });
  assert(fresh.status().suffix === "-work.yonder.test" && JSON.parse(readFileSync(join(bare, "tunnel.json"), "utf8")).name === "work", "setup writes tunnel.json and gives the new suffix");
  fresh.setup({ token: "t2", domain: "yonder.test", name: "other" });
  assert(fresh.status().suffix === "-work.yonder.test", "a computer keeps its tunnel when a second device sends one");
  const freshOpen = await fresh.open({ port: apiPort });
  const freshHost = "api-lab-work.yonder.test";
  const served = await fetch(`http://127.0.0.1:${freshPort}${freshOpen.url.slice(`https://${freshHost}`.length)}`, { redirect: "manual", headers: { host: freshHost } });
  assert(served.status === 302 && served.headers.get("set-cookie")?.startsWith("__Host-yonder="), "the new tunnel serves its previews at once");
  fresh.stopAll();
  console.log("all preview checks passed");
} finally {
  for (const p of procs) p.kill();
  rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
