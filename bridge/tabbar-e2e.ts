// The end-to-end check of the swipe home on the flat tab bar of the phone (onBarStart in src/App.tsx):
// `bun bridge/tabbar-e2e.ts`. It needs the network (relay.yonder.so) and Chrome for Testing, so GitHub does not run it. It
// uses no credits: a test bridge with fake agents, and a phone page in headless Chrome that pairs through the relay. It
// does not touch the bridge on port 7787 or ~/.config/yonder. With the glass off, the bar goes down to the edge of the
// screen. The swipe up to leave the app can start on the bar under the tabs, and it must not open the Closed tab.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CHROME } from "./test-chrome";
import { chromium, type Browser } from "playwright-core";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-tabbar-e2e-"));
const free = () => {
  const s = Bun.serve({ port: 0, fetch: () => new Response() });
  const p = s.port;
  s.stop(true);
  return p;
};
const HOME = join(TMP, "home");
const PORT = free();
const CONFIG = join(HOME, ".config", `yonder-${PORT}`);
mkdirSync(CONFIG, { recursive: true });
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.

// One agent on each list tab.
const now = Date.now();
const MICE = [
  [21, "Theme accent colours", "running"],
  [14, "Landing hero", "done"],
  [9, "October invoice", "closed"],
] as const;
writeFileSync(
  join(CONFIG, "state.json"),
  JSON.stringify({
    workers: MICE.map(([num, name, status]) => {
      const path = join(TMP, "yonder");
      mkdirSync(path, { recursive: true });
      return { id: `w${num}`, num, sessionId: `00000000-0000-4000-8000-0000000000${num}`, name, project: "yonder", path, task: name, status, activity: "", result: "Done.", unread: false, startedAt: now, updatedAt: now - num * 60_000 };
    }),
  }),
);
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({}));

const env = { ...process.env, HOME, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
const vitePort = free();
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });
let browser: Browser | undefined;
const stop = async () => {
  await browser?.close().catch(() => {});
  bridge.kill();
  vite.kill();
  if (!process.env.KEEP) rmSync(join(TMP, "home"), { recursive: true, force: true });
};
// The run stops after 3 minutes, so a hang does not leave Chrome, the bridge or Vite behind.
const guard = setTimeout(() => void stop().then(() => (console.error("FAIL: the check took more than 3 minutes"), process.exit(1))), 180_000);

try {
  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/settings`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false)]);
    if (up.every(Boolean)) break;
    await Bun.sleep(200);
  }
  const { connectRelay } = await import(join(WT, "bridge/relay.ts"));
  const relay = connectRelay("wss://relay.yonder.so", CONFIG, process.env.APNS_TEAM_ID ?? "", (req: Request) => {
    const u = new URL(req.url);
    u.port = String(PORT);
    return fetch(new Request(u, req));
  });
  const { link } = await relay.pair();

  browser = await chromium.launch({ executablePath: CHROME, headless: true, timeout: 30_000 });
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets: { top: 62, bottom: 34 } } as never);
  const until = async (check: () => Promise<unknown>, what: string, ms = 30_000) => {
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(250)) if (await check().catch(() => false)) return console.log(`ok: ${what}`);
    throw new Error(`FAIL: timed out: ${what}`);
  };
  const open = () => page.evaluate(() => document.querySelector(".tablist [aria-selected=true]")?.textContent ?? "");
  const touch = (type: string, x?: number, y?: number) => cdp.send("Input.dispatchTouchEvent", { type: type as "touchStart", touchPoints: x === undefined ? [] : [{ x, y: y! }] });
  const flat = () => page.evaluate(() => (document.documentElement.dataset.glass = "off"));

  await page.goto(`http://localhost:${vitePort}/`);
  await page.evaluate(async (link) => {
    const L = await import("/src/link.ts" as string);
    await L.savePairing(await L.pair(link, "iPhone"));
  }, link);
  await page.reload();
  await until(() => page.evaluate(() => !!document.querySelector(".worker.row")), "the paired app shows the agents");
  await flat();
  await page.locator(".tablist [role=tab]", { hasText: "Done" }).click();
  await until(async () => (await open()).includes("Done"), "the Done tab is open");

  const bar = await page.evaluate(() => ({
    bottom: document.querySelector(".tablist")!.getBoundingClientRect().bottom,
    height: innerHeight,
    tabs: [...document.querySelectorAll(".tablist [role=tab]")].map((t) => {
      const r = t.getBoundingClientRect();
      return { name: t.textContent ?? "", x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom };
    }),
  }));
  if (bar.bottom !== bar.height) throw new Error(`FAIL: the flat bar ends at ${bar.bottom}, not at the edge of the screen (${bar.height})`);
  const closed = bar.tabs.find((t) => t.name.includes("Closed"))!;
  const agents = bar.tabs.find((t) => t.name.includes("Agents"))!;

  // The swipe home: it starts under the Closed tab, in the strip of the home indicator, and goes up. iOS then takes the
  // touch and cancels it.
  const edge = Math.round((closed.bottom + bar.height) / 2);
  await touch("touchStart", closed.x, edge);
  await touch("touchMove", closed.x + 3, edge - 20);
  await touch("touchMove", closed.x + 6, edge - 120);
  await touch("touchCancel");
  await Bun.sleep(600);
  const after = await open();
  if (!after.includes("Done")) throw new Error(`FAIL: the swipe home opened "${after}"`);
  console.log("ok: the swipe home from under the tabs keeps the Done tab");

  // A drag that starts on a tab still opens the tab under the finger.
  await touch("touchStart", agents.x, agents.y);
  await touch("touchMove", (agents.x + closed.x) / 2, agents.y);
  await touch("touchMove", closed.x, agents.y);
  await touch("touchEnd");
  await until(async () => (await open()).includes("Closed"), "a drag along the tabs opens the Closed tab");

  // A new start opens the last tab, also the Closed tab.
  await page.reload();
  await until(async () => (await open()).includes("Closed"), "a new start opens the Closed tab, the last tab");
} finally {
  clearTimeout(guard);
  await stop();
}
// The socket of the relay keeps the process alive.
process.exit(0);
