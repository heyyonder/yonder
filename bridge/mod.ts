// Yonder's own mod for Claude Code: the plugin in plugins/yonder/, which each Claude Code worker loads with --plugin-dir.
// It sends the bridge what the other mods of the agent show (POST /mods), so the app can show it. The files are text
// imports, so the compiled bridge contains them, and the bridge writes them into its config folder at each start, as
// installSkill does for the skill.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
// @ts-ignore: text imports, which tsc types as the JSON or the module, not as text.
import PLUGIN from "../plugins/yonder/.claude-plugin/plugin.json" with { type: "text" };
// @ts-ignore
import HOOKS from "../plugins/yonder/hooks/hooks.json" with { type: "text" };
// @ts-ignore
import REGISTER from "../plugins/yonder/hooks/register.js" with { type: "text" };

const FILES = {
  ".claude-plugin/plugin.json": PLUGIN,
  "hooks/hooks.json": HOOKS,
  "hooks/register.js": REGISTER,
} as unknown as Record<string, string>;

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
