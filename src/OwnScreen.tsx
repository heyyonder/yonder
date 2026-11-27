// An own screen (docs/screen-api.md): a page of the user or a sample, over the whole default screen, in a sandboxed
// frame. The page reaches Yonder only through `window.yonder`, the SDK below. Each call goes here with postMessage, and
// this host passes it to `yonder` of src/api.ts, the same API as the default screen, with the gates of a page: a tool
// only when `tools` of the screen names it, and a phone ability only when `abilities` names it and the user said yes on
// the phone. The page gets no network, no keys and no storage of the app. A page that does not call `yonder.ready()` in
// 5 seconds, or that throws first, goes back to the newest good version of its screen, else to the default
// (`failed` in src/look.ts).
import { useEffect, useMemo, useRef } from "react";
import { ask as nativeAsk } from "./ask";
import { yonder } from "./api";
import type { Dictation } from "./dictate";
import { KEYS } from "./phone-config";
import { ICONS, KIT_CSS, KIT_NAMED } from "./kit/kit";
import { DEFAULT, failed, type Look } from "./look";
import { byName, word } from "./names";

// The SDK in front of each page: the groups of docs/screen-api.md, and the flat calls of version 1.
const SDK = `<script>(() => {
  const waits = new Map(); const subs = {}; let n = 0;
  const ask = (op, args) => new Promise((ok, no) => { const id = ++n; waits.set(id, [ok, no]); parent.postMessage({ yonder: 2, id, op, args: args || {} }, "*"); });
  const report = (error) => parent.postMessage({ yonder: 2, op: "error", args: { error: String((error && error.message) || error) } }, "*");
  addEventListener("message", (e) => {
    if (e.source !== parent || !e.data || typeof e.data !== "object") return;
    const m = e.data;
    if (m.reply) { const w = waits.get(m.reply); if (w) { waits.delete(m.reply); m.error ? w[1](new Error(m.error)) : w[0](m.value); } }
    else if (m.tokens) { document.getElementById("yonder-tokens").textContent = m.tokens; document.documentElement.dataset.theme = m.theme; (subs.theme || []).forEach((f) => f(m.theme)); }
    else if (m.event) (subs[m.event] || []).forEach((f) => { try { f(m.value); } catch (err) { report(err); } });
  });
  // A text field with the focus tells the app, so the frame follows the keyboard of the phone (src/main.tsx). A check
  // box or a button has no keyboard.
  const field = (e) => !!e && (e.tagName === "TEXTAREA" || e.isContentEditable || (e.tagName === "INPUT" && !/^(checkbox|radio|range|button|submit|reset|file|color|image|hidden)$/.test(e.type)));
  addEventListener("focusin", (e) => field(e.target) && parent.postMessage({ yonder: 2, op: "typing", args: { on: true } }, "*"));
  addEventListener("focusout", (e) => field(e.target) && !field(e.relatedTarget) && parent.postMessage({ yonder: 2, op: "typing", args: { on: false } }, "*"));
  addEventListener("error", (e) => report(e.message));
  addEventListener("unhandledrejection", (e) => report(e.reason));
  const on = (event, f) => { (subs[event] = subs[event] || []).push(f); return () => { subs[event] = subs[event].filter((g) => g !== f); }; };
  const icons = ICONS_JSON;
  const mice = Object.assign(() => ask("mice.list"), {
    list: () => ask("mice.list"), closed: () => ask("mice.closed"), on: (f) => on("mice", f), start: (task, project, images, opts) => ask("mice.start", { task, project, images, opts }),
    send: (id, text, images, opts) => ask("mice.send", { id, text, images, opts }), choices: () => ask("mice.choices"), stop: (id) => ask("mice.stop", { id }), done: (id) => ask("mice.done", { id }),
    close: (id) => ask("mice.close", { id }), rename: (id, name) => ask("mice.rename", { id, name }), avatar: (id, avatar) => ask("mice.avatar", { id, avatar }),
  });
  window.yonder = {
    ready: () => ask("ready"),
    mice,
    people: { list: () => ask("people.list"), scope: () => ask("people.scope"), setScope: (scope) => ask("people.setScope", { scope }) },
    chat: { get: (id) => ask("chat.get", { id }) },
    call: { state: () => ask("call.state"), on: (f) => on("call", f), start: () => ask("call.start"), end: () => ask("call.end"), mute: () => ask("call.mute") },
    dictation: { start: () => ask("dictation.start"), stop: () => ask("dictation.stop"), cancel: () => ask("dictation.cancel"), on: (f) => on("dictation", f) },
    projects: {
      list: () => ask("projects.list"), current: () => ask("projects.current"), select: (path) => ask("projects.select", { path }), on: (f) => on("project", f),
      star: (path, starred) => ask("projects.star", { path, starred }), icon: (path) => ask("projects.icon", { path }),
    },
    usage: { get: () => ask("usage.get") },
    approvals: { list: () => ask("approvals.list"), answer: (id, allow, extra) => ask("approvals.answer", { id, allow, extra }) },
    settings: { get: () => ask("settings.get"), schema: () => ask("settings.schema"), set: (key, value) => ask("settings.set", { key, value }), open: () => ask("settings.open") },
    screen: { list: () => ask("screen.list"), use: (id) => ask("screen.use", { id }), rename: (id, name) => ask("screen.rename", { id, name }) },
    attach: { camera: () => ask("attach.camera"), photo: () => ask("attach.photo"), file: () => ask("attach.file"), paste: () => ask("attach.paste"), location: () => ask("attach.location"), version: () => ask("attach.version") },
    apps: {
      list: () => ask("apps.list"), archived: () => ask("apps.archived"), open: (id) => ask("apps.open", { id }),
      archive: (id) => ask("apps.archive", { id }), restore: (id) => ask("apps.restore", { id }), remove: (id) => ask("apps.remove", { id }),
    },
    phone: { ability: (name, args) => ask("phone.ability", { name, args }) },
    tool: (name, args) => ask("tool", { name, args }),
    word: WORD_JSON,
    theme: () => document.documentElement.dataset.theme,
    icon: (name) => icons[name] || "",
    icons: Object.keys(icons),
    // Version 1.
    mouse: (id) => ask("chat.get", { id }), send: (id, text) => ask("mice.send", { id, text }), start: (task, project) => ask("mice.start", { task, project }),
    done: (id) => ask("mice.done", { id }), close: (id) => ask("mice.close", { id }), on,
    open: (place) => ask(place === "default" ? "screen.use" : "settings.open", { id: "yonder" }),
  };
  // The projects are now workspaces. A screen can call either name.
  window.yonder.workspaces = window.yonder.projects;
  // <y-projects>: the project switcher of the kit, the same as the title of the default screen. The pill shows the
  // project of the screen with two small arrows, and a tap opens the projects over the whole page: All projects, the
  // starred projects, then the others under a line. A tap on a project picks it, and a tap on the pill goes back.
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => "&#" + c.charCodeAt(0) + ";");
  const P = window.yonder.projects;
  const pic = (img, path) => P.icon(path).then((src) => { if (src) { img.src = src; img.hidden = false; } }, () => {});
  const withIcons = (el) => el.querySelectorAll("img[data-icon]").forEach((img) => pic(img, img.dataset.icon));
  const pill = (open) => '<button class="y-pill" aria-expanded="' + open + '" aria-label="Workspace: ' + esc(cur.name) + '">' + (cur.path === "*" ? "" : '<img hidden alt="" data-icon="' + esc(cur.path) + '">') + "<span>" + esc(cur.path === "*" ? "All workspaces" : cur.name) + "</span>" + icons.chevrons + "</button>";
  // The project and the open page live outside the element, because a page often draws its header again, and each
  // draw makes a new element.
  let cur = { name: "All workspaces", path: "*" }, page = null, started = false;
  const pills = new Set();
  const drawAll = () => pills.forEach((el) => el.draw());
  const close = () => (page && page.remove(), (page = null));
  const fill = async () => {
    const [list, mice] = await Promise.all([P.list().catch(() => []), window.yonder.mice.list().catch(() => [])]);
    if (!page) return;
    const live = (p) => mice.some((m) => m.project === p.name && m.status === "running");
    const rest = list.find((p) => !p.pinned && !p.starred);
    const row = (p) => '<div class="y-prow' + (p.path === cur.path ? " y-on" : "") + (p === rest ? " y-rest" : "") + '"' + (p === rest ? ' data-rest="1"' : "") + '><button class="y-pick" data-path="' + esc(p.path) + '">' +
      (p.path === "*" ? icons.folder : '<img hidden alt="" data-icon="' + esc(p.path) + '">') + '<span class="y-pname">' + esc(p.name) + "</span>" + (live(p) ? '<i class="y-dot"></i>' : "") + "</button>" +
      (p.path === "*" || p.pinned ? "" : '<button class="y-star' + (p.starred ? " y-starred" : "") + '" data-star="' + esc(p.path) + '" aria-label="Star ' + esc(p.name) + '">' + icons.star + "</button>") + "</div>";
    page.lastChild.innerHTML = [{ name: "All workspaces", path: "*" }, ...list].map(row).join("");
    withIcons(page.lastChild);
    find();
  };
  // The search over the list, as the search of the Projects tab. A search hides the line over the others.
  const find = () => {
    const q = page.querySelector("input").value.trim().toLowerCase();
    page.querySelectorAll(".y-prow").forEach((r) => ((r.hidden = !r.textContent.toLowerCase().includes(q)), r.classList.toggle("y-rest", !q && r.dataset.rest === "1")));
  };
  const open = () => {
    if (page) return;
    page = document.createElement("div");
    page.className = "y-projects-page";
    page.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.classList.contains("y-pill")) return close();
      if (b.dataset.star) {
        const on = !b.classList.contains("y-starred");
        b.classList.toggle("y-starred", on);
        return P.star(b.dataset.star, on).then(fill, fill);
      }
      if (b.dataset.path) (close(), P.select(b.dataset.path));
    };
    page.innerHTML = '<div class="y-bar">' + pill(true) + '</div><div class="y-ptools"><input class="y-field" placeholder="Search" aria-label="Search projects"></div><div class="y-scroll"></div>';
    page.querySelector("input").oninput = find;
    withIcons(page.firstChild);
    document.body.append(page);
    fill();
  };
  if (window.customElements) window.customElements.define("y-projects", class extends HTMLElement {
    connectedCallback() {
      pills.add(this);
      this.draw();
      this.onclick = (e) => e.target.closest(".y-pill") && open();
      if (started) return;
      started = true;
      P.current().then((p) => ((cur = p), drawAll()), () => {});
      P.on((p) => ((cur = p), close(), drawAll()));
    }
    disconnectedCallback() { pills.delete(this); }
    draw() { this.innerHTML = pill(false); withIcons(this); }
  });
})();</script>`;
// The page gets no network: only its own inline code, inline styles, and pictures as data URLs.
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:">`;
const TOKENS = ["bg", "page", "panel", "hover", "text", "muted", "line", "accent", "accent-text", "green", "red", "amber", "blue", "purple", "live", "call", "call-text", "sans", "mono"];

// Each call of a page, to the same API as the default screen. `look` is the screen of the page, for its gates, and
// `emit` sends an event to the page.
type Ctx = { look: Look; id: string; emit: (event: string, value: unknown) => void };
// The dictation of the page in front, as a promise, so a stop that comes before the microphone opens waits for it.
let heard: Promise<Dictation> | undefined;
const dropDictation = () => {
  heard?.then((d) => d.cancel(), () => {});
  heard = undefined;
};
const gate = async (c: Ctx, ability: string) => {
  if (!c.look.abilities?.includes(ability)) throw new Error(`This screen may not use ${ability}. Add it to "abilities" in its screen.json.`);
  const key = `allow:${c.id.split("@")[0]}:${ability}`;
  if (localStorage.getItem(key) === null) {
    const text = `${c.look.name} asks to use ${ability.replace("_", " ")} of this phone. It asks again after you pick it again.`;
    const yes = await nativeAsk(text, { title: `Allow ${c.look.name}?`, okLabel: "Allow", cancelLabel: "Don't allow" }).catch(() => confirm(text));
    localStorage.setItem(key, yes ? "yes" : "no");
  }
  if (localStorage.getItem(key) !== "yes") throw new Error(`The user did not allow ${ability} for this screen.`);
};
// The paths of the files that a page attached with yonder.attach: a list of strings, else none.
const paths = (v: unknown) => (Array.isArray(v) ? v.filter((p): p is string => typeof p === "string").slice(0, 20) : []);
const OPS: Record<string, (a: Record<string, any>, c: Ctx) => Promise<unknown>> = {
  "mice.list": () => yonder.mice.list(),
  "people.list": () => yonder.people.list(),
  "people.scope": async () => yonder.people.scope(),
  "people.setScope": async (a) => yonder.people.setScope(a.scope === "all" ? "all" : "mine"),
  "mice.closed": () => yonder.mice.closed(),
  "mice.start": (a) => yonder.mice.start(String(a.task), a.project ? String(a.project) : "", paths(a.images), a.opts ?? {}),
  "mice.send": (a) => yonder.mice.send(String(a.id), String(a.text), paths(a.images), a.opts ?? {}),
  "mice.choices": () => yonder.mice.choices(),
  "mice.stop": (a) => yonder.mice.stop(String(a.id)),
  "mice.done": (a) => yonder.mice.done(String(a.id)),
  "mice.close": (a) => yonder.mice.close(String(a.id)),
  "mice.rename": (a) => yonder.mice.rename(String(a.id), String(a.name)),
  // The bridge checks the shape and the color.
  "mice.avatar": (a) => yonder.mice.avatar(String(a.id), { shape: String(a.avatar?.shape ?? ""), color: String(a.avatar?.color ?? "") }),
  "chat.get": async (a) =>
    (await yonder.chat.get(String(a.id))).filter((t) => ["user", "assistant", "tool"].includes(t.who)).map((t) => ({ who: t.who, text: String(t.text ?? "").slice(0, 4000) })),
  "call.state": () => yonder.call.state(),
  "call.start": () => yonder.call.start(),
  "call.end": () => yonder.call.end(),
  "call.mute": () => yonder.call.mute(),
  // Speech to text: the words so far come as `dictation` events, and the stop gives the whole text.
  "dictation.start": async (_, c) => {
    dropDictation();
    await (heard = gate(c, "dictation").then(() => yonder.dictation.start((text) => c.emit("dictation", { text }), (error) => c.emit("dictation", { error }))));
    return null;
  },
  "dictation.stop": async () => {
    const d = heard;
    heard = undefined;
    const text = d ? await (await d).stop() : "";
    // shortcut: the sound of an offline computer is lost here; give it to the outbox (src/bridge.ts), as the prompt box
    // of the default screen does, when a page needs it.
    if (typeof text !== "string") throw new Error("The computer is offline, so the words did not come.");
    return text;
  },
  "dictation.cancel": async () => (dropDictation(), null),
  "projects.list": () => yonder.projects.list(),
  "projects.current": () => yonder.projects.current(),
  "projects.select": (a) => yonder.projects.select(String(a.path ?? "*")),
  "projects.star": (a) => yonder.projects.star(String(a.path), !!a.starred),
  "projects.icon": (a) => yonder.projects.icon(String(a.path)),
  "usage.get": () => yonder.usage.get(),
  "approvals.list": () => yonder.approvals.list(),
  "approvals.answer": (a) => yonder.approvals.answer(String(a.id), !!a.allow, a.extra ?? {}),
  "settings.get": () => yonder.settings.get(),
  "settings.schema": () => yonder.settings.schema(),
  // A page changes only the settings of the phone (the theme, the fonts and the others of phone.json), not the
  // settings of the computer, such as the permission mode of new agents.
  "settings.set": (a) => {
    if (!KEYS.includes(String(a.key))) throw new Error(`A screen cannot change ${String(a.key)}.`);
    return yonder.settings.set(String(a.key), a.value ?? null);
  },
  "settings.open": () => yonder.settings.open(),
  "screen.list": () => yonder.screen.list(),
  "screen.use": (a) => yonder.screen.use(String(a.id ?? DEFAULT)),
  "screen.rename": (a) => yonder.screen.rename(String(a.id ?? ""), String(a.name ?? "")),
  "apps.list": () => yonder.apps.list(),
  "apps.open": (a) => yonder.apps.open(String(a.id)),
  "attach.camera": () => yonder.attach.camera(),
  "attach.photo": () => yonder.attach.photo(),
  "attach.file": () => yonder.attach.file(),
  "attach.paste": () => yonder.attach.paste(),
  "attach.location": () => yonder.attach.location(),
  "attach.version": () => yonder.attach.version(),
  "apps.archived": () => yonder.apps.archived(),
  "apps.archive": (a) => yonder.apps.archive(String(a.id)),
  "apps.restore": (a) => yonder.apps.restore(String(a.id)),
  // A delete forever asks the user first, as on the Canvas tab: the page cannot remove an app by itself.
  "apps.remove": async (a) => {
    const all = (await yonder.apps.list()).concat(await yonder.apps.archived());
    const title = all.find((x) => x.id === String(a.id))?.title ?? "This app";
    const yes = await nativeAsk(`${title} and its files go from this computer.`, { title: "Delete forever?", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" }).catch(() => confirm(`Delete ${title} forever?`));
    if (!yes) throw new Error("The user kept the app.");
    return yonder.apps.remove(String(a.id));
  },
  "phone.ability": async (a, c) => (await gate(c, String(a.name)), yonder.phone.ability(String(a.name), a.args ?? {})),
  tool: async (a, c) => {
    if (!c.look.tools?.includes(a.name)) throw new Error(`This screen may not call ${a.name}. Add it to "tools" in its screen.json.`);
    return yonder.tool(String(a.name), a.args ?? {});
  },
};

// Puts the head of Yonder into a page: into its <head> when it has one, else in front of it.
const withHead = (page: string, head: string) => {
  const at = page.search(/<head[^>]*>/i);
  if (at < 0) return `<!doctype html><html><head>${head}</head><body>${page}</body></html>`;
  const end = page.indexOf(">", at) + 1;
  return page.slice(0, end) + head + page.slice(end);
};

// The color tokens of the screen now: the look in use over the light or the dark tokens of src/app.css. With them goes
// the space of the home bar in px, as `--under`: the frame goes under the home bar (.own-screen in src/app.css), and a
// page cannot read a safe area inside a frame.
const tokens = () => {
  const style = getComputedStyle(document.documentElement);
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;height:var(--under, 0px)";
  document.body.append(probe);
  const under = probe.offsetHeight;
  probe.remove();
  return `:root{${TOKENS.map((t) => [t, style.getPropertyValue(`--${t}`).trim()]).filter(([, v]) => v).map(([t, v]) => `--${t}:${v};`).join("")}--under:${under}px;color-scheme:${theme()}}`;
};
const theme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const typing = (on: boolean) => void document.documentElement.toggleAttribute("data-frame-typing", on);

export function OwnScreen({ id, look, mode }: { id: string; look: Look; mode: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const post = (m: object) => frame.current?.contentWindow?.postMessage(m, "*");
  const ctx = useRef<Ctx>({ id, look, emit: () => {} });
  ctx.current = { id, look, emit: (event, value) => post({ event, value }) };
  // The tokens of the look in use, the kit, and the SDK, so a page follows the theme and looks like Yonder.
  const doc = useMemo(() => {
    // The page knows the look with data-theme on its <html> and the tokens, and both change live (the effect below).
    const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">${CSP}<script>document.documentElement.dataset.theme=${JSON.stringify(theme())}</script><style id="yonder-tokens">${tokens()}</style><style>${KIT_CSS}${byName() ? KIT_NAMED : ""}</style>${SDK.replace("ICONS_JSON", JSON.stringify(ICONS)).replace("WORD_JSON", JSON.stringify({ one: word.one, many: word.many, One: word.One, Many: word.Many, naming: word.naming }))}`;
    return withHead(look.page ?? "", head);
  }, [id, look.page]);

  useEffect(() => {
    ready.current = false;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.yonder) return;
      const { id: reply, op, args } = e.data as { id?: number; op: string; args?: Record<string, any> };
      if (op === "error") {
        console.error(`screen ${id}: ${args?.error}`);
        if (!ready.current) void failed(id, String(args?.error ?? "error"));
        return;
      }
      if (op === "ready") return (ready.current = true), post({ reply, value: null });
      // A text field of the page took or lost the focus. The focus events of the app run the keyboard code of
      // src/main.tsx, as for a field of the app: the frame then covers only the part over the keyboard (app.css).
      if (op === "typing") return void (typing(!!args?.on), dispatchEvent(new FocusEvent(args?.on ? "focusin" : "focusout")));
      const run = OPS[op] ?? (() => Promise.reject(new Error(`yonder has no ${op}.`)));
      run(args ?? {}, ctx.current).then(
        (value) => post({ reply, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) }),
        (err) => post({ reply, error: (err as Error)?.message ?? String(err) }),
      );
    };
    addEventListener("message", onMessage);
    // The changes of the agents (`mice`) and the call go to the page as events.
    const offMice = yonder.mice.on((value) => post({ event: "mice", value }));
    // A call takes the microphone from a dictation.
    const offCall = yonder.call.on((value) => (post({ event: "call", value }), value.phase !== "idle" && dropDictation()));
    const offProject = yonder.projects.on((value) => post({ event: "project", value }));
    const timer = setTimeout(() => ready.current || void failed(id, "The page did not call yonder.ready() in 5 seconds."), 5000);
    // A page that goes away with the keyboard open leaves no typing behind for the default screen.
    return () => (removeEventListener("message", onMessage), offMice(), offCall(), offProject(), clearTimeout(timer), dropDictation(), typing(false));
  }, [id, doc]);

  // A switch of light and dark, and a new accent of the Color row (applyAccent in src/Settings.tsx), reach the page with
  // no reload. The app sets data-theme in its own effect after this one, so the tokens wait one frame.
  useEffect(() => {
    const send = () => frame.current?.contentWindow?.postMessage({ tokens: tokens(), theme: theme() }, "*");
    const f = requestAnimationFrame(send);
    addEventListener("accent", send);
    // The keyboard covers the home bar, so `--under` is 0 while it shows (app.css), and the page gets it again.
    const keyboard = new MutationObserver(send);
    keyboard.observe(document.documentElement, { attributeFilter: ["data-keyboard"] });
    return () => (cancelAnimationFrame(f), removeEventListener("accent", send), keyboard.disconnect());
  }, [mode]);

  return <iframe ref={frame} className="own-screen" title={look.name} sandbox="allow-scripts" srcDoc={doc} />;
}

