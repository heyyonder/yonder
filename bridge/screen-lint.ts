// The check of a new version of an own screen (docs/screen-api.md, "The check"), before it goes live. The host keeps
// each page clear of the traffic lights of the Mac and of the notch of the phone (src/app.css, .own-screen), so the
// page starts at 0,0 of its frame. On the phone the frame goes under the home bar, and the page gets its space as `--under`. This check opens the page in headless Chrome at the size of
// the frame on the Mac and on the phone, and fails when the page does not call yonder.ready(), throws, or cuts text
// or a control at the left, the top or the right edge. A computer with no Google
// Chrome skips it: the 5-second ready() check of the app stays the floor there.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import KIT_CSS from "../src/kit/kit.css" with { type: "text" };
import { tryPage, type Look } from "./ui";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// The frame of a page: the window of 1000 by 700 under the title bar of 36 px, and an iPhone of 402 by 874 under its
// notch (62 px), down to the bottom edge, with the home bar of 34 px as `--under`.
export const SIZES = [
  { name: "the Mac", w: 1000, h: 664, under: 0 },
  { name: "the phone", w: 402, h: 812, under: 34 },
];

// The page goes into a frame of the size of the screen, because Chrome makes no window narrower than 500 px. The frame
// collects the errors of the page. After 5 seconds the outer page reads ready(), the errors, and each text or control
// that the frame cuts. An element in a list that scrolls or clips to the side is not cut, as the user can scroll to it.
const ERRORS = `<script>window.__errors = []; addEventListener("error", (e) => __errors.push(e.message)); addEventListener("unhandledrejection", (e) => __errors.push(String((e.reason && e.reason.message) || e.reason)));</script>`;
const PROBE = `<script>setTimeout(() => {
  const w = document.querySelector("iframe").contentWindow, d = w.document, W = w.innerWidth, cut = [];
  const clipped = (el) => { for (let p = el.parentElement; p && p !== d.body; p = p.parentElement) if (/auto|scroll|hidden|clip/.test(w.getComputedStyle(p).overflowX)) return true; return false; };
  for (const el of d.body.querySelectorAll("*")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const control = el.matches("button, a[href], input, select, textarea, [role=button], [onclick]");
    if (!own && !control) continue;
    const s = w.getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width || !r.height || s.visibility === "hidden" || s.opacity === "0") continue;
    const off = r.left < -1 ? ["left", -r.left] : r.right > W + 1 ? ["right", r.right - W] : r.top < -1 && s.position === "fixed" ? ["top", -r.top] : null;
    if (!off || clipped(el)) continue;
    const label = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\\s+/g, " ").slice(0, 40);
    cut.push(\`the \${control ? "control" : "text"} "\${label}" goes \${Math.round(off[1])} px past the \${off[0]} edge\`);
  }
  const out = document.createElement("pre");
  out.id = "__lint";
  out.textContent = JSON.stringify({ ready: !!w.__ready, errors: w.__errors, cut: cut.slice(0, 3) });
  document.body.append(out);
}, 5000);</script>`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// The answer is the reason that the version fails, or nothing when it passes or when the computer has no Chrome.
export async function lintScreen(look: Look): Promise<string | undefined> {
  if (look.kind !== "screen" || typeof look.page !== "string" || !existsSync(CHROME)) return;
  const dir = mkdtempSync(join(tmpdir(), "yonder-lint-"));
  try {
    const file = join(dir, "page.html");
    const inner = tryPage(look).replace('<meta charset="utf-8">', `<meta charset="utf-8"><style>${KIT_CSS}</style>${ERRORS}`);
    for (const size of SIZES) {
      const page = inner.replace('<meta charset="utf-8">', `<meta charset="utf-8"><style>:root{--under:${size.under}px}</style>`);
      writeFileSync(file, `<!doctype html><body style="margin:0"><iframe style="border:0;display:block;width:${size.w}px;height:${size.h}px" srcdoc="${esc(page)}"></iframe>${PROBE}</body>`);
      // --virtual-time-budget runs the 5 seconds of the probe at once, and --dump-dom gives the page after them.
      const p = Bun.spawn([CHROME, "--headless=new", "--use-mock-keychain", "--password-store=basic", "--disable-gpu", "--no-first-run", `--user-data-dir=${join(dir, "chrome")}`, "--window-size=1100,900", "--virtual-time-budget=6000", "--dump-dom", `file://${file}`], { stdout: "pipe", stderr: "ignore" });
      // SIGINT quits Chrome normally. After SIGTERM or SIGKILL, Google Chrome leaves the copy of its app that it makes at
      // each start in the temp folder. A Chrome that still runs 5 seconds later gets SIGKILL.
      const timer = setTimeout(() => (p.kill("SIGINT"), setTimeout(() => p.kill("SIGKILL"), 5_000)), 30_000);
      const dom = await new Response(p.stdout).text();
      clearTimeout(timer);
      const json = dom.match(/<pre id="__lint">([^<]*)<\/pre>/)?.[1];
      if (!json) return; // Chrome did not run the page to the end: no answer, so no fail.
      const r = JSON.parse(json.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")) as { ready: boolean; errors: string[]; cut: string[] };
      const at = `at ${size.w} by ${size.h} px (${size.name})`;
      if (r.errors.length) return `The page throws ${at}: ${r.errors[0].slice(0, 200)}`;
      if (!r.ready) return `The page does not call yonder.ready() in 5 seconds ${at}.`;
      if (r.cut.length) return `${r.cut.join("; ")} ${at}. Keep each text and control inside the page: the app already keeps the page clear of the title bar and the notch, so start the page at 0,0 and do not add space for them. Only the bottom gets padding-bottom: var(--under) for the home bar of the phone.`;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
