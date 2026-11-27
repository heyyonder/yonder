// The CarPlay screen of Yonder: the car mode of docs/carplay.md. The phone keeps the full React app, and the car gets
// only this screen and the Swift call (CarCall.swift). The tab bar has two tabs: Voice, with a Talk button, and Agents,
// with the list of the agents. During a call, the voice control template shows over them. No settings, pairing, sign-in
// or purchases. This is plain Swift: CarPlay can start Yonder with no phone
// screen, and then Tauri, the web view and the React app do not start (`declared_configuration` in ios/tao).
import CarPlay
import CryptoKit
import UIKit
import WebKit

// The web app gives the pairing of the phone to the car call, and gets the public key of the car, which it gives to
// the Mac through its own link (`linkCar` in src/bridge.ts). The `car_link` command of ios/src/lib.rs calls this.
// `out` gets the public key in base64url, with a 0 at the end.
@_cdecl("yonder_car_link")
public func yonderCarLink(
  _ relay: UnsafePointer<CChar>, _ room: UnsafePointer<CChar>, _ mac: UnsafePointer<CChar>, _ device: UnsafePointer<CChar>,
  _ account: UnsafePointer<CChar>, _ out: UnsafeMutablePointer<CChar>, _ size: Int
) {
  let token = String(cString: account)
  CarStore.save(
    CarPairing(
      relay: String(cString: relay), room: String(cString: room), mac: String(cString: mac), device: String(cString: device),
      account: token.isEmpty ? nil : token))
  let pub = Array(b64(CarStore.key().publicKey.x963Representation).utf8CString.prefix(size - 1)) + [0]
  pub.withUnsafeBufferPointer { out.update(from: $0.baseAddress!, count: pub.count) }
}

@objc(YonderCarScene)
final class YonderCarScene: UIResponder, CPTemplateApplicationSceneDelegate, CPTabBarTemplateDelegate {
  private var ui: CPInterfaceController?
  private lazy var home = CPGridTemplate(
    title: "Yonder",
    gridButtons: [
      CPGridButton(titleVariants: ["Talk"], image: UIImage(named: "CarFace") ?? UIImage(systemName: "waveform")!) { [weak self] _ in
        self?.startCall()
      }
    ])
  private let agents = CPListTemplate(title: "Agents", sections: [])
  private var voice: CPVoiceControlTemplate?
  private var call: CarCall?
  private var link: CarLink?
  // The call starts by itself the first time that the car shows Yonder, when the tab bar is on the screen too.
  private var started = false
  private var rootReady = false
  private var active = false
  private var poll: Timer?
  private var afterStart: [String] = [] // Words for Grok that wait until the call is live.

  // The tab bar holds only grid, information, list and point of interest templates, and another template is an
  // exception at runtime (CarPlay Developer Guide, June 2026). So the Voice tab is a grid with one Talk button, and
  // the voice control template shows over the tab bar while a call runs. The guide also allows the microphone only
  // with the voice control template on the screen.
  func templateApplicationScene(_ scene: CPTemplateApplicationScene, didConnect ui: CPInterfaceController) {
    self.ui = ui
    ui.prefersDarkUserInterfaceStyle = true
    voice = voiceTemplate()
    home.tabTitle = "Voice"
    home.tabImage = UIImage(systemName: "waveform")
    agents.tabTitle = "Agents"
    agents.tabImage = UIImage(systemName: "list.bullet")
    agents.emptyViewTitleVariants = ["No agents"]
    let tabs = CPTabBarTemplate(templates: [home, agents])
    tabs.delegate = self
    ui.setRootTemplate(tabs, animated: false) { ok, error in
      if !ok { return NSLog("Yonder car: the tab bar failed: \(error?.localizedDescription ?? "")") }
      self.rootReady = true
      self.autoStart()
    }
    loadAgents()
    poll = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
      if self?.call == nil { self?.loadAgents() }
    }
  }

  func templateApplicationScene(_ scene: CPTemplateApplicationScene, didDisconnectInterfaceController ui: CPInterfaceController) {
    poll?.invalidate()
    call?.hangUp()
    call = nil
    // The task gets the link now: it runs after `link = nil`, so else the link to the relay never closes.
    let old = link
    link = nil
    Task { await old?.close() }
    self.ui = nil
    started = false
    rootReady = false
    active = false
  }

  // Voice is the first mode of the app, a rule of CarPlay: the call starts when the car shows Yonder.
  func sceneDidBecomeActive(_ scene: UIScene) {
    active = true
    autoStart()
  }

  // The scene can become active before the tab bar is on the screen, and the voice template needs the tab bar under it.
  private func autoStart() {
    guard rootReady, active, !started else { return }
    started = true
    startCall()
  }

  func tabBarTemplate(_ tabBarTemplate: CPTabBarTemplate, didSelect selectedTemplate: CPTemplate) {
    if selectedTemplate === agents, call == nil { loadAgents() }
  }

  // MARK: The call

  private func startCall() {
    guard call == nil, let ui, let voice else { return }
    guard let pairing = CarStore.pairing() else {
      return alert("Yonder is not paired with a Mac.")
    }
    let link = currentLink(pairing)
    let call = CarCall(link: link, pairing: pairing)
    self.call = call
    endPhoneCall()
    call.onState = { [weak self] state in self?.show(state) }
    call.onAgents = { [weak self] list in self?.showAgents(list) }
    // A weak call, as on the watch: the call keeps this closure, so a strong call kept each call and its audio engine.
    call.onEnd = { [weak self, weak call] reason in
      if let call { self?.ended(call, reason) }
    }
    // The microphone starts only with the voice template on the screen, a rule of CarPlay.
    let present = {
      ui.presentTemplate(voice, animated: true) { ok, error in
        guard ok else {
          self.call = nil
          self.afterStart = []
          return self.alert("The voice screen did not open. \(error?.localizedDescription ?? "")")
        }
        self.show(.connecting)
        Task { @MainActor in
          do {
            try await call.start()
            self.afterStart.forEach(call.tell)
            self.afterStart = []
          } catch {
            // The hang up stops the audio that the start opened, then ends the call (`onEnd`), as on the watch.
            call.hangUp(error.localizedDescription)
          }
        }
      }
    }
    // An alert can be on the screen, and only one template shows over the tab bar at a time.
    if ui.presentedTemplate != nil {
      ui.dismissTemplate(animated: false) { _, _ in present() }
    } else {
      present()
    }
  }

  private func ended(_ call: CarCall, _ reason: String?) {
    guard self.call === call else { return }
    self.call = nil
    afterStart = []
    let then = { if let reason { self.alert(reason) } }
    if ui?.presentedTemplate != nil {
      ui?.dismissTemplate(animated: true) { _, _ in then() }
    } else {
      then()
    }
    loadAgents()
  }

  private func currentLink(_ pairing: CarPairing) -> CarLink {
    if let link { return link }
    let link = CarLink(pairing: pairing, key: CarStore.key())
    self.link = link
    return link
  }

  // One call runs at a time: a call in the car ends the call of the phone app (`window.yonderCall` in src/App.tsx).
  private func endPhoneCall() {
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
    windows.lazy.compactMap(findWebView).first?.evaluateJavaScript("window.yonderCall?.(\"end\")")
  }

  private func toggleMute() {
    guard let call else { return }
    call.mute(!call.muted)
  }

  // A tap on an agent: a call starts, and Grok says what the agent did or what it needs.
  private func tapped(_ num: Int) {
    let note =
      "[Yonder app] The user tapped agent \(num) on the car screen. Call get_worker for agent \(num), "
      + "and say in one or two sentences what it did or what it needs from the user."
    if let call, call.state != .connecting {
      call.tell(note)
    } else {
      afterStart.append(note)
      startCall()
    }
  }

  // MARK: The screen

  // The Yonder face, the state, and the Mute and End buttons.
  private func voiceTemplate() -> CPVoiceControlTemplate {
    let face = UIImage(named: "CarFace") ?? UIImage(systemName: "waveform")
    let mute = button("mic.slash.fill", "Mute", .white) { [weak self] in self?.toggleMute() }
    let unmute = button("mic.fill", "Unmute", .white) { [weak self] in self?.toggleMute() }
    let end = button("xmark", "End", .systemRed) { [weak self] in self?.call?.hangUp() }
    return CPVoiceControlTemplate(voiceControlStates: [
      state("thinking", ["One moment"], face, [mute, end]),
      state("listening", ["Listening"], face, [mute, end]),
      state("speaking", ["Speaking"], face, [mute, end]),
      state("muted", ["Muted"], face, [unmute, end]),
    ])
  }

  private func state(_ id: String, _ titles: [String], _ image: UIImage?, _ buttons: [CPButton]) -> CPVoiceControlState {
    let state = CPVoiceControlState(identifier: id, titleVariants: titles, image: image, repeats: true)
    if #available(iOS 26.4, *) { state.actionButtons = buttons }
    return state
  }

  private func button(_ symbol: String, _ title: String, _ color: UIColor, _ action: @escaping () -> Void) -> CPButton {
    let image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 28, weight: .semibold))!
      .withTintColor(color, renderingMode: .alwaysOriginal)
    let button = CPButton(image: image) { _ in action() }
    button.title = title
    return button
  }

  private func show(_ state: CarCall.State) {
    switch state {
    case .connecting, .thinking: voice?.activateVoiceControlState(withIdentifier: "thinking")
    case .listening: voice?.activateVoiceControlState(withIdentifier: "listening")
    case .speaking: voice?.activateVoiceControlState(withIdentifier: "speaking")
    case .muted: voice?.activateVoiceControlState(withIdentifier: "muted")
    case .ended: break
    }
  }

  // The text of a problem, such as "Yonder is not paired with a Mac". The guide of CarPlay forbids an instruction to
  // pick up the iPhone, so the words only tell the problem.
  private func alert(_ text: String) {
    guard let ui else { return }
    let alert = CPAlertTemplate(titleVariants: [text], actions: [
      CPAlertAction(title: "OK", style: .cancel) { _ in ui.dismissTemplate(animated: true) { _, _ in } }
    ])
    ui.presentTemplate(alert, animated: true) { _, _ in }
  }

  private func loadAgents() {
    guard let pairing = CarStore.pairing() else { return }
    let link = currentLink(pairing)
    Task { @MainActor in
      guard let (status, body) = try? await link.fetch("/car"), status == 200,
        let car = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
      else { return }
      showAgents(car["agents"] as? [[String: Any]] ?? [])
      // The word of the user for an agent, such as "Helpers" (agentName in config.json of the bridge). A bridge from before
      // it gives none, and the tab keeps "Agents".
      if let word = car["word"] as? [String: Any], let many = word["many"] as? String, !many.isEmpty {
        agents.tabTitle = many
        agents.emptyViewTitleVariants = ["No \(many.lowercased())"]
      }
    }
  }

  // Each row: the name of the agent, its project and its status. No result text:
  // the guide says "Never show the content of messages, texts, or emails on the CarPlay screen."
  private func showAgents(_ list: [[String: Any]]) {
    let items = list.prefix(Int(CPListTemplate.maximumItemCount)).compactMap { agent -> CPListItem? in
      guard let num = agent["num"] as? Int else { return nil }
      let status = agent["status"] as? String ?? ""
      let item = CPListItem(
        text: agent["name"] as? String ?? "Agent \(num)", detailText: "\(agent["project"] as? String ?? "") · \(status)",
        image: icon(status))
      item.accessoryType = .disclosureIndicator
      item.handler = { [weak self] _, done in
        self?.tapped(num)
        done()
      }
      return item
    }
    agents.updateSections([CPListSection(items: items)])
    agents.showsTabBadge = list.contains { $0["news"] as? Bool == true }
  }

  // A white symbol on a square of the color of the status.
  private func icon(_ status: String) -> UIImage {
    let (symbol, color): (String, UIColor) =
      switch status {
      case "Waits for you": ("ellipsis", .systemOrange)
      case "Done": ("checkmark", .systemGreen)
      case "Failed": ("xmark", .systemRed)
      default: ("arrow.trianglehead.clockwise", .systemBlue)
      }
    let size = CPListItem.maximumImageSize
    let format = UIGraphicsImageRendererFormat()
    format.scale = ui?.carTraitCollection.displayScale ?? 2
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      let rect = CGRect(origin: .zero, size: size)
      color.setFill()
      UIBezierPath(roundedRect: rect, cornerRadius: size.width * 0.22).fill()
      let config = UIImage.SymbolConfiguration(pointSize: size.width * 0.45, weight: .bold)
      if let mark = UIImage(systemName: symbol, withConfiguration: config)?.withTintColor(.white, renderingMode: .alwaysOriginal) {
        mark.draw(at: CGPoint(x: (size.width - mark.size.width) / 2, y: (size.height - mark.size.height) / 2))
      }
    }
  }
}
