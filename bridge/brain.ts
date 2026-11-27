// The brain of a Claude call (docs/brain.md): one lean `claude -p` session that stays open for the whole call. It gets
// the words of the user as text, makes the tool calls of the bridge itself, and writes short texts that ElevenLabs
// speaks. The app sends to it with POST /brain and reads its texts with GET /brain (src/brain.ts). It runs on the
// Claude subscription, as the summaries do.
import { homedir } from "node:os";

// Short, because the brain does the routing itself. Most of the 48,000 characters of rules for Grok are guards.
export const BRAIN_PROMPT = [
  "You are Yonder, the voice assistant of the user on their Mac. The user talks to you, and a voice reads each of your texts aloud.",
  "Speak in one or two short sentences. Give the gist first. Use no markdown, lists, code, file paths, IDs or long numbers. Say a time as \"5 minutes ago\".",
  'Before the first tool call of each answer, always say what you do in two to five words, for example "Checking the agents."',
  "The tools of Yonder start, read, message and close Claude Code agents. Each agent has a number, and it does the real work in its project folder. A tool never waits for an agent.",
  "Never guess the state of an agent: read it with list_workers or get_worker.",
  "A new request goes to a new agent with start_worker. Use message_worker only when the user names the agent, answers it, or reads its conversation on the screen.",
  "Close, complete or remove an agent only when the user asks for it.",
  'A close ("close it", "done") is close_worker with no done, also for a done agent: it moves to the Closed tab. Set done only for "mark it done" or "completed".',
  'When the user gives work and then says to close the agent ("deploy it and close it", "then close"), set closeWhenDone on that start_worker or ' +
    'message_worker, do not call close_worker, and say that it closes itself when done.',
  "Answer a short question about code or files yourself with Read, Grep and Glob. When a question needs more than a few reads, start a background agent " +
    '(the Agent tool with run_in_background set to true), say "I\'ll check and tell you.", and end your turn. Tell the user its result when it comes.',
  "A message that starts with [Yonder app] is from the app, not words of the user. Tell the user about it in one short sentence only when an agent needs " +
    "them or finished a task that they asked for in this call. When it needs no words, answer only: (quiet)",
  "When the user says goodbye, or asks to end the call or to hang up, say a short goodbye and call end_call. The call ends when your last words play.",
  "show_tab, show_agent and show_workspace change what the screen of the app shows. Use them when the user asks to see or open a tab, an agent or a workspace.",
  "You have no other tools of the app: read_paste. When the user asks for it, say that they can do it in the app.",
].join("\n");

// The options of a brain. bridge/brain-check.ts uses them too. Haiku gets no effort: it has none.
export const brainArgs = (mcp: string, model: string, call = "", talk = "") => [
  "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
  "--model", model, ...(/haiku/.test(model) ? [] : ["--effort", "low"]),
  "--tools", "Agent,Task,Read,Grep,Glob", "--add-dir", homedir(),
  // --mcp-config takes all the values up to the next flag, so a flag must come after it.
  // With the call, the bridge also gives the brain end_call (server() in bridge/main.ts).
  // YONDER_TOKEN of `env` (bridge/main.ts) goes in the header, so the calls need no check of the user (bridge/peer.ts).
  "--mcp-config", JSON.stringify({ mcpServers: { yonder: { type: "http", url: call ? `${mcp}?brain=${call}` : mcp, headers: { "x-yonder-token": "${YONDER_TOKEN:-}" } } } }), "--strict-mcp-config",
  "--setting-sources", "", "--no-session-persistence",
  "--system-prompt", BRAIN_PROMPT + (call ? `\nPass call: "${call}" to each start_worker and message_worker.` : "") + (talk ? `\n\nHow to talk, from the file of the user:\n${talk}` : ""),
  "--permission-mode", "dontAsk", "--allowedTools", "Agent,Task,Read,Grep,Glob,mcp__yonder",
];

// text: words to speak. tool: a tool call, its name and input. done: the end of a turn, with the subtype of its result.
// end: the brain called end_call, so the app ends the call when the last words played. app: a tool of the screen, such
// as show_tab, which the app does: {"name", "input"} in JSON.
export type BrainEvent = { n: number; type: "text" | "tool" | "done" | "end" | "app"; text: string };
export type Brain = ReturnType<typeof startBrain>;
// The numbers count over all the brains, so the `after` of the app stays right when a new brain starts.
let seq = 0;

export function startBrain(claude: string, mcp: string, model: string, call: string, env: Record<string, string | undefined>, cwd: string, talk = "") {
  const proc = Bun.spawn([claude, ...brainArgs(mcp, model, call, talk)], {
    cwd,
    // Haiku with no effort still thinks for a long time, as in ask() of bridge/main.ts.
    env: /haiku/.test(model) ? { ...env, MAX_THINKING_TOKENS: "0" } : env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  });
  const events: BrainEvent[] = [];
  let wake: (() => void)[] = [];
  const push = (type: BrainEvent["type"], text: string) => {
    events.push({ n: ++seq, type, text });
    wake.forEach((w) => w());
    wake = [];
  };
  // A turn runs from its init event to its result. It starts for a message, or for a background agent that finishes.
  let running = false;
  // stop() mutes the rest of the turn that it stops: the old answer must not play after the new words of the user.
  // Claude Code still gives a word or two of that turn after the interrupt.
  let muted = false;
  (async () => {
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of proc.stdout) {
      buf += decoder.decode(chunk, { stream: true });
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let e;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (e.parent_tool_use_id) continue; // The steps of a background agent.
        if (e.type === "system" && e.subtype === "init") running = true;
        // Claude Code gives each block of an answer as its own event, so the note before a tool call comes at once.
        if (e.type === "assistant" && !muted)
          for (const c of e.message?.content ?? []) {
            if (c.type === "text" && c.text.trim()) push("text", c.text.trim());
            if (c.type === "tool_use") push("tool", `${c.name.replace("mcp__yonder__", "")} ${JSON.stringify(c.input)}`.slice(0, 500));
          }
        if (e.type === "result") {
          running = false;
          push("done", muted ? "stopped" : e.subtype ?? "");
          muted = false;
        }
      }
    }
    push("done", "exit");
  })();
  const write = (event: object) => {
    proc.stdin.write(JSON.stringify(event) + "\n");
    proc.stdin.flush();
  };
  return {
    call,
    alive: () => proc.exitCode === null && !proc.killed,
    send: (text: string) => write({ type: "user", message: { role: "user", content: text } }),
    // Stops the turn that runs, if one runs. The interrupt also drops the messages that wait in the queue of Claude
    // Code, but a message that comes after it runs (in a test, its answer came 0.6 s after the stop).
    stop: () => {
      if (!running) return;
      muted = true;
      write({ type: "control_request", request_id: `stop-${Date.now()}`, request: { subtype: "interrupt" } });
    },
    // The events after `n`. With none yet, it waits up to `wait` ms for the next one.
    async after(n: number, wait = 8000) {
      if (!events.some((e) => e.n > n)) await new Promise<void>((r) => (wake.push(r), setTimeout(r, wait)));
      return events.filter((e) => e.n > n);
    },
    hangUp: () => push("end", ""),
    app: (name: string, input: Record<string, string>) => push("app", JSON.stringify({ name, input })),
    close: () => proc.kill(),
  };
}

// POST /brain {call, text?, stop?, end?} sends to the brain of the call, and starts it when it does not run. A POST with
// no text starts it early, so that the first answer does not wait for it. GET /brain?call=<id>&after=<n> gives its new
// events. A new call starts a new brain, as each call of Grok starts fresh (wiki).
// shortcut: one brain for the bridge, so a second device that calls at the same time takes it over. Keep one for each call if that happens.
let brain: Brain | undefined;
let usedAt = 0;
export async function brainRoute(req: Request, url: URL, start: (call: string) => Brain) {
  usedAt = Date.now();
  if (req.method !== "POST") {
    // No brain for this call: wait a little, so that the poll of the app does not spin.
    if (brain?.call !== url.searchParams.get("call")) return Bun.sleep(2000).then(() => Response.json([]));
    return Response.json(await brain!.after(Number(url.searchParams.get("after")) || 0));
  }
  const body = (await req.json().catch(() => ({}))) as { call?: string; text?: string; stop?: boolean; end?: boolean };
  const call = String(body.call ?? "");
  if (body.end) {
    if (brain?.call === call) {
      brain.close();
      brain = undefined;
    }
    return Response.json({ ok: true });
  }
  if (!brain || brain.call !== call || !brain.alive()) {
    brain?.close();
    brain = start(call);
    // A first turn puts the prompt and the tools in the cache, so the first answer to the user comes sooner. In a
    // check, the first note of a cold brain came 2.3 s after the words of the user.
    if (!body.text) brain.send("[Yonder app] The call started. Answer only: (quiet)");
  }
  if (body.stop) brain.stop();
  if (body.text) brain.send(String(body.text));
  // The number of the last event so far: with new words of the user, the app drops the texts up to it (src/brain.ts).
  return Response.json({ ok: true, n: seq });
}
// end_call of the brain of a call (server() in bridge/main.ts).
export function hangUp(call: string) {
  if (brain?.call !== call) throw new Error("This call has ended already.");
  brain.hangUp();
  return "The call ends when your last words play.";
}
// show_tab, show_agent and show_workspace of the brain of a call (server() in bridge/main.ts).
export function appTool(call: string, name: string, input: Record<string, string>) {
  if (brain?.call !== call) throw new Error("This call has ended already.");
  brain.app(name, input);
  return "Done. The screen of the app shows it now.";
}
// A call that ends with no POST of end (the app quit or lost the network) leaves its brain. It stops after 15 minutes with no request.
setInterval(() => {
  if (!brain || Date.now() - usedAt < 15 * 60_000) return;
  brain.close();
  brain = undefined;
}, 60_000).unref();
