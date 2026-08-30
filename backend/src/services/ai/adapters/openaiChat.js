'use strict';

// OpenAI Chat Completions wire format — shared by the `openai` adapter (fixed
// api.openai.com base, key required) and `openai_compatible` (user base URL,
// key optional; Ollama/LM Studio/vLLM). Pure helpers (buildPayload / parse*)
// are exported for unit tests; the fetch functions accept an injectable
// fetchImpl via ctx so streaming can be tested with a fake Response.

const { streamSse } = require('./sse');
const { withTimeout, providerError } = require('./util');

function buildMessages(prompt, system) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  return messages;
}

function buildPayload({ prompt, system, model, maxTokens, temperature }, stream) {
  const payload = { model, messages: buildMessages(prompt, system), stream: !!stream };
  if (maxTokens) payload.max_tokens = maxTokens;
  if (temperature !== undefined) payload.temperature = temperature;
  if (stream) payload.stream_options = { include_usage: true };
  return payload;
}

function parseNonStream(json) {
  const choice = json && Array.isArray(json.choices) ? json.choices[0] : null;
  return {
    text: (choice && choice.message && choice.message.content) || '',
    model: json && json.model,
    provider: 'openai',
    disclaimer: null,
    promptTokens: (json && json.usage && json.usage.prompt_tokens) || null,
    completionTokens: (json && json.usage && json.usage.completion_tokens) || null
  };
}

// Parse one SSE `data:` payload → { text, model?, usage? }. Never throws.
function parseStreamChunk(dataStr) {
  let obj;
  try { obj = JSON.parse(dataStr); } catch { return { text: '' }; }
  const choice = Array.isArray(obj.choices) ? obj.choices[0] : null;
  return {
    text: (choice && choice.delta && choice.delta.content) || '',
    model: obj.model,
    usage: obj.usage || null
  };
}

function endpoint(ctx) {
  return `${(ctx.baseUrl || '').replace(/\/$/, '')}/chat/completions`;
}

function headers(ctx) {
  const h = { 'Content-Type': 'application/json' };
  if (ctx.apiKey) h['Authorization'] = `Bearer ${ctx.apiKey}`;
  return h;
}

async function generateText(opts, ctx) {
  const fetchImpl = ctx.fetchImpl || fetch;
  const label = ctx.providerLabel || 'openai';
  const { signal, cleanup } = withTimeout(opts.signal, opts.timeoutMs);
  try {
    const res = await fetchImpl(endpoint(ctx), {
      method: 'POST', headers: headers(ctx),
      body: JSON.stringify(buildPayload(opts, false)), signal
    });
    if (!res.ok) throw providerError(label, res.status);
    const parsed = parseNonStream(await res.json());
    parsed.provider = label;
    return parsed;
  } finally {
    cleanup();
  }
}

async function generateTextStream(opts, onChunk, ctx) {
  const fetchImpl = ctx.fetchImpl || fetch;
  const label = ctx.providerLabel || 'openai';
  const { signal, cleanup } = withTimeout(opts.signal, opts.timeoutMs);
  let fullText = '';
  let model = opts.model;
  let usage = null;
  try {
    const res = await fetchImpl(endpoint(ctx), {
      method: 'POST', headers: headers(ctx),
      body: JSON.stringify(buildPayload(opts, true)), signal
    });
    if (!res.ok) throw providerError(label, res.status);
    await streamSse(res, (data) => {
      const { text, model: m, usage: u } = parseStreamChunk(data);
      if (m) model = m;
      if (u) usage = u;
      if (text) { fullText += text; try { onChunk(text); } catch { /* ignore */ } }
    });
    return {
      text: fullText, model,
      promptTokens: usage ? usage.prompt_tokens : null,
      completionTokens: usage ? usage.completion_tokens : null
    };
  } finally {
    cleanup();
  }
}

// Lightweight reachability probe: list models. Returns { ok, message }.
async function testConnection(ctx) {
  const fetchImpl = ctx.fetchImpl || fetch;
  const label = ctx.providerLabel || 'openai';
  const { signal, cleanup } = withTimeout(null, 10_000);
  try {
    const res = await fetchImpl(`${(ctx.baseUrl || '').replace(/\/$/, '')}/models`, {
      method: 'GET', headers: headers(ctx), signal
    });
    return { ok: res.ok, message: res.ok ? `${label} reachable` : `${label} returned HTTP ${res.status}` };
  } catch {
    return { ok: false, message: `${label} not reachable` };
  } finally {
    cleanup();
  }
}

module.exports = {
  buildPayload, parseNonStream, parseStreamChunk,
  generateText, generateTextStream, testConnection
};
