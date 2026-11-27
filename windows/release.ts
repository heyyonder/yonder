// Builds Yonder for Windows (docs/wiki/windows.md): a zip with the bridge as one program, the window (dist/), the
// yonder command and the icon. Then it puts the zip and the installer on https://download.yonder.so, as
// omarchy/release.ts does for Linux. The x64 build also runs on Windows on Arm, through its emulation.
// Run it with `bun run release-windows`. Add `--no-upload` to keep the files in windows/out.
import { $ } from "bun";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
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
  const env = (name: string) =>
    Object.fromEntries(
      readFileSync(join(homedir(), ".config/yonder", name), "utf8")
        .split("\n")
        .filter((line) => /^[A-Z0-9_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"(.*)"$/, "$1")]),
    );
  const r2 = env("r2.env");
  const s3 = new Bun.S3Client({ bucket: r2.R2_BUCKET, endpoint: r2.R2_ENDPOINT_URL, accessKeyId: r2.R2_ACCESS_KEY_ID, secretAccessKey: r2.R2_SECRET_ACCESS_KEY, retry: 10 }); // R2 can give 502 and 504 errors past the 3 retries of Bun.
  await s3.write(`yonder-windows-x64-${version}.zip`, Bun.file(zip), { type: "application/zip" });
  await s3.write("yonder-windows-x64.zip", Bun.file(zip), { type: "application/zip" });
  await s3.write("install.ps1", Bun.file(join(out, "install.ps1")), { type: "text/plain; charset=utf-8" });
  // The version that each Windows bridge reads each hour to update itself. It goes up last, so it never names a zip
  // that is not there yet.
  await s3.write("latest-windows.txt", version, { type: "text/plain; charset=utf-8" });
  // The update server (updates/state.ts) gives this version to the bridges of the staging channel.
  await (await import("../updates/state")).register("windows", version);
  const cf = env("release.env");
  const purge = await fetch(`https://api.cloudflare.com/client/v4/zones/${cf.CF_ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: { authorization: `Bearer ${cf.CF_PURGE_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ files: ["yonder-windows-x64.zip", "install.ps1", "latest-windows.txt"].map((f) => `https://download.yonder.so/${f}`) }),
  }).then((r) => r.json(), () => undefined);
  if (!purge?.success) console.warn("The purge of the cache failed, so the files can stay old for some hours.");
  console.log("Uploaded: irm https://download.yonder.so/install.ps1 | iex");
}
