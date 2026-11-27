#!/bin/sh
# Build the iPhone app and upload it to TestFlight. There is no fastlane step.
# The dev bridge starts this script after a commit that changes the native app.
# One build runs at a time. A hand run uses the same lock.
set -e
cd "$(dirname "$0")/../.."
LOCK="${HOME}/.config/yonder/testflight.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  pid=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "A TestFlight build already runs."
    exit 1
  fi
  rm -rf "$LOCK"
  mkdir "$LOCK" || { echo "A TestFlight build already runs."; exit 1; }
fi
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

# The archive stays unsigned only when these variables are set. The export then signs it.
set -a
. "${HOME}/.config/yonder/release.env"
set +a
# The DSN of Sentry, so that this build sends its panics. Only the computer of the owner has it in .env.
SENTRY_DSN="${SENTRY_DSN:-$(sed -n 's/^SENTRY_DSN=//p' "${HOME}/.config/yonder/.env" 2>/dev/null)}"
export SENTRY_DSN
security unlock-keychain -p "$RELEASE_KEYCHAIN_PASSWORD" "$RELEASE_KEYCHAIN"

# A release with NO_UPLOAD builds the IPA and does not send it. The key names in
# release.env are APPLE_API_KEY and APPLE_API_ISSUER. altool reads ASC_KEY_ID.
if [ -z "$NO_UPLOAD" ]; then
  ASC_KEY_ID="${ASC_KEY_ID:-$APPLE_API_KEY}"
  ASC_ISSUER_ID="${ASC_ISSUER_ID:-$APPLE_API_ISSUER}"
  export ASC_KEY_ID ASC_ISSUER_ID
fi

V=$(bun version.ts)
echo "TestFlight $V"
for P in YonderIsland YonderShare YonderWatch; do
  plutil -replace CFBundleShortVersionString -string "$V" "ios/gen/apple/$P/Info.plist"
  plutil -replace CFBundleVersion -string "$V" "ios/gen/apple/$P/Info.plist"
done
bun run ios build --archive-only --config "{\"version\":\"$V\"}"
ios/store/entitle.sh ios/gen/apple/build/yonder-ios_iOS.xcarchive
rm -rf ios/gen/apple/build/appstore
xcodebuild -exportArchive \
  -archivePath ios/gen/apple/build/yonder-ios_iOS.xcarchive \
  -exportPath ios/gen/apple/build/appstore \
  -exportOptionsPlist ios/store/AppStoreExport.plist
# The dev bridge uploads a native commit within seconds, so the release of the same commit then has the build already,
# and App Store Connect refuses it again ("The bundle version must be higher"). The build stays, for its dSYMs.
if [ "$(cat "${HOME}/.config/yonder/testflight.txt" 2>/dev/null)" = "$V" ]; then
  echo "TestFlight has $V already."
elif [ -n "$ASC_KEY_ID" ]; then
  xcrun altool --upload-package ios/gen/apple/build/appstore/Yonder.ipa \
    --api-key "$ASC_KEY_ID" --api-issuer "$ASC_ISSUER_ID"
  echo "$V" > "${HOME}/.config/yonder/testflight.txt"
fi
