# Architecture

The diagram is in `CLAUDE.md`.

## Decision: two layers, no orchestrator session

No persistent Claude Code session sits between Grok and the workers:

- The bridge must control the worker processes anyway, for the list of
  workers, the session IDs, and the "worker finished" signal.
- One saved session can do only one turn at a time. Each request and each
  result would need a queue, and each turn adds 10 to 30 seconds.
- Grok can select the project and pass the words of the user to a worker.
  The worker is Claude Code, so it plans the task itself.

If Grok routes work badly, add a Claude orchestrator as one more tool. Do not
add it as a layer.

The state of the agents is in the Grok prompt, so Grok can answer a
question with no tool call. An orchestrator in the answer path adds 10 to 30
seconds to each question, and Grok cannot wait for a tool.

A Claude session that makes the tool calls, with a voice that only talks, is
faster than a full agent. A lean `claude -p` session that stays open says its
first words after 0.4 to 1.6 s, and answers with a tool call after 2.2 to
4.1 s. A full agent says its first text after a median of 15.4 s. So the 10
to 30 seconds above are true only for a full session. `docs/brain.md` has the
research, three designs and a plan. `bun bridge/brain-check.ts` starts such a
session in a terminal. "Claude" in `voice-agent.md` tells how the Claude
model of the Voice settings works.
