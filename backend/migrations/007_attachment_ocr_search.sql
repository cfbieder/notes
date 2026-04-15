-- Phase 7: OCR text searchable via full-text search.
-- attachments.ocr_text is populated by the LLM gateway after upload;
-- ocr_tsv is a generated tsvector so search can match inside OCR output.

ALTER TABLE attachments
  ADD COLUMN ocr_tsv TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(ocr_text, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS attachments_ocr_tsv_idx ON attachments USING GIN(ocr_tsv);
CREATE INDEX IF NOT EXISTS attachments_note_id_idx ON attachments(note_id);
