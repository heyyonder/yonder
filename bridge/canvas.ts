// The apps of the Canvas tab (docs/canvas.md): small pages that the agents and the voice
// agent make for the user (artifacts), such as the weather in Paris, and the web sites that run on this computer. The
// bridge keeps each version of a page in canvas/<id>/<version>.html and the list in canvas/state.json, with the name, the
// save and the first time seen of each site (`sites`). The app gets each page through /media, as a picture, so the phone
// loads it through the encrypted link and keeps it in its cache, and Cloudflare never sees it.
// Check this file with `bun bridge/canvas.ts`.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

// `worker`: the ID of the agent that made it. `call`: the ID of the voice call that made it. `icon`: a small SVG or an
// emoji that its agent drew. `saved`: the user keeps it, so it never goes to the archive by itself. `archived`: the time
// when the app went to the archive. Its files stay, and only a delete forever removes them.
export type Artifact = { id: string; title: string; versions: number; at: number; createdAt: number; worker?: string; call?: string; icon?: string; saved?: boolean; archived?: number };
// A site by its label: the name that the user gave it, the save, its icon, the pid of a server that the user deleted (its
// row shows again when the server starts again), and the time when the bridge first saw it, for the order of the list.
// `auto` is the name that Haiku gave it (nameSite in bridge/main.ts). The name of the user wins over it.
export type SiteMeta = { name?: string; auto?: string; saved?: boolean; icon?: string; hidden?: number; seen?: number };
export const MAX_BYTES = 1_000_000;
export const MAX_ICON = 20_000;
export const MAX_PICTURE = 64_000;
export const MAX_SEND = 10_000;
const DAY = 86_400_000;

// An icon is an SVG of 20 KB or less or an emoji, which an agent drew, or the choice of the user: the name of an icon of
// the app (src/icons.tsx), or a picture as a data URL of 64 KB or less. The app shows an SVG as a picture (<img>), so its
// scripts never run.
export function checkIcon(icon: string) {
  const i = icon.trim();
  if ((i.length <= 8 && !i.includes("<")) || /^[a-z][a-z0-9-]{0,31}$/.test(i)) return i;
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(i)) {
    if (i.length > MAX_PICTURE) throw new Error("A picture icon is 64 KB or less.");
    return i;
  }
  if (!/^<svg[\s>]/i.test(i) || !/<\/svg>$/i.test(i)) throw new Error("An icon is one <svg> element, or one emoji.");
  if (Buffer.byteLength(i) > MAX_ICON) throw new Error("An icon is 20 KB or less.");
  return i;
}

// The icon that the user chose: an icon of the app or a picture, not an SVG or an emoji of an agent.
const userIcon = (icon?: string) => !!icon && (icon.startsWith("data:") || /^[a-z][a-z0-9-]{0,31}$/.test(icon));

export function openCanvas(dir: string) {
  const file = join(dir, "state.json");
  const trash = join(dir, ".trash");
  let list: Artifact[] = [];
  let sites: Record<string, SiteMeta> = {};
  // The agents whose app the user deleted forever: a next page of such an agent goes to the archive, not to the list.
  let dropped: string[] = [];
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    // An older file is only the list of the pages.
    if (Array.isArray(saved)) list = saved;
    else ({ list = [], sites = {}, dropped = [] } = saved);
  } catch {}
  const save = () => (mkdirSync(dir, { recursive: true }), writeFileSync(file, JSON.stringify({ list, sites, dropped })));
  const path = (a: Artifact, v = a.versions) => join(dir, a.id, `${v}.html`);
  // The last page that the user archived or deleted forever, for `undo`.
  let removed: { a: Artifact; forever: boolean } | undefined;
  const find = (ref: string) => {
    const r = ref.trim().toLowerCase();
    return list.find((a) => a.id === ref.trim()) ?? list.find((a) => a.title.toLowerCase() === r) ?? (r ? list.find((a) => a.title.toLowerCase().includes(r)) : undefined);
  };
  const write = (a: Artifact, html: string) => {
    a.versions++;
    a.at = Date.now();
    mkdirSync(join(dir, a.id), { recursive: true });
    writeFileSync(path(a), html);
    list = [...list.filter((x) => x !== a), a];
  };
  return {
    // The newest first: a new version moves its artifact to the end of `list`.
    list: () => [...list].reverse(),
    get: (id: string) => list.find((a) => a.id === id),
    // A page by its id or its title, as the user names it ("the weather card").
    find,
    // The newest app of an agent, or its app with this title. An agent can have several apps: a task
    // can send more than one app, each with its own card in the chat.
    of: (worker: string, title?: string) => [...list].reverse().find((a) => a.worker === worker && (!title?.trim() || a.title.toLowerCase() === title.trim().toLowerCase())),
    path,
    // A file of an artifact, which /media may serve.
    has: (p: string) => resolve(p).startsWith(`${resolve(dir)}${sep}`) && !resolve(p).startsWith(`${resolve(trash)}${sep}`) && p.endsWith(".html"),
    // A message of a page to this computer (`yonderSend`, src/Canvas.tsx): a JSON file in canvas/<id>/inbox/, which a job of
    // the user reads and deletes. The name sorts by time, and the file gets its name only when it is whole. So an app can,
    // for example, add to and check off a shopping list in a folder of notes.
    send(p: string, message: unknown) {
      const a = p.endsWith(".html") ? list.find((x) => resolve(p).startsWith(`${resolve(dir, x.id)}${sep}`)) : undefined;
      if (!a) throw new Error("No app has this page.");
      const text = JSON.stringify(message ?? null);
      if (text.length > MAX_SEND) throw new Error("A message is 10 KB or less.");
      const box = join(dir, a.id, "inbox");
      const name = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`;
      mkdirSync(box, { recursive: true });
      writeFileSync(join(box, `.${name}`), text);
      renameSync(join(box, `.${name}`), join(box, name));
      return join(box, name);
    },
    // A new artifact, or a new version of `id`.
    put({ id, title, html, worker, call, icon }: { id?: string; title?: string; html: string; worker?: string; call?: string; icon?: string }) {
      if (!html.trim()) throw new Error("The page is empty.");
      if (Buffer.byteLength(html) > MAX_BYTES) throw new Error("An artifact is 1 MB or less. Make the page smaller, or run a larger page as a site.");
      let a = id ? list.find((x) => x.id === id) : undefined;
      if (id && !a) throw new Error(`No artifact has the id ${id}.`);
      if (!a && !title?.trim()) throw new Error("A new artifact needs a title.");
      const drawn = icon?.trim() ? checkIcon(icon) : undefined;
      a ??= { id: crypto.randomUUID().slice(0, 8), title: "", versions: 0, at: 0, createdAt: Date.now(), worker, call, ...(worker && dropped.includes(worker) && { archived: Date.now() }) };
      if (title?.trim()) a.title = title.trim().slice(0, 80);
      // The icon that the user picked or uploaded stays over the icon of each new version. Only change_app replaces it.
      if (drawn && !userIcon(a.icon)) a.icon = drawn;
      write(a, html);
      save();
      return a;
    },
    // An old version comes back as the newest one, so the versions after it stay too.
    back(id: string, version: number) {
      const a = list.find((x) => x.id === id);
      if (!a || !existsSync(path(a, version))) throw new Error(`The artifact ${id} has no version ${version}.`);
      write(a, readFileSync(path(a, version), "utf8"));
      save();
      return a;
    },
    // A new name, icon or save of a page.
    change(id: string, { title, icon, saved }: { title?: string; icon?: string; saved?: boolean }) {
      const a = list.find((x) => x.id === id);
      if (!a) throw new Error(`No artifact has the id ${id}.`);
      if (title?.trim()) a.title = title.trim().slice(0, 80);
      if (icon?.trim()) a.icon = checkIcon(icon);
      if (saved !== undefined) a.saved = saved || undefined;
      save();
      return a;
    },
    // The archive: the app leaves the list of the Canvas tab, and its files stay, so an archive is safer than a
    // delete.
    archive(id: string) {
      const a = list.find((x) => x.id === id);
      if (!a) throw new Error(`No artifact has the id ${id}.`);
      a.archived = Date.now();
      // A save that fails, such as on a full disk, leaves the app where it was.
      try {
        save();
      } catch (e) {
        delete a.archived;
        throw e;
      }
      removed = { a, forever: false };
      return a;
    },
    restore(id: string) {
      const a = list.find((x) => x.id === id);
      if (!a) throw new Error(`No artifact has the id ${id}.`);
      const was = a.archived;
      delete a.archived;
      try {
        save();
      } catch (e) {
        a.archived = was;
        throw e;
      }
      if (removed?.a === a) removed = undefined;
      return a;
    },
    // A delete forever keeps the files of the page in .trash until the next delete, so that `undo` can bring it back.
    remove(id: string) {
      const a = list.find((x) => x.id === id);
      if (!a) throw new Error(`No artifact has the id ${id}.`);
      rmSync(trash, { recursive: true, force: true });
      mkdirSync(trash, { recursive: true });
      if (existsSync(join(dir, a.id))) renameSync(join(dir, a.id), join(trash, a.id));
      list = list.filter((x) => x !== a);
      if (a.worker && !dropped.includes(a.worker)) dropped.push(a.worker);
      removed = { a, forever: true };
      save();
      return a;
    },
    // The page that `undo` brings back, and if it was a delete forever.
    removed: () => removed,
    undo() {
      const r = removed;
      if (!r) return undefined;
      removed = undefined;
      if (!r.forever) return this.restore(r.a.id);
      if (existsSync(join(trash, r.a.id))) renameSync(join(trash, r.a.id), join(dir, r.a.id));
      dropped = dropped.filter((w) => w !== r.a.worker);
      list = [...list, r.a].sort((x, y) => x.at - y.at);
      save();
      return r.a;
    },
    // The name, the save and the delete of each site, and the time when the bridge first saw it.
    site: (label: string): SiteMeta => sites[label] ?? {},
    seen(label: string) {
      if (sites[label]?.seen) return sites[label].seen!;
      sites[label] = { ...sites[label], seen: Date.now() };
      save();
      return sites[label].seen!;
    },
    changeSite(label: string, meta: SiteMeta) {
      const m = { ...sites[label], ...meta };
      if (meta.icon?.trim()) m.icon = checkIcon(meta.icon);
      if (meta.saved === false) delete m.saved;
      sites[label] = m;
      save();
      return m;
    },
    // A page that the user did not save goes to the archive `days` after its last version, unless `keep` holds it, such
    // as the page of an agent that still runs. 0 days keeps all pages in the list.
    prune(days: number, keep: (a: Artifact) => boolean) {
      if (!(days > 0)) return [];
      const old = list.filter((a) => !a.saved && !a.archived && !keep(a) && Date.now() - a.at > days * DAY);
      if (!old.length) return old;
      for (const a of old) a.archived = Date.now();
      save();
      return old;
    },
  };
}

// The start time of each process, from its elapsed time in `ps` ([[dd-]hh:]mm:ss), so that the Canvas tab puts a server that
// started today over a page of yesterday, and a server of last week under it.
export function parseElapsed(text: string, now = Date.now()) {
  const out = new Map<number, number>();
  for (const line of text.trim().split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
    if (m) out.set(Number(m[1]), now - ((Number(m[2] ?? 0) * 24 + Number(m[3] ?? 0)) * 3600 + Number(m[4]) * 60 + Number(m[5])) * 1000);
  }
  return out;
}

// The log of the approvals: one JSON line for each answer, with no value, no code and no card. 1Password (bridge/vault.ts)
// writes its lines into the same file.
export const logApproval = (dir: string, line: Record<string, unknown>) =>
  appendFileSync(join(dir, "approvals.jsonl"), `${JSON.stringify({ at: Date.now(), ...line })}\n`, { mode: 0o600 });

if (import.meta.main) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  const dir = mkdtempSync(join(tmpdir(), "yonder-canvas-"));
  const c = openCanvas(join(dir, "canvas"));
  const a = c.put({ title: "Paris vs Dubai", html: "<p>8°</p>", worker: "w1", icon: "<svg viewBox='0 0 1 1'></svg>" });
  const again = c.put({ id: a.id, html: "<p>9°</p>" });
  assert(again.versions === 2 && readFileSync(c.path(again, 1), "utf8") === "<p>8°</p>" && readFileSync(c.path(again), "utf8") === "<p>9°</p>", "a new version keeps the old one");
  assert(c.of("w1")?.id === a.id && a.icon?.startsWith("<svg"), "the agent has its app, with its icon");
  const second = c.put({ title: "Dubai hotels", html: "<p>Hotels</p>", worker: "w1" });
  assert(c.of("w1")?.id === second.id && c.of("w1", "paris VS dubai")?.id === a.id && !c.of("w1", "London"), "an agent can have several apps: the newest, or the one with a title");
  c.remove(second.id);
  assert(openCanvas(join(dir, "canvas")).get(a.id)?.title === "Paris vs Dubai", "the list stays after a new start");
  assert(c.has(c.path(a)) && !c.has(join(dir, "canvas", "..", "x.html")) && !c.has(join(dir, "canvas", "state.json")), "only an html file of the canvas is served");
  const sent = c.send(c.path(a, 1), { add: "milk" });
  assert(sent.startsWith(join(dir, "canvas", a.id, "inbox")) && JSON.parse(readFileSync(sent, "utf8")).add === "milk", "a page sends a message into the inbox of its app");
  const refused = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      return (e as Error).message;
    }
    return "";
  };
  assert(refused(() => c.put({ title: "Big", html: "x".repeat(MAX_BYTES + 1) })).includes("1 MB"), "a page over 1 MB is refused");
  assert(refused(() => c.send(join(dir, "canvas", "x", "1.html"), {})).includes("No app") && refused(() => c.send(c.path(a), "x".repeat(MAX_SEND))).includes("10 KB"), "a message needs a page of an app, and is 10 KB or less");
  assert(refused(() => c.change(a.id, { icon: "<script>alert(1)</script>" })).includes("<svg>") && c.change(a.id, { icon: "☀️" }).icon === "☀️", "an icon is an SVG or an emoji");
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert(c.change(a.id, { icon: "flask" }).icon === "flask" && c.change(a.id, { icon: png }).icon === png && refused(() => c.change(a.id, { icon: `data:image/png;base64,${"A".repeat(MAX_PICTURE)}` })).includes("64 KB"), "an icon is also the name of an icon of the app, or a picture of 64 KB or less");
  assert(c.put({ id: a.id, html: "<p>8°</p>", icon: "<svg viewBox='0 0 1 1'></svg>" }).icon === png, "the icon that the user chose stays over the icon of a new version");
  c.change(a.id, { icon: "☀️" });
  assert(c.back(a.id, 1).versions === 4 && readFileSync(c.path(a), "utf8") === "<p>8°</p>", "an old version comes back as the newest");
  const call = c.put({ title: "What we're building", html: "<h1>Yonder</h1>", call: "17" });
  assert(c.list()[0].id === call.id && c.find("what we're")?.id === call.id && c.find(a.id)?.id === a.id, "the newest comes first, and a page is found by its title");
  c.change(call.id, { title: "Yonder now", saved: true });
  assert(openCanvas(join(dir, "canvas")).get(call.id)?.saved && c.get(call.id)?.title === "Yonder now", "a rename and a save stay");
  c.archive(a.id);
  assert(c.get(a.id)?.archived && existsSync(c.path(a)) && openCanvas(join(dir, "canvas")).get(a.id)?.archived, "an archived page keeps its files, and the archive stays");
  assert(c.undo() === a && !a.archived && !c.undo(), "undo brings an archived page back, one time");
  c.archive(a.id);
  assert(!c.restore(a.id).archived, "restore brings an archived page back");
  c.archive(a.id);
  c.put({ id: a.id, html: "<p>8°</p>" });
  assert(a.archived && a.versions === 5 && c.of("w1") === a, "a new version of an archived page stays in the archive");
  c.restore(a.id);
  c.remove(a.id);
  assert(!c.get(a.id) && !c.has(join(dir, "canvas", ".trash", a.id, "1.html")), "a page deleted forever goes, and its files are not served");
  assert(c.undo()?.id === a.id && readFileSync(c.path(c.get(a.id)!), "utf8") === "<p>8°</p>" && !c.undo(), "undo brings the deleted page back, one time");
  c.remove(c.put({ title: "Gone", html: "<p/>", worker: "w3" }).id);
  const back = c.put({ title: "Again", html: "<p/>", worker: "w3" });
  assert(back.archived && openCanvas(join(dir, "canvas")).put({ title: "Again", html: "<p/>", worker: "w3" }).archived && !c.put({ title: "New", html: "<p/>", worker: "w4" }).archived, "the next page of an agent whose app was deleted forever goes to the archive, also after a new start");
  c.remove(back.id);
  c.remove(c.of("w4")!.id);
  a.at = call.at = Date.now() - 8 * DAY;
  assert(c.prune(7, () => false).map((x) => x.id).join() === a.id && a.archived && existsSync(c.path(a)) && !c.get(call.id)?.archived, "a page that is not saved goes to the archive after 7 days with its files, and a saved page stays");
  assert(!c.prune(7, () => false).length, "an archived page does not go to the archive again");
  const kept = c.put({ title: "Kept", html: "<p/>", worker: "w2" });
  kept.at = Date.now() - 8 * DAY;
  assert(!c.prune(7, (x) => x.worker === "w2").length && !c.prune(0, () => false).length, "the page of a running agent stays, and 0 days keeps all");
  const seen = c.seen("yonder-landing");
  c.changeSite("yonder-landing", { name: "Landing", saved: true, hidden: 42 });
  assert(c.seen("yonder-landing") === seen && openCanvas(join(dir, "canvas")).site("yonder-landing").name === "Landing", "a site keeps its name and its first time seen");
  writeFileSync(join(dir, "old.json"), JSON.stringify([{ id: "x1", title: "Old", versions: 1, at: 1, createdAt: 1 }]));
  mkdirSync(join(dir, "old"), { recursive: true });
  renameSync(join(dir, "old.json"), join(dir, "old", "state.json"));
  assert(openCanvas(join(dir, "old")).get("x1")?.title === "Old", "a list from before the Canvas tab still loads");
  const started = parseElapsed(" 1 17-22:06:57\n51640       00:42\n  7 01:00:05\n", 10_000_000_000);
  assert(started.get(1) === 10_000_000_000 - ((17 * 24 + 22) * 3600 + 6 * 60 + 57) * 1000 && started.get(51640) === 10_000_000_000 - 42_000 && started.get(7) === 10_000_000_000 - 3_605_000, "the start of a server comes from its elapsed time in ps");
  logApproval(dir, { kind: "pay", agent: 3, title: "Buy credits", answer: "yes", faceId: true });
  assert(JSON.parse(readFileSync(join(dir, "approvals.jsonl"), "utf8")).answer === "yes", "an answer goes into the log");
  rmSync(dir, { recursive: true });
}
