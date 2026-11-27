// A fake ACP agent for bridge/clis-check.ts, in the place of codex-acp. It answers the ACP calls of the ACP host as a
// real agent does, with no network and no credits: each prompt gives a piece of text, one shell call and an answer.
// A prompt with SLOW runs for 6 seconds, for the stop and the restart. Each call adds a line to $FAKE_LOG.
import { appendFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const note = (method: string, params?: unknown) =>
  appendFileSync(process.env.FAKE_LOG!, `${JSON.stringify({ pid: process.pid, cli: "codex-acp", method, params, config: process.env.CODEX_CONFIG })}\n`);
const modes = {
  availableModes: ["read-only", "agent", "agent-full-access"].map((id) => ({ id, name: id })),
  currentModeId: "agent",
};
const stops = new Map<string, () => void>();
let sessions = 0;

new acp.AgentSideConnection(
  (client) => ({
    async initialize() {
      note("initialize");
      return { protocolVersion: acp.PROTOCOL_VERSION, agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} }, mcpCapabilities: { http: true } } };
    },
    async newSession(p) {
      note("newSession", p);
      // An error that the agent does not catch, as Hermes gives with no model: the SDK sends "Internal error" with data.details.
      if (p.cwd.endsWith("/broken")) throw new Error("No model is set. Run hermes model.");
      return { sessionId: `019a1b2c-3d4e-7f00-8a00-00000000000${++sessions}`, modes };
    },
    async resumeSession(p) {
      note("resumeSession", p);
      return { modes };
    },
    async setSessionMode(p) {
      note("setSessionMode", p);
      return {};
    },
    async authenticate() {
      return {};
    },
    async prompt(p) {
      note("prompt", p);
      const text = p.prompt.map((b) => (b.type === "text" ? b.text : "")).join("");
      const update = (u: acp.SessionUpdate) => client.sessionUpdate({ sessionId: p.sessionId, update: u });
      let stopped = false;
      stops.set(p.sessionId, () => (stopped = true));
      await update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "I read " } });
      await update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "the README." } });
      await update({ sessionUpdate: "tool_call", toolCallId: "call-1", title: "Run", kind: "execute", status: "pending", rawInput: {} });
      await update({ sessionUpdate: "tool_call_update", toolCallId: "call-1", status: "in_progress", rawInput: { command: "sed -i '' 's/Readme/README/' README.md" } });
      await update({ sessionUpdate: "tool_call_update", toolCallId: "call-1", status: "completed" });
      for (let i = 0; i < (text.includes("SLOW") ? 40 : 1) && !stopped; i++) await Bun.sleep(150);
      if (stopped) return { stopReason: "cancelled" };
      await update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "The README title is fixed." } });
      return { stopReason: "end_turn" };
    },
    async cancel(p) {
      note("cancel", p);
      stops.get(p.sessionId)?.();
    },
  }),
  acp.ndJsonStream(Writable.toWeb(process.stdout) as WritableStream<Uint8Array>, Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>),
);
