// The built-in themes, in the order of the gallery, for the screen (src/look.ts) and the bridge (bridge/ui.ts). Yonder is
// the default and has no values. A new theme is one folder and one line here (themes/README.md).
// A page is a text import of Bun, so the compiled bridge contains it. Vite reads it as `?raw` (vite.config.ts).
import yonder from "./yonder/theme.json";
import dashboard from "./dashboard/theme.json";
import dashboardPage from "./dashboard/page.html" with { type: "text" };
import big from "./big/theme.json";
import terminal from "./terminal/theme.json";
import omarchy from "./omarchy/theme.json";
import playful from "./playful/theme.json";
import duet from "./duet/theme.json";
import duetPage from "./duet/page.html" with { type: "text" };
import grokBot from "./grok-bot/theme.json";
import grokBotPage from "./grok-bot/page.html" with { type: "text" };

// The types of Bun say HTMLBundle for an import of HTML. With `type: "text"`, it is the text of the file.
const page = (theme: object, html: unknown) => ({ ...theme, page: html as string });

export const THEMES: Record<string, Record<string, unknown>> = {
  yonder,
  dashboard: page(dashboard, dashboardPage),
  big,
  terminal,
  omarchy,
  playful,
  duet: page(duet, duetPage),
  "grok-bot": page(grokBot, grokBotPage),
};
