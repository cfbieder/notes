/**
 * CR039 Phase B — Chicago bibliography formatter (pure unit tests, no server).
 * Run: node backend/tests/cr039-citation-formatter.test.js
 */

const { buildEntry, renderReferences, renderText, renderHtml, renderMd } = require('../src/services/citationFormatter');

let passed = 0;
let failed = 0;

function eq(actual, expected, name) {
  if (actual === expected) { console.log(`  ✓ ${name}`); passed++; } else {
    console.error(`  ✗ ${name}\n      expected: ${expected}\n      actual:   ${actual}`);
    failed++;
  }
}

const text = (src) => renderText(buildEntry(src).segments);
const ACCESSED = '2026-10-02T12:00:00.000Z';

console.log('\n=== CR039 citation formatter ===\n');

console.log('Per kind:');
eq(text({
  source_kind: 'web', title: 'The Bitter Lesson', authors: [{ family: 'Sutton', given: 'Rich' }],
  container: 'Incomplete Ideas', published_date: '2019-03-13', published_precision: 'day',
  url: 'http://www.incompleteideas.net/IncIdeas/BitterLesson.html', accessed_at: ACCESSED
}), 'Sutton, Rich. “The Bitter Lesson.” Incomplete Ideas, March 13, 2019. http://www.incompleteideas.net/IncIdeas/BitterLesson.html.',
'web, dated');

eq(text({
  source_kind: 'journal', title: 'Attention Is All You Need',
  authors: [{ family: 'Vaswani', given: 'Ashish' }, { family: 'Shazeer', given: 'Noam' }, { family: 'Parmar', given: 'Niki' }],
  container: 'Advances in Neural Information Processing Systems', volume: '30', issue: '1', pages: '5998–6008',
  published_date: '2017-01-01', published_precision: 'year', doi: '10.5555/3295222.3295349', accessed_at: ACCESSED
}), 'Vaswani, Ashish, Noam Shazeer, and Niki Parmar. “Attention Is All You Need.” Advances in Neural Information Processing Systems 30, no. 1 (2017): 5998–6008. https://doi.org/10.5555/3295222.3295349.',
'journal, 3 authors, DOI link');

eq(text({
  source_kind: 'book', title: 'Perceptrons', authors: [{ family: 'Minsky', given: 'Marvin' }, { family: 'Papert', given: 'Seymour' }],
  publisher: 'MIT Press', published_date: '1969-01-01', published_precision: 'year',
  url: 'https://example.com/ignored', accessed_at: ACCESSED
}), 'Minsky, Marvin, and Seymour Papert. Perceptrons. MIT Press, 1969.', 'book, 2 authors, no URL in print form');

eq(text({
  source_kind: 'pdf_report', title: 'AI Index Report 2024', authors: [{ literal: 'Stanford HAI' }],
  publisher: 'Stanford University', published_date: '2024-04-15', published_precision: 'day',
  url: 'https://aiindex.stanford.edu/report', accessed_at: ACCESSED
}), 'Stanford HAI. AI Index Report 2024. Stanford University, 2024. https://aiindex.stanford.edu/report.',
'pdf_report, organization author');

eq(text({
  source_kind: 'book_chapter', title: 'Computing Machinery', authors: [{ family: 'Turing', given: 'Alan' }],
  container: 'The Essential Turing', pages: '433–460', publisher: 'Oxford University Press',
  published_date: '2004-01-01', published_precision: 'year', accessed_at: ACCESSED
}), 'Turing, Alan. “Computing Machinery.” In The Essential Turing, 433–460. Oxford University Press, 2004.', 'book chapter');

eq(text({
  source_kind: 'podcast', title: 'Episode 1', authors: [{ family: 'Host', given: 'A' }], container: 'The Show',
  published_date: '2023-05-01', published_precision: 'month', url: 'https://example.com/ep1', accessed_at: ACCESSED
}), 'Host, A. “Episode 1.” The Show. May 2023. https://example.com/ep1.', 'podcast, month precision');

console.log('\nMissing fields and dates:');
const undated = buildEntry({ source_kind: 'web', title: 'Undated Page', authors: [], url: 'https://example.com/x', accessed_at: ACCESSED });
eq(renderText(undated.segments), '[author?]. “Undated Page.” Accessed October 2, 2026. https://example.com/x.',
  'undated web page cites the access date; missing author is a placeholder');
eq(undated.incomplete, true, 'missing author marks the entry incomplete');
eq(text({ source_kind: 'book', title: 'No Publisher', authors: [{ family: 'A', given: 'B' }], accessed_at: ACCESSED }),
  'A, B. No Publisher. [publisher?], [date?].', 'book without publisher/date gets placeholders');
eq(text({ source_kind: 'web', title: 'Why Now?', authors: [{ family: 'Q', given: 'R' }], accessed_at: ACCESSED }),
  'Q, R. “Why Now?” Accessed October 2, 2026.', 'no doubled period after a question-mark title');
eq(text({ source_kind: 'web', title: 'T', authors: [{ family: 'King', given: 'Martin Luther, Jr.' }], accessed_at: ACCESSED }),
  'King, Martin Luther, Jr. “T.” Accessed October 2, 2026.', 'no doubled period after an author ending in a period');

console.log('\nRendering:');
const hostile = buildEntry({
  source_kind: 'web', title: '<script>alert(1)</script> & *stars*', authors: [{ literal: 'A_B' }],
  container: 'Site <b>', accessed_at: ACCESSED
});
const html = renderHtml(hostile.segments);
eq(/<script>|<b>/.test(html), false, 'HTML escapes page-derived fields');
eq(html.includes('<em>Site &lt;b&gt;</em>'), true, 'container rendered as <em>');
eq(renderMd(hostile.segments).includes('\\*stars\\*') && renderMd(hostile.segments).includes('A\\_B'), true,
  'Markdown escapes * and _ in fields');
eq(renderHtml(undated.segments).includes('<strong>[author?]</strong>'), true, 'placeholder is bold in HTML');

console.log('\nSections:');
const out = renderReferences([
  {
    chapter: { label: '3', title: 'Silicon' },
    sources: [
      { source_kind: 'book', title: 'Zeta', authors: [{ family: 'Young', given: 'A' }], publisher: 'P', published_date: '2000-01-01', published_precision: 'year' },
      { source_kind: 'book', title: 'Alpha', authors: [{ literal: 'Acme Corp' }], publisher: 'P', published_date: '2001-01-01', published_precision: 'year' },
      { source_kind: 'book', title: 'Beta', authors: [{ family: 'Young', given: 'A' }], publisher: 'P', published_date: '2002-01-01', published_precision: 'year' }
    ]
  },
  { chapter: { label: 'Interlude', title: 'A Pause' }, sources: [] }
]);
const lines = out.text.split('\n').filter(Boolean);
eq(lines[0], 'Chapter 3 — Silicon', 'numeric label → "Chapter N — Title"');
eq(lines[1], 'Sources and Further Reading', 'section subheading');
eq([lines[2], lines[3], lines[4]].map(l => l.split('.')[0]).join(' | '), 'Acme Corp | Young, A | Young, A',
  'sorted by first author (organization by its name), then title');
eq(lines[3].includes('Beta') && lines[4].includes('Zeta'), true, 'same author sorted by title');
eq(lines[5], 'Interlude — A Pause', 'non-numeric label used as-is');
eq(out.count, 3, 'count');
eq(out.incomplete, 0, 'no incomplete entries');
eq(out.html.includes('text-indent:-0.5in'), true, 'HTML entries carry a hanging indent');

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
