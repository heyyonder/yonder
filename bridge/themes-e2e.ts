// The end-to-end check of the themes on the phone, and the pictures of each theme for a theme gallery:
// `bun bridge/themes-e2e.ts`. It needs the network (relay.yonder.so) and the browsers of Playwright (`bunx
// playwright-core install webkit chromium`), so GitHub does not run it. It uses no credits: a test bridge with the
// made-up data of fixtures/themes-mock.ts, and a stand-in for Claude Code that starts nothing. The phone is the app of
// src/ under Vite, paired through the relay, in WebKit (the engine of the iPhone) and in Chromium.
//
// 1. The pictures: each sample in the light and the dark look, in three views with the same data (the agents, an
//    approval, a chat), into themes/<theme>/shots/, for the theme gallery.
// 2. The phone check of the samples Duet and Grok Bot at three iPhone sizes, in both engines: the page never scrolls,
//    the edit sheet fits with no scroll, the bubbles sit on their side, each placeholder fits on one line, and the frame
//    follows the keyboard when it opens and closes (src/main.tsx, app.css), also when iOS 26 makes the web view shorter.
//    A headless browser has no keyboard: the check gives the app the sizes of the keyboard of iOS, and the app runs its
//    own keyboard code with them.
// 3. The steps that start an agent or save a look, on the stand-in page of the bridge (tryPage): a new agent saves the
//    look of its draft, an agent with no look gets a surprise look, a young agent waits 5 seconds for it, and Edit saves.
//
// GALLERY=0 skips the pictures, THEMES=duet,grok-bot picks the themes of the pictures, and ENGINES=webkit picks an
// engine. The screenshots of the check go to the shots folder that it prints.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chromium, webkit, type BrowserType, type Frame, type Page } from "playwright-core";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { APPROVAL, APPROVAL_AGENT, CHAT_AGENT, writeMock } from "./fixtures/themes-mock";
import { lintScreen } from "./screen-lint";
import { SAMPLES, tryPage } from "./ui";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-themes-e2e-"));
const SHOTS = join(TMP, "shots");
mkdirSync(SHOTS, { recursive: true });
const GALLERY = join(WT, "themes");
const shotsOf = (theme: string) => join(GALLERY, theme, "shots");
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
const near = (a: number, b: number) => Math.abs(a - b) <= 1.5;
const HOME = join(TMP, "home");
const PORT = free();
const CONFIG = join(HOME, ".config", `yonder-${PORT}`);
mkdirSync(CONFIG, { recursive: true });
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.
const bin = writeMock(HOME, CONFIG, join(TMP, "projects"));

// The samples in the order of the gallery (src/look.ts), and the two with the pixel look.
const THEMES = process.env.THEMES?.split(",") ?? Object.keys(SAMPLES);
const PIXEL = ["duet", "grok-bot"];
const ENGINES: BrowserType[] = [webkit, chromium].filter((e) => !process.env.ENGINES || process.env.ENGINES.split(",").includes(e.name()));
// Three iPhones: the size of the screen, the notch and the home bar, and the height of the keyboard with its bar of
// suggestions.
const PHONES = [
  { name: "iPhone 17 Pro", w: 402, h: 874, top: 62, bottom: 34, keyboard: 336 },
  { name: "iPhone 17", w: 390, h: 844, top: 47, bottom: 34, keyboard: 336 },
  { name: "iPhone SE", w: 375, h: 667, top: 20, bottom: 0, keyboard: 260 },
];
type Phone = (typeof PHONES)[number];
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

const env = { ...process.env, HOME, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK, PATH: `${bin}:${process.env.PATH}` };
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, "bridge.log")) });
const vitePort = free();
const vite = Bun.spawn(["bunx", "vite", "--port", String(vitePort), "--strictPort"], { cwd: WT, stdout: "ignore", stderr: "ignore" });
const procs = [bridge, vite];
const browsers: { close: () => Promise<void> }[] = [];
// A step that never ends ends the check, with the processes that it started.
const watchdog = setTimeout(() => {
  console.log("FAIL: the check took more than 25 minutes");
  for (const p of procs) p.kill();
  process.exit(1);
}, 25 * 60_000);
// An evaluate of Playwright has no time limit.
const within = <T>(p: Promise<T>, what: string, ms = 30_000) => Promise.race([p, Bun.sleep(ms).then(() => Promise.reject(new Error(`FAIL: timed out: ${what}`)))]);


// The phone page of the app, and the frame of an own screen in it.
class App {
  constructor(
    readonly page: Page,
    readonly engine: string,
  ) {}
  size: Phone = PHONES[0];
  frame(): Frame {
    const f = this.page.frames().find((f) => f !== this.page.mainFrame() && f.url() === "about:srcdoc");
    if (!f) throw new Error("FAIL: no frame of an own screen");
    return f;
  }
  // The size of an iPhone, with its notch and its home bar as the insets of the page (the CSS of the app reads
  // --inset-top and --inset-bottom before the safe area).
  async phone(size: Phone) {
    this.size = size;
    await this.page.setViewportSize({ width: size.w, height: size.h });
    await this.insets();
  }
  insets() {
    return this.page.evaluate(([top, bottom]) => {
      localStorage.setItem("test-insets", `${top},${bottom}`);
      document.documentElement.style.setProperty("--inset-top", `${top}px`);
      document.documentElement.style.setProperty("--inset-bottom", `${bottom}px`);
    }, [this.size.top, this.size.bottom]);
  }
  // A theme and a look, from a new load of the page, so each view starts from the list.
  async use(theme: string, look: string) {
    await this.page.evaluate(
      async ([theme, look]) => {
        const L = await (window as any).load("/src/look.ts");
        const A = await (window as any).load("/src/api.ts");
        await L.pickScreen(theme);
        await A.yonder.settings.set("theme", look);
      },
      [theme, look],
    );
    // The bridge keeps the screen and the look in phone.json, and a new load of the page takes them from there. A load
    // before the bridge has them shows the screen before.
    const phone = () => {
      try {
        return JSON.parse(readFileSync(join(CONFIG, "phone.json"), "utf8"));
      } catch {
        return {};
      }
    };
    await this.until(async () => (phone().ui ?? "yonder") === theme && phone().theme === look, `the bridge keeps ${theme} in the ${look} look`);
    await this.page.reload();
    await this.insets();
    if (SAMPLES[theme]().kind === "screen") {
      await this.page.waitForSelector("iframe.own-screen");
      await this.until(() => this.frame().evaluate(() => !!document.body?.children.length), `${theme} draws its page`);
    } else await this.page.waitForFunction((t) => document.documentElement.dataset.look === t && !!document.querySelector("[role=tab]"), theme);
    await this.page.waitForTimeout(1200);
  }
  async until(check: () => Promise<unknown>, what: string, ms = 20_000) {
    for (let t = Date.now(); Date.now() - t < ms; await Bun.sleep(200)) if (await check().catch(() => false)) return;
    await this.shot("failed");
    throw new Error(`FAIL: ${this.engine}: timed out: ${what} (the screen: ${join(SHOTS, `${this.engine}-failed.png`)})`);
  }
  async shot(name: string) {
    const file = join(SHOTS, `${this.engine}-${name}.png`);
    await this.page.screenshot({ path: file });
    return file;
  }
  // A picture of the gallery: a PNG, as WebP when cwebp is on the computer.
  async picture(theme: string, name: string) {
    await this.page.waitForTimeout(600);
    mkdirSync(shotsOf(theme), { recursive: true });
    const png = join(SHOTS, `gallery-${theme}-${name}.png`);
    await this.page.screenshot({ path: png });
    const webp = join(shotsOf(theme), `${name}.webp`);
    const cwebp = Bun.which("cwebp");
    if (cwebp) await Bun.spawn([cwebp, "-quiet", "-q", "80", png, "-o", webp]).exited;
    else await Bun.write(join(shotsOf(theme), `${name}.png`), Bun.file(png));
    console.log(`picture: ${theme}/${name}`);
  }
  own = (theme: string) => SAMPLES[theme]().kind === "screen";
  // The approval card: the card of the app (src/Canvas.tsx), or the card of an own screen.
  async waitApproval(theme: string) {
    if (!this.own(theme)) return this.page.waitForSelector(".approval");
    if (PIXEL.includes(theme)) return this.until(() => this.frame().evaluate(() => !!document.querySelector("[data-ask]")), `${theme} shows the approval`);
    await this.page.waitForTimeout(1500);
  }
  async denyAll() {
    await this.page.evaluate(async () => {
      const A = await (window as any).load("/src/api.ts");
      for (const a of await A.yonder.approvals.list()) await A.yonder.approvals.answer(a.id, false);
    });
    await this.until(() => this.page.evaluate(() => !document.querySelector(".approval")), "the approval card closes");
  }
  // The same data in each picture: three agents run, one waits, no approval waits, and the theme shows the agents.
  async settled(theme: string) {
    const data = () =>
      this.page.evaluate(async () => {
        const A = await (window as any).load("/src/api.ts");
        const mice = await A.yonder.mice.list(), asks = await A.yonder.approvals.list();
        const run = mice.filter((m: any) => m.status === "running").map((m: any) => m.num).sort().join();
        return run === "10,13,14" && mice.find((m: any) => m.num === 12)?.status === "waiting" && !asks.length;
      });
    await this.until(data, `${theme}: the agents have the made-up data`);
    await this.shows(theme);
  }
  async shows(theme: string) {
    if (this.own(theme)) await this.until(() => this.frame().evaluate((n) => document.body.innerText.includes(n), CHAT_AGENT), `${theme} shows the agents`);
    else await this.page.waitForSelector(".worker.row");
    await this.page.waitForTimeout(400);
  }
  // A tap, again when the page did not change in 3 seconds: a tap during a slide or a draw can miss.
  async tap(f: Pick<Frame, "locator">, selector: string, check: () => Promise<unknown>, what: string) {
    for (let i = 0; i < 3; i++) {
      await f.locator(selector).click();
      for (let t = Date.now(); Date.now() - t < 3000; await Bun.sleep(150)) if (await check().catch(() => false)) return;
    }
    await this.until(check, what, 1);
  }
  // The chat of the chat agent: a tap on its row.
  async openChat(theme: string) {
    if (!this.own(theme)) {
      await this.page.locator(".worker.row", { hasText: CHAT_AGENT }).first().click();
      return this.page.waitForSelector(".prompt [aria-label=Attach]");
    }
    await this.frame().evaluate((name) => {
      const row = [...document.querySelectorAll<HTMLElement>("[data-num], tr[data-id], button[data-id]")].find((e) => e.textContent?.includes(name));
      row?.click();
    }, CHAT_AGENT);
    if (PIXEL.includes(theme)) await this.until(() => this.frame().evaluate(() => document.querySelectorAll("#msgs .b").length >= 4), `${theme} shows the chat`);
    else await this.page.waitForTimeout(1500);
  }

  // The phone check of Duet or Grok Bot at one size.
  async check(theme: string, phone: Phone, ask: () => void) {
    const at = `${this.engine} ${theme} ${phone.name}`;
    // The frame of the page, found again at each step: the app can draw a new frame after a change of the settings.
    const f = { evaluate: ((fn: any, arg?: any) => this.frame().evaluate(fn, arg)) as Frame["evaluate"], locator: (selector: string) => this.frame().locator(selector) };
    const H = phone.h;
    const frameBox = () => this.page.evaluate(() => document.querySelector("iframe.own-screen")!.getBoundingClientRect().toJSON());
    const box = await frameBox();
    assert(near(box.top, phone.top) && near(box.bottom, H), `${at}: the frame starts under the notch and goes down to the bottom edge`);
    // The list: the page does not scroll, its text and controls stay inside, and it has the home bar as --under.
    const still = () => f.evaluate(() => ({ scroll: document.scrollingElement!.scrollHeight - innerHeight, wide: document.scrollingElement!.scrollWidth - innerWidth, y: scrollY, under: getComputedStyle(document.documentElement).getPropertyValue("--under").trim() }));
    let s = await still();
    assert(s.scroll <= 0 && s.wide <= 0 && s.under === `${phone.bottom}px`, `${at}: the list fits the frame with no scroll, with --under ${s.under}`);
    assert(!(await f.evaluate(CUT)).length, `${at}: the list cuts no text and no control (${await f.evaluate(CUT)})`);
    await this.tap(f, theme === "duet" ? "#find" : "#q", () => f.evaluate(() => document.activeElement?.id === "q"), `${at}: the search takes the focus`);
    assert(await f.evaluate(FITS, "#q"), `${at}: the placeholder of the search fits on one line`);
    await f.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    if (theme === "duet") await f.evaluate(() => document.getElementById("unfind")!.click());
    await this.until(() => this.page.evaluate(() => !document.documentElement.hasAttribute("data-keyboard")), `${at}: the keyboard of the search closes`);
    // An approval: its card cuts nothing.
    ask();
    await this.until(() => f.evaluate(() => !!document.querySelector("[data-ask]")), `${at}: the approval card shows`);
    assert(!(await f.evaluate(CUT)).length, `${at}: the approval card cuts no text and no control (${await f.evaluate(CUT)})`);
    await this.shot(`${theme}-${phone.w}-approval`);
    await this.denyAll();
    await this.until(() => f.evaluate(() => !document.querySelector("[data-ask]")), `${at}: Deny takes the card away`);

    // A new agent: the draft has a surprise look, and its edit sheet fits with no scroll.
    await this.tap(f, "#new", () => f.evaluate(() => document.body.dataset.view === "chat" && !!document.querySelector("#who svg")), `${at}: a new agent opens with a look`);
    await this.tap(f, "#who", () => f.evaluate(() => !!document.querySelector(".sheet #ok")), `${at}: the edit sheet opens`);
    await this.page.waitForTimeout(450);
    const sheet = await f.evaluate(() => {
      const e = document.querySelector(".sheet")!, r = e.getBoundingClientRect();
      return { scroll: e.scrollHeight - e.clientHeight, top: r.top, bottom: r.bottom, h: innerHeight };
    });
    assert(sheet.scroll <= 1 && sheet.top >= 0 && sheet.bottom <= sheet.h + 1, `${at}: the edit sheet fits with no scroll (${sheet.scroll} px over)`);
    assert(!(await f.evaluate(CUT)).length && (await f.evaluate(FITS, "#nm")), `${at}: the edit sheet cuts nothing, and its name placeholder fits`);
    await this.shot(`${theme}-${phone.w}-edit`);
    await f.locator(".sheet [data-close]").first().click();
    await this.tap(f, "#back", () => f.evaluate(() => document.body.dataset.view === "home"), `${at}: Back goes to the list`);

    // The chat: the bubbles sit on their side and spill nothing, the chat is at its end, and the placeholder fits.
    await this.openChat(theme);
    await this.page.waitForTimeout(400);
    const bubbles: string[] = await f.evaluate(() => {
      const out: string[] = [];
      const m = document.getElementById("msgs")!, mb = m.getBoundingClientRect(), pad = parseFloat(getComputedStyle(m).paddingLeft);
      if (m.scrollWidth > m.clientWidth) out.push("the chat is wider than the screen");
      for (const b of m.querySelectorAll<HTMLElement>(".b")) {
        const r = b.getBoundingClientRect(), what = (b.textContent ?? "").slice(0, 24);
        if (r.width > (mb.width - 2 * pad) * 0.86) out.push(`"${what}" is wider than 84%`);
        if (b.matches(".me") && Math.abs(r.right - (mb.right - pad)) > 2) out.push(`"${what}" of the user is not on the right`);
        if (b.matches(".bot") && Math.abs(r.left - (mb.left + pad)) > 2) out.push(`"${what}" of the agent is not on the left`);
        if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1) out.push(`"${what}" spills out of its bubble`);
        // A bubble is at least as wide as its longest word. Else a rule of another part can squeeze the bubbles of
        // the user in Duet to 48 px, one letter on each line.
        const s = getComputedStyle(b), c = document.createElement("canvas").getContext("2d")!;
        c.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
        const word = Math.max(...(b.textContent ?? "").split(/\s+/).filter((w) => w.length < 20).map((w) => c.measureText(w).width));
        if (b.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) < word - 1) out.push(`"${what}" is narrower than its longest word`);
      }
      return out;
    });
    assert(!bubbles.length, `${at}: the bubbles of the user sit on the right and the bubbles of the agent on the left, inside the screen (${bubbles.join("; ")})`);
    const atEnd = () => f.evaluate(() => { const m = document.getElementById("msgs")!; return m.scrollHeight - m.scrollTop - m.clientHeight <= 2; });
    assert(await atEnd(), `${at}: the chat opens at its last message`);
    assert(await f.evaluate(FITS, "#text"), `${at}: the placeholder of the message box fits on one line`);
    await this.shot(`${theme}-${phone.w}-chat`);

    // The keyboard. On iOS it covers the web view: the visible part gets shorter and the page does not. The check
    // gives the app that size, and its keyboard code (src/main.tsx) puts the frame over the keyboard.
    const open = async (mode: string) => {
      const above = H - phone.keyboard;
      const outer = await frameBox();
      assert(near(outer.top, phone.top) && near(outer.bottom, above), `${at} ${mode}: the frame ends at the top of the keyboard (${Math.round(outer.bottom)} for ${above})`);
      const inner = await f.evaluate(() => {
        const c = document.querySelector(".composer")!.getBoundingClientRect(), back = document.getElementById("back")!.getBoundingClientRect();
        return { composer: c.bottom, h: innerHeight, pad: getComputedStyle(document.querySelector(".composer")!).paddingBottom, under: getComputedStyle(document.documentElement).getPropertyValue("--under").trim(), back: back.top, y: scrollY };
      });
      assert(near(inner.composer, inner.h) && inner.under === "0px" && inner.pad === "10px", `${at} ${mode}: the message box sits on the keyboard, with no space for the home bar (--under ${inner.under})`);
      assert(inner.back >= 0 && inner.back < 30 && inner.y === 0, `${at} ${mode}: the header stays at the top, and the page does not scroll`);
      assert(await atEnd(), `${at} ${mode}: the last message shows over the keyboard`);
    };
    const closed = async (mode: string) => {
      await this.until(() => this.page.evaluate(() => !document.documentElement.hasAttribute("data-keyboard")), `${at} ${mode}: the keyboard closes`);
      await this.page.waitForTimeout(500);
      const outer = await frameBox();
      const inner = await f.evaluate(() => ({ composer: document.querySelector(".composer")!.getBoundingClientRect().bottom, h: innerHeight, under: getComputedStyle(document.documentElement).getPropertyValue("--under").trim() }));
      assert(near(outer.bottom, H) && near(inner.composer, inner.h) && inner.under === `${phone.bottom}px`, `${at} ${mode}: after the keyboard, the frame and the message box go back down, with the home bar again`);
    };
    const focus = async () => {
      await f.locator("#text").click();
      await this.until(() => this.page.evaluate(() => document.documentElement.hasAttribute("data-keyboard") && document.documentElement.hasAttribute("data-frame-typing")), `${at}: the app knows that the message box has the focus`);
    };
    const keyboard = () =>
      this.page.evaluate((h) => {
        const k = document.createElement("div");
        k.id = "test-keyboard";
        k.textContent = "keyboard";
        k.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${h}px;z-index:2147483647;display:grid;place-items:center;background:#cfd2d8;color:#6b6f78;font:15px -apple-system,system-ui`;
        document.body.append(k);
      }, phone.keyboard);
    const unkeyboard = () => this.page.evaluate(() => document.getElementById("test-keyboard")?.remove());
    // As iOS covers the web view.
    await focus();
    await this.page.evaluate((h) => {
      Object.defineProperty(visualViewport, "height", { configurable: true, get: () => h });
      visualViewport!.dispatchEvent(new Event("resize"));
    }, H - phone.keyboard);
    await this.page.waitForTimeout(500);
    await open("(iOS covers the web view)");
    await keyboard();
    await this.shot(`${theme}-${phone.w}-keyboard`);
    await unkeyboard();
    await f.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await this.page.evaluate(() => {
      delete (visualViewport as unknown as Record<string, unknown>).height;
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    await closed("(iOS covers the web view)");
    // As iOS 26 makes the web view shorter.
    await focus();
    await this.page.setViewportSize({ width: phone.w, height: H - phone.keyboard });
    await this.page.waitForTimeout(500);
    await open("(iOS 26 makes the web view shorter)");
    await f.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await this.page.setViewportSize({ width: phone.w, height: H });
    await closed("(iOS 26 makes the web view shorter)");
    s = await still();
    assert(s.scroll <= 0 && s.y === 0, `${at}: after the keyboard, the page still does not scroll`);
  }
}

// WebKit of Playwright on the Mac cannot keep a CryptoKey in IndexedDB: it waits for the keychain for good. A WebKit
// of an iPhone can. So in the check, the pairing (src/link.ts) keeps its keys as JWK in IndexedDB, and gets them back
// as CryptoKeys when it reads them.
function KEYS() {
  if (window !== top) return;
  // The key pair of the pairing is ECDH (newKeys in src/link.ts), and only an extractable key becomes a JWK.
  const S = crypto.subtle as any, gen = S.generateKey.bind(S), imp = S.importKey.bind(S);
  S.generateKey = (alg: any, x: boolean, use: string[]) => gen(alg, alg?.name === "ECDH" || x, use);
  const plain = (v: any) => v && typeof v === "object" && (v.constructor === Object || Array.isArray(v));
  const has = (v: any): boolean => v instanceof CryptoKey || (plain(v) && Object.values(v).some(has));
  const map = async (v: any, f: (v: any) => Promise<any> | undefined): Promise<any> => {
    const done = f(v);
    if (done) return done;
    if (!plain(v)) return v;
    const out: any = Array.isArray(v) ? [] : {};
    for (const [k, x] of Object.entries(v)) out[k] = await map(x, f);
    return out;
  };
  const pack = (v: any) => map(v, (k) => (k instanceof CryptoKey ? S.exportKey("jwk", k).then((jwk: unknown) => ({ jwk, alg: k.algorithm, usages: k.usages })) : undefined));
  const unpack = (v: any) => map(v, (k) => (plain(k) && k.jwk && k.alg ? imp("jwk", k.jwk, k.alg, true, k.usages) : undefined));
  // A request of the page gets its result when the key is ready.
  const later = (start: (done: (r: unknown) => void, fail: (e: unknown) => void) => void) => {
    const req: any = { onsuccess: null, onerror: null, result: undefined, error: null };
    start((r) => ((req.result = r), req.onsuccess?.({ target: req })), (e) => ((req.error = e), req.onerror?.({ target: req })));
    return req;
  };
  const P = IDBObjectStore.prototype as any, put = P.put, get = P.get, getAll = P.getAll;
  P.put = function (value: unknown, key?: IDBValidKey) {
    if (this.name !== "pairing" || !has(value)) return put.call(this, value, key);
    const db = this.transaction.db, name = this.name;
    return later((done, fail) =>
      pack(value).then((packed) => {
        const r = put.call(db.transaction(name, "readwrite").objectStore(name), packed, key);
        r.onsuccess = () => done(r.result);
        r.onerror = () => fail(r.error);
      }, fail),
    );
  };
  for (const [name, f] of [["get", get], ["getAll", getAll]] as const)
    P[name] = function (...a: unknown[]) {
      const r = f.apply(this, a);
      if (this.name !== "pairing") return r;
      return later((done, fail) => ((r.onsuccess = () => unpack(r.result).then(done, fail)), (r.onerror = () => fail(r.error))));
    };
}

// The texts and controls of the page that go past its left, right or top edge, as in screen-lint.ts: an element in a
// list that scrolls or clips to the side is not cut.
function CUT() {
  const W = innerWidth, cut: string[] = [];
  const clipped = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) return true;
    return false;
  };
  for (const el of document.body.querySelectorAll("*")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
    if (!own && !el.matches("button, input, textarea, [role=button]")) continue;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width || !r.height || s.visibility === "hidden" || s.opacity === "0") continue;
    if ((r.left < -1 || r.right > W + 1 || (r.top < -1 && s.position === "fixed")) && !clipped(el)) cut.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30));
  }
  return cut.slice(0, 3);
}
// A placeholder fits on one line: its width in the font of its field is less than the room of the field.
function FITS(selector: string) {
  const t = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!t) return false;
  const s = getComputedStyle(t), c = document.createElement("canvas").getContext("2d")!;
  c.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  return c.measureText(t.placeholder).width <= t.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
}

// The steps that start an agent or save a look, on the stand-in page of the bridge, with each call of the page kept.
async function flows(page: Page, theme: string, engine: string) {
  const at = `${engine} ${theme} (stand-in page)`;
  // The stand-in keeps each call, and the agent "Live UI" starts now, so it is young.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, any>;
    w.calls = [];
    let y: any;
    Object.defineProperty(window, "yonder", {
      configurable: true,
      get: () => y,
      set(v) {
        y = v;
        for (const k of ["start", "avatar", "rename"]) {
          const f = v.mice[k];
          v.mice[k] = (...a: unknown[]) => (w.calls.push([k, ...a]), f(...a));
        }
        const list = v.mice.list;
        v.mice.list = async () => (await list()).map((m: any) => (m.name === "Live UI" ? { ...m, startedAt: Date.now(), createdAt: Date.now() } : m));
      },
    });
  });
  const html = tryPage(SAMPLES[theme]());
  await page.route("http://screen.test/", (r) => r.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://screen.test/");
  const calls = () => page.evaluate(() => (window as unknown as { calls: unknown[][] }).calls);
  const avatars = async () => (await calls()).filter((c) => c[0] === "avatar") as [string, string, { shape: string; color: string }][];
  const valid = (a: { shape: string }) => (theme === "duet" ? a.shape.split("-").length === 3 : /^[a-z]+$/.test(a.shape));
  await page.waitForTimeout(1500);
  let saved = await avatars();
  assert(saved.length === 1 && saved[0][1] === "a3" && valid(saved[0][2]), `${at}: an old agent with no look gets a surprise look at once, and the one with a look keeps it`);
  await page.waitForTimeout(5000);
  saved = await avatars();
  assert(saved.length === 2 && saved[1][1] === "a2", `${at}: a young agent gets its surprise look after 5 seconds, so a look from another phone comes first`);
  // A new agent: the draft has a surprise look, and the first message starts the agent with that look.
  await page.click("#new");
  await page.fill("#text", "Make the hero one line");
  await page.click("#send");
  await page.waitForTimeout(500);
  const all = await calls();
  const start = all.find((c) => c[0] === "start"), mine = (await avatars()).find((c) => c[1] === "15");
  assert(start?.[1] === "Make the hero one line" && mine && valid(mine[2]), `${at}: the first message starts the agent and saves the look of its draft for it`);
  await page.click("#back");
  // Edit: a tap on the name in a chat opens the sheet, and Save keeps the new look and the new name.
  await page.click(`[data-tab="done"]`);
  await page.click(`[data-num="9"]`);
  await page.click("#who");
  await page.click(theme === "duet" ? `[data-hat="tophat"]` : `[data-shape="star"]`);
  await page.fill("#nm", "Invoices");
  await page.click("#ok");
  await page.waitForTimeout(300);
  const edit = (await avatars()).at(-1)!, renamed = (await calls()).find((c) => c[0] === "rename");
  assert(edit[1] === "a3" && (theme === "duet" ? edit[2].shape.startsWith("tophat-") : edit[2].shape === "star") && renamed?.[2] === "Invoices", `${at}: Edit saves the new look and the new name`);
  await page.close();
}

try {
  // 3. The steps that start an agent or save a look, on the stand-in page: no bridge needed.
  for (const engine of ENGINES) {
    const browser = await engine.launch();
    browsers.push(browser);
    for (const theme of PIXEL) await flows(await browser.newPage({ viewport: { width: 402, height: 812 } }), theme, engine.name());
  }
  // The check of the bridge for each new version of a screen: it throws not, it calls ready(), and it cuts nothing.
  for (const theme of PIXEL) assert(!(await lintScreen(SAMPLES[theme]())), `${theme} passes the check of a new screen version (screen-lint.ts)`);

  for (let i = 0; i < 100; i++) {
    const up = await Promise.all([fetch(`http://127.0.0.1:${PORT}/ui`).then(() => true, () => false), fetch(`http://127.0.0.1:${vitePort}/`).then(() => true, () => false)]);
    if (up.every(Boolean)) break;
    await Bun.sleep(200);
  }
  const { connectRelay } = await import(join(WT, "bridge/relay.ts"));
  const relay = connectRelay("wss://relay.yonder.so", CONFIG, process.env.APNS_TEAM_ID ?? "", (req: Request) => {
    const u = new URL(req.url);
    u.port = String(PORT);
    return fetch(new Request(u, req));
  });
  // The agent that waits asks the user, as before a release.
  const agent = new Client({ name: "fake-agent", version: "0.1.0" });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp?worker=${APPROVAL_AGENT}`)));
  const ask = () => void agent.callTool({ name: "ask_user", arguments: APPROVAL }, undefined, { timeout: 600_000 }).catch(() => {});

  for (const engine of ENGINES) {
    const browser = await engine.launch();
    browsers.push(browser);
    const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
    // The page loads the modules of the app (src/) by their path, as screens-e2e.ts does.
    await context.addInitScript(() => ((window as any).load = (m: string) => import(new URL(m, location.href).href)));
    if (engine === webkit) await context.addInitScript(KEYS);
    // The notch and the home bar are there before the app starts, as on an iPhone: the CSS of the app reads them as
    // --inset-top and --inset-bottom (the frame of a page gets --under from them when it opens).
    await context.addInitScript(() => {
      if (window !== top) return;
      const [t, b] = (localStorage.getItem("test-insets") ?? "62,34").split(",");
      const set = () => (document.documentElement.style.setProperty("--inset-top", `${t}px`), document.documentElement.style.setProperty("--inset-bottom", `${b}px`));
      if (document.documentElement) set();
      else new MutationObserver((_, o) => document.documentElement && (set(), o.disconnect())).observe(document, { childList: true });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => (m.type() === "error" && errors.push(m.text()), process.env.DEBUG && console.log(`page: ${m.text().slice(0, 200)}`)));
    const { link } = await relay.pair();
    await page.goto(`http://localhost:${vitePort}/`);
    await within(
      page.evaluate(async (link) => {
        const L = await (window as any).load("/src/link.ts");
        await L.savePairing(await L.pair(link, "iPhone"));
        localStorage.setItem("theme", "light");
      }, link),
      `${engine.name()}: the phone pairs`,
    );
    await page.reload();
    const app = new App(page, engine.name());
    await app.phone(PHONES[0]);
    await page.waitForSelector("[role=tab]");
    // A new phone takes the values of phone.json at its first sync (src/phone-config.ts), so a pick before that sync
    // ends goes away: the first engine left another screen in the file.
    await page.waitForFunction(() => !!localStorage.getItem("phoneConfigSeen"), undefined, { timeout: 30_000 });
    assert(true, `${engine.name()}: the app pairs through the relay and shows the agents of the test bridge`);

    // 1. The pictures of the gallery, from WebKit, the engine of the iPhone.
    if (process.env.GALLERY !== "0" && engine === webkit) {
      for (const theme of THEMES)
        for (const look of ["light", "dark"]) {
          await app.use(theme, look);
          await app.settled(theme);
          await app.picture(theme, `agents-${look}`);
          await app.openChat(theme);
          await app.picture(theme, `chat-${look}`);
        }
      // A question sets its agent to waiting again, so each picture of an approval shows the same rows under the card.
      for (const theme of THEMES)
        for (const look of ["light", "dark"]) {
          await app.use(theme, look);
          await app.shows(theme);
          ask();
          await app.waitApproval(theme);
          await app.picture(theme, `approval-${look}`);
          await app.denyAll();
        }
      console.log(`gallery: ${GALLERY}`);
    }

    // 2. The phone check of Duet and Grok Bot at each size.
    for (const phone of PHONES)
      for (const theme of PIXEL) {
        await app.phone(phone);
        await app.use(theme, "light");
        await app.check(theme, phone, ask);
      }
    // The app in a browser has no native parts, so some calls fail: the errors are for a look, not a fail.
    if (errors.length) console.log(`${engine.name()}: errors of the page: ${[...new Set(errors)].slice(0, 6).join(" | ")}`);
    await context.close();
  }
  console.log(`shots: ${SHOTS}`);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  for (const p of procs) p.kill();
  if (!process.env.KEEP) rmSync(HOME, { recursive: true, force: true });
}
// The socket of the relay keeps the process alive.
process.exit(0);
