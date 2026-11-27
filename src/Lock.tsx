// The Face ID lock of the phone app, which the user turns on in General of the settings. The lock screen covers the
// app when it opens and each time that it comes back from the background, but not from a link that Yonder opened. The
// app stays mounted under it, so a live call goes on. Android uses the fingerprint in place of Face ID. The iPhone can
// skip Face ID for some minutes after the app left the screen, unless the phone locked in that time, so a quick switch
// to another app does not ask again. A new load of the page, such as an update of the screen, keeps the state of the
// lock (`kept`).
import { yonder } from "./api";
import { authenticate, checkStatus } from "@tauri-apps/plugin-biometric";
import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { android, away, lockScreen } from "./bridge";
import { note } from "./front";
import bird from "./empty/wave.svg?inline";

export const lockName = android ? "Fingerprint" : "Face ID";
export const lockOn = () => localStorage.getItem("faceLock") === "on";
// The passcode of the phone is the fallback, so a failed Face ID does not lock the user out.
export const unlock = () => authenticate("Unlock Yonder", { allowDeviceCredential: true });
// The plugin is native, so an older phone app has no plugin, and the settings hide the row.
export const lockAvailable = () => checkStatus().then(() => true, () => false);
// The minutes that the app opens with no Face ID after it left the screen. 0 asks each time.
export const graceMinutes = () => Number(localStorage.getItem("faceGrace")) || 0;
// The time of the last lock of the phone (Island.swift). With the grace time on, the app stays awake for a moment when
// it leaves the screen, to hear the lock. An older phone app and Android have no such command, so they
// ask each time, and the settings hide the row of the grace time.
export const phoneLock = () => yonder.native.phoneLock({ watch: lockOn() && graceMinutes() > 0 });

// The state of the lock for a new load of the page in the same run of the app: an update of the screen over the air
// (src/front.ts), a heal, or a new web process of iOS (`back_forward`). `open`: the open app loaded again at that time,
// `link` while it was away through a link of Yonder. `away`: the open app left the screen at that time, for the grace
// time. sessionStorage keeps it for a new load, and a new start of the app has none, so it locks. A new screen loads by
// itself, also in front under the native cover. Without `kept`, each new load asks for Face ID again.
type Kept = { open?: number; link?: boolean; away?: number };
const keep = (k?: Kept) => (k ? sessionStorage.setItem("lock", JSON.stringify(k)) : sessionStorage.removeItem("lock"));
function kept(): Kept {
  const nav = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
  try {
    if (nav === "reload" || nav === "back_forward") return JSON.parse(sessionStorage.getItem("lock") ?? "{}");
  } catch {}
  return {};
}

export function Lock() {
  // An app that was open in front a moment ago, or away through a link, opens as it was. Else the time of the new load
  // counts as the time when it left the screen. That time stays through more new loads, until the app is in front.
  const [start] = useState(() => {
    const k = kept();
    const open = !!k.open && (!!k.link || (!document.hidden && Date.now() - k.open < 10_000));
    const since = open ? 0 : k.away || k.open || 0;
    keep(since ? { away: since } : undefined);
    return { k, open, since };
  });
  const [locked, setLocked] = useState(() => lockOn() && !start.open);
  const [busy, setBusy] = useState(false);
  // The prompt makes the app inactive, so the refs keep the visibility events from a new lock during the prompt.
  const prompting = useRef(false);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  lockScreen.up = locked;
  // When the open app left the screen, for the grace time. 0 for an app that was locked already.
  const awaySince = useRef(start.since);

  const prompt = () => {
    if (prompting.current) return;
    prompting.current = true;
    setBusy(true);
    unlock()
      .then(
        () => setLocked(false),
        // With no plugin or no passcode on the phone, nothing can unlock the app, so it opens. Else it stays locked.
        () => checkStatus().then((s) => s.errorCode === "passcodeNotSet" && setLocked(false), () => setLocked(false)),
      )
      .finally(() => ((prompting.current = false), setBusy(false)));
  };

  // A layout effect, so that the listeners are on before an event can come after the start read document.hidden.
  useLayoutEffect(() => {
    if (start.k.open || start.k.away) note(`lock ${start.open ? "open" : "away"}`);
    if (start.k.link && document.hidden) away.link = true;
    // iOS can refuse the prompt before the app is active, so the prompt waits a moment.
    const later = () => setTimeout(() => lockedRef.current && prompt(), 300);
    void phoneLock().catch(() => {}); // Starts the watch for the lock of the phone.
    // Inside the grace time, and with no lock of the phone since the app left, the app opens with no Face ID.
    const back = () => {
      const since = awaySince.current;
      awaySince.current = 0;
      keep();
      if (!since || Date.now() - since >= graceMinutes() * 60_000) return later();
      // The app can leave the screen again during the call, and then it stays locked.
      phoneLock().then((at) => (at >= since ? later() : document.visibilityState === "visible" && setLocked(false)), later);
    };
    // A page that loads again gets a hidden event right after pagehide, in the same task. That event does not lock.
    let gone = false;
    const onVisibility = () => {
      if (prompting.current || gone) return;
      // Lock at once on hidden, so the snapshot of the app switcher shows the lock screen and not the agents.
      // A link that Yonder opened (`away` in src/bridge.ts) does not lock.
      if (document.visibilityState === "hidden") {
        if (away.link || !lockOn()) return;
        if (!lockedRef.current) awaySince.current = Date.now();
        flushSync(() => setLocked(true));
        keep(awaySince.current ? { away: awaySince.current } : undefined);
      } else {
        away.link = false;
        if (lockedRef.current) back();
      }
    };
    const onPageHide = () => {
      gone = true;
      setTimeout(() => (gone = false)); // Only a page that stays runs it.
      if (lockOn() && !lockedRef.current) keep({ open: Date.now(), link: away.link });
    };
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", onPageHide);
    // A page that starts behind another app, as after an update in the background, asks when it comes to the front.
    if (lockedRef.current && !document.hidden) back();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", onPageHide);
    };
  }, []);

  if (!locked) return null;
  return (
    // role="dialog" covers the native buttons and the tab bar (SCREENS in src/chrome.ts), so the lock screen shows no
    // control but the unlock button.
    <div className="pair-screen lock-screen" role="dialog" aria-label="Yonder is locked">
      {/* The bird mascot, as on the pairing screen. */}
      <img className="logo" src={bird} alt="" draggable={false} />
      <h1>Yonder</h1>
      <p>Yonder is locked.</p>
      <button className="scan" onClick={prompt} disabled={busy}>
        Unlock with {lockName}
      </button>
    </div>
  );
}
