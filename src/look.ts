// Screens and styles (docs/ui-themes.md): the screen of the user is the default screen, a sample of src/ui/, or a
// screen of the user's own in ~/.config/yonder/ui/<name>/ on the Mac. A style is data: values for the default screen
// (colors, font, corners, density, glass, talk layout, tabs and words). It cannot break the app: a value that is not
// valid keeps its default. An own screen (`kind: "screen"`) is a page in a sandboxed frame (src/OwnScreen.tsx). The key `ui`
// in localStorage and in phone.json names the screen in use: "terminal" (a sample), "my-terminal" (the newest good
// version) or "my-terminal@2" (one version).
import { useEffect, useState } from "react";
import { bridgeFetch, phone } from "./bridge";
import { syncPhoneConfig } from "./phone-config";
import { swap } from "./names";
import yonder from "./ui/yonder.json";
import dashboard from "./ui/dashboard.json";
import big from "./ui/big.json";
import terminal from "./ui/terminal.json";
import playful from "./ui/playful.json";
import omarchy from "./ui/omarchy.json";
import dashboardPage from "./ui/dashboard.html?raw";
import duet from "./ui/duet.json";
import duetPage from "./ui/duet.html?raw";
import grokBot from "./ui/grok-bot.json";
import grokBotPage from "./ui/grok-bot.html?raw";

export type Look = {
  name: string;
  about?: string;
  kind?: "style" | "screen";
  from?: string;
  theme?: string;
  look?: { light?: Record<string, string>; dark?: Record<string, string>; radius?: number; font?: string; density?: string; glass?: string; bubbles?: boolean; rows?: string; icons?: string; rail?: string };
  talk?: string;
  tabs?: { id: string; title?: string; icon?: string }[];
  copy?: Record<string, string>;
  page?: string;
  tools?: string[];
  abilities?: string[];
};
// One version of a screen of the user, as the bridge lists it (bridge/ui.ts).
export type Version = { n: number; at: number; note?: string; by?: string; bad?: boolean };
export type Mine = { name: string; title: string; about?: string; kind?: string; from?: string; colors?: { light?: Record<string, string | undefined>; dark?: Record<string, string | undefined> }; versions: Version[] };

// The gallery, in its order. Yonder is the default and has no values.
export const SAMPLES: Record<string, Look> = {
  yonder,
  dashboard: { ...(dashboard as Look), page: dashboardPage },
  big,
  terminal,
  omarchy,
  playful,
  duet: { ...(duet as Look), page: duetPage },
  "grok-bot": { ...(grokBot as Look), page: grokBotPage },
};
export const DEFAULT = "yonder";
// The screen with no pick. The window on Omarchy (a page with no Tauri on Linux, docs/omarchy.md) starts on the Omarchy
// style, and the phones and the Mac start on the default.
const HOME = typeof window !== "undefined" && !phone && !("__TAURI_INTERNALS__" in window) && /Linux/.test(navigator.userAgent) ? "omarchy" : DEFAULT;

// The tokens that a style can set: the color variables of src/app.css, and the colors of the call button.
const TOKENS = ["bg", "page", "panel", "hover", "text", "muted", "line", "accent", "accent-text", "green", "red", "amber", "blue", "purple", "live", "call", "call-text"];
const FONTS: Record<string, string> = {
  rounded: 'ui-rounded, "SF Pro Rounded", -apple-system, system-ui, sans-serif',
  serif: 'ui-serif, "New York", Georgia, serif',
  mono: "var(--mono)",
};

const store = {
  get: (k: string) => localStorage.getItem(k),
  set: (k: string, v: string | null) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)),
};

// The screen in use, the screen of the preview, and the screen before the last change (for the shake and Undo).
let using: { id: string; look: Look } = { id: HOME, look: SAMPLES[HOME] };
let trying: { id: string; look: Look } | undefined;
let before: { id: string; at: number } | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
export const onLook = (f: () => void) => (listeners.add(f), () => void listeners.delete(f));

// The look on the screen now: the preview, else the screen in use.
export const shown = () => trying ?? using;
export const lookId = () => using.id;
// A theme other than the default draws its own controls: no native control of iOS and no alert of the system.
export const themed = () => shown().id.split("@")[0] !== DEFAULT;
export const previewing = () => trying?.id;
export function useLook() {
  const [, render] = useState(0);
  useEffect(() => onLook(() => render((n) => n + 1)), []);
  return shown();
}

// A name for an id: "Terminal", "My Chat · v2".
export const nameOf = (id: string, look?: Look) => {
  const [name, n] = id.split("@");
  return `${look?.name ?? SAMPLES[name]?.name ?? name}${n ? ` · v${n}` : ""}`;
};

// The words of the screen by ID (`copy`): title, call, endCall, message. Unknown IDs keep the words of Yonder.
export const copy = (key: string, fallback: string) => {
  const v = shown().look.copy?.[key];
  return typeof v === "string" && v.trim() ? swap(v.slice(0, 40)) : fallback;
};
// The tabs of the bar: with `tabs`, only the listed tabs show, in that order, with their titles. A tab of the Canvas or
// a pinned page is not a value of a style.
export const tabsOf = (ids: string[]) => {
  const list = shown().look.tabs;
  if (!Array.isArray(list) || !list.length) return ids;
  const known = list.map((t) => t?.id).filter((id) => ids.includes(id));
  return known.length ? known : ids;
};
export const tabTitle = (id: string, fallback: string) => {
  const t = shown().look.tabs?.find?.((t) => t?.id === id);
  return typeof t?.title === "string" && t.title.trim() ? swap(t.title.slice(0, 20)) : fallback;
};

// The CSS of a look: its tokens over the light and the dark tokens of src/app.css, and its font. :root:root wins over
// [data-theme="dark"] and over a stylesheet that loads later (the live CSS of src/front.ts).
function css(look: Look) {
  const vars = (o?: Record<string, string>) =>
    Object.entries(o && typeof o === "object" ? o : {})
      .filter(([k, v]) => TOKENS.includes(k) && typeof v === "string" && CSS.supports("color", v))
      .map(([k, v]) => `--${k}:${v};`)
      .join("");
  const font = FONTS[look.look?.font ?? ""];
  return `:root:root{${vars(look.look?.light)}${font ? `--sans:${font};` : ""}}:root:root[data-theme="dark"]{${vars(look.look?.dark)}}`;
}

// Puts a look on the page: the CSS above, and the knobs as attributes of <html> that src/app.css reads.
// shortcut: only a radius of 0 changes the corners (data-sharp). A scale of radii needs a variable on each control.
function paint(look: Look) {
  const root = document.documentElement;
  let style = document.getElementById("look") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "look";
    document.head.append(style);
  }
  style.textContent = css(look);
  const attr = (name: string, on: boolean, value = "") => (on ? root.setAttribute(name, value) : root.removeAttribute(name));
  const density = look.look?.density;
  attr("data-sharp", look.look?.radius === 0);
  attr("data-density", density === "compact" || density === "large", density);
  attr("data-glass", look.look?.glass === "off", "off");
  // The font of the style: mono adds the marks of a terminal to the controls (src/app.css).
  attr("data-font", !!FONTS[look.look?.font ?? ""], look.look?.font);
  attr("data-bubbles", look.look?.bubbles === false, "off");
  attr("data-talk", look.talk === "big", "big");
  attr("data-rows", look.look?.rows === "compact", "compact");
  // Plain icons in the Canvas tab: an icon of the app on a plain tile in place of the icon that an agent drew (Terminal).
  attr("data-icons", look.look?.icons === "plain", "plain");
  // A rail at the left with an icon for All projects and for each starred project, as the servers of Discord.
  attr("data-rail", look.look?.rail === "starred", "starred");
  attr("data-look", true, (trying ?? using).id.split("@")[0]);
}

// A look from its id: a sample, else a screen of the user from the bridge, kept in localStorage so that it shows at the
// start with no network. A screen that the bridge cannot give keeps its copy. With no copy, it is the default.
const cached = (id: string): Look | undefined => {
  try {
    return JSON.parse(store.get(`look:${id}`) ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
};
async function fetchLook(id: string): Promise<Look | undefined> {
  const [name, n] = id.split("@");
  const r = await bridgeFetch(`/ui?name=${encodeURIComponent(name)}${n ? `&n=${n}` : ""}`).catch(() => undefined);
  if (!r?.ok) return undefined;
  // A page larger than 500 KB comes gzipped (/ui in bridge/main.ts), because the relay sends one frame of 1 MiB. The
  // first two bytes of gzip tell it, as a header does not always pass the relay.
  const bytes = new Uint8Array(await r.arrayBuffer());
  const zip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const look = JSON.parse(zip ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text() : new TextDecoder().decode(bytes)) as Look;
  keep(id, look);
  return look;
}
const resolve = (id: string) => SAMPLES[id] ?? cached(id);
// The screen in use from localStorage at the start, before the first render: a theme then never shows the native tab
// bar, buttons and switches of the default screen for a moment.
// The bridge imports this file too, where there is no page.
if (typeof localStorage !== "undefined" && typeof document !== "undefined") {
  const id = store.get("ui") || HOME;
  const look = resolve(id);
  if (look) (using = { id, look }), paint(look);
}
// Keeps one version of each screen of the user for a start with no computer. A page can be 4 MB and localStorage holds
// about 5 MB, so the other versions of that screen go, and a page with no room is not kept.
function keep(id: string, look: Look) {
  const name = id.split("@")[0];
  Object.keys(localStorage)
    .filter((k) => k !== `look:${id}` && (k === `look:${name}` || k.startsWith(`look:${name}@`)))
    .forEach((k) => localStorage.removeItem(k));
  try {
    store.set(`look:${id}`, JSON.stringify(look));
  } catch {
    store.set(`look:${id}`, null);
  }
}

// Loads the screen in use from localStorage (also after a sync of phone.json) and paints it. The newest version of a
// screen of the user comes from the bridge after the paint.
export function loadLook() {
  // There is no Chat sample now: a phone set to it goes back to the default.
  if (store.get("ui") === "chat" && !cached("chat")) store.set("ui", null);
  const id = store.get("ui") || HOME;
  const look = resolve(id);
  if (id !== using.id || look !== using.look) {
    using = { id: look ? id : HOME, look: look ?? SAMPLES[HOME] };
    if (!trying) paint(using.look);
    emit();
  }
  if (!SAMPLES[id])
    void fetchLook(id).then((fresh) => {
      if (!fresh || store.get("ui") !== id || JSON.stringify(fresh) === JSON.stringify(using.look)) return;
      using = { id, look: fresh };
      if (!trying) paint(fresh);
      emit();
    });
}

// Uses a screen: it shows at once, and phone.json gets it. The theme of a style becomes the theme of the app.
export async function pickScreen(id: string, look?: Look) {
  const next = look ?? resolve(id) ?? (await fetchLook(id));
  if (!next) throw new Error(`There is no screen "${id}".`);
  if (look && !SAMPLES[id]) keep(id, look);
  if (id !== using.id) before = { id: using.id, at: Date.now() };
  // A pick of another screen asks again for each phone ability of it (src/OwnScreen.tsx).
  const name = id.split("@")[0];
  if (name !== using.id.split("@")[0]) Object.keys(localStorage).filter((k) => k.startsWith(`allow:${name}:`)).forEach((k) => localStorage.removeItem(k));
  trying = undefined;
  using = { id, look: next };
  store.set("ui", id === HOME ? null : id);
  paint(next);
  syncPhoneConfig();
  emit();
}

// A preview: the screen shows on the real agents, and goes back by itself after 30 seconds with no answer.
let timer: ReturnType<typeof setTimeout> | undefined;
export async function preview(id: string) {
  const look = resolve(id) ?? (await fetchLook(id));
  if (!look) throw new Error(`There is no screen "${id}".`);
  trying = { id, look };
  paint(look);
  clearTimeout(timer);
  timer = setTimeout(endPreview, 30_000);
  emit();
}
export function endPreview(keep = false) {
  clearTimeout(timer);
  const t = trying;
  if (!t) return;
  if (keep) return void pickScreen(t.id, t.look);
  trying = undefined;
  const theme = store.get("theme");
  document.documentElement.dataset.theme =
    theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme ?? document.documentElement.dataset.theme;
  paint(using.look);
  emit();
}

// The change to undo: the screen before the last change, for 10 minutes (the shake and the toast).
export const undoable = () => (before && Date.now() - before.at < 10 * 60_000 ? before.id : undefined);
export const undoScreen = () => before && void pickScreen(before.id).then(() => (before = undefined));

// The toast of the app (App.tsx) for a screen that did not start.
let notify = (_text: string) => {};
export const onNotice = (f: (text: string) => void) => void (notify = f);

// An own screen that did not start: the bridge marks the version as bad, and the screen goes back to the newest good
// version, else to the default (src/OwnScreen.tsx). A toast says so.
export async function failed(id: string, error: string) {
  const [name, n] = id.split("@");
  const title = nameOf(id, shown().look);
  if (SAMPLES[name]) return void pickScreen(HOME).then(() => notify(`${title} did not start. Back on the default screen.`));
  const r = await bridgeFetch("/ui", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "bad", name, n: n ? Number(n) : undefined, error }) }).catch(() => undefined);
  const good = r?.ok ? ((await r.json()) as { good?: number }).good : undefined;
  store.set(`look:${id}`, null);
  await pickScreen(good ? `${name}@${good}` : HOME).catch(() => pickScreen(HOME));
  notify(`${title} did not start. Back on ${good ? `version ${good}` : "the default screen"}.`);
}

// The screens of the user on the computer in use.
export const loadMine = (): Promise<Mine[]> => bridgeFetch("/ui").then((r) => (r.ok ? r.json() : { screens: [] })).then((r) => r.screens ?? []);
const post = (body: object) =>
  bridgeFetch("/ui", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out.error ?? `The bridge answered ${r.status}.`);
    return out;
  });
// Fork: a copy of the screen in use (or of `id`) becomes version 1 of a screen of the user, and it is used at once.
export async function fork(id = shown().id) {
  const look = id === shown().id ? shown().look : resolve(id) ?? (await fetchLook(id));
  const out = (await post({ action: "fork", from: id, look })) as { name: string; n: number; look: Look };
  await pickScreen(out.name, out.look);
  return out.name;
}
// A new name for a screen of the user (bridge/ui.ts). The version with the name comes from the bridge.
export const rename = (name: string, title: string) => post({ action: "rename", name, title });
// Deletes a screen of the user with all its versions. The phone goes back to the default first when it is in use, and
// forgets the copies of it in localStorage.
export async function remove(name: string) {
  if (lookId().split("@")[0] === name) await pickScreen(HOME);
  Object.keys(localStorage).filter((k) => k === `look:${name}` || k.startsWith(`look:${name}@`)).forEach((k) => localStorage.removeItem(k));
  await post({ action: "delete", name });
}
