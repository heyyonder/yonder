// The promotion of a staging version to production: `bun run promote [version] [--dry-run]`, and the workflow
// promote.yml. Production is the public release: the App Store, Google Play, and the production channel of the update
// server for the Mac, Linux and Windows copies. The steps, in order:
//   1. The version must be a released staging version: its tag v<version> exists (the tag job of release.yml).
//   2. `bun run health <version>` must pass (health.ts, Sentry).
//   3. The update server: the production channel of mac, linux and windows gets the version for 10% of the installs.
//      Widen it later with `bun run rollout production all 50`, then 100.
//   4. The App Store: the editable App Store version gets the version of the newest TestFlight build at or under the
//      version, the build, the phased release of 7 days, and a submission for review. An approved version that waits for
//      its release (PENDING_DEVELOPER_RELEASE) is released first. The release after the next approval
//      stays manual (the setting of the version in App Store Connect).
//   5. Google Play: the bundle of the version goes to the production track, for 10% of the users. It needs a service
//      account: GOOGLE_PLAY_KEY (the JSON, or its base64) or ~/.config/yonder/google-play.json.
// --ios does only step 4, for a release of the iPhone app alone.
// --dry-run sends only the reads (GET), and prints each change that it does not send. A failed step does not stop the
// steps after it, except the version and the health check, and the command then exits with 1.
// See "Production" in docs/wiki/install.md.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { version as headVersion } from "./version";

const root = import.meta.dir;
const dry = process.argv.includes("--dry-run");
const iosOnly = process.argv.includes("--ios");
const version = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? headVersion(root);
const START = 10; // the percent of the first day, on the update server and on Google Play
const APP_ID = "6818920603"; // the app in App Store Connect
const PACKAGE = "so.yonder";
const config = join(homedir(), ".config/yonder");

const env = (file: string) =>
  Object.fromEntries(
    readFileSync(join(config, file), "utf8")
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"(.*)"$/, "$1")]),
  );
const num = (v: string) => v.split(".").map(Number);
const older = (a: string, b: string) => {
  const [x, y] = [num(a), num(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};
const b64u = (data: string | ArrayBuffer) => Buffer.from(data as ArrayBuffer).toString("base64url");

// A signed token (JWT) for App Store Connect (ES256) or Google (RS256). WebCrypto signs ECDSA as r||s, which JWT wants.
async function jwt(alg: "ES256" | "RS256", pem: string, header: object, claims: object) {
  const der = Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ""), "base64");
  const algo = alg === "ES256" ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  const key = await crypto.subtle.importKey("pkcs8", der, algo, false, ["sign"]);
  const data = `${b64u(JSON.stringify({ alg, typ: "JWT", ...header }))}.${b64u(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign(alg === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  return `${data}.${b64u(sig)}`;
}

// One HTTP call. A dry run sends a GET, and prints any other call with its body.
async function call(token: string, method: string, url: string, body?: unknown, raw?: Blob) {
  if (dry && method !== "GET") {
    console.log(`  would ${method} ${url}${body ? ` ${JSON.stringify(body)}` : raw ? ` (${raw.size} bytes)` : ""}`);
    return { data: { id: "<new>" }, id: "<new>" };
  }
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": raw ? "application/octet-stream" : "application/json" },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function updateServer() {
  const { register, s3 } = await import("./updates/state");
  if (!(await s3.file(`updates/mac/${version}.json`).exists())) throw new Error(`The update server has no Mac signature of ${version}.`);
  for (const p of ["mac", "linux", "windows"] as const) {
    if (dry) console.log(`  would set production ${p} to ${version} for ${START}%`);
    else await register(p, version, "production", START);
  }
}

async function appStore() {
  const r = env("release.env");
  const now = Math.floor(Date.now() / 1000);
  const token = await jwt("ES256", readFileSync(r.APPLE_API_KEY_PATH, "utf8"), { kid: r.APPLE_API_KEY }, { iss: r.APPLE_API_ISSUER, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" });
  const api = (method: string, path: string, body?: unknown) => call(token, method, `https://api.appstoreconnect.apple.com/v1/${path}`, body);

  // The iPhone app builds only when ios/ changes, so the newest TestFlight build at or under the version is its app.
  type Build = { id: string; attributes: { version: string; expired: boolean } };
  const builds: Build[] = (await api("GET", `builds?filter[app]=${APP_ID}&filter[processingState]=VALID&filter[expired]=false&sort=-uploadedDate&limit=50`)).data;
  const build = builds.filter((b) => !older(version, b.attributes.version)).sort((a, b) => (older(a.attributes.version, b.attributes.version) ? 1 : -1))[0];
  if (!build) throw new Error(`TestFlight has no build at or under ${version}.`);
  const ios = build.attributes.version;
  console.log(`  the TestFlight build ${ios}`);

  // App Store Connect attaches only a build with the same version, so the editable version takes the version of the build.
  type Version = { id: string; attributes: { versionString: string; appStoreState: string } };
  const list = async (): Promise<Version[]> => (await api("GET", `apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`)).data;
  let versions = await list();
  // A promotion is a public release, so an approved version that waits for its release goes out first.
  const approved = versions.find((v) => v.attributes.appStoreState === "PENDING_DEVELOPER_RELEASE");
  if (approved) {
    await api("POST", "appStoreVersionReleaseRequests", { data: { type: "appStoreVersionReleaseRequests", relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: approved.id } } } } });
    console.log(`  released the approved App Store version ${approved.attributes.versionString}`);
    for (let i = 0; i < 30 && !dry; i++) {
      versions = await list();
      if (!versions.some((v) => ["PENDING_DEVELOPER_RELEASE", "PROCESSING_FOR_APP_STORE"].includes(v.attributes.appStoreState))) break;
      await Bun.sleep(10_000);
    }
    if (dry) versions = versions.filter((v) => v !== approved);
  }
  const busy = versions.find((v) => ["WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE", "PROCESSING_FOR_APP_STORE"].includes(v.attributes.appStoreState));
  if (busy) throw new Error(`The App Store version ${busy.attributes.versionString} is ${busy.attributes.appStoreState}. Wait for it, or remove it in App Store Connect.`);
  // READY_FOR_REVIEW: the version is in a draft submission, for example with subscriptions. The
  // submission then sends the subscriptions with it.
  const editable = versions.find((v) => ["PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"].includes(v.attributes.appStoreState));
  let id = editable?.id;
  if (!editable) id = (await api("POST", "appStoreVersions", { data: { type: "appStoreVersions", attributes: { platform: "IOS", versionString: ios }, relationships: { app: { data: { type: "apps", id: APP_ID } } } } })).data.id;
  else if (editable.attributes.versionString !== ios) await api("PATCH", `appStoreVersions/${id}`, { data: { type: "appStoreVersions", id, attributes: { versionString: ios } } });
  console.log(`  the App Store version ${editable ? `${editable.attributes.versionString} (${editable.attributes.appStoreState})` : "is new"} becomes ${ios}`);
  await api("PATCH", `appStoreVersions/${id}/relationships/build`, { data: { type: "builds", id: build.id } });
  // Apple refuses the review of an update with no "What's New" (whatsNew).
  type Loc = { id: string; attributes: { whatsNew: string | null } };
  const locs: Loc[] = dry && !editable ? [] : (await api("GET", `appStoreVersions/${id}/appStoreVersionLocalizations`)).data;
  for (const l of locs.filter((l) => !l.attributes.whatsNew?.trim()))
    await api("PATCH", `appStoreVersionLocalizations/${l.id}`, { data: { type: "appStoreVersionLocalizations", id: l.id, attributes: { whatsNew: "Fixes and small improvements." } } });

  // The phased release: Apple gives the update to more users each day for 7 days, after the release.
  const phased = editable && (await api("GET", `appStoreVersions/${id}/appStoreVersionPhasedRelease`)).data;
  if (!phased) await api("POST", "appStoreVersionPhasedReleases", { data: { type: "appStoreVersionPhasedReleases", attributes: { phasedReleaseState: "INACTIVE" }, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id } } } } });

  // A submission that waits (a draft) is used again, because the app can have only one.
  const open = (await api("GET", `reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES`)).data[0];
  const submission = open?.id ?? (await api("POST", "reviewSubmissions", { data: { type: "reviewSubmissions", attributes: { platform: "IOS" }, relationships: { app: { data: { type: "apps", id: APP_ID } } } } })).data.id;
  const items: { relationships?: { appStoreVersion?: { data?: { id: string } } } }[] = open ? (await api("GET", `reviewSubmissions/${submission}/items?include=appStoreVersion`)).data : [];
  if (!items.some((i) => i.relationships?.appStoreVersion?.data?.id === id))
    await api("POST", "reviewSubmissionItems", { data: { type: "reviewSubmissionItems", relationships: { reviewSubmission: { data: { type: "reviewSubmissions", id: submission } }, appStoreVersion: { data: { type: "appStoreVersions", id } } } } });
  await api("PATCH", `reviewSubmissions/${submission}`, { data: { type: "reviewSubmissions", id: submission, attributes: { submitted: true } } });
}

async function googlePlay() {
  const file = join(config, "google-play.json");
  const raw = process.env.GOOGLE_PLAY_KEY?.trim() || (existsSync(file) ? readFileSync(file, "utf8") : "");
  if (!raw)
    throw new Error(
      "No Google Play service account. In Google Cloud, make a service account with a JSON key, invite its email in the Play Console " +
        "(Users and permissions) with the release permissions for Yonder, and save the key as ~/.config/yonder/google-play.json.",
    );
  const key = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString());
  const now = Math.floor(Date.now() / 1000);
  const assertion = await jwt("RS256", key.private_key, {}, { iss: key.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: key.token_uri, iat: now, exp: now + 600 });
  const grant = await fetch(key.token_uri, { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!grant.ok) throw new Error(`Google did not give a token: ${grant.status} ${await grant.text()}`);
  const token: string = (await grant.json()).access_token;

  // The bundle of this version. Its version code comes from the version (tauri: major * 1000000 + minor * 1000 + patch).
  const [major, minor, patch] = num(version);
  const code = String(major * 1_000_000 + minor * 1000 + patch);
  const aab = join(root, "android/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab");
  if (dry) console.log(`  would build the bundle of ${version} (bun run play), version code ${code}`);
  else {
    if (headVersion(root) !== version) throw new Error(`This checkout is ${headVersion(root)}, not ${version}. Run the Promote workflow, or check out v${version} first.`);
    execFileSync("bun", ["run", "play"], { cwd: root, stdio: "inherit" });
  }
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/edits`;
  const edit = (await call(token, "POST", base)).id;
  await call(token, "POST", `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}/edits/${edit}/bundles?uploadType=media`, undefined, dry ? new Blob([]) : Bun.file(aab));
  await call(token, "PUT", `${base}/${edit}/tracks/production`, { track: "production", releases: [{ name: version, versionCodes: [code], status: "inProgress", userFraction: START / 100 }] });
  await call(token, "POST", `${base}/${edit}:commit`);
}

console.log(`Promote ${version} to production${dry ? " (dry run: no change is sent)" : ""}.`);
const tagged = Bun.spawnSync(["git", "rev-parse", "-q", "--verify", `refs/tags/v${version}`], { cwd: root }).success;
if (!tagged) {
  console.error(`${version} is not a released staging version: the tag v${version} does not exist. Release it to staging first (git fetch --tags if it is on GitHub only).`);
  if (!dry) process.exit(1);
  console.log("  a real promotion stops here.");
}
const health = Bun.spawnSync(["bun", "health.ts", version], { cwd: root, stdout: "inherit", stderr: "inherit" });
if (!health.success) {
  if (!dry) {
    console.error("The health check failed, so the promotion stops.");
    process.exit(1);
  }
  console.log("  the health check failed: a real promotion stops here.");
}
let failed = false;
const steps = [["The update server", updateServer], ["The App Store", appStore], ["Google Play", googlePlay]] as const;
for (const [name, step] of steps.filter(([n]) => !iosOnly || n === "The App Store")) {
  console.log(`${name}:`);
  try {
    await step();
    console.log(`  ${dry ? "checked" : "done"}`);
  } catch (e) {
    failed = true;
    console.error(`  failed: ${(e as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
