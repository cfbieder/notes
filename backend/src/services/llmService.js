const fs = require('fs/promises');
const path = require('path');

// Thin client for the local LLM gateway. Currently only exposes OCR (Phase 7);
// Phase 8 will expand this to embeddings, generation, transcription, etc.
//
// Env:
//   LLM_GATEWAY_URL — base URL (default: http://100.66.213.40:8080)
//   LLM_ENABLED     — "false" disables all calls; features degrade gracefully
//   LLM_OCR_TIMEOUT_MS — per-request timeout (default 120s)

const GATEWAY_URL = (process.env.LLM_GATEWAY_URL || 'http://100.66.213.40:8080').replace(/\/$/, '');
const ENABLED = process.env.LLM_ENABLED !== 'false';
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
      headers: { 'Content-Type': 'application/json' },
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

module.exports = { ocrFile, isOcrCandidate, isEnabled, translateText, transcribeAudio, isAudioCandidate };
