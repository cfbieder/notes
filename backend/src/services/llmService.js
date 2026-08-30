const fs = require('fs/promises');
const path = require('path');
const providerConfig = require('./ai/providerConfig');
const adapters = require('./ai/adapters');

// Thin client for the local LLM gateway. Currently only exposes OCR (Phase 7);
// Phase 8 will expand this to embeddings, generation, transcription, etc.
//
// Env:
//   LLM_GATEWAY_URL — base URL (default: http://localhost:8080)
//   LLM_ENABLED     — "false" disables all calls; features degrade gracefully
//   LLM_OCR_TIMEOUT_MS — per-request timeout (default 120s)

const GATEWAY_URL = (process.env.LLM_GATEWAY_URL || 'http://localhost:8080').replace(/\/$/, '');
const ENABLED = process.env.LLM_ENABLED !== 'false';

// CR-020 (ocr-llm): client identity. The gateway records `client_id` only when
// BOTH headers are present and the key matches — an id sent on its own is
// discarded — so this returns the pair or nothing. No key configured => no
// headers => requests identical to today's, which is what makes it safe to
// deploy before the gateway enforces anything.
//
// Applies to every audited surface: /ocr, /translate, /transcribe, /task and
// /llm/generate. Deliberately NOT applied to /llm/models or /health, which the
// gateway exempts from auditing anyway.
const CLIENT_ID = 'noted';
const authHeaders = () => {
  const key = (process.env.OCR_LLM_CLIENT_KEY || '').trim();
  return key ? { 'X-Client-Id': CLIENT_ID, 'X-Client-Key': key } : {};
};
const OCR_TIMEOUT_MS = parseInt(process.env.LLM_OCR_TIMEOUT_MS, 10) || 120_000;
// Separate translate timeout so OCR (background, tolerant) and translate
// (synchronous on the clip request path) can be tuned independently. Kept
// below the nginx proxy timeout so we fail cleanly before the front door.
const TRANSLATE_TIMEOUT_MS = parseInt(process.env.LLM_TRANSLATE_TIMEOUT_MS, 10) || 150_000;

const OCR_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'
]);

function isOcrCandidate(mimeType) {
  return OCR_MIME_TYPES.has(mimeType);
}

function isEnabled() {
  return ENABLED;
}

async function ocrFile({ filePath, filename, mimeType }) {
  if (!ENABLED) return null;
  if (!isOcrCandidate(mimeType)) return null;

  const buffer = await fs.readFile(filePath);
  const blob = new Blob([buffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, filename || path.basename(filePath));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  try {
    const res = await fetch(`${GATEWAY_URL}/ocr`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OCR gateway ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    // Gateway returns { text: "..." } — fall back to common alternatives.
    return json.text || json.ocr_text || json.content || '';
  } finally {
    clearTimeout(timer);
  }
}

// Cap the length of text we will translate synchronously. Local LLM
// throughput is ~30-50 tokens/sec, so a full Wikipedia article would take
// many minutes and exceed both the translate timeout and the nginx proxy
// timeout. Truncate with a visible marker so users see why.
const TRANSLATE_MAX_CHARS = parseInt(process.env.LLM_TRANSLATE_MAX_CHARS, 10) || 8000;

async function translateText({ text, sourceLang, targetLang }) {
  if (!ENABLED) return null;
  if (!text || !sourceLang || !targetLang) return null;
  if (sourceLang === targetLang) return text;

  let input = text;
  let truncated = false;
  if (input.length > TRANSLATE_MAX_CHARS) {
    input = input.slice(0, TRANSLATE_MAX_CHARS);
    truncated = true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);

  try {
    const res = await fetch(`${GATEWAY_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text: input, source_lang: sourceLang, target_lang: targetLang }),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Translate gateway ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const out = json.translated_text || null;
    if (!out) return null;
    return truncated
      ? out + `\n\n_(translation truncated at ${TRANSLATE_MAX_CHARS} characters — original was ${text.length})_`
      : out;
  } finally {
    clearTimeout(timer);
  }
}

// Transcription timeout — Whisper on CPU can be slow for longer audio.
const TRANSCRIBE_TIMEOUT_MS = parseInt(process.env.LLM_TRANSCRIBE_TIMEOUT_MS, 10) || 300_000;

const AUDIO_MIME_TYPES = new Set([
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/wav',
  'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/flac', 'audio/aac',
  'audio/opus'
]);

function isAudioCandidate(mimeType) {
  return AUDIO_MIME_TYPES.has(mimeType);
}

async function transcribeAudio({ filePath, filename, mimeType }) {
  if (!ENABLED) return null;
  if (!isAudioCandidate(mimeType)) return null;

  const buffer = await fs.readFile(filePath);
  const blob = new Blob([buffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, filename || path.basename(filePath));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

  try {
    const res = await fetch(`${GATEWAY_URL}/transcribe`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Transcribe gateway ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    return {
      text: json.text || '',
      language: json.language || null,
      languageProbability: json.language_probability || null,
      duration: json.duration || null,
      segments: json.segments || null
    };
  } finally {
    clearTimeout(timer);
  }
}

// Text generation — used by AI Assist. Keep timeout well below nginx's
// proxy timeout so long prompts fail visibly instead of dropping the socket.
const GENERATE_TIMEOUT_MS = parseInt(process.env.LLM_GENERATE_TIMEOUT_MS, 10) || 180_000;
// Deep-think runs on ollama_heavy and can take several minutes. Separate
// timeout so quick-tier failures don't have to wait the heavy budget.
const GENERATE_DEEP_TIMEOUT_MS = parseInt(process.env.LLM_GENERATE_DEEP_TIMEOUT_MS, 10) || 600_000;
// Default to qwen3:32b — best quality model on the gateway. Override with
// LLM_GENERATION_MODEL if a faster/smaller model is preferred.
const GENERATE_MODEL = process.env.LLM_GENERATION_MODEL || 'qwen3:32b';
// Bridging defaults until ocr-llm ships noted_ai_assist_quick / _deep tasks.
// When LLM_TASK_ENABLED=true (set after server-side handoff is acknowledged),
// generateText/generateTextStream route via /task and ignore these names.
const QUICK_MODEL = process.env.LLM_QUICK_MODEL || 'phi4:14b';
const DEEP_MODEL = process.env.LLM_DEEP_MODEL || 'qwen3.6:35b-a3b-q4_K_M';
const TASK_ENABLED = process.env.LLM_TASK_ENABLED === 'true';
const CONTEXT_WINDOW_TOKENS = parseInt(process.env.LLM_CONTEXT_WINDOW, 10) || 32_000;

function getContextWindow() {
  return CONTEXT_WINDOW_TOKENS;
}

function getGenerationModel() {
  return GENERATE_MODEL;
}

function getQuickModel() {
  return QUICK_MODEL;
}

function getDeepModel() {
  return DEEP_MODEL;
}

function isTaskRoutingEnabled() {
  return TASK_ENABLED;
}

// Map a Noted-side task name to the corresponding bridging model when /task
// routing is disabled. Used by AI Assist while waiting for ocr-llm to ship
// noted_ai_assist_quick / noted_ai_assist_deep.
function bridgingModelForTask(taskName) {
  if (taskName === 'noted_ai_assist_deep') return DEEP_MODEL;
  if (taskName === 'noted_ai_assist_quick') return QUICK_MODEL;
  return null;
}

// generateText
//   { prompt, model?, taskName?, system?, maxTokens?, temperature?, signal?, timeoutMs? }
// When taskName is provided AND LLM_TASK_ENABLED=true, routes via POST /task
// (the gateway picks the model + fallback chain). Otherwise calls
// /llm/generate with the resolved model name (taskName is mapped to a
// bridging model name when /task is disabled).
async function gatewayGenerateText({ prompt, model, taskName, system, maxTokens, temperature, signal, timeoutMs }) {
  if (!ENABLED) return null;
  if (!prompt || typeof prompt !== 'string') return null;

  const useTask = TASK_ENABLED && taskName;
  const effectiveTimeout = timeoutMs || GENERATE_TIMEOUT_MS;

  // Compose an AbortSignal that fires on either the caller's signal or our
  // own timeout. AbortSignal.any is Node 22+; fall back to a manual bridge.
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), effectiveTimeout);
  const compositeSignal = signal
    ? (typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal)
    : timeoutController.signal;
  if (signal && typeof AbortSignal.any !== 'function') {
    signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
  }

  try {
    let url;
    let payload;
    if (useTask) {
      url = `${GATEWAY_URL}/task`;
      payload = { task: taskName, prompt };
      if (maxTokens) payload.max_tokens = maxTokens;
    } else {
      url = `${GATEWAY_URL}/llm/generate`;
      payload = {
        model: model || bridgingModelForTask(taskName) || GENERATE_MODEL,
        prompt,
        stream: false
      };
      if (system) payload.system = system;
      if (maxTokens) payload.max_tokens = maxTokens;
      if (temperature !== undefined) payload.temperature = temperature;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
      signal: compositeSignal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Generate gateway ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    // Gateway /task returns { response, model, provider, ... };
    // /llm/generate returns Ollama-style { response }. Cover both.
    const out = json.response || json.text || json.output || json.generated_text || json.completion || null;
    return {
      text: out,
      model: json.model || payload.model,
      provider: json.provider || null,
      disclaimer: json.disclaimer || null,
      promptTokens: json.prompt_eval_count || json.prompt_tokens || null,
      completionTokens: json.eval_count || json.completion_tokens || null
    };
  } finally {
    clearTimeout(timer);
  }
}

// Streaming variant — calls the gateway with stream=true and invokes
// onChunk(text) for each token as it arrives. Returns final metadata.
async function gatewayGenerateTextStream({ prompt, model, taskName, system, maxTokens, temperature }, onChunk) {
  if (!ENABLED) return null;
  if (!prompt || typeof prompt !== 'string') return null;

  const useTask = TASK_ENABLED && taskName;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

  try {
    let url;
    let payload;
    if (useTask) {
      url = `${GATEWAY_URL}/task`;
      payload = { task: taskName, prompt, stream: true };
      if (maxTokens) payload.max_tokens = maxTokens;
    } else {
      url = `${GATEWAY_URL}/llm/generate`;
      payload = {
        model: model || bridgingModelForTask(taskName) || GENERATE_MODEL,
        prompt,
        stream: true
      };
      if (system) payload.system = system;
      if (maxTokens) payload.max_tokens = maxTokens;
      if (temperature !== undefined) payload.temperature = temperature;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Generate gateway ${res.status}: ${body.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastMeta = {};
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          const piece = obj.response || obj.chunk || '';
          if (piece) {
            fullText += piece;
            try { onChunk(piece); } catch {}
          }
          if (obj.done) lastMeta = obj;
        } catch {
          // ignore non-JSON lines
        }
      }
    }

    return {
      text: fullText,
      model: lastMeta.model || payload.model,
      promptTokens: lastMeta.prompt_eval_count || null,
      completionTokens: lastMeta.eval_count || null
    };
  } finally {
    clearTimeout(timer);
  }
}

// --- Provider dispatch (CR038) -------------------------------------------
// The gateway* functions above are the built-in adapter (today's behavior).
// generateText / generateTextStream resolve the caller's per-user text provider
// and dispatch. With no userId/db (or no configured row) they fall back to the
// gateway path, so behavior is unchanged until a user configures a provider.

// Pure decision helper (exported for tests): which provider a resolved config
// selects for the text capability. Env/gateway/anything-not-cloud => 'gateway'.
function pickTextProvider(resolved) {
  if (resolved && resolved.source === 'db'
      && resolved.provider && resolved.provider !== 'gateway') {
    return resolved.provider;
  }
  return 'gateway';
}

async function resolveTextProvider(userId, db) {
  if (!userId || !db) return { provider: 'gateway', resolved: null };
  const resolved = await providerConfig.resolveCapability(db, userId, 'text');
  return { provider: pickTextProvider(resolved), resolved };
}

// Build everything a cloud adapter call needs: the adapter, the request
// context (base URL + decrypted key), and the resolved concrete model. The key
// is decrypted here on the outbound path only — never stored elsewhere.
function buildCloudCall(provider, resolved, rest) {
  const adapter = adapters.getAdapter(provider);
  const apiKey = providerConfig.getDecryptedKey(resolved.row);
  if (adapter.requiresKey && !apiKey) {
    throw new Error(`No API key configured for AI provider "${provider}"`);
  }
  const model = adapters.resolveModel(provider, resolved.modelConfig, rest);
  return { adapter, ctx: { baseUrl: resolved.baseUrl, apiKey }, model };
}

async function generateText(opts = {}) {
  if (!ENABLED) return null;
  const { userId, db, ...rest } = opts;
  const { provider, resolved } = await resolveTextProvider(userId, db);
  if (provider === 'gateway') return gatewayGenerateText(rest);
  const { adapter, ctx, model } = buildCloudCall(provider, resolved, rest);
  return adapter.generateText({ ...rest, model }, ctx);
}

async function generateTextStream(opts = {}, onChunk) {
  if (!ENABLED) return null;
  const { userId, db, ...rest } = opts;
  const { provider, resolved } = await resolveTextProvider(userId, db);
  if (provider === 'gateway') return gatewayGenerateTextStream(rest, onChunk);
  const { adapter, ctx, model } = buildCloudCall(provider, resolved, rest);
  return adapter.generateTextStream({ ...rest, model }, onChunk, ctx);
}

async function listModels() {
  if (!ENABLED) return [];
  try {
    const res = await fetch(`${GATEWAY_URL}/llm/models`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.models) ? json.models : [];
  } catch {
    return [];
  }
}

// Snapshot of gateway tier health. Used by /ai-assist/config so the AI Assist
// modal can warn the user when deep-think is falling through to a slower hop
// (e.g. ollama_heavy offline → claude). Best-effort: returns null on failure
// so a flaky gateway doesn't break the modal.
async function getGatewayHealth() {
  if (!ENABLED) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${GATEWAY_URL}/health`, { signal: controller.signal });
      if (!res.ok) return null;
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

module.exports = {
  ocrFile, isOcrCandidate, isEnabled,
  translateText,
  transcribeAudio, isAudioCandidate,
  generateText, generateTextStream, pickTextProvider,
  getContextWindow, getGenerationModel, getQuickModel, getDeepModel,
  isTaskRoutingEnabled,
  GENERATE_DEEP_TIMEOUT_MS,
  listModels,
  getGatewayHealth
};
