// The attach sheet of the phone: a bottom sheet with the recent photos at the top and a row of buttons under them,
// as in Signal. A tap on a photo or a button attaches it and closes the sheet. The recent photos come from the native side of the iPhone
// (`recent_photos` of ios/src/lib.rs). Android, and an iPhone app built before it, show only the buttons.
import { Drawer } from "@base-ui/react/drawer";
import { yonder } from "./api";
import { android } from "./bridge";
import { useEffect, useState } from "react";
import { Icon } from "./icons";

export type Recent = { id: string; thumb: string; seconds: number };
export type AttachActions = { camera(): void; photos(): void; file(): void; paste(): void; location(): void; version(): void; recent(p: Recent): void };

// The length of a video, such as 0:05.
const length = (seconds: number) => `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;

// The last list, so that the sheet shows it at once while it loads the new one. The phone also keeps the list on its
// disk (the Cache API), so the sheet shows the photos at once after a start or an update of the app. Else the sheet is
// empty until the photo library gives the list. The Cache API takes only an
// http or https URL as the key.
let last: Recent[] = [];
const KEY = "https://yonder.local/recent-photos";
const disk = "caches" in window ? caches.open("recent photos").catch(() => undefined) : Promise.resolve(undefined);
const kept: Promise<Recent[] | undefined> = disk.then((c) => c?.match(KEY)).then((r) => r?.json()).catch(() => undefined);

export function AttachSheet({ open, onClose, actions }: { open: boolean; onClose(): void; actions: AttachActions }) {
  const [recent, setRecent] = useState(last);
  // While the new list loads, a tile that pulses waits at the start of the row, where the newest photos come. Four
  // tiles wait when no list is kept. A new photo can come a moment after the kept ones.
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (!last.length) kept.then((list) => list && !last.length && setRecent((last = list)));
    // Android has no recent photos, so nothing loads there.
    setLoading(!android);
    yonder.native.recentPhotos({ count: 30 })
      .then((path) => yonder.native.readPicked({ path }))
      .then((bytes) => {
        const text = new TextDecoder().decode(bytes);
        setRecent((last = JSON.parse(text)));
        disk.then((c) => c?.put(KEY, new Response(text))).catch(() => {});
      }, () => {})
      .finally(() => setLoading(false));
  }, [open]);
  // Each button closes the sheet in the same tap, so the camera, the pickers and the clipboard get the tap of the user.
  const run = (action: () => void) => () => (onClose(), action());
  const buttons = [
    { label: "Camera", icon: "camera", action: actions.camera },
    { label: "Photos", icon: "image", action: actions.photos },
    { label: "File", icon: "file", action: actions.file },
    { label: "Paste", icon: "clipboard", action: actions.paste },
    { label: "Location", icon: "pin", action: actions.location },
    // The version of this phone and of the environment on the computer, for work on Yonder.
    { label: "Version", icon: "info", action: actions.version },
  ] as const;
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Backdrop className="attach-backdrop" />
        <Drawer.Viewport className="attach-viewport">
          <Drawer.Popup className="attach-sheet" aria-label="Attach">
            <div className="attach-handle" />
            {(recent.length > 0 || loading) && (
              <ul className="attach-recent">
                {loading && Array.from({ length: recent.length ? 1 : 4 }, (_, i) => <li key={i} className="loading" aria-hidden />)}
                {recent.map((p) => (
                  <li key={p.id}>
                    <button onClick={run(() => actions.recent(p))} aria-label={p.seconds ? "Attach this video" : "Attach this photo"}>
                      <img src={p.thumb} alt="" />
                      {p.seconds > 0 && <span>{length(p.seconds)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* One row that scrolls sideways. Six circles do not fit the width of the phone. */}
            <div className="attach-buttons">
              {buttons.map((b) => (
                <button key={b.label} onClick={run(b.action)}>
                  <span><Icon name={b.icon} size={24} /></span>
                  {b.label}
                </button>
              ))}
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
