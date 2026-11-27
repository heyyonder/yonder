// The check of bridge/backup.ts: `bun bridge/backup-check.ts`. It works in a new temp folder, starts no bridge and
// uses no credits.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPending, exportSetup, keepBefore, parseSetup, planImport, readSafe, writeFiles, writeSafe } from "./backup";

const assert = (ok: unknown, what: string) => {
  if (!ok) throw new Error(`backup-check failed: ${what}`);
  console.log(`ok - ${what}`);
};
const dir = mkdtempSync(join(tmpdir(), "yonder-backup-"));
const quiet = () => {};
try {
  // Safe saves: the save before stays as .bak, and a broken file moves aside and its .bak applies.
  const state = join(dir, "state.json");
  writeSafe(state, JSON.stringify({ n: 1 }));
  writeSafe(state, JSON.stringify({ n: 2 }));
  assert(JSON.parse(readFileSync(`${state}.bak`, "utf8")).n === 1, "the save before stays as .bak");
  assert(!existsSync(`${state}.yonder`), "no copy is left after a save");
  writeFileSync(state, '{"n": 3, "workers": [');
  const stay = readSafe(state, quiet, false);
  assert(stay.from === "bak" && stay.data.n === 1 && existsSync(state), "with move false a broken file gives its .bak and stays in place");
  const read = readSafe(state, quiet);
  assert(read.from === "bak" && read.data.n === 1, "a broken file gives its .bak");
  assert(!existsSync(state) && readdirSync(dir).some((f) => f.startsWith("state.json.broken-")), "the broken file moves aside and is kept");
  writeSafe(state, JSON.stringify({ n: 4 }));
  assert(JSON.parse(readFileSync(`${state}.bak`, "utf8")).n === 1, "the next save keeps the good .bak, not the broken file");
  writeFileSync(state, "");
  rmSync(`${state}.bak`);
  assert(readSafe(state, quiet).data === undefined, "an empty file with no .bak gives no data, so the defaults apply");
  assert(readSafe(join(dir, "none.json"), quiet).data === undefined, "a missing file gives no data");

  // Export: without keys it leaves out each secret.
  mkdirSync(join(dir, "ui", "mine", "1"), { recursive: true });
  writeFileSync(join(dir, "ui", "mine", "1", "index.html"), "<p>mine</p>");
  writeFileSync(join(dir, "talk.md"), "Talk short.");
  writeFileSync(join(dir, ".env"), "XAI_API_KEY=old\nOWN=keep\n");
  writeFileSync(join(dir, "relay.json"), JSON.stringify({ pub: "p", token: "t" }));
  const now = {
    config: {
      port: 7790,
      token: "secret",
      trustedLinkSources: [{ id: "a", key: "k" }],
      models: ["haiku", "fable"],
      profiles: [{ id: "p1", name: "Work", cli: "claude", env: { API_KEY: "x" }, folder: "~/.claude-p1" }],
      workspaces: [{ id: "yonder", name: "Yonder", folder: "~/Sites/yonder" }],
    },
    phone: { theme: "dark" },
    state: { extra: ["/a"], starred: [], hidden: [], schedules: [{ id: "s1", name: "Daily", next: 1, secret: "sig" }], reminders: [], workers: [{ id: "w1" }] },
  };
  const plain = exportSetup(dir, now, false);
  const text = JSON.stringify(plain);
  assert(!("port" in plain.config) && !("token" in plain.config) && !("trustedLinkSources" in plain.config), "no port, token or link keys without keys");
  assert(!text.includes('"API_KEY"') && !text.includes('"sig"'), "no profile variables or webhook secrets without keys");
  assert(!plain.files[".env"] && !plain.files["relay.json"], "no key files without keys");
  assert(plain.files["ui/mine/1/index.html"] && plain.files["talk.md"], "the screens and talk.md go along");
  assert(plain.config.workspaces[0].id === "yonder" && plain.state.schedules?.length === 1 && !("workers" in plain.state), "workspaces and schedules go along, workers do not");
  assert(now.config.profiles[0].env.API_KEY === "x" && now.config.token === "secret", "the export does not change the current setup");
  const full = exportSetup(dir, now, true);
  assert(full.config.token === "secret" && full.files[".env"] && full.files["relay.json"], "with keys it holds the token and the key files");

  // Import: a merge that never changes a key without keys.
  const other = {
    config: { port: 7787, token: "mine", models: ["sonnet", "opus"], profiles: [{ id: "p1", name: "Old", cli: "claude", env: { API_KEY: "local" } }, { id: "p2", name: "Here", cli: "codex" }], workspaces: [{ id: "here", name: "Here" }] },
    phone: { theme: "light", chatFont: "serif" },
    state: { extra: ["/b"], starred: [], hidden: [], abouts: {}, schedules: [{ id: "s1", name: "Mine", next: 99 }], reminders: [] },
  };
  const valid = (k: string, v: unknown) => k !== "models" || (Array.isArray(v) && v.length === 2);
  const none = () => undefined;
  const p1 = planImport(parseSetup(text), other, false, valid, none);
  assert(p1.config.token === "mine" && p1.config.port === 7787, "an import without keys keeps the port and the token");
  assert(p1.config.models[0] === "haiku", "the settings of the file win");
  assert(p1.config.profiles.find((p: any) => p.id === "p1").env.API_KEY === "local" && p1.config.profiles.find((p: any) => p.id === "p1").name === "Work", "a profile merges by id and keeps its own variables");
  assert(p1.config.profiles.some((p: any) => p.id === "p2") && p1.config.workspaces.length === 2, "the entries of this computer stay");
  assert(p1.phone.theme === "dark" && p1.phone.chatFont === "serif", "phone.json merges");
  assert(p1.state.extra?.join() === "/b,/a", "the projects merge");
  assert(p1.state.schedules?.length === 1 && p1.state.schedules[0].name === "Mine", "a schedule that is here already stays as it is");
  assert(!p1.files[".env"] && p1.files["talk.md"], "no key file without keys");
  const p2 = planImport(full, other, true, valid, (path) => (path === ".env" ? Buffer.from("XAI_API_KEY=here\nLOCAL=1\n") : undefined));
  const env = p2.files[".env"].toString();
  assert(p2.config.token === "secret" && env.includes("XAI_API_KEY=old") && !env.includes("=here") && env.includes("LOCAL=1"), "with keys the token applies, and .env merges by name");
  const p3 = planImport(full, other, false, valid, none);
  assert(p3.config.token === "mine" && !p3.files["relay.json"], "a file with keys imported without keys changes no key");
  const bad = planImport({ ...plain, config: { models: ["x"] }, files: { "../evil": "", "ui/../../x": "", "bin/run": "" } }, other, true, valid, none);
  assert(bad.config.models[0] === "sonnet" && Object.keys(bad.files).length === 0 && bad.skipped.length === 4, "a value that is not valid and a path out of the folder are skipped");
  assert(planImport(plain, other, false, valid, (p) => (p.startsWith("ui/") ? Buffer.from("x") : undefined)).files["ui/mine/1/index.html"] === undefined, "a screen file that is here stays");
  // A list with an entry that has no id keeps that entry, and the devices of people are pairings.
  const withPeople = { ...now, config: { ...now.config, computerName: "Studio", people: [{ id: "sam", name: "Sam", devices: [{ id: "dev1" }] }] } };
  const plainPeople = exportSetup(dir, withPeople, false);
  assert(!("computerName" in plainPeople.config) && !("devices" in plainPeople.config.people[0]), "without keys no computer name and no devices of people");
  const here = { ...other, config: { ...other.config, computerName: "Laptop", people: [{ id: "sam", name: "S", devices: [{ id: "phone-here" }] }], workspaces: [{ name: "no id, left out by the bridge" }, { id: "here", name: "Here" }] } };
  const p4 = planImport(exportSetup(dir, withPeople, true), here, false, valid, none);
  assert(p4.config.computerName === "Laptop" && p4.config.people[0].devices[0].id === "phone-here" && p4.config.people[0].name === "Sam", "a file with keys imported without keys keeps the name and the devices of this computer");
  assert(p4.config.workspaces.some((w: any) => !w.id) && p4.config.workspaces.length === 3, "an entry with no id stays in the merge");
  assert(planImport(plain, other, false, valid, none).config.models.join() === "haiku,fable", "a list with no ids is the value of the file");

  // The key files of an import wait in import-keys/, and the next start puts them in place.
  writeFiles(dir, { "relay.json": Buffer.from('{"pub":"new"}') });
  assert(JSON.parse(readFileSync(join(dir, "relay.json"), "utf8")).pub === "p" && existsSync(join(dir, "import-keys", "relay.json")), "an imported key file waits in import-keys/");
  applyPending(dir, quiet);
  assert(JSON.parse(readFileSync(join(dir, "relay.json"), "utf8")).pub === "new" && !existsSync(join(dir, "import-keys")), "the next start puts it in place");

  let refused = "";
  try {
    parseSetup('{"a":1}');
  } catch (e) {
    refused = (e as Error).message;
  }
  assert(refused.includes("not an export"), "a file that is not an export is refused");

  // The copy before an import, and the write of the files.
  writeFileSync(join(dir, "config.json"), "{}");
  const before = keepBefore(dir);
  assert(existsSync(join(before, "config.json")) && existsSync(join(before, ".env")), "the files before the import are kept");
  writeFiles(dir, { "ui/new/1/index.html": Buffer.from("new") });
  assert(readFileSync(join(dir, "ui", "new", "1", "index.html"), "utf8") === "new", "the files of the import are written");
  console.log("backup-check: all passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
