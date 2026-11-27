// A link that starts a new task, from a site that the user trusts, such as a "Start in Yonder" button on its page:
// yonder://new?v=1&source=<id>&folder=<path>&name=<name>&prompt=<text>&ts=<unix seconds>&nonce=<32 hex>&sig=<hex>,
// each value encoded with encodeURIComponent. Any web page can open a yonder:// link, so a link is untrusted input. The
// bridge takes one only from a source of `trustedLinkSources` in config.json ([{ id, key, folder }]) that signs it: `sig`
// is the lowercase hex HMAC-SHA256 of message() with the UTF-8 bytes of the key (the key text, not decoded from hex).
// The time stamp is at most 10 minutes from now, the nonce is new, the folder is in the folder of the source after the
// symlinks and ".." are resolved, and the prompt has at most 16000 characters. Even then the task starts only after a
// yes on the sheet of the app, with Face ID or Touch ID (src/NewTask.tsx). The key never leaves this computer.
// Check this file with `bun bridge/link.ts`. `bun bridge/link.ts make <key file> <source> <folder> <name> <prompt>`
// prints a signed test link.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";

export type Source = { id: string; key: string; folder: string };
export type Link = { source: string; folder: string; name: string; prompt: string; ts: string; nonce: string; sig: string };
export const MAX_AGE = 600;
export const MAX_PROMPT = 16_000;
// A used nonce stays 30 minutes, longer than the 20 minutes in which a time stamp can be valid.
export const KEEP = 30 * 60_000;
const START = "yonder://new?";

export const message = (l: Omit<Link, "sig">) => `v1\n${l.source}\n${l.folder}\n${l.name}\n${l.ts}\n${l.nonce}\n${l.prompt}`;
export const sign = (key: string, l: Omit<Link, "sig">) => createHmac("sha256", Buffer.from(key, "utf8")).update(message(l), "utf8").digest("hex");
export const isLink = (url: unknown): url is string => typeof url === "string" && url.startsWith(START);

// The fields of a link. A field that comes twice, a missing field and a bad encoding make it fail.
export function parse(url: string): Link {
  if (!isLink(url)) throw new Error("not a yonder://new link");
  const got = new Map<string, string>();
  for (const pair of url.slice(START.length).split("&")) {
    const at = pair.indexOf("=");
    const key = at < 0 ? pair : pair.slice(0, at);
    if (got.has(key)) throw new Error(`${key} comes twice`);
    got.set(key, decodeURIComponent(at < 0 ? "" : pair.slice(at + 1)));
  }
  if (got.get("v") !== "1") throw new Error("not version 1");
  const [source, folder, name, prompt, ts, nonce, sig] = ["source", "folder", "name", "prompt", "ts", "nonce", "sig"].map((k) => got.get(k) ?? "");
  return { source, folder, name, prompt, ts, nonce, sig };
}

// The link when it is valid, with the real path of its folder. It fails with the reason when it is not. `used` has the
// used nonces, and `now` is the time of the check in ms.
export function check(url: string, sources: unknown, used: Record<string, number>, now = Date.now()): Link {
  const l = parse(url);
  const s = (Array.isArray(sources) ? sources : []).find((x): x is Source => x?.id === l.source && typeof x.key === "string" && typeof x.folder === "string");
  if (!l.source || !s) throw new Error(`unknown source ${JSON.stringify(l.source)}`);
  if (!/^[0-9a-f]{64}$/.test(l.sig) || !timingSafeEqual(Buffer.from(l.sig), Buffer.from(sign(s.key, l)))) throw new Error("bad signature");
  if (!/^\d{1,12}$/.test(l.ts) || Math.abs(now / 1000 - Number(l.ts)) > MAX_AGE) throw new Error("the time stamp is too old or in the future");
  if (!/^[0-9a-f]{32}$/.test(l.nonce) || Object.hasOwn(used, l.nonce)) throw new Error("the nonce is bad or used");
  if (!l.name.trim() || !l.prompt.trim() || l.prompt.length > MAX_PROMPT) throw new Error("no name, no prompt, or a prompt of more than 16000 characters");
  return { ...l, folder: inside(l.folder, s.folder) };
}

// The real path of `folder` when it is `root` or a folder in it, after the symlinks and "..".
function inside(folder: string, root: string) {
  if (!isAbsolute(folder) || !isAbsolute(root)) throw new Error("the folder is not an absolute path");
  let real: string;
  let base: string;
  try {
    [real, base] = [realpathSync.native(folder), realpathSync.native(root)];
  } catch {
    throw new Error("the folder does not exist");
  }
  const rel = relative(base, real);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("the folder is outside the folder of the source");
  if (!statSync(real).isDirectory()) throw new Error("the folder is a file");
  return real;
}

// Removes the nonces that are older than KEEP.
export const prune = (used: Record<string, number>, now = Date.now()) => {
  for (const [nonce, at] of Object.entries(used)) if (now - at > KEEP) delete used[nonce];
};

const e = encodeURIComponent;
// A signed link, for a test.
export function make(key: string, source: string, folder: string, name: string, prompt: string, now = Date.now()) {
  const l = { source, folder, name, prompt, ts: String(Math.floor(now / 1000)), nonce: randomBytes(16).toString("hex") };
  return `${START}v=1&source=${e(source)}&folder=${e(folder)}&name=${e(name)}&prompt=${e(prompt)}&ts=${l.ts}&nonce=${l.nonce}&sig=${sign(key, l)}`;
}

if (import.meta.main && process.argv[2] === "make") {
  const [file, source, folder, name, prompt] = process.argv.slice(3);
  if (!prompt) throw new Error("bun bridge/link.ts make <key file> <source> <folder> <name> <prompt>");
  console.log(make(readFileSync(file, "utf8").trim(), source, folder, name, prompt));
} else if (import.meta.main) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  const fails = (f: () => unknown, what: string) => {
    try {
      f();
    } catch {
      return console.log(`ok: ${what}`);
    }
    throw new Error(`FAIL: ${what}`);
  };
  // The key is the text of 64 hex characters. This signature comes from `openssl dgst -sha256 -hmac <key>`, so a key
  // that is decoded from hex fails here.
  const key = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
  const vector = { source: "a.b", folder: "/x", name: "N", prompt: "P", ts: "1", nonce: "0".repeat(32) };
  assert(sign(key, vector) === "061c103da37a7979ba6c9c720111cc07fcb14f7b6b58bca0ccc97de2e6b3fcbd", "the key is the UTF-8 text, the message has the fields in order");

  const dir = realpathSync(mkdtempSync(join(tmpdir(), "yonder-link-")));
  const root = join(dir, "projects");
  mkdirSync(join(root, "one"), { recursive: true });
  mkdirSync(join(dir, "projects-evil"));
  mkdirSync(join(dir, "outside"));
  symlinkSync(join(dir, "outside"), join(root, "away"));
  const sources = [{ id: "site.example", key, folder: root }];
  const used: Record<string, number> = {};
  const now = Date.now();
  const at = (folder: string, prompt = "Make a + b, then 100% 'done' ✓\nline two", t = now) => make(key, "site.example", folder, "A task", prompt, t);
  try {
    const ok = check(at(join(root, "one")), sources, used, now);
    assert(ok.folder === join(root, "one") && ok.prompt === "Make a + b, then 100% 'done' ✓\nline two" && ok.name === "A task", "a valid link, with + % and a new line in the prompt");
    assert(check(at(root), sources, used, now).folder === root, "the folder of the source itself");
    assert(check(at(join(root, "one", "..", "one")), sources, used, now).folder === join(root, "one"), "a .. that stays inside");
    fails(() => check(at(join(root, "..", "outside")), sources, used, now), "a .. that goes outside");
    fails(() => check(at(join(root, "away")), sources, used, now), "a symlink that goes outside");
    fails(() => check(at(join(dir, "projects-evil")), sources, used, now), "a folder whose name starts with the name of the source folder");
    fails(() => check(at(join(root, "none")), sources, used, now), "a folder that does not exist");
    fails(() => check(at("one"), sources, used, now), "a relative folder");

    const link = at(join(root, "one"));
    fails(() => check(link.replace(/sig=[0-9a-f]+/, ""), sources, used, now), "no signature");
    fails(() => check(link.replace(/sig=([0-9a-f])/, (_, c) => `sig=${c === "0" ? "1" : "0"}`), sources, used, now), "a bad signature");
    fails(() => check(link.replace(/sig=[0-9a-f]+/, (s) => s.toUpperCase().replace("SIG", "sig")), sources, used, now), "a signature in upper case");
    fails(() => check(link.replace("name=A%20task", "name=B%20task"), sources, used, now), "a changed name");
    fails(() => check(link.replace("source=site.example", "source=other.example"), sources, used, now), "an unknown source");
    fails(() => check(link, [], used, now), "no trusted sources");
    fails(() => check(`${link}&name=x`, sources, used, now), "a field that comes twice");
    fails(() => check(link.replace("v=1", "v=2"), sources, used, now), "version 2");
    fails(() => check(link.replace("prompt=", "prompt=%E0%A4%A"), sources, used, now), "a bad encoding");

    assert(check(at(root, "x", now - 599_000), sources, used, now), "a link of 599 seconds");
    fails(() => check(at(root, "x", now - 601_000), sources, used, now), "a link of 601 seconds");
    fails(() => check(at(root, "x", now + 601_000), sources, used, now), "a link 601 seconds in the future");

    const once = at(root);
    used[parse(once).nonce] = now;
    fails(() => check(once, sources, used, now), "a used nonce");
    prune(used, now + KEEP + 1);
    assert(!Object.keys(used).length, "old nonces go after KEEP");
    fails(() => check(once, sources, used, now + KEEP + 1), "a pruned nonce is too old by then");

    assert(check(at(root, "x".repeat(MAX_PROMPT)), sources, used, now), "a prompt of 16000 characters");
    fails(() => check(at(root, "x".repeat(MAX_PROMPT + 1)), sources, used, now), "a prompt of 16001 characters");
    fails(() => check(at(root, " "), sources, used, now), "an empty prompt");
    console.log("link check passed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
