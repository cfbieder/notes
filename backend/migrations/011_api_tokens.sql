-- Migration: 011_api_tokens.sql
-- Created: 2026-04-17
-- Description: Long-lived API tokens for script/CLI access (e.g. getDocs.sh)

CREATE TABLE IF NOT EXISTS api_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  last_used   TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_tokens_user_idx ON api_tokens(user_id);
