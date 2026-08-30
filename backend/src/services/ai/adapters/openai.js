'use strict';

// OpenAI adapter — fixed api.openai.com base, API key required.

const chat = require('./openaiChat');

const BASE_URL = 'https://api.openai.com/v1';

function ctxFor(ctx) {
  return { ...ctx, baseUrl: BASE_URL, providerLabel: 'openai' };
}

module.exports = {
  generateText: (opts, ctx) => chat.generateText(opts, ctxFor(ctx)),
  generateTextStream: (opts, onChunk, ctx) => chat.generateTextStream(opts, onChunk, ctxFor(ctx)),
  testConnection: (ctx) => chat.testConnection(ctxFor(ctx)),
  requiresKey: true
};
