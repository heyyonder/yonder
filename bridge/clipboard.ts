// The paths of files that the user copied, from the pasteboard of the Mac. WebKit gives the page the file and hides
// the path (a file URL is not text/plain and not text/uri-list). Check: `bun bridge/clipboard.ts`.

// Reads file URLs from a pasteboard. With no name, it reads the general pasteboard. A web URL is not a file.
const SCRIPT = `
ObjC.import("Foundation");
ObjC.import("AppKit");
function yonderFiles(name) {
  var pb = name ? $.NSPasteboard.pasteboardWithName(name) : $.NSPasteboard.generalPasteboard;
  var read = pb.readObjectsForClassesOptions($.NSArray.arrayWithObject($.NSURL), $.NSDictionary.dictionary);
  var out = [];
  if (read) {
    for (var i = 0; i < read.count; i++) {
      var u = read.objectAtIndex(i);
      if (!u.isFileURL) continue;
      var path = ObjC.unwrap(u.path);
      if (path) out.push(path);
    }
  }
  return out.join("\\n");
}
`;

// One absolute path on each line. A blank line and any other line stay out.
export function pathsOf(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const path = line.replace(/\r$/, "");
    if (!path.startsWith("/") || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

// Runs one JavaScript for Automation script. It gives the text, or null when the script fails.
async function osascript(script: string): Promise<string | null> {
  const proc = Bun.spawn(["osascript", "-l", "JavaScript"], { stdin: new Blob([script]), stdout: "pipe", stderr: "pipe" });
  const [code, text] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  return code === 0 ? text : null;
}

// `name` reads a named pasteboard, for the check. The general pasteboard is the clipboard of the user.
export async function clipboardFiles(name = ""): Promise<string[]> {
  if (process.platform !== "darwin") return [];
  const text = await osascript(`${SCRIPT}\nyonderFiles(${name ? JSON.stringify(name) : ""});\n`);
  return text === null ? [] : pathsOf(text);
}

if (import.meta.main) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  assert(pathsOf("/tmp/a.txt\n/tmp/a.txt\n\nnope\n/tmp/b.txt\r").join() === "/tmp/a.txt,/tmp/b.txt", "one absolute path on each line, with no duplicate");
  assert(pathsOf("https://example.com\n").length === 0, "a web address is not a path");
  if (process.platform !== "darwin") {
    assert((await clipboardFiles()).length === 0, "a computer that is not a Mac has no file pasteboard");
  } else {
    const name = "yonder-clipboard-check";
    const wrote = await osascript(`
      ObjC.import("Foundation");
      ObjC.import("AppKit");
      var pb = $.NSPasteboard.pasteboardWithName(${JSON.stringify(name)});
      pb.clearContents;
      var list = $.NSMutableArray.alloc.init;
      list.addObject($.NSURL.fileURLWithPath("/tmp/one.txt"));
      list.addObject($.NSURL.URLWithString("https://example.com/a"));
      list.addObject($.NSURL.fileURLWithPath("/tmp/two dir/file.txt"));
      pb.writeObjects(list);
    `);
    assert(wrote !== null, "the check can put file URLs on a named pasteboard");
    const paths = await clipboardFiles(name);
    assert(paths.join("\n") === "/tmp/one.txt\n/tmp/two dir/file.txt", "the reader keeps file paths and drops a web address");
    const emptyName = "yonder-clipboard-empty";
    await osascript(`ObjC.import("AppKit"); $.NSPasteboard.pasteboardWithName(${JSON.stringify(emptyName)}).clearContents;`);
    assert((await clipboardFiles(emptyName)).length === 0, "an empty pasteboard has no path");
  }
}
