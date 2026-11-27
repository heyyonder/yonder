// Renders each screen of screens.html with headless Chrome:
// - bun android/store/render.ts      Google Play: android/store/screen-<n>.png (1080 x 1920)
// - bun android/store/render.ts ios  App Store: ios/store/screen-<n>.png (1320 x 2868, the 6.9" iPhone size)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dir = import.meta.dir;
const ios = process.argv[2] === "ios";
const [width, height, outDir, query] = ios ? [1320, 2868, `${dir}/../../ios/store`, "&ios"] : [1080, 1920, dir, ""];
const html = await Bun.file(`${dir}/screens.html`).text();
const count = html.match(/^const SCREENS = \[([\s\S]*?)^\];/m)![1].match(/^  \{$/gm)!.length;
// A profile of its own, so that a running Chrome of the user does not take the job.
const profile = mkdtempSync(`${tmpdir()}/yonder-shots-`);

for (let s = 1; s <= count; s++) {
  const out = `${outDir}/screen-${s}.png`;
  await Bun.file(out).delete().catch(() => {});
  const p = Bun.spawnSync([CHROME, "--headless=new", `--user-data-dir=${profile}`, "--hide-scrollbars", "--force-device-scale-factor=1",
    `--window-size=${width},${height}`, "--virtual-time-budget=4000", `--screenshot=${out}`, `file://${dir}/screens.html?s=${s}${query}`], { timeout: 30_000 });
  // Headless Chrome can stay open after it writes the picture, so the time limit ends it.
  if (!(await Bun.file(out).exists())) throw new Error(p.stderr.toString());
  console.log(out);
}
