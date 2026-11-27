// The Live Activity of Yonder in the Dynamic Island: the Yonder icon, the project, the counts of the agents, and the
// mute and end buttons of the call. The `island` command of ios/src/lib.rs calls this function. A running count below 0 ends the
// activity. The views are in the widget extension (YonderIsland/YonderIsland.swift).
import ActivityKit
import AVFoundation
import Photos
import UIKit
import WebKit

// The last state that the activity got. `activity.content.state` changes only when an update is done, so else a quick
// mute and unmute skips the unmute, and the Lock Screen can show "muted" during the call.
private var lastIsland: YonderAttributes.ContentState?

@_cdecl("yonder_island")
public func yonderIsland(_ running: Int32, _ waiting: Int32, _ done: Int32, _ muted: Bool, _ project: UnsafePointer<CChar>, _ icon: UnsafePointer<CChar>) {
    guard #available(iOS 16.2, *) else { return }
    if #available(iOS 17.0, *), CallIntent.handler == nil { CallIntent.handler = callAction }
    let activities = Activity<YonderAttributes>.activities
    guard running >= 0 else {
        lastIsland = nil
        for activity in activities { Task { await activity.end(nil, dismissalPolicy: .immediate) } }
        return
    }
    let state = YonderAttributes.ContentState(
        running: Int(running), waiting: Int(waiting), done: Int(done), muted: muted,
        project: String(cString: project), icon: String(cString: icon))
    if let activity = activities.first(where: { $0.activityState == .active }) {
        // The updates start on the main actor in their order. A plain task can start on any thread, in any order.
        if lastIsland != state {
            lastIsland = state
            Task { @MainActor in await activity.update(ActivityContent(state: state, staleDate: nil)) }
        }
    } else {
        // iOS starts a Live Activity only while the app is on the screen. In the background this fails, and the next call tries again.
        let started = try? Activity.request(attributes: YonderAttributes(), content: ActivityContent(state: state, staleDate: nil))
        lastIsland = started == nil ? nil : state
    }
}

// A button of the Live Activity (CallIntent) gives its action to the React app: `window.yonderCall` in src/App.tsx.
private func callAction(_ action: String) {
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
    guard let web = windows.lazy.compactMap(findWebView).first else { return }
    web.evaluateJavaScript("window.yonderCall?.(\"\(action == "end" ? "end" : "mute")\")")
}

func findWebView(_ view: UIView) -> WKWebView? {
    if let web = view as? WKWebView { return web }
    return view.subviews.lazy.compactMap(findWebView).first
}

// iOS mutes the haptics while the microphone records, so the buttons gave no tap during a call. The `run` of
// ios/src/lib.rs calls this one time, before the web view starts the microphone.
@_cdecl("yonder_haptics_in_calls")
public func yonderHapticsInCalls() {
    try? AVAudioSession.sharedInstance().setAllowHapticsAndSystemSoundsDuringRecording(true)
}

// The echo cancellation of iOS itself, for the built-in microphone and speaker: iOS 18.2 and later, on certain 2024 or
// later iPhones, with play-and-record and the default mode. A call with it needs no voice processing of WebKit, which
// puts the voice on the call volume (`openMic` in src/voice.ts). The `echo_input` command of ios/src/lib.rs calls this
// one. It returns -1 before iOS 18.2, 1 when the echo cancellation is on, 2 when it is off and the sound does not play
// on the built-in speaker, and 0 when it is off on the built-in speaker.
@_cdecl("yonder_echo_input")
public func yonderEchoInput(_ on: Bool) -> Int32 {
    guard #available(iOS 18.2, *) else { return -1 }
    let session = AVAudioSession.sharedInstance()
    if session.prefersEchoCancelledInput != on { try? session.setPrefersEchoCancelledInput(on) }
    if session.isEchoCancelledInputEnabled { return 1 }
    return session.currentRoute.outputs.contains { $0.portType == .builtInSpeaker } ? 0 : 2
}

// The window behind the web view was black, and it showed under the bar of the keyboard. It gets the `--bg` of
// src/app.css. The `paint_window` command of ios/src/lib.rs calls this one when the theme changes.
// Only the window of the web view: the text-effects window of UIKit floats over the app. A paint of its full-screen
// root view covers the app after each new load of the page, and the user sees a black screen.
@_cdecl("yonder_paint_window")
public func yonderPaintWindow(_ dark: Bool) {
    DispatchQueue.main.async {
        let color = dark ? UIColor(red: 0x16 / 255, green: 0x16 / 255, blue: 0x16 / 255, alpha: 1) : UIColor(red: 0xfb / 255, green: 0xfb / 255, blue: 0xfa / 255, alpha: 1)
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        for window in windows where findWebView(window) != nil {
            window.backgroundColor = color
            var view = window.rootViewController?.view
            while let v = view, !(v is WKWebView) {
                v.backgroundColor = color
                view = v.subviews.count == 1 ? v.subviews.first : nil
            }
            if let web = findWebView(window) {
                hideFormBar(web)
                // The web view and its scroll view were the black of dark mode, and showed at the round top corners of
                // the keyboard. They get the color of the app too.
                web.isOpaque = false
                web.backgroundColor = color
                web.scrollView.backgroundColor = color
                if #available(iOS 15.0, *) { web.underPageBackgroundColor = color }
            }
        }
    }
}

// WebKit puts a bar with up and down arrows and a check over the keyboard of a text field. Signal and Messages have no
// such bar, and the window showed in black around it. The view of the page (WKContentView) gives the bar as its
// inputAccessoryView, so the view gets a subclass whose inputAccessoryView is nil. WebKit has no public setting for it.
private func hideFormBar(_ web: WKWebView) {
    guard let content = web.scrollView.subviews.first(where: { NSStringFromClass(type(of: $0)).hasPrefix("WKContent") }) else { return }
    let base: AnyClass = type(of: content)
    let name = "\(NSStringFromClass(base))_YonderNoBar"
    if NSStringFromClass(base) == name { return }
    var bare: AnyClass? = NSClassFromString(name)
    if bare == nil, let sub = objc_allocateClassPair(base, name, 0) {
        let none: @convention(block) (AnyObject) -> AnyObject? = { _ in nil }
        class_addMethod(sub, #selector(getter: UIResponder.inputAccessoryView), imp_implementationWithBlock(none), "@@:")
        objc_registerClassPair(sub)
        bare = sub
    }
    if let bare { object_setClass(content, bare) }
}

// The recent photos of the attach sheet (`recent_photos` and `photo` of ios/src/lib.rs). Each function writes its
// result to a file in Library/Caches, and `out` gets the path of the file with a 0 at the end, or only a 0 when it
// fails. The web app reads the file with `read_picked`, which deletes it. Rust calls these off the main thread, so
// they can wait for the permission and for the photos.
private func cachesFile(_ ext: String) -> URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("\(UUID().uuidString).\(ext)")
}

func give(_ path: String, _ out: UnsafeMutablePointer<CChar>, _ size: Int) {
    let text = Array(path.utf8CString.prefix(size - 1)) + [0]
    text.withUnsafeBufferPointer { out.update(from: $0.baseAddress!, count: text.count) }
}

// iOS asks the user one time. With limited access, the sheet shows only the photos that the user allowed.
private func photoAccess() -> Bool {
    var status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    if status == .notDetermined {
        let done = DispatchSemaphore(value: 0)
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status = $0; done.signal() }
        done.wait()
    }
    return status == .authorized || status == .limited
}

// The newest photos and videos, newest first: a JSON list of { id, thumb, seconds }. `thumb` is a JPEG data URL
// of 360 px, and `seconds` is the length of a video, or 0 for a photo.
@_cdecl("yonder_recent_photos")
public func yonderRecentPhotos(_ count: Int32, _ out: UnsafeMutablePointer<CChar>, _ size: Int) {
    guard photoAccess() else { return give("", out, size) }
    let fetch = PHFetchOptions()
    fetch.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    fetch.fetchLimit = Int(count)
    fetch.predicate = NSPredicate(format: "mediaType == %d OR mediaType == %d", PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    options.deliveryMode = .highQualityFormat
    options.resizeMode = .fast
    var items: [[String: Any]] = []
    PHAsset.fetchAssets(with: fetch).enumerateObjects { asset, _, _ in
        PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 360, height: 360), contentMode: .aspectFill, options: options) { image, _ in
            guard let data = image?.jpegData(compressionQuality: 0.7) else { return }
            items.append(["id": asset.localIdentifier, "thumb": "data:image/jpeg;base64,\(data.base64EncodedString())", "seconds": asset.mediaType == .video ? asset.duration : 0])
        }
    }
    let file = cachesFile("json")
    guard let data = try? JSONSerialization.data(withJSONObject: items), (try? data.write(to: file)) != nil else { return give("", out, size) }
    give(file.path, out, size)
}

// One photo of the list as a JPEG of 1600 px at most, or one video as its file. iCloud can send it first.
@_cdecl("yonder_photo")
public func yonderPhoto(_ id: UnsafePointer<CChar>, _ out: UnsafeMutablePointer<CChar>, _ size: Int) {
    var path = ""
    if let asset = PHAsset.fetchAssets(withLocalIdentifiers: [String(cString: id)], options: nil).firstObject {
        if asset.mediaType == .video {
            let options = PHVideoRequestOptions()
            options.isNetworkAccessAllowed = true
            let done = DispatchSemaphore(value: 0)
            PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { video, _, _ in
                // A slow-motion video comes as a composition without one file, and fails.
                if let source = (video as? AVURLAsset)?.url {
                    let file = cachesFile(source.pathExtension.lowercased())
                    if (try? FileManager.default.copyItem(at: source, to: file)) != nil { path = file.path }
                }
                done.signal()
            }
            done.wait()
        } else {
            let options = PHImageRequestOptions()
            options.isSynchronous = true
            options.deliveryMode = .highQualityFormat
            options.isNetworkAccessAllowed = true
            PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: 1600, height: 1600), contentMode: .aspectFit, options: options) { image, _ in
                let file = cachesFile("jpg")
                if let data = image?.jpegData(compressionQuality: 0.8), (try? data.write(to: file)) != nil { path = file.path }
            }
        }
    }
    give(path, out, size)
}
// A shake of the phone gives the web page its undo question: `window.yonderShake` in src/App.tsx. The web view has no
// shake event, and its motion events need a permission. Each responder passes the shake on, so the window gets it.
extension UIWindow {
    open override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake { findWebView(self)?.evaluateJavaScript("window.yonderShake?.()") }
        super.motionEnded(motion, with: event)
    }
}

// The grace time of the Face ID lock (src/Lock.tsx): Yonder opens with no Face ID for some minutes after it leaves the
// screen, but not after the phone locked. iOS takes the keys of the protected files away about ten seconds after the
// phone locks, and a plain app in the background stops before that. So with `watch` on, the app asks for a short
// background task when it leaves the screen, to hear the lock. The `phone_lock` command of ios/src/lib.rs calls this
// one. It returns the time of the last lock of the phone in milliseconds since 1970, or 0.
private var phoneLockedAt = 0.0
private var lockWatch = false
private var lockTask = UIBackgroundTaskIdentifier.invalid
private let lockNotes: [NSObjectProtocol] = {
    let center = NotificationCenter.default
    let end: () -> Void = {
        guard lockTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(lockTask)
        lockTask = .invalid
    }
    let locked = [UIApplication.protectedDataWillBecomeUnavailableNotification, UIApplication.protectedDataDidBecomeAvailableNotification].map {
        center.addObserver(forName: $0, object: nil, queue: .main) { _ in
            phoneLockedAt = Date().timeIntervalSince1970 * 1000
            end()
        }
    }
    return locked + [
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
            guard lockWatch, lockTask == .invalid else { return }
            lockTask = UIApplication.shared.beginBackgroundTask(withName: "Yonder lock watch", expirationHandler: end)
        },
        center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { _ in end() },
    ]
}()

@_cdecl("yonder_phone_lock")
public func yonderPhoneLock(_ watch: Bool) -> Double {
    _ = lockNotes
    lockWatch = watch
    return phoneLockedAt
}
