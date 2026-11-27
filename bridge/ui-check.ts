// A check of the screens of the user (bridge/ui.ts) in a temporary folder: versions, a page, fork, a bad version, the
// rules of Build your own, and the test page. Run it with `bun bridge/ui-check.ts`.
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintScreen } from "./screen-lint";
import { fork, importScreen, rename, list, markBad, publish, read, SAMPLES, save, starter, tryPage, versions } from "./ui";

const root = mkdtempSync(join(tmpdir(), "yonder-ui-"));
try {
  // The samples load, with the page of the own screen.
  assert.equal(Object.keys(SAMPLES).join(), "yonder,dashboard,big,terminal,omarchy,playful");
  assert.match(SAMPLES.dashboard().page!, /yonder\.ready\(\)/);

  // A fork of a sample is version 1 of "my-terminal", and a second fork gets another name.
  const f = fork(root, "terminal");
  assert.deepEqual([f.name, f.n, f.look.name, f.look.from], ["my-terminal", 1, "My Terminal", "terminal"]);
  assert.equal(fork(root, "terminal").name, "my-terminal-2");

  // A new version takes the next number, and an old version never changes.
  assert.equal(save(root, "my-terminal", { ...f.look, copy: { call: "$ talk" } }, { note: "New words", by: "Mouse 4" }), 2);
  assert.deepEqual(read(root, "my-terminal", 1).look.copy, SAMPLES.terminal().copy);
  assert.equal(read(root, "my-terminal").n, 2);
  assert.equal(versions(root, "my-terminal")[0].note, "New words");

  // A bad version goes away from the newest good one, and the answer is the version to go back to.
  assert.equal(markBad(root, "my-terminal", 2, "it threw"), 1);
  assert.equal(read(root, "my-terminal").n, 1);
  assert.equal(list(root).find((m) => m.name === "my-terminal")?.versions[0].bad, true);

  // An own screen keeps its page in <n>.html.
  const c = fork(root, "dashboard");
  assert.ok(existsSync(join(root, c.name, "1.html")));
  assert.match(read(root, c.name).look.page!, /yonder\.ready/);
  assert.match(tryPage(read(root, c.name).look), /window\.yonder=/);

  // A name with a path in it is no screen.
  assert.throws(() => read(root, "../etc"), /not the name of a screen/);

  // Build your own: a source folder with the rules, and the sample as version 1, which the agent then changes.
  const b = starter(root, "only one chat and a big mic", "dashboard");
  assert.equal(b.name, "my-only-one-chat-and");
  assert.match(readFileSync(join(b.dir, "CLAUDE.md"), "utf8"), /ui\?guide/);
  assert.ok(existsSync(join(b.dir, "index.html")) && existsSync(join(b.dir, "screen.json")));
  assert.equal(read(root, b.name).n, 1);

  // The drop-in folder: screen.json and index.html with a local script, style sheet and picture make version 1, with
  // each file in the page. A path out of the folder stays as it is. No change makes no version.
  const old = (f: string) => utimesSync(f, new Date(Date.now() - 10_000), new Date(Date.now() - 10_000));
  const drop = join(root, "drop");
  mkdirSync(join(drop, "img"), { recursive: true });
  writeFileSync(join(drop, "screen.json"), JSON.stringify({ name: "Drop" }));
  writeFileSync(join(drop, "app.js"), "yonder.ready(); const s = '</script>';");
  writeFileSync(join(drop, "app.css"), "body { background: url(img/dot.png) }");
  writeFileSync(join(drop, "img", "dot.png"), randomBytes(16));
  writeFileSync(join(drop, "index.html"), '<link rel="stylesheet" href="app.css"><img src="./img/dot.png"><script src="../ui-check.ts"></script><script src=/app.js></script>');
  ["screen.json", "app.js", "app.css", "img/dot.png", "index.html"].forEach((f) => old(join(drop, f)));
  assert.equal(await publish(root, "drop"), 1);
  const page = read(root, "drop").look.page!;
  assert.equal(read(root, "drop").look.kind, "screen");
  assert.match(page, /<script>yonder\.ready\(\); const s = '<\\\/script>';<\/script>/);
  assert.match(page, /<style>body \{ background: url\(data:image\/png;base64,/);
  assert.match(page, /<img src="data:image\/png;base64,/);
  assert.match(page, /<script src="\.\.\/ui-check\.ts"><\/script>/);
  assert.equal(await publish(root, "drop"), undefined);
  // A change makes version 2, and a change of the last 2 seconds waits for the next look.
  writeFileSync(join(drop, "app.js"), "yonder.ready(); // 2");
  assert.equal(await publish(root, "drop"), undefined);
  old(join(drop, "app.js"));
  assert.equal(await publish(root, "drop"), 2);
  // A page larger than 1 MB when gzipped is no version, and the error is in build.log.
  writeFileSync(join(drop, "app.js"), randomBytes(1_200_000).toString("base64"));
  old(join(drop, "app.js"));
  assert.equal(await publish(root, "drop"), undefined);
  assert.match(readFileSync(join(drop, "build.log"), "utf8"), /1 MB when gzipped/);
  assert.equal(read(root, "drop").n, 2);

  // Import: a folder elsewhere stays the source, through the link source/, and gets a screen.json when it has none.
  const ext = mkdtempSync(join(tmpdir(), "yonder-front-"));
  writeFileSync(join(ext, "index.html"), "<p>Mine</p><script>yonder.ready()</script>");
  const im = await importScreen(root, ext, "Mine");
  assert.deepEqual([im.name, im.n], ["mine", 1]);
  assert.match(read(root, "mine").look.page!, /<p>Mine<\/p>/);
  rmSync(ext, { recursive: true, force: true });

  // The check of a new version (bridge/screen-lint.ts), with Google Chrome: the page of the sample passes, and a page
  // that cuts a button at the right edge, or that never calls ready(), fails with the reason.
  if (existsSync("/Applications/Google Chrome.app")) {
    assert.equal(await lintScreen(SAMPLES.dashboard()), undefined);
    const page = (html: string) => ({ name: "Bad", kind: "screen", page: html });
    assert.match((await lintScreen(page(`<button style="position:fixed;top:0;left:960px;width:120px">Call</button><script>yonder.ready()</script>`)))!, /control "Call" goes \d+ px past the right edge at 1000 by 664 px/);
    assert.match((await lintScreen(page(`<p>Hi</p>`)))!, /does not call yonder\.ready\(\)/);
    assert.match((await lintScreen(page(`<script>yonder.ready(); nope()</script>`)))!, /throws/);
  }
  // A rename: the folder keeps its name, and the next version has the new name.
  const p = fork(root, "playful");
  await rename(root, p.name, "Warm one");
  assert.deepEqual([read(root, p.name).look.name, read(root, p.name).n], ["Warm one", 2]);
  console.log("ui-check: all good");
} finally {
  rmSync(root, { recursive: true, force: true });
}
