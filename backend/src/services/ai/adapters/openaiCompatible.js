'use strict';

// OpenAI-compatible adapter — user-supplied base URL (Ollama /v1, LM Studio,
// vLLM, …). API key optional. The base URL is SSRF-validated before it is ever
// stored (see routes/aiProviders + utils/ssrfGuard).

const chat = require('./openaiChat');

function ctxFor(ctx) {
  return { ...ctx, providerLabel: 'openai_compatible' };
}

module.exports = {
  generateText: (opts, ctx) => chat.generateText(opts, ctxFor(ctx)),
  generateTextStream: (opts, onChunk, ctx) => chat.generateTextStream(opts, onChunk, ctxFor(ctx)),
  testConnection: (ctx) => chat.testConnection(ctxFor(ctx)),
  requiresKey: false
};
