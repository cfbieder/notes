/**
 * CR040 API Tests — Per-Note Checkbox Size
 * Run: node backend/tests/cr040-checkbox-size.test.js
 * Requires: backend running on port 3001, dev user seeded, migration 024 applied.
 */

const BASE = 'http://localhost:3001/api/v1';
let token = null;
let passed = 0;
let failed = 0;

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
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

async function run() {
  console.log('\nCR040 — checkbox size');
  const loginRes = await apiFetch('/auth/login', {
    method: 'POST',
    body: { username: 'dev', password: 'password123' }
  });
  token = loginRes.data?.data?.accessToken;
  assert(loginRes.status === 200 && token, 'Login succeeds');

  const created = await apiFetch('/notes', {
    method: 'POST',
    body: { title: 'CR040 checklist', content: '- [ ] one\n- [x] two' }
  });
  const id = created.data?.data?.id;
  assert(created.status === 201 && created.data.data.checkbox_size === 'sm', 'New note defaults to sm');

  const toLg = await apiFetch(`/notes/${id}`, { method: 'PUT', body: { checkbox_size: 'lg' } });
  assert(toLg.status === 200 && toLg.data.data.checkbox_size === 'lg', 'PUT sets checkbox_size to lg');

  const fetched = await apiFetch(`/notes/${id}`);
  assert(fetched.data?.data?.checkbox_size === 'lg', 'GET returns the saved size');

  const other = await apiFetch(`/notes/${id}`, { method: 'PUT', body: { title: 'CR040 renamed' } });
  assert(other.data?.data?.checkbox_size === 'lg', 'Unrelated PUT leaves size unchanged');

  const bad = await apiFetch(`/notes/${id}`, { method: 'PUT', body: { checkbox_size: 'xl' } });
  assert(bad.status === 400, 'Invalid size is rejected with 400');

  await apiFetch(`/notes/${id}`, { method: 'DELETE' });
  await apiFetch(`/notes/${id}/permanent`, { method: 'DELETE' });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
