// The data of the Live Activity of Yonder: the counts of the agents, if the call is muted, and the name and the
// favicon of the project on the screen. The app (Sources/yonder-ios/Island.swift)
// and the widget extension (YonderIsland.swift) both compile this file, because iOS finds the type by its name.
import ActivityKit

@available(iOS 16.2, *)
struct YonderAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var running: Int
        var waiting: Int
        var done: Int
        var muted: Bool
        var project: String
        var icon: String // A PNG in base64, or "". The widget cannot load files of the app, so the image comes with the data.
    }
}
