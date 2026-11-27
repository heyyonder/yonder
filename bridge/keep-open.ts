// The rule of closeWhenDone (closeItself in main.ts): why an agent that must close when done stays open at the end of its
// turn, or "" when nothing came up and it can close. Check: `bun bridge/keep-open.ts`.
// `failed` is the verdict of Clef on the work (worthTelling), undefined when Clef did not answer. `point` and `next` come
// from the summary of Haiku: its last point (the verdict, or the question of the agent) and the next step of the user.
// A reason with ": " carries the question or the next step, so the push of the phones tells what the agent waits on.
// A question mark counts before a space or at the end, so the "?" of a link does not count.
const ASKS = /\?(\s|$)/;
// Without Clef, a next step that only checks or ships the finished work is a normal end, as in the prompt of review_workers.
// A choice ("Push it or hold") is not.
const CHECKS = /^(done|test|try|check|see|read|open|review|push|rebuild|reload|restart)\b/i;
export function keepOpen(status: string, result: string, failed?: boolean, point = "", next = "") {
  if (status === "failed") return "it failed";
  const end = result.trim().split(/\n\s*\n/).pop()!;
  // Haiku can turn a note such as "It is not pushed" into "Should I push it?", which keeps the task open. So the
  // question of the summary counts only when the agent asked one.
  const asked = ASKS.test(end) ? end.match(/[^.!?\n]*\?(?=\s|$)/g)!.pop()!.trim() : ASKS.test(result) && /\?\s*$/.test(point) ? point : "";
  if (asked) return `it asks: ${asked}`;
  if (status === "waiting") return "it waits for you";
  next = next.trim();
  if (failed) return next ? `it needs you: ${next}` : "the work is not done";
  if (failed === undefined && !(CHECKS.test(next) && !/\bor\b/i.test(next))) return next ? `it needs you: ${next}` : "it could not be checked";
  return "";
}

if (import.meta.main) {
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  const deployed = "I ran the deploy.\n\nThe site is live at https://example.com/?v=2.";
  assert(keepOpen("done", deployed, false) === "", "a done deploy closes, also with the ? of a link");
  assert(keepOpen("done", deployed, undefined, "Done.", "Done") === "", "without Clef, a summary with the next step Done closes");
  assert(keepOpen("done", deployed, undefined, "It is on main.", "Test on the phone") === "", "without Clef, a next step that only tests the work closes");
  assert(keepOpen("failed", deployed, false) === "it failed", "a failed turn stays open");
  assert(keepOpen("waiting", deployed) === "it waits for you", "a waiting agent stays open");
  assert(keepOpen("done", "I built it.\n\nShould I push it to production? It is ready.", false) === "it asks: Should I push it to production?", "a question in the last paragraph stays open, and the reason names it");
  assert(keepOpen("done", "Push it now or wait? I can do either.\n\nI built it.", false, "Push it now or wait?") === "it asks: Push it now or wait?", "a question of the agent in the summary stays open");
  const task11 = "The fix is on local main. It is not pushed and nothing was released.\n\nI fixed the blank Context tab.";
  assert(keepOpen("done", task11, false, "The fix is on local main, not pushed or released; should I push it?", "Push it or hold") === "", "a question that only Haiku wrote does not keep the agent open (task 11)");
  assert(keepOpen("done", "The deploy stopped: the token expired.", true, "Log in again.", "Log in again") === "it needs you: Log in again", "a result that Clef judges not done stays open, with the next step");
  assert(keepOpen("done", task11, true, "Not pushed.", "Push it or hold") === "it needs you: Push it or hold", "a choice stays open with Clef too");
  assert(keepOpen("done", deployed, undefined, "Log in again.", "Log in again") === "it needs you: Log in again", "without Clef, a next step for the user stays open");
  assert(keepOpen("done", deployed, undefined, "Ready.", "Push it or hold") === "it needs you: Push it or hold", "without Clef, a choice stays open");
  assert(keepOpen("done", deployed) === "it could not be checked", "without Clef and without a summary, it stays open");
}
