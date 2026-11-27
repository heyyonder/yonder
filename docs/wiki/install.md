# Install the app

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
  signs, notarizes and staples the DMG, and puts it on the GitHub release
  `v<version>` of `heyyonder/yonder` as `Yonder-<version>.dmg`
  (`github-release.ts`). `https://download.yonder.so/Yonder.dmg` sends
  there (see "Update server"). It does not change
  `/Applications/Yonder.app` or `install-app`, because a new signature
  makes macOS ask for each permission again. The values for the signature
  and the notary are in `~/.config/yonder/release.env`. `GH_TOKEN` must
  allow a write to the contents of `heyyonder/yonder`. The S3 keys of the
  R2 bucket `yonder-downloads`, which keeps the state of the update
  server, are in `~/.config/yonder/r2.env`.
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
- The redirects of download.yonder.so and `latest.json` carry
  `Cache-Control: no-store`, so a browser never gives the user an old DMG
  after a release, and a release needs no purge of the cache.
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

## Versions

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

## Checks on GitHub

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

## Release gates

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

## Update server

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
- The same worker answers `download.yonder.so` (a route in front of the
  custom domain of the bucket). The files of each version are in the
  release `v<version>` of `heyyonder/yonder` on GitHub
  (`github-release.ts`), a pre-release for staging. The worker sends each
  old name there with a 302: `Yonder.dmg`, `Yonder.apk`,
  `yonder-linux-<arch>.tar.gz`, `yonder-windows-x64.zip`, `install.sh`,
  `omarchy.sh` and `install.ps1` go to the newest staging version of
  their platform, and a name with a version goes to that version. It
  makes `latest.json` and `latest-<platform>.txt` from the state. A
  version before `FIRST` in `worker.ts` has no GitHub release, so its
  files come from the bucket. The Mac JSON of the update server also
  links to GitHub. `promote.ts` makes the release a full release, so
  `releases/latest` on GitHub is the newest production version.
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

## Production

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

## Crash reports

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
