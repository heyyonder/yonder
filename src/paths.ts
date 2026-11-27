// A full path in an answer of an agent is a link, and a click opens it in Finder (open_folder). A path starts with ~/, or with a root folder of macOS or Linux and a name after it, so that a slash
// command such as /help and a route of a site such as /review/ or /playground/material-designer stay text (Sentry
// YONDER-T, YONDER-14). As in findMedia (bridge/media.ts), a path outside backticks ends at a space.
// shortcut: no Windows drive paths (C:\), because react-markdown takes "C:" for a scheme and drops the href.
// shortcut: a path under a root folder that is not in this list stays text; add the folder when an agent names one.
const ROOT = String.raw`~\/|\/(?:Users|home|Volumes|Applications|Library|System|private|tmp|var|opt|usr|etc|root|mnt|run|srv|nix)\/`;
const PATH = new RegExp(String.raw`(?<![\w.:~/-])(?:${ROOT})[^\s"'\`<>()[\]{}]+`, "g");
// A path in backticks can have spaces.
const CODE_PATH = new RegExp(String.raw`^(?:${ROOT})[^\n]+$`);
export const isPath = (href: string) => /^~?\//.test(href);
// The web addresses of a message, in order, without the punctuation after them, such as the period of a sentence or
// the ** of Markdown. Tunnel in the three dots of an agent opens the last site of them.
export const urlsOf = (text: string) => (text.match(/https?:\/\/[^\s"'`<>()[\]{}]+/g) ?? []).map((u) => u.replace(/[.,;:!?*_]+$/, ""));
// The link opens the file without its line, such as :42.
const link = (text: string) => ({ type: "element", tagName: "a", properties: { href: text.replace(/(:\d+)+$/, "") }, children: [{ type: "text", value: text }] });

// A rehype plugin that splits each text node at its paths. It leaves the links and the code blocks as they are.
export function rehypePaths() {
  const walk = (node: any) => {
    if (!node.children || node.tagName === "a" || node.tagName === "pre") return;
    const only = node.children[0];
    if (node.tagName === "code" && node.children.length === 1 && only.type === "text" && CODE_PATH.test(only.value)) return void (node.children = [link(only.value)]);
    node.children = node.children.flatMap((c: any) => {
      if (c.type !== "text") return walk(c), [c];
      const parts: any[] = [];
      let last = 0;
      for (const m of c.value.matchAll(PATH)) {
        // The punctuation after a path, such as the end of a sentence, stays text.
        const text = m[0].replace(/[.,;:!?]+$/, "");
        parts.push({ type: "text", value: c.value.slice(last, m.index) }, link(text));
        last = m.index! + text.length;
      }
      return parts.length ? [...parts, { type: "text", value: c.value.slice(last) }] : [c];
    });
  };
  return walk;
}
