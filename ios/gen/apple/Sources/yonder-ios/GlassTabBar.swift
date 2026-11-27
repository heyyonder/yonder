// The tab bar of the iPhone: the tab bar of UIKit, alone over the web view. On iOS 26 it is the floating bar in Liquid
// Glass, and a press or a drag on it shows the glass lens of the system over the tab, as the knob of a switch. A SwiftUI
// view with a glass background shows no glass, because it has no lens.
// The tabs are the tabs of the page (`.tablist` in src/app.css), each with its icon over its name and count.
import UIKit

@available(iOS 26.0, *)
@MainActor
final class GlassTabBar: NSObject, UITabBarDelegate {
    let bar = UITabBar()
    private var icons: [String] = [] // The icon of each item, so an item gets a new image only when its icon changes.

    override init() {
        super.init()
        bar.delegate = self
        // All the tabs have the color of the text, with no blue, as the tabs of the page.
        bar.tintColor = .label
    }

    // The tabs of the page and the open tab. The items stay, so a new count does not rebuild the bar, and a selection
    // that did not change does not stop a drag of the lens.
    // Version 5: a badge on a tab, an SF Symbol when the page has no icon of that name, and the color of the open tab.
    func show(_ tabs: [ChromeState.Tab], selected: String, image: (String) -> UIImage?, tint: UIColor? = nil) {
        if bar.items?.count != tabs.count {
            bar.items = tabs.map { _ in UITabBarItem() }
            icons = Array(repeating: "", count: tabs.count)
        }
        let items = bar.items ?? []
        for (i, (item, tab)) in zip(items, tabs).enumerated() {
            if item.title != tab.title { item.title = tab.title }
            let name = tab.symbol.map { "symbol:\($0)" } ?? tab.icon
            if icons[i] != name, let picture = image(tab.icon) ?? tab.symbol.flatMap({ UIImage(systemName: $0) }) {
                item.image = picture
                icons[i] = name
            }
            let badge = tab.badge.flatMap { $0.isEmpty ? nil : $0 }
            if item.badgeValue != badge { item.badgeValue = badge }
        }
        let color = tint ?? .label
        if bar.tintColor != color { bar.tintColor = color }
        // The Projects and Calls views have no tab, so the bar then has no open tab.
        let open = tabs.firstIndex { $0.id == selected }.map { items[$0] }
        if bar.selectedItem !== open { bar.selectedItem = open }
    }

    // A tap or a drag on the bar: iOS moves the selection at once, then the page opens the tab.
    func tabBar(_ bar: UITabBar, didSelect item: UITabBarItem) {
        guard let index = bar.items?.firstIndex(of: item) else { return }
        NativeChrome.shared.pick(index: index)
    }
}
