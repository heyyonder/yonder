// The link of the car call to the bridge on the Mac: the phone side of the relay of src/link.ts, in Swift. CarPlay
// can start Yonder with the iPhone locked and with no web view, so the car call cannot use the link of the web app.
// It has its own key, which the web app gives to the Mac (`/car-key` in bridge/relay.ts). The protocol is the same:
// a handshake with an ephemeral P-256 key, HKDF over both ECDH results, and AES-GCM with a counter as the nonce.
// It uses only Foundation and CryptoKit, so that a check can run it on the Mac (docs/carplay.md).
import CryptoKit
import Foundation

struct CarPairing: Codable {
  let relay: String
  let room: String
  let mac: String // The public key of the Mac, base64url.
  let device: String // The end of the public key of the phone, for the statistics of the relay.
  var account: String? // The token of the Yonder account (src/account.ts), for a Mac with no xAI key.
}

struct CarError: LocalizedError {
  let errorDescription: String?
  init(_ text: String) { errorDescription = text }
}

// Base64url, as in src/link.ts.
func b64(_ data: Data) -> String {
  data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")
}
func unb64(_ text: String) -> Data? {
  var s = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
  s += String(repeating: "=", count: (4 - s.count % 4) % 4)
  return Data(base64Encoded: s)
}

// A message: the length of the JSON head (4 bytes, big-endian), the head, and the body.
func pack(_ head: [String: Any], _ body: Data = Data()) throws -> Data {
  let json = try JSONSerialization.data(withJSONObject: head)
  var out = withUnsafeBytes(of: UInt32(json.count).bigEndian) { Data($0) }
  out.append(json)
  out.append(body)
  return out
}
func unpack(_ data: Data) throws -> (head: [String: Any], body: Data) {
  let bytes = [UInt8](data)
  guard bytes.count >= 4 else { throw CarError("A message of the Mac is too short.") }
  let length = Int(bytes[0]) << 24 | Int(bytes[1]) << 16 | Int(bytes[2]) << 8 | Int(bytes[3])
  guard bytes.count >= 4 + length,
    let head = try JSONSerialization.jsonObject(with: Data(bytes[4..<4 + length])) as? [String: Any]
  else { throw CarError("A message of the Mac is not valid.") }
  return (head, Data(bytes[(4 + length)...]))
}

actor CarLink {
  typealias Answer = (head: [String: Any], body: Data)
  private let pairing: CarPairing
  private let key: P256.KeyAgreement.PrivateKey
  // The secret of a pairing code. Only the check on the Mac pairs with it. The app gives its key to the Mac through
  // the link of the web app instead, so that the user does not scan the code again.
  private let secret: Data
  private var socket: URLSessionWebSocketTask?
  private var connecting: Task<Void, Error>?
  private var up = SymmetricKey(size: .bits256) // From the phone to the Mac.
  private var down = SymmetricKey(size: .bits256)
  private var sent: UInt64 = 0
  private var got: UInt64 = 0
  private var waiting: [Int: CheckedContinuation<Answer, Error>] = [:]
  private var next = 0

  init(pairing: CarPairing, key: P256.KeyAgreement.PrivateKey, secret: Data = Data()) {
    self.pairing = pairing
    self.key = key
    self.secret = secret
  }

  // A request to the bridge, such as fetch("/car?zone=..."). Only the path counts. It connects again after a drop.
  func fetch(_ path: String, method: String = "GET", headers: [String: String] = [:], body: Data = Data()) async throws -> (status: Int, body: Data) {
    let answer = try await request(["method": method, "path": path, "headers": headers], body: body)
    return (answer.head["status"] as? Int ?? 0, answer.body)
  }

  // Calls a bridge tool over MCP. The bridge is stateless, so one JSON-RPC request needs no handshake of MCP.
  // The text is JSON when the call succeeds.
  func callTool(_ name: String, _ arguments: [String: Any]) async throws -> String {
    let rpc: [String: Any] = ["jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": ["name": name, "arguments": arguments]]
    let (status, body) = try await fetch(
      "/mcp", method: "POST", headers: ["content-type": "application/json", "accept": "application/json, text/event-stream"],
      body: try JSONSerialization.data(withJSONObject: rpc))
    guard let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else {
      throw CarError("The bridge answered with status \(status): \(String(decoding: body.prefix(300), as: UTF8.self))")
    }
    if let error = json["error"] as? [String: Any] { throw CarError(error["message"] as? String ?? "The tool call failed.") }
    let result = json["result"] as? [String: Any] ?? [:]
    let text = (result["content"] as? [[String: Any]] ?? []).compactMap { $0["text"] as? String }.joined()
    if result["isError"] as? Bool == true { throw CarError(text) }
    return text
  }

  // Pairs with the code of `POST /relay` on the Mac. Only the check uses it.
  func pair(_ name: String) async throws {
    guard try await request(["pair": name]).head["paired"] as? Bool == true else { throw CarError("The Mac did not pair.") }
  }

  func close() {
    socket?.cancel(with: .normalClosure, reason: nil)
    socket = nil
  }

  private func request(_ head: [String: Any], body: Data = Data()) async throws -> Answer {
    try await connect()
    guard let socket else { throw CarError("The relay closed the connection.") }
    next += 1
    let id = next
    var head = head
    head["id"] = id
    // Seal and send in the same step of the actor, so that the frames leave in the order of their counters.
    let frame = try seal(pack(head, body))
    return try await withCheckedThrowingContinuation { done in
      waiting[id] = done
      socket.send(.data(frame)) { error in
        if let error { Task { await self.settle(id, .failure(error)) } }
      }
      Task {
        try? await Task.sleep(nanoseconds: 120_000_000_000)
        self.settle(id, .failure(CarError("The Mac did not answer in 2 minutes.")))
      }
    }
  }

  private func settle(_ id: Int, _ result: Result<Answer, Error>) {
    waiting.removeValue(forKey: id)?.resume(with: result)
  }

  private func connect() async throws {
    if socket?.state == .running, connecting == nil { return }
    if let connecting { return try await connecting.value }
    let task = Task { try await handshake() }
    connecting = task
    defer { connecting = nil }
    try await task.value
  }

  private func handshake() async throws {
    var parts = URLComponents(string: "\(pairing.relay.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/phone")
    parts?.queryItems = [URLQueryItem(name: "room", value: pairing.room), URLQueryItem(name: "device", value: pairing.device)]
    guard let url = parts?.url, let macPub = unb64(pairing.mac) else { throw CarError("The pairing of the car is not valid.") }
    let ws = URLSession.shared.webSocketTask(with: url)
    socket = ws
    sent = 0
    got = 0
    ws.resume()
    let ephemeral = P256.KeyAgreement.PrivateKey()
    let pub = key.publicKey.x963Representation
    let epub = ephemeral.publicKey.x963Representation
    do {
      try await ws.send(.data(pack(["v": 1, "pub": b64(pub), "epub": b64(epub), "pair": !secret.isEmpty])))
      // The answer of the Mac to the handshake: its ephemeral key.
      guard case .data(let hello) = try await ws.receive(), let macEpub = unb64(try unpack(hello).head["epub"] as? String ?? "") else {
        throw CarError("The Mac did not answer the handshake.")
      }
      let ecdh = { (own: P256.KeyAgreement.PrivateKey, peer: Data) throws -> Data in
        try own.sharedSecretFromKeyAgreement(with: P256.KeyAgreement.PublicKey(x963Representation: peer)).withUnsafeBytes { Data($0) }
      }
      let ikm = try ecdh(key, macPub) + ecdh(ephemeral, macEpub) + secret
      let salt = Data(SHA256.hash(data: pub + macPub + epub + macEpub))
      let bits = HKDF<SHA256>.deriveKey(
        inputKeyMaterial: SymmetricKey(data: ikm), salt: salt, info: Data("yonder relay 1".utf8), outputByteCount: 64
      ).withUnsafeBytes { Data($0) }
      up = SymmetricKey(data: bits.prefix(32))
      down = SymmetricKey(data: bits.suffix(32))
    } catch {
      ws.cancel()
      socket = nil
      throw closed(ws) ?? error
    }
    Task { await receive(ws) }
  }

  private func receive(_ ws: URLSessionWebSocketTask) async {
    do {
      while true {
        guard case .data(let frame) = try await ws.receive() else { continue }
        let answer = try unpack(try open(frame))
        if let id = answer.head["id"] as? Int { settle(id, .success(answer)) }
      }
    } catch {
      let why = closed(ws) ?? (error is CryptoKitError ? CarError("The answer of the Mac did not open. Pair the phone again.") : error)
      if socket === ws { socket = nil }
      ws.cancel()
      for id in Array(waiting.keys) { settle(id, .failure(why)) }
    }
  }

  // The reason of the relay or the Mac when it closed the connection, such as "This phone is not paired with the Mac."
  private func closed(_ ws: URLSessionWebSocketTask) -> CarError? {
    guard let reason = ws.closeReason, !reason.isEmpty else { return nil }
    return CarError(String(decoding: reason, as: UTF8.self))
  }

  private func nonce(_ n: UInt64) -> AES.GCM.Nonce {
    try! AES.GCM.Nonce(data: Data(count: 4) + withUnsafeBytes(of: n.bigEndian) { Data($0) })
  }

  private func seal(_ data: Data) throws -> Data {
    let box = try AES.GCM.seal(data, using: up, nonce: nonce(sent))
    sent += 1
    return box.ciphertext + box.tag
  }

  private func open(_ frame: Data) throws -> Data {
    guard frame.count >= 16 else { throw CarError("A frame of the Mac is too short.") }
    let box = try AES.GCM.SealedBox(nonce: nonce(got), ciphertext: frame.dropLast(16), tag: frame.suffix(16))
    got += 1
    return try AES.GCM.open(box, using: down)
  }
}
