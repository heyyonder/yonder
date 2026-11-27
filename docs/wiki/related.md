# Related tasks outside this repository

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
