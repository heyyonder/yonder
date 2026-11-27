// Check the workspaces (docs/wiki.md, "Workspaces"): `bun bridge/workspaces-check.ts`. It needs no network and no running
// bridge, and it starts no agent, so it uses no credits. It runs bridge/main.ts on a free port with a test home that holds
// the projects of an older bridge, and checks the move into config.json `workspaces`, the old tool names, the live edits
// of the file by an agent, and the pick of the workspace for a new agent when Clef is not there.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}

const free = Bun.serve({ port: 0, fetch: () => new Response() });
const PORT = free.port;
free.stop();
const home = realpathSync(mkdtempSync(join(tmpdir(), "yonder-workspaces-")));
const CONFIG = join(home, `.config/yonder-${PORT}`);
const at = (...p: string[]) => join(home, ...p);
// The folders of the user: five in ~/Sites (one unused), one in ~/Developer with the same name as one in ~/Sites, an added
// folder, a hidden folder, and a subfolder where an agent works.
for (const d of ["Sites/alpha", "Sites/app", "Sites/beta/sub", "Sites/gamma", "Sites/unused", "Sites/hidden", "Developer/app", "other", "Sites/delta"]) mkdirSync(at(d), { recursive: true });
mkdirSync(CONFIG, { recursive: true });
// No Claude Code: a stand-in that lists no session and gives no session to a start, so a start fails after its pick.
mkdirSync(at(".local/bin"), { recursive: true });
writeFileSync(at(".local/bin/claude"), "#!/bin/sh\ncase \"$1\" in agents) echo '[]' ;; esac\n", { mode: 0o755 });
const worker = (id: string, num: number, path: string) => ({ id, num, sessionId: `00000000-0000-4000-8000-00000000000${num}`, name: id, project: "x", path, task: id, status: "closed", activity: "", result: "", unread: false, startedAt: 1, updatedAt: 1 });
const STATE = {
  scan: true,
  extra: [at("other")],
  starred: [at("Sites/gamma"), at("Sites/alpha")],
  hidden: [at("Sites/hidden")],
  abouts: { [at("Sites/alpha")]: "The alpha app." },
  workers: [worker("w1", 1, at("Sites/beta/sub")), worker("w2", 2, at("Developer/app")), worker("w3", 3, at("Sites/hidden"))],
  schedules: [{ id: "s1", name: "Daily", project: at("Sites/app"), task: "Run", next: Date.now() + 86_400_000, createdAt: 1, every: 24, paused: true }],
};
writeFileSync(join(CONFIG, "state.json"), JSON.stringify(STATE));
const CONFIG_IN = { sumUp: false, textUp: false, projectProfiles: { [at("Sites/beta")]: "p2" }, profiles: [{ id: "p2", name: "Second", cli: "claude", own: true }] };
writeFileSync(join(CONFIG, "config.json"), JSON.stringify(CONFIG_IN));

const { CLAUDE_CONFIG_DIR: _, ...parent } = process.env;
let log = "";
let bridge: ReturnType<typeof Bun.spawn>;
async function start() {
  log = "";
  bridge = Bun.spawn(["bun", join(import.meta.dir, "main.ts")], { env: { ...parent, HOME: home, YONDER_PORT: String(PORT), YONDER_OWNER_CHECK: "no", PATH: `${at(".local/bin")}:${parent.PATH}` }, stdout: "pipe", stderr: "pipe" });
  for (const s of [bridge.stdout, bridge.stderr] as ReadableStream<Uint8Array>[]) void (async () => { for await (const c of s) log += new TextDecoder().decode(c); })();
  for (let i = 0; i < 150 && bridge.exitCode === null; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/mcp`).then(() => true, () => false)) return;
    await Bun.sleep(100);
  }
  throw new Error(`The bridge did not start:\n${log}`);
}
async function stop() {
  bridge.kill();
  await bridge.exited;
}
async function client() {
  const c = new Client({ name: "workspaces-check", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`)));
  const raw = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await c.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content.map((x) => x.text).join(""), error: !!r.isError };
  };
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await raw(name, args);
    if (r.error) throw new Error(`${name}: ${r.text}`);
    return JSON.parse(r.text);
  };
  return { c, raw, call };
}
const readConfig = () => JSON.parse(readFileSync(join(CONFIG, "config.json"), "utf8"));
const readState = () => JSON.parse(readFileSync(join(CONFIG, "state.json"), "utf8"));
const waitFor = async (what: () => boolean, ms = 5000) => {
  for (let t = 0; t < ms && !what(); t += 100) await Bun.sleep(100);
  return what();
};

try {
  await start();
  const { c, raw, call } = await client();

  // 1. The move of the projects into config.json.
  const ws = readConfig().workspaces as { id: string; name: string; folder: string; starred?: boolean; description?: string; profile?: string }[];
  assert(
    JSON.stringify(ws.map((w) => [w.id, w.folder])) ===
      JSON.stringify([["gamma", "~/Sites/gamma"], ["alpha", "~/Sites/alpha"], ["app", "~/Sites/app"], ["beta", "~/Sites/beta"], ["app-2", "~/Developer/app"], ["other", "~/other"]]),
    `the used projects become workspaces in the order of the screen, with unique ids: ${JSON.stringify(ws.map((w) => w.id))}`,
  );
  assert(!ws.some((w) => /unused|hidden|delta/.test(w.folder)), "a scanned folder that nobody used, and a hidden folder, become no workspace");
  assert(ws[0].starred && ws[1].starred && !ws[2].starred, "the stars stay");
  assert(ws[1].description === "The alpha app." && ws[3].profile === "p2", "the saved about becomes the description, and the project profile the profile");
  const st = readState();
  assert(st.workers.find((w: { id: string }) => w.id === "w1").workspace === "beta" && st.workers.find((w: { id: string }) => w.id === "w2").workspace === "app-2", "each agent gets the workspace of its deepest folder");
  assert(!st.workers.find((w: { id: string }) => w.id === "w3").workspace, "an agent in a hidden folder gets no workspace, and keeps the group of its folder");
  assert(JSON.stringify([st.extra, st.starred, st.hidden, st.abouts]) === JSON.stringify([STATE.extra, STATE.starred, STATE.hidden, STATE.abouts]) && JSON.stringify(readConfig().projectProfiles) === JSON.stringify(CONFIG_IN.projectProfiles), "the old keys stay as they were, for an older bridge");

  // 2. The old and the new tool names.
  const old = await call("list_projects");
  assert(Array.isArray(old) && JSON.stringify(old.map((p: { name: string; path: string; starred: boolean }) => [p.name, p.path, p.starred])) === JSON.stringify([["gamma", at("Sites/gamma"), true], ["alpha", at("Sites/alpha"), true], ["app", at("Sites/app"), false], ["beta", at("Sites/beta"), false], ["app", at("Developer/app"), false], ["other", at("other"), false]]), `list_projects gives the same names, paths, stars and order as before: ${JSON.stringify(old.map((p: { name: string }) => p.name))}`);
  const tools = (await c.listTools()).tools.map((t) => t.name);
  assert(["list_workspaces", "add_workspace", "edit_workspace", "remove_workspace", "star_workspace", "set_workspace_profile", "workspace_overview"].every((t) => tools.includes(t)) && !tools.some((t) => /_projects?$|^project_/.test(t)), "the list has the workspace tools and no project tool");
  const beta = (await call("list_workspaces", { query: "beta" }))[0];
  assert(beta.id === "beta" && beta.profile === "Second" && beta.folder === at("Sites/beta"), "list_workspaces gives the id, the folder and the profile name");
  const full = (await call("list_workers", { full: true })) as { id: string; workspace?: string }[];
  assert(full.find((w) => w.id === "w1")?.workspace === "beta", "list_workers gives the workspace of each agent");
  assert((await call("list_workers", { workspace: "beta", tab: "closed" })).list.some((w: { num: number }) => w.num === 1), "list_workers keeps the agents of one workspace, by `workspace`");
  assert((await call("list_workers", { project: "beta", tab: "closed" })).list.some((w: { num: number }) => w.num === 1), "list_workers still takes the old argument `project`");

  // 3. An agent edits config.json: a workspace with no folder, an entry with a bad id, one with no description, and a
  // second workspace for a folder that has one. The bridge reads the file again with no restart.
  const file = readConfig();
  file.workspaces.push(
    { id: "music", name: "Music", description: "Songs with Lisa." },
    { id: "Bad Id", name: "Bad" },
    { id: "empty", name: "Empty" },
    { id: "gamma-again", name: "Gamma again", folder: "~/Sites/gamma" },
  );
  writeFileSync(join(CONFIG, "config.json"), JSON.stringify(file, null, 2));
  const live = await call("list_workspaces");
  const music = live.workspaces?.find((w: { id: string }) => w.id === "music");
  assert(music?.path === "workspace:music" && !music.folder && music.about === "Songs with Lisa.", `a workspace with no folder shows at once, with the key workspace:music: ${JSON.stringify(music)}`);
  assert(live.errors?.length === 3 && /Bad Id/.test(live.errors[0]) && /description/.test(live.errors[1]) && /one workspace only/.test(live.errors[2]), `each bad entry is left out with its error: ${JSON.stringify(live.errors)}`);
  assert(Array.isArray(await call("list_projects")), "list_projects stays a bare list for the old apps, also with errors");

  // 4. Changes through the tools keep the entries that the check left out.
  await call("star_workspace", { workspace: "music", starred: true });
  const after = readConfig().workspaces as { id: string; starred?: boolean }[];
  assert(after.some((w) => w.id === "Bad Id") && after.some((w) => w.id === "gamma-again"), "a write of the bridge keeps the bad entries for the agent to fix");
  assert(after.findIndex((w) => w.id === "music") > after.findIndex((w) => w.id === "alpha") && after.find((w) => w.id === "music")?.starred, "a new star goes after the other starred workspaces");
  const order = await call("star_workspace", { order: ["music", "gamma"] });
  assert(JSON.stringify(order) === JSON.stringify(["workspace:music", at("Sites/gamma"), at("Sites/alpha")]), `star_workspace with order puts the starred ones in the new order: ${JSON.stringify(order)}`);
  assert((await raw("edit_workspace", { workspace: "music", folder: "~/Sites/gamma" })).error, "edit_workspace refuses a folder that another workspace has");
  assert((await raw("edit_workspace", { workspace: "beta", folder: "", description: "" })).error, "edit_workspace refuses a workspace with no folder and no description");
  await call("describe_project", { project: "beta", text: "The beta site." });
  assert((await call("list_workspaces", { query: "beta", plain: true })).find((w: { id: string }) => w.id === "beta")?.description === "The beta site.", "describe_project still works as the old name of edit_workspace");
  await call("edit_workspace", { workspace: "alpha", description: "" });
  assert((await call("list_workspaces", { query: "alpha", plain: true }))[0]?.about !== "The alpha app.", "an emptied description does not bring back the about that the project saved");
  await call("set_project_profile", { project: "beta", profile: "default" });
  assert(!readConfig().workspaces.find((w: { id: string }) => w.id === "beta").profile, "set_project_profile still works as the old name of set_workspace_profile");

  // 5. Agents move between workspaces, and a scanned folder becomes a workspace when the user acts on it.
  await call("move_worker", { worker: "1", workspace: "music" });
  let w1 = readState().workers.find((w: { id: string }) => w.id === "w1");
  assert(w1.workspace === "music" && w1.path === at("Sites/beta/sub") && w1.project === "Music", "an agent that moves to a workspace with no folder keeps its folder");
  assert((await call("list_workers", { workspace: "workspace:music", tab: "closed" })).list.some((w: { num: number }) => w.num === 1), "the agents of a workspace with no folder group by its id");
  await call("move_worker", { worker: "1", project: "gamma" });
  w1 = readState().workers.find((w: { id: string }) => w.id === "w1");
  assert(w1.workspace === "gamma" && w1.path === at("Sites/gamma"), "move_worker takes the old argument `project`, and the agent works in the folder of the new workspace");
  assert(!(await raw("workspace_overview", { workspace: "unused" })).error && !readConfig().workspaces.some((w: { id: string }) => w.id === "unused"), "a scanned folder still answers by its name, and a read makes it no workspace");
  await call("star_workspace", { workspace: "unused", starred: true });
  assert(readConfig().workspaces.some((w: { id: string; folder: string }) => w.id === "unused" && w.folder === "~/Sites/unused"), "a star on a scanned folder makes it a workspace");
  const added = await call("add_workspace", { name: "Notes", description: "Notes of the user." });
  assert(added.id === "notes" && added.path === "workspace:notes", "add_workspace makes a workspace with no folder");
  assert((await raw("add_workspace", { name: "Nothing" })).error, "add_workspace refuses a workspace with no folder and no description");
  const again = await call("add_project", { path: at("Sites/gamma") });
  assert(again.id === "gamma", "add_project of a folder that a workspace has gives that workspace");
  await call("remove_workspace", { workspace: "music" });
  assert(!readConfig().workspaces.some((w: { id: string }) => w.id === "music"), "remove_workspace takes the workspace off the file");

  // 6. The pick of the workspace for a new agent with no workspace, with no Clef (no Workers AI key): a workspace or
  // a scanned folder that the task names wins. The stand-in of Claude Code gives no session, so the start fails after it.
  log = "";
  await raw("start_worker", { workspace: "", task: "Fix the login of alpha", name: "Pick check" });
  assert(await waitFor(() => /agent starts in alpha/.test(log)), `the task that names a workspace goes there: ${log.split("\n").filter((l) => /starts in/.test(l)).join(" | ")}`);
  log = "";
  await raw("start_worker", { workspace: "", task: "Fix the header of delta", name: "Pick check" });
  assert(await waitFor(() => /agent starts in delta/.test(log)), "a task that names a scanned folder goes there");
  assert(await waitFor(() => readConfig().workspaces.some((w: { id: string }) => w.id === "delta")), "and that folder becomes a workspace");

  // 7. A second start of the bridge does not move anything again.
  await c.close();
  const text = readFileSync(join(CONFIG, "config.json"), "utf8");
  const stamp = readState().workspacesMigrated;
  await stop();
  await start();
  await (await client()).call("list_workspaces");
  assert(readFileSync(join(CONFIG, "config.json"), "utf8") === text && readState().workspacesMigrated === stamp, "the move runs once: a restart leaves config.json as it was");
  console.log("All workspace checks passed.");
} catch (e) {
  console.error(log.slice(-4000));
  throw e;
} finally {
  bridge!.kill();
  rmSync(home, { recursive: true, force: true });
}
