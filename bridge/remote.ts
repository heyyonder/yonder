// Yonder in the Claude app: the MCP of the bridge at a public HTTPS address, for a custom connector in Claude on the
// phone, the web or the desktop. Anthropic's servers call the connector, not the phone, so it needs a public address:
// - https://mcp.yonder.so/<id>, through the relay (handleAt). The relay passes each request to this Mac over the
//   socket that the bridge keeps open (bridge/relay.ts). The id is a hash of the token of the relay. Each Mac has it,
//   so connect gives this address. The address https://tunnel.yonder.so/<id>/mcp works too: both names reach the
//   relay, and both paths reach the MCP, so the connectors that use that address still work.
// - https://mcp-<tunnel>.yonder.so/mcp, through the Cloudflare Tunnel of Yonder Preview (handle), on a Mac
//   with bun run setup-tunnel. The first connectors used it, so it still works.
// The address is not the lock: the lock is OAuth 2.1, with this file as its authorization
// server. Claude registers itself (RFC 7591), opens /authorize, and the user types the one-time code that the
// connect_claude tool gives. When the page opens, the code also goes to the phones as a push (`told`). Then Claude gets
// a token, and each /mcp request needs it.
// Check: `bun bridge/remote.ts`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Client = { name: string; redirects: string[]; added: number };
type Token = { client: string; name: string; added: number; used?: number };
// The file keeps only the hashes of the tokens.
type Saved = { id: string; clients: Record<string, Client>; tokens: Record<string, Token> };
type Grant = { client: string; redirect: string; challenge: string; until: number };

const CODE_TIME = 5 * 60_000; // A connect code works one time, for 5 minutes.
const GRANT_TIME = 60_000; // An authorization code of OAuth works one time, for 1 minute.
const TRIES = 5; // Five wrong codes end the code, so 6 digits are enough.
const CLIENTS = 50; // Anyone can register a client, so the file keeps only the newest ones.

const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
const s256 = (text: string) => Buffer.from(new Bun.CryptoHasher("sha256").update(text).digest()).toString("base64url");
const random = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
// 12 characters of base32: 60 bits, in one DNS label.
const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b & 31]).join("");
const digits = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// A redirect of a client: HTTPS, or HTTP on this computer for a desktop app such as Claude Code.
export function okRedirect(text: unknown) {
  try {
    const url = new URL(String(text));
    return !url.hash && (url.protocol === "https:" || (url.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)));
  } catch {
    return false;
  }
}

const oauthError = (error: string, description: string, status = 400) => Response.json({ error, error_description: description }, { status });

// `suffix` is the end of each tunnel name, such as -sam.yonder.so (preview.status().suffix). `mcp` answers a request
// to the MCP of the bridge. `address` is the base of the connector on the relay, such as https://mcp.yonder.so/<id>,
// or undefined while the relay is not connected. `told` gets the open code when the page of Claude asks for it, one time
// for each code, so that the bridge sends it to the phones.
export function startRemote(
  dir: string,
  suffix: () => string | undefined,
  mcp: (req: Request) => Promise<Response>,
  address: () => string | undefined,
  told: (code: string) => void = () => {},
) {
  const file = join(dir, "remote.json");
  const state: Saved = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { id: newId(), clients: {}, tokens: {} };
  const save = () => writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
  if (!existsSync(file)) save();
  let code: { text: string; until: number; tries: number; told?: boolean } | undefined;
  const grants = new Map<string, Grant>();
  const host = () => {
    const s = suffix();
    return s ? `mcp-${state.id}${s}`.toLowerCase() : undefined;
  };

  const check = (text: string | null) => {
    if (!code || code.until < Date.now()) return false;
    if ((text ?? "").replace(/\D/g, "") === code.text) return (code = undefined), true;
    if (++code.tries >= TRIES) code = undefined;
    return false;
  };

  // The page that asks for the code. The fields of the request go with the form, so a wrong code can show it again.
  const form = (q: URLSearchParams, client: Client, error = "") => {
    const keep = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"];
    const hidden = keep.filter((k) => q.has(k)).map((k) => `<input type="hidden" name="${k}" value="${escape(q.get(k)!)}">`).join("");
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to Yonder</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--dim:#777;--line:#ccc;--field:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#000;--fg:#eee;--dim:#888;--line:#333;--field:#1c1c1e}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:17px -apple-system,system-ui,sans-serif}
form{width:min(320px,calc(100vw - 32px));display:grid;gap:14px;text-align:center}
h1{font-size:22px;margin:0}p{margin:0;color:var(--dim)}.error{color:#e5484d}
input{box-sizing:border-box;width:100%;min-width:0;font:inherit;font-size:30px;letter-spacing:.25em;text-align:center;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--field);color:var(--fg)}
button{font:inherit;font-weight:600;padding:14px;border:0;border-radius:12px;background:var(--fg);color:var(--bg)}
</style>
<form method="post">
<h1>Connect ${escape(client.name)} to Yonder</h1>
<p>Ask Yonder for the code.</p>
${error && `<p class="error">${escape(error)}</p>`}
<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required autofocus aria-label="Code">
${hidden}<button>Connect</button>
<p>Then you go back to ${escape(new URL(q.get("redirect_uri")!).host)}.</p>
</form></html>`;
    return new Response(html, {
      status: error ? 400 : 200,
      headers: { "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" },
    });
  };
  const page = (status: number, text: string) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

  // `origin` and `base` give the address of the connector: https://mcp-...yonder.so with no base, or
  // https://mcp.yonder.so with the base /<id>. `p` is the path after the base: "" for the MCP at /<id>, or /mcp for the
  // old address /<id>/mcp. A well-known path of OAuth has the base after the kind (RFC 8414 and RFC 9728), such as
  // /.well-known/oauth-protected-resource/<id>, and the resource of its answer is the address that the client uses.
  async function route(req: Request, url: URL, origin: string, base: string, p: string) {
    const me = origin + base;
    if (p === "/mcp" || p === "") {
      const bearer = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i)?.[1];
      const token = bearer ? state.tokens[hash(bearer)] : undefined;
      if (!token)
        return new Response(JSON.stringify({ error: "invalid_token" }), {
          status: 401,
          headers: { "content-type": "application/json", "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource${base}${p}"` },
        });
      // The last use, at most one write each hour.
      if (Date.now() - (token.used ?? 0) > 3_600_000) (token.used = Date.now()), save();
      return mcp(req);
    }
    if (p === "/.well-known/oauth-protected-resource" || p === "/.well-known/oauth-protected-resource/mcp")
      return Response.json({ resource: base && !p.endsWith("/mcp") ? me : `${me}/mcp`, authorization_servers: [me], bearer_methods_supported: ["header"] });
    if (p === "/.well-known/oauth-authorization-server" || p === "/.well-known/openid-configuration")
      return Response.json({
        issuer: me,
        authorization_endpoint: `${me}/authorize`,
        token_endpoint: `${me}/token`,
        registration_endpoint: `${me}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
    if (p === "/register" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const asked: unknown[] = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
      if (!asked.length || !asked.every(okRedirect)) return oauthError("invalid_redirect_uri", "Each redirect_uri must be https, or http on localhost.");
      const id = random();
      const client = { name: String(body.client_name ?? "").slice(0, 60) || "an app", redirects: asked.map(String), added: Date.now() };
      state.clients[id] = client;
      // A client with a token stays. The oldest of the others go.
      const used = new Set(Object.values(state.tokens).map((t) => t.client));
      const old = Object.entries(state.clients).filter(([k]) => !used.has(k)).sort((a, b) => b[1].added - a[1].added).slice(CLIENTS);
      for (const [k] of old) delete state.clients[k];
      save();
      return Response.json(
        { client_id: id, client_name: client.name, redirect_uris: client.redirects, token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] },
        { status: 201 },
      );
    }
    if (p === "/authorize" && (req.method === "GET" || req.method === "POST")) {
      const q = req.method === "POST" ? new URLSearchParams(await req.text()) : url.searchParams;
      const client = state.clients[q.get("client_id") ?? ""];
      const redirect = q.get("redirect_uri") ?? "";
      // With no known client and redirect, the error cannot go back to the app (RFC 6749, 4.1.2.1).
      if (!client || !client.redirects.includes(redirect)) return page(400, "Yonder does not know this app. Remove the connector in Claude, and add it again.");
      const back = (params: Record<string, string>) => {
        const to = new URL(redirect);
        for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
        if (q.get("state")) to.searchParams.set("state", q.get("state")!);
        to.searchParams.set("iss", me);
        return new Response(null, { status: 302, headers: { location: to.href } });
      };
      if (q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge"))
        return back({ error: "invalid_request", error_description: "Yonder needs response_type=code and PKCE with S256." });
      if (req.method === "GET") {
        // Only a tap or a call in Yonder makes a code, so a stranger who opens the page only sends it to the phones.
        if (code && code.until > Date.now() && !code.told) (code.told = true), told(code.text);
        return form(q, client);
      }
      if (!check(q.get("code"))) return form(q, client, "The code is wrong or old. Ask Yonder for a new code.");
      const grant = random();
      grants.set(grant, { client: q.get("client_id")!, redirect, challenge: q.get("code_challenge")!, until: Date.now() + GRANT_TIME });
      return back({ code: grant });
    }
    if (p === "/token" && req.method === "POST") {
      const q = new URLSearchParams(await req.text());
      if (q.get("grant_type") !== "authorization_code") return oauthError("unsupported_grant_type", "Yonder gives tokens only for an authorization code.");
      const g = grants.get(q.get("code") ?? "");
      grants.delete(q.get("code") ?? "");
      const id = q.get("client_id");
      if (!g || g.until < Date.now() || (id && id !== g.client) || g.redirect !== q.get("redirect_uri") || s256(q.get("code_verifier") ?? "") !== g.challenge)
        return oauthError("invalid_grant", "The code is wrong, used or old.");
      const token = random();
      // shortcut: the token does not expire, and the user ends it with connect_claude (revoke). Add expires_in and
      // refresh tokens if a token must end by itself.
      state.tokens[hash(token)] = { client: g.client, name: state.clients[g.client]?.name ?? "an app", added: Date.now() };
      save();
      return Response.json({ access_token: token, token_type: "Bearer" });
    }
    // Shows which path of the discovery a client asked for and did not get.
    console.log(`Yonder connector: 404 for ${req.method} ${url.pathname}`);
    return page(404, "Not found");
  }

  function where() {
    const at = address();
    if (!at) throw new Error("Yonder is not connected to its relay, and the connector goes through it. Check the network of this computer, then try again.");
    return { url: at, connected: Object.values(state.tokens).map((t) => t.name) };
  }

  async function answer(req: Request, url: URL, origin: string, base: string, p: string) {
    const res = await route(req, url, origin, base, p).catch((e) => oauthError("server_error", (e as Error).message, 500));
    // Cloudflare and the relay must never keep an answer of the connector.
    const headers = new Headers(res.headers);
    headers.set("cache-control", "no-store");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }

  return {
    host,
    // The answer for a request to the name of the connector, or undefined for another name.
    async handle(req: Request) {
      const url = new URL(req.url);
      if (!host() || url.hostname.toLowerCase() !== host()) return;
      return answer(req, url, `https://${host()}`, "", url.pathname);
    },
    // A request from the relay for the connector `id`: /<id>/mcp, /<id>/authorize, or a well-known path with the id.
    handleAt(req: Request, id: string) {
      const url = new URL(req.url);
      const base = `/${id}`;
      const known = url.pathname.match(/^\/\.well-known\/([\w-]+)(\/.*)?$/);
      const p = url.pathname === base || url.pathname.startsWith(`${base}/`)
        ? url.pathname.slice(base.length)
        : known && (known[2] === base || known[2]?.startsWith(`${base}/`))
          ? `/.well-known/${known[1]}${known[2].slice(base.length)}`
          : undefined;
      return p !== undefined ? answer(req, url, url.origin, base, p) : Promise.resolve(page(404, "Not found"));
    },
    // The address of the connector and the connected apps, with no new code. The address never changes.
    address: where,
    // The address, and a new code for the page of Claude. It replaces the code before it.
    connect() {
      const at = where();
      code = { text: digits(), until: Date.now() + CODE_TIME, tries: 0 };
      return { ...at, code: code.text, minutes: CODE_TIME / 60_000 };
    },
    // Ends each token and client. Each Claude app then must connect again with a new code.
    revoke() {
      const ended = Object.keys(state.tokens).length;
      state.tokens = {};
      state.clients = {};
      code = undefined;
      save();
      return { revoked: ended };
    },
  };
}

if (import.meta.main) {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  const dir = mkdtempSync(join(tmpdir(), "yonder-remote-"));
  try {
    const id = "abcdefghijk-mnopqrstu_w";
    const at = `https://tunnel.yonder.test/${id}`;
    const told: string[] = [];
    const remote = startRemote(dir, () => "-sam.yonder.test", async () => Response.json({ mcp: true }), () => at, (c) => told.push(c));
    const me = `https://${remote.host()}`;
    const call = (path: string, init?: RequestInit) => remote.handle(new Request(`http://${remote.host()}${path}`, init)) as Promise<Response>;
    const form = (o: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });

    assert(/^mcp-[a-z2-7]{12}-sam\.yonder\.test$/.test(remote.host()!), "the name has a random part");
    assert((await remote.handle(new Request("http://other-sam.yonder.test/mcp"))) === undefined, "another name is not the connector");
    const none = await call("/mcp", { method: "POST" });
    assert(none.status === 401 && none.headers.get("www-authenticate")?.includes(`${me}/.well-known/oauth-protected-resource/mcp`), "no token: 401 that names the metadata");
    assert(none.headers.get("cache-control") === "no-store", "Cloudflare keeps no answer");
    const meta = await (await call("/.well-known/oauth-authorization-server")).json();
    assert(meta.registration_endpoint === `${me}/register` && meta.code_challenge_methods_supported[0] === "S256", "the metadata of the authorization server");
    assert((await (await call("/.well-known/oauth-protected-resource/mcp")).json()).authorization_servers[0] === me, "the metadata of the resource");

    const bad = await call("/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) });
    assert(bad.status === 400, "a plain http redirect is refused");
    const redirect = "https://claude.ai/api/mcp/auth_callback";
    const reg = await (await call("/register", { method: "POST", body: JSON.stringify({ redirect_uris: [redirect], client_name: "Claude" }) })).json();
    assert(reg.client_id, "registers a client");

    const verifier = random();
    const auth = { response_type: "code", client_id: reg.client_id, redirect_uri: redirect, code_challenge: s256(verifier), code_challenge_method: "S256", state: "xyz" };
    const shown = await call(`/authorize?${new URLSearchParams(auth)}`);
    const html = await shown.text();
    assert(shown.status === 200 && html.includes("Connect Claude to Yonder") && html.includes("back to claude.ai."), "shows the page for the code, with the host of the redirect");
    assert((await call(`/authorize?${new URLSearchParams({ ...auth, redirect_uri: "https://evil.example/cb" })}`)).status === 400, "an unknown redirect gets no redirect");
    assert((await call("/authorize", form({ ...auth, code: "123456" }))).status === 400, "no code is open: refused");

    assert(told.length === 0, "with no open code, the page sends nothing to the phones");

    const { code, url } = remote.connect();
    assert(url === at && /^\d{6}$/.test(code), "connect gives the address on the relay, with no /mcp, and 6 digits");
    await call(`/authorize?${new URLSearchParams(auth)}`);
    await call(`/authorize?${new URLSearchParams(auth)}`);
    assert(told.join() === code, "the page sends the open code to the phones, one time");
    assert(remote.address().url === url && !("code" in remote.address()), "address gives the address with no new code");
    const wrong = code === "000000" ? "111111" : "000000";
    assert((await call("/authorize", form({ ...auth, code: wrong }))).status === 400, "a wrong code is refused");
    const ok = await call("/authorize", form({ ...auth, code: `${code.slice(0, 3)} ${code.slice(3)}` }));
    const to = new URL(ok.headers.get("location") ?? "about:blank");
    assert(ok.status === 302 && to.origin + to.pathname === redirect && to.searchParams.get("state") === "xyz", "the right code goes back to Claude");
    assert((await call("/authorize", form({ ...auth, code }))).status === 400, "a code works one time");

    const grant = to.searchParams.get("code")!;
    const tokenOf = (o: Record<string, string>) => call("/token", form({ grant_type: "authorization_code", code: grant, client_id: reg.client_id, redirect_uri: redirect, ...o }));
    assert((await tokenOf({ code_verifier: "wrong" })).status === 400, "a wrong PKCE verifier is refused");
    // The wrong try used the grant, so a new one.
    const again = remote.connect();
    const ok2 = await call("/authorize", form({ ...auth, code: again.code }));
    const grant2 = new URL(ok2.headers.get("location")!).searchParams.get("code")!;
    const tok = await (await call("/token", form({ grant_type: "authorization_code", code: grant2, client_id: reg.client_id, redirect_uri: redirect, code_verifier: verifier }))).json();
    assert(tok.access_token && tok.token_type === "Bearer", "gives a token");
    const res = await call("/mcp", { method: "POST", headers: { authorization: `Bearer ${tok.access_token}` } });
    assert(res.status === 200 && (await res.json()).mcp, "the token opens the MCP");
    assert(!readFileSync(join(dir, "remote.json"), "utf8").includes(tok.access_token), "the file keeps no token");
    assert(remote.connect().connected[0] === "Claude", "connect names the connected apps");

    // The same connector through the relay, at the old address https://tunnel.yonder.test/<id>/mcp.
    const relayed = (path: string, init?: RequestInit) => remote.handleAt(new Request(`https://tunnel.yonder.test${path}`, init), id);
    const r401 = await relayed(`/${id}/mcp`, { method: "POST" });
    assert(r401.status === 401 && r401.headers.get("www-authenticate")?.includes(`https://tunnel.yonder.test/.well-known/oauth-protected-resource/${id}/mcp`), "relay: 401 names the metadata with the id after the kind");
    const prm = await (await relayed(`/.well-known/oauth-protected-resource/${id}/mcp`)).json();
    assert(prm.resource === `${at}/mcp` && prm.authorization_servers[0] === at, "relay: the metadata of the resource");
    for (const path of [`/.well-known/oauth-authorization-server/${id}`, `/.well-known/openid-configuration/${id}`, `/${id}/.well-known/oauth-authorization-server`, `/${id}/.well-known/openid-configuration`]) {
      const m = await (await relayed(path)).json();
      assert(m.issuer === at && m.authorization_endpoint === `${at}/authorize` && m.registration_endpoint === `${at}/register`, `relay: the metadata of the authorization server at ${path.replace(id, "<id>")}`);
    }
    assert((await relayed("/.well-known/oauth-authorization-server")).status === 404, "relay: no metadata with no id");
    assert((await relayed(`/${id}x/mcp`)).status === 404, "relay: another id is not this connector");
    assert((await relayed(`/${id}/mcp`, { method: "POST", headers: { authorization: `Bearer ${tok.access_token}` } })).status === 200, "relay: a token from the tunnel works through the relay");
    const regR = await (await relayed(`/${id}/register`, { method: "POST", body: JSON.stringify({ redirect_uris: [redirect], client_name: "Claude" }) })).json();
    const authR = { ...auth, client_id: regR.client_id };
    assert((await (await relayed(`/${id}/authorize?${new URLSearchParams(authR)}`)).text()).includes("Connect Claude to Yonder"), "relay: shows the page for the code");
    const okR = await relayed(`/${id}/authorize`, form({ ...authR, code: remote.connect().code }));
    const toR = new URL(okR.headers.get("location")!);
    assert(okR.status === 302 && toR.searchParams.get("iss") === at, "relay: the right code goes back to Claude with the issuer on the relay");
    const tokR = await (await relayed(`/${id}/token`, form({ grant_type: "authorization_code", code: toR.searchParams.get("code")!, client_id: regR.client_id, redirect_uri: redirect, code_verifier: verifier }))).json();
    assert((await relayed(`/${id}/mcp`, { method: "POST", headers: { authorization: `Bearer ${tokR.access_token}` } })).status === 200, "relay: the token opens the MCP");
    assert(okR.headers.get("cache-control") === "no-store", "relay: no answer is kept");

    // The address of today, <relay>/<id>, with no /mcp at the end. The relay does not look at the name.
    const n401 = await relayed(`/${id}`, { method: "POST" });
    assert(n401.status === 401 && n401.headers.get("www-authenticate")?.endsWith(`/.well-known/oauth-protected-resource/${id}"`), "relay: the address with no /mcp gets a 401 that names its metadata");
    assert((await (await relayed(`/.well-known/oauth-protected-resource/${id}`)).json()).resource === at, "relay: the metadata of the address with no /mcp names that address");
    assert((await relayed(`/${id}`, { method: "POST", headers: { authorization: `Bearer ${tok.access_token}` } })).status === 200, "relay: a token of the old address opens the MCP at the new address");

    // The client of the MCP SDK, as Claude Code and other clients use it, with a redirect on localhost, through the relay:
    // the address of today, and the old one of the connectors that use it.
    const { auth: sdkAuth } = await import("@modelcontextprotocol/sdk/client/auth.js");
    const fetchFn = (u: string | URL, init?: RequestInit) => relayed(new URL(String(u)).pathname + new URL(String(u)).search, init);
    const callback = "http://localhost:53682/callback";
    for (const [serverUrl, mcpPath, what] of [[at, `/${id}`, "the address"], [`${at}/mcp`, `/${id}/mcp`, "the old address"]]) {
      const cc: { client?: any; tokens?: any; verifier?: string; opened?: URL } = {};
      const provider = {
        redirectUrl: callback,
        clientMetadata: { client_name: "Claude Code", redirect_uris: [callback], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" },
        clientInformation: () => cc.client,
        saveClientInformation: (c: unknown) => void (cc.client = c),
        tokens: () => cc.tokens,
        saveTokens: (t: unknown) => void (cc.tokens = t),
        redirectToAuthorization: (u: URL) => void (cc.opened = u),
        saveCodeVerifier: (v: string) => void (cc.verifier = v),
        codeVerifier: () => cc.verifier!,
      };
      assert((await sdkAuth(provider, { serverUrl, fetchFn })) === "REDIRECT" && cc.opened?.href.startsWith(`${at}/authorize`), `SDK, ${what}: finds the connector and opens the page for the code`);
      const ccBack = await relayed(cc.opened!.pathname, form({ ...Object.fromEntries(cc.opened!.searchParams), code: remote.connect().code }));
      const ccCode = new URL(ccBack.headers.get("location")!).searchParams.get("code")!;
      assert((await sdkAuth(provider, { serverUrl, authorizationCode: ccCode, fetchFn })) === "AUTHORIZED", `SDK, ${what}: gets a token`);
      assert((await relayed(mcpPath, { method: "POST", headers: { authorization: `Bearer ${cc.tokens.access_token}` } })).status === 200, `SDK, ${what}: the token opens the MCP`);
    }

    remote.revoke();
    assert((await call("/mcp", { method: "POST", headers: { authorization: `Bearer ${tok.access_token}` } })).status === 401, "revoke ends the token");
    // Revoke also ends the clients, so a new one.
    const reg2 = await (await call("/register", { method: "POST", body: JSON.stringify({ redirect_uris: [redirect], client_name: "Claude" }) })).json();
    const auth2 = { ...auth, client_id: reg2.client_id };
    const brute = remote.connect();
    for (let i = 0; i < TRIES; i++) assert((await call("/authorize", form({ ...auth2, code: "x" }))).status === 400, `wrong code ${i + 1}`);
    const late = await call("/authorize", form({ ...auth2, code: brute.code }));
    assert(late.status === 400 && (await late.text()).includes("wrong or old"), "five wrong codes end the code");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
