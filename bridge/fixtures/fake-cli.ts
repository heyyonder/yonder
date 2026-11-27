// A fake CLI for bridge/clis-check.ts. It answers --version and the sign-in check as the real CLI does, and plays the
// recorded turn of fixtures/<cli>.jsonl, so that the check runs the bridge end to end with no credits. Each turn adds
// its pid and its arguments to $FAKE_LOG. A prompt with SLOW plays its lines slowly, for the stop and the restart.
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [cli, ...args] = process.argv.slice(2);
const turn = cli === "codex" ? args[0] === "exec" : args.includes("-p");
if (args[0] === "--version") console.log({ codex: "codex-cli 0.160.1", "cursor-agent": "2026.10.01-e373342", hermes: "Hermes Agent v0.23.2 (2026.9.24)" }[cli] ?? "1.0.0");
// The run of one prompt of Hermes, for the title of a new agent: it prints a title in quotes, as a model can.
else if (cli === "hermes" && args[0] === "-z") {
  appendFileSync(process.env.FAKE_LOG!, JSON.stringify({ cli, args }) + "\n");
  console.log('"Fix Hermes Title"');
}
else if (cli === "codex" && args.join(" ") === "login status") console.error("Logged in using ChatGPT");
else if (cli === "codex" && args[0] === "mcp") process.exit(1);
else if (cli === "codex" && args[0] === "debug") console.log(JSON.stringify({ models: [{ slug: "gpt-5.5", visibility: "list", priority: 1 }] }));
else if (cli === "cursor-agent" && args[0] === "status") console.log("Logged in as someone@example.com");
// The sign-ins from the phone (bridge/logins.ts), as the real CLIs print them. Each one ends after 1.5 seconds, as if the
// user signed in on the page.
else if (cli === "codex" && args.join(" ") === "login --device-auth") {
  console.log("1. Open this link in your browser and sign in to your account\n   https://auth.openai.com/codex/device\n\n2. Enter this one-time code (expires in 15 minutes)\n   ABCD-12345\n");
  await Bun.sleep(1500);
} else if (cli === "cursor-agent" && args[0] === "login") {
  console.log(" Waiting for browser authentication...\n If your browser didn't open, use this link:\n https://cursor.com/loginDeepControl?challenge=abc&uuid=def&mode=login&redirectTarget=cli\n");
  await Bun.sleep(1500);
}
else if (turn) {
  appendFileSync(process.env.FAKE_LOG!, JSON.stringify({ pid: process.pid, cli, args }) + "\n");
  // A CLI that fails at once, as one that lost its sign-in does.
  if (cli === "cursor-agent") {
    console.error("Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.");
    process.exit(1);
  }
  const prompt = args.at(-1) ?? "";
  const at = args.indexOf("resume");
  const id = at >= 0 ? args[at + 1] : "019a1b2c-3d4e-7f00-8a00-000000000001";
  for (const line of readFileSync(join(import.meta.dir, `${cli}.jsonl`), "utf8").trim().split("\n")) {
    console.log(line.replaceAll("THREAD", id));
    await Bun.sleep(prompt.includes("SLOW") ? 1500 : 30);
  }
}
