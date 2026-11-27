// Which screen the phone runs (src/front.ts). No imports, so that `bun src/screen-check.ts` tests it with no page.

// `needs`: the phone app that a screen needs (`needs` in version.ts). An older bridge gives none.
export type Needs = { ios?: number; android?: number };
export type Front = { build: string; needs?: Needs };

// The place of a build in the order of the commits: N of "2.B.N" (version.ts), above the last number of each version
// 1 ("1.N" and "1.B.N"). So a phone runs a build of version 2 in place of a saved bundle of version 1.
// An older bridge gives the count as a number.
export const count = (build?: string | number) => {
  const parts = String(build).split(".");
  return (Number(parts.pop()) || 0) + (Number(parts[0]) >= 2 ? 1_000_000 : 0);
};

// N of "2.B.N", or undefined for a debug app ("0.1.0"), which runs each screen.
const nOf = (v?: string) => (Number(String(v).split(".")[0]) >= 2 ? Number(String(v).split(".")[2]) : undefined);

// A screen runs only in a phone app that has the last change of the native shell of its platform: a screen can call a
// native function that an older app does not have.
export const fits = (needs: Needs | undefined, app: string | undefined, android: boolean) => {
  const n = nOf(app);
  return n === undefined || (needs?.[android ? "android" : "ios"] ?? 0) <= n;
};

// The screen that the phone runs: the screen of the computer in use, so that the screen matches its bridge, also after
// a switch to a computer with an older screen. Not a screen older than the screen of the install (`app`), which does not know the newer app around it, as
// the over-the-air updates of Expo do. Not a screen that needs a newer app, and not the screen that failed (`bad`).
// "" is the screen of the install.
// `exact`: the screen of the install has this code (`own` in src/front.ts). An older install has the
// old start code, which loads a saved screen with no check and downloads each newer screen. A return to its install
// would load the same screen again, in a loop. So such a phone takes only a newer screen that fits, and else keeps the
// screen that runs (`running`).
// A newer screen that needs a newer app, or that failed, keeps the screen that runs when it is newer than the install
// and not newer than the screen of the computer. Else the phone goes back to the screen of the install, and all the
// features since then go.
export function pick(front: Front, app: string | undefined, exact: boolean, running: string, bad: string | null, android: boolean) {
  const ok = front.build !== bad && fits(front.needs, app, android);
  if (!exact) return ok && count(front.build) > count(running) ? front.build : running;
  if (ok && count(front.build) > count(app)) return front.build;
  return count(app) < count(running) && count(running) <= count(front.build) ? running : "";
}
