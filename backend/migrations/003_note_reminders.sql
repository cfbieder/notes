-- Migration: 003_note_reminders.sql
-- Created: 2026-04-06
-- Description: Add reminder_at column to notes table for note-level reminders

ALTER TABLE notes ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notes_reminder_at_idx ON notes(reminder_at) WHERE reminder_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_reminder_at_idx ON tasks(reminder_at) WHERE reminder_at IS NOT NULL;
