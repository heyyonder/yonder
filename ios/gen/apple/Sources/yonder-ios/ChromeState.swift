// What the page sends to the native chrome (NativeChrome.swift): the tabs, the open tab, the place of the tab bar and
// of each round button in points of the web view, the theme of the page, and the icons that the native side does not
// have yet. `useNativeChrome` in src/App.tsx makes it.
struct ChromeState: Decodable {
    struct Rect: Decodable {
        let x: Double
        let y: Double
        let w: Double
        let h: Double
    }

    struct Tab: Decodable, Identifiable, Equatable {
        let id: String
        let title: String // With the count, as "2 Agents".
        let icon: String // A name of src/icons.tsx.
        var badge: String? // Version 5: the badge of the tab, as "3".
        var symbol: String? // Version 5: an SF Symbol when the page has no icon of that name.
    }

    // An item of a native menu: an action, or a submenu with `items`, such as the models of an agent.
    struct MenuItem: Decodable, Identifiable, Equatable {
        let id: String
        let title: String
        let detail: String? // The choice of a submenu, as "Opus 5.5".
        let symbol: String? // An SF Symbol.
        let checked: Bool?
        let destructive: Bool?
        let items: [MenuItem]?
    }

    // A round glass button: its place (x, y), its diameter `d` and the size of its icon `glyph`, in points.
    // Version 5 (the kit of docs/shell.md): visible `text`, an SF Symbol, a shape of `w` by `h`, the color of the glass and
    // of the content, a badge and the prominent glass, so the page can make each glass button with no new build.
    struct Button: Decodable, Identifiable, Equatable {
        let id: String
        var icon: String? // A name of src/icons.tsx. Version 5 can have only `symbol` or only `text`.
        let label: String // For VoiceOver.
        let x: Double
        let y: Double
        let d: Double
        let glyph: Double
        let enabled: Bool
        var menu: [MenuItem]? // A menu opens in place of a tap.
        var tint: String? // The CSS color of an icon that is not the color of the text, as "rgb(31, 157, 85)".
        var text: String? // The words on the button, next to the icon.
        var symbol: String? // An SF Symbol in place of `icon`.
        var w: Double? // The size of a button that is not a circle; `d` stays its width.
        var h: Double?
        var shape: String? // "circle" (the default), "capsule" or "rect".
        var radius: Double? // The corners of "rect".
        var glass: String? // The CSS color of the glass.
        var color: String? // The CSS color of the icon and the text.
        var size: Double? // The font size of the text, in points.
        var badge: String? // A small count over the button, as "2".
        var prominent: Bool? // The strong glass of a main action.
    }

    // An on and off switch of the page, at its place (x, y, w, h). A flip clicks the switch of the page.
    struct Toggle: Decodable, Identifiable, Equatable {
        let id: String
        let label: String // For VoiceOver.
        let x: Double
        let y: Double
        let w: Double
        let h: Double
        var on: Bool // The native switch flips it at once, and the page then confirms it.
        let enabled: Bool
        let tint: String? // The CSS color of the switch when on, as "rgb(255, 92, 97)".
    }

    // A dropdown of the page (Dropdown in src/Settings.tsx) at its place (x, y, w, h): a glass pill with the choice,
    // whose tap opens a native menu of the options with a check on the choice. A choice goes to the page as the choice
    // of a native menu, by the id of the dropdown.
    struct Dropdown: Decodable, Identifiable, Equatable {
        struct Option: Decodable, Identifiable, Equatable {
            let value: String
            let label: String
            var id: String { value }
        }

        let id: String
        let x: Double
        let y: Double
        let w: Double
        let h: Double
        var value: String // The native menu sets it at once, and the page then confirms it.
        let options: [Option]
        let size: Double // The font size of the page, in points.
        let left: Double // The padding of the pill of the page, the space between the choice and the arrows, and the
        let right: Double // size of the arrows, in points.
        let gap: Double
        let glyph: Double
        let enabled: Bool
    }

    let dark: Bool
    let tabs: [Tab]
    let selected: String // "" when no tab is open, as in the Projects view.
    let bar: Rect? // nil hides the tab bar.
    var tint: String? // Version 5: the CSS color of the open tab.
    let buttons: [Button]
    let toggles: [Toggle]? // A page from before the native switches sends none.
    let dropdowns: [Dropdown]? // A page from before the native dropdowns sends none.
    let icons: [String: String]? // A PNG in base64 for each new icon, drawn by the page from its own icons.
    // The left edge of the settings page while it slides over the list: each control shows only at the left of it.
    let clip: Double?

    // A button, a switch or a dropdown that does not decode, as one with no icon or with no place (a NaN of the page
    // is null in JSON), is left out: its page control stays. Else one such control drops the whole state.
    private struct Lossy<T: Decodable>: Decodable {
        let value: T?
        init(from decoder: Decoder) throws { value = try? T(from: decoder) }
    }

    private enum CodingKeys: String, CodingKey {
        case dark, tabs, selected, bar, tint, buttons, toggles, dropdowns, icons, clip
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dark = try c.decode(Bool.self, forKey: .dark)
        tabs = try c.decode([Tab].self, forKey: .tabs)
        selected = try c.decode(String.self, forKey: .selected)
        bar = try? c.decodeIfPresent(Rect.self, forKey: .bar)
        tint = try? c.decodeIfPresent(String.self, forKey: .tint)
        buttons = (try c.decodeIfPresent([Lossy<Button>].self, forKey: .buttons) ?? []).compactMap(\.value)
        toggles = try c.decodeIfPresent([Lossy<Toggle>].self, forKey: .toggles)?.compactMap(\.value)
        dropdowns = try c.decodeIfPresent([Lossy<Dropdown>].self, forKey: .dropdowns)?.compactMap(\.value)
        icons = try? c.decodeIfPresent([String: String].self, forKey: .icons)
        clip = try? c.decodeIfPresent(Double.self, forKey: .clip)
    }
}
