// The people of this environment (docs/multi-user.md): two people or more who work on one computer at the same time,
// each with their own phones. They live in `people` of config.json, so an agent can add, rename and change them with an
// edit of that file, and the bridge reads the edit at the next request. No `people` key means one person: Yonder works as
// before. The owner of a task is a label that sends its answers to the right phone, not a lock: all people share one OS
// account. `bun bridge/people.ts` checks these rules.

export type Device = { id: string; name?: string };
// `workspace`: the default workspace of a new task of this person (a workspace id or name, as start_worker takes it).
// `profile`: the default profile of a new task of this person.
export type Person = { id: string; name: string; main?: boolean; profile?: string; workspace?: string; devices?: Device[] };

const text = (v: unknown) => typeof v === "string" && !!v.trim();

// The check of `people` in config.json. A value that fails keeps the last good people (the `ok` of each setting), so one
// bad edit does not move all the tasks to one person.
export function ok(v: unknown): v is Person[] {
  if (!Array.isArray(v)) return false;
  const ids = new Set<string>();
  const devices = new Set<string>();
  let mains = 0;
  for (const p of v) {
    if (!p || typeof p !== "object" || !text(p.id) || !text(p.name) || ids.has(p.id)) return false;
    ids.add(p.id);
    if (p.main !== undefined && typeof p.main !== "boolean") return false;
    if (p.main) mains++;
    for (const k of ["profile", "workspace"]) if (p[k] !== undefined && typeof p[k] !== "string") return false;
    if (p.devices === undefined) continue;
    if (!Array.isArray(p.devices)) return false;
    for (const d of p.devices) {
      if (!d || typeof d !== "object" || !text(d.id) || devices.has(d.id)) return false;
      if (d.name !== undefined && typeof d.name !== "string") return false;
      devices.add(d.id);
    }
  }
  return mains <= 1;
}

// The main person: the person of the Mac window, of the old tasks and of a phone that no person lists.
export const mainOf = (people: Person[]) => people.find((p) => p.main) ?? people[0];

// Two people or more: only then do the tasks get an owner filter, the pushes a target, and the messages a <from> tag.
export const shared = (people: Person[]) => people.length > 1;

// The person of a device: the phone ID that the relay sets (deviceId in relay.ts), or "mac" for the window of the app.
export function personOf(people: Person[], device: string): Person | undefined {
  if (!people.length) return undefined;
  return (device && device !== "mac" && people.find((p) => p.devices?.some((d) => d.id === device))) || mainOf(people);
}

// The owner of a task, as a person: no owner, or an owner that is gone from the file, means the main person.
export const ownerOf = (people: Person[], owner?: string) => (owner && people.find((p) => p.id === owner)) || mainOf(people);

// The paired devices of a person. The main person also gets each paired phone that no person lists.
export function devicesOf(people: Person[], person: Person | undefined, paired: string[]): string[] {
  if (!person) return paired;
  const listed = new Set(people.flatMap((p) => p.devices?.map((d) => d.id) ?? []));
  const own = (person.devices ?? []).map((d) => d.id).filter((id) => paired.includes(id));
  return person === mainOf(people) ? [...own, ...paired.filter((id) => !listed.has(id))] : own;
}

// A short id from a name, such as "marco" for "Marco", that no other person has.
export function newId(people: Person[], name: string) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "person";
  let id = base;
  for (let n = 2; people.some((p) => p.id === id); n++) id = `${base}-${n}`;
  return id;
}

// Puts each paired phone that no person lists into the file: with the person of the pick of the pairing window (an id, or
// the name of a new person), or else with the main person. Gives a new list when it changed, or undefined.
export function adopt(people: Person[], paired: Device[], pick?: string): Person[] | undefined {
  if (!people.length) return undefined;
  const listed = new Set(people.flatMap((p) => p.devices?.map((d) => d.id) ?? []));
  const fresh = paired.filter((d) => !listed.has(d.id));
  if (!fresh.length) return undefined;
  let next: Person[] = people.map((p) => ({ ...p, devices: [...(p.devices ?? [])] }));
  let to = pick ? next.find((p) => p.id === pick || p.name.toLowerCase() === pick.trim().toLowerCase()) : undefined;
  if (pick?.trim() && !to) next = [...next, (to = { id: newId(next, pick), name: pick.trim().slice(0, 60), devices: [] })];
  const target = to ?? mainOf(next);
  target.devices!.push(...fresh.map((d) => ({ id: d.id, name: d.name })));
  return next;
}

// The first pick of a person in the pairing window, when the file has no people yet: the phones that are paired now go to
// the main person, named after the computer user, and the new phone goes to the person of the pick.
export function start(paired: Device[], mainName: string): Person[] {
  return [{ id: newId([], mainName), name: mainName, main: true, devices: paired.map((d) => ({ id: d.id, name: d.name })) }];
}

// Takes an unpaired phone out of the file. Gives a new list when it changed, or undefined.
export function drop(people: Person[], device: string): Person[] | undefined {
  if (!people.some((p) => p.devices?.some((d) => d.id === device))) return undefined;
  return people.map((p) => (p.devices ? { ...p, devices: p.devices.filter((d) => d.id !== device) } : p));
}

// The tag that tells an agent who sends a message, when the environment has two people or more. The bridge strips it for the
// display, as the <device> block.
export const fromTag = (person: Person) => `<from>${person.name.replace(/[<>]/g, "")}</from>`;
export const FROM = /<from>([^<]*)<\/from>/;

if (import.meta.main) {
  const assert = (cond: unknown, what: string) => {
    if (!cond) throw new Error(`people.ts: ${what}`);
  };
  const pierre: Person = { id: "pierre", name: "Pierre", main: true, profile: "hermes", devices: [{ id: "P1" }] };
  const marco: Person = { id: "marco", name: "Marco", devices: [{ id: "M1" }] };
  const both = [pierre, marco];
  assert(ok(both), "a valid list passes");
  assert(ok([]), "an empty list passes");
  assert(!ok([pierre, { ...marco, id: "pierre" }]), "a duplicate person id fails");
  assert(!ok([pierre, { ...marco, devices: [{ id: "P1" }] }]), "a device in two lists fails");
  assert(!ok([pierre, { ...marco, main: true }]), "two main people fail");
  assert(!ok([{ id: "x" }]), "a person with no name fails");
  assert(!ok("people"), "a string fails");
  assert(personOf([], "P1") === undefined, "no people gives no person");
  assert(personOf(both, "M1") === marco, "a listed phone gives its person");
  assert(personOf(both, "X9") === pierre, "an unlisted phone gives the main person");
  assert(personOf(both, "mac") === pierre, "the Mac window gives the main person");
  assert(personOf(both, "") === pierre, "no device gives the main person");
  assert(mainOf([marco, { ...pierre, main: undefined }]) === marco, "with no main, the first person is the main person");
  assert(ownerOf(both, "marco") === marco && ownerOf(both, undefined) === pierre && ownerOf(both, "gone") === pierre, "the owner of a task");
  assert(!shared([pierre]) && shared(both), "two people or more share the environment");
  const paired = ["P1", "M1", "X9"];
  assert(devicesOf(both, marco, paired).join() === "M1", "Marco gets his phone only");
  assert(devicesOf(both, pierre, paired).join() === "P1,X9", "the main person also gets the unlisted phones");
  assert(devicesOf(both, marco, ["P1"]).length === 0, "an unpaired phone gets nothing");
  assert(devicesOf([], undefined, paired) === paired, "no people sends to all phones");
  assert(adopt([], [{ id: "X9" }]) === undefined, "no people: nothing to adopt");
  assert(adopt(both, [{ id: "P1" }, { id: "M1" }]) === undefined, "all listed: no change");
  const a = adopt(both, [{ id: "P1" }, { id: "X9", name: "iPad" }])!;
  assert(a[0].devices!.some((d) => d.id === "X9" && d.name === "iPad") && pierre.devices!.length === 1, "an unlisted phone goes to the main person, with no change in place");
  const b = adopt(both, [{ id: "X9" }], "marco")!;
  assert(b[1].devices!.some((d) => d.id === "X9"), "the pick by id gets the phone");
  const c = adopt(both, [{ id: "X9" }], "Lea")!;
  assert(c.length === 3 && c[2].id === "lea" && c[2].devices![0].id === "X9" && ok(c), "a new name makes a person");
  assert(newId(both, "Marco") === "marco-2" && newId([], "  ") === "person", "new ids do not clash");
  const s = start([{ id: "P1", name: "iPhone" }], "Sam");
  assert(s[0].main && s[0].id === "sam" && s[0].devices![0].id === "P1" && ok(s), "the first pick makes the main person");
  const d = drop(both, "M1")!;
  assert(d[1].devices!.length === 0 && marco.devices!.length === 1 && drop(both, "Z") === undefined, "an unpair drops the phone");
  assert(fromTag({ id: "x", name: "A<b>" }) === "<from>Ab</from>" && FROM.exec("hi <from>Marco</from>")?.[1] === "Marco", "the tag");
  console.log("people.ts: all checks pass");
}
