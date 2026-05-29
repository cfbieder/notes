/**
 * Phase 8.11 — Note Translate API Tests
 * Run: node backend/tests/phase8-translate.test.js
 * Requires: backend on port 3001, dev user seeded, LLM gateway reachable.
 */

const BASE = 'http://localhost:3001/api/v1';
let token = null;
let passed = 0;
let failed = 0;
const cleanup = [];

function assert(cond, name) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.error(`  ✗ ${name}`); failed++; }
}

async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

async function run() {
  console.log('\n=== Phase 8.11 Note Translate API Tests ===\n');

  console.log('Auth:');
  const login = await api('/auth/login', {
    method: 'POST',
    body: { username: 'dev', password: 'password123' }
  });
  token = login.data?.data?.accessToken;
  assert(login.status === 200 && token, 'Login succeeds');
  if (!token) process.exit(1);

  console.log('\nCreate test note:');
  const created = await api('/notes', {
    method: 'POST',
    body: {
      title: 'Translate test',
      content: 'Hello world. This is a short note about testing translation.'
    }
  });
  const noteId = created.data?.data?.id;
  assert(created.status === 201 && noteId, 'Note created');
  cleanup.push(noteId);

  console.log('\nTranslate:');
  const tr = await api(`/notes/${noteId}/translate`, {
    method: 'POST',
    body: { source_lang: 'en', target_lang: 'es' }
  });
  assert(tr.status === 200, 'Translate returns 200');
  const content = tr.data?.data?.content || '';
  assert(/Translated \(en → es\)/.test(content), 'Translated block appended');
  assert(/Hello world/.test(content), 'Original preserved');
  // The Spanish translation should contain at least one obviously-Spanish word.
  assert(/(?:Hola|mundo|traducción|esto|prueba)/i.test(content), 'Contains Spanish output');

  console.log('\nValidation errors:');
  const same = await api(`/notes/${noteId}/translate`, {
    method: 'POST',
    body: { source_lang: 'en', target_lang: 'en' }
  });
  assert(same.status === 400, 'Rejects same source/target lang');

  const missing = await api(`/notes/${noteId}/translate`, {
    method: 'POST',
    body: { source_lang: 'en' }
  });
  assert(missing.status === 400, 'Rejects missing target_lang');

  const notFound = await api('/notes/00000000-0000-0000-0000-000000000000/translate', {
    method: 'POST',
    body: { source_lang: 'en', target_lang: 'es' }
  });
  assert(notFound.status === 404, 'Rejects unknown note id');

  // Empty content rejection
  const empty = await api('/notes', {
    method: 'POST',
    body: { title: 'Empty', content: '' }
  });
  const emptyId = empty.data?.data?.id;
  cleanup.push(emptyId);
  const emptyTr = await api(`/notes/${emptyId}/translate`, {
    method: 'POST',
    body: { source_lang: 'en', target_lang: 'es' }
  });
  assert(emptyTr.status === 400, 'Rejects empty-content note');

  console.log('\nUnauthenticated:');
  const unauth = await fetch(`${BASE}/notes/${noteId}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_lang: 'en', target_lang: 'es' })
  });
  assert(unauth.status === 401, 'Requires auth');

  console.log('\nCleanup:');
  for (const id of cleanup) {
    if (id) await api(`/notes/${id}?hard=true`, { method: 'DELETE' });
  }
  console.log(`  cleaned up ${cleanup.filter(Boolean).length} test notes`);

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
