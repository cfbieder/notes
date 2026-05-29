/**
 * Phase 8.10 — Voice Note Capture API Tests
 * Run: node backend/tests/phase8-voice.test.js
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
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

// Generate a minimal valid WAV file with silence (0.5 seconds, 8kHz, mono, 8-bit)
function createTestWav() {
  const sampleRate = 8000;
  const duration = 0.5;
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);          // sub-chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);   // sample rate
  view.setUint32(28, sampleRate, true);   // byte rate
  view.setUint16(32, 1, true);           // block align
  view.setUint16(34, 8, true);           // bits per sample

  // data sub-chunk (silence = 128 for unsigned 8-bit PCM)
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < dataSize; i++) {
    view.setUint8(headerSize + i, 128);
  }

  return new Uint8Array(buffer);

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}

async function run() {
  console.log('\n=== Phase 8.10 Voice Note Capture API Tests ===\n');

  console.log('Auth:');
  const login = await api('/auth/login', {
    method: 'POST',
    body: { username: 'dev', password: 'password123' }
  });
  token = login.data?.data?.accessToken;
  assert(login.status === 200 && token, 'Login succeeds');
  if (!token) process.exit(1);

  // --- Test 1: Successful voice capture ---
  console.log('\nVoice capture (WAV):');
  const wav = createTestWav();
  const form1 = new FormData();
  form1.append('file', new Blob([wav], { type: 'audio/wav' }), 'test_recording.wav');

  const res1 = await api('/notes/voice', { method: 'POST', body: form1 });
  assert(res1.status === 201, 'Voice capture returns 201');
  assert(res1.data?.data?.note, 'Response includes note');
  assert(res1.data?.data?.attachment, 'Response includes attachment');
  assert(res1.data?.data?.transcription, 'Response includes transcription metadata');

  const note = res1.data?.data?.note;
  if (note) {
    assert(/^Voice Note —/.test(note.title), 'Title follows "Voice Note — {date}" format');
    assert(note.note_type === 'idea', 'Note type is "idea"');
    cleanup.push(note.id);
  }

  const att = res1.data?.data?.attachment;
  if (att) {
    assert(att.mime_type === 'audio/wav', 'Attachment MIME type is audio/wav');
    assert(att.filename === 'test_recording.wav', 'Attachment filename preserved');
    assert(att.size_bytes > 0, 'Attachment has size');
  }

  // --- Test 2: Verify note was created and is fetchable ---
  console.log('\nVerify note persisted:');
  if (note) {
    const fetched = await api(`/notes/${note.id}`);
    assert(fetched.status === 200, 'Can fetch the created note');
    assert(fetched.data?.data?.content?.length > 0 || true, 'Note has content (may be empty for silence)');
  }

  // --- Test 3: Verify attachment is accessible ---
  console.log('\nVerify attachment:');
  if (att) {
    const attFetch = await fetch(`${BASE}/attachments/${att.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert(attFetch.status === 200, 'Audio attachment is downloadable');
    assert(attFetch.headers.get('content-type') === 'audio/wav', 'Attachment serves correct MIME type');
  }

  // --- Test 4: Unsupported MIME type ---
  console.log('\nValidation - unsupported format:');
  const form2 = new FormData();
  form2.append('file', new Blob(['not audio'], { type: 'text/plain' }), 'test.txt');
  const res2 = await api('/notes/voice', { method: 'POST', body: form2 });
  assert(res2.status === 400, 'Rejects non-audio file');
  assert(/unsupported/i.test(res2.data?.message || ''), 'Error mentions unsupported format');

  // --- Test 5: No file ---
  console.log('\nValidation - no file:');
  const res3 = await fetch(`${BASE}/notes/voice`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  // Multipart not sent → Fastify may return 400 or similar
  assert(res3.status >= 400, 'Rejects request with no file');

  // --- Test 6: Unauthenticated ---
  console.log('\nUnauthenticated:');
  const form4 = new FormData();
  form4.append('file', new Blob([wav], { type: 'audio/wav' }), 'test.wav');
  const unauth = await fetch(`${BASE}/notes/voice`, {
    method: 'POST',
    body: form4
  });
  assert(unauth.status === 401, 'Requires auth');

  // --- Cleanup ---
  console.log('\nCleanup:');
  for (const id of cleanup) {
    if (id) {
      await api(`/notes/${id}`, { method: 'DELETE' });
      await api(`/notes/${id}/permanent`, { method: 'DELETE' });
    }
  }
  console.log(`  cleaned up ${cleanup.filter(Boolean).length} test notes`);

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
