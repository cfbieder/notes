/**
 * Attachment serving — CSP sandbox (v0.27.1)
 * Run: node backend/tests/attachment-csp-sandbox.test.js
 * Requires: backend running on port 3001, dev user seeded.
 *
 * An SVG opened directly must not run script on the app origin, so every
 * non-PDF attachment is served with `Content-Security-Policy: sandbox`.
 * PDFs are exempt (Chrome won't render a PDF in a sandboxed frame — CR031 embeds).
 */

const BASE = 'http://localhost:3001/api/v1';
let token = null;
let cookie = null; // CR009: GET /attachments authenticates with the attachment cookie
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

async function upload(noteId, filename, type, body) {
  const fd = new FormData();
  fd.append('file', new File([body], filename, { type }));
  const res = await fetch(`${BASE}/notes/${noteId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  });
  return (await res.json()).data;
}

async function run() {
  console.log('\nAttachment CSP sandbox');
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dev', password: 'password123' })
  });
  token = (await login.json()).data?.accessToken;
  cookie = login.headers.getSetCookie().find((c) => c.startsWith('attachmentToken='))?.split(';')[0];
  assert(login.status === 200 && token, 'Login succeeds');

  const noteRes = await fetch(`${BASE}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: 'CSP sandbox test', content: '' })
  });
  const note = (await noteRes.json()).data;

  const svg = await upload(note.id, 'x.svg', 'image/svg+xml',
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const pdf = await upload(note.id, 'x.pdf', 'application/pdf', '%PDF-1.4\n%%EOF\n');

  const svgRes = await fetch(`${BASE}/attachments/${svg.id}`, { headers: { Cookie: cookie } });
  assert(svgRes.status === 200, 'SVG is served');
  assert(svgRes.headers.get('content-security-policy') === 'sandbox', 'SVG carries CSP sandbox');

  const pdfRes = await fetch(`${BASE}/attachments/${pdf.id}`, { headers: { Cookie: cookie } });
  assert(pdfRes.status === 200, 'PDF is served');
  assert(!pdfRes.headers.get('content-security-policy'), 'PDF is not sandboxed (inline embeds keep working)');

  // Clean up
  const auth = { Authorization: `Bearer ${token}` };
  for (const id of [svg.id, pdf.id]) await fetch(`${BASE}/attachments/${id}`, { method: 'DELETE', headers: auth });
  await fetch(`${BASE}/notes/${note.id}`, { method: 'DELETE', headers: auth });
  await fetch(`${BASE}/notes/${note.id}/permanent`, { method: 'DELETE', headers: auth });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
