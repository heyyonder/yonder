// yonder-select: the area selection of the record button (bridge/recording.ts). It covers each screen with a dark layer
// and a cross cursor. The user drags an area, and it prints "x,y,w,h" in points from the top left of the main screen, the
// form of `screencapture -R`. Escape, a right click, a click without a drag, or SIGINT exits with code 1 and prints nothing.
// After the drag it stays as a stop button in the menu bar, as the stop of macOS, and a click on it exits with code 0.
// The bridge then stops the recording. During a recording the user works in another app, and there the first click on
// the record button of Yonder only brings Yonder to the front. The stop in the menu bar works at the first click.
// While it stays, it prints each click in the area: "click <Unix ms> <x> <y> <app>", in points from the top left of the
// area, so the agent knows where and when the user clicked. A global monitor of the mouse needs no permission.
// macOS 27 refuses `screencapture -i -v`, and its toolbar (-iU) keeps the last area and does not take a new drag.
import AppKit

var start: NSPoint?
var area = NSRect.zero // Global, bottom-left origin, as NSEvent.mouseLocation.
var limit = NSRect.zero // The screen of the first click. The area stays on it, because screencapture records one screen.
var views: [Layer] = []

func cancel() -> Never { exit(1) }

final class Layer: NSView {
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true } // The first click drags, also when Yonder stays active.
  override var acceptsFirstResponder: Bool { true }
  override func resetCursorRects() { addCursorRect(bounds, cursor: .crosshair) }
  override func draw(_ dirty: NSRect) {
    let local = area.offsetBy(dx: -window!.frame.minX, dy: -window!.frame.minY)
    NSColor.black.withAlphaComponent(0.35).setFill()
    let dim = NSBezierPath(rect: bounds)
    if !area.isEmpty { dim.append(NSBezierPath(rect: local).reversed) }
    dim.fill()
    if !area.isEmpty {
      NSColor.white.setStroke()
      let line = NSBezierPath(rect: local.insetBy(dx: 0.5, dy: 0.5))
      line.lineWidth = 1
      line.stroke()
    }
  }
  override func mouseDown(with event: NSEvent) {
    start = NSEvent.mouseLocation
    limit = window!.screen!.frame
  }
  override func mouseDragged(with event: NSEvent) {
    guard let s = start else { return }
    let p = NSEvent.mouseLocation
    let x0 = min(max(min(s.x, p.x), limit.minX), limit.maxX), x1 = min(max(max(s.x, p.x), limit.minX), limit.maxX)
    let y0 = min(max(min(s.y, p.y), limit.minY), limit.maxY), y1 = min(max(max(s.y, p.y), limit.minY), limit.maxY)
    area = NSRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0)
    views.forEach { $0.needsDisplay = true }
  }
  override func mouseUp(with event: NSEvent) {
    guard area.width >= 8, area.height >= 8 else { cancel() }
    let top = NSScreen.screens[0].frame.maxY // The main screen holds the origin of both forms.
    let line = "\(Int(area.minX.rounded())),\(Int((top - area.maxY).rounded())),\(Int(area.width.rounded())),\(Int(area.height.rounded()))\n"
    FileHandle.standardOutput.write(line.data(using: .utf8)!)
    NSApp.windows.forEach { $0.orderOut(nil) }
    showStop()
    watchClicks(top: top)
  }
  override func rightMouseDown(with event: NSEvent) { cancel() }
  override func keyDown(with event: NSEvent) { if event.keyCode == 53 { cancel() } }
}

var stop: NSStatusItem?
final class Stopper: NSObject {
  @objc func click() { exit(0) }
}
let stopper = Stopper()
func showStop() {
  let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
  item.button?.image = NSImage(systemSymbolName: "stop.circle.fill", accessibilityDescription: "Stop recording")
  item.button?.target = stopper
  item.button?.action = #selector(Stopper.click)
  stop = item
}

func watchClicks(top: CGFloat) {
  let x0 = area.minX, y0 = top - area.maxY
  NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { _ in
    let p = NSEvent.mouseLocation
    let x = p.x - x0, y = top - p.y - y0
    guard x >= 0, y >= 0, x <= area.width, y <= area.height else { return }
    // The app of the frontmost normal window under the click. The owner names need no permission, the window titles do.
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    let app = windows.first { w in
      guard (w[kCGWindowLayer as String] as? Int) == 0, let b = w[kCGWindowBounds as String] as? NSDictionary, let r = CGRect(dictionaryRepresentation: b) else { return false }
      return r.contains(CGPoint(x: p.x, y: top - p.y))
    }?[kCGWindowOwnerName as String] as? String ?? ""
    let line = "click \(Int(Date().timeIntervalSince1970 * 1000)) \(Int(x.rounded())) \(Int(y.rounded())) \(app)\n"
    FileHandle.standardOutput.write(line.data(using: .utf8)!)
  }
}

final class Cover: NSWindow {
  override var canBecomeKey: Bool { true }
}

signal(SIGINT) { _ in exit(1) }
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
for screen in NSScreen.screens {
  let w = Cover(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
  w.level = .screenSaver
  w.isOpaque = false
  w.backgroundColor = .clear
  w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
  let v = Layer(frame: NSRect(origin: .zero, size: screen.frame.size))
  w.contentView = v
  views.append(v)
  w.makeKeyAndOrderFront(nil)
  w.makeFirstResponder(v)
}
app.activate(ignoringOtherApps: true)
NSCursor.crosshair.set()
app.run()
