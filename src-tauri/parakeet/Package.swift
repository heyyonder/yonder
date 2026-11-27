// swift-tools-version: 6.0
// yonder-parakeet: the dictation helper with Parakeet (main.swift). It needs FluidAudio, a Swift package, so build.rs does
// not compile it with swiftc as the other helpers. Build it here with `swift build -c release`. bridge/dictate.ts runs
// .build/release/yonder-parakeet.
import PackageDescription

let package = Package(
    name: "yonder-parakeet",
    platforms: [.macOS(.v14)],
    dependencies: [.package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.17.7")],
    targets: [.executableTarget(name: "yonder-parakeet", dependencies: ["FluidAudio"], path: ".", sources: ["main.swift"])],
    swiftLanguageModes: [.v5]
)
