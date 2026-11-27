// The ElevenLabs model of the voice calls (the Model row of the settings). ElevenLabs keeps the settings and the
// tools of a voice agent on its side, so the bridge makes one agent "Yonder" and one client tool for each tool of
// the call, and gives the app a signed URL of the conversation socket. The app sends the prompt over the socket and
// runs the tool calls itself, as with Grok. The ids of the agent and the tools stay in ~/.config/yonder/elevenlabs.json.
// The bridge changes the agent only when the tools or the audio rate change, so the voice and the LLM that the user
// picks in the ElevenLabs dashboard stay.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const API = "https://api.elevenlabs.io/v1/convai";
type Schema = { type?: string; description?: string; enum?: unknown[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema };
export type ElevenTool = { name: string; description?: string; parameters: Schema };
type State = { agent?: string; setup?: string; tools: Record<string, { id: string; hash: string }> };

// ElevenLabs takes only a part of JSON Schema. It refuses `pattern`, `$schema` and `additionalProperties`, and each
// value needs a description, so the name of a value is its description when it has none.
function clean({ type, description, enum: values, properties, required, items }: Schema, name = ""): Schema {
  return {
    type,
    description: description || name,
    ...(values && { enum: values }),
    ...(type === "object" && { properties: Object.fromEntries(Object.entries(properties ?? {}).map(([k, v]) => [k, clean(v, k)])), required: required ?? [] }),
    ...(items && { items: clean(items, `one of ${name}`) }),
  };
}

// Lucy: a fresh, casual British voice. A speed of 0.92 makes it calmer.
const LUCY = "lcMyyd2HUfFzxdCaC4Ta";

// The voice of a Claude call (src/brain.ts): one text of the brain in the voice of the ElevenLabs call, as PCM16 at
// 24 kHz. PCM at 44.1 kHz needs the Pro plan (else a 403), and the app plays any rate. In a test, the first audio
// came after about 0.2 s.
export async function speak(key: string, text: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${LUCY}/stream?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_v4_turbo", voice_settings: { speed: 0.92 } }),
  });
  if (!res.ok) return new Response(`ElevenLabs refused the speech (${res.status}): ${(await res.text()).slice(0, 400)}`, { status: 502 });
  return new Response(res.body, { headers: { "content-type": "audio/pcm" } });
}

export async function elevenToken(key: string, file: string, tools: ElevenTool[], rate: number) {
  const api = async (path: string, body?: unknown, method = body ? "POST" : "GET") => {
    const res = await fetch(`${API}/${path}`, { method, headers: { "xi-api-key": key, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`ElevenLabs refused ${method} ${path.split("?")[0]} (${res.status}): ${JSON.stringify(data.detail ?? data).slice(0, 400)}`);
    return data;
  };
  const state: State = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { tools: {} };
  try {
    for (const t of tools) {
      // The agent waits for the result of each tool. 120 s is the longest wait that ElevenLabs allows.
      const tool_config = { type: "client", name: t.name, description: t.description || t.name, parameters: clean(t.parameters), expects_response: true, response_timeout_secs: 120 };
      const hash = JSON.stringify(tool_config);
      const old = state.tools[t.name];
      if (old?.hash === hash) continue;
      const { id } = old ? await api(`tools/${old.id}`, { tool_config }, "PATCH") : await api("tools", { tool_config });
      state.tools[t.name] = { id, hash };
    }
    // The app sends and plays PCM at the rate of its AudioContext: 44.1 or 48 kHz.
    const format = `pcm_${rate}`;
    const tool_ids = tools.map((t) => state.tools[t.name].id);
    const setup = JSON.stringify({ tool_ids, format });
    if (!state.agent) {
      const { agent_id } = await api("agents/create", {
        name: "Yonder",
        conversation_config: {
          agent: {
            // No greeting: the agent waits for the user, as Grok does. The app sends the prompt of each call.
            first_message: "",
            language: "en",
            prompt: { prompt: "You are Yonder.", llm: "gemini-3.8-flash", reasoning_effort: "low", ignore_default_personality: true, tool_ids },
          },
          asr: { user_input_audio_format: format },
          tts: { model_id: "eleven_v4_turbo", voice_id: LUCY, speed: 0.92, agent_output_audio_format: format },
          // "patient" lets the user stop to think in the middle of a request (SILENCE_MS in src/voice.ts). With a
          // turn_timeout of -1, the agent never asks "are you there?" in a silence.
          turn: { turn_eagerness: "patient", turn_timeout: -1 },
          conversation: { max_duration_seconds: 7200 },
        },
        platform_settings: { overrides: { conversation_config_override: { agent: { prompt: { prompt: true } } } } },
      });
      state.agent = agent_id;
    } else if (state.setup !== setup) {
      await api(`agents/${state.agent}`, { conversation_config: { agent: { prompt: { tool_ids } }, asr: { user_input_audio_format: format }, tts: { agent_output_audio_format: format } } }, "PATCH");
    }
    state.setup = setup;
  } finally {
    writeFileSync(file, JSON.stringify(state, null, 2));
  }
  const { signed_url } = await api(`conversation/get-signed-url?agent_id=${state.agent}`);
  return { value: signed_url as string };
}
