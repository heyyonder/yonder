// Builds the signed release APK of the Android app for testers, and puts it on its GitHub release (github-release.ts).
// https://download.yonder.so/Yonder.apk sends there:
// the Android link of yonder.so. A tester installs it from the browser, with no Google Play.
// The APK has the signature of the upload key (~/.config/yonder/android-upload.properties, read by
// app/build.gradle.kts). Google Play signs its copy with its own key, so Android does not update an APK of this
// script with a Play copy, or the opposite. The tester must remove the app first.
// Each release has a bigger version code (from the version of version.ts, as `bun run play`), so a new APK updates the old one.
// ~/.config/yonder/r2.env and GH_TOKEN are the same as for `release-app`.
// Run it with `bun run release-android`. Add `--no-upload` to keep the APK local.
import { $ } from "bun";
import { homedir } from "node:os";
import { join } from "node:path";
import { version as appVersion } from "../version";

const root = join(import.meta.dir, "..");
const version = appVersion(root);
// Phones are arm64 or armv7. The x86 libraries are only for emulators and make the APK bigger.
await $`bun run android build --apk --target aarch64 --target armv7 --config ${JSON.stringify({ version })}`.cwd(root);
const apk = join(root, "android/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk");
// Android refuses an APK with no signature, and the build makes one without a signature when the key file is missing.
const sdk = process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk");
const tools = (await $`ls -d ${sdk}/build-tools/*`.text()).trim().split("\n").pop()!;
const java = process.env.JAVA_HOME ?? "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
await $`${tools}/apksigner verify ${apk}`.env({ ...process.env, JAVA_HOME: java });

if (process.argv.includes("--no-upload")) {
  console.log(apk);
} else {
  await (await import("../github-release")).upload(version, [[apk, `Yonder-${version}.apk`]]);
  // The update server (updates/state.ts) gives this version to the phones of the staging channel, and
  // download.yonder.so sends Yonder.apk and latest-android.txt to it. The phone app reads latest-android.txt to show
  // "Update available" with a link to Yonder.apk (storeUpdate in src/front.ts).
  await (await import("../updates/state")).register("android", version);
  console.log(`https://download.yonder.so/Yonder.apk is version ${version}`);
}
