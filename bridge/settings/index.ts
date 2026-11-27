// The schema of the Settings (docs/screen-api.md): one file for each section, as one folder for each page of the
// Settings. Each file gives the id, the name and the icon of its section, `only` ("phone", or "mac" for the Mac app), and
// its settings in the order of the page. This list gives the order of the sections. The bridge serves it at /settings,
// and the screen keeps a copy for a start with no bridge.
import environment from "./environment.json";
import general from "./general.json";
import agents from "./agents.json";
import mcp from "./mcp.json";
import schedules from "./schedules.json";
import triggers from "./triggers.json";
import tools from "./tools.json";
import voice from "./voice.json";
import keys from "./keys.json";
import appearance from "./appearance.json";
import usage from "./usage.json";
import feedback from "./feedback.json";
import account from "./account.json";
import superuser from "./superuser.json";

// `superuser`: the section shows only to a super user of yonder.so (src/Settings.tsx).
// `home`: false hides the section from the list. Usage and Feedback open from Account. MCP opens from
// Environments. Super user opens from Voice.
export type Section = { id: string; name: string; icon: string; only?: "phone" | "mac"; superuser?: boolean; home?: boolean; settings: Record<string, unknown>[] };
export const SECTIONS = [agents, environment, general, voice, appearance, tools, schedules, triggers, keys, account, usage, feedback, mcp, superuser] as Section[];
// Each setting with the id of its section.
export const SCHEMA = SECTIONS.flatMap((s) => s.settings.map((x) => ({ ...x, section: s.id })));
