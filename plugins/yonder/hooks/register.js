// @ts-check
// The hooks module of Yonder's own mod for Claude Code (plugins/yonder/, which bridge/mod.ts writes at each start).
// Each worker loads it with --plugin-dir. A worker runs in a terminal that no one sees, and Claude Code draws the mods
// there: the band above the prompt, each open pane, each status line and each toast. This mod keeps the last drawing of
// each, as Claude Code drew it, and posts them to the bridge (POST /mods) when they change, and at least every 30
// seconds, so a bridge that restarted has them again. The app shows them in the conversation view of the agent. The mod
// draws nothing itself: each hook gives on what the other mods drew.
// It is JavaScript with the types of Claude Code in comments, because the bridge imports it as text, and tsc of the
// bridge does not know the module `claude-code`. A plugin cannot draw the mods of others itself: `$` has no ui.render.

// YONDER_BRIDGE: the address of the bridge that started this worker (`env` in bridge/main.ts), because its port is not
// always 7787. A worker from before it has none.
const BRIDGE = `${globalThis.process?.env?.YONDER_BRIDGE || "http://127.0.0.1:7787"}/mods`;
// YONDER_TOKEN: the token of that bridge, so a post needs no check of the user (bridge/peer.ts).
const TOKEN = globalThis.process?.env?.YONDER_TOKEN || "";
const AGAIN = 30_000;

/** @type {import("claude-code").RenderElement | undefined} */
let band;
/** @type {Map<string, { id: string; title: string; tree: import("claude-code").RenderElement }>} */
const panes = new Map();
/** @type {Record<string, string>} The status line of each mod, by the name of its plugin, as the terminal shows it: "demo: text". */
const statuses = {};
/** @type {{ id: string; text: string; ms: number; at: number }[]} The toasts of the last 15 seconds, the oldest first. */
let toasts = [];
let last = "";
let lastAt = 0;
/** @type {{ cancel(): void } | undefined} */
let soon;

/** @param {import("claude-code").EngineInterface} $ */
async function post($) {
  soon = undefined;
  try {
    const body = JSON.stringify({ session: await $.session.id(), band, panes: [...panes.values()], status: Object.values(statuses), toasts });
    if (body === last && Date.now() - lastAt < AGAIN) return;
    const r = await $.http.fetch(BRIDGE, { method: "POST", headers: { "content-type": "application/json", "x-yonder-token": TOKEN }, body });
    [last, lastAt] = r.ok ? [body, Date.now()] : ["", 0];
  } catch {
    // A bridge that is down gets the drawing at the next post. A worker never stops for it.
    last = "";
  }
}

// A redraw can come many times in a second, so the post waits half a second for the last one.
/** @param {import("claude-code").EngineInterface} $ */
const changed = ($) => void (soon ??= $.clock.after(500, () => void post($)));

/** @type {import("claude-code").Register} */
export const register = (on) => {
  on("session.start", async ($, e, next) => {
    const started = await next(e);
    $.clock.every(AGAIN, () => void post($));
    return started;
  });
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const tree = await next(e);
    if (e.surface === "terminal") (band = tree), changed($);
    return tree;
  });
  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    const tree = await next(e);
    if (e.surface === "terminal") panes.set(e.requestId, { id: e.requestId, title: e.props.title, tree }), changed($);
    return tree;
  });
  // $.ui.panes() lists only the panes of this plugin, so a close of another pane comes from here. A pane that a hook
  // keeps open comes back at its next drawing.
  on("ui.close", async ($, e, next) => {
    const closed = await next(e);
    panes.delete(e.id), changed($);
    return closed;
  });
  on("ui.status", ($, e, next) => {
    const plugin = next.origin.plugin;
    if (e.text === undefined) delete statuses[plugin];
    else statuses[plugin] = `${plugin}: ${e.text}`;
    changed($);
    return next(e);
  });
  on("ui.toast", ($, e, next) => {
    const at = Date.now();
    toasts = [...toasts.filter((t) => at - t.at < 15_000), { id: `${at}-${toasts.length}`, text: `${next.origin.plugin}: ${e.text}`, ms: e.timeoutMs ?? 4000, at }];
    changed($);
    return next(e);
  });
};
