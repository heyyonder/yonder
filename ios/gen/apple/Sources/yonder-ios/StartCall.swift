// The app side of StartCallIntent: the page starts the call (`window.yonderCall("start")` in src/App.tsx). After a cold
// start the page is not there yet, so this tries again every half second, for 15 seconds. `run` of ios/src/lib.rs
// calls `yonder_intents` before the app starts, so the handler is set before iOS runs the intent.
import AppIntents
import UIKit
import WebKit

@_cdecl("yonder_intents")
public func yonderIntents() {
    StartCallIntent.handler = { startCall(tries: 30) }
}

@MainActor
private func startCall(tries: Int) {
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
    guard let web = windows.lazy.compactMap(findWebView).first else { return later(tries) }
    web.evaluateJavaScript("typeof window.yonderCall === 'function' ? (window.yonderCall('start'), true) : false") { result, _ in
        if result as? Bool != true { Task { @MainActor in later(tries) } }
    }
}

@MainActor
private func later(_ tries: Int) {
    guard tries > 0 else { return }
    Task { @MainActor in
        try? await Task.sleep(for: .milliseconds(500))
        startCall(tries: tries - 1)
    }
}

// "Talk to Yonder" for Siri, Spotlight, Shortcuts and the Action button.
struct YonderShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartCallIntent(),
            phrases: ["Talk to \(.applicationName)", "Call \(.applicationName)", "Start a call with \(.applicationName)"],
            shortTitle: "Talk",
            systemImageName: "mic.fill"
        )
    }
}
