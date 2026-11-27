// The check of the context of an agent on the Mac in each style: `bun bridge/contextbar-e2e.ts`. It needs Chrome for
// Testing, and uses no credits and no network: a test bridge with one fake agent, and a Mac page in headless Chrome
// whose calls to the bridge go to the test bridge. It does not touch the bridge on port 7787 or ~/.config/yonder. Square
// Pop is an own style of a user (a copy of fixtures/square-pop.json). The screenshots go to the shots folder that it
// prints.
import { chromium, webkit } from "playwright-core";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME } from "./test-chrome";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-contextbar-e2e-"));
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
const PROJECT = join(TMP, "landing");
mkdirSync(join(CONFIG, "ui", "square-pop"), { recursive: true });
mkdirSync(PROJECT, { recursive: true });
cpSync(join(import.meta.dir, "fixtures", "square-pop.json"), join(CONFIG, "ui", "square-pop", "screen.json"));

// Agent 7 used 316k of the 1M of Opus.
const SESSION = "00000000-0000-4000-8000-000000000007";
const now = Date.now();
const ANSWER = "The hero now says Talk to your agents.";
writeFileSync(
  join(CONFIG, "state.json"),
  JSON.stringify({
    windows: { "claude-opus-5-5": 1_000_000 },
    // The summary of the last answer is in the state already (answerKey in bridge/main.ts), so no Haiku runs.
    summaries: { [SESSION]: { key: "l" + Bun.hash(ANSWER).toString(36), next: "Done", text: "- The hero now says Talk to your agents." } },
    workers: [{ id: "w7", num: 7, sessionId: SESSION, name: "Landing hero", project: "landing", path: PROJECT, task: "Change the hero", status: "done", activity: "", result: ANSWER, unread: false, startedAt: now, updatedAt: now, model: "claude-opus-5-5", effort: "high", context: { used: 316_000, window: 1_000_000 } }],
  }),
);
const usage = { input_tokens: 2000, cache_read_input_tokens: 313_000, output_tokens: 1000 };
const transcript = join(HOME, ".claude", "projects", PROJECT.replace(/[^a-zA-Z0-9]/g, "-"));
mkdirSync(transcript, { recursive: true });
writeFileSync(
  join(transcript, `${SESSION}.jsonl`),
  [
    { type: "user", timestamp: new Date(now - 60_000).toISOString(), message: { role: "user", content: "Make the hero say Talk to your agents." } },
    { type: "assistant", timestamp: new Date(now - 30_000).toISOString(), message: { role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: ANSWER }] } },
  ].map((e) => JSON.stringify({ ...e, sessionId: SESSION, cwd: PROJECT })).join("\n") + "\n",
);

const env = { ...process.env, HOME, YONDER_PORT: String(PORT) };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
// The bridge takes calls only from the origins of the app (ORIGINS in bridge/main.ts), so Vite runs on the port of
// `bun tauri dev`. Stop `bun tauri dev` before the check.
const vitePort = 1420;
if (await fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false)) throw new Error("FAIL: port 1420 is in use (bun tauri dev?)");
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });
// The Mac app draws its page with WebKit. ENGINE=chromium checks Chrome for Testing.
const browser = process.env.ENGINE === "chromium" ? await chromium.launch({ executablePath: CHROME }) : await webkit.launch();
try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/settings`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false)]);
    if (up.every(Boolean)) break;
    await Bun.sleep(200);
  }
  for (const ui of (process.env.THEMES ?? "yonder,big,terminal,omarchy,playful,square-pop").split(",")) {
    for (const dark of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 864, height: 760 }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light" });
      // The calls to the bridge go to the test bridge.
      await page.route("http://127.0.0.1:7787/**", (r) => r.continue({ url: r.request().url().replace(":7787", `:${PORT}`) }));
      await page.addInitScript((ui) => (localStorage.setItem("ui", ui), localStorage.setItem("welcomed", "1")), ui);
      await page.goto(`http://localhost:${vitePort}/`);
      // The test home has no Claude Code login, so the setup asks for it.
      const done = page.getByRole("tab", { name: /^done/i });
      for (let t = Date.now(); !(await done.click({ timeout: 300 }).then(() => true, () => false)); ) {
        if (Date.now() - t > 30_000) throw new Error("FAIL: the list of agents does not show");
        await page.getByText("Later", { exact: true }).first().click({ timeout: 300 }).catch(() => {});
      }
      await page.locator(".worker.row", { hasText: "Landing hero" }).click({ timeout: 20_000 });
      await page.getByRole("tab", { name: /^context$/i }).click();
      const panel = page.getByRole("tabpanel", { name: /^context$/i });
      await panel.getByText("The hero now says").waitFor({ timeout: 20_000 });
      await Bun.sleep(800); // The pill of the tabs slides.
      const name = `${ui}-${dark ? "dark" : "light"}`;
      // The agent covers the window, and during a call it does not (`cover` in src/App.tsx), so the head is lower.
      for (const call of [false, true]) {
        if (call) await page.evaluate(() => document.querySelector(".sheet.cover")?.classList.remove("cover"));
        const meta = await page.locator(".convo-meta").evaluate((e) => ({ text: e.textContent, bottom: e.getBoundingClientRect().bottom }));
        const bar = await page.locator(".convo-bar").evaluate((e) => ({ ...e.getBoundingClientRect().toJSON(), color: getComputedStyle(e).backgroundColor }));
        const chat = await panel.getByText("Make the hero say").evaluate((e) => e.getBoundingClientRect().top);
        const where = `${name}${call ? " in a call" : ""}`;
        assert(meta.text?.includes("316k / 1M · 32%"), `${where}: the line under the tabs shows the context (${meta.text})`);
        assert(Math.abs(bar.width - 0.316 * 864) < 2 && bar.height === 2, `${where}: the bar is 31.6% of the width (${bar.width} px)`);
        assert(bar.top >= meta.bottom && bar.top < meta.bottom + 24 && bar.bottom < chat, `${where}: the bar is under the line and over the chat (${bar.top})`);
        assert(bar.color !== "rgba(0, 0, 0, 0)", `${where}: the bar has a color (${bar.color})`);
      }
      await page.evaluate(() => document.querySelector(".sheet")?.classList.add("cover"));
      await Bun.sleep(300);
      await page.screenshot({ path: join(SHOTS, `${name}.png`) });
      await page.close();
    }
  }
  console.log(`shots: ${SHOTS}`);
} finally {
  await browser.close();
  bridge.kill();
  vite.kill();
}
