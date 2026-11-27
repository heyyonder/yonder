// Check: `bun src/names.ts`.
// The word of the user for an agent, on the screen and in the voice: `agentName` in config.json of the bridge, such as
// { "one": "bot", "many": "bots", "icon": "<svg …>" }. The code, the tool names and the APIs keep "agent". `icon` is the icon of the Agents tab: SVG markup, or the name of an icon of the app.
// `naming` is `agentNaming` of config.json: how Yonder calls each agent (`callName`).
export type AgentName = { one?: string; many?: string; icon?: string; naming?: Naming };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const word = { one: "agent", many: "agents", One: "Agent", Many: "Agents", icon: "", naming: "numbers" as Naming };
// Sets the word, and returns true when it changed.
export function setWord(n: AgentName | null | undefined) {
  const one = n?.one?.trim() || "agent";
  const many = n?.many?.trim() || `${one}s`;
  const next = { one, many, One: cap(one), Many: cap(many), icon: n?.icon ?? "", naming: n?.naming ?? "numbers" };
  if (JSON.stringify(next) === JSON.stringify(word)) return false;
  Object.assign(word, next);
  return true;
}
// The page keeps the last word, so the first paint has it before the bridge answers.
try {
  setWord(JSON.parse(localStorage.getItem("agentName") ?? "null"));
} catch {}
// "agent" and "agents" in a text as the word of the user, with its capital: "Agent 4 started." is "Bot 4 started.".
// show_agent and other names with "_" stay, because "_" is a letter for `\b`. A name in backticks stays too, such as
// the `agents` field or the `agent` input of a tool. A path, a file name and a link stay too ("~/.claude/agents/",
// "agents.json", "op://Agent/GitHub/token"), and so does the voice agent, which is not an agent of the user.
export const swap = (text: string, n: AgentName = word) => {
  const one = n.one?.trim() || "agent";
  const many = n.many?.trim() || `${one}s`;
  // "an agent" is "a bot": the article follows the new word.
  const article = (an: string) => (/^[aeiou]/i.test(one) ? an.slice(0, 1) + "n" : an.slice(0, 1));
  return one === "agent" && many === "agents"
    ? text
    : text.replace(/`[^`\n]*`|\b[Vv]oice agents?\b|\b(?:(an?|An?) )?([Aa])gent(s?)\b/g, (m: string, an: string | undefined, a: string | undefined, s: string, at: number) =>
        !a || /[/.]/.test(text[at - 1] ?? "") || /^(\/|\.\w)/.test(text.slice(at + m.length, at + m.length + 2))
          ? m
          : (an && !s ? `${article(an)} ` : an ? `${an} ` : "") + (a === "A" ? cap : String)(s ? many : one));
};
// How the screen, the voice and the pushes call an agent: `agentNaming` in config.json. "numbers" gives "Bot 2".
// "names" gives a first name, "Jack". "projects" gives the project, "Sundial", with the number when the project has
// more open agents, "Sundial 7". The number stays the ID: each tool takes it, and the voice also takes the name.
export type Naming = "numbers" | "names" | "projects";
// Short first names that the speech to text hears well: no common words, such as Will or Max, and no two that sound alike.
export const NAMES = ["Jack", "Emma", "Leo", "Ruby", "Oscar", "Nora", "Felix", "Ivy", "Hugo", "Luna", "Milo", "Zoe", "Arlo", "Iris", "Otto", "Hazel", "Finn", "Stella", "Jasper", "Olive", "Gus", "Pearl", "Sam", "Clara", "Rosie", "Archie", "Lola", "Toby", "Bruno", "Daisy"];
// The name of agent `num`. Each new agent gets the lowest number that no open agent has (freeNum in bridge/main.ts), so
// two open agents never have the same name, and a name stays while its agent stays open.
// shortcut: the name follows the number, so an agent that runs again with a new number (keepNum) gets a new name; keep
// the name in the worker if that matters.
export const nameOf = (num: number) => NAMES[(num - 1) % NAMES.length] + (num > NAMES.length ? ` ${Math.ceil(num / NAMES.length)}` : "");
// The number of a name, or 0.
const numOfName = (name: string) => NAMES.findIndex((n) => n.toLowerCase() === name.trim().toLowerCase()) + 1;
type Named = { num: number; project: string; status?: string };
// What the user sees and hears for an agent: "Bot 2", "Jack" or "Sundial". `open`: the agents, for the projects mode.
export function callName(w: Named, open: Named[] = [], n: AgentName = word) {
  if (n.naming === "names") return nameOf(w.num);
  if (n.naming === "projects") return open.some((o) => o.num !== w.num && o.project === w.project && o.status !== "closed") ? `${w.project} ${w.num}` : w.project;
  return `${cap(n.one?.trim() || "agent")} ${w.num}`;
}
// True when Yonder calls the agents by a name ("names" or "projects"), not by the number.
export const byName = (n: AgentName = word) => n.naming === "names" || n.naming === "projects";
// What the screen shows in the place of the number of an agent: "2" ("21B" for a sub-agent), or its name in the names
// and projects modes, "Jack" or "Sundial 7", in the list, the headers and the pages. A sub-agent keeps its number, and
// a closed agent with no number shows "".
export const shown = (w: Named & { letter?: string }, open: Named[] = [], n: AgentName = word) =>
  !w.num ? "" : byName(n) && !w.letter ? callName(w, open, n) : `${w.num}${w.letter ?? ""}`;
// An agent in a line for the voice: "Agent 4", or "Jack (agent 4)", so that the voice says the name and gives the tools
// the number.
export const voiceRef = (w: Named, open: Named[] = [], n: AgentName = word) =>
  !n.naming || n.naming === "numbers" ? `Agent ${w.num}` : `${callName(w, open, n)} (agent ${w.num})`;
// The words for an agent in a regular expression: "agent", "agents" and the word of the user.
const nouns = (n: AgentName = word) => [...new Set(["agents?", n.one ?? "agent", n.many ?? "agents"].map((w, i) => (i ? w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : w)))].join("|");
// True when the words name agent `num`: its digits, or its number word after "number", "agent", "to", "tell" or "ask".
// The word alone does not count, because "one" is in many sentences that name no agent.
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
// In the names mode, the name of the agent also counts: "Tell Jack to stop."
export const names = (text: string, num: number) =>
  new RegExp(`\\b${num}\\b`).test(text) ||
  (num in NUMBER_WORDS && new RegExp(`\\b(number|${nouns()}|to|for|tell|ask)\\s+${NUMBER_WORDS[num]}\\b`, "i").test(text)) ||
  (word.naming === "names" && new RegExp(`\\b${nameOf(num)}\\b`, "i").test(text));
// The fixed words for a new agent: "Agent 4 started.", or "Started three agents." for a split job.
// In the names mode they are "Jack started.". Only then, because "Leo started the server" is no start in the other modes.
const named = () => (word.naming === "names" ? `|${NAMES.join("|")}` : "");
export const saysStarted = (words: string) => new RegExp(`\\b((?:${nouns()}${named()})(?: \\w+)? started|started \\w+ (?:${nouns()}))\\b`, "i").test(words);
// A reference to an agent with no word in front: "Bot 4" and "agent 4" are "4", and in the names mode "Jack" is "1".
export const stripNoun = (ref: string, n: AgentName = word) => {
  const bare = ref.trim().replace(new RegExp(`^(?:${nouns(n)})\\s*`, "i"), "");
  return n.naming === "names" && numOfName(bare) ? String(numOfName(bare)) : bare;
};
// The number or the name in "Agent 4 started." or "Jack started.", when the voice said one.
export const startedNum = (words: string) => new RegExp(`\\b(?:(?:${nouns()}) (\\d+)${named() && `|(${named().slice(1)})`}) started`, "i").exec(words)?.slice(1).find(Boolean);
// True when two tasks are one request: the letters and digits of one begin the other. The speech to text can give a
// request two times, or with the same words again. The parts of a split job differ after the request ("Your part: ..."), so they stay apart.
const plain = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
export const sameRequest = (a: string, b: string) => !!plain(a) && !!plain(b) && (plain(a).startsWith(plain(b)) || plain(b).startsWith(plain(a)));
// The one pull request that a task is about, for the name "PR 359 - Date picker" (prName in bridge/main.ts): its number,
// and the ref for `gh pr view`, the link when the task has one. None when the task names no PR or two. A bare "#359" is
// not a PR, because it is an issue as often.
const PR = /\b(?:PR|pull request)[\s#:-]*(\d+)\b|(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+))/gi;
export function prOf(text: string) {
  const found = [...text.matchAll(PR)].map((m) => ({ num: m[1] ?? m[3], ref: m[2] ?? m[1] }));
  return new Set(found.map((f) => f.num)).size === 1 ? found.find((f) => f.ref.startsWith("https:")) ?? found[0] : undefined;
}
// A close, complete or remove needs the words of the user, in code, for every voice. A voice can close agents with no
// words from the user, and a prompt rule does not stop it.
// asksClose: the last words of the user ask for it, or say yes to a question of Yonder about it ("Close 14?").
// shortcut: a list of words; a user who says "wrap it up" is refused once, and the voice asks "Close 3?".
const CLOSE = /\b(close[sd]?|closing|done|finish(?:ed)?|complete[sd]?|remove[sd]?|delete[sd]?|clean(?:ed)? (?:\w+ )?up|clear|archive|get rid|dismiss)\b/i;
const YES = /^\W*(yes|yeah|yep|yup|sure|ok(?:ay)?|do it|go ahead|please|correct|right|all|just|this one|both)\b/i;
const ASKED = /\b(close|complete|remove|delete|done|all of them)\b/i;
export const asksClose = (words: string, asked = "") =>
  CLOSE.test(words) || (/\?/.test(asked) && ASKED.test(asked) && YES.test(words));
// asksComplete: the words ask to mark an agent as completed (close_worker with done). A close word always wins, because
// a finished agent is on the Done tab already, and "close" moves it to the Closed tab.
const COMPLETE = /\bmark\w*\b.*\bdone\b|\bto (?:the )?done\b|\bcomplete[sd]?\b/i;
export const asksComplete = (words: string, asked = "") =>
  !/\bclos/i.test(words) && (COMPLETE.test(words) || (/\?/.test(asked) && /\bcomplete/i.test(asked) && YES.test(words)));
// A close of a whole tab also needs a group word. Else "let's close" after one agent closes all the completed agents.
const GROUP = /\b(all|every\w*|them|those|these|both|rest|ones|tab)\b/i;
export const asksGroup = (words: string, asked = "") => GROUP.test(words) || (/\?/.test(asked) && GROUP.test(asked) && YES.test(words) && GROUP.test(words));

if (import.meta.main) {
  const ok = (text: string, num: number, want: boolean) => {
    if (names(text, num) !== want) throw new Error(`names(${JSON.stringify(text)}, ${num}) is not ${want}`);
  };
  ok("Tell 3 to add that ability.", 3, true);
  ok("Can you move number five to Yonder?", 5, true);
  ok("Sent to one.", 1, true);
  ok("Okay tell that agent to add that ability.", 3, false);
  ok("Agent 13 is done.", 3, false);
  ok("I want one more button.", 1, false);
  ok("Agent four started.", 4, true);
  for (const [words, want] of [["Agent 4 started.", true], ["Agent started.", true], ["Started three agents.", true], ["Sent to 3.", false]] as const)
    if (saysStarted(words) !== want) throw new Error(`saysStarted(${JSON.stringify(words)}) is not ${want}`);
  setWord({ one: "mouse", many: "mice" });
  for (const [words, want] of [["Mouse 4 started.", true], ["Started three mice.", true], ["Agent 4 started.", true], ["Sent to 3.", false]] as const)
    if (saysStarted(words) !== want) throw new Error(`saysStarted(${JSON.stringify(words)}) with mice is not ${want}`);
  if (startedNum("Mouse 7 started.") !== "7") throw new Error("startedNum misses the word of the user");
  ok("Tell mouse four to stop.", 4, true);
  if (saysStarted("Leo started the server.") || startedNum("Leo started.")) throw new Error("a name is a start in the numbers mode");
  setWord({ one: "mouse", many: "mice", naming: "names" });
  ok("Jack started.", 1, true);
  ok("Tell Emma to push it.", 2, true);
  ok("Tell Emma to push it.", 1, false);
  if (!saysStarted("Leo started.") || startedNum("Leo started.") !== "Leo" || stripNoun("Emma") !== "2" || stripNoun("mouse 3") !== "3") throw new Error("the names mode misses a name");
  if (nameOf(31) !== "Jack 2") throw new Error("nameOf does not go round the list");
  const open = [{ num: 3, project: "Sundial" }, { num: 7, project: "Sundial" }, { num: 4, project: "Yonder" }];
  for (const [naming, want] of [["numbers", "Mouse 7, Mouse 4"], ["names", "Felix, Ruby"], ["projects", "Sundial 7, Yonder"]] as const)
    if ([7, 4].map((num) => callName(open.find((o) => o.num === num)!, open, { ...word, naming })).join(", ") !== want) throw new Error(`callName in the ${naming} mode is not ${want}`);
  if (voiceRef(open[2], open, { naming: "names" }) !== "Ruby (agent 4)" || voiceRef(open[2], open, {}) !== "Agent 4") throw new Error("voiceRef");
  for (const [naming, want] of [["numbers", "7, 4, 21B, "], ["names", "Felix, Ruby, 21B, "], ["projects", "Sundial 7, Yonder, 21B, "]] as const)
    if ([...open.slice(1), { num: 21, letter: "B", project: "Yonder" }, { num: 0, project: "Yonder" }].map((w) => shown(w, open, { naming })).join(", ") !== want) throw new Error(`shown in the ${naming} mode is not ${want}`);
  // Each open agent has its own number (freeNum in bridge/main.ts), so the names of 1 to 60 are all different.
  if (new Set(Array.from({ length: 60 }, (_, i) => nameOf(i + 1).toLowerCase())).size !== 60) throw new Error("two numbers have the same name");
  // The voice reaches each name: "Tell Stella to stop." names agent 16, and stripNoun gives 16 for a tool.
  setWord({ naming: "names" });
  for (let num = 1; num <= NAMES.length; num++)
    if (!names(`Tell ${nameOf(num)} to stop.`, num) || stripNoun(nameOf(num)) !== String(num)) throw new Error(`the voice misses ${nameOf(num)}`);
  setWord({ one: "mouse", many: "mice" });
  if (stripNoun("Mouse 4") !== "4" || stripNoun("agent 12") !== "12") throw new Error("stripNoun keeps the word");
  for (const [text, want] of [
    ["Agent 4 started. Started three agents.", "Mouse 4 started. Started three mice."],
    ["Call show_agent for the agent of the Agents tab.", "Call show_agent for the mouse of the Mice tab."],
    ["The agent's sub-agents.", "The mouse's sub-mice."],
    ["Start an agent. An agent runs. A new agent.", "Start a mouse. A mouse runs. A new mouse."],
    ["`agents` gives the agents for the `agent` input.", "`agents` gives the mice for the `agent` input."],
    ["Read ~/.claude/agents/a.md, agents.json and op://Agent/GitHub/token. Agents.", "Read ~/.claude/agents/a.md, agents.json and op://Agent/GitHub/token. Mice."],
    ["The voice agent starts an agent.", "The voice agent starts a mouse."],
  ] as const)
    if (swap(text) !== want) throw new Error(`swap(${JSON.stringify(text)}) is ${JSON.stringify(swap(text))}`);
  if (swap("Agent 4.", { one: "task" }) !== "Task 4.") throw new Error("swap with only one word does not make the plural");
  if (swap("Start an agent.", { one: "owl" }) !== "Start an owl.") throw new Error("swap does not keep an before a vowel");
  if (!setWord(null) || swap("Agent 4.") !== "Agent 4.") throw new Error("setWord(null) does not give back agent");
  for (const [text, want] of [
    ["Check DS PR 359 merge", "359 359"],
    ["Look at pull request #12 in nova.", "12 12"],
    ["Review pr-42.", "42 42"],
    ["Merge https://github.com/a/b.c/pull/7/files, PR 7 of the design system.", "7 https://github.com/a/b.c/pull/7"],
    ["Merge PR 12 and PR 13.", "none"],
    ["Fix the bug of #359.", "none"],
    ["Improve the PR names.", "none"],
  ] as const) {
    const pr = prOf(text);
    if ((pr ? `${pr.num} ${pr.ref}` : "none") !== want) throw new Error(`prOf(${JSON.stringify(text)}) is ${JSON.stringify(pr)}`);
  }
  if (!sameRequest("Fix the login button.", "fix the login button, fix the login button")) throw new Error("sameRequest misses a repeat");
  if (sameRequest("Do X and Y. Your part: X.", "Do X and Y. Your part: Y.")) throw new Error("sameRequest joins the parts of a split job");
  for (const [words, asked, want] of [
    ["Close 3.", "", true],
    ["Okay, I'm done with it.", "", true],
    ["Mark it as completed.", "", true],
    ["Delete the closed ones.", "", true],
    ["Tell 3 to add the button.", "", false],
    ["What did agent 4 find?", "", false],
    ["Yes.", "Close the new agent 14?", true],
    ["All of them.", "Just this one, or all of them?", true],
    ["Yes.", "Do you want an update?", false],
    ["", "", false],
  ] as const)
    if (asksClose(words, asked) !== want) throw new Error(`asksClose(${JSON.stringify(words)}, ${JSON.stringify(asked)}) is not ${want}`);
  for (const [words, asked, want] of [
    ["Close the completed ones.", "", true],
    ["Close all of them.", "", true],
    ["Let's close.", "", false],
    ["All of them.", "Just this one, or all of them?", true],
    ["Yes.", "Just this one, or all of them?", false],
  ] as const)
    if (asksGroup(words, asked) !== want) throw new Error(`asksGroup(${JSON.stringify(words)}, ${JSON.stringify(asked)}) is not ${want}`);
  for (const [words, asked, want] of [
    ["Close it.", "", false],
    ["Done.", "", false],
    ["Close the completed ones.", "", false],
    ["Mark it done and close it.", "", false],
    ["Mark it done.", "", true],
    ["Mark it as completed.", "", true],
    ["Completed.", "", true],
    ["Move it to done.", "", true],
    ["Yes.", "Mark as completed 3?", true],
    ["Yes.", "Close 3?", false],
  ] as const)
    if (asksComplete(words, asked) !== want) throw new Error(`asksComplete(${JSON.stringify(words)}, ${JSON.stringify(asked)}) is not ${want}`);
  console.log("names: ok");
}
