// Builds Yonder for Linux, Omarchy and servers (docs/omarchy.md): for x86_64 and arm64, a tarball with the bridge as
// one binary, the window (dist/), the `yonder` command, the service and the icon. Then it puts the tarballs and the
// installer on the GitHub release of the version, behind https://download.yonder.so, as src-tauri/release.ts does for the Mac. The binary carries the README for
// about_yonder, not CLAUDE.md or the wiki (bridge/main.ts).
// Run it with `bun run release-omarchy`. Add `--no-upload` to keep the files in omarchy/out.
import { $ } from "bun";
import { join } from "node:path";
import { version as appVersion } from "../version";

const root = join(import.meta.dir, "..");
const out = join(import.meta.dir, "out");
const version = appVersion(root);
await $`rm -rf ${out}`;
await $`bun run build`.cwd(root);
for (const arch of ["x64", "arm64"]) {
  const stage = join(out, arch, "yonder");
  await $`mkdir -p ${stage}`;
  // The baseline build of x64 needs no AVX2. Some virtual servers (the kvm64 CPU of Proxmox, cheap VPS) do not have it,
  // and the default build stops there with "Illegal instruction".
  const target = arch === "x64" ? "bun-linux-x64-baseline" : `bun-linux-${arch}`;
  await $`bun build --compile --target=${target} --external @1password/sdk bridge/entry.ts --outfile ${join(stage, "yonder-bridge")}`.cwd(root);
  await $`cp -R dist ${stage}/dist`.cwd(root);
  await $`cp omarchy/yonder omarchy/yonder.service ${stage}/`.cwd(root);
  await $`cp src-tauri/icons/128x128@2x.png ${stage}/yonder.png`.cwd(root);
  // The compiled bridge has no git, so it reads its version from this file when it updates itself (bridge/main.ts).
  await Bun.write(join(stage, "version"), version);
  // No resource forks or extended attributes of macOS in the tarball, so tar on Linux reads it with no warnings.
  // GNU tar (the Linux runner of release.yml) does not know --no-mac-metadata, so only macOS gets it.
  const mac = process.platform === "darwin" ? ["--no-mac-metadata"] : [];
  await $`tar ${mac} --no-xattrs -czf ${join(out, `yonder-linux-${arch}.tar.gz`)} -C ${join(out, arch)} yonder`.env({ ...process.env, COPYFILE_DISABLE: "1" });
}
await $`cp omarchy/install.sh ${join(out, "install.sh")}`.cwd(root);
console.log(`Yonder ${version} for Linux is in ${out}`);

if (!process.argv.includes("--no-upload")) {
  // One installer with two names on download.yonder.so: install.sh for a server, omarchy.sh for the Omarchy pages.
  await (await import("../github-release")).upload(version, [
    ...["x64", "arm64"].map((arch): [string, string] => [join(out, `yonder-linux-${arch}.tar.gz`), `yonder-linux-${arch}-${version}.tar.gz`]),
    [join(out, "install.sh"), "install.sh"],
  ]);
  // The update server (updates/state.ts) gives this version to the bridges of the staging channel, and
  // download.yonder.so sends the old names and latest-linux.txt to it. It goes last, so it never names a tarball that
  // is not there yet.
  await (await import("../updates/state")).register("linux", version);
  console.log("Uploaded: curl -fsSL https://download.yonder.so/install.sh | bash");
}
