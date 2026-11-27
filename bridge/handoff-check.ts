// Check the first message of an agent that moves to another CLI: `bun bridge/handoff-check.ts`. It uses no credits.
import { handoffText } from "./handoff";

function assert(ok: unknown, what: string) {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
}

// A long session: 300 tool calls after the first message of the user, then the last answer.
const history = [
  { who: "user", text: "Build the house model." },
  ...Array.from({ length: 300 }, (_, i) => ({ who: "tool", text: `Reading room-${i}.json` })),
  { who: "thinking", text: "secret thoughts" },
  { who: "assistant", text: "The house model loads now." },
];
const out = handoffText(history, "Grok", ["/runs/a.jsonl"], "Continue.");
assert(out.includes("User: Build the house model.") && out.includes("Grok: The house model loads now."), "the first message and the last answer stay in a long session");
assert(out.includes("Tool: Reading room-0.json") && out.includes("Tool: Reading room-299.json"), "the tool calls stay");
assert(!out.includes("secret thoughts"), "the thinking does not go");
assert(out.includes("/runs/a.jsonl") && out.endsWith("The user says:\nContinue."), "the files of the old session and the words of the user come last");
assert(out.indexOf("Build the house") < out.indexOf("loads now"), "the turns stay in order");

const small = handoffText([{ who: "user", text: "x".repeat(500) }, { who: "assistant", text: "y".repeat(500) }], "Codex", [], "Go.", 600);
assert(small.includes("y".repeat(500)) && !small.includes("x".repeat(101)) && small.includes("x".repeat(100)), "the budget keeps the newest text");
assert(handoffText([], "Codex", [], "Go.") === "Go.", "no history and no files give the words of the user");
