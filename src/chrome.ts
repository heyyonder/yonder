// The native chrome of the iPhone (NativeChrome.swift in ios/gen/apple/Sources/yonder-ios): on iOS 26 the tab bar and
// each button with `data-native` are native controls in real Liquid Glass, because the web view cannot draw real glass
// ("The tabs of the phone" in docs/wiki.md). The page keeps its own controls in their places, hidden while their native
// control shows (`[data-native-on]` in src/app.css), and sends their places and their state on each change. A native tap opens
// a tab, or clicks the hidden button, so each button keeps one handler: the three dots open the glass menu of the page,
// as all the menus of the app. An older app or an iOS before 26 keeps the controls of the page. The native buttons are
// the same everywhere.
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { android, bridgeFetch, phone } from "./bridge";
import { cover as coverLoad, describe, parts } from "./front";
import { iconPng, type IconName } from "./icons";
import { themed } from "./look";

// `badge` and `symbol` need version 5 of the native chrome, and an older app ignores them.
export type ChromeTab = { id: string; title: string; icon: IconName; badge?: string; symbol?: string };
// An item of a native menu (ChromeState.MenuItem in Swift): an action, or a submenu with `items`.
export type ChromeMenuItem = { id: string; title: string; detail?: string; symbol?: string; checked?: boolean; destructive?: boolean; items?: ChromeMenuItem[] };
// A button with `data-menu` (its items as JSON) opens a native menu, and the choice goes to its handler here, by the
// name of the button.
export const menus = new Map<string, (item: string) => void>();
// The version of the native chrome, 0 without it: 3 has the native attach sheet (`attach_sheet` in src/App.tsx), 4
// the native dropdowns, 5 the kit of docs/shell.md, and 6 the Version button of the attach sheet.
export let chromeVersion = 0;

const inTauri = "__TAURI_INTERNALS__" in window;
// The native controls float over the whole page. A dialog, a sheet or the settings page covers all the controls that
// are not in it, and a menu, the list of a dropdown or a toast covers the controls under it. The keyboard covers the
// controls at the bottom, as it covers the tab bar of iOS.
// An open agent that covers the screen of the phone (.sheet.cover) has the title bar and the tab bar under it.
// An own screen (src/OwnScreen.tsx) covers the whole default screen, so its native controls hide under it.
const SCREENS = '[role="dialog"], [role="alertdialog"], .page, .sheet.cover, .own-screen';
const POPUPS = '[role="menu"], [role="listbox"], .toast';

const box = (el: Element | null) => {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? r : undefined;
};
const meets = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

export function useNativeChrome(tabs: ChromeTab[], selected: string, onTab: (id: string) => void) {
  const latest = useRef({ tabs, selected, onTab });
  latest.current = { tabs, selected, onTab };
  const kick = useRef(() => {});
  useEffect(() => {
    if (!inTauri || !phone || android) return;
    const root = document.documentElement;
    const sent = new Set<IconName>(); // The icons that the native side already has.
    let last = "";
    let told = ""; // The last state of the tab bar in call.log, and the count of such lines.
    let tells = 0;
    let frame = 0;
    let off = false; // An app or an iOS without the native chrome.
    let cuts = false; // The native side can cut its controls at the edge of a page that slides (version 2).
    let edge = 0; // The left edge of the settings page in the last state.
    let queue = Promise.resolve();
    // A list that scrolls, and a finger that drags on the page, move the controls in the lists: their native controls
    // hide until 150 ms after the last move, and the controls of the page move with their list. A switch of WebKit
    // looks the same as the switch of iOS at rest, so the change does not show.
    let scrolling = false;
    let settle = 0;
    const send = async () => {
      // A theme other than the default draws all its controls itself, in its own style: the native side gets an empty
      // state once, which takes away its tab bar, buttons, switches and dropdowns. Only the default theme has native
      // controls.
      if (themed()) {
        if (last !== "themed") {
          last = "themed";
          const empty = { dark: root.dataset.theme === "dark", tabs: [], selected: "", buttons: [], toggles: [], dropdowns: [], icons: {} };
          await invoke("native_chrome", { state: JSON.stringify(empty) }).catch(() => {});
          root.removeAttribute("data-native-chrome");
          document.querySelectorAll("[data-native-on]").forEach((el) => el.removeAttribute("data-native-on"));
        }
        return;
      }
      if (last === "themed") last = "";
      const { tabs, selected } = latest.current;
      const screens = [...document.querySelectorAll(SCREENS)];
      const popups = [...document.querySelectorAll(POPUPS)].flatMap((el) => {
        const r = box(el);
        return r ? [{ el, r }] : [];
      });
      const keyboard = root.hasAttribute("data-keyboard");
      // The bottom of the visible part of the page. Only a control under it is under the keyboard, so the controls that
      // sit on the keyboard, as the menus and the paper clip of a new agent, stay native. The places need no offset: iOS
      // moves the native controls up with the page. An offset of the visible part puts them one keyboard too high, and
      // the back button off the screen.
      const seen = visualViewport ? visualViewport.offsetTop + visualViewport.height : innerHeight;
      // A native control cannot follow a view that moves: a swipe back (`data-swiping`, useSwipeBack in src/App.tsx)
      // or a view that slides in. The buttons of the page then show, and move with their view.
      const swiping = root.hasAttribute("data-swiping");
      // The settings page slides in over the list, and out in a swipe back. The native controls of the list then stay,
      // cut at the left edge of the page (`clip`), as the tab bar of iOS under a view that slides. Else the native bar
      // hides, and the bar of the page shows in its place in a swipe back. The page moves on before the native side gets the new edge, so the cut leads by the last move of the
      // page to the left. An older app cannot cut.
      const page = cuts ? document.querySelector(".page") : null;
      const left = (page && box(page)?.left) || 0;
      const slide = left > 0 ? page : null;
      const clip = slide ? left - Math.max(0, edge - left) : undefined;
      edge = left;
      // The page slides by itself when it opens, and after the finger lifts: the cut follows it on each frame.
      if (slide?.getAnimations().length) schedule();
      // A change of height also moves what comes after it in its parent, as the pull to refresh of the settings
      // (`.pull`). Else the native back button shows while the page still slides back up, and stays too low.
      const moving = document.getAnimations().flatMap((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        if (!target || a.playState !== "running") return [];
        return [a instanceof CSSTransition && a.transitionProperty === "height" ? (target.parentElement ?? target) : target];
      });
      // The list that scrolls around a control: a control in it shows only whole inside it, and not while it scrolls.
      const scroller = (el: Element) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
        }
      };
      // What covers a control of the page, or "" when its native control can show. A control under the sliding page
      // shows when a part of it is at the left of the page.
      const cover = (el: Element) => {
        const r = box(el);
        if (!r) return "no size";
        const under = slide && clip !== undefined && !slide.contains(el) && r.left < clip ? slide : null;
        if (swiping && !under) return "swipe";
        const screen = screens.find((s) => s !== under && !s.contains(el));
        if (screen) return describe(screen);
        const popup = popups.find((p) => meets(p.r, r));
        if (popup) return describe(popup.el);
        const mover = moving.find((t) => t.contains(el));
        if (mover) return `moving ${describe(mover)}`;
        // The tab bar of iOS goes under the keyboard, and its bar keeps the place of the page bar.
        if (keyboard && (el.matches(".tablist") ? r.top > innerHeight / 2 : r.bottom > seen + 1)) return "keyboard";
        // The head of a page stays at the top while its page scrolls (`.page-head` is sticky). Only a pull to refresh moves it.
        const list = el.closest(".page-head") && !document.querySelector(".pull.live") ? undefined : scroller(el);
        const view = list?.getBoundingClientRect();
        // A list under a floating header and over a floating message box, as the conversation of the phone, shows only
        // the part inside its scroll-padding.
        const pad = list && getComputedStyle(list);
        const top = pad && view ? view.top + (parseFloat(pad.scrollPaddingTop) || 0) : 0;
        const end = pad && view ? view.bottom - (parseFloat(pad.scrollPaddingBottom) || 0) : 0;
        if (list && view && (scrolling || r.top < top || r.bottom > end)) return `${scrolling ? "scroll" : "edge"} of ${describe(list)}`;
        return "";
      };
      const free = (el: Element) => (cover(el) ? undefined : box(el));
      const shown: Element[] = []; // The controls of the page that get a native control now.
      const tablist = document.querySelector(".tablist");
      // A style with glass off (src/look.ts) keeps the flat controls of the page: the bar edge to edge, as the bar of iOS
      // floats inset, and the round buttons and the dropdown pills with a line, as the native ones are glass. The
      // switches stay native: the switch of iOS is not glass. Such a style uses no native buttons.
      const flat = root.dataset.glass === "off";
      const bar = tablist && !flat ? free(tablist) : undefined;
      if (tablist && bar) shown.push(tablist);
      const text = getComputedStyle(document.body).color;
      const buttons = flat ? [] : [...document.querySelectorAll<HTMLButtonElement>("[data-native]:not([data-toggle], [data-dropdown])")].flatMap((b) => {
        const r = free(b);
        // A button with no icon of the page (only an SF Symbol or text) needs version 5. An older app keeps the button of
        // the page for it.
        if (!r || (!b.dataset.icon && chromeVersion < 5)) return [];
        shown.push(b);
        // An icon of another color than the text, as the green check of Done, keeps its color.
        const color = getComputedStyle(b.querySelector("svg") ?? b).color;
        const glyph = Number(b.dataset.glyph) || 20;
        const label = b.getAttribute("aria-label") ?? b.title;
        const menu = b.dataset.menu ? (JSON.parse(b.dataset.menu) as ChromeMenuItem[]) : undefined;
        // Version 5 (docs/shell.md): the page gives the text, the SF Symbol, the shape, the colors, the badge and the strong
        // glass with data attributes, so a theme or an agent can change the native button with no new build. An older
        // app reads none of them.
        const d = b.dataset;
        const kit = d.text || d.symbol || d.shape || d.glass || d.color || d.badge || d.prominent !== undefined;
        const v5 = kit && {
          text: d.text,
          symbol: d.symbol,
          shape: d.shape,
          radius: d.radius ? Number(d.radius) : undefined,
          w: r.width,
          h: r.height,
          glass: d.glass,
          color: d.color,
          size: d.text ? parseFloat(getComputedStyle(b).fontSize) : undefined,
          badge: d.badge,
          prominent: d.prominent !== undefined || undefined,
        };
        return [{ id: d.native!, icon: d.icon as IconName | undefined, label, x: r.x, y: r.y, d: r.width, glyph, enabled: !b.disabled, tint: color === text ? undefined : color, menu, ...v5 }];
      });
      // The on and off switches (OnOff in src/Settings.tsx): a real switch of iOS has the glass knob of iOS 26.
      const toggles = [...document.querySelectorAll<HTMLInputElement>("[data-native][data-toggle]")].flatMap((t) => {
        const r = free(t);
        if (!r) return [];
        shown.push(t);
        const label = t.getAttribute("aria-label") ?? "";
        return [{ id: t.dataset.native!, label, x: r.x, y: r.y, w: r.width, h: r.height, on: t.checked, enabled: !t.disabled, tint: getComputedStyle(t).accentColor }];
      });
      // The dropdowns (Dropdown in src/Settings.tsx): a glass pill with a native menu, from version 4 of the native chrome.
      // An older app keeps the pill of the page, with the <select> of WebKit over it.
      const dropdowns =
        chromeVersion < 4 || flat
          ? []
          : [...document.querySelectorAll<HTMLElement>("[data-native][data-dropdown]")].flatMap((d) => {
              const r = free(d);
              if (!r) return [];
              shown.push(d);
              const options = JSON.parse(d.dataset.dropdown!) as { value: string; label: string }[];
              const select = d.querySelector("select");
              // The pills have their own padding in each place, so the native pill takes the padding of the page.
              const css = getComputedStyle(d);
              const px = (v: string) => parseFloat(v) || 0;
              const pad = { left: px(css.paddingLeft), right: px(css.paddingRight), gap: px(css.columnGap), glyph: d.querySelector("svg")?.getBoundingClientRect().width ?? 14 };
              return [{ id: d.dataset.native!, x: r.x, y: r.y, w: r.width, h: r.height, value: d.dataset.value ?? "", options, size: px(css.fontSize), ...pad, enabled: !select?.disabled }];
            });
      // `tint`: the color of the open tab (version 5), from `data-tint` of the tab bar of the page, else the color of the
      // open tab of the page: the accent of the theme (src/app.css), as "rgb(229, 72, 77)".
      const open = tablist?.querySelector("[data-active]");
      const tint = (tablist as HTMLElement | null)?.dataset.tint || (open ? getComputedStyle(open).color : undefined);
      const state = { dark: root.dataset.theme === "dark", tabs, selected, bar: bar && { x: bar.x, y: bar.y, w: bar.width, h: bar.height }, tint, buttons, toggles, dropdowns, clip };
      const json = JSON.stringify(state);
      const names = [...new Set([...tabs.map((t) => t.icon), ...buttons.flatMap((b) => (b.icon ? [b.icon] : []))])].filter((n) => !sent.has(n));
      // React can put a new element in the same place, so an element that is not hidden yet also sends.
      const fresh = shown.some((el) => !el.hasAttribute("data-native-on"));
      if (json === last && !names.length && !fresh) return;
      last = json;
      const icons = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await iconPng(n)] as const)));
      // A control of the page shows again before its native control hides, and waits for its paint: the native side hides
      // at once, and the page paints only after the answer comes back. Else all the dropdowns and switches go for one
      // frame at the start of each scroll.
      const back = [...document.querySelectorAll("[data-native-on]")].filter((el) => !shown.includes(el));
      back.forEach((el) => el.removeAttribute("data-native-on"));
      if (back.length) await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
      let error = "";
      // The version of the native chrome: 2 cuts the controls under a page that slides, 3 has the native attach sheet,
      // 4 has the native dropdowns, 6 has Version on that sheet, and an older app returns true. -1 is a state that the
      // native side could not show.
      const version = await invoke<boolean | number>("native_chrome", { state: JSON.stringify({ ...state, icons }) }).catch((e: unknown) => ((error = ` ${e}`), false));
      // -1: the native side could not show this state, as a field that it cannot read. The page keeps its own controls
      // for it, and sends again on the next change. If the native side drops the state and says yes, the page hides its
      // tab bar and buttons, and nothing shows.
      if (version === -1) {
        document.querySelectorAll("[data-native-on]").forEach((el) => el.removeAttribute("data-native-on"));
        last = "";
        return;
      }
      const on = !!version;
      names.forEach((n) => sent.add(n));
      off = !on;
      const before = chromeVersion;
      chromeVersion = typeof version === "number" ? version : Number(on);
      // The first answer tells the version, so the page sends again with the controls that this version has.
      if (chromeVersion !== before) last = "";
      cuts = chromeVersion >= 2;
      // Version 5 has the native cover of a new load (src/front.ts). The native controls of this page show now, so the
      // cover of the load before it goes away.
      if (chromeVersion >= 5 && !parts.cover) void coverLoad(false);
      parts.cover = chromeVersion >= 5;
      // The bar of iOS has its own place, and the page follows it (`data-native-chrome` in src/app.css).
      root.toggleAttribute("data-native-chrome", on);
      // shortcut: each change of the tab bar goes to call.log, at most 12 times in a page, because an iPhone showed the
      // tab bar with no glass, and the simulator showed the native bar. Take it out when the glass of the tab bar of
      // UIKit shows on the phone.
      const said = !on ? `off${error}` : !tablist ? "no bar" : bar ? `native bar at ${Math.round(bar.y)}` : `page bar under ${cover(tablist)}`;
      if (said !== told && tells++ < 12) {
        told = said;
        void bridgeFetch("/log", { method: "POST", body: `Phone chrome: ${said}; native ${buttons.map((b) => b.id).join(" ")}` }).catch(() => {});
      }
      // Each control of the page hides while its native control shows (`[data-native-on]` in src/app.css).
      document.querySelectorAll("[data-native-on]").forEach((el) => {
        if (!on || !shown.includes(el)) el.removeAttribute("data-native-on");
      });
      if (on) shown.forEach((el) => el.setAttribute("data-native-on", ""));
      if (!last) schedule();
    };
    const schedule = () => {
      if (off || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        queue = queue.then(send, send);
      });
    };
    kick.current = schedule;
    // A native tap: a tab opens at once on the native side, then here.
    (window as { yonderChrome?: (kind: string, id: string, item?: string) => void }).yonderChrome = (kind, id, item) => {
      if (kind === "tab") latest.current.onTab(id);
      if (kind === "menu" && item) menus.get(id)?.(item);
      // The shown one, as a page under another page can have a button with the same name.
      const named = `[data-native="${CSS.escape(id)}"]`;
      if (kind === "button") (document.querySelector<HTMLElement>(`${named}[data-native-on]`) ?? document.querySelector<HTMLElement>(named))?.click();
      // The page sends its state again, also when it did not change, so a native switch that the page refused flips back.
      last = "";
      schedule();
    };
    const move = () => {
      scrolling = true;
      clearTimeout(settle);
      settle = window.setTimeout(() => {
        scrolling = false;
        schedule();
      }, 150);
      schedule();
    };
    document.addEventListener("scroll", move, { capture: true, passive: true });
    document.addEventListener("touchmove", move, { capture: true, passive: true });
    // A dialog or a menu opens in a portal, the keyboard and the theme are attributes of <html>, and a view that slides
    // in moves its buttons until its transition ends. When the finger lifts, a swipe back slides the page on by itself.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    observer.observe(root, { attributes: true, attributeFilter: ["data-keyboard", "data-theme", "data-swiping", "data-native-chrome", "data-glass", "data-look"] });
    const events = ["transitionend", "animationend", "touchend", "touchcancel"] as const;
    events.forEach((e) => document.addEventListener(e, schedule, true));
    visualViewport?.addEventListener("resize", schedule);
    visualViewport?.addEventListener("scroll", schedule);
    addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      events.forEach((e) => document.removeEventListener(e, schedule, true));
      document.removeEventListener("scroll", move, { capture: true });
      document.removeEventListener("touchmove", move, { capture: true });
      clearTimeout(settle);
      visualViewport?.removeEventListener("resize", schedule);
      visualViewport?.removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      off = true;
    };
  }, []);
  // A change of the tabs, the counts, the open tab or a button of the page.
  useEffect(() => kick.current());
}
