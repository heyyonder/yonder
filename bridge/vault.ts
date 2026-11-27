// The secrets of agents from 1Password, with a yes on the phone (docs/secrets.md). The bridge keeps the token of a
// 1Password service account only sealed to the key of each paired phone. A yes on the phone sends the key that opens it
// for one request, and after the read the bridge seals it again with new keys, so that key opens nothing later. An agent
// gets the use of a secret, a command that runs with it or a field that it fills, never the value. So no `op` prompt
// needs the user at the Mac.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { b64, rawKey, unb64, vaultKey } from "../src/link";
import { deviceId } from "./relay";

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
type Bytes = Uint8Array<ArrayBuffer>;
// One sealed copy of the token: the public key of the seal, the nonce and the cipher text.
type Seal = { epub: string; iv: string; ct: string };
// An item that agents can ask for, with no value. list_secrets gives them, and a fill checks the site of its item.
export type Item = { id: string; vault: string; title: string; category: string; sites: string[] };
// vault.json: the sealed copies by the public key of each phone and each Mac window, the items, and the public keys of the
// Mac windows that Touch ID let in (`macs`). Never the token itself.
type Store = { seals: Record<string, Seal>; items: Item[]; macs?: string[]; at: number };
type Resolved = Record<string, { secret?: string; itemId?: string; error?: string }>;
type Reader = { items(): Promise<Item[]>; resolve(refs: string[]): Promise<Resolved> };
// The secrets of a yes: the value and the websites of its item, by reference.
export type Values = Map<string, { value: string; sites: string[] }>;

const RECENT = 3 * 86_400_000;
// A reference names the vault, the item (its title or its ID) and the field: op://Agent/GitHub/token.
export const REF = /^op:\/\/[^/?]+\/[^/?]+\/[^?]+(\?.*)?$/;
export const itemOf = (ref: string) => ref.slice(5).split("/")[1];
// The item of a reference in the list of the last yes, by its title or its ID, for the card and the check of a site.
export const itemIn = (ref: string, items: Item[]) => {
  const [vault, item] = ref.slice(5).split("/");
  return items.find((i) => i.vault === vault && (i.title === item || i.id === item));
};

// The 1Password SDK, with the token in memory: `op` takes it only in its environment, and `ps -E` shows the environment of
// a running `op` to each program of the user. The SDK loads only when a token opens.
// shortcut: the compiled bridge of a downloaded app cannot load it, because the SDK reads its WASM file from
// node_modules. Embed core_bg.wasm with `with { type: "file" }` when other users need it.
async function reader(token: string): Promise<Reader> {
  // The checks use made-up items, with no 1Password: { items: [{ vault, title, category, sites, fields: { name: value } }] }.
  const fake = process.env.YONDER_VAULT_FAKE;
  if (fake) {
    if (!token.startsWith("ops_")) throw new Error("This is not a token of a service account.");
    const items = (JSON.parse(fake).items as (Item & { fields: Record<string, string> })[]).map((i, n) => ({ ...i, id: `i${n}` }));
    return {
      items: async () => items,
      resolve: async (refs) =>
        Object.fromEntries(refs.map((ref) => {
          const [vault, title, ...rest] = ref.slice(5).split("?")[0].split("/");
          const item = items.find((i) => i.vault === vault && i.title === title);
          const secret = item?.fields[rest.at(-1) ?? ""];
          return [ref, secret === undefined ? { error: `${ref} is not in 1Password.` } : { secret, itemId: item!.id }];
        })),
    };
  }
  const sdk = await import("@1password/sdk").catch(() => {
    throw new Error("This bridge cannot load the 1Password SDK. Run the bridge from its source, after bun install.");
  });
  const client = await sdk.createClient({ auth: token, integrationName: "Yonder", integrationVersion: "1" });
  return {
    async items() {
      const out: Item[] = [];
      for (const v of await client.vaults.list())
        for (const i of await client.items.list(v.id)) out.push({ id: i.id, vault: v.title, title: i.title, category: String(i.category), sites: i.websites.map((w) => w.url) });
      return out;
    },
    async resolve(refs) {
      const all = (await client.secrets.resolveAll(refs)).individualResponses;
      return Object.fromEntries(refs.map((ref) => {
        const r = all[ref];
        return [ref, r?.content ? { secret: r.content.secret, itemId: r.content.itemId } : { error: `${ref}: ${r?.error?.type ?? "not found"}` }];
      }));
    },
  };
}

async function seal(token: string, phone: string): Promise<Seal> {
  const eph = (await crypto.subtle.generateKey(ECDH, false, ["deriveBits"])) as CryptoKeyPair;
  const epub = await rawKey(eph.publicKey);
  const pub = unb64(phone);
  const key = await crypto.subtle.importKey("raw", await vaultKey(eph.privateKey, pub, epub, pub), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token)));
  return { epub: b64(epub), iv: b64(iv), ct: b64(ct) };
}

async function open(s: Seal, key: Bytes) {
  const k = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(s.iv) }, k, unb64(s.ct)));
}

// Replaces each value in the output of a command with <1Password>, as `op run` does. A value of 1 or 2 characters stays,
// or it would hide ordinary text.
export const mask = (text: string, values: string[]) =>
  values.filter((v) => v.length > 2).sort((a, b) => b.length - a.length).reduce((t, v) => t.split(v).join("<1Password>"), text);

const host = (url: string) => {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
// A fill goes only to a website of its item, or to a subdomain of one, as the autofill of 1Password does. An item with
// no website has nothing to check, and the card shows the site.
export const siteFits = (site: string, sites: string[]) =>
  !sites.length || sites.some((s) => !!host(s) && (host(site) === host(s) || host(site).endsWith(`.${host(s)}`)));

export function startVault(dir: string) {
  const file = join(dir, "vault.json");
  const load = (): Store | undefined => {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as Store;
    } catch {}
  };
  // The paired phones: their public keys in relay.json, which bridge/relay.ts keeps. `recent`: only the phones that
  // connected in the last 3 days. A new seal goes only to those and to the phone that says yes: relay.json can hold
  // old pairings of the same iPhone or of a test in headless Chrome, whose key can still lie in a profile on this Mac. A phone keeps its seal until the next yes.
  const phones = (recent = false): string[] => {
    try {
      const all = JSON.parse(readFileSync(join(dir, "relay.json"), "utf8")).phones as { pub: string; seen?: number }[];
      return all.filter((p) => !recent || Date.now() - (p.seen ?? 0) < RECENT).map((p) => p.pub);
    } catch {
      return [];
    }
  };
  // The Mac windows that can approve with Touch ID: the key of each lives in the window of Yonder, as the key of a phone.
  const macs = () => load()?.macs ?? [];
  const keys = () => [...phones(), ...macs()];
  // Reads with an open token, then seals it again for each paired phone: new keys, and a copy for a phone that paired
  // since the last yes. A token that a seal opened gets new seals also when the read fails, so the key of the phone
  // never opens a seal twice. A new token from the phone gets seals only when it reads. The token goes out of scope at
  // the end.
  async function withToken<T>(token: string, opened: boolean, read: (r: Reader, items: Item[]) => Promise<T>, approver?: string) {
    let items: Item[] | undefined;
    let ok = false;
    try {
      const r = await reader(token);
      items = await r.items();
      const out = await read(r, items);
      ok = true;
      return out;
    } finally {
      if (ok || opened) {
        // A new token from the phone (connect) drops the Mac windows: pasting it again on the phone is the reset of trust. A
        // yes from a Mac window keeps the seals of the phones, so a phone that did not connect for 3 days can still approve.
        const ms = opened ? macs() : [];
        const kept = ms.includes(approver ?? "") ? phones().filter((p) => load()?.seals[p]) : [];
        const to = [...new Set([...phones(true), ...kept, ...ms, ...(approver ? [approver] : [])])];
        const seals = Object.fromEntries(await Promise.all(to.map(async (p) => [p, await seal(token, p)] as const)));
        // Only these fields, never the rest of an item. The ID lets a reference name an item whose title is not unique.
        const list = items?.map(({ id, vault, title, category, sites }) => ({ id, vault, title, category, sites })) ?? load()?.items ?? [];
        writeFileSync(file, JSON.stringify({ seals, items: list, macs: ms, at: Date.now() } satisfies Store, null, 2), { mode: 0o600 });
      }
    }
  }

  // The yeses that last some minutes: one agent, its references and its use. The values stay only in this memory, and
  // go when the time ends. A restart of the bridge forgets them.
  type Grant = { worker: string; refs: string[]; use: string; site?: string; until: number; values: Values };
  let grants: Grant[] = [];

  return {
    status() {
      const s = load();
      const ps = keys();
      return { connected: !!s && ps.some((p) => s.seals[p]), vaults: [...new Set(s?.items.map((i) => i.vault))], items: s?.items.length ?? 0 };
    },
    items: () => load()?.items ?? [],
    // The public key of the seal for each phone and Mac window that has one, by its device id (`x-yonder-device` of a phone).
    seals: () => Object.fromEntries(Object.entries(load()?.seals ?? {}).filter(([p]) => keys().includes(p)).map(([p, s]) => [deviceId(p), s.epub])),
    isMac: (pub: string) => macs().includes(pub),
    macReady: () => macs().some((m) => load()?.seals[m]),
    // A Mac window after Touch ID: it gets its seal at the next yes, which only a phone can give until then. Only one window
    // gets in, so a program that also asks later finds the place taken. A new token from the phone empties the place.
    // shortcut: the bridge cannot tell the window of Yonder from another program on 127.0.0.1, so the first Touch ID lets in
    // whoever asked. Upgrade: a key in the Keychain with biometric access, made by the signed app (src-tauri/owner.m).
    addMac(pub: string) {
      const s = load();
      if (!s || macs().length) return false;
      writeFileSync(file, JSON.stringify({ ...s, macs: [pub] } satisfies Store, null, 2), { mode: 0o600 });
      return true;
    },
    macFree: () => !!load() && !macs().length,
    // The token from the phone: a check that it reads, and the first seals. It is never in a file.
    async connect(token: string) {
      if (!phones(true).length) throw new Error("Open Yonder on the phone first: only a paired phone that connected in the last 3 days gets a key.");
      await withToken(token.trim(), false, async () => {});
    },
    // A yes: the key from the phone opens its seal, and the bridge reads the references.
    async read(device: string, key: Bytes, refs: string[]): Promise<Values> {
      const phone = keys().find((p) => deviceId(p) === device);
      const sealed = phone && load()?.seals[phone];
      if (!sealed) throw new Error("This phone has no key for 1Password. Paste the token again in the settings of the phone.");
      const token = await open(sealed, key).catch(() => {
        throw new Error("The key from the phone did not open the token.");
      });
      return withToken(token, true, async (r, items) => {
        const got = await r.resolve(refs);
        const failed = refs.map((ref) => got[ref]?.error).filter(Boolean);
        if (failed.length) throw new Error(failed.join(" "));
        return new Map(refs.map((ref) => [ref, { value: got[ref].secret!, sites: items.find((i) => i.id === got[ref].itemId)?.sites ?? [] }]));
      }, phone);
    },
    find(worker: string, refs: string[], use: string, site?: string) {
      grants = grants.filter((g) => g.until > Date.now());
      return grants.find((g) => g.worker === worker && g.use === use && g.site === site && refs.every((r) => g.refs.includes(r)))?.values;
    },
    keep(grant: Grant) {
      grants.push(grant);
      setTimeout(() => (grants = grants.filter((g) => g !== grant)), grant.until - Date.now());
    },
    // One line for each request, answer and use, in the log of the approvals of the Canvas (docs/canvas.md). Never a value.
    log: (entry: Record<string, unknown>) => appendFileSync(join(dir, "approvals.jsonl"), JSON.stringify({ at: Date.now(), kind: "secret", ...entry }) + "\n", { mode: 0o600 }),
  };
}

// The tab of browser-harness: its site, or a fill of the values into the fields of the page with Input.insertText, as
// `instagram auth login` does. The values go in the script on standard input, never in an argument or the environment.
const TAB = `
import base64, json
a = json.loads(base64.b64decode("__ARGS__"))
try:
    site = js("location.origin")
    if "fill" not in a:
        out = {"site": site, "title": current_tab()["title"].removeprefix("\\U0001F434 ")}
    elif site != a["site"]:
        out = {"error": "The tab left " + a["site"] + ". Open the sign-in page again, then ask again."}
    else:
        for sel, value in a["fill"]:
            if not js("(() => { const e = document.querySelector(" + json.dumps(sel) + "); if (!e) return false; e.focus(); e.select?.(); return true })()"):
                raise RuntimeError("No field on the page matches " + sel + ".")
            cdp("Input.insertText", text=value)
        out = {"filled": len(a["fill"]), "site": site}
except Exception as e:
    out = {"error": str(e)}
print(json.dumps(out))
`;
export async function inTab(harness: string, args: { site?: string; fill?: [string, string][] }): Promise<{ site?: string; title?: string; filled?: number }> {
  const values = args.fill?.map(([, v]) => v) ?? [];
  const run = Bun.spawn([harness], {
    stdin: new TextEncoder().encode(TAB.replace("__ARGS__", Buffer.from(JSON.stringify(args)).toString("base64"))),
    stdout: "pipe",
    stderr: "pipe",
    // Telemetry and recordings off, so the trace of the helper calls of browser-harness keeps no value.
    env: { ...process.env, BH_TELEMETRY: "0", BH_RECORD: "0" },
    timeout: 30_000,
  });
  const out = (await new Response(run.stdout).text()).trim().split("\n").pop() ?? "";
  await run.exited;
  let result: { error?: string; site?: string; title?: string; filled?: number };
  try {
    result = JSON.parse(out);
  } catch {
    // A failed script prints its own lines, and the first line of the script holds the values, so no output goes back.
    throw new Error("browser-harness did not answer. Check that Chrome runs and that the tab of the agent is open.");
  }
  if (result.error) throw new Error(mask(`browser-harness: ${result.error}`, values));
  return result;
}

// Runs a command with the secrets in its environment or on its input, as `op run` does, and gives back its output with
// each value hidden. The command runs in the folder of the agent.
export async function runWith(command: string, cwd: string, env: Record<string, string>, stdin: string | undefined, values: string[]) {
  const shell = process.platform === "win32" ? ["powershell", "-NoProfile", "-Command", command] : [process.env.SHELL || "/bin/sh", "-c", command];
  const p = Bun.spawn(shell, {
    cwd,
    env: { ...process.env, ...env },
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10 * 60_000,
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  const text = mask([out.trimEnd(), err.trimEnd()].filter(Boolean).join("\n"), values);
  return { exit: code, output: text.length > 20_000 ? `…${text.slice(-20_000)}` : text };
}

if (import.meta.main) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { newKeys } = await import("../src/link");
  const dir = mkdtempSync(join(tmpdir(), "yonder-vault-"));
  process.env.YONDER_VAULT_FAKE = JSON.stringify({ items: [{ vault: "Agent", title: "GitHub", category: "ApiCredentials", sites: [], fields: { token: "ghp_SECRET123" } },
    { vault: "Agent", title: "Instagram", category: "Login", sites: ["https://www.instagram.com"], fields: { password: "hunter22" } }] });
  try {
    // A phone with a non-extractable key, as src/link.ts makes it, paired in relay.json.
    const phone = await newKeys();
    const pub = b64(await rawKey(phone.publicKey));
    const old = b64(await rawKey((await newKeys()).publicKey));
    writeFileSync(join(dir, "relay.json"), JSON.stringify({ phones: [{ pub, seen: Date.now() }, { pub: old, seen: Date.now() - 30 * 86_400_000 }] }));
    const v = startVault(dir);
    assert(!v.status().connected, "no token: not connected");
    await v.connect("ops_FAKE");
    const stored = readFileSync(join(dir, "vault.json"), "utf8");
    assert(v.status().connected && v.status().items === 2 && !stored.includes("ops_FAKE") && !stored.includes("hunter22"), "connect seals the token for the phone and keeps no token or value");
    assert(Object.keys(v.seals()).join() === deviceId(pub), "a pairing that did not connect in the last 3 days gets no seal");
    assert(itemIn("op://Agent/i1/password", v.items())?.title === "Instagram" && itemIn("op://Agent/GitHub/token", v.items())?.id === "i0", "a reference finds its item by title or by ID");
    // The phone makes the key from the public key of its seal.
    const keyFor = async () => {
      const epub = unb64(v.seals()[deviceId(pub)]);
      return vaultKey(phone.privateKey, epub, epub, unb64(pub));
    };
    const key = await keyFor();
    const got = await v.read(deviceId(pub), key, ["op://Agent/GitHub/token"]);
    assert(got.get("op://Agent/GitHub/token")?.value === "ghp_SECRET123", "the key of the phone opens the token, and the bridge reads the reference");
    assert(await v.read(deviceId(pub), key, ["op://Agent/GitHub/token"]).then(() => false, () => true), "a key that was used opens nothing, because the token is sealed again");
    assert(await v.read(deviceId(pub), crypto.getRandomValues(new Uint8Array(32)), ["op://Agent/GitHub/token"]).then(() => false, () => true), "a made-up key opens nothing");
    const used = await keyFor();
    assert(await v.read(deviceId(pub), used, ["op://Agent/GitHub/nothing"]).then(() => false, (e) => /not in 1Password/.test(e.message)), "a reference that is not there fails");
    assert(await v.read(deviceId(pub), used, ["op://Agent/GitHub/token"]).then(() => false, () => true), "a failed read seals the token again too");
    assert(await startVault(dir).connect("not a token").then(() => false, () => v.status().connected), "a bad token from the phone keeps the seals of the good one");
    const run = await runWith('printf "%s|" "$T"; cat', dir, { T: "ghp_SECRET123" }, "hunter22", ["ghp_SECRET123", "hunter22"]);
    assert(run.exit === 0 && run.output === "<1Password>|<1Password>", "run puts the values in the environment and the input, and hides them in the output");
    assert(siteFits("https://instagram.com", ["https://www.instagram.com"]) && siteFits("https://m.instagram.com", ["instagram.com"]) && !siteFits("https://instagram.com.evil.io", ["instagram.com"]), "a fill fits only the site of its item");
    // The phone was last seen 5 days ago, so a connect gives it no seal, but its yes keeps its own seal.
    writeFileSync(join(dir, "relay.json"), JSON.stringify({ phones: [{ pub, seen: Date.now() - 5 * 86_400_000 }] }));
    await v.read(deviceId(pub), await keyFor(), ["op://Agent/GitHub/token"]);
    assert(Object.keys(v.seals()).join() === deviceId(pub), "the phone that says yes keeps its seal, also when it is not recent");
    // A Mac window that Touch ID let in gets its seal at the next yes, then opens the token with its own key.
    const mac = await newKeys();
    const macPub = b64(await rawKey(mac.publicKey));
    v.addMac(macPub);
    assert(v.isMac(macPub) && !v.seals()[deviceId(macPub)], "a new Mac window has no seal before the next yes");
    await v.read(deviceId(pub), await keyFor(), ["op://Agent/GitHub/token"]);
    const macEpub = unb64(v.seals()[deviceId(macPub)]);
    const viaMac = await v.read(deviceId(macPub), await vaultKey(mac.privateKey, macEpub, macEpub, unb64(macPub)), ["op://Agent/GitHub/token"]);
    assert(viaMac.get("op://Agent/GitHub/token")?.value === "ghp_SECRET123" && v.seals()[deviceId(macPub)], "the key of the Mac window opens the token, and the Mac keeps a new seal");
    assert(v.seals()[deviceId(pub)], "a yes of the Mac window keeps the seal of a phone that did not connect for 3 days");
    const other = b64(await rawKey((await newKeys()).publicKey));
    assert(!v.addMac(other) && !v.isMac(other), "a second Mac window cannot get in");
    writeFileSync(join(dir, "relay.json"), JSON.stringify({ phones: [{ pub, seen: Date.now() }] }));
    await v.connect("ops_FAKE");
    assert(!v.isMac(macPub) && !v.seals()[deviceId(macPub)] && v.macFree(), "a new token from the phone drops the Mac window");
    v.keep({ worker: "w1", refs: ["op://Agent/GitHub/token"], use: "run", until: Date.now() + 50, values: got });
    assert(v.find("w1", ["op://Agent/GitHub/token"], "run") && !v.find("w2", ["op://Agent/GitHub/token"], "run") && !v.find("w1", ["op://Agent/GitHub/token"], "fill", "https://x.io"), "a yes is for its agent and its use");
    await Bun.sleep(80);
    assert(!v.find("w1", ["op://Agent/GitHub/token"], "run"), "a yes ends after its minutes");
    v.log({ agent: 7, refs: ["op://Agent/GitHub/token"], answer: "allow" });
    assert(!readFileSync(join(dir, "approvals.jsonl"), "utf8").includes("ghp_"), "the log has no value");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
