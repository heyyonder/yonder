// The Canvas tab (docs/canvas.md): the pages that the agents and the voice agent make for the user (artifacts), each
// one an app with a small icon, and the approvals that the agents ask for (ask_user in bridge/main.ts).
// A page comes from the bridge through /media, as a picture, so the phone loads it through the encrypted link and keeps it
// in its cache. It shows in a frame with `sandbox="allow-scripts"` and no `allow-same-origin`: it cannot read the app, its
// keys or the other pages, and it gets no native ability (App Review Guideline 4.7.2).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import { bridgeFetch, openLink, phone, useBridgeSrc, type Worker } from "./bridge";
import { Icon, PATHS, type IconName } from "./icons";

type Fetch = (path: string, init?: RequestInit) => Promise<Response>;
// An artifact as /canvas gives it: `path` is the file of its newest version, `num` and `name` are its agent, and `call`
// the voice call that made it.
// `icon`: an SVG or an emoji that its agent drew, or the choice of the user: the name of an icon of the app, or a picture
// as a data URL. `saved`: the user keeps it, so it never goes to the archive by itself.
// `archived`: the time when it went to the archive, at the bottom of the Canvas tab. Its files stay on the computer.
export type Artifact = { id: string; title: string; versions: number; at: number; createdAt: number; path: string; worker?: string; call?: string; num?: number; name?: string; icon?: string; saved?: boolean; archived?: number };
// A page to show: the file of one version, with its title. `far` loads it from another computer of the phone. A site of
// the Mac has its address as its path, such as http://localhost:5173 (isSite).
export type Page = { path: string; title: string; owner?: string; far?: Fetch };
const isSite = (page: Page) => /^https?:\/\//.test(page.path);

// The list of each computer, so a chat finds the title of a page at once. A rename, a save or a delete changes it at once
// (changeCanvas), before the bridge answers, and each list on the screen follows.
const lists = new Map<Fetch, Artifact[]>();
const changed = new Set<() => void>();
// The apps that the user deleted (`page/<id>`, `site/<label>` or `site/<mac>/<label>`), with the time until each load
// leaves them out: no end while the bridge works, then 10 s after its yes. So a load that started before the delete does
// not bring the row back. A failed delete takes the app out of the map, and the row comes back.
const gone = new Map<string, number>();
export const goneApp = (key: string, until = Infinity) => void (until ? gone.set(key, until) : gone.delete(key));
export const isGone = (key: string) => {
  const until = gone.get(key);
  if (until !== undefined && Date.now() > until) gone.delete(key);
  return gone.has(key);
};
// An archive or a restore that the bridge has not confirmed yet, by the id of the page, with the same end as `gone`. So a
// load that started before the swipe does not move the row back.
const held = new Map<string, { archived?: number; until: number }>();
export const holdApp = (id: string, archived?: number, until = Infinity) => void (until ? held.set(id, { archived, until }) : held.delete(id));
const heldOf = (a: Artifact) => {
  const h = held.get(a.id);
  if (h && Date.now() > h.until) held.delete(a.id);
  return held.has(a.id) ? { ...a, archived: h!.archived } : a;
};
// An undo brings the deleted apps back at once.
export const forgetGone = () => (gone.clear(), held.clear(), changed.forEach((f) => f()));
export const changeCanvas = (change: (list: Artifact[]) => Artifact[], get: Fetch = bridgeFetch) => {
  lists.set(get, change(lists.get(get) ?? []));
  changed.forEach((f) => f());
};
const loading = new Map<Fetch, Promise<void>>();
const load = (get: Fetch) => {
  if (!loading.has(get))
    loading.set(
      get,
      get("/canvas?all")
        .then((r) => (r.ok ? r.json() : []))
        .then((l: Artifact[]) => void lists.set(get, l.filter((a) => !isGone(`page/${a.id}`)).map(heldOf)), () => {})
        .finally(() => loading.delete(get)),
    );
  return loading.get(get)!;
};
// The artifacts of a computer, the newest first, again each `every` ms while `on`. A bridge from before the Canvas
// answers 403, so the list stays empty.
export function useCanvas(on: boolean, get: Fetch = bridgeFetch, every = 5000) {
  const [list, setList] = useState(lists.get(get) ?? []);
  const from = useRef(get);
  from.current = get;
  useEffect(() => {
    if (!on) return;
    const again = () => {
      const g = from.current;
      if (document.visibilityState === "visible") void load(g).then(() => setList(lists.get(g) ?? []));
    };
    again();
    const timer = setInterval(again, every);
    const now = () => setList(lists.get(from.current) ?? []);
    changed.add(now);
    return () => (clearInterval(timer), void changed.delete(now));
  }, [on, every]);
  return list;
}

// The icon of an app: the SVG or the emoji that its agent drew, else the first letter of its name on the accent of the
// theme, as Terminal gives a green box. An SVG shows as a picture, so its scripts never run, and its CSS animations play. `children`: a
// favicon of a site. The choice of the user wins in each style: an icon of the app on a plain tile, or a picture. A style
// with plain icons (`"icons": "plain"`, as Terminal) shows the icon of `appGlyph` on a plain tile in place of the drawn
// icon and the letter, through the CSS.
export function AppIcon({ icon, name, live, children }: { icon?: string; name: string; live?: boolean; children?: ReactNode }) {
  const picked = !!icon && Object.hasOwn(PATHS, icon);
  const picture = !!icon?.startsWith("data:image/");
  const svg = icon?.startsWith("<");
  return (
    <span className="app-icon" data-plain={picked || undefined}>
      {picture ? (
        <img className="picture" src={icon} alt="" />
      ) : picked ? null : svg ? (
        // An SVG as a picture needs its xmlns, which an agent can leave out.
        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(/\sxmlns=/.test(icon!) ? icon! : icon!.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"'))}`} alt="" />
      ) : (
        <b>{icon || ([...name.trim()][0]?.toUpperCase() ?? "?")}</b>
      )}
      {!picture && (
        <span className="app-glyph">
          <Icon name={picked ? (icon as IconName) : appGlyph(name)} size={24} />
        </span>
      )}
      {!icon && children}
      {live && <i className="app-live" aria-label="Tunnel on" />}
    </span>
  );
}

// The icons that the user can pick for an app, in the order of the picker.
export const APP_GLYPHS = ("app doc chart trend table calendar clock map globe weather house building cart card wallet users user message mail " +
  "phone camera image film music mic book palette grid smartphone monitor code terminal database server bot flask bug cog wrench rocket " +
  "zap heart star gift utensils coffee car plane dumbbell leaf game school news todo target trophy sofa box shapes").split(" ") as IconName[];
// The words of each icon: a name with one of them picks the icon (the first word of the name with an icon wins, and a
// name with none gets "app"), and the search of the picker finds the icon by them.
const TAGS: Partial<Record<IconName, string>> = {
    doc: "doc docs document report note notes text plan readme wiki brief spec summary letter",
    chart: "chart stat stats analytics metric metrics dashboard kpi usage",
    trend: "trend growth revenue sale sales mrr",
    table: "table sheet spreadsheet data csv comparison compare vs",
    calendar: "calendar schedule event events date week month agenda booking",
    clock: "time timer clock hour deadline",
    map: "map route trip location place",
    globe: "web site website internet world landing domain seo browser",
    weather: "weather forecast rain temperature sun",
    house: "home house rental airbnb apartment floor",
    building: "office company business",
    cart: "shop store cart buy amazon order shopping product",
    card: "pay payment billing stripe invoice checkout subscription",
    wallet: "money budget finance expense cost price pricing bank tax",
    users: "team people users residents community customer customers family friends contacts lead leads",
    user: "profile account person resume bio cv",
    message: "chat message messages talk comment comments reply conversation sms imessage whatsapp",
    mail: "email mail inbox newsletter outreach",
    phone: "call calls voip voicemail",
    camera: "photo photos camera selfie",
    image: "image images picture pictures gallery poster thumbnail",
    film: "video videos movie film reel reels clip clips youtube tiktok",
    music: "music song songs audio sound track album playlist dj",
    mic: "voice podcast mic record recording speech",
    book: "book guide read story manual",
    palette: "brand branding design color colors theme style logo logos font fonts",
    grid: "grid apps mockup mockups layout screens",
    smartphone: "mobile iphone ios android",
    monitor: "mac desktop screen monitor display window",
    code: "code api dev script json html css react diff",
    terminal: "terminal cli shell command bash log logs",
    database: "database db sql storage cache backup",
    server: "server deploy host hosting cloud infra relay bridge",
    bot: "agent agents ai bot llm claude",
    flask: "test tests lab experiment check",
    bug: "bug bugs debug error errors fix crash issue issues sentry",
    cog: "settings config setup option options",
    wrench: "tool tools repair renovation",
    rocket: "launch release startup ship roadmap",
    zap: "fast speed power energy electric performance",
    heart: "health love care like wellness",
    star: "favorite review reviews rating ratings best top",
    gift: "gift birthday present christmas",
    utensils: "food meal meals recipe recipes restaurant menu kitchen cook dinner lunch",
    coffee: "coffee cafe",
    car: "car drive tesla parking vehicle",
    plane: "flight flights plane travel airport vacation",
    dumbbell: "fitness gym workout exercise sport",
    leaf: "plant plants garden nature eco",
    game: "game games play snake gaming puzzle",
    school: "school learn learning course study teach lesson class explainer explainers",
    news: "news article blog post posts digest",
    todo: "todo todos task tasks checklist list",
    target: "goal goals target ads ad campaign focus keyword keywords",
    trophy: "win award leaderboard score prize",
    sofa: "sofa furniture couch living interior",
    box: "3d model models package box print printer shipping delivery",
    shapes: "shape shapes vector svg icon icons illustration drawing art sketch figma",
};
const WORDS: Record<string, IconName> = Object.fromEntries(Object.entries(TAGS).flatMap(([glyph, words]) => words!.split(" ").map((w) => [w, glyph as IconName])));
export function appGlyph(name: string): IconName {
  for (const w of name.toLowerCase().split(/[^a-z0-9]+/)) {
    const hit = WORDS[w] ?? WORDS[w.replace(/s$/, "")];
    if (hit) return hit;
  }
  return "app";
}

// A picture that the user uploads as the icon of an app: the middle square, at 128 px, as a PNG, or as a JPEG when the
// PNG is larger than 60 KB, as a photo is. The phones get the icons in each load of the list, so the picture stays small.
async function pictureOf(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const [w, h] = [image.naturalWidth || 128, image.naturalHeight || 128];
    const side = Math.min(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    canvas.getContext("2d")!.drawImage(image, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 128, 128);
    const png = canvas.toDataURL("image/png");
    return png.length <= 60_000 ? png : canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The icon picker of an app, from Change icon in its menu: a search, the icons of the app, Upload for a picture, and
// Generate, which asks the agent of a page to draw a new icon. It is the card from the bottom edge of Picker, on the
// phone and on the Mac. The search finds an icon by its name and its words (TAGS), and Enter picks the
// first one. A pick closes it.
export function IconPicker({ name, onPick, onDraw, onClose }: { name: string; onPick: (icon: string) => void; onDraw?: () => void; onClose: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const pick = (icon: string) => (onPick(icon), onClose());
  const q = query.trim().toLowerCase();
  const found = q ? APP_GLYPHS.filter((g) => `${g} ${TAGS[g] ?? ""}`.split(" ").some((w) => w.startsWith(q))) : APP_GLYPHS;
  const body = (
    <>
      {/* The keyboard of the phone opens only at a tap in the field, as in the search of the Canvas tab. */}
      <input
        className="icon-search"
        type="search"
        placeholder="Search"
        aria-label="Search the icons"
        autoFocus={!phone}
        enterKeyHint="done"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && found[0] && pick(found[0])}
      />
      <div className="icon-grid">
        {found.map((g) => (
          <button key={g} className="app-icon" data-plain aria-label={g} onClick={() => pick(g)}>
            <span className="app-glyph">
              <Icon name={g} size={24} />
            </span>
          </button>
        ))}
      </div>
      <div className="icon-actions">
        {onDraw && <button onClick={() => (onDraw(), onClose())}>Generate</button>}
        <button onClick={() => file.current?.click()}>Upload</button>
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) pictureOf(f).then(pick, onClose);
        }}
      />
    </>
  );
  return (
    <Picker label={`The icon of ${name}`} className="icon-picker" onClose={onClose}>
      {body}
    </Picker>
  );
}

// A picker with a search: the card of an approval from the bottom edge (Approval), on the phone and on the Mac. The
// icon picker of an app and Move to of an agent (MovePicker in src/App.tsx) use it. Yonder has no modal dialogs, also
// on the Mac.
export function Picker({ label, className, onClose, children }: { label: string; className: string; onClose: () => void; children: ReactNode }) {
  // On the phone the sheet takes the focus when it opens, not the search, so the keyboard stays down. On the Mac the
  // search takes it.
  const sheet = useRef<HTMLDivElement>(null);
  return (
    <Drawer.Root open onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Backdrop className="attach-backdrop" />
        <Drawer.Viewport className="attach-viewport">
          <Drawer.Popup ref={sheet} initialFocus={phone ? sheet : undefined} className={`attach-sheet approval ${className}`} aria-label={label}>
            <div className="attach-handle" />
            {children}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// The screen of this device for the agents, in each /show poll: the window, the pixel ratio, the safe areas (top, right,
// bottom, left), the frame of the viewer of an app, and the look, as "402x874@3;62,0,34,0;402x726;dark". The viewer puts
// its frame under Save and Close (52 px) and over the safe area at the bottom.
let probe: HTMLDivElement | undefined;
export function screenOf() {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.append(probe);
  }
  const p = getComputedStyle(probe);
  const safe = [p.paddingTop, p.paddingRight, p.paddingBottom, p.paddingLeft].map((v) => Math.round(parseFloat(v) || 0));
  const [w, h] = [innerWidth, innerHeight];
  const frame = [w - safe[1] - safe[3], h - safe[0] - 52 - safe[2]];
  return `${w}x${h}@${Math.round(devicePixelRatio * 100) / 100};${safe.join(",")};${frame.join("x")};${document.documentElement.dataset.theme === "dark" ? "dark" : "light"}`;
}
// The id and the version of a page, from its path: …/canvas/<id>/<version>.html.
export const pageOf = (path: string) => {
  const m = path.match(/[/\\]canvas[/\\]([^/\\]+)[/\\](\d+)\.html$/);
  return m ? { id: m[1], version: Number(m[2]) } : undefined;
};

// The colors of the app go into each page as CSS variables, with the light or the dark look, so a page that uses them
// follows the look. The colors of the body have no weight (:where), so a page that sets its own wins, and the background
// of its body still fills the frame. A link opens in the browser of the phone: the frame cannot open it, so it asks the app.
const TOKENS = ["bg", "panel", "hover", "text", "muted", "line", "accent", "accent-text", "green", "red", "amber", "blue", "purple"];
const LINKS = `addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(a&&/^https?:/.test(a.href)){e.preventDefault();parent.postMessage({yonderOpen:a.href},"*")}},true)`;
// A text field with the focus tells the app, so the viewer follows the keyboard of the phone (src/main.tsx), as the frame
// of an own screen does (OwnScreen.tsx). A check box or a button has no keyboard.
const TYPING = `(function(){var f=function(e){return!!e&&(e.tagName==="TEXTAREA"||e.isContentEditable||(e.tagName==="INPUT"&&!/^(checkbox|radio|range|button|submit|reset|file|color|image|hidden)$/.test(e.type)))};addEventListener("focusin",function(e){f(e.target)&&parent.postMessage({yonderTyping:true},"*")});addEventListener("focusout",function(e){f(e.target)&&!f(e.relatedTarget)&&parent.postMessage({yonderTyping:false},"*")})})()`;
// The colors and the look of the screen now, for a page in the viewer and for the still of its card (bridge/shot.ts).
function lookNow() {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  return { vars: TOKENS.map((t) => `--${t}:${css.getPropertyValue(`--${t}`).trim()}`).join(";"), dark: root.dataset.theme === "dark" };
}
function withLook(html: string) {
  const { vars, dark } = lookNow();
  const head =
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${vars};color-scheme:${dark ? "dark" : "light"}}` +
    `:where(body){background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-text-size-adjust:100%}</style><script>${LINKS};${TYPING}</script>`;
  // The head goes after the doctype of the page: a tag before the doctype would put the page in quirks mode.
  const doctype = html.match(/^\s*<!doctype[^>]*>/i)?.[0];
  return doctype ? doctype + head + html.slice(doctype.length) : `<!doctype html>${head}${html}`;
}
// The page of each frame, so a message of a page goes to the computer of the page. A page sends a change to its computer
// with { yonderSend }, and gets { yonderSent, ok } back, so it can undo its change on the screen when the send fails.
const framed = new WeakMap<HTMLIFrameElement, Page>();
// The focus events of the app run the keyboard code of src/main.tsx, as for a field of the app: the viewer then covers
// only the part over the keyboard (app.css).
const typing = (on: boolean) => (document.documentElement.toggleAttribute("data-frame-typing", on), dispatchEvent(new FocusEvent(on ? "focusin" : "focusout")));
addEventListener("message", (e) => {
  const data = e.data as { yonderOpen?: unknown; yonderSend?: unknown; yonderTyping?: unknown } | null;
  const frame = [...document.querySelectorAll<HTMLIFrameElement>("iframe.artifact")].find((f) => f.contentWindow === e.source);
  const page = frame && framed.get(frame);
  if (!frame || !data) return;
  if (typeof data.yonderOpen === "string" && /^https?:\/\//.test(data.yonderOpen)) void openLink(data.yonderOpen);
  if (typeof data.yonderTyping === "boolean") typing(data.yonderTyping);
  if (page && "yonderSend" in data) {
    const message = data.yonderSend;
    const reply = (ok: boolean) => frame.contentWindow?.postMessage({ yonderSent: message, ok }, "*");
    (page.far ?? bridgeFetch)("/canvas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: page.path, message }) }).then(
      (r) => reply(r.ok),
      () => reply(false),
    );
  }
});

// The HTML of a page. The phone keeps the file of a chat until its agent closes (`owner`), as a picture.
function useHtml({ path, owner, far }: Omit<Page, "title">) {
  const src = useBridgeSrc(`/media?path=${encodeURIComponent(path)}&v=1`, owner, far);
  const [html, setHtml] = useState<string>();
  // `src` is the address of the bridge on the Mac, and a blob of the file on the phone.
  useEffect(() => void (src && fetch(src).then((r) => (r.ok ? r.text() : undefined)).then(setHtml, () => {})), [src]);
  return html;
}

// A page in its frame, in the viewer, where the user can use it. Only a tap opens it.
function Frame({ page }: { page: Page }) {
  const html = useHtml(page);
  // A page that closes with the keyboard open leaves no typing behind.
  useEffect(() => () => document.documentElement.removeAttribute("data-frame-typing"), []);
  return html === undefined ? <div className="artifact-wait" /> : <iframe ref={(f) => void (f && framed.set(f, page))} className="artifact" sandbox="allow-scripts" srcDoc={withLook(html)} title={page.title} />;
}

// The still of a page for its card: a PNG that the bridge draws at the size of the card, in the colors of the screen
// (/shot, bridge/shot.ts). A chat loads no live page, because an app opens only on a tap, as a document (App Store). The
// icon of the app shows while the still loads, and on a computer with no Chrome.
function Still({ page, icon }: { page: Page; icon?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<[number, number]>();
  useEffect(() => {
    const el = box.current!;
    const measure = () => el.clientWidth > 0 && setSize([el.clientWidth, el.clientHeight]);
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const { vars, dark } = lookNow();
  const query = size && `w=${size[0]}&h=${size[1]}&s=${Math.min(2, Math.ceil(devicePixelRatio || 1))}&look=${encodeURIComponent(vars)}${dark ? "&dark" : ""}`;
  const src = useBridgeSrc(query && `/shot?path=${encodeURIComponent(page.path)}&${query}`, page.owner, page.far);
  const [failed, setFailed] = useState<string>();
  return (
    <span ref={box} className="artifact-still">
      <AppIcon icon={icon} name={page.title} />
      {src && failed !== src && <img src={src} alt="" onError={() => setFailed(src)} />}
    </span>
  );
}

// The viewer of the app: one page at full screen, with Save and Close. showArtifact opens it from a card, from Grok,
// from the Claude call and from /show. It has no Share.
let openViewer: (page: Page) => void = () => {};
export const showArtifact = (page: Page) => openViewer(page);
export function ArtifactViewer({ save }: { save?: (a: Artifact) => void }) {
  const [page, setPage] = useState<Page>();
  openViewer = setPage;
  const [, redraw] = useState(0);
  useEffect(() => {
    const now = () => redraw((n) => n + 1);
    changed.add(now);
    return () => void changed.delete(now);
  }, []);
  // A page of this computer can be saved from the viewer, as from its row in the Canvas tab.
  const app = page && !page.far ? lists.get(bridgeFetch)?.find((a) => a.id === pageOf(page.path)?.id) : undefined;
  return (
    <Dialog.Root open={!!page} onOpenChange={(o) => !o && setPage(undefined)}>
      <Dialog.Portal>
        <Dialog.Popup className="viewer artifact-viewer" aria-label={page?.title}>
          {/* A site is the live page of its server, with all that it can do, as in a browser. */}
          {page && (isSite(page) ? <iframe key={page.path} className="artifact" src={page.path} title={page.title} /> : <Frame key={page.path} page={page} />)}
          {app && save && (
            <button className="icon viewer-pin" data-native="artifact-save" data-icon="star" data-glyph="20" aria-pressed={!!app.saved} aria-label={app.saved ? "Unstar the app" : "Star the app"} title={app.saved ? "Starred" : "Star"} onClick={() => save(app)}>
              <Icon name="star" filled={!!app.saved} />
            </button>
          )}
          <Dialog.Close className="icon viewer-close" data-native="artifact-close" data-icon="x" data-glyph="20" aria-label="Close the page" title="Close">
            <Icon name="x" />
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// A page in a chat, where its agent made it: its still at the width of the chat, its title and version, and Open.
export function ArtifactCard({ path, owner, far }: { path: string; owner?: string; far?: Fetch }) {
  const get = far ?? bridgeFetch;
  const at = pageOf(path);
  const [, redraw] = useState(0);
  const a = lists.get(get)?.find((x) => x.id === at?.id);
  // A page that the list does not have yet loads the list once.
  useEffect(() => void (!a && load(get).then(() => redraw((n) => n + 1))), [a?.id]);
  const page = { path, owner, far, title: a?.title ?? "Page" };
  return (
    <div className="artifact-card">
      <button className="artifact-preview" onClick={() => showArtifact(page)} aria-label={`Open ${page.title}`}>
        <Still page={page} icon={a?.icon} />
      </button>
      <div className="artifact-caption">
        <span>
          <b>{page.title}</b>
          {at && at.version > 1 && ` · version ${at.version}`}
        </span>
        <button className="link" onClick={() => showArtifact(page)}>
          Open
        </button>
      </div>
    </div>
  );
}

// Minutes and seconds, as 4:59.
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
// The time now, again each second while `on`, for the time left of an approval.
export function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}
const titleOf = (ask: NonNullable<Worker["ask"]>) => (ask.kind ? (ask.title ?? ask.tool) : `Allow ${ask.tool}?`);

// One approval that waits, in "Needs you" of the Canvas tab: what, who, Face ID and the time left, and Review.
export function AskRow({ w, who, review }: { w: Worker; who: string; review: () => void }) {
  const ask = w.ask!;
  const now = useNow(!!ask.until);
  return (
    <div className="ask-row">
      <Icon name="shield" size={22} />
      <span>
        <b>
          {titleOf(ask)}
          {ask.amount && ` · ${ask.amount}`}
        </b>
        <small>{[who, ask.until && `${clock(ask.until - now)} left`].filter(Boolean).join(" · ")}</small>
      </span>
      <button onClick={review}>Review</button>
    </div>
  );
}

// The sheet of an approval (docs/canvas.md): who asks and the time left, the title, the amount, what the agent does after
// a yes, the rows, and the field of a code or the choices. Terms and a password need a yes from the phone, or Touch ID on a
// Mac, with no Face ID. A swipe down puts it aside: it waits in "Needs you" of the Canvas tab.
// A tool call of an agent ("Allow Bash?") uses the same sheet, and it stays until an answer.
// `yes` takes the place of the yes of the sheet: 1Password sends its key itself (approveSecret in
// src/Vault.tsx). A request for 1Password uses the same card.
// A payment carries the link of its page (Stripe Checkout, or the approval page of Link). Pay opens that page, and the user
// pays there: Yonder never keeps or charges a card. The Page row is the host of the link, not a text of the agent.
export function Approval({ w, who, answer, later, yes: own }: { w: Worker; who: string; answer: (a: { allow: boolean; value?: string; choice?: string }) => void; later: () => void; yes?: () => Promise<void> }) {
  const ask = w.ask!;
  const now = useNow(!!ask.until);
  const left = ask.until ? Math.max(0, ask.until - now) : undefined;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const title = titleOf(ask);
  const host = ask.kind === "pay" && ask.link ? new URL(ask.link).host : "";
  const rows = host ? [...(ask.rows ?? []), ["Page", host] as [string, string]] : ask.rows;
  const approve = async () => {
    // A cancel of Face ID gives an error with no text, so the card stays with no message.
    if (own) return void own().catch((e: Error) => setError(e.message));
    if (host) void openLink(ask.link!);
    answer({ allow: true, ...(ask.kind === "code" && { value: code.trim() }) });
  };
  // The bridge asks Touch ID itself for a yes from the Mac (touchId), also for 1Password (approveSecret in src/Vault.tsx).
  const onPhone = ask.faceId && !phone && !ask.touchId;
  const yes = host ? `Pay on ${host}` : onPhone ? "Approve on the phone" : ask.touchId && !phone ? "Approve with Touch ID" : ask.kind === "code" ? "Send code" : ask.kind ? "Approve" : "Allow";
  return (
    <Drawer.Root open onOpenChange={(o) => !o && ask.kind && later()}>
      <Drawer.Portal>
        <Drawer.Backdrop className="attach-backdrop" />
        <Drawer.Viewport className="attach-viewport">
          <Drawer.Popup className="attach-sheet approval" aria-label={title}>
            <div className="attach-handle" />
            <div className="approval-head">
              <span>
                <b>{who}</b> asks you
              </span>
              {left !== undefined && <span className="approval-left">{left ? clock(left) : "Expired"}</span>}
            </div>
            <Drawer.Title className="approval-title">{title}</Drawer.Title>
            {ask.amount && <div className="approval-amount">{ask.amount}</div>}
            {ask.text && (ask.kind ? <Drawer.Description className="approval-text">{ask.text}</Drawer.Description> : <code className="ask">{ask.text}</code>)}
            {!!rows?.length && (
              <dl className="approval-rows">
                {rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {ask.link && !host && (
              <button className="approval-link" onClick={() => void openLink(ask.link!)}>
                Read the terms
              </button>
            )}
            {error && <p className="approval-text">{error}</p>}
            {ask.kind === "code" && (
              <input
                className="approval-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                enterKeyHint="send"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && code.length >= 4 && void approve()}
                aria-label="The code"
              />
            )}
            {ask.kind === "choice" ? (
              ask.choices?.map((c) => (
                <button key={c} className="approval-yes" disabled={left === 0} onClick={() => answer({ allow: true, choice: c })}>
                  {c}
                </button>
              ))
            ) : (
              <button className="approval-yes" disabled={left === 0 || onPhone || (ask.kind === "code" && code.length < 4)} onClick={() => void approve()}>
                {yes}
              </button>
            )}
            {left !== 0 && (
              <button className="approval-no" onClick={() => answer({ allow: false })}>
                Deny
              </button>
            )}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
