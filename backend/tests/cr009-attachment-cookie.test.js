/**
 * CR009 — attachments authenticate with an HttpOnly cookie, not ?token= in the URL.
 * Run: node backend/tests/cr009-attachment-cookie.test.js
 * Requires: backend on :3001, dev user seeded.
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

// Returns { token, cookie, refresh, setCookies } — cookie is "attachmentToken=<jwt>".
async function login(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const setCookies = res.headers.getSetCookie();
  const pick = (name) => setCookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0];
  return { token: (await res.json()).data?.accessToken, cookie: pick('attachmentToken'), refresh: pick('refreshToken'), setCookies };
}

const get = (id, headers = {}, query = '') => fetch(`${BASE}/attachments/${id}${query}`, { headers });

const RUN = Date.now().toString(36);
const OTHER = `cr009-${RUN}`;
const cleanup = [];

async function run() {
  console.log('\n=== CR009 — attachment cookie ===\n');
  const dev = await login('dev', 'password123');
  assert(dev.token, 'dev logs in');
  const attCookie = dev.setCookies.find((c) => c.startsWith('attachmentToken='));
  assert(attCookie && /HttpOnly/i.test(attCookie) && /SameSite=Strict/i.test(attCookie) && /Path=\/api\/v1\/attachments/i.test(attCookie),
    'login sets attachmentToken: HttpOnly, SameSite=Strict, Path=/api/v1/attachments');

  await pool.query('INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)',
    [OTHER, `${OTHER}@example.com`, await bcrypt.hash('pw-other', 4)]);
  const other = await login(OTHER, 'pw-other');
  assert(other.cookie, 'second user gets its own cookie');

  const auth = { Authorization: `Bearer ${dev.token}` };
  const note = (await (await fetch(`${BASE}/notes`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `CR009 ${RUN}`, content: '' })
  })).json()).data;
  cleanup.push(note.id);
  const fd = new FormData();
  fd.append('file', new File(['hello'], 'x.txt', { type: 'text/plain' }));
  const att = (await (await fetch(`${BASE}/notes/${note.id}/attachments`, { method: 'POST', headers: auth, body: fd })).json()).data;

  console.log('\nServing:');
  const own = await get(att.id, { Cookie: dev.cookie });
  assert(own.status === 200, 'own cookie → 200');
  assert(own.headers.get('cache-control') === 'private, no-cache', 'Cache-Control: private, no-cache (no credential in the URL)');
  assert((await get(att.id, auth)).status === 200, 'Bearer header still → 200 (clipper, fetch callers)');
  assert((await get(att.id, { Cookie: other.cookie })).status === 404, "another user's cookie → 404");
  assert((await get(att.id, {}, `?token=${dev.token}`)).status === 401, '?token= in the URL is no longer accepted → 401');
  assert((await get(att.id, { Cookie: 'attachmentToken=garbage' })).status === 401, 'garbage cookie → 401');
  assert((await get(att.id)).status === 401, 'no credentials → 401');

  console.log('\nScope:');
  const cookieValue = dev.cookie.split('=').slice(1).join('=');
  const asBearer = await fetch(`${BASE}/notes`, { headers: { Authorization: `Bearer ${cookieValue}` } });
  assert(asBearer.status === 401, 'the cookie token is not accepted as a Bearer token elsewhere → 401');

  console.log('\nRefresh + logout:');
  const ref = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { Cookie: dev.refresh } });
  assert(ref.status === 200 && ref.headers.getSetCookie().some((c) => c.startsWith('attachmentToken=')), 'refresh renews the cookie');
  const bad = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { Cookie: 'refreshToken=garbage' } });
  assert(bad.status === 401 && bad.headers.getSetCookie().some((c) => c.startsWith('attachmentToken=') && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)),
    'a rejected refresh clears the cookie');
  const out = await fetch(`${BASE}/auth/logout`, { method: 'POST' });
  const cleared = out.headers.getSetCookie().find((c) => c.startsWith('attachmentToken='));
  assert(cleared && /Path=\/api\/v1\/attachments/i.test(cleared) && /(Max-Age=0|Expires=Thu, 01 Jan 1970)/i.test(cleared), 'logout clears the cookie');

  await fetch(`${BASE}/attachments/${att.id}`, { method: 'DELETE', headers: auth });
}

run()
  .catch((err) => { console.error(err); failed++; })
  .finally(async () => {
    const auth = { Authorization: `Bearer ${(await login('dev', 'password123')).token}` };
    for (const id of cleanup) {
      await fetch(`${BASE}/notes/${id}`, { method: 'DELETE', headers: auth });
      await fetch(`${BASE}/notes/${id}/permanent`, { method: 'DELETE', headers: auth });
    }
    await pool.query('DELETE FROM users WHERE username = $1', [OTHER]).catch(() => {});
    await pool.end();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
