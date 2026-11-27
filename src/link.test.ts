import { expect, test } from "bun:test";
import { isPeerRead, pickMac, type Pairing } from "./link";

const mac = (name?: string, id = name ?? "old") => ({ mac: id, name }) as Pairing;
const [pro, air, studio] = [mac("MacBook Pro"), mac("MacBook Air"), mac("Mac Studio")];

test("no name and one other Mac picks it", () => expect(pickMac("", pro, [pro, air])).toBe(air));
test("no name and two other Macs asks", () => expect(pickMac("", pro, [pro, air, studio])).toContain("Ask the user which one: MacBook Air, Mac Studio."));
test("the full name picks the Mac", () => expect(pickMac("mac studio", pro, [pro, air, studio])).toBe(studio));
test("a part of the name picks the Mac", () => expect(pickMac("air", pro, [pro, air, studio])).toBe(air));
test("a part of two names asks between them", () => expect(pickMac("macbook", studio, [pro, air, studio])).toContain("which one: MacBook Pro, MacBook Air."));
test("an unknown name asks", () => expect(pickMac("linux box", pro, [pro, air])).toContain('No environment matches "linux box"'));
test("the Mac in use does not switch", () => expect(pickMac("MacBook Pro", pro, [pro, air])).toBe("The phone already works on MacBook Pro."));
test("one Mac only cannot switch", () => expect(pickMac("", pro, [pro])).toContain("paired only with MacBook Pro"));
test("a pairing with no name is Mac", () => expect(pickMac("", pro, [pro, mac(undefined)])).toEqual(mac(undefined)));

const rpc = (name: string, args: Record<string, unknown>) => JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } });
test("a read of another computer is a peer read", () => {
  expect(isPeerRead(rpc("other_computer", {}))).toBe(true);
  expect(isPeerRead(rpc("other_computer", { computer: "Razer1", tool: "list_workers", arguments: { full: true } }))).toBe(true);
  expect(isPeerRead(rpc("other_computer", { computer: "Razer1", tool: "list_projects" }))).toBe(true);
});
test("an action on another computer and a local tool are not peer reads", () => {
  expect(isPeerRead(rpc("other_computer", { computer: "Razer1", tool: "message_worker" }))).toBe(false);
  expect(isPeerRead(rpc("message_worker", { worker: "3", words: '"other_computer"' }))).toBe(false);
  expect(isPeerRead(undefined)).toBe(false);
  expect(isPeerRead("not json other_computer")).toBe(false);
});

// A fake IndexedDB whose first open fails as on iOS after the storage process ends (Sentry YONDER-1A).
test("a lost IndexedDB connection tries once more", async () => {
  const { store } = await import("./link");
  let opens = 0;
  const g = globalThis as { indexedDB?: unknown };
  const before = g.indexedDB;
  g.indexedDB = {
    open() {
      const open: Record<string, unknown> = {};
      const n = ++opens;
      setTimeout(() => {
        if (n === 1) return (open.error = new Error("Connection to Indexed Database server lost."), (open.onerror as () => void)());
        const req: Record<string, unknown> = { result: "paired" };
        open.result = { close() {}, transaction: () => ({ objectStore: () => ({ get: () => (setTimeout(() => (req.onsuccess as () => void)()), req) }) }) };
        (open.onsuccess as () => void)();
      });
      return open;
    },
  };
  try {
    expect(await store<string>("readonly", (s) => s.get("mac"))).toBe("paired");
    expect(opens).toBe(2);
  } finally {
    g.indexedDB = before;
  }
});
