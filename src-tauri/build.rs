// The app manifest gives each command of main.rs a permission, so that the page from the bridge (a remote origin, see
// capabilities/default.json) can call it. Tauri refuses a command with no permission. Add each new command here and in
// the capability. Else the command fails with no request: Check says "Up to date", and the Mac copy stays on its version.
// It also compiles the "Hey Yonder" listener and the voice note (wake/), the dictation helper (dictate/main.swift) and the
// sign-in window (auth/main.swift) and the area selection of the record button (select/main.swift) into
// binaries/. Tauri puts them in the bundle (`externalBin`), next to the app. main.rs runs yonder-wake, and the
// bridge runs yonder-dictate and yonder-select.
use std::process::Command;

fn main() {
    std::fs::create_dir_all("binaries").expect("the folder binaries/");
    for name in ["wake", "dictate", "auth", "select"] {
        // Each .swift file of the folder: wake/ has Note.swift next to main.swift.
        println!("cargo:rerun-if-changed={name}");
        let mut sources: Vec<String> = std::fs::read_dir(name)
            .expect("the folder of the helper")
            .filter_map(|e| e.ok()?.path().to_str().map(String::from))
            .filter(|p| p.ends_with(".swift"))
            .collect();
        sources.sort();
        // macOS 26 is the newest macOS for Intel Macs. Without -target, swiftc builds for the macOS of this Mac.
        let target = std::env::var("TARGET").unwrap();
        let arch = if target.starts_with("x86_64") { "x86_64" } else { "arm64" };
        let out = format!("binaries/yonder-{name}-{target}");
        let ok = Command::new("swiftc")
            .args(["-O", "-target", &format!("{arch}-apple-macos26.0")])
            .args(&sources)
            .args(["-o", &out])
            .status()
            .is_ok_and(|s| s.success());
        assert!(ok, "swiftc could not compile {name}/");
        // `tauri build --target universal-apple-darwin` builds each chip in turn, and then bundles the
        // -universal-apple-darwin helpers. So when the helpers of both chips exist, lipo merges them.
        let arm = format!("binaries/yonder-{name}-aarch64-apple-darwin");
        let intel = format!("binaries/yonder-{name}-x86_64-apple-darwin");
        if std::path::Path::new(&arm).exists() && std::path::Path::new(&intel).exists() {
            let universal = format!("binaries/yonder-{name}-universal-apple-darwin");
            let ok = Command::new("lipo").args(["-create", &arm, &intel, "-output", &universal]).status().is_ok_and(|s| s.success());
            assert!(ok, "lipo could not merge {name}/");
        }
    }
    // Touch ID for the Start of a new task link (owner.m) runs in the app itself, so the dialog of macOS names Yonder and
    // shows its icon. From the helper yonder-auth it said "yonder-auth is trying to ...", with the icon of a bare program.
    println!("cargo:rerun-if-changed=owner.m");
    let out = std::env::var("OUT_DIR").unwrap();
    let target = std::env::var("TARGET").unwrap();
    let arch = if target.starts_with("x86_64") { "x86_64" } else { "arm64" };
    let ok = Command::new("clang")
        .args(["-c", "-fobjc-arc", "-O2", "-target", &format!("{arch}-apple-macos26.0"), "owner.m", "-o", &format!("{out}/owner.o")])
        .status()
        .is_ok_and(|s| s.success());
    assert!(ok, "clang could not compile owner.m");
    let ok = Command::new("ar").args(["crs", &format!("{out}/libowner.a"), &format!("{out}/owner.o")]).status().is_ok_and(|s| s.success());
    assert!(ok, "ar could not make libowner.a");
    println!("cargo:rustc-link-search=native={out}");
    println!("cargo:rustc-link-lib=static=owner");
    println!("cargo:rustc-link-lib=framework=LocalAuthentication");
    println!("cargo:rustc-link-lib=framework=AppKit");
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["set_call_live", "set_mic", "set_audio", "call_level", "set_wake", "set_keys", "auth_sheet", "check_update", "install_update", "opened", "owner_check", "bridge_port"])),
    )
    .expect("failed to run the Tauri build script")
}
