// The pairing and the key of the Swift call, in the Keychain. The iPhone app (the car) and the Apple Watch app
// (docs/watch.md) use this file. Each device has its own Keychain, so the watch keeps its own key here.
import CryptoKit
import Foundation
import Security

// "After first unlock", so that the car can start a call while the iPhone is locked. "This device only", so that the
// key never leaves the device.
enum CarStore {
  private static let service = "com.vladartym.yonder.car"

  static func pairing() -> CarPairing? {
    read("pairing").flatMap { try? JSONDecoder().decode(CarPairing.self, from: $0) }
  }

  static func save(_ pairing: CarPairing) {
    if let data = try? JSONEncoder().encode(pairing) { write("pairing", data) }
  }

  // The key of the car call. It is made the first time.
  static func key() -> P256.KeyAgreement.PrivateKey {
    if let raw = read("key"), let key = try? P256.KeyAgreement.PrivateKey(rawRepresentation: raw) { return key }
    let key = P256.KeyAgreement.PrivateKey()
    write("key", key.rawRepresentation)
    return key
  }

  private static func query(_ name: String) -> [CFString: Any] {
    [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: name]
  }

  private static func read(_ name: String) -> Data? {
    var item: CFTypeRef?
    var q = query(name)
    q[kSecReturnData] = true
    return SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess ? item as? Data : nil
  }

  private static func write(_ name: String, _ data: Data) {
    SecItemDelete(query(name) as CFDictionary)
    var q = query(name)
    q[kSecValueData] = data
    q[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(q as CFDictionary, nil)
  }
}
