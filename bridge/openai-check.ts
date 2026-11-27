// Check of the OpenAI call (src/voice.ts): `bun bridge/openai-check.ts`.
// It makes a token as the bridge does, connects as the app does, and sets up the session in the form of the app. Then it
// speaks a request with `say` at 48 kHz through the conversion of the app to 24 kHz. The request must come back as a
// transcript and a call of start_worker, and the answer after the tool result must have audio. It costs about one cent.
// The key: OPENAI_API_KEY in ~/.config/yonder/.env, or in the environment.
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// src/bridge.ts reads `window` when it loads, so give it one.
Object.assign(globalThis, { window: globalThis });
const { b64, to24k } = await import("../src/voice");

const file = join(process.env.HOME!, ".config/yonder/.env");
const key = process.env.OPENAI_API_KEY ?? (existsSync(file) ? readFileSync(file, "utf8") : "").match(/^OPENAI_API_KEY=["']?([^"'\n]+)/m)?.[1];
if (!key) throw new Error("Put OPENAI_API_KEY=... in ~/.config/yonder/.env");

// The same request as token() in bridge/main.ts.
const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 300 }, session: { type: "realtime", model: "gpt-realtime-2.1" } }),
});
const secret = await res.json();
if (!res.ok) throw new Error(`The token request failed: ${secret.error?.message ?? res.status}`);
console.log("token for", secret.session?.model);

// The request at 48 kHz, in frames of 100 ms as the microphone of the app gives them, then 2 s of silence.
const RATE = 48000;
const wav = join(tmpdir(), "openai-check.wav");
Bun.spawnSync(["say", "-o", wav, `--data-format=LEI16@${RATE}`, "Start an agent that fixes the login page of the shop."]);
const data = readFileSync(wav);
const speech = new Int16Array(data.buffer.slice(data.byteOffset + data.indexOf("data") + 8, data.byteOffset + data.length));
const audio = new Int16Array(speech.length + RATE * 2);
audio.set(speech);

// The app sends the token as a subprotocol (["realtime", "openai-insecure-api-key.<token>"]). Bun fails that handshake
// ("Expected 101 status code"), so the check sends it in a header. A curl handshake with the subprotocols of
// the app gets 101 and `sec-websocket-protocol: realtime`, which a browser needs.
const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${secret.session?.model}`, { headers: { Authorization: `Bearer ${secret.value}` } } as never);
const send = (event: object) => ws.send(JSON.stringify(event));
let heard = 0;
let tool = "";
let ok = false;
const done = new Promise<void>((resolve) => {
  ws.onmessage = ({ data }) => {
    const ev = JSON.parse(String(data));
    if (ev.type === "response.output_audio.delta") return void (heard += atob(ev.delta).length);
    if (ev.type === "session.updated") {
      const s = ev.session;
      console.log("session:", s.audio?.output?.voice, `${s.tools?.length} tools`, JSON.stringify(s.audio?.input?.turn_detection), s.audio?.input?.transcription?.model);
    }
    if (/speech_|transcription.completed|transcript.done|^error$/.test(ev.type)) console.log(ev.type, ev.transcript ?? ev.error?.message ?? "");
    if (ev.type === "error") resolve();
    if (ev.type === "response.function_call_arguments.done") {
      console.log("tool:", ev.name, ev.arguments);
      tool = ev.name;
      send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: ev.call_id, output: JSON.stringify({ num: 7 }) } });
    }
    if (ev.type === "response.done") {
      console.log("response:", ev.response?.status, `audio ${heard} bytes`, "usage", JSON.stringify(ev.response?.usage));
      if (ev.response?.output?.some((o: { type: string }) => o.type === "function_call")) send({ type: "response.create" });
      else {
        ok = tool === "start_worker" && heard > 0;
        resolve();
      }
    }
  };
});
ws.onclose = (e) => {
  console.log("closed:", e.code, e.reason);
  process.exit(1);
};
await new Promise((open) => (ws.onopen = open));
// The same form as the session.update of src/voice.ts, with two of the tools.
send({
  type: "session.update",
  session: {
    type: "realtime",
    instructions: "You are Yonder, a voice assistant that starts coding agents. Call start_worker for each request, then say \"Agent started.\" in two words.",
    tools: [
      { type: "function", name: "start_worker", description: "Start a new agent with a task.", parameters: { type: "object", properties: { task: { type: "string" } }, required: ["task"] } },
      { type: "function", name: "list_workers", description: "List the agents.", parameters: { type: "object", properties: {} } },
    ],
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24000 },
        turn_detection: { type: "server_vad", silence_duration_ms: 1200 },
        transcription: { model: "gpt-4o-mini-transcribe" },
      },
      output: { format: { type: "audio/pcm", rate: 24000 }, voice: "marin" },
    },
  },
});
for (let i = 0; i < audio.length; i += RATE / 10) send({ type: "input_audio_buffer.append", audio: b64(to24k(audio.slice(i, i + RATE / 10), RATE).buffer) });
await Promise.race([done, Bun.sleep(30_000)]);
ws.onclose = null;
ws.close();
console.log(ok ? "OK: the transcript, start_worker and the spoken answer came back." : "FAILED: see the events above.");
process.exit(ok ? 0 : 1);
