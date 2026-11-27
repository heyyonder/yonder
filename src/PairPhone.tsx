// File > Pair Phone: the QR code that links the Yonder app on a phone to this Mac, and the paired phones.
// A code works one time, for 5 minutes. Each code needs Touch ID on a Mac (POST /relay in bridge/main.ts), so the dialog
// makes no code by itself after the first: when a code runs out, a phone pairs, or Touch ID says no, the user asks for
// the next one with New code. See docs/mobile.md.
// One tab shows the code, and one tab shows the paired phones. Revoke removes a phone: the phone then clears its data.
// The Relay tab sets another relay, or goes back to the default. A phone keeps the relay of its pairing, so it pairs again.
import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { ago } from "./App";
import { BRIDGE, useReport } from "./bridge";
import { Icon } from "./icons";
import { word } from "./names";
// ?inline puts the picture in the JS, as in src/Pair.tsx.
import bird from "./empty/wave.svg?inline";

// via: "lan" while the phone has a connection over the local network, "relay" through the relay. guard: the phone has
// Face ID for the relay (bridge/relay.ts).
type Relay = { relay: string; default: string; connected: boolean; room: string; phones: { pub: string; name: string; added: number; seen?: number; version?: string; device?: string; connects?: number; via?: string; guard?: boolean }[] };
type Code = { qr: string; expires: number; asked: number };

async function relay<T>(method: string, query = "", signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BRIDGE}/relay${query}`, { method, signal });
  // A bridge from before the relay answers with text.
  const body = await res.json().catch(() => ({ error: "Restart the bridge to pair a phone." }));
  if (!res.ok || body.error) throw new Error(body.error ?? res.statusText);
  return body;
}

export function PairPhone({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<Relay>();
  const [code, setCode] = useState<Code>();
  const [paired, setPaired] = useState(""); // The name of the phone that used the code.
  const [stopped, setStopped] = useState(false); // The code ran out, or Touch ID said no.
  const [error, setError] = useState("");
  useReport(error);
  const [draft, setDraft] = useState<string>(); // The relay in the field of the Relay tab, from the bridge at first.
  const [saving, setSaving] = useState(false);
  // The person who uses the next phone, when a phone is paired already (docs/multi-user.md). Empty: the main person.
  const [person, setPerson] = useState("");
  const [typed, setTyped] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const fail = (e: unknown) => setError((e as Error).message);
  useEffect(() => {
    fetch(`${BRIDGE}/people`).then((r) => (r.ok ? r.json() : { people: [] })).then((p) => setPeople((p.people ?? []).map((x: { name: string }) => x.name)), () => {});
  }, [paired]);
  // A new person makes a new code, so that the pick goes with it.
  const pickPerson = () => typed.trim() !== person && (setPerson(typed.trim()), setCode(undefined));

  // The state of the relay every second, so that a phone shows in the list when it pairs.
  useEffect(() => {
    const load = () =>
      relay<Relay>("GET").then((r) => {
        setState(r);
        setDraft((d) => d ?? r.relay);
      }, fail);
    load();
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  }, []);

  // A phone that paired after the code was made used the code, so the dialog hides it.
  useEffect(() => {
    const phone = code && state?.phones.find((p) => p.added >= code.asked);
    if (phone) {
      setPaired(phone.name);
      setCode(undefined);
    }
  }, [state]);

  useEffect(() => {
    if (paired || stopped) return;
    if (code) {
      const timer = setTimeout(() => (setCode(undefined), setStopped(true)), Math.max(0, code.expires - Date.now()));
      return () => clearTimeout(timer);
    }
    // A close of the dialog, or a new person, ends the request, and the bridge closes its Touch ID prompt.
    const stop = new AbortController();
    const asked = Date.now();
    relay<Code>("POST", person ? `?person=${encodeURIComponent(person)}` : "", stop.signal).then((c) => !stop.signal.aborted && setCode({ ...c, asked }), (e) => !stop.signal.aborted && (fail(e), setStopped(true)));
    return () => stop.abort();
  }, [code, paired, person, stopped]);

  const remove = (pub: string) => relay<Relay>("DELETE", `?phone=${encodeURIComponent(pub)}`).then(setState, fail);
  // The bridge joins the new relay at once. The old code names the old relay, so the dialog makes a new one.
  const save = (url: string) => {
    setSaving(true);
    setError("");
    relay<Relay>("PUT", `?url=${encodeURIComponent(url)}`)
      .then((r) => {
        setState(r);
        setDraft(r.relay);
        setCode(undefined);
      }, fail)
      .finally(() => setSaving(false));
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog">
          <Dialog.Title className="dialog-title">Pair a phone</Dialog.Title>
          {error && <p className="error">{error}</p>}
          <Tabs.Root defaultValue="pair">
            <Tabs.List className="tablist">
              <Tabs.Tab value="pair">Pair</Tabs.Tab>
              <Tabs.Tab value="phones">Paired phones{state?.phones.length ? ` (${state.phones.length})` : ""}</Tabs.Tab>
              <Tabs.Tab value="relay">Relay</Tabs.Tab>
              <Tabs.Indicator className="indicator" />
            </Tabs.List>
            <Tabs.Panel className="dialog-panel" value="pair">
              {paired ? (
                <div className="paired">
                  <Icon name="check" size={32} />
                  <Dialog.Description>{paired} is paired. The code does not work again.</Dialog.Description>
                  <button onClick={() => setPaired("")}>New code</button>
                </div>
              ) : (
                <>
                  {!!state?.phones.length && (
                    <>
                      <input
                        className="pair-person"
                        list="pair-people"
                        placeholder="Person"
                        aria-label="The person who uses this phone"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        onBlur={pickPerson}
                        onKeyDown={(e) => e.key === "Enter" && pickPerson()}
                      />
                      <datalist id="pair-people">{people.map((n) => <option key={n} value={n} />)}</datalist>
                    </>
                  )}
                  <div className="qr">
                    {code && <img src={code.qr} alt="The pairing code" />}
                    {stopped && <button onClick={() => (setError(""), setStopped(false))}>New code</button>}
                  </div>
                  <Dialog.Description className="dim center">Scan the code with Yonder on your phone. The code works one time, for 5 minutes.</Dialog.Description>
                </>
              )}
              {state && (
                <p className="dim center relay-state">
                  <span className={`dot${state.connected ? "" : " offline"}`} />
                  {state.connected ? "Connected to" : "Not connected to"} {new URL(state.relay).host} · room {state.room}
                </p>
              )}
            </Tabs.Panel>
            <Tabs.Panel className="dialog-panel" value="phones">
              {state && !state.phones.length && (
                <div className="phones-empty dim">
                  <Icon name="smartphone" size={28} />
                  <p>No paired phones.</p>
                </div>
              )}
              {!!state?.phones.length && (
                <ul className="phones">
                  {state.phones.map((p) => (
                    <li key={p.pub}>
                      <span className="phone-icon">
                        <Icon name="smartphone" size={18} />
                      </span>
                      <span className="phone-name">
                        {p.name}
                        <small>{p.seen ? `Last seen ${ago(Date.now() - p.seen)} ago` : `Paired ${ago(Date.now() - p.added)} ago`}
                        {p.via && ` · ${p.via === "lan" ? "Local" : "Relay"}`}
                        {p.guard && " · Face ID"}
                        {p.version && ` · ${p.version}`}
                        {p.device && ` · ${p.device}`}</small>
                      </span>
                      <button className="revoke" onClick={() => remove(p.pub)}>
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="dim small">Revoke ends the access of a phone. The phone then clears its data and shows the pairing screen.</p>
            </Tabs.Panel>
            <Tabs.Panel className="dialog-panel" value="relay">
              <form
                className="relay-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(draft ?? "");
                }}
              >
                <input
                  value={draft ?? ""}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={state?.default}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-label="Relay address"
                />
                <div className="relay-buttons">
                  <button type="button" disabled={saving || !state || state.relay === state.default} onClick={() => save("")}>
                    Use default
                  </button>
                  <button type="submit" className="primary" disabled={saving || !state || !draft?.trim() || draft.trim().replace(/\/+$/, "") === state.relay}>
                    Save
                  </button>
                </div>
              </form>
              {state && (
                <p className="dim center relay-state">
                  <span className={`dot${state.connected ? "" : " offline"}`} />
                  {state.connected ? "Connected to" : "Not connected to"} {new URL(state.relay).host}
                </p>
              )}
              <p className="dim small">
                The relay passes the encrypted messages between this Mac and your phones. The default is {state ? new URL(state.default).host : "the Yonder relay"}. To use your own relay, put its wss:// address here. Phones that paired through another relay must pair again.
              </p>
            </Tabs.Panel>
          </Tabs.Root>
          <Dialog.Close className="dialog-close">Done</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// The first screen of a new install on the Mac, as the first screen of the phone app: pair a phone, or skip it. It shows
// until a click on one of the two, and only while no phone is paired.
export function Welcome({ onDone }: { onDone: (pair: boolean) => void }) {
  return (
    <main className="pair-screen" data-tauri-drag-region>
      <img className="logo" src={bird} alt="" draggable={false} />
      <h1>Yonder</h1>
      <p>Talk to your {word.many} from anywhere.</p>
      <button className="scan" onClick={() => onDone(true)}>
        Pair phone
      </button>
      <button className="pair-cancel" onClick={() => onDone(false)}>
        Skip
      </button>
    </main>
  );
}
