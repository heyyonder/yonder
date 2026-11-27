// The `read_picked` command of ios/src/lib.rs calls this for each video that the photo library picked. A video of the
// phone is often hundreds of MB, and it goes to the Mac through the relay in parts of 768 KB. So the phone first makes
// an MP4 of 1280 x 720 at most (a portrait video keeps its shape), which is about 7 times smaller for a 4K video. The
// bridge keeps frames of 1600 px at most, so text in a screen recording stays readable at 720p.
import AVFoundation

// Writes `input` as an MP4 to `output`, and returns false if AVFoundation cannot read or write it.
@_cdecl("yonder_shrink_video")
public func yonderShrinkVideo(_ input: UnsafePointer<CChar>, _ output: UnsafePointer<CChar>) -> Bool {
  let out = URL(fileURLWithPath: String(cString: output))
  try? FileManager.default.removeItem(at: out)
  guard let session = AVAssetExportSession(asset: AVURLAsset(url: URL(fileURLWithPath: String(cString: input))), presetName: AVAssetExportPreset1280x720)
  else { return false }
  session.outputURL = out
  session.outputFileType = .mp4
  session.shouldOptimizeForNetworkUse = true
  // The command runs on a thread of the async runtime of Tauri, not on the main thread, so it can wait here.
  let done = DispatchSemaphore(value: 0)
  session.exportAsynchronously { done.signal() }
  done.wait()
  return session.status == .completed
}
