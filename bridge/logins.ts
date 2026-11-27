// The install and the sign-in of each CLI with no terminal, so that the user does both from the phone. Else an expired
// Claude Code login needs a terminal on the Mac. While Claude Code is
// signed out, no agent can fix it either, so the bridge itself runs the sign-in of the CLI. It runs in a
// pseudo-terminal, as in a terminal tab, and with no browser on this computer. The bridge reads the link and the
// one-time code from the output, and the phone shows them. A device sign-in (Codex, Grok, Cursor, Copilot) needs
// no code back: the CLI waits until the user approves on the page. Claude Code has no device sign-in, so its page shows
// a code that the user pastes back, and `answer` types it into the CLI.
// A sign-in is good when the CLI exits with 0 and a new check finds it signed in. The exit code alone is not enough:
// Codex exits with 0 also when it is stopped. The check alone is not enough: `claude auth status` says "signed in" also
// for an expired token.
// Yonder never reads, keeps or logs a token. Each CLI saves its own login where it always does. The output of a sign-in
// stays in memory and never goes to the phone, because the terminal echoes the pasted code into it.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { DIRS } from "./clis";

// One install or sign-in, as the phone shows it. `signed-out` is a CLI that an agent found signed out, before the user
// starts its sign-in. `code` is the one-time code of a device sign-in, which the user types on the page of the link,
// so it is meant to show. `paste`: the page shows a code that the user pastes back into the card.
export type Login = { id: string; name: string; step: "install" | "login" | "signed-out"; url?: string; code?: string; paste?: boolean; error?: string };
// How a CLI signs in with no terminal: its arguments, and the patterns of the link and of the one-time code in its output.
// `help` replaces an error that the user can fix with the words of the fix.
export type SignIn = { args: string[]; url: RegExp; code?: RegExp; paste?: boolean; help?: [RegExp, string] };
type Env = Record<string, string | undefined>;

const WINDOWS = process.platform === "win32";
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\r/g;
// An `open` and an `xdg-open` that do nothing, first on the PATH of a sign-in. Cursor runs `open <link>` on macOS, also
// with BROWSER set, and the link then opened in the browser of this computer, not on the phone.
const NO_BROWSER = join(tmpdir(), "yonder-no-browser");
function noBrowser() {
  mkdirSync(NO_BROWSER, { recursive: true });
  for (const name of ["open", "xdg-open"]) {
    writeFileSync(join(NO_BROWSER, name), "#!/bin/sh\nexit 0\n");
    chmodSync(join(NO_BROWSER, name), 0o755);
  }
}

type Run = { login: Login; proc?: Bun.Subprocess; write?: (text: string) => void; text: string };
const runs = new Map<string, Run>();
export const logins = () => [...runs.values()].map((r) => r.login);
export const loginOf = (id: string) => runs.get(id)?.login;
const lastLine = (text: string) => text.replace(ANSI, "").trim().split("\n").at(-1)?.trim().slice(0, 200);

export function stopLogin(id: string) {
  runs.get(id)?.proc?.kill();
  runs.delete(id);
}
process.on("exit", () => runs.forEach((r) => r.proc?.kill()));

// Shows the card of a CLI that an agent found signed out, with a Sign in button. A device code is good for some minutes
// only, so its sign-in starts at the tap, not before.
export function signedOut(id: string, name: string) {
  if (!runs.has(id)) runs.set(id, { login: { id, name, step: "signed-out" }, text: "" });
}

// Starts the sign-in of a CLI, or starts it again. `check` tells if the CLI is signed in now. On macOS and Linux the
// CLI gets a pseudo-terminal, as in a terminal tab, because some CLIs draw their sign-in only there. It is wide, so that
// the terminal does not break a long link into lines. Windows gets pipes.
export function signIn(id: string, name: string, bin: string, how: SignIn, env: Env, check: () => Promise<boolean>, error?: string) {
  stopLogin(id);
  noBrowser();
  const run: Run = { login: { id, name, step: "login", paste: how.paste, error }, text: "" };
  runs.set(id, run);
  const decoder = new TextDecoder();
  const take = (bytes: Uint8Array) => {
    if (runs.get(id) !== run) return;
    run.text += decoder.decode(bytes, { stream: true });
    const plain = run.text.replace(ANSI, "");
    run.login.url ??= plain.match(how.url)?.[1];
    if (how.code) run.login.code ??= plain.match(how.code)?.[1];
  };
  const full = { ...env, PATH: `${NO_BROWSER}${delimiter}${env.PATH ?? ""}`, BROWSER: join(NO_BROWSER, "open"), NO_COLOR: "1" };
  if (WINDOWS) {
    const proc = Bun.spawn([bin, ...how.args], { env: full, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    void (async () => { for await (const c of proc.stdout) take(c); })();
    void (async () => { for await (const c of proc.stderr) take(c); })();
    Object.assign(run, { proc, write: (text: string) => (proc.stdin.write(`${text}\n`), proc.stdin.flush()) });
  } else {
    const proc = Bun.spawn([bin, ...how.args], { env: full, terminal: { cols: 2000, rows: 50, data: (_t, d) => take(d) } });
    Object.assign(run, { proc, write: (text: string) => proc.terminal!.write(`${text}\r`) });
  }
  void run.proc!.exited.then(async (code) => {
    if (runs.get(id) !== run) return;
    run.proc = undefined;
    // Both: `claude auth status` says "signed in" also for an expired token, so a sign-in that fails must not count.
    if (!code && (await check().catch(() => false))) return void (runs.get(id) === run && runs.delete(id));
    if (runs.get(id) !== run) return;
    // A pasted code fits only the sign-in that printed its link, so a failed code starts a new sign-in with a new link.
    if (how.paste && run.login.url) return signIn(id, name, bin, how, env, check, "The sign-in failed. Open the link again, and paste the new code.");
    // With no link, nothing was pasted, so the last line holds no code.
    const error = lastLine(run.text) || `The sign-in stopped with code ${code}.`;
    run.login = { id, name, step: "login", error: how.help?.[0].test(run.text.replace(ANSI, "")) ? how.help[1] : error };
  });
}

// Types the code of the page into the sign-in of Claude Code, and waits until the sign-in ends or says that the code is
// wrong. A code with no "#" gets "Invalid code", and the sign-in waits for another one.
export async function answer(id: string, code: string) {
  const run = runs.get(id);
  if (!run?.proc || !run.write) throw new Error("No sign-in waits for a code. Start the sign-in again.");
  const before = run.text.length;
  run.write(code.trim());
  const invalid = () => /Invalid code/i.test(run.text.slice(before).replace(ANSI, ""));
  for (let i = 0; i < 600 && runs.get(id) === run && run.proc && !invalid(); i++) await Bun.sleep(100);
  if (runs.get(id) === run && run.proc && invalid()) run.login.error = "This is not the whole code. Copy all of it, and paste it again.";
  // A failed code starts a new sign-in, which prints its link in about a second.
  for (let i = 0; i < 50 && runs.get(id) && !runs.get(id)!.login.url; i++) await Bun.sleep(100);
}

// Runs the install command of a CLI with no terminal, then `then`, which starts its sign-in when it needs one. The phone
// shows only that it runs. The PATH also has the folders of the installers, because npm can be only in nvm.
export function install(id: string, name: string, argv: string[], env: Env, then: () => unknown) {
  if (runs.get(id)?.login.step === "install" && runs.get(id)!.proc) return;
  stopLogin(id);
  const run: Run = { login: { id, name, step: "install" }, text: "" };
  runs.set(id, run);
  const proc = Bun.spawn(argv, { env: { ...env, PATH: [env.PATH, ...DIRS].filter(Boolean).join(delimiter) }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  run.proc = proc;
  void Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]).then(async ([out, err, code]) => {
    if (runs.get(id) !== run) return;
    run.proc = undefined;
    if (code) return void (run.login.error = lastLine(err || out) || `The install stopped with code ${code}.`);
    runs.delete(id);
    await then();
  });
}
