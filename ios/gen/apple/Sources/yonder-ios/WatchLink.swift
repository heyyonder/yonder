// The link of the iPhone app to its Apple Watch app (docs/watch.md). The watch has no camera for the QR code, and it
// has its own Keychain. So the phone gives the watch the pairing of the Mac, and gets the public key of the watch,
// which the web app gives to the Mac (`linkCar` in src/bridge.ts). Both sides use the application context of
// WatchConnectivity: it keeps only the last value, and it arrives when the other app runs.
import UIKit
import WatchConnectivity
import WebKit

final class WatchLink: NSObject, WCSessionDelegate {
  static let shared = WatchLink()

  // The public key of the watch, from its last context. It is not a secret.
  var key: String { UserDefaults.standard.string(forKey: "watchKey") ?? "" }

  // Activates the session, and gives the pairing of CarStore to the watch.
  func start() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    if session.delegate == nil { session.delegate = self }
    if session.activationState == .activated { send(session) } else { session.activate() }
  }

  private func send(_ session: WCSession) {
    guard session.isPaired, session.isWatchAppInstalled, let pairing = CarStore.pairing(), let data = try? JSONEncoder().encode(pairing)
    else { return }
    try? session.updateApplicationContext(["pairing": data])
  }

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    guard state == .activated else { return }
    send(session)
    take(session.receivedApplicationContext)
  }

  func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) { take(context) }

  // A new key of the watch: the web app runs `linkCar` again, and gives the key to the Mac.
  private func take(_ context: [String: Any]) {
    guard let key = context["key"] as? String, !key.isEmpty, key != self.key else { return }
    UserDefaults.standard.set(key, forKey: "watchKey")
    DispatchQueue.main.async {
      let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
      windows.lazy.compactMap(findWebView).first?.evaluateJavaScript("window.yonderLinkCar?.()")
    }
  }

  // The user installs the watch app, or pairs another watch.
  func sessionWatchStateDidChange(_ session: WCSession) { send(session) }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
}

// The `watch_link` command of ios/src/lib.rs calls this after `car_link`: it gives the pairing to the watch, and `out`
// gets the public key of the watch in base64url with a 0 at the end, or only a 0 before the watch app first ran.
@_cdecl("yonder_watch_link")
public func yonderWatchLink(_ out: UnsafeMutablePointer<CChar>, _ size: Int) {
  WatchLink.shared.start()
  let pub = Array(WatchLink.shared.key.utf8CString.prefix(size - 1)) + [0]
  pub.withUnsafeBufferPointer { out.update(from: $0.baseAddress!, count: pub.count) }
}
