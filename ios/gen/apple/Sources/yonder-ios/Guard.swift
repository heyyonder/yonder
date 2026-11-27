// Face ID for the relay (GUARD in bridge/relay.ts): a P-256 key in the Secure Enclave, which signs a challenge of the
// Mac only after Face ID or the passcode of the phone. The Mac keeps the public key and refuses this phone through the
// relay until it gets a signature, so a copy of the pairing key or a bad front end alone cannot use the relay. The key
// never leaves the Secure Enclave: the Keychain holds only its encrypted handle, which works on this phone only. The
// simulator says that it has a Secure Enclave, but it cannot make a key with Face ID ("This call is not supported on iOS
// Simulator."), so it uses a software key of the Keychain behind the same prompt. A phone never does.
import CryptoKit
import Foundation
import LocalAuthentication
import Security

enum Guard {
  private static let service = "com.vladartym.yonder.guard"
  private static let reason = "Allow the relay"
  #if targetEnvironment(simulator)
    private static let simulator = true
  #else
    private static let simulator = false
  #endif

  // The public key, 65 bytes in base64url, as WebCrypto imports it. The key is made the first time.
  static func publicKey() throws -> String {
    if simulator { return b64(soft().publicKey.x963Representation) }
    return b64(try enclave(nil).publicKey.x963Representation)
  }

  // The signature of `challenge` (base64url): r and s, 64 bytes, which WebCrypto verifies. It waits for Face ID or the
  // passcode, so it must not run on the main thread.
  static func sign(_ challenge: String) throws -> String {
    guard let data = unb64(challenge) else { throw CarError("The challenge is not base64url.") }
    if simulator {
      let ask = DispatchSemaphore(value: 0)
      var ok = false
      LAContext().evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { yes, _ in ok = yes; ask.signal() }
      ask.wait()
      guard ok else { throw CarError("The user did not allow the relay.") }
      return b64(try soft().signature(for: data).rawRepresentation)
    }
    let context = LAContext()
    context.localizedReason = reason
    return b64(try enclave(context).signature(for: data).rawRepresentation)
  }

  // Face ID or the passcode, as the lock of the app, so a new face in the settings of the phone does not lock the user out.
  private static func enclave(_ context: LAContext?) throws -> SecureEnclave.P256.Signing.PrivateKey {
    if let handle = read() { return try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: handle, authenticationContext: context) }
    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, [.privateKeyUsage, .userPresence], &error) else {
      throw error!.takeRetainedValue() as Error
    }
    let key = try SecureEnclave.P256.Signing.PrivateKey(accessControl: access, authenticationContext: context)
    write(key.dataRepresentation)
    return key
  }

  private static func soft() -> P256.Signing.PrivateKey {
    if let raw = read(), let key = try? P256.Signing.PrivateKey(rawRepresentation: raw) { return key }
    let key = P256.Signing.PrivateKey()
    write(key.rawRepresentation)
    return key
  }

  private static func query() -> [CFString: Any] {
    [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: "key"]
  }

  private static func read() -> Data? {
    var item: CFTypeRef?
    var q = query()
    q[kSecReturnData] = true
    return SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess ? item as? Data : nil
  }

  private static func write(_ data: Data) {
    SecItemDelete(query() as CFDictionary)
    var q = query()
    q[kSecValueData] = data
    q[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    SecItemAdd(q as CFDictionary, nil)
  }
}

private func put(_ text: String, _ out: UnsafeMutablePointer<CChar>, _ size: Int) {
  let bytes = Array(text.utf8CString.prefix(size - 1)) + [0]
  bytes.withUnsafeBufferPointer { out.update(from: $0.baseAddress!, count: bytes.count) }
}

// The `guard_key` command of ios/src/lib.rs calls this. `out` gets the public key, or "" when the phone cannot make one.
@_cdecl("yonder_guard_key")
public func yonderGuardKey(_ out: UnsafeMutablePointer<CChar>, _ size: Int) {
  put((try? Guard.publicKey()) ?? "", out, size)
}

// The `guard_sign` command of ios/src/lib.rs calls this off the main thread. `out` gets the signature, or "" when the
// user cancels.
@_cdecl("yonder_guard_sign")
public func yonderGuardSign(_ challenge: UnsafePointer<CChar>, _ out: UnsafeMutablePointer<CChar>, _ size: Int) {
  put((try? Guard.sign(String(cString: challenge))) ?? "", out, size)
}
