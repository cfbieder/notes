// CR039 — display helpers for source citation metadata. Display only: the
// Chicago reference formatter is Phase B and lives server-side.

export const SOURCE_KINDS = [
  { value: 'web', label: 'Web page' },
  { value: 'journal', label: 'Journal article' },
  { value: 'pdf_report', label: 'Report (PDF)' },
  { value: 'book', label: 'Book' },
  { value: 'book_chapter', label: 'Book chapter' },
  { value: 'video', label: 'Video' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'other', label: 'Other' }
];

// CR039 §16 #3 — the fixed highlight legend.
export const HIGHLIGHT_LEGEND = [
  { color: 'yellow', label: 'Evidence' },
  { color: 'red', label: 'Counter-argument' },
  { color: 'green', label: 'Quote-worthy' },
  { color: 'blue', label: 'Follow-up' }
];

export const STATUS_LABELS = {
  verified: 'Verified',
  incomplete: 'Incomplete',
  auto: 'Auto',
  llm: 'AI-filled'
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function authorName(a) {
  if (a.literal) return a.literal;
  return [a.given, a.family].filter(Boolean).join(' ');
}

export function formatAuthors(authors) {
  const names = (authors || []).map(authorName).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length <= 2) return names.join(' and ');
  return `${names[0]} et al.`;
}

export function formatPublished(date, precision) {
  if (!date) return '';
  const [y, m, d] = String(date).slice(0, 10).split('-');
  if (precision === 'year') return y;
  if (precision === 'month') return `${MONTHS[Number(m) - 1]} ${y}`;
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

// One author per line: "Family, Given" → person; "Family," → person with no
// given name; no comma → organization.
export function parseAuthorsInput(text) {
  return (text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const comma = line.indexOf(',');
    if (comma === -1) return { literal: line };
    const family = line.slice(0, comma).trim();
    const given = line.slice(comma + 1).trim();
    return given ? { family, given } : { family };
  });
}

export function authorsToInput(authors) {
  return (authors || []).map(a => {
    if (a.literal) return a.literal;
    return a.given ? `${a.family}, ${a.given}` : `${a.family},`;
  }).join('\n');
}

// "2019" | "2019-03" | "2019-03-13" → { published_date, published_precision }.
// Returns null when the text is not one of those shapes.
export function parsePublishedInput(text) {
  const t = (text || '').trim();
  if (!t) return { published_date: null, published_precision: null };
  let m = t.match(/^(\d{4})$/);
  if (m) return { published_date: `${m[1]}-01-01`, published_precision: 'year' };
  m = t.match(/^(\d{4})-(\d{1,2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    return { published_date: `${m[1]}-${m[2].padStart(2, '0')}-01`, published_precision: 'month' };
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    // Round-trip check: Date.parse('2019-02-31') succeeds by rolling over.
    const d = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso) {
      return { published_date: iso, published_precision: 'day' };
    }
  }
  return null;
}

export function publishedToInput(date, precision) {
  if (!date) return '';
  const iso = String(date).slice(0, 10);
  if (precision === 'year') return iso.slice(0, 4);
  if (precision === 'month') return iso.slice(0, 7);
  return iso;
}
