# Open questions

- Nobody has tested "Hey Yonder" in the app with a real voice yet. If
  the speech recognition of Apple misses the name or hears it by
  mistake, a wake word engine such as Porcupine can replace the helper.
- A Grok session was said to last 30 minutes at most. The calls do not
  show it: calls of 36 and 46 minutes ran with no break at 30 minutes.
  A call that loses the network (code 1006) after 20 seconds starts
  again by itself, once a minute at most (`redialed` in `src/App.tsx`),
  because 7 of 252 calls ended that way. A second drop within the
  minute shows the error.
- The bridge once stopped in a busy loop at 100% CPU, soon after a new
  agent started in `yonder`. The last log line was the "The task names
  no project" line of `projectOf`. A `sample` of the process showed JIT
  code that read the clock again and again, so the loop can call
  `Date.now()` or `setTimeout`. The loop is not found. The watchdog
  kills such a bridge with SIGKILL.
- Live View, a WebRTC video of the browser of the agent, is still only a
  design in `docs/tunnel.md`.
- CarPlay is built (see "CarPlay" under Phone), but not tested on a car
  screen. It waits for the CarPlay entitlement of Apple, which the
  developer of the app must request, and for a test in the CarPlay of
  the simulator or in a car.
- Agents in other CLIs are built (see "Agents in other CLIs" under
  Workers). A real OpenCode agent on a free model started, answered,
  and answered a second message in the same session, through a test
  bridge. No real turn has run yet in Antigravity, Cursor, Grok Build or
  Copilot. A real Codex turn (0.161.0) started, but failed with a 401,
  because the ChatGPT sign-in of Codex did not refresh. Codex needs a
  new `codex login`. Codex runs on the ACP host, and a real Codex turn
  through `codex-acp` waits for that sign-in too. Phase 3 of
  `docs/clis.md` (ACP, and approvals on the phone) is still a plan.
- Open source: Yonder goes public under the MIT license, for
  transparency. The plan keeps one repository, moves the private
  documents and the video out, removes the personal details, and starts
  a public repository with a clean history. The backend of yonder.so
  stays private.
- Tesla is still only research. Tesla has no app store for other
  companies. Since update 2026.26, a web page in the car browser can use
  the microphone, so a web build of the phone app can work there.
- The Apple Watch app is built (see "Apple Watch" under Phone), but
  nobody has run it on a watch yet. The plan is in `docs/watch.md`.
- Yonder for Omarchy is built (see "Omarchy"), but nobody has run it on
  a real Omarchy computer, and the release is not on download.yonder.so
  yet (`bun run release-omarchy`). No plugin of the Omarchy store gives
  a voice call from the phone, away from home, for many Claude Code
  agents. Omarchy-AI and Omodachi are the nearest (see "What exists
  already" in `docs/omarchy.md`).
