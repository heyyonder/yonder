// The native abilities of the phone for the bridge and the agents (docs/shell.md, src/abilities.ts): the share sheet,
// the clipboard, the camera, a save to Photos, the contact picker, the event editor, the state of the phone, the badge of
// the app, the screen that stays on, a link of any scheme, a native dialog and a native sheet. The page calls `ability` of
// ios/src/lib.rs with an id, a name and the args as JSON, and gets the answer as `window.yonderAbility(id, answer)`. A
// new ability needs only a case here and a line in src/abilities.ts, with no new command. So the store app never limits
// what the agents can do.
import Contacts
import ContactsUI
import EventKit
import EventKitUI
import Network
import Photos
import UIKit
import UserNotifications
import WebKit

@MainActor
enum Abilities {
    // The abilities of this app, for `abilities` of ios/src/lib.rs.
    static let names = ["share", "copy", "paste", "photo", "save_photo", "contact", "event", "device", "badge", "awake", "confirm", "open", "sheet", "push_action"]
    // The delegates of the pickers that show now. UIKit keeps only a weak reference to a delegate.
    private static var helpers: [NSObject] = []
    // The web view of the page. A screen over the whole app, as the camera, takes it out of the window. Else a search
    // of the windows finds no web view, and the cancel of the camera never reaches the page.
    private static weak var web: WKWebView?
    static func page() -> WKWebView? {
        if let web { return web }
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        web = windows.lazy.compactMap(findWebView).first
        return web
    }

    static func run(_ id: String, _ name: String, _ args: [String: Any]) {
        _ = page()
        let answer = { (result: [String: Any]) in send(id, result) }
        switch name {
        case "share":
            var items: [Any] = []
            if let text = args["text"] as? String, !text.isEmpty { items.append(text) }
            if let link = (args["url"] as? String).flatMap(URL.init(string:)) { items.append(link) }
            items += (args["files"] as? [String] ?? []).map { URL(fileURLWithPath: $0) }
            guard !items.isEmpty else { return answer(["error": "There is nothing to share."]) }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            sheet.completionWithItemsHandler = { type, done, _, error in
                answer(error.map { ["error": $0.localizedDescription] } ?? ["done": done, "app": type?.rawValue ?? ""])
            }
            present(sheet, answer)
        case "copy":
            UIPasteboard.general.string = args["text"] as? String ?? ""
            answer(["ok": true])
        case "paste":
            // iOS asks the user before the app reads what another app copied.
            answer(["text": UIPasteboard.general.string ?? ""])
        case "photo":
            let picker = PhotoPicker()
            // A phone with no camera picks a photo of the library.
            picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
            // One answer: the photo, or a cancel. The camera of iOS 27 can close with no call of its delegate, so the
            // close of the picker also answers.
            var sent = false
            let helper = PhotoHelper { image in
                picker.dismiss(animated: true)
                if sent { return }
                sent = true
                // At most 2048 points on the long side, so the photo fits in one request of the relay (1 MiB).
                let scale = image.map { min(1, 2048 / max($0.size.width, $0.size.height, 1)) } ?? 1
                let small = image.map { photo in
                    UIGraphicsImageRenderer(size: CGSize(width: photo.size.width * scale, height: photo.size.height * scale), format: .init(for: .init(displayScale: 1)))
                        .image { _ in photo.draw(in: CGRect(origin: .zero, size: CGSize(width: photo.size.width * scale, height: photo.size.height * scale))) }
                }
                guard let small, let data = small.jpegData(compressionQuality: 0.8) else { return answer(["canceled": true]) }
                // Library/Caches, so `read_picked` of ios/src/lib.rs gives the bytes to the page.
                let file = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("photo-\(UUID().uuidString).jpg")
                do {
                    try data.write(to: file)
                    answer(["path": file.path])
                } catch {
                    answer(["error": error.localizedDescription])
                }
            }
            picker.delegate = helper
            picker.gone = {
                Abilities.drop(helper)
                if !sent {
                    sent = true
                    answer(["canceled": true])
                }
            }
            keep(helper)
            present(picker, answer)
        case "save_photo":
            // The page gives the picture or the video in base64, from a link of the Mac. Add-only access asks one time.
            guard let base64 = args["data"] as? String, let data = Data(base64Encoded: base64) else { return answer(["error": "There is no picture to save."]) }
            let name = (args["name"] as? String).map { ($0 as NSString).lastPathComponent } ?? "photo.jpg"
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString)-\(name)")
            let video = ["mov", "mp4", "m4v"].contains(file.pathExtension.lowercased())
            do { try data.write(to: file) } catch { return answer(["error": error.localizedDescription]) }
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else {
                    Task { @MainActor in answer(["error": "The user did not allow Yonder to add to Photos. They can allow it in the Settings of the phone."]) }
                    return
                }
                PHPhotoLibrary.shared().performChanges {
                    PHAssetCreationRequest.forAsset().addResource(with: video ? .video : .photo, fileURL: file, options: nil)
                } completionHandler: { ok, error in
                    try? FileManager.default.removeItem(at: file)
                    Task { @MainActor in answer(ok ? ["ok": true] : ["error": error?.localizedDescription ?? "Photos did not save it."]) }
                }
            }
        case "contact":
            // The picker of iOS needs no permission: the app gets only the contact that the user picks.
            let picker = CNContactPickerViewController()
            let helper = ContactHelper { contact in
                answer(contact.map(describe) ?? ["canceled": true])
            }
            picker.delegate = helper
            keep(helper)
            present(picker, answer)
        case "event":
            // The editor of iOS 17 runs outside the app and needs no access to the calendar (EventKit, "Accessing the event
            // store"). The user saves the event or cancels it.
            let store = EKEventStore()
            let event = EKEvent(eventStore: store)
            event.title = args["title"] as? String ?? ""
            let start = (args["start"] as? String).flatMap(date) ?? Date()
            event.startDate = start
            event.endDate = (args["end"] as? String).flatMap(date) ?? start.addingTimeInterval(3600)
            event.isAllDay = (args["start"] as? String)?.count == 10
            event.location = args["location"] as? String
            event.notes = args["notes"] as? String
            event.url = (args["url"] as? String).flatMap(URL.init(string:))
            let editor = EKEventEditViewController()
            editor.eventStore = store
            editor.event = event
            let helper = EventHelper { action in
                editor.dismiss(animated: true)
                answer(["saved": action == .saved])
            }
            editor.editViewDelegate = helper
            keep(helper)
            present(editor, answer)
        case "device":
            // One look at the network: the first path of the monitor. Then the battery and the heat, on the main thread.
            let monitor = NWPathMonitor()
            monitor.pathUpdateHandler = { path in
                monitor.cancel()
                let network = path.status != .satisfied ? "none" : path.usesInterfaceType(.wifi) ? "wifi" : path.usesInterfaceType(.cellular) ? "cellular" : "wired"
                let (expensive, constrained) = (path.isExpensive, path.isConstrained)
                Task { @MainActor in
                    var state = deviceState()
                    state["network"] = network
                    state["expensive"] = expensive
                    state["constrained"] = constrained
                    answer(state)
                }
            }
            monitor.start(queue: .global())
        case "badge":
            UNUserNotificationCenter.current().setBadgeCount(max(0, args["count"] as? Int ?? 0)) { error in
                Task { @MainActor in answer(error.map { ["error": $0.localizedDescription] } ?? ["ok": true]) }
            }
        case "awake":
            UIApplication.shared.isIdleTimerDisabled = args["on"] as? Bool ?? true
            answer(["ok": true])
        case "confirm":
            let alert = UIAlertController(title: args["title"] as? String, message: args["message"] as? String, preferredStyle: .alert)
            let buttons = args["buttons"] as? [[String: Any]] ?? [["id": "ok", "title": "OK"]]
            for button in buttons {
                let role = button["role"] as? String
                let style: UIAlertAction.Style = role == "cancel" ? .cancel : role == "destructive" ? .destructive : .default
                alert.addAction(UIAlertAction(title: button["title"] as? String ?? "OK", style: style) { _ in
                    answer(["button": button["id"] as? String ?? ""])
                })
            }
            present(alert, answer)
        case "open":
            guard let url = (args["url"] as? String).flatMap(URL.init(string:)) else { return answer(["error": "That is no link."]) }
            UIApplication.shared.open(url) { ok in
                Task { @MainActor in answer(ok ? ["ok": true] : ["error": "No app on the phone opens \(url.scheme ?? "this link")."]) }
            }
        case "sheet":
            KitSheet.present(args, answer)
        case "push_action":
            // The Approve or Deny of a push that opened the app before the page was there.
            answer(Push.take() ?? [:])
        default:
            answer(["error": "This phone app cannot do \"\(name)\"."])
        }
    }

    // The answer to the page. JSON is also a JavaScript value.
    static func send(_ id: String, _ result: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: result), let json = String(data: data, encoding: .utf8),
              let key = try? JSONSerialization.data(withJSONObject: [id]), let ids = String(data: key, encoding: .utf8)
        else { return }
        page()?.evaluateJavaScript("window.yonderAbility?.(\(ids)[0], \(json))")
    }

    // Shows a screen over the app. A sheet that still slides in or out cannot show another, so the screen waits for it.
    static func present(_ controller: UIViewController, _ answer: @escaping ([String: Any]) -> Void, tries: Int = 0) {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        guard var top = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController else {
            return answer(["error": "Yonder is not on the screen of the phone."])
        }
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        if top.isBeingPresented || top.isBeingDismissed {
            guard tries < 10 else { return answer(["error": "Another screen is in the way."]) }
            return DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { present(controller, answer, tries: tries + 1) }
        }
        controller.popoverPresentationController?.sourceView = top.view
        controller.popoverPresentationController?.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
        top.present(controller, animated: true)
    }

    static func keep(_ helper: NSObject) { helpers.append(helper) }
    static func drop(_ helper: NSObject) { helpers.removeAll { $0 === helper } }

    // The battery, Low Power Mode, the heat, and the model of the phone.
    private static func deviceState() -> [String: Any] {
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        let states: [UIDevice.BatteryState: String] = [.charging: "charging", .full: "full", .unplugged: "unplugged"]
        let heat: [ProcessInfo.ThermalState: String] = [.nominal: "normal", .fair: "warm", .serious: "hot", .critical: "critical"]
        return [
            "battery": device.batteryLevel < 0 ? NSNull() : Int((device.batteryLevel * 100).rounded()),
            "charge": states[device.batteryState] ?? "unknown",
            "low_power": ProcessInfo.processInfo.isLowPowerModeEnabled,
            "heat": heat[ProcessInfo.processInfo.thermalState] ?? "unknown",
            "model": device.model,
            "ios": device.systemVersion,
        ]
    }

    // An ISO date, with or without the time.
    private static func date(_ text: String) -> Date? {
        let full = ISO8601DateFormatter()
        full.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        let day = ISO8601DateFormatter()
        day.formatOptions = [.withFullDate]
        return full.date(from: text) ?? plain.date(from: text) ?? day.date(from: text)
    }

    private static func describe(_ contact: CNContact) -> [String: Any] {
        var out: [String: Any] = [
            "name": CNContactFormatter.string(from: contact, style: .fullName) ?? "",
            "phones": contact.phoneNumbers.map(\.value.stringValue),
            "emails": contact.emailAddresses.map { $0.value as String },
        ]
        if !contact.organizationName.isEmpty { out["organization"] = contact.organizationName }
        if let address = contact.postalAddresses.first?.value { out["address"] = CNPostalAddressFormatter.string(from: address, style: .mailingAddress) }
        if let birthday = contact.birthday, let month = birthday.month, let day = birthday.day {
            out["birthday"] = birthday.year.map { String(format: "%04d-%02d-%02d", $0, month, day) } ?? String(format: "--%02d-%02d", month, day)
        }
        return out
    }
}

// The camera, which says when it closes (`gone`).
final class PhotoPicker: UIImagePickerController {
    var gone: (@MainActor () -> Void)?

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || presentingViewController == nil { MainActor.assumeIsolated { gone?() } }
    }
}

final class PhotoHelper: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let done: @MainActor (UIImage?) -> Void
    init(_ done: @escaping @MainActor (UIImage?) -> Void) { self.done = done }

    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        MainActor.assumeIsolated {
            done(info[.originalImage] as? UIImage)
            Abilities.drop(self)
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        MainActor.assumeIsolated {
            done(nil)
            Abilities.drop(self)
        }
    }
}

final class ContactHelper: NSObject, CNContactPickerDelegate {
    let done: @MainActor (CNContact?) -> Void
    init(_ done: @escaping @MainActor (CNContact?) -> Void) { self.done = done }

    func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
        MainActor.assumeIsolated {
            done(contact)
            Abilities.drop(self)
        }
    }

    func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
        MainActor.assumeIsolated {
            done(nil)
            Abilities.drop(self)
        }
    }
}

final class EventHelper: NSObject, EKEventEditViewDelegate {
    let done: @MainActor (EKEventEditViewAction) -> Void
    init(_ done: @escaping @MainActor (EKEventEditViewAction) -> Void) { self.done = done }

    func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        MainActor.assumeIsolated {
            done(action)
            Abilities.drop(self)
        }
    }
}

// Approve and Deny on a push (the Canvas, docs/canvas.md): the category "approval", and the choice of the user, which
// the notifications plugin gives only for its own local notices. A proxy in front of the delegate of the plugin sees the
// choice first: it calls `window.yonderPushAction(choice)`, and keeps it for `push_action`, when the push opened the app
// before the page was there. Both actions open the app, so the page sends the choice to the bridge.
@MainActor
enum Push {
    private static var proxy: PushProxy?
    private static var waiting: [String: Any]?

    static func install() {
        let center = UNUserNotificationCenter.current()
        if proxy == nil, !(center.delegate is PushProxy) {
            let made = PushProxy(inner: center.delegate)
            proxy = made
            center.delegate = made
        }
        let approve = UNNotificationAction(identifier: "approve", title: "Approve", options: [.authenticationRequired, .foreground])
        let deny = UNNotificationAction(identifier: "deny", title: "Deny", options: [.destructive, .foreground])
        let approval = UNNotificationCategory(identifier: "approval", actions: [approve, deny], intentIdentifiers: [])
        center.getNotificationCategories { known in
            center.setNotificationCategories(known.filter { $0.identifier != "approval" }.union([approval]))
        }
    }

    static func chose(_ action: String, _ info: [AnyHashable: Any]) {
        var choice: [String: Any] = ["action": action]
        for (key, value) in info where key as? String != "aps" {
            if let key = key as? String, JSONSerialization.isValidJSONObject([value]) { choice[key] = value }
        }
        waiting = choice
        guard let data = try? JSONSerialization.data(withJSONObject: choice), let json = String(data: data, encoding: .utf8) else { return }
        Abilities.page()?.evaluateJavaScript("window.yonderPushAction?.(\(json)) && 1") { result, _ in
            // The page took it.
            if result != nil { waiting = nil }
        }
    }

    static func take() -> [String: Any]? {
        defer { waiting = nil }
        return waiting
    }
}

final class PushProxy: NSObject, UNUserNotificationCenterDelegate {
    // The delegate of the notifications plugin. The center keeps only a weak reference, so the proxy keeps it.
    let inner: UNUserNotificationCenterDelegate?
    init(inner: UNUserNotificationCenterDelegate?) { self.inner = inner }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        if inner?.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: done) == nil { done([.banner, .sound]) }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler done: @escaping () -> Void) {
        let action = response.actionIdentifier
        if action != UNNotificationDefaultActionIdentifier, action != UNNotificationDismissActionIdentifier {
            let info = response.notification.request.content.userInfo
            MainActor.assumeIsolated { Push.chose(action, info) }
        }
        if inner?.userNotificationCenter?(center, didReceive: response, withCompletionHandler: done) == nil { done() }
    }
}

// Runs one ability (`ability` of ios/src/lib.rs), and returns false for an ability that this app does not have. The
// answer comes later as `window.yonderAbility(id, answer)`. Tauri runs a sync command on the main thread.
@_cdecl("yonder_ability")
public func yonderAbility(_ id: UnsafePointer<CChar>, _ name: UnsafePointer<CChar>, _ args: UnsafePointer<CChar>) -> Bool {
    let (id, name) = (String(cString: id), String(cString: name))
    let args = (try? JSONSerialization.jsonObject(with: Data(String(cString: args).utf8))) as? [String: Any] ?? [:]
    let run = { @MainActor in
        guard Abilities.names.contains(name) else { return false }
        Abilities.run(id, name, args)
        return true
    }
    if Thread.isMainThread { return MainActor.assumeIsolated(run) }
    Task { @MainActor in _ = run() }
    return true
}

// The abilities of this app as JSON, for the poll of the page. The first call also puts the proxy in front of the
// delegate of the notifications plugin, which the plugin set at the start.
@_cdecl("yonder_abilities")
public func yonderAbilities(_ out: UnsafeMutablePointer<CChar>, _ size: Int) {
    let list = MainActor.assumeIsolated {
        Push.install()
        return Abilities.names
    }
    let json = (try? JSONSerialization.data(withJSONObject: list)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    _ = json.withCString { strlcpy(out, $0, size) }
}

// The cover of a new load (src/front.ts): a picture of the screen over the whole window while the page loads again, so
// a new screen comes in with no flash. `on` false fades it out. It goes away by itself after 4 seconds, so a new page
// that fails never hides behind it. Returns false when it cannot show.
@MainActor
enum Cover {
    private static var view: UIView?

    static func set(_ on: Bool) -> Bool {
        if !on {
            guard let shown = view else { return true }
            view = nil
            UIView.animate(withDuration: 0.2, animations: { shown.alpha = 0 }, completion: { _ in shown.removeFromSuperview() })
            return true
        }
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        guard let window = windows.first(where: { findWebView($0) != nil }), let picture = window.snapshotView(afterScreenUpdates: false) else { return false }
        view?.removeFromSuperview()
        picture.frame = window.bounds
        window.addSubview(picture)
        view = picture
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
            if view === picture { _ = set(false) }
        }
        return true
    }
}

@_cdecl("yonder_native_cover")
public func yonderNativeCover(_ on: Bool) -> Bool {
    guard Thread.isMainThread else { return false }
    return MainActor.assumeIsolated { Cover.set(on) }
}

// The quick action "Default screen" on the icon of the app (UIApplicationShortcutItems in ios/Info.ios.plist), a floor
// that no screen can hide (docs/ui-themes.md): the next start runs the screen of the install and clears the
// custom look (`launch_action` in src/front.ts). The scene delegate of tao gets the action, so this adds the method for
// a running app, and reads the options of a new scene for a cold start.
enum QuickAction {
    static let key = "yonderLaunchAction"

    static func take(_ type: String) {
        guard type.hasSuffix(".default-screen") else { return }
        UserDefaults.standard.set("default-screen", forKey: key)
        // A running app loads the page again, so the start code sees the action.
        DispatchQueue.main.async {
            let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
            windows.lazy.compactMap(findWebView).first?.reload()
        }
    }

    // tao registers its scene delegate when the app starts (its AppDelegate in ios/tao), after `yonder_shell_start`. So
    // the hook waits for the end of the launch, which comes before the scene connects with the quick action.
    private static var waiting: NSObjectProtocol?
    static func install() {
        if NSClassFromString("TaoSceneDelegate") != nil { return hook() }
        waiting = NotificationCenter.default.addObserver(forName: UIApplication.didFinishLaunchingNotification, object: nil, queue: nil) { _ in
            if let waiting { NotificationCenter.default.removeObserver(waiting) }
            hook()
        }
    }

    private static func hook() {
        guard let delegate: AnyClass = NSClassFromString("TaoSceneDelegate") else { return }
        let perform = NSSelectorFromString("windowScene:performActionForShortcutItem:completionHandler:")
        let run: @convention(block) (AnyObject, UIWindowScene, UIApplicationShortcutItem, @escaping (Bool) -> Void) -> Void = { _, _, item, done in
            take(item.type)
            done(true)
        }
        class_addMethod(delegate, perform, imp_implementationWithBlock(run), "v@:@@@?")
        let connect = NSSelectorFromString("scene:willConnectToSession:options:")
        guard let method = class_getInstanceMethod(delegate, connect) else { return }
        typealias Connect = @convention(c) (AnyObject, Selector, UIScene, UISceneSession, UIScene.ConnectionOptions) -> Void
        let original = unsafeBitCast(method_getImplementation(method), to: Connect.self)
        let wrap: @convention(block) (AnyObject, UIScene, UISceneSession, UIScene.ConnectionOptions) -> Void = { me, scene, session, options in
            if let item = options.shortcutItem { take(item.type) }
            original(me, connect, scene, session, options)
        }
        method_setImplementation(method, imp_implementationWithBlock(wrap))
    }
}

// Runs at the start of the app, before its scenes connect (`run` of ios/src/lib.rs).
@_cdecl("yonder_shell_start")
public func yonderShellStart() {
    QuickAction.install()
}

// The quick action that started or woke the app, once, or "".
@_cdecl("yonder_launch_action")
public func yonderLaunchAction(_ out: UnsafeMutablePointer<CChar>, _ size: Int) {
    let action = UserDefaults.standard.string(forKey: QuickAction.key) ?? ""
    UserDefaults.standard.removeObject(forKey: QuickAction.key)
    _ = action.withCString { strlcpy(out, $0, size) }
}
