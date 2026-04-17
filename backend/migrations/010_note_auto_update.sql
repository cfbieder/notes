-- Migration: 010_note_auto_update.sql
-- Created: 2026-04-17
-- Description: Add auto_update flag to notes for Google Drive auto-update feature

ALTER TABLE notes ADD COLUMN IF NOT EXISTS auto_update BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for quickly finding auto-update candidates during Drive scans
CREATE INDEX IF NOT EXISTS notes_auto_update_idx ON notes (user_id, title)
  WHERE auto_update = TRUE AND deleted_at IS NULL;
