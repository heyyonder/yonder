// End-to-end check of the phone relay: `bun run check-relay`. It needs no running bridge and starts no workers.
// It runs the relay in this process, the Mac side (connectRelay) with a fake bridge, and a fake phone (src/link.ts).
// The relay is main.ts of this folder. With RELAY_URL=ws://..., the check uses that relay instead, for example
// wss://relay.yonder.so.
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectorOf, connectRelay, deviceId, qrCode, qrText, roomOf } from "../bridge/relay";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serveRelay } from "./main";
import { b64, channel, guard, guardedPost, linkFetch, newKeys, pair, rawKey, unb64, type Pairing } from "../src/link";

function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}
async function fails(p: Promise<unknown>, what: string) {
  const error = await p.then(() => undefined, (e: Error) => e);
  assert(error, `${what} (${error?.message})`);
}
async function until(ok: () => boolean, what: string) {
  for (let i = 0; i < 100 && !ok(); i++) await Bun.sleep(50);
  assert(ok(), what);
}

const frames: Uint8Array[] = [];
const local = process.env.RELAY_URL ? undefined : serveRelay(0, { tap: (f: Uint8Array) => frames.push(f.slice()) });
const url = process.env.RELAY_URL ?? `ws://127.0.0.1:${local!.port}`;
const word = `pelican-${crypto.randomUUID()}`; // The fake bridge says it only inside the encrypted frames.
const dir = mkdtempSync(join(tmpdir(), "yonder-relay-"));
const mac = connectRelay(url, dir, "TEAM", async (req) => {
  const path = new URL(req.url).pathname;
  if (path === "/version") return Response.json(word);
  if (path === "/show") return Response.json(req.headers.get("x-yonder-device"));
  if (path === "/image") return new Response(await req.arrayBuffer(), { headers: { "content-type": req.headers.get("content-type") ?? "" } });
  return new Response(null, { status: 204 });
}, {}, async (req, id) => Response.json({ id, path: new URL(req.url).pathname, auth: req.headers.get("authorization"), body: await req.text() }, { status: 201 }), 0);
await until(() => mac.status().connected, `the Mac connects to ${url}`);
assert((statSync(join(dir, "relay.json")).mode & 0o777) === 0o600, "relay.json, with the private key of the Mac, has mode 600");

const { link } = await mac.pair();
// CoreImage on macOS, and qrcode-generator in the bridge on Linux and Windows. The GitHub workflow runs this check on Linux.
assert((await qrCode(link)).startsWith(process.platform === "darwin" ? "data:image/png;base64,iVBOR" : "data:image/gif;base64,R0lG"), "the bridge makes the QR code of the link");
const text = qrText(link).split("\n");
assert(text.every((l) => l.startsWith("\x1b[30;47m")) && text.some((l) => /[▀▄█]/.test(l)), "the bridge draws the QR code as text for yonder pair");
const wrong = link.replace(/secret=[^&]+/, `secret=${b64(crypto.getRandomValues(new Uint8Array(32)))}`);
await fails(pair(wrong, "Thief"), "a wrong pairing secret fails");
const phone = await pair(link, "Test phone");
assert(mac.status().phones.map((p) => p.name).join() === "Test phone", "the phone pairs with the link of the QR code");
const again = await pair(link, "Again").then(() => undefined, (e: Error) => e.message);
assert(again?.includes("paired Test phone already"), `a pairing code works one time, and a second scan says that it paired already (${again})`);

const call = linkFetch(phone);
const bridge = "http://127.0.0.1:7787";
assert((await (await call(`${bridge}/version`)).json()) === word, "a request goes to the bridge and back");
assert((await (await call(`${bridge}/show`)).json()) === deviceId(phone.pub), "the bridge gets the id of the phone that sent a request");
const big = new Uint8Array(3 << 20).map((_, i) => (i * 7919) % 251);
const echo = await call(`${bridge}/image`, { method: "POST", headers: { "content-type": "image/png" }, body: big });
assert(Buffer.compare(new Uint8Array(await echo.arrayBuffer()), big) === 0, "a binary body of 3 MB goes both ways intact");
assert((await call(`${bridge}/log`, { method: "POST", body: "x" })).status === 204, "an empty answer (204) comes back");
const many = await Promise.all(Array.from({ length: 20 }, () => call(`${bridge}/version`).then((r) => r.json())));
assert(many.every((w) => w === word), "20 requests at the same time all come back");
// The Claude connector: an HTTPS request to the relay at /<id>/... goes to the connector of the Mac over its socket.
const id = mac.status().connector;
const web = url.replace(/^ws/, "http");
const viaRelay = await fetch(`${web}/${id}/mcp`, { method: "POST", headers: { authorization: "Bearer t" }, body: "{}" });
const got = await viaRelay.json();
assert(viaRelay.status === 201 && got.id === id && got.path === `/${id}/mcp` && got.auth === "Bearer t" && got.body === "{}", "a request of the connector reaches the Mac whose token makes the same id on the relay");
assert((await (await fetch(`${web}/.well-known/oauth-protected-resource/${id}/mcp`)).json()).path === `/.well-known/oauth-protected-resource/${id}/mcp`, "a well-known path with the id of the connector reaches the Mac");
// Anyone can connect a bridge of their own, and its connector answers from the domain of the relay. So the relay removes
// the cookies of each answer and blocks its scripts. Cloudflare can add a cookie of its own, so the check looks for "probe".
const rogueToken = b64(crypto.getRandomValues(new Uint8Array(32)));
// It sends its token only in the header, as the bridge does to our relay, so the relay must read the header.
const rogue = new WebSocket(`${url}/host`, { headers: { "x-yonder-token": rogueToken } } as never);
rogue.onmessage = (m) => {
  const headers = { "Set-Cookie": "probe=1; Domain=yonder.so", "Clear-Site-Data": '"cookies"', "Content-Security-Policy": "script-src *", "content-type": "text/html" };
  rogue.send(JSON.stringify({ http: JSON.parse(String(m.data)).http, status: 200, headers, body: "<script>alert(1)</script>" }));
};
await new Promise((r, fail) => ((rogue.onopen = r), (rogue.onerror = () => fail(new Error("FAIL: a bridge with its token in the header connects")))));
const page = await fetch(`${web}/${await connectorOf(rogueToken)}/x`);
const csp = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";
assert(!page.headers.get("set-cookie")?.includes("probe") && !page.headers.has("clear-site-data") && page.headers.get("content-security-policy") === csp, "the connector of a stranger sets no cookie, clears none, and runs no script");
rogue.close();
assert((await call(`${bridge}/relay`, { method: "POST" })).status === 403, "a phone cannot make a pairing code");
await call(`${bridge}/push`, { method: "POST", body: JSON.stringify({ token: "ab12<x>" }) });
const saved = JSON.parse(readFileSync(join(dir, "relay.json"), "utf8")).phones[0].push;
assert(saved === "ab12", "the bridge keeps the push token of the phone, with hex digits only");
const pubKey = async () => b64(new Uint8Array(await crypto.subtle.exportKey("raw", (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])).publicKey)));
const [carKey, watchKey] = [await pubKey(), await pubKey()];
await call(`${bridge}/car-key`, { method: "POST", body: JSON.stringify({ pub: carKey }) });
await call(`${bridge}/watch-key`, { method: "POST", body: JSON.stringify({ pub: watchKey }) });
const keys = JSON.parse(readFileSync(join(dir, "relay.json"), "utf8")).phones[0];
assert(keys.car === carKey && keys.watch === watchKey, "the bridge keeps the key of the car and the key of the watch apart");
assert((await call(`${bridge}//example.com/version`)).status === 403, "a phone cannot make the bridge fetch another host");
if (local) {
  const text = frames.map((f) => new TextDecoder().decode(f)).join("\n");
  assert(frames.length > 20 && !text.includes(word) && !text.includes("/version") && !text.includes("Test phone"), `the relay saw only ciphertext in ${frames.length} frames`);
}

// A phone with two Macs, as after Another Mac in the settings. A switch (movePhone in src/bridge.ts) uses the link of
// the other Mac, and closes the link of the old Mac: a request that is under way there then fails.
const word2 = `heron-${crypto.randomUUID()}`;
// /mcp gives the device of the request, so that the check sees that another Mac sends none.
const mac2 = connectRelay(url, mkdtempSync(join(tmpdir(), "yonder-relay-")), "TEAM", async (req) => {
  const path = new URL(req.url).pathname;
  if (path === "/log") return Bun.sleep(1000).then(() => new Response(null, { status: 204 }));
  return Response.json(path === "/mcp" ? (req.headers.get("x-yonder-device") ?? "no device") : word2);
});
await until(() => mac2.status().connected, "a second Mac connects");
const phone2 = await pair((await mac2.pair()).link, "Test phone");
const call2 = linkFetch(phone2);
const [one, two] = await Promise.all([call(`${bridge}/version`), call2(`${bridge}/version`)].map((r) => r.then((res) => res.json())));
assert(one === word && two === word2, "a phone with two Macs reaches each Mac through its own link");
const slow = call2(`${bridge}/log`, { method: "POST", body: "slow" });
await Bun.sleep(200);
call2.close();
await fails(slow, "the close of the link of one Mac ends a request that is under way there");
assert((await (await call(`${bridge}/version`)).json()) === word, "the link of the other Mac still works after the close");

// The two Macs of the phone reach each other through the relay with no phone, after the phone lists them (introduce in
// src/elsewhere.ts). A Mac that no phone listed gets no answer, and an empty list takes it back.
const peerOf = (p: Pairing) => ({ name: p.name ?? "Mac", relay: p.relay, room: p.room, pub: p.mac });
const tell = (link: typeof call, peers: object[]) => link(`${bridge}/peers`, { method: "POST", body: JSON.stringify({ peers }) });
const tools = (link: typeof call) => link(`${bridge}/mcp`, { method: "POST", body: "{}" }).then((r) => r.json());
const toMac2 = mac.reach(peerOf(phone2));
const client = new Client({ name: "check", version: "0" });
const refused = await client.connect(new StreamableHTTPClientTransport(new URL(`${bridge}/mcp`), { fetch: toMac2 })).then(() => undefined, (e) => e);
assert(refused?.offline, `a Mac that no phone listed gets no answer, and the MCP client keeps the offline error, so the phone can carry the call (${refused?.message})`);
await tell(call2, [peerOf(phone)]);
const told = await (await tell(call, [peerOf(phone2)])).json();
assert(typeof told.name === "string" && !!told.name, "the answer of /peers gives the name of the computer, so a rename reaches the phone");
assert(mac.peers().map((p) => p.pub).join() === phone2.mac, "a Mac keeps the other Mac that its phone lists");
assert((await tools(toMac2)) === "no device", "a Mac calls the tools of the other Mac of its phone through the relay, with no device");
assert((await toMac2(`${bridge}/version`)).status === 403, "another Mac can only call the tools and read the chats");
assert((await toMac2(`${bridge}/conversation?worker=1`)).status !== 403, "another Mac can read the chat of an agent, for the Mac app (/peer)");
assert((await toMac2(`${bridge}/claude-usage`)).status !== 403, "another Mac can read the usage, for the title bar of the Mac app (/peer)");
assert((await mac2.reach(peerOf(phone))(`${bridge}/mcp`, { method: "POST", body: "{}" })).status === 204, "the other Mac reaches the first Mac the same way");
await tell(call2, []);
await fails(tools(toMac2), "an empty list takes the other Mac back, also from an open connection");
await mac2.stop("The bridge stopped");

// The frames of a connection: a replayed or changed frame does not open.
const side = async () => {
  const [long, ephemeral] = [await newKeys(), await newKeys()];
  return { key: long.privateKey, pub: await rawKey(long.publicKey), ephemeral, epub: await rawKey(ephemeral.publicKey) };
};
const [a, b] = [await side(), await side()];
const [phoneEnd, macEnd] = [await channel(a, b, true), await channel(b, a, false)];
const frame = await phoneEnd.seal(new TextEncoder().encode("start_worker"));
assert(new TextDecoder().decode(await macEnd.open(frame)) === "start_worker", "the other end opens a frame");
const changed = await phoneEnd.seal(new TextEncoder().encode("start_worker"));
changed[0] ^= 1;
await fails(macEnd.open(changed), "a changed frame does not open");
await fails(macEnd.open(frame), "a replayed frame does not open");

const other = await newKeys();
await fails(linkFetch({ ...phone, key: other, pub: b64(await rawKey(other.publicKey)) })(`${bridge}/version`), "a phone that is not paired gets no answer");
await fails(linkFetch({ ...phone, key: other })(`${bridge}/version`), "a phone with the public key but not the private key of a paired phone gets no answer");
const stranger = linkFetch({ ...phone, key: other, pub: b64(await rawKey(other.publicKey)) });
const both = await Promise.all([1, 2].map(() => stranger(`${bridge}/version`).then(() => undefined, (e) => e)));
assert(both.every((e) => e?.offline), `two requests at the same time both get the offline error when the connection fails (${both.map((e) => e?.message)})`);
// Two requests find the socket closed at the same time. They share one new connect, so one socket goes up, and both
// get their answers. Else each one connects by itself, and a phone on a slow link opens many sockets.
// When that shared connect fails, both get the offline error, and the next request connects again (Sentry YONDER-V:
// else a failed connect gives the "t.catch" error to a request that waits on another connect).
const racy = linkFetch(phone);
await racy(`${bridge}/version`);
racy.close();
await Bun.sleep(100);
const Real = WebSocket;
const sockets: WebSocket[] = [];
// `hold`: the new sockets send nothing, so a connect stays open with no handshake until the check closes it.
let hold = false;
globalThis.WebSocket = class extends Real {
  constructor(...args: ConstructorParameters<typeof Real>) {
    super(...args);
    sockets.push(this);
  }
  override send(data: Parameters<WebSocket["send"]>[0]) {
    if (!hold) super.send(data);
  }
} as typeof WebSocket;
const answered = await Promise.all([1, 2].map(() => racy(`${bridge}/version`).then((res) => res.json())));
assert(sockets.length === 1 && answered.every((w) => w === word), `two requests that find the socket closed share one new connect (${sockets.length} sockets)`);
racy.close();
await Bun.sleep(100);
sockets.length = 0;
hold = true;
const shared = [1, 2].map(() => racy(`${bridge}/version`).then(() => undefined, (e) => e));
await until(() => sockets.length === 1, "the shared connect starts");
// Bun fires no close event for a socket that closes before it opens.
await until(() => sockets[0].readyState === Real.OPEN, "the shared connect opens");
sockets[0].close();
assert((await Promise.all(shared)).every((e) => e?.offline), "both requests get the offline error when the shared connect fails");
globalThis.WebSocket = Real;
assert((await (await racy(`${bridge}/version`)).json()) === word, "the next request connects again and gets its answer");

// A socket can die with no close, at a change of network or while iOS holds the app (src/link.ts). A `dead` socket drops
// each frame that the phone sends, as a network that went away. A connect on such a socket must not wait for good: else
// a dead open connection holds each request for 2 minutes, and the phone shows Offline until it starts again.
const made: (WebSocket & { dead?: boolean })[] = [];
let cuts = 0;
globalThis.WebSocket = class extends Real {
  dead = false;
  constructor(...args: ConstructorParameters<typeof Real>) {
    super(...args);
    this.dead = cuts > 0;
    if (this.dead) cuts--;
    made.push(this);
  }
  override send(data: Parameters<WebSocket["send"]>[0]) {
    if (!this.dead) super.send(data);
  }
} as typeof WebSocket;
const quiet = linkFetch(phone);
await quiet(`${bridge}/version`);
for (const s of made) s.dead = true;
const since = Date.now();
cuts = 1;
const lost = linkFetch(phone);
const hung = lost(`${bridge}/version`).then(() => undefined, (e) => e);
let back = 0;
while (!back && Date.now() - since < 40_000) {
  quiet(`${bridge}/version`).then(() => void (back ||= Date.now()), () => {});
  await Bun.sleep(3000);
}
const hungError = await hung;
assert(hungError?.offline && Date.now() - since < 30_000, `a connect with no handshake fails as offline in 10 seconds (${hungError?.message})`);
assert((await (await lost(`${bridge}/version`)).json()) === word, "the next request after that connects again");
assert(back && back - since < 25_000, `a dead open connection goes stale after a ping, and a later request connects again (${back - since} ms)`);
globalThis.WebSocket = Real;

if (local) {
  const port = local.port;
  local.stop(true);
  await until(() => !mac.status().connected, "the Mac sees that the relay stopped");
  serveRelay(port!);
  await until(() => mac.status().connected, "the Mac connects again when the relay is back");
  assert((await (await call(`${bridge}/version`)).json()) === word, "the phone connects again after the drop");

  // A bridge with no ping in time is offline, so the relay sends the phones away. A ping makes it live again.
  const quiet = serveRelay(0, { silent: 200 });
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  const at = (path: string) => new WebSocket(`ws://127.0.0.1:${quiet.port}${path}`);
  const host = at(`/host?token=${encodeURIComponent(token)}`);
  await new Promise((r) => (host.onopen = r));
  await Bun.sleep(300);
  const away = at(`/phone?room=${await roomOf(token)}`);
  assert((await new Promise<CloseEvent>((r) => (away.onclose = r))).code === 4004, "a phone gets \"The Mac is offline\" when the bridge stops its pings");
  host.send("ping");
  await new Promise((r) => (host.onmessage = r));
  const opened = new Promise<string>((r) => (host.onmessage = (m) => r(String(m.data))));
  at(`/phone?room=${await roomOf(token)}`);
  assert((await opened).startsWith('{"open":'), "a ping makes the bridge live again");
  quiet.stop(true);
}

const policy = await fetch(`${url.replace(/^ws/, "http")}/privacy`);
assert(policy.ok && (await policy.text()).includes("Yonder Privacy Policy"), "the relay serves the privacy policy of the phone app");

// The local network: a phone on the network of the Mac reaches the bridge with no relay (bridge/relay.ts, src/link.ts).
// The page keeps the addresses of each Mac in localStorage, so the check gives Bun one for this part.
// `onFiveG`: the phone is on 5G, so it learns no address that works. The Mac of the check answers on its real addresses.
const kept = new Map<string, string>();
let onFiveG = false;
Object.assign(globalThis, { localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void (!(onFiveG && k.startsWith("lan:")) && kept.set(k, v)) } });
const lanPort = Number(new URL(mac.status().lan[0] ?? "ws://x").port);
assert(lanPort > 0, `the Mac listens for the phones of the local network (${mac.status().lan.join(", ")})`);
const first = linkFetch(phone);
assert((await (await first(`${bridge}/version`)).json()) === word && first.via() === "relay", "a phone that knows no address of the Mac on the network uses the relay");
await until(() => kept.has(`lan:${phone.mac}`), "the phone learns the addresses of the Mac on the network through the encrypted link");
kept.set(`lan:${phone.mac}`, JSON.stringify([`ws://127.0.0.1:${lanPort}`]));
const near = linkFetch(phone);
const seen = frames.length;
assert((await (await near(`${bridge}/version`)).json()) === word && near.via() === "lan", "the next connection goes to the Mac over the local network");
if (local) assert(frames.length === seen, "no frame of that connection goes through the relay");
assert(mac.status().phones[0].via === "lan", "the Mac lists the phone as local");
assert((await (await near(`${bridge}/show`)).json()) === deviceId(phone.pub), "over the local network the bridge also gets the id of the phone");
assert((await near(`${bridge}/relay`, { method: "POST" })).status === 403, "over the local network a phone also cannot make a pairing code");
const opens = await new Promise<boolean>((r) => {
  const s = new WebSocket(`ws://127.0.0.1:${lanPort}/phone?room=x`);
  s.onopen = () => (s.close(), r(true));
  s.onerror = s.onclose = () => r(false);
});
assert(!opens, "the local port opens no socket for another room");
assert((await fetch(`http://127.0.0.1:${lanPort}/version`)).status === 404, "the local port serves no endpoint of the bridge");
await fails(linkFetch({ ...phone, key: other, pub: b64(await rawKey(other.publicKey)) })(`${bridge}/version`), "a phone that is not paired gets no answer over the local network either");
// 10.255.255.1 does not answer, as the address of the Mac when the phone is on 5G.
kept.set(`lan:${phone.mac}`, JSON.stringify(["ws://10.255.255.1:7786"]));
const away = linkFetch(phone);
const start = Date.now();
assert((await (await away(`${bridge}/version`)).json()) === word && away.via() === "relay" && Date.now() - start < 4000, `an address that does not answer gives way to the relay (${Date.now() - start} ms)`);
for (const l of [first, near, away]) l.close();

// GUARD, Face ID for the relay (bridge/relay.ts). The Secure Enclave of the iPhone signs after Face ID; here a software
// key signs. `lan` gives the phone its address on the local network, or none, as on 5G.
const lan = async (on: boolean) => {
  onFiveG = false;
  kept.set(`lan:${phone.mac}`, JSON.stringify(on ? [`ws://127.0.0.1:${lanPort}`] : []));
  onFiveG = !on;
};
const ecdsa = () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;
const [face, thief] = [await ecdsa(), await ecdsa()];
const facePub = b64(await rawKey(face.publicKey));
const signWith = (k: CryptoKeyPair) => async (challenge: string) => b64(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.privateKey, unb64(challenge))));
await lan(false);
const relayLink = linkFetch(phone);
const challenge = async (l: typeof call) => (await (await l(`${bridge}/guard`)).json()).challenge as string;
const setGuard = async (l: typeof call, pub: string, k: CryptoKeyPair) =>
  l(`${bridge}/guard`, { method: "POST", body: JSON.stringify({ pub, sig: await signWith(k)(await challenge(l)) }) });
assert(!(await (await relayLink(`${bridge}/guard`)).json()).on, "a phone has no Face ID for the relay at first");
assert((await setGuard(relayLink, facePub, thief)).status === 403, "a Face ID key that does not sign the challenge is refused");
assert((await (await setGuard(relayLink, facePub, face)).json()).on && mac.status().phones[0].guard, "the phone turns on Face ID for the relay with a key that signs the challenge");
assert((await (await relayLink(`${bridge}/version`)).json()) === word, "the connection that turned it on keeps the relay");
await lan(true);
const home = linkFetch(phone);
assert((await (await home(`${bridge}/version`)).json()) === word && home.via() === "lan", "the local network needs no Face ID");
home.close();
await lan(false);
const out = linkFetch(phone);
const refusal = await out(`${bridge}/version`).then(() => undefined, (e) => e);
assert(refusal?.offline, `back from the local network, the relay refuses the phone until Face ID, and a call stays in the outbox (${refusal?.message})`);
await fails(relayLink(`${bridge}/version`), "an older connection through the relay is refused too");
let faces = 0;
guard.sign = (c) => (faces++, signWith(face)(c));
const opened = await Promise.all([1, 2, 3].map(() => out(`${bridge}/version`).then((r) => r.json())));
assert(opened.every((w) => w === word) && faces === 1, `one Face ID opens the relay for all the requests that wait (${faces} prompts)`);
await lan(true);
await (await linkFetch(phone)(`${bridge}/version`)).json();
await lan(false);
guard.sign = signWith(thief);
await fails(linkFetch(phone)(`${bridge}/version`), "a signature of another key does not open the relay");
guard.sign = async () => "";
await fails(linkFetch(phone)(`${bridge}/version`), "a Face ID that the user cancels does not open the relay");
// The car has its own key in Swift, which the web view cannot read, and no Face ID. A new car key or a new computer
// needs the signature of the Face ID key, also on the local network. The same value again needs none.
const car = await newKeys(true);
const carPub = b64(await rawKey(car.publicKey));
await lan(true);
const homeAgain = linkFetch(phone);
const carKeyNow = () => JSON.parse(readFileSync(join(dir, "relay.json"), "utf8")).phones[0].car;
const giveCar = (sign?: (c: string) => Promise<string>) => ((guard.sign = sign), guardedPost((init) => homeAgain(`${bridge}/car-key`, init), { pub: carPub }));
assert((await giveCar(async () => "")).status === 428 && carKeyNow() !== carPub, "on the local network, a new car key with no Face ID is refused");
assert((await giveCar(signWith(thief))).status === 403 && carKeyNow() !== carPub, "a new car key with the signature of another key is refused");
assert((await giveCar(signWith(face))).ok && carKeyNow() === carPub, "a new car key with the signature of the Face ID key counts");
assert((await giveCar(undefined)).ok, "the same car key again needs no Face ID");
const unknownPeer = { name: "Stranger", relay: url, room: "x".repeat(22), pub: await pubKey() };
const givePeers = (peers: object[]) => ((guard.sign = async () => ""), guardedPost((init) => homeAgain(`${bridge}/peers`, init), { peers }));
assert((await givePeers([peerOf(phone2), unknownPeer])).status === 428 && !mac.peers().some((p) => p.pub === unknownPeer.pub), "a new computer with no Face ID is refused");
assert((await givePeers([{ ...peerOf(phone2), name: "Renamed" }])).ok, "a new name of a known computer needs no Face ID");
guard.sign = async () => "";
await lan(false);
const carLink = linkFetch({ ...phone, key: car, pub: carPub });
assert((await carLink(`${bridge}/token`)).status === 204, "the key of the car still uses the relay with no Face ID");
assert((await carLink(`${bridge}/version`)).status === 403 && (await carLink(`${bridge}/car-key`, { method: "POST", body: JSON.stringify({ pub: carPub }) })).status === 403, "the key of the car gets only the paths of the car, and cannot give keys");
carLink.close();
assert((await setGuard(homeAgain, "", thief)).status === 403 && mac.status().phones[0].guard, "Face ID for the relay stays on without the signature of its key");
assert(!(await (await setGuard(homeAgain, "", face)).json()).on && !mac.status().phones[0].guard, "the signature of its key turns Face ID for the relay off");
assert((await (await linkFetch(phone)(`${bridge}/version`)).json()) === word, "with Face ID off, the relay answers with no Face ID");
guard.sign = undefined;
onFiveG = false;
for (const l of [relayLink, out, homeAgain]) l.close();
delete (globalThis as { localStorage?: unknown }).localStorage;

mac.remove(phone.pub);
await fails(call(`${bridge}/version`), "a removed phone gets no answer");
// A planned stop of the bridge (an update, a restart, a quit) closes with 4002, so the statistics do not count a drop.
const events: { event: string; role: string; code?: number }[] = [];
if (local) {
  // The first event fails as in a deploy of the site, so the relay must send it again.
  let failed = false;
  const stats = Bun.serve({ port: 0, fetch: async (req) => (failed ? (events.push(await req.json()), new Response()) : ((failed = true), new Response(null, { status: 502 }))) });
  process.env.STATS_URL = `http://127.0.0.1:${stats.port}`;
}
await mac.stop("The bridge restarts");
if (local) await until(() => events.some((e) => e.event === "close" && e.role === "host" && e.code === 4002), "a planned stop of the bridge reaches the relay as 4002, not as a drop, also after a failed send");
process.exit(0);
