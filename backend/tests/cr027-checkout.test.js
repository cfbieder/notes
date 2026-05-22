/**
 * CR027 — Offline Note Checkout API Tests
 * Run: node backend/tests/cr027-checkout.test.js
 * Requires: backend running on port 3001, dev user seeded.
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
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

async function run() {
  console.log('\n=== CR027 — Offline Note Checkout API Tests ===\n');

  // --- Login ---
  console.log('Auth:');
  const loginRes = await api('/auth/login', {
    method: 'POST',
    body: { username: 'dev', password: 'password123' }
  });
  token = loginRes.data?.data?.accessToken;
  assert(loginRes.status === 200 && token, 'Login succeeds');
  if (!token) { console.error('Cannot continue without token.'); process.exit(1); }

  // === 1. Auth required ===
  console.log('\n1. Auth:');
  const noAuthRes = await fetch(`${BASE}/notes/00000000-0000-0000-0000-000000000000/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_version: '2026-01-01T00:00:00.000Z', content: 'x' })
  });
  assert(noAuthRes.status === 401, 'POST /checkin without Authorization returns 401');

  // Create a note to work with
  const createRes = await api('/notes', {
    method: 'POST',
    body: { title: 'CR027 checkout test', content: 'original content' }
  });
  const noteId = createRes.data?.data?.id;
  const baseVersion = createRes.data?.data?.updated_at;
  cleanup.push(noteId);
  assert(createRes.status === 201 && noteId, 'Note created');

  // === 2. Clean check-in ===
  console.log('\n2. Clean check-in:');
  const cleanRes = await api(`/notes/${noteId}/checkin`, {
    method: 'POST',
    body: {
      base_version: baseVersion,
      title: 'CR027 checkout test',
      content: 'updated content from offline edit'
    }
  });
  assert(cleanRes.status === 200, 'Returns 200 on matching base_version');
  assert(cleanRes.data?.data?.content === 'updated content from offline edit', 'Content was applied');
  assert(new Date(cleanRes.data?.data?.updated_at) > new Date(baseVersion), 'updated_at advanced');

  // Verify via GET
  const verifyRes = await api(`/notes/${noteId}`);
  assert(verifyRes.data?.data?.content === 'updated content from offline edit', 'GET reflects new content');

  // === 3. Conflict 409 ===
  console.log('\n3. Conflict 409:');
  // Capture the new base version, then mutate the note via PUT to simulate a
  // concurrent edit from another session.
  const newBase = cleanRes.data.data.updated_at;
  await new Promise(r => setTimeout(r, 50)); // ensure clock tick
  const concurrentRes = await api(`/notes/${noteId}`, {
    method: 'PUT',
    body: { content: 'concurrent edit from another tab' }
  });
  assert(concurrentRes.status === 200, 'Concurrent PUT succeeded');

  // Now attempt a check-in with the stale base.
  const conflictRes = await api(`/notes/${noteId}/checkin`, {
    method: 'POST',
    body: {
      base_version: newBase,
      content: 'my offline edit that should NOT win silently'
    }
  });
  assert(conflictRes.status === 409, 'Returns 409 on stale base_version');
  assert(conflictRes.data?.error === 'checkin_conflict', 'Error code is checkin_conflict');
  assert(conflictRes.data?.data?.server, 'Body includes server state');
  assert(conflictRes.data?.data?.server?.content === 'concurrent edit from another tab', 'Server state shows the concurrent edit, not my offline edit');

  // Verify the row was NOT modified by the conflicted call.
  const postConflictRes = await api(`/notes/${noteId}`);
  assert(postConflictRes.data?.data?.content === 'concurrent edit from another tab', 'Row unchanged by conflicted check-in');

  // === 4. Forced overwrite path ===
  console.log('\n4. Forced overwrite (post-conflict retry):');
  const serverVersion = conflictRes.data.data.server.updated_at;
  const overwriteRes = await api(`/notes/${noteId}/checkin`, {
    method: 'POST',
    body: {
      base_version: serverVersion,
      content: 'my offline edit, now applied via forced overwrite'
    }
  });
  assert(overwriteRes.status === 200, 'Retry with current base_version succeeds');
  assert(overwriteRes.data?.data?.content === 'my offline edit, now applied via forced overwrite', 'Overwrite content applied');

  // === 5. Missing note ===
  console.log('\n5. Missing note:');
  const missingRes = await api(`/notes/00000000-0000-0000-0000-000000000000/checkin`, {
    method: 'POST',
    body: { base_version: new Date().toISOString(), content: 'x' }
  });
  assert(missingRes.status === 404, 'Returns 404 for unknown note ID');

  // === 6. Deleted note ===
  console.log('\n6. Deleted note:');
  const delNoteRes = await api('/notes', {
    method: 'POST',
    body: { title: 'CR027 to be trashed', content: 'temp' }
  });
  const delNoteId = delNoteRes.data?.data?.id;
  const delBase = delNoteRes.data?.data?.updated_at;
  await api(`/notes/${delNoteId}`, { method: 'DELETE' });
  const trashedCheckinRes = await api(`/notes/${delNoteId}/checkin`, {
    method: 'POST',
    body: { base_version: delBase, content: 'after-trash edit' }
  });
  assert(trashedCheckinRes.status === 404, 'Returns 404 for trashed note');

  // === 7. Wikilink resync ===
  console.log('\n7. Wikilink resync:');
  const targetRes = await api('/notes', {
    method: 'POST',
    body: { title: 'CR027 link target', content: 'I am the target' }
  });
  const targetId = targetRes.data?.data?.id;
  cleanup.push(targetId);

  const srcRes = await api('/notes', {
    method: 'POST',
    body: { title: 'CR027 link source', content: 'no link yet' }
  });
  const srcId = srcRes.data?.data?.id;
  const srcBase = srcRes.data?.data?.updated_at;
  cleanup.push(srcId);

  const linkCheckinRes = await api(`/notes/${srcId}/checkin`, {
    method: 'POST',
    body: {
      base_version: srcBase,
      content: 'now I link to [[CR027 link target]] from offline edit'
    }
  });
  assert(linkCheckinRes.status === 200, 'Wikilink check-in succeeds');

  // Backlinks endpoint shows the new edge (rows expose the source note as `id`)
  const backlinksRes = await api(`/notes/${targetId}/backlinks`);
  const hasLink = (backlinksRes.data?.data || []).some(b => b.id === srcId);
  assert(hasLink, 'note_links row was created for the wikilink');

  // === 8. Required-field validation ===
  console.log('\n8. Validation:');
  const noBaseRes = await api(`/notes/${noteId}/checkin`, {
    method: 'POST',
    body: { content: 'no base_version' }
  });
  assert(noBaseRes.status === 400, 'Returns 400 when base_version is missing');

  // === Cleanup ===
  for (const id of cleanup) {
    if (id) await api(`/notes/${id}`, { method: 'DELETE' });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(2);
});
