// The Live Activity of Yonder: the favicon and the name of the project on the screen, the counts of
// the agents, and the mute and end buttons of the call,
// in the Dynamic Island and on the Lock Screen. The app starts it during a call (src/App.tsx and Sources/yonder-ios/Island.swift).
import ActivityKit
import SwiftUI
import WidgetKit

@main
struct YonderIsland: WidgetBundle {
    var body: some Widget {
        YonderActivity()
        // The Talk buttons outside the app (TalkWidgets.swift).
        TalkWidget()
        if #available(iOS 18.0, *) {
            TalkControl()
        }
    }
}

// The red of the app icon, and the colors of the dark theme of the app (src/app.css), because the Dynamic Island is black.
private let red = Color(red: 0xE5 / 255, green: 0x48 / 255, blue: 0x4D / 255)
private let blue = Color(red: 0x6A / 255, green: 0xA2 / 255, blue: 0xFF / 255)
private let green = Color(red: 0x3F / 255, green: 0xBF / 255, blue: 0x7F / 255)

struct YonderActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: YonderAttributes.self) { context in
            // The Lock Screen, and the banner on an iPhone without the Dynamic Island. The counts with words get
            // their own row, because next to the buttons they wrapped ("runnin g").
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    Favicon(state: context.state, size: 40)
                    Text(context.state.project.isEmpty ? "Yonder" : context.state.project).font(.headline).lineLimit(1)
                    Spacer(minLength: 0)
                    CallButtons(muted: context.state.muted)
                }
                Counts(state: context.state, words: true)
            }
            .padding(16)
            .foregroundStyle(.white)
            .activityBackgroundTint(.black.opacity(0.8))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        Favicon(state: context.state, size: 28)
                        Text(context.state.project.isEmpty ? "Yonder" : context.state.project).font(.headline).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    CallButtons(muted: context.state.muted)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Counts(state: context.state, words: true)
                }
            } compactLeading: {
                // The corners of the island cut a tile or a number at the edge, so both ends keep a gap.
                Favicon(state: context.state, size: 22).padding(.leading, 4)
            } compactTrailing: {
                Counts(state: context.state, words: false).padding(.trailing, 6)
            } minimal: {
                Favicon(state: context.state, size: 22)
            }
            .keylineTint(red)
        }
    }
}

// The counts in the order of the app: running (a red dot), waiting on you (a blue question mark) and done
// (a green check mark). Running and waiting show only when they are more than 0.
struct Counts: View {
    let state: YonderAttributes.ContentState
    let words: Bool

    var body: some View {
        HStack(spacing: words ? 14 : 6) {
            if state.running > 0 { count(state.running, "circle.fill", red, "running") }
            if state.waiting > 0 { count(state.waiting, "questionmark", blue, "waiting") }
            count(state.done, "checkmark", green, "done")
        }
        .font(.system(size: words ? 15 : 14, weight: .semibold, design: .rounded).monospacedDigit())
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }

    func count(_ n: Int, _ symbol: String, _ color: Color, _ word: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: symbol)
                .font(.system(size: symbol == "circle.fill" ? 7 : 11, weight: .bold))
                .foregroundStyle(color)
            Text(words ? "\(n) \(word)" : "\(n)")
        }
    }
}

// The mute and end buttons of the call. A tap runs CallIntent in the app. The mute button is white while the call
// is muted, as the mute button of the app. Buttons in a Live Activity need iOS 17.
struct CallButtons: View {
    let muted: Bool

    var body: some View {
        if #available(iOS 17.0, *) {
            HStack(spacing: 10) {
                Button(intent: CallIntent("mute")) {
                    circle(muted ? "mic.slash.fill" : "mic.fill", fill: muted ? .white : .white.opacity(0.2), icon: muted ? .black : .white)
                }
                .accessibilityLabel(muted ? "Unmute" : "Mute")
                Button(intent: CallIntent("end")) {
                    circle("phone.down.fill", fill: red, icon: .white)
                }
                .accessibilityLabel("End call")
            }
            .buttonStyle(.plain)
        }
    }

    func circle(_ symbol: String, fill: Color, icon: Color) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(icon)
            .frame(width: 40, height: 40)
            .background(Circle().fill(fill))
    }
}

// The favicon of the project on the screen. The Yonder tile shows only when the project has no favicon.
struct Favicon: View {
    let state: YonderAttributes.ContentState
    let size: CGFloat

    var body: some View {
        if let data = Data(base64Encoded: state.icon), let image = UIImage(data: data) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
        } else {
            Tile(size: size)
        }
    }
}

// The Yonder icon: the bird of the app icon (Assets.xcassets/Bird, a copy of AppIcon-40x40) on its red tile.
struct Tile: View {
    let size: CGFloat

    var body: some View {
        Image("Bird")
            .resizable()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.32, style: .continuous))
    }
}
