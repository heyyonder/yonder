// The first message of an agent that moves to another CLI. The new CLI cannot read the session of the old CLI, so this
// text carries the conversation: the newest turns, with a line for each tool call, in at most `budget` characters, then
// the files of the whole old session, so the agent can read more. The budget counts characters, not turns, and keeps
// the tool calls: a fixed count of turns with no tool calls carries too little of the work.
export function handoffText(history: { who: string; text: string }[], from: string, files: string[], text: string, budget = 40_000) {
  const kept: string[] = [];
  let left = budget;
  for (let i = history.length - 1; i >= 0 && left > 0; i--) {
    const t = history[i];
    let body = t.text.trim();
    if (!body || (t.who !== "user" && t.who !== "assistant" && t.who !== "tool")) continue;
    if (body.length > left) body = body.slice(-left);
    left -= body.length;
    kept.push(`${t.who === "user" ? "User" : t.who === "tool" ? "Tool" : from}: ${body}`);
  }
  kept.reverse();
  if (!kept.length && !files.length) return text;
  const more = files.length ? `\n\nThe whole session in ${from} is in these files. Read them if you need more:\n${files.join("\n")}` : "";
  return `You continue work that ran in ${from}. The conversation so far:\n\n${kept.join("\n\n")}${more}\n\nThe user says:\n${text}`;
}
