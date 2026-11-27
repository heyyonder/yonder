import { expect, test } from "bun:test";
import { pastePlan } from "./paste";

const plan = (over: Partial<Parameters<typeof pastePlan>[0]> = {}) =>
  pastePlan({ inPad: false, inField: false, images: false, copied: false, text: false, phone: false, ...over });

test("text in a field stays in the field", () => expect(plan({ inField: true, text: true })).toBe("skip"));
test("text outside a field is pasted text", () => expect(plan({ inPad: true, text: true })).toBe("plain"));
test("a copied file pastes as its path, in a field and outside one", () => {
  expect(plan({ inField: true, copied: true })).toBe("paths");
  expect(plan({ inPad: true, copied: true, images: true })).toBe("paths");
});
test("a file paste that shows nothing still asks for the path", () => {
  expect(plan({ inPad: true })).toBe("paths");
  expect(plan({ inField: true })).toBe("paths");
});
test("a screenshot with no file path attaches as an image", () => expect(plan({ inPad: true, images: true, phone: true })).toBe("plain"));
test("the phone does not read the pasteboard of the Mac", () => expect(plan({ inPad: true, copied: true, phone: true })).toBe("plain"));
