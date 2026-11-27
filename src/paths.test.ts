import { expect, test } from "bun:test";
import { rehypePaths, urlsOf } from "./paths";

const text = (value: string) => ({ type: "text", value });
// The text of the tree, with each link as [text](href).
const show = (n: any): string =>
  n.type === "text" ? n.value : n.tagName === "a" ? `[${n.children[0].value}](${n.properties.href})` : n.children.map(show).join("");
const run = (...children: any[]) => {
  const tree = { type: "root", children };
  rehypePaths()(tree);
  return show(tree);
};

test("a full path is a link, without the period after it", () =>
  expect(run(text("See /home/x/tmp/keys-all.png. Done"))).toBe("See [/home/x/tmp/keys-all.png](/home/x/tmp/keys-all.png). Done"));
test("a folder and a home path are links", () => expect(run(text("in /home/x/tmp/ and ~/Sites"))).toBe("in [/home/x/tmp/](/home/x/tmp/) and [~/Sites](~/Sites)"));
test("the line of a file is not in the href", () => expect(run(text("/tmp/b.ts:42:7"))).toBe("[/tmp/b.ts:42:7](/tmp/b.ts)"));
test("a slash command, a URL and a fraction stay text", () =>
  expect(run(text("run /help, see https://x.com/a/b and 1/2/3"))).toBe("run /help, see https://x.com/a/b and 1/2/3"));
test("a route with one name stays text, also in backticks", () =>
  expect(run(text("open /review/ now"), { type: "element", tagName: "code", children: [text("/review/")] })).toBe("open /review/ now/review/"));
test("a route with two names stays text, also in backticks", () =>
  expect(run(text("see /api/v1/users or "), { type: "element", tagName: "code", children: [text("/playground/material-designer")] })).toBe(
    "see /api/v1/users or /playground/material-designer",
  ));
test("a path in backticks can have spaces", () =>
  expect(run({ type: "element", tagName: "code", children: [text("~/Library/Application Support/x")] })).toBe("[~/Library/Application Support/x](~/Library/Application Support/x)"));
test("a link and a code block stay as they are", () => {
  const a = { type: "element", tagName: "a", properties: { href: "https://x.com" }, children: [text("/a/b")] };
  const pre = { type: "element", tagName: "pre", children: [{ type: "element", tagName: "code", children: [text("ls /a/b")] }] };
  expect(run(a, pre)).toBe("[/a/b](https://x.com)ls /a/b");
});
test("the addresses of a message, without the Markdown and the period around them", () =>
  expect(urlsOf("Open [the site](http://localhost:5173/about), **https://web-sam.yonder.so**. Or <http://127.0.0.1:3000>.")).toEqual([
    "http://localhost:5173/about",
    "https://web-sam.yonder.so",
    "http://127.0.0.1:3000",
  ]));
