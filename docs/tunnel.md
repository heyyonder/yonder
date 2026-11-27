# Yonder Preview: the local site of an agent, on each device

Yonder Preview opens the local site of an agent on each device. Cloudflare
quick tunnels (`cloudflared`) are not enough: the goal is a strong,
protected and fast preview, with a real domain.

The first Preview used our own edge server. It was slow, so a Cloudflare
Tunnel took its place: see "Built on Cloudflare Tunnel" below. The
sections between keep the first design and its reasons. Live View is not
built.

## Built on Cloudflare Tunnel

```
Phone (in-app browser, Safari, any device)
   │  HTTPS (HTTP/3 or HTTP/2) to landing-sam.yonder.so
   ▼
Cloudflare, the nearest data center ── ends HTTPS, compresses
   │  the tunnel yonder-sam: QUIC connections that cloudflared opened
   ▼
cloudflared on the Mac ── started by the bridge, with the token of the tunnel
   │  http://127.0.0.1:7788
   ▼
Bridge (bridge/preview.ts) ── checks the cookie, sets Host to localhost,
   │                          passes WebSockets (hot reload)
   ▼
Dev server of the agent ── http://localhost:5288
```

- **Why.** Through our edge, a server on another continent, each request
  crossed the ocean two times, about 330 ms, and HTTP/1.1 sent only 6
  requests at a time. Cloudflare has a data center near each user, HTTP/3,
  and compression. People trust Cloudflare, and the landing page can say so.
- **Measured**, the real `yonder-landing` page from a Mac: 0.7 s for the first load, 0.4 s for a reload, 1.4 MB in place of
  4.3 MB. Through our edge it took 6.9 to 8.2 s and 5.2 s.
- **The cost.** Cloudflare ends HTTPS, so Cloudflare can read the preview
  pages. Our edge could not. The cookie check of the bridge stays, so only
  the user and a share link open a preview.
- **The names.** One wildcard DNS record, `*.yonder.so`, proxied, points at
  `<tunnel id>.cfargotunnel.com`. The tunnel sends `*.yonder.so` to
  `http://127.0.0.1:7788`: its ingress rule at Cloudflare, or `TUNNEL_URL`
  from the bridge for a tunnel that `bun run setup-tunnel` made. Records of their own, such as
  `relay`, `www` and `edge`, still win. A preview is
  `<label>-<name>.yonder.so`, one level, because Universal SSL covers only
  one level. The bridge answers 404 for each other name.
- **The cache.** Cloudflare keeps some answers, such as a file with
  `public, max-age`, and gives them to each browser with no check of the
  cookie. The bridge puts `private` in each answer, and the live test got
  `cf-cache-status: BYPASS` and a 403 for a file with no cookie.
- **The headers.** The bridge removes `cf-*`, `x-forwarded-*` and
  `cdn-loop`, so that the dev server sees a request as on localhost.
- **Idle previews end.** A preview that gets no request and no WebSocket
  message for 30 minutes ends, with its cookies (`idle` in
  `bridge/preview.ts`). A preview with a share link stays open until the
  share ends. cloudflared stays connected, because the Claude connector
  uses the same tunnel, but each name of a closed preview answers 404.
- **cloudflared** runs as a child of the bridge, with the token in its
  environment. It starts again when it stops. The bridge stops it at its
  exit and on SIGTERM, and stops an old one from `preview/cloudflared.pid`
  at its start.
- **Setup by hand:** `cloudflared tunnel login` one time, then
  `bun run setup-tunnel --name <name>`, then a restart of the bridge. The
  name has no default: it is the name of the computer in the addresses.
  The script uses the commands `tunnel list`, `create`, `route dns` and
  `token` of `cloudflared`.
- **More users later:** one wildcard sends every name to one Mac. For a
  second user, each preview needs its own DNS record, or each user a zone.

## The goal

An agent works on a project and starts a dev server, for example
`http://localhost:5173`. The user opens that site from the phone, as a real
page: scroll, tap, type, and see each change of the agent at once (hot
reload). Only the user can open it. Nobody between the phone and the Mac can
read it. The user can also watch the browser that the agent drives.

## The first design (tested)

Two parts:

1. **Preview**: a real HTTPS address for each dev server, for example
   `https://agent-3.sam.yonder.page`. It is a tunnel, as Tailscale Funnel
   does it: the edge server passes the encrypted bytes, and TLS ends on the
   Mac. This is the main feature.
2. **Live View**: a live video of the browser that the agent drives, with
   taps and keys back to it, over WebRTC. This is the "see what the agent
   sees" part, as the Remote Control of Claude Code shows screenshots.

This design is final for the Preview, because it is the only option that
ran end to end: a real Vite site, through an edge that cannot read it, with
hot reload, and with the key on the Mac only.

### How the Preview works

```
Phone (in-app browser, Safari, any device)
   │  HTTPS to agent-3.sam.yonder.page:443
   ▼
Edge server ── reads only the SNI name, passes the encrypted bytes, has no key
   │  one WebSocket for each TCP connection, opened by the Mac
   ▼
Bridge on the Mac ── ends TLS with its own certificate, checks the cookie,
   │                 sets Host to localhost, passes WebSockets (hot reload)
   ▼
Dev server of the agent ── http://localhost:5173
```

1. The bridge keeps a control connection out to the edge, so the Mac needs
   no open port. The edge checks the room token of the Mac, as the relay
   does.
2. A browser opens `https://agent-3.sam.yonder.page`. The edge reads the
   SNI name in the TLS ClientHello. It sees no other part of the request.
3. The edge tells the Mac about the new connection. The Mac opens one
   WebSocket for that connection, and the edge pipes the TLS bytes through
   it.
4. The bridge ends TLS with the certificate of `*.sam.yonder.page`. The
   private key never leaves the Mac.
5. The bridge checks the session cookie of that host. With no cookie, it
   answers 403.
6. The bridge sends the request to `localhost:<port>` with the Host
   `localhost:<port>`, so the dev server accepts it without settings. It
   passes WebSocket upgrades too, so hot reload works.

### The protection

- **End-to-end encryption.** TLS ends on the Mac. The edge sees the SNI
  name, the sizes and the times, nothing more.
- **Access.** The app asks the bridge for a preview through the encrypted
  link of today. The bridge gives a one-time key. The first page load
  changes the key to an `HttpOnly`, `Secure`, `SameSite=Lax` cookie for that
  one host, and removes the key from the address. Only a paired device can
  get a key, so the pairing of the QR code is the check.
- **Sharing.** A "Share" button can make a key for another person, with an
  end time (for example 1 hour). The user can stop a preview or a share at
  each time.
- **Only the ports of the projects.** The bridge opens only a web server
  in a project folder of Yonder, and only after the user opens its preview
  (see "Which project runs on which port, and its address").
- **The edge trusts only Macs with a room token.** A Mac can register only
  the names of its own zone.
- **Cookies of other sites stay safe.** The previews use their own domain,
  not another domain of the user, so a dev site cannot read or set the cookies of
  another site of the user. For more than one user, put the domain on the
  Public Suffix List, so that each user is a separate site.
- **Later, if necessary:** a client certificate for each paired phone
  (mutual TLS). The bridge holds TLS, so it can ask for one. Not tested.

### The domain and the certificates

- Buy a short domain for the previews, for example `yonder.page`, on
  Cloudflare. Its DNS points `*.yonder.page` at the edge, with the proxy
  off (DNS only), because the edge must get the raw TLS.
- The Mac gets a wildcard certificate from Let's Encrypt with the DNS-01
  check. For one user, a script with a Cloudflare API token can write the
  `_acme-challenge` record.
  For many users, the control server writes it for each Mac, as acme-dns
  does, and never sees the private key.
- Let's Encrypt gives 50 certificates for each registered domain in 7
  days, and 5 for the same names in 7 days. So keep the certificate in
  `~/.config/yonder`, and renew it on a schedule (ARI), never at each start
  of the bridge.
- One wildcard for each user (`*.sam.yonder.page`) covers all the
  previews of that user, so a new preview needs no new certificate.

### The edge server

- The edge cannot be the Cloudflare Worker of the relay. A Worker accepts
  only HTTP, and TCP passthrough on Cloudflare (Spectrum for any TCP) is
  only on the Enterprise plan.
- So the edge is a small server of our own: a Bun service of about 300
  lines, in a container. Fly.io with a dedicated IPv4 address needs no SSH
  key, and it can run near the user. A small server of another host also
  works.
- This is the one part that is heavier than the relay of today: a server to
  run, to update and to watch. The traffic goes through it, and it costs
  a few dollars each month for one user.
- Later: an edge in more regions, and a direct path on the same Wi-Fi.

### Where the user sees it

- The preview opens as a top-level page, not in an `<iframe>` of the app.
  In an iframe, the cookie of the preview is a third-party cookie, and the
  web views of iOS and Android block it. Not tested in the app yet.
- On the phone: a full-screen web view, or Safari. On the Mac: a second
  window of the app, or the default browser.
- The conversation of the agent shows an "Open preview" button when the
  agent runs a server. Grok gets a `preview` tool: "show me the site of
  agent 3".

### Measured (prototype, all on one Mac)

- A page with 6 requests loaded in 50 to 57 ms the first time (new TLS and
  a new tunnel connection), and in 18 to 19 ms after that. The same page
  direct from Vite loaded in 17 ms. On a real network, add the round trips
  from the phone to the edge and from the edge to the Mac.
- With no key, the answer was "Open this preview from Yonder." (403).
- Vite 8.3.2 connected its hot reload through the tunnel, with no Vite
  settings. A change to the CSS showed in the page with no full reload.
- The edge passed 238 to 462 KB to the browser. The text of the page never
  showed in clear at the edge.

### What the prototype did not cover

- **Backpressure.** The prototype buffers without a limit. Production must
  check `bufferedAmount` and the return of `write()`.
- **The ClientHello in parts.** The prototype reads the SNI from the first
  chunk only.
- **HTTP/2.** The TLS server of Bun answers HTTP/1.1, so a browser opens
  about 6 connections for each preview. Each one costs a WebSocket to the
  edge. A pool of open WebSockets, as localtunnel keeps 10, removes that
  wait.
- **Other dev servers.** Next.js, Astro, webpack and others can check the
  Origin header or need their own settings. Vite 8.3.2 needed none. Test
  each one.
- **The phone app.** The full-screen web view and the cookie in it.

## Live View: see what the agent sees

The Preview is a second copy of the site. Live View shows the real browser
of the agent, with its clicks and its typing, as a video. The user can tap
and type in it too.

- **WebRTC, peer to peer.** The Mac sends the video straight to the phone.
  WebRTC encrypts it end to end (DTLS-SRTP). When the network blocks a
  direct path, the TURN service of Cloudflare Realtime relays it. TURN
  cannot read it. Cloudflare charges $0.05 for each GB after 1,000 GB free
  each month.
- **The setup messages of WebRTC** (the offer, the answer, the ICE
  candidates) go through the encrypted relay link of today. No new server.
- **Taps and keys** go back on a WebRTC data channel, and the bridge sends
  them to the tab with CDP (`Input.dispatchMouseEvent`,
  `Input.insertText`).
- **The source of the video.** A headless Chrome on this Mac could not
  capture its own tab (`getDisplayMedia` gave "NotReadableError: Could not
  start video source"). What worked: the CDP screencast of the tab, drawn
  on a canvas, and `canvas.captureStream()` into WebRTC. For production,
  use the tab capture of a Chrome extension in the Chrome of the agent, or
  ScreenCaptureKit with the hardware encoder of the Mac. Neither is tested.

Measured, a phone-sized Wikipedia page that scrolled, at about
7 frames each second:

| Path | Data each second |
|---|---|
| JPEG pictures of the screencast (quality 80) | about 2,000 to 2,200 kbps |
| The same frames as VP8 video over WebRTC | about 300 kbps |

The WebRTC number is from 6 seconds, while the encoder still increased its
rate, so a longer run can be higher. Even so, video uses far less data than
pictures.

## Order of the work

1. **The edge and the domain.** Buy the domain, deploy the edge on Fly.io,
   and get the wildcard certificate for one user.
2. **The bridge.** The tunnel client, the TLS server with the cookie check,
   the proxy with the Host change and WebSockets, backpressure, and a pool
   of WebSockets.
3. **Ports and the tool.** Find the ports of the agents, and add the
   `preview` tool and `/preview` for the app.
4. **The app.** "Open preview" in the conversation, a full-screen web view
   on the phone, and Share and Stop.
5. **Live View.** WebRTC with Cloudflare TURN, the tab capture, and the
   input channel.
6. **More users.** The Public Suffix List, the certificates through the
   control server, and edges in more regions.

## Which project runs on which port, and its address

How does the Mac app know which site to send to which address, and can
many projects have their own addresses?

### Many projects, one domain

- Each running dev server gets its own name under the zone of the user, for
  example `sundial.sam.yonder.page` and `nova.sam.yonder.page`.
- The name comes from the project, so it stays the same after a restart,
  also when the port changes. A server in a worktree adds the name of the
  worktree (`yonder-landing-minimal-landing`). A second server in the same
  folder adds its port (`sundial-5174`).
- Each name is one DNS label, so the one wildcard certificate of
  `*.sam.yonder.page` covers all of them. A name with two levels, such as
  `web.sundial.sam.yonder.page`, is not covered.
- The edge and the DNS do not change for a new project. The edge sends all
  of `*.sam.yonder.page` to this Mac. The Mac ends TLS, reads the name, and
  looks up the port in its own table. So there is no limit on the number of
  projects, and each one costs nothing.

### How the bridge finds the servers

Every few seconds, the bridge:

1. Lists each TCP port that listens on the Mac (`lsof -iTCP -sTCP:LISTEN`).
2. Reads the folder of each process (`lsof -d cwd`).
3. Keeps only the processes in the folder of a project of Yonder, or in one
   of its worktrees.
4. Sends one HTTP request to the exact address of the listener, and keeps
   only the ports that answer HTTP. The `<title>` of the page labels it.

Measured on one Mac: 37 ports listened. The steps above found
5 web servers in projects, and dropped Postgres, Docker, a music app, the
Android emulator and the bridge itself:

| Port | Project (folder) | Page title |
|---|---|---|
| 1420 | `yonder` (worktree `agent-view-tabs`) | Yonder |
| 5173 | `yonder-landing` (worktree `minimal-landing`) | Yonder — talk to Claude Code |
| 5288 | `yonder-landing` | Yonder — call your Claude Code |
| 8000 | `nova/backend` | (a Django 404 page) |
| 8766 | `acme` (worktree `reel-time`) | Directory listing |

Two lessons from this test:

- **The address matters.** Vite listened only on `[::1]`, so a request to
  `127.0.0.1` failed. The bridge must use the address that `lsof` shows.
- **The parent process does not show the agent.** The server on port 1420
  had the parent 1, because a server that runs in the background leaves its
  parent. So the bridge links a server to an agent through its folder: the
  transcript of each agent gives its folder, and a worktree belongs to one
  agent. A server in the main folder of a project belongs to the project,
  not to one agent. The message of the agent ("The site runs on
  http://localhost:5173") and its Bash command (`vite --port 5173`) also
  name the port, and `findMedia` in `bridge/media.ts` can find them.

### Nothing goes out without the user

The scan only makes a list. A server gets a public name only when the user
opens its preview: a tap on "Open preview", or "show me the site of agent
3" to Grok. The user can stop each preview, and a preview stops when its
server stops. The user can also add a port by hand ("share port 3000 of
nova").

## What was built

- **No WebSockets between the Mac and the edge.** The Mac keeps 6 spare
  TLS connections to port 443 of the edge, with the SNI name of the edge
  (`edge.<domain>`). The edge ends their TLS with its own certificate,
  which the Mac pins. A spare connection sends
  `YONDER/1 <zone> <token>`, gets `OK`, and waits with `PING` and `PONG`.
  For a browser connection the edge sends `START <ip>`, the Mac answers
  `GO`, and then the bytes go both ways as they are.
- **Why.** The WebSocket client of Bun 1.3.11 always gave a
  `bufferedAmount` of 0, so the Mac could not slow down, and a `close()`
  lost the bytes that waited. Over plain TCP, each side stops reading while
  1 MB waits on the other side, and TCP slows the sender down. The
  `node:net` pipe of Bun lost about 1 MB of an 8 MB answer, so all the
  sockets are the sockets of Bun, with a queue for each side.
- **The pool** of spare connections removes the setup time of the first 6
  connections of a page. The Mac opens a new spare for each one that the
  edge uses, and a browser waits at most 10 seconds for one.
- **One port.** The edge serves the Macs and the browsers on port 443, and
  tells them apart by the SNI name.
- **On the Mac**, Preview opens `http://localhost:<port>` in the browser,
  with no tunnel.
- **On the phone**, Preview opens in the browser inside the app of the
  opener plugin (SFSafariViewController, Custom Tabs), not in an `iframe`,
  so the cookie is a first-party cookie. This needs a new install of the
  phone app.
- **The proxy** passes the Host and the Origin of `localhost:<port>`,
  removes the cookie of Yonder and the headers of one connection, keeps
  the gzip of the dev server, and changes a redirect to `localhost` and the
  `Domain` of a cookie to the address of the preview.
- **Checked on this Mac** with `bun run check-preview`, and with 30
  transfers of 8 MB at once (uploads, downloads and slow readers), with the
  edge in the same process and in its own process. Not checked: a real
  network, the edge on a server, and the browser of the phone app.
- **Not built:** HTTP/2 (each page opens about 6 connections), Live View,
  more users (the Public Suffix List, certificates through a control
  server), and an edge in more regions.

## The old edge

- The edge was `edge.yonder.so`, with one zone for each Mac, such as
  `sam.yonder.so`.
- The edge is removed, with its firewall rules and its DNS records,
  because nothing used it after the move to Cloudflare Tunnel, and it
  still accepted TCP 443 from every address.

## Why the tunnel is slow (measured)

The tunnel through the edge is very slow. The cause is the distance to the edge, times the number of requests. The code of the
bridge and of the edge adds almost nothing.

- Each request goes from the browser to the edge on another continent,
  then to the Mac, and back the same way. That is two round trips over the
  ocean.
- One round trip from the test Mac to the edge took 120 to 200 ms. One request
  through the tunnel took 300 to 400 ms (median 333 ms), the same for 1 KB
  and for 3 MB. The dev server answered in 1 ms.
- A Vite dev site sends each module as its own file, and the TLS server of
  the bridge speaks only HTTP/1.1. So the browser sends 6 requests at a
  time, and the other requests wait (up to 2.8 s).
- `yonder-landing` (80 requests, 4.3 MB) loaded in 6.9 to 8.2 s through the
  tunnel, and in 0.4 s on localhost. With a full cache it took 5.2 s,
  because Vite marks its modules `no-cache`, and each 304 is one more trip.
- Vite does not compress, so the proxy passes 4.3 MB. Gzip makes
  `react-dom_client.js` 4.8 times smaller (3.1 MB to 650 KB) in 45 ms.

The round trips from that Mac (TCP connect), and one request through an
edge in that place:

| Place of the edge | Round trip | One request |
|---|---|---|
| Another continent (the old edge) | 120 to 200 ms | about 330 ms |
| A nearer region | about 40 ms | about 80 ms |
| A region next to the Mac | about 19 ms | about 40 ms |
| The same city | about 10 ms | about 20 ms |

What makes it faster, the largest effect first:

1. **An edge near the user.** The code of the edge does not change. The
   new server needs Docker and TCP 443 open. A small server costs about $5
   each month.
2. **HTTP/2 in the TLS server of the bridge.** All the requests of a page go
   on one connection, with no queue. `Bun.serve` serves HTTP/2 since Bun
   1.4.1 (`http2: true`, experimental). This Mac runs Bun 1.3.11, which
   ignores the option. Each step of an import chain still costs one trip,
   so this is about 2 times faster, not 10 times.
3. **Gzip in the proxy**, for each answer that the dev server did not
   compress. It helps a first load on a slow phone network, not a reload.

### Cloudflare Tunnel as a measuring stick

Can Cloudflare Tunnel make the preview faster? A copy of
the `yonder-landing` page went through a temporary quick tunnel for about
one minute. The copy had the same paths, sizes and import chains, but fake
content. `cloudflared` connected to the nearest data center over QUIC.

| The copy | Cold | Reload | One request |
|---|---|---|---|
| Through Cloudflare (HTTP/2) | 0.6 to 1.1 s | 0.4 s | about 40 ms |
| On localhost | 0.02 s | 0.02 s | 1 ms |
| The real page through our edge (HTTP/1.1) | 6.9 to 8.2 s | 5.2 s | about 330 ms |

- The copy does no React work, and its random text compresses badly
  (4.4 MB became 3.0 MB). So expect about 1 s for the real page through
  Cloudflare.
- A named tunnel on yonder.so, with the cookie check of the bridge, solves
  the two objections to the quick tunnel: the public address and the
  address that changes. It costs nothing, Cloudflare is near each user,
  and it gives HTTP/2 and compression. It removes the edge, `cert.ts`, the
  spare connections and the workarounds for Bun.
- The cost: TLS ends at Cloudflare, so Cloudflare can read the preview
  pages. The first design keeps them from the edge.
- Universal SSL covers only one level under yonder.so. Behind the proxy of
  Cloudflare, `*.sam.yonder.so` needs Advanced Certificates (about $10
  each month, check it at build time). One-level names, such as
  `landing-sam.yonder.so`, need nothing.
- The "Tunnel On" design (each port of the Mac) can go through Cloudflare
  too, as a TCP stream in a WebSocket, so this choice does not stop it.

## A correction: the frame limit of the relay

The wiki and `bridge/main.ts` say that the Cloudflare relay takes 1 MiB at
most in one WebSocket frame. Since 2025-10-31, Workers and Durable Objects
take 32 MiB. The 3 MB check of `check-relay` passed for this reason. The
code that sends files in parts still works, but its reason is old.

## A general preview of each port, as on localhost (research)

Some fonts did not load in the preview of a project, nova. This research
looks at one general preview instead of one tunnel for each site: with the
tunnel on, open each port of the Mac from the phone, "pixel for pixel" as
on localhost, with an address bar to change the port. Nothing below is
built.

### Why the fonts did not load

- The tunnel is not the cause. The same fonts fail on the Mac at
  `http://localhost:5174`.
- The agent of a nova worktree made `node_modules` a
  symbolic link to `frontend/node_modules`. Vite serves the `@fontsource`
  fonts at `/@fs/<real path>`, and the real path is outside the worktree.
  So Vite answers `403 Restricted`, "outside of Vite serving allow list".
  Each `@fontsource` font failed. The font in `src/fonts` loaded, because
  it is inside the worktree.
- The fix is in nova, in `vite.config.ts`:
  `server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules')] } }`.
  A test server with this setting gave 200 for the same font. `npm
  install` in the worktree, in place of the link, also works.
- Yonder does not tell the agents to make this link.

### What one tunnel for each site cannot do

- The nova page calls its API at `http://127.0.0.1:8000`
  (`VITE_API_URL`). Through the tunnel, Chrome blocked each call
  (`LocalNetworkAccessPermissionDenied`). On a phone, `127.0.0.1` is the
  phone. So a site that uses a second local server shows no data in the
  preview. This is the strongest reason for a general preview.
- Other parts differ from localhost too: the Host and the Origin (the
  bridge changes them), addresses such as `http://localhost:8000` in the
  code of a page, the CORS list of a backend (nova accepts only
  `localhost:5173` to `5175`), and the cookies (on localhost, all ports
  share them).
- To change each `localhost:<port>` in the pages and the scripts is not
  safe. A script can make the address at run time.

### Speed, measured

- The nova page reached its load event after 17.8 s through the edge,
  and after 143 ms from localhost. Vite sends each module as its own file,
  so the page made about 317 requests on 6 HTTP/1.1 connections. Each
  request went from the Mac to the edge on another continent and back. The
  headless Chrome ran on the Mac, so it had the same two trips as a phone
  near the Mac.
- An edge near the user, HTTP/2 in the TLS server of the bridge (all
  requests on one connection), or a direct path on the same Wi-Fi makes it
  faster. The design below does not change the speed.

### A proxy in the browser does not work on iOS

- Since iOS 17, `WKWebsiteDataStore.proxyConfigurations` sends the
  requests of a web view through an HTTP CONNECT proxy. But WebKit never
  sends `localhost`, `127.0.0.1` or `[::1]` to a proxy (shepherd pull
  request 167 tested this, and an Apple forum thread agrees). A name such
  as `foo.localhost` goes through, but it is another origin.
- On Android, `ProxyController` with `removeImplicitRules()` sends
  localhost through a proxy. So only Android can do it this way.

### The design that can work: the phone listens on the ports of the Mac

This is how `ssh -L` works, and how shepherd pull request 167 shows the
pages of another Mac.

1. The user turns on the Tunnel switch.
2. The phone app opens a TCP listener on its own `127.0.0.1`, at each port
   of the Mac to show, for example 5174 and 8000.
3. The browser in the app opens `http://localhost:5174`. Each connection of
   the browser goes to a listener of the app.
4. For each connection, the app opens a TLS connection to the edge with a
   name kept for this, such as `fwd.sam.yonder.so`. The edge passes the
   bytes to the Mac as it does today, so the edge does not change.
5. The bridge ends TLS with the wildcard certificate. It reads one line with
   the port and the token of the paired phone, and connects to that port on
   the Mac. Then the bytes go both ways as they are.

- Then the page, its calls to `127.0.0.1:8000`, its WebSockets, its cookies,
  its CORS and its Host are the same as on the Mac. Nothing changes the
  bytes.
- The address bar: a field in the Preview tab, or above the browser. A new
  port in it adds a listener.
- The share links for other people still use the tunnel for each site.
  The general preview is an addition, not a replacement.
- The Mac needs nothing new, because Preview opens localhost there today.
- The bridge needs one more kind of connection. Each phone app needs a
  native plugin: the listener and the TLS pipe.

### The decision: one switch

- One switch: Tunnel On or Off. Off: no tunnel. On: the phone reaches each
  localhost port of the Mac, with no other question. This is the simplest
  approach.
- So the switch is the one yes. It takes the place of the yes for each
  project (`approved` in `state.json`), and of the limit
  to servers in project folders. The Preview row of the Settings (On or
  Off) can become this switch.

### Open checks, not tested

- Can SFSafariViewController and Custom Tabs, which run in another
  process, reach a listener of the Yonder app on `127.0.0.1`? The loopback
  is the same for each app on a device, and apps with a local web server
  work this way, but test it. If not, the app needs its own web view.
- ATS on iOS: a web view of the app can open `http://localhost` with
  `NSAllowsLocalNetworking`, but the address `http://127.0.0.1` can need an
  exception (spireweb issue 72).
- Each app on the phone can connect to a listener while it is open. So
  listen only while the browser shows. On Android, an app in the
  background can connect.
- iOS stops the listeners when Yonder goes to the background.
- The bridge must never pass its own port (7787). Through it, an app on
  the phone could control the agents.
- If the pipe goes through the relay (a WebSocket) in place of the edge, it
  meets the `bufferedAmount` bug of Bun again (see "What was built"). The
  path through the edge does not.
- Today the bridge gives each connection from the edge to the HTTP
  `fetch` of its `Bun.serve`, which cannot take a raw pipe. So the bridge
  must pick the kind of connection by the SNI name before `Bun.serve`, or
  the phone opens the pipe as a WebSocket upgrade on `fwd.<zone>`. The
  WebSocket server of Bun can slow down a sender; only its client has the
  bug.

## Our own tunnel or Cloudflare (research)

Must Yonder have one DNS record for each computer, and must it depend on Cloudflare for the previews? Not built.
The numbers come from the docs of Cloudflare and of the server hosts.

### What the tunnels cost today

- Nothing. Cloudflare Tunnel, the Worker `yonder-tunnels` (Free plan) and the yonder.so zone (Free plan) cost $0.
- The limits of the Free plan: 200 DNS records in the zone, 100,000 Worker requests each day for the account,
  1,000 Worker routes in the zone, and 1,000 tunnels in the account.
- The "about $5 for each tunnel" is the price of Tunnels for Platforms: the first 1,000 tunnels of an account are
  free, and each tunnel after that costs $4.50 each month. So the design of one tunnel for each computer costs
  nothing up to about 1,000 computers, and then about $4.50 for each computer each month.

### The guess of the traffic

- A page of a dev server is about 1.5 MB with gzip (`yonder-landing` is 4.3 MB without it). A user who opens about
  30 pages each day sends about 2 GB each month through the tunnel, and about 30,000 requests.
- 10 users: 20 GB each month. 1,000 users: 2 TB. 10,000 users: 20 TB. About 1.5 computers for each user.
- A typical server host counts only the traffic out. An EU server can have 20 TB each month in its price, a US
  server 1 TB, and each TB more costs about €1. A small server costs about €4 to €7 each month.

### The options

| Option | 10 users | 1,000 users | 10,000 users | One request from the test Mac |
|---|---|---|---|---|
| Today: a Cloudflare tunnel, record and Worker route for each computer | $0 | about $2,300 (500 tunnels over 1,000, the Pro zone, Workers Paid) | about $63,000 (14,000 tunnels over 1,000, Enterprise DNS) | about 40 ms |
| 1. One wildcard name to one ingress, by subdomain | as the ingress below | | | as the ingress below |
| 2. Paths: `yonder.so/t/<id>/` | not safe | | | |
| 3a. Our relay carries the previews | €0 (the server of today) | €20 to €30 (an EU and a US relay) | €80 to €150 (3 to 5 servers) | about 80 ms with a relay on the same continent, about 330 ms with one relay on another continent |
| 3b. frp, 3c. sish | as 3a | as 3a | as 3a | as 3a |
| 4. Cloudflare in front of one ingress (one tunnel, one record, no Worker) | €0 | as 3a | as 3a | as 3a, and HTTP/3 to the browser |

- **1, the wildcard.** At Cloudflare, a subdomain can reach the tunnel of one computer only through a DNS record of
  its own (the Worker of today needs one record for each computer). So "one record, routing by subdomain" needs
  an ingress of our own: it is the routing of 3 or 4, not an option of its own.
- **2, paths.** All the previews would be on one origin, yonder.so. The script of one preview could then read the
  cookies and the storage of the other previews and of yonder.so, with the sign-in of the account. Apps with links
  that start with `/`, client routers, redirects, cookies with `Path=/` and service workers also break under a
  sub-path. Do not use it. The Claude connector uses a path (`tunnel.yonder.so/<id>/mcp`), but it is JSON for one
  client, not a web site.
- **3a, our relay.** Each computer keeps a WebSocket to the relay already, with its own token, and the relay
  carries the requests of the Claude connector already (`/<id>/...` in `relay/main.ts`). It needs: binary bodies
  and streams in place of one JSON text frame of 1 MB, WebSockets for hot reload, one wildcard name with its
  certificate, and a second relay in a second region. The bridge passes each request to the HTTP server
  of `bridge/preview.ts` as `cloudflared` does now, so the keys and the cookies stay. `cloudflared`,
  the tunnel code of the yonder.so backend (private), the Worker and the record of each computer go away. About 3 to 5 days.
- **3b, frp.** A mature Go server with routing by subdomain, and plugins (`Login`, `NewProxy`) that can ask the
  accounts server about each computer. But each app must carry a signed `frpc` binary for each system, and the
  Mac app needs a native build for it. About 2 to 3 days and the binaries.
- **3c, sish.** An SSH server with routing by subdomain and WebSockets. The computer uses the `ssh` of the system,
  so no binary goes with the app, and each computer has its own SSH key. The keys come from a folder that sish
  reloads, so the accounts server must write them there. One TCP connection carries all requests, so a slow file
  holds the others. About 2 days, with less control.
- **rathole and localtunnel** do not fit: rathole forwards TCP ports and has no routing by host, and localtunnel
  has no authentication and gets no updates.
- **4, Cloudflare in front.** Cloudflare ends HTTPS near the user and sends all the previews through one tunnel to
  our ingress (3a). It costs nothing at Cloudflare and hides the server, but each request still goes to our relay.

### Security in each option

- Only the signed-in app opens a tunnel: the computer joins with its relay token, and the HTTP server of the bridge
  lets in only a browser with the one-time key and its cookie, for one host. This stays the same in 3 and 4.
- The server that ends HTTPS can read the pages: Cloudflare today and in 4, our relay in 3. Neither keeps them.
- A share link (`preview` with `share`) works for 60 minutes. For our own tunnel, limit them: a few open links for
  each account, at most 24 hours, and a cap of the traffic for each link and each account each month. The relay
  counts the bytes of each computer, so the caps are simple to add.

### For the users of today

- When the wildcard `*.yonder.so` moves from the tunnel of one Mac to the relay, the addresses keep
  their form (`<site>-<computer>.yonder.so`), and the cookies still work, because the bridge keeps them.
- It needs a new bridge (a staging release) and a deploy of the relay. A bridge that is not updated keeps its
  Cloudflare tunnel until it updates.

### The recommendation

3a: the previews go through our own relay, with one wildcard name, and a second relay in a second region when the
users far from the first need speed. It keeps the DNS records at one, has no cost for each tunnel, needs no new binary in the
apps, and costs about €20 to €150 each month up to 10,000 users. A plan can then limit what costs money: the
traffic and the share links, not the number of tunnels.

### The plan after two questions

Our own tunnel has two risks: it must not slow down the relay (calls, the phone link, the
pages), and the previews through a relay on another continent were much slower than Cloudflare (about 180 ms
more each trip).

- **Separate preview servers.** The previews go to their own small servers, not to the relay. The relay keeps the
  calls and the phone link. A computer keeps one more connection, to its preview server.
- **Near the users.** One server in North America and one in the EU. A small server in the city of a user (about
  $6 each month with 1 TB) is about 10 ms from that user. A server in a nearer region is about 40 ms.
- **Routing by region.** At its start, each computer measures the time to each preview server and joins the
  nearest. Its addresses name the region, such as `<site>-<computer>.na.yonder.so`, with one DNS record and one
  Let's Encrypt wildcard certificate for each region. The phone is usually near its computer, so the region of the
  computer is also good for the phone.
- **Peer to peer.** WebRTC does not help the previews: the browser inside the app cannot send the requests of a
  page through a data channel (no service worker and no proxy on iOS, see above). The phone link and the calls can
  use WebRTC, the previews cannot. A preview on the same Wi-Fi could go straight to the Mac later, but dev servers
  listen on localhost, so it needs more work.
- **HTTP/2 and HTTP/3.** The preview server speaks HTTP/2 and HTTP/3 to the browser, compresses with gzip or
  Brotli, and keeps one multiplexed connection to each computer. It can keep answers marked `immutable` (the
  dependencies of Vite) for each site, after the cookie check. Most modules of a dev server are `no-cache`, so the
  cache helps a reload more than a first load.
- **Speed, expected.** One request from the test Mac: Cloudflare about 40 ms (measured), a server in the same city
  about 20 ms, a server in a nearer region about 80 ms, a server on another continent about 330 ms (measured). A
  page of `yonder-landing`: Cloudflare about 0.7 to 1 s (measured), a server in the same city about the same, a
  server in a nearer region about 1.5 s.
- **Cost.** A small EU server (20 TB in the price) and a North American server: about €10 to €15 each month up to
  1,000 users, and about €60 to €120 at 10,000 users, most of it the traffic in North America.
- **When.** Cloudflare is free and fastest now. The first wall is the 200 DNS records of the zone. Then two choices: pay about $30 each month (the Pro plan of the zone and Workers Paid) to reach the
  1,000 free tunnels, or move to the preview servers. Build the preview servers before 1,000 computers, keep
  Cloudflare as the fallback, and move the computers region by region.

## Earlier options

- **On the Mac only:** an iframe of `localhost` works today, because the
  `csp` of the app is `null`. It is not enough for the phone.
- **A `preview` URL scheme in the phone app.** The app answers each request
  of an iframe with native code, through the encrypted link. End to end,
  no server, but no hot reload, only in the Yonder app, and a native change
  in each phone shell.
- **A public tunnel on the Cloudflare Worker,** as localtunnel does it.
  No server, but Cloudflare ends TLS and reads each page.
- **A separate tunnel container with `frps`.** The same idea as the edge,
  but someone else's code and less control of the auth.
- **A Cloudflare quick tunnel** (`cloudflared`). It worked in a test, but
  the URL is public and changes each time.
- **A shared browser with JPEG pictures.** It became Live View, with WebRTC
  in place of the pictures.
- **A service worker on the phone.** WKWebView allows it only on
  app-bound HTTPS domains, so it does not work in the Tauri app.

## Sources

- Tailscale Funnel: https://tailscale.com/kb/1223/funnel
- Let's Encrypt rate limits: https://letsencrypt.org/docs/rate-limits/
- Cloudflare Realtime pricing: https://developers.cloudflare.com/realtime/pricing/
- Cloudflare Spectrum: https://developers.cloudflare.com/spectrum/
- The WebSocket limit of Workers (32 MiB):
  https://developers.cloudflare.com/changelog/2025-10-31-increased-websocket-message-size-limit/
- Vite server options (`allowedHosts`, HMR behind a proxy):
  https://vite.dev/config/server-options.html
- localtunnel: https://github.com/localtunnel/server
- shepherd pull request 167 (the ports of another Mac, and the loopback
  that WebKit never sends to a proxy): https://github.com/bailycase/shepherd/pull/167
- Apple forum, localhost through a proxy: https://developer.apple.com/forums/thread/681009
- `ProxyConfig.Builder.removeImplicitRules` of Android:
  https://developer.android.com/reference/androidx/webkit/ProxyConfig.Builder
- spireweb issue 72 (ATS and `http://127.0.0.1`): https://github.com/llimllib/spireweb/issues/72
- Vite `server.fs.allow`: https://vite.dev/config/server-options.html#server-fs-allow
