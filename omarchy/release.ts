// Builds Yonder for Linux, Omarchy and servers (docs/omarchy.md): for x86_64 and arm64, a tarball with the bridge as
// one binary, the window (dist/), the `yonder` command, the service and the icon. Then it puts the tarballs and the
// installer on https://download.yonder.so, as src-tauri/release.ts does for the Mac. The binary carries the README for
// about_yonder, not CLAUDE.md or the wiki (bridge/main.ts).
// Run it with `bun run release-omarchy`. Add `--no-upload` to keep the files in omarchy/out.
import { $ } from "bun";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
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
  const env = (name: string) =>
    Object.fromEntries(
      readFileSync(join(homedir(), ".config/yonder", name), "utf8")
        .split("\n")
        .filter((line) => /^[A-Z0-9_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"(.*)"$/, "$1")]),
    );
  const r2 = env("r2.env");
  const s3 = new Bun.S3Client({ bucket: r2.R2_BUCKET, endpoint: r2.R2_ENDPOINT_URL, accessKeyId: r2.R2_ACCESS_KEY_ID, secretAccessKey: r2.R2_SECRET_ACCESS_KEY, retry: 10 }); // R2 can give 502 and 504 errors past the 3 retries of Bun.
  for (const arch of ["x64", "arm64"]) {
    const file = Bun.file(join(out, `yonder-linux-${arch}.tar.gz`));
    await s3.write(`yonder-linux-${arch}-${version}.tar.gz`, file, { type: "application/gzip" });
    await s3.write(`yonder-linux-${arch}.tar.gz`, file, { type: "application/gzip" });
  }
  // One installer with two names: install.sh for a server, omarchy.sh for the Omarchy pages.
  for (const name of ["install.sh", "omarchy.sh"])
    await s3.write(name, Bun.file(join(out, "install.sh")), { type: "text/plain; charset=utf-8" });
  // The version that each Linux bridge reads each hour to update itself. It goes up last, so it never names a
  // tarball that is not there yet.
  await s3.write("latest-linux.txt", version, { type: "text/plain; charset=utf-8" });
  // The update server (updates/state.ts) gives this version to the bridges of the staging channel.
  await (await import("../updates/state")).register("linux", version);
  // The edge of Cloudflare keeps the files for hours, so `yonder update` on a server can get the old bridge from the
  // cache. The purge gives the next install this version, as src-tauri/release.ts does for Yonder.dmg.
  const cf = env("release.env");
  const purge = await fetch(`https://api.cloudflare.com/client/v4/zones/${cf.CF_ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: { authorization: `Bearer ${cf.CF_PURGE_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      files: ["yonder-linux-x64.tar.gz", "yonder-linux-arm64.tar.gz", "install.sh", "omarchy.sh", "latest-linux.txt"].map((f) => `https://download.yonder.so/${f}`),
    }),
  }).then((r) => r.json(), () => undefined);
  if (!purge?.success) console.warn("The purge of the cache failed, so the files can stay old for some hours.");
  console.log("Uploaded: curl -fsSL https://download.yonder.so/install.sh | bash");
}
