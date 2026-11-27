---
name: native-ios
description: Lists the native SwiftUI and UIKit parts of the Yonder iPhone app and gives the steps to add one. Use before you build or change a control, menu, dialog, sheet or screen of the phone in src/, before you edit ios/ or yonder-ios/*.swift, and when the user asks for a native, SwiftUI, Liquid Glass or iOS look.
---

# Native iPhone parts

Tauri is the shell and React draws the page. On iOS 26 these parts are SwiftUI or UIKit, in `yonder-ios/`
(`ios/gen/apple/Sources/`), `ios/src/lib.rs` and `src/chrome.ts`. Ask the user before you add SwiftUI to the Mac app.

## Use a native part that exists before you build a control in React
| Need | Native part | Page side |
|---|---|---|
| Tab bar | UITabBar, `GlassTabBar.swift` | `.tablist`, `useNativeChrome` |
| Round icon button | `GlassButton` | `data-native`, `data-icon`, `data-glyph` |
| Button with a menu | native menu | `data-menu` (`ChromeMenuItem[]`), handler in `menus` |
| On and off | `NativeToggle` | `OnOff` in src/Settings.tsx |
| Choice of more than two | `GlassDropdown` (version 4) | `Dropdown` in src/Settings.tsx |
| Attach | `AttachSheet` (version 3) | `invoke("attach_sheet")` |
| Picture or video, web sign-in | Quick Look, the player of iOS (`QuickLook.swift`), `AuthSheet.swift` | `invoke("quick_look")`, `invoke("play_video")`, `invoke("auth_sheet")` |
| Sign in with Apple | `AppleSignIn.swift` | `invoke("apple_sign_in")` |
| Call status | Live Activity, `Island.swift` | `invoke("island")` |
| Haptics, Face ID, QR, push, purchase | Tauri plugins | `@tauri-apps/plugin-*` |

## Build the next native parts, not more React
These are page-only now: the dialogs (`.dialog`), the page menus (`.menu`), the segmented controls (`.seg`),
`.toast`, the agent sheet (`.sheet`), the swipe actions and the plans page. A new control of these kinds is native,
with the page form as its fallback. When you only change one of them, name its native form in your report.

## Prefer a presented part to a twin
- A presented part (alert, confirmation dialog, menu, sheet, picker, share sheet) has no place to follow, so it does
  not glitch. Use it when the job allows it.
- A twin floats on the rect of a page element. It hides in a scroll, a swipe back, a height animation and under the
  keyboard (`cover` in src/chrome.ts). Put a twin only on a control at a fixed place, never in a list that scrolls.

## Keep the page control as the fallback
- An update over the air carries only `src/`. An older app, iOS before 26 and Android get no new Swift.
- A new twin raises the version that `yonder_native_chrome` returns, and the page uses it only at
  `chromeVersion >= N`. A presented part returns false when it cannot show, and the page shows its own form.
- The page control keeps its one handler. A native tap calls `window.yonderChrome(kind, id, item)`, which clicks it.

## Add a native part in this order
1. A SwiftUI view in `yonder-ios/`, with one hosting view for each control. A large one takes the taps of the page.
2. A `@_cdecl("yonder_...")` function, or a field in `ChromeState.swift` for a twin. Use `@MainActor`.
3. `extern "C"` and a `#[tauri::command]` in `ios/src/lib.rs`, added to `generate_handler!`.
4. The page side with its fallback, then the new version in the `yonder_native_chrome` comment and in docs/wiki/phone.md.

## Test what the user sees
- Use XcodeBuildMCP `screenshot`, `snapshot_ui` and `record_sim_video` in an iOS 26 simulator, or the iPhone.
  Look in a scroll, in a swipe back and with the keyboard open: there the twins glitch.
- Read new SwiftUI APIs with the `sosumi` MCP server. A web view screenshot (Safari, `tauri` MCP) shows no native part.
