/**
 * Phase 13 API Tests — HTML-Format Notes (CR023)
 * Run: node backend/tests/phase13-html-notes.test.js
 * Requires: backend running on port 3001, dev user seeded, migration 018 applied.
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

async function uploadFile(path, file, fields = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', file);
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: form });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const HTML_DOC = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Imported Document</title>
  <style>.c-teal rect { fill: #2dd4bf; }</style>
</head>
<body>
  <h1>Hello</h1>
  <p>This came from an HTML file.</p>
</body>
</html>`;

const HTML_FRAGMENT = '<h1>Just a fragment</h1><p>No html/body wrapper.</p>';

const MD_DOC = '# Markdown\n\nA plain markdown file.';

async function run() {
  console.log('\n=== Phase 13 HTML-Format Notes Tests ===\n');

  console.log('Auth:');
  const loginRes = await apiFetch('/auth/login', {
    method: 'POST',
    body: { username: 'dev', password: 'password123' }
  });
  token = loginRes.data?.data?.accessToken;
  assert(loginRes.status === 200 && token, 'Login succeeds');
  if (!token) { console.error('Cannot continue without token'); process.exit(1); }

  console.log('\nDirect note creation:');
  const mdNote = await apiFetch('/notes', {
    method: 'POST',
    body: { title: 'phase13 md', content: '# hi' }
  });
  assert(mdNote.status === 201, 'Default format note returns 201');
  assert(mdNote.data?.data?.format === 'markdown', 'Default format is markdown');
  if (mdNote.data?.data?.id) createdNoteIds.push(mdNote.data.data.id);

  const htmlNote = await apiFetch('/notes', {
    method: 'POST',
    body: { title: 'phase13 html', content: '<p>direct</p>', format: 'html' }
  });
  assert(htmlNote.status === 201, 'Explicit format=html returns 201');
  assert(htmlNote.data?.data?.format === 'html', 'Format=html persisted');
  if (htmlNote.data?.data?.id) createdNoteIds.push(htmlNote.data.data.id);

  const badFormat = await apiFetch('/notes', {
    method: 'POST',
    body: { title: 'bad', format: 'word' }
  });
  assert(badFormat.status === 400, 'Invalid format value rejected');

  console.log('\nGET returns format:');
  const fetchHtml = await apiFetch(`/notes/${htmlNote.data.data.id}`);
  assert(fetchHtml.status === 200, 'GET note succeeds');
  assert(fetchHtml.data?.data?.format === 'html', 'GET response includes format=html');

  console.log('\nImport endpoint — markdown file:');
  const mdBlob = new Blob([MD_DOC], { type: 'text/markdown' });
  mdBlob.name = 'sample.md';
  const mdFile = new File([mdBlob], 'sample.md', { type: 'text/markdown' });
  const mdImport = await uploadFile('/notes/import', mdFile);
  assert(mdImport.status === 201, 'Markdown import returns 201');
  assert(mdImport.data?.data?.format === 'markdown', 'Markdown import has format=markdown');
  assert(mdImport.data?.data?.title === 'sample', 'Markdown title falls back to filename');
  if (mdImport.data?.data?.id) createdNoteIds.push(mdImport.data.data.id);

  console.log('\nImport endpoint — html file (full document):');
  const htmlFile = new File([HTML_DOC], 'mydoc.html', { type: 'text/html' });
  const htmlImport = await uploadFile('/notes/import', htmlFile);
  assert(htmlImport.status === 201, 'HTML import returns 201');
  assert(htmlImport.data?.data?.format === 'html', 'HTML import has format=html');
  assert(htmlImport.data?.data?.title === 'Imported Document', 'Title pulled from <title> tag');
  if (htmlImport.data?.data?.id) {
    createdNoteIds.push(htmlImport.data.data.id);
    const fetched = await apiFetch(`/notes/${htmlImport.data.data.id}`);
    const body = fetched.data?.data?.content || '';
    assert(!/<head\b/i.test(body), 'Body normalization stripped <head>');
    assert(!/<!DOCTYPE/i.test(body), 'Body normalization stripped doctype');
    assert(/<h1>Hello<\/h1>/.test(body), 'Body content preserved');
    assert(/<style[^>]*>[^<]*c-teal/.test(body), 'Head <style> blocks preserved (prepended to body)');
  }

  console.log('\nImport endpoint — html fragment:');
  const fragFile = new File([HTML_FRAGMENT], 'fragment.html', { type: 'text/html' });
  const fragImport = await uploadFile('/notes/import', fragFile);
  assert(fragImport.status === 201, 'HTML fragment import returns 201');
  assert(fragImport.data?.data?.title === 'fragment', 'Fragment without <title> falls back to filename');
  if (fragImport.data?.data?.id) createdNoteIds.push(fragImport.data.data.id);

  console.log('\nImport endpoint — title override:');
  const overrideFile = new File([HTML_DOC], 'mydoc.html', { type: 'text/html' });
  const overrideImport = await uploadFile('/notes/import', overrideFile, { title: 'Custom Title' });
  assert(overrideImport.data?.data?.title === 'Custom Title', 'Explicit title overrides <title> tag');
  if (overrideImport.data?.data?.id) createdNoteIds.push(overrideImport.data.data.id);

  console.log('\nImport endpoint — rejects unsupported types:');
  const binFile = new File([Buffer.from([0x00, 0x01, 0x02])], 'thing.bin', { type: 'application/octet-stream' });
  const binImport = await uploadFile('/notes/import', binFile);
  assert(binImport.status === 400, 'Unsupported MIME rejected with 400');

  const noFile = await fetch(`${BASE}/notes/import`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: new FormData()
  });
  assert(noFile.status === 400, 'Missing file rejected with 400');

  console.log('\nFormat round-trip via PUT:');
  const flipNote = await apiFetch('/notes', {
    method: 'POST',
    body: { title: 'flip', content: '# md', format: 'markdown' }
  });
  if (flipNote.data?.data?.id) {
    createdNoteIds.push(flipNote.data.data.id);
    const flipped = await apiFetch(`/notes/${flipNote.data.data.id}`, {
      method: 'PUT',
      body: { content: '<p>now html</p>', format: 'html' }
    });
    assert(flipped.data?.data?.format === 'html', 'PUT can flip format markdown→html');
  }

  console.log('\nCleanup:');
  for (const id of createdNoteIds) {
    await apiFetch(`/notes/${id}`, { method: 'DELETE' });
    await apiFetch(`/notes/${id}/permanent`, { method: 'DELETE' });
  }
  console.log(`  Cleaned up ${createdNoteIds.length} test notes`);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
