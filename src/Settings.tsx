// The settings: a list of sections as in the Settings of iOS, with a search over all the settings (src/find.ts). The
// account is a card at the top. A tap opens a section: Profiles, Environments, General, Voice, Appearance,
// Plugins, Schedules, Triggers and Keys. Usage and Feedback open from Account. Super user opens from Voice. Voice has the microphone and the transcripts of past calls. For a super user
// of yonder.so it also has the model, the Grok voice, the speech to text, and the spend and the context of Grok. Usage
// has the usage of the active profile, with the switch of its weekly percent in the title bar. On the Mac General also has the QR code that pairs a phone, and on the phone Environment has the Macs that the phone is paired
// with. The phone can pair with more than one Mac
// and switch between them. Unpair forgets one Mac; after the last Mac it also clears the data of the app on the phone. A revoke on the Mac does the same.
// It is a full page. The back button or a swipe to the right goes back, as in a conversation.
// On the phone, a pull down at the top refreshes the page: the usage, the spend, the connection to the Mac and the pairing.
import { type CSSProperties, Fragment, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Select } from "@base-ui/react/select";
import { graceMinutes, lockAvailable, lockName, lockOn, phoneLock, unlock } from "./Lock";
import { VaultRow } from "./Vault";
import { BackupRow } from "./Backup";
import { loadPairing, loadPairings, macName, type Pairing, renamePairing, switchPairing, unpair } from "./link";
import { Pair } from "./Pair";
import { DefaultRow, ProfilePage } from "./Profiles";
import { isTrigger, loadSchedules, type Schedule, ScheduleList, SchedulePage } from "./Schedules";
import { ago, CallRow, type CallLog, type ClaudeUsage, EFFORTS, Logins, MODELS, MODES, pickable, profileLabel, resets, shrink, usageLabel, useSwipeBack, weekLimit } from "./App";
import { ask as nativeAsk, message as nativeMessage } from "./ask";
import { themed, useLook } from "./look";
import { invoke } from "@tauri-apps/api/core";
import { android, bridgeFetch, type Cli, type Clis, linkVia, openLink, pollTime, phone, pushOn, setPush, shell, STT, useReport } from "./bridge";
import { type Account, refreshAccount, saved, sendFeedback, setAvatar, setEmail, setVoice } from "./account";
import { Icon } from "./icons";
import { menus } from "./chrome";
import { GROK_VOICES, hasVoiceKey, syncAudio, VOICE_PROVIDERS, voiceProvider, type VoiceProvider } from "./voice";
import { find } from "./find";
import { setWord, swap, word } from "./names";
import { syncPhoneConfig } from "./phone-config";
import { ScreenSettings } from "./Looks";
import { shown } from "./look";
import { type Section, type Setting, yonder } from "./api";
import { SCHEMA, SECTIONS } from "../bridge/settings/index";
import { elsewhere, hidden as hiddenNow, reach, setHidden } from "./elsewhere";
import { channel, installed, SCREEN_FROM } from "./front";
import logo from "./logo.svg?inline";

declare const __BUILD_ID__: string;

const PULL = 64; // The distance in px that starts a refresh.

// The font and the size of the Markdown in the chat and of the points of the summary. Each device keeps its own in
// localStorage. The CSS reads the variables, and the defaults are in the CSS.
const FONTS: Record<string, string> = { system: "", serif: 'ui-serif, "New York", Georgia, serif', rounded: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif', mono: "var(--mono)" };
const SIZES = { chat: [12, 13, 15, 17], summary: [13, 15, 17, 21] };
// The grace time of the Face ID lock, in minutes (src/Lock.tsx).
const GRACE = [
  { value: "0", label: "Immediately" },
  { value: "1", label: "After 1 minute" },
  { value: "5", label: "After 5 minutes" },
  { value: "10", label: "After 10 minutes" },
];
type Part = keyof typeof SIZES;
// The dropdown of a setting: a gray pill with the choice and two small arrows. On the iPhone its list is the native menu
// of iOS: a <select> lies clear over the pill. On iOS 26 the pill
// itself is native too, in Liquid Glass (`data-dropdown`, src/chrome.ts), and its choice comes back as the choice of a
// native menu, by the id of the dropdown. Elsewhere the list is liquid glass (.menu), not the menu of the system.
export function Dropdown({ value, onChange, options, align = "end" }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; align?: "center" | "end" }) {
  const id = `dropdown${useId()}`;
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    menus.set(id, (v) => latest.current(v));
    return () => void menus.delete(id);
  }, [id]);
  // A theme other than the default draws its own menu, as on the Mac.
  useLook();
  if (phone && !android && !themed())
    return (
      <label className="select native-select" data-native={id} data-dropdown={JSON.stringify(options)} data-value={value}>
        <span>{options.find((o) => o.value === value)?.label ?? value}</span>
        <Icon name="chevrons" size={14} />
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v ?? "")} items={options}>
      <Select.Trigger className="select">
        <Select.Value>{(v: string) => options.find((o) => o.value === v)?.label ?? v}</Select.Value>
        <Icon name="chevrons" size={14} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="menu-layer" alignItemWithTrigger={false} align={align} sideOffset={4}>
          <Select.Popup className="menu select-menu">
            {options.map((o) => (
              <Select.Item key={o.value} className="menu-item" value={o.value}>
                <Select.ItemText>{o.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

// Two rows for the Model and Effort ranges: Minimum has the lowest model and the lowest effort, Maximum the highest of
// each. A lowest step above the highest moves the highest up to it, and the other way round. Equal ends: only that step.
type Steps = { value: string; label: string }[];
// A function, not a constant: App imports this file, so MODELS of App is not ready when this file loads.
const tierSteps = (): Steps => ["haiku", "sonnet", "opus", "fable"].map((a) => ({ value: a, label: MODELS.find((m) => m.alias === a)!.name }));
function Limits({ models, efforts, value, onChange }: { models: Steps; efforts: Steps; value: { models: string[]; efforts: string[] }; onChange: (value: { models?: string[]; efforts?: string[] }) => void }) {
  // Set end i (0 lowest, 1 highest) of one range, and move the other end along when it passes it.
  const set = (steps: Steps, range: string[], i: number, v: string) => {
    const at = (x: string) => steps.findIndex((s) => s.value === x);
    const other = range[1 - i];
    const keep = i === 0 ? at(v) <= at(other) : at(v) >= at(other);
    return i === 0 ? [v, keep ? other : v] : [keep ? other : v, v];
  };
  return (
    <>
      {["Minimum", "Maximum"].map((name, i) => (
        <div className="row" key={name}>
          <span>{name}</span>
          <div className="range">
            <Dropdown value={value.models[i]} onChange={(v) => onChange({ models: set(models, value.models, i, v) })} options={models} />
            <Dropdown value={value.efforts[i]} onChange={(v) => onChange({ efforts: set(efforts, value.efforts, i, v) })} options={efforts} />
          </div>
        </div>
      ))}
    </>
  );
}

// An on and off switch: each setting that is on or off, and the tunnel of a site. A choice of more than two
// stays a segmented control, as the theme. On the iPhone it is the switch of iOS itself: a checkbox with the `switch`
// attribute of WebKit (iOS 17.4 and later), in the primary color of the app.
// Elsewhere, and on an older iOS, it is the switch of the page. A click or a key does not reach the row.
const nativeSwitch = phone && !android && "switch" in HTMLInputElement.prototype;
const keep = (e: { stopPropagation(): void }) => e.stopPropagation();
// The Mac app. Omarchy is a page with no Tauri.
const macApp = !phone && "__TAURI_INTERNALS__" in window;
// The round picture of the account: the profile picture, else the first letter of the email.
function Avatar({ account }: { account: Account }) {
  return account.avatar ? <img className="avatar" src={account.avatar} alt="" draggable={false} /> : <i className="avatar">{account.email[0].toUpperCase()}</i>;
}
// A version "2.B.N" as its commit number N, with the channel: "707 · Dev".
const versionText = (v: string, c = "") => [v.split(".")[2] ?? v, c && c[0].toUpperCase() + c.slice(1)].filter(Boolean).join(" · ");
export function OnOff({ value, onChange, label, title }: { value: boolean; onChange: (on: boolean) => void; label: string; title?: string }) {
  // A theme other than the default draws its own switch. useLook draws it again when the theme changes.
  useLook();
  if (nativeSwitch && !themed())
    return (
      <input
        type="checkbox"
        className="native-switch"
        data-native={`switch:${label}`}
        data-toggle=""
        ref={(el) => el?.setAttribute("switch", "")}
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        onClick={keep}
        onKeyDown={keep}
        aria-label={label}
        title={title}
      />
    );
  return <button className="switch" role="switch" aria-checked={value} aria-label={label} title={title} onKeyDown={keep} onClick={(e) => (keep(e), onChange(!value))} />;
}

// The rows of one section of the Settings from the schema (bridge/settings/, docs/screen-api.md): a switch, a menu,
// a segmented control, a text field, a number, a slider or a list for each setting, and a named part of the app for a
// `custom` control, from `parts`. Rows with the same `group` share one box, with the help of the last one under it. So a
// new setting is one entry of the schema, with no new build, as the Settings of VS Code.
function SchemaRows({ schema, section, parts = {}, onSet }: { schema: Setting[]; section: string; parts?: Record<string, ReactNode>; onSet: (key: string, value: unknown) => void }) {
  const shown = schema.filter((s) => s.section === section && !(s.only === "phone" && !phone) && !(s.only === "mac" && !macApp));
  const boxes: Setting[][] = [];
  for (const s of shown) {
    const last = boxes.at(-1);
    if (s.control !== "custom" && s.group && last?.[0].group === s.group && last[0].control !== "custom") last.push(s);
    else boxes.push([s]);
  }
  return boxes.map((box) => {
    const first = box[0];
    if (first.control === "custom") return <Fragment key={first.key}>{parts[first.component ?? first.key]}</Fragment>;
    const help = [...box].reverse().find((s) => s.help)?.help;
    return (
      <Fragment key={first.key}>
        <div className="group">
          {box.map((s) => (
            <div key={s.key} className="row">
              <span>{s.label}</span>
              <SchemaControl s={s} onSet={onSet} />
            </div>
          ))}
        </div>
        {help && <p className="page-note">{swap(help)}</p>}
      </Fragment>
    );
  });
}
function SchemaControl({ s, onSet }: { s: Setting; onSet: (key: string, value: unknown) => void }) {
  const value = s.value ?? s.default;
  // A text, a number or a list goes when the field loses the focus, and a slider when the finger lets go.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [JSON.stringify(value)]);
  const set = (v: unknown) => onSet(s.key, v);
  const options = s.options ?? [];
  if (s.control === "toggle") return <OnOff value={!!value} onChange={set} label={s.label} />;
  if (s.control === "dropdown") return <Dropdown value={String(value ?? "")} onChange={set} options={options} />;
  if (s.control === "segmented")
    return (
      <div className="seg">
        {options.map((o) => (
          <button key={o.value} className={value === o.value ? "on" : undefined} onClick={() => set(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    );
  if (s.control === "slider")
    return (
      <input type="range" min={s.min} max={s.max} step={s.step} value={Number(draft ?? 0)} aria-label={s.label}
        onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={() => set(draft)} onKeyUp={() => set(draft)} />
    );
  const number = s.control === "number";
  const list = s.control === "list";
  return (
    <input className="field-input" type={number ? "number" : "text"} min={s.min} max={s.max} step={s.step} aria-label={s.label} autoCorrect="off" autoCapitalize="off" spellCheck={false}
      value={list ? (Array.isArray(draft) ? draft.join(", ") : "") : String(draft ?? "")}
      onChange={(e) => setDraft(list ? e.target.value.split(",").map((x) => x.trim()) : e.target.value)}
      onBlur={() => set(number ? Number(draft) : list ? (draft as string[]).filter(Boolean) : draft)} />
  );
}

// The accent of the theme (--accent in src/app.css): the open tab, the open agent, the running dots, the focus ring, the
// primary buttons, the switches, the links, the meters and the orb. "" keeps the accent of the screen in use (the red
// of the brand for Yonder, its own for each sample), else it is a hex color. config.json holds it ("accent",
// bridge/settings/appearance.json) for all the devices, and localStorage keeps a copy for a start with no bridge.
// shortcut: one hex for the light and the dark theme. A second shade for dark needs a style sheet, not inline variables.
export const ACCENTS: Record<string, string> = { orange: "#f76b15", green: "#30a46c", teal: "#12a594", blue: "#0090ff", violet: "#6e56cf", pink: "#d6409f" };
// A hex color, or "" for the accent of the screen. A name is an old value of phone.json.
export const accentOf = (v: unknown) => (typeof v !== "string" ? "" : ACCENTS[v] ?? (/^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : ""));
// The text on the accent: white, else near black on a light color (a relative luminance over 0.4, as a yellow has).
const onAccent = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#1d1d1f" : "#ffffff";
};
// The accent of the screen in use in the theme on the screen, for the Default swatch: the red of src/app.css, else the
// accent of the style.
const ownAccent = () => {
  const dark = document.documentElement.dataset.theme === "dark";
  return accentOf(shown().look.look?.[dark ? "dark" : "light"]?.accent) || (dark ? "#ff5c61" : "#e5484d");
};
// The count of the colors that the user picked, so a load of config.json that started before a pick does not put the
// old color back (the Settings and App.tsx load it when the Settings open).
let picks = 0;
export const accentPicks = () => picks;
// Puts the accent on <html>, over the tokens of the screen in use. A value keeps its copy in localStorage. Each own
// screen gets the new tokens too (the "accent" event, src/OwnScreen.tsx).
export function applyAccent(value?: unknown) {
  if (value !== undefined) localStorage.setItem("accent", accentOf(value));
  const color = accentOf(localStorage.getItem("accent"));
  const style = document.documentElement.style;
  const vars: Record<string, string> = color ? { "--accent": color, "--accent-text": onAccent(color), "--live": color, "--orb": color } : {};
  for (const name of ["--accent", "--accent-text", "--live", "--orb"]) vars[name] ? style.setProperty(name, vars[name]) : style.removeProperty(name);
  dispatchEvent(new Event("accent"));
}

export function applyFonts() {
  const style = document.documentElement.style;
  for (const part of Object.keys(SIZES) as Part[]) {
    const font = FONTS[localStorage.getItem(`${part}Font`) ?? ""];
    const size = localStorage.getItem(`${part}Size`);
    font ? style.setProperty(`--${part}-font`, font) : style.removeProperty(`--${part}-font`);
    size ? style.setProperty(`--${part}-size`, `${size}px`) : style.removeProperty(`--${part}-size`);
  }
}

// The keys of the Mac (the Keys section): a tap of the key alone, in any app (src-tauri/src/main.rs). New agent opens the
// notch at the top of the screen, and a second tap sends the words. Voice note listens in
// any app, and a second tap pastes the words where the user was (src-tauri/wake/Note.swift). It is off by default,
// because it needs the Accessibility permission, and macOS asks for a permission only when the user chose a key that
// needs it.
export type Keys = { notch: string; call: string; note: string };
export const DEFAULT_KEYS: Keys = { notch: "right-command", call: "off", note: "off" };
const KEY_ACTIONS = [
  ["notch", "New agent"],
  ["note", "Voice note"],
] as const;
// config.json holds the keys, so the user can write any key there by hand.
export const KEY_SETTINGS = { notch: "newAgentKey", note: "voiceNoteKey" } as const;
// A key is a modifier key alone, such as "right-command" or "left-control", a shortcut, such as "f13" or
// "ctrl+option+k", or "off". The button of an action records it, or the user writes it in config.json. A key that types
// needs a modifier, and only F1 to F20 go alone. parse_key of src-tauri/src/main.rs reads the names. One
// button shows the key and records another.
const KEY_WORDS: Record<string, string> = { Space: "space", Enter: "return", Tab: "tab", Backspace: "delete", Delete: "forwarddelete", Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown", ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`" };
const SIDE_WORDS: Record<string, string> = { Meta: "command", Alt: "option", Shift: "shift", Control: "control" };
const MOD_SIGNS: Record<string, string> = { ctrl: "⌃", control: "⌃", option: "⌥", opt: "⌥", alt: "⌥", shift: "⇧", cmd: "⌘", command: "⌘" };
const KEY_SIGNS: Record<string, string> = { return: "↩", tab: "⇥", delete: "⌫", forwarddelete: "⌦", left: "←", right: "→", up: "↑", down: "↓", space: "Space", home: "Home", end: "End", pageup: "Page Up", pagedown: "Page Down" };
const modsOf = (e: KeyboardEvent) => [e.ctrlKey && "ctrl", e.altKey && "option", e.shiftKey && "shift", e.metaKey && "cmd"].filter(Boolean) as string[];
// The name of a shortcut from a key down, or "" for a key that cannot be one.
const keyName = (e: KeyboardEvent) => {
  const mods = modsOf(e);
  const key = KEY_WORDS[e.code] ?? (/^(Key[A-Z]|Digit\d|F([1-9]|1\d|20))$/.test(e.code) ? e.code.replace(/^(Key|Digit)/, "").toLowerCase() : "");
  return key && (mods.length || /^f\d/.test(key)) ? [...mods, key].join("+") : "";
};
// "Right ⌘", "⌃⌥K", "F13" or "Off".
const keyLabel = (name: string) => {
  if (name === "off") return "Off";
  const side = name.match(/^(left|right)-(\w+)$/);
  if (side) return `${side[1] === "left" ? "Left" : "Right"} ${MOD_SIGNS[side[2]] ?? side[2]}`;
  const parts = name.split("+");
  const key = parts.pop() ?? "";
  return parts.map((m) => MOD_SIGNS[m.toLowerCase()] ?? m).join("") + (KEY_SIGNS[key.toLowerCase()] ?? key.toUpperCase());
};
// The shortcuts of the window (bridge/settings/keys.json), with the same names, but no modifier key alone. New chat,
// New project and Open folder are items of the menu (set_menu_keys of src-tauri/src/main.rs), and src/App.tsx reads
// the others with hit.
type Shortcut = { key: string; label: string; default: string; menu?: string };
export const SHORTCUTS = (SCHEMA as { section: string; component?: unknown }[]).filter((s) => s.section === "keys" && s.component === "shortcut") as unknown as Shortcut[];
const shortcuts: Record<string, string> = {};
const shortcutOf = (key: string) => shortcuts[key] ?? SHORTCUTS.find((s) => s.key === key)?.default ?? "off";
// One name for a shortcut in any order and with any word for a modifier: "cmd+shift+r" is "shift+cmd+r".
const MOD_WORDS: Record<string, string> = { control: "ctrl", opt: "option", alt: "option", command: "cmd" };
const MOD_ORDER = ["ctrl", "option", "shift", "cmd"];
const canon = (name: string) => {
  const parts = name.trim().toLowerCase().split("+");
  const key = parts.pop();
  return [...parts.map((m) => MOD_WORDS[m] ?? m).sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b)), key].join("+");
};
// True when a key down is the shortcut of a setting, by the place of the key or by its letter, so that ⌘W stays the key
// with W on it on another layout, as before the settings.
export const hit = (e: KeyboardEvent, key: string) => {
  const want = canon(shortcutOf(key));
  const mods = modsOf(e);
  return want !== "off" && [keyName(e), mods.length && e.key.length === 1 ? [...mods, e.key.toLowerCase()].join("+") : ""].some((n) => n && canon(n) === want);
};
// A shortcut as the menu of macOS writes it (muda): "shift+cmd+r" stays, and "return" is "Enter".
const ACCEL_WORDS: Record<string, string> = { return: "Enter", delete: "Backspace", forwarddelete: "Delete", opt: "Option" };
const accel = (name: string) => name.split("+").map((p) => ACCEL_WORDS[p] ?? p).join("+");
// The shortcuts of config.json, for hit and for the menu of the Mac app. An older Mac app has no set_menu_keys, so its
// menu keeps ⌘T, ⌘N and ⌘O.
export const applyShortcuts = (values: Record<string, unknown>) => {
  for (const s of SHORTCUTS) shortcuts[s.key] = typeof values[s.key] === "string" ? (values[s.key] as string) : s.default;
  if (macApp) void yonder.native.setMenuKeys({ keys: Object.fromEntries(SHORTCUTS.filter((s) => s.menu).map((s) => [s.menu, accel(shortcutOf(s.key))])) }).catch(() => {});
};

// The sections of the settings, as in the Settings of iOS: a line icon in the color of the text, the name, the value
// and a chevron. The phone also has Environment. Account is the card at the top of the list, as the Apple Account in iOS, and shows only
// when the account section applies.
type IconName = Parameters<typeof Icon>[0]["name"];
// The settings that the search finds (src/find.ts). `words` are other words for the setting, so that "dark mode" finds
// Theme. `row` is the text of the row or the heading that the section scrolls to, when it is not the name. An empty
// `row` opens the section at the top. `mac` and `phone` give the rows that show on one device only. `superuser` gives the
// rows that show only to a super user of yonder.so. `agent` opens the page of that CLI in the Agents section.
type Entry = { section: string; name: string; words: string; row?: string; agent?: string; mac?: boolean; phone?: boolean; superuser?: boolean };
const INDEX: Entry[] = [
  { section: "environment", name: "Pair a computer", words: "pair add switch unpair mac computer server linux ssh connect environment relay room", phone: true },
  { section: "environment", name: "Computers", words: "show hide isolate separate other computers environments agents apps checkbox switch reach link block mesh one way screen updates", phone: true },
  { section: "general", name: "Version", words: "update upgrade check build new commits rebuild source" },
  { section: "general", name: "Pair a phone", words: "pair qr code iphone android connect", mac: true },
  { section: "general", name: lockName, words: "lock unlock face id touch id fingerprint passcode privacy secure ask again grace minutes", phone: true },
  { section: "general", name: "1Password", words: "password secret login key token vault service account approve agents", phone: true },
  { section: "general", name: "Backup", row: "Export", words: "backup export import restore save config setup keys move new computer" },
  { section: "general", name: "Config file", row: "Config file", words: "config json file open edit settings workspaces agents" },
  { section: "schedules", name: "New schedule", words: "schedule recurring repeat every hours daily weekdays cron timer routine automatic run profile" },
  { section: "triggers", name: "New trigger", words: "trigger when event happens script webhook hook url api command poll watch file folder sentry github error issue alert automatic start set up claude code signing secret" },
  { section: "voice", name: "Microphone", words: "mic input audio device sound", mac: true },
  { section: "voice", name: "Pause music", words: "music media spotify pause airpods quality", mac: true },
  { section: "voice", name: "Call history", words: "calls transcripts past log history" },
  { section: "voice", name: "Voice model", row: "Model", words: "grok openai elevenlabs claude realtime provider speech key" },
  { section: "voice", name: "Speech to text", words: "stt soniox deepgram apple parakeet dictation dictate transcribe hear words" },
  { section: "keys", get name() { return swap("New agent"); }, words: "key keys shortcut hotkey keyboard right left command option shift control tap custom record any notch", mac: true },
  { section: "keys", name: "Voice note", words: "key keys shortcut hotkey keyboard right left command option shift control tap custom record any dictate dictation type paste text field", mac: true },
  { section: "general", name: "Default profile", words: "default profile new tasks cli codex gemini cursor" },
  { section: "agents", name: "Auto update", words: "harness version update grok claude install" },
  { section: "agents", name: "Look again", words: "check install sign in login cli find" },
  { section: "agents", name: "Add an agent", words: "acp registry new cli connect gemini kimi goose qwen" },
  { section: "agents", name: "Default model", agent: "claude", words: "model opus sonnet haiku fable auto claude code" },
  { section: "agents", name: "Minimum", agent: "claude", words: "min lowest model effort range clef cheap" },
  { section: "agents", name: "Maximum", agent: "claude", words: "max highest model effort range clef expensive" },
  { section: "agents", name: "Permissions", agent: "claude", words: "permission mode bypass accept edits ask auto" },
  { section: "agents", name: "Yonder plugins", agent: "claude", words: "mcp plugins tools server claude code sessions" },
  { section: "agents", name: "Profiles", agent: "claude", words: "profile account work personal flags variables add" },
  { section: "mcp", name: "Claude app", row: "Address", words: "mcp connector custom url address code pin verification claude ai web desktop phone plugins tools copy" },
  { section: "tools", name: "Browser Harness", words: "browser chrome harness tab click install plugin tool skill" },
  { section: "tools", name: "Visual Sandbox", words: "vsb image video sound audio generate install plugin tool skill" },
  { section: "tools", name: "Kokoro", words: "kokoro text to speech tts voice speak read aloud free install plugin tool skill" },
  { section: "tools", name: "The Mind", words: "mind second brain notes wiki log todo to-do tasks knowledge install plugin tool" },
  { section: "appearance", name: "Theme", words: "dark mode light night look" },
  { section: "appearance", name: "Word for an agent", words: "word name task mouse rename plural" },
  { section: "appearance", name: "Styles", words: "screen style styles theme look gallery sample terminal omarchy playful big button dashboard default reset undo ui" },
  { section: "appearance", name: "Custom themes", words: "custom own theme screen build make ui design fork mine versions roll back rollback delete" },
  { section: "appearance", name: "Color", words: "colour accent tint primary default orange green teal blue violet pink custom" },
  { section: "appearance", name: "Context text", row: "Context tab", words: "chat font size text larger smaller bigger typeface serif mono rounded markdown" },
  { section: "superuser", name: "Voice", words: "grok liora eve ara rex speaker sound everyone", superuser: true },
  { section: "superuser", name: "Spend", words: "money cost xai credit bill price", superuser: true },
  { section: "superuser", name: "Talk time", words: "minutes hours left", superuser: true },
  { section: "superuser", name: "Context", words: "tokens memory live call", superuser: true },
  { section: "superuser", name: "Replay setup", words: "first run onboarding questions again test", superuser: true },
  { section: "account", name: "Account", row: "", words: "email sign in sign out log in sign up" },
  { section: "account", name: "Invite friends", words: "referral invite friend share link affiliate" },
  { section: "account", name: "Delete account", words: "remove close account" },
  { section: "usage", name: "Usage", row: "Usage", words: "limits weekly week session hours percent reset quota grok build claude code" },
  { section: "feedback", name: "Feedback", row: "", words: "bug problem idea report screenshot send help contact" },
];

// A native update only: `shell`, a rebuild of the Mac app, and `release`, a new version of a download of the Mac or a
// newer phone app. A new screen loads by itself and shows nothing here (src/front.ts). Check asks the bridge and the stores at once. `held`: the screen of the
// computer when it needs a newer phone app that is not out yet, with no Update button.
type Update = { shell: boolean; release: string; held?: string; updating: boolean; onCheck: () => Promise<unknown>; onUpdate: () => void };

// The word for one agent and its plural (agentName in config.json). The screen keeps the word at once. The bridge
// stores it. An icon that the file already has stays.
function AgentWord({ value, onSave }: { value: unknown; onSave: (v: { one: string; many: string; icon?: string }) => void }) {
  const current = value && typeof value === "object" ? (value as { one?: string; many?: string; icon?: string }) : {};
  const [one, setOneName] = useState(current.one || word.one);
  const [many, setMany] = useState(current.many || word.many);
  useEffect(() => {
    setOneName(current.one || word.one);
    setMany(current.many || word.many);
  }, [current.one, current.many]);
  const save = () => {
    const single = one.trim() || "agent";
    const icon = current.icon || word.icon;
    const saved = { one: single, many: many.trim() || `${single}s`, ...(icon ? { icon } : {}) };
    const next = { ...saved, naming: word.naming };
    setWord(next);
    localStorage.setItem("agentName", JSON.stringify(next));
    onSave(saved);
  };
  return (
    <div className="group">
      <div className="row">
        <span>{swap("Word for an agent")}</span>
        <input className="field-input" aria-label="Word for one" value={one} onChange={(e) => setOneName(e.target.value)} onBlur={save} />
      </div>
      <div className="row">
        <span>Plural</span>
        <input className="field-input" aria-label="Word for many" value={many} onChange={(e) => setMany(e.target.value)} onBlur={save} />
      </div>
    </div>
  );
}

// A row of a profile or a CLI in Profiles. A right-click on the Mac, or a long press on the phone, gives Set as default,
// the same as the Default profile row of General.
function ProfileRow({ onClick, onDefault, children }: { onClick: () => void; onDefault?: () => void; children: ReactNode }) {
  return (
    <ContextMenu.Root disabled={!onDefault}>
      <ContextMenu.Trigger render={<button />} className="row nav" onClick={onClick}>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="menu-layer">
          <ContextMenu.Popup className="menu">
            <ContextMenu.Item className="menu-item" onClick={onDefault}>
              Set as default
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function Settings({ theme, setTheme, keys, setKeys, ranges, setRanges, mode, setMode, claudeMcp, setClaudeMcp, clis, setClis, setProfile, onCheckClis, claude, grok, online, update, onRefresh, onCalls, onOpenAgent, onPair, account, start = "", onClose }: { theme: string; setTheme: (t: string) => void; keys: Keys; setKeys: (keys: Keys) => void; ranges: { models: string[]; efforts: string[]; defaultModel: string }; setRanges: (ranges: { models?: string[]; efforts?: string[]; defaultModel?: string }) => void; mode: string; setMode: (mode: string) => void; claudeMcp: boolean; setClaudeMcp: (on: boolean) => void; clis: Clis; setClis: (change: Record<string, unknown>) => Promise<unknown>; setProfile: (body: object) => Promise<string>; onCheckClis: () => Promise<unknown>; claude: ClaudeUsage; grok: { spend: string; minutes: number; tokens?: number }; online: boolean; update: Update; onRefresh: () => Promise<unknown>; onCalls: () => void; onOpenAgent: (id: string) => void; onPair: () => void; account: { account?: Account; keys?: string[]; onSignIn: (mode: "signup" | "login") => void; onSignOut: () => void; onDelete: () => void }; start?: string; onClose: () => void }) {
  const [pairing, setPairing] = useState<Pairing>();
  const [macs, setMacs] = useState<Pairing[]>([]);
  // A switch of the Mac that waits for a start of the app (`hold.dirty` in src/link.ts): the name of that Mac.
  const [restart, setRestart] = useState("");
  const [adding, setAdding] = useState(false);
  // The computer whose details show under its row (the i of the row).
  const [details, setDetails] = useState("");
  const [screenFrom, setScreenFrom] = useState(() => localStorage.getItem(SCREEN_FROM));
  const loadMacs = () => Promise.all([loadPairing().then(setPairing), loadPairings().then(setMacs)]);
  const [checking, setChecking] = useState(false);
  const ready = update.shell || !!update.release;
  const check = () => (setChecking(true), update.onCheck().finally(() => setChecking(false)));
  // Check the version of the source when the settings open, so that the Update button shows without a click.
  useEffect(() => void check(), []);
  // The version of the installed app, which can be older than the screen (`__BUILD_ID__`) that came over the air.
  const [app, setApp] = useState<string>();
  useEffect(() => void installed().then(setApp), []);
  // The native app of this device. A Mac app next to a dev environment was built on this Mac. The phone apps get their
  // label (TestFlight, App Store) with a native build that tells it.
  const appName = phone ? (android ? "Android" : "iPhone") : "Mac";
  const appChannel = phone ? "" : channel === "dev" ? "local" : channel;
  const [versionsCopied, setVersionsCopied] = useState(false);
  const copyVersions = () => {
    const full = (v: string, c: string) => v + (c ? ` (${c[0].toUpperCase()}${c.slice(1)})` : "");
    const text = [`Environment ${full(__BUILD_ID__, channel)}`, app && `${appName} app ${full(app, appChannel)}`].filter(Boolean).join(" · ");
    setVersionsCopied(true);
    setTimeout(() => setVersionsCopied(false), 1500);
    void (phone ? navigator.clipboard.writeText(text) : yonder.tool("copy_to_clipboard", { text })).catch(() => {});
  };
  useEffect(() => void (phone && loadMacs()), []);
  // The schema of the Settings with the values (bridge/settings/). A change shows at once, and a refusal of the
  // bridge loads the true values again.
  const [schema, setSchema] = useState<Setting[]>(SCHEMA as Setting[]);
  const [sectionList, setSectionList] = useState<Section[]>(SECTIONS);
  // A load that started before a change gives the old values, so its answer goes: a tap in the first second of the
  // Settings kept its color for a moment and then went back.
  const changes = useRef(0);
  // A section of a newer bridge with no rows of the schema has its page in a newer screen. This screen hides it until it
  // updates. Else the phone shows an empty page when the bridge has the section before the phone loads the new screen.
  const loadSchema = () => {
    const at = changes.current;
    return yonder.settings.all().then((a) => {
      if (at !== changes.current) return;
      setSchema(a.settings);
      setSectionList(a.sections.filter((s) => SECTIONS.some((x) => x.id === s.id) || a.settings.some((x) => x.section === s.id)));
    }, () => {});
  };
  useEffect(() => void loadSchema(), []);
  const setOne = (key: string, value: unknown) => {
    changes.current++;
    setSchema((all) => all.map((s) => (s.key === key ? { ...s, value } : s)));
    if (key === "agentNaming" && (value === "numbers" || value === "names" || value === "projects")) {
      const naming = value as "numbers" | "names" | "projects";
      const next = { one: word.one, many: word.many, ...(word.icon ? { icon: word.icon } : {}), naming };
      setWord(next);
      localStorage.setItem("agentName", JSON.stringify(next));
    }
    yonder.settings.set(key, value).catch(loadSchema);
  };
  // The accent of config.json, also after a change by hand or on another device.
  const savedAccent = schema.find((s) => s.key === "accent")?.value;
  useEffect(() => void (savedAccent !== undefined && (setAccent(accentOf(savedAccent)), applyAccent(savedAccent))), [savedAccent]);
  // The open section: "" is the list of the sections. A section is a page over the list, as in iOS, so its back button
  // and its swipe back go to the list, and the list follows the finger. The weekly percent of the title bar opens the
  // settings on the Usage section. There the back closes the settings, so one tap goes back to where the user was.
  // "profile:<id>" opens the page of that profile in Agents, as Sign in of the toast of a profile that is not signed in.
  const startProfile = start.startsWith("profile:") ? start.slice(8) : "";
  const startSection = startProfile ? "agents" : start;
  const [section, setSection] = useState(startSection);
  const sectionBack = start && section === startSection ? onClose : () => setSection("");
  // The Account section loads the account again when it opens, so a new email or picture from another device shows,
  // and the rows of a newer yonder.so show with no new start of the app.
  useEffect(() => {
    if (section === "account") void refreshAccount();
  }, [section]);
  // The CLI whose page is open in the Agents section, and the profile whose page is open over it: its ID, "new" for a
  // new one, or "".
  const [agent, setAgent] = useState("");
  const [editing, setEditing] = useState(startProfile);
  const closeAgent = () => (setAgent(""), setEditing(""));
  const cli = clis.clis.find((c) => c.id === agent && !c.base);
  const profiles = clis.clis.filter((c) => c.base && c.base === agent);
  // The Profiles list: each CLI, then the profiles of that CLI. A CLI with no binary stays out, except Claude Code.
  const profileRows = clis.clis.filter((c) => !c.base && (c.id === "claude" || c.path || c.on)).flatMap((b) => [b, ...clis.clis.filter((c) => c.base === b.id)]);
  const openProfile = clis.clis.find((c) => c.id === editing);
  const usedProfile = clis.clis.find((c) => c.id === clis.cli);
  const profileCli = openProfile?.base || usedProfile?.base || usedProfile?.id || "claude";
  const profileSmall = (c: Cli) => {
    if (c.profile?.own && !c.account) return "Not signed in";
    const claudeRow = c.id === "claude" || c.base === "claude";
    const model = claudeRow ? (ranges.defaultModel === "auto" ? "Auto" : ranges.defaultModel) : c.model || "Default";
    const perm = claudeRow ? mode : c.mode;
    const permName = c.modes?.find((m) => m.mode === perm)?.name ?? MODES.find((m) => m.mode === perm)?.name ?? "";
    return [model, permName, usageLabel(c)].filter(Boolean).join(", ");
  };
  // The schedules of the Schedules and the Triggers sections, and the one whose page is open: its ID, "new" or
  // "new-trigger" for a new one, or "". A trigger (Sentry or Webhook) shows only in Triggers, where the
  // user looks for it.
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedule, setSchedule] = useState("");
  const reloadSchedules = () => loadSchedules().then(setSchedules, () => {});
  const starts = section === "schedules" || section === "triggers";
  useEffect(() => {
    setSchedule("");
    if (starts) void reloadSchedules();
  }, [section]);
  // The other computers that give no answer, marked "Disconnected" in the Environment section.
  // Undefined until each computer answers or not. The phone asks the hidden computers too, so each row has its tag.
  const [offline, setOffline] = useState<string[]>();
  useEffect(() => void (phone && section === "environment" && elsewhere(true).then((e) => setOffline(e.filter((o) => !o.workers).map((o) => o.mac)), () => {})), [section]);
  const [query, setQuery] = useState("");
  const edge = useSwipeBack(onClose);
  const sectionEdge = useSwipeBack(sectionBack);
  const agentEdge = useSwipeBack(closeAgent);
  // Open a section, or the page of a CLI in it, and scroll to one row or heading of it, which flashes once.
  const open = (id: string, row = "", cli = "") => {
    setSection(id);
    setAgent(cli);
    setEditing("");
    setQuery("");
    requestAnimationFrame(() => {
      const top = [...document.querySelectorAll(".page")].at(-1);
      const found = [...(top?.querySelectorAll<HTMLElement>(".page-section, .group .row > span:first-child") ?? [])].find((el) => el.firstChild?.textContent?.trim() === row);
      const target = found?.classList.contains("page-section") ? found : found?.closest<HTMLElement>(".row");
      if (!row || !target) return;
      target.scrollIntoView({ block: "center" });
      target.animate([{ background: "var(--hover)" }, { background: "transparent" }], { duration: 1200 });
    });
  };
  // The microphones of the Mac. Their names show only after Yonder got the microphone once.
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [mic, setMic] = useState(() => localStorage.getItem("mic") ?? "");
  useEffect(() => {
    if (phone) return;
    const load = () => navigator.mediaDevices.enumerateDevices().then((all) => setMics(all.filter((d) => d.kind === "audioinput" && d.deviceId !== "default")), () => {});
    load();
    navigator.mediaDevices.addEventListener("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener("devicechange", load);
  }, []);
  const [provider, setProvider] = useState(voiceProvider);
  const chooseProvider = (p: VoiceProvider) => {
    setProvider(p);
    localStorage.setItem("voiceProvider", p);
    syncPhoneConfig();
  };
  const [sttModel, setSttModel] = useState(() => localStorage.getItem("stt") ?? "");
  const chooseStt = (m: string) => {
    setSttModel(m);
    localStorage.setItem("stt", m);
    syncPhoneConfig();
  };
  const chooseMic = (id: string) => {
    setMic(id);
    localStorage.setItem("mic", id);
    localStorage.setItem("micName", mics.find((d) => d.deviceId === id)?.label ?? "");
    syncAudio();
  };
  const [pauseMusic, setPauseMusic] = useState(() => localStorage.getItem("pauseMusic") !== "off");
  const choosePause = (on: boolean) => {
    setPauseMusic(on);
    localStorage.setItem("pauseMusic", on ? "on" : "off");
    syncAudio();
  };
  const [fonts, setFonts] = useState(() => Object.fromEntries(["chatFont", "chatSize", "summaryFont", "summarySize"].map((k) => [k, localStorage.getItem(k) ?? ""])));
  const chooseFont = (key: string, value: string) => {
    setFonts((f) => ({ ...f, [key]: value }));
    localStorage.setItem(key, value);
    applyFonts();
    syncPhoneConfig();
  };
  // The accent shows at once. The color picker goes to config.json when the finger stops for 0.4 seconds.
  const [accent, setAccent] = useState(() => accentOf(localStorage.getItem("accent")));
  const accentTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const chooseAccent = (a: string, wait = 0) => {
    setAccent(a);
    applyAccent(a);
    changes.current++;
    picks++;
    clearTimeout(accentTimer.current);
    accentTimer.current = setTimeout(() => setOne("accent", a), wait);
  };
  // The Face ID lock (src/Lock.tsx). On needs one unlock first, so the user knows that it works on this phone.
  const [canLock, setCanLock] = useState(false);
  const [faceLock, setFaceLock] = useState(lockOn);
  const [push, setPushState] = useState(pushOn);
  // The way to the computer in use, "lan" or "relay". The link changes it by itself, so the tag reads it again.
  // `ms`: the time of the last poll of the agents, which shows the speed of the link, such as "Relay · 180 ms".
  const [via, setVia] = useState(linkVia);
  const [ms, setMs] = useState(pollTime.ms);
  useEffect(() => {
    const timer = setInterval(() => (setVia(linkVia()), setMs(pollTime.ms)), 2000);
    return () => clearInterval(timer);
  }, []);
  const choosePush = (on: boolean) => (setPushState(on), setPush(on));
  const [hidden, setHiddenState] = useState(hiddenNow);
  // The last computer that shows stays. A hidden computer in use gives its place to the next one that shows, a
  // connected one first, as a tap on a project of that computer does (src/App.tsx).
  const toggleShown = (mac: string) => {
    const hide = !hidden.includes(mac);
    if (hide && macs.every((m) => m.mac === mac || hidden.includes(m.mac))) return;
    const next = hide ? [...hidden, mac] : hidden.filter((m) => m !== mac);
    setHiddenState(next);
    setHidden(next);
    const to = macs.filter((m) => !next.includes(m.mac)).sort((a, b) => Number(!!offline?.includes(a.mac)) - Number(!!offline?.includes(b.mac)))[0];
    // The settings close first, as a switch always did: they hold the values of the old computer.
    if (hide && mac === pairing?.mac && to) (onClose(), void switchPairing(to));
  };
  // The other computers that can reach the computer whose details are open: `blockedComputers` of its config.json, the
  // names or public keys of the others that it does not let in (bridge/relay.ts). A link can go in
  // one way, or none, and config.json can change it too. Undefined until it loads, and while the computer is off.
  const [blocked, setBlocked] = useState<string[]>();
  const settingsOf = (mac: string) => (mac === pairing?.mac ? bridgeFetch : reach(mac).fetch);
  const loadBlocked = (mac: string) =>
    settingsOf(mac)("/settings")
      .then((r) => r.json())
      .then((s) => setBlocked(s.values?.blockedComputers ?? []), () => setBlocked(undefined));
  useEffect(() => void (setBlocked(undefined), details && loadBlocked(details)), [details]);
  // A new name of a computer shows at once. Then it goes to computerName of its config.json, and the phone tells the other
  // computers with the next lists (introduce in src/elsewhere.ts).
  const rename = (mac: string, value: string) => {
    const name = value.trim().slice(0, 60);
    if (!name) return;
    void renamePairing(mac, name).then(loadMacs);
    void settingsOf(mac)("/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "computerName", value: name }) }).catch(() => {});
  };
  const blocks = (list: string[], o: Pairing) => list.some((x) => x.toLowerCase() === macName(o).toLowerCase() || x === o.mac);
  // The block holds the public key, not the name, so that it stays after a rename.
  const toggleReach = (mac: string, o: Pairing) => {
    const next = blocks(blocked!, o) ? blocked!.filter((x) => !blocks([x], o)) : [...blocked!, o.mac];
    setBlocked(next);
    settingsOf(mac)("/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "blockedComputers", value: next }) })
      .then((r) => { if (!r.ok) throw new Error(); })
      .catch(() => loadBlocked(mac));
  };
  // The grace time of the lock. The row shows only on an iPhone app that hears the lock of the phone (`phoneLock`).
  const [canGrace, setCanGrace] = useState(false);
  const [grace, setGrace] = useState(() => String(graceMinutes()));
  useEffect(() => void (phone && (lockAvailable().then(setCanLock), phoneLock().then(() => setCanGrace(true), () => {}))), []);
  const chooseLock = (on: boolean) =>
    (on ? unlock() : Promise.resolve()).then(() => (localStorage.setItem("faceLock", on ? "on" : "off"), setFaceLock(on), phoneLock().catch(() => {})), () => {});
  // Face ID for the relay (GUARD in bridge/relay.ts): the key of the Secure Enclave (Guard.swift), and the state on the Mac.
  // The row shows only on an iPhone app with the key and a bridge with the guard. A change needs Face ID first.
  const [guardKey, setGuardKey] = useState("");
  const [guardOn, setGuardOn] = useState<boolean>();
  const loadGuard = () =>
    bridgeFetch("/guard")
      .then((r) => (r.ok ? r.json() : undefined))
      .then((g) => setGuardOn(g?.on), () => {});
  useEffect(() => void (phone && invoke<string>("guard_key").then((k) => (setGuardKey(k), void (k && loadGuard())), () => {})), []);
  const chooseGuard = async (on: boolean) => {
    const { challenge } = await bridgeFetch("/guard").then((r) => r.json());
    const sig = await invoke<string>("guard_sign", { challenge }).catch(() => "");
    if (!sig) return;
    const res = await bridgeFetch("/guard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pub: on ? guardKey : "", sig }) });
    if (res.ok) setGuardOn((await res.json()).on);
    else loadGuard();
  };
  const chooseGrace = (minutes: string) => (setGrace(minutes), localStorage.setItem("faceGrace", minutes), phoneLock().catch(() => {}));
  // The model, the Grok voice, the speech to text and the cost show only to a super user of yonder.so.
  // Delete account asks first. The page on yonder.so then asks for the password.
  const deleteAccount = async () => {
    const title = "Delete your account?";
    const text = "Your account and its data are deleted for good. yonder.so opens to confirm with your password.";
    const yes = await nativeAsk(text, { title, kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" }).catch(() => confirm(`${title}\n\n${text}`));
    if (yes) account.onDelete();
  };
  const superuser = !!account.account?.superuser;
  // The Grok voice of the calls of each account (yonder.so). It changes on the screen first, and comes back on an error.
  const [grokVoice, setGrokVoice] = useState(account.account?.voice ?? "liora");
  useEffect(() => setGrokVoice(account.account?.voice ?? "liora"), [account.account?.voice]);
  const chooseVoice = (v: string) => {
    setGrokVoice(v);
    setVoice(v).catch(() => setGrokVoice(saved()?.account.voice ?? "liora"));
  };
  // The sections come from the schema (bridge/settings/), one page for each. Keys only in the Mac app: the window on
  // Omarchy and the phones have no keys of their own. The name of Agents is the word of the user, such as Tasks.
  const sections = sectionList.filter((s) => !(s.only === "phone" && !phone) && !(s.only === "mac" && !macApp) && !(s.superuser && !superuser)).map((s) => ({ ...s, name: swap(s.name) }));
  const nameOf = (id: string) => sections.find((s) => s.id === id)?.name ?? "";
  // A key does one thing: the key of one action goes off for the others. Each change goes to config.json.
  const chooseKey = (action: keyof Keys, key: string) => {
    const next = { ...keys, [action]: key };
    for (const [other] of KEY_ACTIONS) if (other !== action && key !== "off" && next[other] === key) next[other] = "off";
    setKeys(next);
    for (const [a] of KEY_ACTIONS) if (next[a] !== keys[a]) setOne(KEY_SETTINGS[a], next[a]);
  };
  // A shortcut of the window does one thing too. Each change goes to config.json and to the menu.
  const shortcutValue = (key: string) => String(schema.find((s) => s.key === key)?.value ?? shortcutOf(key));
  const chooseShortcut = (key: string, name: string) => {
    const next = Object.fromEntries(SHORTCUTS.map((s) => [s.key, shortcutValue(s.key)]));
    next[key] = name;
    for (const s of SHORTCUTS) if (s.key !== key && name !== "off" && canon(next[s.key]) === canon(name)) next[s.key] = "off";
    for (const s of SHORTCUTS) if (next[s.key] !== shortcutValue(s.key)) setOne(s.key, next[s.key]);
    applyShortcuts(next);
  };
  // The button of an action records the next key: a modifier key that goes up alone (only for a key of any app), or a
  // shortcut. Delete alone turns the action off. Escape, a click or another section stops it. `recording` is "notch",
  // "note" or the setting of a shortcut of the window.
  const [recording, setRecording] = useState("");
  useEffect(() => {
    if (!recording) return;
    const anywhere = recording === "notch" || recording === "note";
    let alone = "";
    const done = (key?: string) => (key && (anywhere ? chooseKey(recording, key) : chooseShortcut(recording, key)), setRecording(""));
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const side = e.code.match(/^(Meta|Alt|Shift|Control)(Left|Right)$/);
      const held = [e.ctrlKey, e.altKey, e.shiftKey, e.metaKey].filter(Boolean).length;
      if (side) return void (alone = anywhere && held === 1 ? `${side[2].toLowerCase()}-${SIDE_WORDS[side[1]]}` : "");
      alone = "";
      if (e.code === "Escape") return done();
      if (e.code === "Backspace" && !held) return done("off");
      const name = keyName(e);
      if (name) done(name);
    };
    const up = (e: KeyboardEvent) => void (alone && (e.preventDefault(), done(alone)));
    const stop = () => done();
    addEventListener("keydown", down, true);
    addEventListener("keyup", up, true);
    addEventListener("pointerdown", stop, true);
    return () => {
      removeEventListener("keydown", down, true);
      removeEventListener("keyup", up, true);
      removeEventListener("pointerdown", stop, true);
    };
  }, [recording]);
  useEffect(() => setRecording(""), [section]);
  const recordButton = (id: string, value: string) => (
    <button className={recording === id ? "primary" : undefined} onClick={() => setRecording(id)}>
      {recording === id ? "Press a key" : keyLabel(value)}
    </button>
  );
  // The CLIs other than Claude Code are rows of the Agents section too, so that "codex" finds them.
  const index: Entry[] = [
    ...INDEX.map((e) => (e.section === "usage" ? { ...e, name: `${claude.plan?.name ?? "Claude Code"} usage`, row: claude.plan?.name ?? "Claude Code" } : e)),
    ...schema.filter((s) => s.control !== "custom").map((s) => ({ section: s.section, name: s.label, words: s.words ?? "", mac: s.only === "mac", phone: s.only === "phone" })),
    ...clis.clis.filter((c) => c.id !== "claude").map((c) => ({ section: "agents", name: c.name, row: "", agent: c.base ?? c.id, words: "cli install update sign in model effort permissions profile" }))];
  // The name of the section is a word of each of its settings too, so that "voice" finds the rows of Voice.
  const results = find(query, index.map((e) => ({ ...e, words: `${e.words} ${nameOf(e.section)}` })).filter((e) => sections.some((s) => s.id === e.section) && !(e.mac && phone) && !(e.phone && !phone) && !(e.superuser && !superuser)));
  // The Agents section. Install and Reinstall run a command on the computer, also from a tap on the phone, so the user
  // sees the command and confirms it first, as for a closed tunnel. The bridge runs it with no terminal, and the card of
  // the CLI (Logins) shows that it runs, then its sign-in. Sign in starts the sign-in of the card at once. A CLI with no
  // sign-in of its own for the phone, such as Antigravity, signs in in a new terminal tab of the computer.
  const [looking, setLooking] = useState(false);
  const [signing, setSigning] = useState(0);
  const terminal = async (c: Cli, action: "install" | "login") => {
    if (action === "login" && c.signIn) return void yonder.logins.run(c.id, action).finally(() => setSigning((n) => n + 1));
    const command = action === "install" ? c.install : c.login;
    // Install again over a CLI that runs gets its latest version: each install command asks for @latest or the newest.
    const verb = !c.path ? "Install" : c.error ? "Reinstall" : "Update";
    const title = action === "install" ? `${verb} ${c.name}?` : `Sign in to ${c.name}?`;
    const text =
      action === "install"
        ? `Yonder runs this command on ${phone ? "your computer" : "this computer"}:\n\n${command}`
        : `Yonder runs this command in a new terminal tab on the computer, so that you can see it${phone ? ". Finish it on the computer" : ""}:\n\n${command}`;
    const yes = await nativeAsk(text, { title, kind: "warning", okLabel: action === "install" ? verb : "Sign in", cancelLabel: "Cancel" }).catch(() => confirm(`${title}\n\n${text}`));
    if (!yes) return;
    await yonder.logins.run(c.id, action, !(action === "install" && c.install));
    setSigning((n) => n + 1);
    // The install runs after this call returns. The version row loads again when the card ends.
    if (action === "install") {
      const until = Date.now() + 180_000;
      const tick = () => {
        void yonder.logins.list().then((list: { id?: string; step?: string; error?: string }[]) => {
          const row = Array.isArray(list) ? list.find((l) => l.id === c.id && l.step === "install") : undefined;
          if (row && !row.error && Date.now() < until) setTimeout(tick, 4000);
          else void onCheckClis();
        }, () => void onCheckClis());
      };
      setTimeout(tick, 4000);
    }
  };
  // The Tools section (bridge/tools.ts): the tools on the computer of the bridge. Install runs only after a tap and a
  // yes, and the row shows "Installing…" at once.
  type Tool = { id: string; name: string; about: string; url: string; path?: string; skill: boolean; busy: boolean; error?: string };
  const [tools, setTools] = useState<Tool[]>([]);
  const loadTools = () => yonder.tools.list().then(setTools, () => {});
  useEffect(() => {
    if (section === "tools") void loadTools();
  }, [section]);
  const installing = section === "tools" && tools.some((t) => t.busy);
  useEffect(() => {
    if (!installing) return;
    const timer = setInterval(loadTools, 2000);
    return () => clearInterval(timer);
  }, [installing]);
  const install = async (t: Tool) => {
    const title = `${t.path ? "Add the skill of" : "Install"} ${t.name}?`;
    const text = swap(`Yonder installs it on ${phone ? "your computer" : "this computer"}, so that agents can use it.`);
    const yes = await nativeAsk(text, { title, kind: "info", okLabel: "Install", cancelLabel: "Cancel" }).catch(() => confirm(`${title}\n\n${text}`));
    if (!yes) return;
    setTools((list) => list.map((x) => (x.id === t.id ? { ...x, busy: true, error: undefined } : x)));
    await yonder.tools.install(t.id).then(setTools, loadTools);
  };
  // Add an agent: any agent of the ACP registry (bridge/registry.ts). The bridge downloads it and runs it, so the user
  // confirms first, and its row shows at once.
  const [registry, setRegistry] = useState<{ id: string; name: string; description: string; added: boolean }[]>([]);
  const [joining, setJoining] = useState<string[]>([]);
  useEffect(() => {
    if (section === "agents") yonder.agents.registry().then(setRegistry, () => {});
  }, [section]);
  const add = async (id: string) => {
    const a = registry.find((x) => x.id === id);
    if (!a) return;
    const title = `Add ${a.name}?`;
    const text = `${a.description}\n\nYonder downloads ${a.name} from the ACP registry, and runs it on the Mac.`;
    const yes = await nativeAsk(text, { title, kind: "warning", okLabel: "Add", cancelLabel: "Cancel" }).catch(() => confirm(`${title}\n\n${text}`));
    if (!yes) return;
    setJoining((list) => [...list, a.name]);
    const res = await yonder.agents.add(id).catch(() => undefined);
    const data = await res?.json().catch(() => ({}));
    if (res?.ok) {
      setRegistry((list) => list.map((x) => (x.id === id ? { ...x, added: true } : x)));
      await onCheckClis();
    }
    setJoining((list) => list.filter((n) => n !== a.name));
    if (!res?.ok) {
      const error = data?.error ?? "The Mac does not answer.";
      await nativeMessage(error, { title: `${a.name} was not added`, kind: "error" }).catch(() => alert(error));
    }
  };

  // The pull to refresh. A vertical pull at the top moves the page down, and a release after PULL px refreshes.
  // A horizontal swipe stays the swipe back.
  const page = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  useEffect(() => {
    const el = page.current;
    if (!phone || !el) return;
    let start: { x: number; y: number; axis?: "x" | "y" } | null = null;
    let dy = 0;
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      // The page that scrolls: the open section or the list.
      const scroller = (e.target as Element).closest(".page") ?? el;
      start = scroller.scrollTop <= 0 && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
      dy = 0;
    };
    const drag = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const x = t.clientX - start.x;
      const y = t.clientY - start.y;
      if (!start.axis && Math.max(Math.abs(x), Math.abs(y)) > 8) start.axis = y > Math.abs(x) ? "y" : "x";
      if (start.axis !== "y") return;
      // Half of the finger distance, as the pull of iOS, and 96 px at most.
      dy = Math.min(96, Math.max(0, y / 2));
      setPull(dy);
    };
    const up = () => {
      if (start?.axis === "y" && dy >= PULL) {
        setBusy(true);
        // The icon spins 10 seconds at most, also when a request to the Mac does not come back.
        const done = Promise.all([refresh.current(), loadMacs()]);
        Promise.race([done, new Promise((r) => setTimeout(r, 10_000))]).finally(() => setBusy(false));
      }
      start = null;
      setPull(0);
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", drag, { passive: true });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", drag);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
    };
  }, []);
  const shown = busy ? 40 : pull;
  // The refresh icon shows at the top of the page on top: the open section or the list.
  const pullIcon = phone && (
    <div className={`pull${pull ? " live" : ""}`} style={{ height: shown }} aria-hidden={!busy}>
      <span className={busy ? "spin" : undefined} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / PULL) }}>
        <Icon name="refresh" />
      </span>
    </div>
  );

  // The value of each section in the list, as Wi-Fi shows the name of the network in the Settings of iOS.
  const week = weekLimit(claude);
  const values: Record<string, string | undefined> = {
    environment: pairing?.name,
    general: ready ? "Update" : undefined,
    agents: clis.clis.find((c) => c.id === clis.cli)?.name,
    appearance: theme === "dark" ? "Dark" : theme === "system" ? "System" : "Light",
    usage: week && `${week.percent}%`,
    voice: hasVoiceKey(provider) ? VOICE_PROVIDERS[provider] : undefined,
  };
  // The referral link of the account. The phone opens the share sheet, and the Mac copies the link.
  const [copied, setCopied] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [emailDraft, setEmailDraft] = useState<string>();
  const [accountNote, setAccountNote] = useState("");
  const choosePhoto = (file?: File) => {
    if (!file) return;
    setAccountNote("");
    setAvatar(file).catch((e) => setAccountNote(e.message || "The photo did not save. Try again."));
  };
  const changeEmail = () => {
    const email = emailDraft?.trim() ?? "";
    setAccountNote(`We sent a link to ${email}. Open it to change your email.`);
    setEmailDraft(undefined);
    setEmail(email).catch((e) => (setAccountNote(e.message), setEmailDraft(email)));
  };
  const shareReferral = async () => {
    const url = account.account?.referral;
    if (!url) return;
    if (phone && navigator.share) return navigator.share({ text: "Talk to your Claude Code agents with Yonder. It is free.", url }).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    await (phone ? navigator.clipboard.writeText(url) : yonder.tool("copy_to_clipboard", { text: url })).catch(() => {});
  };
  // The Claude app as a client of the connector of Yonder (connect_claude in bridge/main.ts), in the MCP section. The
  // address never changes. The code of 6 digits works one time, for 5 minutes, and the page of Claude also sends it to
  // the phones. Claude Code needs no row: the Yonder plugins switch of
  // Agents gives it the plugins.
  const [connector, setConnector] = useState<{ url: string; connected: string[]; code?: string; error?: string }>();
  const [copiedAddress, setCopiedAddress] = useState(false);
  const loadConnector = () =>
    yonder.tool<{ url: string; code: string; connected: string[] }>("connect_claude", {}, 0)
      .then(setConnector, (e) => setConnector((c) => ({ url: c?.url ?? "", connected: c?.connected ?? [], error: (e as Error).message })));
  useEffect(() => void (section === "mcp" && loadConnector()), [section]);
  // The address goes to the clipboard at once, in the tap, and the bridge makes a new code.
  const copyConnector = (text: string) => {
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 1500);
    void (phone ? navigator.clipboard.writeText(text) : yonder.tool("copy_to_clipboard", { text })).catch(() => {});
    void loadConnector();
  };
  const disconnect = async () => {
    const title = "Disconnect each Claude app?";
    const text = "Each Claude app must connect again with a new code.";
    const yes = await nativeAsk(text, { title, kind: "warning", okLabel: "Disconnect", cancelLabel: "Cancel" }).catch(() => confirm(`${title}\n\n${text}`));
    if (!yes) return;
    setConnector((c) => c && { ...c, connected: [], code: undefined });
    void yonder.tool("connect_claude", { revoke: true }, 0).catch(() => {}).finally(loadConnector);
  };

  return (
    <div ref={page} className="page">
      {!section && pullIcon}
      <div ref={edge} className="page-body">
        {/* The title sits in the row of the back button. On the phone it is in the
            center, as the title bar of the app and the Settings of iOS. */}
        <div className="page-head">
          <button className="icon page-back" data-native="page-back" data-icon="back" data-glyph="22" onClick={onClose} title="Back" aria-label="Back">
            <Icon name="back" />
          </button>
          <h1 className="page-title">Settings</h1>
        </div>
        {/* The list of the sections and the search, as the Settings of iOS. A tap on a section or on a result opens the
            section. */}
        <label className="settings-search">
          <Icon name="search" size={16} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search the settings" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
        </label>
        {query.trim() ? (
          results.length ? (
            <div className="group">
              {results.map((r) => (
                <button key={r.section + r.name} className="row nav" onClick={() => open(r.section, r.row ?? r.name, r.agent)}>
                  <span>
                    {r.name}
                    <small>{nameOf(r.section)}</small>
                  </span>
                  <Icon name="forward" size={16} />
                </button>
              ))}
            </div>
          ) : (
            <p className="page-note">No settings match.</p>
          )
        ) : (
          <>
            {/* The account is the card at the top, as the Apple Account in the Settings of iOS. With no account, it opens
                the sign-up page at once, and shows the logo of yonder.so (src/logo.svg, a copy of landing/public/logo.svg). A free
                tunnel comes with the account, and a call needs none, so the line under it tells of the tunnel. */}
            <div className="group">
              <button className="row nav me" onClick={() => (account.account ? open("account") : account.onSignIn("signup"))}>
                {account.account ? <Avatar account={account.account} /> : <img className="avatar logo" src={logo} alt="" draggable={false} />}
                <span>
                  {account.account?.email ?? "Sign in to Yonder"}
                  {!account.account && <small>Sign up to get your tunnel</small>}
                </span>
                <Icon name="forward" size={16} />
              </button>
            </div>
            <div className="group">
              {sections
                .filter((s) => s.id !== "account" && s.home !== false)
                .map((s) => (
                  <button key={s.id} className="row nav" onClick={() => open(s.id)}>
                    <i className="nav-icon">
                      <Icon name={s.icon as IconName} size={20} />
                    </i>
                    <span>{s.name}</span>
                    {values[s.id] && <span className="value">{values[s.id]}</span>}
                    <Icon name="forward" size={16} />
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
      {/* The open section: a page over the list, which slides in from the right. The back button and the swipe back go
          to the list.
          Each row has only its name and its control. The text that tells what the rows do is under their group, as in
          the Settings of iOS, so the controls do not push it into narrow columns. */}
      {section && (
      <div className="page">
      {pullIcon}
      <div ref={sectionEdge} className="page-body">
        <div className="page-head">
          <button className="icon page-back" data-native="section-back" data-icon="back" data-glyph="22" onClick={sectionBack} title={sectionBack === onClose ? "Back" : "Settings"} aria-label={sectionBack === onClose ? "Back" : "Back to Settings"}>
            <Icon name="back" />
          </button>
          <h1 className="page-title">{nameOf(section)}</h1>
        </div>
        {/* The environments: the computers that the phone is paired with, Macs and Linux servers. They have a tab of
            their own, before General. The list is as the networks of Wi-Fi in iOS, so the rows stay calm. */}
        {section === "environment" && !phone && (
          <div className="settings-panel">
            <div className="group">
              <div className="row">
                <span>This Mac<small>Connected</small></span>
              </div>
            </div>
            <SchemaRows schema={schema} section="environment" onSet={setOne} />
            <div className="group">
              <button className="row nav" onClick={() => setSection("mcp")}>
                <span>MCP</span>
                <Icon name="forward" size={16} />
              </button>
            </div>
            <p className="page-note">MCP connects the Claude app. Tunnel reaches the sites of this Mac from the phone.</p>
          </div>
        )}
        {phone && section === "environment" && (
          <div className="settings-panel">
            <h2 className="page-section">Computers</h2>
            <div className="group">
              {/* Each computer with its tag, Connected or Disconnected, and a switch that shows or hides its projects,
                  agents and apps on this phone. The phone picks the computer in use by itself: the one of the last
                  project that the user opened. The i shows the relay, the room, the computers that can reach it, and
                  Unpair. An old pairing has no name, so it shows "Mac". Each row has only a tag and a switch, and
                  the user picks no computer. */}
              {macs.map((m) => {
                const current = m.mac === pairing?.mac;
                const name = m.name || "Mac";
                return (
                  <Fragment key={m.mac}>
                    <div className="row computer">
                      <div className="pick">
                        <span>
                          {name}
                          {/* Local: the phone reaches the computer in use over the local network, with no relay. */}
                          {current ? <small>{!online ? "Disconnected" : `${via === "lan" ? "Local" : via === "relay" ? "Relay" : "Connected"}${ms ? ` · ${ms} ms` : ""}`}</small> : offline && <small>{offline.includes(m.mac) ? "Disconnected" : "Connected"}</small>}
                        </span>
                      </div>
                      {macs.length > 1 && <OnOff value={!hidden.includes(m.mac)} onChange={() => toggleShown(m.mac)} label={`Show ${name}`} />}
                      <button className="info" onClick={() => setDetails(details === m.mac ? "" : m.mac)} aria-expanded={details === m.mac} aria-label={`Details of ${name}`}>
                        <Icon name="info" size={20} />
                      </button>
                    </div>
                    {details === m.mac && (
                      <>
                        <div className="row">
                          <span>Name</span>
                          <input
                            key={name}
                            className="field-input"
                            defaultValue={name}
                            aria-label={`Name of ${name}`}
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                            onBlur={(e) => rename(m.mac, e.target.value)}
                          />
                        </div>
                        <div className="row">
                          <span>
                            Relay
                            <small>
                              {new URL(m.relay).host} · room {m.room}
                            </small>
                          </span>
                        </div>
                        {/* The one computer whose new screens the phone runs (SCREEN_FROM in src/front.ts). */}
                        {macs.length > 1 && (
                          <div className="row computer">
                            <button className="pick" role="checkbox" aria-checked={screenFrom === m.mac} onClick={() => (localStorage.setItem(SCREEN_FROM, m.mac), setScreenFrom(m.mac))}>
                              <span>Screen updates</span>
                              {screenFrom === m.mac && <Icon name="tick" size={18} />}
                            </button>
                          </div>
                        )}
                        {blocked &&
                          macs
                            .filter((o) => o.mac !== m.mac)
                            .map((o) => {
                              const can = !blocks(blocked, o);
                              return (
                                <div key={o.mac} className="row computer">
                                  <button className="pick" role="checkbox" aria-checked={can} onClick={() => toggleReach(m.mac, o)}>
                                    <span>
                                      {macName(o)}
                                      <small>Can reach {name}</small>
                                    </span>
                                    {can && <Icon name="tick" size={18} />}
                                  </button>
                                </div>
                              );
                            })}
                        <button
                          className="row act danger"
                          onClick={async () => {
                            // The native alert asks first: the last computer takes the data of the phone with it.
                            const title = `Unpair ${name}?`;
                            const text = "To use it again, scan its pairing code.";
                            const yes = await nativeAsk(text, { title, kind: "warning", okLabel: "Unpair", cancelLabel: "Cancel" }).catch(() => confirm(`${title}\n\n${text}`));
                            if (yes) (setDetails(""), unpair(m.mac).then((later) => (later && setRestart("the other computer"), loadMacs())));
                          }}
                        >
                          <span>Unpair {name}</span>
                        </button>
                      </>
                    )}
                  </Fragment>
                );
              })}
              {restart && (
                <div className="row">
                  <span>
                    Restart Yonder
                    <small>Close Yonder and open it again to use {restart}.</small>
                  </span>
                </div>
              )}
            </div>
            <div className="group">
              <button className="row act" onClick={() => setAdding(true)}>
                <span>Pair a computer</span>
              </button>
            </div>
            <SchemaRows schema={schema} section="environment" onSet={setOne} />
            <div className="group">
              <button className="row nav" onClick={() => setSection("mcp")}>
                <span>MCP</span>
                <Icon name="forward" size={16} />
              </button>
            </div>
            <p className="page-note">On a Mac, click the QR button at the top of Yonder. On a Linux server, run yonder pair over SSH. Then scan the code.</p>
          </div>
        )}
        {section === "general" && <div className="settings-panel">
        {/* The rows come from the schema (bridge/settings/general.json), in its order. The parts that are not plain values are
            named parts here. */}
        <SchemaRows
          schema={schema}
          section="general"
          onSet={setOne}
          parts={{
            defaultProfile: (
              <>
                <div className="group">
                  <div className="row">
                    <span>Default profile</span>
                    <Dropdown value={clis.cli} onChange={(cli) => setClis({ cli })} options={pickable(clis.clis.filter((c) => c.on), clis.cli).map((c) => ({ value: c.id, label: profileLabel(c.name, c) }))} />
                  </div>
                </div>
                <p className="page-note">{swap(`A new task on ${pairing ? macName(pairing) : "this computer"} uses this default profile. Each computer has its own.`)}</p>
              </>
            ),
            update: (
              <>
              {/* The version of the app, and the state of the source. The app reads the version of the source every 30 seconds.
                  The update is at the top of General, so the user sees it first. */}
              {/* Environment is the bridge and the screen of the computer in use, which update over the air. The app is
                  the native shell of this device. Each shows only the commit number N of "2.B.N", with its channel,
                  as Discord shows its build: the two numbers are meant to differ, and the line under them says if the
                  app is too old ("Versions" in docs/wiki/install.md). A tap copies both full versions. Full
                  versions with different middle numbers, as "2.104.707" and "2.98.645", make the phone look out of date. */}
              <div className="group">
                <button className="row nav" onClick={copyVersions}>
                  <span>Yonder</span>
                  <span className="value">{versionsCopied ? "Copied" : versionText(__BUILD_ID__, channel)}</span>
                </button>
                {app && (
                  <button className="row nav" onClick={copyVersions}>
                    <span>{appName} app</span>
                    <span className="value">{versionText(app, appChannel)}</span>
                  </button>
                )}
                <div className="row">
                  <span className={ready ? undefined : "dim"}>
                    {update.updating
                      ? "Updating…"
                      : update.shell
                        ? "The Mac app needs a rebuild"
                        : update.release
                          ? `${update.release} is ready`
                          : update.held
                            ? `${update.held} needs a newer app`
                            : "Up to date"}
                  </span>
                  {ready ? (
                    <button className="primary" disabled={update.updating} onClick={update.onUpdate}>
                      Update
                    </button>
                  ) : (
                    <button disabled={checking || update.updating} onClick={check}>
                      {checking ? "Checking…" : "Check"}
                    </button>
                  )}
                </div>
              </div>
              </>
            ),
            pair: (
              <>
              {/* The Mac shows the QR code that pairs a phone, as File > Pair Phone does. */}
              {!phone && (
                <div className="group">
                  <button className="row nav" onClick={onPair}>
                    <span>Pair a phone</span>
                    <Icon name="forward" size={16} />
                  </button>
                </div>
              )}
              </>
            ),
            lock: (
              <>
              {/* The Face ID lock of the phone app. A phone app from before the plugin has no row. */}
              {canLock && (
                <>
                  <div className="group">
                    <div className="row">
                      <span>{lockName}</span>
                      <OnOff value={faceLock} onChange={chooseLock} label={lockName} />
                    </div>
                    {faceLock && canGrace && (
                      <div className="row">
                        <span>Ask again</span>
                        <Dropdown value={grace} onChange={chooseGrace} options={GRACE} />
                      </div>
                    )}
                  </div>
                  <p className="page-note">Unlock Yonder with {lockName} when it opens. A locked phone always asks again.</p>
                </>
              )}
              {guardKey && guardOn !== undefined && (
                <>
                  <div className="group">
                    <div className="row">
                      <span>Face ID for the relay</span>
                      <OnOff value={guardOn} onChange={(on) => void chooseGuard(on).catch(loadGuard)} label="Face ID for the relay" />
                    </div>
                  </div>
                  <p className="page-note">Away from the network of the Mac, the Mac answers only after Face ID.</p>
                </>
              )}
              </>
            ),
            push: (
              <>
              {/* The push notifications of the iPhone app. The Android app has none yet. */}
              {phone && !android && (
                <>
                  <div className="group">
                    <div className="row">
                      <span>Notifications</span>
                      <OnOff value={push} onChange={choosePush} label="Notifications" />
                    </div>
                  </div>
                  <p className="page-note">{swap("Get a push when an agent finishes or waits for you.")}</p>
                </>
              )}
              </>
            ),
            vault: (
              <>
              {/* 1Password for the agents (src/Vault.tsx). Only a phone can give the token and approve. */}
              {phone && <VaultRow />}
              </>
            ),
            backup: <BackupRow />,
          }}
        />
        </div>}

        {/* Profiles: each CLI, then the profiles of that CLI. A row opens the CLI or the profile. Default profile is in General. */}
        {section === "agents" && <div className="settings-panel">
        <div className="group">
          {profileRows.map((c) => (
            <ProfileRow key={c.id} onClick={() => (c.base ? (setAgent(""), setEditing(c.id)) : setAgent(c.id))} onDefault={c.on && c.id !== clis.cli ? () => setClis({ cli: c.id }) : undefined}>
              <span>
                {c.name}
                <small>{profileSmall(c)}</small>
              </span>
              {c.id === clis.cli && <span className="value">Default</span>}
              <Icon name="forward" size={16} />
            </ProfileRow>
          ))}
          <button className="row act" onClick={() => (setAgent(""), setEditing("new"))}>
            <span>Add profile</span>
          </button>
        </div>
        <SchemaRows schema={schema} section="agents" onSet={setOne} />
        {!agent && <Logins key={signing} />}
        <div className="group">
          {joining.map((name) => (
            <div key={name} className="row">
              <span>{name}<small>…</small></span>
            </div>
          ))}
          {registry.some((a) => !a.added) && (
            <div className="row">
              <span>Add an agent</span>
              <Dropdown value="" onChange={add} options={[{ value: "", label: "Choose" }, ...registry.filter((a) => !a.added).map((a) => ({ value: a.id, label: a.name }))]} />
            </div>
          )}
          <div className="row">
            <span>Look again</span>
            <button disabled={looking} onClick={() => (setLooking(true), onCheckClis().finally(() => setLooking(false)))}>
              {looking ? "Checking…" : "Check"}
            </button>
          </div>
        </div>
        <p className="page-note">{swap("A profile runs one CLI with its own name, flags and variables. Add an agent adds a CLI from the ACP registry.")}</p>
        </div>}
        {section === "agents" && editing && !agent && (
          <ProfilePage
            key={editing}
            entry={clis.clis.find((c) => c.id === editing)}
            cli={profileCli}
            clis={clis.clis}
            current={clis.cli}
            save={setProfile}
            setClis={setClis}
            reload={() => void onCheckClis()}
            onOpen={setEditing}
            onClose={() => setEditing("")}
          />
        )}
        {/* The page of one CLI, over the Agents section: its version with Install or Update, its sign-in, the settings of its
            new agents, and its profiles. The page of a profile opens over it. */}
        {section === "agents" && cli && (
          <div className="page">
            <div ref={agentEdge} className="page-body">
              <div className="page-head">
                <button className="icon page-back" data-native="agent-back" data-icon="back" data-glyph="22" onClick={closeAgent} title={nameOf("agents")} aria-label={`Back to ${nameOf("agents")}`}>
                  <Icon name="back" />
                </button>
                <h1 className="page-title">{cli.name}</h1>
              </div>
              <div className="settings-panel">
                <div className="group">
                  {cli.id !== "claude" && cli.path && !cli.error && cli.account && (
                    <div className="row">
                      <span>{cli.name}</span>
                      <OnOff value={cli.on} onChange={(on) => setClis({ id: cli.id, on })} label={cli.name} />
                    </div>
                  )}
                  {cli.on && <DefaultRow id={cli.id} current={clis.cli} setClis={setClis} />}
                  <div className="row">
                    <span>
                      Version
                      {cli.error && <small>Does not start: {cli.error}</small>}
                    </span>
                    <span className="value">{cli.path ? cli.version : "Not installed"}</span>
                    {cli.id === "claude" && cli.path ? null : !cli.path || cli.error ? (
                      <button onClick={() => terminal(cli, "install")}>{cli.path ? "Reinstall" : "Install"}</button>
                    ) : cli.install ? (
                      <button onClick={() => terminal(cli, "install")}>Update</button>
                    ) : null}
                  </div>
                  {cli.path && !cli.error && (
                    <div className="row">
                      <span>Account</span>
                      <span className="value">{cli.account ?? "Not signed in"}</span>
                      {cli.id !== "claude" && !cli.account && <button onClick={() => terminal(cli, "login")}>Sign in</button>}
                    </div>
                  )}
                  {cli.path && !cli.error && (
                    <div className="row">
                      <span>
                        Auto update
                        <small>{cli.id === "claude" ? "On installs a new harness. Claude also updates on its own." : "On installs a new harness for this CLI."}</small>
                      </span>
                      <OnOff value={cli.autoUpdate !== false} onChange={(on) => setClis({ id: cli.id, autoUpdate: on })} label="Auto update" />
                    </div>
                  )}
                </div>
                <Logins key={signing} only={cli.id} />
                {cli.id === "claude" ? (
                  <>
                    {/* The model of each new agent that names none. Auto lets Clef pick it inside the Minimum and the Maximum
                        row. The least and the most powerful model, and the lowest and
                        the highest effort, that Clef can pick for a new agent that names none: the Minimum and the Maximum
                        row. Equal ends give one model or one effort. */}
                    <div className="group">
                      <div className="row">
                        <span>Default model</span>
                        <Dropdown value={ranges.defaultModel} onChange={(v) => setRanges({ defaultModel: v })} options={[{ value: "auto", label: "Auto" }, ...tierSteps()]} />
                      </div>
                      <Limits
                        models={tierSteps()}
                        efforts={EFFORTS.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))}
                        value={ranges}
                        onChange={setRanges}
                      />
                    </div>
                    <p className="page-note">{swap("New agents use the default model, unless you name a model. With Auto, Clef picks a model and an effort from the minimum to the maximum.")}</p>
                    {/* The permission mode of each new agent that names no mode. Plan is only in the menu of a new agent. The
                        plugins of Yonder (its MCP tools) in each Claude Code session of the user, also in a terminal. Off
                        until the user turns it on. The screen calls them plugins. */}
                    <div className="group">
                      <div className="row">
                        <span>Permissions</span>
                        <Dropdown value={mode} onChange={setMode} options={MODES.filter((m) => m.mode !== "plan").map((m) => ({ value: m.mode, label: m.name }))} />
                      </div>
                      <div className="row">
                        <span>Yonder plugins</span>
                        <OnOff value={claudeMcp} onChange={setClaudeMcp} label="Yonder plugins" />
                      </div>
                    </div>
                    <p className="page-note">{swap("New agents start in this permission mode. Accept edits waits for you before each command. Yonder plugins lets all your Claude Code sessions use the plugins of Yonder. Yonder agents always have them.")}</p>
                  </>
                ) : cli.on && (
                  <>
                    {/* The new agents of a CLI that is on. "Default" is the default model of the CLI, and Auto lets Clef pick
                        the effort. The modes are the ones of the CLI that never stop to ask. */}
                    <div className="group">
                      <div className="row">
                        <span>Model</span>
                        <Dropdown
                          value={cli.model || "default"}
                          onChange={(v) => setClis({ id: cli.id, model: v === "default" ? "" : v })}
                          options={[{ value: "default", label: "Default" }, ...[...new Set([...cli.models, ...(cli.model ? [cli.model] : [])])].map((m) => ({ value: m, label: m }))]}
                        />
                      </div>
                      {cli.efforts.length > 0 && (
                        <div className="row">
                          <span>Effort</span>
                          <Dropdown
                            value={cli.effort || "auto"}
                            onChange={(v) => setClis({ id: cli.id, effort: v === "auto" ? "" : v })}
                            options={[{ value: "auto", label: "Auto" }, ...cli.efforts.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))]}
                          />
                        </div>
                      )}
                      <div className="row">
                        <span>Permissions</span>
                        <Dropdown value={cli.mode} onChange={(mode) => setClis({ id: cli.id, mode })} options={cli.modes.filter((m) => m.mode !== "plan").map((m) => ({ value: m.mode, label: m.name }))} />
                      </div>
                      {cli.mcp !== undefined && (
                        <div className="row">
                          <span>Yonder plugins</span>
                          <OnOff value={cli.mcp} onChange={(on) => setClis({ id: cli.id, mcp: on })} label={`Yonder plugins in ${cli.name}`} />
                        </div>
                      )}
                    </div>
                    <p className="page-note">
                      {swap("New agents use this model, unless you name a model.")}{cli.efforts.length > 0 && " Auto lets Clef pick the effort from the task."} {swap(`An agent in ${cli.name} never stops to ask.`)}
                      {cli.mcp !== undefined && swap(cli.mcpRun ? " Yonder agents always have the plugins of Yonder." : ` Yonder agents in ${cli.name} get the plugins of Yonder only when they are on.`)}
                    </p>
                  </>
                )}
                {/* The profiles of this CLI (src/Profiles.tsx). Each row opens the page of its profile. */}
                {(cli.on || profiles.length > 0) && (
                  <>
                    <h2 className="page-section">Profiles</h2>
                    <div className="group">
                      {profiles.map((p) => (
                        <ProfileRow key={p.id} onClick={() => setEditing(p.id)} onDefault={p.on && p.id !== clis.cli ? () => setClis({ cli: p.id }) : undefined}>
                          <span>
                            {profileLabel(p.name, p)}
                            {p.profile?.own && <small>{p.account ?? "Not signed in"}</small>}
                          </span>
                          {p.id === clis.cli && <span className="value">Default</span>}
                          <Icon name="forward" size={16} />
                        </ProfileRow>
                      ))}
                      <button className="row act" onClick={() => setEditing("new")}>
                        <span>Add profile</span>
                      </button>
                    </div>
                    <p className="page-note">A profile runs {cli.name} with its own name, flags and variables{cli.id === "claude" && ", and can have its own account"}.</p>
                  </>
                )}
              </div>
              {editing && (
                <ProfilePage key={editing} entry={clis.clis.find((c) => c.id === editing)} cli={cli.id} clis={clis.clis} current={clis.cli} save={setProfile} setClis={setClis} reload={() => void onCheckClis()} onOpen={setEditing} onClose={() => setEditing("")} />
              )}
            </div>
          </div>
        )}

        {starts && <ScheduleList list={schedules.filter((s) => isTrigger(s) === (section === "triggers"))} triggers={section === "triggers"} onOpen={setSchedule} />}
        {starts && schedule && (
          <SchedulePage key={schedule} start={schedule === "new" || schedule === "new-trigger" ? undefined : schedule} trigger={schedule === "new-trigger"} list={schedules} onSaved={reloadSchedules} onOpenAgent={onOpenAgent} onClose={() => setSchedule("")} />
        )}

        {/* MCP: the Claude app on the phone, the web or the desktop, with the plugins of Yonder. The page makes a code when it
            opens, and Copy makes a new one. The rows have a page of their own, because they are hard to find in Agents. */}
        {section === "mcp" && <div className="settings-panel">
        <div className="group">
          {connector?.error && !connector.url ? (
            <div className="row">
              <span>
                Connector
                <small>{connector.error}</small>
              </span>
            </div>
          ) : (
            <>
              <div className="row">
                <span>
                  Address
                  {connector?.url && <small className="connector-url">{connector.url}</small>}
                </span>
                <button disabled={!connector?.url} onClick={() => copyConnector(connector!.url)}>{copiedAddress ? "Copied" : "Copy"}</button>
              </div>
              <div className="row">
                <span>Code</span>
                <span className="value">{connector?.code?.replace(/^(\d{3})(\d{3})$/, "$1 $2")}</span>
              </div>
              {!!connector?.connected.length && (
                <button className="row act danger" onClick={disconnect}>
                  <span>
                    Disconnect all
                    <small>{[...new Set(connector.connected)].join(", ")}</small>
                  </span>
                </button>
              )}
            </>
          )}
        </div>
        <p className="page-note">In Claude, open Customize, Connectors, Add custom connector, paste the address, and type the code.</p>
        </div>}
        {section === "tools" && <div className="settings-panel">
        <div className="group">
          {tools.map((t) => (
            <div key={t.id} className="row">
              <span>
                {t.name}
                <small>{t.busy ? "Installing…" : t.error ?? (t.path && !t.skill ? "No skill" : t.about)}</small>
                {t.url && <small><a href={t.url} onClick={(e) => (e.preventDefault(), openLink(t.url))}>{t.url.replace(/^https:\/\//, "")}</a></small>}
              </span>
              {t.busy ? null : t.path && t.skill ? <span className="value">Installed</span> : <button onClick={() => install(t)}>Install</button>}
            </div>
          ))}
        </div>
        <p className="page-note">{swap("Plugins let agents do more on")} {phone ? "your computer" : "this computer"}.</p>
        </div>}

        {/* The theme and the color. They have a tab of their own, so General stays short. */}
        {/* Below them, the font and the size of the Markdown in the chat and of the points of the summary. */}
        {section === "keys" && <div className="settings-panel">
          <h2 className="page-section">Anywhere</h2>
          <div className="group">
            {KEY_ACTIONS.map(([action, title]) => (
              <div key={action} className="row">
                <span>{swap(title)}</span>
                {recordButton(action, keys[action])}
              </div>
            ))}
          </div>
          <h2 className="page-section">In Yonder</h2>
          <div className="group">
            {SHORTCUTS.map((s) => (
              <div key={s.key} className="row">
                <span>{swap(s.label)}</span>
                {recordButton(s.key, shortcutValue(s.key))}
              </div>
            ))}
          </div>
          <p className="page-note">Click to record a key or a shortcut. Delete turns it off.</p>
        </div>}

        {section === "appearance" && <div className="settings-panel">
        <div className="group">
          <div className="row">
            <span>Theme</span>
            <div className="seg">
              {["light", "dark", "system"].map((t) => (
                <button key={t} className={theme === t ? "on" : undefined} onClick={() => setTheme(t)}>
                  {t === "light" ? "Light" : t === "dark" ? "Dark" : "System"}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <span>Color</span>
            <div className="swatches" role="radiogroup" aria-label="Color">
              <button role="radio" aria-checked={!accent} aria-label="Default" title="Default" className="swatch default" style={{ "--own": ownAccent() } as CSSProperties} onClick={() => chooseAccent("")} />
              {Object.entries(ACCENTS).map(([name, hex]) => (
                <button key={name} role="radio" aria-checked={accent === hex} aria-label={name[0].toUpperCase() + name.slice(1)} title={name[0].toUpperCase() + name.slice(1)} className="swatch" style={{ background: hex }} onClick={() => chooseAccent(hex)} />
              ))}
              <label role="radio" aria-checked={!!accent && !Object.values(ACCENTS).includes(accent)} title="Custom" className="swatch custom">
                <input type="color" aria-label="Custom color" value={accent || ownAccent()} onChange={(e) => chooseAccent(e.target.value, 400)} />
              </label>
            </div>
          </div>
        </div>
          <ScreenSettings onPreview={onClose} />
          {(["chat"] as Part[]).map((part) => (
            <Fragment key={part}>
              <h2 className="page-section">Context tab</h2>
              <div className="group">
                <div className="row">
                  <span>Font</span>
                  <Dropdown value={fonts[`${part}Font`] || "system"} onChange={(f) => chooseFont(`${part}Font`, f)} options={Object.keys(FONTS).map((f) => ({ value: f, label: f[0].toUpperCase() + f.slice(1) }))} />
                </div>
                <div className="row">
                  <span>Size</span>
                  <div className="seg">
                    {SIZES[part].map((px, i) => (
                      <button key={px} className={(fonts[`${part}Size`] || String(SIZES[part][1])) === String(px) ? "on" : undefined} onClick={() => chooseFont(`${part}Size`, String(px))}>
                        {["S", "M", "L", "XL"][i]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Fragment>
          ))}
          <SchemaRows schema={schema} section="appearance" onSet={setOne} parts={{ agentName: <AgentWord value={schema.find((s) => s.key === "agentName")?.value} onSave={(v) => setOne("agentName", v)} /> }} />
        </div>}

        {/* The Yonder account gives the tunnel and the backup of the settings. A voice call needs no account. */}
        {section === "account" && <div className="settings-panel">
          {account.account ? (
            <>
              {/* The profile picture and the email. A tap on the picture opens the
                  photos and the camera on the phone, and a file on the Mac. A new email changes when the user opens the
                  link that yonder.so sends to it. An older yonder.so sends no `avatar`, and shows only the email. */}
              <div className="group">
                {!("avatar" in account.account) && (
                  <div className="row">
                    <span>{account.account.email}</span>
                  </div>
                )}
                {"avatar" in account.account && <>
                <button className="row nav me" onClick={() => photoInput.current?.click()}>
                  <Avatar account={account.account} />
                  <span>{account.account.avatar ? "Change photo" : "Add photo"}</span>
                </button>
                <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => (choosePhoto(e.target.files?.[0]), (e.target.value = ""))} />
                <div className="row email">
                  <span>Email</span>
                  <input className="field-input" type="email" aria-label="Email" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                    value={emailDraft ?? account.account.email} onChange={(e) => setEmailDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && changeEmail()} />
                </div>
                {emailDraft !== undefined && emailDraft.trim().toLowerCase() !== account.account.email && (
                  <button className="row act" onClick={changeEmail}>
                    <span>Change email</span>
                  </button>
                )}
                </>}
                {/* The referral program of yonder.so. */}
                {account.account.referral && (
                  <div className="row">
                    <span>Invite friends</span>
                    <button className="primary" onClick={shareReferral}>{copied ? "Copied" : phone ? "Share" : "Copy"}</button>
                  </div>
                )}
              </div>
              {accountNote && <p className="page-note">{accountNote}</p>}
              {/* Sync settings: the backup of the settings to the account (bridge/sync.ts), with the last sync under the
                  switch, and what syncs in plain words. An older bridge has no
                  Sync, so the section does not show. */}
              {schema.some((s) => s.key === "sync") && (
                <>
                  <h2 className="page-section">Sync settings</h2>
                  <SchemaRows schema={schema} section="account" onSet={setOne} />
                  <p className="page-note">
                    Syncs: your settings, the look and your custom screens.
                    <br />
                    Never syncs: secrets and keys.
                    <br />
                    Stays on each device: folder paths, CLIs and logins.
                  </p>
                </>
              )}
              <div className="group">
                <button className="row nav" onClick={() => setSection("usage")}>
                  <span>Usage</span>
                  <Icon name="forward" size={16} />
                </button>
                <button className="row nav" onClick={() => setSection("feedback")}>
                  <span>Feedback</span>
                  <Icon name="forward" size={16} />
                </button>
              </div>
              <div className="group">
                <button className="row act" onClick={account.onSignOut}>
                  <span>Sign out</span>
                </button>
              </div>
              {/* The App Store and Google Play require a way to delete the account from the app. The page on yonder.so
                  asks for the password, ends a paid plan at once, and deletes the data of the user. It is a small grey link at
                  the bottom, not a red row, and the app confirms before the page opens. */}
              <button className="quiet-link" onClick={deleteAccount}>Delete account</button>
            </>
          ) : (
            <>
              <div className="group">
                <button className="row act" onClick={() => account.onSignIn("signup")}>
                  <span>Sign up</span>
                </button>
                <button className="row act" onClick={() => account.onSignIn("login")}>
                  <span>Sign in</span>
                </button>
              </div>
              <p className="page-note">Sign up to get your tunnel.</p>
            </>
          )}
        </div>}

        {/* The voice calls: the model, how a call starts and hears you, the past calls, and what the calls cost. */}
        {section === "voice" && <div className="settings-panel">
        {/* The microphone of the calls: the next call uses it, and Default follows the input of macOS. */}
        {!phone && (
          <>
            <div className="group">
              <div className="row">
                <span>Microphone</span>
                <Dropdown
                  value={mic}
                  onChange={chooseMic}
                  options={[{ value: "", label: "Default" }, ...mics.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))]}
                />
              </div>
              {macApp && (
                <div className="row">
                  <span>Pause music</span>
                  <OnOff value={pauseMusic} onChange={choosePause} label="Pause music" />
                </div>
              )}
            </div>
            <p className="page-note">Yonder uses the microphone that you choose. Choose the microphone of the Mac to keep AirPods in high quality.</p>
          </>
        )}
        {/* The realtime voice model of the calls: only the providers whose key is in the .env of the computer (`keys` of
            /token?check). The next call uses it. Four choices do not fit beside a name, so the control has the full
            width of its group. */}
        <h2 className="page-section">Model</h2>
        <div className="group">
          {(Object.keys(VOICE_PROVIDERS) as VoiceProvider[]).some(hasVoiceKey) ? (
            <div className="row">
              <div className="seg wide">
                {(Object.keys(VOICE_PROVIDERS) as VoiceProvider[]).filter(hasVoiceKey).map((p) => (
                  <button key={p} className={provider === p ? "on" : undefined} onClick={() => chooseProvider(p)}>
                    {VOICE_PROVIDERS[p]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="row dim">No voice key on this computer</div>
          )}
        </div>
        <p className="page-note">Add the key of a provider to ~/.config/yonder/.env to talk with it.</p>
        {/* The speech to text of the dictation and of the Claude call: the speech model of Apple, Parakeet on a Mac that
            has its helper, or a model of the cloud whose key is in .env. `parakeet` in `keys` stands for the three
            Parakeet models. Apple is "apple" in the dropdown, because a menu item with an empty value is no choice. */}
        <h2 className="page-section">Speech to text</h2>
        <div className="group">
          <div className="row">
            <span>Model</span>
            <Dropdown
              value={sttModel || "apple"}
              onChange={(m) => chooseStt(m === "apple" ? "" : m)}
              options={Object.entries(STT).filter(([value]) => !value || hasVoiceKey(value.split("-")[0])).map(([value, label]) => ({ value: value || "apple", label }))}
            />
          </div>
        </div>
        <p className="page-note">For dictation and Claude calls.</p>
        {/* Walkie-talkie and its own speech model (bridge/settings/voice.json). */}
        <SchemaRows schema={schema} section="voice" onSet={setOne} />
        <div className="group">
          <button className="row nav" onClick={onCalls}>
            <span>Call history</span>
            <Icon name="forward" size={16} />
          </button>
          {superuser && (
            <button className="row nav" onClick={() => setSection("superuser")}>
              <span>Super user</span>
              <Icon name="forward" size={16} />
            </button>
          )}
        </div>
        </div>}

        {/* Super user: the rows that only a super user of yonder.so sees (`superuser` of the account), the last section of
            the list: the Grok voice of each account, the cost of the calls and Replay setup. */}
        {section === "superuser" && superuser && <div className="settings-panel">
        {/* Only for a super user of yonder.so: the Grok voice of the calls of each account. The next call uses it. */}
        {superuser && (
          <>
            <h2 className="page-section">Grok</h2>
            <div className="group">
              <div className="row">
                <span>Voice</span>
                <Dropdown value={grokVoice} onChange={chooseVoice} options={GROK_VOICES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
              </div>
            </div>
            <p className="page-note">The voice of Grok changes for all accounts.</p>
          </>
        )}
        {/* Only for a super user: the spend on xAI, the talk time that the spend buys at the price of one minute, and
            about how many tokens the context of the live call holds. */}
        {superuser && (
          <>
          <h2 className="page-section">Cost</h2>
          <div className="group">
            <div className="row">
              <span>Spend</span>
              <span className="value">{grok.spend}</span>
            </div>
            <div className="row">
              <span>Talk time</span>
              <span className="value">About {Math.floor(grok.minutes / 60)}h {Math.round(grok.minutes % 60)}m</span>
            </div>
            <div className="row">
              <span>Context</span>
              <span className="value">{grok.tokens === undefined ? "No live call" : `About ${Math.round(grok.tokens / 1000)}k tokens`}</span>
            </div>
          </div>
          </>
        )}
        {/* The first run again (src/Setup.tsx), to test it with no new install. Skip keeps the settings; answers change
            them, as for a new user. */}
        <h2 className="page-section">Setup</h2>
        <div className="group">
          <button className="row nav" onClick={() => window.dispatchEvent(new Event("yonder-setup"))}>
            <span>Replay setup</span>
          </button>
        </div>
        </div>}

        {/* The usage of the active profile: /usage in Claude Code, or /usage in Grok. The bridge keeps the last
            good numbers when a check fails, and the note under the card gives their age and the error in plain words. */}
        {section === "usage" && <div className="settings-panel">
        <h2 className="page-section">{claude.plan?.name ?? "Claude Code"}</h2>
        <div className="group">
          {!(claude.plan ? claude.plan.limits : claude.limits) && <div className="row dim">{(claude.plan ? claude.plan.error : claude.error) ? "No numbers yet" : "Loading…"}</div>}
          {(claude.plan ? claude.plan.limits : claude.limits)?.map((l) => (
            <div key={l.name} className="row limit">
              <div className="limit-head">
                <span>{l.name}</span>
                <span className="value">{l.percent}% used</span>
              </div>
              <div className="meter" role="meter" aria-label={l.name} aria-valuenow={l.percent} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${Math.min(100, l.percent)}%` }} />
              </div>
              {l.resets_at && <small>Resets {resets(l.resets_at)}</small>}
            </div>
          ))}
        </div>
        {((claude.plan ? claude.plan.at : claude.at) || (claude.plan ? claude.plan.error : claude.error)) && (
          <p className="page-note">
            {(claude.plan ? claude.plan.at : claude.at) ? `Updated ${ago(Date.now() - (claude.plan ? claude.plan.at : claude.at)!)} ago. ` : ""}
            {claude.plan ? claude.plan.error : claude.error}
          </p>
        )}
        {clis.clis.filter((c) => !c.base && c.id !== claude.plan?.cli && c.usage?.length).map((c) => (
          <Fragment key={c.id}>
            <h2 className="page-section">{c.name}</h2>
            <div className="group">
              {c.usage!.map((l) => (
                <div key={l.name} className="row limit">
                  <div className="limit-head">
                    <span>{l.name}</span>
                    <span className="value">{l.percent}% used</span>
                  </div>
                  <div className="meter" role="meter" aria-label={`${c.name} ${l.name}`} aria-valuenow={l.percent} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: `${Math.min(100, l.percent)}%` }} />
                  </div>
                  {l.resets_at && <small>Resets {resets(l.resets_at)}</small>}
                </div>
              ))}
            </div>
          </Fragment>
        ))}
        {/* The percent used of the week in the title bar. */}
        <SchemaRows schema={schema} section="usage" onSet={setOne} />
        </div>}

        {section === "feedback" && <Feedback />}
      </div>
      </div>
      )}
      {/* Another Mac: the pairing screen over the settings. A pairing switches the app to the new Mac. */}
      {adding && (
        <div className="page">
          <Pair onCancel={() => (setAdding(false), loadMacs())} />
        </div>
      )}
    </div>
  );
}

// A past call of the Mac (/calls of the bridge) as text, for a feedback report.
const callText = (c: CallLog) =>
  [new Date(c.id).toISOString(), ...c.lines.map((l) => `${l.who === "sent" ? `sent to agent ${l.num}` : l.who}: ${l.text}`)].join("\n").slice(0, 500_000);
const callDate = (c: CallLog) => new Date(c.id).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// The Feedback section: a message, a screenshot from the photos, one past call if the user picks it, and Send.
// yonder.so keeps the report for the staff (the yonder.so backend, private).
// "Add call history" opens the past calls as a page, as the
// Call history row of Voice does, and a tap on a call adds it. Send clears the form at once, and the form comes back
// with the error when the send fails.
function Feedback() {
  const [text, setText] = useState("");
  const [shot, setShot] = useState("");
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [call, setCall] = useState<CallLog>();
  const [picking, setPicking] = useState(false);
  const edge = useSwipeBack(() => setPicking(false));
  // The 50 newest calls. A Mac that does not answer gives none, and the row does not show.
  useEffect(() => {
    yonder.calls().then(setCalls, () => {});
  }, []);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useReport(error);
  const pick = useRef<HTMLInputElement>(null);
  const choose = async (file?: File) => {
    if (!file) return;
    const small = await shrink(file).catch(() => file);
    const reader = new FileReader();
    reader.onload = () => setShot(reader.result as string);
    reader.readAsDataURL(small);
  };
  const send = () => {
    const [message, screenshot, picked] = [text.trim(), shot, call];
    if (!message) return;
    setText(""), setShot(""), setCall(undefined), setError(""), setSent(true);
    sendFeedback(message, screenshot, picked ? callText(picked) : "").catch(
      (e: Error) => (setText(message), setShot(screenshot), setCall(picked), setSent(false), setError(e.message)),
    );
  };
  return (
    <div className="settings-panel">
      <div className="group">
        <textarea className="row feedback-text" value={text} onChange={(e) => (setText(e.target.value), setSent(false))} placeholder="What's on your mind?" aria-label="Feedback" rows={5} />
        {shot ? (
          <div className="row feedback-shot">
            <img src={shot} alt="Screenshot" />
            <button className="icon" onClick={() => setShot("")} title="Remove" aria-label="Remove the screenshot">
              <Icon name="x" />
            </button>
          </div>
        ) : (
          <button className="row act" onClick={() => pick.current?.click()}>
            <span>Add a screenshot</span>
          </button>
        )}
        {call ? (
          <div className="row feedback-shot">
            <span>{callDate(call)}</span>
            <button className="icon" onClick={() => setCall(undefined)} title="Remove" aria-label="Remove the call">
              <Icon name="x" />
            </button>
          </div>
        ) : (
          calls.length > 0 && (
            <button className="row act" onClick={() => setPicking(true)}>
              <span>Add call history</span>
            </button>
          )
        )}
      </div>
      {picking && (
        <div className="page">
          <div ref={edge} className="page-body">
            <div className="page-head">
              <button className="icon page-back" data-native="calls-back" data-icon="back" data-glyph="22" onClick={() => setPicking(false)} title="Back" aria-label="Back to Feedback">
                <Icon name="back" />
              </button>
              <h1 className="page-title">Call history</h1>
            </div>
            <div className="list">
              {calls.map((c) => (
                <CallRow key={c.id} c={c} onOpen={() => (setCall(c), setPicking(false))} />
              ))}
            </div>
          </div>
        </div>
      )}
      <input ref={pick} type="file" accept="image/*" hidden onChange={(e) => (void choose(e.target.files?.[0]), (e.target.value = ""))} />
      <div className="group">
        <button className="row act" disabled={!text.trim()} onClick={send}>
          <span>{sent ? "Sent" : "Send"}</span>
        </button>
      </div>
      {error && <p className="page-note">{error}</p>}
    </div>
  );
}
