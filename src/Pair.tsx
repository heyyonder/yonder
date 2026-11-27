// The first screen of the phone app, until it has a pairing: scan the QR code of the pair button
// or File > Pair Phone on the Mac. A device with no camera, such as the simulator, can paste the link
// of the code instead (bun run sim, bun run emu). See docs/mobile.md.
import { useState } from "react";
import { onBackButtonPress } from "@tauri-apps/api/app";
import { cancel, checkPermissions, Format, requestPermissions, scan } from "@tauri-apps/plugin-barcode-scanner";
import { openUrl } from "@tauri-apps/plugin-opener";
import { android, isPaired, useReport } from "./bridge";
import { Icon } from "./icons";
import { Step } from "./Setup";
import { pair, switchPairing } from "./link";
import { word } from "./names";
// ?inline puts the picture in the JS, as in src/Empty.tsx.
import bird from "./empty/wave.svg?inline";

const DOWNLOAD = "https://yonder.so/download";

// Stops the scan that runs: the X of the scan view, and the back gesture of Android.
let stopScan = () => {};

async function scanCode() {
  // iOS puts a full-screen camera over the page, with no way out. Windowed, the camera is under the page, and
  // the page shows the X. Else the user cannot leave the camera. Android keeps its back gesture.
  const options = { windowed: !android, formats: [Format.QRCode] };
  // The scanner does not ask for the camera on Android, and on iOS it fails at once with "Camera permission denied or
  // not yet requested" while the system asks. So the first scan failed (YONDER-6). Ask first on both.
  if ((await requestPermissions()) !== "granted") throw new Error("Yonder needs the camera to scan the code.");
  // The scanner of Android does not end the promise of a stopped scan, so this promise ends it.
  const back = android ? await onBackButtonPress(() => stopScan()) : undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      stopScan = () => void cancel().finally(() => reject(new Error("cancelled")));
      scan(options).then((r) => resolve(r.content), reject);
    });
  } finally {
    stopScan = () => {};
    void back?.unregister();
  }
}

// onCancel: the settings show this screen to add another Mac, and Cancel goes back to them. A pairing goes back to them
// too, because the running app moves to the new Mac at once (moveTo in src/link.ts).
export function Pair({ onCancel }: { onCancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  // A pairing that worked shows "Paired" for a moment before the app moves on, so the user does not scan again.
  const [paired, setPaired] = useState(false);
  const [error, setError] = useState("");
  useReport(error);
  // The field for the link shows only after a scan fails, for example with no camera.
  const [paste, setPaste] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function connect(content: string) {
    if (!content.startsWith("yonder://pair?")) throw new Error("This is not a pairing code of Yonder.");
    setBusy(true);
    // The first pairing of this device starts the first run, and the setup asks for the permissions (src/Setup.tsx).
    if (!isPaired()) localStorage.setItem("permsWait", "1");
    // The app starts again with the pairing, or asks for a restart (`hold.dirty` in src/link.ts).
    const p = await pair(content, android ? "Android" : "iPhone");
    setPaired(true);
    await new Promise((r) => setTimeout(r, 1200));
    if (await switchPairing(p)) {
      setBusy(false);
      setError("Paired. Close Yonder and open it again to use this computer.");
    } else onCancel?.();
  }

  async function run(get: () => Promise<string>) {
    setError("");
    try {
      await connect(await get());
    } catch (e) {
      const message = String((e as Error).message ?? e);
      // The X of the scan view is not an error.
      if (message !== "cancelled") {
        setError(message);
        setPaste(true);
      }
      setBusy(false);
    }
  }

  async function scanAndConnect() {
    setScanning(true);
    try {
      return await scanCode();
    } finally {
      setScanning(false);
    }
  }

  // Before the camera alert of the system, one screen gives the reason, with only Continue (Apple's rule, src/Setup.tsx).
  const [prime, setPrime] = useState(false);
  const [copied, setCopied] = useState(false);
  const start = async () => {
    const state = await checkPermissions().catch(() => "granted");
    if (state === "prompt" || state === "prompt-with-rationale") setPrime(true);
    else void run(scanAndConnect);
  };
  const copy = () => {
    void navigator.clipboard?.writeText(DOWNLOAD).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  if (prime)
    return (
      <Step
        icon="camera"
        title="Scan the code on your computer"
        text="Yonder uses the camera to read the pairing code."
        foot={
          <button className="setup-main" onClick={() => (setPrime(false), void run(scanAndConnect))}>
            Continue
          </button>
        }
      />
    );

  // The camera of the scan shows through this view (see .scan-view in app.css).
  if (scanning)
    return (
      <div className="scan-view">
        <button className="scan-close" aria-label="Close the camera" onClick={() => stopScan()}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );

  return (
    <main className="pair-screen">
      {/* The bird mascot waves hello. */}
      <img className="logo" src={bird} alt="" draggable={false} />
      <h1>Yonder</h1>
      <p>Talk to your {word.many} from anywhere.</p>
      {/* How it works, in three steps. The link is plain, to type it on the computer, and Copy, Text it and Email it
          send it there. */}
      <ol className="pair-steps">
        <li>
          <b>1</b>Install Yonder on your computer
        </li>
        <li className="pair-get">
          <span className="pair-url">
            <span>yonder.so/download</span>
            <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </span>
          <span className="pair-send">
            <button onClick={() => void openUrl(`sms:&body=${encodeURIComponent(DOWNLOAD)}`).catch(() => {})}>
              <Icon name="message" size={17} />
              Text it
            </button>
            <button onClick={() => void openUrl(`mailto:?subject=Install%20Yonder&body=${encodeURIComponent(DOWNLOAD)}`).catch(() => {})}>
              <Icon name="mail" size={17} />
              Email it
            </button>
          </span>
        </li>
        <li>
          <b>2</b>Scan the code
        </li>
        <li>
          <b>3</b>Connect your {word.one}
        </li>
      </ol>
      <button className="scan" onClick={() => void start()} disabled={busy}>
        {paired ? "Paired" : busy ? "Pairing…" : "Scan the code"}
      </button>
      {onCancel && (
        <button className="pair-cancel" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      )}
      {error && <p className="pair-error">{error}</p>}
      {paste && (
        <input
          className="pair-link"
          placeholder="Or paste the yonder://pair link"
          autoCapitalize="off"
          autoCorrect="off"
          disabled={busy}
          onKeyDown={(e) => {
            const link = e.currentTarget.value.trim();
            if (e.key === "Enter") run(async () => link);
          }}
        />
      )}
    </main>
  );
}
