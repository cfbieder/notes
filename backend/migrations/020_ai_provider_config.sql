-- Migration: 020_ai_provider_config.sql
-- Created: 2026-08-30
-- Description: CR038 Phase 1 — per-user pluggable AI provider configuration.
--   One row per (user, capability). Provider API keys are stored ONLY as
--   AES-256-GCM ciphertext (iv||tag||ciphertext in key_encrypted); the master
--   key lives solely in the AI_KEYS_ENC_KEY env var, never in this table or a
--   DB backup. No plaintext keys, ever (unlike the legacy Google-token table).
--   Safe to apply early: creating the table changes no behavior — resolution
--   falls back to the existing LLM_* env / gateway path until rows exist.

CREATE TABLE IF NOT EXISTS ai_provider_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which AI feature this row configures.
  capability     TEXT NOT NULL CHECK (capability IN
                   ('text','ocr','translation','transcription','embeddings')),
  -- The adapter to use. 'gateway' preserves today's /task behavior;
  -- 'openai_compatible' covers Ollama and generic OpenAI-compatible servers.
  provider       TEXT NOT NULL CHECK (provider IN
                   ('gateway','anthropic','openai','openai_compatible')),
  -- Base URL for self-hosted / gateway / openai_compatible providers.
  -- Ignored for anthropic/openai (their SDK base URLs are fixed).
  base_url       TEXT,
  -- Per-capability model settings. For 'text' this holds the tier map,
  -- e.g. {"quick":"...","deep":"...","condense":"..."}; other capabilities
  -- use {"model":"..."}. JSONB so the shape can grow without a migration.
  model_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- AES-256-GCM encrypted API key: iv(12) || tag(16) || ciphertext.
  -- NULL when the provider needs no key (e.g. gateway/local without auth).
  key_encrypted  BYTEA,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One config per capability per user (scoped uniqueness — no global row).
  UNIQUE (user_id, capability)
);

CREATE INDEX IF NOT EXISTS ai_provider_config_user_idx
  ON ai_provider_config(user_id);
