// The abilities of the phone for the bridge and the agents (docs/shell.md): the page does each ask that comes with the
// /show poll (App.tsx), with a web API, a plugin or a native command, and answers at /answer. The poll names only the
// abilities that this app has, so the bridge never sends an ask that this app cannot do. The native abilities come with
// the native batch (Abilities.swift): `abilities` of ios/src/lib.rs lists them, and `ability` runs one, whose answer
// comes back as `window.yonderAbility(id, answer)`. An older app answers `abilities` with an error, so it has none.
// An artifact of the Canvas never reaches these. A screen of the user (src/OwnScreen.tsx) reaches only the abilities that
// its screen.json names, each after a yes of the user on the phone (docs/screen-api.md).
import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@choochmeque/tauri-plugin-notifications-api";
import { authenticate } from "@tauri-apps/plugin-biometric";
import { impactFeedback, notificationFeedback, selectionFeedback, type ImpactFeedbackStyle } from "@tauri-apps/plugin-haptics";
import { openUrl } from "@tauri-apps/plugin-opener";
import { android, bridgeFetch, phone } from "./bridge";
import { locate } from "./voice";

type Args = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const W = window as {
  yonderAbility?: (id: string, answer: Args) => void;
  yonderPushAction?: (choice: Args) => boolean;
  yonderOpened?: (urls: string[], app?: string) => void;
};

// The native abilities of this app. An older app has none.
let natives: string[] = [];
const ready = phone && !android ? invoke<string[]>("abilities").then((list) => void (natives = list), () => {}) : Promise.resolve();
const waiting = new Map<string, (answer: Args) => void>();
W.yonderAbility = (id, answer) => (waiting.get(id)?.(answer), waiting.delete(id));
let made = 0;
// Runs a native ability of Abilities.swift, and gives its answer.
export const native = (name: string, args: Args = {}) =>
  new Promise<Args>((resolve, reject) => {
    const id = `${Date.now()}.${made++}`;
    waiting.set(id, resolve);
    const fail = (e: unknown) => (waiting.delete(id), reject(e instanceof Error ? e : new Error(String(e))));
    invoke<boolean>("ability", { id, name, args: JSON.stringify(args) }).then((ok) => ok || fail(`This phone app cannot do "${name}".`), fail);
  });
const has = (name: string) => () => natives.includes(name);

// Approve and Deny on a push (the Canvas, docs/canvas.md): the choice goes to the page as the event `yonder:push`, also
// when the push opened the app before the page was there. `yonder:opened` gives each yonder:// link that opened the app,
// and on the Mac the name of the app that sent it as `app` of the event (src/NewTask.tsx). The app keeps each link until
// the page takes it (`opened`), so a link that comes here leaves that list, and a reload of the page does not give it again.
W.yonderPushAction = (choice) => dispatchEvent(new CustomEvent("yonder:push", { detail: choice }));
W.yonderOpened = (urls, app) => {
  dispatchEvent(Object.assign(new CustomEvent("yonder:opened", { detail: urls }), { app }));
  void invoke("opened").catch(() => {});
};
void ready.then(() => {
  // The screen stays on while Yonder is open (isIdleTimerDisabled), and iOS sleeps as usual when another app is in front.
  // The web wake lock fails each time with "Permission was denied".
  if (natives.includes("awake")) void native("awake", { on: true }).catch(() => {});
  if (natives.includes("push_action")) void native("push_action").then((choice) => choice.action && W.yonderPushAction?.(choice), () => {});
  // The Mac gives each link with the app that sent it: [url, app]. A test with a fake Tauri can give null (Sentry YONDER-S).
  void invoke<(string | [string, string | null])[]>("opened").then((list) => list?.forEach((l) => (typeof l === "string" ? W.yonderOpened?.([l]) : W.yonderOpened?.([l[0]], l[1] ?? undefined))), () => {});
});

const IMPACT = new Set(["light", "medium", "heavy", "soft", "rigid"]);
const ABILITIES: Record<string, { ok: () => boolean; run: (args: Args) => Promise<unknown> }> = {
  location: { ok: () => phone, run: async () => JSON.parse(await locate()) },
  haptic: {
    ok: () => phone,
    // An app before the native batch allows only the impact taps, so the others become an impact there.
    run: async ({ style }) => {
      const s = text(style) || "light";
      if (IMPACT.has(s)) return impactFeedback(s as ImpactFeedbackStyle).then(() => ({ ok: true }));
      const done = s === "selection" ? selectionFeedback() : notificationFeedback(s as "success" | "warning" | "error");
      return done.then(() => ({ ok: true }), () => impactFeedback(s === "error" ? "heavy" : "medium").then(() => ({ ok: true })));
    },
  },
  notify: { ok: () => phone, run: async ({ title, body }) => (sendNotification({ title: text(title) || "Yonder", body: text(body) }), { ok: true }) },
  open: {
    ok: () => phone,
    // The native batch opens each scheme, such as shortcuts://. Before it, the opener plugin opens web, mail and phone links.
    run: ({ url }) => (natives.includes("open") ? native("open", { url }) : openUrl(text(url)).then(() => ({ ok: true }))),
  },
  // `passcode: true` lets the passcode of the phone stand in for Face ID (deviceOwnerAuthentication).
  face_id: { ok: () => phone, run: ({ reason, passcode }) => authenticate(text(reason) || "Confirm it is you", { allowDeviceCredential: passcode === true }).then(() => ({ ok: true }), () => ({ ok: false })) },
  // The photo goes to the bridge, as an attached image, and the answer is its path on the computer.
  photo: {
    ok: has("photo"),
    run: async (args) => {
      const taken = await native("photo", args);
      if (!taken.path) return taken;
      const bytes = await invoke<ArrayBuffer>("read_picked", { path: taken.path });
      const res = await bridgeFetch("/image", { method: "POST", headers: { "content-type": "image/jpeg" }, body: new Blob([bytes], { type: "image/jpeg" }) });
      if (!res.ok) throw new Error(await res.text());
      return { path: (await res.json()).path };
    },
  },
  // A picture or a video of a link of the computer, such as /media?path=..., to the Photos of the phone.
  save_photo: {
    ok: has("save_photo"),
    run: async ({ url, name }) => {
      const res = await bridgeFetch(text(url));
      if (!res.ok) throw new Error(`The computer did not give ${text(url)}.`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let data = "";
      for (let i = 0; i < bytes.length; i += 0x8000) data += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return native("save_photo", { data: btoa(data), name: text(name) || text(url).split(/[/=?]/).pop() || "photo.jpg" });
    },
  },
  ...Object.fromEntries(["share", "copy", "paste", "contact", "event", "device", "badge", "awake", "confirm", "sheet"].map((n) => [n, { ok: has(n), run: (args: Args) => native(n, args) }])),
};

// The names for the /show poll, once the native list is in.
export const abilityNames = async () => (await ready, Object.keys(ABILITIES).filter((n) => ABILITIES[n].ok()).join(","));

// Does one ask, and gives the answer for /answer: the result, or { error }.
export async function runAbility(ability: string, args: Args = {}) {
  const found = ABILITIES[ability];
  if (!found?.ok()) return { error: `This phone app cannot do "${ability}".` };
  return Promise.resolve(found.run(args)).then(
    (result) => (result && typeof result === "object" ? result : { result }),
    (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }),
  );
}
