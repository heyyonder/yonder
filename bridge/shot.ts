// The still of an app for its card in a chat (docs/canvas.md). Headless Chrome draws the page one time at the size of the
// card, in the colors of the screen, and the PNG stays next to the page in canvas/<id>/.shots. The card shows only the
// still, and a tap opens the live page in the viewer. A chat loads no live page, because an
// app must open only on a tap, as a document (App Store). A computer with no Google Chrome gives no still, and the card
// shows the icon of the app. Check this file with `bun bridge/shot.ts`.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// The page cannot call the bridge or another server of this computer: no fetch, no form, and its pictures, fonts and
// scripts come only from https. The frame of the page gets this policy from the outer page, because it is a srcdoc.
const CSP = "default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src data: blob: https:; font-src data: https:; media-src data: blob: https:; connect-src 'none'; form-action 'none'; frame-src 'none'";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// `vars`: the colors of the screen, as `--bg:#fff;--text:#111`. The head is the head of withLook in src/Canvas.tsx,
// with no script for the links.
export type Size = { w: number; h: number; scale: number; vars: string; dark: boolean };
const lookHead = ({ vars, dark }: Size) =>
  `<meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${vars};color-scheme:${dark ? "dark" : "light"}}` +
  `:where(body){background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-text-size-adjust:100%}</style>`;

// The PNG of a version of a page at a size, or nothing. Two requests for the same still wait for one drawing.
// shortcut: one Chrome at a time for the whole bridge; a pool if a chat with many apps waits too long.
const drawing = new Map<string, Promise<string | undefined>>();
let last: Promise<unknown> = Promise.resolve();
export function shot(page: string, size: Size): Promise<string | undefined> {
  if (!existsSync(CHROME)) return Promise.resolve(undefined);
  const html = readFileSync(page, "utf8");
  const key = createHash("sha256").update(JSON.stringify([html, size])).digest("hex").slice(0, 16);
  const out = join(dirname(page), ".shots", `${basename(page, ".html")}-${key}.png`);
  if (existsSync(out)) return Promise.resolve(out);
  let p = drawing.get(out);
  if (!p) {
    p = last.then(() => draw(html, out, size)).finally(() => drawing.delete(out));
    last = p.catch(() => {});
    drawing.set(out, p);
  }
  return p;
}

// Chrome makes no page narrower than 500 px, so the page goes into a frame of the exact size at the top left, and the
// screenshot has the size of the frame. --virtual-time-budget runs 2 seconds of the page at once, so its scripts and
// its first animations end before the screenshot.
async function draw(html: string, out: string, size: Size) {
  const dir = mkdtempSync(join(tmpdir(), "yonder-shot-"));
  try {
    const doctype = html.match(/^\s*<!doctype[^>]*>/i)?.[0];
    const inner = doctype ? doctype + lookHead(size) + html.slice(doctype.length) : `<!doctype html>${lookHead(size)}${html}`;
    const file = join(dir, "page.html");
    writeFileSync(file, `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html,body{margin:0;overflow:hidden}iframe{display:block;border:0;width:${size.w}px;height:${size.h}px}</style><iframe sandbox="allow-scripts" srcdoc="${esc(inner)}"></iframe>`);
    const png = join(dir, "shot.png");
    // A sandboxed frame runs in its own process, and the screenshot can come before that process paints: about half of
    // the stills are then blank. So the frame stays in the process of the page.
    const p = Bun.spawn([CHROME, "--headless=new", "--use-mock-keychain", "--password-store=basic", "--disable-gpu", "--no-first-run", `--user-data-dir=${join(dir, "chrome")}`, "--disable-features=IsolateSandboxedIframes", "--hide-scrollbars", `--force-device-scale-factor=${size.scale}`, `--window-size=${size.w},${size.h}`, "--virtual-time-budget=2000", `--screenshot=${png}`, `file://${file}`], { stdout: "ignore", stderr: "ignore" });
    // SIGINT quits Chrome normally. After SIGTERM or SIGKILL, Google Chrome leaves the copy of its app that it makes at
    // each start in the temp folder. A Chrome that still runs 5 seconds later gets SIGKILL.
    const timer = setTimeout(() => (p.kill("SIGINT"), setTimeout(() => p.kill("SIGKILL"), 5_000)), 20_000);
    await p.exited;
    clearTimeout(timer);
    if (!existsSync(png)) return;
    mkdirSync(dirname(out), { recursive: true });
    copyFileSync(png, out);
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  if (!existsSync(CHROME)) console.log("skip: no Google Chrome");
  else {
    const dir = mkdtempSync(join(tmpdir(), "yonder-shot-check-"));
    const page = join(dir, "1.html");
    writeFileSync(page, `<!doctype html><style>body{margin:0;background:var(--bg)}</style><p>Hi</p>`);
    const size = { w: 343, h: 522, scale: 2, vars: "--bg:#123456", dark: true };
    const [a, b] = await Promise.all([shot(page, size), shot(page, size)]);
    const png = readFileSync(a!);
    assert(a === b && png.readUInt32BE(16) === 686 && png.readUInt32BE(20) === 1044, "two requests get one still, at the size of the card at 2x");
    assert(dirname(a!) === join(dir, ".shots") && (await shot(page, { ...size, dark: false })) !== a, "the still stays next to the page, one for each look");
    // The first pixel of a PNG: the first row of the image, after its filter byte. The first pixel has no neighbors, so
    // each filter keeps its bytes as they are.
    const { inflateSync } = await import("node:zlib");
    const pixel = (png: Buffer) => {
      const data: Buffer[] = [];
      for (let i = 8; i < png.length; i += 12 + png.readUInt32BE(i)) if (png.toString("ascii", i + 4, i + 8) === "IDAT") data.push(png.subarray(i + 8, i + 8 + png.readUInt32BE(i)));
      return [...inflateSync(Buffer.concat(data)).subarray(1, 4)].map((n) => n.toString(16).padStart(2, "0")).join("");
    };
    // When the frame leaves the process of the page, about half of the stills are blank.
    const colors = ["123456", "a1b2c3", "336699", "cc4422"];
    const got = await Promise.all(colors.map((c, i) => shot(page, { ...size, w: 300 + i, vars: `--bg:#${c}` }).then((f) => pixel(readFileSync(f!)))));
    assert(got.join() === colors.join(), `each still has the colors of the screen and is not blank (${got.join()})`);
    rmSync(dir, { recursive: true, force: true });
  }
}
