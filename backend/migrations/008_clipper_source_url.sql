-- Phase 7: Web Clipper — track the source URL of clipped notes so we can
-- deduplicate future clips and show provenance in the UI.

ALTER TABLE notes ADD COLUMN source_url TEXT;

CREATE INDEX IF NOT EXISTS notes_source_url_idx
  ON notes (user_id, source_url)
  WHERE source_url IS NOT NULL;
