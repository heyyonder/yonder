// Check of the turn detection of xAI: `bun bridge/vad-check.ts [silence ms] [pause ms]`.
// It speaks "phrase, pause, phrase" with `say` into a real Grok session, in real time, and prints the events.
// The pause must stay in one turn: one transcript with both phrases. xAI does not document silence_duration_ms
// (src/voice.ts). In a test, silence_duration_ms works, semantic_vad and create_response do not.
// It costs about one cent of call time.
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const silence = Number(process.argv[2] ?? 1200);
const pause = Number(process.argv[3] ?? 1200);
const key = readFileSync(join(process.env.HOME!, ".config/yonder/.env"), "utf8").match(/^XAI_API_KEY=["']?([^"'\n]+)/m)?.[1];
if (!key) throw new Error("Put XAI_API_KEY=... in ~/.config/yonder/.env");
const RATE = 24000;

// One phrase as PCM16 at RATE, with the silence at the two ends cut off.
function speak(text: string) {
  const file = join(tmpdir(), `vad-check-${text.length}.wav`);
  Bun.spawnSync(["say", "-o", file, `--data-format=LEI16@${RATE}`, text]);
  const wav = readFileSync(file);
  const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + wav.indexOf("data") + 8, wav.byteOffset + wav.length));
  let s = 0, e = pcm.length - 1;
  while (s < e && Math.abs(pcm[s]) < 300) s++;
  while (e > s && Math.abs(pcm[e]) < 300) e--;
  return pcm.slice(s, e + 1);
}
const quiet = (ms: number) => new Int16Array((RATE * ms) / 1000);
const parts = [quiet(500), speak("Make sure that the checkout"), quiet(pause), speak("opens on the live site."), quiet(silence + 3000)];
const audio = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
parts.reduce((at, p) => (audio.set(p, at), at + p.length), 0);
const end = Math.round(((parts[0].length + parts[1].length + parts[2].length + parts[3].length) / RATE) * 1000);

const ws = new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest", { headers: { Authorization: `Bearer ${key}` } } as never);
let start = 0;
const turns: string[] = [];
ws.onmessage = ({ data }) => {
  if (typeof data !== "string") return;
  const ev = JSON.parse(data);
  if (ev.type === "session.updated" && ev.session?.turn_detection) console.log("turn_detection:", JSON.stringify(ev.session.turn_detection));
  if (/speech_|committed|transcription.completed|^error$/.test(ev.type)) console.log(`${Math.round(performance.now() - start)} ms`, ev.type, ev.transcript ?? ev.error?.message ?? "");
  if (ev.type === "conversation.item.input_audio_transcription.completed") turns.push(ev.transcript);
};
await new Promise((open) => (ws.onopen = open));
ws.send(JSON.stringify({
  type: "session.update",
  session: {
    instructions: "This is a test of the microphone. Answer each message with the single word: okay.",
    turn_detection: { type: "server_vad", silence_duration_ms: silence },
    audio: { input: { format: { type: "audio/pcm", rate: RATE }, transport: "binary" }, output: { format: { type: "audio/pcm", rate: RATE }, transport: "binary" } },
  },
}));
await Bun.sleep(1000);
// The app sends new instructions with no turn_detection during a call (`update` in src/voice.ts). The setting must stay.
ws.send(JSON.stringify({ type: "session.update", session: { instructions: "Answer each message with the single word: okay." } }));
await Bun.sleep(1000);
console.log(`The speech ends at ${end} ms, after a pause of ${pause} ms.`);
start = performance.now();
for (let i = 0; i < audio.length; i += RATE / 10) {
  await Bun.sleep(start + (i / RATE) * 1000 - performance.now());
  ws.send(audio.slice(i, i + RATE / 10).buffer);
}
await Bun.sleep(1500);
ws.close();
const ok = turns.length === 1 && /checkout/i.test(turns[0]) && /live site/i.test(turns[0]);
console.log(ok ? "OK: the pause stayed in one turn." : `CUT: ${turns.length} turns: ${JSON.stringify(turns)}`);
process.exit(ok ? 0 : 1);
