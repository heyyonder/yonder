// Checks `pick` of src/screen.ts: which screen the phone runs. `bun src/screen-check.ts`; check.yml runs it.
import { pick } from "./screen";

const app = "2.80.400"; // the phone app, and the screen of its install
const cases: [string, Parameters<typeof pick>, string][] = [
  ["same version as the install", [{ build: "2.80.400" }, app, true, app, null, false], ""],
  ["a newer computer", [{ build: "2.82.425", needs: { ios: 397 } }, app, true, app, null, false], "2.82.425"],
  ["back to an older computer, still newer than the install", [{ build: "2.81.410" }, app, true, "2.82.425", null, false], "2.81.410"],
  ["a computer older than the install", [{ build: "2.79.390" }, app, true, "2.82.425", null, false], ""],
  ["a screen that needs a newer iPhone app", [{ build: "2.83.430", needs: { ios: 428, android: 300 } }, app, true, app, null, false], ""],
  ["the same screen on an Android app that fits", [{ build: "2.83.430", needs: { ios: 428, android: 300 } }, app, true, app, null, true], "2.83.430"],
  ["a bridge that gives no needs", [{ build: "2.83.430" }, app, true, app, null, false], "2.83.430"],
  ["the screen that failed", [{ build: "2.82.425" }, app, true, app, "2.82.425", false], ""],
  ["a screen that needs a newer app keeps the newer screen that runs", [{ build: "2.83.430", needs: { ios: 428 } }, app, true, "2.82.425", null, false], "2.82.425"],
  ["the screen that failed keeps the newer screen that runs", [{ build: "2.82.425" }, app, true, "2.81.410", "2.82.425", false], "2.81.410"],
  ["an older computer whose screen needs a newer app: the install", [{ build: "2.81.410", needs: { ios: 428 } }, app, true, "2.82.425", null, false], ""],
  ["a debug app runs a newer screen", [{ build: "2.83.430", needs: { ios: 999 } }, undefined, true, app, null, false], "2.83.430"],
  ["an old install: never an older screen", [{ build: "2.81.410" }, app, false, "2.82.425", null, false], "2.82.425"],
  ["an old install: a newer screen that fits", [{ build: "2.83.430", needs: { ios: 397 } }, app, false, "2.82.425", null, false], "2.83.430"],
  ["an old install: no screen that needs a newer app, and no return to the install", [{ build: "2.83.430", needs: { ios: 428 } }, app, false, "2.82.425", null, false], "2.82.425"],
  ["an old debug install: a newer screen", [{ build: "2.83.430", needs: { ios: 999 } }, undefined, false, "2.82.425", null, false], "2.83.430"],
];
let failed = 0;
for (const [name, args, want] of cases) {
  const got = pick(...args);
  if (got !== want) (failed++, console.error(`FAIL ${name}: got "${got}", want "${want}"`));
  else console.log(`ok: ${name}`);
}
if (failed) process.exit(1);
