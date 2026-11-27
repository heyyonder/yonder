// Dictation: the microphone button of the prompt box (Mic in src/App.tsx), when no call is live. The app records the
// microphone and sends the sound to the bridge in parts, and the speech model of Apple on the Mac makes the text
// (bridge/dictate.ts). The words show in the prompt box while the user talks.
// The phone makes the words itself (onPhone), with the speech recognizer of iOS or of Android, so its sound does not
// go to the computer: a Windows bridge has no dictation. The phone sends its sound to the bridge through the relay
// only when a super user chose a cloud model (stt).
// While the Mac is offline, the phone keeps the sound, and the stop gives it as a `Recorded` in place of the text. The
// outbox (src/bridge.ts) makes the text when the Mac connects again.
import * as Sentry from "@sentry/react";
import { invoke } from "@tauri-apps/api/core";
import { android, bridgeFetch, keepSound, phone, shareAudio, shell, stt, transcribe, type Recorded } from "./bridge";
import { downsample, join } from "./pcm";
import { addMic, chime, frameOf, log, micInCall } from "./voice";

// Each step of a dictation goes to call.log, and to Sentry as a breadcrumb, so that the report of a failed dictation
// shows its steps. The steps hold no words of the user.
const trail = (step: string) => (Sentry.addBreadcrumb({ category: "dictation", message: step }), log(step));

export type Dictation = { stop(): Promise<string | Recorded>; cancel(): void; level(): number };

// Each answer holds the text of the part before it, so a part each 150 ms shows a word sooner than one each 300 ms.
const PART_MS = 150;
// The bars use a log scale of dBFS. Dictation has no gain control, so one microphone can be 20 dB quieter than
// another, and a log scale shows both voices. A linear gain keeps the bars of the iPhone almost still. A top that
// follows the loudest recent frame makes each voice fill the orb, so the orb bounces too much. The scale is fixed, and
// the square root in src/Orb.tsx and its `boost` lift the quiet voices.
const QUIET = -50;
// The bottom of the scale follows the silence of the room (`floor`): it falls at once to a quieter frame and rises by
// RISE dB each second. The bar starts MARGIN dB over the floor and is full SPAN dB over that, but never starts higher
// than QUIET. A voice on the MacBook microphone can stay under -45 dBFS for 6 s, so a fixed scale keeps the orb still
// while the words come. A level of -30 dBFS in the log was only the start chime.
// shortcut: MARGIN if the orb moves in silence; the "levels" line of call.log shows the floor and the voice.
const RISE = 1;
const MARGIN = 6;
const SPAN = 20;
const FLOOR = -75; // Under it is a dead microphone, and digital silence would push the bottom far down.
function scale() {
  let floor = QUIET - MARGIN;
  let at = performance.now();
  return {
    bar(db: number) {
      const now = performance.now();
      floor = Math.max(FLOOR, Math.min(QUIET - MARGIN, db, floor + (RISE * (now - at)) / 1000));
      at = now;
      return Math.max(0, Math.min(1, (db - floor - MARGIN) / SPAN));
    },
    get floor() {
      return floor;
    },
  };
}
// The loudest dBFS in each LEVELS_MS of a dictation, for the "levels" line of call.log.
const LEVELS_MS = 500;
function timeline() {
  const t0 = performance.now();
  const max: number[] = [];
  return {
    add(db: number) {
      const i = Math.floor((performance.now() - t0) / LEVELS_MS);
      max[i] = Math.max(max[i] ?? -Infinity, db);
    },
    toString: () => Array.from(max, (v) => (v === undefined ? "_" : Math.round(Math.max(v, -99)))).join(" "),
  };
}
// The loudness of the orb for a bar from 0 to 1: the inverse of `size` in src/Levels.tsx, so that the bar there is `bar`.
const loud = (bar: number) => ((bar * 0.88 + 0.12) / 1.8) ** 2;
// The start chime plays for 400 ms, and the microphone hears it. A bar of VOICE after CHIME_MS is the voice of the
// user, for call.log, so the log has a step for the first voice and for the orb.
const CHIME_MS = 700;
const VOICE = 0.25;
// A frame of only zeros is -180 dBFS, and a live microphone is never under DEAD. An iPhone with Walkie-talkie on can
// keep the microphone of a voice note, and the next voice note gets only zeros from it, while iOS still calls it live
// and not muted: the orb stays still and nothing is recorded. So DEAD_FRAMES of zeros from a kept
// microphone open a new one, and a microphone that gave only zeros is not kept.
const DEAD = -150;
const DEAD_FRAMES = 15;

// The orb reads the level once in each frame of the page. watchOrb writes to call.log when the orb first reads it, when
// the orb first gets a voice, and at the end the count of frames and the longest gap between two. So a late orb shows
// if the sound came late ("first voice") or the page drew late ("orb gets the voice").
function watchOrb(mark: (step: string) => void, t0: number, get: () => number) {
  let reads = 0;
  let last = 0;
  let gap = 0;
  let voice = false;
  return {
    level() {
      const now = performance.now();
      if (reads++) gap = Math.max(gap, now - last);
      else mark("first frame of the orb");
      last = now;
      const v = get();
      if (!voice && v >= loud(VOICE) && now - t0 > CHIME_MS) (voice = true), mark("the orb gets the voice");
      return v;
    },
    report: () => mark(`the orb drew ${reads} frames, longest gap ${Math.round(gap)} ms`),
  };
}

// The microphone of dictation. Echo cancellation is off: without it, macOS starts no voice processing, which kept the
// microphone silent for about 2.5 s at the start of a call (src/voice.ts). Nothing plays during dictation, so no echo
// comes back.
const getMic = () =>
  navigator.mediaDevices.getUserMedia({
    audio: { deviceId: localStorage.getItem("mic") || undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
const audioSession = () => (navigator as { audioSession?: { type: string } }).audioSession;

// The phone opens the microphone at the tap that opens the talk view, before the view renders, and dictate takes it.
// iOS needs about 0.7 s to open the microphone (call.log), so that time must not start only after the view is on the
// screen. A microphone that
// no dictation takes in WARM_MS closes. The Mac keeps its microphone open after a dictation (MAC_LINGER_MS). A
// call that connects has the microphone, and the talk view waits for its end.
// The tap comes only about 8 ms before the view, so the tap alone saves almost no time (call.log). A
// microphone that is still open gives its sound in about 20 ms. So the end of a dictation on the phone keeps its
// microphone open for LINGER_MS, and the next dictation takes it, so the microphone starts at once. While it waits, the orange dot of iOS stays on, and the side buttons change the call volume. It
// closes when the app goes to the background and when a call starts.
// shortcut: the first dictation after a start of the app still waits for iOS; a shorter LINGER_MS if the dot annoys.
const WARM_MS = 3000;
const LINGER_MS = 60_000;
// The Mac keeps the microphone of a dictation open, with its AudioContext and its worklet, for MAC_LINGER_MS after the
// end of the last dictation, so the next one, such as a press of right ⌥, gets sound at once. A new one waits about
// 0.75 s for the microphone and 0.5 s more for the first frame (call.log). A switch to another app does not close it,
// so the orange dot of macOS does not turn off and on. The microphone does not open with the window, so a user who
// only types has no open microphone.
// shortcut: the first dictation after MAC_LINGER_MS still waits for the microphone.
const MAC_LINGER_MS = 5 * 60_000;
type Audio = { ctx: AudioContext; node: AudioWorkletNode };
let warm: { at: number; stream: Promise<MediaStream>; kept: boolean; audio?: Audio; mic?: string } | undefined;
function park(stream: Promise<MediaStream>, ms: number, kept: boolean, audio?: Audio) {
  const session = audioSession();
  if (session) session.type = "play-and-record";
  // Only one microphone waits: a tap during a dictation can have opened a second one.
  warm?.stream.then((s) => s.getTracks().forEach((t) => t.stop()), () => {});
  void warm?.audio?.ctx.close();
  const w = (warm = { at: performance.now(), stream, kept, audio, mic: localStorage.getItem("mic") ?? "" });
  if (audio) shareAudio(audio.ctx);
  w.stream.catch(() => {});
  if (ms) setTimeout(() => warm === w && dropMic(), ms);
}
// Closes the microphone that waits for a dictation. A call opens its own microphone (openMic in src/voice.ts), with
// echo cancellation on the Mac.
export function dropMic() {
  const w = warm;
  if (!w) return;
  warm = undefined;
  w.stream.then((s) => s.getTracks().forEach((t) => t.stop()), () => {});
  const session = audioSession();
  if (session && !micInCall()) session.type = "auto";
  void w.audio?.ctx.close();
}
export function warmMic() {
  if (phone && !warm && !micInCall() && !onPhone()) park(getMic(), WARM_MS, false);
}
const mac = !phone && "__TAURI_INTERNALS__" in window;
if (phone) document.addEventListener("visibilitychange", () => document.hidden && dropMic());
if (phone || mac) addEventListener("pagehide", dropMic);
// A kept microphone can end or go mute in the background or under a phone call of iOS, and a dead one records
// nothing (a still orb). Then a new one opens.
// The test of `muted` is only for a kept microphone: a microphone that opens at the tap can be mute for a moment.
const live = (s: MediaStream, kept: boolean) => s.getAudioTracks().length > 0 && s.getAudioTracks().every((t) => t.readyState === "live" && !(kept && t.muted));

export async function dictate(onText: (text: string) => void, onError: (message: string) => void, onAway?: () => void): Promise<Dictation> {
  const native = onPhone();
  const own = native && (await dictateOnPhone(native, onText, onError));
  if (own) return own;
  // iOS: "play-and-record", as in a call (openMic in src/voice.ts), so that the chime plays on the speaker. The end of
  // the dictation sets it back to "auto", unless a call opened its microphone: a call that starts in the talk view ends
  // the dictation and needs it. If the end keeps "play-and-record", after the talk view the side buttons of the iPhone
  // change the call volume, also with no call.
  const session = audioSession();
  if (session) session.type = "play-and-record";
  // The orb moves only after the start and the first frames. The call log gets the time of each step, so that a slow
  // start shows which step waits.
  const t0 = performance.now();
  const mark = (step: string) => trail(`dictation (${phone ? "phone" : "mac"}): ${step} after ${Math.round(performance.now() - t0)} ms`);
  let early = warm;
  warm = undefined;
  // The microphone of the Mac that waited goes on only with the same microphone of the settings.
  if (early?.audio && (early.audio.ctx.state === "closed" || early.mic !== (localStorage.getItem("mic") ?? ""))) {
    early.stream.then((s) => s.getTracks().forEach((t) => t.stop()), () => {});
    void early.audio.ctx.close();
    early = undefined;
  }
  const keptAudio = early?.audio;
  if (early) mark(early.kept ? `the microphone of the last dictation is still open (${Math.round(t0 - early.at)} ms); start` : `the tap came ${Math.round(t0 - early.at)} ms before, and the microphone opened then; start`);
  // The Mac pauses the music of other apps until the end, before the chime of this page plays (hush in src-tauri/src/main.rs).
  const hush = (on: boolean) => mac && invoke("set_mic", { on }).catch(() => {});
  hush(true);
  let stream: MediaStream | undefined;
  let ctx: AudioContext | undefined;
  let fromKept = false; // Until its first sound: the microphone is the kept one, and can be dead.
  try {
    const kept = await early?.stream;
    const ok = kept && live(kept, early!.kept);
    if (kept && !ok) kept.getTracks().forEach((t) => t.stop()), mark("the kept microphone ended; open another");
    stream = kept && ok ? kept : await getMic();
    fromKept = !!ok;
    // The name of the microphone tells the route: a Bluetooth microphone, such as AirPods, can open slower on iOS.
    mark(`microphone ${stream.getAudioTracks()[0]?.label}`);
    if (ok && keptAudio) {
      ctx = keptAudio.ctx;
      mark(`the audio of the last dictation is still open, audio ${ctx.state}`);
      if (ctx.state !== "running") void ctx.resume();
    } else {
      if (keptAudio) void keptAudio.ctx.close();
      ctx = new AudioContext();
      mark(`audio made ${ctx.state}`);
      ctx.resume().then(() => mark("resumed"), (e: Error) => mark(`resume failed: ${e.message}`));
      await addMic(ctx);
      mark(`worklet, audio ${ctx.state}`);
    }
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    hush(false);
    throw e;
  }
  const rate = ctx.sampleRate;
  let input = stream; // A new microphone takes the place of a dead kept one (reopen).
  // macOS and iOS restart the audio of the app when the microphone opens, and the restart can suspend the context. No
  // frames come then, and the orb stays still. So the context resumes at once.
  ctx.onstatechange = () => {
    mark(`audio ${ctx.state}`);
    if (!stopped && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume();
  };
  shell?.busy?.(true);
  // Frames of 20 ms, so that the bars of the box move smoothly. The parts to the bridge still go each PART_MS.
  const reused = ctx === keptAudio?.ctx ? keptAudio.node : undefined;
  const mic = reused ?? new AudioWorkletNode(ctx, "mic", { numberOfOutputs: 0, processorOptions: { frame: Math.round(rate / 50) } });
  if (!reused) ctx.createMediaStreamSource(stream).connect(mic);
  // No frame 1.5 s after the start: the state of the audio, of the microphone and of the page, for call.log. Such a
  // dictation shows a still orb and records nothing, and else the log has no step after the worklet.
  setTimeout(() => {
    if (heard || stopped) return;
    const track = input.getAudioTracks()[0];
    mark(`no frame: audio ${ctx.state} at ${rate} Hz, track ${track?.readyState} muted ${track?.muted} enabled ${track?.enabled} at ${track?.getSettings().sampleRate} Hz, page ${document.visibilityState}, session ${session?.type}`);
  }, 1500);
  const waiting: Int16Array[] = [];
  const all: Int16Array[] = []; // The whole sound, for the text after the Mac went offline.
  // The loudness comes from the frames, not from an AnalyserNode: on the iPhone an AnalyserNode keeps the bars still,
  // but the frames arrive.
  let loudness = 0;
  let loudest = -Infinity;
  let heard = 0; // 1 after the first frame, 2 after the first frame above QUIET, 3 after the first voice.
  let zeros = 0; // The frames of only zeros from the kept microphone.
  const reopen = async () => {
    mark("the kept microphone gives only zeros; open another");
    // The dead one stops first, so that WebKit does not give the new one the same capture.
    input.getTracks().forEach((t) => t.stop());
    try {
      const fresh = await getMic();
      if (stopped) return fresh.getTracks().forEach((t) => t.stop());
      input = fresh;
      ctx.createMediaStreamSource(fresh).connect(mic);
      mark(`microphone ${fresh.getAudioTracks()[0]?.label}`);
    } catch (e) {
      mark(`no new microphone: ${(e as Error).message}`);
    }
  };
  const room = scale();
  const heardDb = timeline();
  mic.port.onmessage = (e) => {
    const frame = new Int16Array(frameOf(e.data).pcm);
    let sum = 0;
    for (const s of frame) sum += s * s;
    if (fromKept && !sum && ++zeros === DEAD_FRAMES) void reopen();
    if (sum) fromKept = false;
    const db = 20 * Math.log10(Math.sqrt(sum / frame.length) / 0x7fff || 1e-9);
    loudest = Math.max(loudest, db);
    heardDb.add(db);
    const bar = room.bar(db);
    // The start chime of a call plays on this AudioContext at the first frame. On a second AudioContext while the
    // microphone opens, the user does not hear it. iOS and macOS restart the audio of the app when the microphone opens,
    // and a chime at once is cut. The first frame tells that the restart is done, and it comes about 100 ms after the
    // microphone, so the chime is about 300 ms sooner than after a fixed wait of 400 ms.
    if (heard < 1) (heard = 1), mark("first frame"), chime(true, ctx);
    if (heard < 2 && bar > 0) (heard = 2), mark("first sound");
    if (heard < 3 && bar >= VOICE && performance.now() - t0 > CHIME_MS) (heard = 3), mark("first voice");
    loudness = loud(bar);
    const part = downsample(frame, rate);
    waiting.push(part);
    all.push(part);
  };

  const id = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join("");
  let stopped = false;
  let cancelled = false;
  let said = "";
  const orb = watchOrb(mark, t0, () => loudness);
  const close = () => {
    mark(`loudest ${Math.round(loudest)} dBFS, floor ${Math.round(room.floor)}, levels each ${LEVELS_MS} ms: ${heardDb}`);
    orb.report();
    stopped = true;
    mic.port.onmessage = null;
    const keep = !micInCall() && !(heard && loudest < DEAD);
    // The Mac keeps the microphone and the audio for MAC_LINGER_MS.
    if (mac && keep) park(Promise.resolve(input), MAC_LINGER_MS, true, { ctx, node: mic });
    else {
      void ctx.close();
      if (phone && keep && !document.hidden) park(Promise.resolve(input), LINGER_MS, true);
      else {
        input.getTracks().forEach((t) => t.stop());
        if (session && !micInCall()) session.type = "auto";
      }
    }
    hush(false);
    shell?.busy?.(false);
  };
  // After the Mac went offline: the text of the whole sound, or the sound, when the Mac is still offline.
  const held = async (): Promise<string | Recorded> => {
    if (cancelled) return "";
    const pcm = join(all);
    try {
      return await transcribe(pcm);
    } catch (e) {
      if ((e as { final?: boolean }).final) throw e;
      return { sound: await keepSound(pcm) };
    }
  };
  // One part at a time, so that the parts come in order. The frames that come meanwhile go in the next part.
  // The part after the stop is the last one, and its answer is the whole text.
  const sending = (async () => {
    for (;;) {
      await new Promise((r) => setTimeout(r, PART_MS));
      const end = stopped;
      const part = join(waiting.splice(0));
      if (!part.length && !end) continue;
      let res;
      try {
        res = await bridgeFetch(`/dictate?id=${id}${end ? "&end" : ""}${stt(true)}`, { method: "POST", body: part });
      } catch (e) {
        // The Mac is offline, or the link dropped during the part. The phone keeps recording, and the stop makes the
        // text from the whole sound, or gives the sound to the outbox when the Mac is still offline.
        if (!phone) throw e;
        onAway?.();
        while (!stopped) await new Promise((r) => setTimeout(r, PART_MS));
        return held();
      }
      // A bridge that started before this feature has no /dictate.
      if (res.status === 404) throw new Error("the bridge has no dictation yet. Restart the bridge.");
      if (!res.ok) throw new Error((await res.text()) || `the bridge answered ${res.status}.`);
      const { text } = (await res.json()) as { text: string };
      if (end) return text;
      if (text && !cancelled) onText((said = text));
    }
    // After the stop, a failed last part still sends the words that the user saw.
  })().catch((e) => {
    if (stopped && !cancelled && said) return said;
    throw e;
  });
  sending.catch((e) => {
    if (!stopped) close();
    if (!cancelled) onError(`Dictation failed: ${(e as Error).message}`);
  });
  return {
    stop: () => (close(), sending),
    cancel: () => ((cancelled = true), close()),
    level: orb.level,
  };
}

// The speech recognizer of the phone itself: Dictate.swift on the iPhone, Dictation.kt on Android. `op` is start, poll,
// stop or cancel. None: the Mac, a model of the bridge that a super user chose (Parakeet on the Mac, or a cloud model whose
// key only the bridge has), or an Android app from before this feature. An iPhone app from before it has no `dictation`
// command, and dictateOnPhone gives undefined.
type Native = (op: string) => Promise<string>;
function onPhone(): Native | undefined {
  if (!phone || stt(true) || !("__TAURI_INTERNALS__" in window)) return undefined;
  if (!android) return (op) => invoke<string>("dictation", { op });
  const own = shell?.dictation?.bind(shell);
  return own && (async (op) => own(op));
}

// The page asks for the state of the recognizer each POLL_MS: the words so far and the loudest 20 ms since the last poll
// (`db`), which `scale` makes into the bar of the orb, as on the Mac. An iPhone app from before `db` gives only
// `level`, the bar of the whole buffer of the tap.
const POLL_MS = 50;

// After the stop, the recognizer gets up to END_MS for the last words.
const END_MS = 1500;
async function dictateOnPhone(run: Native, onText: (text: string) => void, onError: (message: string) => void): Promise<Dictation | undefined> {
  const t0 = performance.now();
  const mark = (step: string) => trail(`dictation (phone, on the phone): ${step} after ${Math.round(performance.now() - t0)} ms`);
  // A microphone that a dictation of the bridge kept open would hold the audio of the phone.
  dropMic();
  // Android: "Hey Yonder" lets go of its recognizer first (Wake.kt).
  shell?.busy?.(true);
  // end() reads these also after a failed start.
  let level = 0;
  let loudest = -Infinity;
  let gap = 0; // The longest time between two polls: a long one tells that the recognizer held the poll.
  let stopped = false;
  const room = scale();
  const heardDb = timeline();
  const orb = watchOrb(mark, t0, () => (stopped ? 0 : loud(level)));
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    if (loudest > -Infinity) mark(`loudest ${Math.round(loudest)} dBFS, floor ${Math.round(room.floor)}, longest poll ${Math.round(gap)} ms, levels each ${LEVELS_MS} ms: ${heardDb}`);
    orb.report();
    shell?.busy?.(false);
  };
  let error: string;
  try {
    error = await run("start");
    // Android: the web view asks for the microphone, as at the first call, and the recognizer starts again.
    if (error === "permission") {
      (await getMic()).getTracks().forEach((t) => t.stop());
      error = await run("start");
    }
  } catch (e) {
    end();
    // An iPhone app from before this feature: the dictation of the bridge.
    if (/command dictation not found/i.test(String(e))) return undefined;
    throw e;
  }
  if (error) {
    end();
    throw new Error(error);
  }
  mark("start");
  // The iPhone plays the chime in its own audio (Dictate.swift): a sound of WebKit stopped the microphone of iOS.
  if (android) chime(true);
  const started = performance.now();
  let polled = started;
  let words = "";
  let cancelled = false;
  let until = Infinity;
  const result = (async () => {
    for (let heard = false; ; ) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (cancelled) return "";
      const s = JSON.parse(await run("poll")) as { words: string; level: number; db?: number; done: boolean; error?: string; notes?: string[] };
      const at = performance.now();
      gap = Math.max(gap, at - polled);
      polled = at;
      s.notes?.forEach(mark);
      level = s.db === undefined ? s.level : room.bar(s.db);
      if (s.db !== undefined && !stopped) (loudest = Math.max(loudest, s.db)), heardDb.add(s.db);
      if (!heard && level >= VOICE && at - started > CHIME_MS) (heard = true), mark("first voice");
      if (!stopped && s.words && s.words !== words) onText(s.words);
      words = s.words;
      if (s.error && !stopped) throw new Error(s.error);
      if (s.done) return words.trim();
      if (performance.now() > until) return await run("cancel"), words.trim();
    }
  })();
  // After the stop, an error still sends the words that the user saw.
  const text = result.catch((e) => {
    if (stopped && !cancelled) return words.trim();
    throw e;
  });
  // The microphone stops before the audio session of iOS goes back to "auto".
  text.then(() => cancelled || end(), (e) => {
    void run("cancel").finally(end);
    if (!cancelled) onError(`Dictation failed: ${(e as Error).message}`);
  });
  return {
    stop: () => {
      if (!stopped) (stopped = true), (until = performance.now() + END_MS), void run("stop");
      return text;
    },
    cancel: () => {
      cancelled = stopped = true;
      void run("cancel").finally(end);
    },
    level: orb.level,
  };
}
