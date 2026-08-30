/**
 * CR038 — cloud adapter tests (payload shaping, SSE parsing, auth, errors)
 * Run: node backend/tests/cr038-adapters.test.js
 * No network: fetch is stubbed via an injected fetchImpl; SSE bodies use the
 * global Response. Verifies the parts that must be right before a real key
 * is ever used.
 */

const openaiChat = require('../src/services/ai/adapters/openaiChat');
const anthropic = require('../src/services/ai/adapters/anthropic');
const registry = require('../src/services/ai/adapters');
const { streamSse } = require('../src/services/ai/adapters/sse');

let passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.error(`  ✗ ${name}`); failed++; }
}
async function rejects(p, name) {
  try { await p; assert(false, name + ' (should throw)'); } catch { assert(true, name); }
}
// A fetchImpl that records the call and returns a canned Response.
function fakeFetch(response, capture) {
  return async (url, init) => { if (capture) { capture.url = url; capture.init = init; } return response; };
}
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function sseResponse(text, status = 200) {
  return new Response(text, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

async function run() {
  console.log('\n=== CR038 Cloud Adapter Tests ===\n');

  console.log('SSE reader:');
  {
    const got = [];
    await streamSse(sseResponse('data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\n'), (d) => got.push(d));
    assert(got.length === 2 && got[0] === '{"a":1}' && got[1] === '{"a":2}', 'parses data lines, stops at [DONE]');
  }

  console.log('\nOpenAI payload/parse:');
  {
    const p = openaiChat.buildPayload({ prompt: 'hi', system: 'sys', model: 'm', maxTokens: 100, temperature: 0.5 }, false);
    assert(p.messages.length === 2 && p.messages[0].role === 'system', 'system message included');
    assert(p.max_tokens === 100 && p.temperature === 0.5, 'max_tokens + temperature forwarded');
    const s = openaiChat.buildPayload({ prompt: 'hi', model: 'm' }, true);
    assert(s.stream === true && s.stream_options && s.stream_options.include_usage === true, 'stream adds include_usage');
    assert(s.messages.length === 1, 'no system → single user message');
    const parsed = openaiChat.parseNonStream({ choices: [{ message: { content: 'out' } }], model: 'm', usage: { prompt_tokens: 3, completion_tokens: 7 } });
    assert(parsed.text === 'out' && parsed.promptTokens === 3 && parsed.completionTokens === 7, 'parseNonStream extracts text+usage');
    assert(openaiChat.parseStreamChunk('not json').text === '', 'bad JSON chunk → empty text (no throw)');
  }

  console.log('\nOpenAI generateText (mocked):');
  {
    const cap = {};
    const res = await openaiChat.generateText(
      { prompt: 'hi', model: 'gpt-x', maxTokens: 50 },
      { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-secret', providerLabel: 'openai', fetchImpl: fakeFetch(jsonResponse({ choices: [{ message: { content: 'hello' } }], model: 'gpt-x', usage: { prompt_tokens: 1, completion_tokens: 2 } }), cap) }
    );
    assert(res.text === 'hello' && res.provider === 'openai', 'returns text + provider');
    assert(cap.url === 'https://api.openai.com/v1/chat/completions', 'correct endpoint');
    assert(cap.init.headers['Authorization'] === 'Bearer sk-secret', 'Bearer auth header set');
  }

  console.log('\nOpenAI streaming (mocked):');
  {
    const chunks = [];
    const body = 'data: {"choices":[{"delta":{"content":"He"}}],"model":"gpt-x"}\n\n' +
                 'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n' +
                 'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":4,"completion_tokens":9}}\n\n' +
                 'data: [DONE]\n\n';
    const meta = await openaiChat.generateTextStream(
      { prompt: 'hi', model: 'gpt-x' },
      (c) => chunks.push(c),
      { baseUrl: 'https://api.openai.com/v1', apiKey: 'k', fetchImpl: fakeFetch(sseResponse(body)) }
    );
    assert(chunks.join('') === 'Hello', 'streamed chunks assemble to full text');
    assert(meta.text === 'Hello' && meta.completionTokens === 9, 'stream meta carries usage');
  }

  console.log('\nOpenAI error redaction:');
  {
    await rejects(
      openaiChat.generateText({ prompt: 'x', model: 'm' }, { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-leak', fetchImpl: fakeFetch(new Response('{"error":"bad key sk-leak"}', { status: 401 })) }),
      '4xx → throws'
    );
    try {
      await openaiChat.generateText({ prompt: 'x', model: 'm' }, { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-leak', fetchImpl: fakeFetch(new Response('body with sk-leak', { status: 401 })) });
    } catch (e) {
      assert(!e.message.includes('sk-leak') && e.message.includes('401'), 'error message has status, not key/body');
    }
  }

  console.log('\nAnthropic payload/parse:');
  {
    const p = anthropic.buildPayload({ prompt: 'hi', system: 'sys', model: 'claude-opus-5', temperature: 0.9 }, false);
    assert(p.max_tokens === 4096, 'default max_tokens applied');
    assert(!('temperature' in p), 'temperature is NOT sent to Anthropic (would 400 on Opus 5)');
    assert(p.system === 'sys' && p.messages[0].content === 'hi', 'system + user content set');
    const parsed = anthropic.parseNonStream({ content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }], model: 'claude-opus-5', usage: { input_tokens: 5, output_tokens: 6 } });
    assert(parsed.text === 'AB' && parsed.promptTokens === 5 && parsed.completionTokens === 6, 'joins text blocks + usage');
    assert(anthropic.parseStreamEvent('{"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}').text === 'x', 'content_block_delta → text');
  }

  console.log('\nAnthropic streaming + auth (mocked):');
  {
    const cap = {};
    const chunks = [];
    const body = 'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-opus-5","usage":{"input_tokens":11}}}\n\n' +
                 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n' +
                 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" there"}}\n\n' +
                 'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":22}}\n\n';
    const meta = await anthropic.generateTextStream(
      { prompt: 'hi', model: 'claude-opus-5' },
      (c) => chunks.push(c),
      { apiKey: 'sk-ant-xyz', fetchImpl: fakeFetch(sseResponse(body), cap) }
    );
    assert(chunks.join('') === 'Hi there', 'anthropic SSE assembles text');
    assert(meta.promptTokens === 11 && meta.completionTokens === 22, 'usage from message_start + message_delta');
    assert(cap.init.headers['x-api-key'] === 'sk-ant-xyz' && cap.init.headers['anthropic-version'], 'x-api-key + anthropic-version headers set');
  }

  console.log('\nRegistry model/tier resolution:');
  {
    assert(registry.getAdapter('openai') != null, 'getAdapter openai');
    assert(registry.getAdapter('openai_compatible') != null, 'getAdapter openai_compatible');
    let threw = false; try { registry.getAdapter('nope'); } catch { threw = true; }
    assert(threw, 'unknown provider throws');
    assert(registry.tierFor({ taskName: 'noted_ai_assist_deep' }) === 'deep', 'taskName → deep tier');
    assert(registry.resolveModel('anthropic', {}, { tier: 'deep' }) === 'claude-opus-5', 'anthropic deep default = claude-opus-5');
    assert(registry.resolveModel('anthropic', {}, { tier: 'quick' }) === 'claude-haiku-4-5', 'anthropic quick default = haiku');
    assert(registry.resolveModel('openai', { deep: 'gpt-x' }, { tier: 'deep' }) === 'gpt-x', 'openai uses configured model');
    let threw2 = false; try { registry.resolveModel('openai', {}, { tier: 'deep' }); } catch { threw2 = true; }
    assert(threw2, 'openai without a configured model throws (no guessed IDs)');
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
