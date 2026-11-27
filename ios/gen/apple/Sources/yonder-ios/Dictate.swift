// Dictation on the iPhone: the microphone button of the prompt box and the talk view (src/dictate.ts). The speech
// recognizer of iOS makes the words, on the iPhone itself when iOS has the model for the language, so the sound does not
// go to the computer of the agent. So dictation does not need the bridge, and it also works with a Windows bridge,
// which has no dictation. The `dictation` command of ios/src/lib.rs calls `yonder_dictation`:
// - start: asks for the permissions, starts the microphone and the recognizer, and gives "" or an error.
// - poll: gives {"words", "db", "level", "done", "error", "notes"} as JSON. `db` is the loudest 20 ms of the sound
//   since the last poll, and src/dictate.ts makes the bar of the orb from it. `level` is the old bar (0 at -50 dB, 1 at
//   -30 dB), for a page from before `db`. `notes` are the events of the audio since the last poll, for call.log.
// - stop: ends the sound. `done` comes with the last words.
// - cancel: stops at once.
// Rust calls it off the main thread, so a start can wait for the permissions.
// From iOS 26 SpeechAnalyzer makes the words. It works only on the iPhone, so iOS asks only for the microphone, not for
// speech recognition. The prompt of SFSpeechRecognizer says that the speech goes to Apple, also when it stays on the
// iPhone. Before iOS 26, or with no model for the language, SFSpeechRecognizer makes the words.
// The page plays no sound during the dictation: the start chime plays in the engine here. A chime of the page stops
// the sound of the microphone after it.
import AVFoundation
import Speech

private let lock = NSLock()
private var engine: AVAudioEngine?
private var observers: [NSObjectProtocol] = []
private var recognizer: SFSpeechRecognizer?
// The request that gets the sound now. The tap of the microphone gives each buffer to it.
private var request: SFSpeechAudioBufferRecognitionRequest?
// The words of the tasks and the utterances that ended, and of the utterance that runs.
private var said = ""
private var now = ""
// The start of the last utterance in `said`, in seconds of the sound of the request.
private var kept = -1.0
private var level = 0.0
// The loudest 20 ms since the last poll, and the value of the last poll. iOS gives the tap about 100 ms of sound at a
// time, and the poll comes each 50 ms. A level of the whole buffer of the tap moves the orb only 1 to 3 s after the
// start, and barely in a conversation.
private var peak: Double?
private var lastDb = -100.0
private var buffers = 0
private var stopping = false
private var done = true
private var failure = ""
private var notes: [String] = []
// SpeechAnalyzer: the tap gives each buffer to `feed`, and `finishAnalysis` ends it (true: at once). `dictations` counts the
// dictations, so the words of an old analyzer do not go into a new dictation.
private var feed: ((AVAudioPCMBuffer) -> Void)?
private var finishAnalysis: ((Bool) -> Void)?
private var dictations = 0

@_cdecl("yonder_dictation")
public func yonderDictation(_ op: UnsafePointer<CChar>, _ out: UnsafeMutablePointer<CChar>, _ size: Int) {
    switch String(cString: op) {
    case "start": give(start(), out, size)
    case "poll": give(poll(), out, size)
    case "stop":
        end(cancel: false)
        give("", out, size)
    default:
        end(cancel: true)
        give("", out, size)
    }
}

private func note(_ text: String) { lock.withLock { notes.append(text) } }

private func start() -> String {
    end(cancel: true)
    let mine = lock.withLock { () -> Int in
        dictations += 1
        notes = []
        return dictations
    }
    var mic = AVAudioApplication.shared.recordPermission
    if mic == .undetermined {
        let asked = DispatchSemaphore(value: 0)
        AVAudioApplication.requestRecordPermission { mic = $0 ? .granted : .denied; asked.signal() }
        asked.wait()
    }
    guard mic == .granted else { return "Yonder may not use the microphone. Allow it in Settings." }
    var made: SFSpeechRecognizer?
    var why: String? = "iOS is older than 26"
    if #available(iOS 26, *) {
        let ready = DispatchSemaphore(value: 0)
        Task { why = await analyze(mine); ready.signal() }
        ready.wait()
    }
    if let why {
        note("SpeechAnalyzer: \(why); SFSpeechRecognizer instead")
        var speech = SFSpeechRecognizer.authorizationStatus()
        if speech == .notDetermined {
            let asked = DispatchSemaphore(value: 0)
            SFSpeechRecognizer.requestAuthorization { speech = $0; asked.signal() }
            asked.wait()
        }
        guard speech == .authorized else { return "Yonder may not use speech recognition. Allow it in Settings." }
        guard let old = SFSpeechRecognizer(), old.isAvailable else { return "the speech recognizer of the iPhone is not available now." }
        made = old
    }
    let session = AVAudioSession.sharedInstance()
    var busy: Error?
    do {
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setActive(true)
    } catch {
        busy = error
        note("session: \(error.localizedDescription)")
    }
    // The microphone can read 0 Hz for a moment while the route changes, as when AirPods change to their microphone. A
    // new engine after 0.1 s reads the new format. Else the start fails at once with "no microphone now".
    var sound = AVAudioEngine()
    for attempt in 1... {
        if tap(sound) { break }
        guard attempt < 10 else {
            // Without this, a failed start kept the audio session, and the music of another app stayed paused.
            end(cancel: true)
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            return busy.map { "the microphone is busy: \($0.localizedDescription)" } ?? "the iPhone has no microphone now."
        }
        Thread.sleep(forTimeInterval: 0.1)
        sound = AVAudioEngine()
    }
    let player = AVAudioPlayerNode()
    sound.attach(player)
    sound.connect(player, to: sound.mainMixerNode, format: chimeFormat)
    let first = lock.withLock { () -> SFSpeechAudioBufferRecognitionRequest? in
        (recognizer, engine, said, now, level, peak, lastDb, buffers, stopping, done, failure) = (made, sound, "", "", 0, nil, -100, 0, false, false, "")
        return made == nil ? nil : fresh()
    }
    if let made, let first { listen(made, first) }
    sound.prepare()
    do {
        try sound.start()
    } catch {
        end(cancel: true)
        return "the microphone did not start: \(error.localizedDescription)"
    }
    player.scheduleBuffer(chime)
    player.play()
    note("\(made.map { "SFSpeechRecognizer, on device \($0.supportsOnDeviceRecognition)" } ?? "SpeechAnalyzer"), \(session.currentRoute.inputs.first?.portName ?? "no input") at \(Int(session.sampleRate)) Hz")
    // AirPods that connect, or a sound of another app or of WebKit, can stop the engine. It starts again.
    let center = NotificationCenter.default
    observers = [
        center.addObserver(forName: .AVAudioEngineConfigurationChange, object: sound, queue: nil) { _ in again(sound, "the audio changed") },
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { info in
            let began = (info.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue
            if began { note("interrupted") } else { again(sound, "the interruption ended") }
        },
    ]
    return ""
}

// Starts the engine again after a change of the audio, with the new format of the microphone.
private func again(_ sound: AVAudioEngine, _ why: String) {
    guard lock.withLock({ engine === sound && !stopping }) else { return }
    try? AVAudioSession.sharedInstance().setActive(true)
    sound.inputNode.removeTap(onBus: 0)
    if tap(sound), (try? sound.start()) != nil { return note("\(why); the microphone started again") }
    lock.withLock { failure = "the microphone stopped (\(why))." }
    end(cancel: true)
}

// The tap gives each buffer of the microphone to the request of now, and the loudness to the level.
private func tap(_ sound: AVAudioEngine) -> Bool {
    let input = sound.inputNode
    let format = input.outputFormat(forBus: 0)
    // With no input, the format has 0 Hz, and installTap crashes.
    guard format.sampleRate > 0 else { return false }
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        // The loudness of each 20 ms, as the frames of src/dictate.ts on the Mac, and the loudest of them.
        let count = Int(buffer.frameLength)
        let window = max(1, Int(format.sampleRate / 50))
        var db = -100.0
        if let data = buffer.floatChannelData?[0] {
            for from in stride(from: 0, to: count, by: window) {
                let to = min(count, from + window)
                var sum: Float = 0
                for i in from..<to { sum += data[i] * data[i] }
                db = max(db, 20 * log10(max(Double((sum / Float(to - from)).squareRoot()), 1e-9)))
            }
        }
        lock.withLock {
            request?.append(buffer)
            feed?(buffer)
            peak = max(peak ?? -100, db)
            level = min(1, max(0, (db + 50) / 20))
            buffers += 1
            if buffers == 1 { notes.append("first buffer of \(count) frames, \(Int(db)) dB") }
        }
    }
    return true
}

// The start chime of `chime` in src/voice.ts: 660 Hz, then 880 Hz after 90 ms, at 0.2, and a fade from 180 to 400 ms.
private let chimeFormat = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
private let chime: AVAudioPCMBuffer = {
    let rate = chimeFormat.sampleRate
    let frames = AVAudioFrameCount(rate * 0.4)
    let buffer = AVAudioPCMBuffer(pcmFormat: chimeFormat, frameCapacity: frames)!
    buffer.frameLength = frames
    var phase = 0.0
    for i in 0..<Int(frames) {
        let t = Double(i) / rate
        phase += 2 * .pi * (t < 0.09 ? 660 : 880) / rate
        let gain = t < 0.18 ? 0.2 : 0.2 * pow(0.0001 / 0.2, (t - 0.18) / 0.22)
        buffer.floatChannelData![0][i] = Float(sin(phase) * gain)
    }
    return buffer
}()

// Starts SpeechAnalyzer for the dictation `mine`, and sets `feed` and `finishAnalysis`. Gives nil, or why it cannot.
// The first time for a language, iOS downloads the model, and the start waits for it.
// The options are those of src-tauri/dictate/main.swift: volatile results show the words while the user talks.
@available(iOS 26, *)
private func analyze(_ mine: Int) async -> String? {
    guard SpeechTranscriber.isAvailable else { return "not on this iPhone" }
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale.current) else { return "no model for \(Locale.current.identifier)" }
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
    do {
        if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) { try await install.downloadAndInstall() }
    } catch {
        return "the model did not install: \(error.localizedDescription)"
    }
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else { return "no audio format" }
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let (sound, input) = AsyncStream.makeStream(of: AnalyzerInput.self)
    do {
        try await analyzer.start(inputSequence: sound)
    } catch {
        return "it did not start: \(error.localizedDescription)"
    }
    Task {
        do {
            for try await result in transcriber.results {
                let text = String(result.text.characters).trimmingCharacters(in: .whitespaces)
                lock.withLock {
                    guard dictations == mine else { return }
                    if result.isFinal { said = [said, text].filter { !$0.isEmpty }.joined(separator: " ") }
                    now = result.isFinal ? "" : text
                }
            }
        } catch {
            note("analyzer: \(error.localizedDescription)")
        }
        // An end before the stop is a failure, so the page cancels, and the microphone stops.
        lock.withLock {
            guard dictations == mine else { return }
            if !stopping && failure.isEmpty { failure = "the speech analyzer stopped." }
            done = true
        }
    }
    // The format of the microphone changes with the route, as with AirPods, so the converter follows the buffers.
    var converter: AVAudioConverter?
    let push = { (buffer: AVAudioPCMBuffer) in
        if converter?.inputFormat != buffer.format { converter = AVAudioConverter(from: buffer.format, to: format) }
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * format.sampleRate / buffer.format.sampleRate) + 16
        guard let converter, let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return }
        var given = false
        converter.convert(to: out, error: nil) { _, status in
            if given {
                status.pointee = .noDataNow
                return nil
            }
            given = true
            status.pointee = .haveData
            return buffer
        }
        input.yield(AnalyzerInput(buffer: out))
    }
    lock.withLock {
        feed = push
        finishAnalysis = { cancel in
            input.finish()
            Task { if cancel { await analyzer.cancelAndFinishNow() } else { try? await analyzer.finalizeAndFinishThroughEndOfInput() } }
        }
    }
    return nil
}

// Under the lock: a new request, which gets the sound from now on.
private func fresh() -> SFSpeechAudioBufferRecognitionRequest {
    let next = SFSpeechAudioBufferRecognitionRequest()
    next.shouldReportPartialResults = true
    next.addsPunctuation = true
    next.requiresOnDeviceRecognition = recognizer?.supportsOnDeviceRecognition == true
    request = next
    kept = -1
    return next
}

// A task ends after a pause or an error, so a new one starts, and its words go after the old ones, as in
// src-tauri/dictate/main.swift. The new request gets the sound at once, so no word is lost between the tasks.
// From iOS 18 a task also goes on after a pause, but its words start again. The result at the end of each utterance
// has metadata, and the next results have only the new words. So the words of the utterance go to `said` then. The
// last result of the task repeats the last utterance with the same start, and does not go to `said` again. Else a long
// dictation with pauses drops back to one line, and the agent gets only the last utterance.
// shortcut: an error that does not go away starts a new task each 0.2 s until the end of the dictation.
private func listen(_ recognizer: SFSpeechRecognizer, _ mine: SFSpeechAudioBufferRecognitionRequest) {
    recognizer.recognitionTask(with: mine) { result, error in
        let next = lock.withLock { () -> SFSpeechAudioBufferRecognitionRequest? in
            // A cancelled task still gives its last words.
            guard request === mine else { return nil }
            if let result { now = result.bestTranscription.formattedString }
            let start = result?.speechRecognitionMetadata?.speechStartTimestamp
            if start == kept { now = "" }
            let ended = error != nil || result?.isFinal == true
            guard ended || start != nil else { return nil }
            if let error, result == nil { notes.append("task: \(error.localizedDescription)") }
            said = [said, now].filter { !$0.isEmpty }.joined(separator: " ")
            now = ""
            if let start { kept = start }
            guard ended else { return nil }
            if stopping {
                request = nil
                done = true
                return nil
            }
            return fresh()
        }
        guard let next else { return }
        if error == nil { listen(recognizer, next) } else { DispatchQueue.global().asyncAfter(deadline: .now() + 0.2) { listen(recognizer, next) } }
    }
}

private func poll() -> String {
    let state: [String: Any] = lock.withLock {
        defer { notes = [] }
        // A poll with no new buffer gives the loudness of the last poll, so that the orb does not drop between buffers.
        lastDb = peak ?? lastDb
        peak = nil
        return ["words": [said, now].filter { !$0.isEmpty }.joined(separator: " "), "db": stopping ? -100 : lastDb, "level": stopping ? 0 : level, "done": done, "error": failure, "notes": notes]
    }
    return (try? JSONSerialization.data(withJSONObject: state)).map { String(decoding: $0, as: UTF8.self) } ?? "{}"
}

// Stops the microphone. A stop gives the request the end of the sound, and its task gives the last words. A cancel
// drops the task. The audio session then lets go, so that the side buttons change the volume of the ringer again, and
// the music of another app plays again.
private func end(cancel: Bool) {
    let (sound, last, analysis, quiet) = lock.withLock { () -> (AVAudioEngine?, SFSpeechAudioBufferRecognitionRequest?, ((Bool) -> Void)?, Bool) in
        defer {
            engine = nil
            stopping = true
            level = 0
            // With SpeechAnalyzer, the end of its results sets `done` after a stop.
            if cancel || (request == nil && finishAnalysis == nil) { request = nil; done = true }
            feed = nil
            // After a stop, the cancel of the page at its time limit still cancels the analyzer.
            if cancel { finishAnalysis = nil }
        }
        return (engine, request, finishAnalysis, buffers == 0)
    }
    observers.forEach(NotificationCenter.default.removeObserver)
    observers = []
    last?.endAudio()
    // SpeechAnalyzer never ends an input with no sound (src-tauri/dictate/main.swift), so a stop with no sound cancels.
    analysis?(cancel || quiet)
    guard let sound else { return }
    sound.stop()
    sound.inputNode.removeTap(onBus: 0)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
}
