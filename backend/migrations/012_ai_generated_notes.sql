-- Migration: 012_ai_generated_notes.sql
-- Created: 2026-04-17
-- Description: Flag notes produced by the AI Assist feature and store the originating prompt.

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_prompt TEXT;

CREATE INDEX IF NOT EXISTS notes_is_ai_generated_idx
  ON notes(user_id, is_ai_generated)
  WHERE is_ai_generated = TRUE;
