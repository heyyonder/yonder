// Yonder on Android: only the window of the React app, the QR scanner for the pairing, the haptics, the browser
// for Yonder Preview, the native question before a closed tunnel opens, and the subscriptions of Google Play.
// The bridge, the menus, the menu bar icon and the right ⌘ key are only in the Mac app (src-tauri).
// Push notifications need Firebase on Android, and they are not built yet. See docs/mobile.md.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default();
    #[cfg(mobile)]
    let app = app.plugin(tauri_plugin_barcode_scanner::init()).plugin(tauri_plugin_haptics::init()).plugin(tauri_plugin_opener::init()).plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_biometric::init());
    app.run(tauri::generate_context!()).expect("Yonder could not start");
}
