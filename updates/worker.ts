// The update server of Yonder at https://updates.yonder.so: GET /<channel>/<platform>?id=<install ID>&v=<version>.
// The Mac gets the JSON of the Tauri updater (the shape of latest.json, with "rollback" in notes), and Linux, Windows
// and Android get the version as text (pick.ts). 404: no such channel or platform, so the client asks the static file
// of download.yonder.so. 204: no update. The state and the Mac signatures are in the R2 bucket "yonder-downloads".
// The same worker answers download.yonder.so (downloads): it sends each file to its GitHub release, and makes
// latest.json and latest-<platform>.txt from the state. A file of a version before FIRST comes from the bucket.
// Deploy it with `bun run deploy-updates`. See "Update server" in docs/wiki/install.md.
import CHANNEL from "../channel.json";
import { newer, pick, text, type Platform, type State } from "./pick";

type Bucket = { get(key: string): Promise<{ json<T>(): Promise<T> } | null> };
type Env = { BUCKET: Bucket };
// The first version with a GitHub release (github-release.ts). The files of older versions are only in the bucket.
export const FIRST = "2.143.1324";
const GITHUB = "https://github.com/heyyonder/yonder/releases/download";
const onGitHub = (version: string) => !newer(FIRST, version);
// The link of a file of a version: its GitHub release, or the bucket behind download.yonder.so for an older version.
export const link = (version: string, name: string) => (onGitHub(version) ? `${GITHUB}/v${version}/${name}` : `https://download.yonder.so/${name}`);
// The phone asks from the origin of its web view, and nothing may come from a cache.
const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" };

const readState = async (env: Env) => (await (await env.BUCKET.get("updates/state.json"))?.json<State>()) ?? {};

// The JSON of the Tauri updater for one Mac version, or undefined when the server has no signature of it.
async function macFeed(env: Env, version: string, notes?: string) {
  const release = await (await env.BUCKET.get(`updates/mac/${version}.json`))?.json<{ signature: string; pub_date: string }>();
  if (!release) return;
  // The one Universal archive is the update for both chips, as in src-tauri/release.ts.
  const update = { signature: release.signature, url: link(version, `Yonder-${version}.app.tar.gz`) };
  return Response.json({ version, notes, pub_date: release.pub_date, platforms: { "darwin-aarch64": update, "darwin-x86_64": update } }, { headers });
}

// download.yonder.so: the names that the site, the installers and the old copies use. A name without a version means the
// newest version of the staging channel of its platform, as when each release wrote these files to the bucket.
export function resolve(name: string, state: State): { version: string; asset: string } | { text: string } | { mac: string } | undefined {
  const newest = (p: Platform) => state[CHANNEL.channel]?.[p]?.version;
  const txt = name.match(/^latest-(linux|windows|android|mac)\.txt$/);
  if (txt) {
    const v = newest(txt[1] as Platform);
    return v ? { text: `${v}\n` } : undefined;
  }
  if (name === "latest.json") {
    const v = newest("mac");
    return v ? { mac: v } : undefined;
  }
  const script = ({ "install.sh": "linux", "omarchy.sh": "linux", "install.ps1": "windows" } as Record<string, Platform>)[name];
  if (script) {
    const v = newest(script);
    return v ? { version: v, asset: name === "omarchy.sh" ? "install.sh" : name } : undefined;
  }
  const m = name.match(/^(Yonder|yonder-linux-(?:x64|arm64)|yonder-windows-x64)(?:-(\d+\.\d+\.\d+))?(\.dmg|\.app\.tar\.gz|\.apk|\.tar\.gz|\.zip)$/);
  if (!m) return;
  const [, stem, versioned, ext] = m;
  const platform: Platform = ext === ".apk" ? "android" : stem.startsWith("yonder-linux") ? "linux" : stem.startsWith("yonder-windows") ? "windows" : "mac";
  const version = versioned ?? newest(platform);
  return version ? { version, asset: `${stem}-${version}${ext}` } : undefined;
}

async function downloads(req: Request, env: Env) {
  const url = new URL(req.url);
  const name = decodeURIComponent(url.pathname.slice(1));
  const found = resolve(name, await readState(env));
  if (found && "text" in found) return new Response(found.text, { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
  if (found && "mac" in found) return (await macFeed(env, found.mac)) ?? fetch(req);
  if (found && onGitHub(found.version)) return new Response(null, { status: 302, headers: { ...headers, location: `${GITHUB}/v${found.version}/${found.asset}` } });
  // Not a file of a release, or a version from before FIRST: the bucket, through its own custom domain. The fetch
  // from this worker skips its routes, so it reaches the bucket.
  if (found && found.asset.includes(found.version)) url.pathname = `/${found.asset}`;
  return fetch(new Request(url, req));
}

export default {
  async fetch(req: Request, env: Env) {
    if (req.method === "OPTIONS") return new Response(null, { headers });
    const url = new URL(req.url);
    if (url.hostname === "download.yonder.so") return downloads(req, env);
    const [, channel = "", platform = ""] = url.pathname.split("/");
    const state = await readState(env);
    const feed = state[channel]?.[platform as keyof State[string]];
    if (!feed) return new Response("No such feed.\n", { status: 404, headers });
    const chosen = pick(feed, url.searchParams.get("id"), url.searchParams.get("v"));
    if (!chosen) return new Response(null, { status: 204, headers });
    if (platform !== "mac") return new Response(text(chosen), { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
    return (await macFeed(env, chosen.version, chosen.rollback ? "rollback" : undefined)) ?? new Response("No signature for this version.\n", { status: 404, headers });
  },
};
