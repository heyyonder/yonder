// Collects microphone samples into PCM16 frames of 100 ms for the WebSocket.
// With each frame it sends the loudness before the clip: the peak, the RMS and the count of clipped samples.
// The input comes after the gain of the call (src/voice.ts), which does not clip, so the true level shows.
registerProcessor(
  "mic",
  class extends AudioWorkletProcessor {
    constructor({ processorOptions }) {
      super();
      // Keep the size apart: a transferred buffer leaves the old array empty.
      this.size = processorOptions.frame;
      this.frame = new Int16Array(this.size);
      this.length = 0;
      this.peak = 0;
      this.sum = 0;
      this.clip = 0;
    }

    process([input]) {
      for (const sample of input[0] ?? []) {
        const abs = Math.abs(sample);
        this.peak = Math.max(this.peak, abs);
        this.sum += sample * sample;
        if (abs > 1) this.clip++;
        this.frame[this.length++] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
        if (this.length === this.size) {
          const pcm = this.frame.buffer;
          this.port.postMessage({ pcm, peak: this.peak, rms: Math.sqrt(this.sum / this.size), clip: this.clip }, [pcm]);
          this.frame = new Int16Array(this.size);
          this.length = 0;
          this.peak = 0;
          this.sum = 0;
          this.clip = 0;
        }
      }
      return true;
    }
  },
);
