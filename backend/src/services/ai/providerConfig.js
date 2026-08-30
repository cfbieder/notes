'use strict';

// CR038 — per-user AI provider configuration repository + resolution.
//
// Storage/access layer over the ai_provider_config table. Two hard rules:
//   1. API-facing reads NEVER include the API key — callers get `hasKey` only.
//      Decryption is a separate, explicit call (getDecryptedKey) used only by
//      adapters on the outbound path.
//   2. Resolution falls back to the existing env/gateway path when a user has no
//      row for a capability, so "unconfigured == exactly today" (no regression).

const aiCrypto = require('../../utils/aiProviderCrypto');

const CAPABILITIES = ['text', 'ocr', 'translation', 'transcription', 'embeddings'];
const PROVIDERS = ['gateway', 'anthropic', 'openai', 'openai_compatible'];

// Shape a DB row for API responses — deliberately omits key_encrypted.
function sanitize(row) {
  if (!row) return null;
  return {
    capability: row.capability,
    provider: row.provider,
    baseUrl: row.base_url || null,
    modelConfig: row.model_config || {},
    enabled: row.enabled,
    hasKey: row.key_encrypted != null,
    updatedAt: row.updated_at
  };
}

// All configs for a user, sanitized (safe to return from the API).
async function listConfigs(db, userId) {
  const { rows } = await db.query(
    'SELECT * FROM ai_provider_config WHERE user_id = $1 ORDER BY capability',
    [userId]
  );
  return rows.map(sanitize);
}

// Raw row for one capability (includes key_encrypted — internal use only).
async function getRow(db, userId, capability) {
  const { rows } = await db.query(
    'SELECT * FROM ai_provider_config WHERE user_id = $1 AND capability = $2',
    [userId, capability]
  );
  return rows[0] || null;
}

// Decrypt the stored key for a row, or null when none is stored.
// SECURITY: the return is a live API key — never log it.
function getDecryptedKey(row) {
  if (!row || row.key_encrypted == null) return null;
  return aiCrypto.decrypt(row.key_encrypted);
}

// Create or update the config for (user, capability).
// `apiKey` semantics: a non-empty string sets/replaces the key; `null` clears it;
// `undefined` leaves the existing key untouched.
async function upsertConfig(db, userId, capability, { provider, baseUrl, modelConfig, apiKey }) {
  if (!CAPABILITIES.includes(capability)) throw new Error(`Unknown capability: ${capability}`);
  if (!PROVIDERS.includes(provider)) throw new Error(`Unknown provider: ${provider}`);

  let keyClause = 'key_encrypted';        // default: keep existing on update
  const params = [userId, capability, provider, baseUrl || null, JSON.stringify(modelConfig || {})];

  if (apiKey === null) {
    keyClause = 'NULL';
  } else if (typeof apiKey === 'string' && apiKey.length > 0) {
    if (!aiCrypto.isConfigured()) {
      throw new Error('AI_KEYS_ENC_KEY is not configured — cannot store a provider API key');
    }
    params.push(aiCrypto.encrypt(apiKey));
    keyClause = `$${params.length}`;
  }

  const { rows } = await db.query(
    `INSERT INTO ai_provider_config (user_id, capability, provider, base_url, model_config, key_encrypted)
       VALUES ($1, $2, $3, $4, $5::jsonb, ${apiKey === undefined ? 'NULL' : keyClause})
     ON CONFLICT (user_id, capability) DO UPDATE SET
       provider     = EXCLUDED.provider,
       base_url     = EXCLUDED.base_url,
       model_config = EXCLUDED.model_config,
       key_encrypted = ${keyClause === 'key_encrypted' ? 'ai_provider_config.key_encrypted' : keyClause},
       updated_at   = NOW()
     RETURNING *`,
    params
  );
  return sanitize(rows[0]);
}

async function deleteConfig(db, userId, capability) {
  await db.query(
    'DELETE FROM ai_provider_config WHERE user_id = $1 AND capability = $2',
    [userId, capability]
  );
}

// Resolve the effective config for a capability. Returns a normalized descriptor
// the adapter layer consumes. When the user has no (enabled) row, falls back to
// the gateway/env path — preserving today's behavior.
//   { provider, baseUrl, modelConfig, source: 'db'|'env', row }
// `row` is the raw DB row (or null for env) so adapters can call getDecryptedKey.
async function resolveCapability(db, userId, capability) {
  const row = await getRow(db, userId, capability);
  if (row && row.enabled) {
    return {
      provider: row.provider,
      baseUrl: row.base_url || null,
      modelConfig: row.model_config || {},
      source: 'db',
      row
    };
  }
  // Env fallback: the existing gateway path, driven by LLM_* env vars.
  return { provider: 'gateway', baseUrl: null, modelConfig: {}, source: 'env', row: null };
}

module.exports = {
  CAPABILITIES,
  PROVIDERS,
  sanitize,
  listConfigs,
  getRow,
  getDecryptedKey,
  upsertConfig,
  deleteConfig,
  resolveCapability
};
