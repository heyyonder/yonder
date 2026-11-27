// Check of the port and the token of the bridge (bridge/peer.ts): `bun run check-port`. It needs no running bridge and
// starts no workers, so it uses no credits. Each bridge runs with an empty home folder, a stand-in of Claude Code, and a
// relay in this process, so the live bridge, its relay and its phones stay out of it.
// One user cannot be two users, so YONDER_PEER=none makes each caller of a test bridge another user, and
// YONDER_FOREIGN_PORTS makes a port count as taken by another user.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { linkFetch, pair } from "../src/link";

function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}
async function until(test: () => unknown, what: string, ms = 20_000) {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(200)) if (await Promise.resolve(test()).catch(() => false)) return;
  throw new Error(`FAIL: ${what}`);
}
const freePort = () => {
  const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
  const port = s.port!;
  s.stop(true);
  return port;
};

// The relay of the phones, as in relay/check.ts: the relay repository (yonder-relay) next to the main checkout.
const common = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: import.meta.dir }).stdout.toString().trim();
const relayMain = join(process.env.RELAY_DIR ?? join(common, "../../relay"), "main.ts");
const relay = existsSync(relayMain) ? (await import(relayMain)).serveRelay(0) : undefined;

const homes: string[] = [];
const bridges: ReturnType<typeof Bun.spawn>[] = [];
function home() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "yonder-port-")));
  homes.push(dir);
  mkdirSync(join(dir, ".local/bin"), { recursive: true });
  writeFileSync(join(dir, ".local/bin/claude"), "#!/bin/sh\n[ \"$1\" = agents ] && echo '[]'\nexit 0\n", { mode: 0o755 });
  return dir;
}
function start(dir: string, env: Record<string, string>) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|YONDER_)/.test(k)));
  const p = Bun.spawn(["bun", join(import.meta.dir, "main.ts")], {
    env: { ...clean, HOME: dir, PATH: `${join(dir, ".local/bin")}:${process.env.PATH}`, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  bridges.push(p);
  return p;
}
const configOf = (file: string) => JSON.parse(readFileSync(file, "utf8")) as { port?: number; token?: string };

try {
  // 1. A test bridge where each caller is another user: only the token or its cookie passes.
  {
    const port = freePort();
    const dir = home();
    start(dir, { YONDER_PORT: String(port), YONDER_PEER: "none" });
    const file = join(dir, `.config/yonder-${port}/config.json`);
    await until(() => existsSync(file) && configOf(file).token, "the test bridge writes its config.json");
    const { token } = configOf(file);
    assert(configOf(file).port === port && token!.length === 32, "config.json has the port and a token of 32 characters");
    assert((statSync(file).mode & 0o777) === 0o600, "only the user can read config.json, with the token");
    const url = `http://127.0.0.1:${port}`;
    await until(() => fetch(`${url}/version`).then(() => true), "the test bridge answers");
    const no = await fetch(`${url}/version`);
    assert(no.status === 403 && (await no.text()).includes(file), "a call of another user with no token gets 403, with the path of config.json");
    assert((await fetch(`${url}/version`, { headers: { "x-yonder-token": "x".repeat(32) } })).status === 403, "a wrong token gets 403");
    assert((await fetch(`${url}/version`, { headers: { "x-yonder-token": token! } })).ok, "the token passes");
    const pre = await fetch(`${url}/mcp`, { method: "OPTIONS", headers: { origin: "tauri://localhost", "access-control-request-headers": "x-yonder-token" } });
    assert(pre.status === 204 && pre.headers.get("access-control-allow-headers")?.includes("x-yonder-token"), "a preflight needs no token and allows the header");
    const page = await fetch(`${url}/`, { headers: { "x-yonder-token": token! } });
    const set = page.headers.get("set-cookie") ?? "";
    assert(set.startsWith(`yonder-${port}=${token};`) && /HttpOnly/.test(set) && /SameSite=Strict/.test(set), "the page gets the token as a cookie, HttpOnly and SameSite=Strict");
    const byCookie = await fetch(`${url}/version`, { headers: { cookie: `a=1; yonder-${port}=${token}` } });
    assert(byCookie.ok && !byCookie.headers.get("set-cookie"), "the cookie passes, and needs no new cookie");
    assert((await fetch(`${url}/version`, { headers: { cookie: `yonder-${port + 1}=${token}` } })).status === 403, "the cookie of another port does not pass");
    const mcp = new Client({ name: "port-check", version: "1" });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { "x-yonder-token": token! } } }));
    assert((await mcp.listTools()).tools.some((t) => t.name === "list_workers"), "an MCP client with the token lists the tools");
    await mcp.close();
    // An edit of the token by hand counts at once.
    const fresh = "y".repeat(32);
    writeFileSync(file, JSON.stringify({ ...configOf(file), token: fresh }, null, 2));
    await until(async () => (await fetch(`${url}/version`, { headers: { "x-yonder-token": fresh } })).ok, "a token that the user edits in config.json counts with no restart");
    assert((await fetch(`${url}/version`, { headers: { "x-yonder-token": token! } })).status === 403, "the old token then gets 403");
  }

  // 2. A test bridge with the real check of the user: each program of this user passes with no token.
  {
    const port = freePort();
    start(home(), { YONDER_PORT: String(port) });
    const url = `http://127.0.0.1:${port}`;
    await until(() => fetch(`${url}/version`).then(() => true), "the second test bridge answers");
    assert((await fetch(`${url}/version`)).ok, "a program of this user passes with no token (lsof)");
    const many = await Promise.all(Array.from({ length: 20 }, () => fetch(`${url}/version`).then((r) => r.status)));
    assert(many.every((s) => s === 200), "20 calls at once with no token all pass");
  }

  // 3. A live bridge whose saved port is free keeps it, as one user with 7787 does.
  {
    const kept = freePort();
    const dir = home();
    mkdirSync(join(dir, ".config/yonder"), { recursive: true });
    const file = join(dir, ".config/yonder/config.json");
    writeFileSync(file, JSON.stringify({ port: kept }));
    start(dir, {});
    await until(() => configOf(file).token, "the live bridge writes its token");
    assert(configOf(file).port === kept, "a free saved port stays the port of the bridge");
    await until(() => fetch(`http://127.0.0.1:${kept}/version`).then((r) => r.ok), "the live bridge answers there, and a program of this user passes");
    console.log("ok: the live bridge answers there, and a program of this user passes");
  }

  // 4. A live bridge whose saved port another user has: it takes the next free port, saves it, joins the relay there,
  // and a phone reaches it through the relay with the address of the wire, http://127.0.0.1:7787.
  {
    let taken = freePort();
    while ([7786, 7787, 7788].includes(taken + 1)) taken = freePort();
    const dir = home();
    const folder = join(dir, ".config/yonder");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "config.json"), JSON.stringify({ port: taken }));
    if (relay) writeFileSync(join(folder, ".env"), `YONDER_RELAY=ws://127.0.0.1:${relay.port}\n`);
    const env = { YONDER_FOREIGN_PORTS: String(taken) };
    const first = start(dir, env);
    const file = join(folder, "config.json");
    await until(() => configOf(file).port !== taken && configOf(file).token, "the live bridge saves a new port");
    const { port, token } = configOf(file);
    assert(port! > taken && ![7786, 7787, 7788].includes(port!), `the port of another user is skipped: ${taken} → ${port}`);
    const url = `http://127.0.0.1:${port}`;
    const auth = { headers: { "x-yonder-token": token! } };
    await until(() => fetch(`${url}/version`, auth).then((r) => r.ok), "the live bridge answers on its new port");
    if (relay) {
      await until(async () => (await (await fetch(`${url}/relay`, auth)).json()).connected, "the live bridge on another port joins the relay");
      const { link } = await (await fetch(`${url}/relay`, { method: "POST", ...auth })).json();
      const phone = await pair(link, "Port phone");
      const call = linkFetch(phone);
      const res = await call("http://127.0.0.1:7787/version");
      assert(res.ok && (await res.json()) === (await (await fetch(`${url}/version`, auth)).json()), "a phone reaches the bridge on its new port through the relay");
      const tools = new Client({ name: "port-phone", version: "1" });
      await tools.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:7787/mcp"), { fetch: call }));
      assert((await tools.listTools()).tools.some((t) => t.name === "list_workers"), "the phone calls the tools (POST /mcp) through the relay");
      await tools.close();
      call.close();
    } else console.log("skip: no relay at", relayMain);

    // A second start with the same home folder finds the port of its own bridge, and stops before it joins the relay.
    const second = start(dir, env);
    const code = await Promise.race([second.exited, Bun.sleep(30_000).then(() => "timeout")]);
    const err = await new Response(second.stderr).text();
    assert(code === 1 && err.includes("runs already"), `a second bridge of the same user stops (${code})`);
    assert(configOf(file).port === port && (await fetch(`${url}/version`, auth)).ok, "the first bridge keeps its port and still answers");
    assert(first.exitCode === null, "the first bridge still runs");

    // A user edits `port` while the bridge runs. The app then finds no bridge on the new port and starts one, but the
    // lock (bridge.pid) stops it, so two bridges never share one folder and one relay room.
    const edited = freePort();
    writeFileSync(file, JSON.stringify({ ...configOf(file), port: edited }, null, 2));
    const third = start(dir, env);
    const thirdCode = await Promise.race([third.exited, Bun.sleep(30_000).then(() => "timeout")]);
    assert(thirdCode === 1 && (await new Response(third.stderr).text()).includes("runs already"), `after an edit of the port, a second bridge stops (${thirdCode})`);
    assert(first.exitCode === null && (await fetch(`${url}/version`, auth)).ok, "the first bridge still answers on its old port");

    // A restart: the new bridge starts while the old one stops, waits, and then takes the port of config.json.
    first.kill();
    const next = start(dir, env);
    await until(() => fetch(`http://127.0.0.1:${edited}/version`, auth).then((r) => r.ok), "a bridge that starts while the old one stops takes the port when it is free");
    assert(next.exitCode === null && Number(readFileSync(join(folder, "bridge.pid"), "utf8")) === next.pid, "the new bridge holds the lock");
    console.log("ok: a bridge that starts while the old one stops takes the port when it is free");
  }
  console.log("All port checks passed.");
} finally {
  for (const b of bridges) b.kill();
  await Promise.all(bridges.map((b) => b.exited));
  relay?.stop?.(true);
  for (const dir of homes) rmSync(dir, { recursive: true, force: true });
}
