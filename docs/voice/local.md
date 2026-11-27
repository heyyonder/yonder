# Local speech

You can keep your voice on your own devices.

## Dictation

Dictation turns speech into the text of a chat message. It works with no
cloud service:

| Device | Speech to text |
|---|---|
| iPhone and Android | The speech recognizer of the phone. The sound stays on the phone. |
| Mac | The speech model of Apple, on the Mac. The notch: tap the right ⌘ key, talk, and tap again to send. |
| Linux | Voxtype. The installer adds it. |
| Windows | Windows + H in the prompt box. |

A video that you attach or record gets its words from `whisper-cli`
(`brew install whisper-cpp`) on your computer.

## Local voice calls

A full call with local speech to text and local text to speech is not
built yet. The plan is a voice module that runs a local model for each
step, such as Whisper or Parakeet to hear and Kokoro to talk, and calls
the tools of the bridge as each voice module does. [Pipecat](pipecat.md)
is the first candidate for it.

Until then, [your own system](custom.md) can do it: any local voice agent
that speaks MCP can drive Yonder.
