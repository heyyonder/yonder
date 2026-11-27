// The phone side of 1Password for the agents (bridge/vault.ts, docs/secrets.md). The bridge keeps the token of a
// 1Password service account sealed to the key of each paired phone. Approve makes the key of the seal of
// this phone and sends it, so the bridge can read the secrets of that one request. The card is the kind `secret` of the
// approvals of the Canvas (docs/canvas.md).
import { useEffect, useState } from "react";
import { yonder } from "./api";
import { phone, type Worker } from "./bridge";
import { b64, loadPairing, newKeys, rawKey, store, unb64, vaultKey } from "./link";

// The key of this phone, with no Face ID: the lock of the app guards the phone. The approval card of the Canvas calls it (Approval in src/Canvas.tsx).
export async function approveSecret(ask: NonNullable<Worker["ask"]>) {
  if (!phone) return approveOnMac(ask);
  const p = await loadPairing();
  // The id of this phone, as deviceId in bridge/relay.ts makes it from its public key.
  const epub = p && ask.seals?.[p.pub.replace(/=+$/, "").slice(-16)];
  if (!p || !epub) throw new Error("This phone has no key for 1Password. Paste the token again in Settings, General.");
  const seal = unb64(epub);
  const key = await vaultKey(p.key.privateKey, seal, seal, unb64(p.pub));
  const res = await yonder.vault.approve(ask.id, b64(key));
  if (!res.ok) throw new Error(await res.text());
}

// The key of this Mac window, made once and kept in IndexedDB, where it cannot be read out, as the key of a phone. The
// bridge asks Touch ID before it uses the key (/vault/approve). Thus the phone does not ask while the user uses Yonder
// on the Mac.
async function approveOnMac(ask: NonNullable<Worker["ask"]>) {
  let keys = await store<CryptoKeyPair | undefined>("readonly", (s) => s.get("mac"), "vault");
  if (!keys) {
    keys = await newKeys();
    await store("readwrite", (s) => s.put(keys, "mac"), "vault");
  }
  const pub = b64(await rawKey(keys.publicKey));
  const epub = ask.seals?.[pub.slice(-16)];
  const key = epub ? b64(await vaultKey(keys.privateKey, unb64(epub), unb64(epub), unb64(pub))) : "";
  const res = await yonder.vault.approve(ask.id, key, pub).then((r) => r.json()).catch(() => ({ ok: false }));
  if (!res.ok) throw new Error(res.error ?? "");
}

// The 1Password row of General, on the phone only: the token goes from the phone to the bridge through the encrypted link,
// and the bridge seals it to the phones. It never goes in a file of the Mac.
export function VaultRow() {
  const [state, setState] = useState<{ connected: boolean; vaults: string[]; items: number }>();
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => void yonder.vault.state().then(setState, () => {}), []);
  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await yonder.vault.connect(draft);
      const body = await res.json().catch(() => ({ error: "The Mac is too old for 1Password. Update Yonder on the Mac." }));
      if (!res.ok) throw new Error(body.error);
      setState(body);
      setDraft(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const form = draft !== undefined || state?.connected === false;
  return (
    <>
      <div className="group">
        <div className="row">
          <span>
            1Password
            <small>{state?.connected ? `${state.vaults.join(", ")} · ${state.items} items` : "Not connected"}</small>
          </span>
          {!form && state && <button onClick={() => setDraft("")}>Replace</button>}
        </div>
        {form && (
          <form className="row" onSubmit={(e) => (e.preventDefault(), void connect())}>
            <input
              type="password"
              value={draft ?? ""}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Service account token"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="1Password service account token"
            />
            <button type="submit" className="primary" disabled={busy || !draft?.trim()}>
              Connect
            </button>
          </form>
        )}
      </div>
      <p className="page-note">{error || "Agents use this vault after your yes on the phone. They never get a value."}</p>
    </>
  );
}
