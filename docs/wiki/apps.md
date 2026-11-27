# Apps

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
