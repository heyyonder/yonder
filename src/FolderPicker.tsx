// Add folder on the phone: a sheet that goes through the folders of the Mac, with list_folders of the bridge.
// The phone cannot show the folder dialog of the Mac, so the Mac app uses the dialog of macOS instead.
import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useState } from "react";
import { yonder } from "./api";
import { haptic, useReport } from "./bridge";

type Folder = { name: string; path: string };
export type Listing = Folder & { parent?: string; folders: Folder[] };

export function FolderPicker({ onClose }: { onClose: (added?: string) => void }) {
  const [path, setPath] = useState<string>();
  const [listing, setListing] = useState<Listing>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useReport(error);
  // A tap on the same folder after an error, such as after Allow on the Mac, reads it again.
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    yonder.folders.list(path)
      .then((l) => live && setListing(l))
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [path, tries]);

  const open = (to: string) => (haptic(), setPath(to), setTries((n) => n + 1));

  // The picker closes at once, and the app adds the folder (addProject in src/App.tsx).
  function add() {
    if (!listing) return;
    haptic("medium");
    onClose(listing.path);
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog signin folders">
          <Dialog.Title className="dialog-title">{listing?.name ?? "Add a folder"}</Dialog.Title>
          <Dialog.Description className="dim">{listing?.path ?? "The folders of your Mac."}</Dialog.Description>
          {/* After an error, the list stays on the last folder that opened, so the user can go on from there. */}
          <ul className="folder-list" aria-busy={busy}>
            {listing?.parent && (
              <li>
                <button onClick={() => open(listing.parent!)}>‹ Back</button>
              </li>
            )}
            {listing?.folders.map((f) => (
              <li key={f.path}>
                <button onClick={() => open(f.path)}>{f.name}</button>
              </li>
            ))}
            {listing && !listing.folders.length && <li className="dim">No folders in this folder.</li>}
          </ul>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy || !listing} onClick={add}>
            {busy && !listing ? "One moment…" : `Add ${listing?.name ?? "this folder"}`}
          </button>
          <Dialog.Close className="link">Cancel</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
