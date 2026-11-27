// A voice call with Grok over the realtime API. The microphone goes in, the
// speaker plays the answer, and tool calls go to the bridge. A Claude call has no socket (src/brain.ts).
import * as Sentry from "@sentry/react";
import { invoke } from "@tauri-apps/api/core";
import { saved } from "./account";
import { brainCall } from "./brain";
import { onOther } from "./elsewhere";
import { bridgeFetch, callTool, phone, shell, showSite, stt } from "./bridge";
import { showArtifact } from "./Canvas";
import { accept, forHost, running } from "./front";
import { names, sameRequest, saysStarted, startedNum, swap, word, asksClose, asksGroup, asksComplete } from "./names";
import WORKLET from "../public/mic-worklet.js?raw";

declare const __BUILD_ID__: string;

export const PRICE_PER_MINUTE = 0.08; // grok-voice-3.0 (grok-voice-latest), https://docs.x.ai/docs/models
// ElevenLabs Agents: about $0.08 a minute of the call on the Creator plan, and the LLM on top. https://elevenlabs.io/pricing
const ELEVEN_PRICE_PER_MINUTE = 0.1;
// The realtime voice model of the calls, from the Voice section of the settings. The next call uses it. Claude: the
// speech model of Apple on the Mac hears, a Claude Code session in the bridge decides, and ElevenLabs speaks (src/brain.ts).
export const VOICE_PROVIDERS = { grok: "Grok", openai: "OpenAI", elevenlabs: "ElevenLabs", claude: "Claude" } as const;
export type VoiceProvider = keyof typeof VOICE_PROVIDERS;
// The providers and speech to text models whose key the computer has (`keys` of /token?check of the bridge). App.tsx
// sets it, and the Settings offer only these. Undefined until the bridge answers: then each provider counts.
let keys: string[] | undefined;
export const setVoiceKeys = (k?: string[]) => void (keys = k);
export const hasVoiceKey = (id: string) => !keys || keys.includes(id);
// The voices of the Grok realtime API (GET https://api.x.ai/v1/tts/voices), as VOICES of yonder.so.
export const GROK_VOICES = "altair ara atlas aurora carina castor celeste cosmo eve helios helix iris kepler leo liora lumen luna lux naksh orion perseus rex rigel sal sirius ursa zagan zenith".split(" ");
// The chosen provider, else the first one whose key the computer has, else Grok.
export function voiceProvider(): VoiceProvider {
  const all = Object.keys(VOICE_PROVIDERS) as VoiceProvider[];
  const chosen = localStorage.getItem("voiceProvider") as VoiceProvider;
  return all.includes(chosen) && hasVoiceKey(chosen) ? chosen : all.find(hasVoiceKey) ?? "grok";
}
// The OpenAI call (gpt-realtime-2.1, bridge/main.ts makes its token) takes and gives PCM16 at 24 kHz only, in base64 in
// JSON events. OpenAI bills tokens, US dollars for 1M: https://developers.openai.com/api/docs/models/gpt-realtime-2.1
const OPENAI_RATE = 24000;
const OPENAI_PRICE = { text: 4, audio: 32, cached: 0.4, textOut: 24, audioOut: 64 };
export const b64 = (data: ArrayBuffer) => {
  const bytes = new Uint8Array(data);
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};
// The microphone audio at the rate of the device, for OpenAI. The AudioContext of the call keeps the rate of the
// device (see startCall), so the app converts each 100 ms frame itself.
// shortcut: linear, with no low-pass filter; speech has little sound above 12 kHz. Filter first if OpenAI mishears.
export function to24k(pcm: Int16Array, rate: number) {
  const out = new Int16Array(Math.round((pcm.length * OPENAI_RATE) / rate));
  for (let i = 0; i < out.length; i++) {
    const at = (i * rate) / OPENAI_RATE;
    const j = Math.floor(at);
    out[i] = pcm[j] + ((pcm[j + 1] ?? pcm[j]) - pcm[j]) * (at - j);
  }
  return out;
}
// Tools that send words to an agent. The app adds the last words of the call to them as context.
const SENDS = new Set(["start_worker", "message_worker", "build_app"]);
const GROUPS = new Set(["close_worker", "complete_worker", "remove_worker"]);
// The words for each tool, when Grok must correct what it said.
const DID: Record<string, string> = {
  start_worker: "I started a new agent, <number>.",
  message_worker: "I sent it to <number>.",
  close_worker: "I closed <number>.",
  stop_worker: "I stopped the turn of <number>.",
  complete_worker: "I marked <number> as completed.",
  remove_worker: "I removed <number>.",
  nothing: "I did nothing yet.",
};
// The pause after the last speech before the app gives Grok news, so that the news never cuts into the talk.
const QUIET_MS = 4000;
// The silence that ends a turn of the user (server VAD). With the default of xAI (about 200 ms), a pause of 0.8 s to
// think ends the turn, and Grok acts on half a request: 314 of 2,374 turns in one sample of calls. 1200 ms
// keeps more than half of those pauses in the turn, and each answer comes about 1.2 s later. xAI does not document
// silence_duration_ms, but it honors it. Check it with `bun bridge/vad-check.ts`.
const SILENCE_MS = 1200;
// Tools that only do something. Their result has no news for the user when they succeed.
const ACTIONS = new Set(["start_worker", "message_worker", "rename_worker", "move_worker", "star_worker", "close_worker", "stop_worker", "unqueue", "complete_worker", "remove_worker", "open_in_terminal", "open_folder", "copy_to_clipboard", "open_link", "show_project", "show_workspace", "show_agent", "show_tab", "set_theme", "pair_phone", "add_project", "create_project", "remove_project", "star_project", "add_workspace", "edit_workspace", "remove_workspace", "star_workspace", "restart_bridge", "end_call", "change_talk"]);
// Tools that act on the screen of the Mac. Grok does not get them on the phone.
// rebuild_app and restart_bridge work from the phone: the bridge is off for a few seconds only, and the relay connects again.
export const MAC_ONLY = new Set(["open_in_terminal", "open_folder", "open_link", "browser"]);


// The token of a Mac with its own XAI_API_KEY, or with its own OPENAI_API_KEY for an OpenAI call.
export async function bridgeToken(provider: VoiceProvider = "grok") {
  const res = await bridgeFetch(provider === "openai" ? "/token?provider=openai" : "/token");
  const secret = await res.json();
  if (!res.ok) throw new Error(secret.error?.message ?? secret.error ?? `The token request failed with status ${res.status}.`);
  // An older bridge ignores `provider` and gives a Grok token, which has no model.
  if (provider === "openai" && !secret.session?.model) throw new Error("The bridge is too old for an OpenAI call. Restart the bridge, then start the call again.");
  return secret;
}

type Tool = { name: string; description?: string; inputSchema: Record<string, unknown> };

// The pin of the phone, for get_location: one fix while the app is in use, with no tracking. The phone asks the user
// for the permission the first time. A fix of up to 15 seconds ago is good enough for "log this spot".
export const locate = () =>
  new Promise<string>((done, fail) =>
    navigator.geolocation.getCurrentPosition(
      ({ coords: c, timestamp }) => {
        const pin = `${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`;
        done(JSON.stringify({ latitude: c.latitude, longitude: c.longitude, accuracy_meters: Math.round(c.accuracy), at: new Date(timestamp).toISOString(), map: `https://maps.apple.com/?ll=${pin}&q=${pin}` }));
      },
      (e) =>
        fail(new Error(e.code === e.PERMISSION_DENIED
          ? "The user did not allow the location. They can turn on Location for Yonder in the Settings of the phone."
          : `The phone could not get its location (${e.message}). If its screen is locked, the user can unlock it with Yonder open and try again.`)),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 15_000 },
    ),
  );
// The pin with its place name and address from the bridge, which also writes the ask to location.log. An older
// bridge has no /location, so the pin goes alone.
const located = async () => {
  const pin = await locate();
  return bridgeFetch("/location", { method: "POST", body: pin }).then((r) => (r.ok ? r.text() : pin), () => pin);
};

// Writes to ~/.config/yonder/call.log through the bridge.
export const log = (...parts: unknown[]) =>
  bridgeFetch("/log", { method: "POST", body: parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ") }).catch(() => {});

// Saves one line of the transcript of the call in ~/.config/yonder/calls through the bridge.
const record = (call: number, who: "you" | "yonder" | "tool", text: string) =>
  text.trim() && bridgeFetch(`/transcript?call=${call}`, { method: "POST", body: JSON.stringify({ who, text: text.trim() }) }).catch(() => {});
export type Call = { connectedAt: number; warning?: string; cost(): number; tokens(): number; update(instructions: string): void; tell(text: string): void; quiet(ms?: number): boolean; mute(on: boolean): void; levels(): { mic: number; out: number }; hangUp(): void; moved(): void };

// `screen` gives what the app shows now. Grok calls get_screen for it, because it
// can repeat an old answer from the conversation instead of the current prompt.
// `show` opens the agents of a project on the screen and returns the result.
// `showAgent` opens the conversation of one agent on the screen and returns the result. `stay` is true when Grok
// closed, completed or removed an agent in the same turn of the user, so that the screen stays on the tab that the user goes through.
// `focus` gives the project the user works on, if any. list_workers then returns only its agents.
// `images` gives the paths of the images, files and videos that the user attached, and `sent` takes them off the screen.
// `app` adds the state of the app to call_status, switches the theme for set_theme, opens a tab for show_tab, shows the
// pairing code for pair_phone. `pasted` gives the texts that the user pasted, for read_paste.
// `switchEnvironment` moves the phone to another paired Mac for switch_environment, and gives the result for Grok.
// `otherAgents` gives the agents of the other paired computers for other_environments (src/elsewhere.ts).
// show_app of Grok and of the Claude call: the page opens at once on the screen of the call, with no poll.
function openPage(result: string) {
  const { path, title, archived } = JSON.parse(result) as { path: string; title: string; archived?: boolean };
  // A new version of an app in the archive stays there (show_app in bridge/main.ts).
  if (!archived) showArtifact({ path, title });
  return result;
}
// A short two-note sound: up when the call starts, down when it ends. The start plays on the AudioContext of the
// call. With echo cancellation off, the microphone can send nothing for the first seconds of a call, while macOS
// reconfigures the audio again and again. A second AudioContext for the chime is a likely trigger, but not a proven one.
export function chime(up: boolean, ctx?: AudioContext) {
  const audio = ctx ?? new AudioContext();
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.frequency.setValueAtTime(up ? 660 : 880, audio.currentTime);
  tone.frequency.setValueAtTime(up ? 880 : 660, audio.currentTime + 0.09);
  // The level holds through both notes, then fades. If it fades at once, the second note is almost silent, and the
  // chime of the talk view is hard to hear on the phone.
  gain.gain.setValueAtTime(0.2, audio.currentTime);
  gain.gain.setValueAtTime(0.2, audio.currentTime + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.4);
  tone.connect(gain).connect(audio.destination);
  if (!ctx) tone.onended = () => audio.close();
  tone.start();
  tone.stop(audio.currentTime + 0.4);
}

// The microphone, with the echo cancellation of the system, which keeps the voice of Grok out of it and so lets
// the user interrupt Grok. The microphone that the user chose in the settings (src/Settings.tsx) is only a wish,
// so the default microphone takes its place when the chosen one is gone.
// On the iPhone, the echo cancellation of WebKit is its voice processing, which puts the voice on the call volume of
// iOS. Then the side buttons do not lower the voice and seem to push it up: the gain
// control of the voice processing works against the volume. So the phone has no echo cancellation of WebKit, and the
// voice goes on the volume of play-and-record. The echo of the speaker stays out in another way: iOS 18.2 and later
// cancel it on some iPhones of 2024 and later (`iosEcho`), and on the other iPhones the call closes the microphone
// while the voice plays (`gated` in startCall). So the side buttons work, and a tap,
// not the voice of the user, stops the voice on the speaker.
let iosEcho = false;
const getMic = () =>
  navigator.mediaDevices.getUserMedia({
    audio: { deviceId: localStorage.getItem("mic") || undefined, echoCancellation: !phone, noiseSuppression: true, autoGainControl: true },
  });
// The Mac: the switch "Pause music" (`pauseMusic`, on by default) and the name of the microphone of the settings
// (`micName`), for the music pause and for the helper of the notch and of "Hey Yonder" (set_audio in src-tauri/src/main.rs).
export function syncAudio() {
  if (!phone && "__TAURI_INTERNALS__" in window) invoke("set_audio", { pause: localStorage.getItem("pauseMusic") !== "off", mic: localStorage.getItem("micName") ?? "" }).catch(() => {});
}
// The echo cancellation of iOS 18.2 and later (`echo_input` of ios/src/lib.rs): -1 when the phone or the build of the
// app has none, 0 off, 1 on, and 2 off with no built-in speaker.
const echoInput = (on: boolean) => invoke<number>("echo_input", { on }).catch(() => -1);

// App.tsx opens the microphone at the click on "Start call", before the network requests, and gives it to
// startCall. For about 2.5 s after getUserMedia, macOS rebuilds its audio devices for the voice
// processing: the microphone sends nothing, or stops for about 0.7 s two or three times. Else the call misses
// the first words of the user. `micOpenedAt` is the time when the microphone opened.
let micOpenedAt = 0;
// True from openMic to the end of the call, so that the end of a dictation does not set the audio session of iOS back
// to "auto" under a call (see dictate in src/dictate.ts).
let callMic = false;
export const micInCall = () => callMic;
export function openMic() {
  callMic = true;
  // iOS: "play-and-record" tells WebKit that this is a call, so that the audio and the microphone go on in the
  // background (the app has the background audio mode). iOS 17.5 and later honor it.
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "play-and-record";
  return (phone ? phoneMic() : getMic()).then((stream) => ((micOpenedAt = Date.now()), stream));
}
// iOS tells only after the microphone opens if its echo cancellation is on.
async function phoneMic() {
  const can = (await echoInput(true)) >= 0;
  const stream = await getMic();
  iosEcho = can && (await echoInput(true)) === 1;
  if (can) log(`echo: the echo cancellation of iOS is ${iosEcho ? "on" : "off"}`);
  return stream;
}

// The phone gets only the JS and the CSS of a new front end, not the files of public/, so the worklet of the
// microphone comes in the JS. If WebKit refuses the module from a blob, the file of the install is used.
export async function addMic(ctx: AudioContext) {
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  await ctx.audioWorklet
    .addModule(url)
    .catch(() => ctx.audioWorklet.addModule("/mic-worklet.js"))
    .finally(() => URL.revokeObjectURL(url));
}

// A frame of the worklet with its loudness before the clip. The worklet of an older install sends
// only the frame, after the clip, so its loudness comes from the frame.
export type Frame = { pcm: ArrayBuffer; peak: number; rms: number; clip: number };
export function frameOf(data: ArrayBuffer | Frame): Frame {
  if (!(data instanceof ArrayBuffer)) return data;
  let sum = 0;
  let peak = 0;
  let clip = 0;
  const pcm = new Int16Array(data);
  for (const s of pcm) {
    sum += s * s;
    peak = Math.max(peak, Math.abs(s));
    if (Math.abs(s) >= 0x7fff) clip++;
  }
  return { pcm: data, peak: peak / 0x7fff, rms: Math.sqrt(sum / (pcm.length || 1)) / 0x7fff, clip };
}

export async function startCall(
  instructions: string,
  tools: Tool[],
  screen: () => string,
  show: (project: string) => Promise<string>,
  showAgent: (num: string, stay: boolean) => string,
  focus: () => { name: string; path: string; ids: string[] } | undefined,
  images: { paths(): Promise<string[]>; sent(paths: string[]): void },
  app: { status(): Record<string, unknown>; label(num: number, project: string): string; agent(ref: string): { num: number; running: boolean; open: boolean; task: string } | undefined; setTheme(theme: string): string; showTab(tab: string): string; pairPhone(): string; pasted(): string[]; switchEnvironment(name: string): Promise<string>; otherAgents(): Promise<string> },
  onEnd: (error?: string) => void,
  // The short-lived token: from the bridge with its own xAI or OpenAI key, or from the Yonder account (src/account.ts).
  // The token of OpenAI also gives the model of the call.
  secret: { value: string; session?: { model?: string } },
  // The microphone of openMic.
  opened: Promise<MediaStream>): Promise<Call> {
  const openai = voiceProvider() === "openai";
  // ElevenLabs talks another protocol than Grok: JSON events with the audio in base64, and the agent continues by
  // itself after a tool result (onEleven below).
  const eleven = voiceProvider() === "elevenlabs";
  // Claude: no socket and no voice model. The app hears, the brain of the bridge decides, and ElevenLabs speaks (src/brain.ts).
  const claude = voiceProvider() === "claude";
  const vendor = openai ? "OpenAI" : eleven ? "ElevenLabs" : claude ? "Claude" : "Grok";
  // The function tools of the call. Grok gets them with its own web search and X search, OpenAI without them, and
  // ElevenLabs keeps them on its side (bridge/eleven.ts).
  const functions = [
    // show_on_device is for the Claude Code agents. Grok opens a site with preview, and a second tool for it would make
    // it pick the wrong one. send_file and create_upload are for a client with no attachments of Yonder: in a call, the
    // app already gives the attached files in `files`, and Grok would open the attach sheet in place of a message.
    ...tools.filter((t) => !["show_on_device", "send_file", "create_upload"].includes(t.name) && (!phone || !MAC_ONLY.has(t.name))).map(({ name, description, inputSchema: { $schema, ...parameters } }) => {
      // The app fills in `context`, `files` and `call` itself, so Grok does not see them. The `agent` of show_app is
      // the number of an agent that shows its own page.
      const { context, files, call, ...properties } = (parameters.properties ?? {}) as Record<string, unknown>;
      if (name === "show_app") delete properties.agent;
      return { type: "function", name, description, parameters: { ...parameters, properties } };
    }),
    {
      type: "function",
      name: "call_status",
      description: "The state of this voice call and of the app: if the Mac (the bridge) is connected or offline, minutes live, the cost of this call and of all calls on Grok in US dollars (an estimate), the real spend this month and the credit left from the xAI console, the plan usage of the active profile (usage_of names it; Claude Code gives the 5-hour session and the week, Grok gives the week, each with the reset time), about how many tokens your own context holds, how many agents run and wait, the app version, the newest version of the source (a higher number needs a rebuild), and the theme.",
      parameters: { type: "object", properties: {} },
    },
    {
      type: "function",
      name: "get_screen",
      description: "What the Yonder app shows now: the open tab, the selected workspace, and the agents of that workspace.",
      parameters: { type: "object", properties: {} },
    },
    {
      type: "function",
      name: "show_workspace",
      description: "Select a workspace in the Yonder app and open its agents on the screen.",
      parameters: {
        type: "object",
        properties: { workspace: { type: "string", description: "The name of the workspace, as in the list of workspaces." } },
        required: ["workspace"],
      },
    },
    {
      type: "function",
      name: "show_agent",
      description: "Open the conversation of one agent on the screen of the Yonder app, with its workspace and its tab.",
      parameters: {
        type: "object",
        properties: { agent: { type: "string", description: "The number of the agent, such as \"19\"." } },
        required: ["agent"],
      },
    },
    {
      type: "function",
      name: "show_tab",
      description: "Open one tab of the Yonder app: projects (the list of workspaces), `agents` (running), review (the agents that need the user: waiting, or a result that needs the user), completed (the Done tab: done or failed, and no need of the user), saved (the agents that the user saved for later), closed (the agents that the user closed), preview (the Canvas tab: the approvals that wait for the user, then the apps: the pages that the agents made and the web sites that run on the Mac with their tunnels), or calls (the transcripts of past calls). It closes an open conversation and shows the list. The selected project stays.",
      parameters: {
        type: "object",
        properties: { tab: { type: "string", enum: ["projects", "agents", "completed", "saved", "closed", "preview", "calls"] } },
        required: ["tab"],
      },
    },
    {
      type: "function",
      name: "set_theme",
      description: "Switch the Yonder app to light mode, dark mode, or the theme of the system (system: it follows the light or dark mode of the device).",
      parameters: {
        type: "object",
        properties: { theme: { type: "string", enum: ["light", "dark", "system"] } },
        required: ["theme"],
      },
    },
    {
      type: "function",
      name: "read_paste",
      description:
        "Read the text that the user pasted in the app. It goes to the agent with your next start_worker or message_worker call, so you do not need to repeat it in the task. " +
        "Call it when the user asks what they pasted, or asks you to read, sum up or answer it.",
      parameters: { type: "object", properties: {} },
    },
    ...(phone ? [{
      type: "function",
      name: "switch_environment",
      description:
        "Switch the phone to another paired environment: a Mac, a PC or a server with Yonder. The call goes on, with the workspaces, the agents and the tools of that environment. " +
        "Call it only when the user asks to switch the environment, the PC, the Mac or the computer, for example \"switch environment\", \"switch PC\", \"switch Mac\" or \"go to the other MacBook\". " +
        "Never call it to start or reach an agent on another environment: other_computer does that, and the phone stays on this environment.",
      parameters: {
        type: "object",
        properties: { environment: { type: "string", description: "The name of the environment, as in the Environment section. Leave it out when the phone has only one other environment." } },
      },
    }, {
      type: "function",
      name: "other_environments",
      description:
        "List the agents of the other paired environments, with no switch: for each environment, its agents that are not closed, with their number, name, workspace and status, or that it is offline. " +
        "Call it when the user asks about the agents of another environment, such as \"what's running on the Mac mini?\" or \"any news on the other computer?\". " +
        "Their numbers are of that environment. To act on one of them, call other_computer, not switch_environment.",
      parameters: { type: "object", properties: {} },
    }, {
      type: "function",
      name: "get_location",
      description:
        "Get the location of the user from the GPS of the phone: the latitude, the longitude, the accuracy and a map link. The phone asks the user to allow it the first time. " +
        "Call it when the user asks for their location, or asks to send it to an agent. To send it, put the coordinates and the map link in the task of start_worker or the message of message_worker.",
      parameters: { type: "object", properties: {} },
    }] : [{
      type: "function",
      name: "pair_phone",
      description: "Show the QR code on the screen of the Mac that pairs a phone with Yonder. The user scans it with the Yonder app on the phone.",
      parameters: { type: "object", properties: {} },
    }]),
    {
      type: "function",
      name: "end_call",
      description: "End this voice call, as a hang-up. The call ends when you stop talking.",
      parameters: { type: "object", properties: {} },
    },
  ];
  // On Omarchy the tools name "the computer", not the Mac (src/front.ts).
  for (const f of functions) if (f.description) f.description = forHost(f.description);
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  let stream: MediaStream;
  try {
    stream = await opened;
  } catch (e) {
    callMic = false;
    if (session) session.type = "auto";
    throw new Error(`Yonder cannot use the microphone: ${(e as Error).message}`);
  }
  // The AudioContext comes after the microphone. Made before it, the voice processing of macOS restarts the audio
  // again and again in the first seconds of a call, and the microphone sends no frames for 0.7 s at a time.
  // iOS lets the audio play while the microphone records, also when the tap of the user was too
  // long ago. Use the rate of the device (44.1 or 48 kHz), which Grok accepts. A forced rate makes WebKit
  // convert the microphone audio, which is a risk.
  const ctx = new AudioContext();
  // Do not wait: without a click, the promise can wait forever. The log shows the state.
  void ctx.resume();
  const rate = ctx.sampleRate;
  // ElevenLabs: the bridge sets up the agent with the tools and the rate of this call, and gives the signed URL of
  // the socket (bridge/eleven.ts). The first call makes about 30 tools, which takes about 4 s.
  if (eleven) {
    const res = await bridgeFetch("/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice: "elevenlabs", rate, tools: functions }) }).catch((e: Error) => e);
    const data = res instanceof Error ? { error: res.message } : await res.json().catch(() => ({}));
    // An older bridge ignores the POST and gives a Grok token, which is not a URL.
    if (!data.value?.startsWith("wss:")) {
      void ctx.close();
      callMic = false;
      if (session) session.type = "auto";
      throw new Error(data.value ? "The bridge is too old for an ElevenLabs call. Restart the bridge, then start the call again." : data.error ?? "The bridge gave no ElevenLabs URL.");
    }
    secret = data;
  }
  await addMic(ctx);
  const mic = new AudioWorkletNode(ctx, "mic", { numberOfOutputs: 0, processorOptions: { frame: rate / 10 } });
  const id = Date.now(); // The transcript of this call goes in the file with this name.
  // Claude: the bridge starts the brain of this call now, so that the first answer does not wait for it. An older
  // bridge has no /brain.
  if (claude) {
    const res = await bridgeFetch("/brain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ call: String(id) }) }).catch((e: Error) => e);
    if (res instanceof Error || !res.ok) {
      void ctx.close();
      callMic = false;
      if (session) session.type = "auto";
      // An old bridge answers 404 on the Mac, and its relay answers 403 to the phone.
      throw new Error(
        res instanceof Error
          ? res.message
          : [403, 404].includes(res.status)
          ? "The bridge is too old for a Claude call. Restart the bridge, then start the call again."
          : `The Claude call did not start: ${(await res.text().catch(() => "")) || `status ${res.status}`}`,
      );
    }
  }
  // The loudness of the microphone and of Grok, for the bars in the call button (src/Levels.tsx).
  const micLevel = ctx.createAnalyser();
  const outLevel = ctx.createAnalyser();
  outLevel.connect(ctx.destination);
  const samples = new Float32Array(micLevel.fftSize);
  const level = (node: AnalyserNode) => {
    node.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    return Math.sqrt(sum / samples.length);
  };
  // The iPhone has no voice processing of WebKit (getMic), so it has no gain control either: the speech
  // of the user reaches a peak of 0.02 to 0.07, where the voice processing gives 0.6 to 0.9. Grok hears nothing, and the
  // bars do not move. A fixed gain brings it back. The echo cancellation of iOS (`iosEcho`) has its own gain.
  // shortcut: a fixed gain, and the worklet clips a loud voice near the phone; use a limiter if Grok mishears loud speech.
  const input = ctx.createGain();
  const gain = /iPhone|iPad/.test(navigator.userAgent) && !iosEcho ? 8 : 1;
  input.gain.value = gain;
  input.connect(mic);
  input.connect(micLevel);
  // The bars of the call button expect speech at about 0.05 to 0.3 (src/Levels.tsx). After the gain of 8, the speech of
  // the iPhone reaches only 0.02 to 0.03. The bars hardly move, so the user says the words again, and each
  // new word cancels the answer of Grok before it plays. So the bars get 8 times the level: typical speech then fills
  // about two thirds of the bars, and the room stays at 0. A lift of 4 gives less than half. Grok hears the same audio.
  const lift = gain > 1 ? 8 : 1;
  let track: MediaStreamTrack | undefined;
  let muted = false;
  // iOS can end the microphone track when the app goes to the background. The call then gets the microphone
  // again: at once if iOS lets it, else when the page is visible again. Before this fix, the microphone
  // stayed dead after the user came back to the app.
  function attach(next: MediaStream) {
    stream = next;
    ctx.createMediaStreamSource(stream).connect(input);
    track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !muted;
    track.onmute = () => log("mic: muted");
    track.onunmute = () => log("mic: unmuted");
    track.onended = () => {
      log(`mic: ended (page ${document.visibilityState})`);
      void reattach();
    };
  }
  let reattaching = false;
  async function reattach() {
    if (ended || reattaching || track?.readyState === "live") return;
    reattaching = true;
    try {
      const next = await getMic();
      if (ended) next.getTracks().forEach((t) => t.stop());
      else {
        attach(next);
        log("mic: back");
      }
    } catch (e) {
      log(`mic: cannot get it again (page ${document.visibilityState}): ${(e as Error).message}`);
    } finally {
      reattaching = false;
    }
  }
  attach(stream);
  // The echo cancellation of macOS uses the default output as its reference. With the MacBook microphone and
  // another output, such as a monitor over DisplayPort, it turns the microphone down by about
  // 40 dB, and Grok hears nothing. The built-in speakers and headphones work. The page can read
  // only the name of the default output, so the check uses the names.
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const defaultOutput = (list: MediaDeviceInfo[]) => list.find((d) => d.kind === "audiooutput" && d.deviceId === "default")?.label.replace(/^Default - /, "");
  const named = defaultOutput(devices);
  // The microphone of an iPhone without echo cancellation sends silence while the voice plays on the speaker or the
  // receiver (see getMic). With headphones no echo comes back, so the user can still interrupt by voice.
  let gated = false;
  // shortcut: names only; a Bluetooth speaker with another name is not gated, and Yonder can hear itself on it.
  const route = (output?: string) => (gated = phone && !iosEcho && (!output || /speaker|receiver/i.test(output)));
  route(named);
  const onRoute = () => void navigator.mediaDevices.enumerateDevices().then((list) => log(`route: ${defaultOutput(list)}, gated ${route(defaultOutput(list))}`), () => {});
  navigator.mediaDevices.addEventListener("devicechange", onRoute);
  const output = named ?? `unknown (${devices.filter((d) => d.kind === "audiooutput").map((d) => d.label || d.deviceId).join(", ") || "no outputs"})`;
  const warning = named && /^(MacBook|iMac|Mac)\b.*Microphone/.test(track?.label ?? "") && !/(MacBook|iMac|Mac Studio|Mac mini).*Speakers|Headphones/.test(named)
    ? `The sound plays on ${named}. With that output, macOS hears the ${track?.label} very badly. Choose the built-in speakers or headphones in the Sound settings of the Mac.`
    : undefined;
  log("call start:", { rate, gain, state: ctx.state, mic: track?.label, output, settings: track?.getSettings(), session: session?.type, gated });
  // A media pause of the system suspends the audio of the page when Yonder is the "Now Playing" app, which it is
  // during a call: the play/pause key, AirPods, or a tool that pauses the music when the microphone opens. Then the
  // microphone stops, and Grok hears nothing. So the audio resumes at once.
  // iOS interrupts the audio when another app takes it, and then suspends Yonder in the background. The socket to
  // Grok dies meanwhile, and the drop shows only when the user comes back.
  let paused = false;
  ctx.onstatechange = () => {
    log(`audio: ${ctx.state}`);
    if ((ctx.state as string) === "interrupted") paused = true;
    if (ctx.state === "suspended" && !ended) void ctx.resume();
  };
  const onVisibility = () => {
    log(`page: ${document.visibilityState}`);
    if (document.visibilityState === "visible") {
      void ctx.resume();
      void reattach();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const ws = claude
    ? undefined
    : eleven
    ? new WebSocket(secret.value)
    : openai
    ? new WebSocket(`wss://api.openai.com/v1/realtime?model=${secret.session?.model}`, ["realtime", `openai-insecure-api-key.${secret.value}`])
    : new WebSocket(`wss://api.x.ai/v1/realtime?model=grok-voice-latest`, [`xai-client-secret.${secret.value}`]);
  if (ws) ws.binaryType = "arraybuffer";
  // Android silences the microphone when the screen locks, unless a service of the app runs. cleanUp stops it.
  shell?.call(true);
  const send = (event: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(event));
  // The words since the last message to an agent, so that an agent gets the conversation, not only the request.
  // A message to an agent empties it, so no agent gets words that an earlier agent already got.
  const said: string[] = [];
  // The words of the user since Yonder last spoke, and the words of Yonder just before them. A message to an agent
  // empties `said`, so a close in the same answer reads these. runTool checks a close, complete or remove with them.
  let lastWho = "";
  let userTurn = "";
  let yonderTurn = "";
  let asked = "";
  const hear = (who: "User" | "Yonder", text: string) => {
    if (!text.trim()) return;
    if (who === "User") {
      if (lastWho !== "User") (asked = yonderTurn), (userTurn = "");
      userTurn += ` ${text.trim()}`;
    } else {
      if (lastWho !== "Yonder") yonderTurn = "";
      yonderTurn += ` ${text.trim()}`;
    }
    lastWho = who;
    if (said.push(`${who}: ${text.trim()}`) > 12) said.shift();
  };
  // Log the loudest sample every 5 seconds, so that a silent microphone shows in the log.
  let frames = 0;
  let peak = 0;
  // The loudness of the voice of the user, to tune the gain. The worklet measures each frame after the
  // gain and before the clip, so "raw" (divided by the gain) is the level of the microphone itself. The frames while
  // Yonder speaks and 300 ms after are left out: on the speaker they hold the echo of Yonder. "bars" is the level of
  // the AnalyserNode that moves the bars of the call button. The end of the call logs a sum-up (`mic loudness`).
  let loudest = 0;
  let bars = 0;
  let clipped = 0;
  let counted = 0;
  const loudness: number[] = [];
  const clips: number[] = [];
  // Full duplex: the microphone stays open while Grok talks, so that the user
  // can interrupt (server VAD hears the user and cancels the response). The
  // echo cancellation of getUserMedia keeps Grok's own voice out of the
  // microphone. On an iPhone without echo cancellation (`gated`), the frames are
  // silence while the voice plays and for 300 ms after, for the echo of the room.
  // shortcut: a fixed tail of 300 ms; make it longer if Yonder still hears its own last words.
  // A gap between frames shows in the log, so that a microphone that stalls at the start of a call shows.
  let lastFrame = 0;
  // The call shows as live only when the microphone is steady: 2.5 s after it opened, and 5 frames in a row with
  // no gap (see openMic and the end of startCall).
  let micReady = () => {};
  const steady = new Promise<void>((resolve) => (micReady = resolve));
  let inRow = 0;
  mic.port.onmessage = (e: MessageEvent<ArrayBuffer | Frame>) => {
    const f = frameOf(e.data);
    const echo = playing.size > 0 || ctx.currentTime < playAt + 0.3;
    const data = gated && echo ? new ArrayBuffer(f.pcm.byteLength) : f.pcm;
    if (!echo) {
      loudest = Math.max(loudest, f.rms);
      bars = Math.max(bars, level(micLevel) * lift);
      clipped += f.clip;
      counted += data.byteLength >> 1;
      loudness.push(f.rms);
      clips.push(f.clip);
    }
    const now = Date.now();
    if (lastFrame && now - lastFrame > 400) log(`mic: no frame for ${now - lastFrame} ms before frame ${frames + 1}`);
    inRow = lastFrame && now - lastFrame > 250 ? 0 : inRow + 1;
    if (inRow >= 5 && now - micOpenedAt >= 2500) micReady();
    lastFrame = now;
    let top = 0;
    for (const sample of new Int16Array(data)) top = Math.max(top, Math.abs(sample));
    peak = Math.max(peak, top);
    // ElevenLabs sends no event when the user starts to speak, so a loud frame holds back the news of the app
    // (quiet). shortcut: a fixed level; constant noise in the room can hold the news back.
    if (eleven && top > 0x8000 * 0.05) lastSound = now;
    if (++frames % 50 === 0) {
      const voice = counted ? `, voice rms ${loudest.toFixed(3)} (raw ${(loudest / gain).toFixed(4)}, bars ${bars.toFixed(3)}), clipped ${((100 * clipped) / counted).toFixed(1)}%` : "";
      // `queued`: the bytes that wait to go to the socket, so that a slow upload shows. A phone call can get
      // no audio 1.8 s after the start of an answer, where the same answer from the Mac takes 0.4 s.
      log(`mic: ${frames} frames, peak ${(peak / 0x8000).toFixed(3)}${voice}${ws ? `, socket ${ws.readyState}, queued ${ws.bufferedAmount}` : ""}`);
      peak = loudest = bars = clipped = counted = 0;
    }
    if (claude) brain?.frame(new Int16Array(data));
    else if (openai) send({ type: "input_audio_buffer.append", audio: b64(to24k(new Int16Array(data), rate).buffer) });
    else if (eleven) send({ user_audio_chunk: b64(data) });
    else if (ws?.readyState === WebSocket.OPEN) ws.send(data);
    if (frames === 1) log(`mic: first frame after ${Date.now() - id} ms`);
  };

  // The audio chunks play one after the other. When the user speaks, they stop.
  const playing = new Set<AudioBufferSourceNode>();
  let playAt = 0;
  let afterPlayback: (() => void)[] = [];
  function play(data: ArrayBuffer) {
    const pcm = new Int16Array(data, 0, data.byteLength >> 1);
    if (!pcm.length) return;
    // OpenAI and the voice of a Claude call (ElevenLabs) give 24 kHz.
    const buffer = ctx.createBuffer(1, pcm.length, openai || claude ? OPENAI_RATE : rate);
    const out = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(outLevel);
    playAt = Math.max(playAt, ctx.currentTime);
    source.start(playAt);
    playAt += buffer.duration;
    playing.add(source);
    source.onended = () => {
      playing.delete(source);
      if (playing.size) return;
      lastSound = Date.now();
      const waiting = afterPlayback;
      afterPlayback = [];
      waiting.forEach((fn) => fn());
    };
  }
  function hush() {
    for (const source of playing) {
      source.onended = null;
      source.stop();
    }
    playing.clear();
    playAt = 0;
    afterPlayback = []; // The answer to the user's new words replaces what was waiting.
  }

  // What xAI bills, and about how many tokens the context of Grok holds.
  // `billable_audio_seconds` is a running total for the session, and it grows
  // with the connected time, not with the speech. So never add it up.
  let connectedAt = 0;
  let billable = 0;
  // xAI sends no token counts in `response.done` (only `billable_audio_seconds`), so the app
  // counts the text of the context: the current prompt, and the words and tool calls of the call.
  // shortcut: about 4 characters a token, audio tokens and the tool schemas not counted.
  let prompt = instructions.length;
  let words = 0;
  let reported = 0; // From `usage.input_tokens`, if xAI starts to send it.
  const tokens = () => reported || Math.round((prompt + words) / 4);
  const seconds = () => Math.max(billable, connectedAt ? (Date.now() - connectedAt) / 1000 : 0);
  // OpenAI bills the tokens of each response, and the usage in `response.done` is for that response only, so add it up.
  let usd = 0;
  // shortcut: a Claude call shows no cost. ElevenLabs takes the characters of the voice from the credits of its plan,
  // and the brain uses the limits of the Claude plan. Count the characters if the cost matters.
  const cost = () => (claude ? 0 : openai ? usd : (seconds() / 60) * (eleven ? ELEVEN_PRICE_PER_MINUTE : PRICE_PER_MINUTE));
  const status = () => ({
    minutes: Number((seconds() / 60).toFixed(1)),
    cost_usd: Number(cost().toFixed(4)),
    context_tokens_about: tokens(),
    ...app.status(),
  });

  // The news of the app waits for a pause: nobody speaks, Grok has no response, and nothing played for QUIET_MS.
  let responding = false;
  let userSpeaking = false;
  let lastSound = Date.now();
  // Each call resolves to true when Grok must hear the result before it answers.
  const calls: Promise<boolean>[] = [];
  let spoke = false; // The current response already said something to the user.
  // Grok says its fixed words before the tool call, so the words can promise another tool. When the user
  // changes the request in the middle, Grok can say "Sent to 3." and only call close_worker.
  let voiced = ""; // The words of the current response.
  let promisedTurn = -1; // The turn that got a note about words with no tool call, so the note comes once.
  // The tool calls since the user last spoke. Grok can call a tool with no words, and say "Sent to 2." in the next
  // response, after the result. A list for each response misses that call: the app says that Grok
  // called no tool, Grok calls message_worker again, and then says "Sorry, I did nothing yet." after "Sent to 2.".
  const called: string[] = [];
  let turn = 0; // Goes up each time the user speaks, so that an old response does not continue.
  // After rebuild_app or end_call, the call ends when Grok stops talking, before the build quits the app.
  let ending = false;
  let closedTurn = -1; // The turn of the user in which Grok last closed, completed or removed an agent.
  let armed: { turn: number; num: number } | undefined; // The agent that got a message with closeWhenDone in this turn.
  // The time of each request or message to an agent. The speech to text can give the same words two times, and
  // Grok then sends the same thing again. One sentence of the user can come two times, 3 seconds apart.
  const sent = new Map<string, number>();
  // The user often stops for a breath in the middle of a request. Grok then calls start_worker at each stop, each time
  // with more of the same words, so one request with two pauses can start three agents. So a start_worker in a
  // later turn, less than 60 s after the last one, whose task begins with the same words, goes to that agent instead.
  // shortcut: the first 60 letters and digits must match; compare more of the task if Grok rewords the requests.
  let lastStart: { turn: number; at: number; key: string; num: number } | undefined;
  // The tasks of the start_worker calls of the current turn. When the user says a part of one request again,
  // Grok can call start_worker three times in one answer and say "Started three agents.", but only one agent starts.
  let turnTasks: { turn: number; tasks: string[] } = { turn: -1, tasks: [] };
  // The tool that the fixed words promise ("Sent to 3." or "Agent 4 started."), when the response did not call it.
  const wrongWords = (words: string, names: string[]) =>
    /\bsent to\b/i.test(words) && !names.includes("message_worker")
      ? "message_worker"
      : saysStarted(words) && !names.includes("start_worker")
        ? "start_worker"
        : "";
  const opening = (task: string) => task.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
  // The agents that the talk since the last message to an agent is about: the agent of that message, and each agent
  // that Grok read or opened since then.
  const known = new Set<number>();
  // False from the start of the speech of the user until its words arrive. In 23 of 2,690 turns of one sample,
  // Grok called a tool before the words arrived. Then the app cannot check the words, so it sends the message.
  let heardUser = true;
  async function runTool({ call_id, name, arguments: args }: { call_id: string; name: string; arguments: string }) {
    let output: string;
    let failed = false;
    let upToDate = false; // rebuild_app found nothing new, so Grok must say so.
    const input = JSON.parse(args || "{}");
    // A tool of another computer (other_computer) gets the same checks of the words of the user as here. The checks of
    // the numbers of the agents below stay out, because its numbers are of the other computer.
    const far = name === "other_computer" && input.computer ? { tool: String(input.tool ?? "list_workers"), args: (input.arguments ?? {}) as Record<string, unknown> } : undefined;
    const act = far?.tool ?? name;
    const actIn = far?.args ?? input;
    // A close, complete or remove waits up to 3 s for the words of the user, so that it is checked against them and
    // not against the turn before. In 23 of 2,690 turns of one sample, Grok called a tool before the words came.
    for (let waited = 0; GROUPS.has(act) && !heardUser && waited < 3000; waited += 100) await new Promise((r) => setTimeout(r, 100));
    // The same check for every voice (Grok, OpenAI, ElevenLabs): the last words of the user must ask for it.
    const unasked = GROUPS.has(act) && (!asksClose(userTurn, asked) ? "one" : actIn.tab && !asksGroup(userTurn, asked) ? "group" : "");
    // A plain "close it" goes to the Closed tab there too, as `done` below does here.
    if (act === "close_worker" && far && !asksComplete(userTurn, asked)) input.arguments = { ...far.args, done: undefined };
    const target = ["message_worker", "get_worker", "show_agent"].includes(name) ? app.agent(String(input.worker ?? input.agent ?? "")) : undefined;
    // A message to a running agent goes only to an agent that the talk names, that Grok read or messaged since the
    // last message, or whose conversation is open. Otherwise it is a new task, and it would stop or wait for other
    // work. Else a vague "tell that agent" can go with now to an agent that does unrelated work. The words of the current response do not count,
    // because Grok says "Sent to 3." before it calls the tool.
    const lastUser = said.map((l) => l.startsWith("User: ")).lastIndexOf(true);
    const talk = said.filter((l, i) => i <= lastUser).join("\n");
    // shortcut: Grok's own "Sent to 3." of a refused call stays in the talk until the next message, and lets a later
    // message to 3 go through. Drop the lines of Grok that start with "Sent to" if that sends wrong messages.
    const busy = name === "message_worker" && heardUser && target?.running && !target.open && !known.has(target.num) && !names(talk, target.num) ? target : undefined;
    // A close or complete of the agent that Grok started in the last minute goes through only when the user says its
    // number. Else the speech to text can turn other words into "Task completed.", and complete_worker stops the
    // new agent.
    const fresh = (name === "close_worker" || name === "complete_worker") && lastStart && String(input.worker ?? "") === String(lastStart.num) &&
      Date.now() - lastStart.at < 60_000 && heardUser && !names(talk, lastStart.num) ? lastStart.num : undefined;
    // "Tell 3 to deploy it and close it" is one action: a message with closeWhenDone, and the agent closes itself after
    // the work. A close_worker of that agent in the same turn would stop the work that it just got, so it does not go
    // through. The message sets it before its first await, so a close in the same answer sees it.
    if (name === "message_worker" && input.closeWhenDone && target) armed = { turn, num: target.num };
    const selfClose = name === "close_worker" && armed?.turn === turn && app.agent(String(input.worker ?? ""))?.num === armed.num ? armed.num : undefined;
    // The attached images go with the next request or message to an agent.
    const task = name === "start_worker" ? String(JSON.parse(args || "{}").task ?? "") : "";
    if (turnTasks.turn !== turn) turnTasks = { turn, tasks: [] };
    const twin = !!task && turnTasks.tasks.some((t) => sameRequest(t, task));
    if (task && !twin) turnTasks.tasks.push(task);
    const again = (SENDS.has(name) && !busy && Date.now() - (sent.get(name + args) ?? 0) < 30_000) || twin;
    if (SENDS.has(name) && !busy) sent.set(name + args, Date.now());
    const more =
      task && lastStart && lastStart.turn !== turn && Date.now() - lastStart.at < 60_000 && opening(task).length === 60 && opening(task) === lastStart.key
        ? lastStart.num
        : undefined;
    if (GROUPS.has(name) && fresh === undefined && selfClose === undefined && !unasked) closedTurn = turn;
    // The note about wrong words must not tell Grok to say that it did a refused call.
    if (fresh !== undefined || selfClose !== undefined || unasked) called[called.lastIndexOf(name)] = "nothing";
    const attached = SENDS.has(name) && !again && !busy ? await images.paths() : [];
    try {
      output =
        unasked === "one"
          ? `Not done: the last words of the user do not ask to close, complete or remove an agent. NEVER do it on your own. If you think that the user wants it, ask only "${act === "remove_worker" ? "Remove" : act === "complete_worker" ? "Mark as completed" : "Close"} ${actIn.worker ?? "them"}?" and wait for the answer.`
          : unasked === "group"
          ? 'Not done: the user did not name a group, such as "all" or "the completed ones". Ask only "Just this one, or all of them?" and wait for the answer.'
          : selfClose !== undefined
          ? `Not closed: agent ${selfClose} closes itself when its work is done, because its message has closeWhenDone. Do not close it now.`
          : fresh !== undefined
          ? `Not done: you started agent ${fresh} less than a minute ago, and the user did not say its number. If the user wants to see the Completed tab, call show_tab with completed. Otherwise ask "Close the new agent ${fresh}?"`
          : busy
          ? `Not sent: agent ${busy.num} runs another task: "${busy.task.replace(/\s+/g, " ").slice(0, 120)}". The user did not name agent ${busy.num}, so this can be a new task. Say only "Not sent. Agent ${busy.num} works on something else. Send it to ${busy.num}, or start a new agent?" Then do what the user answers: message_worker for agent ${busy.num}, or start_worker for a new agent.`
          : again && name === "start_worker"
          ? 'Not started: an agent already has this request, so no new agent started. If your words gave another number of agents, say only "Sorry, I started" and the true number of new agents, with their numbers from the other results.'
          : again
          ? "Not sent: you sent the same thing less than 30 seconds ago. Do not say that you sent it again."
          : SENDS.has(name) && args?.includes("[Yonder app]")
          ? "Not sent: a [Yonder app] note is not a request of the user. Do not start an agent or send a message for it."
          : more !== undefined
          ? (await callTool("message_worker", {
              worker: String(more),
              message: `I said more of the same request. This is all of it:\n\n${task}`,
              now: true,
              ...(said.length ? { context: said.join("\n") } : {}),
              ...(attached.length ? { files: attached } : {}),
              call: String(id),
            }),
            `Not a new agent: the user only said more of the request of agent ${more}, so all the words went to agent ${more}. Say only "No new agent. Sent to ${more}."`)
          : name === "call_status"
          ? JSON.stringify(status())
          : name === "get_screen"
            ? screen()
            : name === "show_workspace" || name === "show_project"
              ? await show(JSON.parse(args || "{}").workspace ?? JSON.parse(args || "{}").project ?? "")
              : name === "show_agent"
                ? showAgent(String(JSON.parse(args || "{}").agent ?? ""), closedTurn === turn)
              : name === "show_tab"
                ? app.showTab(JSON.parse(args || "{}").tab ?? "")
              : name === "set_theme"
                ? app.setTheme(JSON.parse(args || "{}").theme ?? "")
              : name === "pair_phone"
                ? app.pairPhone()
              : name === "read_paste"
                ? (app.pasted().map((t, i) => `Text ${i + 1}:\n${t.slice(0, 20_000)}`).join("\n\n") || "The user has not pasted any text.")
              : name === "get_location" && phone
                ? await located()
              : name === "switch_environment"
                ? await app.switchEnvironment(String(input.environment ?? ""))
              : name === "other_environments"
                ? await app.otherAgents()
              : name === "other_computer" && phone
                ? await onOther(String(input.computer ?? ""), String(input.tool ?? "list_workers"), (input.arguments ?? {}) as Record<string, unknown>)
                    .then((r) => (r.error ? Promise.reject(new Error(r.text)) : r.text))
                : name === "preview" && JSON.parse(args || "{}").action === "open"
                  ? JSON.stringify(await showSite(JSON.parse(args || "{}")))
                : name === "show_app"
                  ? openPage(await callTool(name, { ...JSON.parse(args || "{}"), call: String(id) }))
                : name === "end_call"
                  ? "The call ends when you stop talking."
                  : await callTool(name, {
                    ...input,
                    // A plain "close it" goes to the Closed tab: the voices set done for it, and the agent stayed on the Done tab.
                    ...(name === "close_worker" && !asksComplete(userTurn, asked) ? { done: undefined } : {}),
                    // A group of agents is always in the project on the screen, when there is one.
                    // Both names: a newer bridge keeps `workspace`, an older one reads `project`.
                    ...((GROUPS.has(name) || name === "review_workers") && JSON.parse(args || "{}").tab && focus() ? { workspace: focus()!.path, project: focus()!.path } : {}),
                    ...(name === "list_workers" && !JSON.parse(args || "{}").query && focus() ? { workspace: focus()!.path, project: focus()!.path } : {}),
                    ...(SENDS.has(name) && said.length ? { context: said.join("\n") } : {}),
                    // The ID of the call also tells the bridge that the voice closed an agent (closedBy).
                    ...(SENDS.has(name) || name === "close_worker" ? { call: String(id) } : {}),
                    ...(attached.length ? { files: attached } : {}),
                    // The bridge says "up to date" only when this app already runs the newest front end.
                    ...(name === "rebuild_app" ? { build: running.build } : {}),
                  });
      if (task && more === undefined && !again) {
        const num = Number((JSON.parse(output) as { num?: number }).num);
        if (Number.isFinite(num)) lastStart = { turn, at: Date.now(), key: opening(task), num };
      }
      if (attached.length) images.sent(attached);
      // An agent has these words now, so the next agent gets only the words after them.
      if (SENDS.has(name) && !busy) {
        said.length = 0;
        known.clear();
      }
      const num = more ?? (name === "start_worker" ? Number(/"num":(\d+)/.exec(output)?.[1]) : target?.num);
      if (num && ((SENDS.has(name) && !busy) || name === "get_worker" || name === "show_agent")) known.add(num);
      // An update ends the call when Grok stops talking, on the Mac and on the phone, so the new version loads with
      // no click. When Yonder is up to date, the call goes on, and Grok hears the result.
      upToDate = name === "rebuild_app" && output.includes('"upToDate":true');
      if ((name === "rebuild_app" && !upToDate) || name === "end_call") ending = true;
      // An update by voice is the accept of the user, so the iPhone loads the new front end after the call (front.ts).
      if (name === "rebuild_app" && !upToDate) accept();
      // A search with query covers all the projects. Else Grok cannot see an agent of the Completed
      // tab, and it starts a new agent.
      // The bridge gave only the agents of that project (`project` above).
      const project = name === "list_workers" && !JSON.parse(args || "{}").query && focus();
      if (project) output = `Only the agents of ${project.name}, because the user works on it. To see another workspace, call show_workspace.\n${output}`;
    } catch (e) {
      output = `Error: ${(e as Error).message}`;
      failed = true;
      if (more !== undefined) lastStart = undefined; // The agent is gone, so the next start_worker starts a new one.
    }
    // Grok says "Agent 4 started." with the number of the next new agent from the prompt, before the agent has it. The
    // number comes in those words, not in a second answer ("Agent started." and then "It's agent 4."). The result asks for the number only when Grok said another number or none (a split job).
    const given = name === "start_worker" && !failed ? Number(/"num":(\d+)/.exec(output)?.[1]) : 0;
    const started = given && !names(voiced, given) ? given : 0;
    if (started) {
      const other = startedNum(voiced);
      // "It's agent 4.", or the name of the agent: "It's Nova." or "It's Sundial." (`agentNaming` in config.json).
      const it = word.naming === "numbers" ? `agent ${started}` : app.label(started, /"project":"([^"]*)"/.exec(output)?.[1] ?? "");
      output += other ? `\nYou said ${/^\d+$/.test(other) ? `agent ${other}` : other}, but it is ${it}. Say only "Sorry, it's ${it}."` : `\nThe user does not know the number yet. Say only "It's ${it}."`;
    }
    // The words of the result use the word of the user for an agent, as the prompt does (`swap` in src/names.ts).
    output = swap(output);
    words += output.length;
    // Grok already said "Agent 4 started." when the words went to an earlier agent, so it must correct that.
    const news = failed || upToDate || more !== undefined || busy !== undefined || !!started || (again && name === "start_worker") || !ACTIONS.has(name);
    // ElevenLabs always speaks again after a tool result, also with "say nothing" in the result or with a tool that
    // does not wait: "Agent started. I have started an agent to fix the login button." So, as
    // Grok's response.done does, the app drops that answer when the agent spoke in this turn and no result has news.
    if (eleven) {
      newsTurn ||= news;
      silent = spoke && !newsTurn;
    }
    send(eleven ? { type: "client_tool_result", tool_call_id: call_id, result: output, is_error: failed } : { type: "conversation.item.create", item: { type: "function_call_output", call_id, output } });
    return news;
  }

  let heard = 0;
  // Audio of a response that the user interrupted can still arrive. Drop it
  // until the next response starts.
  let interrupted = false;
  // Claude: the app hears and speaks, and the brain decides. Made below, when all the parts of the call are ready.
  let brain: ReturnType<typeof brainCall> | undefined;
  const quiet = (ms = QUIET_MS) => !responding && !brain?.talking() && !userSpeaking && !playing.size && !calls.length && Date.now() - lastSound > ms;
  // ElevenLabs: the event id of the last interruption. The audio of earlier turns is dropped, as in the ElevenLabs SDK.
  let cutAt = 0;
  // ElevenLabs: `silent` drops the words of the agent until the user speaks again (runTool), and `newsTurn` is true
  // when a tool result of this turn has news for the user.
  let silent = false;
  let newsTurn = false;
  // ElevenLabs gives no end of a response. After end_call or rebuild_app, the call ends after 2 s with no sound.
  // shortcut: the loud frames of the microphone also count as sound, so in a loud room the call stays on until
  // the user clicks End call; end after a fixed time if that happens.
  const endWhenQuiet = () => (quiet(2000) ? end() : setTimeout(endWhenQuiet, 300));
  // ElevenLabs gives the words of the agent before its tool calls, and continues after a tool result by itself.
  // So the checks of Grok's fixed words (wrongWords) and the response.create after the results are not needed.
  function onEleven(event: any) {
    if (event.type !== "audio" && event.type !== "ping") {
      const detail = event.user_transcription_event?.user_transcript ?? event.agent_response_event?.agent_response ?? event.client_tool_call?.tool_name ?? "";
      log(`event: ${event.type}`, detail || (event.type === "conversation_initiation_metadata" ? JSON.stringify(event.conversation_initiation_metadata_event) : ""));
    }
    switch (event.type) {
      case "ping":
        send({ type: "pong", event_id: event.ping_event.event_id });
        break;
      case "audio": {
        if (silent || event.audio_event.event_id < cutAt) break;
        const bytes = Uint8Array.from(atob(event.audio_event.audio_base_64), (c) => c.charCodeAt(0));
        heard += bytes.length;
        play(bytes.buffer);
        break;
      }
      case "interruption":
        cutAt = event.interruption_event.event_id;
        hush();
        break;
      case "user_transcript": {
        const text: string = event.user_transcription_event.user_transcript ?? "";
        turn++;
        spoke = silent = newsTurn = false;
        voiced = "";
        // No `responding` for ElevenLabs: it gives no end of a response. The audio and the tool calls hold back the
        // news (quiet) instead, and the answer comes well within QUIET_MS.
        lastSound = Date.now();
        words += text.length;
        record(id, "you", text);
        hear("User", text);
        break;
      }
      case "agent_response": {
        const text: string = event.agent_response_event.agent_response ?? "";
        if (silent) break; // The user did not hear it.
        if (text.trim()) spoke = true;
        voiced += ` ${text}`; // runTool checks the agent number in it.
        lastSound = Date.now();
        words += text.length;
        record(id, "yonder", text);
        hear("Yonder", text);
        break;
      }
      case "client_tool_call": {
        const { tool_call_id, tool_name, parameters } = event.client_tool_call;
        const args = JSON.stringify(parameters ?? {});
        words += tool_name.length + args.length;
        record(id, "tool", `${tool_name} ${args}`);
        const done = runTool({ call_id: tool_call_id, name: tool_name, arguments: args }).finally(() => {
          if (calls.includes(done)) calls.splice(calls.indexOf(done), 1);
          if (ending) endWhenQuiet();
        });
        calls.push(done);
        break;
      }
    }
  }
  if (ws) ws.onmessage = async ({ data }) => {
    if (eleven) return onEleven(JSON.parse(data));
    if (data instanceof ArrayBuffer) {
      // The first audio of the call, so that a silent call shows whether the voice came and the speaker could play it.
      if (!heard) log(`audio: first answer after ${Date.now() - id} ms, ${ctx.state}`);
      heard += data.byteLength;
      if (!interrupted) play(data);
      return;
    }
    const event = JSON.parse(data);
    if (!/delta|^ping$/.test(event.type)) {
      const detail = event.transcript ?? event.error?.message ?? event.name ?? event.response?.status ?? "";
      log(`event: ${event.type}`, detail || (event.session ? `${event.session.model ?? ""} voice ${event.session.voice ?? event.session.audio?.output?.voice}, ${event.session.tools?.length} tools` : ""), event.type === "response.done" ? `audio ${heard} bytes, usage ${JSON.stringify(event.usage ?? event.response?.usage)}` : "");
    }
    switch (event.type) {
      case "response.output_audio.delta": {
        // OpenAI sends the audio in base64 in JSON events, not in binary frames. Grok sends binary frames only.
        if (!openai) break;
        const pcm = Uint8Array.from(atob(event.delta ?? ""), (c) => c.charCodeAt(0));
        heard += pcm.byteLength;
        if (!interrupted) play(pcm.buffer);
        break;
      }
      case "input_audio_buffer.speech_started":
        turn++;
        called.length = 0;
        heardUser = false;
        userSpeaking = true;
        responding = false; // Server VAD cancels the response that runs.
        lastSound = Date.now();
        interrupted = true;
        calls.length = 0; // Their results still arrive, as context for the next answer.
        hush();
        break;
      case "input_audio_buffer.speech_stopped":
        userSpeaking = false;
        lastSound = Date.now();
        break;
      case "response.created":
        responding = true;
        lastSound = Date.now();
        interrupted = false;
        spoke = false;
        voiced = "";
        break;
      case "conversation.item.input_audio_transcription.completed":
        words += event.transcript?.length ?? 0;
        record(id, "you", event.transcript ?? "");
        hear("User", event.transcript ?? "");
        heardUser = true;
        break;
      case "response.output_audio_transcript.done":
        if (event.transcript?.trim()) spoke = true;
        voiced += ` ${event.transcript ?? ""}`;
        words += event.transcript?.length ?? 0;
        record(id, "yonder", event.transcript ?? "");
        hear("Yonder", event.transcript ?? "");
        break;
      case "response.function_call_arguments.done":
        words += (event.name?.length ?? 0) + (event.arguments?.length ?? 0);
        record(id, "tool", `${event.name} ${event.arguments ?? ""}`);
        called.push(event.name);
        calls.push(runTool(event));
        break;
      case "response.done": {
        const usage = event.usage ?? event.response?.usage; // xAI puts it on the event, OpenAI on the response.
        billable = Math.max(billable, usage?.billable_audio_seconds ?? 0);
        // The input of each response is the whole context so far, so the latest response gives the size.
        if (usage?.input_tokens) reported = usage.input_tokens + (usage.output_tokens ?? 0);
        if (openai && usage) {
          const i = usage.input_token_details ?? {};
          const c = i.cached_tokens_details ?? {};
          const o = usage.output_token_details ?? {};
          const p = OPENAI_PRICE;
          usd += (((i.text_tokens ?? 0) - (c.text_tokens ?? 0)) * p.text + ((i.audio_tokens ?? 0) - (c.audio_tokens ?? 0)) * p.audio + (i.cached_tokens ?? 0) * p.cached + (o.text_tokens ?? 0) * p.textOut + (o.audio_tokens ?? 0) * p.audioOut) / 1e6;
        }
        lastSound = Date.now();
        // Grok continues after the results of its tool calls, so the response is not over yet.
        responding = calls.length > 0;
        // Words that promise a tool that no response of this turn called. Grok can say "Agent started." and
        // call nothing, and then the request of the user is lost. Grok gets one more response to do it or to correct its words.
        // shortcut: words that promise another tool than an earlier response called ("Sent to 3." after a close_worker)
        // also get this note, so Grok can say "I did nothing yet." after the close. Give them the note of wrong words then.
        const missing = !calls.length && !ending && !interrupted && !userSpeaking && promisedTurn !== turn ? wrongWords(voiced, called) : "";
        if (missing) {
          promisedTurn = turn;
          const note = `[Yonder app] This note is from the app, not a request of the user. You said "${voiced.trim()}", but you did not call ${missing}, so nothing happened. If the user asked for it, call ${missing} now and say nothing more. If not, say only "Sorry, I did nothing yet."`;
          send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: note }] } });
          playing.size ? afterPlayback.push(() => send({ type: "response.create" })) : send({ type: "response.create" });
          responding = true;
          break;
        }
        if (calls.length) {
          // Send every result first, then let the agent continue after it stops talking.
          const current = turn;
          const promised = wrongWords(voiced, called);
          // No example with a real number: Grok can say the example "I closed 3." word for word, and start an agent with this note as its task.
          const did = called.map((n) => DID[n] ?? `I used ${n}.`).join(" ");
          const note = `[Yonder app] This note is from the app, not a request of the user. Call NO tool for it. You said "${voiced.trim()}", but you did not call ${promised}: you called ${called.join(", ")}. Say one short sentence that corrects it, in this form: "Sorry, wrong words. ${did}" Put the agent numbers from the tool results in place of <number>. Say nothing that you did not do.`;
          const needed = await Promise.all(calls.splice(0));
          if (current !== turn) break;
          if (promised) {
            send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: note }] } });
            needed.push(true);
          }
          // Grok often says "Sent." in the same response as the action. Another
          // response then only says it again, so skip it unless a result has news.
          // After the note about words with no tool call, the user already heard the words. Else Grok says
          // "Sent to 3.", calls message_worker after the note with no words, and then says "Sent to 3." again.
          if ((!spoke && promisedTurn !== turn) || needed.includes(true)) {
            playing.size ? afterPlayback.push(() => send({ type: "response.create" })) : send({ type: "response.create" });
            break;
          }
          responding = false;
        }
        if (ending) playing.size ? afterPlayback.push(() => end()) : end();
        break;
      }
      case "error":
        console.warn(`${vendor}:`, event.error ?? event);
        Sentry.captureMessage(`${vendor}: ${event.error?.message ?? JSON.stringify(event.error ?? event)}`, "warning");
        break;
    }
  };

  // The sum-up of the loudness of the user for the whole call. The quietest 20% of the frames are the room. A frame
  // 12 dB above the room is speech. Speech for speech to text is best at an RMS of about 0.1 (-20 dBFS), so the line
  // gives the gain that brings the median of the speech there.
  function logLoudness() {
    const sorted = [...loudness].sort((a, b) => a - b);
    const room = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
    const speech = loudness.map((rms, i) => ({ rms, clip: clips[i] })).filter((f) => f.rms > room * 4 && f.rms > 0.001 * gain);
    if (!speech.length) return log(`mic loudness: no speech in ${loudness.length} frames, room rms ${room.toFixed(4)}, gain ${gain}`);
    const rms = speech.map((f) => f.rms).sort((a, b) => a - b);
    const at = (q: number) => rms[Math.min(rms.length - 1, Math.floor(rms.length * q))];
    const clip = (100 * speech.reduce((n, f) => n + f.clip, 0)) / (speech.length * (rate / 10));
    const pair = (v: number) => `${v.toFixed(3)} (raw ${(v / gain).toFixed(4)})`;
    log(
      `mic loudness: gain ${gain}, speech ${speech.length} of ${loudness.length} frames, speech rms median ${pair(at(0.5))}, ` +
        `p90 ${pair(at(0.9))}, room rms ${pair(room)}, clipped ${clip.toFixed(1)}% of speech, gain for a median of 0.1: ${((0.1 * gain) / at(0.5)).toFixed(1)}`,
    );
  }

  let ended = false;
  function cleanUp() {
    if (ended) return false;
    ended = true;
    logLoudness();
    // The brain of a Claude call stops with the call, also when the call ended before the brain was made.
    if (claude) brain ? brain.end() : void bridgeFetch("/brain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ call: String(id), end: true }) }).catch(() => {});
    document.removeEventListener("visibilitychange", onVisibility);
    navigator.mediaDevices.removeEventListener("devicechange", onRoute);
    ws?.close();
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    callMic = false;
    if (session) session.type = "auto";
    shell?.call(false);
    return true;
  }
  const end = (error?: string) => {
    if (cleanUp()) onEnd(error);
  };

  if (ws) await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onclose = (e) => {
      cleanUp();
      reject(new Error(`${vendor} refused the call: ${e.reason || `code ${e.code}`}`));
    };
  });
  if (claude) {
    const json = (body: object) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const ok = async (r: Response) => (r.ok ? r : Promise.reject(new Error((await r.text()) || `status ${r.status}`)));
    brain = brainCall({
      rate,
      post: (body) => bridgeFetch("/brain", json({ call: String(id), ...body })).then(ok).then((r) => r.json()),
      poll: (after) => bridgeFetch(`/brain?call=${id}&after=${after}`).then(ok).then((r) => r.json()),
      dictate: (turn, part, end) =>
        bridgeFetch(`/dictate?id=${turn}${end ? "&end" : ""}${stt()}`, { method: "POST", body: part }).then(ok).then((r) => r.json()).then((d: { text: string }) => d.text),
      // An older bridge has no /speak: the Mac answers 404, and the relay of the phone 403.
      speak: (text) =>
        bridgeFetch("/speak", json({ text })).then((r) =>
          [403, 404].includes(r.status) ? Promise.reject(new Error("the bridge is too old for a Claude call. Restart the bridge.")) : ok(r).then((r) => r.arrayBuffer()),
        ),
      play,
      hush,
      playing: () => playing.size > 0,
      heard: (text) => {
        lastSound = Date.now();
        words += text.length;
        record(id, "you", text);
        hear("User", text);
      },
      spoke: (text) => {
        lastSound = Date.now();
        words += text.length;
        record(id, "yonder", text);
        hear("Yonder", text);
      },
      note: (e) => {
        log(`brain: ${e.type}`, e.text);
        if (e.type === "tool") {
          words += e.text.length;
          record(id, "tool", e.text);
        }
      },
      log: (text) => log(`claude call: ${text}`),
      // The tools of the screen run as those of Grok do. The brain does not wait for them (appTool in bridge/brain.ts).
      app: (name, input) =>
        void Promise.resolve(
          name === "show_tab" ? app.showTab(input.tab ?? "")
          : name === "show_agent" ? showAgent(input.agent ?? "", false)
          : name === "show_project" ? show(input.project ?? "")
          : name === "show_app" || name === "show_artifact" ? openPage(JSON.stringify(input))
          : `No tool ${name}.`,
        ).then((result) => log(`brain app: ${name}`, result), (e: Error) => log(`brain app: ${name} failed`, e.message)),
      screen,
      // As end_call of Grok: the call ends when the last words played.
      hangUp: () => (playing.size ? afterPlayback.push(() => end()) : end()),
      fail: (message) => end(message),
    });
  }
  if (ws) ws.onclose = (e) => {
    log(`call closed: ${e.code} ${e.reason}`);
    // 1006: the socket died with no close frame, usually because the device lost its network.
    end(e.code === 1006 && !e.reason
      ? paused
        ? `The call ended: iOS paused Yonder in the background, and the connection to ${vendor} dropped. Start the call again.`
        : `The call ended: the connection to ${vendor} dropped. Check the network and start the call again.`
      : `The call ended: ${e.reason || `code ${e.code}`}`);
  };
  const setup = {
    type: "session.update",
    session: {
      // The voice of the account: a super user sets it for everyone, and staff for one account (yonder.so).
      voice: saved()?.account.voice || "liora",
      instructions,
      turn_detection: { type: "server_vad", silence_duration_ms: SILENCE_MS },
      tools: [
        // xAI runs these on its side: web search and X search.
        { type: "web_search" },
        { type: "x_search" },
        ...functions,
      ],
      audio: {
        input: { format: { type: "audio/pcm", rate }, transport: "binary" },
        output: { format: { type: "audio/pcm", rate }, transport: "binary" },
      },
    },
  };
  // OpenAI gets the same prompt and tools in its own form, with no web search and no X search. It needs the
  // transcription model for the words of the user, which the transcript and the checks of runTool use.
  // ElevenLabs: the prompt of this call replaces the short prompt of the agent. The agent allows only this override.
  if (eleven) send({ type: "conversation_initiation_client_data", conversation_config_override: { agent: { prompt: { prompt: instructions } } } });
  else if (!claude) send(openai
    ? {
        type: "session.update",
        session: {
          type: "realtime",
          instructions,
          tools: setup.session.tools.filter((t) => t.type === "function"),
          audio: {
            input: {
              format: { type: "audio/pcm", rate: OPENAI_RATE },
              turn_detection: { type: "server_vad", silence_duration_ms: SILENCE_MS },
              transcription: { model: "gpt-4o-mini-transcribe" },
            },
            output: { format: { type: "audio/pcm", rate: OPENAI_RATE }, voice: "marin" },
          },
        },
      }
    : setup);

  // "End call" and the chime come when the microphone is steady, so that the user does not talk into a microphone
  // that does not work yet. After 6 s the call goes on anyway, and the log shows it.
  if (await Promise.race([steady.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 6000))])) log(`mic: steady after ${Date.now() - micOpenedAt} ms`);
  else log("mic: not steady after 6 s");
  if (ended) throw new Error("The call ended while it started.");
  // The start chime plays on the AudioContext of the call (see chime).
  chime(true, ctx);
  connectedAt = Date.now();
  let lines = new Set(instructions.split("\n"));
  return {
    connectedAt,
    warning,
    cost,
    tokens,
    // Replaces the system prompt, so that the context does not grow with each change.
    // ElevenLabs cannot replace the prompt during a call, so it gets only the lines that changed, as context.
    // shortcut: a line that is gone (an agent left the list) does not reach it; send the whole section if that matters.
    update: (text) => {
      // The brain reads the state of the agents with its tools, and gets the screen with the words of the user.
      if (claude) return;
      if (eleven) {
        const fresh = text.split("\n").filter((line) => line.trim() && !lines.has(line));
        lines = new Set(text.split("\n"));
        if (fresh.length) {
          words += fresh.join("\n").length;
          send({ type: "contextual_update", text: `[Yonder app] These lines of your instructions changed. Each one replaces the earlier line about the same agent or the same part of the screen:\n${fresh.join("\n")}` });
        }
        return;
      }
      prompt = text.length;
      send({ type: "session.update", session: { ...(openai ? { type: "realtime" } : {}), instructions: text } });
    },
    // The app gives Grok news without words of the user, and Grok answers it aloud after its current speech.
    // shortcut: only waits for audio, so news during a response with no audio yet can be lost; track the response state if that happens.
    tell: (news) => {
      const text = swap(news);
      // The brain decides what the user hears of the news, and it can answer "(quiet)".
      if (brain) return brain.tell(text);
      const go = () => {
        words += text.length;
        // ElevenLabs answers a text message of the user by itself.
        if (eleven) {
          spoke = silent = newsTurn = false;
          return send({ type: "user_message", text });
        }
        send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
        send({ type: "response.create" });
      };
      playing.size ? afterPlayback.push(go) : go();
    },
    quiet,
    // A muted track sends silence, so server VAD hears nothing and the call stays on.
    mute: (on) => {
      muted = on;
      if (track) track.enabled = !on;
      log(on ? "mic muted" : "mic unmuted");
    },
    levels: () => ({ mic: level(micLevel) * lift, out: level(outLevel) }),
    hangUp: () => end(),
    // The phone moved to another Mac (moveTo in src/link.ts). Each agent number so far is of the old Mac, so the checks
    // of runTool forget them, and the next agent gets no words about the agents of the old Mac. A Claude call ends: its
    // brain runs on the old Mac with the tools of that Mac. App.tsx calls this before the move, so the end goes there.
    moved: () => {
      if (claude) return end("The call ended: a Claude call stays on its Mac. Start the call again to talk to the other Mac.");
      said.length = 0;
      known.clear();
      sent.clear();
      lastStart = undefined;
    },
  };
}
