// A switch of iOS at the place of a switch of the page (OnOff in src/Settings.tsx). On iOS 26 its knob turns into a
// lens of glass while the finger is on it, as in the Settings of iOS: the switch that WebKit draws keeps a plain white
// knob. A flip shows at once and clicks the switch of the page (NativeChrome.isOn).
import SwiftUI

@available(iOS 26.0, *)
struct NativeToggle: View {
    let id: String
    private let chrome = NativeChrome.shared

    var body: some View {
        if let toggle = chrome.toggles[id] {
            Toggle(toggle.label, isOn: chrome.isOn(id))
                .labelsHidden()
                .tint(toggle.tint.flatMap { Color(css: $0) })
                .disabled(!toggle.enabled)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
