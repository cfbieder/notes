/**
 * Phase 7 API Tests — Web Clipper
 * Run: node backend/tests/phase7-clips.test.js
 * Requires: backend running on port 3001, dev user seeded
 */

const BASE = 'http://localhost:3001/api/v1';
let token = null;
let passed = 0;
let failed = 0;
const createdNoteIds = [];

function assert(condition, name) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

async function apiFetch(path, options = {}) {
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

// 1x1 transparent PNG
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9V4j2+0AAAAASUVORK5CYII=';

async function run() {
  console.log('\n=== Phase 7 Web Clipper API Tests ===\n');

  console.log('Auth:');
  const loginRes = await apiFetch('/auth/login', {
    method: 'POST',
    body: { username: 'dev', password: 'password123' }
  });
  token = loginRes.data?.data?.accessToken;
  assert(loginRes.status === 200 && token, 'Login succeeds');
  if (!token) { console.error('Cannot continue without token'); process.exit(1); }

  console.log('\nClip — article mode:');
  const articleRes = await apiFetch('/clips', {
    method: 'POST',
    body: {
      url: 'https://example.com/article',
      title: 'Example Article',
      content: '# Hello\n\nThis is the clipped body.',
      mode: 'article',
      tag_names: ['clipped', 'phase7test'],
      send_to_inbox: true
    }
  });
  assert(articleRes.status === 201, 'Article clip returns 201');
  assert(articleRes.data?.data?.note?.id, 'Article clip returns note id');
  assert(articleRes.data?.data?.note?.source_url === 'https://example.com/article', 'source_url stored');
  assert(articleRes.data?.data?.note?.notebook_id === null, 'send_to_inbox=true → notebook-less (lands in Inbox via derived filter)');
  assert(articleRes.data?.data?.note?.content?.includes('Clipped from'), 'Note body has source header');
  assert(articleRes.data?.data?.note?.content?.includes('This is the clipped body'), 'Body content preserved');
  assert(Array.isArray(articleRes.data?.data?.tag_ids) && articleRes.data.data.tag_ids.length === 2, 'Two tags attached');
  if (articleRes.data?.data?.note?.id) createdNoteIds.push(articleRes.data.data.note.id);

  console.log('\nClip — selection mode:');
  const selRes = await apiFetch('/clips', {
    method: 'POST',
    body: {
      url: 'https://example.com/selection',
      title: 'Page With Selection',
      content: 'Just the highlighted sentence.',
      mode: 'selection'
    }
  });
  assert(selRes.status === 201, 'Selection clip returns 201');
  assert(selRes.data?.data?.note?.notebook_id === null, 'Selection defaults to notebook-less (Inbox) when no notebook');
  if (selRes.data?.data?.note?.id) createdNoteIds.push(selRes.data.data.note.id);

  console.log('\nClip — link-only mode:');
  const linkRes = await apiFetch('/clips', {
    method: 'POST',
    body: {
      url: 'https://example.com/link',
      title: 'Link-only Page',
      mode: 'link'
    }
  });
  assert(linkRes.status === 201, 'Link clip returns 201');
  assert(linkRes.data?.data?.note?.content?.includes('https://example.com/link'), 'Link body contains URL');
  if (linkRes.data?.data?.note?.id) createdNoteIds.push(linkRes.data.data.note.id);

  console.log('\nClip — screenshot mode:');
  const shotRes = await apiFetch('/clips', {
    method: 'POST',
    body: {
      url: 'https://example.com/shot',
      title: 'Shot Page',
      mode: 'screenshot',
      screenshot_data_url: TINY_PNG_DATA_URL
    }
  });
  assert(shotRes.status === 201, 'Screenshot clip returns 201');
  assert(shotRes.data?.data?.attachment_id, 'Screenshot attachment created');
  if (shotRes.data?.data?.note?.id) createdNoteIds.push(shotRes.data.data.note.id);

  console.log('\nValidation errors:');

  const badUrl = await apiFetch('/clips', {
    method: 'POST',
    body: { url: 'not-a-url', mode: 'article' }
  });
  assert(badUrl.status === 400, 'Rejects malformed URL');

  const ftpUrl = await apiFetch('/clips', {
    method: 'POST',
    body: { url: 'ftp://example.com', mode: 'article' }
  });
  assert(ftpUrl.status === 400, 'Rejects non-http(s) URL');

  const missingMode = await apiFetch('/clips', {
    method: 'POST',
    body: { url: 'https://example.com' }
  });
  assert(missingMode.status === 400, 'Rejects missing mode');

  const badMode = await apiFetch('/clips', {
    method: 'POST',
    body: { url: 'https://example.com', mode: 'bogus' }
  });
  assert(badMode.status === 400, 'Rejects unknown mode');

  const badNotebook = await apiFetch('/clips', {
    method: 'POST',
    body: {
      url: 'https://example.com/x',
      mode: 'article',
      notebook_id: '00000000-0000-0000-0000-000000000000'
    }
  });
  assert(badNotebook.status === 404, 'Rejects unknown notebook_id');

  const badShot = await apiFetch('/clips', {
    method: 'POST',
    body: {
      url: 'https://example.com/bad',
      mode: 'screenshot',
      screenshot_data_url: 'data:text/plain;base64,aGVsbG8='
    }
  });
  assert(badShot.status === 400, 'Rejects non-image screenshot data URL');

  console.log('\nUnauthenticated:');
  const unauth = await fetch(`${BASE}/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com', mode: 'article' })
  });
  assert(unauth.status === 401, 'Requires auth');

  console.log('\nSearch integration:');
  // The article clip body contains "clipped body" — verify it's findable.
  const searchRes = await apiFetch('/search?q=clipped+body');
  const found = searchRes.data?.data?.some(r => r.id === createdNoteIds[0]);
  assert(searchRes.status === 200 && found, 'Article clip is searchable');

  console.log('\nCleanup:');
  for (const id of createdNoteIds) {
    await apiFetch(`/notes/${id}?hard=true`, { method: 'DELETE' });
  }
  console.log(`  cleaned up ${createdNoteIds.length} test notes`);

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
