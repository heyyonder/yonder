// The mute and end buttons of the Live Activity. The app and the widget extension both compile this file. iOS runs
// a LiveActivityIntent in the process of the app, where Island.swift sets `CallIntent.handler`. In the extension,
// the handler stays nil.
import ActivityKit
import AppIntents

@available(iOS 17.0, *)
struct CallIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Yonder call"
    // Only the buttons run it, so it does not show in Shortcuts or Spotlight.
    static var isDiscoverable = false
    static var handler: ((String) -> Void)?

    // "mute" mutes or unmutes the microphone, "end" ends the call.
    @Parameter(title: "Action") var action: String

    init() {}
    init(_ action: String) { self.action = action }

    func perform() async throws -> some IntentResult {
        let action = action
        let ran = await MainActor.run { () -> Bool in
            guard let handler = CallIntent.handler else { return false }
            handler(action)
            return true
        }
        // With no handler, iOS started the app only for this tap, after the app of the call stopped. So no call runs,
        // and the tap ends the activity that stayed. Else the tap does nothing.
        if !ran {
            for activity in Activity<YonderAttributes>.activities { await activity.end(nil, dismissalPolicy: .immediate) }
        }
        return .result()
    }
}
