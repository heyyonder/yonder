// Puts Yonder Preview on a Cloudflare Tunnel: `bun run setup-tunnel [--domain yonder.so] --name <name>`.
// With `cloudflared`, it makes the tunnel yonder-<name>, and sends each name of *.<domain> that has no DNS record of its
// own through it. Then it writes tunnel.json with the token of the tunnel. Restart the bridge after it: the bridge runs
// cloudflared with that token, to the HTTP server of bridge/preview.ts. Each step does nothing when it is done already.
// Run `cloudflared tunnel login` one time before, for the permission to make tunnels in the account of the domain.
// A preview is https://<label>-<name>.<domain>, one level, so the free certificate of Cloudflare covers it.
import { chmodSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TUNNEL_PORT } from "./preview";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const domain = flag("domain", "yonder.so");
const name = flag("name", "");
if (!name) throw new Error("Give the name of this Mac in the addresses: bun run setup-tunnel --name <name>");
const tunnel = `yonder-${name}`;

function cloudflared(...words: string[]) {
  const p = Bun.spawnSync(["cloudflared", "tunnel", ...words], { stderr: "pipe" });
  if (!p.success) throw new Error(`cloudflared tunnel ${words.join(" ")} failed: ${p.stderr.toString().trim()}`);
  return p.stdout.toString();
}

// The list is `null` when no tunnel has the name.
if (!(JSON.parse(cloudflared("list", "--name", tunnel, "--output", "json") || "null") ?? []).length) cloudflared("create", tunnel);
// No --overwrite-dns: a wildcard of another tunnel stops the script, so a second computer cannot take the previews.
cloudflared("route", "dns", tunnel, `*.${domain}`);
// The token takes each name of the tunnel, so it goes only into this file, never to the screen.
const token = cloudflared("token", tunnel).trim();
const file = join(homedir(), ".config/yonder/tunnel.json");
writeFileSync(file, JSON.stringify({ token, domain, name, port: TUNNEL_PORT }, null, 2));
chmodSync(file, 0o600);
console.log(`Wrote ${file}. Restart the bridge to open previews at https://<project>-${name}.${domain}.`);
