// The state of the update server: updates/state.json in the bucket of download.yonder.so, which updates.yonder.so
// reads on each request (worker.ts). The release scripts register each new version (register), and these commands
// change the rollout. They change only the state, never a file of a release:
//   bun run rollout <channel> <platform|all> <percent>   the share of the installs that get the new version
//   bun run halt <channel>                               the stop switch: each install gets the version before
//   bun run resume <channel>                             the rollout goes on
//   bun run rollback <channel> <platform|all>            the version before goes back to each install
//   bun run release-status                               the state of each channel
// See "Update server" in docs/wiki.md.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import CHANNEL from "../channel.json";
import { PLATFORMS, type Platform, type State } from "./pick";

const KEY = "updates/state.json";
const r2 = Object.fromEntries(
  readFileSync(join(homedir(), ".config/yonder/r2.env"), "utf8")
    .split("\n")
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"(.*)"$/, "$1")]),
);
export const s3 = new Bun.S3Client({ bucket: r2.R2_BUCKET, endpoint: r2.R2_ENDPOINT_URL, accessKeyId: r2.R2_ACCESS_KEY_ID, secretAccessKey: r2.R2_SECRET_ACCESS_KEY });

export const read = async (): Promise<State> => (await s3.file(KEY).exists() ? s3.file(KEY).json() : {});
// shortcut: read, change, write with no lock. Safe while the runner releases one platform at a time; use a
// conditional put with the ETag if two writers can overlap.
const write = (state: State) => s3.write(KEY, JSON.stringify(state, null, 2), { type: "application/json" });

// A new release of one platform. A second run of the same version keeps the rollout as it is.
// shortcut: the version before is the version out at that moment, also a halted bad one; a rollback then goes to it.
// Keep a "last good" version in the feed if releases often follow a halt.
export async function register(platform: Platform, version: string, channel = CHANNEL.channel, percent = 100) {
  const state = await read();
  const feed = state[channel]?.[platform];
  if (feed?.version === version) return;
  (state[channel] ??= {})[platform] = { version, previous: feed?.version, percent, min: feed?.min };
  await write(state);
  console.log(`${channel} ${platform}: ${version} for ${percent}%`);
}

// The signature of a Mac update, which the server puts in the JSON of the Tauri updater.
export const registerMac = (version: string, signature: string) =>
  s3.write(`updates/mac/${version}.json`, JSON.stringify({ signature, pub_date: new Date().toISOString() }), { type: "application/json" });

async function change(channel: string, which: string, edit: (platform: Platform, feed: NonNullable<State[string][Platform]>) => void) {
  const state = await read();
  const feeds = state[channel];
  if (!feeds) throw new Error(`The channel ${channel} has no release.`);
  const platforms = which === "all" ? PLATFORMS.filter((p) => feeds[p]) : [which as Platform];
  for (const p of platforms) {
    const feed = feeds[p];
    if (!feed) throw new Error(`${channel} has no ${p} release.`);
    edit(p, feed);
  }
  await write(state);
  status(state, channel);
}

function status(state: State, only?: string) {
  for (const [channel, feeds] of Object.entries(state)) {
    if (only && channel !== only) continue;
    for (const [p, f] of Object.entries(feeds)) {
      const notes = [f.halted && "halted", f.rollback && "rollback", f.min && `min ${f.min}`].filter(Boolean).join(", ");
      console.log(`${channel.padEnd(10)} ${p.padEnd(8)} ${f.version.padEnd(10)} ${String(f.percent).padStart(3)}%  before ${f.previous ?? "-"}${notes ? `  (${notes})` : ""}`);
    }
  }
}

if (import.meta.main) try {
  const [command, channel = "", which = "", value = ""] = process.argv.slice(2);
  if (command === "status") status(await read());
  else if (command === "rollout") {
    const percent = Number(value);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error("The percent is a whole number from 0 to 100.");
    await change(channel, which, (_, f) => (f.percent = percent));
  } else if (command === "halt" || command === "resume") await change(channel, "all", (_, f) => (f.halted = command === "halt"));
  else if (command === "rollback") {
    await change(channel, which, (p, f) => {
      // Android refuses an APK with a lower version code, so its stop switch is halt.
      if (p === "android") {
        if (which !== "all") throw new Error("Android cannot go back to an older APK. Use `bun run halt` for Android.");
        return console.log("android: no rollback, because an APK cannot go back. Use `bun run halt`.");
      }
      if (!f.previous) throw new Error(`${channel} ${p} has no version before ${f.version}.`);
      Object.assign(f, { version: f.previous, previous: f.version, percent: 100, halted: false, rollback: true });
    });
  } else {
    console.log("Commands: rollout <channel> <platform|all> <percent>, halt <channel>, resume <channel>, rollback <channel> <platform|all>, status");
    process.exit(1);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
