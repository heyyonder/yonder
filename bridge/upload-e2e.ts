// The end-to-end check of create_upload through the real relay: `bun bridge/upload-e2e.ts [FILE]`. It needs the network
// (mcp.yonder.so), openssl and curl, so GitHub does not run it. It uses no credits: a test bridge with a fake agent 7
// and a fake `claude` on the PATH, and its own relay identity. It runs the command of create_upload, as the code tool of
// the Claude app does, with FILE (a video of 3 seconds when it is left out), and checks the file on the Mac, its
// keyframes, and the message to agent 7.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const WT = resolve(import.meta.dir, "..");
const TMP = mkdtempSync(join(tmpdir(), "yonder-upload-e2e-"));
const free = () => {
  const s = Bun.serve({ port: 0, fetch: () => new Response() });
  const p = s.port;
  s.stop(true);
  return p;
};
const assert = (ok: unknown, what: string) => {
  if (!ok) throw new Error(`FAIL: ${what}`);
  console.log(`ok: ${what}`);
};
const PORT = free();
const HOME = join(TMP, "home");
const CONFIG = join(HOME, ".config", `yonder-${PORT}`);
mkdirSync(CONFIG, { recursive: true });
writeFileSync(join(CONFIG, "config.json"), JSON.stringify({ sumUp: false, textUp: false }));
writeFileSync(join(CONFIG, "state.json"), JSON.stringify({
  workers: [{ id: "abc123", num: 7, sessionId: "00000000-0000-4000-8000-000000000007", name: "Edit the video", project: "test", path: TMP, task: "Test", status: "done", activity: "", result: "", unread: false, startedAt: Date.now(), updatedAt: Date.now() }],
}));
// A fake claude: it lists no sessions, starts each turn of agent 7 at once, and writes each call to claude.log.
const BIN = join(TMP, "bin");
mkdirSync(BIN);
writeFileSync(join(BIN, "claude"), `#!/bin/sh\necho "$@" >> ${join(TMP, "claude.log")}\nif [ "$1" = agents ]; then echo '[]'; else echo 'backgrounded · 00000000'; fi\n`);
chmodSync(join(BIN, "claude"), 0o755);
let file = process.argv[2];
if (!file) {
  file = join(TMP, "clip.mov");
  Bun.spawnSync(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=3", "-f", "lavfi", "-i", "sine=duration=3", "-shortest", "-c:v", "libx264", "-c:a", "aac", file]);
}
const MARK = crypto.randomUUID();
process.env.YONDER_RELAY_MARK = MARK; // Before relay.ts loads.
process.env.YONDER_PORT = String(PORT); // relay.ts takes the mark only with a test port.
const bridge = Bun.spawn(["bun", join(WT, "bridge/main.ts")], {
  env: { ...process.env, HOME, PATH: `${BIN}:${process.env.PATH}`, YONDER_PORT: String(PORT), YONDER_RELAY_MARK: MARK },
  stdout: "ignore",
  stderr: Bun.file(join(TMP, "bridge.log")),
});
try {
  for (let i = 0; i < 100 && !(await fetch(`http://127.0.0.1:${PORT}/mcp`).then(() => true, () => false)); i++) await Bun.sleep(200);
  // The relay of the test bridge, in this process. A request of the connector goes to the local route of the bridge.
  const { connectRelay } = await import(join(WT, "bridge/relay.ts"));
  const relay = connectRelay("wss://relay.yonder.so", CONFIG, process.env.APNS_TEAM_ID ?? "", (req: Request) => fetch(req), {}, (req: Request, id: string) => {
    const u = new URL(req.url);
    return fetch(new Request(`http://127.0.0.1:${PORT}${u.pathname.slice(id.length + 1)}${u.search}`, req));
  });
  for (let i = 0; i < 50 && !relay.status().connected; i++) await Bun.sleep(200);
  const { connector } = relay.status();
  assert(connector, "the test bridge has its connector on the relay");

  const client = new Client({ name: "claude-app", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`)));
  const made = await client.callTool({ name: "create_upload", arguments: { worker: "7", message: "Cut the first 5 seconds." } });
  const answer = JSON.parse((made.content as { text: string }[])[0].text);
  const token = /\/upload\/([\w-]+)\/send\.sh/.exec(answer.command)?.[1];
  assert(token && answer.then.includes("agent 7"), `create_upload gives a command: ${answer.command}`);
  const url = `https://mcp.yonder.so/${connector}/upload/${token}`;

  // As the code tool of the Claude app: the first run shows the progress for only 2 seconds and ends, the sender then
  // stops (as when the sandbox ends it), and the same command runs again until it prints the result.
  const started = Date.now();
  const command = (wait = "") => Bun.spawn(["bash", "-c", `curl -fsS ${url}/send.sh | ${wait} bash -s -- '${file}'`], { stdout: "pipe", stderr: "pipe" });
  const output = async (run: ReturnType<typeof command>) => {
    const [code, out, err] = await Promise.all([run.exited, new Response(run.stdout).text(), new Response(run.stderr).text()]);
    console.log(`run (exit ${code}):\n${out.trim()}${err.trim() ? `\n${err.trim()}` : ""}`);
    return out.trim();
  };
  let out = await output(command("YONDER_WAIT=2"));
  if (!out.endsWith("}")) {
    Bun.spawnSync(["pkill", "-f", `yonder-upload-${token}/send.sh`]);
    for (let i = 0; i < 10 && !out.endsWith("}"); i++) out = await output(command());
  }
  const seconds = (Date.now() - started) / 1000;
  const size = Bun.file(file).size;
  assert(out.endsWith("}"), "the same command, run again, ends with the result");
  const result = JSON.parse(out.trim().split("\n").at(-1)!);
  console.log(`${(size / 1e6).toFixed(0)} MB in ${seconds.toFixed(1)} s (${(size / 1e6 / seconds).toFixed(1)} MB/s):`, result);
  const sent = join(result.path, readFileSync(join(result.path, "timeline.md"), "utf8").match(/The video is (video\.\w+)/)![1]);
  const sha = (p: string) => new Bun.CryptoHasher("sha256").update(readFileSync(p)).digest("hex");
  assert(sha(sent) === sha(file), "the file on the Mac is the same as the source");
  assert(result.frames > 0 && existsSync(join(result.path, "frames", "01.jpg")) && result.agent === 7, `the video has ${result.frames} keyframes and goes to agent 7`);
  assert(readFileSync(join(TMP, "claude.log"), "utf8").includes(result.path) || readFileSync(join(CONFIG, "state.json"), "utf8").includes(result.path), "the message to agent 7 names the folder of the video");
  const again = await fetch(url, { method: "PUT", body: "" });
  assert((await again.json()).path === result.path, "the link is used: a second upload gets the result");
  await client.close();
  relay.stop?.("test done");
  console.log("ALL OK");
} finally {
  bridge.kill();
  rmSync(HOME, { recursive: true, force: true });
}
