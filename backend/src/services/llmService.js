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

module.exports = { ocrFile, isOcrCandidate, isEnabled };
