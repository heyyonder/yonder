# The voice module

A plan only. Nothing in the code changed. The plan makes voice an
optional module of Yonder, in its own folder, with providers that the
user can plug in. Yonder becomes free and open source, with no paid plan
and no hosted cloud for now.

This plan builds on two earlier decisions: the user brings their own
voice models and Yonder stores no data, and Yonder is free, with no paid
plan.

The user docs of the module are in `docs/voice/`. This file is the plan
for the code.

## In short

- Voice moves to one top-level folder, `voice/`, next to `src/`,
  `bridge/`, `themes/` and `plugins/`. Each provider is one folder in
  `voice/providers/`.
- A provider is one of three kinds:
  - **realtime**: a speech-to-speech model in the cloud. The phone opens
    the socket with a short-lived token from the bridge. Grok, OpenAI and
    ElevenLabs are of this kind.
  - **pipeline**: three slots on the computer: hear (speech to text),
    think (the brain), and speak (text to speech). Each slot is
    pluggable. The Claude call of today is of this kind. Local speech on
    the laptop is of this kind.
  - **url**: your own voice server, at a WebSocket address that you give.
    It speaks a small subset of the OpenAI realtime events, and sends its
    tool calls to the phone as Grok does. A Pipecat bot is of this kind.
- The settings of the module go in `~/.config/yonder/config.json`, in
  the Voice section of the Settings schema. An agent or the user edits
  them with no restart. The keys stay in `~/.config/yonder/.env`.
- `"voiceProvider": "off"` hides the call button. The chat and the dictation of
  the system stay.
- Remove all the paid gates of the calls: the plan check, the sign-in,
  the verified email, the super user gate and the hosted Grok token.
- Keep each endpoint of the bridge the same on the wire (`/token`,
  `/token?check`, `/dictate`, `/speak`, `/brain`). The apps in the
  stores and the Swift calls use them.

## How voice works today

### The call

Calls start only on the phone (`toggleCall` in `src/App.tsx` returns when
`!phone`). The webview of the phone records and plays the audio.

| Part | Where | What it does |
|---|---|---|
| `src/voice.ts` (1,337 lines) | Phone | The call: the microphone, the playback, the echo gate, the news of the app, the tools, the transcript. The four providers are inline, at 37 branch points. |
| `src/brain.ts` | Phone | The Claude call: it sends the sound to `/dictate`, polls `/brain`, and plays `/speak`. |
| `src/pcm.ts`, `public/mic-worklet.js` | Phone | The PCM helpers and the microphone worklet. |
| `token()` and `/token` in `bridge/main.ts` | Computer | A short-lived token of xAI or OpenAI, from the key in `.env`. `?check` gives `keys`, the providers whose key is in `.env` (`VOICE_KEYS`), and `key`, if the computer has `XAI_API_KEY`. A POST makes the signed URL of ElevenLabs. |
| `bridge/eleven.ts` | Computer | The ElevenLabs agent and the voice (`speak`) of the Claude call. |
| `bridge/brain.ts` | Computer | The brain of the Claude call: a Claude Code session that makes the tool calls. |
| `/speak` in `bridge/main.ts` | Computer | ElevenLabs for the Claude call, or a Grok voice for the listen button. |
| `CarCall.swift` (iOS), `VoiceCall.swift` (SwiftUI) | Phone, native | Two copies of the call in Swift, always Grok. |

The branch points in `src/voice.ts` show what differs from one provider
to the next:

1. The token or the URL, and the socket (lines 84, 399, 533).
2. The format of the microphone audio: raw PCM at the rate of the device
   (Grok), base64 PCM at 24 kHz (OpenAI), base64 in JSON (ElevenLabs), or
   frames to the brain (Claude) (line 621).
3. The rate of the audio that plays (line 636).
4. The events that come in: audio, the words of the user and of the
   voice, "the user starts to speak", a tool call, the end of a response,
   the usage (lines 994 to 1062).
5. The result of a tool (line 912).
6. The first setup and each change of the instructions (lines 1247,
   1297).
7. A message of the app into the talk, the news (line 1287).
8. The cost (line 682).
9. The end of the call (line 1142).

### Speech to text

- `bridge/dictate.ts` has the engines: Apple (`yonder-dictate`),
  Parakeet (`yonder-parakeet`), Soniox and Deepgram (`STT`), whisper.cpp
  (Walkie-talkie), and Voxtype on Linux.
- The choice is in `localStorage` of each device (`stt` in
  `src/bridge.ts`). Each user picks it in Settings › Voice, among the
  models whose key or helper the computer has.

### The paid gates

Step 1 removed these gates, except the Grok voice of the
account and the listen button of staff. The table tells where they were.

| Gate | Where |
|---|---|
| A call needs a plan, also with an own key | `canCall` in `src/account.ts`, `toggleCall` in `src/App.tsx`, `src/Plans.tsx` |
| A call needs a sign-in and a verified email | `toggleCall` in `src/App.tsx`, `token()` in `CarCall.swift` |
| A computer with no `XAI_API_KEY` uses the Grok token of yonder.so, and the call time counts | `voiceToken`, `reportSeconds` in `src/account.ts`; `voice` and `calls` of the yonder.so backend (private) |
| The call is Grok for all but a super user | `voiceProvider()` and `setAccountCall` in `src/voice.ts` |
| Only a super user picks the speech to text | `stt()` in `src/bridge.ts` |
| The Grok voice is a value of the account on yonder.so | `setVoice` in `src/account.ts`, the Super user section of `src/Settings.tsx` |
| The listen button can use the xAI key of yonder.so (staff) | `speech` in `src/account.ts`, `speak` of the yonder.so backend |
| The store subscriptions | `src/Plans.tsx`, `syncPurchases`, `@choochmeque/tauri-plugin-iap-api` in `package.json`, `tauri_plugin_iap` in `ios/src/lib.rs`, `purchase` and the store notifications of the yonder.so backend |
| The check of the paywall | `bridge/paywall-e2e.ts` |

## Decisions

1. **Voice is a module, not a plugin.** `plugins/` holds Claude Code
   plugins, which load in the workers, and Yonder does not make a new
   format. Voice runs in the phone and in the bridge, not in a
   worker, so that format cannot carry it. So voice is one folder of the
   repository with one folder for each provider. A user's own provider is
   not code in Yonder: it is a URL in the config (kind `url`), or an MCP
   client of the bridge (`docs/voice/custom.md`).
2. **What the module holds.** The call, and the engines of speech:
   speech to text and text to speech. The dictation, the notch, "Hey
   Yonder", Walkie-talkie and the listen button stay in the app, and use
   the engines of the module. With voice off, the dictation of the system
   (Apple, Voxtype, Windows + H) still works, because it needs no key.
3. **Three kinds of provider, not one interface for all.** The phone is
   the end of the audio. A cloud model can take the audio straight from
   the phone. A local model or Pipecat runs on the computer, so the audio
   must go to the computer. The kinds follow that split.
4. **Two generic adapters cover most models.** An `openai-compatible`
   realtime adapter takes a base URL. An `openai-compatible` speech to
   text and text to speech slot takes a base URL too
   (`/v1/audio/transcriptions`, `/v1/audio/speech`). Many local servers
   speak these (whisper.cpp server, Kokoro-FastAPI, speaches, LocalAI).
   So a new model often needs no new code, only a URL.
5. **The config is flat keys in `config.json`**, as `walkieTalkie` and
   `speechModel` are today. The Settings schema (`bridge/settings/`)
   shows them, and an agent edits them with no restart. The settings
   belong to the computer, because the keys are on the computer. Today
   the provider and the speech to text are in `localStorage` of each
   phone; they move.
6. **Keys stay in `.env`**, never in `config.json`. So they never go to
   the settings backup or to another device.
7. **No account for voice.** A call needs only a provider that works.
   This plan does not decide the future of the account for the tunnel and
   the settings backup. That is part of the open-source plan.
8. **The CarPlay and Watch calls stay Grok for now.** They are Swift
   copies, and a change needs a store release. They lose the account
   gate in the next native release, and they read `voiceProvider` from the
   bridge. With another provider, the car says that car calls need Grok.
9. **The call code loads only when voice is on.** The app loads
   `voice/` with a dynamic `import()`, so a user with voice off does not
   download it.

## The folder

```
voice/
  README.md                 what the module is, the kinds, how to add a provider (links to docs/voice/)
  settings.json             the Voice section of the Settings schema (was bridge/settings/voice.json)
  index.ts                  the list of the providers, for the app and the bridge
  core/
    call.ts                 the call without a provider: microphone, playback, echo gate, news, quiet, tools, transcript (from src/voice.ts)
    tools.ts                the function tools of the call and the app tools: call_status, get_screen, show_project ... (from src/voice.ts)
    pcm.ts                  resample, base64, frames (from src/pcm.ts and src/voice.ts)
    mic-worklet.js          (from public/mic-worklet.js)
    types.ts                the interfaces below
  providers/
    grok/
      client.ts             the realtime adapter of the phone
      bridge.ts             the token, from XAI_API_KEY
      tts.ts                the Grok voice as a speak slot (the listen button)
    openai/
      client.ts             the realtime adapter; also used by `url`
      bridge.ts             the token, from OPENAI_API_KEY
    elevenlabs/
      client.ts
      bridge.ts             the signed URL and the agent (from bridge/eleven.ts)
      tts.ts                the speak slot (from speak in bridge/eleven.ts)
    pipeline/
      client.ts             the phone side: sound to /dictate, events from /brain, sound from /speak (from src/brain.ts)
      brain.ts              the Claude Code brain (from bridge/brain.ts)
    stt/
      apple.ts  parakeet.ts  soniox.ts  deepgram.ts  whisper.ts  voxtype.ts   (from bridge/dictate.ts)
      openai-compatible.ts  a speech to text server at a URL
    tts/
      openai-compatible.ts  a text to speech server at a URL, such as Kokoro
    url/
      README.md             the subset of OpenAI realtime events that a server must speak
      bridge.ts             the proxy from the phone to the server on the computer
    pipecat/
      README.md             how to run the example bot
      bot.py                an example url server, a Pipecat pipeline
```

`src/voice.ts`, `src/brain.ts` and `src/pcm.ts` become small files that
import from `voice/`, until no caller is left. Then they go.

## The interfaces

A sketch in TypeScript. The real names come when the code moves.

```ts
// A realtime provider: the phone opens a socket to the model.
type Realtime = {
  kind: "realtime";
  id: string;                       // "grok", "openai", "elevenlabs"
  name: string;                     // the label of the Settings
  key?: string;                     // the name in .env, such as "XAI_API_KEY"
  inputRate(deviceRate: number): number;   // the rate of the microphone audio that it takes
  outputRate(deviceRate: number): number;  // the rate of the audio that it gives
  connect(secret: Secret, setup: Setup): WebSocket;
  audio(pcm: Int16Array): string | ArrayBuffer;           // one frame of the microphone, ready to send
  read(event: unknown): VoiceEvent[];                     // what came in, in the common form
  toolResult(id: string, output: string, failed: boolean): object[];
  instructions(text: string): object;                     // the first setup and each change
  say(text: string): object[];                            // news of the app into the talk
  cost(stats: { seconds: number; usage: Usage[] }): number;
};

type VoiceEvent =
  | { type: "audio"; pcm: ArrayBuffer }
  | { type: "heard"; who: "user" | "voice"; text: string; final: boolean }
  | { type: "speaking" }                       // the user starts to speak: stop the playback
  | { type: "tool"; id: string; name: string; args: string }
  | { type: "done" }                           // the end of a response
  | { type: "usage"; usage: Usage }
  | { type: "error"; message: string };

// The computer side of a realtime provider.
type RealtimeBridge = { id: string; key: string; token(body: unknown): Promise<Response> };

// The slots of a pipeline, on the computer.
type Hear = { id: string; key?: string; part(call: string, pcm16k: Uint8Array, end: boolean): Promise<string> };
type Speak = { id: string; key?: string; speak(text: string, voice?: string): Promise<ArrayBuffer> };  // PCM16, 24 kHz
type Think = { id: string; start(call: string): Promise<void>; say(call: string, text: string): Promise<void>; events(call: string, after: number): Promise<BrainEvent[]> };
```

`core/call.ts` keeps all that does not depend on the provider: the
guards on a message to a busy agent, the merge of the context, the quiet
time before news, the echo gate of the iPhone, the logs and the
transcript. That is most of the 1,337 lines.

Where the tools run:

- **realtime** and **url**: the model sends each tool call over the
  socket to the phone. `core/call.ts` runs it on the bridge, with the
  app tools and the guards. So an own server gets the same tools and
  guards as Grok.
- **pipeline**: the brain on the computer calls the tools of the bridge
  itself, as the Claude call does today (`bridge/brain.ts`). The guards
  of `core/call.ts` do not apply. The brain has its own rules.

## The config

New keys in `voice/settings.json`, with `"store": "config"`:

| Key | Values | Default |
|---|---|---|
| `voiceProvider` | `grok`, `openai`, `elevenlabs`, `pipeline`, `url`, `off` | `grok` |
| `voiceName` | The voice of the provider, such as `liora` or `marin` | The default of the provider |
| `voiceModel` | A model of the provider, such as `gpt-realtime-2.1` | The default of the provider |
| `voiceHear` | The speech to text of the pipeline and the dictation: `apple`, `parakeet`, `parakeet-v3`, `parakeet-ultra`, `soniox`, `deepgram`, `whisper`, or an `http` URL | `apple` |
| `voiceThink` | The brain of the pipeline: `claude` | `claude` |
| `voiceSpeak` | The voice of the pipeline and the listen button: `elevenlabs`, `grok`, or an `http` URL | `elevenlabs` |
| `voiceUrl` | The WebSocket of an own server, for `voiceProvider: "url"` | empty |

`speechModel` and `walkieTalkie` stay as they are. `voiceUrl` does not
sync, because an address such as `ws://127.0.0.1:7860` belongs to one
computer.

An example of a local call with no cloud:

```json
{
  "voiceProvider": "pipeline",
  "voiceHear": "parakeet-v3",
  "voiceSpeak": "http://127.0.0.1:8880/v1",
  "voiceName": "af_heart"
}
```

The keys in `~/.config/yonder/.env`, as today: `XAI_API_KEY`,
`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `SONIOX_API_KEY`,
`DEEPGRAM_API_KEY`. A new optional `VOICE_URL_KEY` is the bearer token of
a URL provider that needs one.

A new endpoint `GET /voice` gives the phone the state:
`{ "voiceProvider": "grok", "ready": false, "missing": "XAI_API_KEY" }`. The call
button uses it. `/token?check` stays for the old apps.

The Voice section of the Settings shows the picker, the voice, and one
key field for the provider that is picked. The key field writes `.env`,
as the Relay tab writes `YONDER_RELAY`. The wiki gets the keys in the
section "Projects", so the agents know how to edit them.

## The call button

| State | The button |
|---|---|
| `voiceProvider` is `off` | No call button. |
| The provider is not ready (no key, no server) | "Set up voice". A tap shows the one missing thing, such as `Put XAI_API_KEY=... in ~/.config/yonder/.env`. |
| Ready | "Start call", as today. |

## What to remove

Done: items 1 to 5, 7, 8 and 9, without `speech` (the listen
button of staff still uses it) and without the row "Voice", which stays
a super user setting with item 6. `CarCall.swift` still reads the Grok
voice of the account when the user is signed in. The Model row offers only the
providers whose key is in `.env` (`keys` of `/token?check`), not a key
field.

In the app (goes over the air, no store release):

1. `canCall`, `voiceToken`, `reportSeconds`, `speech` and
   `sendPurchase` in `src/account.ts`. The fields `plan`, `paid` and
   `seconds_left` of `Account`.
2. In `toggleCall` (`src/App.tsx`): the plan check, the sign-in, the
   verified email, `hosted`, `setAccountCall`, the minute meter, and the
   `seconds_left` warnings.
3. `src/Plans.tsx`, `syncPurchases`, the subscribe sheet styles in
   `src/app.css`, and `bridge/paywall-e2e.ts`.
4. `setAccountCall` and the super user gate in `voiceProvider()`
   (`src/voice.ts`). The super user gate in `stt()` (`src/bridge.ts`).
5. The rows "Voice model", "Voice" and "Speech to text" leave the Super
   user section of `src/Settings.tsx`, and go to the Voice section. The
   row "Talk time" goes, because it is the time of the plan. The other
   super user rows are not part of this plan.
6. `setVoice` in `src/account.ts`. The Grok voice becomes `voiceName`.
7. The comment of `src/SignIn.tsx` that ties the sign-up to the calls.

In the native shells (next store release):

8. The account gate and the call to `yonder.so/api/app/voice` in
   `token()` of `CarCall.swift`.
9. `tauri_plugin_iap` in `ios/src/lib.rs` and `android/src/lib.rs`, and
   `tauri-plugin-iap` in both `Cargo.toml` files. The npm package
   `@choochmeque/tauri-plugin-iap-api` goes earlier, with item 3, over
   the air.

On yonder.so (the backend, private):

10. `voice` (POST), `speak`, `calls`, `purchase`, and the Apple and Google
    store notifications of the API. The plans page and the
    Stripe checkout. Keep `voice` (GET) until no app reads the voice of
    the account.

In the stores:

11. The four subscription products in App Store Connect and Google Play.

## Migration

Each step is one commit or a few. Each step leaves the app working.

### Step 1: remove the paid gates (done)

Remove items 1 to 7 above. A computer with its own `XAI_API_KEY` then
calls with no account, as `docs/voice/grok.md` already says.

A computer with no `XAI_API_KEY` used the hosted token of yonder.so.
After this step it needs its own key. A tap of the call button shows the
toast "Add a voice key to your computer to talk.", with a How button to
`docs/voice/`.

Then make `voice` (POST) on yonder.so answer `410` with the text "Yonder
calls now use your own key. Put XAI_API_KEY in ~/.config/yonder/.env."
An old app shows the error text of the site, so the old apps get the
notice too.

### Step 2: the config

1. Add the keys of "The config" to `bridge/settings/voice.json`, and
   `GET /voice` to the bridge.
2. At start, the app writes each old value to `config.json` one time,
   when the key is not there: `voiceProvider` and `stt` of
   `localStorage`, and `account.voice` of yonder.so.
3. `voiceProvider()` and `stt()` read the config. The old
   `localStorage` keys stay one release, then go.
4. The Settings show the picker, the voice and the key field.

### Step 3: move the files

Move the code to `voice/` with no change of behavior. `src/voice.ts`
re-exports from `voice/` so that each import keeps working. The endpoints
of the bridge stay the same. The bridge imports its routes from the
`bridge.ts` file of each provider.

Caution: the compiled bridge (`bun build --compile`) must still contain
each file, and Vite must still find `mic-worklet.js` with `?raw`. Check
both before the commit.

Caution: the bridge builds the screen over the air only when a path of
`FRONT` (`bridge/main.ts`) changes. Add `voice` to `FRONT`, and add
`voice` to `include` of `tsconfig.json`, in the same commit as the move.
Else a change in `voice/` never reaches the phones.

### Step 4: split the providers

Take each branch point of `src/voice.ts` into the adapter of its
provider, one provider in each commit: Grok first, then OpenAI, then
ElevenLabs, then the pipeline. After each commit, make a real call with
that provider from the phone. Then `core/call.ts` has no `if` on a
provider.

### Step 5: the pipeline slots

1. Move the engines of `bridge/dictate.ts` to `voice/providers/stt/`,
   behind the `Hear` interface. `/dictate` keeps its query `stt`, and
   reads `voiceHear` when the query has none.
2. Put the speak of ElevenLabs and of Grok behind `Speak`. `/speak` reads
   `voiceSpeak`.
3. Add the `openai-compatible` slots for a URL. This gives a local call:
   Parakeet hears, the Claude brain thinks, and Kokoro speaks.

### Step 6: your own server

1. Write the subset of OpenAI realtime events that Yonder uses in
   `voice/providers/url/README.md`.
2. Add the proxy of the bridge: the phone opens the socket to the
   bridge, and the bridge opens it to `voiceUrl`. So a server on
   `127.0.0.1` works from the phone.
3. Make an example Pipecat bot. It must use a WebSocket transport with a
   serializer for the events of step 1, and send each tool call over the
   socket. A Pipecat bot with the WebRTC transport that calls the bridge
   MCP itself is not enough, so this is new work.
4. Update `docs/voice/pipecat.md` and `docs/voice/local.md` from
   "Planned" to the setup.

### Step 7: the native shells and the stores

1. Remove items 8 and 9 in one native release (done in the code; it
   reaches the phones with the next native build).
2. After that release is in the stores, remove the subscription products
   (item 11) and the endpoints of yonder.so (item 10).

## What must keep working

- A call with Grok and an own `XAI_API_KEY`, from the phone, near the
  Mac and through the relay.
- The OpenAI, ElevenLabs and Claude calls with their keys.
- The dictation on the Mac, the iPhone, Linux and Windows.
- Walkie-talkie and the listen button.
- The CarPlay and Watch calls with Grok. Until the native release of
  step 7, the store shells still need a sign-in for these calls
  (`token()` in `CarCall.swift`). So "no account" is true for them only
  after step 7.
- The phone apps in the stores today, because they load the new screen
  over the air but keep their old native shell.

The checks:

- `bun run check` and `bun run check-bridge` after each step.
- `bun bridge/claude-call-check.ts` after steps 4 and 5.
- `bun bridge/vad-check.ts` and `bun bridge/dictate-check.ts` after
  step 5.
- A new small check of the `read` function of each adapter, with the
  events of a recorded call. It needs no key and no credits.
- One real call with each provider after step 4, from the phone.

## Open risks

- **The Pipecat bot.** The example bot of step 6 needs a WebSocket
  transport and a serializer, not WebRTC. Its size is not known.

- **The audio through the relay.** The pipeline and the `url` kind send
  the audio of the phone to the computer. Near the Mac this is a local
  call. Through the relay, the delay is not measured. Measure a Claude
  call through the relay before step 5. Also check that the relay link
  can carry the socket of step 6; if it cannot, step 6 uses the HTTP
  parts of the pipeline.
- **The default with no key.** The default `voiceProvider` is `grok`, so a new
  user with no key sees "Set up voice". A default of `off` hides voice
  until the user turns it on. This plan takes `grok`, because the call
  is the main feature of the phone app.
- **App Review.** A store reviewer has no Mac, so a call does not start
  for them before or after this plan. The note for App Review must say
  how to test with a key.
- **The cost display.** The cost in `call_status` is an estimate for
  Grok, OpenAI and ElevenLabs. A `url` or a local provider has no price,
  so it reports 0.

## Docs to update with the code

- `docs/voice/` (the user guides): each step that changes a guide.
- `docs/wiki.md`: "Voice agent (Grok)", the keys of `config.json` in
  "Projects", and the removal of the plans.
- `README.md`: the setup with your own key, and `voiceProvider: "off"`.
- `CONTRIBUTING.md`: how to add a provider in one pull request.
