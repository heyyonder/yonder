// Checks the skill yonder-screens (bridge/skill.ts) against the real API, so the two cannot drift: `bun
// bridge/skill-check.ts`, and check.yml runs it. It runs the SDK of a page (src/OwnScreen.tsx) and walks
// `window.yonder`, and it reads the tokens, the kit, the abilities, the tabs, the look keys, the samples, the actions of
// `customize` and the sizes of the check from their source. Each one must be in the skill, and each `yonder.x.y` of the
// skill must be a real call.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FILES } from "./skill";
import { SAMPLES } from "./ui";
import { SIZES } from "./screen-lint";

const ROOT = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const skill = Object.values(FILES).join("\n");
const own = read("src/OwnScreen.tsx");
const missing: string[] = [];
const need = (what: string, text: string) => skill.includes(text) || missing.push(`${what} ${text}`);
const match = (path: string, re: RegExp) => {
  const m = re.exec(read(path));
  if (!m) throw new Error(`FAIL: ${re} is not in ${path}. Change this check with the code.`);
  return m[1];
};
const strings = (list: string) => [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

// The calls of a page: the SDK runs with a stand-in parent window, and the walk lists each function and value.
const sdk = match("src/OwnScreen.tsx", /const SDK = `<script>([\s\S]*?)<\/script>`;/)
  .replace("ICONS_JSON", "{}")
  .replace("WORD_JSON", JSON.stringify({ one: "", many: "", One: "", Many: "" }));
const win: Record<string, any> = { parent: { postMessage() {} }, addEventListener() {} };
new Function("window", "parent", "addEventListener", sdk)(win, win.parent, win.addEventListener);
// `calls`: each function and each value of the top, which the skill must name. `known`: also the fields of a value,
// such as yonder.word.One, which the skill may name.
const calls = new Set<string>();
const known = new Set<string>();
const walk = (value: any, path: string, top: boolean) => {
  known.add(path);
  if (typeof value === "function" || top) calls.add(path);
  if (value && (typeof value === "object" || typeof value === "function") && !Array.isArray(value))
    for (const key of Object.keys(value)) walk(value[key], `${path}.${key}`, false);
};
for (const key of Object.keys(win.yonder)) walk(win.yonder[key], `yonder.${key}`, true);
for (const c of calls) need("the call", c);
// The events of `yonder.on(event, fn)`: each event that the SDK listens for.
for (const event of new Set([...sdk.matchAll(/\bon\("([a-z]+)"|subs\.([a-z]+)/g)].map((m) => m[1] ?? m[2]))) need("the event", `yonder.on("${event}"`);
// The space of the home bar, which the host gives each page next to the tokens.
if (own.includes("--under:")) need("the variable", "--under");
// Each call that the skill names must be real (a call of an older API, such as yonder.chat.texts, fails).
for (const m of new Set([...skill.matchAll(/\byonder(?:\.[a-zA-Z]+)+/g)].map((m) => m[0]))) if (!known.has(m)) missing.push(`(not a real call) ${m}`);

for (const t of strings(match("src/OwnScreen.tsx", /const TOKENS = \[([^\]]+)\]/))) need("the token", `--${t}`);
for (const c of new Set(read("src/kit/kit.css").match(/\.y-[a-z-]+/g))) need("the kit class", c.slice(1));
const abilities = match("src/abilities.ts", /const ABILITIES[^\n]*\n([\s\S]*?)\n\};/);
for (const a of [...[...abilities.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), ...strings(/Object\.fromEntries\(\[([^\]]+)\]/.exec(abilities)?.[1] ?? "")])
  need("the ability", `\`${a}\``);
for (const t of strings(match("src/App.tsx", /const TABS = \[([^\]]+)\]/))) need("the tab", `\`${t}\``);
for (const k of [...match("src/look.ts", /export type Look = \{([\s\S]*?)\n\};/).matchAll(/^ {2}([a-z]+)\??:/gm)].map((m) => m[1])) if (k !== "page") need("the key", `\`${k}\``);
for (const k of [...match("src/look.ts", /look\?: \{([^}]+)\}/).matchAll(/([a-z]+)\??:/g)].map((m) => m[1])) need("the look key", `\`look.${k}\``);
for (const f of Object.keys(Object.fromEntries([...match("src/look.ts", /const FONTS[^=]*= \{([\s\S]*?)\n\};/).matchAll(/^ {2}([a-z]+):/gm)].map((m) => [m[1], 1])))) need("the font", `\`${f}\``);
for (const k of new Set([...read("src/App.tsx").matchAll(/\bcopy\("([a-zA-Z]+)"/g)].map((m) => m[1]))) need("the copy key", `\`${k}\``);
for (const s of Object.keys(SAMPLES)) need("the sample", `\`${s}\``);
// Each sample that the skill lists must be real.
for (const m of /The samples are ([\s\S]*?)\.\s/.exec(skill)?.[1].matchAll(/`([a-z][a-z-]*)`/g) ?? []) if (!SAMPLES[m[1]]) missing.push(`(not a sample) ${m[1]}`);
for (const a of strings(match("bridge/main.ts", /"customize",[\s\S]*?action: z\.enum\(\[([^\]]+)\]/))) need("the customize action", `\`${a}\``);
for (const s of SIZES) need("the size of the check", `${s.w} by ${s.h} px`);

if (missing.length) {
  console.error(`FAIL: the skill yonder-screens (bridge/skills/yonder-screens/) does not match the API:\n- ${missing.join("\n- ")}`);
  process.exit(1);
}
console.log(`ok: the skill names each of the ${calls.size} calls of a page, and each call that it names is real`);
