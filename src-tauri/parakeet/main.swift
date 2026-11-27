// yonder-parakeet: makes text of the sound of a dictation with Parakeet TDT 0.6B v2 of NVIDIA, in place of the speech
// model of Apple (dictate/main.swift). A super user picks it as "Parakeet" (Settings, Super user, Speech to text). It has
// the same protocol: PCM16 sound at 16 kHz, mono, on stdin; a JSON line with all the text so far, {"text": "..."}, each
// time the text changes; the last line at the end of stdin, then it exits.
// FluidAudio runs the model with Core ML on the Neural Engine, so no sound leaves the Mac. The first dictation on a Mac
// downloads the model (about 450 MB) to ~/Library/Application Support/FluidAudio/Models.
// In a test with 5 minutes of one voice, Parakeet v2 gave 1.2 % wrong words, and the speech model of Apple gave 2.6 %.
// The other local models were between: Parakeet ultra 1.9 %, Qwen3-ASR 1.7B 2.2 %, Whisper large-v3 2.4 %.
import FluidAudio
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)

func fail(_ line: String) -> Never {
    FileHandle.standardError.write(("yonder-parakeet: " + line + "\n").data(using: .utf8)!)
    exit(1)
}

func say(_ text: String) {
    let line = try! JSONSerialization.data(withJSONObject: ["text": text.trimmingCharacters(in: .whitespaces)])
    print(String(decoding: line, as: UTF8.self))
}

// The model, from the first argument (bridge/dictate.ts): v2 (the default) is English only. v3 and ultra also know 24
// more languages of Europe.
let version: AsrModelVersion = switch CommandLine.arguments.dropFirst().first {
case "v3": .v3
case "ultra": .ultra
default: .v2
}

// The sound collects while the model loads.
let lock = NSLock()
var sound: [Float] = []
var ended = false
Thread.detachNewThread {
    // stdin gives any number of bytes, so an odd byte waits for the next read.
    var rest = Data()
    while let data = try? FileHandle.standardInput.read(upToCount: 6400), !data.isEmpty {
        rest.append(data)
        let frames = rest.count / 2
        let samples = rest.withUnsafeBytes { raw in
            (0..<frames).map { Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: $0 * 2, as: Int16.self))) / 32768 }
        }
        rest = Data(rest.dropFirst(frames * 2))
        lock.withLock { sound += samples }
    }
    lock.withLock { ended = true }
}

let asr = AsrManager(config: ASRConfig(tdtConfig: TdtConfig(blankId: version.blankId), encoderHiddenSize: version.encoderHiddenSize))
do {
    try await asr.loadModels(AsrModels.downloadAndLoad(version: version))
} catch {
    fail("the model did not load: \(error)")
}

// Parakeet needs 0.3 s of sound at least, so a shorter sound gets silence after it.
func text(of samples: [Float]) async throws -> String {
    var state = TdtDecoderState.make(decoderLayers: await asr.decoderLayerCount)
    let padded = samples + [Float](repeating: 0, count: max(0, 16000 - samples.count))
    return try await asr.transcribe(padded, decoderState: &state).text
}

// Each 0.5 s of new sound makes the text of all the sound again, so the words show while the user talks.
// shortcut: all the sound each time, about 0.4 s for 60 s of sound on a recent Apple silicon Mac; use SlidingWindowAsrManager if
// dictations get much longer.
let STEP = 8000
var said = ""
var done = 0
while true {
    let (now, end) = lock.withLock { (sound, ended) }
    if end && now.isEmpty {
        say("")
        exit(0)
    }
    if end && now.count == done {
        say(said)
        exit(0)
    }
    if end || now.count - done >= STEP {
        do {
            let next = try await text(of: now)
            done = now.count
            if next != said || end { say(next) }
            said = next
        } catch {
            fail("\(error)")
        }
        if end { exit(0) }
    }
    try? await Task.sleep(nanoseconds: 50_000_000)
}
