import { expect, mock, test } from "bun:test";

// bridge.ts and link.ts need a page, so the test gives stand-ins.
mock.module("./bridge", () => ({ bridgeFetch: () => {}, isPaired: () => false, phone: false, setPush: () => {} }));
mock.module("./link", () => ({ loadPairing: () => {}, loadPairings: () => {}, pickMac: () => {}, switchPairing: () => {} }));
const { takeUi } = await import("./phone-config");

test("a new screen in the file switches the Mac", () => expect(takeUi('"omarchy"', "my-theme@3", "omarchy")).toBe(true));
test("the first pull takes a screen of the file", () => expect(takeUi(null, "my-theme@3", "omarchy")).toBe(true));
test("the first pull keeps the pick of the Mac when the file has the default", () => expect(takeUi(null, null, "omarchy")).toBe(false));
test("a file with no change keeps the pick of the Mac", () => expect(takeUi('"my-theme@3"', "my-theme@3", "omarchy")).toBe(false));
test("a reset of the file to the default switches the Mac", () => expect(takeUi('"my-theme@3"', null, "omarchy")).toBe(true));
test("the Mac that shows the screen of the file does nothing", () => expect(takeUi('"omarchy"', "my-theme@3", "my-theme@3")).toBe(false));
