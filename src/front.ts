// Over-the-air updates of the front end. The bridge serves the newest build of dist/ (/front), so that a change to
// the screen needs no rebuild of the Mac app or the phone app. The native shells stay the same.
// The Mac app loads the page from the bridge. The phone keeps the newest bundle in localStorage, and runs it in
// place of the bundle of its install.
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import UPDATES from "../channel.json";
import { android, BRIDGE, bridgeFetch, bridgeReady, phone, shell } from "./bridge";
import { hold, loadPairing, loadPairings, still, type Pairing } from "./link";
import { syncPhoneConfig } from "./phone-config";
import { swap } from "./names";
import { count, fits as fitsFor, pick, type Needs } from "./screen";

declare const __BUILD_ID__: string;
// `code`: a hash of the JS with no build ID (vite.config.ts). An older bundle has none.
type Bundle = { build: string; needs?: Needs; code?: string; js: string; css: string };

export { count };
// The system of the computer of the bridge, from /front: "linux" on Omarchy (docs/omarchy.md), "win32" on Windows.
// They have no Mac and no Finder, so the words for Grok name "the computer" there.
export let platform = "";
// The channel of the environment in use (/front of its bridge): dev, staging or production. A bridge from before has none.
export let channel = "";
// False when the computer of the bridge has no Ghostty: the terminal button then shows a terminal icon.
export let ghostty = true;
// The words for Grok also use the word of the user for an agent, such as "bot" (`swap` in src/names.ts).
export const forHost = (text: string) =>
  swap(platform && platform !== "darwin" ? text.replace(/\bMac\b/g, "computer").replace(/\bFinder\b/g, "the file manager") : text);
const OWN = count(__BUILD_ID__);
// The Mac app in production, from its own bundle or from the bridge. Not the dev server.
const mac = !phone && (location.protocol === "tauri:" || location.origin === BRIDGE);
const ios = phone && !android;
const saved = (): Bundle | undefined => JSON.parse(localStorage.getItem("front") ?? "null") ?? undefined;
// The bundle that this page runs, when it came from the bridge, as text for `good`. Else null: the screen of the install.
let mine: string | null = phone ? localStorage.getItem("front") : null;
const self: Bundle | undefined = mine ? JSON.parse(mine) : undefined;
if (self?.build !== __BUILD_ID__) mine = null;
// The build that runs in this page, the hash of its JS (`code`) and its CSS. A new build with the same code has only
// new CSS: `restyle` puts it in with no new load, also during a call, and the page then runs that build.
export const running = { build: __BUILD_ID__, code: (mine && self?.code) || "", css: (mine && self?.css) || "" };
let sheet: HTMLStyleElement | undefined; // The CSS that `restyle` put in.
function restyle(css: string) {
  sheet ??= [...document.querySelectorAll("style")].find((s) => running.css && s.textContent === running.css);
  if (!sheet) {
    // The screen of the install, and the Mac, have the CSS of the build in a link.
    document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove());
    sheet = document.head.appendChild(document.createElement("style"));
  }
  sheet.textContent = css;
  running.css = css;
}

// The last screen that showed the app, kept in IndexedDB, because localStorage has no room for a second bundle of
// 1.7 MB. `good(text)` keeps one, and `good()` gives it.
const good = (put?: string) =>
  new Promise<string | undefined>((resolve) => {
    const open = indexedDB.open("yonder-front", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => resolve(undefined);
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", put ? "readwrite" : "readonly");
      const req = put ? tx.objectStore("kv").put(put, "good") : tx.objectStore("kv").get("good");
      tx.oncomplete = () => resolve(put ? undefined : (req.result as string | undefined));
      tx.onerror = () => resolve(undefined);
    };
  });
// A new screen from the bridge that fails before it shows the app goes back to the last good screen at once, not to the
// old screen of the install. Only a screen on trial does it (`frontTry`, from the start code of the install). Else, or
// with no good screen, `heal` loads the page again, and the start marks the screen bad and runs the screen of the
// install. True when the page loads again. This is the safe way back.
let rolling = false;
export async function rollback() {
  if (!phone || rolling || localStorage.getItem("frontTry") !== __BUILD_ID__) return false;
  rolling = true;
  const back = await good();
  if (!back || (JSON.parse(back) as Bundle).build === __BUILD_ID__) return (rolling = false);
  note(`rollback to ${(JSON.parse(back) as Bundle).build}`);
  localStorage.setItem("frontBad", __BUILD_ID__);
  localStorage.setItem("front", back);
  localStorage.removeItem("frontTry");
  location.reload();
  return true;
}
// A screen on trial that throws and shows nothing goes back at once. `heal` of the screen of the install comes later.
if (phone && localStorage.getItem("frontTry") === __BUILD_ID__)
  addEventListener("error", () => setTimeout(() => document.getElementById("root")?.childElementCount || void rollback(), 500));

// The native cover of the iPhone (version 5 of the native chrome, src/chrome.ts): a picture of the screen over the web
// view while the page loads again, so a new screen comes in with no flash. The new page takes it away when its native
// controls show (src/chrome.ts), else after 1.5 seconds, and the native side after 4 seconds. An older app has none.
export const parts = { cover: false };
export const cover = (on: boolean) => invoke<boolean>("native_cover", { on }).catch(() => false);
// The time of the last touch, click, key or scroll, so a new screen loads in front only when the user does nothing.
// The Mac does not count a scroll event: a running agent scrolls its chat to the end at each new step, so that event
// would hold each new screen while the user watches an agent. The wheel of a mouse or a trackpad, also its momentum,
// still counts. The phone keeps it, for the momentum of a swipe after the touch ends.
let input = Date.now();
for (const e of ["pointerdown", "keydown", "wheel", "touchstart", ...(phone ? ["scroll"] : [])]) addEventListener(e, () => (input = Date.now()), { capture: true, passive: true });
// Text fields that the user types in. A new load of the page loses their text.
const TEXT = new Set(["text", "search", "url", "email", "tel", "number", "password"]);
// The fields of this load that the user typed in.
const touched = new WeakSet<EventTarget>();
addEventListener("input", (e) => e.target && touched.add(e.target), { capture: true, passive: true });
// A field of a page of the Settings (.page) shows a saved value, so it counts only after the user typed in it. Else the
// saved values there, such as the theme and the word for agents, hold each update of the Mac while the Settings are
// open, and the user sees old Settings.
export const typed = () =>
  [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input")].some(
    (el) => (el.tagName === "TEXTAREA" || TEXT.has(el.type)) && !!el.value.trim() && (!el.closest(".page") || touched.has(el)),
  );
// True when a new load of the page shows the same screen. The app opens the same tab and agent again (`resume` in
// App.tsx), but not the text of a box, a dialog, a menu, the settings, the talk view or the place of a list. A
// conversation keeps its place only at its end, where it opens.
function settled() {
  if (hold.talk || document.documentElement.hasAttribute("data-swiping")) return false;
  if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], .page')) return false;
  if (typed()) return false;
  for (const el of document.querySelectorAll("*"))
    if (el.scrollTop > 1 && !(el.matches(".convo") && el.scrollHeight - el.scrollTop - el.clientHeight < 40)) return false;
  return true;
}
const fits = (needs: Needs | undefined, app: string) => fitsFor(needs, app, android);
// The version of the phone app or the Mac app, the same as the build of the screen of its install. A debug app ("0.1.0")
// and a browser give none.
let appVersion: Promise<string | undefined> | undefined;
export const installed = () => (appVersion ??= getVersion().then((v) => (count(v) >= 1_000_000 ? v : undefined), () => undefined));
// The user accepted the waiting update. The accept holds for 5 minutes, as the "Updating…" label of App.tsx, so that a
// later build after a failed or empty update does not load with no tap. `kick` runs the check of useFront at once.
let acceptedAt = 0;
let kick: (() => void) | undefined;
export function accept() {
  acceptedAt = Date.now();
  kick?.();
}
const accepted = () => Date.now() - acceptedAt < 300_000;

// The page of the bridge has its own localStorage, so the Mac app takes the theme, the zoom and the cost with it.
const toBridge = () =>
  location.replace(`${BRIDGE}/${location.protocol === "tauri:" ? `#storage=${encodeURIComponent(JSON.stringify({ ...localStorage }))}` : ""}`);

// The record of each start of the phone app: the build, each step with its time, the errors, and what the screen
// shows after 8 seconds. It stays in localStorage ("boot"), and the next start sends it to call.log of the bridge
// (useFront). The bundle of the bridge runs in the page of the bundle of the install, so both add to one record.
// The record finds the cause when the phone shows a black screen after updates.
// `own`: the build of the screen of the install, which always runs first. An older install has none.
type Boot = { text: string; at: number; last: string | null; own?: string; checked?: boolean; watch?: boolean; audio?: boolean };
const W = window as { yonderBoot?: Boot };
if (phone && !W.yonderBoot) {
  W.yonderBoot = { text: `${__BUILD_ID__} at ${new Date().toTimeString().slice(0, 8)}`, at: Date.now(), last: localStorage.getItem("boot"), own: __BUILD_ID__ };
  window.addEventListener("error", (e) => (note(`error ${e.message}`), setTimeout(heal, 1000)));
  window.addEventListener("unhandledrejection", (e) => W.yonderBoot?.checked || note(`rejection ${e.reason}`));
}
const boot = W.yonderBoot;
export function note(step: string) {
  if (!boot || boot.text.length > 1800) return;
  boot.text += `; ${step.slice(0, 150)} +${Date.now() - boot.at}ms`;
  localStorage.setItem("boot", boot.text);
}
// The black screen after an update still showed `shown` and `frame` at 8 seconds, while the user saw nothing and
// felt the haptics of the taps. So the record also tells what the screen holds after 1.5 and 4 seconds, what the
// first taps hit, and when the app goes to the background. The bundle of the install made `boot` without these, so
// the first bundle that runs adds them.
export const describe = (el: Element | null) => (el ? `${el.tagName.toLowerCase()}.${el.getAttribute("class")?.split(" ")[0] ?? ""}` : "none");
function look(name: string) {
  const main = document.querySelector("main");
  const box = main?.getBoundingClientRect();
  const vv = window.visualViewport;
  note(
    `${name} ${document.getElementById("root")?.childElementCount ? "shown" : "empty"} ${document.visibilityState} focus ${document.hasFocus()}` +
      ` main ${box ? `${Math.round(box.top)}+${Math.round(box.height)} op ${main && getComputedStyle(main).opacity}` : "none"} y ${Math.round(scrollY)}` +
      ` vv ${vv ? `${vv.scale} ${Math.round(vv.offsetTop)} ${Math.round(vv.width)}x${Math.round(vv.height)}` : "none"}` +
      ` center ${describe(document.elementFromPoint(innerWidth / 2, innerHeight / 2))}`,
  );
  requestAnimationFrame(() => note(`${name} frame`));
}
if (boot && !boot.watch) {
  boot.watch = true;
  let taps = 0;
  document.addEventListener("pointerdown", (e) => taps++ < 6 && note(`tap ${describe(e.target as Element)}`), true);
  document.addEventListener("visibilitychange", () => note(document.visibilityState));
  addEventListener("pagehide", () => note("pagehide"));
  setTimeout(() => look("look"), 1500);
  setTimeout(() => look("look2"), 4000);
}
// Each AudioContext of the page goes in the record (`audio`). A black screen once came an hour after the click sound
// of the rows made the first AudioContext that stays open in the page. The cause was `paint_window`, which painted the
// full-screen text-effects window of UIKit over the app.
if (boot && !boot.audio && window.AudioContext) {
  boot.audio = true;
  const Base = window.AudioContext;
  window.AudioContext = class extends Base {
    constructor(options?: AudioContextOptions) {
      super(options);
      note("audio");
    }
  };
}
// A page that shows nothing loads again, at most once a minute. A bundle of the bridge that showed nothing still has
// its `frontTry`, so the next start marks it bad and runs the bundle of the install. Else the screen stays black until
// the user closes the app.
function heal() {
  if (document.getElementById("root")?.childElementCount || Date.now() - Number(localStorage.getItem("healed")) < 60_000) return;
  note("reload");
  localStorage.setItem("healed", String(Date.now()));
  note("still");
  void still().then(() => location.reload());
}
// 8 seconds after the start, in front: notes if the app shows, the size of the page and of main, and if a frame paints.
// A page that loads in the background shows the app only in front, because the pairing in IndexedDB waits there. So
// the 8 seconds do not run behind other apps: else the check comes on the way back before the pairing, loads a good
// screen again and marks it bad, and each new load asks for Face ID. The first page that starts the check takes it (`checked`) after 7 seconds, so a screen of the bridge
// also takes it from an older screen of the install, whose check comes at 8 seconds and does not wait. Not at once,
// because `checked` also ends the notes of the rejections in the record.
let frontSince = document.hidden ? 0 : Date.now(); // Since when the page is in front, else 0.
// A start that goes to the background with the app on the screen, before its check, is a good start too. Else its
// `frontTry` stays, the next start marks a good screen bad, and the phone runs the older screen of the install until a
// newer build.
// A screen on trial that starts behind other apps is on trial only in front, and it goes on trial again there when it
// shows nothing. Each update loads its new screen when the app goes to the background. iOS can freeze such a page
// 343 ms after its start, before the 1.5 seconds of `startFront`. Its `frontTry` then stays, and a start hours later
// marks the good screen bad, and the phone runs the screen of the install again.
let held = phone && document.hidden && localStorage.getItem("frontTry") === __BUILD_ID__;
if (held) localStorage.removeItem("frontTry");
document.addEventListener("visibilitychange", () => {
  frontSince = document.hidden ? 0 : Date.now();
  const shown = !!document.getElementById("root")?.childElementCount;
  if (document.hidden && shown) localStorage.removeItem("frontTry");
  else if (held && !document.hidden && !shown) localStorage.setItem("frontTry", __BUILD_ID__);
  if (!document.hidden) held = false;
});
function startCheck() {
  const b = boot;
  if (b) setTimeout(() => b.checked || ((b.checked = true), checkBoot()), 7000);
}
function checkBoot() {
  const wait = frontSince ? frontSince + 8000 - Date.now() : 8000;
  if (wait > 0) return void setTimeout(checkBoot, wait);
  const shown = !!document.getElementById("root")?.childElementCount;
  const main = document.querySelector("main")?.getBoundingClientRect();
  note(`${shown ? "shown" : "empty"} ${document.visibilityState} ${innerWidth}x${innerHeight}${main ? ` main ${Math.round(main.top)}+${Math.round(main.height)}` : ""}`);
  requestAnimationFrame(() => note("frame"));
  if (shown) localStorage.removeItem("frontTry");
  else void rollback().then((back) => back || heal());
}

// The computer whose screens the phone runs: the first computer that the phone uses with this rule, or the computer that
// the user marks in Settings, Environment. When that computer is unpaired, the computer in use takes its place. Only the
// phone keeps it: phone.json syncs from the computer in use, so another computer could set it there.
export const SCREEN_FROM = "screenFrom";
async function fromScreenSource() {
  const [now, all] = await Promise.all([loadPairing().catch(() => undefined), loadPairings().catch(() => [] as Pairing[])]);
  let from = localStorage.getItem(SCREEN_FROM);
  if (now && (!from || !all.some((p) => p.mac === from))) localStorage.setItem(SCREEN_FROM, (from = now.mac));
  return !!now && now.mac === from;
}

// Keeps a new bundle in localStorage. A bundle is about 2 MB of text, and localStorage holds about 5 MB, so with no room
// the copies of the screens of the user go first (src/look.ts keeps them for a start with no computer), and the save
// is tried once more. Else a full localStorage throws here, and the phone keeps an old screen with no note.
function keepBundle(text: string, build: string) {
  try {
    localStorage.setItem("front", text);
    return true;
  } catch {}
  Object.keys(localStorage).filter((k) => k.startsWith("look:")).forEach((k) => localStorage.removeItem(k));
  try {
    localStorage.setItem("front", text);
    return true;
  } catch {
    note(`no room for ${build}`);
    return false;
  }
}

// Runs at the start, before the app renders. It calls render only when this page is the one to run.
export async function startFront(render: () => void) {
  if (mac && location.hash.startsWith("#storage=")) {
    for (const [k, v] of Object.entries(JSON.parse(decodeURIComponent(location.hash.slice(9))) as Record<string, string>))
      if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
    history.replaceState(null, "", "/");
  }
  if (mac && location.protocol === "tauri:") {
    // The app starts the bridge, which takes a moment. Without the bridge, the app runs its own bundle. The app first
    // gives the port of the bridge of this user (bridge_port in src-tauri/src/main.rs).
    await bridgeReady;
    for (let i = 0; i < 10; i++) {
      const front = await bridgeFetch("/front").then((r) => r.json(), () => undefined);
      if (front) return front.build ? toBridge() : render();
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  // The quick action "Default screen" of the icon (Abilities.swift, docs/shell.md): this start runs the screen of the
  // install, and the custom look of phone.json goes away (`clearLook` in src/phone-config.ts), so no screen can lock the
  // user out. An app from before the native batch has no such command.
  if (ios && (await invoke<string>("launch_action").catch(() => "")) === "default-screen") {
    note("default screen");
    localStorage.removeItem("front");
    localStorage.removeItem("frontTry");
    localStorage.setItem("clearLook", "1");
  }
  let bundle = phone ? saved() : undefined;
  // A bundle that did not show the app last time goes away, so a broken build cannot lock the phone out. The last good
  // screen runs in its place, so a false bad mark, such as a kill of the app in its first second, costs one build and
  // not all the builds since the install.
  if (bundle && count(bundle.build) > OWN && localStorage.getItem("frontTry") === bundle.build) {
    note(`bad ${bundle.build}`);
    localStorage.setItem("frontBad", bundle.build);
    localStorage.removeItem("front");
    const back = await good();
    bundle = back ? (JSON.parse(back) as Bundle) : undefined;
    if (bundle?.build === localStorage.getItem("frontBad")) bundle = undefined;
    else if (bundle) (note(`good ${bundle.build}`), localStorage.setItem("front", back!));
  }
  if (bundle && count(bundle.build) > OWN && !fits(bundle.needs, __BUILD_ID__)) note(`needs a newer app ${bundle.build}`);
  else if (bundle && count(bundle.build) > OWN) {
    note(`run ${bundle.build}`);
    localStorage.setItem("frontTry", bundle.build);
    document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove());
    document.head.append(Object.assign(document.createElement("style"), { textContent: bundle.css }));
    // An inline module runs with no load. A load from a blob URL goes through the network process of WebKit, a step
    // of an update that a normal start does not have.
    document.head.append(Object.assign(document.createElement("script"), { type: "module", textContent: bundle.js }));
    startCheck();
    return;
  }
  // After an update, App.tsx opens the tab and the agent or call that were open. The record names them.
  const resume = localStorage.getItem("resume");
  const nav = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
  note(`render ${nav}${document.hidden ? " hidden" : ""}${resume ? ` resume ${resume}` : ""}`);
  render();
  // A bundle that shows the app loses its try mark after 1.5 seconds, not 8. A user can close a black screen within a
  // few seconds, and else the next start marks a good bundle bad and runs the older bundle of the install, whose
  // updates still go black (docs/wiki/install.md). It is then the good screen for `rollback`, and the native cover of
  // a new load goes away, if the native controls did not take it away first (src/chrome.ts).
  setTimeout(() => {
    if (ios) void cover(false);
    if (!document.getElementById("root")?.childElementCount) return;
    localStorage.removeItem("frontTry");
    if (mine && localStorage.getItem("frontGood") !== __BUILD_ID__) void good(mine).then(() => localStorage.setItem("frontGood", __BUILD_ID__));
    mine = null;
  }, 1500);
  startCheck();
}


// The page of a newer phone app, or "". The screen updates over the air, but a native change needs a new install: the
// APK of download.yonder.so (android/release.ts writes latest-android.txt) or Google Play, or the App Store on the iPhone. Only the
// major number and the build number B of "2.B.N" count, because the native app changes only with B. A debug build is
// "0.1.0", so it gets no notice. The notice tells the user to update an old APK, which can crash, such as at each scan.
const native = (v = "") => {
  const [major, b] = v.split(".").map(Number);
  return (major || 0) * 1_000_000 + (b || 0);
};
// A copy from Google Play opens its page in Play, which has the Update button. Play can show the new version some hours
// after the APK, when its review ends. The iPhone opens the public link of TestFlight (ios/store/listing.md), which opens
// the TestFlight app, until Yonder is on the App Store.
const storeUrl = (version = "") =>
  !android
    ? "https://testflight.apple.com/join/XjDsAbyr"
    : shell?.play?.()
      ? "https://play.google.com/store/apps/details?id=so.yonder"
      : `https://download.yonder.so/Yonder${version && `-${version}`}.apk`;
async function storeUpdate(): Promise<{ url: string; version: string } | undefined> {
  const own = await getVersion().catch(() => "0");
  if (native(own) < 1_000_000) return;
  if (android) {
    // The update server (channel.json, "Update server" in the wiki) answers for this install, so a slow rollout and a
    // stop reach the phone; 204 is no update. With no answer, the static file. The link names the version that the
    // server gave, which is not always the newest APK.
    const id = localStorage.getItem("installId") || crypto.randomUUID();
    localStorage.setItem("installId", id);
    const answer =
      (await fetch(`${UPDATES.server}/${UPDATES.channel}/android?id=${id}&v=${own}`, { cache: "no-store" }).then((r) => (r.status === 204 ? "" : r.ok ? r.text() : undefined), () => undefined)) ??
      (await fetch("https://download.yonder.so/latest-android.txt", { cache: "no-store" }).then((r) => (r.ok ? r.text() : ""), () => ""));
    const latest = answer.trim().split(/\s+/)[0] ?? "";
    return native(latest) > native(own) ? { url: storeUrl(latest), version: latest } : undefined;
  }
  // The App Store has no Yonder yet, so the lookup finds nothing, and a TestFlight build gets no notice.
  const app = await fetch("https://itunes.apple.com/lookup?bundleId=com.vladartym.yonder", { cache: "no-store" }).then((r) => r.json(), () => undefined);
  const latest: { version?: string; trackViewUrl?: string } | undefined = app?.results?.[0];
  return latest?.trackViewUrl && latest.version && native(latest.version) > native(own) ? { url: latest.trackViewUrl, version: latest.version } : undefined;
}

// Asks the bridge for the build of the front end every 5 seconds. A new build loads by itself, with no button and no
// notice, so the screen changes live by voice, with no "Update available" (docs/wiki/install.md). A build with the same JS (`code`) has only new CSS, and the page puts the CSS in at once, also
// during a call (`restyle`). Another build loads with a new load of the page when that shows the same screen
// (`settled`) and no call or talk view is on: on the phone when the app goes to the background, and in front only under
// the native cover of the iPhone after 3 seconds with no touch; on the Mac when its window is not in front. A tap on
// Update or an update by voice (`accept`) loads it at once.
// `shell`: the Mac app needs a full rebuild.
export function useFront(online: boolean, live: boolean) {
  const [shell, setShell] = useState(false);
  // A rebuild or an update that runs now on the bridge, also when an agent or the voice started it.
  const [building, setBuilding] = useState(false);
  // The newer phone app (storeUpdate), checked at the start, each hour, and on Check in the settings (lookStore). Check
  // asks the store too, because the bridge alone can say "Up to date" when a newer app is out.
  const [store, setStore] = useState<{ url: string; version: string }>();
  // The build of the screen of the computer in use when it needs a newer phone app, else "".
  const [tooNew, setTooNew] = useState("");
  // A newer TestFlight build of the iPhone app, from the bridge of the Mac with the source (`bun run testflight`).
  const [testflight, setTestflight] = useState("");
  // Why the phone does not run the screen of the computer, for a toast (App.tsx), else "".
  const [notice, setNotice] = useState("");
  const lookStore = () => (phone ? storeUpdate().then(setStore) : Promise.resolve());
  useEffect(() => {
    if (!phone) return;
    void lookStore();
    const timer = setInterval(lookStore, 3_600_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!online || !(mac || phone)) return;
    // The record of the start before this one goes to call.log, one time.
    const last = boot?.last;
    if (boot && last) {
      boot.last = null;
      bridgeFetch("/log", { method: "POST", body: `Phone start: ${last}` }).catch(() => (boot.last = last));
    }
    let stopped = false;
    // The build that waits for a new load of the page.
    let next = "";
    // The version of phone.json at the last check.
    let config: number | undefined;
    // Loads the waiting build: at once when the user accepted it. The Mac loads it at once too, also while the user
    // uses the window, a page of the settings or a menu, unless a box has text (a new load loses it) or a click, key or
    // scroll came in the last 3 seconds (a new load stops a request that the click started). Thus the user does not see
    // an old screen for long while using the window. The phone loads it when a new
    // load shows the same screen and the user does not see it: in the background (a new load in the background showed
    // the app in each record of iOS, `render back_forward`), or under the native cover, after 3 seconds with no touch
    // and with no keyboard.
    // shortcut: 3 seconds is the guess for the longest request of a click; count the requests in flight if a click loses one.
    const loadNext = async () => {
      if (!next || stopped || live || hold.talk) return;
      const now = accepted();
      const away = document.hidden || (mac && !document.hasFocus());
      // No focus: a native sheet is up, as the attach sheet, and the user can use it with no touch on the page.
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "") || document.documentElement.hasAttribute("data-frame-typing");
      const quiet = Date.now() - input > 3000;
      const covered = parts.cover && document.hasFocus() && !typing && quiet;
      if (!now && !(mac ? quiet && !typed() : settled() && (away || covered))) return;
      stopped = true;
      // After the new load, the app opens the tab and the agent or call that were open (App.tsx).
      localStorage.setItem("resume", localStorage.getItem("view") ?? "");
      note(`update ${next}${now ? " accepted" : away ? " away" : mac ? " in use" : " covered"}`);
      if (mac) return toBridge();
      // In the background, the web process can stop in a few seconds, so the page loads again at once.
      if (away && !now) return location.reload();
      if (!now) await cover(true);
      note("still");
      await still();
      location.reload();
    };
    const check = async () => {
      const front: { build: string; needs?: Needs; code?: string; css?: string; testflight?: string; config?: number; shell: boolean; platform?: string; channel?: string; ghostty?: boolean; building?: boolean } | undefined =
        await bridgeFetch("/front").then((r) => r.json(), () => undefined);
      if (front?.platform) {
        platform = front.platform;
        channel = front.channel ?? "";
        ghostty = front.platform === "darwin" && front.ghostty !== false;
      }
      // A change of phone.json on the computer (the look, the tabs, the settings) syncs at once, not only when the app
      // comes to the front (src/phone-config.ts), so the Mac shapes the phone in seconds.
      if (phone && front?.config !== undefined) {
        if (config !== undefined && front.config !== config) syncPhoneConfig();
        config = front.config;
      }
      if (!front?.build || stopped) return;
      setShell(front.shell);
      setBuilding(!!front.building);
      // The code of the page, when the bridge serves the build of the page.
      if (!running.code && front.build === running.build) running.code = front.code ?? "";
      next = "";
      if (mac && front.build !== running.build) {
        const css = running.code && front.code === running.code && front.css && (await bridgeFetch(front.css).then((r) => (r.ok ? r.text() : ""), () => ""));
        if (stopped) return;
        if (css) return void (restyle(css), (running.build = front.build));
        next = front.build;
      }
      if (!phone) return void loadNext();
      // The screen of the computer in use (`pick` in src/screen.ts), or "" for the screen of the install (`app`). A
      // screen that needs a newer app shows in Settings (`tooNew`).
      // An older install has no `own`: `pick` then never returns "" (see there).
      const own = boot?.own;
      const injected = own ? own !== __BUILD_ID__ : saved()?.build === __BUILD_ID__;
      const app = own ?? (await installed());
      const old = !!app && !fitsFor(front.needs, app, android) && count(front.build) > count(app);
      setTooNew(old ? front.build : "");
      setTestflight(ios && app && front.testflight && native(front.testflight) > native(app) ? front.testflight : "");
      // The phone runs an older screen than the computer: it says why one time, for each needed app and each failed
      // build. Else the user sees only that the newest features are gone.
      const failed = front.build === localStorage.getItem("frontBad") && count(front.build) > count(running.build);
      const why = old ? `needs ${front.needs?.[android ? "android" : "ios"]}` : failed ? `bad ${front.build}` : "";
      if (why && localStorage.getItem("frontNoticed") !== why) {
        localStorage.setItem("frontNoticed", why);
        note(why);
        setNotice(old ? "The new screen needs a newer app." : "The new screen did not start.");
      }
      // A screen from the bridge that failed here keeps the screen that runs, as after a `rollback`, until a newer build.
      if (injected && front.build === localStorage.getItem("frontBad")) return;
      // A bundle is not signed yet (SECURITY.md), so only one computer sends the screen. Another computer, such as a
      // server where an agent changes dist/, keeps the screen that runs.
      if (!(await fromScreenSource())) return;
      const want = pick(front, app, !!own, running.build, localStorage.getItem("frontBad"), android);
      if (!want) localStorage.removeItem("front");
      else if (want !== running.build || injected) {
        if (saved()?.build !== want) {
          const zip = await bridgeFetch("/front?bundle").then((r) => (r.ok ? r.blob() : undefined), () => undefined);
          const got: Bundle | undefined = zip && JSON.parse(await new Response(zip.stream().pipeThrough(new DecompressionStream("gzip"))).text());
          // The computer can change its build between the two requests. The next check gets the new one.
          if (got?.build !== want || stopped || !keepBundle(JSON.stringify(got), got.build)) return;
          localStorage.removeItem("frontTry");
          // Only the CSS changed: it goes in now, and the next start runs the new bundle.
          if (running.code && got.code === running.code) {
            note(`restyle ${got.build}`);
            restyle(got.css);
            running.build = got.build;
          }
        }
      }
      if (want ? want === running.build : !injected) return;
      next = want || (app as string);
      void loadNext();
    };
    check();
    kick = () => void check();
    const timer = setInterval(check, 5000);
    // The app goes to the background, or the window of the Mac goes behind another one.
    const away = () => void loadNext();
    document.addEventListener("visibilitychange", away);
    addEventListener("blur", away);
    return () => {
      stopped = true;
      kick = undefined;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", away);
      removeEventListener("blur", away);
    };
  }, [online, live]);
  // A newer TestFlight build shows in Settings also with no store version: its button opens the TestFlight app. A screen
  // that needs a newer app (`tooNew`) shows in Settings with no button when no newer app is out. Else a tap on the
  // button opens TestFlight with no newer build.
  return { shell, building, store: store ?? (testflight ? { url: storeUrl(), version: testflight } : undefined), tooNew, notice, lookStore };
}
