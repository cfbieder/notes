-- CR039 follow-up to 021 (found in migration review): a source's PDF and
-- snapshot attachments must belong to the source's own note. With plain FKs, a
-- source pointing at another note's attachment would make permanently deleting
-- that other note fail with 23503 — and with it, emptying the whole trash.
-- Composite FKs enforce "same note"; a NULL attachment id skips the check
-- (MATCH SIMPLE). A1 never writes these columns, so this changes no data.
--
-- Note for future migrations: guard_source_body (021) refuses content/format
-- changes to source notes. A backfill that rewrites notes.content must add
-- AND note_type <> 'source', or SET LOCAL noted.allow_source_body = 'on'.

ALTER TABLE attachments ADD CONSTRAINT attachments_id_note_uq UNIQUE (id, note_id);

ALTER TABLE sources
  DROP CONSTRAINT sources_pdf_attachment_id_fkey,
  ADD CONSTRAINT sources_pdf_attachment_fk
    FOREIGN KEY (pdf_attachment_id, note_id) REFERENCES attachments(id, note_id);

ALTER TABLE sources
  DROP CONSTRAINT sources_snapshot_attachment_id_fkey,
  ADD CONSTRAINT sources_snapshot_attachment_fk
    FOREIGN KEY (snapshot_attachment_id, note_id) REFERENCES attachments(id, note_id);
