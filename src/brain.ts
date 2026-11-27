// The Claude call (docs/brain.md, design B), with no voice model. The speech model of Apple on the Mac makes the text of
// each turn of the user (/dictate, bridge/dictate.ts), the brain in the bridge decides and makes all the tool calls
// (/brain, bridge/brain.ts), and ElevenLabs speaks each text of the brain (/speak, bridge/eleven.ts).
// `bun bridge/claude-call-check.ts` checks it with the real parts.
import { downsample, join } from "./pcm";

export type BrainEvent = { n: number; type: "text" | "tool" | "done" | "end" | "app"; text: string };
export type BrainIO = {
  // The rate of the frames of the microphone (44.1 or 48 kHz).
  rate: number;
  // POST /brain for this call, which gives the number of the last event so far, and GET /brain for the events after n.
  post(body: { text?: string; stop?: boolean; end?: boolean }): Promise<{ n?: number } | void>;
  poll(after: number): Promise<BrainEvent[]>;
  // One part of the sound of a turn, PCM16 at 16 kHz (POST /dictate). It gives the text so far, and with `end` the
  // last text.
  dictate(id: string, part: Int16Array<ArrayBuffer>, end: boolean): Promise<string>;
  // One text of the brain as speech, PCM16 at 24 kHz (POST /speak).
  speak(text: string): Promise<ArrayBuffer>;
  // Plays the speech after the speech that plays now. `hush` stops all of it.
  play(pcm: ArrayBuffer): void;
  hush(): void;
  playing(): boolean;
  // The words of the user, and each text of the brain when it starts to play, for the transcript of the call.
  heard(text: string): void;
  spoke(text: string): void;
  // Each event of the brain, for call.log and for the transcript of the call.
  note(event: BrainEvent): void;
  log(text: string): void;
  // show_tab, show_agent and show_workspace of the brain (the bridge sends it as show_project, which an older app knows).
  app(name: string, input: Record<string, string>): void;
  // What the screen of the app shows now (screen() of src/App.tsx).
  screen(): string;
  // Ends the call when the audio that plays now is over. `fail` ends it at once with an error.
  hangUp(): void;
  fail(message: string): void;
};
// The brain answers a note of the app that needs no words with "(quiet)". A model can add a dot or drop the brackets.
const QUIET = /^\W*quiet\W*$/i;
// The silence that ends a turn of the user, as in the Grok call (SILENCE_MS in src/voice.ts).
const SILENCE_MS = 1200;
// A frame whose loudest sample is over this part of full scale is speech. With the echo cancellation of the call, the
// call log had peaks of 0.002 to 0.04 in silence and 0.25 to 0.5 in speech. While the brain speaks, a
// frame needs more, so that the echo of its voice starts fewer turns.
// shortcut: fixed levels; tune them from the "mic: ... peak" lines of call.log if turns start in silence or never.
const SPEECH = 0.06;
const SPEECH_OVER_VOICE = 0.15;
// The sound just before the first loud frame goes with the turn, so that its first syllable is not lost.
const BEFORE_FRAMES = 3;
// Each answer of the speech model holds the text of the part before it, as in the dictation (PART_MS in src/dictate.ts).
const PART_MS = 150;

export function brainCall(io: BrainIO) {
  // The texts of the brain that wait to play. The speech of each one loads at once, so that the texts play with no gap.
  const lines: { text: string; audio: Promise<ArrayBuffer> }[] = [];
  let loading = false; // The speech of the next text loads, and it plays when it comes.
  let gen = 0; // Goes up when the user speaks over the brain. The speech of an older text then does not play.
  let hearing = 0; // The turns of the user with words whose last text did not come yet. The texts of the brain wait for them.
  let cut = false; // The user spoke over the brain.
  let shown = ""; // The last screen that the brain got.
  let live = true;
  // New words of the user make the texts of the brain up to `stale` old: the user did not hear them, and the newest
  // words count. The poll waits for `posted`, so it knows `stale` before it uses the events.
  let stale = 0;
  let posted: Promise<unknown> = Promise.resolve();
  // The brain called end_call. The call ends after the end of that turn, when its last text played.
  let ending = false;
  let last = false;
  const finish = () => last && !loading && !lines.length && io.hangUp();

  const say = (text: string) => {
    const audio = io.speak(text);
    audio.catch(() => {}); // A text that the user cuts off never plays, and its error goes nowhere.
    lines.push({ text, audio });
  };
  // One text at a time. Its speech plays after the speech of the text before it.
  function pump() {
    if (loading || hearing || !live || !lines.length) return;
    const line = lines.shift()!;
    const at = gen;
    loading = true;
    line.audio
      .then((pcm) => {
        if (at !== gen || !live) return;
        io.spoke(line.text);
        io.play(pcm);
      })
      // shortcut: one failed speech ends the call, so that the user does not wait in silence. Skip the text and go
      // on if a network that drops for a moment ends calls.
      .catch((e: Error) => io.fail(`The call ended: the voice failed: ${e.message}`))
      .finally(() => {
        loading = false;
        pump();
        finish();
      });
  }

  // One poll at a time for the whole call. The bridge holds each poll until the brain has news, or for 8 s.
  void (async () => {
    let after = 0;
    while (live) {
      const events = await io.poll(after).catch(() => new Promise<BrainEvent[]>((r) => setTimeout(() => r([]), 1000)));
      await posted;
      for (const e of events) {
        after = Math.max(after, e.n);
        io.note(e);
        if (e.n <= stale) continue;
        if (e.type === "text" && !QUIET.test(e.text)) say(e.text);
        if (e.type === "app") {
          const { name, input } = JSON.parse(e.text);
          io.app(name, input);
        }
        if (e.type === "end") ending = true;
        if (e.type === "done" && ending) last = true;
        // A turn that failed, or a brain that stopped: the user must not wait in silence.
        if (e.type === "done" && e.text !== "success" && e.text !== "stopped") say("Sorry, I did not get an answer.");
      }
      pump();
      finish();
    }
  })();

  // The speech of the brain stops, and the texts that wait are dropped.
  function interrupt() {
    if (loading || lines.length || io.playing()) cut = true;
    gen++;
    lines.length = 0;
    io.hush();
  }
  // The words of the user. They stop the turn that runs, because the newest words count.
  function heard(text: string) {
    interrupt();
    io.heard(text);
    const screen = io.screen();
    const notes = [
      cut ? "[Yonder app] The user spoke over your last answer, so they did not hear all of it." : "",
      screen !== shown ? `[Yonder app] The screen of the app now:\n${screen}` : "",
    ].filter(Boolean);
    cut = false;
    shown = screen;
    // New words of the user come first: the brain can call end_call again.
    ending = last = false;
    posted = io.post({ stop: true, text: [...notes, text].join("\n\n") }).then((r) => void (stale = Math.max(stale, r?.n ?? 0)), () => {});
  }

  // A turn of the user: from the first loud frame to SILENCE_MS of quiet frames. Its sound goes to the speech model
  // in parts, one part at a time, as in the dictation.
  type Turn = { id: string; parts: Int16Array[]; quiet: number; done: boolean };
  let turn: Turn | undefined;
  let before: Int16Array[] = [];
  function listen(t: Turn) {
    void (async () => {
      let text = "";
      let words = false;
      try {
        for (;;) {
          await new Promise((r) => setTimeout(r, PART_MS));
          const end = t.done || !live;
          const part = join(t.parts.splice(0));
          if (!part.length && !end) continue;
          const got = await io.dictate(t.id, part, end);
          // The last text is from the better model, but it can be empty when the faster one heard words.
          if (got.trim()) text = got.trim();
          if (end) break;
          // The first words of the user stop the voice of the brain. A sound with no words, such as a cough or the
          // echo of the voice, does not.
          if (text && !words) {
            words = true;
            hearing++;
            interrupt();
          }
        }
      } catch (e) {
        io.log(`dictation failed: ${(e as Error).message}`);
      }
      if (words) hearing--;
      if (text && live) heard(text);
      pump();
    })();
  }

  return {
    // The user or the brain talks, so the news of the app waits.
    talking: () => !!turn || hearing > 0 || loading || lines.length > 0,
    // One frame of the microphone, PCM16 at the rate of the device.
    frame(pcm: Int16Array) {
      let top = 0;
      for (const s of pcm) top = Math.max(top, Math.abs(s));
      const loud = top > (io.playing() ? SPEECH_OVER_VOICE : SPEECH) * 0x8000;
      const part = downsample(pcm, io.rate);
      if (turn) {
        turn.parts.push(part);
        turn.quiet = loud ? 0 : turn.quiet + (pcm.length / io.rate) * 1000;
        if (turn.quiet >= SILENCE_MS) {
          turn.done = true;
          turn = undefined;
        }
        return;
      }
      before.push(part);
      if (before.length > BEFORE_FRAMES) before.shift();
      if (!loud) return;
      turn = { id: Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join(""), parts: before, quiet: 0, done: false };
      before = [];
      listen(turn);
    },
    // A note of the app, such as news of the agents. It waits for the turn that runs.
    tell(text: string) {
      void io.post({ text }).catch(() => {});
    },
    end() {
      live = false;
      if (turn) turn.done = true;
      void io.post({ end: true }).catch(() => {});
    },
  };
}
