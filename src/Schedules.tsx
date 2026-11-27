// The Schedules section of the Settings: the agents that the bridge starts at set times on the computer (the schedule
// tool in bridge/main.ts). They are for agents that need the CLIs and the logins of the computer, such as a daily
// video of a project. A schedule is a page as the page of a profile (src/Profiles.tsx): each
// change is saved at once, and a new schedule is saved when it has a project, a task and a timing. A trigger has When
// (the event in words) in place of a timing, and Claude Code sets it up: a script that Yonder runs each minute, or a
// webhook. There is one universal trigger, with no kinds.
import { type InputHTMLAttributes, useEffect, useRef, useState } from "react";
import { ago, EFFORTS, MODELS, useSwipeBack } from "./App";
import { yonder } from "./api";
import { type Cli, phone, type Project } from "./bridge";
import { Icon } from "./icons";
import { callName, swap, word } from "./names";
import { Dropdown, OnOff } from "./Settings";

type Run = { id: string; num: number; name: string; status: string; at: number };
export type Schedule = {
  id: string;
  name: string;
  project: string;
  path: string;
  task: string;
  every?: number;
  cron?: string;
  hook?: string;
  hookUrl?: string;
  signed?: boolean;
  event?: string;
  script?: string;
  model?: string;
  effort?: string;
  paused?: boolean;
  retries: number;
  profile?: string;
  profileName?: string;
  profileMissing?: boolean;
  cliName?: string;
  next: number;
  when: string;
  missed?: { at: number; why: string };
  runs: Run[];
};
type Repeat = "every" | "daily" | "weekdays" | "cron" | "script" | "webhook";
type Draft = { name: string; path: string; task: string; profile: string; repeat: Repeat; hours: string; time: string; cron: string; event: string; script: string; secret: string; model: string; effort: string; retries: string; on: boolean };

const STATUS: Record<string, string> = { running: "Running", waiting: "Waits for you", done: "Done", failed: "Failed", closed: "Closed" };
const REPEATS = [
  { value: "every", label: "Every N hours" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "cron", label: "Cron" },
];
// The two ways that a trigger starts: a script that Yonder runs each minute, or a web request to its URL.
const TRIGGERS: string[] = ["script", "webhook"];
export const isTrigger = (s: Schedule) => !!(s.event || s.hook || s.script);
const nextText = (ms: number) => new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
export const loadSchedules = () => yonder.schedules.list();

// The list of the section: a row for each schedule, with its timing, its project and its next start. With `triggers`,
// it is the list of the Triggers section.
export function ScheduleList({ list, triggers, onOpen }: { list: Schedule[]; triggers?: boolean; onOpen: (id: string) => void }) {
  return (
    <div className="settings-panel">
      <div className="group">
        {list.map((s) => (
          <button key={s.id} className="row nav" onClick={() => onOpen(s.id)}>
            <span>
              {s.name}
              <small>
                {(isTrigger(s) && s.event) || s.when} · {s.project}
                {s.profileMissing ? " · Removed" : s.profileName || s.cliName ? ` · ${s.profileName || s.cliName}` : ""}
              </small>
            </span>
            <span className="value">{s.paused ? "Paused" : isTrigger(s) ? (s.hook || s.script ? "" : "Not set up") : nextText(s.next)}</span>
            <Icon name="forward" size={16} />
          </button>
        ))}
        <button className="row act" onClick={() => onOpen(triggers ? "new-trigger" : "new")}>
          <span>{triggers ? "New trigger" : "New schedule"}</span>
        </button>
      </div>
      <p className="page-note">{swap(triggers ? "A trigger starts an agent on this computer when something happens. Claude Code sets it up." : "A schedule starts an agent on this computer at set times.")}</p>
    </div>
  );
}

function draftOf(s?: Schedule, trigger?: boolean): Draft {
  const daily = s?.cron?.match(/^(\d+) (\d+) \* \* (\*|1-5)$/);
  return {
    name: s?.name ?? "",
    path: s?.path ?? "",
    task: s?.task ?? "",
    profile: s?.profile ?? "",
    repeat: s?.hook ? "webhook" : s?.script || s?.event || trigger ? "script" : s?.every ? "every" : daily ? (daily[3] === "*" ? "daily" : "weekdays") : s?.cron ? "cron" : "daily",
    hours: String(s?.every ?? 24),
    time: daily ? `${daily[2].padStart(2, "0")}:${daily[1].padStart(2, "0")}` : "09:00",
    cron: s?.cron ?? "",
    event: s?.event ?? "",
    script: s?.script ?? "",
    // The bridge never gives the signing secret back, so the field is empty, and a save sends it only when it has text.
    secret: "",
    model: MODELS.find((m) => s?.model === m.alias || s?.model?.includes(m.alias))?.alias ?? s?.model ?? "",
    effort: s?.effort ?? "",
    retries: String(s?.retries ?? 2),
    on: !s?.paused,
  };
}

// `start` is the ID of the schedule, or none for a new one. The page finds its schedule in `list`, which the Settings
// load again after each save. `onOpenAgent` opens the agent of a past start. `trigger` makes it a new trigger.
export function SchedulePage({ start, trigger, list, onSaved, onOpenAgent, onClose }: { start?: string; trigger?: boolean; list: Schedule[]; onSaved: () => void; onOpenAgent: (id: string) => void; onClose: () => void }) {
  const edge = useSwipeBack(onClose);
  const id = useRef(start);
  const entry = list.find((s) => s.id === id.current);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [draft, setDraft] = useState(() => draftOf(entry, trigger));
  const [copied, setCopied] = useState(false);
  // The values of the last save. A save sends only the fields that changed. A new timing counts the next start from now.
  const last = useRef(draft);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clis, setClis] = useState<Cli[]>([]);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  useEffect(() => void yonder.projects.list().then((all) => setProjects(all.filter((p) => p.path !== "*")), () => {}), []);
  useEffect(() => void yonder.settings.clis().then((c) => setClis(c.clis), () => {}), []);
  // A new schedule goes in the first project of the list until the user picks one.
  const path = draft.path || projects[0]?.path || "";
  const profileCli = clis.find((c) => c.id === draft.profile)?.base;
  const modelCli = profileCli && profileCli !== "claude" ? clis.find((c) => c.id === profileCli) : undefined;
  const timing = (d: Draft) =>
    d.repeat === "every" ? { every: Number(d.hours) }
    : d.repeat === "cron" ? { cron: d.cron }
    : d.repeat === "script" ? (d.script.trim() ? { script: d.script.trim() } : {})
    : d.repeat === "webhook" ? { webhook: true }
    : { at: d.time, weekdays: d.repeat === "weekdays" };
  const triggered = TRIGGERS.includes(draft.repeat);
  // Claude Code sets the trigger up in an agent that the user sees, from its When (the design action of the bridge).
  const design = () => {
    setError("");
    void yonder.tool<{ id: string }>("schedule", { action: "design", id: id.current }).then((w) => (onSaved(), onOpenAgent(w.id)), (e) => setError((e as Error).message));
  };
  const copy = (text: string) => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    void (phone ? navigator.clipboard.writeText(text) : yonder.tool("copy_to_clipboard", { text })).catch(() => {});
  };
  const commit = (change: Partial<Draft> = {}) => {
    let next = { ...draft, ...change };
    // A profile of another CLI does not keep a Claude model or an effort that the CLI has not.
    if (change.profile) {
      const base = clis.find((c) => c.id === clis.find((p) => p.id === change.profile)?.base);
      if (base && base.id !== "claude") {
        if (next.model && !base.models.includes(next.model)) next = { ...next, model: "" };
        if (next.effort && !base.efforts.includes(next.effort)) next = { ...next, effort: "" };
      }
    }
    setDraft(next);
    const trigger = TRIGGERS.includes(next.repeat);
    if (!path || !next.task.trim() || (trigger ? !next.event.trim() : (next.repeat === "every" && !(Number(next.hours) >= 0.25)) || (next.repeat === "cron" && !next.cron.trim()))) return;
    setError("");
    const fields = (d: Draft) => ({ name: d.name, project: d.path || path, task: d.task, profile: d.profile, model: d.model || "auto", effort: d.effort || "auto", retries: Number(d.retries), paused: !d.on, ...(trigger && { event: d.event }) });
    const [now, before] = [fields(next), fields(last.current)];
    const timed = JSON.stringify(timing(next)) !== JSON.stringify(timing(last.current));
    const secret = next.secret.trim();
    const send = { ...(id.current ? { ...Object.fromEntries(Object.entries(now).filter(([k, v]) => v !== before[k as keyof typeof before])), ...(timed && timing(next)) } : { ...now, ...timing(next) }), ...(secret && { secret }) };
    // The secret leaves the field once it goes, and the field then says Set.
    if (secret) setDraft((next = { ...next, secret: "" }));
    last.current = next;
    if (!Object.keys(send).length) return;
    // One save at a time, so the first save of a new schedule gives its ID to the next one.
    chain.current = chain.current.then(() =>
      yonder.schedules.save(id.current, send).then(
        (s) => ((id.current = s.id), onSaved()),
        (e) => setError((e as Error).message),
      ),
    );
  };
  const runNow = () => {
    setStarting(true);
    setError("");
    void yonder.schedules.run(id.current)
      .then(onSaved, (e) => setError((e as Error).message))
      .finally(() => setStarting(false));
  };
  const remove = () => {
    if (!id.current) return onClose();
    void yonder.schedules.remove(id.current).then(() => (onSaved(), onClose()), (e) => setError((e as Error).message));
  };
  const input = (key: "name" | "hours" | "time" | "cron" | "event" | "secret", props: InputHTMLAttributes<HTMLInputElement>) => (
    <input
      className={`field-input${key === "cron" ? " mono" : ""}`}
      value={draft[key]}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      onBlur={() => commit()}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      {...props}
    />
  );
  const missed = entry?.missed && entry.missed.at > (entry.runs[0]?.at ?? 0) ? entry.missed : undefined;
  return (
    <div className="page">
      <div ref={edge} className="page-body">
        <div className="page-head">
          <button className="icon page-back" data-native="schedule-back" data-icon="back" data-glyph="22" onClick={onClose} title={triggered ? "Triggers" : "Schedules"} aria-label={`Back to ${triggered ? "Triggers" : "Schedules"}`}>
            <Icon name="back" />
          </button>
          <h1 className="page-title">{draft.name.trim() || (triggered ? "New trigger" : "New schedule")}</h1>
        </div>
        <div className="settings-panel">
          <div className="group">
            <div className="row field">
              <span>Name</span>
              {input("name", { placeholder: "e.g. Daily video" })}
            </div>
            <div className="row">
              <span>Workspace</span>
              <Dropdown value={path} onChange={(p) => commit({ path: p })} options={projects.map((p) => ({ value: p.path, label: p.name }))} />
            </div>
            {(clis.some((c) => c.base) || draft.profile) && (
              <div className="row">
                <span>Profile</span>
                <Dropdown
                  value={draft.profile}
                  onChange={(profile) => commit({ profile })}
                  options={[
                    { value: "", label: "Default" },
                    ...clis.filter((c) => c.base).map((p) => ({ value: p.id, label: `${p.name} · ${clis.find((c) => c.id === p.base)?.name ?? p.base}` })),
                    ...(draft.profile && !clis.some((c) => c.id === draft.profile) ? [{ value: draft.profile, label: "Removed" }] : []),
                  ]}
                />
              </div>
            )}
            {triggered && (
              <div className="row field">
                <span>When</span>
                {input("event", { placeholder: "a new error in Sentry" })}
              </div>
            )}
            <textarea
              className="row feedback-text"
              rows={3}
              value={draft.task}
              placeholder="The task, or a skill such as /daily-video"
              aria-label="Task"
              onChange={(e) => setDraft({ ...draft, task: e.target.value })}
              onBlur={() => commit()}
            />
          </div>
          <div className="group">
            {!triggered && (
              <div className="row">
                <span>Repeat</span>
                <Dropdown value={draft.repeat} onChange={(r) => commit({ repeat: r as Repeat })} options={REPEATS} />
              </div>
            )}
            {draft.repeat === "every" && (
              <div className="row field">
                <span>Hours</span>
                {input("hours", { type: "number", min: 0.25, step: 1, inputMode: "decimal" })}
              </div>
            )}
            {(draft.repeat === "daily" || draft.repeat === "weekdays") && (
              <div className="row field">
                <span>Time</span>
                {input("time", { type: "time", onChange: (e) => commit({ time: e.target.value }) })}
              </div>
            )}
            {draft.repeat === "cron" && (
              <div className="row field">
                <span>Cron</span>
                {input("cron", { placeholder: "0 9 * * 1" })}
              </div>
            )}
            {/* Each minute the bridge runs it, and each new line of its output starts the agent (pollScript). */}
            {draft.repeat === "script" && (
              <textarea
                className="row feedback-text mono"
                rows={4}
                value={draft.script}
                placeholder="Claude Code writes the script."
                aria-label="Script"
                spellCheck={false}
                onChange={(e) => setDraft({ ...draft, script: e.target.value })}
                onBlur={() => commit()}
              />
            )}
            {draft.repeat === "webhook" && entry?.hook && (
              <>
                <div className="row">
                  <span>
                    URL
                    <small className="connector-url">{entry.hookUrl ?? "Offline"}</small>
                  </span>
                  <button disabled={!entry.hookUrl} onClick={() => copy(entry.hookUrl!)}>{copied ? "Copied" : "Copy"}</button>
                </div>
                <div className="row field">
                  <span>Signing secret</span>
                  {input("secret", { type: "password", autoComplete: "off", placeholder: entry.signed ? "Set" : "Optional" })}
                </div>
              </>
            )}
            {triggered && id.current && (
              <button className="row act" onClick={design}>
                <span>Set up with Claude Code</span>
              </button>
            )}
            <div className="row">
              <span>On</span>
              <OnOff value={draft.on} onChange={(on) => commit({ on })} label="Schedule on" />
            </div>
          </div>
          <div className="group">
            <div className="row">
              <span>Model</span>
              <Dropdown
                value={draft.model}
                onChange={(model) => commit({ model })}
                options={[{ value: "", label: "Auto" }, ...(modelCli ? modelCli.models.map((m) => ({ value: m, label: m })) : MODELS.map((m) => ({ value: m.alias, label: m.name })))]}
              />
            </div>
            {(!modelCli || modelCli.efforts.length > 0) && (
              <div className="row">
                <span>Effort</span>
                <Dropdown
                  value={draft.effort}
                  onChange={(effort) => commit({ effort })}
                  options={[{ value: "", label: "Auto" }, ...(modelCli ? modelCli.efforts : EFFORTS).map((e) => ({ value: e, label: e }))]}
                />
              </div>
            )}
            <div className="row">
              <span>Retries</span>
              <Dropdown value={draft.retries} onChange={(retries) => commit({ retries })} options={["0", "1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n }))} />
            </div>
          </div>
          {id.current && (
            <div className="group">
              <button className="row act" onClick={runNow} disabled={starting}>
                <span>Run now</span>
              </button>
            </div>
          )}
          {error && <p className="page-note error">{error}</p>}
          {(missed || !!entry?.runs.length) && (
            <>
              <h2 className="page-section">Past runs</h2>
              <div className="group">
                {missed && (
                  <div className="row">
                    <span>
                      Did not start
                      <small>{missed.why}</small>
                    </span>
                    <span className="value">{ago(Date.now() - missed.at)} ago</span>
                  </div>
                )}
                {entry?.runs.map((r) => (
                  <button key={r.id} className="row nav" onClick={() => onOpenAgent(r.id)}>
                    <span>
                      {STATUS[r.status] ?? r.status}
                      {r.num > 0 && <small>{callName({ num: r.num, project: entry.project })}</small>}
                    </span>
                    <span className="value">{ago(Date.now() - r.at)} ago</span>
                    <Icon name="forward" size={16} />
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="group">
            <button className="row act danger" onClick={remove}>
              <span>Delete {triggered ? "trigger" : "schedule"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
