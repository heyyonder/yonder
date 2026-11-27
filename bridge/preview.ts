// Yonder Preview on the Mac: the local web site of a project, on the phone or any device, at its own private HTTPS
// address, such as https://sundial-sam.yonder.so. See docs/tunnel.md.
// A Cloudflare Tunnel brings the requests to this Mac. The bridge runs cloudflared, and Cloudflare sends each name of
// *.yonder.so that has no DNS record of its own to the HTTP server of this file, on 127.0.0.1. This file checks the
// cookie of each request, and passes the request to the dev server, with its WebSockets (hot reload). Nothing goes
// out until the user opens a preview. tunnel.json in the folder of Yonder turns it on. The app gets it from yonder.so
// for each computer that has none (`setup`), and `bun run setup-tunnel` wrote the first one, of the Mac of the owner.
// Check: `bun run check-preview`.
import type { Server, ServerWebSocket } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Config = {
  token?: string; // The token of the Cloudflare Tunnel, for cloudflared. Without it, only the HTTP server runs, as in the check.
  domain: string; // The zone of the previews, such as yonder.so.
  name: string; // The name of this computer. A preview is <label>-<name>.<domain>: one level, which the free certificate of Cloudflare covers.
  port?: number; // The port of the HTTP server. The tunnel sends the requests to it. TUNNEL_PORT, except in the check.
};

// A web server that runs in a project folder. `label` is its name under the zone. A site that the user typed in the
// Tunnel tab has its `url`, such as http://localhost:3000 or https://10.0.0.12:8443, and no folder.
// `frame`: false when the page does not let the viewer of the Mac show it in a frame (framable).
export type Site = { label: string; project: string; worktree?: string; path: string; port: number; host: string; title: string; pid: number; url?: string; frame?: false };
type Route = Omit<Site, "pid"> & { opened: number };
// A key opens a preview in a browser one time (`once`), or until its end time for a share. A session is the cookie
// that a key becomes. The file keeps only their hashes.
type Grant = { label: string; until: number; once?: boolean; share?: boolean };
type Saved = { routes: Record<string, Route>; keys: Record<string, Grant>; sessions: Record<string, Grant>; added: Record<string, Omit<Site, "pid">> };
type Pipe = { target: string; label: string; up?: WebSocket; queue: (string | ArrayBuffer)[] };

const KEY = "yonder-key";
const COOKIE = "__Host-yonder";
const OWN_KEY = 5 * 60_000; // A key of the user works for 5 minutes.
const SESSION = 7 * 86_400_000; // The cookie of the user lasts 7 days. Then "Open preview" in Yonder makes a new one.
const SCAN_AGE = 5_000;
export const IDLE = 30 * 60_000; // An open preview that nobody uses for 30 minutes ends. See `idle`.
export const TUNNEL_PORT = 7788; // The ingress rule of a tunnel at Cloudflare names this port, and TUNNEL_URL in tunnel() too.
// A computer gets its tunnel from yonder.so when the app is signed in, on the computer or on the phone, so a computer
// needs no Yonder source and no Cloudflare CLI for it.
export const NO_TUNNEL = "This computer has no tunnel yet. It gets one when the Yonder app on this computer or on the phone is signed in.";

const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
const random = () => Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
// A name of a site, at most 48 characters, so that "-<name of the Mac>" still fits in one DNS label of 63.
export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 48).replace(/-+$/, "") || "site";

// An address that the user typed in the Tunnel tab, such as 3000, localhost:3000 or https://10.0.0.12:8443, as an origin.
// A web site with no scheme and no port, such as example.com, is https: on http it sends the browser out of the tunnel.
export function normalize(text: string) {
  const t = text.trim();
  const web = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/.*)?$/i.test(t) && !/^localhost\b/i.test(t);
  const url = new URL(/^\d+$/.test(t) ? `http://localhost:${t}` : /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `${web ? "https" : "http"}://${t}`);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Type a web address, such as localhost:3000.");
  return url.origin;
}
// The name of an added address in the Tunnel tab, such as localhost-3000.
export function labelOf(text: string) {
  const url = new URL(normalize(text));
  return slug(`${url.hostname}-${Number(url.port) || (url.protocol === "https:" ? 443 : 80)}`);
}
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
// The ports of Yonder itself: the bridge, the phones of the local network and this tunnel. The proxy sends the Host that
// the bridge expects, so a preview of the bridge would give its tools to each person with the link.
// The port of the bridge comes from the bridge (setBridgePort), because it is not always 7787 (bridge/peer.ts).
const OWN_PORTS = [Number(process.env.YONDER_PORT) || 7787, 7786, TUNNEL_PORT];
export const setBridgePort = (port: number) => void (OWN_PORTS[0] = port);
export const ownPort = (origin: string) => {
  const url = new URL(origin);
  return LOCAL.test(url.hostname) && OWN_PORTS.includes(Number(url.port));
};

// The TCP ports that listen, from `lsof -nP -iTCP -sTCP:LISTEN -F pcn`: a process, its command, and each address.
export function parseListen(text: string) {
  const out: { pid: number; command: string; host: string; port: number }[] = [];
  let pid = 0;
  let command = "";
  for (const line of text.split("\n")) {
    if (line[0] === "p") pid = Number(line.slice(1));
    else if (line[0] === "c") command = line.slice(1);
    else if (line[0] === "n") {
      const m = /^(.+):(\d+)$/.exec(line.slice(1));
      if (m) out.push({ pid, command, host: m[1], port: Number(m[2]) });
    }
  }
  return out;
}

// The folder of each process, from `lsof -a -d cwd -p <pids> -F pn`.
export function parseCwd(text: string) {
  const out = new Map<number, string>();
  let pid = 0;
  for (const line of text.split("\n")) {
    if (line[0] === "p") pid = Number(line.slice(1));
    else if (line[0] === "n") out.set(pid, line.slice(1));
  }
  return out;
}

// The address to reach a listener on. Vite can listen only on [::1], and then 127.0.0.1 fails.
const RANK = ["127.0.0.1", "*", "[::1]", "[::]"];
const rank = (host: string) => (RANK.includes(host) ? RANK.indexOf(host) : RANK.length);
// A browser listens only for its remote debugging (Chrome on 9222), and that port gives control of the browser. It is
// never a site.
const BROWSER = /^(google chrome|chromium|brave browser|microsoft edge|opera|vivaldi|arc)\b/i;
const address = (host: string) => (host === "*" ? "127.0.0.1" : host === "[::]" ? "[::1]" : host);

// The servers that listen on the Mac, with their names: the project, then the worktree, then the port for a second
// server in the same place. A server outside the project folders is localhost-<port>. The bridge itself (`skip`) is
// not a site. The scan keeps only the servers that answer with a web page. The Tunnel tab shows each open localhost,
// also outside the project folders.
export function findSites(listen: ReturnType<typeof parseListen>, cwds: Map<number, string>, projects: { name: string; path: string }[], skip: Set<number>) {
  const best = new Map<string, (typeof listen)[number]>();
  for (const l of listen) {
    const key = `${l.pid}:${l.port}`;
    if (!skip.has(l.pid) && !BROWSER.test(l.command) && rank(l.host) < rank(best.get(key)?.host ?? "?")) best.set(key, l);
  }
  const sites: Omit<Site, "title">[] = [];
  for (const l of best.values()) {
    const cwd = cwds.get(l.pid) ?? "";
    const project = projects.filter((p) => cwd === p.path || cwd.startsWith(`${p.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
    if (!project) {
      sites.push({ label: "", project: `localhost-${l.port}`, path: cwd, port: l.port, host: address(l.host), pid: l.pid });
      continue;
    }
    // A worktree can be in a sub-folder too, such as nova/lab/.claude/worktrees/reel-time. Else its server takes the name
    // of the project, and a directory listing shows as the site of the project.
    const worktree = /(?:^|\/)\.claude\/worktrees\/([^/]+)/.exec(cwd.slice(project.path.length + 1))?.[1];
    sites.push({ label: "", project: project.name, worktree, path: cwd, port: l.port, host: address(l.host), pid: l.pid });
  }
  return name(sites);
}

// The name of each site: the project, then the worktree, then the port for a second server in the same place.
export function name<T extends { label: string; project: string; worktree?: string; port: number }>(sites: T[]) {
  const used = new Set<string>();
  for (const s of sites.sort((a, b) => a.port - b.port)) {
    const base = slug(s.worktree ? `${s.project}-${s.worktree}` : s.project);
    s.label = used.has(base) ? slug(`${base}-${s.port}`) : base;
    used.add(s.label);
  }
  return sites;
}

// The open previews that nobody used for IDLE: they end, so that a tunnel does not stay open to the web while the user
// does not use it. A preview with a share link that did not end stays open until
// the share ends. `used` is the last request or WebSocket message of each preview. It lives in memory, so a preview
// that was open before the bridge started counts from that start (`since`).
export function idle(routes: { label: string; opened: number }[], used: Map<string, number>, shared: Set<string>, since: number, now: number) {
  return routes.filter((r) => !shared.has(r.label) && now - (used.get(r.label) ?? Math.max(r.opened, since)) >= IDLE).map((r) => r.label);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", middot: "·" };
const unescape = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" || e[1] === "X" ? 2 : 1), e[1] === "x" || e[1] === "X" ? 16 : 10)) : (ENTITIES[e.toLowerCase()] ?? m),
  );

// The open previews whose server is gone for a minute: they end, so that the tunnel never stays open to a server
// that the user does not see in the Preview tab. A minute lets a dev server restart, or Next.js compile, first.
// A server that starts again in the same folder keeps the preview (see `follow`).
export function ended(routes: { label: string; path: string }[], paths: Set<string>, gone: Map<string, number>, now: number) {
  const out: string[] = [];
  for (const r of routes) {
    if (paths.has(r.path)) gone.delete(r.label);
    else if (!gone.has(r.label)) gone.set(r.label, now);
    else if (now - gone.get(r.label)! >= 60_000) out.push(r.label), gone.delete(r.label);
  }
  return out;
}

// Whether a page lets a page of another site show it in a frame: no X-Frame-Options, and no frame-ancestors with no *.
// Django and Rails send X-Frame-Options by default, and their page is then blank in a frame, with no error.
export const framable = (h: Headers) => !h.get("x-frame-options") && !/frame-ancestors(?![^;]*\*)/i.test(h.get("content-security-policy") ?? "");

// The title of the page of a server: "" for a server with no title, null when it does not answer HTTP or answers
// with no web page, and undefined when it did not answer in time (Next.js can compile for seconds), so that the next
// scan asks again. A redirect is a web page, for example to a login page. A server that answers in plain text,
// such as the Android emulator (netsimd) with "404 not found", is not a site, else it shows as a blank site.
// `noFrame` hears when the page does not let another page show it in a frame, as the viewer of the Mac does.
async function probe(url: string, local: string, noFrame?: () => void): Promise<string | null | undefined> {
  try {
    const res = await fetch(url, { redirect: "manual", headers: { host: local, accept: "text/html" }, signal: AbortSignal.timeout(1500) });
    if (!framable(res.headers)) noFrame?.();
    const isPage = (res.headers.get("content-type") ?? "").includes("html");
    if (!isPage && (res.status < 300 || res.status >= 400)) return await res.body?.cancel(), null;
    const html = isPage ? (await res.text()).slice(0, 65536) : (await res.body?.cancel(), "");
    return unescape(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? "");
  } catch (e) {
    return (e as Error).name === "TimeoutError" ? undefined : null;
  }
}

const page = (status: number, text: string) =>
  new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yonder Preview</title>` +
      `<body style="font:17px -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;padding:0 24px;text-align:center;color:#555">` +
      `<p>${text}</p>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

// Cloudflare keeps some answers in its cache, and then gives them to each browser with no cookie check. "private"
// stops that, and the browser still keeps the answer for itself. Two opposite words would leave the choice to
// Cloudflare, so "public" becomes "private".
export const privately = (cache: string | null) =>
  !cache ? "private" : /\b(private|no-store)\b/i.test(cache) ? cache : /\bpublic\b/i.test(cache) ? cache.replace(/\bpublic\b/i, "private") : `private, ${cache}`;

// `before` answers a request for a name that is not a preview, such as the Claude connector (bridge/remote.ts).
export function startPreview(dir: string, projects: () => { name: string; path: string }[], before?: (req: Request) => Promise<Response | undefined>) {
  const file = join(dir, "tunnel.json");
  const folder = join(dir, "preview");
  const saved = join(folder, "state.json");
  mkdirSync(folder, { recursive: true });
  let config: Config | undefined = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
  const state: Saved = { routes: {}, keys: {}, sessions: {}, added: {}, ...(existsSync(saved) ? JSON.parse(readFileSync(saved, "utf8")) : {}) };
  const save = () => {
    const now = Date.now();
    for (const list of [state.keys, state.sessions]) for (const [k, g] of Object.entries(list)) if (g.until < now || !state.routes[g.label]) delete list[k];
    writeFileSync(saved, JSON.stringify(state, null, 2), { mode: 0o600 });
  };
  const started = Date.now();
  const used = new Map<string, number>();
  setInterval(() => {
    const now = Date.now();
    const shared = new Set([...Object.values(state.keys), ...Object.values(state.sessions)].filter((g) => g.share && g.until > now).map((g) => g.label));
    const dead = idle(Object.values(state.routes), used, shared, started, now);
    for (const label of dead) delete state.routes[label], used.delete(label);
    if (dead.length) save();
  }, 60_000).unref();
  let error = "";
  let connected = 0; // The time that cloudflared last connected to Cloudflare.

  // The sites, from a scan at most SCAN_AGE old. A scan never blocks a caller that wants the last list.
  let sites: Site[] = [];
  let scannedAt = 0;
  let scanning: Promise<Site[]> | undefined;
  // The title of each server by its process and port: null when it does not answer HTTP, and the time of the
  // last try when it did not answer in time. Such a server is not a site, and the scan asks again after a minute.
  // Else a server that takes a connection and never answers, such as a port of Gradle, makes each scan wait 3 seconds.
  const titles = new Map<string, string | null | number>();
  // The servers (pid:port) whose page does not let the viewer of the Mac show it in a frame.
  const noFrame = new Set<string>();
  const gone = new Map<string, number>();
  // shortcut: Windows has no lsof, so the scan finds no servers there, and only an address that the user adds shows.
  // `netstat -ano` gives the ports and the pids when Windows needs the scan.
  const run = async (args: string[]) =>
    process.platform === "win32" ? "" : new Response(Bun.spawn(args, { stdout: "pipe", stderr: "ignore" }).stdout).text();
  function scan() {
    scanning ??= (async () => {
      const listen = parseListen(await run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"]));
      const pids = [...new Set(listen.map((l) => l.pid))].filter((p) => p !== process.pid);
      const cwds = pids.length ? parseCwd(await run(["lsof", "-a", "-d", "cwd", "-p", pids.join(","), "-F", "pn"])) : new Map();
      // An address that the user added keeps its own row, also when the scan finds its port.
      const found = findSites(listen, cwds, projects(), new Set([process.pid])).filter((s) => !state.added[s.label]);
      await Promise.all(
        found.map(async (s) => {
          const key = `${s.pid}:${s.port}`;
          const known = titles.get(key);
          if (known === undefined || (typeof known === "number" && Date.now() - known > 60_000)) {
            const title = await probe(`http://${s.host}:${s.port}/`, `localhost:${s.port}`, () => noFrame.add(key));
            titles.set(key, title === undefined ? Date.now() : title);
          }
        }),
      );
      // A server that does not answer HTTP takes no name, so the first web server of a project gets its name.
      sites = [
        ...name(
          found.flatMap((s) => {
            const title = titles.get(`${s.pid}:${s.port}`);
            return typeof title === "string" ? [{ ...s, title, ...(noFrame.has(`${s.pid}:${s.port}`) && { frame: false as const }) }] : [];
          }),
        ),
        ...Object.values(state.added).map((a) => ({ ...a, pid: 0 })),
      ];
      scannedAt = Date.now();
      // A preview ends when its server stops. Else it stays open, and the user cannot see or close it.
      // A site that the user typed has no folder, and stays open until the user turns it off.
      const dead = ended(Object.values(state.routes).filter((r) => !r.url), new Set(found.map((s) => s.path)), gone, scannedAt);
      for (const label of dead) delete state.routes[label];
      if (dead.length) save();
      return sites;
    })().finally(() => (scanning = undefined));
    return scanning;
  }
  const list = () => {
    if (Date.now() - scannedAt > SCAN_AGE) scan().catch(() => {});
    return sites;
  };
  // The sites from a scan at most SCAN_AGE old, else from a new scan. A tap in the Tunnel tab then does not wait for
  // lsof: each scan takes about 140 ms, and an open must not make three scans one after the other. A caller
  // that does not find its site scans again.
  const recent = () => (Date.now() - scannedAt > SCAN_AGE ? scan() : Promise.resolve(sites));

  const suffixOf = () => (config ? `-${config.name}.${config.domain}`.toLowerCase() : "");
  let suffix = suffixOf();
  const origin = (label: string) => `https://${label}${suffix}`;
  const grant = (label: string, minutes?: number) => {
    const key = random();
    state.keys[hash(key)] = minutes ? { label, until: Date.now() + minutes * 60_000, share: true } : { label, until: Date.now() + OWN_KEY, once: true };
    save();
    return `${origin(label)}/?${KEY}=${key}`;
  };
  const sessionOf = (req: Request, label: string) => {
    for (const part of (req.headers.get("cookie") ?? "").split(";")) {
      const [name, value] = part.trim().split("=");
      const s = name === COOKIE && value ? state.sessions[hash(value)] : undefined;
      if (s && s.label === label && s.until > Date.now()) return s;
    }
  };

  // The proxy. `upstream` is the address of the dev server, and `local` the Host that it expects.
  async function handle(req: Request, server: Server<Pipe>) {
    const first = await before?.(req);
    if (first) return first;
    const url = new URL(req.url);
    const host = url.hostname.toLowerCase();
    const label = suffix && host.endsWith(suffix) ? host.slice(0, -suffix.length) : "";
    const route = state.routes[label];
    if (!route) return page(404, "This preview is not open. Open it from Yonder.");
    const key = url.searchParams.get(KEY);
    if (key !== null) {
      // The key from Yonder becomes a cookie for this host only, and leaves the address.
      url.searchParams.delete(KEY);
      const back = url.pathname + url.search;
      const g = state.keys[hash(key)];
      if (g && g.label === label && g.until > Date.now()) {
        if (g.once) delete state.keys[hash(key)];
        const token = random();
        const until = g.share ? g.until : Date.now() + SESSION;
        state.sessions[hash(token)] = { label, until, share: g.share };
        save();
        const cookie = `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.round((until - Date.now()) / 1000)}`;
        return new Response(null, { status: 302, headers: { location: back, "set-cookie": cookie, "cache-control": "no-store" } });
      }
      if (sessionOf(req, label)) return new Response(null, { status: 302, headers: { location: back } });
      return page(403, "This link is used or old. Open the preview from Yonder again.");
    }
    if (!sessionOf(req, label)) return page(403, "Open this preview from Yonder.");
    used.set(label, Date.now());
    // The browser sees HTTPS at Cloudflare, and cloudflared gives this server plain HTTP, so url.origin is not the
    // address of the preview.
    const pub = origin(label);

    // The address that the server expects: localhost and its port, or the address that the user typed.
    const local = route.url ? new URL(route.url).host : `localhost:${route.port}`;
    const home = route.url ?? `http://${local}`;
    const scheme = route.url?.startsWith("https:") ? "https" : "http";
    const headers = new Headers(req.headers);
    headers.set("host", local);
    // These headers are for one connection only, and a proxy does not pass them on (RFC 9110, 7.6.1).
    for (const h of ["connection", "keep-alive", "proxy-connection", "te", "trailer", "upgrade"]) headers.delete(h);
    // The headers of Cloudflare and cloudflared. With X-Forwarded-Proto, Django and Next.js make https://localhost links.
    for (const h of [...headers.keys()]) if (h.startsWith("cf-") || h.startsWith("x-forwarded-") || h === "cdn-loop") headers.delete(h);
    // The dev server sees its own address, so its Origin and CSRF checks pass, and never the cookie of Yonder.
    const cookies = (headers.get("cookie") ?? "").split(";").map((c) => c.trim()).filter((c) => c && !c.startsWith(`${COOKIE}=`));
    if (cookies.length) headers.set("cookie", cookies.join("; "));
    else headers.delete("cookie");
    if (headers.get("origin") === pub) headers.set("origin", home);
    const referer = headers.get("referer");
    if (referer?.startsWith(`${pub}/`)) headers.set("referer", `${home}${referer.slice(pub.length)}`);
    const target = `${route.host}:${route.port}${url.pathname}${url.search}`;

    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      // Open the WebSocket of the dev server first, so the browser gets the protocol that the server picked.
      const protocols = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
      const up = new WebSocket(`${scheme === "https" ? "wss" : "ws"}://${target}`, { protocols, headers: { origin: headers.get("origin") ?? home, ...(cookies.length ? { cookie: cookies.join("; ") } : {}) } } as any);
      up.binaryType = "arraybuffer";
      const data: Pipe = { target, label, up, queue: [] };
      up.onmessage = (m) => data.queue.push(m.data);
      const opened = await new Promise<boolean>((done) => {
        up.onopen = () => done(true);
        up.onerror = () => done(false);
        setTimeout(() => done(false), 10_000);
      });
      if (!opened) return up.close(), page(502, "The server of this preview does not answer.");
      return server.upgrade(req, { data, headers: up.protocol ? { "sec-websocket-protocol": up.protocol } : undefined })
        ? undefined
        : (up.close(), new Response("Use a WebSocket", { status: 426 }));
    }

    let res: Response;
    try {
      // shortcut: an HTTPS server with a self-signed certificate, such as a router, fails here. Trust its certificate
      // only when the user asks for such a device.
      res = await fetch(`${scheme}://${target}`, { method: req.method, headers, body: req.body, redirect: "manual", decompress: false } as RequestInit);
    } catch {
      // The server stopped, or it moved to another port. The next request uses the newest scan.
      scan().then(() => follow(label)).catch(() => {});
      return page(502, "The server of this preview does not answer. It may have stopped.");
    }
    const out = new Headers(res.headers);
    const location = out.get("location");
    const self = route.url
      ? new RegExp(`^${route.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=/|$)`)
      : new RegExp(`^http://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${route.port}(?=/|$)`);
    if (location && self.test(location)) out.set("location", location.replace(self, pub));
    out.set("cache-control", privately(out.get("cache-control")));
    // A cookie of the dev server for "localhost" would not stick on the address of the preview.
    const set = res.headers.getSetCookie();
    out.delete("set-cookie");
    for (const c of set) out.append("set-cookie", c.replace(/;\s*domain=[^;]*/gi, ""));
    // shortcut: Bun 1.3 cuts a large answer short when the browser sent "Connection: close". Browsers keep their
    // connections open, so this is rare. Check it again after an update of Bun.
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  }

  // A route keeps its name when its server restarts on another port in the same folder.
  function follow(label: string) {
    const route = state.routes[label];
    const site = route && !route.url && sites.find((s) => s.path === route.path && (s.label === label || !sites.some((x) => x.label === label)));
    if (site && (site.port !== route.port || site.host !== route.host)) Object.assign(route, { port: site.port, host: site.host }), save();
  }

  // The HTTP server, on this Mac only. cloudflared brings it the requests that Cloudflare got for the previews.
  let http: Server<Pipe> | undefined;
  function serve() {
    http = Bun.serve<Pipe>({
      hostname: "127.0.0.1",
      port: config!.port ?? TUNNEL_PORT,
      fetch: handle,
      // A dev server can stream for a long time with no bytes, for example server-sent events.
      idleTimeout: 0,
      websocket: {
        maxPayloadLength: 64 << 20,
        open(ws: ServerWebSocket<Pipe>) {
          const up = ws.data.up!;
          for (const m of ws.data.queue) ws.send(m);
          ws.data.queue = [];
          up.onmessage = (m) => (used.set(ws.data.label, Date.now()), ws.send(m.data));
          // 1005 and 1006 mean that no code came, and a close frame cannot carry them.
          up.onclose = (e) => ws.close(e.code === 1005 || e.code === 1006 ? 1000 : e.code, e.reason);
        },
        message(ws: ServerWebSocket<Pipe>, m) {
          used.set(ws.data.label, Date.now());
          if (ws.data.up?.readyState === WebSocket.OPEN) ws.data.up.send(m);
        },
        close(ws: ServerWebSocket<Pipe>, code) {
          ws.data.up?.close(code === 1005 || code === 1006 ? 1000 : code);
        },
      },
    });
  }

  // cloudflared keeps the tunnel to the nearest places of Cloudflare, and starts again when it stops. Its token goes in
  // its environment, not in its arguments, which each process of the Mac can read. TUNNEL_URL is the origin of a tunnel
  // that `bun run setup-tunnel` made; a tunnel with its routes in Cloudflare ignores it.
  const CLOUDFLARED = Bun.which("cloudflared", { PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}` });
  const pidFile = join(folder, "cloudflared.pid");
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let delay = 1000;
  let stopped = false;
  function tunnel() {
    if (stopped) return;
    if (!CLOUDFLARED) return void (error = "cloudflared is not installed. Install it with: brew install cloudflared");
    const proc = Bun.spawn([CLOUDFLARED, "tunnel", "--no-autoupdate", "run"], {
      env: { ...process.env, TUNNEL_TOKEN: config!.token, TUNNEL_URL: `http://127.0.0.1:${config!.port ?? TUNNEL_PORT}` },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    });
    child = proc;
    writeFileSync(pidFile, String(proc.pid));
    (async () => {
      const decoder = new TextDecoder();
      let rest = "";
      for await (const chunk of proc.stderr) {
        const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n");
        rest = lines.pop()!;
        for (const line of lines) {
          if (line.includes("Registered tunnel connection")) (connected = Date.now()), (error = ""), (delay = 1000);
          else if (line.includes(" ERR ")) error = `cloudflared: ${line.slice(line.indexOf(" ERR ") + 5).trim()}`;
        }
      }
    })().catch(() => {});
    proc.exited.then((code) => {
      connected = 0;
      if (stopped) return;
      error ||= `cloudflared stopped with the code ${code}.`;
      setTimeout(tunnel, delay);
      delay = Math.min(delay * 2, 60_000);
    });
  }

  function start(c: Config) {
    try {
      serve();
    } catch (e) {
      error = `Yonder Preview cannot listen on port ${c.port ?? TUNNEL_PORT}: ${(e as Error).message}`;
      console.error(error);
    }
    if (http && c.token) {
      // A cloudflared that a bridge left when it stopped still holds the tunnel, and points it at a dead port.
      try {
        const old = Number(readFileSync(pidFile, "utf8"));
        if (old && Bun.spawnSync(["ps", "-p", String(old), "-o", "comm="]).stdout.toString().includes("cloudflared")) process.kill(old);
      } catch {}
      // main.ts exits on SIGTERM, so this handler also runs when the app stops the bridge.
      process.on("exit", () => child?.kill());
      tunnel();
    }
  }
  if (config) start(config);

  // Finds the site of a request: a label, a port, or a folder (the folder of an agent or a project).
  async function find(o: { label?: string; port?: number; path?: string }) {
    const pick = (all: Site[]) =>
      (o.label && all.find((s) => s.label === o.label)) ||
      (o.port && all.find((s) => s.port === o.port)) ||
      (o.path && (all.find((s) => s.path === o.path) ?? all.find((s) => s.path.startsWith(`${o.path}/`) && !s.worktree)));
    // A server that started after the last scan is not in it, so a miss scans again.
    const site = pick(await recent()) || pick(await scan());
    if (!site) throw new Error(o.port ? `No web server of a project listens on port ${o.port}.` : "No web server runs in that folder. Ask the agent to start the dev server.");
    return site;
  }
  const need = () => {
    if (!config) throw new Error(NO_TUNNEL);
  };

  return {
    // The last scan of the web servers in project folders, without waiting for a new scan.
    sites: list,
    scan,
    recent,
    // The address of a site. Opening it makes its name public, and gives a key for one browser (or for `minutes`, to share).
    async open(o: { label?: string; port?: number; path?: string; minutes?: number }) {
      need();
      const site = await find(o);
      const { pid: _, ...route } = site;
      state.routes[site.label] ??= { ...route, opened: Date.now() };
      Object.assign(state.routes[site.label], { port: site.port, host: site.host, title: site.title });
      used.set(site.label, Date.now());
      return { url: grant(site.label, o.minutes), label: site.label, project: site.project, title: site.title, port: site.port, local: site.url ?? `http://localhost:${site.port}` };
    },
    // Adds an address that the user typed in the Tunnel tab, and opens its tunnel: the user types it to reach it from
    // the phone. A local address is reached on 127.0.0.1, or on [::1] for a server such as Vite that listens only there.
    async add(text: string) {
      const url = new URL(normalize(text));
      const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
      const answers = (host: string) =>
        fetch(`${url.protocol}//${host}:${port}/`, { redirect: "manual", headers: { host: url.host }, signal: AbortSignal.timeout(3000) }).then(
          (r) => (r.body?.cancel(), true),
          () => false,
        );
      let host = url.hostname;
      if (LOCAL.test(host)) host = (await answers("127.0.0.1")) ? "127.0.0.1" : "[::1]";
      if (ownPort(url.origin)) throw new Error(`Yonder uses ${url.host} itself, so it has no preview.`);
      if (!(await answers(host))) throw new Error(`Nothing answers at ${url.origin}. Start its server first.`);
      const label = labelOf(text);
      const title = (await probe(`${url.protocol}//${host}:${port}/`, url.host)) || url.host;
      const site = { label, project: url.host, path: "", port, host, title, url: url.origin };
      state.added[label] = site;
      state.routes[label] = { ...site, opened: Date.now() };
      used.set(label, Date.now());
      save();
      sites = [...sites.filter((s) => s.label !== label), { ...site, pid: 0 }];
      return { added: label, title, url: site.url };
    },
    // Removes an address that the user typed, and ends its tunnel.
    remove(label: string) {
      if (!state.added[label]) throw new Error(`${label} is not an address that the user added.`);
      delete state.added[label];
      delete state.routes[label];
      save();
      sites = sites.filter((s) => s.label !== label);
      return { removed: label };
    },
    // Ends a preview and each cookie and share of it.
    stop(label: string) {
      const route = state.routes[label] ?? Object.values(state.routes).find((r) => r.project === label || String(r.port) === label);
      if (!route) throw new Error(`No preview named ${label} is open.`);
      delete state.routes[route.label];
      save();
      return { stopped: route.label };
    },
    // The tunnel that the app got from yonder.so for this computer (POST /preview with `tunnel`). It starts with no
    // restart of the bridge. A computer that has a tunnel keeps it, so a second device that asks changes nothing.
    setup(c: Config) {
      if (config) return { suffix };
      if (!c?.token || !/^[a-z0-9]{1,24}$/.test(c.name ?? "") || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(c.domain ?? "")) throw new Error("A tunnel needs a token, a name and a domain.");
      config = { token: c.token, domain: c.domain, name: c.name, port: c.port ?? TUNNEL_PORT };
      writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
      suffix = suffixOf();
      start(config);
      return { suffix };
    },
    status: () => ({
      on: !!config,
      suffix: suffix || undefined, // A preview is https://<label><suffix>.
      connected: !!connected,
      error: error || undefined,
      open: Object.values(state.routes).map(({ label, project, port, title }) => ({ label, project, port, title, url: origin(label) })),
    }),
    stopAll() {
      stopped = true;
      http?.stop(true);
      child?.kill();
    },
  };
}

if (import.meta.main) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  // A scan of a Mac, from docs/tunnel.md, in the form of lsof -F.
  const listen = parseListen(
    ["p100", "cnode", "f20", "n127.0.0.1:1420", "p200", "cnode", "f21", "n[::1]:5173", "p300", "cnode", "f22", "n*:5288", "f23", "n[::]:5288",
      "p400", "cPython", "f5", "n127.0.0.1:8000", "p500", "cpostgres", "f7", "n127.0.0.1:5432", "p600", "cbun", "f9", "n127.0.0.1:7787",
      "p700", "cnode", "f3", "n[::1]:5299", "p800", "cpython3", "f4", "n*:8766"].join("\n"),
  );
  assert(listen.length === 9 && listen[1].host === "[::1]" && listen[1].port === 5173, "reads the listeners of lsof, with IPv6 addresses");
  const cwds = parseCwd(["p100", "fcwd", "n/home/v/Sites/yonder/.claude/worktrees/agent-view-tabs", "p200", "fcwd", "n/home/v/Sites/yonder-landing/.claude/worktrees/minimal-landing",
    "p300", "fcwd", "n/home/v/Sites/yonder-landing", "p400", "fcwd", "n/home/v/Sites/nova/backend", "p500", "fcwd", "n/opt/homebrew/var/postgres",
    "p600", "fcwd", "n/home/v/Sites/yonder", "p700", "fcwd", "n/home/v/Sites/yonder-landing",
    "p800", "fcwd", "n/home/v/Sites/nova/lab/.claude/worktrees/reel-time"].join("\n"));
  const projects = ["yonder", "yonder-landing", "nova"].map((name) => ({ name, path: `/home/v/Sites/${name}` }));
  const found = findSites(listen, cwds, projects, new Set([600]));
  const by = Object.fromEntries(found.map((s) => [s.port, s]));
  assert(found.length === 7 && !by[7787], "keeps each server, without the bridge");
  assert(findSites(parseListen("p900\ncGoogle Chrome\nf1\nn127.0.0.1:9222"), new Map([[900, "/"]]), [], new Set()).length === 0, "never the remote debugging of a browser");
  assert(by[5432].label === "localhost-5432" && by[5432].path === "/opt/homebrew/var/postgres", "a server outside the projects is localhost-<port>");
  assert(by[1420].label === "yonder-agent-view-tabs" && by[1420].worktree === "agent-view-tabs", "a server in a worktree adds the name of the worktree");
  assert(by[5173].host === "[::1]", "a server only on [::1] is reached on [::1]");
  assert(by[5288].host === "127.0.0.1" && by[5288].label === "yonder-landing", "a server on all addresses is reached on 127.0.0.1");
  assert(by[5299].label === "yonder-landing-5299", "a second server in the same folder adds its port");
  assert(by[8000].label === "nova", "a server in a subfolder takes the name of the project");
  assert(by[8766].worktree === "reel-time" && by[8766].label === "nova-reel-time", "a worktree in a subfolder adds the name of the worktree");
  assert(slug("My App!") === "my-app" && slug("-".repeat(80) + "x") === "x" && slug("a".repeat(70)).length === 48, "a name leaves room for the name of the Mac in one DNS label");
  assert(privately(null) === "private" && privately("no-cache") === "private, no-cache", "Cloudflare does not keep an answer that has no word for it");
  assert(privately("public, max-age=31536000, immutable") === "private, max-age=31536000, immutable", "public becomes private, so Cloudflare does not keep it");
  assert(privately("no-store") === "no-store" && privately("private, max-age=60") === "private, max-age=60", "private and no-store stay as they are");
  const gone = new Map<string, number>();
  const routes = [{ label: "a", path: "/x" }, { label: "b", path: "/y" }];
  assert(ended(routes, new Set(["/x"]), gone, 0).length === 0 && gone.has("b"), "a preview whose server is gone waits");
  assert(ended(routes, new Set(["/x", "/y"]), gone, 30_000).length === 0 && !gone.has("b"), "a server that comes back keeps its preview");
  ended(routes, new Set(["/x"]), gone, 40_000);
  assert(ended(routes, new Set(["/x"]), gone, 100_000).join() === "b", "a preview ends a minute after its server");
  const use = new Map([["a", 0]]);
  const open = [{ label: "a", opened: 0 }, { label: "b", opened: 0 }, { label: "c", opened: 0 }];
  assert(idle(open, use, new Set(), 0, IDLE - 1).length === 0, "an open preview stays open for 30 minutes");
  assert(idle(open, use, new Set(["c"]), 0, IDLE).join() === "a,b", "a preview that nobody used for 30 minutes ends, but not one with a share link");
  use.set("a", IDLE);
  assert(idle(open, use, new Set(), IDLE, IDLE + 1).length === 0, "a request keeps a preview open, and a restart of the bridge counts again");
  assert(normalize("3000") === "http://localhost:3000" && normalize(" localhost:5173/app ") === "http://localhost:5173", "a port or a host with no scheme is a local http address");
  assert(normalize("https://10.0.0.12:8443/x?y") === "https://10.0.0.12:8443" && normalize("example.com/a") === "https://example.com", "an address keeps only its origin");
  assert(normalize("10.0.0.12:8080") === "http://10.0.0.12:8080" && normalize("example.com:8080") === "http://example.com:8080", "an IP address or a port stays on http");
  assert(labelOf("3000") === "localhost-3000" && labelOf("example.com") === "example-com-443", "the name of an added address has its host and port");
  assert(ownPort(normalize(String(OWN_PORTS[0]))) && ownPort(normalize("127.0.0.1:7788")) && !ownPort(normalize("3000")) && !ownPort(normalize("10.0.0.12:7787")), "the ports of Yonder itself have no preview");
  let bad = false;
  try {
    normalize("ftp://example.com");
  } catch {
    bad = true;
  }
  assert(bad, "an address that is not http or https is refused");
  assert(unescape("Yonder &mdash; talk &amp; see &#39;x&#x27;") === "Yonder — talk & see 'x'", "reads the entities of a title");
  const h = (o: Record<string, string>) => new Headers(o);
  assert(
    framable(h({})) && framable(h({ "content-security-policy": "default-src 'self'; frame-ancestors *" })) &&
      !framable(h({ "x-frame-options": "SAMEORIGIN" })) && !framable(h({ "content-security-policy": "frame-ancestors 'self'" })),
    "a page with X-Frame-Options or a narrow frame-ancestors does not show in a frame",
  );
}
