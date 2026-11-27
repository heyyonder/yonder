# Yonder Preview

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

## Yonder in the Claude app

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
