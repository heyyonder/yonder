// The end-to-end check of the backup of the settings (bridge/sync.ts): `bun bridge/sync-e2e.ts`. Two test bridges, each
// with its own home folder, sync through a fake yonder.so with the rules of /api/app/sync (the yonder.so backend,
// private, whose own test checks the real server). It uses no credits and no Chrome, and it does not
// touch the bridge on port 7787 or ~/.config/yonder. Each bridge joins the relay with a new identity of its own.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-sync-e2e-"));
const assert = (ok: unknown, what: string) => {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
};
const free = () => {
  const s = Bun.serve({ port: 0, fetch: () => new Response() });
  const p = s.port as number;
  s.stop(true);
  return p;
};

// The fake yonder.so: one backup for the token "t-ada".
let backup = { version: 0, data: {} as Record<string, { v: unknown; at: number }> };
const site = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/api/app/sync") return new Response("", { status: 404 });
    if (req.headers.get("authorization") !== "Bearer t-ada") return Response.json({ error: "Sign in again." }, { status: 401 });
    if (req.method === "GET") return Response.json(url.searchParams.get("version") === String(backup.version) ? { version: backup.version } : backup);
    const body = await req.json();
    if (body.version !== backup.version) return Response.json(backup, { status: 409 });
    backup = { version: backup.version + 1, data: body.data };
    return Response.json({ version: backup.version });
  },
});

type Box = { port: number; config: string; proc: ReturnType<typeof Bun.spawn> };
const boxes: Box[] = [];
function start(name: string, config: Record<string, unknown>, phone: Record<string, unknown>, screens: Record<string, object> = {}) {
  const home = join(TMP, name);
  const port = free();
  const dir = join(home, ".config", `yonder-${port}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify(config));
  writeFileSync(join(dir, "phone.json"), JSON.stringify(phone));
  for (const [screen, look] of Object.entries(screens)) {
    mkdirSync(join(dir, "ui", screen), { recursive: true });
    writeFileSync(join(dir, "ui", screen, "screen.json"), JSON.stringify(look));
  }
  const env = { ...process.env, HOME: home, YONDER_PORT: String(port), YONDER_SITE: `http://127.0.0.1:${site.port}` };
  const proc = Bun.spawn(["bun", join(WT, "bridge/main.ts")], { env, stdout: "ignore", stderr: Bun.file(join(TMP, `${name}.log`)) });
  const box = { port, config: dir, proc };
  boxes.push(box);
  return box;
}
const call = async (b: Box, path: string, body?: object) => {
  const res = await fetch(`http://127.0.0.1:${b.port}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  return res.json();
};
const read = (b: Box, file: string) => JSON.parse(readFileSync(join(b.config, file), "utf8"));
const until = async (what: string, ok: () => unknown | Promise<unknown>, ms = 20_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(250))
    try {
      if (await ok()) return assert(true, what);
    } catch {}
  assert(false, what);
};
const run = (b: Box) => call(b, "/sync?run");

try {
  const style = { name: "Night", kind: "style", theme: "dark", look: { dark: { bg: "#000", text: "#fff", accent: "#0090ff" } } };
  // A: the first computer. B: a new computer with its own values.
  const work = { id: "work", name: "Work", cli: "claude", own: true };
  const a = start("a", { contextDetail: "verbose", steer: true, accent: "#0090ff", defaultFolder: "/a/work", mode: "auto", cli: "work", profiles: [{ ...work, env: { KEY: "a-secret" }, program: "/a/claude" }] }, { theme: "dark", wake: "on" }, { night: style });
  const b = start("b", { contextDetail: "minimal", defaultFolder: "/b/work", profiles: [{ id: "work", name: "Old", cli: "claude", env: { KEY: "b-secret" } }] }, { theme: "light", wake: "off" });
  for (const x of [a, b]) await until(`the bridge on ${x.port} answers`, () => call(x, "/sync").then((s) => s.token === false));
  await until("the screen of A has version 1", () => existsSync(join(a.config, "ui", "night", "1.json")));
  await call(a, "/phone-config", { ui: "night@1" });

  // A signs in: its settings and its screen go up, and nothing that stays on the computer.
  await call(a, "/sync", { token: "t-ada" });
  await until("A backs up its settings", () => backup.data["phone:theme"]);
  await run(a);
  const keys = Object.keys(backup.data);
  assert(["config:contextDetail", "config:steer", "config:accent", "phone:theme", "phone:ui", "screen:night"].every((k) => keys.includes(k)), `the backup has the synced keys: ${keys.join(", ")}`);
  const stay = ["config:defaultFolder", "config:mode", "config:preview", "config:cli", "config:clis", "config:sync", "phone:wake"];
  assert(!keys.some((k) => stay.includes(k) || k.includes("token")), "no path, mode, tunnel, wake word or login goes up");
  assert(backup.data["phone:ui"].v === "night", "the screen in use goes with no version");
  assert(JSON.stringify(backup.data["config:profiles"]?.v) === JSON.stringify([work]), "the profiles go up with no variables and no program");

  // B signs in: a restore. The account wins, and the wake word and the folder stay as they were on B.
  await call(b, "/sync", { token: "t-ada" });
  await until("B gets the theme of the account", () => read(b, "phone.json").theme === "dark");
  await until("B gets the screen and uses it", () => existsSync(join(b.config, "ui", "night", "1.json")) && read(b, "phone.json").ui?.startsWith("night@"));
  assert(read(b, "config.json").contextDetail === "verbose" && read(b, "config.json").steer === true, "B gets the settings of A");
  assert(read(b, "phone.json").wake === "off" && read(b, "config.json").defaultFolder === "/b/work", "B keeps its wake word and its folder");
  const bWork = read(b, "config.json").profiles?.[0];
  assert(bWork?.name === "Work" && bWork.own && bWork.env?.KEY === "b-secret", "B gets the profile of A and keeps its own variables");
  assert(read(b, "config.json").cli !== "work" && existsSync(join(TMP, "b", ".claude-work")), "B keeps its own default profile, and gets a folder to sign in to the profile");

  // A change on each side: both reach the other device, key by key.
  const before = backup.version;
  await call(b, "/phone-config", { theme: "light" });
  await call(a, "/settings", { key: "contextGroup", value: true });
  await run(b);
  await run(a);
  await run(b);
  assert(read(a, "phone.json").theme === "light" && read(b, "config.json").contextGroup === true, "a change on each device reaches the other");
  assert(backup.version > before, "the backup has a new version");
  const settled = backup.version;
  await run(a);
  await run(b);
  assert(backup.version === settled, "no change makes no new version");

  // A delete of a screen reaches the other device.
  await call(a, "/ui", { action: "delete", name: "night" });
  await run(a);
  await run(b);
  assert(!existsSync(join(b.config, "ui", "night")) && !read(b, "phone.json").ui, "a deleted screen goes from B too, and B goes back to the default screen");

  // With Sync off, B keeps its own settings.
  await call(b, "/settings", { key: "sync", value: false });
  await call(a, "/settings", { key: "accent", value: "#30a46c" });
  await run(a);
  await run(b);
  assert(read(b, "config.json").accent === "#0090ff", "with Sync off, B does not change");
  assert((await call(b, "/settings")).schema.find((s: { key: string }) => s.key === "sync").help.startsWith("Off"), "the line under the switch says Off");
  await call(b, "/settings", { key: "sync", value: true });
  await run(b);
  assert(read(b, "config.json").accent === "#30a46c", "Sync on again brings the change");

  // The sign-in stays with mode 600, and a sign-in that yonder.so refuses signs the bridge out.
  assert((statSync(join(a.config, "sync.json")).mode & 0o777) === 0o600, "sync.json has mode 600");
  await call(a, "/sync", { token: "t-old" });
  await run(a);
  assert((await call(a, "/sync")).token === false, "a refused sign-in signs the bridge out");
  console.log("sync-e2e: all checks passed");
} finally {
  for (const b of boxes) b.proc.kill();
  site.stop(true);
  if (!process.env.KEEP) rmSync(TMP, { recursive: true, force: true });
}
