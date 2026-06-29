# CR025 — PDF Document Management (Import, View, Folder Storage)

**Status:** Open
**Created:** 2026-05-18
**Updated:** 2026-05-19 (Resolutions v2 applied)
**Author:** Proposal — pending refinement before scheduling

---

## 1. Summary

Treat PDFs as **first-class documents** alongside notes, organised under the **existing notebooks/stacks hierarchy** (so PDFs and the notes that cite them live side-by-side), viewable in an **in-app PDF.js viewer**, and **importable** via direct upload, drag-and-drop, and the existing Google Drive integration. Linking back to notes is via **wikilinks** (`[[doc:Title]]`); otherwise the Library is its own browsing surface — list, search, viewer — and does not pollute the note list.

Today, PDFs only exist as attachments tied to a host note (`attachments.note_id NOT NULL`, `ON DELETE CASCADE`). OCR + search already work, but PDFs cannot exist independently, cannot be organised on their own, and there is no in-app viewer. This CR removes those limits while reusing the existing storage, OCR, and search plumbing.

---

## 2. Goals / Non-Goals

### Goals
- Standalone PDF documents (no host note required).
- Organisation in the existing two-level `stacks → notebooks` hierarchy, with a clear extension path to arbitrary nesting (see §9).
- In-app viewing (pages, zoom, text search, dark-mode friendly).
- Multi-file drag-and-drop import.
- Google Drive folder → Library folder import (mirrors current Drive-to-notes pipeline).
- OCR + full-text search across PDFs surfaces in the existing global search.
- Cross-link from notes to documents via `[[doc:Title]]` wikilinks; backlinks panel on the document view lists notes that reference it.
- Soft-delete + trash parity with notes.

### Non-Goals (v1)
- PDF annotation / highlight saving (Library is read-only viewing in v1).
- Editing PDF content.
- Arbitrary folder nesting beyond two levels (deferred — see §9).
- WebDAV / S3 storage backends.
- Sharing documents between users (Stage 3 multi-user concerns).
- Mobile-optimised viewer beyond what PDF.js gives out of the box.

---

## 3. Approach (Option C — Documents inside notebooks)

PDFs and the notes that reference them belong to the same notebook. This matches the user's actual workflow (PDFs are reference material for the notes that cite them) and avoids a parallel folder hierarchy. The Library is presented as a distinct *view* over the same notebook tree the user already knows.

A separate `documents` table — not a row in `attachments` — keeps the model clean:
- Attachments remain "files glued to a single note" (cascade-deleted with the note).
- Documents are standalone entities with their own lifecycle (rename, move-between-notebooks, soft-delete, restore).
- No collision with the existing attachment UI inside the editor.

---

## 4. Data Model

New migration `019_documents.sql` — adds the `documents` table plus three small alterations on existing tables (`import_history`, `note_links`) so backlinks and Drive idempotency share the established patterns:

```sql
CREATE TABLE documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notebook_id  UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,              -- defaults to filename without extension; user-editable
  filename     TEXT NOT NULL,              -- original filename for download
  mime_type    TEXT NOT NULL,              -- 'application/pdf' for v1
  size_bytes   BIGINT NOT NULL,            -- BIGINT (vs. attachments.size_bytes INTEGER) — see §8
  storage_path TEXT NOT NULL,              -- relative path under UPLOAD_DIR
  page_count   INTEGER,                    -- populated post-upload via pdfjs-dist headless
  ocr_text     TEXT,                       -- populated from text layer (free) or OCR fallback
  text_source  TEXT,                       -- NULL = not yet processed,
                                           -- 'text_layer' | 'ocr_pending' | 'ocr' | 'none'
  ocr_tsv      TSVECTOR GENERATED ALWAYS AS (
                 to_tsvector('english', coalesce(title,'') || ' ' || coalesce(ocr_text,''))
               ) STORED,
  source_url   TEXT,                       -- web origin if applicable (clipper, future)
  source_drive_file_id TEXT,               -- Drive idempotency at the row level
  deleted_at   TIMESTAMPTZ,                -- soft delete / trash
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX documents_user_live_idx ON documents(user_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_notebook_idx  ON documents(notebook_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_ocr_tsv_idx   ON documents USING GIN(ocr_tsv);
CREATE UNIQUE INDEX documents_drive_idempotent_idx
  ON documents(user_id, source_drive_file_id)
  WHERE source_drive_file_id IS NOT NULL;

-- Title uniqueness within a notebook (case-insensitive, live rows only) — see §6
CREATE UNIQUE INDEX documents_title_unique_per_notebook_idx
  ON documents(user_id, notebook_id, lower(title))
  WHERE deleted_at IS NULL;

-- Extend Drive import audit trail to cover documents (mirrors existing note_id pattern)
ALTER TABLE import_history
  ADD COLUMN document_id UUID REFERENCES documents(id) ON DELETE SET NULL;

-- Extend wikilink join table to point at documents (mirrors existing target_note_id pattern)
ALTER TABLE note_links
  ADD COLUMN target_document_id UUID REFERENCES documents(id) ON DELETE CASCADE;
-- Existing UNIQUE(source_note_id, target_note_id) is replaced by a partial form
-- so a note can link to both a note and a doc with the same title without colliding:
ALTER TABLE note_links DROP CONSTRAINT IF EXISTS note_links_source_note_id_target_note_id_key;
CREATE UNIQUE INDEX note_links_unique_note_target_idx
  ON note_links(source_note_id, target_note_id)
  WHERE target_note_id IS NOT NULL;
CREATE UNIQUE INDEX note_links_unique_doc_target_idx
  ON note_links(source_note_id, target_document_id)
  WHERE target_document_id IS NOT NULL;
CREATE INDEX note_links_target_document_idx ON note_links(target_document_id);
-- Every row must have exactly one target type
ALTER TABLE note_links
  ADD CONSTRAINT note_links_one_target_chk
  CHECK ((target_note_id IS NULL) <> (target_document_id IS NULL));
```

**Storage layout on disk** (reuses the `UPLOAD_DIR` env var and `{year}/{month}` pattern from attachments):
```
{UPLOAD_DIR}/documents/{year}/{month}/{document_id}/{filename}
```
Keeps Library files clearly separated from per-note attachments on the filesystem, which makes future bulk-export and backup scripting simpler.

**No new tables for folders.** `notebook_id` *is* the folder. When notebook nesting is added (see §9), the change is local to `notebooks` and the document model is unaffected.

**Wikilink target table extended.** `note_links` gains a nullable `target_document_id`; each row points at exactly one of a note or a document (CHECK constraint). This replaces the LIKE-scan backlinks approach proposed in v1 and makes `[[doc:Title]]` resolution and rename-cascade work the same way notes already do (see §6).

---

## 5. API (`backend/src/routes/documents.js`)

All endpoints prefixed `/api/v1`, JWT-authed via the existing `fastify.authenticate` (or the bearer-via-`?token=` shim already in `attachments.js` for the file stream endpoint).

```
GET    /documents?notebook_id=&search=&trash=        List documents (defaults: live, all notebooks)
POST   /documents                                     Multipart upload — fields: file (required),
                                                       notebook_id?, title?
GET    /documents/:id                                 Metadata only
GET    /documents/:id/file                            Streams the PDF bytes (Content-Type: application/pdf,
                                                       Content-Disposition: inline)
PUT    /documents/:id                                 Body: { title?, notebook_id? } — rename / move
DELETE /documents/:id                                 Soft-delete (sets deleted_at)
POST   /documents/:id/restore                         Clears deleted_at
DELETE /documents/:id?hard=true                       Permanent delete (file + row)
GET    /documents/:id/backlinks                       Notes that wikilink to this document
POST   /documents/:id/ocr                             Manually trigger OCR on a document where text
                                                       extraction yielded nothing (or to re-run OCR).
                                                       Returns 202 Accepted; status surfaces via the
                                                       document's text_source field on next fetch.
```

**Search integration:** extend `backend/src/routes/search.js` to `UNION` `documents` rows alongside `notes` and `attachments.ocr_tsv` matches, returning a `type` discriminator (`note | document`) so the frontend can route clicks. Add a `&type=document` filter parameter.

**Signed-URL dependency (CR009):** PDF.js's worker fetches the PDF bytes via a plain URL — it can't reliably set an `Authorization` header. Rather than reuse the JWT-via-`?token=` shim from `attachments.js` (which leaks tokens into history, proxy logs, and screenshots — see §7 security note in `NOTED_CURRENT_STATE.md`), CR025 ships on top of short-lived signed URLs.

If **CR009 has shipped** at the time CR025 starts: both `/documents/:id/file` and `/attachments/:id` use the existing mechanism unchanged. If **CR009 has not shipped**, CR025 folds the signed-URL work into its first commits (the change is small and self-contained — opaque short-lived token, distinct from the JWT, validated by the file-stream endpoints). Either way, CR025 ships with signed URLs; the JWT-via-`?token=` shim is never extended to the new endpoint.

**Filename sanitization on disk:** the on-disk filename is sanitized before write (mirrors [attachments.js:81-87](backend/src/routes/attachments.js#L81-L87)): strip non-alphanumerics, slice basename to 100 chars, prefix with `Date.now()`. The unmodified original is preserved in `documents.filename` for download `Content-Disposition`. The `{document_id}` segment already prevents disk collisions; sanitization closes the path-traversal / weird-filename edge case.

**Text-extraction pipeline (replaces OCR-everything):**

1. **On upload**, run `pdfjs-dist` headless to populate `page_count` and extract the embedded text layer. Free, fast (sub-second for hundreds of pages on text PDFs).
2. **If `pdfjs-dist` throws** (corrupt / malformed file): delete the uploaded bytes, return `422 Unprocessable Entity` (`"Could not parse PDF — file may be corrupt"`). No `documents` row is inserted. The user retries with a clean copy.
3. If the text layer yields non-trivial content → store in `ocr_text`, set `text_source = 'text_layer'`. Done.
4. If the text layer is empty or near-empty (scanned PDF) → set `text_source = 'none'` and **do not auto-OCR**. The frontend surfaces a "Looks scanned — OCR this document?" prompt the next time the document is opened in the viewer.
5. On user confirm (with a warning if `page_count > 20`), `POST /documents/:id/ocr` flips `text_source = 'ocr_pending'` synchronously and returns `202 Accepted`; the viewer renders a spinner. When `llmService.ocrFile` resolves, `ocr_text` is populated and `text_source` flips to `'ocr'`. On failure, `text_source` reverts to `'none'`.
6. OCR failures or user-declines leave `text_source = 'none'` — the document is still viewable and search-by-title still works.

This avoids spending LLM/OCR gateway time on the ~90%+ of PDFs that have a usable text layer, and gives the user explicit control over the expensive path. The `'ocr_pending'` state means the viewer always knows whether to render the banner, a spinner, or a hit-rendered text layer.

**Page count:** populated by the same `pdfjs-dist` headless pass that extracts the text layer. One library on the backend, shared with the frontend viewer. Setup uses a null-canvas factory (PDF.js's documented Node pattern) — DOM shims are not required for text extraction.

---

## 6. Frontend

### New view: `/library`
Three-pane desktop layout (mirrors `/notes` ergonomics):

```
┌──────────────┬─────────────────────┬──────────────────────────┐
│ Sidebar      │ Document list       │ PDF viewer               │
│ (existing    │ (current notebook   │ (PDF.js — pages, search, │
│  stacks/nb   │  filter applied)    │  zoom, theme tint)       │
│  tree, with  │  — title, size,     │                          │
│  Library     │  pages, OCR'd badge │ Backlinks panel below    │
│  highlight)  │                     │ shows notes citing this  │
│              │                     │ doc.                     │
└──────────────┴─────────────────────┴──────────────────────────┘
```

- **Sidebar:** add a top-level **📚 Library** entry above Settings. Clicking it enters Library mode where the notebook tree filters/scopes documents instead of notes. The same notebook tree component is reused; the right panes swap.
- **Drag-and-drop upload:** dropping files onto a notebook node uploads them as documents into that notebook. Dropping onto the Library root creates documents with `notebook_id = NULL` ("unfiled").
- **Move:** drag a document from the list onto another notebook node → `PUT /documents/:id { notebook_id }`.
- **Mobile:** stacked layout — folder list → doc list → viewer. PDF.js touch-scroll works out of the box.
- **Title collisions:** a partial unique index on `(user_id, notebook_id, lower(title)) WHERE deleted_at IS NULL` enforces uniqueness for live rows. On **upload**, the backend auto-suffixes `(2)`, `(3)`, … to satisfy the constraint (matches OS file-manager behaviour). On **rename or move-between-notebooks** (`PUT /documents/:id`), a conflict returns `409 Conflict` with a clear message — the user picks a different title or moves to a different notebook. This guarantees `[[doc:Title]]` resolves to exactly one document per notebook scope.
- **"Needs OCR" affordance:** documents with `text_source = 'none'` render a subtle badge in the list and a banner in the viewer ("This PDF has no extractable text. **Run OCR?**"). Clicking opens a confirmation dialog; if `page_count > 20`, the dialog includes a warning ("This is a {N}-page document. OCR may take several minutes and use the local LLM gateway."). Confirm → `POST /documents/:id/ocr`. The badge clears when `text_source` flips to `'ocr'`.

### Viewer: `frontend/src/components/library/PdfViewer.vue`
- Uses `pdfjs-dist` (PDF.js). Ships as a worker for rendering.
- Page navigation, zoom, in-document text search.
- Honours the active theme — light viewer on Sapphire/Light, mild colour-inversion on Dark (PDF.js exposes a built-in setting; if it's insufficient, a CSS filter on the canvas suffices for v1).
- Deep-linkable: `/library/:notebookId?/:docId?#page=12` jumps to a specific page.
- Reused by an "Open in viewer" action on PDF attachments inside the note editor (modal overlay), so the in-note PDF preview UX also improves without separate code.

### Wikilink integration (`[[doc:Title]]`)
- **Parser:** extend `backend/src/services/wikilinkParser.js` to recognise the `doc:` prefix and resolve against `documents.title` (case-insensitive, user-scoped). Unprefixed `[[Title]]` continues to resolve note-first; falls through to documents only if explicitly prefixed — avoids ambiguity when a note and a doc share a title. `resolveWikilinks` now writes either `target_note_id` or `target_document_id` into `note_links`, never both (CHECK constraint enforces this at the DB level).
- **Autocomplete (unified list):** extend `frontend/src/lib/codemirror/wikilinkAutocomplete.js` so typing `[[` returns both notes and documents from a single suggestion endpoint, each tagged with a type chip (📝 note / 📄 doc). Selecting a note inserts `[[Title]]`; selecting a doc inserts `[[doc:Title]]` automatically. The render-time resolution rule (note-first for unprefixed, explicit prefix for docs) is unchanged — autocomplete just makes the prefix discoverable without the user having to know about it.
- **Render:** in CodeMirror Normal Mode and the markdown renderer (`markdownRendering.js`), `[[doc:Title]]` renders as a styled pill that opens the document in the viewer.
- **Backlinks:** `GET /documents/:id/backlinks` queries `note_links` directly (`SELECT … WHERE target_document_id = $1`), joined to live notes. Indexed lookup, false-positive-free (no code-fence / quoted-text matches), and cascade-safe via the FK.

### Search
- Search results list gets a `Documents` tab alongside `Notes`. The default "All" tab interleaves both, with a type chip on each result row.
- Clicking a document hit opens it in `/library/.../docId#page=N` if `ts_headline` snippets identify a hit page (best-effort — fall back to page 1).

### Trash
- `/trash` view gains a `Documents` tab. Restore/permanent-delete actions mirror notes.

### Quick capture
- Out of scope. Library imports are deliberate; quick capture stays focused on notes/ideas/voice.

---

## 7. Google Drive Integration (v1 scope)

Extend `backend/src/services/driveImporter.js` and `backend/src/services/drivePoller.js`:

- **New config field** on the Drive integration (`integrations.config`): `library_folder_ids` (array of Drive folder IDs that should be scanned for PDFs) and optional `target_notebook_id` (default destination notebook for imported PDFs; `NULL` → unfiled).
- **Behaviour:** during a poll/scan, files in `library_folder_ids` with `mimeType = 'application/pdf'` are imported as **documents** (not notes). Idempotency uses the existing `import_history` table, extended in `019_documents.sql` with a nullable `document_id` FK alongside the existing `note_id` column. The poller's `LEFT JOIN` query at [drivePoller.js:180-186](backend/src/services/drivePoller.js#L180-L186) generalises naturally — one row per (integration, drive_file_id), populated with either `note_id` or `document_id`. `documents.source_drive_file_id` remains as a row-level convenience for direct lookup but the audit trail lives in `import_history` (single source of truth, failed imports recorded).
- **OCR policy:** Drive imports run the text-layer extraction (free) but **never auto-OCR**. Scanned PDFs land with `text_source = 'none'` and the "Needs OCR" badge — the user triggers OCR on demand from the viewer per §6. This prevents a bulk Drive sync from monopolising the gateway with hundreds of multi-page scans.
- **Settings UI** (`frontend/src/views/SettingsView.vue`): under the existing Drive card, add a "PDF Library folders" section — same folder picker UX as the existing notes-import folder list, plus a notebook selector for the destination.
- **Auto-update:** out of scope for v1. PDFs are imported once; subsequent Drive updates do not overwrite. (Auto-update for notes already exists — that's a different file lifecycle.)

---

## 8. Migration / Backfill / Compatibility

- **No backfill required.** Existing PDF attachments stay where they are. The Library is additive.
- **Optional helper action** (post-v1): "Promote this PDF attachment to a Library document" button in the editor's `AttachmentZone` — copies the file into the documents tree, replaces the note's attachment reference with a `[[doc:Title]]` wikilink, deletes the attachment row. Tracked separately if desired.
- **System stats:** extend `backend/src/routes/system.js` to include document count + library disk usage in the existing System Status card.
- **`size_bytes` width:** `documents.size_bytes` is `BIGINT` to accommodate PDFs > 2 GB. `attachments.size_bytes` remains `INTEGER` for now — widen in a future migration if attachments ever need to exceed 2 GB. No code change required in CR025.

---

## 9. Future: Deeper Folder Nesting

Two-level (stack → notebook) covers v1. When deeper nesting is wanted, the change is local to `notebooks` and does **not** require a documents migration:

1. Add `notebooks.parent_id UUID NULL REFERENCES notebooks(id)` (new migration).
2. Update the sidebar tree component to render recursively.
3. Update notebook list queries to use a recursive CTE for ancestor/descendant resolution.
4. Stacks become optional — a stack is effectively a top-level notebook with `parent_id = NULL`. A separate decision at that time on whether to migrate stacks into the notebook tree or keep both.

Because documents reference `notebook_id` (a leaf), they inherit any new hierarchy for free. Tracked as a follow-on CR after this one lands.

---

## 10. Acceptance Criteria

- [ ] Signed-URL mechanism in place: if CR009 has shipped, `/documents/:id/file` reuses it; if not, CR025's first commits implement signed URLs and both `/attachments/:id` and `/documents/:id/file` adopt them. JWT-via-`?token=` is never extended to the new endpoint.
- [ ] Migration `019_documents.sql` applied: `documents` table + indexes present (including the partial unique index on `(user_id, notebook_id, lower(title)) WHERE deleted_at IS NULL`); `import_history.document_id` column added; `note_links.target_document_id` column added with CHECK constraint that exactly one target is non-null.
- [ ] `POST /documents` (multipart) uploads a PDF, returns metadata, file lands at `{UPLOAD_DIR}/documents/{year}/{month}/{id}/{sanitized_filename}` where `sanitized_filename` is `Date.now()_basename(100chars).pdf` (matches attachments.js sanitize pattern). Original filename preserved in `documents.filename`.
- [ ] `POST /documents` with a corrupt PDF returns `422 Unprocessable Entity` and removes the uploaded bytes — no `documents` row inserted.
- [ ] Upload triggers synchronous text-layer extraction via `pdfjs-dist` headless (null-canvas factory, no DOM shims); `page_count` and `ocr_text` populated for text PDFs within seconds; `text_source` reflects outcome (`'text_layer'` | `'none'`). No automatic LLM/OCR call.
- [ ] Title collisions: upload into a notebook with an existing same-title (case-insensitive) document auto-suffixes `(2)`, `(3)`, …; `PUT /documents/:id` (rename or move) that would create a collision returns `409 Conflict`.
- [ ] `POST /documents/:id/ocr` on a `text_source = 'none'` document sets `text_source = 'ocr_pending'` synchronously, returns `202 Accepted`, then triggers `llmService.ocrFile`; on success flips to `'ocr'`, on failure reverts to `'none'`.
- [ ] `GET /documents/:id/file` streams the PDF with `inline` disposition via signed URL; works embedded in PDF.js.
- [ ] `/library` view lists documents, filterable by notebook via the sidebar tree.
- [ ] PDF.js viewer renders pages, supports text search, page navigation, and zoom; honours the active theme.
- [ ] Viewer shows a "Run OCR?" banner on `text_source = 'none'` documents, a spinner on `'ocr_pending'`, and the rendered text layer when `text_source IN ('text_layer','ocr')`; documents with `page_count > 20` show a multi-minute warning before confirm.
- [ ] Drag-and-drop upload onto a notebook node uploads documents into that notebook.
- [ ] Drag-to-move documents between notebooks updates `notebook_id`; cross-notebook moves that would collide on title return 409.
- [ ] Wikilink autocomplete: typing `[[` returns a unified suggestion list with notes and documents (each with a type chip); selecting a doc auto-inserts the `doc:` prefix into the buffer. `[[doc:Title]]` renders as a styled pill and opens the document in the viewer.
- [ ] Document backlinks are populated in `note_links` (via `target_document_id`) and `GET /documents/:id/backlinks` returns them via an indexed query, not a content scan. Renaming a document or note updates the backlinks panel without reindex.
- [ ] Soft-delete sends documents to `/trash` (Documents tab); restore + permanent delete both work; permanent delete removes the file from disk.
- [ ] Drive integration: configured PDF folders import as documents into the chosen notebook; text layer extracted, scanned PDFs land with `text_source = 'none'` (no auto-OCR); re-running scan is idempotent via `import_history` (`document_id` populated alongside the existing `note_id` pattern).
- [ ] System Status card shows document count and Library disk usage.
- [ ] Tests under `backend/tests/phase14-documents.test.js` cover: upload (success, 422 corrupt, sanitize), text-layer extraction, manual OCR trigger (pending → ocr → none on failure), title-collision suffixing on POST and 409 on PUT, list, move, delete, restore, search join, wikilink resolution (note vs. doc), backlinks via `note_links`, and Drive idempotency via `import_history.document_id`.

---

## 11. Out of Scope (explicit)

- Annotation / highlight saving in the viewer.
- Editing PDF content / form filling.
- Folder nesting beyond two levels (deferred — see §9).
- PDF→markdown conversion (would belong to the existing import surface, not Library).
- Mobile-bespoke viewer UI (PDF.js touch defaults are acceptable for v1).
- Sharing documents between users (Stage 3).
- Web clipper "Save page as PDF" mode (can be a small follow-on CR once the Library API exists).

---

## 12. Resolutions

### v1 (original proposal-phase questions)

1. **Title collisions in the same notebook** → auto-suffix `(2)`, `(3)`, … at upload time. (Superseded by v2 #3 — DB-level uniqueness constraint added.)
2. **PDF parsing library** → `pdfjs-dist` headless on the backend. Same library as the frontend viewer; one PDF parser project-wide; opens the door to thumbnail generation later. See §5 (text-extraction pipeline) and §6 (viewer).
3. **Auth for file streaming** → signed URLs (CR009 mechanism), not JWT-via-`?token=`. (Refined by v2 #9 — CR025 folds CR009 in if not already shipped.)
4. **OCR cost on large PDFs** → every upload extracts the embedded text layer (free, via `pdfjs-dist`). OCR is **never automatic** — only fires on explicit user confirmation via `POST /documents/:id/ocr` from the viewer banner. Documents with `page_count > 20` show a multi-minute warning in the confirm dialog. Drive imports never auto-OCR. See §5 (text-extraction pipeline) and §7.

### v2 (2026-05-19 review round)

1. **Drive idempotency tracking** → extend `import_history` with a nullable `document_id` FK alongside the existing `note_id`. One audit trail covers both notes and docs; failed PDF imports are recorded; the poller's `LEFT JOIN` query generalises naturally. `documents.source_drive_file_id` remains as a row-level lookup convenience but `import_history` is the single source of truth. See §4 (migration) and §7.
2. **Document backlinks via `note_links`** → extend `note_links` with a nullable `target_document_id` (mirrors `target_note_id`). CHECK constraint enforces exactly one target per row. Backlinks become an indexed lookup, false-positive-free, and rename-cascade-safe. Replaces the v1 LIKE-scan approach. See §4 (migration) and §6 (backlinks).
3. **Title uniqueness enforced at the DB** → partial unique index on `(user_id, notebook_id, lower(title)) WHERE deleted_at IS NULL`. Upload auto-suffixes `(2)`, `(3)`, … to satisfy the constraint; `PUT /documents/:id` returns `409 Conflict` on a clashing rename or cross-notebook move. Guarantees `[[doc:Title]]` resolves to exactly one document per notebook scope. See §4 (migration) and §6.
4. **OCR pending state** → extend `text_source` enum to `NULL | 'text_layer' | 'ocr_pending' | 'ocr' | 'none'`. `POST /documents/:id/ocr` flips to `'ocr_pending'` synchronously; viewer renders a spinner; flips to `'ocr'` (success) or `'none'` (failure) on completion. Single field carries all viewer-visible state. See §5.
5. **Backend PDF parser** → `pdfjs-dist` headless confirmed (v1 #2 stands). Setup uses PDF.js's documented null-canvas factory pattern — no DOM shims required for text extraction. See §5.
6. **Wikilink autocomplete UX** → unified suggestion list. Typing `[[` returns both notes and documents from one endpoint, each with a type chip. Selecting a doc auto-inserts the `doc:` prefix. Render-time resolution rule (note-first for unprefixed, explicit prefix for docs) is unchanged. See §6.
7. **Corrupt PDF on upload** → reject with `422 Unprocessable Entity` + cleanup. If `pdfjs-dist` throws during text-layer extraction, the uploaded bytes are deleted and no `documents` row is inserted. See §5 and §10.
8. **On-disk filename sanitization** → mirror [attachments.js:81-87](backend/src/routes/attachments.js#L81-L87): strip non-alphanumerics, slice basename to 100 chars, prefix with `Date.now()`. Original preserved in `documents.filename`. Closes path-traversal / weird-filename edge cases without changing the `{UPLOAD_DIR}/documents/{year}/{month}/{id}/…` layout. See §5.
9. **CR009 fallback** → if CR009 has not shipped when CR025 starts, the signed-URL work folds into CR025's first commits (small, self-contained). CR025 always ships with signed URLs; the JWT-via-`?token=` shim is never extended. Avoids indefinite blocking. See §5 and §10.
10. **`size_bytes` width asymmetry** → noted in §8. `documents.size_bytes` is `BIGINT`; `attachments.size_bytes` remains `INTEGER` for now and can be widened in a future migration if needed. No code change in CR025.
