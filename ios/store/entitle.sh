#!/bin/bash
# Signs the archive of `bun run testflight` ad hoc, with the entitlements of each target. The archive of Tauri is not
# signed, and `xcodebuild -exportArchive` keeps only the entitlements that the archive has. Without this script the App
# Store build had no Sign in with Apple, no push and no keychain group: the Sentry issues YONDER-1 and YONDER-5.
# The export then signs again with the certificate and the profiles of AppStoreExport.plist.
set -euo pipefail
app="$(cd "$1" && pwd)/Products/Applications/Yonder.app"
cd "$(dirname "$0")/../gen/apple"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# codesign does not expand the build settings of Xcode. The export sets aps-environment from the profile.
expand() { sed 's/$(AppIdentifierPrefix)/C5338FSGXJ./g' "$1" > "$tmp/$(basename "$1")" && echo "$tmp/$(basename "$1")"; }
# An outer bundle can be signed only when each bundle in it is signed.
codesign -f -s - --deep "$app"
codesign -f -s - --entitlements "$(expand YonderShare/YonderShare.entitlements)" "$app/PlugIns/YonderShare.appex"
codesign -f -s - --entitlements "$(expand yonder-ios_iOS/yonder-ios_iOS.entitlements)" "$app"
