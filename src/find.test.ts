import { expect, test } from "bun:test";
import { find, places } from "./find";

const items = [
  { name: "Theme", words: "dark mode light night" },
  { name: "Microphone", words: "mic input audio" },
  { name: "Permissions", words: "mode bypass accept edits" },
];

test("a word of the setting finds it", () => expect(find("dark mode", items)[0].name).toBe("Theme"));
test("a typo finds it", () => expect(find("microfone", items)[0].name).toBe("Microphone"));
test("the start of a word finds it", () => expect(find("perm", items)[0].name).toBe("Permissions"));
test("no match finds nothing", () => expect(find("zebra", items)).toEqual([]));
test("the name of the section finds its rows", () => expect(find("aparance", [{ name: "Theme", words: "dark Appearance" }])[0].name).toBe("Theme"));

test("places finds each match in any case", () => expect(places("Fix the tab, then the TABS", "tab")).toEqual([8, 22]));
test("places does not overlap", () => expect(places("aaaa", "aa")).toEqual([0, 2]));
test("places of no words is empty", () => expect(places("text", "")).toEqual([]));
