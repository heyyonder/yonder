// The voice call of the car and of the Apple Watch: the call of src/voice.ts, in Swift (docs/carplay.md, docs/watch.md). WebKit starts a microphone only in
// a web view that is on the screen, and in the car the iPhone is often locked, so this call is all native: the audio,
// the WebSocket to Grok, and the tool calls to the bridge through CarLink. The bridge gives the prompt and the tools of
// the car (`/car` in bridge/main.ts), so most of the rules of the car change with no new app.
// shortcut: only the core of voice.ts. The checks of a message to a busy agent, the merge of a request that the user
// said in parts, the correction of wrong fixed words and the new session at the 30-minute limit of Grok are not here.
// Port them from voice.ts when the car calls show the need.
import AVFoundation
import Foundation

final class CarCall {
  enum State: String { case connecting, listening, thinking, speaking, muted, ended }

  // Tools that send words to an agent. The call adds the last words of the call to them as context.
  private static let sends: Set<String> = ["start_worker", "message_worker"]
  // Tools that only do something. Their result has no news for the user when they succeed.
  private static let actions: Set<String> = ["start_worker", "message_worker", "close_worker", "complete_worker", "end_call"]
  // The silence that ends a turn of the user, as SILENCE_MS in voice.ts.
  private static let silenceMs = 1200
  // The pause after the last speech before the call gives Grok news, as QUIET_MS in voice.ts.
  private static let quiet: TimeInterval = 4
  private static let rate = 24_000.0
  static let pricePerMinute = 0.08 // As PRICE_PER_MINUTE in voice.ts.

  var onState: (State) -> Void = { _ in }
  var onAgents: ([[String: Any]]) -> Void = { _ in }
  var onEnd: (String?) -> Void = { _ in }
  var onStep: (String) -> Void = { _ in } // The watch saves each step, to tell where a call stopped.
  var onSaid: (String) -> Void = { _ in } // The watch shows the last answer of Grok as a caption.
  private(set) var state = State.connecting
  private(set) var muted = false

  private let link: CarLink
  private let pairing: CarPairing
  // "car" or "watch". The bridge gives the prompt of that screen.
  private let screen: String
  // On the watch, CallKit owns the audio session: it activates it for the call and closes it after.
  private let callKit: Bool
  private var place: String { screen == "watch" ? "on the watch" : "in the car" }
  private var carPath: String {
    let zone = TimeZone.current.identifier.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
    return "/car?zone=\(zone)" + (screen == "car" ? "" : "&screen=\(screen)")
  }
  // Int64: Int has 32 bits on most watches (arm64_32), and the milliseconds since 1970 crashed the watch call.
  private let id = Int64(Date().timeIntervalSince1970 * 1000) // The transcript of this call goes in the file with this name.
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private let pcm = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: rate, channels: 1, interleaved: true)!
  private let float = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1)!
  private var socket: URLSessionWebSocketTask?
  private var tools: Set<String> = []
  private var instructions = ""
  private var ended = false
  private var ending = false // After end_call, the call ends when Grok stops talking.
  private var timers: [Timer] = []
  private var observers: [NSObjectProtocol] = []

  // The state of the talk, as in voice.ts.
  private var turn = 0
  private var interrupted = false
  private var responding = false
  private var userSpeaking = false
  private var spoke = false
  private var queued = 0 // The audio buffers that wait to play.
  // A stopped player calls the handlers of its buffers too. They must not count against the buffers of the next answer.
  private var generation = 0
  private var afterPlayback: [() -> Void] = []
  private var lastSound = Date()
  private var calls: [Task<Bool, Never>] = []
  private var said: [String] = [] // The last words of the call, for the context of an agent.
  private var sent: [String: Date] = [:] // The same request less than 30 s ago is not sent again.
  private var news: [Int: Bool] = [:] // For each agent, if it had news at the last check.
  private var newsQueue: Set<Int> = []
  private var loudest: Int16 = 0 // The loudest sample of the first seconds, in the log, to see that the microphone hears.
  private var heard = 0
  // The first 15 s of the microphone of the watch, as Grok gets it. It goes to the Mac as a WAV in base64 through
  // /paste, because the relay has no path for a file. It lets a developer hear how the watch sounds.
  private var recording = Data()
  private var recorded = false
  // The Grok voice of the Yonder account: a super user sets it for everyone, and staff for one account (yonder.so).
  private var voice = "liora"

  init(link: CarLink, pairing: CarPairing, screen: String = "car", callKit: Bool = false) {
    self.link = link
    self.pairing = pairing
    self.screen = screen
    self.callKit = callKit
  }

  // Connects to Grok and starts the microphone. It throws when the call cannot start, such as when the Mac is offline.
  @MainActor func start() async throws {
    onStep("the request to the Mac")
    let (status, body) = try await link.fetch(carPath)
    guard status == 200, let car = try JSONSerialization.jsonObject(with: body) as? [String: Any] else {
      throw CarError(status == 403 ? "Update Yonder on the Mac to use it \(place)." : "The Mac did not give the rules of the call.")
    }
    instructions = car["instructions"] as? String ?? ""
    let toolList = car["tools"] as? [[String: Any]] ?? []
    tools = Set(toolList.compactMap { $0["name"] as? String })
    agents(car["agents"] as? [[String: Any]] ?? [])
    onStep("the token for Grok")
    let secret = try await token()
    // The user can end the call while it connects.
    guard !ended else { throw CarError("The call ended.") }
    onStep("the microphone")
    try startAudio()
    onStep("the connection to Grok")
    let ws = URLSession.shared.webSocketTask(
      with: URL(string: "wss://api.x.ai/v1/realtime?model=grok-voice-latest")!, protocols: ["xai-client-secret.\(secret)"])
    socket = ws
    ws.resume()
    send([
      "type": "session.update",
      "session": [
        "voice": voice,
        "instructions": instructions,
        "turn_detection": ["type": "server_vad", "silence_duration_ms": Self.silenceMs],
        "tools": toolList,
        "audio": [
          "input": ["format": ["type": "audio/pcm", "rate": Int(Self.rate)], "transport": "binary"],
          "output": ["format": ["type": "audio/pcm", "rate": Int(Self.rate)], "transport": "binary"],
        ],
      ] as [String: Any],
    ])
    receive(ws)
    set(.listening)
    log("\(screen) call start", "route \(AVAudioSession.sharedInstance().currentRoute.outputs.map(\.portName))")
    // The prompt and the list of the car screen stay current. The news waits for a pause.
    timers.append(Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in self?.refresh() })
    timers.append(Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.offerNews() })
    // A call keeps the Mac awake, so the bridge and the agents stay on when its screen locks.
    timers.append(Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.minute() })
    minute()
  }

  func mute(_ on: Bool) {
    muted = on
    set(on ? .muted : .listening)
    log(on ? "mic muted" : "mic unmuted")
  }

  // The car tells Grok something without words of the user, such as a tap on an agent. Grok answers it aloud.
  func tell(_ text: String) {
    let go = { [weak self] in
      self?.send(["type": "conversation.item.create", "item": ["type": "message", "role": "user", "content": [["type": "input_text", "text": text]]]])
      self?.send(["type": "response.create"])
    }
    queued > 0 ? afterPlayback.append(go) : go()
  }

  func hangUp(_ reason: String? = nil) {
    DispatchQueue.main.async { [self] in
      guard !ended else { return }
      ended = true
      timers.forEach { $0.invalidate() }
      observers.forEach(NotificationCenter.default.removeObserver)
      socket?.cancel(with: .normalClosure, reason: nil)
      engine.inputNode.removeTap(onBus: 0)
      engine.stop()
      // The audio session is open only while voice is in use, a rule of CarPlay. CallKit closes its own session.
      if !callKit { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
      minute()
      log("\(screen) call end", reason ?? "")
      set(.ended)
      onEnd(reason)
    }
  }

  // MARK: The token

  // From the bridge, with the xAI key in the .env of the computer. A call needs no Yonder account. The call is always
  // Grok, also when the web call uses another model. With a sign-in, it uses the Grok voice of the account.
  private func token() async throws -> String {
    let check = try await link.fetch("/token?check")
    let own = (try? JSONSerialization.jsonObject(with: check.body) as? [String: Any])?["key"] as? Bool ?? true
    guard own else { throw CarError("Add an xAI key to your computer to talk \(place).") }
    if let account = pairing.account, !account.isEmpty {
      // shortcut: with no answer from yonder.so, the call goes on with Liora.
      voice = ((try? await site("account", nil, account))?["account"] as? [String: Any])?["voice"] as? String ?? voice
    }
    let (status, body) = try await link.fetch("/token")
    let json = try JSONSerialization.jsonObject(with: body) as? [String: Any] ?? [:]
    guard status == 200, let value = json["value"] as? String else { throw CarError(json["error"] as? String ?? "The Mac gave no token for Grok.") }
    return value
  }

  // A POST with the body, or a GET with no body.
  private func site(_ path: String, _ body: [String: Any]?, _ token: String) async throws -> [String: Any] {
    var request = URLRequest(url: URL(string: "https://yonder.so/api/app/\(path)")!)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    if let body {
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "content-type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    let (data, _) = try await URLSession.shared.data(for: request)
    return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
  }

  // Each minute the Mac stays awake.
  private func minute() {
    Task { _ = try? await link.fetch("/awake", method: "POST") }
  }

  // MARK: The audio

  private func startAudio() throws {
    // The voice chat mode gives the echo cancellation of the system, so that the user can interrupt Grok. With
    // CallKit, the watch sets the category before the call, and CallKit activates the session. `.defaultToSpeaker`
    // does not exist on watchOS.
    #if os(iOS)
      if !callKit {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker])
        try session.setActive(true)
      }
    #endif
    // On the watch, the mode .voiceChat of CallKit gives the echo cancellation.
    #if os(iOS)
      try engine.inputNode.setVoiceProcessingEnabled(true)
    #endif
    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: float)
    try tap()
    // A new route, such as the car, can change the format of the microphone. The engine then stops, so it starts again.
    observers.append(NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
      guard let self, !self.ended else { return }
      self.log("audio: new configuration")
      self.engine.inputNode.removeTap(onBus: 0)
      do { try self.tap() } catch { self.hangUp("The call ended: the audio stopped. \(error.localizedDescription)") }
    })
    // Another app, such as a phone call, takes the audio.
    observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
      let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
      if type == AVAudioSession.InterruptionType.began.rawValue { self?.hangUp("The call ended: another app took the audio.") }
    })
  }

  // The microphone goes to Grok as PCM16 at 24 kHz, in parts of about 100 ms.
  private func tap() throws {
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    // The watch gives 3 channels, and the converter to mono gave only silence. So the channels are mixed to mono here.
    // A microphone that another app took, such as a phone call, has a format of 0 Hz.
    guard format.sampleRate > 0, format.channelCount > 0, let mono = AVAudioFormat(standardFormatWithSampleRate: format.sampleRate, channels: 1) else {
      throw CarError("The microphone is not available.")
    }
    guard let converter = AVAudioConverter(from: mono, to: pcm) else { throw CarError("The microphone has an unknown format.") }
    log("audio: microphone \(Int(format.sampleRate)) Hz, \(format.channelCount) channels")
    var peaks = [Float](repeating: 0, count: Int(format.channelCount))
    // The microphone of the watch is very quiet: about 0.01 at most, so without a gain the VAD of Grok hears nobody.
    // A gain of 12 on the sum of the 3 channels clips the voice (32767), so it is 4.
    #if os(watchOS)
      let gain: Float = 4
    #else
      let gain: Float = 1
    #endif
    input.installTap(onBus: 0, bufferSize: AVAudioFrameCount(format.sampleRate / 10), format: format) { [weak self] raw, _ in
      guard let self, let socket = self.socket, socket.state == .running else { return }
      guard let channels = raw.floatChannelData, let buffer = AVAudioPCMBuffer(pcmFormat: mono, frameCapacity: raw.frameLength),
        let sum = buffer.floatChannelData?[0]
      else { return }
      buffer.frameLength = raw.frameLength
      let count = Int(raw.format.channelCount)
      for i in 0..<Int(raw.frameLength) {
        var v: Float = 0
        for c in 0..<count {
          let x = channels[c][i]
          v += x
          if self.heard < 300 { peaks[c] = max(peaks[c], abs(x)) }
        }
        sum[i] = max(-1, min(1, v * gain))
      }
      if self.heard == 49 || self.heard == 299 {
        self.log("audio: loudest of each channel in \((self.heard + 1) / 10) s \(peaks.map { String(format: "%.4f", $0) }), gain \(gain)")
      }
      let capacity = AVAudioFrameCount(Double(buffer.frameLength) * Self.rate / format.sampleRate) + 16
      guard let out = AVAudioPCMBuffer(pcmFormat: self.pcm, frameCapacity: capacity) else { return }
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
      guard out.frameLength > 0, let samples = out.int16ChannelData else { return }
      if self.heard < 300 {
        for i in 0..<Int(out.frameLength) { self.loudest = max(self.loudest, abs(max(samples[0][i], -Int16.max))) }
        self.heard += 1
        if self.heard == 50 || self.heard == 300 { self.log("audio: loudest sample sent in \(self.heard / 10) s \(self.loudest)") }
      }
      // A muted microphone sends silence, so server VAD hears nothing and the call stays on.
      let data = self.muted ? Data(count: Int(out.frameLength) * 2) : Data(bytes: samples[0], count: Int(out.frameLength) * 2)
      socket.send(.data(data)) { _ in }
      #if os(watchOS)
        if !self.recorded {
          self.recording.append(data)
          if self.recording.count >= Int(Self.rate) * 2 * 15 { self.recorded = true; self.sendRecording() }
        }
      #endif
    }
    if !engine.isRunning { try engine.start() }
    player.play()
  }

  // The audio of Grok, PCM16 at 24 kHz. The parts play one after the other.
  private func play(_ data: Data) {
    let count = data.count / 2
    guard count > 0, let buffer = AVAudioPCMBuffer(pcmFormat: float, frameCapacity: AVAudioFrameCount(count)), let out = buffer.floatChannelData else { return }
    buffer.frameLength = AVAudioFrameCount(count)
    data.withUnsafeBytes { raw in
      let pcm = raw.bindMemory(to: Int16.self)
      for i in 0..<count { out[0][i] = Float(Int16(littleEndian: pcm[i])) / 32768 }
    }
    queued += 1
    if state != .muted { set(.speaking) }
    let current = generation
    player.scheduleBuffer(buffer) { [weak self] in
      DispatchQueue.main.async {
        guard let self, !self.ended, current == self.generation, self.queued > 0 else { return }
        self.queued -= 1
        guard self.queued == 0 else { return }
        self.lastSound = Date()
        if self.state == .speaking { self.set(.listening) }
        let waiting = self.afterPlayback
        self.afterPlayback = []
        waiting.forEach { $0() }
      }
    }
  }

  // The user speaks, so the answer of Grok stops.
  private func hush() {
    queued = 0
    generation += 1
    afterPlayback = [] // The answer to the new words of the user replaces what was waiting.
    player.stop()
    player.play()
  }

  // MARK: Grok

  private func send(_ event: [String: Any]) {
    guard let socket, let data = try? JSONSerialization.data(withJSONObject: event) else { return }
    socket.send(.string(String(decoding: data, as: UTF8.self))) { _ in }
  }

  private func receive(_ ws: URLSessionWebSocketTask) {
    ws.receive { [weak self] result in
      DispatchQueue.main.async {
        guard let self, !self.ended else { return }
        switch result {
        case .failure(let error):
          let reason = ws.closeReason.map { String(decoding: $0, as: UTF8.self) } ?? ""
          self.hangUp(reason.isEmpty ? "The call ended: the connection to Grok dropped. \(error.localizedDescription)" : "The call ended: \(reason)")
        case .success(.data(let data)):
          if !self.interrupted { self.play(data) }
          self.receive(ws)
        case .success(.string(let text)):
          if let event = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] { self.handle(event) }
          self.receive(ws)
        case .success:
          self.receive(ws)
        }
      }
    }
  }

  private func handle(_ event: [String: Any]) {
    let type = event["type"] as? String ?? ""
    switch type {
    case "input_audio_buffer.speech_started":
      turn += 1
      userSpeaking = true
      responding = false // Server VAD cancels the response that runs.
      interrupted = true
      lastSound = Date()
      calls.removeAll() // Their results still arrive, as context for the next answer.
      hush()
      if !muted { set(.listening) }
    case "input_audio_buffer.speech_stopped":
      userSpeaking = false
      lastSound = Date()
      if !muted { set(.thinking) }
    case "response.created":
      responding = true
      interrupted = false
      spoke = false
      lastSound = Date()
    case "conversation.item.input_audio_transcription.completed":
      hear("User", event["transcript"] as? String ?? "")
    case "response.output_audio_transcript.done":
      let text = event["transcript"] as? String ?? ""
      if !text.trimmingCharacters(in: .whitespaces).isEmpty { spoke = true }
      hear("Yonder", text)
    case "response.function_call_arguments.done":
      let name = event["name"] as? String ?? ""
      let args = event["arguments"] as? String ?? "{}"
      record("tool", "\(name) \(args)")
      let callId = event["call_id"] as? String ?? ""
      calls.append(Task { @MainActor in await self.run(callId, name, args) })
    case "response.done":
      lastSound = Date()
      // Grok continues after the results of its tool calls, so the response is not over yet.
      responding = !calls.isEmpty
      if !calls.isEmpty {
        let current = turn
        let pending = calls
        calls.removeAll()
        Task { @MainActor in
          var needed: [Bool] = []
          for call in pending { needed.append(await call.value) }
          guard current == self.turn, !self.ended else { return }
          // Grok often says "Sent." in the same response as the action. Another response then only says it again.
          if !self.spoke || needed.contains(true) {
            let go = { self.send(["type": "response.create"]) }
            self.queued > 0 ? self.afterPlayback.append(go) : go()
          } else {
            self.responding = false
          }
          self.endIfEnding()
        }
        return
      }
      endIfEnding()
    case "error":
      log("grok error", (event["error"] as? [String: Any])?["message"] as? String ?? "")
    default:
      break
    }
  }

  private func endIfEnding() {
    guard ending else { return }
    queued > 0 ? afterPlayback.append { [weak self] in self?.hangUp() } : hangUp()
  }

  // The words since the last message to an agent, so that an agent gets the conversation, not only the request.
  private func hear(_ who: String, _ text: String) {
    let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }
    record(who == "User" ? "you" : "yonder", text)
    if who == "Yonder" { onSaid(text) }
    said.append("\(who): \(text)")
    if said.count > 12 { said.removeFirst() }
  }

  // Runs one tool call of Grok. It returns true when Grok must hear the result before it answers. It runs on the main
  // actor, as `hear`: else two tool calls in one response change `sent` and `said` from two threads at the same time.
  @MainActor private func run(_ callId: String, _ name: String, _ args: String) async -> Bool {
    var input = (try? JSONSerialization.jsonObject(with: Data(args.utf8)) as? [String: Any]) ?? [:]
    let sends = Self.sends.contains(name)
    var output: String
    var failed = false
    if name == "end_call" {
      ending = true
      output = "The call ends when you stop talking."
    } else if !tools.contains(name) {
      output = "Error: \(name) does not work \(place)."
      failed = true
    } else if sends, args.contains("[Yonder app]") {
      output = "Not sent: a [Yonder app] note is not a request of the user. Do not start an agent or send a message for it."
    } else if sends, let last = sent[name + args], Date().timeIntervalSince(last) < 30 {
      // The speech to text can give the same words two times, and Grok then sends the same thing again.
      output = "Not sent: you sent the same thing less than 30 seconds ago. Do not say that you sent it again."
    } else {
      if sends {
        sent[name + args] = Date()
        if !said.isEmpty { input["context"] = said.joined(separator: "\n") }
      }
      do {
        output = try await link.callTool(name, input)
        // An agent has these words now, so the next agent gets only the words after them.
        if sends { said.removeAll() }
      } catch {
        output = "Error: \(error.localizedDescription)"
        failed = true
      }
    }
    send(["type": "conversation.item.create", "item": ["type": "function_call_output", "call_id": callId, "output": output]])
    return failed || !Self.actions.contains(name)
  }

  // MARK: The news

  // The prompt and the list of the car screen, again. A new prompt replaces the old one, so the context does not grow.
  private func refresh() {
    Task { @MainActor in
      guard !ended, let (status, body) = try? await link.fetch(carPath), status == 200,
        let car = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
      else { return }
      if let text = car["instructions"] as? String, text != instructions {
        instructions = text
        send(["type": "session.update", "session": ["instructions": text]])
      }
      agents(car["agents"] as? [[String: Any]] ?? [])
    }
  }

  // An agent that starts to wait for the user, or that gets a result that needs the user, is news for a pause.
  private func agents(_ list: [[String: Any]]) {
    for agent in list {
      guard let num = agent["num"] as? Int else { continue }
      let now = agent["news"] as? Bool ?? false
      if now, news[num] == false { newsQueue.insert(num) }
      news[num] = now
    }
    onAgents(list)
    lastAgents = list
  }
  private var lastAgents: [[String: Any]] = []

  // The news waits for a pause: nobody speaks, Grok has no response, and nothing played for a few seconds.
  private func offerNews() {
    guard !newsQueue.isEmpty, !responding, !userSpeaking, queued == 0, calls.isEmpty, Date().timeIntervalSince(lastSound) > Self.quiet else { return }
    let lines = lastAgents.filter { newsQueue.contains($0["num"] as? Int ?? -1) && $0["news"] as? Bool == true }.map {
      "- Agent \($0["num"] ?? "") \"\($0["name"] ?? "")\" in \($0["project"] ?? ""): \($0["status"] as? String == "Waits for you" ? "waits for the user's reply" : "has a result that needs the user")."
    }
    newsQueue.removeAll()
    guard !lines.isEmpty else { return }
    tell(
      "[Yonder app] News while nobody spoke:\n\(lines.joined(separator: "\n"))\n"
        + "In one short sentence, name the agent and ask if the user wants an update, for example \"Agent 12 in Yonder waits for your reply. Do you want an update?\" "
        + "Give no details until the user says yes.")
  }

  // MARK: The log

  private func set(_ next: State) {
    guard state != next, !(state == .ended && next != .ended) else { return }
    state = next
    onState(next)
  }

  // Writes to ~/.config/yonder/call.log through the bridge, as voice.ts.
  private func sendRecording() {
    var wav = Data("RIFF".utf8)
    func add<T: FixedWidthInteger>(_ v: T) { withUnsafeBytes(of: v.littleEndian) { wav.append(contentsOf: $0) } }
    let rate = UInt32(Self.rate)
    add(UInt32(36 + recording.count)); wav.append(contentsOf: Array("WAVEfmt ".utf8))
    add(UInt32(16)); add(UInt16(1)); add(UInt16(1)); add(rate); add(rate * 2); add(UInt16(2)); add(UInt16(16))
    wav.append(contentsOf: Array("data".utf8)); add(UInt32(recording.count)); wav.append(recording)
    recording = Data()
    let text = "yonder-watch-wav:" + wav.base64EncodedString()
    Task {
      let answer = try? await link.fetch("/paste", method: "POST", headers: ["content-type": "text/plain"], body: Data(text.utf8))
      log("audio: recording of 15 s sent, status \(answer?.status ?? 0)")
    }
  }

  private func log(_ parts: String...) {
    let text = (["[\(screen)]"] + parts).joined(separator: " ")
    Task { _ = try? await link.fetch("/log", method: "POST", body: Data(text.utf8)) }
  }

  // Saves one line of the transcript of the call in ~/.config/yonder/calls through the bridge.
  private func record(_ who: String, _ text: String) {
    guard let body = try? JSONSerialization.data(withJSONObject: ["who": who, "text": text]) else { return }
    Task { _ = try? await link.fetch("/transcript?call=\(id)", method: "POST", body: body) }
  }
}
