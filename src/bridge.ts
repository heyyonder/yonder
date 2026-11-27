// The app is one more MCP client of the bridge.
import * as Sentry from "@sentry/react";
import { useEffect, useState } from "react";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { registerForPushNotifications } from "@choochmeque/tauri-plugin-notifications-api";
import { openUrl } from "@tauri-apps/plugin-opener";
import { impactFeedback, type ImpactFeedbackStyle } from "@tauri-apps/plugin-haptics";
import { invoke } from "@tauri-apps/api/core";
import { saved } from "./account";
import { guard, guardedPost, isPeerRead, linkFetch, PEER_READ_MS, store, type Pairing } from "./link";
import { word } from "./names";

// The address of each request on the wire of the relay (LOCAL in bridge/relay.ts): a phone and another computer name
// the bridge with it, whatever its port.
export const WIRE = "http://127.0.0.1:7787";
// The bridge of this user. The Mac app loads its page from the bridge, so the page itself is at the bridge. The first
// page of the Mac app (tauri://) asks the app for the port (bridgeReady), because it is not always 7787: another user of
// the Mac can have that port (bridge/peer.ts). A phone and the dev server use 7787.
export let BRIDGE = location.protocol === "http:" && location.hostname === "127.0.0.1" ? location.origin : WIRE;

// The phone has no bridge of its own. Each request goes to the bridge on the Mac through the relay (src/link.ts).
export const phone = /iPhone|iPad|Android/.test(navigator.userAgent);
// An app from before has no bridge_port, and keeps 7787.
export const bridgeReady: Promise<void> =
  location.protocol === "tauri:" && !phone ? invoke<number>("bridge_port").then((port) => void (BRIDGE = `http://127.0.0.1:${port}`), () => {}) : Promise.resolve();
export const android = /Android/.test(navigator.userAgent);
// A tap of the Taptic Engine on the phone (tauri-plugin-haptics). The Mac has none. A phone app installed before the
// plugin rejects the call, so the catch keeps a new front end working on an old app.
export const haptic = (style: ImpactFeedbackStyle = "light") => phone && impactFeedback(style).catch(() => {});
// A short run of taps, one each `gap` ms: three rising taps start a call, three falling taps end it, and two taps close
// an agent.
export const haptics = (styles: ImpactFeedbackStyle[], gap = 110) => styles.forEach((s, i) => setTimeout(() => haptic(s), i * gap));
// The sounds of the app, from public/: the Drip sound of TickTick when the user marks an agent as done, and a soft
// swish (Mixkit sound 3220, softened) when a new agent or a voice note leaves. The notch of the Mac plays the same whoosh
// (src-tauri/wake/main.swift). The app decodes each sound once at the start and
// plays it from memory, so it starts at the tap: an <audio> element was late. drip.wav has no silence at its start.
// The AudioContext is suspended when no sound plays. A running one renders silence all the time, and with the
// background audio mode it keeps the iPhone app awake, which uses a lot of battery.
const audio = new AudioContext();
void audio.suspend();
let playing = 0;
// The Mac wakes the AudioContext when the mouse moves or a key goes down in the window, and suspends it AWAKE_MS after.
// A suspended one stops the stream to the output, and the output can need a moment to wake, so the start of the drip,
// its loudest part, is lost and the sound comes late. The mouse moves to the button before the click, so the stream
// runs at the click. A running one uses 0.2 % CPU in WebKit.
// A running output keeps the Mac from idle sleep, so it does not run all the time.
const AWAKE_MS = 60_000;
let woke = -AWAKE_MS;
const rest = () => void (playing || performance.now() - woke < AWAKE_MS || audio.suspend());
if (!phone && "__TAURI_INTERNALS__" in window) {
  const wake = () => {
    if (performance.now() - woke < 1000) return;
    woke = performance.now();
    audio.resume().catch(() => {});
    setTimeout(rest, AWAKE_MS);
  };
  for (const e of ["pointermove", "pointerdown", "keydown"]) addEventListener(e, wake, { capture: true, passive: true });
}
// While the Mac keeps the microphone of dictation open (src/dictate.ts), a sound plays on its running AudioContext. A
// second AudioContext that starts next to an open microphone makes macOS change the audio, as for the chime of a call
// (src/voice.ts), and the sound of a done agent glitches and comes late.
let micAudio: AudioContext | undefined;
export const shareAudio = (ctx: AudioContext) => void (micAudio = ctx);
const sound = (src: string) => {
  const buffer = fetch(src).then((r) => r.arrayBuffer()).then((b) => audio.decodeAudioData(b)).catch(() => null);
  return () => {
    const mic = micAudio?.state === "running" ? micAudio : undefined;
    if (!mic) audio.resume().catch(() => {});
    buffer.then((b) => {
      if (!b) return void (mic || rest());
      const ctx = mic ?? audio;
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      if (!mic) (s.onended = () => (playing--, rest())), playing++;
      s.start();
    });
  };
};
export const ding = sound("/drip.wav");
export const whoosh = sound("/whoosh.m4a");
// The spoken brief of the listen button of a conversation (src/App.tsx) plays on the same AudioContext. `holdAudio`
// runs in the tap, because iOS starts sound only in a tap, and the brief comes from the bridge a moment later. It
// returns the release. The brief plays with the silent switch on, and the side buttons change its volume.
let speech: AudioBufferSourceNode | undefined;
export function holdAudio() {
  playing++;
  audio.resume().catch(() => {});
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session?.type === "auto") session.type = "playback";
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (session?.type === "playback") session.type = "auto";
    playing--;
    rest();
  };
}
export const decodeAudio = (bytes: ArrayBuffer) => audio.decodeAudioData(bytes);
// Plays one brief, and stops the brief before it. `onEnd` runs at its end or at hush.
export function say(buffer: AudioBuffer, onEnd: () => void) {
  hush();
  const s = (speech = audio.createBufferSource());
  s.buffer = buffer;
  s.connect(audio.destination);
  s.onended = () => ((speech === s && (speech = undefined)), onEnd());
  s.start();
}
export const hush = () => {
  try {
    speech?.stop();
  } catch {}
};
// The Android app (MainActivity.kt) gives the sizes of the system bars, sets the theme of their icons,
// keeps a live call on with the screen locked, goes to the background at the back gesture, and listens for "Hey Yonder"
// (Wake.kt), and dictates (Dictation.kt), and says if Google Play installed it (play). An older app can lack wake,
// busy, dictation or play.
export const shell = (window as { YonderAndroid?: { bars(): string; dark(dark: boolean): void; call(live: boolean): void; background(): void; wake?(on: boolean): void; busy?(busy: boolean): void; dictation?(op: string): string; play?(): boolean } })
  .YonderAndroid;
let link: ReturnType<typeof linkFetch> | undefined;
// "lan" while the phone reaches the Mac over the local network, "relay" through the relay (src/link.ts).
export const linkVia = () => link?.via();
// The time of the last poll of the list of agents (App.tsx), for the tag of the link in the settings.
export const pollTime = { ms: 0 };
// A ping on the link to the Mac, which ends a dead connection in 5 seconds (src/link.ts). The Mac app has no link.
export const checkLink = () => link?.check();
// The lock screen of the app is up (src/Lock.tsx), so Face ID for the relay waits for it.
export const lockScreen = { up: false };
// Face ID for the relay (GUARD in bridge/relay.ts): the Secure Enclave signs a challenge of the Mac (Guard.swift). The
// prompt waits until the app is in front with no lock screen. After a cancel the phone does not ask for a minute, so
// the poll does not ask again at once. Until then each call fails as offline, and the outbox keeps a new agent or a message.
// shortcut: a cancel waits a fixed minute; a tap to allow the relay again would be better if the wait annoys.
let declined = 0;
guard.sign = async (challenge) => {
  if (document.hidden || lockScreen.up || Date.now() - declined < 60_000) return "";
  const sig = await invoke<string>("guard_sign", { challenge }).catch(() => "");
  if (!sig) declined = Date.now();
  return sig;
};
let relayFetch: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined;
let paired: Pairing | undefined;
// False on a phone with no pairing yet: the app shows its screens, and the call button pairs a computer (App.tsx).
export const isPaired = () => !!paired;
// main.tsx calls this before the app renders, when the phone has a pairing. The phone also asks for
// notifications and gives its APNs device token to the Mac, which sends a push when an agent finishes.
export function connectPhone(p: Pairing) {
  link = linkFetch(p);
  relayFetch = link;
  paired = p;
  void flush(); // The calls that waited when the app closed.
  linkCar();
  // A phone in its first run waits with the push until the setup gives the reason first (src/Setup.tsx).
  if (pushOn() && !localStorage.getItem("permsWait")) setPush(true);
}
// The Notifications switch of the settings (localStorage "push"). Off gives the Mac an empty token, so it sends no push, and
// iOS keeps the permission.
export const pushOn = () => localStorage.getItem("push") !== "off";
export function setPush(on: boolean) {
  localStorage.setItem("push", on ? "on" : "off");
  // pushOn() again after the registration: an Off of phone.json (src/phone-config.ts) can come while the On of the start
  // still waits for its token, and the token must not reach the Mac after the empty one.
  (on ? registerForPushNotifications() : Promise.resolve(""))
    .then((token) => bridgeFetch("/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: pushOn() ? token : "" }) }))
    .catch((e) => console.log(`No push notifications: ${e}`));
}
// The call of the CarPlay screen is Swift, with its own key, because Swift cannot read the key of the web view
// (docs/carplay.md). The iPhone gives the pairing and the Yonder account to it, and gives its key to the Mac. App.tsx
// calls this again when the account changes. An older iPhone app has no car_link, and an older bridge refuses /car-key.
// Then the same for the Apple Watch app (docs/watch.md): `watch_link` gives it the pairing and returns its key. Swift
// calls `window.yonderLinkCar` when a new key of the watch arrives. An older iPhone app has no watch_link, and an older
// bridge refuses /watch-key.
export function linkCar() {
  const p = paired;
  if (!p || android) return;
  const device = p.pub.replace(/=+$/, "").slice(-16);
  const give = (pub: string, path = "/car-key") => guardedPost((init) => bridgeFetch(path, init), { pub });
  invoke<string>("car_link", { relay: p.relay, room: p.room, mac: p.mac, device, account: saved()?.token ?? "" })
    .then((pub) => (pub ? give(pub) : undefined))
    .then(() => invoke<string>("watch_link"))
    .then((pub) => (pub ? give(pub, "/watch-key") : undefined))
    .catch(() => {});
}
(window as { yonderLinkCar?: () => void }).yonderLinkCar = linkCar;
// A phone with no pairing has no computer to ask. Without this, the simulator reached the bridge of this Mac at
// 127.0.0.1 and showed its numbers before a pairing.
const toBridge = (input: RequestInfo | URL, init?: RequestInit) =>
  relayFetch ? relayFetch(onWire(input), init) : phone ? Promise.reject(new Error("Pair this phone with a computer first.")) : fetch(input, init);
// A request that goes through the relay names the bridge with WIRE.
export function onWire(input: RequestInfo | URL): RequestInfo | URL {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (BRIDGE === WIRE || !url.startsWith(`${BRIDGE}/`)) return input;
  const to = WIRE + url.slice(BRIDGE.length);
  return typeof input === "string" || input instanceof URL ? to : new Request(to, input);
}
// A request to the bridge, for example bridgeFetch("/calls").
export const bridgeFetch = (path: string, init?: RequestInit) => toBridge(`${BRIDGE}${path}`, init);

// The URL of a file of the bridge, such as a favicon, for an img or a video. The phone cannot load the
// bridge URL itself, so it loads the file through the relay and gives a blob URL.
// shortcut: the phone loads the whole file at once, so a large video is slow; stream it if that matters.
// `owner` is the ID of the agent whose chat shows the file. The phone then keeps the file until the agent closes.
// `far` loads a file of another computer through its link (src/elsewhere.ts). The phone keeps it only while it shows.
// Each error on the screen goes to Sentry: the toast and the line under a prompt box (App.tsx), and the error of
// each sheet (pairing, sign-in, plans, folders, feedback). Also an error that the app catches, such as a failed
// dictation. All of them have the same stack, so the fingerprint keeps each text in its own issue. They go up as
// warnings, apart from the real errors: most of them are a state of the user, such as no camera permission, not a bug.
export function useReport(error: string) {
  useEffect(() => void (error && Sentry.captureMessage(error, { level: "warning", fingerprint: [error] })), [error]);
}

export function useBridgeSrc(path?: string, owner?: string, far?: (path: string) => Promise<Response>) {
  const [loaded, setLoaded] = useState<{ path: string; url: string }>();
  const keep = !far && (!!path?.startsWith("/favicon") || !!owner);
  useEffect(() => {
    if ((!relayFetch && !far) || !path || (keep && kept.has(path))) return;
    let url = "";
    let live = true;
    let again: ReturnType<typeof setTimeout> | undefined;
    // A load that the link drops, such as at a restart of the bridge, tries again while the view shows the file: after 2
    // seconds, then twice as long each time, 30 seconds at most. An answer such as 404 ends it. Else a dropped load
    // stays blank until the user opens the chat again.
    const load = (wait: number): void =>
      void (far ? far(path).then((res) => (res.ok ? res.blob() : Promise.reject({ status: res.status }))) : loadBlob(path)).then(
        (blob) => {
          url = URL.createObjectURL(blob);
          // Two views can load the same file at the same time. The first blob URL stays, and the second goes.
          if (keep && kept.has(path)) (URL.revokeObjectURL(url), (url = kept.get(path)!.url));
          else if (keep) kept.set(path, { url, owner });
          if (live) setLoaded({ path, url });
          else if (!keep) URL.revokeObjectURL(url);
        },
        (e) => {
          const status = (e as { status?: number } | undefined)?.status;
          if (live && (!status || status >= 500)) again = setTimeout(() => load(Math.min(wait * 2, 30_000)), wait);
        },
      );
    load(2000);
    return () => {
      live = false;
      clearTimeout(again);
      if (!keep) URL.revokeObjectURL(url);
    };
  }, [path]);
  if (!path) return undefined;
  // A file of another computer comes through its link, also on the Mac.
  if (!relayFetch && !far) return `${BRIDGE}${path}`;
  return (far ? undefined : kept.get(path)?.url) ?? (loaded?.path === path ? loaded.url : undefined);
}
// The phone keeps the blob URL of each favicon until the app closes. Favicons are small, and without this
// each switch of a tab loaded the favicons again through the relay, so they showed late.
// The phone also keeps each picture, video and sound of the chat of an agent, so the chat shows them at once when the
// user opens the agent again. forgetMedia lets them go when the agent closes.
const kept = new Map<string, { url: string; owner?: string }>();
// `open` holds the IDs of the agents that are not closed.
export function forgetMedia(open: Set<string>) {
  for (const [path, k] of kept) if (k.owner && !open.has(k.owner)) (URL.revokeObjectURL(k.url), kept.delete(path));
}
// The phone also keeps the last 200 pictures, videos and sounds of the chats on its disk (the Cache API), one cache for
// each Mac. So they show at once after a start or an update of the app, which empties `kept`. The URL of a chat file
// carries the time of its last change (`v`), so a kept file is never old. A file of 20 MB or more is not kept.
// The favicons are on the disk too, in a cache of their own. A kept favicon shows at once, and the phone then asks the
// Mac again, so a new favicon shows at the next start. Else each start of the app loads each favicon of All projects
// again through the relay, and they show late.
const fetchBlob = (path: string) => bridgeFetch(path).then((res) => (res.ok ? res.blob() : Promise.reject({ status: res.status })));
async function loadBlob(path: string) {
  const icon = path.startsWith("/favicon?");
  if ((!icon && !/^\/(media|shot)\?/.test(path)) || !paired || !("caches" in window)) return fetchBlob(path);
  const cache = await caches.open(`${icon ? "favicons" : "media"} ${paired.mac}`).catch(() => undefined);
  const hit = await cache?.match(BRIDGE + path).catch(() => undefined);
  if (hit && icon)
    bridgeFetch(path)
      .then(async (res) => {
        if (res.ok) await cache!.put(BRIDGE + path, new Response(await res.blob()));
        else if (res.status === 404) await cache!.delete(BRIDGE + path);
      })
      .catch(() => {});
  if (hit) return hit.blob();
  const blob = await fetchBlob(path);
  if (cache && icon) cache.put(BRIDGE + path, new Response(blob)).catch(() => {});
  else if (cache && blob.size < 20e6)
    cache.put(BRIDGE + path, new Response(blob))
      .then(() => cache.keys())
      .then((keys) => Promise.all(keys.slice(0, -200).map((k) => cache.delete(k))))
      .catch(() => {});
  return blob;
}

export type Worker = {
  id: string;
  num: number; // The user can say "agent 3".
  owner?: string; // The person who started it (`people` in config.json, docs/multi-user.md). No value: the main person.
  sessionId: string;
  name: string;
  project: string; // The name of its workspace.
  workspace?: string; // The id of its workspace, from a newer bridge.
  path: string;
  task: string;
  // "waiting" means that the agent finished its turn with a question for the user.
  status: "running" | "waiting" | "done" | "failed" | "closed";
  activity: string;
  // A running agent that waits on its background tasks: "only" when its turn ended, "also" when its turn runs beside them.
  monitoring?: "only" | "also";
  result: string;
  unread: boolean; // The user has not read the last result: the blue dot.
  attention?: boolean; // Clef says that the result needs the user: the purple dot.
  answered?: boolean; // The agent answered a question of the user: a purple circle on the Completed tab.
  avatar?: { shape: string; color: string }; // Its picture in a screen that draws one (rename_worker).
  saved?: boolean; // The user saved the agent for later: it shows on the Saved tab, not on the Done tab.
  startedAt: number; // The start of the last turn.
  createdAt?: number; // The start of the first turn.
  updatedAt: number;
  kind?: "terminal" | "background"; // A Claude Code session that Yonder did not start.
  cli?: string; // The CLI of the agent, such as "codex". None: Claude Code.
  profile?: string; // The profile of the agent. The list gives its name. None: the CLI itself.
  context?: { used: number; window?: number };
  model?: string; // For example "claude-opus-5-5".
  effort?: string; // For example "high".
  mode?: string; // The permission mode, for example "bypassPermissions".
  recent?: string[];
  queue?: string[]; // Messages that wait until the worker finishes.
  agent?: string; // The type of a sub-agent, such as "general-purpose".
  // A sub-agent that the agent `parent` started with the Agent tool. It shows as the number of its agent and a letter: 21B.
  parent?: string;
  letter?: string;
  site?: { label: string; port: number; title: string }; // The web server of the agent, for Yonder Preview.
  summary?: string; // The summary of the last answer, 1 to 3 points. The last point is the verdict, or what the user must do.
  next?: string; // The next step of the user in 2 to 5 words, such as "Push it": the third line of a row on the Done tab.
  // A tool call that waits for Allow or Deny, in a mode that is not Bypass, or an approval of ask_user with its kind: a
  // sheet with a title, rows, an amount, a code, choices or a link to terms, Face ID and an end time (src/Canvas.tsx).
  // The kind `secret` is a request for 1Password (src/Vault.tsx).
  ask?: {
    id: string;
    tool: string;
    text: string;
    kind?: "yes-no" | "code" | "choice" | "pay" | "terms" | "secret";
    title?: string;
    rows?: [string, string][];
    amount?: string;
    choices?: string[];
    link?: string;
    faceId?: boolean;
    touchId?: boolean;
    until?: number;
    seals?: Record<string, string>;
  };
  closeWhenDone?: boolean; // The agent closes itself when its turn ends, unless something came up.
  closedItself?: boolean; // The bridge closed the agent for closeWhenDone: its row says "Closed itself".
  closedBy?: "you" | "voice" | "mcp" | number; // Who closed the agent with close_worker. A number is the agent that closed it.
  schedule?: string; // The ID of the schedule that started the agent: its row says "Scheduled".
};
// A CLI that runs agents, from /clis of the bridge (bridge/clis.ts): Claude Code first, then the others on this Mac.
// `on`: Grok and the New agent view offer it. `model`, `effort` and `mode` are those of its new agents ("" is the default
// of the CLI, or Clef for the effort). `mcp`: the tools of Yonder in all its sessions, when the CLI has a command for it.
// `mcpRun`: each Yonder agent in it gets the tools for its run.
export type Cli = {
  id: string;
  name: string;
  path?: string;
  version?: string;
  account?: string; // How it pays, such as "ChatGPT plan". None: it is not signed in.
  error?: string; // It does not start.
  on: boolean;
  install?: string;
  login?: string;
  signIn?: boolean; // It signs in from the phone, with no terminal (the cards of /logins).
  models: string[];
  efforts: string[];
  modes: { mode: string; name: string }[];
  model: string;
  effort: string;
  mode: string;
  autoUpdate?: boolean; // On installs a new harness. Off keeps the CLI at its current version.
  mcp?: boolean;
  mcpRun?: boolean;
  usage?: { name: string; percent: number; resets_at: string | null }[];
  week?: number; // The percent of the weekly allowance that this CLI or profile has used.
  session?: number; // The percent of the session allowance (5 hours). Only Claude Code has it.
  // A profile of the user (Profile in bridge/main.ts): `base` is the ID of its CLI, and `profile` its own values.
  base?: string;
  profile?: { own: boolean; ownMcp?: boolean; folder?: string; program: string; flags: string; env: Record<string, string> };
};
export type Clis = { cli: string; clis: Cli[] };
// A workspace (the old name stays in the code). `path` is its key: its folder, or "workspace:<id>" for a workspace with no
// folder. `id` comes from a newer bridge. `profile`: the name of the default profile of the workspace, which
// each new agent there uses (set_workspace_profile).
export type Project = { id?: string; name: string; path: string; starred: boolean; pinned?: boolean; profile?: string; folder?: string; description?: string };
// A web server that runs on the Mac, from the list action of the preview tool. `path` is the folder of the server.
// `name`, `saved` and `icon`: the name, the save and the icon of the user in the Canvas tab. `seen`: when the bridge first saw it.
// `auto`: the name from Haiku. `num`: the newest agent of the site. `frame`: false when the viewer of the Mac cannot show it.
export type Site = { label: string; project: string; worktree?: string; path: string; port: number; title: string; open?: boolean; url?: string; name?: string; auto?: string; num?: number; frame?: false; saved?: boolean; icon?: string; seen?: number };

// A read of another computer (other_computer with list_workers, list_projects or no tool) waits up to 60 seconds in the
// bridge when that computer sleeps with its relay socket still open. The request holds one of the 6 connections that
// WebKit gives the bridge all that time, and the polls of src/elsewhere.ts start more of them. Two sleeping computers
// can hold all 6, so each request of the window, also a click, waits up to 10 seconds. So
// the fetch of such a read ends after 8 seconds, when its poll stops waiting (`within` in src/elsewhere.ts). An action
// on another computer, such as a message, keeps its full time.
const mcpFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (!isPeerRead(init?.body)) return toBridge(input, init);
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(new Error("The other computer gave no answer.")), PEER_READ_MS);
  init?.signal?.addEventListener("abort", () => stop.abort(init.signal?.reason));
  return toBridge(input, { ...init, signal: stop.signal }).finally(() => clearTimeout(timer));
};
const newClient = () => new Client({ name: "yonder-app", version: "0.1.0" });
let client = newClient();
let connected: Promise<void> | undefined;

// Gives the client when it is connected. A switch to another Mac can come during the connect, so each call keeps the
// client that it started with.
function connect() {
  const c = client;
  if (!connected) {
    const p = c.connect(new StreamableHTTPClientTransport(new URL(`${BRIDGE}/mcp`), { fetch: mcpFetch })).catch((e) => {
      if (connected === p) connected = undefined; // Try again on the next call, for example while the bridge starts.
      throw e;
    });
    connected = p;
  }
  return connected.then(() => c);
}

// A request that the bridge never answers keeps one of the 6 connections that WebKit gives a host, and the MCP client
// never aborts it: its own timeout only rejects the promise. Six of them can hold the Mac window at "Offline" until
// the user quits Yonder. A new client closes the old one, which aborts each of its requests and frees the
// connections. `since`: the start of the poll that missed, so that one stuck spell makes one new client, not one a second.
let resetAt = 0;
export function resetClient(since: number) {
  if (since < resetAt) return;
  resetAt = Date.now();
  const old = client;
  client = newClient();
  connected = undefined;
  void old.close().catch(() => {});
}

// The phone moves to another Mac with no new load of the page, so a live call goes on (moveTo in src/link.ts). An MCP
// client connects one time only, and its session is of the old Mac, so the new Mac gets a new client. The socket to the
// old Mac stays 30 seconds, so that a request under way, such as the end of a Claude call, still arrives.
// The kept files go, because the paths of the favicons are the same on each Mac.
export function movePhone(p: Pairing) {
  const old = link;
  setTimeout(() => old?.close(), 30_000);
  client = newClient();
  connected = undefined;
  for (const k of kept.values()) URL.revokeObjectURL(k.url);
  kept.clear();
  connectPhone(p);
}

// Calls a bridge tool. The text is JSON when the call succeeds. While the Mac is offline, for example with the
// lid closed, the phone waits for the Mac to connect again, 2 minutes at most, and then sends the call. It sends
// again only a call that did not leave the phone, so an agent never starts two times. `call` does not wait,
// because the poll uses it and must show "Bridge offline".
export async function callTool(name: string, args: Record<string, unknown> = {}, wait = phone ? 120_000 : 0) {
  if (phone && QUEUED.has(name)) return queue(name, args);
  const until = Date.now() + wait;
  for (;;) {
    try {
      return await toolText(name, args);
    } catch (e) {
      if (!(e as { offline?: boolean }).offline || Date.now() > until) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// The outbox of the phone. While the Mac is offline, a new agent and a message to an agent wait in localStorage, also
// when the app closes, and go to the Mac in their order when it connects again. Only a call that did not leave the phone
// (`offline`) waits, so an agent never starts two times. The answer is JSON, because Grok reads `num` from it.
// Else a message fails when the relay is closed.
const QUEUED = new Set(["start_worker", "message_worker"]);
type Outgoing = { name: string; args: Record<string, unknown> };
const outgoing = (): Outgoing[] => JSON.parse(localStorage.getItem("outbox") || "[]");
const keep = (list: Outgoing[]) => (list.length ? localStorage.setItem("outbox", JSON.stringify(list)) : localStorage.removeItem("outbox"));
// App.tsx shows a queued call that the Mac refused, because no caller waits for it.
export const outbox = { fail: (message: string) => console.log(message) };
export const OFFLINE = JSON.stringify({ queued: true, note: "Not sent yet: the Mac is offline. It goes to the Mac when the Mac connects again. Say only \"The Mac is offline. It goes when the Mac is back.\"" });
let flushing = false;

// A dictation that the Mac did not hear, because the Mac was offline (src/dictate.ts). Its sound waits in IndexedDB
// under `sound`, because a minute of it is 2 MB, too much for localStorage. The outbox makes the text from it before the
// call goes. `before`: the words of the prompt box, which go in front of it. Thus the user can dictate while the Mac is
// offline.
export type Recorded = { sound: string; before?: string };
export const isRecorded = (v: unknown): v is Recorded => typeof (v as Recorded | undefined)?.sound === "string";
export async function keepSound(pcm: Int16Array) {
  const id = crypto.randomUUID().replaceAll("-", "");
  await store("readwrite", (s) => s.put(pcm, id), "sounds");
  return id;
}
const dropSound = (id: string) => store("readwrite", (s) => s.delete(id), "sounds").catch(() => {});
// The speech to text model of the dictation and the Claude call (Settings, Voice). Empty: the speech model of the Mac.
// Parakeet is a better model on the Mac (src-tauri/parakeet/main.swift), in three versions. Each device keeps its own in
// localStorage. Only a super user chooses it.
export const STT = {
  "": "Apple",
  parakeet: "Parakeet v2",
  "parakeet-v3": "Parakeet v3",
  "parakeet-ultra": "Parakeet ultra",
  soniox: "Soniox",
  deepgram: "Deepgram",
} as const;
// Walkie-talkie (Settings, Voice): a voice note goes to the own speech model of the user on the computer ("whisper",
// bridge/dictate.ts), and the answer of the agent plays aloud (Conversation in src/App.tsx). `talk`: a dictation, not
// a call, because whisper gives the words only at the end, and a call needs them while the user talks.
// `walkieTalkie` is in config.json, so the user or an agent can turn it on or off there. App.tsx loads it at the start,
// when the Settings close and when an agent opens.
let walkieOn = false;
export const walkie = () => walkieOn;
export const setWalkie = (on: unknown) => void (walkieOn = on === true);
export const stt = (talk = false) => {
  if (talk && walkie()) return "&stt=whisper";
  const s = localStorage.getItem("stt");
  return s && s in STT ? `&stt=${s}` : "";
};
// The text of a whole sound in one part (bridge/dictate.ts). An answer of the bridge that is not OK is `final`: the same
// sound again does not help. Any other error is the link, so the sound can go again.
export async function transcribe(pcm: Int16Array<ArrayBuffer>) {
  const res = await bridgeFetch(`/dictate?id=${crypto.randomUUID().replaceAll("-", "")}&end${stt(true)}`, { method: "POST", body: pcm });
  if (res.status === 404) throw Object.assign(new Error("the bridge has no dictation yet. Restart the bridge."), { final: true });
  if (!res.ok) throw Object.assign(new Error((await res.text()) || `the bridge answered ${res.status}.`), { final: true });
  return ((await res.json()) as { text: string }).text;
}
// The first entry of the outbox with the text of its sound in place of the sound. The text goes into the outbox
// before the call, so that an offline call does not make the text again. False: the sound did not become text yet.
async function hear(first: Outgoing) {
  const key = Object.keys(first.args).find((k) => isRecorded(first.args[k]));
  if (!key) return true;
  const { sound, before } = first.args[key] as Recorded;
  const pcm = await store<Int16Array<ArrayBuffer> | undefined>("readonly", (s) => s.get(sound), "sounds");
  if (!pcm) throw new Error("its sound is gone.");
  let text;
  try {
    text = (await transcribe(pcm)).trim();
  } catch (e) {
    if ((e as { final?: boolean }).final) throw e;
    return false;
  }
  if (!text && !before) throw new Error("Yonder did not hear you.");
  keep([{ ...first, args: { ...first.args, [key]: [before, text].filter(Boolean).join(" ") } }, ...outgoing().slice(1)]);
  void dropSound(sound);
  return true;
}

// A call can also drop after it left the phone (`dropped` in src/link.ts), for example when the phone changes networks.
// The phone cannot know if the Mac got it, so each call has a key, and the bridge runs a key one time (`replyOnce` in
// bridge/main.ts). The phone then sends the call again at once, 3 times at most. Else a drop loses a new agent with
// "The agent did not start: The relay closed the connection." (Sentry YONDER-1).
async function queue(name: string, args: Record<string, unknown>) {
  args = { ...args, key: crypto.randomUUID() };
  // A queued call goes first, so that the calls keep their order. A dictation goes through the outbox, which makes its text.
  if (!outgoing().length && !Object.values(args).some(isRecorded)) {
    for (let tries = 1; ; tries++) {
      try {
        return await toolText(name, args);
      } catch (e) {
        if ((e as { offline?: boolean }).offline) break;
        if (!(e as { dropped?: boolean }).dropped || tries === 3) throw e;
      }
    }
  }
  keep([...outgoing(), { name, args }]);
  void flush();
  return OFFLINE;
}

// An app that closes after a send and before `keep` sends that call again at the next start, with the same key.
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    for (let list = outgoing(); list.length; list = outgoing()) {
      try {
        if (!(await hear(list[0]))) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        list = outgoing();
        await toolText(list[0].name, list[0].args);
      } catch (e) {
        const { offline, dropped } = e as { offline?: boolean; dropped?: boolean };
        if (offline || dropped) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        outbox.fail(`A queued ${list[0].name === "start_worker" ? word.one : "message"} did not go to the Mac: ${(e as Error).message}`);
      }
      keep(outgoing().slice(1));
    }
  } finally {
    flushing = false;
  }
}
// WebKit names a dropped request "Load failed". Sentry then adds the host. Chrome says "Failed to fetch".
export const bridgeDown = (e: unknown) =>
  (e as { name?: string })?.name === "TypeError" &&
  /^(Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.)/.test((e as { message?: string }).message ?? "");

// A restart of the bridge drops the POST /mcp that is in flight. The new process answers /front in about 2 seconds.
// One wait is shared, so the polls do not each wait alone.
let waking: Promise<boolean> | undefined;
function wakeBridge(): Promise<boolean> {
  if (waking) return waking;
  waking = (async () => {
    for (const ms of [300, 600, 1200, 1500]) {
      await new Promise((r) => setTimeout(r, ms));
      try {
        const res = await toBridge(`${BRIDGE}/front`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) return true;
      } catch {
        /* The bridge is still down. */
      }
    }
    return false;
  })().finally(() => {
    waking = undefined;
  });
  return waking;
}

// A restart drops the request that is in flight. WebKit calls that "Load failed". The bridge is back in about
// 2 seconds, so the request goes again. One retry.
export async function onceMore<T>(once: () => Promise<T>): Promise<T> {
  try {
    return await once();
  } catch (e) {
    if (!bridgeDown(e) || !(await wakeBridge())) throw e;
    return await once();
  }
}

async function toolText(name: string, args: Record<string, unknown>) {
  const once = async () => {
    const res = await (await connect()).callTool({ name, arguments: args });
    const text = (res.content as { text?: string }[]).map((c) => c.text ?? "").join("");
    if (res.isError) throw new Error(text);
    return text;
  };
  // The Update button has its own fix (Sentry YONDER-B). This is the POST /mcp.
  return onceMore(once);
}

export const call = async <T>(name: string, args?: Record<string, unknown>): Promise<T> =>
  JSON.parse(await callTool(name, args, 0));

export async function listTools() {
  return (await (await connect()).listTools()).tools;
}

// A link that Yonder opens on the phone hides the app. The Face ID lock (src/Lock.tsx) skips that hide, so the user
// does not unlock again on the way back. A new start of the app still locks it.
export const away = { link: false };
const leave = (open: Promise<void>) => ((away.link = true), open.catch((e) => ((away.link = false), Promise.reject(e))));

// Opens a link in the chat. A link with target="_blank" does nothing in the window of Tauri. The phone opens it in
// Safari (Chrome on Android), because the capabilities allow the browser inside Yonder only for yonder.so. The Mac
// opens it in its default browser through the bridge.
export const openLink = (url: string) =>
  (phone ? leave(openUrl(url)) : callTool("open_link", { url })).catch(() => callTool("copy_to_clipboard", { text: url }));

// The port of a link to a dev server on the Mac, such as http://localhost:5173/about. The phone cannot open localhost.
export const localPort = (href: string) => Number(href.match(/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d+)/i)?.[1]) || 0;
// The site of a link that opens through Yonder Preview: a localhost address on the phone, or a private address of the
// tunnel, such as https://sundial-sam.yonder.so, by the name of its site. Else the link opens as it is.
export function linkSite(href: string, suffix = "") {
  const port = phone ? localPort(href) : 0;
  const host = /^https:\/\/([^/?#]+)/i.exec(href)?.[1].toLowerCase() ?? "";
  const label = suffix && host.endsWith(suffix) ? host.slice(0, -suffix.length) : "";
  return port ? { port } : label ? { worker: label } : undefined;
}

// Shows the web site of an agent or a project (Yonder Preview). The Mac opens it in its browser from localhost.
// The phone opens its private HTTPS address in a browser inside Yonder, so the call goes on. An older phone app
// has no such browser, so the link goes to the clipboard of the Mac, and Universal Clipboard gives it to the iPhone.
// The address has a one-time key, so it never goes to the voice agent.
// The first open of a project through the tunnel needs a yes. A tap asks with `ask`. Grok gets the question in the result.
export type Confirm = { project: string; label: string; port: number; title: string };
// A link from a chat (`link`) keeps its path, its query and its hash in the preview. With `launch` false, it only
// opens the tunnel of the site, for the switch of the Tunnel tab, and drops the key. `via` calls the tool on another
// computer of the phone (reach in src/elsewhere.ts): its address is on the tunnel of that computer.
export async function showSite(args: Record<string, unknown>, ask?: (c: Confirm) => Promise<boolean>, link?: string, launch = true, via: (name: string, args: Record<string, unknown>) => Promise<string> = callTool) {
  const open = (more?: object) => via("preview", { ...args, ...more, action: "open", mac: launch && !phone }).then(JSON.parse);
  let res = await open();
  if (res.confirm && ask) res = (await ask(res.confirm)) ? await open({ confirmed: true }) : { cancelled: true };
  let { url, ...site } = res;
  if (!url || !launch) return site;
  if (link) {
    const [u, l] = [new URL(url), new URL(link)];
    u.pathname = l.pathname;
    l.searchParams.forEach((v, k) => u.searchParams.append(k, v));
    u.hash = l.hash;
    url = u.href;
  }
  try {
    await leave(openUrl(url, "inAppBrowser"));
    return { ...site, opened: "in the browser of the phone" };
  } catch {
    await callTool("copy_to_clipboard", { text: url });
    return { ...site, note: "This phone app cannot open the site yet. The link is on the clipboard, so the user can paste it in Safari. Installing the phone app again fixes it." };
  }
}
