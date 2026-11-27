// The safe saves of the files of the bridge, and the export and the import of the setup (docs/wiki/projects.md "Backup").
// - writeSafe writes a copy and renames it into place, so a crash never leaves half a file. The file before the save
//   stays as <file>.bak.
// - readSafe reads a file, or its .bak when the file is missing or broken. A broken file moves to <file>.broken-<time>,
//   so that the next save cannot make it the .bak, and nothing is lost.
// - exportSetup makes one JSON file of the setup: config.json, phone.json, the projects, the schedules, the reminders,
//   talk.md, the own settings and the own screens. Without keys (the default) it leaves out each key, token and pairing.
//   With keys it also holds the files of the keys (KEY_FILES).
// - planImport merges such a file into the current setup. The import writes nothing that the file does not hold, and
//   it changes a key only when the import is with keys.
// With this file, a user without a Yonder account cannot lose the setup.
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export function writeSafe(file: string, text: string, mode = 0o600) {
  const tmp = `${file}.yonder`;
  writeFileSync(tmp, text, { mode });
  if (existsSync(file)) {
    // A hard link costs nothing, also for a state.json of some MB that the bridge saves often.
    rmSync(`${file}.bak`, { force: true });
    try {
      linkSync(file, `${file}.bak`);
    } catch {
      copyFileSync(file, `${file}.bak`);
    }
  }
  renameSync(tmp, file);
}

// `data` is undefined when neither the file nor its .bak can be read. An empty file is broken: a save never writes one.
// With `move` false, a broken file stays where it is, for a file that the user edits by hand and the bridge reads often,
// such as phone.json: an editor can be in the middle of its save. moveBroken moves it before the next save.
export function readSafe(file: string, log: (line: string) => void = console.error, move = true): { data?: any; from?: "file" | "bak" } {
  if (existsSync(file))
    try {
      return { data: JSON.parse(readFileSync(file, "utf8")), from: "file" };
    } catch (e) {
      if (move) moveBroken(file, (e as Error).message, log);
    }
  if (existsSync(`${file}.bak`))
    try {
      return { data: JSON.parse(readFileSync(`${file}.bak`, "utf8")), from: "bak" };
    } catch (e) {
      log(`${file}.bak is broken too (${(e as Error).message}).`);
    }
  return {};
}

// Moves a broken file to <file>.broken-<time>, so that it is kept, and the next save does not make it the .bak.
export function moveBroken(file: string, why: string, log: (line: string) => void = console.error) {
  const keep = `${file}.broken-${Date.now()}`;
  log(`${file} is broken (${why}). It moves to ${keep}, and the bridge reads ${file}.bak.`);
  renameSync(file, keep);
}

// The files of the keys: the API keys, the pairing of the phones and the relay, the token of 1Password sealed to each
// phone, the tokens of the connector of the Claude app, and the tunnel of Yonder Preview.
export const KEY_FILES = [".env", "relay.json", "vault.json", "remote.json", "tunnel.json"];
// The import writes the key files here, and the next start of the bridge puts them in place (applyPending), so the
// bridge that runs cannot write its old pairing over them before it stops.
export const PENDING = "import-keys";
// The keys of config.json that hold a secret or belong to one computer: the port and the token of the bridge (one OS
// user on one computer), its name, and the keys of the signed links. The keys of state.json that the export takes.
const SECRET_CONFIG = ["port", "token", "computerName", "trustedLinkSources"];
const STATE_KEYS = ["extra", "starred", "hidden", "abouts", "schedules", "reminders"] as const;
const TEXT_FILES = ["talk.md", "settings.json"];
const MAX_FILE = 2_000_000;

export type Setup = {
  yonder: "setup";
  version: 1;
  exported: string;
  keys: boolean;
  config: Record<string, any>;
  phone: Record<string, any>;
  state: Partial<Record<(typeof STATE_KEYS)[number], any>>;
  // The files by their path in the config folder, as base64: talk.md, settings.json, ui/... and, with keys, KEY_FILES.
  // ui/ is the link to themes/ (screensRoot in bridge/ui.ts). The files keep the name ui/, so an older Yonder imports them.
  files: Record<string, string>;
};

// Takes each key, token and pairing out of a copy of config.json and the state.
function stripKeys(config: Record<string, any>, state: Setup["state"]) {
  for (const k of SECRET_CONFIG) delete config[k];
  // The variables of a profile can hold an API key. Its folder and program stay: they are no secret.
  if (Array.isArray(config.profiles)) for (const p of config.profiles) delete p?.env;
  // The devices of a person are paired phones (docs/multi-user.md), so they go only with the pairing.
  if (Array.isArray(config.people)) for (const p of config.people) delete p?.devices;
  if (Array.isArray(state.schedules)) for (const s of state.schedules) delete s?.secret;
}

const walk = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : d.isFile() ? [join(dir, d.name)] : [])) : [];

export function exportSetup(dir: string, now: { config: Record<string, any>; phone: Record<string, any>; state: Record<string, any> }, keys: boolean): Setup {
  const config = structuredClone(now.config);
  const state: Setup["state"] = {};
  for (const k of STATE_KEYS) if (now.state[k] !== undefined) state[k] = structuredClone(now.state[k]);
  if (!keys) stripKeys(config, state);
  const files: Record<string, string> = {};
  const paths = [...TEXT_FILES.map((f) => join(dir, f)), ...walk(join(dir, "ui")), ...(keys ? KEY_FILES.map((f) => join(dir, f)) : [])];
  for (const path of paths)
    if (existsSync(path) && statSync(path).size <= MAX_FILE) files[relative(dir, path).split(sep).join("/")] = readFileSync(path).toString("base64");
  return { yonder: "setup", version: 1, exported: new Date().toISOString(), keys, config, phone: structuredClone(now.phone), state, files };
}

export function parseSetup(text: string): Setup {
  let s: any;
  try {
    s = JSON.parse(text);
  } catch {
    throw new Error("The file is not JSON. Give a file that Export of Yonder made.");
  }
  if (s?.yonder !== "setup" || s.version !== 1 || typeof s.config !== "object" || typeof s.files !== "object")
    throw new Error("The file is not an export of Yonder (version 1).");
  return s as Setup;
}

// Two lists with objects that have an id merge by id: the entry of the file wins, with the fields of the current entry
// that it does not have (such as the `env` of a profile in an export without keys). Each other current entry stays,
// also one with no id, such as an entry that the bridge leaves out because it is not valid. A list with no ids, such as
// the range ["haiku", "fable"], is the value of the file.
const idOf = (x: unknown) => (x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string" ? (x as { id: string }).id : undefined);
const byId = (now: unknown, from: unknown): unknown => {
  if (!Array.isArray(now) || !Array.isArray(from) || !(now.some(idOf) || from.some(idOf))) return from;
  const out = now.map((x) => {
    const y = idOf(x) && from.find((f) => idOf(f) === idOf(x));
    return y ? { ...x, ...y } : x;
  });
  const same = (y: unknown) => out.some((x) => JSON.stringify(x) === JSON.stringify(y));
  return [...out, ...from.filter((y) => (idOf(y) ? !now.some((x) => idOf(x) === idOf(y)) : !same(y)))];
};
const union = (a: unknown, b: unknown) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];

export type Plan = {
  config: Record<string, any>;
  phone: Record<string, any>;
  state: Setup["state"];
  // The files to write, by their path in the config folder. A screen file that is there already stays as it is.
  files: Record<string, Buffer>;
  skipped: string[];
};

// `valid` checks one value of config.json, as the bridge does (SETTINGS). `read` gives a file of the config folder.
export function planImport(
  setup: Setup,
  now: { config: Record<string, any>; phone: Record<string, any>; state: Record<string, any> },
  keys: boolean,
  valid: (key: string, v: unknown) => boolean,
  read: (path: string) => Buffer | undefined,
): Plan {
  const skipped: string[] = [];
  const config = structuredClone(now.config);
  // Without keys, the keys in a file with keys do not apply either: the current values stay.
  if (!keys && setup.keys) {
    setup = structuredClone(setup);
    stripKeys(setup.config, setup.state);
    skipped.push("the keys of the file (only with keys)");
  }
  for (const [k, v] of Object.entries(setup.config)) {
    if (SECRET_CONFIG.includes(k) && !keys) {
      skipped.push(`config.json ${k} (only with keys)`);
      continue;
    }
    const next = byId(config[k], v);
    if (!valid(k, next)) {
      skipped.push(`config.json ${k} (not valid)`);
      continue;
    }
    config[k] = next;
  }
  const state: Setup["state"] = {};
  const from = setup.state ?? {};
  for (const k of ["extra", "starred", "hidden"] as const) if (from[k]) state[k] = union(now.state[k], from[k]);
  if (from.abouts) state.abouts = { ...now.state.abouts, ...from.abouts };
  // A schedule or a reminder that is here already keeps its own times, so a restore never starts it twice.
  for (const k of ["schedules", "reminders"] as const)
    if (Array.isArray(from[k])) state[k] = [...(now.state[k] ?? []), ...from[k].filter((x: { id: string }) => !(now.state[k] ?? []).some((y: { id: string }) => y.id === x.id))];
  const files: Record<string, Buffer> = {};
  for (const [path, b64] of Object.entries(setup.files ?? {})) {
    const key = KEY_FILES.includes(path);
    if (path.split("/").includes("..") || path.startsWith("/") || !(key || TEXT_FILES.includes(path) || path.startsWith("ui/"))) skipped.push(`${path} (not a file of the setup)`);
    else if (key && !keys) skipped.push(`${path} (only with keys)`);
    else if (path.startsWith("ui/") && read(path)) continue;
    else if (path === ".env") files[path] = Buffer.from(mergeEnv(read(path)?.toString() ?? "", Buffer.from(b64, "base64").toString()));
    else files[path] = Buffer.from(b64, "base64");
  }
  return { config, phone: { ...now.phone, ...setup.phone }, state, files, skipped };
}

// The .env of the file, with each variable of the current .env that the file does not set.
const mergeEnv = (now: string, from: string) => {
  const name = (line: string) => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
  const set = new Set(from.split("\n").map(name).filter(Boolean));
  const kept = now.split("\n").filter((line) => name(line) && !set.has(name(line)));
  return [from.replace(/\n*$/, ""), ...kept].join("\n") + "\n";
};

// Copies the current files that an import can change to <dir>/backups/before-import-<time>/, and gives that folder.
export function keepBefore(dir: string): string {
  const to = join(dir, "backups", `before-import-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  for (const f of ["config.json", "phone.json", "state.json", ...TEXT_FILES, ...KEY_FILES])
    if (existsSync(join(dir, f))) {
      mkdirSync(to, { recursive: true, mode: 0o700 });
      copyFileSync(join(dir, f), join(to, f));
    }
  return to;
}

// Writes the files of an import. A key file goes to <dir>/import-keys/, and the next start puts it in place.
export function writeFiles(dir: string, files: Record<string, Buffer>) {
  for (const [path, data] of Object.entries(files)) {
    const key = KEY_FILES.includes(path);
    const file = key ? join(dir, PENDING, path) : join(dir, ...path.split("/"));
    mkdirSync(dirname(file), { recursive: true, mode: key ? 0o700 : 0o755 });
    writeFileSync(file, data, { mode: key ? 0o600 : 0o644 });
  }
}

// At the start of the bridge, before it reads a key file: puts the key files of an import in place.
export function applyPending(dir: string, log: (line: string) => void = console.error) {
  const from = join(dir, PENDING);
  if (!existsSync(from)) return;
  const names = readdirSync(from).filter((f) => KEY_FILES.includes(f));
  for (const f of names) renameSync(join(from, f), join(dir, f));
  rmSync(from, { recursive: true, force: true });
  log(`Yonder import: ${names.join(", ")} in place.`);
}
