// The screens of the Apple Watch app (docs/watch.md), as the car screen (CarPlay.swift): the Talk button with the
// Yonder face, the list of the agents under it, and during a call the face, the state, Mute and End.
import SwiftUI

@main
struct YonderWatchApp: App {
  @StateObject private var model = WatchModel.shared

  var body: some Scene {
    WindowGroup {
      if let state = model.state {
        CallScreen(model: model, state: state)
      } else {
        Home(model: model)
      }
    }
  }
}

struct Home: View {
  @ObservedObject var model: WatchModel

  var body: some View {
    NavigationStack {
      List {
        Button(action: talk) {
          VStack(spacing: 4) {
            // Decorative: VoiceOver reads only "Talk", not the name of the image.
            Image(decorative: "Face").resizable().scaledToFit().frame(height: 96)
            Text("Talk").font(.headline)
          }
          .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .listRowBackground(Color.clear)
        if let problem = model.problem ?? (model.paired ? nil : "Open Yonder on the iPhone to link this watch.") {
          Text(problem).font(.footnote).foregroundStyle(.secondary).listRowBackground(Color.clear)
        }
        Text("Version \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")")
          .font(.footnote).foregroundStyle(.secondary).listRowBackground(Color.clear)
        if !model.agents.isEmpty {
          Section("Agents") {
            ForEach(model.agents) { agent in
              Button { model.open(agent) } label: { AgentRow(agent: agent) }
            }
          }
        }
      }
      .navigationTitle("Yonder")
    }
  }

  private func talk() {
    model.talk()
  }
}

struct AgentRow: View {
  let agent: WatchModel.Agent

  var body: some View {
    HStack(spacing: 8) {
      Circle().fill(color).frame(width: 8, height: 8)
      VStack(alignment: .leading, spacing: 1) {
        Text(agent.name).font(.body).lineLimit(2)
        Text("\(agent.project) · \(agent.status)").font(.footnote).foregroundStyle(.secondary).lineLimit(1)
      }
    }
  }

  // The colors of the status, as the icons of the car screen.
  private var color: Color {
    switch agent.status {
    case "Waits for you": .orange
    case "Done": .green
    case "Failed": .red
    default: .blue
    }
  }
}

struct CallScreen: View {
  @ObservedObject var model: WatchModel
  let state: CarCall.State
  // With Reduce Motion, the face does not pulse and the bars stay low.
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(spacing: 6) {
      Image(decorative: "Face").resizable().scaledToFit().frame(maxHeight: 90)
        .scaleEffect(state == .speaking && !reduceMotion ? 1.06 : 1)
        .animation(state == .speaking && !reduceMotion ? .easeInOut(duration: 0.6).repeatForever() : .default, value: state)
      Wave(active: !reduceMotion && (state == .speaking || state == .listening), tint: state == .speaking ? .orange : .blue)
      Text(model.caption.isEmpty ? words : model.caption)
        .font(model.caption.isEmpty ? .headline : .footnote)
        .multilineTextAlignment(.center).lineLimit(3)
        .animation(.default, value: model.caption)
      HStack(spacing: 12) {
        Button(model.muted ? "Unmute" : "Mute", systemImage: model.muted ? "mic.fill" : "mic.slash.fill", action: model.toggleMute)
        // The same symbol as the End button of the Live Activity and of the system call screen.
        Button("End", systemImage: "phone.down.fill", role: .destructive, action: model.end)
          .tint(.red)
      }
      .labelStyle(.iconOnly)
    }
  }

  private var words: String {
    switch state {
    case .connecting, .thinking: "One moment"
    case .listening: "Listening"
    case .speaking: "Speaking"
    case .muted: "Muted"
    case .ended: ""
    }
  }
}

// Bars that move while Grok speaks (orange) or listens (blue), and stay low otherwise.
struct Wave: View {
  let active: Bool
  let tint: Color

  var body: some View {
    TimelineView(.animation(paused: !active)) { time in
      let t = time.date.timeIntervalSinceReferenceDate
      HStack(spacing: 3) {
        ForEach(0..<7, id: \.self) { i in
          let level = active ? 0.3 + 0.7 * abs(sin(t * 5 + Double(i) * 0.9)) : 0.15
          Capsule().fill(tint).frame(width: 4, height: 4 + 16 * level)
        }
      }
      .frame(height: 20)
    }
  }
}
