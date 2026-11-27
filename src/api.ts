// The one front-end API of Yonder (docs/screen-api.md). Each front end reaches the bridge, the call, the settings and
// the phone abilities only through `yonder`: the default screen imports it, and a page in a frame calls it through
// src/OwnScreen.tsx, which adds the gates of a page. So a new feature here reaches each front end: the default screen
// is one front end among many, on the same API.
import { invoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { bridgeFetch, call, callTool, onceMore, type Project, type Worker } from "./bridge";
import { runAbility } from "./abilities";
import { syncPhoneConfig, KEYS } from "./phone-config";
import { DEFAULT, loadMine, pickScreen, rename as renameScreen, SAMPLES } from "./look";
import { changeCanvas, goneApp, holdApp, showArtifact, type Artifact } from "./Canvas";
import { dictate } from "./dictate";
import type { Schedule } from "./Schedules";
import type { Listing } from "./FolderPicker";
import { SCHEMA, SECTIONS } from "../bridge/settings/index";
import { shown } from "./names";
import { PATHS } from "./icons";

// `available` is false on a computer: calls are only on the phone, so a page shows no call button there.
export type CallState = { phase: string; since?: number; muted: boolean; available?: boolean };
// One setting of the schema of the Settings (bridge/settings/), with its value, and one section, a page of the Settings.
export type Setting = {
  key: string; label: string; section: string; control: string; type?: string; default?: unknown; store?: "config" | "phone" | "claude"; help?: string; words?: string;
  group?: string; options?: { value: string; label: string }[]; min?: number; max?: number; step?: number; component?: string; only?: "phone" | "mac"; value?: unknown;
};
export type Section = { id: string; name: string; icon: string; only?: "phone" | "mac"; superuser?: boolean; home?: boolean };
export type Turn = { who: string; text: string; [more: string]: unknown };

// The parts that live in the state of the app (App.tsx gives them with `attach` when it starts): the list of the
// agents, the call and the Settings. Until then a front end gets an empty list and an idle call.
type Host = {
  workers: () => Worker[];
  call: () => CallState;
  startCall: () => void;
  endCall: () => void;
  mute: () => void;
  openSettings: () => void;
  applySettings: () => void;
  // The project of the screen: All projects (path "*") or one project, and a pick of another one.
  project: () => { name: string; path: string };
  selectProject: (path: string) => void;
  // An action of the attach sheet; the answer is the path of the new file on the computer, or null.
  attach: (kind: "camera" | "photos" | "file" | "paste" | "location" | "version") => Promise<{ path: string } | null>;
};
let host: Host = { workers: () => [], call: () => ({ phase: "idle", muted: false }), startCall() {}, endCall() {}, mute() {}, openSettings() {}, applySettings() {}, project: () => ({ name: "All workspaces", path: "*" }), selectProject() {}, attach: async () => null };
export const attach = (h: Host) => void (host = h);

// The listeners of `on`. The app calls `changed` after each change of the list or the call.
const subs = { mice: new Set<(v: unknown) => void>(), call: new Set<(v: unknown) => void>(), project: new Set<(v: unknown) => void>() };
const on = (what: keyof typeof subs) => (fn: (v: any) => void) => (subs[what].add(fn), () => void subs[what].delete(fn));
export function changed(what: keyof typeof subs) {
  const value = what === "mice" ? mice() : what === "project" ? host.project() : host.call();
  subs[what].forEach((fn) => fn(value));
}

// An agent as a front end sees it (`Mouse`): no paths, no session and no queue. `label` is what a page shows in the
// place of the number: "2", or the name in the names and projects modes, "Jack" or "Sundial 7" (`agentNaming`, src/names.ts).
const slim = (w: Worker) => ({
  id: w.id, num: w.num, label: shown(w, host.workers()), name: w.name, project: w.project, task: w.task, status: w.status, activity: w.activity, summary: w.summary, next: w.next,
  model: w.model, effort: w.effort, context: w.context?.window ? Math.round((100 * w.context.used) / w.context.window) : undefined,
  startedAt: w.startedAt, createdAt: w.createdAt, updatedAt: w.updatedAt, unread: w.unread, attention: w.attention, avatar: w.avatar,
  owner: w.owner,
});
export type Mouse = ReturnType<typeof slim>;
const mice = () => host.workers().filter((w) => w.status !== "closed" && !w.parent).map(slim);
const closedMice = () => host.workers().filter((w) => w.status === "closed" && !w.parent).map(slim);

// An app as `yonder.apps` gives it to a page. An icon of the app that the user picked goes as SVG markup, as a drawn icon.
const iconOf = (icon?: string) =>
  icon && Object.hasOwn(PATHS, icon)
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[icon as keyof typeof PATHS].map((d) => `<path d="${d}"/>`).join("")}</svg>`
    : icon;
const appRow = (a: Artifact) => ({ id: a.id, title: a.title, icon: iconOf(a.icon), at: a.at, mouse: a.num, saved: !!a.saved, ...(a.archived && { archived: a.archived }) });
// To the archive (a time) or back from it (undefined): the row moves at once, and a load that started before keeps it
// where it went, until 10 s after the yes of the bridge.
const moveApp = async (id: string, archived?: number) => {
  const set = (v?: number) => changeCanvas((l) => l.map((x) => (x.id === id ? { ...x, archived: v } : x)));
  holdApp(id, archived);
  set(archived);
  try {
    await (archived ? tool("remove_app", { app: id }, 0) : tool("change_app", { app: id, archived: false }, 0));
    holdApp(id, archived, Date.now() + 10_000);
  } catch (e) {
    holdApp(id, undefined, 0);
    set(archived ? undefined : Date.now());
    throw e;
  }
};
// The tools of the bridge answer with text, mostly JSON.
const tool = <T = any>(name: string, args: Record<string, unknown> = {}, wait?: number): Promise<T> =>
  callTool(name, args, wait).then((t) => {
    try {
      return JSON.parse(String(t));
    } catch {
      return t;
    }
  });
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const json = async (path: string, init?: RequestInit) => {
  const r = await bridgeFetch(path, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `The bridge answered ${r.status}.`);
  return body;
};
const q = encodeURIComponent;
const icons = new Map<string, Promise<string>>();
// The fetch of the computer of an agent: the bridge of this computer, or the link of another computer (`link.fetch` of
// LinkOf in App.tsx), so the chat of an agent on another Mac comes from that Mac.
type Via = typeof bridgeFetch;
// A command of the native shell (src-tauri, the phone apps), with the same arguments and answer as invoke.
const shellCommand = <T = unknown>(name: string) => (args?: InvokeArgs, options?: InvokeOptions) => invoke<T>(name, args, options);

// The model, the effort and the permission mode of a new agent or a message. Only these keys go to the tool.
type Opts = { model?: string; effort?: string; mode?: string };
const pick = (o: Opts) => Object.fromEntries(((["model", "effort", "mode"] as const).flatMap((k) => (typeof o?.[k] === "string" && o[k] ? [[k, o[k]]] : []))));

// The people of this computer (docs/multi-user.md): two people or more who work on it at the same time, each with their
// own phones. `scope`: "mine" lists only the agents of the person of this device, "all" the agents of each person. One person
// or none: an empty list, and the scope does nothing.
export type Person = { id: string; name: string; main?: boolean };
let savedScope: string | null = null;
try {
  savedScope = localStorage.getItem("scope");
} catch {}
export const team = { people: [] as Person[], me: null as string | null, scope: (savedScope === "all" ? "all" : "mine") as "mine" | "all" };
// The name of the person who started an agent, for its row in the "all" scope. No owner: the main person.
export const ownerName = (w: { owner?: string }) =>
  team.scope === "all" && team.people.length > 1 ? (team.people.find((p) => p.id === w.owner) ?? team.people.find((p) => p.main))?.name : undefined;

export const yonder = {
  // The people of this computer and the person of this device. A bridge from before the people answers 404: no people.
  people: {
    list: (): Promise<{ people: Person[]; me: string | null }> =>
      bridgeFetch("/people")
        .then((r) => (r.ok ? r.json() : { people: [], me: null }))
        .then((p) => Object.assign(team, { people: Array.isArray(p.people) ? p.people : [], me: p.me ?? null }) && { people: team.people, me: team.me }),
    scope: () => team.scope,
    setScope: (scope: "mine" | "all") => {
      team.scope = scope;
      try {
        localStorage.setItem("scope", scope);
      } catch {}
    },
  },
  mice: {
    list: async () => mice(),
    // The closed agents, for a Closed tab of a page.
    closed: async () => closedMice(),
    // The whole list from the bridge, with the paths, the asks and the queues, for the default screen.
    all: () => call<Worker[]>("list_workers", { full: true, ...(team.scope === "all" && team.people.length > 1 && { scope: "all" }) }),
    // An action of the default screen on one or more agents: close_worker (with done to complete), remove_worker, star_worker,
    // move_worker and the others, with the queue of the phone when the Mac is offline.
    act: (name: string, args: Record<string, unknown>) => callTool(name, args),
    on: on("mice"),
    // `images`: the paths of files from yonder.attach, which go with the task or the message. `opts`: the model, the
    // effort and the permission mode, from `choices`; a message with only new opts is ".".
    start: (task: string, project = "", images: string[] = [], opts: Opts = {}) => tool("start_worker", { project, task, name: "", ...(images.length && { images }), ...pick(opts) }),
    send: (id: string, text: string, images: string[] = [], opts: Opts = {}) => tool("message_worker", { worker: id, message: text, ...(images.length && { images }), ...pick(opts) }),
    // The models, the efforts and the permission modes of Claude Code, for the pickers of a theme.
    // shortcut: only Claude Code; an agent of another CLI takes the names of its CLI.
    choices: async () => {
      const { EFFORTS, MODELS, MODES } = await import("./App");
      return {
        models: MODELS.map((m) => ({ value: m.alias, label: m.name })),
        efforts: EFFORTS.map((e) => ({ value: e, label: e })),
        modes: MODES.map((m) => ({ value: m.mode, label: m.name })),
      };
    },
    stop: (id: string) => tool("stop_worker", { worker: id }),
    done: (id: string) => tool("close_worker", { worker: id, done: true }),
    close: (id: string) => tool("close_worker", { worker: id }),
    rename: (id: string, name: string) => tool("rename_worker", { worker: id, name }),
    // The picture of an agent in a screen that draws one: a shape of that screen and a color.
    avatar: (id: string, avatar: { shape: string; color: string }) => tool("rename_worker", { worker: id, shape: avatar.shape, color: avatar.color }),
  },
  chat: {
    // The whole turns, with the diffs and the media that the default screen draws. A page gets only who and text.
    // `count`: the last turns to give, 300 when it is left out. It fails with the reason of the bridge, so that a chat that
    // did not load does not show as an empty chat.
    get: <T = Turn>(id: string, via: Via = bridgeFetch, count?: number): Promise<T[]> =>
      via(`/conversation?worker=${q(id)}${count ? `&count=${count}` : ""}`).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.text().catch(() => "")) || `The bridge answered ${r.status}.`)))),
    // The summary of an agent in three points at most, and the words of the spoken brief (`spoken`). {} when there is none.
    summary: (id: string, via: Via = bridgeFetch): Promise<{ summary?: string; spoken?: string; walkie?: string }> => via(`/summary?worker=${q(id)}`).then((r) => (r.ok ? r.json() : {})),
    // The task of an agent and where it stands, in 1 or 2 sentences of Haiku (the summarize button of a row on the Mac).
    gist: (id: string, via: Via = bridgeFetch): Promise<string> =>
      via(`/gist?worker=${q(id)}`).then(async (r) => (r.ok ? ((await r.json()).gist as string) : Promise.reject(new Error(await r.text())))),
    subagents: (id: string, via: Via = bridgeFetch) => via(`/subagents?worker=${q(id)}`).then((r) => (r.ok ? r.json() : [])),
    // What the Claude Code mods of an agent show (src/Mods.tsx). {} when none shows anything.
    mods: (id: string, via: Via = bridgeFetch) => via(`/mods?worker=${q(id)}`).then((r) => (r.ok ? r.json() : {})),
    // The slash commands of the CLI of an agent, in its folder.
    commands: (path: string, cli = "", via: Via = bridgeFetch) => via(`/commands?path=${q(path)}&cli=${cli}`).then((r) => r.json()),
    // The whole input and output of one tool call of a chat. It fails when the bridge has no such call.
    tool: (worker: string, id: string, via: Via = bridgeFetch) => via(`/tool?worker=${q(worker)}&id=${q(id)}`).then((r) => (r.ok ? r.json() : Promise.reject())),
  },
  // The attachments of the composer: the bridge keeps each one in a file for the agent. Each gives the answer of the
  // bridge, with the `path` of the file, or the reason as text when it fails.
  media: {
    // An image pasted during a restart of the bridge goes again (Sentry YONDER-18). A second copy of the file does no harm.
    image: (file: File) => onceMore(() => bridgeFetch("/image", { method: "POST", headers: { "content-type": file.type }, body: file })),
    // A video goes in parts with the same `id`. The last part (`end`) gives the path, the seconds and the thumb.
    video: (id: string, part: Blob, type: string, end: boolean) => bridgeFetch(`/video?id=${id}${end ? "&end" : ""}`, { method: "POST", headers: { "content-type": type }, body: part }),
    // A file goes in parts of 768 KB with the same `id`, because the relay takes 1 MiB at most for each request of the
    // phone. The last part (`end`) gives the path, or the reason when the bridge refuses the file.
    file: async (file: File) => {
      const id = crypto.randomUUID().replaceAll("-", "");
      for (let at = 0; ; at += 768 * 1024) {
        const end = at + 768 * 1024 >= file.size;
        const res = await bridgeFetch(`/file?name=${q(file.name)}&id=${id}${end ? "&end" : ""}`, { method: "POST", body: file.slice(at, at + 768 * 1024) });
        if (end || !res.ok) return res;
      }
    },
    paste: (text: string) => bridgeFetch("/paste", { method: "POST", headers: { "content-type": "text/plain" }, body: text }),
    // The paths of files on the clipboard of the Mac, or with `drag` the files of the last drag. [] when it has no file, or
    // the bridge has no such route.
    clipboardFiles: (drag = false) =>
      bridgeFetch(`/clipboard-files${drag ? "?drag" : ""}`).then(async (r) => {
        if (!r.ok) return [] as string[];
        const body = (await r.json()) as { paths?: unknown };
        return Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string" && p.startsWith("/")) : [];
      }),
    // A file that the user copied in Finder, at its own place. It gives the `path` for the agent, and a `thumb` of a picture
    // or a video, the `seconds` of a video, or the `name` of each other file.
    local: (path: string) => bridgeFetch(`/local?path=${q(path)}`, { method: "POST" }),
    // The record button of the Mac: the user drags an area of the screen, and the bridge records it with the microphone.
    // It answers when the recording ends, with the `path` of the video for `local`, or null on Escape.
    // `mic` is the name of the microphone of the settings, "" for the built-in one.
    record: (mic: string) => bridgeFetch(`/record?mic=${q(mic)}`, { method: "POST" }),
    recordStop: () => bridgeFetch("/record/stop", { method: "POST" }),
    // Saves a file in the Downloads folder of the computer: the bytes with a name, or a file of the computer (`src`).
    // `open` also opens the copy, for a PDF.
    save: (file: { name: string; body: BodyInit } | { src: string }, open = false) =>
      bridgeFetch(`/save?${"src" in file ? `src=${q(file.src)}` : `name=${q(file.name)}`}${open ? "&open" : ""}`, { method: "POST", body: "src" in file ? undefined : file.body }),
  },
  // The asks of the bridge for the screen after the id `after`: a page of the Canvas to show, or an ability of the phone.
  // A phone names its `abilities`, and also does the location for a bridge from before the abilities.
  show: {
    // `screen`: the size of this screen for the apps that the agents make (screenOf in src/Canvas.tsx).
    poll: (after: number, abilities?: string, screen?: string) =>
      bridgeFetch(`/show?after=${after}&canvas${abilities !== undefined ? `&locate&abilities=${abilities}` : ""}${screen ? `&screen=${q(screen)}` : ""}`).then((r) => (r.ok ? r.json() : [])),
    // The answer of the phone to an ask: the result of an ability, or the location for an older bridge (`location`).
    answer: (id: number, body: unknown, location = false) => bridgeFetch(`/${location ? "location" : "answer"}?id=${id}`, { method: "POST", body: JSON.stringify(body) }),
  },
  // The dictation of src/dictate.ts: speech to text with no call. onText gets the words so far, and `stop` of the
  // answer gives the whole text. A call owns the microphone, so a dictation does not start in a call.
  dictation: {
    start: async (onText: (text: string) => void, onError: (message: string) => void) => {
      if (host.call().phase !== "idle") throw new Error("The call uses the microphone.");
      return dictate(onText, onError);
    },
  },
  call: {
    state: async () => host.call(),
    on: on("call"),
    start: async () => (host.call().phase === "idle" && host.startCall(), host.call()),
    end: async () => (host.call().phase !== "idle" && host.endCall(), host.call()),
    mute: async () => (host.mute(), host.call()),
  },
  projects: {
    list: () => call<Project[]>("list_projects"),
    // The project of the screen, the same in each front end: { name, path }, with the path "*" for All projects. A pick
    // shows at once in the default screen and in a page. There is one project switcher.
    current: async () => host.project(),
    select: async (path: string) => host.selectProject(path),
    on: on("project"),
    star: (path: string, starred: boolean) => tool("star_project", { project: path, starred }),
    // The default profile of a project by its name, or "default" for the profile of the Settings.
    profile: (path: string, profile: string) => tool("set_project_profile", { project: path, profile }),
    // The favicon of a project as a data URL, or "" for a project with none, so a page in a frame, which has no network,
    // can show it. Each one loads once.
    icon: (path: string) => {
      if (!icons.has(path))
        icons.set(
          path,
          bridgeFetch(`/favicon?path=${q(path)}`)
            .then((r) => (r.ok ? r.blob() : undefined))
            .then((b) => (b ? new Promise<string>((ok) => Object.assign(new FileReader(), { onload: (e: ProgressEvent<FileReader>) => ok(String(e.target?.result ?? "")) }).readAsDataURL(b)) : ""))
            .catch(() => (icons.delete(path), "")),
        );
      return icons.get(path)!;
    },
    order: (paths: string[]) => tool("star_project", { order: paths }),
    remove: (path: string) => tool("remove_project", { project: path }),
  },
  // The past calls with their transcripts, the newest first.
  calls: () => bridgeFetch("/calls").then((r) => r.json()),
  // The version of the source on the computer, for the update button.
  version: () => bridgeFetch("/version?full").then((r) => r.json()),
  // The word of the user for an agent (`agentName` in config.json). {} from an older bridge.
  agentName: () => bridgeFetch("/agent-name").then((r) => (r.status === 404 ? {} : r.json())),
  // `key`: the computer has its own xAI key. An older bridge answers with a token (`value`), which also means a key.
  ownKey: (): Promise<{ key?: boolean; keys?: string[]; value?: string }> => bridgeFetch("/token?check").then((r) => (r.ok ? r.json() : {})),
  // The relay of the computer, with its paired `phones`.
  relay: () => bridgeFetch("/relay").then((r) => r.json()),
  // The rules of the talk of the voice agent (bridge/talk.md, or the copy of the user), as `text`.
  talk: () => bridgeFetch("/talk").then((r) => r.json()),
  // Keeps the computer awake during a call, a minute at a time. `end` lets it sleep again.
  awake: (end = false) => bridgeFetch(end ? "/awake?end" : "/awake", { method: "POST" }),
  // The user works on the computer now, so the phones get no push.
  here: () => bridgeFetch("/here", { method: "POST" }),
  // The cards of the install and the sign-in of the CLIs, of this computer or of another one (`via`).
  logins: {
    list: (via: Via = bridgeFetch) => via("/logins").then((r) => (r.ok ? r.json() : [])),
    // Installs a CLI or starts its sign-in: on its card, or in a new terminal tab of the computer (`terminal`).
    run: (id: string, action: "install" | "login", terminal = false) => bridgeFetch(terminal ? "/clis/terminal" : "/logins", post({ id, action })),
  },
  // The tools on the computer (bridge/tools.ts), and the install of one after a yes. Each gives the whole list.
  tools: {
    list: () => bridgeFetch("/tools").then((r) => r.json()),
    install: (id: string) => bridgeFetch("/tools", post({ id })).then((r) => r.json()),
  },
  // The agents of the ACP registry (bridge/registry.ts), and the add of one. Add gives the answer of the bridge.
  agents: {
    registry: () => bridgeFetch("/agents/registry").then((r) => r.json()),
    add: (id: string) => bridgeFetch("/agents/add", post({ id })),
  },
  // 1Password for the agents (bridge/vault.ts): the state, the token from a phone, and the key of an approval with Face ID.
  vault: {
    state: () => bridgeFetch("/vault").then((r) => (r.ok ? r.json() : undefined)),
    connect: (token?: string) => bridgeFetch("/vault", post({ token })),
    approve: (id: string, key: string, pub?: string) => bridgeFetch("/vault/approve", post({ id, key, pub })),
  },
  // The agents that the bridge starts at set times (the schedule tool of the bridge). A failure gives its reason.
  schedules: {
    list: () => call<{ schedules: Schedule[] }>("schedule", { action: "list" }).then((r) => r.schedules),
    save: (id: string | undefined, fields: Record<string, unknown>) => call<Schedule>("schedule", { action: "save", id, ...fields }),
    run: (id?: string) => call("schedule", { action: "run", id }),
    remove: (id: string) => call("schedule", { action: "remove", id }),
  },
  // The folders of the computer, for a new project. No path gives the home folder.
  folders: { list: (path?: string) => call<Listing>("list_folders", path ? { path } : {}) },
  profiles: {
    // A new profile or a change of one. The answer of the bridge has the CLIs, or the `error`.
    save: (body: object) => bridgeFetch("/profiles", post(body)),
    // The step of the sign-in of a profile. {} when the bridge has none.
    setup: (profile: string) => bridgeFetch(`/setup?profile=${q(profile)}`).then((r) => (r.ok ? r.json() : {})),
    // Starts the sign-in of a profile again.
    signIn: (profile: string) => bridgeFetch(`/setup?profile=${q(profile)}`, post({})),
  },
  usage: {
    // The raw usage of Claude Code and of Grok, for the settings. `fresh` ("?fresh") asks the bridge for new numbers.
    claude: (fresh = "") => bridgeFetch(`/claude-usage${fresh}`).then((r) => r.json()),
    grok: (fresh = "") => bridgeFetch(`/grok-usage${fresh}`).then((r) => r.json()),
    // The Claude Code usage of the week and of the 5-hour session, in percent, as the title bar shows it.
    get: async () => {
      const u = (await json("/claude-usage")) as { limits?: { name: string; percent: number; resets_at: string | null }[]; plan?: { limits?: { name: string; percent: number; resets_at: string | null }[] } };
      const limits = u.plan ? u.plan.limits : u.limits;
      const find = (re: RegExp) => limits?.find((l) => re.test(l.name));
      return { week: find(/^Week/i)?.percent, session: find(/session|5.hour/i)?.percent, limits: limits ?? [] };
    },
  },
  approvals: {
    // The questions that wait for the user: a tool to allow, and the approvals of the Canvas.
    list: async () =>
      host.workers().flatMap((w) => (w.ask ? [{ id: w.ask.id, kind: w.ask.kind ?? "permission", mouse: w.num, title: w.ask.title ?? w.ask.text, rows: w.ask.rows ?? [], faceId: !!w.ask.faceId }] : [])),
    // The answer of a sheet of the default screen, which asked for Face ID itself (src/Canvas.tsx). The bridge answers
    // { ok, error }: a yes that it refuses has the reason in `error`.
    reply: (id: string, allow: boolean, extra: { value?: string; choice?: string } = {}) => bridgeFetch("/permission", post({ id, allow, ...extra })).then((r) => r.json()),
    // No Face ID, as the sheet of the Canvas.
    answer: async (id: string, allow: boolean, extra: { value?: string; choice?: string } = {}) => {
      return json("/permission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, allow, ...extra }) });
    },
  },
  settings: {
    get: async () => Object.fromEntries(KEYS.filter((k) => k !== "ui").map((k) => [k, localStorage.getItem(k)])),
    // The sections of the Settings in order, and the schema with the value of each setting: the values of config.json come
    // from the bridge, and the values of phone.json from this phone, where a boolean is "on" or "off". With no bridge, the
    // schema of the build.
    all: async (): Promise<{ sections: Section[]; settings: Setting[] }> => {
      const { sections, schema, values } = (await json("/settings").catch(() => ({ schema: SCHEMA, values: {} }))) as { sections?: Section[]; schema: Setting[]; values: Record<string, unknown> };
      const own = (s: Setting) => {
        const v = localStorage.getItem(s.key);
        return v === null ? s.default : s.type === "boolean" ? v !== "off" : s.type === "number" ? Number(v) : v;
      };
      return {
        sections: sections ?? SECTIONS.map(({ settings: _, ...s }) => s),
        settings: schema.map((s) => ({ ...s, value: s.store === "phone" ? own(s) : s.store === "config" || s.store === "claude" ? values[s.key] : undefined })),
      };
    },
    // The settings of all the sections, with their values.
    schema: async (): Promise<Setting[]> => (await yonder.settings.all()).settings,
    // A setting of this phone (phone.json) changes at once and syncs; a setting of the computer (config.json) goes to
    // the bridge, which checks it against the schema.
    set: async (key: string, value: unknown) => {
      if (key === "ui") throw new Error("Use screen.use for the screen.");
      if (!KEYS.includes(key)) return json("/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value }) });
      value === null ? localStorage.removeItem(key) : localStorage.setItem(key, typeof value === "boolean" ? (value ? "on" : "off") : String(value));
      host.applySettings();
      syncPhoneConfig();
    },
    open: async () => host.openSettings(),
    // The Tunnel of the Settings with the suffix of its sites (/preview), and POST { tunnel } from yonder.so.
    tunnel: (init?: RequestInit) => json("/preview", init),
    // The tools of Yonder in each Claude Code session of the user: claude mcp add or remove.
    claudeMcp: (on?: boolean) => json("/claude-mcp", on === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on }) }),
    // The CLIs of the Agents section: GET (fresh: check them again), or a change of the CLI of new agents or of one CLI.
    clis: (change?: Record<string, unknown>, fresh = false) =>
      json(`/clis${fresh ? "?fresh" : ""}`, change && { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(change) }),
  },
  screen: {
    list: async () => ({ samples: Object.entries(SAMPLES).map(([id, l]) => ({ id, name: l.name, about: l.about, kind: l.kind ?? "style" })), mine: await loadMine() }),
    use: (id: string) => pickScreen(id || DEFAULT),
    rename: (id: string, name: string) => renameScreen(id.split("@")[0], name),
  },
  // The apps of the agents (the Canvas tab, bridge/canvas.ts), the newest first, and one app over the screen in the viewer
  // of Yonder, so a page of a theme has the Canvas tab too, also each sample. An
  // archive, a restore and a delete forever change the list of the screen at once, then call the bridge, and a failure
  // puts the app back where it was. `list` gives only the apps that are not in the archive.
  apps: {
    list: async () => ((await json("/canvas?all")) as Artifact[]).filter((a) => !a.archived).map(appRow),
    archived: async () => ((await json("/canvas?all")) as Artifact[]).filter((a) => a.archived).map(appRow),
    archive: (id: string) => moveApp(id, Date.now()),
    restore: (id: string) => moveApp(id, undefined),
    remove: async (id: string) => {
      const key = `page/${id}`;
      let was: Artifact[] = [];
      goneApp(key);
      changeCanvas((l) => ((was = l), l.filter((x) => x.id !== id)));
      try {
        await tool("remove_app", { app: id, forever: true }, 0);
        goneApp(key, Date.now() + 10_000);
      } catch (e) {
        goneApp(key, 0);
        changeCanvas((l) => (l.some((x) => x.id === id) ? l : [...l, ...was.filter((x) => x.id === id)].sort((x, y) => y.at - x.at)));
        throw e;
      }
    },
    open: async (id: string) => {
      const a = ((await json("/canvas?all")) as Artifact[]).find((x) => x.id === id);
      if (!a) throw new Error(`There is no app ${id}.`);
      showArtifact({ path: a.path, title: a.title });
    },
  },
  // The actions of the attach sheet, for a theme that draws its own sheet: each one opens the camera or a picker of the
  // system, and answers with { path } of the file on the computer, or null when the user picks nothing. A theme draws
  // its own controls and only calls the actions.
  attach: {
    camera: () => host.attach("camera"),
    photo: () => host.attach("photos"),
    file: () => host.attach("file"),
    paste: () => host.attach("paste"),
    location: () => host.attach("location"),
    // The version of this phone and of the environment on the computer, as a text file.
    version: () => host.attach("version"),
  },
  phone: {
    ability: async (name: string, args: Record<string, unknown> = {}) => {
      const out = (await runAbility(name, args)) as Record<string, unknown>;
      if (typeof out?.error === "string") throw new Error(out.error);
      return out;
    },
  },
  // The commands of the native shell that the default screen uses. A page in a frame gets none of them: it asks for a
  // phone ability (yonder.phone.ability) instead.
  native: {
    setKeys: shellCommand("set_keys"),
    setMenuKeys: shellCommand("set_menu_keys"),
    paintWindow: shellCommand("paint_window"),
    setWake: shellCommand("set_wake"),
    setCallLive: shellCommand("set_call_live"),
    callLevel: shellCommand("call_level"),
    checkUpdate: shellCommand<string | null>("check_update"),
    installUpdate: shellCommand("install_update"),
    attachSheet: shellCommand<boolean>("attach_sheet"),
    island: shellCommand("island"),
    quickLook: shellCommand<boolean>("quick_look"),
    playVideo: shellCommand<boolean>("play_video"),
    phoneLock: shellCommand<number>("phone_lock"),
    recentPhotos: shellCommand<string>("recent_photos"),
    readPicked: shellCommand<ArrayBuffer>("read_picked"),
    photo: shellCommand<string>("photo"),
  },
  tool,
};
// The projects are now workspaces. The screens can call yonder.workspaces too. The calls keep the old tool
// names, which the bridge still takes, so a new app works with an older bridge as well.
Object.assign(yonder, { workspaces: yonder.projects });
