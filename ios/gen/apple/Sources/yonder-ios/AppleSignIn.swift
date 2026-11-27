import AuthenticationServices
import UIKit

// Sign in with Apple, next to the Google sign-in of the page (src/account.ts). App Review asks for it in guideline 4.8,
// because the app has a Google sign-in. It asks only for the email, because the account of Yonder is an email. The
// identity token goes to the page: `window.yonderAppleSignIn(token)`, or "cancel" when the user closes the sheet, or
// "error:<code>" when Apple refuses it. The page sends the token to yonder.so, which checks it with the keys of
// Apple. `apple_sign_in` of ios/src/lib.rs calls it.
final class AppleSignIn: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    static let shared = AppleSignIn()

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    func start() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email]
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let token = (authorization.credential as? ASAuthorizationAppleIDCredential)?.identityToken.flatMap { String(data: $0, encoding: .utf8) }
        answer(token ?? "error")
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if (error as? ASAuthorizationError)?.code == .canceled {
            answer("cancel")
            return
        }
        // Only digits go in the quotes. 1000 is ASAuthorizationError.unknown: the sheet never opens.
        let code = (error as? ASAuthorizationError)?.code.rawValue ?? (error as NSError).code
        answer("error:\(code)")
    }

    // The token is a JWT: letters, digits, "-", "_" and ".", so it is safe in the quotes.
    private func answer(_ result: String) {
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        windows.lazy.compactMap(findWebView).first?.evaluateJavaScript("window.yonderAppleSignIn?.(\"\(result)\")")
    }
}

@_cdecl("yonder_apple_sign_in")
public func yonderAppleSignIn() {
    DispatchQueue.main.async { AppleSignIn.shared.start() }
}
