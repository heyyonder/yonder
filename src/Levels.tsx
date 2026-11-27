import { useEffect, useRef } from "react";

// Speech is about 0.05 to 0.3 (RMS), and a quiet room about 0.002. The square root lifts the quiet words,
// and the gate keeps the noise of the room at 0, so that the dots do not move while the user thinks.
export const size = (v: number) => Math.max(0, Math.min(1, (Math.sqrt(v) * 1.8 - 0.12) / 0.88));

// The voices of a live call, as in a FaceTime call of iOS: a row of dots that stays still in silence.
// When a voice comes, the dots grow into bars and bounce, higher in the middle. The dots are solid when the user
// speaks and faint when Grok speaks. The bars do not move all the time, so they do not take the attention of the user.
export function Levels({ levels }: { levels: () => { mic: number; out: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const step = 5;
    let mic = 0;
    let out = 0;
    let frame = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const live = levels();
      // A voice lifts the bars at once, and they fall back in about 0.2 s.
      mic = Math.max(size(live.mic), mic * 0.85);
      out = Math.max(size(live.out), out * 0.85);
      const ratio = devicePixelRatio;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * ratio || canvas.height !== h * ratio) {
        canvas.width = w * ratio;
        canvas.height = h * ratio;
      }
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = getComputedStyle(canvas).color;
      const you = mic >= out;
      const level = you ? mic : out;
      g.globalAlpha = you ? 1 : 0.45;
      const count = Math.floor((w + 2) / step);
      const left = (w - (count * step - 2)) / 2;
      for (let i = 0; i < count; i++) {
        // The middle bars are the highest, and each bar bounces at its own speed.
        const middle = Math.sin((Math.PI * (i + 0.5)) / count);
        const bounce = 0.55 + 0.45 * Math.sin(now / (90 + ((i * 37) % 60)) + i * 2.1);
        const bar = Math.max(3, level * middle * bounce * h);
        g.beginPath();
        g.roundRect(left + i * step, (h - bar) / 2, 3, bar, 1.5);
        g.fill();
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [levels]);
  return <canvas className="levels" ref={ref} aria-hidden />;
}
