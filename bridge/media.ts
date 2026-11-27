// The pictures, videos, sounds and PDFs that the conversation view of the app shows. An agent makes them, for
// example with the vsb CLI of Visual Sandbox, and names each one by its URL or by the full path of its file.
// Check this file with `bun bridge/media.ts`.
import type { BunFile } from "bun";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

// `v` is the time of the last change of a local file. The app loads the file again when it changes, because the app
// keeps each file by its URL, and an agent can write a new picture to the same path.
// A "page" is an artifact of the Canvas (bridge/canvas.ts): an HTML file that the app shows in a sandboxed frame.
// A "pdf" shows as a card, and a tap opens it in Quick Look on the iPhone.
export type Media = { src: string; kind: "image" | "video" | "audio" | "pdf" | "page"; v?: number };

const KINDS: [RegExp, Media["kind"]][] = [
  [/\.(png|jpe?g|gif|webp|avif|svg)$/i, "image"],
  [/\.(mp4|m4v|mov|webm)$/i, "video"],
  [/\.(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/i, "audio"],
  [/\.pdf$/i, "pdf"],
  [/\.html$/i, "page"],
];
const kindOf = (path: string) => KINDS.find(([ext]) => ext.test(path))?.[1];
// A full stop or a comma after a URL or a path ends the sentence. It is not part of the name.
const trim = (s: string) => s.replace(/[.,;:!?]+$/, "");
// The folder of the artifacts. A page shows only from there, because a page elsewhere can need files that a frame
// cannot load. A tool result names it too: show_app gives the path of the page.
let pages = "";
export const keepPages = (dir: string) => (pages = dir);

// The files and the URLs that /media serves: only the ones that a conversation shows, so that a web page cannot read other files.
export const shown = new Set<string>();
// The bridge keeps `shown` in a file (keepShown), one name on each line. The app shows the last chat of an agent before
// the bridge reads it again, so without the file each picture of an agent fails after a restart of the bridge.
// shortcut: the file only grows, by one line for each new picture; trim it if it gets large.
let shownFile = "";
export function keepShown(file: string) {
  shownFile = file;
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) if (line) shown.add(line);
  } catch {}
}
const show = (src: string) => {
  if (shown.has(src)) return;
  shown.add(src);
  if (shownFile) try { appendFileSync(shownFile, `${src}\n`); } catch {}
};

// The media that a text names. A message can name any media URL, or the full path of a media file on this Mac.
// A tool result gives only the URLs of Visual Sandbox, because a search or a list of files can name many files.
export function findMedia(text: string, tool = false): Media[] {
  const out = new Map<string, Media>();
  for (const src of (text.match(/https?:\/\/[^\s"'`<>()[\]{}\\]+/g) ?? []).map(trim)) {
    try {
      const url = new URL(src);
      const kind = kindOf(url.pathname);
      if (kind && kind !== "page" && (!tool || url.hostname === "cdn.visualsandbox.com")) (show(src), out.set(src, { src, kind }));
    } catch {}
  }
  // A tool result names only a page of the Canvas, so a result with no path of the canvas folder needs no scan.
  if (tool && !(pages && text.includes(pages))) return [...out.values()];
  // A path in backticks can have spaces. A path outside backticks ends at a space. On Windows a full path starts with
  // a drive, such as C:\.
  const paths = [...text.matchAll(/`((?:~?\/|[A-Za-z]:\\)[^`\n]+)`/g)]
    .map((m) => m[1])
    .concat(text.match(/(?<![\w.:~/-])(?:~?\/|[A-Za-z]:\\)[^\s"'`<>()[\]{}]+/g) ?? []);
  for (const raw of paths) {
    const path = resolve(trim(raw).replace(/^~(?=\/)/, homedir()));
    const kind = kindOf(path);
    const page = !!pages && path.startsWith(`${pages}${sep}`);
    if (kind === "page" ? !page : tool) continue;
    const stat = kind && existsSync(path) ? statSync(path) : undefined;
    if (kind && stat?.isFile()) {
      show(path);
      out.set(path, { src: path, kind, v: Math.floor(stat.mtimeMs) });
    }
  }
  return [...out.values()];
}

// A path outside backticks ends at a space, so the link of `~/Movies/Sundial Studio/dial.mp4` in the chat is
// ~/Movies/Sundial. The one name in its folder that starts with that word and a space is the path.
export function uncut(path: string) {
  if (existsSync(path)) return path;
  try {
    const names = readdirSync(dirname(path)).filter((name) => name.startsWith(`${basename(path)} `));
    return names.length === 1 ? join(dirname(path), names[0]) : path;
  } catch {
    return path;
  }
}

// A file, or the bytes of it that a Range header asks for. WebKit plays a video or a sound only from a server that answers ranges.
// The URL of a file carries its version (`v`), and an attached picture has a new name each time, so the Mac app can keep
// each file and need not load it again.
const IMMUTABLE = "private, max-age=31536000, immutable";
export function serve(file: BunFile, range: string | null) {
  const size = file.size;
  const [, from, to] = range?.match(/^bytes=(\d*)-(\d*)$/) ?? [];
  if (!from && !to) return new Response(file, { headers: { "accept-ranges": "bytes", "cache-control": IMMUTABLE } });
  const start = from ? Number(from) : Math.max(0, size - Number(to));
  const end = from && to ? Math.min(Number(to), size - 1) : size - 1;
  if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: { "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "cache-control": IMMUTABLE },
  });
}

if (import.meta.main) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  const cdn = "https://cdn.visualsandbox.com/predictions/a/b/c.mp3";
  const job = `{"share_url": "https://visualsandbox.com/share/b/", "result": {"urls": ["${cdn}"]}, "downloaded_files": ["./c.mp3"]}`;
  assert(findMedia(job, true).map((m) => `${m.kind} ${m.src}`).join() === `audio ${cdn}`, "a tool result gives the media URL of a vsb job");
  assert(findMedia('src="https://example.com/logo.png" /home/x/a.png', true).length === 0, "a tool result skips other URLs and paths");
  const dir = mkdtempSync(join(tmpdir(), "yonder-media-"));
  const clip = join(dir, "my clip.mp4");
  writeFileSync(clip, "0123456789");
  const found = findMedia(`The cat: https://example.com/cat.webp. The clip: \`${clip}\`. Not here: ${join(dir, "gone.png")}, \`./c.mp3\`.`);
  assert(found.map((m) => m.kind).join() === "image,video", "a message gives a media URL and a file that exists, also with a space in its path");
  assert(shown.has(clip), "the bridge serves the file that a message shows");
  const card = join(dir, "::Travel", "Arrival Card.pdf");
  mkdirSync(dirname(card));
  writeFileSync(card, "%PDF-1.4");
  assert(findMedia(`The card: \`${card}\`. Also https://example.com/a.pdf.`).map((m) => m.kind).join() === "pdf,pdf", "a message gives a PDF, also with spaces and colons in its path");
  keepPages(join(dir, "canvas"));
  mkdirSync(join(dir, "canvas", "a1"), { recursive: true });
  writeFileSync(join(dir, "canvas", "a1", "1.html"), "<p>hi</p>");
  writeFileSync(join(dir, "site.html"), "<p>site</p>");
  const pagesFound = findMedia(`{"id":"a1","path":"${join(dir, "canvas", "a1", "1.html")}"} and ${join(dir, "site.html")}`, true);
  assert(pagesFound.length === 1 && pagesFound[0].kind === "page", "a tool result gives an artifact, and no other html file");
  const kept = join(dir, "shown");
  shown.clear();
  keepShown(kept);
  findMedia(`\`${clip}\``);
  shown.clear();
  keepShown(kept);
  assert(shown.has(clip) && !shown.has(cdn), "a new start of the bridge still serves a file that it showed before");
  utimesSync(clip, new Date(), new Date(Date.now() + 5000));
  assert(findMedia(`\`${clip}\``)[0].v !== found[1].v, "a file that changes gets a new version");
  const part = serve(Bun.file(clip), "bytes=0-1");
  assert(part.status === 206 && part.headers.get("content-range") === "bytes 0-1/10" && (await part.text()) === "01", "gives the first two bytes");
  assert((await serve(Bun.file(clip), "bytes=-3").text()) === "789", "gives the last three bytes");
  assert(serve(Bun.file(clip), "bytes=20-").status === 416, "refuses a range after the end");
  assert(serve(Bun.file(clip), null).status === 200, "gives the full file without a range");
  mkdirSync(join(dir, "Sundial Studio"));
  assert(uncut(join(dir, "Sundial")) === join(dir, "Sundial Studio"), "a path cut at a space finds its folder");
  mkdirSync(join(dir, "Sundial Games"));
  assert(uncut(join(dir, "Sundial")) === join(dir, "Sundial"), "a cut path with two folders stays as it is");
  rmSync(dir, { recursive: true });
}
