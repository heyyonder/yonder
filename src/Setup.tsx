// The first run after the pairing (docs/wiki.md, "First run"): folder access on the Mac, the questions that pick a
// built-in screen, the CLI and the permission mode, the summary "Your Yonder", the sign-in of the CLI, then the
// permissions of the phone, each with its reason first. Each step that is done already is skipped.
//
// Apple's rule for a screen before a system alert: one button, "Continue", and no other action (HIG, "Accessing
// private data"). So the permission steps have no Skip. Each one goes on after Allow or Don't Allow.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { yonder } from "./api";
import { android, bridgeFetch, phone, pushOn, setPush, type Cli } from "./bridge";
import { Icon, type IconName } from "./icons";
import { pickScreen, SAMPLES } from "./look";
import { colorsOf, Swatch } from "./Looks";
import { syncPhoneConfig } from "./phone-config";
import { locate } from "./voice";

type Opt = [label: string, icon: IconName];
type Answers = Record<string, number>;
// `agent`: the ID of the agent that sets up the rest, so the app opens its chat when the setup ends.
export type Picked = { screen?: string; cli?: string; mode?: string; agent?: string };

// The questions. Each answer picks the next question.
const Q: Record<string, { t: string; o: (a: Answers) => Opt[] }> = {
  q1: { t: "Have you used an AI agent?", o: () => [["No, never", "leaf"], ["A little", "trend"], ["Every day", "zap"]] },
  pay: { t: "Do you pay for Claude or ChatGPT?", o: () => [["Claude", "message"], ["ChatGPT", "message"], ["Neither", "x"]] },
  agent: { t: "Which agent do you use?", o: (a) => [["Claude Code", "terminal"], ["Codex", "terminal"], ["Another", "grid"], ...(a.q1 === 1 ? [["None yet", "x"] as Opt] : [])] },
  which: { t: "Which one?", o: () => [["Gemini", "terminal"], ["Cursor", "terminal"], ["Copilot", "terminal"], ["OpenCode", "terminal"], ["Hermes", "terminal"], ["Grok", "terminal"]] },
  goal: { t: "What do you want to do most?", o: () => [["Talk to an agent", "mic"], ["Get tasks done", "list"]] },
  many: { t: "How many agents at once?", o: () => [["One or two", "user"], ["Many", "users"]] },
};
const CLI: Record<string, string> = { "Claude Code": "claude", Codex: "codex", Gemini: "antigravity", Cursor: "cursor", Copilot: "copilot", OpenCode: "opencode", Hermes: "hermes", Grok: "grok" };
const nameOf = (cli: string) => Object.keys(CLI).find((k) => CLI[k] === cli) ?? cli;
const label = (id: string, a: Answers) => Q[id].o(a)[a[id]]?.[0];
function next(id: string, a: Answers) {
  if (id === "q1") return a.q1 === 0 ? "pay" : "agent";
  if (id === "agent" && label("agent", a) === "Another") return "which";
  if (id === "agent" || id === "which") return a.q1 === 1 ? "goal" : "many";
}
// The answers give a built-in screen (Yonder is no change) and the CLI of new agents. An answer that names no agent
// ("Neither", "None yet") gives no CLI: agentFor then picks one.
export function picked(a: Answers): Picked & { plan: boolean } {
  const screen = a.q1 === 0 ? "big" : a.q1 === 1 ? (a.goal === 0 ? "big" : undefined) : a.many === 1 ? "terminal" : undefined;
  const name = a.q1 === 0 ? ["Claude Code", "Codex"][a.pay] : label("agent", a) === "Another" ? label("which", a) : label("agent", a);
  return { screen, cli: CLI[name ?? ""], plan: a.q1 === 0 && a.pay === 2 };
}
// A CLI that is installed and signed in on the computer.
const ready = (c?: Cli) => !!c?.path && !c.error && !!c.account;
// The agent of "Your Yonder": the pick of the user in the list, then the answer. With neither, the default of the
// computer when it is ready, then the first CLI that is ready, so a computer with only Hermes gets Hermes. Claude Code
// is only the proposal for a user who answered and has no CLI yet. After Skip with no CLI that is ready, there is no
// agent, and Yonder installs nothing. The user can set any CLI in the first run.
export function agentFor(chosen: string | undefined, answer: string | undefined, skipped: boolean, info?: { cli?: string; clis?: Cli[] }) {
  const now = info?.clis?.find((c) => c.id === info.cli);
  return chosen ?? answer ?? (ready(now) ? now!.id : info?.clis?.find(ready)?.id) ?? (skipped ? undefined : "claude");
}

const post = (path: string, body: object) => bridgeFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// One step: an icon, a title, one line, and the buttons at the bottom.
export function Step({ icon, title, text, children, foot, top }: { icon?: IconName; title: string; text?: ReactNode; children?: ReactNode; foot: ReactNode; top?: ReactNode }) {
  return (
    <main className="setup">
      {top}
      <div className="setup-body">
        {icon && (
          <span className="setup-tile">
            <Icon name={icon} size={36} />
          </span>
        )}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
        {children}
      </div>
      <div className="setup-foot">{foot}</div>
    </main>
  );
}
const Bar = ({ done, onBack }: { done: number; onBack?: () => void }) => (
  <div className="setup-top">
    <button className="setup-back" onClick={onBack} disabled={!onBack} aria-label="Back">
      {onBack && <Icon name="back" size={22} />}
    </button>
    <div className="setup-bar">
      <i style={{ width: `${Math.round(done * 100)}%` }} />
    </div>
    <span className="setup-back" />
  </div>
);

// ask: the questions run (the computer has no `onboarded` yet). connect: the cards of the sign-ins (Logins of App.tsx).
export function Setup({ ask, connect, onDone }: { ask: boolean; connect: ReactNode; onDone: (p: Picked) => void }) {
  const [steps, setSteps] = useState<string[]>();
  const [at, setAt] = useState(0);
  const [a, setA] = useState<Answers>({});
  const [trail, setTrail] = useState<string[]>([]);
  const [q, setQ] = useState("q1");
  const [skipped, setSkipped] = useState(false);
  const [screen, setScreen] = useState<string>();
  const [choose, setChoose] = useState<"screen" | "agent">();
  // The CLIs of the computer, for the Agent row. `chosen` is the pick of the user in its list.
  const [info, setInfo] = useState<{ cli?: string; clis?: Cli[] }>();
  const [chosen, setChosen] = useState<string>();
  const cliName = (id: string) => info?.clis?.find((c) => c.id === id)?.name ?? nameOf(id);
  const [busy, setBusy] = useState("");
  const result = useRef<Picked>({});

  // The steps of this device: folder access when the Mac has none, the questions, the sign-in when a card waits, and
  // the permissions of a phone that paired in the first run (`permsWait` of src/Pair.tsx, a value of this device).
  useEffect(() => {
    void (async () => {
      const disk = await bridgeFetch("/access").then((r) => r.json(), () => ({})).then((r: { disk?: boolean | null }) => r.disk === false);
      const signIn = await yonder.logins.list().then((l: unknown[]) => l.length > 0, () => false);
      // ?setup=all in the dev server shows the steps of the phone in the browser too, for a check.
      // A list that fails is empty, so Continue of "Your Yonder" still works.
      if (ask) void yonder.settings.clis(undefined, true).then(setInfo, () => setInfo({}));
      const perms = (phone && !!localStorage.getItem("permsWait")) || (import.meta.env.DEV && new URLSearchParams(location.search).get("setup") === "all");
      const list = [disk && "folder", ask && "questions", ask && "summary", signIn && "connect", perms && "mic", perms && "notify", perms && "media", ask && "agent"].filter(Boolean) as string[];
      list.length ? setSteps(list) : onDone({});
    })();
  }, []);
  const step = steps?.[at];
  const go = () => (at + 1 < (steps?.length ?? 0) ? setAt(at + 1) : finish());
  // The end gives the push token to the Mac in any case: connectPhone held it while the setup ran (src/bridge.ts).
  const finish = () => (localStorage.getItem("permsWait") && (localStorage.removeItem("permsWait"), pushOn() && setPush(true)), onDone(result.current));
  const done = steps ? (at + 0.5) / steps.length : 0;

  // The folder step waits for the grant: the bridge reads a protected file again each 2 s.
  useEffect(() => {
    if (step !== "folder" || !busy) return;
    const t = setInterval(() => void bridgeFetch("/access").then((r) => r.json()).then((r) => r.disk && (clearInterval(t), setBusy(""), go()), () => {}), 2000);
    return () => clearInterval(t);
  }, [step, busy]);
  // The sign-in step goes on by itself when no card waits any more.
  useEffect(() => {
    if (step !== "connect") return;
    const t = setInterval(() => void yonder.logins.list().then((l: unknown[]) => l.length === 0 && (clearInterval(t), go()), () => {}), 2500);
    return () => clearInterval(t);
  }, [step]);

  // The last step: the agent of the user sets up the rest (POST /setup-agent, bridge/setup-guide.md). It shows only
  // when the CLI of the first run, or the default of the computer after Skip, is installed and signed in.
  const [helper, setHelper] = useState<string>();
  useEffect(() => {
    if (step !== "agent") return;
    void yonder.settings.clis(undefined, true).then((d: { cli?: string; clis?: Cli[] }) => {
      const c = d.clis?.find((x) => x.id === (result.current.cli ?? d.cli));
      ready(c) ? setHelper(c!.name) : go();
    }, go);
  }, [step]);

  // The answers count when the questions end, also for a phone that pairs while the Mac still shows a later step.
  async function apply(p: Picked) {
    result.current = p;
    localStorage.setItem("onboarded", "on");
    if (p.screen) await pickScreen(p.screen).catch(() => {});
    if (p.screen === "big") localStorage.setItem("usageBar", "off");
    if (p.cli) await post("/clis", { cli: p.cli }).catch(() => {});
    if (p.mode) void post("/mode", { mode: p.mode }).catch(() => {});
    // The Mac never syncs phone.json by itself (syncPhoneConfig is for the phone), so it sends the flag and the screen.
    if (phone) syncPhoneConfig();
    else void post("/phone-config", { onboarded: "on", ...(p.screen && { ui: p.screen }), ...(p.screen === "big" && { usageBar: "off" }) }).catch(() => {});
    // The CLI of the answers installs and signs in only now, after the user saw it in the summary: Yonder installs no CLI
    // that the user did not pick, also not Claude Code. True: the Connect step comes next.
    const now = p.cli ? ((await yonder.settings.clis(undefined, true).catch(() => undefined)) as { clis?: Cli[] } | undefined) : undefined;
    const c = now?.clis?.find((x) => x.id === p.cli);
    // The bridge starts the sign-in of Claude Code for a computer with no default yet. A user who picked another CLI does
    // not get that card, and a Connect step with no card goes.
    if (c && (c.base ?? c.id) !== "claude") await post("/logins", { id: "claude", action: "cancel" }).catch(() => {});
    if (!c || ready(c)) {
      if (steps!.includes("connect") && !(await yonder.logins.list().then((l: unknown[]) => l.length, () => 1))) setSteps(steps!.filter((x) => x !== "connect"));
      return false;
    }
    await yonder.logins.run(c.id, "login").catch(() => {});
    if (!steps?.includes("connect")) setSteps([...steps!.slice(0, at + 1), "connect", ...steps!.slice(at + 1)]);
    return true;
  }
  // Each call asks the system once. A refusal, or a computer with no such permission, goes on.
  // A call that gets no answer, such as a location with no fix, goes on after 10 s.
  const ask1 = async (f: () => unknown) => {
    try {
      await Promise.race([f(), new Promise((r) => setTimeout(r, 10_000))]);
    } catch {}
  };

  if (!step) return <main className="setup" />;
  if (step === "folder")
    return (
      <Step
        icon="folder"
        title="Let your agents open your files"
        text="On your Mac, turn on Yonder in Full Disk Access."
        foot={
          <>
            <button className="setup-main" disabled={!!busy} onClick={() => (setBusy("wait"), void post("/access", {}).catch(() => {}))}>
              {busy ? "Waiting for your Mac" : phone ? "Open on my Mac" : "Open System Settings"}
            </button>
            <button className="setup-text" onClick={() => (setBusy(""), go())}>
              Later
            </button>
          </>
        }
      >
        {busy && <span className="setup-spin" />}
      </Step>
    );
  if (step === "questions") {
    const opts = Q[q].o(a);
    const pick = (j: number) => {
      const b = { ...a, [q]: j };
      setA(b);
      const n = next(q, b);
      setTimeout(() => (n ? (setTrail([...trail, q]), setQ(n)) : (setScreen(picked(b).screen), go())), 230);
    };
    return (
      <Step
        key={q}
        title={Q[q].t}
        top={<Bar done={done} onBack={trail.length ? () => (setQ(trail.at(-1)!), setTrail(trail.slice(0, -1))) : undefined} />}
        foot={
          <button className="setup-text" onClick={() => (setSkipped(true), setScreen(undefined), go())}>
            Skip
          </button>
        }
      >
        <div className="setup-opts">
          {opts.map(([o, icon], j) => (
            <button key={o} className={a[q] === j ? "on" : undefined} onClick={() => pick(j)}>
              <Icon name={icon} size={22} />
              <span>{o}</span>
              <Icon name="check" size={20} />
            </button>
          ))}
        </div>
      </Step>
    );
  }
  if (step === "summary") {
    const ans = skipped ? undefined : picked(a);
    const cli = agentFor(chosen, ans?.cli, skipped, info);
    // Auto mode for a beginner with Claude Code: its classifier lets the safe actions run, and a risky one shows the card
    // "Allow Bash?". The other CLIs keep Bypass, because Yonder has no card for them yet (bridge/acp-host.ts).
    const p: Picked & { plan?: boolean } = { screen: ans && screen, cli, mode: ans && a.q1 < 2 && cli === "claude" ? "auto" : undefined, plan: ans?.plan && cli === "claude" };
    const id = p.screen ?? "yonder";
    // The CLIs that are ready come first in the list of the Agent row.
    const agents = [...(info?.clis ?? [])].sort((x, y) => Number(ready(y)) - Number(ready(x)));
    return (
      <Step
        title="Your Yonder"
        text="Made from your answers."
        top={<Bar done={done} onBack={() => (setSkipped(false), setAt(at - 1))} />}
        foot={
          // Continue waits for the list of the CLIs: with no list, a fast Skip gave no agent, and the bridge kept Claude Code.
          <button className="setup-main" disabled={!info} onClick={() => void apply(p).then((connect) => (connect ? setAt(at + 1) : go()))}>
            Continue
          </button>
        }
      >
        <div className="setup-rows">
          <button onClick={() => setChoose("screen")}>
            <Swatch colors={colorsOf(SAMPLES[id])} dark={document.documentElement.dataset.theme === "dark"} />
            <span>
              <small>Screen</small>
              {SAMPLES[id].name}
            </span>
            <Icon name="forward" size={16} />
          </button>
          <button onClick={() => setChoose("agent")}>
            <i className="setup-ic">
              <Icon name="terminal" size={18} />
            </i>
            <span>
              <small>Agent</small>
              {cli ? cliName(cli) : "None"}
            </span>
            <Icon name="forward" size={16} />
          </button>
          <div>
            <i className="setup-ic">
              <Icon name="shield" size={18} />
            </i>
            <span>
              <small>Permissions</small>
              {p.mode === "auto" ? "Auto mode" : "Bypass"}
            </span>
          </div>
        </div>
        {p.plan && (
          <p className="setup-note">
            Claude Code needs Claude Pro or Max. <a href="https://claude.ai/upgrade">Get it</a>
          </p>
        )}
        <p className="setup-note">Change them any time in Settings.</p>
        {/* The same list as Settings › Appearance › Screen (src/Looks.tsx): the built-in styles. */}
        {choose && (
          <div className="setup-scrim" onClick={(e) => e.target === e.currentTarget && setChoose(undefined)}>
            <div className="setup-sheet">
              <h2>{choose === "agent" ? "Agent" : "Screen"}</h2>
              <div className="setup-rows">
                {/* Each CLI that Yonder knows, also an agent that the user added. A row with a plan is ready. */}
                {choose === "agent" &&
                  agents.map((c) => (
                    <button key={c.id} onClick={() => (setChosen(c.id), setChoose(undefined))}>
                      <i className="setup-ic">
                        <Icon name="terminal" size={18} />
                      </i>
                      <span>
                        {c.name}
                        {ready(c) && <small>{c.account}</small>}
                      </span>
                      {c.id === cli && <Icon name="tick" size={18} />}
                    </button>
                  ))}
                {choose === "screen" && Object.entries(SAMPLES).map(([sid, look]) => (
                  <button key={sid} onClick={() => (setScreen(sid === "yonder" ? undefined : sid), setSkipped(false), setChoose(undefined))}>
                    <Swatch colors={colorsOf(look)} dark={document.documentElement.dataset.theme === "dark"} />
                    <span>
                      {look.name}
                      <small>{look.about}</small>
                    </span>
                    {sid === id && <Icon name="tick" size={18} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Step>
    );
  }
  if (step === "connect")
    return (
      <Step
        icon="terminal"
        title={result.current.cli ? `Connect ${cliName(result.current.cli)}` : "Connect your agent"}
        text="Yonder installs it on your computer. Then sign in."
        top={<Bar done={done} />}
        foot={
          <button className="setup-text" onClick={go}>
            Later
          </button>
        }
      >
        <div className="setup-connect">{connect}</div>
      </Step>
    );
  if (step === "agent")
    return helper ? (
      <Step
        icon="terminal"
        title={`Let ${helper} set up the rest`}
        text="It asks what you want. Then it changes the settings for you."
        top={<Bar done={done} />}
        foot={
          <>
            <button
              className="setup-main"
              disabled={!!busy}
              onClick={() => {
                setBusy("start");
                // The chat of the new agent opens when the setup ends, because its first answer is a question.
                const started = (r: { id?: string }) => void (result.current = { ...result.current, agent: r.id });
                void post("/setup-agent", {}).then((r) => r.json()).then(started, () => {}).then(go);
              }}
            >
              Start
            </button>
            <button className="setup-text" onClick={go}>
              Later
            </button>
          </>
        }
      />
    ) : (
      <main className="setup" />
    );
  if (step === "mic")
    return (
      <Step
        icon="mic"
        title="Talk to your agents"
        text="Yonder listens only during a call or when you dictate."
        top={<Bar done={done} />}
        foot={
          <button
            className="setup-main"
            onClick={async () => {
              await ask1(() => navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())));
              // The speech recognizer of iOS asks for its own permission at its start (Dictate.swift).
              if (!android) await ask1(() => invoke("dictation", { op: "start" }).then(() => invoke("dictation", { op: "stop" })));
              go();
            }}
          >
            Continue
          </button>
        }
      />
    );
  if (step === "notify")
    return (
      <Step
        icon="smartphone"
        title="Know when a task is done"
        text="Yonder tells you when an agent finishes or needs your answer."
        top={<Bar done={done} />}
        foot={
          <button className="setup-main" onClick={() => (setPush(true), go())}>
            Continue
          </button>
        }
      />
    );
  return (
    <Step
      icon="image"
      title="Share photos and places"
      text="Send a photo or your location to an agent when you ask."
      top={<Bar done={done} />}
      foot={
        <button
          className="setup-main"
          onClick={async () => {
            if (!android) await ask1(() => yonder.native.recentPhotos({ count: 1 }));
            await ask1(locate);
            go();
          }}
        >
          Continue
        </button>
      }
    />
  );
}
