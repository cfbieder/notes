/**
 * CR039 Phase C — highlights API, chapter membership via highlights, isolation.
 * Run: node backend/tests/cr039-highlights.test.js
 * Requires: backend on :3001, dev user seeded, migration 023 applied.
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const BASE = 'http://localhost:3001/api/v1';
let passed = 0;
let failed = 0;
const pool = new Pool({ host: 'localhost', port: 5432, database: 'noted_dev', user: 'noteduser', password: 'noted_dev_password' });

function assert(cond, name) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; } else { console.error(`  ✗ ${name}`); failed++; }
}
async function api(token, path, options = {}) {
  const headers = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  return { status: res.status, data: res.status === 204 ? null : await res.json().catch(() => null) };
}
const login = async (u, p) => (await api(null, '/auth/login', { method: 'POST', body: { username: u, password: p } })).data?.data?.accessToken;

const RUN = Date.now().toString(36);
const OTHER = `cr039h-${RUN}`;
const cleanup = { books: [], notes: [] };

async function run() {
  console.log('\n=== CR039 C — highlights ===\n');
  const token = await login('dev', 'password123');
  await pool.query('INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)',
    [OTHER, `${OTHER}@example.com`, await bcrypt.hash('pw-other', 4)]);
  const other = await login(OTHER, 'pw-other');
  assert(token && other, 'two users log in');

  const prevActive = (await api(token, '/books')).data.data.find(b => b.is_active)?.id;
  const book = (await api(token, '/books', { method: 'POST', body: { title: `HL Book ${RUN}` } })).data.data;
  cleanup.books.push(book.id);
  await api(token, `/books/${book.id}`, { method: 'PUT', body: { is_active: true } });
  const ch1 = (await api(token, `/books/${book.id}/chapters`, { method: 'POST', body: { label: '1', title: 'One' } })).data.data;
  const ch2 = (await api(token, `/books/${book.id}/chapters`, { method: 'POST', body: { label: '2', title: 'Two' } })).data.data;
  const src = (await api(token, '/sources', {
    method: 'POST',
    body: { source_kind: 'web', title: `HL Source ${RUN}`, authors: [{ family: 'Sutton', given: 'Rich' }],
      published_date: '2019-03-13', published_precision: 'day', content: 'The biggest lesson is that general methods that leverage computation win.' }
  })).data.data;
  cleanup.notes.push(src.note_id);

  console.log('Create + list:');
  const h1 = await api(token, `/sources/${src.note_id}/highlights`, {
    method: 'POST',
    body: { anchor_type: 'text_quote', exact: 'general methods', prefix: 'lesson is that ', suffix: ' that leverage',
      position_start: 30, position_end: 45, color: 'red', comment: 'Core claim', chapter_ids: [ch1.id] }
  });
  assert(h1.status === 201 && h1.data.data.color === 'red' && h1.data.data.chapters[0].id === ch1.id, 'POST highlight → 201 with chapter');
  const h2 = await api(token, `/sources/${src.note_id}/highlights`, { method: 'POST', body: { anchor_type: 'text_quote', exact: 'computation' } });
  assert(h2.status === 201 && h2.data.data.color === 'yellow' && h2.data.data.anchor_status === 'anchored', 'defaults: yellow, anchored');
  assert((await api(token, `/sources/${src.note_id}/highlights`, { method: 'POST', body: { anchor_type: 'text_quote', exact: 'x', color: 'purple' } })).status === 400,
    'a color outside the legend → 400');
  const list = await api(token, `/sources/${src.note_id}/highlights`);
  assert(list.data.data.length === 2 && list.data.data[0].id === h1.data.data.id, 'GET lists highlights ordered by position');

  console.log('\nChapter membership via highlights (D4):');
  let s = (await api(token, `/sources/${src.note_id}`)).data.data;
  assert(s.chapters.length === 1 && s.chapters[0].id === ch1.id && s.chapters[0].manual === false && s.highlight_count === 2,
    'source joins chapter 1 through its highlight (manual: false), highlight_count 2');
  assert((await api(token, `/sources?chapter_id=${ch1.id}`)).data.data.some(x => x.note_id === src.note_id), 'chapter filter finds it');
  assert(!(await api(token, '/sources?unassigned=true')).data.data.some(x => x.note_id === src.note_id), 'not listed as Unassigned');
  const chs = (await api(token, `/books/${book.id}/chapters`)).data.data;
  const c1 = chs.find(c => c.id === ch1.id);
  assert(c1.source_count === 1 && c1.highlight_count === 1, 'chapter counts: 1 source, 1 highlight');
  const refs = (await api(token, `/chapters/${ch1.id}/references`)).data.data;
  assert(refs.count === 1 && refs.text.includes('Sutton, Rich'), 'reference export includes the highlight-derived source');
  const both = (await api(token, `/chapters/${ch1.id}/references?include=both`)).data.data;
  assert(both.passages === 1 && both.text.includes('Key Passages') && both.text.includes('“general methods” — Core claim (Counter-argument)'),
    'export include=both adds Key Passages with quote, comment and meaning');
  const onlyP = (await api(token, `/chapters/${ch1.id}/references?include=passages`)).data.data;
  assert(!onlyP.text.includes('Sources and Further Reading') && onlyP.passages === 1, 'include=passages leaves out the bibliography');
  assert((await api(token, `/chapters/${ch1.id}/references?include=bogus`)).status === 400, 'unknown include → 400');
  assert((await api(token, `/books/${book.id}/references?include=both`)).data.data.passages === 1, 'book export carries passages too');
  assert((await api(other, `/chapters/${ch1.id}/references?include=passages`)).status === 404, 'cannot export another user\'s passages');
  const grouped = (await api(token, `/chapters/${ch1.id}/highlights`)).data.data;
  assert(grouped.length === 1 && grouped[0].source.title === `HL Source ${RUN}` && grouped[0].highlights[0].comment === 'Core claim',
    'GET /chapters/:id/highlights groups by source');

  console.log('\nEdit:');
  const ed = await api(token, `/highlights/${h1.data.data.id}`, { method: 'PUT', body: { color: 'green', comment: null, chapter_ids: [ch2.id] } });
  assert(ed.status === 200 && ed.data.data.color === 'green' && ed.data.data.comment === null && ed.data.data.chapters[0].id === ch2.id,
    'PUT changes color, clears comment, moves chapter');
  s = (await api(token, `/sources/${src.note_id}`)).data.data;
  assert(s.chapters.length === 1 && s.chapters[0].id === ch2.id, 'source follows its highlight to chapter 2 and leaves chapter 1');
  await api(token, `/sources/${src.note_id}/chapters`, { method: 'POST', body: { chapter_id: ch2.id } });
  s = (await api(token, `/sources/${src.note_id}`)).data.data;
  assert(s.chapters[0].manual === true, 'manual + highlight on the same chapter reads as manual (removable)');

  console.log('\nAnchors batch (browser-reported):');
  const up = await api(token, `/sources/${src.note_id}/highlights/anchors`, {
    method: 'PUT', body: { updates: [{ id: h2.data.data.id, anchor_status: 'orphaned' }, { id: h1.data.data.id, anchor_status: 'fuzzy', position_start: 31, position_end: 46 }] }
  });
  assert(up.status === 200 && up.data.data.updated === 2, 'two statuses updated');
  const after = (await api(token, `/sources/${src.note_id}/highlights`)).data.data;
  const orphan = after.find(h => h.id === h2.data.data.id);
  assert(orphan.anchor_status === 'orphaned' && orphan.exact === 'computation', 'orphaned is kept with its quote (D8)');
  assert(after.find(h => h.id === h1.data.data.id).position_start === 31, 'position hint updated');
  const again = await api(token, `/sources/${src.note_id}/highlights/anchors`, { method: 'PUT', body: { updates: [{ id: h2.data.data.id, anchor_status: 'orphaned' }] } });
  assert(again.data.data.updated === 0, 'unchanged statuses write nothing');

  console.log('\nIsolation (second user):');
  assert((await api(other, `/sources/${src.note_id}/highlights`)).status === 404, 'cannot list another user\'s highlights');
  assert((await api(other, `/sources/${src.note_id}/highlights`, { method: 'POST', body: { anchor_type: 'text_quote', exact: 'x' } })).status === 404,
    'cannot highlight another user\'s source');
  assert((await api(other, `/highlights/${h1.data.data.id}`, { method: 'PUT', body: { color: 'blue' } })).status === 404, 'cannot edit another user\'s highlight');
  assert((await api(other, `/highlights/${h1.data.data.id}`, { method: 'DELETE' })).status === 404, 'cannot delete another user\'s highlight');
  assert((await api(other, `/chapters/${ch1.id}/highlights`)).status === 404, 'cannot read another user\'s chapter highlights');
  const xb = await api(other, `/sources/${src.note_id}/highlights/anchors`, { method: 'PUT', body: { updates: [{ id: h1.data.data.id, anchor_status: 'orphaned' }] } });
  assert(xb.data?.data?.updated === 0, 'anchors batch cannot touch another user\'s highlight');
  const theirBook = (await api(other, '/books', { method: 'POST', body: { title: 'theirs' } })).data.data;
  const theirCh = (await api(other, `/books/${theirBook.id}/chapters`, { method: 'POST', body: { label: '1', title: 'T' } })).data.data;
  assert((await api(token, `/highlights/${h1.data.data.id}`, { method: 'PUT', body: { chapter_ids: [theirCh.id] } })).status === 404,
    'cannot assign a highlight to another user\'s chapter');
  assert((await api(token, `/sources/${src.note_id}/highlights`, { method: 'POST', body: { anchor_type: 'text_quote', exact: 'x', chapter_ids: [theirCh.id] } })).status === 404,
    'cannot create a highlight in another user\'s chapter');

  console.log('\nDelete + trash:');
  assert((await api(token, `/chapters/${ch2.id}`, { method: 'DELETE' })).status === 409, 'deleting a chapter with highlight assignments → 409');
  assert((await api(token, `/highlights/${h2.data.data.id}`, { method: 'DELETE' })).status === 204, 'DELETE highlight → 204 (hard delete)');
  await api(token, `/notes/${src.note_id}`, { method: 'DELETE' });
  assert((await api(token, `/chapters/${ch2.id}/highlights`)).data.data.length === 0, 'a trashed source\'s highlights drop out of chapter lists');
  assert((await api(token, `/sources/${src.note_id}/highlights`, { method: 'POST', body: { anchor_type: 'text_quote', exact: 'x' } })).status === 404,
    'cannot highlight a trashed source');

  if (prevActive) await api(token, `/books/${prevActive}`, { method: 'PUT', body: { is_active: true } });
}

run()
  .catch(err => { console.error('Test runner error:', err); failed++; })
  .finally(async () => {
    await pool.query('DELETE FROM users WHERE username = $1', [OTHER]).catch(() => {});
    if (cleanup.notes.length) await pool.query('DELETE FROM notes WHERE id = ANY($1::uuid[])', [cleanup.notes]).catch(() => {});
    if (cleanup.books.length) await pool.query('DELETE FROM books WHERE id = ANY($1::uuid[])', [cleanup.books]).catch(() => {});
    await pool.end();
    console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
  });
