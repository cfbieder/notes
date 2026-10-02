-- CR039 Phase A1: research sources, books and chapters.
-- A source is a note (note_type='source') plus a 1:1 `sources` citation row.
-- Additive and safe to apply before the feature cuts over: nothing writes a
-- 'source' note until the new routes exist.
--
-- Also adds the first rule-enforcing trigger in the schema (earlier triggers
-- only maintain updated_at): a source note's body is read-only except through
-- POST /sources/:id/replace-body, which opts in per transaction with
-- SET LOCAL noted.allow_source_body = 'on'. The route guards in notes.js give
-- users a clean 422; this is the backstop for any path that misses its guard.

CREATE TABLE books (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX books_user_idx ON books(user_id);
CREATE UNIQUE INDEX books_one_active_idx ON books(user_id) WHERE is_active;

CREATE TABLE chapters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  title       TEXT NOT NULL,
  part        TEXT,
  sort_order  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  -- Deferred so a reorder can renumber every row inside one transaction.
  CONSTRAINT chapters_book_sort_uq UNIQUE (book_id, sort_order) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT chapters_book_label_uq UNIQUE (book_id, label)
);
CREATE INDEX chapters_user_idx ON chapters(user_id);

ALTER TABLE notes DROP CONSTRAINT notes_note_type_check;
ALTER TABLE notes ADD CONSTRAINT notes_note_type_check
  CHECK (note_type IN ('note', 'idea', 'source'));

CREATE TABLE sources (
  note_id          UUID PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_kind      TEXT NOT NULL
                   CHECK (source_kind IN ('web','journal','pdf_report','book','book_chapter','video','podcast','other')),
  authors          JSONB NOT NULL DEFAULT '[]',
  title            TEXT NOT NULL,
  container        TEXT,
  publisher        TEXT,
  volume           TEXT,
  issue            TEXT,
  pages            TEXT,
  published_date   DATE,
  published_precision TEXT CHECK (published_precision IN ('year','month','day')),
  accessed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  url              TEXT,
  doi              TEXT,
  isbn             TEXT,
  -- NO ACTION (not SET NULL): a direct attachment delete must fail rather than
  -- silently strip a PDF source of its file; a note cascade still succeeds.
  pdf_attachment_id      UUID REFERENCES attachments(id),
  snapshot_attachment_id UUID REFERENCES attachments(id),
  metadata_raw     JSONB,
  metadata_llm_fields TEXT[] NOT NULL DEFAULT '{}',
  metadata_status  TEXT NOT NULL DEFAULT 'auto'
                   CHECK (metadata_status IN ('auto','llm','verified','incomplete')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX sources_user_idx ON sources(user_id);
CREATE UNIQUE INDEX sources_user_url_idx ON sources(user_id, url) WHERE url IS NOT NULL;

-- No user_id, following note_tags: routes verify both parents are the caller's.
CREATE TABLE source_chapters (
  source_note_id UUID NOT NULL REFERENCES sources(note_id) ON DELETE CASCADE,
  chapter_id     UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  PRIMARY KEY (source_note_id, chapter_id)
);
CREATE INDEX source_chapters_chapter_idx ON source_chapters(chapter_id);

CREATE TRIGGER books_updated_at BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER chapters_updated_at BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER sources_updated_at BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Read-only source bodies. Compares values rather than relying on the column
-- list, because PUT /notes/:id always SETs content = COALESCE($2, content).
CREATE FUNCTION guard_source_body() RETURNS trigger AS $$
BEGIN
  IF OLD.note_type = 'source'
     AND (NEW.content IS DISTINCT FROM OLD.content
          OR NEW.format IS DISTINCT FROM OLD.format
          OR NEW.note_type IS DISTINCT FROM OLD.note_type)
     AND coalesce(current_setting('noted.allow_source_body', true), '') <> 'on' THEN
    RAISE EXCEPTION 'source_body_readonly: note % is a source; its body changes only via replace-body', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_source_body_guard BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION guard_source_body();
