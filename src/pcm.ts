// The sound of the microphone for the speech model of Apple (bridge/dictate.ts), in the dictation (src/dictate.ts) and
// in a Claude call (src/brain.ts). It imports nothing, so bridge/claude-call-check.ts runs it in Bun.
const RATE = 16000; // PCM16 at 16 kHz, mono: 32 KB for each second through the relay.

export function join(frames: Int16Array[]) {
  const out = new Int16Array(frames.reduce((n, f) => n + f.length, 0));
  let at = 0;
  for (const frame of frames) {
    out.set(frame, at);
    at += frame.length;
  }
  return out;
}

// Each sample at 16 kHz is the mean of the samples of the device (44.1 or 48 kHz) in its time, a simple low-pass
// filter. The speech model needs nothing better.
export function downsample(frame: Int16Array, rate: number) {
  const step = rate / RATE;
  const out = new Int16Array(Math.floor(frame.length / step));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = from; j < to; j++) sum += frame[j];
    out[i] = sum / (to - from);
  }
  return out;
}
