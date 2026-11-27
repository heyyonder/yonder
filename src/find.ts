// The search of the settings. It finds the closest settings, not only exact matches: each word of the search gets the
// best match in the words of a setting. A whole word scores 3, the start of a word 2, a part of a word 1.5, and a word
// with a typo 1 (a Dice score of 0.5 or more on the pairs of letters). A word in the name of the setting counts 1.5 times.
// The search finds the closest results. Clef is not necessary for about 40 rows.
const pairs = (w: string) => new Set(Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2)));
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function match(q: string, w: string) {
  if (w === q) return 3;
  if (w.startsWith(q)) return 2;
  if (q.length >= 3 && w.includes(q)) return 1.5;
  if (q.length < 4 || w.length < 3) return 0;
  const a = pairs(q);
  const b = pairs(w);
  const same = [...a].filter((p) => b.has(p)).length;
  return (2 * same) / (a.size + b.size) >= 0.5 ? 1 : 0;
}

export function find<T extends { name: string; words: string }>(query: string, items: T[]) {
  const asked = words(query).filter((q) => q.length >= 2);
  if (!asked.length) return [];
  return items
    .map((item) => {
      const name = words(item.name);
      const other = words(item.words);
      const score = asked.reduce((sum, q) => sum + Math.max(0, ...name.map((w) => match(q, w) * 1.5), ...other.map((w) => match(q, w))), 0);
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}

// The start of each place where the words are in a text, as ⌘F finds them in a chat: any case, no overlap.
export function places(text: string, words: string) {
  const q = words.toLowerCase();
  const t = text.toLowerCase();
  const at: number[] = [];
  if (!q) return at;
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + q.length)) at.push(i);
  return at;
}
