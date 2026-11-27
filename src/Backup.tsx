// Export and Import of the General settings (bridge/backup.ts, docs/wiki/projects.md "Backup"). Export saves the setup of the
// computer to Downloads of that computer. Import applies a file that Export made. With keys, Export includes the keys,
// the tokens and the pairings, and Import applies them. Thus a user without a Yonder account cannot lose the setup.
import { useRef, useState } from "react";
import { bridgeFetch, phone } from "./bridge";
import { OnOff } from "./Settings";

async function post(path: string, body: object) {
  const res = await bridgeFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({ error: "Update Yonder on the computer." }));
  if (!res.ok || out.error) throw new Error(out.error ?? `Error ${res.status}`);
  return out;
}

export function BackupRow() {
  const [keys, setKeys] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const run = async (step: () => Promise<string>) => {
    setBusy(true);
    setNote("");
    try {
      setNote(await step());
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(async () => `Saved: ${(await post("/setup-export", { keys })).path}`);
  // Config file: the Mac opens config.json in its text editor; the phone shows the text under the row.
  const [text, setText] = useState("");
  const open = () =>
    run(async () => {
      if (!phone) return `Opened ${(await post("/config-file", {})).path}`;
      if (text) return setText(""), "";
      const out = await (await bridgeFetch("/config-file")).json();
      setText(out.text || "{}");
      return out.path;
    });
  const load = (f: File) =>
    run(async () => {
      const out = await post("/setup-import", { text: await f.text(), keys });
      return out.restart ? "Imported. The bridge restarts." : out.skipped?.some((s: string) => s.includes("only with keys")) ? "Imported. Keys left out." : "Imported.";
    });
  return (
    <>
      <div className="group">
        <div className="row">
          <span>Config file</span>
          <button disabled={busy} onClick={() => void open()}>
            {phone && text ? "Hide" : "Open"}
          </button>
        </div>
        <div className="row">
          <span>Export</span>
          <button disabled={busy} onClick={() => void save()}>
            Export
          </button>
        </div>
        <div className="row">
          <span>Import</span>
          <button disabled={busy} onClick={() => file.current?.click()}>
            Choose
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void load(f);
            }}
          />
        </div>
        <div className="row">
          <span>With keys</span>
          <OnOff value={keys} onChange={setKeys} label="With keys" />
        </div>
      </div>
      {text && <pre className="config-text">{text}</pre>}
      {keys && <p className="page-note">Warning: the file holds your keys and pairings. Anyone with it can use this computer.</p>}
      <p className="page-note">{note || "Saves to Downloads on the computer."}</p>
    </>
  );
}
