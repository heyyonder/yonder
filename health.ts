// The health of a release in Sentry (the project yonder): `bun run health <version>`, for example 2.82.425. It passes when
// the release has sessions, at least MIN_CRASH_FREE of them ended with no crash, and it has no open crash issue, also one
// that started in an older release. Else it exits with 1, so a promotion to production stops. A crash is an error that the
// app did not catch (`error.unhandled:true`): a panic of the Mac or iPhone app, a crash of Android, or an uncaught error of
// the screen. The issues count too, because a session of the screen does not end as "crashed" on such an error: a
// release can have 100% crash-free sessions and a crash issue.
// The token is SENTRY_AUTH_TOKEN or the one of ~/.sentryclirc. The org and the project are SENTRY_ORG and SENTRY_PROJECT,
// else the lines of ~/.config/yonder/release.env.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const releaseEnv = join(homedir(), ".config/yonder/release.env");
const setting = (name: string) =>
  process.env[name] || (existsSync(releaseEnv) ? new RegExp(`^${name}=(.+)$`, "m").exec(readFileSync(releaseEnv, "utf8"))?.[1].trim() : undefined);
const ORG = setting("SENTRY_ORG");
const PROJECT = setting("SENTRY_PROJECT");
// shortcut: fixed thresholds for a few testers. Raise MIN_SESSIONS when the staging group grows.
const MIN_CRASH_FREE = 0.99;
const MIN_SESSIONS = 1;

const release = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(release ?? "")) {
  console.error("Usage: bun run health <version>, for example 2.82.425");
  process.exit(2);
}
const rc = join(homedir(), ".sentryclirc");
const token = process.env.SENTRY_AUTH_TOKEN ?? (existsSync(rc) ? /^token=(.+)$/m.exec(readFileSync(rc, "utf8"))?.[1] : undefined);
if (!token) {
  console.error("No Sentry token: set SENTRY_AUTH_TOKEN or log in with `sentry-cli login`.");
  process.exit(2);
}
if (!ORG || !PROJECT) {
  console.error("No Sentry project: set SENTRY_ORG and SENTRY_PROJECT, in the environment or in ~/.config/yonder/release.env.");
  process.exit(2);
}
// The Android app sends as "<package>@<version>+<version code>" (sentry-android), the others as the version. Tauri makes the
// version code as major * 1000000 + minor * 1000 + patch.
const [major, minor, patch] = release.split(".").map(Number);
const releases = `release:["${release}", "so.yonder@${release}+${major * 1_000_000 + minor * 1000 + patch}"]`;
const api = async (path: string, query: string[][]) => {
  const res = await fetch(`https://sentry.io/api/0/${path}?${new URLSearchParams(query)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sentry ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};

const { id: projectId }: { id: string } = await api(`projects/${ORG}/${PROJECT}/`, []);
const totals = (
  await api(`organizations/${ORG}/sessions/`, [
    ["project", projectId],
    ["field", "crash_free_rate(session)"],
    ["field", "sum(session)"],
    ["statsPeriod", "30d"],
    ["interval", "1d"],
    ["query", releases],
  ])
).groups[0]?.totals ?? {};
const total: number = totals["sum(session)"] ?? 0;
const crashFree: number | null = totals["crash_free_rate(session)"] ?? null;
const crashes: { shortId: string; title: string; count: string }[] = await api(`projects/${ORG}/${PROJECT}/issues/`, [
  ["query", `${releases} error.unhandled:true is:unresolved`],
  ["statsPeriod", "14d"], // the longest that this endpoint takes
]);

const problems = [
  total < MIN_SESSIONS && `${total} sessions, and the check needs ${MIN_SESSIONS} or more`,
  crashFree !== null && crashFree < MIN_CRASH_FREE && `${(crashFree * 100).toFixed(2)}% crash-free sessions, under ${MIN_CRASH_FREE * 100}%`,
  ...crashes.map((c) => `a crash: ${c.shortId} ${c.title} (${c.count} events)`),
].filter(Boolean);
console.log(`Release ${release}: ${total} sessions, ${crashFree === null ? "no" : `${(crashFree * 100).toFixed(2)}%`} crash-free, ${crashes.length} open crash issues.`);
for (const p of problems) console.log(`- ${p}`);
console.log(problems.length ? "Not healthy." : "Healthy.");
process.exit(problems.length ? 1 : 0);
