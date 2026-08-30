'use strict';

// CR038 — per-user AI provider configuration endpoints.
//   GET    /api/v1/ai-providers            → list this user's configs (no keys)
//   PUT    /api/v1/ai-providers/:capability → create/update one capability
//   DELETE /api/v1/ai-providers/:capability → remove one capability
//   POST   /api/v1/ai-providers/:capability/test → validate + (gateway) probe
//
// Keys are write-only: never returned by any response. User-supplied base URLs
// are SSRF-validated before they are stored or tested.

const providerConfig = require('../services/ai/providerConfig');
const aiCrypto = require('../utils/aiProviderCrypto');
const { assertSafeProviderUrl } = require('../utils/ssrfGuard');
const llmService = require('../services/llmService');
const adapters = require('../services/ai/adapters');

// base_url only means something for these providers; anthropic/openai use the
// SDK's fixed endpoints, so we ignore (null) any base_url sent for them.
const BASE_URL_PROVIDERS = new Set(['gateway', 'openai_compatible']);

function badRequest(reply, message) {
  return reply.code(400).send({ error: 'Bad Request', message, statusCode: 400 });
}

async function routes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  // List configs (sanitized — no keys).
  fastify.get('/', async (request) => {
    const configs = await providerConfig.listConfigs(fastify.db, request.user.id);
    return { data: configs };
  });

  // Create/update one capability's config.
  fastify.put('/:capability', async (request, reply) => {
    const userId = request.user.id;
    const { capability } = request.params;
    const body = request.body || {};

    if (!providerConfig.CAPABILITIES.includes(capability)) {
      return badRequest(reply, `Unknown capability: ${capability}`);
    }
    const { provider } = body;
    if (!providerConfig.PROVIDERS.includes(provider)) {
      return badRequest(reply, `Unknown provider: ${provider}`);
    }
    if (body.modelConfig !== undefined &&
        (typeof body.modelConfig !== 'object' || body.modelConfig === null || Array.isArray(body.modelConfig))) {
      return badRequest(reply, 'modelConfig must be an object');
    }

    // base_url: only relevant for gateway / openai_compatible; SSRF-validate it.
    let baseUrl = null;
    if (BASE_URL_PROVIDERS.has(provider) && body.baseUrl) {
      try {
        await assertSafeProviderUrl(body.baseUrl);
      } catch (err) {
        return badRequest(reply, `Invalid base URL: ${err.message}`);
      }
      baseUrl = body.baseUrl;
    }

    // apiKey semantics: undefined = leave existing; '' or null = clear; else set.
    let apiKey;
    if ('apiKey' in body) {
      apiKey = (body.apiKey === '' || body.apiKey === null) ? null : String(body.apiKey);
    }
    if (typeof apiKey === 'string' && apiKey.length > 0 && !aiCrypto.isConfigured()) {
      return badRequest(reply, 'AI_KEYS_ENC_KEY is not configured on the server — cannot store an API key');
    }

    try {
      const saved = await providerConfig.upsertConfig(fastify.db, userId, capability, {
        provider, baseUrl, modelConfig: body.modelConfig || {}, apiKey
      });
      return { data: saved };
    } catch (err) {
      return badRequest(reply, err.message);
    }
  });

  // Remove one capability's config (falls back to env/gateway afterwards).
  fastify.delete('/:capability', async (request, reply) => {
    const { capability } = request.params;
    if (!providerConfig.CAPABILITIES.includes(capability)) {
      return badRequest(reply, `Unknown capability: ${capability}`);
    }
    await providerConfig.deleteConfig(fastify.db, request.user.id, capability);
    return reply.code(204).send();
  });

  // Test connection. Validates the (unsaved) config and, for the gateway,
  // probes health. Cloud provider live-probing arrives with the adapters;
  // until then this confirms validation only. Never leaks upstream bodies.
  fastify.post('/:capability/test', async (request, reply) => {
    const { capability } = request.params;
    const body = request.body || {};
    if (!providerConfig.CAPABILITIES.includes(capability)) {
      return badRequest(reply, `Unknown capability: ${capability}`);
    }
    const { provider } = body;
    if (!providerConfig.PROVIDERS.includes(provider)) {
      return badRequest(reply, `Unknown provider: ${provider}`);
    }

    if (BASE_URL_PROVIDERS.has(provider) && body.baseUrl) {
      try {
        await assertSafeProviderUrl(body.baseUrl);
      } catch (err) {
        return reply.code(400).send({ error: 'Bad Request', message: err.message, statusCode: 400 });
      }
    }

    if (provider === 'gateway') {
      const health = await llmService.getGatewayHealth();
      return { data: { ok: health != null, provider, message: health != null ? 'Gateway reachable' : 'Gateway not reachable' } };
    }

    // Cloud providers: real reachability probe. Uses the submitted key if
    // present, else the stored one. Returns generic pass/fail only — never the
    // upstream response body.
    const adapter = adapters.getAdapter(provider);
    let apiKey = ('apiKey' in body && body.apiKey) ? String(body.apiKey) : null;
    if (!apiKey) {
      const existing = await providerConfig.getRow(fastify.db, request.user.id, capability);
      apiKey = providerConfig.getDecryptedKey(existing);
    }
    if (adapter.requiresKey && !apiKey) {
      return badRequest(reply, 'An API key is required to test this provider');
    }
    try {
      const result = await adapter.testConnection({ baseUrl: body.baseUrl || null, apiKey });
      return { data: { ok: result.ok, provider, message: result.message } };
    } catch (err) {
      return { data: { ok: false, provider, message: err.message } };
    }
  });
}

module.exports = routes;
