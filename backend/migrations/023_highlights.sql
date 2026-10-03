-- CR039 Phase C: highlights on research sources (CR039 §5.3).
-- A highlight is a quote kept as a W3C-style text-quote selector (exact +
-- prefix/suffix + a position hint) for web/Markdown sources, or page + rects
-- for PDFs (Phase D). Anchoring runs in the browser (§16 #13): the Reader
-- re-finds each quote in the text it rendered and reports anchor_status back.
-- A highlight that can no longer be placed is orphaned, never deleted (D8).
-- Additive and safe to apply before the feature cuts over.

CREATE TABLE highlights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_note_id  UUID NOT NULL REFERENCES sources(note_id) ON DELETE CASCADE,
  anchor_type     TEXT NOT NULL CHECK (anchor_type IN ('text_quote', 'pdf')),
  exact           TEXT NOT NULL,
  prefix          TEXT,
  suffix          TEXT,
  position_start  INTEGER,
  position_end    INTEGER,
  page_index      INTEGER,
  page_label      TEXT,
  rects           JSONB,
  anchor_status   TEXT NOT NULL DEFAULT 'anchored'
                  CHECK (anchor_status IN ('anchored', 'fuzzy', 'orphaned')),
  -- One of the fixed legend values (§16 #3), validated in the route so a later
  -- user-defined legend needs no migration.
  color           TEXT NOT NULL DEFAULT 'yellow',
  comment         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX highlights_user_idx ON highlights(user_id);
CREATE INDEX highlights_source_idx ON highlights(source_note_id);
ALTER TABLE highlights ADD COLUMN search_tsv TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', exact || ' ' || coalesce(comment, ''))) STORED;
CREATE INDEX highlights_tsv_idx ON highlights USING GIN(search_tsv);

CREATE TRIGGER highlights_updated_at BEFORE UPDATE ON highlights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- No user_id, following note_tags / source_chapters: routes verify that both
-- the highlight and the chapter belong to the caller (§16 #10).
CREATE TABLE highlight_chapters (
  highlight_id UUID NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  chapter_id   UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  PRIMARY KEY (highlight_id, chapter_id)
);
CREATE INDEX highlight_chapters_chapter_idx ON highlight_chapters(chapter_id);
