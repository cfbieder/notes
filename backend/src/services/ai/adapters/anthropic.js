'use strict';

// Anthropic adapter — native Messages API (not an OpenAI shim).
// Notes on correctness (per the claude-api guidance):
//   - auth via `x-api-key` + `anthropic-version` headers.
//   - `max_tokens` is REQUIRED; default when the caller omits it.
//   - do NOT send `temperature` — it is rejected (400) on Opus 5 / Sonnet 5.
//   - streaming is native SSE: content_block_delta (text_delta) for tokens,
//     message_start / message_delta carry usage.

const { streamSse } = require('./sse');
const { withTimeout, providerError } = require('./util');

const BASE_URL = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

function headers(ctx) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': ctx.apiKey || '',
    'anthropic-version': API_VERSION
  };
}

function buildPayload({ prompt, system, model, maxTokens }, stream) {
  const payload = {
    model,
    max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
    stream: !!stream
  };
  if (system) payload.system = system;
  // Deliberately no `temperature` — rejected on current Claude models.
  return payload;
}

function textFromContent(content) {
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('');
}

function parseNonStream(json) {
  return {
    text: textFromContent(json && json.content),
    model: json && json.model,
    provider: 'anthropic',
    disclaimer: null,
    promptTokens: (json && json.usage && json.usage.input_tokens) || null,
    completionTokens: (json && json.usage && json.usage.output_tokens) || null
  };
}

// Interpret one SSE `data:` payload → { text, model?, promptTokens?, completionTokens? }.
function parseStreamEvent(dataStr) {
  let obj;
  try { obj = JSON.parse(dataStr); } catch { return { text: '' }; }
  if (obj.type === 'content_block_delta' && obj.delta && obj.delta.type === 'text_delta') {
    return { text: obj.delta.text || '' };
  }
  if (obj.type === 'message_start' && obj.message) {
    return { text: '', model: obj.message.model, promptTokens: obj.message.usage && obj.message.usage.input_tokens };
  }
  if (obj.type === 'message_delta' && obj.usage) {
    return { text: '', completionTokens: obj.usage.output_tokens };
  }
  return { text: '' };
}

async function generateText(opts, ctx) {
  const fetchImpl = ctx.fetchImpl || fetch;
  const { signal, cleanup } = withTimeout(opts.signal, opts.timeoutMs);
  try {
    const res = await fetchImpl(`${BASE_URL}/messages`, {
      method: 'POST', headers: headers(ctx),
      body: JSON.stringify(buildPayload(opts, false)), signal
    });
    if (!res.ok) throw providerError('anthropic', res.status);
    return parseNonStream(await res.json());
  } finally {
    cleanup();
  }
}

async function generateTextStream(opts, onChunk, ctx) {
  const fetchImpl = ctx.fetchImpl || fetch;
  const { signal, cleanup } = withTimeout(opts.signal, opts.timeoutMs);
  let fullText = '';
  let model = opts.model;
  let promptTokens = null;
  let completionTokens = null;
  try {
    const res = await fetchImpl(`${BASE_URL}/messages`, {
      method: 'POST', headers: headers(ctx),
      body: JSON.stringify(buildPayload(opts, true)), signal
    });
    if (!res.ok) throw providerError('anthropic', res.status);
    await streamSse(res, (data) => {
      const ev = parseStreamEvent(data);
      if (ev.model) model = ev.model;
      if (ev.promptTokens != null) promptTokens = ev.promptTokens;
      if (ev.completionTokens != null) completionTokens = ev.completionTokens;
      if (ev.text) { fullText += ev.text; try { onChunk(ev.text); } catch { /* ignore */ } }
    });
    return { text: fullText, model, promptTokens, completionTokens };
  } finally {
    cleanup();
  }
}

async function testConnection(ctx) {
  const fetchImpl = ctx.fetchImpl || fetch;
  const { signal, cleanup } = withTimeout(null, 10_000);
  try {
    const res = await fetchImpl(`${BASE_URL}/models`, { method: 'GET', headers: headers(ctx), signal });
    return { ok: res.ok, message: res.ok ? 'anthropic reachable' : `anthropic returned HTTP ${res.status}` };
  } catch {
    return { ok: false, message: 'anthropic not reachable' };
  } finally {
    cleanup();
  }
}

module.exports = {
  buildPayload, parseNonStream, parseStreamEvent,
  generateText, generateTextStream, testConnection,
  requiresKey: true
};
