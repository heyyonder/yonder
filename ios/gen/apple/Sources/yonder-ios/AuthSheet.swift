import AuthenticationServices
import UIKit

// The sign-in window of iOS (ASWebAuthenticationSession) for the Google sign-in of the page (src/account.ts). Google
// allows a sign-in there, and it uses the Google account of Safari. The window closes itself when the page goes to
// yonder-auth://done, and the result goes to the page: `window.yonderAuthSheet("done")`, or "cancel" when the user
// closes it. `auth_sheet` of ios/src/lib.rs calls it.
final class AuthSheet: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = AuthSheet()
    private var session: ASWebAuthenticationSession?

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    func start(_ url: URL) {
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "yonder-auth") { callback, _ in
            self.answer(callback == nil ? "cancel" : "done")
            self.session = nil
        }
        session.presentationContextProvider = self
        self.session = session
        // A window that cannot open is a cancel, so the page stops at once. Else the page waits for the sign-in for 7.5
        // minutes.
        if !session.start() {
            self.session = nil
            answer("cancel")
        }
    }

    private func answer(_ result: String) {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        windows.lazy.compactMap(findWebView).first?.evaluateJavaScript("window.yonderAuthSheet?.(\"\(result)\")")
    }
}

@_cdecl("yonder_auth_sheet")
public func yonderAuthSheet(url: UnsafePointer<CChar>) {
    guard let url = URL(string: String(cString: url)) else { return }
    DispatchQueue.main.async { AuthSheet.shared.start(url) }
}
