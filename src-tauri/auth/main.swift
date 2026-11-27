// yonder-auth: shows a sign-in page in the sign-in window of macOS (ASWebAuthenticationSession). Google allows a
// sign-in there, and macOS uses the default browser, so a browser that knows the Google account signs in with no
// click. The app (src-tauri/src/main.rs) runs it with the URL. It exits with 0 when the page goes to
// yonder-auth://done (the Google sign-in of yonder.so does), and with 1 when the user closes the window.
import AppKit
import AuthenticationServices

final class Anchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1, height: 1), styleMask: [.borderless], backing: .buffered, defer: false)
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { window }
}

guard CommandLine.arguments.count > 1, let url = URL(string: CommandLine.arguments[1]) else { exit(2) }
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let anchor = Anchor()
anchor.window.center()
let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "yonder-auth") { callback, _ in exit(callback == nil ? 1 : 0) }
session.presentationContextProvider = anchor
DispatchQueue.main.async {
    anchor.window.orderFrontRegardless()
    if !session.start() { exit(1) }
}
app.run()
