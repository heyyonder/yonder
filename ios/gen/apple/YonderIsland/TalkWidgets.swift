// The Talk buttons outside the app: a control for Control Center and the Action button (iOS 18), and a round widget for
// the Lock Screen. Each one runs StartCallIntent, which opens Yonder and starts a call.
import AppIntents
import SwiftUI
import WidgetKit

@available(iOS 18.0, *)
struct TalkControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.vladartym.yonder.talk") {
            ControlWidgetButton(action: StartCallIntent()) {
                Label("Talk to Yonder", systemImage: "mic.fill")
            }
        }
        .displayName("Talk to Yonder")
        .description("Start a voice call with Yonder.")
    }
}

struct TalkWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.vladartym.yonder.talk-widget", provider: TalkTimeline()) { _ in
            TalkWidgetView()
        }
        .configurationDisplayName("Talk to Yonder")
        .description("Start a voice call with Yonder.")
        .supportedFamilies([.accessoryCircular])
    }
}

// The widget never changes, so its timeline has one entry.
struct TalkTimeline: TimelineProvider {
    struct Entry: TimelineEntry {
        let date: Date
    }

    func placeholder(in context: Context) -> Entry { Entry(date: .now) }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now)) }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [Entry(date: .now)], policy: .never))
    }
}

struct TalkWidgetView: View {
    var body: some View {
        Button("Talk to Yonder", systemImage: "mic.fill", intent: StartCallIntent())
            .labelStyle(.iconOnly)
            .font(.title2)
            .buttonStyle(.plain)
            .containerBackground(for: .widget) { AccessoryWidgetBackground() }
    }
}
