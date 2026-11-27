// The videos that the user attaches for the agents. The agent gets the video and timeline.md, which lines up
// the words in its sound with frames of the moments that matter.
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const HOME = homedir();
// The videos that the user attaches in the app. Each one is a folder with the video, timeline.md and frames/.
// shortcut: the videos stay, and so does an upload that stopped half way. Delete old ones by hand, or add a cleanup if the folder grows.
export const VIDEOS = join(HOME, ".config/yonder/videos");
const MAX_FRAMES = 24;
const FRAME_WIDTH = 1600; // A full frame. The model reads about this much.
// whisper.cpp models that other apps on this Mac downloaded. The first one that exists wins.
// shortcut: borrowed from other apps; put a model at ~/.config/yonder/whisper.bin if they go away.
export const MODELS = [
  join(HOME, ".config/yonder/whisper.bin"),
  ...["superwhisper/ggml-large-v3-turbo.bin", "superwhisper/ggml-small.en.bin", "MacWhisper/models/ggml-model-whisper-small.en.bin", "Recordly/whisper/ggml-small.bin"]
    .map((file) => join(HOME, "Library/Application Support", file)),
];
// Words that point at something on the screen. A frame is taken when the user says one.
const POINTING = /^(this|that|these|those|here|there)$/i;

export type Word = { text: string; start: number; end: number; first: boolean }; // Seconds of the video. `first` starts a sentence.
type Moment = { at: number };

// Runs a command and returns its output. It throws with the end of its error output when it fails.
async function run(cmd: string[]) {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(`${cmd[0]} failed: ${err.trim().slice(-300)}`);
  return out;
}

// The record button of the prompt box on the Mac: yonder-select (src-tauri/select/main.swift) darkens the screen and
// shows a cross, the user drags an area, and screencapture records that area with the sound of the microphone. The app
// attaches the file as a video that the user copied in Finder (/local), so it gets its words and frames (buildVideo).
// It does not run `screencapture -i -v`, which macOS 27 refuses ("video not valid with -i"), or the toolbar of
// Shift-Command-5 (-iU), which keeps the last area and does not take a new drag.
const MAX_SECONDS = 600; // A recording that nobody stops ends after 10 minutes.
// shortcut: the recordings stay. Delete old ones by hand, or add a cleanup if the folder grows.
export const RECORDINGS = join(HOME, ".config/yonder/recordings");
// The selection, then the recording. "mic": it finds the microphone, before both.
let live: Bun.Subprocess | "mic" | undefined;
let stopped = false;
// The uniqueID of the microphone of the settings (Voice, Microphone) by its name, else of the built-in microphone, as
// the helper of "Hey Yonder" picks it (chosenMic in src-tauri/wake/main.swift). AirPods with an open microphone play all
// sound in the low quality of a phone call, so the recording keeps them out unless the user chose them.
const MICS = `ObjC.import("AVFoundation");
const d = $.NSClassFromString("AVCaptureDevice").devicesWithMediaType("soun");
const all = [];
for (let i = 0; i < d.count; i++) all.push({ name: d.objectAtIndex(i).localizedName.js, id: d.objectAtIndex(i).uniqueID.js, builtIn: d.objectAtIndex(i).transportType === 1651274862 });
JSON.stringify(all);`;
async function micId(name: string) {
  try {
    const mics = JSON.parse(await run(["osascript", "-l", "JavaScript", "-e", MICS])) as { name: string; id: string; builtIn: boolean }[];
    return (mics.find((m) => name && m.name === name) ?? mics.find((m) => m.builtIn))?.id;
  } catch {
    return undefined;
  }
}
// The helper in the bundle, next to the bridge, else the one that build.rs (or swiftc by hand) made in the repository.
const selector = () =>
  [join(dirname(process.execPath), "yonder-select"), resolve(import.meta.dir, `../src-tauri/binaries/yonder-select-${process.arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`)].find((p) => existsSync(p));
// Calls `each` with each line of the output of a program, until it ends.
async function eachLine(stream: ReadableStream<Uint8Array>, each: (line: string) => void) {
  let text = "";
  for await (const chunk of stream.pipeThrough(new TextDecoderStream() as TransformStream<Uint8Array, string>)) {
    const lines = (text + chunk).split("\n");
    text = lines.pop()!;
    lines.forEach((l) => each(l.trim()));
  }
}
// A click of the user in a screen recording: the time in Unix ms, the place in points from the top left of the area,
// and the app under it. The file `<video>.clicks.json` keeps them with the end of the recording (`stop`, Unix ms), and
// buildVideo puts them in timeline.md.
type Click = { ms: number; x: number; y: number; app: string };
export const clicksOf = (video: string) => `${video}.clicks.json`;
export async function recordScreen(mic = "") {
  if (process.platform !== "darwin") throw new Error("Yonder records the screen only on a Mac.");
  if (live) throw new Error("A screen recording runs now.");
  const select = selector();
  if (!select) throw new Error("The area selection is missing. Build the Mac app again.");
  live = "mic"; // Before the await, so that a second click in the meantime starts no second recording.
  stopped = false;
  try {
    mkdirSync(RECORDINGS, { recursive: true });
    const file = join(RECORDINGS, `${Date.now()}.mov`);
    const id = await micId(mic);
    if (stopped) return null;
    // "x,y,w,h" in points, or nothing on Escape, a right click, a click without a drag, or the record button again.
    // After the area, the helper stays as the stop button in the menu bar, and it exits on a click there.
    const pick = Bun.spawn([select], { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    live = pick;
    const clicks: Click[] = [];
    const area = await new Promise<string>((done) => {
      void eachLine(pick.stdout, (line) => {
        const m = /^click (\d+) (-?\d+) (-?\d+) ?(.*)$/.exec(line);
        if (m) clicks.push({ ms: Number(m[1]), x: Number(m[2]), y: Number(m[3]), app: m[4] });
        else done(line);
      }).finally(() => done(""));
    });
    if (!/^-?\d+,-?\d+,\d+,\d+$/.test(area)) return pick.kill(), null;
    // -v -R: a video of the area. -G: the microphone (-g: the input of macOS). -k: the clicks. SIGINT (stopRecording)
    // saves the video. With a time limit (-V), screencapture saves nothing on SIGINT, so a timer gives it.
    const proc = Bun.spawn(["screencapture", "-v", "-R", area, ...(id ? ["-G", id] : ["-g"]), "-k", "-x", file], { stdin: "ignore", stdout: "ignore", stderr: "pipe" });
    live = proc;
    void pick.exited.then(() => proc.kill("SIGINT")); // The stop in the menu bar.
    const limit = setTimeout(() => proc.kill("SIGINT"), MAX_SECONDS * 1000);
    const [, err] = await Promise.all([proc.exited, new Response(proc.stderr).text()]).finally(() => (clearTimeout(limit), pick.kill()));
    if (!existsSync(file) || !statSync(file).size) {
      rmSync(file, { force: true });
      throw new Error(err.trim().slice(-300) || "macOS made no video. Allow Yonder in Screen & System Audio Recording.");
    }
    const [, , w, h] = area.split(",").map(Number);
    writeFileSync(clicksOf(file), JSON.stringify({ stop: Date.now(), width: w, height: h, clicks }));
    return { path: file };
  } finally {
    live = undefined;
  }
}
// The record button again: it ends the selection, or the recording, which saves the video.
export const stopRecording = () => {
  stopped = true;
  if (live && live !== "mic") live.kill("SIGINT");
};

// Writes the frames and timeline.md for a video that the user attached.
// A frame goes in the middle of each sentence, at each pointing word, and at even steps, so a silent video also gets frames.
export async function buildVideo(dir: string, file: string) {
  // The clicks of a screen recording of Yonder, as seconds of the video and percents of its width and height.
  // The video ends at `stop`, so a click is `stop - ms` before its end.
  let clicks: TimedClick[] = [];
  const { streams, format } = JSON.parse(
    await run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,start_time:format=duration", "-of", "json", file]),
  ) as { streams: { codec_type: string; start_time?: string }[]; format: { duration?: string } };
  const seconds = Number(format.duration);
  if (!streams.some((s) => s.codec_type === "video") || !(seconds > 0)) throw new Error("Yonder cannot read this video.");
  const audio = streams.find((s) => s.codec_type === "audio");
  let words: Word[] = [];
  let note = audio ? "" : "The video has no sound.";
  if (audio) {
    try {
      words = await transcribe(dir, file, Number(audio.start_time ?? 0));
    } catch (e) {
      note = `The words of the video are not here: ${(e as Error).message}`;
    }
  }
  try {
    const log = JSON.parse(readFileSync(clicksOf(realpathSync(file)), "utf8")) as { stop: number; width: number; height: number; clicks: Click[] };
    clicks = log.clicks
      .map((c) => ({ at: seconds - (log.stop - c.ms) / 1000, left: Math.round((100 * c.x) / log.width), top: Math.round((100 * c.y) / log.height), app: c.app }))
      .filter((c) => c.at >= 0 && c.at <= seconds);
  } catch {} // A video that is not a screen recording of Yonder has no clicks.
  const step = Math.max(2, seconds / 12);
  // A frame at each click, a moment after it, so that it shows what the click did.
  const frames = moments(words, seconds, [...Array.from({ length: Math.floor(seconds / step) }, (_, i) => (i + 0.5) * step), ...clicks.map((c) => c.at + 0.3)]);
  mkdirSync(join(dir, "frames"), { recursive: true });
  const name = (n: number) => join(dir, "frames", `${String(n).padStart(2, "0")}.jpg`);
  // screencapture writes a frame only when the screen changes, so a moment after the last change has no frame at or
  // after it, and a seek finds nothing. The last frame of the file shows that moment. It is made once, when needed.
  let last: Promise<string> | undefined;
  const grab = (t: number, out: string) =>
    run(["ffmpeg", "-v", "error", "-y", "-ss", t.toFixed(3), "-i", file, "-frames:v", "1", "-vf", `scale='min(${FRAME_WIDTH},iw)':-2`, "-q:v", "4", out]).catch(async () => {
      last ??= run(["ffmpeg", "-v", "error", "-y", "-i", file, "-vf", `scale='min(${FRAME_WIDTH},iw)':-2`, "-update", "1", "-q:v", "4", join(dir, "last.jpg")]).then(() => join(dir, "last.jpg"));
      copyFileSync(await last, out);
    });
  for (let i = 0; i < frames.length; i += 6)
    await Promise.all(
      frames.slice(i, i + 6).map((m, j) =>
        grab(m.at, name(i + j + 1)),
      ),
    );
  rmSync(join(dir, "last.jpg"), { force: true });
  const video = file.slice(dir.length + 1);
  writeFileSync(join(dir, "timeline.md"), timeline(seconds, words, frames, note, video, clicks));
  // A small preview, because the phone gets the answer through the relay.
  const thumb = join(dir, "thumb.jpg");
  await run(["ffmpeg", "-v", "error", "-y", "-i", name(1), "-vf", "scale=-2:176", "-q:v", "5", thumb]);
  return { path: dir, seconds: Math.round(seconds), frames: frames.length, words: words.length, thumb: `data:image/jpeg;base64,${readFileSync(thumb).toString("base64")}` };
}

// The words of the sound with their times, from whisper.cpp on this Mac.
async function transcribe(dir: string, mov: string, offset: number) {
  const model = MODELS.find((m) => existsSync(m));
  if (!model) throw new Error(`no whisper.cpp model. Put one at ${MODELS[0]}.`);
  const wav = join(dir, "audio.wav");
  await run(["ffmpeg", "-v", "error", "-y", "-i", mov, "-vn", "-ac", "1", "-ar", "16000", wav]);
  try {
    await run(["whisper-cli", "-np", "-m", model, "-f", wav, "-ojf", "-of", join(dir, "words")]);
    return toWords(JSON.parse(readFileSync(join(dir, "words.json"), "utf8")).transcription, offset);
  } finally {
    rmSync(wav, { force: true });
    rmSync(join(dir, "words.json"), { force: true });
  }
}

// whisper.cpp gives tokens in ms from the start of the sound, which starts `offset` seconds into the video.
// A token with a space in front starts a new word. "[_BEG_]" and "[BLANK_AUDIO]" are not words.
export function toWords(segments: { text: string; tokens: { text: string; offsets: { from: number; to: number } }[] }[], offset: number) {
  const out: Word[] = [];
  for (const segment of segments) {
    if (/^\s*[[(].*[\])]\s*$/.test(segment.text)) continue;
    let first = true;
    for (const { text, offsets } of segment.tokens) {
      if (/^\[_.*\]$/.test(text.trim()) || !text.trim()) continue;
      const start = offsets.from / 1000 + offset;
      const end = offsets.to / 1000 + offset;
      const last = out.at(-1);
      if (first || !last || text.startsWith(" ")) out.push({ text: text.trim(), start, end, first });
      else {
        last.text += text;
        if (/\w/.test(text)) last.end = end;
      }
      first = false;
    }
  }
  return out;
}

// The moments that get a frame: each pointing word, the middle of each sentence without one,
// and the end. Moments less than a second apart show the same thing.
// `extra` gives more moments, such as the even steps through a video with few words.
export function moments(words: Word[], seconds: number, extra: number[] = []): Moment[] {
  const list: Moment[] = [...extra.map((at) => ({ at })), { at: seconds - 0.2 }];
  for (let i = 0; i < words.length; ) {
    let j = i + 1;
    while (j < words.length && !words[j].first) j++;
    const sentence = words.slice(i, j);
    const pointing = sentence.filter((w) => POINTING.test(w.text.replace(/\W/g, "")));
    if (pointing.length) list.push(...pointing.map((w) => ({ at: w.end })));
    else list.push({ at: (sentence[0].start + sentence.at(-1)!.end) / 2 });
    i = j;
  }
  const kept: Moment[] = [];
  for (const m of list.sort((a, b) => a.at - b.at)) {
    const last = kept.at(-1);
    if (!last || m.at - last.at >= 1) kept.push({ at: Math.min(Math.max(m.at, 0), Math.max(seconds - 0.1, 0)) });
  }
  // shortcut: an even cut of a long video; keep the pointing words first if it drops the wrong ones.
  const n = Math.min(kept.length, MAX_FRAMES);
  return Array.from({ length: n }, (_, i) => kept[Math.floor((i * kept.length) / n)]);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

// The words and the frames in the order of time. Each sentence starts a line with its time.
type TimedClick = { at: number; left: number; top: number; app: string };
export function timeline(seconds: number, words: Word[], frames: Moment[], note: string, video: string, clicks: TimedClick[] = []) {
  const items = [
    ...words.map((w) => ({ at: w.start, text: w.text, first: w.first, mark: false })),
    ...clicks.map((c) => ({ at: c.at, text: `[click at ${c.left}% from the left, ${c.top}% from the top${c.app ? `, in ${c.app}` : ""}]`, first: false, mark: true })),
    ...frames.map((m, i) => ({ at: m.at, text: `[frame ${i + 1}]`, first: false, mark: true })),
  ].sort((a, b) => a.at - b.at || Number(b.mark) - Number(a.mark)); // A frame at the end of a word comes before the next word.
  const lines: string[] = [];
  let last = -Infinity;
  for (const item of items) {
    if (item.first || !lines.length || item.at - last > 1.5) lines.push(`${clock(item.at)}  ${item.text}`);
    else lines[lines.length - 1] += ` ${item.text}`;
    last = item.at;
  }
  return `# Video, ${clock(seconds).replace(/\.\d$/, "")}

The user attached this video for you. This file lines up the words in its sound with frames of the video.

- The times count from the start of the video.
- "[frame 3]" marks the time of frames/03.jpg. Read the frames to see what the video shows.
- The words come from the sound of the video.
- "[click at 40% from the left, 25% from the top, in Safari]" marks a click of the user, at that place of the video, in that app.
- The video is ${video}. To see another moment, extract a frame: \`ffmpeg -ss 12.5 -i ${video} -frames:v 1 frame.jpg\`
${note ? `\n${note}\n` : ""}
## What the video says and shows

${lines.join("\n") || "(no words and no frames)"}
`;
}

// `bun bridge/recording.ts` checks the line-up of the words and the frames.
if (import.meta.main) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  const t = (text: string, from: number, to: number) => ({ text, offsets: { from, to } });
  const words = toWords(
    [
      { text: " Look at this button here.", tokens: [t("[_BEG_]", 0, 0), t(" Look", 100, 400), t(" at", 400, 500), t(" this", 500, 900), t(" but", 1000, 1200), t("ton", 1200, 1400), t(" here", 1400, 1600), t(".", 1600, 1600)] },
      { text: " [BLANK_AUDIO]", tokens: [t(" [BLANK_AUDIO]", 1600, 3000)] },
      { text: " It should be blue.", tokens: [t(" It", 5000, 5200), t(" should", 5200, 5500), t(" be", 5500, 5600), t(" blue", 5600, 6000), t(".", 6000, 6000)] },
    ],
    0.5,
  );
  assert(words.map((w) => w.text).join(" ") === "Look at this button here. It should be blue.", "joins the tokens into words and skips the blanks");
  assert(words[3].text === "button" && words[3].start === 1.5 && words[3].end === 1.9, "a word spans its tokens, after the offset of the sound");
  assert(words.filter((w) => w.first).length === 2, "each sentence starts with a first word");
  const frames = moments(words, 10, [8]);
  assert(frames.map((m) => m.at).join() === "1.4,6,8,9.8", `a frame at "this", the middle of a sentence, an even step and the end: ${frames.map((m) => m.at)}`);
  assert(moments([], 200, Array.from({ length: 100 }, (_, i) => i * 2)).length === MAX_FRAMES, "a long video keeps the frames under the limit");
  const text = timeline(10, words, frames, "", "video.mov");
  assert(text.includes("0:00.6  Look at this [frame 1] button here.\n0:05.5  It should [frame 2] be blue.\n0:08.0  [frame 3]\n0:09.8  [frame 4]"), `the timeline lines up words and frames:\n${text.split("## ")[1]}`);
  const clicked = timeline(10, words, frames, "", "video.mov", [{ at: 5.2, left: 40, top: 25, app: "Safari" }]);
  assert(clicked.includes("0:05.5  It should [frame 2] be blue.") && clicked.includes("0:05.2  [click at 40% from the left, 25% from the top, in Safari]"), `a click has its line:\n${clicked.split("## ")[1]}`);
  assert(moments([], 20, [5, 15]).map((m) => m.at).join() === "5,15,19.8", "a video with no words gets its even steps and the end");
  assert(timeline(20, [], [], "", "video.mov").startsWith("# Video, 0:20"), "a video has its timeline");
  console.log("PASS");
}
