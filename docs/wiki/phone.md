# Phone

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
- Subscriptions: Yonder is free (see
  `voice-agent.md`), so the phone apps sell no plan and have no subscribe
  sheet. No code in `src/` uses `tauri-plugin-iap`, but it is still a
  dependency in `ios/Cargo.toml`, `android/Cargo.toml` and
  `package.json`.
- The relay forwards encrypted frames between the bridge and the phones. It
  cannot read them. The live relay is `wss://relay.yonder.so`: the code of
  `relay/`. `ROOMS` in the `.env` of the relay can limit the Macs that connect.
  "The live relay" in `docs/mobile.md` gives the details.
- The bridge sends its secret token to the relay in the header
  `x-yonder-token`, not in the URL, so that no log of a proxy keeps it.
  The relay still reads `?token=` from an older bridge. For another relay,
  the bridge also puts the token in the URL, because an older relay reads
  only the URL.
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
  through our server. The relay code is in `relay/` of the public
  repository, with the MIT license. Its README
  tells how to start it with Docker and Caddy, and what the relay sees
  and why. Then the user puts the `wss://` address in the Relay tab. The
  live relay runs the code of `main` (`deploy-relay.yml`), so the code that
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

## The phone cleanup

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

## The SwiftUI phone app

The phone app in the stores is the Tauri app in `ios/` and `android/`.
There is no separate phone app in pure SwiftUI, so the bridge has no
"phone" screen of `/car` and no PNG icon of `/favicon?png`.
