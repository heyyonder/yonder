// The backup of the settings to the Yonder account, so that they follow the user to each computer and each phone
// (/api/app/sync of yonder.so, the private backend). The bridge of each computer syncs: it owns
// config.json, phone.json and the screens, and each phone takes its look from phone.json of its computer. Only the
// settings that the schema marks with "sync" (bridge/settings/) and the screens of the user go up, never a whole file,
// so a key, a token or a login never leaves the computer. yonder.so keeps the backup encrypted at rest, so the
// user needs no sync code.
//
// The backup is one object: { "<store>:<key>": { v, at } }, with the time of the last change of each key. Key by key,
// the newer change wins, and a delete is a value of null, so it reaches the other devices too. The first sync of a
// device gives each of its keys the time 0, so the account wins (a restore), and only the keys that the account does
// not have go up. `bun bridge/sync.ts` checks the merge.
import { readFileSync, writeFileSync } from "node:fs";

export type Entry = { v: unknown; at: number };
export type Entries = Record<string, Entry>;
type Saved = { token?: string; version?: number; base?: Entries; checked?: number; at?: number; error?: string };

// The order of the keys of an object does not count.
const stable = (v: unknown) =>
  JSON.stringify(v ?? null, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
export const same = (a: unknown, b: unknown) => stable(a) === stable(b);

// The keys of this device, with the time of each change since the last sync. `base` is the state after the last sync.
export function stamp(local: Record<string, unknown>, base: Entries | undefined, now: number): Entries {
  const out: Entries = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(base ?? {})])) {
    const b = base?.[k];
    out[k] = b && same(local[k], b.v) ? b : { v: local[k] ?? null, at: base ? now : 0 };
  }
  return out;
}

// Key by key, the newer change wins, and the account wins a tie.
export function merge(mine: Entries, theirs: Entries): Entries {
  const out = { ...theirs };
  for (const [k, e] of Object.entries(mine)) if (!theirs[k] || e.at > theirs[k].at) out[k] = e;
  return out;
}

// The bridge gives `read`, the synced values of this device, and `write`, which sets one of them (null deletes it).
// `on` is the Sync switch of the Account settings. sync.json keeps the sign-in and the last state, with mode 600.
export function syncer(o: { file: string; site: string; read: () => Record<string, unknown>; write: (key: string, v: unknown) => void; on: () => boolean }) {
  const load = (): Saved => {
    try {
      return JSON.parse(readFileSync(o.file, "utf8"));
    } catch {
      return {};
    }
  };
  const keep = (s: Saved) => writeFileSync(o.file, JSON.stringify(s), { mode: 0o600 });
  const api = async (token: string, query = "", body?: object) => {
    const res = await fetch(`${o.site}/api/app/sync${query}`, {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw Object.assign(new Error("Sign in again."), { signedOut: true });
    if (!res.ok && res.status !== 409) throw new Error(data.error ?? `yonder.so answered with status ${res.status}.`);
    return data as { version: number; data?: Entries };
  };

  // One sync. With no change on this device, it only asks yonder.so for a new version, at most each 10 minutes.
  async function once(force: boolean) {
    const s = load();
    const token = s.token;
    if (!token || !o.on()) return;
    try {
      const mine = stamp(o.read(), s.base, Date.now());
      const changed = !s.base || Object.entries(mine).some(([k, e]) => e !== s.base![k]);
      // After a failure, such as a yonder.so with no /api/app/sync yet, the next try waits 10 minutes too.
      if ((!changed || s.error) && !force && Date.now() - (s.checked ?? 0) < 600_000) return;
      const first = !s.base;
      let res = await api(token, changed ? "" : `?version=${s.version}`);
      for (let i = 0; res.data && i < 3; i++) {
        const theirs = res.data;
        const merged = merge(mine, theirs);
        // The screens first, so that the screen in use (phone:ui) finds its screen.
        const keys = Object.keys(merged).sort((a, b) => Number(b.startsWith("screen:")) - Number(a.startsWith("screen:")));
        const now = o.read();
        for (const k of keys) {
          const won = merged[k] !== mine[k] && (!mine[k] || merged[k].at > mine[k].at || first);
          if (won && !same(merged[k].v, now[k]))
            try {
              o.write(k, merged[k].v);
            } catch (e) {
              console.error(`Yonder sync: ${k}: ${(e as Error).message}`);
            }
        }
        // The base holds the values as this device reads them back, so a value that the device writes in its own way,
        // such as a screen, does not count as a new change.
        const after = o.read();
        s.base = Object.fromEntries(Object.entries(merged).map(([k, e]) => [k, { v: after[k] ?? null, at: e.at }]));
        s.version = res.version;
        if (!keys.some((k) => merged[k] !== theirs[k])) break;
        const body = { version: res.version, data: merged };
        // shortcut: the request of Django stops at 2.5 MB, so the backup is 2 MB or less; gzip the body if screens grow.
        if (JSON.stringify(body).length > 2_000_000) throw new Error("The settings and the screens are larger than 2 MB.");
        res = await api(token, "", body);
        if (!res.data) s.version = res.version; // Saved. Else another device wrote first: merge with its backup.
      }
      Object.assign(s, { checked: Date.now(), at: Date.now(), error: undefined });
    } catch (e) {
      Object.assign(s, { checked: Date.now(), error: (e as Error).message });
      if ((e as { signedOut?: boolean }).signedOut) delete s.token;
    } finally {
      // A sign-in during the sync wins: the state of the sync belongs to the account of the old sign-in.
      if (load().token === token) keep(s);
    }
  }
  // The syncs run one after the other. A sync that waits for its turn makes a second one needless, unless it is forced.
  let last = Promise.resolve();
  let waiting = false;
  function run(force = false) {
    if (waiting && !force) return last;
    waiting = true;
    return (last = last.then(() => ((waiting = false), once(force))));
  }

  return {
    run,
    // A new sign-in starts again with a first sync: the account gives its settings, and this device adds the settings
    // that the account does not have.
    signIn(token: string | null) {
      const s = load();
      if (token === (s.token ?? null)) return;
      keep(token ? { token } : {});
      void run(true);
    },
    // For GET /sync and the line under the Sync switch.
    status() {
      const s = load();
      return { token: !!s.token, on: o.on(), at: s.at, error: s.error };
    },
    note() {
      const s = load();
      if (!o.on()) return "Off: this device keeps its own settings.";
      if (!s.token) return "Sign in on this computer to sync.";
      if (s.error) return `Sync failed: ${s.error}`;
      if (!s.at) return "Syncing.";
      const min = Math.round((Date.now() - s.at) / 60_000);
      return `Synced ${min < 1 ? "now" : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`}.`;
    },
  };
}

if (import.meta.main) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error(`sync check failed: ${what}`);
  };
  assert(same({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }), "key order");
  assert(!same([1, 2], [2, 1]), "list order counts");
  assert(same(undefined, null), "absent is null");
  // A first sync: each key has the time 0, so the account wins, and a key that only this device has goes up.
  const first = stamp({ "phone:theme": "light", "config:steer": true }, undefined, 100);
  const cloud = { "phone:theme": { v: "dark", at: 50 } };
  const restored = merge(first, cloud);
  assert(restored["phone:theme"].v === "dark" && restored["config:steer"].v === true, "restore");
  // A change since the last sync gets the time now, and wins over an older change of the account.
  const base = { "phone:theme": { v: "dark", at: 50 }, "config:steer": { v: true, at: 0 } };
  const mine = stamp({ "phone:theme": "light", "config:steer": true }, base, 200);
  assert(mine["config:steer"] === base["config:steer"], "no change keeps the entry");
  assert(merge(mine, { "phone:theme": { v: "dark", at: 150 } })["phone:theme"].v === "light", "newer change wins");
  assert(merge(mine, { "phone:theme": { v: "dark", at: 250 } })["phone:theme"].v === "dark", "newer account wins");
  assert(merge(mine, { "phone:theme": { v: "dark", at: 200 } })["phone:theme"].v === "dark", "a tie goes to the account");
  // A key that this device deleted becomes null with the time now, so the delete reaches the other devices.
  const gone = stamp({}, { "screen:mine": { v: { name: "Mine" }, at: 5 } }, 300);
  assert(gone["screen:mine"].v === null && gone["screen:mine"].at === 300, "a delete");
  console.log("sync: merge OK");
}
