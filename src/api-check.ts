// The ratchet of the rebuild of the default screen (docs/screen-api.md): the default is one front end among many, so it
// reaches the bridge, the voice and Tauri only through the one API of src/api.ts. This check counts the direct calls
// that are left in the files of the default screen. It fails when the count goes up, and asks to lower API_LEFT when it
// goes down. The work is done at 0. Run it with `bun src/api-check.ts`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The direct calls left: 0. The routes of the settings are in yonder.settings. The default
// screen reaches the bridge, the voice and Tauri only through src/api.ts. Never raise it.
const API_LEFT = 0;

// The default screen: the parts of src/ that draw. The API, the skeleton (the link, the call, the abilities, the
// loader of the screen) and the host of the frames are not part of it.
const DIR = join(import.meta.dir);
const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx") && f !== "OwnScreen.tsx");
const DIRECT = /\bbridgeFetch\(|\blink\.fetch\(|\bcallTool\(|(?<![\w.])call<|(?<![\w.])call\("|\binvoke\(|\binvoke</g;
const counts = files.map((f) => [f, (readFileSync(join(DIR, f), "utf8").match(DIRECT) ?? []).length] as const).filter(([, n]) => n);
const total = counts.reduce((sum, [, n]) => sum + n, 0);
console.log(counts.map(([f, n]) => `${f}: ${n}`).join(", "));
if (total > API_LEFT) {
  console.error(`api-check: ${total} direct calls in the default screen, more than ${API_LEFT}. Call src/api.ts in place of the bridge, the voice or Tauri.`);
  process.exit(1);
}
if (total < API_LEFT) console.log(`api-check: ${total} direct calls left. Lower API_LEFT in src/api-check.ts to ${total}.`);
else console.log(`api-check: ${total} direct calls left in the default screen.`);
