// The version of Yonder: "2.B.N". N counts the commits, so each commit gives a higher version, and an update of the
// screen over the air (src/front.ts) needs no new build. B is the build number: one more for each commit that changes a
// native shell (src-tauri/, ios/, android/), because only these need a new build for the Mac, TestFlight or Android.
// The 2 makes each version higher than each old version "1.N.0" and "1.B.N", for the Mac updater, App Store Connect and
// the Android version code. A B or an N above 999 is no problem (docs/wiki.md, "Versions").
// `bun version.ts` prints it, for the scripts of package.json.
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));

// The last version before the first commit of this repository. The count goes on from it, so each version stays higher
// than the versions in the stores and on the update server. ios and android are the N of the last change to each phone
// app before the first commit (see needs).
export const PRIOR = { b: 139, n: 1309, ios: 1302, android: 1203 };

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd }).toString().trim();
const root = (cwd: string) => git(cwd, "rev-list", "--max-parents=0", "HEAD");

export function version(cwd = HERE) {
  const count = (...paths: string[]) => Number(git(cwd, "rev-list", "--count", "HEAD", "--", ...paths));
  // The first commit counts as a change of each native shell, so its B is PRIOR.b + 1.
  return `2.${PRIOR.b + count("src-tauri", "ios", "android", ":!ios/store", ":!android/store")}.${PRIOR.n + count()}`;
}

// The commit of the version with this N, or "" for a version from before this repository.
export function commitOf(n: number, cwd = HERE) {
  if (!(n > PRIOR.n)) return "";
  return git(cwd, "rev-list", "--reverse", "HEAD").split("\n")[n - PRIOR.n - 1] ?? "";
}

// The N of the last commit that changed the native shell of each phone app (ios/, android/, not the store folders). A
// screen runs only in a phone app with at least this N (`fits` in src/front.ts), because it can call a native function
// that an older app does not have. The build writes it to dist/needs.json, and the bridge gives it (/front).
// A commit with the line "Native-Optional: yes" in its message does not count: use it only when the screen works on an
// older app too, because each new native part has a fallback in the page. A change to a plist does not count either:
// it adds no function that a screen can call. The share extension, the Watch app and project.yml do not count, because
// the screen cannot call them. When no commit after the first one changed a phone app, the N of the private history
// stays: the first commit holds the same native code as the last version before it.
export function needs(cwd = HERE) {
  const first = root(cwd);
  const apart = [":!ios/gen/apple/YonderShare", ":!ios/gen/apple/YonderWatch", ":!ios/gen/apple/project.yml"];
  const last = (path: string, prior: number) => {
    const commit = git(cwd, "log", "-1", "--format=%H", "--invert-grep", "--grep=^Native-Optional: yes$", `${first}..HEAD`, "--", path, `:!${path}/store`, ":!*.plist", ...apart);
    return commit ? PRIOR.n + Number(git(cwd, "rev-list", "--count", commit)) : prior;
  };
  return { ios: last("ios", PRIOR.ios), android: last("android", PRIOR.android) };
}

// The native iPhone app. The store text does not need a new build. A plist does not count either:
// `bun run testflight` rewrites the version in the plists, and that write must not start another upload.
export const IOS_APP = ["ios", ":!ios/store", ":!*.plist"];

// True when the native iPhone app differs between two commits.
export function iosNativeChanged(from: string, to = "HEAD", cwd = fileURLToPath(new URL(".", import.meta.url))) {
  if (!from) return false;
  const diff = spawnSync("git", ["diff", "--quiet", from, to, "--", ...IOS_APP], { cwd });
  return diff.status === 1;
}

if (import.meta.main) console.log(version());
