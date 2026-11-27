# Agent secrets: 1Password with a yes from the phone

Status: the design, and phase 1 is built. Agents hit 1Password prompts,
and they need the user at the Mac. Yonder works with 1Password. It does not rebuild it.

## The problem

An agent that needs a login or a key runs `op`. The 1Password app then
asks for Touch ID on the Mac. When the user is away, the agent waits or
fails. The only way around it today is a service account token in the
keychain, and every agent can read that token with no yes from anyone.

## How `op` reaches the secrets

No secret was read or printed for these facts.

- `op` can have no account of its own. Then it works only through the
  1Password app, and it fails when that link is off ("1Password CLI
  couldn't connect to the 1Password desktop app").
- A login keychain can hold the token of a service account for a CLI of
  the user. When the `security` tool made the item, any program of the
  user reads it with `security find-generic-password -s <item> -w`, with
  no prompt. **So each agent can read each item of that vault, with no
  yes and no log in Yonder.**
- When SSH uses the agent of 1Password (`~/.ssh/config`), an SSH key
  works only while the app is open and unlocked.
- `ps -E` shows the environment of a running `op` or `bun` of the same
  user (a test with a dummy variable). So a token in
  `OP_SERVICE_ACCOUNT_TOKEN` is visible to every agent while `op` runs.
  Apple's own programs hide their environment, other programs do not.
- The 1Password SDK for JavaScript (`@1password/sdk`) runs in Bun and
  takes the token in memory, with no environment variable.

## The options of 1Password in 2026

The research, from the pages of 1Password.

- **No feature of 1Password takes a yes from the phone.** `op`, the
  desktop sign-in of the SDKs, the Environments MCP server, the `.env`
  files of Environments and "1Password for Claude" all need Touch ID or
  an Apple Watch at the Mac. A request for a remote approval is open
  since 2026-02-26, with no plan
  ([community](https://www.1password.community/developers-69/feature-request-remote-approval-for-op-cli-desktop-prompts-to-support-agentic-workflows-24119)).
- **`op` with the desktop app**: a yes lasts for one terminal session
  (the `tty`), 10 minutes with no use and 12 hours at most, and it opens
  the whole account. A Bash call of Claude Code has no `tty`, so each
  call can ask again. On macOS 27 the app that runs the commands needs
  "Data shared by 1Password" in Files and Folders, else `op` cannot
  connect.
- **Service accounts**: a token (`ops_...`) that reads only the vaults
  that it names, never the Personal, Private or Shared vault. Its vaults
  cannot change later, but the items in them can. Individual and
  Families: 1,000 reads in an hour for each token, and 1,000 reads and
  writes in a day for the whole account. Only Business shows which items
  a service account read. So on Individual and Families the log of
  Yonder is the only record
  ([limits](https://www.1password.dev/service-accounts/rate-limits/)).
- **1Password Connect**: two Docker containers that cache a vault. It
  gives no approval and adds a long-lived token on the disk. It is for
  servers, not for one Mac.
- **The SDKs** (JavaScript 0.5.0): `secrets.resolve("op://...")` with
  the token in memory. They also read Environments.
- **`op run`**: puts the secrets in the environment of a command and
  hides their values in its output. 1Password says that the masking is
  "best effort", and that other programs of the same user can read the
  environment of the command.
- **Agent features**: "1Password for Claude" (Claude Desktop and Claude
  in Chrome, July 2026) fills logins with the browser extension, and the
  model never sees them, but the yes is Touch ID on the Mac. Secure
  Agentic Autofill (Browserbase) is early access for cloud browsers.
  The Environments MCP server never gives a value to the agent, and its
  yes lasts until the app locks. NVIDIA OpenShell (beta) gives the agent
  placeholders and puts in the real secret at a gateway.
- **The guidance of 1Password** for agents: inject the credential for
  the agent, never through the model, with an explicit yes of the person,
  short-lived and scoped
  ([blog](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt)).
  Yonder does this.

## Three ways

| | A. The app with Touch ID | B. A token on the Mac, as today | C. A token sealed to the phone (chosen) |
|---|---|---|---|
| Works when the user is away | No | Yes | Yes |
| Approval on the phone | No | Only a tap that an agent can fake | Yes, with Face ID, and needed to read |
| What an agent can read with no yes | Nothing | The whole vault | Nothing |
| Vaults | All, Personal too | Only the vaults of the token | Only the vaults of the token |
| Change in 1Password | None | None | A vault and a service account (exist) |
| Work in Yonder | None | A broker | A broker and a key on the phone |

- **A** is the pain of today. It stays the way for a vault that the
  user does not give to agents, such as Personal, when the user is at the
  Mac.
- **B** is cheap but gives no safety. An agent reads the token from the
  keychain, or calls the bridge on 127.0.0.1 and taps Allow itself.
- **C** keeps the token on the Mac only in a sealed form that only the
  phone can open. No yes from the phone, no secret.

## The design (C)

### Parts

- A vault for agents, "Agent", and a service account that can only read
  it. The user puts in it only the logins and keys that agents may use.
- `bridge/vault.ts`: the broker. It keeps the sealed token in
  `~/.config/yonder/vault.json`, asks the phone, opens the token, reads
  the secret with the SDK, and gives it to the command or the page.
- The tools `use_secret` and `list_secrets` of the bridge, for agents.
- The card on the phone, with Face ID.
- The log `~/.config/yonder/approvals.jsonl`, the log of the approvals.

### The sealed token

- The user pastes the token on the phone, in Settings, General, 1Password.
  The phone sends it to the bridge through the encrypted link, so it
  never goes in a file, a log or the clipboard of the Mac.
- The bridge seals the token to each paired phone: a new P-256 key,
  ECDH with the key of the phone, HKDF, AES-GCM. It keeps the sealed
  copies and forgets the token and the new private key.
- Only the phone can make the AES key again: its private key is in
  IndexedDB and cannot be read out (`src/link.ts`).
- After each use, the bridge seals the token again with new keys, so a
  key that the phone sent opens nothing later. A phone that is paired
  later gets its copy at the next yes.
- A phone that pairs again gets a new key. When no paired phone can
  open the token, paste it again.

### A request

1. An agent calls `use_secret` with the reason, the `op://` reference of
   each secret, and the use: a command to run, or the fields of the page
   to fill. It can ask for some minutes.
2. The bridge shows the request as the `ask` of the agent, with the kind
   `secret`. The agent shows as waiting, and the phones get a push:
   "Waits for you: 1Password, GitHub".
3. The phone shows the card. Approve with Face ID makes the AES key and
   sends it. Deny sends no key.
4. The bridge opens the token, reads the secrets with the SDK, and seals
   the token again. The call of the agent goes on.
5. With no answer in 10 minutes, the request ends, and the agent gets
   "No answer".

### The card

It follows the approval sheet of the Canvas (`docs/canvas.md`): who asks,
the time left, a title, rows, Approve with Face ID, and Deny.

- Title: the items, such as "GitHub".
- Rows: Vault, Use (the command, or "Sign in on instagram.com"), and For
  (the minutes, or "Once").
- On a Mac, the card has "Approve with Touch ID". The window
  of Yonder has its own key, as a phone has, and the bridge asks Touch ID
  before it uses that key. The first Touch ID lets the window in, and the
  phone approves that one request. From the next yes, the token is sealed
  to the window too.

### What the agent gets

The agent gets the result, never the value.

- **Run**: the bridge runs the command in the folder of the agent, with
  the secrets in its environment (`env`) or on its input (`stdin`), as
  `op run` does. It gives back the output, with each value replaced by
  `<1Password>`.
- **Fill**: the bridge types each value into its field in the tab of
  browser-harness, with `Input.insertText`, as a login script of a CLI
  does. First it checks that the tab is still on the site of the card,
  and that the site is a website of the item.
- The bridge never gives a value to the agent by itself. But the command
  that you approve gets the value, and the mask hides only the exact
  value. So a command that prints it in another form, such as
  `printf %s "$T" | base64`, gives it to the agent. Read the Use row of
  the card, and approve only a command that you would run with the
  secret yourself. When a tool needs a key on its input, use `stdin`.

### Scope and time

- A yes is for one agent, its items, and its use: the site for a fill,
  and for a run the exact command, with the same folder, `env` and
  `stdin`. Another command asks again.
- It lasts the minutes of the request: 10 by default, 60 at most. 0
  means once. In that time the same agent runs the same command, or fills
  on the same site, with no new card. Each use goes in the log.
- The bridge knows the agent from a key in the address of its MCP server
  (`mcpUrl` in `bridge/main.ts`), not from its public ID. So a program or
  another computer that knows only the ID cannot use the yes of that
  agent.
- The values stay only in the memory of the bridge, for those minutes.
  A restart of the bridge forgets them.

### The log

Each request, answer and use is a line in
`~/.config/yonder/approvals.jsonl`: the time, the agent, the kind
`secret`, the references, the use, the answer, the device and Face ID.
Never a value. 1Password keeps its own record of the service account.

### What it protects, and what it does not

- It protects: the token at rest, so no agent reads the vault with no
  yes. Each value goes to a command or a page, not into the chat of the
  agent, its files or the logs. A fill goes only to the site of the
  item. The Personal and Private vaults stay out of reach.
- It does not protect against a hostile agent during a yes. All agents
  run as the same macOS user. A command gets its value in its
  environment, and other programs of the user can read that while it
  runs (`ps -E`). A filled field can be read from the page. An agent
  that rewrites the bridge could keep the token at the next yes.
- A yes from the Mac needs Touch ID or the password of the Mac, which
  the bridge asks itself. That is a rule of the bridge, not a lock on the
  key. The key of the window is in the IndexedDB of WebKit, as the key of
  a phone is in the IndexedDB of the phone. Code that can use that key,
  such as a script in the screen (`src/`, which updates over the air) or
  a program that reads the key files of WebKit, opens the seal with no
  yes from anyone. The key of the phone has the same weak point.
- The bridge cannot tell the window of Yonder from another program on
  127.0.0.1. So only one window gets in, with the first Touch ID, while a
  1Password card waits. When two requests ask for one card at the same
  time, both fail. To let in another window, paste the token again on
  the phone: that drops the window.
- The upgrade: a key in the Keychain with biometric access, made by the
  signed Mac app (`src-tauri/owner.m`), so that only Touch ID unlocks the
  key itself. It needs a new Mac build.
- No Face ID guards the tap. The
  protection is the phone itself, behind its passcode, and the Face ID
  lock of the app when it is on.
  A key in the Secure Enclave with Face ID comes with the native kit.

### The Canvas

The card is the kind `secret` of the approvals of the Canvas. Phase 1
of the Canvas puts it in its sheet and its list of approvals, with no
second system. The data of the card:

```json
{ "id": "a1b2c3d4", "tool": "1Password", "text": "GitHub",
  "kind": "secret", "title": "GitHub", "faceId": true, "until": 1792454000000,
  "rows": [["Vault", "Agent"], ["Use", "gh release create v1.2"], ["For", "10 min"]],
  "seals": { "<device id>": "<public key of the seal>" } }
```

## Phases

Phase 1 (built): the broker, the sealed token, `use_secret` and
`list_secrets`, the card with Face ID on the phone, the token row in
the settings, the log, and the fix that lets the phone answer Allow and
Deny (`/permission` was missing in the paths of the relay).

Found during the build:

- Claude Code drops an MCP call that sends no first byte in 60 seconds.
  The bridge answers a tool call only at its end, so the workers get the
  yonder server with a `timeout` of 30 minutes.
- A fill to a site that is not a website of the item now asks nothing:
  the bridge checks the item list of the last yes before the card, and
  the fresh list again after the read.
- A test ran the whole path with fake items: a test
  bridge, its own relay identity, a phone page in headless Chrome that
  paired through the relay, the token from the phone, a run with the
  value hidden in the output, a second run with no card, Deny, a fill
  of a username and a password into a page, and a fill to a wrong site.
  No value went into the log, `vault.json` or the output of the bridge.

Phase 2: the native sheet and Approve from the push, a key in
the Secure Enclave, 1Password Environments as a source of `env`, and the
SDK in the compiled bridge of the downloaded apps.

## The own vault of the user, from the phone

Another way uses no agents vault: an agent asks for one login, the user
approves on the phone, and that one login goes to the agent for the task.
A second question is how to send a login into an agents vault from the
phone. The research:

- **Not possible**: a yes from the phone for `op` or for the desktop
  sign-in of the SDKs. The prompt is on the Mac only (Touch ID, or an
  Apple Watch near the Mac). 1Password has no approval or delegation API.
  "1Password for Claude" and Secure Agentic Autofill also take their yes
  on the Mac, and they are for Claude Desktop and cloud browsers, not for
  the agents of Yonder.
- **Works today, no build**: the 1Password app on the iPhone moves or
  copies an item to another vault: the item, the ellipsis (…), Move or
  Duplicate, then the vault
  ([support](https://support.1password.com/move-copy-items/)). Move
  keeps one copy. The agents vault is the own vault of the user too, on all
  the devices of the user, so a moved login still fills everywhere.
- **Works today, needs a build in Yonder**: a share link from the own
  vault of the user. In the 1Password app: the item, Share, expiry 1 hour, view once,
  then the share sheet to Yonder. Yonder opens the link in headless
  Chrome on the Mac, reads the fields, and uses them for that one task,
  never in the chat of the agent. No service account. The share page
  decrypts in the browser, so a test with a real link comes first. The
  link must go to the bridge, not into the chat of an agent, because the
  link itself opens the item until it expires.
- **Later, needs a phone build**: AutoFill of a 1Password login into a
  field of Yonder, with Face ID of 1Password. In the web view of Yonder,
  iOS shows AutoFill for a password field only some of the time, so it
  needs a native field.
- **Sign in to the agents vault from the phone**: that is the token row
  in Settings, General, 1Password, one time. The token is made on
  1Password.com, which works in Safari on the phone:
  `https://start.1password.com/developer-tools/infrastructure-secrets/serviceaccount/`.

The best way: the agents vault, filled with Move in the 1Password app (3
taps for each login, one time), and a yes with Face ID in Yonder for each
use. It works also for keys and codes, and for agents that run while
the user sleeps. The share link is for a one-off login that the user does
not want to move.
