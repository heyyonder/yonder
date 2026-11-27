// Check of the Claude call (src/brain.ts, bridge/brain.ts): `bun bridge/claude-call-check.ts`. It starts a second
// bridge from this source on a free port, with its own folder ~/.config/yonder-<port> and the .env of the live bridge,
// and runs the part of the app (brainCall) in this process, with the real parts: the speech model of Apple (/dictate),
// the brain (/brain) and ElevenLabs (/speak). A microphone of 100 ms frames at 48 kHz sends silence, and two questions
// from `say`. The second question comes when the first answer starts to play, so it also checks an interruption and
// show_tab. It costs two short turns of Sonnet on the Claude subscription and a few hundred characters of ElevenLabs.
// The second bridge has no agents of its own, but list_workers gives the Claude Code sessions of this Mac. The two
// questions only read, so the brain starts and messages no agent.
import { mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { brainCall, type BrainEvent } from "../src/brain";

const RATE = 48000;
const FRAME = RATE / 10;
const t0 = performance.now();
const at = () => `${String(Math.round(performance.now() - t0)).padStart(6)} ms`;

const free = Bun.serve({ port: 0, fetch: () => new Response() });
const PORT = free.port;
free.stop();
const BRIDGE = `http://127.0.0.1:${PORT}`;
const config = join(homedir(), `.config/yonder-${PORT}`);
mkdirSync(config, { recursive: true });
symlinkSync(join(homedir(), ".config/yonder/.env"), join(config, ".env"));
const bridge = Bun.spawn(["bun", join(import.meta.dir, "main.ts")], { env: { ...process.env, YONDER_PORT: String(PORT) }, stdout: "ignore", stderr: "inherit" });
const stop = () => {
  bridge.kill();
  rmSync(config, { recursive: true, force: true });
};
process.on("exit", stop);
for (let i = 0; i < 150 && !(await fetch(`${BRIDGE}/mcp`).then(() => true, () => false)); i++) await Bun.sleep(100);

function speech(text: string) {
  const file = join(tmpdir(), `claude-call-check-${text.length}.wav`);
  Bun.spawnSync(["say", "-o", file, `--data-format=LEI16@${RATE}`, text]);
  const wav = readFileSync(file);
  return new Int16Array(wav.buffer.slice(wav.byteOffset + wav.indexOf("data") + 8, wav.byteOffset + wav.length));
}
// The microphone: the frames of what the user says, else silence. The speech is loud enough for the level of a call.
const mic: Int16Array[] = [];
let saidAt = 0; // The end of the sound of the last question.
// `say` takes about 0.8 s, and the microphone must not stop meanwhile, so the questions are made first.
const QUESTIONS = ["How many agents are running right now?", "Stop. Open the done tab."];
const sounds = new Map(QUESTIONS.map((q) => [q, speech(q)]));
const say = (text: string) => {
  console.log(`${at()}  USER SAYS: ${text}`);
  const pcm = sounds.get(text)!;
  for (let i = 0; i < pcm.length; i += FRAME) mic.push(new Int16Array(pcm.subarray(i, i + FRAME)));
};

const call = String(Date.now());
const json = (body: object) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ call, ...body }) });
const ok = async (r: Response) => (r.ok ? r : Promise.reject(new Error((await r.text()) || `status ${r.status}`)));
const start = await fetch(`${BRIDGE}/brain`, json({}));
if (!start.ok) throw new Error(`The brain did not start: ${await start.text()}`);

const heard: { at: number; text: string }[] = []; // The words of the user, as the speech model heard them.
const spoken: { at: number; text: string; bytes: number }[] = []; // The texts that played.
const apps: string[] = [];
let playUntil = 0; // The end of the speech that plays, as the speaker of the app would play it.
let hushed = 0; // The speech stopped while it played.
let second = false;
let failed = "";
let pending = "";
const turns = new Set<string>();
const brain = brainCall({
  rate: RATE,
  post: (body) => fetch(`${BRIDGE}/brain`, json(body)).then(ok).then((r) => r.json()),
  poll: (after) => fetch(`${BRIDGE}/brain?call=${call}&after=${after}`).then(ok).then((r) => r.json() as Promise<BrainEvent[]>),
  dictate: (turn, part, end) => (turns.has(turn) || (turns.add(turn), console.log(`${at()}  TURN ${turn} starts`)), fetch(`${BRIDGE}/dictate?id=${turn}${end ? "&end" : ""}`, { method: "POST", body: part }).then(ok).then((r) => r.json()).then((d) => (d.text && console.log(`${at()}  TEXT ${end ? "last" : "so far"}: ${d.text}`), d.text))),
  speak: (text) => fetch(`${BRIDGE}/speak`, json({ text })).then(ok).then((r) => r.arrayBuffer()),
  play: (pcm) => {
    playUntil = Math.max(playUntil, performance.now()) + (pcm.byteLength / 2 / 24000) * 1000;
    spoken.push({ at: performance.now(), text: pending, bytes: pcm.byteLength });
    console.log(`${at()}  PLAYS (${Math.round(performance.now() - saidAt)} ms after the speech) ${pcm.byteLength} bytes: ${pending}`);
    // The second question interrupts the first answer, when it starts to play.
    if (!second) {
      second = true;
      say(QUESTIONS[1]);
    }
  },
  hush: () => {
    if (performance.now() < playUntil) hushed++, console.log(`${at()}  HUSH`);
    playUntil = 0;
  },
  playing: () => performance.now() < playUntil,
  heard: (text) => (heard.push({ at: performance.now(), text }), console.log(`${at()}  HEARD (${Math.round(performance.now() - saidAt)} ms after the speech): ${text}`)),
  spoke: (text) => (pending = text),
  note: (e) => console.log(`${at()}  brain ${e.type}: ${e.text.slice(0, 120)}`),
  log: (text) => console.log(`${at()}  ${text}`),
  app: (name, input) => apps.push(`${name} ${JSON.stringify(input)}`),
  screen: () => "The Agents tab of all projects. No agent is open.",
  hangUp: () => console.log(`${at()}  HANG UP`),
  fail: (message) => (failed = message),
});

say(QUESTIONS[0]);
const deadline = performance.now() + 45_000;
let wasSaying = false;
while (performance.now() < deadline && !failed && !(apps.length && !brain.talking() && performance.now() > playUntil + 1500)) {
  const frame = mic.shift();
  if (wasSaying && !frame) saidAt = performance.now();
  wasSaying = !!frame;
  brain.frame(frame ?? new Int16Array(FRAME));
  await Bun.sleep(100);
}
brain.end();

const first = heard[0]?.at ?? 0;
const later = heard[1]?.at ?? Infinity;
const checks: [boolean, string][] = [
  [!failed, `no part fails (${failed})`],
  [/agents/i.test(heard[0]?.text ?? ""), `the speech model hears the first question (${heard[0]?.text})`],
  [spoken.some((s) => s.at > first && s.at < later && s.bytes > 0), "the answer to the first question plays as speech"],
  [/done/i.test(heard[1]?.text ?? "") && !/agents are running/i.test(heard[1]?.text ?? ""), `the words of the second question come alone (${heard[1]?.text})`],
  [hushed > 0, "the second question stops the speech that plays"],
  [apps.some((a) => a.startsWith("show_tab") && a.includes("completed")), `the brain opens the done tab in the app (${apps.join(" | ")})`],
];
console.log("\nTexts that played:");
for (const s of spoken) console.log(`  ${Math.round(s.at - t0)} ms: ${s.text}`);
for (const [pass, what] of checks) console.log(`${pass ? "ok" : "FAIL"}: ${what}`);
stop();
process.exit(checks.every(([pass]) => pass) ? 0 : 1);
