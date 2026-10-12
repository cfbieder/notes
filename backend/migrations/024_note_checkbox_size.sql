-- CR040: per-note checkbox size for rendered `- [ ]` task lists.
-- 'sm' is the browser-default size used today, so existing notes are unchanged.
-- Additive and safe to apply before the UI ships.

ALTER TABLE notes
  ADD COLUMN checkbox_size TEXT NOT NULL DEFAULT 'sm'
  CHECK (checkbox_size IN ('sm', 'md', 'lg'));
