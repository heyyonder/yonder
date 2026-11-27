// The files of each version go to the release v<version> of the public repository, as a pre-release (staging).
// promote.yml makes it a full release, so releases/latest is the newest production version. download.yonder.so sends
// each download there (updates/worker.ts). GH_TOKEN must be a token with write access to the contents of the
// repository (PUBLIC_REPO_TOKEN in release.yml), so the release never carries the login of this computer.
import { $ } from "bun";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const REPO = "heyyonder/yonder";

// files: [local path, public name]. GitHub names an asset by its file name, so each file gets a link with its public name.
export async function upload(version: string, files: [string, string][]) {
  if (!process.env.GH_TOKEN) throw new Error("GH_TOKEN is not set: give it a token with write access to the contents of heyyonder/yonder.");
  const tag = `v${version}`;
  // The tag goes on this commit, not on the newest commit of main.
  if ((await $`gh release view ${tag} --repo ${REPO}`.quiet().nothrow()).exitCode !== 0) {
    const sha = (await $`git rev-parse HEAD`.text()).trim();
    await $`gh release create ${tag} --repo ${REPO} --target ${sha} --prerelease --title ${tag} --notes ${""}`;
  }
  const dir = mkdtempSync(join(tmpdir(), "yonder-release-"));
  const paths = files.map(([file, name]) => (symlinkSync(file, join(dir, name)), join(dir, name)));
  for (let i = 1; ; i++) {
    const r = await $`gh release upload ${tag} ${paths} --repo ${REPO} --clobber`.nothrow();
    if (r.exitCode === 0) break;
    if (i === 3) throw new Error(`The upload to the release ${tag} failed 3 times.`);
  }
  console.log(`https://github.com/${REPO}/releases/tag/${tag}`);
}
