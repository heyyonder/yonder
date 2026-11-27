// The Tools section of the Settings: a short list of tools that let agents do more on this computer. The bridge only
// looks for each tool. It installs one only when the user taps Install, and a tool that is already there stays as it is.
// An install runs on the computer of the bridge, so a tap on the phone installs on the paired Mac, Linux or Windows
// computer.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { locate } from "./clis";

const HOME = homedir();
const WINDOWS = process.platform === "win32";

type Tool = {
  id: string;
  name: string;
  about: string;
  url: string; // The page of the tool, under its row.
  bins: string[];
  marker?: string; // A tool that is a folder, not a CLI: a file in the folder that shows that it is there. Then `bins` is empty.
  skills: string[]; // The folders in ~/.claude/skills that teach agents the tool. Any one of them counts. None: no skill.
  // The commands that install the tool and its skill, and the commands that add only the skill. `win` is PowerShell;
  // with none, the tool does not show on Windows.
  install: { sh: string; win?: string };
  skill?: { sh: string; win?: string };
};

// The 1Password CLI: the newest version from the update server of 1Password, as the zip for this system, into
// ~/.local/bin. It needs no sudo, also on a Linux server with no package manager that we know.
const OP_VERSION = "https://app-updates.agilebits.com/check/1/0/CLI2/en/2.0.0/N";
const OP_ZIP = "https://cache.agilebits.com/dist/1P/op2/pkg";

// The Mind: a folder of markdown that agents keep as a second brain, with its own skills in .claude/skills. It goes to
// ~/mind as a copy of the template, with no link to it, so the folder is the user's own. The name is lowercase, so the folder is the project "mind" on every system.
const MIND = join(HOME, "mind");
const MIND_ZIP = "https://github.com/heyyonder/the-mind/archive/refs/heads/main";

const BH_SKILL = join(HOME, ".claude/skills/browser-harness");

// Kokoro: a free text to speech model of 82M parameters that runs on the CPU. The kokoro-tts CLI reads the model files
// (337 MB) from KOKORO, and the skill tells agents where they are.
const KOKORO = join(HOME, ".local/share/kokoro");
const KOKORO_FILES = "https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0";
const KOKORO_SKILL = join(HOME, ".claude/skills/kokoro");
const KOKORO_MD = `---
name: kokoro
description: Speak text aloud or make a voice audio file for free on this computer with the kokoro-tts CLI (the Kokoro text to speech model). Use when the user wants text read aloud, a voiceover, narration or a speech file, and no paid voice is asked for.
---

# Kokoro

Kokoro runs on the CPU of this computer, at no cost. Always pass \`--model\` and \`--voices\`:

\`\`\`sh
echo "Hello there" | kokoro-tts - out.wav --voice af_heart --model ${KOKORO}/kokoro-v1.0.onnx --voices ${KOKORO}/voices-v1.0.bin
\`\`\`

- Play it aloud: \`--stream\` in place of the file name. MP3: \`out.mp3 --format mp3\`.
- Input: \`-\` reads stdin; a .txt, .epub or .pdf file also works. Speed: \`--speed 1.1\`.
- Voices: af_heart, af_bella, af_nicole, am_michael, am_adam (American); bf_emma, bm_george (British). \`--help-voices\` lists all.
- Other languages: \`--lang en-gb|fr-fr|it|ja|cmn\` with a voice of that language.
- Blend two voices with \`--voice "af_heart:60,am_adam:40"\`.
`;
export const TOOLS: Tool[] = [
  {
    id: "browser-harness",
    name: "Browser Harness",
    about: "Lets agents click, type and read pages in your Chrome",
    url: "https://github.com/browser-use/browser-harness",
    bins: ["browser-harness", "browser-harness.exe"],
    skills: ["browser-harness", "browser-use"],
    install: {
      sh: 'command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh; "$(command -v uv || echo "$HOME/.local/bin/uv")" tool install --python 3.12 browser-harness',
      win: 'if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { irm https://astral.sh/uv/install.ps1 | iex }; $uv = (Get-Command uv -ErrorAction SilentlyContinue).Source; if (-not $uv) { $uv = "$HOME\\.local\\bin\\uv.exe" }; & $uv tool install --python 3.12 browser-harness',
    },
    skill: {
      sh: `mkdir -p '${BH_SKILL}' && "$(command -v browser-harness || echo "$HOME/.local/bin/browser-harness")" skill > '${BH_SKILL}/SKILL.md'`,
      // Out-File would write a byte-order mark before the front matter of the skill.
      win: `New-Item -ItemType Directory -Force '${BH_SKILL}' | Out-Null; $bh = (Get-Command browser-harness -ErrorAction SilentlyContinue).Source; if (-not $bh) { $bh = "$HOME\\.local\\bin\\browser-harness.exe" }; [IO.File]::WriteAllText('${BH_SKILL}\\SKILL.md', (& $bh skill | Out-String))`,
    },
  },
  {
    id: "vsb",
    name: "Visual Sandbox",
    about: "Lets agents make images, videos and sounds",
    url: "https://visualsandbox.com",
    bins: ["vsb"],
    skills: ["vsb"],
    install: { sh: "curl -fsSL https://visualsandbox.com/install.sh | sh" },
    skill: { sh: '"$(command -v vsb || echo "$HOME/.local/bin/vsb")" init' },
  },
  {
    id: "op",
    name: "1Password CLI",
    about: "Lets agents get passwords and keys from 1Password",
    url: "https://developer.1password.com/docs/cli",
    bins: ["op", "op.exe"],
    skills: [],
    install: {
      sh: `v=$(curl -fsSL ${OP_VERSION} | sed -n 's/.*"version":"\\([^"]*\\)".*/\\1/p'); os=$(uname -s | tr A-Z a-z); case $(uname -m) in x86_64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) arch=$(uname -m) ;; esac; t=$(mktemp -d); curl -fsSL "${OP_ZIP}/v$v/op_\${os}_\${arch}_v$v.zip" -o "$t/op.zip" && (unzip -q "$t/op.zip" -d "$t" || python3 -m zipfile -e "$t/op.zip" "$t") && mkdir -p "$HOME/.local/bin" && mv "$t/op" "$HOME/.local/bin/op" && chmod +x "$HOME/.local/bin/op"`,
      win: `$v = (irm ${OP_VERSION}).version; $t = Join-Path $env:TEMP "op-$v"; iwr "${OP_ZIP}/v$v/op_windows_amd64_v$v.zip" -OutFile "$t.zip"; Expand-Archive -Force "$t.zip" $t; New-Item -ItemType Directory -Force "$HOME\\.local\\bin" | Out-Null; Copy-Item -Force "$t\\op.exe" "$HOME\\.local\\bin\\op.exe"`,
    },
  },
  {
    id: "kokoro",
    name: "Kokoro",
    about: "Lets agents speak text aloud for free, on this computer",
    url: "https://huggingface.co/hexgrad/Kokoro-82M",
    bins: ["kokoro-tts"],
    skills: ["kokoro"],
    install: {
      sh: 'command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh; "$(command -v uv || echo "$HOME/.local/bin/uv")" tool install --python 3.12 kokoro-tts',
    },
    // The model files come with the skill, so a second tap gets them again when a download failed.
    skill: {
      sh: `mkdir -p '${KOKORO}' '${KOKORO_SKILL}' && for f in kokoro-v1.0.onnx voices-v1.0.bin; do [ -s '${KOKORO}'/$f ] || { curl -fsSL ${KOKORO_FILES}/$f -o '${KOKORO}'/$f.part && mv '${KOKORO}'/$f.part '${KOKORO}'/$f; } || exit 1; done && cat > '${KOKORO_SKILL}/SKILL.md' <<'EOF'\n${KOKORO_MD}EOF`,
    },
  },
  {
    id: "the-mind",
    name: "The Mind",
    about: "A second brain that agents keep for you: notes, sources and to-dos",
    url: "https://github.com/heyyonder/the-mind",
    bins: [],
    marker: join(MIND, "MIND.md"),
    skills: [],
    install: {
      sh: `[ -e '${MIND}' ] && { echo 'There is a folder at ${MIND} already' >&2; exit 1; }; t=$(mktemp -d) && curl -fsSL ${MIND_ZIP}.tar.gz | tar -xz -C "$t" && mv "$t/the-mind-main" '${MIND}' && (git -C '${MIND}' init -q 2>/dev/null || true)`,
      win: `if (Test-Path '${MIND}') { throw 'There is a folder at ${MIND} already' }; $t = Join-Path $env:TEMP "the-mind-$(Get-Random)"; iwr ${MIND_ZIP}.zip -OutFile "$t.zip"; Expand-Archive -Force "$t.zip" $t; Move-Item "$t\\the-mind-main" '${MIND}'; git -C '${MIND}' init -q`,
    },
  },
];

const shown = () => TOOLS.filter((t) => !WINDOWS || t.install.win);
const path = (t: Tool) => (t.marker ? (existsSync(t.marker) ? dirname(t.marker) : undefined) : t.bins.map(locate).find(Boolean));
const skilled = (t: Tool) => !t.skills.length || t.skills.some((s) => existsSync(join(HOME, ".claude/skills", s, "SKILL.md")));

// The install that runs now, and the last error of each tool.
const busy = new Set<string>();
const errors: Record<string, string> = {};

export const toolsInfo = () =>
  shown().map((t) => ({ id: t.id, name: t.name, about: t.about, url: t.url, path: path(t), skill: skilled(t), busy: busy.has(t.id), error: errors[t.id] }));

// Installs the tool and its skill, or only the skill when the tool is there. It runs in the background, so that it also
// works on a computer with no screen, and the Settings ask again until `busy` ends. `added` gets the folder of a tool that
// is a folder, so that it becomes a project.
export function installTool(id: string, env: Record<string, string | undefined>, added?: (folder: string) => void) {
  const t = shown().find((x) => x.id === id);
  if (!t || busy.has(id)) return;
  const skill = t.skill ?? { sh: "true", win: "$null" };
  const cmd = path(t) ? skill : { sh: `${t.install.sh} && ${skill.sh}`, win: t.install.win && skill.win && `${t.install.win}; ${skill.win}` };
  const argv = WINDOWS ? ["powershell", "-NoProfile", "-Command", cmd.win!] : ["/bin/sh", "-c", cmd.sh];
  busy.add(id);
  delete errors[id];
  const run = Bun.spawn(argv, { cwd: HOME, env, stdout: "pipe", stderr: "pipe", timeout: 300_000 });
  void Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text(), run.exited]).then(([out, err, code]) => {
    if (code !== 0 || !path(t) || !skilled(t)) errors[id] = (err.trim() || out.trim()).split("\n").pop()?.slice(-200) || `Exit ${code}`;
    else if (t.marker) added?.(path(t)!);
    busy.delete(id);
  });
}
