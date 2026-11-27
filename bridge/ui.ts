// The screens of the user (docs/ui-themes.md, src/look.ts): one folder for each screen in ~/.config/yonder/ui/<name>/,
// with one file for each version: <n>.json, and <n>.html for an own screen (a page). A version never changes, so a
// rollback is only a pick of an older number. state.json keeps the note, the agent and the bad mark of each version.
// The phone reads them through /ui, and the agents and the voice through the customize tool. The samples are the files of
// src/ui/, so the bridge and the screen have the same ones.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import yonder from "../src/ui/yonder.json";
import { lintScreen } from "./screen-lint";
import dashboard from "../src/ui/dashboard.json";
import big from "../src/ui/big.json";
import terminal from "../src/ui/terminal.json";
import playful from "../src/ui/playful.json";
import omarchy from "../src/ui/omarchy.json";
import DASHBOARD_FILE from "../src/ui/dashboard.html" with { type: "file" };
import duet from "../src/ui/duet.json";
import DUET_FILE from "../src/ui/duet.html" with { type: "file" };
import grokBot from "../src/ui/grok-bot.json";
import GROK_BOT_FILE from "../src/ui/grok-bot.html" with { type: "file" };
// With `type: "file"`, an import gives the path of the file, also in a compiled bridge. The types of Bun say HTMLBundle.
const page = (file: unknown) => readFileSync(file as string, "utf8");

export type Look = Record<string, unknown> & { name?: string; about?: string; kind?: string; page?: string; from?: string };
type Meta = { note?: string; by?: string; bad?: boolean; error?: string };
// `source`: the last change time and the hash of the folder that the last version came from, so a folder that did not
// change makes no new version. `error`: why the last build failed.
type State = { versions?: Record<string, Meta>; source?: { mtime: number; hash?: string; error?: string } };
export type Version = Meta & { n: number; at: number };

export const DEFAULT = "yonder";
export const SAMPLES: Record<string, () => Look> = {
  yonder: () => yonder,
  dashboard: () => ({ ...dashboard, page: page(DASHBOARD_FILE) }),
  big: () => big,
  terminal: () => terminal,
  omarchy: () => omarchy,
  playful: () => playful,
  duet: () => ({ ...duet, page: page(DUET_FILE) }),
  "grok-bot": () => ({ ...grokBot, page: page(GROK_BOT_FILE) }),
};
const NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;
// The relay sends one answer in one frame of 1 MiB (bridge/relay.ts), so a version is 1 MB or less when gzipped. The
// bridge gzips the answer of a large page (/ui in bridge/main.ts), and the phone unzips it (src/look.ts).
const MAX_PAGE = 4_000_000;
const MAX_ZIP = 1_000_000;

export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "screen";
const dirOf = (root: string, name: string) => {
  if (!NAME.test(name)) throw new Error(`"${name}" is not the name of a screen: use a to z, 0 to 9 and -.`);
  return join(root, name);
};
const stateOf = (dir: string): State => {
  try {
    return JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  } catch {
    return {};
  }
};
const meta = (dir: string, n: number, m: Meta) => {
  const s = stateOf(dir);
  (s.versions ??= {})[n] = { ...s.versions[n], ...m };
  writeFileSync(join(dir, "state.json"), JSON.stringify(s, null, 2) + "\n");
};
// The numbers of the versions, the newest first.
const numbers = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .flatMap((f) => /^(\d+)\.json$/.exec(f)?.[1] ?? [])
        .map(Number)
        .sort((a, b) => b - a)
    : [];

export function versions(root: string, name: string): Version[] {
  const dir = dirOf(root, name);
  const all = stateOf(dir).versions ?? {};
  return numbers(dir).map((n) => ({ n, at: statSync(join(dir, `${n}.json`)).mtimeMs, ...all[n] }));
}

// One version: `n`, or the newest that is not bad. An own screen gets its page.
export function read(root: string, name: string, n?: number): { n: number; look: Look } {
  const dir = dirOf(root, name);
  const all = versions(root, name);
  const v = n ? all.find((x) => x.n === n) : all.find((x) => !x.bad);
  if (!v) throw new Error(n ? `The screen ${name} has no version ${n}.` : all.length ? `Each version of ${name} failed.` : `There is no screen ${name}.`);
  const look = JSON.parse(readFileSync(join(dir, `${v.n}.json`), "utf8")) as Look;
  if (look.kind === "screen") look.page = existsSync(join(dir, `${v.n}.html`)) ? readFileSync(join(dir, `${v.n}.html`), "utf8") : "";
  return { n: v.n, look };
}

// The screens of the user, the newest change first.
export function list(root: string) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => NAME.test(name) && numbers(join(root, name)).length)
    .flatMap((name) => {
      try {
        const all = versions(root, name);
        const { look } = read(root, name, (all.find((v) => !v.bad) ?? all[0]).n);
        // The colors of the swatch in the light and the dark look: each theme has both (docs/ui-themes.md).
        const pick = (mode: string) => {
          const c = ((look.look as Record<string, Record<string, string>> | undefined)?.[mode] ?? {}) as Record<string, string>;
          return { bg: c.bg, text: c.text, accent: c.accent, live: c.live, call: c.call };
        };
        return [{ name, title: String(look.name ?? name), about: look.about, kind: look.kind ?? "style", from: look.from, colors: { light: pick("light"), dark: pick("dark") }, versions: all }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.versions[0].at - a.versions[0].at);
}

const sized = (look: Look) => {
  if (typeof look.page === "string" && look.page.length > MAX_PAGE) throw new Error("The page is larger than 4 MB.");
  if (Bun.gzipSync(JSON.stringify(look)).length > MAX_ZIP) throw new Error("The page is larger than 1 MB when gzipped. Make the pictures and the scripts smaller.");
};

// A new version: the next number, with the page of an own screen in its own file.
export function save(root: string, name: string, look: Look, m: Meta = {}) {
  if (!look || typeof look !== "object" || Array.isArray(look)) throw new Error("A screen is a JSON object.");
  const dir = dirOf(root, name);
  mkdirSync(dir, { recursive: true });
  const n = (numbers(dir)[0] ?? 0) + 1;
  const { page, ...data } = look;
  sized(look);
  if (data.kind === "screen") writeFileSync(join(dir, `${n}.html`), typeof page === "string" ? page : "");
  writeFileSync(join(dir, `${n}.json`), JSON.stringify(data, null, 2) + "\n");
  if (m.note || m.by) meta(dir, n, m);
  return n;
}

// A free name for a new screen: "my-chat", else "my-chat-2" and so on.
const freeName = (root: string, base: string) => {
  let name = base;
  for (let i = 2; existsSync(join(root, name)); i++) name = `${base}-${i}`;
  return name;
};

// The source folder (docs/screen-api.md): a screen folder with screen.json is the source of its versions. The user, an
// agent or an import changes screen.json and index.html, and the bridge makes the versions. An imported folder is the
// link or the clone `source/` in the screen folder. So the user can drop a theme or a whole front end into a folder, and
// the phone gets it over the air.
const sourceOf = (dir: string) => (existsSync(join(dir, "source")) ? join(dir, "source") : dir);
const manifestOf = (dir: string) => [join(sourceOf(dir), "screen.json"), join(dir, "screen.json")].find((f) => existsSync(f));
// The files that the bridge writes, and the folders of a build, are not changes of the source.
const OWN = /^(\d+\.(json|html)|state\.json|build\.log|CLAUDE\.md)$/;
const SKIP = new Set(["node_modules", ".git", "dist", "starter"]);
// The newest change time of the files of a screen folder, with its source.
// shortcut: reads up to 2000 files each 3 seconds; watch the folders if that ever costs.
function newest(dir: string) {
  let max = 0;
  let left = 2000;
  const walk = (d: string, top: boolean) => {
    for (const f of readdirSync(d)) {
      if (--left < 0 || SKIP.has(f) || (top && OWN.test(f))) continue;
      const st = statSync(join(d, f), { throwIfNoEntry: false });
      if (st?.isDirectory()) walk(join(d, f), false);
      else if (st && st.mtimeMs > max) max = st.mtimeMs;
    }
  };
  walk(dir, true);
  return max;
}

const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4",
};
// Puts each local script, style sheet, picture and font of a page into the page, because a page on the phone has no
// network and no files (the CSP of src/OwnScreen.tsx). A path out of the folder, or to the web, stays as it is.
function inline(html: string, base: string, root: string) {
  const top = realpathSync(root);
  const file = (ref: string, from: string) => {
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return;
    const path = resolve(ref.startsWith("/") ? base : from, ref.replace(/[?#].*$/, "").replace(/^\/+/, ""));
    if (!existsSync(path)) return;
    const real = realpathSync(path);
    return real.startsWith(top + sep) && statSync(real).isFile() ? real : undefined;
  };
  const data = (ref: string, from: string) => {
    const f = file(ref, from);
    return f ? `data:${TYPES[extname(f).toLowerCase()] ?? "application/octet-stream"};base64,${readFileSync(f).toString("base64")}` : ref;
  };
  const css = (text: string, from: string) => text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (all, q, ref) => `url(${q}${data(ref, from)}${q})`);
  // A value of an attribute, with double quotes, single quotes or none.
  const V = `(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`;
  return html
    .replace(new RegExp(`<script\\b([^>]*?)\\ssrc=${V}([^>]*)>\\s*</script>`, "gi"), (all, a, d, q, u, b) => {
      const f = file(d ?? q ?? u, base);
      return f ? `<script${a}${b}>${readFileSync(f, "utf8").replace(/<\/(script)/gi, "<\\/$1")}</script>` : all;
    })
    .replace(/<link\b[^>]*>/gi, (all) => {
      const m = new RegExp(`\\shref=${V}`, "i").exec(all);
      const ref = m && (m[1] ?? m[2] ?? m[3]);
      const f = /\srel=["']?stylesheet/i.test(all) && ref ? file(ref, base) : undefined;
      return f ? `<style>${css(readFileSync(f, "utf8"), dirname(f)).replace(/<\/(style)/gi, "<\\/$1")}</style>` : all;
    })
    .replace(new RegExp(`(<(?:img|source|video|audio|image)\\b[^>]*?\\s(?:src|href)=)${V}`, "gi"), (all, a, d, q, u) => `${a}"${data(d ?? q ?? u, base)}"`)
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (all, a, text) => `<style${a}>${css(text, base)}</style>`);
}

// A screen folder as a version: screen.json, and the page of an own screen with its files in it. A build puts the page
// in dist/ (or the folder of "dist" in screen.json). A folder with an index.html and no "kind" is an own screen.
function pack(dir: string, built: boolean): Look {
  const manifest = manifestOf(dir);
  if (!manifest) throw new Error("The folder has no screen.json.");
  const conf = JSON.parse(readFileSync(manifest, "utf8")) as Look;
  const src = sourceOf(dir);
  const base = built ? join(src, String(conf.dist ?? "dist")) : src;
  const html = join(base, "index.html");
  const kind = conf.kind ?? (existsSync(html) ? "screen" : "style");
  if (kind !== "screen") return { ...conf, kind };
  if (!existsSync(html)) throw new Error(`The screen has no ${built ? `${String(conf.dist ?? "dist")}/` : ""}index.html.`);
  return { ...conf, kind, page: inline(readFileSync(html, "utf8"), base, src) };
}

// Saves a version of a source folder, only when the version changed. The answer is its number.
function commit(root: string, name: string, look: Look, mtime: number, m: Meta = {}) {
  const dir = dirOf(root, name);
  const hash = Bun.hash(JSON.stringify(look)).toString(36);
  const s = stateOf(dir);
  const n = hash === s.source?.hash ? undefined : save(root, name, look, m);
  const after = stateOf(dir);
  after.source = { mtime, hash };
  writeFileSync(join(dir, "state.json"), JSON.stringify(after, null, 2) + "\n");
  return n;
}

// Runs `bun run build` in the source, with `bun install` first when it has no node_modules. The log is build.log.
async function build(src: string, log: string) {
  const install = existsSync(join(src, "node_modules")) ? "" : "bun install && ";
  const p = Bun.spawn(["/bin/sh", "-c", `(${install}bun run build) > "$1" 2>&1`, "sh", log], { cwd: src, env: process.env });
  const timer = setTimeout(() => p.kill(), 300_000);
  const code = await p.exited;
  clearTimeout(timer);
  if (code) throw new Error(`The build failed with the code ${code}.`);
}

// A new version of a source folder when it changed after the last version. The answer is the new number, else nothing:
// no change, the same page, or an error, which goes into build.log and state.json.
export async function publish(root: string, name: string, force = false) {
  const dir = dirOf(root, name);
  if (!manifestOf(dir)) return;
  const mtime = newest(dir);
  const last = stateOf(dir).source;
  // A change of the last 2 seconds waits, so an editor or an agent that writes several files makes one version.
  if (!force && (last?.mtime === mtime || Date.now() - mtime < 2000)) return;
  const log = join(dir, "build.log");
  try {
    const src = sourceOf(dir);
    const pkg = existsSync(join(src, "package.json")) ? JSON.parse(readFileSync(join(src, "package.json"), "utf8")) : undefined;
    if (pkg?.scripts?.build) await build(src, log);
    const look = pack(dir, !!pkg?.scripts?.build);
    // A page that throws, does not start, or cuts a control at the Mac or the phone size does not become a version.
    sized(look);
    const bad = Bun.hash(JSON.stringify(look)).toString(36) !== last?.hash ? await lintScreen(look) : undefined;
    if (bad) throw new Error(`The check failed: ${bad}`);
    return commit(root, name, look, mtime, { note: "From the folder" });
  } catch (e) {
    appendFileSync(log, `${new Date().toISOString()} ${(e as Error).message}\n`);
    const s = stateOf(dir);
    s.source = { mtime, hash: last?.hash, error: (e as Error).message.slice(0, 500) };
    writeFileSync(join(dir, "state.json"), JSON.stringify(s, null, 2) + "\n");
  }
}

// Each source folder that changed, one after the other. The bridge on port 7787 calls it each 3 seconds.
let busy = false;
export async function watch(root: string, done?: (name: string, n: number) => void) {
  if (busy || !existsSync(root)) return;
  busy = true;
  try {
    for (const name of readdirSync(root).filter((n) => NAME.test(n))) {
      const n = await publish(root, name);
      if (n) done?.(name, n);
    }
  } finally {
    busy = false;
  }
}

// Writes a look as a source folder (screen.json, and index.html for a page) and saves it as the next version.
function write(root: string, name: string, look: Look, m: Meta) {
  const dir = dirOf(root, name);
  mkdirSync(dir, { recursive: true });
  const { page, ...data } = look;
  writeFileSync(join(dir, "screen.json"), JSON.stringify(data, null, 2) + "\n");
  if (typeof page === "string") writeFileSync(join(dir, "index.html"), page);
  writeFileSync(join(dir, "CLAUDE.md"), RULES(name));
  return commit(root, name, pack(dir, false), newest(dir), m);
}

// A screen from the backup of the account (bridge/sync.ts), as the next version. It also becomes the source folder, so
// the next change of an agent starts from it. An imported folder stays as the user keeps it, and gets only the version.
export function take(root: string, name: string, look: Look) {
  const m = { note: "From your account" };
  return existsSync(join(dirOf(root, name), "source")) ? save(root, name, look, m) : write(root, name, look, m);
}

// A sample or a screen of the user, as the start of a new screen of the user's own: "My Terminal", version 1.
export function fork(root: string, from: string) {
  const [name, n] = from.split("@");
  const look = SAMPLES[name]?.() ?? read(root, name, n ? Number(n) : undefined).look;
  const title = `My ${String(look.name ?? "screen").replace(/^My /, "")}`.slice(0, 40);
  const to = freeName(root, slug(title));
  const v = write(root, to, { ...look, name: title, from }, { note: `From ${look.name ?? from}` })!;
  return { name: to, n: v, look: read(root, to, v).look };
}

// A new name for a screen of the user. The folder keeps its name, so the links and "ui" in phone.json stay. A folder
// with a screen.json gets the name there, and the next version comes from the folder; a screen with only versions gets
// a new version with the name.
export async function rename(root: string, name: string, title: string) {
  const dir = dirOf(root, name);
  if (!existsSync(dir)) throw new Error(`There is no screen ${name}.`);
  const clean = title.trim().slice(0, 40);
  if (!clean) throw new Error("Give the new name.");
  const manifest = manifestOf(dir);
  if (!manifest) return save(root, name, { ...read(root, name).look, name: clean }, { note: `Renamed to ${clean}` });
  const conf = JSON.parse(readFileSync(manifest, "utf8"));
  writeFileSync(manifest, JSON.stringify({ ...conf, name: clean }, null, 2) + "\n");
  const n = await publish(root, name, true);
  const error = lastError(root, name);
  if (!n && error) throw new Error(error);
  return n;
}

// Import: a folder of the user stays where it is, as the link `source` in a new screen folder, so the user and the agents
// keep their work there. A Git URL is cloned into `source`. A folder with no screen.json gets one in the screen folder,
// as an own screen. Import only a screen that you trust: its build runs on the computer.
export async function importScreen(root: string, from: string, title?: string) {
  const git = /^(https?:\/\/|git@|ssh:\/\/)/.test(from);
  const label = title || from.replace(/\/+$/, "").split("/").pop()!.replace(/\.git$/, "");
  const name = freeName(root, slug(label));
  const dir = dirOf(root, name);
  mkdirSync(dir, { recursive: true });
  if (git) {
    const p = Bun.spawnSync(["git", "clone", "--depth", "1", from, join(dir, "source")]);
    if (!p.success) throw new Error(`git clone failed: ${p.stderr.toString().trim().slice(-300)}`);
  } else {
    if (!existsSync(from) || !statSync(from).isDirectory()) throw new Error(`There is no folder ${from}.`);
    symlinkSync(realpathSync(from), join(dir, "source"));
  }
  if (!manifestOf(dir)) writeFileSync(join(dir, "screen.json"), JSON.stringify({ name: label, kind: "screen" }, null, 2) + "\n");
  writeFileSync(join(dir, "CLAUDE.md"), RULES(name));
  const n = await publish(root, name, true);
  if (!n) throw new Error(stateOf(dir).source?.error ?? "The folder gave no screen.");
  return { name, n, dir: sourceOf(dir) };
}

// Deletes a screen of the user with all its versions. An imported folder stays: only its link or its clone `source/` goes.
export function remove(root: string, name: string) {
  const dir = dirOf(root, name);
  if (!existsSync(dir)) throw new Error(`There is no screen ${name}.`);
  rmSync(dir, { recursive: true, force: true });
}

// The reason that the last change of a source folder did not become a version (a build or the check), else nothing.
export const lastError = (root: string, name: string) => (existsSync(dirOf(root, name)) ? stateOf(dirOf(root, name)).source?.error : undefined);

// A version that did not start on the phone. The answer is the newest good version.
export function markBad(root: string, name: string, n: number | undefined, error: string) {
  const dir = dirOf(root, name);
  const bad = n ?? read(root, name).n;
  meta(dir, bad, { bad: true, error: error.slice(0, 500) });
  return versions(root, name).find((v) => !v.bad)?.n;
}

// Build your own, and a new screen by voice: a new source folder with the sample to start from as version 1, and the
// rules for the agent that changes it (CLAUDE.md).
export function starter(root: string, words: string, from: string) {
  const sample = SAMPLES[from.split("@")[0]] ? from.split("@")[0] : "dashboard";
  const name = freeName(root, slug(`my ${words.split(/\s+/).slice(0, 4).join(" ")}`));
  const title = `My ${words.split(/\s+/).slice(0, 4).join(" ")}`.slice(0, 40);
  write(root, name, { ...SAMPLES[sample](), name: title, about: words.slice(0, 200), from: sample }, { note: `From ${SAMPLES[sample]().name}` });
  return { name, dir: dirOf(root, name) };
}

// A page to test an own screen in a browser on the Mac: the page with a stand-in SDK and three made-up agents.
export function tryPage(look: Look) {
  const now = Date.now();
  const mice = [
    { id: "a1", num: 14, name: "Landing hero", project: "yonder-landing", status: "running", activity: "Editing src/Hero.jsx", model: "claude-opus-5-5", effort: "high", context: 34, startedAt: now - 120_000, updatedAt: now, avatar: { shape: "cloud", color: "#ff6700" } },
    { id: "a2", num: 11, name: "Live UI", project: "yonder", status: "waiting", next: "Build the iPhone app now?", attention: true, model: "claude-opus-5-5", context: 58, startedAt: now - 2_460_000, updatedAt: now - 60_000 },
    { id: "a3", num: 9, name: "October invoice", project: "time", status: "done", summary: "- Sent invoice 2026-031.", model: "claude-haiku-5-5", context: 12, startedAt: now - 3_600_000, updatedAt: now - 3_000_000 },
  ];
  const turns = [{ who: "user", text: "Make the hero one line, and push it to main." }, { who: "tool", text: "Edit src/Hero.jsx" }, { who: "assistant", text: "Done. The hero is one line now." }];
  // The API of a page (src/OwnScreen.tsx), version 2 and version 1, with the made-up data.
  const sdk = `<script>(()=>{const subs={};const mice=${JSON.stringify(mice)};const turns=${JSON.stringify(turns)};const call={phase:"idle",muted:false};
const ok=async()=>({ok:true}),on=(e)=>(f)=>((subs[e]=subs[e]||[]).push(f),()=>{});
window.yonder={word:{one:"agent",many:"agents",One:"Agent",Many:"Agents"},ready:async()=>{window.__ready=true;document.title=document.title||"ready"},
mice:Object.assign(async()=>mice,{list:async()=>mice,closed:async()=>[],on:on("mice"),start:async()=>({num:15}),send:ok,stop:ok,done:ok,close:ok,rename:ok,avatar:ok}),chat:{get:async()=>turns},
call:{state:async()=>call,on:on("call"),start:async()=>call,end:async()=>call,mute:async()=>call},dictation:{start:ok,stop:async()=>"Make the hero one line",cancel:ok,on:on("dictation")},projects:{list:async()=>[{name:"yonder",path:"/home/you/yonder",starred:true}],current:async()=>({name:"All projects",path:"*"}),select:ok,on:on("project")},
usage:{get:async()=>({week:23,session:41})},approvals:{list:async()=>[],answer:ok},settings:{get:async()=>({}),schema:async()=>[],set:ok,open:ok},screen:{list:async()=>[],use:ok},
phone:{ability:ok},tool:async()=>({claude_code_usage:["Week, all models: 23% used","Current session: 41% used"]}),icon:()=>"",icons:[],
mouse:async()=>turns,send:ok,start:async()=>({num:15}),done:ok,close:ok,open:async()=>null,on:(e,f)=>on(e)(f)};})();</script>`;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${sdk}${look.page ?? ""}`;
}

// The note in each screen folder for the agents that build or change it. The rules are in the skill yonder-screens
// (bridge/skill.ts), which the bridge installs for Claude Code.
export const RULES = (name: string) => `# The screen "${name}" of Yonder

This folder is the screen "${name}" of the Yonder app. Use the skill
\`yonder-screens\` before you change it. Without the skill, read
\`curl -s "\${YONDER_BRIDGE:-http://127.0.0.1:7787}/ui?guide"\`.

Change only \`screen.json\`, \`index.html\` and their files. Never change
\`<n>.json\`, \`<n>.html\` or \`state.json\`.
`;

// Writes the note of today into each screen folder, over the rules of an older bridge. CLAUDE.md is not a change of the
// source (OWN), so it makes no new version.
export function refreshRules(root: string) {
  if (!existsSync(root)) return;
  for (const name of readdirSync(root).filter((n) => NAME.test(n))) {
    const file = join(root, name, "CLAUDE.md");
    if (existsSync(file) && readFileSync(file, "utf8") !== RULES(name)) writeFileSync(file, RULES(name));
  }
}

// The check of a source folder as the next version gets it, with no new version: the build, the size and the check
// of the page. The answer is the reason that it fails, else nothing.
export async function check(root: string, name: string) {
  const dir = dirOf(root, name);
  if (!manifestOf(dir)) return `The screen ${name} has no screen.json.`;
  try {
    const src = sourceOf(dir);
    const pkg = existsSync(join(src, "package.json")) ? JSON.parse(readFileSync(join(src, "package.json"), "utf8")) : undefined;
    if (pkg?.scripts?.build) await build(src, join(dir, "build.log"));
    const look = pack(dir, !!pkg?.scripts?.build);
    sized(look);
    return await lintScreen(look);
  } catch (e) {
    return (e as Error).message;
  }
}
