// The Apple Watch app of Yonder (docs/watch.md): a Talk button, the call, and the list of the agents. The call is the
// Swift call of CarPlay (CarCall.swift) inside a CallKit call: watchOS opens a WebSocket only during a CallKit call
// (TN3135), and the relay and Grok both use WebSockets. Outside a call, the watch cannot reach the Mac, so it shows the
// list of the agents from its last call. The phone gives the watch its pairing (WatchLink.swift in the iPhone app).
import AVFoundation
import CallKit
import Foundation
import WatchConnectivity
import WatchKit

// The main actor owns all the state. CallKit calls the delegate on the main queue, and WatchConnectivity on a queue of
// its own, so its delegate methods are nonisolated and go back to the main actor.
// shortcut: still ObservableObject; move to @Observable when `problem` (a didSet) has a test on a watch.
@MainActor
final class WatchModel: NSObject, ObservableObject {
  struct Agent: Identifiable, Codable {
    let num: Int
    let name: String
    let project: String
    let status: String
    let news: Bool
    var id: Int { num }
  }

  static let shared = WatchModel()
  @Published private(set) var paired = CarStore.pairing() != nil
  @Published private(set) var state: CarCall.State? // nil when no call runs.
  @Published private(set) var muted = false
  @Published private(set) var agents: [Agent] = WatchModel.savedAgents()
  @Published private(set) var caption = "" // The last answer of Grok in this call.
  // The reason of the last failed call. UserDefaults keeps it, because CallKit can close the app after a failure.
  @Published var problem: String? = UserDefaults.standard.string(forKey: "problem") {
    didSet { UserDefaults.standard.set(problem, forKey: "problem") }
  }

  private let provider: CXProvider
  private let controller = CXCallController()
  private var uuid: UUID?
  private var call: CarCall?
  private var link: CarLink?
  private var afterStart: [String] = [] // Words for Grok that wait until the call is live.
  private var topic: String? // The name of the agent that the call is about, after a tap on an agent.

  override init() {
    let config = CXProviderConfiguration()
    config.supportsVideo = false
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    // CallKit uses only the alpha of the icon, so the system call screen shows the outline of the Yonder face.
    config.iconTemplateImageData = UIImage(named: "Face")?.pngData()
    provider = CXProvider(configuration: config)
    super.init()
    // A step that is still saved at launch: the app stopped during a call, such as after a crash.
    if let last = UserDefaults.standard.string(forKey: "step") {
      problem = "The last call stopped at: \(last)."
      step(nil)
    }
    provider.setDelegate(self, queue: nil) // The main queue.
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  // Starts a call. With `note`, Grok answers it when the call is live, such as after a tap on an agent.
  func talk(_ note: String? = nil) {
    if let note {
      if let call, call.state != .connecting {
        call.tell(note)
        return
      }
      afterStart.append(note)
    }
    guard uuid == nil else { return }
    guard paired else {
      problem = "Open Yonder on the iPhone to link this watch."
      return
    }
    // watchOS does not ask for the microphone by itself, and with no permission the microphone gives only silence.
    switch AVAudioApplication.shared.recordPermission {
    case .denied:
      problem = "Allow the microphone for Yonder in the Settings of the watch."
      return
    case .undetermined:
      Task {
        if await AVAudioApplication.requestRecordPermission() { talk() } else { problem = "Allow the microphone for Yonder in the Settings of the watch." }
      }
      return
    default: break
    }
    let id = UUID()
    uuid = id
    problem = nil
    state = .connecting
    step("the request to CallKit")
    let action = CXStartCallAction(call: id, handle: CXHandle(type: .generic, value: "Yonder"))
    Task {
      do { try await controller.request(CXTransaction(action: action)) } catch { finish("The call did not start. \(error.localizedDescription)") }
    }
  }

  // End and Mute go through CallKit, so that its state stays the same as the state of the call.
  func end() {
    guard let uuid else { return }
    Task {
      do { try await controller.request(CXTransaction(action: CXEndCallAction(call: uuid))) } catch { stop(nil) }
    }
  }

  func toggleMute() {
    guard let uuid else { return }
    let action = CXSetMutedCallAction(call: uuid, muted: !muted)
    Task { try? await controller.request(CXTransaction(action: action)) }
  }

  // The words for Grok after a tap on an agent, as on the car screen.
  func open(_ agent: Agent) {
    topic = agent.name
    talk(
      "[Yonder app] The user tapped agent \(agent.num) on the watch. Call get_worker for agent \(agent.num), "
        + "and say in one or two sentences what it did or what it needs from the user.")
  }

  // MARK: The call

  // CallKit activated the audio session: only now can the watch open the WebSockets.
  private func connect() {
    step("the connection to the Mac")
    guard let uuid, call == nil else { return }
    // The green button of the system call screen starts a call with no check of the pairing. Else a watch with no
    // pairing shows "One moment" until the user presses End.
    guard let pairing = CarStore.pairing() else {
      provider.reportCall(with: uuid, endedAt: nil, reason: .failed)
      return finish("Open Yonder on the iPhone to link this watch.")
    }
    // A new link for each call: after a call, watchOS closes its WebSocket.
    let link = CarLink(pairing: pairing, key: CarStore.key())
    self.link = link
    let call = CarCall(link: link, pairing: pairing, screen: "watch", callKit: true)
    self.call = call
    call.onState = { [weak self, weak call] state in
      // A light tap on the wrist when Grok starts to speak.
      if state == .speaking, self?.state != .speaking { WKInterfaceDevice.current().play(.click) }
      self?.state = state == .ended ? nil : state
      self?.muted = call?.muted ?? false
    }
    call.onStep = { [weak self] name in self?.step(name) }
    call.onAgents = { [weak self] list in self?.show(list) }
    call.onSaid = { [weak self] text in self?.caption = text }
    call.onEnd = { [weak self, weak call] reason in
      if let call { self?.ended(call, reason) }
    }
    Task { @MainActor in
      do {
        try await call.start()
        provider.reportOutgoingCall(with: uuid, connectedAt: nil)
        name()
        step(nil)
        afterStart.forEach(call.tell)
        afterStart = []
      } catch {
        call.hangUp(error.localizedDescription)
      }
    }
  }

  // The call ended by itself, such as after "bye" or a drop.
  private func ended(_ call: CarCall, _ reason: String?) {
    guard self.call === call, let uuid else { return }
    provider.reportCall(with: uuid, endedAt: nil, reason: reason == nil ? .remoteEnded : .failed)
    stop(reason)
  }

  private func stop(_ reason: String?) {
    let call = self.call
    self.call = nil
    call?.hangUp()
    finish(reason)
  }

  private func finish(_ reason: String?) {
    step(nil)
    if let link { Task { await link.close() } }
    link = nil
    uuid = nil
    state = nil
    muted = false
    afterStart = []
    topic = nil
    caption = ""
    problem = reason.map(Self.words)
  }

  // The name on the system call screen: the agent of the call, or how many agents work now.
  private func name() {
    guard let uuid else { return }
    let working = agents.filter { !["Waits for you", "Done", "Failed"].contains($0.status) }.count
    let update = CXCallUpdate()
    update.localizedCallerName = topic ?? (working == 0 ? "Yonder" : "Yonder · \(working) working")
    provider.reportCall(with: uuid, updated: update)
  }

  // The bridge knows the key of the watch only after the phone gave it.
  private static func words(_ reason: String) -> String {
    reason.contains("not paired") ? "Open Yonder on the iPhone to link this watch with the Mac." : reason
  }

  // Saves the step of the call that runs now, so that the next launch can tell where a call stopped.
  private func step(_ name: String?) {
    UserDefaults.standard.set(name, forKey: "step")
    UserDefaults.standard.synchronize() // A crash comes soon after, so write it to the disk now.
  }

  // MARK: The agents

  private func show(_ list: [[String: Any]]) {
    let before = Dictionary(agents.map { ($0.num, $0.news) }, uniquingKeysWith: { a, _ in a })
    agents = list.compactMap { agent in
      guard let num = agent["num"] as? Int else { return nil }
      return Agent(
        num: num, name: agent["name"] as? String ?? "Agent \(num)", project: agent["project"] as? String ?? "",
        status: agent["status"] as? String ?? "", news: agent["news"] as? Bool ?? false)
    }
    UserDefaults.standard.set(try? JSONEncoder().encode(agents), forKey: "agents")
    // A tap on the wrist when an agent has new news, such as a result or a question.
    if call != nil, agents.contains(where: { $0.news && before[$0.num] == false }) {
      WKInterfaceDevice.current().play(.notification)
    }
    name()
  }

  private static func savedAgents() -> [Agent] {
    UserDefaults.standard.data(forKey: "agents").flatMap { try? JSONDecoder().decode([Agent].self, from: $0) } ?? []
  }
}

// The provider calls on the main queue (`setDelegate(self, queue: nil)`), so the methods keep the main actor.
extension WatchModel: @preconcurrency CXProviderDelegate {
  func providerDidReset(_ provider: CXProvider) { stop("CallKit stopped the call.") }

  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    // The green button of the system call screen starts a call with no tap on Talk.
    if uuid == nil { uuid = action.callUUID; state = .connecting; problem = nil }
    do {
      try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat)
    } catch {
      action.fail()
      finish("The microphone did not start. \(error.localizedDescription)")
      return
    }
    step("the start of the audio")
    provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: nil)
    action.fulfill()
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) { connect() }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    stop(nil)
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    call?.mute(action.isMuted)
    muted = action.isMuted
    action.fulfill()
  }
}

// The phone gives the pairing of the Mac, and the watch gives its public key, which the phone gives to the Mac.
extension WatchModel: WCSessionDelegate {
  nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    guard state == .activated else { return }
    let key = b64(CarStore.key().publicKey.x963Representation)
    if session.applicationContext["key"] as? String != key { try? session.updateApplicationContext(["key": key]) }
    take(session.receivedApplicationContext)
  }

  nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) { take(context) }

  nonisolated private func take(_ context: [String: Any]) {
    guard let data = context["pairing"] as? Data, let pairing = try? JSONDecoder().decode(CarPairing.self, from: data) else { return }
    CarStore.save(pairing)
    Task { @MainActor in paired = true }
  }
}
