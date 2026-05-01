-- Migration: 017_vault.sql
-- Created: 2026-04-30
-- Description: Encrypted password & key vault (CR020).
--              Strict zero-knowledge: server only stores ciphertext.
--              Master password / vault key never leave the client.

CREATE TABLE IF NOT EXISTS vault_meta (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kdf_salt             BYTEA NOT NULL,
  kdf_params           JSONB NOT NULL,
  verifier_ciphertext  BYTEA NOT NULL,
  verifier_iv          BYTEA NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ciphertext  BYTEA NOT NULL,
  iv          BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vault_entries_user_idx
  ON vault_entries (user_id, updated_at DESC);
