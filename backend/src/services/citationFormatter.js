// CR039 Phase B — Chicago Manual of Style (18th ed.) bibliography entries.
// The one place the citation style lives (§16 #4): swap this module to change
// style. Pure functions, no I/O — unit-tested in tests/cr039-citation-formatter.test.js.
//
// An entry is built as segments { text, italic?, placeholder? } and rendered
// three ways (HTML for Copy for Word, Markdown, plain text), so the formats can
// never disagree. Missing required fields become visible placeholders such as
// [author?] so nothing incomplete slips into a manuscript unnoticed.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const plain = (text) => ({ text });
const italic = (text) => ({ text, italic: true });
const placeholder = (field) => ({ text: `[${field}?]`, placeholder: true });

function clean(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Ensure a segment run ends with terminal punctuation, without doubling it.
function endsWithStop(text) {
  return /[.?!]["”']?$/.test(text);
}

function personName(a, inverted) {
  if (clean(a.literal)) return clean(a.literal);
  const family = clean(a.family);
  const given = clean(a.given);
  if (!given) return family;
  return inverted ? `${family}, ${given}` : `${given} ${family}`;
}

// Bibliography form: first author inverted, the rest natural order; all listed.
function formatAuthors(authors) {
  const named = (authors || []).filter(a => clean(a.literal) || clean(a.family));
  if (named.length === 0) return null;
  const names = named.map((a, i) => personName(a, i === 0));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function parseIsoDate(value) {
  if (!value) return null;
  const iso = value instanceof Date ? value.toISOString() : String(value);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: m[1], m: Number(m[2]), d: Number(m[3]) } : null;
}

function formatDate(value, precision) {
  const p = parseIsoDate(value);
  if (!p) return null;
  if (precision === 'year') return p.y;
  if (precision === 'month') return `${MONTHS[p.m - 1]} ${p.y}`;
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

function yearOf(value) {
  return parseIsoDate(value)?.y || null;
}

// Kinds whose title is quoted (part of a larger work) vs. italicized (standalone).
const QUOTED_TITLE = new Set(['web', 'journal', 'book_chapter', 'video', 'podcast', 'other']);

function titleSegments(source) {
  const title = clean(source.title) || '[title?]';
  if (QUOTED_TITLE.has(source.source_kind)) {
    // Chicago puts the period inside the closing quote: "Title."
    return [plain(endsWithStop(title) ? `“${title}”` : `“${title}.”`)];
  }
  return [italic(title), plain(endsWithStop(title) ? '' : '.')];
}

function link(source) {
  if (clean(source.doi)) return `https://doi.org/${clean(source.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`;
  return clean(source.url) || null;
}

// Returns { segments, sortKey, incomplete } for one source row.
function buildEntry(source) {
  const segs = [];
  let incomplete = false;
  const need = (field) => { incomplete = true; return placeholder(field); };

  const authors = formatAuthors(source.authors);
  if (authors) segs.push(plain(endsWithStop(authors) ? `${authors} ` : `${authors}. `));
  else segs.push(need('author'), plain('. '));

  segs.push(...titleSegments(source));

  const kind = source.source_kind;
  const container = clean(source.container);
  const publisher = clean(source.publisher);
  const date = formatDate(source.published_date, source.published_precision);
  const year = yearOf(source.published_date);
  const accessed = formatDate(source.accessed_at, 'day');
  const url = link(source);

  if (kind === 'journal') {
    segs.push(plain(' '));
    segs.push(container ? italic(container) : need('journal'));
    if (clean(source.volume)) segs.push(plain(` ${clean(source.volume)}`));
    if (clean(source.issue)) segs.push(plain(`, no. ${clean(source.issue)}`));
    segs.push(plain(' ('), year ? plain(year) : need('date'), plain(')'));
    if (clean(source.pages)) segs.push(plain(`: ${clean(source.pages)}`));
    segs.push(plain('.'));
  } else if (kind === 'book' || kind === 'pdf_report') {
    segs.push(plain(' '));
    segs.push(publisher ? plain(publisher) : need('publisher'));
    segs.push(plain(', '), year ? plain(year) : need('date'), plain('.'));
  } else if (kind === 'book_chapter') {
    segs.push(plain(' In '), container ? italic(container) : need('book'));
    if (clean(source.pages)) segs.push(plain(`, ${clean(source.pages)}`));
    segs.push(plain('. '), publisher ? plain(publisher) : need('publisher'));
    segs.push(plain(', '), year ? plain(year) : need('date'), plain('.'));
  } else if (kind === 'video' || kind === 'podcast') {
    if (container) segs.push(plain(' '), italic(container), plain('.'));
    if (date) segs.push(plain(` ${date}.`));
    else if (accessed) segs.push(plain(` Accessed ${accessed}.`));
  } else {
    // web, other: "Container, Month Day, Year." — undated pages cite the access date.
    if (container && date) segs.push(plain(' '), italic(container), plain(`, ${date}.`));
    else if (container) segs.push(plain(' '), italic(container), plain('.'));
    else if (date) segs.push(plain(` ${date}.`));
    if (!date && accessed) segs.push(plain(` Accessed ${accessed}.`));
  }

  // Book-like kinds cite a URL only when they are online-only (pdf_report);
  // print books do not carry one in Chicago bibliography form.
  if (url && kind !== 'book') segs.push(plain(` ${url}${url.endsWith('.') ? '' : '.'}`));

  const first = (source.authors || []).find(a => clean(a.literal) || clean(a.family));
  const sortKey = [(first ? clean(first.family) || clean(first.literal) : clean(source.title)), clean(source.title)]
    .join('\u0000').toLowerCase();

  return { segments: segs.filter(s => s.text !== ''), sortKey, incomplete };
}

// ---------------------------------------------------------------- renderers

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeMd(s) {
  return s.replace(/([\\*_[\]`<>])/g, '\\$1');
}

function renderHtml(segments) {
  return segments.map(s => {
    const t = escapeHtml(s.text);
    if (s.placeholder) return `<strong>${t}</strong>`;
    return s.italic ? `<em>${t}</em>` : t;
  }).join('');
}

function renderMd(segments) {
  return segments.map(s => {
    const t = escapeMd(s.text);
    if (s.placeholder) return `**${t}**`;
    return s.italic ? `*${t}*` : t;
  }).join('');
}

function renderText(segments) {
  return segments.map(s => s.text).join('');
}

function chapterHeading(chapter) {
  const label = clean(chapter.label);
  const prefix = /^\d+$/.test(label) ? `Chapter ${label}` : label;
  return `${prefix} — ${clean(chapter.title)}`;
}

// sections: [{ chapter, sources: [...] }] → { html, markdown, text, count, incomplete }
const LEGEND = { yellow: 'Evidence', red: 'Counter-argument', green: 'Quote-worthy', blue: 'Follow-up' };

// "Sutton 2019 — The Bitter Lesson": the per-source heading in Key Passages.
function shortTitle(source) {
  const first = (source.authors || []).find(a => clean(a.literal) || clean(a.family));
  const who = first ? clean(first.family) || clean(first.literal) : '';
  const year = yearOf(source.published_date);
  const lead = [who, year].filter(Boolean).join(' ');
  return lead ? `${lead} — ${clean(source.title)}` : clean(source.title);
}

// One passage line: "p. 147 — “quote” — comment (Meaning)", as segments.
function passageSegments(h) {
  const segs = [];
  const page = clean(h.page_label);
  if (page) segs.push(plain(`p. ${page} — `));
  segs.push(plain(`“${clean(h.exact)}”`));
  if (clean(h.comment)) segs.push(plain(` — ${clean(h.comment)}`));
  segs.push(plain(' ('), italic(LEGEND[h.color] || h.color), plain(')'));
  if (h.anchor_status === 'orphaned') segs.push(plain(' [no longer in the source text]'));
  return segs;
}

// sections: [{ chapter, sources: [...], passages?: [{ source, highlights: [...] }] }]
// include: 'sources' | 'passages' | 'both'
// → { html, markdown, text, count, incomplete, passages }
function renderReferences(sections, include = 'sources') {
  const html = [];
  const md = [];
  const text = [];
  let count = 0;
  let incomplete = 0;
  let passageCount = 0;
  const withSources = include !== 'passages';
  const withPassages = include !== 'sources';

  for (const { chapter, sources, passages = [] } of sections) {
    const heading = chapterHeading(chapter);
    html.push(`<h2>${escapeHtml(heading)}</h2>`);
    md.push(`## ${escapeMd(heading)}`, '');
    text.push(heading);

    if (withSources) {
      const entries = sources.map(buildEntry).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      count += entries.length;
      incomplete += entries.filter(e => e.incomplete).length;
      html.push('<h3>Sources and Further Reading</h3>');
      md.push('### Sources and Further Reading', '');
      text.push('Sources and Further Reading', '');
      if (entries.length === 0) {
        html.push('<p><em>No sources assigned.</em></p>');
        md.push('*No sources assigned.*', '');
        text.push('No sources assigned.', '');
      }
      for (const e of entries) {
        // Hanging indent so the paste into Word looks like a bibliography.
        html.push(`<p style="margin:0 0 0.6em 0.5in;text-indent:-0.5in">${renderHtml(e.segments)}</p>`);
        md.push(renderMd(e.segments), '');
        text.push(renderText(e.segments), '');
      }
    }

    if (withPassages) {
      // The author's own reference (§11.2): quotes grouped by source, in the
      // same author order as the bibliography, each source's in text order.
      const groups = passages
        .filter(g => g.highlights.length)
        .map(g => ({ ...g, key: buildEntry(g.source).sortKey }))
        .sort((a, b) => a.key.localeCompare(b.key));
      html.push('<h3>Key Passages</h3>');
      md.push('### Key Passages', '');
      text.push('Key Passages', '');
      if (groups.length === 0) {
        html.push('<p><em>No highlighted passages.</em></p>');
        md.push('*No highlighted passages.*', '');
        text.push('No highlighted passages.', '');
      }
      for (const g of groups) {
        const title = shortTitle(g.source);
        html.push(`<h4>${escapeHtml(title)}</h4>`);
        md.push(`#### ${escapeMd(title)}`, '');
        text.push(`  ${title}`);
        for (const h of g.highlights) {
          passageCount++;
          const segs = passageSegments(h);
          html.push(`<p style="margin:0 0 0.5em 0.25in">${renderHtml(segs)}</p>`);
          md.push(`- ${renderMd(segs)}`);
          text.push(`    ${renderText(segs)}`);
        }
        md.push('');
        text.push('');
      }
    }
  }

  return {
    html: html.join('\n'),
    markdown: md.join('\n').trimEnd() + '\n',
    text: text.join('\n').trimEnd() + '\n',
    count,
    incomplete,
    passages: passageCount
  };
}

module.exports = { buildEntry, renderReferences, formatAuthors, formatDate, renderHtml, renderMd, renderText };
