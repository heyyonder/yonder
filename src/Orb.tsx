import { useEffect, useRef } from "react";
import { useSpring } from "motion/react";
import { size } from "./Levels";

// The orb of the big talk button: two thick wobbly rings in plain SVG, an ink ring inside and a red ring with a red
// glow outside, as a circle drawn by hand (like the logo of Headspace). Both rings follow the same shape, but each one
// drifts a little in its own way, so they overlap and part as in a print that is a little off. The voice of the user
// makes them bounce and wobble more, and the red ring follows the voice a little late. The voice drives two springs
// of Motion, so the rings move smoothly and bounce past their size a little. In light mode the orb is a neon light: a
// white ring with a pink rim, a hot pink ring with a wide glow, and a soft pink wash behind them. The CSS picks the
// glows for each theme. Small dots of light leave the orb and drift slowly out and fade. Without a voice only a few
// come, and a voice sprinkles out many more, faster, and blows the dots that are out, as a wind.
// The glows are CSS blurs, each on its own layer: a stack of SVGs, one for each blur, with copies of the rings and of
// the dots (the layers in app.css). WebKit draws an SVG filter on the CPU again on each frame, so SVG filters make the
// orb laggy. WebKit gives a CSS blur on a layer of its own to the GPU, so each frame draws only the plain paths.
// The dots are only in the sharp layer. The dots fly over the whole box, so a blurred layer with dots draws and blurs
// its whole box again on each frame, and a loud voice makes the orb jerky on an Android phone (a Galaxy S9 draws a
// frame in about 57 ms). Without the dots in the blurred layers, a frame takes about 27 ms.
const POINTS = 12;
const RADIUS = 58;
// The waves around the ring: [the number of waves, the size, the speed]. Few and slow waves keep the circle soft.
const WAVES = [
  [2, 3, 0.7],
  [3, 2.4, -0.9],
  [5, 1.1, 1.3],
] as const;

// The layers from the bottom up, and the parts in each: [the name, the parts]. app.css gives each layer its blur and
// hides the parts that a theme does not use.
const LAYERS = [
  ["far", "red"],
  ["mid", "red"],
  ["near", "red"],
  ["rim", "red ink"],
  ["sharp", "dots red ink"],
] as const;
const RED = ring(0, 0, 3, 1);
const INK = ring(0, 0, 0, 0);

// `boost` makes the rings move more for the same voice. The talk bar of a conversation shows the orb at 35 %, so the
// same voice moves its rings only a third as many pixels. The boost lifts only a quiet voice: it multiplies a small
// level by `boost`, but a full level stays at 1 (`lift`). A plain multiply makes a loud voice 2.5 times too big.
export function Orb({ listening, levels, boost = 1 }: { listening: boolean; levels: () => { mic: number }; boost?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const live = useRef({ listening, levels, boost });
  live.current = { listening, levels, boost };
  // A low damping lets the rings overshoot and bounce back. The red spring is softer, so it follows late.
  const inkVoice = useSpring(0, { stiffness: 320, damping: 11 });
  const redVoice = useSpring(0, { stiffness: 150, damping: 9 });
  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let time = 0;
    let last = performance.now();
    let due = 0;
    const flying: Dot[] = [];
    const all = <T extends Element>(selector: string) => [...root.current!.querySelectorAll<T>(selector)];
    const inks = all(".orb-ink");
    const reds = all(".orb-red");
    const groups = all<SVGGElement>(".orb-dots");
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const delta = still ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      const { listening, levels, boost } = live.current;
      // The square root lifts a normal voice (about 0.3) to about 0.55.
      const target = listening ? Math.sqrt(size(levels().mic)) : 0;
      inkVoice.set(target);
      redVoice.set(target);
      const voice = inkVoice.get();
      const late = redVoice.get();
      time += delta * (listening ? 1 + Math.max(0, voice) * 2 : 0.4);
      const inkPath = ring(time, lift(voice, boost), 0, 0);
      const redPath = ring(time, lift(late, boost), 3, 1);
      for (const el of inks) el.setAttribute("d", inkPath);
      for (const el of reds) el.setAttribute("d", redPath);
      // A few dots each second without a voice, and up to about 40 more for a loud voice.
      due += delta * (listening ? 3 + Math.max(0, voice) * 40 : 1.5);
      for (; due >= 1; due--) flying.push(dot(groups, voice));
      const wind = 1 + Math.max(0, voice) * 3;
      for (let i = flying.length - 1; i >= 0; i--) {
        const d = flying[i];
        d.age += delta;
        if (d.age >= d.life) {
          for (const el of d.els) el.remove();
          flying.splice(i, 1);
          continue;
        }
        // Each dot drifts a little at random, so the dots move in a chaotic swarm. A voice is a wind: it shakes all the
        // dots that are out and pushes them faster.
        const shake = 90 * wind * delta;
        d.vx += (Math.random() - 0.5) * shake;
        d.vy += (Math.random() - 0.5) * shake;
        d.x += d.vx * wind * delta;
        d.y += d.vy * wind * delta;
        const [cx, cy, opacity] = [d.x.toFixed(2), d.y.toFixed(2), Math.sin((Math.PI * d.age) / d.life).toFixed(2)];
        for (const el of d.els) {
          el.setAttribute("cx", cx);
          el.setAttribute("cy", cy);
          el.setAttribute("opacity", opacity);
        }
      }
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      for (const d of flying) for (const el of d.els) el.remove();
    };
  }, [inkVoice, redVoice]);
  return (
    <div ref={root} className="orb" aria-hidden>
      {LAYERS.map(([name, parts]) => (
        <svg key={name} className={`orb-${name}`} viewBox="-250 -250 500 500">
          {parts.includes("dots") && <g className="orb-dots" />}
          {parts.includes("red") && <path className="orb-red" d={RED} />}
          {parts.includes("ink") && <path className="orb-ink" d={INK} />}
        </svg>
      ))}
    </div>
  );
}

type Dot = { els: SVGCircleElement[]; x: number; y: number; vx: number; vy: number; age: number; life: number };

// A new dot on the ring, at a random angle. It moves out and a little to the side, faster for a louder voice. One dot
// in three is ink and the others are red. Each layer with dots gets a copy of the dot.
function dot(groups: SVGGElement[], voice: number): Dot {
  const angle = Math.random() * Math.PI * 2;
  const from = RADIUS + 2 + voice * 16;
  const speed = 6 + Math.random() * 8 + Math.max(0, voice) * 12;
  const side = (Math.random() - 0.5) * 8;
  const r = (0.4 + Math.random() * 0.8).toFixed(2);
  const kind = Math.random() < 1 / 3 ? "orb-dot-ink" : "orb-dot-red";
  const els = groups.map((group) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    el.setAttribute("r", r);
    el.setAttribute("class", kind);
    el.setAttribute("opacity", "0");
    return group.appendChild(el);
  });
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return { els, x: cos * from, y: sin * from, vx: cos * speed - sin * side, vy: sin * speed + cos * side, age: 0, life: 1.8 + Math.random() * 2 };
}

// The gain is `boost` near 0 and falls to 1 at a full level, as a compressor. The springs overshoot a little past 1.
function lift(v: number, boost: number) {
  return (v * boost) / (1 + (boost - 1) * Math.abs(v));
}

// One ring as a smooth closed path. `out` moves the ring out from the middle, and `drift` gives the ring its own slow
// offset of the waves and of its middle, so that two rings with a different drift part and meet again.
function ring(time: number, voice: number, out: number, drift: number) {
  const grow = 1 + voice * 4;
  const r = RADIUS + out + voice * 16 + Math.sin(time * 5) * voice * 4;
  const points = Array.from({ length: POINTS }, (_, i) => {
    const angle = (i / POINTS) * Math.PI * 2;
    let d = r;
    for (const [n, height, speed] of WAVES) {
      const offset = drift * 0.9 * Math.sin(time * 0.45 + n * 1.7);
      d += height * grow * Math.sin(n * angle + speed * time + offset);
    }
    return [Math.cos(angle) * d + drift * 2.5 * Math.sin(time * 0.6), Math.sin(angle) * d + drift * 2.5 * Math.cos(time * 0.5)];
  });
  // Catmull-Rom through the points, as cubic Bézier curves.
  const at = (i: number) => points[(i + POINTS) % POINTS];
  const f = (v: number) => v.toFixed(2);
  let path = `M${f(at(0)[0])} ${f(at(0)[1])}`;
  for (let i = 0; i < POINTS; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    path += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return path + "Z";
}
