# The data that Yonder collects

This document lists each piece of user data that leaves the computer or the
phone of a user, where it goes, and why. It is the source for the privacy
page of yonder.so. The facts come from the code of the apps, the relay, the
update server and the yonder.so backend.

When a change to the code adds, removes or changes a flow of data, update
this document in the same commit.

## In short

- Yonder has no analytics or tracking in the apps.
- The phone and the computer talk end to end encrypted. The relay sees only
  the metadata.
- The voice of a call goes straight from the phone to the voice provider
  that the user picks, with the user's own key. yonder.so never gets the
  audio or the words.
- yonder.so keeps the account, an encrypted backup of the settings, and the
  feedback that a user sends. A call needs no account.
- Sentry gets the error reports of the apps.
- The web site uses two analytics services: DataFast and OpenAnalytics.

## The flows of data

| Data | Goes to | When | Default |
|---|---|---|---|
| Errors of the apps | Sentry | on an error or a crash | on in the official builds, no switch |
| Connection metadata | relay.yonder.so, then yonder.so | each connection | on |
| Messages between phone and computer | relay.yonder.so, encrypted | always | on |
| Claude connector calls, webhooks | relay.yonder.so, not encrypted | after the user connects them | off |
| Push texts | Apple (APNs) | when an agent finishes | only with an APNs key |
| Install ID and version | updates.yonder.so | every minute to every hour | on |
| Account: email, name, photo | yonder.so | sign-in, account page | needs an account |
| Settings backup | yonder.so, readable by the server | after sign-in | on after sign-in |
| Computer name, relay key | yonder.so, public DNS | after sign-in | on after sign-in |
| Feedback, screenshot, call transcript | yonder.so | when the user sends feedback | user choice |
| Call audio, prompts, tool results | xAI | each voice call | on |
| Agent summaries for "Listen" | xAI, or yonder.so | when the user listens | user choice |
| Location | OpenStreetMap, xAI | when the user asks | user choice |
| Previewed dev sites | Cloudflare | when the user opens a preview | user choice |
| Page visits, signed-in user | DataFast, OpenAnalytics | each page of yonder.so | on |

## Errors (Sentry)

- Only the official builds send errors: the apps of the App Store,
  TestFlight, Google Play and `download.yonder.so`. Each app reads the
  DSN of Sentry from `SENTRY_DSN` at build time. A build with no DSN,
  such as a build from source, starts no Sentry client and sends
  nothing.
- **The screen** (Mac, iPhone, Android) sends errors only in release
  builds. It sends the error text, the build, the page address, the user
  agent, the locale and the time zone. It also sends breadcrumbs: clicks,
  console lines and the addresses of requests. It sends no IP address and
  no user ID (`src/main.tsx`).
- **The Mac and iPhone apps** send Rust panics with the version, the OS
  and the device, only from release builds. They remove the host name of
  the computer (`server_name`) from each event (`start_sentry` in
  `src-tauri/src/main.rs` and `ios/src/lib.rs`).
- **The Android app** sends crashes with the defaults of `sentry-android`,
  only from release builds.
- **The bridge** sends nothing to Sentry.
- An error text can hold a file path, a project name or an agent name.

## The relay (relay.yonder.so)

- The phone and the computer encrypt each message end to end: P-256 ECDH
  and AES-GCM (`src/link.ts`, `bridge/relay.ts`). The relay cannot read
  them.
- On the same local network, the phone talks to the computer directly, and
  no message goes to the relay.
- The relay sees the IP addresses, the room, the public keys, the size and
  the time of each message, the app version and the device model. It keeps
  them in memory only, and writes no log (`relay/main.ts`).
- For each connection, the relay sends a record to yonder.so: the room, the
  role, the device, the app version, the model, the times, the close
  reason, and the country, city, latitude and longitude from Cloudflare. It
  does not send the IP address. yonder.so keeps these records with no end
  date. They have no link to an account.
- The Claude connector (`mcp.yonder.so`) and the webhooks are not end to
  end encrypted. The relay and Cloudflare can read the tool calls, the
  results and the webhook bodies. The relay keeps nothing. Both are off
  until the user turns them on.
- Uploads are encrypted to the computer. The relay sees only the file name.

## Push notifications (Apple)

- The computer sends the title and the text to Apple: the last paragraph of
  an agent result, reminders, questions for permission, the one-time code
  of the Claude connector, and the titles of 1Password items.
- Apple can read these texts. The computer sends a push only when an
  APNs key file is in `~/.config/yonder`, so most installs send none.
- Android has no push.

## Updates (updates.yonder.so)

- The apps ask for the newest version with a random install ID and the
  version. The Mac asks every minute while its window is open. Linux and
  Windows ask every hour.
- The update server stores nothing. It uses the ID only to pick a group for
  a staged release (`updates/worker.ts`).
- The iPhone app asks Apple for the newest App Store version, with no ID.

## The yonder.so account

The backend keeps:

- The email, the first and last name, the date of sign-up, and a profile
  photo of 160 px.
- The old emails of an account, so that Apple and Google sign-in still find
  it.
- The sign-in codes. A code stays in the database until it is used, also
  for an email that has no account.
- The plan and its Stripe, App Store or Google Play IDs. No card data
  reaches yonder.so.
- The referral code and the bonus time.
- The **total** seconds of calls: all time and this month. There is no
  record for each call, no audio and no words.
- A backup of the settings and the custom screens, after sign-in. The
  backup has no keys, folders or programs of the profiles. The server
  encrypts it with its own key, so the operator can read it. It is not end
  to end encrypted.
- The computer name and the relay key of each computer, for the preview
  tunnel. The name is in a public DNS record, `tunnel-<name>.yonder.so`.
- The feedback that a user sends from the app: the message, a screenshot
  and one call transcript, each when the user adds it.
- The ideas and votes of the feedback board, and the questions of the FAQ
  box. The FAQ questions go to OpenRouter for the answer.
- The emails of the old waitlist.

The backend keeps no IP addresses. Rate limits use the IP for some seconds,
in memory only.

When a user deletes the account, the backend deletes the account, the plan,
the backup, the photo, the tunnels in the database, the old emails, the
votes and the ideas, and cancels the subscription. It keeps:

- the feedback reports, with no link to the account;
- the tunnel and its DNS record at Cloudflare;
- the Stripe customer and the invoices;
- the waitlist emails, the FAQ questions and the connection records;
- the data that the analytics services already have.

## Voice calls (xAI)

- A call uses the voice provider that the user picks in Settings › Voice,
  such as Grok. The phone connects straight to xAI with a token of 5
  minutes.
- xAI gets the audio of the microphone, the instructions with the lists of
  projects and agents, and the results of each tool, such as agent results
  and the location. The web and X search of xAI are on.
- The bridge makes the token with your own key in
  `~/.config/yonder/.env`. yonder.so is not part of a call: it makes no
  token and counts no call time.

## Speech and location

- **Listen** sends the text of an agent summary to xAI text to speech. With
  no key of your own, the app sends the text to yonder.so, which accepts it
  only for staff.
- **Dictation** stays on the device on the Mac. On the iPhone it stays on
  the device when the phone supports it, else it goes to Apple. On Android
  it can go to Google. Linux and the walkie-talkie use local models.
- **Location** goes from the phone to the computer encrypted, only when the
  user asks. The computer sends the latitude and longitude to OpenStreetMap
  for the address. The map cards load map tiles from OpenStreetMap.

## Preview tunnels (Cloudflare)

- After sign-in, the computer keeps a connection to Cloudflare for the
  preview of dev sites.
- Cloudflare ends the HTTPS, so it can read a dev site while a preview is
  open. A preview needs a cookie.

## The web site (yonder.so)

- **DataFast** counts the page visits.
- **OpenAnalytics** counts the page visits. For a signed-in visitor, it
  also gets the user ID and the name, or the email when the user set no
  name. After a purchase, it gets the payment ID.
- The site sets the cookies `sessionid` and `csrftoken`, and keeps the
  theme in the browser.

## Other services

- **Anthropic:** the bridge asks for the usage of the user's own Claude
  login, for the usage bar.
- **1Password, GitHub, Visual Sandbox:** only for tools that the user
  installs.

## Not collected

- No analytics, tracking or usage counters in the apps.
- No call audio and no call words at yonder.so.
- No agent chats at yonder.so or at the relay.
- No call logs or bridge logs leave the computer, except one call transcript
  that the user adds to feedback.

## Not checked

- What `sentry-android` sends by default, and the IP and scrub settings of
  the Sentry project.
- The logs of Cloudflare and of the servers for yonder.so, the
  relay and the update server.
- Which cookies DataFast and OpenAnalytics set.
- How long xAI, Apple, Google and Cloudflare keep what they get. Their own
  policies decide that.
