// The agents of the ACP registry (agentclientprotocol.com). The user can add any of them in the Agents tab, and it then
// runs Yonder agents in the ACP host, as Codex and OpenCode do. An agent comes as an npx package, a uvx package, or an
// archive for each platform, which the bridge downloads, checks with its sha256 and unpacks into
// <config>/agents/<id>/<version>.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { locate } from "./clis";

const URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
type Launch = { args?: string[]; env?: Record<string, string> };
export type Entry = {
  id: string;
  name: string;
  version: string;
  description: string;
  website?: string;
  distribution: {
    npx?: Launch & { package: string };
    uvx?: Launch & { package: string };
    binary?: Record<string, Launch & { archive: string; cmd: string; sha256?: string }>;
  };
};
// An agent that the user added: the command of its ACP server, and the command that opens it in a terminal, where the
// user signs in to it.
// `ready`: the agent opened a session once, so it is signed in.
export type Added = { id: string; name: string; version: string; command: string[]; login: string[]; env?: Record<string, string>; ready?: boolean };

// The registry agents that have a row of their own in clis.ts, by their ID in the registry. Claude Code has no ACP
// agent in Yonder: its adapter is built on the Agent SDK, which may not use the Claude plan of the user.
export const BUILT_IN: Record<string, string> = {
  "codex-acp": "codex",
  opencode: "opencode",
  cursor: "cursor",
  "grok-build": "grok",
  "github-copilot-cli": "copilot",
  "antigravity-acp": "antigravity",
  "claude-acp": "claude",
};

const PLATFORM = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch === "arm64" ? "aarch64" : "x86_64"}`;

let cache: { at: number; list: Entry[] } | undefined;
// The registry, at most an hour old. Without the network, the copy of the last fetch.
export async function registry(config: string): Promise<Entry[]> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.list;
  const file = join(config, "registry.json");
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`The ACP registry gave ${res.status}.`);
    const text = await res.text();
    writeFileSync(file, text);
    cache = { at: Date.now(), list: JSON.parse(text).agents };
  } catch (e) {
    if (!existsSync(file)) throw e;
    cache = { at: Date.now(), list: JSON.parse(readFileSync(file, "utf8")).agents };
  }
  return cache.list;
}

// Makes an agent of the registry ready to run, and gives its commands.
export async function install(entry: Entry, config: string): Promise<Added> {
  const d = entry.distribution;
  const added = (command: string[], login: string[], env?: Record<string, string>): Added => ({ id: entry.id, name: entry.name, version: entry.version, command, login, env });
  const binary = d.binary?.[PLATFORM];
  if (binary) {
    const dir = join(config, "agents", entry.id, entry.version);
    const cmd = join(dir, binary.cmd);
    if (!existsSync(cmd)) {
      const res = await fetch(binary.archive);
      if (!res.ok) throw new Error(`The download of ${entry.name} gave ${res.status}.`);
      const data = new Uint8Array(await res.arrayBuffer());
      if (binary.sha256 && createHash("sha256").update(data).digest("hex") !== binary.sha256) throw new Error(`The download of ${entry.name} does not match its checksum.`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const name = basename(new globalThis.URL(binary.archive).pathname);
      const archive = join(dir, name);
      writeFileSync(archive, data);
      // An archive unpacks into the folder. Anything else is the binary itself.
      const unpack = /\.zip$/.test(name) ? ["unzip", "-q", "-o", archive, "-d", dir] : /\.(tar(\.(gz|bz2|xz))?|tgz)$/.test(name) ? ["tar", "-xf", archive, "-C", dir] : undefined;
      if (unpack) {
        const p = Bun.spawnSync(unpack);
        if (p.exitCode) throw new Error(`Yonder cannot unpack ${name}: ${p.stderr.toString().trim()}`);
        rmSync(archive);
      } else writeFileSync(cmd, data);
      if (!existsSync(cmd)) throw new Error(`${entry.name} has no ${binary.cmd} in ${name}.`);
      chmodSync(cmd, 0o755);
    }
    return added([cmd, ...(binary.args ?? [])], [cmd], binary.env);
  }
  if (d.npx) {
    const npx = locate("npx");
    if (!npx) throw new Error(`${entry.name} needs Node.js (npx). Install Node.js, then add it again.`);
    return added([npx, "-y", d.npx.package, ...(d.npx.args ?? [])], [npx, "-y", d.npx.package], d.npx.env);
  }
  if (d.uvx) {
    const uvx = locate("uvx");
    if (!uvx) throw new Error(`${entry.name} needs uv (uvx). Install uv, then add it again.`);
    return added([uvx, d.uvx.package, ...(d.uvx.args ?? [])], [uvx, d.uvx.package], d.uvx.env);
  }
  throw new Error(`${entry.name} has no build for this computer (${PLATFORM}).`);
}
