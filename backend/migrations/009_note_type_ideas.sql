-- Phase 10: Ideas Section
-- Promote "idea" from a Quick Capture hack (💡 title prefix + blockquote wrapper) to
-- a first-class note_type. Existing idea captures are backfilled: prefix and wrapper
-- stripped, is_inbox cleared, notebook_id nulled so they land in the new Ideas view.

ALTER TABLE notes
  ADD COLUMN note_type TEXT NOT NULL DEFAULT 'note'
  CHECK (note_type IN ('note', 'idea'));

CREATE INDEX IF NOT EXISTS notes_user_type_idx
  ON notes (user_id, note_type)
  WHERE deleted_at IS NULL;

-- Backfill: existing "💡 " prefixed captures become note_type='idea'
-- QuickCapture produced:
--   title   = '💡 ' || first_line
--   content = '> 💡 **Idea**\n\n' || text
UPDATE notes
SET
  note_type = 'idea',
  is_inbox = FALSE,
  notebook_id = NULL,
  title = regexp_replace(title, '^💡\s+', ''),
  content = regexp_replace(content, '^>\s*💡\s*\*\*Idea\*\*\s*\n+', '')
WHERE title LIKE '💡 %';
