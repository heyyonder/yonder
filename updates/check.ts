// The free check of the rules of the update server (pick.ts): `bun updates/check.ts`. No network.
import { accept, bucket, pick, text, type Feed } from "./pick";
import { FIRST, link, resolve } from "./worker";

let failed = 0;
const ok = (cond: boolean, name: string) => (console.log(`${cond ? "ok" : "FAILED"}: ${name}`), cond || failed++);
const feed = (f: Partial<Feed>): Feed => ({ version: "2.83.430", previous: "2.82.425", percent: 100, ...f });

// The bucket must never change for an ID, or a slow rollout moves installs in and out. FNV-1a of "a" is 0xe40c292c.
ok(bucket("a") === 20 && bucket("install-1") === 90 && bucket("") === 99 && bucket(null) === 99, "the bucket of an ID is fixed, and no ID is bucket 99");
const ids = Array.from({ length: 10_000 }, (_, i) => `id-${i}`);
const share = ids.filter((id) => bucket(id) < 10).length / ids.length;
ok(share > 0.08 && share < 0.12, `about 10% of the installs are under 10% (${(share * 100).toFixed(1)}%)`);

ok(pick(feed({}), "x")?.version === "2.83.430", "100%: each install gets the new version");
ok(pick(feed({ percent: 0 }), "x")?.version === "2.82.425", "0%: each install gets the version before");
const inside = ids.find((id) => bucket(id) < 10)!;
const outside = ids.find((id) => bucket(id) >= 10)!;
ok(pick(feed({ percent: 10 }), inside)?.version === "2.83.430" && pick(feed({ percent: 10 }), outside)?.version === "2.82.425", "10%: only the installs under the percent get the new version");
ok(pick(feed({ percent: 99 }))?.version === "2.82.425" && pick(feed({ percent: 100 }))?.version === "2.83.430", "no ID: the new version only at 100%");
ok(pick(feed({ halted: true }), inside)?.version === "2.82.425", "halted: the version before");
ok(pick(feed({ halted: true, previous: undefined }), inside) === undefined, "halted with no version before: no update");
ok(pick(feed({ halted: true, min: "2.80.0" }), "x", "2.79.1")?.version === "2.83.430", "under the minimum: the version out now, also when halted");
ok(pick(feed({ percent: 0, min: "2.80.0" }), "x", "2.81.0")?.version === "2.82.425", "over the minimum: the rollout applies");
ok(pick(feed({}), "x", "2.84.0")?.rollback === false, "an older version without the mark is no rollback");
const back = pick(feed({ version: "2.82.425", previous: "2.83.430", rollback: true }), "x", "2.83.430");
ok(back?.version === "2.82.425" && back.rollback, "rollback: an install of the bad version goes back");
ok(pick(feed({ version: "2.82.425", rollback: true }), "x", "2.82.425")?.rollback === false, "rollback: an install of that version stays");

ok(text({ version: "2.83.430", rollback: false }) === "2.83.430\n" && text({ version: "2.82.425", rollback: true }) === "2.82.425\nrollback\n", "the text answer");
ok(accept("2.83.430\n", "2.82.425") === "2.83.430", "accept a newer version");
ok(accept("2.82.425\n", "2.83.430") === undefined, "refuse an older version with no mark");
ok(accept("2.82.425\nrollback\n", "2.83.430") === "2.82.425", "accept an older version with the mark");
ok(accept("2.83.430\nrollback\n", "2.83.430") === undefined, "refuse the same version");
ok(accept("2.83.430", "") === "2.83.430", "a copy with no version file takes the version");
ok(accept("", "2.83.430") === undefined && accept("<html>", "2.83.430") === undefined, "refuse an empty or wrong answer");
ok(accept("2.9.1", "2.10.0") === undefined && accept("2.10.0", "2.9.1") === "2.10.0", "numbers compare as numbers");

// download.yonder.so (worker.ts): each old name finds its file.
const state = { staging: { mac: { version: "2.150.1400", percent: 100 }, linux: { version: "2.150.1399", percent: 10 }, android: { version: "2.149.1390", percent: 100 } } };
const r = (name: string) => JSON.stringify(resolve(name, state));
ok(r("Yonder.dmg") === JSON.stringify({ version: "2.150.1400", asset: "Yonder-2.150.1400.dmg" }), "Yonder.dmg is the newest DMG");
ok(r("Yonder-2.1.5.app.tar.gz") === JSON.stringify({ version: "2.1.5", asset: "Yonder-2.1.5.app.tar.gz" }), "a versioned name keeps its version");
ok(r("Yonder.apk") === JSON.stringify({ version: "2.149.1390", asset: "Yonder-2.149.1390.apk" }), "Yonder.apk is the newest APK");
ok(r("yonder-linux-arm64.tar.gz") === JSON.stringify({ version: "2.150.1399", asset: "yonder-linux-arm64-2.150.1399.tar.gz" }), "the Linux archive, also during a slow rollout");
ok(r("omarchy.sh") === JSON.stringify({ version: "2.150.1399", asset: "install.sh" }), "omarchy.sh is install.sh");
ok(r("latest-linux.txt") === JSON.stringify({ text: "2.150.1399\n" }) && r("latest.json") === JSON.stringify({ mac: "2.150.1400" }), "the latest files come from the state");
ok(resolve("install.ps1", state) === undefined && resolve("updates/state.json", state) === undefined, "no Windows release or another file: the bucket");
ok(link(FIRST, "a") === `https://github.com/heyyonder/yonder/releases/download/v${FIRST}/a` && link("2.142.1323", "a") === "https://download.yonder.so/a", "a version before FIRST stays in the bucket");

if (failed) process.exit(1);
