# Voice agent (Grok)

- `src/voice.ts` connects to `wss://api.x.ai/v1/realtime` with an ephemeral
  token from the bridge, so the API key stays out of the window.
- Calls are only on the phone. A computer (Mac, Linux,
  Windows) has no call button, no Call key in Keys and no menu bar icon,
  and `toggleCall` starts no call there: the call key of an older
  setting, `yonder call` on Omarchy and `yonder.call.start` do nothing.
  The call row of a computer shows only an update that waits.
- On a paired phone, "Start call" is a small phone button over the tab
  bar, at the left of New chat, in each style (`smallCall` in
  `src/App.tsx`). Its label is `copy.call` of the style. On iOS 26 it
  is a native glass button. The call row then shows only a call that
  is on (End call, the time and Mute). A phone with
  no pairing keeps its one large button ("Pair your computer"), because
  it is the first step.
  The own screens have a small round call button too. The title bar
  has no room for it: on the Apps tab its third button goes under the
  name of the project.
  `yonder.call.state()` gives `available: false` on a computer, so an
  own screen shows no call button there.
- Yonder is free, with no paid plan. A voice call needs no account and no sign-in: it uses the key of a voice
  provider in `~/.config/yonder/.env` of the computer, or a voice module
  of the user's own (`docs/voice/`). Each paired phone has the call
  button. `toggleCall` in `src/App.tsx` checks `keys` of
  `GET /token?check` of the bridge. With no key of the chosen provider,
  it asks the bridge again, because the key can be new, and then shows
  one toast, "Add a voice key to your computer to talk.", with a How
  button to the guide of the voice module (`VOICE_DOCS`, in the public
  repository). The app has no plan, no subscribe sheet and no call
  time. `bun bridge/voicekey-e2e.ts` checks
  the call button with no account, the toast with no key, the token
  request with a key, and the Model row of Settings › Voice. The sign-in
  stays, for the tunnel and the backup of the settings. Each user picks
  the voice model and the speech to text in Settings › Voice, among the
  providers whose key the computer has (see "Settings").
- `GET /token?check` of the bridge tells the app if the computer has its
  own key. It also gives `keys`: the ids of the voice providers and of
  the speech to text models whose key is in `.env` (`VOICE_KEYS` in
  `bridge/main.ts`). The pickers of Settings › Voice and the call button
  use it.
- The Account section of the settings:
  - The photo and the email: Settings › Account has a
    profile picture (a tap opens the photos and the camera on the phone,
    and a file on the Mac) and the email. The picture is the middle
    square of the photo at 160 px, as a JPEG data URL (`avatar` in
    `GET /api/app/account`), and it shows as a circle in the Settings.
    A new email changes only when the user opens the link that yonder.so
    sends to it. Sign in with Apple and Google still find the account by
    the old email. The account page of yonder.so does the same.
  - The referral link: each account has a referral
    link (`referral` in `GET /api/app/account`). Invite friends in the
    Account section of the settings opens the share sheet on the phone
    and copies the link on the Mac. The account page of yonder.so shows
    the link too. Each call is free, so Invite friends only shares the
    link, and its row has no "30 minutes" text. The landing page repository keeps the
    details.
  - Only a super user (`is_superuser` on yonder.so, `superuser` in
    `GET /api/app/account`) sees the Grok voice and the Cost, in the
    Super user section, the last of the Settings, and finds them in the
    search. Each user picks the
    voice model and the speech to text in Settings › Voice: the Model row offers only the providers whose key is in `.env`
    (`hasVoiceKey` in `src/voice.ts`, from `keys` of `/token?check`), and
    "No voice key on this computer" with none. The Speech to text
    dropdown offers Apple, Parakeet on a Mac with its helper, and Soniox
    or Deepgram with their key. `voiceProvider()` gives the chosen
    provider, else the first one with a key, else Grok.
  - The Grok voice: a super user picks it in the Voice section (a
    dropdown of the 28 voices of `GET https://api.x.ai/v1/tts/voices`),
    and it changes for all accounts. Staff can give one account its own
    voice at `/admin/accounts/voice/` of yonder.so. The account gives
    `voice`, and `session.update` of the Grok call uses it (Liora with
    none). Backstage of yonder.so has a "Voices" link to that admin
    page: change the "Everyone" row in the list, or add a row with a
    user.
  - The CarPlay call and the Apple Watch call (`CarCall.swift`) are always Grok, also when the web call
    uses another model. They need no account: the token comes from the
    bridge, with the xAI key in `.env`, and with no key the call says
    "Add an xAI key to your computer to talk". With a sign-in, they use
    the Grok voice of the account.
- The sign-in page (`src/SignIn.tsx`) is a full page, as a section of
  the settings, with a back button and a swipe back. With no account,
  the account card at the top of the settings opens this page at once.
  The phone always shows the Account section, with a Sign up row and a
  Sign in row, also when the Mac has its own key. The sign-in page has
  no password: the user types the email, yonder.so sends a 6-digit
  code, and the code signs in (`POST /api/app/code` and
  `/api/app/verify`). An email with no account gets one, so the sign-in
  is also the sign-up.
  - "Continue with Google" on the sign-in page opens the Google
    sign-in of yonder.so in the sign-in window of the system on the
    Mac and the iPhone, because Google refuses a sign-in in a webview.
    The window closes itself when the sign-in is done. On the Mac it
    opens in the default browser, so Chrome with a known Google
    account signs in with no click. Android opens the browser. The app
    asks yonder.so for a random code until the sign-in is done, so it
    needs no link back. A Google email
    is the same account as a sign-up with that email. The site needs
    `GOOGLE_CLIENT_ID` and
    `GOOGLE_CLIENT_SECRET`, a Web client of Google Cloud with the
    redirect `https://yonder.so/api/app/google/callback`.
  - "Continue with Apple" (Sign in with Apple) is on the sign-in page
    of the iPhone only, above Google, because App Review asks for it
    (guideline 4.8: an app with a Google sign-in must
    also offer a sign-in that can hide the email). It is the native
    sheet of iOS (`AppleSignIn.swift`, `apple_sign_in` of
    `ios/src/lib.rs`) and asks only for the email. The phone sends the
    identity token to `/api/app/apple` of yonder.so, which checks its
    signature with the keys of Apple. An Apple email is the same
    account as a sign-up with that email. With "Hide My Email" the
    email is an address of `privaterelay.appleid.com`. An older iPhone
    app, the Mac and Android do not show the button. When
    Apple refuses the sign-in, the phone sends the error code of Apple,
    and the screen shows that code. Code 1000 means the iPhone has no
    Apple ID. The screen then says to sign in to it in Settings. An
    older app says to try again, with no code. A report to Sentry
    shows the code (YONDER-E).
  - Not done yet: sign-in with GitHub.
- Each call starts a fresh conversation of Grok, with no session
  resumption of xAI (`?conversation_id=<id>`). xAI takes longer to
  answer a longer conversation: the median time from `speech_stopped`
  to the tool call was about 1.0 s with fewer than 20 items, 1.55 s
  with 120 to 200, and 2.2 s with 200 to 400. A resumed call starts
  with about 75 items, so it is slow from its first turn. The whole wait
  is on the side of xAI: `committed`, the transcript and the tool call
  come in the same few milliseconds.
- Audio is PCM16 over binary WebSocket frames, at the rate of the device
  (44.1 or 48 kHz). Server VAD finds the end of each turn, after 1.2
  seconds of silence (`SILENCE_MS`, see the pauses to think below).
- The OpenAI call. When Model in the Voice settings is
  OpenAI, the call goes to the realtime API of OpenAI with
  `gpt-realtime-2.1`, in place of Grok. The rest of the call stays the
  same: the prompt, the tools
  of the bridge and of the app, server VAD with `SILENCE_MS`, the checks
  of `runTool`, and the transcript.
  - The bridge makes the token: `GET /token?provider=openai` uses
    `OPENAI_API_KEY` in `~/.config/yonder/.env`. The token also gives the
    model, so the name of the model is only in `bridge/main.ts`. yonder.so
    gives only Grok tokens, so an OpenAI call needs the key on the Mac,
    also for a call on the phone. Without the key, the call does not
    start, and the app shows "Put OPENAI_API_KEY=... in ...". An older
    bridge ignores `provider` and gives a Grok token. The app then asks
    the user to restart the bridge.
  - OpenAI takes and gives PCM16 at 24 kHz only, in base64 in JSON events
    (`input_audio_buffer.append`, `response.output_audio.delta`), not in
    binary frames. The AudioContext keeps the rate of the device, as for
    Grok, and the app converts each 100 ms frame of the microphone to
    24 kHz (`to24k`). The audio of OpenAI plays from buffers at 24 kHz.
  - The voice is Marin (`marin`). The words of the user come from
    `gpt-4o-mini-transcribe`. Without a transcription model, OpenAI sends
    no words of the user. Then the transcript, the context for the agents
    and the check of a message to a running agent stop.
  - OpenAI has no web search and no X search, so the session gets only
    the function tools.
  - OpenAI bills tokens, not minutes. The usage in each `response.done` is
    for that response only, so the app adds it up (for Grok, never add
    it up). The prices of `gpt-realtime-2.1` for 1M tokens: text $4 in
    and $24 out, audio $32 in and $64 out, cached input $0.40. The cost
    of the transcription is not in the estimate.
  - An OpenAI session ends after 60 minutes.
  - Not done: when the user interrupts, the app does not cut the answer
    (`conversation.item.truncate`), so OpenAI thinks that the user heard
    all of it. The car mode (CarPlay) always uses Grok.
  - Check it with `bun bridge/openai-check.ts` (about one cent). It makes
    a token, sets up the session in the form of the app, and speaks a
    request with `say` at 48 kHz through `to24k`. A pass gives the
    transcript, a `start_worker` call and a spoken answer. The 28 tools
    of the bridge and a prompt of 20,000 characters also pass. Bun fails
    the handshake with the
    subprotocols of the app ("Expected 101 status code"), so the check
    sends the token in a header. A curl handshake with the subprotocols
    of the app gets 101 and `sec-websocket-protocol: realtime`.
- The microphone stays open while Grok talks (full duplex), so that you can
  interrupt Grok. Server VAD hears you and cancels the response. The app
  stops the audio in the queue and drops late audio until the next response.
  The echo cancellation of `getUserMedia` keeps Grok's voice out of the
  microphone: during Grok's speech, the peak in `call.log` is about 0.01.
- With half duplex, the microphone is out while any audio is in the
  queue, so the server never hears an interruption. If Grok answers its
  own voice, go back to half duplex.
- xAI bills the connected time. `usage.billable_audio_seconds` in each
  `response.done` is a running total for the call, so never add it up. The
  app counts the connected time. A sum of those totals shows about ten
  times the real cost.
- The app saves the cost of the live call each second (`grokCall` in
  `localStorage`). A reinstall during a call kills the app before the call
  ends, and else the cost of that call is lost.
- The real spend comes from the billing records of xAI, the same numbers
  as the xAI console. The bridge reads them through the xAI Management API
  (`/grok-usage`): the spend of this month for each item, and the prepaid
  credit left. The credit left comes from the invoice preview: the prepaid
  credit minus the credit that this month used. The prepaid balance alone
  does not subtract the spend of the open month. It keeps the answer for
  60 seconds, and the app reads it
  every 30 seconds. The Management API needs a management key, which is
  not the API key. Make it in the xAI console, under Settings, Management
  Keys, and put `XAI_MANAGEMENT_KEY=...` in `~/.config/yonder/.env`. With
  the key, the top bar shows "$X on xAI · $Y left", and its tooltip gives
  each item. Without the key, the top bar shows the estimate from the
  connected minutes. `call_status` gives both to Grok.
- Tool results (`function_call_output`) do not count as billed text
  inputs: the xAI console showed 14 text inputs for 151 tool calls.
- The app answers the `call_status` tool itself: the minutes live, the cost
  of the call, the cost of all calls on Grok (the top bar), about how many
  tokens the Grok context holds, the counts of running and waiting agents,
  the version, and the theme. It also gives the real numbers from the xAI
  console (see below). It also says if the Mac is connected (`mac`), or
  since when it is offline, for example when the lid is closed and the
  phone cannot reach the bridge.
  The `set_theme` tool, which the app also answers, switches the
  light and dark theme ("dark mode"). It also takes `system`: the app
  follows the light or dark mode of the device, also when it changes
  while the app is open.
  The Theme row of the Settings has Light, Dark and System. The bridge has
  a `set_theme` tool of its own for the clients with no device, such as
  the Claude app and the Claude brain: it writes `theme` in `phone.json`,
  and the phones take it in a few seconds. The voice of the app keeps its
  own tool, so the bridge gives it no second one. Thus the Claude app
  switches the theme by voice.
- The `end_call` tool, which the app also answers, ends the call when Grok
  stops talking, as after `rebuild_app`. Else Grok can close an agent
  when the user says "end call".
- A call that ends with code 1006 lost its connection with no close
  frame, usually because the device lost its network. The socket to xAI
  and the relay link then die together. The app says "the connection to
  Grok dropped" in place of "code 1006". A hang-up from the user gives
  1005.
  A call on the iPhone also ends with 1006 when the user leaves the app,
  iOS interrupts its audio (`audio: interrupted`), and suspends Yonder
  for 60 s. The drop shows when the user comes back. After an
  interruption, the app says that iOS paused Yonder, not "Check the
  network". The page cannot keep the call on through an interruption.
- The call writes its events to `~/.config/yonder/call.log` through the
  bridge, because nobody can read the console of the app window.
- The call also saves its transcript: what the user said, what Grok said,
  and the tool calls. The bridge writes one file for each call in
  `~/.config/yonder/calls/<start time>.jsonl`, and `/calls` returns the 50
  newest. The settings of the app (Voice, Call history) show them.
- The file of a call also keeps the full prompt that each agent got from
  `start_worker` and `message_worker` (`"who": "sent"`, with the agent
  number), with the voice-call block that the bridge adds. The app sends
  the ID of the call to these two tools as `call`, and Grok does not see
  it.
- Grok has the built-in `web_search` and `x_search` tools of xAI, so it
  can look up the web and X itself. xAI runs them, and the app does not
  answer them.
- "Open Google" or "check my current tab": Grok calls the `browser`
  tool, which does one quick step in Chrome with the `browser-harness`
  CLI. `read` gives the address, the title and the first 3000
  characters of the text of the tab that the user sees. `tabs` lists the
  open tabs. `open` opens a URL in a new tab and shows it. A task of more
  steps, such as a checkout or a flight search, goes to an agent, in the
  project on the screen or in Yonder. Each agent knows `browser-harness`
  from the global `CLAUDE.md` of the user.
- Yonder does not install browser-harness by itself. The Tools section
  of the Settings (`bridge/tools.ts`, `/tools`) lists the tools that let
  agents do more: Browser Harness, Visual Sandbox (`vsb`), the
  1Password CLI (`op`) and Kokoro (`kokoro-tts`), each with
  a short line of what it does and a link to its page. The bridge
  looks for each tool and its skill in `~/.claude/skills`. A tool that is
  there stays as it is. Install runs only after a tap and a yes. It runs
  in the background on the computer of the bridge, so a tap on the phone
  installs on the paired Mac, Linux or Windows computer, also one with
  no screen. Visual Sandbox does not show on Windows, because its
  installer has no Windows build. The 1Password CLI comes as the zip of
  its newest version for each system, into `~/.local/bin`, so it needs
  no sudo. Kokoro is a free text to speech model (82M parameters) that
  runs on the CPU. Its install gets the `kokoro-tts` CLI with `uv`, the
  model files (337 MB) into `~/.local/share/kokoro`, and a `kokoro` skill
  that tells agents how to make speech with it. It does not show on
  Windows. The voice calls do not use it yet. The Mind is a folder, not
  a CLI: a second brain of
  markdown pages, a dropbox inbox and a to-do list, with its own skills
  in `.claude/skills`. Install copies the public template
  (the repository `the-mind`, `MIND_ZIP` in `bridge/tools.ts`) to
  `~/mind` with no link back to it,
  and adds `~/mind` to the projects. A folder that is already at `~/mind`
  stops the install. The row shows Installed when `~/mind/MIND.md` is
  there. When the project `mind` is on the list, the prompt of the voice
  agent sends notes, logs and to-dos of the user to a worker in it.
  Without browser-harness, the `browser` tool tells Grok to send the user
  to Settings, Tools.
- browser-harness makes each tab that it attaches look visible, so the
  bridge asks Chrome for the tab that the user sees, with AppleScript.
  macOS asks one time if Yonder can control Chrome. Without that
  permission, or after 5 seconds with no answer, `read` takes the first
  tab. `read` reads the tab through a
  second CDP session, so it does not move the tab that browser-harness
  controls for an agent.
- "Make an image of a cow with GPT Image 2.5": Grok calls `start_worker`
  in the project on the screen, or in Yonder, with the words of the user.
  The agent makes the picture, the video or the sound with the `vsb` CLI
  of Visual Sandbox, and the conversation view of the agent shows it.
  GPT Image, Nano Banana, Flux, Veo, Kling, Seedance and ElevenLabs are
  models of Visual Sandbox, so their names go in the task. The `model`
  input takes only a Claude model, and the bridge refuses other names,
  because Claude Code cannot run them.
- The prompt gives the time and the place of the user ("Time & Place"):
  the date and the time to the minute, and the city of the time zone of
  the Mac (`Europe/Paris` is Paris), so the app needs no location
  permission. Grok uses them for "today", the weather and local
  questions, and gives the units of the country of the user (Celsius and
  kilometers in France). The time changes each minute, so the poll sends
  Grok a new prompt once a minute. Else Grok does not know the time or
  the place.
- The voice agent only talks to the person. It does not do the work.
- Each new request goes to a new agent (`start_worker`), also when an
  agent of the same project runs, waits or finished. Grok calls
  `message_worker` only when the user answers an agent, continues,
  corrects or adds to its task, or names the agent. When Grok is not
  sure, it starts a new agent. Else Grok sends new requests to agents
  that already have other work.
- The exception is an open conversation. When the user reads agent 4,
  each request goes to agent 4 with `message_worker`, also a new task,
  and also when agent 4 is done. A running agent 4 gets a new task after
  its turn. Grok starts a new agent only when the user names another
  agent or project ("send it to 2"), asks for a new agent, or asks for
  a change of Yonder. The rule is in `screen` in `src/App.tsx`.
- "Another agent", "a new agent" or "get an agent to" with no agent
  number always starts a new agent, also in an open conversation and also
  for the result that Grok just told about. Grok then puts the facts of
  that result in the task, such as the list of problems, because the new
  agent knows nothing. Else "send another agent to fix that" goes to the
  agent of the result, or the new task names "the five problems" with no
  list.
- A command for the app ("update the app", "show completed", "end the
  call") calls its own tool, also in an open conversation. It never goes
  to the agent of the conversation. "Update the phone" is `rebuild_app`
  too, because the update brings the new screen to the phone. Else a
  request to update the phone or the app goes to the agent of the open
  conversation.
- A request that uses, shows or checks what an agent already made ("open
  the pricing page in the browser", "run it", "push it") goes to that agent
  with `message_worker`, also when it is done. That agent knows its files,
  its dev server and its sign-in. Before each `start_worker`, Grok reads
  the agent lines of its prompt, and when no agent fits, it calls
  `list_workers` with `query`. Each line of a done or waiting agent tells
  how long ago it finished, such as "finished 2m ago". Else a request to
  open a page that an agent just restyled starts a new agent.
- A reply to the result that Grok just told about is the same task, also
  with no number. When the user rejects, changes or builds on that result,
  Grok calls `message_worker` for that agent. Else a rejection of the
  result of a research starts a new agent.
- A question about earlier work is not a new request ("what about the
  landing page push?", "any update on the checkout?"). When the prompt
  does not show that agent, Grok calls `list_workers` with `query`, a few
  words about the work. The search covers all the projects, also the done
  and closed agents, and the focus of the screen does not limit it. Grok
  answers from the match, or asks which one when two or three can fit.
  It starts an agent only when the search finds nothing and the user
  wants it checked. Else a question about an agent on the Completed tab
  starts a new agent with the question.
- One request goes to one agent. When the user changes the agent or the
  request in the middle of the words ("or actually", "no wait", "I
  mean"), only the words after the change count, and the first agent gets
  nothing. Grok sends to two agents in one answer only when the user gives
  each agent a different request. Else a request that changes its
  agent in the middle goes to both agents. A split of a job, as the next point tells, is
  the other case of two agents in one answer.
- The words after the change also pick the first words of Grok. Grok
  says "Sent to 3." only with `message_worker` and "Agent started." only
  with `start_worker`. Grok says these words before the tool call, so the
  words can come from the request before the change. The app then checks
  each response with tool calls (`wrongWords` in `src/voice.ts`). When
  the words promise a tool that the response did not call, the app tells
  Grok what it really did, and Grok corrects itself in a second response.
  Else a request that changes from a message to a close gives "Sent to
  3." with only a `close_worker` call, and the user thinks that agent 3
  got a message.
  The note of the app has no example with a real number. It gives the
  form of the words for each tool that Grok called, such as "Sorry,
  wrong words. I started a new agent, <number>.", and it tells Grok
  that the note is not a request of the user and needs no tool call.
  The app also refuses a `start_worker` or `message_worker` call with
  "[Yonder app]" in its inputs. Else Grok can start an agent with the
  note as its task, and say the example words of the note although
  they are not true.
  A response that promises a tool and calls no tool at all gets a note
  too, once in a turn: Grok then calls the tool, when the user asked for
  it, or says "Sorry, I did nothing yet." The app skips the note when the
  user speaks or cut the response off. Else "Agent started." with no
  tool call loses the request.
  The check counts the tool calls of the whole turn, from the last
  words of the user, not of one response. Grok can call the tool with
  no words, and say its fixed words in the next response, after the
  result. Else the check sees only that second response, the note says
  that Grok called no tool, and the user hears two answers.
  When Grok then makes the call with no words, the app asks for no
  second answer, because the user already heard the words.
- The app refuses a `message_worker` call to a running agent that the
  talk does not point at (`busy` in `src/voice.ts`). The call goes
  through only when one of these is true:
  - The words of the user, or the earlier words of Grok since the last
    message to an agent, name its number (`src/names.ts`). The words of
    the current response do not count, because Grok says "Sent to 3."
    before it calls the tool.
  - Grok messaged, started, read (`get_worker`) or opened (`show_agent`)
    that agent since the last message to an agent.
  - The user reads the conversation of that agent.
  Otherwise Grok says "Not sent. Agent 3 works on something else. Send
  it to 3, or start a new agent?", and does what the user answers. A
  done, waiting or closed agent has no such check. When Grok calls the
  tool before the words of the user arrive (23 of 2,690 turns in the
  records), the app cannot check the words, so it sends the message.
  Else a request for "that agent", after a question that Grok answered
  with `about_yonder`, goes with `now` to a running agent with other
  work, and that agent stops its turn for a task that is not its own.
- Grok can split a big job over several agents, so that the parts run in
  parallel. It splits when the user asks for it ("split it up", "use
  several agents"), or when one request has separate tasks that do not
  change the same files. Grok then calls `start_worker` once for each
  part, in the same answer. Each task starts with the full request, then
  tells the part of this agent and the parts of the other agents, so that
  each agent does only its part. Parts that change the same files go to
  one agent, and when Grok is not sure, it uses one agent. Grok says how
  many agents it started. No new tool is necessary: Grok already sends
  several calls in one answer.
- The speech to text can give one sentence two times. The app then does
  not send the same `start_worker` or `message_worker` call (the same
  inputs) again in 30 seconds (`sent` in `src/voice.ts`). Grok gets "Not
  sent" for the second call. Else one sentence that comes two times, 3
  seconds apart, gives two calls.
- The user often stops for a breath in the middle of one request. Grok
  then calls `start_worker` at each stop, each time with more of the same
  words. So the app sends a `start_worker` call to the last agent of the
  call with `message_worker` (with `now`) when the call comes in a later
  turn of the user, less than 60 seconds after that agent started, and
  the first 60 letters and digits of the two tasks are the same
  (`lastStart` in `src/voice.ts`). The agent gets all the words, and Grok
  hears "Not a new agent". Calls in the same answer, such as the parts of
  a split job, still start new agents. Else one request with two pauses
  starts three agents.
- Pauses to think: the user often stops for 1 to 2 seconds to think in
  the middle of a request. With the default of xAI, the server VAD ends
  a turn after about 200 ms of silence, and Grok answers about 0.7
  seconds after the last word. So a pause of 0.8 seconds ends the
  turn, and Grok acts on half a request. In the records of `call.log`,
  314 of 2,374 turns of the user were cut this way (the next transcript
  repeated the turn and added more). In 137 of them, Grok had already
  called `start_worker` or `message_worker`. The median pause was 1.3
  seconds. Else the user must keep talking, or Grok acts before they
  finish. Two changes:
  - `silence_duration_ms` is 1200 (`SILENCE_MS` in `src/voice.ts`). It
    keeps more than half of those pauses in one turn, and each answer
    comes about 1.2 seconds later. An estimate from the same pauses:
    1000 keeps about 46%, and 1500 about 71%. xAI does not document the
    field, but its server returns it in `session.updated` and honors it.
    `bun bridge/vad-check.ts [silence ms] [pause ms]` checks it with a
    real session and a voice from `say` (about one cent).
  - The prompt tells Grok that words that stop in the middle of a
    sentence, or that end with a filler ("um", "and", "give me a sec"),
    are not the end of the request. Grok then calls no tool and says
    nothing or only "Mm-hm.". In `call.log`, 59% of the cut turns ended
    like that, and 17% of the other turns.
  - Grok never fills a pause with a question or a push, such as
    "Anything else?", "Go on." or "What's on your mind?". After "okay",
    "perfect" or "thanks", it says nothing or only "Mm-hm.". Else the
    user feels rushed.
  - After an answer with only tool calls, xAI adds the next words to the
    same turn: the transcript repeats the earlier words. After an answer
    with audio, the next words are a new turn.
  - These settings have no effect: `semantic_vad` (accepted, but
    it cuts the same pause as `server_vad`), `create_response: false`
    (accepted, but Grok still answers), and `threshold`,
    `interrupt_response`, `eagerness` and `smart_turn` (dropped).
    `turn_detection: null` gives manual turns: the app sends
    `input_audio_buffer.commit` and `response.create` itself, as for a
    key that the user holds while they talk. That is the next step if
    pauses still cut turns.
- Grok says "Agent started." first, and then calls `start_worker`
  in the same answer. `start_worker` takes about 1.5 seconds: Clef picks
  the effort (0.3 to 0.7 seconds), and then `claude --bg` starts. When
  Grok calls first and speaks after the result, the user hears 3 to 4
  seconds of silence after the end of the words, on the Mac and on the
  phone. With the words first, the user hears Grok after about 1.3
  seconds, and the app sends no second response (`spoke` in
  `src/voice.ts`). A failed call still gets a second response with the
  error. The relay adds only about 0.2 seconds.
  `message_worker` gets the same rule ("Sent to 3." first), because it
  also starts `claude --bg` and takes about 1.4 to 1.9 seconds. In
  `call.log`, the median time from the end of the words to the first
  sound for these two tools was 0.7 seconds when Grok spoke first, and
  2.8 seconds on the Mac and 3.3 seconds on the phone when Grok called
  first.
- When Grok does more than one action in one answer, it says each
  action with its agent number ("Closed 12 and started 3."). Else the
  user hears only "Closed 12." and does not know about the new agent.
- The words are fixed: "Agent 4 started." for `start_worker`, and "Sent
  to" with the number for `message_worker` ("Sent to 3."). The fixed
  words are quick and tell exactly what happened. Else Grok can say
  "Sent." for a new agent. When the app
  sends a `start_worker` call to an earlier agent (`lastStart`), Grok
  gets a second response and says "No new agent. Sent to 6.".
  The words come before the agent has a number, so the prompt gives
  the number of the next new agent: the lowest number that no open
  agent holds, as `freeNum` in the bridge does. Else the user must ask
  "which agent did you start?". The result of
  `start_worker` asks for a second response only when Grok said another
  number ("Sorry, it's agent 5.") or no number (a split job: "It's agent
  5."). The prompt changes at most each 3 seconds, so a second agent in
  that time can get the correction. The car and the watch still say
  "Agent started.", because their prompt does not change during a call.
- Grok remembers nothing after a call, because each call starts from the
  prompt. So when the user asks Grok to act differently "in the future",
  "from now on" or "next time", or to "update that", Grok starts an agent
  in Yonder with the request and with what Grok did wrong. The agent
  changes the prompt or the code, so the change stays. Grok never says
  "I'll keep that in mind". "Update that in the future" is not a request
  for `rebuild_app`.
- "Remember" is a request of this kind when it tells Grok how to act:
  "remember to ...", "remember not to ...", "just remember that", "don't
  do that again". A "remember" right after a correction of Grok asks for
  the fix also when the words trail off, because the correction is the
  mistake. When Grok cannot tell what to remember, it asks "Remember
  what?". "Do you remember ...?" is a question, and a fact for the work
  of an agent goes to that agent. The task of the agent tells the mistake
  of this call: the words of the user, the tool call of Grok, and what the
  user wanted. No tool or code changed: `start_worker` in "yonder"
  already does it. The prompt has no example of an older mistake, and it
  forbids an older mistake or an example in the task. Else Grok starts
  an agent with the example of the prompt, and that agent finds nothing
  to fix.
- The user can ask for a review of the past calls ("review our calls",
  "learn from our calls"). Grok starts an agent in Yonder, and the agent
  follows the `review-calls` skill (`.claude/skills/review-calls/SKILL.md`).
  It reads the transcripts that came after the last review, and finds
  the moments where the user got frustrated: a correction, a request said
  again, "what are you doing?", "that's obvious", "stop talking", a change
  that the user asked for, or work that got lost with no sign. It groups
  the moments by the step of the workflow (start work, follow up, hear a
  result, go through the agents, close, update Yonder), and fixes each
  group with two or more moments and each change that the user asked for.
  It looks only at the frustrations and the workflow, and does not judge
  the work of the agents. Each review writes its fixes
  and its open questions in `~/.config/yonder/call-reviews.md`, which also tells where
  the next review starts. A "remember" request fixes one mistake during a
  call, and the review also finds the requests that got lost.
- Grok puts the facts that the user names into the message, not only the
  words that name them. "Tell it our version number" sends the version
  itself. When the user reports a bug in the app, Grok also adds the
  version and the device (the phone app or the Mac app). Else the agent
  gets the words about the version with no number.
- When the user takes back what they said ("never mind", "forget it",
  "scratch that"), at the end of the words or right after them, Grok calls
  no tool and says only a few words. "Never mind X, do Y" still asks for
  Y. After `message_worker`, Grok always says the number of the agent
  ("Sent to 3."), because a sent message cannot come back. Else a half
  thought that ends with "never mind" goes to an agent, and the user
  does not know which one.
- `start_worker` and `message_worker` take a `context` input that Grok does
  not see. The app fills it with the lines of the call since the last
  message to an agent (12 at most), and the bridge adds them to the prompt
  of the worker, so that the agent knows the conversation and not only the
  request. A message to an agent empties the lines, so no agent gets words
  that an earlier agent already got. The task on the screen stays short.
  When the lines are only words of the user that the request already
  holds, the bridge leaves out the block. In the records, 57 of 391 first
  prompts had such a block.
- Images: press ⌘V anywhere in the window, or drop an image anywhere, to
  attach it. A drop takes any file. On the Mac, a file from Finder stays
  at its place, as a copied file does: the bridge reads the drag
  pasteboard (`GET /clipboard-files?drag`). When its names do not match
  the dropped files, such as a file from a browser, each file uploads
  (`/file`). A file that is not a picture or a video, such as an `.xlsx`,
  shows as a page with its type and its name, as high as a picture
  (`.images .doc`), for a drop and for a paste. Check: `bun
  bridge/drop-e2e.ts`. The rest of
  this item is about images. The bridge saves each image in `~/.config/yonder/images`
  (`POST /image`, PNG, JPEG, GIF or WebP, 20 MB at most). The paths go
  with the next `start_worker` or `message_worker` call in a `files`
  input that Grok does not see. The bridge adds the paths to the prompt,
  and the worker reads each file. The prompt box of the conversation view
  also sends the attached images with its message. After a send, the
  images leave the screen, because the agent has them now. Grok
  cannot see the images, but its prompt tells it how many the user
  attached.
  In the chat of an agent of another computer, and in the New agent
  view of another computer, a pasted or dropped image goes to the
  bridge of that computer (`imageFetch` in `src/App.tsx`, `/image` in
  `PEER_PATHS` of `bridge/relay.ts`). It shrinks first, as a photo of the
  phone, because the relay takes 1 MiB at most for each request. That
  computer gets only images: no video, file or pasted text. The bridge
  of that computer must let in `/image`. The attached images go when
  the chat moves to another computer.
- Pasted text: tap Paste in the attach sheet of the phone (see the attach button), or press ⌘V
  outside a text field on the Mac. The bridge saves the text in
  `~/.config/yonder/pastes` (`POST /paste`, 1 MB at most), and the text
  shows as a box with its first words with the attached images. The ×
  on the box removes it. The path goes with the next `start_worker` or
  `message_worker` call in the `files` input, and the bridge puts it in a
  `<pasted-text>` block, so the worker reads the file. Grok gets a note on
  the screen that the user pasted text, and it reads the text with the
  `read_paste` tool of the app (20,000 characters of each text at most).
  The summary of an agent leaves out the block, as it leaves out the
  images.
  A file copied in Finder attaches at its own place, also in a text field.
  WebKit hides the path, so the bridge reads the pasteboard of the Mac
  (`GET /clipboard-files`). Then `POST /local?path=...` (`localFile` in
  `bridge/main.ts`) copies nothing: a picture shows as a thumb and goes in
  the `<images>` block with its own path, a video gets a folder in
  `~/.config/yonder/videos` with a link to the file, its frames and
  `timeline.md`, and the `<videos>` block names the original path too.
  Each other file shows its name and goes in the `<files>` block with its
  path. The relay does not pass `/local`, so only the Mac names a path.
  A folder does not attach: `/local` gives it `folder`, and its path goes
  as text in the prompt box, at the cursor. Two folders go with a space
  between them. With no prompt box on the screen, the folder attaches as
  a file.
  Paste in the attach sheet does the same. A screenshot has no file path,
  so it still attaches as an image. A video or a picture from a file
  links the file, with no second upload.
- Videos: drop or paste a video on the Mac, or pick one with the library
  button of the phone. The app sends it to the bridge in parts (`POST
  /video?id=...`, the last part with `end`), 768 KB each on the phone,
  because the relay takes 1 MiB at most for each request. The video can
  be 2 GB at most. The bridge saves it in `~/.config/yonder/videos/<id>`,
  and makes frames and `timeline.md` (`buildVideo` in
  `bridge/recording.ts`): whisper.cpp (`whisper-cli`, a model from
  superwhisper or MacWhisper, or `~/.config/yonder/whisper.bin`) gives
  the words of its sound, and a frame goes in the middle of each sentence, at each
  pointing word and at even steps, 24 at most. The agent gets the folder
  in a `<videos>` block. During the upload, a box with the percent shows
  with the attached images, and a `start_worker` or `message_worker` call
  waits for the upload. Then the first frame and the length show.
- On the iPhone, the user can pick a video of any size from the photo
  library. The `read_picked` command of `ios/src/lib.rs` first makes it
  an MP4 of 1280 x 720 at most with `AVAssetExportPreset1280x720`
  (`ShrinkVideo.swift`); a portrait video keeps its shape. In a test, a
  4K video of 100 MB became 15 MB. The bridge keeps frames of 1600 px at
  most, so 720p keeps the text of a video of the screen readable. While the
  phone reads or shrinks a photo or a video, the strip shows only a
  percent, and a send waits for it. If AVFoundation cannot write the
  MP4, the original goes. The
  command is async, so it runs off the main thread. Else the screen
  gets the whole original, and a large video gives an error.
- Location: on the phone, "get my location" or "send my location to the
  agent": Grok calls `get_location`, which the app answers with
  `navigator.geolocation`. It gives the latitude, the longitude, the
  accuracy and an Apple Maps link, and Grok puts them in the task of the
  agent. The phone asks the user to allow the location the first time
  (`NSLocationWhenInUseUsageDescription` in `ios/Info.ios.plist`, and
  `ACCESS_FINE_LOCATION` in the manifest of Android). This needs a new
  install of the phone app (`bun run install-ios`, `bun run
  install-android`).
  - `get_location` of the bridge gives the location of the phone to each
    agent, to Grok on the Mac, to the brain of a Claude call and to the
    Claude connector. Example: the user walks in a park and says "log this
    spot in Mind". It gives the latitude, the longitude, the accuracy, the
    time of the fix (`at`), the place name and the address, and the map
    link. The location tool of Claude does not always work, so Yonder
    gives its own.
  - The bridge asks the phone of the live call (its `/awake` pings), else
    the phone of the last message, else the phone that polled last. The
    phone takes the ask with its `/show` poll (`&locate`, each 3 seconds),
    gets one fix with `navigator.geolocation`, and answers with `POST
    /location?id=`. An answer takes about 3 seconds.
  - When no phone polled in 15 seconds (Yonder is closed), the bridge
    sends a push to the phones ("Tap to send your location"), and waits
    up to 25 seconds for a phone to open Yonder. Then that phone gets the
    ask, and the same call gets the pin. A tap on the push opens Yonder,
    and its next poll takes the ask. With no push (no push token or no
    APNs key, as in `check-bridge`), it fails at once. It fails after 30
    seconds with no answer, and it gives the error of the phone, such as
    "The user did not allow the location". The wait and the answer stay
    under the 60 seconds of a connector call at the relay.
  - Else an ask while Yonder is closed fails with "Yonder is not open on
    iPhone". The Mac tools do not need the phone: they go through the
    relay to the bridge. Each other ability works the same way, and
    `notify` goes as the push itself, with no app.
  - Why not a wake with no tap: the app has When In Use location, and
    iOS gives no location to an app that a silent push wakes in the
    background ("Create the session while your app is in the
    foreground", Apple, Handling location updates in the background).
    A wake with no tap needs "Always" location, the Location updates
    background mode, a Swift handler of the push and a new phone app,
    and App Review asks why. iOS also delays or drops silent pushes, and
    never wakes an app that the user swiped away (see the other
    computers). The Location Push Service
    Extension needs Always too, and an entitlement from Apple. Not built.
  - Privacy: only on request, one fix while the app is in use, with no
    tracking. The asks live only in the memory of the bridge.
    `~/.config/yonder/phone.log` has
    each ask: the time, who asked, the phone, the ability and the result,
    with no coordinates. The place name comes from
    OpenStreetMap (Nominatim), which gets the coordinates.
  - The phone has its own `get_location` for its Grok, so the bridge does
    not give its tool to a phone. The phone sends its pin to `POST
    /location` with no id, and gets the place name and a line in
    phone.log.
- The abilities of the phone (`docs/shell.md`). Each ability of the
  phone works as `get_location` does, so that the store app never limits
  what the agents can do.
  - The agents, Grok on the Mac and the Claude call get the `phone` tool:
    an ability and its args. The abilities are in `ABILITIES` of
    `bridge/main.ts` and in `src/abilities.ts`. Today: `location`,
    `haptic`, `notify`, `open` and `face_id`. TestFlight 2.93.519 adds
    `share`, `copy`, `paste`, `photo`, `save_photo`, `contact`, `event`,
    `device`, `badge`, `awake`, `confirm` and `sheet` (the native approval sheet). `device`, `confirm`, `sheet`, `copy`, `paste`, `badge`, `awake`, `share`, `event`, `contact` and a cancel of `photo` passed a test in the iOS 27 simulator, through a test bridge and the relay. The camera of the simulator takes no photo, and `save_photo` and `open` have no test.
  - The phone names its abilities in its `/show` poll (`abilities=`),
    and does each ask of the bridge (`ability` and `args`). It answers at
    `POST /answer?id=` with the result or `error`. A native ability runs
    through the one command `ability` of `ios/src/lib.rs`
    (`Abilities.swift`), whose answer comes as
    `window.yonderAbility(id, answer)`, and `abilities` gives the list of
    the app. An older app answers `abilities` with an error, so it names
    none of them. A new native ability needs a case in `Abilities.swift`,
    a line in `src/abilities.ts` and in `ABILITIES`, and a new phone app.
  - `photo` sends the photo to the bridge as an attached image
    (`/image`), at most 2048 points on its long side, and answers with
    its path on the computer. `save_photo` takes a link of the computer,
    such as `/media?path=`. The event editor and the contact picker of
    iOS 17 run outside the app and need no permission.
  - Approve and Deny on a push: the category `approval` (Approve asks for
    Face ID, and both open the app). The choice comes to the page as the
    event `yonder:push`, with the data of the push. The notifications
    plugin gives a choice only for its own local notices, so a proxy in
    front of its delegate gives it (`Push` in `Abilities.swift`).
  - A `yonder://` link that opens the app comes to the page as the event
    `yonder:opened`. The Mac app takes these links too (after a new
    build), with the name of the app that sent the link as
    `app` of the event. `yonder://new` is a new task link (see New task
    links).
  - `yonder://agent?id=<agent ID>` opens the conversation of that agent.
    Copy Link in the three dots of an agent, and in the right-click menu
    of its row (also a row of another computer), gives this link
    (`copyAgentLink` in `src/App.tsx`). The page finds the agent on the
    computer in use, or else on another computer that shows, as a tap
    on its row there (`linkedAgent`). The ID is the session ID, so one
    link works on each Mac and phone of the user. A link that comes
    before the first list of the agents waits for it. A link only opens
    a view, so it needs no check. An agent that nobody can find shows
    "Yonder cannot find this agent." The list of another computer has
    no closed agents, but it keeps each agent of a link
    (`linkedAgents` in `src/elsewhere.ts`). So a link opens a closed
    agent of another computer too. Else that link finds nothing (Sentry
    YONDER-W). Only the Mac app and
    the iPhone app take `yonder://` links: Android, Linux and Windows do
    not.
  - The quick action "Default screen" on the icon of the app: the next
    start runs the screen of the install, and `ui` of `phone.json` goes
    away. No screen can hide it. It is the way back from the custom
    screens of `docs/ui-themes.md`.
  - The bridge asks the same phone as for the location, and refuses at
    once an ability that the app of that phone does not name. An ability
    that opens a screen, such as the share sheet, waits up to 2 minutes
    for the user.
  - A screen from before the abilities polls with `&locate` and answers
    at `/location?id=`, and the bridge still takes that. A new screen also
    sends `&locate`, for a bridge from before the abilities.
  - Content that Yonder did not make, such as an app page of the Apps tab,
    never reaches an ability (App Review Guideline 4.7.2).
  - With the screen locked, iOS can refuse the fix, because the
    permission is "while in use". The error then asks the user to unlock
    the phone. A fix with a locked screen needs a native change.
- Haptics: on the phone, each button, link, image, agent row, call row,
  option and menu item gives a light tap of the Taptic Engine. Each tab
  change also taps, so a drag along the tab bar taps on each tab. A
  press of the call button taps once, firmer. When the call goes live,
  the phone taps three times, from light to heavy, and when the call
  ends, three times, from heavy to light. `haptics()` in `src/bridge.ts`
  plays the taps, 110 ms apart. The end taps also come when Grok or a
  lost connection ends the call. Each close or delete of an agent taps
  twice (`act()` in `src/App.tsx`). One click listener in `src/main.tsx` and
  `haptic()` in `src/bridge.ts` do it, through `tauri-plugin-haptics`.
  This needs a new install of the phone app (`bun run install-ios`, `bun
  run install-android`). An older phone app rejects the call, and the
  front end ignores the error. The Mac has no haptics.
  - The capability is `haptics:allow-impact-feedback`. The plugin has no
    `haptics:default` set, and with it the phone refuses each tap.
  - iOS mutes the haptics while the microphone records. So
    `yonder_haptics_in_calls` in `Island.swift` sets
    `setAllowHapticsAndSystemSoundsDuringRecording(true)` at the start
    of the app, and the buttons also tap during a call.
- Done sound: the check at the end of an agent row, on the Agents tab
  and the Done tab, and the check of an open agent play the Drip sound
  of TickTick (`public/drip.wav`, `ding()` in `src/bridge.ts`). The app decodes the file once at the start, and the file has no silence at its start, so the sound comes at the tap. The AudioContext of the sounds is suspended when no sound plays, because a running one uses the battery. On the Mac, a move of the mouse or a key in the window wakes it, and it is suspended 60 s after the last one (`AWAKE_MS`). A suspended context stops the stream to the output, and the output, such as the audio of a monitor, can need a moment to wake. Else the start of the drip is lost, and the sound comes late after a click on complete. The mouse moves to the button before the click, so the stream runs at the click. A running context used 0.2 % CPU in WebKit, but a running output keeps the Mac from idle sleep, so it does not run all the time. While the Mac keeps the microphone of dictation open, a sound plays on the running AudioContext of that microphone (`shareAudio`). A second AudioContext that starts next to an open microphone makes macOS change the audio, and else the sound of a done agent glitches and comes late. A close
  by Grok or from a menu plays no sound.
- Send sound: a new agent from the New agent view (the talk view or the
  text box) and a voice note to an open agent play a soft, quick swish
  (`public/whoosh.m4a`, `whoosh()` in `src/bridge.ts`), as the notch
  does for a new agent. The file has no silence at its start, and the
  app and the notch load it once at the start, so it plays at the send.
  It plays when the words are final, so it does not touch the
  microphone of the dictation, and not during a call, where the
  microphone of the call would hear it. It sounds like the paper
  airplane of the Spark mail app.
  - The swish is Mixkit sound 3220 (Mixkit Sound Effects Free License,
    which lets an app use it), `swish-3220-soft-c.wav`, 0.42 s.
    It has a high-pass filter at 250 Hz, a low-pass filter at 4.5 kHz,
    a smooth fade-in and fade-out, a short room tail, and a peak of
    -10 dBFS.
  - A phone gets `public/` files only with a new build of the phone
    app, because the updates over the air carry only the JS and the
    CSS. Until then the whoosh is silent there.
- WebKit pastes only into an editable element, so ⌘V outside a text field
  goes to a hidden text area. The window sets `dragDropEnabled: false`,
  so that the web page gets the dropped files. If ⌘V does nothing in the
  app, read the clipboard with the Tauri clipboard plugin instead.
- The Mac app records no full screen and has no `screen_recording` tool
  of Grok. Old recordings stay in
  `~/.config/yonder/recordings`, and an old `<screen-recording>` block
  still shows as a video in its conversation.
- Record an area: the round button next to the paper clip of
  each prompt box on the Mac (`recordScreen` in `src/App.tsx`) calls
  `POST /record` (`recordScreen` in `bridge/recording.ts`). The bridge
  runs `yonder-select` (`src-tauri/select/main.swift`), our own
  selection, as the selection of macOS: the screen darker, a cross
  cursor. The user drags an
  area, and the bridge records it with `screencapture -v -R x,y,w,h
  -k -x`. Escape, a right click, a click without a drag, or the record
  button again cancels the selection. macOS 27 refuses
  `screencapture -i -v` ("video not valid with -i"), and the toolbar of
  Shift-Command-5 (`-iU`) keeps the last area and gives no drag, so the
  bridge uses neither. The button is a red
  stop while it records. A second click (`POST /record/stop`, SIGINT)
  ends it, and 10 minutes end it too. After the drag, `yonder-select`
  stays as a stop button in the menu bar (`stop.circle.fill`), as the
  stop of macOS, and one click there ends the recording. During a
  recording the user works in another app, and there the first click on
  Yonder only brings it to the front.
  - The clicks: while it records, `yonder-select` prints each left or
    right click in the area, with its time, its place and the app
    under it (a global monitor of the mouse, no permission). The
    bridge keeps them in `<video>.clicks.json`, and `buildVideo` puts
    each one in `timeline.md` ("[click at 40% from the left, 25% from
    the top, in Safari]"), with a frame 0.3 seconds after it. So the
    agent knows where and when the user clicked. The `-k` of
    screencapture also draws a circle at each click in the video. The file goes to
  `~/.config/yonder/recordings`, and the app attaches it as a video
  that the user copied in Finder (`/local`): the agent gets its words
  (whisper.cpp) and its frames in `timeline.md`, in a `<videos>` block.
  The relay does not pass `/record`, so only the Mac records.
  - The sound comes from the microphone of the settings (Voice,
    Microphone, `micName`), else from the built-in microphone of the
    Mac (`-G` with its uniqueID, `micId`), and never from the input of
    macOS: AirPods with an open microphone play all sound in the low
    quality of a phone call. The
    music of other apps pauses while the button is red, as for a
    dictation (`set_mic`, the switch Pause music).
  - screencapture writes a frame only when the screen changes, so the
    picture of a recording can end before its sound. `buildVideo` then
    uses the last frame of the file for a later moment. Else a still
    screen gives no frames, and the video fails.
  - Yonder needs the Screen & System Audio Recording permission for
    this button.
- When Grok cannot answer a question from its prompt, it starts an agent in
  the Yonder project with the question, and it does not say "I don't know".
  "Ask another agent" means the same.
  Grok then says that it is not sure and that it will ask an agent ("I'm
  not sure, so I'll ask an agent in Yonder."), not "Got it, I told them."
- Keep the speech short. Give the gist first, then give details if the person
  asks for them. The prompt is in `src/App.tsx` (`instructions`), in the
  section order of the xAI prompting guide.
- Grok goes through the agents one at a time. When the user asks about a
  group ("what do the completed ones say?"), Grok tells about the first one
  at once, and stops. It does not ask first if the user wants to go
  through them. The user answers ("close it", "continue"), Grok does it and
  tells about the next agent in the same answer. It does not offer the next
  agent, because the user can mistake that for the question of the agent.
  An update on all the agents at once is too much.
- After a close in a walkthrough, Grok says no "Done." or "Closed.": it
  goes on at once with the next agent ("Next, agent 4 added the Closed
  tab."), because the screen shows the close. This is the same when the
  user goes through a tab by numbers. Else the user hears only "Done."
  after each close, and must name each next agent.
- Each next agent comes with what it did. When the user says "next" or
  "tell me the next one", Grok says the number and, in one or two short
  sentences, what the agent did and what it needs from the user. It never
  says only "Next is agent 4.", because the user does not look at the
  screen. When Grok does not know the work, it calls `get_worker` first.
- A summary of all is the one exception: "give me a summary of all",
  "sum them all up" or "go over all of them". Grok says "One moment.",
  calls `review_workers` with the tab on the screen (or the group that
  the user names), and then says one short sentence for each agent:
  what it did, and "I recommend closing it" with the reason for each
  Close line. It ends with one question, such as "Should I close 3, 5
  and 7?". After a yes, it closes those agents one at a time, never with
  the tab, because the tab also closes the agents to keep. It calls no
  `show_agent`, so the list stays on the screen. The user wants what
  each agent did and which ones to close, from a second model (Sonnet
  5.5 on high effort), not only the counts by status.
- Each tab is one group of agents for Grok. "The open ones" or "the
  running ones" are on the Agents tab (running). "The completed ones" or
  "the done ones" are on the Done tab (the value `completed`: waiting,
  done or failed). "The ones to review" are the agents at the top of the
  Done tab that wait on the user or need the user. "The closed ones" are
  on the Closed tab. "The saved ones" are on the Saved tab. Removed agents
  show nowhere. Grok tells only about the group
  that the user names. The prompt gives the tab of each agent. Else Grok
  can tell about a closed agent when the user asks for the completed
  ones.
- A group always means its tab, also when the screen shows another tab.
  "Delete" means remove, never close. For a group ("delete the closed
  ones"), Grok calls `close_worker` or `remove_worker` one time with
  `tab` (agents, completed, saved or closed), and the bridge selects the agents
  of that tab. On the Agents, Completed and Closed tabs, the app sets the
  project of the group to the project on the screen. With "All projects"
  selected, or for "all the projects", Grok leaves out the project, and
  the group covers all the projects. Else Grok names some projects for
  "delete for all projects", says "Done", and the agents of the other
  projects stay. The bridge also removes the agents of a group all at
  once, not one at a time. A group skips
  terminal sessions. "Undo" or "reopen them" calls the `undo` tool of
  the bridge. It covers only the agents of the last close, complete or
  remove, and puts each one back as it was before. A removed agent
  cannot come back. Else "delete all the closed ones" on the Agents tab
  can close the running agents too, and "undo" starts many agents
  again.
- The app has no group buttons, such as "Close all" or "Delete all".
  Grok does the group actions by voice:
  "move the completed ones to closed" (`close_worker`), "move the closed
  ones to completed" (`complete_worker`), and "delete the closed ones"
  (`remove_worker`).
- "Close" or "let's close" with no group word closes one agent: the agent that Grok told about last, or the open conversation. Grok closes a group only when the user names it ("all", "the done ones", a tab). When Grok is not sure, it asks "Just this one, or all of them?" Else "let's close" after one agent closes all the completed agents.
- "Are we good to close 4?" is a question, not a close. Grok calls `get_worker` for agent 4 and gives its advice in one or two sentences with the reason: the agent still runs, waits on a question, left work undone, or finished. Grok closes the agent only after a yes, and never asks "Just this one, or all of them?" for a named agent. The rule is in the prompt of the app and in the prompt of the car.
- With a tab, the bridge ignores the worker. Else a `close_worker` call
  with the worker "yonder" and the tab "completed" closes only the
  newest agent of Yonder, and the other agents stay on the Completed
  tab.
- Grok highlights the agents that need the user. For "any news?", it goes
  through only the agents that wait on the user and the results that need
  the user's attention (see Clef under Workers). Then it says in one
  sentence how many other agents finished their task.
- Each time Grok tells about one agent in the news or a walkthrough, it
  also calls `show_agent`, so the screen opens the conversation of that
  agent. The user then sees its summary and chat without a search. The
  walkthrough keeps its group when the screen changes to the project of
  the agent. For a group of all the projects, Grok first calls
  `list_workers`, because the prompt then shows only the project on the
  screen.
- After a close, the next agent of a walkthrough is on the same tab, also
  when the user opened the agent with a click. In the same turn as a
  `close_worker`, `complete_worker` or `remove_worker` of Grok, `show_agent`
  does not change the tab, and tells Grok to stay on it. The next words of
  the user can show any agent again. Else a walkthrough of the Completed
  tab can show a running agent, and the screen goes to the Agents tab.
- Grok never gives news on a closed agent, because the user closed it on
  purpose. The news, the walkthrough and the start of a call leave out the
  closed agents. Grok tells about a closed agent only when the user names
  it or asks about the closed ones.
- Grok closes or removes an agent only when the user asks for it in the
  latest turn. "Close all the done ones" covers only the agents that had
  that status at that time. Grok never closes an agent by itself. Else
  Grok can close a waiting agent after its summary, because of an older
  "close all the done ones".
- The voice agent never waits for a worker. Each tool returns at once.
- Grok does not announce a worker that finishes or that waits on the
  person. The screen shows the status of each agent, and Grok knows the
  result from its prompt. The app sends no `[Yonder]` message, because
  else Grok says "this agent finished" again and again.
- One exception is news in a pause. When an agent starts to wait on the
  user, or gets a result that needs the user's attention (Clef), during a
  call, the app keeps it. When nobody spoke and Grok played nothing for
  4 seconds (`QUIET_MS` and `quiet()` in `src/voice.ts`), the app gives
  Grok one message for all the news (`offerNews` in `src/App.tsx`). Grok
  then says one time, for example "Agent 12 in Yonder needs your
  attention." It asks no question, such as "Do you want an update?", and
  gives the update only when the user asks.
  Each agent is news one time for each change. A plain finish is still
  no news. The news leaves out the agent on the screen, the terminal and
  background sessions, the sub-agents, and an agent that the user read
  before the pause. Thus the user knows when an agent waits for a reply,
  and the news never comes while the user or Grok speaks.
- A long silence with no news is a time to tidy up. When nobody spoke
  for 30 seconds (`CLOSE_QUIET_MS` in `src/App.tsx`), the app tells Grok
  about the done and failed agents that finished 10 minutes ago or more
  (`CLOSE_AFTER_MS`) and that the user read (`offerClose`). Grok asks one
  time, for example "Agents 3 and 5 finished a while ago. Do you want me
  to close them?" It closes them only after a yes. Each agent comes up
  one time in a call. The offer leaves out an agent with a blue or purple
  dot, the terminal and background sessions, and the sub-agents.
- An open conversation is the focus of Grok. Grok answers only about
  that agent until the user goes back or names another agent. When the
  agent ends its turn during a call (running to waiting, done or
  failed), the app gives Grok the last prompt of the user and the last
  answer of the agent (`tell` in `src/voice.ts`). Grok then says in one
  or two sentences what the user asked and what the agent answered. This
  is the one exception to the rule that Grok does not announce results.
  The agent does the work, and Yonder sums it up.
- The prompt lists the projects, the counts of all the agents by status, the
  names of the agents with news, and the twelve newest agents, with the task,
  activity, the end of the last message, and the context use of each. During
  a call, the app sends a new `session.update` when this list changes (at
  most every 3 seconds), so Grok answers without a tool call. This is also
  the memory between calls.
- The prompt gives the version of the app, the build ID on the screen
  ("2.B.N", see Versions), so that Grok can say it.
- `install-app` gives the same number to the Mac app as "2.B.N", so
  Finder shows the same version as the screen.
- The prompt also tells Grok what is on the screen: the open tab, the
  selected project, and all the agents of that project in the order of the
  screen. "This project" and "these agents" mean that project. A change of
  tab or project goes to Grok at once.
- On the Agents, Completed and Closed tabs, Grok gives news only about the
  project on the screen: "All agents" counts only its agents. On the
  Projects tab, the news covers all the projects. On these tabs the
  prompt also leaves out the agents of other projects, because else Grok
  still tells about them. On
  these tabs, the app also gives Grok only the agents of that project from
  `list_workers`. When the user names another project, Grok calls
  `show_project` for it.
- "Open it in Ghostty" or "open it in the terminal": Grok calls
  `open_in_terminal`, and only when the user names Ghostty or the
  terminal. "Open agent 19" or "open it" alone does the same as "show
  me 19": Grok calls `show_agent`, and the screen opens the
  conversation. "Open" alone never opens Ghostty and never makes an
  agent run. "Run it again" or "continue it" for a done, failed or
  closed agent makes it run again: Grok calls `message_worker` with a
  short message, such as "Continue."
- Grok can change the screen: the `show_project` tool, which the app
  answers itself, selects a project and opens its agents ("switch to
  Yonder").
- "Open the folder of that recording": Grok calls `open_folder` with a
  path or a project name, and the bridge opens the folder in Finder. For
  a file, Finder opens its folder with the file selected.
- A full path in an answer of an agent is a link on the Mac
  (`src/paths.ts`). A click calls `open_folder`, so a folder opens in
  Finder, and a file shows selected in its folder. A path starts with
  `~/`, or with a slash, a name and a second slash, so that a slash
  command such as `/help` stays text. On the phone a path stays text,
  because Finder opens on the Mac.
- A path outside backticks ends at a space, in the link and in
  `findMedia`. So the prompt of each agent (`SPOKEN`) tells it to put a
  path that has a space in backticks. Else an agent that writes
  `~/Movies/Nova Clips/dial.mp4` with no backticks gives the link
  `~/Movies/Nova`, a click says "There is nothing at …", and the video
  does not show (Sentry YONDER-10). `open_folder` also opens a cut path:
  when the path does not
  exist, and one name in its folder starts with its last word and a
  space, it opens that name (`uncut` in `bridge/media.ts`).
- "Read the note": Grok calls `read_file` with the path of the file,
  and reads the text aloud. The bridge gives the last 8000 characters of
  a long file. Grok calls `open_folder` only when the user names Finder
  or a folder. Else "read the entire note" opens the note in Finder.
- "Copy that command": Grok calls `copy_to_clipboard` with the exact
  text, and the bridge puts it on the clipboard of the Mac with
  `pbcopy`. Universal Clipboard also gives it to the iPhone.
- "Show me 19": the `show_agent` tool, which the app answers itself,
  selects the project and the tab of agent 19 and opens its
  conversation. The prompt and `get_screen` tell Grok which conversation
  is open, so "this one" or "open it" means that agent.
- "Show the completed tab": the `show_tab` tool, which the app answers
  itself, opens one tab (projects, agents, completed, closed, preview or calls)
  and keeps the selected project.
  It also closes an open conversation, so "open agents" shows the list
  of agents, also when the screen is already on the Agents tab.
  "Show agents", "show running" or "show open" opens the Agents tab,
  "show completed", "show done" or "show review" the Done
  tab, "show closed" the Closed tab, and
  "show projects" the Projects tab, and "show the tunnel tab", "show the
  sites" or "show previews" the Tunnel tab (the value `preview`). "Show" a group opens its tab and does
  not start the walkthrough of its agents.
  After `show_tab`, Grok says nothing, because the screen shows the tab.
  `show_project` still gets a few words.

## Volume of the voice

The echo cancellation of a call puts the audio on the call volume of the
system, so the volume keys can fail to change the voice of a call:

- On the iPhone (`play-and-record`, Speaker), the slider of Control
  Center changes the media volume, not the call volume. Only the side
  buttons change the call volume, and not to zero (WebKit bug 213390).
- On the Mac, a call on a headset with the microphone of the headset
  puts the headset in hands-free mode (8 or 24 kHz), and the headset can
  take the volume keys.

Yonder has no volume of its own: no slider, no `GainNode` and no
limiter. The voice goes at 100% to the output of the call, on the Mac
and on the iPhone. The volume keys of the Mac and the side buttons of the
iPhone control the voice, as in other apps. A gain of the app above 100%
clips, and a linear slider does not sound like even steps. The end of a
dictation sets the audio session of iOS back to `auto`, unless a call
opened the microphone (`micInCall`). Else, after the talk view, the side
buttons change the call volume with no call.

On the iPhone the side buttons can still fail to lower the voice of a
call, and seem to push it up. The cause is not CallKit: the iPhone app
has no CallKit call (only the watch has one). The cause is the echo
cancellation of WebKit. With `echoCancellation: true`, WebKit records
with the voice processing unit of iOS (VPIO), and without it with the
plain unit (RemoteIO). The voice processing puts the voice on the call
volume, and its gain control works against the side buttons.

So a call on the iPhone first asks iOS for its own echo cancellation
(`setPrefersEchoCancelledInput`, iOS 18.2 and later, on certain 2024 or
later iPhones). This needs a new build of the phone app (the
`echo_input` command of `ios/src/lib.rs`, in `Island.swift`). Then the
call opens the microphone without the echo cancellation of WebKit
(`phoneMic` in `src/voice.ts`), and the voice stays out of the voice
processing. iOS tells only after the microphone opens if its echo
cancellation is on, and `call.log` gets an "echo:" line.

An older iPhone, such as an iPhone 14 Pro, has no echo cancellation of
iOS: its first call after a new build logs "echo: ... off". On such
iPhones the microphone is closed while the voice talks.

- A call on the iPhone never uses the echo cancellation of WebKit
  (`echoCancellation: !phone` in `getMic` of `src/voice.ts`). So the
  voice is on the volume of play-and-record, and the side buttons work
  as for media. The Mac keeps the echo cancellation.
- When iOS cancels the echo (`iosEcho`), the microphone stays open, and
  the user can interrupt the voice by voice.
- Else the microphone sends silence while the voice plays and for
  300 ms after (`gated`). The gate works only when the sound plays on
  the built-in speaker or the receiver. With headphones no echo comes
  back, so the user can still interrupt by voice. A change of the route
  during a call gives a "route:" line in `call.log`.
- No tap stops the voice. On the speaker, the user waits for the end of
  the answer, or ends the call.
- Without the voice processing, the microphone has no gain control. The
  speech then reaches a peak of only 0.02 to 0.07 in `call.log`, where
  calls with the voice processing give 0.6 to 0.9, and Grok hears
  nothing. A Claude call still works, because the speech model of Apple
  hears quiet speech. So the call multiplies the microphone of an iPhone
  by 8 (`input` in `startCall`), except when iOS cancels the echo.
- `call.log` measures the voice of the user to tune that gain. Each
  `mic:` line every 5 seconds gives the loudest RMS of a frame of 100 ms
  after the gain, the same value before the gain (`raw`), the level of
  the bars, and the part of the samples that clip. The worklet measures
  before the clip, and leaves out the frames while Yonder speaks. At the
  end of the call, the `mic loudness` line gives the median and p90 of
  the speech, the room, the clip, and the gain that puts the median of
  the speech at an RMS of 0.1.
- After the gain of 8, the speech of the iPhone can still be at an RMS
  of only 0.02 to 0.03, and the bars expect 0.05 to 0.3 (`size` in
  `src/Levels.tsx`). Then the bars hardly move, and the user says the
  words again about 2.4 s after each `speech_stopped`. Each new word
  cancels the answer that Grok prepared, before its audio comes. A test
  socket from the Mac with the same prompt size and tools gets the voice
  1.4 s after `speech_stopped`; a phone call needs about 3 s.
- So the bars of an iPhone call get 8 times the level of the
  microphone (`lift` in `startCall`). Grok hears the same audio. The
  `mic:` lines also give `queued`, the bytes that wait to go
  out on the socket, so that a slow upload of the phone shows.
- With typical speech at 0.02 at the bars, a lift of 4 fills less than
  half of the bars, and a lift of 8 fills about two thirds.

## ElevenLabs

ElevenLabs is another voice model, next to Grok. Choose it in the Model
row of the Voice settings.

- ElevenLabs keeps the settings and the tools of a voice agent on its
  side, so `bridge/eleven.ts` makes one agent "Yonder" and one client
  tool for each tool of the call. The ids stay in
  `~/.config/yonder/elevenlabs.json`. The key is `ELEVENLABS_API_KEY` in
  `~/.config/yonder/.env`.
- At the start of each call, the app sends its tools and the rate of its
  audio (44.1 or 48 kHz) with `POST /token` to the bridge. The bridge
  changes a tool or the agent only when something changed, and gives a
  signed URL of the socket. The first call makes about 30 tools (about
  4 s); after that the URL takes about 0.1 s. An older bridge ignores
  the POST and gives a Grok token, so the app asks the
  user to restart the bridge, as for an OpenAI call. Else the app gives
  the Grok token to `new WebSocket` and shows its error. The bridge never changes the
  voice or the LLM, so the user can change them in the ElevenLabs
  dashboard. The defaults are the voice Lucy at the speed 0.92,
  `eleven_v4_turbo`, `gemini-3.8-flash` with the reasoning effort "low", the turn
  eagerness "patient", no "are you there?" in a silence, and calls of up
  to 2 hours. Lucy ("Fresh & Casual", `lcMyyd2HUfFzxdCaC4Ta`) is a V4
  voice of the voice library: calm, playful and realistic. A change of
  the voice of the live agent is a PATCH, because the bridge never
  changes the voice.
  `GET /v1/models` and `GET /v1/convai/llm/list` give the models.
  `gemini-2.5-flash` is deprecated (replaced by `gemini-3.5-flash`).
  With `bun bridge/eleven-check.ts`, the agent answers about 1.1 s after
  a tool result. The OpenAI call already uses `gpt-realtime-2.1`.
- The app sends the prompt of the call in
  `conversation_initiation_client_data`: the agent allows only this
  override. ElevenLabs cannot replace the prompt during a call, so a
  change of the agents or the screen goes as a `contextual_update` with
  only the lines that changed. News of the app goes as a `user_message`.
- `onEleven` in `src/voice.ts` handles the events. The audio is PCM in
  base64 JSON. An `interruption` stops the playback, and the audio of
  earlier turns is dropped, as in the SDK of ElevenLabs. The tool calls go
  through the same `runTool` as with Grok, with the same checks.
- ElevenLabs always speaks again after a tool result, also when the
  result says "say nothing" or the tool does not wait ("Agent started.
  Agent seven started."). So the app drops
  that second answer when the agent already spoke in the turn and no
  result has news, as `response.done` does for Grok.
- ElevenLabs gives no event when the user starts to talk, and no end of
  a response. So a loud frame of the microphone holds back the news of
  the app, and after `end_call` the call ends after 2 s with no sound.
- ElevenLabs takes only a part of JSON Schema: no `pattern`, and each
  value needs a description. The bridge gives a value its name as the
  description when it has none. Else ElevenLabs refuses the tool.
- The calls go on the ElevenLabs key of the Mac, never on the Yonder
  account. The cost estimate is $0.10 a minute. Web search and X search
  are tools of xAI, so the ElevenLabs agent does not have them.
- `bun bridge/eleven-check.ts` speaks a request into a real conversation
  and prints the events.

## Claude

In this call Claude is the brain, next to the Grok call, so that the user
can compare the two. Choose Claude in the Model row of the Voice
settings. The research is in `docs/brain.md` (design B). The call is a
pipeline with no voice model: speech to text, the brain, and text to
speech.

- The call has no socket and no token. The app opens the microphone with
  the echo cancellation of the call, as for Grok, and plays the speech on
  the AudioContext of the call (`src/brain.ts`, `brainCall`).
- Speech to text: the speech model of Apple on the Mac, through
  `/dictate` and `yonder-dictate`, as in the dictation. It is free, and no
  sound leaves the Mac. A frame of 100 ms is speech when its loudest
  sample is over 6 % of full scale, or 15 % while the speech of Yonder
  plays. The first loud frame starts a turn of the user, with the 300 ms
  of sound before it, and 1.2 s of quiet frames ends the turn
  (`SILENCE_MS`, as for Grok). The sound of the turn goes to the speech
  model in parts each 150 ms. The last text goes to the brain.
- The first words of a turn stop the speech of Yonder at once and drop
  the texts that wait. A sound with no words, such as a cough or the echo
  of the speech, does not stop it. The texts of the brain also wait while
  a turn of the user has words.
- The brain is one lean `claude -p` session in the bridge for each call
  (`bridge/brain.ts`): Sonnet 5.5 on low effort, the tools of the bridge
  over MCP, Read, Grep, Glob and background agents, and a short prompt
  (`BRAIN_PROMPT`). It runs on the Claude subscription, in the folder of
  the summaries, so it is not in the list of agents. The app starts it when
  the call starts, and a first turn puts the prompt and the tools in the
  cache. `POST /brain` sends to it, and `GET /brain` gives its texts, its
  tool calls and the end of each turn, in a long poll of 8 s at most.
- The words of the user go to the brain with the screen of the app, when
  the screen changed. New words stop the turn that runs (the interrupt of
  Claude Code), and the texts of the old turn do not play. The interrupt
  also drops the messages that wait in the queue of Claude Code, but a
  message that comes after it runs. So new words also stop a turn with
  news of the app, and that news is lost.
- Text to speech: ElevenLabs, with the `ELEVENLABS_API_KEY` of the Mac
  and the voice of the ElevenLabs call (Lucy, `eleven_v4_turbo`, speed
  0.92). `POST /speak` gives each text of the brain as PCM16 at 24 kHz.
  PCM at 44.1 kHz needs the Pro plan of ElevenLabs. The speech of each
  text loads when the text comes, and the texts play one after the other
  with no gap. A failed speech ends the call with its error.
  `POST /speak` with `voice` (a Grok voice, such as `liora`) speaks the
  text with the text to speech of xAI (`POST https://api.x.ai/v1/tts`
  with `text`, `voice_id` and `language`) and the `XAI_API_KEY` of the
  Mac, as MP3. The first sound comes after about 0.5 s. The listen
  button of a conversation uses it.
- The brain has `end_call`, `show_tab`, `show_agent` and `show_project`:
  the bridge gives them only to the MCP connection of the brain
  (`/mcp?brain=<call>`). A tool of the screen gives an `app` event in
  `GET /brain`, and the app does it as it does for Grok. The brain gets
  "Done." at once, so an error of the app, such as "No project matches",
  does not reach it. The brain has no other tools of the app. When it
  calls `end_call`, `GET /brain` gives an `end` event, and the app ends
  the call when the turn is over and its last text played.
- News of the app (`tell`) goes to the brain, and the brain answers
  "(quiet)" when the user needs no words. The prompt of Grok and its
  updates (`update`) are not used.
- The call shows no cost: ElevenLabs takes the characters from the
  credits of its plan, and the brain uses the limits of the Claude plan.
- `bun bridge/claude-call-check.ts` checks the pipeline. It starts a
  second bridge from the source on a free port, with its own folder
  `~/.config/yonder-<port>` and the `.env` of the live bridge, and runs
  `brainCall` in Bun with two questions from `say`. The second question
  comes when the first answer starts to play. The last text of the user
  comes 1.1 s after the end of the speech (the 1.2 s of silence), the
  first note of the brain ("Checking the agents.") 1.4 s later, and its
  speech 0.45 s after that: 3.0 s in all. The first words of the second
  question stop the speech 1.1 s after its start, and the brain then
  calls `show_tab` with `completed` (the Done tab). It costs two short
  turns of Sonnet and a few hundred characters of ElevenLabs.
- An older bridge has no `/brain` or `/speak`, so the app asks the user
  to restart the bridge.
- The phone reaches `/brain`, `/dictate` and `/speak` through the relay,
  which lets a phone use only the paths in `PATHS` of `bridge/relay.ts`.
  Else the phone gets 403, and the call says that the bridge is too old.
