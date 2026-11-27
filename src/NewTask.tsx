// The approval card of a new task link (bridge/link.ts): yonder://new?..., such as a "Start in Yonder" button of a site
// that the user trusts. Any web page can open such a link, so the page only gives it to the bridge, which checks the
// signature, the time, the nonce and the folder, and answers with what the card shows. A link that the bridge refuses
// shows a short notice and no card. The card shows the full prompt as plain text. Cancel is the default, the card closes
// by itself after 10 minutes, and a link that comes while a card is open is dropped. Start asks for Face ID or Touch ID,
// with the passcode of the device as the fallback, and then the bridge checks the link again and starts the task with
// the permission mode and the model of the Settings. It is the card of the other approvals (Approval in
// src/Canvas.tsx), from the bottom, on the phone and on the Mac, because an approval of Yonder is never a modal dialog
// in the middle.
import { useEffect, useRef, useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { invoke } from "@tauri-apps/api/core";
import { bridgeFetch, phone } from "./bridge";
import { runAbility } from "./abilities";
import { clock, useNow } from "./Canvas";
import { Icon } from "./icons";
import { lockName } from "./Lock";

type Opened = { url: string; app?: string };
type Sheet = Opened & { source: string; folder: string; name: string; prompt: string; mode: string; model: string; until: number };
const LIFE = 10 * 60_000;
const BLOCKED = "Yonder blocked a link from an unknown source.";
const post = (path: string, url: string) => bridgeFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });

// A link that opened the app comes before the sheet is there, so it waits here.
const early: Opened[] = [];
let take = (o: Opened) => void early.push(o);
addEventListener("yonder:opened", (e) => {
  const { detail, app } = e as CustomEvent<string[]> & { app?: string };
  for (const url of detail ?? []) if (typeof url === "string" && url.startsWith("yonder://new?")) take({ url, app });
});

// Face ID on the phone, Touch ID on the Mac. An app with neither, or an older Mac app, gives false. macOS puts the reason
// after "Yonder is trying to", so it starts in lower case there. The phone shows it alone, so it starts with a capital.
const owner = (reason: string) =>
  phone
    ? runAbility("face_id", { reason: reason[0].toUpperCase() + reason.slice(1), passcode: true }).then((a) => (a as { ok?: boolean }).ok === true)
    : invoke<boolean>("owner_check", { reason }).catch(() => false);

export function NewTaskHost({ notice, label }: { notice: (text: string) => void; label: (mode: string, model: string) => string }) {
  const [sheet, setSheet] = useState<Sheet>();
  const open = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const close = () => ((open.current = false), setSheet(undefined));
  useEffect(() => {
    take = (o) => {
      if (open.current) return;
      open.current = true;
      post("/link", o.url)
        .then(async (res) => (res.ok ? setSheet({ ...o, ...(await res.json()), until: Date.now() + LIFE }) : Promise.reject()))
        .catch(() => (close(), notice(BLOCKED)));
    };
    early.splice(0).forEach((o) => take(o));
  }, []);
  useEffect(() => {
    if (!sheet) return;
    const t = setTimeout(close, LIFE);
    return () => clearTimeout(t);
  }, [sheet]);
  // The time of the first second comes from before the card, so the time left stays at most 10 minutes.
  const now = useNow(!!sheet);
  if (!sheet) return null;
  const start = async () => {
    // The card shows the name and the prompt, so the dialog of the system names only the source.
    if (!(await owner(`start a task from ${sheet.source}`))) return;
    close();
    const res = await post("/link/start", sheet.url).catch(() => undefined);
    if (!res?.ok) notice(`Yonder did not start the task: ${(await res?.json().catch(() => undefined))?.error ?? "no connection to the computer"}.`);
  };
  const rows: [string, string][] = [
    ["Name", sheet.name],
    ["Folder", sheet.folder],
    ["Runs with", label(sheet.mode, sheet.model)],
    ["From", `${sheet.source} · Verified`],
    ...(sheet.app ? [["Opened by", sheet.app] as [string, string]] : []),
  ];
  return (
    <Drawer.Root open onOpenChange={(o) => !o && close()}>
      <Drawer.Portal>
        <Drawer.Backdrop className="attach-backdrop" />
        <Drawer.Viewport className="attach-viewport">
          <Drawer.Popup className="attach-sheet approval" aria-label="Start a new task?" initialFocus={cancel}>
            <div className="attach-handle" />
            <div className="approval-head">
              <span>
                <b>{sheet.source}</b> asks you
              </span>
              <span className="approval-left">{clock(Math.min(LIFE, sheet.until - now))}</span>
            </div>
            <Drawer.Title className="approval-title">Start a new task?</Drawer.Title>
            <code className="ask">{sheet.prompt}</code>
            <dl className="approval-rows">
              {rows.map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <button className="approval-yes" onClick={() => void start()}>
              {phone && <Icon name="faceid" size={22} />}
              Start with {phone ? lockName : "Touch ID"}
            </button>
            <button ref={cancel} className="approval-no" onClick={close}>
              Cancel
            </button>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
