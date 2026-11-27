# Voice with other cloud models

The voice code of Yonder also has three more providers. Each one uses your
own key, in `~/.config/yonder/.env` on the computer that runs Yonder.

| Provider | Key | What it is |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | The OpenAI realtime API. |
| ElevenLabs | `ELEVENLABS_API_KEY` | ElevenLabs Agents, with an LLM on top. |
| Claude | `ELEVENLABS_API_KEY` | A pipeline: speech to text, a Claude session as the brain, and ElevenLabs as the text to speech. |

Pick the provider in Settings › Voice › Model. The row shows only the
providers whose key is in `.env`, and the next call uses the one that you
pick. A call needs no Yonder account.

To add a provider, add one entry to `VOICE_PROVIDERS` and its connection
code. Read [CONTRIBUTING.md](../../CONTRIBUTING.md) first.
