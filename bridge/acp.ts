// The bridge side of the ACP host (acp-host.ts): it starts the host when it does not answer, and sends it the turns of
// the agents in an ACP CLI. The host runs detached, so its agents keep running when the bridge or the app restarts.
// A host of an older version takes the place of nothing until its turns end: then the bridge starts the new one.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type AcpTurn = {
  command: string[];
  env: Record<string, string>;
  cwd: string;
  session?: string;
  prompt: string;
  mode?: string;
  model?: string;
  effort?: string;
  mcp: { name: string; url: string }[];
  http?: boolean;
  base: string;
  permission: "allow" | "reject";
};

// `config` is the folder of the bridge, so a check bridge on another port gets its own host. `source` is false in the
// compiled bridge of a downloaded app, which starts the host as itself with --acp-host (entry.ts).
export function acpHost(config: string, source: boolean, env: Record<string, string | undefined>) {
  // macOS takes a socket path of at most 104 bytes, so a long folder, such as the temporary home of a check, gets a
  // socket in /tmp. shortcut: macOS deletes files in /tmp after 3 days, so a host there lives only for a check.
  const socket = join(config, "acp.sock").length < 100 ? join(config, "acp.sock") : join("/tmp", `yonder-acp-${createHash("sha1").update(config).digest("hex").slice(0, 10)}.sock`);
  const file = join(import.meta.dir, "acp-host.ts");
  const version = source && existsSync(file) ? createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 12) : process.execPath;
  const call = async (path: string, body?: unknown) => {
    const res = await fetch(`http://acp${path}`, { unix: socket, method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `The ACP host gave ${res.status}.`);
    return data;
  };
  const health = (): Promise<{ pid: number; version: string; busy: number } | undefined> => call("/health").catch(() => undefined);

  let starting: Promise<number> | undefined;
  // The pid of a host of this version, which this call starts when none answers.
  async function ensure(): Promise<number> {
    const h = await health();
    if (h && (h.version === version || h.busy)) return h.pid;
    if (h) await call("/quit", {}).catch(() => {});
    for (let i = 0; i < 20 && (await health()); i++) await Bun.sleep(100);
    const argv = source ? [process.execPath, file] : [process.execPath, "--acp-host"];
    const out = Bun.file(join(config, "acp-host.log"));
    Bun.spawn(argv, { env: { ...env, YONDER_ACP_SOCKET: socket, YONDER_ACP_VERSION: version }, detached: true, stdin: "ignore", stdout: out, stderr: out }).unref();
    for (let i = 0; i < 50; i++) {
      const up = await health();
      if (up) return up.pid;
      await Bun.sleep(100);
    }
    throw new Error("The ACP host did not start. Its log is acp-host.log in the folder of Yonder.");
  }

  return {
    // Starts a turn, and gives the session and the pid of the host, after the CLI opened its session.
    async turn(t: AcpTurn): Promise<{ session: string; pid: number }> {
      await (starting ??= ensure().finally(() => (starting = undefined)));
      return call("/turn", t);
    },
    cancel: (session: string) => call("/cancel", { session }).catch(() => {}),
    close: (session: string) => call("/close", { session }).catch(() => {}),
  };
}
