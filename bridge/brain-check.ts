// Try-out of the Claude brain of docs/brain.md: `bun bridge/brain-check.ts [--model haiku|sonnet|opus] [--say] ["request" ...]`.
// One lean `claude -p` session keeps running and makes the tool calls of the bridge itself, in place of Grok. Each text
// of the brain prints with the time from the request, so the script also measures the latency of the brain.
// - Each argument is one request. The next one goes after the answer, and the script ends after the last answer.
// - With no request, type each one. A line that you type while the brain works waits in the queue of Claude Code.
//   "stop" interrupts the turn. A change of an agent to waiting, done or failed goes to the brain as [Yonder app] news.
// - --say speaks each text with `say`, as a voice would.
// The bridge must run. The brain uses the Claude subscription, and it can start, message and close real agents.
// It runs in the folder of the summaries, so the bridge does not list it as an agent.
import { homedir } from "node:os";
import { join } from "node:path";
import { brainArgs } from "./brain";

const MCP = "http://127.0.0.1:7787/mcp";
const argv = Bun.argv.slice(2);
const model = argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : "sonnet";
const speak = argv.includes("--say");
const requests = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--model");

// The agents, for the [Yonder app] news. The bridge would write this news itself; here the script reads list_workers.
type Worker = { id: string; num: number; name: string; project: string; status: string };
const listWorkers = async (): Promise<Worker[]> => {
  const res = await fetch(MCP, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_workers", arguments: { full: true } } }),
  }).then((r) => r.json());
  return JSON.parse(res.result.content[0].text);
};
const seen = new Map((await listWorkers().catch(() => {
  throw new Error(`The bridge does not answer at ${MCP}. Start Yonder first.`);
})).map((w) => [w.id, w.status]));

// The brain of a Claude call (bridge/brain.ts), with the parts of the messages, so that the first words get a time.
const proc = Bun.spawn(["claude", ...brainArgs(MCP, model), "--include-partial-messages"], {
  cwd: join(homedir(), ".config/yonder/summarizer"),
  // Haiku with no effort still thinks for a long time, as in ask() of bridge/main.ts, so its thinking is off.
  env: model === "haiku" ? { ...process.env, MAX_THINKING_TOKENS: "0" } : process.env,
  stdin: "pipe",
  stdout: "pipe",
  stderr: "inherit",
});

let sentAt = performance.now();
let busy = false;
const stamp = () => `+${((performance.now() - sentAt) / 1000).toFixed(2)} s`.padStart(9);
const write = (event: object) => (proc.stdin.write(JSON.stringify(event) + "\n"), proc.stdin.flush());
function send(text: string) {
  if (!busy) sentAt = performance.now();
  console.log(`\n> ${text}${busy ? "   (queued: the brain works)" : ""}`);
  busy = true;
  write({ type: "user", message: { role: "user", content: text } });
}
let voice = Promise.resolve();
const say = (text: string) => (voice = voice.then(() => Bun.spawn(["say", text]).exited.then(() => {})));

let firstWords = "";
let done: () => void = () => {};
(async () => {
  let buf = "";
  for await (const chunk of proc.stdout) {
    buf += new TextDecoder().decode(chunk);
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const e = JSON.parse(buf.slice(0, i) || "{}");
      buf = buf.slice(i + 1);
      if (e.parent_tool_use_id) continue; // The steps of a background agent.
      if (e.type === "stream_event" && e.event.type === "message_start") firstWords = "";
      else if (e.type === "stream_event" && e.event.delta?.type === "text_delta") firstWords ||= stamp();
      else if (e.type === "stream_event" && e.event.content_block?.type === "tool_use") console.log(`${stamp()}  [${e.event.content_block.name.replace("mcp__yonder__", "")}]`);
      else if (e.type === "assistant") {
        for (const c of e.message.content) if (c.type === "text" && c.text.trim()) {
          console.log(`${firstWords || stamp()}  ${c.text.trim()}`);
          if (speak && !/^\W*quiet\W*$/i.test(c.text)) say(c.text);
        }
      } else if (e.type === "system" && e.subtype === "task_notification") {
        // The background agent finished. Claude Code starts a turn by itself, with no message of the user.
        sentAt = performance.now();
        busy = true;
        console.log(`\n  (a background agent finished: ${e.status})`);
      } else if (e.type === "result") {
        console.log(`${stamp()}  done${e.subtype === "success" ? "" : ` (${e.subtype})`}`);
        // A queued message starts its turn now, so its times count from here.
        sentAt = performance.now();
        busy = false;
        done();
      }
    }
  }
  console.log("The brain stopped.");
  process.exit(1);
})();

if (requests.length) {
  for (const text of requests) {
    const answered = new Promise<void>((r) => (done = r));
    send(text);
    await answered;
  }
  await voice;
  proc.kill();
  process.exit(0);
}

// shortcut: polls list_workers every 3 s, as the app does; the bridge can push the change itself when the brain moves into it.
setInterval(async () => {
  for (const w of await listWorkers().catch(() => [])) {
    if (seen.get(w.id) === "running" && ["waiting", "done", "failed"].includes(w.status)) send(`[Yonder app] Agent ${w.num} "${w.name}" in ${w.project} is now ${w.status}.`);
    seen.set(w.id, w.status);
  }
}, 3000);
console.log(`The brain runs on ${model}. Type a request, or "stop" to interrupt the brain.`);
for await (const line of console) {
  if (line.trim() === "stop") write({ type: "control_request", request_id: String(Date.now()), request: { subtype: "interrupt" } });
  else if (line.trim()) send(line.trim());
}
// The end of the input (Control-D) ends the script after the current turn.
if (busy) await new Promise<void>((r) => (done = r));
await voice;
proc.kill();
process.exit(0);
