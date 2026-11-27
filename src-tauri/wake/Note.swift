// The voice note: tap the key of the voice note (off by default, Settings, Keys) in any app, talk, and tap it
// again. The words go into the text field where you were, also when another window came to the front in the meantime.
// The small notch shows the orb, the icon of that app and the bars of the voice while it listens (NoteView in
// main.swift).
// The paste and the questions to the other app need the Accessibility permission of Yonder.
import AppKit

// The window that was in front at the first tap. The app alone is not enough: the window that most often comes to the
// front during a voice note is a second window of the same app, such as a link that opens a new browser window.
struct Destination {
    let pid: pid_t
    private let app: AXUIElement
    // nil when the app shows no window to Accessibility. Then any window of the app is the same place.
    private let window: AXUIElement?

    static func inFront() -> Destination? {
        guard let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier else { return nil }
        let app = AXUIElementCreateApplication(pid)
        return Destination(pid: pid, app: app, window: focusedWindow(of: app))
    }

    var isInFront: Bool {
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { return false }
        guard let window, let now = Self.focusedWindow(of: app) else { return true }
        return CFEqual(window, now)
    }

    var isGone: Bool { NSRunningApplication(processIdentifier: pid)?.isTerminated ?? true }

    var icon: NSImage? { NSRunningApplication(processIdentifier: pid)?.icon }

    // Three requests, because one is not enough. The raise puts the window over the other windows of its app. The
    // frontmost attribute brings the app to the front, also from an app with no Dock icon, as this helper is. The
    // activate is the usual request. The other app does them at its next turn, so deliver waits for the window.
    func bringBack() {
        if let window { AXUIElementPerformAction(window, kAXRaiseAction as CFString) }
        AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
        NSRunningApplication(processIdentifier: pid)?.activate()
    }

    // The focused window, else the main window: a sheet or a panel can have the focus while the main window is the place.
    private static func focusedWindow(of app: AXUIElement) -> AXUIElement? {
        for attribute in [kAXFocusedWindowAttribute, kAXMainWindowAttribute] {
            var value: CFTypeRef?
            guard AXUIElementCopyAttributeValue(app, attribute as CFString, &value) == .success,
                  let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { continue }
            return (value as! AXUIElement)
        }
        return nil
    }
}

// Puts the words in the window of the voice note. If another window came to the front, that window comes back first.
// If it does not come back in 1.2 s, or its app quit, the words stay on the clipboard and the notch says so.
func deliver(_ text: String, to into: Destination?) {
    guard let into, !into.isGone else { return copied(text) }
    if into.isInFront { return Paste.text(text) }
    log("yonder-wake: another window came to the front, so the voice note brings its window back")
    into.bringBack()
    let deadline = Date().addingTimeInterval(1.2)
    let timer = Timer(timeInterval: 0.04, repeats: true) { timer in
        if into.isInFront {
            timer.invalidate()
            // The text field gets its cursor back a moment after its window is in front.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { Paste.text(text) }
        } else if Date() >= deadline {
            timer.invalidate()
            copied(text)
        }
    }
    // In the common modes, so that an open menu does not stop the timer.
    RunLoop.main.add(timer, forMode: .common)
}

func copied(_ text: String) {
    Paste.copy(text)
    notch.fail("Copied. Press ⌘V to paste.")
}

// A paste is faster than a key press for each letter, does not race the autocomplete of the app, and gives the right
// letters on each keyboard layout. It borrows the clipboard for 0.75 s and then puts back all of it, also an image.
enum Paste {
    static func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    static func text(_ text: String) {
        let pasteboard = NSPasteboard.general
        let saved = (pasteboard.pasteboardItems ?? []).map { item in
            item.types.reduce(into: [NSPasteboard.PasteboardType: Data]()) { $0[$1] = item.data(forType: $1) }
        }
        copy(text)
        // ⌘V at the HID tap, so each app gets it. The flags are ⌘ alone, so a key that is still down does not change it.
        let source = CGEventSource(stateID: .combinedSessionState)
        for down in [true, false] {
            let event = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: down)
            event?.flags = .maskCommand
            event?.post(tap: .cghidEventTap)
        }
        // A restore that is too soon pastes the old clipboard.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) {
            pasteboard.clearContents()
            pasteboard.writeObjects(saved.map { stored in
                let item = NSPasteboardItem()
                for (type, data) in stored { item.setData(data, forType: type) }
                return item
            })
        }
    }
}
