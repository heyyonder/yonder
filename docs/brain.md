# A Claude brain for the voice call

## Status

Research, and design B is built. The Claude model in the Voice settings
is design B with no voice model: the speech model of Apple hears,
`yonder-dictate` makes the text, the brain decides, and ElevenLabs speaks. "Claude" under "Voice agent (Grok)" in
`docs/wiki.md` tells how it works.

This is another way to talk to the agents. A local Claude Code session
makes the tool calls of the bridge (the brain), and the voice only talks
to the user and to the brain. The goals are answers that come faster, a
call that feels more live, and a voice that is much smarter. The research
also covers how the user can talk while Claude works, and how Happy
(happy.engineering) does its voice.

`bun bridge/brain-check.ts` starts a brain in a terminal, so you can try
it now. "Try it" at the end tells how.

## The words

- The **brain** is one Claude Code session that stays open for the whole
  talk. It gets the words of the user as text, decides, calls the tools
  of the bridge, and writes the answer.
- The **voice** is the part that hears and speaks. Today it is Grok, or
  OpenAI, or ElevenLabs.
- An **agent** is still one Yonder worker, as in "agent 3".
- A **background agent** is a sub-agent of Claude Code inside the brain
  (the Agent tool with `run_in_background`). It is not a Yonder agent.
- A **turn** of the brain starts with one message and ends with one
  `result` event.

## Today

- The voice decides. Grok hears the user, picks one of about 30 tools,
  and speaks. Its prompt is about 48,000 characters (`instructions` in
  `src/App.tsx`), and most of its rules correct mistakes of Grok.
- `runTool` in `src/voice.ts` has more guards for those mistakes: a
  message to an agent that does another task (`busy`), a close of an
  agent that started less than a minute ago (`fresh`), the same message
  two times (`again`), and words that promise a tool with no tool call.
  Reviews of real calls found more mistakes of this kind.
- A question that is not in the prompt goes to a new agent: "I'm not
  sure, so I'll ask an agent in Yonder." The answer then takes minutes,
  and the user must ask for it again.
- The first words come about 2.2 s after the user stops. 1.2 s of
  silence ends the turn of the user (`SILENCE_MS`). Then Grok answers or
  calls a tool after a median of about 1.0 s in a fresh call ("Voice
  agent (Grok)" in the wiki).
- The open conversation already relays. Grok sends the words of the
  user to one agent with `message_worker`, and the app gives Grok the
  answer of the agent (`tell`). Each message stops the session of the
  agent and resumes it in a new `claude --bg` process. In 274 prompts of
  real Yonder agents, the first text of the agent came after a
  median of 15.4 s (half of them between 7.3 and 26.1 s), and the first
  event of any kind (a thought or a tool call) after a median of 2.6 s.
  These prompts are real tasks, so they need more work than the
  questions below. The agents run Opus 5.5 by default, with all the
  settings, plugins and MCP servers of the user.

## Why the earlier decision said no

"Decision: two layers, no orchestrator session" in the wiki says that a
Claude session between Grok and the agents adds 10 to 30 s to each turn,
and that it needs a queue. That is true for a full session, as the 15.4 s
above shows. A lean session that stays open answers a short question in
0.4 to 4 s, and Claude Code has its own queue. The numbers are below.

## Measurements

The setup: Claude Code 2.1.291. One `claude -p --input-format stream-json
--output-format stream-json --include-partial-messages` process for all
the turns, with a short `--system-prompt`, no built-in tools
(`--tools ""`), only the MCP server of the bridge (32 tools,
`--strict-mcp-config`), no settings (`--setting-sources ""`), and
`--no-session-persistence`. It ran in `~/.config/yonder/summarizer`, so
the bridge did not list it. The question with a tool call was "How many
agents are running right now, and what is each one doing?", which calls
`list_workers`.

| Brain | First words, no tool | First words of the answer, one tool call | End of that turn |
| --- | --- | --- | --- |
| Haiku 4.5, thinking off | 0.44 s, 1.1 s cold | 1.3 s ("Let me check" at 0.36 s) | 2.2 s |
| Sonnet 5.5, low effort | 0.6 to 1.0 s, 1.2 s cold | 2.7 s ("Checking the agents." at 0.6 s) | 2.7 s |
| Opus 5.5, low effort | 1.6 s cold | 4.1 s | 4.1 s |

- "Cold" includes the start of the process: it is ready after about
  0.5 s. After the first turn, the prompt and the tools come from the
  cache (9,000 to 14,000 tokens).
- The queue: a message that comes during a turn waits in Claude Code.
  It runs as its own turn when the turn ends, 0.4 s later. The bridge
  needs no queue.
- An interrupt: `{"type":"control_request","request_id":"1","request":
  {"subtype":"interrupt"}}` on stdin stops the turn in about 5 ms (the
  result is `error_during_execution`). The next message then runs as
  usual, with its answer in 1.3 s on Haiku.
- A question about the code, with Read, Grep and Glob: "Why does Yonder
  wait 1.2 seconds of silence before it answers?" Sonnet said "Checking
  the code." at 1.2 s and gave the correct answer at 4.4 s, with no agent.
  To the question where that pause is set, Haiku gave the wrong
  constant (`QUIET_MS`, not `SILENCE_MS`) at 4.2 s, with the name of the
  file and a line of code in the speech. Sonnet gave the correct one at
  3.5 s, in plain words. Haiku is faster, and Sonnet is correct more
  often.
- Talk while a background agent works: the brain on Haiku gave the same
  question to a background agent, said "I'll check and tell you", and
  ended its turn at 3.6 s. One second later it answered "How many agents
  are running?" in 2.0 s. The background agent finished after 33 s.
  Claude Code then started a turn by itself, with no message, and the
  brain gave the answer 1.2 s later.
- `--brief` (the SendUserMessage tool) gives no tool in `-p` mode, also
  with `--tools SendUserMessage`. The brain does not need it: the text
  before a tool call ("Checking the agents.") is the note that the voice
  speaks while the tool runs.
- Each `result` gave a `total_cost_usd` of $0.02 to $0.16. That is the
  price on the API. The `claude` CLI runs on the Claude subscription, so
  the brain costs no money, but it uses the limits of the plan.

## How Happy does it

From the source of `slopus/happy` at commit `3d809c7` (2026-10-05),
mostly `packages/happy-app/sources/realtime/`.

- Happy uses ElevenLabs Agents: speech to text, an LLM and text to
  speech, all at ElevenLabs. The LLM is set in the dashboard of
  ElevenLabs, not in the code. The prompt says that the voice is "a mere
  voice interface" to the coding agents.
- The voice has two tools of its own: `sendMessageToSession(sessionId,
  message)`, which returns "sent", and `processPermissionRequest
  (requestId, decision)`. It also has `skip_turn` of ElevenLabs, for talk
  to another person in the room.
- The LLM writes the message, so the words of the user can change on the
  way.
- The answers come back on two channels. Each new message of Claude Code
  goes as a silent `contextual_update` ("Claude Code: <text>", and only
  the name of each tool). The end of a turn and each permission request
  go as a `user_message`, so the voice speaks: "Claude Code done working
  ... Report this to the human immediately."
- The user can talk during a turn. A new message waits in a queue in the
  CLI, and the queued messages join into the next turn. There is no
  interrupt, and the voice cannot know if Claude works.
- One call covers all the sessions. The tools take the ID of a session.
- So Happy uses the relay design (A below), with a Claude Code session
  for each task and no brain. The open conversation of Yonder is the same
  design.

## Other products and patterns

The facts are from the docs of each product. "Vendor"
marks a number that only the vendor gives.

- OpenAI chat-supervisor (`openai/openai-realtime-agents`): the realtime
  model does the small talk, and a text model does the tool calls and
  the hard answers. The realtime model has one tool,
  `getNextResponseFromSupervisor`, and it must say a filler such as "Let
  me check" before it calls it. The README gives about 2 s from the end
  of the filler to the answer.
- OpenAI GPT-Live (`gpt-live-1`, out on 2026-09-10) makes this pattern a
  product. "Live speech and delegated work continue independently." A
  backend model or agent speaks with `session.commentary.append` (Live
  says it in its own words) or adds silent facts with
  `session.thinking.append`, 500 tokens at most for each append. An
  interruption does not stop the backend work. The page gives no price.
- Gemini Live: a function can be `NON_BLOCKING`. Its result has a
  `scheduling`: `INTERRUPT` (tell the user at once), `WHEN_IDLE` (after
  the current speech, the default) or `SILENT` (keep it for later).
- ElevenLabs Agents: a tool can run in the background
  (`execution_mode: 'async'`), and `pre_tool_speech` sets what the user
  hears during a tool call. A `contextual_update` does not interrupt the
  talk. A custom LLM must use the form of the API of OpenAI.
- xAI Grok: the docs give no tool that does not block. Each function
  result must come before `response.create`. But `force_message` "makes
  the agent speak a hard-coded, TTS-synthesized line without involving
  the model". So the words of the brain can play word for word, in the
  voice of Grok.
- OpenAI Realtime: the session goes on while a function call waits, but
  the model "sometimes hallucinates the content of a nonexistent function
  response".
- Pipecat and LiveKit Agents are open source pipelines of speech to text,
  an LLM and text to speech. In both, a tool can run while the talk goes
  on. Daily, the company of Pipecat, gives 1.5 s from the end of speech
  to the first audio as the target. Its example: 300 ms for speech to
  text and the end of the turn, 650 ms for the first token, 120 ms for
  the first audio, and 223 ms for the rest.
- Paseo: "hidden agent session using your configured provider (`claude`,
  `codex`, or `opencode`)" is the LLM of the voice. It controls the
  coding agents through an MCP bridge. Speech to text runs on the
  computer or at OpenAI, and Kokoro or OpenAI speaks. So Paseo uses
  design B below, and it is the nearest product to the brain.
- VoiceMode MCP: Claude Code itself speaks, through its `converse` tool,
  with Whisper or OpenAI for speech to text and Kokoro or OpenAI for
  speech.
- Heard: a fast LLM (Haiku 4.5) turns the hook events of the agents into
  speech, with Parakeet, and Kokoro or ElevenLabs.
- Omnara: a separate voice agent in the cloud, on LiveKit Agents.
- Claude Code itself: `/voice` is dictation only, and Claude does not
  speak. Channels (a research preview) let an MCP server push events
  into a session, but `-p` ignores a custom channel during the preview.
  Each session also has an inbox for messages from other sessions, and
  such a message reaches a working session between two tool calls. The
  format of the inbox for a script is not documented.
- Speech to text, from the end of the speech to the last text (the
  benchmark of Pipecat, median): Deepgram Nova-3 247 ms, AssemblyAI
  256 ms, OpenAI `gpt-4o-transcribe` 637 ms. Apple `SpeechAnalyzer`:
  125 to 132 ms on an M5 Max, in the test of one developer. Deepgram
  Flux finds the end of a turn in about 260 ms (vendor).
- The first token (Artificial Analysis): Haiku 4.5 0.69 s. Sonnet 5.5
  1.03 s on low effort, 7.22 s on medium, and 11.50 s on high. The
  default effort of Sonnet 5.5 on the API is high, so the brain must set
  low effort.

## Three designs

### A. Relay: the voice talks, the brain decides

- The voice keeps the microphone, the turns, the speaker and the
  interruptions. It gets one tool, `ask_claude`, and the tools that the
  app answers itself (`show_tab`, `set_theme`, `end_call` and the
  others). The brain runs in the bridge, with the tools of the bridge.
- The first words of a real answer come after about 3.5 to 6 s: 1.2 s of
  silence, about 1.0 s for the tool call of Grok, 0.5 to 3 s for the
  brain, and about 0.7 s for Grok to speak the result. Today they come
  after about 2.2 s. Grok can say "One moment." before the tool call, as
  it says "Agent started." today.
- With `force_message`, Grok speaks the answer of the brain word for
  word, with no second answer of the model. That saves most of the 0.7 s
  and keeps the words of the brain.
- GPT-Live of OpenAI is this design as a product: Live talks, decides
  when to ask the backend, and says the answer of the backend in its own
  words.
- For: a small change. It keeps the voices, the interruptions, the phone
  and the car.
- Against: it is slower, and it has two minds. The voice can still decide
  wrong, or answer by itself. Grok still costs money for each minute.

### B. Claude speaks: the own pipeline of Yonder

- Speech to text, then the brain, then text to speech. No voice model
  decides.
- Speech to text: the speech model of Apple through `yonder-dictate`,
  which the dictation uses already. It is free, it runs on the Mac, it
  gives the words while the user talks, and it gave the last text of an
  8-second clip in 0.25 s ("Dictation" in the wiki). The phone already
  sends the sound of a dictation to the Mac (`/dictate`, through the
  relay). A service in the cloud is the other choice.
- The end of a turn: 1.2 s of silence, as today, or a model that finds
  the end of a turn.
- The brain can start before the end of the turn is sure. After a short
  pause, the text goes to the brain. When the user goes on, the app
  interrupts the brain and sends the whole text again.
- Text to speech: ElevenLabs with the key of the Mac (the voice Lucy),
  OpenAI, or `say`.
- Grok can be only the ears and the mouth: the words of the user as
  text, and `force_message` for the words of the brain. Then B keeps the
  voice Liora and the audio of the app. Grok answers each turn with
  "Mm.", and the app does not play it: with a cancel in place of the
  "Mm.", the transcript of each turn repeats the earlier words. The words
  of the user came 0.3 to 0.9 s after `speech_stopped`, and a forced line
  started to play 0.5 to 0.85 s after its `force_message`, slower than
  ElevenLabs. Grok still costs money for each minute in this form.
- An interruption: when the user speaks during the speech, the speech
  stops at once. A correction ("stop", "no, wait") interrupts the brain,
  and other words wait in the queue.
- The first words come after about 2 to 2.7 s, as today: 1.2 s of
  silence, 0.25 s for the last text, 0.4 to 1.2 s for the brain, and
  0.2 to 0.25 s for the first audio of the text to speech. The note
  before a tool call plays while the tool runs. A shorter pause, with the
  early start above, makes it faster than today.
- The first audio of a sentence of 13 words, from a Mac, with a connection that was open already: ElevenLabs
  `eleven_v4_turbo` (the model of the ElevenLabs call, the voice Lucy)
  0.19 to 0.25 s, `eleven_flash_v2_5` 0.16 to 0.25 s, and OpenAI
  `gpt-4o-mini-tts` 0.5 to 2.0 s. The first request of ElevenLabs took
  0.77 s, so keep its connection open.
- For: one mind and the smartest answers. The words of the user reach
  the brain with no change. No voice model costs money for each minute.
- Against: Yonder must do the end of a turn, the echo, the interruptions,
  and the audio of the phone through the relay.

### C. An ElevenLabs agent with the brain as its LLM

- ElevenLabs keeps speech to text, the turns, text to speech and the
  interruptions. Its "custom LLM" setting calls an endpoint on the bridge
  in the form of the chat completions of OpenAI. The bridge gives the
  text to the brain and streams the answer back.
- Against: the bridge must be on the internet, through a tunnel, and a
  tunnel opens only after a confirm. ElevenLabs sends the whole
  conversation with each request, so the bridge must keep the one brain
  session in step with it.

## Talking while the brain works

- The brain only decides and dispatches. The agents do the long work,
  and a tool never waits for an agent. So a turn of the brain is short
  (0.5 to 4 s), and the brain is free most of the time.
- Words during a turn wait in the queue of Claude Code and run next. A
  correction interrupts the turn first.
- A slow question goes to a background agent. The brain says "I'll check
  and tell you." and ends its turn. Claude Code starts a turn by itself
  when the background agent finishes.
- A Yonder agent does not wake the brain. The bridge must write the news
  to the brain, for example `[Yonder] Agent 4 "Fix the login" in yonder
  is now done.` The brain then decides what to say. This takes the place
  of `offerNews`, `offerClose` and the `tell` of the open conversation,
  and of most of the guards in `runTool`. `brain-check.ts` does this with
  a poll of `list_workers`.

## Open points

- Silence: each message starts a turn, also a `[Yonder]` news message.
  In a test, the brain spoke the news "Agent 1 finished..." that the user
  did not ask about. The brain needs a way to say nothing, for example
  one fixed word that the voice drops. The app drops the second answer
  of ElevenLabs in the same way today.
- Speech rules: in a test, the brain read a raw time of `list_workers`
  aloud ("1791308780"). The brain needs a few rules for speech, or the
  tools must give times such as "5 minutes ago".
- The tools of the app (`show_tab`, `show_agent`, `set_theme`,
  `get_screen`, `read_paste`, `get_location`,
  `end_call`) run in the app, not in the bridge. The bridge already
  gives `show_on_device` to the app through a queue that the app reads
  (`/show`). The tools of the app can go the same way.
- The app adds `context` (the last words of the call), `images` and
  `call` to `start_worker` and `message_worker`. A brain in the bridge
  must add them too.
- Haiku 4.5 retires "not sooner than October 15, 2026", and no newer
  Haiku is listed. The summaries (`ask()` in `bridge/main.ts`) use it
  too.
- The docs of Claude Code say that `--bare` "will become the default for
  `-p` in a future release", and bare mode does not use the login of the
  subscription. Then the brain and `ask()` need a flag that keeps the
  login.

## Recommendation

1. Build B. It is the only design that is smarter and not slower. A is a
   cheap test of "the brain decides", but each real answer comes 2 to 4 s
   later than today, and speed is a goal.
2. Use Sonnet 5.5 on low effort for the brain: correct answers, 1.2 s to
   the first words, and about 2.7 s with a tool call. Set the effort,
   because the default is high. Haiku 4.5 is about twice as fast, but it
   gave the wrong answer in the code check, it put code in the speech,
   and it can retire after 2026-10-15.
3. Start a new brain session for each call, as each call of Grok is
   new. A long session uses more of the plan. The tools
   give the state of the agents, so the brain needs no memory between
   calls.
4. Keep Grok as the default. Add the brain as one more model in the Voice
   settings, next to the other three. The car keeps Grok.
5. Do the work in this order. First, put the brain in the bridge, with
   `POST /brain`, an interrupt, and the news of the agents. A, B and C
   all need it. Then test Grok as only the ears and the mouth. If that
   works, build B on it. If not, build B on the Mac with `yonder-dictate`
   and ElevenLabs, and then on the phone. The first two steps are done,
   and B runs on Grok (see Status).

## Try it

`bun bridge/brain-check.ts` starts a brain on Sonnet 5.5 with the tools of
the running bridge, and with Read, Grep, Glob and background agents.

- Type a request. Each text of the brain prints with its time from the
  request.
- Type while the brain works: the words wait in the queue. Type "stop" to
  interrupt the brain.
- `--say` speaks each text with `say`. `--model haiku` uses Haiku.
- Requests in quotes after the command run one after the other, and then
  the script ends: `bun bridge/brain-check.ts "How many agents run?"`.
- The brain can start, message and close real agents.

## Sources

- Happy: github.com/slopus/happy at `3d809c7`:
  `packages/happy-app/sources/realtime/voiceSystemPrompt.ts`,
  `realtimeClientTools.ts`, `RealtimeVoiceSession.tsx`,
  `hooks/voiceHooks.ts`, `hooks/contextFormatters.ts`, and
  `packages/happy-cli/src/claude/claudeRemote.ts`.
- Claude Code: code.claude.com/docs/en/headless (stream-json, `--bare`),
  /channels, /channels-reference, /cross-session-messaging,
  /voice-dictation, /agent-view.
- Models: platform.claude.com/docs/en/about-claude/models/overview.
- OpenAI: developers.openai.com/api/docs/guides/live-delegation.md,
  /guides/realtime-conversations.md, developers.openai.com/blog/realtime-api.md,
  github.com/openai/openai-realtime-agents (README and
  `src/app/agentConfigs/chatSupervisor/index.ts`).
- xAI: docs.x.ai/docs/guides/voice/agent (`force_message`, turns, tools).
- Gemini: ai.google.dev/gemini-api/docs/live-tools.
- ElevenLabs: elevenlabs.io/docs/api-reference/tools/create.md,
  /eleven-agents/customization/llm/custom-llm.md.
- Pipecat: docs.pipecat.ai/pipecat/learn/function-calling.md,
  github.com/pipecat-ai/stt-benchmark, voiceaiandvoiceagents.com.
- LiveKit: docs.livekit.io/agents/logic/tools/async/.
- Deepgram Flux: developers.deepgram.com/docs/flux/quickstart.
- Apple SpeechAnalyzer: dev.to/iravoice/apple-speechanalyzer-vs-whispercpp-a-40-speaker-mac-benchmark-40i4.
- Artificial Analysis: artificialanalysis.ai/models/claude-sonnet-5-5-low,
  /models/claude-4-5-haiku.
- Paseo: paseo.sh/docs/voice. VoiceMode: github.com/mbailey/voicemode.
  Heard: github.com/heardlabs/heard. Omnara: news.ycombinator.com/item?id=46994914.
