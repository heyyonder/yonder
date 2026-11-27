// The page of a profile in the Agents section of the Settings, as the instances of T3 Code: a CLI with a name, extra
// flags and environment variables. A profile of Claude Code with Separate account has its own config folder, so its
// agents have their own login and history (Profile in bridge/main.ts). Its agents get the MCP servers of the user, unless
// its Default MCP servers switch is off. A short line under each row tells what it does, as T3 Code does.
import { type ReactNode, useRef, useState } from "react";
import { ClaudeSetup, useSwipeBack } from "./App";
import { yonder } from "./api";
import { type Cli } from "./bridge";
import { Icon } from "./icons";
import { swap, word } from "./names";
import { Dropdown, OnOff } from "./Settings";

type Draft = { name: string; cli: string; own: boolean; ownMcp: boolean; program: string; flags: string; env: [string, string][] };

// A row with its name, a line under it, and its control at the right.
const Row = ({ name, help, children }: { name: string; help: string; children: ReactNode }) => (
  <div className="row field">
    <span>
      {name}
      <small>{help}</small>
    </span>
    {children}
  </div>
);

// The Default profile row on the page of a profile or a CLI: Set makes it the profile of each new task, as the Default
// profile row of General does. Thus the page does it too, not only a long press.
export const DefaultRow = ({ id, current, setClis }: { id: string; current: string; setClis: (change: Record<string, unknown>) => Promise<unknown> }) => (
  <Row name="Default profile" help="Each new task on this computer uses it.">
    {id === current ? <span className="value">On</span> : <button onClick={() => void setClis({ cli: id })}>Set</button>}
  </Row>
);

// `entry` is the profile in /clis of the bridge, or none for a new profile of `cli`, the CLI whose page is under it. A new
// profile is saved when it has a name. Each text field is saved when it loses the focus, and the bridge gives the profile
// back with its account.
export function ProfilePage({ entry, cli = "claude", clis, current, save, setClis, reload, onOpen, onClose }: { entry?: Cli; cli?: string; clis: Cli[]; current: string; save: (body: object) => Promise<string>; setClis: (change: Record<string, unknown>) => Promise<unknown>; reload: () => void; onOpen: (id: string) => void; onClose: () => void }) {
  const edge = useSwipeBack(onClose);
  const id = useRef(entry?.id);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [draft, setDraft] = useState<Draft>({
    name: entry?.name ?? "",
    cli: entry?.base ?? cli,
    own: entry ? !!entry.profile?.own : true,
    ownMcp: !!entry?.profile?.ownMcp,
    program: entry?.profile?.program ?? "",
    flags: entry?.profile?.flags ?? "",
    env: Object.entries(entry?.profile?.env ?? {}),
  });
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const live = clis.find((c) => c.id === id.current);
  const commit = (change: Partial<Draft> = {}) => {
    const next = { ...draft, ...change };
    setDraft(next);
    if (!next.name.trim()) return;
    setError("");
    // One save at a time, so the first save of a new profile gives its ID to the next one.
    chain.current = chain.current.then(() =>
      save({ profile: { id: id.current, ...next, env: Object.fromEntries(next.env.filter(([k]) => k.trim())) } }).then(
        (saved) => void (id.current = saved),
        (e) => setError((e as Error).message),
      ),
    );
  };
  const text = (key: "name" | "program" | "flags", placeholder: string, mono = false) => (
    <input
      className={`field-input${mono ? " mono" : ""}`}
      value={draft[key]}
      placeholder={placeholder}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      onBlur={() => commit()}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
  const setVar = (i: number, at: 0 | 1, value: string) => setDraft({ ...draft, env: draft.env.map((v, j) => (j === i ? (at ? [v[0], value] : [value, v[1]]) : v)) });
  // A copy with the same CLI, flags and variables. A copy of Claude Code gets its own new folder, so the user signs in to
  // another account on its page: each profile has its own login.
  // shortcut: the new folder starts from ~/.claude, not from the folder of this profile; copy its settings and MCP servers when someone asks.
  const duplicate = () =>
    void save({ profile: { ...draft, name: `${draft.name.trim()} copy`, own: true, env: Object.fromEntries(draft.env.filter(([k]) => k.trim())) } }).then(onOpen, (e) => setError((e as Error).message));
  const remove = () => {
    if (!id.current) return onClose();
    void save({ remove: id.current }).then(onClose, (e) => setError((e as Error).message));
  };
  const program = draft.cli === "claude" ? "claude" : (clis.find((c) => c.id === draft.cli)?.login?.split(" ")[0] ?? draft.cli);
  const own = draft.cli === "claude" && draft.own;
  const back = clis.find((c) => c.id === cli)?.name ?? word.Many;
  return (
    <div className="page">
      <div ref={edge} className="page-body">
        <div className="page-head">
          <button className="icon page-back" data-native="profile-back" data-icon="back" data-glyph="22" onClick={onClose} title={back} aria-label={`Back to ${back}`}>
            <Icon name="back" />
          </button>
          <h1 className="page-title">{draft.name.trim() || "New profile"}</h1>
        </div>
        <div className="settings-panel">
          <div className="group">
            <Row name="Name" help={swap("Shown in the list of profiles and in the menu of a new agent.")}>
              {text("name", "e.g. Work")}
            </Row>
            {live?.on && <DefaultRow id={live.id} current={current} setClis={setClis} />}
            <Row name="CLI" help={swap("The tool that runs the agents of this profile.")}>
              <Dropdown value={draft.cli} onChange={(cli) => commit({ cli })} options={clis.filter((c) => !c.base && (c.on || c.id === draft.cli)).map((c) => ({ value: c.id, label: c.name }))} />
            </Row>
            <Row name="Auto update" help={draft.cli === "claude" ? "On installs a new harness. Claude also updates on its own." : "On installs a new harness for this CLI."}>
              <OnOff value={clis.find((c) => c.id === draft.cli)?.autoUpdate !== false} onChange={(on) => void setClis({ id: draft.cli, autoUpdate: on })} label="Auto update" />
            </Row>
            {draft.cli === "claude" && (
              <Row name="Separate account" help="Its own login and history. Off: it uses your Claude Code.">
                <OnOff value={draft.own} onChange={(on) => commit({ own: on })} label="Separate account" />
              </Row>
            )}
            {own && (
              <Row name="Default MCP servers" help="The MCP servers of your Claude Code. Off: only the servers of its own folder.">
                <OnOff value={!draft.ownMcp} onChange={(on) => commit({ ownMcp: !on })} label="Default MCP servers" />
              </Row>
            )}
            {own && live?.account && (
              <Row name="Account" help={`The login of its ${word.many}, in ${live.profile?.folder?.replace(/^\/(Users|home)\/[^/]+/, "~")}.`}>
                <span className="value">{live.account}</span>
              </Row>
            )}
            {own && live?.account && !signing && (
              <button className="row act" onClick={() => (setSigning(true), void yonder.profiles.signIn(live.id))}>
                <span>Sign in again</span>
              </button>
            )}
          </div>
          {own && live && (!live.account || signing) && <ClaudeSetup profile={live.id} name={draft.name} onDone={() => (setSigning(false), reload())} />}
          {error && <p className="page-note error">{error}</p>}
          <h2 className="page-section">Advanced</h2>
          <div className="group">
            <Row name="Program" help="The name or path of the CLI. Change it only to run a different copy.">
              {text("program", program, true)}
            </Row>
            <Row name="Extra flags" help={swap(`Added each time an agent of this profile starts, as after ${program} in a terminal.`)}>
              {text("flags", "e.g. --chrome", true)}
            </Row>
          </div>
          <h2 className="page-section">Environment variables</h2>
          <div className="group">
            {draft.env.map(([name, value], i) => (
              <div key={i} className="row env">
                <input className="field-input mono" value={name} placeholder="NAME" aria-label="Name of the variable" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  onChange={(e) => setVar(i, 0, e.target.value)} onBlur={() => commit()} />
                <span className="value">=</span>
                <input className="field-input mono" type="password" value={value} placeholder="value" aria-label={`Value of ${name || "the variable"}`} autoComplete="off"
                  onChange={(e) => setVar(i, 1, e.target.value)} onBlur={() => commit()} />
              </div>
            ))}
            <button className="row act" onClick={() => setDraft({ ...draft, env: [...draft.env, ["", ""]] })}>
              <span>Add variable</span>
            </button>
          </div>
          <p className="page-note">API keys, server addresses and other values that the CLI reads when it starts. Most profiles need none. Clear a name to remove its variable.</p>
          <div className="group">
            {live && (
              <button className="row act" onClick={duplicate}>
                <span>Duplicate profile</span>
              </button>
            )}
            <button className="row act danger" onClick={remove}>
              <span>Remove profile</span>
            </button>
          </div>
          {own && <p className="page-note">The folder of the profile stays, with its login and its history.</p>}
        </div>
      </div>
    </div>
  );
}
