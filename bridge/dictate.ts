// Dictation: the microphone button of the prompt box (src/dictate.ts). The app sends the sound in parts, PCM16 at
// 16 kHz, mono, and yonder-dictate (src-tauri/dictate/main.swift) makes the text with the speech model of Apple on
// this Mac. Each part returns the text so far, so the words show while the user talks. The part with `end` returns
// the last text.
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { MODELS } from "./recording";

// In a copy for other Macs, the helper is next to the compiled bridge. The bridge of `install-app` runs from this
// repository, and build.rs compiles the helper into src-tauri/binaries/ at each build of the app. The `parakeet` choice
// runs yonder-parakeet (src-tauri/parakeet/main.swift) in its place, with the same protocol and a better model.
// shortcut: build.rs and externalBin do not know yonder-parakeet, so only a Mac with this repository has it. Add it there
// to ship it to other Macs.
const HELPERS = {
  dictate: ["yonder-dictate", "../src-tauri/binaries/yonder-dictate-aarch64-apple-darwin", "Build the Mac app again."],
  parakeet: ["yonder-parakeet", "../src-tauri/parakeet/.build/release/yonder-parakeet", "Run swift build -c release in src-tauri/parakeet."],
};
// The Parakeet choices of the settings, and the model that each one gives to yonder-parakeet.
const PARAKEET: Record<string, string> = { parakeet: "v2", "parakeet-v3": "v3", "parakeet-ultra": "ultra" };
const helper = ([name, built]: string[]) => [join(dirname(process.execPath), name), resolve(import.meta.dir, built)].find((p) => existsSync(p));
// The Parakeet choices are on offer in the Settings only on a Mac with the helper (`keys` of /token?check).
export const hasParakeet = () => !!helper(HELPERS.parakeet);

type Session = { proc: Subprocess<"pipe", "pipe", "pipe">; text: string; read: Promise<void>; idle?: Timer };
const sessions = new Map<string, Session>();

// Linux: Voxtype (omarchy/install.sh installs it) makes the text from a WAV file at the end of the sound. So the
// words show only at the end, not while the user talks. Walkie-talkie with whisper.cpp does the same (whisper).
const clips = new Map<string, { parts: Uint8Array[]; idle?: Timer }>();
async function atEnd(id: string, sound: Uint8Array, end: boolean, make: (file: string) => Promise<string>) {
  const clip = clips.get(id) ?? { parts: [] };
  clips.set(id, clip);
  clearTimeout(clip.idle);
  if (sound.length) clip.parts.push(sound);
  // An app that went away sends no end, so its sound goes 30 s after the last part.
  if (!end) {
    clip.idle = setTimeout(() => clips.delete(id), 30_000);
    return "";
  }
  clips.delete(id);
  const file = join(tmpdir(), `yonder-dictate-${crypto.randomUUID()}.wav`);
  await Bun.write(file, wav(Buffer.concat(clip.parts)));
  try {
    return await make(file);
  } finally {
    rmSync(file, { force: true });
  }
}
// Runs a helper on the WAV file and gives its output.
async function textOf(cmd: string[]) {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [code, text, error] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
  if (code) throw new Error(error.trim().slice(-300) || `${cmd[0]} stopped with code ${code}`);
  return text;
}
const voxtype = (id: string, sound: Uint8Array, end: boolean) =>
  atEnd(id, sound, end, async (file) => {
    if (!Bun.which("voxtype")) throw new Error("Dictation needs Voxtype. Run yonder update to install it.");
    return transcript(await textOf(["voxtype", "transcribe", file]));
  });

// Walkie-talkie (Settings, Voice): the own speech model of the user, a whisper.cpp model file on this computer
// (`speechModel` in config.json). Empty: a model that another app downloaded (MODELS of bridge/recording.ts). With no
// model and no whisper-cli, the speech model of the computer makes the text.
// whisper-cli prints the text on stdout and its logs on stderr. "[BLANK_AUDIO]" is no word.
export function whisperModel(own?: string) {
  if (own && !existsSync(own)) throw new Error(`No speech model at ${own}. Fix the path in Settings, Voice.`);
  const model = own || MODELS.find((m) => existsSync(m));
  return model && Bun.which("whisper-cli") ? model : undefined;
}
const whisper = (model: string, id: string, sound: Uint8Array, end: boolean) =>
  atEnd(id, sound, end, async (file) => (await textOf(["whisper-cli", "-np", "-nt", "-m", model, "-f", file])).replace(/\[BLANK_AUDIO\]/g, " ").replace(/\s+/g, " ").trim());

// Voxtype prints some lines about the file before a blank line, then the text, also with -q. With no speech it stops
// before the blank line.
export function transcript(out: string) {
  const i = out.indexOf("\n\n");
  return i < 0 ? "" : out.slice(i + 2).trim();
}

// A WAV file of the sound of the app: PCM16 at 16 kHz, mono, as Voxtype wants it.
export function wav(pcm: Buffer) {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16); // the size of the format chunk
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(16000, 24);
  head.writeUInt32LE(32000, 28); // bytes each second
  head.writeUInt16LE(2, 32); // bytes each sample
  head.writeUInt16LE(16, 34); // bits each sample
  head.write("data", 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

// The speech to text models of the cloud that the user can try in place of the speech model of the Mac (Settings,
// Voice, Speech to text). Each one takes the same sound over a WebSocket, and gives words while the user talks.
// shortcut: one socket for each dictation or turn, so each turn waits for a connect; keep one open if the wait matters.
type Cloud = { ws: WebSocket; final: string; partial: string; waiting: Uint8Array<ArrayBuffer>[]; done: Promise<void>; error?: string; idle?: Timer };
const clouds = new Map<string, Cloud>();
export const STT = {
  soniox: {
    key: "SONIOX_API_KEY",
    open: (key: string) => {
      const ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
      ws.addEventListener("open", () =>
        ws.send(JSON.stringify({ api_key: key, model: "stt-rt-v5", audio_format: "pcm_s16le", sample_rate: 16000, num_channels: 1 })),
      );
      return ws;
    },
    // Each answer has the new final tokens and all the tokens that are not final yet. <end> and <fin> are marks, not words.
    read: (c: Cloud, m: { tokens?: { text: string; is_final: boolean }[]; error_message?: string }) => {
      if (m.error_message) c.error = m.error_message;
      const words = (m.tokens ?? []).filter((t) => !/^<\w+>$/.test(t.text));
      c.final += words.filter((t) => t.is_final).map((t) => t.text).join("");
      c.partial = words.filter((t) => !t.is_final).map((t) => t.text).join("");
    },
    // An empty message ends the sound. Soniox then sends the last tokens and closes.
    end: (ws: WebSocket) => ws.send(""),
  },
  deepgram: {
    key: "DEEPGRAM_API_KEY",
    open: (key: string) =>
      // Bun's WebSocket takes headers. The types of the DOM do not know them.
      new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-3-general&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&smart_format=true", {
        headers: { Authorization: `Token ${key}` },
      } as unknown as string[]),
    // Each Results answer is the text of one part of the sound. A final one does not change again.
    read: (c: Cloud, m: { type?: string; is_final?: boolean; channel?: { alternatives?: { transcript?: string }[] }; err_msg?: string }) => {
      if (m.err_msg) c.error = m.err_msg;
      if (m.type !== "Results") return;
      const text = m.channel?.alternatives?.[0]?.transcript ?? "";
      if (m.is_final) (c.final = [c.final, text].filter(Boolean).join(" ")), (c.partial = "");
      else c.partial = text;
    },
    end: (ws: WebSocket) => ws.send(JSON.stringify({ type: "CloseStream" })),
  },
};
export type Stt = keyof typeof STT;
const said = (c: Cloud) => [c.final, c.partial].map((s) => s.trim()).filter(Boolean).join(" ");

async function cloud(stt: Stt, key: string | undefined, id: string, sound: Uint8Array<ArrayBuffer>, end: boolean) {
  const model = STT[stt];
  let c = clouds.get(id);
  if (!c) {
    if (!key) throw new Error(`Put ${model.key}=... in ~/.config/yonder/.env`);
    const ws = model.open(key);
    ws.binaryType = "arraybuffer";
    const made: Cloud = { ws, final: "", partial: "", waiting: [], done: Promise.resolve() };
    made.done = new Promise((resolve) => {
      ws.addEventListener("open", () => made.waiting.splice(0).forEach((part) => ws.send(part)));
      ws.addEventListener("message", (e) => model.read(made, JSON.parse(String(e.data))));
      ws.addEventListener("error", () => (made.error ??= `${stt} did not answer`));
      ws.addEventListener("close", (e) => {
        if (e.code !== 1000 && !made.error) made.error = e.reason || `${stt} closed with code ${e.code}`;
        resolve();
      });
    });
    clouds.set(id, (c = made));
  }
  clearTimeout(c.idle);
  c.idle = setTimeout(() => (c.ws.close(), clouds.delete(id)), 30_000);
  if (sound.length) c.ws.readyState === WebSocket.OPEN ? c.ws.send(sound) : c.waiting.push(sound);
  if (!end) {
    if (c.error) throw new Error(c.error);
    return said(c);
  }
  clearTimeout(c.idle);
  clouds.delete(id);
  // The sound that waits for the connect goes first, then the end.
  if (c.ws.readyState === WebSocket.CONNECTING) await new Promise((r) => c.ws.addEventListener("open", r, { once: true }));
  if (c.ws.readyState === WebSocket.OPEN) model.end(c.ws);
  await Promise.race([c.done, Bun.sleep(10_000)]);
  c.ws.close();
  if (c.error && !said(c)) throw new Error(c.error);
  return said(c);
}

export async function dictate(id: string, sound: Uint8Array<ArrayBuffer>, end: boolean, stt?: string, key?: (name: string) => string | undefined, speechModel?: string) {
  if (stt && stt in STT) return cloud(stt as Stt, key?.(STT[stt as Stt].key), id, sound, end);
  const own = stt === "whisper" ? whisperModel(speechModel) : undefined;
  if (own) return whisper(own, id, sound, end);
  if (process.platform === "linux") return voxtype(id, sound, end);
  // Windows has voice typing of its own, which types into the prompt box of the window too.
  if (process.platform === "win32") throw new Error("Press Windows + H to dictate on Windows.");
  let s = sessions.get(id);
  if (!s) {
    const model = PARAKEET[stt ?? ""];
    const kind = HELPERS[model ? "parakeet" : "dictate"];
    const path = helper(kind);
    if (!path) throw new Error(`This Mac has no ${kind[0]}. ${kind[2]}`);
    const proc = Bun.spawn(model ? [path, model] : [path], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    const session: Session = { proc, text: "", read: Promise.resolve() };
    // Each line of the helper holds all the text so far.
    session.read = (async () => {
      let rest = "";
      for await (const chunk of proc.stdout.pipeThrough(new TextDecoderStream())) {
        const lines = (rest + chunk).split("\n");
        rest = lines.pop()!;
        for (const line of lines) if (line) session.text = JSON.parse(line).text;
      }
    })();
    sessions.set(id, (s = session));
  }
  // An app that went away sends no end, so the helper stops 30 s after the last part.
  clearTimeout(s.idle);
  s.idle = setTimeout(() => (s.proc.kill(), sessions.delete(id)), 30_000);
  if (s.proc.exitCode === null && sound.length) {
    s.proc.stdin.write(sound);
    s.proc.stdin.flush();
  }
  if (!end && s.proc.exitCode === null) return s.text;
  // At the end of the sound the helper gives the last words and exits. A helper that stopped early gives its error.
  clearTimeout(s.idle);
  sessions.delete(id);
  if (s.proc.exitCode === null) s.proc.stdin.end();
  const [code, error] = await Promise.all([s.proc.exited, new Response(s.proc.stderr).text(), s.read]);
  if (code) throw new Error(error.trim() || `yonder-dictate stopped with code ${code}`);
  return s.text;
}
