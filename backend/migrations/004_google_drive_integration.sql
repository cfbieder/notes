-- Migration: 004_google_drive_integration.sql
-- Created: 2026-04-11
-- Description: Google Drive integration config and import history

-- ============================================================
-- Integration config (stores OAuth tokens + folder config)
-- ============================================================
CREATE TABLE IF NOT EXISTS integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  access_token    TEXT,
  refresh_token   TEXT,
  token_expiry    TIMESTAMPTZ,
  config          JSONB NOT NULL DEFAULT '{}',
  enabled         BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE TRIGGER integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Import history log
-- ============================================================
CREATE TABLE IF NOT EXISTS import_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id  UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  drive_file_id   TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  mime_type       TEXT,
  note_id         UUID REFERENCES notes(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'success',
  error_message   TEXT,
  imported_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS import_history_user_idx ON import_history(user_id);
CREATE INDEX IF NOT EXISTS import_history_drive_file_idx ON import_history(drive_file_id);
CREATE INDEX IF NOT EXISTS import_history_imported_at_idx ON import_history(imported_at DESC);
