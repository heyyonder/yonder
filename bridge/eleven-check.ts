// Check of the ElevenLabs model of the calls: `bun bridge/eleven-check.ts ["words"]`. The bridge must run.
// It sets up the agent with the tools of the bridge (bridge/eleven.ts), speaks the words with `say` at 48 kHz into a
// real conversation, in real time, answers each tool call with a fake result, and prints the events. Expect a
// user_transcript with the words, an agent_response, and a client_tool_call. The next real call sets the tools of the
// app on the agent again. It costs a few seconds of call time.
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { elevenToken } from "./eleven";

const words = process.argv[2] ?? "Start an agent in the project Yonder to fix the login button.";
const CONFIG = join(process.env.HOME!, ".config/yonder");
const key = readFileSync(join(CONFIG, ".env"), "utf8").match(/^ELEVENLABS_API_KEY=["']?([^"'\n]+)/m)?.[1];
if (!key) throw new Error("Put ELEVENLABS_API_KEY=... in ~/.config/yonder/.env");
const RATE = 48000;

const list = await fetch("http://127.0.0.1:7787/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
}).then((r) => r.json());
const tools = list.result.tools.map(({ name, description, inputSchema: { $schema, ...parameters } }: any) => ({ name, description, parameters }));
const { value } = await elevenToken(key, join(CONFIG, "elevenlabs.json"), tools, RATE);

const file = join(tmpdir(), "eleven-check.wav");
Bun.spawnSync(["say", "-o", file, `--data-format=LEI16@${RATE}`, words]);
const wav = readFileSync(file);
const speech = wav.subarray(wav.indexOf("data") + 8);
// One second of silence before the words and four after them, in frames of 100 ms, as the mic worklet sends them.
const frame = RATE / 5; // 100 ms of PCM16 in bytes
const audio = Buffer.concat([Buffer.alloc(frame * 10), speech, Buffer.alloc(frame * 40)]);

const start = Date.now();
const ws = new WebSocket(value);
ws.onopen = () => {
  ws.send(JSON.stringify({ type: "conversation_initiation_client_data", conversation_config_override: { agent: { prompt: { prompt: "You are Yonder, the voice of a team of coding agents. The only project is Yonder at /home/me/yonder. To start work, first say only \"Agent started.\", and then call start_worker in the same answer. Never ask questions." } } } }));
  let at = 0;
  const timer = setInterval(() => {
    if (at >= audio.length) return clearInterval(timer);
    ws.send(JSON.stringify({ user_audio_chunk: audio.subarray(at, (at += frame)).toString("base64") }));
  }, 100);
  setTimeout(() => ws.close(), 15_000);
};
let heard = 0;
ws.onmessage = ({ data }) => {
  const e = JSON.parse(String(data));
  if (e.type === "ping") return ws.send(JSON.stringify({ type: "pong", event_id: e.ping_event.event_id }));
  if (e.type === "audio") return void (heard += e.audio_event.audio_base_64.length);
  const t = ((Date.now() - start) / 1000).toFixed(2);
  const text = e.user_transcription_event?.user_transcript ?? e.agent_response_event?.agent_response ?? JSON.stringify(e.client_tool_call?.parameters ?? "");
  console.log(t, e.type, e.client_tool_call?.tool_name ?? "", text);
  if (e.type === "client_tool_call") ws.send(JSON.stringify({ type: "client_tool_result", tool_call_id: e.client_tool_call.tool_call_id, result: '{"num":7}', is_error: false }));
};
ws.onclose = (e) => console.log(`closed ${e.code}, ${Math.round((heard * 3) / 4 / 2 / RATE)} s of audio from the agent`);
