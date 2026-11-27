// The check of a drop of files on the Mac: `bun bridge/drop-e2e.ts`. It needs no network and uses no credits: a test
// bridge, and a Mac page whose calls to the bridge go to the test bridge. It does not touch the bridge on port 7787.
// 1. A spreadsheet from Finder: its path is on the drag pasteboard, so it attaches at its place, with no upload.
// 2. A spreadsheet with no path, such as one from a browser: it uploads (/file).
// 3. A picture shows as a picture.
// Each file that is not a picture shows as a page with its type and its name.
// It writes the drag pasteboard of the Mac, which the next drag of the user replaces. The screenshot goes to the shots folder.
import { chromium, webkit } from "playwright-core";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-drop-e2e-"));
const SHOTS = join(TMP, "shots");
mkdirSync(SHOTS, { recursive: true });
const free = () => {
  const s = Bun.serve({ port: 0, fetch: () => new Response() });
  const p = s.port;
  s.stop(true);
  return p;
};
const assert = (ok: unknown, what: string) => {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
};
const HOME = join(TMP, "home");
const PORT = free();
const CONFIG = join(HOME, ".config", `yonder-${PORT}`);
mkdirSync(CONFIG, { recursive: true });
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ sumUp: false, textUp: false }));
const SHEET = join(TMP, "Q3 budget.xlsx");
writeFileSync(SHEET, "not a real spreadsheet");

const env = { ...process.env, HOME, YONDER_PORT: String(PORT) };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
// The bridge takes calls only from the origins of the app (ORIGINS in bridge/main.ts), so the page comes from port 1420.
// A Vite that already runs there for this folder serves it too.
const vitePort = 1420;
const running = await fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false);
const vite = running ? null : Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });
const browser = process.env.ENGINE === "chromium" ? await chromium.launch({ executablePath: CHROME }) : await webkit.launch();
try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/settings`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false)]);
    if (up.every(Boolean)) break;
    await Bun.sleep(200);
  }
  const page = await browser.newPage({ viewport: { width: 864, height: 640 }, deviceScaleFactor: 2 });
  await page.route("http://127.0.0.1:7787/**", (r) => r.continue({ url: r.request().url().replace(":7787", `:${PORT}`) }));
  await page.addInitScript(() => localStorage.setItem("welcomed", "1"));
  await page.goto(`http://localhost:${vitePort}/`);
  // The test home has no Claude Code login, so the setup asks for it.
  for (let t = Date.now(); !(await page.getByRole("tab", { name: /^done/i }).isVisible()); ) {
    if (Date.now() - t > 30_000) throw new Error("FAIL: the list of agents does not show");
    await page.getByText("Later", { exact: true }).first().click({ timeout: 300 }).catch(() => {});
  }
  const drop = (files: { name: string; type: string; body: string }[]) =>
    page.evaluate((files) => {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.body), (c) => c.charCodeAt(0))], f.name, { type: f.type }));
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, files);
  const uploaded = () => readdirSync(CONFIG, { recursive: true }).filter((f) => String(f).endsWith(".xlsx"));

  // 1. From Finder: the drag pasteboard holds the path.
  const wrote = Bun.spawnSync(["osascript", "-l", "JavaScript", "-e", `ObjC.import("AppKit"); var pb = $.NSPasteboard.pasteboardWithName($.NSPasteboardNameDrag); pb.clearContents; pb.writeObjects($.NSArray.arrayWithObject($.NSURL.fileURLWithPath(${JSON.stringify(SHEET)})));`]);
  assert(wrote.exitCode === 0, "the check puts the path of the spreadsheet on the drag pasteboard");
  await drop([{ name: "Q3 budget.xlsx", type: "", body: btoa("not a real spreadsheet") }]);
  const doc = page.locator(".images .doc", { hasText: "Q3 budget.xlsx" });
  await doc.waitFor({ timeout: 10_000 });
  assert((await doc.locator("b").textContent()) === "xlsx", "a dropped spreadsheet from Finder shows as a page with its type");
  assert(uploaded().length === 0, "a file from Finder attaches at its place, with no upload");

  // 2. No path for the name: the file uploads.
  await drop([{ name: "notes.pdf", type: "application/pdf", body: btoa("%PDF-1.4") }]);
  await page.locator(".images .doc", { hasText: "notes.pdf" }).waitFor({ timeout: 10_000 });
  assert(readdirSync(CONFIG, { recursive: true }).some((f) => String(f).endsWith("notes.pdf")), "a file with no path uploads to the bridge");

  // 3. A picture: a red PNG of 1 by 1.
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  await drop([{ name: "red.png", type: "image/png", body: png }]);
  await page.locator(".images img").first().waitFor({ timeout: 10_000 });
  assert((await page.locator(".images .doc").count()) === 2, "a picture shows as a picture, not as a page");
  await Bun.sleep(600); // The spring of the last item.
  await page.screenshot({ path: join(SHOTS, "drop.png") });
  console.log(`shots: ${SHOTS}`);
} finally {
  await browser.close();
  bridge.kill();
  vite?.kill();
}
