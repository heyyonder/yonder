// The made-up data of the theme check and of the theme screenshots (bridge/themes-e2e.ts): seven agents, the chat of one,
// and one approval. Each theme shows the same data, so the screenshots of the theme gallery compare. The data goes into a test bridge: its state.json, the transcript of the
// chats, and a stand-in for Claude Code that lists the running agents and starts nothing, so the check uses no credits.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const session = (num: number) => `00000000-0000-4000-8000-0000000000${String(num).padStart(2, "0")}`;
// The agent with the chat. It runs: its last step is an edit, which the app shows as its activity. Two more agents run,
// each with one step, so the list of the running agents has three rows.
export const CHAT_AGENT = "Landing hero";
const AGENTS = [
  { num: 14, name: CHAT_AGENT, project: "yonder-landing", status: "running", minutes: 0, task: "Make the hero say Talk to your agents" },
  { num: 13, name: "Weather widget", project: "weather", status: "running", minutes: 0, task: "Show the rain of the next hour", step: ["Bash", { command: "xcrun simctl launch booted so.weather", description: "Run the widget in the simulator" }] },
  { num: 10, name: "Morning brief", project: "news", status: "running", minutes: 0, task: "Write the morning brief", step: ["WebSearch", { query: "AI agents news October 23" }] },
  { num: 12, name: "App Store release", project: "weather", status: "waiting", minutes: 4, task: "Get version 1.4 ready for the App Store", result: "Version 1.4 is ready: the widget shows the rain of the next hour.", next: "Ship version 1.4 to the App Store?" },
  { num: 11, name: "Live UI", project: "yonder", status: "done", minutes: 38, task: "Move the tab bar to the bottom", result: "The phone shows the new tab bar, and the build passes." },
  { num: 9, name: "October invoice", project: "time", status: "done", minutes: 180, task: "Send the October invoice", result: "I sent invoice 2026-031 to Acme for $4,200." },
  { num: 7, name: "Nightly backup", project: "ops", status: "failed", minutes: 1500, task: "Check the nightly backup", result: "The backup stopped: the disk of the server is full." },
] as const;

// The approval for the ask_user tool, from the agent that waits: a question with Allow and Deny. A question sets its
// agent to waiting, and a Deny sets it to running, so the pictures of the approvals come after all the other pictures.
export const APPROVAL_AGENT = "w12";
export const APPROVAL = {
  kind: "yes-no",
  title: "Ship to the App Store?",
  text: "I upload version 1.4 of Weather for App Review.",
  rows: [
    ["App", "Weather"],
    ["Version", "1.4 (52)"],
  ],
};

// The chat of the running agent: two turns with tool calls, and a third turn that edits now.
function transcript(path: string, at: (s: number) => string) {
  const tool = (id: string, name: string, input: object, s: number) => ({ type: "assistant", timestamp: at(s), message: { role: "assistant", model: "claude-opus-5-5", content: [{ type: "tool_use", id, name, input }] } });
  const result = (id: string, text: string, s: number) => ({ type: "user", timestamp: at(s), message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: text }] } });
  const say = (text: string, s: number) => ({ type: "assistant", timestamp: at(s), message: { role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text }] } });
  const ask = (text: string, s: number) => ({ type: "user", timestamp: at(s), message: { role: "user", content: text } });
  const hero = join(path, "src/Hero.jsx");
  return [
    ask("Make the hero say Talk to your agents, and make the button blue.", 0),
    tool("t1", "Read", { file_path: hero }, 3),
    result("t1", "export function Hero() {\n  return <h1>Your agents, by voice</h1>\n}\n", 4),
    tool("t2", "Edit", { file_path: hero, old_string: "Your agents, by voice", new_string: "Talk to your agents" }, 5),
    result("t2", "The file was updated.", 6),
    tool("t3", "Bash", { command: "bun run build", description: "Build the landing page" }, 7),
    result("t3", "✓ 41 modules transformed.\n✓ built in 1.2s", 9),
    say("The hero now says **Talk to your agents**, and the button is blue.\n\n- `src/Hero.jsx`: the new words\n- `src/hero.css`: the blue button\n\nThe build passes.", 10),
    ask("Nice. Is it on main?", 30),
    tool("t4", "Bash", { command: "git log --oneline -1", description: "Show the last commit" }, 31),
    result("t4", "a1b2c3d The hero says Talk to your agents", 32),
    say("Yes. It is on main as `a1b2c3d`.", 33),
    ask("Now make the hero one line on the phone.", 60),
    tool("t5", "Edit", { file_path: hero, old_string: "<h1>", new_string: '<h1 className="one-line">' }, 62),
  ];
}

// Writes the data into the home folder and the config folder of a test bridge. It gives the folder of the stand-in for
// Claude Code, to put first in PATH. `pid` is a process that lives while the check runs: the running agents have it.
export function writeMock(home: string, config: string, projects: string, pid = process.pid) {
  const now = Date.now();
  const workers = AGENTS.map((a) => {
    const path = join(projects, a.project);
    mkdirSync(path, { recursive: true });
    const at = now - a.minutes * 60_000;
    const result = "result" in a ? a.result : "";
    return { id: `w${a.num}`, num: a.num, sessionId: session(a.num), name: a.name, project: a.project, path, task: a.task, status: a.status, activity: "", result, unread: a.status === "done" && a.minutes < 60, attention: a.status === "waiting", startedAt: at - 300_000, createdAt: at - 300_000, updatedAt: at };
  });
  // The summary of each answer is in the state already (its key is answerKey in bridge/main.ts), so no summary runs.
  const summaries = Object.fromEntries(
    AGENTS.filter((a) => "result" in a).map((a) => [
      session(a.num),
      { key: "l" + Bun.hash(a.result).toString(36), next: "next" in a ? a.next : a.status === "failed" ? "Free space on the server, then run it again." : "Done", text: `- ${a.result}` },
    ]),
  );
  writeFileSync(join(config, "state.json"), JSON.stringify({ workers, summaries }));
  writeFileSync(join(config, "config.json"), JSON.stringify({ agentName: { one: "agent", many: "agents" } }));
  const at = (s: number) => new Date(now - 90_000 + s * 1000).toISOString();
  const running = workers.filter((w) => w.status === "running");
  for (const w of running) {
    const a = AGENTS.find((a) => a.num === w.num)!;
    const events =
      "step" in a
        ? [
            { type: "user", timestamp: at(0), message: { role: "user", content: a.task } },
            { type: "assistant", timestamp: at(2), message: { role: "assistant", model: "claude-opus-5-5", content: [{ type: "tool_use", id: "s1", name: a.step[0], input: a.step[1] }] } },
          ]
        : transcript(w.path, at);
    const folder = join(home, ".claude", "projects", w.path.replace(/[^a-zA-Z0-9]/g, "-"));
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, `${w.sessionId}.jsonl`), events.map((e) => JSON.stringify({ ...e, sessionId: w.sessionId, cwd: w.path })).join("\n") + "\n");
  }
  // The stand-in for Claude Code: `claude agents` lists the running agents as busy, so they stay running, and each other
  // command fails, so the check never starts a session.
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  const listed = running.map((w) => ({ id: w.sessionId.slice(0, 8), sessionId: w.sessionId, cwd: w.path, kind: "background", pid, state: "working", status: "busy", startedAt: w.startedAt }));
  writeFileSync(join(bin, "agents.json"), JSON.stringify(listed));
  writeFileSync(join(bin, "claude"), `#!/bin/sh\ncase "$1" in\n  agents) cat ${JSON.stringify(join(bin, "agents.json"))} ;;\n  --version) echo "2.1.0 (Claude Code)" ;;\n  *) exit 1 ;;\nesac\n`, { mode: 0o755 });
  return bin;
}
