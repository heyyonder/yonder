// The share extension of Yonder: share a link, such as a post on X or Instagram, or photos, videos and documents, from
// any app, with a message. It starts a new agent with them, or sends them to an agent. It talks to the bridge as the car call does: CarLink with
// the pairing and the key of CarStore. The app keeps them in the Keychain group of the app, which this extension can
// read (YonderShare.entitlements). See "The share extension" in docs/mobile.md.
import SwiftUI
import UIKit
import UniformTypeIdentifiers

@objc(ShareViewController)
final class ShareViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    let host = UIHostingController(rootView: ShareView(model: ShareModel(context: extensionContext)))
    addChild(host)
    host.view.frame = view.bounds
    host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(host.view)
    host.didMove(toParent: self)
  }
}

@MainActor @Observable
final class ShareModel {
  struct Agent: Identifiable {
    let num: Int
    let name: String
    let project: String
    var id: Int { num }
  }

  // A photo, a video or a document of the share: a copy in the temp folder of the extension.
  struct Attached: Hashable {
    let url: URL
    let movie: Bool
    var size: Int64 { Int64((try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0) }
  }

  var shared = "" // The link or the text from the other app.
  var files: [Attached] = []
  var message = ""
  var agents: [Agent] = []
  var target = 0 // The number of the agent, or 0 for a new agent.
  var sending = false
  var progress: Double? // The part of the files that went, while they go.
  var problem: String?
  @ObservationIgnored private let context: NSExtensionContext?
  @ObservationIgnored private let link: CarLink?

  init(context: NSExtensionContext?) {
    self.context = context
    link = CarStore.pairing().map { CarLink(pairing: $0, key: CarStore.key()) }
    if link == nil { problem = "Open Yonder on this iPhone and pair it with your Mac first." }
  }

  var canSend: Bool { link != nil && !sending && !(shared.isEmpty && message.trimmed.isEmpty && files.isEmpty) }

  // The view starts it (`task`), so that the init does no work.
  func load() async {
    shared = await content()
    files = await attachments()
    guard let link else { return }
    do {
      let list = try JSONSerialization.jsonObject(with: Data(try await link.callTool("list_workers", [:]).utf8)) as? [[String: Any]] ?? []
      // The agents of Yonder that are not closed. Terminal and background sessions have a kind.
      agents = list.filter { $0["kind"] == nil && $0["status"] as? String != "closed" }.prefix(30).compactMap {
        guard let num = $0["num"] as? Int else { return nil }
        return Agent(num: num, name: $0["name"] as? String ?? "", project: $0["project"] as? String ?? "")
      }
    } catch {
      problem = error.localizedDescription
    }
  }

  private var providers: [NSItemProvider] { (context?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] } }

  // The first link of the share, else its text. A shared file also has a file URL, and goes as a file.
  private func content() async -> String {
    for type in [UTType.url, UTType.plainText] {
      for provider in providers where provider.hasItemConformingToTypeIdentifier(type.identifier) {
        let item = try? await provider.loadItem(forTypeIdentifier: type.identifier)
        if let url = item as? URL, !url.isFileURL { return url.absoluteString }
        if let text = item as? String, !text.isEmpty { return text }
      }
    }
    return ""
  }

  // The photos, videos and documents of the share, such as a video of the Photos app or a PDF of the Files app.
  private func attachments() async -> [Attached] {
    var out: [Attached] = []
    for provider in providers {
      let types = provider.registeredTypeIdentifiers.compactMap { UTType($0) }
      guard let type = types.first(where: { $0.conforms(to: .data) && !$0.conforms(to: .url) && !$0.conforms(to: .text) }),
        let url = await copy(provider, type)
      else { continue }
      out.append(Attached(url: url, movie: type.conforms(to: .movie)))
    }
    return out
  }

  // The file of the other app is there only during the callback, so the extension copies it.
  private func copy(_ provider: NSItemProvider, _ type: UTType) async -> URL? {
    await withCheckedContinuation { done in
      _ = provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
        guard let url else { return done.resume(returning: nil) }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let to = dir.appendingPathComponent(url.lastPathComponent)
        do {
          try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
          try FileManager.default.copyItem(at: url, to: to)
          done.resume(returning: to)
        } catch {
          done.resume(returning: nil)
        }
      }
    }
  }

  // One file to the bridge, in parts of 768 KB, because the relay takes 1 MiB at most for each request of the phone. The
  // original goes. A video goes to /video, which makes its keyframes and the words of its sound. The last part gives the
  // path on the Mac. `before` is the bytes of the files that went before, for the progress.
  // shortcut: one part at a time, because the bridge adds each part to the end of the file; with writes at an offset,
  // four parts could go at once and save the time of the trips to the relay.
  private func upload(_ file: Attached, _ link: CarLink, before: Int64, of total: Int64) async throws -> String {
    let handle = try FileHandle(forReadingFrom: file.url)
    defer { try? handle.close() }
    let size = file.size
    let id = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    let name = file.url.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "file"
    let type = file.movie ? (file.url.pathExtension.lowercased() == "mov" ? "video/quicktime" : "video/mp4") : "application/octet-stream"
    var at: Int64 = 0
    while true {
      let part = try handle.read(upToCount: 768 * 1024) ?? Data()
      at += Int64(part.count)
      let end = at >= size ? "&end" : ""
      let path = file.movie ? "/video?id=\(id)\(end)" : "/file?name=\(name)&id=\(id)\(end)"
      let (status, body) = try await link.fetch(path, method: "POST", headers: ["content-type": type], body: part)
      guard status == 200 else { throw CarError(String(decoding: body.prefix(300), as: UTF8.self)) }
      progress = Double(before + at) / Double(max(total, 1))
      guard !end.isEmpty else { continue }
      guard let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any], let made = json["path"] as? String else {
        throw CarError("The Mac did not keep \(file.url.lastPathComponent).")
      }
      return made
    }
  }

  func send() async {
    guard let link else { return }
    // The other app can also put the link in the text.
    var text = [message.trimmed, message.contains(shared) ? "" : shared].filter { !$0.isEmpty }.joined(separator: "\n\n")
    if text.isEmpty { text = "See the attached files." }
    sending = true
    problem = nil
    do {
      // The files go first. The agent gets their paths on the Mac in `files`, with the message.
      var paths: [String] = []
      let total = files.reduce(Int64(0)) { $0 + $1.size }
      for file in files {
        paths.append(try await upload(file, link, before: files.prefix(paths.count).reduce(Int64(0)) { $0 + $1.size }, of: total))
      }
      // No project and no name: the bridge picks the project of the task and gives the agent a title.
      var args: [String: Any] = target == 0 ? ["project": "", "name": "", "task": text] : ["worker": String(target), "message": text]
      if !paths.isEmpty { args["files"] = paths }
      _ = try await link.callTool(target == 0 ? "start_worker" : "message_worker", args)
      await link.close()
      clean()
      context?.completeRequest(returningItems: nil)
    } catch {
      problem = error.localizedDescription
      sending = false
      progress = nil
    }
  }

  // The copies of the files go when the share ends.
  private func clean() {
    for file in files { try? FileManager.default.removeItem(at: file.url.deletingLastPathComponent()) }
  }

  func cancel() {
    clean()
    Task { await link?.close() }
    context?.cancelRequest(withError: CocoaError(.userCancelled))
  }
}

struct ShareView: View {
  @Bindable var model: ShareModel

  var body: some View {
    NavigationStack {
      Form {
        if !model.shared.isEmpty || !model.files.isEmpty {
          Section {
            if !model.shared.isEmpty { Text(model.shared).font(.footnote).foregroundStyle(.secondary).lineLimit(4) }
            ForEach(model.files, id: \.self) { Text($0.url.lastPathComponent).font(.footnote).foregroundStyle(.secondary).lineLimit(1) }
          }
        }
        Section {
          TextField("Add a message", text: $model.message, axis: .vertical).lineLimit(3...8)
        }
        Section {
          Picker("Send to", selection: $model.target) {
            Text("New agent").tag(0)
            ForEach(model.agents) { agent in
              VStack(alignment: .leading) {
                Text("\(agent.num). \(agent.name)")
                Text(agent.project).font(.caption).foregroundStyle(.secondary)
              }
              .tag(agent.num)
            }
          }
          .pickerStyle(.inline)
        } footer: {
          if let problem = model.problem { Text(problem).foregroundStyle(.red) }
        }
      }
      .navigationTitle("Yonder")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: model.cancel) }
        ToolbarItem(placement: .confirmationAction) {
          if let progress = model.progress {
            Text("\(Int(progress * 100))%").monospacedDigit()
          } else if model.sending {
            ProgressView()
          } else {
            Button("Send", action: send).disabled(!model.canSend)
          }
        }
      }
    }
    .task { await model.load() }
  }

  private func send() {
    Task { await model.send() }
  }
}

extension String {
  fileprivate var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
