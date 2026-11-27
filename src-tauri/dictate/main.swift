// yonder-dictate: makes text of the sound of the microphone button in the prompt box (src/dictate.ts).
// It reads PCM16 sound at 16 kHz, mono, from stdin. While the words come, it prints JSON lines with all the
// text so far: {"text": "..."}. At the end of stdin it prints the last line and exits.
// The bridge runs it (bridge/dictate.ts). It uses the speech model of Apple on the Mac (macOS 26 and later),
// so no sound leaves the Mac. An 8-second clip takes about 0.25 s; whisper.cpp small.en takes 1.0 s.
// SpeechAnalyzer is right more often, but it gives the words in bursts about 1 s apart. The older SFSpeechRecognizer
// gives a word about each 0.25 s. So the text is the words of SpeechAnalyzer, and after them the newer words of
// SFSpeechRecognizer, which SpeechAnalyzer corrects when it catches up.
import AVFoundation
import Speech

setvbuf(stdout, nil, _IOLBF, 0)

func fail(_ line: String) -> Never {
    FileHandle.standardError.write(("yonder-dictate: " + line + "\n").data(using: .utf8)!)
    exit(1)
}

func say(_ text: String) {
    let line = try! JSONSerialization.data(withJSONObject: ["text": text.trimmingCharacters(in: .whitespaces)])
    print(String(decoding: line, as: UTF8.self))
}

let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale.current) ?? Locale(identifier: "en-US")
// Volatile results are the words that can still change, so the text shows while the user talks. There is no
// fastResults: Apple says it gives less accurate words, such as "right" for "write".
// The fast words of SFSpeechRecognizer show while the user talks, and the last text came as soon without it.
let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
do {
    // The first time on a Mac, the system downloads the model for the language.
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) { try await request.downloadAndInstall() }
} catch {
    fail("the speech model did not install: \(error)")
}
let input = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]),
      let converter = AVAudioConverter(from: input, to: format) else { fail("no audio format for the speech model") }
let analyzer = SpeechAnalyzer(modules: [transcriber])

// The fast words. A recognition task ends after a pause or an error, so a new one starts and its words go after the
// old ones. A task of macOS 26 also goes on after a pause, but its words start again, as on the iPhone (Dictate.swift
// in ios/gen/apple). So the words of each utterance go after the old ones at its metadata. Else the fast words stop
// after the first pause, and only the slower words of SpeechAnalyzer show. macOS asks for the
// permission of Yonder, because Yonder starts the bridge. Without it the text is SpeechAnalyzer only.
let lock = NSLock()
var fastDone = ""
var fastNow = ""
var fastKept = -1.0 // The start of the last utterance in fastDone, in seconds of the sound of the request.
var fastRequest: SFSpeechAudioBufferRecognitionRequest?
var ended = false
let recognizer = SFSpeechRecognizer(locale: locale)
func listen() {
    guard let recognizer, recognizer.supportsOnDeviceRecognition else { return }
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = true
    guard lock.withLock({ () -> Bool in
        if !ended { (fastRequest, fastKept) = (request, -1) }
        return !ended
    }) else { return }
    recognizer.recognitionTask(with: request) { result, error in
        // A task that ended still gives its last words after the end of the sound. They must not come after the
        // last text of SpeechAnalyzer, or they go to the agent.
        guard lock.withLock({ fastRequest === request }) else { return }
        let next = lock.withLock { () -> Bool in
            if let result { fastNow = result.bestTranscription.formattedString }
            // The last result of a task repeats the last utterance, with the same start.
            let start = result?.speechRecognitionMetadata?.speechStartTimestamp
            if start == fastKept { fastNow = "" }
            let end = error != nil || result?.isFinal == true
            guard end || start != nil else { return false }
            fastDone += " " + fastNow
            fastNow = ""
            if let start { fastKept = start }
            guard end else { return false }
            fastRequest = nil
            return true
        }
        if result != nil { show() }
        // shortcut: an error that does not go away starts a new task each 0.2 s until the end of the dictation.
        if next { DispatchQueue.global().asyncAfter(deadline: .now() + 0.2, execute: listen) }
    }
}
SFSpeechRecognizer.requestAuthorization { if $0 == .authorized { listen() } }
let (sound, feed) = AsyncStream.makeStream(of: AnalyzerInput.self)

// stdin gives any number of bytes, so an odd byte waits for the next read.
Thread.detachNewThread {
    var rest = Data()
    var heard = false
    while let data = try? FileHandle.standardInput.read(upToCount: 6400), !data.isEmpty {
        rest.append(data)
        let frames = rest.count / 2
        guard frames > 0, let pcm = AVAudioPCMBuffer(pcmFormat: input, frameCapacity: AVAudioFrameCount(frames)) else { continue }
        pcm.frameLength = AVAudioFrameCount(frames)
        _ = rest.withUnsafeBytes { memcpy(pcm.int16ChannelData![0], $0.baseAddress!, frames * 2) }
        rest = Data(rest.dropFirst(frames * 2))
        let capacity = AVAudioFrameCount(Double(frames) * format.sampleRate / 16000) + 16
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { continue }
        var given = false
        converter.convert(to: out, error: nil) { _, status in
            if given {
                status.pointee = .noDataNow
                return nil
            }
            given = true
            status.pointee = .haveData
            return pcm
        }
        feed.yield(AnalyzerInput(buffer: out))
        heard = true
        lock.withLock { fastRequest?.append(pcm) }
    }
    // SpeechAnalyzer never ends an input with no sound, so the helper stayed with its 17 MB and the caller waited. The
    // notch left one after each dictation that got no sound.
    if !heard {
        say("")
        exit(0)
    }
    lock.withLock {
        ended = true
        fastRequest?.endAudio()
        fastRequest = nil
    }
    feed.finish()
}

// The final results come in parts. The volatile result replaces the one before it.
var done = ""
var volatile = ""
// The fast words go after the last word of SpeechAnalyzer: the same word in the fast words that is nearest to its
// place, 3 words away at most. The two models drop and split words in different places, so a count of the words
// alone lost words. A "the" far back in the fast words repeated half of the text.
// shortcut: with no same word near, the count of the words decides. Align the whole texts if words still go missing.
func key(_ word: Substring) -> String { word.lowercased().filter { $0.isLetter || $0.isNumber } }
// The lock also keeps the lines of two threads apart.
func show() {
    lock.withLock {
        let slow = (done + volatile).split(separator: " ")
        let fast = (fastDone + " " + fastNow).split(separator: " ")
        var from = slow.count
        if let last = slow.last.map(key) {
            let same = fast.indices.filter { key(fast[$0]) == last }
            if let near = same.min(by: { abs($0 - slow.count) < abs($1 - slow.count) }), abs(near - slow.count) <= 3 { from = near + 1 }
        }
        say((slow + fast.dropFirst(from)).joined(separator: " "))
    }
}
let printer = Task {
    for try await result in transcriber.results {
        let text = String(result.text.characters)
        lock.withLock {
            if result.isFinal { done += text }
            volatile = result.isFinal ? "" : text
        }
        show()
    }
}
do {
    try await analyzer.start(inputSequence: sound)
    try await analyzer.finalizeAndFinishThroughEndOfInput()
    try await printer.value
} catch {
    fail("\(error)")
}
// The last text is SpeechAnalyzer only, the better model.
say(done)
