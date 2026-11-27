// Yonder's own mod for Claude Code: a plugin that each Claude Code worker loads with --plugin-dir. It sends the bridge
// what the other mods of the agent show (POST /mods), so the app can show it. The bridge writes it into its config
// folder at each start, as installSkill does for the skill.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
// @ts-ignore: a text import of JavaScript, which tsc does not read. The module has the types of Claude Code, not ours.
import REGISTER from "./mod-register.js" with { type: "text" };

const FILES: Record<string, string> = {
  ".claude-plugin/plugin.json": JSON.stringify({ name: "yonder", version: "1.0.0", description: "Sends what the mods of this session show to Yonder." }),
  "hooks/hooks.json": JSON.stringify({ modules: ["./register.js"] }),
  "hooks/register.js": REGISTER,
};

// Writes the mod into `dir` and gives `dir`, or nothing when it fails. A failure only costs the mods in the app.
export function installMod(dir: string) {
  try {
    for (const [path, text] of Object.entries(FILES)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return dir;
  } catch (e) {
    console.error(`The mod of Yonder was not installed: ${(e as Error).message}`);
  }
}
