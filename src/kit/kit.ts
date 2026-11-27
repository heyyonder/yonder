// The kit of a screen (docs/screen-api.md): the CSS parts and the icons of Yonder that each page in a frame gets. The
// icons are the paths of src/icons.tsx, the same icons as the default screen.
import { PATHS } from "../icons";
import KIT_CSS from "./kit.css?raw";

export { KIT_CSS };
// In the names and projects modes (`agentNaming`), `y-num` holds a name, such as "Jack" or "Sundial 7": a wider column
// and a smaller text, as the rows of the default screen.
export const KIT_NAMED = ".y-row { grid-template-columns: 64px minmax(0, 1fr) auto; } .y-row > .y-num { font-size: 15px; line-height: 1.15; overflow-wrap: anywhere; }";
export const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(PATHS).map(([name, paths]) => [name, `<svg class="y-icon" viewBox="0 0 24 24">${(paths as string[]).map((d) => `<path d="${d}"/>`).join("")}</svg>`]),
);
