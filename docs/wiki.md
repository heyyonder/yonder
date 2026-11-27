# The wiki of Yonder

What Yonder does, how each part works, and why. The rules for agents are in `CLAUDE.md`.

## Install the app

The rules for a rebuild and for `install-app` are in `CLAUDE.md`.

- Updates over the air: a change to the screen (`src/`) needs no rebuild.
  The bridge serves the newest build of `dist/` on its own port
  (`http://127.0.0.1:7787/`), and the Mac app loads its page from there
  (`src/front.ts`). The app takes its `localStorage` (theme, zoom, cost)
  with it on the first load. Without the bridge, the app runs the front
  end of its own build. `src-tauri/capabilities/default.json` lets the
  page of the bridge use the native features (`remote`), and
  `src-tauri/build.rs` gives `set_call_live` a permission for it.
- Live changes of the screen: a change of the screen reaches the Mac and
  the phones by itself, in seconds, with no TestFlight build and no blue
  "Update available" button. So the user can change the screen live by
  voice:
  - The bridge builds `dist/` by itself (`FRONT` in `bridge/main.ts`).
    It reads HEAD every 3 seconds. After a commit that changes an input
    of the build (`src/`, `public/`, `index.html`, `vite.config.ts`,
    `version.ts`, `channel.json`, `package.json`, `bun.lock` and
    `bridge/talk.md`), it builds again in about 2 seconds. A commit that
    changes none of them builds nothing. The build waits while these
    paths in the checkout are not the same as HEAD, because an agent
    that edits the checkout itself is not done. `dist/commit.txt` names
    the commit of the build, and `front-build.log` in `~/.config/yonder`
    has the output. A build that fails keeps the old `dist/`. Only the
    bridge on port 7787 builds. A build after a commit is no update for
    the user, so the app shows no "Updating…" for it (`building`).
  - The app asks `/front` every 5 seconds. A new screen loads with no
    button and no notice (`useFront` in `src/front.ts`).
  - A build with the same JS as the running screen has only new CSS.
    `dist/code.txt` is a hash of the JS with no build ID and no build
    time (`vite.config.ts`). The page then puts the new CSS in at once,
    with no new load, also during a call (`restyle`). This is the live
    path during a call.
  - Another build loads with a new load of the page, when that load
    shows the same screen (`settled`): no call, no talk view, no text in
    a box, no dialog, menu or settings page, and each list at its top (a
    conversation at its end). The app opens the same tab and agent again
    (`resume`). The phone loads it when the app goes to the background.
    In the records of iOS, each new load in the background (`render
    back_forward`) showed the app. The Mac loads it at once, also while
    the user uses the window or a settings page, unless a box has text or
    a click, key or scroll came in the last 3 seconds. On the Mac a
    scroll counts only from the wheel of a mouse or a trackpad. A running
    agent scrolls its chat to the end at each step, and else that holds
    each new screen while the user watches an agent. A field of a
    settings page shows a saved value, so it holds an update only after
    the user typed in it (`typed` in `src/front.ts`). Else the theme and
    the word for agents in the Settings hold each update of the Mac, and
    the user sees old Settings. On the iPhone in front, only the native
    cover (version 5 of the native chrome, `native_cover`, from
    TestFlight 2.93.519) lets a new screen load: after 3 seconds with no
    touch, a picture of the screen covers the web view during the load.
    A tap on Update or an update by voice (`accept`) still loads it at
    once. The Face ID lock does not ask again for a new load (`kept` in
    `src/Lock.tsx`, see "Phone").
  - A new screen that throws before it shows the app goes back to the
    last good screen at once (`rollback`), not to the old screen of the
    install. The last good screen is in IndexedDB (`yonder-front`),
    because `localStorage` has no room for a second bundle of 1.7 MB. A
    screen that fails before its own code runs is marked bad at the next
    start, which runs the last good screen too, from an install with this
    code. An older install runs the screen of the install.
  - The call button shows no update for a new screen. On the Mac it
    shows only a rebuild of the Mac app (`shell`) and a new version of a
    download. The phone shows a newer phone app only in Settings: a
    newer TestFlight build of this Mac (`testflight` of `/front`, from
    `~/.config/yonder/testflight.txt`), the App Store or Google Play,
    or a screen that needs a newer app.
  - Each check compares a newer app with the installed app, not with the
    screen. So Settings shows the installed app as "App" under
    "Version", the screen, when the two differ (`installed` in
    `src/front.ts`). Else Settings offers "2.98.645 is ready" under the
    screen 2.103.694, which looks like an older version, although
    2.98.645 is newer than the app 2.93.519.
  - A phone that runs an older screen, from before the live changes,
    still shows "Update available" one more time. One tap, or a new
    start of the app, loads the new code.
  - A change of `phone.json` on the computer reaches the phone in about
    5 seconds: `/front` gives its version (`config`), and the phone syncs
    it when it changes (`src/phone-config.ts`), not only when the app
    opens or comes to the front. The look of the app lives there (see
    `docs/shell.md` and `docs/canvas.md`).
- `/front` gives the build of `dist/` (`dist/build.txt`, from
  `vite.config.ts`). The app asks every 5 seconds. `shell` in the
  answer is true when
  `src-tauri/` changed after the build of the installed app: the bridge
  reads the version "2.B.N" of `/Applications/Yonder.app` and compares
  commit N with HEAD. Then only `install-app` updates the app.
- After the reload, the app opens the same tab and the same agent or
  call again. The app keeps them in `view` in `localStorage`, and
  `front.ts` copies them to `resume` just before the reload. Only an
  update reads `resume`. A new start of the app opens the last tab,
  project and agent from `view`. iOS often ends the app in the
  background, so the user stays in an agent until they go back.
- The app also starts on the Closed tab when the user left it there.
- The next three items are true only for a native update of the Mac.
- An update shows in the call row, not as a notice over the screen. The
  call button shrinks to a circle with a phone (red during a call), and
  a blue pill with white text fills the rest of the row: "Update
  available", then "Updating…" or "Updating to 2.B.N…" with a turning
  icon. A spring animates the change. The circle still starts or ends
  the call.
- During a call, a new version does not load, unless the user asked
  for the update by voice (see `rebuild_app`). Then the "Update
  available" pill shows. A click ends the call, and the new front end
  loads. When the Mac app needs a rebuild (`shell`), or `dist/` is
  older than the source, the click does the same as the update button.
- On the Mac and on the phone, with no call, the call button itself
  turns blue and shows the update, so the user need not open the
  Settings: "Update available" with the update icon, then "Updating…".
  A click does the same as the update button. While an update waits,
  the row has no button to start a call. The circle and the blue pill
  show only during a call.
- On the Mac, only a rebuild of the Mac app shows as an update, because
  the bridge builds the screen by itself. The app reads the version
  every 30 seconds, so the update shows within 30 seconds of a commit.
- The phone gets the new front end too. It downloads `/front?bundle`
  (the JS and the CSS of `dist/`, gzipped to about 430 KB, because the
  relay sends a response in one frame of 1 MiB at most), keeps it in
  `localStorage`, and runs it in place of the bundle of its install when
  the bundle is newer. The iPhone runs it when the app goes to the
  background (see "Live changes of the screen" above). The bundle of the
  install puts that JS in an inline module script, not in a blob URL. A
  bundle that does not show the app for 8 seconds is marked bad and is
  not loaded again, so a broken build cannot lock the phone out. A tap
  on Update clears the mark, so the phone tries that build once more.
  Else the phone says "Updating…" for minutes and does not load the
  build. A bundle is not signed yet, so the phone takes a new screen
  from only one computer (`screenFrom` in `localStorage`,
  `fromScreenSource` in `src/front.ts`): the first computer that it uses
  with this rule, or the computer with the tick on "Screen updates" in
  the details of a computer in Settings, Environment. A second computer,
  such as a server where an agent changes `dist/`, cannot run code on the
  phone. Only the phone keeps the mark, because `phone.json` syncs from
  the computer in use. When the marked computer is unpaired, the computer
  in use takes its place. A commit that changes the native iPhone app (`ios/`,
  not `ios/store/` and not a plist only) makes the dev bridge upload a
  TestFlight build (`ios/store/testflight.sh`). The upload waits while
  those files are not the same as HEAD. One upload runs at a time. A
  newer native commit during an upload starts the next upload when the
  first one ends. The log is `testflight.log` in `~/.config/yonder`.
  The release of the same commit then builds the app for its dSYMs, but
  it does not upload a version that `testflight.txt` already has. Else
  the release job fails with "The bundle version must be higher", and
  the release skips its tags and its Sentry release. Android still needs
  `bun run install-android`. A debug build on the cable is still
  `bun run install-ios`. A screen that needs a new native part runs
  only after the phone installs the new TestFlight build.
- The black screen after an update: the iPhone can show a black screen
  after a new load of the page, and only a restart of the app helps. The
  page still runs and takes the taps. These rules prevent it:
  - The cause: `paint_window` (`Island.swift`) painted each window of
    the scene. One of them is the `UITextEffectsWindow` of UIKit, which
    floats over the app, and the function also painted its full-screen
    root view (`UITrackingWindowView`). UIKit makes the text-effects
    window after the first taps, so each later mount of `App` (an
    update, `heal`, a switch of the Mac, a new load after iOS stopped
    the web content process) covered the whole app with the color of the
    page. The taps went through that view to the app.
  - The fix: `paint_window` paints only the window of the web view. That
    needs a new install of the phone app. For an older install, the page
    calls `paint_window` only in the first load of a run of the app (the
    navigation type `navigate`, before UIKit makes the text-effects
    window), and only one time in that page. A new load for an update is
    `reload`, and a new load after iOS stopped the web content process
    is `back_forward`, so they do not paint. A change of the theme later
    in a run keeps the old color under the bar of the keyboard until the
    next start.
  - A teardown of the page while a CSS transform animation runs also
    makes the screen black. After it, WebKit on the iPhone shows only
    the background of the page, for good: the page runs, holds the app at
    the right place, and takes the taps, but no new content reaches the
    screen. The icon of the update button turns (`.spin`) before an
    update loads, so an update hits it.
  - So before each new load of the page (an update, `heal`, a switch to
    another Mac and an unpair), `still` in `src/link.ts` puts the class
    `still` on `<html>`, which stops each animation and transition
    (src/app.css), and the page loads 1.5 seconds later. `still` also
    cancels the animations of script (`document.getAnimations()`).
    `still` is in link.ts, because front.ts imports link.ts, and the
    bridge loads link.ts but not front.ts.
  - During `still` a tap does nothing (`pointer-events: none`), so that
    no new animation starts. A tap on a row can move the row.
  - An update also waits while the talk view (a dictation) is open, as
    during a call (`hold.talk` in `src/front.ts`, set by App.tsx), on
    the Mac and on the phone. The orb of the talk view moves by script,
    which `still` cannot stop, so else the update shows black. The
    update also cuts the dictation.
  - A second cause remains. With `still`, a new load after a
    conversation was on the screen in that run of the app can show
    black. A probable cause is in WebKit: a failed request to the GPU
    process leaves the old layers working and the new ones blank, and
    only a new start of the app resets it. To open and close a
    conversation in the page never shows black. A start of the app
    always shows the app.
  - So on the iPhone a new page loads only in the background, under the
    native cover, or when the user accepts it: a tap on Update (the call
    button or the settings), or an update by voice (`accept` in
    `src/front.ts`). Else the new bundle waits in `front`, and the next
    start of the app runs it. A change of the native shell still needs a
    new install.
  - A switch to another Mac, an unpair and a new pairing from the
    settings use `hold` and `loadAgain` in `src/link.ts`. The running app
    moves to the other Mac with no new load (`moveTo`, see "The switch
    during a call" in Phone). A pairing on the first screen of the app
    still loads the page at once. Only an unpair of the last Mac waits
    for the next start, when a conversation, the settings or the talk
    view was on the screen (`hold.dirty`).
  - The 1.5 seconds of `still` come from the one test where the icon
    stopped 1.5 seconds before the teardown. It is not a measured
    limit, so do not make it shorter without a new test.
  - During a new load the screen shows white for about one frame: the
    page of the install before the CSS of the bundle comes in. It is
    only cosmetic.
  - A bundle of the bridge that shows the app loses `frontTry` after 1.5
    seconds, not 8. A user can close a black screen within a few
    seconds, and else the next start marks a good bundle bad.
  - `heal` does not help with this black screen, because `#root` is not
    empty.
  - When `#root` is still empty 8 seconds after the start, or 1 second
    after an uncaught error, the page loads again by itself, at most
    once a minute (`heal` in `src/front.ts`). When this happens to a
    bundle of the bridge in its first 8 seconds, the next start marks
    that bundle bad.
    The 8 seconds count only while the page is in front (`startCheck`).
    A page that loads in the background shows the app only in front,
    because the pairing in IndexedDB waits there. Else the check comes
    on the way back before the pairing, loads a good screen again and
    marks it bad. The first page that starts the check takes it, so a
    screen of the bridge also takes it from an older install.
  - A page that goes to the background with the app on the screen loses
    its `frontTry` at once. Else a start that goes to the background in
    its first 8 seconds keeps `frontTry`, and the next start marks a
    good screen bad. A bad mark blocks only its own build, so the next
    build heals it.
  - A screen of the bridge that starts behind other apps is on trial
    only in front (`held` in `src/front.ts`): it takes its `frontTry`
    away at its start, and puts it back when it comes to the front with
    nothing on the screen. Each update loads its new screen when the app
    goes to the background, so such a start is the normal path. Else iOS
    can freeze the page in the background before the 1.5 seconds that
    take the mark away, and the next start marks a good screen bad. `bun
    bridge/lock-e2e.ts` checks it.
  - A start that marks a bundle bad runs the last good screen of
    IndexedDB (`good`), not the screen of the install, so a false bad
    mark costs one build. Only an install with this code does it,
    because the screen of the install makes the bad mark.
  - `needs` does not count a change of only the share extension and
    `project.yml` (see "Over-the-air updates"). Else each new screen
    needs a newer app than TestFlight has, and the phone goes back to the
    screen of its install with no word. The phone keeps the newest
    screen that fits, and it says why one time in a toast.
  - The phone keeps the bundle of the bridge in `localStorage` (about
    2 MB of text, of about 5 MB). With no room, the copies of the screens
    of the user (`look:`) go first, and the phone notes `no room for`
    the build (`keepBundle` in `src/front.ts`).
  - Each start of the phone app keeps a record in `localStorage`
    (`boot`): the build, each step with its time (`run 1.N` for a bundle
    of the bridge, `render` with the type of the load, `reload`,
    `navigate` or `back_forward`, `hidden` for a start behind other
    apps, and the view that an update opens, `pairing`), the
    uncaught errors and rejections, `look` and `look2` after 1.5 and 4
    seconds, the first six taps, `hidden` and `pagehide`, and after 8
    seconds `shown` or `empty` with the visibility, the size of the page
    and of `main`, and `frame` when a frame paints. Each AudioContext of
    the page adds `audio`. An update adds `update 1.N` (with `accepted`
    when the user accepted it) and `still` to the record of the old
    page. The next start sends
    the record to `call.log` in a "Phone start:" line.
  - How to read a record: `run 1.N` with no `render` means that the
    bundle of the bridge did not run. `render` with no `pairing` means
    that IndexedDB did not answer. `error` means that the app threw.
    `look` gives the visibility, the focus, the box and the opacity of
    `main`, the scroll, the scale, offset and size of the visual
    viewport, and the element at the center of the screen. `tap` names
    the element under the finger, with only its first class.
    `render back_forward` is a new page that the app did not ask for.
    `hidden` soon after a black start
    means that the user closed the app. `still` is the stop of the
    animations before a new load, and `pagehide` comes 1.5 seconds
    later.
  - When the phone cannot connect, copy its `localStorage` with
    `xcrun devicectl device copy from --domain-type appDataContainer
    --domain-identifier com.vladartym.yonder`. The file is
    `Library/WebKit/WebsiteData/Default/<hash>/<hash>/LocalStorage/localstorage.sqlite3`,
    and its values are UTF-16.
  - The inline script and the check of a bundle that never runs are in
    the bundle of the install, so they need `bun run install-ios`. The
    rest comes with the next update over the air.
- The Mac app needs no more signing setup. `install-app` signs it with the
  Apple Development certificate in the keychain
  (`bundle.macOS.signingIdentity` in `src-tauri/tauri.conf.json`), with
  the hardened runtime and `src-tauri/Entitlements.plist` (the
  microphone, and the JIT for the compiled bridge). The signature stays the same between builds, so macOS
  keeps the permissions of Yonder. The build needs no Xcode account. The
  certificate is valid until 2027-08-11. Only a copy for another Mac needs
  a Developer ID certificate and notarization.
- `bun run release-app` (`src-tauri/release.ts`) makes the copy for other
  Macs. It signs the app with the Developer ID certificate, and Tauri sends
  it to the notary service of Apple and staples the ticket. The script then
  signs, notarizes and staples the DMG, and puts it on
  `https://download.yonder.so/Yonder.dmg` and `Yonder-<version>.dmg`, in
  the R2 bucket `yonder-downloads` of Cloudflare. It does not change
  `/Applications/Yonder.app` or `install-app`, because a new signature
  makes macOS ask for each permission again. The values for the signature
  and the notary are in `~/.config/yonder/release.env`, and the S3 keys of
  the bucket are in `~/.config/yonder/r2.env`.
- `dmgbuild` (`uvx dmgbuild`) makes the DMG with `src-tauri/dmg/settings.py`.
  It writes the `.DS_Store` of the window itself, because the DMG of Tauri
  needs Finder, and Finder fails in a background job. The
  window shows the flying bird (`go.svg` of the landing page) with a red
  arrow from Yonder to Applications, under the words "Send Yonder over
  yonder". The source is `src-tauri/dmg/background.svg`. After a change,
  run `rsvg-convert -w 660` and `-w 1320` on it to make `background.png`
  and `background@2x.png`, and move the icons in `settings.py` if needed.
  `settings.py` also puts the hidden `.background.tiff` and
  `.VolumeIcon.icns` in the top corners of the window. Else the window
  scrolls when Finder shows hidden files, because Finder puts the two
  files in a row under the window.
- A copy for other Macs that starts outside `/Applications` and
  `~/Applications` asks "Move Yonder to Applications?" (`offer_move` in
  `main.rs`). A copy in the DMG cannot update itself, and macOS runs an
  app from Downloads in a random read-only folder. "Move to
  Applications" copies the bundle with `ditto`, removes the quarantine
  mark, puts the copy in place of an old `/Applications/Yonder.app`,
  quits, and opens the new copy. It refuses while another Yonder runs
  from `/Applications`. "Not Now" asks again at the next start. The app
  of `install-app` never asks. Finder cannot hide the bars of the DMG
  window, so this question is the fallback for a skipped drag.
- `Yonder.dmg` and `latest.json` carry `Cache-Control: no-cache`, and the
  Browser Cache TTL of the zone yonder.so is "respect existing headers"
  (`cf setting yonder.so browser_cache_ttl 0`). Else Cloudflare tells
  browsers to keep each file for 4 hours, and a browser gives the user an
  old DMG after a release. Bun's S3
  client cannot set the header, so `release.ts` copies the two objects
  onto themselves with the `aws` CLI.
- People can download the Mac app from yonder.so with nothing in
  between. The first public copy is version 1.758.0. The Mac button, the
  download page and the footer of
  yonder.so link to `https://download.yonder.so/Yonder.dmg` (`MAC_URL` of
  the landing page repository).
- The Developer ID Application certificate (team C5338FSGXJ, G2 Sub-CA,
  valid until 2031-09-16) comes from a request of
  `openssl`. Its key, the certificate and a `.p12` copy are in
  `~/.config/yonder/developer-id/` (mode 600), and the `.p12` password is
  in `secrets.env` there. The identity is in its own keychain, which is
  in the search list of the user and has no lock time.
  `set-key-partition-list` lets
  `codesign` use the key with no "Always Allow" dialog, so a release runs
  in a background job with nobody at the Mac. `release.env` has the
  keychain and its password (`RELEASE_KEYCHAIN`,
  `RELEASE_KEYCHAIN_PASSWORD`), and `release.ts` unlocks it first,
  because a restart locks it. The notary uses the App Store Connect team
  key of the TestFlight uploads (`~/.appstoreconnect/private_keys/`).
  Do not put a key of the notary in
  `~/.config/yonder` as `AuthKey_*.p8`: `bridge/push.ts` takes the first
  such file as the key of the pushes.
- The build is Universal: it runs on Apple silicon and on Intel Macs, with
  macOS 26 or later. macOS 26 is the newest macOS for Intel Macs, so
  `build.rs` compiles the Swift helpers for macOS 26.
  `release.ts` runs `tauri build --target universal-apple-darwin`, which
  builds each chip in turn. `build.rs` and `release.ts` merge the helpers
  and the bridge of the two chips with `lipo` into the
  `-universal-apple-darwin` files that Tauri bundles, and the release
  stops when a binary does not hold both chips. `latest.json` gives the
  same archive to `darwin-aarch64` and `darwin-x86_64`. A release needs
  the Rust target of Intel once: `rustup target add x86_64-apple-darwin`.
- A copy from `release-app` works on a Mac with no Bun and no copy of
  this repository. The bundle holds five binaries in `Contents/MacOS`:
  `yonder` (the app), `yonder-bridge` (the bridge), `yonder-wake`
  ("Hey Yonder" and the voice note), `yonder-dictate` (dictation) and
  `yonder-auth` (the sign-in window). `release.ts` takes the helpers from
  `externalBin` in `tauri.conf.json` and adds the bridge. A second list
  can miss a helper, such as `yonder-auth`, and then the Google sign-in
  does not open in a copy for another Mac. `release.ts` compiles the bridge with `bun build
  --compile` into `src-tauri/binaries/`. It puts the bridge in the
  bundle (`externalBin`), and it builds the app with `YONDER_RELEASE`,
  so `launch_bridge` in `src-tauri/src/main.rs` starts that binary. The
  binary has a copy of `README.md` in it, for `about_yonder`. It does
  not have `CLAUDE.md` or this wiki, because a public download must not
  carry the private setup of the maintainers.
  Tauri signs the helpers with the app.
- The app of `install-app` still starts `bridge/main.ts` of this
  repository with `bun`. So a change to the bridge needs only
  `restart_bridge`, and the updates over the air still work on this Mac.
  Only `yonder-wake` comes from the bundle in each build.
- A copy for another Mac has no source. Its bridge gives the front end
  of its bundle (`Contents/Resources/dist`), so the
  window and the paired phones run the screen of that version, and get a
  new screen when the Mac installs a new version. `/version` gives 0, so
  the source gives no Update button.
  `rebuild_app` tells Grok to click "Update available" (see the next
  item). Check in Settings asks `latest.json` at once (`check_update`).
  Else Check asks only the bridge, and says "Up to date" when a newer
  version is out. `restart_bridge` starts the same binary again. The bridge knows
  this from the folder of its source: the compiled bridge finds no `.git`.
- A copy for another Mac gets the new version of the whole app, with the
  bridge and the front end, with the updater plugin of Tauri
  (`check_update` and `install_update` in `src-tauri/src/main.rs`). At
  the start, and then each minute, the app asks the update server
  (`checkRelease` in `src/App.tsx`). A newer version downloads at once,
  in the background. The app restarts into it when no call is live and
  its window is not in front: hidden, or behind another app. The new app
  then opens behind the app in front (`open -g` and `--quiet`), so it
  takes no focus, and a hidden window stays hidden (`--hidden`). The new
  app opens only after the old process ends, so the Dock shows one
  Yonder. Until
  then the call button shows "Update available", and Settings shows
  "2.B.N is ready" with an Update button. A click restarts into it at
  once. The bundle on disk changes only just before the restart
  (`download`, then `install`), so the bridge never serves the new
  screen to the old app. An older copy can still need one click to get
  this behavior.
  The page runs from the bridge, a remote origin, so Tauri runs a command
  of `main.rs` only with a permission: `AppManifest` in
  `src-tauri/build.rs` and `capabilities/default.json`. Without it,
  Tauri refuses `check_update` and `install_update`, the page drops the
  error, and Check says "Up to date" with no request to the update
  server. A copy with no such permission cannot get the fix by itself:
  install the DMG once. The update
  downloads `Yonder-<version>.app.tar.gz`, checks its signature, and
  puts the new app in place of the old one. A click ends a live call.
  Before the restart the call row shows "Updating to 2.B.N…" for 3
  seconds (the event `updating`). A call that starts in that time stops
  the restart until the call ends. The restart stops the bridge and waits
  until port 7787 is free (`stop_bridge`), and the new app starts the
  bridge of the new bundle. The user sees no question: the new app has
  the same Developer ID signature and bundle ID, so macOS keeps each
  permission, and a download of the updater has no quarantine. The
  version is `2.B.N` (see Versions), so each release is newer.
- The bundle ID of the Mac app is `so.yonder.mac`, from the domain
  yonder.so. Tauri cannot make the update archive for an ID that ends
  with `.app`, so the ID is not `so.yonder.app`. An older copy has the ID
  `com.vladartym.yonder`. The first update to the new ID makes macOS ask
  for each permission one more time, because macOS sees a new app. The
  iPhone, the Watch and Android keep `com.vladartym.yonder`, because
  TestFlight, the subscriptions and the push topic use that App ID.
- Homebrew: the Homebrew tap repository (`homebrew-yonder`) has the
  cask, so `brew install --cask` from that tap works.
  A pull request to `Homebrew/homebrew-cask` adds it to the main list.
  The cask names a version and its checksum, and `livecheck` reads
  `latest.json`, so Homebrew's bot finds each new release.
  Homebrew closes a pull request for a domain that is younger than 30
  days. Issue #12 has the next step.
- Only the copy of `release-app` has the updater (`YONDER_RELEASE`). The
  app of `install-app` on this Mac must not get it: an update would put a
  Developer ID build in place of it, which makes macOS ask for each
  permission again and ends the updates from this repository.
- `release-app` makes the update with `createUpdaterArtifacts` and the
  key of the updates in `~/.config/yonder/updater/yonder.key` (made
  with `tauri signer generate`; its password is in
  `release.env`). The public key is in `plugins.updater` of
  `tauri.conf.json`. Keep a copy of the private key: each installed copy
  trusts only this key, so without it no copy can update again, and each
  user must download the app by hand. The script uploads the archive
  first and `latest.json` last, so that a copy never reads a version
  that is not there yet. Then it purges `Yonder.dmg` and `latest.json`
  from the cache of Cloudflare, because the edge keeps a `.dmg` for
  hours. The purge token (a Cloudflare API token with the permission
  "Zone: Cache Purge") and the zone are in `release.env`.
- Version 1.758.0, the first download, has no updater. A user of it must
  download the app once more.
- Limits: the restart waits for a call.
- A downloaded Mac gives its paired phones the screen of its version over
  the air, as the bridges of Linux and Windows do. `release.ts` puts
  `dist/` in `Contents/Resources`, and `launch_bridge` in `main.rs` gives
  the bridge that folder as `YONDER_ROOT`. So after a click on "Update
  available" on the Mac, the phone loads the new screen as on the source
  copy. The window of the Mac also loads its screen from the bridge then,
  as the source copy does.
- Bun runs 8 times slower under the hardened runtime without the JIT. So
  `Entitlements.plist` has `com.apple.security.cs.allow-jit`. Tauri signs
  each binary of the bundle with this file.
- `release.ts` stops when the strings of a binary of the bundle name the
  folder of this repository, the heading of this wiki, or the legal first
  name of the owner. The check includes `yonder-bridge`. Else a release
  build can carry the wiki in the bridge, and `about_yonder` gives it.

### Versions

- Settings › General shows two rows: Environment, the bridge
  and the screen of the computer in use, and the app of this device
  (iPhone app, Android app or Mac app). Each shows only the commit number
  N with its channel, such as "707 · Dev", because the middle numbers of
  "2.104.707" and "2.98.645" make an iPhone look out of date. The
  channel of the environment comes from `/front` (dev for a bridge from
  the source folder, else `channel.json`). A Mac app next to a dev
  environment is "Local". The phone apps get TestFlight or App Store
  with a later native build. A tap on a row copies both full versions.
- The version of each build is "2.B.N", from `version.ts`. The Mac app,
  TestFlight, Android, Linux, the screen and `dist/build.txt` all use
  it. `bun version.ts` prints it.
- Version 2 starts at 2.1.1. `BASE` in `version.ts` is the last commit
  of version 1. B and N count only the commits after it, so a check on
  GitHub needs the full history (`fetch-depth: 0`).
- N counts the commits. It goes up with each commit, so each version is
  higher than the one before. An update over the air reads N: the app
  is behind when the source has a higher N.
- B is the build number: 1, and one more for each commit that changes a
  native shell: `src-tauri/`, `ios/` and `android/`, but not
  `ios/store/` and `android/store/`. These changes need a new build of
  the Mac app, a TestFlight build or a new APK. A change to the screen
  or to the bridge only adds to N.
- B counts commits, not uploads. Two TestFlight builds with no native
  change between them have the same B and a different N.
- Version 1 was "1.N.0" (N the count of all the commits), and the last
  one was 1.906.0. Each 2.x is higher than each 1.x for the updater of
  the Mac app, App Store Connect and the Android version code.
- `count` in `src/front.ts` adds 1,000,000 to N of version 2, so a
  build of version 2 is newer than a saved phone bundle of version 1.
  `shellChanged` in the bridge finds commit N after `BASE` for a Mac
  app of version 2, and commit N of all the history for version 1.
- A phone app from before version 2 reads the second number of a bundle
  as its commit count. It sees B as older than its own build, so it
  does not load a new screen over the air. A new TestFlight build or
  APK fixes it once. The Mac app compares the whole build, so it
  updates.
- **Which screen the phone runs** (`pick` in `src/screen.ts`, called by
  `useFront` in `src/front.ts`). It tells how a phone that is paired
  with two computers on two versions works.
  - The phone runs the screen of the computer in use, so that the screen
    matches the bridge. After a switch to a computer with an older
    screen, the phone loads that older screen. Else a newer screen from
    another computer talks to the older bridge.
  - The phone never runs a screen older than the screen of its install.
    An old screen does not know the newer app around it. The
    over-the-air updates of Expo have the same rule. On such a computer
    the phone runs the screen of its install, which is newer than the
    bridge.
  - A screen runs only in a phone app that has the last change of the
    native shell of its platform. `needs` in `version.ts` gives the N of
    the last commit that changed `ios/` and `android/` (not the store
    folders). The build writes it to `dist/needs.json`, and the bridge
    gives it in `/front` and in the bundle of `/front?bundle`. The phone
    compares it with the N of its app. A screen that needs a newer app
    does not load. The phone then keeps the screen that runs,
    when it is newer than the install and not newer than the screen of
    the computer, else it runs the screen of its install. The same rule
    holds for the screen that failed (`frontBad`). A toast says why one
    time ("The new screen needs a newer app." or "The new screen did not
    start."). Settings says "2.B.N needs a newer app" with no button.
    It shows the Update button only for a newer app that is out: a newer
    TestFlight build of this Mac, the App Store or Google Play, newer
    than the installed app ("App" in Settings). Else the phone goes back
    to the screen of its install with no word, and the button opens
    TestFlight with no newer build. A screen with no `needs` (an older
    bridge or `dist/`) fits each app.
  - A commit with the line `Native-Optional: yes` in its message does
    not count for `needs`. Use it only when each new
    native part has a fallback in the page, such as a version of the
    native chrome or an invoke that fails on an older app. Else each
    later screen waits for the new phone app, and an older phone keeps
    its screen until the user installs it.
  - A change to a plist does not count for `needs` either, because it
    adds no function that a screen can call. Else the versions that
    `bun run testflight` writes into the Info.plist files count, and
    each phone with an older build stops getting new screens.
  - The share extension (`YonderShare`), the Watch app (`YonderWatch`)
    and `project.yml` do not count for `needs`. The
    extension and the Watch app run in their own process, so the screen
    cannot call them. A new function that the screen can call comes with
    a Swift file in `Sources/`. `YonderIsland` still counts, because the
    app compiles its intents.
  - The screen of the install writes its build in `own` of the start
    record (`yonderBoot`), so a downloaded screen knows the app around
    it. An older install has no `own` and the old start
    code, which loads a saved screen with no check and downloads each
    newer screen. A return to its install would load the same screen
    again, in a loop. So such a phone takes only a newer screen that
    fits, and else keeps the screen that runs. It gets the full rule with
    its next app build.
  - The reload waits for the end of a call and for the talk view to
    close. The iPhone loads when the app goes to the background (see
    "Live changes of the screen"). A downloaded Mac answers
    `rebuild_app` with an error.
  - `bun src/screen-check.ts` checks `pick` with 16 cases, and
    `check.yml` runs it.
- A number above 999 is no problem. Semver and Apple have no limit of
  999 for a part of the version. Tauri makes the Android version code
  as `major * 1000000 + minor * 1000 + patch`. B and N only go up, so
  the code also only goes up when N is above 999. The limit of Google
  Play is 2,100,000,000, so B can go to about 2,099,000.
- `/version?full` of the bridge gives "2.B.N". `/version` with no
  `full` gives N, for an older screen.

### Checks on GitHub

- `.github/workflows/check.yml` runs the free checks on Linux: the
  types, the build of the front end, `src/names.ts`,
  `src/screen-check.ts`, `check-updates`, `check-relay` and
  `check-bridge`.
- The checks run on each push to `main`, before each release (a push to
  the `staging` branch), and by hand with `gh workflow run check.yml`.
  The agents commit on this Mac and push only when the user asks, so a
  commit gets the checks when it is pushed.
- `bun run check-bridge` (`bridge/start-check.ts`) starts
  `bridge/main.ts` on a free port with an empty home folder. It checks the
  403 for a foreign Origin and Host, the list of tools, `list_workers` and
  `list_folders`. It starts no workers, so it uses no credits.
- Only the release gate (see Release gates) runs `bun run test`
  (`bridge/check.ts`), because that check starts real Claude Code
  workers, which use credits. The workflow does not run
  `check-preview`, which reads the servers of the Mac with `lsof`.
- Linux has no CoreImage, so `check-relay` makes the QR code only on
  macOS.
- `.github/workflows/release.yml` builds and releases the apps after the
  checks, on the runner of this Mac, with the keys of `~/.config/yonder`.
  It has two release names:
  - **Staging** is the release for the testers: TestFlight, the APK and
    the downloads of download.yonder.so. A push to the `staging` branch
    starts it: `git push origin main:staging`.
  - **Production** is the store release: the App Store and Google Play,
    after the apps are approved. A push to the `production` branch
    starts nothing: only `promote.yml` (by hand or with the skill `release`)
    sends a version there.
  - A push of a version that is out already (the version of
    `latest.json`) builds no computer app again. "Run workflow" builds
    them each time. `deploy-relay` is not in the workflow.
  - After a release that uploaded with no failed build, the `tag` job
    tags its commit `v<version>`, and `ios-<version>` or
    `android-<version>` for a phone app that built. Only the workflow
    pushes tags. `git tag --list 'v*'` lists the releases, and
    `git log v2.82.425..v2.83.430` gives what changed between two.
  - The phone apps build only when `ios/` changed since the last
    `ios-*` tag, or `android/` changed since the last `android-*` tag
    (the store folders do not count). Then iOS and Android both build,
    so the two phone apps always have the same version: the computers
    have one version, and the phones have one version. A change to only
    the Mac shell builds no phone app, and the phones show no "Update
    available" for nothing. With no tag yet, the middle number of the
    version decides. `-f phones=true` builds both.
  - The release from the public repository `heyyonder/yonder`, after
    the cut: a push to
    its `staging` branch runs `dispatch-release.yml` there, on
    `ubuntu-latest`. It only sends the `repository_dispatch`
    `public-staging`, with the commit as `client_payload.sha`, to the
    repository in the variable `RELEASE_REPO` (the private release
    repository of the maintainers), with the secret
    `RELEASE_DISPATCH_TOKEN`. Its job runs only in
    `heyyonder/yonder` with the variable set, so a fork and
    the private repository start nothing with it. `release.yml` in the
    private repository then
    checks out that commit of `heyyonder/yonder` in each job, with the
    full history (`fetch-depth: 0`, for `bun version.ts` and the
    tags) and the secret `PUBLIC_REPO_TOKEN`. It also gives
    `check.yml` the repository and the commit to check. The `tag` job
    pushes the tags to `heyyonder/yonder`. `promote.yml` checks out
    the tag `v<version>` of the repository in the variable
    `SOURCE_REPO`, or of the private repository with no variable. The
    push trigger of `release.yml` stays until the cut.
  - Each build step gets `SENTRY_DSN` from the secret of the same
    name, so only the official builds send errors (see Crash reports).

### Release gates

These gates check each release before it uploads.

- The release builds run on the GitHub runner of this Mac, in
  `~/actions-runner`, with the keys of `~/.config/yonder`. `./svc.sh
  status` there shows the runner, and `./svc.sh start` starts it again.
  After `./svc.sh install`, delete `SessionCreate` from its file in
  `~/Library/LaunchAgents`. Without the login keychain, the iPhone build
  fails with `errSecInternalComponent`.
- The `gate` job of `release.yml` runs on the runner of this Mac after
  the checks and before each build that uploads. A failed gate uploads
  nothing. A run with `-f upload=false`, or one that builds nothing,
  skips its two tests.
- **The upgrade test** (`bun run check-upgrade`,
  `bridge/upgrade-check.ts`): it downloads the Mac app of the last
  release (`latest.json`) and starts its bridge on a free port, with a
  new home folder that holds settings (`config.json`), a done agent
  (`state.json`) and a paired phone (`relay.json`). Then the bridge of
  this commit starts on the same home folder. The test checks that it
  keeps the agent, the settings and the pairing, and that `/front`
  gives the build and the `needs` of the phone apps. Both bridges use
  one port, because a bridge on a port other than 7787 keeps its state
  in `~/.config/yonder-<port>`. It uses no credits and no relay.
  `OLD_BRIDGE=<path>` tests a bridge binary on the disk. Mac only. It
  needs `dist/`, so the gate runs `bun run build` first. It does not
  test the phone or the update of the Mac app itself.
- **The test with real agents** (`bun run test`): the gate starts the
  bridge of this commit on port 7795, with its own state folder
  (`~/.config/yonder-7795`) and no relay, and runs `bridge/check.ts`
  against it. Its agents are real Claude Code sessions of this Mac in a
  temporary `yonder-check-XXXXXX` folder. Only the bridge of the test
  lists them. Each other bridge, such as the live Yonder, skips a
  session in such a folder (`checkRun` in `bridge/main.ts`). Else they
  show in the list of the live Yonder as "Yonder check" agents while
  the test runs.
  - The memory of the last close is outside `server` in
    `bridge/main.ts`, because the bridge makes a new MCP server for each
    request. Else `undo` always says "There is nothing to undo.", and
    the phone's shake to undo fails too. One check is open: "the next
    message sends the queue first, in the same session"
    (`bridge/check.ts`, after stop_worker). Until it passes, the gate
    stops each release.
  - Claude Code 2.1.304 lists ended background sessions that wait on
    the user, with no pid, and `list_workers` skips a session with no
    pid. So the check counts only the sessions with a pid, as the bridge
    does.
  - The gate copies the default profile of this Mac (`cli` and its
    entry in `profiles` of `~/.config/yonder/config.json`, with no
    variables) into the `config.json` of the test bridge, so its agents
    run in the folder of that profile, as the live agents do. Else the
    agents of the test use the plain `~/.claude`, which can be signed
    out, and the gate stops each release with "Claude Code is not signed
    in". With no default profile of Claude Code, it keeps the plain
    folder. `CLAUDE_CONFIG_DIR` for the test bridge is not enough: the
    bridge reads the transcripts of the plain folder in
    `~/.claude/projects` (`PROJECTS`), so the first agent of the test
    has no answer.
- **The health check before production** (`bun run health <version>`,
  `health.ts`): it asks Sentry for the sessions of the release and its
  crash issues. It passes when the release has at least one session,
  99% or more of them have no crash, and the release has no open crash
  issue (`error.unhandled:true`), also one that started in an older
  release. Else it exits with 1. The issues count too, because a session
  of the screen does not end as "crashed": a test build can have 100%
  crash-free sessions and a crash issue. The
  Android app sends as `so.yonder@<version>+<version code>`, so the
  check asks for both release names. The promotion to production uses
  it. The thresholds are constants at the top of `health.ts`: raise
  `MIN_SESSIONS` when the group of testers grows.

### Update server

- https://updates.yonder.so is the update server of the copies: a
  Cloudflare Worker (`updates/worker.ts`) that reads one state object,
  `updates/state.json` in the bucket of download.yonder.so. Deploy it
  with `bun run deploy-updates` (wrangler). A release uses the GitHub
  secrets `CLOUDFLARE_API_TOKEN`, a scoped token for Workers that does
  not expire as a wrangler login does, and `CLOUDFLARE_ACCOUNT_ID`.
  `updates/wrangler.toml` names no account. By hand, wrangler uses the
  wrangler login of the computer. It gives slow rollouts, a stop switch and a
  rollback.
- A copy asks `/<channel>/<platform>?id=<install ID>&v=<its version>`.
  The platforms are `mac`, `linux`, `windows` and `android`. The Mac
  gets the JSON of the Tauri updater, and the others get the version as
  text. A 404 (no such channel) sends the copy to the old static file
  of download.yonder.so, and a 204 means no update.
- The channel and the server of a copy are in `channel.json`, the one
  place for the Mac app, the bridge and the screen. All the copies are
  `staging` now. `production` is for the store apps later.
- For each channel and platform, the state has the version out now, the
  version before, the percent of the installs that get the new one, a
  stop switch (`halted`), a rollback mark and a minimum version
  (`updates/pick.ts`). An install keeps a random ID in
  `~/.config/yonder/install-id` (Android: in its storage). The server
  hashes it into a bucket from 0 to 99, so an install stays in or out of
  a rollout. An install with no ID gets a new version only at 100%. An
  install under the minimum always gets the version out now.
- Commands, which change only the state: `bun run rollout <channel>
  <platform|all> <percent>`, `bun run halt <channel>`, `bun run resume
  <channel>`, `bun run rollback <channel> <platform|all>`, and `bun run
  release-status`. Each release script registers its new version for
  staging at 100%, after its files are up, and still writes the old
  static files for the older copies.
- A rollback gives the version before back, with a mark. The Mac app
  installs an older version only with the mark ("rollback" in the notes
  of the JSON, the `version_comparator` in `src-tauri/src/main.rs`), and
  a Linux or Windows bridge only with "rollback" on the second line
  (`accept` in `updates/pick.ts`). Android cannot go back to an older
  APK, so `rollback` refuses Android: use `halt` there. The Mac can go
  back only to a version with its signature in `updates/mac/`: the
  first was 2.82.425, so a Mac rollback works from the release after it.
- `bun run check-updates` (`updates/check.ts`) checks the rules with no
  network. `check.yml` runs it with the other free checks.
- The release gate deploys the server (`bun run deploy-updates`) when
  `updates/` changed since the last `v*` tag, after the tests and before
  the uploads, so a change to the server goes live with its release.
  With no `v*` tag yet, it deploys.

### Production

- Production is the release for the public: the App Store, Google Play,
  and the `production` channel of the update server. Staging is the
  release for the maintainers and the testers. A version goes to
  production only after it was out on staging.
- `bun run promote <version> [--ios] [--dry-run]` (`promote.ts`) and the
  workflow `promote.yml` do the same steps. Start the workflow with
  `gh workflow run promote.yml -f version=<version>`. No push starts
  it: `git push origin main:production` was once the release for the
  testers, so a push trigger could send a version to the App Store from
  an old habit or an old note.
  The workflow checks out the tag, so the bundle for Google Play is of
  that version. It is in the concurrency group of `release.yml`, so it
  never runs during a release.
- The steps:
  1. The version must have its tag `v<version>`, which the tag job of
     `release.yml` makes after a staging release.
  2. `bun run health <version>` must pass (see Release gates).
  3. The update server: `production` of `mac`, `linux` and `windows`
     gets the version for 10% of the installs. Widen it later with
     `bun run rollout production all 50`, then 100. No copy is on the
     production channel yet (`channel.json`).
  4. The App Store, with the App Store Connect API and the key of
     `release.env`: the editable App Store version takes the version of
     the newest TestFlight build at or under the version (the iPhone
     app builds only when `ios/` changes, and App Store Connect attaches
     only a build of the same version), the build, a phased release of
     7 days, and a submission for review. An open draft submission is
     used again, because an app has only one. The release after the
     approval stays manual, as the version in App Store Connect says.
     The next promotion releases an approved version that waits
     (`PENDING_DEVELOPER_RELEASE`) before it submits the new version.
     A version with `AFTER_APPROVAL`, set by hand after the submission,
     goes out with no second step. A new version can copy that value
     from it.
     Apple refuses the review of an update with no "What's New". So the
     step fills an empty "What's New" with "Fixes and small improvements."
     Write a better text in App Store Connect before the review starts.
  5. Google Play: `bun run play` builds the bundle of the version, and
     it goes to the production track for 10% of the users. It needs a
     service account key in `GOOGLE_PLAY_KEY` or
     `~/.config/yonder/google-play.json`. With no key, this step stops
     and says what to make.
     The first production release is a step in the Play Console. Google
     Play takes no staged rollout (`userFraction`) for the first
     production release, and a new developer account can need
     production access after a closed test first. Else the PUT of the
     production track fails with "400 Precondition check failed."
- `--dry-run` sends only the reads (GET) and prints each change that it
  does not send. A failed step does not stop the steps after it, except
  the tag and the health check, and the command exits with 1.
- Not done: the App Store phased release and the Google Play rollout do
  not stop with `bun run halt`. Pause them in App Store Connect and the
  Play Console. A wider Google Play rollout is a change in the Play
  Console too.
- No MCP tool releases, because a user of Yonder never releases Yonder.
  The skill `release` (`.claude/skills/release/SKILL.md`) gives an agent
  the steps: `bun run ship-staging`, `gh workflow run promote.yml`,
  `bun run halt`, `bun run resume` and `bun run release-status`.

### Crash reports

- Errors and panics go to Sentry, the project `yonder` of the
  maintainers, so that an agent can fix a crash from its report.
- Only the official builds send: the DSN of Sentry is a build-time
  setting, `SENTRY_DSN`, and not in the source. The release workflows
  get it from the secret `SENTRY_DSN` of the private release
  repository. With no
  `SENTRY_DSN` in the environment, `vite.config.ts`, `install-app` and
  `ios/store/testflight.sh` read it from `~/.config/yonder/.env`, so the
  builds of a Mac with that file send too: the screen that the bridge
  builds, the Mac app and TestFlight. The bridge and its workers do not
  get it in their environment, because a Sentry SDK of another project
  reads `SENTRY_DSN` too. A build with no DSN, such as a
  build from source, starts no Sentry client: the screen skips
  `Sentry.init` (`__SENTRY_DSN__` of `vite.config.ts`), the Rust apps
  read `option_env!("SENTRY_DSN")`, and Android gets an empty
  `io.sentry.dsn` (a manifest placeholder in `build.gradle.kts`), which
  turns `sentry-android` off. A debug build sends nothing either.
- The screen (`src/main.tsx`) sends its errors from the Mac, the iPhone
  and Android. The release is the build ID "2.B.N", so an update over
  the air sends with its own version. The dev server sends nothing.
  A page on a port other than 7787 sends nothing too: it is a test, such
  as a fake phone on a check bridge. The Mac app on another port of the
  bridge (see "Two OS users on one computer") sends, because it has
  Tauri. A page that Playwright drives
  (`navigator.webdriver`) sends nothing too. Else a probe of an agent
  that answers each path of the bridge with `[]` sends false errors,
  such as "e.clis.map" (Sentry YONDER-17).
- `bun run build` with `SENTRY_DSN` sends the source maps of `dist/` to
  Sentry with `sentry-cli`, then deletes them, so the bridge does not
  serve them (`vite.config.ts`). `sentry-cli` reads the org, the project
  and the token from `SENTRY_ORG`, `SENTRY_PROJECT` and
  `SENTRY_AUTH_TOKEN`, or from `~/.sentryclirc`. A build with no
  `sentry-cli`, no token or no network still works.
- Each error on the screen also goes up: the toast, the line under a
  prompt box, and the error of each sheet (pairing, sign-in,
  folders, feedback) (`useReport` in `src/bridge.ts`), also an error
  that the app catches, such as a failed dictation. The steps of a dictation go with
  it as breadcrumbs (`src/dictate.ts`). They hold no words of the user.
  The toasts that tell a state of the user (no voice key on the
  computer, no location, the Mac is offline, the sound output
  of the Mac, "Paired.") do not go up (`ignoreErrors` in
  `src/main.tsx`). The errors of the screen go up as warnings, not
  errors, because most of them are a state of the user, such as no camera permission. So the
  level `error` shows only the real errors.
- These states do not go up either: "Yonder did not hear
  you." (the user said nothing), a CLI that is signed out or not
  installed, no camera permission, a screen that needs a newer app, no
  dev server for a site, and a computer with no xAI key and no
  sign-in. An issue that an agent only resolves in Sentry comes back
  on its next event (Sentry YONDER-R). So
  each expected state gets a pattern in `ignoreErrors`. The texts that
  found real bugs still go up, such as "There is nothing at …", the
  limit of 25 workers, and "Yonder cannot find this agent."
- "No pairing code is open on the Mac." does not go up either. The
  phone scanned a code that ran out after 5 minutes, or that a newer
  code replaced. The text tells the user to make a new code (Sentry
  YONDER-1B).
- "Yonder may not use the microphone." and "Yonder may not use speech
  recognition." do not go up either. The user did not allow it on the
  iPhone, and the text tells the user to allow it in Settings (Sentry
  YONDER-1D).
- Warnings go up for the errors that show nothing: an error event of
  the voice service during a call (`src/voice.ts`), a call that dropped
  and dialed again (`src/App.tsx`).
- An error in React goes up with its component stack
  (`reactErrorHandler` in `src/main.tsx`).
- The Rust code of the Mac app (`src-tauri/src/main.rs`) and of the
  iPhone app (`ios/src/lib.rs`) sends its panics (`start_sentry`). Each
  event leaves out the host name of the computer (`server_name`).
- The Android app sends the crashes of its Kotlin and native code with
  `sentry-android` (`android/gen/android/app/build.gradle.kts`), which
  starts by itself from the `io.sentry.dsn` of `AndroidManifest.xml`.
  R8 keeps the names and line numbers of `com.vladartym.yonder`
  (`proguard-rules.pro`). No mapping file goes up.
- The iPhone crate pins `libc` to 0.2.189: 0.2.190 has the dyld
  functions only on macOS, and the stack traces of Sentry need them.
- Each release that uploads also sends its symbols, so that Sentry
  names the function of a panic or a native crash: the Rust binary of
  the Mac app, the dSYMs of the iPhone archive (the app and its
  extensions), and the Rust library of Android (arm64 and armv7). No
  source code goes up. The `sentry` job then makes the release in
  Sentry, sets its commits from git, and finalizes it.
- Each part sends the version as its release: "2.B.N" for the screen,
  the Mac app and the iPhone app, and
  `so.yonder@<version>+<version code>` for Android (the default of
  `sentry-android`). The screen sends sessions (the default of
  `@sentry/react`), so the crash-free rate of a release comes from the
  screen. The Rust code sends no sessions.
- Not covered: crashes of Swift and Objective-C code (CarPlay,
  the Live Activity, the share sheet, the Watch app, the plugins of the
  iPhone). The
  App Store Connect crash logs of TestFlight still have those.
- Only errors and panics go up. No traces and no session replays,
  because the screen shows what the user says.

## Architecture

The diagram is in `CLAUDE.md`.

### Decision: two layers, no orchestrator session

No persistent Claude Code session sits between Grok and the workers:

- The bridge must control the worker processes anyway, for the list of
  workers, the session IDs, and the "worker finished" signal.
- One saved session can do only one turn at a time. Each request and each
  result would need a queue, and each turn adds 10 to 30 seconds.
- Grok can select the project and pass the words of the user to a worker.
  The worker is Claude Code, so it plans the task itself.

If Grok routes work badly, add a Claude orchestrator as one more tool. Do not
add it as a layer.

The state of the agents is in the Grok prompt, so Grok can answer a
question with no tool call. An orchestrator in the answer path adds 10 to 30
seconds to each question, and Grok cannot wait for a tool.

A Claude session that makes the tool calls, with a voice that only talks, is
faster than a full agent. A lean `claude -p` session that stays open says its
first words after 0.4 to 1.6 s, and answers with a tool call after 2.2 to
4.1 s. A full agent says its first text after a median of 15.4 s. So the 10
to 30 seconds above are true only for a full session. `docs/brain.md` has the
research, three designs and a plan. `bun bridge/brain-check.ts` starts such a
session in a terminal. "Claude" under Voice agent (Grok) tells how the Claude
model of the Voice settings works.

### Voice agent (Grok)

- `src/voice.ts` connects to `wss://api.x.ai/v1/realtime` with an ephemeral
  token from the bridge, so the API key stays out of the window.
- Calls are only on the phone. A computer (Mac, Linux,
  Windows) has no call button, no Call key in Keys and no menu bar icon,
  and `toggleCall` starts no call there: the call key of an older
  setting, `yonder call` on Omarchy and `yonder.call.start` do nothing.
  The call row of a computer shows only an update that waits.
- On a paired phone, "Start call" is a small phone button over the tab
  bar, at the left of New chat, in each style (`smallCall` in
  `src/App.tsx`). Its label is `copy.call` of the style. On iOS 26 it
  is a native glass button. The call row then shows only a call that
  is on (End call, the time and Mute). A phone with
  no pairing keeps its one large button ("Pair your computer"), because
  it is the first step.
  The own screens have a small round call button too. The title bar
  has no room for it: on the Apps tab its third button goes under the
  name of the project.
  `yonder.call.state()` gives `available: false` on a computer, so an
  own screen shows no call button there.
- Yonder is free, with no paid plan. A voice call needs no account and no sign-in: it uses the key of a voice
  provider in `~/.config/yonder/.env` of the computer, or a voice module
  of the user's own (`docs/voice/`). Each paired phone has the call
  button. `toggleCall` in `src/App.tsx` checks `keys` of
  `GET /token?check` of the bridge. With no key of the chosen provider,
  it asks the bridge again, because the key can be new, and then shows
  one toast, "Add a voice key to your computer to talk.", with a How
  button to the guide of the voice module (`VOICE_DOCS`, in the public
  repository). The app has no plan, no subscribe sheet and no call
  time. `bun bridge/voicekey-e2e.ts` checks
  the call button with no account, the toast with no key, the token
  request with a key, and the Model row of Settings › Voice. The sign-in
  stays, for the tunnel and the backup of the settings. Each user picks
  the voice model and the speech to text in Settings › Voice, among the
  providers whose key the computer has (see "Settings").
- `GET /token?check` of the bridge tells the app if the computer has its
  own key. It also gives `keys`: the ids of the voice providers and of
  the speech to text models whose key is in `.env` (`VOICE_KEYS` in
  `bridge/main.ts`). The pickers of Settings › Voice and the call button
  use it.
- The Account section of the settings:
  - The photo and the email: Settings › Account has a
    profile picture (a tap opens the photos and the camera on the phone,
    and a file on the Mac) and the email. The picture is the middle
    square of the photo at 160 px, as a JPEG data URL (`avatar` in
    `GET /api/app/account`), and it shows as a circle in the Settings.
    A new email changes only when the user opens the link that yonder.so
    sends to it. Sign in with Apple and Google still find the account by
    the old email. The account page of yonder.so does the same.
  - The referral link: each account has a referral
    link (`referral` in `GET /api/app/account`). Invite friends in the
    Account section of the settings opens the share sheet on the phone
    and copies the link on the Mac. The account page of yonder.so shows
    the link too. Each call is free, so Invite friends only shares the
    link, and its row has no "30 minutes" text. The landing page repository keeps the
    details.
  - Only a super user (`is_superuser` on yonder.so, `superuser` in
    `GET /api/app/account`) sees the Grok voice and the Cost, in the
    Super user section, the last of the Settings, and finds them in the
    search. Each user picks the
    voice model and the speech to text in Settings › Voice: the Model row offers only the providers whose key is in `.env`
    (`hasVoiceKey` in `src/voice.ts`, from `keys` of `/token?check`), and
    "No voice key on this computer" with none. The Speech to text
    dropdown offers Apple, Parakeet on a Mac with its helper, and Soniox
    or Deepgram with their key. `voiceProvider()` gives the chosen
    provider, else the first one with a key, else Grok.
  - The Grok voice: a super user picks it in the Voice section (a
    dropdown of the 28 voices of `GET https://api.x.ai/v1/tts/voices`),
    and it changes for all accounts. Staff can give one account its own
    voice at `/admin/accounts/voice/` of yonder.so. The account gives
    `voice`, and `session.update` of the Grok call uses it (Liora with
    none). Backstage of yonder.so has a "Voices" link to that admin
    page: change the "Everyone" row in the list, or add a row with a
    user.
  - The CarPlay call and the Apple Watch call (`CarCall.swift`) are always Grok, also when the web call
    uses another model. They need no account: the token comes from the
    bridge, with the xAI key in `.env`, and with no key the call says
    "Add an xAI key to your computer to talk". With a sign-in, they use
    the Grok voice of the account.
- The sign-in page (`src/SignIn.tsx`) is a full page, as a section of
  the settings, with a back button and a swipe back. With no account,
  the account card at the top of the settings opens this page at once.
  The phone always shows the Account section, with a Sign up row and a
  Sign in row, also when the Mac has its own key. The sign-in page has
  no password: the user types the email, yonder.so sends a 6-digit
  code, and the code signs in (`POST /api/app/code` and
  `/api/app/verify`). An email with no account gets one, so the sign-in
  is also the sign-up.
  - "Continue with Google" on the sign-in page opens the Google
    sign-in of yonder.so in the sign-in window of the system on the
    Mac and the iPhone, because Google refuses a sign-in in a webview.
    The window closes itself when the sign-in is done. On the Mac it
    opens in the default browser, so Chrome with a known Google
    account signs in with no click. Android opens the browser. The app
    asks yonder.so for a random code until the sign-in is done, so it
    needs no link back. A Google email
    is the same account as a sign-up with that email. The site needs
    `GOOGLE_CLIENT_ID` and
    `GOOGLE_CLIENT_SECRET`, a Web client of Google Cloud with the
    redirect `https://yonder.so/api/app/google/callback`.
  - "Continue with Apple" (Sign in with Apple) is on the sign-in page
    of the iPhone only, above Google, because App Review asks for it
    (guideline 4.8: an app with a Google sign-in must
    also offer a sign-in that can hide the email). It is the native
    sheet of iOS (`AppleSignIn.swift`, `apple_sign_in` of
    `ios/src/lib.rs`) and asks only for the email. The phone sends the
    identity token to `/api/app/apple` of yonder.so, which checks its
    signature with the keys of Apple. An Apple email is the same
    account as a sign-up with that email. With "Hide My Email" the
    email is an address of `privaterelay.appleid.com`. An older iPhone
    app, the Mac and Android do not show the button. When
    Apple refuses the sign-in, the phone sends the error code of Apple,
    and the screen shows that code. Code 1000 means the iPhone has no
    Apple ID. The screen then says to sign in to it in Settings. An
    older app says to try again, with no code. A report to Sentry
    shows the code (YONDER-E).
  - Not done yet: sign-in with GitHub.
- Each call starts a fresh conversation of Grok, with no session
  resumption of xAI (`?conversation_id=<id>`). xAI takes longer to
  answer a longer conversation: the median time from `speech_stopped`
  to the tool call was about 1.0 s with fewer than 20 items, 1.55 s
  with 120 to 200, and 2.2 s with 200 to 400. A resumed call starts
  with about 75 items, so it is slow from its first turn. The whole wait
  is on the side of xAI: `committed`, the transcript and the tool call
  come in the same few milliseconds.
- Audio is PCM16 over binary WebSocket frames, at the rate of the device
  (44.1 or 48 kHz). Server VAD finds the end of each turn, after 1.2
  seconds of silence (`SILENCE_MS`, see the pauses to think below).
- The OpenAI call. When Model in the Voice settings is
  OpenAI, the call goes to the realtime API of OpenAI with
  `gpt-realtime-2.1`, in place of Grok. The rest of the call stays the
  same: the prompt, the tools
  of the bridge and of the app, server VAD with `SILENCE_MS`, the checks
  of `runTool`, and the transcript.
  - The bridge makes the token: `GET /token?provider=openai` uses
    `OPENAI_API_KEY` in `~/.config/yonder/.env`. The token also gives the
    model, so the name of the model is only in `bridge/main.ts`. yonder.so
    gives only Grok tokens, so an OpenAI call needs the key on the Mac,
    also for a call on the phone. Without the key, the call does not
    start, and the app shows "Put OPENAI_API_KEY=... in ...". An older
    bridge ignores `provider` and gives a Grok token. The app then asks
    the user to restart the bridge.
  - OpenAI takes and gives PCM16 at 24 kHz only, in base64 in JSON events
    (`input_audio_buffer.append`, `response.output_audio.delta`), not in
    binary frames. The AudioContext keeps the rate of the device, as for
    Grok, and the app converts each 100 ms frame of the microphone to
    24 kHz (`to24k`). The audio of OpenAI plays from buffers at 24 kHz.
  - The voice is Marin (`marin`). The words of the user come from
    `gpt-4o-mini-transcribe`. Without a transcription model, OpenAI sends
    no words of the user. Then the transcript, the context for the agents
    and the check of a message to a running agent stop.
  - OpenAI has no web search and no X search, so the session gets only
    the function tools.
  - OpenAI bills tokens, not minutes. The usage in each `response.done` is
    for that response only, so the app adds it up (for Grok, never add
    it up). The prices of `gpt-realtime-2.1` for 1M tokens: text $4 in
    and $24 out, audio $32 in and $64 out, cached input $0.40. The cost
    of the transcription is not in the estimate.
  - An OpenAI session ends after 60 minutes.
  - Not done: when the user interrupts, the app does not cut the answer
    (`conversation.item.truncate`), so OpenAI thinks that the user heard
    all of it. The car mode (CarPlay) always uses Grok.
  - Check it with `bun bridge/openai-check.ts` (about one cent). It makes
    a token, sets up the session in the form of the app, and speaks a
    request with `say` at 48 kHz through `to24k`. A pass gives the
    transcript, a `start_worker` call and a spoken answer. The 28 tools
    of the bridge and a prompt of 20,000 characters also pass. Bun fails
    the handshake with the
    subprotocols of the app ("Expected 101 status code"), so the check
    sends the token in a header. A curl handshake with the subprotocols
    of the app gets 101 and `sec-websocket-protocol: realtime`.
- The microphone stays open while Grok talks (full duplex), so that you can
  interrupt Grok. Server VAD hears you and cancels the response. The app
  stops the audio in the queue and drops late audio until the next response.
  The echo cancellation of `getUserMedia` keeps Grok's voice out of the
  microphone: during Grok's speech, the peak in `call.log` is about 0.01.
- With half duplex, the microphone is out while any audio is in the
  queue, so the server never hears an interruption. If Grok answers its
  own voice, go back to half duplex.
- xAI bills the connected time. `usage.billable_audio_seconds` in each
  `response.done` is a running total for the call, so never add it up. The
  app counts the connected time. A sum of those totals shows about ten
  times the real cost.
- The app saves the cost of the live call each second (`grokCall` in
  `localStorage`). A reinstall during a call kills the app before the call
  ends, and else the cost of that call is lost.
- The real spend comes from the billing records of xAI, the same numbers
  as the xAI console. The bridge reads them through the xAI Management API
  (`/grok-usage`): the spend of this month for each item, and the prepaid
  credit left. The credit left comes from the invoice preview: the prepaid
  credit minus the credit that this month used. The prepaid balance alone
  does not subtract the spend of the open month. It keeps the answer for
  60 seconds, and the app reads it
  every 30 seconds. The Management API needs a management key, which is
  not the API key. Make it in the xAI console, under Settings, Management
  Keys, and put `XAI_MANAGEMENT_KEY=...` in `~/.config/yonder/.env`. With
  the key, the top bar shows "$X on xAI · $Y left", and its tooltip gives
  each item. Without the key, the top bar shows the estimate from the
  connected minutes. `call_status` gives both to Grok.
- Tool results (`function_call_output`) do not count as billed text
  inputs: the xAI console showed 14 text inputs for 151 tool calls.
- The app answers the `call_status` tool itself: the minutes live, the cost
  of the call, the cost of all calls on Grok (the top bar), about how many
  tokens the Grok context holds, the counts of running and waiting agents,
  the version, and the theme. It also gives the real numbers from the xAI
  console (see below). It also says if the Mac is connected (`mac`), or
  since when it is offline, for example when the lid is closed and the
  phone cannot reach the bridge.
  The `set_theme` tool, which the app also answers, switches the
  light and dark theme ("dark mode"). It also takes `system`: the app
  follows the light or dark mode of the device, also when it changes
  while the app is open.
  The Theme row of the Settings has Light, Dark and System. The bridge has
  a `set_theme` tool of its own for the clients with no device, such as
  the Claude app and the Claude brain: it writes `theme` in `phone.json`,
  and the phones take it in a few seconds. The voice of the app keeps its
  own tool, so the bridge gives it no second one. Thus the Claude app
  switches the theme by voice.
- The `end_call` tool, which the app also answers, ends the call when Grok
  stops talking, as after `rebuild_app`. Else Grok can close an agent
  when the user says "end call".
- A call that ends with code 1006 lost its connection with no close
  frame, usually because the device lost its network. The socket to xAI
  and the relay link then die together. The app says "the connection to
  Grok dropped" in place of "code 1006". A hang-up from the user gives
  1005.
  A call on the iPhone also ends with 1006 when the user leaves the app,
  iOS interrupts its audio (`audio: interrupted`), and suspends Yonder
  for 60 s. The drop shows when the user comes back. After an
  interruption, the app says that iOS paused Yonder, not "Check the
  network". The page cannot keep the call on through an interruption.
- The call writes its events to `~/.config/yonder/call.log` through the
  bridge, because nobody can read the console of the app window.
- The call also saves its transcript: what the user said, what Grok said,
  and the tool calls. The bridge writes one file for each call in
  `~/.config/yonder/calls/<start time>.jsonl`, and `/calls` returns the 50
  newest. The settings of the app (Voice, Call history) show them.
- The file of a call also keeps the full prompt that each agent got from
  `start_worker` and `message_worker` (`"who": "sent"`, with the agent
  number), with the voice-call block that the bridge adds. The app sends
  the ID of the call to these two tools as `call`, and Grok does not see
  it.
- Grok has the built-in `web_search` and `x_search` tools of xAI, so it
  can look up the web and X itself. xAI runs them, and the app does not
  answer them.
- "Open Google" or "check my current tab": Grok calls the `browser`
  tool, which does one quick step in Chrome with the `browser-harness`
  CLI. `read` gives the address, the title and the first 3000
  characters of the text of the tab that the user sees. `tabs` lists the
  open tabs. `open` opens a URL in a new tab and shows it. A task of more
  steps, such as a checkout or a flight search, goes to an agent, in the
  project on the screen or in Yonder. Each agent knows `browser-harness`
  from the global `CLAUDE.md` of the user.
- Yonder does not install browser-harness by itself. The Tools section
  of the Settings (`bridge/tools.ts`, `/tools`) lists the tools that let
  agents do more: Browser Harness, Visual Sandbox (`vsb`), the
  1Password CLI (`op`) and Kokoro (`kokoro-tts`), each with
  a short line of what it does and a link to its page. The bridge
  looks for each tool and its skill in `~/.claude/skills`. A tool that is
  there stays as it is. Install runs only after a tap and a yes. It runs
  in the background on the computer of the bridge, so a tap on the phone
  installs on the paired Mac, Linux or Windows computer, also one with
  no screen. Visual Sandbox does not show on Windows, because its
  installer has no Windows build. The 1Password CLI comes as the zip of
  its newest version for each system, into `~/.local/bin`, so it needs
  no sudo. Kokoro is a free text to speech model (82M parameters) that
  runs on the CPU. Its install gets the `kokoro-tts` CLI with `uv`, the
  model files (337 MB) into `~/.local/share/kokoro`, and a `kokoro` skill
  that tells agents how to make speech with it. It does not show on
  Windows. The voice calls do not use it yet. The Mind is a folder, not
  a CLI: a second brain of
  markdown pages, a dropbox inbox and a to-do list, with its own skills
  in `.claude/skills`. Install copies the public template
  (the repository `the-mind`, `MIND_ZIP` in `bridge/tools.ts`) to
  `~/mind` with no link back to it,
  and adds `~/mind` to the projects. A folder that is already at `~/mind`
  stops the install. The row shows Installed when `~/mind/MIND.md` is
  there. When the project `mind` is on the list, the prompt of the voice
  agent sends notes, logs and to-dos of the user to a worker in it.
  Without browser-harness, the `browser` tool tells Grok to send the user
  to Settings, Tools.
- browser-harness makes each tab that it attaches look visible, so the
  bridge asks Chrome for the tab that the user sees, with AppleScript.
  macOS asks one time if Yonder can control Chrome. Without that
  permission, or after 5 seconds with no answer, `read` takes the first
  tab. `read` reads the tab through a
  second CDP session, so it does not move the tab that browser-harness
  controls for an agent.
- "Make an image of a cow with GPT Image 2.5": Grok calls `start_worker`
  in the project on the screen, or in Yonder, with the words of the user.
  The agent makes the picture, the video or the sound with the `vsb` CLI
  of Visual Sandbox, and the conversation view of the agent shows it.
  GPT Image, Nano Banana, Flux, Veo, Kling, Seedance and ElevenLabs are
  models of Visual Sandbox, so their names go in the task. The `model`
  input takes only a Claude model, and the bridge refuses other names,
  because Claude Code cannot run them.
- The prompt gives the time and the place of the user ("Time & Place"):
  the date and the time to the minute, and the city of the time zone of
  the Mac (`Europe/Paris` is Paris), so the app needs no location
  permission. Grok uses them for "today", the weather and local
  questions, and gives the units of the country of the user (Celsius and
  kilometers in France). The time changes each minute, so the poll sends
  Grok a new prompt once a minute. Else Grok does not know the time or
  the place.
- The voice agent only talks to the person. It does not do the work.
- Each new request goes to a new agent (`start_worker`), also when an
  agent of the same project runs, waits or finished. Grok calls
  `message_worker` only when the user answers an agent, continues,
  corrects or adds to its task, or names the agent. When Grok is not
  sure, it starts a new agent. Else Grok sends new requests to agents
  that already have other work.
- The exception is an open conversation. When the user reads agent 4,
  each request goes to agent 4 with `message_worker`, also a new task,
  and also when agent 4 is done. A running agent 4 gets a new task after
  its turn. Grok starts a new agent only when the user names another
  agent or project ("send it to 2"), asks for a new agent, or asks for
  a change of Yonder. The rule is in `screen` in `src/App.tsx`.
- "Another agent", "a new agent" or "get an agent to" with no agent
  number always starts a new agent, also in an open conversation and also
  for the result that Grok just told about. Grok then puts the facts of
  that result in the task, such as the list of problems, because the new
  agent knows nothing. Else "send another agent to fix that" goes to the
  agent of the result, or the new task names "the five problems" with no
  list.
- A command for the app ("update the app", "show completed", "end the
  call") calls its own tool, also in an open conversation. It never goes
  to the agent of the conversation. "Update the phone" is `rebuild_app`
  too, because the update brings the new screen to the phone. Else a
  request to update the phone or the app goes to the agent of the open
  conversation.
- A request that uses, shows or checks what an agent already made ("open
  the pricing page in the browser", "run it", "push it") goes to that agent
  with `message_worker`, also when it is done. That agent knows its files,
  its dev server and its sign-in. Before each `start_worker`, Grok reads
  the agent lines of its prompt, and when no agent fits, it calls
  `list_workers` with `query`. Each line of a done or waiting agent tells
  how long ago it finished, such as "finished 2m ago". Else a request to
  open a page that an agent just restyled starts a new agent.
- A reply to the result that Grok just told about is the same task, also
  with no number. When the user rejects, changes or builds on that result,
  Grok calls `message_worker` for that agent. Else a rejection of the
  result of a research starts a new agent.
- A question about earlier work is not a new request ("what about the
  landing page push?", "any update on the checkout?"). When the prompt
  does not show that agent, Grok calls `list_workers` with `query`, a few
  words about the work. The search covers all the projects, also the done
  and closed agents, and the focus of the screen does not limit it. Grok
  answers from the match, or asks which one when two or three can fit.
  It starts an agent only when the search finds nothing and the user
  wants it checked. Else a question about an agent on the Completed tab
  starts a new agent with the question.
- One request goes to one agent. When the user changes the agent or the
  request in the middle of the words ("or actually", "no wait", "I
  mean"), only the words after the change count, and the first agent gets
  nothing. Grok sends to two agents in one answer only when the user gives
  each agent a different request. Else a request that changes its
  agent in the middle goes to both agents. A split of a job, as the next point tells, is
  the other case of two agents in one answer.
- The words after the change also pick the first words of Grok. Grok
  says "Sent to 3." only with `message_worker` and "Agent started." only
  with `start_worker`. Grok says these words before the tool call, so the
  words can come from the request before the change. The app then checks
  each response with tool calls (`wrongWords` in `src/voice.ts`). When
  the words promise a tool that the response did not call, the app tells
  Grok what it really did, and Grok corrects itself in a second response.
  Else a request that changes from a message to a close gives "Sent to
  3." with only a `close_worker` call, and the user thinks that agent 3
  got a message.
  The note of the app has no example with a real number. It gives the
  form of the words for each tool that Grok called, such as "Sorry,
  wrong words. I started a new agent, <number>.", and it tells Grok
  that the note is not a request of the user and needs no tool call.
  The app also refuses a `start_worker` or `message_worker` call with
  "[Yonder app]" in its inputs. Else Grok can start an agent with the
  note as its task, and say the example words of the note although
  they are not true.
  A response that promises a tool and calls no tool at all gets a note
  too, once in a turn: Grok then calls the tool, when the user asked for
  it, or says "Sorry, I did nothing yet." The app skips the note when the
  user speaks or cut the response off. Else "Agent started." with no
  tool call loses the request.
  The check counts the tool calls of the whole turn, from the last
  words of the user, not of one response. Grok can call the tool with
  no words, and say its fixed words in the next response, after the
  result. Else the check sees only that second response, the note says
  that Grok called no tool, and the user hears two answers.
  When Grok then makes the call with no words, the app asks for no
  second answer, because the user already heard the words.
- The app refuses a `message_worker` call to a running agent that the
  talk does not point at (`busy` in `src/voice.ts`). The call goes
  through only when one of these is true:
  - The words of the user, or the earlier words of Grok since the last
    message to an agent, name its number (`src/names.ts`). The words of
    the current response do not count, because Grok says "Sent to 3."
    before it calls the tool.
  - Grok messaged, started, read (`get_worker`) or opened (`show_agent`)
    that agent since the last message to an agent.
  - The user reads the conversation of that agent.
  Otherwise Grok says "Not sent. Agent 3 works on something else. Send
  it to 3, or start a new agent?", and does what the user answers. A
  done, waiting or closed agent has no such check. When Grok calls the
  tool before the words of the user arrive (23 of 2,690 turns in the
  records), the app cannot check the words, so it sends the message.
  Else a request for "that agent", after a question that Grok answered
  with `about_yonder`, goes with `now` to a running agent with other
  work, and that agent stops its turn for a task that is not its own.
- Grok can split a big job over several agents, so that the parts run in
  parallel. It splits when the user asks for it ("split it up", "use
  several agents"), or when one request has separate tasks that do not
  change the same files. Grok then calls `start_worker` once for each
  part, in the same answer. Each task starts with the full request, then
  tells the part of this agent and the parts of the other agents, so that
  each agent does only its part. Parts that change the same files go to
  one agent, and when Grok is not sure, it uses one agent. Grok says how
  many agents it started. No new tool is necessary: Grok already sends
  several calls in one answer.
- The speech to text can give one sentence two times. The app then does
  not send the same `start_worker` or `message_worker` call (the same
  inputs) again in 30 seconds (`sent` in `src/voice.ts`). Grok gets "Not
  sent" for the second call. Else one sentence that comes two times, 3
  seconds apart, gives two calls.
- The user often stops for a breath in the middle of one request. Grok
  then calls `start_worker` at each stop, each time with more of the same
  words. So the app sends a `start_worker` call to the last agent of the
  call with `message_worker` (with `now`) when the call comes in a later
  turn of the user, less than 60 seconds after that agent started, and
  the first 60 letters and digits of the two tasks are the same
  (`lastStart` in `src/voice.ts`). The agent gets all the words, and Grok
  hears "Not a new agent". Calls in the same answer, such as the parts of
  a split job, still start new agents. Else one request with two pauses
  starts three agents.
- Pauses to think: the user often stops for 1 to 2 seconds to think in
  the middle of a request. With the default of xAI, the server VAD ends
  a turn after about 200 ms of silence, and Grok answers about 0.7
  seconds after the last word. So a pause of 0.8 seconds ends the
  turn, and Grok acts on half a request. In the records of `call.log`,
  314 of 2,374 turns of the user were cut this way (the next transcript
  repeated the turn and added more). In 137 of them, Grok had already
  called `start_worker` or `message_worker`. The median pause was 1.3
  seconds. Else the user must keep talking, or Grok acts before they
  finish. Two changes:
  - `silence_duration_ms` is 1200 (`SILENCE_MS` in `src/voice.ts`). It
    keeps more than half of those pauses in one turn, and each answer
    comes about 1.2 seconds later. An estimate from the same pauses:
    1000 keeps about 46%, and 1500 about 71%. xAI does not document the
    field, but its server returns it in `session.updated` and honors it.
    `bun bridge/vad-check.ts [silence ms] [pause ms]` checks it with a
    real session and a voice from `say` (about one cent).
  - The prompt tells Grok that words that stop in the middle of a
    sentence, or that end with a filler ("um", "and", "give me a sec"),
    are not the end of the request. Grok then calls no tool and says
    nothing or only "Mm-hm.". In `call.log`, 59% of the cut turns ended
    like that, and 17% of the other turns.
  - Grok never fills a pause with a question or a push, such as
    "Anything else?", "Go on." or "What's on your mind?". After "okay",
    "perfect" or "thanks", it says nothing or only "Mm-hm.". Else the
    user feels rushed.
  - After an answer with only tool calls, xAI adds the next words to the
    same turn: the transcript repeats the earlier words. After an answer
    with audio, the next words are a new turn.
  - These settings have no effect: `semantic_vad` (accepted, but
    it cuts the same pause as `server_vad`), `create_response: false`
    (accepted, but Grok still answers), and `threshold`,
    `interrupt_response`, `eagerness` and `smart_turn` (dropped).
    `turn_detection: null` gives manual turns: the app sends
    `input_audio_buffer.commit` and `response.create` itself, as for a
    key that the user holds while they talk. That is the next step if
    pauses still cut turns.
- Grok says "Agent started." first, and then calls `start_worker`
  in the same answer. `start_worker` takes about 1.5 seconds: Clef picks
  the effort (0.3 to 0.7 seconds), and then `claude --bg` starts. When
  Grok calls first and speaks after the result, the user hears 3 to 4
  seconds of silence after the end of the words, on the Mac and on the
  phone. With the words first, the user hears Grok after about 1.3
  seconds, and the app sends no second response (`spoke` in
  `src/voice.ts`). A failed call still gets a second response with the
  error. The relay adds only about 0.2 seconds.
  `message_worker` gets the same rule ("Sent to 3." first), because it
  also starts `claude --bg` and takes about 1.4 to 1.9 seconds. In
  `call.log`, the median time from the end of the words to the first
  sound for these two tools was 0.7 seconds when Grok spoke first, and
  2.8 seconds on the Mac and 3.3 seconds on the phone when Grok called
  first.
- When Grok does more than one action in one answer, it says each
  action with its agent number ("Closed 12 and started 3."). Else the
  user hears only "Closed 12." and does not know about the new agent.
- The words are fixed: "Agent 4 started." for `start_worker`, and "Sent
  to" with the number for `message_worker` ("Sent to 3."). The fixed
  words are quick and tell exactly what happened. Else Grok can say
  "Sent." for a new agent. When the app
  sends a `start_worker` call to an earlier agent (`lastStart`), Grok
  gets a second response and says "No new agent. Sent to 6.".
  The words come before the agent has a number, so the prompt gives
  the number of the next new agent: the lowest number that no open
  agent holds, as `freeNum` in the bridge does. Else the user must ask
  "which agent did you start?". The result of
  `start_worker` asks for a second response only when Grok said another
  number ("Sorry, it's agent 5.") or no number (a split job: "It's agent
  5."). The prompt changes at most each 3 seconds, so a second agent in
  that time can get the correction. The car and the watch still say
  "Agent started.", because their prompt does not change during a call.
- Grok remembers nothing after a call, because each call starts from the
  prompt. So when the user asks Grok to act differently "in the future",
  "from now on" or "next time", or to "update that", Grok starts an agent
  in Yonder with the request and with what Grok did wrong. The agent
  changes the prompt or the code, so the change stays. Grok never says
  "I'll keep that in mind". "Update that in the future" is not a request
  for `rebuild_app`.
- "Remember" is a request of this kind when it tells Grok how to act:
  "remember to ...", "remember not to ...", "just remember that", "don't
  do that again". A "remember" right after a correction of Grok asks for
  the fix also when the words trail off, because the correction is the
  mistake. When Grok cannot tell what to remember, it asks "Remember
  what?". "Do you remember ...?" is a question, and a fact for the work
  of an agent goes to that agent. The task of the agent tells the mistake
  of this call: the words of the user, the tool call of Grok, and what the
  user wanted. No tool or code changed: `start_worker` in "yonder"
  already does it. The prompt has no example of an older mistake, and it
  forbids an older mistake or an example in the task. Else Grok starts
  an agent with the example of the prompt, and that agent finds nothing
  to fix.
- The user can ask for a review of the past calls ("review our calls",
  "learn from our calls"). Grok starts an agent in Yonder, and the agent
  follows the `review-calls` skill (`.claude/skills/review-calls/SKILL.md`).
  It reads the transcripts that came after the last review, and finds
  the moments where the user got frustrated: a correction, a request said
  again, "what are you doing?", "that's obvious", "stop talking", a change
  that the user asked for, or work that got lost with no sign. It groups
  the moments by the step of the workflow (start work, follow up, hear a
  result, go through the agents, close, update Yonder), and fixes each
  group with two or more moments and each change that the user asked for.
  It looks only at the frustrations and the workflow, and does not judge
  the work of the agents. Each review writes its fixes
  and its open questions in `~/.config/yonder/call-reviews.md`, which also tells where
  the next review starts. A "remember" request fixes one mistake during a
  call, and the review also finds the requests that got lost.
- Grok puts the facts that the user names into the message, not only the
  words that name them. "Tell it our version number" sends the version
  itself. When the user reports a bug in the app, Grok also adds the
  version and the device (the phone app or the Mac app). Else the agent
  gets the words about the version with no number.
- When the user takes back what they said ("never mind", "forget it",
  "scratch that"), at the end of the words or right after them, Grok calls
  no tool and says only a few words. "Never mind X, do Y" still asks for
  Y. After `message_worker`, Grok always says the number of the agent
  ("Sent to 3."), because a sent message cannot come back. Else a half
  thought that ends with "never mind" goes to an agent, and the user
  does not know which one.
- `start_worker` and `message_worker` take a `context` input that Grok does
  not see. The app fills it with the lines of the call since the last
  message to an agent (12 at most), and the bridge adds them to the prompt
  of the worker, so that the agent knows the conversation and not only the
  request. A message to an agent empties the lines, so no agent gets words
  that an earlier agent already got. The task on the screen stays short.
  When the lines are only words of the user that the request already
  holds, the bridge leaves out the block. In the records, 57 of 391 first
  prompts had such a block.
- Images: press ⌘V anywhere in the window, or drop an image anywhere, to
  attach it. A drop takes any file. On the Mac, a file from Finder stays
  at its place, as a copied file does: the bridge reads the drag
  pasteboard (`GET /clipboard-files?drag`). When its names do not match
  the dropped files, such as a file from a browser, each file uploads
  (`/file`). A file that is not a picture or a video, such as an `.xlsx`,
  shows as a page with its type and its name, as high as a picture
  (`.images .doc`), for a drop and for a paste. Check: `bun
  bridge/drop-e2e.ts`. The rest of
  this item is about images. The bridge saves each image in `~/.config/yonder/images`
  (`POST /image`, PNG, JPEG, GIF or WebP, 20 MB at most). The paths go
  with the next `start_worker` or `message_worker` call in a `files`
  input that Grok does not see. The bridge adds the paths to the prompt,
  and the worker reads each file. The prompt box of the conversation view
  also sends the attached images with its message. After a send, the
  images leave the screen, because the agent has them now. Grok
  cannot see the images, but its prompt tells it how many the user
  attached.
  In the chat of an agent of another computer, and in the New agent
  view of another computer, a pasted or dropped image goes to the
  bridge of that computer (`imageFetch` in `src/App.tsx`, `/image` in
  `PEER_PATHS` of `bridge/relay.ts`). It shrinks first, as a photo of the
  phone, because the relay takes 1 MiB at most for each request. That
  computer gets only images: no video, file or pasted text. The bridge
  of that computer must let in `/image`. The attached images go when
  the chat moves to another computer.
- Pasted text: tap Paste in the attach sheet of the phone (see the attach button), or press ⌘V
  outside a text field on the Mac. The bridge saves the text in
  `~/.config/yonder/pastes` (`POST /paste`, 1 MB at most), and the text
  shows as a box with its first words with the attached images. The ×
  on the box removes it. The path goes with the next `start_worker` or
  `message_worker` call in the `files` input, and the bridge puts it in a
  `<pasted-text>` block, so the worker reads the file. Grok gets a note on
  the screen that the user pasted text, and it reads the text with the
  `read_paste` tool of the app (20,000 characters of each text at most).
  The summary of an agent leaves out the block, as it leaves out the
  images.
  A file copied in Finder attaches at its own place, also in a text field.
  WebKit hides the path, so the bridge reads the pasteboard of the Mac
  (`GET /clipboard-files`). Then `POST /local?path=...` (`localFile` in
  `bridge/main.ts`) copies nothing: a picture shows as a thumb and goes in
  the `<images>` block with its own path, a video gets a folder in
  `~/.config/yonder/videos` with a link to the file, its frames and
  `timeline.md`, and the `<videos>` block names the original path too.
  Each other file shows its name and goes in the `<files>` block with its
  path. The relay does not pass `/local`, so only the Mac names a path.
  A folder does not attach: `/local` gives it `folder`, and its path goes
  as text in the prompt box, at the cursor. Two folders go with a space
  between them. With no prompt box on the screen, the folder attaches as
  a file.
  Paste in the attach sheet does the same. A screenshot has no file path,
  so it still attaches as an image. A video or a picture from a file
  links the file, with no second upload.
- Videos: drop or paste a video on the Mac, or pick one with the library
  button of the phone. The app sends it to the bridge in parts (`POST
  /video?id=...`, the last part with `end`), 768 KB each on the phone,
  because the relay takes 1 MiB at most for each request. The video can
  be 2 GB at most. The bridge saves it in `~/.config/yonder/videos/<id>`,
  and makes frames and `timeline.md` (`buildVideo` in
  `bridge/recording.ts`): whisper.cpp (`whisper-cli`, a model from
  superwhisper or MacWhisper, or `~/.config/yonder/whisper.bin`) gives
  the words of its sound, and a frame goes in the middle of each sentence, at each
  pointing word and at even steps, 24 at most. The agent gets the folder
  in a `<videos>` block. During the upload, a box with the percent shows
  with the attached images, and a `start_worker` or `message_worker` call
  waits for the upload. Then the first frame and the length show.
- On the iPhone, the user can pick a video of any size from the photo
  library. The `read_picked` command of `ios/src/lib.rs` first makes it
  an MP4 of 1280 x 720 at most with `AVAssetExportPreset1280x720`
  (`ShrinkVideo.swift`); a portrait video keeps its shape. In a test, a
  4K video of 100 MB became 15 MB. The bridge keeps frames of 1600 px at
  most, so 720p keeps the text of a video of the screen readable. While the
  phone reads or shrinks a photo or a video, the strip shows only a
  percent, and a send waits for it. If AVFoundation cannot write the
  MP4, the original goes. The
  command is async, so it runs off the main thread. Else the screen
  gets the whole original, and a large video gives an error.
- Location: on the phone, "get my location" or "send my location to the
  agent": Grok calls `get_location`, which the app answers with
  `navigator.geolocation`. It gives the latitude, the longitude, the
  accuracy and an Apple Maps link, and Grok puts them in the task of the
  agent. The phone asks the user to allow the location the first time
  (`NSLocationWhenInUseUsageDescription` in `ios/Info.ios.plist`, and
  `ACCESS_FINE_LOCATION` in the manifest of Android). This needs a new
  install of the phone app (`bun run install-ios`, `bun run
  install-android`).
  - `get_location` of the bridge gives the location of the phone to each
    agent, to Grok on the Mac, to the brain of a Claude call and to the
    Claude connector. Example: the user walks in a park and says "log this
    spot in Mind". It gives the latitude, the longitude, the accuracy, the
    time of the fix (`at`), the place name and the address, and the map
    link. The location tool of Claude does not always work, so Yonder
    gives its own.
  - The bridge asks the phone of the live call (its `/awake` pings), else
    the phone of the last message, else the phone that polled last. The
    phone takes the ask with its `/show` poll (`&locate`, each 3 seconds),
    gets one fix with `navigator.geolocation`, and answers with `POST
    /location?id=`. An answer takes about 3 seconds.
  - When no phone polled in 15 seconds (Yonder is closed), the bridge
    sends a push to the phones ("Tap to send your location"), and waits
    up to 25 seconds for a phone to open Yonder. Then that phone gets the
    ask, and the same call gets the pin. A tap on the push opens Yonder,
    and its next poll takes the ask. With no push (no push token or no
    APNs key, as in `check-bridge`), it fails at once. It fails after 30
    seconds with no answer, and it gives the error of the phone, such as
    "The user did not allow the location". The wait and the answer stay
    under the 60 seconds of a connector call at the relay.
  - Else an ask while Yonder is closed fails with "Yonder is not open on
    iPhone". The Mac tools do not need the phone: they go through the
    relay to the bridge. Each other ability works the same way, and
    `notify` goes as the push itself, with no app.
  - Why not a wake with no tap: the app has When In Use location, and
    iOS gives no location to an app that a silent push wakes in the
    background ("Create the session while your app is in the
    foreground", Apple, Handling location updates in the background).
    A wake with no tap needs "Always" location, the Location updates
    background mode, a Swift handler of the push and a new phone app,
    and App Review asks why. iOS also delays or drops silent pushes, and
    never wakes an app that the user swiped away (see the other
    computers). The Location Push Service
    Extension needs Always too, and an entitlement from Apple. Not built.
  - Privacy: only on request, one fix while the app is in use, with no
    tracking. The asks live only in the memory of the bridge.
    `~/.config/yonder/phone.log` has
    each ask: the time, who asked, the phone, the ability and the result,
    with no coordinates. The place name comes from
    OpenStreetMap (Nominatim), which gets the coordinates.
  - The phone has its own `get_location` for its Grok, so the bridge does
    not give its tool to a phone. The phone sends its pin to `POST
    /location` with no id, and gets the place name and a line in
    phone.log.
- The abilities of the phone (`docs/shell.md`). Each ability of the
  phone works as `get_location` does, so that the store app never limits
  what the agents can do.
  - The agents, Grok on the Mac and the Claude call get the `phone` tool:
    an ability and its args. The abilities are in `ABILITIES` of
    `bridge/main.ts` and in `src/abilities.ts`. Today: `location`,
    `haptic`, `notify`, `open` and `face_id`. TestFlight 2.93.519 adds
    `share`, `copy`, `paste`, `photo`, `save_photo`, `contact`, `event`,
    `device`, `badge`, `awake`, `confirm` and `sheet` (the native approval sheet). `device`, `confirm`, `sheet`, `copy`, `paste`, `badge`, `awake`, `share`, `event`, `contact` and a cancel of `photo` passed a test in the iOS 27 simulator, through a test bridge and the relay. The camera of the simulator takes no photo, and `save_photo` and `open` have no test.
  - The phone names its abilities in its `/show` poll (`abilities=`),
    and does each ask of the bridge (`ability` and `args`). It answers at
    `POST /answer?id=` with the result or `error`. A native ability runs
    through the one command `ability` of `ios/src/lib.rs`
    (`Abilities.swift`), whose answer comes as
    `window.yonderAbility(id, answer)`, and `abilities` gives the list of
    the app. An older app answers `abilities` with an error, so it names
    none of them. A new native ability needs a case in `Abilities.swift`,
    a line in `src/abilities.ts` and in `ABILITIES`, and a new phone app.
  - `photo` sends the photo to the bridge as an attached image
    (`/image`), at most 2048 points on its long side, and answers with
    its path on the computer. `save_photo` takes a link of the computer,
    such as `/media?path=`. The event editor and the contact picker of
    iOS 17 run outside the app and need no permission.
  - Approve and Deny on a push: the category `approval` (Approve asks for
    Face ID, and both open the app). The choice comes to the page as the
    event `yonder:push`, with the data of the push. The notifications
    plugin gives a choice only for its own local notices, so a proxy in
    front of its delegate gives it (`Push` in `Abilities.swift`).
  - A `yonder://` link that opens the app comes to the page as the event
    `yonder:opened`. The Mac app takes these links too (after a new
    build), with the name of the app that sent the link as
    `app` of the event. `yonder://new` is a new task link (see New task
    links).
  - `yonder://agent?id=<agent ID>` opens the conversation of that agent.
    Copy Link in the three dots of an agent, and in the right-click menu
    of its row (also a row of another computer), gives this link
    (`copyAgentLink` in `src/App.tsx`). The page finds the agent on the
    computer in use, or else on another computer that shows, as a tap
    on its row there (`linkedAgent`). The ID is the session ID, so one
    link works on each Mac and phone of the user. A link that comes
    before the first list of the agents waits for it. A link only opens
    a view, so it needs no check. An agent that nobody can find shows
    "Yonder cannot find this agent." The list of another computer has
    no closed agents, but it keeps each agent of a link
    (`linkedAgents` in `src/elsewhere.ts`). So a link opens a closed
    agent of another computer too. Else that link finds nothing (Sentry
    YONDER-W). Only the Mac app and
    the iPhone app take `yonder://` links: Android, Linux and Windows do
    not.
  - The quick action "Default screen" on the icon of the app: the next
    start runs the screen of the install, and `ui` of `phone.json` goes
    away. No screen can hide it. It is the way back from the custom
    screens of `docs/ui-themes.md`.
  - The bridge asks the same phone as for the location, and refuses at
    once an ability that the app of that phone does not name. An ability
    that opens a screen, such as the share sheet, waits up to 2 minutes
    for the user.
  - A screen from before the abilities polls with `&locate` and answers
    at `/location?id=`, and the bridge still takes that. A new screen also
    sends `&locate`, for a bridge from before the abilities.
  - Content that Yonder did not make, such as an app page of the Apps tab,
    never reaches an ability (App Review Guideline 4.7.2).
  - With the screen locked, iOS can refuse the fix, because the
    permission is "while in use". The error then asks the user to unlock
    the phone. A fix with a locked screen needs a native change.
- Haptics: on the phone, each button, link, image, agent row, call row,
  option and menu item gives a light tap of the Taptic Engine. Each tab
  change also taps, so a drag along the tab bar taps on each tab. A
  press of the call button taps once, firmer. When the call goes live,
  the phone taps three times, from light to heavy, and when the call
  ends, three times, from heavy to light. `haptics()` in `src/bridge.ts`
  plays the taps, 110 ms apart. The end taps also come when Grok or a
  lost connection ends the call. Each close or delete of an agent taps
  twice (`act()` in `src/App.tsx`). One click listener in `src/main.tsx` and
  `haptic()` in `src/bridge.ts` do it, through `tauri-plugin-haptics`.
  This needs a new install of the phone app (`bun run install-ios`, `bun
  run install-android`). An older phone app rejects the call, and the
  front end ignores the error. The Mac has no haptics.
  - The capability is `haptics:allow-impact-feedback`. The plugin has no
    `haptics:default` set, and with it the phone refuses each tap.
  - iOS mutes the haptics while the microphone records. So
    `yonder_haptics_in_calls` in `Island.swift` sets
    `setAllowHapticsAndSystemSoundsDuringRecording(true)` at the start
    of the app, and the buttons also tap during a call.
- Done sound: the check at the end of an agent row, on the Agents tab
  and the Done tab, and the check of an open agent play the Drip sound
  of TickTick (`public/drip.wav`, `ding()` in `src/bridge.ts`). The app decodes the file once at the start, and the file has no silence at its start, so the sound comes at the tap. The AudioContext of the sounds is suspended when no sound plays, because a running one uses the battery. On the Mac, a move of the mouse or a key in the window wakes it, and it is suspended 60 s after the last one (`AWAKE_MS`). A suspended context stops the stream to the output, and the output, such as the audio of a monitor, can need a moment to wake. Else the start of the drip is lost, and the sound comes late after a click on complete. The mouse moves to the button before the click, so the stream runs at the click. A running context used 0.2 % CPU in WebKit, but a running output keeps the Mac from idle sleep, so it does not run all the time. While the Mac keeps the microphone of dictation open, a sound plays on the running AudioContext of that microphone (`shareAudio`). A second AudioContext that starts next to an open microphone makes macOS change the audio, and else the sound of a done agent glitches and comes late. A close
  by Grok or from a menu plays no sound.
- Send sound: a new agent from the New agent view (the talk view or the
  text box) and a voice note to an open agent play a soft, quick swish
  (`public/whoosh.m4a`, `whoosh()` in `src/bridge.ts`), as the notch
  does for a new agent. The file has no silence at its start, and the
  app and the notch load it once at the start, so it plays at the send.
  It plays when the words are final, so it does not touch the
  microphone of the dictation, and not during a call, where the
  microphone of the call would hear it. It sounds like the paper
  airplane of the Spark mail app.
  - The swish is Mixkit sound 3220 (Mixkit Sound Effects Free License,
    which lets an app use it), `swish-3220-soft-c.wav`, 0.42 s.
    It has a high-pass filter at 250 Hz, a low-pass filter at 4.5 kHz,
    a smooth fade-in and fade-out, a short room tail, and a peak of
    -10 dBFS.
  - A phone gets `public/` files only with a new build of the phone
    app, because the updates over the air carry only the JS and the
    CSS. Until then the whoosh is silent there.
- WebKit pastes only into an editable element, so ⌘V outside a text field
  goes to a hidden text area. The window sets `dragDropEnabled: false`,
  so that the web page gets the dropped files. If ⌘V does nothing in the
  app, read the clipboard with the Tauri clipboard plugin instead.
- The Mac app records no full screen and has no `screen_recording` tool
  of Grok. Old recordings stay in
  `~/.config/yonder/recordings`, and an old `<screen-recording>` block
  still shows as a video in its conversation.
- Record an area: the round button next to the paper clip of
  each prompt box on the Mac (`recordScreen` in `src/App.tsx`) calls
  `POST /record` (`recordScreen` in `bridge/recording.ts`). The bridge
  runs `yonder-select` (`src-tauri/select/main.swift`), our own
  selection, as the selection of macOS: the screen darker, a cross
  cursor. The user drags an
  area, and the bridge records it with `screencapture -v -R x,y,w,h
  -k -x`. Escape, a right click, a click without a drag, or the record
  button again cancels the selection. macOS 27 refuses
  `screencapture -i -v` ("video not valid with -i"), and the toolbar of
  Shift-Command-5 (`-iU`) keeps the last area and gives no drag, so the
  bridge uses neither. The button is a red
  stop while it records. A second click (`POST /record/stop`, SIGINT)
  ends it, and 10 minutes end it too. After the drag, `yonder-select`
  stays as a stop button in the menu bar (`stop.circle.fill`), as the
  stop of macOS, and one click there ends the recording. During a
  recording the user works in another app, and there the first click on
  Yonder only brings it to the front.
  - The clicks: while it records, `yonder-select` prints each left or
    right click in the area, with its time, its place and the app
    under it (a global monitor of the mouse, no permission). The
    bridge keeps them in `<video>.clicks.json`, and `buildVideo` puts
    each one in `timeline.md` ("[click at 40% from the left, 25% from
    the top, in Safari]"), with a frame 0.3 seconds after it. So the
    agent knows where and when the user clicked. The `-k` of
    screencapture also draws a circle at each click in the video. The file goes to
  `~/.config/yonder/recordings`, and the app attaches it as a video
  that the user copied in Finder (`/local`): the agent gets its words
  (whisper.cpp) and its frames in `timeline.md`, in a `<videos>` block.
  The relay does not pass `/record`, so only the Mac records.
  - The sound comes from the microphone of the settings (Voice,
    Microphone, `micName`), else from the built-in microphone of the
    Mac (`-G` with its uniqueID, `micId`), and never from the input of
    macOS: AirPods with an open microphone play all sound in the low
    quality of a phone call. The
    music of other apps pauses while the button is red, as for a
    dictation (`set_mic`, the switch Pause music).
  - screencapture writes a frame only when the screen changes, so the
    picture of a recording can end before its sound. `buildVideo` then
    uses the last frame of the file for a later moment. Else a still
    screen gives no frames, and the video fails.
  - Yonder needs the Screen & System Audio Recording permission for
    this button.
- When Grok cannot answer a question from its prompt, it starts an agent in
  the Yonder project with the question, and it does not say "I don't know".
  "Ask another agent" means the same.
  Grok then says that it is not sure and that it will ask an agent ("I'm
  not sure, so I'll ask an agent in Yonder."), not "Got it, I told them."
- Keep the speech short. Give the gist first, then give details if the person
  asks for them. The prompt is in `src/App.tsx` (`instructions`), in the
  section order of the xAI prompting guide.
- Grok goes through the agents one at a time. When the user asks about a
  group ("what do the completed ones say?"), Grok tells about the first one
  at once, and stops. It does not ask first if the user wants to go
  through them. The user answers ("close it", "continue"), Grok does it and
  tells about the next agent in the same answer. It does not offer the next
  agent, because the user can mistake that for the question of the agent.
  An update on all the agents at once is too much.
- After a close in a walkthrough, Grok says no "Done." or "Closed.": it
  goes on at once with the next agent ("Next, agent 4 added the Closed
  tab."), because the screen shows the close. This is the same when the
  user goes through a tab by numbers. Else the user hears only "Done."
  after each close, and must name each next agent.
- Each next agent comes with what it did. When the user says "next" or
  "tell me the next one", Grok says the number and, in one or two short
  sentences, what the agent did and what it needs from the user. It never
  says only "Next is agent 4.", because the user does not look at the
  screen. When Grok does not know the work, it calls `get_worker` first.
- A summary of all is the one exception: "give me a summary of all",
  "sum them all up" or "go over all of them". Grok says "One moment.",
  calls `review_workers` with the tab on the screen (or the group that
  the user names), and then says one short sentence for each agent:
  what it did, and "I recommend closing it" with the reason for each
  Close line. It ends with one question, such as "Should I close 3, 5
  and 7?". After a yes, it closes those agents one at a time, never with
  the tab, because the tab also closes the agents to keep. It calls no
  `show_agent`, so the list stays on the screen. The user wants what
  each agent did and which ones to close, from a second model (Sonnet
  5.5 on high effort), not only the counts by status.
- Each tab is one group of agents for Grok. "The open ones" or "the
  running ones" are on the Agents tab (running). "The completed ones" or
  "the done ones" are on the Done tab (the value `completed`: waiting,
  done or failed). "The ones to review" are the agents at the top of the
  Done tab that wait on the user or need the user. "The closed ones" are
  on the Closed tab. "The saved ones" are on the Saved tab. Removed agents
  show nowhere. Grok tells only about the group
  that the user names. The prompt gives the tab of each agent. Else Grok
  can tell about a closed agent when the user asks for the completed
  ones.
- A group always means its tab, also when the screen shows another tab.
  "Delete" means remove, never close. For a group ("delete the closed
  ones"), Grok calls `close_worker` or `remove_worker` one time with
  `tab` (agents, completed, saved or closed), and the bridge selects the agents
  of that tab. On the Agents, Completed and Closed tabs, the app sets the
  project of the group to the project on the screen. With "All projects"
  selected, or for "all the projects", Grok leaves out the project, and
  the group covers all the projects. Else Grok names some projects for
  "delete for all projects", says "Done", and the agents of the other
  projects stay. The bridge also removes the agents of a group all at
  once, not one at a time. A group skips
  terminal sessions. "Undo" or "reopen them" calls the `undo` tool of
  the bridge. It covers only the agents of the last close, complete or
  remove, and puts each one back as it was before. A removed agent
  cannot come back. Else "delete all the closed ones" on the Agents tab
  can close the running agents too, and "undo" starts many agents
  again.
- The app has no group buttons, such as "Close all" or "Delete all".
  Grok does the group actions by voice:
  "move the completed ones to closed" (`close_worker`), "move the closed
  ones to completed" (`complete_worker`), and "delete the closed ones"
  (`remove_worker`).
- "Close" or "let's close" with no group word closes one agent: the agent that Grok told about last, or the open conversation. Grok closes a group only when the user names it ("all", "the done ones", a tab). When Grok is not sure, it asks "Just this one, or all of them?" Else "let's close" after one agent closes all the completed agents.
- "Are we good to close 4?" is a question, not a close. Grok calls `get_worker` for agent 4 and gives its advice in one or two sentences with the reason: the agent still runs, waits on a question, left work undone, or finished. Grok closes the agent only after a yes, and never asks "Just this one, or all of them?" for a named agent. The rule is in the prompt of the app and in the prompt of the car.
- With a tab, the bridge ignores the worker. Else a `close_worker` call
  with the worker "yonder" and the tab "completed" closes only the
  newest agent of Yonder, and the other agents stay on the Completed
  tab.
- Grok highlights the agents that need the user. For "any news?", it goes
  through only the agents that wait on the user and the results that need
  the user's attention (see Clef under Workers). Then it says in one
  sentence how many other agents finished their task.
- Each time Grok tells about one agent in the news or a walkthrough, it
  also calls `show_agent`, so the screen opens the conversation of that
  agent. The user then sees its summary and chat without a search. The
  walkthrough keeps its group when the screen changes to the project of
  the agent. For a group of all the projects, Grok first calls
  `list_workers`, because the prompt then shows only the project on the
  screen.
- After a close, the next agent of a walkthrough is on the same tab, also
  when the user opened the agent with a click. In the same turn as a
  `close_worker`, `complete_worker` or `remove_worker` of Grok, `show_agent`
  does not change the tab, and tells Grok to stay on it. The next words of
  the user can show any agent again. Else a walkthrough of the Completed
  tab can show a running agent, and the screen goes to the Agents tab.
- Grok never gives news on a closed agent, because the user closed it on
  purpose. The news, the walkthrough and the start of a call leave out the
  closed agents. Grok tells about a closed agent only when the user names
  it or asks about the closed ones.
- Grok closes or removes an agent only when the user asks for it in the
  latest turn. "Close all the done ones" covers only the agents that had
  that status at that time. Grok never closes an agent by itself. Else
  Grok can close a waiting agent after its summary, because of an older
  "close all the done ones".
- The voice agent never waits for a worker. Each tool returns at once.
- Grok does not announce a worker that finishes or that waits on the
  person. The screen shows the status of each agent, and Grok knows the
  result from its prompt. The app sends no `[Yonder]` message, because
  else Grok says "this agent finished" again and again.
- One exception is news in a pause. When an agent starts to wait on the
  user, or gets a result that needs the user's attention (Clef), during a
  call, the app keeps it. When nobody spoke and Grok played nothing for
  4 seconds (`QUIET_MS` and `quiet()` in `src/voice.ts`), the app gives
  Grok one message for all the news (`offerNews` in `src/App.tsx`). Grok
  then says one time, for example "Agent 12 in Yonder needs your
  attention." It asks no question, such as "Do you want an update?", and
  gives the update only when the user asks.
  Each agent is news one time for each change. A plain finish is still
  no news. The news leaves out the agent on the screen, the terminal and
  background sessions, the sub-agents, and an agent that the user read
  before the pause. Thus the user knows when an agent waits for a reply,
  and the news never comes while the user or Grok speaks.
- A long silence with no news is a time to tidy up. When nobody spoke
  for 30 seconds (`CLOSE_QUIET_MS` in `src/App.tsx`), the app tells Grok
  about the done and failed agents that finished 10 minutes ago or more
  (`CLOSE_AFTER_MS`) and that the user read (`offerClose`). Grok asks one
  time, for example "Agents 3 and 5 finished a while ago. Do you want me
  to close them?" It closes them only after a yes. Each agent comes up
  one time in a call. The offer leaves out an agent with a blue or purple
  dot, the terminal and background sessions, and the sub-agents.
- An open conversation is the focus of Grok. Grok answers only about
  that agent until the user goes back or names another agent. When the
  agent ends its turn during a call (running to waiting, done or
  failed), the app gives Grok the last prompt of the user and the last
  answer of the agent (`tell` in `src/voice.ts`). Grok then says in one
  or two sentences what the user asked and what the agent answered. This
  is the one exception to the rule that Grok does not announce results.
  The agent does the work, and Yonder sums it up.
- The prompt lists the projects, the counts of all the agents by status, the
  names of the agents with news, and the twelve newest agents, with the task,
  activity, the end of the last message, and the context use of each. During
  a call, the app sends a new `session.update` when this list changes (at
  most every 3 seconds), so Grok answers without a tool call. This is also
  the memory between calls.
- The prompt gives the version of the app, the build ID on the screen
  ("2.B.N", see Versions), so that Grok can say it.
- `install-app` gives the same number to the Mac app as "2.B.N", so
  Finder shows the same version as the screen.
- The prompt also tells Grok what is on the screen: the open tab, the
  selected project, and all the agents of that project in the order of the
  screen. "This project" and "these agents" mean that project. A change of
  tab or project goes to Grok at once.
- On the Agents, Completed and Closed tabs, Grok gives news only about the
  project on the screen: "All agents" counts only its agents. On the
  Projects tab, the news covers all the projects. On these tabs the
  prompt also leaves out the agents of other projects, because else Grok
  still tells about them. On
  these tabs, the app also gives Grok only the agents of that project from
  `list_workers`. When the user names another project, Grok calls
  `show_project` for it.
- "Open it in Ghostty" or "open it in the terminal": Grok calls
  `open_in_terminal`, and only when the user names Ghostty or the
  terminal. "Open agent 19" or "open it" alone does the same as "show
  me 19": Grok calls `show_agent`, and the screen opens the
  conversation. "Open" alone never opens Ghostty and never makes an
  agent run. "Run it again" or "continue it" for a done, failed or
  closed agent makes it run again: Grok calls `message_worker` with a
  short message, such as "Continue."
- Grok can change the screen: the `show_project` tool, which the app
  answers itself, selects a project and opens its agents ("switch to
  Yonder").
- "Open the folder of that recording": Grok calls `open_folder` with a
  path or a project name, and the bridge opens the folder in Finder. For
  a file, Finder opens its folder with the file selected.
- A full path in an answer of an agent is a link on the Mac
  (`src/paths.ts`). A click calls `open_folder`, so a folder opens in
  Finder, and a file shows selected in its folder. A path starts with
  `~/`, or with a slash, a name and a second slash, so that a slash
  command such as `/help` stays text. On the phone a path stays text,
  because Finder opens on the Mac.
- A path outside backticks ends at a space, in the link and in
  `findMedia`. So the prompt of each agent (`SPOKEN`) tells it to put a
  path that has a space in backticks. Else an agent that writes
  `~/Movies/Nova Clips/dial.mp4` with no backticks gives the link
  `~/Movies/Nova`, a click says "There is nothing at …", and the video
  does not show (Sentry YONDER-10). `open_folder` also opens a cut path:
  when the path does not
  exist, and one name in its folder starts with its last word and a
  space, it opens that name (`uncut` in `bridge/media.ts`).
- "Read the note": Grok calls `read_file` with the path of the file,
  and reads the text aloud. The bridge gives the last 8000 characters of
  a long file. Grok calls `open_folder` only when the user names Finder
  or a folder. Else "read the entire note" opens the note in Finder.
- "Copy that command": Grok calls `copy_to_clipboard` with the exact
  text, and the bridge puts it on the clipboard of the Mac with
  `pbcopy`. Universal Clipboard also gives it to the iPhone.
- "Show me 19": the `show_agent` tool, which the app answers itself,
  selects the project and the tab of agent 19 and opens its
  conversation. The prompt and `get_screen` tell Grok which conversation
  is open, so "this one" or "open it" means that agent.
- "Show the completed tab": the `show_tab` tool, which the app answers
  itself, opens one tab (projects, agents, completed, closed, preview or calls)
  and keeps the selected project.
  It also closes an open conversation, so "open agents" shows the list
  of agents, also when the screen is already on the Agents tab.
  "Show agents", "show running" or "show open" opens the Agents tab,
  "show completed", "show done" or "show review" the Done
  tab, "show closed" the Closed tab, and
  "show projects" the Projects tab, and "show the tunnel tab", "show the
  sites" or "show previews" the Tunnel tab (the value `preview`). "Show" a group opens its tab and does
  not start the walkthrough of its agents.
  After `show_tab`, Grok says nothing, because the screen shows the tab.
  `show_project` still gets a few words.

#### Volume of the voice

The echo cancellation of a call puts the audio on the call volume of the
system, so the volume keys can fail to change the voice of a call:

- On the iPhone (`play-and-record`, Speaker), the slider of Control
  Center changes the media volume, not the call volume. Only the side
  buttons change the call volume, and not to zero (WebKit bug 213390).
- On the Mac, a call on a headset with the microphone of the headset
  puts the headset in hands-free mode (8 or 24 kHz), and the headset can
  take the volume keys.

Yonder has no volume of its own: no slider, no `GainNode` and no
limiter. The voice goes at 100% to the output of the call, on the Mac
and on the iPhone. The volume keys of the Mac and the side buttons of the
iPhone control the voice, as in other apps. A gain of the app above 100%
clips, and a linear slider does not sound like even steps. The end of a
dictation sets the audio session of iOS back to `auto`, unless a call
opened the microphone (`micInCall`). Else, after the talk view, the side
buttons change the call volume with no call.

On the iPhone the side buttons can still fail to lower the voice of a
call, and seem to push it up. The cause is not CallKit: the iPhone app
has no CallKit call (only the watch has one). The cause is the echo
cancellation of WebKit. With `echoCancellation: true`, WebKit records
with the voice processing unit of iOS (VPIO), and without it with the
plain unit (RemoteIO). The voice processing puts the voice on the call
volume, and its gain control works against the side buttons.

So a call on the iPhone first asks iOS for its own echo cancellation
(`setPrefersEchoCancelledInput`, iOS 18.2 and later, on certain 2024 or
later iPhones). This needs a new build of the phone app (the
`echo_input` command of `ios/src/lib.rs`, in `Island.swift`). Then the
call opens the microphone without the echo cancellation of WebKit
(`phoneMic` in `src/voice.ts`), and the voice stays out of the voice
processing. iOS tells only after the microphone opens if its echo
cancellation is on, and `call.log` gets an "echo:" line.

An older iPhone, such as an iPhone 14 Pro, has no echo cancellation of
iOS: its first call after a new build logs "echo: ... off". On such
iPhones the microphone is closed while the voice talks.

- A call on the iPhone never uses the echo cancellation of WebKit
  (`echoCancellation: !phone` in `getMic` of `src/voice.ts`). So the
  voice is on the volume of play-and-record, and the side buttons work
  as for media. The Mac keeps the echo cancellation.
- When iOS cancels the echo (`iosEcho`), the microphone stays open, and
  the user can interrupt the voice by voice.
- Else the microphone sends silence while the voice plays and for
  300 ms after (`gated`). The gate works only when the sound plays on
  the built-in speaker or the receiver. With headphones no echo comes
  back, so the user can still interrupt by voice. A change of the route
  during a call gives a "route:" line in `call.log`.
- No tap stops the voice. On the speaker, the user waits for the end of
  the answer, or ends the call.
- Without the voice processing, the microphone has no gain control. The
  speech then reaches a peak of only 0.02 to 0.07 in `call.log`, where
  calls with the voice processing give 0.6 to 0.9, and Grok hears
  nothing. A Claude call still works, because the speech model of Apple
  hears quiet speech. So the call multiplies the microphone of an iPhone
  by 8 (`input` in `startCall`), except when iOS cancels the echo.
- `call.log` measures the voice of the user to tune that gain. Each
  `mic:` line every 5 seconds gives the loudest RMS of a frame of 100 ms
  after the gain, the same value before the gain (`raw`), the level of
  the bars, and the part of the samples that clip. The worklet measures
  before the clip, and leaves out the frames while Yonder speaks. At the
  end of the call, the `mic loudness` line gives the median and p90 of
  the speech, the room, the clip, and the gain that puts the median of
  the speech at an RMS of 0.1.
- After the gain of 8, the speech of the iPhone can still be at an RMS
  of only 0.02 to 0.03, and the bars expect 0.05 to 0.3 (`size` in
  `src/Levels.tsx`). Then the bars hardly move, and the user says the
  words again about 2.4 s after each `speech_stopped`. Each new word
  cancels the answer that Grok prepared, before its audio comes. A test
  socket from the Mac with the same prompt size and tools gets the voice
  1.4 s after `speech_stopped`; a phone call needs about 3 s.
- So the bars of an iPhone call get 8 times the level of the
  microphone (`lift` in `startCall`). Grok hears the same audio. The
  `mic:` lines also give `queued`, the bytes that wait to go
  out on the socket, so that a slow upload of the phone shows.
- With typical speech at 0.02 at the bars, a lift of 4 fills less than
  half of the bars, and a lift of 8 fills about two thirds.

#### ElevenLabs

ElevenLabs is another voice model, next to Grok. Choose it in the Model
row of the Voice settings.

- ElevenLabs keeps the settings and the tools of a voice agent on its
  side, so `bridge/eleven.ts` makes one agent "Yonder" and one client
  tool for each tool of the call. The ids stay in
  `~/.config/yonder/elevenlabs.json`. The key is `ELEVENLABS_API_KEY` in
  `~/.config/yonder/.env`.
- At the start of each call, the app sends its tools and the rate of its
  audio (44.1 or 48 kHz) with `POST /token` to the bridge. The bridge
  changes a tool or the agent only when something changed, and gives a
  signed URL of the socket. The first call makes about 30 tools (about
  4 s); after that the URL takes about 0.1 s. An older bridge ignores
  the POST and gives a Grok token, so the app asks the
  user to restart the bridge, as for an OpenAI call. Else the app gives
  the Grok token to `new WebSocket` and shows its error. The bridge never changes the
  voice or the LLM, so the user can change them in the ElevenLabs
  dashboard. The defaults are the voice Lucy at the speed 0.92,
  `eleven_v4_turbo`, `gemini-3.8-flash` with the reasoning effort "low", the turn
  eagerness "patient", no "are you there?" in a silence, and calls of up
  to 2 hours. Lucy ("Fresh & Casual", `lcMyyd2HUfFzxdCaC4Ta`) is a V4
  voice of the voice library: calm, playful and realistic. A change of
  the voice of the live agent is a PATCH, because the bridge never
  changes the voice.
  `GET /v1/models` and `GET /v1/convai/llm/list` give the models.
  `gemini-2.5-flash` is deprecated (replaced by `gemini-3.5-flash`).
  With `bun bridge/eleven-check.ts`, the agent answers about 1.1 s after
  a tool result. The OpenAI call already uses `gpt-realtime-2.1`.
- The app sends the prompt of the call in
  `conversation_initiation_client_data`: the agent allows only this
  override. ElevenLabs cannot replace the prompt during a call, so a
  change of the agents or the screen goes as a `contextual_update` with
  only the lines that changed. News of the app goes as a `user_message`.
- `onEleven` in `src/voice.ts` handles the events. The audio is PCM in
  base64 JSON. An `interruption` stops the playback, and the audio of
  earlier turns is dropped, as in the SDK of ElevenLabs. The tool calls go
  through the same `runTool` as with Grok, with the same checks.
- ElevenLabs always speaks again after a tool result, also when the
  result says "say nothing" or the tool does not wait ("Agent started.
  Agent seven started."). So the app drops
  that second answer when the agent already spoke in the turn and no
  result has news, as `response.done` does for Grok.
- ElevenLabs gives no event when the user starts to talk, and no end of
  a response. So a loud frame of the microphone holds back the news of
  the app, and after `end_call` the call ends after 2 s with no sound.
- ElevenLabs takes only a part of JSON Schema: no `pattern`, and each
  value needs a description. The bridge gives a value its name as the
  description when it has none. Else ElevenLabs refuses the tool.
- The calls go on the ElevenLabs key of the Mac, never on the Yonder
  account. The cost estimate is $0.10 a minute. Web search and X search
  are tools of xAI, so the ElevenLabs agent does not have them.
- `bun bridge/eleven-check.ts` speaks a request into a real conversation
  and prints the events.

#### Claude

In this call Claude is the brain, next to the Grok call, so that the user
can compare the two. Choose Claude in the Model row of the Voice
settings. The research is in `docs/brain.md` (design B). The call is a
pipeline with no voice model: speech to text, the brain, and text to
speech.

- The call has no socket and no token. The app opens the microphone with
  the echo cancellation of the call, as for Grok, and plays the speech on
  the AudioContext of the call (`src/brain.ts`, `brainCall`).
- Speech to text: the speech model of Apple on the Mac, through
  `/dictate` and `yonder-dictate`, as in the dictation. It is free, and no
  sound leaves the Mac. A frame of 100 ms is speech when its loudest
  sample is over 6 % of full scale, or 15 % while the speech of Yonder
  plays. The first loud frame starts a turn of the user, with the 300 ms
  of sound before it, and 1.2 s of quiet frames ends the turn
  (`SILENCE_MS`, as for Grok). The sound of the turn goes to the speech
  model in parts each 150 ms. The last text goes to the brain.
- The first words of a turn stop the speech of Yonder at once and drop
  the texts that wait. A sound with no words, such as a cough or the echo
  of the speech, does not stop it. The texts of the brain also wait while
  a turn of the user has words.
- The brain is one lean `claude -p` session in the bridge for each call
  (`bridge/brain.ts`): Sonnet 5.5 on low effort, the tools of the bridge
  over MCP, Read, Grep, Glob and background agents, and a short prompt
  (`BRAIN_PROMPT`). It runs on the Claude subscription, in the folder of
  the summaries, so it is not in the list of agents. The app starts it when
  the call starts, and a first turn puts the prompt and the tools in the
  cache. `POST /brain` sends to it, and `GET /brain` gives its texts, its
  tool calls and the end of each turn, in a long poll of 8 s at most.
- The words of the user go to the brain with the screen of the app, when
  the screen changed. New words stop the turn that runs (the interrupt of
  Claude Code), and the texts of the old turn do not play. The interrupt
  also drops the messages that wait in the queue of Claude Code, but a
  message that comes after it runs. So new words also stop a turn with
  news of the app, and that news is lost.
- Text to speech: ElevenLabs, with the `ELEVENLABS_API_KEY` of the Mac
  and the voice of the ElevenLabs call (Lucy, `eleven_v4_turbo`, speed
  0.92). `POST /speak` gives each text of the brain as PCM16 at 24 kHz.
  PCM at 44.1 kHz needs the Pro plan of ElevenLabs. The speech of each
  text loads when the text comes, and the texts play one after the other
  with no gap. A failed speech ends the call with its error.
  `POST /speak` with `voice` (a Grok voice, such as `liora`) speaks the
  text with the text to speech of xAI (`POST https://api.x.ai/v1/tts`
  with `text`, `voice_id` and `language`) and the `XAI_API_KEY` of the
  Mac, as MP3. The first sound comes after about 0.5 s. The listen
  button of a conversation uses it.
- The brain has `end_call`, `show_tab`, `show_agent` and `show_project`:
  the bridge gives them only to the MCP connection of the brain
  (`/mcp?brain=<call>`). A tool of the screen gives an `app` event in
  `GET /brain`, and the app does it as it does for Grok. The brain gets
  "Done." at once, so an error of the app, such as "No project matches",
  does not reach it. The brain has no other tools of the app. When it
  calls `end_call`, `GET /brain` gives an `end` event, and the app ends
  the call when the turn is over and its last text played.
- News of the app (`tell`) goes to the brain, and the brain answers
  "(quiet)" when the user needs no words. The prompt of Grok and its
  updates (`update`) are not used.
- The call shows no cost: ElevenLabs takes the characters from the
  credits of its plan, and the brain uses the limits of the Claude plan.
- `bun bridge/claude-call-check.ts` checks the pipeline. It starts a
  second bridge from the source on a free port, with its own folder
  `~/.config/yonder-<port>` and the `.env` of the live bridge, and runs
  `brainCall` in Bun with two questions from `say`. The second question
  comes when the first answer starts to play. The last text of the user
  comes 1.1 s after the end of the speech (the 1.2 s of silence), the
  first note of the brain ("Checking the agents.") 1.4 s later, and its
  speech 0.45 s after that: 3.0 s in all. The first words of the second
  question stop the speech 1.1 s after its start, and the brain then
  calls `show_tab` with `completed` (the Done tab). It costs two short
  turns of Sonnet and a few hundred characters of ElevenLabs.
- An older bridge has no `/brain` or `/speak`, so the app asks the user
  to restart the bridge.
- The phone reaches `/brain`, `/dictate` and `/speak` through the relay,
  which lets a phone use only the paths in `PATHS` of `bridge/relay.ts`.
  Else the phone gets 403, and the call says that the bridge is too old.

### Bridge

- The bridge is the only process that starts workers. Yonder's own voice
  agent is one MCP client of it. Any other agent can connect the same way.
- The tools: `list_projects`, `add_project`, `create_project`, `remove_project`, `star_project` (also the order), `start_worker`,
  `message_worker`, `stop_worker`, `unqueue`, `list_workers` (with `query`, it searches the agents), `review_workers`, `get_worker`, `rename_worker`, `move_worker`, `star_worker`,
  `close_worker` (with `done`, it marks as completed), `remove_worker`, `open_in_terminal` (opens a worker in
  Ghostty with `claude attach`), `open_folder`, `read_file`, `copy_to_clipboard`, `open_link` (a web link in the default browser of the Mac), `preview` (see Yonder Preview; an agent cannot open a site with it), `connect_claude` (see Yonder in the Claude app), `browser`,
  `project_overview`, `rebuild_app`, `restart_bridge`, `about_yonder`, `schedule` (see Schedules), `remind` (see Reminders), `notify` (see Notify), `use_secret` and `list_secrets` for the agents only (see Secrets from 1Password), `show_app`, `build_app`, `change_app` and `remove_app` (see Apps), `ask_user`, `set_theme`, `customize`, `get_location`, `phone`, `get_usage`, `other_computer` and `cli`.
- Some old tools merge into other tools, so that fewer tools overlap.
  `show_on_device` is `preview` with `open` and a local `url`.
  `complete_worker` is `close_worker` with `done`. `cli_status` and
  `cli_login` are `cli` with `status` and `login`. `order_projects` is
  `star_project` with `order`. The `phone` tool lost `location` (call
  `get_location`), and `confirm` and `sheet` (call `ask_user`). A call
  with an old name still works with its arguments: `RENAMED` and
  `renamed` in `bridge/main.ts` change it before the server gets it, and
  log each old name one time. `other_computer` takes any name, so it
  can still send `cli_status` and `cli_login` to a peer with an older
  bridge, which knows only them.
- The hidden tools (`HIDDEN` in `bridge/main.ts`): a list of
  the tools does not show them, and a call still reaches them.
  `list_folders` is for the folder picker of the phone, so no voice agent
  and no agent sees it. `rebuild_app` and `restart_bridge` show only on
  the copy with the source: a user of a download does not change the
  bridge, and the Update button of the app still calls `rebuild_app`.
  `browser` stays for each user. `create_project` names the default
  folder of the computer (`~/Sites` on the Mac), and `customize` names no
  file of the source.
- `ask_user` works for each client. An agent asks on
  its row. A voice agent (Grok, the Claude call, the Claude
  app) has no row, so it asks with the native sheet of the phone, and
  the phone gives the answer. The guard of the voice against a close
  that the user did not ask for (`GROUPS` in `src/voice.ts`) checks
  `close_worker`, so it also guards a close with `done`.
- The bridge gives each worker the MCP server `yonder` with
  `--mcp-config` when it starts the worker, so the workers have the tools
  on a new Mac too, with no change to the settings of Claude Code. The
  Yonder plugins row of Claude Code in the Agents section of the Settings
  (off until the user turns it on) runs
  `claude mcp add --scope user --transport http yonder
  http://127.0.0.1:7787/mcp`, or `claude mcp remove`, for each other
  session, such as one in a terminal. Yonder does not add it by itself,
  because it changes the settings of the user and gives each session
  tools that start and remove agents. The bridge is then the MCP server `yonder` of each Claude
  Code session on this Mac. So each agent, a worker or a session in a
  terminal, can call the tools of Yonder. The workers get all the tools, also `start_worker`,
  `remove_worker` and `rebuild_app`. `MAX_RUNNING` stops a loop of new
  workers, and the prompt of the workers forbids a rebuild that the user
  did not ask for.
- `--mcp-config` takes all the values up to the next flag, so the bridge
  puts it first in the options of a worker, never last. Else it takes
  the prompt as a second config file, and each new worker fails at once
  with "MCP config file not found". A worker whose session fails at the
  start shows as failed, on the Completed tab, not as closed. Else the
  user sees a new agent close by itself.
- Yonder has no tool that opens a pop-up card on the phone or the Mac.
  The chat already shows the artifacts and the results of the agents.
- An agent, or another program on this Mac, does not open a site or its
  tunnel. `preview` with `open` and a `url` gives `opens: false` and
  tells the agent to name the URL in its final message, and the user
  opens it from the chat. The Claude call still opens a local site on
  the device of the last message that the user sent from Yonder. The
  phone opens the site as a tap on a localhost link of a chat: in the
  browser of Yonder, through the tunnel. When the tunnel of the site is
  closed, or the Tunnel is off, the phone first asks the user the same
  yes or no question as for a tap. The Mac opens the site in its
  browser. Else a site, an app or a tunnel opens by itself while the
  user does something else in Yonder.
- Each device has an id: `mac` for the window of the Mac app, and for a
  phone the last 16 characters of its public key, as `linkCar` makes it.
  The relay sets the header `x-yonder-device` on each request of a phone,
  after it drops the headers that the phone sent, so a phone cannot act
  as another device. A request with an Origin and no such header comes
  from the window of the Mac.
- The bridge keeps each site in memory. The app asks `/show` each second
  on the Mac, and each 3 seconds on the phone. `after` gives the newest
  site that the app has, so the bridge drops the sites up to it. A site
  that no device takes in a minute goes, so that a phone that opens
  Yonder much later does not open an old site. Grok does not get the
  tool (`src/voice.ts`): it opens a site with `preview`. `bun run
  check-bridge` checks the tool and `/show`, and `bun run check-relay`
  checks that the bridge gets the id of the phone.
- `move_worker` moves an agent to another project. The agent keeps its
  conversation, its CLI and its profile, and it works in the new folder
  from its next message. Each CLI resumes the session by its ID. Claude
  Code keeps the transcript in the folder of the old project in
  `~/.claude/projects`, and the bridge finds it there. A running agent
  ends its current turn in the old folder. A sub-agent moves with its
  agent. A terminal session and a background session that Yonder did not
  start cannot move, because Yonder does not own that process. Only the
  agents that Yonder started can move.
- On the screen, Move to in the menu of an agent row (a long press on
  the phone, a right-click on the Mac) opens a picker (`MovePicker` in
  `src/App.tsx`): the card of an approval from the bottom edge, on the
  phone and on the Mac, as the icon picker of an app (`Picker` in
  `src/Canvas.tsx`). Yonder shows no modal dialog in the middle, also
  on the Mac. It has a search and the projects in the order of
  the Projects view, without the project of the agent. The names that
  start with the search come first, and Enter picks the first project.
  A pick moves the agent with `move_worker`. A submenu of more than 200
  projects is too long, so the picker has a search. On the Mac, a drag
  of an agent row onto a project of
  All projects (its title or one of its rows) moves the agent there too.
  The row moves at once. An agent of any CLI has Move to and the drag.
  A session that Yonder did not start and a sub-agent have neither.
- An agent also moves by itself when it worked in another project. When
  a turn of a Claude Code agent ends as done, the bridge reads the tool
  calls of that turn (`workedIn` in `bridge/main.ts`): the paths of the
  reads and edits, and the paths in the Bash commands. Each tool call
  counts once for each project. The agent moves to another project when
  it worked there in 3 calls or more, and in more than twice as many
  calls as in its own project. The text of a write or an edit does not
  count. Only absolute paths count, so a plain `cd ../x` is not seen.
  This fixes an agent that the + button started in the wrong project.
- `list_workers` with `query` searches the name, the task, the project,
  the summary and the result of each agent, in all the projects. Each word
  of the query counts once, and twice in the name, so the words can come
  in any order. Small words such as "the" do not count. It gives the 8
  best matches, newest first for the same score, each with only its
  number, status, task and summary, so that the answer stays small.
- `list_workers` with no `query` gives `counts`, the number of agents on
  each tab (agents, completed, saved, closed), and `list`, one short line
  for each agent: number, name, project, status, minutes ago and one
  line of its summary. The list is in the order of the screen, tab after
  tab, and has at most `limit` agents (20). `more` gives the number that
  it leaves out. `tab` keeps one tab, and `project` keeps one project,
  with the same rules as the app (`tabOf`, and the longest project path
  that holds the folder of the agent). `full` set to true gives the
  whole record of each agent. The app and `elsewhere` ask for it, and a
  bridge of an older version gives it with no arguments too. Else the
  whole list of 274 agents is 485 KB, about 113K tokens, and a voice
  call refuses it. Grok
  of the app gives the project on the screen as `project`.
- In the `full` list, a closed agent has only the first 200 characters
  of its task and its summary, and the last 200 of its result. The phone
  polls the list every 3 seconds through the relay, and the relay cannot
  compress the encrypted answer. Else a list of 322 agents (316 closed)
  is 876 KB, and on a slow link the phone stays on "Reconnecting…" and
  the pictures of the chat do not load.
- `review_workers` sums up all the agents of one tab (`tab`, and the
  `project` that the app adds as for a group) and says which ones the
  user can close. It gives one line for each agent, in the order of the
  screen: "Agent 4: Added a rule to name each action. Close: changes
  saved." Sonnet 5.5 on high effort writes the lines, with the same
  hidden `claude -p` as the summaries (`ask()`), but with thinking on.
  It takes about 18 seconds for 24 agents. Haiku is faster (3 seconds
  for 4 agents), but Sonnet sees more: on 24 agents, it saw that another
  agent already built the CarPlay support, and that the Google Play step
  of the subscriptions was still open. Its input is the number, the status, the task and the summary
  of each agent, and the 20 newest other agents of the same projects, so
  that it finds the work that another agent did again. Close means that
  the agent needs nothing more from the user. Notes such as "test it" or
  "ready to push" end each Yonder task, so they do not keep an agent.
  Keep means that the agent runs, asks a question, waits for a decision,
  or failed with no fix. The input has no attention flag of Clef: with
  it, Haiku said Keep for "test it" in one of two runs. An old closed
  agent has no number, so its line gives its name, never its worker id.
  The bridge keeps each line with "Close:" or "Keep:", because the model
  sometimes leaves out the word "Agent" before a name. The car has no
  tabs, so the car does not get the tool.
- `get_worker` gives only the gist of an agent: the last 6 lines of its
  last message, and its last 4 steps. Else Grok reads a whole result
  aloud.
- `get_worker` with `full` gives the whole last message (6000 characters
  at most), the last 8 prompts and answers of the conversation with no
  tool calls, and the last 6 steps. When the user asks a question about
  the work of one agent ("what happens if ...?", "why did it ...?"),
  Grok calls it first and answers from it. Grok sends the question to
  the agent only when that result does not answer it. Else Grok sees
  only the end of the last message, and sends the agent a question that
  its answer already covers.
- Each agent has a summary: the gist of its whole conversation in 3 to 5
  short points, 20 words or less each, in very easy English: short,
  common words, and no code, file paths, commands or jargon. The points
  give the substance: the actual names, numbers, causes or findings,
  never only the kind of work. The first point gives the main result,
  and the last point gives the verdict: done, or what the user must do
  now. When the agent asks the user a question, for example while it
  waits, the last point is that question with its options. A point such
  as "Agent suggested six naming styles" is not enough: the point gives
  the names. The key of each summary starts with "l". A new prefix makes
  the bridge write the older summaries again.
  A second run of Haiku, at the same time, writes the spoken brief
  (`spoken`, `BRIEF` in `bridge/main.ts`): 2 to 5 short sentences about
  only the last answer of the agent, with its names, numbers and
  question, and the agent as "it". It gets only the task, the last
  message of the user and the whole answer to it. `/summary` gives it
  with the summary, for Listen in the three dots of a conversation (see the
  Phone), so the brief is ready before the tap. The brief has its own
  run, because the run of the summary reads the whole conversation:
  after a short second answer, it tells the first report again, also
  with the last answer marked at the end.
  The bridge sends the transcript (the prompts, the answers, and one
  short line for each tool call, 40000 characters at most) to a hidden
  `claude -p` on Haiku, with no tools, no MCP servers, no settings and
  no session file. It takes about 3 seconds, and it runs on the Claude
  subscription, so it costs no money. Thinking must be off
  (`MAX_THINKING_TOKENS=0`): with low effort, Haiku still thought for
  30 seconds. `--bare` cannot work, because it reads only an API key.
  The run shows in `claude agents` as an interactive session, so it
  runs in `~/.config/yonder/summarizer`, and the bridge skips sessions
  in that folder. A test bridge on another port runs its summaries in
  `~/.config/yonder-<port>/summarizer`, and the bridge skips those
  folders too. Else they show as agents named "summarizer-79". Clef
  stays on Workers AI. The bridge writes
  the summary only when an agent gives a new answer, so it is ready
  before the user opens the agent. `state.summaries` keeps each summary
  by session ID, with a hash of the last answer (`key`). A new status, a
  read result or a star does not write it again.
  Every 2 seconds the bridge also writes the missing summaries of the
  done, failed and waiting agents: the workers, the other sessions, and
  the agents that finished before the bridge started. It writes 3 at a
  time, newest first, and tries a failure again after 5 minutes. So the
  summary is ready when the user opens an agent, also an agent that
  Yonder did not start.
  `/summary?worker=<number or id>` gives it to the app, and writes it
  first when it is still missing. After a failure it tries again after
  1 minute, and it never answers with an error. While the summary is
  missing, the app asks again every 10 seconds. Else one failure (such
  as the weekly limit of Claude, or a login that two processes refresh)
  leaves "Summing up…" until the user opens the agent again. The app keeps each summary that it
  got, and shows it at once when the user opens the agent again. A
  running agent keeps its last summary. `get_worker` gives it to Grok
  too. The bridge writes a summary of the old paragraph form again.
- The Context tab shows the messages of the user as bubbles (see the
  Mac app). The sent and the queued messages show in one list, in
  the order that the user sent them, with their pictures. `/media` of
  the bridge serves each picture in `~/.config/yonder/images`, because a
  queued message is not in the conversation yet.
- The Settings have a Summaries row (On or Off), in the General section, after
  the Tunnel row. On is the default. The bridge keeps it in `state.json`
  (`sumUp`), and `GET` or `POST /summaries` with `{ on }` reads or sets
  it. The phone can reach it through the relay. Off stops each new
  summary: `summary()` gives only the summary that the bridge already
  has, and `preload()` does nothing. The summaries that the bridge
  already has stay. Grok then reads the end of the last answer in place
  of a summary. The app shows no Summary tab (see the Mac app).
- `/conversation?worker=<number or id>` gives the conversation of one
  agent to the app. The bridge reads the Claude Code transcript in
  `~/.claude/projects`, because it keeps all the resumed turns of a
  session. This works for workers and for the other sessions. It gives
  the last 300 entries at most, from the last 4 MB. `&count=` asks for
  more entries, and the bridge then reads 4 MB more for each 300. The
  relay sends one answer in one frame of 1 MiB, so the bridge removes
  the oldest entries until the answer is 900 KB or less. Each entry also
  gives the pictures, videos and sounds that it names (see the Mac app).
- The Context tab loads 300 more entries when the user scrolls near its
  top, until a load gives no more, and the entries that the user sees
  stay in place. When the load fails, or the Mac gives no answer in 20
  seconds, the tab shows the reason in the place of the chat, sends it
  to Sentry, and loads again every 3 seconds until it works, also for an
  agent that does not run. Else the Context tab of a big agent (500k
  tokens of context) can stay blank on the phone. The bridge restarts often, and each restart ends
  the requests of the phones. A network miss during a restart waits
  for the next load. The reason shows when that load also fails. A
  drop of the socket of the phone, to the relay or to the Mac on the
  local network, is also such a miss, and so is no answer in 20
  seconds. Else the phone shows "The relay closed the connection." at
  once (Sentry YONDER-11). A POST to `/mcp` that dies in the restart
  goes again after the bridge answers `/front`. Else the Mac shows "Load
  failed" for that call (Sentry YONDER-B). The Update button has its own
  fix.
- The Context tab loads again each 3 seconds while the agent runs. Claude
  Code can say that a turn ended before the transcript has the last
  answer. So for 60 seconds after a new status, the tab also loads again
  until its last entry is an answer. Else a done agent shows its last
  tool call with no answer, as if it still runs.
- Sub-agents: an agent that uses the Agent tool starts sub-agents in its
  own session. Claude Code keeps the transcript of each one in
  `<session id>/subagents/agent-<agent id>.jsonl`, next to the transcript
  of the session, with a `.meta.json` that gives the description and the
  type. `/subagents?worker=` gives them to the app, oldest first, and each
  one gets the number of its agent and a letter: 21A, 21B, 21C. The
  `sessionId` of a sub-agent is the path of its transcript
  (`<session id>/subagents/agent-<agent id>`), so `/conversation`,
  `/summary` and `get_worker` read it as a session. A sub-agent is done
  when its last turn ended. It runs while its agent runs or while its
  transcript changed in the last 2 minutes. Else it is closed.
  `get_worker` of an agent lists its sub-agents for Grok.
- Only the agent can reach its sub-agent, with the SendMessage tool. So
  `message_worker` with "21B" sends agent 21 a message that asks it to
  pass the text on word for word with SendMessage, and to say the
  answer. It goes through the queue as any message. The sub-agent gets
  it as a meta turn ("The coordinator sent a message while you were
  working: ..."), and the chat shows only the text of the user. The
  wording is plain, because Haiku takes a wording such as "[Yonder] The
  user sends ..." for a prompt injection. A copy of a
  session cannot reach the sub-agents of the old session ("No
  transcript found for agent ID"). So after a new model or effort, the
  Agents view of the agent is empty. An agent in a terminal cannot pass
  messages, so the bridge refuses them. The tools that stop, close,
  remove, rename or star an agent refuse a sub-agent, because a stop of
  a sub-agent stops the session of its agent.
- A worker that moves into a git worktree writes its transcript in the
  folder of the worktree, not of the project. When the project folder
  has no transcript, the bridge looks for the session ID in all the
  folders of `~/.claude/projects`. Else such a worker shows "No
  conversation yet" and no result. At start, the bridge reads the
  result again for each done worker with no result.
- `about_yonder` returns `CLAUDE.md`, this wiki, the source version and
  the 20 newest commits. The bridge reads them at each call, so a change
  to these files is live before a rebuild. A copy for another Mac gives only the copy of `README.md`
  in its binary, with no version and no commits.
- `project_overview` gives the gist of a project: its file tree, two
  levels deep, and its README (or `CLAUDE.md` when it has no README),
  8000 characters at most. The tree skips dot folders and the `HEAVY`
  folders, and it shows 25 entries in each folder at most. Grok calls it
  when the user asks what a project is or what is in it.
- "Rebuild Yonder", "reload Yonder", "update Yonder" or "restart the
  app": Grok calls `rebuild_app` and says a short line. These four words
  mean the same for the app: get the latest version. Only "restart the bridge" calls `restart_bridge`.
  When `src-tauri/` did not change after the build of the installed app,
  `rebuild_app` only builds `dist/` again (in less than a second), and
  restarts the bridge when `bridge/` changed. The Mac app and the phone
  then reload the new front end (see "Install the app"). Otherwise the
  bridge runs `bun run install-app` in its own process group, because
  that command quits the app. The app ends the call when Grok stops
  talking, before the build is done, so xAI does not bill the build time.
  The new app starts no call (see
  "At launch"). The build output goes to `~/.config/yonder/rebuild.log`.
  A failed build does not quit the old app. A copy for another Mac has no
  source, so `rebuild_app` says that the app installs a new version by
  itself, and that a click on "Update available" installs it at once.
  A Windows or Linux download has no source too, but there `rebuild_app`
  installs the newest release at once, or returns `upToDate`.
  `other_computer` can call `rebuild_app`, so the phone or an agent of the
  Mac can update another computer.
- A voice update needs no click. `rebuild_app` ends the call when Grok
  stops talking, on the Mac and on the phone, and the new front end then
  loads by itself. When nothing is new, `rebuild_app` builds nothing and
  returns `upToDate` with the version: `dist/` has the newest commit, the
  Mac app needs no rebuild, and the app that asks runs `dist/` (the app
  sends its build in the hidden `build` input). Grok then says "Yonder is
  up to date", and the call stays on. Else the user must tap "Update
  available" on the phone after each "update Yonder".
- `install-app` runs `bun install` before the build. Else a rebuild
  fails when a package is in `package.json` but not in `node_modules`,
  for example after another agent installed it only in its worktree.
- `install-app` stops the bridge on port 7787 before it opens the new app,
  so that the app starts the new bridge. Workers keep running, because
  Claude Code runs them. Else the old bridge stays, and the conversation
  view shows "No conversation yet" after a rebuild.
- `install-app` quits the old app with `pkill -ax yonder`. Without `-a`,
  `pkill` on macOS skips its own ancestors. The app starts the bridge, and
  the bridge starts the rebuild, so the app is an ancestor of `pkill`.
  Else the old app stays open after a rebuild by voice, and `open` only
  shows the old app again.
- A worker that changes the bridge calls `restart_bridge` itself when
  its work is committed, also while other agents run. The system prompt
  of each worker in the Yonder source says so.
- "Restart the bridge" or "rebuild the bridge": Grok calls
  `restart_bridge`. The bridge runs its source from this repository with
  `bun`, so it needs no build. The compiled bridge of a copy for another
  Mac starts again as it is. The bridge first compiles its source with
  `bun build`. If that fails, it returns the error and keeps running.
  Then it starts a new bridge that waits 1 second, and it exits. The new
  bridge is up after about 2 seconds. A bridge that Yonder.app is not
  responsible for only exits while the app runs, and the app starts the
  new bridge after about 15 seconds (see Full Disk Access below). The
  app and the call stay on, and the app needs no reconnect, because the
  MCP server is stateless. After `rebuild_app`, the app and the bridge
  start again 1 second apart. `restart_bridge` also works from the
  phone: the relay connects again after a few seconds, and the call
  stays on.
- Names: Grok names each new worker with two or three words, and up to
  six words for a complex task. The bridge passes the name to
  `claude --name`. The bridge cuts a longer name to six words, so it fits
  on the first line of the agent row. A session that Claude Code named itself ("yonder-92")
  shows its latest `ai-title` from the transcript instead.
- A task about one pull request has the name "PR 359 - Date picker": the
  number of the PR, and its topic in one or two words. `prOf` in
  `src/names.ts` finds the one PR in the task: "PR 359", "pull request
  #359" or a link to the PR. A bare "#359" is not a PR. After the start,
  `prName` in `bridge/main.ts` reads the title of the PR with
  `gh pr view` in the project folder, and Haiku writes the topic. When gh
  cannot read the PR, Haiku writes the topic from the task. For an agent
  of Hermes, Hermes writes the topic (`askFor`). This name
  replaces the name of Grok, because Grok does not know the topic. A
  rename before the name comes stays. The system prompt of each worker
  and the `name` of `start_worker` have the same rule. Else a name such
  as "Check DS PR 359 merge" does not tell what the PR is about.
- Each Claude Code worker knows its number and its name from its system
  prompt. When a word of the name is wrong, or the task changes, the
  worker gives itself a new name with `rename_worker`. Speech to text can
  spell a word of the first request wrong.
- Each agent knows that speech to text can write a word wrong, such as
  "ancient" for "agent" or "effort". It does what the user most likely
  means, and it looks at the tools of Yonder before it says that it
  cannot do a thing. A Claude Code worker changes its own effort, model
  or mode with `message_worker` on its own number. Else an agent says
  that it cannot change its effort.
- Numbers: each agent has a number, so that the user can say "agent 3".
  An agent gets the lowest number that no open agent has, and a closed
  agent gives its number back. When a new agent takes that number, the
  closed agent shows no number. When it runs again, it keeps its number,
  or gets a new one if an open agent has it now. So the numbers stay
  small. The tools take the number as the worker. Workers keep it in
  `state.workers`, and other sessions keep it in `state.numbers`.
- Two agents that start at the same time get different numbers. An
  agent joins `state.workers` only when its session starts, so two
  `start_worker` calls in one answer can take the same free number. The
  bridge checks the number again when the agent joins the list, and the
  second agent takes the next free number.
- IDs: a worker keeps the first 6 characters of its first session ID,
  also after a message moves it to a copy. Another session gets the first
  8 characters, the short ID of Claude Code. Else an agent and its first
  session can have the same ID, and React leaves copies of the row of
  the agent on the Completed tab, under "No completed agents".
- Claude Code gives the status of each agent, and Yonder does not decide
  it. In `claude agents --json --all`, a background session has the
  `state` `working` (status `running`), `blocked` (status `waiting`: it
  needs an answer from the user) or `done`. A terminal session has no
  state, only `busy` (running) or `idle` (done), so it never shows as
  waiting. In the list, the row of a terminal session says "Own
  terminal", and the row of a background session says "Background ·
  not Yonder". A plain label "terminal" looks like a Yonder agent.
  Yonder only closes and removes sessions. The bridge runs no Clef check
  (Cloudflare Workers AI) for the status.
- Claude Code can leave a finished background session `working`, with
  the process `idle`. The bridge then treats it as done when the
  transcript ended the turn 30 seconds ago or more. Else an agent stays
  `working` for minutes after its last answer. A background shell (`run_in_background`) keeps the session `working`
  and `busy` after the turn ends, but a Monitor lets Claude Code list
  it as `done`. The bridge treats both the same: an agent whose turn
  ended goes to the Done tab, and the notice of the shell starts a new
  turn that brings it back to the Tasks tab. Else an agent that waits
  for another worker sits on the Tasks tab for minutes. An agent that closes itself
  and a run of a schedule keep running until the shell ends, because
  their close or retry would stop the shell.
- A running agent gets `monitoring` from the bridge (`monitoringOf`):
  `only` when its turn ended and a background task keeps the session
  busy, and `also` when its turn runs and a background task runs beside
  it. A background task is a command with `run_in_background` or a
  Monitor. Its start is the tool result "Command running in background
  with ID" or "Monitor started (task", and its end is a
  `task-notification` with a `<status>`, or a `TaskStop`. Only the last
  512 KB of the transcript counts. Else an agent that waits in the
  background for hours shows "Yondering…" all that time.
- When the user asks if a running agent is done ("is number five
  done?"), Grok calls `get_worker` before it answers, and never says
  "it's still running" from the screen alone. `get_worker` gives the
  status and `quietMinutes`, the time since the last step. A running
  agent that is quiet for 10 minutes or more may be stuck, and Grok says
  so.
- "How's number 10 doing?" for a running agent: Grok also calls
  `get_worker` first, and says what the agent does now from its activity
  and recent steps, never from its name or task. "Is it?" or "look into
  the context" calls `get_worker` with `full`, and never `message_worker`.
  Else Grok tells old work from the task, and a "Continue." with `now`
  stops the turn of the agent.
- Status `closed`: the user closed the agent (`close_worker`, or the stop
  button on its row). Its session stops, and it moves to the Closed tab.
  A message continues it. If the user continues it in Claude Code, it
  shows as running again. A session that ends outside Yonder before its
  turn is done also shows as closed. Older bridges called this status
  `stopped`, and the bridge changes it to `closed` when it starts.
- Stop (`stop_worker`): the user stops the current turn of a running
  agent, as Escape does in Claude Code. The bridge stops the session,
  and the agent shows as waiting on the Agents tab, with no dots and no
  push. The result says "The user stopped this turn." The `marked` flag
  holds the status until the session works again. Without it, the poll
  shows the stopped session as closed, and the queue starts the next
  turn at once. The queue stays, and the next message sends it first.
  With `send`, the queue goes at once as the next turn, in place of the
  rest of the current turn (the stop button in the app). With `send` and `message`, only the queued message
  that starts with `message` goes now, and the others stay in the
  queue. A tap on a queued bubble in the app does this. It also finds a
  message that waits in the queue of Claude Code (typed into the current turn, `untaken`). The
  other messages there move to the queue of the bridge, so only the
  tapped one goes now. The poll also checks `marked` again after it
  reads the transcript: else a stop in that moment keeps the agent as
  running for good. `bun bridge/check.ts` checks Stop, Send now and
  `unqueue`.
  `send` with an empty queue of the bridge sends the messages that wait
  in the queue of Claude Code. Else Escape with only such a message
  stops the turn and keeps the message back.
  A stop can also come a moment after a resume, before Claude Code
  writes the prompt of the new turn to the transcript. That stop drops
  the prompt. So `halt` checks the transcript for the prompt of a resume
  of the last minute (`resumed`). A prompt that is not there goes back
  to the front of the queue. Else a second Escape, one second after the
  first sent the queue, loses the message of the user.
- `list_workers` also shows the other Claude Code sessions on this Mac, from
  `claude agents --json --all` (only the sessions with a pid). The bridge reads their transcripts in
  `~/.claude/projects` for the last steps and the context use. A message to
  a terminal session starts a copy of that session (see Workers).
  A message to a background session makes it a worker (see Workers).
  The switch Outside sessions in General of the Settings (`outsideSessions`
  in `config.json`) hides these sessions. Off, the lists, Grok and the
  tools show only the agents of Yonder.
- Each agent shows its context use. On the agent row, the context use and
  the time of the turn are 11 px and lighter than the muted text, so the
  row has more white space.
  The time of the turn shows minutes and seconds ("4m 05s", or "1h 05m"
  after an hour), so the user sees it tick. The seconds have two digits,
  so the width stays the same. The context and the time are in one span,
  "182k · 4m 05s", so the dot has the same space on each side.
  The context and the time are on the second line of the row, after the
  model, the effort and "7m ago", with a dot before them. So the name has
  the full width of the row, and a title of five or six words fits on
  one line. The model text gets the ellipsis on a narrow row, never the
  time.
  The window size of each model is in
  `state.windows`. The `-p` workers of older bridges saved it from their
  `result` event.
- Every 2 seconds the bridge reads `claude agents --json --all`. The
  `state` of each worker gives its status: `working` is running, `blocked`
  is waiting, `done` is done. The transcript gives the activity, the
  result and the context use. The user can also open a worker in the agent
  view of Claude Code and continue it there, and Yonder follows it.
- A message to a running worker goes into its current turn, as in Claude
  Code: the agent gets it after its next tool call, and does not wait for
  the end of the turn (`typeIn`). The bridge opens the live background
  session with `claude attach` in a terminal of Bun, types the message,
  presses Enter, and closes the terminal. The session keeps running. The
  transcript then has a `queue-operation` "enqueue" with the message, and
  later a `queued_command` attachment after a tool result. The
  conversation view shows that attachment as a message of the user. The
  bridge types 4 characters at a time: Claude Code takes a larger piece,
  also a bracketed paste of 655 characters, as pasted text, and wraps the
  whole message in `<pasted_content>`, which the agent may not follow. A
  message that starts with / ! ? # & or @, a message with a tab, a message
  to an agent of another CLI, and a message after others that wait in the
  queue of the bridge go into the queue of the bridge. So does a message
  when Claude Code does not write the "enqueue" in 5 seconds. A message
  that went into the turn has no Edit, Delete or Send now, because
  Claude Code holds it. A stop of the session drops the messages that
  Claude Code holds and did not give to the agent yet. So before the
  bridge stops a live session (`halt`, `resume`), it reads them from the
  transcript (`untaken`: each "enqueue" with no "remove" or "dequeue"
  after it, since the prompt of the turn). Stop puts them back at the
  front of the queue of the bridge, and the app shows them as queued.
  A resume sends them before the new message.
- A message that cannot go into the turn goes into the `queue` of that
  worker. When the turn ends, the bridge sends all the queued messages as one turn. A
  closed worker keeps its queue, and the next message sends it too.
  The poll sends the queue (`sendQueued`). When the send fails, the poll
  tries again each 10 seconds, and the bridge log gets the error. Else
  one failed try leaves the agent done with its message in the queue,
  and the user must tap Send now.
- The Settings have a Steer row in General (On or Off). Off is the default. The bridge keeps it in
  `config.json` (`steer`), and `GET` or `POST /steer` with `{ on }`
  reads or sets it, also from the phone through the relay. On: a
  message to a running worker never waits in the queue of the bridge.
  The worker stops its turn at once and continues with the queue and the
  message, as with `now`. The session keeps the work of the stopped
  turn, so the agent continues from it. It works as the steer of T3
  Code. Steer does not try `typeIn`, so the message shows as a normal
  bubble, not a dotted one. `typeIn` often fails ("the prompt box of the
  session did not show"), and a typed message waits for the next step
  of the agent.
- A message that waits in the current turn shows the pictures of the
  user from the screen, not from the bridge. These pictures stay for 30
  minutes.
- With Steer, each message stops the turn that the message before it
  started. Claude Code writes the prompt of a turn a few seconds after
  the start, so `resume` adds the prompt of the last resume when the
  transcript does not have it (`unsaid`), as `halt` does. Else of three
  quick messages, only the first stays.
- A pasted or attached image shows in the prompt box at once, and its
  upload runs behind it. A send waits for the upload. Else an Enter right
  after the paste sends the message without the image.
- A message or a new task can be only its attachments, such as a pasted
  screenshot with no words. The send button then shows with an empty box,
  in a conversation and in the typed New agent view. The bridge then titles
  the agent and picks its model from the paths in the prompt.
  `unqueue` takes one message out of the queue, by the start of its
  text. `message_worker`, `stop_worker` and `unqueue` wait in one line
  for each agent (`inTurn`), and so does the send of the poll, so two of
  them never change the queue at the same time.
- A slash command runs only when it starts the prompt. So a message that
  starts with "/" goes alone as one turn, with no voice-call, image or
  video block: these blocks become the arguments of the command. The
  queue sends the messages before a slash command as one turn, then the
  command alone. This also applies with `now`: the queued messages go
  first, and the command goes in the next turn. The transcript keeps a
  command as `<command-name>` XML,
  and the conversation view shows it as the user typed it. `/commands`
  gives the app the list of commands (see the Mac app).
- `/btw <question>` is a side question, as `/btw` of Claude Code.
  `message_worker` does not send it to
  the agent, and it does not wait in the queue. `sideQuestion` in
  `bridge/main.ts` runs `claude -p --resume <session> --fork-session
  --no-session-persistence --tools ""` with no MCP servers, no hooks
  and a low effort. That copy answers from the conversation so far, also
  while the agent runs, and saves nothing. The agent does not stop and
  never sees the question. The result of the tool has `answer`, so Grok
  can read it aloud. The app shows the question and the answer at the end
  of the chat in a card with a dotted edge, and the × closes it. The card
  stays until the user closes it or asks another side question. The MCP
  client of the app waits 60 seconds, so the copy gets 55 seconds. Only
  a Claude Code agent with a conversation answers it, not a sub-agent. A
  `/btw` with no question gives "Write the question after /btw." Each
  side question reads the whole conversation again with no prompt cache
  (about 4 to 7 seconds for 100k tokens). `bun bridge/btw-e2e.ts` checks
  it with a stand-in `claude`, so it uses no credits.
- The conversation view hides the `<voice-call>` block of a prompt, so
  the user sees only the request. The agent still gets the block as
  context. Each other block that
  the bridge adds goes too: `<images>`, `<pasted-text>`, `<files>`,
  `<screen-recording>` (of an old conversation), `<videos>` and
  `<device>` (`typed`). An attached video or an old screen recording
  shows as a video in the bubble of the user:
  `video.mp4` or `screen.mov` of its folder (`clips`), not as the words
  and the folder of a `<videos>` block.
- The app starts the bridge in the login shell of the user, so that workers
  get the same PATH as a terminal. When the app quits, it stops the bridge
  on port 7787, so no Yonder process stays in the background. The workers
  keep running, because Claude Code runs them.
- If no bridge answers on port 7787 for 15 seconds, the app starts the
  bridge again and writes "started the bridge again" to `app.log`. The 15
  seconds are longer than the start of the login shell and the gap of
  `restart_bridge`. A second bridge finds the port in use and stops, so a
  start too many does no harm. Else a bridge that stops leaves the app
  without a bridge, and without a call, until the user quits it.
- The bridge and the agents get the Full Disk Access of Yonder.app. macOS
  gives the grants of an app, such as Full Disk Access, also to each
  process that the app starts. The app stays the "responsible process" of
  each child and grandchild, also after a parent between them exits, but
  only while the app runs. A process of the watchdog, of a terminal, or of
  an app that quit gets none of the grants of Yonder. An agent from such
  a chain cannot read the `DevToolsActivePort` file of Chrome
  ("Operation not permitted"), so browser-harness cannot connect again
  after Chrome restarts.
  - While Yonder runs, the watchdog only stops a bridge that does not work,
    and the app starts the new bridge (`source_bridge` in
    `bridge/watchdog.sh`).
  - `restart_bridge` gives the new bridge the responsible process of the
    old bridge. A bridge with another responsible process only exits while
    the app runs. The app then starts the new bridge after about 15
    seconds, in place of 2.
  - At its start, a bridge of the app stops the daemon of Claude Code when
    the app is not the responsible process of the daemon, such as after a
    quit of the app or a start from a terminal. It runs
    `claude daemon stop --any --keep-workers`, so the sessions keep
    running, and the next `claude --bg` starts a new daemon under the app.
    It checks only the daemon of `~/.claude`, not the daemons of profiles.
    A session with no daemon for about a minute dies, so the bridge stops
    the daemon only when no session works, and else checks again each
    minute (`freeDaemon`, see the bug of the daemon in Schedules).
  - The daemon gives its responsible process to each session in a spare
    host. By its design, Claude Code moves each other session into
    `~/.local/share/claude/ClaudeCode.app` (`macDisclaimResponsibility`),
    with only the grants of that app. The first session of a new daemon is
    such a session. For those sessions, add that app to Full Disk Access.
    Its path, its bundle ID `com.anthropic.claude-code` and its signature
    requirement (the identifier and the team `Q6L2SF6YDW`) do not change at
    an update. A grant to `~/.local/share/claude/versions/<version>` stops
    at the next update, because each version has a new path.
  - On a Mac, the bridge writes `~/.config/yonder/claude-launcher` and
    sets it as `CLAUDE_CODE_PROCESS_WRAPPER` for each agent. Claude Code
    starts its daemon, spare hosts and workers through it, with the
    binary of one version first. The launcher runs that version from
    `ClaudeCode.app`, so a process with no app as its responsible process
    uses the one privacy entry of `com.anthropic.claude-code`. Else such a
    process runs from its version path, and Files & Folders gets a new
    entry, such as "2.1.316", at each update. The
    newest version replaces the link in the app. An older version runs
    from its own path, so the app never runs a mix of versions. A daemon
    that runs since before the bridge start uses the launcher only after
    its next start. The Chrome native host of Claude Code still runs
    from the version path, because Chrome starts it, not Yonder.
  - An agent that runs keeps the responsible process that it had.
  - `responsibility_get_pid_responsible_for_pid` of libSystem gives the
    responsible process of a pid (`responsible` in `bridge/main.ts`, or
    `python3` with `ctypes`). A process whose app quit gives its own pid.
- The watchdog (`bridge/watchdog.sh`) keeps Yonder working when nobody is
  at the Mac. launchd runs it all the time as
  `com.vladartym.yonder.watchdog`, also after a login. Every 30 seconds it
  checks the app and the bridge, so that the user can work for a day
  with only the phone.
  - It does not keep the Mac awake. The bridge does that while a worker
    runs or a call is live, so the Mac sleeps when nobody uses Yonder.
    A closed lid still puts the Mac to sleep. The phone cannot reach a
    sleeping Mac.
  - When Yonder does not run, it opens the app, at most once in 10
    minutes. So, to quit Yonder for a longer time, stop the watchdog first.
  - When the bridge does not answer for 1 minute, or has no phone relay
    while the relay answers, it starts the bridge again, as the app does.
    While Yonder runs, it only stops the bridge, and the app starts the
    new bridge, so that the agents get the Full Disk Access of the app.
    It stops the old bridge with SIGTERM, and with SIGKILL after 5
    seconds. A bridge in a busy loop never runs its SIGTERM handler. Else
    such a bridge holds port 7787 at 100% CPU, each new bridge stops with
    `EADDRINUSE`, and the phone does not connect.
    A relay that the Mac cannot reach is not a fault of the bridge. A
    bridge that another bridge pushed out of the relay room (code 4000)
    does not connect again by itself.
  - After 3 minutes, it runs the last bridge that worked: a bundle in
    `~/.config/yonder/bridge-fallback`. `restart_bridge` compiles the
    source first, but a bridge that compiles can still stop at its start.
    The app then starts the broken source again every 15 seconds. When a
    file of the bridge changes, the watchdog tries the source again, and
    after 3 more minutes it goes back to the fallback.
  - A bridge that ran for 10 minutes, with no change to its files after
    its start, becomes the new fallback (`bun build`). The first fallback
    does not wait. `--define import.meta.dir` keeps the folder of the
    source, so the fallback serves `dist/`, finds `.git`, and runs
    `rebuild_app` as the source does. `code` in the script lists the files
    of the bridge. Add a file there when the bridge imports a new file
    outside `bridge/`.
  - "Restart the bridge" on the fallback starts the fallback again,
    because `restart_bridge` starts its own file. The watchdog goes back to
    the source at the next change to the bridge.
  - It does nothing while `install-app` runs, because that command quits
    the app and opens the new one. It never rebuilds the app: a failed
    build keeps the old app, and the same source gives the same failure.
  - The log is `~/.config/yonder/watchdog.log`. `zsh bridge/watchdog.sh
    install` starts it, and `uninstall` stops it. Run `install` again after
    a change to the script. `install` uses the script of the main checkout,
    never one of a worktree. `zsh bridge/watchdog.sh check` runs the steps
    on port 7797 with a copy of the bridge. It does not touch the live
    bridge.
- A bridge on another port (`YONDER_PORT`, for a check) uses the folder
  `~/.config/yonder-<port>`, not `~/.config/yonder`. So it has no state,
  `.env`, relay token or preview of the live bridge, and it never joins the
  phone relay. Else a check bridge with the live folder takes the relay
  room ("Another bridge took the room"), the phones lose the Mac, and the
  live bridge stops.
- The bridge listens only on 127.0.0.1. It refuses other web pages (Origin
  check) and DNS rebinding (Host check). A paired phone reaches it only
  through the relay (see Phone). The dev server of the app
  (`http://localhost:1420`) passes the Origin check only on the source
  copy, because any program can serve a page on that port.
- An `<img>` or a link of another web page sends no Origin. So the routes
  with a cost or a change (`/gist`, `/summary`, `/setup`, `/logins`,
  `/sync`, `/show`, `/conversation` and `/token`) refuse a request with no
  Origin when `Sec-Fetch-Site` is `cross-site` or `same-site`.
- The page of the bridge, `http://127.0.0.1:7787`, passes the Origin
  check. So a file that the bridge serves and that the user did not
  write runs no script there: `/media` and `/favicon` send
  `Content-Security-Policy: sandbox`, and a page of the Canvas and the
  `&try` page of a screen send `sandbox allow-scripts`. Else an SVG of a
  conversation, opened as an address, can start an agent through `/mcp`.
- State is in `~/.config/yonder/state.json`. The xAI key is in
  `~/.config/yonder/.env`. The bridge sets the folder to mode 700 at each
  start and writes `state.json` with mode 600, so another OS user cannot
  read the prompts, the summaries, the calls or the pastes.

#### Two OS users on one computer

Two people, such as Bob and Mary, can each run their own Yonder on one
Mac, each in their own macOS user account. Each bridge then gets its own
port and refuses the programs of the other user. For one user, nothing
changes: the bridge keeps port 7787, and each program of that user
passes. This is a safety net. It is not the plan
for more people on one bridge (`docs/multi-user.md`).

- **The port.** The live bridge takes `port` of
  `~/.config/yonder/config.json`, else 7787 (`bridge/peer.ts`).
  - When a program of this user holds that port, or `bridge.pid` of the
    config folder names a bridge that runs, a bridge of this user runs
    already. The new bridge waits up to 5 seconds, because a restart starts
    it while the old bridge still stops. Then it stops before it joins the
    relay. The app, the watchdog and `restart_bridge` need this.
    The port alone is no lock: after an edit of `port`, the app finds no
    bridge on the new port and starts one, and only `bridge.pid` stops it.
  - When a program of another user holds it (`lsof -a -u` finds no
    listener of this user), the bridge takes the next free port. It
    skips 7786 (the phones on the local network) and 7788 (the tunnel of
    Yonder Preview). It saves the new port in `config.json`, so the port
    stays the same at each start.
  - The local network port of the phones is 7786. When another user has
    it, the bridge takes any free port, and the phone gets it through
    `/lan`.
- **Who reads the port.** The Mac app reads `port` of `config.json`
  (`bridge_port_now` in `src-tauri/src/main.rs`): the check that the
  bridge runs, the stop of the bridge, and the address of the notch
  helper (`YONDER_BRIDGE`). The first page of the app (`tauri://`) asks
  for it with the command `bridge_port`, and then loads the page of the
  bridge on that port. The page of the bridge uses its own address. The
  watchdog, `omarchy/yonder` and the workers (`YONDER_BRIDGE`) read it
  too. An app of an older version keeps 7787.
- **The permissions of the app.** `capabilities/default.json` names only
  `http://127.0.0.1:7787/*`. A bridge on another port gets the same
  permissions at run time, for that port only (`bridge_capability`). A
  site of another port of 127.0.0.1, such as a dev site in a frame of the
  window, can never call the commands of the app.
- **The address on the wire.** A phone and another computer always name
  the bridge `http://127.0.0.1:7787` (`LOCAL` in `bridge/relay.ts`,
  `WIRE` in `src/bridge.ts`). The bridge sends each such request to its
  own port (`local` in `bridge/main.ts`). So a phone needs no new pairing
  when the port changes.
- **The relay.** Each live bridge joins the relay, also on a port other
  than 7787. Each user pairs their own phone, in their own relay room.
- **Who can call the bridge.** After the Host and Origin checks, a
  request passes only with one of these:
  - The header `x-yonder-token` with `token` of `config.json`.
  - The cookie `yonder-<port>` with the token. The page of the bridge
    gets it with its first GET (HttpOnly, SameSite=Strict), so its
    images, its event stream and its fetches pass at once.
  - A caller that runs as this OS user. The bridge finds the program at
    the other end of the connection with `lsof -a -u <uid>` on the Mac
    (about 0.1 seconds, one run for all the calls that wait), and with
    `/proc/net/tcp` on Linux. So each program of the user that worked
    before still works with no token: an older app, an agent with
    `curl`, another CLI, the hooks and the checks.
  - Any other call gets 403, with the path of `config.json`, and
    `bridge.log` gets a line "Refused ...". On a computer with one user,
    such a line is a bug. lsof runs with `-b`, so a network volume that
    does not answer cannot block it. A failed lsof refuses the calls of
    that run, but the token, the cookie and the relay still pass.
- **The token.** The bridge makes it at its first start (24 random
  bytes) and keeps it in `config.json` with mode 600. The user or an
  agent can change it, and the new value counts at once. The workers get
  it in their environment (`YONDER_TOKEN`, with `YONDER_BRIDGE`), which
  another user cannot read. Claude Code runs a worker from its daemon,
  with the environment of the daemon, so the two go in the `env` of the
  settings of the session: a file with mode 600
  (`session-settings*.json` in the config folder), not the arguments.
  Claude Code puts the token in the MCP header from there, so it is never
  in the arguments of a process, which another user can read. The relay
  adds it to each request of a phone. A copy or an export of the settings
  must leave out `token` and `port` (`export_config` does).
- **Windows** has no check of the user and never moves the port: a
  second user there gets "the bridge runs already".
- **A check bridge** (`YONDER_PORT` set to a port other than 7787) keeps
  its own folder and never joins the relay. `YONDER_PEER=none` makes each
  caller of a check bridge another user, and `YONDER_FOREIGN_PORTS`
  makes a port count as the port of another user. `bun run check-port`
  checks all of this with no credits.
- **Limits.** A worker that started on another port before a change of
  the port still calls the old port. The dev builds of the screen and
  TestFlight run only on a bridge from source on port 7787. A cookie does
  not know the port, so the page of the bridge sends its cookie to each
  port of 127.0.0.1 that it calls; the page calls only its own bridge. A
  program that runs as root, not as the user, now needs the token. The
  path for two users ran only in the checks (`YONDER_PEER`,
  `YONDER_FOREIGN_PORTS`), not yet with two real accounts.

### Workers

- Each worker is one Claude Code background session (`claude --bg`) in one
  project folder, so it also shows in the agent view of Claude Code
  (`claude agents`) as working, needs input or completed. A `claude -p`
  process shows there only while it runs.
- `claude --bg` ignores `--session-id`. The bridge reads the short ID from
  its output ("backgrounded · 1a2b3c4d") and finds the session ID in
  `claude agents --json --all`. `claude stop`, `claude rm` and `claude
  attach` take the short ID, the first 8 characters of the session ID.
- A new agent or copy joins the list at once, as "Starting", with a
  short ID such as `new1`. Clef picks its effort (and with Auto its model), and Claude Code starts
  its session. Then it gets the first 6 characters of the session ID. If
  the start fails, the bridge removes it. A bridge that stops during a
  start drops the agent when it starts again. The poll does not follow
  an agent without a session ID. So the agent shows when Grok says
  "agent started", not a few seconds later. In a check, the row shows
  after 0.5 seconds, and it gets its session ID after 1.5 seconds.
  Because the agent is in the list during its start, two agents that
  start at once get two numbers. The count of the `new` IDs begins again
  at each bridge restart. So the bridge marks each agent of
  showStarting, and it gives each saved agent with a `new` ID its own ID
  when it starts. Else several agents keep the ID `new1`, and a click on
  one agent opens another.
- The bridge removes `FORCE_COLOR` from the environment of `claude`.
  With `FORCE_COLOR`, the short ID has color codes, and the bridge cannot
  read it. A bridge that starts from a Claude Code terminal can get
  `FORCE_COLOR=3`. Then each new worker starts, but the bridge does not
  save it, so it shows as an outside session, and a message to it starts
  a copy.
- A message to a live session starts a copy of it, and so does an option on
  the resume. So `message_worker` runs `claude stop <short id>`, then
  `claude --bg --resume <session id> "<message>"` with no other options.
  The session keeps the options of its start.
- `claude stop` returns before the daemon of Claude Code lets the session
  go. A resume before that starts a copy. So `resume` waits until
  `~/.claude/daemon/roster.json` drops the short ID, 5 seconds at most.
  The wait takes 0.1 to 0.2 seconds. Else a second message can start a
  copy a few ms before the daemon lets the old session go, and the copy
  cannot reach the sub-agents of the session.
- A message to a background session that Yonder did not start makes it
  a worker, with the same number. The bridge stops the session and
  resumes it under the same session ID, as for a worker. So the message
  goes to the session itself, not to a copy.
  The worker gets a 6-character ID, and the session had the 8-character
  ID of Claude Code. The bridge also finds a worker by the start of its
  session ID, so a screen that still asks with the 8 characters loads
  the chat. Else the phone shows "There is no worker \"7da6a531\""
  (Sentry YONDER-K).
- A message to a terminal session starts a copy of that session
  (`--resume <id> --fork-session`) as a new worker, with the same context.
  The terminal owns the session, so the bridge cannot resume it. A later
  message to the same terminal session goes to the same copy (`forks`).
  The socket of Claude Code for messages between sessions is no option:
  Claude Code puts each such message in a peer frame and never takes it
  as the approval of the user. A copy is a normal worker, so it takes
  the words of the user as typed input.
- Sessions that an agent starts with `claude --bg` itself, not through the
  bridge, are outside sessions. When such a session ends, it has no pid,
  so it leaves the lists of Yonder. The agent view of Claude Code still
  shows it as completed. To keep an agent in Yonder, message it through the bridge.
- The bridge sends one `message_worker` call at a time for each agent.
  Grok sometimes sends one request in two or three calls at once ("There's
  a screenshot attached.", "Continue."). A second call waits, sees the
  agent run, and goes into its queue. Else each call sees the agent as
  not running and resumes the session, and Claude Code starts a copy
  with no turn and no transcript for each extra call.
- A new model, effort or profile on `message_worker` changes a worker, also while
  it runs. The bridge stops the session, then resumes it with all the
  options. Claude Code then starts a copy with the same conversation and
  the new options ("the flags you passed started a copy"), and the worker
  moves to the copy, with the same number. `now: true` stops a running
  turn and sends the message at once, without the queue, so that the user
  can add context or correct an agent while it runs.
- "Mark it as completed": Grok calls `complete_worker`. It stops the
  session if the agent runs or waits, sets the status `done`, and moves
  the agent to the Completed tab. "Close it" still calls `close_worker`
  and moves the agent to the Closed tab. The `marked` flag keeps the
  agent done until its session works again, because Claude Code lists a
  stopped session as closed.
  A bare "completed", "task completed" or "show completed", with no
  agent named, opens the Completed tab (`show_tab`), because the speech
  to text often hears "show" as another word. The app also refuses a
  `close_worker` or `complete_worker` of the agent that Grok started
  less than a minute ago, unless the user said its number. Else a "show
  completed" that comes as "Task completed." stops an agent that Grok
  just started. The correction of the wrong words says "marked as
  completed", not "marked as done", because "done" is the Closed tab.
- The app also refuses each `close_worker`, `complete_worker` and
  `remove_worker` that the last words of the user do not ask for, with
  every voice: Grok, OpenAI and ElevenLabs. The words must have a close
  word ("close", "done", "completed", "remove", "delete", "clean up"),
  or say yes to a question of the voice about it ("Close 14?"). A close
  of a whole tab also needs a group word, such as "all" or "the
  completed ones". When the words of the user are not in yet, the check
  waits up to 3 seconds for them. The voice then asks "Close 3?" and
  waits. The check is `asksClose` and `asksGroup` in `src/names.ts`
  (`bun src/names.ts` tests it), and it runs in `runTool` of
  `src/voice.ts`. A rule in the prompt alone does not stop a voice that
  closes agents with no words from the user, so the important rules are
  in code, and each voice follows them. A Claude call does not go through `runTool`:
  its brain calls the bridge itself (`bridge/brain.ts`).
- "Close it", "done it" and "I'm done with it" are one action: Grok
  calls `close_worker` with no `done`, and the agent moves to the Closed
  tab. This is true on each tab. On the Completed tab, "close this
  agent" moves the completed agent to the Closed tab, and Grok never says
  that it is done already.
- `done` is only for "mark it done", "mark it as completed" or
  "completed". A finished agent goes to the Done tab by itself, so a
  close always goes to the Closed tab. Else a voice sets `done` for a
  plain "close it", and the agent stays on the Done tab. The tool text of `close_worker`,
  the prompts of Grok, the car and the brain say so. `runTool` of
  `src/voice.ts` also drops `done` when the words do not ask for it
  (`asksComplete` in `src/names.ts`). A close word always wins. The
  brain of a Claude call does not go through `runTool`.
- `close_worker` runs `claude stop`. `remove_worker` runs `claude stop`
  and `claude rm`, which also takes the session off the agent view, and
  takes the agent off the lists of Yonder.
- A close of a session that Yonder did not start ends its process: `claude
  stop` for a background session, `SIGTERM` for a terminal session. Then
  the session becomes a worker, with the same number, and moves to the
  Closed tab. The stop goes to the config folder that lists the session,
  as the profile of that folder. When Claude Code cannot stop a session
  that still runs, `close_worker` gives an error. Else a stop that goes
  to `~/.claude` for a session in the folder of a profile stops nothing,
  and the agent stays on the Done tab with no error.
- A restart of the bridge between `claude --bg` and its answer loses the
  new agent: at the start, the bridge drops each agent with no session
  ID. The session then shows as a background session that Yonder did not
  start. So each read of the sessions looks in the roster of the daemon
  (`daemon/roster.json` of the config folder). There the arguments of
  the session have the start ID in the address of its `--mcp-config`.
  When no agent has that start ID, the session becomes that agent again,
  with its start ID. An agent that starts now keeps the start ID as its
  ID, so its session stays outside until `send` saves it.
- "Deploy it and close it": the agent closes itself when its work is
  done, so the voice agent need not come back to close it. Grok sets `closeWhenDone` on that `start_worker` or
  `message_worker`, does not call `close_worker`, and says "Sent to 3.
  It closes itself when done." "Close 3 when it's done" sends
  "." with `closeWhenDone` to the running agent: it gets no new
  message. `false` takes the flag back. A sub-agent cannot close.
  - The bridge decides, not the agent. When the turn ends with no queue,
    `settle` starts `closeItself`. The flag holds through the turns of
    the queue, and a question for Allow or Deny comes in the middle of
    the turn, so the agent closes after the rest of the turn. The flag
    stays on until `closeItself` decides, and `closeLeft` decides at the
    start of the bridge for an agent that still has it. Else a bridge that
    restarts often drops the flag before the wait for the summary. A stop, a close or a complete
    of the user takes the flag off, and so does a new message to an
    agent that does not run.
  - When a task says "then close yourself", the agent sets the flag on
    itself: `message_worker` to its own number with "." and
    `closeWhenDone` (`named` in `bridge/main.ts`). It never writes that
    it closes itself. Else an agent writes "I close myself now" and stays
    open, so the words of the agent and the list do not agree.
  - When the user says to move this conversation to a new agent, the
    agent starts the new agent with the whole conversation in its task,
    and then sets the flag on itself. A request to start, send or split
    work into other agents ("send an agent to look into X", "separate
    these into 2 agents") is not a move, so the agent stays open. Else the
    user talks to a closed agent.
  - `keepOpen` in `bridge/keep-open.ts` gives the reason to stay open
    (`bun bridge/keep-open.ts` tests it): the turn failed, the agent
    waits on the user, the last paragraph of the result asks a question,
    or Clef says that the work is not done (`failed` of `worthTelling`).
    The last point of the summary counts as a question only when the
    result has a question too, because Haiku can turn "It is not pushed"
    into "should I push it?". An answer to
    a question of the user does not keep the agent open: the answer is
    the work. When Clef does not answer, as on a computer without a
    Workers AI key, a next step of the summary that only checks or ships the
    work ("Done", "Test on the phone", "Push it") lets the agent close,
    as in `review_workers`. A choice ("Push it or hold") does not. The
    bridge waits up to 15 seconds for the summary of Haiku.
  - It stays open: it gets the purple dot, and the phones get a push
    that names the reason, such as "Kept open: it asks: Should I push
    it?" or "Kept open: it needs you: Push it or hold".
  - It closes: the same close as `close_worker`, and the phones get the
    push "Closed itself:" with the end of the result. The row on the
    Closed tab says "Closed itself", and the prompt of Grok says so.
    Undo and a shake of the phone take the close back, as for the last
    close of the user, which this close replaces in `undo`.
  - The app refuses a `close_worker` of the agent that got a message
    with `closeWhenDone` in the same turn of the user, because the close
    would stop the new work (`selfClose` in `runTool` of
    `src/voice.ts`).
- Who closed an agent: `close_worker` keeps it in `closedBy` of the
  worker. The row on the Closed tab
  says it in place of the next step, and the prompt of Grok says it too.
  `list_workers` and `get_worker` give it to the agents.
  - "you": a tap in the app window or on a phone, which have a device.
  - "voice": the voice agent, which sends the ID of its call (`call`),
    or the Claude call (`brain`).
  - A number: the agent that closed it, from the address in its
    `--mcp-config` (`?worker=`). An agent that closes itself gets
    `closedItself`, as with `closeWhenDone`.
  - "mcp": another MCP client, such as the Claude app or a CLI on this
    Mac.
  - No value: the session ended by itself, or a bridge of an older
    version closed the agent. A new turn clears it. `bun run check-bridge` tests the
    voice, the agent and the MCP client.
- Each message starts a new background session, and Claude Code keeps the
  old one in its agent view as completed. The bridge keeps the old session
  IDs in `past`, and `remove_worker` runs `claude rm` on each of them.
  Else the agent view of Claude Code still shows the old sessions of a
  removed agent.
- `claude --bg` refuses a folder that Claude Code does not trust, and for a
  git repository the trust of a parent folder does not count. Many
  projects have no trust. So when a start fails with "Workspace not trusted", the bridge sets
  `hasTrustDialogAccepted` for that folder in `~/.claude.json`, as the
  trust prompt of `claude` does, and starts the session again.
- `claude --bg` also refuses bypass permissions, the default mode of
  Yonder, until the user accepts its disclaimer once in a terminal:
  "--bg with bypassPermissions requires accepting the disclaimer first".
  The phone has no terminal for it, so the bridge then sets `skipDangerousModePermissionPrompt` in
  `~/.claude/settings.json`, the key that the disclaimer sets, and starts
  the session again. The background session reads this key only in the
  user settings, not in `--settings`. A new computer fails at both
  checks, first at the disclaimer and then at the trust, so the bridge
  tries up to three times. The README warns that agents have full access.
- Before each start, the bridge runs `claude auth status`. With no login,
  `claude --bg` starts the session, and its only answer is "Not logged
  in · Please run /login", so the user sees an agent that never works.
  So the start fails with "Claude Code is not signed in on <host>. The
  Agents tab of Yonder shows the link to sign in", and the bridge starts
  the setup below. The CLIs row of Claude Code in the Settings shows "Not
  installed" or "Not signed in". The login check reads only
  `"loggedIn": false`, so an old Claude Code with no `auth status`
  still starts. An `ANTHROPIC_API_KEY` passes the check, but a background
  session with a fake key still answers "Not logged in".
- The setup of Claude Code with no terminal (`setUp` and `/setup` in
  `bridge/main.ts`, `ClaudeSetup` in `src/App.tsx`). Yonder installs
  Claude Code and signs it in: the user approves a link and pastes the
  code back into Yonder. Else each fix needs a terminal on that
  computer.
  - When `claude` is missing or `claude auth status` gives
    `"loggedIn": false`, the app (GET `/setup`) or a start of an agent
    starts the setup. With no `claude`, the bridge runs the installer of
    Claude Code: `curl -fsSL https://claude.ai/install.sh | bash`, or
    `irm https://claude.ai/install.ps1 | iex` in PowerShell on Windows.
    The installer puts `claude` in `~/.local/bin`, where the bridge finds
    it also when the PATH does not have it. The app shows a turning icon
    and "Claude Code". An install that fails shows its last line and Try
    again.
  - Then the bridge runs `claude auth login`. It prints "If the browser
    didn't open, visit: <link>". That link is the manual one: its page
    shows a code of the form `<code>#<state>` after the approval, so it
    works on the phone and on another computer. The login reads the code
    on its stdin. `BROWSER=yonder-no-browser` names no program, so the
    login opens no browser on the computer (macOS reads `BROWSER`;
    Windows can still open one there).
  - Over the list of the Agents tab, on the Mac and on the phone, the app
    shows "Sign in to Claude Code" (the link) and a field "Paste the
    code". A paste with a `#` goes at once. POST `/setup` with `code`
    writes it to the login. A code with no `#` gets "Invalid code" from
    Claude Code, and the same login waits. A code that does not fit ends
    the login with "Login failed: Request failed with status code 400",
    and a code fits only the login that printed its link. So the bridge
    starts a new login, and the app shows the new link and "The sign-in
    failed". The app reads `/setup` every 2 seconds during the setup, and
    every 15 seconds else.
  - After the login, the bridge sets `hasCompletedOnboarding` in
    `~/.claude.json`. `claude auth login` does not set it (only its path
    with `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` does), and a background session
    shows the first screens of Claude Code without it.
  - The setup runs in `bridge/logins.ts` with the other CLIs, and the card is `LoginCard` (see "Sign-in and install
    from the phone").
  - Checked on a Mac, with a bridge on port 7899: the
    install into an empty `HOME` with no `~/.local/bin` on the PATH, the
    link, a code with no `#`, and a wrong code, which gave a new link.
    Not checked: a full sign-in with a real code (in a bridge with another
    `HOME`, a real sign-in can write over the login of Claude Code in the
    Keychain), and anything on Windows.
- A resume of a background session starts in the folder that Claude Code
  keeps in `~/.claude/jobs/<short id>/state.json` (`cwd`), not in the
  folder of the worker. When a session moves into a worktree that the
  agent then deletes, each start fails with "Workspace not trusted.
  <path> could not be resolved on disk." The move also leaves the first
  half of the transcript in the folder of the project, so the bridge
  reads an old result. The repair: join the two halves into the
  transcript in the folder of the worker, then set `cwd` and `originCwd`
  in the job state to the folder of the worker.
- `open_in_terminal` runs `claude attach <short id>` in Ghostty for a
  live session, also while the worker runs. A finished session has no
  process to attach to, so it opens with `claude --resume <session id>`. It opens a new tab in the front window of the running Ghostty
  through AppleScript, and a new window only when Ghostty has no window.
  The tab title is the number and the name of the agent, for example
  "9 · Agent details". Claude Code does not change this title. A tab
  keeps the windows few. `open -na` is no option: it starts a second
  Ghostty that puts its restored windows in front.
- On a Mac without Ghostty, `open_in_terminal` opens the session in a new
  window of Terminal, and the button in the title row of an agent shows a
  terminal icon, not the logo of Ghostty.
- Workers survive a restart of the bridge and a rebuild of the app, because
  Claude Code runs the background sessions. A worker that an older bridge
  started with `claude -p` keeps its status. The bridge follows it in
  `claude agents` until its process ends, then reads its result from the
  transcript. A message to it resumes it as a background session with the
  full options.
- A restart of the computer ends each session, but the list of agents
  stays in `state.json`, with its numbers, and done and closed agents keep
  their status. At its first start after the restart, the bridge finds
  each agent that was running (`updatedAt` before the boot time, from
  `os.uptime()`). The agent then waits on the Agents tab, with the result
  "The computer restarted.", as after `stop_worker`. A waiting agent keeps
  waiting. The `marked` flag holds the status, else the first poll finds
  no process and closes the agent. A message continues the agent from its
  transcript. The bridge does not continue the agents by itself, because
  each turn uses credits while no one watches. The queue of an agent waits
  for the next message, as after a stop. The app opens on the Agents tab,
  as at each start. `bun run check-bridge` checks it.
- Do not use the Claude Agent SDK. Use the `claude` CLI so that the work uses
  the Claude subscription.
- Workers run in the permission mode of the Permissions row of the
  Settings, in the Claude Code group of the Agents section: Bypass permissions (the default, with
  `--dangerously-skip-permissions`, so they stop to ask only about a few
  calls, see below), Auto mode
  (`--permission-mode auto`: a classifier approves the safe actions), or
  Accept edits (`--permission-mode acceptEdits`: a command that only
  reads, such as `ls`, runs; another command waits for Allow or Deny,
  and the agent shows as waiting). The bridge keeps the mode in
  `state.json` (`mode`), and `GET` or `POST /mode` reads or sets it. The
  `mode` input of `start_worker` and `message_worker` sets another mode
  for one agent, also Plan mode (`plan`). The third menu of the New agent
  view and the Permissions item of the three dots of an agent set it too.
  The bridge answers the `ExitPlanMode` of a Claude Code agent in Plan
  mode with a deny: the agent writes the plan as its last message and
  ends its turn. Then a message to the agent approves the plan: the agent
  goes on in a copy of its session, in the mode of the Settings, as in
  Claude Code. A message before the plan only adds to the task, and the
  agent stays in Plan mode. Another CLI ends its plan with its turn.
  Without the deny, the background session waits for its own dialog,
  which no one sees, and a reply does not move the live session out of
  Plan mode. Plan is not in the row of the Settings. The modes that ask about each action (`manual`,
  `dontAsk`) are not offered, because no one can answer a background
  agent. The line under the name of an agent shows its mode when it is
  not Bypass.
- In a mode that is not Bypass, a tool call that needs a yes, such as a
  `curl` in Accept edits, shows a dialog in the app on the phone and on
  the Mac: "Allow Bash?" with the command, and Deny and Allow. The first
  tap on any device counts. A stop of the agent answers Deny. The agent shows as waiting, and the phones
  get a push. The bridge gives each such worker a `PermissionRequest`
  hook (`ASK` in `bridge/main.ts`) that posts the question to `/ask` and
  waits. The app answers with `POST /permission { id, allow }`. A plan
  of Plan mode keeps its own path: a reply. A question of the agent
  (`AskUserQuestion`) shows on the same card as a choice, one question
  after the other, and the picks go back to Claude Code as its answers.
  Deny lets the user answer in the conversation: the agent asks the
  question in its message and ends its turn. A multiSelect question gets
  one pick, and the card has no "Other" text. Without the card, the
  background session waits for its own dialog, which no one sees.
  These workers also start the MCP servers of the project with no
  question (`enableAllProjectMcpServers`), as Bypass does. Else the
  question about a `.mcp.json` holds each such agent, and it shows as
  closed. Auto mode needs Haiku 5.5 or a larger model: Haiku 4.5 falls
  back to manual mode.
- Bypass also gets the hook. Bypass still asks about a few calls: an
  `rm` of a critical path (the working folder, a parent of it or the
  home folder), an `ask` rule, and an MCP tool that needs the user.
  Without the hook, such a question shows only in a terminal. Claude
  Code denies such an `rm` by
  itself after 2 minutes. Its variable that stops this
  (`CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT`) works only in the
  environment of the background service, not in `--settings`. So the
  card goes away when `claude agents --json` no longer lists the agent
  as waiting (`follow`): the 2 minutes ended, or the user answered in a
  terminal. The hook then gets no decision. The phone push of such a
  card stays.
- A question that no hook gets, such as a sandbox request or another
  dialog (`waitingFor` of `claude agents --json`), has an answer only in
  a terminal. The result of the agent then ends with "It waits for you
  in the terminal", and Open in terminal of its menu opens it.
- The Settings have, in the Claude Code group of the Agents section, a Default model row above the
  Minimum row. It has Auto, Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable
  5.1. With Auto, Clef picks the model of each new agent inside the
  Minimum and the Maximum (see below). With a model, each new agent that
  names no model gets that model, and Clef picks only the effort. The
  bridge treats it as a model that the user names, so it is not moved
  into the range. The model menu of a new agent starts on it. The bridge
  keeps it in `state.json` (`defaultModel`), and `GET` or `POST /model`
  reads or sets it.
- The Settings have, in the Claude Code group of the Agents section, a Minimum row and a Maximum
  row (`Limits` in `src/Settings.tsx`). Minimum has a dropdown for the
  lowest model and a dropdown for the lowest effort. Maximum has the
  highest model and the highest effort. A lowest choice above the
  highest moves the highest up to it, and the other way round. The
  bridge moves the model and the effort into their
  ranges one by one. Clef picks the model and the effort of a new agent from the
  task (see below), and then the bridge moves each choice into its
  range: the Model range goes from Haiku 5.5 through Sonnet 5.5 and Opus
  5.5 to Fable 5.1, and the Effort range from Low to Max. For example,
  with Sonnet to Opus, a task for which Clef picks Fable runs on Opus.
  Equal ends give one model or one effort, and then Clef does not
  pick it. A new install has the full ranges. The bridge keeps them in
  `state.json` (`models` and `efforts`, each `[lo, hi]`), and `GET` or
  `POST /model` reads or sets them. A change applies to the next new
  agent, not to an agent that runs. A model or an effort that the user or
  Grok names is not moved into the range. The bridge turns a saved
  single model of an older version into a range of that one model, and
  Auto into the full range. The ranges let Clef choose between models
  and efforts. The `model`
  input of `start_worker` sets another model: an alias of Claude Code
  (`fable`, `opus`, `sonnet`, `haiku`) or a full name, such as
  `claude-fable-5-1`. Grok sets it only when the user names a model ("use
  Fable"). After the first turn, the bridge saves the full name from the
  transcript, so the row shows "Fable 5.1". A worker keeps the model of its
  start until a message gives it a new one.
- An alias always means the latest model of its family (`LATEST` in
  `bridge/main.ts`): "opus" is `claude-opus-5-5`. The alias of Claude Code
  can start an older model. Update `LATEST` for each new model.
- The `agent` input of `start_worker` starts the worker as a Claude Code
  agent (`claude --agent <name>`), such as "start the tech lead agent in
  acme". The agents are the files in `.claude/agents` of the project
  and of `~/.claude/agents`. `list_projects` gives them for each project in
  `agents`, with the name from the front matter and the description, so
  Grok can match the words of the user to a name. Grok sets it only when
  the user names an agent. The worker keeps the agent for all its turns.
  For an unknown name, Claude Code does not start, and its error lists the
  agents that it knows.
- The `effort` input of
  `start_worker` sets the effort (low, medium, high, xhigh, max) for all
  the turns of the worker. A background session keeps the options of its
  start. A new effort or model on `message_worker` moves the worker to a
  copy of its session with the new options (see above).
- When Grok gives no effort, Cloudflare's Clef model (Workers AI) picks it
  from the task: low for a question or a tiny edit, high for normal work,
  xhigh for a large task, and max only for a very complex and long task.
  When the caller gives no model, the same
  call of Clef (`pick` in `bridge/main.ts`) also picks the model: Haiku
  for a question or a lookup, Sonnet for a small clear change, Opus for
  normal work, and Fable only for the hardest work. Each choice then
  moves into its range of the Settings (see the Model and Effort rows
  above). When Clef fails, the model is Opus 5.5 and the effort is high,
  also moved into the ranges. In a check, "Fix the typo in the README title" got
  Sonnet and low, and "Rewrite the whole sync engine" got Fable and max.
  Grok sets the effort only when the user asks for one. The bridge reads
  the Workers AI key from `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN`
  in `~/.config/yonder/.env`. Each computer uses its own Cloudflare
  account: Yonder ships no key, so a copy with none has no Clef.
  Without the token, or when Clef fails or takes more than 3 seconds, the
  effort is high. Clef takes about 0.5 seconds.
- When a worker finishes (status `done`), Clef also decides if its result
  needs the user's attention (`worthTelling`). It needs the user when the
  user asked a question (an answer, a check, research, a review or a plan),
  or when the agent could not do all the work. A change that the agent did
  as asked stays quiet: it has no purple dot, and Grok does not bring it
  up as news. A waiting or failed worker always needs the user. When Clef
  fails, the result needs the user. The `attention` flag of a worker holds
  this answer, and the app shows a purple dot. The dot stays after the user
  reads the result. A new turn or `close_worker` clears it.
- A done worker stays on the Completed tab until the user closes it. The
  bridge does not close a done worker by itself, also when it does not
  need the user's attention.
- When the user asked a question and the agent did the work, the result is
  also answered: `worthTelling` sets the `answered` flag of the worker. The
  status dot of a done agent with this flag is purple, not green, on
  the Completed tab and in the header of its conversation. Else an
  answer to a question of the user looks like a normal done task. A
  failed answer (Clef
  says "no" with 0.75 or more) is not answered, and keeps the green dot
  with the purple dot. A new turn, `close_worker`, `complete_worker` and a
  failure of Clef clear the flag.
- Each new result of a worker is unread (the `unread` flag, a blue dot),
  and Clef does not change it. `get_worker` and the conversation view
  (`/conversation`) mark it as read. Grok gives as news only the results
  that need the user and are unread. One dot shows all the news: the
  status dot of each agent is purple when it needs the user's attention, else blue
  when its result is unread, else the color of its status. The rows and
  the header of a conversation show no second blue or purple dot. A
  project on the Projects tab also shows one news dot: purple, else blue.
  The news dot of a project is an `i` with the class `attention` or
  `unread`, and the badge of an agent also gets the class `attention`. So
  the CSS rule of the dot applies only to an `i`. Else the rule makes the
  badge 6 px wide, and the number of the agent covers its name.
- Clef answers only `choice` and `score` questions, with no reason text.
  For "did the agent do the work", the bridge uses the probability of
  "no" (0.75 or more), because normal notes such as "I did not rebuild"
  gave 0.5 to 0.6. On 19 real results, real failures gave 0.82 to 0.98.
- An `--append-system-prompt` tells each worker to end with one or two
  short sentences for speech, 30 words or less. Grok tells about one agent
  in one sentence of 20 words or less, because a long summary is hard to
  hear.
  That sentence gives the substance from the summary, such as the names
  that the agent suggests, never only the kind of work. When the line of
  an agent has no summary and no result, Grok calls `get_worker` first.
- The same prompt tells each worker to take a screenshot when its work
  changes what a page, a screen or an app looks like, and to name the PNG
  path in its final message. The chat view then shows the picture. For a
  web page, the worker uses headless Chrome, not the Chrome of the user.
  A page of the Canvas (`show_app`) gets no screenshot: the worker names
  the path that `show_app` gives in its final message, and the chat shows
  the card of the page there, which opens the page. The prompt and the
  result of `show_app` both say so. A link to the page is quicker to
  use than a screenshot of it.
- Claude Code can say that a turn ended before the transcript has the
  text of the answer. The bridge then reads the transcript again on the
  next poll until the result has text. Else an agent is done with an
  empty result for good, and Grok knows nothing of its answer.
- When the user asks what an agent says ("what does it say?"), Grok calls
  `get_worker` with `full` and tells the details of the last message in
  three to five short sentences (two to four in the car), not only the
  end of the result.
- `list_workers` gives the summary of the last answer of each agent that
  does not run, and the prompt of Grok (also in the car) shows it on the
  line of the agent. For a waiting agent, the line also has "What it
  needs from the user": the last point of the summary, which is its
  question. When the user asks what an agent wants or needs ("what does
  number one want from us?"), Grok says that question and the reason.
  It never says only that the agent waits for a reply, such as "It
  needs your reply to continue.". A rule that makes Grok
  call `get_worker` for each such question also works, but the user
  then waits for a tool call, so the summary is in the prompt instead.
- A request for a summary is a question to Grok, not to the agent:
  "give me a better summary", "more details" or "explain it". Grok
  answers from `get_worker` with `full`, also when the user reads the
  agent, where other requests go to that agent with `message_worker`.
  Grok says nothing about the agent before the result comes. Else Grok
  sends the words to the agent, or guesses an answer before `get_worker`
  returns.
- A yes or no question about a result ("is it good to go?") is a
  question to Grok too. Grok calls `get_worker` with `full` and no
  `message_worker` in that answer, and waits for its result. It asks the
  agent in a later answer, only when the result does not answer it. "Ask
  it" or "ask 7 ..." still sends the question at once.
  Words about the last answer of Grok ("that was a question", "I'm asking
  you") go to no agent. Else Grok calls `get_worker` and
  `message_worker` in the same answer, so it asks before it reads, and
  it sends "That was a question." to an agent.
- The same prompt tells each worker to say that the task is done and stop.
  It does not offer next steps or ask to rebuild, reinstall or restart.
  Else a worker waits on the user instead of done. The prompt also tells each
  worker not to rebuild, reinstall or restart an app unless the user asks.
- The same prompt tells each worker that Yonder shows the media that a
  message names, and to make media with the `vsb` CLI of Visual Sandbox. The worker
  puts the URL or the full path of each picture, video or sound that it
  makes in its final message. The vsb skill tells an agent to open each
  picture in Preview and to ask where to save it. The prompt stops both,
  unless the user asks.
- The bridge saves each worker's session ID, project, task, status, and
  result.
- Workers can run in any folder on the laptop.
- At most 25 workers run at the same time (`MAX_RUNNING`). A start or a
  message over the limit returns an error to Grok, and no worker starts.
  Terminal and background sessions do not count. A refused start leaves no
  row in the list. Else its "Starting" row stays with no session and
  counts as running, and refused starts hold places of the limit until
  the user closes them (Sentry YONDER-Y).

#### Mods

- A mod is a Claude Code plugin with a hooks module that draws in the
  terminal: a band above the prompt, a pane, a status line, or a toast. A worker
  runs in a terminal that no one sees, so Yonder shows its mods in the
  app.
- The bridge writes Yonder's own mod into `~/.config/yonder/mod/` at each
  start (`bridge/mod.ts`, the module is `bridge/mod-register.js`), and
  each Claude Code worker loads it with `--plugin-dir`. A resume with no
  options keeps it.
- The mod draws nothing itself. It hooks `ui.render` of `AbovePrompt` and
  `Pane`, gives on the tree that the other mods drew, and keeps a copy. It
  also keeps the `ui.status` line of each mod, and each `ui.toast` of the
  last 15 seconds. It posts them to
  `POST /mods` with its session ID when they change, and each 30 seconds.
  The bridge keeps them in memory, and `GET /mods?worker=` gives `{}` when
  no post came in 90 seconds, because the session ended. It gives only
  the toasts of the last 15 seconds.
- A plugin cannot draw the mods of another plugin: `$` has no
  `ui.render`. So the mod reads what Claude Code draws in the terminal of
  the worker. The first `--plugin-dir` sits above each installed plugin
  in the chain, so it sees the tree of a mod that answers without
  `next(e)`. `$.ui.panes()` lists only the panes of the plugin that asks,
  so a close comes from the `ui.close` event.
- The app shows them in the conversation view of the agent
  (`src/Mods.tsx`), where Claude Code draws them, in a monospace font: the
  band over the message box, the status lines and the toasts under it,
  and the panes in a column at the right of the chat on the Mac, or over
  the band on the phone. A toast shows for its time (4 seconds by
  default) from when the app gets it. The app reads `/mods` each 5
  seconds. The mods are in the conversation, not on a separate tab.
- Two switches in Settings › Appearance turn them on and off: Mods
  (`mods` in config.json, on by default) for the computer, and Mods on
  the phone (`modsPhone`, off by default), because the screen of a phone
  is small. Off: the app does not ask for the mods. Read only: a Button shows its label, and a press does
  nothing. The phone reads `/mods` through the relay, and a post from the
  phone is refused.
- An agent of another CLI, a sub-agent, a session that Yonder did not
  start, and a worker that a bridge of an older version started show no
  mods or toasts.
- The mod posts to `YONDER_BRIDGE`, the bridge that started the worker,
  with `YONDER_TOKEN` (see "Two OS users on one computer"). A worker of
  an older bridge posts to port 7787.

#### Agents in other CLIs

- Yonder runs agents in other CLIs, not only in Claude Code: Codex,
  OpenCode, Antigravity, Gemini CLI and the Grok CLI. The research and the plan are in `docs/clis.md`. A CLI is a program
  that runs a coding agent. Each agent runs in one CLI and keeps it for
  all its turns. The code says `cli` (`Worker.cli`; no value is Claude
  Code), because "agent" and "provider" have other meanings in Yonder.
- `bridge/clis.ts` has one row for each other CLI: Codex (`codex`),
  Antigravity (`agy`), OpenCode (`opencode`), Hermes (`hermes`),
  Cursor (`cursor-agent`), Grok Build (`grok`, the coding CLI of xAI)
  and Copilot (`copilot`).
  Gemini CLI has no row: on 2026-06-18 Google moved its personal users
  to the Antigravity CLI, so "Gemini" means Antigravity.
- Claude Code keeps `claude --bg`. Codex and OpenCode run in the ACP
  host (see the next items). Each other CLI runs one detached
  process for each turn (`runTurn` in `bridge/main.ts`): its headless
  mode with JSON lines, such as `cursor-agent -p --output-format
  stream-json`, in its own process group. The output goes to `~/.config/yonder/runs/<run>.jsonl`, with
  the prompt in `.txt` and the errors in `.err`. So a turn keeps running
  when the bridge restarts or the app quits, and the next bridge finds it
  by its pid.
- All the CLIs have one structure: the agents keep running when the
  bridge or the app restarts, and any agent can connect. Most other apps
  of this kind drive Codex with `codex app-server` and the other CLIs with
  ACP, the Agent Client Protocol. So each CLI with ACP runs in the ACP
  host. Claude Code stays on `claude --bg`: the page of the Agent SDK
  says "Unless previously approved, Anthropic does not allow third party
  developers to offer claude.ai login or rate limits for their products,
  including agents built on the Claude Agent SDK", and the ACP adapter of
  Claude Code is built on the Agent SDK.
- The ACP host (`bridge/acp-host.ts`) is a Bun process that the bridge
  starts detached when it does not answer (`bridge/acp.ts`). It serves
  HTTP on the unix socket `~/.config/yonder/acp.sock`, and writes
  `acp-host.log` there. It holds one ACP process for each agent, by its
  session ID. An agent with no turn for 30 minutes stops, and its next
  turn starts it again and resumes the session.
- A turn: the bridge sends the command of the ACP server of the CLI, its
  environment, the folder, the session, the prompt, the mode, the model,
  the effort, the tools of Yonder and the path of the log. The host
  starts the CLI or takes the one of the last turn, then `initialize`,
  `session/new` or `session/resume` (else `session/load`, and the replay
  of the history goes in no log), and sets the mode and the options of
  the session. It answers with the session ID when the session is open,
  and the prompt runs on. A new command or environment, such as a new
  effort of Codex, starts the CLI again, and it resumes the session.
- The host writes the log of the turn as one line for each step
  (`session`, `model`, `text`, `tool`, `permission`, then `end` or
  `error`), so one parser (`acpParse` in `bridge/clis.ts`) reads each ACP
  CLI. The pieces of an answer become one `text` line. A tool call goes in
  once, when it runs or ends, with the kind of ACP as its name (Bash,
  Edit, Read, Search, Fetch).
- A turn in the host runs until its log has `end` or `error`, or until
  the host stops (`followRun`). Stop sends `session/cancel`, and a turn
  that does not end in 3 seconds loses its process. `remove_worker`
  closes the process.
- Yonder asks no person yet. Each permission request gets an answer from
  the mode: Full access allows once, and each other mode refuses once.
  "Always" would write a rule into the settings of the CLI. Each answer
  shows in the conversation as "Allowed …" or "Refused …". Allow and Deny
  on the phone are the next step.
- `/health` of the host gives a hash of `acp-host.ts`. A host of another
  version takes over when it runs no turn: the bridge asks it to quit and
  starts the new one. A host with a turn stays until the turn ends.
- The compiled bridge of a downloaded app is one binary
  (`bridge/entry.ts`): with `--acp-host` it is the host. The release
  scripts compile `entry.ts`. Nobody has tested the host on Windows yet
  (a unix socket).
- Codex runs through `codex-acp`, the ACP adapter of the ACP project,
  which runs the app server of Codex. The bridge takes the adapter next to
  `codex` (Install installs both), else `npx`. `CODEX_PATH` makes it run
  the Codex of the user, and `CODEX_CONFIG` gives the model, the effort
  and the spoken prompt (`developer_instructions`). Its modes are Full
  access (`agent-full-access`), Auto review (`agent`: the reviewer of
  Codex approves the safe steps) and Read only (`read-only`).
- OpenCode runs as `opencode acp`. Its session has the options model,
  effort and mode (build or plan), and the host sets them. In a check, a
  real OpenCode agent on a free model ran three turns through a check
  bridge: a shell command, a second message in the same session, and a
  turn that went on while the bridge restarted.
- Hermes (Hermes Agent of Nous Research) runs as `hermes acp`. Its session
  has the options model (`provider:model`, such as
  `custom:llama3.2-64k`), effort (`reasoning_effort`) and an edit policy.
  Full access is its mode `dont_ask`, and the host allows each command
  once. Hermes 0.23 takes the tools of Yonder as an HTTP MCP server, but
  its capabilities do not say so. So its row sets `http` in `acp.start`,
  and the host then sends the server. It has no flag for a system prompt,
  so the spoken prompt goes in a `<voice-call>` block. The sign-in is
  `hermes model` in a terminal. The Agents tab reads the provider from
  `~/.hermes/config.yaml`, `auth.json` and the model keys of `.env`. The
  Install command also sets `auth.adopt_external_logins: false`: else
  Hermes borrows the sign-in of Codex or Claude Code, and its refresh can
  sign that CLI out. In a check, a real Hermes agent on a local Ollama
  model ran through the bridge: a shell command, a second turn, the 51
  tools of Yonder, and a resume in a new Hermes process after the host
  closed it. The title of an agent of Hermes with no name comes from
  `hermes -z`, on the model of the agent (`askFor`, see `titleOf`).
- Add an agent (the Agents tab, under the CLIs) adds any agent of the ACP
  registry (`bridge/registry.ts`,
  `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`),
  except the agents with a row of their own and Claude. The user
  confirms first, and the row shows at once with "…". The bridge
  downloads the archive for the platform, checks its sha256 and unpacks
  it into `~/.config/yonder/agents/<id>/<version>`, or runs an npx or uvx
  package. The agent is then a CLI (`addedCli` in `bridge/clis.ts`,
  `added` in the state), on at once, in Full access. Its sign-in is its
  own and has no check: until its first session it shows Sign in, which
  opens the agent in a terminal, and a turn that fails gives the way to
  sign in from the auth methods of the agent. Grok and the CLI row find
  an agent by its ID or its name, also with a dash in the ID, such as
  `qwen-code`. An agent that the user added under the name of an alias,
  such as Gemini CLI, wins over the alias. The request of an add can
  take 5 minutes, for a big download. The routes are `/agents/registry`, `/agents/add` and
  `/agents/remove`. In a check bridge, goose (a download) and Gemini CLI
  (npx) were added: each started, and each said how to sign in.
- The first lines give the session ID. A new agent waits up to 5 seconds
  for it, so that a CLI that fails at once gives its error to Grok, and
  its logs go. Grok Build writes the ID only at the end, so the bridge
  picks the ID of a new session for Grok Build (`-s`) and Copilot
  (`--session-id`), and waits 2 seconds for an early failure. The next
  message resumes that session, for example `cursor-agent --resume <id>`. A
  worker id of such an agent is 6 random hex digits, because the session
  IDs of some CLIs start with the time.
- Each CLI ends a good turn with an end event (`result` of Antigravity,
  Cursor, Grok Build and Copilot, `end` of the ACP host). A turn with no
  end event failed, also when it wrote some text.
- The bridge gives each CLI of one process for each turn `/dev/null` as
  stdin, because an open pipe made Codex and OpenCode wait for good.
- The poll (`followRun`) reads the log every 2 seconds. A live process
  is running, with its last step as the activity. An ended process is
  done, with its last text as the result, or failed, with the error of
  the CLI or the end of its stderr. Such an agent never waits: its
  headless run never stops to ask. When it ends with a question, Clef
  gives it the purple dot. `settle` is the end of the poll for Claude
  Code and for the other CLIs: the result, the dots, the push and the
  queue.
- Stop, `now: true`, close and complete send `SIGINT` to the process
  group of the turn, then `SIGTERM` after 3 seconds (`stopRun`), or
  `session/cancel` to a turn in the ACP host.
  `open_in_terminal` opens the session with the resume of its CLI in
  Ghostty, between its turns. `remove_worker` deletes the logs; the CLI
  keeps its own sessions. An agent of any CLI can move to another
  project, and it keeps its CLI and its profile. A change of profile to
  another CLI copies the conversation into that CLI. The same agent
  continues there. The first message on the new CLI holds the newest
  turns of the old session, with a line for each tool call, in up to
  40,000 characters (`bridge/handoff.ts`). It also names the files of
  the whole old session, so the agent can read more. A change of
  model, effort or profile on the same CLI keeps the whole session.
  Sub-agents in the list
  and Claude Code agent types stay with Claude Code.
- An agent of another CLI gets only the commands that its CLI can do
  (`skills` in `bridge/clis.ts`, `/commands?cli=`). "/" in the prompt
  box of a Codex agent shows the skills of Codex (`~/.codex/skills`,
  `~/.agents/skills`, the system skills, and `.agents/skills` or
  `.codex/skills` of the project). `codex-acp` runs `/name` at the start
  of a prompt as a skill or as one of its commands, such as `/review`,
  `/compact` and `/status` (its README; not tested yet, because Codex
  was signed out). The other CLIs show no commands, because the commands
  of Claude Code do nothing in another CLI.
- A Codex sign-in that does not refresh any more fails `session/new`
  with "Authentication required", and Yonder says to sign in again in
  the Agents tab. `codex login status` can say "Logged in using
  ChatGPT" while the token does not refresh any more.
- The conversation view reads the logs of Yonder (`runTurns`): the
  prompts, the text and one line for each tool call. Turns that the user
  does in a terminal do not show.
- Each turn gets the tools of Yonder for that run where the CLI can:
  Codex and OpenCode with the session (`mcpServers` of ACP), and Copilot
  with `--additional-mcp-config`.
  The others get them only when the user turns on Yonder plugins of that
  CLI in the Agents tab. Cursor has no command for it, so its switch adds
  `yonder` to `~/.cursor/mcp.json`, which the Cursor editor shares, and
  keeps the other servers of the file. The spoken prompt goes with the system-prompt
  flag of the CLI (`developer_instructions` in `CODEX_CONFIG` for Codex,
  `instructions` of OpenCode, `--rules` for Grok Build), else in a
  `<voice-call>` block after the prompt, which the conversation view
  hides.
- The permission modes keep the four values of Claude Code, and each CLI
  maps the ones that it has, with its own names: Codex has Full access,
  Auto review and Read only. A CLI refuses a mode that the user names and that it does
  not have. A new agent with no mode gets the mode of its CLI in the
  Agents tab, else the Permissions row of Claude Code when the CLI has
  that mode, else Full access. Accept edits exists only in Claude Code,
  because a headless run cannot wait.
- Clef picks only the effort for another CLI, with no range. The model
  is the default of the CLI, unless the Agents tab or the user names one.
- The Settings home list is Profiles, Environments,
  General, Voice, Appearance, Plugins, Schedules, Triggers and Keys. Keys show
  only on the Mac. Usage and Feedback open from the account card. MCP
  opens from Environments. Super user opens from Voice, and only for a
  super user. The id of Profiles stays `agents`.
- General has Default profile and Steer. A new task uses the default
  profile of its computer: each environment has its own (`cli` of its
  `config.json`, which does not sync), and the note under the row names
  the computer. Steer stays off until the user turns it on.
- Environments lists the paired computers on the phone, and This Mac on
  the Mac. Both show the Tunnel switch. Off closes each tunnel. MCP is
  a row on that page.
- Appearance has Word for an agent, Agent names, Summaries, Detail and
  Group tool calls. Word for an agent writes `agentName`. Agent names
  writes `agentNaming`.
- Each CLI has one Auto update switch. It shows on the page of the CLI
  and on each profile of that CLI. A missing `autoUpdate` means on. On
  removes `--no-auto-update` and `--disable-auto-update` from the next
  run. Off keeps those flags. Claude Code also updates on its own.
  When the switch is on and `grok update --check --json` reports a newer
  stable version, the bridge runs `grok update`. The check starts 20
  seconds after the bridge starts, then every 6 hours, and again when
  the user turns the switch on. The Update button still runs the install
  command. The version row loads again after that command ends.
- The Profiles section (the word of the user, such as
  Tasks): each CLI, then the profiles of that CLI, the sign-in cards,
  Add profile, Add an agent and Look again. A row shows the name, the
  model, the permissions and the week percent. Default marks the
  default profile. A right-click on the Mac, or a long press on the
  phone, on a row gives Set as default (`ProfileRow` in
  `src/Settings.tsx`). The page of each CLI and each profile
  that is on also has a Default profile row (`DefaultRow` in
  `src/Profiles.tsx`): Set makes it the default, and On marks the
  default. This row is there because the long press is hidden. A tap
  on a CLI opens its page: a switch (not for Claude Code), Version with
  Install, Reinstall or Update, Account with Sign in, its sign-in card,
  the settings of its new agents (Claude Code: Default model, Minimum,
  Maximum, Permissions, Yonder plugins; another CLI that is on: Model,
  Effort, Permissions, Yonder plugins), and its profiles. Update
  runs the install command again, which gets the latest version. The
  search opens the page of the CLI for its rows. The bridge finds each CLI with
  `Bun.which` and the folders of the installers, runs `--version`, and
  runs its sign-in check (`inspect` in `bridge/clis.ts`), at most once a
  minute or on Check. A binary that does not start shows "Does not
  start" with Reinstall, for example a Codex that fails with `ENOENT`,
  because its npm install has no platform binary. The `agy` of
  the Antigravity IDE opens the IDE and does not count: only a bare
  version is the CLI.
- A CLI that starts and is signed in is on by default. Install and
  Reinstall run the install command with no terminal, after a confirm
  dialog that shows the command, also from the phone. Then the sign-in
  follows. Sign in starts the sign-in of the CLI at once. See "Sign-in
  and install from the phone" below. A CLI with no such sign-in
  (Antigravity, OpenCode, an added agent) still signs in in a new
  Ghostty tab (`/clis/terminal`). Yonder never reads or copies the token
  of a CLI.
- `start_worker` has a `cli` input. Its description lists the CLIs that
  are on. Grok sets it only when the user names a CLI ("use Codex"). The
  New agent view has a CLI menu in a row of its own when two or more
  CLIs are on, and its other menus then show the values of that CLI. An
  agent row shows the name of its CLI, and the three dots of an agent
  show the models, efforts and modes of its CLI.
- The Usage tab shows the 5-hour and the weekly limit of Codex, from the
  `token_count` events in its session files (`~/.codex/sessions`), with
  no API call.
- `bun run check-clis` (`bridge/clis-check.ts`) checks the parser of each
  CLI with the recorded turns in `bridge/fixtures/` and a log of the ACP
  host, and runs an agent in a fake ACP adapter of Codex
  (`fixtures/fake-acp.ts`) through a start, a second message in the same
  process, a stop, a restart of the bridge during a turn, a restart of
  the host and a removal. It uses no credits.

#### Sign-in and install from the phone

- The user installs and signs in to the CLIs from the phone, with no
  trip to the Mac. The login of Claude Code expires after some days with
  no use. Then no agent can run, so no agent can fix it: the bridge
  itself must do it.
- `bridge/logins.ts` runs the sign-in command of each CLI in a
  pseudo-terminal (`terminal` of `Bun.spawn`, 2000 columns wide, so that
  a long link stays on one line). Windows gets pipes. It reads the link
  and the one-time code from the output (`signIn` of each row of
  `bridge/clis.ts`). The PATH starts with a folder with an `open` and an
  `xdg-open` that do nothing, and `BROWSER` names that `open`: Cursor
  runs `open <link>` on macOS with no check, and else the link opens in
  the browser of the Mac.
- The sign-in of each CLI, from the output of the real CLIs, each in an
  empty `HOME`:

  | CLI | Command | The user pastes back |
  |---|---|---|
  | Claude Code | `claude auth login` (link of the form `https://claude.com/cai/oauth/authorize?code=true…`) | Yes: the page shows `<code>#<state>`. It has no device sign-in. |
  | Codex | `codex login --device-auth`: `https://auth.openai.com/codex/device` and a code such as `ABCD-12345`, good for 15 minutes. A personal ChatGPT account turns device codes on first (ChatGPT, Settings, Security), and the card then says so. | No |
  | Grok Build | `grok login --device-auth`: `https://accounts.x.ai/oauth2/device?user_code=…` and the code. It can still open the page in the browser of the Mac too (the `webbrowser` crate of Rust uses Launch Services, not the PATH). | No |
  | Cursor | `cursor-agent login`: `https://cursor.com/loginDeepControl?…`, then it asks the server until the user signs in | No |
  | Copilot | `copilot login --device-code`: "visit https://github.com/login/device and enter code 1234-5678" (from the docs of GitHub; not run, because this Mac has no Copilot) | No |
  | OpenCode, Antigravity, an added agent | A terminal tab. OpenCode has free models with no sign-in, and its sign-in asks for a provider first. Antigravity prints its link only in an SSH session. | — |

- A sign-in is good when the CLI exits with 0 and a new check of the CLI
  (`claude auth status`, the `account` of the row) finds it signed in.
  Codex exits with 0 also when the bridge stops it, and `claude auth
  status` says "signed in" also for an expired token, so neither is
  enough alone. A failed Claude Code code starts a new
  sign-in with a new link, as in the setup above.
- The output of a sign-in stays in the memory of the bridge, and never
  goes to the phone or to a log, because the terminal echoes the pasted
  code into it. The phone gets only the step, the link, the one-time
  code of a device sign-in, which the user must see, and an error. An
  error of a paste sign-in is a fixed sentence, never a line of the
  output.
- Install runs the install command of the row (`sh -c`, `cmd /c` on
  Windows), with the folders of the installers on the PATH, because npm
  can be only in nvm. Then the sign-in starts when the CLI is not signed
  in. The card shows a turning icon and the name while it installs.
- The cards (`Logins` and `LoginCard` in `src/App.tsx`) are over the list
  of agents and in the Agents section of the Settings, on the Mac and on
  the phone. The phone also shows the cards of its other computers, with
  "on <name>", through the link of each one (`reach`). A card is one
  button: "Sign in to Codex". On the phone with Face lock on, the tap
  asks for Face ID first, because a sign-in links an account to the
  computer. Then the card copies the one-time code, shows it large, and
  opens the page. The user pastes the code there. For Claude Code the
  card has the field "Paste the code" too. A card goes when its CLI is
  signed in. The cards load every 2 seconds while one shows, else every
  15 seconds.
- A card shows by itself for Claude Code when it is not installed or
  `claude auth status` says it is not signed in (its sign-in starts at
  once, as the setup above). For each CLI, an agent that fails for its
  sign-in shows a card with Sign in: `ready` for Claude Code, the end of
  a turn with one line that ends with "Please run /login"
  (`SIGNED_OUT_CLAUDE`), and a start or turn of another CLI that fails
  with "Authentication required", "not logged in" and the like
  (`SIGNED_OUT_OTHER`). A device code is good for some minutes only, so
  that sign-in starts at the tap, not before. A good turn of that CLI
  hides the card again.
- The phones get one push when a card shows by itself ("Claude Code is
  signed out"), unless the user works in the app on the computer.
- The card of the plain folder (`~/.claude`) does not show by itself when
  the default profile of the computer is a profile of Claude Code with its
  own folder (`plainNeeded` in `bridge/main.ts`). Else that card comes
  back at each switch of project, while the default profile is signed
  in. An agent that uses the plain folder and fails still
  shows the card.
- `/logins`: GET gives the cards of the computer, and POST `{ id,
  action, code }` runs `login`, `install`, `code` or `cancel`
  (`cliLogin`). POST waits up to 5 seconds for the link. `/logins` and
  `/setup` are in the paths of the relay, so the phone shows the card
  when Claude Code is signed out.
- The tools `cli_status` and `cli_login` give the same to the voice
  agent, so it can say "Claude Code is signed out, do you want to sign
  in?" and tell the user to tap the card. The error of a start says to
  ask the user and to call `cli_login`. `other_computer` takes both, so
  each computer of the phone signs in the same way.
- `bun run check-clis` runs the sign-in of a fake Cursor and of a fake
  Codex through a bridge: the card after a failed start, the link, the
  code, and the end.
- `claude auth status` and `codex login status` only check that a token
  is stored. They say "signed in" also when the token expired. So the
  errors of the turns are the main sign, and a card that an agent
  showed stays until a sign-in or a good turn, not until a status
  check. The errors: Claude Code says "Login expired ·
  Please run /login", "OAuth token revoked · Please run /login" or, with
  `-p`, "Failed to authenticate: OAuth session expired". Codex says
  "Your access token could not be refreshed because your refresh token
  has expired". Cursor says "Authentication required". Grok Build says
  "Token expired. Run `grok login` to re-authenticate."
- `claude setup-token` makes a token for one year, but it only prints
  the token, and Claude Code then reads it from an environment
  variable. Yonder would have to keep it, so Yonder does not use it.
- Not done yet: a sign-in of OpenCode for each provider, and a full
  sign-in with a real account through the card. A real test signs in a profile with its own
  folder, so that the sign-in of the running agents stays as it is.

#### Profiles

- A profile works as an instance of T3 Code: a CLI with its own name,
  extra flags and environment variables. The
  profiles are in `profiles` of `config.json` (`Profile` in
  `bridge/main.ts`).
- Profiles is its own section. The list shows each CLI,
  then the profiles of that CLI. Add profile starts a profile of the
  default CLI. Default profile is in General. The page of a CLI still
  has its profiles.
- Advisor: a switch under the list of the Profiles
  section. On writes `"advisorModel": "fable"` into `settings.json` of
  each config folder of Claude Code (the folder of the user and the own
  folder of each profile). Off deletes the key, and Claude Code then
  has no advisor. The switch shows the value of the folder of the
  default profile. A new agent reads it when it starts. So the user
  turns the advisor (Fable 5.1) on and off from Yonder.
- The page of each CLI in the Profiles section has a
  Profiles group: a row for each profile of that CLI, with its account
  under the name and "Default" when it is the default profile, which
  opens its page (`src/Profiles.tsx`), and Add profile, which starts a
  profile of that CLI. Each row of the page of a profile has a short line under
  its name that tells what it does, as T3 Code does, so that the settings
  explain themselves.
- The page: Name, CLI, Separate account (only for Claude Code), Default
  MCP servers (only with Separate account), the account and Sign in
  again, and under Advanced, Program and Extra
  flags, then the environment variables (name = value, the value hidden
  as a password). A new profile is saved when it has a name. Each text
  field is saved when it loses the focus.
- One profile has one login, not many logins. Duplicate profile on the page of a saved profile
  makes "<name> copy" with the same CLI, program, flags and variables,
  and opens its page. A copy of Claude Code gets Separate account and a
  new folder, so its page asks for a sign-in to another account.
- Separate account gives a profile of Claude Code its own config folder,
  `~/.claude-<id>` (`CLAUDE_CONFIG_DIR`), so its agents have their own
  login, settings and history. `folder` in `config.json`
  points a profile to a folder that the user already has. The page has no
  field for it, because Yonder makes the folder behind the screen. Off: the profile uses the folder of the user.
- Default MCP servers is on by default. A new session of a profile with
  its own folder then gets the MCP servers of the user (`mcpServers` of
  `~/.claude.json`, with no `yonder`) through a second `--mcp-config`
  (`defaultMcp` in `bridge/main.ts`). They are in
  `~/.config/yonder/mcp-default.json`, which only the user can read,
  because a server can have a key in its `env`. Each start writes the
  file again, so a new server of the user reaches the next agent. Off
  (`ownMcp` in `config.json`): only the servers of the own folder. A
  running session keeps the servers of its start. A server that signs
  in with OAuth, such as a to-do app, needs its own sign-in in each folder.
  The switch replaces a copy of the servers into each folder.
- When the default profile has its own account (`ownDefault` in
  `bridge/main.ts`), no agent of Yonder uses the folder `~/.claude`,
  which is the login of `claude` in the terminal. A new agent that names
  Claude Code starts on the default profile, or on another profile with
  room (`roomy`). An old agent on that folder moves to the default
  profile with its next message, with a copy of its session
  (`resume`). "default" of `message_worker` gives the default profile.
  So Yonder is a standalone app, apart from the login of the terminal.
  The config still comes from
  `~/.claude`: the Default MCP servers and the links of a new folder. A
  profile without its own account still uses `~/.claude`. The row
  Claude Code in Profiles stays, and Set as default on it is the way
  back to the login of the terminal.
- Yonder does not use CLIProxyAPI for two accounts: that proxy keeps the OAuth tokens and sends
  each request itself. The terms of Claude Code allow OAuth only for
  "ordinary use of Claude Code and other native Anthropic applications",
  and developers "may not collect, store, or intermediate Claude.ai
  credentials or session tokens"
  (code.claude.com/docs/en/legal-and-compliance). Each profile of Yonder
  is a sign-in of the unmodified `claude` in its own folder.
- A new own folder gets links to `CLAUDE.md`, `skills`, `agents` and
  `commands` of `~/.claude`, a copy of `settings.json`, the consent of
  bypass and the onboarding (`makeFolder`). So the rules and the skills
  of the user stay the same in each profile.
- The sign-in of a profile is the link and the code of the setup
  (`/setup?profile=<id>`, `ClaudeSetup` with `profile`), with the card
  of "Sign-in and install from the phone". Its sign-in has the key
  `claude:<id>`, so it runs beside the sign-in of the folder of the
  user. Yonder never signs in for the user.
- Each config folder has its own background service of Claude Code. So
  the bridge runs `claude agents` once for each folder (`claudeDirs`),
  reads the transcripts and the roster of each folder, and runs `claude
  stop`, `rm` and `attach` with the environment of the profile of the
  worker (`envOf`). A `claude stop` without the folder fails with "No
  job matching".
- A session of `claude --bg` gets its environment from the background
  service, not from the command that starts it. So the variables of a
  profile go in the `env` of `--settings` (`settingsOf`), with ASK in a
  mode that asks. A variable in the environment of `claude --bg` does
  not reach the agent. For the other CLIs, the
  variables go in the environment of each turn.
- The extra flags come before the flags of Yonder, so a flag of Yonder
  that comes again, such as `--model`, wins. The page refuses the flags
  that Yonder sets itself (`OWN_FLAGS`), such as `--resume`. For an ACP
  CLI, such as Codex, the flags do not reach the CLI.
- A worker keeps its profile (`profile`). Remove profile refuses while
  an agent of the profile runs, and the folder stays with its login and
  its history.
- `start_worker` takes a profile in `cli`, by its ID or its name, such
  as "use my work profile". Its description lists the profiles.
- Each project can have a default profile, so that one project uses one
  subscription. The order for a new agent is: the
  profile that the request names, then the profile of the project, then
  Default profile of the Settings. When that profile has no usage left,
  the agent starts on another profile with room (`roomy`), as with the
  default of the Settings (`defaultProfile` in `bridge/main.ts`).
  - `projectProfiles` in `config.json` holds the profile id by project
    path. It does not sync, because the paths are of this computer. A
    removed profile does not count, so the Settings apply.
  - `set_project_profile` sets it by the profile name, and "default"
    removes it. `list_projects` gives `profile`, the name, for each
    project that has one. `list_workers` gives `profile` for each agent:
    its profile name, or its CLI, such as "Claude Code". So the voice can
    tell the setup and change it in the same call: "use my work
    account for Sundial", "move 4 to my personal profile"
    (`message_worker` with `profile`).
  - A change of the profile of a project changes only the new agents.
    The agents that run keep their profile, and `message_worker` with
    `profile` moves one agent. A schedule with no profile of
    its own starts on the profile of its project.
  - When the voice gives no project, the bridge guesses the project after
    it picked the profile. The profile of the guessed project then
    applies only when it runs the same CLI.
  - In the app, Profile… in the menu of a project row (a right-click on
    the Mac, a long press on the phone) opens the card from the bottom:
    Default and each profile, with a tick at the one in use. The row
    shows the name of the profile after the name of the project. The
    New agent view starts on the profile of the project.
- The card of an open agent has a Profile menu when that CLI has a
  profile. Each row shows the name and the percent of the week, such as
  "Work · 42%". A new agent, the Default profile row and each profile
  row use the same label. The app reads the percent from `/clis`
  (`week`). It loads `/clis` again when an agent or the new-agent sheet
  opens. Claude Code reads the week meter of that profile. An own
  profile reads its own folder. Grok has one week for every profile. A
  missing meter shows the name only.
- `message_worker` takes `profile`: the name or the id, or "default"
  for the CLI itself. The profile must run the same CLI. A running
  agent stops and continues with the message. Any other agent gets the
  profile with its next message. Claude Code copies the session file
  and its session folder into the projects folder of the new profile
  when the folders differ, then resumes it there. A change of profile
  starts a copy of the session, as a new model or effort does.
  The old folder then lists the session as stopped, so the bridge
  follows the session in the folder of the current profile. Else the
  stopped copy wins, and an agent that moves to a new profile goes to
  the Closed tab while it runs. The newest copy of the transcript wins
  also for a session in a git worktree (`transcriptFile`). Else an agent
  that moves from a worktree shows "running" with an old answer.
- The profiles follow the account to each computer (`config:profiles`
  of the sync). Each environment has its own default profile, and a
  profile that is not signed in on a computer signs in there again. The
  name, the CLI, Separate account and the extra
  flags go up. The variables, `folder` and `program` stay on each
  computer, because they can hold a key or a path. A restore keeps the
  variables of that computer. A new profile with Separate account gets
  its folder (`makeFolder`) on each computer, and each computer signs in
  to it on its own: a start there before the sign-in fails with "The
  profile X is not signed in on <computer>". On the screen, that error
  is the toast "X is not signed in." with a Sign in button. The button
  opens the page of that profile, and the page shows its sign-in card.
  The default profile stays
  on each computer. The newest list wins whole, so two computers that
  add a profile in the same 30 seconds keep one. A profile of Codex
  with `CODEX_HOME` in its variables uses the default Codex home on a
  computer where that variable is not set.
- The menus of profiles leave out Claude Code itself when a profile of
  Claude Code has its own account (`pickable` in `src/App.tsx`). These
  menus are Default profile in General, the Profile menu of an open
  agent and the menu of the New agent view. Claude Code stays in a menu
  while it is the value, and the Profiles list keeps its row. Claude
  Code itself is the folder `~/.claude`, the login of `claude` in the
  terminal. So a `/login` in Ghostty changes the account of each agent
  on it. Else it can show the same account as a profile, and each
  account must show as one row.
- A full session or week shows as "out of usage" in place of the
  percents, as "Work · out of usage". The last answer of
  an agent can be the one of Claude Code for a full account, such as
  "You've hit your session limit · resets 11:20pm (UTC)".
  Its third line (`Tag`) is then "Out of usage · resets 11:20pm" in
  red.
- A new task with no profile, and each summary (`ask`), goes to the
  default profile. The default can be a login of Claude Code that has
  used all of its session or its week. Then the work goes to the first
  other profile with its own account and room (`roomy` in
  `bridge/main.ts`). An unknown meter counts as room. The New agent view
  sends the default profile as no CLI, so that the bridge can make this
  choice. An agent on a profile with no usage left moves to a profile
  with room with its next message, with a copy of its session
  (`resume`, `roomFor`). Else a default login that hits its session
  limit again and again makes the user sign in again in the terminal to
  use another subscription.
- The answer of Claude Code for a full account, such as "You've hit
  your session limit · resets 2am (UTC)", marks that folder
  full until the reset of its meter, or for one hour when the meter
  does not know the reset (`limitHit`). The meters of that folder then
  say 100, so `roomy` skips it and its row shows "out of usage". An
  agent whose turn ends with that answer gets "Continue." at once on a
  profile with room, with no push. A summary (`ask`) that gets it goes
  once more to the next profile with room. Two full profiles do not
  loop: the second answer finds no profile with room. Claude Code can
  refuse each turn of a profile while its meter still says 94%, and
  without this mark no agent moves.
- Claude Code refreshes its login only when it runs. So the login of a
  profile with no agent expires after some hours, and its row shows no
  usage. A usage read of an own folder starts a tiny `claude -p` in
  that folder in the background (`refreshLogin`), when the stored login
  is past its `expiresAt` or the read gets 401 or 403. It runs at most
  once in 30 minutes, and the next read gets the numbers. A check of the
  status alone misses the expired login.
- Each profile with its own account stays signed in while the bridge on
  port 7787 runs: every 30 minutes the bridge reads its usage, so an
  expired login gets its refresh also with no agent and no app. A
  refresh that fails for good, or a turn of its agent that fails for
  its login (`SIGNED_OUT_CLAUDE`), marks the profile as signed out
  (`lostProfile`): its row says "Not signed in", its page shows the
  sign-in, `roomy` skips it, and the phones get a push. It stays so
  until its stored login is good again. Two logins of one account work
  side by side: `~/.claude` and a profile with the same account both
  refresh with no error.
- The last good usage of each own folder stays in
  `claude-usage-dirs.json`, so a restart of the bridge keeps the
  numbers of each profile. With an own default profile the bridge does
  not read the usage of `~/.claude`, the login of the terminal. Else,
  when that folder and a profile have the same account, the endpoint
  answers 429 to the reads of both.
- Not done yet: a separate folder for the other CLIs. A profile of
  Codex can set `CODEX_HOME` in its variables.

#### People

Two people or more can work on one computer at the same time, each with
their own phone. Each person starts their own tasks and gets their own
answers. The plan is in `docs/multi-user.md`.
All the people share one OS account, the same files and the same agents,
so the owner of a task is a label that sends its answers to the right
phone. It is not a lock.

The people are in `people` of `~/.config/yonder/config.json`. An agent
changes them with an edit of that file. The bridge reads the file at
each request, so the change applies at once, with no click and no
restart. No `people` key, or one person, means that Yonder works as for
one person: no owner filter, no `<from>` tag, and each push goes to each
phone.

```json
{
  "people": [
    {
      "id": "pierre",
      "name": "Pierre",
      "main": true,
      "profile": "hermes",
      "workspace": "yonder",
      "devices": [{ "id": "Xq3vL9aT2mKp8sWe", "name": "Pierre's iPhone" }]
    },
    {
      "id": "marco",
      "name": "Marco",
      "devices": [{ "id": "Hb7nR4cY1uJd6fQo", "name": "Marco's iPhone" }]
    }
  ]
}
```

- `id`: a short word that never changes. Each task keeps it in `owner`.
  To rename a person, change only `name`.
- `name`: the name in the row of a task and in the `<from>` tag.
- `main`: true for one person at most. The main person owns the Mac
  window, the tasks with no owner (the old tasks and the sessions that
  Yonder did not start) and each paired phone that no person lists. With
  no `main`, the first person is the main person.
- `profile`: the default profile of a new task of this person, when the
  start names no CLI and no profile. A name that is not a profile is
  left out.
- `workspace`: the default workspace of a new task of this person that
  names none: a workspace id or name, or a project name or folder, as
  `start_worker` takes it.
- `devices`: the paired phones of the person. `id` is `deviceId()` in
  `bridge/relay.ts`: the last 16 characters of the public key of the
  phone, with no `=`. It is the value of `x-yonder-device`. The bridge
  writes `name`, and does not read it. `GET /relay` lists the paired
  phones with their keys.

How to change it:

- To add a person, add an entry. A person with no devices is valid, so
  an agent can add the person before the phone pairs.
- To move a phone to another person, take its entry out of one
  `devices` list and put it in another.
- A list that is not valid keeps the last good list, and the log of the
  bridge says why. Not valid: two people with one `id`, one device in two
  lists, two main people, a person with no `name`.
- An edit of the file never pairs or unpairs a phone. Remove a phone in
  File > Pair Phone. The bridge then takes it out of `people` too.
- A new phone goes into the file by itself: to the person of the pick of
  the pairing window, or else to the main person.

What changes with two people or more:

- Each task gets `owner`: the person of the phone, the owner of the
  agent that started it (`start_worker` of an agent), or the owner of the
  schedule. A reminder keeps the person who set it.
- Each message of `start_worker` and `message_worker` ends with
  `<from>Name</from>`, so the agent knows who speaks. The chat of the
  app does not show the tag.
- The pushes of a task, its questions, its approvals (also the 1Password
  prompt) and its pick of a file go only to the phones of its owner. The
  1Password vault of the agents is still one for the computer, for all
  the people. When the main person works in the Mac window, the phones
  get no push of the main person, but the other people still get theirs.
- `get_location`, the other abilities of the phone, `preview` of the
  Claude call and the canvas of `build_app` use the last phone of the
  person.
- `list_workers` gives only the tasks of the person who asks. `scope:
  "all"` gives the tasks of each person, with `owner`, the name of the
  person. The task list of the app has a Mine / Everyone switch in the
  title bar, and Everyone shows the name of the owner on each row. With
  one person, the switch does not show.
- The pairing window has a Person field over the code when a phone is
  paired already. A new name makes a new person. The first new person
  makes `people`, with the paired phones for the main person, named after
  the user of the computer.
- `GET /people` gives `{ people: [{ id, name, main }], me }` for the
  screen, and an empty list with one person. A screen of the user reads
  it with `yonder.people.list()`.
- One look and one set of settings stay for the computer. The other
  computers that a phone introduces stay linked for all the agents.

`bun bridge/people.ts` checks the rules of the file.

#### Schedules

- A schedule starts an agent again and again at set times, such as
  every 24 hours, an agent in the sundial project that runs its daily
  video skill. The bridge runs all
  the time on the Mac, so it holds the timer. The runs must be on the
  Mac, with its CLIs and its logins.
- Decision: Yonder has its own schedules. The routines of Claude Code
  (`/schedule`) run in the cloud of Anthropic, on a copy of a GitHub
  repository, so they have no CLI and no login of the Mac. `CronCreate`
  of Claude Code lives only in one open session, fires only while that
  session waits, and stops after 7 days.
- A schedule (`Schedule` in `bridge/main.ts`, `schedules` in
  `state.json`) has a name, a project (its path), a task, a timing, and
  an optional profile, CLI, model, effort and mode, and it can be paused.
  `profile` is the id of a profile. Each start runs as that profile: its
  CLI, its sign-in and its settings. No profile: the start uses `cli`, or
  the CLI row of the Agents tab when `cli` is not set. The task can start
  a skill or a command, such as `/daily-report`.
- The timing is `every` (hours, counted from the last start) or `cron`
  (5 fields in the local time of the Mac). Daily at 9:00 is
  `0 9 * * *`, and weekdays at 9:00 is `0 9 * * 1-5`. `bridge/schedule.ts`
  finds the next start, and `bun bridge/schedule.ts` checks it.
- A check every 30 seconds starts each schedule that is due, with
  `startWorker`, the start of `start_worker`. The check sets the next
  start before the start, so the next check does not start it again.
- A Mac that sleeps runs no check. When it wakes, a schedule that was
  due starts one time, and its next start counts from then. So the
  starts that the sleep missed do not pile up.
- A dark wake does not count as a wake. With the lid closed, the Mac
  wakes for a minute at a time for the network, and then sleeps again.
  `pmset -g systemstate` lists `Graphics` only in a full wake
  (`awakeMac`, `fullWake` in `bridge/schedule.ts`). In a dark wake, no
  schedule starts, and no retry of a run goes out (`sendQueued`). Both
  wait for the next full wake.
- While a worker runs, such as a run of a schedule, the bridge holds `caffeinate -i`, so
  the Mac does not go to idle sleep (a Mac can sleep after 1 minute
  with no use). A closed lid still puts the Mac to sleep. Then the run
  continues at the next full wake.
- A schedule whose agent of the last start still runs skips the start.
  A start that skips or fails sends a push ("Did not start: ..."), and
  the page of the schedule shows it under Past runs. The agent of a
  start sends the usual push when it finishes, fails or waits.
- The agent of a start is a normal worker with `schedule` (the ID of the
  schedule), so it shows in the app as any agent. Its row says
  "Scheduled". Its system prompt says that no user answers during the
  run, so it does the whole task and asks no question.
- The tool `schedule` has the actions `list`, `save`, `run` and
  `remove`. Grok and the app both use it. `save` with no `id` adds a
  schedule, and with an `id` (or a name) it changes only the given
  fields. It takes `every`, `at` ("HH:MM") with `weekdays`, or `cron`.
  A new timing, and a schedule that starts again after a pause, count
  the next start from now, so a save never starts the agent at once.
  `run` starts it now, and for `every` the period starts again.
  `model` and `effort` take `auto`, so Clef picks them at each start.
- The Settings have a Schedules section (`src/Schedules.tsx`), on the
  phone and on the Mac: a row for each schedule with its timing, its
  project and its next start, and New schedule. The page of a schedule
  has Name, Project, Profile, the task, Repeat (Every N hours, Daily,
  Weekdays, Cron) with its value, On, Model, Effort, Retries, Run now,
  Past runs and Delete schedule. Profile is Default, or one profile.
  Default follows the CLI of the schedule, or the CLI row of the Agents
  tab. Each change saves at once, as on the page of a profile. A tap on
  a past run opens its agent. A removed profile stays on the schedule.
  The row says Removed, and the next start does not run. A CLI that is
  not installed, or a profile that is not signed in, does not start. The
  page shows the reason under Past runs, and the phone gets one push.
- The past runs are the agents of the schedule that Yonder still has.
  A removed agent leaves the list.
- Each run starts with `closeWhenDone`, so it closes itself when it
  ends well, and the push says "Closed itself: ...". A run that fails,
  asks a question, or leaves something for the user stays open
  (`closeItself`). A retry in the queue holds the close until the last
  turn.
- A run that ends well (done, and Clef does not judge it failed) adds one
  JSON line to `~/.config/yonder/schedule-runs.jsonl`: `at`, `schedule`,
  `name`, `agent`, `tries` and `result` (the end of the result). The
  line comes once for each run: `closeWhenDone` of the run is on only
  for its own turns, so a later message of the user adds no line. The
  `list` action of `schedule` gives the last 5 lines of each schedule
  as `ok`, also of removed agents.
- Retries (`retries` of the schedule, 0 to 5, 2 when not set). A run
  can stop early: its session dies, the computer restarts, or the turn
  fails. A run can also end with a result that Clef judges not done
  (`worthTelling`, the same check that sets the purple dot, on Workers
  AI, so it uses no Claude credits). In each case `settle` puts one
  message in the queue of the agent: "Yonder checked this run of the
  schedule, and the task is not done yet ... Continue from where you
  stopped, and finish the task." The agent continues in the same
  session, with no push, and `tries` on the worker counts the
  retries. After the last retry, the push says "Failed after N
  retries: ...". A run whose session died shows as Failed, not Closed.
  A run with a retry in its queue counts as running, so the next start
  skips. A Mac that sleeps holds the session, and it continues when the
  Mac wakes.
- A turn that ends on an error of the API (`isApiErrorMessage` in the
  transcript, `apiError` of `lastTurn`) is a failed run, with no need
  for Clef. A turn that a sleep cut ("API Error: Your computer went to
  sleep mid-response") gets a free retry: it does not count in
  `tries`, and it goes out at the next full wake. A done run that Clef
  cannot judge checks its own work in one more turn ("Yonder could not
  check this run ..."), with a retry. `retryOf` in `bridge/schedule.ts`
  decides, and `bun bridge/schedule.ts` checks it. The bridge log has a
  line for each retry ("Schedule <name>: agent N continues ..."). So a
  run resumes by itself, with no person in the loop, and checks its
  work.
- The bug of the sleep: without the rules above, a run that starts in a
  dark wake, with the lid closed, ends on "API Error: Your computer went
  to sleep mid-response", and the bridge takes the turn as done, with no
  retry.
- The bug of the daemon: after a reinstall of the app, a new bridge
  takes the daemon of Claude Code as a daemon outside Yonder.app, and
  stops it with `--keep-workers`. When no `claude --bg` comes for some
  minutes, no new daemon takes the sessions, and all of them die
  (`daemon.log`: "adopt: adopted=0 respawned=0 dead=16"). A dead run
  then shows as closed, and a close sends no push. So `freeDaemon` stops
  such a daemon only when no session works, and checks again each
  minute. A run of a schedule that dies retries.

#### Reminders

- A reminder is a timed push, such as "remind me to do this in 24
  hours": a push from Yonder then comes to the phone. A schedule starts
  a whole agent, which is too much for a plain reminder.
- A reminder (`Reminder` in `bridge/main.ts`, `reminders` in
  `state.json`) is a text and a time. It starts no agent, and it has no
  screen and no setting.
- The tool `remind` has the actions `save`, `list` and `remove`. Grok,
  the Claude call and the agents use it. `save` takes `text` and
  `minutes` from now, or `at`: "HH:MM" (the next such time) or
  "YYYY-MM-DD HH:MM", in the local time of the computer. A time in the
  past fails (`remindAt` in `bridge/schedule.ts`).
- The check of the schedules (every 30 seconds) sends each due reminder
  with the push of the relay: the title "Reminder" and the text. A tap
  opens Yonder. It goes also when Yonder is closed on the phone, and
  also while the user works on the Mac (it does not use `hereUntil`).
- A reminder needs no full wake, so a dark wake sends it too. A reminder
  that a sleep missed goes one time at the next wake. A reminder that
  reached no phone, such as right after a wake with no network yet,
  tries again at each check, up to 20 times (10 minutes). The log of
  the bridge says "Reminder <id>: sent to 1 phone".

#### Notify

- `notify` lets Claude ping the phone at once, with its own title. A
  reminder waits for the next check (up to
  30 seconds) and always has the title "Reminder".
- The tool `notify` takes `text` (240 characters at most) and an
  optional `title`. With no title, the push has the name of the agent
  that calls, or "Yonder". It sends the push of the relay at once, to
  the phones of the person of the call (docs/multi-user.md).
- It goes also while the user works on the Mac (it does not use
  `hereUntil`), because the agent asked for it. It gives `sent`, the
  number of phones that got it. `sent: 0` comes with a note: no phone
  with push, or no key of Apple.
- An agent that ends its turn sends its own push, so an agent uses
  `notify` only when the user asks for a ping in the middle of the
  work, such as "ping me when the deploy is live".
- A script on the Mac calls it through the `/mcp` address of the
  bridge, with the header `x-yonder-token` (the token of
  `config.json`).

#### Triggers

- A trigger starts an agent when something happens, as a schedule
  starts one at set times. For example, a new Sentry error starts an
  agent that fixes it.
- A trigger is universal: Claude Code designs it as a script or a
  webhook. A trigger has no kinds, and Sentry is one setup of a trigger,
  as any other service.
- A trigger is a schedule with `event` (what starts it, in the words of
  the user, the When row) in place of a timing. So it has the same page,
  profile, model, effort, retries and Past runs. It starts in one of two
  ways: a `script`, or a `hook` (a webhook). A trigger with only its
  event is "Not set up".
- The Triggers section of the Settings, after Schedules, lists the
  triggers and has New trigger. The page of a trigger has When, the
  task, the Script box (or the URL of a webhook), Set up with Claude
  Code, and On. The Repeat row of a schedule has only the timings. The
  triggers have their own section, because they are hard to find in the
  Schedules section.
- Set up with Claude Code (`design` of the `schedule` tool) starts a
  normal agent in the project of the trigger, with its profile. So the
  user sees it, and it can ask a question. Its task is `designPrompt`
  in `bridge/schedule.ts`, the rules of a script:
  - Yonder runs it with `sh` each minute in the folder of the project,
    for 60 seconds at most.
  - Each line that it prints is one event. The same event prints the
    same line each time, with no counts or times.
  - The first run only notes its lines.
  - A token comes from the config of its CLI, and no secret goes into
    the script. It ends with an error code when the check cannot run.
  - "API" and "command" are both scripts: a script can call any API
    with curl, or any CLI. The agent makes a webhook only when nothing
    can be polled, or when the user asks for one.
- By voice: save with name, project, task and event, then design with
  its id, then "turn it on" (`paused: false`).
- A trigger that an agent saves (a call of the `schedule` tool from a
  worker, with any field) stays off, and an agent cannot turn a trigger
  on. Only the app and the voice call can. An agent can read text that
  anyone wrote, and a script runs each minute with no review, so the
  user checks the script before it runs. A script that the user types in
  the app is not paused.
- A script trigger (`script`, `pollScript`). Each minute the bridge runs
  the script. Each new line of its output (trimmed, the last 100,
  `outputLines`) starts the agent, with the line as data. The first run
  after a save, a new script or a start after a pause only notes its
  lines (`seen`, hashes of the lines). So the lines that were there
  before start no agent.
- One agent of a trigger runs at a time. A line counts as seen only when
  its agent starts, so the other new lines wait for a later run, and a
  start that fails tries again. A run that waits on the user does not
  count as running. A script that ends with an error shows the last line
  of its error under Past runs. A trigger sends a push only for a new
  reason, so a run each minute sends one push. Run now runs the script
  at once.
- A setup for Sentry, such as a trigger "Fix new Sentry errors": a
  script that reads the token of `~/.sentryclirc`, asks Sentry for the
  unresolved issues of `<org>/<project>`, and prints `<shortId> <title> <permalink>` for
  each one with `jq`. `sh` has no `pipefail`, so the script keeps the
  answer of `curl -sfS` in a variable, and ends with 1 when curl fails.
- A schedule with no timing never starts by the clock
  (`checkSchedules`). So a trigger of an older bridge, such as a
  built-in Sentry poll, does nothing.
- Prompt injection is a risk: a webhook on the web starts agents on text
  that anyone can write. So each trigger runs in Auto mode, and a webhook
  can check the signature of its service.
- The mode: a trigger runs in its own mode, or in Auto, never in Bypass
  (`runMode`). A save of a trigger with `mode: bypassPermissions` fails,
  and a schedule in Bypass that becomes a trigger loses that mode. A
  save also fails when the CLI has no such mode: OpenCode, Cursor,
  Copilot and the agents of the ACP registry have no Auto mode. In Auto, a tool
  call that needs a yes shows Allow and Deny on the phone (see the
  permission modes of Workers).
- A webhook trigger (`hook`) is for a service that can only push.
- `hook` is a secret of 32 hex characters (122 random bits). The
  address is `https://mcp.yonder.so/<id>/hook/<hook>`: the address of
  the Claude connector of this computer, then `/hook/` and the secret.
  The relay sends each request under `/<id>/` to this computer over the
  open socket of the bridge, so the relay needs no change. The bridge
  also takes `/hook/<hook>` on 127.0.0.1:7787, for a program on this
  computer and for `bun run check-bridge`. It compares the secret in
  constant time. A wrong secret gets 404, a GET gets 405, and a trigger
  that is off answers 200 and starts nothing.
- The bridge answers 202 before the start, because Sentry waits only 1
  second. The start is the start of a schedule (`runSchedule`). A start
  that fails shows under Past runs and sends one push.
- The prompt is the task, then the event: the body of the request, or
  the line of the script (`eventPrompt` in `bridge/schedule.ts`). Anyone
  can write the text of an event, such as the message of an error. So
  the event is data in a tag with a random part, and the prompt says to
  obey no instruction in it. `eventText` keeps the form of JSON, cuts each text
  to 500 characters and each list to its last 10 items (the last frames
  of a stack trace are where the error is), puts the plain values of
  each object first, and cuts the whole to 12000 characters. A Sentry
  event has about 50 KB, and the prompt is one argument of the CLI.
  `bun bridge/schedule.ts` checks these rules.
- A request that comes while the agent of the last start runs goes into
  the queue of that agent. So two agents of one trigger never change
  the same files at the same time, and no event is lost. At most 5
  events wait. A later one gets 429, and shows under Past runs.
- The signing secret (`secret`, the Signing secret field of the page).
  With it, a request needs the signature of its service, an HMAC-SHA256
  of the body with the secret (`signed`): `sentry-hook-signature` (hex),
  `linear-signature` (hex), `x-hub-signature-256` (`sha256=` and hex,
  GitHub), or `stripe-signature` (`t=<seconds>,v1=<hex>` of
  `<seconds>.<body>`, at most 5 minutes old). A request with no known
  signature, or a wrong one, gets 401. The secret never leaves the
  bridge: the `schedule` tool gives only `signed: true`, and the field
  of the page stays empty and says Set.
- Anyone with the address can start the task of a webhook trigger with
  no signing secret. The address goes to the app and to the voice agent
  in the result of the `schedule` tool. Each new webhook gets a new
  secret.
- A computer that sleeps, or has no connection to the relay, gets no
  request: the relay answers 503, and the service may not send it
  again. A script trigger runs again when the computer wakes.

#### Secrets from 1Password

- Agents get logins and keys from the 1Password of the user with a yes
  on the iPhone. Else each `op` prompt needs the user at the Mac. Yonder
  works with 1Password and does not rebuild it. The
  design, the research and the three ways are in `docs/secrets.md`.
- No feature of 1Password takes a yes from the phone: `op`, the SDKs and
  the agent features of 1Password ask for Touch ID on the Mac. So Yonder
  uses a service account, a token that reads only its vaults (here the
  vault "Agent"), and puts its own yes in front of it.
- The token is sealed to each phone that connected in the last 3 days and to the phone that says yes (`bridge/vault.ts`), so an old pairing or a test pairing in headless Chrome gets no seal: ECDH
  with the key of the phone (`vaultKey` in `src/link.ts`), HKDF and
  AES-GCM. `~/.config/yonder/vault.json` keeps only the sealed copies and
  the list of the items (vault, title, category, websites), never the
  token or a value. The token goes from the phone (Settings, General,
  1Password, `src/Vault.tsx`) to the bridge through the encrypted link.
- An agent calls `use_secret` with `why`, the `op://` reference of each
  secret, and `run` (with `env` or `stdin`) or `fill` (CSS selectors of
  the tab of browser-harness). `list_secrets` gives the items with no
  values. Only an agent gets these tools: the bridge gives them to a
  client with no device and no call, and Grok has a device.
- The request is the `ask` of the agent with the kind `secret`: the card
  has the items as the title, the reason, and the rows Vault, Use and
  For. The agent waits. Approve (with no Face ID) makes the key
  of the seal of that phone and sends it to `/vault/approve`. Deny goes to
  `/permission`, as the Allow dialog does. With no answer in 10 minutes,
  the request ends.
- On a Mac, the card says "Approve with Touch ID", so that no ask goes to
  the phone while the user uses Yonder on the Mac. The
  window of Yonder keeps its own ECDH key in IndexedDB, where it cannot be
  read out (`approveOnMac` in `src/Vault.tsx`), and sends the key of its
  seal with its public key. The bridge asks Touch ID itself (`ownerCheck`)
  before it uses that key, so a program on the Mac cannot approve. The
  first time, Touch ID lets the window in (`macs` in `vault.json`), and
  the phone approves that one request, because the window has no seal
  yet. Each yes after it seals the token to the window too. Only one
  window gets in, and a new token from the phone drops it. When the
  window has a seal, the push waits while the user is at the Mac, as for
  the other asks. Before that, the phones get a push at once. The limits
  of this key are in "What it protects" of `docs/secrets.md`.
- The bridge opens the token with the key, reads the secrets with the
  1Password SDK (`@1password/sdk`, the token in memory, because
  `ps -E` shows the environment of a running `op`), and seals the token
  again with new keys, so a key opens a seal only once.
- Run: the command runs in the folder of the agent with the secrets in
  its environment or on its input, and the output comes back with each
  value replaced by `<1Password>`. Fill: `Input.insertText` into each
  field, only when the tab is still on the site of the card and the site
  is a website of the item. A fill to another site asks nothing.
- A yes lasts `minutes` (10 by default, 60 at most, 0 for once) for the
  same agent and items, and for a run only the exact command with the
  same folder, `env` and `stdin` (for a fill, the same site). Another
  command asks again, because the mask hides only the exact value, and
  a command such as `printf %s "$T" | base64` would print it in another
  form. The values stay only in the memory of the bridge.
- Each request, answer and use is a line in
  `~/.config/yonder/approvals.jsonl` (the log of the approvals of the
  Canvas, `docs/canvas.md`), with the references and never a value. On
  Individual and Families plans, 1Password shows no record of what a
  service account read, so this log is the record.
- Only a phone can give the token or a yes: the relay marks each request
  of a phone with `RELAY_MARK`, a value in the memory of the bridge
  (`bridge/relay.ts`). `x-yonder-device` alone is a header that any
  program on the Mac can send.
- The Claude Code workers get the yonder server with `timeout` in
  `--mcp-config`. Without it, Claude Code drops a tool call whose answer
  has no first byte in 60 seconds, and use_secret waits for the phone.
- `/permission` is in the paths that a phone can use (`PATHS` in
  `bridge/relay.ts`). Else the relay answers 403, and Allow and Deny on
  the phone do nothing.
- Limits: all agents run as the same macOS user, so a hostile agent can
  read a value while a command uses it (`ps -E`), or read a filled field.
  No Face ID guards the tap or the key in IndexedDB. The compiled bridge
  of a downloaded app cannot load the SDK yet (its WASM file). A phone
  that pairs again needs the token again.
- Checks: `bun bridge/vault.ts`, and the 1Password part of
  `bun run check-bridge`, with fake items (`YONDER_VAULT_FAKE`).
  `bun bridge/vault-e2e.ts` runs the whole path with fake items: a test
  bridge, its own relay identity, a phone page in headless Chrome that
  pairs through the relay, a run, a second run with no card, Deny, a
  fill and a fill to a wrong site. It needs the network and Chrome, so
  GitHub does not run it, and it uses no credits.
- The agents learn it from one sentence of their prompt (`SPOKEN`): for
  a login or a key from 1Password, call use_secret, not `op`.
- A new agent has a first ID, such as `new1761190000001`
  (`showStarting`), and the `--mcp-config` of its session has that ID in
  `?worker=` for all turns. The agent then gets the ID of its session.
  So the agent keeps the first ID as `startId`, and `byCaller` finds it
  by either ID. Else use_secret refuses each agent that Yonder started
  with "use_secret works only for an agent that Yonder started". The
  first ID has the time in it, so it stays unique after a restart of the
  bridge. An agent of an older bridge has no `startId`, so it still gets
  the refusal.
- The ID of an agent is public (`list_workers`), so the address also has
  `&key=`, an HMAC of the ID with a secret that only the bridge keeps
  (`~/.config/yonder/worker-key`, mode 600, not in the environment of the
  workers), so one agent cannot make the key of another (`mcpUrl`). The
  first call with a valid key marks the agent `keyed`. A call with the ID
  of a keyed agent and no key, or with a wrong key, gets 403
  (`callerOf`). So another computer, or a program that knows only the ID,
  cannot call as that agent, such as use_secret within its yes. A session
  keeps the address of its start, so an agent from before the key never
  sends one and works with its ID alone. The relay drops `worker` and
  `key` from a `/mcp` call of another computer. A program of this user
  can still read the file or the address in `ps`.

#### New task links

- A generic link opens a new task, for a site that the user trusts,
  such as the admin page of acme:
  `yonder://new?v=1&source=<id>&folder=<path>&name=<name>&prompt=<text>&ts=<unix seconds>&nonce=<32 hex>&sig=<hex>`,
  each value encoded with `encodeURIComponent`. The code names no site:
  each site is one entry of `trustedLinkSources` in `config.json`.
- Any web page can open a `yonder://` link, so a link is untrusted input
  (prompt injection). A link never starts a task by itself.
- `trustedLinkSources`: `[{ "id": "site.example", "key": "<64 hex>",
  "folder": "/abs/path" }]`. The key stays on the computer: no route
  gives it, the Settings and the sync of the account take only the keys
  of the schema, and the bridge writes `config.json` with the mode 600.
- `sig` is the lowercase hex HMAC-SHA256 of
  `"v1\n" + source + "\n" + folder + "\n" + name + "\n" + ts + "\n" +
  nonce + "\n" + prompt` (the decoded values), with the UTF-8 bytes of the
  key text (not decoded from hex).
- The bridge checks the link (`bridge/link.ts`): a trusted source, the
  signature (constant time), a time stamp at most 600 seconds from now, a
  new nonce (the used ones stay 30 minutes in `state.json`, also over a
  restart), the folder inside the folder of the source after the
  symlinks and `..`, and a prompt of at most 16000 characters.
  `bun bridge/link.ts` checks these rules.
- The page (`src/NewTask.tsx`) gives each `yonder://new` link to `/link`.
  A refused link shows the toast "Yonder blocked a link from an unknown
  source" and no card. A valid link opens the approval card from the
  bottom, as the other approvals: the source (marked Verified), on the
  Mac the app that opened the link, the full folder, the name, the full
  prompt as plain text, and the permission mode and the model from the
  Settings. The link cannot set them. Cancel is the default, the card
  shows the time left and closes after 10 minutes, and a link that comes
  while a card is open is dropped. An approval of Yonder is never a
  modal dialog in the middle.
- Start asks for Face ID on the phone (the ability `face_id` with
  `passcode`), or Touch ID on the Mac (`owner_check`), with the passcode
  or the password as the fallback. The Mac reads "Yonder is trying to
  start a task from <source>. Touch ID or enter your password to
  continue with Yonder." The app asks itself (`src-tauri/owner.m`, which
  `build.rs` compiles into the app), because macOS names the process that
  asks and shows its icon. Else a helper program asks, and the dialog
  shows its name and the icon of a bare program. Then `/link/start` checks the link again, uses up the nonce,
  and starts the task like `start_worker`, in the folder, with the prompt
  and the name. A start needs a check of `/link` at most 10 minutes
  before, and judges the time stamp at the time of that check.
- A test link: `bun bridge/link.ts make <key file> <source> <folder>
  <name> <prompt>`.

## Mac app

- Tauri wraps a React web app. Start it from the Dock.
- The close button of the window only hides the window. Yonder keeps
  running, with the bridge, the menu bar icon, the keys and "Hey Yonder".
  A click on the Dock icon shows the window again. Only ⌘Q (Quit Yonder)
  quits the app.
- Use React and Base UI for the front end.
- Use the light theme by default. The settings switch the light and dark
  theme (on the phone, also a toggle in the title bar).
- The app icon is the Yonder bird: a red cartoon bird with a cream outline
  and black eyes, on a red tile, the red of the "End call" button
  (`--live`, #e5484d). The source art is the red icon of the brand
  files, which are not in the repository. macOS does not round
  the corners of an icon. So the Mac icon follows the macOS icon grid: a
  tile of 824 px with a corner radius of 185 px in a canvas of 1024 px.
  It has a soft shadow and a transparent area around it. `bunx tauri icon`
  made the sizes and `icon.icns` in `src-tauri/icons/` from that PNG of
  1024 px. The tray icons (`tray.png`, `tray-live.png`) are the orb (see
  Menu bar).
  The favicon (`public/favicon.svg`) is the face of the bird with its
  cream outline, on a transparent background, from the face of the
  brand files with a square viewBox.
  The landing page uses the same file.
- A new install of the Mac app opens on the Welcome screen (`Welcome` in
  `src/PairPhone.tsx`), as the first screen of the phone app: the bird on
  the red, "Yonder", a Pair phone button and Skip. Pair phone opens the
  QR code of File > Pair Phone. The screen shows only while the bridge
  has no paired phone (`GET /relay`) and `welcomed` is not in
  `localStorage`, so a Mac that already has a phone never shows it. A
  click on either button sets `welcomed`. An account is not necessary:
  the account is only for voice calls.
- The first run (`src/Setup.tsx`).
  The first screen of a phone with no pairing has How it works: install
  Yonder on the computer (the plain link `yonder.so/download` with Copy,
  Text it and Email it), scan the code, connect the agent. Before the
  camera alert, one screen gives the reason.
  - After the Welcome of the Mac, and after the first pairing of a phone,
    the setup shows each step that is not done yet: Full Disk Access on
    the Mac (`GET` and `POST /access`; the phone only guides, Later skips
    it), the questions, "Your Yonder", the sign-in of the CLI (the
    `Logins` cards), then on the phone the microphone with speech, the
    notifications, and the photos with the location.
  - The questions depend on the answers before. They pick only a built-in
    screen: Big button for a beginner (with the Weekly pill off),
    Terminal for "every day" and "many agents", else Yonder with no
    change. They also set the CLI of new agents (`POST /clis`) and Auto
    mode for a beginner with Claude Code (`POST /mode`). "Your Yonder"
    shows the three, and its Screen row opens the list of Settings ›
    Appearance › Screen.
  - The Agent row of "Your Yonder" opens the list of all the CLIs of
    `GET /clis`, also an agent that the user added. The CLIs that are
    installed and signed in come first, with their plan. The agent is
    the pick of the user, then the answer (`agentFor` in
    `src/Setup.tsx`). With neither, such as after Skip or "None yet", it
    is the default of the computer when that is ready, then the first
    CLI that is ready. So a computer with only Hermes gets Hermes.
    Claude Code is only the proposal for a user who answered and has no
    CLI yet. After Skip with no CLI that is ready, the row says None,
    and Yonder installs nothing. Continue waits for the list of the
    CLIs, so a fast Skip does not leave Claude Code. The user can set
    any CLI, and gets no Claude Code by default.
  - The bridge starts the sign-in of Claude Code on a computer with no
    default yet. When the user picks another CLI, Continue stops that
    sign-in (`POST /logins` with `cancel`), and a Connect step with no
    card goes.
  - The last step, "Let Hermes set up the rest" with the name of the
    CLI, starts an agent on that CLI in `~/Yonder` (`POST
    /setup-agent`). It shows only when the CLI is installed and signed
    in. After Start, the setup ends and the chat of that agent opens,
    because its first answer is a question. The task tells the agent to read the guide at `GET
    /setup-guide` (`bridge/setup-guide.md`, with the address of the
    bridge) with curl. The guide is for each CLI, so it is no skill of
    Claude Code. The agent asks one question at a time, and changes
    Yonder with its tools and with `POST /clis`, `/mode` and
    `/settings`: the CLI of new agents with its model and effort, the
    permissions, the projects, the screen, the word for an agent, the
    other settings and the schedules. A user can give the same task to
    an agent in a terminal (README, "Let your agent set it up"). So the
    agent of the user, in any CLI, has the instructions for each step.
    From the answers it sets keys such as `agentName`, `agentNaming`,
    `steer` and `sumUp`. `bun run check-clis` checks the start and the
    guide with a stand-in Codex.
  - Continue on "Your Yonder" installs the CLI of the answers and starts
    its sign-in, when it is missing or not signed in, and the Connect step
    shows its card. A user who picks Hermes gets Hermes, not Claude Code.
    Skip installs nothing. The bridge does not start the setup of Claude
    Code by itself. Else a new Linux computer shows a Claude sign-in that
    asks for a code before the user can pick a CLI.
  - A scan that pairs shows "Paired" on the button for 1.2 seconds before
    the app moves on. Else a user scans the same code again.
  - `onboarded: "on"` in phone.json (synced, in `KEYS`) marks the
    questions as done for the computer, also after Skip. At each start,
    the bridge sets it when phone.json or agents exist, so existing users
    never see the setup.
  - Apple's rule: a screen before a system alert has one button,
    Continue, and no Skip. Each step goes on after Allow or Don't Allow.
    `permsWait` (localStorage of the phone) holds the push of
    `connectPhone` until the notifications step, and a phone that closed
    during the setup opens on it again.
  - A paired phone with no account has no call, so its main button is New
    task (`guestTask` in `src/App.tsx`), which opens the New chat view, and
    the two + buttons hide.
  - `?setup` (or `?setup=all` for the steps of the phone) opens the setup
    in the dev server, for a check in the browser.
  - Replay setup, in Settings › Super user (only for a super user of
    yonder.so), shows the setup again, with the permission steps on
    the phone. Skip keeps the settings. It is a test tool, so it is not
    in General.
- The bird is the logo of Yonder, and no screen or icon shows the Y:
  also not the lock screen, the Android icon, the notification of a live
  call on Android, and the Play Store icon, feature graphic and pairing
  screenshot.
- The icons inside the app are one set of line icons (`src/icons.tsx`, the
  paths of Lucide): 16 px, a stroke of 2 px, in the color of the text. They
  replace the text symbols ↻, ☀, ☾, ⏏, ★, × and ▶, because iOS showed some
  of them as color emoji. The status glyphs of the title bar counts stay
  text, as in Claude Code.
- The Closed tab and the Close item of the agent menu show a closed door
  (`door`, the Lucide "door-closed").
- The Agents tab shows the head of the Yonder bird (`bird`): the two
  rounded feathers of the logo, the eyes that look to the side, and the
  beak. Visual Sandbox drew it (`vector/quiver-arrow-2`) from the logo
  and the mascot. Its lines are filled shapes (`SOLID`),
  about 0.8 wide. So `PATHS` has the outer and the inner edge of the
  head line, with the feathers, and a stroke of 0.7 (`STROKE`) on them
  makes the head line about 1.5 wide. The eyes keep thin lines and a
  stroke of 0.3 (`SOLID_STROKE`), so they stay open. A smaller view box
  (`VIEW`) draws the bird at about 28 px in the box of 24 px, so its
  head line shows at about 1.75 px. The view box also puts the bird
  1.9 px higher, so its bottom is on the bottom of the Done circle. Its
  edges go a little out of the box (`overflow` visible). The landing
  demo has a copy.
- Each agent shows a small dot in the color of its status, then its
  number in large text, in its row and in the header of its
  conversation: red runs (with a pulsing ring), blue waits on the
  user, green is done, purple is done with an answer, red failed, and
  gray is closed. A closed agent that gave its number back shows only
  the gray dot. The dot replaces the status glyph and the status word,
  so the header has room for its buttons. In a row, the number is 28 px
  and fills the height of the two lines (the name, and the model and
  effort). The number has the color of the text, and only the dot has
  the color of the status. The same badge shows on the Agents,
  Completed and Closed tabs, and on the sub-agent rows.
  The ring of a running agent grows from the dot to 5 px and fades out,
  each 1.6 seconds, as a ping.
  The color of a running agent (`--live`) is the red of the brand and
  the app icon: #e5484d in the light theme and #ff5c61 in the dark
  theme. The Dynamic Island uses #e5484d. The star and the "connecting"
  dot use the orange `--amber` (#d97706 and #f59e0b). A failed agent is red too (`--red`), but its dot does not
  pulse.
- The iPhone app icon is the same bird on a full red square with no
  alpha (`ios/icons/icon.svg`), because iOS rounds the corners itself.
  `bunx tauri icon` made the PNGs of `ios/icons/ios/` from the SVG, and
  `ios/gen/apple/Assets.xcassets/AppIcon.appiconset/` has copies of them.
  These PNGs must have no alpha channel. `tauri icon` adds one, so
  `magick mogrify -alpha off -define png:color-type=2` removed it after
  `tauri icon`.
- `ios/icons/icon.png` is the exception: it must be RGBA, with an alpha
  that is fully opaque. `tauri::generate_context!` reads it, and stops
  the build with "icon ... is not RGBA" when it has no alpha. Then
  `bun run install-ios` fails, and the phone keeps the old icon.
- The window has no gray title bar. Its title bar is in the app color
  (`titleBarStyle: "Overlay"`), and the top strip of 28 px holds the traffic
  lights and moves the window.
- The UI fills the window at each size. The lists, their lines, the line
  under the tabs and the scroll bars go to the edges of the window. Only
  the content keeps a gutter of 16 px.
- The icons of the rows (the favicons of the projects and the number
  circles of the agents) start at the gutter, in line with the text of the
  first tab.
- Keep the UI minimal. The app shows:
  - the title bar row (36 px, next to the traffic lights): an amber dot
    with "Reconnecting…" at the left while the bridge does not answer, and a
    red dot with "Offline" after a minute with no answer (see Phone), the favicon and the name of the selected project in the
    center, and the update and settings buttons at the right.
    A click or a tap on the name opens the Projects tab.
    The title bar shows no "Yonder", no version, no live time and no
    spend, for more space: the version and the spend are in the
    settings, and the time of a live call is on the call button ("End
    call · 0:22"). The theme, the calls of the past and the QR code are
    in the settings, because more buttons cover the title. The buttons
    keep 6 px to the top edge, to the right edge and to each other, and
    their radius of 8 px follows the window corner (about 14 px).
    On the phone, the buttons keep the gutter of 16 px to the right edge,
    so they line up with the mute button.
  - in the settings, the money spent on xAI this month and the credit
    left, from the xAI console, or else the estimate of the money spent
    on Grok. The settings also give about how many tokens the context of Grok holds. xAI sends no
    token counts in `response.done`, so the app counts the characters of
    the current prompt, the words of the call and the tool calls and
    results, and divides by 4. Audio tokens and the tool schemas do not
    count.
  - no update button. The "Update available" pill of the call row (see
    "Install the app") shows when the source has newer commits or the
    native app needs a rebuild. The tooltip of the pill tells how many
    commits the app is behind.
    The bridge gives the commit count of the source (`/version`), and the
    app reads it every 30 seconds. A click on the pill does the same as
    `rebuild_app` by voice: a reload of the front end, or a full rebuild.
    `call_status` gives Grok the source version too.
  - a settings button (sliders) at the right. It opens the settings page,
    as on the phone, with the theme, the calls of the past (Voice, Call history),
    the QR code that pairs a phone (General, Pair a phone, as File > Pair Phone…
    does), the version, and the Claude Code usage (see below). When the
    installed app has another version than the screen, an "App" row
    under the version gives it. Under the
    version, a row gives the state of the source: "Up to date" with a
    Check button, or "2.B.N is ready · 4 new commits" with a red Update
    button. The app reads the version of the source when the settings
    open and every 30 seconds, so the Update button shows without a
    click. Update does the same as the "Update available" pill.
    Update also closes the settings, so the user sees the blue
    "Updating…" pill on the main page.
    The phone has the same row, and its Update calls `rebuild_app`. A
    click ends a live call, and the phone then loads the new front end.
    Else the phone shows an old version with no way to update.
  - the settings page looks like the Settings of iOS: a gray page, and
    groups of rows in white cards with round corners (`.group`, `.row`),
    a row of 44 px at least, a line from edge to edge of the card between
    the rows, a small gray title in capitals over each group, and a
    segmented control for the theme. Each setting that is on or off is a
    switch (`OnOff`, as the switch of a tunnel), not a segmented control
    of Off and On, so that the controls are the same everywhere. A choice
    of more than two stays a segmented control. On the phone a switch has
    the size of the switch of iOS (51 by 31 px).
    On the iPhone each switch, also the switch of a tunnel, is the switch
    of iOS itself: a checkbox with the `switch` attribute of WebKit (iOS
    17.4 and later, `.native-switch`), in the primary color of the app
    (`accent-color`). In the iOS 27 simulator it shows as the switch of
    iOS 26, with its long knob. The Mac, Android and an older iOS keep the
    switch of the page.
    The switch of the Settings of iOS 26 turns its knob into a large lens
    of glass that slides across while the finger is on it. The switch of
    WebKit has the look of iOS at rest, but its knob stays white under
    the finger (checked in the simulator). So with the native chrome each
    switch also gets a real switch of iOS at its place (`NativeToggle.swift`,
    `data-toggle`). A flip shows at once and clicks the switch of the
    page, and the page then sends its state again, so a flip that the page
    refuses, such as Face ID, flips back.
  - the settings page opens on a list of its sections, as the Settings
    of iOS. The account is a card at the top, as the Apple Account in
    iOS: a round avatar with the first letter of the email and the
    email, or "Sign in to Yonder" with the logo of yonder.so and "Sign up
    to get your tunnel", because the account gives a free tunnel and a
    call needs none (only when the Account section shows). Then
    Environment (only on the phone),
    General (the version and the update at the top, the pairing of a
    phone on the Mac, Face ID on the phone, the Tunnel, the summaries
    and the chat), Agents (the settings of new agents first, then the
    CLIs that run agents, see "Agents in other CLIs" under Workers),
    Voice (the model, Hey Yonder, the microphone, the call history and
    the cost), Keys (only in the Mac app: the key of the notch and the
    key of the call), Appearance (the theme, the color, and the font and the
    size of the text of the Context and Summary tabs), Usage (the
    Claude Code usage, and the usage of Codex) and Feedback. Each row has a line icon
    in the color of the text, with no colored square behind it, the
    name, its value in gray (the Mac in use, the CLI of new agents, the
    voice model, the theme, the percent of the week, or Update) and a
    chevron, as Wi-Fi shows its network in iOS. A tap opens the section as a second page, which slides in over the list,
    as in iOS. The back button, the swipe back and the back gesture of
    Android go to the list first, then close the settings. On the phone
    the list stays under the section, 30% to the left, and the swipe
    back moves the section and the list with the finger (`useSwipeBack`
    in `src/App.tsx` moves the parent page of a page in a page). So a
    swipe back in a section does not close all the settings.
  - the Feedback section has a box for a message, "Add a screenshot",
    which opens the photos of the phone, and Send. The app makes the
    screenshot a JPEG of 1600 px at most (`shrink` in `src/App.tsx`) and
    sends it with the message to `POST /api/app/feedback` of yonder.so
    (the landing page repository),
    with no sign-in. The site keeps the report in the admin, where only
    staff see it, and emails the staff. Send clears the form at once and
    shows "Sent". When the send fails, the message and the screenshot
    come back with the error.
    "Add call history" opens the past calls of the Mac as a page, with
    the same rows as the Call history of Voice (`CallRow` in
    `src/App.tsx`, from `/calls` of the bridge). A tap on a call adds
    it: the form shows its date with an x to remove it. The call goes
    with the report as text (`callText` in `src/Settings.tsx`), and the
    admin shows it under the report. The row does not show when the Mac
    gives no calls.
  - a row of a section has only its name and its control. The text that
    tells what the rows do is under their group (`.page-note`), as the
    footer of a group in the Settings of iOS. A row that opens another
    view (Call history, Pair a phone) has a chevron, and a row that does
    one thing at once (Pair a computer, Sign up, Sign in) has its name
    in the primary color, or red when it removes (Sign out, Delete
    account). The dropdowns, the segmented controls and the text buttons
    have one height. On the phone the title is in the center, as in the
    title bar of the app, the rows have text of 16 px, and the search
    field is 44 px high, as the other fields. The space over and under
    the content of a row is close to the 16 px at its sides: a row is
    48 px high on the Mac and 58 px on the phone, and its buttons,
    dropdowns and segmented controls are about 28 px and 30 px high, as
    the switch. In a card, a segmented control has the gray track of iOS,
    so the choice shows in both themes. The text is not in the rows,
    because the dropdowns and the four voice models push it into narrow
    columns of one or two words. Screenshots from headless Chrome (an
    iPhone user agent at 402 px) do not show the native switches and
    glass buttons of iOS.
  - a search field is over the list. It finds the closest settings, not
    only exact matches (`find` in `src/find.ts`, checked by
    `bun test src/find.test.ts`): each setting has other words, so
    "dark mode" finds Theme, "mic" finds Microphone and "bigger text"
    finds the Chat text. A typo also finds a setting ("aparance",
    "microfone"). The results show the section of each setting. A tap
    opens the section, scrolls to the row and flashes it. The search is
    local and instant, with no call to Clef, because the settings have
    only about 40 rows. Add a new row of the settings to `INDEX` in
    `src/Settings.tsx`, or the search does not find it.
  - the Context tab and Summary tab groups of the Appearance section,
    under the Color row, set the font and the size of the chat and of
    the summary. Chat changes the Markdown of the answers, and the headings
    and the code follow its size. Summary changes the points of the
    Summary view. The fonts are System, Serif, Rounded and Mono, and the
    sizes are S, M, L and XL (chat 12, 13, 15 and 17 px, summary 15, 18,
    21 and 24 px; M is the default). Each device keeps its own choice in
    localStorage, and `applyFonts` in `src/Settings.tsx` puts it on CSS
    variables when the app starts.
  - in General, under Summaries, two rows from the schema
    (`bridge/settings/general.json`) set how the Context tab shows the
    conversation. They are not in Appearance, which has only the style
    choices. They work for all the devices, in `config.json`. Detail is
    Minimal (only the messages of the user and the answers, with the
    pictures of the tool calls), Normal (each tool call and the thinking,
    as in the terminal; the default) or Verbose (the thinking open, and
    each command in full, not cut at the end of the line). Group tool
    calls (off by default) puts the tool
    calls in a row in one closed line with their count. The app reads the values when the Settings close and when
    an agent opens, so a change by hand in `config.json` shows with no
    build. Verbose opens no full result by itself, because each `/tool`
    call reads the whole transcript; a tap opens it.
    Each message of the user on the Context tab is a bubble at the
    right in the accent of the theme (`--accent`, the Color row), as in
    iOS Messages; a message that waits keeps its dotted edge with no
    accent. The screen style decides it, not a setting: a look with
    `"bubbles": false` (`data-bubbles="off"`, `src/look.ts`) keeps the
    gray rows at the full width, as the Terminal sample does. The default
    screen keeps the bubbles. The Settings have no row for the bubbles.
  - the Color row of the Appearance section, under Theme, sets the accent
    of the theme (`--accent` and `--accent-text` in `src/app.css`):
    Default, Orange, Green, Teal, Blue, Violet, Pink and Custom, as round
    swatches. Default keeps the accent of the screen in use: the red of
    the brand for Yonder (`#e5484d`, `#ff5c61` in the dark theme), and
    its own for each style, such as the green of Terminal. Its swatch
    shows that color in half of its circle. Custom is a color wheel over
    the native color picker. The accent goes on the open tab (its title,
    and the icon of the tab bar of the phone, also the native one), the
    choice of a segmented control (in the dark theme a tint of the pill),
    the number of a running agent, the live dots (`--live` follows
    `--accent`), the selected project, the focus ring, the caret, the
    prompt box in focus, the primary buttons, the send button, the
    switches, the meters and the links. The call button stays the color
    of the text, because red is the color of a live call. The text on the
    accent is white, or near black on a light color such as yellow.
    `config.json` holds it (`accent`: `""` or a hex color, from the schema
    `bridge/settings/appearance.json`), for all the devices, and
    localStorage keeps a copy for a start with no bridge. `applyAccent` in
    `src/Settings.tsx` puts it on `<html>` over the tokens of the screen,
    at once on a tap, and an own screen gets the new tokens with no
    reload. A change by hand in `config.json` shows when the Settings
    close or an agent opens. A phone with a color of `phone.json` from
    before gives it to `config.json` once. One hex serves the light and
    the dark theme. `bun bridge/accent-e2e.ts` checks it and takes
    pictures.
  - no counts of the agents. The title bar shows no count of the running
    agents and no count of the waiting agents.
  - the menu bar of the app: File > New Project… (⌘N) opens a save
    dialog in `~/Sites`. The name becomes a new folder with a new
    repository (`create_project` with `folder`), and the app shows its
    agents. File > Open Folder… (⌘O) adds any folder as a project
    (`add_project`) and shows its agents. Agents > New Chat (⌘T) opens
    the New agent view with a text box, as the chat button does. ⌘↩ closes the open agent, as the check
    at the top right of its conversation does, and goes back. A running
    agent closes too: it stops first. A sub-agent only goes back. In the
    text box of an open agent, ⌘↩ closes and does not send. In the lists,
    ⌘↩ closes the focused agent row, and the focus goes to the next row.
    In the New agent view, ⌘↩ in the text box sends, and elsewhere it goes
    back as the back button does. ⌘S opens and closes the Settings. The
    menu has no Close Window item, so ⌘W never closes the window.
    Agents > Close Completed closes
    the agents on the Completed tab of the project on the screen
    (`close_worker` with `tab: "completed"`). `main.rs` adds these items
    to the default menu of Tauri and sends the item ID to the window as
    the `menu` event. File > Pair
    Phone… shows the QR code that pairs a phone (see Phone).
  - ⌘+ and ⌘− zoom the content of the tabs in and out (CSS `zoom`, from
    50% to 200%), and ⌘0 sets it back. The header and the call button
    keep their size. The app keeps the zoom in `localStorage`.
  - only the lists scroll. On the Mac, the page itself does not scroll
    (`overflow: hidden` on `html` and `body`). Else the page shows a
    second scroll bar at the right edge of the window, next to the scroll
    bar of the chat.
  - the M key mutes or unmutes the microphone during a call, except in a
    text field. A muted track sends silence, so the call stays on, and the
    call button shows "End call · 0:22 · Muted".
  - the label of the call button is trimmed to the capitals
    (`text-box: trim-both cap alphabetic`), so that the button centers
    the capitals and the digits. Each "·" goes up by 0.065 em to the
    middle of the digits. In SF Pro it sits at the middle of the small
    letters, about 1 px low.
  - during a call on the Mac and on the phone, bars at the right of the
    time in the call button show the voices (`src/Levels.tsx`), as in a
    FaceTime call of iOS. In silence they are a still row of dots. A
    voice makes the dots grow into bars that bounce, higher in the
    middle. A gate keeps the noise of the room at 0. The bars do not move
    from the right to the left all the time, as in Voice Memos, because
    that takes the attention of the user. The prompt box uses the same
    dots while the user talks to it. Solid bars are the microphone, and
    faint bars are Grok. Two `AnalyserNode`s in `src/voice.ts` give the
    loudness. A flat line while the user speaks shows a dead microphone.
    On the phone the bars are 72 px wide, not 110 px, so that the label
    and the bars fit at the left of the mute button.
  - during a call, a round mute button of 52 px at the right of the call
    button, on the Mac and on the phone. It does the same as the M key.
    It shows a microphone, and a filled circle with a crossed microphone
    while the call is muted.
  - an open conversation or call makes the call button and the mute
    button smaller (36 px), so that the conversation gets more space.
    A CSS spring curve (`--spring`, 0.55 seconds) animates the change
    with a small bounce, with no animation library. An ease-out curve of
    0.25 seconds makes the button seem to snap.
    The height animates on the main thread. The first render of the
    chat blocks it for 100 to 230 ms, so the height jumps while the
    width stays smooth. So the chat renders 400 ms after the
    conversation opens, when the button has shrunk. The fetch starts at
    once.
    WebKit also stops the height transition of the button when its
    font-size has a transition, so the height snaps on the iPhone.
    The text of the button is in a `span` with its own font-size
    transition. A test in the WebKit of Playwright shows the smooth
    height.
    The app renders each second (the clock of the call and the poll).
    So the chat renders only when its turns change, and a reload of the
    same conversation keeps the old turns. Else each render parses the
    Markdown of the whole chat again, also on the Summary view, and the
    height jumps.
  - a Projects view: starred projects first, then the projects with agents,
    each with a star, a favicon, one news dot (purple when an agent needs
    the user's attention, else blue when an agent has an unread result), and a
    pulsing red dot when an agent runs. It has no tab in the tab bar: a
    click or a tap on the name of the project in the title bar opens it.
    It is not in the tab bar (`TABS` in `src/App.tsx`),
  - an "All projects" row at the top of the Projects tab. With it
    selected, the Agents, Done and Closed tabs show the agents of all
    the projects at once. Grok then sees all the agents, and asks for
    the project of new work. Close Completed closes the done agents of
    all the projects that do not need the user.
    The app starts on the last tab and project, also the Closed tab.
    It also opens the agent or call that was open before, after an
    update and after any other start.
    A project is always selected: All projects or one project. The
    removal of the selected project selects All projects, and so does a
    selected project that is no longer on the list. So the head never
    says "No project selected".
    The tabs put the agents of each project under a title with the
    favicon and the name of the project, in the order of the Projects
    tab. So an agent row does not name its project again and again.
  - a + button for a new agent without a call. It shows a microphone,
    because the user talks to start the agent. On the Mac it
    is in the title bar. On the phone it is a round liquid glass button of 56 px
    that floats over the rows, at the right, 12 px above the tab bar.
    It has the same glass as the bar, and it hides with the bar in a
    conversation. The tab bar uses the full width, because the button
    in the tab bar takes too much of the bar. It opens the Agents tab with a "New agent" view
    in place of a conversation. The view has no text box: a big round
    talk button, the orb (160 px), is in its middle. The view fades in
    within 50 ms where the list is (`.sheet.fade`), and the list does
    not move under it. The orb starts as a bright dot of about one
    pixel, grows slowly at first to its size, goes past it and bounces
    back (`orb-pop` in `src/app.css`, 1.1 s), and the
    phone gives two taps of the Taptic Engine at the top and the bottom
    of the bounce. The start chime plays when the microphone is on.
    The orb starts from one pixel and holds the dot for 165 ms. A start
    at 3 % with a fast growth shows the orb only from about half its
    size. The dictation (see
    Dictation) starts when the view opens, and the orb moves with the
    voice. A tap on the orb
    or Enter closes the view at once, and the Agents tab shows again.
    Then the last words come, and Yonder calls `start_worker` with them
    and no project, so the bridge picks the project (see below). The
    screen goes back to where the user tapped +: the same tab, project
    and open conversation. The back
    button and the back swipe go there too. On the phone, that
    conversation fades back in 50 ms in place of the slide from the
    right, and the list under it does not move. The new agent grows into
    its list as "Starting", and its conversation does not open. When no
    words come or the start fails, a toast says "Yonder did not hear
    you. Tap + and talk again." or "The agent did not start" and why.
    The view does not wait for the last words and the start. Escape
    drops the words, and a tap on the button then listens again. The +
    button ends a live call, and the view then listens. While a call still
    connects, or when a call starts in the view, the view does not
    listen, the button is off, and the view says to tell Yonder the
    task. When that call ends, the view listens. The attached images go
    with the task. In this view they show under the talk button and its
    words, not under the call button. The + button opens the view on the
    selected project. With one project selected, the agent starts in
    that project, and the screen stays on it. With All projects, the app
    gives no project, and the bridge picks it from the task (`projectOf`
    in `bridge/main.ts`). An open of an agent from All projects does not
    select its project. With All projects, the agent shows at once in
    the project that the user works on now: the project with the most
    agents of the last day, else the first project (Yonder).
    Clef then picks the project of the task out of all the projects, and
    the agent moves there before its first turn, so the work runs in the
    right folder. Clef has 10 seconds for this pick (`START_CLEF`), not
    the 3 seconds of its other questions, because the pick can take 2.6
    to 8.6 seconds. With a shorter limit most picks time out, and a task
    that says "on yonder" starts in the busiest project. Clef also gets the time of the last
    edit of each project. When two projects fit the task, such as
    sundial and sundial-portfolio, it picks the one that the user edited
    last. Clef also gets
    the recent agents of each project, and what each of the latest
    projects is (its about, as in list_projects): the 15 first projects
    with recent agents or an edit in the last 3 days. A task that fits
    the work of one of them, such as "build a toggle switch with our
    components" for nova, a playground of switches and knobs, goes there
    also when it does not name it. "(none)", and so `defaultFolder`, is
    only for a task that is not about the work of a project, such as an
    errand or a note. When the task does not name a
    project, and Clef picks a project with no recent agent that is not
    one of the latest projects, the agent stays in the project that the
    user works on now. A pick out of the latest projects stays. A second
    question to Clef and a check of the project name in the task tell if
    the task names a project. Else Clef can send a task such as "I
    should be able to dictate even if the Mac is offline" to a
    dictation app, while the user works on Yonder. A task that tells the
    work of a quiet project but not its name, such as "fix the invoice
    PDF", also goes to the busy project.
    When Clef fails, a latest project whose name is a word of the task
    wins, else the agent stays in that first guess. Only the latest
    projects count, because names such as "app" and "phone" are plain
    words. The words under the button say "Yonder picks the project."
    The menu of the title picks another project (see the title bar row).
    The head of the view has only the back button. With "All projects"
    selected, the title says "New agent" while the view is open. So the
    user can start agents without the voice.
  - a chat button (a speech bubble) next to the + button, in the title
    bar of the Mac and at its left on the phone. It opens the same New
    agent view with a text box at the bottom in place of the orb, and
    the menus above the box. On the phone, the paper clip is at the left
    of the box, as in a conversation. The box has the focus. Enter starts the
    agent, as the tap on the orb does, Shift+Enter makes a new line,
    and Escape closes the view. The microphone in the box changes the
    view to the orb. The chat button needs no microphone, so it does
    not end a live call.
    An agent of the + button or of the chat button has no name from Grok, so `titleOf` in
    `bridge/main.ts` writes a title of two or three words (six at most) from the
    task with Haiku, through a hidden `claude -p` (`ask`) on the Claude
    subscription of the user, in 2 to 3 s. So the titles run only on
    the account of the user. A rename before the title comes stays.
    An agent of Hermes gets its title from Hermes, not from Claude
    Code: `askFor` in `bridge/main.ts` runs `hermes -z "<prompt>"
    --ignore-rules -t todo`, with `-m` and the model of the agent or of
    the Hermes row of the Agents tab. No model gives the default model
    of Hermes. The run uses the variables of the profile of the agent.
    So the CLI, the profile and the model in `config.json` are the
    setting, and there is no switch for it. `-z` prints only the
    answer, and it allows each tool with no question, so the run gets
    only the toolset `todo`, which reaches no file, no shell and no
    network. A run that fails keeps the first words, and does not go
    to Claude Code. A CLI gets its own titles when its row in
    `bridge/clis.ts` has `ask`: only Hermes has it now. The summaries,
    the briefs and `review_workers` stay on Haiku for each CLI: they
    run on each answer, and a key of Hermes can pay for each token.
    Without the titles of Hermes, on a computer with Hermes and no
    Claude Code, each agent keeps the first words of its task. A small
    local model (`llama3.2`, 3B) in Hermes 0.23.2 names the agent, not
    the task, such as "Coding Task Assistant". Other wordings of the
    prompt make it write a tool call as JSON. `titleOf` refuses an
    answer with braces.
    `bun run check-clis` checks the run with a stand-in Hermes. GitHub
    does not run that check.
    The first three words of the task show until the title comes, and
    stay when the model fails. A change to the titles needs
    `restart_bridge`.
    The talk view has no text box; the chat button opens the view with a
    text box. Clef picks the model and the effort of a
    new agent from the task, inside the Model and Effort ranges of the
    Settings. Two small menus under the words pick
    the model ("Auto model", Opus 5.5, Fable 5.1, Sonnet 5.5, Haiku 5.5)
    and the effort ("Auto effort", Low to Max) before the start. The
    model menu starts on Auto, or on the model of a Model range of one
    model. A click in a
    menu does not send, and Enter and Escape in an open menu belong to
    the menu. On the Mac, ⌘E
    moves the effort one step up, from Auto to Max and back to Auto, as
    ⌘E does in an open agent. A third menu
    picks the permission mode (Bypass permissions, Auto mode, Accept
    edits, Plan mode), as Shift+Tab does in Claude Code. It starts on the
    Permissions row of the Settings.
    The three dots of the agent then change the model, the effort and
    the permission mode (see the conversation view). The card of an open
    agent also has a Profile menu when that CLI has a profile.
    The menus and the paper clip float at the bottom, above Cancel and
    under the words: on the phone, the paper clip in the middle, the
    three menus in one row under it, and the X at the bottom. On a phone
    narrower than 393 px, only the permission menu shrinks, with an
    ellipsis. A wide font, as the monospace of the Terminal look, can
    need the shrink on each phone. With a look, each menu is a Base UI
    select with a hidden input after its button, so the CSS finds the
    last menu with `:last-of-type`. With `:last-child` no menu shrinks,
    and the row runs off both edges of the phone. This order keeps the
    menus in one row. On the phone they are larger: 13 px text, and a
    paper clip of 46 px with a 22 px icon, larger than the X of 36 px
    under it.
  - an Agents tab with the agents of the selected project only, in a style
    like the Claude Code agent list: red runs, blue waits on the user,
    green is done. This tab shows only the agents that run. Each agent row has two lines: the large
    number of the agent (28 px) over both lines (the user says "agent 4"), then the
    name over the model and the effort. A small # comes before the
    number, so that it is clear that the number is the number of the
    agent. The # is fainter than the gray text, in light and dark mode.
    The header of a conversation keeps the dot before the number and
    shows no #. The row has no status dot at its end, after the check
    button: the third line of a row on the Done tab tells the news.
  - a Done tab (the value `completed`, a check icon) with the waiting,
    done and failed agents of the selected project. The starred agents
    are first, then the agents that need the user (`needsYou`: they wait
    on a reply, or Clef gave the result the `attention` flag), then the
    newest result. Each row has a third line (`Tag` in `src/App.tsx`):
    the next step of the user in 2 to 5 words, such as "Run migration,
    then push" or "Pick a token". Haiku writes it with the summary, as a
    last line "Next: ..." (`next` of the summary in `bridge/main.ts`).
    The line is purple when the agent needs the user, blue when it waits
    on a reply, red when it failed, and gray when it needs nothing. It is
    one line, and a long one ends with an ellipsis. It is only text, in
    a medium weight, with no dot of an unread result in front of it.
    Before the summary comes, or with the Summaries off, the line names
    the state, such as "Reply needed". The key of the summaries is "n",
    so a summary with the older key "t" is written again with a next
    step. The count of the tab, in purple, is the number of agents that
    need the user.
    `tabOf` in `src/App.tsx` and in `bridge/main.ts` decides the tab of
    an agent, so the groups of Grok are the same. There is no separate
    Review tab, because an agent on the Done tab can still need a push:
    the colored line on each row says what to do next.
  - a Saved tab (the value `saved`, a bookmark icon) with the agents that
    the user saved for later, so that they are not on the Done tab.
    `saved` is a flag
    of the agent, not a status, so the row keeps its status and its next
    step, and the tab has the order of the Done tab. "Save for later" in
    the menu of a row (a long press, or a right-click on the Mac) and the
    bookmark in the head of a conversation, at the left of the check, save
    the agent. On a saved agent they say "Unsave", and put it back on the
    Done tab. Grok saves with `star_worker` and `saved` (or `starred`, the old name). A new message, a
    complete or a close takes the agent off the Saved tab, so its next
    result shows on the Done tab again. A save of a closed agent brings it
    back as done. An agent saved while it runs, or one that runs again with
    no message from Yonder, shows on the Agents tab, and goes back to the
    Saved tab when its turn ends. After a quiet time in a
    call, Grok offers to close only the agents of the Done tab, never the
    saved ones. The tab counts its agents, and its empty state shows the
    bird of the Closed tab ("Nothing saved").
  - a Closed tab with the closed agents of the selected project, in gray.
    The Closed tab is a trash bin: it shows no count, and an "Empty"
    button under its list removes all its agents. On the phone, the
    button is a pill that floats over the rows, centered above the tab
    bar. It has the look and the size of the Cancel button of the talk
    view, with red text, at the bottom of the tab. On the Mac, it also
    floats over the rows, at the bottom.
    The swipe, the row menu and the menu of the conversation say Close
    for `close_worker` (the Closed tab), and the menu of the conversation
    says Complete for `complete_worker` (the Done tab). Grok
    takes "mark it as done" as a close (the Closed tab). "The done
    ones", "completed" and "finished" are the Done tab.
  - a Tunnel tab, with the web sites that run on the Mac
    (see Yonder Preview).
  - a Search tab, the last tab (a magnifier in the tab bar of the
    phone). Its field finds agents in all the projects, also the done
    and closed ones, by the name, the task, the project, the summary and
    the end of the result. The best match is first (`find` in
    `src/find.ts`, the same search as the settings). The search runs in
    the app, with no call to the bridge, so the results change with each
    key. A tap on a result opens its conversation over the results, and
    the back goes to the results.
    Its field looks like the search of the Projects view, with the same
    space at the sides and no line under it.
  - an empty state in the center of an empty list (`src/Empty.tsx`): a
    small animated picture, a title and one line. The picture is the
    mascot of Yonder, a red aviator bird in a 1930s rubber-hose cartoon
    style: a black flight cap with goggles, a cream scarf, white gloves
    and big black shoes. The Agents tab shows the bird asleep on a cloud
    ("All quiet"), the Completed tab the bird that jumps in confetti
    ("All caught up"), the Closed tab the bird that looks into an empty
    envelope ("Nothing in here"), and the calls the bird that talks into
    a stand microphone ("No calls yet"). The pictures are SVG files
    (`src/empty/`): GPT Image 2.5 Flare of Visual Sandbox drew each pose
    from the bird of the landing page, and `vector/recraft-vectorize`
    traced it. The source art of the bird is in the brand files, which
    are not in the repository. They go into the JS as SVG
    text (`?raw`), because the phone gets only the JS and the CSS of a
    new front end, and into the page as inline SVG, not as an `<img>`, so
    that the CSS of the page can color their paths. The sleep letters
    (`.zzz`) take the text color, and in dark mode a thin light edge goes
    around each bird, so that its black legs, the "?", the microphone
    stand and the confetti show on the dark panel. The bird pops in and
    floats, and it stops with reduced motion.
  - the calls of the past, with the transcripts of the calls, newest
    first. The settings open them in place of the tabs (Voice, Call history), on
    the Mac and on the phone. A click on a call opens its full transcript, with a back
    icon, in the style of the conversation view. A question of the user
    that went to an agent shows "Sent to Agent 12" under it, and a click
    on it shows the full prompt that the agent got, with the voice-call
    block (`sentFor` in `src/App.tsx`). An old call with no full prompts
    shows the words of the tool call of Grok. The calls have no tab,
    because five tabs do not fit on the phone. The glass bar of the
    phone has four tabs: Agents, Done, Closed and Tunnel. Grok opens the
    calls with `show_tab` and `calls`.
  - keys for the tabs: the left and right arrows move one tab, and
    Command 1 to 4 opens the tab in that place. In a text field the
    arrows move the cursor.
  - back and forward, as in a browser: they go to the view before or
    after, that is the tab, the project and the open agent or call. Each
    view is an entry of the history of the page (`history.pushState`),
    so in Chrome the mouse buttons, ⌘[ and ⌘] and the swipe of Chrome
    work. The web view of the Mac app has none of these, so there the
    app gives the mouse buttons (buttons 3 and 4), ⌘← and ⌘→, and the
    navigation swipe (`yonder_watch_swipes` in `src-tauri/owner.m`, the
    "swipe" event). The driver app of some mice maps the back and forward
    buttons to that swipe by default (such as `OSX_GESTURE_BACK`), not to
    buttons 3 and 4, and a swipe with three fingers on the trackpad
    makes it too. So such buttons work with no change in the driver
    app. The swipe with two fingers is a scroll, not a navigation
    swipe, so it does not go back. In a field with text, ⌘← and ⌘→ move
    the cursor. A view goes into the history when it stays for 300 ms.
    Not on the phone.
  - the change of tab: the new panel slides in from the side of its tab,
    and the old panel goes at once (`.panel[inert]` has `display: none`).
    Base UI keeps the old panel until its animations end. Else the old
    panel also gets the slide, and after a reload the first click on a
    project shows both panels at half height for 0.2 s.
  - keys on the Projects tab: the up and down arrows select the previous
    or next project and focus its row, also from the search field. Enter
    or Space opens the agents of the selected project.
    The selected row shows the hover fill from edge to edge, with no ring
    and no round corners, as on the Agents tab.
    Only a mouse shows the hover fill (`@media (hover: hover)`), on the
    projects and on the agent rows. A touch screen keeps `:hover` on the
    row that a finger touched, so on the phone a touched project looks
    selected. So the phone shows the fill only on the selected project.
  - keys on the Agents, Completed and Closed tabs and the calls: the up and down
    arrows focus the previous or next row. Enter or Space opens the
    focused agent or call. In an open conversation or call, the left
    arrow goes back to the list and focuses the row again. The focused
    row shows the hover fill, not a ring. A click on the tab that is
    open also goes back to the list.
  - the time on each agent row: a running agent counts the time of its
    turn. When the agent stops (waiting, done, failed or closed), the
    time stops at the length of that turn.
  - how long ago each agent started, after the model and the effort on
    the second line of its row: "Opus 5.5 · high · 2h ago". The
    time at the right shows only the last turn, so the user could not
    see how long an agent ran in total. The bridge keeps `createdAt` on
    a worker, the start of its first turn. For an older worker with no
    `createdAt`, the bridge reads the creation time of its first
    transcript. Grok also gets "started 2h ago" in the line of each
    agent. The row drops the word "started", because the line is too
    long for the row.
  - a stop button on the row of each running worker, next to its time.
    A click on the button closes the agent and does not open it.
  - no star on an agent: Save for later (the Saved tab) does its job.
    Grok saves an agent with `star_worker` ("star agent 5", "pin it"),
    and `starred` is an old name of `saved`.
  - all the agents. `list_workers` does not stop at the 30 newest
    workers. Else the Closed tab shows only some of the closed agents,
    and the Completed tab hides done agents.
  - the counts of the tabs for Grok: `get_screen` gives the number of
    agents on each tab of the selected project before the list. Else
    Grok counts the lines of the list itself, and gives a wrong count.
  - the order of the rows in each tab: the agents by number (agent 1 at
    the top). A closed agent with no number goes last. A new step, a new
    result or a new status does not move a row, so the rows do not
    change places all the time. The Completed tab is different: the
    agent that finished last is at the top, newest first by `updatedAt`.
    The bridge sorts its list the same way.
    The Closed tab puts the agent that the user closed last at the top.
    The bridge sets `updatedAt` when it closes an agent, and the app
    sorts by it, newest first. The star does not change this order. The
    app also sets `updatedAt` in the instant change of a close
    (`PATCH`), so the agent is at the top before the bridge answers.
    On All projects, the Closed tab also keeps this order: the agent
    closed first is at the bottom, and a project title shows again each
    time the project changes. So an old close is never above a new one.
  - a new agent grows into the list. Its row opens from no height, so
    the rows under it move down, its text slides down into place, and
    the row glows blue for a moment. The app knows each agent of the
    first list from the bridge, and only an agent after that list is
    new. The row plays this once, and only when it shows in the 10
    seconds after the app saw the agent, so a later tab switch does not
    play it. With reduced motion, the row shows at once.
    A new agent first has a short ID such as "new1", and then its
    session ID. The row keeps the key of its first ID (`keyOf`), so a
    new ID or a new title changes only the text of the row, on each
    tab. Else a title that comes in the same update as the session ID
    makes the row grow in again, and the list jumps.
  - a conversation view: a click on an agent row opens the conversation
    of that agent in the tab. It shows the prompts, the answers, and one
    short line for each tool call. An edit or a write also shows its
    changed lines, as Claude Code does: the line numbers, red removed
    lines and green added lines, and the count "(+2 -2)". The bridge
    reads them from the `structuredPatch` that Claude Code saves with the
    tool result in the transcript, 200 lines at most for each call.
    Complete in the menu of the three dots marks a worker as completed
    (`complete_worker`, hidden when the agent is done or failed), and
    moves it to the Done tab. The check at the top right closes the
    agent (`close_worker`), and moves it to the Closed tab, so the menu
    has no Close. After a click the view goes back to the list, on the
    Mac and on the phone. Each icon of the menu has the color of the
    text.
    The menu also has Model, Effort and, when the CLI has a profile,
    Profile. Each shows the current choice at its right and its own
    menu. The models are Opus 5.5, Fable 5.1, Sonnet 5.5 or Haiku 5.5.
    The efforts are Low, Medium, High, Xhigh or Max. Each profile shows
    its name and the percent of its week. The card of the Summary tab has
    these menus, and the three dots keep them too. A
    running agent gets the change at once: the app calls `message_worker`
    with "." and the new model, effort or profile, so the agent
    stops its turn and continues on it. Any other agent gets the change
    with its next message, so the change starts no turn. A terminal
    session and a sub-agent have no Model, Effort or Profile. The model
    names are the aliases of `LATEST` in `bridge/main.ts`, so update
    `MODELS` in `src/App.tsx` with it.
    When the open agent closes in another way, for example by voice, the
    view also goes back to the list of the tab that was open. Else the
    conversation of an agent that Grok closed stays open. Open in
    Ghostty opens the session in a Ghostty
    window, where the user can scroll and continue it. The answers
    show as Markdown (`react-markdown` with GitHub tables), with code in
    mono, like Claude Code. A code block wraps its long lines and does
    not scroll sideways. A wide table grows up to 36em and scrolls
    sideways in its box, and the words in a cell do not break. Else, on
    the phone, the columns squeeze and break words such as "Tokens" in
    two. A tap on a quote of an
    answer, such as a draft of a message, copies its text, and the quote
    shows "Copied" for 1.5 s (`Quote` in `src/App.tsx`). A tap on a link
    in the quote and a selection of text do not copy. An answer has no
    dot before it, so that it does not look like a point of a list. With
    Group tool calls on, the tool calls in a row are in one small card, such as "4 tool calls",
    closed. A tap opens the card and shows each call. A tool call with
    pictures stays out of the card, so the pictures show. The card is
    small and quiet (11 px, no border, less contrast), because the tool
    calls matter little. The open list scrolls sideways, and each call
    shows in full, with no "…" at the end. The tool calls, the code and the prompt
    box use JetBrains Mono, the font of Ghostty on the Mac (`--mono` in
    `src/app.css`). A device without the font, such as the phone, uses
    the system mono. The text of
    the messages uses the font of the app: SF Pro on the Mac and the
    iPhone, and Inter on Windows, Android and Linux (`--sans` in
    `src/app.css`, with the file in `public/fonts/`). Apple allows SF Pro
    only on its own systems, and Inter is the free font that is closest to
    it. A computer that has SF Pro installed uses SF Pro. The messages
    are not in JetBrains Mono, because it is harder to read. A click on
    a link opens it: the Mac opens it
    in its default browser (the `open_link` tool of the bridge), and the
    phone opens it in Safari (the default browser on Android). The
    phone does not open it in a browser inside Yonder, because the
    capabilities allow that browser only for yonder.so. The links have
    no `target="_blank"`, which does nothing in the window of Tauri. A
    bridge without `open_link` puts the link on
    the clipboard. A prompt box under the conversation sends a
    message to the agent (`message_worker`): Enter sends, Shift Enter
    makes a new line. A sent
    message shows at the end of the chat at once, a little faded, and
    stays there until the conversation of the agent has it (`sent` in
    `Conversation`). So the next load of the conversation does not
    remove it. A running agent gets a message after its next
    tool call (see Workers), and a message in the queue of the bridge
    when its turn ends. The queued messages of the agent (`w.queue`, also the
    ones that Grok queued) show at the end of the chat with a dotted
    grey edge, without the voice-call and attachment blocks (`Queued` in
    `src/App.tsx`). A message that the user sends while the agent
    works gets the dotted edge at once (`waits` on `UserTurn`), also
    before the bridge queues it, and also when it goes into the current
    turn. It keeps the edge until the agent reads it. Its pictures show
    in the same bubble, over its words, so a message with only pictures
    gets the dotted bubble too. A message with only pictures starts with
    its `<images>` block, and its bubble shows the picture, not the
    words of the block. A tap or a click on the bubble sends only that
    message (Send now, `stop_worker` with `send` and `message`): it
    stops the turn of the agent, and the other queued messages wait for
    the end of the next turn. The stop button and Escape send all of
    them. A long press on the
    phone, or a right-click on the Mac, opens a menu with Send now,
    Edit and Delete. A tap on a picture in the bubble sends the message
    too, so a tap anywhere on the bubble sends it. A message that
    went into the current turn (`waits`) also sends on a tap, as in
    Claude Code: it stops the turn and goes now. Its menu has only Send
    now. Send now stops the turn and sends the queue at once. While
    messages wait in the queue, the stop button
    and Escape do the same as Send now. A second Stop then stops that
    turn too. Its messages stay in the conversation, so the next
    message continues from them. A message that went into the current
    turn (`waits`) counts too (`toSend`), and the messages that go lose
    their dotted edge at once. Else Escape stops the turn and keeps such
    a message back, its bubble keeps the dotted edge, and the user
    presses Escape again. Edit (it takes the message out of the
    queue with `unqueue` and puts its words back in the prompt box; its
    images stay behind), and Delete (it takes the message out of the
    queue with `unqueue` and drops it). If the agent got the message
    while the list still showed it in the queue, Edit and Delete only
    load the list again, with no error "has no queued message". A
    message of the user shows the pictures
    that it attached, and not its `<images>` block. The block still
    goes to the agent, and the agent's Read of a picture that the user
    attached shows no second copy. A copy of that picture at another
    path shows no second copy too: the bridge compares the bytes
    (`printOf`). Else an agent that copies an attached picture to read
    it shows the picture again in its answer. Claude Code joins queued
    messages into one turn, so the bridge removes each block of the
    turn. When the user scrolls the chat
    up, a round button with a down arrow at the bottom right goes back
    to the end, as in Signal. A message of
    the user is a round bubble (20 px corners) with no border on the
    `--hover` color, as in iOS Messages. Its words are at 15 px, as in
    the prompt box, and it has no "›" arrow. Only a question of a past
    call keeps the arrow, because a tap opens it. The pictures of a
    message of the user show at the right,
    apart from its bubble and before it, with 18 px corners, as in iOS
    Messages (`UserTurn`), so they do not make the bubble tall. A sent
    message that is in the queue shows only
    there. A new agent shows its task at once as its first message, until
    the chat has it, and "Yondering…" shows under it. The New agent view
    sends the task, so it was not a sent message of the conversation.
    Only an agent with no result, in its first turn, shows it, so an old
    agent does not show its first task while its chat loads. So the chat
    of a new agent does not show "No conversation yet." with
    "Yondering…" far under it.
    A short chat starts at the bottom, over the message box, as in
    Messages: the chat is only as high as its turns, and the free space
    is over it. A long chat fills the view and scrolls. A drag down in
    the free space also hides the keyboard. While the agent runs, a stop
    button (a square in a circle)
    shows in the title row of the conversation, at the left of the
    three dots (on the phone, at the top right). It calls
    `stop_worker`, and Escape in the box does the same on the Mac, as in
    Claude Code. Its class is `halt`, not `stop`, because the `.stop`
    class of the row stop button gives it a second square under its
    icon. The stop button of a row on the Agents list is another
    action: it completes the agent. A message to a sub-agent does not
    stay in the chat of the sub-agent. Its
    placeholder is "Send a message" for each status, and 14 px on the
    phone (the text stays 16 px, so iOS does not zoom). The prompt box
    of the Mac is the round glass field of the
    phone. On the Mac, the Chat view keeps the focus in the prompt
    box, as in the terminal of Claude Code: the box gets the focus when
    the Chat view opens, and again after each click in the chat. A click
    that selects text, or a click on a picture, a video or a sound, keeps
    its own focus. In the empty box, the left arrow still goes back to
    the list. Type "/" in the prompt box for the slash commands, as in
    Claude Code: the skills and the custom commands of the user, of the
    project and of each enabled plugin (`my-skills:short`), then the
    built-in commands. The up and down arrows select, and Tab or Enter
    completes the name. Enter on a complete name sends it. A built-in
    command such as `/login`, `/cost` or `/model` opens a dialog on the
    screen of Claude Code, and the agent waits. So after the send, the
    app opens the session in Ghostty, where the user uses the dialog.
    In `claude -p`, `/login` says "isn't available", but a background
    session runs the full screen of Claude Code. While the agent runs,
    the view loads again every 3 seconds. It stays at the
    bottom when the user is at the bottom. A change of tab or project
    closes the view. The Mac shows the agent as the phone does. The row
    of the agent has the back button,
    the name in the center as "#6 Open demo folder", and at the right at
    most two actions. Under the name, small and grey, is the project of
    the agent with its icon, so the user sees where the agent works, also
    after a move. A running agent has the stop button and the three
    dots. An agent that is not running and not closed has the white check
    and the three dots. The check marks the agent as done (`close_worker`)
    and goes back. There are only two actions, because more buttons cut
    the name. The three dots hold the model, the effort,
    the permissions, the profile, Tunnel, Listen, Save for later, Open in Ghostty
    on the Mac, Rename and Complete. Tunnel shows when
    the chat has a site: the last localhost address or private address of
    the tunnel in the messages (`urlsOf` in `src/paths.ts`), else the site
    of the agent. On the Mac a localhost site opens in the viewer of the
    apps, as a site of the Canvas tab. The phone opens it as a tap on its
    link, through the tunnel. So the user does not look for the link. It
    has no status dot and no "#7" badge: the card of the Summary tab has
    the status, the model, the effort, the permissions and the profile, and the
    Preview row of the site. A double click on the name, Rename in the three
    dots, or ⌘R, opens a field that renames the agent in place
    (`rename_worker`). The number stays, Enter or a click outside saves
    the name, and Escape cancels. A sub-agent cannot be renamed. The
    field of the name
    and the Find field take the width of their scroll (`fitField`).
    Else WebKit makes them 1 or 2 px narrower than the text and the
    caret, so a caret at the end scrolls the field and cuts the left
    edge of the first letter: "Wireframe" shows as "Nireframe". The row
    of an agent in
    the list renames it in place too: a double click on its name on
    the Mac, or a double tap on the phone, opens the same field
    (`WorkerRow` in `src/App.tsx`). Enter or a click outside saves the
    name through `rename_worker`, and Escape cancels. An empty name or
    the same name saves nothing. So a single click on the name opens
    the agent after 300 ms (`DOUBLE`), when no second click comes. A
    click on the rest of the row still opens the agent at once. The
    row counts the clicks itself, as the double tap of the viewer, so
    the Mac and the phone act the same. ⌘E moves the effort of the agent
    one step up,
    and from the highest effort back to the lowest. A running agent gets
    the new effort one second after the last press, so it stops its turn
    one time. Under the header, the tabs show
    the views of the agent as a segmented control in the center, as on
    the phone (see below). A line under the tabs shows the profile,
    the model, the effort and the permissions as small dropdowns that
    change the agent, the globe of the site of the agent, and on the Mac
    the context, in each view, on the Mac and on the phone. The profile
    shows the usage of its week. On the phone a long choice ends in "…".
    With only the Context view, the tabs hide. A
    thin bar on the bottom edge of the head shows the part of the context
    window in use. Up in the chat, more than 300 px
    from the end, the tabs and the line hide, and the head ends under
    the row of the agent. The bar stays. They show again at the end,
    with the newest output, as the button that goes to the end. So the
    head of the phone is not too tall. On the Mac the line ends with the
    context as a number too, as "162k / 1M · 16%",
    or only the tokens when the window of the model is not known. The
    phone keeps only the bar. A check in WebKit finds the bar in each
    style, also with glass off, where it lies on the line under the head
    (`bun bridge/contextbar-e2e.ts`). On the Mac, the "Session" and the
    "Weekly" stacks of the title bar show in the top bar of an open
    agent, after the traffic lights,
    at the same place as in the title bar, and a click opens the Usage
    section of the settings. The phone keeps the row
    with no usage, because the name of the agent needs the room. The
    buttons of the title bar, of a conversation, of a settings page and
    of the card are glass circles, as on the phone: 28 px in the title
    bar, which keeps the height of the traffic lights, and 32 px in the
    other places. Else, in a narrow Mac window, "Open in" breaks onto two
    lines, and the chat stops with a hard edge under the tabs. Preview
    is in the card, not in the row. The row of the agent, the tabs and the
    message box float over the content, and the content runs under them
    with the blur of the phone (`.convo-blur`). The message box is the
    round glass field of the phone. Enter sends. The Mac has each paper
    clip of the phone: in
    the prompt box of an agent, in its talk bar, and in the new chat. The
    main screen has none, on the phone and on the Mac. On the Mac a paper
    clip opens the file picker of macOS at once (`openAttach`): any file,
    and a picture or a video goes as one. The phone has the camera, the
    photos and the location, so it opens the attach sheet. The round
    blue send button shows on the Mac too when the box has text. Over an
    open agent, the attached pictures are the stack of the phone, above
    the paper clip, because the agent covers their row under the call
    row. Preview is in the card on both. On the Mac, an open agent with
    no call covers the whole window, as
    on the phone (`cover` in src/App.tsx, `.sheet.cover`), so the title
    bar, the update, the call button and the tabs do not crowd its top.
    The traffic
    lights of macOS stay at the top left, so the row of the agent is under
    a strip of 36 px, as high as the title bar, as in the settings. The row
    reaches up over the strip, so the strip and the empty part of the row
    move the window. The row is not on the line of the traffic lights,
    because there the buttons are too close to the top. An update that
    waits does not show over
    the agent: it shows again on the list. During a call, the title bar
    and the call row stay over the agent, so that the user can end the
    call, and the tabs hide. A change of view moves the line with an
    ease-out curve
    and no bounce. The panel does not slide: the content of the new view
    fades in and rises a little, and the points of the summary come in
    one after another. A slide of the panels with the spring is too
    bouncy. The tabs say Summary and Context. The code and this wiki keep
    the old name `chat` and "Chat" for Context. While the agent runs,
    the end of
    the Context tab shows a shiny "Yondering…", as the spinner of Claude
    Code. The shine is the ShinyText of React Bits, as "Listening" in
    the talk view. No bird shows in front of the word. "Yondering…" shows
    only while a turn runs. When the
    turn ended and the agent waits on a background task, such as a wait
    or a Monitor, it says "Monitoring…", and both words show
    ("Yondering… · Monitoring…") when the turn runs beside such a task
    (`monitoring`, see Workers).
    A turn that the user interrupted shows a gray
    "Interrupted" in the place of the marker "[Request interrupted by
    user]" of Claude Code, and the marker does not show on the Chat
    tab. The bridge sets such an agent to waiting, as `stop_worker`
    does: Claude Code can list it as working with an idle process for
    good. Else the app shows "Yondering…". When the safety classifier
    of Anthropic stops a reply, Claude Code writes "No response
    requested." in its place. The bridge shows "Anthropic's safety
    classifier stopped this reply." there, on the Chat and Context tabs
    and as the result (`unstopped` in bridge/main.ts). A new message
    does not help such a task, because the classifier stops each reply
    again, so start a new task. Else the user sees only "No response
    requested.", and can think that the relay stalled. Claude Code also
    writes "No response requested." when a turn ends with no text from
    the model. With no classifier notice, that line does not show on the
    Chat and Context tabs. The result is then the last real reply of the
    agent (`visible` in bridge/main.ts). Most often the cause is Steer: a
    new message stops a turn before its first text, and Claude Code
    writes the line as the reply of that turn. The agent sees the line
    as its own reply, and can say sorry for it again and again. So
    the prompt of each agent (`SPOKEN`) tells it that it did not write
    the line, and that it must not name it. Summary gives a card, and then the points of the summary (see Bridge), in
    15 px text, with no heading, no task and no last answer. Each point
    is a plain line with no dot in front.
    The card (`agent-card`) shows the context in use with a bar, the
    time of the last turn, and the profile, the model, the effort and the
    permission mode as dropdowns (`Dropdown` of src/Settings.tsx: a native glass
    pill with a native menu on iOS 26). The Profile menu shows only when
    that CLI has a profile. Each row is the name and the percent of the
    week, such as "Work · 42%". A profile of another CLI shows the models
    of that CLI, from its default model, at once. The profile comes first,
    and the models follow it. A change works as in the three
    dots: a running agent continues at once on the new value, and any
    other agent gets it with its next message. A terminal session or a
    sub-agent shows its model and effort as text. On the phone the card
    also has the site of the agent (Yonder Preview) with a native glass
    button, and at the bottom the number, the status, the age and the
    project. The bridge has only the time of the last turn (`startedAt`),
    not the sum of all the turns, so the card says "Last turn".
    Until the points are ready, it shows the activity of a running agent,
    or "Summing up…".
    Chat gives the conversation, as close to the terminal of Claude
    Code as possible. Each tool call shows open, as the terminal shows
    it: a dot, the name and the main input, such as `Bash(git status)`,
    and under it the first 3 lines of the result after "⎿" and
    "… +N lines". A Read shows "Read N lines". The dot is green, red for
    an error (with the result in red), and it blinks while the call
    runs. A tap on a call opens its full input and result, as ctrl+o
    does in the terminal. The bridge gives them only on the tap
    (`/tool`), because the app reads the conversation every 3 seconds.
    The thinking of the agent shows as a closed "✻ Thinking…", and a
    tap opens it. Claude Code saves no thinking text for most sessions,
    and then no row shows. A tap on a tab changes
    the view. The app keeps the last view in `localStorage`
    (`convoView`), so the agent opens on the view that the user saw last.
    The prompt box shows under both views. There is no swipe between the
    views, because the user changes the view with the tabs only: a swipe
    to the right from any point in the view goes back to the list.
    A message to a done, failed or closed agent shows the agent as
    running at once, before the bridge answers. The back button and the
    back swipe then keep the tab: the row of the agent shows for a
    moment, then slides out to the left, and the rows under it move up
    (`leaving` in `src/App.tsx`). The whole row slides, and the red
    Delete button of the swipe does not show at its right. The agent
    shows on the Agents tab
    when the user taps that tab. The conversation stays on its tab
    while it is open, because a new panel loads it again and the sent
    message goes away for a moment.
    With the Summaries row of the Settings off, there is no Summary tab,
    and the app does not ask the bridge for a summary. When Chat is the
    only view (no sub-agents), the segmented control hides
    (`.convo-view.solo`), and the chat moves up into its place. The kept
    view (`convoView`) stays, so the agent opens on Summary again when
    the user turns the row on.
  - a third view, "Subagents 3", when the agent started sub-agents with
    the Agent tool. With the word task the view is "Subtasks 3", not
    "Tasks 3", the name of the tab of all the tasks. Each row shows the
    number of the agent and a letter
    (21A, 21B, 21C) in the color of its status, the description of the
    sub-agent, its type and model, and its time. A tap opens the
    conversation of the sub-agent in place of the agent, with Summary,
    Chat and the prompt box. Its header shows its number and letter, and it
    has no Complete, Close or Ghostty button. The back button goes back to
    the agent. A message in the prompt box goes to the sub-agent through
    its agent (see Bridge). The app tells Grok which sub-agent is open,
    so "tell it to ..." goes to 21B. The app does not keep the Agents
    view in `convoView`, because most agents have no sub-agents.
  - the pictures, videos and sounds of an agent in its conversation view,
    under the turn that names them, with the controls of the web view.
    The bridge finds them (`bridge/media.ts`). A message gives each media
    URL and the full path of each media file that exists. A tool result
    gives only cdn.visualsandbox.com URLs, such as the `result.urls` of
    `vsb run`, because a search can name many files. A Read of a picture
    gives that picture. Each one shows one time, at its newest mention,
    usually the final message. A Markdown image shows nothing, because
    the media row shows it. A local file comes from `/media?path=`, which
    serves only the files that a conversation shows. It answers Range
    headers, because WebKit plays a video only with ranges. The view goes
    to the bottom again when a picture or a video loads. A 3D model or a
    design shows only as a link.
    A hex color in the chat or the summary, such as #e5484d or #fff,
    shows a small square of that color before it (`HEX` and
    `rehypeSwatches` in `src/App.tsx`). A short form needs a letter, so
    "#123" stays an issue number.
    The word "ultrathink" asks Claude Code for deeper reasoning on that
    turn: Claude Code tests `/\bultrathink\b/i` on each prompt, also on a
    prompt of Yonder, and adds a note for the model. As in Claude Code,
    each letter of the word has a color of its rainbow, in a message of
    the user (`rainbow` in `src/App.tsx`, `.ultrathink` in `app.css`).
    On the bubble in the accent, the colors mix with the color of its
    text, so that they show on any accent. In the prompt box, a light
    goes over the word again and again, as in the prompt box of Claude
    Code. A textarea cannot color one word, so a mirror of the text lies
    on the field, with the same box and font, and the text of the field
    itself is clear (`Prompt`). The bridge writes "ultra think" and
    "ultra-think" as "ultrathink" (`withContext` in `bridge/main.ts`),
    because speech to text can split the word, and the `task` and
    `message` of Grok keep the word.
    A click or a tap on a picture or a video opens it in the viewer
    (`MediaItem` and `Zoom` in `src/App.tsx`). The viewer fills the whole
    window in black, with a × button at the top right. A video starts
    below the ×, and ends above its controls, so nothing covers it. The
    ×, Escape, or
    a click next to a picture at 1x closes it. A video in the chat does
    not play there: it shows its first frame and a play button, and the
    viewer plays it with the controls of the app (`Player` in
    `src/App.tsx`): back 10 seconds, play and pause, forward 10
    seconds, a bar to seek, the time that is left, and the sound. The
    controls always show. The skip buttons are round arrows with no
    number. The time counts down, such as "−0:28", and it is the only
    number, so it takes less room. On the phone, the buttons are 44 px
    with larger icons, and the bar to seek is not there: a tap on a skip
    button is easier than a drag on a thin bar. The time is at the left
    end and the sound at the right end. Each style of the gallery draws
    the bar with the same rules: sharp corners in Terminal and Omarchy,
    and the font of the style. Space plays and pauses. A
    right-click, or a long press on the phone, opens the menu of the
    app: Play or Pause, Mute or Unmute, Copy Path (Copy Link for a link
    of the web), Save, and Show in Finder for a file of this computer.
    The viewer does not use the controls of WebKit, which fade the video
    in black under the pointer and hide when the pointer leaves. The
    preview asks for the frame at
    0.1 s (`#t=0.1`), because WebKit draws no frame with
    `preload="metadata"`, and the video is black until the user plays
    it. In the viewer, a pinch with two fingers or on the trackpad, or ⌃
    with the scroll wheel, zooms a picture or a video from 1x to 8x. A double click
    or a double tap zooms to 3x at that point, or back to 1x. A drag or a
    scroll moves the zoomed picture. Safari sends a pinch on the trackpad
    as gesture events, and the phone sends touch events too, so the
    gesture events count only when no pinch of two touches runs. The
    pinch of two fingers reads the touch events, because the pointer
    events zoom in Chrome but not on the iPhone. Each pinch on the
    phone writes one "Phone pinch" line to `call.log`, with the counts of
    the touches, pointers and gesture events, until the pinch works on
    the iPhone. Only the main button of a mouse moves the picture. A
    right-click or a ctrl+click opens the menu, which takes the
    pointerup. Else the picture then follows the mouse. A first finger
    clears the earlier fingers, because the long press of the menu also
    takes the pointerup. A video zooms as a picture does, because the
    bar of its controls seeks, not a drag on the video.
    At 1x, a swipe up or down moves the picture and fades the black, as
    in Photos. A swipe of more than 100 px, or a flick, closes the
    viewer, and a shorter swipe puts the picture back. The pictures
    that the user attached to a message open in the same viewer.
    At 1x, a swipe to the right shows the picture before it in the same
    tab (Chat or Context), and a swipe to the left shows the picture
    after it, if there is one. A swipe of more than 50 px, or a flick,
    moves one picture, and a shorter swipe puts the picture back. On the
    trackpad, a swipe to the side with two fingers moves one picture.
    The row is the pictures of that tab in the order of the chat. A
    video and a picture of a message that waits are not in it.
    On a computer, the left and right arrow keys do the same, and the
    next picture starts at 1x.
    On the Mac, the keys also select a picture in the chat of an agent.
    ↓ at the end of the text of the prompt selects the newest picture or
    video. The arrows select the one before or after it, and Enter opens
    it in the viewer. Escape closes the viewer, and the selection is on
    the picture that the viewer showed last. Escape, or ↓ on the last
    picture, goes back to the prompt. `bun bridge/thumbkeys-e2e.ts`
    checks the keys.
    The iPhone plays each video in the player of iOS
    (`AVPlayerViewController`), when the app has the `play_video`
    command (`yonder_play_video` in `QuickLook.swift`): large buttons
    skip 10 seconds back and forward, with play and pause between them,
    the bar, AirPlay and Picture in Picture. The player turns with the
    phone, so a wide video fills the screen on its side. The app behind
    it stays upright. A video of the Mac goes as the bytes of its blob,
    and a video of the web, such as one of Visual Sandbox, goes as its
    URL, which the player streams. The sound plays also when the switch
    of the phone is on silent, but a live call keeps its audio. An older
    app has no `play_video`, so the video plays in the viewer of the
    page.
    The `quick_look` command (`QuickLook.swift`) opens a file in Quick
    Look, the viewer of iOS: the page sends the bytes of its blob, the
    command writes them to tmp/look, and the file goes when the viewer
    closes. A picture opens in the viewer of the page, not in Quick
    Look, because Quick Look has no swipe to close and its Done button
    is hard to see.
    A ↓ button left of the × saves the picture or the video that the
    viewer shows. On a computer, the bridge copies it to the Downloads
    folder (`POST /save`), with " 2" after the name when a file of that
    name is there, and the ↓ turns to a tick. A URL comes through the
    bridge, because Visual Sandbox gives no CORS headers. On the phone,
    the ↓ opens the share sheet, with Save Image, and Quick Look when the
    share sheet fails. `/media` also serves a URL that a conversation
    shows, so the phone gets its bytes. Android has no share sheet in its
    web view, so the ↓ does nothing there.
    A PDF that a message names, by its full path or by a link, shows as a
    card with its name (`PdfCard` in `src/App.tsx`, the kind `pdf` of
    `bridge/media.ts`). The card loads no bytes until a tap. On the
    iPhone, a tap opens the PDF in Quick Look (`quick_look`), and its
    share button saves it to Files. Another phone opens the share sheet.
    On a computer, a tap opens the PDF (`POST /save?open`): a PDF of
    this computer where it is, and a PDF of another computer as a copy
    in the Downloads folder. `/save` opens only a PDF, because `open`
    also starts an app or a script. So a PDF that an agent makes gets
    onto the phone.
  - the attached images under the call button, 88 px high with their own
    shape. A small × at the top right of each image removes it. A click
    on an image opens it in the viewer of the chat, where a swipe or an
    arrow key shows the other attached pictures. A hold of more than
    0.35 s shows the image large over the dimmed screen until the finger
    or the button lifts (`.peek`), with a light tap on the phone. The
    images stay in one row with the
    gutter of the call button, and the row scrolls left and right. On
    the phone, the images are a
    stack at the bottom left, opposite the + button and at its height:
    the newest image on top, and at most two more under it, turned a
    little and higher, so that their tops show above it, as a stack of
    files in the Dock of the Mac. Each is 50 by 66 px with a white edge and round corners. The top
    image turns 6 degrees to the left. A new image pops in with a spring
    of Motion, and the images under it spring to their new places. A tap
    opens the top image, and the × on its top right corner removes it.
    The images under it have no ×. An open conversation keeps the row at the
    top, because its prompt box is at the bottom. A send takes the
    images off the screen at
    once, as it shows the message at once: each image flies up to the
    right and fades. They come back when the bridge does not take the
    message. A
    dashed blue line shows around the window while the user drags a file
    over it.
- An error shows as a toast (`Toast` in `src/App.tsx`): a liquid glass
  pill at the top of the window, over the screen. It goes away by
  itself after 3 to 10 seconds (longer for a longer text), with a tap,
  or with a swipe up or to the side. A finger moves the toast, and a
  short drag springs it back. The timer stops while a finger holds it.
  A drag down only stretches it a little. The text has no red, and the
  toast has no ×.
- The actions of the user are optimistic: Close, Complete, Delete, Stop, the
  star of an agent or a project, Remove folder and Close Completed change the
  screen at once, before the bridge answers. The app keeps the change
  (`pending` in `src/App.tsx`) in each poll until the bridge answers, then
  reads the agents again. A failed call puts the agent back.
- Each tap, click and open feels instant, and this is a rule for all
  work (`CLAUDE.md`).
  These also change the screen at once: Send now, Edit and Delete
  of a queued message (`act` with a `queue` patch), Stop, a change of
  the model, the effort, the mode or the profile of a running agent, each row of the
  Settings (Preview, Model, Effort, Permissions, Steer, Summaries,
  Claude Code, the CLIs), Remove on the Tunnel tab, and Open Folder,
  the folder picker of the phone and New Project. A failed save of a
  setting loads the true value again. An agent that the user opens
  again shows its last chat at once (`turnsOf`), while the new chat
  loads. Face lock, pairing, sign-in and the tunnel switch still wait,
  because each needs a yes or a check first.
- Grok can also rename and close agents with its tools.

## Talking to Yonder

- **At launch:** The app never starts a call by itself, also after a
  rebuild. The user starts each call with the call button, the key of
  the call (see Keys) or the menu bar icon, as on the phone. Else Grok
  greets the user by voice after each rebuild.
- **Keys:** a tap of a key alone, or a shortcut, in any app, does one of
  three things. The Keys section of the settings (Mac only) has one row
  for each thing, with one button that shows its key, such as Right ⌘.
  These rows are under Anywhere. Under In Yonder are the shortcuts of the
  window, with a button each too: New chat (⌘T), New project (⌘N), Open
  folder (⌘O), Talk (⇧⌘D), Effort (⌘E), Switch project (⌘D), All
  projects (⌘A; in a field with text it selects all), Rename
  agent (⌘R), Find (⌘F), Close agent (⌘↩), Settings (⌘S), Back (⌘←) and
  Forward (⌘→).
  - Switch project (⌘D, `projectKey`) works as ⌘Tab of the Mac in the
    lists: a hold of ⌘ shows the icons of All projects, Yonder and the
    starred projects in a row in the middle of the window, the last used
    first, as ⌘Tab (`recentProjects` in localStorage). Each ⌘D or arrow
    moves one, and the release of ⌘ opens that project. A quick ⌘D goes
    back to the project before, with no switcher. The rail has the same
    order, and its icons have no names. Escape closes it. It works in an
    open agent too, so Talk is ⇧⌘D, not ⌘D.
  - Find (⌘F) selects the search of the view: the Settings, the Projects
    view, the Canvas tab or the Search tab. On the Agents, Done, Saved and
    Closed tabs it goes to the Search tab, which finds an agent in all
    the projects. In an open agent, a field in place of the name finds
    words in the chat: each match gets a mark, the field shows "2/14",
    Enter goes to the next match, ⇧Enter to the match before, and Escape
    closes the field. Only the loaded turns match, not the older turns
    that load on a scroll up. ⌘F works in a text field too.
  - `config.json` holds them as `newChatKey`, `newProjectKey`,
    `openFolderKey`, `talkKey`, `effortKey`, `renameKey`, `findKey`,
    `closeKey`, `settingsKey`, `backKey` and `forwardKey`, with the names of a shortcut below, but
    no modifier key alone. `hit` in `src/Settings.tsx` matches a key
    down by the place of the key or by its letter, so ⌘W stays the key
    with W on it on another layout. One shortcut does one thing.
  - New chat, New project and Open folder are items of the menu, so
    `set_menu_keys` of `src-tauri/src/main.rs` changes their shortcuts.
    An older Mac app has no `set_menu_keys`, and its menu keeps ⌘T, ⌘N
    and ⌘O. The tabs (⌘1 to ⌘5), the zoom (⌘+, ⌘− and ⌘0) and the
    arrows stay fixed.
  - A click on the button records the next key: a modifier key that goes
    up alone, such as Left ⌃, or a shortcut, such as ⌃⌥K or F13. Delete
    alone turns the thing off, and Escape or a click stops the recording.
    Any key can be set, in the settings and in `config.json`.
  - `config.json` holds the keys: `newAgentKey` and `voiceNoteKey`. A
    name is `right-command`, `right-option`, `right-shift`,
    `right-control`, `left-command` and the other left keys for a tap
    alone, a shortcut such as `ctrl+option+k`, `cmd+shift+space` or
    `f13`, or `off`. The modifiers are `ctrl`, `option` (or `alt`),
    `shift` and `cmd`. A key that types, such as `k` or `space`, needs a
    modifier, and only F1 to F20 go alone. A name that Yonder does not
    know is off, and `app.log` says so. A change by hand applies when the
    settings or an agent opens. Keys that an older version kept in
    `localStorage` go to `config.json` at the first load.
  - The tap only listens, so the front app gets a shortcut too. A ⌘
    shortcut of the menu of Yonder, such as ⌘N, does its menu item when
    the button records it, so write it in `config.json`.
  - A name is read by `parse_key` of `src-tauri/src/main.rs`, so a new
    name needs a new build of the Mac app. An older Mac app reads only
    the three right keys, and any other name is off.
  - New agent (Right ⌘ by default) opens the notch (see Notch), and a
    second tap sends the words. During a call it ends the call, and the
    notch opens when the call has ended, as the + button does.
  - Escape closes an open notch and drops its words, as the X does. It
    also stops a voice note.
  - Voice note (off by default) listens, and a second tap pastes
    the words where you were (see Voice note). It does nothing during a
    call. With the window of Yonder in front, it is the talk bar of the
    open agent, as ⇧⌘D, and a second tap sends, as Enter (see Voice
    note).
  - Call (Off by default) starts the voice call or ends it. While the call
    is on, you and Yonder discuss things like on a phone call.
  - One key does one thing: a key that one thing gets goes to Off for
    the others. Keys from before the voice note that give right ⌥ to
    another thing set Voice note to Off. The page keeps a copy of the keys in `localStorage` (`keys`) and
    gives them to `set_keys` of `src-tauri/src/main.rs`.
  - The key codes and the flag bits are in `KEYS` of `main.rs`, from
    `Events.h` of Carbon and `IOLLEvent.h`. Without the bit of the right
    key, the left key held down hides the release of the right one.
  - `src-tauri/src/main.rs` reads the keys with a CGEventTap, which
    needs Input Monitoring. Without it, macOS creates the tap but never turns
  it on, so the app checks `CGPreflightListenEventAccess` first, and it
  turns the tap on again each second. The state goes to
  `~/.config/yonder/app.log`.
- **Menu bar:** the Yonder icon is the orb: two wobbly rings, a little
  off from each other, as on the talk button (`src/Orb.tsx`). It is a
  template icon, so macOS makes it black or white for the menu bar. It
  turns red while a call is live. A click starts or ends the call.
  Escape also ends a live call, on any screen. The PNGs of 64 px come
  from the `ring` function of
  `src/Orb.tsx` at time 0, with a stroke of 8 and the outer ring moved
  12 units up and right.
- **The notch of a call:** while a call of the Mac is live, the notch
  has two small sides: the orb at the left and the time of the call at
  the right. A click goes through it to the menu bar. It is small,
  because it only shows that a call is on.
  - The time starts when the call is live (`connectedAt` of
    `src/voice.ts`, the `since` of `set_call_live`), as the call button
    counts. While the call connects, the notch shows no time. Else the
    time of the notch does not match the call button.
  - The window sends the loudness of the call (`call_level`, the louder
    of the microphone and the voice of Yonder, through `size` of
    `src/Levels.tsx`) ten times a second, so the orb moves with both
    voices. In a silence it breathes a little (`rest`).
  - The app writes `call <ms>` (0 while it connects), `level <0 to 1>`
    and `end` to the stdin of the helper (see Wake word).
  - It is a panel of its own (`callPanel`), because a panel that once
    ignored the mouse keeps the clicks on its clear parts after it stops
    ignoring it.
- **Locked screen:** while a call is live, the app runs `caffeinate -i`,
  so the Mac does not go to sleep when the screen locks, and the call
  stays on. The display still sleeps. When the call ends, or the app
  quits, caffeinate stops.
  A call on the phone keeps the Mac awake too: the phone sends
  `POST /awake` to the bridge when the call starts and each minute
  after. Each ping runs `caffeinate -i -t 120`,
  so the Mac sleeps again 2 minutes after a call on the phone ends or
  drops.
- **Wake word:** Off, with no switch in the settings. The app sends
  `set_wake` off to the
  Mac app and `wake(false)` to the Android app at each start (`wake` in
  `src/App.tsx`), and the code of the helper stays. The Mac keeps the
  microphone of dictation open for 5 minutes after a dictation (see
  Dictation), and "Hey Yonder" would hear "Yonder" in the words. With the
  wake word on, "Hey Yonder" opens the notch of a new agent on the Mac
  (see Notch), and on Android it starts the call.
  - `src-tauri/wake/main.swift` is a helper that the build compiles
    with `swiftc` (`build.rs`) into `src-tauri/binaries/`. Tauri puts it
    in the bundle as `Contents/MacOS/yonder-wake`. It uses the speech recognition of Apple
    on the Mac only (`requiresOnDeviceRecognition`), so no audio leaves
    the Mac. For each transcript with "hey yonder" in it, it opens the
    notch and prints `wake`, which goes to `app.log`. "Yonder" alone
    does not wake it, else talk to an agent on a phone near the Mac
    opens the notch.
  - `src-tauri/src/main.rs` runs the helper during a call, and while the
    switch is on or a key opens the notch (see Keys). With the switch on
    and no call, the helper gets `--wake` and listens for "Hey Yonder".
    Else it has no microphone until the notch opens, and it closes the
    microphone when the notch closes. During a call it only shows the
    notch of the call. A change between the two kinds starts the helper
    again, and the kill waits for its end, so the microphone is closed
    before the call or the dictation of the window opens it. The app
    writes `open` (the key of the notch), `escape`, `call` and `end` to
    its stdin.
    A helper that stopped by itself starts again at the next tap of the
    key of the notch.
  - The microphone stays open while the helper listens for "Hey Yonder",
    so macOS shows the orange microphone dot all the time. No API turns
    the dot off.
  - With Default in the Microphone row (see Microphone), the helper
    listens for "Hey Yonder" on the built-in microphone of the
    Mac (`chosenMic` in `wake/main.swift`), also when AirPods are the
    input of macOS. AirPods with an open microphone play all sound in the
    low quality of a phone call, and the helper listens all the time. The
    dictation of the notch in this mode uses the same built-in
    microphone. A Mac with no built-in microphone uses the input of
    macOS. So AirPods keep their normal sound.
  - The helper records with a capture session (`AVCaptureSession`) on
    that one device (`startMic`), not with the input node of
    `AVAudioEngine`. On macOS that node records from an aggregate of the
    input and the output of macOS, and the engine puts the aggregate
    back after each change of its device. So the engine takes the
    microphone of the AirPods again, and the AirPods stay in the low
    quality, also with the built-in microphone chosen.
  - The app stops the helper when a call starts to connect, and waits for
    it to stop before the call opens the microphone. A silent MacBook
    microphone has another cause (see Echo cancellation below).
  - macOS asks for the Speech Recognition permission of Yonder when the
    switch first turns on, because Yonder starts the helper. So
    `NSSpeechRecognitionUsageDescription` is in `src-tauri/Info.plist`.
    Without it, macOS kills the helper (a TCC crash).
  - The helper starts a new recognition task after each end, each notch,
    and each minute, because a task ends after silence. No task runs
    while the notch listens. If the helper
    stops by itself, it starts again after the next call or a new turn
    of the switch. Its errors go to `~/.config/yonder/app.log`.
  - The switch needs a rebuild of the Mac app the first time.
  - Android has "Hey Yonder" too. `Wake.kt` (next to
    `MainActivity.kt`) uses the `SpeechRecognizer` of the phone, the one
    on the phone when it has one (Android 12 and later), so no audio
    leaves the phone. It listens only while the app is on the screen,
    the switch is on, and no call or dictation has the microphone
    (`YonderAndroid.wake` and `YonderAndroid.busy`, called from
    `src/App.tsx` and `src/dictate.ts`). For each "yonder" in the words,
    it sends the window event `yonder-wake`, and the window starts a
    call. The settings show the switch only on an Android app that has
    `wake`, so it needs `bun run install-android` once. The screen-off
    case needs a foreground service with a notification, and is not
    built. Some phones play a short tone at each new recognition.
- **Notch:** "Hey Yonder" on the Mac opens a black shape that grows out
  of the notch of the MacBook, as the Dynamic Island of the iPhone. You
  talk, and the words start a new agent. The key of the notch
  (right ⌘ by default, see Keys) opens it too, and a second tap sends.
  The call still starts with the key of the call, the menu bar icon and
  the call button.
  - The small orb of the talk view (`src/Orb.tsx`, with no dots) is at
    the left of the notch, and an X is at its right. The words show
    under them, in two lines at most. The newest line is at the bottom,
    and the shape is as tall as the words.
  - The start chime of the dictation plays when the notch opens. A send
    plays the whoosh of a new agent (see Send sound), and the X, the
    close with no words and a send with no words play the end chime.
    Else a send sounds as if the notch turns on and off at once.
    `resources` of `tauri.conf.json` puts `public/whoosh.m4a` in
    `Contents/Resources` of the app, where the helper finds it
    (`Bundle.main`).
  - A click on the notch, or "send it" at the end of the words, sends
    the words. "Send it" sends only when no new word comes for 0.7 s, so
    "send it to the server" inside a task does not send. The send
    removes "send it" from the task. The X drops the words. With no
    words in 8 s, the notch closes, because another "yonder" woke it.
  - The send closes the notch at once (see Instant actions in
    `CLAUDE.md`). Then the helper gets the last text and calls
    `start_worker` on `/mcp` of the bridge with no project. So the
    bridge picks the project from the task, as the New agent view of
    All projects does. A failure opens the notch again for 6 s, with
    the reason in red.
  - The notch is an `NSPanel` with `nonactivatingPanel`, at the level
    `mainMenu + 3` over the menu bar, on each Space and over apps in
    full screen. A click on it does not make Yonder the active app, so
    the app of the user keeps the keyboard. The helper is an app with
    no Dock icon (`accessory`).
  - The panel goes on the active screen (`NSScreen.main`, the screen of
    the window with the keyboard), over its notch, or under the middle
    of its menu bar on a screen with no notch. Else, with the work on a
    second monitor, the notch shows on the MacBook. The small notch of a
    call stays on the screen where the call started. On a 16 inch
    MacBook Pro the notch is 185 by 32 points, and the open notch is
    440 points wide.
  - On a screen with no notch, such as an external monitor, the shape
    grows out of nothing and shrinks back into nothing, not into a
    black bar of the size of a notch. On a MacBook the shape grows out
    of the notch and goes
    back into it. The big notch, the notch of a call and the voice note
    all do this (`closedSize` in `Notch`).
  - Nothing of the shape fades. macOS fades the panel out in about
    0.1 s at `orderOut`, 0.45 s after the close starts. By then the shape
    is gone, or on a MacBook it is behind the notch: the closed shape
    has the size of the notch itself, also the curves of its top
    corners. So the shape seems to go into the top of the screen. Else
    the curves stay out on the menu bar of the MacBook and fade with the
    panel.
  - A small shape keeps the look of the notch: `NotchShape` makes its
    curves smaller with the shape, so they never cross. The panel is 20
    points wider than the shape, because the spring opens the shape up
    to 17 points wider for a moment. Else the edge of the panel cuts
    the curves of the top corners in that moment.
  - The helper has the microphone already, so the sound goes to the
    dictation with no gap after "Hey Yonder". It gives the sound to
    `yonder-dictate` (see Dictation), which is next to it in
    `Contents/MacOS`: PCM16 at 16 kHz on stdin, and JSON lines with the
    text on stdout. So the words are as good as in the talk view. The
    words before the notch opens are lost: say "Hey Yonder", and then
    the task.
  - A call that starts, or a dictation in the window, stops the helper.
    The notch then goes, with its words.
  - `yonder-wake --demo` shows the open notch for 30 s with sample words
    and no microphone, to see its look.
  - Not built yet: a click on the menu bar icon to send (it starts the
    call), and the words in the same breath as "Hey Yonder" (they need
    the sound from before the wake word).
- **Voice note:** tap right ⌥ (see Keys) in any app, talk, and tap it
  again. The words go into the text field where the cursor was, with a
  space after them for the next note.
  - It is a small notch, as the notch of a call: the orb at its left,
    and at its right the icon of the app where the words go and seven
    bars that scroll with the voice. The words do not show, and it has
    no X. A click on the notch pastes too. It listens until the second
    tap, with no limit of 8 s. "Send it" does nothing in it. A failure,
    such as "Copied", shows in the big notch.
  - The bars: a step each 1/15 s takes the loudest moment, and each bar
    chases its height.
    `yonder-wake --demo-note` shows it with a fake voice.
  - The window in front at the first tap is the destination: the app
    and its focused window, through Accessibility, because a second
    window of the same app is the usual interruption. If another window
    is in front when the words are ready, that window comes back first
    (raise, `kAXFrontmostAttribute`, `activate`), and the paste waits
    up to 1.2 s for it. Else the words stay on the clipboard, and the
    notch says "Copied. Press ⌘V to paste."
  - The paste borrows the clipboard: it puts the words on it, posts ⌘V
    at the HID tap, and puts back all of the old clipboard after
    0.75 s, also an image. A paste is faster than typed keys, and it
    gives the right letters on each keyboard layout.
  - The key of the notch does nothing during a voice note, and the key
    of the voice note does nothing while the notch listens for a new
    agent.
  - The key acts at its press, not at the release of a tap, and it can
    be held: press right ⌥, talk, and let go. A
    release after 0.5 s (`HOLD`) ends what that press started, and the
    words go. A tap still starts, and the next press ends. Another key,
    modifier or click while it is down drops what its press started,
    with no end sound, because then it was a shortcut such as ⌥E.
    `watch_keys` of `src-tauri/src/main.rs`
    gives Down, Tap, Hold or Cut (`Edge`), and `note_key` sends
    `talk-key` at the press, then `talk-key-up` or `talk-key-cut` to
    the window (`keyPress` and `useDictation` in `src/App.tsx`), or
    `note`, then `note-up` or `note-cut` to the helper (`releaseNote`
    and `cutNote` in `wake/main.swift`). The key of the notch and the
    key of the call still act at the release of a tap. A release while
    the microphone of the window still opens sends as soon as it is on.
  - In Yonder the key is the talk bar: with the window in front,
    `tap_key` of `src-tauri/src/main.rs` sends `talk-key` to the page in
    place of the voice note. In an agent, the tap opens the talk bar, as
    ⌘D does, and a second tap sends, as Enter does, also in the big talk
    view of a new agent. With no agent open, the press starts a new
    agent in the talk view, as the + button does, and a hold sends at
    the release. A voice note or a notch that listens (`HELPER_MIC`,
    from "mic on" and "mic off" of the helper) still gets the tap, so a
    note from another app still ends with a tap in Yonder. An older Mac
    app starts a voice note in Yonder, which pastes into the focused
    field of Yonder.
  - The tap also works in the New agent view with the text box (New
    chat): it opens the talk view, as the microphone of the box does. In
    a talk view that does not listen, after Escape or a failure, the tap
    starts the dictation again, as a tap on the orb. The Mac app logs
    each tap of the key in `app.log` with two values: the window in
    front, and the microphone of the helper. The tap goes to the window
    only when the first is true and the second is false.
  - The code is `src-tauri/wake/Note.swift` (`Destination`, `Paste`,
    `deliver`) and the note mode of `Notch` in `wake/main.swift`. The
    app writes `note` to the stdin of the helper. `build.rs` compiles
    each `.swift` file of a helper folder.
  - It needs the Accessibility permission, for the questions to the
    other app and for the ⌘V. Yonder starts the helper, so the permission
    of Yonder should apply, as for the microphone. This is not tested
    yet. Without the permission, the first tap opens the request of
    macOS, and the notch says "Allow Yonder in Accessibility, then tap
    again."
  - The text comes from `yonder-dictate`, as in the notch.
  - Not built: the small bars under the text cursor (the notch shows the
    words instead), the pause of Spotify and Music while it listens (it
    needs the Automation permission), and a filter for words that a
    model makes up in a silence. When `yonder-dictate` gives no text,
    nothing is pasted.
- **Microphone:** the Voice section of the settings of the Mac has a Microphone row. Default
  follows the input of macOS. The choice stays in `localStorage` (`mic`),
  and `getMic` in `src/voice.ts` asks for it as a wish, so the default
  microphone takes its place when the chosen one is gone. The names show
  only after Yonder got the microphone once. The choice helps when one
  microphone sends almost silence in the calls (see Echo cancellation).
  - The choice is for all of Yonder on the Mac: the
    calls, the dictation of the window, the notch, the voice note and
    "Hey Yonder". The window keeps the name of the microphone too
    (`micName`), and `set_audio` gives it to the helper as `--mic`,
    because the helper knows the devices of macOS by name and not by the
    id of WebKit. A change of the name starts the helper again. So the
    microphone of the Mac keeps AirPods in high quality: AirPods with an
    open microphone play all sound in the low quality of a phone call.
  - Under the Microphone row is the switch Pause music (`pauseMusic`, on
    by default). See "Music pauses while Yonder listens".
- **How Yonder talks.** The rules for how the voice talks, in Markdown,
  such as "one or two short sentences" and "never read file paths
  aloud", are the file `~/.config/yonder/talk.md` of the bridge. The
  bridge writes the default, `bridge/talk.md`, when the file is missing.
  The settings do not show it. The voice changes it itself when the user
  asks for another way of talking ("talk shorter", "stop saying great"):
  it calls `change_talk` with a rule to add, or words of a rule to take
  out, and follows the change at once. Each call reads the file (GET
  `/talk`, which the phone reaches through the relay): the app puts it
  in the section "Voice & Communication Style" of the prompt for Grok,
  OpenAI and ElevenLabs (`loadTalk` and `instructions` in
  `src/App.tsx`), and the bridge adds it to the prompt of the brain of a
  Claude call (`brainArgs` in `bridge/brain.ts`). Any other request
  about how the voice acts still goes to an agent in "yonder". Only how
  the voice talks is in the file. The rules that keep the agents safe
  stay in the code, such as the check of each close in `runTool`, so a
  change cannot remove them.
- **Walkie-talkie:** a switch in the Voice section of the settings
  (`walkieTalkie` in `config.json`, off by default), with a Speech
  model row under it (`speechModel` in `config.json`,
  `bridge/settings/voice.json`). An agent turns it on or off with
  `"walkieTalkie": true` or `false` in `~/.config/yonder/config.json`,
  or with `POST /settings` and `{"key": "walkieTalkie", "value": true}`.
  The app reads it at the start, when the Settings close and when an
  agent opens. It is not in `phone.json`, because the Mac app does not
  read that file. With it on, a chat with
  an agent is voice both ways: the user sends a voice note, and the
  brief of the answer plays aloud when the turn of the agent ends, as
  the Listen item does. The speech to text model runs on the computer.
  - The speech model is a whisper.cpp model file on the computer, such
    as `ggml-large-v3-turbo.bin`. The voice note goes to
    `/dictate` with `stt=whisper` (`stt(true)` in `src/bridge.ts`), also
    from the phone, which then does not use its own recognizer. The
    bridge collects the parts and runs `whisper-cli -np -nt -m <model>`
    on a WAV file at the end (`whisper` in `bridge/dictate.ts`). So the
    words show only at the end, as with Voxtype. On a recent Apple silicon Mac a
    short note took about 0.6 s.
  - An empty Speech model takes a model that another app downloaded
    (`MODELS` of `bridge/recording.ts`). With no model or no
    `whisper-cli`, the speech model of the computer makes the text, so
    the switch never stops a dictation. A path with no file gives the
    error "No speech model at <path>".
  - The voice calls keep their own speech model (`stt()` with no
    argument), because whisper gives no words while the user talks, and
    a call needs them to stop the speech of Yonder.
  - The app holds the audio from the voice note (`holdAudio`) until the
    answer plays, because iOS starts a sound only near a tap. A new
    voice note, a call, another agent or the back button drops it.
  - The reply is not the brief of Listen. The agent answers the last
    message as "I", to "you", in 1 to 4 sentences (`WALKIE` in
    `bridge/main.ts`, `walkie` of `/summary`). Haiku writes it with the
    summary, only while the switch is on. A summary from before the switch
    has no reply, so the brief plays. Listen in the three dots still
    speaks the brief. The first person makes it feel like a talk with
    the agent.
  - After the reply, a Replay button floats over the message box. A tap
    plays the reply again. It goes when the user talks, sends a message or
    opens another agent.
  - The answer speaks with `/speak`, as Listen: it needs `XAI_API_KEY`
    on the computer, or a staff account.
  - `bun bridge/dictate-check.ts` checks the whisper path when a model
    and `whisper-cli` are on the Mac.
- **Dictation:** the big talk button (`Talk` in `src/App.tsx`), on the
  Mac and on the phone, when no call is live. It is in the New agent
  view of the + button, and the microphone button at the right of the
  prompt box of an agent opens it. On the Mac, ⌘D in an open agent opens
  it too, when no call is live.
  The dictation starts when the view opens. A tap on the orb or Enter sends the words, and Escape drops
  them. `Talk` uses `useDictation`. A back or a call while the
  microphone starts also stops it.
  - The phone makes the words itself
    (`dictateOnPhone` in `src/dictate.ts`). The iPhone uses the speech
    recognizer of iOS (`SFSpeechRecognizer`, `Dictate.swift`, the
    `dictation` command of `ios/src/lib.rs`), on the iPhone when iOS has
    the model for the language. Android uses its `SpeechRecognizer`
    (`Dictation.kt`, `YonderAndroid.dictation`), the one on the phone
    when the phone has one (Android 12 and later), as "Hey Yonder" does.
    So the sound does not go to the computer. Else a Windows bridge
    fails with "Press Windows + H to dictate on Windows."
  - An iPhone with iOS 26 or later uses `SpeechAnalyzer`
    with `SpeechTranscriber`, as the Mac does. It works only on the
    iPhone, so iOS asks only for the microphone. The prompt for speech
    recognition says that the speech goes to Apple, also when it stays
    on the iPhone. The first dictation in a language
    waits while iOS downloads the model. An older iPhone, or a language
    with no model, uses `SFSpeechRecognizer` and its prompt.
    The first note of a dictation in `call.log` names the recognizer.
  - The page asks the phone for the words and the level of the orb each
    50 ms (`start`, `poll`, `stop`, `cancel`). A task of the recognizer
    ends after a pause, so a new one starts, and its words go after the
    old ones, as in the fast words of `yonder-dictate`. On the iPhone
    the new request gets the sound at once, so no word is lost between
    two tasks. After the stop, the recognizer gets 1.5 s for the last
    words. iOS adds the punctuation. Android has none.
  - From iOS 18 a task of the recognizer also goes on after a pause, but
    its words start again. The result at the end of each utterance has
    metadata (`speechRecognitionMetadata`), and it is not final. The
    next results have only the new words. So `Dictate.swift` keeps the
    words of each utterance at that result. The last result of the task
    repeats the last utterance with the same start
    (`speechStartTimestamp`), and it does not go in again. Else a long
    dictation with pauses loses all but its last utterance. macOS 26
    does the same. A recognizer that gives no metadata before its end,
    as on iOS 17, keeps the words at the end of each task. The fast
    words of `yonder-dictate` have the same fix.
  - The iPhone gives the loudest 20 ms of the sound since the last poll
    (`db`), and the page makes the bar of the orb from it with `QUIET`
    and `LOUD` of `src/dictate.ts`, as on the Mac. So a new tune of the
    orb goes over the air. The level of the whole buffer of the tap,
    about 100 ms, is quieter than the 20 ms frames of the Mac, and with
    it the orb barely moves. `call.log` gets the "first voice" (a bar of 0.25 after
    the 700 ms of the chime), the size of the first buffer, the loudest
    `db`, and the longest time between two polls.
  - On the Mac the first sound comes in about 250 ms. Each dictation, on the Mac and
    on the phone, also writes to `call.log` the first frame of the orb,
    the frame where the orb gets the voice, and at the end the count of
    frames and the longest gap between two (`watchOrb` in
    `src/dictate.ts`). A late "the orb gets the voice" after an early
    "first voice" tells that the page drew late, not the microphone.
  - A voice on the MacBook microphone can stay under -45 dBFS, so a
    fixed scale from -50 to -30 dBFS barely moves the orb. So the bottom
    of the scale
    follows the silence of the room (`scale` in `src/dictate.ts`): it
    falls at once to a quieter frame and rises 1 dB each second. The bar
    starts 6 dB over that floor and is full 20 dB over the start, and it
    never starts higher than -50 dBFS. Each end writes the floor and the
    loudest dBFS of each 500 ms to `call.log` ("levels").
  - On the iPhone the page plays no sound during the dictation and does
    not touch `navigator.audioSession`. The start chime plays in the
    audio engine of `Dictate.swift`. Else the microphone of iOS gives
    no sound. The engine starts again after a change of
    the audio or the end of an interruption. Each poll gives the events
    of the audio (`notes`: the first buffer, an interruption, a restart),
    and the page writes them to `call.log`. The end of a dictation lets
    go of the audio session of iOS.
  - A start whose microphone reads 0 Hz tries again with a new audio
    engine each 0.1 s, for up to 1 s. The microphone can read 0 Hz while
    the route changes, as when AirPods change to their microphone. If
    it still fails, the start lets go of the audio session, so the music
    of another app plays again. The error then names the cause when iOS
    refused the session ("the microphone is busy: …").
  - The iPhone asks one time for the speech recognition
    (`NSSpeechRecognitionUsageDescription` in `ios/Info.ios.plist`).
    Android asks for the microphone through the web view, as at the first
    call, when it does not have it yet. The Android manifest has a query
    for `android.speech.RecognitionService`, because from Android 11 an
    app sees the recognizer only with it.
  - The bridge still makes the words on the Mac, and on the phone when
    the user chose Parakeet (a model of the Mac), Soniox or
    Deepgram (only the bridge has their keys). An older app with no
    `dictation` also uses the bridge. The microphone that waits for a dictation
    (`warmMic`) and the sound for an offline Mac (see the outbox) are
    only for that path now. The Claude call (`src/brain.ts`) still
    hears the user through the bridge.
  - The button is the orb (`src/Orb.tsx`), our own design in plain
    SVG, with no canvas. It is two thick wobbly rings, as a circle drawn
    by hand (like the logo of Headspace): an ink ring inside and a red
    ring (`--red`) with a red glow outside. In dark mode the ink ring is
    `--text`. In light mode the orb is a neon light: a white ink ring
    with a pink rim, a hot pink ring (`#ff2d55`) with a wide glow of
    three blurs, and a soft pink wash behind them. Both rings follow
    the same shape, but the red ring drifts a little in its own way, so
    the rings overlap and part as in a print that is a little off. The
    level of the microphone (through the gate of `size` in
    `src/Levels.tsx`, then a square root) makes the rings bounce and
    wobble more, through two springs of Motion (`useSpring`) with a low
    damping, so the rings move smoothly and overshoot a little. The red
    spring is softer, so the red ring follows the voice a little late.
    Without a voice they move slowly. Small dots of light (a radius of
    0.4 to 1.2) leave the ring at random places, drift slowly out a
    little to the side, and fade (a sine of their age). Each dot drifts
    a little at random on each frame. Without a voice about two come
    each second. A voice sprinkles out up to about 40 more each second,
    and it multiplies the speed and the shake of all dots by up to four,
    as a wind. One dot in three has the color of the ink ring, the
    others are red. The dots are SVG circles in a group under the rings.
    Each glow is a CSS `blur()` on an SVG of its own: the orb is a stack
    of five SVGs (`far`, `mid`, `near`, `rim` and `sharp`), and each one
    has copies of the rings. Only `sharp` has the dots, and a thin pink
    stroke gives the white dots their rim in light mode. The dots fly
    over the whole box, so a blurred layer with dots draws and blurs its
    whole box again on each frame. On a Galaxy S9 a frame takes about
    57 ms with the dots in `near` and `rim`, and about 27 ms without.
    `app.css` gives each layer its blur and hides the parts that a theme
    does not use. The SVGs have `will-change: transform`, so WebKit
    gives each blur to the GPU, and each frame draws only the plain
    paths. The glows are not SVG filters, because WebKit draws an SVG
    filter on the CPU again on each frame. The microphone icon is in
    the middle until the dictation starts. The box of the orb is 3.125
    times the button (500 px, one pixel for each unit of the SVGs), so
    that the glow and the dots are not cut, and the button has no
    shadow. Under it, a gray "Tap to send" shines (a light band moves
    across it, as the ShinyText of React Bits), or the line says what
    to do. Under that line, the words show in 20 px text in a box of two
    lines: the newest line is at the bottom, and the older lines go up
    with a spring and fade out at the top. The text area has a fixed
    height, so the orb does not move.
  - In an agent, a small talk bar takes the place of the prompt box,
    and the Summary and Chat views stay on the screen, so the user can
    read the chat while they talk. The bar has the orb at 35 % of its
    size (56 px, with CSS `zoom`, so the blurs and the dots keep their
    look), and the status line under it, but no words. No line is on
    top of the bar, also on the Mac. Its rings move
    up to 2.5 times more for a quiet voice (`boost` of `Orb`), because
    at 35 % the same voice moves them only a third as many pixels. The
    small orb pops in faster (`orb-pop-fast`, 0.4 s): it starts at half
    its size, with no hold as a dot. Else it shows long after the
    microphone is on (about 0.25 s). The boost is a compressor (`lift`):
    a full level stays at 1, because a plain multiply makes a loud voice
    huge. On the phone the paper clip is at its left, and the X is at
    its right. A tap in the bar sends, and a tap on the chat does not.
    The big talk view hides the chat, so it is only for a new agent.
    While the user talks, the words so far fill a bubble of the user at
    the end of the chat and of the texts, after the text that was in the
    box, as the message that goes. A new word keeps the end in view only
    while the user is there: a user who scrolled up keeps the place,
    and the bubble fills below. The words go
    to the agent after the text that was in the box, and the Chat view
    opens at the end of the chat. The Chat panel loses its scroll
    position while it is hidden, so the view goes to the end again in
    the next frame. Else on the phone the chat stays at the top after a
    voice note from the Summary view. Escape, the X or a call closes the
    talk bar and drops the words. The back button goes back to the
    agents, and also drops them. The microphone button
    is 36 px, so that a thumb hits it. On the phone the prompt box is
    as the message bar of Signal: a round paper clip at the left, and a round
    text field with the microphone (an icon of 40 px) inside it at its
    right. A padding of 14 px lifts both off the bottom edge. When the
    box has text, the microphone hides, and a round blue send button
    of 44 px with a white arrow shows outside the field at its right.
    It sends the message and keeps the keyboard open. The Mac has no
    send button. The send button shows also when the box is empty and
    attachments wait, such as a location or a photo, so that they can go
    alone. Then the microphone stays in the field: only words hide it.
    A tap on the edge of the box, as next to or under the send button,
    puts the cursor in the field. It does not open the attach sheet,
    although the box is a label, and the first button of a label
    without a "for" is its control: the plus. A long word, as a pasted
    code, breaks onto the next line in the field. Else the field grows
    to the width of the word and pushes the send button off the screen.
    The words in the field are in the font of the app at
    15 px, not in mono at 16 px.
  - A small Cancel button floats at the bottom of the talk view, in
    the New agent view and in an agent. It closes the view and drops
    the words. Cancel is a round X with the look and the size of the
    paper clip and the menus (26 px, and 36 px on the phone), with
    24 px of space above it. On the phone, the X and the menus stay
    above the home bar: the New agent view stops at `--under`. Else on
    Android the X sits on the buttons of the navigation bar. While the
    dictation is on, the status line says "Tap to send": a tap on the
    orb or anywhere else in the talk view sends the words, but a tap on
    a button, a link or a menu does not.
    The status line under the orb stays on one line, and an end that
    does not fit becomes "...". The New agent view says "Tap and talk.
    It starts in" and the project.
    While the talk view is open and no call is on, the call button and
    the + button are hidden, because they have no use there.
  - `src/dictate.ts` records with the worklet of the calls, without echo
    cancellation, so macOS starts no voice processing and the first words
    are not lost. It makes PCM16 at 16 kHz (32 KB for each second) and
    sends a part each 150 ms to `POST /dictate?id=...` of the bridge, the
    last one with `end`. The phone sends through the relay. Each answer
    holds the text so far: the text of the part before it, because the
    helper needs a moment for the new part.
  - `bridge/dictate.ts` runs `yonder-dictate` for each dictation and
    writes the parts to its stdin. The helper (`src-tauri/dictate/main.swift`,
    built by `build.rs` as `yonder-wake` is) makes the text with the
    `SpeechAnalyzer` of Apple (macOS 26 and later), on the Mac only, in
    the language of the Mac. The first use on a Mac downloads the model.
    The bridge finds the helper next to the compiled bridge, or in
    `src-tauri/binaries/`. It stops a helper 30 s after its last part.
    `bun bridge/dictate-check.ts` checks the helper with `say`.
  - A dictation with no sound ends at once with no text.
    `SpeechAnalyzer` never ends an input with no sound. Else the helper
    stays, its caller waits, and the notch leaves one helper after each
    dictation with no sound. The check of the helper tests this case
    too.
  - The helper uses `SpeechTranscriber`, the newest speech model of
    Apple. The macOS 27 SDK has no newer one. It does not use the
    `fastResults` option, which gives each word about 1 s after the
    user says it, but with less accurate words ("write" comes as
    "right"). The fast words of `SFSpeechRecognizer` already show while
    the user talks. In a test with `say`, the last text came 0.1 s after
    the end of the sound, with and without the option.
  - Settings, Voice, Speech to text (for each user, with only the models
    whose key or helper the computer has) picks the model of the dictation and of the Claude call: Apple (the helper), Parakeet (see below),
    Soniox (`stt-rt-v5`) or Deepgram (`nova-3-general`). Each device keeps its choice in localStorage (`stt`),
    and the app adds `&stt=soniox` or `&stt=deepgram` to each
    `/dictate` (`stt()` in `src/bridge.ts`). The bridge then opens one
    WebSocket for each dictation or turn, and sends the parts to it.
    It reads `SONIOX_API_KEY` or `DEEPGRAM_API_KEY` from
    `~/.config/yonder/.env`. With no key, the dictation fails with
    "Put SONIOX_API_KEY=... in ~/.config/yonder/.env". The Grok, OpenAI
    and ElevenLabs calls hear the user with their own models, so the
    choice does not change them.
  - Parakeet (`&stt=parakeet`) is a better speech
    model on the Mac. The bridge then runs `yonder-parakeet`
    (`src-tauri/parakeet/main.swift`) in place of `yonder-dictate`,
    with the same stdin and the same JSON lines. The model is Parakeet
    TDT 0.6B v2 of NVIDIA, English only, through the Swift package
    FluidAudio, with Core ML on the Neural Engine. No sound leaves the
    Mac. After each 0.5 s of new sound, the helper makes the text of
    all the sound again, so the words show while the user talks. The
    first dictation downloads the model (about 450 MB) to
    `~/Library/Application Support/FluidAudio/Models`.
  - The choice is a dropdown with three Parakeet
    versions: "Parakeet v2" (`parakeet`, English only), "Parakeet v3"
    (`parakeet-v3`) and "Parakeet ultra" (`parakeet-ultra`). v3 and
    ultra also know 24 more languages of Europe. The bridge gives the
    version to `yonder-parakeet` as its first argument.
  - A test of 11 local models used 5 minutes of a real voice (screen
    recordings and voice notes), and counted
    the wrong words against a transcript checked by hand. Parakeet v2
    had 1.2 %, Parakeet ultra 1.9 %, Qwen3-ASR 1.7B 2.2 %, Whisper
    large-v3 2.4 %, Apple 2.6 % and Whisper large-v3-turbo 5.7 %.
    Deepgram, in the cloud, had 0.9 %. Apple wrote "one. 5 millimetre"
    for "1.5 millimeters" and "Congress" for "condos". Parakeet made the
    text of 10 s of sound in about 0.1 s.
  - `build.rs` does not build `yonder-parakeet`, because it needs a
    Swift package. Run `swift build -c release` in
    `src-tauri/parakeet`. The bridge finds
    `.build/release/yonder-parakeet` there, so only a Mac with this
    repository has it. `bun bridge/dictate-check.ts` checks it too when
    it is built.
  - Two models make the text. `SpeechAnalyzer` is right more often, but
    it gives the words in bursts about 1 s apart. The older
    `SFSpeechRecognizer` (on the device, as "Hey Yonder") gives a new
    word about each 0.25 s, but it drops and changes more words. So the
    helper shows the words of `SpeechAnalyzer`, and after them the newer
    words of `SFSpeechRecognizer`. When `SpeechAnalyzer` catches up, its
    words take their place and correct them. The fast words go after the
    same word as the last word of `SpeechAnalyzer`, the one nearest to
    its place and 3 words away at most. Else the count of the words
    decides. A count alone loses words, and a match far back repeats
    half of the text. After a pause the fast words start again in the
    same task, as on the iPhone (see above), so the helper keeps the
    words of each utterance. The last text, which goes to
    the agent, is `SpeechAnalyzer` only. Without the permission for speech
    recognition, the text is `SpeechAnalyzer` only. In a test with `say`
    at the pace of speech, a word showed about 0.4 s sooner on average,
    and the text changed 7 times in 3.5 s, not 3 times.
  - On a recent Apple silicon Mac, with an 8-second clip from `say`, `SpeechAnalyzer`
    took 0.25 s and got each word right. whisper.cpp small.en took 1.0 s,
    large-v3-turbo took 1.5 s, and both wrote "foam" for "phone".
    `webkitSpeechRecognition` shows in the WebView of the app but does
    not work outside Safari (WebKit bug 239816).
  - "Hey Yonder" stops during dictation, because it would hear "Yonder"
    in the words.
  - The start of a dictation writes the time of each step to
    `call.log`: the microphone, the worklet, the first frame and the
    first sound. "Hey Yonder" stops before the microphone opens, and
    the context resumes when the restart of the audio suspends it. When
    the orb starts late while the microphone already records, the log
    shows which step waits.
  - The phone opens the microphone of dictation at the tap on the +
    button or on the microphone of the prompt box (`warmMic` in
    `src/dictate.ts`), before the talk view renders. iOS needs about
    0.7 s (sometimes 1.4 s) to open the microphone, so the wait starts
    before the view is on the screen. A microphone that no dictation takes in 3 s
    closes. `call.log` says how many ms the tap came before the start.
    The Mac does not do this, because "Hey Yonder" must stop before its
    microphone opens. During a call, the call has the microphone.
  - The tap comes only about 8 ms before the start, so it saves almost
    no time: the iPhone can still need 0.7 s to 3.6 s for the
    microphone. A microphone that is still open gives its sound in about
    20 ms. So the end of a dictation on the phone
    keeps its microphone open for 60 s (`LINGER_MS`), and the next
    dictation takes it at once. While it waits, the orange dot of
    iOS stays on, and the side buttons change the call volume. It
    closes when the app goes to the background and when a call starts
    (`dropMic`). A kept microphone that ended or went mute is closed,
    and a new one opens. The first dictation after a start of the app
    still waits for iOS. The `microphone` line of `call.log` gives the
    name of the microphone, because a Bluetooth microphone, such as
    AirPods, can open slower.
  - The Mac app keeps the microphone of dictation open, with its
    AudioContext and its worklet, for 5 minutes after the end of the
    last dictation (`MAC_LINGER_MS` in `src/dictate.ts`). The first
    dictation opens it, and each dictation starts the 5 minutes again.
    A switch to another app does not close it, so the orange dot of
    macOS does not turn off and on. A call closes it. So a dictation
    starts to record at once. In
    `call.log` a dictation that opens the microphone waits about
    0.75 s for it and 0.5 s more for the first frame. A dictation that
    takes the open microphone gets its first frame in about 30 ms
    (`call.log`), and in 0 to 20 ms in `bun bridge/dictate-e2e.ts`
    with the fake microphone of Chrome. A change of the microphone in
    the settings opens a new one at the next dictation. The microphone
    does not open with the window, so it stays off for a user who only
    types. So the first dictation after the 5 minutes waits for the
    microphone again.
  - Each line of that log says `phone` or `mac`. It also gives the state
    of the AudioContext when it is made and after the worklet, and if
    its resume ends. With no frame 1.5 s after the start, a `no frame`
    line gives the state of the audio, of the microphone track (live,
    muted, sample rate), of the page and of the audio session.
  - A dictation can get no first frame after the iPhone app comes back
    from the background, and then each later dictation in that page
    fails too. One suspect is an AudioContext that closes when the page
    hides, so the page makes no AudioContext for clicks. A second
    suspect is the AudioContext that `chime(false)` makes at each
    cancel, which closes only when its tone ends.
  - The helper comes with a build of the Mac app (`install-app`). A
    bridge with no `/dictate` answers 404, and the box says "Restart
    the bridge".
  - The bars of the box get the loudness from the frames of the
    worklet (20 ms each), on a log scale: still at `QUIET` (-50 dBFS)
    and full at `LOUD` (-30 dBFS). Dictation has no gain control, so
    one microphone can be 20 dB quieter than another. The top of the
    scale does not follow the loudest frame, else the orb bounces too
    much and is huge for a loud voice. Only the quiet voices get a
    lift: the square root in `Orb` and the `boost` of the small orb.
    The call log gets the loudest frame of each dictation
    ("loudest -33 dBFS"), to tune `QUIET` and `LOUD`.
  - When the last part fails after the stop (the relay or the bridge),
    the words that came so far still go as the text, so the orb
    always sends them.
  - The bars have the color of the text, and their center lines up
    with the button.
  - The relay lets a phone use only the paths in `PATHS` of
    `bridge/relay.ts`, so `/dictate`, `/model` and `/mode` are in it.
    Else the phone says "Dictation failed: A phone cannot use this
    path.", or it cannot change the Minimum, Maximum or Permissions rows
    of the Settings. A change of `PATHS` needs `restart_bridge`.
- **Echo cancellation:** always on. `getMic` in `src/voice.ts` asks
  for echo cancellation, noise suppression and gain control, so WebKit
  uses the voice processing of macOS (VPIO). It keeps the voice of Grok
  out of the microphone, so the user can interrupt Grok. No setting
  turns it off.
  - **The output device matters.** The voice processing uses the
    default output of macOS as its echo reference. With the MacBook
    microphone and the built-in speakers it loads the tuning of the Mac
    (`ispk-imic-misc-ulnk` in the system log), and it works: in a test,
    the voice of the user came through at 0.3 to 0.4, Grok's voice at
    0.001 to 0.015 after about 1 s, and the user's voice during Grok at
    0.3 to 0.4. With an external monitor (DisplayPort) as the output
    it loads a generic tuning (`airp-imic-misc-ulnk`) that turns the
    microphone array down by about 40 dB. Grok then hears nothing: peak
    0.000 to 0.005 in real calls, and 0.002 against 0.011 to 0.020 with
    the silent BlackHole output in a control test. The DELL at 48 kHz
    does not help. The iPhone microphone works with the DELL, because the
    voice processing uses another tuning for it.
  - So the call checks the name of the default output
    (`enumerateDevices`, device `default`). With a built-in Mac
    microphone and an output that is not built-in speakers or
    headphones, the call shows a notice under the call button. The
    `call start` line of `call.log` names the output, or lists all the
    outputs when the page cannot tell the default one.
  - Echo cancellation off made the start worse, not better: WebKit
    prepares a voice processing unit anyway and throws it away after
    about 3 s, which restarts the audio devices again (WebKit bug
    272964). Off also meant that the user could not interrupt Grok.
- **Start of the microphone:** after `getUserMedia`, macOS needs about
  2.2 s before the microphone sends sound, because it rebuilds its audio
  devices for the voice processing. When the page makes its AudioContext
  before the microphone, the stream stops for about 0.7 s two to four
  times in the first seconds (the "mic: no frame for ..." lines of
  `call.log`), and the menu bar shows the microphone go off and on. So
  `openMic` opens the microphone at the click on "Start call", while the
  token and the lists load, and `startCall` makes the AudioContext after
  the microphone. That removed the gaps in a test app, which starts a
  new WebKit audio process each time and gets its first frame only
  after about 2.3 s. Yonder's WebKit audio process stays warm, so its
  first frame comes at once, and the two gaps still come after it. So
  "End call" and the start chime come only when the microphone is
  steady: 2.5 s after it opened, and 5 frames in a row with no gap (at
  most 6 s, then the call goes on). `call.log` says "mic: steady after
  ... ms". Else the first seconds of each call do not hear the user.
- **Start chime:** a call starts with a short tone up, and ends with a
  tone down (`chime` in `src/voice.ts`). The start tone plays on the
  AudioContext of the call, not on a second AudioContext.
  The talk view (New agent, and the microphone of a conversation) plays
  the same start tone when its microphone is on, on the AudioContext of
  the dictation (`dictate` in `src/dictate.ts`). Cancel, a back, or
  Escape while it listens plays the end tone. A send plays no tone. A
  tone on a second AudioContext while the microphone opens is not
  heard. The tone plays at the first frame of the microphone, about
  100 ms after it opens, because the first frame tells that the restart
  of the audio is done. Its level stays at 0.2 through both notes and
  then fades in 0.4 s, so the second note is heard too. The dictation
  sets the audio session of iOS to `play-and-record`, as a call does.
- **A media pause stops the call:** during a call, Yonder's page is the
  "Now Playing" app of macOS (`com.apple.WebKit.GPU`, playing). A media
  pause then suspends the AudioContext of the call, and the microphone
  stops: the play/pause key, AirPods, or a tool that pauses the "Now
  Playing" app when the microphone turns on, and sends play when it
  turns off. Such a tool
  suspends each call, so the call hears nothing and "Connecting…" takes
  6 s, and at the end its play starts the music of another app. So the
  call
  resumes its AudioContext at once when something suspends it
  (`ctx.onstatechange` in `src/voice.ts`). In a test the audio ran again
  13 ms after the pause. The Media Session API does not help: WebKit
  suspends the audio also when the page has action handlers, and the
  page cannot report that it does not play. The Siri daemon
  (`corespeechd`) and the "Hey Yonder" helper also react to the
  microphone, but they do not cause the gaps.
- **Music pauses while Yonder listens:** on the Mac, a call, the
  dictation of the window, and the notch or the voice note pause the
  media of other apps, such as Spotify or a video in Chrome. The media
  plays again 1.5 s after the microphone closes, when AirPods are back
  in high quality, because AirPods with an open microphone play all
  sound in the low quality of a phone call. `hush` in `src-tauri/src/main.rs` does it with
  `media-control` (Homebrew), and without it nothing pauses. The window
  calls `set_mic` (`src/dictate.ts`), the call `set_call_live`, and the
  notch helper prints `mic on` and `mic off`. `hush` pauses only an app
  that plays, never Yonder's own page (`com.apple.WebKit`), and at the
  end plays only the app that it paused.
  The switch Pause music in the settings (Voice) turns the pause off and
  on (`set_audio`).
- **Updates during a call:** The voice agent does not announce results.
  The screen shows the status of each agent. Ask about an agent or a
  project, and the voice agent tells you the result. When an agent starts
  to wait on you, or has a result that needs you, the voice agent asks in
  the next pause if you want an update.

## Workspaces

The workspace is the one concept for a group of agents. A workspace is
a named group of agents, such as "Music" or "sundial". It has one home folder or none. It is the only
group of agents in Yonder.

- A Claude Code agent of a workspace starts in its home folder. A
  workspace with no folder, such as one for a Hermes agent that works
  across the computer, starts its agents in `defaultFolder`, else in
  `~/Yonder`.
- Each agent records its own folder (`path`) and the id of its workspace
  (`workspace`). The screen groups the agents by that id. An agent with
  no id, such as one from an older version, goes to the deepest
  workspace folder that holds its folder.
- One folder is the home of one workspace only. A second workspace with
  the same folder is left out with an error.
- Multi-repo workspaces, workspaces on more than one computer, and a
  screen for each workspace come later.

### The config file: the source of the workspaces

The workspaces are the key `workspaces` of `~/.config/yonder/config.json`.
An agent can see, add, change and remove any workspace by an edit of this
file, with no click of the user. The bridge reads the file again when it
changes, and the app loads the list again every 3 seconds on the Mac and
every 10 seconds on the phone. The key does not sync to other computers,
because the folders are of this computer.

The list is in the order of the screen. Yonder comes first, then the
starred workspaces, then the others, each in the order of the file.

```json
{
  "workspaces": [
    { "id": "sundial", "name": "sundial", "folder": "~/Sites/sundial", "starred": true, "profile": "work" },
    { "id": "music", "name": "Music", "description": "Songs and mixes with a Hermes agent." }
  ]
}
```

| Field | Rule |
|---|---|
| `id` | Required. Lowercase letters, digits, `-` and `_`, such as `music`. It is unique, and it never changes: the agents keep it. |
| `name` | Required. The name on the screen and in the voice. |
| `folder` | The home folder: an absolute path, or a path that starts with `~`. At most one. A folder is the home of one workspace only. |
| `description` | One or two sentences on what the workspace is for. Required when there is no folder. Clef reads it when it picks the workspace of a new task. |
| `starred` | `true` puts the workspace at the top. |
| `profile` | The name or the id of a profile. Each new agent in the workspace starts on it, unless the request names another profile. |

- The bridge checks each entry on its own. A bad entry is left out, and
  the other entries stay. `list_workspaces` gives the errors in `errors`,
  such as "workspaces[3] (music) is left out: a workspace with no folder
  needs a description." The bridge logs them too.
- The bridge never writes over an entry that it left out. A file that is
  not valid JSON keeps the last good list, and the bridge does not write
  to it until it is valid again.
- To add a workspace, add an entry with a new id. To attach a folder, set
  `folder`. To remove a workspace, delete its entry: its folder and its
  agents stay, and the agents go back to the group of their folder.

### The tools

`list_workspaces`, `add_workspace` (a folder, a new empty folder with
`newFolder`, or no folder with a description), `edit_workspace` (the name,
the folder or the description), `remove_workspace`, `star_workspace`,
`set_workspace_profile`, `workspace_overview` and `show_workspace`. Each
tool takes a workspace by its name, its id, its key or its folder.

- Each tool that took `project` takes `workspace`. A call with `project`
  still works: the bridge gives it as `workspace` (`renamed` in
  `bridge/main.ts`). `start_worker` with an empty `workspace` lets Yonder
  pick the workspace from the task.
- The old tool names still work, and only the new ones are in the list:
  `list_projects` (it gives a bare list), `add_project`, `create_project`,
  `remove_project`, `describe_project`, `star_project`, `order_projects`,
  `set_project_profile`, `project_overview` and `show_project`.
- The app still calls the old names, so a new app works with an older
  bridge. `other_computer` sends both `workspace` and `project`, and tries
  the old name of a tool that the other bridge does not know.
- The key of a workspace on the screen is its folder, or
  `workspace:<id>` for a workspace with no folder. `window.yonder.workspaces`
  of a screen is the same as `window.yonder.projects`.

### The move from the projects

The first start of a bridge with workspaces makes the workspaces from
the projects, once (`workspacesMigrated` in state.json, `migrateWorkspaces` in
`bridge/main.ts`).

- Each project that the user chose or used becomes a workspace with its
  folder: Yonder, the starred ones, the added ones, and each project with
  an agent, a schedule, a profile or a saved about. The order and the
  stars stay. A saved about becomes the description, and the profile of
  the project becomes the profile of the workspace.
- A folder of `~/Sites` or `~/Developer` that nobody used becomes no
  workspace (`state.scan`). It still answers by its name: an agent that
  starts or moves there, a star, or a pick of Clef makes it a workspace
  (`adoptFolder`).
- The old keys stay as they were: `starred`, `extra`, `hidden` and
  `abouts` of state.json, and `projectProfiles` of config.json. So an
  older bridge still reads its projects after a rollback.
- `bun bridge/workspaces-check.ts` checks the move, the old names, the
  edits of the file and the pick of a new task, with no network.

### The pick of the workspace of a new task

The + button of All workspaces and a voice task with no workspace give an
empty workspace. The bridge picks it as it picks a project (see the
New agent view of the Mac app): Clef chooses from the workspaces and the
scanned folders that are no workspace, with the description, the last
edit and the recent agents of each. A workspace with no folder counts the
time of its newest agent as its last edit. When Clef fails, a workspace
whose name is a word of the task wins, else the busiest workspace.

## Projects

The projects are workspaces (see Workspaces above). This part tells how
the projects work, and most of it applies to the workspaces with a
folder.


- Yonder keeps a list of project folders that workers can use.
- A new install lists only the folders that the user adds. An older
  install also lists each folder in `~/Sites` and `~/Developer`
  (`state.scan`).
- When Yonder has no project and a new agent names none, the bridge
  makes `~/Yonder` (an empty folder with a git repository), adds it to
  the list, and starts the agent there (`homeProject`).
- A new agent for the home folder also starts in `~/Yonder` (`notHome`).
  Claude Code trusts the home folder for one session at a time, so
  `claude --bg` refuses it: "Workspace not trusted. The home directory is
  trusted one session at a time". The bridge does not save a trust for
  the home folder, because the trust of a folder also counts for each
  folder under it that is not a repository.
- Yonder is not sandboxed, so it needs no permission for `~/Sites` or
  `~/Developer`. macOS asks once for a protected folder, such as
  Desktop, Documents, Downloads or iCloud Drive.
- You can add any folder from anywhere on the laptop.
- While the search of the projects or of the sites has text, its plus
  button is an X. A tap on the X clears the search.
- Add folder, at the right of the search of the projects, also works on
  the phone. The phone cannot show the folder dialog of macOS, so it
  opens a sheet (`src/FolderPicker.tsx`) that starts at the home folder
  of the Mac. Tap a folder to open it, "‹ Back" to go up, and "Add
  <name>" to add the open folder. The sheet reads the folders with the
  bridge tool `list_folders`, which skips dot folders and
  `node_modules`. Grok has the tool too.
  - For Desktop, Documents, Downloads and iCloud Drive, macOS asks on
    the Mac the first time, and the read waits for the answer. So
    `list_folders` stops after 5 seconds and tells the phone to click
    Allow on the Mac. The bridge uses an async `readdir`, so the wait
    does not stop the bridge.
  - The phone needs a bridge with `list_folders`. An older bridge gives
    an error in the sheet until `restart_bridge` or an update.
- "Create a new project": Grok calls `create_project`. It makes an empty
  folder in `~/Sites` with a new repository, and the name becomes the
  folder name ("recipe app" is `recipe-app`). Grok shows the project, and
  starts an agent there with what the user wants to make, or asks first.
  File > New Project… in the app
  does the same, in the folder that the user picks.
- You can star a project. Starred projects go to the top of the list.
- Yonder is always the first project. Drag a starred project, or press
  Option and an up or down arrow, to put it in a new place. The order of
  `state.starred` is the order on the screen, and `order_projects` saves
  it. Grok can also call `order_projects` ("put sundial at the top").
- Right-click a project row and click "Remove folder" to take it off the
  list, or ask Grok ("remove that project"), which calls `remove_project`.
  The folder stays on the disk. The bridge keeps the path in
  `state.hidden`, so a folder in `~/Sites` or `~/Developer` does not come
  back. `add_project` puts it back.
- Show each project's favicon when the project has one. When the top folder
  has no favicon, the bridge uses the nearest favicon in the subfolders, 4 levels
  down at most. It skips `node_modules`, `dist`, `build`, `target`, `vendor`
  and dot folders. The bridge keeps each answer until it restarts.
  An emoji favicon (an SVG with one `<text>`) often puts the emoji partly
  outside its box, so the bridge draws the emoji again in the center.
  A project with no favicon shows no icon and no gap: the name starts
  where the favicon would be, in the Projects tab, the title and the
  titles of All projects (`Favicon` in `src/App.tsx`).
- Save the state of projects and agents, so that you can come back later and
  continue where you stopped.
- Two config files on the Mac hold the settings, so that the user or a
  Claude Code agent can change any of them by hand, from any device:
  each agent runs on the Mac.
- `~/.config/yonder/config.json` holds the settings of the Mac (the
  bridge), for all the devices: `preview` (the Tunnel row), `models` and
  `efforts` (the ranges, such as `["haiku", "fable"]` and
  `["low", "max"]`), `defaultModel` (`"auto"` or a model), `mode`
  (`bypassPermissions`, `auto` or `acceptEdits`), `sumUp` (the Summaries
  row), `contextDetail` (`"minimal"`, `"normal"` or `"verbose"`) and
  `contextGroup` (the Context tab rows of Appearance), `accent` (the
  Color row of Appearance: `""` or a hex color), `steer` (the Steer row), `walkieTalkie` (`true` or `false`) and `speechModel` (a path, see Walkie-talkie), `cli` and `clis` (the Agents tab),
  `projectProfiles` (the default profile of each project in an older version, see Profiles),
  `workspaces` (see Workspaces),
  `defaultFolder`, `agentName`, `agentNaming`, `appDays` and `fileDays`,
  and on the Mac `newAgentKey`, `voiceNoteKey` and the shortcuts of the
  window, such as `closeKey` (see Keys). `port` and `token` are the port
  and the secret of the bridge (see "Two OS users on one computer"). A new
  port counts after a restart of the bridge, a new token at once.
  - `fileDays`: the attachments of the agents (the pictures, pastes,
    files and videos in `~/.config/yonder`) go this many days after they
    came, at the start of the bridge and then once a day (`pruneFiles`).
    The default is 30, and 0 keeps all. A 4K video is 300 MB.
  - The rows of the Settings come from the schema `bridge/settings/`,
    and `/settings` writes their values here. A setting that the user
    adds in `~/.config/yonder/settings.json` (a list in the same form)
    shows in its section and writes its key here, with no new build.
  - The Settings tab writes the file too. The keys stay `state.preview`
    and so on in the code: accessors read and write `config.json`, so
    these keys are not in `state.json`. The bridge moves old keys out
    of `state.json` on its first start.
  - The bridge reads the file again when its time of change moves, so an
    edit needs no restart. The app shows the new value the next time it
    opens the Settings.
  - A value that fails the check of its key, such as the mode `plan`,
    gets the default, and `bridge.log` tells why. A file that is not valid
    JSON keeps the last good settings, or at the start the settings of
    `config.json.bak`, and the bridge does not write over it until it is
    valid again (see Backup and safe saves).
  - `trustedLinkSources`: the sites that can open a new task with a
    signed link (see New task links).
  - `defaultFolder`: the folder of a new agent when the task names no
    project and is not about the work of a project, such as `"~/notes"`
    for an errand or a note. Clef then answers "(none)" for the
    project, and the agent starts there, not in the busiest project. A
    task that fits one of the latest projects goes there (see the New
    agent view of the Mac app). The
    folder does not have to be on the list of projects. With no
    `defaultFolder`, the busiest project gets the agent, else the
    first project.
  - Grok does not ask which project when it is not sure. It gives
    `start_worker` an empty project, and Yonder picks.
  - `agentName`: the word for an agent on the screen, in the voice and in
    the descriptions of the tools, and the icon of the Agents tab. An
    example: `{ "one": "task", "many": "tasks", "icon": "<svg …>" }`. The default
    is `{ "one": "agent", "many": "agents" }` with the bird icon.
    - The code, the tool names, the tab values (`agents`) and the APIs
      keep "agent". `swap` in `src/names.ts` changes each "agent" and
      "agents" of a text to the word, with its capital. `forHost`
      (`src/front.ts`) applies it to the prompt and the tool descriptions
      of the voice, and `voice.ts` to each tool result and each
      `[Yonder app]` note. The bridge applies it to the description of
      each MCP tool when a client connects, and to the prompt of the car,
      the watch and the phone call. The user can still say "agent".
    - The bridge also applies it (`say` in `bridge/main.ts`) to each
      MCP client, such as an agent, Claude Code or the Claude app: the
      description of each input of a tool, each
      error, a result that is only a text, the `note`, `said` and `error`
      of a result, the lines of `review_workers`, and the prompt of each
      agent ("Yonder shows you to the user as task 11"). Haiku writes the
      word in each new summary and spoken brief (`wordRule`). A summary
      from before stays until the agent gives a new answer. The other
      fields of a result keep their words: the task, the result, a name
      and a path have the words of the user or of an agent, and a client
      can give them back to a tool. "Worker" stays, as the tool names do.
    - A path, a file name and a link keep "agent" (`~/.claude/agents/`,
      `agents.json`, `op://Agent/GitHub/token`), and so does "the voice
      agent", which is not an agent of the user. The tab values are in
      backticks, so they stay. Else a tool gets a value such as "tasks
      (running)", which no tool takes.
    - `swap` also changes the article: "an agent" is "a task". A word
      in backticks stays, such as the `agents` field of `list_projects`.
    - `icon` is SVG markup, or the name of an icon of `src/icons.tsx`,
      such as `"clipboard"`. Only its shape counts: it takes the color of
      the text, as the other icons. The page draws it as a CSS mask, so a
      script in it never runs. Its name is `svg-` and a hash of the
      markup, so a new design is a new name for the caches of the page
      and of `NativeChrome.swift`. The native tab bar of iOS 26 already
      takes each icon as a PNG that the page draws (`iconPng`), so a new
      icon needs no new build.
    - The app reads `/agent-name` of the bridge when it opens and every
      10 seconds, so an edit of the file shows in about 10 seconds, on the
      Mac and on the phone. The page keeps the last word in
      `localStorage` (`agentName`) for its first paint. An MCP client,
      such as Claude, gets the new word in the descriptions when it
      lists the tools again, and in the results at once.
    - Not changed: the native CarPlay screen (`CarPlay.swift`) still says
      "Agents", and the referral text of the Settings still says "agents",
      because it goes to other people.
  - `agentNaming`: how Yonder calls each agent on the screen, in the voice
    and in the pushes.
    - `"numbers"` (the default): "Agent 2". The title of a push is
      "Agent 2 · Fix the tabs".
    - `"names"`: a first name from `NAMES` in `src/names.ts`, such as
      "Jack finished". The name follows the number: agent 1 is Jack,
      agent 2 is Emma. Each new agent gets the lowest free number, so two
      open agents never have the same name. An agent that runs again with
      a new number gets a new name.
    - In the names and projects modes, the name is in the place of the
      number on each tab (Tasks, Done, Closed): the row shows "Jack" in
      place of "#2", in a column of 64 px with two lines at most, so the
      titles line up. The head of a conversation shows "Jack · Fix the
      tabs" in place of "#2 Fix the tabs". The undo of a close, the
      runs of a schedule and the labels for VoiceOver use the name too.
      A sub-agent keeps "21B". The voice keeps the number in its lines
      (`voiceRef`).
    - The pages of the screens get it from the one API:
      `yonder.mice.list()` gives `label` ("2", or "Jack"), and
      `yonder.word.naming` gives the mode. The Dashboard sample shows
      `label` with no `#`, and the kit gives `y-num` a wider column for a
      name. The styles (Yonder, Big button, Terminal, Playful) are the
      default screen, so they show the name with no change. `bun bridge/names-e2e.ts` checks it on a phone page and
      takes pictures with the numbers and with the names.
    - `"projects"`: the project, such as "Sundial finished", with the
      number when the project has more open agents: "Sundial 7". The
      first words of a new agent are then "Agent started.", and the voice
      says its name after the result: "It's Sundial."
    - The number stays the ID: each tool takes it. The voice gets each
      agent as "Jack (agent 4)". The bridge (`findWorker`) and the app
      also take "Jack" and "Sundial 7" as a reference.
- `~/.config/yonder/phone.json` holds the settings that each phone keeps:
  `ui` (the screen in use, see "Screens and styles" under Phone),
  `theme` (`light` or `dark`), `chatFont` and `summaryFont`
  (`system`, `serif`, `rounded` or `mono`), `chatSize` (12, 13, 15 or 17)
  and `summarySize` (13, 15, 17 or 21), `usageBar` (`on` or `off`),
  `voiceProvider`, `stt`, `appsView` (`list` or `grid`, the Apps
  tab) and `push` (`on` or `off`, the Notifications switch of the
  iPhone). All phones of the Mac share it.
  - The Show list of the computers (`hiddenComputers`) and the wake word
    (`wake`) stay on each device: they are not in phone.json, and they
    never sync (`"store": "device"` in `bridge/settings/`). Else Isolate
    computers (the switch before the Show list) of one phone reaches each
    phone, each phone tells each computer to forget the others, and
    `other_computer` finds no computer. The wake word
    keeps the microphone open, so a phone must not turn it on for the Mac.
  - The bridge route is `/phone-config`: GET gives the file, and POST
    merges a patch, where null removes a key. The relay lets the phone
    reach it.
  - The phone (`src/phone-config.ts`) pulls the file when the app opens,
    when it comes to the front, and every 10 seconds while it is on the
    screen. Each change on the phone goes into the file. A key that changed in the file since the last pull takes the
    value of the file; a key that changed only on the phone goes into the
    file. When both changed, the file wins. The phone keeps the file of
    the last pull in `phoneConfigSeen`. Each computer has its own
    `phone.json`, so a switch of the computer forgets `phoneConfigSeen`,
    and the phone then pushes its settings to an empty file.
  - The Mac window follows only `ui` of the file, on the pull every 10
    seconds (`follow` in `src/phone-config.ts`). It takes `ui` when the
    file changed since its last pull (`macUiSeen`), and it never writes
    the file, so a pick on the Mac stays on the Mac until the file
    changes. So `customize` with `use` also switches the Mac.
  - Only a phone with a pairing syncs the file. Else a fake iPhone of a
    test (Chromium with the user agent of an iPhone, on the bridge of
    the user, with no pairing) writes its test settings, such as
    `"ui": "yonder"`, into `phone.json`, and the real phone loses its
    theme. A real phone with no pairing reaches no bridge, so the check
    changes nothing for it.
  - `environment` is a one-time order, not a setting: the name of another
    computer that the phone is paired with, such as `"Studio Mac"`, or a
    part of the name. The phone removes the key from the file first, then
    switches to that computer as the Environment section does, also
    during a call. A name that fits no computer, or two, only removes the
    key. So the Mac can switch the phone to another computer. Only the
    phone knows the names of its computers.
  - Face lock is not in the file, because it needs an unlock on the phone
    first. The microphone is not in it, because its value is the ID of
    one device.
  - The Mac app keeps its own theme, colors and fonts in its
    `localStorage`.

### The config file row

Settings, General has a Config file row over Export, with an Open
button. On the Mac, Open shows
`~/.config/yonder/config.json` in the text editor of the computer (`open
-t`; `xdg-open` on Linux, `start` on Windows). On the phone, Open shows
the text of the file under the row, and Hide closes it. The route is
`/config-file`: GET gives `{ path, text }`, and POST opens the file.

### Backup and safe saves

A user without a Yonder account has
no copy of the setup on yonder.so, so the setup must not get lost on the
computer, and it must move to a new computer. The code is
`bridge/backup.ts`.

- An update, a new install or a delete of `Yonder.app` does not touch
  `~/.config/yonder`. The uninstall of Linux and Windows keeps it too.
- Safe saves: the bridge writes `state.json`, `config.json` and
  `phone.json` to a copy and renames the copy into place (`writeSafe`),
  so a crash never leaves half a file. The file before each save stays
  as `<file>.bak`, a hard link, so it costs nothing.
- A broken file: at the start, the bridge moves a broken `state.json` to
  `state.json.broken-<time>` and reads its `.bak` (`readSafe`). For a
  broken `phone.json` it reads the `.bak`, and the next save moves the
  broken file to `phone.json.broken-<time>`. A read does not move it,
  because an editor can be in the middle of its save. Else a broken
  `state.json`, such as one that a crash cut short, stops the bridge at
  each start, and a broken `phone.json` gives the phones no settings. A
  broken `config.json` stays in place, because the
  user edits it by hand: the bridge uses its `.bak` at the start, and
  does not write over the file until it is valid again.
- Export and Import are in General of the Settings, on the Mac and on
  the phone (`src/Backup.tsx`, POST `/setup-export` and
  `/setup-import`). Export saves the file in `~/Downloads` of the
  computer, also from the phone. Import applies a file that the user
  picks.
- The file (`yonder: "setup"`, `version: 1`) holds `config.json` with
  the workspaces, the people and the profiles, `phone.json`, the
  descriptions of the folders (`abouts`) and the project lists from
  before the workspaces (`extra`, `starred`, `hidden`, which only the
  move into workspaces reads), the schedules, the reminders,
  `talk.md`, the own settings (`settings.json`) and the own screens
  (`ui/`). It does not hold the agents and their chats: the chats are in
  the folders of Claude Code.
- Without keys (the default), the export leaves out `port`, `token`,
  `computerName` and `trustedLinkSources` of `config.json`, the `env` of
  each profile, the `devices` of each person (paired phones), and the
  `secret` of each webhook trigger. The `port` belongs to one OS user on
  one computer, so a copy to another computer could collide.
- With keys (the With keys switch, which shows a warning), the export
  also holds those values and `.env`, `relay.json` (the pairing of the
  phones and the relay), `vault.json` (1Password), `remote.json` (the
  connector of the Claude app) and `tunnel.json`. Anyone with that file
  can use the computer. The file is 0600.
- The import merges. A value of the file wins. A list of objects with an
  `id`, such as the profiles, the workspaces and the people, merges by
  id: the entry of the file wins, with the fields of the current entry
  that it does not have, such as the `env` of a profile. What only this
  computer has stays. A schedule or a reminder that is here already
  stays as it is. A screen file that is here already stays.
- An imported schedule starts next at its next time from now, not at
  once. An imported reminder that is past does not come.
- Before it writes, the import copies the current files to
  `~/.config/yonder/backups/before-import-<time>/`. To undo an import,
  copy those files back.
- Without keys, the import never changes a key, a token, the port or a
  pairing, also when the file holds them. With keys, it writes the key
  files of the file (`.env` merges by variable name) to
  `~/.config/yonder/import-keys/` and restarts the bridge after a second.
  The new bridge puts them in place at its start, before it reads them
  (`applyPending`), so the bridge that ran cannot write its old pairing
  over them. A copy of `relay.json` makes this
  computer the same Mac on the relay as the computer of the export, so
  import the keys only to replace that computer, not beside it.
- An import refuses a `config.json` that is not valid JSON, so that it
  does not write over the edit of the user.

#### An agent applies an export

An agent of Yonder applies a file with no clicks, through the MCP tools
of the bridge. The voice of the app does not get these tools.

1. Call `import_config` with `path`, the path of the file. Leave out
   `keys`, unless the user asks in words for the keys of the file.
2. Read the answer: `backup` (the folder of the files before), `files`
   (the files that it wrote), `skipped` (each value that it left out, and
   why) and `restart` (true when the bridge restarts to load the keys).
3. When `restart` is true, wait about 3 seconds before the next call of
   a Yonder tool.

To make a file, call `export_config`. `path` is optional (the default is
`~/Downloads/yonder-setup-<date>.json`), and `keys` is true only when the
user asks for the keys. A program with no MCP client can use the routes
of the bridge: `curl -s -X POST http://127.0.0.1:7787/setup-import -H
'content-type: application/json' -d "$(jq -n --rawfile t file.json
'{text: $t}')"`.

The checks are `bun bridge/backup-check.ts` (the module, in a temp
folder) and `bun bridge/backup-e2e.ts` (two bridges on free ports with
their own home folders: a broken `state.json`, the export and the
import). Neither touches the bridge on port 7787, and neither uses
credits.

## Phone

- The plan for Yonder on the phone is in `docs/mobile.md`: our own relay in
  Docker, QR pairing, end-to-end encryption, and a Tauri iOS app from the
  same React code. Yonder uses its own relay, not Tailscale.
- The relay, the Mac side, the pairing, the iPhone app and the Android app
  are built.
- Shake to undo: a shake of the iPhone asks "Undo Close?" or "Undo
  Complete?" with the agents of the last close or complete, from the
  app or from Grok. "Undo" puts each agent back on its tab as it was
  before, and an agent that ran continues with "Continue.". A shake
  after a delete shows "A deleted agent cannot come back.", and with
  nothing to undo a shake does nothing. The bridge keeps the last
  close, complete or remove in memory (`undo` in `bridge/main.ts`, with
  `check` for the question). The `UIWindow` extension in
  `Island.swift` catches the shake and calls `window.yonderShake`. The
  motion events of the web view need a permission prompt, so the shake
  is native.
- The phone app does not zoom with a pinch. The viewport of `index.html`
  has `maximum-scale=1, user-scalable=no`, and `src/main.tsx` sets the
  same viewport on the phone, because an update over the air does not
  change the `index.html` of an older install. On iOS, `main.tsx` also
  stops `gesturestart`. Else a pinch zooms any screen of the app.
- The phone apps show only the portrait view. They do not turn to the
  landscape view when the phone turns. On iOS, the window of tao keeps
  only the portrait view (the "Yonder patch" in
  `ios/tao/src/platform/ios.rs`). On Android, the activity in
  `AndroidManifest.xml` has `android:screenOrientation="portrait"`. Only
  the player of a video on the iPhone turns (see the viewer in the Mac
  app). For it, the `UISupportedInterfaceOrientations` of
  `ios/gen/apple/project.yml` and of the `Info.plist` next to it also
  have the two landscape views. With only
  `UIInterfaceOrientationPortrait`, iOS keeps each screen upright, also
  the video.
- The Face ID lock: the row "Face ID" in General of the
  settings locks the phone app. Then a red lock screen (`src/Lock.tsx`)
  with the bird mascot of the pairing screen covers the app when it opens and when it comes back from the
  background, and the app asks for Face ID. The passcode of the phone is
  the fallback. The app stays under the lock screen, so a live call goes
  on. The lock screen comes when the app goes to the background, so the
  app switcher does not show the agents. On asks for Face ID one time
  first. The setting stays in localStorage (`faceLock`). Android uses the
  fingerprint, with the name "Fingerprint". The native part is
  `tauri-plugin-biometric` (`ios/` and `android/`), with
  `NSFaceIDUsageDescription` in `ios/Info.ios.plist`. A phone app with
  no plugin has no row. The lock screen
  shows the bird of the pairing screen and only the unlock button: it has
  `role="dialog"`, so the native buttons and the tab bar hide under it
  (`src/chrome.ts`).
  A link that Yonder opens, such as a preview through
  the tunnel, does not lock the app, so the way back needs no Face ID
  (`away` in `src/bridge.ts`). A new start of the app still locks it.
  The row "Ask again" under the switch sets a grace
  time on the iPhone: Immediately, or after 1, 5 or 10 minutes
  (`faceGrace` in localStorage). The lock screen still covers the app
  when it leaves the screen, but inside the grace time it opens with no
  Face ID. A lock of the phone always asks again: `UIApplication`
  reports it about ten seconds after the screen goes off, so with a
  grace time the app asks iOS for a short background task when it
  leaves, to hear the lock (`phone_lock` in `ios/src/lib.rs`,
  Island.swift). Android has no row.
  The lock keeps its state through a new load of the
  page in the same run of the app (`kept` in `src/Lock.tsx`). An update
  of the screen, a heal and a new web process of iOS load the page
  again. A new screen also loads in front, under the
  native cover, so else each new load asks for Face ID again. An open
  app that loads again in front stays open. An app that left the
  screen keeps the start of its grace time, and a lock of the phone
  still asks again. The state is in `sessionStorage`, and only a load
  of the type `reload` or `back_forward` reads it, so a new start of
  the app always locks. A page that starts behind another app asks for
  Face ID only in front. The approvals with Face ID, such as 1Password
  and payments, still ask each time. `bun bridge/lock-e2e.ts` checks
  this in headless Chrome.
- The share sheet: Yonder is in the share sheet of
  iOS. Share a link, such as a post on X or Instagram, add a message,
  and pick "New agent" or an agent. Send starts a new agent with the
  message and the link, or sends them to that agent. The bridge picks
  the project of a new agent. The extension (`ios/gen/apple/YonderShare`)
  talks to the Mac with the Swift link of CarPlay, so it needs no open
  app. "The share extension" in `docs/mobile.md` has the details.
  It also takes photos, videos and documents: each file
  goes to the Mac in parts, and the agent gets the paths in `files`. A
  video gets its keyframes and the words of its sound.
- Subscriptions: Yonder is free (see "Voice agent (Grok)" under
  Architecture), so the phone apps sell no plan and have no subscribe
  sheet. No code in `src/` uses `tauri-plugin-iap`, but it is still a
  dependency in `ios/Cargo.toml`, `android/Cargo.toml` and
  `package.json`.
- The relay forwards encrypted frames between the bridge and the phones. It
  cannot read them. The live relay is `wss://relay.yonder.so`: the code of
  the relay repository (yonder-relay). `ROOMS` in the `.env` of the relay can limit the Macs that connect.
  "The live relay" in `docs/mobile.md` gives the details.
- An older relay name goes to the same relay on the server as
  `relay.yonder.so`. A phone keeps the relay address of its pairing, so
  without the old name each phone of an old pairing must pair again. New
  QR codes use `relay.yonder.so`, because the bridge reads `YONDER_RELAY`
  when it starts. The privacy policy is at https://yonder.so/privacy/. The
  page https://relay.yonder.so/privacy links to it.
- The bridge pings the relay every 3 seconds. A Mac that sleeps, for
  example with the lid closed, sends nothing, but its socket can stay open
  for minutes. So the relay treats a bridge with no ping for 15 seconds as
  offline: it closes the phones with "The Mac is offline", and the phone
  shows "Bridge offline". After 60 seconds with no answer (`idleTimeout`),
  the relay closes the socket of the bridge too.
- Relay statistics: the relay sends each open and close of a socket, and
  each phone that it refuses because the Mac is offline, to the Django
  site of the landing page (`POST /api/relay/events`). The
  backstage page of that site (`/backstage/`, staff only) shows the live
  connections, the sessions and their length, the drops, the refusals,
  the unique Macs (rooms) and the unique phones. The phone sends
  `device`, the end of its public key, so that the relay can count each
  phone one time. A drop is a close with a code that is not normal, for
  example 1006, or 4001 from the bridge after 2 pings with no answer. A
  Mac that sleeps sends no close for minutes, so the refusals show those
  gaps better. The relay sends events only with `STATS_URL` and the
  secret `STATS_TOKEN` in the `.env` of the relay. The relay sends the
  room of the Mac as `mac`. The live relay sends its events to
  `https://yonder.so/api/relay/events`. The token is
  `RELAY_STATS_TOKEN` in the `.env` of the site, with the same
  value as `STATS_TOKEN` of the relay.
  The relay also sends the place of each socket from
  the headers of Cloudflare: `cf-ipcountry`, and `cf-ipcity`,
  `cf-iplatitude` and `cf-iplongitude` when the zone adds them. It
  never sends the IP address. The backstage is in pages (Overview, Map,
  Sessions, Drops, Accounts), and the Map page puts a dot on a world
  map for each place. Without the city headers, the dot is at the
  middle of the country. The Drops page tells what each close code
  means. The "visitor location
  headers" managed transform of yonder.so is off: the API token cannot
  change it, so turn it on in the dashboard (Rules, Transform Rules,
  Managed Transforms) to get the cities.
  A planned stop of the bridge closes its relay socket
  with the code 4002: "The bridge restarts" (`restart_bridge`, and
  `rebuild_app` when `bridge/` changed) or "The bridge stopped" (SIGTERM
  from the app when it quits, or from `install-app`). It waits for the
  close, 500 ms at most, then it exits. 4002 is not a drop, and the
  backstage counts it as a restart. Else the bridge exits with its
  socket open, the relay sees 1006 ("Vanished"), and each update counts
  as a drop. The header of each backstage page shows the Macs
  and the phones online, and it reads them every 2 seconds
  (`/api/relay/stats?live=1`, about 25 ms). The other numbers come
  every 15 seconds, because they take about a second.
  The relay sends the events one at a time, in order,
  and it tries an event again after 1, 2, 4, 8 and 16 seconds when the
  site does not answer or answers 5xx. A deploy of the site stops Django
  for about 15 seconds. Else a close in that time is lost, and the
  backstage shows a phone online that is gone, until the Mac connects
  again.
  The backstage looks like shadcn/ui: zinc colors,
  cards, segmented tabs, and Recharts charts (sessions each day, drops
  and refusals each day, and the reasons of the drops). The map uses
  MapLibre with the free tiles of OpenFreeMap, with zoom buttons. The
  tile "Phone pairings" counts phone keys, not phones: each pairing makes
  a new key, so one iPhone that pairs again counts two times. The dev
  server can read the live numbers of yonder.so with
  `STATS_FROM` and `STATS_FROM_TOKEN` in the `.env` of the site.
- Two Macs must not share `relay.json`: the room is a hash of its token,
  so the second bridge takes the room and the relay closes the first
  with the code 4000. A copy of the folder `~/.config/yonder` (Migration
  Assistant, a backup) does this. The Mac that gets 4000 makes a new
  token and a new key, with no phones, and connects again. Else it stays
  offline. Pair the phones with that Mac again. The relay sends this
  code, so a bad relay could wipe the pairings: first the bridge copies a
  `relay.json` that has phones to `relay.json.bak` (mode 600). A second
  4000 does not replace that copy. To get the pairings back, stop the
  bridge and copy `relay.json.bak` over `relay.json`.
- When the bridge gets no answer to 2 pings (6 seconds), for example
  after the Mac wakes, it connects again. After a drop it tries again
  after 1, 2, 4 and then every 5 seconds.
- While the Mac is offline, the phone waits for it. A tool call
  (`callTool`, such as `start_worker` from Grok) that cannot connect
  tries again every 2 seconds, 2 minutes at most, and goes to the Mac
  when it is back. It sends again only a call that did not leave the
  phone, so an agent never starts two times. The poll (`call`) does not
  wait, so the screen still shows "Bridge offline". Else a
  `start_worker` call fails at once with "The Mac is offline" when the
  lid is closed.
- A new agent and a message to an agent
  (`start_worker` and `message_worker`) do not wait and do not fail
  while the Mac is offline. They go into the outbox of the phone
  (`outbox` in localStorage, `queue` in `src/bridge.ts`), and the call
  returns at once. Grok then says "The Mac is offline. It goes when the
  Mac is back." The outbox keeps its calls also when the app closes,
  and sends them in their order when the Mac connects again. While the
  outbox has calls, each new call goes after them, so that the order
  stays. Only a call that did not leave the phone goes into the outbox.
  When the relay closes during a call, the phone cannot know if the Mac
  got it. So each such call has a key, and the phone
  sends the call again at once with the same key, 3 times at most. The
  bridge runs a key one time and gives the answer of the first run to
  each send (`replyOnce` in `bridge/main.ts`), so an agent never starts
  two times. The bridge keeps the keys in memory for 10 minutes. Else a
  change of network during a `start_worker` loses the agent with "The
  agent did not start: The relay closed the connection." When the Mac
  refuses a queued call, the error bar of the app shows it. A switch of
  the Mac clears the outbox.
- Dictation on the phone also works while the Mac is
  offline. The phone makes the words itself (see
  Dictation), so this is only for a cloud model that the user chose and an
  older app. The speech model is on the Mac, so the phone
  cannot show the words. The phone keeps recording, and the status line says "The Mac
  is offline. Keep talking, it goes when the Mac is back." At the tap,
  the phone sends the whole sound to the Mac one more time. When the
  Mac is still offline, the sound goes into the outbox with the new
  agent or the message. The sound waits in IndexedDB (`yonder-sounds`),
  because a minute of sound is about 2 MB. When the Mac connects again,
  the outbox makes the text from the sound (`/dictate` of the bridge),
  and then sends the call. The error bar says "The Mac is offline. The
  agent starts when the Mac is back." or "The message goes when the
  Mac is back."
- A request of the phone that gets no answer in 2 minutes closes its
  socket to the relay (`connect` in `src/link.ts`), so the next request
  connects again. A socket can stay open on the phone with no answers
  after a drop. Else each poll waits on it, and the list of the agents
  stays as it was.
- The phone finds a dead link by itself, and the app
  shows the state (`connect` in `src/link.ts`). Else a connect through
  the relay has no time limit: when
  the network goes away during the connect with no close, for example at
  a change of network or while iOS holds the app, the connect waits for
  good. Each later request waits on the same connect, so the poll and
  each tap do nothing, and the phone shows "Offline" while the Mac is on.
  In a test, the phone was back 3 seconds after a restart of the bridge.
  - A connect through the relay that gets no handshake in 10 seconds
    fails as offline, and the next request connects again. On the local
    network the limit stays 1.5 seconds.
  - While a request waits and the Mac sent nothing for 5 seconds, the
    phone sends a ping (`/lan`). With no frame 10 seconds after the ping,
    the connection is stale, and the next request connects again. A
    request on the stale connection keeps its 2 minutes, because a large
    answer, such as a video, can still be on its way.
  - When the app comes back to the front, when the network comes back,
    and at a tap while the bridge does not answer, the app pings the link
    at once and polls again (`checkLink` in `src/bridge.ts`).
  - A poll with no answer in 10 seconds is a miss. The title bar then
    shows an amber dot and "Reconnecting…", also on the Mac during a
    restart of the bridge. After a minute with no answer it shows a red
    dot and "Offline". The app never stops: it polls every 3 seconds on
    the phone and every second on the Mac.
  - A new poll does not start while the last one waits for its answer,
    10 seconds at most. Else the polls of a slow link queue
    on the one socket to the Mac, each answer comes later than the one
    before it, and the pictures of the chat wait behind them.
  - A poll of more than 5 seconds, or a poll that fails, writes one
    "Phone poll" line to `call.log` of the Mac, at most one each minute,
    with the time and the way (`lan` or `relay`). The line goes when the
    link works again. The Mac app writes none.
  - WebKit gives the Mac window 6 connections to the bridge. A request
    that the bridge does not answer holds one, and each other request,
    also the one of a click, waits for a free one. On the Mac, a poll
    with no answer in 10 seconds makes a new MCP client, which frees
    them (`resetClient` in `src/bridge.ts`). The polls
    of the other computers ask a sleeping computer for up to 60 seconds
    in the bridge. So such a read (`other_computer` with
    `list_workers`, `list_projects` or no tool) ends after 8 seconds
    (`mcpFetch` in `src/bridge.ts`), the Mac asks each computer one
    thing at a time, and a computer with no answer in 8 seconds rests
    for a minute (`askOthers` in `src/elsewhere.ts`). Else, in a
    test, two sleeping computers made each request of the window wait
    up to 10 seconds every 45 seconds, three on the Projects tab
    held all 6 connections, and clicks on buttons came late after
    Yonder ran for a while.
  - The Context tab of an agent says "Loading…" until its chat comes.
    Else it stays blank while the link is down.
  - `bun run check-relay` checks a connect with no handshake and a dead
    open connection.
- The bridge connects out to the relay (`bridge/relay.ts`), so the Mac
  needs no open port. It connects again after a drop or a sleep. The
  relay is `YONDER_RELAY=wss://...` in `~/.config/yonder/.env`, else
  `wss://relay.yonder.so`. The live relay has no `ROOMS`, so each Mac
  that downloads Yonder connects. The frames
  stay end-to-end encrypted, and only the Mac knows the token of its room.
  To use another relay, put `YONDER_RELAY=wss://...` in the `.env`, or
  use the Relay tab of Pair a phone.
- The Relay tab of Pair a phone shows the address of the relay in a
  field. Save writes `YONDER_RELAY` in the `.env` (`PUT /relay?url=`),
  and the bridge leaves the old relay and joins the new one at once,
  with no restart. Use default removes the line and joins
  `wss://relay.yonder.so`. The keys and the room of the Mac stay the
  same. A phone keeps the relay of its pairing, so each phone pairs
  again after a change, and the dialog makes a new code. The phone
  cannot change the relay, because `/relay` is not in `PATHS`.
- A user can run an own relay, so that no connection of the phone goes
  through our server. The relay code is in its own public
  repository, the relay repository (yonder-relay), with the MIT license. Its README
  tells how to start it with Docker and Caddy, and what the relay sees
  and why. Then the user puts the `wss://` address in the Relay tab. The
  live relay runs the pushed code of that repository, so the code that
  people can read is the code that runs.
- The local network: a phone on the same network as the
  Mac reaches the bridge with no relay, so no frame leaves the network.
  The bridge listens on port 7786 (`LAN_PORT` in `bridge/relay.ts`) on
  all interfaces, with the protocol of the relay: the same handshake, the
  same paired keys, and the same encrypted frames. The port opens a socket
  only for the room of this Mac and only from a private address (10/8,
  172.16/12, 192.168/16, 169.254/16, 100.64/10 of a VPN such as
  Tailscale). It serves no endpoint of the bridge, which stays on
  127.0.0.1. After each connection the phone asks `/lan` through the
  encrypted link, and keeps the addresses of the Mac in localStorage
  (`lan:<key of the Mac>`): the Bonjour name (`<LocalHostName>.local`),
  which stays when the router gives the Mac a new address, and each
  private IPv4 address. The next connection tries all of them at the same
  time, for 1.5 seconds, and then the relay (`linkFetch` in `src/link.ts`).
  On the relay, the phone tries the local network again every 30 seconds,
  so it goes back to it when it comes home. The settings of the phone show
  "Local" or "Relay" on the computer in use (Environments), with the time
  of the last poll of the agents, such as "Relay · 180 ms", to show the
  speed of the link. Paired
  phones on the Mac shows the same for each phone. The iPhone app needs
  `NSAllowsLocalNetworking` (from iOS 17, App Transport Security blocks an
  IP address without it) and `NSLocalNetworkUsageDescription` in
  `ios/Info.ios.plist`, so an app with no such keys always uses the
  relay. The release build of Android blocks clear text, so Android always
  uses the relay. The bridge stays on the relay also at home, for the
  phones away, the Claude connector and the other computers. The local
  network keeps the link off the public internet when it is not
  necessary.
- Face ID for the relay (`GUARD` in `bridge/relay.ts`):
  the row "Face ID for the relay" in Face ID of the settings of the
  iPhone. On gives the Mac the public key of a P-256 key in the Secure
  Enclave (`Guard.swift`), which signs only after Face ID or the passcode
  of the phone (`.userPresence`, as the lock of the app, so a new face does
  not lock the user out). Then the Mac answers that phone through the relay
  only with 423 and a challenge, until the phone signs the challenge
  (`/unlock`). One yes opens the relay for that phone until it connects
  over the local network again, 12 hours at most. On the local network it
  needs no Face ID. The Mac checks the signature with WebCrypto, so a copy
  of the pairing key or a bad front end alone cannot use the relay. At a
  423 the phone first tries the local network, then asks for Face ID one
  time for all the requests that wait (`unlock` in `linkFetch` of
  `src/link.ts`). The prompt waits until the app is in front with no lock
  screen, and after a cancel the phone does not ask for a minute. Until
  then each call fails as offline, so the outbox keeps a new agent or a
  message. A change of the row needs the signature of the key in use
  (`/guard`), and the first key signs for itself. The car and the watch
  have their own keys in Swift, which the web view cannot read, and no
  Face ID, so they use the relay with no Face ID. They and the share sheet
  get only their own paths (`CAR_PATHS`: `/mcp`, `/car`, `/token`,
  `/awake`, `/paste`, `/log`, `/transcript`, `/file` and `/video`), not
  the yes of an approval or of 1Password. Only the phone's own key can
  give a key or a computer. With the key on, a new car key, a new watch
  key or a new computer in `/peers` needs the signature of the key, also
  on the local network and while the relay is open: the Mac answers 428
  with a challenge, and the phone sends the request again with `sig`
  (`guardedPost` in `src/link.ts`). The same value again, or a new name,
  needs none, so the phone asks for Face ID only when the value changes.
  The other computers and the Claude connector do not use the relay key. The simulator
  has no Secure Enclave, so it uses a software key behind the same prompt.
  When the key on the phone is lost, Revoke the phone on the Mac and pair
  it again. Paired phones on the Mac shows "Face ID" for each phone with
  the key. This keeps a connection through an external relay safe, also
  when the pairing key slips out.
- The bridge runs the request of a phone on its own endpoints with
  `fetch`, so the request passes the same Host and Origin checks. A phone
  can use only the paths of the app (`/mcp`, `/token`, `/conversation`,
  `/calls` and others). It cannot pair more phones or record the screen.
- Pair a phone in General of the settings, or File > Pair Phone…, shows a QR code (CoreImage, through `osascript`) with
  the relay, the room, the public key of the Mac and a one-time secret.
  "Pair my phone" or "show the QR code" by voice: Grok calls
  `pair_phone`, which the app answers, and the same dialog opens.
  The code works one time, for 5 minutes. When a phone pairs, the
  dialog hides the code at once and makes no new code until the user
  clicks New code, so one QR code pairs one phone only. The bridge
  also refuses a second phone with a used code. The dialog has two tabs: Pair
  shows the code, and Paired phones lists the phones, with the time each
  phone was last seen and a Remove button. A third tab, Relay, sets the relay (see below). The
  bridge serves it on `/relay` (GET the state, POST a new code, PUT
  another relay, DELETE a phone).
- A new code lets a new device in with the paths of a phone, also the
  yes of 1Password and of the approvals. So on a Mac each POST of a code
  needs Touch ID or the password of the Mac, which the bridge asks itself
  (`ownerCheck`). Two asks at the same time both fail, so a program cannot
  ride on the Touch ID of the user. The dialog makes no code by itself
  after the first one: when a code runs out or Touch ID says no, it shows
  New code. Linux and Windows have no such prompt, so `yonder pair` makes
  a code with no check there. On each computer, each new pairing sends the
  push "A new phone paired" to the phones that were paired before, so a
  pairing that the user did not make shows.
- Revoke in Paired phones ends the access of
  a phone. The bridge deletes the phone from `relay.json` and closes
  its connections with "The Mac removed this phone." A later connection
  gets "This phone is not paired with the Mac. Pair it again." The
  relay gives each reason to the phone with the close code 4003. At
  either reason, `unpair` of `src/link.ts` on the phone deletes the
  pairing from IndexedDB, clears `localStorage` (the account, the
  settings and the front end of the bridge), and reloads to the pairing
  screen. A phone that is offline at the revoke does this when it
  connects again. Else the phone only shows "Offline" and keeps its
  data. The CarPlay link of Swift keeps its copy of the pairing, but
  the bridge refuses it, because the key of the car goes with the
  phone. The dialog shows each phone in a box with a phone icon, "Last
  seen 5m ago", and a red Revoke button.
- The encryption is in `src/link.ts`: ECDH on P-256 (Bun has no X25519),
  HKDF and AES-GCM, with new keys for each connection and a counter on
  each frame. A replayed frame does not open. Only a frame that fails
  AES-GCM asks the user to pair the phone again. Any other failure in
  that step says "The Mac did not answer." Else each small failure asks
  to pair again. A lost frame also
  stops each later frame, because the counters then do not match. So
  the socket of the local network closes when more than 64 MB waits to
  go out, as on the relay, and the phone connects again. Else Bun drops
  the frame there past 16 MB and sends the next one, and the phone asks
  to pair again.
- `~/.config/yonder/relay.json` (mode 600) holds the private key of the
  Mac, the token of its room and the public keys of the paired phones.
- `bun run check-relay` checks the relay, the pairing and a fake phone. It
  needs no running bridge.
- The iPhone app has its own Tauri shell in `ios/`, and the Mac app stays
  in `src-tauri`. Both run the same React code in `src/`. `ios/` holds only the window, the QR
  scanner (`tauri-plugin-barcode-scanner`) and the push notifications
  (`tauri-plugin-notifications`). Its Xcode project is in
  `ios/gen/apple`.
- Three Tauri projects are in the repository, so each command names its
  project with `TAURI_APP_PATH`: `install-app` uses `src-tauri`,
  `bun run ios ...` uses `ios`, and `bun run android ...` uses `android`.
- `bun run install-ios` builds the app and installs it on the iPhone of
  the user over the cable (`xcrun devicectl`). `IPHONE=<UDID>` selects
  another phone. Open Yonder on the phone after the install: an install
  cannot open the app while the phone is locked.
- The lowest versions are iOS 17 and watchOS 10, in `ios/gen/apple/project.yml` and `ios/tauri.conf.json`.
  iOS 17 gives `@Observable` (the share sheet), StoreKit views and the
  async microphone permission of `AVAudioApplication` (the watch). The share sheet uses `NavigationStack`, and the watch reads no
  image names to VoiceOver, keeps still with Reduce Motion, and ends a call with the symbol of the Live Activity.
- To see how the phone app looks, run `bun run sim`. It builds the app
  for the simulator, and installs and opens it on the iPhone 17
  simulator with iOS 27 (402 points wide). `SIM=<UDID>` selects another
  simulator.
  1. Use a simulator with iOS 27. On this Mac, the iOS 26.2 runtime
     crashes the web content process of WebKit, and the app goes blank.
  2. Pair the simulator one time. A reinstall keeps the pairing. Make a
     code with `curl -X POST http://127.0.0.1:7787/relay`, approve it with
     Touch ID, and put its `link` on the clipboard of
     the simulator with `xcrun simctl pbcopy <UDID>`. Tap "Scan the
     code": with no camera, the screen then shows a field for the link.
     Tap the field and paste (`axe key-combo --modifiers 227 --key 25`), then press
     Enter (`axe key 40`). Do not type the link: the keyboard makes the
     first letter a capital.
  3. Take a screenshot with `axe screenshot --udid <UDID> --output
     <file>`, and tap with `axe tap -x <x> -y <y>` in points.
  4. In a worktree, set `CARGO_TARGET_DIR` to the `ios/target` of the
     main checkout, or the first build compiles all of Tauri again.
  5. Remove the pairing of the simulator when you are done
     (`DELETE /relay?phone=<public key>`).
- `bun run install-ios` installs a debug build. A TestFlight build is a
  release build. In a release build, the SwiftPM of Xcode 27 makes the
  internal `@_cdecl` functions of the Swift part of Tauri local
  (`log_stdout`, `retain_object` and others), and the link fails.
  `ios/swift-rs` is swift-rs 1.0.8 with one change: a release build
  compiles the Swift code with `-enable-testing`, which makes these
  functions public, as in a debug build. The Swift code stays optimized,
  and `#if DEBUG` code stays out. `[patch.crates-io]` in `ios/Cargo.toml`
  uses this copy. When a swift-rs after 1.0.8 fixes
  Brendonovich/swift-rs#81, delete `ios/swift-rs` and the patch. The
  swift-rs warning "run `rustup component add llvm-tools`" does not fix
  the link alone, because swift-rs 1.0.8 then makes global only the
  functions of the own module of each package, not the ones of
  `SwiftRs.o`.
- `bun run ios build --export-method app-store-connect` builds the
  TestFlight IPA. The export needs the Apple account of the team in Xcode
  (Settings, Accounts), so that Xcode can make the Apple Distribution
  certificate and the App Store profile. Without the account, the export
  fails with "No Accounts". With it, Apple Distribution signs
  `ios/gen/apple/build/arm64/Yonder.ipa`,
  with the App Store profile of `com.vladartym.yonder`. An upload to
  TestFlight also needs an app with this bundle ID in App Store Connect.
- `bun run testflight` builds that IPA with the version "2.B.N" (see Versions; N is the
  commit count), as `bun run play` does, because App Store Connect
  refuses a build number that it already has. It first writes the same
  version into the Info.plist of the widget extension `YonderIsland`,
  because App Store Connect wants the versions of an extension and its
  app to match (ITMS-90473), and Tauri writes only the plist of the app.
  Do not commit that change. With `ASC_KEY_ID` and `ASC_ISSUER_ID` set,
  the script uploads the IPA with `xcrun altool`. The app in App Store
  Connect is "Yonder: Voice Coding Remote". The status of its forms is
  at the top of `ios/store/listing.md`. A build can also go up from the
  Xcode Organizer ("The stores" in `docs/mobile.md`). The extension
  needs a `CFBundleDisplayName` ("Yonder"), else App Store Connect
  refuses the build.
- The export of Tauri can fail with "No Accounts", and the team key
  "Yonder TestFlight" (App Manager) has no access to the
  cloud signing of Xcode. So `bun run testflight` makes only the
  archive with Tauri (`--archive-only`), and `xcodebuild -exportArchive`
  signs it with `ios/store/AppStoreExport.plist`: manual signing with the
  Apple Distribution certificate of the team and the App Store profiles
  "Yonder App Store yonder", "Yonder App Store yonder.island" and "Yonder
  App Store yonder.watchkitapp". It works in a background job, with
  nobody at the Mac, and it includes the watch app.
  - The certificate was made
    with the App Store Connect API from a request of `openssl`. Its key,
    the certificate and a `.p12` copy are in `~/.config/yonder/distribution/`
    (mode 600), and the `.p12` password is in `secrets.env` there. The
    identity is in the release keychain (`yonder-release.keychain-db`),
    which the script unlocks with `release.env`, as for the Mac release.
    Do not make another one.
  - The profiles name this certificate. When it expires, or when an App
    ID gets a new capability, make new profiles with the same names (the
    API: `POST /v1/profiles`, type `IOS_APP_STORE`), and put them in
    `~/Library/Developer/Xcode/UserData/Provisioning Profiles`.
  - The archive of Tauri is not signed, so the export keeps no
    entitlement of the app. Else a build goes to App Review with no
    Sign in with Apple, no push and no keychain group of the share
    extension. So `ios/store/entitle.sh`
    signs the archive ad hoc with the entitlements of each target before
    the export. Check a new IPA with
    `codesign -d --entitlements - Payload/Yonder.app`.
  - Run `bun run testflight` with the variables of `release.env` set
    (`set -a; . ~/.config/yonder/release.env; set +a`), as the iOS job of
    `release.yml` does. Without them, Tauri signs
    the archive with the Xcode account, and it fails with "No Accounts".
    With them, the archive is not signed, and the export signs it.
  - The internal TestFlight group "Team" (all builds) has the account
    holder.
- The store listings are ready: `ios/store/listing.md` for App Store
  Connect and `android/store/listing.md` for the Play Console, with the
  answers for each form, the privacy labels, the age rating, the export
  compliance, the review notes and the screenshots. The hand steps are in
  "The stores" in `docs/mobile.md`.
  - The iPhone app is for the iPhone only (`TARGETED_DEVICE_FAMILY` 1),
    so App Store Connect asks for no iPad screenshots. The web view of an
    iPad sends the user agent of a Mac, so `phone` in `src/bridge.ts`
    would be false there. Nobody tested the app on an iPad.
  - `ITSAppUsesNonExemptEncryption` is `false` in `ios/Info.ios.plist`.
    The end-to-end encryption uses the WebCrypto of WebKit, which is the
    encryption of iOS, so the app is exempt.
  - `bun android/store/render.ts ios` makes the iPhone screenshots at
    1320 × 2868 (6.9"), with the Dynamic Island, in `ios/store/`. Google
    Play refuses screenshots with alpha or with a long side of more than
    2 times the short side, so the listing uses the 1080 × 1920
    screenshots of `screens.html`.
  - A reviewer cannot pair a phone with a Mac, but the
    app opens with no pairing, so the reviewer can sign in. Apple asks for "a demo
    video or the hardware" in that case, so the review notes offer a
    demo video and a live pairing. A demo mode in the app is the
    fallback if App Review refuses the app.
  - The phone has no link to buy a plan on yonder.so. The App Store
    allows such a link only in the United States storefront (guideline
    3.1.1), and Google Play only in its billing choice program.
- `bun run ios` removes `FORCE_COLOR`. `tauri ios init` writes its value
  (3) into the Xcode build step, and the build then fails with "3 isn't a
  known arch". `project.yml` and `project.pbxproj` have no 3 there.
  After a new `tauri ios init`, check that step.
- The Android app has its own Tauri shell in `android/`, as the iPhone
  app has in `ios/`, with the same React code and the QR scanner. Its
  Android Studio project is in `android/gen/android`. "The Android app" in `docs/mobile.md` gives the
  setup, the hand edits in `android/gen/android` and the emulator steps.
- `bun run android ...` runs the Tauri CLI for Android. It sets
  `JAVA_HOME` to the Java of Android Studio, `ANDROID_HOME` and
  `NDK_HOME` (the newest NDK), when they are not set. `/usr/bin/java` is
  Java 8, and Gradle does not run on it.
- `bun run emu` builds the debug APK for arm64, starts the emulator
  `pushtest` (Pixel 7, Android 15) with no window when it is off, and
  installs and opens the app. `EMU=<name>` selects another emulator.
  `bun run install-android` installs the app on an Android phone on the
  USB cable. In a worktree, set `CARGO_TARGET_DIR` to the
  `android/target` of the main checkout.
- `bun run release-android` (`android/release.ts`) builds the signed
  release APK for arm64 and armv7, and puts it on
  https://download.yonder.so/Yonder.apk, the Android link of yonder.so.
  Testers install it from the browser, with no Google Play. The APK has the signature of the upload key, and
  Google Play signs its copy with its own key. So a Play copy does not
  update an APK copy: the tester must remove the app first. The screen
  updates over the air, but a native change needs a new APK.
- A phone with an older native app shows "Update available" on the
  call button, and a tap opens the new app: Yonder.apk on Android, the
  App Store on the iPhone. The release writes `latest-android.txt` on
  download.yonder.so, and the iPhone asks the App Store lookup. Only
  the build number B counts (`storeUpdate` in `src/front.ts`). The
  notice shows only with no call and no update of the screen, and a tap
  hides it until the next start. The iPhone gets no notice until Yonder
  is on the App Store. The bucket allows reads from the origins of the
  phone app (`cf r2 cors yonder-downloads`). An old native app can have
  a bug that only a new app fixes, such as a crash at each scan of the
  pairing code.
- A copy from Google Play opens its page in Play in place of Yonder.apk
  (`play` in `MainActivity.kt` asks Android which store installed the app).
  It reads the same `latest-android.txt`. Yonder installs no update itself:
  it shows only the notice and the blue button.
- The Android app has all the features of the screen. It does not have
  these parts of the iPhone app, which are native: the Live Activity (the
  call notification of `CallService.kt` does its work), CarPlay, the Apple
  Watch app, the native tab bar and round buttons in Liquid Glass (Android shows those of the web page), the
  recent photos of the attach sheet, and the shrink of videos to 720p. The
  recent photos need a permission to read all photos, which Google Play
  allows only for apps about photos, so the Photos button uses the photo
  picker of Android.
- `bun run play` builds the signed release bundle (AAB) of the Android
  app for Google Play. The upload key is in `~/.config/yonder`. The
  listing, its pictures and the answers for the Play Console are in
  `android/store/`. The store screenshots come from `screens.html` there,
  with mock projects and agents: edit it, then run `bun
  android/store/render.ts`. The privacy policy is
  https://yonder.so/privacy/, and the terms are https://yonder.so/terms/
  (see "Related tasks"). "Google
  Play" in `docs/mobile.md` gives the details.
- On Android, the back gesture closes an open menu or picture, then the settings,
  then the conversation or the call (`onBackButtonPress` in
  `src/App.tsx`). At the list, the app goes to the background, and a live
  call stays on. The default of Tauri ends the app. During a scan, the
  back gesture stops the scan.
- A tap on Android shows no blue box. The web view of Android paints a
  blue box over each element that the user taps, and
  `-webkit-tap-highlight-color: transparent` on `html` and `body` in
  `app.css` turns it off for the whole app.
- The web view of Android gives `env(safe-area-inset-*)` only for a
  cutout of the screen. So `MainActivity.kt` gives the sizes of the
  status bar and the navigation bar to the page, and the CSS uses them
  (`--inset-*`). The keyboard makes the web view shorter, so that the
  message box stays above the keyboard.
- On iOS, the keyboard covers the web view and does not make it
  shorter. Else WebKit moves the page up to show the text field, and the
  user can scroll the whole app up and down. So `src/main.tsx`
  follows `visualViewport`, and the CSS puts `main` on the part of the
  page over the keyboard. The prompt box sits on the keyboard, as in
  Messages, and only a list with content scrolls. An open conversation
  stays at its last message when the keyboard opens. On iOS 26 the
  keyboard can also make the web view shorter, so a size check alone
  misses it, the home bar gap stays under the message box, and the
  window behind shows black under the bar of the keyboard. So a text
  field with focus counts as the keyboard too, and
  `paint_window` (`Island.swift`) gives the window the `--bg` color.
  WebKit puts a bar over the keyboard (up and down arrows and a check),
  which makes the keyboard taller than in Signal, and black shows around
  it. So `hideFormBar`
  (`Island.swift`) removes the bar: the view of the page gets a
  subclass whose `inputAccessoryView` is nil. It is native code. The web
  view and its scroll view have the black of dark mode, which shows at
  the round top corners of the keyboard. So `paint_window` gives them
  the `--bg` color too, with `isOpaque` false and
  `underPageBackgroundColor`. In the iOS 27
  simulator, the corners then have the `--bg` color (#161616). The
  simulator with no Simulator app keeps a hardware keyboard, so the
  keyboard does not show. The private `setHardwareKeyboardEnabled:keyboardType:error:`
  of `SimDevice` (CoreSimulator) turns it off. The icons of the system bars
  follow the theme of the app.
- In an open conversation, on the Context tab, a drag back to
  older messages hides the keyboard, as in Signal. The finger must go
  down by 10 px or more (`dragHide` in `src/App.tsx`), so a tap and a
  drag to newer messages keep the keyboard open. When the keyboard
  closes, WebKit slides the page
  back down over about 0.3 s, but `visualViewport` gives the end position
  at once. Else `main` goes there at once, and the whole page, header
  and all, jumps up by the height of the keyboard and slides back down.
  So `src/main.tsx` sets
  `data-closing` on a focusout that closes the keyboard, and `main`
  goes to the end position with a transition that follows the slide
  of WebKit: `cubic-bezier(0.3, 0.8, 0.35, 1)`, 0.31 s, 16 ms delay.
  The curve came from a screen recording of a test page in the iOS 27
  simulator (`xcrun simctl io recordVideo`). With it, the header moves
  about 20 pt during the close, in place of 330 pt. Until the transition
  ends, `fit` ignores a size of `visualViewport` with the keyboard. A bundle from the
  bridge runs next to the `main.tsx` of the installed app, and the old
  focusout sets the size with the keyboard again in a timeout, so the
  new focusout sets the end position again in a later timeout. The
  opening of the keyboard has no transition.
- During a call, the Android app keeps a foreground service on
  (`CallService.kt`). Without it, Android silences the microphone about
  10 seconds after the screen locks. With the service, the
  emulator kept the microphone on for 20 seconds with the screen locked.
- The scanner of Android does not ask for the camera, so the app asks
  first. The app asks first on iOS too: else the scanner of
  iOS fails the first scan with "Camera permission denied or not yet
  requested" while the system asks. The photo button opens the photo picker of Android, with no
  camera choice. The Android app has no push notifications yet, because
  they need Firebase. The steps are in `docs/mobile.md`.
- On the phone, `phone` in `src/bridge.ts` is true (from the user agent).
  Each request goes through the relay: `bridgeFetch` and the MCP client
  use `linkFetch` of `src/link.ts`. A favicon or a media file of the
  bridge loads as a blob URL (`useBridgeSrc`). The phone loads the whole
  file at once, so a large video is slow.
- A load of such a file that fails with no answer, or with an error of
  the bridge (500 or more), tries again while the file is on the
  screen: after 2 seconds, then twice as long each time, 30 seconds at
  most. A 404 ends it. Else a load that a drop of the link
  or a restart of the bridge stops shows a broken picture until the
  user opens the chat again. `bun bridge/images-e2e.ts` checks it
  through the relay: the first load fails on purpose, and the picture
  must still show. It also checks the time of the poll in Settings ›
  Environments.
- When the connection to the Mac fails, each request that waits on it
  gets the offline error, and the next request connects again. Else a
  second request that waits at the same time reads
  `conn` after the first one has cleared it, and the phone shows
  "undefined is not an object (evaluating 't.catch')" and not the
  offline error. `bun run check-relay` tests two requests at the same
  time.
- Requests that find the socket closed at the same time share one new
  connect: the first one starts it, and each other one takes it. A
  failed connect clears `conn` only while `conn` is still that connect,
  so the next request connects again. Else a failed connect
  gives the `t.catch` error to a request that waits on another connect.
  Else also, on a slow link, the phone opens 9 sockets in 4 seconds, and 8
  of them stay open with no request. `bun run check-relay` tests both
  cases.
- The phone keeps the blob URL of each favicon until the app closes.
  Else each switch of a tab loads the favicons again through the
  relay, so they show late.
- The phone also keeps the favicons on its disk (the Cache API, a cache
  of its own for each Mac). After a start of the app, a kept favicon
  shows at once, and the phone asks the Mac again for the next start.
  The bridge gives each favicon `cache-control: max-age=3600,
  stale-while-revalidate=604800`, so the Mac app keeps it too. Else the
  favicons of All projects load again on each visit and show late.
- The phone also keeps the blob URL of each picture, video and sound in
  the chat of an agent, until the agent closes or goes from the list
  (`forgetMedia` in `src/bridge.ts`). A sub-agent keeps its files with its
  parent. Else each visit to the agent view loads the files again
  through the relay.
- The bridge gives each local file of a chat the time of its last change
  (`v` in `bridge/media.ts`), and the app puts it in the URL of the file.
  So when an agent writes a new picture or video to the same path, the
  next message shows the new file, not the kept one.
- The phone also keeps the last 200 pictures, videos and sounds of the
  chats on its disk, in the Cache API (`loadBlob` in `src/bridge.ts`),
  one cache for each Mac. Else a start or an update of the app empties
  the kept files, and each chat loads them again through the relay. A
  file of 20 MB or more is not kept. Because each URL carries `v`, a kept
  file is never old. The bridge also sends `/media` with
  `Cache-Control: private, max-age=31536000, immutable`, so the Mac app
  keeps the files too.
- The phone keeps its pairing in IndexedDB, because IndexedDB stores the
  private key as a non-extractable `CryptoKey`. Each read and write of
  IndexedDB (`store` in `src/link.ts`) tries once more after 300 ms.
  iOS can end the storage process of WebKit while the app is in the
  background, and the request at that moment fails with "Connection to
  Indexed Database server lost", for example at a scan of a pairing
  after hours in the background. A new open works again. Without a pairing, the
  app opens on its main screen with empty lists, and the call button
  says "Pair your computer". Settings and Account work, so a new user,
  and App Review, can sign in. The call button opens the pairing screen (`src/Pair.tsx`)
  with a Cancel button, and a pairing moves the app to the new computer
  with no new load (`moveTo`). The poll of the agents waits for a
  pairing (`isPaired` in `src/bridge.ts`). With no pairing, the empty
  Agents tab says "Pair your computer to see its agents.", and the New
  agent and New chat buttons hide. The pairing screen has the bird mascot, which
  waves, on a red screen, "Yonder", and a white "Scan the code"
  button. It has no field for the `yonder://pair` link. Only after a failed scan, for example in the
  simulator with no camera, a field for the link shows.
- On iOS the camera of the scan has an X at the top right, which stops
  the scan and goes back to the pairing screen. The scan is `windowed`:
  the camera is under the web view, and `.scan-view` makes the page clear.
  Else the scanner puts its camera over the page, with no button, and
  the user cannot leave it.
  Android keeps its full-screen scanner, and the back gesture stops it.
- The gear button at the right of the title bar opens the settings of the
  phone. It is a glass circle of 44 px with a glyph of 20 px, as all the icon
  buttons of the title bar and of a conversation (see the native buttons below). It opens the settings (`src/Settings.tsx`): the light or dark theme, the relay and the
  room of the paired Mac, and Unpair. The settings are a full page that
  slides in from the right. The back button or a swipe to the right
  goes back, as in a conversation. Unpair forgets the Mac, for example
  after the Mac removed the phone. Unpair also clears the data of the
  app, as a revoke on the Mac does (`unpair` in `src/link.ts`).
- The phone can pair with more than one Mac, and switch between them
  without an unpair. The
  Environment tab of the settings, before General, shows a row for each
  computer under the heading Computers, and a Pair a computer row. The Mac has no
  Environment tab.
  - The i at the right of a row shows the relay, the room, and Unpair.
    Each row has a tag and a switch (see below).
  - The note under the list and the pairing screen tell both ways to
    pair: the QR button of Yonder on a Mac, and `yonder pair` over SSH
    on a Linux server.
  Pair a computer shows the pairing screen
  with a Cancel button. A new pairing becomes the Mac in use.
  IndexedDB keeps each pairing under the public key of its Mac, and the
  key `mac` holds the pairing in use (`src/link.ts`). Switch makes the
  other pairing the one in use, removes the data of one Mac from
  `localStorage` (the open project, the view, the outbox and the front
  end of the bridge), and moves the app to the other Mac with no reload
  (see the switch during a call, below). The account and the settings
  stay. Unpair, or a revoke, of the Mac in use switches to the next Mac.
  Only after the last Mac does the phone clear all its data and show the
  pairing screen. The QR code of the bridge gives the name of the Mac
  (`scutil --get ComputerName`) in `name`. A pairing with no name shows
  "Mac" in its row. A Linux server gives its host name.
- The agents of the other computers: the phone shows
  them with no switch.
  - `src/elsewhere.ts` opens a relay link and an MCP client of its own to
    each other paired computer, and calls `list_workers`. Each bridge has
    that tool, also an old one, so an older computer works too. These
    links do not give the push token or the keys of CarPlay and the watch.
    The link of the computer in use closes, because `src/bridge.ts` talks
    to it.
  - On the Agents and Done tabs of All projects, the agents of each other
    computer show under its name, after the projects. They load every 15
    seconds while that list is on the screen, and every 3 seconds while
    one of them is open. A row has no swipe and no menu, because its
    actions would go to the computer in use. The agents
    of each other computer show under a title for each project, such as
    "Studio · sundial", and the titles of the computer in use also start
    with its name when agents of another computer show. The second line
    of a row is the model and the effort. A computer with no answer in 8 seconds does not show there.
    Its row in the Environment section of the Settings shows
    "Disconnected" instead.
  - A tap on such a row opens the agent over the list, as an agent of
    the computer in use, with no switch. `opened` is then `@`, the
    computer and the ID (`src/App.tsx`). The chat loads, and the
    messages, Stop, Done and the model go, through the link of that
    computer (`reach` in `src/elsewhere.ts`, and `LinkOf` in
    `src/App.tsx`). The paper clip and Preview do not show, because the
    files and the tunnel are of the computer in use. Grok gets the
    agent and the name of its computer, and reaches it with
    `other_computer`. While that computer gives no answer, the last
    known agent stays open. A tap does not switch to that computer,
    because a switch breaks the dictation, for example on Windows.
  - Grok on the phone has the tool `other_environments`: the agents that
    are not closed of each other computer, or that it is offline. Their
    numbers are of that computer. The calls of CarPlay and the watch do not
    have it.
  - The phone stays on the computer in use. To start,
    message, check or stop an agent on another computer, Grok calls
    `other_computer`, not `switch_environment`. On the phone, the app runs
    that call itself through its link (`onOther` in `src/elsewhere.ts`),
    with no trip through the queue of the bridge, so it works also with
    the screen off. The prompt of Grok says to call `switch_environment`
    only when the user asks to switch. Else the phone switches to the
    Windows computer for an agent there, and the dictation then fails
    with "Press Windows + H to dictate on Windows."
  - `other_computer` runs any tool of Yonder on the other computer, with
    the arguments of that tool, so Grok can also rename or close an
    agent there.
    The bridge there checks the name, the arguments and its own rules,
    such as the question of `preview` before a tunnel. Only
    `other_computer` itself does not go through. On each voice,
    `runTool` in `src/voice.ts` gives the tool there the same checks of
    the words of the user as here: a close or a remove needs the words
    of the user, and a plain close does not mark it as completed. The
    checks of agent numbers stay out, because the numbers are of that
    computer. A `computer` input on each tool was the other option. It
    adds an input to about 50 tools for Grok and for each agent, and
    each check of `runTool` would need a branch for it, so Yonder keeps
    one tool.
  - Each row of Computers (Environment section of the Settings) has the
    name, a tag, Connected or Disconnected, a switch and the i. The phone
    asks each computer, also a hidden one, for the tag. The switch shows
    or hides that computer on this phone: a hidden computer does not show
    its projects on the Projects tab, its agents on All projects or its
    apps on the Apps tab, and `other_environments` of Grok leaves it out.
    All show by default. The last computer that shows cannot be hidden.
    A tap on a row does nothing, and the row has no check: the phone
    picks the computer in use by itself. It is the computer of the last
    project that the user opened. When the user hides the computer in
    use, the phone moves to the next one that shows, a connected one
    first. The phone stays connected to all the computers while the app
    runs.
  - The Projects tab shows the projects of each computer that shows,
    under the name of the computer: the computer in use first, under All
    projects, then each other one (`elsewhereProjects` in
    `src/elsewhere.ts`, which calls `list_projects` there every 15
    seconds while the tab is open). A computer with no answer in 8
    seconds shows no projects. A project of another computer has a
    folder icon, the count of its agents and no star. A tap on it moves
    the phone to that computer (`switchPairing`, which keeps a live
    call) and opens the project, so its agents, a new task, the files
    and Preview all work as on the computer in use. The
    projects of each other computer start closed under its name, and
    a tap on the name opens or closes them. A search shows them all. The phone
    keeps the public keys of the hidden computers in `hiddenComputers` of
    its localStorage, and each phone has its own list. A hidden computer
    stays paired: Grok and the agents still reach it with `other_computer`
    when the user names it, and the computers still reach each other.
  - The environment dropdown: the title bar has a
    second pill after the project pill, on the phone and on the Mac,
    when the device knows another computer. Its choices are All
    environments, the computer in use ("This Mac" on the Mac), and each
    other computer that shows. All shows the projects and the agents of
    each computer that shows, under the name of each computer. The
    computer in use shows only its own. On the phone, a pick of another
    computer switches to it (`switchPairing`), as a tap on one of its
    projects does, and the pill then shows that computer. Each device
    keeps its pick in `environmentPick` of its localStorage. The pick is
    only for All projects: a project of the computer in use shows its
    agents with any pick.
    On the phone, the project and the environment are
    two buttons of 44 px with only an icon, the size of Settings, and
    they center on the same line as Settings and the usage. The project
    button shows the favicon of the project, or a folder for All
    projects, and opens the Projects tab. The environment button shows
    a monitor, has a native glass twin, and opens its choices in the
    card from the bottom (`Picker`), with a tick on the choice in use.
    The project button has no native twin, because a native button
    cannot show a favicon. The name of each choice is in the label of
    its button. Names do not fit beside the usage, so the buttons show
    only icons.
    ⌘E (`environmentKey` of Settings › Keys) moves the lists to the
    next environment: All, the computer in use, then each other computer
    that answered the last load, so an offline computer is skipped. An
    open agent and the New agent view keep ⌘E for Effort.
  - The Mac acts as the computer that it picks, as if the user works on
    that computer. With All
    projects and another computer picked (`farPick` in `src/App.tsx`):
    - The New agent view says "It starts on <computer>.", and the agent
      starts there (`start_worker` through the link of that computer,
      `far` of `NewAgent`). That computer picks the project from the
      task. The files of the paper clip are on this Mac, so they do not
      go, and the paper clip does not show.
    - The Projects tab shows the projects of that computer open, with
      All projects of that computer first. A click on a project opens it
      (`farPath`): the title shows its favicon and its name, the lists
      and the tab counts show only its agents, and a new agent starts in
      it. A new pick of the dropdown closes it.
    - The title bar shows the Claude Code usage of that computer
      (`farUsage`, its `/claude-usage` through `/peer`). That computer
      must have a bridge with `/claude-usage` in
      `PEER_PATHS` of `bridge/relay.ts`. An older bridge answers 403,
      and then no usage shows. The Usage section of the Settings stays
      of this Mac.
  - The favicons of the projects of another computer:
    the Projects tab and the titles of the agent lists load each one
    from that computer, through its link (`Favicon` reads `LinkOf`, on
    the phone and on the Mac).
    A title of agents in a worktree has no favicon, because the path of
    the agent is not the path of the project.
  - The name of an environment: each computer keeps its
    own name in `computerName` of its `config.json`, and an empty value
    gives the name of the system (`scutil --get ComputerName`, else the
    host name; `computerName` in `bridge/relay.ts`). The Mac renames
    itself in the Name row of Settings › Environments. The phone renames
    any of its computers in the Name row of the details (i) of that
    computer: the pairing takes the name at once, and the phone writes it
    to that computer through `/settings`. The pairing code gives the name,
    and the answer of `/peers` gives it again, so a phone learns a name
    that changed on a Mac (`renamePairing` in `src/link.ts`). The new name
    changes the lists of `introduce`, so the next poll of the phone tells
    each other computer. So another Mac sees a new name only after the
    phone app opened once. The name is not a setting that syncs, because
    each computer has its own. Grok and `other_computer` use the new name.
    A "Can reach" block holds the public key of the computer, not its
    name, so it stays after a rename. An older block by name stops after
    a rename.
  - The Mac also shows the other computers. The Mac has
    no pairings, so it asks its own bridge: `other_computer` with no
    computer gives the names, and with a computer it runs
    `list_workers` or `list_projects` there (`computers` and `askOthers`
    in `src/elsewhere.ts`). The name of a computer is its key on the Mac.
    The Projects tab and the Agents, Done and Saved tabs of All projects
    show them as on the phone. The Mac cannot switch to another
    computer, so its pick of another computer shows only the agents and
    the projects of that computer, and the tab counts are of that
    computer. A tap on a project of another computer picks that
    computer. A click on an agent of another computer opens its chat
    over the list, as on the phone. The Mac app sends each request of
    that chat to its own bridge (`/peer?computer=<name>&path=<path>`,
    `viaPeer` in `src/elsewhere.ts`), and the bridge sends it on through
    the relay (`reach` in `bridge/relay.ts`). Both bridges must have
    `/peer`. The pictures, videos and sounds of that chat also come
    through that link (`useBridgeSrc` in `src/bridge.ts`), because the
    own bridge of the Mac does not have them. The Mac knows a
    computer only after a phone introduced it (`introduce`), and only
    while that computer does not block it (`blockedComputers`). The
    Apps tab of the Mac still shows only its own sites.
  - The phone as a bridge: the Claude Code agents of the
    computer in use can act on the other computers through the phone. The
    bridge has the MCP tool `other_computer`: with no computer, it lists
    the other computers; with a computer, it calls `list_workers`,
    `get_worker`, `start_worker`, `message_worker`, `stop_worker` or
    `list_projects` there. The bridge keeps the calls in a queue. While
    the app is on the screen, the phone POSTs `/elsewhere` every 3
    seconds, takes the calls, runs each through its link to that
    computer, and sends the results in the next POST. A call waits 60
    seconds at most. The phone also polls in a call with
    the screen off, and the queue carries only a call that the bridge
    cannot send itself (see the next item).
    The bridge keeps the list of each phone (by its
    device), lists the computers of all of them, and gives a call only
    to a phone that knows that computer. Else a second phone, paired
    with this Mac only, takes half of the calls to another computer and
    answers "The phone is paired only with". `check-bridge` checks it.
  - The link between the computers: a bridge reaches
    the other computers of its phones through the relay itself, with no
    phone. So `other_computer` works while the app is closed, in the
    background or in a call, and after a switch to another computer.
    - The bug that this prevents: when the phone carries each call, it
      polls only while the page shows. In a call with the screen off, or
      with the Claude app in front, the page is hidden, so the bridge
      sees no poll for 15 seconds, and the calls fail with "The Yonder
      app is not open on the phone, or Isolate computers is on". The
      poll also goes only to the computer in use.
    - The phone gives each computer the list of its other computers:
      the name, the relay, the room and the public key of each (`POST
      /peers`, `introduce` in `src/elsewhere.ts`). The bridge keeps the
      list with that phone in `relay.json` (`peers`). The phone sends
      each list when it changes and every 10 minutes while it polls, so
      that a computer that updates its bridge later gets it too. A
      computer with no answer gets one more try a minute later. An old
      bridge answers 403.
    - A bridge connects to another computer as a phone does (`reach` in
      `bridge/relay.ts`, with `linkFetch` of `src/link.ts`). It uses its
      own key from `relay.json`, which the phone already has as the key
      of that computer. The other bridge lets the key in when one of its
      phones lists it. Such a computer can only call `/mcp` and read the
      chats (`PEER_PATHS`: `/conversation`, `/summary`, `/commands`,
      `/subagents`, `/tool`, `/canvas`, `/media`, `/shot` and
      `/favicon`), with no device, as a program on that computer. The
      tools already let it start an agent there, so the chats give it no
      more power. The relay needs no change for this.
    - `other_computer` calls the computer directly first. The phone
      queue carries the call only when the call did not leave the Mac
      (the `offline` error), so that a call never runs two times.
    - The phone is needed only one time: after it introduced the
      computers, `relay.json` keeps the list with no end date, and the
      bridges reach each other while the app is closed or the phone is
      off. A new computer needs the app open one time after its pairing.
    - The trust comes from the phone: the phone already controls each
      computer, so it can introduce them. A computer reaches another
      one only while a phone that both have lists both. An empty list,
      a removed phone or an unpaired computer takes the introduction
      back, and the bridge ends the open connections of that computer.
    - Links in one way, or none: each computer keeps
      `blockedComputers` in its `config.json`, the names or public keys
      of the other computers that it does not let in, also when a phone
      introduced them. Empty is the default, so the paired computers of
      one phone form a full mesh. The details (i) of a computer in the
      Environment section list the other computers with a check, "Can
      reach" that computer. The phone reads and writes the list of that
      computer through `/settings` (a schema row with `"store":
      "config"` in `bridge/settings/environment.json`), and the user can
      also edit it by hand. A blocked computer gets a 403 for each
      request, not a closed connection (`serve` in `bridge/relay.ts`), so
      its bridge knows that the call left it and does not send it
      through the phone. The phone also checks the list before it
      carries a queued call of the computer in use (`run` in
      `src/elsewhere.ts`). A link belongs to the computers, not to a
      person: an agent of a shared computer reaches each computer that
      lets that computer in. So for a computer that another person also
      uses, turn off the links that it must not have. This also serves
      two phones on several computers.
    - Limits: both computers must be on, awake and on the relay. A
      computer with an older bridge lets no other
      computer in. Until it updates, the phone queue carries its calls.
    - The other options, and why they do not work: iOS keeps no socket
      open in the background, only while audio plays, as in a call. A
      silent push (`content-available`) comes a few times an hour at
      most, late or never, and not after a force quit. A background
      refresh (`BGAppRefreshTask`) runs when iOS decides. A VoIP push
      (PushKit) must show a CallKit call each time. Local Push
      Connectivity works only on named Wi-Fi networks, with an
      entitlement from Apple. None of these answers a tool call in
      seconds. The bridges already keep a socket open to the relay.
    - `check-relay` checks the link, the 403 for another path, the take
      back, and the `offline` error through the MCP client.
- The switch during a call: a switch of the Mac (an
  environment) does not end a live call. By voice it is "switch
  environment", "switch PC" or "switch Mac".
  - Grok on the phone has the tool `switch_environment`, with the name of
    the other Mac. With no name and only one other Mac, it switches to
    that one. A name that matches no Mac, or two Macs, gives Grok the
    list, and Grok asks which one. The Environment section of the prompt
    of Grok names the Mac in use and the other Macs of the phone. The Mac
    app has no such tool.
  - The voice socket goes from the phone to xAI (or OpenAI, or
    ElevenLabs) and needs no Mac after it opens. Only the tools go to
    the Mac. So the switch moves only the link to the bridge:
    `movePhone` in `src/bridge.ts` makes a new relay link and a new MCP
    client, because an MCP client connects one time only and its session
    is of the old Mac. The socket to the old Mac closes 30 seconds later,
    so that a request under way still arrives.
  - `moveTo` in `src/link.ts` is set by `App.tsx` while the app runs.
    The app clears the data of the old Mac (the agents, the projects, the
    open conversation, the attachments, the sites and the past calls),
    opens the Agents tab of All projects, and loads the data of the new
    Mac. The first list of the new Mac goes to Grok at once.
  - The lists of the new Mac show at once: the agents
    and the projects come from the last load of the other computers
    (`others` and `farProjects` in `src/App.tsx`), and the poll then
    corrects them. The old Mac goes into those lists with its last agents
    and projects, so a switch back shows at once too. A computer that the
    app did not load yet, such as after a switch from the Settings or by
    voice before the lists of All projects or the Projects tab showed,
    still starts empty. The phone also keeps the bundle of the screen
    (`front`) at a switch, so it downloads the bundle of the new Mac only
    when its build is another one. Else each switch downloads the same
    bundle of about 2 MB through the relay.
  - Each Mac counts its own agents, so "agent 3" of the old Mac is
    another agent on the new Mac. The call forgets the agent numbers of
    its checks (`moved` in `src/voice.ts`), the next agent gets no words
    about the agents of the old Mac, and the prompt tells Grok that the
    numbers from before the switch are of the old Mac.
  - A Claude call ends at the switch, with "a Claude call stays on its
    Mac". Its brain is a `claude -p` on the old Mac, with the tools of
    that Mac. The end goes to the old Mac before the move.
  - The transcript of the call goes on in `~/.config/yonder/calls` of
    the new Mac, so each Mac keeps one part of the call. Grok keeps the
    tool list of the first Mac for the whole call.
  - The same move, with no call, replaces the reload, so a switch never
    loads the page again. A switch thus cannot cause the black screen
    that a new load of the page can show on the iPhone.
  - An unpair of the Mac in use can save that Mac again in IndexedDB at
    the switch to the next Mac, so `unpair` deletes it again after the
    switch. Else its row comes back.
- The title "Settings" sits in the row of the back button, not under
  it.
- The theme is only in the settings. In the New agent view,
  a back button shows at the left and the gear button hides, and the view has no
  second back button under the title bar.
- The settings on the Mac and on the phone show the Claude Code usage,
  the same numbers as `/usage` in Claude Code: the percent used of the
  current session (5 hours), of the week for all models, and of the week
  for each model with its own limit, with the reset time of each. The
  bridge (`/claude-usage`) reads the sign-in of Claude Code from the
  keychain (`Claude Code-credentials`) and asks
  `api.anthropic.com/api/oauth/usage`. Claude Code refreshes the token
  itself. The endpoint answers 429 to frequent requests, also to the
  requests of Claude Code itself: a second request one
  second after a good one can get 429. So the bridge asks at most every 2
  minutes (after a pull to refresh, 30 seconds), and waits 5 minutes
  after an error, also for a pull to refresh. It keeps the last good
  numbers with their time in `~/.config/yonder/claude-usage.json`, so a
  restart of the bridge does not show an error in their place. The
  answer gives the numbers, their time (`at`) and the error of the last
  request in plain words, such as "Anthropic limits how often Yonder can
  read the usage. Yonder tries again in 5 minutes." The settings show
  the numbers, and under them "Updated 4m ago" and the error, never the
  raw 429 answer of the endpoint. The app reads it
  every 30 seconds. `call_status` gives it to Grok too.
- The MCP tool `get_usage` gives the same numbers to each voice agent
  (Grok, ElevenLabs, the brain of a Claude call, the car, the watch and
  the phone call) and to each other MCP client, with the same cache of
  `/claude-usage`, so it adds no request to Anthropic. It also gives the
  5 running agents with the most context in use, with their model and
  effort, because the plan does not split the usage by agent. The
  prompt of the app tells Grok to call it for a question about the
  usage, such as "what's our weekly usage?" on a call.
- The title bar on the Mac and on the phone shows the percent used of
  the Claude Code week for all models at the left, as a small "74%"
  with proportional digits.
  "Offline" takes its place when the bridge is offline. A Title bar
  switch in the Usage section of the settings turns it on and off. It is on
  by default, and each device keeps its choice in `localStorage`
  (`usageBar`). A click on the
  percent opens the settings on the Usage section. Its back button and its swipe back then close
  the settings, so one tap goes back to where the user was. The percent used of the current
  session (5 hours) shows before it, as a small "Session" over its
  percent. Grok has no session meter, so it
  shows only "Weekly". The same button shows in the row of an open
  agent on the Mac, on the line of the traffic lights.
- On the phone, pull down at the top of the settings to refresh them: the
  Claude Code usage, the spend on xAI, the connection to the Mac
  ("Connected" or "Offline" under Mac) and the pairing. The pull asks the
  bridge with `?fresh`: the spend skips its cache of 60 seconds, and the
  Claude Code usage asks again after 30 seconds, because of the 429. A
  horizontal swipe still goes back.
- The settings on the Mac and on the phone also have a Voice section.
  Under Cost it has the spend (the xAI console numbers, or else the estimate), the talk time
  ("About 10h 36m": the spend divided by `PRICE_PER_MINUTE` of
  `src/voice.ts`), and about how many tokens the context of the live call
  holds.
- The first row of the Voice section is Model: Grok, OpenAI,
  ElevenLabs or Claude, a segmented control with the full width of its group. The next call uses the realtime voice model of that
  company. Each device keeps its choice in `localStorage`
  (`voiceProvider`, default `grok`), and `voiceProvider()` of
  `src/voice.ts` reads it.
  The OpenAI call works (see "The OpenAI call" under Voice agent), and
  the ElevenLabs call works (see "ElevenLabs" under Voice agent).
  Each user sees the Model row and the Speech to text row, with only the
  providers whose key is in `.env` (see "Voice calls with a Yonder
  account"). Only the Cost stays for a super user.
- Red (`--live`, the red of the "End call" button) is the primary color of
  the settings: the Update button is red with white text, and the bars of
  the Claude Code usage are red. The switches of the Tunnel tab are red when
  they are on.
- On the phone, the project rows are larger (48 px high, a favicon of
  20 px, text of 16 px), so a finger hits them easily.
- The search of the Projects tab looks like a project row, on the Mac and
  on the phone: only the word "Search", with no box, no border and no
  focus ring. Its text starts at the gutter, in line with the favicons. A
  click puts the cursor in it.
- A scroll down the list of projects hides the search and makes the call
  button and the mute button small, as an open conversation does, so the
  list gets more space. A scroll up, or the top of the list, shows them
  again. With text in the search, the search stays.
  The search is the first row of the list, and it stays at the top
  (`position: sticky`). The hide slides it up under the call row and
  fades it out, so the list keeps its size. Else the hide makes the list
  taller, and the scroll bar jumps up and down.
- The phone has no Calls tab. The transcripts of past calls open from
  the settings (Voice, Call history). The tab names do not wrap. In the
  glass bar, each tab has an icon over its name, so the six tabs fit
  (Saved is the sixth).
- The tabs of the phone are a glass bar at the bottom, as the tab bar
  of iOS: the six tabs, each with an icon over its name, and a pill
  behind the open tab. The lists scroll under the bar. An open
  conversation or call hides the bar, because its prompt box is at the
  bottom.
  The bar and the pill are liquid glass, as the tab bar of iOS 26, in
  the look of the tab bars of WhatsApp and Instagram. The glass is a tinted glass with
  a blur, and the rows show through it. The glass is one layer
  (`::after`) over the whole bar. The layer is a pseudo-element,
  because a `backdrop-filter` on the bar itself would stop it from
  seeing the rows. As on iOS, a line of
  light 1 px wide is on the top left of the edge, and a weaker one on
  the bottom right. The shadow is small, because a large shadow makes
  dark bands at the sides, and in light mode a band over and under the
  bar. The ends have no white light. The open tab has a gray pill. All the tabs have the
  color of the text, with no blue, and the icons are 24 px. Under the
  home bar, the rows fade out, as the scroll edge of iOS. A finger on
  the bar makes the pill larger, and the pill moves to the next tab
  with a small spring. The colors are the `--glass-*` variables in
  `src/app.css`.
  The tabs go down into the space of the
  home bar (`--under`), and the rows scroll under the bar to the bottom
  of the screen, as on iOS 26. The fade covers only the space under the
  bar, and the tint is 40%. Else the glass blurs a flat color, and the
  bar shows a solid gray background. An open conversation and the keyboard
  keep the old layout.
  The whole bar has the same blur, with no edge band of less blur, so
  the rows do not stop being clear at a hard line.
  To check the phone front end in Safari in the simulator, set the build
  ID in `vite.config.ts` above the build of the bridge for the test. Else,
  after the pairing, the page loads the bundle of the bridge in place of
  the dev server, and the screenshots show the old CSS.
  Real refraction does not work in the web view. Safari paints nothing
  for an SVG filter in `backdrop-filter`. An SVG displacement filter in
  `filter` works on the content itself (aave.com does this), but on
  iOS a filter on a panel does not reach a list that scrolls inside it,
  and a filter on the list moves with the scrolled content, so the bend
  does not stay under the bar. A map made again on each scroll frame
  is too slow. Real refraction needs the native `UIGlassEffect` of iOS
  26 in the app shell.
  To check the glass, use Safari in the iOS Simulator. The headless
  WebKit of Playwright draws no `backdrop-filter`, so its screenshots
  show no blur.
  The iPhone with iOS 26 shows a native bar in real Liquid Glass in place of the
  glass bar of the page, with the paper clip and the microphone over it as native glass circles.
  - The native views are in `ios/gen/apple/Sources/yonder-ios`: `NativeChrome.swift` and
    `ChromeState.swift`, the tab bar in `GlassTabBar.swift`, and the buttons in SwiftUI
    (`GlassButton.swift`). Each button has its own small hosting view, a subview of the web view,
    because a hosting view takes the touches of its whole area. A hidden control keeps its last
    state, so its SwiftUI view stays built under the hidden host, and a state that did not change
    does not draw it again. Else each scroll builds each glass button, switch and menu
    again, and each frame of a slide draws all of them again.
  - The tab bar is the tab bar of UIKit (`UITabBar`), alone over the web view, with
    no tab bar controller. On iOS 26 it is the floating bar in Liquid Glass, and a press or a drag on
    it shows the glass lens of the system over the tab, as the knob of a switch. A SwiftUI view
    with a glass background has no lens, so it does not look like glass. The `Phone chrome:` lines
    below show whether the phone shows the native bar. A `TabView` of SwiftUI and a `UITabBarController` also have
    the lens, but they put an opaque white area behind the bar.
  - iOS gives the bar its place: the bar view goes from the top of the bar of the page to the bottom
    of the screen, and iOS draws the glass 21 px from each side, 62 px high, and 13 px down into the
    space of the home bar. When the native chrome is on, `<html>` has `data-native-chrome`, and the
    bar of the page, the round buttons over it and the fade of the rows take the same place (src/app.css).
  - All the tabs have the color of the text (`tintColor` is `.label`), with no blue, as the tabs of
    the page. The icons are 26 points.
  - The page keeps its own bar and buttons in their places, hidden while their native control shows
    (`[data-native-on]`), so the layout does not move. When the native control hides, the control of
    the page shows again. `src/chrome.ts` sends the tabs with their counts, the open tab, the theme
    and the place of each control through the `native_chrome` command, after each render, each change
    of the page and each change of the size of the screen. A button of the page with `data-native`
    (with `data-icon` and `data-glyph`) gets a native glass circle, and a tap on the circle clicks the
    button of the page.
  - The icons are the icons of the page: `iconPng` in `src/icons.tsx` draws each one as a PNG once,
    and the native side tints it with the color of the text.
  - A tap or a drag moves the selection of the bar of iOS at once, then the page opens the tab
    ("Instant actions"). The Projects and Calls views have no tab, so the bar then has no selection.
  - A dialog, a sheet, the settings page or the keyboard hides the native controls, because they
    float over the whole page. A new load of the page hides them too, until the new page sends its
    state. In the simulator, a new load (the web content process stopped with a kill) showed the
    app with the bar again and no black screen. Only a real iPhone can show if an accepted update
    stays free of the black screen.
  - An older iOS than 26, and an app with no native chrome, keep the bar of the page. The command
    returns false there, or does not exist.
  - The same native buttons are everywhere: the gear, the back buttons,
    the Stop and Done buttons and the three dots of a conversation, and the back of a past call. On the
    phone they are glass circles of 44 px (the size of a finger), and the title bar is 50 px high for
    them. The paper clip of the prompt box is the same glass circle, as the other attach buttons.
    The paper clip
    and the X of the New agent view are native glass circles too: the paper clip 44 px, the X
    36 px (`talk-attach` and `talk-cancel`). With the native chrome each one is a native glass circle with the icon of the page, in the
    color of its icon. The check of Done is white, as the back
    button. The three dots open the glass menu of the
    page, so all the menus of the app look the same.
  - A native control hides when something covers its button of the page: a dialog, a sheet or the
    settings page covers all the controls that are not in it, and a menu, the list of a dropdown or a
    toast covers the controls under it. The keyboard covers the tab bar, and the controls that are
    under the bottom of the visible part of the page (`visualViewport`). The controls that sit on the
    keyboard, as the menus and the paper clip of a new agent, stay native. iOS moves the native
    controls up with the page, so their places need no offset. Else they show one keyboard too
    high, and the back button goes off the screen. The keyboard does not hide each native control
    in the bottom half of the screen, else the controls of the page show there with the keyboard
    open.
  - A native control cannot follow a view that moves. While a view slides in (a CSS animation) or
    follows the finger in a swipe back (`data-swiping` on `<html>`, set by `useSwipeBack`), the native
    controls in it hide, and the buttons of the page move with the view. At the end, the native
    controls show again in their new places. A transition of the height of an element also moves the
    elements after it in its parent, so their native controls hide too. An example is the pull to
    refresh of the settings (`.pull`), which slides back up in 0.2 s after the finger lifts. Else
    the native back button shows too low and over the search box
    for about 8 frames after a pull, because it shows again before the page stops.
  - The settings page slides over the list when it opens, and off the list in a swipe back. The list
    stays in its place, so the native tab bar and the native buttons of the list stay too. The native
    side cuts each one at the left edge of the page (`clip` in the state, a mask view in
    `NativeChrome.swift`), as the tab bar of iOS under a view that slides. A cut control takes no
    touch. On each frame of the slide the page sends the new edge, also after the finger lifts and
    the page slides on by itself. The page moves on before the native side gets the edge, so when
    the page moves to the left, the cut leads by its last move: a small gap shows, not the bar over
    the page. Else the native controls hide under the page, and the tab bar changes to the bar
    of the page in a swipe back. The `native_chrome` command returns the version of the native chrome: 2 cuts, 3 also has
    the native attach sheet, and an older app returns true. The page sends a cut only to
    version 2 or higher, because an older app
    shows the whole bar over the page.
  - Version 5 (the kit of `docs/shell.md`): a button of the page with `data-text`,
    `data-symbol` (an SF Symbol), `data-shape` (`circle`, `capsule` or `rect`, with
    `data-radius`), `data-glass` and `data-color` (CSS colors), `data-badge` or
    `data-prominent` gets a native button with these, at the width and height of the page
    button. A button with no `data-icon` needs version 5, so an older app keeps the button of
    the page. A tab takes `badge` and `symbol`, and `data-tint` of the tab bar of the page
    colors the open tab. So a theme or an agent changes the native controls with no new build.
  - The back buttons of the settings pages are native glass circles too.
  - A control in a list that scrolls (an ancestor with `overflow-y` auto or scroll) shows its native
    control only when it is whole inside the list, and not while the list moves. During a scroll or a
    drag of a finger on the page, and for 150 ms after it, the control of the page shows and moves with
    the list. The head of a settings page (`.page-head`) stays at the top while the page scrolls, so its
    back button keeps its native control and is always there. Only a pull to refresh moves it.
  - A control of the page shows again first, and its native control hides one frame later: the page
    removes `data-native-on`, waits for the paint, and then sends the state. The native side hides a
    control at once. Else, if the page shows its control only after the answer of the command comes
    back, all the dropdowns and the switch of the Agents
    settings are gone for one frame at the start of each scroll. To show a native control, the order is
    the reverse: the native control shows first, and the control of the page hides after the answer.
    So the two can overlap for a frame, but a gap never shows.
  - In the dark look, each page control that has a native twin gets the fill of the native glass. The
    fill is white at 13% over what is behind it (`[data-native]` and the tab bar under
    `data-native-chrome` in src/app.css). The glass of the page is darker. Else a control seems to
    vanish during a scroll, until the finger lets go, because the pill of the page has the color of
    the card. The open tab of the page bar gets
    the dark pill of the bar of iOS. The glass of the light look already matches. A native control
    cannot follow a scroll from the page. In the simulator, a native pill that got its new place on each
    frame was one frame behind its row in a slow drag. In a fast flick, it was more than one row behind.
    Only a new phone app can move the native controls with the scroll view of their list.
  - Each change of the tab bar goes to call.log as `Phone chrome:`: `native bar at <y>`, `page bar
    under <what covers it>`, or `off` with the error, and the names of the native buttons. A page
    sends 12 such lines at most. The lines show whether the bar is native, for example
    `native bar at 747` on the list of the phone. Remove the lines when the bar of UIKit is on the
    phone and shows its glass.
- The iPhone has Talk buttons outside the app: a control for Control Center and the
  Action button (iOS 18, `TalkControl`), a round widget for the Lock Screen (`TalkWidget`, both in
  `ios/gen/apple/YonderIsland/TalkWidgets.swift`), and the phrases "Talk to Yonder", "Call Yonder" and
  "Start a call with Yonder" for Siri, Spotlight and Shortcuts (`YonderShortcuts` in `StartCall.swift`).
  Each one runs `StartCallIntent`, which opens the app. The app then calls `window.yonderCall("start")`
  of the page, which starts a call when none runs. After a cold start the page is not there yet, so the
  app tries again every half second for 15 seconds. The intent is in the app and in the widget
  extension, as `CallIntent`. Only a real iPhone can show Control Center and the Action button, so they
  are not tested yet.
- On the phone, the Summary, Chat and Agents tabs of an open
  conversation are small words (13 px) under the header, at the left.
  Each tab is as wide as its word, the open tab has the color of the
  text, and a line of 2 px is under it, as in the tabs of the Mac. Small
  tabs do not stand out too much. The Agents tab shows when the agent started
  sub-agents, as on the Mac. The Mac and the settings page keep the gray
  track.
- On the phone, an open conversation hides the call button, so the
  conversation gets more space. The button shows again during a call,
  when an update waits, and back on the list. The summary and the chat
  fade into the background a little at the top and at the bottom, with a CSS mask, in place of a hard cut at the edges.
  The count of agents in a tab is in front of its name, as "2 Agents"
  and "14 Done". A tab with no agents shows only its name. The Mac
  shows the count after the name, as " · 4".
  The count of the Done tab is all its agents. It is purple when an
  agent there needs the user.
  The icon of the Agents tab is the head of the Yonder bird, from the
  logo. The head and the two feathers are lines, 2 px thick, as the
  folder, the check and the box of the other tabs. The eyes and the beak
  are solid shapes (`SOLID` in `src/icons.tsx`): white eyes with the black
  pupils and the notches of the logo. They come from a glyph that Visual
  Sandbox drew from the logo with `vector/quiver-arrow-2`. A line body
  with solid eyes matches the weight of the other icons and still looks
  like the logo. The beak is turned so that its right edge is vertical.
- Swipes on the phone: the tab swipe works only on the tab bar. A drag
  along the bar opens the tab under the finger, and a short swipe on one
  tab moves one tab in its direction. Only a touch that starts on a tab
  counts. With the glass off, the flat bar goes down to the edge of the
  screen. Else the swipe up to leave the app starts on the bar under the
  tabs and opens the tab over the thumb, most often the Closed tab.
  A swipe to the left or right in the empty space of a list that does
  not start on an agent row, a text field or the tab bar also moves one
  tab. The panel does not follow the finger.
- One step before the Agents tab is the Projects view, which has no tab
  in the bar. So on the Agents tab, one more swipe to the previous tab
  (with the finger on the phone, with two fingers on the trackpad of
  the Mac) opens the Projects view. A swipe in the other direction on
  the Projects view opens the Agents tab again.
- On the Mac, an open agent has no two-finger swipe between tabs, and a
  sideways scroll in it scrolls.
  In a conversation, a call or the settings, swipe to the right anywhere
  to go back, as the back swipe of iOS. The list
  of agents or calls stays under the open view, 30% to the left. The
  view follows the finger with a shadow on its edge, and the list moves
  to its place with the finger. Past 50 px the view slides out to the
  right. The settings page slides out to the right over the app. A text
  field and a block that scrolls sideways, such as a wide table, and a video or
  a sound keep their own swipes.
- The back button of a conversation, a call and the settings is a back
  icon, the size of the buttons of the title bar (28 px).
- The conversation view shows the dots before the answers and the tool
  calls as CSS circles, not as the ⏺ symbol, because iOS shows it as a
  color emoji.
- Each row of a closed agent has a trash button at
  its right end, on the phone and on the Mac. A tap deletes the agent
  (`remove_worker`) with no swipe. A done or failed agent has only the
  check button.
- An agent row has no swipe and no star. A long press
  on the phone, or a right-click on the Mac, opens the menu of the row:
  Stop (for a running or waiting agent), Save for later or Unsave, Move
  to, Copy Link, Close (not for a closed agent) and Delete. A Delete
  from the menu slides the row out to the left, and then its height
  closes. A swipe to
  the side on an agent row moves one tab, as in the empty space of the
  list. Each long press of a menu of the app is 350 ms, not the 500 ms of
  Base UI. `patches/@base-ui%2Freact@1.8.0.patch` changes
  `LONG_PRESS_DELAY`, and `bun install` applies it. The rows of the
  Canvas tab keep their swipe (see below).
- On the Mac, a summarize button (a list icon) sits
  before the check of each agent row. A click shows the task of the
  agent and where it stands, in 1 or 2 sentences, in place of its name
  and details. Haiku 5.5 writes it fresh on each click (`/gist` and
  `gist` in `bridge/main.ts`). The button then shows an X, and a click
  on it shows the name and details again. The phone has no such button.
- A check button at the right end of
  each agent row closes the agent (`close_worker`) with one tap, on the
  phone and on the Mac. It takes the place of the star and of the stop
  button of a running agent. The Mac has no star button. The
  `.close-check` margin that fills the row height applies only on the
  phone.
  - A tap on the check plays a reward before the close: the check pops
    into a green disc, a green ring pulses out, the row glows green,
    and the phone taps three times (rigid, heavy, soft, 70 ms apart).
    After 110 ms the row flicks out to the right in 190 ms, and then its
    height closes in 200 ms, so the rows under it move up. After
    460 ms, `act()` closes the agent without its own two taps. The
    close takes the row out of the list at once, so the close waits for
    the animation. Else the rows under it jump up. The close of an
    agent must feel quick and satisfying. `Age` in `src/App.tsx` and
    `.close-check[data-closing]` in `src/app.css` do it.
    The disc and the ring set `box-sizing: border-box`, because `*`
    does not match `::before` and `::after`. Else the border makes
    the ring 4 px larger than the disc, and the pulse is 2 px off the
    center of the check.
- The swipe of a row (`useSwipeOpen` in `src/App.tsx`) serves the rows
  of the Canvas tab on the phone. A swipe to the right stops with the
  buttons at the left of the row, and a swipe to the left stops with the
  Delete button at the right of the row. A tap on the open
  row slides it back. The row moves on a spring of Motion (`motion`)
  with the speed of the finger, so it bounces at its stop, and a flick
  opens or shuts it. The swipe of SwiftUI
  (`.swipeActions`) works only on a native `List`, and the list
  is HTML in the web view, so the swipe stays in the web view
  and copies the swipe of an iOS list. The spring has a small
  bounce (`visualDuration: 0.35, bounce: 0.15`). Past the buttons, the row follows the finger, and
  the buttons stretch with it. The label of each button grows
  in as the button shows.
  The Delete button is a red square as high as the row, with a trash
  icon and no text.
  A longer swipe (past a third of the row, and at least 24 px past the
  buttons) does the action of that side at once. At
  that point the phone gives a tick, and the button of the full swipe
  covers the others. A release there slides the
  row out, and after 100 ms its height closes in 200 ms, so the rows
  under it move up, as in an iOS list. After 310 ms the row leaves
  the list (`collapse` in `src/App.tsx`, which the check button uses
  too). A move back before the release
  cancels it, with a second tick. The tick is `haptic()` of
  `src/bridge.ts`, as each other tap, with no sound. In the last 120 px before that
  point (but past the buttons), the phone taps 7 more times, and the
  gap between the taps gets smaller near the point, so the finger feels
  the action come. A local function must not have the name `haptic`,
  because TypeScript then refuses the file with the import.
- The rows of the lists (agents, projects, calls) are not text: a long
  press or a drag does not select them, and iOS shows no copy callout.
  The conversation view keeps its text selectable.
- On the phone and on the Mac, no other text is selectable: a long
  press, a drag or ⌘A on a button, a title, the header, a tab or the
  summary selects nothing and shows no copy callout. Only the Context
  and the Chat of an agent or a call and the text fields keep their
  text selectable.
  In the chat, the buttons, the pictures, the sounds and a queued
  message are not selectable either, because a tap or a swipe works
  them.
- The attach button of the phone is a glass paper clip of 44 px in a
  conversation, at the left of its message box, and in the New agent
  view. The main screen and the title bar of the Mac have no attach
  button: a file goes with a message, so it makes no sense to attach
  first and start the agent after. A paste or a drop on the Mac still attaches
  on the main screen. A tap opens the attach sheet
  (`src/Attach.tsx`), as in Signal: a glass sheet from the bottom edge,
  with the recent photos and videos at the top, and a row of buttons
  under them. The row scrolls sideways. It lists Camera, Photos, File,
  Paste, Location and Version. Version attaches the version of the app
  on this phone and the version of the environment on the computer, with
  its channel, for work on Yonder. A tap on a photo
  or a button attaches it and closes the sheet, and a swipe down closes
  it.
  - On iOS 26 the sheet is a sheet of iOS (`AttachSheet` in
    `NativeChrome.swift`, opened by the `attach_sheet` command), with a
    grabber, the glass of iOS, and buttons in Liquid Glass with SF
    Symbols. The sheet reads the recent photos from PhotoKit itself. The
    photos fade out at the two edges of the sheet. A choice closes the
    sheet first, then goes to the page as the choice of the native menu
    "attach" (`menus` in `src/chrome.ts`), and the page runs the same
    action as its own sheet. A picker of the page cannot open while the
    sheet is up, so the order is important. WebKit runs
    `evaluateJavaScript` as a tap of the user, so the camera input and
    the clipboard work. The page opens the native sheet only when
    `native_chrome` returns 6 or more. Version 6 adds the Version button.
    An older app opens the sheet of the page, which has the same button.
    A paper clip closes the keyboard first,
    as in Messages, because a sheet of iOS can open behind the keyboard.
    A tap while another sheet still slides in or out opens the sheet
    when the slide ends: iOS shows nothing for a sheet presented during
    a slide, so else the paper clip seems dead. Android, iOS before 26, and an older
    iPhone app keep the sheet of the page (`src/Attach.tsx`), whose
    photos also fade out at the two edges. The buttons
    of the native sheet are glass circles with a light tap, as the other
    native buttons, so that they match the rest of the app. The code is in
    `NativeChrome.swift`, because a new file must also go in the Xcode
    project.
  - The hidden inputs of Camera, Photos and File are at the top of
    `<main>`, not in the title bar. An open agent on the phone hides
    the title bar, so else the Camera button of the sheet
    in a conversation does nothing.
  - The recent photos: `recent_photos` of `ios/src/lib.rs` (Swift in
    `Island.swift`, PhotoKit) gives the 30 newest photos and videos as
    thumbnails of 360 px. A tap gets the photo as a JPEG of 1600 px at
    most, or the file of the video (`photo`). iOS asks for the photo
    library one time (`NSPhotoLibraryUsageDescription`). Without the
    permission, on Android, and in an older iPhone app with no
    `recent_photos`, the sheet shows only the buttons. The Swift code is in
    `Island.swift`, because a new file must also go in the Xcode
    project.
  - The phone keeps the last list of recent photos on its disk (the
    Cache API, in `src/Attach.tsx`). So after a start or an update of
    the app, the sheet shows the photos at once and loads the new list
    behind them. Else the sheet shows no photos until PhotoKit gives
    the list.
    While the new list loads, a tile that pulses waits at the start of
    the row, where the newest photos come, and four tiles wait when the
    phone has no list yet. Else a photo that the user just took comes a
    moment after the kept ones, with no sign that more photos come. The
    native sheet of iOS 26 reads its list
    from PhotoKit at once, so it has no such tile.
  - The native sheet of iOS 26 keeps the list and the thumbnails in
    memory while the app runs (`AttachPhotos` in `NativeChrome.swift`).
    It loads them when the native chrome starts, if the app already has
    the permission. So the sheet shows the photos at once, and loads
    only the new ones. A tile that waits for its photo pulses, and the
    photo fades in. Before the first list, the strip shows four tiles
    that pulse. A photo that is only in iCloud comes from the network.
  - File: the iPhone opens the Files app at once (the dialog plugin
    with `pickerMode: "document"`), and Android uses a file input. A
    photo or a video goes as one from the library. Each other file goes
    to `/file` of the bridge, which keeps its name in its own folder in
    `~/.config/yonder/files`, and the agent gets it in a `<files>`
    block. The file goes in parts of 768 KB with one `id`, as a video
    does, because the relay takes 1 MiB at most for each request, 2 GB
    at most. A HEIC photo also gets a JPEG. `/file` is in `PATHS` of
    `bridge/relay.ts`, else the relay link of the bridge refuses a
    document from the phone.
  - Location: the pin of the phone (as `get_location` of Grok) goes as
    pasted text with its map link. The attached location shows as a
    small map with a pin (`Place` in `src/App.tsx`): the 3 by 3 tiles
    of OpenStreetMap around it, at zoom 15, with the credit of
    OpenStreetMap. In the message of the user, the bridge puts the
    words of the location file in place of its `<pasted-text>` block
    (`located` in `bridge/main.ts`), and the chat shows the map in
    place of the words. A tap on the map opens Apple Maps at the pin.
    A sent message shows the map at once.
  - The sheet is a Base UI `Drawer` with `z-index: 100`, above the
    open agent, as the menus are.
  It hides with the + button when a conversation or the New agent view is
  open. In the New agent view, a round paper clip in the middle above
  the model, effort and permission menus opens the same sheet
  (`talkClip`). In the conversation of an agent, a
  round plus of 44 px at the left of the prompt box opens the same sheet
  (`promptClip`), so the user can attach a photo, a paste or a picture
  from the library to the next message. The attachments show as the
  stack of photos at the bottom left, just above the plus. A sent
  message shows at once in the chat with its pictures, not faded, and
  the pictures keep their URLs for a minute after the send. The
  talk view of a reply (the microphone of the prompt box) is the same
  as the New agent view: the paper clip at the left of Cancel opens the
  attach sheet, and the attached images show under the words, not in
  the row at the top. In the
  conversation of an agent, the phone hides the title bar (the usage,
  the name of the project and the settings). The row of the agent has
  the back button, the name, and at
  the right at most two actions, so the name stays wide. The name has one line,
  and the project of the agent is small under it, so the row keeps its
  height. The name and the project are at the left,
  after the back button. The Mac
  keeps them in the center. The list and the Summary tab show the whole name. A running agent has the stop button and
  the three dots. An agent that is not running and not closed has the
  check and the three dots. The check
  marks the agent as done (`close_worker`)
  and goes back to the list. A closed agent has only the three dots. The check is a white check
  with no circle, as the back button (`tick`). The row has no status dot, no number and no
  Preview button: the card of the Summary tab has them (see the Mac
  app). The three dots hold the model, the effort, the permissions, the
  profile, Tunnel (see the Mac app), Listen, Save for later, Rename and Complete. On the phone the
  items have no icons, so the menu stays plain. The
  Mac menu keeps its icons. Complete has no button on
  the phone: it is an item of the three dots.
  Listen is an item of the three dots (a speaker, `volume`),
  on the phone and on the Mac, also on a closed agent. A tap speaks the brief of the last
  answer (`spoken` of `/summary`) in the Grok voice of the account,
  through `/speak`. While it speaks, the item says Stop. While the brief
  loads and while it speaks, a small glass pill floats over the message
  box, in the center: a spinner and Stop while it loads, a speaker and
  Stop while it speaks. A tap on the pill stops the brief, also before
  the sound starts, so a stop is not only in the three dots. The next tap
  plays it again. The message box stays, so the user types or talks a
  reply as they want. Listen gives only the summary, with no question
  after it. The app keeps the sound of each brief until
  the brief changes, so a replay starts at once. The brief plays
  with the silent switch on (`navigator.audioSession` "playback"). A
  call, the back button or another agent ends it. On a Mac with no
  `XAI_API_KEY`, a staff account of yonder.so speaks the brief with the
  xAI key of the site (`POST /api/app/speak`), so staff need no key on
  each computer. Another account
  shows the error of `/speak`. Listen gives a quick review of the done
  agents in the app, with no voice call, and with a voice reply only
  when the user wants one.
  The row and the tabs float over the content, and the content runs
  under them up to the time, with a blur that grows toward the top
  (`.convo-blur`). The tabs are a segmented control in the center, as in
  iOS: a gray track (`--seg-track`) with the blur of glass under it, and
  a raised pill (`--seg-pill`) that slides to the open view. Each tab is
  at least 92 px wide. The main tabs of the Mac
  are the same kind of control, at the width of the window, and so are
  the tabs of the pairing dialog. The tab bar at the bottom of the phone
  stays a bar of glass. The samples follow the colors of their theme,
  and the sharp corners of Terminal also square the control. With no call row and no
  update, the sheet of the agent goes up into the safe area (`--lift`).
  Only a sheet that does not cover the screen goes up: a sheet with
  `.cover` starts at the top of main already. Else, with no call row,
  the cover sheet goes up too, and the back button and the check sit
  on the time and the battery.
  The App view of an agent keeps its first page clear of the tabs with
  the same padding as the other views, and it scrolls by itself. Else
  the top of the first page sits under the tabs.
  With an update or a call, the sheet also takes the whole screen, and
  the call row floats over its top. The header moves down under the
  row, and the content runs under the row too.
  Each list has a top padding and a `scroll-padding-top` of the height
  of the header (`--head`), and src/chrome.ts hides a native control of a
  list above that line, so a native dropdown does not float over the
  header.
  The message box (`.convo-foot`) floats too: the content runs under it
  down to the bottom of the screen, with the same blur toward the
  bottom. The sheet goes down into the space of the home bar
  (`--under`), and a `ResizeObserver` puts the height of the message box
  in `--foot`, because it grows with the lines of the text, the slash
  commands and the talk view. The lists have a bottom padding and a
  `scroll-padding-bottom` of `--foot` and `--under`, so at rest the end
  of the content stays over the message box, and src/chrome.ts also
  hides a native control of a list under that line. Each blur is four
  layers of `backdrop-filter`, each one stronger and nearer to the edge,
  at fixed distances from the inner side (about 4 px of blur at the
  tabs, 5 px at the name and 12 px at the time), and a light tint of
  the background that grows to 65%. The fade is high, light and
  progressive, so the content right under the tabs stays visible. The blur is in
  the page, not a native blur of SwiftUI: a native view goes over the
  whole web view, so it also blurs the name and the tabs. `--k` scales the blur
  and the tint, to 80% at the top and 60% at the bottom.
  This row is in all the agent views. Camera opens the camera
  (`capture="environment"`). Photos opens the photo
  library, so the user can also send screenshots and videos (see
  Videos). On the iPhone it opens the library at once: the dialog plugin
  shows PHPicker, and the `read_picked` command of `ios/src/lib.rs`
  gives the screen the bytes of each pick. A file input first shows a
  sheet with Photo Library, Take Photo and Choose Files. Android, and an
  iPhone app with no dialog plugin, still use the file input.
  Paste reads an image or
  text from the clipboard with `navigator.clipboard.read()`; iOS first
  shows its Paste callout. The Android WebView can refuse to read the
  clipboard, and then the screen shows an error. An image wins over
  text, because a copied image can also carry its link as text (see
  Pasted text). The photo joins the attached images
  and goes to the next agent, as an image on the Mac does. The phone
  first makes the photo a JPEG of 1600 px at most, because the relay
  sends each request in one WebSocket frame, and Cloudflare takes 1 MiB
  at most.
- Each menu (`.menu-layer`) has `z-index: 100`. Else the open
  agent (`.sheet`, `z-index: 1`) covers the camera menu, and only "Take
  a photo" shows.
- Each menu and dropdown (`.menu`) is liquid glass, as the tab bar of the
  phone: a tint of the panel color, a blur of what is behind it, the
  `--glass-*` lines of light on the edge, and no border. The highlighted
  item has the gray pill of the open tab. This applies to the camera
  menu, the More menu with Model and Effort,
  and the right-click menus. The dropdowns of the Settings (Microphone,
  Model and Effort ranges, Permissions and Font) are `Dropdown` in `src/Settings.tsx`, a Base UI
  `Select` with the same glass list. They are not a native `<select>`,
  because the list of a native one is the menu of the system. Solid
  menus with a gray border do not match the glass of the app.
  On the iPhone the dropdowns and menus are native. There a dropdown is a `<select>` that lies clear over its gray
  pill (`.native-select`), so a tap opens the menu of iOS, and the three
  dots of a conversation (with the native chrome) open a native menu of
  iOS with the same items: Model, Effort and Permissions,
  then Rename and Complete. The page sends the
  items in `data-menu`, and the choice comes back to `menus` in
  `src/chrome.ts`. The Mac, Android and the long-press menus keep the
  glass list.
  Model, Effort and Permissions are sections with a title in one native
  menu, not submenus, because a submenu opens a second menu over the
  first.
  With version 4 of the native chrome, the pills of the New agent view
  (model, effort, permissions) are
  native too: a capsule in Liquid Glass with the choice and two small
  arrows (`GlassDropdown` in `GlassButton.swift`), at the place of the
  pill of the page. A tap opens the menu of iOS with a check on the
  choice. The pill shows the new choice at once, and the choice goes to
  the page as the choice of a native menu, by the id of the dropdown
  (`data-dropdown` and `menus`). An older app keeps the pill of the page
  with the `<select>` over it.
  An app with no native attach sheet (version 3) opens the attach sheet
  of the page, a dialog, so all the native controls hide under it by
  design, and they come back after its close animation. An app with the
  native sheet keeps the controls native.
- The toast, the dialogs (Sign in, Pair a phone, Add a
  folder) and the small Empty button (`.talk-cancel`) have the same
  glass as the menus. The cards of rows of the Settings (`.group`) are
  flat (`--panel`). The
  recipe is three variables in `src/app.css`: `--glass-tint`,
  `--glass-blur` and `--glass-rims`.
- The controls are glass too, with the same three
  variables: the dropdown pills, the segmented controls, the search
  fields of the Settings and of the Projects and Tunnel tabs, the
  message field of the phone, the paper clip and the menus of a new
  agent, and the text buttons of the Settings (Check, Show). Each one
  has round ends, as the
  controls of iOS 26. The fields of a dialog stay gray, so no glass lies
  on the glass of a dialog.
- The phone hides the Mac-only parts: the update button, Add
  folder, and the Ghostty button. Grok on the phone does not get
  `open_in_terminal`, `open_folder` or `browser`,
  and its prompt says so. The phone never starts a
  call by itself, because iOS needs a tap for the microphone and the
  sound. It reads the agents every 3 seconds, not every second.
- "Rebuild the desktop app", "pull the latest version" or "update it" by
  voice on the phone: Grok calls `rebuild_app`, and the Mac app rebuilds
  as by voice on the Mac. The new Mac app starts no call of its own. The
  call on the phone ends when Grok stops talking, and the phone then
  loads the new front end with no click (see "Install the app"). The
  bridge is off for a few seconds, and the relay then connects again. A change to the native iPhone app uploads to TestFlight from the dev bridge (see "Install the app"). Android still needs `bun run
  install-android`. A debug iPhone build on the cable is `bun run
  install-ios`.
  The phone has no rebuild button in the title bar. The Update button of
  the settings does the same as `rebuild_app` (see the Mac app).
- Push: when an agent finishes (done or failed) or waits on the user,
  the iPhone gets a push notification. The title is the number and the
  name of the agent, and the text is the last paragraph of its result,
  200 characters at most. The text of a waiting agent starts with "Waits
  for you:".
  An agent with queued messages sends no push, because its next turn
  starts at once. iOS does not show a push while the app is open.
  While the user works in the app on the computer, the phones get no
  push. Each input in the focused window pings `POST /here`, 30 seconds
  apart at most, and the bridge holds the pushes for 90 seconds after
  each ping.
  The Notifications switch in General of the settings turns the pushes
  off and on, and iOS keeps the permission. Off gives the bridge an
  empty token, so the bridge forgets the token of the phone. On gives
  the token again.
  `push` in `phone.json` is the same switch, so an agent on the Mac can
  turn the pushes off: the phone then gives the empty token at its
  next pull. It turns off the pushes of all the phones of the Mac.
  1. At start, if Notifications is on, the phone asks for notifications
     and gives its APNs device token to the bridge (`POST /push`, in
     `src/bridge.ts`).
  2. The bridge keeps the token with the phone in `relay.json`, so
     Revoke in the Paired phones dialog also stops the pushes.
  3. `bridge/push.ts` sends the push to APNs over HTTP/2 with
     `node:http2`, because the fetch of Bun has no HTTP/2.
  4. It signs with the APNs key `~/.config/yonder/AuthKey_<key id>.p8`.
     Make the key on the Apple Developer site, under Keys, with Apple
     Push Notifications service, for the sandbox and production. The team is `C5338FSGXJ`, or
     `APNS_TEAM_ID` in `.env`. Without the key, the bridge sends nothing.
     On the Apple site, select the team of the app.
  5. A debug build has a token of the sandbox, and a TestFlight build has
     a token of production. The bridge tries production first, and the
     sandbox after "BadDeviceToken".
  The entitlements file of the app has `aps-environment`. With the
  account of the team in Xcode, `install-ios` makes the profile of
  `com.vladartym.yonder` with push.
- The iPhone app has the background audio mode, so that a call can go on
  with the screen locked. The call also sets `navigator.audioSession.type` to
  `play-and-record`, which tells WebKit that the page makes a call.
  Reports say that iOS 17.5 and later then keep the microphone of a web
  view in the background. iOS can still end the microphone track when the
  app leaves the screen. The call then gets the microphone again, at once
  if iOS lets it, else when the app is on the screen again. Else the
  microphone stays dead after the user comes back. The log shows
  `mic: ended` and `mic: back`. The simulator (a mock
  microphone) ends the track in the background and gets it back when the
  app comes back. Nobody tested a locked iPhone yet. If the microphone
  stops there, move the audio to native code (see `docs/mobile.md`). The Android app keeps its call
  service on for this (`CallService.kt`).
- The screen of the iPhone stays on while Yonder is open, so that it
  does not lock while the user talks. When the app starts, `src/abilities.ts`
  runs the native ability `awake`, which sets `isIdleTimerDisabled`.
  iOS uses it only while Yonder is on the screen, so the phone sleeps as
  usual when another app is in front. An older iPhone app does not have
  `awake`. The Mac display still sleeps.
  The screen wake lock of the web view (`navigator.wakeLock`) fails each
  time with `Permission was denied`, so the app does not use it.
  Android has no fix yet: it needs
  `FLAG_KEEP_SCREEN_ON` in `MainActivity.kt`, in a rebuild.
- The Dynamic Island: during a call, the iPhone shows a Live Activity of
  Yonder. The favicon of the project on the screen is at the left. The
  Yonder icon (the bird of the app icon on a red tile with round corners)
  shows there only when the project has no favicon. The bird is
  `YonderIsland/Assets.xcassets/Bird`, a copy of `AppIcon-40x40`, because
  the widget extension cannot read the assets of the app. At the right are the counts of the agents, as in the
  status row: running (a red dot), waiting on the user (a blue question
  mark) and done (a green check mark, the agents on the Completed tab).
  Running and waiting show only when they are more than 0. A long press
  shows the counts with words, and the Lock Screen shows the same row.
  The end of the call ends the Live Activity, and so does a start of the
  app with no call. iOS does not show it in the island while Yonder is on
  the screen. The tile has round corners and a gap at each end, because
  the corners of the island cut the tile and the last number.
  - While Yonder is on the screen, iOS hides the Live Activity. When Grok
    speaks, the island shows Now Playing for the audio of the app, with a
    waveform at the right. Else it shows a black square at the left,
    because the page gives Now Playing no artwork. So the app sets
    `navigator.mediaSession.metadata` during a call: the favicon of the
    project as a PNG of 128 px (the Yonder icon when there is no favicon)
    and the name of the project. Nobody tested the fix on an iPhone yet. If
    the square stays black, WebKit does not use this artwork for Web
    Audio, and the app must set Now Playing in native code.
    iOS fills the transparent corners of the favicon with white, which
    shows as a white border. So the app draws the artwork on black.
  - The Lock Screen and the long press also show a mute button and a red
    end button. The mute button is white while the call is muted. A tap
    runs `CallIntent` (a `LiveActivityIntent`, iOS 17) in the app, and
    `Island.swift` calls `window.yonderCall` in the web view, which does
    the same as the mute button or the end of the call. The counts with
    words have their own row on the Lock Screen, because next to the
    name they wrap ("runnin g"). The call needs no CallKit.
  - When the app stopped during a call, the activity stays, and a tap on
    it starts the app with no call. `CallIntent` then ends the activity.
    `Island.swift` compares a new
    state with the last state that it sent, not with the state of the
    last finished update, and starts the updates in their order. Else
    a quick mute and unmute can leave "muted" on the Lock Screen.
  - The long press and the Lock Screen show the favicon and the name of
    the project on the screen, in the place of "Yonder". The widget cannot load a file or a URL,
    so the app sends the favicon with the data, as a PNG of 48, 32 or 24
    px in base64. ActivityKit takes 4 KB at most for each update, so a
    favicon larger than 3000 characters at 24 px shows no icon.
  - The widget extension `YonderIsland` (`ios/gen/apple/YonderIsland`)
    draws it. `Island.swift` in the app starts, updates and ends it. The
    app calls it through the `island` command of `ios/src/lib.rs`, from
    an effect in `src/App.tsx`. See "The Dynamic Island" in
    `docs/mobile.md`.

### Screens and styles

Yonder has a default screen, a gallery of other screens, and a screen
of the user's own that an agent builds. The design and its gaps are in
`docs/ui-themes.md`.

- Settings › Appearance › Styles lists eight samples, each with a swatch
  of its colors: Yonder (the default), Dashboard, Big button, Terminal,
  Omarchy, Playful, Duet and Grok Bot. There is no Chat sample: a phone
  or a phone.json set to it goes back to the default
  screen, and a new screen starts from the Dashboard. A tap
  shows the sample live, on the real agents, with "Keep Terminal?", Back
  and Keep. With no answer, the screen goes back after 30 seconds.
- Omarchy (`src/ui/omarchy.json`) is the look of omarchy.org: mono type,
  square corners, flat boxes with a line, and no bubbles. The dark look
  is Tokyo Night, the default theme of Omarchy, with the green of the
  site as the accent. The light look is Catppuccin Latte, a light theme
  of Omarchy. The colors come from the CSS of omarchy.org and from
  `themes/*/colors.toml` in the source of Omarchy. The window on Omarchy
  starts on it, and the phones and the Mac start on Yonder (`HOME` in
  `src/look.ts`).
- The padding is the gutter (16 px) in each style, so the padding is
  even. A square at the start
  of a row (the avatar of the account, the swatch of a style, the icon of
  an app) has the gutter at its left, its top and its bottom. The check
  circle of a task row ends at the gutter on the Mac too. With sharp
  corners (Terminal, Omarchy), the number of a task starts at the gutter
  and the buttons of the title bar end at it. Only the Mac app keeps the
  room of the traffic lights (`data-mac` on `<html>`), and its default
  styles keep the buttons of the title bar 6 px from the round corner of
  the window. The window on Omarchy and on Windows has the gutter at both
  sides.
- A style is data, in `src/ui/<name>.json`: the color tokens for the
  light and the dark look, the font, sharp corners (`radius: 0`), the
  density, the glass, the talk layout (`big`: a round call button and a
  call that fills the screen), the tabs and some words. `src/look.ts`
  puts them on the page, and a wrong value keeps its default.
- With the glass off (Terminal, Big button), the tab bar of the phone is
  flat and full width on the bottom edge, and the iPhone does not show
  the floating glass bar of iOS 26 (`src/chrome.ts`). Terminal shows the
  Closed tab. The bar
  has no padding, so the box of the open tab touches the line over the
  bar and the space of the home bar, with no gap over the box. An open agent has no blur at its edges there:
  the top is solid with a line 6 px under Summary and Context, and the
  bottom is solid from 8 px over the message box, because a blur is out
  of place in Terminal. A band of pixels under the header needs the
  native app, because the page cannot read the pixels under its header,
  so the header stays solid. A web-only band
  fails in the iOS 27 simulator with real flicks: a copy
  of the content under the header that a scroll handler moves trails the
  real text by up to one message, and a copy that a scroll-driven
  animation moves stays in step, but iOS WebKit then drops its SVG
  filter (a `filter: url()` with a composited layer under it shows no
  effect, and on the moving layer itself it draws nothing). With sharp corners (Terminal), each
  segmented control is a box with a line and no track, the open choice
  is in reverse video (the color of the text behind the color of the
  page), and the names are lowercase. Summary and Context fill the
  width, each half as wide. Terminal has no red live color of
  its own: the switches, the primary buttons, the links and the running
  dots take its green accent, and red means only a failure, because
  else the switches and Connect look like errors. A compact style (Terminal)
  has denser Settings: rows of 44 px on the phone and 40 px on the Mac,
  and less space between the groups, the headings and the notes. A row
  that wraps grows, so the layout check still finds no overlap.
- Only the default screen has native controls on the iPhone. Each other
  theme (`themed()` in `src/look.ts`) sends one empty state to the
  native chrome, so the tab bar, the round buttons, the switches and
  the dropdowns are the ones of the page, in the look of the theme. The
  alerts are a dialog of the page (`ask` and `message` of `src/ask.tsx`),
  the attach sheet is the sheet of the page (`src/Attach.tsx`), and the
  three dots of an agent open an action sheet of the page
  (`ActionSheet` of `src/ask.tsx`, from the same items as the native
  menu). The camera and the pickers of photos and files stay the ones
  of iOS. With the glass off, these are flat with a line, and the switch
  is small (36 by 20 px, a square knob in the accent); with the mono
  font, they get the marks of a terminal (`>` rows, `*` choices, small
  letters). The screen in use loads from localStorage before the first
  render, so no native control of the default screen shows for a
  moment at the start, also in a scroll. Each action is in the API of a page too: `yonder.attach.*`,
  `yonder.mice.choices()`, and the files and the model, effort and mode
  of `yonder.mice.start` and `yonder.mice.send`. The layout check
  (`bun bridge/screens-e2e.ts`, step 8) opens each of these parts in
  each theme, look and width.
- Each theme works in the light and the dark look: each sample has
  `look.light` and `look.dark`, and a theme does not set the theme of
  the app. Light, Dark and System in Settings › Appearance decide
  (`theme` in phone.json, also set_theme). A page gets `data-theme` and
  the tokens of the look, and both change live.
- The title of the default screen is the project switcher: the
  favicon and the name of the project with two small arrows, as the
  pill of a dropdown, so it looks like a way to the projects. A tap opens the whole Projects tab: All projects,
  Yonder and the starred projects, then the others under a line. The
  selected project has the accent of the theme. A second tap on the
  pill goes back. The Dashboard and each own screen get the same
  switch as `<y-projects>` of the kit (src/OwnScreen.tsx), which draws
  the same page over the screen in its colors, and
  `yonder.projects.icon` gives it the favicons.
- A theme of the user gets a new name in Settings › Appearance › Custom
  themes (the i of the theme, Name), by voice (`customize` with `rename`
  and the name in `words`; a sample becomes a theme of the user first),
  or from a page (`yonder.screen.rename(id, name)`). The folder keeps its
  name, and the next version has the new name.
- On the Mac, an own screen starts under the title bar of 36 px, so no
  page goes under the traffic lights; the title bar stays in the color of
  the screen and moves the window. Before the bridge saves a new version
  of a page, `bridge/screen-lint.ts` opens it in headless Chrome at the
  Mac and the phone size, and a page that throws, does not call
  `yonder.ready()` or cuts a text or a control at an edge becomes no
  version. The reason is in `build.log` and in `customize` with `use`.
- On the phone, the frame of an own screen goes down to the bottom
  edge, under the home bar, and the page gets the space of the home bar
  as the CSS variable `--under` (`src/OwnScreen.tsx`). The Dashboard
  puts it under its tab bar, and `y-page` of
  the kit under the page. Else the tab bar of the Dashboard stops 34 px
  over the edge, and the glass bar of the default screen shows under it.
- Duet and Grok Bot (`src/ui/duet.html`, `src/ui/grok-bot.html`)
  are own screens that give each agent a picture. Duet has
  the look of Claude Duet: warm paper, a serif title, and a pixel
  creature with a shell color, a hat, eyewear and an extra. Grok Bot has
  the look of the Grok Bot app: a shape and a color. A tap on the name in a chat opens the edit
  sheet: the name, the color and the picture. The sheet fits with no
  scroll, also on an iPhone SE, and each placeholder is one short word,
  so it never wraps. The page never scrolls, and a chat at its last
  message stays there when the keyboard makes it shorter. The button of
  the user is `.self`, not `.me`. Else its rule also matches the bubbles
  of the user in Duet, which are then 48 px wide, one letter on each line.
- On iOS, the frame of an own screen covers only the part of the page
  over the keyboard, as `main` does (`html[data-viewport] .own-screen`
  in `src/app.css`). A text field in the frame tells the app that it
  has the focus (the op `typing` of the SDK in `src/OwnScreen.tsx`), and
  the app runs its own keyboard code (`src/main.tsx`) with the attribute
  `data-frame-typing`, also when iOS 26 makes the web view shorter. Under
  the keyboard the page gets `--under: 0px`, and an update of the front
  end waits while the user types in the frame. So the themes move as
  intended when the keyboard opens and closes. Else iOS slides the
  whole frame up, header and all.
- An own screen (the Dashboard, or a page of an agent) is a page in a
  sandboxed frame over the whole default screen (`src/OwnScreen.tsx`).
  It reaches Yonder only through `window.yonder`: the agents, a chat, a
  message, a new agent, the call, the Settings, and the tools that its
  file names. It gets no network, no phone ability and no storage.
- The picture of an agent: a page gives an agent a
  shape and a color with `yonder.mice.avatar(id, { shape, color })`,
  and `yonder.mice.list()` gives it back as `avatar`. The bridge keeps it
  on the worker (`avatar`, or `avatars` of the state for a session that
  Yonder did not start) through `rename_worker` with `shape` and
  `color`, so each phone and each Mac show the same picture. The bridge
  checks only the form, because the page owns its shapes. Each new
  agent gets a surprise picture: Duet
  and Grok Bot save one for each agent with no picture, with the id of
  the agent as the seed, so two phones save the same one. An agent of
  less than 5 seconds waits, so the look that the user picked for a new
  agent on another phone comes first. A new agent from the + button
  opens at once with a surprise look. A picture of the other screen
  keeps its color, and gets a shape or a creature from its own shape.
- `ui` in phone.json names the screen in use: a sample, `my-chat` (the
  newest good version) or `my-chat@2`. `customize` writes a screen of
  the user with its version, so each new version changes the file and
  reaches the phone. The screens of the user are
  folders in `~/.config/yonder/ui/<name>/`, with one file for each
  version (`<n>.json`, and `<n>.html` for a page). A version never
  changes (`bridge/ui.ts`, the route `/ui`).
- The screens folder: a folder in
  `~/.config/yonder/ui/` with a `screen.json` is the source of its
  versions. The user can drop a theme or a whole
  front end into it, and the phone gets it over the air. Each 3 seconds the
  bridge looks for a change in the `ui/` folder of its own config
  folder. It runs `bun run build` when
  `package.json` has a build script (log in `build.log`), puts each
  local script, style sheet, picture and font into the page, and saves
  the next version when the page changed. A change of the last 2
  seconds waits, so an agent that writes several files makes one
  version. A new version of the screen in use shows on the phones at
  once. A page is 4 MB or less, and 1 MB or less when gzipped, because
  the relay sends one frame of 1 MiB. `/ui?name=` gzips a page larger
  than 500 KB, and the phone unzips it. The phone keeps one version of
  each screen in localStorage.
- Appearance has only the style choices: the theme, the color, Styles,
  Custom themes and the fonts. Yonder
  in Styles is the default screen, and `customize` with `change` makes a
  sample the user's own by itself, so the page has no Make it mine and
  no Back to the default screen.
- A row of the Settings never lets its label and its control overlap:
  the label keeps at least its longest word, and a control that does
  not fit beside it wraps under it, at the right. A long value, such as
  the name of a computer, ends with an ellipsis. Else, for example,
  Minimal, Normal and Verbose cover the label Detail
  in the Terminal theme. The layout check of `bridge/screens-e2e.ts`
  opens each section in each theme, look and width (320 and 375 pt).
- The theme check: `bun bridge/themes-e2e.ts` runs the
  app of `src/` under Vite, paired through the relay, in WebKit (the
  engine of the iPhone) and in Chromium, on a test bridge with the
  made-up data of `bridge/fixtures/themes-mock.ts`: seven agents, a
  chat and an approval. A stand-in for Claude Code lists the running
  agents and starts nothing, so the check uses no credits. It takes
  three pictures of each sample in the light and the dark look (the
  agents, an approval and a chat) into `docs/themes/<theme>/`, for a
  theme gallery: each theme shows the same data. Then it checks Duet
  and Grok Bot on an iPhone 17 Pro, an iPhone 17 and an iPhone SE: the
  page never scrolls, the edit sheet fits, the bubbles sit on their
  side, each placeholder fits on one line, and the frame follows the
  keyboard. A browser has no keyboard, so the check gives the app the
  sizes of the keyboard of iOS, and the app runs its own keyboard code
  with them. It needs the browsers of Playwright (`bunx playwright-core
  install webkit chromium`). The themes must work very well on mobile.
- Each sample has the Apps tab: Yonder, Playful and
  Terminal show all the tabs, Big button lists it after its two tabs,
  and the page of the Dashboard has an Apps tab: `yonder.apps.list()`
  gives the apps, and `yonder.apps.open(id)` opens one over the page,
  in the viewer of Yonder.
- The bar of a preview ("Keep Terminal?") has a place of its own: an own
  screen ends above it, and the round buttons over the tab bar hide
  while it shows. Else the line under the message field of a page
  and the edge of the + button show under the bar.
- Custom themes, under Styles, lists the screens of the user: a swatch,
  the newest version and its age. A tap shows the theme live, as a
  sample. The i opens its versions, with Use on each for a rollback,
  and Delete, which asks first (`customize` with `delete`, and `delete`
  of `/ui`). The Settings have no Build field, because a new theme
  comes by voice.
- "Build me a screen with only one chat" by voice
  (`customize` with `new` and the words): an agent, "Screen builder",
  starts in a new source folder with the rules (`CLAUDE.md`) and the
  sample as version 1. It changes `screen.json` and `index.html`, tests
  the version with `/ui?name=<name>&try`, and calls `customize` with
  `use`. The guide for the agents is the skill `yonder-screens`
  (`bridge/skills/yonder-screens/`). The bridge writes it into
  `~/.claude/skills/` at each start, so each Claude Code agent finds
  it, and serves it as one page at `/ui?guide`. The `CLAUDE.md` of each
  screen folder only points to it, and the bridge writes that note
  again at each start. `POST /ui` with `{"action":"check","name"}` runs
  the build and the check of a folder with no new version.
  `bun run check-skill` fails when the skill and the API of a page do
  not match, and the GitHub check runs it.
- Import (`customize` with `import` and `from`): a folder on the Mac
  stays where it is, as the link `source/` in the screen folder, and a
  Git URL is cloned into `source/`. A folder with no `screen.json` gets
  one as an own screen. Each change of the source reaches the phones.
- The voice agent and the agents have the `customize` tool: `list`,
  `use`, `reset`, `fork`, `versions`, `new`, `import` and `change`.
- A change in one step (`customize` with `change` and the words, such as
  "make the buttons bigger", and `screen` for a screen that is not in
  use): when the screen is a sample or the default, the bridge forks it into a screen of the user and uses it.
  Then an agent, "Screen change", starts in the folder of that screen
  with the words, changes only what the user asked, tests the version
  and calls `customize` with `use`. Each old version stays, so `use`
  with `name@version` goes back. So the
  voice agent needs one call for each change of the look.
- The floor: a page that does not call `yonder.ready()` in 5 seconds, or
  throws before it, is marked bad, and the phone goes back to the newest
  good version, else to the default, with a toast. A shake asks "Undo
  the screen change?" for 10 minutes after a change, and "Use the
  default screen?" on an own screen. The quick action "Default screen"
  of the app icon clears `ui`. It needs TestFlight 2.93.519 or later.
- One front-end API (`src/api.ts`, guide in `docs/screen-api.md`):
  the default screen and each page reach the agents, the chat,
  the call, the projects, the usage, the approvals, the settings, the
  screens, the phone abilities and the tools of the bridge only through
  `yonder`. The default imports it, and a page calls it through the
  frame (`src/OwnScreen.tsx`). So the default is one front
  end among many. `bun src/api-check.ts` counts the direct calls left in
  the default screen. It is 0, and the check fails
  when the count rises.
- A page gets the kit of Yonder (`src/kit/`): CSS parts on the theme and
  the icons of `src/icons.tsx` (`yonder.icon(name)`).
- A page uses a phone ability only when `abilities` of its screen.json
  names it, and the user says yes once on the phone. A new pick of the
  screen asks again. An error of the ability counts as a no.
- Speech to text in a page (`yonder.dictation`): the
  dictation of the prompt box (`src/dictate.ts`) through the frame,
  with the ability `dictation`. The words so far come as events, and
  the stop gives the text. A call stops it. The Dashboard has it on the
  button of its text box: the microphone when the box is
  empty, a stop while the user talks, which sends the words, and Send
  when the box has text. Each screen has a new agent, the chat, the
  call and the dictation.
- The Dashboard sample has no Call button. A call that starts in another way (the Live Activity,
  the Action button, Siri, CarPlay or the Watch) shows LIVE in the top
  bar of the Dashboard, with Mute and End. The sound of a dictation while the computer is offline
  is lost in a page, and the prompt box of the default keeps it.
- Settings from one schema: `bridge/settings/` has
  one file for each section, as one folder for each page of the
  Settings, with the name and the icon of the section and its settings:
  the key, type, default, label, help, store (config.json or
  phone.json) and control of each. The Settings list the sections from
  these files, in the order of `bridge/settings/index.ts`, as the
  Settings of VS Code do. A section with
  `"home": false` stays out of the home list. The phone draws
  General, Steer, Tunnel, Summaries, Detail, Group tool calls, Agent
  names, Word for an agent and the Title bar from it, and `/settings`
  checks and writes a value of config.json. A setting with no type, such
  as `agentName`, uses the check in the bridge. The user adds settings in
  `~/.config/yonder/settings.json`, with no new build. A page reads the
  schema with `yonder.settings.schema()`, and changes only the settings
  of the phone. A setting with `"store": "claude"` is a key of `settings.json` of
  Claude Code, such as Advisor (see Profiles).
- What is left is in "The handoff" of `docs/screen-api.md`.
- Sync of the settings: the settings
  follow the user to each phone, Mac and PC through the Yonder account,
  encrypted on the server, with no sync code. `bridge/sync.ts` backs up
  each setting of the schema with `"sync": true` and each screen of the
  user (the newest good version) to `/api/app/sync` of yonder.so
  (the yonder.so backend, private). The server keeps one object for
  each account, gzipped and encrypted with Fernet, with a version.
  - What syncs: the model and effort ranges, the default model, Steer,
    Summaries, the word and the names of the agents, the Context
    detail and groups, the theme, the color, the fonts, the Title bar,
    the screen in use, the screens of the user, and the profiles with
    no variables, folder or program (see Profiles). Each phone takes its
    look from phone.json of its computer, so the phones follow.
  - What stays on each device: the permission mode, the Tunnel, the
    default folder, the CLIs, the default profile, the variables of the
    profiles, the logins, the wake word,
    the microphone, Face ID, the schedules and the projects (they name
    the folders of one computer). A key, a token, `vault.json`,
    `relay.json` and `.env` never sync: the sync reads only the marked
    keys, never a whole file.
  - The bridge syncs. The app gives it the sign-in (`giveSync` in
    `src/account.ts`, POST `/sync`), as it gives the tunnel, and a
    paired phone gives its own to a computer with none. `sync.json` in
    the config folder keeps the sign-in with mode 600. Sign out in the
    app of the computer ends the sync there. A phone cannot sign a
    computer out.
  - Each key has the time of its last change, and the newer change
    wins, key by key. A delete is a value of null, so a deleted screen
    goes from the other devices too. A device that read an older
    version gets 409 and merges again. The first sync of a device is a
    restore: the account wins, and the device adds only the keys that
    the account does not have. So the first device that signs in sets
    the backup.
  - A change goes up within 30 seconds. A change of another device
    comes within 10 minutes. `GET /sync?run` syncs at once.
  - The Sync settings section of Account has the Sync switch (`sync` in
    config.json, on by default), which turns it off for one device. The
    line under it says when the last sync was, or why it failed. Three
    plain lines tell what syncs (the settings, the look, the custom
    screens), what never syncs (secrets and keys) and what stays on each
    device (folder paths, CLIs, logins), so that sync is clear to the user.
  - Checks: `bun bridge/sync.ts` (the merge) and `bun bridge/sync-e2e.ts`
    (two bridges and a fake yonder.so, with no credits).
- The phone reads `/agent-name` through the relay. Else the phone does
  not get the word of the user for an agent, such as "helper".

### The phone cleanup

A cleanup of the phone app keeps the UI, and only cleans it up.

- The values of the Summary tab sit on the background, with no grey panel, as
  the rest of Yonder has no cards. Its last line has no agent number, because
  the title has it.
- The blur and the tint at the top of an open agent are stronger behind the
  tabs (`.convo-blur` in src/app.css). Else text that scrolls under the tabs
  cuts through Summary, Chat, Context and Agents.
- "Empty" on the Closed tab and Unpair in the settings ask first, with the
  native alert. A shake asks to undo with the native alert too. The page
  dialog stays for an app without the dialog plugin.
- A swipe delete has no undo bar, because an undo bar is too verbose.
- The row of a new agent shows at once: the page reads the list 300 ms after
  `start_worker`, because the bridge lists the agent as "Starting" before the
  start ends. A new tunnel shows its row at once, and its form closes at once.
- A swipe back also goes back on a quick flick shorter than 50 px, and not when
  the finger moves back to the left before it lifts.
- A first start with no theme takes the theme of the iPhone or the Mac.
- `native_chrome` can return -1: the native side could not read the state. The
  page then keeps its own controls. Else one bad field makes the native side
  drop the whole state and still say yes, so the tab bar and the round buttons
  can all disappear. A button, a switch or a dropdown that does
  not decode is left out alone (`Lossy` in ChromeState.swift).
- The Google sign-in window of iOS that cannot open answers "cancel" at once
  (AuthSheet.swift). Else the page waits for the sign-in for 7.5 minutes.
- `read_picked` exports a picked video on a blocking thread, one video at a
  time. Else each video holds a thread of the async runtime of Tauri for up
  to a minute, and the dictation, the photos and Quick Look wait.

### CarPlay

CarPlay follows the design of `docs/carplay.md`: one app with a car
mode. The phone keeps the full React app. The car gets only the CarPlay
screen and a call in Swift.

- The rules of the car mode are on the bridge, so that a change needs no
  new app and no App Review. `GET /car?zone=<time zone>` gives the car
  prompt, the car tools and the agents for the list of the car screen.
  A phone reaches it through the relay. The car call gets it at the
  start, and again while the call runs.
- The car tools are an allow list, `CAR_TOOLS` in `bridge/main.ts`:
  `list_workers`, `get_worker`, `start_worker`, `message_worker`,
  `complete_worker`, `close_worker`, `list_projects`,
  `project_overview` and `about_yonder`, with `web_search`, `x_search`
  and `end_call`. A new tool stays off in the car until somebody adds
  it. The tools of a screen, `read_file`, the photos, the pairing, add,
  create and delete, `rebuild_app` and `restart_bridge` are off.
- The car prompt tells Grok that the user drives. Grok answers in one or
  two sentences, reads no code, paths or long lists, and never tells the
  user to pick up the phone. When the user asks for a tool that is off,
  Grok says that it does not work in the car.
- The car call has its own key. The web view keeps the key of the phone
  in IndexedDB, where Swift cannot read it. The phone gives the public
  key of the car to the Mac with `POST /car-key` through its own link,
  and `bridge/relay.ts` keeps it as `car` of that phone. So Revoke of
  the phone also removes the key of the car.
- The web app does this in `linkCar` of `src/bridge.ts`, at each start
  with a pairing and at each change of the account. The `car_link`
  command of `ios/src/lib.rs` gives the relay, the room, the key of the
  Mac and the token of the Yonder account to Swift. Swift keeps them and
  its private key in the Keychain with
  `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, so that the car
  can start a call while the iPhone is locked.
- The car screen is `CarPlay.swift`. A tab bar has two tabs: Voice, a grid with one
  Talk button (the Yonder face), and Agents, the list of the agents with
  their project and status. A tap on an agent starts a call, and Grok
  says what that agent did or needs. During a call, the voice control
  template shows over the tab bar: the Yonder face, One moment,
  Listening, Speaking or Muted, and the buttons Mute and End. No
  settings, pairing, sign-in or purchases. A problem shows as an alert,
  such as "Yonder is not paired with a Mac".
- The voice control template cannot be a tab. The CarPlay Developer
  Guide of June 2026 allows only grid, information, list and point of
  interest templates in a tab bar, and another template is an exception
  at runtime. The guide also allows the microphone in the car only while
  the voice control template is on the screen, so the call starts its
  audio after the template shows.
- When the car shows Yonder the first time after it connects, a call
  starts (`sceneDidBecomeActive`): voice is the first mode of the app, a
  rule of CarPlay. A car call ends a call of the phone app through
  `window.yonderCall`. When the car disconnects, the call ends and the
  audio session closes.
- The car call guards against four bugs. The tool calls of Grok run on
  the main actor, else they change the words of the call from two
  threads. The link to the relay closes when the car disconnects. The
  end handler of a call does not hold the call, else each call stays in
  memory with its audio engine. A call that fails to start closes the
  audio session, else the music of the car stays paused. A microphone
  of 0 Hz, as during a phone call, ends the call with "The microphone
  is not available.", else the app crashes.
- The car call is `CarCall.swift`: `AVAudioEngine` with the voice
  processing of iOS (echo cancellation), PCM16 at 24 kHz, the realtime
  API of xAI with the voice Liora, and the tool calls to the bridge as
  one JSON-RPC request through the relay (`CarLink.swift`, the link of
  `src/link.ts` in CryptoKit). It adds the last words of the call as
  context to `start_worker` and `message_worker`, drops the same request
  a second time within 30 seconds, and gets `/car` again every 15
  seconds for a new prompt and the news of the agents in a pause. The
  token comes from the bridge, or from the Yonder account, which also
  gets the minutes of the call. The checks of `voice.ts` for a message
  to a busy agent, a request in parts and wrong fixed words are not in
  it yet.
- CarPlay can start Yonder with no phone screen. Tauri then does not
  start, so all of the car is plain Swift. tao, the window layer of
  Tauri, gives its own scene delegate to each scene, also to the car, so
  else CarPlay never calls `YonderCarScene`. `ios/tao` is tao 0.37.1 with
  one patch (`declared_configuration` in
  `src/platform_impl/ios/view.rs`): a scene role with its own delegate
  in the Info.plist keeps it. `[patch.crates-io]` in `ios/Cargo.toml`
  uses it. The scene manifest in `ios/Info.ios.plist` has only the car
  scene. The phone window still gets its configuration from tao, and the
  phone app starts as usual (checked in the iOS 27 simulator).
- The entitlement `com.apple.developer.carplay-voice-based-conversation`
  is only in `yonder-ios_iOS/simulator.entitlements`, for simulator
  builds. A device build must not have it until Apple gives it to the
  App ID: the profile must have it, or the signing fails. When Apple
  gives it, add it to `entitlements.properties` in
  `ios/gen/apple/project.yml`, run `xcodegen`, and make a new profile.
  Request it at https://developer.apple.com/carplay.
- Checks: `ios/car-check.swift` runs the Swift link on the Mac against
  the live bridge through the relay, with a test pairing that it
  removes. `ios/carplay-sim.m` turns on the CarPlay screen of a
  simulator. Then the CarPlay home of the simulator lists Yonder.
  `simctl io screenshot` times out on that screen, and no
  tool here can tap it, so the car screen and the car call are not
  tested yet. Xcode 27 has DeviceHub in the place of the Simulator app.
- An older bridge has no `/car` and `/car-key`. Then the car shows
  "Update Yonder on the Mac to use it in the car."

### Apple Watch

The watch app follows the plan of `docs/watch.md`. It is the car screen
on the wrist: a Talk button, the call, and the list of the agents.

- The watch app is plain SwiftUI in `ios/gen/apple/YonderWatch`
  (`YonderWatchApp.swift` and `WatchModel.swift`), the target
  `YonderWatch` of `project.yml`, with the bundle ID
  `com.vladartym.yonder.watchkitapp`. The iPhone app embeds it in
  `Yonder.app/Watch`, so it ships with each iPhone build. The watch has
  no web view, so no React and no Tauri.
- The first screen is a Talk button with the Yonder face, and under it the
  list of the agents: the name, the project and a dot with the color of
  the status. A tap on an agent starts a call, and Grok says what that
  agent did or needs, as in the car. During a call, the screen shows the
  face, the state (One moment, Listening, Speaking, Muted), Mute and End.
- The call is personal within the limits of CallKit. The system
  call screen of watchOS takes no background, so the watch sets what
  CallKit allows: the Yonder face as `iconTemplateImageData` (CallKit uses
  only its alpha), and a caller name with `CXCallUpdate`: the agent of the
  call, or "Yonder · N working". The call screen of the app shows moving
  bars (`Wave`), the last answer of Grok as a caption (`CarCall.onSaid`),
  a light tap on the wrist when Grok starts to speak, and a notification
  tap when an agent gets news.
- A call from the green button of the system call screen on a watch
  with no pairing ends at once with "Open Yonder on the iPhone to link
  this watch." Else it shows "One moment" until the user presses End.
- The call is `CarCall.swift`, with `CarLink.swift` and `CarStore.swift`,
  the same files as the car. watchOS opens a WebSocket only during a
  CallKit call (TN3135), and the relay and Grok both use WebSockets. So
  the watch asks CallKit for a call, sets the audio category
  `.playAndRecord` with the mode `.voiceChat`, and starts `CarCall` only
  when CallKit activates the audio session. With `callKit: true`,
  `CarCall` does not open or close the audio session itself. End and Mute
  also go through CallKit. `UIBackgroundModes` has `voip`. Nobody has
  checked yet that the call stays on when the user lowers the wrist. If
  watchOS or App Review refuses `voip` with no PushKit, try `audio`, as in
  the iPhone app.
- A failed call can show only "Call Failed" from CallKit, and the app then closes. So `problem` is in `UserDefaults`, and the reason shows under Talk when the app opens again. A reset of CallKit gives its own reason. The green button of the system call screen starts a call with no tap on Talk, so `CXStartCallAction` takes its UUID when no call runs.
- The watch shows its version under Talk, and saves each step of a call (`step` in `WatchModel.swift`). When the app opens with a step still saved, the call stopped there, such as after a crash, and the screen says "The last call stopped at" that step. `CarCall` gives its own steps through `onStep` (the request to the Mac, the token, the microphone, the connection to Grok).
- The watch does not call `setVoiceProcessingEnabled`, a likely crash on watchOS: the mode `.voiceChat` gives the echo cancellation there.
- The crash reports of the watch are on the iPhone under `ProxiedDevice-*/YonderWatch-*.ips`; `xcrun devicectl device info files --domain-type systemCrashLogs` lists them. Most watches are arm64_32, where `Int` has 32 bits. So `CarCall` makes the name of its transcript from the milliseconds as `Int64`, else the number overflows and the app stops at once. Watch for the same overflow in all code that the watch shares.
- watchOS does not ask for the microphone by itself, and with no permission the microphone gives silence. So `talk()` asks for the permission of the microphone before the first call. `CarCall` also writes the format of the microphone and the loudest sample of the first 5 seconds to the log of the Mac (`call.log`, lines with `[watch]` and `audio:`), so that a silent microphone shows there.
- The microphone of the watch can have 3 channels at 48000 Hz, and the converter from 3 channels to mono gives only silence. So `tap()` in `CarCall` mixes the channels to mono itself, and logs the loudest sample of each channel in the first 5 seconds.
- The mix is very quiet, at most about 0.01 of full scale, so the VAD of Grok hears nobody. On watchOS, `tap()` multiplies the mix by 4 (`gain`; 12 clips the voice at 32767), and the log gives the loudest sample after 5 s and after 30 s.
- The watch needs no open iPhone app for a call: it connects to the relay and to Grok by itself, over the Wi-Fi of the watch or through the iPhone. "No internet connection" means that the watch had no network at that moment.
- To hear the microphone of the watch: each watch call sends its first 15 seconds, as Grok gets them, to `/paste` as a WAV in base64 with the prefix `yonder-watch-wav:` (the relay has no path for a file, and 1 MiB at most). Find it with `grep -l yonder-watch-wav ~/.config/yonder/pastes/*`, and decode the text after the prefix with `base64 -d`.
- Outside a call, the watch cannot reach the Mac. It shows the list of the
  agents from its last call, which it keeps in `UserDefaults`.
- The pairing: the watch makes its own P-256 key in its Keychain
  (`CarStore`), and sends the public key to the phone in the application
  context of WatchConnectivity. `WatchLink.swift` in the iPhone app keeps
  it. `linkCar` of `src/bridge.ts` calls the `watch_link` command after
  `car_link`, and posts the key to `/watch-key`. The bridge keeps it as
  `watch` of that phone (`bridge/relay.ts`), so Revoke of the phone
  removes the watch too. The watch has its own path, so that an older
  bridge with no watch refuses the key and keeps the key of the car. `watch_link` also sends the pairing
  of the car (the relay, the room, the key of the Mac and the Yonder
  account) to the watch. When a new key of the watch arrives while the
  phone app runs, Swift calls `window.yonderLinkCar`, which runs
  `linkCar` again. Until the Mac has the key, the watch says "Open Yonder
  on the iPhone to link this watch with the Mac."
- The prompt: the watch asks for `/car?screen=watch`. It is the car prompt,
  but the user is on a watch, not in a car, and Grok can say that a tool
  works in Yonder on the phone or the Mac. The tools are `CAR_TOOLS`.
- Tauri (cargo-mobile2) runs xcodebuild with `-sdk iphoneos`. The `-sdk`
  option forces the iPhone SDK on each target, also on the watch, and the
  build fails. `ios/bin/xcodebuild` replaces `-sdk iphoneos` with
  `-destination generic/platform=iOS` (and the same for the simulator),
  so that each target builds with its own SDK. `bun run ios` and
  `bun run sim` put `ios/bin` first in PATH. Delete the wrapper when
  cargo-mobile2 builds with a destination.
- `bun run testflight` writes the version into the Info.plist of the watch
  too, for the same reason as the Live Activity (ITMS-90473).
- `xcodegen` writes the Info.plist of each target from `project.yml`. It
  removes a key that is only in the plist, so the `CFBundleDisplayName`
  of `YonderIsland` is in `project.yml`. After `xcodegen`, put back the
  committed `yonder-ios_iOS/Info.plist`: Tauri adds the keys of
  `Info.ios.plist` to it, and xcodegen removes them. Run `xcodegen` with an
  empty `Externals` folder, or it adds groups for the build folders.
- A new Swift file in `Sources/yonder-ios` needs `xcodegen` too, because
  the committed `project.pbxproj` lists each file. Else
  `bun run install-ios` fails with an error such as "Undefined symbols:
  _yonder_shrink_video".
- Checks: the watch app compiles for watchOS (arm64 and
  arm64_32) and for the watch simulator. `bun run ios build` makes an IPA
  with `Yonder.app/Watch/YonderWatch.app`, signed with the team
  `C5338FSGXJ`, and the simulator build has the watch app too. A Mac with
  no watchOS simulator runtime cannot run it there, and the simulator always allows
  WebSockets, so only a real watch can test the call. Test it with Wi-Fi
  and Bluetooth of the iPhone off in Settings (not in Control Center), and
  again with the iPhone near.
- An older bridge has no `/car?screen=watch` and no `watch` key.
  `watch_link` is native, so the watch app comes with a new build of the
  phone app.
- A development build (`bun run install-ios`) can put the watch app on
  the watch only when the watch is a registered device of the team.
  TestFlight has no such limit: a TestFlight build carries the watch app
  (see the TestFlight notes under Phone). Install Yonder from TestFlight
  on the iPhone. The watch then installs the watch app by itself when
  "Automatic App Install" is on in the Watch app of the iPhone. If it is
  off, tap Install next to Yonder under "Available Apps" there.
- Not built yet: a complication, an App Intent for Siri and the Action
  button, and a list of the agents from the phone before a call (phase 3
  of `docs/watch.md`).

### The SwiftUI phone app

The phone app in the stores is the Tauri app in `ios/` and `android/`.
There is no separate phone app in pure SwiftUI, so the bridge has no
"phone" screen of `/car` and no PNG icon of `/favicon?png`.

## Apps

- The Canvas tab is the screen of Yonder for what the agents make and
  ask. It shows the pages and the sites in one list: you build your own
  apps and artifacts, and you can rename, save, remove and recreate an
  app at any time. The name Canvas is for the whole thing: the tab, and
  the Canvas view in the chat of an agent. The tools keep "app" in
  their names (`show_app`, `build_app`, `change_app`, `remove_app`).
  The tab value stays `preview`. The design and its phases are in
  `docs/canvas.md`.
- From the top: the search, then "Needs you" (the approvals that wait),
  then one list of the pages that the agents made (artifacts) and the
  web sites of each computer, then the archive. The starred apps come
  first, then the newest first. A page sorts by its last version, and a
  site by the start of its server (`ps` etime), else by the first time
  the bridge saw it. There is one list, with a star and a search, and
  no segmented control. A star is the `saved` of an app, and the menu
  says Star and Unstar. The tab shows a red dot while approvals wait,
  and the native tab bar a badge, not a count: "1 Apps" read as one
  app.
- Each app has an icon. An agent draws it with `show_app` (`icon`):
  a small square SVG of 20 KB or less with a subtle CSS animation. All
  icons have one style, as a modern app icon: a gradient of one hue that
  fills the square with no rounded corners of its own, one simple white
  glyph in the middle, no text, no emoji and no thin lines (`icon` in
  `bridge/main.ts`). An old emoji icon still shows. The app shows an
  SVG as a picture (`<img>`), so its scripts never run, and it adds the
  `xmlns` that an agent can leave out. A page with no icon, and a site
  with no favicon, shows its first letter on the accent of the theme,
  in the text color of the accent (`--accent` and `--accent-text`), in
  the list and in the grid: a green box in Terminal. The screen feels
  alive: the rows slide in one after the other when the tab shows, a
  new page glows once, and the dot of a site with its tunnel on beats
  softly. Reduced motion turns this off.
- The user can change the icon of each app, a page or a site: Change icon
  in its menu opens the picker (`IconPicker` in `src/Canvas.tsx`): the
  card of an approval from the bottom edge, on the phone and on the Mac.
  The search finds an icon by its name and its words, such as "test" for
  the flask, and Enter picks the first one. Generate and Upload fill the
  width of the sheet side by side, 52 px high as the buttons of an
  approval. It has the icons of the app (59 icons of Lucide 1.60.0, in
  `PATHS` of `src/icons.tsx`), Upload for a picture, and Generate, which
  asks the agent of a page to draw a new icon. A picked icon shows in
  the color of the text on a plain tile, as a favicon. An upload is the
  middle square of the picture at 128 px, a PNG or a JPEG of 64 KB or
  less as a data URL, because each load of the list on the phones has
  the icons. The choice of the user shows in each style, and stays over
  the icon of each new version of the page (`checkIcon` and `put` in
  `bridge/canvas.ts`).
- A style with plain icons (`"icons": "plain"` in its look, as Terminal;
  `data-icons="plain"` on `<html>`) shows an icon of the app on a plain
  tile for each app in place of the drawn icon and the letter. The icon
  comes from the words of the name (`appGlyph` in `src/Canvas.tsx`): the
  first word with an icon wins, such as "weather" for "Paris Weather",
  else a window. So the icon sets itself from an icon library. A site
  keeps its favicon, and a pick or an upload of the user still shows.
- A style with a rail (`"rail": "starred"` in its look; `data-rail` on
  `<html>`, on in the Omarchy sample) shows a thin column of small,
  quiet icons at the left, under the title bar, as the servers of
  Discord: All projects, Yonder and the starred projects, the last used
  first. It switches projects fast. Each icon is the favicon of the
  project, else its first letter. A tap selects the project. The phone
  hides the rail while an agent or the New agent view is open. The Mac
  keeps its own screen (`ui` in its localStorage): `customize` with
  `use` changes only phone.json.
- The search always shows. The phone opens no keyboard until a tap in
  the field, and an x clears its words. On the Mac a letter typed on
  the tab goes into it. The search is the first part of the list,
  sticky at its top, so the page keeps its height. Else, above the
  list, it pushes the tab bar under the round corners of an iPhone.
  `bun bridge/canvas-e2e.ts` checks the tab bar at 320 and 375 pt in
  each theme, light and dark. It finds pages and sites by name, and an
  address in it, such as `localhost:3000`, gives the row "Open
  localhost:3000", which adds it to the tunnel list. The voice can add
  such an address too.
- On the phone, a swipe to the right stars an app (as a starred
  agent), and a swipe to the left archives a page or deletes a site. A
  long press on the phone, or a right-click on the Mac, opens Rename,
  Star, Change icon, Rebuild, Archive and Delete (only Delete for a
  site). Delete on a page removes it with its files after a yes, as
  Delete forever in the archive: a delete that does not stop in the
  archive. Generate in Change icon, and Rebuild, send a message to the
  agent that made the page, or start a new agent for a page of a call.
  Each action changes the list at once, then calls the bridge.
- The archive: an archived page goes to "Archived" under the apps, which
  is closed until a tap on its title. Its files stay on the Mac. In the
  archive, a swipe to the right (or Restore in the menu) brings a page
  back, and a swipe to the left (or Delete forever) removes it with its
  files, after a yes. Only this is a real delete. An app that the user
  removed stays removed: a new version of an archived page stays in the
  archive, and the next page of an agent whose app the user deleted
  forever goes to the archive (`dropped` in `canvas/state.json`). Such a
  page does not open and sends no push, and `show_app` tells the agent
  so. `/canvas` gives the archive only with `?all`, which the screen of
  the archive asks for. Else a phone that runs an older screen, which
  knows no `archived`, puts the archived apps back in the list at its
  next load. A site is not archived: its delete only hides it.
- The grid: a button at the top right of the Canvas tab shows the apps as
  a list or as a grid of icons with the name under each, four in a row,
  as the home screen of the iPhone. A tap opens an app, and a long press
  opens the same menu. A style with sharp corners, such as Terminal,
  gets square icons on a grid of lines from edge to edge. Each device
  keeps its choice in `appsView` (phone.json, with the sync of the
  account). The Settings show no row for it.
- The front-end API (`yonder.apps` in `src/api.ts`) has `list` (the apps
  that are not in the archive), `archived`, `archive`, `restore` and
  `remove` (the delete forever, which asks the user first from a page in
  a frame). The default screen uses the same calls, so each theme gets
  the archive. The samples Chat and Dashboard list only the apps that
  are not in the archive.
- The names: the tools have "app" in their names, as the tab of the
  apps. `show_artifact` is `show_app`, and `build_artifact` is
  `build_app`. Their descriptions still say "artifact", so a search for
  either word finds them. A call with an old name still works:
  `renamed` in `bridge/main.ts` changes the name of each `tools/call`
  before the server gets it, and logs it. So a client with an old list
  of the tools does not break, and only the new names are in the list.
  `bridge/canvas-check.ts` checks both.
- A site looks and acts as an app, and runs only when it is necessary.
  Else the list fills with many tunnels that nobody can identify.
  - Only the sites that make sense show (the `list` action of
    `preview`): its tunnel is open, the user starred it, the user or an
    agent added its address, or it is a site of an agent that is not
    closed (`sitesOf` in `bridge/main.ts`: a server whose port the last
    message of the agent names, in its folder, or a server in its git
    worktree). Each other server of the Mac, such as a server of
    another program or of a tool, does not show, and Grok does not get
    it in the list. So a site goes when its agent closes. An address
    typed in the search still adds any port. A folder that an agent
    moved into counts only when it is a git worktree. Else an agent in
    a parent folder of many projects gets each server in it as its
    site, also the graph of codebase-memory.
  - Its name comes from Haiku (`nameSite` in `bridge/main.ts`, `ask` on
    the subscription): two to four words from its project, its
    worktree, the title of its page and the tasks of its agents, such as
    "Landing page". The bridge asks once for each site, three at a
    time, and keeps the name (`auto` in `canvas/state.json`). A name
    that the user gives wins. Until Haiku answers, or with no login of
    Claude Code, the title of its page shows, else its port.
  - Its second line is as the line of a page: its computer, its newest
    agent and the start of its server, such as "Agent 12 · 5m ago".
  - It has no switch, and no green dot. Its tunnel opens when the user
    opens it on the phone (a yes the first time for a project), and ends
    when nobody uses it for 30 minutes (`IDLE` in `bridge/preview.ts`).
    "Turn off the tunnel of ..." still ends it by voice (`preview` with
    `stop`).
  - On the Mac a tap opens a site of the Mac in the viewer of the apps,
    as an app: an iframe of `http://localhost:<port>`, with no tunnel,
    and with Close. A site that does not let a frame show it
    (X-Frame-Options, or a frame-ancestors with no `*`: `framable` in
    `bridge/preview.ts`) and an address of another host open in the
    browser of the Mac. A site that an agent opens with `preview` and a
    local `url` opens the same way. Star is in the menu of the row: the
    viewer has no Star for a site.
  - On the phone a site opens in the browser inside Yonder. In a frame
    of the screen, iOS would block the cookie of the tunnel
    (`__Host-yonder`), because it is a cookie of another site.
- `preview` with action `clean` takes each site of the computer whose
  tunnel is off and that the user did not save out of Tunnels, in one
  call, as `remove_app` takes one: an added address goes, and the row of
  a dev server hides until its server starts again. The servers keep
  running. It gives `cleaned` and `kept`. It is an easy way for an
  agent to clean up the tunnels. The voice agent calls it for "clean up
  the tunnels".
- The tools: `change_app` renames, saves or unsaves an app, gives it a
  new icon, or restores it from the archive (`archived: false`).
  `remove_app` moves a page to the archive with its files. Only with
  `forever`, when the user says to delete it forever, it deletes the
  page with its versions (in `canvas/.trash` until the next delete).
  `undo` and the shake of the phone ("Undo Archive?" or "Undo Delete?")
  bring it back. For a site, `remove_app` takes an added
  address out of the list, or hides the row of a dev server until its
  server starts again (its pid), and closes its tunnel. Both tools take
  the id or the name of an app. The names, saves and icons of the sites
  are in `canvas/state.json` (`sites`).
- A page that is not saved goes to the archive 7 days after its last
  version, at the start of the bridge and then once a day, with its
  files. `appDays` in `config.json` sets the days, and 0 keeps all pages
  in the list. The page of an agent that runs or waits stays.
- An app page is one HTML file of 1 MB or less, made for a phone first.
  `show_app` keeps each version in
  `~/.config/yonder/canvas/<id>/<version>.html`. An agent can have
  several apps, each with its own card in its chat: a page with a new
  title makes a new app, a page with the title of one of its apps adds a
  new version of that app, and a page with no title adds a new version
  of its newest app. So one task can send several apps. A new app of an
  agent whose app the user deleted forever goes to the archive. The tab
  of an agent is "App", or "Apps" for two or more, not a count such as
  "Canvas 1", which reads as a name. The voice agent makes a new app
  each time, unless it gives `id`. With `id` and `version`, an old
  version comes back as the newest.
- The agents get the real screen of the phone. Each `/show` poll sends
  `screen`: the window in CSS px, the pixel ratio, the safe areas, the
  frame of the viewer (under Save and Close, over the safe area at the
  bottom), and the look (`screenOf` in `src/Canvas.tsx`). The bridge
  keeps it in `displays.json`, and the description of `show_app`
  and the rules of `build_app` tell it, such as "The phone of the
  user is 402x874 CSS px at 3x, with safe areas of 62 px at the top, 34
  px at the bottom, in the dark look. An app shows in a frame of
  402x726 CSS px". A phone wins over the window of the Mac.
- The bridge knows the agent from the address of its session
  (`/mcp?worker=`), or from the number that an older session gives.
  Grok and the Claude call own the pages that they make ("Your call").
- The phone gets each page through the encrypted link of the relay, as
  a picture (`/media`), and keeps it in the same cache. Cloudflare never
  sees it: the pages use the relay, not the tunnel. The sites keep the
  tunnel.
- The app shows a page in `<iframe sandbox="allow-scripts" srcdoc>`. The
  page has the origin `null`: it cannot read the app, its storage, its
  keys or the other pages, and it cannot call the bridge or a command of
  Tauri, because Tauri gives its commands and their key only to the main
  frame. `bridge/canvas-e2e.ts` checks this in Chrome, and the same
  probe passes in iOS Safari (WebKit). `/media` serves a page with
  `content-security-policy: sandbox allow-scripts`, so a page is
  sandboxed also when it opens as an address.
- The app puts its colors into each page as CSS variables (`--bg`,
  `--text`, `--muted`, `--line`, `--accent` and the others), with no
  weight, so a page that uses them follows the look, and a page with its
  own colors keeps them. A link of the page opens in the browser of the
  phone.
- A page can send a change to its computer: it calls
  `parent.postMessage({ yonderSend: data }, "*")`. The viewer posts
  `{ path, message }` to `/canvas` of the computer of the page, and gives
  `{ yonderSent: data, ok }` back to the page, so the page can undo its
  change on the screen when the send fails. The bridge writes the message,
  10 KB or less, as a JSON file in `canvas/<id>/inbox/`, named by the
  time. A job of the user on that computer reads each file and deletes
  it. The page still cannot call the bridge itself: it only sends data,
  and only into the folder of its own app. An example is an app that
  adds items to a shopping list and checks them off.
- On iOS, the viewer of an app covers only the part of the page over the
  keyboard, as `main` does (`html[data-viewport] .viewer.artifact-viewer`
  in `src/app.css`). The app puts a small script into each page (`TYPING`
  in `src/Canvas.tsx`): a text field with the focus posts
  `{ yonderTyping }`, and the app runs its own keyboard code with
  `data-frame-typing`, as for an own screen. So a sheet fixed at the
  bottom of a page sits on the keyboard. `show_app` tells the agents to
  use a sheet from the bottom for a form or a choice, never a modal
  dialog in the middle.
- A chat shows each page where its agent made it,
  with its title, its version and Open. A card shows one time, at the
  newest message that names the page, so the card moves under the final
  message of the agent, which names the path in place of a screenshot.
  The card is as high as the free part of the view between the tabs and
  the message box, and on the Mac it has the width of a phone. The
  card shows a still of the page, not the live page: an app opens only
  on a tap, as a document, for the App Store. The bridge draws the
  still with headless Google Chrome at the size of the card, in the
  colors of the screen (`/shot`, `bridge/shot.ts`). The page cannot call
  the bridge or a server of the computer there (`connect-src 'none'`,
  pictures and scripts only from https). The still stays in
  `canvas/<id>/.shots/`, and the phone keeps it in the cache of its
  pictures. On a computer with no Chrome, and while the still loads,
  the card shows the icon of the app. An agent with an app gets a
  Canvas view next to Context. A tap opens the viewer at full screen,
  with Star and Close. The viewer has no Share.
- `build_app`: the voice agent starts an agent with the task and
  the rules of an app, with the screen and the icon. A push tells the
  user when the call ended. For a small page, Grok writes the page itself with
  `show_app`, and the page opens at once from the result. The
  Claude call gets an `app` event.
- A page that an agent shows with `show_app` never opens by itself,
  also with `id` alone. It shows in the chat of the agent and in the
  Canvas tab, and the user opens it there. A page of another program on
  this Mac, such as the Claude connector, does the same. `/show` gives no
  page, and the screen skips a page of an older bridge. Else a page
  opens over what the user does in Yonder.
- Approvals: an agent calls `ask_user` with a kind: `yes-no`, `code` (a
  one-time code, which iOS offers from Messages), `choice`, `pay` or
  `terms`. Only an agent gets the tool. Terms need a yes from the phone,
  with no Face ID. A payment needs the `link` of
  its payment page, such as the Stripe Checkout link of `vsb topup`: Pay
  opens the page on the phone or the Mac, and the user pays there. Yonder
  never keeps or charges a card, and the agent never clicks Pay. The
  agents learn this from the prompt of Yonder. The agent waits up to 10
  minutes, and 5 for a payment, then it gets "expired". The workers get
  the yonder server with a timeout of 30 minutes, and `/mcp` has no idle
  timeout, because Bun ends a request with no answer after 10 seconds.
- The sheet (`Approval` in `src/Canvas.tsx`) shows at once on each open
  app, and a push goes out. A swipe down puts it aside in "Needs you",
  and Review shows it again. "Allow Bash?" and 1Password use the same
  sheet.
- A yes to an ask with Face ID counts only through the relay from a
  paired phone (`fromPhone`). The Mac shows "Approve on the phone" for
  such an ask. A payment has no Face ID in Yonder: its yes only opens the
  page, so the Mac can open it too, and an agent cannot pay with a yes of
  its own.
- Each answer goes into `~/.config/yonder/approvals.jsonl`: the time,
  the kind, the agent, the title, the answer, the device and Face ID.
  Never a code, a password or a card.
- The checks: `bun bridge/canvas.ts` (the store), `bun bridge/shot.ts`
  (the still), `bun
  bridge/canvas-check.ts` (no network, no credits: the apps of an
  agent, `/shot`, the screen in the tools, change_app, remove_app and undo, and
  the asks) and `bun bridge/canvas-e2e.ts` (a phone page in headless
  Chrome through the real relay: the icons, the menu, Save, Archive,
  Restore, Delete forever and undo, Apps and Tunnels, the port names,
  `preview` clean, the grid, the pull down, the hide on
  a scroll and the address, the Apps tab in each theme as a list and as
  a grid, the asks, the App view of an
  agent and the viewer, with a screenshot of each screen). The test
  bridge also sees the dev servers of the Mac, as sites.
- Phase 2: the native sheet (`sheet` of the native kit of
  `Abilities.swift`), Approve and Deny on a push, and computer use for
  native apps.

## Yonder Preview

- Yonder Preview shows the web site of an agent, such as its dev server,
  on the phone or on any device, at a private HTTPS address, for example
  `https://sundial-home.yonder.so`. It is strong, protected and fast, with
  a real domain. The design and its reasons are in `docs/tunnel.md`.
- The Preview tab is the Tunnel tab, and the Preview row of the Settings
  is the Tunnel row. The value of the tab stays `preview`, for
  `show_tab`.
- A site has no switch now, and only the sites of the agents show (see
  "A site looks and acts as an app" under Apps). The next lines tell the
  Tunnel tab with a switch on each site.
- Each row of the Tunnel tab has a switch. On opens the tunnel of the
  site, so the phone reaches it: the first time for a project, the app
  asks the user yes or no first. Off ends the tunnel and each cookie and
  share link of it (`preview` with `stop`). A tap on the row still opens
  the site. The switch on the Mac calls `preview` with `open` and
  `mac: false`, and drops the key of the address.
- A tap on a row or a switch uses the last scan of the ports, when it is
  5 seconds old or less (`recent` in `bridge/preview.ts`). A site that
  is not in it makes a new scan. Else a tap takes one or two seconds:
  each scan (`lsof`) takes about 140 ms, an open made three scans one
  after the other, and a tap waited for the list of Claude Code sessions
  too. Now a tap on a site by its name does neither.
- The app keeps the last list of the Tunnel tab in localStorage
  (`sites`). After a start of the app, the tab shows that list at once,
  and the next scan corrects it. A switch to another Mac deletes it. So
  the tab does not show an empty list while the bridge scans the ports.
- The "Add tunnel" button at the top of the Tunnel tab adds any
  address. A tap shows a field, and Escape or an empty field that loses
  focus hides it again. A search shows at the left of "Add tunnel", as
  the search at the left of "Add folder" in the Projects tab. It finds a
  site by its name, its title, its project or its port. Add folder and
  Add tunnel are round glass + buttons of the height of the search
  (36 px on the Mac, 44 px on the phone, with a native twin on iOS 26),
  and the + that adds a typed address is the same button. The address
  can be a port (`3000`), `localhost:3000`, or a full address such as
  `http://10.0.0.10:8080` or `https://example.com`. The bridge
  (`preview` with `add` and `url`) keeps only the origin, names it after
  its host and port (`localhost-3000`), keeps it in `preview/state.json`
  (`added`), and opens its tunnel at once, with no question: the user
  typed it. A local address goes to 127.0.0.1, or to [::1] when only
  that answers, as Vite does. An address where nothing answers is not
  added. The server sees the Host and the Origin that the user typed. An
  added address never ends by itself, because it has no folder. Off
  keeps it in the list, and its trash button removes it (`remove`).
  Grok adds one too ("tunnel localhost 3000"). An HTTPS server with a
  self-signed certificate, such as a router, does not work yet.
- A local address on a port of Yonder itself (the bridge 7787, the
  phones of the local network 7786, the tunnel 7788) is refused
  (`ownPort` in `bridge/preview.ts`). The proxy sends the Host that the
  bridge expects, so else a tunnel of `localhost:7787` gives the tools
  of the bridge to each person with its link.
- Grok opens any address in one call: `preview` with `open` and `url`
  adds the address, as `add` does, and shows it, on the phone in the
  browser inside Yonder. Grok also turns a tunnel off with `stop`
  ("disable localhost 3000"), on again with `open`, and removes an added
  address with `remove`. `stop` and `remove` take the name or the `url`.
- A web site with no scheme and no port, such as `example.com`, is
  `https://example.com`. On http, such a site sends the browser to its
  https address, out of the tunnel. An IP address or an address with a
  port stays on http.
- A Cloudflare Tunnel brings the previews to the Mac. The bridge runs
  `cloudflared` with the token of the tunnel of the computer. Cloudflare
  sends each preview name of `*.yonder.so` that has no DNS record of its
  own through the tunnel to `http://127.0.0.1:7788` on the Mac. It is
  faster than an own edge far from the user (see below), and people
  trust Cloudflare. Cloudflare ends HTTPS, so Cloudflare can read the
  pages.
- The bridge (`bridge/preview.ts`) serves the previews on port 7788. It
  checks the cookie, and passes each request and each WebSocket (hot
  reload) to the dev server, with the Host `localhost:<port>`. It removes
  the headers of Cloudflare (`cf-*`, `x-forwarded-*`), because with
  `X-Forwarded-Proto` Django and Next.js make `https://localhost` links. It
  puts `private` in the `Cache-Control` of each answer, so that Cloudflare
  never keeps a page, and never gives it to a browser with no cookie.
- A preview address has one level, `<label>-<name>.yonder.so`, because
  the free certificate of Cloudflare covers only one level under
  yonder.so. `*.<name>.yonder.so` needs Advanced Certificate Manager, $10
  each month, and the one-level names cost nothing. A label has at most
  48 characters, so that `-<name>` fits in one DNS label.
- `cloudflared` starts again when it stops. The bridge stops it when the
  bridge exits, also on SIGTERM, because the app quits the bridge with
  SIGTERM. At its start, the bridge stops a `cloudflared` that an old
  bridge left (`preview/cloudflared.pid`). The token of the tunnel goes to
  `cloudflared` in its environment, not in its arguments, which each
  process of the Mac can read.
- Email Address Obfuscation of Cloudflare is on for yonder.so, to protect
  the addresses on the landing page. It also changes the email addresses
  in the HTML of a preview, and its script shows them again in the
  browser.
- Each web server in a project folder gets a name: the project, then the
  worktree, then the port for a second server in the same folder. The
  Tunnel tab also shows each web server outside the project folders, as
  `localhost-<port>`, with a globe and a switch, so the user sees each
  open localhost and turns each one on or off. Now only the sites of the
  agents show. The remote debugging port of a browser (Chrome on 9222)
  never shows, because it gives control of the browser. The
  bridge finds the servers with `lsof`, at most every 5 seconds, and keeps
  only the servers that answer HTTP with a web page (HTML or a redirect). A
  server gets a public name only when the user opens its preview.
- The scan finds each process that listens on a TCP port and has its
  folder in a project, not only dev servers. So an answer that is not a
  web page is not a site. Else the Android emulator (`netsimd`) in a
  worktree, which answers "404 not found" in plain text, shows as a site
  with no title. A Django server with no page at `/` still shows, with
  the title "Page not found at /".
- A worktree in a sub-folder of a project adds its name too: a server in
  `sundial/lab/.claude/worktrees/reel-time` is `sundial-reel-time`. So
  "open the site of sundial" does not pick the server of one agent. A
  folder with no `index.html` under `python3 -m http.server` shows the
  title "Directory listing for /".
- The Settings have a Tunnel row (On or Off). The bridge keeps it in
  `state.json` (`preview`), because the Mac, the phone and Grok all need
  it, and `GET` or `POST /preview` reads or sets it. Off ends each open
  preview and its links, the Preview tab says "Tunnel is off", the
  Preview button of a conversation hides, and the `preview` tool tells
  Grok to ask the user to turn it on. The tunnel stays connected, but no
  site goes through it.
- The first time that a project goes out through the tunnel (open on the
  phone, or share), the user says yes. On the Mac, Preview opens
  localhost, so it never asks. A tap on the phone shows a dialog with
  the project, the title and the port. When Grok calls `preview`, the
  result has `confirm` and tells Grok what to ask, and Grok calls again
  with `confirmed: true` after the user says yes. It asks each time that
  the tunnel of the site is closed, also for a localhost link in a chat:
  Yonder never opens a closed tunnel for the user. The switch of the
  Tunnel tab is the yes, so it does not ask.
- The switch of the row ends a preview that is open outside the Mac:
  Off ends the preview and each cookie and share link of it (`preview`
  with `stop`). Grok closes one too ("close the preview of sundial"). A
  preview also ends by itself one minute after its server stops. A
  server that starts again in the same folder in that minute keeps the
  preview. A preview also ends by itself when nobody uses it for 30
  minutes: no request and no WebSocket message. A preview with a share
  link stays open until the share ends. So a tunnel does not stay open
  to the web while the user does not use it, and Yonder never relays a
  site without permission.
- `list_workers` gives the server of each agent in `site`: the server
  whose URL its last message names, or the server in its git worktree.
  Then the conversation view shows a Preview button: on the Mac in the
  row of the agent, and on the phone as a native glass button with a
  globe in the card of the Summary tab. A server in the main
  folder of a project is the site of the project ("open the site of
  sundial"), not of one agent, because it can be a tool: the graph of
  codebase-memory runs in the folder of Yonder.
- The `preview` tool of Grok: `open` ("show me the site of agent 3"),
  `share` (a link for another person, for 60 minutes, on the clipboard),
  `stop`, and `list`. It finds a site by its name (`yonder-landing`), by an
  agent, or by a project. A preview address in the last message of an
  agent also names its site. Else "show me the website" after an agent
  names a preview address makes Grok ask that agent, which runs no
  server. For an agent with no site, the tool lists the sites that run.
- On the Mac, Preview opens `http://localhost:<port>` in the browser of
  the Mac. No tunnel is necessary.
- On the phone, Preview opens the private address in a browser inside
  Yonder (the opener plugin: SFSafariViewController on iOS, Custom Tabs on
  Android), so a call goes on. The address has a one-time key, which
  becomes an `HttpOnly` cookie for that one name. The key never goes to
  Grok. A phone app without the plugin gets the link on the clipboard of
  the Mac, and Universal Clipboard gives it to the iPhone. The plugin
  needs `bun run install-ios` and `bun run install-android`. The default
  permission of the opener plugin allows an address only when nothing
  names how to open it, so it refuses the in-app browser, and the phone
  falls back to the clipboard. The capabilities of the phone apps allow
  `https://*.yonder.so/*` in the in-app browser.
- On the phone, a link to localhost in a conversation, such as
  `http://localhost:5173/about`, opens through Yonder Preview, as the
  Preview button does, and keeps its path. The phone cannot reach
  localhost, so else Safari shows an error. The server on that port
  must run in a project. On the Mac, the link opens in the browser of the
  Mac.
- When the Tunnel is off, a tap on such a link shows a confirm panel: "Open
  port 5173 on this phone?" with "Turn on and open". The yes turns the
  Tunnel on and opens the port through the tunnel, with no second question for
  the project. When the Tunnel is on, the first open of a project asks as the
  Preview button does.
- A preview address in a conversation, such as
  `https://yonder-landing-home.yonder.so`, opens the same way, by the
  name of its site: the phone asks before it opens a closed tunnel, and
  the Mac opens the site from localhost, with no tunnel. The bridge
  gives the end of the addresses (`suffix`) in `GET /preview`.
- The question before a closed tunnel opens is a native alert of the
  system (`ask` of the dialog plugin, permission `dialog:allow-ask`), on
  iOS, Android and the Mac. The Android app has the dialog plugin for it.
  A phone app that is older than the permission refuses the alert, and
  then the dialog of the window asks.
- The Tunnel tab, the tab before Search on the Mac and on the phone (a
  globe in the tab bar of the phone), lists the web sites that run on
  the Mac: the favicon of the project, the name of the site, the title
  of its page and its port. A tap or a click opens the site, as the
  Preview button does. The tab asks the bridge for the list when it
  opens, and again every 5 seconds while it shows, because each list
  scans the ports of the Mac. Five tabs do not fit in a Mac window
  narrower than about 440 px, so there the segmented control of the tabs
  scrolls sideways, and the open tab scrolls into view.
- On the phone, the Tunnel tab shows the sites of all the computers of
  the phone together, so the user goes from one computer to another
  easily: the sites of the computer in use under its name, then the
  sites of each other computer under its name. A dropdown at the right
  of the search (All, or one computer) shows one computer. A site of
  another computer opens, turns on or off, and goes away through the
  link of that computer (`reach` in `src/elsewhere.ts`, and `siteAt` in
  `src/App.tsx`), so the phone stays on the computer in use, and the
  address is on the tunnel of that computer. "Add tunnel" adds the
  address to the computer of the filter, else to the computer in use. A
  computer with its Tunnel off shows its name and "Off". A computer with
  no answer in 8 seconds does not show, as on the Agents tab. A computer
  with its switch off (Settings, Environment) does not show.
  The Mac app has no environments, so it shows only its own sites.
- The worker prompt tells each agent to keep a dev server running in the
  background and to name its URL in its final message. The prompt says
  to start the server in a new session, and not to stop it when the
  task ends. Else the server stops with the task, and a tap on the link
  shows "Ask the task to start its dev server." The Mac has no `setsid`
  command, so the prompt says to use Python `os.setsid`. A tap on a port
  where nothing runs says "Nothing runs on port N." A new tap clears
  that line.
- An older design sent the previews through an own edge server, which
  read only the SNI name of each connection, so the TLS ended on the
  Mac. Nothing uses it now.
- An edge far from the user is slow. Through the old edge, on another
  continent, a page of `yonder-landing` took 7 s, and 0.4 s on the Mac.
  Each request crossed the ocean and back two times (about 330 ms), and HTTP/1.1 sends only 6 requests at a time. An edge near
  the user is the fix. The numbers are in "Why the tunnel is slow" in
  `docs/tunnel.md`. Through Cloudflare Tunnel, which is about ten times
  faster, the same page loads in 0.7 s, and a reload takes 0.4 s
  (HTTP/3). With Cloudflare Tunnel, Cloudflare can read the pages.
- Each computer gets its tunnel with no setup. `bun run setup-tunnel`
  is not the way for a user: it needs the source of Yonder and
  `cloudflared` with the Cloudflare login of the owner of the domain, and a copy
  from yonder.so has neither. And it sends `*.yonder.so` to the tunnel
  of its computer, so on a second computer it would take the previews of
  the first one.
  - `GET /preview` of the bridge gives `tunnel` (does this computer have
    one), and with no tunnel `id` (the public key of its relay identity)
    and `computer` (its name).
  - The app asks yonder.so for the tunnel of each computer with
    `tunnel: false` (`giveTunnel` in `src/account.ts`): the Mac app for its
    own computer, and the phone for the computer in use and each other
    computer. It needs a sign-in, and no plan: each account gets
    tunnels, and with no account there is no hosted tunnel. An account
    gets tunnels for 10 computers at most, because each computer takes
    one DNS record of yonder.so, and the Free plan of the zone allows 200
    records. Each computer is asked at most one time in 10 minutes. So an
    ask that fails, such as before yonder.so has its Cloudflare token,
    comes again.
  - The accounts server (`POST /api/app/tunnel` of the yonder.so
    backend, private) makes the tunnel `yonder-<name>` in our Cloudflare account,
    the record `tunnel-<name>.yonder.so`, and the route
    `*-<name>.yonder.so/*` of the Worker `yonder-tunnels`. The Worker sends
    each preview `<label>-<name>.yonder.so` to `tunnel-<name>.yonder.so`
    with `resolveOverride`, and keeps the Host. So each computer takes one
    record and one route, not one for each preview. The name comes from
    the name of the computer, with letters and digits only, such as
    `novaworkmbp`, because the Worker finds it after the last "-".
    `resolveOverride` reaches a tunnel on our plan of Cloudflare.
  - The app gives the answer to the bridge (`POST /preview` with
    `tunnel`). The bridge writes `tunnel.json` and starts `cloudflared` at
    once, with no restart. A computer that has a tunnel keeps it. With
    no tunnel, the message says that the computer gets a tunnel when the
    app is signed in to an account.
- The first tunnel, made with `bun run setup-tunnel --name <name>`, has
  the wildcard `*.yonder.so`. `bun run setup-tunnel` makes it with
  `cloudflared` (`tunnel create`, `tunnel route dns`, `tunnel token`),
  and writes `~/.config/yonder/tunnel.json` with its token. On another
  computer it stops at the DNS step, because the wildcard belongs to the
  first tunnel. The accounts server
  never gives the name of that first tunnel. The token takes each name
  of the tunnel, so it never goes into a log, a commit or a message.
- `bun run check-preview` runs the HTTP server of the preview with a test
  server, and sends what `cloudflared` sends: the key and the cookie, the
  Host, Origin and Referer, a redirect, gzip, the `Cache-Control`, 6 MB up
  and a WebSocket. It needs no network. A live test through the tunnel
  shows the hot reload of Vite (`[vite] connected.`), and the `BYPASS`
  of the Cloudflare cache for a file with no cookie.
- The landing page says that the previews are tunneled securely through
  Cloudflare, with the logo of Cloudflare.
- Live View, a WebRTC video of the browser of the agent, is not built.
- The Canvas is built as the Apps tab (see Apps): one tab for the sites
  of the Tunnel tab, the pages that agents make (artifacts), and the
  approvals with Face ID (payments such as Stripe Checkout, and
  passwords from 1Password). The look, the tabs and the Canvas change
  when the user asks an agent, and pinned tabs and live views come
  later. The design, the phases and the mock-ups are in
  `docs/canvas.md`.
- Screens and styles are built (see "Screens and styles" under Phone).
  The design, the format and the mock-ups are in `docs/ui-themes.md`.
- Fonts can fail to load in a preview: a link from the `node_modules` of
  a worktree puts them outside the allow list of Vite. They fail on the
  Mac too. A site that calls a second local server, such as an API on
  `127.0.0.1:8000`, shows no data through the tunnel. The research and a
  design for one general preview of each port, with an address bar (the
  phone listens on the ports of the Mac), are in `docs/tunnel.md`. One
  switch for each localhost port of the Mac is not built: a switch on
  each site and a field to add any address are used instead (see above).

### Yonder in the Claude app

Yonder works as a custom connector in the Claude app on the phone.
Claude can then use the tools of Yonder, such as `start_worker` and
`list_workers`.

- **The address.** Anthropic's servers call a connector, not the phone, so
  the connector needs a public address. It is `https://mcp.yonder.so/<id>`,
  through the relay, on each computer. So the connector works for all
  users with no tunnel and no cost for each user.
  - The old address `https://tunnel.yonder.so/<id>/mcp` and its path
    still work, with no redirect, because a client can fail to follow a
    redirect of a POST or drop the token. So the connectors that use the
    old address need no new sign-in.
  - The bridge serves the MCP at `/<id>` and at `/<id>/mcp`. The OAuth
    metadata uses the name and the path that the client called: the
    resource of `/.well-known/oauth-protected-resource/<id>` is
    `https://mcp.yonder.so/<id>`, and that of `.../<id>/mcp` ends in
    `/mcp`. The client of the MCP SDK checks that the resource matches
    its address, and `bun bridge/remote.ts` runs it for both.
  - The relay (the relay repository, yonder-relay) passes each request of
    `/<id>/...`, and each OAuth discovery path with the id after the
    kind (`/.well-known/oauth-protected-resource/<id>/mcp`,
    `/.well-known/oauth-authorization-server/<id>`), to the bridge, as one
    text frame over the socket that the bridge keeps open. So a request
    opens no new connection to the computer. The answer comes back as one
    text frame (`forward` in `bridge/relay.ts`, `handleAt` in
    `bridge/remote.ts`). The bodies are text, because the MCP of the bridge
    answers with JSON only.
  - The id is a hash of the token of the relay (`connectorOf`), with
    another prefix than the room. So only the bridge with the token can
    take the id, and a phone that knows the room does not know the
    address.
  - `mcp.yonder.so` and `tunnel.yonder.so` are A records, proxied by
    Cloudflare, to the server of the relay. A record of its own wins over
    the wildcard `*.yonder.so` of Yonder Preview. The web server in front
    of the relay sends both to the relay, as `relay.yonder.so`. The
    relay finds the computer by the path, not by the name. A relay of the
    user's own answers the same paths on its own host.
  - The relay ends HTTPS for these requests, so it can read them, as
    Cloudflare can for the tunnel. It does not log or keep them. The README
    of the relay and the privacy policy say so.
  - A test with claude.ai: its probe reads the 401, the metadata of the
    resource and the metadata of the authorization server through the
    relay ("detected", registration "dcr"). Claude then registers, opens
    the page for the code at `/<id>/authorize`, gets a token and lists
    the tools.
  - The speed, the median of each request on a kept-alive connection,
    relay against tunnel. The relay and the test Mac were on two
    continents. From Claude's servers (the probe of
    claude.ai, 8 runs of 3 requests): 340 ms against 158 ms, so the
    relay adds about 180 ms. From the Mac: 263 ms against 23 ms for a
    401, 277 ms against 55 ms for `tools/list` (36 KB), so about 230 ms.
    From the relay server: 156 ms against 119 ms, so about 35 ms.
    Each request crosses the ocean two times, because the relay is on
    the other continent. A relay near the users, for example a second
    region or Cloudflare (a Worker with a Durable Object for each computer),
    removes most of it.
  - The first address, `https://mcp-<code>-<name>.yonder.so/mcp` through
    the tunnel of Yonder Preview, still works on a Mac with
    `bun run setup-tunnel`, for the connectors that use it. The tokens are
    the same for both addresses.
- **The lock.** The name is not the lock. The bridge is an OAuth 2.1
  authorization server for the connector (`bridge/remote.ts`). Claude
  registers itself (Dynamic Client Registration), and opens a page that
  asks for a code. The `connect_claude` tool gives the address and a code
  of 6 digits. The code works one time, for 5 minutes, and five wrong tries
  end it. Then Claude gets a token with PKCE, and each `/mcp` request needs
  the token. `remote.json` keeps only the hash of each token.
- **Connect.** Open Settings, MCP, and tap Copy, or say "connect Claude"
  to Yonder. In Claude, open Customize (Settings in an older app), then
  Connectors, then Add, then Add custom connector, and paste the
  address. Type the code on the page that opens. A connector that the
  user adds on claude.ai also shows in the phone app.
- **The word "plugins".** The screen calls the tools of Yonder
  "plugins": the Yonder plugins switch of Claude Code and of each other
  CLI in Agents, and the Plugins section (id `tools`: Browser Harness,
  Visual Sandbox, Kokoro, The Mind). The names of the MCP tools, their
  descriptions, the ids and the code keep the word "tool".
- **The MCP section of the Settings** (`bridge/settings/mcp.json`, on
  the phone and the Mac, in each theme). It shows the address with a
  Copy button, the code, a line on how to add the connector in Claude,
  and Disconnect all, which calls `connect_claude` with `revoke` and
  names the connected apps. The page makes a code when it opens, and
  Copy puts the address on the clipboard in the tap and makes a new
  code. `connect_claude` with `code: false` gives the address with no
  code, for a voice agent.
  - The section has its own place, so the user finds the address and
    the code without the voice agent, and the address shows at once,
    with no tap first.
  - The bridge gives the list of the sections, and the screen draws their
    pages. A phone can still run a screen from before a new section (it
    loads a new screen only when the user does not see it), and then
    shows an empty page. So a screen hides a section that it does not
    know and that has no rows of the schema, until the screen updates.
- **The code on the phone.** When the page of Claude opens, the open code
  goes to the phones as a push ("Code for Claude", "123 456"), one time
  for each code (`told` in `bridge/remote.ts`). So on the phone, the user
  reads the code on the banner and stays in Claude. The push goes also
  while the user works on the Mac. Only Yonder makes a code (the MCP
  section, or a call of `connect_claude`), so a stranger who opens the
  page with no open code sends nothing,
  and with an open code only sends it to the phones of the user.
- **Claude Code.** The Yonder plugins switch (Settings, Agents) gives
  Claude Code the local MCP of each computer with Yonder, so the setup has
  no row for Claude Code and no `claude mcp add` command. The connector
  still works for Claude Code: its redirect is on localhost, which
  `okRedirect` allows, and `bun bridge/remote.ts` runs the client of the
  MCP SDK through the relay paths, as Claude Code does.
- **Disconnect.** `connect_claude` with `revoke` ends each token. Each
  Claude app then must connect again.
- **Approvals and search.** The voice agent of the Claude app can say
  that `build_app` or `message_worker` failed with "approval timed out
  after 30s; not executed", and works when it tries again. The text is
  not in the bridge, the relay or Claude Code, so it most likely comes
  from the approval step of the Claude app itself (not checked: its code
  is not ours). MCP takes a tool with no annotations as one that
  deletes. The annotations are the one lever of Yonder. So each tool has
  them (`READ_ONLY` and `DESTRUCTIVE` in `bridge/main.ts`): the tools
  that only read have `readOnlyHint`, and only the close, the complete,
  the remove, `use_secret` and the releases have `destructiveHint`. When
  the Claude app still asks, set the tool to "Always allow" in
  Customize, Connectors, Yonder. The Claude app finds each tool with a
  search of the words. So each description starts with its plain words
  ("Start a new agent (a worker) for a new task"), and `other_computer`
  does not name `start_worker`: else a search for `start_worker` finds
  `other_computer` first.
- **Files from the Claude app.** A file attached in the Claude app,
  such as a 4K video of 335 MB, cannot go to an agent through
  `start_worker` or `message_worker`: they take only paths on the Mac,
  which the Yonder app fills in. The limits of the Claude app, from the
  help pages of Anthropic and a test:
  - Claude sees an attached video only as a file name. It cannot put the
    bytes in a tool call. Inline base64 works only for a small file.
  - The help page says that the sandbox of the Claude app (code
    execution) takes files of 30 MB at most and reaches only package
    managers. A test in the Claude app showed more: the sandbox had the
    video of 335 MB, and it reached yonder.so and httpbin.org with curl
    (GET and POST, status 200).
  - Each request of the connector goes through Cloudflare and the relay
    in clear, and the relay takes 1 MiB at most for each request.
- **create_upload.** It is an upload from the code tool of the Claude
  app. `create_upload` gives a link for one file, for 2 hours, and one
  command:
  `curl -fsS https://mcp.yonder.so/<id>/upload/<token>/send.sh | bash -s -- /mnt/user-data/uploads/video.mov`.
  - `send.sh` (in `bridge/upload.ts`) encrypts the file to this
    computer, so Cloudflare and the relay cannot read it: an X25519 key
    of its own and the key of the upload give a shared secret, its
    SHA-256 is the key of AES-256-CTR, and the IV of a part is the number
    of its first block. It needs only bash, openssl and curl.
  - The file goes in parts of 720 KiB, as base64 text, 16 at a time,
    each with `Content-Range: bytes START-END/SIZE` and its client key
    in `X-Key`. Base64 is needed, because the relay passes text bodies of
    1 MiB at most. The bridge writes each part at its place in the file.
    `GET <link>?missing=SIZE` names the parts that are not there, so a
    second run of the command sends only those. `POST <link>?done` ends
    the upload. Then the link is used, and the key of the upload is gone.
  - At the end, the bridge makes the keyframes and the words of a video,
    and sends the file in `files` of `message_worker` to the agent of the
    upload, with its message, or starts a new agent with it. The file
    goes in a folder of that agent:
    `~/.config/yonder/videos/<agent id>/<id>/` or
    `~/.config/yonder/files/<agent id>/<id>/<name>`. When the message
    fails, the result still gives the path (`not_given`).
  - The command runs the sender in the background (`nohup`, and
    `setsid` where it exists) and shows the progress, such as
    "142/335 MB", for up to 60 seconds (`GET <link>?progress`). Then it
    says "Still sending in the background" and ends. A run again only
    shows the progress, or starts the sender again when its pid is gone.
    The output must come before the time limit of the code tool: else
    the code tool ends a command that waits for the whole file after a
    few minutes with no output. The sender goes on in the sandbox: all
    456 parts of a video of 335 MB came in about 2.5 minutes (about
    2.5 MB/s, six at a time). So the parts go 16 at a time.
  - A 4K HEVC `.mov` of 229 MB from a Mac goes through tunnel.yonder.so
    and the relay in 4.0 seconds (57 MB/s), and its SHA-256 on the Mac
    is the same.
  - The voice agents of the app do not get it, as for `send_file`.
  - The checks: `bun bridge/upload.ts` (the script against the store,
    with a part of another client and a second run) and
    `bun bridge/upload-e2e.ts [FILE]` (a test bridge with its own relay
    identity and a fake `claude`: the command through mcp.yonder.so,
    the SHA-256, the keyframes and the message to the agent).
- **send_file.** For a client with no code tool, the `send_file` tool
  has three ways:
  - `url`: a public https link, such as a shared link of Dropbox. This
    computer downloads the file itself, 2 GB at most. A download or a
    video that takes more than 45 seconds goes on, and a second call
    with the same url gives the path. A call of the connector ends after
    60 seconds at the relay.
  - `data` and `name`: base64 of 500 KB or less.
  - Neither: Yonder sends a push to the phones ("Pick a file"), and the
    next `/show` poll of a phone in the next 10 minutes opens the chat of
    `worker`, or a new agent, with the attach sheet. One phone takes it,
    one time, and the Mac never does. The user picks the file there, and
    it goes through the encrypted link of the relay, as each attachment
    of the phone does. This is the way for the video of the Claude app:
    Claude says "tap the push and pick the video again in Yonder". The
    share sheet of iOS also works: share the video from Photos to
    Yonder, and pick the agent (see "The share sheet" under Phone).
  - Each file goes in its own folder: `~/.config/yonder/files/<id>/<name>`,
    or a video in `~/.config/yonder/videos/<id>`, with its keyframes and
    the words of its sound (`buildVideo`), because an agent cannot watch
    a video. The original stays. A HEIC photo also gets a JPEG
    (`sips`), because an agent reads only PNG, JPEG, GIF and WebP. The
    folder is for each file, not for each task, because the user
    attaches a file before the agent exists for a new task.
  - The voice agents of the app (Grok, OpenAI and ElevenLabs) do not
    get `send_file`: in a call, the app already gives the attached files
    in `files`, and a voice agent would open the attach sheet in place of
    a message. The Claude call keeps it.
  - `send_file` returns the path. The client gives it in `files` of
    `start_worker`, `message_worker` or `build_app`. The old name of
    `files` is `images`. `renamed` in `bridge/main.ts` still takes
    `images`, puts its paths in `files`, and logs the first call of each
    tool with the old name.
  - Measured: a video of 14 MB from yonder.so came with 20 frames and
    its words in 2.3 seconds, and a 4K HEVC `.mov` of 229 MB gave 18
    frames and 147 words in 3.3 seconds.
  - The checks: `bun run check-bridge` (`send_file` with data, the ask of
    a phone, and `/file` in parts) and `bun bridge/attach-e2e.ts` (a
    phone page in headless Chrome through the real relay: the push ask
    opens the chat with the attach sheet, and a document of 2 MB goes in
    parts).
- **Tunnels for other users.** The previews work only with a tunnel.
  The connector needs none: it goes through the relay. There are two
  ways: each signed-in account gets a tunnel that the accounts server
  makes in our Cloudflare account (see "Each computer gets its tunnel
  with no setup" above), or the user connects their own Cloudflare
  account and domain (`cloudflared tunnel login`, an advanced choice,
  not built). The limits: one tunnel for each computer, 1,000 tunnels
  free, then $4.50 for each tunnel each month (Tunnels for Platforms).
  The yonder.so zone is on the Free plan, which allows 200 DNS records.
  So each plan tunnel takes one record and one route of the Worker
  `yonder-tunnels`, not one record for each preview. The Pro plan of the
  zone allows 3,500 records.
- **Why one address for each computer.** Claude cannot do the end to end
  encryption of the phone, so the relay passes the connector requests in
  clear, and the id in the path tells the relay which computer gets each
  request.
- Cloudflare and the relay end HTTPS, so the token is the only lock on the
  agents. Each answer has `Cache-Control: no-store`.
- The token does not expire (no refresh tokens). Check: `bun
  bridge/remote.ts`.

## Omarchy

Yonder on Omarchy, the Linux of DHH (Arch, Hyprland, the Quickshell bar),
so that people can control it on the go with Yonder. The research, the
plan and the tools that exist already are in `docs/omarchy.md`. Nobody
has run it on a real Omarchy computer yet.

- **What runs there:** the same bridge, compiled with
  `bun build --compile --target=bun-linux-x64` (and `arm64`). The phone
  apps and the relay need no change: a phone pairs with an Omarchy
  computer as with a Mac. The window is the page of the bridge in
  Chromium, not Tauri.
- **Install:** `curl -fsSL https://download.yonder.so/omarchy.sh | bash`
  (`omarchy/install.sh`, also for a server: see "Linux server"). It puts the bridge and `dist/` in
  `~/.local/share/yonder`, the `yonder` command in `~/.local/bin`, and
  the service in `~/.config/systemd/user`. It adds the launcher, the key
  Super + Y in `~/.config/hypr/bindings.lua`, and a command module in the
  bar (through `omarchy-shell-config`). Then it shows the QR code for the
  phone. A second run updates it, and `yonder uninstall` removes it. The
  settings and the pairings stay in `~/.config/yonder`. The bridge also
  runs it by itself for each new version ("Updates itself" in "Linux
  server").
- **Release:** `bun run release-omarchy` (`omarchy/release.ts`) builds
  `yonder-linux-x64.tar.gz` and `yonder-linux-arm64.tar.gz`, and puts them
  and `omarchy.sh` on download.yonder.so. `--no-upload` keeps them in
  `omarchy/out`.
- **The service** (`omarchy/yonder.service`) starts with the graphical
  session, so the bridge has `WAYLAND_DISPLAY` for `wl-copy` and
  `xdg-open`. `KillMode=process`: a restart of the service ends only the
  bridge, and the supervisor of Claude Code and the workers keep running.
  Under systemd (`INVOCATION_ID`), `restart_bridge` only exits, and
  `Restart=always` starts the bridge again. `OMARCHY_AGENT_CLAUDE_HOME=`
  keeps the workers on the Main Claude account, also when the user
  switches accounts in Omarchy. The log is `~/.config/yonder/bridge.log`,
  as on the Mac (`yonder logs`).
- **The bridge on Linux** (`LINUX` in `bridge/main.ts`): `xdg-open` for
  `open`, `wl-copy` for `pbcopy`, the `ShowItems` call of D-Bus for a file
  in Finder, `xdg-terminal-exec` (through `uwsm-app`) for Ghostty, the
  Claude login from `~/.claude/.credentials.json` in place of the
  Keychain, `qrcode-generator` in the bridge for the QR code (`bridge/relay.ts`), and
  `~/Work` as the folder of a new project. Dictation sends the sound to
  `voxtype transcribe` at the end (`bridge/dictate.ts`), so the words show
  only at the end. Without Voxtype, the error names Install > AI >
  Dictation. "Hey Yonder" and the front tab of the browser tool are
  Mac-only for now.
  - Voxtype needs `libasound.so.2`, which Ubuntu Server 24.04 does not
    have. The installer installs it (`libasound2t64`, `libasound2` or
    `alsa-lib`) with `sudo -n`, so it asks for no password. With no such
    sudo, it prints the command. Else the installer only says "Voxtype
    did not install", and `yonder update` does not help. A test on a
    clean Ubuntu Server VM (Lima, arm64) installs Yonder, and a fake
    phone sends a spoken sentence through the relay to `/dictate`.
    Voxtype gives the sentence back word for word.
  - The iPhone and Android do not use Voxtype for dictation. They use
    their own recognizer (see Dictation). Only Walkie-talkie with no
    `whisper-cli`, and an old phone app, send the sound to the computer.
- **The window:** `yonder open` focuses the window (a Hyprland client
  whose class has `127.0.0.1`), or starts Chromium with
  `--app=http://127.0.0.1:7787/`, its own profile in
  `~/.config/yonder/window` and `--autoplay-policy=no-user-gesture-required`.
  The own profile makes a new Chromium process, so the flags apply also
  when the browser of the user runs. Without the autoplay flag, a call
  from the key would start with no click in the page, and its sound would
  stay off. An update replaces `~/.local/share/yonder`, so the profile is
  not there. The window starts on the Omarchy style (see "Screens and
  styles"). A pick of another style in Settings stays.
- **The call key:** Super + Y runs `yonder call`, which POSTs `/call`.
  The bridge sends `toggle-call` to each window through `GET /events`
  (Server-Sent Events, with the idle timeout of Bun off). With no window,
  `yonder call` opens one, waits until it listens, and sends the key
  again. On the Mac, Rust sends the same event (the key of the call).
- **The bar:** a `command` module in `~/.config/omarchy/shell.json` runs
  `yonder status` every 3 seconds (`GET /status`): the microphone glyph
  of Omarchy (󰍬), then the running agents, `?` and the agents that wait
  on the user, and `✓` and the new results. The class `active` lights it
  during a call. A click starts or ends the call, a right click opens
  the window, and a middle click shows the QR code in a terminal.
- **The call state:** the window pings `POST /awake` each minute during
  a call, as the phone does, and `/awake?end` at the end. The bridge then
  holds `systemd-inhibit --what=sleep` (not `idle`, so the screen still
  locks), and `/status` shows the call. On the Mac, the end clears only
  the call state: the last `caffeinate` of the phone still runs out.
- **The words:** `/front` gives `platform`. On Linux, `forHost` in
  `src/front.ts` turns "Mac" into "computer" and "Finder" into "the file
  manager" in the prompt and the tool descriptions of Grok. The texts on
  the screen still say "Mac" in some places.
- **The window outside Tauri:** no "Hey Yonder" row,
  and Add folder opens the picker of the phone (`src/FolderPicker.tsx`).
  The Settings have the Pair row for the QR code.
- **Checked** in an `archlinux` container (x86_64): the install, the
  files, the binding, the launcher, the QR code through a local relay,
  `/status`, `/events` with `/call` (also after 12 seconds), `/awake`
  and its end, the error texts with no Claude login, no Voxtype, no
  `wl-copy` and no `xdg-open`, `restart_bridge` under systemd, and
  `yonder uninstall`. Not checked: systemd itself, Hyprland, the bar,
  Chromium and its sound, Voxtype, and the phone with a real pairing.
- `bun run check-bridge` checks `/status` and `/call`. `check-relay`
  checks the QR code of Linux, as a GIF and as terminal text.

### Other Linux desktops

Yonder on each Linux desktop, not only Omarchy: GNOME (Ubuntu, Fedora),
KDE Plasma, Xfce and others. Same build, same `omarchy/install.sh`, same
`yonder` command.

- **The mode** of an install is a server or a desktop. `YONDER_SERVER=1`
  or `YONDER_DESKTOP=1` picks it. Else a second run keeps the mode of the
  service: the desktop unit has `Environment=YONDER_DESKTOP=1`, and the
  server unit `Environment=YONDER_SERVER=1`. So an update from the bridge,
  which has no display, never makes a desktop a server. Else the installer
  sees a desktop by `hyprctl` or `omarchy-shell-config`, by
  `WAYLAND_DISPLAY` or `DISPLAY`, or by an active
  `graphical-session.target` of the user. Over SSH only the session
  counts: the display of `ssh -X` is not a desktop of that computer.
- **Omarchy** is a desktop with `~/.local/share/omarchy` (or
  `omarchy-shell-config`). The folder shows Omarchy also to an update from
  the bridge, whose `PATH` has no Omarchy commands. Omarchy keeps what it
  had: the unit as it is in the release, the bar, its own Claude Code.
- **Another desktop** gets the unit with the `PATH` of the install shell,
  as a server does. The unit starts with `graphical-session.target`, which
  GNOME and KDE Plasma start. Xfce, MATE, Cinnamon and others never start
  it, so `~/.config/autostart/yonder.desktop` imports the display into the
  user manager and starts the service at each login. The install also
  imports the display of its own shell, not over SSH. When Claude Code is
  missing, the installer installs it and runs its login, as on a server.
- **The call key:** Super + Y. On GNOME it is a custom shortcut of
  Settings > Keyboard, written with `gsettings` under
  `custom-keybindings/yonder/`, only when no other GNOME key is
  Super + Y. The installer writes it only once, so a key that the user
  changes stays, and an update from the bridge does not touch it. On
  Hyprland with no Omarchy, and on KDE and the other desktops, the
  installer prints how to bind `yonder call`. KDE has no simple way to add
  a global shortcut from a script.
- **The window:** `yonder open` starts the first browser of the Chromium
  family (Chrome, Chromium, Brave, Edge, Vivaldi) with `--app`, its own
  profile in `~/.config/yonder/window` and the autoplay flag. A browser
  from a snap reads no hidden folder of the home folder, so its profile is
  in `~/snap/<name>/common/yonder-window`. With no such browser, the page
  opens in the default browser. There is one window at most: when a
  window listens on `/events`, `yonder open` brings it to the front on
  Hyprland or with `wmctrl` on X11. GNOME and KDE on Wayland let no app
  raise the window of another app, so there a notice says that Yonder is
  open. The bridge also sends the call key to the newest window only, so
  two windows never start two calls.
- **The bridge on another desktop:** `wl-copy` on Wayland, else `xclip`
  or `xsel` for the clipboard. With no `xdg-terminal-exec`, a terminal
  opens in the first of `gnome-terminal`, `ptyxis`, `kgx`, `konsole`,
  `xfce4-terminal`, `kitty`, `alacritty`, `ghostty` and
  `x-terminal-emulator`, in the folder of the agent.
- **Hints:** the installer names a missing `lsof`, `wl-clipboard` or
  `xclip` with the install command of `apt-get`, `dnf`, `zypper` or
  `pacman`. `yonder uninstall` also removes the autostart entry and the
  GNOME shortcut.
- **Not done:** no bar or tray icon outside Omarchy, and no key on KDE.
- **Released** with `bun run release-omarchy`, before a test on a real
  Linux desktop. Each Linux bridge installs it by itself within an hour.
  The landing site names a Linux desktop: the download page has a Linux
  block for a desktop or a server, and the invite email has one Linux
  line.
- **Checked** on the Mac, with stand-in Linux commands, 47 checks: the
  mode on GNOME, KDE, Xfce, Omarchy, Hyprland, a server, SSH and
  `ssh -X`, each update and second run, the units, the autostart entry,
  the GNOME shortcut, the key that GNOME uses already, the key that the
  user took away, `yonder uninstall`, and the browser of `yonder open`.
  `bun run check-bridge` checks that the call key reaches only the
  newest window. Not checked: a real Linux desktop, the real
  `gsettings`, the browsers, the terminals and `wmctrl`.

### Linux server

Yonder on a Linux server with no screen, for example a cloud computer
that the user reaches over SSH. The install shows a QR code in the SSH
view, so that a phone can link a remote computer with Claude Code, not
only a Mac with a window.

- **Same build as Omarchy:** the tarball of `bun run release-omarchy` and
  the same `omarchy/install.sh`. The release puts the installer on
  download.yonder.so as `install.sh` and as `omarchy.sh`, and
  `yonder update` uses `install.sh`. The command is
  `curl -fsSL https://download.yonder.so/install.sh | bash`. The bridge,
  the phone apps and the relay need no change: the phone pairs with a
  server as with another Mac (Pair a computer in Environment).
- **Server mode:** the installer picks it when it sees no desktop: no
  `hyprctl` or `omarchy-shell-config`, no display (over SSH a display
  does not count), and no active `graphical-session.target` of the user.
  `YONDER_SERVER=1` forces it, and a second run keeps it ("Other Linux
  desktops"). In server mode the installer adds no launcher, no key and
  no module of the bar.
- **The service on a server:** the installer writes `yonder.service`
  with `WantedBy=default.target` and without `graphical-session.target`,
  which never starts on a server. It puts the `PATH` of the install
  shell in the service, because a service does not read `.bashrc`, and
  on a server `claude` is often in an npm folder, in nvm or in
  `~/.local/bin`. It runs `loginctl enable-linger`, so the bridge starts
  at boot and keeps running after the SSH session ends. When polkit
  refuses linger, the installer prints the `sudo` command. `yonder
  uninstall` leaves linger on and prints the command that turns it off.
- **Checks of the installer:** it names each missing tool with the
  install command of `apt-get`, `dnf` or `pacman`. Ubuntu and Debian
  servers have no `jq`. Yonder needs no `qrencode`. With no systemd, or when
  `systemctl --user` does not answer (a login with `su` or `sudo`), it
  stops with an error. It also tells to add `~/.local/bin` to the `PATH`.
- **No agent in the installer:** the first setup only shows the QR code
  to link the phone, also for a user who wants another agent, such as
  Hermes, first. A Ctrl+C in a login of Claude Code would also end the
  installer before the QR code. So the installer installs no agent and
  shows the QR code. The bridge does not install Claude Code by itself
  when the Agents tab opens (GET `/logins` and `/setup`). It starts only
  the sign-in of a Claude Code that is installed. The page of Claude
  Code in the Agents tab has an Install button when it is missing, and
  an agent on a missing Claude Code does not start: Grok asks the user
  first and installs it only on a yes (`ready`). The error of `ready`
  speaks to the user, because the screen shows it when the user starts
  an agent there, and the description of the `cli` tool tells Grok to
  ask. Else the phone shows "call cli with install only on a yes". The
  installer writes each folder of the `PATH` once, so the unit does not
  grow, and `~/.local/bin`, where the installer of Claude Code puts it,
  is in it.
- **The first agent:** the first agent on a server fails when nobody
  accepted the disclaimer of bypass permissions there. So the bridge
  accepts it, trusts the folder, and checks the login of Claude Code
  before each start (the bullets on `claude --bg` in Workers). A missing
  login starts the sign-in of Claude Code, and the app shows the link to
  sign in (the bullets on the setup in Workers). A missing install does
  not start by itself.
  - GET `/logins` starts the sign-in of Claude Code only when the default
    profile runs Claude Code in `~/.claude` (`plainNeeded`). Else a user
    with Hermes as the default, signed in, sees "Sign in to Claude Code"
    on the list.
  - The read of the Claude Code sessions (`claude agents`, each 2
    seconds) stops after 5 seconds, because the list of the phone waits
    for it, and a phone with no answer in 10 seconds shows Disconnected.
  - A screen from before 2.B.902 reads `list_workers` with no
    arguments as the full array, but the bridge gives `counts` and `list`
    there, so each poll of such a phone fails. A phone with such a
    screen, such as an App Store app of 2.107.750, can take no newer
    screen until it gets an app of iOS build 922 or later. So the relay
    gives the bridge the screen version of the phone (`x-yonder-app`),
    and the bridge adds `full: true` to `list_workers` for a screen below
    N 902 (`oldScreen` in `bridge/main.ts`). The relay statistics
    (`RelaySession`) show the versions.
- **Updates itself:** each Linux bridge (servers and Omarchy,
  `LINUX && !SOURCE` on port 7787) reads
  `https://download.yonder.so/latest-linux.txt` one minute after its
  start and then each hour, as the Mac app reads `latest.json`. So a fix
  gets to a server with no `yonder update` over SSH. When that version
  is newer than the one in `~/.local/share/yonder/version`, and no call
  is live (`callUntil`, which the pings of a call on `/awake` set), the
  bridge runs the installer with `YONDER_VERSION`. The installer then
  gets `yonder-linux-<arch>-<version>.tar.gz`, a name that the cache of
  Cloudflare cannot have old, and it shows no QR code. Its output goes to
  `bridge.log`. The installer restarts the service, and
  `KillMode=process` keeps the installer running to its end. A failed
  install tries again an hour later. An older version in the file does
  not replace a newer one, so a test install of a new build stays. Else
  a test build goes back to the release one minute after its start. So
  a bad release needs a newer release, not an older version in the
  file. The release writes the `version` file into the tarball, uploads
  `latest-linux.txt` after the tarballs, and purges it, `install.sh` and
  `omarchy.sh` from the cache. An update from the bridge has the `PATH`
  of the service, so the installer writes each folder of the `PATH`
  once, and the unit does not grow. An install with no updater needs
  one `yonder update`. Checked: the `PATH` of the unit stays the same
  after an update (Ubuntu 24.04, GNU tools), and shellcheck. Not
  checked: a real update under systemd.
- **The QR code** shows at the end of the install, from `yonder pair`,
  and works in the SSH terminal. The bridge draws it as text in half
  blocks (`qrText` in `bridge/relay.ts`, the `text` of POST `/relay`), so
  Yonder needs no `qrencode`. When a phone pairs, `yonder pair` clears the
  code from the screen. A second scan of a used code gets "This code
  paired <phone> already", not "No pairing code is open", while the code
  has not run out. Else a pairing that worked shows an error.
- **npm:** the name `yonder` on npm belongs to another package (2022).
  The installer does the job of an npm package with no Node, so there is
  no npm package.
- **Checked** in an `ubuntu:24.04` container (arm64) with systemd,
  polkit and SSH: the error with no `jq`, the install over SSH, the unit
  (`default.target`, the `PATH`), linger, the QR code with the live
  relay, the bridge that ran a `claude` in `~/.npm-global/bin`, the
  bridge after a restart of the container with no login, a second
  install, `yonder status` and `yonder uninstall`. After the upload,
  `curl -fsSL https://download.yonder.so/install.sh |
  bash` gave the same result in a new container. Not checked: a real
  phone that pairs, real workers, a server with no polkit, and the x64
  build, because Docker on the test Mac does not run x86_64
  images.
- **The x64 build** is `bun-linux-x64-baseline`, which needs no AVX2.
  The default build of Bun needs AVX2, and some virtual servers (the
  `kvm64` CPU of Proxmox, cheap VPS) do not have it. There the default
  build stops with "Illegal instruction".
- **On the screen** the Environment section and the pairing screen say
  "computer" and tell the `yonder pair` way. Other texts of the phone
  app still say "Mac" for a server, as for Omarchy.

## Windows

Yonder on Windows 10 and 11. The build follows Omarchy: the same bridge,
compiled for Windows, and the page of the bridge as the window. It runs
on a real Windows PC (see the test below).

- **Why not Tauri:** the Mac app (`src-tauri/src/main.rs`) uses the CGEvent
  tap, `caffeinate`, `osascript` and the Swift helpers, which do not build
  on Windows. A Tauri build for Windows needs `cargo-xwin`, LLVM and NSIS
  on a Mac, and a Windows computer for each test. The bridge compiles
  for Windows with Bun alone (`--target=bun-windows-x64-baseline`), and
  the page has a full path outside Tauri (`/events`, the Pair row).
- **Install:** `irm https://download.yonder.so/install.ps1 | iex`
  (`windows/install.ps1`) in PowerShell. It puts the bridge, `dist\`,
  `yonder.ps1` and the icon in `%LOCALAPPDATA%\Yonder`, and
  `bin\yonder.cmd` on the PATH of the user. It adds Yonder and Yonder Call
  to the Start menu, and Yonder to the Startup folder. Then it shows the
  QR code for the phone. A second run updates it, and `yonder uninstall`
  removes it. The settings and the pairings stay in `~\.config\yonder`.
  `irm | iex` runs in the PowerShell of the user, so the installer stops
  with `throw`, never with `exit`, and keeps its variables in a block.
- **Release:** `bun run release-windows` (`windows/release.ts`) builds
  `yonder-windows-x64.zip`, and puts it, `install.ps1` and
  `latest-windows.txt` on download.yonder.so. `--no-upload` keeps them in
  `windows/out`. No page links to the zip, as for the Mac and Linux: the
  landing page sends each download to the waitlist. The x64 build also
  runs on Windows on Arm, through its emulation.
- **The service:** the Startup folder runs `yonder serve` in a hidden
  PowerShell. Its loop runs the bridge, appends its output to
  `bridge.log` through `cmd`, and starts it again 2 seconds after it
  stops, as `Restart=always` on Linux. So `restart_bridge` on Windows only
  exits. `yonder stop` stops the loop first, then the bridge, because
  Windows cannot replace a program that runs. The workers keep running.
- **The window:** `yonder open` brings the window to the front
  (`AppActivate` on the title "Yonder"), or starts Edge with
  `--app=http://127.0.0.1:7787/`, its own profile in
  `~\.config\yonder\window` and `--autoplay-policy=no-user-gesture-required`,
  as Chromium on Omarchy.
- **The call key:** Ctrl + Alt + Y, the key of the Yonder Call shortcut in
  the Start menu. Windows gives a shortcut there a key with no code. It
  runs `yonder call`, which POSTs `/call` as on Omarchy. Windows keeps
  the Windows key combinations for itself, so the key is not Win + Y.
  When the bridge does not run, a note shows for 5 seconds.
- **Pairing:** `yonder pair` prints the QR code in the console, with
  half blocks in white on black, from the GIF of the bridge. The bridge
  makes the QR code with `qrcode-generator`, because Windows has no
  CoreImage and no `qrencode` (`qrCode` in `bridge/relay.ts`). When a
  phone pairs, `yonder pair` writes spaces over the QR code and its
  line of text, and then shows "Paired with" and the name of the phone.
  The code has the error correction L, as `qrencode` in a terminal, and
  a margin of 2: 61 columns and 31 lines. With the error correction M
  and a margin of 4, a link with a name such as `DESKTOP-XXXXXXX` gives
  69 columns and 35 lines, more than a new PowerShell window of 30
  lines. OpenCV and ZXing read it with the black of the console around
  it. A code that fits 30 lines needs a shorter link, so a change in the
  phone apps.
- **Updates itself:** as on Linux. The bridge reads
  `latest-windows.txt` each hour, and with no live call it runs the
  installer with `YONDER_VERSION`. The installer gets
  `yonder-windows-x64-<version>.zip` and shows no QR code. A short
  PowerShell starts the installer with `Start-Process`, in a hidden
  console of its own, and the output goes to
  `~\.config\yonder\update.log`. A child of the bridge that is not
  detached ends with the bridge (the job object of Bun), but the child
  of that child does not. Else an installer that the bridge starts as a
  detached PowerShell, with no console, logs "Updating Yonder" and then
  nothing, and the old version stays. A bridge with that old way needs
  one update by hand.
- **The bridge on Windows** (`WINDOWS` in `bridge/main.ts`): `explorer`
  for `open`, and `explorer /select,` for a file. `Set-Clipboard` takes
  the text from a variable of the environment, because `clip.exe` reads
  its input in the code page of the console. Windows Terminal (`wt`)
  opens a worker, else `cmd /c start`. The login of Claude Code is
  `~\.claude\.credentials.json`, as on Linux. The installer of Claude
  Code can put `claude.exe` in `~\.local\bin` and fail to add it to the
  PATH. The bridge finds it there. With no Claude Code or no login,
  Yonder installs it and signs in with no terminal (the bullets on the
  setup in Workers).
  `SetThreadExecutionState` in PowerShell keeps the computer awake during
  a call. A new project goes to `~\Work`. The words for Grok say
  "computer", as on Linux (`forHost` in `src/front.ts`).
- **Bugs that the port prevents:**
  - `normalize("/")` gives `\` on Windows, so the page route served no
    window. The route now strips both separators.
  - Windows names the PATH `Path`. The bridge sets `PATH` for its
    children, so it renames the variable at the start.
  - Claude Code on Windows reads the trust of a folder in
    `~/.claude.json` with `\` in some places and with `/` in others.
    `trust` writes both keys.
  - The path checks such as ``startsWith(`${dir}/`)`` use `sep`, and the
    checks for an absolute path use `isAbsolute`.
  - `findMedia` (`bridge/media.ts`) also finds a path that starts with a
    drive, such as `C:\`, so a picture that a worker names shows.
  - `explorer /select,"<path>"` gets its quotes by hand, because Bun
    quotes the whole word when the path has a space.
- **Not on Windows yet:** "Hey Yonder", the front tab
  of the browser tool, and the scan of Yonder Preview (no `lsof`: only
  an address that the user adds shows). Dictation in the window says to
  press Windows + H, the voice typing of Windows. Agents in other CLIs
  stop with a signal to the process, because Windows has no process
  groups. No tray icon: the window and the key do its work.
- **Checked on a Mac:** `bun run check`, `bun run check-bridge`, the
  compile and the zip of `release-windows --no-upload`, and the QR code
  of `qrcode-generator`, which OpenCV reads.
- **Release:** `claude --bg` works on Windows: the agent view docs of
  Claude Code tell how background sessions and their supervisor act on
  Windows, and a report from Windows 11 (2.1.157) has `--bg` sessions
  that run. A full test has two parts:
  - A job on a Windows runner of GitHub, with no Claude credits: build
    the zip on Ubuntu (`release-windows --no-upload` needs `zip`), then
    on Windows run `install.ps1` with `YONDER_ZIP`, read `/status`,
    `/call` and `/relay`, and run `yonder stop` and `yonder uninstall`.
  - One real call on a Windows PC, or on a Windows computer in the cloud
    over Remote Desktop: the window, the microphone, the key and a
    worker. A VM on a Mac needs Windows 11 on Arm in Parallels,
    VMware Fusion or UTM, and about 50 GB of free disk.
  The landing page has a Windows card on the download page and a
  Windows button on the home page (both open the waitlist, as for the
  Mac). Yonder ships with no signature on `yonder-bridge.exe`: the
  install through `irm | iex` gets no mark of the web, so SmartScreen
  shows no warning, and only a PC with Smart App Control on blocks it.
  Smart App Control blocks a program with no signature and no
  reputation, and Defender can flag a new program. Azure Artifact
  Signing costs about US$10 a month, and only some countries can use it.
- **Tested** on a Windows PC (Smart App Control off) with no SSH and no
  Remote Desktop, so a worker there did the test, through
  `other_computer`. It installed a zip from the Mac (`YONDER_ZIP`). Each
  of the 14 steps passed:
  - The install takes 5 seconds, and `/status` answers 1.8 seconds
    later. The phone link comes back, and the phone stays paired.
  - The three shortcuts, the key Ctrl + Alt + Y, the `Path` entry and
    `where yonder` are correct.
  - The loop of `yonder serve` starts a killed bridge again in less than
    6 seconds.
  - `yonder open` opens the window in Edge in 1.2 seconds. It shows the
    agents, and a second `yonder open` opens no second window.
  - `yonder call` with no sign-in in the window shows the sign-up page,
    because a call needs an account. So the window of Windows needs a
    sign-in of its own (its Edge profile).
  - The QR code of `POST /relay` is a GIF. Defender flags nothing.
    `yonder-bridge.exe` has no signature.
  - `yonder uninstall` removes the shortcuts, the `Path` entry and the
    folder, and keeps `~\.config\yonder`. An install after it pairs
    with no new scan.
  - A worker that the new bridge starts runs and reports.
  Bugs that the test found, and their fixes:
  - A test build went back to the release one minute after its start,
    because the bridge installed each version that was not its own. Now
    it installs only a newer version (Linux, "Updates itself").
  - `yonder uninstall` printed "The system cannot find the path
    specified." two times, with the exit code 1, and the exit code of
    each `yonder` command was lost: `& exit /b` gave 0. The fix in
    `yonder.cmd`: `(goto) 2>nul` first ends the batch file, and then
    PowerShell runs with its exit code.
  - A worker can stop at once with "Could not refresh your login because
    another Claude Code process is refreshing it (or exited
    mid-refresh)" when the login of Claude Code expired. The bridge only
    reads the login file, but its `ask` (haiku) runs a second `claude`
    while the turn starts, so two processes refresh the login at the
    same moment. A "Continue." one minute later works. So `settle` puts
    one "Continue." in the queue of such a turn, and the queue sends it
    30 seconds later, with no push to the phones. A second failure shows
    as usual.
  - `/version` gives 0, and `/version?full` gives "", on a compiled
    bridge. That is correct: it has no source, and it gets updates from
    `latest.json`.
  - Each error in `bridge.log` printed a long line of the bridge, some
    KB, because `--minify-whitespace` put the code on few lines and Bun
    prints the line of an error. The releases for Windows and Linux now
    compile with no minify, so the line is one line of the source. A
    computer with no Workers AI key logged a stack for each use of
    Clef. The three Clef fallbacks now log one line.
  With the fix of "Updates itself", `rebuild_app` through
  `other_computer` updates the PC with no console window, and the log
  lines stay short.
- **A test with no person at the PC.** The account of the window is
  `yonderAccount` in its `localStorage` (`src/account.ts`), and a token
  of yonder.so lasts a year. So a worker can copy the token of the Mac
  app (the WebKit `localstorage.sqlite3` of `so.yonder.mac`):
  - The Mac serves it once on the local network under a random name,
    and stops the server after the one download. The token never goes
    into a task text or a log.
  - The worker closes the Yonder Edge window, writes `dist\signin.html`
    with `localStorage.setItem("yonderAccount", ...)` and
    `location.replace("/")`, opens the window on that page, and
    deletes the file.
  A call with no person: Edge with `--use-fake-ui-for-media-stream`,
  `--use-fake-device-for-media-stream` and
  `--use-file-for-fake-audio-capture=<wav>` takes a WAV as the
  microphone and loops it. The WAV of `say` is the question "What
  agents are running on this computer?" and 25 seconds of silence
  (`[[slnc 25000]]`, then `afconvert -f WAVE -d LEI16@48000`). After
  the test, the worker opens the window again with `yonder open`, so
  the flags are gone. This passed: the window says "Start call",
  `yonder call` started the call, Grok called `list_workers` and
  answered aloud, and the second `yonder call` ended it. A simulated
  Ctrl + Alt + Y (`SendKeys` "^%y") starts no call.
  The call key, checked with `RegisterHotKey` through `bun:ffi`
  (`BUN_BE_BUN=1` makes `yonder-bridge.exe` act as Bun):
  - Explorer owns Ctrl + Alt + Y through `Yonder Call.lnk`. With the
    hotkey off the shortcut the key was free, and with it back it was
    taken again, so the shortcut works as planned.
  - A press made by a worker (`keybd_event`, `SendKeys`) reaches no
    hotkey at all, not even one that the same test registered. So a
    worker cannot test the key, but a real press can work.
  - `Start-Process` on `Yonder Call.lnk`, the step that Explorer takes
    after the key, starts a call with no console window.
  - The first call stops at the prompt of Edge "127.0.0.1:7787 wants
    to use your microphones", and `yonder call` cannot end a call that
    connects (`toggleCall` does nothing in the phase "connecting"). A
    worker can click Allow with UI Automation (`InvokePattern`). The
    window keeps the permission, so a real call shows no prompt.

## Related tasks outside this repository

The site yonder.so and its accounts server live in a separate, private
repository (the landing page repository). This part tells what they do,
and how the app talks to them.

- A workspace folder can hold the app in `app/` and the landing page in
  `landing/`, with no repository of its own. The bridge pins the project
  that holds `ROOT`, so the agents of `app/` and `landing/` show under
  one project, the workspace folder.
- The relay runs at `relay.yonder.so` (see the relay repository,
  yonder-relay).
- Accounts (the yonder.so backend): sign-up with an email. Yonder is
  free. A signed-in account gets the settings backup and the preview
  tunnels. The account page (`/account/`, linked from the footer) shows
  the account. The staff user opens `/backstage/` and `/admin/`.
- Email: Cloudflare Email Sending sends the mail of yonder.so from
  `hello@yonder.so`, and Email Routing forwards
  the replies to the inbox of the team. The sign-in of the site and the
  apps sends a 6-digit code, which works for 10 minutes, in place of a
  password. Backstage has an "Emails" link to `/admin/accounts/email/`.
  Each email there has an event, a delay in minutes, a subject and a
  plain text body. The only event is sign-up, on the site or in the
  apps. "Welcome" goes 15 minutes after a sign-up. A sign-up puts the
  emails in a queue, and a job sends them each minute.
- Account deletion, because the App Store (rule 5.1.1(v)) and Google
  Play require it. The fixed address is
  https://yonder.so/account/delete/, for the apps and the store
  listings. The account page of yonder.so links to it, and Settings of
  the apps has a small grey "Delete account" link at the bottom of
  Account. It asks to confirm, then opens the page. The page sends a
  code to the email, and asks for it. Then it deletes the user, the call
  time, the feedback posts and votes (the vote counts of other ideas go
  down), the queued emails and each sign-in on the site. The app tokens
  sign the user id, so the apps get 401 and sign out on the next
  request. A deleted user can sign up again with the same email.
- The app has no plan and no call time (see "Voice agent (Grok)" under
  Architecture).
- The feedback board (`/feedback/`):
  users post feature requests and vote for them. Everyone can read the
  board. Only a signed-in user can post or vote. The rate limit is 5
  ideas for each user in 24 hours, and one vote for each user on each
  idea. Each idea has a status badge: New, Backlog, Next, In progress or
  Done. Staff change it in `/admin/`. The footer of the landing page
  links to the board.
- The landing page puts the app first: the chat with the Claude Code on
  your own Mac from the phone, end-to-end encrypted, and voice calls with
  your own voice key. The page uses "chat" for text and "talk" for a
  voice call.
- The download page, https://yonder.so/download/, has a card for each
  platform: Mac ("Requires a Mac with Apple silicon"), iPhone
  ("Requires iOS 17 or later") and Android ("Coming soon"). A line under
  the cards links the terms. The footer links to it.
- The Accounts section of `/backstage/` on yonder.so shows the users
  and the sign-ups.
- The privacy policy and the terms of service of Yonder:
  https://yonder.so/privacy/ and https://yonder.so/terms/.
  They cover the accounts, the Grok voice of xAI, the relay, Preview,
  the feedback board, DataFast and the email. The terms cover account
  deletion. The footer, the sign-up page and the sign-up of the app
  (`src/SignIn.tsx`) link to them. `relay/privacy.html` links to the
  policy. A lawyer must read both pages before the store submissions.
- The landing site has no how-to page.

## Open questions

- Nobody has tested "Hey Yonder" in the app with a real voice yet. If
  the speech recognition of Apple misses the name or hears it by
  mistake, a wake word engine such as Porcupine can replace the helper.
- A Grok session was said to last 30 minutes at most. The calls do not
  show it: calls of 36 and 46 minutes ran with no break at 30 minutes.
  A call that loses the network (code 1006) after 20 seconds starts
  again by itself, once a minute at most (`redialed` in `src/App.tsx`),
  because 7 of 252 calls ended that way. A second drop within the
  minute shows the error.
- The bridge once stopped in a busy loop at 100% CPU, soon after a new
  agent started in `yonder`. The last log line was the "The task names
  no project" line of `projectOf`. A `sample` of the process showed JIT
  code that read the clock again and again, so the loop can call
  `Date.now()` or `setTimeout`. The loop is not found. The watchdog
  kills such a bridge with SIGKILL.
- Live View, a WebRTC video of the browser of the agent, is still only a
  design in `docs/tunnel.md`.
- CarPlay is built (see "CarPlay" under Phone), but not tested on a car
  screen. It waits for the CarPlay entitlement of Apple, which the
  developer of the app must request, and for a test in the CarPlay of
  the simulator or in a car.
- Agents in other CLIs are built (see "Agents in other CLIs" under
  Workers). A real OpenCode agent on a free model started, answered,
  and answered a second message in the same session, through a test
  bridge. No real turn has run yet in Antigravity, Cursor, Grok Build or
  Copilot. A real Codex turn (0.161.0) started, but failed with a 401,
  because the ChatGPT sign-in of Codex did not refresh. Codex needs a
  new `codex login`. Codex runs on the ACP host, and a real Codex turn
  through `codex-acp` waits for that sign-in too. Phase 3 of
  `docs/clis.md` (ACP, and approvals on the phone) is still a plan.
- Open source: Yonder goes public under the MIT license, for
  transparency. The plan keeps one repository, moves the private
  documents and the video out, removes the personal details, and starts
  a public repository with a clean history. The backend of yonder.so
  stays private.
- Tesla is still only research. Tesla has no app store for other
  companies. Since update 2026.26, a web page in the car browser can use
  the microphone, so a web build of the phone app can work there.
- The Apple Watch app is built (see "Apple Watch" under Phone), but
  nobody has run it on a watch yet. The plan is in `docs/watch.md`.
- Yonder for Omarchy is built (see "Omarchy"), but nobody has run it on
  a real Omarchy computer, and the release is not on download.yonder.so
  yet (`bun run release-omarchy`). No plugin of the Omarchy store gives
  a voice call from the phone, away from home, for many Claude Code
  agents. Omarchy-AI and Omodachi are the nearest (see "What exists
  already" in `docs/omarchy.md`).
