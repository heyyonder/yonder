// The Screen settings (Settings › Appearance) and the bar of a preview (docs/ui-themes.md). Styles lists the samples,
// and Custom themes the screens of the user on the computer in use, each with a swatch of its colors. A tap on a screen
// shows it live on the real agents with "Keep X?": Keep uses it, Back or 30 seconds with no answer go back. The i of a
// custom theme opens its versions, with Use on each for a rollback, and Delete. A new theme comes by voice ("build me a
// screen with only one chat"), so the Settings have no field for it, and Yonder in Styles is the default screen.
import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { ask as nativeAsk } from "./ask";
import { Icon } from "./icons";
import { endPreview, loadMine, lookId, nameOf, pickScreen, preview, previewing, remove, rename, SAMPLES, shown, useLook, type Look, type Mine } from "./look";

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? "now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString();
};

// A small picture of the colors of a screen: its background, two lines of its text and a dot of its own color (the
// accent, else the call button, else the live color). A value that the screen does not give keeps the color of the app.
export function Swatch({ colors = {}, dark }: { colors?: Record<string, string | undefined>; dark?: boolean }) {
  const dot = (colors.accent !== colors.text ? colors.accent : undefined) ?? colors.call ?? colors.live;
  const style = { "--sw-bg": colors.bg ?? (dark ? "#101114" : undefined), "--sw-text": colors.text ?? (dark ? "#e6e6e6" : undefined), "--sw-accent": dot } as CSSProperties;
  return <i className="theme-swatch" style={style} aria-hidden />;
}
// The colors of a theme in the look in use: each theme has a light and a dark set.
const mode = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
export const colorsOf = (look: Look) => {
  const c = (look.look as Record<string, Record<string, string>> | undefined)?.[mode()] ?? {};
  return { bg: c.bg, text: c.text, accent: c.accent, live: c.live, call: c.call };
};

export function ScreenSettings({ onPreview }: { onPreview: () => void }) {
  useLook();
  const inUse = lookId();
  const [mine, setMine] = useState<Mine[]>([]);
  const [open, setOpen] = useState("");
  const [error, setError] = useState("");
  const reload = () => loadMine().then(setMine, () => {});
  useEffect(() => void reload(), []);
  const fail = (e: unknown) => setError((e as Error).message);
  const tryIt = (id: string) => (id === inUse ? undefined : preview(id).then(onPreview, fail));
  // The native alert asks first, as Unpair does. The list loses the theme at once.
  const del = async (m: Mine) => {
    const title = `Delete ${m.title}?`;
    const text = "Its versions go too.";
    const yes = await nativeAsk(text, { title, kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" }).catch(() => confirm(`${title}\n\n${text}`));
    if (!yes) return;
    setMine((all) => all.filter((x) => x.name !== m.name));
    remove(m.name).catch((e) => (fail(e), reload()));
  };
  // A new name shows at once, and the bridge makes the version with the name after.
  const retitle = (m: Mine, title: string) => {
    const clean = title.trim().slice(0, 40);
    if (!clean || clean === m.title) return;
    setMine((all) => all.map((x) => (x.name === m.name ? { ...x, title: clean } : x)));
    rename(m.name, clean).then(reload, (e) => (fail(e), reload()));
  };

  return (
    <>
      <h2 className="page-section">Styles</h2>
      <div className="group">
        {Object.entries(SAMPLES).map(([id, look]) => (
          <button key={id} className="row nav theme-row" onClick={() => tryIt(id)} aria-current={id === inUse || undefined}>
            <Swatch colors={colorsOf(look)} dark={mode() === "dark"} />
            <span>
              {look.name}
              <small>{look.about}</small>
            </span>
            {id === inUse && <Icon name="tick" size={18} />}
          </button>
        ))}
      </div>
      <h2 className="page-section">Custom themes</h2>
      {mine.length > 0 && (
        <div className="group">
          {mine.map((m) => {
            const using = inUse.split("@")[0] === m.name;
            const newest = m.versions.find((v) => !v.bad);
            return (
              <Fragment key={m.name}>
                <div className="row theme">
                  <button className="pick" onClick={() => tryIt(m.name)} aria-current={using || undefined}>
                    <Swatch colors={m.colors?.[mode()]} dark={mode() === "dark"} />
                    <span>
                      {m.title}
                      <small>{[`v${newest?.n ?? m.versions[0]?.n ?? 1}`, m.from && `from ${nameOf(m.from)}`, m.versions[0] && ago(m.versions[0].at)].filter(Boolean).join(" · ")}</small>
                    </span>
                    {using && <Icon name="tick" size={18} />}
                  </button>
                  <button className="info" onClick={() => setOpen(open === m.name ? "" : m.name)} aria-expanded={open === m.name} aria-label={`Versions of ${m.title}`}>
                    <Icon name="info" size={20} />
                  </button>
                </div>
                {open === m.name && (
                  <>
                    {m.versions.map((v) => {
                      const id = `${m.name}@${v.n}`;
                      const now = inUse === id || (inUse === m.name && v === newest);
                      return (
                        <div key={v.n} className="row screen-version">
                          <span>
                            v{v.n} · {v.note || (v.n === 1 ? "First version" : "A change")}
                            <small>{[v.by, ago(v.at), v.bad && "did not start"].filter(Boolean).join(" · ")}</small>
                          </span>
                          {now ? <Icon name="tick" size={18} /> : !v.bad && <button className="link" onClick={() => pickScreen(v === newest ? m.name : id).catch(fail)}>Use</button>}
                        </div>
                      );
                    })}
                    <label className="row screen-version">
                      <span>Name</span>
                      <input
                        className="field-input"
                        defaultValue={m.title}
                        maxLength={40}
                        enterKeyHint="done"
                        aria-label={`Name of ${m.title}`}
                        onBlur={(e) => retitle(m, e.currentTarget.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      />
                    </label>
                    <button className="row act danger screen-version" onClick={() => void del(m)}>
                      <span>Delete {m.title}</span>
                    </button>
                  </>
                )}
              </Fragment>
            );
          })}
        </div>
      )}
      <p className="page-note">{error || "Ask Yonder in a call to build a new theme. Shake the phone to undo a change."}</p>
    </>
  );
}

// The bar of a preview, over the tab bar: "Keep Terminal?" with Back and Keep.
export function PreviewBar() {
  useLook();
  const id = previewing();
  if (!id) return null;
  return (
    <>
    <div className="keep-under" />
    <div className="keep-bar" role="dialog" aria-label={`Keep ${nameOf(id, shown().look)}?`}>
      <span>
        Keep {nameOf(id, shown().look)}?
        <small>Back by itself in 30 s</small>
      </span>
      <button onClick={() => endPreview()}>Back</button>
      <button className="go" onClick={() => endPreview(true)}>Keep</button>
    </div>
    </>
  );
}
