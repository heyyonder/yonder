// A native sheet from props (the ability "sheet", src/abilities.ts): an approval of the Canvas (docs/canvas.md) or any
// short form. The page gives a title, the agent, rows of a label and a value, an amount, a field for a one-time code,
// choices, a terms link, the buttons, Face ID before the answer, and an end time. The answer is
// { button, value, choice }, or { canceled } when the user closes it, or { expired } at the end time. The page draws its
// own sheet on an app with no such ability. The native parts take their props from the page, so a new form needs no
// new build.
import LocalAuthentication
import SwiftUI

struct KitSheetSpec: Decodable {
    struct Row: Decodable, Hashable { let label: String; let value: String }
    struct Choice: Decodable, Hashable { let id: String; let title: String }
    struct Link: Decodable { let title: String; let url: String }
    struct Button: Decodable, Hashable { let id: String; let title: String; let role: String? }
    struct Code: Decodable { let placeholder: String? }

    let title: String
    let subtitle: String?
    let agent: String?
    let amount: String?
    let rows: [Row]?
    let code: Code?
    let choices: [Choice]?
    let choice: String? // The label of the choices, as "Pay with".
    let terms: Link?
    let buttons: [Button]?
    let faceId: Bool?
    let expires: Double? // Milliseconds since 1970.
}

@MainActor
enum KitSheet {
    static func present(_ args: [String: Any], _ answer: @escaping ([String: Any]) -> Void) {
        guard let data = try? JSONSerialization.data(withJSONObject: args), let spec = try? JSONDecoder().decode(KitSheetSpec.self, from: data) else {
            return answer(["error": "The sheet needs a title."])
        }
        var sent = false
        let once = { (result: [String: Any]) in
            if sent { return }
            sent = true
            answer(result)
        }
        let host = UIHostingController(rootView: KitSheetView(spec: spec, done: { _ in }))
        let finish = { [weak host] (result: [String: Any]) in
            once(result)
            host?.dismiss(animated: true)
        }
        host.rootView = KitSheetView(spec: spec, done: finish)
        let closer = SheetCloser { once(["canceled": true]) }
        host.presentationController?.delegate = closer
        Abilities.keep(closer)
        if let sheet = host.sheetPresentationController {
            sheet.detents = [.medium(), .large()]
            sheet.prefersGrabberVisible = true
        }
        if let end = spec.expires {
            DispatchQueue.main.asyncAfter(deadline: .now() + max(0, end / 1000 - Date().timeIntervalSince1970)) { finish(["expired": true]) }
        }
        Abilities.present(host, once)
    }
}

// A swipe down closes the sheet: that is a cancel.
final class SheetCloser: NSObject, UIAdaptivePresentationControllerDelegate {
    let closed: @MainActor () -> Void
    init(_ closed: @escaping @MainActor () -> Void) { self.closed = closed }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        MainActor.assumeIsolated {
            closed()
            Abilities.drop(self)
        }
    }
}

struct KitSheetView: View {
    let spec: KitSheetSpec
    let done: ([String: Any]) -> Void
    @State private var code = ""
    @State private var choice = ""
    @State private var failed = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(spec.title).font(.title2.bold())
                    if let agent = spec.agent { Text(agent).font(.subheadline).foregroundStyle(.secondary) }
                    if let subtitle = spec.subtitle { Text(subtitle).font(.body).foregroundStyle(.secondary) }
                }
                if let amount = spec.amount { Text(amount).font(.largeTitle.bold()).monospacedDigit() }
                ForEach(spec.rows ?? [], id: \.self) { row in
                    LabeledContent(row.label, value: row.value)
                }
                if let field = spec.code {
                    // iOS offers the code of the last text message over the keyboard.
                    TextField(field.placeholder ?? "Code", text: $code)
                        .textContentType(.oneTimeCode)
                        .keyboardType(.numberPad)
                        .font(.title3.monospacedDigit())
                        .padding(12)
                        .background(.quaternary, in: .rect(cornerRadius: 12))
                }
                // The choices are a compact menu with the choice in it, so the sheet stays short.
                if let choices = spec.choices, !choices.isEmpty {
                    Picker(spec.choice ?? "Choice", selection: $choice) {
                        ForEach(choices, id: \.self) { Text($0.title).tag($0.id) }
                    }
                    .pickerStyle(.menu)
                    .onAppear { if choice.isEmpty { choice = choices[0].id } }
                }
                if let terms = spec.terms, let url = URL(string: terms.url) {
                    Link(terms.title, destination: url).font(.footnote)
                }
            }
            .padding(24)
        }
        // The buttons stay at the bottom of the sheet, also at its middle height, so the user never scrolls for them.
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if !failed.isEmpty { Text(failed).font(.footnote).foregroundStyle(.red) }
                HStack(spacing: 12) {
                    ForEach(spec.buttons ?? [KitSheetSpec.Button(id: "ok", title: "OK", role: nil)], id: \.self) { button in
                        Button(role: button.role == "destructive" ? .destructive : button.role == "cancel" ? .cancel : nil) {
                            Task { await choose(button) }
                        } label: {
                            Text(button.title).frame(maxWidth: .infinity).padding(.vertical, 6)
                        }
                        .modifier(KitButtonStyle(prominent: button.role == nil))
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(.background)
        }
    }

    // Face ID comes before a yes, when the page asks for it. A cancel and a destructive button need none.
    private func choose(_ button: KitSheetSpec.Button) async {
        if spec.faceId == true, button.role == nil {
            let context = LAContext()
            let ok = (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: spec.title)) ?? false
            if !ok { return failed = "Face ID did not confirm it." }
        }
        var result: [String: Any] = ["button": button.id]
        if spec.code != nil { result["value"] = code }
        if spec.choices?.isEmpty == false { result["choice"] = choice }
        done(result)
    }
}

// The glass buttons of iOS 26, and the bordered buttons before it.
struct KitButtonStyle: ViewModifier {
    let prominent: Bool

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            if prominent { content.buttonStyle(.glassProminent) } else { content.buttonStyle(.glass) }
        } else {
            if prominent { content.buttonStyle(.borderedProminent) } else { content.buttonStyle(.bordered) }
        }
    }
}
