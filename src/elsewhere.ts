import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WIRE, bridgeFetch, callTool, phone, type Project, type Worker } from "./bridge";
import { guardedPost, linkFetch, loadPairing, loadPairings, macName, PEER_READ_MS, pickMac, renamePairing, type Pairing } from "./link";

// The agents of the other computers of the phone, with no switch: the phone asks each other paired computer for
// list_workers, through a relay link and an MCP client of its own. Each bridge has list_workers, also an old one. The
// links are not those of src/bridge.ts, so the push token and the keys of CarPlay and the watch stay with the computer
// in use.
export type Elsewhere = { mac: string; name: string; workers?: Worker[] };
// The computers that this device does not show (their public keys), from the Show list of the Settings (Environment):
// their agents and apps stay off the lists, and Grok gets no agents of them. The computers still reach each other. Each
// device keeps its own list.
export const hidden = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem("hiddenComputers") ?? "[]");
  } catch {
    return [];
  }
};
export const setHidden = (macs: string[]) => localStorage.setItem("hiddenComputers", JSON.stringify(macs));

const links = new Map<string, { fetch: ReturnType<typeof linkFetch>; client: () => Promise<Client> }>();
const drop = (mac: string) => (links.get(mac)?.fetch.close(), links.delete(mac));

// The Mac reaches another computer through its own bridge (`/peer` in bridge/main.ts), with the fetch of a link. So the
// chat of an agent of another computer opens on the Mac as on the phone.
const viaPeer = (name: string): ReturnType<typeof linkFetch> =>
  Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      const url = new URL(req.url);
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
      return bridgeFetch(`/peer?${new URLSearchParams({ computer: name, path: url.pathname + url.search })}`, { method: req.method, headers: req.headers, body });
    },
    { close: () => undefined, via: () => undefined, check: () => undefined },
  );

function linkOf(p: Pairing) {
  let l = links.get(p.mac);
  if (!l) {
    const fetch = phone ? linkFetch(p) : viaPeer(p.mac);
    // The MCP session opens at the first tool call. If a fetch only, such as /logins, opens it too, nothing catches its
    // failure when that computer is offline (Sentry YONDER-M).
    let client: Promise<Client> | undefined;
    const c = new Client({ name: "yonder-elsewhere", version: "0.1.0" });
    l = { fetch, client: () => (client ??= c.connect(new StreamableHTTPClientTransport(new URL(`${WIRE}/mcp`), { fetch })).then(() => c)) };
    links.set(p.mac, l);
  }
  return l;
}

// The Mac has no pairings. Its bridge reaches the computers that a phone introduced (other_computer in bridge/main.ts),
// so the Mac asks them through its own bridge, and the name of a computer is its key. Thus each Mac shows the other
// environments too, not only the phone.
const viaBridge = (args: Record<string, unknown>) => callTool("other_computer", args).then((t) => JSON.parse(t));
const within = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), PEER_READ_MS))]);

// The other computers of this device, for the environment dropdown of the title bar. `all` also gives the hidden ones.
export async function computers(all = false): Promise<{ mac: string; name: string }[]> {
  const list = phone
    ? await Promise.all([loadPairing().catch(() => undefined), loadPairings().catch(() => [] as Pairing[])]).then(([current, ps]) =>
        ps.filter((p) => p.mac !== current?.mac).map((p) => ({ mac: p.mac, name: macName(p) })),
      )
    : await viaBridge({}).then((r: { computers?: string[] }) => (r.computers ?? []).map((name) => ({ mac: name, name })), () => []);
  return list.filter((c) => all || !hidden().includes(c.mac));
}

// One tool on each other computer that shows, at the same time. `data` is undefined for a computer that gives no answer
// in 8 seconds, such as a Mac with the lid closed. `all` also asks the hidden computers (the Environment section).
// On the Mac, each ask of a sleeping computer holds a connection of WebKit to the bridge for 8 seconds (mcpFetch in
// src/bridge.ts), and with three sleeping computers on the Projects tab the polls held all 6 of them. So the Mac asks
// one computer one thing at a time (`asking`), and a computer that gave no answer in 8 seconds rests for a minute: the
// polls do not ask it until then. A quick "offline" answer costs nothing, so it does not rest.
const resting = new Map<string, number>();
const asking = new Map<string, Promise<unknown>>();
async function askOthers(tool: string, all = false, args: Record<string, unknown> = {}): Promise<{ mac: string; name: string; data?: unknown }[]> {
  if (!phone)
    return Promise.all((await computers(all)).map((c) => {
      // Each ask waits for the ask before it to the same computer.
      const turn = (asking.get(c.name) ?? Promise.resolve()).then(async () => {
        if ((resting.get(c.name) ?? 0) > Date.now()) return c;
        const at = Date.now();
        try {
          return { ...c, data: await within(viaBridge({ computer: c.name, tool, arguments: args })) };
        } catch {
          if (Date.now() - at >= PEER_READ_MS - 1000) resting.set(c.name, Date.now() + 60_000);
          return c;
        }
      });
      asking.set(c.name, turn);
      void turn.then(() => asking.get(c.name) === turn && asking.delete(c.name));
      return turn;
    }));
  const [current, pairings] = await Promise.all([loadPairing().catch(() => undefined), loadPairings().catch(() => [] as Pairing[])]);
  // After a switch, the computer in use talks through src/bridge.ts, so its link here closes.
  if (current) drop(current.mac);
  const others = pairings.filter((p) => p.mac !== current?.mac && (all || !hidden().includes(p.mac)));
  if (!all) for (const mac of links.keys()) if (!others.some((p) => p.mac === mac)) drop(mac);
  return Promise.all(
    others.map(async (p) => {
      const base = { mac: p.mac, name: macName(p) };
      try {
        const ask = linkOf(p).client().then((c) => c.callTool({ name: tool, arguments: args }));
        const res = await within(ask);
        const text = (res.content as { text?: string }[]).map((c) => c.text ?? "").join("");
        if (res.isError) throw new Error(text);
        return { ...base, data: JSON.parse(text) };
      } catch {
        drop(p.mac);
        return base;
      }
    }),
  );
}

// The agents that a yonder://agent link opened (openLinked in App.tsx) stay in the list also when they are closed, so
// that a link opens a closed agent of another computer, as it does one of this computer (Sentry YONDER-W).
export const linkedAgents = new Set<string>();
// The agents of each other computer that are not closed, with no sub-agents. `workers` is undefined for a computer
// with no answer.
export const elsewhere = (all = false): Promise<Elsewhere[]> =>
  // `full`: the whole record of each agent. An older bridge gives it with no arguments too.
  askOthers("list_workers", all, { full: true }).then((os) =>
    os.map(({ data, ...o }) => (data ? { ...o, workers: (data as Worker[]).filter((w) => !w.parent && (w.status !== "closed" || linkedAgents.has(w.id))) } : o)),
  );

// The projects of each other computer that shows, for the Projects tab, under the name of that computer, split by
// computer.
export type FarProjects = { mac: string; name: string; projects?: Project[] };
export const elsewhereProjects = (): Promise<FarProjects[]> =>
  askOthers("list_projects").then((os) => os.map(({ data, ...o }) => (data ? { ...o, projects: data as Project[] } : o)));

// The calls of the agents of the computer in use to the other computers (the other_computer tool of the bridge): the
// phone gives the bridge the names of its other computers and the results of the last calls, takes the new calls, and
// runs each on its computer. A bridge reaches the other computers itself (`introduce`), so the phone carries only the calls of an older bridge, or to an older bridge.
type Call = { id: number; computer: string; tool: string; arguments: Record<string, unknown> };
let results: { id: number; text: string; error?: boolean }[] = [];
let polling = false;
export async function carry() {
  if (polling) return;
  polling = true;
  try {
    const [current, all] = await Promise.all([loadPairing().catch(() => undefined), loadPairings().catch(() => [] as Pairing[])]);
    introduce(current, all);
    const sent = results;
    results = [];
    const r = await bridgeFetch("/elsewhere", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ computers: all.filter((p) => p.mac !== current?.mac).map(macName), results: sent }),
    }).catch(() => undefined);
    if (!r?.ok) return void results.push(...sent); // An old bridge, or no link: send them again.
    const { calls } = (await r.json()) as { calls: Call[] };
    for (const c of calls) void run(c, current, all).then((x) => (results.push({ id: c.id, ...x }), carry()));
  } finally {
    polling = false;
  }
}

// Each paired computer gets the other computers of the phone: the name, the relay, the room and the public key of each
// (`/peers` in bridge/relay.ts). Its bridge then reaches them through the relay itself, and they let it in, also while
// this app is closed, in the background or in a call. Thus the link does not need the app on the screen. The phone
// sends each list when it changes and every 10 minutes, so that a computer that updates its bridge later also gets it, and tries a computer with no
// answer again a minute later. An old bridge answers 403, which is an answer too.
const told = new Map<string, { body: string; at: number; ok: boolean }>();
function introduce(current: Pairing | undefined, all: Pairing[]) {
  for (const p of all) {
    const peers = all.filter((o) => o.mac !== p.mac).map((o) => ({ name: macName(o), relay: o.relay, room: o.room, pub: o.mac }));
    const body = JSON.stringify({ peers });
    const last = told.get(p.mac);
    if (last?.body === body && Date.now() - last.at < (last.ok ? 600_000 : 60_000)) continue;
    const sent = { body, at: Date.now(), ok: false };
    told.set(p.mac, sent);
    // A link of its own, closed after the answer, for a computer that is not in use.
    const link = p.mac === current?.mac ? undefined : linkFetch(p);
    // A newer bridge answers with its name. A new name changes the lists, so the next poll tells each computer. A new
    // computer needs Face ID when the computer has Face ID for the relay (guardedPost).
    void guardedPost((init) => (link ? link(`${WIRE}/peers`, init) : bridgeFetch("/peers", init)), { peers })
      .then(async (r) => ((sent.ok = true), r.ok && renamePairing(p.mac, String((await r.json().catch(() => ({}))).name ?? ""))), () => {})
      .finally(() => link?.close());
  }
}

// other_computer for Grok on the phone: the phone runs the call itself through its link, with no switch and no trip
// through the queue of the bridge, so it works also with the screen off during a call. The phone stays on the computer
// in use and only starts the agents on the other computers.
export async function onOther(computer: string, tool: string, args: Record<string, unknown>) {
  const [current, all] = await Promise.all([loadPairing().catch(() => undefined), loadPairings().catch(() => [] as Pairing[])]);
  if (!computer) return { text: JSON.stringify({ computers: all.filter((p) => p.mac !== current?.mac).map(macName) }) };
  return run({ id: 0, computer, tool, arguments: args }, current, all);
}

async function run(c: Call, current: Pairing | undefined, all: Pairing[]) {
  const to = pickMac(c.computer, current, all);
  if (typeof to === "string") return { text: to, error: true };
  // A call of the computer in use that the phone carries (a queued call has an id) keeps the block list of the other
  // computer (`blockedComputers`, bridge/relay.ts). A call of the phone itself has none.
  if (c.id && current && (await blocks(to, current))) return { text: `${macName(to)} does not let ${macName(current)} reach it.`, error: true };
  return callAt(to, c.tool, c.arguments);
}

const blocks = (to: Pairing, from: Pairing) =>
  linkOf(to)
    .fetch(`${WIRE}/settings`)
    .then((r) => r.json())
    .then((s) => ((s.values?.blockedComputers ?? []) as string[]).some((x) => x === from.mac || x.toLowerCase() === macName(from).toLowerCase()), () => false);

async function callAt(p: Pairing, tool: string, args: Record<string, unknown>) {
  try {
    const res = await (await linkOf(p).client()).callTool({ name: tool, arguments: args });
    return { text: (res.content as { text?: string }[]).map((x) => x.text ?? "").join(""), ...(res.isError ? { error: true } : {}) };
  } catch (e) {
    drop(p.mac);
    return { text: `${macName(p)} gave no answer: ${(e as Error).message}`, error: true };
  }
}

// The chat of an agent of another computer, open on the phone (App.tsx), loads and acts through the same link, so the
// phone stays on the computer in use.
// On the Mac, the key of a computer is its name, and the link goes through the bridge of the Mac (viaPeer).
export function reach(mac: string) {
  const to = async () => {
    if (!phone) return { mac, name: mac } as Pairing;
    const p = (await loadPairings()).find((p) => p.mac === mac);
    if (!p) throw new Error("The phone has no link to that computer.");
    return p;
  };
  return {
    fetch: async (path: string, init?: RequestInit) => linkOf(await to()).fetch(`${WIRE}${path}`, init),
    call: async (tool: string, args: Record<string, unknown>) => {
      const r = await callAt(await to(), tool, args);
      if (r.error) throw new Error(r.text);
      return r.text;
    },
  };
}
