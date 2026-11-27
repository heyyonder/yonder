// A round button in the real Liquid Glass of iOS 26, at the place of a button of the page: the paper clip and the
// microphone over the tab bar of the iPhone. A tap clicks the button of the page (`data-native` in src/App.tsx), so the
// page keeps one handler for both. With a menu, a tap opens a native menu of its items.
import SwiftUI

@available(iOS 26.0, *)
struct GlassButton: View {
    let id: String
    private let chrome = NativeChrome.shared
    @State private var taps = 0

    var body: some View {
        if let button = chrome.buttons[id] {
            let image = button.icon.flatMap(chrome.image)
            Group {
                if let menu = button.menu, !menu.isEmpty {
                    Menu {
                        ChromeMenuItems(items: menu) { chrome.choose(id, $0) }
                    } label: {
                        GlassButtonLabel(button: button, image: image)
                    }
                } else {
                    Button(action: tap) {
                        GlassButtonLabel(button: button, image: image)
                    }
                }
            }
            .buttonStyle(.plain)
            // The glass of the page: its color, or the strong glass of a main action (version 5).
            .glassEffect(glass(button), in: button.outline)
            .overlay(alignment: .topTrailing) {
                if let badge = button.badge, !badge.isEmpty {
                    Text(badge)
                        .font(.caption2.bold())
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .padding(.horizontal, 5)
                        .frame(minWidth: 18, minHeight: 18)
                        .background(.red, in: .capsule)
                        .offset(x: 4, y: -4)
                        .accessibilityHidden(true)
                }
            }
            .disabled(!button.enabled)
            .opacity(button.enabled ? 1 : 0.5)
            .sensoryFeedback(.impact(weight: .light), trigger: taps)
        }
    }

    private func glass(_ button: ChromeState.Button) -> Glass {
        let tint = button.glass.flatMap { Color(css: $0) }
        let glass: Glass = button.prominent == true ? .regular.tint(tint ?? .accentColor) : tint.map { .regular.tint($0) } ?? .regular
        return glass.interactive()
    }

    private func tap() {
        taps += 1
        chrome.tap(id)
    }
}

// The icon of the page in the middle of the circle, and the label of the page for VoiceOver. The icon has the color of
// the text, or its own color from the page, as the green check of Done. Version 5: an SF Symbol in place of the icon,
// visible text next to it, and a shape of its own size.
struct GlassButtonLabel: View {
    let button: ChromeState.Button
    let image: UIImage?

    var body: some View {
        Group {
            if let text = button.text, !text.isEmpty {
                HStack(spacing: 6) {
                    icon
                    Text(text).font(.system(size: button.size ?? 17, weight: .semibold)).lineLimit(1)
                }
                .padding(.horizontal, 14)
                .accessibilityLabel(button.label)
            } else {
                Label { Text(button.label) } icon: { icon }.labelStyle(.iconOnly)
            }
        }
        .frame(width: button.w ?? button.d, height: button.h ?? button.d)
        .contentShape(button.outline)
        .foregroundStyle((button.color ?? button.tint).flatMap { Color(css: $0) }.map(AnyShapeStyle.init) ?? AnyShapeStyle(.primary))
    }

    @ViewBuilder private var icon: some View {
        if let symbol = button.symbol, image == nil {
            Image(systemName: symbol).font(.system(size: button.glyph * 0.85, weight: .medium)).accessibilityHidden(true)
        } else if image != nil || button.text == nil {
            ChromeIcon(image: image, size: button.glyph)
        }
    }
}

extension ChromeState.Button {
    // The shape of the glass and of the taps: a circle, a capsule or a rounded rectangle.
    var outline: AnyShape {
        switch shape {
        case "capsule": AnyShape(.capsule)
        case "rect": AnyShape(.rect(cornerRadius: radius ?? 12))
        default: AnyShape(.circle)
        }
    }
}

extension Color {
    // A CSS color of `getComputedStyle`: "rgb(31, 157, 85)" or "rgba(31, 157, 85, 0.5)".
    init?(css: String) {
        let parts = css.split(whereSeparator: { !"0123456789.".contains($0) }).compactMap { Double($0) }
        guard parts.count >= 3 else { return nil }
        self.init(red: parts[0] / 255, green: parts[1] / 255, blue: parts[2] / 255, opacity: parts.count > 3 ? parts[3] : 1)
    }
}

// An icon of src/icons.tsx that the page drew as a PNG. It takes the color of the text, as on the page.
struct ChromeIcon: View {
    let image: UIImage?
    let size: Double

    var body: some View {
        Image(uiImage: image ?? UIImage())
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            // The PNG has a margin of a tenth of the box on each side (`iconPng` in src/icons.tsx).
            .frame(width: size * 1.2, height: size * 1.2)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

// The items of a native menu, as the menu of the page: an action, or a submenu whose choice has a check mark.
struct ChromeMenuItems: View {
    let items: [ChromeState.MenuItem]
    let choose: (String) -> Void

    var body: some View {
        ForEach(items) { item in
            // A submenu is a section of the same menu, so that iOS opens no second menu over the first.
            if let children = item.items {
                Section(item.title) {
                    ChromeMenuItems(items: children, choose: choose)
                }
            } else {
                Button(role: item.destructive == true ? .destructive : nil) {
                    choose(item.id)
                } label: {
                    ChromeMenuLabel(item: item)
                }
            }
        }
    }
}

// The title of a menu item with its symbol, or a check mark on the choice of a submenu, and the choice under the title.
struct ChromeMenuLabel: View {
    let item: ChromeState.MenuItem

    var body: some View {
        let symbol = item.checked == true ? "checkmark" : item.symbol
        if let symbol {
            Label(item.title, systemImage: symbol)
        } else {
            Text(item.title)
        }
        if let detail = item.detail {
            Text(detail)
        }
    }
}

// A dropdown of the page in the real Liquid Glass of iOS 26: a pill with the choice and two small arrows, as the pill of
// the page, and a tap opens the native menu of iOS with a check on the choice (NativeChrome.select).
@available(iOS 26.0, *)
struct GlassDropdown: View {
    let id: String
    private let chrome = NativeChrome.shared

    var body: some View {
        if let list = chrome.dropdowns[id] {
            Menu {
                Picker(selection: Binding(get: { list.value }, set: { chrome.select(id, value: $0) })) {
                    ForEach(list.options) { Text($0.label).tag($0.value) }
                } label: {
                    EmptyView()
                }
                .pickerStyle(.inline)
            } label: {
                // The padding and the arrows of the pill of the page (.select in src/app.css).
                HStack(spacing: list.gap) {
                    Text(list.options.first { $0.value == list.value }?.label ?? list.value)
                        .font(.system(size: list.size))
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                        .foregroundStyle(.primary)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: list.glyph * 0.6, weight: .semibold))
                        .frame(width: list.glyph)
                        .foregroundStyle(.secondary)
                }
                .padding(.leading, list.left)
                .padding(.trailing, list.right)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(.capsule)
            }
            .buttonStyle(.plain)
            .glassEffect(.regular.interactive(), in: .capsule)
            .disabled(!list.enabled)
            .opacity(list.enabled ? 1 : 0.5)
        }
    }
}
