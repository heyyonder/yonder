// Starts a voice call with Yonder from outside the app: the Talk button of Control Center and of the Action button, the
// Talk widget of the Lock Screen, Siri ("Talk to Yonder") and Shortcuts. iOS opens the app, and the app starts the call of
// the page (StartCall.swift sets `handler`). The app and the widget extension both compile this file, as CallIntent.
import AppIntents

struct StartCallIntent: AppIntent {
    static var title: LocalizedStringResource = "Talk to Yonder"
    static var description = IntentDescription("Start a voice call with Yonder.")
    static var openAppWhenRun = true
    // Set by the app. In the extension it stays nil, and iOS runs the intent in the app, because it opens the app.
    static var handler: (@MainActor () -> Void)?

    func perform() async throws -> some IntentResult {
        await MainActor.run { StartCallIntent.handler?() }
        return .result()
    }
}
