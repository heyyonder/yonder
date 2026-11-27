// The Yonder account on yonder.so (the backend, private), for the tunnel and the backup of the
// settings. Yonder is free, with no paid plan: a voice call needs no account, only a key of a voice provider on the
// computer. A super user also sets the Grok voice for everyone, and sees the cost. `voice` is the Grok voice of the account.
// `referral` is the invite link of the account. `avatar` is the profile picture, a JPEG data URL of 160 px.
import { invoke } from "@tauri-apps/api/core";

export const SITE = "https://yonder.so";

export type Account = { email: string; email_verified?: boolean; superuser?: boolean; plan?: string; voice?: string; referral?: string; avatar?: string | null };
type Saved = { token: string; account: Account };

export const saved = (): Saved | undefined => {
  try {
    // A value with no account is no sign-in. An older tunnel answer can leave one (YONDER-F, below).
    const s = JSON.parse(localStorage.getItem("yonderAccount") ?? "");
    return s?.account ? s : undefined;
  } catch {
    return undefined;
  }
};

// Each change of the account goes to the app, so that the call button and the settings show it.
let listener: (a?: Account) => void = () => {};
export const onAccount = (fn: (a?: Account) => void) => (listener = fn);

function save(s?: Saved) {
  if (s) localStorage.setItem("yonderAccount", JSON.stringify(s));
  else localStorage.removeItem("yonderAccount");
  listener(s?.account);
}

async function api(path: string, body?: unknown) {
  const s = saved();
  const res = await fetch(`${SITE}/api/app/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(s && { authorization: `Bearer ${s.token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && s) save();
  // Only a sign-in gives a token with an account. The tunnel answer has a token of Cloudflare and no account. If it takes
  // the place of the sign-in, the Settings of the Mac crash on `account.superuser` (YONDER-F).
  else if (data.token && data.account) save({ token: data.token, account: data.account });
  else if (data.account && s) save({ ...s, account: data.account });
  if (!res.ok) throw new Error(data.error ?? `yonder.so answered with status ${res.status}.`);
  return data;
}

// The sign-in, in place of a password: the site sends a 6-digit code to the email, and the code signs
// in. An email with no account gets one, so the sign-in is also the sign-up.
export const sendCode = (email: string) => api("code", { email });
export const verifyCode = (email: string, code: string) => api("verify", { email, code });
// Google refuses a sign-in in a webview. On the Mac and the iPhone, the sign-in opens in the sign-in window of the
// system (auth_sheet of src-tauri and ios), which closes itself when it is done. Else, and in a Mac app from before
// auth_sheet, it opens in the browser. The app asks the site for its random nonce until the sign-in is
// done, for up to 10 minutes. A closed sign-in window stops it with no message.
export async function googleSignIn(open: (url: string) => void) {
  const nonce = crypto.randomUUID() + crypto.randomUUID();
  const url = `${SITE}/api/app/google?nonce=${nonce}`;
  let closed = false;
  if ("__TAURI_INTERNALS__" in window && !/Android/.test(navigator.userAgent)) {
    // The iPhone sends the result to window.yonderAuthSheet. The Mac answers the invoke when the window closes.
    (window as { yonderAuthSheet?: (r: string) => void }).yonderAuthSheet = (r) => (closed = r === "cancel");
    invoke<boolean>("auth_sheet", { url: `${url}&sheet=1` }).then((ok) => (closed = !ok), () => open(url));
  } else open(url);
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, closed ? 0 : 1500));
    if ((await api("google/poll", { nonce }).catch(() => ({}))).token) return;
    if (closed) throw new Error("");
  }
  throw new Error("The Google sign-in took too long. Try again.");
}
// Sign in with Apple, on the iPhone only (AppleSignIn.swift of ios), because App Review asks for it next to Google
// (guideline 4.8). The phone gives an identity token, and yonder.so checks it with the keys of Apple. An app from before
// it has no apple_sign_in, so the page hides the button there.
export const hasAppleSignIn = () => invoke<boolean>("apple_sign_in", { start: false }).catch(() => false);
// Apple sends "cancel", "error" (an app from before the code), or "error:<number>".
// 1000 is ASAuthorizationError.unknown: the sheet never opens. That is the case with no Apple ID.
// The code stays in the text, so the next Sentry event shows the cause (YONDER-E).
export function appleFailure(result: string): Error | undefined {
  if (result === "cancel" || result === "error:1001") return new Error("");
  if (result !== "error" && !result.startsWith("error:")) return undefined;
  const code = Number(result.slice(6));
  if (code === 1000) return new Error(`This iPhone has no Apple ID (Apple error ${code}). Sign in to it in Settings, then try again.`);
  if (Number.isInteger(code) && code > 0) return new Error(`Apple did not sign you in (Apple error ${code}). Try again.`);
  return new Error("Apple did not sign you in. Try again.");
}
export const appleSignIn = () =>
  new Promise<string>((resolve, reject) => {
    (window as { yonderAppleSignIn?: (r: string) => void }).yonderAppleSignIn = (r) => {
      const failure = appleFailure(r);
      failure ? reject(failure) : resolve(r);
    };
    invoke("apple_sign_in", { start: true }).catch(reject);
  }).then((token) => api("apple", { token }));
export const signOut = () => save();
export const superuser = () => !!saved()?.account.superuser;
// yonder.so marks staff only in `plan`, as "Staff" when the account has no paid plan. A super user is staff too.
// shortcut: staff with a paid plan, VIP or a trial is missed; add a `staff` field to the account answer of yonder.so to fix.
export const staff = () => superuser() || saved()?.account.plan === "Staff";
// A super user sets the Grok voice of the calls of each account.
export const setVoice = (voice: string) => api("account", { voice });
// A new email changes only when the user opens the link that yonder.so sends to it.
// Sign in with Apple and Google still find the account after the change, by the old email.
export const setEmail = (email: string) => api("account", { email });
// The profile picture: the middle square of the photo, 160 px, as a JPEG of about 8 KB. The screens show it as a
// circle. The account page of yonder.so makes it the same way. It shows at once, and comes back when the save fails.
export async function setAvatar(file: File) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 160;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 160, 160);
  const avatar = canvas.toDataURL("image/jpeg", 0.8);
  const s = saved();
  if (s) save({ ...s, account: { ...s.account, avatar } });
  return api("account", { avatar }).catch((e) => (s && save(s), Promise.reject(e)));
}
export const refreshAccount = () => (saved() ? api("account").catch(() => {}) : Promise.resolve());

// A computer with no tunnel (GET /preview of its bridge gives `tunnel: false`, its `id` and its name) gets one from
// yonder.so, and its bridge starts it at once. The app asks for the computer in use, and the phone also for each
// other computer. Each computer is asked at most one time in 10 minutes, because yonder.so can say no. Thus a failed
// ask comes again, and each computer gets its tunnel with no setup.
const askedTunnel = new Map<string, number>();
export async function giveTunnel(get: (path: string, init?: RequestInit) => Promise<Response>, p: { tunnel?: boolean; id?: string; computer?: string }) {
  if (p.tunnel !== false || !p.id || !saved() || Date.now() - (askedTunnel.get(p.id) ?? 0) < 600_000) return false;
  askedTunnel.set(p.id, Date.now());
  const tunnel = await api("tunnel", { id: p.id, computer: p.computer ?? "" });
  return (await get("/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tunnel }) })).ok;
}
// The backup of the settings (bridge/sync.ts): the bridge of each computer syncs with the account, so the app gives it
// the sign-in, as it gives the tunnel. A computer keeps the first sign-in that it gets, from its own app or from a paired
// phone, until a sign-out in its own app (dropSync). `id` limits the ask to one time in 10 minutes for that computer.
const askedSync = new Map<string, number>();
export async function giveSync(get: (path: string, init?: RequestInit) => Promise<Response>, id?: string) {
  const s = saved();
  if (!s || (id && Date.now() - (askedSync.get(id) ?? 0) < 600_000)) return;
  if (id) askedSync.set(id, Date.now());
  if ((await (await get("/sync")).json()).token === false)
    await get("/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: s.token }) });
}
export const dropSync = (get: (path: string, init?: RequestInit) => Promise<Response>) =>
  get("/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: null }) }).catch(() => {});
// A text as MP3 in a Grok voice, with the xAI key of yonder.so, as the /speak of the bridge gives. yonder.so accepts it
// only from staff, so call it only when `staff()`, else the text goes to yonder.so for nothing.
export const speech = (text: string, voice: string) =>
  fetch(`${SITE}/api/app/speak`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${saved()?.token}` }, body: JSON.stringify({ text, voice }) });
// A report of the Feedback section of the settings: the message, a screenshot as a data URL, and one past call as
// text. It needs no sign-in.
export const sendFeedback = (message: string, screenshot: string, calls: string) => api("feedback", { message, screenshot, calls });
