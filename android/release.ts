// Builds the signed release APK of the Android app for testers, and puts it on https://download.yonder.so/Yonder.apk,
// the Android link of yonder.so. A tester installs it from the browser, with no Google Play.
// The APK has the signature of the upload key (~/.config/yonder/android-upload.properties, read by
// app/build.gradle.kts). Google Play signs its copy with its own key, so Android does not update an APK of this
// script with a Play copy, or the opposite. The tester must remove the app first.
// Each release has a bigger version code (from the version of version.ts, as `bun run play`), so a new APK updates the old one.
// ~/.config/yonder/r2.env and the CF_ values of ~/.config/yonder/release.env are the same as for `release-app`.
// Run it with `bun run release-android`. Add `--no-upload` to keep the APK local.
import { $ } from "bun";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { version as appVersion } from "../version";

const config = join(homedir(), ".config/yonder");
const env = (name: string) =>
  Object.fromEntries(
    readFileSync(join(config, name), "utf8")
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"(.*)"$/, "$1")]),
  );

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
  const r2 = env("r2.env");
  const cf = env("release.env");
  const s3 = new Bun.S3Client({ bucket: r2.R2_BUCKET, endpoint: r2.R2_ENDPOINT_URL, accessKeyId: r2.R2_ACCESS_KEY_ID, secretAccessKey: r2.R2_SECRET_ACCESS_KEY, retry: 10 }); // R2 can give 502 and 504 errors past the 3 retries of Bun.
  const type = "application/vnd.android.package-archive";
  // Each version stays at its own name, and Yonder.apk is the newest.
  await s3.write(`Yonder-${version}.apk`, Bun.file(apk), { type });
  // Bun's S3 client sets no Cache-Control, so the aws CLI writes Yonder.apk with "no-cache", as release.ts does.
  const aws = { ...process.env, AWS_ACCESS_KEY_ID: r2.R2_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: r2.R2_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION: "auto" };
  await $`aws s3api copy-object --endpoint-url ${r2.R2_ENDPOINT_URL} --bucket ${r2.R2_BUCKET} --key Yonder.apk --copy-source ${`${r2.R2_BUCKET}/Yonder-${version}.apk`} --metadata-directive REPLACE --content-type ${type} --content-disposition ${'attachment; filename="Yonder.apk"'} --cache-control no-cache`.env(aws).quiet();
  // The version that the phone app reads to show "Update available" with a link to Yonder.apk (storeUpdate in
  // src/front.ts). It goes up last, so it never names an APK that is not there yet.
  await s3.write("latest-android.txt", version, { type: "text/plain; charset=utf-8" });
  // The update server (updates/state.ts) gives this version to the phones of the staging channel.
  await (await import("../updates/state")).register("android", version);
  const purge = await fetch(`https://api.cloudflare.com/client/v4/zones/${cf.CF_ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: { authorization: `Bearer ${cf.CF_PURGE_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ files: ["Yonder.apk", "latest-android.txt"].map((f) => `https://download.yonder.so/${f}`) }),
  }).then((r) => r.json(), () => undefined);
  if (!purge?.success) console.warn("The purge of the cache failed, so Yonder.apk can stay old for some hours.");
  console.log(`https://download.yonder.so/Yonder.apk is version ${version}`);
}
