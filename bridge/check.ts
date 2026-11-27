// End-to-end check of a running bridge: `bun run bridge`, then `bun run test`. YONDER_PORT checks a second bridge.
// It starts real Claude Code workers in a temporary folder.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = process.env.YONDER_PORT || "7787";
const MCP = `http://127.0.0.1:${PORT}/mcp`;
const client = new Client({ name: "yonder-check", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(MCP)));

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[]).map((c) => c.text).join("");
  if (res.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
}
async function settled(id: string) {
  for (let i = 0; i < 180; i++) {
    const w = (await call("list_workers", { full: true })).find((w: { id: string }) => w.id === id);
    if (w.status !== "running") return w;
    await Bun.sleep(1000);
  }
  throw new Error(`worker ${id} is still running after 3 minutes`);
}
function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}

const foreign = await fetch(MCP, { method: "POST", headers: { origin: "https://example.com" } });
assert(foreign.status === 403, "refuses a request from another web page");
const rebind = Bun.spawnSync(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-H", `Host: example.com:${PORT}`, MCP]);
assert(rebind.stdout.toString() === "403", "refuses a request with a foreign Host header");
const tree = mkdtempSync(join(tmpdir(), "yonder-folders-"));
for (const dir of ["b", "A", ".hidden", "node_modules"]) mkdirSync(join(tree, dir));
writeFileSync(join(tree, "file.txt"), "");
const listing = await call("list_folders", { path: tree });
assert(listing.folders.map((f: { name: string }) => f.name).join() === "A,b" && listing.parent === tmpdir().replace(/\/$/, ""),
  "list_folders gives the folders only, in order, with no dot folders or node_modules");
const picture = join(mkdtempSync(join(tmpdir(), "yonder-media-")), "a.png");
writeFileSync(picture, "");
const file = await fetch(`http://127.0.0.1:${PORT}/media?path=${encodeURIComponent(picture)}`);
assert(file.status === 404, "serves no picture that a conversation does not show");

const tools = (await client.listTools()).tools.map((t) => t.name);
assert(["start_worker", "message_worker", "list_workers", "get_worker", "close_worker", "remove_worker"].every((t) => tools.includes(t)), `lists the tools: ${tools.join(", ")}`);

// The summaries of each bridge run in its own ~/.config/yonder*/summarizer folder, and list_workers hides them
// (`summarizer` in main.ts). Else this check counts them, and fails while the test bridge sums up.
// A session without a pid has ended, and list_workers skips it (readSessions in main.ts). Claude Code 2.1.304 lists
// ended background sessions that wait on the user with no pid, and else they stop the release gate.
// The workers of another check run, in a yonder-check- folder, are hidden too (checkRun in main.ts).
const running = (JSON.parse(Bun.spawnSync(["claude", "agents", "--json"]).stdout.toString()) as { sessionId: string; cwd?: string; pid?: number }[])
  .filter((s) => s.pid && !/\/\.config\/yonder[^/]*\/summarizer$|\/yonder-check-\w{6}$/.test(s.cwd ?? ""));
const listed = new Set((await call("list_workers", { full: true })).map((x: { sessionId: string }) => x.sessionId));
assert(running.every((s) => listed.has(s.sessionId)), `list_workers shows the ${running.length} other Claude Code sessions`);

const dir = mkdtempSync(join(tmpdir(), "yonder-check-"));
const w = await call("start_worker", { project: dir, name: "Yonder check", task: "Reply with the word pong. Do not use any tools." });
assert(w.status === "running", "start_worker returns at once");
const done = await settled(w.id);
assert(done.status === "done" && /pong/i.test(done.result) && done.unread, `the worker finishes, unread: ${JSON.stringify(done.result.slice(0, 60))}`);
assert((await call("get_worker", { worker: w.id })).unread === false, "get_worker marks the result as read");
const found = await call("list_workers", { query: "pong the reply" });
assert(found.some((x: { id: string }) => x.id === w.id), "list_workers with query finds the worker by its work");

await call("message_worker", { worker: w.id, message: "Now reply with the word ping. Do not use any tools." });
const again = await settled(w.id);
assert(again.status === "done" && /ping/i.test(again.result), "message_worker continues the same session");
await call("close_worker", { worker: w.id });
await call("undo");
await Bun.sleep(3000); // The poll must not move it back to closed.
assert((await settled(w.id)).status === "done", "undo takes a close back: the worker is done again");
const turns = (await (await fetch(`http://127.0.0.1:${PORT}/conversation?worker=${w.id}`)).json()) as { who: string; text: string }[];
assert(turns.filter((t) => t.who === "user").length === 2 && /ping/i.test(turns.at(-1)!.text), "/conversation gives both turns of the worker");

// A task that keeps an agent busy for about 100 seconds in the foreground. It is not `sleep 120`, because Claude Code
// blocks a standalone sleep: the agent runs it in the background and ends its turn at once, so the check of the queue
// finds no busy agent.
const BUSY = "Run the shell command `ping -c 100 127.0.0.1` in the foreground, then reply with the word late.";
const long = await call("start_worker", { project: dir, name: "Yonder check", task: BUSY });
await Bun.sleep(5000);
const marked = await call("start_worker", { project: dir, name: "Yonder check", task: BUSY });
await Bun.sleep(5000);
await call("complete_worker", { worker: marked.id });
await Bun.sleep(10_000); // The poll must not move it back to running or closed.
assert((await settled(marked.id)).status === "done", "complete_worker moves a running worker to the Completed tab");
await call("close_worker", { worker: long.id });
assert((await settled(long.id)).status === "closed", "close_worker closes a running worker");
await call("complete_worker", { worker: long.id });
await Bun.sleep(3000); // The poll must not move it back to closed.
assert((await settled(long.id)).status === "done", "complete_worker moves a closed worker to the Completed tab");

// Stop and the queue, as in the app: a queued message waits, Edit takes one out, Stop ends the turn and keeps the rest.
// A message to a running worker goes into its live session (typeIn in main.ts) when Claude Code takes it. A tab keeps
// a message out of that path, so these messages wait in the queue of the bridge on every run. Without the tab, the
// check fails each time that typeIn works.
const busy = await call("start_worker", { project: dir, name: "Yonder check", task: BUSY });
await Bun.sleep(5000);
await call("message_worker", { worker: busy.id, message: "First\tqueued." });
await call("message_worker", { worker: busy.id, message: "Second\tqueued." });
await call("unqueue", { worker: busy.id, message: "First" });
await call("stop_worker", { worker: busy.id });
await Bun.sleep(10_000); // The poll must not move it to closed, or send the queue.
const stopped = (await call("list_workers", { full: true })).find((x: { id: string }) => x.id === busy.id);
assert(stopped.status === "waiting" && stopped.queue?.join() === "Second\tqueued.", `stop_worker ends the turn and keeps the worker open with its queue: ${stopped.status} ${JSON.stringify(stopped.queue)}`);
await call("message_worker", { worker: busy.id, message: "Reply with the word pong. Do not use any tools." });
const resumed = await settled(busy.id);
const last = ((await (await fetch(`http://127.0.0.1:${PORT}/conversation?worker=${busy.id}`)).json()) as { who: string; text: string }[]).filter((t) => t.who === "user").at(-1);
assert(resumed.status === "done" && /pong/i.test(resumed.result) && !resumed.queue && last?.text.startsWith("Second\tqueued."), "the next message sends the queue first, in the same session");
const rush = await call("start_worker", { project: dir, name: "Yonder check", task: BUSY });
await Bun.sleep(5000);
await call("message_worker", { worker: rush.id, message: "Reply with the word pong.\tDo not use any tools." });
await call("stop_worker", { worker: rush.id, send: true });
const rushed = await settled(rush.id);
assert(rushed.status === "done" && /pong/i.test(rushed.result) && !rushed.queue, "stop_worker with send sends the queue at once");
// A second Escape at once: the message stays, in the queue or in the conversation. Else a stop one second after the
// send of the queue loses the message.
const twice = await call("start_worker", { project: dir, name: "Yonder check", task: BUSY });
await Bun.sleep(5000);
await call("message_worker", { worker: twice.id, message: "Reply with the word pong.\tDo not use any tools." });
await call("stop_worker", { worker: twice.id, send: true });
await call("stop_worker", { worker: twice.id });
const kept = (await call("list_workers", { full: true })).find((x: { id: string }) => x.id === twice.id);
const told = ((await (await fetch(`http://127.0.0.1:${PORT}/conversation?worker=${twice.id}`)).json()) as { who: string; text: string }[]).some((t) => t.who === "user" && t.text.startsWith("Reply with the word pong."));
assert(told || kept.queue?.some((q: string) => q.startsWith("Reply with the word pong.")), `a stop right after the send keeps the message: ${JSON.stringify(kept.queue)}`);

for (const id of [w.id, long.id, marked.id, busy.id, rush.id, twice.id]) await call("remove_worker", { worker: id });
const left = (await call("list_workers", { full: true })).filter((x: { id: string }) => x.id === w.id || x.id === long.id);
assert(left.length === 0, "remove_worker takes the workers off the list");

console.log("PASS");
process.exit(0);
