/**
 * CR039 Phase A1 — research sources, books and chapters.
 * Run: node backend/tests/cr039-research.test.js
 * Requires: backend running on port 3001, dev user seeded, migration 021 applied.
 * Creates (and removes) a throwaway second user for the cross-user isolation tests.
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { normalizeSourceUrl } = require('../src/utils/sourceUrl');

const BASE = 'http://localhost:3001/api/v1';
let passed = 0;
let failed = 0;

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'noted_dev', user: 'noteduser', password: 'noted_dev_password'
});

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
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

async function login(username, password) {
  const res = await api(null, '/auth/login', { method: 'POST', body: { username, password } });
  return res.data?.data?.accessToken;
}

const RUN = Date.now().toString(36);
const OTHER_USER = `cr039-other-${RUN}`;
const bookIds = [];
let previouslyActiveBookId = null;
const noteIds = [];

async function run() {
  console.log('\n=== CR039 A1 — research sources ===\n');

  console.log('URL normalizer (unit):');
  assert(normalizeSourceUrl('HTTPS://Example.COM/a/b/?utm_source=x&id=7#frag') === 'https://example.com/a/b?id=7',
    'lowercases host, drops fragment, utm_* and trailing slash');
  assert(normalizeSourceUrl('https://example.com/') === 'https://example.com', 'root URL loses trailing slash');
  assert(normalizeSourceUrl('  ') === null, 'blank → null');
  let threw = false;
  try { normalizeSourceUrl('ftp://example.com/x'); } catch { threw = true; }
  assert(threw, 'non-http(s) URL rejected');

  const token = await login('dev', 'password123');
  assert(!!token, 'dev user logs in');
  if (!token) process.exit(1);

  const hash = await bcrypt.hash('cr039-pass', 4);
  await pool.query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)',
    [OTHER_USER, `${OTHER_USER}@example.com`, hash]
  );
  const otherToken = await login(OTHER_USER, 'cr039-pass');
  assert(!!otherToken, 'second user logs in');

  // ------------------------------------------------------------ books
  console.log('\nBooks:');
  const before = await api(token, '/books');
  const hadActive = before.data.data.some(b => b.is_active);
  previouslyActiveBookId = before.data.data.find(b => b.is_active)?.id || null;
  const b1 = await api(token, '/books', { method: 'POST', body: { title: `Test book A ${RUN}` } });
  const b2 = await api(token, '/books', { method: 'POST', body: { title: `Test book B ${RUN}` } });
  bookIds.push(b1.data?.data?.id, b2.data?.data?.id);
  assert(b1.status === 201 && b2.status === 201, 'POST /books → 201');
  assert(b2.data.data.is_active === false, 'a later book starts inactive');
  if (!hadActive) assert(b1.data.data.is_active === true, 'the first book becomes active');

  const act = await api(token, `/books/${b2.data.data.id}`, { method: 'PUT', body: { is_active: true } });
  const afterAct = await api(token, '/books');
  const activeNow = afterAct.data.data.filter(b => b.is_active);
  assert(act.status === 200 && activeNow.length === 1 && activeNow[0].id === b2.data.data.id,
    'activating a book leaves exactly one active');
  const b3 = await api(token, '/books', { method: 'POST', body: { title: `Test book C ${RUN}` } });
  await api(token, `/books/${b3.data.data.id}`, { method: 'PUT', body: { is_active: true } });
  await api(token, `/books/${b3.data.data.id}`, { method: 'DELETE' });
  const afterDel = await api(token, '/books');
  assert(afterDel.data.data.filter(b => b.is_active).length === 1, 'deleting the active book promotes another');
  const bookId = b1.data.data.id;

  // --------------------------------------------------------- chapters
  console.log('\nChapters:');
  const c1 = await api(token, `/books/${bookId}/chapters`, { method: 'POST', body: { label: '1', title: 'Origins' } });
  const c2 = await api(token, `/books/${bookId}/chapters`, { method: 'POST', body: { label: '2', title: 'Silicon' } });
  const c3 = await api(token, `/books/${bookId}/chapters`, { method: 'POST', body: { label: '3', title: 'Scale', part: 'Part I' } });
  assert(c1.status === 201 && c2.status === 201 && c3.status === 201, 'POST chapters → 201');
  assert(c1.data.data.sort_order === 0 && c3.data.data.sort_order === 2, 'sort_order defaults to max + 1');
  const dupLabel = await api(token, `/books/${bookId}/chapters`, { method: 'POST', body: { label: '2', title: 'Dup' } });
  assert(dupLabel.status === 409 && dupLabel.data.error === 'chapter_label_exists', 'duplicate label → 409');

  const ids = [c1, c2, c3].map(c => c.data.data.id);
  const reorder = await api(token, `/books/${bookId}/chapters/reorder`,
    { method: 'PUT', body: { chapter_ids: [ids[2], ids[0], ids[1]] } });
  assert(reorder.status === 200 && reorder.data.data.map(c => c.id).join() === [ids[2], ids[0], ids[1]].join(),
    'reorder renumbers every chapter in one transaction (deferred constraint)');
  const partial = await api(token, `/books/${bookId}/chapters/reorder`,
    { method: 'PUT', body: { chapter_ids: [ids[0]] } });
  assert(partial.status === 400, 'a partial reorder list → 400');

  const ren = await api(token, `/chapters/${ids[1]}`, { method: 'PUT', body: { title: 'Silicon Valley', part: null } });
  assert(ren.status === 200 && ren.data.data.title === 'Silicon Valley', 'PUT /chapters/:id renames');

  // ---------------------------------------------------------- sources
  console.log('\nSources:');
  const url = `https://example.com/cr039/${RUN}/?utm_campaign=x`;
  const s1 = await api(token, '/sources', {
    method: 'POST',
    body: {
      source_kind: 'web', title: 'The Bitter Lesson', authors: [{ family: 'Sutton', given: 'Rich' }],
      container: 'Incomplete Ideas', published_date: '2019-03-13', published_precision: 'day',
      url, content: 'Body text of the source.', chapter_ids: [ids[0]]
    }
  });
  const srcId = s1.data?.data?.note_id;
  noteIds.push(srcId);
  assert(s1.status === 201, 'POST /sources → 201');
  assert(s1.data.data.url === `https://example.com/cr039/${RUN}`, 'stored URL is normalized');
  assert(s1.data.data.metadata_status === 'verified', 'complete manual entry is verified');
  assert(s1.data.data.published_date === '2019-03-13', 'published_date returns as a plain YYYY-MM-DD string');
  assert(s1.data.data.chapters.length === 1, 'chapter assigned at create');

  const s2 = await api(token, '/sources', { method: 'POST', body: { source_kind: 'book', title: `Undated ${RUN}` } });
  noteIds.push(s2.data?.data?.note_id);
  assert(s2.data.data.metadata_status === 'incomplete', 'no author/date → incomplete');

  const dupBefore = await pool.query("SELECT COUNT(*)::int AS n FROM notes WHERE note_type = 'source' AND title = 'Dup clip'");
  const dup = await api(token, '/sources', {
    method: 'POST', body: { source_kind: 'web', title: 'Dup clip', url: `https://EXAMPLE.com/cr039/${RUN}#x` }
  });
  const dupAfter = await pool.query("SELECT COUNT(*)::int AS n FROM notes WHERE note_type = 'source' AND title = 'Dup clip'");
  assert(dup.status === 409 && dup.data.error === 'source_exists' && dup.data.data.note_id === srcId,
    'duplicate (normalized) URL → 409 source_exists with the existing note id');
  assert(dupAfter.rows[0].n === dupBefore.rows[0].n, 'the duplicate rolled back — no orphan source note');

  const list = await api(token, `/sources?chapter_id=${ids[0]}`);
  assert(list.status === 200 && list.data.data.some(s => s.note_id === srcId), 'GET /sources?chapter_id filters');
  const attention = await api(token, '/sources?needs_attention=true');
  assert(attention.data.data.some(s => s.note_id === s2.data.data.note_id) &&
         !attention.data.data.some(s => s.note_id === srcId), 'needs_attention lists unverified only');
  const unassigned = await api(token, '/sources?unassigned=true');
  assert(unassigned.data.data.some(s => s.note_id === s2.data.data.note_id), 'unassigned lists chapterless sources');
  const q = await api(token, '/sources?q=Sutton');
  assert(q.data.data.some(s => s.note_id === srcId), 'q matches authors');

  const verify = await api(token, `/sources/${s2.data.data.note_id}`, { method: 'PUT', body: {} });
  assert(verify.status === 200 && verify.data.data.metadata_status === 'verified', 'PUT {} (Verify) → verified');
  const edit = await api(token, `/sources/${srcId}`, { method: 'PUT', body: { title: 'The Bitter Lesson (essay)' } });
  const noteAfterEdit = await api(token, `/notes/${srcId}`);
  assert(edit.data.data.title === 'The Bitter Lesson (essay)' && noteAfterEdit.data.data.title === 'The Bitter Lesson',
    'citation title edits do not rename the note');

  const assign = await api(token, `/sources/${srcId}/chapters`, { method: 'POST', body: { chapter_id: ids[1] } });
  assert(assign.status === 201 && assign.data.data.chapters.length === 2, 'manual chapter assignment');
  const again = await api(token, `/sources/${srcId}/chapters`, { method: 'POST', body: { chapter_id: ids[1] } });
  assert(again.status === 200, 're-assigning is idempotent');
  const chList = await api(token, `/books/${bookId}/chapters`);
  assert(chList.data.data.find(c => c.id === ids[1]).source_count === 1, 'chapter source_count counts it');
  const unassign = await api(token, `/sources/${srcId}/chapters/${ids[1]}`, { method: 'DELETE' });
  assert(unassign.status === 204, 'DELETE assignment → 204');

  const delCh = await api(token, `/chapters/${ids[0]}`, { method: 'DELETE' });
  assert(delCh.status === 409 && delCh.data.error === 'chapter_has_assignments', 'deleting an assigned chapter → 409');

  // ------------------------------------------------- export (Phase B)
  console.log('\nReference export:');
  const ref = await api(token, `/chapters/${ids[0]}/references`);
  assert(ref.status === 200 && ref.data.data.count === 1, 'GET /chapters/:id/references → 1 entry');
  assert(ref.data.data.text.includes('Sutton, Rich. “The Bitter Lesson (essay).”') &&
         ref.data.data.html.includes('<em>Incomplete Ideas</em>') && ref.data.data.markdown.includes('*Incomplete Ideas*'),
    'entry rendered in text, HTML and Markdown');
  const bookRef = await api(token, `/books/${bookId}/references`);
  const order = bookRef.data.data.text.split('\n').filter(l => l.startsWith('Chapter '));
  assert(bookRef.status === 200 && order.length === 3 && order[0].startsWith('Chapter 3'),
    'book export has one section per chapter, in outline order');
  assert((await api(otherToken, `/chapters/${ids[0]}/references`)).status === 404, 'cannot export another user\'s chapter');
  assert((await api(otherToken, `/books/${bookId}/references`)).status === 404, 'cannot export another user\'s book');

  // ------------------------------------------- Notes list exclusion (D9)
  console.log('\nNotes list / Inbox exclusion:');
  const notes = await api(token, '/notes?limit=100');
  const inbox = await api(token, '/notes?in_inbox=true&limit=100');
  assert(!notes.data.data.some(n => n.id === srcId), 'source absent from GET /notes');
  assert(!inbox.data.data.some(n => n.id === srcId), 'source absent from the Inbox');
  const explicit = await api(token, '/notes?note_type=source&limit=100');
  assert(explicit.data.data.some(n => n.id === srcId), 'note_type=source lists it explicitly');

  // --------------------------------------------- read-only bodies (§6.1)
  console.log('\nRead-only source body:');
  const ro = (res) => res.status === 422 && res.data?.error === 'source_body_readonly';
  assert(ro(await api(token, `/notes/${srcId}`, { method: 'PUT', body: { content: 'changed' } })),
    'PUT content change → 422');
  const rename = await api(token, `/notes/${srcId}`,
    { method: 'PUT', body: { title: 'Renamed source', content: 'Body text of the source.' } });
  assert(rename.status === 200 && rename.data.data.title === 'Renamed source',
    'title rename with unchanged content (autosave shape) → 200');
  assert(ro(await api(token, `/notes/${srcId}`, { method: 'PUT', body: { format: 'html' } })), 'PUT format flip → 422');
  const nb = await api(token, '/notebooks');
  assert(ro(await api(token, `/notes/${srcId}`, { method: 'PUT', body: { notebook_id: nb.data.data[0].id } })),
    'PUT notebook_id → 422');
  assert(ro(await api(token, `/notes/${srcId}`, { method: 'PUT', body: { auto_update: true } })), 'PUT auto_update → 422');
  assert(ro(await api(token, `/notes/${srcId}`, { method: 'PUT', body: { note_type: 'note' } })), 'PUT note_type change → 422');

  const plain = await api(token, '/notes', { method: 'POST', body: { title: `cr039 plain ${RUN}`, content: 'x' } });
  noteIds.push(plain.data.data.id);
  assert(ro(await api(token, `/notes/${plain.data.data.id}/merge-into`, { method: 'POST', body: { target_note_id: srcId } })),
    'merge-into with a source as target → 422');
  assert(ro(await api(token, `/notes/${srcId}/merge-into`, { method: 'POST', body: { target_note_id: plain.data.data.id } })),
    'merge-into with a source as the merged note → 422');
  const current = await api(token, `/notes/${srcId}`);
  assert(ro(await api(token, `/notes/${srcId}/checkin`,
    { method: 'POST', body: { base_version: current.data.data.updated_at, content: 'offline edit' } })),
    'offline checkin → 422');

  let trigger = null;
  try {
    await pool.query("UPDATE notes SET content = 'raw sql' WHERE id = $1", [srcId]);
  } catch (err) { trigger = err; }
  assert(trigger && /source_body_readonly/.test(trigger.message), 'trigger refuses a raw SQL body update');
  const titleOnly = await pool.query("UPDATE notes SET title = 'sql title' WHERE id = $1 RETURNING id", [srcId]);
  assert(titleOnly.rowCount === 1, 'trigger allows a title-only update');

  const replaced = await api(token, `/sources/${srcId}/replace-body`, { method: 'POST', body: { content: 'Re-captured body.' } });
  assert(replaced.status === 200 && replaced.data.data.note.content === 'Re-captured body.',
    'replace-body changes the body (trigger bypass)');

  // ----------------------------------------------- cross-user isolation
  console.log('\nIsolation (second user):');
  assert((await api(otherToken, `/sources/${srcId}`)).status === 404, 'cannot read another user\'s source');
  assert(!(await api(otherToken, '/sources')).data.data.some(s => s.note_id === srcId), 'not in their source list');
  assert((await api(otherToken, `/books/${bookId}/chapters`)).status === 404, 'cannot list another user\'s chapters');
  assert(!(await api(otherToken, '/books')).data.data.some(b => b.id === bookId), 'not in their book list');
  assert((await api(otherToken, `/sources/${srcId}`, { method: 'PUT', body: { title: 'pwned' } })).status === 404,
    'cannot edit another user\'s source');
  assert((await api(otherToken, `/chapters/${ids[0]}`, { method: 'PUT', body: { title: 'pwned' } })).status === 404,
    'cannot edit another user\'s chapter');
  assert((await api(otherToken, `/sources/${srcId}/replace-body`, { method: 'POST', body: { content: 'pwned' } })).status === 404,
    'cannot replace another user\'s source body');

  assert((await api(otherToken, `/books/${bookId}`, { method: 'PUT', body: { title: 'pwned' } })).status === 404,
    'cannot rename another user\'s book');
  assert((await api(otherToken, `/books/${bookId}`, { method: 'DELETE' })).status === 404,
    'cannot delete another user\'s book');
  assert((await api(otherToken, `/books/${bookId}/chapters`, { method: 'POST', body: { label: 'x', title: 'x' } })).status === 404,
    'cannot add a chapter to another user\'s book');
  assert((await api(otherToken, `/books/${bookId}/chapters/reorder`, { method: 'PUT', body: { chapter_ids: ids } })).status === 404,
    'cannot reorder another user\'s chapters');
  assert((await api(otherToken, `/chapters/${ids[1]}?force=true`, { method: 'DELETE' })).status === 404,
    'cannot delete another user\'s chapter');

  const otherBook = await api(otherToken, '/books', { method: 'POST', body: { title: 'Other book' } });
  const otherCh = await api(otherToken, `/books/${otherBook.data.data.id}/chapters`,
    { method: 'POST', body: { label: '1', title: 'Theirs' } });
  const otherSrc = await api(otherToken, '/sources', { method: 'POST', body: { source_kind: 'other', title: 'Theirs' } });
  const xAssign1 = await api(token, `/sources/${srcId}/chapters`, { method: 'POST', body: { chapter_id: otherCh.data.data.id } });
  assert(xAssign1.status === 404, 'source_chapters: own source + their chapter → 404');
  const xAssign2 = await api(otherToken, `/sources/${otherSrc.data.data.note_id}/chapters`, { method: 'POST', body: { chapter_id: ids[0] } });
  assert(xAssign2.status === 404, 'source_chapters: their source + my chapter → 404');
  const xCreate = await api(otherToken, '/sources', { method: 'POST', body: { source_kind: 'other', title: 'x', chapter_ids: [ids[0]] } });
  assert(xCreate.status === 404, 'POST /sources with another user\'s chapter_ids → 404');
  const xDelAssign = await api(otherToken, `/sources/${srcId}/chapters/${ids[0]}`, { method: 'DELETE' });
  assert(xDelAssign.status === 404, 'cannot remove another user\'s assignment');
  const xUrl = await api(otherToken, '/sources', { method: 'POST', body: { source_kind: 'web', title: 'same url', url } });
  assert(xUrl.status === 201, 'URL uniqueness is per user, not global');

  // ------------------------------------------------------------ trash
  console.log('\nTrash:');
  await api(token, `/notes/${srcId}`, { method: 'DELETE' });
  const trashedDup = await api(token, '/sources', { method: 'POST', body: { source_kind: 'web', title: 'again', url } });
  assert(trashedDup.status === 409 && trashedDup.data.data.in_trash === true, 'duplicate of a trashed source → 409 in_trash');
  assert(!(await api(token, `/sources?chapter_id=${ids[0]}`)).data.data.some(s => s.note_id === srcId),
    'trashed source drops out of chapter lists');
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE username = $1', [OTHER_USER]);
  const ids = noteIds.filter(Boolean);
  if (ids.length) await pool.query('DELETE FROM notes WHERE id = ANY($1::uuid[])', [ids]);
  const books = bookIds.filter(Boolean);
  if (books.length) await pool.query('DELETE FROM books WHERE id = ANY($1::uuid[])', [books]);
  if (previouslyActiveBookId) await pool.query('UPDATE books SET is_active = TRUE WHERE id = $1', [previouslyActiveBookId]);
}

run()
  .catch(err => { console.error('Test runner error:', err); failed++; })
  .finally(async () => {
    await cleanup().catch(err => console.error('Cleanup error:', err.message));
    await pool.end();
    console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
  });
