# CR039 — Research Sources, Highlights & Chapter References

**Status:** In progress — **Phase A1 built** (2026-10-02, see Outcome); B next, then A2 and A3.
Phases C, D and E are a design of record; each gets a priority re-check before it is built (§15c).
**Severity:** Feature (large; phased, first usable release = A1 + B)
**Origin:** User proposal, 2026-10-02 — reviewed against the code the same day (see §15)
**Depends on:** web clipper (project-description §5.10), attachments + OCR (§5.7),
AI text generation via [CR038](docs/cr/cr-038-pluggable-ai-providers.md) — pluggable AI providers.
Phase D shares its PDF.js viewer with [CR025](docs/cr/cr-025-pdf-document-management.md) — PDF document management.
Phase E depends on [CR001](docs/cr/cr-001-pgvector-embeddings.md) — pgvector + embedding pipeline.

---

## 1. Summary

Add a research layer so Noted can serve as the source library for a non-fiction book
manuscript. The user can:

1. Capture web articles, PDFs and links as **sources**, with citation metadata filled in
   automatically.
2. **Highlight** passages in web sources and PDFs, with a comment on each.
3. Assign sources and highlights to **book chapters**.
4. **Export a reference section per chapter** ("Sources and Further Reading") that pastes
   cleanly into a Word manuscript.
5. Later, query sources by chapter with AI Assist and semantic search.

This is **not** a Zotero replacement. It has no in-text citation engine, no footnote
insertion, and supports one bibliography style.

## 2. Problem

- A book needs a defensible source trail: every factual claim traceable to a source, ideally
  to a page or passage.
- Trade publishers often ask for a per-chapter **Notes** section keyed to page and phrase
  rather than footnote numbers. That is only cheap to produce if every highlight keeps its
  source and location **from the start**.
- Noted already covers most of this — clipping ([clipper/](clipper/),
  [backend/src/routes/clips.js](backend/src/routes/clips.js)), PDF attachments with OCR,
  full-text search, AI Assist. What is missing is structured citation metadata, highlights
  with stable anchors, chapters, and a reference export. A separate tool would duplicate
  storage, search and AI, and still need a custom export layer.

## 3. Scope

### In scope
- `source` note type with structured citation metadata
- Metadata auto-extraction in the clipper, plus an LLM fallback for PDFs
- Books and chapters as first-class entities
- Highlights on web/Markdown sources and on PDFs, each with comment, color and chapter
- Per-chapter reference export: HTML (copy for Word) and `.md`
- Research navigation surface (rail item + views)
- Search integration (`is:source`, `ch:`, highlight text)
- Phase E: chapter-scoped AI Assist and semantic search over highlights (on CR001's pipeline)

### Out of scope
- Citation styles other than Chicago (18th ed.) bibliography; no CSL engine
- Footnote or endnote insertion into manuscripts
- Zotero / BibTeX / RIS import or export (BibTeX export can be a later CR)
- Shared or multi-user libraries (everything stays `user_id`-scoped)
- Annotation of non-source notes
- A high-fidelity web archive viewer (snapshots are kept for preservation, not browsing)
- Importing chapters from an external outline document (manual entry — §16 #1)
- `.docx` export: "Copy for Word" covers the need; add it if a publisher asks for a file (§16 #8)
- Converting an existing plain clip into a source (§16 #11). Re-clip as a source instead.

Deferred items are tracked in [project-roadmap.md](docs/current/project-roadmap.md) under
"Deferred from CR039".

---

## 4. Key Design Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Sources are notes with `note_type='source'`, plus a 1:1 `sources` metadata table | Same pattern as `idea` ([009_note_type_ideas.sql](backend/migrations/009_note_type_ideas.sql)). Sources inherit search, tags, wikilinks, attachments (`attachments.note_id` is `NOT NULL`, so a source note is the natural owner of its PDF), trash and AI Assist. |
| D2 | **Source bodies are read-only** after capture, enforced on **every** content write path (§6.1) | Highlight anchors depend on stable text. The user's own thinking goes in highlight comments or in separate notes that wikilink to the source. |
| D3 | Chapters are a dedicated entity, **not notebooks** | A note can be in only one notebook; one source often supports several chapters. |
| D4 | Chapters are assigned at the **highlight level**. A source's chapters = manual assignments ∪ its highlights' chapters | Different passages of one source support different chapters. Manual assignment covers relevant-but-unhighlighted sources. |
| D5 | Web anchors use W3C-style **text-quote selectors** (exact + prefix + suffix + position hint). PDF anchors use **page index + page label + normalized rects** | Text-quote selectors survive re-rendering. Page labels (printed page numbers) are what citations need. |
| D6 | PDF sources use **PDF.js**, via the **same viewer component CR025 builds** | The native viewer does not expose selections. CR025 already plans an in-app PDF.js viewer; building two would be waste. Whichever CR lands first builds it; the other extends it (§10.3). |
| D7 | A thin `books` table even with one book today | Cheap; no migration when the next book starts. |
| D8 | Highlights that can't be re-anchored are **orphaned, not deleted** | The quote is still valid for export even if it can't be shown in place. |
| D9 | Source notes are **notebook-less and excluded from the Notes list**, like ideas; they live under Research | Keeps the Notes list for the user's own writing. Today `GET /notes` excludes ideas **only** in its Inbox branch ([notes.js:76-87](backend/src/routes/notes.js#L76-L87)), and a notebook-less source would match the Inbox predicate. So `n.note_type <> 'source'` goes into the **base** conditions of `GET /notes` unless `note_type=source` is passed explicitly, which covers the default list and both Inbox branches. Sources still appear in global search. (§16 #2) |
| D10 | Metadata LLM extraction goes through `generateText` with a `taskName`, **not** a gateway-only call | Since CR038, text generation is provider-pluggable; this keeps extraction working with Claude/OpenAI/local providers, with the gateway task as the default route (§9). |

---

## 5. Data Model

Phase A1 took migrations `021` and `022`. Later phases take the next free number at
implementation time and re-check for a collision at commit.
All tables below are additive and **safe to apply before the feature cuts over**.

### 5.1 Books & chapters

```sql
CREATE TABLE books (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,  -- default target in clipper/UI
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX books_user_idx ON books(user_id);
CREATE UNIQUE INDEX books_one_active_idx ON books(user_id) WHERE is_active;  -- at most one active

CREATE TABLE chapters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,                   -- display label: '3', 'Part II', 'Intro'
  title       TEXT NOT NULL,
  part        TEXT,                            -- optional Part / Stream grouping
  sort_order  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chapters_book_sort_uq UNIQUE (book_id, sort_order) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT chapters_book_label_uq UNIQUE (book_id, label)   -- makes `ch:<label>` unambiguous
);
CREATE INDEX chapters_user_idx ON chapters(user_id);
```

The unique constraint is `DEFERRABLE` because `PUT /books/:id/chapters/reorder` renumbers
`sort_order` in one transaction; a non-deferred constraint fails on the first swapped row.
(The constraint's own index serves `(book_id, sort_order)` lookups.) A deferred violation
surfaces as `23505` at COMMIT, for example from two concurrent `POST /books/:id/chapters` calls that both
take `max + 1`; it maps to a 409.

**Activating a book** is two statements in one transaction: deactivate all the user's books,
then activate the one. `books_one_active_idx` is a non-deferrable partial unique index checked
per row, so a single `UPDATE … SET is_active = (id = $1)` can trip it, depending on row order.

### 5.2 Sources

```sql
ALTER TABLE notes DROP CONSTRAINT notes_note_type_check;   -- inline CHECK from 009
ALTER TABLE notes ADD CONSTRAINT notes_note_type_check
  CHECK (note_type IN ('note', 'idea', 'source'));

CREATE TABLE sources (
  note_id          UUID PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_kind      TEXT NOT NULL
                   CHECK (source_kind IN ('web','journal','pdf_report','book','book_chapter','video','podcast','other')),
  authors          JSONB NOT NULL DEFAULT '[]',
                   -- [{ "family": "Sutton", "given": "Rich" } | { "literal": "OpenAI" }]
  title            TEXT NOT NULL,                -- citation title (may differ from note title)
  container        TEXT,                         -- publication / site / journal / book title
  publisher        TEXT,
  volume           TEXT,
  issue            TEXT,
  pages            TEXT,
  published_date   DATE,
  published_precision TEXT CHECK (published_precision IN ('year','month','day')),
  accessed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  url              TEXT,                         -- canonical URL (may differ from notes.source_url)
  doi              TEXT,
  isbn             TEXT,
  pdf_attachment_id      UUID REFERENCES attachments(id),   -- NO ACTION: see below
  snapshot_attachment_id UUID REFERENCES attachments(id),   -- MHTML
  metadata_raw     JSONB,                        -- everything the extractor found
  metadata_llm_fields TEXT[] NOT NULL DEFAULT '{}',  -- fields filled by the LLM, cleared on verify
  metadata_status  TEXT NOT NULL DEFAULT 'auto'
                   CHECK (metadata_status IN ('auto','llm','verified','incomplete')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX sources_user_idx ON sources(user_id);
CREATE UNIQUE INDEX sources_user_url_idx ON sources(user_id, url) WHERE url IS NOT NULL;

CREATE TABLE source_chapters (               -- manual assignment (D4)
  source_note_id UUID NOT NULL REFERENCES sources(note_id) ON DELETE CASCADE,
  chapter_id     UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  PRIMARY KEY (source_note_id, chapter_id)
);
CREATE INDEX source_chapters_chapter_idx ON source_chapters(chapter_id);
```

- `published_precision` allows "2019" or "March 2019" without inventing a day.
- **Attachment FKs are `NO ACTION`, not `SET NULL`.** `SET NULL` would let
  `DELETE /attachments/:id` silently strip a PDF source of the file every highlight's page and
  rects point at. `NO ACTION` is checked at end of statement, so permanently deleting the note
  (which cascades to both `sources` and `attachments`) still succeeds, while a direct attachment
  delete fails and maps to a 409. Routes verify that both attachment ids belong to the **same
  note** and user.
- **`sources.title` is the citation title and is authoritative for export.** It is seeded from
  the note title at capture; renaming the note afterwards does not change the citation, and
  editing the citation title does not rename the note.
- `metadata_llm_fields` lets the UI flag LLM-filled fields individually (§9); a status alone
  can't say *which* fields to mark.
- **Dedup key:** `sources.url` holds the canonical URL (`<link rel="canonical">` / citation
  URL, else the tab URL), normalized: lowercase scheme and host, fragment dropped, `utm_*` and
  similar tracking params dropped, trailing slash trimmed. One normalizer function, unit-tested.
  `notes.source_url` keeps the raw tab URL, and lookups (§8.6) check both. Today `clips.js` does
  no dedup at all (`notes_source_url_idx` is a plain lookup index), so this is the only dedup.
- **Multi-table writes are transactional.** Every path that creates a source (`POST /clips`
  with `as_source`, `POST /sources`, `/sources/from-pdf`) inserts the note, the `sources` row,
  tags, chapters and attachment rows in **one transaction** (`fastify.db.connect()` + `BEGIN`,
  as in [vault.js](backend/src/routes/vault.js)). Otherwise a duplicate-URL failure after the
  note insert leaves a `source` note with no `sources` row. A `23505` on `sources_user_url_idx`
  maps to the `source_exists` 409 on **every** path, including `PUT /sources/:id` editing `url`;
  a pre-check alone races.
- **Duplicate URLs and trash:** the unique index still holds while the source note is in the
  trash (the `sources` row survives soft delete). The 409 therefore reports
  `in_trash: true` when the existing note is trashed, and the clipper offers **Restore**
  rather than **Open**.
- **Join tables carry no `user_id`**, following the `note_tags` precedent (§16 #10). Ownership
  comes from the parents, so every insert **must verify that both the source and the chapter
  belong to the caller**, or a user could attach their source to someone else's chapter id.
  Each join table gets an explicit cross-user isolation test.
- **Read-only trigger (§16 #9).** The same migration adds a `BEFORE UPDATE ON notes` trigger
  that raises when a source's `content`, `format` or `note_type` *value* changes, unless the
  transaction has set `SET LOCAL noted.allow_source_body = 'on'`, which only `replace-body`
  does. It compares values rather than using `UPDATE OF content, format`, because
  `PUT /notes/:id` always assigns `content = COALESCE($2, content)`. It is the codebase's
  first **rule-enforcing** trigger (001 already has `updated_at` triggers). The route guards
  (§6.1) stay, so users get a clean 422 rather than a database error.

### 5.3 Highlights (Phase C)

```sql
CREATE TABLE highlights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_note_id  UUID NOT NULL REFERENCES sources(note_id) ON DELETE CASCADE,
  anchor_type     TEXT NOT NULL CHECK (anchor_type IN ('text_quote','pdf')),
  exact           TEXT NOT NULL,               -- the quoted text (always kept)
  prefix          TEXT,                        -- ~32 chars before (text_quote)
  suffix          TEXT,                        -- ~32 chars after (text_quote)
  position_start  INTEGER,                     -- hint: offset in normalized rendered text
  position_end    INTEGER,
  page_index      INTEGER,                     -- 0-based PDF page (pdf)
  page_label      TEXT,                        -- printed page number, e.g. 'xii', '147'
  rects           JSONB,                       -- [{x,y,w,h}] normalized 0–1 per page (pdf)
  anchor_status   TEXT NOT NULL DEFAULT 'anchored'
                  CHECK (anchor_status IN ('anchored','fuzzy','orphaned')),
  color           TEXT NOT NULL DEFAULT 'yellow',
  comment         TEXT,                        -- Markdown; wikilinks allowed
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX highlights_user_idx ON highlights(user_id);
CREATE INDEX highlights_source_idx ON highlights(source_note_id);
ALTER TABLE highlights ADD COLUMN search_tsv TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', exact || ' ' || coalesce(comment,''))) STORED;
CREATE INDEX highlights_tsv_idx ON highlights USING GIN(search_tsv);

CREATE TABLE highlight_chapters (
  highlight_id UUID NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  chapter_id   UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  PRIMARY KEY (highlight_id, chapter_id)
);
CREATE INDEX highlight_chapters_chapter_idx ON highlight_chapters(chapter_id);
```

Highlights are **hard-deleted**: a soft delete with no restore, UI or purge would be
speculative. Permanently deleting a trashed source cascades away its highlights, and the trash
confirmation (`ConfirmModal`) says how many.

Chapter membership (manual ∪ via-highlight) is computed **in the repository query**, not a
database view: a view without a `user_id` column or a trash filter invites a caller to forget
both. The query must join `notes` and exclude `deleted_at IS NOT NULL` source notes, so
trashed sources drop out of chapter lists, counts and exports. The same `notes.deleted_at IS
NULL` join applies to **every** highlight query: search, `/chapters/:id/highlights` and export.

`color` holds one of the four legend values (§16 #3): `yellow` evidence, `red`
counter-argument, `green` quote-worthy, `blue` follow-up. They are validated in the route, not
with a CHECK constraint, so a later user-defined legend needs no migration.

### 5.4 Embeddings (Phase E)

**No separate pgvector migration in this CR.** CR001 owns enabling the extension, choosing
the embedding model, and therefore the vector dimension (CR001 currently specifies
`nomic-embed-text`, 768-dim; the original proposal's `vector(1024)` would conflict).
Phase E adds `highlights.embedding vector(<CR001's dimension>)` on top of CR001's pipeline.

---

## 6. Behavior

### 6.1 Read-only source bodies (D2)

A source note's `content` may change only through `POST /sources/:id/replace-body`. Every
other path that writes `notes.content`, or otherwise breaks a source's invariants, refuses for
`note_type='source'` with `422 { error: 'source_body_readonly', message, statusCode: 422 }`
(the project's error shape; compare `checkin_conflict` in [notes.js](backend/src/routes/notes.js)).

**Guard semantics:** reject when `content` is present **and differs** from the stored body.
Autosave always sends `{ title, content }` together
([NotesView.vue](frontend/src/views/NotesView.vue), [MobileEditor.vue](frontend/src/components/mobile/MobileEditor.vue)),
so a guard on "content present" would 422 every rename of a source.

| Path | Rule for a source | File |
|---|---|---|
| `PUT /notes/:id` `content` | reject if it differs | [notes.js:255](backend/src/routes/notes.js#L255) |
| `PUT /notes/:id` `format` | reject any change: markdown ↔ html changes the rendered text and breaks every anchor | [notes.js:300](backend/src/routes/notes.js#L300) |
| `PUT /notes/:id` `notebook_id` | reject: sources are notebook-less (D9) | [notes.js:286](backend/src/routes/notes.js#L286) |
| `PUT /notes/:id` `auto_update` | reject `true` | [notes.js:296](backend/src/routes/notes.js#L296) |
| `PUT /notes/:id` `note_type` into or out of `'source'` | reject | [notes.js:281](backend/src/routes/notes.js#L281) |
| Drive auto-update overwrite | add `AND note_type <> 'source'` to the title match | [driveImporter.js:50-68](backend/src/services/driveImporter.js#L50-L68) |
| `POST /notes/:id/merge-into`, source as target **or** as merged note | reject (today it has no `note_type` check at all) | [notes.js:561](backend/src/routes/notes.js#L561) |
| `POST /notes/:id/checkin` (offline checkout, CR027) | reject; sources are not checkout-eligible | [notes.js:346](backend/src/routes/notes.js#L346) |
| `POST /notes/:id/translate` | reject in-place translation | [notes.js:664](backend/src/routes/notes.js#L664) |

Clipping in `mode: 'screenshot'` with `as_source` is rejected: a screenshot appends an image
to the note body it just created ([clips.js:175-183](backend/src/routes/clips.js#L175-L183)),
which is not a citable text body. Behind these route guards, a database trigger (§5.2) refuses any
`content` or `format` change to a source that reaches the database by a path not listed here.

`replace-body` takes `SELECT … FOR UPDATE` on the `sources` row so it cannot race a concurrent
highlight create, then re-runs anchoring (§6.2) and reports how many highlights became `fuzzy` /
`orphaned`. It applies to **web/Markdown sources only**. In the frontend, source notes open in a
**Reader view** (rendered Markdown, like the HTML-note read view) in both the desktop
CodeMirror editor and `MobileEditor`, never in edit mode, and are not offered for offline
checkout.

### 6.2 Anchoring and re-anchoring (text_quote)

1. Exact match of `prefix + exact + suffix` near `position_start`.
2. Otherwise exact match of `exact` alone, nearest the hint.
3. Otherwise fuzzy match (diff-match-patch `match_main`, threshold ~0.3) → `fuzzy`.
4. Otherwise → `orphaned`: stays in the sidebar list and in exports, with an "unanchored" badge.

Matching runs on **whitespace-normalized rendered text**, not raw Markdown. **Where anchoring
runs is open (§16 #13).** The original "one shared module used by server and client" is not
feasible as written: backend and frontend have separate Docker build contexts, the backend is
CommonJS while the frontend is ESM, and the backend has no Markdown renderer. Candidate libraries:
`@apache-annotator/dom` / `dom-anchor-text-quote`, or a small in-house implementation on
`diff-match-patch` (decide in Phase C).

### 6.3 Chapter assignment

- A new highlight's chapters default to the **last chapter used** in the session, else the
  source's first manual chapter. One click changes it.
- Removing the last highlight for a chapter removes the source from that chapter unless it
  is also manually assigned — automatic, since membership is computed (§5.3).

---

## 7. API

All under `/api/v1`, inside the authenticated scope (JWT or `noted_` token), every query
`user_id`-scoped.

### 7.1 Books & chapters
```
GET    /books
POST   /books                         { title }
PUT    /books/:id                     { title?, is_active? }   — activating one deactivates the rest (§5.1)
GET    /books/:id/chapters            ordered; includes source_count, highlight_count
POST   /books/:id/chapters            { label, title, part?, sort_order? }
PUT    /chapters/:id                  { label?, title?, part? }
PUT    /books/:id/chapters/reorder    { chapter_ids: [...] }  — one transaction; must be the full set
DELETE /chapters/:id                  409 if it has assignments, unless ?force=true
```

### 7.2 Sources
```
GET    /sources                       ?chapter_id, ?kind, ?status, ?q, ?needs_attention=true
POST   /sources                       create from metadata + body
GET    /sources/:id                   metadata + chapters + highlight counts
PUT    /sources/:id                   metadata edits → metadata_status='verified', llm_fields cleared
POST   /sources/:id/chapters          { chapter_id }   (manual assignment)
DELETE /sources/:id/chapters/:chId
POST   /sources/:id/replace-body      { content }  → { anchored, fuzzy, orphaned }
POST   /sources/:id/extract-metadata  re-run LLM extraction → proposed diff, not auto-applied
POST   /sources/from-pdf              multipart PDF → source note + attachment + async OCR & metadata
POST   /sources/:id/snapshot          multipart MHTML → snapshot attachment
```

### 7.3 Highlights (Phase C)
```
GET    /sources/:id/highlights
POST   /sources/:id/highlights        { anchor_type, exact, prefix?, suffix?, position_*?, page_*?, rects?,
                                        color?, comment?, chapter_ids? }
PUT    /highlights/:id                { color?, comment?, chapter_ids? }
DELETE /highlights/:id                hard delete (§5.3)
GET    /chapters/:id/highlights       grouped by source
```

### 7.4 Export (Phase B)
```
GET /chapters/:id/references   ?format=html|md  &include=sources|passages|both  &scope=all|highlighted
GET /books/:id/references      same params; one section per chapter, in sort_order
```

### 7.5 Clips (extended)
`POST /clips` gains `as_source: true`, `metadata: {...}`, `chapter_ids: []`. With
`as_source`, it creates the note with `note_type='source'` plus a `sources` row. A duplicate
URL returns `409 { error: 'source_exists', message, statusCode: 409, data: { note_id, in_trash } }`.

The MHTML snapshot is **not** sent inline as base64: no route sets `bodyLimit`, so Fastify's
default 1 MiB JSON limit applies, and a news-page MHTML is routinely several MB. The clipper
uploads it as a follow-up multipart call to `/sources/:id/snapshot` (nginx already allows
25 MB).

**Plumbing:**
- `@fastify/multipart` is registered inside the attachments plugin's scope
  ([attachments.js:31-36](backend/src/routes/attachments.js#L31-L36)). Fastify encapsulation
  means the sources routes register it themselves.
- MHTML (`multipart/related` / `application/x-mimearchive`) is added to that route's allowed types.
- The write-file-and-insert-attachment code already exists three times (attachments.js,
  clips.js, driveImporter.js). It moves into one shared `storeAttachment` helper rather than
  gaining a fourth and fifth copy.

**Version skew:** Fastify's default Ajv config strips unknown body properties. A new clipper
talking to an older server would therefore have `as_source` dropped silently and get a plain
clip with a 201. The clipper feature-detects (`GET /books` → 404 hides "Save as source"), and a
test covers it.

---

## 8. Clipper Changes

### 8.1 Metadata extraction (Phase A2)
A content script reads, in priority order:
1. `citation_*` (Highwire / Google Scholar tags — journals, arXiv)
2. JSON-LD `NewsArticle` / `Article` / `ScholarlyArticle` / `Book`
3. `article:published_time`, `article:author`, `og:site_name`, `og:title`
4. `DC.*` Dublin Core, `<meta name="author">`, `<link rel="canonical">`
5. Fallback: `document.title`, hostname as container

Everything found goes into `metadata_raw`. The popup shows the parsed fields **editable before
saving**. Missing author or date marks the source `incomplete`.

### 8.2 Popup changes
- "Save as source" toggle, on by default when a book is active
- Chapter multi-picker (active book's chapters, plus last-used)
- "Archive snapshot" checkbox, on by default for `web` kind

### 8.3 Permissions
The manifest today requests only `activeTab`, `scripting`, `storage`, `contextMenus`
([clipper/manifest.json](clipper/manifest.json)). Adding a required permission makes Chrome
disable the installed extension until the user re-approves it, so:
- `pageCapture` goes in **`optional_permissions`**, requested the first time "Archive
  snapshot" is used.
- PDF fetch: content scripts cannot run inside Chrome's PDF viewer, so the extension must
  fetch the PDF URL itself. **Verify in Phase A3** whether `activeTab`'s temporary host grant
  covers a service-worker fetch of the tab's URL; if not, request the origin via
  `optional_host_permissions` at clip time. Never add `<all_urls>` as a required permission.
- The backend does **not** fetch PDF URLs on the clipper's behalf (that would be a new SSRF
  surface).

### 8.4 PDFs
If the active tab is a PDF, the clipper fetches it and posts to `/sources/from-pdf`. The
backend stores the attachment and extracts the PDF's **text layer with headless `pdfjs-dist`**,
lifting the approach CR025 already specifies: sub-second, free, and with no gateway. Gateway
OCR runs only when the text layer is empty (a scanned PDF). The first ~4,000 characters then
feed metadata extraction (§9). The source note's `content` holds a short header (citation and
"PDF source") followed by the extracted text, so the PDF is full-text searchable. PDF highlights
anchor to the PDF, not to this text, so `replace-body` does not apply to PDF sources.

### 8.5 Snapshot (Phase A3, optional)
`chrome.pageCapture.saveAsMHTML({ tabId })` → uploaded via §7.5 → `snapshot_attachment_id`.
Preservation only; the UI offers a download link, no viewer.

### 8.6 Live-page highlighting (Phase C)
Select text on the live page → floating "Highlight" button → saved against the existing
source for that URL (clipping it as a source first if none exists). The server re-anchors the
quote (§6.2), since live DOM text and the Readability output differ, and reports "anchored" /
"saved, not placed" back to the popup. "The existing source for that URL" is looked up by both
the normalized canonical URL and the raw tab URL (§5.2).

---

## 9. Metadata extraction (LLM)

Called through `generateText({ taskName: 'noted_source_metadata', tier: 'quick', userId, db })`
in [llmService.js](backend/src/services/llmService.js). The call must pass `userId` and `db`
explicitly; without them `generateText` silently uses the gateway instead of the user's
configured provider (CR038).
- **Gateway route.** Pinned ocr-llm contract **v1**. With `LLM_TASK_ENABLED=true` it uses a
  registered `noted_source_metadata` task (fast tier). **Registering that task is a request to
  ocr-llm**, filed as a handoff in `ocr-llm/HANDOFFS.md` + `handoffs.json` when Phase A3 starts.
- **Bridging model.** Until the task is registered, `bridgingModelForTask` gains a
  `noted_source_metadata → QUICK_MODEL` line. Today it returns `null` for unknown task names and
  the call would fall through to `GENERATE_MODEL`.

- **Input:** first ~4,000 chars of the PDF text layer or OCR text, plus filename and URL.
- **Output:** JSON matching the `sources` fields, with a confidence per field; parsed and
  validated server-side (malformed output = no change, not an error).
- **Behavior:** fills only empty fields, never `url`, so it cannot create a duplicate. It records
  the filled fields in `metadata_llm_fields` and sets `metadata_status='llm'`. It never invents a
  DOI or ISBN: one is accepted only if the literal string appears in the input text, checked
  server-side rather than trusted to the prompt.
- **Failure is visible.** Extraction runs after the PDF upload returns. If the provider is
  disabled (`llmService.isEnabled()` false), down or slow, the source is marked
  `metadata_status='incomplete'` with the error stored in `metadata_raw`, and it appears in
  **Needs attention**. `POST /sources/:id/extract-metadata` is the retry. A process restart
  mid-extraction leaves the status `auto` with empty fields, which the missing-author/date rule
  also marks `incomplete`.
- **Known limit:** until the roadmap's "typed gateway error handling" gap is fixed, the stored
  error is a truncated raw response body, not a typed reason. Needs attention shows it as-is.

## 10. Frontend

### 10.1 Navigation
- New activity-rail item **Research** (`BookOpen` icon, `⌘9` — free today; ⌘1–⌘8 are taken in
  [useRailShortcuts.js](frontend/src/composables/useRailShortcuts.js)), after Vault. It and ⌘9
  appear **only once the user has a book** (§16 #12): creating a book in Settings → Research is
  the opt-in, so forks that don't write books never see it. It follows the rail pattern
  [CR026](docs/cr/cr-026-activity-rail-navigation.md) (activity rail + contextual panel) already
  shipped in v0.10.9; CR026's remaining work is deferred polish, and any concurrent edits to the
  rail files are coordinated, not assumed.
- Contextual panel: active book selector, chapter list (label, title, counts), plus
  **All sources**, **Unassigned**, **Needs attention**.

### 10.2 Views
- **`/research/chapters/:id`**: header with an **Export** split-button (Copy for Word ·
  Download .md · include passages ☐). Tabs: *Sources* (author, title,
  publication, date, highlight count, status chip) and *Passages* (highlights grouped by
  source: quote, comment, page; filter by legend color; click through to the highlight in place).
- **`/research/sources`**: filterable source library.
- **Source reader** (`/notes/:id` when `note_type='source'`): metadata card (editable,
  "Verify" button, LLM-filled fields flagged); body as rendered Markdown with `<mark>`
  highlights, or the PDF.js viewer; right sidebar of highlights (orphaned at the bottom);
  select text → popover with a labelled legend color, chapter picker, comment.
- **Chapter management** in Settings → Research: add, rename, drag-reorder.

### 10.3 PDF.js viewer (Phase D)
- One viewer component shared with CR025 (D6). **Its auth is unresolved across the two CRs:**
  this CR says an `Authorization` header via `httpHeaders`, while CR025 says PDF.js can't
  reliably set one and relies on [CR009](docs/cr/cr-009-signed-attachment-urls.md) (replace the
  attachment query-string JWT with signed URLs). Reconcile this, in both CRs, before whichever
  builds the viewer first. Either way, no `?token=`.
- Rects stored **normalized to page size (0–1)** so they hold at any zoom.
- `page_label` from `pdfDocument.getPageLabels()`, falling back to `page_index + 1`.
- Scanned PDFs with no text layer: area selection, `exact` filled from the page's OCR text
  where possible, else a user-typed excerpt.
- Lazy-loaded on its route only (bundle size).

### 10.4 Search (Phase C)

Sources are already found by global search through `notes.search_tsv`; nothing below is needed
for the A1 + B release.
- `is:source` (a new `note_type` param on `/search`) and `ch:<label>` (e.g. `ch:3`), scoped
  to the active book; `UNIQUE (book_id, label)` makes it unambiguous.
- Highlights come from a separate `GET /search/highlights`, not mixed into `/search`, whose
  `{ data, meta.total }` count and ranking are for a single entity type. The search view shows
  them as their own section, linking to the highlight in place.

---

## 11. Reference Export Format (Phase B)

### 11.1 Style
Chicago Manual of Style, 18th ed., **bibliography** form. Sorted by first author's family
name, then title; an organization author sorts by its literal name. The formatter is one
isolated module so the style can be swapped (§16 #4).

| Kind | Pattern |
|---|---|
| web | Family, Given. "Title." *Container*, Month Day, Year. URL. |
| journal | Family, Given. "Title." *Journal* vol, no. issue (Year): pages. https://doi.org/DOI. |
| book | Family, Given. *Title*. Publisher, Year. |
| pdf_report | Org or Author. *Title*. Publisher, Year. URL. |
| video / podcast | Family, Given. "Title." *Container*. Month Day, Year. URL. |

- 2 authors: "Family, Given, and Given Family." 3+ authors: list all.
- No published date: append "Accessed Month Day, Year."
- Missing required fields render as visible placeholders (**[author?]**, **[date?]**).

Example:
> Sutton, Rich. "The Bitter Lesson." *Incomplete Ideas* (blog), March 13, 2019. http://www.incompleteideas.net/IncIdeas/BitterLesson.html.

### 11.2 Output structure
```
Chapter 3 — <title>
Sources and Further Reading
  <entries>

[if include=passages]
Key Passages
  <Source short title>
    p. 147 — "exact quote…"  — comment
```

### 11.3 Formats
- **html**: semantic HTML, `<em>` for titles. **Every field is HTML-escaped.** Titles and
  authors come from arbitrary web pages. "Copy for Word" writes
  `ClipboardItem({ 'text/html', 'text/plain' })` so italics survive the paste. It passes a
  Promise into `ClipboardItem` so Safari keeps the user gesture across the fetch. (Clipboard
  write needs a secure context — fine on the HTTPS production host; on the plain-HTTP dev
  server use the Download options.)
- **docx**: deferred (§16 #8). If added later: server-side with the `docx` npm package,
  Times New Roman 12, 0.5" hanging indent, one section per chapter, delivered as a
  header-authenticated blob fetch, not a `?token=` link. Times New
  Roman 12, 0.5" hanging indent, one section per chapter for a book export.
- **md**: `*italics*`, one entry per paragraph, downloaded as a header-authenticated blob.

---

## 12. Phases & Acceptance

Build order (§15c): CR038's `AI_KEYS_ENC_KEY` production fix → **A1 → B** (first usable
release) → **A2 → A3**. C, D and E are designs of record, re-prioritized when reached: C after
real use of A/B, D together with CR025 and the CR009 auth reconciliation, E after CR001.

| Phase | Contents | Size | Done when |
|---|---|---|---|
| **A1: Server core + manual sources** | Full books/chapters/sources migration (every §5.1/§5.2 table and column, the attachment FK columns, the read-only trigger); books/chapters/sources API with transactions and `23505` → 409; all §6.1 guards; the D9 Notes/Inbox exclusion; `POST /sources` manual entry + metadata card (edit, Verify); Settings → Research chapter management; Research rail item (shown once a book exists), chapter list, source library; Reader view for sources | M | A hand-entered source appears under its chapters and not in the Notes list or Inbox; every §6.1 path refuses a source, and a direct SQL `UPDATE` of a source body is refused by the trigger; a duplicate URL (live or trashed) returns 409 and rolls back with no orphan note; chapter reorder and book activation work; isolation tests pass for every new table and both join tables |
| **B: Reference export** | `html` and `md` export per chapter and per book; Copy for Word; placeholders for missing fields | S–M | A chapter list pastes into Word with italics intact; incomplete sources are visibly flagged; the book export has one section per chapter in outline order |
| **A2: Clipper web capture** | §8.1 metadata extraction; "Save as source" + chapter picker; URL normalizer; duplicate-URL handling in the popup (Open / Restore); version-skew feature detection | M | Clip 10 real web sources (news, arXiv, blog); ≥8 have correct author/date with no edits; a duplicate is caught; an older server degrades to a plain clip with "Save as source" hidden |
| **A3: PDF sources, LLM metadata, snapshot** | `/sources/from-pdf`; backend `pdfjs-dist` text layer with OCR fallback; shared `storeAttachment` helper; §9 LLM extraction + bridging-model line + ocr-llm handoff (filed when A3 starts); `optional_host_permissions` PDF fetch; MHTML snapshot via optional `pageCapture` | M | A PDF report clips with correct metadata, or with failure visible in Needs attention; LLM-filled fields are flagged; a snapshot is stored and downloadable; no new required clipper permission |
| **C: Web highlights** | Highlights migration; Reader view `<mark>`; selection popover; sidebar; anchoring (§16 #13) + re-anchoring; clipper live-page highlighting; search integration (§10.4); Passages tab | L | Highlights survive reload; `replace-body` re-anchors ≥90% on a lightly changed article; orphaned highlights still export; `include=passages` works |
| **D: PDF highlights** | PDF.js viewer (shared with CR025); rect + page-label capture; OCR fallback for scanned PDFs | L | Highlights on a 300-page PDF hold position at any zoom; an exported passage shows the printed page number, not the PDF index |
| **E: AI over sources** | *Requires CR001.* Highlight embeddings; "Ask this chapter's sources" preset in AI Assist; `GET /research/support?claim=…&chapter_id=`, which must earn its place against CR002/CR008 (semantic search, "Ask my notes") | M | Given a draft sentence, returns the top supporting highlights with source and page; AI Assist answers cite only preloaded sources |

Each phase is its own release.

## 13. Impact checklist

- [ ] **Migration** — new tables per §5, each with `user_id NOT NULL` + FK + index; per-user
      uniqueness; `note_type` CHECK widened. Additive and safe to apply before cut-over.
      Numbers taken at implementation time.
- [ ] **Isolation** — every new route in the authenticated scope; every query filters by
      `user_id`; join-table inserts verify **both** parents are the caller's (§5.2).
      `user_id` isolation test for every new table.
- [ ] **Secrets/config** — none expected (extraction reuses the existing AI provider config).
- [ ] **Tests** — `backend/tests/cr039-*.test.js` (§14); pure ones (formatter, anchoring,
      normalization) added to `test:ci`.
- [ ] **Guards** — the read-only trigger (§5.2) is the backstop; a `scripts/ci-guards.sh` grep
      for new `UPDATE notes SET content` is optional on top of it.
- [ ] **Public repo** — test fixtures use public pages only; no personal manuscript content.
      Research rail hidden until a book exists. New dependencies: `pdfjs-dist` in the backend
      (A3), `diff-match-patch` or an annotator library (C). New *optional* clipper permissions
      (`pageCapture`, per-origin host access) that a fork's users will be prompted for. README
      feature list updated when A1 + B ship.
- [ ] **Docs** — project-description (data model, API, routes, migration list), roadmap, status.
- [ ] **Cross-repo** — ocr-llm handoff for the `noted_source_metadata` task, filed when A3
      starts and not before.

## 14. Testing

- **Backend** (`backend/tests/cr039-*.test.js`): chapter CRUD + reorder transaction (swap two
  chapters — exercises the deferred constraint); one-active-book; source create and
  duplicate-URL 409 (live and trashed); read-only 422 on each §6.1 path; cross-user
  chapter-assignment rejected; highlight CRUD + computed membership (trashed source
  excluded); re-anchoring cases (exact, moved, edited, removed → orphaned); export snapshot
  tests per kind and per missing field; DOI/ISBN not accepted unless present in input;
  `user_id` isolation on every new table.
- **Added from technical review:** each §6.1 row (merge-into both directions, `auto_update`,
  `format` flip, `notebook_id`, a title-only rename still succeeds); a source is absent from
  `GET /notes` and `?in_inbox=true`; transactional rollback on a duplicate URL (no orphan note);
  a direct attachment delete of a source PDF returns 409; the trigger refuses a raw `UPDATE` of a
  source body and allows it under `replace-body`'s flag; book activation flips exactly one
  row; URL normalizer cases; clipper/server version skew.
- **Clipper**: fixture pages for each metadata source (Highwire, JSON-LD, OG-only, bare page).
- **Manual walkthrough**: clip → highlight → assign → export → paste into Word, desktop
  Chrome. iPad Safari reading should work; highlight creation on iPad is not a v1 requirement.

## 15. Review notes (2026-10-02)

Changes from the original proposal, each traced to the code:

1. **`UNIQUE (book_id, sort_order)` made `DEFERRABLE`** — as proposed, the reorder transaction fails on the first renumbered row.
2. **At most one active book** — partial unique index; `is_active` defaulted to FALSE (the proposal let every book be active).
3. **Read-only enforcement widened** from `PUT /notes/:id` to every content write path (checkin, translate, clip append, `note_type` changes) — §6.1.
4. **Error bodies** use the project shape `{ error, message, statusCode }`, not `{ code }`.
5. **Membership view dropped** for a repository query — the view had no `user_id` and ignored trashed source notes.
6. **Cross-user join-table inserts** called out explicitly (no `user_id` on join tables, per `note_tags`).
7. **Duplicate URL vs trash** handled (`in_trash` in the 409).
8. **Snapshot upload moved to multipart** — the base64-in-JSON design would hit Fastify's 1 MiB default.
9. **Clipper permissions** — `pageCapture` optional rather than required; PDF fetch path flagged for verification; no server-side URL fetch.
10. **LLM extraction via `generateText`** (CR038 providers), not a gateway-only task; `metadata_llm_fields` added so individual fields can be flagged; DOI/ISBN check moved server-side.
11. **PDF.js viewer shared with CR025** rather than built twice.
12. **Phase E's own pgvector migration dropped** — CR001 owns the extension and dimension (768 vs the proposal's 1024).
13. **Migration numbers unpinned** — CR038 is active and may take the next number first.
14. **Sources excluded from the Notes list** (D9). *Corrected in the technical review: the original premise that ideas are already excluded was wrong (§15b B2).*
15. **Indexes added** on `user_id` for every owned table and on the chapter side of each join table.
16. **Personal details generalized** (book title, owner name, Drive outline file) — the repo is public.

### 15b. Technical review, pass 1 (2026-10-02): clear with changes

Folded into the text above:
- **B1:** the §6.1 path list was incomplete (merge-into, Drive auto-update, `format`,
  `notebook_id`). The clip-append row was wrong, and a "content present" guard would have
  broken renames.
- **B2:** D9's premise was false. `GET /notes` hides ideas only in the Inbox branch, so
  sources would have landed in the Inbox.
- **B3:** no transactions or `23505` mapping, which left orphan source notes; the book
  activation order hazard; the LLM could fill `url`.
- **S1:** contract v1, the bridging-model line, explicit `userId`/`db`, visible extraction
  failure.
- **S2:** PDF text-layer extraction lifted from CR025 instead of gateway OCR.
- **S3:** the PDF.js auth conflict with CR025 recorded.
- **S5:** attachment FKs changed to `NO ACTION`.
- **S7:** URL normalization defined.
- **S8:** separate highlight search; `UNIQUE (book_id, label)`; the trash join on every
  highlight query.
- **S9:** multipart scope, MHTML type, a shared `storeAttachment` helper.
- **S10:** clipper feature detection.
- **Nits:** hard-delete highlights, citation title authority, HTML escaping, blob downloads,
  Safari clipboard, `replace-body` lock, the `sort_order` 409, tests.

Raised as open decisions: B1 backstop → §16 #9, S6 → §16 #10, S7 conversion → §16 #11, S4 → §16 #13.

### 15c. Sign-off, pass 2 (2026-10-02): revise (light) → approved for A1

Conditions, all now met in this text except the first, which is a separate fix:
1. Ship the CR038 `AI_KEYS_ENC_KEY` compose fix before any CR039 code.
2. Split Phase A into A1 / A2 / A3, with A1 + B as the first usable release (§12).
3. Decide the backstop and the isolation model before A1 (§16 #9, #10).
4. Track the deferred items in the roadmap, and put the PDF.js auth conflict on CR025's own text.

Also adopted: drop `.docx` from B; move the search filters to C; show the Research rail only
once a book exists; treat C, D and E as designs of record; note the typed-error gap in §9.

## 16. Decisions (2026-10-02)

Resolved with the owner in two question walkthroughs (#1–6 before review, #7–12 after);
each took the recommended option.

| # | Question | Decision |
|---|---|---|
| 1 | Chapter source of truth | **Manual entry** in Settings → Research. An import from an outline document can be a later CR once the outline is stable; the chapter schema doesn't change. |
| 2 | Sources in the Notes list (D9) | **Hidden, like ideas.** Sources have no notebook and live under Research; global search still finds them. |
| 3 | Highlight color meaning | **Fixed legend:** yellow = evidence, red = counter-argument, green = quote-worthy, blue = follow-up. A code constant, not a setting. The popover shows labels, and the Passages tab filters by meaning. Moving to a user-defined legend later needs no schema change. |
| 4 | Citation style | **Chicago (18th ed.) bibliography.** Confirm with the publisher when one is signed; the formatter is one isolated module so the style can be swapped. |
| 5 | Relationship to CR025 | **Share only the PDF.js viewer.** Whether a CR025 document can be promoted to a source is decided when the second of the two CRs is built. |
| 6 | Personal details in the public repo | **Keep the CR generic.** No book title, owner name or Drive filename in the tree. |

| 7 | Phase A shape | **Split into A1 / A2 / A3**; first usable release is A1 + B; search filters move to C (§12). |
| 8 | `.docx` export | **Deferred.** B ships html (Copy for Word) and md; add `.docx` if a publisher asks for a file. |
| 9 | Database backstop for read-only bodies | **Route guards plus a `BEFORE UPDATE` trigger**, with a `SET LOCAL` bypass used only by `replace-body` (§5.2). The codebase's first rule-enforcing trigger. |
| 10 | Join-table isolation | **Route checks plus an isolation test per join table**, following `note_tags`; no composite FKs. |
| 11 | Converting an existing plain clip | **Unsupported in v1.** Re-clip as a source; tracked as deferred on the roadmap. |
| 12 | Research rail visibility | **Shown only once a book exists.** Creating a book is the opt-in. |

### Open

13. **Where anchoring runs (decide before Phase C):** (a) client only — `replace-body` and
    live-page highlights store selectors, and the reader re-anchors on open and posts statuses
    back; (b) the server anchors against a plain-text projection of the Markdown; (c) a vendored
    module duplicated in both apps with a pinned-output test. *Technical reviewer recommends (a).*

## Outcome

### Phase A1 (built 2026-10-02; version in the [CR index](docs/cr/README.md))

Landed as designed in §5.1–§5.2, §6.1 and §12-A1: migrations `021_research_sources.sql` and
`022_source_attachment_same_note.sql`; `backend/src/routes/research.js`; the §6.1 guards in
`notes.js` and `driveImporter.js`; the Research rail item, panel, views, Reader view and
Settings → Research. Verified by `backend/tests/cr039-research.test.js` (70 assertions,
including a real second user for isolation; in `test:ci`) and a 24-step headless-Chromium
walkthrough covering desktop and a 390 px mobile viewport.

**Deviations and additions:**
- **Migration 022**, found by the migration review: the attachment FKs are composite
  `(id, note_id) → attachments`, so a source can only point at its own note's attachment.
  A cross-note pointer would have made emptying the trash fail with 23503.
- **`replace-body` is in A1**, not just a later phase. It is the trigger's only sanctioned
  bypass, so the read-only rule was untestable without it. It returns zero counts until
  highlights exist.
- **Added** `DELETE /books/:id` (otherwise a test book could never be removed, and the rail
  item never hidden). Deleting the active book promotes the oldest remaining one.
- **Added** `GET /sources?unassigned=true`, which backs the panel's Unassigned list.
- **No attachment area on source notes** (desktop and mobile), found by the UI review. An
  image upload auto-inserts a link into the body, which a source must refuse, and that
  would break every later autosave. PDF attachments for sources come with A3.
- **Chapter reorder uses up/down buttons**, not drag and drop. It's the same endpoint, and
  keyboard-accessible.
- **`published_date`** is returned as `YYYY-MM-DD` text. node-pg's `Date` would shift it by
  the server's time zone.
- **Manual entry status:** a complete manual entry (author + date) is created `verified`;
  otherwise `incomplete`. Any `PUT /sources/:id`, including `{}` (the Verify button), sets
  `verified`.
- **Mobile:** sources open in the Reader view, but the mobile shell has no rail, so
  `/research` is reachable only by link on a phone. A mobile entry point is deferred.

**Reviews:** the security review and the migration review (scratch DB built from 001–022)
found nothing blocking. The UI review found two High issues, both fixed: the
attachment-area bug above, and library rows that only opened on a mouse click (titles are
now links). Its Medium and Low items were also applied: Escape, focus and dialog semantics
in the source form; request ordering plus error and empty states in the library; switching
books; the double scroll on mobile; labels; date validation. Still open from it: no paging
past 200 sources (the count says "Showing N of M"), and opening a source switches the rail
to Notes. The Reader view's back link covers that for now. Their low-severity hardening was applied (user-scoped joins,
pool-safe rollback, 409 on concurrent book activation, input limits). Composite ownership
FKs were again declined per §16 #10. One pre-existing issue surfaced outside this CR:
`tag_ids` on `POST`/`PUT /notes` are not checked against the caller's own tags.
