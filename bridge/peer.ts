// More than one OS user on one computer, such as Bob and Mary on one Mac, each with their own Yonder (docs/wiki/bridge.md,
// "Two OS users on one computer"). Each bridge then needs its own port, and must refuse the programs of the other user.
// For one user, nothing changes: the bridge keeps port 7787, and each program of that user passes.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

export const DEFAULT_PORT = 7787;
// 7786 is the port of the phones on the local network (LAN_PORT in relay.ts), and 7788 the tunnel of Yonder Preview
// (TUNNEL_PORT in preview.ts). A bridge never takes them.
const RESERVED = new Set([7786, 7788]);
const UID = process.getuid?.() ?? -1;
// For a check only: ports that count as taken by another user, because one user cannot make that real.
const FOREIGN = new Set((process.env.YONDER_FOREIGN_PORTS ?? "").split(",").map(Number).filter(Boolean));

// The port of the bridge. `saved` is `port` of config.json, else 7787. A free port is taken. A port that a program of
// this user holds means that the bridge runs already, so it gives undefined, and the new bridge stops, as before.
// A port that another user holds is skipped, and the next free port is taken.
export function choosePort(saved: number, free: (p: number) => boolean, mine: (p: number) => boolean): number | undefined {
  if (free(saved)) return saved;
  if (mine(saved)) return undefined;
  for (let p = saved + 1; p < saved + 100; p++) if (!RESERVED.has(p) && free(p)) return p;
  return undefined;
}

// True when nothing listens at the port of `host`.
export function portFree(port: number, host = "127.0.0.1") {
  if (FOREIGN.has(port)) return false;
  try {
    Bun.serve({ port, hostname: host, fetch: () => new Response() }).stop(true);
    return true;
  } catch {
    return false;
  }
}

// True when a program of this user listens on the port, or when that is not known: the bridge then stops, as before,
// because two bridges of one user on one folder fight over the phone relay. Windows has no check, so a bridge there
// never moves.
export function mineListens(port: number) {
  if (FOREIGN.has(port)) return false;
  try {
    if (process.platform === "darwin") {
      // lsof of a user that is not root lists only the files of that user.
      // -b: no call that can block, such as a stat of a network volume that does not answer.
      const out = spawnSync("/usr/sbin/lsof", ["-b", "-w", "-a", "-u", String(UID), "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", timeout: 5000 });
      if (out.status !== 0 && out.status !== 1) return true;
      return out.stdout.trim() !== "";
    }
    if (process.platform === "linux") return linuxSockets().some((s) => s.state === "0A" && s.local === port && s.uid === UID);
  } catch {
    /* Not known: count it as mine. */
  }
  return true;
}

// The TCP sockets of the computer from /proc/net/tcp, with the uid of the owner of each one.
function linuxSockets() {
  const lines = ["/proc/net/tcp", "/proc/net/tcp6"].flatMap((f) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").slice(1) : []));
  return lines
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c.length > 7)
    .map((c) => ({ local: parseInt(c[1].split(":").pop()!, 16), remote: parseInt(c[2].split(":").pop()!, 16), state: c[3], uid: Number(c[7]) }));
}

// The local ports of the connections of this user to 127.0.0.1:`port`, from the output of
// `lsof -a -u <uid> -nP -iTCP@127.0.0.1:<port> -sTCP:ESTABLISHED -Fn`. A line of the bridge itself has the port first
// ("n127.0.0.1:7787->127.0.0.1:55891"), a line of a client has it last ("n127.0.0.1:55891->127.0.0.1:7787").
export function clientPorts(lsof: string, port: number) {
  const ports = new Set<number>();
  for (const m of lsof.matchAll(/^n(?:127\.0\.0\.1|localhost):(\d+)->(?:127\.0\.0\.1|localhost):(\d+)$/gm)) if (Number(m[2]) === port) ports.add(Number(m[1]));
  return ports;
}

// The ports of the clients of this user that connect to the bridge now. One lsof answers all the requests that wait,
// because it takes about 0.1 seconds.
async function ownClients(port: number): Promise<Set<number>> {
  if (process.platform === "linux") return new Set(linuxSockets().filter((s) => s.remote === port && s.uid === UID && s.state === "01").map((s) => s.local));
  const p = Bun.spawn(["/usr/sbin/lsof", "-b", "-w", "-a", "-u", String(UID), "-nP", `-iTCP@127.0.0.1:${port}`, "-sTCP:ESTABLISHED", "-Fn"], { stdout: "pipe", stderr: "ignore" });
  const timer = setTimeout(() => p.kill(), 5000);
  const out = await new Response(p.stdout).text();
  clearTimeout(timer);
  return clientPorts(out, port);
}
let waiting = new Map<number, ((ok: boolean) => void)[]>();
let running = false;
async function drain(port: number) {
  running = true;
  while (waiting.size) {
    const batch = waiting;
    waiting = new Map();
    // A failed lsof refuses the calls of this run: the token, the cookie and the relay still pass.
    const own = await ownClients(port).catch((e) => (console.error(`The check of the user failed: ${(e as Error).message}`), new Set<number>()));
    for (const [p, done] of batch) done.forEach((d) => d(own.has(p)));
  }
  running = false;
}

// True when the program at 127.0.0.1:`client` that called the bridge on `port` runs as this OS user. Windows has no
// check. YONDER_PEER=none makes each caller another user, for a check of a test bridge only.
export function sameUser(client: number | undefined, port: number, test: boolean): Promise<boolean> {
  if (test && process.env.YONDER_PEER === "none") return Promise.resolve(false);
  if (process.platform === "win32") return Promise.resolve(true);
  if (!client) return Promise.resolve(false);
  return new Promise((resolve) => {
    waiting.set(client, [...(waiting.get(client) ?? []), resolve]);
    if (!running) void drain(port);
  });
}

// The pid in the lock file (bridge.pid) when it is a bridge that runs, else 0. A pid that a new process took after the
// bridge ended is no bridge: its command does not name the bridge.
export function lockHolder(file: string) {
  try {
    const pid = Number(readFileSync(file, "utf8"));
    if (!pid || pid === process.pid) return 0;
    process.kill(pid, 0);
    if (process.platform === "win32") return pid;
    const command = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 5000 }).stdout;
    return /bridge/.test(command) ? pid : 0;
  } catch {
    return 0;
  }
}

// A new secret for `token` of config.json.
export const newToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
export const sameToken = (a: string | null | undefined, b: string) => !!a && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// The value of the cookie `name` in a Cookie header.
export const cookie = (header: string | null, name: string) => header?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

// `port` of the config.json at `file`, else 7787.
export function savedPort(file: string) {
  try {
    const port = JSON.parse(readFileSync(file, "utf8")).port;
    return Number.isInteger(port) && port > 1023 && port < 65536 ? port : DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

// Self-check: bun bridge/peer.ts
if (import.meta.main) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  const taken = new Set([7787, 7789]);
  const free = (p: number) => !taken.has(p);
  assert(choosePort(7787, () => true, () => true) === 7787, "a free saved port is kept");
  assert(choosePort(7787, free, () => true) === undefined, "a saved port of this user stops the new bridge");
  assert(choosePort(7787, free, () => false) === 7790, "a port of another user is skipped, and so are 7788 and taken ports");
  assert(choosePort(7790, free, () => false) === 7790, "a saved port stays");
  assert(choosePort(7785, (p) => p !== 7785, () => false) === 7787, "7786 is skipped");
  const lsof = "p870\nf7\nn127.0.0.1:62018->127.0.0.1:7787\np6131\nf7\nn127.0.0.1:7787->127.0.0.1:55891\nf9\nn127.0.0.1:5000->127.0.0.1:7789\n";
  const ports = clientPorts(lsof, 7787);
  assert(ports.has(62018) && !ports.has(55891) && !ports.has(5000) && ports.size === 1, "lsof gives only the clients of this port");
  assert(sameToken("abc", "abc") && !sameToken("abd", "abc") && !sameToken("", "abc") && !sameToken(null, "abc"), "the token compare");
  assert(cookie("a=1; yonder-7787=xyz; b=2", "yonder-7787") === "xyz" && cookie(null, "x") === undefined, "the cookie parse");
  assert(newToken().length === 32 && newToken() !== newToken(), "a new token");
  assert(savedPort("/nonexistent") === DEFAULT_PORT, "no config gives 7787");
  assert(lockHolder("/nonexistent") === 0, "no lock file gives no bridge");
}
