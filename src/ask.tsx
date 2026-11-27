// The page forms of the dialogs and the menus of iOS, for each theme other than the default. The default screen asks
// with the alert of the system (the native alert of iOS and macOS) and opens the native menus of iOS. Each other theme
// draws them in its own style, because only the default theme uses native controls.
// `ask` and `message` have the same arguments as those of the dialog plugin.
import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import { ask as systemAsk, message as systemMessage } from "@tauri-apps/plugin-dialog";
import type { ChromeMenuItem } from "./chrome";
import { themed } from "./look";

type Options = { title?: string; kind?: "info" | "warning" | "error"; okLabel?: string; cancelLabel?: string };
type Question = { text: string; o: Options; one?: boolean; done: (yes: boolean) => void };
let show = (_q: Question) => {};

export function ask(text: string, o: Options = {}): Promise<boolean> {
  if (!themed()) return systemAsk(text, o);
  return new Promise((done) => show({ text, o, done }));
}
// A note with one button, such as "Saved".
export function message(text: string, o: Omit<Options, "cancelLabel"> = {}): Promise<void> {
  if (!themed()) return systemMessage(text, o).then(() => {});
  return new Promise((done) => show({ text, o, one: true, done: () => done() }));
}

// The dialog of the page, once in the app (App.tsx). A button that removes or ends something, such as Delete, is red.
// shortcut: the red comes from the words of the button, because "warning" also asks for Install and Sign in.
const DANGER = /^(delete|remove|close|disconnect|unpair|stop|end|sign out|turn off|forget|discard)\b/i;
export function AskHost() {
  const [q, setQ] = useState<Question>();
  useEffect(() => void (show = setQ), []);
  if (!q) return null;
  const end = (yes: boolean) => (q.done(yes), setQ(undefined));
  return (
    <Dialog.Root open onOpenChange={(o) => !o && end(false)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog">
          {q.o.title && <Dialog.Title className="dialog-title">{q.o.title}</Dialog.Title>}
          <Dialog.Description className="dim">{q.text}</Dialog.Description>
          <div className="ask-buttons">
            {!q.one && <button onClick={() => end(false)}>{q.o.cancelLabel ?? "Cancel"}</button>}
            <button className={DANGER.test(q.o.okLabel ?? "") ? "danger" : "primary"} onClick={() => end(true)}>
              {q.o.okLabel ?? "OK"}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// The action sheet of a theme: the items of a native menu (`data-menu`, ChromeMenuItem) as rows of a bottom sheet. An
// item with `items`, such as Model, opens its choices in the same sheet, and Back goes up. A pick closes the sheet first,
// then goes to `onPick` with the id of the item, as the choice of the native menu goes to its handler in `menus`.
export function ActionSheet({ open, title, items, onPick, onClose }: { open: boolean; title?: string; items: ChromeMenuItem[]; onPick: (id: string) => void; onClose: () => void }) {
  const [sub, setSub] = useState<ChromeMenuItem>();
  useEffect(() => void (open && setSub(undefined)), [open]);
  const head = sub?.title ?? title;
  const pick = (i: ChromeMenuItem) => (i.items ? setSub(i) : (onClose(), onPick(i.id)));
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Backdrop className="attach-backdrop" />
        <Drawer.Viewport className="attach-viewport">
          <Drawer.Popup className="attach-sheet action-sheet" aria-label={head ?? "Actions"}>
            <div className="attach-handle" />
            {head && <Drawer.Title className="action-head">{head}</Drawer.Title>}
            {(sub?.items ?? items).map((i) => (
              <button key={i.id} className="action-item" data-checked={i.checked || undefined} data-danger={i.destructive || undefined} onClick={() => pick(i)}>
                <span>{i.title}</span>
                {(i.detail || i.items) && <span className="action-end">{i.detail ?? ""} ›</span>}
              </button>
            ))}
            <button className="action-item action-cancel" onClick={() => (sub ? setSub(undefined) : onClose())}>
              {sub ? "Back" : "Cancel"}
            </button>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
