import { bridgeFetch, isPaired, phone, setPush } from "./bridge";
import { loadPairing, loadPairings, pickMac, switchPairing } from "./link";

// The settings of the phone that phone.json on the Mac also holds (/phone-config of the bridge), so that the user or a
// Claude Code agent can change them on the Mac. The values are the strings of
// localStorage. `ui` is the screen in use (src/look.ts). `appsView` is "list" or "grid", for the Canvas tab. Face lock is not one of them: it needs an unlock on the phone first. The microphone is an ID of one device.
// `environment` is no setting but a one-time order: the name of another paired computer, such as "Mac mini", to switch
// the phone to.
// The Show list of the computers and the wake word are settings of one device (`"store": "device"` in bridge/settings/),
// so they stay in the localStorage of each device and never go into phone.json, which all the phones and the Mac app of
// a computer share. Else a change on one phone goes to every phone through phone.json, every phone can tell each
// computer to forget the others, and other_computer then finds no computer.
// `onboarded` is "on" when the questions of the first run (src/Setup.tsx) ended or were skipped, once for each computer.
// `push` is the Notifications switch of the iPhone (src/bridge.ts), so that an agent on the Mac can turn the pushes off.
export const KEYS = ["ui", "theme", "chatFont", "chatSize", "summaryFont", "summarySize", "usageBar", "voiceProvider", "stt", "appsView", "onboarded", "push"];
// phone.json at the last sync, to tell a change in the file from a change on this phone. Each computer has its own
// phone.json, so a switch of the computer forgets it (PER_MAC in src/link.ts).
const SEEN = "phoneConfigSeen";

// A value of the file as localStorage keeps it: true and false are "on" and "off", as for usageBar and wake.
const norm = (v: unknown) => (v === undefined || v === null ? null : typeof v === "boolean" ? (v ? "on" : "off") : String(v));

let apply = () => {};
let running: Promise<void> | undefined;
let again = false;

// A key that changed in the file since the last sync takes the value of the file. A key that changed only on this phone
// goes into the file. When both changed, the file wins.
const post = (patch: object) =>
  bridgeFetch("/phone-config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then((r) => r.json());

async function sync() {
  // The quick action "Default screen" (src/front.ts) clears the custom look of the computer, `ui` in phone.json.
  if (localStorage.getItem("clearLook")) await post({ ui: null }).then(() => localStorage.removeItem("clearLook"));
  const file = await bridgeFetch("/phone-config").then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
  // The phone removes the order from the file before the switch, so that it does not switch again when it comes back.
  if (typeof file.environment === "string") {
    await post({ environment: null });
    const to = pickMac(file.environment, await loadPairing().catch(() => undefined), await loadPairings().catch(() => []));
    if (typeof to !== "string") {
      await switchPairing(to);
      return void (again = true); // Then the settings of the new computer.
    }
    console.error(`phone.json: ${to}`);
    delete file.environment;
  }
  let seen: Record<string, string | null> = {};
  try {
    seen = JSON.parse(localStorage.getItem(SEEN) ?? "{}");
  } catch {}
  const patch: Record<string, string | null> = {};
  let changed = false;
  for (const key of KEYS) {
    const value = norm(file[key]);
    if (value !== (seen[key] ?? null)) {
      value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
      // The Mac keeps the token of the phone until the phone gives it an empty one.
      if (key === "push") setPush(value !== "off");
      changed = true;
    } else if (localStorage.getItem(key) !== value) patch[key] = localStorage.getItem(key);
  }
  const next = Object.keys(patch).length ? await post(patch) : file;
  localStorage.setItem(SEEN, JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, norm(next[k])]))));
  if (changed) apply();
}

// The Mac window follows `ui` of the file, so that `customize` with `use` of an agent also switches the screen of the Mac.
// It reads only `ui` and never writes the file, so a pick on the Mac stays on the Mac until the file changes. Thus an
// agent can switch the theme of the Mac.
const MAC_SEEN = "macUiSeen";
// True when the Mac takes `ui` of the file: it changed since the last pull, and the Mac shows another screen. The first
// pull takes only a screen of the file, so the default in the file does not clear a pick of the Mac.
export const takeUi = (seen: string | null, ui: string | null, local: string | null) =>
  seen !== JSON.stringify(ui) && !(seen === null && ui === null) && local !== ui;
async function follow() {
  const file = await bridgeFetch("/phone-config").then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
  const ui = norm(file.ui);
  const seen = localStorage.getItem(MAC_SEEN);
  localStorage.setItem(MAC_SEEN, JSON.stringify(ui));
  if (!takeUi(seen, ui, localStorage.getItem("ui"))) return;
  ui === null ? localStorage.removeItem("ui") : localStorage.setItem("ui", ui);
  apply();
}

// Syncs now, or once more after the sync that runs. `onChange` applies the values that came from the file.
export function syncPhoneConfig(onChange?: () => void) {
  if (onChange) apply = onChange;
  // The Mac window follows only on the pull of App.tsx, which gives `onChange`. The page on Linux has no Tauri.
  if (!phone) return void (onChange && "__TAURI_INTERNALS__" in window && follow().catch(() => {}));
  // A real phone reaches phone.json only through its pairing. A fake phone of an agent with no pairing, such as a
  // screenshot script on the bridge of the user, must not write its test settings into it (docs/wiki/projects.md).
  if (!phone || !isPaired()) return;
  if (running) return void (again = true);
  running = sync()
    .catch(() => {})
    .finally(() => {
      running = undefined;
      if (again) (again = false), syncPhoneConfig();
    });
}
