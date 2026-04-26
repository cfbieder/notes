-- Migration: 016_ai_assist_jobs.sql
-- Created: 2026-04-26
-- Description: Track async AI Assist deep-think jobs so users can close the
--              modal (or the tab) and have the result delivered to their
--              inbox when the LLM finishes.

CREATE TABLE IF NOT EXISTS ai_assist_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL CHECK (mode IN ('deep')),
  status         TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')),
  prompt         TEXT NOT NULL,
  note_ids       UUID[] NOT NULL DEFAULT '{}',
  condense       BOOLEAN NOT NULL DEFAULT FALSE,
  model          TEXT,
  result_note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_assist_jobs_user_active_idx
  ON ai_assist_jobs(user_id) WHERE status IN ('pending','running');

CREATE INDEX IF NOT EXISTS ai_assist_jobs_user_recent_idx
  ON ai_assist_jobs(user_id, created_at DESC);
