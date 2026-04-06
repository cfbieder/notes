-- Migration: 002_soft_delete.sql
-- Created: 2026-04-06
-- Description: Add soft delete support to notes (trash can)

ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS notes_deleted_at_idx ON notes(deleted_at) WHERE deleted_at IS NOT NULL;
