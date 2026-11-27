// Builds Yonder for Windows (docs/wiki/windows.md): a zip with the bridge as one program, the window (dist/), the
// yonder command and the icon. Then it puts the zip and the installer on the GitHub release of the version, behind
// https://download.yonder.so, as omarchy/release.ts does for Linux. The x64 build also runs on Windows on Arm, through its emulation.
// Run it with `bun run release-windows`. Add `--no-upload` to keep the files in windows/out.
import { $ } from "bun";
import { join } from "node:path";
import { version as appVersion } from "../version";

const root = join(import.meta.dir, "..");
const out = join(import.meta.dir, "out");
const stage = join(out, "yonder");
const zip = join(out, "yonder-windows-x64.zip");
const version = appVersion(root);
await $`rm -rf ${out}`;
await $`bun run build`.cwd(root);
await $`mkdir -p ${stage}/bin`;
// The baseline build needs no AVX2, as on Linux, so it also runs on old computers and in the emulation of Windows on Arm.
await $`bun build --compile --target=bun-windows-x64-baseline --external @1password/sdk bridge/entry.ts --outfile ${join(stage, "yonder-bridge.exe")}`.cwd(root);
await $`cp -R dist ${stage}/dist`.cwd(root);
await $`cp windows/yonder.ps1 windows/yonder.ico ${stage}/`.cwd(root);
await $`cp windows/yonder.cmd ${stage}/bin/`.cwd(root);
// The compiled bridge has no git, so it reads its version from this file when it updates itself (bridge/main.ts).
await Bun.write(join(stage, "version"), version);
await $`zip -qrX ${zip} yonder`.cwd(out);
await $`cp windows/install.ps1 ${join(out, "install.ps1")}`.cwd(root);
console.log(`Yonder ${version} for Windows is in ${out}`);

if (!process.argv.includes("--no-upload")) {
  await (await import("../github-release")).upload(version, [[zip, `yonder-windows-x64-${version}.zip`], [join(out, "install.ps1"), "install.ps1"]]);
  // The update server (updates/state.ts) gives this version to the bridges of the staging channel, and
  // download.yonder.so sends the old names and latest-windows.txt to it. It goes last, so it never names a zip that is
  // not there yet.
  await (await import("../updates/state")).register("windows", version);
  console.log("Uploaded: irm https://download.yonder.so/install.ps1 | iex");
}
