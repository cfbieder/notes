-- Migration: 014_drive_image_inline_backfill.sql
-- Created: 2026-04-24
-- Description: Backfill markdown image references for existing Drive-imported
--              notes so image attachments (SVG, PNG, JPG, etc.) render inline
--              in the note body. Matches notes whose content contains the
--              "Imported from Google Drive:" placeholder string and whose
--              image attachments aren't already referenced by id. Idempotent:
--              re-running is a no-op because the attachment UUID is used as
--              the dedup key.

DO $$
DECLARE
  r RECORD;
  current_content TEXT;
BEGIN
  FOR r IN
    SELECT a.id AS att_id, a.filename, a.note_id
    FROM attachments a
    JOIN notes n ON n.id = a.note_id
    WHERE a.mime_type LIKE 'image/%'
      AND n.content LIKE '%Imported from Google Drive:%'
    ORDER BY a.note_id, a.created_at
  LOOP
    SELECT content INTO current_content FROM notes WHERE id = r.note_id;
    IF position(r.att_id::text IN current_content) = 0 THEN
      UPDATE notes
      SET content = content || E'\n\n![' || r.filename || '](/api/v1/attachments/' || r.att_id || ')',
          updated_at = NOW()
      WHERE id = r.note_id;
    END IF;
  END LOOP;
END $$;
