// Tauri needs a binary on the Mac for its checks. The phone starts the library through `run`.
fn main() {
    yonder_android_lib::run()
}
