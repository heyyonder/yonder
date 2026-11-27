// The Mac side of the phone relay: an outbound WebSocket to the relay, the pairing with a QR code, the
// encrypted requests of the paired phones, and the links to the other computers of those phones. The relay URL is
// YONDER_RELAY in ~/.config/yonder/.env.
// The frames and the handshake are in src/link.ts. See docs/mobile.md.
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, networkInterfaces } from "node:os";
import { join } from "node:path";
import qrcode from "qrcode-generator";
import { b64, channel, linkFetch, newKeys, pack, rawKey, unb64, unpack, type Channel } from "../src/link";
import { DEFAULT_PORT } from "./peer";
import { apns } from "./push";
import { connectorOf, roomOf } from "../relay/main";

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

// The name of this computer: computerName of config.json, which the user sets in Settings › Environments, else the name of
// the system. The pairing gives it to a phone, and each phone gets it again in the answer of /peers, so a new name reaches
// the phones and, through them, the other computers.
export function computerName(dir: string) {
  try {
    const name = JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).computerName;
    if (typeof name === "string" && name.trim()) return name.trim().slice(0, 60);
  } catch {}
  try {
    return execFileSync("scutil", ["--get", "ComputerName"], { encoding: "utf8" }).trim() || hostname();
  } catch {
    return hostname();
  }
}

// The room of the Mac on the relay (a hash of its secret token), and the id of its Claude connector in the address
// https://mcp.yonder.so/<id>. The relay makes them from the token, so the bridge uses the same functions.
export { connectorOf, roomOf };
const LOCAL = "http://127.0.0.1:7787";
// The bridge paths that a phone can use. A phone cannot pair more phones or record the screen of the Mac.
// A path that is not in this list does nothing on the phone, so a new path of the phone must come here too.
// /brain is the Claude call (bridge/brain.ts).
// /subagents, /clis and /preview are the Agents tab of an agent, the CLIs of the Settings and the Tunnel switch.
// /clis/terminal and /tools are Install and Sign in of a CLI and Install of a tool.
// /location is the answer of a phone to get_location.
// /logins and /setup are the cards of the install and the sign-in of the CLIs. /setup shows a card when Claude Code is
// signed out.
// /permission is Allow and Deny of a tool call, so the agent need not wait for the Mac. /vault and /vault/approve are
// 1Password for the agents (bridge/vault.ts).
// /file is a file that the phone attaches, such as a PDF.
// /canvas is the list of the artifacts of the Canvas tab (bridge/canvas.ts); their pages come through /media, and the
// stills of their cards in a chat through /shot (bridge/shot.ts).
// /settings is the schema and the values of the Settings (bridge/settings/). /sync takes the sign-in of the phone for
// the backup of the settings, on a computer with none (bridge/sync.ts). /access is the folder step of the first run.
// /link and /link/start are the sheet and the start of a new task link (bridge/link.ts).
// /setup-agent is the last step of the first run: it starts the agent that sets up the rest.
const PATHS = new Set(["/mcp", "/token", "/car", "/grok-usage", "/claude-usage", "/commands", "/favicon", "/log", "/awake", "/transcript", "/image", "/paste", "/file", "/video", "/calls", "/conversation", "/tool", "/summary", "/summaries", "/mods", "/steer", "/model", "/mode", "/talk", "/version", "/media", "/front", "/dictate", "/show", "/brain", "/speak", "/subagents", "/clis", "/clis/terminal", "/logins", "/setup", "/tools", "/preview", "/phone-config", "/elsewhere", "/location", "/answer", "/permission", "/vault", "/vault/approve", "/canvas", "/shot", "/ui", "/agent-name", "/settings", "/sync", "/access", "/link", "/link/start", "/setup-agent", "/people"]);
// The paths that another computer can use: the tools, and the chat of an agent, which the Mac shows when the user opens an
// agent of another computer (`/peer` in main.ts). The tools already let it start an agent there, so the chat gives it no
// more power.
// /claude-usage gives the title bar of the Mac the usage of the computer that its environment dropdown picks.
// /image takes a picture that the user pastes or drops in the chat of an agent of this computer on the Mac. The tools
// already let the other computer give an agent any task, so a saved picture gives it no more power.
const PEER_PATHS = new Set(["/mcp", "/conversation", "/summary", "/commands", "/subagents", "/tool", "/canvas", "/media", "/shot", "/favicon", "/claude-usage", "/image"]);
// The paths of the keys in Swift of a phone: the car call and the watch (CarCall.swift), and the share sheet
// (ShareViewController.swift). They have no Face ID, so they get only these, not the yes of an approval or 1Password.
const CAR_PATHS = new Set(["/mcp", "/car", "/token", "/awake", "/paste", "/log", "/transcript", "/file", "/video"]);
const HEADERS = ["content-type", "accept", "mcp-session-id", "mcp-protocol-version", "last-event-id"];
const PAIR_TIME = 5 * 60_000; // A pairing code works one time, for 5 minutes.
// The short id of a phone, from the end of its public key, as linkCar in src/bridge.ts makes it. The bridge opens the
// site of show_on_device on the device that sent the last message.
export const deviceId = (pub: string) => pub.replace(/=+$/, "").slice(-16);
// The mark of a request that came through the relay from a paired phone (fromPhone in main.ts). It lives only in the memory
// of the bridge. A check that runs its relay in its own process gives the same value to its bridge with YONDER_RELAY_MARK,
// which counts only with a test port in YONDER_PORT (TEST in main.ts), so the live bridge never takes a known mark.
const testPort = Number(process.env.YONDER_PORT);
export const RELAY_MARK = (!!testPort && testPort !== DEFAULT_PORT && process.env.YONDER_RELAY_MARK) || crypto.randomUUID();

type Bytes = Uint8Array<ArrayBuffer>;
// Another computer of a paired phone: its name, its relay, its room and its public key (`/peers`).
export type Peer = { name: string; relay: string; room: string; pub: string };
// push: the APNs device token. car: the public key of the Swift call of the CarPlay screen (docs/carplay.md). The web
// view keeps the key of the phone in IndexedDB, where Swift cannot read it, so the car has its own key. watch: the
// public key of the Apple Watch app of that phone (docs/watch.md), which the phone gives too. peers: the other
// computers of the phone. guard: the public key of Face ID for the relay (GUARD), and open: until when that phone can
// use the relay with no new Face ID.
type Phone = { pub: string; name: string; added: number; seen?: number; version?: string; device?: string; connects?: number; push?: string; car?: string; watch?: string; peers?: Peer[]; guard?: string; open?: number };
// relay.json holds the private key of the Mac, so the bridge writes it with mode 600.
type Config = { token: string; key: JsonWebKey; pub: string; phones: Phone[] };
// out: sends one frame to the phone. end: closes its connection with a reason. lan: the phone came over the local network,
// not through the relay.
// challenge: the bytes that the phone signs for Face ID on the relay (GUARD). Each challenge works one time.
// hello: the first message of a phone, kept until its first frame opens and so proves its key.
type Session = { queue: Promise<unknown>; out(frame: Uint8Array): void; end(reason: string): void; lan?: boolean; ch?: Channel; pub?: string; secret?: Bytes; phone?: Phone; peer?: Peer; challenge?: Bytes; hello?: Record<string, any> };

// GUARD, Face ID for the relay: a phone with a guard key gets no answer through the relay (423) until it signs a challenge
// of the Mac with that key. The Secure Enclave of the iPhone signs only after Face ID or the passcode (Guard.swift), so a
// copy of the pairing key or a bad front end alone cannot use the relay. One yes opens the relay for that phone until it
// connects over the local network again, 12 hours at most. The Mac checks it, so a fault on the phone cannot skip it.
// The car and the watch have their own keys in Swift, which the web view cannot read, and no Face ID, so they are free,
// but only on CAR_PATHS, and a new key of theirs needs the guard signature (`guarded` in serve).
const OPEN_TIME = 12 * 60 * 60_000;
const challengeOf = (s: Session) => (s.challenge ??= crypto.getRandomValues(new Uint8Array(32)));
// True when `sig` signs the challenge of the session with the P-256 key `pub`: r and s, 64 bytes, as CryptoKit gives them.
async function signed(s: Session, pub: unknown, sig: unknown) {
  const challenge = s.challenge;
  s.challenge = undefined;
  if (!challenge || typeof pub !== "string" || typeof sig !== "string") return false;
  try {
    const key = await crypto.subtle.importKey("raw", unb64(pub), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, unb64(sig), challenge);
  } catch {
    return false;
  }
}

// The port where a phone on the same network reaches the bridge with no relay (`lanPort` of connectRelay). 7788 is the
// tunnel of Yonder Preview. The phone uses the relay only when it must, such as on 5G.
export const LAN_PORT = 7786;
// Only a device of a private network, a VPN such as Tailscale (100.64.0.0/10) included: a cafe or a hotel can give the
// Mac a public address.
const nearby = (ip: string) => /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip);
let localName: string | undefined;
// The addresses where a phone on the same network finds the bridge: the Bonjour name of the Mac, which stays when the
// router gives the Mac a new address, and each private IPv4 address. The phone gets them through the encrypted link (/lan).
function lanUrls(port: number) {
  if (localName === undefined)
    try {
      localName = process.platform === "darwin" ? `${execFileSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8" }).trim()}.local` : "";
    } catch {
      localName = "";
    }
  const ips = Object.values(networkInterfaces()).flatMap((list) => (list ?? []).filter((a) => a.family === "IPv4" && !a.internal && nearby(a.address)).map((a) => a.address));
  return [...(localName ? [localName] : []), ...ips].map((host) => `ws://${host}:${port}`);
}

// `handle` runs the request of a phone on the bridge. The bridge passes fetch, so the Host and Origin checks stay.
// `info`: the app version and the kind of computer, which the relay passes to the backstage.
// `connector` answers a request of the Claude connector, with the id of the connector. The relay sends it in clear, not
// end to end encrypted, so it goes only to the connector, which checks the OAuth token of each request.
// `lanPort`: the port of the local network for the phones (LAN_PORT), 0 for any free port, or none.
export function connectRelay(
  relay: string,
  dir: string,
  team: string,
  handle: (req: Request) => Promise<Response>,
  info: Record<string, string> = {},
  connector?: (req: Request, id: string) => Promise<Response>,
  lanPort?: number,
) {
  const url = relay.replace(/\/+$/, ""); // "wss://relay.example.com/" would give "//host".
  const file = join(dir, "relay.json");
  let config: Config | undefined;
  let key: CryptoKey;
  let room = "";
  let connectorId = "";
  let ws: WebSocket | undefined;
  let connected = false;
  let stopped = false;
  let delay = 1000;
  let pending: { secret: Bytes; until: number } | undefined;
  // The code that paired a phone last, until it runs out. A second scan of it gets a true answer: the code paired that
  // phone already. So the answer agrees with `yonder pair`, which says that the phone paired.
  let used: { secret: Bytes; until: number; name: string } | undefined;
  // The relay gives a number to each phone. A phone of the local network gets a number below 0, so the two never meet.
  const sessions = new Map<number, Session>();
  let lanNext = 0;
  const save = () => writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  const apple = apns(dir, team);
  // The other computers that the paired phones introduced (`/peers`), each one time. This bridge reaches each of them
  // through the relay with no phone, and each of them can reach this bridge. So the link works with the app closed:
  // a phone carries a call only while the app is on the screen.
  const peers = () => [...new Map((config?.phones ?? []).flatMap((p) => p.peers ?? []).map((p) => [p.pub, p])).values()];
  // A peer gets a fetch as a phone has one (src/link.ts), with the key of this Mac as the key of the phone.
  const links = new Map<string, ReturnType<typeof linkFetch>>();
  const linkKey = (p: Peer) => `${p.pub} ${p.relay} ${p.room}`;
  const reach = (p: Peer) => {
    let link = links.get(linkKey(p));
    if (!link) links.set(linkKey(p), (link = linkFetch({ relay: p.relay, room: p.room, mac: p.pub, pub: config!.pub, key: { privateKey: key } as CryptoKeyPair, name: p.name })));
    return link;
  };
  // A computer that no phone lists any more loses its open connections and its link, as after an unpair.
  const forget = () => {
    const pubs = new Set(peers().map((p) => p.pub));
    const keys = new Set(peers().map(linkKey));
    for (const s of sessions.values()) if (s.peer && !pubs.has(s.peer.pub)) s.end("No phone lists this computer any more.");
    for (const [k, link] of links) if (!keys.has(k)) (link.close(), links.delete(k));
  };

  // `fresh` makes a new identity: a new token, a new key and no phones.
  const init = async (fresh = false) => {
    if (existsSync(file) && !fresh) config = JSON.parse(readFileSync(file, "utf8")) as Config;
    else {
      const keys = await newKeys(true);
      const token = b64(crypto.getRandomValues(new Uint8Array(32)));
      config = { token, key: await crypto.subtle.exportKey("jwk", keys.privateKey), pub: b64(await rawKey(keys.publicKey)), phones: [] };
      save();
    }
    key = await crypto.subtle.importKey("jwk", config.key, ECDH, false, ["deriveBits"]);
    room = await roomOf(config.token);
    connectorId = await connectorOf(config.token);
  };
  const ready = init();
  ready.then(open, (e) => console.error(`Yonder relay: ${(e as Error).message}`));

  function open() {
    if (stopped) return;
    const socket = new WebSocket(`${url}/host?${new URLSearchParams({ token: config!.token, ...info })}`);
    socket.binaryType = "arraybuffer";
    ws = socket;
    // The relay answers each ping, and it shows the Mac as offline to the phones after 15 seconds with no ping.
    // Without an answer for 6 seconds, for example after a sleep, connect again.
    let missed = 0;
    const beat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      // The code 4001 tells the relay statistics that this is a drop, not a normal close.
      if (++missed > 2) return socket.close(4001, "No answer to the pings");
      socket.send("ping");
    }, 3000);
    socket.onopen = () => {
      connected = true;
      delay = 1000;
      console.log(`Yonder relay: connected to ${url}`);
    };
    socket.onmessage = (m) => {
      missed = 0;
      if (typeof m.data === "string") {
        if (m.data === "pong") return;
        try {
          const msg = JSON.parse(m.data);
          if (msg.open) sessions.set(msg.open, viaRelay(socket, msg.open));
          if (msg.close) sessions.delete(msg.close);
          if (msg.http) void forward(socket, msg);
        } catch {}
        return;
      }
      const data = new Uint8Array(m.data as ArrayBuffer);
      const id = new DataView(data.buffer).getUint32(0);
      const s = sessions.get(id);
      if (!s) return;
      const frame = data.slice(4);
      // One frame at a time for each phone, because each frame has the next counter.
      s.queue = s.queue.then(() => receive(s, frame)).catch((e) => s.end((e as Error).message));
    };
    socket.onclose = (e) => {
      clearInterval(beat);
      if (connected) console.log(`Yonder relay: disconnected from ${url}`);
      connected = false;
      for (const id of sessions.keys()) if (id > 0) sessions.delete(id);
      if (ws !== socket || stopped) return;
      // Another bridge with the same token took the room, for example a Mac with a copy of relay.json.
      // Do not take it back, or the two bridges take turns. Make a new identity, so that this Mac has its own room.
      if (e.code === 4000) {
        // The relay sends this code, so a bad relay could wipe the pairings. relay.json.bak keeps the last identity with
        // phones, and a second 4000 does not replace it with an empty one. To go back, stop the bridge and copy it back.
        if (config?.phones.length) copyFileSync(file, `${file}.bak`), chmodSync(`${file}.bak`, 0o600);
        console.log(`Yonder relay: ${e.reason}. This Mac makes its own identity. Pair the phones with it again, or put back ${file}.bak.`);
        return void init(true).then(open, (err) => console.error(`Yonder relay: ${(err as Error).message}`));
      }
      // Try again soon, so the phones wait only a few seconds after the Mac wakes.
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 5000);
    };
  }

  // A request of the Claude connector, from the relay: one text frame in, one text frame out.
  async function forward(socket: WebSocket, msg: { http: number; method: string; path: string; origin: string; headers: Record<string, string>; body: string }) {
    const get = msg.method === "GET" || msg.method === "HEAD";
    const res = connector
      ? await connector(new Request(`${msg.origin}${msg.path}`, { method: msg.method, headers: msg.headers, body: get ? undefined : msg.body }), connectorId).catch(
          (e) => new Response((e as Error).message, { status: 502 }),
        )
      : new Response("Not found", { status: 404 });
    const headers = Object.fromEntries(res.headers);
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ http: msg.http, status: res.status, headers, body: await res.text() }));
  }

  // A phone through the relay: its frames start with its number, and the relay closes its socket.
  const viaRelay = (socket: WebSocket, id: number): Session => ({
    queue: Promise.resolve(),
    out(frame) {
      const data = new Uint8Array(4 + frame.length);
      new DataView(data.buffer).setUint32(0, id);
      data.set(frame, 4);
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    },
    end(reason) {
      sessions.delete(id);
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ close: id, reason }));
    },
  });

  // The phones of the local network connect here with the protocol of the relay, so no frame leaves the network. Only a
  // socket for the room of this Mac opens, and its frames need a paired key, as through the relay. The HTTP endpoints of
  // the bridge stay on 127.0.0.1.
  let lan: Bun.Server<{ id: number }> | undefined;
  if (lanPort !== undefined)
    try {
      lan = Bun.serve<{ id: number }>({
        port: lanPort,
        hostname: "0.0.0.0",
        async fetch(req, server) {
          await ready;
          const url = new URL(req.url);
          if (url.pathname !== "/phone" || url.searchParams.get("room") !== room || !nearby(server.requestIP(req)?.address ?? "")) return new Response("Not found", { status: 404 });
          return server.upgrade(req, { data: { id: --lanNext } }) ? undefined : new Response("Use a WebSocket", { status: 426 });
        },
        websocket: {
          // An image from the phone is 20 MB at most, as through the relay.
          maxPayloadLength: 64 << 20,
          // As on the relay: when more than 64 MB waits to go out, the socket closes, and the phone connects again. Else
          // Bun drops the frame past 16 MB and sends the next one, so the next frame does not open on the phone, and
          // the phone asks to pair again (Sentry YONDER-D).
          backpressureLimit: 64 << 20,
          closeOnBackpressureLimit: true,
          open(ws) {
            const { id } = ws.data;
            sessions.set(id, {
              queue: Promise.resolve(),
              lan: true,
              out: (frame) => void ws.send(frame),
              // 4003, as from the relay, so that a revoked phone forgets the pairing (src/link.ts).
              end: (reason) => (sessions.delete(id), ws.close(4003, reason.slice(0, 120))),
            });
          },
          message(ws, msg) {
            const s = sessions.get(ws.data.id);
            if (!s || typeof msg === "string") return;
            const frame = new Uint8Array(msg);
            s.queue = s.queue.then(() => receive(s, frame)).catch((e) => s.end((e as Error).message));
          },
          close(ws) {
            sessions.delete(ws.data.id);
          },
        },
      });
    } catch (e) {
      console.error(`Yonder relay: no local network for the phones: ${(e as Error).message}`);
    }

  // A push notification to each paired phone that gave a device token. Gives the number of phones that got it. `to`: only
  // the phones with these device IDs (deviceId), such as the phones of the person who started a task (docs/multi-user.md).
  async function push(title: string, body: string, to?: string[]) {
    await ready.catch(() => {});
    let sent = 0;
    for (const phone of config?.phones.filter((p) => p.push && (!to || to.includes(deviceId(p.pub)))) ?? []) {
      const took = await apple.send(phone.push!, title, body).catch((e) => void console.error(`Yonder push: ${(e as Error).message}`));
      if (took === false) (phone.push = undefined), save();
      if (took) sent++;
    }
    return sent;
  }

  async function send(s: Session, head: object, body?: Uint8Array) {
    s.out(await s.ch!.seal(pack(head, body)));
  }

  async function receive(s: Session, frame: Bytes) {
    if (!s.ch) return hello(s, unpack(frame).head);
    const data = await s.ch.open(frame).catch(() => {
      throw new Error(s.phone || s.peer ? "A frame did not open." : `The pairing code is wrong or old. Make a new code on ${computerName(dir)}.`);
    });
    if (s.hello) greeted(s);
    const { head, body } = unpack(data);
    if (!s.phone && !s.peer) {
      // The first message of a pairing. It opened, so the phone knows the secret of the QR code.
      if (used && used.secret === s.secret) throw new Error(`This code paired ${used.name} already. To pair another phone, make a new code on ${computerName(dir)}.`);
      if (typeof head.pair !== "string" || pending?.secret !== s.secret || pending!.until < Date.now())
        throw new Error(`The pairing code is wrong or old. Make a new code on ${computerName(dir)}.`);
      s.phone = { pub: s.pub!, name: head.pair.slice(0, 60) || "Phone", added: Date.now() };
      used = { ...pending!, name: s.phone.name };
      pending = undefined;
      config!.phones = [...config!.phones.filter((p) => p.pub !== s.pub), s.phone];
      save();
      console.log(`Yonder relay: paired ${s.phone.name}`);
      // The phones that were paired before hear of each new phone, so a pairing that the user did not make shows.
      const before = config!.phones.filter((p) => p.pub !== s.pub).map((p) => deviceId(p.pub));
      if (before.length) void push("A new phone paired", `${s.phone.name} can now use ${computerName(dir)}. If it is not yours, revoke it in Pair a phone on that computer.`, before);
      return send(s, { id: head.id, paired: true });
    }
    // The requests of one phone run at the same time. Only the frames go one at a time.
    serve(head, body, s)
      .then(
        (answer) => send(s, { id: head.id, ...answer.head }, answer.body),
        (e) => send(s, { id: head.id, status: 500, headers: {} }, new TextEncoder().encode((e as Error).message)),
      )
      .catch(() => {});
  }

  async function hello(s: Session, head: Record<string, any>) {
    if (head.v !== 1) throw new Error("Update the Yonder app on the phone.");
    if (head.pair) {
      // A used code that has not run out yet still opens the channel, so the first message can say that it paired already.
      const open = pending && pending.until >= Date.now() ? pending : used && used.until >= Date.now() ? used : undefined;
      if (!open) throw new Error(`No pairing code is open on ${computerName(dir)}. Make a new code.`);
      s.secret = open.secret;
    } else {
      s.phone = config!.phones.find((p) => p.pub === head.pub || (!!p.car && p.car === head.pub) || (!!p.watch && p.watch === head.pub));
      if (!s.phone) s.peer = peers().find((p) => p.pub === head.pub);
      if (!s.phone && !s.peer) throw new Error("This phone is not paired with the Mac. Pair it again.");
    }
    s.pub = String(head.pub);
    const ephemeral = await newKeys();
    const epub = await rawKey(ephemeral.publicKey);
    s.ch = await channel({ key, pub: unb64(config!.pub), ephemeral, epub }, { pub: unb64(s.pub), epub: unb64(String(head.epub)) }, false, s.secret);
    s.out(pack({ v: 1, epub: b64(epub) }));
    // Anyone can send a hello with the public key of a paired phone, so the bridge writes nothing until a frame opens.
    if (s.phone) s.hello = head;
  }

  // The first frame of a phone opened, so the phone has its key: the bridge keeps what its hello said.
  function greeted(s: Session) {
    const head = s.hello!;
    s.hello = undefined;
    if (!s.phone) return;
    s.phone.seen = Date.now();
    // The app version of the phone. A phone from before this field sends none.
    if (typeof head.version === "string") s.phone.version = head.version.slice(0, 40);
    // The model and system of the phone, and "simulator" or "emulator" for a test device.
    if (typeof head.device === "string") s.phone.device = head.device.slice(0, 80);
    s.phone.connects = (s.phone.connects ?? 0) + 1;
    // The phone is back on the local network, so its next connection through the relay asks for Face ID again.
    if (s.lan && s.pub === s.phone.pub) s.phone.open = undefined;
    save();
  }

  // Runs one request of a phone on the bridge, if the path is one that a phone can use. Another computer, with no
  // phone, can only call the tools and read the chats (PEER_PATHS), with no device, as a program on this Mac.
  // `blockedComputers` of config.json: the names or public keys of the other computers that this one does not let in,
  // also when a phone introduced them. The phone sets it in the details of a computer (Settings, Environment), and the
  // user can edit it by hand. So a link can go in one way, or none. A blocked computer gets a 403, not
  // a closed connection, so its bridge knows that the call left it and does not send it through the phone instead.
  const blocked = (p: Peer) => {
    try {
      const list = JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).blockedComputers;
      return Array.isArray(list) && list.some((x) => typeof x === "string" && (x === p.pub || x.toLowerCase() === p.name.toLowerCase()));
    } catch {
      return false;
    }
  };
  async function serve(head: Record<string, any>, body: Bytes, s: Session) {
    const { phone, peer } = s;
    const target = new URL(String(head.path ?? ""), LOCAL);
    const json = () => JSON.parse(new TextDecoder().decode(body));
    const own = !!phone && s.pub === phone.pub;
    // GUARD: through the relay, a phone with a guard key that is not open gets only the challenge, and its addresses on
    // the local network, which need no Face ID.
    if (own && phone.guard && !s.lan && !((phone.open ?? 0) > Date.now()) && !["/unlock", "/guard", "/lan"].includes(target.pathname))
      return { head: { status: 423, headers: {}, challenge: b64(challengeOf(s)) }, body: new TextEncoder().encode("Allow the relay with Face ID on the phone.") };
    // A new car key, watch key or computer gets paths of this phone, so with Face ID for the relay it needs a signature of
    // the guard key, also on the local network and while the relay is open. The same value again needs none, because the
    // phone sends it at each start. 428 gives the challenge, and the phone sends the request again with `sig`
    // (guardedPost in src/link.ts). Gives the answer that stops the change, or undefined.
    const guarded = async (changed: boolean, sig: unknown) =>
      !changed || !phone?.guard
        ? undefined
        : typeof sig !== "string"
          ? Response.json({ challenge: b64(challengeOf(s)) }, { status: 428 })
          : (await signed(s, phone.guard, sig))
            ? undefined
            : new Response("The signature does not match the Face ID key of this phone.", { status: 403 });
    let res: Response;
    let stop: Response | undefined;
    if (own && target.pathname === "/unlock" && head.method === "POST") {
      // The signature of the challenge opens the relay for this phone.
      const ok = !phone.guard || (await signed(s, phone.guard, json().sig));
      if (ok && phone.guard && !s.lan) (phone.open = Date.now() + OPEN_TIME), save();
      res = ok ? Response.json({ ok }) : new Response("The signature does not match the Face ID key of this phone.", { status: 403 });
    } else if (own && target.pathname === "/guard") {
      // GET: the state and a challenge. POST { pub, sig }: a new key, or "" for none. A change needs the signature of the
      // key in use, so a bad front end cannot turn it off. The first key signs for itself, which proves that it works.
      const { pub, sig } = head.method === "POST" ? json() : ({} as Record<string, unknown>);
      if (head.method !== "POST") res = Response.json({ on: !!phone.guard, challenge: b64(challengeOf(s)) });
      else if (!(await signed(s, phone.guard ?? pub, sig))) res = new Response("The signature does not match the Face ID key of this phone.", { status: 403 });
      else {
        phone.guard = typeof pub === "string" && pub ? pub : undefined;
        // The user gave Face ID now, so this phone keeps the relay that it uses.
        phone.open = phone.guard && !s.lan ? Date.now() + OPEN_TIME : undefined;
        save();
        res = Response.json({ on: !!phone.guard });
      }
    } else if (own && target.pathname === "/push" && head.method === "POST") {
      // The phone gives its APNs device token. The bridge keeps it with the phone, so Remove also stops the pushes.
      phone.push = String(JSON.parse(new TextDecoder().decode(body)).token ?? "").replace(/[^0-9a-f]/gi, "") || undefined;
      save();
      res = Response.json({ ok: true });
    } else if (own && (target.pathname === "/car-key" || target.pathname === "/watch-key") && head.method === "POST") {
      // The phone gives the key of its car call, or of its watch. It is a key of that phone, so Remove also removes it.
      // The watch has its own path, so that a bridge from before the watch refuses it and keeps the key of the car.
      const { pub: raw, sig } = json();
      const pub = String(raw ?? "");
      const slot = target.pathname === "/watch-key" ? "watch" : "car";
      const valid = await Promise.resolve()
        .then(() => crypto.subtle.importKey("raw", unb64(pub), ECDH, false, []))
        .then(() => true, () => false);
      if (!valid) res = new Response("Not a P-256 public key.", { status: 400 });
      else if ((stop = await guarded(phone[slot] !== pub, sig))) res = stop;
      else (phone[slot] = pub), save(), (res = Response.json({ ok: true }));
    } else if (own && target.pathname === "/peers" && head.method === "POST") {
      // The other computers of the phone (introduce in src/elsewhere.ts). An empty list takes them back.
      const { peers: list, sig } = json();
      const next: Peer[] = (Array.isArray(list) ? list : [])
        .filter((p) => typeof p?.pub === "string" && typeof p.room === "string" && typeof p.relay === "string" && /^wss?:\/\//.test(p.relay) && p.pub !== config!.pub)
        .slice(0, 20)
        .map((p) => ({ name: String(p.name ?? "").slice(0, 60) || "Computer", relay: p.relay.replace(/\/+$/, ""), room: p.room, pub: p.pub }));
      // A new name, or a computer less, needs no signature: only a computer that can reach this one with a new address.
      const added = next.some((n) => !(phone.peers ?? []).some((o) => linkKey(o) === linkKey(n)));
      if ((stop = await guarded(added, sig))) res = stop;
      else {
        phone.peers = next;
        save();
        forget();
        res = Response.json({ ok: true, name: computerName(dir) });
      }
    } else if (phone && target.pathname === "/lan") {
      // The addresses of this bridge on the local network, so that the phone tries them before the relay next time.
      res = Response.json(lan ? lanUrls(lan.port!) : []);
    } else if (!phone && peer && blocked(peer)) {
      res = new Response(`This computer does not let ${peer.name} reach it.`, { status: 403 });
    } else if (target.origin !== LOCAL || !(own ? PATHS : phone ? CAR_PATHS : PEER_PATHS).has(target.pathname)) {
      res = new Response(phone ? "A phone cannot use this path." : "Another computer can only call the tools and read the chats.", { status: 403 });
    } else {
      // Another computer calls the tools as itself, never as an agent of this computer.
      if (!phone && target.pathname === "/mcp") target.searchParams.delete("worker"), target.searchParams.delete("key");
      const method = String(head.method ?? "GET").toUpperCase();
      const headers = Object.fromEntries(Object.entries(head.headers ?? {}).filter(([k]) => HEADERS.includes(k.toLowerCase()))) as Record<string, string>;
      // The bridge sets these headers, never the phone, so that the bridge knows which phone sent the request. Any program on
      // the Mac can send `x-yonder-device` too, but not RELAY_MARK.
      if (phone) Object.assign(headers, { "x-yonder-device": deviceId(phone.pub), "x-yonder-relay": RELAY_MARK });
      // The screen version of the phone, so the bridge can answer an old screen in the form it knows (`renamed` in main.ts).
      if (phone?.version) headers["x-yonder-app"] = phone.version;
      res = await handle(new Request(target, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : body }));
    }
    const headers = Object.fromEntries([...res.headers].filter(([k]) => HEADERS.includes(k)));
    return { head: { status: res.status, headers }, body: new Uint8Array(await res.arrayBuffer()) };
  }

  // `via` of a phone: "lan" or "relay" while it has a connection, for the list of the paired phones.
  const viaOf = (pub: string) => {
    const open = [...sessions.values()].filter((s) => s.phone?.pub === pub && s.pub === pub);
    return open.some((s) => s.lan) ? "lan" : open.length ? "relay" : undefined;
  };
  const status = () => ({
    relay: url,
    connected,
    room,
    connector: connectorId,
    lan: lan ? lanUrls(lan.port!) : [],
    phones: (config?.phones ?? []).map(({ pub, name, added, seen, version, device, connects, guard }) => ({ pub, name, added, seen, version, device, connects, via: viaOf(pub), guard: !!guard })),
  });

  return {
    status,
    peers,
    reach,
    // A new pairing code. It replaces the code before it.
    async pair() {
      await ready;
      pending = { secret: crypto.getRandomValues(new Uint8Array(32)), until: Date.now() + PAIR_TIME };
      // The name of the Mac lets a phone that is paired with more than one Mac show which Mac is which.
      const name = computerName(dir);
      const query = new URLSearchParams({ relay: url, room, mac: config!.pub, secret: b64(pending.secret), name });
      return { link: `yonder://pair?${query}`, expires: pending.until };
    },
    // Removes a phone, and ends its open connections.
    remove(pub: string) {
      if (!config) return status();
      config.phones = config.phones.filter((p) => p.pub !== pub);
      save();
      for (const s of sessions.values()) if (s.phone?.pub === pub) s.end("The Mac removed this phone.");
      forget();
      return status();
    },
    push,
    // A planned stop: an update, a restart of the bridge, or a quit of the app. The code 4002 tells the relay
    // statistics that this is not a drop. Without a close frame, the relay sees 1006 (Vanished). It waits for the
    // close, 500 ms at most, so that the frame leaves before the process exits.
    stop(reason: string) {
      stopped = true;
      lan?.stop(true);
      // A socket that still connects must not open later: after a change of the relay, it would serve the phones too.
      if (ws?.readyState !== WebSocket.OPEN) return ws?.close(), Promise.resolve();
      const socket = ws;
      return new Promise<void>((resolve) => {
        socket.addEventListener("close", () => resolve());
        setTimeout(resolve, 500);
        socket.close(4002, reason);
      });
    },
  };
}

// The QR code of a link, as a PNG data URL from CoreImage: one pixel for each module, so the app scales it up.
const QR = `ObjC.import("CoreImage"); ObjC.import("AppKit");
function run(argv) {
  const f = $.CIFilter.filterWithName("CIQRCodeGenerator");
  f.setValueForKey($(argv[0]).dataUsingEncoding($.NSUTF8StringEncoding), "inputMessage");
  f.setValueForKey($("M"), "inputCorrectionLevel");
  return $.NSBitmapImageRep.alloc.initWithCIImage(f.outputImage).representationUsingTypeProperties(4, $()).base64EncodedStringWithOptions(0).js;
}`;
// The QR code of a link as text for a terminal (`yonder pair` on Linux): two rows of modules in each line, in half
// blocks, black on white, with the same margin of 2 as qrCode.
export function qrText(text: string) {
  const q = qrcode(0, "L");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const dark = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && q.isDark(r, c);
  const lines: string[] = [];
  for (let r = -2; r < n + 2; r += 2) {
    let line = "";
    for (let c = -2; c < n + 2; c++) line += [" ", "▄", "▀", "█"][(+dark(r, c) << 1) | +dark(r + 1, c)];
    lines.push(`\x1b[30;47m${line}\x1b[0m`);
  }
  return lines.join("\n");
}
export async function qrCode(text: string) {
  // Windows and Linux have no CoreImage, so a small library in the bridge makes it, as a GIF, with
  // no qrencode. `yonder pair` prints each module as a character, so the code has the error correction of a
  // terminal code (L) and a margin of 2: 61 columns and 31 lines, not 69 and 35. The window puts its own white edge around it.
  if (process.platform === "win32" || process.platform === "linux") {
    const q = qrcode(0, "L");
    q.addData(text);
    q.make();
    return q.createDataURL(1, 2);
  }
  const p = Bun.spawn(["osascript", "-l", "JavaScript", "-e", QR, text], { stdout: "pipe", stderr: "pipe" });
  const png = (await new Response(p.stdout).text()).trim();
  if ((await p.exited) !== 0 || !png) throw new Error(`The QR code failed: ${await new Response(p.stderr).text()}`);
  return `data:image/png;base64,${png}`;
}
