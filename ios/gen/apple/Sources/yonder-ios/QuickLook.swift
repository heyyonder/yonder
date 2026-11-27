// Quick Look, the viewer of iOS, for a picture or a video of the chat: a pinch zooms, a swipe down closes, a video plays
// in the player of iOS, and Share sends the file. The `quick_look` command of ios/src/lib.rs writes the file of the page
// and calls this.
import AVKit
import QuickLook
import UIKit

// Returns false for a file that Quick Look cannot show: the page then opens its own viewer.
@_cdecl("yonder_quick_look")
public func yonderQuickLook(_ path: UnsafePointer<CChar>) -> Bool {
    let url = URL(fileURLWithPath: String(cString: path))
    guard QLPreviewController.canPreview(url as NSURL) else { return false }
    Task { @MainActor in QuickLook.shared.show(url) }
    return true
}

@MainActor
final class QuickLook: NSObject {
    static let shared = QuickLook()
    private var url: URL?

    func show(_ url: URL) {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        guard var top = windows.first(where: \.isKeyWindow)?.rootViewController ?? windows.first?.rootViewController else { return }
        while let shown = top.presentedViewController { top = shown }
        self.url = url
        let preview = QLPreviewController()
        preview.dataSource = self
        preview.delegate = self
        top.present(preview, animated: true)
    }
}

// UIKit calls these on the main thread.
extension QuickLook: QLPreviewControllerDataSource, @preconcurrency QLPreviewControllerDelegate {
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { url == nil ? 0 : 1 }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        (url ?? URL(fileURLWithPath: "/")) as NSURL
    }

    // The file is a copy for the viewer, so it goes when the viewer closes.
    func previewControllerDidDismiss(_ controller: QLPreviewController) {
        if let url { try? FileManager.default.removeItem(at: url) }
        url = nil
    }
}

// The player of iOS for a video of the chat (`play_video` in ios/src/lib.rs): large buttons that skip back and forward
// 10 seconds, play and pause, the bar, AirPlay and Picture in Picture. It turns with the phone, so a wide video fills the
// screen on its side, while the app behind it stays upright (the "Yonder patch" in ios/tao/src/platform/ios.rs).
// `source` is the path of a file or the URL of the web, which the player streams.
@_cdecl("yonder_play_video")
public func yonderPlayVideo(_ source: UnsafePointer<CChar>) -> Bool {
    let text = String(cString: source)
    guard let url = text.hasPrefix("/") ? URL(fileURLWithPath: text) : URL(string: text) else { return false }
    Task { @MainActor in
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        guard var top = windows.first(where: \.isKeyWindow)?.rootViewController ?? windows.first?.rootViewController else { return }
        while let shown = top.presentedViewController { top = shown }
        // The sound plays also when the switch of the phone is on silent, as in the web view. A live call or a
        // dictation keeps its own audio.
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord { try? session.setCategory(.playback, mode: .moviePlayback) }
        let player = AVPlayerViewController()
        player.player = AVPlayer(url: url)
        player.modalPresentationStyle = .fullScreen
        top.present(player, animated: true) { player.player?.play() }
    }
    return true
}
