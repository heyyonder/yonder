// The skill for the agents that build a screen of Yonder (bridge/skills/yonder-screens/). The bridge writes it into
// ~/.claude/skills/ at each start, so each Claude Code agent finds it, and serves it as one page at /ui?guide.
// `bun bridge/skill-check.ts` checks it against the real API. This one skill takes the place of a guide, docs and a
// CLAUDE.md in each screen folder.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import SKILL from "./skills/yonder-screens/SKILL.md" with { type: "text" };
import API from "./skills/yonder-screens/references/api.md" with { type: "text" };
import STYLE from "./skills/yonder-screens/references/style.md" with { type: "text" };
import PATTERNS from "./skills/yonder-screens/references/patterns.md" with { type: "text" };

export const SKILL_NAME = "yonder-screens";
export const FILES: Record<string, string> = {
  "SKILL.md": SKILL,
  "references/api.md": API,
  "references/style.md": STYLE,
  "references/patterns.md": PATTERNS,
};
// The whole skill as one page, for the agents and the old CLAUDE.md files that read /ui?guide.
export const GUIDE = Object.values(FILES).join("\n\n---\n\n");

// Writes the skill over the copy of an older bridge. A failure only costs the skill, so it does not stop the bridge.
export function installSkill(home: string) {
  try {
    for (const [path, text] of Object.entries(FILES)) {
      const file = join(home, ".claude/skills", SKILL_NAME, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  } catch (e) {
    console.error(`The skill ${SKILL_NAME} was not installed: ${(e as Error).message}`);
  }
}
