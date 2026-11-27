// The update server of Yonder at https://updates.yonder.so: GET /<channel>/<platform>?id=<install ID>&v=<version>.
// The Mac gets the JSON of the Tauri updater (the shape of latest.json, with "rollback" in notes), and Linux, Windows
// and Android get the version as text (pick.ts). 404: no such channel or platform, so the client asks the static file
// of download.yonder.so. 204: no update. The state and the Mac signatures are in the bucket of download.yonder.so.
// Deploy it with `bun run deploy-updates`. See "Update server" in docs/wiki/install.md.
import { pick, text, type State } from "./pick";

type Bucket = { get(key: string): Promise<{ json<T>(): Promise<T> } | null> };
// The phone asks from the origin of its web view, and nothing may come from a cache.
const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" };

export default {
  async fetch(req: Request, env: { BUCKET: Bucket }) {
    if (req.method === "OPTIONS") return new Response(null, { headers });
    const url = new URL(req.url);
    const [, channel = "", platform = ""] = url.pathname.split("/");
    const state = (await (await env.BUCKET.get("updates/state.json"))?.json<State>()) ?? {};
    const feed = state[channel]?.[platform as keyof State[string]];
    if (!feed) return new Response("No such feed.\n", { status: 404, headers });
    const chosen = pick(feed, url.searchParams.get("id"), url.searchParams.get("v"));
    if (!chosen) return new Response(null, { status: 204, headers });
    if (platform !== "mac") return new Response(text(chosen), { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
    const release = await (await env.BUCKET.get(`updates/mac/${chosen.version}.json`))?.json<{ signature: string; pub_date: string }>();
    if (!release) return new Response("No signature for this version.\n", { status: 404, headers });
    // The one Universal archive is the update for both chips, as in src-tauri/release.ts.
    const update = { signature: release.signature, url: `https://download.yonder.so/Yonder-${chosen.version}.app.tar.gz` };
    const notes = chosen.rollback ? "rollback" : undefined;
    return Response.json({ version: chosen.version, notes, pub_date: release.pub_date, platforms: { "darwin-aarch64": update, "darwin-x86_64": update } }, { headers });
  },
};
