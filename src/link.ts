// The end-to-end encryption between the Yonder app on a phone and the bridge on a Mac, and the phone side of
// the relay. The relay forwards only encrypted frames, so it cannot read or change them. See docs/mobile.md.
//
// Each device has a long-term ECDH key pair (P-256: Bun has no X25519). A connection starts with a handshake:
// the phone sends its public key and an ephemeral key, and the Mac answers with its own ephemeral key. The keys
// of the connection come from HKDF over both ECDH results, and over the pairing secret when the phone pairs.
// Each frame is AES-GCM with a counter as the nonce, so a replayed or reordered frame fails to open.

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const subtle = crypto.subtle;
const encoder = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;

// Base64url, for keys and secrets only: a large array overflows the spread.
export const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64 = (text: string): Bytes => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export const newKeys = (extractable = false) => subtle.generateKey(ECDH, extractable, ["deriveBits"]) as Promise<CryptoKeyPair>;
export const rawKey = async (key: CryptoKey): Promise<Bytes> => new Uint8Array(await subtle.exportKey("raw", key));
const ecdh = async (own: CryptoKey, peer: Bytes): Promise<Bytes> =>
  new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: await subtle.importKey("raw", peer, ECDH, false, []) }, own, 256));

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
}

// The AES key of a 1Password token that the bridge sealed to a phone (bridge/vault.ts): ECDH, then HKDF over the public
// key of the seal and the public key of the phone. The bridge makes it with a new key that it then forgets, and the phone
// with its own private key, so only the phone can make it again.
export async function vaultKey(own: CryptoKey, peer: Bytes, epub: Bytes, phone: Bytes): Promise<Bytes> {
  const salt = new Uint8Array(await subtle.digest("SHA-256", concat(epub, phone)));
  const base = await subtle.importKey("raw", await ecdh(own, peer), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("yonder vault 1") }, base, 256));
}

// A message: the length of the JSON head (4 bytes), the head, and the body.
export function pack(head: object, body?: Uint8Array): Bytes {
  const json = encoder.encode(JSON.stringify(head));
  const out = concat(new Uint8Array(4), json, body ?? new Uint8Array());
  new DataView(out.buffer).setUint32(0, json.length);
  return out;
}
export function unpack(data: Bytes) {
  const length = new DataView(data.buffer, data.byteOffset).getUint32(0);
  return { head: JSON.parse(new TextDecoder().decode(data.subarray(4, 4 + length))), body: data.subarray(4 + length) };
}

export type Channel = { seal(data: Bytes): Promise<Bytes>; open(frame: Bytes): Promise<Bytes> };

// One key for each direction, and a counter as the nonce. seal gives its frames in the order of the calls,
// so the caller can send each frame when it comes. open expects the frames in the order that they came.
export async function channel(
  own: { key: CryptoKey; pub: Bytes; ephemeral: CryptoKeyPair; epub: Bytes },
  peer: { pub: Bytes; epub: Bytes },
  phone: boolean,
  secret: Bytes = new Uint8Array(),
): Promise<Channel> {
  const ikm = concat(await ecdh(own.key, peer.pub), await ecdh(own.ephemeral.privateKey, peer.epub), secret);
  const [p, m] = phone ? [own, peer] : [peer, own];
  const salt = new Uint8Array(await subtle.digest("SHA-256", concat(p.pub, m.pub, p.epub, m.epub)));
  const base = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("yonder relay 1") }, base, 512));
  const aes = (part: Bytes) => subtle.importKey("raw", part, "AES-GCM", false, ["encrypt", "decrypt"]);
  const up = await aes(bits.slice(0, 32)); // From the phone to the Mac.
  const down = await aes(bits.slice(32));
  const nonce = (n: number) => {
    const iv = new Uint8Array(12);
    new DataView(iv.buffer).setBigUint64(4, BigInt(n));
    return iv;
  };
  let sent = 0;
  let got = 0;
  let last: Promise<unknown> = Promise.resolve();
  return {
    seal(data) {
      const iv = nonce(sent++);
      const frame = last.then(async () => new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, phone ? up : down, data)));
      last = frame.catch(() => {});
      return frame;
    },
    open: async (frame) => {
      try {
        return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce(got++) }, phone ? down : up, frame));
      } catch (e) {
        // A bad tag is the only failure that asks the user to pair again (Sentry YONDER-D).
        throw Object.assign(e instanceof Error ? e : new Error("The frame did not open."), { decrypt: true });
      }
    },
  };
}

// The phone side. A pairing is what the phone keeps: it can hold the private key without exporting it.
// name: the name of the Mac, from the QR code. An older pairing has no name.
export type Pairing = { relay: string; room: string; mac: string; pub: string; key: CryptoKeyPair; name?: string };
type Answer = { head: Record<string, any>; body: Bytes };
// lan: the connection goes to the Mac over the local network, not through the relay. check: a ping now. With no frame of
// the Mac in 5 seconds, the connection is stale, and the next request connects again.
type Connection = { request(head: object, body?: Uint8Array): Promise<Answer>; close(): void; closed(): boolean; check(): void; lan: boolean };

// A bad frame fails AES-GCM, and that is the only time the phone asks to pair again.
// Any other failure in this step, such as a bad head, is not a pairing problem, so it does not say to pair again
// (Sentry YONDER-D).
export function relayFailure(e: unknown): string {
  return (e as { decrypt?: boolean }).decrypt
    ? "The answer of the Mac did not open. Pair the phone again."
    : "The Mac did not answer.";
}

// `lan`: an address of the Mac on the local network (`/lan`), in place of the relay. The bridge speaks the same protocol
// there (bridge/relay.ts).
function connect(p: Pairing, secret?: Bytes, lan?: string): Promise<Connection> {
  return new Promise((resolve, reject) => {
    // The device lets the relay statistics count each phone one time. It is the end of the public key of the phone,
    // which the relay already sees in the first frame.
    const device = p.pub.replace(/=+$/, "").slice(-16);
    const ws = new WebSocket(
      lan
        ? `${lan}/phone?room=${encodeURIComponent(p.room)}`
        : `${p.relay}/phone?room=${encodeURIComponent(p.room)}&device=${encodeURIComponent(device)}&app=${encodeURIComponent(APP)}&model=${encodeURIComponent(deviceName())}`,
    );
    ws.binaryType = "arraybuffer";
    // A handshake that does not come in time is lost. An address of the local network that gives none in 1.5 seconds is
    // not on this network: a socket to a missing host can wait more than a minute by itself. Through the relay, the
    // network can go away during the connect with no close, at a change of network or while iOS holds the app. Else the
    // phone waits for good, each later request waits on the same connect, and the app shows Offline until it starts again.
    const late = setTimeout(() => (fail(lan ? "The Mac is not on this network." : "The Mac did not answer."), ws.close()), lan ? 1500 : 10_000);
    const waiting = new Map<number, { resolve(a: Answer): void; reject(e: Error): void }>();
    let ephemeral: CryptoKeyPair;
    let epub: Bytes;
    let ch: Channel | undefined;
    let queue: Promise<unknown> = Promise.resolve();
    let next = 0;
    let over = false;
    // A socket can also die after the connect with no close, and still say that it is open. So while a request waits and
    // the Mac sent nothing for 5 seconds, a ping goes. With no frame 10 seconds after the ping, the connection is stale,
    // and the next request connects again. A request on it keeps its 2 minutes, because a large answer can still be on
    // its way, and the connection closes when none waits. Else only those 2 minutes find a dead socket, and each poll
    // and each tap waits on it. `heard`: the last frame of the Mac. `busy`: until when the frames of the phone
    // can still be on their way, at 32 KB a second. `asked`: the time of the ping that waits, and `patience` its wait.
    let heard = Date.now();
    let busy = 0;
    let asked = 0;
    let patience = 0;
    let stale = false;
    const ping = (wait: number) => {
      if (asked || stale || !ch || over || ws.readyState !== WebSocket.OPEN) return;
      [asked, patience] = [Date.now(), wait];
      // Any answer shows that the link works. /lan needs no Face ID, and a bridge that refuses it also answers.
      conn.request({ method: "GET", path: "/lan", headers: {} }).catch(() => {});
    };
    const beat = setInterval(() => {
      const now = Date.now();
      if (stale && !waiting.size) return void (clearInterval(beat), ws.close());
      if (asked && now - asked > patience && now > busy && !ws.bufferedAmount) stale = true;
      else if (waiting.size && now - heard > 5000 && now > busy) ping(10_000);
    }, 1000);
    // `dropped`: the socket closed after a request went out, so the Mac may have it. Only a call with a key goes
    // again (`queue` in src/bridge.ts), because the bridge runs each key one time.
    const fail = (why: string, dropped = false) => {
      over = true;
      clearTimeout(late);
      clearInterval(beat);
      reject(new Error(why));
      for (const w of waiting.values()) w.reject(Object.assign(new Error(why), { dropped }));
      waiting.clear();
    };
    const conn: Connection = {
      request(head, body) {
        // The connection ended while the caller got ready, so the request does not leave the phone. Else it waits 2
        // minutes.
        if (over || stale || ws.readyState !== WebSocket.OPEN) return Promise.reject(Object.assign(new Error("The relay closed the connection."), { offline: true }));
        const id = ++next;
        return new Promise<Answer>((resolve, reject) => {
          const timer = setTimeout(() => {
            waiting.delete(id);
            reject(new Error("The Mac did not answer in 2 minutes."));
            // A socket that gives no answer is dead, also when it says that it is open, so the next request connects
            // again. Else each poll waits 2 minutes on it: the list of the agents stays as it was, and a task that
            // closed itself still shows on the Done tab.
            ws.close();
          }, 120_000);
          const done = <T>(settle: (v: T) => void) => (v: T) => (clearTimeout(timer), settle(v));
          waiting.set(id, { resolve: done(resolve), reject: done(reject) });
          ch!.seal(pack({ ...head, id }, body)).then((frame) => {
            ws.send(frame);
            busy = Math.max(busy, Date.now()) + frame.length / 32;
          }, done(reject));
        });
      },
      close: () => ws.close(),
      closed: () => over || stale || ws.readyState >= WebSocket.CLOSING,
      check: () => ping(5000),
      lan: !!lan,
    };
    ws.onopen = async () => {
      ephemeral = await newKeys();
      epub = await rawKey(ephemeral.publicKey);
      ws.send(pack({ v: 1, pub: p.pub, epub: b64(epub), pair: !!secret, version: APP, device: deviceName() }));
    };
    ws.onmessage = (m) => {
      heard = Date.now();
      asked = 0;
      if (typeof m.data === "string") return;
      const frame = new Uint8Array(m.data as ArrayBuffer);
      queue = queue
        .then(async () => {
          if (!ch) {
            // The answer of the Mac to the handshake: its ephemeral key.
            const own = { key: p.key.privateKey, pub: unb64(p.pub), ephemeral, epub };
            ch = await channel(own, { pub: unb64(p.mac), epub: unb64(unpack(frame).head.epub) }, true, secret);
            clearTimeout(late);
            return resolve(conn);
          }
          const answer = unpack(await ch.open(frame));
          waiting.get(answer.head.id)?.resolve(answer);
          waiting.delete(answer.head.id);
        })
        .catch((e) => {
          fail(relayFailure(e));
          ws.close();
        });
    };
    ws.onclose = (e) => {
      // The Mac revoked this phone, so the phone loses the pairing and all that it keeps.
      if (!secret && e.code === 4003 && REVOKED.test(e.reason)) void unpair(p.mac);
      fail(e.reason || "The relay closed the connection.", true);
    };
  });
}

// Reads the link of the QR code (yonder://pair?relay=...&room=...&mac=...&secret=...) and pairs this phone.
export async function pair(link: string, name: string): Promise<Pairing> {
  const url = new URL(link);
  const get = (k: string) => url.searchParams.get(k) || "";
  const key = await newKeys();
  const relay = get("relay").replace(/\/+$/, "");
  const p: Pairing = { relay, room: get("room"), mac: get("mac"), pub: b64(await rawKey(key.publicKey)), key, name: get("name") || undefined };
  const conn = await connect(p, unb64(get("secret")));
  try {
    if (!(await conn.request({ pair: name })).head.paired) throw new Error("The Mac did not pair the phone.");
  } finally {
    conn.close();
  }
  return p;
}

// A fetch for the bridge through the relay. Only the path of the URL counts, for example
// linkFetch(p)("http://127.0.0.1:7787/conversation?worker=3"). It connects again after a drop. `close` closes the
// socket to the Mac, after a switch to another Mac (src/bridge.ts).
declare const __BUILD_ID__: string;
// Vite sets the build. The checks of the relay run this file in Bun, with no build.
const APP = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "";

// The model and system of the phone, from the user agent. An Android emulator says so in its user agent.
// shortcut: the web view of the iOS simulator has the user agent of a real iPhone, so it shows as an iPhone.
function deviceName() {
  // The bridge of another computer (`reach` in bridge/relay.ts) runs this file in Bun, with no page.
  if (typeof document === "undefined") return "Computer";
  const ua = navigator.userAgent;
  const android = ua.match(/Android ([\d.]+)/);
  if (android) return `Android ${android[1]}${/sdk_gphone|Emulator|Android SDK built/i.test(ua) ? " emulator" : ""}`;
  const ios = ua.match(/(iPhone|iPad).*? OS ([\d_]+)/);
  if (ios) return `${ios[1]} iOS ${ios[2].replace(/_/g, ".")}`;
  return "Web";
}
const HEADERS = ["content-type", "accept", "mcp-session-id", "mcp-protocol-version", "last-event-id"];
// The addresses of each Mac on its local network, from its last answer to /lan. The bridge of another computer (`reach`
// in bridge/relay.ts) runs this file with no localStorage, so it always uses the relay.
const lanKey = (mac: string) => `lan:${mac}`;
const lanOf = (mac: string): string[] => {
  try {
    const urls = JSON.parse(localStorage.getItem(lanKey(mac)) ?? "[]");
    return Array.isArray(urls) ? urls.filter((u) => typeof u === "string" && /^ws:\/\//.test(u)) : [];
  } catch {
    return [];
  }
};
// Face ID for the relay (GUARD in bridge/relay.ts): src/bridge.ts sets `sign`, which signs a challenge of the Mac with
// the key of the Secure Enclave after Face ID, or gives "". The bridge of another computer has none.
export const guard: { sign?: (challenge: string) => Promise<string> } = {};
// A POST that gives the computer a new car key, watch key or computer (/car-key, /watch-key, /peers). With Face ID for
// the relay, the computer answers 428 with a challenge, and the phone sends the request again with the signature.
export async function guardedPost(go: (init: RequestInit) => Promise<Response>, body: object) {
  const init = (b: object) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  const res = await go(init(body));
  if (res.status !== 428) return res;
  const { challenge } = await res.json().catch(() => ({}));
  const sig = typeof challenge === "string" ? ((await guard.sign?.(challenge).catch(() => "")) ?? "") : "";
  return sig ? go(init({ ...body, sig })) : res;
}
export function linkFetch(p: Pairing) {
  let conn: Promise<Connection> | undefined;
  let current: Connection | undefined;
  let probed = 0;
  const close = () => void conn?.then((c) => c.close(), () => {});
  // The Mac on this network first, at each of its addresses at the same time. A slower address that also answers closes.
  const nearby = () => {
    const urls = lanOf(p.mac);
    if (!urls.length) return Promise.reject(new Error("No address of the Mac on this network."));
    const tries = urls.map((u) => connect(p, undefined, u));
    const won = Promise.any(tries);
    for (const t of tries) t.then((c) => won.then((w) => w !== c && c.close()), () => {});
    return won;
  };
  // Each connection asks for the addresses of the Mac on the local network, which can change. A bridge from before
  // them refuses the path.
  const learn = (c: Connection) =>
    c.request({ method: "GET", path: "/lan", headers: {} }).then(
      ({ head, body }) => head.status === 200 && localStorage.setItem(lanKey(p.mac), new TextDecoder().decode(body)),
      () => {},
    );
  const open = async () => {
    probed = Date.now();
    const c = await nearby().catch(() => connect(p));
    if (typeof localStorage !== "undefined") void learn(c);
    return (current = c);
  };
  // On the relay, the phone tries the local network again every 30 seconds, so it goes back to it when it comes home.
  // The old connection closes when its requests had their 2 minutes.
  const probe = (c: Connection) => {
    if (c.lan || typeof localStorage === "undefined" || Date.now() - probed < 30_000) return;
    probed = Date.now();
    nearby().then((l) => {
      if (current !== c) return l.close();
      conn = Promise.resolve((current = l));
      setTimeout(() => c.close(), 120_000);
    }, () => {});
  };
  // The Mac asks for Face ID before it answers through the relay (423). The local network needs none, so the phone tries
  // it first, for example after the Mac got a new address. One Face ID serves all the requests that wait. `used`: the
  // last challenge that the phone signed, so a late 423 with it goes again with no new Face ID.
  let unlocking: Promise<Connection> | undefined;
  let used = "";
  const unlock = (c: Connection, challenge: string) =>
    challenge === used
      ? Promise.resolve(current ?? c)
      : (unlocking ??= (async () => {
          const l = await nearby().catch(() => undefined);
          if (l) {
            if (current === c) (conn = Promise.resolve((current = l))), setTimeout(() => c.close(), 120_000);
            return l;
          }
          const sig = (await guard.sign?.(challenge).catch(() => "")) ?? "";
          const ok = !!sig && (await c.request({ method: "POST", path: "/unlock", headers: {} }, new TextEncoder().encode(JSON.stringify({ sig })))).head.status === 200;
          // `offline`: the Mac did not run the request, so the outbox keeps a new agent or a message for later.
          if (!ok) throw Object.assign(new Error("Allow the relay with Face ID."), { offline: true });
          used = challenge;
          return c;
        })().finally(() => (unlocking = undefined)));
  // "lan" or "relay": the way of the last connection, for the settings.
  const via = () => (current && !current.closed() ? (current.lan ? "lan" : "relay") : undefined);
  // A ping on the connection in use, when the app comes back to the front, the network changes, or the user taps while
  // the Mac is away (src/App.tsx). The next request then leaves a dead connection after 5 seconds, not 15.
  const check = () => current?.check();
  return Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    // `!== false`: while this request waits, a failed connect can set conn to undefined in another request. This
    // request then connects again. Else it calls conn.catch on undefined, and the phone shows
    // "undefined is not an object (evaluating 't.catch')" in place of the offline error.
    // The request keeps its own connect (`mine`), and a failed connect clears conn only while conn is still that
    // connect. Two requests can connect again at the same time. Else a failure of the first clears the connect of the
    // second, and a third request that waits on the second gets the same error (Sentry YONDER-V).
    // Requests that find the same socket closed share one new connect: the first one starts it, and each other one
    // takes it. Else each one connects by itself, and on a slow link a phone can open 9 sockets in 4 seconds, of which
    // 8 stay open with no request until iOS closes them.
    let mine = conn;
    if (!mine || (await mine.catch(() => undefined))?.closed() !== false) conn = mine = conn && conn !== mine ? conn : open();
    // The request did not leave the phone, so the caller can safely send it again (`offline`).
    const c = await mine.catch((e) => {
      if (conn === mine) conn = undefined;
      throw Object.assign(e, { offline: true });
    });
    probe(c);
    const headers = Object.fromEntries([...req.headers].filter(([k]) => HEADERS.includes(k)));
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : new Uint8Array(await req.arrayBuffer());
    const ask = { method: req.method, path: url.pathname + url.search, headers };
    let { head, body: bytes } = await c.request(ask, body);
    if (head.status === 423 && typeof head.challenge === "string") ({ head, body: bytes } = await (await unlock(c, head.challenge)).request(ask, body));
    return new Response([101, 204, 205, 304].includes(head.status) ? null : bytes, { status: head.status, headers: head.headers });
  }, { close, via, check });
}

// The phone keeps its pairing in IndexedDB, because IndexedDB stores a CryptoKey as it is: the private key
// stays non-extractable, so no script can read it out. localStorage holds only text.
// Another `name` is a database of its own, such as the sounds of the outbox (src/bridge.ts).
// iOS can end the storage process of WebKit while the app is in the background. A request at that moment fails with
// "Connection to Indexed Database server lost. Refresh the page to try again", and a connection that stays open
// throws at `transaction`. A new open works again (tested in WebKit), so each request tries once more. A scan of a
// pairing can fail with this error after three hours in the background (Sentry YONDER-1A).
export const store = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest, name = "pairing"): Promise<T> =>
  storeOnce<T>(mode, run, name).catch(() => new Promise((r) => setTimeout(r, 300)).then(() => storeOnce<T>(mode, run, name)));
function storeOnce<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name === "pairing" ? "yonder" : `yonder-${name}`, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(name);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      try {
        const req = run(open.result.transaction(name, mode).objectStore(name));
        req.onsuccess = () => (resolve(req.result), open.result.close());
        req.onerror = () => (reject(req.error), open.result.close());
      } catch (e) {
        reject(e);
        open.result.close();
      }
    };
  });
}
// The key "mac" holds the pairing in use. Each pairing is also under the public key of its Mac, so that the phone
// can keep more than one Mac and switch between them.
export const loadPairing = () => store<Pairing | undefined>("readonly", (s) => s.get("mac"));
export const savePairing = async (p: Pairing) => (await store<void>("readwrite", (s) => s.put(p, p.mac)), store<void>("readwrite", (s) => s.put(p, "mac")));
// All the Macs of the phone. An older pairing is only under "mac", so the list removes the duplicates.
export const loadPairings = async () => [...new Map((await store<Pairing[]>("readonly", (s) => s.getAll())).map((p) => [p.mac, p])).values()];

// `talk`: the talk view (a dictation) is open, so an update waits, as during a call (App.tsx sets it). Else an update
// cuts the dictation, and the iPhone shows black: the orb of the talk view moves by script, so `still` cannot stop it.
// `dirty`: a conversation, the settings or the talk view was on the screen since this page started (App.tsx sets it).
// Then the iPhone does not load the page again: each such new load shows black, also with `still`, and a start of the
// app always shows the app. An update waits in `front`, a switch of the Mac waits in the pairing, and
// the next start of the app runs them (docs/wiki.md).
export const hold = { talk: false, dirty: false };

// Stops each animation and transition of the page (`html.still` in src/app.css), and resolves 1.5 seconds later. The
// iPhone shows only the background, for good, after a new load of the page while the icon of the update button turns,
// and after a switch to another Mac. A teardown of the app while an icon turns does the same, with no load. The same
// teardown 1.5 seconds after the icon stops shows the app (docs/wiki.md). So each new load
// of the page waits for it: an update and `heal` (src/front.ts), a switch of the Mac and an unpair (below). The bridge
// also loads this file, so the function touches the page only when it runs.
export function still() {
  document.documentElement.classList.add("still");
  // The animations of script (Element.animate) too, which the class cannot stop.
  for (const a of document.getAnimations()) a.cancel();
  return new Promise((r) => setTimeout(r, 1500));
}

// The fetch of a read of another computer through the bridge of the Mac ends after this time (mcpFetch in src/bridge.ts).
export const PEER_READ_MS = 8_000;
export function isPeerRead(body: unknown) {
  if (typeof body !== "string" || !body.includes('"other_computer"')) return false;
  try {
    const p = (JSON.parse(body) as { params?: { name?: string; arguments?: { tool?: string } } }).params;
    return p?.name === "other_computer" && [undefined, "list_workers", "list_projects", "list_workspaces"].includes(p.arguments?.tool);
  } catch {
    return false;
  }
}

// The data of the app that belongs to one Mac: the open project and view, and the marks of the front end of its bridge.
// The bundle ("front") stays: the check of src/front.ts downloads the bundle of the new Mac only when its build is
// another one. Else each switch downloads the same bundle of about 2 MB again through the relay.
const PER_MAC = ["project", "resume", "view", "frontTry", "frontBad", "outbox", "phoneConfigSeen"];
// A new name of a computer: from the computer itself (the answer of /peers, `introduce` in src/elsewhere.ts), or from
// the details of the computer in the Settings. The pairing in use keeps its copy under "mac" too.
export async function renamePairing(mac: string, name: string) {
  const p = (await loadPairings()).find((x) => x.mac === mac);
  if (!p || !name || p.name === name) return;
  const named = { ...p, name };
  await store<void>("readwrite", (s) => s.put(named, mac));
  if ((await loadPairing())?.mac === mac) await store<void>("readwrite", (s) => s.put(named, "mac"));
}
// The name of a Mac, for the screen and for Grok. An older pairing has no name.
export const macName = (p?: Pairing) => p?.name || "Mac";
// The Mac of switch_environment (App.tsx): the one with the name, else with no name the only other Mac. Else the words
// that Grok gets in its place, so it can ask the user. A name can be a part of the name of the Mac, such as "air".
export function pickMac(name: string, current: Pairing | undefined, all: Pairing[]): Pairing | string {
  const others = all.filter((p) => p.mac !== current?.mac);
  if (!others.length) return `The phone is paired only with ${macName(current)}. To add an environment, the user opens the settings: Environment, Pair a computer.`;
  const word = name.trim().toLowerCase();
  if (word && macName(current).toLowerCase() === word) return `The phone already works on ${macName(current)}.`;
  const exact = others.filter((p) => macName(p).toLowerCase() === word);
  const near = !word ? others : exact.length ? exact : others.filter((p) => macName(p).toLowerCase().includes(word));
  if (near.length === 1) return near[0];
  return `${word && !near.length ? `No environment matches "${name}". ` : ""}Ask the user which one: ${(near.length ? near : others).map(macName).join(", ")}.`;
}
// App.tsx sets it while the app runs. It moves the app to the other Mac with no new load of the page, so a live call
// goes on with the agents and the tools of the other Mac. `old` is the Mac in use before. Thus the environment can
// switch during a call.
export const moveTo: { mac?: (p: Pairing, old?: Pairing) => void } = {};
// Makes the pairing the one in use. A running app moves to it at once (`moveTo`), else the page loads again with it.
// True: the page cannot load again safely (`hold.dirty`), so the user must close and open the app.
export async function switchPairing(p: Pairing) {
  // An older pairing is only under "mac", so it gets its own key before "mac" changes.
  const current = await loadPairing().catch(() => undefined);
  if (current && current.mac !== p.mac) await store<void>("readwrite", (s) => s.put(current, current.mac));
  await savePairing(p);
  for (const k of PER_MAC) localStorage.removeItem(k);
  if (moveTo.mac) return (moveTo.mac(p, current), false);
  return loadAgain();
}

// Loads the page again, or returns true when the app must start again first (`hold.dirty`).
async function loadAgain() {
  if (hold.dirty) return true;
  await still();
  location.reload();
  return false;
}

// The reasons of bridge/relay.ts when the Mac revoked this phone: one for an open connection, one for a new connection.
const REVOKED = /removed this phone|not paired with the Mac/;
// Forgets a Mac. When the phone has another Mac, the app switches to it. Without one, the app clears all that it keeps
// on the phone (the account, the settings and the front end of the bridge), then shows the pairing screen.
// Unpair in the settings and a revoke on the Mac both call this. True: the user must close and open the app.
export async function unpair(mac?: string) {
  const current = await loadPairing().catch(() => undefined);
  mac ??= current?.mac;
  await store<void>("readwrite", (s) => s.delete(mac ?? "")).catch(() => {});
  const rest = (await loadPairings().catch(() => [])).filter((p) => p.mac !== mac);
  if (mac !== current?.mac) return false;
  if (rest.length) {
    // The switch keeps the Mac in use under its own key, so the forgotten Mac goes again after it.
    const later = await switchPairing(rest[0]);
    await store<void>("readwrite", (s) => s.delete(mac ?? "")).catch(() => {});
    return later;
  }
  await store<void>("readwrite", (s) => s.clear()).catch(() => {});
  localStorage.clear();
  return loadAgain();
}
