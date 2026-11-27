// Builds the Mac app for other Macs: Developer ID signature, notarization and a DMG.
// Then it puts the DMG on https://download.yonder.so/Yonder.dmg, the link on yonder.so, and the update on
// https://download.yonder.so/latest.json, which each copy that runs reads each hour and installs (main.rs).
// It does not touch /Applications/Yonder.app. `install-app` keeps the Apple Development
// signature, because a new signature makes macOS ask for each permission again.
//
// ~/.config/yonder/release.env holds the signing values:
//   APPLE_SIGNING_IDENTITY  "Developer ID Application: <name> (<team>)", from `security find-identity -v -p codesigning`
//   APPLE_API_KEY           the key ID of the App Store Connect team key
//   APPLE_API_ISSUER        the issuer ID of that key
//   APPLE_API_KEY_PATH      the .p8 file of that key
//   RELEASE_KEYCHAIN        the keychain of the Developer ID identity, and RELEASE_KEYCHAIN_PASSWORD, its password.
//                           The release unlocks it, so codesign never waits for a click on "Always Allow".
//   TAURI_SIGNING_PRIVATE_KEY  the key of the updates (`tauri signer generate`), and TAURI_SIGNING_PRIVATE_KEY_PASSWORD.
//                           Its public key is in tauri.conf.json. Keep a copy: without it, no copy can update again.
//   CF_ZONE_ID, CF_PURGE_TOKEN  the zone yonder.so and a Cloudflare API token with the permission "Zone: Cache Purge".
// ~/.config/yonder/r2.env holds the S3 credentials of the R2 bucket (an R2 API token of Cloudflare).
// Run it with `bun run release-app`. Add `--no-upload` to keep the DMG local.
import { $ } from "bun";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { version as appVersion } from "../version";

const config = join(homedir(), ".config/yonder");
const env = (name: string) =>
  Object.fromEntries(
    readFileSync(join(config, name), "utf8")
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"(.*)"$/, "$1")]),
  );

const apple = env("release.env");
for (const key of ["APPLE_SIGNING_IDENTITY", "APPLE_API_KEY", "APPLE_API_ISSUER", "APPLE_API_KEY_PATH"]) {
  if (!apple[key]) throw new Error(`${key} is missing in ~/.config/yonder/release.env`);
}
if (apple.RELEASE_KEYCHAIN) await $`security unlock-keychain -p ${apple.RELEASE_KEYCHAIN_PASSWORD} ${apple.RELEASE_KEYCHAIN}`;
const root = join(import.meta.dir, "..");
const version = appVersion(root);

// The bridge goes into the bundle as one binary (Contents/MacOS/yonder-bridge), with CLAUDE.md and the wiki in it,
// so another Mac needs no Bun and no repository. YONDER_RELEASE makes the app start it in place of bridge/main.ts.
// The app is Universal, so that it runs on Apple Silicon and on Intel Macs. Cargo builds each chip with the bridge of
// that chip, and the bundle gets the two merged by lipo. build.rs merges the Swift helpers the same way.
const bin = (triple: string) => `src-tauri/binaries/yonder-bridge-${triple}-apple-darwin`;
// The 1Password SDK stays out (`--external`): its wasm loader holds the folder of the build, and a compiled bridge
// cannot read that file on another Mac. bridge/vault.ts then says that only a bridge from the source has it.
for (const [bun, triple] of [["arm64", "aarch64"], ["x64", "x86_64"]]) {
  await $`bun build --compile --target=bun-darwin-${bun} --minify-whitespace --external @1password/sdk bridge/entry.ts --outfile ${bin(triple)}`.cwd(root);
}
await $`lipo -create ${bin("aarch64")} ${bin("x86_64")} -output ${bin("universal")}`.cwd(root);
// The helpers of tauri.conf.json and the bridge. An override replaces the whole list, so the list comes from there.
// Else a helper that is only in tauri.conf.json is not in the copies for other Macs.
const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).bundle;
const helpers = [...conf.externalBin, "binaries/yonder-bridge"];
const override = JSON.stringify({
  version,
  bundle: {
    // The screen goes to Contents/Resources/dist too. The bridge gives it to the paired phones over the air (launch_bridge
    // in main.rs). Else a phone paired with a downloaded Mac gets new screens only with a new phone app.
    resources: { ...conf.resources, "../dist/": "dist/" },
    // The update for the copies that run: Yonder.app.tar.gz and its signature, with the key of TAURI_SIGNING_PRIVATE_KEY.
    createUpdaterArtifacts: true,
    externalBin: helpers,
    macOS: { signingIdentity: apple.APPLE_SIGNING_IDENTITY },
  },
});

// Tauri signs the app and its helpers with the hardened runtime, sends it to the notary service, and staples
// the ticket to the app.
const bundle = join(root, "src-tauri/target/universal-apple-darwin/release/bundle");
const app = join(bundle, "macos/Yonder.app");
await $`bunx tauri build --target universal-apple-darwin --bundles app --config ${override}`.cwd(root).env({ ...process.env, ...apple, TAURI_APP_PATH: "src-tauri", YONDER_RELEASE: "1" });
await $`xcrun stapler validate ${app}`;
// The copy must not need this repository, and it is public. The strings of the binaries name no folder of it, and
// they do not carry the wiki or the legal name of the owner (PRIVATE_NAME in release.env). The bridge carries only
// the README. The signature holds the name of the signing identity, so PRIVATE_NAME must not be part of it.
const bins = ["yonder", ...helpers.map((h) => basename(h))].map((b) => `${app}/Contents/MacOS/${b}`);
const names = apple.PRIVATE_NAME ? ["-e", apple.PRIVATE_NAME] : [];
const leaks = await $`strings ${bins} | grep -F -e ${root} -e ${"# The wiki of Yonder"} ${names}`.nothrow().text();
if (leaks) throw new Error(`The app names this repository or carries private text:\n${leaks}`);
// Each binary must hold both chips, or the app fails on an Intel Mac.
for (const b of bins) {
  const archs = (await $`lipo -archs ${b}`.text()).trim();
  if (archs !== "x86_64 arm64") throw new Error(`${b} holds "${archs}", not both chips`);
}

// dmgbuild makes the DMG: the app, a link to /Applications, and the window with the background of
// src-tauri/dmg. The DMG of Tauri needs Finder, and it fails in a background job of Claude Code.
// dmgbuild writes the .DS_Store of the window itself.
const dmg = join(bundle, `Yonder_${version}.dmg`);
await $`uvx dmgbuild -s settings.py -D app=${app} Yonder ${dmg}`.cwd(join(root, "src-tauri/dmg"));
// The DMG needs its own signature and ticket. Without them, Safari's quarantine makes Gatekeeper
// check the DMG on its first open, and that check needs a network connection.
await $`codesign --force --timestamp --sign ${apple.APPLE_SIGNING_IDENTITY} ${dmg}`;
await $`xcrun notarytool submit ${dmg} --key ${apple.APPLE_API_KEY_PATH} --key-id ${apple.APPLE_API_KEY} --issuer ${apple.APPLE_API_ISSUER} --wait`;
await $`xcrun stapler staple ${dmg}`;
await $`spctl --assess --type open --context context:primary-signature -vv ${dmg}`;

if (process.argv.includes("--no-upload")) {
  console.log(dmg);
} else {
  await (await import("../github-release")).upload(version, [[dmg, `Yonder-${version}.dmg`], [`${app}.tar.gz`, `Yonder-${version}.app.tar.gz`]]);
  const r2 = env("r2.env");
  const s3 = new Bun.S3Client({ bucket: r2.R2_BUCKET, endpoint: r2.R2_ENDPOINT_URL, accessKeyId: r2.R2_ACCESS_KEY_ID, secretAccessKey: r2.R2_SECRET_ACCESS_KEY, retry: 10 }); // R2 can give 502 and 504 errors past the 3 retries of Bun.
  const type = "application/x-apple-diskimage";
  // Each version stays at its own name, and Yonder.dmg is the newest.
  await s3.write(`Yonder-${version}.dmg`, Bun.file(dmg), { type });
  await s3.write("Yonder.dmg", Bun.file(dmg), { type, contentDisposition: 'attachment; filename="Yonder.dmg"' });
  // latest.json goes after the archive that it names, so that a copy never reads a version that is not there yet.
  const archive = `${app}.tar.gz`;
  await s3.write(`Yonder-${version}.app.tar.gz`, Bun.file(archive), { type: "application/gzip" });
  const url = `https://download.yonder.so/Yonder-${version}.app.tar.gz`;
  // The one Universal archive is the update for both chips.
  const update = { signature: readFileSync(`${archive}.sig`, "utf8"), url };
  const latest = { version, pub_date: new Date().toISOString(), platforms: { "darwin-aarch64": update, "darwin-x86_64": update } };
  await s3.write("latest.json", JSON.stringify(latest), { type: "application/json" });
  // The update server (updates/state.ts) gives this version to the copies of the staging channel, with its signature.
  const { register, registerMac } = await import("../updates/state");
  await registerMac(version, update.signature);
  await register("mac", version);
  // Browsers must ask again for the two names that change. Without "no-cache", Chrome gives the old Yonder.dmg from
  // its cache. Bun's S3 client sets no Cache-Control, so the aws CLI copies each object onto itself.
  const aws = { ...process.env, AWS_ACCESS_KEY_ID: r2.R2_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: r2.R2_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION: "auto" };
  for (const [key, keyType, disposition] of [["Yonder.dmg", type, 'attachment; filename="Yonder.dmg"'], ["latest.json", "application/json", "inline"]]) {
    await $`aws s3api copy-object --endpoint-url ${r2.R2_ENDPOINT_URL} --bucket ${r2.R2_BUCKET} --key ${key} --copy-source ${`${r2.R2_BUCKET}/${key}`} --metadata-directive REPLACE --content-type ${keyType} --content-disposition ${disposition} --cache-control no-cache`.env(aws).quiet();
  }
  // The edge of Cloudflare keeps Yonder.dmg for hours. The purge gives the next visitor this version.
  const purge = await fetch(`https://api.cloudflare.com/client/v4/zones/${apple.CF_ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: { authorization: `Bearer ${apple.CF_PURGE_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ files: ["https://download.yonder.so/Yonder.dmg", "https://download.yonder.so/latest.json"] }),
  }).then((r) => r.json(), () => undefined);
  if (!purge?.success) console.warn("The purge of the cache failed, so Yonder.dmg can stay old for some hours.");
  console.log(`https://download.yonder.so/Yonder.dmg and latest.json are version ${version}`);
}
