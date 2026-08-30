/**
 * CR038 — AI provider settings API tests
 * Run: node backend/tests/cr038-ai-providers-api.test.js
 * Requires: backend running on port 3001 with AI_KEYS_ENC_KEY set, dev user seeded.
 */

const BASE = 'http://localhost:3001/api/v1';
let token = null;
let passed = 0, failed = 0;

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
  console.log('\n=== CR038 AI Providers API Tests ===\n');

  const login = await api('/auth/login', { method: 'POST', body: { username: 'dev', password: 'password123' } });
  token = login.data?.data?.accessToken;
  assert(login.status === 200 && token, 'Login succeeds');
  if (!token) { console.error('no token'); process.exit(1); }

  console.log('\nAuth required:');
  const noauth = await fetch(`${BASE}/ai-providers`);
  assert(noauth.status === 401, 'unauthenticated GET returns 401');

  console.log('\nList (empty-ish):');
  let list = await api('/ai-providers');
  assert(list.status === 200 && Array.isArray(list.data?.data), 'GET returns { data: [] }');

  console.log('\nPUT text with key:');
  const KEY = 'sk-cr038-test-DO-NOT-USE-1234567890';
  let put = await api('/ai-providers/text', {
    method: 'PUT',
    body: { provider: 'openai', modelConfig: { quick: 'm-mini', deep: 'm-big' }, apiKey: KEY }
  });
  assert(put.status === 200, 'PUT text → 200');
  assert(put.data?.data?.provider === 'openai', 'provider saved');
  assert(put.data?.data?.hasKey === true, 'hasKey true');
  assert(!JSON.stringify(put.data).includes(KEY), 'response does not leak the key');

  console.log('\nGET never leaks key:');
  list = await api('/ai-providers');
  assert(!JSON.stringify(list.data).includes(KEY), 'list response contains no plaintext key');
  const textCfg = list.data.data.find(c => c.capability === 'text');
  assert(textCfg && textCfg.hasKey === true, 'text config present with hasKey');

  console.log('\nUpdate without touching key:');
  put = await api('/ai-providers/text', {
    method: 'PUT',
    body: { provider: 'openai', modelConfig: { quick: 'm-mini', deep: 'm-huge' } } // no apiKey
  });
  assert(put.status === 200 && put.data.data.hasKey === true, 'key preserved when apiKey omitted');

  console.log('\nSSRF rejection on save:');
  let ssrf = await api('/ai-providers/ocr', {
    method: 'PUT',
    body: { provider: 'openai_compatible', baseUrl: 'http://169.254.169.254:11434' }
  });
  assert(ssrf.status === 400, 'base URL → cloud metadata IP rejected (400)');

  console.log('\nPublic base URL accepted:');
  let ok = await api('/ai-providers/ocr', {
    method: 'PUT',
    body: { provider: 'openai_compatible', baseUrl: 'https://api.openai.com', modelConfig: { model: 'x' } }
  });
  assert(ok.status === 200, 'public https base URL accepted');

  console.log('\nInvalid capability/provider:');
  assert((await api('/ai-providers/bogus', { method: 'PUT', body: { provider: 'openai' } })).status === 400,
    'unknown capability → 400');
  assert((await api('/ai-providers/text', { method: 'PUT', body: { provider: 'bogus' } })).status === 400,
    'unknown provider → 400');

  console.log('\nTest connection:');
  const tGw = await api('/ai-providers/text/test', { method: 'POST', body: { provider: 'gateway' } });
  assert(tGw.status === 200 && typeof tGw.data.data.ok === 'boolean', 'gateway test → boolean ok');
  const tSsrf = await api('/ai-providers/ocr/test', {
    method: 'POST', body: { provider: 'openai_compatible', baseUrl: 'http://127.0.0.1:11434' }
  });
  assert(tSsrf.status === 400, 'test rejects loopback base URL (SSRF)');

  console.log('\nDelete / cleanup:');
  assert((await api('/ai-providers/text', { method: 'DELETE' })).status === 204, 'DELETE text → 204');
  assert((await api('/ai-providers/ocr', { method: 'DELETE' })).status === 204, 'DELETE ocr → 204');
  list = await api('/ai-providers');
  assert(!list.data.data.some(c => ['text', 'ocr'].includes(c.capability)), 'configs removed');

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
