// yonder-wake: listens for "Hey Yonder", and then opens the Yonder notch: a black shape that grows out of the notch of
// the MacBook, with the orb of the app and the words of the user. A click on the notch, or "send it" at the end of the
// words, starts a new agent with the words. The X drops them.
// The app (src-tauri/src/main.rs) runs it during a call of the window, and while the wake word is on or a key opens
// the notch. With `--wake` it listens for "Hey Yonder" all the time. Without it, it opens the microphone only while the
// notch is open. The app writes lines to its stdin: "open" for the key of the notch (a tap opens the notch, and a
// second tap sends the words), "call <ms>" and "end" for a call, which shows a small notch with the orb and the time
// of the call, "level" for the loudness of the call, which moves that orb, "note" for the press of the key of the voice
// note (Note.swift), "note-up" for its release after a hold and "note-cut" for another key while it was down, and
// "escape" for the Escape key, which closes an open notch as the X does.
// It uses only the speech recognition on the Mac, so no audio leaves the Mac. macOS asks
// for the permissions of Yonder, because Yonder starts it, so Info.plist of Yonder has the usage text.
// `yonder-wake --demo` shows the open notch with no microphone, for a screenshot of its look.
import AVFoundation
import AppKit
import Speech
import SwiftUI

setvbuf(stdout, nil, _IOLBF, 0)
// A write to yonder-dictate after it stopped must fail, not stop this helper.
signal(SIGPIPE, SIG_IGN)

func log(_ line: String) {
    FileHandle.standardError.write((line + "\n").data(using: .utf8)!)
}

let wakeWord = CommandLine.arguments.contains("--wake")
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
// The audio thread appends to the request that the main thread replaces, and gives the sound to the dictation of the
// notch (sink), so a lock guards both.
let lock = NSLock()
var request: SFSpeechAudioBufferRecognitionRequest?
var sink: Dictation?
var task: SFSpeechRecognitionTask?
var started = Date()
let notch = Notch()

// A recognition task ends after silence or an error, and its transcript grows for as long as it runs.
// So a new task starts after each end, after each notch, and after one minute. None runs while the notch listens.
func listen() {
    guard wakeWord, let recognizer, notch.dictation == nil else { return }
    task?.cancel()
    let next = SFSpeechAudioBufferRecognitionRequest()
    next.requiresOnDeviceRecognition = true
    next.shouldReportPartialResults = true
    // Only the whole phrase wakes it. "Yonder" alone woke it when the user talked to an agent on the phone near the
    // Mac, and the notch showed those words.
    next.contextualStrings = ["Hey Yonder"]
    lock.withLock {
        request?.endAudio()
        request = next
    }
    started = Date()
    task = recognizer.recognitionTask(with: next) { result, error in
        guard lock.withLock({ request === next }) else { return }
        if let text = result?.bestTranscription.formattedString,
            text.range(of: #"\bhey\W*yonder\b"#, options: [.regularExpression, .caseInsensitive]) != nil {
            // The same task can hear it again before the main thread replaces it, so it stops now.
            lock.withLock { request = nil }
            print("wake")
            DispatchQueue.main.async { notch.wake() }
        } else if error != nil || result?.isFinal == true {
            // shortcut: an error that never goes away starts a new task each 0.2 s. Add a backoff if app.log shows it.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: listen)
        }
    }
}

// The microphone, for "Hey Yonder" and for the dictation of the notch: a capture session on one device. The session is
// new at each start, because a headset can come or go between two notches. It is not the input node of an
// AVAudioEngine. That node records from an aggregate of the input and the output of macOS, and the engine puts the
// aggregate back after each change of its device: when AirPods leave the low quality of a phone call, their new format
// rebuilds the aggregate, and the engine takes the microphone of the AirPods again. So AirPods stay in that low quality
// while "Hey Yonder" listens, also with the built-in microphone chosen.
// shortcut: a session whose device goes away stops, and "Hey Yonder" is deaf until the next notch. Watch
// AVCaptureSessionRuntimeError if a chosen USB or Bluetooth microphone comes and goes.
var session: AVCaptureSession?
let micQueue = DispatchQueue(label: "yonder-wake.mic")
let micOutput = MicOutput()

func startMic() throws {
    guard session?.isRunning != true else { return }
    let fail = { (message: String) in NSError(domain: "yonder-wake", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    guard let device = chosenMic() ?? AVCaptureDevice.default(for: .audio) else { throw fail("this Mac has no microphone") }
    let next = AVCaptureSession()
    let input = try AVCaptureDeviceInput(device: device)
    let output = AVCaptureAudioDataOutput()
    // Float32 on one channel, as loudness reads it. The recognizer and the converter of the dictation take any format.
    output.audioSettings = [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsNonInterleaved: false]
    output.setSampleBufferDelegate(micOutput, queue: micQueue)
    guard next.canAddInput(input), next.canAddOutput(output) else { throw fail("\(device.localizedName) cannot record") }
    next.addInput(input)
    next.addOutput(output)
    next.startRunning()
    guard next.isRunning else { throw fail("\(device.localizedName) did not start") }
    session = next
}

func stopMic() {
    session?.stopRunning()
    session = nil
}

// The sound of the capture session, on micQueue: to the recognizer of "Hey Yonder", and to the dictation of the notch
// with the loudness for the orb.
final class MicOutput: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let description = CMSampleBufferGetFormatDescription(sampleBuffer),
            let stream = CMAudioFormatDescriptionGetStreamBasicDescription(description),
            let format = AVAudioFormat(streamDescription: stream),
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(CMSampleBufferGetNumSamples(sampleBuffer)))
        else { return }
        // The length first: the copy fills only the length of the buffer.
        buffer.frameLength = buffer.frameCapacity
        guard CMSampleBufferCopyPCMDataIntoAudioBufferList(sampleBuffer, at: 0, frameCount: Int32(buffer.frameLength), into: buffer.mutableAudioBufferList) == noErr else { return }
        lock.withLock {
            request?.append(buffer)
            guard let sink else { return }
            sink.feed(buffer)
            notch.level = loudness(buffer)
        }
    }
}

// The microphone of the settings (Voice, Microphone), by its name: `--mic <name>`. AirPods with an open microphone
// play all sound in the low quality of a phone call, so the user can choose the microphone of the Mac.
// A chosen microphone that is gone gives the input of macOS. With no choice, "Hey Yonder" listens on the built-in
// microphone, because it listens all the time.
let micName = CommandLine.arguments.firstIndex(of: "--mic").flatMap { CommandLine.arguments.dropFirst($0 + 1).first }

func chosenMic() -> AVCaptureDevice? {
    guard micName != nil || wakeWord else { return nil }
    let mics = AVCaptureDevice.DiscoverySession(deviceTypes: [.microphone, .external], mediaType: .audio, position: .unspecified).devices
    if let micName { return mics.first { $0.localizedName == micName } }
    return mics.first { $0.transportType == Int32(kAudioDeviceTransportTypeBuiltIn) }
}

// The loudness of the voice for the orb, from 0 at -50 dBFS to 1 at -30 dBFS, as the bars of src/dictate.ts.
func loudness(_ buffer: AVAudioPCMBuffer) -> Double {
    guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
    var sum: Float = 0
    for i in 0..<Int(buffer.frameLength) { sum += samples[i] * samples[i] }
    let db = 20 * log10(max(1e-9, Double(sqrt(sum / Float(buffer.frameLength)))))
    return min(1, max(0, (db + 50) / 20))
}

// One dictation of the notch. yonder-dictate (src-tauri/dictate/main.swift), the helper of the dictation of the app,
// makes the text: it gets the sound as PCM16 at 16 kHz on stdin, and prints JSON lines with the text so far. At the
// end of stdin it prints the last text, of the better model, and exits.
final class Dictation {
    let process = Process()
    let input = Pipe()
    // The writes wait here, not on the audio thread, when the pipe is full.
    let queue = DispatchQueue(label: "yonder-wake.dictation")
    let pcm = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
    var converter: AVAudioConverter?
    var last = ""
    var ended = false
    var done: ((String) -> Void)?

    init(onText: @escaping (Dictation, String) -> Void) throws {
        // yonder-dictate is next to this helper: in Contents/MacOS of the app, or in src-tauri/binaries with the target.
        let me = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
        process.executableURL = me.deletingLastPathComponent()
            .appendingPathComponent(me.lastPathComponent.replacingOccurrences(of: "yonder-wake", with: "yonder-dictate"))
        let output = Pipe()
        process.standardInput = input
        process.standardOutput = output
        process.standardError = FileHandle.standardError
        var rest = Data()
        // The reader keeps this dictation until yonder-dictate exits, also after a send drops it.
        output.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                DispatchQueue.main.async {
                    self.ended = true
                    self.done?(self.last)
                }
                return
            }
            rest.append(data)
            while let end = rest.firstIndex(of: 10) {
                let line = rest[rest.startIndex..<end]
                rest = rest[(end + 1)...]
                guard let text = ((try? JSONSerialization.jsonObject(with: line)) as? [String: String])?["text"] else { continue }
                DispatchQueue.main.async {
                    self.last = text
                    onText(self, text)
                }
            }
        }
        try process.run()
    }

    // On the audio thread: the sound of the microphone as PCM16 at 16 kHz, one channel.
    func feed(_ buffer: AVAudioPCMBuffer) {
        if converter?.inputFormat != buffer.format {
            converter = AVAudioConverter(from: buffer.format, to: pcm)
            converter?.downmix = true
        }
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * 16000 / buffer.format.sampleRate) + 16
        guard let converter, let out = AVAudioPCMBuffer(pcmFormat: pcm, frameCapacity: capacity) else { return }
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
        let data = Data(bytes: out.int16ChannelData![0], count: Int(out.frameLength) * 2)
        queue.async { try? self.input.fileHandleForWriting.write(contentsOf: data) }
    }

    // The end of the sound. `then` gets the last text when it comes.
    func finish(_ then: @escaping (String) -> Void) {
        queue.async { try? self.input.fileHandleForWriting.close() }
        if ended { then(last) } else { done = then }
    }

    func cancel() {
        queue.async { try? self.input.fileHandleForWriting.close() }
        process.terminate()
    }
}

// The notch: the panel over the notch of the screen, and the state of what it shows. The main thread changes it.
final class Notch: ObservableObject {
    // The curve of the top corners, where the shape meets the menu bar.
    static let fillet: CGFloat = 8
    // The colors of the orb in dark mode: --text and --red of src/app.css.
    static let ink = Color(red: 0.925, green: 0.925, blue: 0.925)
    static let red = Color(red: 1, green: 0.42, blue: 0.42)

    @Published var open = false
    @Published var words = ""
    @Published var error = ""
    // The loudness of the voice, from the audio thread.
    var level = 0.0
    // The notch of the screen, or the middle of the menu bar on a screen with no notch.
    var cutout = CGSize(width: 200, height: 32)
    // The closed shape. On a MacBook it is the notch itself, so the shape grows out of the notch and goes back into it,
    // all of it: else the curves of its top corners stay out on the menu bar and fade with the panel. A
    // screen with no notch has nothing to go back into, so there the shape grows out of nothing and shrinks into it.
    var closedSize = CGSize.zero
    // A voice note is the small notch: the orb at its left, the app and the bars at its right. A failure is the big one.
    var size: CGSize {
        note && error.isEmpty
            ? CGSize(width: cutout.width + 2 * Notch.fillet + 2 * Notch.noteEar, height: cutout.height)
            : CGSize(width: max(440, cutout.width + 240), height: cutout.height + 60)
    }
    static let noteEar: CGFloat = 70
    var dictation: Dictation?
    // The dictation is a voice note (Note.swift), not a new agent, and the window where its words go.
    @Published var note = false
    var into: Destination?
    var pending: DispatchWorkItem?
    // Each show counts up, so that a close of an older show does not hide a newer one.
    var shown = 0
    // The small notch of the call shows, and the time when the call went live, or nil while it connects.
    @Published var inCall = false
    @Published var since: Date?
    // The sides of the small notch of the call, for the orb and the time.
    static let ear: CGFloat = 50
    var callSize: CGSize { CGSize(width: cutout.width + 2 * Notch.fillet + 2 * Notch.ear, height: cutout.height) }

    lazy var panel: NSPanel = {
        let panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        // Over the menu bar, on each Space, also over an app in full screen. A click on a nonactivating panel does not
        // make Yonder the active app, so the app of the user keeps the keyboard.
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 3)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        let view = Hosting(rootView: NotchView(notch: self))
        view.sizingOptions = []
        panel.contentView = view
        return panel
    }()

    // The panel of the small notch of the call. A click goes through it to the menu bar. It is a panel of its own,
    // because a panel that once ignored the mouse takes the clicks on its clear parts after it stops ignoring it.
    lazy var callPanel: NSPanel = {
        let panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue + 3)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.ignoresMouseEvents = true
        let view = NSHostingView(rootView: CallView(notch: self))
        view.sizingOptions = []
        panel.contentView = view
        return panel
    }()

    // "Hey Yonder": the notch opens, the start chime of the dictation plays, and the sound goes to yonder-dictate until
    // a send or the X. A voice note keeps the window in front first, before anything can change it.
    func wake(note: Bool = false) {
        guard dictation == nil else { return }
        self.note = note
        into = note ? Destination.inFront() : nil
        task?.cancel()
        let d: Dictation
        do {
            try startMic()
            d = try Dictation { [weak self] d, text in
                if self?.dictation === d { self?.heard(text) }
            }
        } catch {
            return fail("The dictation did not start: \(error.localizedDescription)")
        }
        dictation = d
        // The app pauses the music of other apps until "mic off" (hush in src-tauri/src/main.rs).
        print("mic on")
        lock.withLock { sink = d }
        words = ""
        error = ""
        show()
        chime(true)
        // Nothing heard in 8 s: a "yonder" in other words woke it, so the notch closes again. A voice note listens until
        // the second tap.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
            if self.dictation === d, !self.note, self.words.isEmpty { self.cancel() }
        }
    }

    // The words so far. "send it" at the end sends them when no other word comes for 0.7 s, so that "send it to the
    // server" inside a task does not send.
    func heard(_ text: String) {
        words = text
        pending?.cancel()
        guard !note, text.range(of: #"\bsend it\W*$"#, options: [.regularExpression, .caseInsensitive]) != nil else { return }
        let item = DispatchWorkItem { self.send(said: true) }
        pending = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7, execute: item)
    }

    // A click on the notch or "send it": the notch closes at once, and the agent starts when the last text comes, as
    // the New agent view of the app does. A failure opens the notch again with the reason.
    func send(said: Bool) {
        guard let d = dictation else { return }
        if note { return paste(d) }
        let seen = words
        // The whoosh of an agent that leaves. A send with no words sounds as the X.
        seen.isEmpty ? chime(false) : whoosh()
        end()
        d.finish { text in
            // The last text is of the better model. When it is empty, the words that the user saw go.
            var prompt = text.isEmpty ? seen : text
            if said, let words = prompt.range(of: #"[\s,.;:!?-]*\b(send|sent) it\W*$"#, options: [.regularExpression, .caseInsensitive]) {
                prompt.removeSubrange(words)
            }
            prompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !prompt.isEmpty else { return }
            startAgent(prompt) { failure in
                if let failure { self.fail("The agent did not start: \(failure)") } else { log("yonder-wake: started an agent from the notch") }
            }
        }
    }

    // The second tap of a voice note: the notch closes at once, and the last text goes into the window of the note,
    // with a space after it for the next note.
    private func paste(_ d: Dictation) {
        let seen = words
        let into = self.into
        chime(false)
        end()
        d.finish { text in
            let words = (text.isEmpty ? seen : text).trimmingCharacters(in: .whitespacesAndNewlines)
            if !words.isEmpty { deliver(words + " ", to: into) }
        }
    }

    // The X: the words go nowhere. It also closes a failure.
    func cancel() {
        guard let d = dictation else { return close() }
        d.cancel()
        chime(false)
        end()
    }

    func tap() {
        dictation == nil ? close() : send(said: false)
    }

    // The key of the notch: a tap opens the notch, and a second tap sends the words. It does nothing during a voice note.
    func toggle() {
        if dictation == nil { wake() } else if !note { send(said: false) }
    }

    // The key of the voice note: a press starts it, and the next press pastes the words. A release after a hold pastes
    // what that press started (releaseNote): press, talk, let go. It does nothing while the notch listens for a new
    // agent. Without the Accessibility permission, the notch says so, and macOS asks for it only the first time. macOS
    // remembers no Deny, so else it asks again at each tap of the key.
    func toggleNote() {
        if dictation != nil {
            pressed = false
            if note { send(said: false) }
            return
        }
        guard AXIsProcessTrusted() else {
            if !UserDefaults.standard.bool(forKey: "askedAccessibility") {
                UserDefaults.standard.set(true, forKey: "askedAccessibility")
                AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
            }
            return fail("Allow Yonder in Accessibility, then tap again.")
        }
        wake(note: true)
        pressed = dictation != nil
    }

    // The press of the key that started the voice note, until the next press or its release.
    var pressed = false

    // The release of the key after a hold (note_key in src-tauri/src/main.rs): the voice note of that press pastes.
    func releaseNote() {
        if pressed, note, dictation != nil { send(said: false) }
        pressed = false
    }

    // Another key while the key was down: it was a shortcut, such as ⌥E, so the voice note of that press goes, with no
    // sound of its end.
    func cutNote() {
        if pressed, note, let d = dictation {
            d.cancel()
            end()
        }
        pressed = false
    }

    // A call of the window: the microphone belongs to the call, so the notch drops its words, and the small notch of
    // the call shows. `since` is the time when the call went live, as the call button of the window counts it
    // (connectedAt in src/voice.ts), or nil while it connects. So the time of the notch matches the call button.
    func callStarted(since: Date?) {
        self.since = since
        guard !inCall else { return }
        if dictation != nil || open { cancel() }
        place(callPanel, \.callSize)
        callPanel.orderFrontRegardless()
        DispatchQueue.main.async {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.72)) { self.inCall = true }
        }
    }

    func callEnded() {
        level = 0
        since = nil
        withAnimation(.spring(response: 0.34, dampingFraction: 0.9)) { inCall = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            if !self.inCall { self.callPanel.orderOut(nil) }
        }
    }

    // The dictation stops, and the notch closes.
    private func end() {
        dictation = nil
        print("mic off")
        into = nil
        lock.withLock { sink = nil }
        pending?.cancel()
        level = 0
        close()
    }

    // The failure shows for 6 s, until a click or a new "Hey Yonder".
    func fail(_ message: String) {
        log("yonder-wake: \(message)")
        guard dictation == nil else { return }
        error = message
        show()
        let at = shown
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
            if self.shown == at, self.dictation == nil { self.close() }
        }
    }

    // Puts a panel of this size on the active screen (the screen of the window with the keyboard): over its notch, or
    // over the middle of its menu bar on a screen with no notch. Else, with the work on a second monitor, the notch
    // shows on the MacBook.
    func place(_ panel: NSPanel, _ size: (Notch) -> CGSize) {
        let screen = NSScreen.main ?? NSScreen.screens[0]
        if let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea {
            cutout = CGSize(width: screen.frame.width - left.width - right.width, height: screen.safeAreaInsets.top)
            closedSize = cutout
        } else {
            cutout = CGSize(width: 200, height: max(24, screen.frame.maxY - screen.visibleFrame.maxY))
            closedSize = .zero
        }
        // 10 points more at each side, for the bounce of the spring. From nothing, the shape opens up to 17 points wider
        // than its size for a moment, and the edge of the panel cut the curves of its top corners.
        let size = size(self)
        let width = size.width + 20
        panel.setFrame(NSRect(x: screen.frame.midX - width / 2, y: screen.frame.maxY - size.height, width: width, height: size.height), display: true)
    }

    func show() {
        place(panel, \.size)
        shown += 1
        open = false
        panel.orderFrontRegardless()
        DispatchQueue.main.async {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.72)) { self.open = true }
        }
    }

    func close() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.9)) { open = false }
        let at = shown
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            if self.shown == at { self.panel.orderOut(nil) }
        }
        // The microphone stays on only for "Hey Yonder", which listens again.
        if wakeWord { listen() } else { stopMic() }
    }
}

// The panel never makes Yonder the active app, so each click is a first click.
final class Hosting: NSHostingView<NotchView> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

struct NotchView: View {
    @ObservedObject var notch: Notch

    var body: some View {
        if notch.note && notch.error.isEmpty { NoteView(notch: notch) } else { big }
    }

    @ViewBuilder var big: some View {
        let open = notch.open
        let shape = NotchShape(radius: open ? 22 : 10)
        VStack(alignment: .leading, spacing: 2) {
            // The orb and the X sit at the two sides of the notch. A loud voice grows the orb past its place.
            HStack {
                Orb(notch: notch, live: open).frame(width: 44, height: 44).frame(width: 28, height: 28)
                Spacer()
                Button(action: notch.cancel) {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white.opacity(0.7))
                        .frame(width: 20, height: 20)
                        .background(.white.opacity(0.14), in: Circle())
                }
                .buttonStyle(.plain)
            }
            .frame(height: notch.cutout.height)
            // Two lines at most: the newest line is at the bottom, and the older lines go out at the top. The hidden copy
            // gives the height of one or two lines.
            let line = notch.error.isEmpty ? (notch.words.isEmpty ? "Say \u{201C}send it\u{201D} or click to send" : notch.words) : notch.error
            Text(line)
                .lineLimit(2)
                .hidden()
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .bottomLeading) {
                    Text(line)
                        .foregroundStyle(notch.error.isEmpty ? (notch.words.isEmpty ? .white.opacity(0.45) : .white.opacity(0.92)) : Notch.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .clipped()
                .font(.system(size: 14))
        }
        .padding(.horizontal, Notch.fillet + 14)
        .padding(.bottom, 12)
        .frame(width: notch.size.width)
        .opacity(open ? 1 : 0)
        // Closed, the shape is the notch itself, or nothing on a screen with no notch. Open, it is as tall as the words.
        .frame(width: open ? notch.size.width : notch.closedSize.width, height: open ? nil : notch.closedSize.height, alignment: .top)
        .background(.black)
        .clipShape(shape)
        .contentShape(shape)
        .onTapGesture(perform: notch.tap)
        .frame(width: notch.size.width, height: notch.size.height, alignment: .top)
        .environment(\.colorScheme, .dark)
    }
}

// The small notch of a voice note, as the notch of a call: the orb at its left, and at its right the icon of the app
// where the words go and the bars of the voice. The words do not show. A click pastes, as the second tap does.
struct NoteView: View {
    @ObservedObject var notch: Notch

    var body: some View {
        let on = notch.open
        let size = notch.size
        HStack(spacing: 7) {
            Orb(notch: notch, live: on, rest: 0.05).frame(width: 30, height: 30).frame(width: 20, height: 20)
            Spacer()
            if let icon = notch.into?.icon {
                Image(nsImage: icon).resizable().interpolation(.high).frame(width: 16, height: 16)
            }
            Bars(notch: notch, live: on).frame(width: 29)
        }
        .padding(.horizontal, Notch.fillet + 8)
        .frame(width: size.width, height: size.height)
        .opacity(on ? 1 : 0)
        .frame(width: on ? size.width : notch.closedSize.width, height: on ? size.height : notch.closedSize.height)
        .background(.black)
        .clipShape(NotchShape(radius: 10))
        .contentShape(NotchShape(radius: 10))
        .onTapGesture(perform: notch.tap)
        .frame(width: size.width, height: size.height, alignment: .top)
        .environment(\.colorScheme, .dark)
    }
}

// The bars: seven white bars that scroll to the left, and the loudest moment of each step comes
// in at the right, so they read as a recording being written. Each bar chases its height, so a step looks smooth.
struct Bars: View {
    let notch: Notch
    let live: Bool
    @State private var row = BarRow()

    var body: some View {
        TimelineView(.animation(paused: !live)) { timeline in
            Canvas { context, size in
                // The square root, as the orb takes it, so that a quiet voice moves the bars too.
                row.step(to: sqrt(notch.level), at: timeline.date.timeIntervalSinceReferenceDate)
                let width: CGFloat = 2
                let gap = (size.width - 7 * width) / 6
                let tallest = size.height - 14
                for (i, value) in row.drawn.enumerated() {
                    let height = max(width, min(tallest, tallest * value))
                    let bar = CGRect(x: CGFloat(i) * (width + gap), y: (size.height - height) / 2, width: width, height: height)
                    context.fill(Path(roundedRect: bar, cornerRadius: width / 2), with: .color(.white.opacity(0.92)))
                }
            }
        }
    }
}

final class BarRow {
    var bars = [CGFloat](repeating: 0.06, count: 7)
    var drawn = [CGFloat](repeating: 0.06, count: 7)
    var loudest: CGFloat = 0
    var sinceStep = 0.0
    var last = 0.0

    // A step each 1/15 s: a faster step flickers, and a slower step drags behind the voice. Never quite flat, because
    // a row of zeroes looks like a crash.
    func step(to level: Double, at now: Double) {
        let dt = last == 0 ? 0 : min(0.1, now - last)
        last = now
        loudest = max(loudest, CGFloat(level))
        sinceStep += dt
        if sinceStep >= 1.0 / 15 {
            sinceStep = 0
            bars.removeFirst()
            bars.append(max(0.08, loudest))
            loudest = 0
        }
        // Each bar closes 0.45 of the gap at each frame of 30 per second. This is the same speed at any frame rate.
        let k = 1 - pow(0.55, dt * 30)
        for i in drawn.indices { drawn[i] += (bars[i] - drawn[i]) * k }
    }
}

// The small notch of a live call: the notch with two small sides, the orb at its left and the time of the call at its
// right. The window sends the loudness of the call (`level`), so the orb moves with your voice and the voice of
// Yonder, and it breathes a little in a silence.
struct CallView: View {
    @ObservedObject var notch: Notch

    var body: some View {
        let on = notch.inCall
        let size = notch.callSize
        HStack {
            Orb(notch: notch, live: on, rest: 0.05).frame(width: 30, height: 30).frame(width: 20, height: 20)
            Spacer()
            if let start = notch.since {
                Text(start, style: .timer)
                    .font(.system(size: 12, weight: .medium).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.75))
            }
        }
        .padding(.horizontal, Notch.fillet + 8)
        .frame(width: size.width, height: size.height)
        .opacity(on ? 1 : 0)
        .frame(width: on ? size.width : notch.closedSize.width, height: on ? size.height : notch.closedSize.height)
        .background(.black)
        .clipShape(NotchShape(radius: 10))
        .frame(width: size.width, height: size.height, alignment: .top)
        .environment(\.colorScheme, .dark)
    }
}

// The shape of the notch: the top corners curve out into the menu bar, and the bottom corners are round.
struct NotchShape: Shape {
    var radius: CGFloat
    var animatableData: CGFloat {
        get { radius }
        set { radius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        // A shape smaller than the notch, as it shrinks into nothing on a screen with no notch, keeps the look of the
        // notch: its curves get smaller with it, so they never cross.
        let f = min(Notch.fillet, rect.height / 2, rect.width / 4)
        let radius = min(self.radius, rect.height - f, rect.width / 2 - f)
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addQuadCurve(to: CGPoint(x: rect.minX + f, y: rect.minY + f), control: CGPoint(x: rect.minX + f, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.minX + f, y: rect.maxY - radius))
        p.addQuadCurve(to: CGPoint(x: rect.minX + f + radius, y: rect.maxY), control: CGPoint(x: rect.minX + f, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.maxX - f - radius, y: rect.maxY))
        p.addQuadCurve(to: CGPoint(x: rect.maxX - f, y: rect.maxY - radius), control: CGPoint(x: rect.maxX - f, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.maxX - f, y: rect.minY + f))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY), control: CGPoint(x: rect.maxX - f, y: rect.minY))
        p.closeSubpath()
        return p
    }
}

// The orb of the app (src/Orb.tsx), small: an ink ring and a red ring with a red glow, which wobble and bounce with the
// voice, as a circle drawn by hand. The red ring follows the voice a little late. The dots of the app are left out.
struct Orb: View {
    let notch: Notch
    let live: Bool
    // The least loudness that the rings show, so that a small orb moves also in a silence.
    var rest = 0.0
    @State private var motion = Motion()

    var body: some View {
        TimelineView(.animation(paused: !live)) { timeline in
            Canvas { context, size in
                motion.step(to: sqrt(max(notch.level, rest)), at: timeline.date.timeIntervalSinceReferenceDate)
                // The rings of the app are 116 units across at rest, and about 220 for a loud voice.
                let scale = min(size.width, size.height) / 240
                context.translateBy(x: size.width / 2, y: size.height / 2)
                context.scaleBy(x: scale, y: scale)
                let width = 2.2 / scale
                let red = ring(motion.time, lift(motion.red.x), 3, 1)
                var glow = context
                glow.addFilter(.blur(radius: 3))
                glow.stroke(red, with: .color(Notch.red), lineWidth: width)
                context.stroke(red, with: .color(Notch.red), lineWidth: width)
                context.stroke(ring(motion.time, lift(motion.ink.x), 0, 0), with: .color(Notch.ink), lineWidth: width)
            }
        }
    }
}

// The springs of src/Orb.tsx: a low damping lets the rings overshoot and bounce back, and the red one is softer.
final class Motion {
    var ink = (x: 0.0, v: 0.0)
    var red = (x: 0.0, v: 0.0)
    var time = 0.0
    var last = 0.0

    func step(to target: Double, at now: Double) {
        let dt = last == 0 ? 0 : min(0.1, now - last)
        last = now
        for _ in 0..<4 {
            let h = dt / 4
            ink.v += (320 * (target - ink.x) - 11 * ink.v) * h
            ink.x += ink.v * h
            red.v += (150 * (target - red.x) - 9 * red.v) * h
            red.x += red.v * h
        }
        time += dt * (1 + max(0, ink.x) * 2)
    }
}

// The boost of the small orb of the app (2.5): it lifts a quiet voice, and a full one stays at 1.
func lift(_ v: Double) -> Double { v * 2.5 / (1 + 1.5 * abs(v)) }

// One ring as a smooth closed path, as `ring` in src/Orb.tsx. `out` moves the ring out from the middle, and `drift`
// gives it its own slow offset, so that two rings part and meet again.
func ring(_ time: Double, _ voice: Double, _ out: Double, _ drift: Double) -> Path {
    let waves: [(Double, Double, Double)] = [(2, 3, 0.7), (3, 2.4, -0.9), (5, 1.1, 1.3)]
    let grow = 1 + voice * 4
    let r = 58 + out + voice * 16 + sin(time * 5) * voice * 4
    let points = (0..<12).map { i -> CGPoint in
        let angle = Double(i) / 12 * 2 * .pi
        var d = r
        for (n, height, speed) in waves {
            d += height * grow * sin(n * angle + speed * time + drift * 0.9 * sin(time * 0.45 + n * 1.7))
        }
        return CGPoint(x: cos(angle) * d + drift * 2.5 * sin(time * 0.6), y: sin(angle) * d + drift * 2.5 * cos(time * 0.5))
    }
    // Catmull-Rom through the points, as cubic Bézier curves.
    let at = { (i: Int) in points[(i + 12) % 12] }
    var path = Path()
    path.move(to: at(0))
    for i in 0..<12 {
        let (p0, p1, p2, p3) = (at(i - 1), at(i), at(i + 1), at(i + 2))
        path.addCurve(
            to: p2,
            control1: CGPoint(x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6),
            control2: CGPoint(x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6)
        )
    }
    path.closeSubpath()
    return path
}

// The sound of an agent that leaves the notch: a soft, quick swish (public/whoosh.m4a, Mixkit sound 3220, softened), as
// the paper airplane of the Spark mail app. `resources` of tauri.conf.json puts it in Contents/Resources of the app, and a helper
// in src-tauri/binaries finds it in the repository.
let whooshFile = [
    Bundle.main.url(forResource: "whoosh", withExtension: "m4a"),
    URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath().deletingLastPathComponent().appendingPathComponent("../../public/whoosh.m4a"),
].compactMap { $0 }.first { FileManager.default.fileExists(atPath: $0.path) }
// The player loads the file once at the start, so the whoosh starts at the send. The file has no silence at its start.
let whooshPlayer: AVAudioPlayer? = {
    let p = whooshFile.flatMap { try? AVAudioPlayer(contentsOf: $0) }
    p?.prepareToPlay()
    return p
}()
func whoosh() {
    whooshPlayer?.currentTime = 0
    whooshPlayer?.play()
}

// The chimes of the dictation of the app (chime in src/voice.ts): up when the notch listens, down when it stops. Two
// notes of 0.09 s, a hold, then a fade to 0.4 s.
var player: AVAudioPlayer?
func chime(_ up: Bool) {
    let rate = 44100
    var samples = [Int16](repeating: 0, count: rate * 2 / 5)
    var phase = 0.0
    for i in samples.indices {
        let t = Double(i) / Double(rate)
        phase += 2 * .pi * ((t < 0.09) == up ? 660 : 880) / Double(rate)
        let gain = t < 0.18 ? 0.2 : 0.2 * pow(0.0001 / 0.2, (t - 0.18) / 0.22)
        samples[i] = Int16(sin(phase) * gain * 32767)
    }
    // A WAV file in memory: PCM16, one channel.
    var wav = Data()
    func put(_ text: String) { wav.append(text.data(using: .ascii)!) }
    func put<T: FixedWidthInteger>(_ value: T) { withUnsafeBytes(of: value.littleEndian) { wav.append(contentsOf: $0) } }
    put("RIFF"); put(UInt32(36 + samples.count * 2)); put("WAVEfmt "); put(UInt32(16)); put(UInt16(1)); put(UInt16(1))
    put(UInt32(rate)); put(UInt32(rate * 2)); put(UInt16(2)); put(UInt16(16)); put("data"); put(UInt32(samples.count * 2))
    samples.withUnsafeBytes { wav.append(contentsOf: $0) }
    player = try? AVAudioPlayer(data: wav)
    player?.play()
}

// Starts the agent through the bridge, as the New agent view of the app does (start_worker). With no project, the
// bridge picks the project from the task. `done` gets nil, or why it failed.
func startAgent(_ prompt: String, done: @escaping (String?) -> Void) {
    // YONDER_BRIDGE: the address of the bridge of this user, from the app (sync_wake in main.rs). It is not always port 7787.
    let bridge = ProcessInfo.processInfo.environment["YONDER_BRIDGE"] ?? "http://127.0.0.1:7787"
    var post = URLRequest(url: URL(string: "\(bridge)/mcp")!, timeoutInterval: 120)
    post.httpMethod = "POST"
    post.setValue("application/json", forHTTPHeaderField: "content-type")
    post.setValue("application/json, text/event-stream", forHTTPHeaderField: "accept")
    post.setValue("mac", forHTTPHeaderField: "x-yonder-device")
    post.httpBody = try? JSONSerialization.data(withJSONObject: [
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": ["name": "start_worker", "arguments": ["project": "", "task": prompt, "name": ""]],
    ])
    URLSession.shared.dataTask(with: post) { data, _, error in
        let reply = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
        let result = reply?["result"] as? [String: Any]
        let text = ((result?["content"] as? [[String: Any]])?.first?["text"] as? String) ?? ""
        let failure = error.map(\.localizedDescription) ?? ((reply?["error"] as? [String: Any])?["message"] as? String)
            ?? (result == nil ? "the bridge did not answer." : result?["isError"] as? Bool == true ? text : nil)
        DispatchQueue.main.async { done(failure) }
    }.resume()
}

let app = NSApplication.shared
// No Dock icon and no menu bar: the helper only shows the notch.
app.setActivationPolicy(.accessory)
Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in
    // Yonder stopped without a clean exit, for example in a reinstall, so the microphone must close too.
    if getppid() == 1 { exit(0) }
    if Date().timeIntervalSince(started) > 60 { listen() }
}
if CommandLine.arguments.contains("--demo-note") {
    notch.note = true
    notch.into = Destination.inFront()
    notch.show()
    // A voice that rises and falls, for the bars.
    Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
        notch.level = 0.35 + 0.35 * sin(Date().timeIntervalSince1970 * 5) * sin(Date().timeIntervalSince1970 * 1.3)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) { exit(0) }
} else if CommandLine.arguments.contains("--demo") {
    notch.words = "Make the header of the landing page blue, and then push it to main"
    notch.level = 0.3
    notch.show()
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) { exit(0) }
} else {
    Thread.detachNewThread {
        while let line = readLine() {
            // "call <ms>" has the time when the call went live, and 0 while it connects. "level <0 to 1>" is the
            // loudness of the call, about ten times a second.
            let words = line.split(separator: " ")
            let value = words.count > 1 ? Double(words[1]) ?? 0 : 0
            DispatchQueue.main.async {
                switch words.first ?? "" {
                case "open": notch.toggle()
                case "note": notch.toggleNote()
                case "note-up": notch.releaseNote()
                case "note-cut": notch.cutNote()
                case "escape": if notch.open { notch.cancel() }
                case "call": notch.callStarted(since: value > 0 ? Date(timeIntervalSince1970: value / 1000) : nil)
                case "end": notch.callEnded()
                case "level": notch.level = value
                default: break
                }
            }
        }
    }
}
if wakeWord {
    guard let recognizer, recognizer.supportsOnDeviceRecognition else {
        log("yonder-wake: this Mac has no speech recognition on the device for English")
        exit(1)
    }
    SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
            guard status == .authorized else {
                log("yonder-wake: speech recognition is not allowed (\(status.rawValue))")
                exit(2)
            }
            do {
                try startMic()
            } catch {
                log("yonder-wake: the microphone did not start: \(error)")
                exit(3)
            }
            listen()
            log("yonder-wake: listening")
        }
    }
}
app.run()
