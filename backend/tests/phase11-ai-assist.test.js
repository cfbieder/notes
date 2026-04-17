/**
 * Phase 11 — AI Assist API Tests
 * Run: node backend/tests/phase11-ai-assist.test.js
 * Requires: backend on port 3001, dev user seeded.
 *
 * The /generate endpoint hits the local LLM gateway. If the gateway is
 * unreachable we accept a 502 as a "wired up correctly" signal — the goal
 * here is to validate the route, auth, validation, and source-note plumbing,
 * not LLM quality.
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
  console.log('\n=== Phase 11 AI Assist API Tests ===\n');

  console.log('Auth:');
  const login = await api('/auth/login', {
    method: 'POST',
    body: { username: 'dev', password: 'password123' }
  });
  token = login.data?.data?.accessToken;
  assert(login.status === 200 && token, 'Login succeeds');
  if (!token) process.exit(1);

  // Seed two source notes for the AI to read.
  console.log('\nSeed source notes:');
  const noteA = await api('/notes', {
    method: 'POST',
    body: { title: 'Memo A — Q1 strategy', content: 'We will focus on retention and reduce ad spend by 20%.' }
  });
  const noteB = await api('/notes', {
    method: 'POST',
    body: { title: 'Memo B — engineering plan', content: 'Migrate auth to JWT and ship the new search index.' }
  });
  const noteAId = noteA.data?.data?.id;
  const noteBId = noteB.data?.data?.id;
  assert(noteAId, 'Source note A created');
  assert(noteBId, 'Source note B created');
  if (noteAId) cleanup.push(noteAId);
  if (noteBId) cleanup.push(noteBId);

  // --- Test: config endpoint ---
  console.log('\nGET /ai-assist/config:');
  const cfg = await api('/ai-assist/config');
  assert(cfg.status === 200, 'Config returns 200');
  assert(typeof cfg.data?.data?.contextWindow === 'number', 'Config returns contextWindow');
  assert(typeof cfg.data?.data?.warnTokens === 'number', 'Config returns warnTokens');
  assert(typeof cfg.data?.data?.enabled === 'boolean', 'Config returns enabled flag');

  // --- Test: estimate endpoint ---
  console.log('\nPOST /ai-assist/estimate:');
  const est = await api('/ai-assist/estimate', {
    method: 'POST',
    body: { prompt: 'Summarize the key points', noteIds: [noteAId, noteBId] }
  });
  assert(est.status === 200, 'Estimate returns 200');
  assert(est.data?.data?.estimatedTokens > 0, 'Estimate returns positive token count');
  assert(est.data?.data?.characters > 0, 'Estimate returns character count');

  // Estimate with no notes should be smaller than estimate with notes.
  const estPromptOnly = await api('/ai-assist/estimate', {
    method: 'POST',
    body: { prompt: 'Summarize the key points' }
  });
  assert(
    estPromptOnly.data?.data?.estimatedTokens < est.data?.data?.estimatedTokens,
    'Adding source notes increases estimate'
  );

  // --- Test: generate validation ---
  console.log('\nPOST /ai-assist/generate validation:');
  const noPrompt = await api('/ai-assist/generate', { method: 'POST', body: {} });
  assert(noPrompt.status === 400, 'Rejects missing prompt');

  const emptyPrompt = await api('/ai-assist/generate', { method: 'POST', body: { prompt: '' } });
  assert(emptyPrompt.status === 400, 'Rejects empty prompt');

  // --- Test: generate happy path (or graceful 502/503 if gateway down) ---
  console.log('\nPOST /ai-assist/generate:');
  const gen = await api('/ai-assist/generate', {
    method: 'POST',
    body: {
      prompt: 'In one sentence, summarize the two memos.',
      noteIds: [noteAId, noteBId]
    }
  });
  assert(
    [200, 502, 503].includes(gen.status),
    `Generate returns 200/502/503 (got ${gen.status})`
  );
  if (gen.status === 200) {
    assert(typeof gen.data?.data?.output === 'string' && gen.data.data.output.length > 0, 'Output is a non-empty string');
    assert(Array.isArray(gen.data?.data?.sources), 'Sources is an array');
    assert(gen.data.data.sources.length === 2, 'Sources count matches selected notes');
    assert(gen.data.data.sources[0].id === noteAId, 'First source preserves user-selected order');
  } else {
    console.log(`  (LLM gateway unavailable — skipped output assertions, status=${gen.status})`);
  }

  // --- Test: ai_generated flag persists when saving a note ---
  console.log('\nSave AI-generated note:');
  const saved = await api('/notes', {
    method: 'POST',
    body: {
      title: 'AI: Summary of memos',
      content: 'Summary text…\n\n## Sources\n\n- [[Memo A — Q1 strategy]]\n- [[Memo B — engineering plan]]',
      is_ai_generated: true,
      ai_prompt: 'In one sentence, summarize the two memos.'
    }
  });
  assert(saved.status === 201, 'Saving AI note returns 201');
  assert(saved.data?.data?.is_ai_generated === true, 'is_ai_generated flag persisted');
  assert(saved.data?.data?.ai_prompt?.includes('summarize'), 'ai_prompt persisted');
  if (saved.data?.data?.id) cleanup.push(saved.data.data.id);

  // --- Test: backlinks created from wikilinks in saved AI note ---
  if (saved.data?.data?.id && noteAId) {
    console.log('\nWikilinks in AI note create backlinks:');
    const backlinks = await api(`/notes/${noteAId}/backlinks`);
    if (backlinks.status === 200) {
      const found = (backlinks.data?.data || []).some(b => b.id === saved.data.data.id);
      assert(found, 'AI note appears as a backlink for source note A');
    } else {
      console.log(`  (backlinks endpoint returned ${backlinks.status} — skipped)`);
    }
  }

  // --- Test: models endpoint ---
  console.log('\nGET /ai-assist/models:');
  const models = await api('/ai-assist/models');
  assert(models.status === 200, 'Models returns 200');
  assert(Array.isArray(models.data?.data), 'Models returns an array');

  // --- Test: model param accepted ---
  console.log('\nGenerate with explicit model:');
  const fastModel = (models.data?.data || []).find(m => /phi/i.test(m)) || (models.data?.data || [])[0];
  if (fastModel) {
    const genFast = await api('/ai-assist/generate', {
      method: 'POST',
      body: { prompt: 'Say hi in 3 words.', model: fastModel }
    });
    assert([200, 502, 503].includes(genFast.status), `Generate with model returns 200/502/503 (got ${genFast.status})`);
    if (genFast.status === 200) {
      assert(genFast.data?.data?.model === fastModel || genFast.data?.data?.model?.startsWith(fastModel.split(':')[0]),
        `Response model matches request (got ${genFast.data?.data?.model})`);
    }
  }

  // --- Test: condense flag ---
  console.log('\nGenerate with condense=true:');
  const genCondense = await api('/ai-assist/generate', {
    method: 'POST',
    body: {
      prompt: 'In one sentence, what are the two memos about?',
      noteIds: [noteAId, noteBId],
      condense: true
    }
  });
  assert([200, 502, 503].includes(genCondense.status), `Condense returns 200/502/503 (got ${genCondense.status})`);
  if (genCondense.status === 200) {
    assert(genCondense.data?.data?.condensed === true, 'Response indicates condensed=true');
  }

  // --- Test: streaming endpoint ---
  console.log('\nStreaming generate:');
  const streamRes = await fetch(`${BASE}/ai-assist/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: 'Reply with one short sentence.',
      stream: true
    })
  });
  assert(streamRes.status === 200, `Stream returns 200 (got ${streamRes.status})`);
  assert(/ndjson/i.test(streamRes.headers.get('content-type') || ''), 'Stream content-type is NDJSON');

  if (streamRes.status === 200 && streamRes.body) {
    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let chunkCount = 0;
    let sawDone = false;
    let doneObj = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.chunk) chunkCount++;
          if (obj.done) { sawDone = true; doneObj = obj; }
        } catch {}
      }
    }
    assert(chunkCount > 0, `Received chunks (${chunkCount})`);
    assert(sawDone, 'Received done event');
    assert(doneObj?.model, 'Done event includes model');
  }

  // --- Test: unauthenticated ---
  console.log('\nUnauthenticated:');
  const unauth = await fetch(`${BASE}/ai-assist/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'hi' })
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
