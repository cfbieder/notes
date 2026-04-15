// Pure helpers for GFM pipe-table parsing and serialization.
// No Vue / CodeMirror dependencies — safe to import anywhere.

export function isTableRow(text) {
  const t = text.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length >= 2;
}

// Split a row into cell strings (trimmed). Honors `\|` as an escaped pipe
// inside cell content.
export function splitRowCells(rowText) {
  const t = rowText.trim();
  if (!isTableRow(t)) return null;
  const inner = t.slice(1, -1);
  const cells = [];
  let buf = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && inner[i + 1] === '|') {
      buf += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

export function isSeparatorCells(cells) {
  if (!cells || cells.length === 0) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c));
}

export function isSeparatorRow(text) {
  const cells = splitRowCells(text);
  return isSeparatorCells(cells);
}

export function parseAlignFromSeparatorCell(cell) {
  const t = cell.trim();
  const left = t.startsWith(':');
  const right = t.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return 'left';
}

export function alignToSeparator(align) {
  if (align === 'center') return ':---:';
  if (align === 'right') return '---:';
  if (align === 'left') return ':---';
  return '---';
}

export function countCells(rowText) {
  const cells = splitRowCells(rowText);
  return cells ? cells.length : 0;
}

export function emptyRowText(cols) {
  return '|' + Array.from({ length: cols }, () => '   ').join('|') + '|';
}

// Escape a single cell value for pipe-table output.
function escapeCell(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// Parse a multiline pipe-table block into structured form.
// Expects `text` to contain exactly a table block (header + separator + body).
// Returns { header, aligns, rows } or null if the block isn't a valid table.
export function parseTable(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return null;

  const header = splitRowCells(lines[0]);
  const sep = splitRowCells(lines[1]);
  if (!header || !sep) return null;
  if (!isSeparatorCells(sep)) return null;
  if (sep.length !== header.length) return null;

  const aligns = sep.map(parseAlignFromSeparatorCell);
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = splitRowCells(lines[i]);
    if (!cells) break;
    const padded = [];
    for (let c = 0; c < header.length; c++) padded.push(cells[c] ?? '');
    rows.push(padded);
  }

  return { header, aligns, rows };
}

// Serialize a structured table back to pipe markdown.
export function serializeTable({ header, aligns, rows }) {
  const cols = header.length;
  const pad = (arr) => {
    const out = [];
    for (let i = 0; i < cols; i++) out.push(escapeCell(arr[i] ?? ''));
    return out;
  };
  const renderRow = (cells) => '| ' + cells.map((c) => c === '' ? '  ' : c).join(' | ') + ' |';
  const lines = [];
  lines.push(renderRow(pad(header)));
  lines.push('| ' + aligns.map(alignToSeparator).join(' | ') + ' |');
  for (const r of rows) lines.push(renderRow(pad(r)));
  return lines.join('\n');
}

// Convenience: build an empty structured table for a given shape.
export function emptyTable(rows, cols, { includeHeader = true, aligns = null } = {}) {
  const header = Array.from({ length: cols }, (_, i) => includeHeader ? `Col ${i + 1}` : '');
  const a = aligns && aligns.length === cols ? aligns.slice() : Array.from({ length: cols }, () => 'left');
  const body = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
  return { header, aligns: a, rows: body };
}
