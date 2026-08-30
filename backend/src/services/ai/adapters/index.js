'use strict';

// CR038 — cloud adapter registry + model/tier resolution.

const anthropic = require('./anthropic');
const openai = require('./openai');
const openaiCompatible = require('./openaiCompatible');

const ADAPTERS = {
  anthropic,
  openai,
  openai_compatible: openaiCompatible
};

// Default model IDs per provider/tier, used only when the user hasn't set one.
// Anthropic IDs are known-current (see claude-api guidance); we do NOT guess
// OpenAI / local model names, so those must be configured explicitly.
const DEFAULT_MODELS = {
  anthropic: { quick: 'claude-haiku-4-5', deep: 'claude-opus-5', condense: 'claude-haiku-4-5' }
};

function getAdapter(provider) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Unknown AI provider: ${provider}`);
  return adapter;
}

// Which tier a text call targets: explicit opts.tier wins, else infer from the
// AI-Assist task name, else default to quick.
function tierFor(opts) {
  if (opts && opts.tier) return opts.tier;
  if (opts && opts.taskName === 'noted_ai_assist_deep') return 'deep';
  if (opts && opts.taskName === 'noted_ai_assist_quick') return 'quick';
  return 'quick';
}

// Resolve the concrete model string for a cloud provider from the user's
// per-tier model map (falling back to {model} then provider defaults).
function resolveModel(provider, modelConfig, opts) {
  const tier = tierFor(opts);
  const configured = modelConfig && (modelConfig[tier] || modelConfig.model);
  if (configured) return configured;
  const def = DEFAULT_MODELS[provider] && DEFAULT_MODELS[provider][tier];
  if (def) return def;
  throw new Error(`No model configured for provider "${provider}" tier "${tier}" — set it in AI provider settings`);
}

module.exports = { getAdapter, resolveModel, tierFor, DEFAULT_MODELS };
