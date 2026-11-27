// The browser of the checks and the store pictures: Chrome for Testing from Playwright, not the Google Chrome of the
// user. At each start, Google Chrome makes a copy of its app in the temp folder (X/com.google.Chrome.code_sign_clone),
// and only a normal quit or SIGINT deletes it. Checks that stop it with SIGTERM leave hundreds of
// copies there. Chrome for Testing makes no copy. Install it with `bunx playwright-core install chromium`.
import { existsSync, rmSync } from "node:fs";
import type { Subprocess } from "bun";
import { chromium } from "playwright-core";

export const CHROME = chromium.executablePath();
if (!existsSync(CHROME)) throw new Error(`No Chrome for Testing at ${CHROME}. Run \`bunx playwright-core install chromium\`.`);

// Stops Chrome as Ctrl+C does, so that it quits normally, and deletes its profile (about 140 MB). A Chrome that still
// runs after 5 seconds gets SIGKILL.
export async function closeChrome(p: Subprocess, profile: string) {
  p.kill("SIGINT");
  const timer = setTimeout(() => p.kill("SIGKILL"), 5_000);
  await p.exited;
  clearTimeout(timer);
  rmSync(profile, { recursive: true, force: true });
}
