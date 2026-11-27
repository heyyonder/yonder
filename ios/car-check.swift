// A check of the Swift link of the car call (ios/gen/apple/Sources/yonder-ios/CarLink.swift) against the live
// bridge, on the Mac. It pairs a test key with a pairing code, calls the bridge through the relay, connects again
// with the paired key, and removes the pairing. Run it with:
//   swiftc -parse-as-library -o /tmp/car-check ios/car-check.swift ios/gen/apple/Sources/yonder-ios/CarLink.swift && /tmp/car-check
import CryptoKit
import Foundation

func local(_ path: String, _ method: String = "GET") async throws -> [String: Any] {
  var req = URLRequest(url: URL(string: "http://127.0.0.1:7787\(path)")!)
  req.httpMethod = method
  req.setValue("http://localhost:1420", forHTTPHeaderField: "Origin")
  let (data, _) = try await URLSession.shared.data(for: req)
  return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
}
// A failed check does not stop the run, so that the pairing is always removed.
nonisolated(unsafe) var failed = false
func check(_ ok: Bool, _ what: String) {
  print(ok ? "ok: \(what)" : "FAIL: \(what)")
  if !ok { failed = true }
}

@main enum CarCheck {
  static func main() async throws {
    let code = try await local("/relay", "POST")
    let link = URLComponents(string: code["link"] as! String)!
    let get = { (name: String) in link.queryItems!.first { $0.name == name }!.value! }
    let key = P256.KeyAgreement.PrivateKey()
    let pub = b64(key.publicKey.x963Representation)
    let pairing = CarPairing(relay: get("relay"), room: get("room"), mac: get("mac"), device: String(pub.suffix(16)))
    do {
      let first = CarLink(pairing: pairing, key: key, secret: unb64(get("secret"))!)
      try await first.pair("Car check")
      await first.close()
      let car = CarLink(pairing: pairing, key: key)
      let (status, body) = try await car.fetch("/version")
      check(status == 200, "GET /version through the relay: \(String(decoding: body.prefix(80), as: UTF8.self))")
      let projects = try await car.callTool("list_projects", ["query": "yonder"])
      check(projects.contains("\"yonder\""), "list_projects through MCP: \(projects.prefix(80))")
      do {
        _ = try await car.callTool("get_worker", ["worker": "99999"])
        check(false, "a tool error throws")
      } catch {
        check("\(error.localizedDescription)".contains("99999"), "a tool error throws: \(error.localizedDescription)")
      }
      // Two requests at the same time: the frames must leave and open in the order of their counters.
      async let a = car.fetch("/version")
      async let b = car.fetch("/version")
      let both = try await [a.status, b.status]
      check(both == [200, 200], "two requests at the same time")
      await car.close()
      let again = try await car.fetch("/version")
      check(again.status == 200, "connects again after a close")
      let stranger = CarLink(pairing: pairing, key: P256.KeyAgreement.PrivateKey())
      do {
        _ = try await stranger.fetch("/version")
        check(false, "refuses a key that is not paired")
      } catch {
        check(true, "refuses a key that is not paired: \(error.localizedDescription)")
      }
    } catch {
      check(false, error.localizedDescription)
    }
    _ = try await local("/relay?phone=\(pub.addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)", "DELETE")
    print("removed the test pairing")
    if failed { exit(1) }
  }
}
