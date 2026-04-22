/**
 * System Stats API Tests
 * Run: node backend/tests/system-stats.test.js
 * Requires: backend running on port 3001, dev user seeded
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
  console.log('\n=== System Stats API Tests ===\n');

  console.log('Auth:');
  const loginRes = await apiFetch('/auth/login', {
    method: 'POST',
    body: { username: 'dev', password: 'password123' }
  });
  token = loginRes.data?.data?.accessToken;
  assert(loginRes.status === 200 && token, 'Login succeeds');
  if (!token) { console.error('Cannot continue without token'); process.exit(1); }

  console.log('\nUnauth:');
  const unauthRes = await fetch(`${BASE}/system/stats`);
  assert(unauthRes.status === 401, 'Unauthenticated request returns 401');

  console.log('\nGET /system/stats:');
  const res = await apiFetch('/system/stats');
  assert(res.status === 200, 'Returns 200');
  const d = res.data?.data;
  assert(d != null, 'Has data envelope');

  // Storage
  assert(typeof d.storage?.attachments_bytes === 'number', 'storage.attachments_bytes is number');
  assert(typeof d.storage?.attachments_path === 'string', 'storage.attachments_path is string');
  assert(d.storage?.db_size_bytes === null || typeof d.storage?.db_size_bytes === 'number', 'storage.db_size_bytes is number or null');
  assert(d.storage?.disk_total_bytes === null || typeof d.storage?.disk_total_bytes === 'number', 'storage.disk_total_bytes is number or null');
  assert(d.storage?.disk_free_bytes === null || typeof d.storage?.disk_free_bytes === 'number', 'storage.disk_free_bytes is number or null');

  // Content
  assert(typeof d.content?.notes === 'number', 'content.notes is number');
  assert(typeof d.content?.ideas === 'number', 'content.ideas is number');
  assert(typeof d.content?.tasks_open === 'number', 'content.tasks_open is number');
  assert(typeof d.content?.tasks_done === 'number', 'content.tasks_done is number');
  assert(typeof d.content?.attachments === 'number', 'content.attachments is number');
  assert(typeof d.content?.attachments_ocr === 'number', 'content.attachments_ocr is number');
  assert(typeof d.content?.tags === 'number', 'content.tags is number');

  // Server
  assert(typeof d.server?.node_version === 'string' && d.server.node_version.startsWith('v'), 'server.node_version starts with v');
  assert(typeof d.server?.uptime_seconds === 'number' && d.server.uptime_seconds >= 0, 'server.uptime_seconds is non-negative');
  assert(typeof d.server?.memory_rss_bytes === 'number' && d.server.memory_rss_bytes > 0, 'server.memory_rss_bytes is positive');

  // Integrations
  assert(typeof d.integrations?.llm_enabled === 'boolean', 'integrations.llm_enabled is boolean');
  assert(typeof d.integrations?.llm_gateway_url === 'string', 'integrations.llm_gateway_url is string');
  assert(typeof d.integrations?.google_drive_connected === 'boolean', 'integrations.google_drive_connected is boolean');

  // Backup
  assert(typeof d.backup?.dir === 'string', 'backup.dir is string');
  assert(typeof d.backup?.count === 'number', 'backup.count is number');

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch(err => { console.error(err); process.exit(1); });
