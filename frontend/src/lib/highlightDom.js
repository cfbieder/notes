// CR039 Phase C — maps the anchoring module's normalized-text offsets onto the
// rendered DOM: turns a selection into offsets, and wraps anchored ranges in
// <mark>. The normalization here must match anchoring.normalizeWhitespace
// (runs of whitespace → one space).

const WS = /\s/;

// Walk the text nodes under root. Returns the normalized text, the DOM position
// of every normalized character, and per-node raw→normalized offset tables.
export function buildTextMap(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const chars = [];
  const offsets = new Map();
  let text = '';
  let lastSpace = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const v = node.nodeValue;
    const table = new Int32Array(v.length + 1);
    for (let i = 0; i < v.length; i++) {
      table[i] = text.length;
      if (WS.test(v[i])) {
        if (!lastSpace) { text += ' '; chars.push([node, i]); lastSpace = true; }
      } else {
        text += v[i]; chars.push([node, i]); lastSpace = false;
      }
    }
    table[v.length] = text.length;
    offsets.set(node, table);
  }
  return { text, chars, offsets };
}

function firstText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node;
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  return w.nextNode();
}
function lastText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node;
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) last = n;
  return last;
}

function offsetOf(map, container, offset, isEnd) {
  let node = container;
  let off = offset;
  if (node.nodeType !== Node.TEXT_NODE) {
    const kids = node.childNodes;
    if (isEnd) {
      node = lastText(kids[Math.max(0, offset - 1)] || node);
      off = node ? node.nodeValue.length : 0;
    } else {
      node = firstText(kids[offset] || node);
      off = 0;
    }
  }
  const table = node && map.offsets.get(node);
  return table ? table[Math.min(off, table.length - 1)] : null;
}

// A DOM Range inside root → { start, end } in normalized text, or null.
export function rangeToOffsets(map, range) {
  const start = offsetOf(map, range.startContainer, range.startOffset, false);
  const end = offsetOf(map, range.endContainer, range.endOffset, true);
  if (start === null || end === null || end <= start) return null;
  // Trim surrounding spaces so a quote never starts or ends on whitespace.
  let s = start;
  let e = end;
  while (s < e && map.text[s] === ' ') s++;
  while (e > s && map.text[e - 1] === ' ') e--;
  return e > s ? { start: s, end: e } : null;
}

function wrapSegment(node, from, to, makeMark) {
  let mid = node;
  if (from > 0) mid = node.splitText(from);
  if (to - from < mid.nodeValue.length) mid.splitText(to - from);
  const mark = makeMark();
  mid.parentNode.insertBefore(mark, mid);
  mark.appendChild(mid);
}

// Wrap each { start, end, highlight } in <mark>s. Processed from the end of the
// document backwards: splitting a text node only moves its LATER characters, so
// every earlier character's (node, offset) stays valid without rebuilding the
// map. Overlaps are clipped (the later highlight wins the shared span).
export function applyMarks(map, ranges, makeMark) {
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let limit = map.text.length;
  for (const r of sorted) {
    const end = Math.min(r.end, limit);
    if (end <= r.start) continue;
    // Group this range's characters by text node, then wrap last node first.
    const segments = [];
    for (let i = r.start; i < end; i++) {
      const [node, off] = map.chars[i];
      const seg = segments[segments.length - 1];
      if (seg && seg.node === node) seg.to = off + 1;
      else segments.push({ node, from: off, to: off + 1 });
    }
    for (let k = segments.length - 1; k >= 0; k--) {
      const { node, from, to } = segments[k];
      wrapSegment(node, from, to, () => makeMark(r.highlight));
    }
    limit = r.start;
  }
}
