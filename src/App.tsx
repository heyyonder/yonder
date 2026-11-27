import { createContext, Fragment, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ImgHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent, type WheelEvent } from "react";
import { createPortal, flushSync } from "react-dom";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Tabs } from "@base-ui/react/tabs";
import { Toggle } from "@base-ui/react/toggle";
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, type Variants } from "motion/react";
import * as Sentry from "@sentry/react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { homeDir } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ActionSheet, ask as nativeAsk, AskHost } from "./ask";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { android, BRIDGE, bridgeDown, bridgeFetch, callTool, checkLink, linkVia, pollTime, outbox, OFFLINE, useReport, type Recorded, haptic, haptics, forgetMedia, isPaired, linkCar, listTools, movePhone, phone, resetClient, shell, useBridgeSrc, type Cli, type Clis, type Project, type Site, type Worker, type Confirm, ding, whoosh, holdAudio, decodeAudio, say, hush, walkie, setWalkie, showSite, openLink, linkSite, localPort } from "./bridge";
import { accept, channel, count as buildCount, forHost, ghostty, installed, platform, running, useFront } from "./front";
import { Empty } from "./Empty";
import { find, places } from "./find";
import { pastePlan } from "./paste";
import { isPath, rehypePaths, urlsOf } from "./paths";
import { hold, loadPairing, loadPairings, macName, moveTo, pickMac, switchPairing, type Pairing } from "./link";
import { carry, computers, elsewhere, elsewhereProjects, hidden, linkedAgents, reach, type Elsewhere, type FarProjects } from "./elsewhere";
import { Levels, size } from "./Levels";
import { Orb } from "./Orb";
import { dictate, dropMic, warmMic, type Dictation } from "./dictate";
import { Icon, iconFor } from "./icons";
import { lockOn, unlock } from "./Lock";
import { byName, callName, nameOf, setWord, shown, stripNoun, swap, voiceRef, word } from "./names";
import { chromeVersion, menus, useNativeChrome, type ChromeMenuItem } from "./chrome";
import { AttachSheet, type Recent } from "./Attach";
import { Pair } from "./Pair";
import { Setup, type Picked } from "./Setup";
import { approveSecret } from "./Vault";
import { Approval, AppIcon, ArtifactCard, IconPicker, Picker, ArtifactViewer, AskRow, changeCanvas, forgetGone, goneApp, isGone, screenOf, showArtifact, useCanvas, type Artifact } from "./Canvas";
import { PairPhone, Welcome } from "./PairPhone";
import { SignIn } from "./SignIn";
import { FolderPicker } from "./FolderPicker";
import { dropSync, giveSync, giveTunnel, onAccount, refreshAccount, saved, signOut, SITE, speech } from "./account";
import { ACCENTS, accentPicks, applyAccent, applyFonts, Dropdown, type Keys, DEFAULT_KEYS, KEY_SETTINGS, Settings, applyShortcuts, hit } from "./Settings";
import { syncPhoneConfig } from "./phone-config";
import { copy, DEFAULT as DEFAULT_SCREEN, loadLook, nameOf as screenName, onLook, onNotice, pickScreen, shown as shownLook, tabsOf, tabTitle, themed, undoable, undoScreen, useLook } from "./look";
import { PreviewBar } from "./Looks";
import { attach as attachApi, changed as apiChanged, ownerName, yonder } from "./api";
import { ModBand, ModLines, ModPanes, type Mods } from "./Mods";
import { OwnScreen } from "./OwnScreen";
import TALK from "../bridge/talk.md?raw";
import { bridgeToken, chime, hasVoiceKey, locate, openMic, PRICE_PER_MINUTE, setVoiceKeys, startCall, syncAudio, voiceProvider, type Call } from "./voice";
import { abilityNames, runAbility } from "./abilities";
import { NewTaskHost } from "./NewTask";

// Set by vite.config.ts at build time.
declare const __BUILD_ID__: string;
declare const __BUILD_INFO__: string;

type Status = Worker["status"];

const inTauri = "__TAURI_INTERNALS__" in window;
// Red runs, blue waits on a reply from you, green is done, as in the Claude Code agent list.
const LABEL: Record<Status, string> = { running: "running", waiting: "waiting on you", done: "completed", failed: "failed", closed: "closed" };
// After this long silence in a call, Grok offers to close the agents that finished at least CLOSE_AFTER_MS ago.
const CLOSE_QUIET_MS = 30_000;
const CLOSE_AFTER_MS = 10 * 60_000;
// The tab of the app that shows an agent with this status.
// The Agents tab has only the agents that run. The Done tab (the value "completed") has all the other open agents: the
// waiting ones, and the done and failed ones. A row that needs the user shows it in color on its third line (`Tag`).
// One tab holds them all: a separate Review tab is confusing, because a done agent can still need a push.
// The Saved tab has the open agents that the user saved for later (`saved`), so that they are not on the Done tab. A
// saved agent stays there also while it runs.
// The bridge has the same rule (tabOf in bridge/main.ts).
const tabOf = (w: Worker) => (w.status === "closed" ? "closed" : w.saved ? "saved" : w.status === "running" ? "agents" : "completed");
// The agent waits on a reply, or Clef says that its result needs the user (`attention`).
const needsYou = (w: Worker) => w.status === "waiting" || (!!w.attention && w.status !== "running" && w.status !== "closed");
// The Agents tab has the word of the user for agents, such as "Helpers" (`agentName` in config.json, src/names.ts).
// All the agents of this computer, for the names of the projects mode (`callName` in src/names.ts).
let openAgents: Worker[] = [];
const TAB_NAME: Record<string, string> = { get agents() { return word.Many; }, completed: "Done", saved: "Saved", closed: "Closed" };
// The row label of a Claude Code session that Yonder did not start, so that it does not look like a Yonder agent.
const KIND: Record<"terminal" | "background", { label: string; tip: string }> = {
  terminal: { label: "Own terminal", tip: "A Claude Code session in a terminal of this Mac. Yonder did not start it." },
  background: { label: "Background · not Yonder", tip: "A Claude Code background session that Yonder did not start. A message makes it a Yonder agent." },
};
// What the user sees in the window, so that Grok knows what "this project" and "these agents" mean.
// The tabs in the order of the screen. The calls of the past open from the history button in the title bar
// (the settings on the phone), not from a tab. Canvas (the value "preview") lists the approvals that wait for the user,
// then the apps: the pages of the agents and the web sites that run on the Mac (src/Canvas.tsx).
// The projects open from the name of the project in the title bar, not from a tab.
// Search finds an agent in all the projects, by its name, task, project or summary.
// The tabs with a list of agents (tabOf).
const LISTS = ["agents", "completed", "saved", "closed"] as const;
const TABS = [...LISTS, "preview", "search"];

// The icon of each tab in the tab bar of the phone.
// The icon of the Agents tab is the icon of `agentName` in config.json, and else the bird.
const TAB_ICON = { get agents() { return iconFor(word.icon, "bird"); }, completed: "check", saved: "bookmark", closed: "door", preview: "layers", search: "search" } as const;
// The first row of the Projects tab. With it selected, the Agents, Done and Closed tabs show the agents of all the projects.
const ALL: Project = { name: "All workspaces", path: "*", starred: false, pinned: true };
// The name of the computer of the app in the environment dropdown. The Mac has no pairing, so no name of its own.
const HERE = /Mac/.test(navigator.userAgent) ? "This Mac" : "This computer";
// The toast of a call with no key of its voice provider on the computer. Its button opens the guide of the voice module.
const NO_KEY = "Add a voice key to your computer to talk.";
const VOICE_DOCS = "https://github.com/heyyonder/yonder/tree/main/docs/voice";
// `images` counts the images that the user attached in the window, `videos` gives the seconds of each attached video,
// `pastes` the pasted texts, and `uploading` the videos that still upload. `open` is the agent whose conversation is open.
type View = { tab: string; project?: Project; agents: Worker[]; images: number; videos?: number[]; pastes?: number; uploading?: number; open?: Worker; away?: { computer: string; agent: Worker } };
// An image that the user pasted or dropped: its preview, and its file that the bridge saved.
// A video has `seconds` and `video`, its first frame as the preview, and its folder as the path.
// `file` is a file that is not a picture or a video, such as a spreadsheet: `text` is its name, and it shows as a page.
type Image = { url: string; path: string; seconds?: number; video?: boolean; text?: string; file?: boolean };
// A text field that can take a paste. The hidden paste area is not one of these.
function textControl(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  if (target instanceof HTMLTextAreaElement) return target.readOnly || target.disabled ? null : target;
  if (!(target instanceof HTMLInputElement) || target.readOnly || target.disabled) return null;
  return /^(text|search|url|email|password|tel)?$/.test(target.type) ? target : null;
}
// Puts text at the cursor. The field is a controlled input, so the value goes through the prototype setter.
function insertPaste(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, el.value.slice(0, start) + text + el.value.slice(end));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = start + text.length;
  el.setSelectionRange(caret, caret);
}
// A "sent" line is the full prompt that agent `num` got. The bridge writes it when the agent gets the prompt.
type CallLine = { at: number; who: "you" | "yonder" | "tool" | "sent"; text: string; num?: number };
export type CallLog = { id: number; lines: CallLine[] };
// An edit or a write also gives its changed lines: hunks that start at a line of the old and the new file.
type Hunk = { old: number; new: number; lines: string[] };
// A picture, a video or a sound that a turn names: a URL, or the full path of a file that the bridge serves.
// A "page" is an artifact, an app of the Canvas tab (src/Canvas.tsx).
type Media = { src: string; kind: "image" | "video" | "audio" | "pdf" | "page"; v?: number };
// A tool call also gives its ID, the first lines of its result (`out`, and `more` lines after them) and `error`.
type Turn = { who: "user" | "assistant" | "tool" | "thinking"; text: string; diff?: Hunk[]; media?: Media[]; running?: true; id?: string; out?: string[]; more?: number; error?: true };

// The actions of the user show at once: the app changes its own list of agents, and then calls the bridge.
// Until the bridge answers, each poll keeps the change. Then the app reads the agents again and drops the change.
// A failed call drops the change, so the agent goes back to how it was. `null` removes the agent from the list.
const pending = new Map<string, Partial<Worker> | null>();
const withPending = (list: Worker[]) =>
  pending.size ? list.flatMap((w) => (pending.has(w.id) ? (pending.get(w.id) ? [{ ...w, ...pending.get(w.id) }] : []) : [w])) : list;
let showWorkers = (_list?: Worker[]) => {};
// The iPhone app painted the window behind the web view in this page (the theme effect of App).
let painted = false;
// The agents that the app knows. An agent that comes after the first list from the bridge is new: its row grows in,
// if the row shows in the 10 seconds after the app saw the agent. A row that shows later, on a tab switch, does not.
const seen = new Set<string>();
const born = new Map<string, number>();
// The first ID of each agent, by its session ID. The row keeps the key of its first ID, so the change of the ID does not
// make a new row. A new title often comes in the same update as the session ID.
const firstId = new Map<string, string>();
const keyOf = (w: Worker) => firstId.get(w.id) ?? w.id;
let listed = false;
// A yonder://agent?id=<id> link, from Copy Link in the three dots of an agent, opens that agent, also an agent of another
// computer. A link only opens a view, so it needs no check. It can come before the first list of the agents, so it waits
// here.
let linkedAgent = "";
let openLinked = () => {};
addEventListener("yonder:opened", (e) => {
  for (const url of (e as CustomEvent<string[]>).detail ?? [])
    if (typeof url === "string" && url.startsWith("yonder://agent?")) linkedAgent = new URL(url).searchParams.get("id") ?? "";
  openLinked();
});
// Copy Link, in the three dots of an agent and in the right-click menu of its row. A new agent has its session ID a second
// after the start, and a sub-agent opens from its agent. A pick of the native menu of iOS is not a tap of the page, so the
// web clipboard can refuse it: the phone copies with its native ability first.
const linkable = (w: Worker) => !w.parent && !/^new\d+$/.test(w.id);
const copyAgentLink = (w: Worker) => {
  const text = `yonder://agent?id=${encodeURIComponent(w.id)}`;
  void (phone ? runAbility("copy", { text }).then((r) => ("error" in r ? navigator.clipboard.writeText(text) : undefined)) : yonder.tool("copy_to_clipboard", { text })).catch(() => {});
};
// A poll that started before the bridge answered can bring the old state, so the poll drops it.
let settledAt = 0;
// The Environment section of the prompt of Grok on the phone (instructions below): the Mac in use, the other Macs of the
// phone, and the switch_environment tool. `from`: the Mac before a switch during this call, whose agent numbers Grok
// heard.
let environment = "";
async function describeEnvironment(from?: string) {
  const [current, all] = await Promise.all([loadPairing(), loadPairings()]).catch(() => [undefined, [] as Pairing[]] as const);
  const others = all.filter((p) => p.mac !== current?.mac).map(macName);
  environment = [
    `You work on the environment ${macName(current)}: its workspaces and its agents.`,
    others.length ? `The phone is also paired with: ${others.join(", ")}.` : "The phone is paired with no other environment.",
    `- Only when the user asks to switch the environment, the PC, the Mac or the computer ("switch environment", "switch PC", "switch Mac", "go to the other MacBook"), call switch_environment with the name of the environment. With only one other environment, leave out the name.`,
    others.length ? `- When the user asks about the agents of another environment ("what's running on the Mac mini?"), call other_environments. To act on another environment, such as to start, message, check, rename, close or stop an agent there, call other_computer with the name of that environment, any tool of Yonder and its arguments. Their numbers are of that environment. Do not call switch_environment for this: the call, the screen and the dictation stay on ${macName(current)}. When the user asks how such an agent is doing, call other_computer with get_worker.` : "",
    from ? `- The user switched from ${from} to ${macName(current)} during this call. Each agent number from before the switch is an agent of ${from}, and the same number is another agent now. Read the agents again before you act on a number from before the switch.` : "",
  ].filter(Boolean).join("\n");
}
// The theme of the system, for a first start with no theme of the user.
const systemTheme = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
// The two scopes of the task list when two people or more share this computer (docs/multi-user.md).
const SCOPES = [{ value: "mine", label: "Mine" }, { value: "all", label: "Everyone" }];
const PATCH: Record<string, Partial<Worker> | null> = {
  // The time of the close, so that the agent is at the top of the Closed tab at once, as when the bridge answers.
  get close_worker(): Partial<Worker> { return { status: "closed", attention: false, updatedAt: Date.now() }; },
  complete_worker: { status: "done", attention: false },
  remove_worker: null,
};
function act(tool: string, ws: Worker[], args: Record<string, unknown> = {}, patch = PATCH[tool], buzz = true) {
  if (buzz && ((tool === "close_worker" && !args.done) || tool === "remove_worker")) haptics(["medium", "heavy"]);
  for (const w of ws) pending.set(w.id, patch && { ...pending.get(w.id), ...patch });
  showWorkers();
  const done = (list?: Worker[]) => {
    settledAt = Date.now();
    for (const w of ws) pending.delete(w.id);
    showWorkers(list);
  };
  return yonder.mice.act(tool, args).then(
    () => yonder.mice.all().then(done, () => done()),
    (e) => {
      done();
      throw e;
    },
  );
}
// The bridge of an open chat: the computer in use, or another computer of the phone (`far`, src/elsewhere.ts).
type Link = { fetch: typeof bridgeFetch; call: (tool: string, args: Record<string, unknown>) => Promise<unknown>; act: typeof act; far?: boolean };
const LinkOf = createContext<Link>({ fetch: bridgeFetch, call: callTool, act });

export function App() {
  // `theme` is the choice: light, dark or system. `shownTheme` is the theme on the screen, and system follows the device.
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") ?? systemTheme());
  const [sys, setSys] = useState(systemTheme);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSys(systemTheme());
    media.addEventListener("change", on);
    return () => media.removeEventListener("change", on);
  }, []);
  const shownTheme = theme === "system" ? sys : theme;
  // The screen in use: the default, a sample or a screen of the user (src/look.ts). A new screen can bring its theme.
  const look = useLook();
  // The settings of phone.json on the screen, after a sync or a change of a front end (src/api.ts).
  const applySettings = () => {
    setTheme(localStorage.getItem("theme") ?? systemTheme());
    setUsageBar(localStorage.getItem("usageBar") !== "off");
    setAppsGrid(localStorage.getItem("appsView") === "grid");
    applyAccent();
    applyFonts();
    loadLook();
  };
  useEffect(() => (loadLook(), onLook(() => setTheme(localStorage.getItem("theme") ?? systemTheme()))), []);
  useEffect(() => onNotice(setError), []);
  // "Hey Yonder" opens the notch of a new agent on the Mac, and starts a call on Android. It is off, with no switch:
  // the effect below turns it off on each Mac and Android app. The Mac keeps the microphone of dictation open after a
  // dictation (MAC_LINGER_MS in src/dictate.ts), and "Hey Yonder" would hear "Yonder" in the words.
  const [wake] = useState(false);
  // The keys of the Mac (Settings, Keys): the key of the notch of a new agent, the key of the call and the key of the
  // voice note.
  const [keys, setKeys] = useState<Keys>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("keys") ?? "{}");
      const keys = { ...DEFAULT_KEYS, ...saved };
      // Keys from before the voice note can already give its key, right ⌥, to another action.
      if (!saved.note && (keys.notch === keys.note || keys.call === keys.note)) keys.note = "off";
      // Older versions had the voice note on by default, and the app saves all the keys at each start. So the
      // voice note goes off once for each Mac, and macOS asks for Accessibility only after the user chooses its key.
      if (localStorage.getItem("noteDefaultOff") !== "1") {
        keys.note = "off";
        localStorage.setItem("noteDefaultOff", "1");
      }
      return keys;
    } catch {
      return DEFAULT_KEYS;
    }
  });
  // Before the keys, which start the helper of the notch, so that it starts once with the microphone of the settings.
  useEffect(syncAudio, []);
  useEffect(() => {
    localStorage.setItem("keys", JSON.stringify(keys));
    if (inTauri && !phone) yonder.native.setKeys(keys).catch(() => {});
  }, [keys]);
  // The weekly usage of the active profile in the title bar. It is on by default. Each device keeps its own choice.
  const [usageBar, setUsageBar] = useState(() => localStorage.getItem("usageBar") !== "off");
  // The Canvas tab as a list or as a grid of icons, as the home screen of the iPhone. Each device keeps its own choice
  // (appsView in phone.json, with the sync of the account).
  const [appsGrid, setAppsGrid] = useState(() => localStorage.getItem("appsView") === "grid");
  const [showArchived, setShowArchived] = useState(false);
  const [online, setOnline] = useState(true);
  // A phone with no pairing: the lists stay empty, the call button says "Pair your computer", and it opens the pairing
  // screen (`linking`). The pairing moves the app to the new computer with no new load (moveTo below).
  const [unpaired, setUnpaired] = useState(() => phone && !isPaired());
  // A phone with no pairing and no first run yet opens on the pairing screen, with How it works (src/Pair.tsx).
  const [linking, setLinking] = useState(() => phone && !isPaired() && !localStorage.getItem("onboarded"));
  // The first run after the pairing (src/Setup.tsx). `ask`: the computer has no answers yet (`onboarded` in phone.json).
  // A phone that closed during the setup opens on it again, because it still holds the push (`permsWait`).
  const [setup, setSetup] = useState<{ ask: boolean } | undefined>(() =>
    phone && isPaired() && localStorage.getItem("permsWait")
      ? { ask: localStorage.getItem("onboarded") !== "on" }
      : // A check in the browser opens the setup with ?setup (only in the dev server).
        import.meta.env.DEV && new URLSearchParams(location.search).has("setup")
        ? { ask: true }
        : undefined,
  );
  const startSetup = () =>
    void bridgeFetch("/phone-config")
      .then((r) => r.json())
      .then((f: { onboarded?: string }) => setSetup({ ask: !f.onboarded }), () => {});
  // Replay setup of Settings › General: the steps of a new phone again, with the permissions, and the push held until
  // their end. The steps that are done (folder access, the sign-in) still skip themselves.
  useEffect(() => {
    const replay = () => (phone && localStorage.setItem("permsWait", "1"), setSettings(false), setSetup({ ask: true }));
    window.addEventListener("yonder-setup", replay);
    return () => window.removeEventListener("yonder-setup", replay);
  }, []);
  const endSetup = (p: Picked) => {
    setSetup(undefined);
    if (p.screen === "big") setUsageBar(false);
    // The agent that sets up the rest starts with a question, so its chat opens (the last step of src/Setup.tsx).
    if (!p.agent) return;
    if (viewRef.current.tab === "agents" && selectedRef.current === ALL.path) setOpened(p.agent);
    else ((openNext.current = p.agent), setSelected(ALL.path), setTab("agents"));
  };
  const [workers, setWorkers] = useState<Worker[]>([]);
  openAgents = workers;
  const rawWorkers = useRef<Worker[]>([]);
  showWorkers = (given) => {
    const list = given ?? rawWorkers.current;
    // A new agent shows first with a short ID such as "new1", and a second later with its session ID. Its row grows in
    // only once. The match is by number only: with a match by number and name, a title that comes in the same update as
    // the session ID makes the row grow in again.
    const grown = new Map(rawWorkers.current.filter((w) => /^new\d+$/.test(w.id) && !list.some((x) => x.id === w.id)).map((w) => [w.num, keyOf(w)]));
    for (const w of list) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      const was = grown.get(w.num);
      if (was) firstId.set(w.id, was);
      else if (listed) born.set(w.id, Date.now());
    }
    listed ||= !!given;
    rawWorkers.current = list;
    forgetMedia(new Set(list.flatMap((w) => (w.status === "closed" ? [] : [w.id]))));
    setWorkers(withPending(list));
  };
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState("");
  // After an update, the app opens the tab and the agent or call that were open before the reload (front.ts).
  // A start without an update opens the last tab and project ("view") too, with the agent that was open, also the Closed
  // tab. iOS often ends the app in the background, so the open agent stays open until a tap on Back.
  const [resumed] = useState<{ tab?: string; opened?: string }>(() => {
    const r = JSON.parse(localStorage.getItem("resume") || "{}");
    return r.tab ? r : JSON.parse(localStorage.getItem("view") || "{}");
  });
  const [tab, setTab] = useState(resumed.tab ?? "agents");
  // The Projects view has no tab in the bar, so Base UI cannot find its side, and it slid in from the right. The
  // Projects view is at the left of the Agents tab, so it slides in from the left, and the tab after it from the right.
  const [slide, setSlide] = useState({ from: tab, dir: "" });
  if (slide.from !== tab) setSlide({ from: tab, dir: tab === "projects" ? "left" : slide.from === "projects" ? "right" : "" });
  // A scroll down the projects hides the search and shrinks the call row, and a scroll up shows them again.
  const [scrolled, setScrolled] = useState(false);
  const lastTop = useRef(0);
  // A hidden panel loses its scroll, so each tab change shows the search again.
  // On the phone, each tab change after the first render gives a light tap (see main.tsx).
  const tabTaps = useRef(false);
  useEffect(() => {
    setScrolled(false);
    lastTop.current = 0;
    if (tabTaps.current) haptic();
    tabTaps.current = true;
    // A narrow Mac window scrolls the tabs sideways (app.css), so the open tab scrolls into view.
    if (!phone) document.querySelector(".tablist [aria-selected=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);
  const [selected, setSelected] = useState(() => (resumed.tab && localStorage.getItem("project")) || ALL.path);
  const [phase, setPhase] = useState<"idle" | "connecting" | "live">("idle");
  // On the phone, a press of the call button taps once, a live call taps three times, from light to heavy, and the end
  // of a call taps three times, from heavy to light. Grok and a lost connection can also end the call.
  const lastPhase = useRef(phase);
  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    if (phase === "connecting") haptic("medium");
    else if (phase === "live") haptics(["light", "medium", "heavy"]);
    else if (was !== "idle") haptics(["heavy", "medium", "light"]);
  }, [phase]);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  useReport(error);
  // The Yonder account gives the tunnel and the backup of the settings. Yonder is free, with no paid plan: a voice call
  // needs no account, only the key of a voice provider on the computer (`keys` of /token?check of the bridge).
  const [account, setAccount] = useState(() => saved()?.account);
  const [voiceKeys, setVoiceKeysState] = useState<string[]>();
  const [signingIn, setSigningIn] = useState<false | "signup" | "login">(false);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    // A sign-in goes to the bridge of the computer in use at once, so a new device gets the backup of the settings.
    onAccount((a) => (setAccount(a), linkCar(), a && void giveSync(bridgeFetch).catch(() => {})));
    refreshAccount();
  }, []);
  // `grokCall` holds the cost of the live call, saved each second. A call that
  // did not end normally (a quit or a reinstall of the app) still counts.
  const [spent, setSpent] = useState(() => {
    const total = Number(localStorage.getItem("grokSpent") ?? 0) + Number(localStorage.getItem("grokCall") ?? 0);
    localStorage.setItem("grokSpent", String(total));
    localStorage.removeItem("grokCall");
    return total;
  });
  const [now, setNow] = useState(Date.now());
  const [calls, setCalls] = useState<CallLog[]>([]);
  // The agent or the call that is open. A change of tab or project goes back to the list.
  const [opened, setOpened] = useState("");
  // The words of the Search tab.
  const [query, setQuery] = useState("");
  // The sub-agent whose conversation is open in the conversation of its agent, so that Grok knows that "it" means 21B.
  const [openSub, setOpenSub] = useState<Worker>();
  const openedRef = useRef(opened);
  openedRef.current = opened;
  // The attached images go with the next request or message to an agent.
  const [images, setImages] = useState<Image[]>([]);
  const [dragging, setDragging] = useState(false);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  // The fetch of the bridge of another computer while its agent's chat is open (imageLink), else none.
  const imageFetch = useRef<typeof bridgeFetch>(undefined);
  const pad = useRef<HTMLTextAreaElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  // Grok's show_agent tool changes the tab and the project, and opens an agent at the same time.
  const openNext = useRef(resumed.opened ?? "");
  useEffect(() => {
    setOpened(openNext.current);
    openNext.current = "";
  }, [tab, selected]);
  useEffect(() => {
    localStorage.removeItem("resume");
    localStorage.setItem("view", JSON.stringify({ tab, opened }));
  }, [tab, opened]);
  const callRef = useRef<Call | null>(null);
  // The version "2.B.N" of the source (version.ts). The app is behind when the source has more commits than its build.
  const [source, setSource] = useState("");
  // The real spend from the xAI billing records. It needs XAI_MANAGEMENT_KEY in the .env of the bridge.
  const [xai, setXai] = useState<XaiUsage>({});
  // The Claude Code plan limits (the session and the week), the same numbers as /usage in Claude Code.
  const [claude, setClaude] = useState<ClaudeUsage>({});
  const [tapped, setUpdating] = useState(false);
  const behind = buildCount(source) - buildCount(__BUILD_ID__);
  // The front end loads a new build by itself, with no button (src/front.ts). `shell`: the Mac app needs a full rebuild.
  const { shell: rebuildMac, building, store, tooNew, notice, lookStore } = useFront(online, phase !== "idle");
  // The phone keeps an older screen than the computer: a toast says why, one time (src/front.ts).
  useEffect(() => void (notice && setError(notice)), [notice]);
  // "Updating…" after a tap, and also when an agent, the voice or another device started the rebuild.
  const updating = tapped || building;
  // A newer version of a copy from yonder.so (check_update in src-tauri/src/main.rs). It downloads in the background,
  // and the app restarts into it when its window is not in front. Until then the call
  // button shows "Update available", and a click restarts into it at once. The call row shows the version for the 3
  // seconds before the restart. A call that starts in that time stops the restart, so the label goes again.
  const [release, setRelease] = useState("");
  const [installing, setInstalling] = useState("");
  const reloading = installing;
  // For call_status, which Grok calls during the call.
  const stateRef = useRef({ workers, spent, theme, source, xai, claude, online });
  stateRef.current = { workers, spent, theme, source, xai, claude, online };
  // The time of the last answer of the bridge, so that Grok can say since when the Mac is offline.
  const seenRef = useRef(Date.now());
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const pushed = useRef({ text: "", at: 0 });
  // True after a switch to another Mac, so the first list of the new Mac goes to Grok at once (moveTo below).
  const moved = useRef(false);
  const viewRef = useRef<View>({ tab, agents: [], images: 0 });
  const listRef = useRef<Project[]>([]);
  const shownRef = useRef<Project[]>([]);
  // The project folder of each agent, for show_agent.
  const projectOfRef = useRef(new Map<string, string>());
  const [moving, setMoving] = useState("");
  // The project of All projects under an agent that the user drags (dropOf).
  const [dropOn, setDropOn] = useState("");
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const swipe = useRef({ dx: 0, at: 0, done: false });
  // An open agent has no trackpad swipe between tabs, so a sideways scroll in it scrolls.
  const agentOpen = useRef(false);
  const bar = useRef<{ x: number; moved: boolean } | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = shownTheme;
    localStorage.setItem("theme", theme);
    syncPhoneConfig();
    // An older phone app has no `paint_window`, so the error is ignored.
    // The `paint_window` of an older iPhone app also paints the text-effects window of
    // UIKit, which floats over the app. UIKit makes that window after the first taps, so a paint after a new load of
    // the page covered the whole app: the black screen. So the page paints only once, in the
    // first load of a run of the app (`navigate`). A new load for an update is `reload`, and a new load after iOS
    // stopped the web content process is `back_forward`.
    // shortcut: a change of the theme later in the run keeps the old color under the bar of the keyboard until the
    // next start. Paint on each change again when no install from before the fix is left.
    const nav = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
    if (phone && !android && !painted && nav === "navigate") {
      painted = true;
      yonder.native.paintWindow({ dark: shownTheme === "dark" }).catch(() => {});
    }
  }, [theme, shownTheme]);
  useEffect(() => {
    localStorage.setItem("project", selected);
  }, [selected]);
  useEffect(() => {
    localStorage.setItem("usageBar", usageBar ? "on" : "off");
    syncPhoneConfig();
  }, [usageBar]);
  // The word and the icon for an agent (`agentName` in config.json, src/names.ts), with the settings of the phone below,
  // so that an edit of the file shows in about 10 seconds, on the Mac and on the phone. A change draws the app again.
  const [, setNamed] = useState(0);
  const loadName = () =>
    // An older bridge has no /agent-name: then the default word, not the word of the last computer.
    yonder.agentName().then((n) => {
      if (!setWord(n)) return;
      localStorage.setItem("agentName", JSON.stringify(n));
      setNamed((k) => k + 1);
    }, () => {});
  // phone.json on the Mac (src/phone-config.ts): the phone pulls it when it opens, when it comes to the front and every 10
  // seconds, and each change of a setting on the phone goes into it.
  useEffect(() => {
    const pull = () => document.visibilityState === "visible" && (syncPhoneConfig(applySettings), loadName());
    pull();
    // Also every 10 seconds while the app is on the screen, so that an order to switch the computer comes soon.
    const timer = setInterval(pull, 10_000);
    document.addEventListener("visibilitychange", pull);
    // Every 3 seconds, the calls of the agents of the Mac to the other computers (other_computer, src/elsewhere.ts).
    // Also in a call with the screen off: the page is hidden then, but the call keeps the app awake. Else other_computer
    // fails during a call. Android does not stop the timers of a hidden
    // page, so with no call the poll still waits for the screen.
    const relay = setInterval(() => phone && (document.visibilityState === "visible" || callRef.current) && void carry(), 3_000);
    return () => (clearInterval(timer), clearInterval(relay), document.removeEventListener("visibilitychange", pull));
  }, []);
  useEffect(() => {
    localStorage.setItem("wake", wake ? "on" : "off");
    syncPhoneConfig();
    if (inTauri && !phone) yonder.native.setWake({ on: wake }).catch(() => {});
    shell?.wake?.(wake);
  }, [wake]);
  // A sideways swipe only changes the tab, so it must not scroll the content.
  // React adds passive wheel listeners, which cannot cancel the scroll.
  useEffect(() => {
    const stop = (e: globalThis.WheelEvent) => {
      if (!agentOpen.current && Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
    };
    window.addEventListener("wheel", stop, { passive: false });
    return () => window.removeEventListener("wheel", stop);
  }, []);
  // Command 1 to 5 opens the tab in that place. The left and right arrows move one tab,
  // except in a text field. On a focused tab, Base UI moves the tab and cancels the event.
  // In an open conversation or call, the left arrow goes back to the list and focuses the row.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (step && !e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.defaultPrevented) {
        const el = e.target as HTMLElement;
        const back = openedRef.current;
        // The empty prompt box of an open conversation lets the left arrow go back, because the Mac keeps the focus there.
        const empty = step === -1 && back && el.matches(".prompt textarea") && !(el as HTMLTextAreaElement).value;
        if (!empty && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role=dialog]"))) return;
        e.preventDefault();
        if (step === -1 && back) {
          setOpened("");
          requestAnimationFrame(() => document.querySelector<HTMLElement>(`.panel:not([hidden]) .row[data-id="${CSS.escape(back)}"]`)?.focus());
          return;
        }
        setTab((tab) => TABS[TABS.indexOf(tab) + step] ?? tab);
        return;
      }
      const next = e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && TABS[Number(e.key) - 1];
      if (!next) return;
      e.preventDefault();
      setTab(next);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // Back and forward go to the view before or after, as in a browser: the tab, the project and the open agent or call.
  // Each view is an entry of the history of the page, so Chrome gives its own back and forward (the mouse buttons, ⌘[ and
  // ⌘], the swipe). The web view of the Mac app has none of these, so the app gives the mouse buttons and the keys there.
  // A view goes into the history when it stays for 300 ms, so the second render
  // of a tab change (openNext above) and the views of a fast click make no entry of their own. Not on the phone.
  const here = { tab, selected, opened };
  const shownView = useRef(here);
  shownView.current = here;
  const keep = () => {
    const v = shownView.current;
    if (phone || JSON.stringify(v) === JSON.stringify(history.state)) return;
    if (history.state?.tab) history.pushState(v, "");
    else history.replaceState(v, "");
  };
  useEffect(() => {
    const timer = setTimeout(keep, 300);
    return () => clearTimeout(timer);
  }, [tab, selected, opened]);
  useEffect(() => {
    if (phone) return;
    const pop = (e: PopStateEvent) => {
      const v = e.state as typeof here | null;
      if (!v?.tab) return;
      if (v.tab !== shownView.current.tab || v.selected !== shownView.current.selected) openNext.current = v.opened;
      setTab(v.tab);
      setSelected(v.selected);
      setOpened(v.opened);
    };
    const go = (step: number) => (keep(), history.go(step));
    const mouse = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      go(e.button === 3 ? -1 : 1);
    };
    const key = (e: KeyboardEvent) => {
      const step = hit(e, "backKey") ? -1 : hit(e, "forwardKey") ? 1 : 0;
      // An arrow key (⌘← and ⌘→ by default) moves the cursor in a field with text, and moves the project switcher, as in Chrome.
      const field = e.target as HTMLElement;
      if (!step || (e.key.startsWith("Arrow") && (field.isContentEditable || textControl(field)?.value || document.querySelector(".switcher")))) return;
      e.preventDefault();
      go(step);
    };
    window.addEventListener("popstate", pop);
    if (inTauri) (window.addEventListener("mouseup", mouse), window.addEventListener("keydown", key));
    // The swipe of the Mac app (owner.m): the back and forward buttons of some mice and a swipe with three fingers.
    const swipe = inTauri ? listen<number>("swipe", (e) => go(e.payload)) : undefined;
    return () => (window.removeEventListener("popstate", pop), window.removeEventListener("mouseup", mouse), window.removeEventListener("keydown", key), void swipe?.then((unlisten) => unlisten()));
  }, []);
  // ⌘+ and ⌘− zoom the content of the tabs in and out, and ⌘0 sets it back. The zoom stays after a restart.
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem("zoom")) || 1);
  useEffect(() => {
    document.documentElement.style.setProperty("--zoom", String(zoom));
    localStorage.setItem("zoom", String(zoom));
  }, [zoom]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey) return;
      const step = ({ "=": 0.1, "+": 0.1, "-": -0.1 } as Record<string, number>)[e.key];
      if (!step && e.key !== "0") return;
      e.preventDefault();
      setZoom((z) => (step ? Math.min(2, Math.max(0.5, Math.round((z + step) * 10) / 10)) : 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // A muted track sends silence, so the call stays on.
  const toggleMute = () =>
    setMuted((m) => {
      callRef.current?.mute(!m);
      return !m;
    });
  // M mutes or unmutes the microphone during a call, except in a text field.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "m" || e.metaKey || e.ctrlKey || e.altKey || e.repeat || !callRef.current) return;
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      e.preventDefault();
      toggleMute();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // On the Projects tab, the up and down arrows select the previous or next project and
  // focus its row, so Enter or Space on the row opens it. Enter with no focus also opens it.
  // Option and an arrow move a starred project up or down.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (viewRef.current.tab !== "projects" || e.metaKey || e.shiftKey || e.ctrlKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement;
      const filter = el.matches(".tools input");
      if (!filter && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      const shown = shownRef.current;
      const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (e.altKey) {
        const i = shown.findIndex((p) => p.path === selectedRef.current);
        if (!step || i === -1 || !shown[i + step]) return;
        e.preventDefault();
        if (moveStar(shown[i].path, shown[i + step].path)) saveOrder();
        return;
      }
      if (step) {
        e.preventDefault();
        const i = shown.findIndex((p) => p.path === selectedRef.current);
        const j = i === -1 ? 0 : Math.min(Math.max(i + step, 0), shown.length - 1);
        if (!shown[j]) return;
        setSelected(shown[j].path);
        document.querySelectorAll<HTMLElement>(".projects .pick")[j]?.focus();
        return;
      }
      const open = e.key === "Enter" || (e.key === " " && !filter);
      if (open && (filter || el === document.body) && selectedRef.current) {
        e.preventDefault();
        setTab("agents");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // On the Agents, Completed, Closed and Calls tabs, the up and down arrows focus the previous
  // or next row. Enter or Space on the focused row opens it. An open conversation keeps the arrows.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (!step || viewRef.current.tab === "projects" || openedRef.current) return;
      if (e.metaKey || e.shiftKey || e.altKey || e.ctrlKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      // The old panel stays inert during the tab animation, and a row that closes stays until its slide ends: both are skipped.
      const rows = [...document.querySelectorAll<HTMLElement>(".panel:not([hidden], [inert]) .list:not([inert]) > .row:not([data-leaving])")];
      if (!rows.length) return;
      e.preventDefault();
      // With Keyboard navigation on in macOS, the focus can be on the close button in a row. The arrow then starts at that row.
      const i = rows.indexOf(el.closest<HTMLElement>(".list > .row")!);
      rows[i === -1 ? 0 : Math.min(Math.max(i + step, 0), rows.length - 1)].focus();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // ⌘V anywhere or a drop anywhere attaches an image. WebKit pastes only into
  // an editable element, so ⌘V outside a text field goes to a hidden text area.
  // A file copied in Finder attaches at its place (attachPaths). WebKit hides the path, so the bridge reads the pasteboard.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === "v" && !document.activeElement?.matches("input, textarea, [contenteditable]"))
        pad.current?.focus();
    };
    const paste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      const files = [...(data?.items ?? [])].filter((i) => /^(image|video)\//.test(i.type)).map((i) => i.getAsFile()).filter((f): f is File => !!f);
      const inPad = e.target === pad.current;
      if (inPad) pad.current?.blur();
      // Another computer gets only pictures: a text attachment or a file path of this Mac means nothing there.
      if (imageFetch.current) return void (files.length && (e.preventDefault(), attach(files)));
      const field = inPad ? null : textControl(e.target);
      const text = data?.getData("text/plain") ?? "";
      const copied = !!data && (data.types.includes("Files") || data.files.length > 0 || [...data.items].some((i) => i.kind === "file"));
      const plan = pastePlan({ inPad, inField: !!field, images: files.length > 0, copied, text: !!text.trim(), phone });
      if (plan === "skip") return;
      e.preventDefault();
      const finish = (paths: string[]) => {
        if (paths.length) return void attachPaths(paths, field).catch((err) => setError(`Yonder cannot paste: ${(err as Error).message}`));
        if (!files.length && text.trim()) {
          if (field) insertPaste(field, text);
          else attachText(text).catch((err) => setError(`Yonder cannot paste: ${(err as Error).message}`));
        }
        attach(files);
      };
      if (plan === "plain") return finish([]);
      void yonder.media.clipboardFiles().then(finish, () => finish([]));
    };
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => !e.relatedTarget && setDragging(false);
    // A drop takes any file. On the Mac, a file from Finder stays at its place (attachPaths), as a copied file does: the
    // bridge reads the drag pasteboard. Its names must match the dropped files, or each file uploads (attachAny).
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      if (imageFetch.current) return void attach(files);
      const fail = (err: unknown) => setError(`Yonder cannot attach the file: ${(err as Error).message}`);
      // A picture keeps its size, as before: attachAny would shrink it as a photo of the phone.
      const upload = () => Promise.all([attach(files), held(attachAny(files.filter((f) => !/^(image|video)\//.test(f.type))))]).catch(fail);
      if (phone) return void upload();
      void yonder.media.clipboardFiles(true).then((paths) => {
        const names = files.map((f) => f.name).sort().join("\n");
        if (paths.length && paths.map((p) => p.split("/").pop()).sort().join("\n") === names) attachPaths(paths).catch(fail);
        else upload();
      }, upload);
    };
    window.addEventListener("keydown", key);
    document.addEventListener("paste", paste);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("paste", paste);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  // The bridge saves each image and returns its path, which the agent reads. The image shows at once with a path of its
  // own until the upload ends, and a send waits for the upload (uploads). Else an Enter right after a paste sends the
  // message without the image. `prep` shrinks a photo of the phone.
  // In the chat of an agent of another computer, each image goes to the bridge of that computer (imageFetch), shrunk as a
  // photo of the phone, because the relay takes 1 MiB at most for each request.
  // shortcut: another computer gets no video; send it in parts there too (/video in PEER_PATHS) if that matters.
  async function attach(files: File[], prep = async (f: File) => f) {
    const far = imageFetch.current;
    for (const file of files.filter((f) => (far ? /^image\// : /^(image|video)\//).test(f.type))) {
      if (file.type.startsWith("video/")) {
        const upload = attachVideo(file).catch((e) => setError(`Yonder cannot attach the video: ${(e as Error).message}`));
        uploads.current.add(upload);
        void upload.finally(() => uploads.current.delete(upload));
        continue;
      }
      const url = URL.createObjectURL(file);
      const id = `upload:${url}`;
      const put = (change: (list: typeof images) => typeof images) => ((imagesRef.current = change(imagesRef.current)), setImages(change));
      put((list) => [...list, { url, path: id }]);
      const upload = (async () => {
        const ready = far ? await shrink(file).catch(() => file) : await prep(file);
        const res = await (far ? far("/image", { method: "POST", headers: { "content-type": ready.type }, body: ready }) : yonder.media.image(ready));
        if (!res.ok) throw new Error(await res.text());
        const { path } = await res.json();
        put((list) => list.map((i) => (i.path === id ? { ...i, path } : i)));
      })().catch((e) => {
        put((list) => list.filter((i) => i.path !== id));
        setError(`Yonder cannot attach the image: ${(e as Error).message}`);
      });
      uploads.current.add(upload);
      void upload.finally(() => uploads.current.delete(upload));
    }
  }
  // A video goes in parts, because the relay takes 1 MiB at most for each request of the phone. The bridge then
  // makes frames and the words of its sound, as for a screen recording. `uploading` shows the progress of each one.
  const uploads = useRef(new Set<Promise<unknown>>());
  const [uploading, setUploading] = useState<Record<string, number>>({});
  // shortcut: the phone waits for the last part, and link.ts gives each request 2 minutes, so the words of a video longer
  // than about 10 minutes can come too late. Return at once and let the bridge read the video in the background if that happens.
  async function attachVideo(file: File) {
    const id = crypto.randomUUID().replaceAll("-", "");
    const size = phone ? 768 * 1024 : 64 * 1024 * 1024;
    const progress = (part: number | undefined) =>
      setUploading(({ [id]: _, ...rest }) => (part === undefined ? rest : { ...rest, [id]: part }));
    try {
      for (let at = 0; ; at += size) {
        progress(Math.min(at / file.size, 1));
        const end = at + size >= file.size;
        const res = await yonder.media.video(id, file.slice(at, at + size), file.type, end);
        if (!res.ok) throw new Error(await res.text());
        if (!end) continue;
        const { path, seconds, thumb } = await res.json();
        const clip = { url: thumb, path, seconds, video: true };
        imagesRef.current = [...imagesRef.current, clip];
        setImages((list) => [...list, clip]);
        return;
      }
    } finally {
      progress(undefined);
    }
  }
  // The phone shrinks each photo before it attaches it.
  const attachPhotos = (files: File[]) => attach(files, (f) => shrink(f).catch(() => f));
  // The iPhone opens the photo library at once (PHPicker of the dialog plugin). A file input first shows a sheet with
  // Photo Library, Take Photo and Choose Files. Android, and an iPhone app built before the plugin, use the file input.
  async function chooseFromLibrary() {
    if (android) return library.current?.click();
    let paths: string[] | null;
    try {
      paths = await open({ multiple: true, pickerMode: "media" });
    } catch {
      return library.current?.click();
    }
    await held(Promise.all((paths ?? []).map(readPicked)).then(attachPhotos));
  }
  // The bytes of a file that the photo library, the file picker or the recent photos of the attach sheet picked.
  // The dialog plugin gives a file URL, in which a space is %20.
  // `read_picked` makes each video an MP4 of 720p at most, which can take a minute.
  async function readPicked(picked: string) {
    const path = picked.startsWith("file://") ? decodeURIComponent(picked.slice(7)) : picked;
    const name = path.split("/").pop()!;
    const ext = name.split(".").pop()!.toLowerCase();
    const video = ["mov", "mp4", "m4v"].includes(ext);
    const image = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"].includes(ext) && `image/${ext === "jpg" ? "jpeg" : ext}`;
    return new File([await yonder.native.readPicked({ path })], name, { type: video ? "video/mp4" : image || "application/octet-stream" });
  }
  // A send waits for a pick as for an upload, until attach has added the upload of each video. The strip shows 0% for
  // the pick, so a photo or a video that the phone still reads or shrinks shows only a percent.
  async function held(pick: Promise<unknown>) {
    const id = crypto.randomUUID();
    uploads.current.add(pick);
    setUploading((u) => ({ ...u, [id]: 0 }));
    try {
      await pick;
    } finally {
      uploads.current.delete(pick);
      setUploading(({ [id]: _, ...rest }) => rest);
    }
  }
  // A photo or a video of the recent photos of the attach sheet.
  const attachRecent = (p: Recent) => held(yonder.native.photo({ id: p.id }).then(readPicked).then((f) => attachPhotos([f])));
  // Any file, such as a PDF: the iPhone opens the Files app at once, and Android uses a file input. A photo or a video
  // goes as one from the library, and each other file goes to the bridge with its name.
  async function chooseFiles() {
    if (android) return filePicker.current?.click();
    const paths = await open({ multiple: true, pickerMode: "document" });
    await held(Promise.all((paths ?? []).map(readPicked)).then(attachAny));
  }
  async function attachAny(files: File[]) {
    const media = files.filter((f) => /^(image|video)\//.test(f.type));
    if (media.length) await attachPhotos(media);
    for (const file of files.filter((f) => !media.includes(f))) {
      // It goes in parts (yonder.media.file).
      const res = await yonder.media.file(file);
      if (!res.ok) throw new Error(await res.text());
      const { path } = await res.json();
      setImages((list) => [...list, { url: "", path, text: file.name, file: true }]);
    }
  }
  // The pin of the phone, as text with its map link.
  async function attachLocation() {
    const { latitude, longitude, accuracy_meters, map } = JSON.parse(await locate());
    await attachText(`My location: ${latitude}, ${longitude} (within ${accuracy_meters} m)\n${map}`);
  }
  // The version of the app on this phone, and the version of the environment that the computer runs. The screen and
  // the bridge can differ while a build runs.
  async function attachVersion() {
    const app = await installed();
    const raw = await yonder.version().catch(() => "");
    const bridge = typeof raw === "string" ? raw : typeof raw === "number" && raw ? String(raw) : "";
    const mark = channel ? ` (${channel[0].toUpperCase()}${channel.slice(1)})` : "";
    const host = platform === "darwin" ? " on Mac" : platform === "linux" ? " on Linux" : platform === "win32" ? " on Windows" : "";
    const same = !bridge || bridge === __BUILD_ID__;
    const name = phone ? (android ? "Android" : "iPhone") : "Mac";
    const lines = [
      app ? `${name} app ${app}` : "",
      same ? `Environment ${__BUILD_ID__}${mark}${host}` : `Screen ${__BUILD_ID__}`,
      same ? "" : `Bridge ${bridge}${mark}${host}`,
    ].filter(Boolean);
    await attachText(lines.join("\n"));
  }
  const pickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    attachAny(files).catch((err) => setError(`Yonder cannot attach the file: ${(err as Error).message}`));
  };
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    void attachPhotos(files);
  };
  // Files copied in Finder stay at their place, and the agent gets each path. A picture and a video show as one, and
  // each other file shows its name. A send waits for the frames of a video (held). The files show in the order of the paste.
  // A folder goes as the text of its path: at the cursor of the field of the paste, or else at the end of the prompt box
  // on the screen. With no prompt box, it attaches as a file.
  const attachPaths = (paths: string[], field?: HTMLInputElement | HTMLTextAreaElement | null) => {
    const box = field ?? [...document.querySelectorAll<HTMLTextAreaElement>(".prompt textarea")].find((el) => el.checkVisibility());
    return held(Promise.all(paths.map(async (p) => {
      const res = await yonder.media.local(p);
      if (!res.ok) throw new Error(await res.text());
      const { path, thumb, seconds, name, folder } = await res.json();
      if (folder && box) return path as string;
      return thumb ? { url: thumb, path, ...(seconds !== undefined && { seconds, video: true }) } : { url: "", path, text: name, file: true };
    })).then((all) => {
      const folders = all.filter((i) => typeof i === "string");
      const items = all.filter((i) => typeof i !== "string");
      if (box && folders.length) {
        box.focus();
        if (!field) box.setSelectionRange(box.value.length, box.value.length);
        insertPaste(box, (!field && /\S$/.test(box.value) ? " " : "") + folders.join(" "));
      }
      imagesRef.current = [...imagesRef.current, ...items];
      setImages((list) => [...list, ...items]);
    }));
  };
  // Pasted text goes to the agent as an image does. The bridge saves it in a file, and the agent reads the file.
  async function attachText(text: string) {
    const res = await yonder.media.paste(text);
    if (!res.ok) throw new Error(await res.text());
    const { path } = await res.json();
    setImages((list) => [...list, { url: "", path, text }]);
  }
  // iOS shows its Paste callout first, and reads the clipboard only when the user taps it.
  // The clipboard gives an image or text. An image wins, because a copied image can also carry its link as text.
  // On the Mac, a copied file attaches at its place. The page cannot read its path.
  async function paste() {
    if (!phone) {
      const paths = await yonder.media.clipboardFiles().catch(() => [] as string[]);
      if (paths.length) return attachPaths(paths);
    }
    const files: File[] = [];
    let text = "";
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) files.push(new File([await item.getType(type)], "pasted", { type }));
      else if (item.types.includes("text/plain")) text += await (await item.getType("text/plain")).text();
    }
    if (files.length) return attachPhotos(files);
    if (!text.trim()) throw new Error("the clipboard has no image and no text");
    await attachText(text);
  }
  // A sent message still shows the pictures until the chat has it. A message that waits for the next step of the agent
  // can wait long, so its pictures must not go blank after one minute.
  // shortcut: the URLs go after 30 minutes, also from a message that still waits.
  // The returned function puts the images back, when the bridge does not take the message. A sent image flies to its
  // message (`fly`), and an image that the user removes only shrinks.
  const flying = useRef(true);
  const detach = (paths: string[], fly = true) => {
    flying.current = fly;
    const gone = imagesRef.current.filter((i) => paths.includes(i.path));
    const revoke = setTimeout(() => gone.forEach((i) => URL.revokeObjectURL(i.url)), 30 * 60_000);
    setImages((list) => list.filter((i) => !paths.includes(i.path)));
    return () => {
      clearTimeout(revoke);
      setImages((list) => [...gone, ...list]);
    };
  };

  outbox.fail = setError;
  // The attachments of the next request or message. The videos upload first, so they go too.
  const attachments = async () => {
    // A video that the phone still shrinks adds its upload only when it is done, so wait again until none is left.
    while (uploads.current.size) await Promise.allSettled([...uploads.current]);
    return imagesRef.current.map((i) => i.path);
  };

  // The menu bar icon turns red while a call connects or is live. It also stops the "Hey Yonder" helper. The small
  // notch of the call (src-tauri/wake/main.swift) counts from `since`, as the call button does, and its orb moves with
  // the loudness of the call, which goes to it ten times a second.
  useEffect(() => {
    if (inTauri && !phone) yonder.native.setCallLive({ live: phase !== "idle", since: phase === "live" ? callRef.current?.connectedAt : undefined }).catch(() => {});
    shell?.busy?.(phase !== "idle");
    if (!inTauri || phone || phase !== "live") return;
    const timer = setInterval(() => {
      const l = callRef.current?.levels();
      if (l) yonder.native.callLevel({ level: Math.max(size(l.mic), size(l.out)) }).catch(() => {});
    }, 100);
    return () => clearInterval(timer);
  }, [phase]);

  // A call on the phone keeps the Mac awake, so the bridge and the agents stay on when the Mac screen locks. The window
  // on Omarchy pings too, and the bar of Omarchy shows the call. The Mac app has its own caffeinate (set_call_live).
  const callOn = phase !== "idle";
  useEffect(() => {
    if ((inTauri && !phone) || !callOn) return;
    const ping = (end = false) => yonder.awake(end).catch(() => {});
    ping();
    const timer = setInterval(() => ping(), 60_000);
    return () => {
      clearInterval(timer);
      ping(true);
    };
  }, [callOn]);

  // While the user works in the app on the computer, the phones get no push (/here in the bridge). Input pings, 30 seconds apart at most.
  useEffect(() => {
    if (phone) return;
    let last = 0;
    const here = () => {
      if (Date.now() - last < 30_000 || !document.hasFocus()) return;
      last = Date.now();
      yonder.here().catch(() => {});
    };
    const kinds = ["pointermove", "pointerdown", "keydown", "wheel"];
    for (const k of kinds) window.addEventListener(k, here, { passive: true });
    return () => kinds.forEach((k) => window.removeEventListener(k, here));
  }, []);

  // The clock of the call and the times of the rows tick each second, also on the phone, where the poll is slower.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // An agent that starts to wait on the user, or gets a result that needs the user, during a call is news.
  // In the next pause of the call, Grok names it one time, with no question. The agent on the screen
  // is left out, because Grok gives its summary at once. A terminal session is in front of the user already.
  const newsSeen = useRef(new Map<string, boolean>());
  const newsQueue = useRef(new Set<string>());
  const offerNews = (list: Worker[]) => {
    const isNews = (w: Worker) => !w.kind && !w.parent && (w.status === "waiting" || (!!w.attention && w.unread && w.status !== "closed"));
    const c = callRef.current;
    for (const w of list) {
      const now = isNews(w);
      if (c && now && newsSeen.current.get(w.id) === false) newsQueue.current.add(w.id);
      newsSeen.current.set(w.id, now);
    }
    if (!c) return (newsQueue.current.clear(), closeOffered.current.clear());
    if (!newsQueue.current.size) return offerClose(list, c);
    if (!c.quiet()) return;
    const open = viewRef.current.open?.id;
    const news = list.filter((w) => newsQueue.current.has(w.id) && isNews(w) && w.id !== open);
    newsQueue.current.clear();
    if (!news.length) return;
    const lines = news.map((w) => `- ${voiceRef(w, openAgents)} "${w.name}" in ${w.project}: ${w.status === "waiting" ? "waits for the user's reply" : "has a result that needs the user"}.`);
    c.tell(
      `[Yonder app] News while nobody spoke:\n${lines.join("\n")}\n` +
        `In one short sentence, only name the agent and say that it needs the user, for example "Agent 12 in Yonder needs your attention." ` +
        `Do NOT ask a question and give no details. When the user asks about it, go through these agents as for "any news?".`,
    );
  };

  // After a long silence with no other news, Grok asks one time if it can close the agents that finished
  // a while ago and that the user read. Grok closes them only after a yes. Each agent comes up one time in a call.
  const closeOffered = useRef(new Set<string>());
  const offerClose = (list: Worker[], c: Call) => {
    if (!c.quiet(CLOSE_QUIET_MS)) return;
    const old = list.filter((w) => !w.kind && !w.parent && (w.status === "done" || w.status === "failed") && !w.unread && !w.attention && Date.now() - w.updatedAt > CLOSE_AFTER_MS && !closeOffered.current.has(w.id));
    if (!old.length) return;
    old.forEach((w) => closeOffered.current.add(w.id));
    const lines = old.map((w) => `- ${voiceRef(w, openAgents)} "${w.name}" in ${w.project}: ${LABEL[w.status]}, ${Math.round((Date.now() - w.updatedAt) / 60000)} minutes ago.`);
    c.tell(
      `[Yonder app] Nobody spoke for a while. These agents on the Done tab finished a while ago, and the user read them:\n${lines.join("\n")}\n` +
        `In one short sentence, ask if the user wants to close them, for example "Agents 3 and 5 finished a while ago. Do you want me to close them?" ` +
        `Close them only after a yes: call close_worker one time for each of these agent numbers. On a no, say "Okay" and close nothing.`,
    );
  };

  // Poll the bridge every second.
  useEffect(() => {
    // `asking`: the start of the poll that has no answer yet. A new poll waits for it, 10 seconds at most. Else on a slow
    // link the answers queue on the one socket to the Mac, and the phone stays on "Reconnecting…". `told`: the time of
    // the last slow poll in call.log, one each minute.
    let asking = 0;
    let told = 0;
    const tell = (what: string) => {
      if (!phone || Date.now() - told < 60_000) return;
      told = Date.now();
      void bridgeFetch("/log", { method: "POST", body: `Phone poll ${what} via ${linkVia() ?? "no link"}` }).catch(() => {});
    };
    const tick = async () => {
      if (callRef.current) localStorage.setItem("grokCall", String(callRef.current.cost()));
      if (phone && !isPaired()) return; // No computer to ask yet.
      const at = Date.now();
      if (asking && at - asking < 10_000) return;
      asking = at;
      try {
        // A poll with no answer in 10 seconds is a miss, so the title bar shows the state while the link recovers.
        const poll = yonder.mice.all().finally(() => asking === at && (asking = 0));
        const raw = await Promise.race([poll, new Promise<never>((_, no) => setTimeout(() => no(Object.assign(new Error("The Mac did not answer."), { missed: true })), 10_000))]);
        pollTime.ms = Date.now() - at;
        if (pollTime.ms > 5000) tell(`slow: ${pollTime.ms} ms for ${raw.length} agents`);
        if (at < settledAt) return;
        const list = withPending(raw);
        // During a call, Grok's prompt shows the agents as they are now, so it
        // answers without a tool call. At most one update every 3 seconds.
        const text = instructions(projectsRef.current, list, viewRef.current);
        if (callRef.current && text !== pushed.current.text && (moved.current || Date.now() - pushed.current.at > 3000)) {
          callRef.current.update(text);
          pushed.current = { text, at: Date.now() };
        }
        moved.current = false;
        offerNews(raw);
        showWorkers(raw);
        setOnline(true);
        seenRef.current = Date.now();
      } catch (e) {
        // A poll that started before the last answer is old news, such as a poll on a stale connection (src/link.ts).
        if (at >= seenRef.current) setOnline(false);
        tell(`failed after ${Date.now() - at} ms: ${(e as Error).message}`);
        // On the Mac, a poll with no answer in 10 seconds can mean stuck requests that fill the connections of WebKit.
        if (!phone && (e as { missed?: boolean }).missed && at >= seenRef.current) resetClient(at);
      }
    };
    tick();
    // The phone polls less often, because each poll goes through the relay.
    const timer = setInterval(tick, phone ? 3000 : 1000);
    // Back in front, on a network again, or at a tap while the bridge is away, the app checks the link and asks at once.
    // A link can die with no close while iOS holds the app. Else the phone shows Offline until it starts again.
    const wake = () => document.visibilityState === "visible" && (checkLink(), void tick());
    const tap = () => !stateRef.current.online && wake();
    document.addEventListener("visibilitychange", wake);
    addEventListener("online", wake);
    addEventListener("pointerdown", tap, true);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      removeEventListener("online", wake);
      removeEventListener("pointerdown", tap, true);
    };
  }, []);

  // A change of tab or project goes to Grok at once, before the user speaks about it.
  useEffect(() => {
    if (!callRef.current) return;
    const text = instructions(projectsRef.current, workers, viewRef.current);
    if (text === pushed.current.text) return;
    callRef.current.update(text);
    pushed.current = { text, at: Date.now() };
  }, [tab, selected, images.length, Object.keys(uploading).length, opened, openSub?.id]);

  // When the agent of the open conversation ends its turn during a call, Grok tells the user
  // what the user asked and what the agent answered. Yonder is the voice, the agent does the work.
  const openStatus = useRef<{ id?: string; status?: Status }>({});
  const openedAgentStatus = workers.find((w) => w.id === opened)?.status;
  useEffect(() => {
    const w = viewRef.current.open;
    const prev = openStatus.current;
    openStatus.current = { id: w?.id, status: w?.status };
    if (!w || !callRef.current || prev.id !== w.id || prev.status !== "running" || w.status === "running" || w.status === "closed") return;
    yonder.chat.get<Turn>(w.id)
      .then((turns) => {
        const last = (who: Turn["who"]) => [...turns].reverse().find((t) => t.who === who)?.text ?? "";
        const asked = last("user").split(/<voice-call>|<images>|<pasted-text>|<screen-recording>|<device>|<from>/)[0].trim().slice(0, 1000);
        const answer = (last("assistant") || w.result).slice(-3000);
        callRef.current?.tell(
          `[Yonder app] ${voiceRef(w, openAgents)}, the agent on the screen, ended its turn and is now ${LABEL[w.status]}.\nThe user asked: ${asked}\nThe agent answered: ${answer}\n` +
            `Tell the user in one or two short sentences what they asked and what the agent answered. Do not read the answer aloud.`,
        );
      })
      .catch(() => {});
  }, [opened, openedAgentStatus]);

  // When the agent of the open conversation closes, also by voice, the screen goes back to the list of its tab.
  const openClosed = useRef<{ id?: string; status?: Status }>({});
  useEffect(() => {
    const prev = openClosed.current;
    openClosed.current = { id: opened, status: openedAgentStatus };
    if (opened && prev.id === opened && prev.status && prev.status !== "closed" && openedAgentStatus === "closed") setOpened("");
  }, [opened, openedAgentStatus]);

  // The transcripts of past calls load when the Calls tab opens, and again when a call ends.
  useEffect(() => {
    if (tab === "calls" && phase !== "connecting")
      yonder.calls().then(setCalls, () => {});
  }, [tab, phase]);

  // The web sites that run on the Mac load when the Tunnel tab opens, and again each 5 seconds while it shows.
  // Each load scans the open ports of the Mac, so the other tabs do not load them.
  // The last list stays in localStorage ("sites"), so the tab shows it at once after a start of the app, and the scan
  // corrects it.
  const [sites, setSites] = useState<Site[] | undefined>(() => {
    try {
      return JSON.parse(localStorage.getItem("sites") ?? "null") ?? undefined;
    } catch {}
  });
  // The search of the Canvas tab. It also adds an address, such as localhost:3000, in place of the + of before.
  const [siteFilter, setSiteFilter] = useState("");
  const loadSites = () =>
    yonder.tool<Site[]>("preview", { action: "list" }, 0).then(
      (all) => {
        setSites(all.filter((x) => !isGone(`site/${x.label}`)));
        try {
          localStorage.setItem("sites", JSON.stringify(all));
        } catch {}
      },
      () => {},
    );
  // The sites of the other computers of the phone, each under its name after the sites of the computer in use, and a
  // filter by computer (`siteMac`, "" for all). A site of another computer acts through the link of that computer
  // (reach in src/elsewhere.ts), so the phone stays on the computer in use, and its address is on the tunnel of that
  // computer. A computer with no answer in 8 seconds does not show.
  const [farSites, setFarSites] = useState<{ mac: string; name: string; on: boolean; sites: Site[] }[]>([]);
  const [siteHere, setSiteHere] = useState<{ mac: string; name: string }>();
  const [siteMac, setSiteMac] = useState("");
  const loadFarSites = async () => {
    if (!phone) return setFarSites([]);
    const [current, all] = await Promise.all([loadPairing().catch(() => undefined), loadPairings().catch(() => [] as Pairing[])]);
    setSiteHere(current && { mac: current.mac, name: macName(current) });
    const within = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 8000))]);
    const far = await Promise.all(
      all
        .filter((p) => p.mac !== current?.mac && !hidden().includes(p.mac))
        .map(async (p) => {
          const { fetch, call: callThere } = reach(p.mac);
          try {
            const status = await within(fetch("/preview").then((r) => r.json()));
            void giveTunnel(fetch, status).catch(() => {});
            void giveSync(fetch, p.mac).catch(() => {});
            const found: Site[] = status.on ? JSON.parse(await within(callThere("preview", { action: "list" }))) : [];
            const sites = found.filter((x) => !isGone(`site/${p.mac}/${x.label}`));
            return [{ mac: p.mac, name: macName(p), on: !!status.on, sites }];
          } catch {
            return [];
          }
        }),
    );
    setFarSites(far.flat());
  };
  useEffect(() => {
    if (tab !== "preview") return;
    const load = () => (loadSites(), void loadFarSites().catch(() => {}));
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [tab]);

  // Read the version of the source and the usage every 30 seconds, for the update button and the settings.
  // The pull to refresh of the settings also checks the connection, and asks the bridge for new numbers (`fresh`).
  const check = (fresh = "") =>
    Promise.all([
      yonder.version().then(setSource, () => {}),
      yonder.usage.grok(fresh).then(setXai, () => {}),
      yonder.usage.claude(fresh).then(setClaude, () => {}),
      fresh && yonder.mice.all().then(showWorkers).then(() => setOnline(true), () => setOnline(false)),
    ]);
  useEffect(() => {
    if (!online) return;
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [online]);

  // A copy from yonder.so has no source, so it asks the update server at the start, each minute, and on Check in the
  // settings.
  const checkRelease = () => inTauri && !phone && yonder.native.checkUpdate().then((v) => setRelease(v ?? ""), () => {});
  useEffect(() => {
    checkRelease();
    const timer = setInterval(checkRelease, 60_000);
    return () => clearInterval(timer);
  }, []);
  const checkNow = () => Promise.all([check(), checkRelease(), lookStore()]);

  // The update button gets the newest version as rebuild_app does by voice: a reload of the front end, or a rebuild
  // of the app when src-tauri changed. A live call ends now, so xAI does not bill the build. The app starts no call.
  async function update() {
    callRef.current?.hangUp();
    setUpdating(true);
    // A copy from yonder.so installs its new version, and restarts into it. A failed download leaves the old app open.
    if (release) return void (accept(), yonder.native.installUpdate().then(() => setTimeout(() => setUpdating(false), 300_000), (e) => (setError(String(e)), setUpdating(false))));
    // A tap on Update tries a build again that the phone marked bad (front.ts). Else the button says "Updating…" for 5
    // minutes and nothing loads.
    localStorage.removeItem("frontBad");
    try {
      const result = await yonder.tool("rebuild_app", { build: running.build });
      // shortcut: a failed build leaves the old app open, so the button comes back after 5 minutes.
      setTimeout(() => setUpdating(false), result?.upToDate ? 0 : 300_000);
    } catch (e) {
      setError((e as Error).message);
      setUpdating(false);
    }
    // The tap is the accept of the user, so the page loads the new front end (front.ts). It comes after rebuild_app:
    // when a build waits, the accept loads it at once, and WebKit then stops each request of the old page. Else WebKit
    // stops rebuild_app, and the screen shows "Load failed" (Sentry YONDER-B).
    accept();
  }

  // A new list only when it changed, so a poll draws nothing new. A poll that started before a change on the screen,
  // such as a star, is old news: it would put the old list back for a moment (the Instant actions rule).
  const projectsEdited = useRef(0);
  const loadProjects = (poll = false) => {
    const at = Date.now();
    return yonder.projects
      .list()
      .then((list) => !(poll && at < projectsEdited.current) && setProjects((old) => (JSON.stringify(old) === JSON.stringify(list) ? old : list)))
      .catch(() => {});
  };
  useEffect(() => {
    if (online) loadProjects();
  }, [online]);
  // An agent or the user can edit the workspaces in config.json, so the list loads again every few seconds while the
  // app is on the screen. The phone asks less often, because each call goes through the relay.
  useEffect(() => {
    if (!online) return;
    const timer = setInterval(() => document.visibilityState === "visible" && void loadProjects(true), phone ? 10_000 : 3000);
    return () => clearInterval(timer);
  }, [online]);

  // An older bridge has no `keys`, so only its xAI key counts. A bridge with no `?check` answers with a token, which
  // also means that it has the xAI key.
  const checkKey = () =>
    yonder.ownKey().then((d) => {
      const k = d.keys ?? ((d.key ?? !!d.value) ? ["grok"] : []);
      setVoiceKeys(k);
      setVoiceKeysState(k);
    }, () => {});
  useEffect(() => {
    if (online) checkKey();
  }, [online]);

  async function toggleCall() {
    if (callRef.current) return callRef.current.hangUp();
    // Calls are only on the phone. On a computer, the call key, the menu bar icon, `yonder call` and yonder.call.start
    // start nothing.
    if (phase !== "idle" || !phone) return;
    if (unpaired) return setLinking(true);
    // A call needs the key of its provider in the .env of the computer, with no account. The key can be new since the
    // last check, and a tap can come before the first check answers, so then the app asks the bridge again first.
    if ((!voiceKeys || !hasVoiceKey(voiceProvider())) && (await checkKey(), !hasVoiceKey(voiceProvider()))) return setError(NO_KEY);
    const provider = voiceProvider();
    setPhase("connecting");
    setError("");
    // The "Hey Yonder" helper closes the microphone before the call opens it, so that the two never share it.
    if (inTauri && !phone) await yonder.native.setCallLive({ live: true }).catch(() => {});
    // The microphone opens now, while the token and the lists load (see openMic).
    const opened = openMic();
    opened.catch(() => {}); // startCall reports the error.
    // The microphone that a dictation kept open closes: the call has its own, with echo cancellation (src/dictate.ts).
    dropMic();
    try {
      // startCall gets the URL of an ElevenLabs call itself, because the bridge needs the tools and the audio rate for it.
      // A Claude call needs no token: it has no socket (src/brain.ts).
      const secret = provider === "elevenlabs" || provider === "claude" ? { value: "" } : await bridgeToken(provider);
      const [tools, projectList, workerList] = await Promise.all([
        listTools(),
        yonder.projects.list(),
        yonder.mice.all(),
        phone && describeEnvironment(),
        loadTalk(),
      ]);
      const text = instructions(projectList, workerList, viewRef.current);
      pushed.current = { text, at: Date.now() };
      const c = await startCall(text, tools, () => screen(viewRef.current), show, showAgent, () => {
        const project = focusOf(viewRef.current);
        return project && { name: project.name, path: project.path, ids: viewRef.current.agents.map((w) => w.id) };
        // An image of another computer (imageFetch) is not on this computer, so the call does not give it to an agent here.
      }, { paths: async () => (imageFetch.current ? [] : attachments()), sent: detach }, {
        status: () => {
          const { workers, spent, theme, source, xai, claude, online } = stateRef.current;
          const count = (status: Status) => workers.filter((w) => w.status === status).length;
          return {
            mac: online
              ? "connected"
              : `offline since ${new Date(seenRef.current).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} (asleep, lid closed, or no network)`,
            all_calls_cost_usd: Number((spent + c.cost()).toFixed(2)),
            ...(xai.error
              ? { xai_console: `Not read: ${xai.error}` }
              : {
                  xai_spent_this_month_usd: Number(xai.month_usd?.toFixed(2)),
                  xai_spent_by_item: xai.lines?.map((l) => `${l.item}: $${l.usd.toFixed(2)}`),
                  xai_credit_left_usd: Number(xai.credit_usd?.toFixed(2)),
                }),
            usage_of: claude.plan?.name ?? "Claude Code",
            usage: (claude.plan ? claude.plan.limits : claude.limits)
              ? (claude.plan ? claude.plan.limits : claude.limits)!.map((l) => `${l.name}: ${l.percent}% used${l.resets_at ? `, resets ${resets(l.resets_at)}` : ""}`)
              : `Not read: ${(claude.plan ? claude.plan.error : claude.error) ?? "loading"}`,
            agents_running: count("running"),
            agents_waiting: count("waiting"),
            version: __BUILD_ID__,
            source_version: source || "unknown",
            theme,
          };
        },
        // An agent by its number or ID, for the check of a message to a running agent (voice.ts).
        // The name of a new agent for the voice: "Nova" or "Sundial", before the list has the agent.
        label: (num, project) => callName({ num, project }, openAgents),
        agent: (ref) => {
          const key = stripNoun(ref);
          const w = stateRef.current.workers.find((w) => w.id === key || (w.num && !w.letter && String(w.num) === key));
          return w && { num: w.num, running: w.status === "running", open: viewRef.current.open?.id === w.id, task: w.task };
        },
        setTheme: (next) => {
          if (!["light", "dark", "system"].includes(next)) return `Error: the theme must be "light", "dark" or "system".`;
          setTheme(next);
          return `The app now uses the ${next === "system" ? "theme of the system" : `${next} theme`}.`;
        },
        showTab: (next) => {
          if (![...TABS, "projects", "calls"].includes(next)) return `Error: the tab must be one of ${[...TABS, "projects", "calls"].join(", ")}.`;
          setTab(next);
          // On the same tab, an open conversation or call stays open, so close it.
          setOpened("");
          return `The screen now shows the ${next} tab.`;
        },
        pairPhone: () => {
          setPairing(true);
          return "The screen shows the QR code. The user scans it with the Yonder app on the phone.";
        },
        pasted: () => imagesRef.current.flatMap((i) => (i.text === undefined ? [] : [i.text])),
        // switch_environment: the other Mac by its name (pickMac in src/link.ts), for "switch environment", "switch PC"
        // or "switch Mac".
        switchEnvironment: async (name) => {
          const p = pickMac(name, ...(await Promise.all([loadPairing(), loadPairings()])));
          if (typeof p === "string") return p;
          await switchPairing(p);
          return `Switched to ${macName(p)}. The workspaces and the agents are those of ${macName(p)} now. Say only "Switched to ${macName(p)}."`;
        },
        otherAgents: async () => {
          const all = await elsewhere();
          if (!all.length) return "The phone shows no other environment.";
          return JSON.stringify(all.map((o) => o.workers
            ? { environment: o.name, agents: o.workers.map((w) => ({ num: w.num, name: w.name, project: w.project, status: w.status, ...(w.attention && { needsUser: true }) })) }
            : { environment: o.name, offline: true }));
        },
      }, (reason) => {
        const cost = c.cost();
        setSpent((s) => {
          localStorage.setItem("grokSpent", String(s + cost));
          localStorage.removeItem("grokCall");
          return s + cost;
        });
        callRef.current = null;
        setMuted(false);
        setPhase("idle");
        chime(false);
        // A call that lost the network after 20 s starts again once a minute at most, so a walk does not end in
        // silence: about 3% of calls end with code 1006. A second drop within the minute shows the error.
        // shortcut: matches the words of the error in startCall; give onEnd a code if those words change.
        if (reason?.includes("dropped. Check the network") && Date.now() - c.connectedAt > 20_000 && Date.now() - redialed > 60_000) {
          redialed = Date.now();
          Sentry.captureMessage(`Redial: ${reason}`, "warning");
          setTimeout(() => void toggleRef.current(), 2000);
        } else if (reason) setError(reason);
      }, secret, opened);
      callRef.current = c;
      setPhase("live");
      if (c.warning) setError(c.warning);
    } catch (e) {
      // The microphone closes again when the call did not start.
      if (!callRef.current) opened.then((s) => s.getTracks().forEach((t) => t.stop()), () => {});
      setPhase("idle");
      setError((e as Error).message);
    }
  }

  // Grok's show_project tool. An exact name wins, then one name that holds the words.
  // A project that the list does not have yet, such as one from create_project, loads the list again.
  async function show(name: string) {
    const word = name.trim().toLowerCase();
    const find = (list: Project[]) => {
      const exact = list.filter((p) => p.name.toLowerCase() === word);
      return exact.length ? exact : list.filter((p) => p.name.toLowerCase().includes(word));
    };
    let near = find(listRef.current);
    if (word && !near.length) {
      const fresh = await yonder.projects.list().catch(() => []);
      setProjects(fresh);
      near = find(fresh);
    }
    if (!word || !near.length) return `No workspace matches "${name}".`;
    if (near.length > 1) return `Several workspaces match "${name}": ${near.map((p) => p.name).join(", ")}. Ask the user which one.`;
    setSelected(near[0].path);
    setTab("agents");
    return `The screen now shows the agents of the workspace ${near[0].name}.`;
  }

  // The + button: the Agents tab of the selected project, with a new agent open. With All projects, the bridge picks the
  // project from the task and the latest projects (projectOf in bridge/main.ts). With one project, the agent starts there,
  // and the view stays on that project.
  // A live call ends, so that the New agent view gets the microphone and listens.
  // The New agent view plays the start chime when its microphone is on (see dictate in src/dictate.ts). With no call,
  // the phone opens the microphone at the tap (warmMic). A call that ends now still has the microphone and the session.
  // The chat button opens the same view with a text box (`typed`). It needs no microphone, so a live call stays on.
  const [typed, setTyped] = useState(false);
  function newAgent(chat = false) {
    setTyped(chat);
    if (!chat) callRef.current ? callRef.current.hangUp() : warmMic();
    if (opened !== "new") back.current = { tab, selected: selectedRef.current, opened };
    if (tab === "agents") return setOpened("new");
    openNext.current = "new";
    setTab("agents");
  }
  // The key of the voice note (right ⌥, talk-key of the Mac app) with no agent open starts a new agent in the talk view,
  // as the + button does. A hold sends at the release (keyPress).
  const newAgentRef = useRef(newAgent);
  newAgentRef.current = newAgent;

  // The New agent view goes back to the screen of the + button when it closes, also after the send. The new agent does
  // not open.
  const back = useRef({ tab: "agents", selected: ALL.path, opened: "" });
  // ⌘↩ (closeKey of Settings › Keys) leaves the New agent view, as its back button does. An open agent handles the key itself (see Conversation).
  const closeNewRef = useRef(closeNew);
  closeNewRef.current = closeNew;
  useEffect(() => {
    if (opened !== "new") return;
    const key = (e: KeyboardEvent) => {
      // The text box sends on ⌘↩ and cancels the event, so ⌘↩ there sends and does not drop the words.
      if (e.repeat || e.defaultPrevented || !hit(e, "closeKey")) return;
      e.preventDefault();
      closeNewRef.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [opened]);
  // The conversation that the New agent view goes back to shows at once, with no slide from the right. The user left
  // it a moment before. The mark stays until the list shows again.
  const returned = useRef("");
  if (!opened) returned.current = "";
  function closeNew() {
    const { tab: t, selected: s, opened: o } = back.current;
    returned.current = o;
    if (t === viewRef.current.tab && s === selectedRef.current) return setOpened(o);
    openNext.current = o;
    setSelected(s);
    setTab(t);
  }

  // An open agent on the Done or Closed tab that runs again, as after a message, moves to the Agents tab. The back
  // keeps the old tab: the row of the agent shows there for a moment, then slides out to the left (`leaving`). The user
  // sees it on the Agents tab only after a tap on that tab. The conversation stays on its tab while it is open, because
  // a new panel loads it again.
  const woke = useRef("");
  const [leaving, setLeaving] = useState<{ id: string; tab: string }>();
  useEffect(() => {
    if (opened) return void (woke.current = openedAgentStatus === "running" ? opened : "");
    if (woke.current && tab !== "agents") {
      setLeaving({ id: woke.current, tab });
      setTimeout(() => setLeaving(undefined), LEAVE_MS);
    }
    woke.current = "";
  }, [opened, openedAgentStatus]);

  // Grok's show_agent tool: the tab and the project of the agent, with its conversation open.
  // Right after a close (`stay`), the screen keeps its tab: the user goes through that tab, and the next agent is there.
  // Else a close of agents on the Done tab, then show_agent of a running agent, makes the screen leave the tab.
  function showAgent(num: string, stay = false) {
    const w = stateRef.current.workers.find((w) => String(w.num) === stripNoun(num));
    if (!w) return `No agent has the number ${num}.`;
    const tab = tabOf(w);
    const on = viewRef.current.tab;
    if (stay && tab !== on && on !== "projects")
      return `The screen stays on the ${on} tab, because the user goes through it. Agent ${w.num} is on the ${tab} tab: do NOT tell about it. Tell about the next agent of the ${on} tab, or say that there are no more.`;
    openWorker(w);
    return `The screen now shows the conversation of agent ${w.num}, "${w.name}", on the ${TAB_NAME[tab]} tab.`;
  }
  // The conversation of an agent, on its tab and in its project: show_agent, and a past run of a schedule in the Settings.
  function openWorker(w: Worker) {
    const project = selectedRef.current === ALL.path ? ALL.path : projectOfRef.current.get(w.id) ?? w.path;
    const tab = tabOf(w);
    if (tab === viewRef.current.tab && project === selectedRef.current) setOpened(w.id);
    else {
      openNext.current = w.id;
      setSelected(project);
      setTab(tab);
    }
  }

  // The key of the call (Settings, Keys) and the menu bar icon start and stop the call from any app. The Tauri side
  // sends the event.
  const toggleRef = useRef(toggleCall);
  toggleRef.current = toggleCall;
  useEffect(() => {
    // The window on Omarchy is a page with no Tauri. The call key (`yonder call` in omarchy/yonder) reaches it
    // through the event stream of the bridge.
    if (!inTauri) {
      if (phone) return;
      const events = new EventSource(`${BRIDGE}/events`);
      events.addEventListener("toggle-call", () => toggleRef.current());
      return () => events.close();
    }
    const stop = listen("toggle-call", () => toggleRef.current());
    // On the Mac, "Hey Yonder" opens the notch of src-tauri/wake/main.swift, which starts a new agent itself.
    const installed = listen<string>("updating", (e) => (setInstalling(e.payload), setTimeout(() => setInstalling(""), 5000)));
    // On Android, "Hey Yonder" comes from Wake.kt as a window event, and starts a call. toggleCall does nothing while
    // a call connects.
    const androidWake = () => void (callRef.current || toggleRef.current());
    addEventListener("yonder-wake", androidWake);
    return () => {
      removeEventListener("yonder-wake", androidWake);
      [stop, installed].forEach((s) => s.then((unlisten) => unlisten()));
    };
  }, []);

  // The star and the removal of a project show at once. Then the list loads again, also after an error.
  async function star(p: Project, starred: boolean) {
    projectsEdited.current = Date.now();
    setProjects((list) => list.map((q) => (q.path === p.path ? { ...q, starred } : q)));
    await yonder.projects.star(p.path, starred).finally(loadProjects);
  }

  // Only starred projects move, and Yonder stays first. It returns true when the order changed.
  const movable = (p?: Project) => !!p && p.starred && !p.pinned;
  function moveStar(path: string, to: string) {
    const list = [...projectsRef.current];
    const from = list.findIndex((p) => p.path === path);
    const at = list.findIndex((p) => p.path === to);
    if (from === at || !movable(list[from]) || !movable(list[at])) return false;
    list.splice(at, 0, ...list.splice(from, 1));
    projectsRef.current = list;
    projectsEdited.current = Date.now();
    setProjects(list);
    return true;
  }
  const saveOrder = () =>
    yonder.projects.order(projectsRef.current.filter((p) => p.starred).map((p) => p.path)).catch((e) =>
      setError(`Yonder cannot save the order: ${(e as Error).message}`));

  // The default profile of a project shows at once. Then the list loads again, also after an error.
  const [profiling, setProfiling] = useState<Project>();
  function setProjectProfile(p: Project, name: string) {
    projectsEdited.current = Date.now();
    setProjects((list) => list.map((q) => (q.path === p.path ? { ...q, profile: name || undefined } : q)));
    yonder.projects.profile(p.path, name || "default")
      .catch((e) => setError(`Yonder cannot set the profile of ${p.name}: ${(e as Error).message}`))
      .finally(loadProjects);
  }

  // Takes the folder off the list. The folder stays on the disk.
  async function removeFolder(p: Project) {
    projectsEdited.current = Date.now();
    setProjects((list) => list.filter((q) => q.path !== p.path));
    if (selected === p.path) setSelected(ALL.path);
    await yonder.projects.remove(p.path).finally(loadProjects);
  }

  // Adds a folder to the projects, and shows its agents, so that the user can start one there.
  // The phone cannot show the folder dialog of the Mac, so it opens its own picker (src/FolderPicker.tsx). So does the
  // window on Omarchy, a page with no Tauri.
  async function addFolder() {
    if (phone || !inTauri) return setPicking(true);
    const path = await open({ directory: true });
    if (typeof path === "string") addProject("add_project", { path }, path);
  }
  // The new project shows at once, and the bridge adds or makes it after. A failure shows in the error bar, and the next
  // load of the projects takes the row away.
  function addProject(tool: string, args: Record<string, unknown>, path: string) {
    projectsEdited.current = Date.now();
    setProjects((list) => (list.some((p) => p.path === path) ? list : [...list, { name: path.split("/").pop() ?? path, path, starred: false }]));
    setSelected(path);
    setTab("agents");
    yonder.tool(tool, args)
      .catch((e) => setError(`Yonder cannot add ${path}: ${(e as Error).message}`))
      .finally(loadProjects);
  }

  // File > New Project: the user names the folder in a save dialog, and the bridge makes it with a new repository.
  async function newProject() {
    const picked = await save({ title: "New Workspace", defaultPath: `${await homeDir()}/Sites/new-workspace` });
    if (!picked) return;
    const at = picked.lastIndexOf("/");
    addProject("create_project", { name: picked.slice(at + 1), folder: picked.slice(0, at) }, picked);
  }

  // The items of the File and Agents menus of the Mac app. Close Completed closes the Done tab of the project on the screen.
  const [pairing, setPairing] = useState(false);
  // A new install of the Mac app opens on the Welcome screen: pair a phone, or skip it. A Mac that has a paired phone
  // never shows it.
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    if (phone || !online || localStorage.getItem("welcomed")) return;
    yonder.relay()
      .then((r: { phones?: unknown[] }) => (r.phones?.length ? localStorage.setItem("welcomed", "1") : setWelcome(true)), () => {});
  }, [online]);
  const endWelcome = (pair: boolean) => {
    localStorage.setItem("welcomed", "1");
    setWelcome(false);
    setPairing(pair);
    startSetup();
  };
  // The open settings: true for the list of the sections, or the ID of the section that opens first.
  const [settings, setSettings] = useState<boolean | string>(false);
  // The new agent of the key of the voice note waits here for `settings`: the settings record keys, also right ⌥.
  useEffect(() => {
    if (!inTauri || opened || !online || settings) return;
    const stop = listen("talk-key", () => ((keyPress.started = true), newAgentRef.current()));
    return () => void stop.then((unlisten) => unlisten());
  }, [opened, online, settings]);
  // The Preview row of the Settings lives in the bridge, because the bridge and Grok need it too. It loads again when
  // the settings close, so that the phone sees a change of the Mac.
  const [previewOn, setPreviewOn] = useState(true);
  // `suffix` ends the address of each preview, such as -nova.yonder.so, so a tap on such a link in a chat finds its site.
  const [tunnelSuffix, setTunnelSuffix] = useState("");
  // A computer in use with no tunnel gets one from yonder.so (giveTunnel in src/account.ts), and the suffix loads again.
  const loadPreview = (init?: RequestInit): Promise<void> =>
    yonder.settings
      .tunnel(init)
      .then(
        (p) => {
          setPreviewOn(p.on);
          setTunnelSuffix(p.suffix ?? "");
          void giveTunnel(bridgeFetch, p).then((given) => void (given && loadPreview()), () => {});
          void giveSync(bridgeFetch).catch(() => {});
        },
        () => void (init && loadPreview()),
      );
  useEffect(() => void loadPreview(), [settings]);
  // The Model and Effort ranges of the Settings, inside which Clef picks for each new agent. The model menu of a new agent
  // starts on the Default model, else on the model of a range of one, else on Auto.
  const [agentModel, setAgentModel] = useState("auto");
  const [ranges, setRanges] = useState({ models: ["haiku", "fable"], efforts: ["low", "max"], defaultModel: "auto" });
  // The Permissions row of the Settings: the permission mode of each new agent that names no mode.
  const [agentMode, setAgentMode] = useState("bypassPermissions");
  // The Summaries row of the Settings. Off: the bridge writes no summaries.
  const [sumUp, setSumUp] = useState(true);
  // The Context tab rows of the Settings (Look): how much of the work of Claude Code shows, and the groups of tool
  // calls.
  const [convoLook, setConvoLook] = useState<Look>({ detail: "normal", group: false, mods: !phone });
  // The Steer row of the Settings. On: a message to a running agent never waits in the queue of the bridge.
  const [steer, setSteer] = useState(false);
  // These settings of config.json come from the schema of the Settings (bridge/settings/) in one load, again when the
  // Settings close, so that the phone sees a change of the Mac.
  const loadValues = () =>
    yonder.settings.schema().then((all) => {
      const v = Object.fromEntries(all.map((s) => [s.key, s.value])) as Record<string, any>;
      if (v.mode) setAgentMode(v.mode);
      if (typeof v.sumUp === "boolean") setSumUp(v.sumUp);
      if (typeof v.steer === "boolean") setSteer(v.steer);
      setWalkie(v.walkieTalkie);
      // The name of this computer (Settings › Environments) in the environment dropdown. The phone takes the name of its pairing.
      if (!phone && typeof v.computerName === "string" && v.computerName) setHereName(v.computerName);
      if (!Array.isArray(v.models) || !Array.isArray(v.efforts)) return;
      const defaultModel = v.defaultModel ?? "auto";
      setRanges({ models: v.models, efforts: v.efforts, defaultModel });
      setAgentModel(defaultModel !== "auto" ? defaultModel : v.models[0] === v.models[1] ? v.models[0] : "auto");
    }, () => {});
  useEffect(() => void loadValues(), [settings]);
  // The Context tab rows load again when an agent opens too, so a change of config.json by hand shows with no build.
  // They have their own load, because loadValues also puts the model of a new agent back to its default.
  useEffect(() => {
    const picks = accentPicks();
    void yonder.settings.schema().then((all) => {
      const v = Object.fromEntries(all.map((s) => [s.key, s.value])) as Record<string, any>;
      // The Mods rows: on by default on the computer, and off by default on the phone, where the screen is small.
      setConvoLook({ detail: v.contextDetail ?? "normal", group: !!v.contextGroup, mods: phone ? v.modsPhone === true : v.mods !== false });
      // Walkie-talkie of config.json, also after an agent or the user changed it by hand.
      setWalkie(v.walkieTalkie);
      // The shortcuts of the window and of the menu (Settings, Keys), also after a change by hand.
      applyShortcuts(v);
      // The keys of config.json (Settings, Keys), also after a change by hand. A Mac with keys of an older version,
      // when localStorage held them, gives them to config.json once.
      if (inTauri && !phone) {
        if (v[KEY_SETTINGS.notch] === undefined && v[KEY_SETTINGS.note] === undefined)
          for (const a of ["notch", "note"] as const) void yonder.settings.set(KEY_SETTINGS[a], keys[a]).catch(() => {});
        else {
          const saved = { notch: v[KEY_SETTINGS.notch] ?? DEFAULT_KEYS.notch, note: v[KEY_SETTINGS.note] ?? DEFAULT_KEYS.note };
          setKeys((k) => (k.notch === saved.notch && k.note === saved.note ? k : { ...k, ...saved }));
        }
      }
      // The accent of config.json, unless the user picked a color during the load. A phone with a color of phone.json
      // of an older version gives it to config.json once.
      if (picks !== accentPicks()) return;
      const old = ACCENTS[localStorage.getItem("accent") ?? ""];
      if (v.accent !== undefined) applyAccent(v.accent);
      else if (old) void yonder.settings.set("accent", old).then(() => applyAccent(old), () => {});
    }, () => {});
  }, [settings, opened]);
  // The Claude Code row of the Settings: the tools of Yonder in each Claude Code session of the user.
  const [claudeMcp, setClaudeMcp] = useState(false);
  const loadClaudeMcp = (on?: boolean) => yonder.settings.claudeMcp(on).then((m) => setClaudeMcp(m.on), () => void (on !== undefined && loadClaudeMcp()));
  useEffect(() => void loadClaudeMcp(), [settings]);
  // The CLIs that run agents (the Agents section of the Settings): Claude Code, and the others on this Mac. An older
  // bridge has no /clis, so the app then knows only Claude Code.
  const [clis, setClis] = useState<Clis>({ cli: "claude", clis: [] });
  const loadClis = (change?: Record<string, unknown>, fresh = false) =>
    yonder.settings
      .clis(change, fresh)
      .then((c: Clis) => ((cliInfo = Object.fromEntries(c.clis.map((x) => [x.id, x]))), setClis(c)), () => void (change && loadClis()));
  useEffect(() => void loadClis(), [settings]);
  // An open agent and a new agent show the weekly percent of each profile, so a change of profile sees the current numbers.
  useEffect(() => void (opened && loadClis()), [opened]);
  // The agents of the other computers of the phone (src/elsewhere.ts). They show under the projects of All projects on
  // the Agents and Done tabs, and load every 15 seconds while that list is on the screen.
  // A tap opens the agent over the list, as an agent of the computer in use: `opened` is "@", the computer and the ID.
  // Its chat loads and acts through the link of that computer, so the phone stays on the computer in use. A switch to
  // that computer instead sends the dictation to the bridge of the other computer.
  const [others, setOthers] = useState<Elsewhere[]>([]);
  // The name of a computer, the key on the Mac, can have spaces, as "Mac mini". The ID of an agent has none.
  const [farMac, farId] = opened.startsWith("@") ? [opened.slice(1, opened.lastIndexOf(" ")), opened.slice(opened.lastIndexOf(" ") + 1)] : [];
  useEffect(() => {
    if (selected !== ALL.path || (tab !== "agents" && tab !== "completed" && tab !== "saved")) return;
    let live = true;
    const load = () => document.visibilityState === "visible" && void elsewhere().then((e) => live && setOthers(e), () => {});
    load();
    // An open agent of another computer loads as often as the agents of the computer in use.
    const timer = setInterval(load, farMac ? 3000 : 15_000);
    return () => ((live = false), clearInterval(timer));
  }, [selected, tab, settings, farMac]);
  // The Projects tab shows the projects of each other computer that shows, under its name, and the name of the computer
  // in use over its own projects. A tap on such a project moves the phone to that computer (switchPairing), so the
  // computer in use is the one of the last project that the user opened.
  const [farProjects, setFarProjects] = useState<FarProjects[]>([]);
  // The other computers whose projects show. Each starts closed, and a tap on its name opens it. A search shows all.
  const [farOpen, setFarOpen] = useState<string[]>([]);
  const [hereName, setHereName] = useState("");
  useEffect(() => {
    if (tab !== "projects") return;
    let live = true;
    const load = () =>
      document.visibilityState === "visible" &&
      void Promise.all([elsewhereProjects(), elsewhere(), loadPairing()]).then(([fp, e, p]) => live && (setFarProjects(fp), setOthers(e), phone && setHereName(macName(p))), () => {});
    load();
    const timer = setInterval(load, 15_000);
    return () => ((live = false), clearInterval(timer));
  }, [tab, settings]);
  // The environment dropdown of the title bar: "" shows each computer that shows, "here" only the computer in use, and
  // the key of another computer only that computer. On the phone a pick of another computer switches to it, as a tap on
  // one of its projects does. The Mac cannot switch, so it shows only the agents and the projects of that computer. Each
  // device keeps its own pick, as hiddenComputers.
  const [envs, setEnvs] = useState<{ mac: string; name: string }[]>([]);
  const [env, setEnv] = useState(() => localStorage.getItem("environmentPick") ?? "");
  const loadEnvs = () =>
    void Promise.all([computers(), loadPairing().catch(() => undefined)]).then(([cs, p]) => (setEnvs(cs), phone && setHereName(macName(p))), () => {});
  useEffect(loadEnvs, [settings, online]);
  const pickEnv = (v: string) => {
    setFarPath("");
    const far = v !== "" && v !== "here";
    if (far && phone) void openFar(v, ALL.path);
    else if (far) (setSelected(ALL.path), setTab("agents"));
    const pick = far && phone ? "here" : v;
    setEnv(pick);
    localStorage.setItem("environmentPick", pick);
  };
  const envOptions = [{ value: "", label: "All environments" }, { value: "here", label: hereName || HERE }, ...envs.map((c) => ({ value: c.mac, label: c.name }))];
  const [envPicking, setEnvPicking] = useState(false);
  // The people of this computer (docs/multi-user.md). With one person, the list is empty and the screen shows no switch.
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [scope, setScope] = useState(yonder.people.scope());
  const [scopePicking, setScopePicking] = useState(false);
  useEffect(() => {
    const load = () => yonder.people.list().then((p) => (setPeople(p.people), setScope(yonder.people.scope())), () => {});
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);
  const pickScope = (v: string) => {
    const next = v === "all" ? "all" : "mine";
    yonder.people.setScope(next);
    setScope(next);
    void yonder.mice.all().then((list) => showWorkers(list), () => {});
  };
  // A pick of a computer that went away, or that the Show list hides, shows all again.
  const envShown = env === "" || env === "here" || envs.some((c) => c.mac === env) ? env : "";
  // A project of the computer in use shows its agents whatever the pick, because the pick is only for All projects.
  const hereOn = envShown === "" || envShown === "here";
  const showHere = hereOn || selected !== ALL.path;
  const farOn = (mac: string) => envShown === "" || envShown === mac;
  // On the Mac, a pick of another computer acts as that computer: its usage shows in the title bar, a tap on one of its
  // projects opens that project (`farPath`), and a new agent starts there. The phone switches (switchPairing).
  const farPick = !phone && !showHere ? envShown : "";
  const [farPath, setFarPath] = useState("");
  const farPs = farProjects.find((o) => o.mac === farPick)?.projects ?? [];
  const farProject = farPs.find((p) => p.path === farPath);
  // The agents of another computer that show: all of them, or those of its open project.
  const farWs = (o: Elsewhere) => (!farOn(o.mac) ? [] : farProject && o.mac === farPick ? agentsOf(farProject, farPs, o.workers ?? []) : o.workers ?? []);
  // ⌘E (environmentKey of Settings › Keys) moves the lists to the next environment: All, the computer in use, then each
  // other computer that answered the last load. An open agent and the New agent view keep ⌘E for Effort.
  useEffect(() => {
    if (opened || settings || !envs.length) return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !hit(e, "environmentKey")) return;
      e.preventDefault();
      const ring = ["", "here", ...envs.filter((c) => others.some((o) => o.mac === c.mac && o.workers)).map((c) => c.mac)];
      pickEnv(ring[(ring.indexOf(envShown) + 1) % ring.length]);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const openFar = async (mac: string, path: string) => {
    if (!phone) return (pickEnv(mac), setFarPath(path));
    const p = (await loadPairings()).find((x) => x.mac === mac);
    if (!p) return;
    await switchPairing(p);
    setSelected(path);
    setTab("agents");
  };
  // While that computer gives no answer, the last known agent stays open. An agent that left its list, as a closed one,
  // goes back to the list. An agent of a link stays in the list when it closes (linkedAgents in src/elsewhere.ts).
  const far = useRef<{ o: Elsewhere; w: Worker }>(undefined);
  const farFrom = farMac ? others.find((o) => o.mac === farMac) : undefined;
  const farFresh = farFrom?.workers?.find((w) => w.id === farId);
  if (farFresh) far.current = { o: farFrom!, w: farFresh };
  else if (far.current?.o.mac !== farMac || far.current?.w.id !== farId) far.current = undefined;
  useEffect(() => void (farFrom?.workers && !farFresh && setOpened("")), [farFrom, farFresh]);
  // The agent of a link (linkedAgent): of this computer, or else of another computer, as a tap on its row there.
  useEffect(() => {
    openLinked = () => {
      const id = linkedAgent;
      if (!id || !listed) return;
      linkedAgent = "";
      const w = stateRef.current.workers.find((w) => w.id === id);
      if (w) return openWorker(w);
      const lost = () => setError("Yonder cannot find this agent.");
      linkedAgents.add(id);
      void elsewhere().then((e) => {
        const o = e.find((o) => o.workers?.some((w) => w.id === id));
        const fw = o?.workers?.find((w) => w.id === id);
        if (!o || !fw) return lost();
        setOthers(e);
        const at = `@${o.mac} ${id}`;
        if (tabOf(fw) === viewRef.current.tab && selectedRef.current === ALL.path) setOpened(at);
        else ((openNext.current = at), setSelected(ALL.path), setTab(tabOf(fw)));
      }, lost);
    };
    openLinked();
  });
  // The chat and the check of an agent of another computer act through the link of that computer (LinkOf). A change
  // shows at once, as with act, and the agents of the other computers load again when the call ends.
  // shortcut: a load under way can show the old state again for 3 seconds; keep the change until the call ends if it shows.
  const linkTo = (mac: string): Link => {
    const { fetch, call } = reach(mac);
    return {
      far: true,
      fetch,
      call,
      act: (tool, ws, args = {}, patch = PATCH[tool], buzz = true) => {
        if (buzz && tool === "close_worker" && !args.done) haptics(["medium", "heavy"]);
        const ids = new Set(ws.map((w) => w.id));
        if (patch) setOthers((os) => os.map((o) => (o.mac !== mac ? o : { ...o, workers: o.workers?.map((w) => (ids.has(w.id) ? { ...w, ...patch } : w)) })));
        return call(tool, args).then(() => {}).finally(() => void elsewhere().then(setOthers, () => {}));
      },
    };
  };
  const farLink = useMemo(() => (farMac ? linkTo(farMac) : undefined), [farMac]);
  // The link of the computer that the environment dropdown of the Mac picks (farPick).
  const farPickLink = useMemo(() => (farPick ? linkTo(farPick) : undefined), [farPick]);
  // The computer that gets the attached images: the one of the open chat, else the one of the New agent view.
  const imageLink = farMac ? farLink : opened ? undefined : farPickLink;
  imageFetch.current = imageLink?.fetch;
  // An attached image is on one computer, so the images go when the chat moves to another computer.
  useEffect(() => setImages([]), [imageLink]);
  // The usage of that computer needs a bridge with /claude-usage (PEER_PATHS). An older bridge shows none.
  const [farUsage, setFarUsage] = useState<ClaudeUsage>({});
  useEffect(() => {
    setFarUsage({});
    if (!farPickLink) return;
    let live = true;
    const load = () => void farPickLink.fetch("/claude-usage").then((r) => (r.ok ? r.json() : {})).then((u) => live && setFarUsage(u), () => {});
    load();
    const timer = setInterval(load, 30_000);
    return () => ((live = false), clearInterval(timer));
  }, [farPickLink]);
  // The last lists of the other computers, for the switch below, whose function the first render made.
  const farRef = useRef({ others, farProjects });
  farRef.current = { others, farProjects };
  // A switch to another Mac (an environment) moves the running app with no new load of the page, so a live call goes
  // on (moveTo in src/link.ts). The call forgets the agent numbers first, and a Claude call ends on the old Mac. Then
  // the data of the old Mac goes, and the poll and the loads bring the data of the new Mac.
  // The agents and the projects of the new Mac show at once from the last load of the other computers, and the old Mac
  // goes into those lists with its last agents and projects, so a switch back shows at once too. The poll and the loads
  // then correct them. Else the lists stay empty for some seconds after each switch.
  useEffect(() => {
    if (!phone) return;
    void describeEnvironment();
    moveTo.mac = (p, old) => {
      setUnpaired(false);
      if (!old) startSetup(); // The first pairing of this phone.
      const known = farRef.current;
      const rest = <T extends { mac: string }>(list: T[]) => list.filter((o) => o.mac !== p.mac && o.mac !== old?.mac);
      const was = old && !hidden().includes(old.mac) ? { mac: old.mac, name: macName(old) } : undefined;
      // The same agents as `elsewhere` in src/elsewhere.ts gives: not closed, with no sub-agents.
      setOthers([...rest(known.others), ...(was ? [{ ...was, workers: rawWorkers.current.filter((w) => !w.parent && w.status !== "closed") }] : [])]);
      setFarProjects([...rest(known.farProjects), ...(was ? [{ ...was, projects: projectsRef.current }] : [])]);
      setFarSites([]);
      setSiteMac("");
      loadEnvs();
      callRef.current?.moved();
      movePhone(p);
      settledAt = Date.now(); // A poll of the old Mac that is under way does not show its agents.
      pending.clear();
      listed = false; // The agents of the new Mac do not grow in.
      // Not through showWorkers, so the first poll of the new Mac still makes no row grow in.
      rawWorkers.current = known.others.find((o) => o.mac === p.mac)?.workers ?? [];
      setWorkers(rawWorkers.current);
      setProjects(known.farProjects.find((o) => o.mac === p.mac)?.projects ?? []);
      setSites(undefined);
      localStorage.removeItem("sites");
      setCalls([]);
      setImages([]); // The attached files are on the old Mac.
      setOpened("");
      setOpenSub(undefined);
      setSelected(ALL.path);
      setTab("agents");
      showAfter.current = 0;
      seenRef.current = Date.now();
      moved.current = true; // The next poll gives Grok the agents of the new Mac at once.
      void describeEnvironment(callRef.current ? macName(old) : undefined);
      void Promise.all([loadProjects(), check(), checkKey(), loadPreview(), loadValues(), loadClaudeMcp(), loadClis()]);
    };
    return () => void (moveTo.mac = undefined);
  }, []);
  // The question before Yonder opens a closed tunnel of a site. The Mac opens localhost, so it never asks.
  // `off`: the Tunnel is off, so a localhost link of a chat asks to turn it on first.
  const [asking, setAsking] = useState<{ c: Partial<Confirm> & { port: number; off?: boolean }; done: (yes: boolean) => void }>();
  // The question is a native alert of the system (the dialog plugin). A phone app
  // that is older than the permission refuses the alert, and then the dialog of the window asks.
  const ask = (c: Partial<Confirm> & { port: number; off?: boolean }) => {
    const what = c.off ? (c.port ? `port ${c.port}` : c.label) : c.project;
    const text = c.off
      ? `The Tunnel is off. Yonder turns it on and opens ${what} through its private tunnel. Only you can open the address.`
      : `Yonder opens ${c.title || c.label}, port ${c.port}, through its private tunnel. Only you can open the address.`;
    return nativeAsk(text, { title: `Open ${what} on this phone?`, kind: "warning", okLabel: c.off ? "Turn on and open" : "Open", cancelLabel: "Cancel" }).catch(
      () => new Promise<boolean>((done) => setAsking({ c, done })),
    );
  };
  const openSite = (args: Record<string, unknown>, link?: string) => showSite(args, ask, link);
  // A localhost link of a chat on the phone. When the Tunnel is off, one yes turns it on and opens the port through the
  // tunnel, with no second question for the project.
  // A preview address in a chat, such as https://yonder-landing-nova.yonder.so, opens the same way by the name of its
  // site, so a tap never opens a closed tunnel with no question. The Mac opens the site from localhost, with no tunnel.
  const openLocal = async (site: { port: number } | { worker: string }, link: string) => {
    const port = "port" in site ? site.port : 0;
    if (previewOn) return openSite(site, link);
    if (!phone) return openLink(link);
    if (!(await ask({ port, label: "worker" in site ? site.worker : undefined, off: true }))) return;
    await loadPreview({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: true }) });
    return showSite({ ...site, confirmed: true }, ask, link);
  };
  // The sites that the Claude call opens on this device with preview of the bridge. An agent does not open one.
  // The phone opens each one as a tap on a localhost link of a chat: in the browser of Yonder, through the
  // tunnel. The Mac opens it in its browser.
  // The phone asks less often, because each ask goes through the relay.
  const showAfter = useRef(0);
  const openLocalRef = useRef(openLocal);
  openLocalRef.current = openLocal;
  useEffect(() => {
    // The phone names its abilities (src/abilities.ts, docs/shell.md) and does the asks of the bridge. `locate` is for a
    // bridge from before the abilities, which asks only for the location.
    let abilities = "location";
    if (phone) void abilityNames().then((names) => (abilities = names));
    const poll = () =>
      yonder.show.poll(showAfter.current, phone ? abilities : undefined, screenOf())
        .then((list: { id: number; url: string; title?: string; frame?: false; artifact?: { path: string; title: string }; ability?: string; args?: Record<string, unknown>; locate?: boolean; attach?: string }[]) => {
          for (const s of list.filter((s) => s.id > showAfter.current)) {
            showAfter.current = s.id;
            // An ability of the phone for the bridge, or get_location of an older bridge: the answer, or why there is none.
            if (s.ability || s.locate) {
              const answer = s.ability ? runAbility(s.ability, s.args) : locate().then((pin) => JSON.parse(pin), (e: Error) => ({ error: e.message }));
              void answer.then((body) => yonder.show.answer(s.id, body, !s.ability)).catch(() => {});
              continue;
            }
            // send_file with no file: the user picks the file for an agent, or for a new agent ("").
            if (s.attach !== undefined) {
              attachForRef.current(s.attach);
              continue;
            }
            // A page of an agent from an older bridge: a page never opens by itself.
            if (s.artifact) continue;
            // A site that the Claude call opens: on the Mac in the viewer of the apps, as a tap on its row, else in its browser.
            if (!phone && s.frame !== false && isLocal(s.url)) {
              showArtifact({ path: s.url, title: s.title || new URL(s.url).host });
              continue;
            }
            (phone ? openLocalRef.current({ port: localPort(s.url) }, s.url) : openLink(s.url)).catch((e) => setError((e as Error).message));
          }
        }, () => {});
    const timer = setInterval(poll, phone ? 3000 : 1000);
    return () => clearInterval(timer);
  }, []);
  // The computer of a site in the Canvas tab: the computer in use, or another computer of the phone (`mac`). The tunnel
  // of a site opens when the user opens the site.
  const siteAt = (mac?: string) => {
    const edit = (change: (list: Site[]) => Site[]) =>
      mac ? setFarSites((fs) => fs.map((f) => (f.mac === mac ? { ...f, sites: change(f.sites) } : f))) : setSites((all) => change(all ?? []));
    return {
      via: mac ? reach(mac).call : (name: string, args: Record<string, unknown>) => yonder.tool(name, args, 0).then((r) => JSON.stringify(r)),
      key: (label: string) => (mac ? `${mac}/${label}` : label),
      edit,
      reload: () => void (mac ? loadFarSites().catch(() => {}) : loadSites()),
    };
  };
  // An address that the user types in the Tunnel tab, such as localhost:3000: the bridge adds it and opens its tunnel.
  // The row of the address shows at once, and the next load gives the true row. With the filter on another computer,
  // the address goes to that computer.
  const addSite = (url: string, mac?: string) => {
    const at = siteAt(mac);
    at.edit((all) => [...all, { label: url, project: "", path: "", port: Number(/(\d+)\/?$/.exec(url)?.[1]) || 0, title: url, open: true }]);
    return at.via("preview", { action: "add", url }).then(at.reload, (e) => {
      setError(`Yonder cannot add ${url}: ${(e as Error).message}`);
      at.reload();
      throw e;
    });
  };
  const removeSite = (s: Site, mac?: string) => {
    const at = siteAt(mac);
    at.edit((all) => all.filter((x) => x.label !== s.label));
    at.via("preview", { action: "remove", worker: s.label })
      .catch((e) => setError(`Yonder cannot remove ${s.label}: ${(e as Error).message}`))
      .finally(at.reload);
  };
  // An address that the search of the Canvas tab opens, such as localhost:3000, 3000 or example.com.
  const addTyped = () => {
    const url = siteFilter.trim();
    const mac = farSites.some((f) => f.mac === siteMac) ? siteMac : undefined;
    setSiteFilter("");
    addSite(url, mac).catch(() => {});
  };
  // On the Mac, a letter typed on the Canvas tab goes into its search.
  useEffect(() => {
    if (phone || tab !== "preview" || opened || settings) return;
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey || e.key === " " || el.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      setSiteFilter(e.key);
      document.querySelector<HTMLInputElement>(".apps .add-site input")?.focus();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [tab, opened, settings]);
  // The actions of an app of the Canvas tab. Each one changes the list at once, then calls the bridge (change_app,
  // remove_app, through yonder.apps for the archive), and the next load gives the true list. A page goes to the archive,
  // and only a delete forever from the archive removes its files, after a yes.
  // Generate (in Change icon) and Rebuild ask the agent that made the page, or a new agent when the page has none, as a call
  // makes its pages. An icon that the user picks or uploads goes to the bridge as it is (change_app).
  const pageActs = (a: Artifact) => {
    const fail = (e: unknown) => setError((e as Error).message);
    const change = (patch: Partial<Artifact>) => changeCanvas((l) => l.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
    return {
      save: (on: boolean) => (change({ saved: on || undefined }), void yonder.tool("change_app", { app: a.id, saved: on }, 0).catch(fail)),
      rename: (title: string) => (change({ title }), void yonder.tool("change_app", { app: a.id, title }, 0).catch(fail)),
      icon: (icon: string) => (change({ icon }), void yonder.tool("change_app", { app: a.id, icon }, 0).catch(fail)),
      // The row moves at once, and comes back with the reason when the bridge fails.
      remove: () => void yonder.apps.archive(a.id).catch((e) => setError(`Yonder cannot archive ${a.title}: ${(e as Error).message}`)),
      restore: () => void yonder.apps.restore(a.id).catch((e) => setError(`Yonder cannot restore ${a.title}: ${(e as Error).message}`)),
      forever: async () => {
        const text = `${a.title} and its files go from this computer.`;
        const yes = await nativeAsk(text, { title: "Delete forever?", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" }).catch(() => confirm(`Delete forever?\n\n${text}`));
        if (yes) yonder.apps.remove(a.id).catch((e) => setError(`Yonder cannot delete ${a.title}: ${(e as Error).message}`));
      },
      redo: (what: "icon" | "app") => {
        const ask =
          what === "icon"
            ? `Draw a new icon for the app "${a.title}" (id ${a.id}): a small square SVG with a subtle CSS animation that shows what the app is. Then call change_app of Yonder with app ${a.id} and the icon.`
            : `Rebuild the app "${a.title}" (id ${a.id}) with the newest data. Then call show_app of Yonder with id ${a.id} and the new page.`;
        const owner = workers.find((w) => w.id === a.worker);
        haptic();
        (owner
          ? yonder.tool("message_worker", { worker: owner.id, message: ask }, 0)
          : yonder.tool("start_worker", { project: "", name: what === "icon" ? "New app icon" : `Rebuild ${a.title}`, task: `${ask} Its page is ${a.path}.` }, 0)
        ).catch(fail);
      },
    };
  };
  const siteActs = (s: Site, mac?: string) => {
    const at = siteAt(mac);
    const change = (patch: Partial<Site>, args: Record<string, unknown>) => {
      at.edit((all) => all.map((x) => (x.label === s.label ? { ...x, ...patch } : x)));
      at.via("change_app", { app: s.label, ...args }).catch((e) => setError((e as Error).message)).finally(at.reload);
    };
    return {
      save: (on: boolean) => change({ saved: on || undefined }, { saved: on }),
      rename: (title: string) => change({ name: title }, { title }),
      icon: (icon: string) => change({ icon }, { icon }),
      // The row goes at once. The loads leave it out until the bridge answers, and a failed delete brings it back.
      remove: () => {
        const key = `site/${at.key(s.label)}`;
        goneApp(key);
        at.edit((all) => all.filter((x) => x.label !== s.label));
        (s.url ? at.via("preview", { action: "remove", worker: s.label }) : at.via("remove_app", { app: s.label }))
          .then(
            () => goneApp(key, Date.now() + 10_000),
            (e) => (goneApp(key, 0), setError(`Yonder cannot delete ${s.name ?? s.label}: ${(e as Error).message}`)),
          )
          .finally(at.reload);
      },
    };
  };
  const menuRef = useRef((_id: string) => {});
  menuRef.current = (id) => {
    const fail = (e: unknown) => setError((e as Error).message);
    if (id === "pair-phone") setPairing(true);
    else if (id === "new-project") newProject().catch(fail);
    else if (id === "open-folder") addFolder().catch(fail);
    else if (id === "new-chat" && online) newAgent(true);
    else if (id !== "close-completed") return;
    else {
      // Only the agents that do not need the user: the Done tab also has the waiting agents and the results to read.
      const done = workers.filter((w) => !w.kind && tabOf(w) === "completed" && !needsYou(w) && (selected === ALL.path || projectOfRef.current.get(w.id) === selected));
      Promise.all(done.map((w) => act("close_worker", [w], { worker: w.id }))).catch(fail);
    }
  };
  useEffect(() => {
    if (!inTauri) return;
    const stop = listen<string>("menu", (e) => menuRef.current(e.payload));
    return () => void stop.then((unlisten) => unlisten());
  }, []);
  // Android: the back gesture of the system closes an open menu or picture, then a section of the settings and the settings, then the open
  // conversation or call. At the list, the app goes to the background, and a live call stays on.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // ⌘S (settingsKey of Settings › Keys) opens the Settings, and closes them when they are open. Also in a text field. Not on
  // the phone. It lets the user work with the keyboard only.
  useEffect(() => {
    if (phone) return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !hit(e, "settingsKey")) return;
      e.preventDefault();
      setSettings(!settingsRef.current);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // ⌘F (findKey of Settings › Keys) selects the search of the view: the Settings, the Projects view, the Canvas tab or the
  // Search tab. The lists of agents go to the Search tab, which finds an agent in all the projects. An open agent finds
  // in its chat (Conversation). Also in a text field, as in a browser.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !hit(e, "findKey")) return;
      const tab = viewRef.current.tab;
      if (!settingsRef.current && openedRef.current) return;
      e.preventDefault();
      if (!settingsRef.current) {
        if (tab === "projects") setScrolled(false);
        else if (tab !== "search") setTab("search");
      }
      const field = settingsRef.current ? ".page input[type=search]" : ".panel:not([hidden]) :is(.tools, .add-site) input";
      requestAnimationFrame(() => [...document.querySelectorAll<HTMLInputElement>(field)].pop()?.select());
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    // The phone screen in a browser (a test in headless Chrome) has no Tauri (Sentry YONDER-2).
    if (!android || !inTauri) return;
    const back = onBackButtonPress(() => {
      const popup = document.querySelector('[role="menu"], [role="dialog"]');
      if (popup) popup.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      // In a section of the settings, the back button goes to the list of the sections first: the back button of the
      // page on top, which is the last one. The sign-in page can also be open with no settings under it.
      else if (settingsRef.current || document.querySelector(".signin-page")) [...document.querySelectorAll<HTMLElement>(".page .page-back")].pop()?.click();
      else if (openedRef.current) setOpened("");
      else shell?.background();
    });
    return () => void back.then((l) => l.unregister());
  }, []);

  // Each agent belongs to its workspace, else to the deepest workspace folder that holds its folder (homeOf). An agent
  // outside every workspace shows its own folder as a workspace.
  const groups = new Map<string, Worker[]>();
  const projectOf = new Map<string, string>();
  const outside: Project[] = [];
  for (const w of workers) {
    let p: Project | undefined = homeOf(w, projects);
    p ??= outside.find((o) => o.path === w.path);
    if (!p) {
      p = { name: w.project, path: w.path, starred: false };
      outside.push(p);
    }
    groups.set(p.path, [...(groups.get(p.path) ?? []), w]);
    projectOf.set(w.id, p.path);
  }
  groups.set(ALL.path, workers);
  // Yonder first, then the starred projects in the order of the user, then projects with
  // agents, newest activity first. The sort keeps the order of the bridge for the starred ones.
  const latest = (p: Project) => Math.max(0, ...(groups.get(p.path) ?? []).map((w) => w.updatedAt));
  const rank = (p: Project) => (p.pinned ? 0 : p.starred ? 1 : 2);
  const list = [ALL, ...[...projects, ...outside].sort((a, b) => rank(a) - rank(b) || (a.starred ? 0 : latest(b) - latest(a)))];
  const shown = list.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  // The projects that an agent can move to, in the order of the Projects view. An agent that Yonder started can move
  // on any CLI. A sub-agent and a session that Yonder did not start cannot (move_worker in bridge/main.ts).
  const movesOf = (w: Worker) => (w.kind || w.parent ? [] : list.filter((p) => p !== ALL && !outside.includes(p) && p.path !== projectOf.get(w.id)));
  // The project under the dragged agent: its title or one of its rows in All projects. Only the drag of a row counts,
  // not a file from the Finder.
  const dropOf = (e: { target: EventTarget; dataTransfer: DataTransfer }) => {
    if (!e.dataTransfer.types.includes("yonder/agent")) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-project], [data-id]");
    const path = el?.dataset.project ?? projectOf.get(el?.dataset.id ?? "");
    return dragged && current === ALL ? movesOf(dragged).find((p) => p.path === path) : undefined;
  };
  // Agents of another computer show in this tab of All projects (the Closed tab shows none).
  const farIn = (t: (typeof LISTS)[number]) => t !== "closed" && others.some((o) => farWs(o).some((w) => tabOf(w) === t));
  const farShown = farProjects.flatMap((o) => {
    if (!farOn(o.mac)) return [];
    const ps = o.projects?.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase())) ?? [];
    return ps.length ? [{ ...o, ps, ws: others.find((x) => x.mac === o.mac)?.workers ?? [] }] : [];
  });
  const firstHere = shown.find((p) => p !== ALL);
  // All projects, Yonder and the starred projects come first, and a line goes over the first of the others.
  const rest = filter ? undefined : shown.find((p) => p !== ALL && !p.pinned && !p.starred);
  const current = list.find((p) => p.path === selected);
  // A project is always selected: All projects or one project. A selected project that left the list, such as one
  // that another device removed, gives All projects.
  useEffect(() => {
    if (listed && projects.length && !current) setSelected(ALL.path);
  }, [projects, current]);
  // The agents by number. A new step or a new status does not move a row, else the rows change places all the time.
  const agents = [...(groups.get(selected) ?? [])].sort((a, b) => (a.num || 1e9) - (b.num || 1e9) || b.updatedAt - a.updatedAt);
  // The agents of each tab (tabOf).
  // The agent that slides out of a tab after a message stays in that tab until the slide ends.
  const byTab = (t: string) => agents.filter((w) => (w.id === leaving?.id ? leaving.tab : tabOf(w)) === t);
  // The Done tab puts the agent that finished last at the top, and the Closed tab the agent that the user closed
  // last. The bridge sets updatedAt when an agent finishes or closes.
  // On the Done tab, the agents that need the user come first.
  const doneOrder = (a: Worker, b: Worker) => Number(needsYou(b)) - Number(needsYou(a)) || b.updatedAt - a.updatedAt;
  const lists = {
    agents: byTab("agents"),
    completed: byTab("completed").sort(doneOrder),
    saved: byTab("saved").sort(doneOrder),
    closed: byTab("closed").sort((a, b) => b.updatedAt - a.updatedAt),
  };
  // On All projects, the Closed tab keeps the order of the closes: the agent closed last is at the top, and the agent
  // closed first is at the bottom. A project title shows again each time the project changes.
  const byClose = (ws: Worker[]) => {
    const out: { p: Project; ws: Worker[] }[] = [];
    for (const w of ws) {
      const p = list.find((p) => p !== ALL && p.path === projectOf.get(w.id));
      if (!p) continue;
      if (out.at(-1)?.p === p) out.at(-1)!.ws.push(w);
      else out.push({ p, ws: [w] });
    }
    return out;
  };
  // Empty the trash: the bridge removes the closed agents of each project. The button looks like the Cancel button of
  // the talk view, and floats at the bottom of the Closed tab. On the phone, it is above the tab bar.
  const emptyClosed = () =>
    lists.closed.length > 0 && (
      <button
        className="talk-cancel empty-closed"
        aria-label="Empty the Closed tab"
        onClick={async () => {
          // The agents cannot come back, so the native alert asks first.
          const n = lists.closed.length;
          const title = `Delete ${n} closed ${n === 1 ? word.one : word.many}?`;
          const text = n === 1 ? "It cannot come back." : "They cannot come back.";
          const yes = await nativeAsk(text, { title, kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" }).catch(() => confirm(`${title}\n\n${text}`));
          if (!yes) return;
          for (const path of new Set(lists.closed.map((w) => projectOf.get(w.id) ?? "")))
            act("remove_worker", lists.closed.filter((w) => projectOf.get(w.id) === path), { tab: "closed", project: path }).catch(() => {});
        }}
      >
        Empty
      </button>
    );
  const openedAgent = workers.find((w) => w.id === opened) ?? far.current?.w;
  agentOpen.current = !!openedAgent;
  // The + button opens a new agent on the Agents tab: the user types the task, and Enter starts the agent.
  const drafting = opened === "new" && tab === "agents" && !!current;
  const sheet = openedAgent || drafting;
  // The talk view of a new agent or of a conversation hides the call button and the + button, when no call is on.
  const [convoTalking, setConvoTalking] = useState(false);
  const talkView = (drafting || (!!openedAgent && convoTalking)) && phase === "idle";
  useEffect(() => void (hold.talk = talkView), [talkView]);
  useEffect(() => void ((openedAgent || settings || talkView) && (hold.dirty = true)), [!!openedAgent, settings, talkView]);
  // The starred projects of the rail and of the project switcher: All projects, Yonder, then the starred projects.
  const ring = list.filter((p) => p === ALL || p.pinned || p.starred);
  const goProject = (p: Project) => (setSelected(p.path), setTab((t) => (t === "projects" ? "agents" : t)));
  const projectMark = (p: Project) => (p === ALL ? <Icon name="folder" size={16} /> : <><span>{p.name.slice(0, 1).toUpperCase()}</span><Favicon path={p.path} draggable={false} loading="lazy" /></>);
  // ⌘D (projectKey of Settings › Keys) switches the project as ⌘Tab switches the app on the Mac: a hold of ⌘ shows the
  // starred projects, each ⌘D or arrow moves to the next one, and the release of ⌘ opens it. A tap of ⌘D opens the next
  // one. It works in an open agent too, so Talk is on ⇧⌘D.
  // The rail and the switcher put the projects in the order of their last use, the newest first, as ⌘Tab does, so a tap
  // of ⌘D goes back to the project before. The icons have no names.
  const [used, setUsed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("recentProjects") ?? "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    const next = [selected, ...used.filter((p) => p !== selected)].slice(0, 100);
    setUsed(next);
    localStorage.setItem("recentProjects", JSON.stringify(next));
  }, [selected]);
  const last = (p: Project) => (used.includes(p.path) ? used.indexOf(p.path) : used.length);
  const order = [...ring].sort((a, b) => last(a) - last(b));
  // ⌘A (allProjectsKey of Settings › Keys) opens All projects. A field with text keeps ⌘A to select all.
  useEffect(() => {
    if (phone) return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !hit(e, "allProjectsKey")) return;
      const el = e.target as HTMLElement;
      if (el.isContentEditable ? el.textContent : (el as HTMLInputElement).value) return;
      e.preventDefault();
      goProject(ALL);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const [switching, setSwitching] = useState<number>();
  useEffect(() => {
    if (phone || settings || !order.length) return void setSwitching(undefined);
    const n = order.length;
    const down = (e: KeyboardEvent) => {
      const step = hit(e, "projectKey") ? 1 : switching === undefined ? 0 : ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
      if (step) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSwitching((i) => ((i ?? order.indexOf(current!)) + step + n) % n);
      } else if (switching !== undefined && e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSwitching(undefined);
      }
    };
    // The release of the last modifier key opens the project.
    const up = (e: KeyboardEvent) => {
      if (switching === undefined || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      goProject(order[switching]);
      setSwitching(undefined);
    };
    const blur = () => setSwitching(undefined);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => (window.removeEventListener("keydown", down, true), window.removeEventListener("keyup", up, true), window.removeEventListener("blur", blur));
  });
  // The ways to attach, in the attach sheet (src/Attach.tsx) that the paper clip next to the + button, the paper clip
  // of the New agent view and the paper clip of a conversation open.
  const [attaching, setAttaching] = useState(false);
  const failed = (what: string) => (e: unknown) => setError(`Yonder cannot ${what}: ${(e as Error).message}`);
  const attachActions = {
    camera: () => camera.current?.click(),
    photos: () => void chooseFromLibrary().catch(failed("attach the photos")),
    file: () => void chooseFiles().catch(failed("attach the file")),
    paste: () => void paste().catch(failed("paste")),
    location: () => void attachLocation().catch(failed("attach the location")),
    version: () => void attachVersion().catch(failed("attach the version")),
    recent: (p: Recent) => void attachRecent(p).catch(failed("attach the photo")),
  };
  // On iOS 26 the attach sheet is a sheet of iOS (AttachSheet in NativeChrome.swift), with native buttons, and its
  // choice comes back as the choice of the native menu "attach": a name of `attachActions`, or "recent:" and the id of
  // a photo. Android and an older iPhone app show the sheet of the page.
  menus.set("attach", (item) => {
    if (item.startsWith("recent:")) return attachActions.recent({ id: item.slice(7), thumb: "", seconds: 0 });
    if (item in attachActions && item !== "recent") attachActions[item as Exclude<keyof typeof attachActions, "recent">]();
  });
  // An action of the attach sheet for the API (yonder.attach): it runs the action and answers with the path of the new
  // file on the computer, or null when no file comes in 2 minutes, as when the user closes the picker.
  const attachFor = async (kind: "camera" | "photos" | "file" | "paste" | "location" | "version") => {
    const before = new Set(imagesRef.current.map((i) => i.path));
    attachActions[kind]();
    for (let t = Date.now(); Date.now() - t < 120_000; await new Promise((r) => setTimeout(r, 300))) {
      const fresh = imagesRef.current.find((i) => i.path && !before.has(i.path));
      // The file goes to the page, so it leaves the text box of the default screen under the page.
      if (fresh && !uploads.current.size) return setImages((l) => l.filter((i) => i.path !== fresh.path)), { path: fresh.path };
    }
    return null;
  };
  // On the Mac, each paper clip opens the file picker of macOS at once: any file, and a picture or a video goes as one.
  // The phone has the camera, the photos and the location, so it opens the attach sheet.
  const openAttach = () => {
    if (!phone) return filePicker.current?.click();
    // The keyboard closes first, as in Messages: a sheet of iOS can open behind the keyboard, and the user then sees
    // no sheet, and the paper clip seems dead.
    (document.activeElement as HTMLElement | null)?.blur?.();
    // A theme other than the default draws its own attach sheet: the sheet of the page, in the style of the theme.
    // Version 6 of the native chrome has the Version button. An older app shows the sheet of the page, which has it.
    if (chromeVersion < 6 || themed()) return setAttaching(true);
    yonder.native.attachSheet().then((shown) => shown || setAttaching(true), () => setAttaching(true));
  };
  // send_file of the bridge with no file, such as from the Claude app, which cannot send a large file: the chat of that
  // agent, or a new agent, with the attach sheet. The user picks the file, and it goes with the next message.
  const attachForRef = useRef((_id: string) => {});
  attachForRef.current = (id) => {
    const w = stateRef.current.workers.find((w) => w.id === id);
    if (w) openWorker(w);
    else newAgent(true);
    setTimeout(openAttach, 500);
  };
  // The paper clip of the New agent view on the phone, in the middle above the model, effort and permission menus. The
  // menus are in one row.
  const talkClip = (
    <button className="talk-clip attach-clip" data-native="talk-attach" data-icon="paperclip" data-glyph="20" disabled={!online} onClick={openAttach} title="Attach" aria-label="Attach"><Icon name="paperclip" size={14} /></button>
  );
  // The paper clip of the prompt box of a conversation, at the left of the field, also on the Mac. It opens the same attach
  // sheet, because the conversation hides the paper clip of the tab bar.
  // The record button next to it, on the Mac: the user drags an area of the screen, as with Shift-Command-5, and it
  // records that area with the microphone. The video attaches with its words and frames, as a copied video does. A
  // second click, or the stop button of macOS in the menu bar, stops it. It records with the microphone of the Mac and
  // pauses the music, so that AirPods keep their high quality.
  const [recording, setRecording] = useState(false);
  const recordScreen = () => {
    if (recording) return void yonder.media.recordStop().catch(() => {});
    setRecording(true);
    // The music of other apps pauses while the microphone records, as for a dictation (hush in src-tauri/src/main.rs,
    // with the switch Pause music of the settings). The microphone is the one of the settings, else the built-in one.
    const hush = (on: boolean) => inTauri && invoke("set_mic", { on }).catch(() => {});
    hush(true);
    const job = (async () => {
      const res = await yonder.media.record(localStorage.getItem("micName") ?? "");
      if (!res.ok) throw new Error(await res.text());
      const made = (await res.json()) as { path: string } | null;
      hush(false);
      setRecording(false);
      if (made) await attachPaths([made.path]); // null: Escape
    })()
      .catch(failed("record the screen"))
      .finally(() => (hush(false), setRecording(false)));
    uploads.current.add(job);
    void job.finally(() => uploads.current.delete(job));
  };
  const promptClip = (
    <>
      <button className="icon attach" data-native="prompt-attach" data-icon="paperclip" data-glyph="20" disabled={!online} onClick={openAttach} title="Attach" aria-label="Attach"><Icon name="paperclip" size={20} /></button>
      {!phone && platform === "darwin" && (
        <button type="button" className="icon attach record" data-on={recording ? "" : undefined} disabled={!online} onClick={recordScreen} title={recording ? "Stop recording" : "Record an area of the screen"} aria-label={recording ? "Stop recording" : "Record the screen"}>
          <Icon name={recording ? "stop" : "record"} size={20} />
        </button>
      )}
    </>
  );
  // The attached images, under the call row. The New agent view shows them under its talk button.
  // The pictures of the attached images and videos, which a sent message shows at once (Conversation).
  const shownUrls = () => images.flatMap((i) => (i.text === undefined && i.url ? [i.url] : []));
  const shownPlaces = () => images.flatMap((i) => (i.text && placeOf(i.text) ? [i.text] : []));
  // On the phone, a sent image flies up to the right, to its message, and fades. The row of the Mac scrolls and so cuts
  // the flight, and there the image only shrinks.
  const leave: Variants = { gone: (fly: boolean) => (fly && phone ? { scale: 0.4, x: 120, y: -160, opacity: 0, transition: { duration: 0.35, ease: "easeIn" } } : { scale: 0.4, opacity: 0, transition: { duration: 0.2 } }) };
  const waits = images.length + Object.keys(uploading).length > 0;
  // The picture of an attached image in the viewer (`big`), or under the finger while it holds the image (`peek`).
  const [big, setBig] = useState<string>();
  const [peek, setPeek] = useState<string>();
  const touch = useRef<{ x: number; y: number; timer?: number; held?: boolean }>({ x: 0, y: 0 });
  const press = (url: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      const h: typeof touch.current = (touch.current = { x: e.clientX, y: e.clientY });
      h.timer = window.setTimeout(() => {
        h.held = true;
        haptic();
        setPeek(url);
        const up = () => (setPeek(undefined), removeEventListener("pointerup", up), removeEventListener("pointercancel", up));
        addEventListener("pointerup", up);
        addEventListener("pointercancel", up);
      }, 350);
    },
    // A drag or a scroll is not a hold.
    onPointerMove: (e: ReactPointerEvent) => Math.hypot(e.clientX - touch.current.x, e.clientY - touch.current.y) > 8 && clearTimeout(touch.current.timer),
    onPointerUp: () => clearTimeout(touch.current.timer),
    onPointerCancel: () => clearTimeout(touch.current.timer),
    onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
    onClick: () => (touch.current.held ? (touch.current.held = false) : setBig(url)),
  });
  // A swipe to the side, or an arrow key, in the viewer shows the attached picture before or after it.
  const stepPic = (dir: 1 | -1) => {
    const pics = shownUrls();
    const at = big ? pics.indexOf(big) : -1;
    const next = at < 0 ? undefined : pics[at + dir];
    if (next) setBig(next);
    return !!next;
  };
  const strip = (
    <AnimatePresence custom={flying.current}>
    {waits && <ul key="images" className="images" title={`These go to the ${word.one} with your next request`}>
      {Object.entries(uploading).map(([id, part]) => (
        <li key={id} className="uploading">
          {/* Only the percent of a photo or a video, with no words such as "Shrinking" or "Reading". */}
          <span className="spin"><Icon name="refresh" /></span>
          {Math.round(part * 100)}%
        </li>
      ))}
      <AnimatePresence propagate custom={flying.current}>
      {images.map((i) => (
        <li key={i.path}>
          {/* A tap on an image or a video opens its picture in the viewer, and a hold shows it until the finger lifts.
              The × removes the item. A video shows
              its length. A new image pops in with a spring. */}
          <motion.div className="attached" initial={{ scale: 0.3, y: 24, opacity: 0 }} animate={{ scale: 1, x: 0, y: 0, opacity: 1 }} variants={leave} exit="gone" transition={{ type: "spring", bounce: 0.55, duration: 0.5 }}>
            {i.file
              ? <div className="pic doc" title={i.text}><Icon name="doc" size={28} /><b>{i.text!.includes(".") ? i.text!.split(".").pop() : "file"}</b><p>{i.text}</p></div>
              : i.text !== undefined
              ? <div className="pic">{placeOf(i.text) ? <Place {...placeOf(i.text)!} /> : <p className="pasted">{i.text.slice(0, 200)}</p>}</div>
              : (
                <button className="pic" {...press(i.url)} aria-label={i.seconds === undefined ? "Open the image" : "Open the video"}>
                  <img src={i.url} alt="" draggable={false} />
                  {i.seconds !== undefined && <b className="length"><Icon name="play" size={10} filled /> {clock(i.seconds * 1000)}</b>}
                </button>
              )}
            <button className="remove" onClick={() => detach([i.path], false)} aria-label={i.file ? "Remove the file" : i.text !== undefined ? "Remove the text" : i.seconds === undefined ? "Remove the image" : "Remove the video"}><Icon name="x" size={12} /></button>
          </motion.div>
        </li>
      ))}
      </AnimatePresence>
    </ul>}
    </AnimatePresence>
  );
  const openedCall = calls.find((c) => String(c.id) === opened);
  viewRef.current = {
    tab, project: current, agents: [...lists.agents, ...lists.completed, ...lists.closed],
    images: imageFetch.current ? 0 : images.filter((i) => i.seconds === undefined && i.text === undefined).length,
    pastes: images.filter((i) => i.text !== undefined).length,
    videos: images.flatMap((i) => (i.video ? [i.seconds!] : [])),
    uploading: Object.keys(uploading).length,
    open: current && tab !== "projects" && openedAgent && !farMac ? openSub ?? openedAgent : undefined,
    away: far.current && { computer: far.current.o.name, agent: openSub ?? far.current.w },
  };
  projectOfRef.current = projectOf;
  listRef.current = list;
  shownRef.current = shown;
  const count = (status: Status) => workers.filter((w) => w.status === status).length;
  const live = phase === "live" && callRef.current;
  const callCost = live ? live.cost() : 0;

  // On the iPhone, the Dynamic Island shows Yonder during a call: the Yonder icon, the favicon and the name of the
  // project on the screen, the counts of the agents, and the mute and end buttons (Island.swift in ios/gen/apple).
  // The end of the call ends the Live Activity.
  // shortcut: only a call keeps the app awake in the background, so the island shows only during a call.
  // To keep it on after the call, the bridge can update it through Apple push (an ActivityKit push token).
  const { icon: islandIcon, artwork } = useIslandIcon(useBridgeSrc(phone && !android && current && current !== ALL ? `/favicon?path=${encodeURIComponent(current.path)}` : undefined));
  const island = phase === "live"
    ? { running: count("running"), waiting: count("waiting"), done: count("done") + count("failed"), muted, project: current?.name ?? "", icon: islandIcon }
    : { running: -1, waiting: 0, done: 0, muted: false, project: "", icon: "" };
  useEffect(() => {
    if (phone && !android) yonder.native.island(island).catch(() => {});
  }, [island.running, island.waiting, island.done, island.muted, island.project, island.icon]);
  // While Yonder is on the screen, iOS hides the Live Activity, and the island shows Now Playing for the voice of
  // Grok. Without artwork it showed a black square, so the call gives Now Playing the favicon and the project name.
  useEffect(() => {
    if (!phone || android || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = phase === "live" && artwork
      ? new MediaMetadata({ title: current?.name || "Yonder", artist: "Yonder", artwork: [{ src: artwork, sizes: "128x128", type: "image/png" }] })
      : null;
  }, [phase, artwork, current?.name]);
  // The mute and end buttons of the Live Activity call this (Island.swift), also while the screen is locked.
  useEffect(() => {
    // "start" comes from the Talk buttons of Control Center, the Action button, the Lock Screen and Siri (StartCall.swift).
    (window as any).yonderCall = (action: string) =>
      action === "start" ? callRef.current || void toggleRef.current() : action === "end" ? callRef.current?.hangUp() : callRef.current && toggleMute();
  }, []);
  // A shake of the phone asks to undo the last close or complete, as the shake to undo of iOS: the `undo` tool of
  // the bridge. The Swift layer catches the shake (Island.swift). A shake works only on the Agents, Done and Closed
  // lists, and only for an agent that the close or complete moved to another tab. Otherwise a shake does nothing.
  const [undoing, setUndoing] = useState<{ tool: string; app?: string; forever?: boolean; agents: { num: number; name: string; status: Worker["status"] }[] }>();
  // A tool call of an agent that waits for Allow or Deny (`ask`). The phone and the Mac both show it, and the first tap
  // counts. A tap hides it at once (`replied`), before the bridge answers.
  const [replied, setReplied] = useState<string[]>([]);
  // A swipe down puts an approval aside (`later`): it waits in "Needs you" of the Canvas tab, and Review shows it again
  // (`front`). The asks with a kind are the approvals of the Canvas (docs/canvas.md), with the sheet of src/Canvas.tsx.
  const [later, setLater] = useState<string[]>([]);
  const [front, setFront] = useState("");
  const needs = workers.filter((w) => w.ask && w.status !== "closed" && !replied.includes(w.ask.id));
  const asker = needs.find((w) => w.ask!.id === front && !later.includes(front)) ?? needs.find((w) => !later.includes(w.ask!.id));
  const review = (id: string) => (setFront(id), setLater((l) => l.filter((x) => x !== id)));
  // A yes that the bridge refuses, such as a payment that the Mac cannot approve, shows the ask again with the reason.
  const reply = (id: string, allow: boolean, more?: { value?: string; choice?: string }) => {
    setReplied((r) => [...r, id]);
    haptic();
    const back = () => setReplied((r) => r.filter((x) => x !== id));
    yonder.approvals.reply(id, allow, more)
      .then((j: { ok?: boolean; error?: string }) => j.error && (back(), setError(j.error)), back);
  };
  // The pages of the agents in the Canvas tab. The pages that came since the last visit of the tab glow until the next visit.
  const pages = useCanvas(tab === "preview");
  const [pagesSeen, setPagesSeen] = useState(0);
  useEffect(() => {
    if (tab !== "preview") return;
    setPagesSeen(Number(localStorage.getItem("canvasSeen")) || 0);
    localStorage.setItem("canvasSeen", String(Date.now()));
  }, [tab]);
  const onList = useRef(false);
  onList.current = (LISTS as readonly string[]).includes(tab) && !opened && !settings;
  // On the Canvas tab, a shake brings back the app that the user deleted last (remove_app).
  const onApps = useRef(false);
  onApps.current = tab === "preview" && !opened && !settings;
  useEffect(() => {
    (window as any).yonderShake = () => {
      // A change of the screen (src/look.ts) comes back first. An own screen that hides its way out goes to the default.
      const back = undoable();
      if (back || shownLook().look.kind === "screen") {
        haptic("medium");
        const title = back ? "Undo the screen change?" : "Use the default screen?";
        return void nativeAsk(back ? `${screenName(back)} comes back.` : "Your own screen goes away. You can pick it again in Settings.", { title, okLabel: back ? "Undo" : "Use", cancelLabel: "Cancel" }).then(
          (yes) => void (yes && (back ? undoScreen() : pickScreen(DEFAULT_SCREEN))),
          () => {},
        );
      }
      return (onList.current || onApps.current) &&
      yonder.tool<NonNullable<typeof undoing>>("undo", { check: true }, 0).then((u) => {
        if (u.tool === "remove_app") {
          if (!onApps.current || !u.app) return;
          haptic("medium");
          const app = [{ num: 0, name: u.app, status: "done" as const }];
          nativeAsk(`${u.app} comes back.`, { title: u.forever ? "Undo Delete?" : "Undo Archive?", okLabel: "Undo", cancelLabel: "Cancel" }).then((yes) => yes && undoRef.current(), () => setUndoing({ ...u, agents: app }));
          return;
        }
        if (!onList.current) return;
        const to = u.tool === "close_worker" ? "closed" : u.tool === "complete_worker" ? "completed" : "";
        const moved = u.agents.filter((a) => to && tabOf(a as Worker) !== to);
        if (!onList.current || !moved.length) return;
        haptic("medium");
        // The native alert of iOS, as the other questions of the app.
        const title = u.tool === "close_worker" ? "Undo Close?" : "Undo Complete?";
        const text = `${moved.map((a) => (a.num ? `${tagNum(a.num)} · ${a.name}` : a.name)).join(", ")} ${moved.length > 1 ? "go" : "goes"} back as before.`;
        nativeAsk(text, { title, okLabel: "Undo", cancelLabel: "Cancel" }).then((yes) => yes && undoRef.current(), () => setUndoing({ ...u, agents: moved }));
      }, () => {});
    };
  }, []);
  const undoRef = useRef(() => {});
  const undo = (undoRef.current = () => {
    setUndoing(undefined);
    forgetGone();
    haptics(["medium", "heavy"]);
    yonder.tool("undo").then(() => yonder.mice.all().then(showWorkers), (e) => setError((e as Error).message));
    // A deleted app comes back on the next load of the Canvas tab (5 seconds).
  });

  // A two-finger swipe on the trackpad moves one tab, like the pages of an iOS app.
  // A gap of more than 200 ms ends the swipe. The momentum events of the trackpad come
  // closer together, so they do not move a second tab.
  const onWheel = (e: WheelEvent) => {
    // A dialog, such as a picture opened large, is in a portal, but React still sends its events here.
    if (agentOpen.current || (e.target as Element).closest("[role=dialog]")) return;
    const s = swipe.current;
    if (e.timeStamp - s.at > 200) Object.assign(s, { dx: 0, done: false });
    s.at = e.timeStamp;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    // The momentum keeps the direction of its swipe, so a swipe back starts a new swipe at once.
    if (s.done && Math.sign(e.deltaX) !== Math.sign(s.dx)) Object.assign(s, { dx: 0, done: false });
    if (s.done) return;
    s.dx += e.deltaX;
    if (Math.abs(s.dx) < 60) return;
    s.done = true;
    const next = tabBy(Math.sign(s.dx));
    if (next) setTab(next);
  };
  // The tab one step before or after the open tab. One step before the Agents tab is the Projects view, which has no
  // tab in the bar. One step after the Projects view is the Agents tab.
  const tabBy = (step: number) => {
    const i = TABS.indexOf(tab) + step;
    return i === -1 ? "projects" : TABS[i];
  };

  // On the phone, a drag along the tab bar opens the tab under the finger, as the tab bar of iOS. A short swipe
  // that stays on one tab moves one tab in its direction.
  // Only a touch on a tab starts the drag. The flat bar of a style with the glass off goes down to the edge of the
  // screen, so else the swipe up to leave the app starts on the bar under the tabs, and opens the tab over the thumb:
  // the Closed tab, at the right of the middle.
  const onBarStart = (e: ReactTouchEvent) => {
    bar.current = (e.target as Element).closest("[role=tab]") ? { x: e.touches[0].clientX, moved: false } : null;
  };
  const onBarMove = (e: ReactTouchEvent) => {
    const t = e.touches[0];
    const i = [...e.currentTarget.querySelectorAll("[role=tab]")].findIndex((b) => {
      const r = b.getBoundingClientRect();
      return t.clientX >= r.left && t.clientX < r.right;
    });
    if (!bar.current || i < 0 || TABS[i] === tab) return;
    bar.current.moved = true;
    setTab(TABS[i]);
  };
  const onBarEnd = (e: ReactTouchEvent) => {
    const s = bar.current;
    bar.current = null;
    const dx = e.changedTouches[0].clientX - (s?.x ?? 0);
    const next = s && !s.moved && Math.abs(dx) > 30 && TABS[TABS.indexOf(tab) + Math.sign(dx)];
    if (next) setTab(next);
  };

  // On the phone, a swipe to the left or right on a list or on the Projects view moves one tab. An agent row has no swipe
  // of its own, so a swipe on it moves the tab too. A row of the Canvas tab keeps its own swipe, and the
  // tab bar, a text field and an open conversation keep theirs.
  const onPanStart = (e: ReactTouchEvent) => {
    const el = e.target as HTMLElement;
    const skip = e.touches.length > 1 || sheet || !(TABS.includes(tab) || tab === "projects") || el.closest(".tablist, .reach, .app-row, input, textarea, [role=menu]");
    pan.current = skip ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onPanEnd = (e: ReactTouchEvent) => {
    const s = pan.current;
    pan.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    const next = Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy) && tabBy(-Math.sign(dx));
    if (next) setTab(next);
  };

  // A native update of the Mac that waits or loads now: a rebuild of the Mac app, or a new version of a download. A new
  // screen loads by itself and shows no update (src/front.ts), and the phone has no update on the call button: a newer
  // phone app shows only in Settings. No "Update available" shows, so that a change of the screen by voice comes in live.
  const upgrade = !phone && (!!reloading || updating || rebuildMac || !!release);
  // On the phone, an open agent with no call and no update covers the whole screen, and the title bar, the call row and
  // the tab bar stay under it. They move with the list, so a swipe back shows the list as it is after the back, as on
  // iOS. Else the call button pops in after the swipe.
  // On the Mac, an open agent covers the whole window too, also when an update waits: the update shows again on the list.
  // Only a call keeps the title bar and the call row, so that the user can end the call. No tabs, no update and no call
  // button show over it.
  const cover = !!openedAgent && phase === "idle" && (!phone || !upgrade);
  // A computer has no call button: calls are only on the phone. Its call row shows only an update that waits. A call
  // needs no account, so each paired phone has the call button.
  const noCall = phase === "idle" && !upgrade && !phone;
  const idleLabel = unpaired ? "Pair your computer" : copy("call", "Start call");
  // On a paired phone, "Start call" is the small phone button over the tab bar, at the left of New chat, in each style.
  // The call row then shows only a call that is on. A phone with no pairing keeps its one large button, as the first step.
  const smallCall = phone && phase === "idle" && !noCall && !unpaired;
  // The title bar shows the usage of the computer that the Mac picks (farUsage), as on that computer.
  const shownUsage = farPick ? farUsage : claude;
  const weekly = weekLimit(shownUsage);
  const session = (shownUsage.plan ? shownUsage.plan.limits : shownUsage.limits)?.find((l) => l.name === "Current session");
  const usageName = shownUsage.plan?.name ?? "Claude Code";
  // The same button shows in the title bar and in the row of an open agent on the Mac.
  // A start on a profile that is not signed in (ready in bridge/main.ts) gives a toast with Sign in, which opens the page of
  // that profile with its sign-in card.
  const signedOutName = error.match(/^The \w+ did not start: The profile (.+) is not signed in on /)?.[1];
  const signedOut = signedOutName ? clis.clis.find((c) => c.base && c.name === signedOutName) : undefined;
  const toastAction = signedOut ? { label: "Sign in", onClick: () => setSettings(`profile:${signedOut.id}`) } : error === NO_KEY ? { label: "How", onClick: () => openLink(VOICE_DOCS) } : undefined;
  const usageButton = usageBar && weekly && <button className="usage" onClick={() => setSettings("usage")} title={`${usageName}: ${session ? `${session.percent}% of the session, ` : ""}${weekly.percent}% of the week used`}>{session && <span><small>Session</small>{session.percent}%</span>}<span><small>Weekly</small>{weekly.percent}%</span></button>;
  // The favicon of the title: of the open project of the computer that the Mac picks, else of the selected project.
  const titleIcon = farProject ? (
    <LinkOf.Provider value={farPickLink!}>
      <Favicon key={farProject.path} path={farProject.path} />
    </LinkOf.Provider>
  ) : (
    current && current !== ALL && <Favicon key={current.path} path={current.path} />
  );
  const callLabel = phase === "live" ? `${copy("endCall", "End call")} · ${live ? clock(now - live.connectedAt) : "0:00"}${muted ? " · Muted" : ""}` : phase === "connecting" ? "Connecting…" : idleLabel;

  // On the iPhone with iOS 26, the tab bar and the round buttons over it are native Liquid Glass (src/chrome.ts), with
  // the same names, counts and icons as the bar of the page.
  // A style can hide, order and name the tabs (src/look.ts).
  const barTabs = tabsOf(TABS);
  const chromeTabs = barTabs.map((t) => {
    // The Done tab counts all its agents, as the bar of the page.
    // The Canvas tab shows the count of the approvals that wait as a badge, so that it does not read "1 Apps". A native
    // chrome before version 5 has no badge, so it keeps the count in the title.
    if (t === "preview") return { id: t, title: `${needs.length && chromeVersion < 5 ? `${needs.length} ` : ""}${tabTitle(t, "Canvas")}`, icon: TAB_ICON.preview, ...(needs.length && { badge: String(needs.length) }) };
    const n = t in lists && t !== "closed" ? lists[t as keyof typeof lists].length : 0;
    return { id: t, title: `${n ? `${n} ` : ""}${tabTitle(t, t === "search" ? "Search" : TAB_NAME[t])}`, icon: TAB_ICON[t as keyof typeof TAB_ICON] };
  });
  useNativeChrome(chromeTabs, TABS.includes(tab) ? tab : "", (id) => (id === tab ? setOpened("") : setTab(id)));

  // The open conversation. It shows over the list of its tab, and over the results of the Search tab.
  const convoSheet = openedAgent && (
    <div className={`sheet${cover ? " cover" : ""}${returned.current === opened ? " back" : ""}`}>
      {farLink ? (
        // The files, the sites and the tunnel of the paper clip are of the computer in use, so an agent of
        // another computer has none. A pasted or dropped image goes to that computer (attach).
        <LinkOf.Provider value={farLink}>
          <Conversation w={openedAgent} onBack={() => setOpened("")} images={{ paths: attachments, sent: detach, urls: shownUrls, waits }} attached={strip} onSub={setOpenSub} onTalking={setConvoTalking} calling={callOn} sumUp={sumUp} look={convoLook} clis={clis} usage={usageButton} />
        </LinkOf.Provider>
      ) : (
        <Conversation w={openedAgent} onBack={() => setOpened("")} images={{ paths: attachments, sent: detach, urls: shownUrls, places: shownPlaces, waits }} clip={promptClip} talkClip={talkClip} attached={strip} onSub={setOpenSub} onSite={previewOn ? openSite : undefined} onLocal={openLocal} tunnelSuffix={tunnelSuffix} onTalking={setConvoTalking} calling={callOn} sumUp={sumUp} steer={steer} look={convoLook} clis={clis} usage={usageButton} />
      )}
    </div>
  );
  // The results of the Search tab: the agents of all the projects, the best match first.
  const found = find(query, workers.map((w) => ({ w, name: w.name, words: `${w.task} ${w.project} ${w.summary ?? ""} ${w.result.slice(-300)}` }))).map((r) => r.w);

  // The parts of the one front-end API (src/api.ts) that live in the state of the app: the agents (`mice`), the call
  // and the Settings. Each front end, this screen and the pages in a frame, gets them there.
  attachApi({
    workers: () => stateRef.current.workers,
    call: () => ({ phase, since: callRef.current?.connectedAt, muted, available: phone }),
    startCall: () => void toggleCall(),
    endCall: () => void toggleCall(),
    mute: toggleMute,
    openSettings: () => setSettings(true),
    applySettings,
    project: () => ({ name: current?.name ?? ALL.name, path: current?.path ?? ALL.path }),
    attach: attachFor,
    selectProject: (path: string) => (setSelected(list.some((p) => p.path === path) ? path : ALL.path), setTab((t) => (t === "projects" ? "agents" : t))),
  });
  // The front ends hear each change of the agents (`mice`) and the call (src/api.ts).
  useEffect(() => apiChanged("mice"), [workers]);
  useEffect(() => apiChanged("call"), [phase, muted]);
  useEffect(() => apiChanged("project"), [selected, current?.name]);
  if (welcome) return <Welcome onDone={endWelcome} />;
  if (setup) return <Setup ask={setup.ask} connect={<Logins others={others} />} onDone={endSetup} />;
  if (linking) return <Pair onCancel={() => setLinking(false)} />;

  return (
    <main className={dragging ? "dragging" : undefined}>
      <textarea ref={pad} className="pad" tabIndex={-1} aria-hidden />
      {/* The inputs of the attach sheet. They are not in the title bar, because an open agent on the phone hides the
          title bar, and then the Camera button of its attach sheet does nothing. */}
      {phone && (
        <>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
          <input ref={library} type="file" accept="image/*,video/*" multiple hidden onChange={pick} />
        </>
      )}
      <input ref={filePicker} type="file" multiple hidden onChange={pickFiles} />
      {/* On the phone, an open agent hides the title bar: the row of the agent has the back button, the name, the check
          and the three dots. */}
      {/* The phone has no window to move, and its permissions refuse start_dragging (YONDER-9). */}
      {!(phone && openedAgent && !cover) && <div className="titlebar" data-tauri-drag-region={phone ? undefined : ""} inert={cover || undefined}>
          {/* The New agent view of the phone has a back button at the top left. */}
          {phone && drafting && <button className="icon settings" data-native="new-back" data-icon="back" data-glyph="22" onClick={closeNew} title="Back" aria-label={`Back to the ${word.many}`}><Icon name="back" /></button>}
          {/* While the bridge does not answer, the app tries again, and the left of the title bar shows an amber dot and
              "Reconnecting…". After a minute with no answer it shows a red dot and "Offline". Else a small percent used of the
              Claude Code week (all models) shows there, unless the user turns it off in the Usage section of the settings.
              It is a small "74%" under a small "Weekly", after a small "Session" stack, and the New agent view shows no
              percent. A click on it opens the Usage section of the settings. Grok has no session meter, so it shows
              only "Weekly". */}
          <span className="status">
            {!online && !unpaired ? (now - seenRef.current < 60_000 ? <><span className="dot connecting" />Reconnecting…</> : <><span className="dot offline" />Offline</>) : !drafting && usageButton}
          </span>
          {/* The project switcher, in the center: the favicon and the name of the selected project with two small arrows, as
              the pill of a dropdown. A tap opens the whole Projects tab (All projects, the starred projects, then the
              others), and a second tap goes back. The pages of an own screen get the same switch as <y-projects> of the kit
              (src/OwnScreen.tsx). */}
          <h1 className="title">
            {/* The New agent view of All projects says "New agent" in place of "All projects". */}
            {drafting ? (
              <>
                {titleIcon}
                {farProject?.name ?? (current === ALL ? `New ${word.one}` : current?.name)}
              </>
            ) : phone ? (
              // On the phone the project and the environment are two buttons of the size of Settings, with only an icon,
              // so they fit beside the usage. The project shows its favicon, else the folder. The environment opens its
              // choices in the card from the bottom.
              <>
                <button className="icon" aria-expanded={tab === "projects"} aria-label={`Workspace: ${current?.name ?? "none"}. ${tab === "projects" ? "Close" : "Show"} the workspaces`} onClick={() => setTab(tab === "projects" ? "agents" : "projects")}>
                  {titleIcon}
                  <Icon name="folder" />
                </button>
                {envs.length > 0 && (
                  <button className="icon" data-native="environment" data-icon="monitor" data-glyph="20" aria-label={`Environment: ${envOptions.find((o) => o.value === envShown)?.label}`} onClick={() => setEnvPicking(true)}>
                    <Icon name="monitor" />
                  </button>
                )}
                {/* Mine or Everyone, only when two people or more share this computer (docs/multi-user.md). */}
                {people.length > 1 && (
                  <button className="icon" aria-label={`Tasks: ${SCOPES.find((o) => o.value === scope)?.label}`} onClick={() => setScopePicking(true)}>
                    <Icon name={scope === "all" ? "users" : "user"} />
                  </button>
                )}
              </>
            ) : (
              <button
                className="select"
                aria-expanded={tab === "projects"}
                aria-label={`Workspace: ${farProject?.name ?? current?.name ?? "none"}. ${tab === "projects" ? "Close" : "Show"} the workspaces`}
                onClick={() => setTab(tab === "projects" ? "agents" : "projects")}
              >
                {titleIcon}
                <span>{farProject?.name ?? (current === ALL ? copy("title", ALL.name) : current?.name)}</span>
                <Icon name="chevrons" size={14} />
              </button>
            )}
            {!drafting && !phone && envs.length > 0 && <Dropdown align="center" value={envShown} onChange={pickEnv} options={envOptions} />}
            {/* Mine or Everyone, only when two people or more share this computer (docs/multi-user.md). */}
            {!drafting && !phone && people.length > 1 && <Dropdown align="center" value={scope} onChange={pickScope} options={SCOPES} />}
          </h1>
          {scopePicking && (
            <Picker label="Tasks" className="project-picker" onClose={() => setScopePicking(false)}>
              <div className="project-list">
                {SCOPES.map((o) => (
                  <button key={o.value} aria-current={o.value === scope || undefined} onClick={() => (setScopePicking(false), pickScope(o.value))}>
                    {o.label}
                    {o.value === scope && <Icon name="tick" />}
                  </button>
                ))}
              </div>
            </Picker>
          )}
          {envPicking && (
            <Picker label="Environment" className="project-picker" onClose={() => setEnvPicking(false)}>
              <div className="project-list">
                {envOptions.map((o) => (
                  <button key={o.value} aria-current={o.value === envShown || undefined} onClick={() => (setEnvPicking(false), pickEnv(o.value))}>
                    {o.label}
                    {o.value === envShown && <Icon name="tick" />}
                  </button>
                ))}
              </div>
            </Picker>
          )}
          {/* A new agent without a call: it opens on the Agents tab, and the user says the task. The Free plan has
              no calls, so the + button lets the user start agents without the voice. The button shows a
              microphone, because the user talks to start the agent. */}
          {!phone && !talkView && <button className="icon" onClick={() => newAgent(true)} disabled={!online} title="New chat" aria-label="New chat"><Icon name="message" /></button>}
          {!phone && !talkView && <button className="icon" onClick={() => newAgent()} disabled={!online} title={`New ${word.one}`} aria-label={`New ${word.one}`}><Icon name="mic" /></button>}
          {/* The main screen has no paper clip. A file goes with a message, so a paper clip is only in a conversation and
              in the New agent view: an attach before the start of the agent is odd. */}
          {/* The phone has no menu bar, so its settings open from the top right, with a glyph of 18 px. */}
          {/* The switch of the Canvas tab between the list and the grid (yonder.settings, appsView). */}
          {tab === "preview" && !drafting && (
            <button
              className="icon"
              data-native="apps-view"
              data-icon={appsGrid ? "list" : "grid"}
              data-symbol={appsGrid ? "list.bullet" : "square.grid.2x2"}
              data-glyph="20"
              onClick={() => void yonder.settings.set("appsView", appsGrid ? "list" : "grid")}
              title={appsGrid ? "List" : "Grid"}
              aria-label={appsGrid ? "Show the apps as a list" : "Show the apps as a grid"}
            >
              <Icon name={appsGrid ? "list" : "grid"} size={phone ? 18 : 16} />
            </button>
          )}
          {(!phone || !drafting) && <button className="icon" data-native="settings" data-icon="settings" data-glyph="20" onClick={() => setSettings(true)} title="Settings" aria-label="Settings"><Icon name="settings" size={phone ? 18 : 16} /></button>}
          {/* The theme is in the settings, also on the phone. */}
      </div>}

      {/* The rail of a style with rail "starred" (src/look.ts): All projects, then Yonder and the starred projects, one icon
          each, as the servers of Discord. A tap selects the project. A project with no favicon shows its first letter.
          The phone hides it while an agent or the New agent view is open. */}
      {look.look.look?.rail === "starred" && !(phone && sheet) && (
        <nav className="rail" aria-label="Starred workspaces" inert={cover || undefined}>
          {order.map((p) => (
            <button key={p.path} aria-label={p.name} aria-current={p.path === selected || undefined} onClick={() => goProject(p)}>
              {projectMark(p)}
            </button>
          ))}
        </nav>
      )}
      {switching !== undefined && order[switching] && (
        <div className="switcher" role="listbox" aria-label="Workspaces">
          <div className="switcher-row">
            {order.map((p, i) => (
              <button key={p.path} role="option" aria-selected={i === switching} aria-label={p.name} onMouseDown={(e) => e.preventDefault()} onClick={() => (goProject(p), setSwitching(undefined))}>
                {projectMark(p)}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* During a call, a round button at the right of "End call" mutes and unmutes the microphone. */}
      {/* An open conversation or call shrinks the row, so that the conversation gets more space. On the phone, an open
          agent hides the row, unless a call is on or an update waits. */}
      {(cover || !talkView) && !noCall && !smallCall && <div className={`callrow${(tab === "calls" ? openedCall : tab === "projects" ? scrolled && !filter : current && sheet && !cover) ? " small" : ""}`} inert={cover || undefined}>
        {/* With no call, the white call button itself shows an update that waits, and a click gets the update. */}
        {upgrade && phase === "idle" ? (
          <button
            className="call idle updating"
            onClick={update}
            disabled={!!reloading || updating}
            title={behind > 0 ? `Update to ${source}: ${behind} new ${behind === 1 ? "commit" : "commits"}` : undefined}
          >
            <span className={reloading || updating ? "spin" : undefined}><Icon name="refresh" /></span>
            <span>{reloading ? `Updating to ${reloading}…` : updating ? "Updating…" : "Update available"}</span>
          </button>
        ) : (
        <button
          className={`call ${phase}${upgrade ? " round" : ""}`}
          onClick={() => toggleCall()}
          disabled={!online || phase === "connecting"}
          title={upgrade ? callLabel : undefined}
          aria-label={upgrade ? callLabel : undefined}
        >
          {/* Each "·" of "End call · 0:42 · Muted" is lifted to the middle of the capitals and the digits: in SF Pro it
              sits at the middle of the small letters, about 1 px low. */}
          {upgrade ? <Icon name="phone" size={20} /> : <span>{callLabel.split(" · ").flatMap((part, i) => (i ? [" ", <i key={i} className="sep">·</i>, " ", part] : [part]))}</span>}
          {live && !upgrade && <Levels levels={live.levels} />}
        </button>
        )}
        {/* During a call, an update that waits shrinks the call button to a circle, and this blue button takes its
            place. A click ends the call, and a new front end loads after the end of the call. Else the click does the
            same as the update button. Then it says "Updating…" until the new version loads. */}
        {upgrade && phase !== "idle" && (
          <button
            className="update"
            disabled={!!reloading || updating}
            title={behind > 0 ? `Update to ${source}: ${behind} new ${behind === 1 ? "commit" : "commits"}` : undefined}
            onClick={update}
          >
            <span className={reloading || updating ? "spin" : undefined}><Icon name="refresh" /></span>
            <span>{reloading ? `Updating to ${reloading}…` : updating ? "Updating…" : "Update available"}</span>
          </button>
        )}
        {phase === "live" && (
          <button className={`mute${muted ? " on" : ""}`} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute (M)" : "Mute (M)"}>
            <Icon name={muted ? "micOff" : "mic"} size={22} />
          </button>
        )}
      </div>}
      {/* The talk views of a new agent and of a reply show the images under the words, so the row is not also at the top.
          Both talk views show them in the same way. */}
      {!drafting && !(openedAgent && convoTalking) && strip}
      {/* An error is a toast over the screen. */}
      {error && <Toast key={error} text={signedOut ? `${signedOut.name} is not signed in.` : error} action={toastAction} onClose={() => setError("")} />}
      {/* An own screen over the whole default screen, and the bar of a preview (src/look.ts). */}
      {look.look.kind === "screen" && (
        <OwnScreen id={look.id} look={look.look} mode={shownTheme} />
      )}
      {/* An attached picture: in the viewer of the chat after a tap, and large over the screen while a hold lasts. */}
      <Dialog.Root open={!!big} onOpenChange={(o) => !o && setBig(undefined)}>
        <Dialog.Portal>
          <Dialog.Popup
            className="viewer"
            aria-label="Attached image"
            onKeyDown={(e) => {
              const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
              if (dir && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) (e.preventDefault(), stepPic(dir));
            }}
          >
            <Zoom src={big} onClose={() => setBig(undefined)} onStep={stepPic}>
              {(style) => <img src={big} alt="" draggable={false} style={style} />}
            </Zoom>
            <Dialog.Close className="icon viewer-close" aria-label="Close the picture" title="Close"><Icon name="x" /></Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      {peek && createPortal(<div className="peek" aria-hidden><img src={peek} alt="" /></div>, document.body)}
      <PreviewBar />
      <AskHost />
      <NewTaskHost notice={setError} label={(mode, model) => `${modeName(mode)} · ${model === "auto" ? "Auto model" : modelName(model)}`} />

      <Tabs.Root className="tabs" data-slide={slide.dir || undefined} value={tab} onValueChange={(value) => setTab(String(value))} onWheel={onWheel} {...(phone && { onTouchStart: onPanStart, onTouchEnd: onPanEnd, onTouchCancel: () => (pan.current = null) })}>
        {/* A click on the tab that is open goes back from a conversation or a call to the list. */}
        {/* On the phone, the tabs are a glass bar at the bottom, with an icon over each name. */}
        <Tabs.List
          className="tablist"
          inert={cover || undefined}
          // On the Mac, an open conversation hides the tabs. Not with a :has() rule of app.css: WebKit sometimes keeps them
          // hidden after the conversation closes, and the user sees an empty Done tab with no tabs.
          hidden={(!phone && !!openedAgent && TABS.includes(tab) && tab !== "preview" && (tab === "search" || !!current)) || undefined}
          activateOnFocus
          loopFocus={false}
          onClick={(e) => (e.target as HTMLElement).closest('[aria-selected="true"]') && setOpened("")}
          {...(phone && { onTouchStart: onBarStart, onTouchMove: onBarMove, onTouchEnd: onBarEnd })}
        >
          {LISTS.filter((t) => barTabs.includes(t)).map((t) => {
            // The Done tab counts all its agents, as "2 Done", in a plain color.
            // With another computer picked in the environment dropdown, the count is of its agents.
            const n = t === "closed" ? 0 : showHere ? lists[t].length : others.flatMap(farWs).filter((w) => tabOf(w) === t).length;
            const count = n > 0 && n;
            return (
              <Tabs.Tab key={t} value={t} style={{ order: barTabs.indexOf(t) }}>
                {phone && <Icon name={TAB_ICON[t]} size={24} />}
                {/* The count is in front of the name, as "2 Agents". The Closed tab is a trash bin, so it shows no
                    count. */}
                {/* One span, so the count and the name stay on one line under the icon of the phone. */}
                <span>
                  {count && <>{count} </>}
                  {tabTitle(t, TAB_NAME[t])}
                </span>
              </Tabs.Tab>
            );
          })}
          {/* A dot when approvals wait: "1 Apps" would read as one app. */}
          {barTabs.includes("preview") && <Tabs.Tab value="preview" style={{ order: barTabs.indexOf("preview") }}>
            {phone && <Icon name={TAB_ICON.preview} size={24} />}
            <span>
              {tabTitle("preview", "Canvas")}
              {needs.length > 0 && <i className="tab-dot" aria-label={`${needs.length} waiting`} />}
            </span>
          </Tabs.Tab>}
          {barTabs.includes("search") && <Tabs.Tab value="search" style={{ order: barTabs.indexOf("search") }}>
            {phone && <Icon name={TAB_ICON.search} size={24} />}
            {tabTitle("search", "Search")}
          </Tabs.Tab>}
          {/* The Projects and Calls views have no tab in the bar, so the bar then shows no selected tab. */}
          {TABS.includes(tab) && <Tabs.Indicator className="indicator" />}
        </Tabs.List>
        {/* On the phone, the + button is a round glass button that floats above the right end of the tab bar. A tap
            opens the New agent view, which listens at once. At its left, a smaller glass button opens a new chat. The
            paper clips of a conversation and of the New agent view open the attach sheet: the recent photos, then one
            row that scrolls: Camera, Photos, File, Paste, Location and Version. */}
        {phone && <AttachSheet open={attaching} onClose={() => setAttaching(false)} actions={attachActions} />}
        {/* A phone with no pairing has no computer to give a new agent to, so these buttons wait for a pairing. */}
        {phone && !unpaired && (
          <div className="reach" inert={cover || undefined}>
            {smallCall && (
              <button className="glass-plus small" data-native="call" data-icon="phone" data-glyph="20" onClick={() => toggleCall()} disabled={!online} title={idleLabel} aria-label={idleLabel}>
                <Icon name="phone" size={20} />
              </button>
            )}
            <button className="glass-plus small" data-native="new-chat" data-icon="message" data-glyph="20" onClick={() => newAgent(true)} disabled={!online} title="New chat" aria-label="New chat">
              <Icon name="message" size={20} />
            </button>
            <button className="glass-plus" data-native="new" data-icon="mic" data-glyph="26" onClick={() => newAgent()} disabled={!online} title={`New ${word.one}`} aria-label={`New ${word.one}`}>
              <Icon name="mic" size={26} />
            </button>
          </div>
        )}

        <Tabs.Panel className="panel" value="projects">
          <ul
            className="projects"
            onScroll={(e) => {
              const el = e.currentTarget;
              const top = el.scrollTop;
              // A list that the hide would make fit stays as it is, or the hide and the scroll to the top go on and on.
              // The check is only for the hide: a hidden search makes the list taller, and a scroll up must still show it.
              if (!scrolled && el.scrollHeight - el.clientHeight < 80) return;
              // At the bottom, the list grows when the search hides, and the browser moves it up. That is not a scroll up.
              if (top > 0 && (top >= el.scrollHeight - el.clientHeight - 1 || Math.abs(top - lastTop.current) < 8)) return;
              setScrolled(top > lastTop.current && top > 0);
              lastTop.current = top;
            }}
          >
            {/* The search is the first row of the list, so its hide does not change the size of the list. */}
            <li className={`tools${scrolled && !filter ? " hidden" : ""}`}>
              <input placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search workspaces" />
              {/* While the search has text, the plus is an X that clears it. */}
              {filter ? (
                <button className="add" data-native="clear-projects" data-icon="x" data-glyph="20" onClick={() => setFilter("")} title="Clear" aria-label="Clear search">
                  <Icon name="x" size={20} />
                </button>
              ) : (
                <button className="add" data-native="add-folder" data-icon="plus" data-glyph="20" onClick={addFolder} title="Add folder" aria-label="Add folder">
                  <Icon name="plus" size={20} />
                </button>
              )}
            </li>
            {hereOn && shown.map((p) => (
              <Fragment key={p.path}>
              {farShown.length > 0 && p === firstHere && <li className="list-title">{hereName || HERE}</li>}
              <ContextMenu.Root disabled={outside.includes(p) || p === ALL}>
              <ContextMenu.Trigger
                render={<li />}
                title={p.path}
                className={[p.path === selected && "selected", p.path === moving && "moving", p === rest && "rest"].filter(Boolean).join(" ") || undefined}
                // Drag a starred project to put it in a new place.
                draggable={movable(p)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", p.path);
                  setMoving(p.path);
                }}
                onDragOver={(e) => {
                  if (!moving || !movable(p)) return;
                  e.preventDefault();
                  moveStar(moving, p.path);
                }}
                onDragEnd={() => {
                  setMoving("");
                  saveOrder();
                }}
              >
                <button
                  className="pick"
                  onClick={() => {
                    setSelected(p.path);
                    setTab("agents");
                  }}
                >
                  {p === ALL ? (
                    <Icon name="folder" size={phone ? 20 : 16} />
                  ) : (
                    <Favicon path={p.path} draggable={false} loading="lazy" />
                  )}
                  <span className="label">
                    {p.name}
                    {p.profile && <small>{p.profile}</small>}
                  </span>
                  <Counts agents={groups.get(p.path) ?? []} />
                </button>
                {!outside.includes(p) && p !== ALL && (
                  <Toggle className="star" pressed={p.starred} onPressedChange={(on) => star(p, on)} aria-label={`Star ${p.name}`}>
                    <Icon name="star" filled={p.starred} />
                  </Toggle>
                )}
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Positioner className="menu-layer">
                  <ContextMenu.Popup className="menu">
                    <ContextMenu.Item className="menu-item" onClick={() => setProfiling(p)}>
                      Profile…
                    </ContextMenu.Item>
                    {!p.pinned && (
                      <ContextMenu.Item className="menu-item" onClick={() => removeFolder(p)}>
                        Remove workspace
                      </ContextMenu.Item>
                    )}
                  </ContextMenu.Popup>
                </ContextMenu.Positioner>
              </ContextMenu.Portal>
              </ContextMenu.Root>
              </Fragment>
            ))}
            {farShown.map((o) => (
              <Fragment key={o.mac}>
                <li
                  className={`list-title archived-title${farOpen.includes(o.mac) || filter || o.mac === farPick ? " open" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={farOpen.includes(o.mac) || !!filter || o.mac === farPick}
                  onClick={() => setFarOpen((m) => (m.includes(o.mac) ? m.filter((x) => x !== o.mac) : [...m, o.mac]))}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), e.currentTarget.click())}
                >
                  {o.name}
                  <Icon name="down" size={14} />
                </li>
                {/* The Mac shows the projects of the computer that it picks open, with All projects of that computer first. */}
                {o.mac === farPick && (
                  <li className={!farProject ? "selected" : undefined}>
                    <button className="pick" onClick={() => void openFar(o.mac, "")}>
                      <Icon name="folder" size={16} />
                      <span className="label">{ALL.name}</span>
                      <Counts agents={o.ws} />
                    </button>
                  </li>
                )}
                {(farOpen.includes(o.mac) || filter || o.mac === farPick) && (
                  <LinkOf.Provider value={linkTo(o.mac)}>
                    {o.ps.map((p) => (
                      <li key={p.path} title={p.path} className={o.mac === farPick && p === farProject ? "selected" : undefined}>
                        <button className="pick" onClick={() => void openFar(o.mac, p.path)}>
                          <Favicon path={p.path} draggable={false} loading="lazy" />
                          <span className="label">{p.name}</span>
                          <Counts agents={agentsOf(p, o.projects!, o.ws)} />
                        </button>
                      </li>
                    ))}
                  </LinkOf.Provider>
                )}
              </Fragment>
            ))}
          </ul>
        </Tabs.Panel>

        {LISTS.map((t) => (
          <Tabs.Panel key={t} className="panel" value={t}>
            {t === "agents" && <Logins others={others} />}
            {!current ? (
              <Empty title="No workspace">Tap the name at the top to select a workspace.</Empty>
            ) : (
              <>
                {/* On the phone, the list stays under the conversation, so the swipe back shows it, as on iOS. */}
                {(phone || !(t === tab && sheet)) && (
                  <>
                    {(!showHere || lists[t].length === 0) &&
                      !(current === ALL && farIn(t)) &&
                      (t === "agents" && unpaired ? (
                        <Empty art="agents" title="No computer yet">
                          Pair your computer to see its {word.many}.
                        </Empty>
                      ) : t === "agents" ? (
                        <Empty art="agents" title="All quiet">
                          No {word.many} at work in {current.name}. {phone ? "Start a call, or click" : "Click"} the microphone for a new {word.one}.
                        </Empty>
                      ) : t === "completed" ? (
                        <Empty art="completed" title="All caught up">
                          No completed {word.many} in {current.name}.
                        </Empty>
                      ) : t === "saved" ? (
                        <Empty art="closed" title="Nothing saved">
                          No saved {word.many} in {current.name}.
                        </Empty>
                      ) : (
                        <Empty art="closed" title="Nothing in here">
                          No closed {word.many} in {current.name}.
                        </Empty>
                      ))}
                    <div
                      className="list"
                      inert={(t === tab && !!sheet) || undefined}
                      onDragOver={(e) => {
                        const p = dropOf(e);
                        setDropOn(p?.path ?? "");
                        if (p) e.preventDefault(), (e.dataTransfer.dropEffect = "move");
                      }}
                      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropOn("")}
                      onDrop={(e) => {
                        const p = dropOf(e);
                        if (p && dragged) e.preventDefault(), moveAgent(dragged, p);
                        // The moved row leaves its group, so it gets no dragend.
                        dragged = undefined;
                        setDropOn("");
                      }}
                      onDragEnd={() => setDropOn("")}
                    >
                      {/* All projects puts the agents under a title for each project, in the order of the Projects tab.
                          The Closed tab keeps the order of the closes (byClose). When agents of another computer show
                          too, each title names its computer first, as "Studio · sundial". */}
                      {(!showHere
                        ? []
                        : current === ALL
                        ? t === "closed"
                          ? byClose(lists.closed)
                          : list.slice(1).map((p) => ({ p, ws: lists[t].filter((w) => projectOf.get(w.id) === p.path) })).filter((g) => g.ws.length)
                        : [{ p: current, ws: lists[t] }]
                      ).map(({ p, ws }) => (
                        <Fragment key={ws[0] ? keyOf(ws[0]) : p.path}>
                          {current === ALL && (
                            <div className={p.path === dropOn ? "list-title drop" : "list-title"} data-project={p.path}>
                              <Favicon path={p.path} loading="lazy" />
                              {farIn(t) && `${hereName || HERE} · `}
                              {p.name}
                            </div>
                          )}
                          {ws.map((w) => (
                            <WorkerRow key={keyOf(w)} w={w} now={now} leaving={w.id === leaving?.id} onOpen={() => setOpened(w.id)} moves={movesOf(w)} />
                          ))}
                        </Fragment>
                      ))}
                      {/* The other computers of the phone, each under its name. A computer with no answer does not show
                          here: the Environment section of the Settings marks it "Offline". */}
                      {current === ALL && t !== "closed" &&
                        others.map((o) => {
                          const ws = farWs(o).filter((w) => tabOf(w) === t);
                          if (!ws.length) return null;
                          return (
                            <LinkOf.Provider key={o.mac} value={linkTo(o.mac)}>
                              {[...new Set(ws.map((w) => w.project))].map((name) => (
                                <Fragment key={name}>
                                  <div className="list-title">
                                    {/* shortcut: an agent in a worktree has no project path here, so its title has no favicon; take the path from list_projects if it matters. */}
                                    <Favicon path={ws.find((w) => w.project === name)!.path} loading="lazy" />
                                    {o.name} · {name}
                                  </div>
                                  {ws.filter((w) => w.project === name).map((w) => <ElsewhereRow key={`${o.mac}/${w.id}`} w={w} onOpen={() => setOpened(`@${o.mac} ${w.id}`)} />)}
                                </Fragment>
                              ))}
                            </LinkOf.Provider>
                          );
                        })}
                    </div>
                    {t === "closed" && emptyClosed()}
                  </>
                )}
                {t === tab && convoSheet}
                {t === tab && drafting && (
                  <div className="sheet fade">
                    <NewAgent
                      typed={typed}
                      onTalk={() => (warmMic(), setTyped(false))}
                      project={current}
                      far={farPickLink && { link: farPickLink, name: envs.find((c) => c.mac === farPick)?.name ?? farPick, project: farProject }}
                      onBack={closeNew}
                      onFail={setError}
                      // The paper clip gives files of this Mac, so an agent of another computer gets only a pasted or dropped image, as in its chat.
                      images={{ paths: attachments, sent: detach, waits }}
                      attached={strip}
                      clip={!farPickLink && talkClip}
                      promptClip={!farPickLink && promptClip}
                      calling={callOn}
                      model={agentModel}
                      mode={agentMode}
                      clis={clis}
                    />
                  </div>
                )}
              </>
            )}
          </Tabs.Panel>
        ))}

        {/* The Canvas tab (src/Canvas.tsx): the search, the approvals that
            wait, then one list of the pages of the agents and the web sites of each computer, the starred ones first, then
            the newest first. A tap on a site opens it: the phone shows it in a browser inside Yonder, and the Mac in its
            own browser. A star keeps an item at the top, and the search always shows. */}
        <Tabs.Panel className="panel" value="preview">
          {(() => {
            const q = siteFilter.trim().toLowerCase();
            const has = (...words: (string | number | undefined)[]) => !q || words.join(" ").toLowerCase().includes(q);
            const here = !siteMac || siteMac === siteHere?.mac;
            const far = farSites.filter((f) => (!siteMac || f.mac === siteMac) && farOn(f.mac));
            const now = Date.now();
            const when = (at: number) => (now - at < 60_000 ? "now" : `${ago(now - at)} ago`);
            const apps: { key: string; at: number; saved: boolean; row: (i: number) => ReactNode }[] = [];
            if (here)
              for (const a of pages.filter((x) => !x.archived && has(x.title))) {
                const by = workers.find((w) => w.id === a.worker);
                const who = a.call && !a.worker ? "Your call" : by ? callName(by, workers) : a.num ? callName({ num: a.num, project: "" }) : "";
                apps.push({
                  key: `page/${a.id}`,
                  at: a.at,
                  saved: !!a.saved,
                  row: (i) => (
                    <AppRow key={`page/${a.id}`} id={`page/${a.id}`} i={i} title={a.title} sub={[who, when(a.at)].filter(Boolean).join(" · ")} icon={<AppIcon icon={a.icon} name={a.title} />} saved={!!a.saved} fresh={a.at > pagesSeen} act={pageActs(a)} grid={appsGrid} onOpen={() => showArtifact({ path: a.path, title: a.title })} />
                  ),
                });
              }
            // A site looks as an app: its favicon, its name, and a second line with its computer, its agent and the start
            // of its server. The name is the name of the user, else the name from Haiku, else the title of its page, else
            // its port, or the host of an added address. It has no switch: its tunnel opens when the user opens it, and
            // ends when nobody uses it (IDLE in bridge/preview.ts). A site that the user deleted hides until its server
            // starts again (remove_app).
            const siteName = (s: Site) => s.name ?? s.auto ?? (s.title || (!s.url || isLocal(s.url) ? `:${s.port}` : s.project));
            const siteRow = (s: Site, i: number, key: string, onOpen: () => void, mac?: string, where?: string, root?: string) => (
              <AppRow
                key={key}
                id={key}
                i={i}
                title={siteName(s)}
                sub={[where, s.num ? callName({ num: s.num, project: "" }) : "", s.seen ? when(s.seen) : ""].filter(Boolean).join(" · ")}
                icon={
                  <AppIcon icon={s.icon} name={siteName(s)}>
                    {/* The favicon of the project of the site, over the letter, which shows when the site has no favicon. */}
                    {root && <Favicon className="fav" path={root} loading="lazy" onError={(e) => (e.currentTarget.parentElement!.dataset.failed = "")} />}
                  </AppIcon>
                }
                saved={!!s.saved}
                act={siteActs(s, mac)}
                grid={appsGrid}
                onOpen={onOpen}
              />
            );
            // On the Mac a site of this computer opens in the viewer of the apps, from localhost, with no tunnel. A site
            // that does not let a frame show it, or an address of another host, opens in the browser of the Mac. The
            // phone opens it in the browser inside Yonder, through its tunnel: in a frame, the phone would block the
            // cookie of the tunnel.
            const openHere = (s: Site) =>
              !phone && s.frame !== false && (!s.url || isLocal(s.url))
                ? showArtifact({ path: s.url ?? `http://localhost:${s.port}`, title: siteName(s) })
                : openSite({ worker: s.label }).catch((e) => setError(`Yonder cannot open the site: ${(e as Error).message}`));
            if (here && previewOn)
              for (const s of (sites ?? []).filter((x) => has(x.name, x.auto, x.label, x.title, x.project, `:${x.port}`)))
                apps.push({
                  key: `site/${s.label}`,
                  at: s.seen ?? 0,
                  saved: !!s.saved,
                  row: (i) =>
                    siteRow(s, i, `site/${s.label}`, () => void openHere(s), undefined, farSites.length ? siteHere?.name : undefined,
                      // A site can run in a worktree or a sub-folder of its project.
                      list.filter((p) => s.path === p.path || s.path.startsWith(`${p.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]?.path),
                });
            for (const f of far)
              for (const s of f.sites.filter((x) => has(x.name, x.auto, x.label, x.title, x.project, `:${x.port}`, f.name)))
                apps.push({
                  key: `${f.mac}/${s.label}`,
                  at: s.seen ?? 0,
                  saved: !!s.saved,
                  row: (i) => siteRow(s, i, `${f.mac}/${s.label}`, () => showSite({ worker: s.label }, ask, undefined, true, reach(f.mac).call).catch((e) => setError(`Yonder cannot open the site: ${(e as Error).message}`)), f.mac, f.name),
                });
            apps.sort((x, y) => Number(y.saved) - Number(x.saved) || y.at - x.at);
            // The archive, under the apps and closed at first: the newest archive first.
            const old = here ? pages.filter((x) => x.archived && has(x.title)).sort((x, y) => y.archived! - x.archived!) : [];
            const oldRow = (a: Artifact, i: number) => (
              <AppRow key={`old/${a.id}`} id={`page/${a.id}`} i={i} title={a.title} sub={when(a.archived!)} icon={<AppIcon icon={a.icon} name={a.title} />} saved={false} archived grid={appsGrid} act={pageActs(a)} onOpen={() => showArtifact({ path: a.path, title: a.title })} />
            );
            const inGrid = (rows: ReactNode[]) => (appsGrid ? <div className="app-grid">{rows}</div> : rows);
            const address = isAddress(siteFilter) ? siteFilter.trim() : "";
            return (
              <>
                <div className="list apps">
                  {/* The search always shows, as the first part of the list, sticky at its top, so the page keeps its
                      height and the tab bar never moves. Else the search above the list pushes the tab bar under the
                      corners of the iPhone. */}
                  <div className="search-wrap">
                    <div className="add-site">
                      <input
                        placeholder="Search, or localhost:3000"
                        value={siteFilter}
                        onChange={(e) => setSiteFilter(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setSiteFilter("");
                          else if (e.key === "Enter" && isAddress(siteFilter)) addTyped();
                        }}
                        aria-label="Search the apps, or add an address"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="go"
                      />
                      {farSites.length > 0 && (
                        <Dropdown
                          value={siteMac}
                          onChange={setSiteMac}
                          options={[{ value: "", label: "All" }, ...(siteHere ? [{ value: siteHere.mac, label: siteHere.name }] : []), ...farSites.map((f) => ({ value: f.mac, label: f.name }))]}
                        />
                      )}
                      {siteFilter && (
                        <button className="add" data-native="clear-sites" data-icon="x" data-glyph="20" onClick={() => setSiteFilter("")} title="Clear" aria-label="Clear the search">
                          <Icon name="x" size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                  {!apps.length && !needs.length && !old.length && !q && <Empty title="Nothing yet">Ask {swap("an agent")} for a page, such as the weather in Paris.</Empty>}
                  {needs.length > 0 && (
                    <>
                      <div className="list-title">
                        Needs you<span>{needs.length}</span>
                      </div>
                      {needs.map((w) => (
                        <AskRow key={w.ask!.id} w={w} who={callName(w, workers)} review={() => review(w.ask!.id)} />
                      ))}
                      {apps.length > 0 && <div className="list-title">Canvas</div>}
                    </>
                  )}
                  {address && (
                    <div className="worker row app-row" role="button" tabIndex={0} onClick={addTyped} onKeyDown={(e) => e.key === "Enter" && addTyped()}>
                      <AppIcon icon="plus" name={address} />
                      <span className="name app-add">Open {address}</span>
                      <span className="what">Adds it to the Canvas</span>
                    </div>
                  )}
                  {inGrid(apps.map((x, i) => x.row(i)))}
                  {old.length > 0 && (
                    <button className={`list-title archived-title${showArchived ? " open" : ""}`} onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>
                      Archived<span>{old.length}</span>
                      <Icon name="down" size={14} />
                    </button>
                  )}
                  {old.length > 0 && showArchived && inGrid(old.map(oldRow))}
                  {/* A computer with its Tunnel off has no sites to show, so the list names it with "Off". A site of
                      another computer names its computer in its second line. */}
                  {[...(here && !previewOn && farSites.length && siteHere ? [{ mac: siteHere.mac, name: siteHere.name }] : []), ...far.filter((f) => !f.on)].map((f) => (
                    <div key={`off/${f.mac}`} className="list-title">
                      {f.name} · Off
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </Tabs.Panel>

        <Tabs.Panel className="panel" value="search">
          {(phone || !openedAgent) && (
            <>
              {/* The field looks like the search of the Projects view. */}
              <div className="tools">
                <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${word.many}`} autoFocus={!phone} />
                {query && (
                  <button className="add" data-native="clear-search" data-icon="x" data-glyph="20" onClick={() => setQuery("")} title="Clear" aria-label="Clear search">
                    <Icon name="x" size={20} />
                  </button>
                )}
              </div>
              {query.trim().length > 1 && found.length === 0 && <Empty title={`No ${word.many}`}>No {word.one} matches "{query.trim()}".</Empty>}
              <div className="list" inert={!!openedAgent || undefined}>
                {found.map((w) => (
                  <WorkerRow key={keyOf(w)} w={w} now={now} onOpen={() => setOpened(w.id)} moves={movesOf(w)} />
                ))}
              </div>
            </>
          )}
          {tab === "search" && convoSheet}
        </Tabs.Panel>

        <Tabs.Panel className="panel" value="calls">
          {(phone || !openedCall) && (
            <>
              {calls.length === 0 && (
                <Empty art="calls" title="No calls yet">
                  The transcript of each call shows here.
                </Empty>
              )}
              <div className="list" inert={!!openedCall || undefined}>
                {calls.map((c) => (
                  <CallRow key={c.id} c={c} onOpen={() => setOpened(String(c.id))} />
                ))}
              </div>
            </>
          )}
          {openedCall && (
            <div className="sheet">
              <CallView c={openedCall} onBack={() => setOpened("")} />
            </div>
          )}
        </Tabs.Panel>
      </Tabs.Root>
      {pairing && <PairPhone onClose={() => setPairing(false)} />}
      {picking && <FolderPicker onClose={(added) => (setPicking(false), added && addProject("add_project", { path: added }, added))} />}
      {profiling && <ProfilePicker p={profiling} clis={clis} onPick={(name) => setProjectProfile(profiling, name)} onClose={() => setProfiling(undefined)} />}
      {asking && (
        <Dialog.Root open onOpenChange={(o) => !o && (asking.done(false), setAsking(undefined))}>
          <Dialog.Portal>
            <Dialog.Backdrop className="dialog-backdrop" />
            <Dialog.Popup className="dialog">
              <Dialog.Title className="dialog-title">{asking.c.off ? `Open ${asking.c.port ? `port ${asking.c.port}` : asking.c.label} on this phone?` : `Open ${asking.c.project} on this phone?`}</Dialog.Title>
              <Dialog.Description className="dim">
                {asking.c.off
                  ? `The Tunnel is off. Yonder turns it on and opens ${asking.c.port ? `port ${asking.c.port}` : asking.c.label} through its private tunnel. Only you can open the address.`
                  : `Yonder opens ${asking.c.title || asking.c.label}, port ${asking.c.port}, through its private tunnel. Only you can open the address.`}
              </Dialog.Description>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Dialog.Close>Cancel</Dialog.Close>
                <button onClick={() => (asking.done(true), setAsking(undefined))}>{asking.c.off ? "Turn on and open" : "Open"}</button>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {asker?.ask && (
        <Approval
          key={asker.ask.id}
          w={asker}
          who={callName(asker, workers)}
          answer={({ allow, ...more }) => reply(asker.ask!.id, allow, more)}
          later={() => setLater((l) => [...l, asker.ask!.id])}
          yes={asker.ask.kind === "secret" ? () => approveSecret(asker.ask!).then(() => setReplied((r) => [...r, asker.ask!.id])) : undefined}
        />
      )}
      <ArtifactViewer save={(a) => pageActs(a).save(!a.saved)} />
      {undoing && (
        <Dialog.Root open onOpenChange={(o) => !o && setUndoing(undefined)}>
          <Dialog.Portal>
            <Dialog.Backdrop className="dialog-backdrop" />
            <Dialog.Popup className="dialog">
              <Dialog.Title className="dialog-title">{undoing.tool === "close_worker" ? "Undo Close?" : undoing.tool === "remove_app" ? (undoing.forever ? "Undo Delete?" : "Undo Archive?") : "Undo Complete?"}</Dialog.Title>
              <Dialog.Description className="dim">
                {undoing.agents.map((a) => (a.num ? `${tagNum(a.num)} · ${a.name}` : a.name)).join(", ")} {undoing.agents.length > 1 ? "go" : "goes"} back as before.
              </Dialog.Description>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Dialog.Close>Cancel</Dialog.Close>
                <button onClick={undo}>Undo</button>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {settings && (
        <Settings
          theme={theme}
          setTheme={setTheme}
          keys={keys}
          setKeys={setKeys}
          ranges={ranges}
          setRanges={(r) => {
            const change = Object.entries(r).filter(([, v]) => v !== undefined);
            setRanges((old) => ({ ...old, ...Object.fromEntries(change) }));
            void Promise.all(change.map(([k, v]) => yonder.settings.set(k, v))).finally(loadValues);
          }}
          mode={agentMode}
          setMode={(mode) => (setAgentMode(mode), void yonder.settings.set("mode", mode).catch(loadValues))}
          claudeMcp={claudeMcp}
          setClaudeMcp={(on) => (setClaudeMcp(on), loadClaudeMcp(on))}
          clis={clis}
          setClis={(change) => {
            // The switch or the menu changes at once, and the answer of the bridge corrects it.
            const { id, ...rest } = change;
            setClis((c) => (id ? { ...c, clis: c.clis.map((x) => (x.id === id ? { ...x, ...rest } : x)) } : { ...c, ...rest }));
            const done = loadClis(change);
            // A new default profile shows its own usage. The bridge has the new profile before this check.
            if (typeof change.cli === "string" && id === undefined) void done.then(() => check("?fresh"));
            return done;
          }}
          setProfile={async (body) => {
            const r = await yonder.profiles.save(body);
            const c = await r.json();
            if (!r.ok) throw new Error(c.error ?? `The bridge answered ${r.status}.`);
            cliInfo = Object.fromEntries(c.clis.map((x: Cli) => [x.id, x]));
            setClis({ cli: c.cli, clis: c.clis });
            return c.id as string;
          }}
          onCheckClis={() => loadClis(undefined, true)}
          claude={claude}
          online={online}
          update={{ shell: !phone && rebuildMac, release: release || (store?.version ?? ""), held: tooNew, updating, onCheck: checkNow, onUpdate: () => (setSettings(false), store && !release ? openLink(store.url) : update()) }}
          onRefresh={() => check("?fresh")}
          grok={{
            spend: xai.month_usd !== undefined ? `${usd(xai.month_usd)} this month · ${usd(xai.credit_usd ?? 0)} left` : `${usd(spent + callCost)} (estimate)`,
            minutes: (xai.month_usd ?? spent + callCost) / PRICE_PER_MINUTE,
            tokens: live ? live.tokens() : undefined,
          }}
          onCalls={() => {
            setOpened("");
            setTab("calls");
            setSettings(false);
          }}
          onOpenAgent={(id) => {
            const w = stateRef.current.workers.find((x) => x.id === id);
            if (!w) return setError(`Yonder has this ${word.one} no more.`);
            setSettings(false);
            openWorker(w);
          }}
          onPair={() => setPairing(true)}
          account={{ account, keys: voiceKeys, onSignIn: setSigningIn, onSignOut: () => (signOut(), !phone && void dropSync(bridgeFetch)), onDelete: () => openLink(`${SITE}/account/delete/`) }}
          start={typeof settings === "string" ? settings : undefined}
          onClose={() => setSettings(false)}
        />
      )}
      {/* The sign-in page comes after the settings, so it covers them when the account card opens it. */}
      {signingIn && <SignIn start={signingIn} onClose={(done) => (setSigningIn(false), done && setError(""))} />}
    </main>
  );
}

// The dots of one project: one news dot, purple when an agent needs the user (Clef decides for a done agent), else blue
// for an unread result, and red when an agent runs. The purple dot replaces the blue dot.
// The error toast. It goes away by itself after 3 to 10 s (longer for a longer text, so that the user can read it), but
// not while a finger holds it. A tap closes it, and a swipe up or to the side throws it off the screen. A drag down
// only stretches it a little. It has no X.
function Toast({ text, action, onClose }: { text: string; action?: { label: string; onClick: () => void }; onClose: () => void }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(1);
  const [held, setHeld] = useState(false);
  const dragged = useRef(false);
  const still = useReducedMotion();
  useEffect(() => {
    if (held) return;
    const t = setTimeout(onClose, action ? 10000 : Math.min(10000, 3000 + text.length * 60));
    return () => clearTimeout(t);
  }, [text, held]);
  return (
    <motion.div
      className="toast"
      role="alert"
      style={{ x, y, opacity }}
      initial={still ? false : { y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
      drag
      dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
      dragElastic={{ top: 1, right: 1, bottom: 0.1, left: 1 }}
      onPointerDown={() => (dragged.current = false)}
      onDragStart={() => ((dragged.current = true), setHeld(true))}
      onDragEnd={(_, { offset, velocity }) => {
        setHeld(false);
        const side = Math.abs(offset.x) > 80 || Math.abs(velocity.x) > 500;
        if (!side && offset.y > -30 && velocity.y > -300) return; // Too short: the constraints spring it back.
        const out = { type: "tween", duration: 0.2, ease: "easeIn" } as const;
        if (side) animate(x, Math.sign(offset.x || velocity.x) * window.innerWidth, out);
        else animate(y, -150, out);
        animate(opacity, 0, out).then(onClose);
      }}
      onClick={() => !dragged.current && onClose()}
    >
      {text}
      {action && (
        <button className="toast-action" onClick={(e) => (e.stopPropagation(), action.onClick(), onClose())}>
          {action.label}
        </button>
      )}
    </motion.div>
  );
}

// The workspace of an agent: the one with its id, else the deepest workspace folder that holds its folder. An agent of
// an older bridge has no id. A workspace with no folder has the key "workspace:<id>", which holds no folder.
const homeOf = (w: Worker, ps: Project[]) =>
  (w.workspace ? ps.find((p) => p.id === w.workspace) : undefined) ??
  ps.filter((q) => w.path === q.path || w.path.startsWith(`${q.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
// The agents of one workspace of another computer, as on this computer.
const agentsOf = (p: Project, ps: Project[], ws: Worker[]) => ws.filter((w) => homeOf(w, ps) === p);

function Counts({ agents }: { agents: Worker[] }) {
  const unread = agents.filter((w) => w.unread).length;
  const attention = agents.filter((w) => w.attention).length;
  const running = agents.filter((w) => w.status === "running").length;
  return (
    <span className="counts">
      {attention > 0 ? <i className="attention" title={`${attention} need your attention`} /> : unread > 0 && <i className="unread" title={`${unread} unread`} />}
      {running > 0 && <i className="pulse" title={`${running} running`} />}
    </span>
  );
}

// A small dot in the color of the status of an agent, then its number in large text: red runs, blue waits on the user,
// green is done, purple is done with an answer to a question of the user, red failed, gray is closed. A done agent with
// an unread result has a blue dot, and the dot becomes green or purple when the user reads it. So a done row has one dot,
// not a green dot and a blue dot. An agent that needs the user has a purple dot in place of its status color. So the row
// and the header of a conversation show one dot for all the news, not a second blue or purple dot. A closed agent that
// gave its number back shows only the dot. In a list of agents, the row shows a small # and the number (`part` "num"),
// so that the number reads as the number of the agent. The row has no dot: the third line of the row (`Tag`) tells the
// news. The header of a conversation and the rows of the sub-agents keep the dot.
function Badge({ w, part }: { w: Worker; part?: "num" | "dot" }) {
  const fresh = w.unread && w.status !== "running";
  const status = w.attention
    ? `${LABEL[w.status]}, needs your attention`
    : fresh
      ? `${LABEL[w.status]}, unread`
      : w.answered && w.status === "done"
        ? "answered your question"
        : closer(w) || LABEL[w.status];
  return (
    <span
      className={`badge${tag(w) !== label(w) ? " named" : ""}${w.answered ? " answered" : ""}${fresh ? " fresh" : ""}${w.attention ? " attention" : ""}`}
      title={status}
      aria-label={part === "dot" ? undefined : `${tag(w) ? `${called(w, word.One)}, ` : ""}${status}`}
      aria-hidden={part === "dot" || undefined}
    >
      {part !== "num" && <i />}
      {part === "num" && label(w) && tag(w) === label(w) && <small>#</small>}
      {part !== "dot" && tag(w)}
    </span>
  );
}
// Who closed an agent, for its row: "closed itself", "closed by you", "closed by voice", "closed by agent 5" or "closed
// by MCP", such as the Claude app. Empty for an agent that is not closed, or whose session ended.
const closer = (w: Worker) =>
  w.status !== "closed" ? "" : w.closedItself ? "closed itself" : w.closedBy === undefined ? "" :
    `closed by ${typeof w.closedBy === "number" ? (tagNum(w.closedBy) === String(w.closedBy) ? `${word.one} ${w.closedBy}` : tagNum(w.closedBy)) : { you: "you", voice: "voice", mcp: "MCP" }[w.closedBy]}`;
// The number of an agent, and the letter of a sub-agent: 21B.
const label = (w: Worker) => `${w.num || ""}${w.letter ?? ""}`;
// What the screen shows in the place of the number: "2", or in the names and projects modes the name, "Jack" or
// "Sundial 7" (`agentNaming` in config.json, `shown` in src/names.ts). The voice keeps the number (`label`).
const tag = (w: Worker) => shown(w, openAgents);
// The same for the number alone, such as in the undo of a close.
const tagNum = (num: number) => shown(openAgents.find((w) => w.num === num && !w.letter) ?? { num, project: "" }, openAgents);
// An agent in a label: "agent 2", or its name, "Jack".
const called = (w: Worker, one = word.one) => (tag(w) === label(w) ? `${one} ${label(w)}` : tag(w));

// The third line of an agent that does not run: the next step of the user in 2 to 5 words, such as "Push it", which
// Haiku writes with the summary (`next`). It is purple when the agent needs the user, blue when the agent waits on a
// reply, and red when it failed. Else it is gray. It has no dot for an unread result. Before the summary
// comes, or with the summaries off, the line names the state. So each row tells what the user must do next, in 4 or 5
// words on one line: the last point of the summary, up to 15 words, wraps to a second line.
function Tag({ w }: { w: Worker }) {
  if (w.parent) return null;
  // A compact row of a running agent says what it does now, so each row has its title and one status line.
  if (w.status === "running")
    return shownLook().look.look?.rows === "compact" ? <span className="tag" title={w.activity || "working"}>{w.activity?.trim() || "working"}</span> : null;
  // The last answer is the one of Claude Code itself when the account has no usage left, such as "You've hit your session
  // limit · resets 11:20pm (Europe/Paris)". The row then says "Out of usage · resets 11:20pm" in red, in place of the
  // next step.
  const out = w.result?.match(/^You've hit your \w+ limit · (resets [^(]+?)\s*(?:\(|$)/)?.[1];
  const tone = w.status === "waiting" ? "waiting" : w.status === "failed" || out ? "failed" : needsYou(w) ? "need" : "";
  // Compact rows (`rows: "compact"` of a style, as Terminal) show a step only when it needs the user, so a gray line
  // never reads as a call to action.
  if (shownLook().look.look?.rows === "compact" && !tone) {
    const done = w.status === "closed" ? closer(w) || "closed" : "done";
    return <span className="tag" title={done}>{done}</span>;
  }
  // A closed agent says who closed it, in place of the next step of its summary.
  const shut = closer(w);
  const text =
    (shut ? `${shut[0].toUpperCase()}${shut.slice(1)}` : out ? `Out of usage · ${out}` : w.next) ||
    (w.status === "waiting" ? "Reply needed" : w.status === "failed" ? "Failed" : w.answered ? "Read the answer" : needsYou(w) ? "Needs you" : w.status === "closed" ? "Closed" : "Done");
  return (
    <span className={`tag${tone ? ` ${tone}` : ""}`} title={text}>
      {text}
    </span>
  );
}

// One agent. A click opens its conversation. A running worker has a stop button
// on the row, so the user can stop it without opening it.
// A queued message: a bubble with a dotted edge. A tap or a click on it sends only that message now: it stops the current
// turn, and the other queued messages wait for the end of the next turn. A long press on the phone, or a right-click on the Mac, opens a menu with Send now, Edit and Delete.
// A tap on a picture in the bubble sends the message too. The bubble has no swipe.
// A message that went into the turn that runs waits in the queue of Claude Code: it has only Send now.
function Queued({ text, pictures, onSend, onEdit, onDelete }: { text: string; pictures?: ReactNode; onSend: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const send = onSend;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={<li />}
        className="user queued"
        role="button"
        tabIndex={0}
        title="Stop the current turn and send this message now"
        onClickCapture={(e) => (e.preventDefault(), e.stopPropagation(), send())}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), send())}
      >
        {pictures}
        {withPlaces(text)}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="menu-layer">
          <ContextMenu.Popup className="menu">
            <ContextMenu.Item className="menu-item" onClick={onSend}>
              Send now
            </ContextMenu.Item>
            {onEdit && (
              <ContextMenu.Item className="menu-item" onClick={onEdit}>
                Edit
              </ContextMenu.Item>
            )}
            {onDelete && (
              <ContextMenu.Item className="menu-item" onClick={onDelete}>
                Delete
              </ContextMenu.Item>
            )}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

// A long press on the phone, or a right-click on the Mac, opens the menu of an agent row: Stop (for a running or waiting
// agent), Save for later or Unsave, Move to, Copy Link, Close and Delete. Move to moves the agent to another project, as
// a drag of the row onto a project of All projects on the Mac. The check button at the end of the row closes the agent.
// The row has no swipe, and Save for later is the only star. Each long press of a menu is 350 ms, not the 500 ms of
// Base UI (patches/@base-ui%2Freact@1.8.0.patch).
// An agent of another computer of the phone: the look of WorkerRow with no swipe and no menu. A tap opens it, and its
// check closes it through the link of that computer (LinkOf). The title over it names the project, so the second line
// is the model and the effort.
// A right click gives Copy Link, as on a row of the computer in use, because the link of an agent works on each computer.
function ElsewhereRow({ w, onOpen }: { w: Worker; onOpen: () => void }) {
  return (
    <ContextMenu.Root disabled={!linkable(w)}>
      <ContextMenu.Trigger render={<div />} className={`worker row ${w.status}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}>
        <Badge w={w} part="num" />
        <span className="name">{w.name}</span>
        <span className="what">{[w.model && modelName(w.model), w.effort].filter(Boolean).join(" · ")}</span>
        <Tag w={w} />
        <Age w={w} />
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="menu-layer">
          <ContextMenu.Popup className="menu">
            <ContextMenu.Item className="menu-item" onClick={() => copyAgentLink(w)}>
              Copy Link
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

// Moves an agent to another project (move_worker). The row goes to the new project at once. The path, not the name,
// because two projects can have the same name.
function moveAgent(w: Worker, p: Project) {
  act("move_worker", [w], { worker: w.id, project: p.path }, { project: p.name, path: p.path }).catch(() => {});
}
// The agent that the user drags on the Mac. The drop target reads it, because a drag over a target cannot read its data.
let dragged: Worker | undefined;

// Move to of an agent: a search over the projects that the agent can move to, in the order of the Projects view. The
// names that start with the search come first, and Enter picks the first project. A pick moves the agent and closes
// the picker. A search, because a submenu of hundreds of projects is too long.
function MovePicker({ w, moves, onClose }: { w: Worker; moves: Project[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const starts = (p: Project) => (p.name.toLowerCase().startsWith(q) ? 0 : 1);
  const found = q ? moves.filter((p) => p.name.toLowerCase().includes(q)).sort((a, b) => starts(a) - starts(b)) : moves;
  const pick = (p: Project) => (onClose(), moveAgent(w, p));
  return (
    <Picker label={`Move ${called(w)}`} className="project-picker" onClose={onClose}>
      <input
        type="search"
        placeholder="Move to"
        aria-label={`Move ${called(w)} to`}
        autoFocus={!phone}
        enterKeyHint="go"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && found[0] && pick(found[0])}
      />
      <div className="project-list">
        {found.map((p) => (
          <button key={p.path} title={p.path} onClick={() => pick(p)}>
            {/* The box keeps its width with no favicon, so the names line up. */}
            <span className="fav">
              <Favicon path={p.path} draggable={false} loading="lazy" />
            </span>
            {p.name}
          </button>
        ))}
      </div>
    </Picker>
  );
}

// The default profile of a project (Profile… in the menu of its row): Default, the profile of the Settings, or a profile of
// the user. Each new agent of the project starts on it, and the agents that run keep theirs.
function ProfilePicker({ p, clis, onPick, onClose }: { p: Project; clis: Clis; onPick: (name: string) => void; onClose: () => void }) {
  const fallback = clis.clis.find((c) => c.id === clis.cli)?.name ?? clis.cli;
  const rows = [{ name: "", label: `Default · ${fallback}` }, ...clis.clis.filter((c) => c.base).map((c) => ({ name: c.name, label: profileLabel(c.name, c) }))];
  const now = p.profile ?? "";
  return (
    <Picker label={`The profile of ${p.name}`} className="project-picker" onClose={onClose}>
      <div className="project-list">
        {rows.map((r) => (
          <button key={r.name} aria-current={r.name === now || undefined} onClick={() => (onClose(), onPick(r.name))}>
            {r.label}
            {r.name === now && <Icon name="tick" />}
          </button>
        ))}
      </div>
    </Picker>
  );
}

// The time in ms in which a second click on the name of a row is a double click (WorkerRow).
const DOUBLE = 300;
// `moves`: the projects that the agent can move to, for Move to in the menu and for a drag on the Mac.
function WorkerRow({ w, now, leaving, onOpen, moves = [] }: { w: Worker; now: number; leaving?: boolean; onOpen: () => void; moves?: Project[] }) {
  // Move to in the menu opens the picker of the projects.
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const run = (tool: string) => act(tool, [w], { worker: w.id }, PATCH[tool]).catch(() => {});
  // A Delete from the menu slides the row out to the left, as a row that leaves the tab, and then its height closes, so
  // the rows under it move up. The change takes the row out of the list at once, so it waits for the animation.
  const remove = () => {
    const el = ref.current;
    const still = !el || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still) {
      el.dataset.leaving = "";
      el.animate([{ translate: "0 0", opacity: 1 }, { translate: "-100% 0", opacity: 0 }], { duration: 260, easing: "cubic-bezier(0.55, 0, 0.75, 0.2)", fill: "forwards" });
      collapse(el, 260);
    }
    setTimeout(() => run("remove_worker"), still ? 0 : 470);
  };
  // A double click on the name, or a double tap on the phone, renames the agent in place (rename_worker), as the name in
  // the head of its chat. So a click on the name opens the agent after DOUBLE ms, when no second click comes, and a
  // click on the rest of the row opens it at once. A sub-agent cannot be renamed.
  // The clicks count by themselves, as the double tap of the viewer, so the phone and the Mac act the same.
  const [renaming, setRenaming] = useState<string | null>(null);
  // The summarize button of the Mac shows the task and the state of the agent in 1 or 2 sentences of Haiku in place of
  // its name and details, until a second click. "" while Haiku writes it.
  const [gist, setGist] = useState<string>();
  const link = useContext(LinkOf);
  const summarize = () => {
    // The row keeps its height while the summary shows, so the rows under it do not move.
    if (ref.current) ref.current.style.minHeight = gist === undefined ? `${ref.current.offsetHeight}px` : "";
    if (gist !== undefined) return setGist(undefined);
    setGist("");
    yonder.chat.gist(w.id, link.fetch).then(
      (text) => setGist((g) => (g === "" ? text || "No summary." : g)),
      () => setGist((g) => (g === "" ? "No summary." : g)),
    );
  };
  const tapped = useRef({ t: 0, x: 0, y: 0 });
  const opening = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(opening.current), []);
  const rename = () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (name && name !== w.name) act("rename_worker", [w], { worker: w.id, name }, { name }, false).catch(() => {});
  };
  // How long ago the agent started its first turn. The time after it is only the last turn.
  // The words are short ("7m ago", not "started 7m ago"), so the line fits the row.
  const what = [ownerName(w), w.kind && KIND[w.kind].label, w.schedule && "Scheduled", w.cli && cliName(w.cli), w.model && modelName(w.model), w.effort, w.mode && w.mode !== "bypassPermissions" && modeLabel(w), w.createdAt && `${ago(now - w.createdAt)} ago`].filter(Boolean).join(" · ");
  // A new agent grows into the list: its row opens from no height and pushes the rows under it down, its text
  // slides down into place, and the row glows for a moment. It plays once, the first time the row shows.
  useLayoutEffect(() => {
    const el = ref.current;
    const at = born.get(keyOf(w)) ?? 0;
    born.delete(keyOf(w));
    if (!el || Date.now() - at > 10_000 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { height, paddingTop, paddingBottom, borderBottomWidth } = getComputedStyle(el);
    const shut = { height: "0px", paddingTop: "0px", paddingBottom: "0px", borderBottomWidth: "0px", opacity: 0, translate: "0 -10px" };
    el.style.overflow = "hidden";
    el.dataset.born = "";
    el.animate([shut, { height, paddingTop, paddingBottom, borderBottomWidth, opacity: 1, translate: "0 0" }], {
      duration: 450,
      easing: "cubic-bezier(0.25, 1, 0.5, 1)",
    }).finished.then(() => (el.style.overflow = ""), () => {});
  }, []);
  // An agent that runs again after a message leaves the tab: the list shows first, then the row slides out to the left,
  // and its height closes, so the rows under it move up. The app takes the row out of the tab after LEAVE_MS.
  // The whole row slides, with no Delete button at its right (`data-leaving`).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!leaving || !el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.dataset.leaving = "";
    el.animate([{ translate: "0 0", opacity: 1 }, { translate: "-100% 0", opacity: 0 }], { duration: 260, delay: 350, easing: "cubic-bezier(0.55, 0, 0.75, 0.2)", fill: "forwards" });
    collapse(el, 560);
  }, [leaving]);
  return (
    <>
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={<div />}
        ref={ref}
        className={`worker row ${w.status}`}
        data-id={w.id}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if (w.parent || !(e.target as Element).closest(".name")) return onOpen();
          const last = tapped.current;
          const double = e.timeStamp - last.t < DOUBLE && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30;
          tapped.current = { t: double ? 0 : e.timeStamp, x: e.clientX, y: e.clientY };
          clearTimeout(opening.current);
          if (double) setRenaming(w.name);
          else opening.current = setTimeout(onOpen, DOUBLE);
        }}
        onKeyDown={(e) => {
          // ⌘↩ (closeKey) closes the focused agent, also a running one, and the focus goes to the next row. A sub-agent
          // stays.
          if (hit(e.nativeEvent, "closeKey")) {
            e.preventDefault();
            if (w.status === "closed" || w.parent) return;
            const rows = [...document.querySelectorAll<HTMLElement>(".panel:not([hidden]) .list > .row")];
            const i = rows.indexOf(e.currentTarget);
            (rows[i + 1] ?? rows[i - 1])?.focus();
            return void run("close_worker");
          }
          if (e.key === "Enter" || e.key === " ") (e.preventDefault(), onOpen());
        }}
        // On the Mac, a drag of the row onto a project of All projects moves the agent there (the list in App).
        draggable={!phone && moves.length > 0 && renaming === null}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("yonder/agent", w.id);
          dragged = w;
        }}
        onDragEnd={() => (dragged = undefined)}
      >
        <Badge w={w} part="num" />
        {gist !== undefined ? (
          <span className="gist">{gist || "…"}</span>
        ) : renaming === null ? (
          <span className="name">{w.name}</span>
        ) : (
          // The field keeps its clicks, keys and touches, so the row does not open, swipe or show its menu.
          <input
            className="name app-rename"
            value={renaming}
            autoFocus
            enterKeyHint="done"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={(e) => (e.currentTarget.dataset.cancel ? setRenaming(null) : rename())}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
              if (e.key === "Escape") (e.currentTarget.dataset.cancel = "1"), e.currentTarget.blur();
            }}
            aria-label={`Rename ${called(w)}`}
          />
        )}
        {gist === undefined && <>
        <span className="what" title={w.kind && swap(KIND[w.kind].tip)}>
          {what}
        </span>
        {/* The context and the time of the turn are on the second line, after the model, so the name has the full
            width of the row. The model text gets the ellipsis, never the time.
            A running agent counts the time of its turn. Then the time stops at the length of that turn.
            The context and the time are one span, so the dot between them has the same space on each side. */}
        <span
          className="meta"
          title={`${w.context ? `Context in use: ${context(w.context)}. ` : ""}${w.status === "running" ? "Time of this turn" : "Length of the last turn"}`}
        >
          {what && "· "}
          {w.context && `${tokens(w.context.used)} · `}
          {took((w.status === "running" ? now : w.updatedAt) - w.startedAt)}
        </span>
        <Tag w={w} />
        </>}
        <Age w={w}>
          {!phone && !w.parent && (
            <button
              className="row-gist"
              title={gist === undefined ? "Summarize" : "Close the summary"}
              aria-label={gist === undefined ? `Summarize ${called(w)}` : "Close the summary"}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.stopPropagation()}
              onClick={(e) => (e.stopPropagation(), summarize())}
            >
              <Icon name={gist === undefined ? "list" : "x"} size={15} />
            </button>
          )}
        </Age>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="menu-layer">
          <ContextMenu.Popup className="menu">
            {(w.status === "running" || w.status === "waiting") && (
              <ContextMenu.Item className="menu-item" onClick={() => run("complete_worker")}>
                Stop
              </ContextMenu.Item>
            )}
            {!w.kind && !w.parent && (
              <ContextMenu.Item className="menu-item" onClick={() => saveLater(act, w)}>
                {w.saved ? "Unsave" : "Save for later"}
              </ContextMenu.Item>
            )}
            {moves.length > 0 && (
              <ContextMenu.Item className="menu-item" onClick={() => setPicking(true)}>
                Move to
              </ContextMenu.Item>
            )}
            {linkable(w) && (
              <ContextMenu.Item className="menu-item" onClick={() => copyAgentLink(w)}>
                Copy Link
              </ContextMenu.Item>
            )}
            {w.status !== "closed" && (
              <ContextMenu.Item className="menu-item" onClick={() => act("close_worker", [w], { worker: w.id }).catch(() => {})}>
                Close
              </ContextMenu.Item>
            )}
            <ContextMenu.Item className="menu-item" onClick={remove}>
              Delete
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
    {picking && <MovePicker w={w} moves={moves} onClose={() => setPicking(false)} />}
    </>
  );
}

// Saves an agent for later, on the Saved tab, or puts a saved agent back on the Done tab. A closed agent comes back as
// done (star_worker in bridge/main.ts). The menu of a row and the bookmark of a conversation call it.
function saveLater(run: typeof act, w: Worker) {
  run("star_worker", [w], { worker: w.id, saved: !w.saved }, { saved: !w.saved, ...(w.status === "closed" && { status: "done" as const }) }).catch(() => {});
}

// The height of a row closes after `delay` ms, so the rows under it move up. The change that then takes the row out
// of the list takes away a row of no height, and nothing jumps.
const LEAVE_MS = 800;
function collapse(row: HTMLElement, delay: number) {
  const { paddingTop, paddingBottom, borderBottomWidth } = getComputedStyle(row);
  return row.animate([{ height: `${row.offsetHeight}px`, paddingTop, paddingBottom, borderBottomWidth }, { height: "0px", paddingTop: "0px", paddingBottom: "0px", borderBottomWidth: "0px" }], { duration: 200, delay, easing: "cubic-bezier(0.25, 1, 0.5, 1)", fill: "forwards" });
}

// The swipe of one row. A swipe to the right stops with the `start` buttons open at the left of the row, each one
// ACTION px wide. When `end` is true, a swipe to the left stops with one button open at the right of the row (Delete),
// a square as high as the row. When `end` is a number, that many buttons of ACTION px open at the right. A tap on an open row only slides it back. Vertical moves stay with the scroll of the list.
// Motion moves the row with a spring that keeps the speed of the finger. The spring is near the swipe of an iOS list,
// with a small bounce at the stop. Past the
// buttons, the buttons stretch with the row. Past the point of the full swipe, the phone gives a tick and the button
// of the full swipe covers the others. A release there calls onFull with the direction, and slides the row out.
// In the last RAMP px before that point, the phone taps TICKS times, closer and closer, as the finger moves on.
const ACTION = 76;
const RAMP = 120;
const TICKS = 8;
const SPRING = { type: "spring", visualDuration: 0.35, bounce: 0.15 } as const;

function useSwipeOpen(start: number, end: boolean | number, onFull: (dir: 1 | -1) => boolean) {
  const ref = useRef<HTMLDivElement>(null);
  // `open` is the width of the buttons on each side: [left, right].
  const drag = useRef<{ x: number; y: number; from: number; row: number; open: [number, number]; axis?: "x" | "y" } | null>(null);
  const moved = useRef(false);
  const armed = useRef(false);
  const gone = useRef(false);
  const tick = useRef(0);
  const x = useMotionValue(0);
  // The row moves with x. --shown is how many buttons show, and the label of each button grows in with it. --open is
  // the width that the row uncovers, and the buttons fill it. Only the buttons of one side show at a time.
  useMotionValueEvent(x, "change", (v) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = v ? `translateX(${v}px)` : "";
    el.style.setProperty("--shown", String(Math.abs(v) / ACTION));
    el.style.setProperty("--open", `${Math.abs(v)}px`);
  });
  const slide = (to: number) => {
    animate(x, to, { ...SPRING, velocity: x.getVelocity() });
  };
  const arm = (on: boolean) => {
    if (on === armed.current) return;
    armed.current = on;
    ref.current?.toggleAttribute("data-armed", on);
    haptic();
  };
  // The point of the full swipe on one side: a third of the row, and at least 24 px past the buttons.
  const fullAt = (d: { row: number }, open: number) => Math.max(open + 24, d.row / 3);
  const release = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.axis !== "x") return;
    const dir = x.get() < 0 ? -1 : 1;
    if (armed.current) {
      // An action that keeps the row in the list (onFull returns true) slides the row back.
      if (onFull(dir)) {
        armed.current = false;
        ref.current?.removeAttribute("data-armed");
        slide(0);
        return;
      }
      gone.current = true;
      animate(x, dir * d.row, { type: "spring", stiffness: 500, damping: 40, velocity: x.getVelocity() });
      return;
    }
    // A flick opens or shuts the row, also when it did not pass the middle of the buttons.
    const open = d.open[dir > 0 ? 0 : 1];
    const v = x.getVelocity() * dir;
    slide(v > 300 || (v > -300 && Math.abs(x.get()) > open / 2) ? dir * open : 0);
  };
  return {
    ref,
    shut: () => slide(0),
    // True when the tap only slides an open row back, or ends a swipe.
    tap: () => {
      if (moved.current) return !(moved.current = false);
      if (gone.current) return true;
      // A row that a touch caught part-way also slides back.
      if (!x.get()) return false;
      slide(0);
      return true;
    },
    handlers: start > 0 || end ? {
      onTouchStart: (e: ReactTouchEvent) => {
        if (gone.current) return;
        const t = e.touches[0];
        const el = ref.current;
        const row = el?.offsetWidth ?? 0;
        const side = el?.offsetHeight ?? ACTION;
        el?.style.setProperty("--side", `${side}px`);
        // A touch catches the row where the spring has it.
        const from = x.get();
        drag.current = { x: t.clientX, y: t.clientY, from, row, open: [start * ACTION, end === true ? side : Number(end) * ACTION] };
        moved.current = false;
        tick.current = 0;
        x.stop();
      },
      onTouchMove: (e: ReactTouchEvent) => {
        const d = drag.current;
        if (!d) return;
        const t = e.touches[0];
        const dx = t.clientX - d.x;
        const dy = t.clientY - d.y;
        if (!d.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (d.axis !== "x") return;
        moved.current = true;
        // A side without buttons does not move.
        const to = Math.max(d.open[1] ? -d.row : 0, Math.min(d.open[0] ? d.row : 0, d.from + dx));
        x.set(to);
        const open = d.open[to < 0 ? 1 : 0];
        const full = fullAt(d, open);
        // The ticks start past the buttons, and their gap gets smaller near the full swipe.
        const from = Math.max(open, full - RAMP);
        const p = Math.min(1, Math.max(0, (Math.abs(to) - from) / (full - from)));
        const step = Math.floor(TICKS * (1 - Math.sqrt(1 - p)));
        if (step !== tick.current && step < TICKS) haptic();
        tick.current = step;
        arm(Math.abs(to) > full);
      },
      onTouchEnd: release,
      // A touch that iOS takes away, as for a call, never closes the agent.
      onTouchCancel: () => {
        armed.current = false;
        ref.current?.removeAttribute("data-armed");
        release();
      },
    } : undefined,
  };
}

// On the phone, a swipe to the right anywhere in the view goes back, as on iOS. The view follows the finger, and the
// list under it moves from the left to its place. Past 50 px the view slides out. A text field and a block that
// scrolls sideways, such as code, and a video or a sound keep their own swipes.
// A photo of the phone camera is 3 to 6 MB. Each request of the phone goes through the relay in one
// WebSocket frame, and Cloudflare takes 1 MiB at most, so the photo goes as a JPEG of 1600 px at most. The screenshot
// of the Feedback section of the settings goes the same way.
export async function shrink(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.8));
  return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
}

export function useSwipeBack(onBack: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  // The parent passes a new function at each render, so the listeners read the latest one.
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    if (!phone) return;
    let start: { x: number; y: number; axis?: "x" | "y" } | null = null;
    let dx = 0;
    // The speed of the finger in px/ms, from the moves of the last 80 ms.
    let moves: { x: number; t: number }[] = [];
    const speed = () => (moves.length > 1 ? (moves.at(-1)!.x - moves[0].x) / Math.max(1, moves.at(-1)!.t - moves[0].t) : 0);
    const panel = () => ref.current?.closest<HTMLElement>(".sheet, .page");
    // The list under a conversation: the other children of its panel. A full page covers the whole app, but a page in a
    // page (a section of the settings) has its parent page under it. The list under the New agent view (.sheet.fade)
    // stays in its place, so it does not move with the finger.
    const layered = (el: HTMLElement) => (el.classList.contains("sheet") && !el.classList.contains("fade")) || (el.classList.contains("page") && !!el.parentElement?.closest(".page"));
    // A sheet that covers the screen (.sheet.cover) also has the title bar, the call row and the tab bar under it.
    const chrome = (el: HTMLElement) => (el.classList.contains("cover") ? [...document.querySelectorAll("main > :is(.titlebar, .callrow), .tabs > :is(.tablist, .reach)")] : []);
    const under = (el: HTMLElement) => (layered(el) ? ([...el.parentElement!.children, ...chrome(el)].filter((c) => c !== el && !c.classList.contains("page")) as HTMLElement[]) : []);
    // The native buttons of the iPhone (src/chrome.ts) cannot follow the finger, so they hide while a view moves, and
    // the buttons of the page move with it.
    const swiping = (on: boolean) => document.documentElement.toggleAttribute("data-swiping", on);
    const move = (x: number, animate: boolean) => {
      const el = panel();
      if (!el) return;
      if (x) swiping(true);
      const transition = animate ? "transform 0.2s ease, box-shadow 0.2s ease" : "none";
      el.style.transition = transition;
      el.style.transform = x ? `translateX(${x}px)` : "";
      el.style.boxShadow = x ? "-4px 0 16px rgb(0 0 0 / 0.15)" : "";
      // The list starts 30% of the view to the left, as the CSS puts it, and reaches its place with the finger. The
      // call row and the tab bar are narrower than the view, so the move is in px of the view, and all move as one.
      for (const u of under(el)) {
        u.style.transition = transition;
        u.style.transform = x ? `translateX(${(x - el.offsetWidth) * 0.3}px)` : "";
      }
    };
    const scrolls = (el: Element | null) => {
      for (; el && el !== document.body; el = el.parentElement) if (el.scrollWidth > el.clientWidth && el.scrollLeft > 0) return true;
      return false;
    };
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      const el = e.target as Element;
      // A full page, such as the settings, covers the view under it, so only the page on top goes back.
      const pages = document.querySelectorAll(".page");
      const page = pages[pages.length - 1];
      const own = page ? page.contains(ref.current) : panel()?.contains(el);
      start = own && e.touches.length === 1 && !el.closest("input, textarea, video, audio, .viewer") && !scrolls(el) ? { x: t.clientX, y: t.clientY } : null;
      dx = 0;
      moves = [];
    };
    const drag = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const x = t.clientX - start.x;
      const y = t.clientY - start.y;
      if (!start.axis && Math.max(Math.abs(x), Math.abs(y)) > 8) start.axis = Math.abs(x) > Math.abs(y) ? "x" : "y";
      if (start.axis !== "x") return;
      dx = Math.max(0, x);
      const now = e.timeStamp;
      moves = [...moves.filter((m) => now - m.t < 80), { x: dx, t: now }];
      move(dx, false);
    };
    const up = () => {
      const el = panel();
      // A drag of 50 px or a quick flick goes back, as in iOS, but not a finger that moves back to the left at the end.
      const v = speed();
      if (start?.axis === "x" && (dx > 50 || (dx > 12 && v > 0.3)) && v > -0.3 && el) {
        start = null;
        // The view slides out to the right, and the list under it reaches its place. Then the view closes.
        const list = under(el);
        el.style.transition = "transform 0.2s ease-out";
        el.style.transform = "translateX(100%)";
        for (const u of list) {
          u.style.transition = "transform 0.2s ease-out";
          u.style.transform = "none";
        }
        setTimeout(() => {
          // The view must be gone before the list drops its inline styles, or the CSS moves the list back to the left.
          flushSync(() => back.current());
          for (const u of list) u.style.transition = u.style.transform = "";
          // A sub-agent goes back to its parent agent in the same sheet, so the sheet stays and must come back. Else it
          // stays off the screen, and the list stays 30% to the left.
          if (el.isConnected) el.style.transition = el.style.transform = el.style.boxShadow = "";
          swiping(false);
        }, 200);
        return;
      }
      if (start?.axis === "x") {
        move(0, true);
        setTimeout(() => swiping(false), 200);
      }
      start = null;
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", drag, { passive: true });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", drag);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
      move(0, false);
      swiping(false);
    };
  }, []);
  return ref;
}

// The context use, the time of the turn, and the check button that closes the agent, the same on the Mac and the phone.
// A closed agent also has a trash button that deletes it.
// A tap on the check plays a reward first: the check pops into a green disc, a green ring pulses out, the row glows
// green, flicks out to the right and closes up, and the phone taps three times. Then the agent closes, because the
// close takes the row away at once.
function Age({ w, children }: { w: Worker; children?: ReactNode }) {
  const [closing, setClosing] = useState(false);
  const link = useContext(LinkOf);
  return (
    <span className="age">
      {children}
      {/* A closed agent shows a trash button that deletes it (remove_worker), on the phone and on the Mac.
          So a delete needs no swipe. A done or failed agent shows only the
          check button, and Delete is in its menu. */}
      {w.status === "closed" && !w.parent && (
        <button
          className="row-delete"
          title={`Delete the ${word.one}`}
          aria-label={`Delete ${label(w) ? called(w) : w.name}`}
          onClick={(e) => {
            e.stopPropagation();
            link.act("remove_worker", [w], { worker: w.id }).catch(() => {});
          }}
          // Only Enter and Space stop here, so that the row does not open. The arrows go on to the list (App).
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.stopPropagation()}
        >
          <Icon name="trash" size={phone ? 20 : 15} />
        </button>
      )}
      {w.status !== "closed" && (
        <button
          className="close-check"
          title={`Close the ${word.one}`}
          aria-label={`Close ${called(w)}`}
          data-closing={closing || undefined}
          // Enter or Space on this button closes the agent, and does not open its row.
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (closing) return;
            setClosing(true);
            haptics(["rigid", "heavy", "soft"], 70);
            ding();
            // The row flicks out to the right, then its height closes, so the rows under it move up. The close then
            // takes away a row of no height, and nothing jumps.
            const row = e.currentTarget.closest<HTMLElement>(".worker.row");
            const still = !row || matchMedia("(prefers-reduced-motion: reduce)").matches;
            const out = still ? [] : [
              row.animate([{ translate: "0 0", opacity: 1 }, { translate: "100% 0", opacity: 0 }], { duration: 190, delay: 110, easing: "cubic-bezier(0.55, 0, 0.75, 0.2)", fill: "forwards" }),
              collapse(row, 260),
            ];
            const back = () => (setClosing(false), out.forEach((a) => a.cancel()));
            setTimeout(() => link.act("close_worker", [w], { worker: w.id }, undefined, false).catch(back), still ? 0 : 460);
          }}
        >
          {/* A plain check, as the checkmark of iOS, in a small glass circle that sits in the row. */}
          <span className="check-glass">
            <Icon name="tick" size={phone ? 16 : 13} />
          </span>
        </button>
      )}
    </span>
  );
}

// A location that the user attached (attachLocation): "My location: lat, lon (within n m)", and the link of Apple Maps
// on the next line.
const LOCATION = /My location: (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)[^\n]*(?:\n(https:\/\/maps\.apple\.com\/\S*))?/g;
const placeOf = (text: string) => {
  const m = [...text.matchAll(LOCATION)][0];
  return m && { lat: Number(m[1]), lon: Number(m[2]), href: m[3] };
};
// The word "ultrathink" in a prompt asks Claude Code for deeper reasoning on that turn: it tests /\bultrathink\b/i on
// each prompt. As in Claude Code, each letter of the word has a color of the rainbow (.ultrathink in app.css).
function rainbow(text: string, rest: (text: string) => ReactNode = (t) => t): ReactNode {
  const parts = text.split(/(\bultrathink\b)/i);
  if (parts.length === 1) return rest(text);
  return parts.map((p, i) =>
    i % 2 ? (
      <span key={i} className="ultrathink">
        {[...p].map((c, j) => <span key={j} style={{ "--i": j } as CSSProperties}>{c}</span>)}
      </span>
    ) : (
      <Fragment key={i}>{rest(p)}</Fragment>
    ),
  );
}

// The text of a message of the user, with a small map in place of each location in it.
function withPlaces(text: string): ReactNode {
  const places: { lat: number; lon: number; href?: string }[] = [];
  const rest = text.replace(LOCATION, (_, lat, lon, href) => (places.push({ lat: Number(lat), lon: Number(lon), href }), "")).trim();
  if (!places.length) return rainbow(text, swatches);
  return (
    <>
      {rest && rainbow(rest, swatches)}
      {places.map((p, i) => <Place key={i} {...p} />)}
    </>
  );
}
// A small map of a place, with a pin in its center: the 3 by 3 tiles of OpenStreetMap around it, at zoom 15, moved so
// that the place is in the center of the card. A tap on a map with a link opens it in Maps. The elements are <i>,
// because the strip of attached images styles each span and each img.
function Place({ lat, lon, href }: { lat: number; lon: number; href?: string }) {
  const z = 15;
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const [tx, ty] = [Math.floor(x), Math.floor(y)];
  const tiles = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ dx, dy })));
  const map = (
    <i className="place-map">
      <i
        className="place-tiles"
        style={{
          backgroundImage: tiles.map(({ dx, dy }) => `url(https://tile.openstreetmap.org/${z}/${tx + dx}/${ty + dy}.png)`).join(", "),
          backgroundPosition: tiles.map(({ dx, dy }) => `${(dx + 1) * 256}px ${(dy + 1) * 256}px`).join(", "),
          transform: `translate(${-(x - tx + 1) * 256}px, ${-(y - ty + 1) * 256}px)`,
        }}
      />
      <i className="place-pin" />
      <i className="place-credit">© OpenStreetMap</i>
    </i>
  );
  if (!href) return <i className="place">{map}</i>;
  return (
    <a className="place" href={href} title="Open in Maps" onClick={(e) => (e.preventDefault(), e.stopPropagation(), haptic(), openLink(href))}>
      {map}
    </a>
  );
}

// A hex color in a text, such as #e5484d or #fff. A short form must have a letter, so that "#123" (an issue number) stays text.
const HEX = /(?<![\w&#])#(?:[0-9a-f]{8}|[0-9a-f]{6}|(?=\d*[a-f])[0-9a-f]{3,4})(?![\w-])/gi;

// A plain text with a small square of the color before each hex color.
function swatches(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(HEX)) {
    out.push(text.slice(last, m.index), <span key={m.index} className="swatch" style={{ background: m[0] }} aria-hidden />);
    last = m.index;
  }
  return out.length ? [...out, text.slice(last)] : text;
}

// The same squares in Markdown: a rehype plugin that splits each text node at its hex colors.
function rehypeSwatches() {
  const walk = (node: any) => {
    if (!node.children) return;
    node.children = node.children.flatMap((c: any) => {
      if (c.type !== "text") return walk(c), [c];
      const parts: any[] = [];
      let last = 0;
      for (const m of c.value.matchAll(HEX)) {
        parts.push({ type: "text", value: c.value.slice(last, m.index) });
        parts.push({ type: "element", tagName: "span", properties: { className: ["swatch"], style: `background:${m[0]}`, ariaHidden: "true" }, children: [] });
        last = m.index;
      }
      return parts.length ? [...parts, { type: "text", value: c.value.slice(last) }] : [c];
    });
  };
  return walk;
}

// A path opens in Finder on the Mac only. The phone shows it as text, because Finder opens on the Mac (MAC_ONLY in src/voice.ts).
const MARKDOWN_PLUGINS = phone ? [rehypeSwatches] : [rehypePaths, rehypeSwatches];

// A tap on a quote of an answer copies its text, such as a draft of a message. A tap on a link and a selection of text
// do not copy.
function Quote({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <blockquote
      className={copied ? "copied" : undefined}
      onClick={(e) => {
        if ((e.target as Element).closest("a") || !getSelection()?.isCollapsed) return;
        const text = e.currentTarget.innerText.trim();
        haptic();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        void (phone ? navigator.clipboard.writeText(text) : yonder.tool("copy_to_clipboard", { text })).catch(() => {});
      }}
    >
      {children}
    </blockquote>
  );
}

// The conversation of one agent: the prompts, the answers in Markdown, and one short line for each tool call.
// It loads again every 3 seconds while the agent runs, and it stays at the bottom when the user is there.
// The box at the bottom sends a message to the agent, as the prompt of Claude Code does.
type Command = { name: string; description: string; terminal?: boolean };

// The spoken brief of each agent, as sound, for the listen button of a conversation: the brief of the summary of the
// bridge (`spoken`), in the Grok voice of the account (/speak). The sound stays until the brief changes, so a replay
// starts at once. An older bridge has no brief, so the points speak.
// A computer with no XAI_API_KEY refuses, and then a staff account speaks with the key of yonder.so (speech). Another
// account gets the error of the bridge. So a staff account needs no key on each computer.
// `direct`: the reply of Walkie-talkie, in which the agent answers as "I" (`walkie`), or the brief when it has none.
const briefs = new Map<string, { spoken: string; sound: Promise<AudioBuffer> }>();
async function briefOf(link: Link, id: string, direct = false) {
  const j = await yonder.chat.summary(id, link.fetch);
  const spoken = (direct && j.walkie) || j.spoken || (j.summary ?? "").replace(/^- /gm, "");
  if (!spoken) throw new Error("No summary yet.");
  const known = briefs.get(id);
  if (known && known.spoken === spoken) return known.sound;
  const voice = saved()?.account.voice || "liora";
  const sound = link
    .fetch("/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: spoken, voice }) })
    .then(async (r) => {
      if (!r.ok && saved()) {
        const site = await speech(spoken, voice).catch(() => r);
        if (site.status !== 403) r = site;
      }
      if (r.ok) return decodeAudio(await r.arrayBuffer());
      const body = await r.text();
      throw new Error((() => { try { return JSON.parse(body).error ?? body; } catch { return body; } })());
    });
  briefs.set(id, { spoken, sound });
  sound.catch(() => briefs.get(id)?.sound === sound && briefs.delete(id));
  return sound;
}
// The chats that the app already has, by agent. An agent that the user opens again shows its last chat at once, while
// the app loads the new one, so that each tap feels instant.
const turnsOf = new Map<string, Turn[]>();
// The Context tab rows of the Settings: the detail ("minimal", "normal" or "verbose"), and the tool calls in a row as
// one line. The blue bubbles of the user are part of the screen style (`bubbles` of its look, src/look.ts). `mods`: the
// Mods row of this device, which shows the Claude Code mods of the agent.
type Look = { detail: string; group: boolean; mods: boolean };
// Older versions of the phone kept the texts of the Chat tab in localStorage.
try {
  localStorage.removeItem("texts");
} catch {}

// A drag back to older messages hides the keyboard, as in Signal. The finger goes down by 10 px or more, so a tap and a
// drag to newer messages keep it.
let dragY = 0;
const dragStart = (e: ReactTouchEvent) => (dragY = e.touches[0].clientY);
const dragHide = (e: ReactTouchEvent) => {
  const el = document.activeElement;
  if (e.touches[0].clientY - dragY > 10 && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) el.blur();
};

// The name of a profile with the percent of its week, such as "Work · 42%". No meter: the name alone.
// The name of a profile with its usage, as "Work · s:25% w:3%": the session, then the week.
// A full session or week shows as "out of usage", as "Work · out of usage".
export const usageLabel = (c: { week?: number; session?: number }) =>
  (c.session ?? 0) >= 100 || (c.week ?? 0) >= 100
    ? "out of usage"
    : [c.session !== undefined && `s:${c.session}%`, c.week !== undefined && `w:${c.week}%`].filter(Boolean).join(" ");
// The usage in the line under the tabs of an agent, as "9% | 36%": the session, then the week, only the numbers.
const usageShort = (c: { week?: number; session?: number }) =>
  usageLabel(c) === "out of usage" ? usageLabel(c) : [c.session, c.week].filter((v) => v !== undefined).map((v) => `${v}%`).join(" | ");
export function profileLabel(name: string, c: { week?: number; session?: number }) {
  const used = usageLabel(c);
  return used ? `${name} · ${used}` : name;
}
// The menus of profiles leave out Claude Code itself (the folder ~/.claude, the login of `claude` in the terminal) when a
// profile of Claude Code has its own account, so each account shows once. It stays while it is the value. Else Claude
// Code and a profile with the same account show twice.
export const pickable = (list: Cli[], value: string) =>
  list.some((c) => c.base === "claude" && c.profile?.own) ? list.filter((c) => c.id !== "claude" || value === "claude") : list;
// WebKit makes a field of field-sizing: content 1 or 2 px narrower than its text and the caret. A caret at the end then
// scrolls the field, and the first letter loses its left edge: "Wireframe" shows as "Nireframe". The width
// of the scroll holds the caret. An empty field keeps field-sizing, so that it fits its placeholder.
const fitField = (e: HTMLInputElement) => ((e.style.width = ""), e.value && (e.style.width = `${e.scrollWidth}px`));

function Conversation({ w, onBack, images, clip, talkClip, attached, onSub, onSite, onLocal, tunnelSuffix, onTalking, calling, sumUp, steer, look, clis, usage }: { w: Worker; onBack: () => void; usage?: ReactNode; calling: boolean; sumUp: boolean; steer?: boolean; look: Look; clis: Clis; clip?: ReactNode; talkClip?: ReactNode; attached?: ReactNode; images: { paths(): Promise<string[]>; sent(paths: string[]): () => void; urls?(): string[]; places?(): string[]; waits?: boolean }; onSub?: (s?: Worker) => void; onSite?: (args: Record<string, unknown>, link?: string) => Promise<unknown>; onLocal?: (site: { port: number } | { worker: string }, link: string) => Promise<unknown>; tunnelSuffix?: string; onTalking?: (on: boolean) => void }) {
  const edge = useSwipeBack(onBack);
  // An agent of another computer loads and acts through the link of that computer (LinkOf).
  const link = useContext(LinkOf);
  // The sub-agents that the agent started, on the Agents tab: 21A, 21B. A tap opens the conversation of one in place
  // of this one, and the back button comes back here. The app tells Grok which sub-agent is open.
  const [subs, setSubs] = useState<Worker[]>([]);
  const [subId, setSubId] = useState("");
  const mine = subs.filter((s) => s.parent === w.id);
  const open = mine.find((s) => s.id === subId);
  useEffect(() => {
    onSub?.(open);
    return () => onSub?.(undefined);
  }, [open?.id, open?.status]);
  const [turns, setTurns] = useState<Turn[] | null>(() => turnsOf.get(w.id) ?? null);
  // The reason when the chat did not load, in the place of the chat, and the number of turns to ask for. A scroll to the
  // top of the Context tab asks for 300 more (`older`), until a load gives no more. A failed load shows its reason and
  // loads again, also for an agent that does not run. Else the Context tab stays blank. The bridge restarts often, and
  // each restart ends the requests.
  const [loadError, setLoadError] = useState("");
  useReport(turns ? "" : loadError);
  const [count, setCount] = useState(300);
  const older = useRef<{ from: number; length: number; done?: boolean }>({ from: 0, length: 0 });
  useEffect(() => ((older.current = { from: 0, length: 0 }), setCount(300), setLoadError("")), [w.id]);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  useReport(sendError);
  const [away, setAway] = useState(false);
  useEffect(() => setAway(false), [w.id]);
  // The messages that the user sent, until the conversation has them. A running agent gets a queued message only
  // when its turn ends, and each load of the conversation must keep the message until then. `seen` counts the user
  // turns with the same words when the message went. `chat` marks a message that the chat had once. The bridge loads
  // only the end of a long transcript, so an old message falls out of it later, and must not show again at the end of
  // the chat.
  // `busy` marks a message that went while the agent worked: it waits, so it gets the dotted edge of a queued message at
  // once. Else a message that goes into the current turn never gets it.
  const [sent, setSent] = useState<{ text: string; seen: number; urls?: string[]; places?: string[]; chat?: true; busy?: boolean }[]>([]);
  useEffect(() => setSent([]), [w.id]);
  // The side question (/btw) and its answer, until the user closes it. A new side question takes its place.
  const [side, setSide] = useState<{ id: string; text: string; answer?: string }>();
  const said =(t: Turn[] | null, text: string) => t?.filter((x) => x.who === "user" && x.text.includes(text.slice(0, 200))).length ?? 0;
  // The queued messages of the bridge, also the ones that Grok queued. They show at the end of the chat with Send now
  // and Edit, and without the blocks that the bridge adds (the voice call, the images). A sent message that is in the
  // queue shows only there. A message with only pictures starts with its blocks, and its pictures show in the bubble,
  // not the words of the <images> block.
  const queued = (w.queue ?? []).map((q) => ({
    q,
    text: q.split(/(?:^|\n\n)<(?:voice-call|images|pasted-text|files|screen-recording|videos|device|from)>/)[0],
    media: [...q.matchAll(/<images>([\s\S]*?)<\/images>/g)].flatMap((m) => m[1].split("\n").filter((l) => l.startsWith("/")).map((src): Media => ({ src, kind: "image" }))),
  }));
  const unseen = (t: Turn[] | null) => sent.filter((s) => said(t, s.text) <= s.seen && !queued.some((x) => x.q.startsWith(s.text)));
  const waiting = unseen(turns).filter((s) => !s.chat);
  // The task of a new agent shows at once as the first message, also before the first load, until the chat has it. The
  // New agent view sends it, so it is not in `sent`. With no result the agent is in its first turn, so an old agent does
  // not show its first task while its chat loads. Else the chat shows "No conversation yet." with "Yondering…" far
  // under it.
  const task = w.status === "running" && !w.result && !turns?.length ? w.task?.trim() : "";
  // The sent and the queued messages, in the order that the user sent them. A message that the bridge did not queue
  // yet is newer than the queued ones, so it shows under them. A message that Grok queued has no sent message, so it
  // goes first.
  type Pending = { i: number; s: (typeof sent)[number]; x?: undefined } | { i: number; x: (typeof queued)[number]; s?: undefined };
  const pending = (list: typeof sent): Pending[] =>
    [...list.map((s) => ({ i: sent.indexOf(s), s })), ...queued.map((x) => ({ i: sent.findIndex((s) => x.q.startsWith(s.text)), x }))]
      .sort((a, b) => a.i - b.i);
  // The microphone of the prompt box opens a small talk bar (Talk with compact) in place of the prompt box, until the
  // message goes, Escape, the back button or a call. The conversation stays on the screen, so the user can read the
  // chat while they talk. The back button goes back to the agents, and the end of the talk bar drops the words.
  const [talking, setTalking] = useState(false);
  // The words so far of the talk bar fill a bubble of the user at the end of the chat, with the text
  // that was in the box before them, as the message that goes. A new word keeps the end in view only while the user is
  // there, so a user who scrolled up keeps the place.
  const [heard, setHeard] = useState("");
  useEffect(() => void (talking || setHeard("")), [talking]);
  const live = talking && heard.trim() ? [draft.trim(), heard.trim()].filter(Boolean).join(" ") : "";
  useEffect(() => void (calling && setTalking(false)), [calling]);
  useEffect(() => setTalking(false), [w.id]);
  useEffect(() => (onTalking?.(talking), () => onTalking?.(false)), [talking]);
  // The slash commands, as in Claude Code: "/" shows the skills and the commands that start with the typed name.
  const [commands, setCommands] = useState<Command[] | null>(null);
  const [pick, setPick] = useState(0);
  const [hidden, setHidden] = useState(false);
  const typing = /^\/\S*$/.test(draft) && !hidden;
  // Each CLI has its own commands, and the view stays when another agent opens.
  useEffect(() => setCommands(null), [w.path, w.cli]);
  useEffect(() => {
    if (!typing || commands) return;
    yonder.chat.commands(w.path, w.cli, link.fetch).then(setCommands, () => {});
  }, [typing, commands, w.path, w.cli]);
  const query = draft.slice(1).toLowerCase();
  const matches = typing
    ? (commands ?? [])
        .filter((c) => c.name.toLowerCase().includes(query))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(query)) - Number(!b.name.toLowerCase().startsWith(query)))
        .slice(0, 8)
    : [];
  const choose = (c: Command) => {
    setDraft(`/${c.name} `);
    setPick(0);
  };
  const box = useRef<HTMLOListElement>(null);
  const bottom = useRef(true);
  // The views of the agent: Context (the whole conversation, "chat"), and Canvas and Subagents when the agent has them. A
  // tap on a tab changes the view, and a swipe to the right on a view goes back. The Context panel stays mounted, but it
  // loses its scroll position while it is hidden, so stick takes it back to the end. With only the Context view the tabs
  // hide. The line under the head has all the dropdowns.
  const [view, setView] = useState("chat");
  // The Canvas view: the apps of this agent (docs/canvas.md), the newest first. It shows only for an agent with an app.
  // A task can send several apps. The tab has no count, because "Canvas 1" reads as a name.
  const made = useCanvas(true, link.far ? link.fetch : bridgeFetch, 15_000).filter((a) => a.worker === w.id);
  // What the Claude Code mods of the agent show (src/Mods.tsx): the band over the message box, the status lines and the
  // toasts under it, and the panes beside the chat. The app asks each 5 seconds, also while the agent waits, because a mod can change then too. An agent of another CLI, a
  // sub-agent and a session that Yonder did not start have no mod of Yonder.
  const [mods, setMods] = useState<Mods>({});
  useEffect(() => setMods({}), [w.id]);
  useEffect(() => {
    if (!look.mods || w.cli || w.kind || w.parent || w.status === "closed") return setMods({});
    let live = true;
    const load = () => yonder.chat.mods(w.id, link.fetch).then((m: Mods) => live && setMods((old) => (JSON.stringify(old) === JSON.stringify(m) ? old : m)), () => {});
    load();
    const timer = setInterval(load, 5000);
    return () => ((live = false), clearInterval(timer));
  }, [w.id, w.status, look.mods]);
  const tabNames = [...(made.length ? ["canvas"] : []), "chat", ...(mine.length ? ["agents"] : [])];
  const shown = tabNames.includes(view) ? view : "chat";
  // On the Mac, the Chat view keeps the focus in the prompt box, as in the terminal of Claude Code. The box gets
  // the focus when the Chat view opens, and again after each click in the chat. A click that selects text, or a click
  // on a picture, a video or a sound, keeps its own focus.
  const prompt = useRef<HTMLTextAreaElement>(null);
  const focusPrompt = () => !phone && prompt.current?.focus({ preventScroll: true });
  useEffect(() => void (shown === "chat" && finding === null && focusPrompt()), [shown, w.id]);
  // On the phone, the message box floats over the end of the content, so the lists and the blur at the bottom need its
  // height (--foot on the sheet). It changes with the lines of the text, the slash commands and the talk view.
  const foot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = foot.current;
    if (!el) return;
    const watch = new ResizeObserver(() => el.parentElement?.style.setProperty("--foot", `${el.offsetHeight}px`));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  // The first render of the chat waits until the call row has shrunk. The row animates its height on the main thread,
  // and a long chat blocks it for 100 ms or more, so the height jumps. The fetch starts at once.
  const [shrunk] = useState(() => new Promise((r) => setTimeout(r, 400)));
  // A load that fails, or gets no answer in 20 seconds, goes again every 3 seconds, also for an agent that does not run.
  // Claude Code can say that a turn ended before the transcript has the last answer. So for 60 seconds after a new
  // status, the chat loads again until its last turn is an answer. Else one load at the end can come too early, and a
  // done agent shows its last tool call with no answer.
  useEffect(() => {
    let busy = false;
    let ok = false;
    let answered = false;
    const since = Date.now();
    let live = true;
    let misses = 0;
    const load = () => {
      if (busy) return;
      busy = true;
      // No answer in 20 seconds is also a miss of the network (`dropped`), because the Mac may still have the request.
      const late = new Promise<never>((_, no) => setTimeout(() => no(Object.assign(new Error("The Mac did not answer."), { dropped: true })), 20_000));
      Promise.all([Promise.race([yonder.chat.get<Turn>(w.id, link.fetch, count), late]), shrunk])
        .then(([t]) => {
          // An answer for the count before a scroll to the top is old.
          if (!live) return;
          ok = true;
          misses = 0;
          setLoadError("");
          // With no older turns, the next turn of a running agent must not move the view.
          if (older.current.from && t.length <= older.current.length) older.current = { from: 0, length: 0, done: true };
          answered = t.at(-1)?.who === "assistant";
          turnsOf.set(w.id, t);
          // The same conversation keeps the old array, so the chat does not render again.
          setTurns((old) => (JSON.stringify(old) === JSON.stringify(t) ? old : t));
        }, (e) => {
          if (!live) return;
          ok = false;
          // The first network miss during a restart shows nothing. The timer loads again in 3 seconds.
          // The reason shows when the next load also fails, and the first miss does not go to Sentry (YONDER-B).
          // A drop of the socket of the phone (`dropped` or `offline` in src/link.ts) is also a miss of the network, so
          // "The relay closed the connection." does not go to Sentry (YONDER-11). The first answer that does not come
          // in 20 seconds does not show at once.
          misses += 1;
          const { dropped, offline } = (e ?? {}) as { dropped?: boolean; offline?: boolean };
          if (misses === 1 && (bridgeDown(e) || dropped || offline)) return;
          setLoadError((e as Error)?.message || "The chat did not load.");
        })
        .finally(() => (busy = false));
      if (!w.parent)
        yonder.chat.subagents(w.id, link.fetch)
          .then((s) => setSubs((old) => (JSON.stringify(old) === JSON.stringify(s) ? old : s)), () => {});
    };
    load();
    const timer = setInterval(() => (w.status === "running" || !ok || (!answered && Date.now() - since < 60_000)) && load(), 3000);
    return () => ((live = false), clearInterval(timer));
  }, [w.id, w.status, count]);
  // A sent message leaves when the chat has it.
  useEffect(() => {
    const chat = (s: (typeof sent)[number]) => s.chat || said(turns, s.text) > s.seen;
    setSent((list) => (list.some((s) => chat(s) !== !!s.chat) ? list.map((s) => (chat(s) ? { ...s, chat: true as const } : s)) : list));
  }, [turns]);
  // The app renders each second (the clock and the poll), and each keystroke renders this view. The Markdown of a
  // long chat takes 100 ms or more, and it stalls the spring of the call button. So the chat renders only when the
  // turns change. A localhost link opens on the phone through Yonder Preview, because the phone cannot reach localhost.
  // The Mac opens it in its browser, as Preview does on the Mac. The chat renders only when the turns change, so it
  // reads the handler from a ref.
  const localRef = useRef(onLocal);
  localRef.current = onLocal;
  const suffixRef = useRef(tunnelSuffix);
  suffixRef.current = tunnelSuffix;
  const openHref = (href: string) => {
    if (!phone && isPath(href)) return void yonder.tool("open_folder", { path: href }).catch((e) => setSendError((e as Error).message));
    const site = localRef.current && linkSite(href, suffixRef.current);
    // A new tap clears the last error, so a link that opens does not keep the red line.
    if (site) (setSendError(""), localRef.current!(site, href).catch((e) => setSendError((e as Error).message)));
    else openLink(href);
  };
  // Tunnel in the three dots opens the last site of the chat, a localhost address or a private address of the tunnel,
  // else the site of the agent, so the user does not look for the link. On the Mac a localhost site opens in the viewer
  // of the apps, as a site of the Canvas tab. Else it opens as a tap on its link.
  const siteUrl = useMemo(
    () =>
      (turns ?? []).filter((t) => t.who === "user" || t.who === "assistant").flatMap((t) => urlsOf(t.text)).reverse().find((u) => localPort(u) || linkSite(u, tunnelSuffix)) ??
      (w.site && `http://localhost:${w.site.port}`),
    [turns, tunnelSuffix, w.site?.port],
  );
  const openTunnel = (url: string) => (!phone && isLocal(url) ? showArtifact({ path: url, title: new URL(url).host }) : openHref(url));
  // The phone keeps the pictures of the chat until the agent closes. A sub-agent keeps them with its parent.
  const owner = w.status === "closed" ? undefined : (w.parent ?? w.id);
  // Each tool call shows open, as in the terminal of Claude Code, and a tap opens its full input and result (ToolTurn).
  // The Context tab rows of the Settings (look) choose: Minimal shows only the
  // messages and the pictures, Normal is the terminal, Verbose opens the thinking and each full command, and Group puts
  // the tool calls in a row in one closed line with their count again.
  // shortcut: Verbose opens no full result by itself, because each /tool call reads the whole transcript. A tap opens it.
  const chat = useMemo(() => {
    const out: ReactNode[] = [];
    let group: ReactNode[] = [];
    const flush = () => {
      if (group.length)
        out.push(
          <li key={`g${out.length}`} className="tool-group">
            <details>
              <summary>
                {group.length} tool {group.length === 1 ? "call" : "calls"}
                <Icon name="down" size={10} />
              </summary>
              <ol>{group}</ol>
            </details>
          </li>,
        );
      group = [];
    };
    turns?.forEach((t, i) => {
      if (look.detail === "minimal" && (t.who === "tool" || t.who === "thinking")) {
        if (t.media) (flush(), out.push(<li key={i} className="tool-media"><MediaRow media={t.media} owner={owner} /></li>));
        return;
      }
      // Claude Code writes "[Request interrupted by user]" as a user turn after a stop. It shows as "Interrupted", in the
      // place of "Yondering…".
      const item = t.who === "user" && t.text.startsWith("[Request interrupted by user") ? (
        <li key={i} className="yondering">Interrupted</li>
      ) : t.who === "user" ? (
        <UserTurn key={i} text={t.text} pictures={t.media && <MediaRow media={t.media} owner={owner} />} />
      ) : t.who === "tool" && t.id ? (
        <ToolTurn key={t.id} t={t} worker={w.id} media={t.media && <MediaRow media={t.media} owner={owner} />} />
      ) : t.who === "thinking" ? (
        // The thinking of the agent is closed, as in the terminal, and a tap opens it.
        <li key={i} className="thinking">
          <details open={look.detail === "verbose"}>
            <summary>✻ Thinking…</summary>
            <div>{t.text}</div>
          </details>
        </li>
      ) : (
        <li key={i} className={t.who}>
          {t.who === "assistant" ? (
            // The media row under the answer shows the pictures, so a Markdown image shows nothing.
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={MARKDOWN_PLUGINS} components={{ a: (p) => <a href={p.href} title={p.href} onClick={(e) => { e.preventDefault(); haptic(); if (p.href) openHref(p.href); }}>{p.children}</a>, img: () => null, table: ({ node, ...p }) => <div className="table"><table {...p} /></div>, blockquote: Quote }}>
              {t.text}
            </Markdown>
          ) : t.diff ? (
            <Diff text={t.text} hunks={t.diff} />
          ) : t.media && t.who === "tool" ? (
            <div className="head">{t.text}</div>
          ) : (
            swatches(t.text)
          )}
          {t.media && <MediaRow media={t.media} owner={owner} />}
        </li>
      );
      if (look.group && t.who === "tool" && !t.media) group.push(item);
      else (flush(), out.push(item));
    });
    flush();
    return out;
  }, [turns, look.detail, look.group]);
  // The view stays at the bottom when the user is there: after each load of the conversation, when a picture
  // or a video loads and gets its height, and when the list gets shorter, as when the keyboard of the phone opens.
  // These load events do not bubble, so the list catches them in the capture phase.
  const stick = () => {
    if (bottom.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  };
  // The Chat panel loses its scroll position while it is hidden. A voice note from the Summary view opens the chat and
  // sends at once, and the phone ignores the first scroll then, so the chat stays at the top. So the view goes to the
  // end again in the next frame.
  useLayoutEffect(() => {
    // After a load of older turns, the turns that the user saw stay in the same place: the same distance from the end.
    if (older.current.from && box.current && turns && turns.length > older.current.length) {
      box.current.scrollTop = box.current.scrollHeight - older.current.from;
      older.current.from = 0;
    }
    stick();
    const end = bottom.current;
    const frame = requestAnimationFrame(() => end && box.current && (box.current.scrollTop = box.current.scrollHeight));
    return () => cancelAnimationFrame(frame);
  }, [turns, view, waiting.length, queued.length, side]);
  useLayoutEffect(stick, [live]);
  useEffect(() => {
    const list = box.current;
    for (const type of ["load", "loadedmetadata"]) list?.addEventListener(type, stick, true);
    const resize = new ResizeObserver(stick);
    if (list) resize.observe(list);
    return () => {
      for (const type of ["load", "loadedmetadata"]) list?.removeEventListener(type, stick, true);
      resize.disconnect();
    };
  }, [!open]);
  // Enter sends, Shift Enter makes a new line. A running worker queues the message until its turn ends.
  // The attached images and recordings go with the message, and then leave the screen.
  // Dictation gives the text, because the draft of this render is older.
  const waits = !!images.waits;
  const send = async (text: string | Recorded = draft) => {
    setReplay(false);
    const recorded = typeof text !== "string";
    // The outbox of the computer in use makes the words of a recorded sound, so it cannot go to another computer.
    if (recorded && link.far) return setSendError("The Mac is offline, so it cannot make the words. Type the message.");
    const message = recorded ? "" : text.trim();
    // A message can be only its attachments, such as a location, with no words.
    if (!message && !waits && !recorded) return;
    setDraft("");
    setSendError("");
    bottom.current = true;
    // A side question (/btw) gets its answer at the end of the chat, and the agent does not stop. The conversation never
    // has it, so it is not a sent message, and its images wait for the next message.
    if (/^\/btw(?:\s|$)/.test(message)) {
      const q = { id: w.id, text: message };
      setSide(q);
      link.call("message_worker", { worker: w.id, message }).then(
        // Only the outbox of an offline phone answers with no answer.
        (r) => setSide((s) => (s === q ? { ...q, answer: (JSON.parse(String(r)) as { answer?: string }).answer ?? "The Mac is offline." } : s)),
        (e) => (setSide((s) => (s === q ? undefined : s)), setDraft(message), setSendError((e as Error).message)),
      );
      return;
    }
    // A sub-agent gets the words from its agent, so this conversation may never get them.
    // The message shows at once with the pictures that go with it, before the bridge has it, so that the chat feels
    // quick.
    const slashed = message.startsWith("/");
    const msg = { text: message, seen: said(turns, message), urls: slashed ? [] : images.urls?.(), places: slashed ? [] : images.places?.(), busy: w.status === "running" && !steer };
    // A dictation of an offline Mac has no words yet, so it shows no message.
    if (w.kind !== "terminal" && !w.parent && !recorded) setSent((s) => [...s, msg]);
    // A slash command goes alone. The images wait for the next message.
    const slash = message.startsWith("/");
    const attached = slash ? [] : await images.paths();
    // The images leave the screen at once too, and come back when the bridge does not take the message.
    const back = attached.length ? images.sent(attached) : undefined;
    const args = { worker: w.id, message: recorded ? text : message, ...next, ...(attached.length ? { files: attached } : {}) };
    // An agent that is done, failed or closed runs again with the message, so it shows as running at once, and the back
    // goes to the Agents tab. It does not wait for the bridge.
    const wakes = !w.kind && !w.parent && w.status !== "running" && w.status !== "waiting";
    (wakes ? link.act("message_worker", [w], args, { status: "running" }, false) : link.call("message_worker", args)).then(() => {
      setNext({});
      if (recorded) setSendError("The Mac is offline. The message goes when the Mac is back.");
      // A built-in command shows on the screen of Claude Code, so it opens in Ghostty.
      const name = message.slice(1).split(/\s/)[0];
      if (slash && !phone && !w.kind && commands?.find((c) => c.name === name)?.terminal) yonder.tool("open_in_terminal", { worker: w.id }).catch(() => {});
    }, (e) => {
      back?.();
      setSent((s) => s.filter((x) => x !== msg));
      setDraft(message);
      setSendError((e as Error).message);
    });
  };
  // Stop ends the current turn, as Escape does in Claude Code, and the agent waits for the next message. With queued
  // messages, Stop sends them at once in place of the rest of the turn, as Send now does. A second Stop then stops that
  // turn too, and its messages stay in the conversation, so the next message continues from them.
  // Send now sends the queue at once in place of the rest of the turn. Edit takes a queued message out of the queue and
  // puts its words back in the prompt box; the images of that message stay behind. Delete takes it out of the queue and
  // drops it.
  const canStop = w.status === "running" && !w.kind && !w.parent;
  // A message that went into the turn that runs waits too, so Stop and Escape send it, not only the queue of the bridge.
  const toSend = queued.length > 0 || waiting.some((s) => s.busy);
  // With `one`, only that queued message goes now, and the others wait for the end of its turn. Else a tap on one bubble
  // sends all the queued messages as one turn.
  // Stop, Send now, Edit and Delete change the screen at once (act), and the bridge answers later. A failed call puts
  // the agent back. So no tap waits for the bridge.
  // The agent got the message already when the bridge has it no more: then the list is only old.
  const failed = (e: unknown) => /has no queued message/.test((e as Error).message) || setSendError((e as Error).message);
  const stop = (send?: boolean, one?: { q: string; text: string }) => {
    haptic();
    const rest = one ? w.queue?.filter((q) => q !== one.q) : [];
    // A message that Grok queued has no sent message, so it shows as sent until the chat has it.
    if (one && !sent.some((s) => one.q.startsWith(s.text))) setSent((s) => [...s, { text: one.text, seen: said(turns, one.text) }]);
    // The messages that go now lose their dotted edge at once, so a second Escape does not look needed.
    if (send) setSent((s) => s.map((x) => (x.busy && (!one || (x.text && one.q.startsWith(x.text))) ? { ...x, busy: false } : x)));
    const patch: Partial<Worker> = send ? { status: "running", queue: rest?.length ? rest : undefined } : { status: "waiting" };
    link.act("stop_worker", [w], { worker: w.id, ...(send ? { send } : {}), ...(one ? { message: one.q.slice(0, 200) } : {}) }, patch, false).catch(failed);
  };
  const edit = ({ q, text }: { q: string; text: string }, drop?: boolean) => {
    haptic();
    setSent((s) => s.filter((x) => !q.startsWith(x.text)));
    if (!drop) {
      setDraft((d) => [text, d.trim()].filter(Boolean).join("\n"));
      focusPrompt();
    }
    const rest = w.queue?.filter((x) => x !== q);
    link.act("unqueue", [w], { worker: w.id, message: q.slice(0, 200) }, { queue: rest?.length ? rest : undefined }, false).catch(failed);
  };
  const canDone = w.status !== "done" && w.status !== "failed" && !w.kind && !w.parent;
  const canClose = w.status !== "closed" && w.status !== "running" && !w.parent;
  // The listen button at the top right speaks the brief of the last answer. A second tap stops it, and the next tap
  // plays it again. The message box stays, so the user replies as they want. So a review needs no voice call.
  // "load" while the brief loads, "say" while it speaks: a stop button over the message box shows in both.
  const [listening, setListening] = useState<"" | "load" | "say">("");
  const run = useRef(0);
  // Replay shows over the message box after a reply of Walkie-talkie, until the user talks, sends or leaves.
  const [replay, setReplay] = useState(false);
  const hushBrief = () => (run.current++, hush(), setListening(""));
  const hear = (direct = false) => {
    haptic();
    const mine = ++run.current;
    hush();
    const release = holdAudio();
    setListening("load");
    setReplay(false);
    setSendError("");
    briefOf(link, w.id, direct).then(
      (b) => (mine === run.current ? (setListening("say"), say(b, () => (release(), mine === run.current && (setListening(""), setReplay(direct))))) : release()),
      (e) => (release(), mine === run.current && (setListening(""), setSendError((e as Error).message))),
    );
  };
  // Walkie-talkie (Settings, Voice): after a voice note, the brief of the answer plays aloud when the turn of the agent
  // ends, as Listen does. The audio is held from the voice note, because iOS starts a sound only near a tap. "sent" until
  // the agent runs, then "running".
  const walkieTurn = useRef<{ phase: "sent" | "running"; release: () => void }>(undefined);
  const endWalkie = () => (walkieTurn.current?.release(), (walkieTurn.current = undefined));
  useEffect(() => {
    const t = walkieTurn.current;
    if (!t) return;
    if (w.status === "running") t.phase = "running";
    else if (t.phase === "running") (hear(true), endWalkie());
  }, [w.status]);
  // Another agent that opens in this view, or a call, ends the brief.
  useEffect(() => (hushBrief(), endWalkie(), setReplay(false)), [w.id]);
  useEffect(() => void (calling && (hushBrief(), endWalkie())), [calling]);
  useEffect(() => () => (hushBrief(), endWalkie()), []);
  // The three dots also change the model, the effort, the permission mode and the profile. A running agent stops its turn and continues at once on the
  // new one, as when Grok changes it. Any other agent gets the change with its next message, so the change starts no
  // turn. Yonder cannot change a terminal session, so it has no such menu. With the profile menu, an agent can continue
  // on another account.
  const canModel = !w.kind && !w.parent;
  const [next, setNext] = useState<{ model?: string; effort?: string; mode?: string; profile?: string }>({});
  // The action sheet of a theme in place of the native menu of the three dots (src/ask.tsx).
  const [acting, setActing] = useState(false);
  useEffect(() => setNext({}), [w.id]);
  // Each CLI that is on, and each profile of those CLIs. A choice of another CLI copies the conversation on the next message.
  // The list gives the profile name. The menu stores the id.
  const cliId = w.cli ?? "claude";
  const cliReady = (id: string) => id === cliId || id === "claude" || clis.clis.some((c) => c.id === id && !c.base && c.on);
  const profileChoices = pickable(clis.clis.filter((c) => cliReady(c.base ?? c.id)), next.profile ?? w.profile ?? cliId);
  const change = (c: { model?: string; effort?: string; mode?: string; profile?: string }) => {
    // A model picked for the old profile may not exist in the CLI of the new one.
    if (w.status !== "running") return setNext((n) => ({ ...n, ...(c.profile !== undefined && !c.model ? { model: undefined } : {}), ...c }));
    // The list shows the profile name. The CLI itself has no profile.
    const patch: Partial<Worker> = {};
    if (c.model) patch.model = c.model;
    if (c.effort) patch.effort = c.effort;
    if (c.mode) patch.mode = c.mode;
    if (c.profile !== undefined) {
      const choice = profileChoices.find((x) => x.id === c.profile);
      const owner = choice ? (choice.base ?? choice.id) : cliId;
      patch.profile = choice?.base ? choice.name : undefined;
      if (owner !== cliId) {
        patch.cli = owner === "claude" ? undefined : owner;
        patch.model = undefined;
      }
    }
    link.act("message_worker", [w], { worker: w.id, message: ".", ...c }, patch, false).catch((e) => setSendError((e as Error).message));
  };
  // An agent in another CLI gets the models, the efforts and the modes of its CLI. A menu with no values does not show.
  // A profile that waits for the next message uses the menus of that CLI.
  const nextProfile = profileChoices.find((c) => c.id === next.profile);
  const profileNow = profileChoices.find((c) => c.id === (next.profile ?? w.profile ?? cliId) || c.name === (next.profile ?? w.profile ?? cliId));
  // The part of the context window in use, for the bar of the head and the number in the line under it.
  const usedPct = w.context?.window ? Math.min(100, (100 * w.context.used) / w.context.window) : 0;
  const viewCli = nextProfile ? (nextProfile.base === "claude" ? undefined : (nextProfile.base ?? (nextProfile.id === "claude" ? undefined : nextProfile.id))) : w.cli;
  const info = viewCli ? cliInfo[viewCli] : undefined;
  // The model of the agent shows only while the menus are of its own CLI. A profile of another CLI starts on its default model.
  const ownModel = viewCli === w.cli ? w.model : undefined;
  const settings = [
    // The profile. A profile of another CLI shows the CLI name. Each row shows the week of that profile.
    ...(profileChoices.length > 1
      ? [{
          key: "profile",
          name: "Profile",
          icon: "user" as const,
          value: profileNow?.id ?? cliId,
          options: profileChoices.map((c) => {
            const cli = c.base && c.base !== cliId ? clis.clis.find((x) => x.id === c.base && !x.base)?.name : "";
            return { value: c.id, name: profileLabel(cli ? `${c.name} · ${cli}` : c.name, c) };
          }),
        }]
      : []),
    info
      ? { key: "model", name: "Model", icon: "cpu" as const, value: next.model ?? ownModel ?? "", options: [...new Set([...info.models, ...(ownModel ? [ownModel] : [])])].map((m) => ({ value: m, name: m })) }
      : { key: "model", name: "Model", icon: "cpu" as const, value: next.model ?? (ownModel ?? "opus").replace(/^claude-/, "").split("-")[0], options: MODELS.map((m) => ({ value: m.alias, name: m.name })) },
    { key: "effort", name: "Effort", icon: "gauge" as const, value: next.effort ?? w.effort ?? "", options: (info ? info.efforts : EFFORTS).map((e) => ({ value: e, name: e[0].toUpperCase() + e.slice(1) })) },
    { key: "mode", name: "Permissions", icon: "shield" as const, value: next.mode ?? w.mode ?? "bypassPermissions", options: (info ? info.modes : MODES).map((m) => ({ value: m.mode, name: m.name })) },
  ].filter((s) => s.options.length);
  // ⌘R (renameKey of Settings › Keys), Rename in the three dots or a double click on the name renames the agent in place,
  // as a double click on the name of its row (WorkerRow).
  // The number stays, and only the name changes. A sub-agent cannot be renamed.
  const [renaming, setRenaming] = useState<string | null>(null);
  const canRename = !w.parent;
  // The menu gives the focus back to the three dots when it closes, so the field of the name waits for that.
  // shortcut: a fixed wait of 300 ms, as Rename of an app; the finalFocus of the menu, if it ever takes the field away.
  const startRename = () => setTimeout(() => setRenaming(w.name), 300);
  // The row shows at most two actions, so the name stays wide. A running agent shows Stop and the three dots.
  // Any other agent that can close shows the check and the three dots. The three dots hold the settings and the
  // other actions.
  const canListen = sumUp && !calling && !w.parent && w.status !== "running";
  const canSave = !w.kind && !w.parent && w.status !== "running";
  const canTerm = !w.kind && !w.parent && !phone;
  const canLink = linkable(w);
  const copyLink = () => copyAgentLink(w);
  // The same menu as a native menu of iOS, on the native three dots of the iPhone (src/chrome.ts): the page sends the
  // items, and a choice comes back here. Close is the check at the top right, so the menu has no Close. The items have
  // no icons on the phone: the menu is plain.
  const moreItems: ChromeMenuItem[] = [
    ...(canModel
      ? settings.map((s) => ({
          id: s.key,
          title: s.name,
          detail: s.options.find((o) => o.value === s.value)?.name ?? s.value,
          items: s.options.map((o) => ({ id: `${s.key}:${o.value}`, title: o.name, checked: o.value === s.value })),
        }))
      : []),
    ...(siteUrl ? [{ id: "tunnel", title: "Tunnel" }] : []),
    ...(canListen ? [{ id: "listen", title: listening ? "Stop" : "Listen" }] : []),
    ...(canSave ? [{ id: "save", title: w.saved ? "Unsave" : "Save for later" }] : []),
    ...(canTerm ? [{ id: "terminal", title: `Open this session in ${cliName(w.cli)}, in ${ghostty ? "Ghostty" : "the terminal"}` }] : []),
    ...(canRename ? [{ id: "rename", title: "Rename" }] : []),
    ...(canLink ? [{ id: "link", title: "Copy Link" }] : []),
    ...(canDone ? [{ id: "complete", title: "Complete" }] : []),
  ];
  useEffect(() => {
    menus.set("more", (item) => {
      if (item === "rename") return void startRename();
      if (item === "link") return copyLink();
      if (item === "tunnel") return void (siteUrl && openTunnel(siteUrl));
      if (item === "listen") return void (listening ? hushBrief() : hear());
      if (item === "save") return void (onBack(), saveLater(link.act, w));
      if (item === "terminal") return void yonder.tool("open_in_terminal", { worker: w.id }).catch((e) => setSendError((e as Error).message));
      if (item === "complete") return void (onBack(), link.act("close_worker", [w], { worker: w.id, done: true }, PATCH.complete_worker).catch(() => {}));
      const at = item.indexOf(":");
      change({ [item.slice(0, at)]: item.slice(at + 1) });
    });
    return () => void menus.delete("more");
  });
  // ⇧⌘D (talkKey of Settings › Keys) opens the talk bar, as the microphone of the prompt box does. An open sub-agent keeps the key for itself.
  useEffect(() => {
    if (open || calling || talking) return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !hit(e, "talkKey")) return;
      e.preventDefault();
      setSendError("");
      setTalking(true);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, calling, talking]);
  // The key of the voice note (right ⌥) opens the talk bar too while the window is in front: the Mac app sends talk-key
  // in place of the voice note (tap_key of src-tauri/src/main.rs).
  useEffect(() => {
    if (!inTauri || open || calling || talking) return;
    const stop = listen("talk-key", () => ((keyPress.started = true), setSendError(""), setTalking(true)));
    return () => void stop.then((unlisten) => unlisten());
  }, [open, calling, talking]);
  // ⌘↩ (closeKey) closes the agent, as the check at the top right does, and goes back.
  // A running agent closes too: it stops first. A sub-agent only goes back.
  useEffect(() => {
    if (open) return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !hit(e, "closeKey")) return;
      e.preventDefault();
      onBack();
      if (w.status !== "closed" && !w.parent) (ding(), link.act("close_worker", [w], { worker: w.id }).catch(() => {}));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  // ⌘E (effortKey of Settings › Keys) moves the effort one step up, and from the highest effort back to the lowest. The new effort shows at once. A
  // running agent gets it one second after the last press, so a few presses stop its turn only one time.
  const effortTimer = useRef(0);
  useEffect(() => {
    const efforts = info ? info.efforts : EFFORTS;
    if (open || !canModel || !efforts.length) return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !hit(e, "effortKey")) return;
      e.preventDefault();
      const effort = efforts[(efforts.indexOf(next.effort ?? w.effort ?? "") + 1) % efforts.length];
      setNext((n) => ({ ...n, effort }));
      if (w.status !== "running") return;
      clearTimeout(effortTimer.current);
      effortTimer.current = window.setTimeout(() => (setNext(({ effort: _, ...n }) => n), change({ effort })), 1000);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => () => clearTimeout(effortTimer.current), [w.id]);
  // ⌘R (renameKey) opens the field of the name (see canRename above).
  useEffect(() => {
    if (open || !canRename) return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !hit(e, "renameKey")) return;
      e.preventDefault();
      setRenaming(w.name);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, canRename, w.name]);
  // ⌘F (findKey) opens a field in place of the name that finds words in the chat: each match gets a mark (CSS.highlights,
  // ::highlight(find) in src/app.css), Enter goes to the next one, ⇧Enter to the one before, and Escape closes the field.
  // The scope is the chat only, so a row of the list behind the sheet never matches.
  // shortcut: only the loaded turns match (300, more on a scroll up), and a match across two styles of text does not;
  // ask the bridge for the whole conversation if the user misses the older turns.
  const [finding, setFinding] = useState<string | null>(null);
  const [findAt, setFindAt] = useState(0);
  const [findCount, setFindCount] = useState(0);
  const findField = useRef<HTMLInputElement>(null);
  const found = useRef<Range[]>([]);
  useEffect(() => setFinding(null), [w.id]);
  useEffect(() => {
    if (open) return;
    const key = (e: KeyboardEvent) => {
      // The Settings over the agent keep ⌘F for their own search.
      if (e.repeat || !hit(e, "findKey") || document.querySelector(".page")) return;
      e.preventDefault();
      setView("chat");
      setFinding((f) => f ?? "");
      requestAnimationFrame(() => findField.current?.select());
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  const findNow = findCount ? ((findAt % findCount) + findCount) % findCount : 0;
  useEffect(() => {
    const marks = typeof Highlight === "undefined" ? undefined : CSS.highlights;
    const words = finding?.trim() ?? "";
    const ranges: Range[] = [];
    if (words && box.current) {
      const walk = document.createTreeWalker(box.current, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode())
        for (const at of places(n.textContent ?? "", words)) {
          const r = new Range();
          r.setStart(n, at);
          r.setEnd(n, at + words.length);
          ranges.push(r);
        }
    }
    found.current = ranges;
    setFindCount(ranges.length);
    if (!words) return;
    const now = ranges.length ? ranges[((findAt % ranges.length) + ranges.length) % ranges.length] : undefined;
    marks?.set("find", new Highlight(...ranges));
    marks?.set("find-now", new Highlight(...(now ? [now] : [])));
    return () => void (marks?.delete("find"), marks?.delete("find-now"));
  }, [finding, findAt, turns]);
  // Only a new word or Enter scrolls, so a new turn of a running agent does not move the chat.
  useEffect(() => {
    const r = found.current;
    if (r.length) r[((findAt % r.length) + r.length) % r.length].startContainer.parentElement?.scrollIntoView({ block: "center" });
  }, [finding, findAt]);
  const rename = () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (name && name !== w.name) link.act("rename_worker", [w], { worker: w.id, name }, { name }, false).catch(() => {});
  };
  if (open) return <Conversation key={open.id} w={open} onBack={() => setSubId("")} images={images} clip={clip} talkClip={talkClip} attached={attached} onSite={onSite} onLocal={onLocal} tunnelSuffix={tunnelSuffix} onTalking={onTalking} calling={calling} sumUp={sumUp} look={look} clis={clis} usage={usage} />;
  return (
    <>
      {/* On the Mac, the row is in the place of the title bar, next to the traffic lights, so it moves the window. */}
      <div ref={edge} className={`convo-head ${w.status}`} data-tauri-drag-region={phone ? undefined : ""}>
        {/* On the Mac, the session and the weekly usage of the title bar stay in the top bar, after the traffic lights,
            at the same place as in the title bar. The phone has no room for it next to the name. */}
        {!phone && usage && <span className="status">{usage}</span>}
        <button className="icon" data-native="back" data-icon="back" data-glyph="22" onClick={onBack} title="Back" aria-label={`Back to the ${word.many}`}>
          <Icon name="back" />
        </button>
        {/* The row has only the name, in the center. The name starts with
            the number, as "#1 Fix the tabs", on the phone and on the Mac. Under the name, small, is the project of the
            agent, so the user sees where it works, also after a move. */}
        <span className="head-name">
        <span className="name" onDoubleClick={() => canRename && finding === null && setRenaming(w.name)}>
          {finding !== null ? (
            <>
              <input
                className="rename"
                ref={findField}
                value={finding}
                placeholder="Find"
                autoFocus
                onChange={(e) => (fitField(e.target), setFinding(e.target.value), setFindAt(0))}
                onBlur={() => !finding.trim() && setFinding(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) e.preventDefault(), setFindAt((i) => i + (e.shiftKey ? -1 : 1));
                  if (e.key === "Escape") e.stopPropagation(), setFinding(null), focusPrompt();
                }}
                aria-label="Find in the chat"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {finding.trim() && <span className="find-count">{findCount ? `${findNow + 1}/${findCount}` : "0"}</span>}
            </>
          ) : (
          <>
          {/* In the names and projects modes, the name in place of the number: "Jack · Fix the tabs". */}
          {tag(w) && (tag(w) === label(w) ? `#${label(w)} ` : `${tag(w)} · `)}
          {renaming === null ? w.name : (
            <input
              className="rename"
              value={renaming}
              size={Math.max(renaming.length, 4)}
              autoFocus
              onFocus={(e) => (fitField(e.currentTarget), e.currentTarget.select())}
              onChange={(e) => (fitField(e.target), setRenaming(e.target.value))}
              onBlur={(e) => (e.currentTarget.dataset.cancel ? setRenaming(null) : rename())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
                if (e.key === "Escape") e.stopPropagation(), (e.currentTarget.dataset.cancel = "1"), e.currentTarget.blur();
              }}
              aria-label={`Rename ${called(w)}`}
            />
          )}
          </>
          )}
        </span>
        <span className="where">
          <Favicon path={w.path} />
          <span>{w.project}</span>
        </span>
        </span>
        {/* The buttons at the right are one box, so that the name centers between them and the back button.
            The box has at most two actions: Stop or the check, and the three dots. */}
        <span className="head-end">
        {/* The stop button of a running agent, at the left of the three dots. */}
        {canStop && (
          <button className="icon halt" data-native="stop" data-icon="stop" data-glyph="18" onClick={() => stop(toSend)} title="Stop (Esc)" aria-label={`Stop the ${word.one}`}>
            <Icon name="stop" />
          </button>
        )}
        {/* A check at the top right closes the agent and goes back. A running agent has Stop in this place, so it has
            no check. It is a white check with no circle, as the back button, on the phone and on the Mac. */}
        {!canStop && w.status !== "closed" && w.status !== "running" && (
          <button className="icon" data-native="done" data-icon="tick" data-glyph="22" onClick={() => (ding(), onBack(), link.act("close_worker", [w], { worker: w.id }).catch(() => {}))} title="Done" aria-label={`Mark ${called(w)} as done`}>
            <Icon name="tick" />
          </button>
        )}
        {/* The three dots hold the model, the effort, the permissions, the profile, Tunnel, Listen, Save for later, Open in
            Ghostty on the Mac, Rename, Copy Link and Complete. Complete goes back to the list, where the agent shows on the Done
            tab. Each icon has the color of the text. The actions are in the menu, not buttons in this row, so the name
            is not cut. */}
        {moreItems.length > 0 && phone && themed() ? (
          <>
            <button className="icon" onClick={() => setActing(true)} title="More" aria-label="More actions"><Icon name="more" /></button>
            <ActionSheet open={acting} title={`${tag(w) && (tag(w) === label(w) ? `#${label(w)} ` : `${tag(w)} · `)}${w.name}`} items={moreItems} onPick={(id) => menus.get("more")?.(id)} onClose={() => setActing(false)} />
          </>
        ) : moreItems.length > 0 && (
          <Menu.Root>
            <Menu.Trigger className="icon" data-native="more" data-icon="more" data-glyph="22" data-menu={JSON.stringify(moreItems)} title="More" aria-label="More actions"><Icon name="more" /></Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="menu-layer" align="end" sideOffset={4}>
                <Menu.Popup className="menu more-menu">
                  {canModel && settings.map((s) => (
                    <Menu.SubmenuRoot key={s.key}>
                      <Menu.SubmenuTrigger className="menu-item">
                        <Icon name={s.icon} />
                        {s.name}
                        <span className="menu-hint">{s.options.find((o) => o.value === s.value)?.name ?? s.value}</span>
                      </Menu.SubmenuTrigger>
                      <Menu.Portal>
                        <Menu.Positioner className="menu-layer" sideOffset={4}>
                          <Menu.Popup className="menu">
                            <Menu.RadioGroup value={s.value} onValueChange={(v: string) => change({ [s.key]: v })}>
                              {s.options.map((o) => (
                                <Menu.RadioItem key={o.value} className="menu-item" value={o.value} closeOnClick>
                                  {o.name}
                                </Menu.RadioItem>
                              ))}
                            </Menu.RadioGroup>
                          </Menu.Popup>
                        </Menu.Positioner>
                      </Menu.Portal>
                    </Menu.SubmenuRoot>
                  ))}
                  {siteUrl && (
                    <Menu.Item className="menu-item" onClick={() => openTunnel(siteUrl)}>
                      <Icon name="globe" />
                      Tunnel
                    </Menu.Item>
                  )}
                  {canListen && (
                    <Menu.Item className="menu-item" onClick={() => (listening ? hushBrief() : hear())}>
                      <Icon name={listening ? "stop" : "volume"} />
                      {listening ? "Stop" : "Listen"}
                    </Menu.Item>
                  )}
                  {canSave && (
                    <Menu.Item className="menu-item" onClick={() => (onBack(), saveLater(link.act, w))}>
                      <Icon name={w.saved ? "bookmark-minus" : "bookmark"} />
                      {w.saved ? "Unsave" : "Save for later"}
                    </Menu.Item>
                  )}
                  {canTerm && (
                    <Menu.Item className="menu-item" onClick={() => yonder.tool("open_in_terminal", { worker: w.id }).catch((e) => setSendError((e as Error).message))}>
                      {ghostty ? <img src="/ghostty.png" alt="" /> : <Icon name="terminal" />}
                      {ghostty ? "Open in Ghostty" : "Open in the terminal"}
                    </Menu.Item>
                  )}
                  {canRename && (
                    <Menu.Item className="menu-item" onClick={startRename}>
                      <Icon name="pencil" />
                      Rename
                    </Menu.Item>
                  )}
                  {canLink && (
                    <Menu.Item className="menu-item" onClick={copyLink}>
                      <Icon name="link" />
                      Copy Link
                    </Menu.Item>
                  )}
                  {canDone && (
                    <Menu.Item className="menu-item" onClick={() => (onBack(), link.act("close_worker", [w], { worker: w.id, done: true }, PATCH.complete_worker).catch(() => {}))}>
                      <Icon name="check" />
                      Complete
                    </Menu.Item>
                  )}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
        </span>
      </div>
      {/* The content runs under the row of the agent and the tabs, up to the time on the phone, and under the message
          box, down to the bottom. A blur grows toward each edge (.convo-blur in src/app.css). */}
      {["top", "bottom"].map((edge) => (
        <div key={edge} className={`convo-blur ${edge}`} aria-hidden>
          <i />
          <i />
          <i />
          <i />
          {/* The context in use, as a thin bar on the bottom edge of the head, in each view. */}
          {edge === "top" && usedPct > 0 && <b className="convo-bar" style={{ width: `${usedPct}%` }} />}
        </div>
      ))}
      {/* Up in the chat, away from the end, the tabs and the line under them hide, and the bar stays. They show again at
          the end, with the newest output. */}
      <Tabs.Root className={`convo-view${tabNames.length < 2 ? " solo" : ""}${away && shown === "chat" ? " tucked" : ""}`} value={shown} onValueChange={(v) => setView(String(v))}>
        <Tabs.List className="convo-tabs" activateOnFocus>
          {made.length > 0 && <Tabs.Tab value="canvas">Canvas</Tabs.Tab>}
          <Tabs.Tab value="chat">Context</Tabs.Tab>
          {/* "Subagents 2", or "Subtasks 2" with the word task, so that it is not the name of the tab of all the tasks. */}
          {mine.length > 0 && <Tabs.Tab value="agents">Sub{word.many} {mine.length}</Tabs.Tab>}
          <Tabs.Indicator className="convo-indicator" />
        </Tabs.List>
        {/* The line under the head, in each view: the dropdowns of the profile, the model, the effort and the permissions,
            the site of the agent and the context. The profile shows the usage, as "w:36%". With one profile, the usage
            shows as "9% | 36%". */}
        {(canModel || w.model || w.effort || (!phone && w.context)) && (
          <div className="convo-meta">
            {canModel && !settings.some((s) => s.key === "profile") && usageShort(profileNow ?? profileChoices[0] ?? {}) && <span title="Session | week">{usageShort(profileNow ?? profileChoices[0] ?? {})}</span>}
            {canModel
              ? settings.map((s) => (
                    <Dropdown
                      key={s.key}
                      align="center"
                      value={s.value}
                      onChange={(v) => change({ [s.key]: v })}
                      options={[...(s.options.some((o) => o.value === s.value) ? [] : [{ value: s.value, name: s.value || "Auto" }]), ...s.options].map((o) => ({ value: o.value, label: o.name }))}
                    />
                  ))
              : [w.model && modelName(w.model), w.effort && w.effort[0].toUpperCase() + w.effort.slice(1)].filter(Boolean).map((t) => <span key={t}>{t}</span>)}
            {/* Yonder Preview: on the phone the site opens over the agent, and on the Mac in its browser. */}
            {w.site && onSite && (
              <button className="select" onClick={() => onSite({ worker: w.id }).catch((e) => setSendError((e as Error).message))} title={`Open ${w.site.title || w.site.label}, the site on port ${w.site.port}`} aria-label={`Open the site of the ${word.one}`}>
                <Icon name="globe" />
              </button>
            )}
            {/* On the Mac the context also shows as a number next to the bar, as "162k / 1M · 16%", because the bar alone
                on the line under the head is hard to see. The phone keeps only the bar. */}
            {!phone && w.context && <span title="Context in use">{context(w.context)}{usedPct > 0 && ` · ${Math.round(usedPct)}%`}</span>}
          </div>
        )}
        <Tabs.Panel className="convo-panel canvas-view" value="canvas">
          {made.map((a) => (
            <ArtifactCard key={a.id} path={a.path} owner={w.id} far={link.far ? link.fetch : undefined} />
          ))}
        </Tabs.Panel>
        <Tabs.Panel className="convo-panel" value="agents">
          {/* Each sub-agent: its number and letter in the color of its status, its description, its type and model, and its time. */}
          <div className="list">
            {mine.map((s) => (
              <button key={s.id} className={`worker row ${s.status}`} onClick={() => setSubId(s.id)}>
                <Badge w={s} part="num" />
                <span className="name">{s.name}</span>
                <span className="what">{[s.agent, s.model && modelName(s.model)].filter(Boolean).join(" · ")}</span>
                <span className="age">
                  {took((s.status === "running" ? Date.now() : s.updatedAt) - s.startedAt)}
                  <Badge w={s} part="dot" />
                </span>
              </button>
            ))}
          </div>
        </Tabs.Panel>
        <Tabs.Panel
          className="convo-panel"
          value="chat"
          keepMounted
          onClick={(e) => getSelection()?.isCollapsed && !(e.target as Element).closest(".thumb, .viewer, audio, input, textarea, select") && focusPrompt()}
          // On a selected picture or video of the chat, the arrows select the one before or after it, Enter opens it in the
          // viewer, and Escape, or ↓ on the last one, goes back to the prompt.
          onKeyDown={(e) => {
            const el = e.target as HTMLElement;
            if (!el.matches("button.thumb") || e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
            // stopPropagation: the Escape must not also close the agent.
            if (e.key === "Escape") return e.preventDefault(), e.stopPropagation(), focusPrompt();
            const dir = ({ ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 } as Record<string, number>)[e.key];
            if (!dir) return;
            e.preventDefault();
            const thumbs = [...e.currentTarget.querySelectorAll<HTMLElement>("button.thumb")];
            const next = thumbs[thumbs.indexOf(el) + dir];
            if (next) next.focus();
            else if (dir > 0) focusPrompt();
          }}
          // On the panel, so a drag in the space over a short chat also hides the keyboard.
          onTouchStart={dragStart}
          onTouchMove={dragHide}
        >
      {turns?.length === 0 && !task && !waiting.length && !queued.length && <p className="empty">No conversation yet.</p>}
      {!turns && loadError && <p className="empty">{loadError}</p>}
      {/* Until the chat comes, so the tab is not blank while the link to the Mac is down. */}
      {!turns && !loadError && !task && <p className="empty">Loading…</p>}
      <ol
        className={`list convo bubbles${look.detail === "verbose" ? " verbose" : ""}`}
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          bottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 300);
          // Near the top, the 300 turns before these load, once at a time.
          if (el.scrollTop < 600 && turns?.length && !older.current.from && !older.current.done && el.scrollHeight > el.clientHeight) {
            older.current = { from: el.scrollHeight - el.scrollTop, length: turns.length };
            setCount((c) => c + 300);
          }
        }}
      >
        {chat}
        {task && <UserTurn text={task} />}
        {pending(waiting).map(({ s, x }, i) => s?.busy && s.text.trim() && w.status === "running" ? (
          <Queued
            key={`s${i}`}
            text={[s.text, ...(s.places ?? [])].join("\n")}
            pictures={!!s.urls?.length && (
              <div className="media">
                {s.urls.map((u) => <span key={u} className="thumb"><img src={u} alt="Attached image" /></span>)}
              </div>
            )}
            onSend={() => stop(true, { q: s.text, text: s.text })}
          />
        ) : s ? (
          <UserTurn
            key={`s${i}`}
            waits={s.busy}
            text={[s.text, ...(s.places ?? [])].join("\n")}
            pictures={!!s.urls?.length && (
              <div className="media">
                {s.urls.map((u) => <span key={u} className="thumb"><img src={u} alt="Attached image" /></span>)}
              </div>
            )}
          />
        ) : (
          <Queued key={x.q} text={x.text} pictures={x.media.length > 0 && <MediaRow media={x.media} owner={owner} />} onSend={() => stop(true, x)} onEdit={() => edit(x)} onDelete={() => edit(x, true)} />
        ))}
        {live && <UserTurn text={live} />}
        {/* While the agent works, a shiny "Yondering…" shows at the end, as the spinner of Claude Code. The shine is the
            ShinyText of React Bits, as "Listening" in the talk view, with no bird in front of it. While the agent waits
            on a background task, such as a wait or a Monitor, it says "Monitoring…", and both words show when the turn
            runs beside such a task. */}
        {w.status === "running" && (
          <li className="yondering" aria-label={`The ${word.one} ${w.monitoring === "only" ? "monitors" : w.monitoring ? "works and monitors" : "works"}`}>
            <span className="shiny">{[w.monitoring !== "only" && "Yondering…", w.monitoring && "Monitoring…"].filter(Boolean).join(" · ")}</span>
          </li>
        )}
        {side?.id === w.id && (
          <li className="side">
            <button className="icon" onClick={() => (haptic(), setSide(undefined))} title="Close" aria-label="Close the side question">
              <Icon name="x" size={16} />
            </button>
            <p>{side.text}</p>
            {side.answer === undefined ? (
              <span className="shiny">Answering…</span>
            ) : (
              <div className="assistant">
                <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={MARKDOWN_PLUGINS} components={{ a: (p) => <a href={p.href} title={p.href} onClick={(e) => { e.preventDefault(); haptic(); if (p.href) openHref(p.href); }}>{p.children}</a>, blockquote: Quote }}>
                  {side.answer}
                </Markdown>
              </div>
            )}
          </li>
        )}
      </ol>
      {/* A round button at the bottom right goes back to the end of the chat, as in Signal. It shows when the user scrolled
          up. */}
      {away && (
        <button className="icon to-end" onClick={(e) => (e.stopPropagation(), haptic(), (bottom.current = true), box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }))} title="Go to the end" aria-label="Go to the end of the chat">
          <Icon name="down" />
        </button>
      )}
        </Tabs.Panel>
      </Tabs.Root>
      {!phone && <ModPanes mods={mods} className="side" />}
      {/* The message box and what shows over it: on the phone it floats over the end of the content. */}
      <div className="convo-foot" ref={foot}>
      {phone && <ModPanes mods={mods} className="over" />}
      <ModBand mods={mods} />
      {talking && (
        <Talk
          compact
          calling={calling}
          sending="Sending…"
          idle="Tap and say your message."
          onWords={setHeard}
          onDone={(text) => {
            setTalking(false);
            if (typeof text === "string" && !text.trim()) return;
            // The whoosh of a sent voice note, as for a new agent. Not during a call, where the microphone would hear it.
            if (!calling) whoosh();
            if (walkie() && !calling) (endWalkie(), (walkieTurn.current = { phase: w.status === "running" ? "running" : "sent", release: holdAudio() }));
            setView("chat");
            // A dictation while the Mac is offline is its sound, and the outbox makes the text later (src/bridge.ts).
            send(typeof text === "string" ? [draft.trim(), text].filter(Boolean).join(" ") : { ...text, before: draft.trim() });
          }}
          onDrop={() => setTalking(false)}
          onCancel={() => setTalking(false)}
          onFail={setSendError}
          // The paper clip and the attached images, as in the New agent view.
          options={talkClip && <div className="talk-options" onClick={(e) => e.stopPropagation()}>{talkClip}</div>}
        >
          {attached}
        </Talk>
      )}
      {/* While Listen loads or speaks the brief, a small stop button floats over the message box: a spinner while it
          loads, a speaker while it speaks. A tap stops it, as the Stop item of the three dots does. */}
      {listening && (
        <button className="talk-cancel hear" onClick={() => (haptic(), hushBrief())} title="Stop" aria-label="Stop the summary">
          {listening === "load" ? <span className="spin"><Icon name="refresh" /></span> : <Icon name="volume" />}
          Stop
        </button>
      )}
      {replay && !listening && !talking && (
        <button className="talk-cancel hear" onClick={() => hear(true)} title="Replay" aria-label="Replay the answer">
          <Icon name="back10" />
          Replay
        </button>
      )}
      {sendError && <p className="send-error">{sendError}</p>}
      {!talking && matches.length > 0 && (
        <ul className="commands" role="listbox" aria-label="Slash commands">
          {matches.map((c, i) => (
            <li
              key={c.name}
              role="option"
              aria-selected={i === Math.min(pick, matches.length - 1)}
              onMouseDown={(e) => (e.preventDefault(), choose(c))}
            >
              <b>/{c.name}</b>
              <span>{c.description}</span>
            </li>
          ))}
        </ul>
      )}
      {!talking && <Prompt
        ref={prompt}
        value={draft}
        clip={clip}
        onTalk={() => (warmMic(), hushBrief(), endWalkie(), setReplay(false), setSendError(""), setTalking(true))}
        calling={calling}
        placeholder={w.kind === "terminal" ? "Message a copy of this session" : copy("message", "Send a message")}
        aria-label={`Message ${called(w)}`}
        onChange={(e) => (setDraft(e.target.value), setHidden(false), setPick(0))}
        onKeyDown={(e) => {
          // In the list of commands: the arrows select, Tab or Enter completes the name, Escape closes the list.
          // Enter on a complete name sends it.
          const c = matches[Math.min(pick, matches.length - 1)];
          if (c && !e.nativeEvent.isComposing) {
            const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
            if (step) {
              e.preventDefault();
              setPick((Math.min(pick, matches.length - 1) + step + matches.length) % matches.length);
              return;
            }
            if (e.key === "Escape") return e.preventDefault(), setHidden(true);
            if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && draft !== `/${c.name}`)) return e.preventDefault(), choose(c);
          }
          if (e.key === "Escape" && canStop) return e.preventDefault(), stop(toSend);
          // ↓ at the end of the text selects the newest picture or video of the chat (see the chat panel).
          const end = e.currentTarget.selectionStart === draft.length && e.currentTarget.selectionEnd === draft.length;
          if (e.key === "ArrowDown" && end && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
            const thumbs = box.current?.querySelectorAll<HTMLElement>("button.thumb");
            const last = thumbs?.[thumbs.length - 1];
            if (last) return e.preventDefault(), last.focus();
          }
          // ⌘↩ (closeKey by default) closes the agent and does not send.
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || hit(e.nativeEvent, "closeKey")) return;
          e.preventDefault();
          send();
        }}
        onSend={() => send()}
        ready={waits}
      />}
      <ModLines mods={mods} />
      </div>
    </>
  );
}

// The install and the sign-in of a CLI (bridge/logins.ts), as /logins gives them.
type Login = { id: string; name: string; step: "install" | "login" | "signed-out"; url?: string; code?: string; paste?: boolean; error?: string };
const postJson = (fetch: (path: string, init?: RequestInit) => Promise<Response>, path: string, body: object) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? "The computer does not answer.");
    return data;
  });

// The cards of the install and the sign-in of the CLIs, over the list of agents and in the Agents section of the
// Settings: the cards of the computer in use, then those of the other computers of the phone (`others`). So the user
// installs and signs in to Claude Code and Codex from the phone, with no trip to the Mac. A card goes when
// its CLI is signed in. A bridge from before /logins answers 403, and then nothing shows. `only`: the card of one CLI, on
// the page of that CLI in the Settings.
export function Logins({ others = [], only }: { others?: Elsewhere[]; only?: string }) {
  const [here, setHere] = useState<Login[]>([]);
  const [far, setFar] = useState<Record<string, Login[]>>({});
  const macs = others.map((o) => o.mac).join(" ");
  const busy = here.length > 0 || Object.values(far).some((l) => l.length > 0);
  const load = () => {
    if (document.visibilityState !== "visible") return;
    void yonder.logins.list().then(setHere, () => {});
    for (const o of others)
      void yonder.logins.list(reach(o.mac).fetch).then((l: Login[]) => setFar((f) => ({ ...f, [o.mac]: l })), () => {});
  };
  useEffect(() => {
    load();
    const timer = setInterval(load, busy ? 2000 : 15_000);
    return () => clearInterval(timer);
  }, [busy, macs]);
  return (
    <>
      {here.filter((l) => !only || l.id === only).map((l) => (
        <LoginCard key={l.id} login={l} act={(body) => postJson(bridgeFetch, "/logins", { id: l.id, ...body }).then(setHere)} />
      ))}
      {others.flatMap((o) =>
        (far[o.mac] ?? []).map((l) => (
          <LoginCard
            key={`${o.mac} ${l.id}`}
            login={l}
            where={o.name}
            act={(body) => postJson(reach(o.mac).fetch, "/logins", { id: l.id, ...body }).then((list) => setFar((f) => ({ ...f, [o.mac]: list })))}
          />
        )),
      )}
    </>
  );
}

// One card: a turning icon while the CLI installs, then one button. A tap asks for Face ID on the phone when Face lock is
// on, because a sign-in links an account to the computer. Then the card copies the one-time code of a device sign-in,
// shows it, and opens the page of the link. Claude Code has no device sign-in: its page shows a code, and the field of
// the card takes it. A pasted code with its "#" goes at once. The tap on a card that waits for a link starts the sign-in,
// and the page opens when the link comes.
export function LoginCard({ login: l, where, act }: { login: Login; where?: string; act: (body: { action?: string; code?: string }) => Promise<unknown> }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const name = where ? `${l.name} on ${where}` : l.name;
  const run = (body: { action?: string; code?: string }) => {
    setSending(true);
    setError("");
    return act(body).catch((e) => setError((e as Error).message)).finally(() => setSending(false));
  };
  const reveal = (url: string, code?: string) => {
    if (code) {
      setShown(true);
      void (phone ? navigator.clipboard.writeText(code) : yonder.tool("copy_to_clipboard", { text: code })).catch(() => {});
    }
    void openLink(url);
  };
  const tap = async () => {
    if (phone && lockOn() && !(await unlock().then(() => true, () => false))) return;
    if (l.url) return reveal(l.url, l.code);
    setWaiting(true);
    await run({ action: "login" });
  };
  useEffect(() => {
    if (waiting && l.url) (setWaiting(false), reveal(l.url, l.code));
    if (l.error) setWaiting(false);
  }, [l.url, l.error]);
  const send = (code: string) => code.trim() && !sending && void run({ action: "code", code });
  const shownError = error || l.error;
  return (
    <div className="setup">
      {l.step === "install" && !l.error ? (
        <span className="setup-state">
          <span className="spin"><Icon name="refresh" /></span>{name}
        </span>
      ) : l.error && !l.url ? (
        <button disabled={sending} onClick={() => void run({ action: l.step === "install" ? "install" : "login" })}>Try again: {name}</button>
      ) : (
        <>
          {shown && l.code && <code className="login-code">{l.code}</code>}
          <button disabled={sending || waiting || (l.step === "login" && !l.url)} onClick={() => void tap()}>
            {sending || waiting || (l.step === "login" && !l.url) ? <span className="spin"><Icon name="refresh" /></span> : null}Sign in to {name}
          </button>
          {l.paste && l.url && (
            <form className="add-site" onSubmit={(e) => (e.preventDefault(), send((e.currentTarget.elements.namedItem("code") as HTMLInputElement).value))}>
              <input
                name="code"
                placeholder="Paste the code"
                aria-label="The code of the sign-in"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                disabled={sending}
                onPaste={(e) => e.clipboardData.getData("text").includes("#") && send(e.clipboardData.getData("text"))}
              />
              <button type="submit" className="add" data-native="setup-code" data-icon={sending ? "refresh" : "check"} data-glyph="20" disabled={sending} title="Sign in" aria-label="Sign in">
                <span className={sending ? "spin" : undefined}><Icon name={sending ? "refresh" : "check"} size={20} /></span>
              </button>
            </form>
          )}
        </>
      )}
      {shownError && <p className="error">{shownError}</p>}
    </div>
  );
}

// The sign-in of a profile of Claude Code with its own folder, on the page of the profile (/setup?profile=<id>): the
// card of the sign-in of Claude Code. A bridge from before has no /setup, and then nothing shows.
type Setup = { step?: "install" | "login"; url?: string; error?: string };
export function ClaudeSetup({ profile, name = "Claude Code", onDone }: { profile: string; name?: string; onDone?: () => void }) {
  const [setup, setSetup] = useState<Setup>({});
  // The end of a sign-in: the bridge gives no step again.
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !setup.step) onDone?.();
    was.current = !!setup.step;
  }, [setup.step]);
  const path = `/setup?profile=${encodeURIComponent(profile)}`;
  const load = () => yonder.profiles.setup(profile).then(setSetup, () => {});
  useEffect(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), setup.step ? 2000 : 15_000);
    return () => clearInterval(timer);
  }, [!!setup.step]);
  if (!setup.step) return null;
  return <LoginCard login={{ id: profile, name, step: setup.step, url: setup.url, error: setup.error, paste: true }} act={(body) => postJson(bridgeFetch, path, { code: body.code }).then(setSetup)} />;
}

// The CLIs of /clis by id, for the names and the modes of the agents in other CLIs. loadClis fills it. The names stand in
// until the first load.
let cliInfo: Record<string, Cli> = {};
const CLI_NAMES: Record<string, string> = { codex: "Codex", antigravity: "Antigravity", opencode: "OpenCode", hermes: "Hermes", cursor: "Cursor", grok: "Grok", copilot: "Copilot" };
const cliName = (id?: string) => (!id || id === "claude" ? "Claude Code" : (cliInfo[id]?.name ?? CLI_NAMES[id] ?? id));
// The name of the permission mode of an agent, with the words of its CLI.
const modeLabel = (w: Worker) => (w.cli && cliInfo[w.cli]?.modes.find((m) => m.mode === w.mode)?.name) || modeName(w.mode ?? "");

// The Claude Code models of the three dots of an agent: the aliases of LATEST in bridge/main.ts, which gives each alias
// its latest model. The Model range of the Settings also uses them. Update the names with LATEST.
export const MODELS = [
  { alias: "opus", name: "Opus 5.5" },
  { alias: "fable", name: "Fable 5.2" },
  { alias: "sonnet", name: "Sonnet 5.5" },
  { alias: "haiku", name: "Haiku 5.5" },
];
// The efforts of EFFORTS in bridge/main.ts.
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
// The permission modes of MODES in bridge/main.ts, with the names of Claude Code. The Permissions row of the Settings
// has all but Plan, because a reply to a plan approves it.
export const MODES = [
  { mode: "bypassPermissions", name: "Bypass permissions" },
  { mode: "auto", name: "Auto mode" },
  { mode: "acceptEdits", name: "Accept edits" },
  { mode: "plan", name: "Plan mode" },
];
const modeName = (mode: string) => MODES.find((m) => m.mode === mode)?.name ?? mode;

// A new agent from the + button, without a call: a big talk button and no text box. The dictation starts when the
// view opens. A tap on the orb or Enter starts the agent with the words, in the selected project, and Escape drops them.
// A tap after Escape listens again. The tap closes the view at once, and the last words and the start come after it:
// the screen goes back to where the user tapped +, and the new agent grows into its list. The three dots of the agent
// change the model and the effort. The attached images go with the task. With All projects, the bridge picks the
// project from the task (projectOf in bridge/main.ts). The title of the app picks another project.
// Two small menus under the words pick the model and the effort. Auto lets Clef pick each one from the task. The model
// menu starts on Auto, or on the model of a Model range of one model in the Settings. A third menu picks the
// permission mode, as Shift+Tab in Claude Code. It starts on the Permissions row of the Settings. The chat button opens
// the view with a text box in place of the orb (`typed`), and Enter starts the agent. The microphone of the box changes
// to the orb.
// `far` is the computer that the environment dropdown of the Mac picks: the agent starts there, in its open project, or
// else that computer picks the project from the task.
function NewAgent({ typed, onTalk, project, far, onBack, onFail, images, attached, clip, promptClip, calling, model: initial, mode: initialMode, clis }: { typed: boolean; onTalk: () => void; project: Project; far?: { link: Link; name: string; project?: Project }; attached: ReactNode; clip: ReactNode; promptClip: ReactNode; onBack: () => void; calling: boolean; model: string; mode: string; clis: Clis; onFail: (message: string) => void; images: { paths(): Promise<string[]>; sent(paths: string[]): () => void; waits?: boolean } }) {
  const edge = useSwipeBack(onBack);
  const [sendError, setSendError] = useState("");
  useReport(sendError);
  // The CLI of the new agent starts on the CLI row of the Agents tab. Its menu shows only when two or more CLIs are on, in
  // a row of its own, because the three other menus fill the row of a phone. The other menus then show the values of
  // that CLI: "Default model" lets the CLI pick its model.
  // A profile is in the menu too, and its CLI (`base`) gives the other menus.
  const on = pickable(clis.clis.filter((c) => c.on), clis.cli);
  // The CLI that the user picked here, or else the default profile, which can load after the view opens: the profile of
  // the project (set_project_profile), else the one of the Settings.
  const [picked, setCli] = useState("");
  const base = (!far && clis.clis.find((c) => c.base && c.name === project.profile)?.id) || clis.cli;
  const cli = picked || base;
  const kind = (id: string) => clis.clis.find((c) => c.id === id)?.base ?? id;
  const other = kind(cli) !== "claude" ? clis.clis.find((c) => c.id === kind(cli)) : undefined;
  const [model, setModel] = useState(other ? other.model || "auto" : initial);
  const [effort, setEffort] = useState(other?.effort || "auto");
  const [mode, setMode] = useState(other ? other.mode : initialMode);
  const chooseCli = (id: string) => {
    const c = kind(id) !== "claude" ? clis.clis.find((x) => x.id === kind(id)) : undefined;
    setCli(id);
    setModel(c ? c.model || "auto" : initial);
    setEffort(c?.effort || "auto");
    setMode(c ? c.mode : initialMode);
  };
  // With All projects, the app gives no project, and the bridge picks it from the task.
  const all = far ? !far.project : project === ALL;
  const where = far ? `${far.project ? `${far.project.name} on ` : ""}${far.name}` : project.name;
  // The view is gone when the words come, so a failure shows in the error bar of the app.
  const start = async (said: Promise<string>) => {
    onBack();
    let back: (() => void) | undefined;
    try {
      const heard = await said;
      // A dictation while the Mac is offline is its sound, and the outbox makes the text later (src/bridge.ts).
      const task = typeof heard === "string" ? heard.trim() : heard;
      // A task can be only its attachments, such as a pasted screenshot.
      const paths = await images.paths();
      if (!task && !paths.length) return onFail("Yonder did not hear you. Tap the microphone and talk again.");
      // The whoosh of an agent that leaves, when the words are final, so that it does not touch the microphone of the
      // dictation. Not during a call, where the microphone would hear it.
      if (!calling) whoosh();
      // The images leave the screen at once, and come back when the agent does not start.
      back = paths.length ? images.sent(paths) : undefined;
      // The default profile goes as no CLI, so the bridge can start the agent on another account when the default has
      // used all of its session or its week (roomy in bridge/main.ts).
      const args = {
        project: all ? "" : (far?.project ?? project).path, task, name: "",
        ...(cli !== base && { cli }),
        ...(model !== "auto" && { model }),
        ...(effort !== "auto" && { effort }),
        mode,
        ...(paths.length ? { files: paths } : {}),
      };
      // The link of the other computer loads its agents again when the start ends.
      if (far) return await far.link.act("start_worker", [], args, undefined, false);
      const started = yonder.mice.act("start_worker", args);
      // The bridge lists the agent as "Starting" at once (showStarting in bridge/main.ts), so its row shows before the
      // start ends, not after the whole start or the next poll.
      setTimeout(() => void yonder.mice.all().then(showWorkers, () => {}), 300);
      const res = await started;
      if (res === OFFLINE) return onFail(`The Mac is offline. The ${word.one} starts when the Mac is back.`);
      await yonder.mice.all().then(showWorkers, () => {});
    } catch (e) {
      back?.();
      onFail(`The ${word.one} did not start: ${(e as Error).message}`);
    }
  };
  const [draft, setDraft] = useState("");
  const send = () => (draft.trim() || images.waits) && start(Promise.resolve(draft));
  // The key of the voice note (right ⌥, talk-key of the Mac app) turns the view with the text box into the talk view,
  // as the microphone of the box does. Then a second tap sends (Talk).
  useEffect(() => {
    if (!inTauri || !typed) return;
    const stop = listen("talk-key", () => ((keyPress.started = true), onTalk()));
    return () => void stop.then((unlisten) => unlisten());
  }, [typed]);
  // ⌘E moves the effort one step up here too, from Auto to the highest effort and back to Auto.
  useEffect(() => {
    const efforts = ["auto", ...(other ? other.efforts : EFFORTS)];
    if (efforts.length < 2) return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || !hit(e, "effortKey")) return;
      // The view can cover an open agent, so the key stops here and the effort of that agent stays.
      e.preventDefault();
      e.stopImmediatePropagation();
      setEffort((now) => efforts[(efforts.indexOf(now) + 1) % efforts.length]);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  // A click in a menu, also in its portal, must not reach the tap of the view that sends.
  const options = (
    <>
      {on.length > 1 && (
        <div className="talk-options" onClick={(e) => e.stopPropagation()}>
          <Dropdown align="center" value={cli} onChange={chooseCli} options={on.map((c) => ({ value: c.id, label: profileLabel(c.name, c) }))} />
        </div>
      )}
      <div className="talk-options" onClick={(e) => e.stopPropagation()}>
        <Dropdown
          align="center"
          value={model}
          onChange={setModel}
          options={
            other
              ? [{ value: "auto", label: "Default model" }, ...[...new Set([...other.models, ...(other.model ? [other.model] : [])])].map((m) => ({ value: m, label: m }))]
              : [{ value: "auto", label: "Auto model" }, ...MODELS.map((m) => ({ value: m.alias, label: m.name }))]
          }
        />
        {(!other || other.efforts.length > 0) && (
          <Dropdown align="center" value={effort} onChange={setEffort} options={[{ value: "auto", label: "Auto effort" }, ...(other?.efforts ?? EFFORTS).map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))]} />
        )}
        <Dropdown align="center" value={mode} onChange={setMode} options={other ? other.modes.map((m) => ({ value: m.mode, label: m.name })) : MODES.map((m) => ({ value: m.mode, label: m.name }))} />
      </div>
    </>
  );
  return (
    <>
      {/* The phone has the back button in the title bar. */}
      <div ref={edge} className="convo-head">
        {!phone && (
          <button className="icon" onClick={onBack} title="Back" aria-label={`Back to the ${word.many}`}>
            <Icon name="back" />
          </button>
        )}
      </div>
      {typed ? (
        <>
          <div className="new-agent">
            <p className="said">{far && all ? `It starts on ${where}.` : all ? "Yonder picks the workspace." : `It starts in ${where}.`}</p>
            {attached}
          </div>
          <div className="convo-foot">
            <div className="talk-actions">{options}</div>
            {/* On the phone, the paper clip is at the left of the box, as in a conversation. */}
            <Prompt
              clip={promptClip}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") return onBack();
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                send();
              }}
              onSend={send}
              ready={images.waits}
              onTalk={onTalk}
              calling={calling}
              autoFocus
              placeholder="Type the task"
              aria-label={`The task of the new ${word.one}`}
            />
          </div>
        </>
      ) : (
        <Talk
          calling={calling}
          idle={far && all ? `Tap and talk. It starts on ${where}.` : all ? "Tap and talk. Yonder picks the workspace." : `Tap and talk. It starts in ${where}.`}
          onSent={start}
          onCancel={onBack}
          onFail={setSendError}
          options={<>{clip}{options}</>}
        >
          {attached}
        </Talk>
      )}
      {sendError && <p className="send-error">{sendError}</p>}
    </>
  );
}

// The big talk button of a new agent and the small talk bar of the microphone button of a conversation: the orb
// (src/Orb.tsx). The dictation starts when the view opens, and the orb moves with the voice. Under the orb, a shiny
// "Tap to send" and the words in a box of a fixed height: the newest line is at the bottom, and the old lines go up
// and fade out. So the orb does not move when the text grows. A tap on the orb, anywhere in the view or Enter gives
// the words to onDone, and Escape drops them (onDrop). With onSent, the tap gives the coming words at once (see
// useDictation). While the dictation is on, a tap anywhere in the view sends too, but not a tap on a button or a link.
// During a call the button is off, because the call has the microphone.
// `compact` is the bar of a conversation: a small orb with the status line under it, and no words, in place of the
// prompt box. A tap in the bar sends, and a tap on the chat above it does not. onWords gets the words so far, and the
// conversation shows them in a bubble.
function Talk({ compact, calling, sending, idle, onWords, onDone, onSent, onDrop, onCancel, onFail, options, children }: { compact?: boolean; calling: boolean; sending?: string; idle: string; options?: ReactNode; children?: ReactNode; onWords?(text: string): void; onDone?(text: string | Recorded): void; onSent?(text: Promise<string | Recorded>): void; onDrop?(): void; onCancel(): void; onFail(message: string): void }) {
  const [words, setWords] = useState("");
  const talk = useDictation({ onText: (text) => (setWords(text), onWords?.(text)), onDone: (text) => (typeof text === "string" && setWords(text), onDone?.(text)), onSent, onDrop: () => (setWords(""), onDrop?.()), onFail }, calling);
  const listening = talk.phase === "on" || talk.phase === "ending";
  // On the Mac, the focus on the button lets Enter or Space start the dictation again after Escape. The view listens
  // at once, and also when a call ends (the + button ends a live call).
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => void button.current?.focus({ preventScroll: true }), []);
  useEffect(() => void (calling || talk.start()), [calling]);
  // Two taps of the Taptic Engine with the bounce of the orb (orb-pop in app.css, orb-pop-fast in the talk bar).
  useEffect(() => {
    const timer = setTimeout(() => haptics(["medium", "light"], compact ? 150 : 200), compact ? 220 : 640);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      className={`new-agent${compact ? " compact" : ""}${talk.phase === "on" ? " tap-send" : ""}`}
      onClick={(e) => talk.phase === "on" && !(e.target as Element).closest("button, a, input, textarea, select, label") && talk.stop()}
    >
      <button
        ref={button}
        className="talk"
        onClick={listening ? talk.stop : talk.start}
        disabled={calling || talk.phase === "starting" || talk.phase === "ending"}
        title={listening ? "Send (Enter)" : "Talk"}
        aria-label={listening ? "Stop and send" : "Talk"}
      >
        <Orb listening={listening} levels={talk.levels} boost={compact ? 2.5 : 1} />
        {!listening && <Icon name="mic" size={36} />}
      </button>
      <div className="talk-text">
        <p className={`said${listening && !(talk.phase === "ending" && words) ? " shiny" : ""}`} aria-live="polite">
          {talk.phase === "ending" && words ? sending : calling ? "The call uses the microphone. Tell Yonder." : listening ? (talk.away ? "The Mac is offline. Keep talking, it goes when the Mac is back." : "Tap to send") : idle}
        </p>
        {!compact && (
          <div className="heard">
            {listening && words && <motion.p layout="position" transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}>{words}</motion.p>}
          </div>
        )}
      </div>
      {children}
      {/* A small floating Cancel at the bottom closes the view and drops the words. A tap on the orb or anywhere in the
          view sends them, and the status line says "Tap to send", so it is clear what to tap after the talk. The menus
          of a new agent (options) sit above Cancel, under the words, low and large on the phone. Cancel is a round X
          with the look and the size of the paper clip and the menus. */}
      <div className="talk-actions" onClick={(e) => e.stopPropagation()}>
        {options}
        <button className="talk-clip" data-native="talk-cancel" data-icon="x" data-glyph="18" onClick={onCancel} title="Cancel" aria-label="Cancel">
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}

// The dictation of a prompt box or of the talk button of a new agent (src/dictate.ts), when no call is live. onText
// gets the words so far while the user talks, and onDone gets the whole text after the stop. Enter stops and Escape
// drops the words (onDrop), also when the focus is not on the box or the button. A call takes the microphone.
// A back or a call while the microphone starts also stops it, so the microphone does not stay on after such a back.
// With onSent, the stop gives the coming text at once, and the caller can close its view before the text comes.
// `away`: the Mac went offline during the dictation, and the phone keeps the sound for later (src/dictate.ts).
// The press of the key of the voice note (talk-key) that opened the talk view or started its dictation. Its release after
// a hold sends (talk-key-up), and another key while it was down drops the words (talk-key-cut), because then it was a
// shortcut such as ⌥E: press, talk, let go (note_key in src-tauri/src/main.rs).
const keyPress = { started: false };

function useDictation(handlers: { onText(text: string): void; onDone(text: string | Recorded): void; onSent?(text: Promise<string | Recorded>): void; onDrop(): void; onFail(message: string): void }, calling: boolean) {
  const on = useRef(handlers);
  on.current = handlers;
  const [phase, setPhase] = useState<"idle" | "starting" | "on" | "ending">("idle");
  const [away, setAway] = useState(false);
  const rec = useRef<Dictation>(undefined);
  const run = useRef(0);
  const levels = useMemo(() => () => ({ mic: rec.current?.level() ?? 0, out: 0 }), []);
  const cancel = () => {
    run.current++;
    rec.current?.cancel();
    rec.current = undefined;
    setPhase("idle");
  };
  const start = async () => {
    const id = ++run.current;
    setPhase("starting");
    setAway(false);
    on.current.onFail("");
    try {
      const r = await dictate((text) => on.current.onText(text), (message) => {
        // The words so far stay, so that Enter in a prompt box can still send them.
        rec.current = undefined;
        setPhase("idle");
        on.current.onFail(message);
      }, () => id === run.current && setAway(true));
      if (id !== run.current) return r.cancel();
      rec.current = r;
      setPhase("on");
    } catch (e) {
      if (id !== run.current) return;
      setPhase("idle");
      on.current.onFail(`Yonder cannot use the microphone: ${(e as Error).message}`);
    }
  };
  const stop = () => {
    const r = rec.current;
    if (!r) return;
    if (on.current.onSent) {
      rec.current = undefined; // An unmount then does not cancel the last words.
      setPhase("idle");
      return on.current.onSent(r.stop());
    }
    setPhase("ending");
    r.stop().then((text) => {
      if (rec.current !== r) return; // Escape dropped the words while the last ones came.
      rec.current = undefined;
      setPhase("idle");
      on.current.onDone(text);
    }, () => {});
  };
  useEffect(() => {
    if (phase !== "on" && phase !== "ending") return;
    const key = (e: KeyboardEvent) => {
      // Enter and Escape in an open menu, such as the model menu of a new agent, belong to the menu.
      if ((e.key !== "Enter" && e.key !== "Escape") || (e.target as Element).closest?.(".menu-layer")) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") (cancel(), chime(false), on.current.onDrop());
      else if (phase === "on") stop();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [phase]);
  // A tap of the key of the voice note (talk-key, tap_key of src-tauri/src/main.rs) is a tap on the orb: it sends, as
  // Enter, and it starts the dictation again after Escape or a failure. One listener with a ref: a listener of an old
  // phase can still get a tap before its unlisten ends, and a second start would leave a microphone open.
  const tap = useRef(() => {});
  tap.current = () => {
    keyPress.started = phase === "idle" && !calling;
    phase === "on" ? stop() : keyPress.started && void start();
  };
  // A release while the microphone still opens sends as soon as it is on.
  const stopWhenOn = useRef(false);
  const release = useRef(() => {});
  // Only a talk view that listens takes the release or the cut.
  release.current = () => {
    if (phase !== "starting" && phase !== "on") return;
    if (keyPress.started) phase === "on" ? stop() : (stopWhenOn.current = true);
    keyPress.started = false;
  };
  const cut = useRef(() => {});
  cut.current = () => {
    if (phase !== "starting" && phase !== "on") return;
    if (keyPress.started) (cancel(), on.current.onDrop());
    keyPress.started = false;
  };
  useEffect(() => {
    if (phase === "on" && stopWhenOn.current) stop();
    if (phase !== "starting") stopWhenOn.current = false;
  }, [phase]);
  useEffect(() => {
    if (!inTauri) return;
    const stops = [listen("talk-key", () => tap.current()), listen("talk-key-up", () => release.current()), listen("talk-key-cut", () => cut.current())];
    return () => stops.forEach((s) => void s.then((unlisten) => unlisten()));
  }, []);
  useEffect(() => void (calling && cancel()), [calling]);
  // A back or the Cancel button closes the view while the microphone is on: the end chime of a call plays.
  useEffect(() => () => void (run.current++, rec.current && (rec.current.cancel(), chime(false))), []);
  return { phase, away, levels, start, stop };
}

// The prompt box under a conversation, with the microphone button at its right when no call is live. A tap on the
// microphone opens the big talk button of a new agent (Talk) in place of the conversation. The stop button of a running
// agent is in the title row of the conversation. On the Mac, Escape in the box stops the agent too. On the phone, a
// paper clip at the left of the box opens the attach menu (clip), and the field holds the microphone, as in Signal.
// When the box has text, a round send button takes the place of the microphone at the right of the field (only on the
// phone, app.css). It keeps the keyboard open. It shows also when the box is empty and attachments wait (ready), so
// that a location or a photo can go alone.
// The label names the text field with htmlFor. Without it, the control of the label is its first button, the paper clip, so a
// tap on the edge of the box, as next to or under the send button, opens the attach sheet.
// A textarea cannot color one word, so when the text has "ultrathink", a mirror of the text with the rainbow word lies on
// the field, and the text of the field itself is clear. The field keeps the caret, the selection and the input.
function Prompt({ ref, onTalk, onSend, ready, calling, clip, ...props }: { ref?: Ref<HTMLTextAreaElement>; onTalk: () => void; ready?: boolean; onSend: () => void; calling: boolean; clip?: ReactNode } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const text = String(props.value ?? "");
  const ultra = /\bultrathink\b/i.test(text);
  const mirror = useRef<HTMLSpanElement>(null);
  // The mirror scrolls with the field, when the text is higher than the 160 px of the field.
  const sync = () => void (mirror.current && (mirror.current.scrollTop = mirror.current.previousElementSibling!.scrollTop));
  useLayoutEffect(sync);
  return (
    <label className="prompt" htmlFor={id} data-typed={text.trim() ? "" : undefined}>
      <span aria-hidden="true">›</span>
      {clip}
      <span className="field">
        <span className="words" data-ultra={ultra ? "" : undefined}>
          <textarea ref={ref} id={id} rows={1} onScroll={sync} {...props} />
          {/* The space of no width makes the line after a last line break, as the field does. */}
          {ultra && <span ref={mirror} className="mirror" aria-hidden="true">{rainbow(text)}{"​"}</span>}
        </span>
        {!calling && (
          <button type="button" className="icon mic" onClick={onTalk} disabled={props.disabled} title="Talk (⇧⌘D)" aria-label="Say a message">
            <Icon name="mic" />
          </button>
        )}
      </span>
      {(ready || !!String(props.value ?? "").trim()) && (
        <button type="button" className="icon send" onMouseDown={(e) => e.preventDefault()} onClick={onSend} title="Send" aria-label="Send the message">
          <Icon name="up" />
        </button>
      )}
    </label>
  );
}

// The favicon for the Dynamic Island: a PNG in base64, or "" when there is none. ActivityKit takes 4 KB of data
// at most for each update, so a favicon that stays too large after it shrinks shows no icon.
// `artwork` is the same favicon as a 128 px PNG data URL for Now Playing, or the Yonder icon when there is no favicon.
function useIslandIcon(src?: string) {
  const [icon, setIcon] = useState("");
  const [artwork, setArtwork] = useState("");
  useEffect(() => {
    setIcon("");
    setArtwork("");
    // Now Playing fills transparent pixels with white, so the artwork gets a black background.
    const draw = (img: HTMLImageElement, size: number, fill?: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx && fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, size, size); }
      ctx?.drawImage(img, 0, 0, size, size);
      return canvas.toDataURL("image/png");
    };
    const img = new Image();
    img.onload = () => {
      setArtwork(draw(img, 128, "#000"));
      if (img.src.endsWith("/favicon.svg")) return;
      for (const size of [48, 32, 24]) {
        const data = draw(img, size).split(",")[1] ?? "";
        if (data.length <= 3000) return setIcon(data);
      }
    };
    img.onerror = () => !img.src.endsWith("/favicon.svg") && (img.src = "/favicon.svg");
    img.src = src ?? "/favicon.svg";
    return () => void (img.onload = img.onerror = null);
  }, [src]);
  return { icon, artwork };
}

// The favicon of a project, from the bridge. A project with no favicon shows nothing: no empty box and no gap, so its
// name starts where the favicon would. On the phone, the img comes only when the file is loaded, else an empty
// bordered square shows in place of a missing favicon.
// A project of another computer gets its favicon from that computer, through its link (LinkOf).
function Favicon({ path, onError, ...props }: { path: string } & ImgHTMLAttributes<HTMLImageElement>) {
  const link = useContext(LinkOf);
  const src = useBridgeSrc(`/favicon?path=${encodeURIComponent(path)}`, undefined, link.far ? link.fetch : undefined);
  const [failed, setFailed] = useState<string>();
  if (!src || failed === src) return null;
  return <img src={src} alt="" {...props} onError={(e) => (setFailed(src), onError?.(e))} />;
}

// A message of the user. Its pictures show at the right, apart from the bubble of its words and before it, as in iOS
// Messages, so that a tall picture does not make the bubble tall.
function UserTurn({ text, pictures, waits }: { text: string; pictures?: ReactNode; waits?: boolean }) {
  // A message that waits is one bubble with a dotted edge, with its pictures over its words, as a queued message. A
  // message with only pictures gets the bubble too.
  if (waits) return <li className="user waits">{pictures}{text.trim() && withPlaces(text)}</li>;
  return (
    <>
      {pictures && <li className="user-media">{pictures}</li>}
      {text.trim() && <li className={waits ? "user waits" : "user"}>{withPlaces(text)}</li>}
    </>
  );
}

// The pictures, videos and sounds that one turn names. A URL loads as it is, and the bridge serves a local file.
// A page of the Canvas tab shows as a card at the width of the chat, over the row of the other media.
function MediaRow({ media, owner }: { media: Media[]; owner?: string }) {
  const link = useContext(LinkOf);
  const rest = media.filter((m) => m.kind !== "page");
  return (
    <>
      {media.filter((m) => m.kind === "page").map((m) => <ArtifactCard key={m.src} path={m.src} owner={owner} far={link.far ? link.fetch : undefined} />)}
      {rest.length > 0 && (
        <div className="media">
          {rest.map((m) => <MediaItem key={m.src} {...m} owner={owner} />)}
        </div>
      )}
    </>
  );
}
// `v` changes when the file changes, so a new message with a new file at the same path does not show the old file.
function MediaItem({ src, kind, v, owner }: Media & { owner?: string }) {
  const link = useContext(LinkOf);
  // A PDF loads only at a tap, because the card shows no part of it.
  const local = useBridgeSrc(src.startsWith("/") && kind !== "pdf" ? `/media?path=${encodeURIComponent(src)}&v=${v ?? 0}` : undefined, owner, link.far ? link.fetch : undefined);
  const url = src.startsWith("/") ? local : src;
  const name = src.split("/").pop();
  // The picture or the video in the viewer, or null when the viewer is closed.
  const [big, setBig] = useState<{ src?: string; alt?: string } | null>(null);
  const thumb = useRef<HTMLButtonElement>(null);
  // After a close with a key, the selection is on the picture that the viewer showed last.
  const shownThumb = useRef<HTMLElement | null>(null);
  if (kind === "audio") return <audio src={url} title={name} controls preload="metadata" />;
  if (kind === "pdf") return <PdfCard src={src} name={name || "file.pdf"} />;
  // On the iPhone, a video opens in the player of iOS (`play_video`, QuickLook.swift): large buttons skip 10 seconds back
  // and forward, and the player turns with the phone, so a wide video fills the screen on its side. A video of the Mac
  // goes as the bytes of its blob, and a video of the web as its URL, which the player streams. An older app has no
  // play_video, so the video plays in the viewer of the page. A picture opens in the viewer of the page, with its X and
  // its swipe to close, because Quick Look closes only with a tap on Done.
  const open = async () => {
    if (kind === "video" && inTauri && phone && !android && url) {
      const blob = url.startsWith("blob:") ? await fetch(url).then((r) => r.blob()) : undefined;
      const file = name?.includes(".") ? name : `${name || "video"}.${blob?.type.split("/")[1]?.split(";")[0] || "mp4"}`;
      if (await yonder.native.playVideo(await blob?.arrayBuffer(), { headers: blob ? { name: file } : { url } }).catch(() => false)) return;
    }
    shownThumb.current = null;
    setBig({ src: thumb.current?.querySelector("img")?.src ?? url, alt: name });
  };
  // A swipe to the side in the viewer shows the picture before or after it in the same tab (Chat or Context), in the
  // order of the chat. A video and the picture of a message that waits are not in the row. The left and right arrows do
  // the same.
  const step = (dir: 1 | -1) => {
    const pics = [...(thumb.current?.closest(".convo-panel")?.querySelectorAll<HTMLImageElement>("button.thumb > img") ?? [])];
    const i = pics.findIndex((p) => p.src === big?.src);
    const next = i < 0 ? undefined : pics[i + dir];
    if (next) (setBig({ src: next.src, alt: next.alt }), (shownThumb.current = next.parentElement));
    return !!next;
  };
  // The ↓ of the viewer saves the picture or the video that it shows. A computer saves it in its Downloads folder through
  // its bridge (/save), and the ↓ turns to a tick. The phone opens the share sheet, with Save Image, or Quick Look when the
  // share sheet fails.
  // shortcut: Android has no share sheet in its web view, so the ↓ does nothing there.
  const [saved, setSaved] = useState<string>();
  const shownSrc = kind === "image" ? big?.src : url;
  const download = async () => {
    const at = shownSrc;
    if (!at) return;
    const file = (kind === "image" ? big?.alt : name) || "file";
    // The bridge URL of a local file carries its path.
    const path = at.startsWith(`${BRIDGE}/media?`) ? new URL(at).searchParams.get("path") : null;
    if (!phone) {
      const blob = at.startsWith("blob:") ? await fetch(at).then((r) => r.blob()) : undefined;
      const res = await yonder.media.save(blob ? { name: file, body: blob } : { src: path ?? at }).catch(() => undefined);
      if (res?.ok) setSaved(at);
      return;
    }
    const blob = await (at.startsWith("blob:") ? fetch(at) : (link.far ? link.fetch : bridgeFetch)(`/media?path=${encodeURIComponent(at)}`)).then((r) => r.blob()).catch(() => undefined);
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], file, { type: blob.type })] });
    } catch (e) {
      if ((e as Error).name !== "AbortError" && inTauri && !android) void yonder.native.quickLook(await blob.arrayBuffer(), { headers: { name: file } }).catch(() => {});
    }
  };
  // A picture or a video shows as a preview in the chat. A click opens it in the viewer, which fills the window.
  // WebKit draws no frame of a video with preload="metadata", so "#t=0.1" asks for the frame at 0.1 s as the preview.
  return (
    <>
      <button ref={thumb} className="thumb" title={name} aria-label={`Open ${name}`} onClick={() => void open()}>
        {kind === "image" ? <img src={url} alt={name} /> : (
          <>
            <video src={url && `${url}#t=0.1`} muted playsInline preload="metadata" />
            <span className="play"><Icon name="play" size={20} filled /></span>
          </>
        )}
      </button>
      <Dialog.Root open={!!big} onOpenChange={(o) => !o && setBig(null)}>
        <Dialog.Portal>
          <Dialog.Popup
            className="viewer"
            aria-label={big?.alt ?? name}
            finalFocus={(type) => (type === "keyboard" && shownThumb.current) || true}
            onKeyDown={(e) => {
              const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
              if (kind === "image" && dir &&!e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) (e.preventDefault(), step(dir));
            }}
          >
            {kind === "image" ? (
              <Zoom src={big?.src} onClose={() => setBig(null)} onStep={step}>
                {(style) => <img src={big?.src} alt={big?.alt} draggable={false} style={style} />}
              </Zoom>
            ) : <Player src={src} url={url} onClose={() => setBig(null)} onSave={() => void download()} />}
            <button className="icon viewer-save" aria-label={kind === "image" ? "Save the picture" : "Save the video"} title="Save" onClick={() => void download()}>
              <Icon name={saved && saved === shownSrc ? "tick" : "download"} />
            </button>
            <Dialog.Close className="icon viewer-close" aria-label={kind === "image" ? "Close the picture" : "Close the video"} title="Close"><Icon name="x" /></Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

// A PDF of the chat: a card with its name. On the iPhone a tap opens it in Quick Look, and its share button saves it to
// Files. Another phone opens the share sheet. A computer opens it, and a PDF of another computer as a copy in Downloads.
function PdfCard({ src, name }: { src: string; name: string }) {
  const link = useContext(LinkOf);
  const via = link.far ? link.fetch : bridgeFetch;
  const open = async () => {
    const bytes = () => via(`/media?path=${encodeURIComponent(src)}`).then((r) => (r.ok ? r.blob() : Promise.reject()));
    if (!phone) return void (await yonder.media.save(link.far ? { name, body: await bytes() } : { src }, true).catch(() => {}));
    const blob = await bytes().catch(() => undefined);
    if (!blob) return;
    if (inTauri && !android && (await yonder.native.quickLook(await blob.arrayBuffer(), { headers: { name } }).catch(() => false))) return;
    await navigator.share({ files: [new File([blob], name, { type: "application/pdf" })] }).catch(() => {});
  };
  return (
    <button className="thumb pdf" title={name} aria-label={`Open ${name}`} onClick={() => void open()}>
      <Icon name="doc" size={22} />
      <span>{name}</span>
    </button>
  );
}

// A video in the viewer, with the controls of the app under it: back 10 seconds, play, forward 10 seconds, a bar to
// seek, the time that is left, and the sound. One number counts down, so the user sees how much is left, and it takes
// less room than two. The controls always show, and nothing covers the video: the controls of WebKit fade the video
// in black under the pointer. A right-click, or a long press on the phone, opens the menu of the app. A pinch zooms the
// video as it zooms a picture (Zoom). Space plays and pauses.
// On the phone, the buttons are 44 px and there is no bar: a tap on a skip button is easier than a drag on a thin
// bar.
function Player({ src, url, onClose, onSave }: { src: string; url?: string; onClose: () => void; onSave: () => void }) {
  const link = useContext(LinkOf);
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState({ paused: true, muted: false, at: 0, of: 0 });
  const sync = () => {
    const v = video.current;
    if (v) setState({ paused: v.paused, muted: v.muted, at: v.currentTime, of: Number.isFinite(v.duration) ? v.duration : 0 });
  };
  const toggle = () => {
    const v = video.current;
    if (v) void (v.paused ? v.play().catch(() => {}) : v.pause());
  };
  const mute = () => video.current && (video.current.muted = !video.current.muted);
  // The video stops at its end when a skip goes past it.
  const skip = (s: number) => {
    const v = video.current;
    if (v) (v.currentTime = Math.max(0, v.currentTime + s)), sync();
  };
  // timeupdate comes only 4 times a second, so the bar moves with each frame while the video plays.
  useEffect(() => {
    if (state.paused) return;
    let frame = requestAnimationFrame(function tick() {
      sync();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [state.paused]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as Element).closest?.("button, input")) return;
      e.preventDefault();
      toggle();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  // A file of this computer has a path, and the folder of the computer can show it. A video of another computer has none here.
  const local = src.startsWith("/") && !link.far && !phone;
  const copy = () => void (phone ? navigator.clipboard.writeText(src) : yonder.tool("copy_to_clipboard", { text: src })).catch(() => {});
  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger className="viewer-media">
          <Zoom src={url} onClose={onClose} onStep={() => false}>
            {(style) => (
              <video ref={video} src={url} autoPlay playsInline style={style}
                onPlay={sync} onPause={sync} onTimeUpdate={sync} onLoadedMetadata={sync} onDurationChange={sync} onVolumeChange={sync} />
            )}
          </Zoom>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner className="menu-layer">
            <ContextMenu.Popup className="menu">
              <ContextMenu.Item className="menu-item" onClick={toggle}>{state.paused ? "Play" : "Pause"}</ContextMenu.Item>
              <ContextMenu.Item className="menu-item" onClick={mute}>{state.muted ? "Unmute" : "Mute"}</ContextMenu.Item>
              <ContextMenu.Item className="menu-item" onClick={copy}>{src.startsWith("/") ? "Copy Path" : "Copy Link"}</ContextMenu.Item>
              <ContextMenu.Item className="menu-item" onClick={onSave}>Save</ContextMenu.Item>
              {local && (
                <ContextMenu.Item className="menu-item" onClick={() => void yonder.tool("open_folder", { path: src }).catch(() => {})}>
                  {platform === "win32" ? "Show in Explorer" : platform === "linux" ? "Show in Folder" : "Show in Finder"}
                </ContextMenu.Item>
              )}
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <div className="player">
        <button aria-label="Back 10 seconds" title="Back 10 seconds" onClick={() => skip(-10)}>
          <Icon name="back10" />
        </button>
        <button aria-label={state.paused ? "Play" : "Pause"} title={state.paused ? "Play" : "Pause"} onClick={toggle}>
          <Icon name={state.paused ? "play" : "pause"} filled />
        </button>
        <button aria-label="Forward 10 seconds" title="Forward 10 seconds" onClick={() => skip(10)}>
          <Icon name="forward10" />
        </button>
        <input type="range" min={0} max={state.of} step="any" value={state.at} aria-label="Seek" style={{ "--at": state.of ? state.at / state.of : 0 } as CSSProperties}
          onChange={(e) => {
            const v = video.current;
            if (v) (v.currentTime = Number(e.target.value)), sync();
          }} />
        <span>−{clock((state.of - state.at) * 1000)}</span>
        <button aria-label={state.muted ? "Unmute" : "Mute"} title={state.muted ? "Unmute" : "Mute"} onClick={mute}>
          <Icon name={state.muted ? "mute" : "volume"} />
        </button>
      </div>
    </>
  );
}

// A picture or a video in the viewer, which the user can zoom from 1x to 8x and move. A pinch with two fingers or on the
// trackpad zooms, and so does ⌃ with the scroll wheel. A double click or a double tap zooms to 3x at that point,
// or back to 1x. A drag, or a scroll, moves the zoomed picture. A click next to the picture at 1x closes the viewer.
// At 1x, a swipe up or down moves the picture and fades the black. A swipe of 100 px or a flick closes the viewer, and a
// shorter one puts the picture back, as in Photos.
// At 1x, a swipe to the right shows the picture before, and a swipe to the left the picture after, if there is one
// (onStep). On the trackpad a swipe with two fingers does the same.
// shortcut: the picture can move off the screen when zoomed; a double tap brings it back. Clamp the pan if that annoys.
// `children` draws the picture or the video with the style that zooms and moves it.
function Zoom({ src, onClose, onStep, children }: { src?: string; onClose: () => void; onStep: (dir: 1 | -1) => boolean; children: (style: CSSProperties) => ReactNode }) {
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  // A new picture, as from an arrow key, starts at 1x.
  useEffect(() => setView({ s: 1, x: 0, y: 0 }), [src]);
  // The wheel listener is added once, so it reads the scale and onStep from refs.
  const scale = useRef(1);
  scale.current = view.s;
  const step = useRef(onStep);
  step.current = onStep;
  const box = useRef<HTMLDivElement>(null);
  // The point (px, py) on the screen stays under the finger or the pointer while the scale changes to s.
  const zoomAt = (v: typeof view, s: number, px: number, py: number) => {
    s = Math.min(8, Math.max(1, s));
    if (s === 1) return { s, x: 0, y: 0 };
    const r = box.current!.getBoundingClientRect();
    const qx = px - r.left - r.width / 2;
    const qy = py - r.top - r.height / 2;
    return { s, x: qx - (s / v.s) * (qx - v.x), y: qy - (s / v.s) * (qy - v.y) };
  };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const tap = useRef({ t: 0, x: 0, y: 0 });
  // The swipe: how far the finger moved down (or up, below 0), or to the side (slide), and the last point and time, for
  // the speed of a flick. The first 8 px pick the axis.
  const [pull, setPull] = useState(0);
  const [slide, setSlide] = useState(0);
  const [back, setBack] = useState(false);
  const swipe = useRef<{ x: number; y: number; t: number; v: number; axis?: "x" | "y" } | null>(null);
  // shortcut: a trace of each pinch on the phone, in call.log ("Phone pinch"), to see what iOS sends. Remove it when the
  // pinch works on the iPhone.
  const trace = useRef({ touches: 0, pinch: 0, gesture: 0, pointers: 0, cancel: 0 });
  const flush = () => {
    const t = trace.current;
    if (phone && (t.touches > 1 || t.pointers > 1 || t.gesture)) void bridgeFetch("/log", { method: "POST", body: `Phone pinch: ${JSON.stringify({ ...t, s: scale.current })}` }).catch(() => {});
    trace.current = { touches: 0, pinch: 0, gesture: 0, pointers: 0, cancel: 0 };
  };
  useEffect(() => {
    const viewer = box.current?.parentElement;
    if (viewer) viewer.style.background = `rgb(0 0 0 / ${1 - Math.min(Math.abs(pull) / 400, 0.8)})`;
  }, [pull]);
  const down = (e: ReactPointerEvent) => {
    // Only the main button of a mouse holds the picture. A right-click or a ctrl+click opens the menu, which takes the
    // pointerup, and else the picture then follows the mouse.
    if (e.pointerType === "mouse" && (e.button || e.ctrlKey)) return;
    // A first finger means that each earlier finger is up, also when the long press of the menu took its pointerup.
    if (e.isPrimary) pointers.current.clear();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    trace.current.pointers = Math.max(trace.current.pointers, pointers.current.size);
    setBack(false);
    swipe.current = pointers.current.size === 1 && view.s === 1 ? { x: e.clientX, y: e.clientY, t: e.timeStamp, v: 0 } : null;
    if (pointers.current.size !== 1) return (setPull(0), setSlide(0));
    const last = tap.current;
    const double = e.timeStamp - last.t < 300 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30;
    tap.current = { t: double ? 0 : e.timeStamp, x: e.clientX, y: e.clientY };
    if (double) setView((v) => (v.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(v, 3, e.clientX, e.clientY)));
  };
  // Two fingers zoom with the touch events (pinch below), so the pointer events move the picture only with one.
  const move = (e: ReactPointerEvent) => {
    // A mouse with no button down lost its pointerup, as outside the window, so its drag ends.
    if (e.pointerType === "mouse" && !e.buttons) return up(e);
    const map = pointers.current;
    const old = map.get(e.pointerId);
    if (!old) return;
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (map.size === 1 && swipe.current) {
      const s = swipe.current;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      s.v = (s.axis === "x" ? e.clientX - old.x : e.clientY - old.y) / Math.max(1, e.timeStamp - s.t);
      s.t = e.timeStamp;
      if (s.axis === "x") setSlide(dx);
      else if (s.axis === "y") setPull(dy);
    } else if (map.size === 1) {
      setView((v) => (v.s === 1 ? v : { ...v, x: v.x + e.clientX - old.x, y: v.y + e.clientY - old.y }));
    }
  };
  const up = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (e.type === "pointercancel") trace.current.cancel++;
    if (!pointers.current.size) flush();
    const s = swipe.current;
    if (!s || pointers.current.size) return;
    swipe.current = null;
    if (s.axis === "y" && (Math.abs(pull) > 100 || (Math.abs(s.v) > 0.6 && Math.abs(pull) > 20))) return onClose();
    if (s.axis === "x" && (Math.abs(slide) > 50 || (Math.abs(s.v) > 0.6 && Math.abs(slide) > 20)) && onStep(slide < 0 ? 1 : -1)) return setSlide(0);
    setBack(true);
    setPull(0);
    setSlide(0);
  };
  // React adds wheel listeners as passive, so they cannot stop the scroll. Safari sends a pinch on the trackpad
  // as gesture events, and Chromium sends it as a wheel event with ctrlKey.
  useEffect(() => {
    const el = box.current!;
    // A swipe to the side at 1x moves one picture, as the tabs of the list (onWheel in App). A gap of 200 ms ends it.
    const side = { dx: 0, at: 0, done: false };
    const wheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) return setView((v) => zoomAt(v, v.s * Math.exp(-e.deltaY / 100), e.clientX, e.clientY));
      if (scale.current > 1) return setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      if (e.timeStamp - side.at > 200) Object.assign(side, { dx: 0, done: false });
      side.at = e.timeStamp;
      if (side.done || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      side.dx += e.deltaX;
      if (Math.abs(side.dx) < 60) return;
      side.done = true;
      step.current(side.dx > 0 ? 1 : -1);
    };
    // A pinch with two fingers: the distance between them sets the scale, and their middle moves the picture. It reads
    // the touch events, which iOS sends for each finger. The pointer events zoom in Chrome but not on the iPhone.
    let pinch: { d: number; mx: number; my: number } | null = null;
    const touch = (e: TouchEvent) => {
      const t = e.touches;
      trace.current.touches = Math.max(trace.current.touches, t.length);
      if (t.length !== 2) {
        pinch = null;
        if (!t.length) flush();
        return;
      }
      e.preventDefault();
      const now = { d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), mx: (t[0].clientX + t[1].clientX) / 2, my: (t[0].clientY + t[1].clientY) / 2 };
      const was = pinch;
      pinch = now;
      if (!was) return;
      trace.current.pinch++;
      setView((v) => {
        const z = zoomAt(v, (v.s * now.d) / was.d, now.mx, now.my);
        return z.s === 1 ? z : { ...z, x: z.x + now.mx - was.mx, y: z.y + now.my - was.my };
      });
    };
    let start = 1;
    const gesture = (e: Event) => {
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      e.preventDefault();
      trace.current.gesture++;
      // On the phone a pinch also sends touch events, and those zoom already.
      if (pinch || pointers.current.size > 1) return;
      if (e.type === "gesturestart") setView((v) => ((start = v.s), v));
      else setView((v) => zoomAt(v, start * g.scale, g.clientX, g.clientY));
    };
    const touches = ["touchstart", "touchmove", "touchend", "touchcancel"];
    el.addEventListener("wheel", wheel, { passive: false });
    for (const type of touches) el.addEventListener(type, touch as EventListener, { passive: false });
    for (const type of ["gesturestart", "gesturechange"]) el.addEventListener(type, gesture);
    return () => {
      el.removeEventListener("wheel", wheel);
      for (const type of touches) el.removeEventListener(type, touch as EventListener);
      for (const type of ["gesturestart", "gesturechange"]) el.removeEventListener(type, gesture);
    };
  }, []);
  return (
    <div
      ref={box}
      className="zoom"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => e.target === e.currentTarget && view.s === 1 && onClose()}
    >
      {children({ transform: `translate(${view.x + slide}px, ${view.y + pull}px) scale(${view.s * (1 - Math.min(Math.abs(pull) / 2000, 0.15))})`, transition: back ? "transform 0.25s var(--ease-out)" : undefined })}
    </div>
  );
}

// The changed lines of one edit, as Claude Code shows them: the line number, then red for a removed
// line and green for an added line. A removed line has its number in the old file, the others in the new file.
// One tool call as the terminal of Claude Code shows it: a dot, the name and the main input, and the first lines of
// the result under it. A tap opens the full input and result, as ctrl+o does in the terminal. The bridge gives them
// only on the tap, because the app reads the conversation every 3 seconds.
function ToolTurn({ t, worker, media }: { t: Turn; worker: string; media?: ReactNode }) {
  const link = useContext(LinkOf);
  const [full, setFull] = useState<{ input: Record<string, unknown>; output: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const open = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open || full) return;
    setFailed(false);
    yonder.chat.tool(worker, t.id!, link.fetch).then(setFull, () => setFailed(true));
  };
  return (
    <li className={`tool${t.error ? " error" : ""}${t.running ? " running" : ""}`}>
      <details onToggle={open}>
        <summary>
          {t.diff ? <Diff text={t.text} hunks={t.diff} /> : <div className="head">{swatches(t.text)}</div>}
          {t.out && (
            <div className="out">
              {t.out.map((l, i) => <div key={i}>{l || " "}</div>)}
              {!!t.more && <div className="more">… +{t.more} lines</div>}
            </div>
          )}
        </summary>
        <div className="full">
          {full ? (
            <>
              <pre>{typeof full.input.command === "string" ? full.input.command : Object.keys(full.input).length === 1 ? String(Object.values(full.input)[0]) : JSON.stringify(full.input, null, 2)}</pre>
              {!t.running && <pre className="output">{full.output || "(No content)"}</pre>}
            </>
          ) : failed ? "Cannot load the tool call." : "…"}
        </div>
      </details>
      {media}
    </li>
  );
}

function Diff({ text, hunks }: { text: string; hunks: Hunk[] }) {
  const all = hunks.flatMap((h) => h.lines);
  const added = all.filter((l) => l[0] === "+").length;
  const removed = all.filter((l) => l[0] === "-").length;
  return (
    <>
      <div className="head">
        {text} <span className="count">(+{added} -{removed})</span>
      </div>
      <div className="diff">
        {hunks.map((h, i) => {
          let old = h.old;
          let now = h.new;
          return h.lines.map((l, j) => {
            const kind = l[0] === "+" ? "add" : l[0] === "-" ? "del" : l[0] === " " ? "same" : "more";
            const n = kind === "add" ? now++ : kind === "del" ? old++ : kind === "same" ? (old++, now++) : "";
            return (
              <div key={`${i}-${j}`} className={`${kind}${i && !j ? " gap" : ""}`}>
                <span className="n">{n}</span>
                <span>{kind === "more" ? l : `${kind === "same" ? " " : l[0]} ${l.slice(1)}`}</span>
              </div>
            );
          });
        })}
      </div>
    </>
  );
}

// One past call: the time, the length and the first words. A click opens the full transcript.
export function CallRow({ c, onOpen }: { c: CallLog; onOpen: () => void }) {
  const end = c.lines.at(-1)?.at ?? c.id;
  return (
    <div
      className="worker row"
      data-id={c.id}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
    >
      <span className="glyph">☏</span>
      <span className="name">{callDate(c)}</span>
      <span className="what">{c.lines.find((l) => l.who === "you")?.text ?? "Nothing said."}</span>
      <span className="age">{clock(end - c.id)}</span>
    </div>
  );
}

// One app of the Canvas tab: a page that an agent made, or a web site. A tap opens it. On the phone, a swipe to the right
// saves it or unsaves it, and a swipe to the left archives a page or deletes a site, as the rows of the agents. A long
// press on the phone, or a right-click on the Mac, opens a menu: Rename, Save, Change icon, Rebuild, Archive and Delete. Delete removes a page with its files after a
// yes, with no stop in the archive. A saved app shows a star, as a starred agent, and stays at the top. The rows slide
// in one after the other when the tab shows (--i).
type AppActs = { save: (on: boolean) => void; rename: (title: string) => void; icon: (icon: string) => void; remove: () => void; redo?: (what: "icon" | "app") => void; restore?: () => void; forever?: () => void };
// `grid`: a tile of the grid, an icon with its name under it, as the home screen of the iPhone. It has no swipe, and a
// long press opens the same menu. `archived`: a page in the archive. A swipe to the right restores it, and a swipe to
// the left deletes it forever after a yes. A page with no `forever` is a site, which only hides (Delete).
function AppRow({ id, title, sub, icon, trailing, saved, fresh, i, act, onOpen, grid, archived }: { id: string; title: string; sub: string; icon: ReactNode; trailing?: ReactNode; saved: boolean; fresh?: boolean; i: number; act: AppActs; onOpen: () => void; grid?: boolean; archived?: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [picking, setPicking] = useState(false);
  const swipe = useSwipeOpen(phone && !grid ? 1 : 0, phone && !grid, (dir) => {
    if (archived && dir < 0) return void act.forever?.(), true;
    if (dir > 0 && !archived) return act.save(!saved), true;
    const el = swipe.ref.current;
    const still = !el || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still) collapse(el, 100);
    setTimeout(archived ? act.restore! : act.remove, still ? 0 : 310);
    return false;
  });
  const done = (e: { currentTarget: HTMLInputElement }) => {
    const t = e.currentTarget.value.trim();
    setRenaming(false);
    if (t && t !== title) act.rename(t);
  };
  const stop = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(), onKeyDown: (e: { stopPropagation: () => void }) => e.stopPropagation() };
  const away = act.forever ? "Archive" : "Delete";
  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={<div />}
          ref={swipe.ref}
          className={`${grid ? "app-tile" : "worker row app-row"}${fresh ? " fresh" : ""}`}
          data-id={id}
          style={{ "--i": Math.min(i, 12) } as CSSProperties}
          role="button"
          tabIndex={0}
          aria-label={grid ? title : undefined}
          onClick={() => swipe.tap() || renaming || onOpen()}
          onKeyDown={(e) => !renaming && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
          {...swipe.handlers}
        >
          {swipe.handlers && (
            <>
              <span className="swipe-actions">
                {archived ? (
                  <button className="restore_app full" tabIndex={-1} onClick={(e) => (e.stopPropagation(), act.restore?.())}>
                    <span aria-label="Restore">
                      <Icon name="restore" size={22} />
                    </span>
                  </button>
                ) : (
                  <button className="save_app full" tabIndex={-1} onClick={(e) => (e.stopPropagation(), swipe.shut(), act.save(!saved))}>
                    <span aria-label={saved ? "Unstar" : "Star"}>
                      <Icon name="star" size={22} filled={!saved} />
                    </span>
                  </button>
                )}
              </span>
              <span className="swipe-actions end">
                <button className="remove_app full" tabIndex={-1} onClick={(e) => (e.stopPropagation(), archived ? (swipe.shut(), act.forever?.()) : act.remove())}>
                  <span aria-label={archived ? "Delete forever" : away}>
                    <Icon name={archived || !act.forever ? "trash" : "archive"} size={22} />
                  </span>
                </button>
              </span>
            </>
          )}
          {icon}
          {renaming ? (
            <input className="name app-rename" autoFocus defaultValue={title} aria-label="New name" enterKeyHint="done" {...stop} onKeyDown={(e) => (e.stopPropagation(), e.key === "Enter" ? done(e) : e.key === "Escape" && setRenaming(false))} onBlur={done} />
          ) : (
            <span className="name">
              {title}
              {saved && (
                <span className="app-pin" aria-label="Starred">
                  <Icon name="star" size={grid ? 10 : 12} filled />
                </span>
              )}
            </span>
          )}
          {!grid && <span className="what">{sub}</span>}
          {trailing && !grid && (
            <span className="age" {...stop}>
              {trailing}
            </span>
          )}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner className="menu-layer">
            <ContextMenu.Popup className="menu">
              {archived ? (
                <>
                  <ContextMenu.Item className="menu-item" onClick={act.restore}>
                    Restore
                  </ContextMenu.Item>
                  <ContextMenu.Item className="menu-item" onClick={act.forever}>
                    Delete forever
                  </ContextMenu.Item>
                </>
              ) : (
                <>
                  {/* The menu gives the focus back to the row when it closes, so the field of the name waits for that.
                      shortcut: a fixed wait of 300 ms; the finalFocus of the menu, if it ever takes the field away. */}
                  <ContextMenu.Item className="menu-item" onClick={() => setTimeout(() => setRenaming(true), 300)}>
                    Rename
                  </ContextMenu.Item>
                  <ContextMenu.Item className="menu-item" onClick={() => act.save(!saved)}>
                    {saved ? "Unstar" : "Star"}
                  </ContextMenu.Item>
                  <ContextMenu.Item className="menu-item" onClick={() => setPicking(true)}>
                    Change icon
                  </ContextMenu.Item>
                  {act.redo && (
                    <ContextMenu.Item className="menu-item" onClick={() => act.redo!("app")}>
                      Rebuild
                    </ContextMenu.Item>
                  )}
                  <ContextMenu.Item className="menu-item" onClick={act.remove}>
                    {away}
                  </ContextMenu.Item>
                  {act.forever && (
                    <ContextMenu.Item className="menu-item" onClick={act.forever}>
                      Delete
                    </ContextMenu.Item>
                  )}
                </>
              )}
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {picking && <IconPicker name={title} onPick={act.icon} onDraw={act.redo && (() => act.redo!("icon"))} onClose={() => setPicking(false)} />}
    </>
  );
}
// An address that the search of the Canvas tab can open: a port, localhost with a port, an IP address or a domain.
const isAddress = (text: string) => /^(https?:\/\/)?((localhost|\d{1,3}(\.\d{1,3}){3})(:\d{2,5})?|:?\d{2,5}|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d{2,5})?)(\/\S*)?$/i.test(text.trim());
// An address of this computer, such as http://localhost:5173.
const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);

// The full transcript of one call, in the style of the conversation of an agent.
function CallView({ c, onBack }: { c: CallLog; onBack: () => void }) {
  const edge = useSwipeBack(onBack);
  const sent = sentFor(c.lines);
  return (
    <>
      <div ref={edge} className="convo-head">
        <button className="icon" data-native="call-back" data-icon="back" data-glyph="22" onClick={onBack} title="Back" aria-label="Back to the calls">
          <Icon name="back" />
        </button>
        <span className="name">{callDate(c)}</span>
        <span className="age">{clock((c.lines.at(-1)?.at ?? c.id) - c.id)}</span>
      </div>
      {c.lines.length === 0 && <p className="empty">Nothing said.</p>}
      <ol className="list convo">
        {c.lines.map((l, i) =>
          l.who === "sent" ? null : l.who === "you" && sent.get(i) ? (
            // A click on the question shows the prompts that the agents got for it.
            <li key={i} className="user">
              <details>
                <summary>
                  {l.text}
                  <span className="to">Sent to {sent.get(i)!.map((p) => p.to).join(", ")}</span>
                </summary>
                {sent.get(i)!.map((p, j) => (
                  <div key={j} className="sent">
                    <b>{p.to}</b>
                    {p.text}
                  </div>
                ))}
              </details>
            </li>
          ) : (
            <li key={i} className={l.who === "you" ? "user" : l.who === "yonder" ? "assistant" : "tool"} title={l.who === "tool" ? l.text : undefined}>
              {l.text}
            </li>
          ),
        )}
      </ol>
    </>
  );
}

// The prompts that the agents got for each question of the user, by the index of the question: the "sent" lines
// up to the next question. Calls of older versions have no "sent" lines, so the start_worker and
// message_worker calls of Grok give their words, without the voice-call block.
// shortcut: Grok can send a request after the user starts the next question, and it then shows under that question.
function sentFor(lines: CallLine[]) {
  const out = new Map<number, { to: string; text: string }[]>();
  const old = !lines.some((l) => l.who === "sent");
  let q = -1;
  lines.forEach((l, i) => {
    if (l.who === "you") return void (q = i);
    const tool = old && l.who === "tool" && /^(start_worker|message_worker) (\{.*)$/s.exec(l.text);
    let p: { to: string; text: string } | undefined;
    if (l.who === "sent") p = { to: byName() ? tagNum(l.num ?? 0) : `${word.One} ${l.num}`, text: l.text };
    else if (tool) {
      try {
        const a = JSON.parse(tool[2]);
        p = { to: tool[1] === "start_worker" ? `New ${word.one}` : `${word.One} ${a.worker}`, text: a.task ?? a.message ?? "" };
      } catch {}
    }
    if (p && q >= 0) out.set(q, [...(out.get(q) ?? []), p]);
  });
  return out;
}

const callDate = (c: CallLog) => new Date(c.id).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// "claude-opus-5-5" is "Opus 5.5", and "claude-haiku-5-5" is "Haiku 5.5".
const modelName = (model: string) => {
  if (!/^(claude|fable|opus|sonnet|haiku)/.test(model)) return model;
  const [family, ...version] = model.replace(/^claude-/, "").replace(/-\d{8}$/, "").split("-");
  return `${family[0].toUpperCase()}${family.slice(1)} ${version.join(".")}`.trim();
};

// "288k / 1M": the tokens in use and the context window. Only the tokens when the window is not known.
const tokens = (n: number) => (n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}M` : `${Math.round(n / 1000)}k`);
const context = ({ used, window }: { used: number; window?: number }) =>
  window ? `${tokens(used)} / ${tokens(window)}` : tokens(used);

// The last point of the summary of a waiting agent: what it asks the user.
const needs = (w: Worker) => (w.status === "waiting" && w.summary ? w.summary.split("\n").pop()!.replace(/^- /, "") : "");

// One agent, for the prompt of Grok.
const line = (w: Worker) =>
  [
    `- ${w.num ? voiceRef(w, openAgents) : "A closed agent with no number"}, "${w.name}", in ${w.project} (worker ${w.id}${w.kind ? `, ${w.kind} session` : ""}${w.cli ? `, runs in ${cliName(w.cli)}` : ""}): ${LABEL[w.status]}, on the ${TAB_NAME[tabOf(w)]} tab` +
      `${w.status !== "running" && w.status !== "closed" ? `, ${w.status === "waiting" ? "waits" : "finished"} ${ago(Date.now() - w.updatedAt)} ago` : ""}` +
      `${w.createdAt ? `, started ${ago(Date.now() - w.createdAt)} ago` : ""}` +
      `${w.saved ? ", saved for later by the user" : ""}${w.closeWhenDone ? ", closes itself when done" : ""}${w.status === "closed" ? (w.closedItself ? ", closed itself when its work was done, no news" : `, closed ${w.closedBy === undefined ? "on purpose" : typeof w.closedBy === "number" ? `by agent ${w.closedBy}` : { you: "by the user", voice: "by the voice agent", mcp: "by another MCP client" }[w.closedBy]}, no news`) : w.attention ? `, needs the user's attention${w.unread ? "" : " (the user read it)"}` : w.unread ? ", unread" : ""}${w.context ? `, context ${context(w.context)}` : ""}.`,
    w.task && `  Task: ${w.task.replace(/\s+/g, " ").slice(0, 200)}`,
    w.activity && `  Now: ${w.activity}`,
    w.queue?.length && `  Queued messages: ${w.queue.length}, sent when it finishes`,
    w.result && `  End of its last message: ${w.result.replace(/\s+/g, " ").slice(-600)}`,
    w.summary && `  Summary: ${w.summary.replace(/\n/g, " ")}`,
    needs(w) && `  What it needs from the user: ${needs(w)}`,
  ]
    .filter(Boolean)
    .join("\n");

// The open tab, the selected project, and its agents in the order of the screen.
function screen({ tab, project, agents, images, videos = [], pastes = 0, uploading = 0, open, away }: View) {
  const n = open && label(open);
  // An agent of another computer has a number of that computer, so Grok reaches it with other_computer.
  const far = away && label(away.agent);
  const reading = away
    ? `The user reads the conversation of agent ${far}, "${away.agent.name}" (${LABEL[away.agent.status]}), an agent of the environment ${away.computer}. ` +
      `When the user says "this one", "this agent" or "it" and names no agent, they mean it. Each request of the user goes to it: call other_computer with computer "${away.computer}", the tool message_worker and the worker "${far}". ` +
      `For a question about it, call other_computer with get_worker. Agent ${far} of this environment is another agent.\n`
    : open
    ? `The user reads the conversation of agent ${n}, "${open.name}" (${LABEL[open.status]}). ` +
      `When the user says "this one", "this agent" or "it" and names no agent, they mean agent ${n}. ` +
      `The user focuses on agent ${n} now. Answer only about it, and do NOT tell about other agents unless the user names them, goes back to the list, or asks for the next agent of a walkthrough. ` +
      `Each request of the user goes to agent ${n} with message_worker, also a new task with no agent number, and also when agent ${n} is done. Call start_worker ONLY when the user names another agent or another project ("send it to 2"), asks for a new agent, or asks for a change of Yonder ("remember to ..."). "Another agent", "a new agent" or "get an agent to" with no agent number ALWAYS asks for a new agent, such as "send another agent to fix this". A command for this app ("update the app", "show completed", "end the call") calls its own tool, NEVER message_worker. When agent ${n} runs, send a new task without now, so that it gets the message after its next step and does not stop its work. A request while the user reads an agent goes to that agent. A question to YOU about agent ${n} or its result is not a request for it: "what did it say?", "give me a summary", "a better summary", "more details", "explain it", "is it good to go?". Words about your last answer are for you too: "that was a question", "I'm asking you". Then call get_worker with full set to true, wait for its result, and answer yourself. NEVER call message_worker for these. Once, the user asked you for a better summary of agent 2, and you sent the words to agent 2. ` +
      (open.parent
        ? `Agent ${n} is a sub-agent that agent ${open.num} started. message_worker and get_worker take "${n}", and agent ${open.num} passes a message on to it. It cannot be closed, stopped, renamed, saved or opened in the terminal.\n`
        : `Call open_in_terminal for agent ${n} only when the user names Ghostty or the terminal. ` +
          `When its turn ends, the app tells you what the user asked and what it answered. Then tell the user both in one or two short sentences.\n`)
    : "";
  const attached = images
    ? `\nThe user attached ${images} image${images > 1 ? "s" : ""} in the app window. They go to the agent with your next start_worker or message_worker call. ` +
      `When the user says "this image", "the screenshot" or "this", they mean them. You cannot see them, and you do not need to: the agent reads them.`
    : "";
  const filmed =
    (pastes
      ? `\nThe user pasted ${pastes} text${pastes > 1 ? "s" : ""} in the app window. They go to the agent with your next start_worker or message_worker call. ` +
        `When the user says "the text", "what I pasted", "this file" or "this", they mean them. A copied file pastes as its path. To read them, call read_paste.`
      : "") +
    (uploading ? "\nThe user attaches a video now. It goes to the agent with your next start_worker or message_worker call, which waits for the upload." : "") +
    (videos.length
      ? `\nThe user attached ${videos.length} video${videos.length > 1 ? "s" : ""} (${videos.map((s) => `${s} seconds`).join(", ")}) in the app window. ` +
        `They go to the agent with your next start_worker or message_worker call, with the words of their sound and frames. ` +
        `When the user says "the video" or "this", they mean them. You cannot see them, and you do not need to: the agent reads them.`
      : "");
  const shown = tab === "calls"
    ? "The user looks at the calls of the past, the transcripts of past voice calls."
    : tab === "search"
    ? "The user looks at the Search tab: a field that finds agents in all the workspaces, also the done and closed ones."
    : tab === "preview"
    ? "The user looks at the Canvas tab: a search, the approvals that wait for the user, then one list of the pages that the agents made (artifacts) and the web sites of the agents that run on the Mac, each site with a name that says what it is. A site has no switch: its tunnel opens when the user opens it. The starred ones are at the top. When the user asks to clean up or clear the tunnels, call preview with action clean. When the user asks to open a site, call preview with action open and its label from preview list as the worker. When the user asks to close one or to turn its tunnel off, call preview with action stop and its name. When the user asks to tunnel or add an address, such as localhost:3000, call preview with action add and the address as url. When the user asks to open an address, call preview with action open and the address as url. To open a page again, call show_app with its name as id. When the user asks to rename, star, save, keep, unstar or unsave an app, or to give it a new icon, call change_app. When the user asks to delete, remove or archive an app, call remove_app: it goes to the archive. Only when the user says to delete it forever or permanently, call remove_app with forever. When the user asks to restore or unarchive an app, call change_app with archived false. To learn the names of the sites, call preview with action list."
    : !project
    ? "The user has not selected a workspace in the app."
    : (project.path === ALL.path
        ? `The user selected "All workspaces" in the app, so the Agents, Done and Closed tabs show the agents of all the workspaces, and the user looks at the ${tab} tab. "Here" or "these agents" mean the agents of that tab in all the workspaces. When the user asks for new work and names no workspace, give start_worker an empty workspace: Yonder picks the workspace from the task, or the default folder of the user.`
        : tab === "completed" || tab === "saved" || tab === "closed"
        ? `The user looks at the ${TAB_NAME[tab]} tab of the workspace ${project.name}: ${{ completed: "its waiting, done and failed agents. The agents that need the user are at the top", saved: "its agents that the user saved for later", closed: "its closed agents" }[tab]}. When the user says "this workspace", "here" or "these agents" and names no workspace, they mean ${project.name} and the agents of this tab. The list below gives all the agents of ${project.name}, and each line names its tab.`
        : tab === "agents"
        ? `The user looks at the Agents tab of the workspace ${project.name}: its agents that are running. The waiting, done and failed agents are on the Done tab, and the closed agents are on the Closed tab. The list below gives all the agents of ${project.name}, and each line names its tab. When the user says "this workspace", "here" or "these agents" and names no workspace, they mean ${project.name} and its active agents. When the user asks for new work and names no workspace, use ${project.name}.`
        : `The user looks at the list of workspaces. The workspace ${project.name} is selected, so "this workspace" means ${project.name}.`) +
      // Grok miscounts a long list, so it gets the counts of the tabs.
      `\nThe tabs of ${project.name}: ${Object.entries(TAB_NAME).map(([t, name]) => `${agents.filter((w) => tabOf(w) === t).length} on the ${name} tab`).join(", ")}.` +
      `\n${agents.map(line).join("\n") || "This workspace has no agents yet."}`;
  return reading + shown + attached + filmed;
}

// All the agents in a few lines: the counts, and the names of the agents with news.
function overview(workers: Worker[]) {
  if (!workers.length) return "There are no agents.";
  const names = (list: Worker[]) => list.map((w) => `${w.num || ""} "${w.name}" (${TAB_NAME[tabOf(w)]} tab${needs(w) ? `, it asks: ${needs(w)}` : ""})`).join(", ");
  const count = (Object.keys(LABEL) as Status[])
    .map((s) => [s, workers.filter((w) => w.status === s).length] as const)
    .filter(([, n]) => n)
    .map(([s, n]) => `${n} ${LABEL[s]}`)
    .join(", ");
  const waiting = workers.filter((w) => w.status === "waiting");
  // News is what the user has not read yet. The purple dot stays after a read, but it is not news.
  // The user closed the closed agents on purpose, so they are never news.
  const attention = workers.filter((w) => w.attention && w.unread && w.status !== "waiting" && w.status !== "closed");
  return [
    `${workers.length} agents: ${count}.`,
    waiting.length && `Waiting on the user: ${names(waiting)}.`,
    attention.length && `Results that need the user's attention: ${names(attention)}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// On the Agents, Done and Closed tabs, the user works on the project on the screen.
// All projects is no focus: Grok then sees the agents of all the projects.
const focusOf = (view: View) => ((LISTS as readonly string[]).includes(view.tab) && view.project?.path !== ALL.path ? view.project : undefined);

// The time and the place of the user. The Mac gives the time zone, and its city
// ("Europe/Paris") is the place, so the app needs no location permission.
// The prompt has the time to the minute, so the poll updates Grok once a minute.
function timePlace() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = new Date().toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  return `It is now ${time}. The user is in ${zone.split("/").pop()!.replace(/_/g, " ")} (time zone ${zone}).
- Use this time for "today", "tonight" or "now". When the user asks for the time, say it from here.
- Use this place for the weather, the news and other local questions, unless the user names another place.
- Give the units of the user's country: Celsius, kilometers and kilometers per hour in France, Fahrenheit and miles in the United States. Convert a search result to these units.`;
}

// The Grok system prompt, in the section order of the xAI prompting guide.
// How the voice talks: ~/.config/yonder/talk.md of the bridge, which the voice changes with change_talk. The default is
// bridge/talk.md. The prompt of each call gets it, for each voice. The rules that keep the agents safe stay in the code.
let talk = TALK;
// The time of the last call that started again by itself after the network dropped (toggleCall).
let redialed = 0;
export const loadTalk = () => yonder.talk().then((j: { text?: string }) => void (talk = j.text ?? talk), () => {});

function instructions(projects: Project[], workers: Worker[], view: View) {
  // The number of the next new agent: the lowest number that no open agent holds, as freeNum in the bridge.
  const taken = new Set(workers.filter((w) => w.status !== "closed").map((w) => w.num));
  let next = 1;
  while (taken.has(next)) next++;
  const shown = new Set(view.agents.map((w) => w.id));
  // The first words for a new agent: "Agent 4 started.", "Jack started.", or "Agent started." in the projects mode,
  // where the project of the new agent is not known yet (`agentNaming` in config.json).
  const starts = word.naming === "names" ? nameOf(next) : word.naming === "projects" ? "Agent" : `Agent ${next}`;
  const naming =
    word.naming === "names"
      ? `- Call each agent by its name, such as "${nameOf(1)}", never by its number: say "${nameOf(1)} finished.", not "Agent 1 finished.". The lines below give each name with its number, such as "${nameOf(1)} (agent 1)". The user can say the name or the number. The tools take the number.\n`
      : word.naming === "projects"
        ? `- Call each agent by its workspace, such as "Yonder finished.", with the number only when the lines below give it, such as "Yonder 4 (agent 4)": "Yonder 4 finished.". Call a group by the workspace, such as "the Yonder agents". The user can say the workspace or the number. The tools take the number.\n`
        : "";
  // On the Agents, Done and Closed tabs, the news covers only the project on the screen.
  // The prompt then leaves out the agents of other projects, so Grok cannot tell about them by mistake.
  const focus = focusOf(view);
  const recent = focus ? [] : workers.filter((w) => !shown.has(w.id)).slice(0, 12).map(line);
  return (
    forHost(`## Role & Persona
You are Yonder, the voice of a team of coding agents on the user's Mac. Most agents run in Claude Code, and some run in another CLI, such as Codex.
${phone ? "The user talks to you from the Yonder app on the phone, away from the Mac. You cannot open Ghostty, Finder or Chrome on the Mac, or record its screen. When the user asks for one of these, say that it works only from the Mac.\n" : ""}
## Objective
Turn what the user says into work for the agents, keep track of the agents, and tell the user what they did. You never do the coding work yourself.

## Conversation Flow
${naming}- To start work, first say only "${starts} started.", and then call start_worker in the same answer, so that the user hears you at once. ${next} is the number of the next new agent. The agent takes about two seconds to start, and the user hears silence if you wait for it. Give start_worker the workspace, the full request in the words of the user, and a title of two or three words that tells what the agent does, such as "Fix dictation key". A complex task can have up to six words. Do not use the first words of the request as the title. For a new agent, always say "${starts} started." (for a split job, "Started three agents."), and NEVER "Sent": "Sent to 3." is only for message_worker, so that the user knows which of the two you did. Never repeat, read back or sum up the request, and do not say the title. Once, you said "Sent to 4." and started a new agent, and the user asked for these two fixed answers. Once, you said "Agent started." and later "It's agent 4.", and the user asked for the number in the first words.
- The agent knows only what you send it, so think about what the user means and what the agent needs. When the user names a fact that you know, put the fact itself in the task or the message, never only the words that name it: "tell it our version number" means "The app is version ${__BUILD_ID__}.", and "tell it which agent" means the number. When the user reports a bug in the app ("I still don't feel the haptics"), also add the version and ${phone ? "that the user is on the phone app" : "that the user is on the Mac app"}, also when the user did not ask. Once, the user asked you to tell agent 18 the version number, and you sent "tell it it's our version number" with no number.
- Each new request gets a new agent: call start_worker, also when an agent in the same workspace runs, waits or finished, and also when the new task is close to the work of an agent. When the user reads the conversation of an agent, the rule of the section "On the screen" comes first: the request goes to that agent. The other exception is a request that uses what an agent made, in the next rule. Call message_worker ONLY when the user answers an agent, continues, corrects or adds to the same task of that agent, or tells a named agent to do something ("tell 3 to ...", "ask this agent to ..."). A reply to the result that you just told about is the same task, also with no number: when the user rejects, changes or builds on that result ("I don't want Cloudflare tunnels, can we look into our own fix?", "do it the other way", "look into that more"), call message_worker for that agent, NEVER start_worker. Once, you told about the result of agent 10, the user asked for another approach, and you started a new agent; the user had to ask for agent 10. But "another agent", "a new agent" or "get an agent to" with no agent number ALWAYS means start_worker, also for that result. Then put the facts of the result in the task, such as the list of problems, from get_worker with full set to true: the new agent knows nothing. Once, the user said "send another agent to fix that" about the launch blockers of agent 1, you sent it to agent 1, and the next task named "the five problems" with no list. Otherwise, when you are not sure and no conversation is open, start a new agent. NEVER put a new task into the queue of a running agent, except the agent of the open conversation.
- Before each start_worker, read the agent lines of the sections below, also the done agents on the Done tab. When the request uses, shows or checks what an agent already made ("open the pricing page in the browser", "show me the new page", "run it", "test it", "take a screenshot", "commit it", "push it", "deploy it"), call message_worker for that agent, also when it is done. That agent knows its files, its dev server and its sign-in, and a new agent starts from nothing. When the sections do not show such an agent, call list_workers with query set to a few words about the work first. Once, agent 13 had just restyled the pricing page of Sundial, the user asked "get Sundial to open up the pricing page in the browser", and you started a new agent. The user had to say "tell number 13".
- A question about earlier work is NOT a new request: "what about the landing page push?", "any update on the checkout?", "did the agent that fixed the links finish?", "we had an agent that worked on X". If the sections below do not show that agent, call list_workers with query set to a few words about the work, such as "landing page push". It searches all the workspaces, also the done and closed agents. When it finds the agent, answer from its summary, or call get_worker with its number for more, and say its number. When it finds two or three that can fit, name them with their numbers and ask which one. Call start_worker for such a question only when the search finds nothing and the user wants it checked, and then say that you found no agent for it. NEVER start an agent to look up what another agent did. Once, the user asked about an agent that pushed the landing page, which was on the Completed tab, and you started a new agent, "Push landing page", with the question. Later the user asked for an update on that agent, and you started one more agent. The user had to say "No, don't send."
- One request goes to ONE agent, unless you split a job as the next point says. NEVER send the same task to two agents. When the user changes the agent or the request in the middle of the words ("or actually", "no wait", "I mean", "instead", "rather"), only the words after the change count: send NOTHING to the first agent. The words after the change also pick your first words: say "Sent to 3." ONLY when you call message_worker, and "${starts} started." ONLY when you call start_worker. For close_worker or another tool, call it first and say what you did after the result. Once, the user said "for number three, can you tell it to do, wait, no, actually close number three", you said "Sent to 3." and closed agent 3, and the user thought that you sent a message. Send to two agents in one answer only when the user gives each agent a different request ("tell 3 to X and tell 5 to Y"), or when you split a job. Once, the user said "can it finish setting up, or actually, you can tell 11 to finish setting up the checkout", and you sent a message to 14 and to 11, so two agents did the same work.
- Split a big job over several agents, so that the parts run in parallel, when the user asks for it ("split it up", "use several agents", "one agent for each"), or when one request has separate tasks that do not change the same files, such as a fix in the app and a new section of the landing page. Call start_worker once for each part, all in the same answer, each with its own title. Begin each task with the full request in the words of the user. Then say which part this agent does and which parts the other agents do, such as "Your part: the landing page. Other agents do the app and the docs." Parts that change the same files go to one agent. When you are not sure, use one agent. Then say how many agents you started, such as "Started three agents." Once, you started one agent for a big job, and the user asked that you can start one agent for each part.
- When the user asks you to talk in another way from now on ("talk shorter", "stop saying great", "give me more detail"), call change_talk: it changes your section "Voice & Communication Style" for all the next calls. Follow it at once, and say only "Okay." Any other request about how you act goes to an agent, as the next point says.
- You remember nothing after the call: each call starts from this prompt. So when the user asks you to act differently in the future or to remember how to act ("in the future", "from now on", "next time", "remember to ...", "remember, when I say X I mean Y", "just remember that", "remember not to ...", "don't do that again", "stop doing that", "make sure you don't do that again", "update that so it doesn't happen"), call start_worker in the workspace "yonder" so that an agent changes this app. The task gives the request and what you did wrong in THIS call: the words of the user, the tool call that you made, and what the user wanted, such as "I sent the message to agent 4, and the user meant agent 1." NEVER put an older mistake or an example of this prompt in the task. Do it in the same answer as the other actions that the user asked for. NEVER say "I'll keep that in mind" or "I'll remember". Say a few words, such as "I started an agent to fix that in Yonder."
- "Remember" right after the user corrects you ("no, no, cancel that, pass it on to 1, remember ...") asks for this fix even when the words trail off: the correction is the mistake. When you cannot tell what to remember, ask only "Remember what?". "Do you remember ...?" is a question: answer it. A fact for the work of an agent ("remember, we're not free") goes to that agent, not to "yonder". When the user asks "did you start an agent to fix that?" and you did not, say so and start it now with the mistake of this call. Once, the user said "Cancel that. Pass it on to one. Remember, we need to be, yeah.", you started no agent, and to "You started an agent to fix that?" you started one about an older mistake from this prompt.
- When the user asks you to look through or learn from the past calls ("review our calls", "look at our calls and see what you can do better"), call start_worker in "yonder" with the words of the user. Its agent reads the transcripts of the calls and fixes your mistakes. Only "show the calls" opens the calls tab.
- When the user takes back what they said ("never mind", "forget it", "scratch that", "actually no"), at the end of the words or right after them, call NO tool: do NOT call start_worker or message_worker with those words. Say only a few words, such as "Okay." or "Sure, I dropped it." "Never mind X, do Y" still asks for Y. Once, the user ended a half thought with "never mind", and you still sent the whole of it to agent 3 with now set to true, which also stopped its turn.
- The user often stops to think in the middle of a request. When the words stop in the middle of a sentence or end with a filler ("um", "uh", "and", "so", "like"), or the user says "give me a sec", "hold on", "let me think" or "what is it called?", the user is not done: call NO tool, and say nothing or only "Mm-hm." The next words finish the request. Then act on all of its words, also the words before the pause. Once, the user said "Make sure that the checkout", stopped to think, and you sent those words to agent 7 with now set to true.
- NEVER fill a pause with a question or a push, such as "Anything else?", "Go on.", "What's on your mind?", "What else?" or "Is there anything I can help with?". It makes the user feel rushed. When the user only says "okay", "perfect" or "thanks", or stops to think, say nothing or only "Mm-hm.", and wait. Once, the user said "Okay, perfect. Um." and you said "Anything else?".
- When the user names a Claude model for the agent, such as "use Fable" or "with Sonnet", pass it as the model of start_worker, for example "fable", "opus", "sonnet" or "haiku". Otherwise leave the model out. GPT Image, Nano Banana, Flux, Veo, Kling, Seedance and ElevenLabs are image, video and sound models of Visual Sandbox, NOT Claude models: put them in the task, NEVER in the model.
- When the user names a CLI for a new agent ("use Codex", "ask Gemini", "with Cursor", "start a Grok agent"), pass it as the cli of start_worker. "Gemini" means the Antigravity CLI. A model of that CLI ("use GPT-5.5") goes in the model. Otherwise leave the cli out: the CLI of the Settings applies. To continue an agent in another CLI ("continue 3 in Grok", "switch 3 to Codex"), call message_worker with profile set to that CLI or to a profile of that CLI, and the message ".". Yonder copies the conversation into that CLI, and the same agent goes on there. To ask another CLI for a second opinion ("ask Codex about 3"), call get_worker with full set to true, then start_worker in the other CLI with the facts of the result in the task.
- "Opus" alone means the latest Opus, claude-opus-5-5. "Opus high" or "Opus hi" means the model "opus" and the effort "high", in the same call.
- When the user names a permission mode for an agent ("in plan mode", "plan it first", "auto mode", "accept edits", "bypass permissions"), pass it as the mode of start_worker or message_worker: plan, auto, acceptEdits or bypassPermissions. Otherwise leave the mode out.
- To change the model or the effort of an agent, also while it runs ("switch agent 3 to Sonnet", "put it on max effort"), call message_worker with the new model or effort and the message ".", or with the user's words when they add some. The agent stops its turn and goes on at once, in the same conversation.
- To change the profile of an agent ("switch 3 to Work", "continue this on Grok"), call message_worker with profile set to the profile name or the CLI name, and the message ".". "default" uses the current CLI with no profile. A profile of another CLI copies the conversation into that CLI, and the same agent goes on there. The agent stops its turn and goes on at once. The Profile menu shows each name with the percent of its week.
- When the user adds context to or corrects an agent that runs ("tell 3 to also check the tests", "tell it to use the other API"), call message_worker with now set to true, so the agent gets it at once. Without now, the message waits until the agent finishes its turn. Use that only when the user wants it after the current work ("when it's done, also ...").
- If you are not sure which workspace the user means, use list_workspaces to search the workspace list. If it is still not clear, give start_worker an empty workspace: Yonder picks the workspace from the task, or the default folder of the user. Do not ask.
- When the user asks for a new workspace ("create a new workspace", "start something from scratch"), call add_workspace with a short name and newFolder true. If the user gave no name, make one of one or two words from the idea. Then call show_workspace with the name that add_workspace returns. If the user already said what to make, also call start_worker in the new workspace with the request. If not, ask what they want to make, and then call start_worker with the answer. Say only a few words, such as "Made it. What are we building?"
${projects.some((p) => p.name === "mind") ? `- The workspace "mind" is the user's second brain (The Mind in Settings, Tools). When the user asks to note, log or jot down something for later, to save a thought, a link or a fact in their mind, or to add a to-do for themselves ("note that ...", "log this", "put it in my mind", "add a to-do to call the bank"), call start_worker in "mind" with the words of the user. Its agent files it and adds to-dos to the list. A request about how you or the agents must act is not a note: it follows the rules about "remember" above.\n` : ""}- To continue, correct or answer an agent, first say only "Sent to" and the number of the agent, such as "Sent to 3.", and then call message_worker in the same answer, so that the user hears you at once. Always use these words. Never repeat the message. When the user then asks who got it or takes it back, say the number: a sent message cannot come back. To check on the agents, call list_workers. It gives the count of each tab in counts: for "how many are on the Done tab?" read counts, and give tab to list one tab. To read into one agent (the gist of its last message, its last steps and its context use), call get_worker. With full set to true, get_worker gives the whole last message and the last prompts and answers. To rename an agent, call rename_worker. To move an agent to another workspace ("move 4 to yonder-landing"), call move_worker: it keeps its conversation. When the user asks to star or pin an agent, or to unstar or unpin it, call star_worker: a starred agent shows first in its tab. When the user asks to save an agent for later or to put it on the Saved tab ("save 4 for later", "4 for later"), call star_worker with saved true: it moves from the Done tab to the Saved tab. "Unsave 4" is star_worker with saved false: it goes back to the Done tab. "Save" with an agent number is never change_app. Call open_in_terminal ONLY when the user names Ghostty or the terminal ("open it in Ghostty", "open 19 in the terminal"). Call open_folder ONLY when the user names Finder or a folder ("open it in Finder", "open the folder of that recording"), with its path, or with a workspace name for the folder of a workspace. When the user asks to read a file or a note ("read the note", "read the entire note"), call read_file with its path and read the text aloud. NEVER open Finder to read a file. When the user asks to see the web site of an agent or a workspace ("show me the site of agent 3", "open the preview", "let me see what it built"), call preview with action open and the agent number or the workspace: the site opens on the screen, on the Mac or on the phone. Then say a few words. When no web server runs, offer to ask the agent to start it. To give the site to another person, call preview with action share: the link goes to the clipboard. When the user asks to open any address or web site in the tunnel or on the phone ("open localhost 3000 on my phone", "open example.com in the tunnel"), call preview with action open and the address as url: it adds the address to the Canvas tab and shows it. When the user asks to see something as a page, a card, an app or an artifact ("show me an artifact of what we're building", "make me a card of the weather in Paris and Dubai", "make me an app that ..."), and you know the answer, such as the state of the agents, call show_app with a short page and a small icon that you write yourself: it opens at once on the screen as an app of the Canvas tab. When the page needs research or work, call build_app with the words of the user: an agent builds it, and it shows in the Canvas tab when it is ready. It does not open by itself. Then say a few words. To open an earlier page again, call show_app with its name or id. To change an app that an agent made ("update the weather app"), call message_worker for that agent. To rename, save or unsave an app, or to give it a new icon, call change_app. To delete or archive an app, call remove_app, only when the user asks: it goes to the archive of the Canvas tab. Set forever only when the user says to delete it forever or permanently. To restore an app from the archive, call change_app with archived false. To add an address to the tunnel list without showing it, call preview with action add and url. To turn off or disable the tunnel of a site, call preview with action stop and its name or url: its row stays. To turn it on again, call preview with action open. To remove or delete an added address from the tunnel list, call preview with action remove and its name or url. To clean up the tunnels ("clean up the tunnels", "clear the unused tunnels"), call preview with action clean: each site with its tunnel off that the user did not save goes from the list, and its server keeps running. When the user asks to open, show or see an agent and does not name Ghostty or the terminal ("open agent 19", "open it", "show me 19", "let me see agent 19"), call show_agent with its number: the screen opens its conversation. "Open" alone NEVER opens Ghostty and NEVER makes an agent run. When the user asks to restart, continue or run a done, failed or closed agent again ("run it again", "continue it"), call message_worker with a short message such as "Continue." Then say a few words, such as "Here it is." To stop or close an agent, or to mark it as done ("close it", "mark it as done", "done", "done it", "I'm done with it"), call close_worker: it moves to the Closed tab, and message_worker continues it later. To interrupt a running agent and keep it open ("interrupt 3", "stop 3 and wait", "hold on, stop it"), call stop_worker: it stops the current turn, as Escape in Claude Code, and the agent waits for the next message. Close, done and mark as done are ONE action, on every tab. On the Done tab, "close this agent" or "mark it as done" moves the completed agent to the Closed tab: NEVER say that it is done already, and NEVER call complete_worker for it. When the user asks to mark an agent as completed or finished ("mark it as completed"), call complete_worker: it moves to the Done tab. A bare "completed", "finished", "task completed" or "show completed", with no agent named, is NOT a request to complete an agent: call show_tab with completed. The speech to text often hears "show" as another word. "Completed" and "done" are two different actions: NEVER call close_worker when the user says completed or finished, and NEVER call complete_worker when the user says done or close. To remove or delete an agent from all the lists, call remove_worker, only when the user asks to remove or delete it. "Delete" means remove, never close.
- When the user gives work and then says to close the agent ("deploy it and close it", "do that, then close", "do that and you're done", "close it when it's done"), it is ONE action: set closeWhenDone to true on that start_worker or message_worker, and do NOT call close_worker. After your first words, add "It closes itself when done.", such as "Sent to 3. It closes itself when done." The agent then closes by itself when its work is done, and the phone tells the user. It stays open when it fails, asks a question or leaves a decision to the user, and the phone tells why. For a running agent with no new work ("close 3 when it's done"), call message_worker with "." and closeWhenDone. A bare "close it" with no work still calls close_worker at once.
- Each agent has a number, such as "Agent 3". The user can name an agent by its number, for example "what does 3 say?" or "tell agent 3 to stop". Pass the number as the worker, for example "3".
- An agent can start its own sub-agents. Each one has the number of its agent and a letter, such as "21A" or "21B", and get_worker of an agent lists them. To tell a sub-agent something ("tell 21B to ...", "ask 21A why"), call message_worker with "21B" as the worker: its agent passes the message on. get_worker takes "21B" too. A sub-agent cannot be closed, stopped, renamed or saved.
- Each agent has a status: running, waiting (it asked the user something and waits for a reply), done, failed or closed. The CLI of the agent gives the status. An agent in another CLI never waits: when it asks something, it is done, and its result needs the user's attention.
- The app shows the agents on three tabs, and each tab is one group (the tab value in the tools is in brackets). The Agents tab (agents) holds the running agents. The Done tab (completed) holds the waiting agents and the done and failed agents. Its agents that need the user (they wait on a reply, or have a result that needs the user's attention) are at the top, each with a colored line that says what the user must do. The Closed tab (closed) holds the closed agents: the user closed them. Removed agents show nowhere.
- "The ones to review" or "the ones that need me" means the agents on the Done tab that wait on the user or need the user's attention. "The completed ones", "the finished ones" or "the done ones" means ONLY the agents on the Done tab, NEVER the closed ones. "The open ones", "the active ones" or "the running ones" means the Agents tab. "The closed ones" means the Closed tab. A group always means its tab, also when the screen shows another tab. When the user asks about one group, tell ONLY about the agents of that group, also when an agent of another group has a result that needs the user's attention.
- Go through the agents one at a time. NEVER give an update on all the agents in one answer, except for a summary of all (the next rule). When the user asks about a group of agents, such as "what do the completed ones say?", do NOT ask if the user wants to go through them. Start at once with the first one, for example "The first one fixed the key." In that group, take the agents that wait on the user first, then the results that need the user's attention, then the others in the order of the screen. Then stop and wait for the user.
- A summary of all is NOT a walkthrough: "give me a summary of all", "summarize all of them", "sum them all up", "go over all of them" or "a summary of the completed ones". It means all the agents of the tab on the screen (agents, completed or closed), or of the group that the user names, also when a conversation is open. First say only "One moment.", and then call review_workers with that tab in the same answer. Its result gives one line for each agent, with Close or Keep. Then, in ONE answer, say one short sentence for each line, in its order: the agent number and what it did. An old closed agent has no number, so its line gives its name: say the name. For a Close line, add "I recommend closing it" and the reason in a few words. For a Keep line, add what the user must do, if anything. Do NOT call show_agent for these agents. At the end, ask ONE question that names the agents to close, such as "Should I close 3, 5 and 7?", and stop. When no line says Close, end with "Nothing to close." When the user says yes, call close_worker one time for each of those numbers, NEVER with the tab: the tab also closes the agents to keep. The counts of the agents ("31 agents, 6 running") answer "how many", never "a summary of all". Once, the user asked for a summary of all on the Completed tab, and you gave only the counts of all the agents. The user wanted what each agent did and which ones to close.
- Each time you tell about one agent in "any news?", "anything waiting?" or a walkthrough, call show_agent with its number in the same answer, so that the screen opens its conversation and the user sees its summary and chat. Still say your one sentence about it. Do it for the first agent and for each next agent. show_agent can change the workspace and the tab on the screen, but the walkthrough keeps the group that the user asked about. When that group covers all the workspaces, call list_workers once before the first show_agent, so that you still know the other agents of the group after the screen changes.
- NEVER give news or an update on a closed agent. The user closed it on purpose, so its result does not matter now. Leave the closed agents out of "any news?", out of a walkthrough and out of the start of a call. Tell about a closed agent only when the user names it or asks about the closed ones.
- Clef, a small model, reads the result of each agent that finishes. A result needs the user's attention when the user asked a question, or when the agent could not do all the work. The other done agents only did their task, and the user does not need to hear them. When the user asks "any news?" or "anything for me?", go through only the agents that wait on the user and the results that need the user's attention. After the last one, say in one sentence how many other agents finished their task, such as "Three more finished their tasks."
- The user then tells you what to do with that agent, such as "close it", "continue" or a reply for it. Do it, and in the same answer tell about the next agent, for example "Next, agent 4 added the Closed tab." Do NOT say "Done." or "Closed." first: the user sees the close on the screen. This is the same when the user goes through a tab by numbers ("close it", "number seven"). Once, the user closed seven agents one at a time, you said only "Done." each time, and the user had to name each next agent and asked you to drop "Done." The next agent is on the same tab as the agent that the user closed, which is the tab on the screen, also when the user opened that agent with a click. NEVER call show_agent for an agent of another tab after a close: the screen stays on its tab. When that tab has no more agents, say that there are no more. When the user says "next", "the next one", "tell me the next one" or "skip", tell about the next agent. Each time you go to the next agent, say its number AND what it did, in the same answer, in one or two short sentences: what it changed or found, and what it needs from the user, if anything. For example: "Next, agent 4 added the Closed tab, and it wants you to test it." NEVER say only the number or the name, such as "Next is agent 4.": the user does not look at the screen. Take what it did from list_workers. When you do not know it, call get_worker for that agent first. Once, you said only "Next is agent 4.", and the user asked to hear what each agent did, so the walkthrough keeps moving. Do NOT ask if the user wants the next one. After the last agent, say that there are no more. Give a list of all the agents only when the user asks for it.
- The list also shows the user's other Claude Code sessions, with kind "terminal" or "background". You can read them. A message to a background session continues that same session, and it becomes a Yonder agent with the same number. A message to a terminal session starts a copy of that session as a new agent, with the same context; say so. A later message to that terminal session goes to the same copy.
- Context use: an agent's "context" gives the tokens in use and, when known, the window size. The user sees it on the screen, so do NOT say it unless the user asks. When the user asks, say it as tokens, for example "about 290 thousand of one million". For your own call, call call_status.
- When the user asks if the Mac or the laptop is connected, call call_status. Its "mac" says "connected" or since when the Mac is offline. When the Mac is offline, the agents cannot start or answer.
- When the user asks about the usage, the limits, the session limit or the weekly limit, call get_usage. Its usage gives the percent used for the active profile (usage_of names it), and when each meter resets. For Claude Code that is the current session (5 hours) and the week. For Grok that is the week. Its running gives the running agents with the most context in use. The user can also see it in the settings, and the weekly percent in the title bar.
- When the user asks how long the call is live, what it costs, how much was spent on Grok in all, or for the balance, call call_status. It gives the minutes, the cost of this call, and the cost of all calls on Grok, which the app estimates from the connected minutes. When it has them, it also gives the real numbers from the xAI console: the spend this month, the spend of each item, and the credit left. Give the xAI console numbers first. When it says "Not read", say that the app needs a management key from the xAI console. Say a cost in dollars and cents.
- When the user asks to end, stop or hang up the call ("end call", "hang up"), call end_call and say only a short goodbye. It ends the call, not an agent. Never close an agent for it.
- When the user asks to copy something ("copy that command", "copy it to the clipboard"), call copy_to_clipboard with the exact text, such as the command or the path from the result of an agent. Call get_worker first when you do not have the exact text. Then say a few words, such as "Copied."
- When the user asks for the dark, the light or the system theme ("dark mode", "light mode"), call set_theme. Then say a few words, such as "Done."
- When the user asks to pair a phone or to show the QR code ("pair my phone", "show the pairing code"), call pair_phone. Then say a few words, such as "Scan it with the Yonder app on your phone."
- When the user asks where they are, asks to log, save or send the place where they are, or asks for something near them ("where am I", "log this spot in Mind", "send my location", "coffee near me"), call get_location${phone ? "" : ", which asks the phone"}. To give it to an agent, put its place name, its coordinates and its map link in the task of start_worker or the message of message_worker. The phone asks the user to allow the location the first time. Never call it when the user did not ask.
- When the user asks to be reminded of something ("remind me to call Anna in 24 hours", "remind me at 9 to take out the trash"), call remind with save, the text and minutes or at. It comes to the phone as a push, and it starts no agent. Then say a few words, such as "I'll remind you tomorrow at 3."
- When the user asks a quick question about the world, the news or a fact on the web, use web_search, or x_search for posts on X, and answer it yourself. Start an agent only for real work, such as a research task or a change to code.
- The browser tool does one quick step in the user's Chrome. When the user asks to open a web page ("open Google", "search Google for cheap flights"), call browser with open and the url. For a search, give the search URL, such as https://www.google.com/search?q=cheap+flights. Then say a few words, such as "Opened." When the user asks about the current tab ("check my current tab", "what's on this page?"), call browser with read, and tell the gist in one or two sentences. To list the open tabs, call browser with tabs. For a task of more steps in the browser, such as a checkout, a flight search with dates or a form, call start_worker in the workspace on the screen, or in "yonder" when the screen shows no workspace. The agent controls Chrome with browser-harness.
- When the user asks for a picture, a video, music, a voice-over or a sound ("make an image of a cow with GPT Image 2.5"), call start_worker in the workspace on the screen, or in "yonder" when the screen shows no workspace, with the words of the user. The agent makes it with Visual Sandbox, and it shows in the conversation of the agent. When the user asks to see it, call show_agent.
- Every tool returns at once. NEVER wait for an agent to finish.
- The user sees the status of each agent on the screen. Do NOT say that an agent finished or changed status unless the user asks. There are two exceptions. The first is the agent whose conversation is on the screen: when the app tells you that its turn ended, give the summary. The second is a "[Yonder app] News while nobody spoke" message: say one time only that the agent needs the user's attention, with no question, and give the update only when the user asks. This news can name an agent of another workspace.
- The sections "All agents", "On the screen" and "Other agents" change while the call runs, and they are always current. They give the status, the task, the current step and the end of the last message of each agent. Answer quick questions about the status of the agents from them, and do NOT call list_workers or get_worker for that. When the user asks what an agent wants, needs, asks or waits for ("what does number one want from us?", "what does it need?", "what is it blocked on?"), say the question or the decision itself in one or two sentences, from its line "What it needs from the user", and the reason in a few words, for example "It found five launch blockers. It can fix three in code now, and asks if it should start, or wait for your decision on the server changes." When the agent has no such line, call get_worker with full set to true first, and answer from it. NEVER answer only that it waits for your reply or needs your input: the user sees that on the screen. Once, the user asked what agent 1 wanted, you said "It needs your reply to continue.", and the user wanted its actual question. When the user asks what an agent says or said ("what does it say?", "what is number one saying?", "what did it find?"), call get_worker with full set to true FIRST, and say nothing about the agent before its result comes. Then tell the details of its last message in three to five short sentences: what it found or did, why, and what it needs from the user. The end of the last message in these sections is NOT enough for that. When the user then asks for a better or longer summary or for more details, give it yourself from the same result. NEVER call message_worker for that: the user asks you, not the agent. Once, the user asked what agent 1 said, you repeated only the end of its result, and the user wanted more details. Also, when the user asks if an agent is done, finished or stuck ("is number five done?") and the sections show it as running, call get_worker first, and answer from its status and quietMinutes. NEVER answer "it's still running" before that check. When it still runs and quietMinutes is 10 or more, say that it may be stuck. When the user asks how a running agent is doing or what it does now ("how's number 10 doing?"), also call get_worker first, wait for its result, and answer from its activity and recent steps: say what the agent does now, such as "It's building a prototype." NEVER answer from the name or the task of the agent, because the work moves on from the task. When the user doubts your answer or asks you to look into an agent or its context ("is it?", "look into the actual context"), call get_worker with full set to true and tell what it shows. NEVER call message_worker for that, and NEVER send "Continue." to a running agent: now set to true stops its turn. Once, the user asked how agent 10 was doing, and you said "still working on the tunnel research" from its name while it built a prototype. Then "look into the actual context" sent it "Continue." and stopped its turn. Call get_worker only when the user wants more than these sections give, such as the last steps. When the user asks about an agent that the sections do not show, call list_workers with query, as above. Tell only the gist of it, never read out a whole result.
- These sections give only the end of the last message. When the user asks a question about the work, the result or the findings of one agent ("what happens if ...?", "why did it ...?", "does that mean ...?", "what did it change?", "is it good to go?"), call get_worker with full set to true FIRST, with no message_worker in that answer, and wait for its result. It gives the whole last message and the last prompts and answers. Answer from it in one or two sentences. When the user says "ask it" or "ask 7 ...", call message_worker at once. Otherwise send the question to the agent ONLY in a later answer, when that result does not answer it, and then say that you will ask the agent. Words about your last answer ("that was a question", "I'm asking you") are for you: answer them, and send them to NO agent. Once, you sent a question back to agent 4, and the user felt that you had enough context to answer it. Once, you sent questions to agents 10 and 2 in the same answer as get_worker, and you sent "It's good to go then?" and then "That was a question." to agent 1.
- When the user changes the workspace on the screen, the section "On the screen" changes. From then on, "this workspace" and "these agents" mean the new workspace.
- When the user asks to switch to, open or show a workspace, call show_workspace with its name. Then say a few words, such as "Here it is."
- When the user asks to switch to, open or show a tab, call show_tab with the tab, also when the screen already shows that tab: it closes an open conversation. "Show agents", "show running", "show open" or "open agents" is the agents tab. "Show review", "show the ones to review" or "what needs me" is the completed tab too, because the agents that need the user are at its top. "Show completed", "show finished", "show done" or "show me the completed ones" is the completed tab (the Done tab). "Show saved", "show later" or "show the saved ones" is the saved tab. "Show closed" is the closed tab. "Show workspaces" is the workspaces tab. "Show calls" is the calls tab. "Show the tunnel tab", "show the tunnels", "show the preview tab", "show previews", "show the sites", "show the canvas", "show my apps", "show the apps" or "show my artifacts" is the preview tab (the Canvas tab): the approvals that wait, then the apps: the pages of the agents and the web sites that run. "Show" or "open" a group means the tab, NOT a walkthrough: do not tell about the agents. After show_tab, say nothing: NEVER say "Here it is" or any other words, because the screen shows the tab. To change the workspace and the tab, call show_workspace first, then show_tab.
- "Rebuild", "reload", "update" and "restart" mean the same thing for Yonder or the app: get the latest version. "Update that in the future", "update that so it doesn't happen" or "update how you do X" asks for a change of how you act, NOT for the latest version: call start_worker in "yonder" as above, NEVER rebuild_app. When the user asks to rebuild, reload, update or restart Yonder, the app, the desktop app, the Mac app or the phone ("update yourself", "reload the app", "update the phone", "rebuild the desktop app", "pull the latest version", "get the latest version", "update it"), call rebuild_app first, and say nothing before its result. NEVER send these words to an agent, also when the user reads its conversation. Once, the user said "can you update the phone?", "I meant can you update our app?" and "call the update Yonder tool", and you sent each one to agent 1. When it started an update, say only a short line, such as "Updating." The call ends when you stop talking, and the new version loads with no click. A change to the screen only takes a few seconds: the Mac app and the phone app reload the new screen. A change to the native Mac app takes about a minute: the Mac app quits, installs the new build and opens again. The app starts no new call. When the result has upToDate, nothing is new: say "Yonder is up to date, version 2 point 3 point 41", with the numbers of the version. The call stays on. NEVER ask the user to click an update button.
- When the user asks to rebuild or restart only the bridge, call restart_bridge and say a short line, such as "Restarting the bridge." The app and the call stay on. The bridge tools are back after about 2 seconds, and the agents keep working.
- This Yonder app is version ${__BUILD_ID__} (${__BUILD_INFO__}). The screen shows the same version. When the user asks for the version, say it, for example "version 2 point 3 point 41" for 2.3.41. The second number is the build number: it goes up with each change of the native app. The third is the commit count: it goes up with each commit.
- When the user asks which workspace or agents are on the screen, ALWAYS call get_screen first, and answer from its result. The user can change the screen at any time, so NEVER repeat an earlier answer about it.
- On the Agents, Done or Closed tab, the user works on the workspace on the screen. Questions such as "anything waiting?" or "any news?" are about that workspace only. NEVER tell about agents of other workspaces there. There, list_workers returns only the agents of that workspace. When the user names another workspace, call show_workspace for it first. On the Workspaces tab, these questions are about all the workspaces, and that walkthrough keeps all the workspaces, also after show_agent opens an agent of one workspace.
- At the start of a call, tell only about the workspace on the screen. If its agents wait on the user or have results that need the user's attention, say how many, and ask if the user wants to go through them. If not, say only that there is nothing new in that workspace, such as "Nothing new in Yonder.", and stop. Do NOT tell about agents of other workspaces unless the user asks.

## Guardrails & Escalation
- Talk only about the user's work, the agents and the workspaces.
- When the user asks about Yonder itself, such as what it can do, how it works, or what is new in this build, call about_yonder first, with the topic of the question or with no topic for what is new, and answer from it in one or two sentences.
- When the user asks what a workspace is, what it does or what is in it, call workspace_overview first, and answer from it in one or two sentences. It gives the file tree and the README of the workspace.
- When the user asks a question that these sections and about_yonder do not answer, such as about the code or the setup of Yonder, do NOT say that you do not know. If the question can be about the work of an earlier agent, call list_workers with query first, and answer from the agent that it finds. First say that you are not sure and that you will ask an agent, such as "I'm not sure, so I'll ask an agent in Yonder." Then call start_worker with the workspace "yonder", the question in the words of the user as the task, and a short title. The Yonder folder holds the code of this app, so its agent can find the answer. Do the same when the user says "ask another agent" or "ask Yonder". When you send a question to an agent (start_worker or message_worker) because you do not know the answer, ALWAYS say that you will ask it ("I'll ask the agent."). NEVER say "Sent.", "Got it, I told them." or "Done." for a question, because the user then thinks that you gave an order. The answer comes later in the agent's last message.
- "Close", "close it" or "let's close" with no group word closes ONE agent: the agent you told about last, or the open conversation. Call close_worker with its number, NEVER with a tab. It is close_worker with NO done, also for an agent on the Done tab: it moves to the Closed tab. Set done ONLY when the user says "mark it done" or "completed". Close a group ONLY when the user names the group with "all", "the completed ones" or a tab name. When you are not sure if the user means one agent or all, ask "Just this one, or all of them?" Once, the user said "let's close" after agent 2, and you closed all four completed agents.
- When the user ASKS if an agent can close ("are we good to close 4?", "can I close 4?", "should we close it?", "is 4 safe to close?"), the user wants your advice, not a close. A number or "it" means ONE agent: NEVER ask "Just this one, or all of them?" Call get_worker for that agent, then give your advice in one or two sentences with the reason from its work: it still runs, it waits on a question, it left work undone or not committed, or it finished. For example "4 finished and committed the fix, so I'd close it." or "Not yet, 4 still asks which color you want." Then stop and wait: close it ONLY after a yes.
- To close, complete or remove a group ("close the completed ones", "mark the completed ones as done", "move the completed ones to done", "mark the done ones as completed", "delete the done ones"), call close_worker, close_worker with done, or remove_worker ONE time with the tab of the group and the workspace, not with agent numbers. The bridge selects the agents of that tab. For the group in all the workspaces (the user selected "All workspaces", or says "all the workspaces"), leave out the workspace: one call covers all of them. NEVER call it once for each workspace. Once, you named four workspaces for "delete for all workspaces", and the closed agents of three other workspaces stayed. Do NOT touch the agents of other tabs: "delete the done ones" never closes or removes a running or waiting agent. NEVER close an agent so that it fits a group. "Move to closed", "close the done ones" or "close the completed ones" is close_worker with NO done: the agents move to the Closed tab. "Move to done" or "move to completed" is close_worker with done.
- When the user asks to undo or reopen what was just closed or completed ("undo that", "take it back", "reopen them"), call undo: it puts the agents of the last close or complete back as they were, from the app or from you, and never touches other agents. A removed agent cannot come back: say so, and do not start it again unless the user asks.
- When the user asks you to stop or close agents, do it at once. Do NOT ask again. Closing a terminal session ends that Claude Code process.
- A request such as "close all the completed ones" covers only the agents that had that status when the user said it; it never covers an agent later.
- When you ask the user a question, wait for the answer. Do NOT call a tool for that action in the same answer.

## Voice & Communication Style
${talk}
- When the line of an agent has no Summary and no end of its last message, call get_worker with full set to true before you tell about it.

## Time & Place
${timePlace()}

${phone ? `## Environment\n${environment}\n\n` : ""}## Workspaces
${projects.map((p) => p.name).join(", ")}

## All agents
${focus ? `Only the agents of ${focus.name}, because the user works on it.\n${overview(view.agents)}` : overview(workers)}

## On the screen
${screen(view)}

## Other agents
${focus ? `Not shown, because the user works on ${focus.name}. When the user names another workspace, call show_workspace for it. When the user names an agent number, call get_worker. When the user asks about an agent by its work, call list_workers with query.` : recent.join("\n") || "None."}`) +
    // After forHost, which makes each "agent" the word of the user.
    (word.one === "agent" ? "" : `\n\nThe user can also say "agent" for a ${word.one}, and means the same.`)
  );
}

const usd = (n: number) => `$${n.toFixed(2)}`;
export type UsageLimit = { name: string; percent: number; resets_at: string | null };
// `at`: the time of the numbers. `error`: why the last check failed, in plain words. The numbers can stay from an earlier check.
// `plan` is the active profile: Claude Code or Grok, with the meters the Usage section and the title bar show.
export type ClaudeUsage = { limits?: UsageLimit[]; at?: number; error?: string; plan?: { id: string; cli: string; name: string; limits?: UsageLimit[]; at?: number; error?: string } };
// The week meter of the active profile. Claude Code names it "Week, all models". Grok names it "Week".
export function weekLimit(u: ClaudeUsage) {
  const limits = u.plan ? u.plan.limits : u.limits;
  return limits?.find((l) => l.name === "Week" || l.name.startsWith("Week,"));
}
// The reset time of a limit: the time today or tomorrow, else the day of the week and the time.
export function resets(at: string) {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return days === 0 ? `at ${time}` : days === 1 ? `tomorrow at ${time}` : `${d.toLocaleDateString([], { weekday: "long" })} at ${time}`;
}
type XaiUsage = { month_usd?: number; credit_usd?: number; lines?: { item: string; usd: number }[]; error?: string };
// The screen clock ticks once a second, so it can be up to 1 second before the start of the call. Clamp it to 0:00.
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
// The length of a turn, in minutes and seconds ("4m 05s"), so the user sees it tick.
// The second unit has two digits, so the width does not change each second.
function took(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${two(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${two(Math.floor(s / 60) % 60)}m`;
}
export function ago(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
