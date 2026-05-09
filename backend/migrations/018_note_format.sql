-- Add per-note format column to support HTML notes alongside markdown.
-- See Documentation/CR/CR023_html_format_notes.md for context.

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'markdown'
    CHECK (format IN ('markdown', 'html'));

CREATE INDEX IF NOT EXISTS notes_format_idx
  ON notes(format)
  WHERE format <> 'markdown';
