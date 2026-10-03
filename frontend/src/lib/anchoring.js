// CR039 Phase C — text-quote anchoring (§6.2), run in the browser (§16 #13).
//
// Pure string logic over the source's *rendered* text, whitespace-normalized
// so Markdown syntax and line wrapping never break a quote. A highlight keeps
// exact + ~32 chars of prefix/suffix + a position hint; re-anchoring tries, in
// order: exact-with-context near the hint → exact nearest the hint → fuzzy
// (diff-match-patch) → orphaned. The DOM side lives in highlightDom.js.

import DiffMatchPatch from 'diff-match-patch';

export const CONTEXT_CHARS = 32;
const MAX_BITS = 32; // diff-match-patch pattern length limit

export function normalizeWhitespace(s) {
  return String(s || '').replace(/\s+/g, ' ');
}

// Selector for [start, end) of normalized text.
export function describe(text, start, end) {
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT_CHARS), start),
    suffix: text.slice(end, end + CONTEXT_CHARS),
    position_start: start,
    position_end: end
  };
}

function allIndexes(text, needle) {
  const out = [];
  if (!needle) return out;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) out.push(i);
  return out;
}

const nearest = (indexes, hint) => indexes.reduce((best, i) =>
  (best === null || Math.abs(i - hint) < Math.abs(best - hint) ? i : best), null);

let dmp = null;
function matcher() {
  if (!dmp) {
    dmp = new DiffMatchPatch();
    dmp.Match_Threshold = 0.3;
    dmp.Match_Distance = 100_000; // the hint is a hint: allow far moves
  }
  return dmp;
}

function fuzzyIndex(text, pattern, loc) {
  if (!pattern) return -1;
  try {
    return matcher().match_main(text, pattern, Math.max(0, Math.min(loc, text.length)));
  } catch {
    return -1;
  }
}

// Fuzzy locate `exact`; long quotes are found by their head and tail.
function fuzzyRange(text, exact, hint) {
  if (exact.length <= MAX_BITS) {
    const at = fuzzyIndex(text, exact, hint);
    return at === -1 ? null : { start: at, end: Math.min(text.length, at + exact.length) };
  }
  const head = fuzzyIndex(text, exact.slice(0, MAX_BITS), hint);
  if (head === -1) return null;
  const tailPattern = exact.slice(-MAX_BITS);
  const tail = fuzzyIndex(text, tailPattern, head + exact.length - MAX_BITS);
  if (tail === -1) return null;
  const end = tail + tailPattern.length;
  const span = end - head;
  // A plausible span is close to the original length (lightly edited text).
  if (end <= head || span < exact.length * 0.5 || span > exact.length * 1.5) return null;
  return { start: head, end };
}

// A fuzzy match is found by length, so after an edit it can stop mid-word
// ("…computation ar"); widen it to whole words.
const WORD = /[\p{L}\p{N}]/u;
function snapToWords(text, start, end) {
  let s = start;
  let e = end;
  while (s > 0 && WORD.test(text[s - 1]) && WORD.test(text[s])) s--;
  while (e < text.length && WORD.test(text[e - 1]) && WORD.test(text[e])) e++;
  return { start: s, end: e };
}

// → { start, end, status: 'anchored' | 'fuzzy' } or { status: 'orphaned' }.
export function anchor(text, sel) {
  const exact = normalizeWhitespace(sel.exact);
  const prefix = normalizeWhitespace(sel.prefix || '');
  const suffix = normalizeWhitespace(sel.suffix || '');
  const hint = Number.isInteger(sel.position_start) ? sel.position_start : 0;
  if (!exact.trim()) return { status: 'orphaned' };

  // 1. exact with its context
  const withContext = allIndexes(text, prefix + exact + suffix).map(i => i + prefix.length);
  if (withContext.length) {
    const at = nearest(withContext, hint);
    return { start: at, end: at + exact.length, status: 'anchored' };
  }
  // 2. exact alone, nearest the hint
  const plain = allIndexes(text, exact);
  if (plain.length) {
    const at = nearest(plain, hint);
    return { start: at, end: at + exact.length, status: 'anchored' };
  }
  // 3. fuzzy
  const fuzzy = fuzzyRange(text, exact, hint);
  if (fuzzy) return { ...snapToWords(text, fuzzy.start, fuzzy.end), status: 'fuzzy' };
  // 4. orphaned — kept, listed, still exported (D8)
  return { status: 'orphaned' };
}
