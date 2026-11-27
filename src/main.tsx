import "./polyfill";
import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { connectPhone, haptic, phone, shell } from "./bridge";
import { note, rollback, startFront } from "./front";
import { loadPairing } from "./link";
import { Lock } from "./Lock";
import { applyAccent, applyFonts } from "./Settings";
import "./app.css";

declare const __BUILD_ID__: string;
declare const __SENTRY_DSN__: string;
// Errors of the screen go to Sentry, the project yonder, on the Mac, the iPhone and Android. Only errors: no traces
// and no replays, because the screen shows what the user says. Not from the dev server. The source maps go up in
// vite.config.ts. Each error on the screen goes up too (useReport in App.tsx), except the ones below, which tell a state.
// An issue of such a state that is only resolved in Sentry comes back on its next event: "Yonder did not hear you." was
// resolved as noise and then regressed (YONDER-R). So each expected state needs a pattern here.
// A pattern with no ^ also finds the text inside a longer one, such as "A queued message did not go to the Mac: …".
// The DSN comes from SENTRY_DSN at build time (vite.config.ts). A build with no DSN, such as a build from source, starts no
// Sentry client and sends nothing.
if (__SENTRY_DSN__) Sentry.init({
  // A page on another port is a test: a check bridge serves dist/ on its own port. A fake phone of an agent
  // sent "The Mac did not answer." from one (Sentry YONDER-12). The apps have no port, or the port 7787 of the bridge. The Mac app on another port of the bridge has Tauri.
  // A page that Playwright drives is a test too: a probe of an agent at http://yonder.test/ answered each
  // bridge path with [] and sent "e.clis.map" (YONDER-17). Playwright sets navigator.webdriver in Chromium and WebKit.
  enabled: import.meta.env.PROD && (["", "7787"].includes(location.port) || "__TAURI_INTERNALS__" in window) && !navigator.webdriver,
  dsn: __SENTRY_DSN__,
  release: __BUILD_ID__,
  // A request breadcrumb keeps only the method and the status. Its address can hold a local file path, the install ID
  // or a query string.
  beforeBreadcrumb: (b) =>
    b.category === "fetch" || b.category === "xhr" ? { ...b, data: { method: b.data?.method, status_code: b.data?.status_code } } : b,
  ignoreErrors: [
    /^Add a voice key/, /^The user did not allow the location/, /^The Mac is offline/, /^Pair this phone/, /^The sound plays on/, /^Paired\. /,
    /Yonder did not hear you/, // The user said nothing (YONDER-R).
    / is not (signed in|installed) on | is signed out/, // A CLI to sign in or install (YONDER-N).
    /^Yonder needs the camera/, // No camera permission (YONDER-G).
    /^The new screen needs a newer app/, // An old app (YONDER-J).
    /No web server runs there|Nothing runs on port \d+\./, // The agent did not start its dev server (YONDER-H).
    /^Put [A-Z_]+_API_KEY=/, // A computer with no key of its own and no sign-in (YONDER-X).
    /^No pairing code is open/, // The phone scanned a code that ran out or that a newer code replaced (YONDER-1B).
    / may not use (the microphone|speech recognition)\. Allow it in Settings/, // No permission on the iPhone (YONDER-1D).
  ],
});

if (phone) document.documentElement.dataset.phone = "";
// The Mac app, the one window with traffic lights. The window on Omarchy and on Windows is a page with no Tauri.
else if ("__TAURI_INTERNALS__" in window) document.documentElement.dataset.mac = "";
applyFonts();
applyAccent();
// The phone app does not zoom with a pinch. The index.html of an older install has no such limit, and an update
// over the air changes only the JS and the CSS, so the viewport gets the limit here too. iOS also gets gesturestart.
if (phone) {
  document.querySelector('meta[name="viewport"]')?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
  document.addEventListener("gesturestart", (e) => e.preventDefault());
}
// On the phone, each button, link and option gives a light tap. The tabs of the tab bar tap in App.tsx, when the tab
// changes, so a drag along the tab bar taps on each tab. The call button taps in App.tsx, when the call changes.
if (phone)
  document.addEventListener("click", (e) => {
    const el = (e.target as Element).closest("button, a, img, [role=button], [role=tab], [role=menuitem], [role=switch], [role=option]");
    if (el && !el.closest(".tablist, button.call")) haptic();
  });
// A key hides the hover fill of the mouse until the mouse moves again (data-keys in app.css), so only the row of the
// arrows has a fill. WebKit can send a move with no motion when the page scrolls under the mouse, so the place must change.
if (!phone) {
  let at = "";
  window.addEventListener("keydown", (e) => {
    if (!["Meta", "Shift", "Alt", "Control"].includes(e.key)) document.documentElement.dataset.keys = "";
  }, true);
  window.addEventListener("pointermove", (e) => {
    if (`${e.screenX},${e.screenY}` === at) return;
    at = `${e.screenX},${e.screenY}`;
    delete document.documentElement.dataset.keys;
  }, true);
}
// On the Mac and the PC, a list has no scroll bar of its own, so its rows and lines go to the edge. One thin thumb
// floats over the list that scrolls, for 0.8 s after each scroll, and a drag on it scrolls the list (app.css). WebKit
// keeps the width of a styled scroll bar out of the list.
if (!phone) {
  const thumb = document.body.appendChild(document.createElement("div"));
  thumb.className = "scroll-thumb"; // Not "thumb": that is the class of a picture in the chat (MediaItem in App.tsx).
  const timers = new WeakMap<Element, number>();
  let shown: Element | null = null;
  let dragging = false;
  let timer = 0;
  const place = (el: Element) => {
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) return;
    const r = el.getBoundingClientRect();
    const h = Math.max(24, (clientHeight * clientHeight) / scrollHeight);
    thumb.style.cssText = `top:${r.top + (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - h)}px;left:${r.right - 8}px;height:${h}px`;
    thumb.classList.add("on");
    shown = el;
    clearTimeout(timer);
    if (!dragging) timer = window.setTimeout(() => thumb.classList.remove("on"), 800);
  };
  document.addEventListener(
    "scroll",
    (e) => {
      const el = e.target instanceof Element ? e.target : document.scrollingElement;
      if (!el) return;
      if (el.scrollHeight > el.clientHeight && getComputedStyle(el).scrollbarWidth !== "none") place(el);
      // A sideways scroll bar keeps its own thin thumb, and it shows the same 0.8 s.
      el.setAttribute("data-scrolling", "");
      clearTimeout(timers.get(el));
      timers.set(el, window.setTimeout(() => el.removeAttribute("data-scrolling"), 800));
    },
    { capture: true, passive: true },
  );
  thumb.addEventListener("pointerdown", (e) => {
    const el = shown;
    if (!el) return;
    thumb.setPointerCapture(e.pointerId);
    dragging = true;
    clearTimeout(timer);
    const y = e.clientY;
    const top = el.scrollTop;
    const per = (el.scrollHeight - el.clientHeight) / (el.clientHeight - thumb.offsetHeight);
    const move = (m: PointerEvent) => (el.scrollTop = top + (m.clientY - y) * per);
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("lostpointercapture", () => {
      thumb.removeEventListener("pointermove", move);
      dragging = false;
      place(el);
    }, { once: true });
  });
}
// A selection stays in the conversation of the open agent or call. Select All (⌘A or the callout of iOS) and a drag
// past the edge of the conversation select the whole page in WebKit, the header and the tabs too, so the selection
// is cut back to the conversation.
document.addEventListener("selectionchange", () => {
  const sel = getSelection();
  if (!sel?.rangeCount || sel.isCollapsed || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "")) return;
  const r = sel.getRangeAt(0);
  const convo = [...document.querySelectorAll(".convo")].find((c) => r.intersectsNode(c) && c.getClientRects().length);
  if (!convo) return;
  const c = document.createRange();
  c.selectNodeContents(convo);
  const start = r.compareBoundaryPoints(Range.START_TO_START, c) < 0 ? c : r;
  const end = r.compareBoundaryPoints(Range.END_TO_END, c) > 0 ? c : r;
  if (start === r && end === r) return;
  // A drag up keeps its anchor at the end, so the handle that moves stays the one under the finger.
  const up = sel.focusNode === r.startContainer && sel.focusOffset === r.startOffset;
  if (up) sel.setBaseAndExtent(end.endContainer, end.endOffset, start.startContainer, start.startOffset);
  else sel.setBaseAndExtent(start.startContainer, start.startOffset, end.endContainer, end.endOffset);
});
// Android: the web view has no safe area for the system bars, so MainActivity.kt gives their sizes, and the CSS
// uses them in place of env(safe-area-inset-*). The keyboard and a turn of the phone change them.
// The icons of the system bars follow the theme of the app.
const androidShell = shell;
if (androidShell) {
  const pad = () => {
    for (const [side, px] of Object.entries(JSON.parse(androidShell.bars()))) document.documentElement.style.setProperty(`--inset-${side}`, `${px}px`);
  };
  pad();
  addEventListener("resize", pad);
  new MutationObserver(() => androidShell.dark(document.documentElement.dataset.theme === "dark")).observe(document.documentElement, { attributeFilter: ["data-theme"] });
}
// iOS: the keyboard covers the web view and does not make it shorter, so WebKit moves the page up to show the text
// field, and the user can scroll the whole app up and down. The app follows the visible part of the page instead:
// the CSS puts main on it, so the prompt box sits on the keyboard, as in Messages, and only the lists scroll.
// Under the keyboard, the home bar is hidden, so main drops its bottom inset.
const vv = window.visualViewport;
if (phone && !androidShell && vv) {
  const html = document.documentElement;
  // The height of the visible part of the page with no keyboard.
  let full = vv.height;
  const fit = () => {
    // While the keyboard closes, visualViewport still gives the size with the keyboard for a short time. See focusout below.
    if (html.hasAttribute("data-closing") && full - vv.height > 100) return;
    if (!html.hasAttribute("data-keyboard")) full = vv.height;
    html.style.setProperty("--vv-height", `${vv.height}px`);
    html.style.setProperty("--vv-top", `${vv.offsetTop}px`);
    // iOS 26 can make the web view shorter in place of covering it, so a text field with focus counts too: one of the
    // app, or one in the frame of an own screen (data-frame-typing, src/OwnScreen.tsx).
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "") || html.hasAttribute("data-frame-typing");
    html.toggleAttribute("data-keyboard", typing || innerHeight - vv.height > 100);
  };
  document.documentElement.dataset.viewport = "";
  fit();
  vv.addEventListener("resize", fit);
  vv.addEventListener("scroll", fit);
  // When the keyboard closes, WebKit slides the page back down over about 0.3 s, but visualViewport gives the end
  // position at once. main then jumped up by the height of the keyboard and slid back in, header and all. So main
  // goes to the end position with a transition (app.css) that follows the slide of WebKit. The curve and the
  // 16 ms delay come from a screen recording of the iOS 27 simulator.
  // shortcut: a fixed curve; if a later iOS changes the slide of the keyboard, measure it again.
  let closing: ReturnType<typeof setTimeout> | undefined;
  addEventListener("focusin", () => (html.removeAttribute("data-closing"), fit()));
  addEventListener("focusout", (e: FocusEvent) => {
    if (/^(INPUT|TEXTAREA)$/.test((e.relatedTarget as Element | null)?.tagName ?? "") || !html.hasAttribute("data-keyboard")) return void setTimeout(fit);
    html.setAttribute("data-closing", "");
    const end = () => (html.style.setProperty("--vv-top", "0px"), html.style.setProperty("--vv-height", `${full}px`));
    end();
    // A bundle from the bridge runs next to the main.tsx of the installed app (front.ts), whose focusout sets the size
    // with the keyboard again in a timeout. This timeout comes after it.
    setTimeout(end);
    clearTimeout(closing);
    closing = setTimeout(() => (html.removeAttribute("data-closing"), fit()), 400);
  });
}
// The newest front end can come from the bridge (see front.ts). Then this page does not render.
startFront(() => {
  // Sentry gets the component stack of an error in React. An error that empties the app makes a new screen from the
  // bridge go back to the last good one (`rollback` in front.ts).
  const report = Sentry.reactErrorHandler();
  const root = createRoot(document.getElementById("root")!, { onUncaughtError: (error, info) => (report(error, info), void rollback()), onCaughtError: Sentry.reactErrorHandler() });
  // The phone talks to the Mac through the relay. With no pairing, the app opens anyway, and its call button opens the
  // pairing screen (App.tsx). Thus App Review and a new user can see the app and reach the plans.
  if (!phone) root.render(<App />);
  else
    loadPairing().then(
      // The Face ID lock covers the app (src/Lock.tsx). An app with no pairing has nothing to lock.
      (p) => (note("pairing"), p ? (connectPhone(p), root.render(<><App /><Lock /></>)) : root.render(<App />)),
      (e) => (note(`no pairing: ${e}`), root.render(<App />)),
    );
});
