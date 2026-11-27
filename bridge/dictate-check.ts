// Check of dictation: `bun bridge/dictate-check.ts`. It needs the helper in src-tauri/binaries/ (a build of the
// app, or `swiftc -O src-tauri/dictate/main.swift -o src-tauri/binaries/yonder-dictate-aarch64-apple-darwin`).
// `say` speaks a sentence, and the parts go to the helper at the pace of speech, as from the app. Parakeet gets the same
// check when its helper is built (`swift build -c release` in src-tauri/parakeet).
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dictate, transcript, whisperModel } from "./dictate";

// The output of `voxtype transcribe` 1.1.0 on Linux, with speech and with no speech.
const out = 'Loading audio file: "/tmp/a.wav"\nAudio format: 16000 Hz, 1 channel(s), Int\nProcessing 26642 samples (1.67s)...\n\nOpen the Yonder project.\n';
if (transcript(out) !== "Open the Yonder project.") throw new Error(`FAIL: the Voxtype text is ${JSON.stringify(transcript(out))}`);
if (transcript("Processing 5 samples (0.00s)...\nNo speech detected, skipping transcription.\n") !== "") throw new Error("FAIL: no speech gave text");

const wav = join(mkdtempSync(join(tmpdir(), "yonder-dictate-")), "say.wav");
Bun.spawnSync(["say", "--data-format=LEI16@16000", "-o", wav, "Open the landing page project and make the hero title bigger."]);
const bytes = readFileSync(wav);
const sound = bytes.subarray(bytes.indexOf("data") + 8);
const PART = 3200 * 3; // 300 ms
const seconds = sound.length / 32000;
const parakeet = existsSync(join(import.meta.dir, "../src-tauri/parakeet/.build/release/yonder-parakeet"));
// SpeechAnalyzer alone changes the text about once a second. The fast words of SFSpeechRecognizer change it about
// each 0.25 s. In one run, the 3.5 s of this check gave 3 changes without the fast words and 7 with them. Parakeet
// makes the text again after each 0.5 s of sound.
for (const [stt, perSecond] of [["", 1.5], ...(parakeet ? [["parakeet", 1] as const] : [])] as const) {
  // A dictation with no sound ends at once. Else SpeechAnalyzer never ends it, and the helper stays.
  const none = await Promise.race([dictate("check-empty", new Uint8Array(), true, stt), Bun.sleep(5000).then(() => "no end in 5 s")]);
  if (none !== "") throw new Error(`FAIL ${stt}: a dictation with no sound gave ${JSON.stringify(none)}`);
  let live = "";
  let changes = 0;
  for (let i = 0; i < sound.length; i += PART) {
    const text = (await dictate("check12345", sound.subarray(i, i + PART), false, stt)) || live;
    if (text !== live) changes++;
    live = text;
    await Bun.sleep(300);
  }
  const t0 = performance.now();
  const text = await dictate("check12345", new Uint8Array(), true, stt);
  console.log({ stt: stt || "apple", live, text, changes, lastMs: Math.round(performance.now() - t0) });
  if (!live) throw new Error(`FAIL ${stt}: no words while the sound came`);
  if (changes < seconds * perSecond) throw new Error(`FAIL ${stt}: the text changed ${changes} times in ${seconds.toFixed(1)} s; the words do not come while the user talks`);
  if (!/landing page/i.test(text)) throw new Error(`FAIL ${stt}: the text has no 'landing page'`);
}
// Walkie-talkie: the own whisper.cpp model gives the text only at the end. A path with no file is an error, not Apple.
const own = whisperModel();
if (own) {
  for (let i = 0; i < sound.length; i += PART)
    if ((await dictate("check67890", sound.subarray(i, i + PART), false, "whisper", undefined, own)) !== "") throw new Error("FAIL whisper: words before the end");
  const text = await dictate("check67890", new Uint8Array(), true, "whisper", undefined, own);
  console.log({ stt: "whisper", model: own, text });
  if (!/landing page/i.test(text)) throw new Error("FAIL whisper: the text has no 'landing page'");
}
const bad = await dictate("check24680", new Uint8Array(), true, "whisper", undefined, "/no/such/model.bin").then(() => "", (e) => (e as Error).message);
if (!bad.includes("/no/such/model.bin")) throw new Error(`FAIL whisper: a missing model gave ${JSON.stringify(bad)}`);
console.log(`ok: dictation gives words while the user talks, and the whole text at the end${parakeet ? ", also with Parakeet" : ""}${own ? ", and with whisper.cpp" : ""}`);
