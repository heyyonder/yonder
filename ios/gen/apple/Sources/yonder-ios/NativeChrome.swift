// The native chrome of the iPhone app: the tab bar and the round buttons in the real Liquid Glass of iOS 26, over the
// web view. The web view cannot draw real glass (see "The tabs of the phone" in docs/wiki.md), so these controls are
// native: the tab bar of UIKit (GlassTabBar.swift), and SwiftUI for the buttons and the switches. The page keeps its own
// controls in their places and hides them (`useNativeChrome` in src/App.tsx). It sends the state and the place of each
// control through the `native_chrome` command of ios/src/lib.rs, and a tap calls the page back with `window.yonderChrome`.
// Each button has its own small hosting view, because a hosting view takes the touches of its whole area: one large view
// would stop the taps on the page under its empty parts.
import Photos
import SwiftUI
import UIKit
import WebKit

// Shows the controls of `state` (JSON), and returns the version of the native chrome: 0 before iOS 26, where the page
// keeps its own controls, 2 since the controls can be cut at the edge of a page that slides (`clip`), 3 since the
// attach sheet is native (`yonder_attach_sheet`), 4 since the dropdowns are native, 5 since the kit of
// docs/shell.md: buttons with text, SF Symbols, shapes, colors and badges, tabs with badges, the color of the open tab,
// and the cover of a new load (`native_cover`), and 6 since the attach sheet has Version. An older app returns true.
// Tauri runs a sync command on the main thread.
// -1: the state could not show, as a state that does not decode or no web view. The page then keeps its own controls.
// Else the page hides all its controls, and the screen has no tab bar and no round buttons.
@_cdecl("yonder_native_chrome")
public func yonderNativeChrome(_ state: UnsafePointer<CChar>) -> Int32 {
    guard #available(iOS 26.0, *) else { return 0 }
    guard let data = String(cString: state).data(using: .utf8) else { return -1 }
    if Thread.isMainThread {
        let shown = MainActor.assumeIsolated { NativeChrome.shared.apply(data) }
        return shown ? 6 : -1
    }
    Task { @MainActor in NativeChrome.shared.apply(data) }
    return 6
}

@available(iOS 26.0, *)
@MainActor @Observable
final class NativeChrome {
    static let shared = NativeChrome()

    // The chrome starts with the app, so the recent photos of the attach sheet load before the first tap.
    init() { AttachPhotos.warm() }

    private(set) var tabs: [ChromeState.Tab] = []
    private(set) var selected = ""
    private(set) var buttons: [String: ChromeState.Button] = [:]
    private(set) var toggles: [String: ChromeState.Toggle] = [:]
    private(set) var dropdowns: [String: ChromeState.Dropdown] = [:]
    private var images: [String: UIImage] = [:]

    @ObservationIgnored private weak var web: WKWebView?
    @ObservationIgnored private var bar: GlassTabBar?
    @ObservationIgnored private var tabIcons: [String: UIImage] = [:]
    @ObservationIgnored private var hosts: [String: UIHostingController<GlassButton>] = [:]
    @ObservationIgnored private var switches: [String: UIHostingController<NativeToggle>] = [:]
    @ObservationIgnored private var pickers: [String: UIHostingController<GlassDropdown>] = [:]
    @ObservationIgnored private var loading: NSKeyValueObservation?
    @ObservationIgnored private var style: UIUserInterfaceStyle = .unspecified

    func image(_ name: String) -> UIImage? { images[name] }

    // The icon of a tab at the size of the icons of the tab bar of iOS: 26 points, with the margin of `iconPng`.
    private func tabIcon(_ name: String) -> UIImage? {
        if let icon = tabIcons[name] { return icon }
        guard let image = images[name] else { return nil }
        let size = CGSize(width: 26, height: 26)
        let icon = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }.withRenderingMode(.alwaysTemplate)
        tabIcons[name] = icon
        return icon
    }

    // Returns false when the state cannot show: the native controls then hide, and the page keeps its own.
    @discardableResult
    func apply(_ data: Data) -> Bool {
        guard let state = try? JSONDecoder().decode(ChromeState.self, from: data), let web = webView() else {
            hideAll()
            return false
        }
        for (name, base64) in state.icons ?? [:] {
            guard let png = Data(base64Encoded: base64), let image = UIImage(data: png, scale: 3) else { continue }
            images[name] = image.withRenderingMode(.alwaysTemplate)
        }
        tabs = state.tabs
        // The pill moves at once on a tap (`pick`), so the page only confirms it here.
        selected = state.selected
        style = state.dark ? .dark : .light
        place(bar: state.bar, clip: state.clip, in: web, style: style, tint: state.tint)
        // A hidden control keeps its last state, so its SwiftUI view stays built under the hidden host and shows again
        // as it was. A state that did not change does not draw the view again. Else each scroll builds each glass
        // button, switch and menu again, and each frame of a slide draws all of them again.
        let named = Set(state.buttons.map(\.id))
        for (id, host) in hosts where !named.contains(id) {
            host.view.isHidden = true
        }
        for button in state.buttons {
            if buttons[button.id] != button { buttons[button.id] = button }
            let host = hosts[button.id] ?? makeHost(GlassButton(id: button.id), in: web)
            hosts[button.id] = host
            host.overrideUserInterfaceStyle = style
            host.view.frame = CGRect(x: button.x, y: button.y, width: button.w ?? button.d, height: button.h ?? button.d)
            cut(host.view, at: state.clip)
            host.view.isHidden = false
        }
        // The switches of iOS, at the places of the switches of the page. Only a real switch has the glass knob of
        // iOS 26, a lens that slides across: the switch that WebKit draws keeps a plain white knob.
        let shown = state.toggles ?? []
        let switched = Set(shown.map(\.id))
        for (id, host) in switches where !switched.contains(id) {
            host.view.isHidden = true
        }
        for toggle in shown {
            if toggles[toggle.id] != toggle { toggles[toggle.id] = toggle }
            let host = switches[toggle.id] ?? makeHost(NativeToggle(id: toggle.id), in: web)
            switches[toggle.id] = host
            host.overrideUserInterfaceStyle = style
            host.view.frame = CGRect(x: toggle.x, y: toggle.y, width: toggle.w, height: toggle.h)
            cut(host.view, at: state.clip)
            host.view.isHidden = false
        }
        // The dropdowns, at the places of the dropdowns of the page, in glass with a native menu.
        let lists = state.dropdowns ?? []
        let listed = Set(lists.map(\.id))
        for (id, host) in pickers where !listed.contains(id) {
            host.view.isHidden = true
        }
        for list in lists {
            if dropdowns[list.id] != list { dropdowns[list.id] = list }
            let host = pickers[list.id] ?? makeHost(GlassDropdown(id: list.id), in: web)
            pickers[list.id] = host
            host.overrideUserInterfaceStyle = style
            host.view.frame = CGRect(x: list.x, y: list.y, width: list.w, height: list.h)
            cut(host.view, at: state.clip)
            host.view.isHidden = false
        }
        // The rows scroll under the round buttons and the tab bar, so these stay over the switches and the dropdowns of
        // the rows. A new control goes on top of the others, so a switch made after the buttons covered the + button.
        // The order of the subviews also sets which control gets a tap.
        for host in hosts.values { web.bringSubviewToFront(host.view) }
        if let bar { web.bringSubviewToFront(bar.bar) }
        return true
    }

    // A tap on a tab: the bar of iOS moves the selection at once (the rule "Instant actions" in CLAUDE.md), then the
    // page opens the tab.
    func pick(_ id: String) {
        selected = id
        call("tab", id)
    }

    func pick(index: Int) {
        guard tabs.indices.contains(index) else { return }
        pick(tabs[index].id)
    }

    func tap(_ button: String) { call("button", button) }

    // The state of a native switch for its Toggle: a flip shows at once, then the switch of the page gets a click. The
    // page sends its state again after the click, so a flip that the page refuses, such as Face ID, flips back.
    func isOn(_ id: String) -> Binding<Bool> {
        Binding(
            get: { self.toggles[id]?.on ?? false },
            set: { on in
                guard var toggle = self.toggles[id], toggle.on != on else { return }
                toggle.on = on
                self.toggles[id] = toggle
                self.tap(id)
            }
        )
    }

    func choose(_ button: String, _ item: String) { call("menu", button, item) }

    // The choice of a native dropdown: the pill shows it at once, then the page gets it as the choice of a menu.
    func select(_ dropdown: String, value: String) {
        guard var list = dropdowns[dropdown], list.value != value else { return }
        list.value = value
        dropdowns[dropdown] = list
        choose(dropdown, value)
    }

    // Opens the attach sheet (AttachSheet below) as a sheet of iOS over the page. A choice closes the sheet first, and
    // then goes to the page, because a picker of the page cannot open while the sheet is up. The page gets it as the
    // choice of the menu "attach". WebKit runs `evaluateJavaScript` as a tap of the user, so the camera input and the
    // clipboard of the page work. It returns false when it has no web view, so the page shows its own sheet.
    func attach() -> Bool {
        guard let web = webView(), var top = web.window?.rootViewController else { return false }
        while let next = top.presentedViewController { top = next }
        // A sheet that still slides in or out cannot present another, and iOS then shows nothing. The sheet opens when
        // the slide ends.
        if top.isBeingDismissed || top.isBeingPresented {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { _ = NativeChrome.shared.attach() }
            return true
        }
        let strip = ![.denied, .restricted].contains(PHPhotoLibrary.authorizationStatus(for: .readWrite))
        let sheet = UIHostingController(rootView: AttachSheet(strip: strip) { [weak top] item in
            top?.dismiss(animated: true) { NativeChrome.shared.choose("attach", item) }
        })
        sheet.overrideUserInterfaceStyle = style
        sheet.view.backgroundColor = .clear
        if let controller = sheet.sheetPresentationController {
            // One row of buttons. The row scrolls sideways.
            controller.detents = [.custom { _ in strip ? 290 : 130 }]
            controller.prefersGrabberVisible = true
        }
        top.present(sheet, animated: true)
        return true
    }

    private func place(bar frame: ChromeState.Rect?, clip: Double?, in web: WKWebView, style: UIUserInterfaceStyle, tint: String?) {
        guard let frame else {
            bar?.bar.isHidden = true
            return
        }
        let tabBar = bar ?? GlassTabBar()
        if bar == nil { web.addSubview(tabBar.bar) }
        bar = tabBar
        tabBar.show(tabs, selected: selected, image: tabIcon, tint: tint.flatMap { Color(css: $0) }.map(UIColor.init))
        tabBar.bar.overrideUserInterfaceStyle = style
        // iOS puts the glass of the bar over the home bar itself, from the bottom of the screen, 21 points from each
        // side. So the bar gets the width of the screen and the bottom of the screen, from the top of the bar of the page.
        tabBar.bar.frame = CGRect(x: 0, y: frame.y, width: web.bounds.width, height: max(web.bounds.height - frame.y, frame.h))
        cut(tabBar.bar, at: clip)
        tabBar.bar.isHidden = false
    }

    // Cuts a control at the left edge of a page that slides over it (`clip`, in points of the web view), so the control
    // shows only at the left of the page, and takes no touch. The cut is a mask view, which also cuts the glass inside:
    // a mask of the layer can break the glass (UIVisualEffectView, "Masking"). The frame of the view stays, so the tab
    // bar does not lay out its tabs again. The mask goes 40 points past the other sides, for the shadow of the glass.
    private func cut(_ view: UIView, at clip: Double?) {
        guard let clip, clip < view.frame.maxX else {
            view.mask = nil
            view.isUserInteractionEnabled = true
            return
        }
        let mask = view.mask ?? UIView()
        mask.backgroundColor = .black
        mask.frame = CGRect(x: -40, y: -40, width: max(clip - view.frame.minX + 40, 0), height: view.bounds.height + 80)
        view.mask = mask
        view.isUserInteractionEnabled = false
    }

    private func makeHost<Content: View>(_ view: Content, in web: WKWebView) -> UIHostingController<Content> {
        let host = UIHostingController(rootView: view)
        // The page gives the place in points of the web view. The safe area of the screen must not move the content.
        host.safeAreaRegions = []
        host.view.backgroundColor = .clear
        if let parent = web.window?.rootViewController {
            parent.addChild(host)
            web.addSubview(host.view)
            host.didMove(toParent: parent)
        } else {
            web.addSubview(host.view)
        }
        return host
    }

    // The web view of the app. A new load of the page (an update over the air) hides all the controls, so that a page
    // that does not know them never sits under them. The new page shows them again.
    private func webView() -> WKWebView? {
        if let web { return web }
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        guard let found = windows.lazy.compactMap(findWebView).first else { return nil }
        web = found
        loading = found.observe(\.isLoading, options: [.new]) { web, _ in
            guard web.isLoading else { return }
            Task { @MainActor in NativeChrome.shared.hideAll() }
        }
        return found
    }

    private func hideAll() {
        bar?.bar.isHidden = true
        for host in hosts.values { host.view.isHidden = true }
        for host in switches.values { host.view.isHidden = true }
        for host in pickers.values { host.view.isHidden = true }
    }

    private func call(_ kind: String, _ id: String, _ item: String? = nil) {
        let args = [kind, id, item].compactMap { $0 }.map { "\"\($0.replacing("\\", with: "\\\\").replacing("\"", with: "\\\""))\"" }
        web?.evaluateJavaScript("window.yonderChrome?.(\(args.joined(separator: ",")))")
    }
}

// Opens the attach sheet of the iPhone, and returns false before iOS 26, where the page shows its own sheet
// (src/Attach.tsx). Tauri runs a sync command on the main thread.
@_cdecl("yonder_attach_sheet")
public func yonderAttachSheet() -> Bool {
    guard #available(iOS 26.0, *) else { return false }
    if Thread.isMainThread {
        return MainActor.assumeIsolated { NativeChrome.shared.attach() }
    }
    Task { @MainActor in _ = NativeChrome.shared.attach() }
    return true
}

// The attach sheet of the iPhone, as a sheet of iOS: the recent photos and videos at the top, and a row of buttons in
// Liquid Glass under them. The page keeps its sheet for Android and for iOS before 26. A choice is "camera", "photos", "file",
// "paste", "location", "version", or "recent:" and the id of a photo for `photo` of ios/src/lib.rs.
@available(iOS 26.0, *)
struct AttachSheet: View {
    let strip: Bool
    let choose: (String) -> Void
    @State private var assets = AttachPhotos.assets
    @State private var loading = AttachPhotos.assets.isEmpty
    @State private var taps = 0

    // One row that scrolls sideways. Six circles do not fit the width of the phone.
    private static let buttons = [
        ("camera", "Camera", "camera"),
        ("photos", "Photos", "photo.on.rectangle"),
        ("file", "File", "doc"),
        ("paste", "Paste", "doc.on.clipboard"),
        ("location", "Location", "location"),
        ("version", "Version", "info.circle"),
    ]

    var body: some View {
        VStack(spacing: 20) {
            if strip {
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 8) {
                        // Until the list comes, the strip shows empty tiles that pulse.
                        if loading {
                            ForEach(0..<4, id: \.self) { _ in AttachTile(image: nil) }
                        }
                        ForEach(assets, id: \.localIdentifier) { asset in
                            Button { choose("recent:\(asset.localIdentifier)") } label: { AttachThumb(asset: asset) }
                                .buttonStyle(.plain)
                                .accessibilityLabel(asset.mediaType == .video ? "Attach this video" : "Attach this photo")
                        }
                    }
                    .padding(.horizontal, 20)
                }
                .scrollIndicators(.hidden)
                .frame(height: 148)
                // The photos fade out at the two edges of the sheet, and do not go across its rounded edge.
                .mask {
                    HStack(spacing: 0) {
                        LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing).frame(width: 20)
                        Color.black
                        LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing).frame(width: 20)
                    }
                }
            }
            // The buttons are glass circles with a light tap, as the native buttons of the page (GlassButton.swift), so
            // they match the app.
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 8) {
                    ForEach(Self.buttons, id: \.0) { id, title, symbol in
                        key(id, title, symbol)
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 28)
        .frame(maxHeight: .infinity, alignment: .top)
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
        .task {
            guard strip else { return }
            defer { loading = false }
            // iOS asks the user one time. With limited access, the sheet shows only the photos that the user allowed.
            let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            guard status == .authorized || status == .limited else { return }
            assets = AttachPhotos.fetch()
        }
    }

    // One glass circle of the sheet, with its name under it.
    private func key(_ id: String, _ title: String, _ symbol: String) -> some View {
        Button {
            taps += 1
            choose(id)
        } label: {
            VStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.title2)
                    .frame(width: 60, height: 60)
                    .glassEffect(.regular.interactive(), in: .circle)
                    .accessibilityHidden(true)
                Text(title).font(.footnote)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

// The recent photos of the attach sheet, kept in memory while the app runs. The sheet shows the last list and the kept
// thumbnails at once, and loads only the new ones, so the user does not wait for them at each open.
@MainActor
enum AttachPhotos {
    static var assets: [PHAsset] = []
    static let images = NSCache<NSString, UIImage>()
    static let size = CGSize(width: 336, height: 444)

    // Loads the list and the thumbnails before the first open. It does not ask for the permission.
    static func warm() {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else { return }
        for asset in fetch() { thumb(asset) { _ in } }
    }

    // The 30 newest photos and videos, newest first.
    static func fetch() -> [PHAsset] {
        let fetch = PHFetchOptions()
        fetch.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        fetch.fetchLimit = 30
        fetch.predicate = NSPredicate(format: "mediaType == %d OR mediaType == %d", PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)
        let found = PHAsset.fetchAssets(with: fetch)
        assets = (0..<found.count).map(found.object(at:))
        return assets
    }

    // Gives the kept thumbnail at once. Else PhotoKit gives a small one first and the sharp one after it. A photo that
    // is only in iCloud comes from the network.
    static func thumb(_ asset: PHAsset, _ show: @escaping (UIImage) -> Void) {
        let key = asset.localIdentifier as NSString
        if let image = images.object(forKey: key) { return show(image) }
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = true
        PHImageManager.default().requestImage(for: asset, targetSize: size, contentMode: .aspectFill, options: options) { image, info in
            guard let image else { return }
            if (info?[PHImageResultIsDegradedKey] as? Bool) != true { images.setObject(image, forKey: key) }
            show(image)
        }
    }
}

// A tile of the strip: a photo, or an empty tile that pulses while the photo loads. The photo fades in.
@available(iOS 26.0, *)
struct AttachTile: View {
    let image: UIImage?
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        Color.clear
            .overlay {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill().transition(.opacity)
                } else {
                    Rectangle()
                        .fill(.quaternary)
                        .phaseAnimator(still ? [1] : [1, 0.4]) { tile, phase in tile.opacity(phase) } animation: { _ in .easeInOut(duration: 0.8) }
                }
            }
            .animation(.easeOut(duration: 0.2), value: image)
            .frame(width: 112, height: 148)
            .clipShape(.rect(cornerRadius: 18))
    }
}

// One recent photo or video, with the length of a video, such as 0:05, at the bottom right.
@available(iOS 26.0, *)
struct AttachThumb: View {
    let asset: PHAsset
    @State private var image: UIImage?

    init(asset: PHAsset) {
        self.asset = asset
        _image = State(initialValue: AttachPhotos.images.object(forKey: asset.localIdentifier as NSString))
    }

    var body: some View {
        AttachTile(image: image)
            .overlay(alignment: .bottomTrailing) {
                if asset.mediaType == .video {
                    let seconds = Int(asset.duration.rounded())
                    Text("\(seconds / 60):\(String(format: "%02d", seconds % 60))")
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.6), radius: 3)
                        .padding(.trailing, 8)
                        .padding(.bottom, 6)
                }
            }
            .onAppear { AttachPhotos.thumb(asset) { image = $0 } }
    }
}
