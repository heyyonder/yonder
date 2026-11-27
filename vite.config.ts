import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { needs, version } from "./version";

// The build ID is the version "2.B.N" of version.ts, so that each commit gives a new ID.
// The tooltip gives the commit hash and the local build time.
let commit = "nogit";
let buildId = "1.0.0";
let native = {};
try {
  commit = execSync("git rev-parse HEAD").toString().trim();
  buildId = version();
  native = needs();
} catch {}
const time = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
// The project in Sentry that gets the errors of the screen: SENTRY_DSN, else the one of ~/.config/yonder/.env. Only the
// release workflows and the computers of the maintainers have it, so a build from source sends nothing.
let sentryDsn = process.env.SENTRY_DSN || "";
try {
  sentryDsn ||= /^SENTRY_DSN=(.+)$/m.exec(readFileSync(join(homedir(), ".config/yonder/.env"), "utf8"))?.[1].trim() ?? "";
} catch {}
const buildInfo = `commit ${commit.slice(0, 7)}, built ${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;

// Port 1420 is the dev origin that the bridge allows.
export default defineConfig({
  plugins: [
    react(),
    // The bridge reads the build of dist/ from build.txt, so that the apps load a new front end (src/front.ts).
    // needs.json: the phone app that this screen needs (`needs` in version.ts). commit.txt: the commit of the build, so
    // the bridge builds again only when the screen changed (`buildFront` in bridge/main.ts). code.txt: a hash of the JS
    // with no build ID and no build time, so a build with only new CSS swaps its CSS in the running page (src/front.ts).
    {
      name: "build-id",
      generateBundle(_, bundle) {
        const js = Object.values(bundle).flatMap((b) => (b.type === "chunk" ? [b.code] : [])).join("\n");
        const code = createHash("sha256").update(js.replaceAll(buildId, "").replaceAll(buildInfo, "")).digest("hex").slice(0, 16);
        this.emitFile({ type: "asset", fileName: "build.txt", source: buildId });
        this.emitFile({ type: "asset", fileName: "needs.json", source: JSON.stringify(native) });
        this.emitFile({ type: "asset", fileName: "commit.txt", source: commit });
        this.emitFile({ type: "asset", fileName: "code.txt", source: code });
      },
    },
    // The source maps go to Sentry with the build ID as the release, so an error names the line in src/. Then they leave
    // dist/, so the bridge does not serve them. Only a build with SENTRY_DSN uploads, because only it sends errors.
    // sentry-cli reads the org, the project and the token from SENTRY_ORG, SENTRY_PROJECT and SENTRY_AUTH_TOKEN, or from
    // ~/.sentryclirc. A build with no sentry-cli, no token or no network still works.
    {
      name: "sentry-sourcemaps",
      apply: "build",
      writeBundle({ dir }) {
        if (!dir) return;
        const cli = `sentry-cli --log-level=error sourcemaps`;
        if (sentryDsn) try {
          execSync(`${cli} inject '${dir}' && ${cli} upload --release '${buildId}' '${dir}'`, { stdio: "ignore", timeout: 60_000, env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin` } });
        } catch {}
        execSync(`find '${dir}' -name '*.map' -delete`);
      },
    },
  ],
  build: { sourcemap: "hidden" },
  define: { __BUILD_ID__: JSON.stringify(buildId), __BUILD_INFO__: JSON.stringify(buildInfo), __SENTRY_DSN__: JSON.stringify(sentryDsn) },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
