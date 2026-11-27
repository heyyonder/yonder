// What the Claude Code mods of an agent show, in its conversation view. A worker runs in a terminal that no one sees.
// Yonder's own mod in the worker (bridge/mod-register.js) sends the band above the prompt, each open pane, each status
// line and each toast, as Claude Code drew them for the terminal, and these parts draw them as HTML where Claude Code
// draws them: the band over the message box, the status lines and the toasts under it, and the panes beside the chat.
// Read only: a Button shows its label, because a plugin cannot press the Button of another plugin. The mods show in
// the conversation, not on a tab of their own.
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openLink } from "./bridge";

// One node of a drawing of Claude Code (RenderNode in its types): a string, or an element with props and children.
type Node = string | { type: string; props?: Record<string, unknown>; children?: Node[] };
type Toast = { id: string; text: string; ms: number };
export type Mods = { band?: Node; panes?: { id: string; title: string; tree: Node }[]; status?: string[]; toasts?: Toast[] };

// `engine` is a part that Claude Code draws itself, such as the band with no mod in it. This view draws no such part.
const drawn = (n?: Node) => !!n && (typeof n === "string" || n.type !== "engine");

// The colors of the terminal and the theme keys of Claude Code, in the colors of the app. A hex or rgb color stays.
const COLORS: Record<string, string> = {
  green: "var(--green)", success: "var(--green)", red: "var(--red)", error: "var(--red)", yellow: "var(--amber)", warning: "var(--amber)",
  blue: "var(--blue)", suggestion: "var(--blue)", magenta: "var(--purple)", cyan: "var(--blue)", claude: "var(--accent)",
  gray: "var(--muted)", grey: "var(--muted)", subtle: "var(--muted)", inactive: "var(--muted)", white: "var(--text)", text: "var(--text)",
};
const color = (c: unknown) => (typeof c !== "string" ? undefined : (COLORS[c.replace(/Bright$/, "")] ?? (/^(#|rgb)/.test(c) ? c : undefined)));
// A terminal counts in cells: a column is about 1ch, and a row is one line.
const cols = (v: unknown) => (typeof v === "number" ? `${v}ch` : typeof v === "string" && v.endsWith("%") ? v : undefined);
const rows = (v: unknown) => (typeof v === "number" ? `${v * 1.4}em` : undefined);

const boxStyle = (p: Record<string, any>): CSSProperties => ({
  display: p.display === "none" ? "none" : "flex",
  flexDirection: p.flexDirection ?? "row",
  flexWrap: p.flexWrap,
  flexGrow: p.flexGrow,
  flexShrink: p.flexShrink,
  alignItems: p.alignItems,
  alignSelf: p.alignSelf,
  justifyContent: p.justifyContent,
  rowGap: rows(p.rowGap ?? p.gap),
  columnGap: cols(p.columnGap ?? p.gap),
  width: cols(p.width),
  minWidth: cols(p.minWidth),
  paddingTop: rows(p.paddingTop ?? p.paddingY ?? p.padding),
  paddingBottom: rows(p.paddingBottom ?? p.paddingY ?? p.padding),
  paddingLeft: cols(p.paddingLeft ?? p.paddingX ?? p.padding),
  paddingRight: cols(p.paddingRight ?? p.paddingX ?? p.padding),
  marginTop: rows(p.marginTop ?? p.marginY ?? p.margin),
  marginBottom: rows(p.marginBottom ?? p.marginY ?? p.margin),
  marginLeft: cols(p.marginLeft ?? p.marginX ?? p.margin),
  marginRight: cols(p.marginRight ?? p.marginX ?? p.margin),
  backgroundColor: color(p.backgroundColor),
  ...(p.borderStyle && { border: "1px solid", borderColor: color(p.borderColor) ?? "var(--line)", borderRadius: p.borderStyle === "round" ? 8 : 0 }),
});

const textStyle = (p: Record<string, any>): CSSProperties => {
  const cut = typeof p.wrap === "string" && p.wrap.startsWith("truncate");
  return {
    color: p.inverse ? "var(--bg)" : color(p.color),
    backgroundColor: p.inverse ? (color(p.color) ?? "var(--text)") : color(p.backgroundColor),
    fontWeight: p.bold ? 600 : undefined,
    fontStyle: p.italic ? "italic" : undefined,
    textDecoration: [p.underline && "underline", p.strikethrough && "line-through"].filter(Boolean).join(" ") || undefined,
    opacity: p.dimColor ? 0.6 : undefined,
    whiteSpace: cut ? "nowrap" : "pre-wrap",
    ...(cut && { overflow: "hidden", textOverflow: "ellipsis" }),
  };
};

// A link opens in the browser, never in this page.
const Link = ({ href, children }: { href?: string; children?: ReactNode }) => (
  <a href={href} onClick={(e) => (e.preventDefault(), href && /^https?:/.test(href) && openLink(href))}>{children}</a>
);

function Draw({ n }: { n: Node }): ReactNode {
  if (typeof n === "string") return n;
  const p = (n.props ?? {}) as Record<string, any>;
  const kids = n.children?.map((c, i) => <Draw key={i} n={c} />);
  switch (n.type) {
    case "Box":
      return <div style={boxStyle(p)}>{kids}</div>;
    case "Text":
      return <span style={textStyle(p)}>{kids}</span>;
    case "Button":
      return <span className="mod-button">{kids ?? p.label}</span>;
    case "Link":
      return <Link href={p.href}>{kids ?? p.label ?? p.href}</Link>;
    case "Code":
      return <pre className="mod-code">{p.source}</pre>;
    case "Markdown":
      return (
        <div className="mod-markdown" style={{ opacity: p.dimColor ? 0.6 : undefined }}>
          <Markdown remarkPlugins={[remarkGfm]} components={{ a: (q) => <Link href={q.href}>{q.children}</Link> }}>{p.text}</Markdown>
        </div>
      );
    // An img never runs the scripts of an SVG.
    case "Svg":
      return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.source)}`} alt={p.alt} width={p.width} height={p.height} />;
    case "Image":
      return typeof p.source?.png === "string" ? <img src={`data:image/png;base64,${p.source.png}`} alt={p.alt} /> : <span>{p.alt}</span>;
    // `engine`, and the parts that only a terminal or a desktop draws (Raster, Input, Select, Client).
    default:
      return null;
  }
}

// The panes, beside the chat on the Mac and over the band on the phone.
export function ModPanes({ mods, className }: { mods: Mods; className: string }) {
  if (!mods.panes?.length) return null;
  return (
    <aside className={`mods mod-panes ${className}`}>
      {mods.panes.map((p) => (
        <section key={p.id} className="mod">
          <h3>{p.title}</h3>
          <Draw n={p.tree} />
        </section>
      ))}
    </aside>
  );
}

// The band, over the message box.
export const ModBand = ({ mods }: { mods: Mods }) =>
  drawn(mods.band) ? (
    <div className="mods mod mod-band">
      <Draw n={mods.band!} />
    </div>
  ) : null;

// The status lines and the toasts, under the message box. A toast shows for its time from when the app first gets it,
// because the app asks for the mods only each 5 seconds.
export function ModLines({ mods }: { mods: Mods }) {
  const seen = useRef(new Map<string, number>());
  const [now, setNow] = useState(Date.now);
  for (const t of mods.toasts ?? []) if (!seen.current.has(t.id)) seen.current.set(t.id, Date.now());
  const toasts = (mods.toasts ?? []).filter((t) => seen.current.get(t.id)! + t.ms > now);
  const next = Math.min(...toasts.map((t) => seen.current.get(t.id)! + t.ms));
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setNow(Date.now()), next - Date.now());
    return () => clearTimeout(timer);
  }, [next, toasts.length]);
  if (!mods.status?.length && !toasts.length) return null;
  return (
    <div className="mods mod-lines">
      {mods.status?.map((s, i) => (
        <p key={i} className="mod-status">
          {s}
        </p>
      ))}
      {toasts.map((t) => (
        <p key={t.id} className="mod-toast">
          {t.text}
        </p>
      ))}
    </div>
  );
}
