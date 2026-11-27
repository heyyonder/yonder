// The rules of the update server (updates.yonder.so, worker.ts), shared with its clients. See "Update server" in
// docs/wiki/install.md. The state is one JSON object: for each channel and platform, the version out now, the version before
// it, the percent of the installs that get the new one, a stop switch, a rollback mark and a minimum version.
export const PLATFORMS = ["mac", "linux", "windows", "android"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type Feed = { version: string; previous?: string; percent: number; halted?: boolean; rollback?: boolean; min?: string };
export type State = Record<string, Partial<Record<Platform, Feed>>>;

export const newer = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }) > 0;

// The bucket of an install, 0 to 99, from the random ID that the install keeps (FNV-1a). An install with no ID is in
// bucket 99, so it gets a new version only at 100%.
export function bucket(id?: string | null) {
  if (!id) return 99;
  let h = 0x811c9dc5;
  for (const c of new TextEncoder().encode(id)) h = Math.imul(h ^ c, 0x01000193) >>> 0;
  return h % 100;
}

// The version for one install, and whether it is a rollback: older than the version of the install (`have`), which the
// install takes only because of the mark. undefined: no update. An install under the minimum always gets the version
// out now. A stopped rollout, and an install outside the percent, get the version before.
export function pick(feed: Feed | undefined, id?: string | null, have?: string | null): { version: string; rollback: boolean } | undefined {
  if (!feed?.version) return;
  let version = feed.version;
  const below = !!have && !!feed.min && newer(feed.min, have);
  if (!below && (feed.halted || bucket(id) >= feed.percent)) {
    if (!feed.previous) return;
    version = feed.previous;
  }
  return { version, rollback: !!feed.rollback && !!have && newer(have, version) };
}

// The answer for Linux, Windows and Android: the version, and "rollback" on a second line.
export const text = (p: { version: string; rollback: boolean }) => `${p.version}\n${p.rollback ? "rollback\n" : ""}`;

// The version that a copy installs from such an answer, or undefined: a newer version, or an older one with the mark.
export function accept(answer: string, have: string) {
  const [version = "", mark] = answer.trim().split(/\s+/);
  if (!/^\d+\.\d+\.\d+$/.test(version)) return;
  return newer(version, have) || (mark === "rollback" && newer(have, version)) ? version : undefined;
}
