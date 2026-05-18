# CR025 — PDF Document Management (Import, View, Folder Storage)

**Status:** Open
**Created:** 2026-05-18
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

New migration `019_documents.sql`:

```sql
CREATE TABLE documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notebook_id  UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,              -- defaults to filename without extension; user-editable
  filename     TEXT NOT NULL,              -- original filename for download
  mime_type    TEXT NOT NULL,              -- 'application/pdf' for v1
  size_bytes   BIGINT NOT NULL,
  storage_path TEXT NOT NULL,              -- relative path under UPLOAD_DIR
  page_count   INTEGER,                    -- populated post-upload via pdfjs-dist headless
  ocr_text     TEXT,                       -- populated from text layer (free) or OCR fallback
  text_source  TEXT,                       -- NULL = not yet processed, 'text_layer' | 'ocr' | 'none'
  ocr_tsv      TSVECTOR GENERATED ALWAYS AS (
                 to_tsvector('english', coalesce(title,'') || ' ' || coalesce(ocr_text,''))
               ) STORED,
  source_url   TEXT,                       -- web origin if applicable (clipper, future)
  source_drive_file_id TEXT,               -- Drive idempotency, mirrors import_history pattern
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
```

**Storage layout on disk** (reuses the `UPLOAD_DIR` env var and `{year}/{month}` pattern from attachments):
```
{UPLOAD_DIR}/documents/{year}/{month}/{document_id}/{filename}
```
Keeps Library files clearly separated from per-note attachments on the filesystem, which makes future bulk-export and backup scripting simpler.

**No new tables for folders.** `notebook_id` *is* the folder. When notebook nesting is added (see §9), the change is local to `notebooks` and the document model is unaffected.

**No wikilink-target table change.** `note_links` stays note-to-note. Document wikilinks are resolved at render-time against `documents.title` (see §6).

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

**Signed-URL dependency:** PDF.js's worker fetches the PDF bytes via a plain URL — it can't reliably set an `Authorization` header. Rather than reuse the JWT-via-`?token=` shim from `attachments.js` (which leaks tokens into history, proxy logs, and screenshots — see §7 security note in `NOTED_CURRENT_STATE.md`), **this CR depends on CR009 landing first**. CR009 introduces short-lived signed URLs (opaque token, distinct from the JWT) for `/attachments/:id`; CR025 reuses the same mechanism for `/documents/:id/file`. CR009 is small and self-contained; building CR025 on top of it ships clean instead of carrying the known weakness forward.

**Text-extraction pipeline (replaces OCR-everything):**

1. **On upload**, run `pdfjs-dist` headless to populate `page_count` and extract the embedded text layer. Free, fast (sub-second for hundreds of pages on text PDFs).
2. If the text layer yields non-trivial content → store in `ocr_text`, set `text_source = 'text_layer'`. Done.
3. If the text layer is empty or near-empty (scanned PDF) → set `text_source = 'none'` and **do not auto-OCR**. The frontend surfaces a "Looks scanned — OCR this document?" prompt the next time the document is opened in the viewer. On user confirm (with a warning if `page_count > 20`), `POST /documents/:id/ocr` fires `llmService.ocrFile` and updates `ocr_text` + `text_source = 'ocr'` when done.
4. OCR failures or user-declines leave `text_source = 'none'` — the document is still viewable and search-by-title still works.

This avoids spending LLM/OCR gateway time on the ~90%+ of PDFs that have a usable text layer, and gives the user explicit control over the expensive path.

**Page count:** populated by the same `pdfjs-dist` headless pass that extracts the text layer. One library on the backend, shared with the frontend viewer. Failure leaves `page_count` `NULL`.

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
- **Title collisions on upload:** if a PDF with the same title already exists in the target notebook, auto-suffix `(2)`, `(3)`, … to the title (matches OS file-manager behaviour). User can rename via inline edit in the list. The DB does not enforce uniqueness — the suffix is applied at upload time only.
- **"Needs OCR" affordance:** documents with `text_source = 'none'` render a subtle badge in the list and a banner in the viewer ("This PDF has no extractable text. **Run OCR?**"). Clicking opens a confirmation dialog; if `page_count > 20`, the dialog includes a warning ("This is a {N}-page document. OCR may take several minutes and use the local LLM gateway."). Confirm → `POST /documents/:id/ocr`. The badge clears when `text_source` flips to `'ocr'`.

### Viewer: `frontend/src/components/library/PdfViewer.vue`
- Uses `pdfjs-dist` (PDF.js). Ships as a worker for rendering.
- Page navigation, zoom, in-document text search.
- Honours the active theme — light viewer on Sapphire/Light, mild colour-inversion on Dark (PDF.js exposes a built-in setting; if it's insufficient, a CSS filter on the canvas suffices for v1).
- Deep-linkable: `/library/:notebookId?/:docId?#page=12` jumps to a specific page.
- Reused by an "Open in viewer" action on PDF attachments inside the note editor (modal overlay), so the in-note PDF preview UX also improves without separate code.

### Wikilink integration (`[[doc:Title]]`)
- **Parser:** extend `backend/src/services/wikilinkParser.js` to recognise the `doc:` prefix and resolve against `documents.title` (case-insensitive, user-scoped). Unprefixed `[[Title]]` continues to resolve note-first; falls through to documents only if explicitly prefixed — avoids ambiguity when a note and a doc share a title.
- **Autocomplete:** extend `frontend/src/lib/codemirror/wikilinkAutocomplete.js` — typing `[[doc:` switches the suggestion source to documents (`GET /documents?search=`).
- **Render:** in CodeMirror Normal Mode and the markdown renderer (`markdownRendering.js`), `[[doc:Title]]` renders as a styled pill that opens the document in the viewer.
- **Backlinks:** `GET /documents/:id/backlinks` does a `LIKE '%[[doc:' || title || ']]%'` scan of live notes (or, cleaner, populate `note_links` with a nullable `target_document_id` later — out of scope for v1; a literal scan is fine at expected scale).

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
- **Behaviour:** during a poll/scan, files in `library_folder_ids` with `mimeType = 'application/pdf'` are imported as **documents** (not notes). The existing `import_history` table is reused for idempotency, with `documents.source_drive_file_id` mirroring the Drive file ID.
- **OCR policy:** Drive imports run the text-layer extraction (free) but **never auto-OCR**. Scanned PDFs land with `text_source = 'none'` and the "Needs OCR" badge — the user triggers OCR on demand from the viewer per §6. This prevents a bulk Drive sync from monopolising the gateway with hundreds of multi-page scans.
- **Settings UI** (`frontend/src/views/SettingsView.vue`): under the existing Drive card, add a "PDF Library folders" section — same folder picker UX as the existing notes-import folder list, plus a notebook selector for the destination.
- **Auto-update:** out of scope for v1. PDFs are imported once; subsequent Drive updates do not overwrite. (Auto-update for notes already exists — that's a different file lifecycle.)

---

## 8. Migration / Backfill / Compatibility

- **No backfill required.** Existing PDF attachments stay where they are. The Library is additive.
- **Optional helper action** (post-v1): "Promote this PDF attachment to a Library document" button in the editor's `AttachmentZone` — copies the file into the documents tree, replaces the note's attachment reference with a `[[doc:Title]]` wikilink, deletes the attachment row. Tracked separately if desired.
- **System stats:** extend `backend/src/routes/system.js` to include document count + library disk usage in the existing System Status card.

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

- [ ] CR009 (signed attachment URLs) has shipped; `/documents/:id/file` and `/attachments/:id` both use the same signed-URL mechanism.
- [ ] Migration `019_documents.sql` applied; `documents` table + indexes present (including `text_source` column).
- [ ] `POST /documents` (multipart) uploads a PDF, returns metadata, file lands at `{UPLOAD_DIR}/documents/{year}/{month}/{id}/{filename}`.
- [ ] Title collisions in the same notebook auto-suffix `(2)`, `(3)`, …
- [ ] Upload triggers synchronous text-layer extraction via `pdfjs-dist` headless; `page_count` and `ocr_text` populated for text PDFs within seconds; `text_source` reflects outcome (`'text_layer'` | `'none'`). No automatic LLM/OCR call.
- [ ] `POST /documents/:id/ocr` triggers `llmService.ocrFile` on a `text_source = 'none'` document; on success, sets `text_source = 'ocr'`.
- [ ] `GET /documents/:id/file` streams the PDF with `inline` disposition; works embedded in PDF.js.
- [ ] `/library` view lists documents, filterable by notebook via the sidebar tree.
- [ ] PDF.js viewer renders pages, supports text search, page navigation, and zoom; honours the active theme.
- [ ] Viewer shows a "Run OCR?" banner on `text_source = 'none'` documents; documents with `page_count > 20` show a multi-minute warning before confirm.
- [ ] Drag-and-drop upload onto a notebook node uploads documents into that notebook.
- [ ] Drag-to-move documents between notebooks updates `notebook_id`.
- [ ] `[[doc:Title]]` in a note renders as a styled pill and opens the document in the viewer; the document's backlinks panel lists the citing note.
- [ ] Soft-delete sends documents to `/trash` (Documents tab); restore + permanent delete both work; permanent delete removes the file from disk.
- [ ] Drive integration: configured PDF folders import as documents into the chosen notebook; text layer extracted, scanned PDFs land with `text_source = 'none'` (no auto-OCR); re-running scan is idempotent.
- [ ] System Status card shows document count and Library disk usage.
- [ ] Tests under `backend/tests/phase14-documents.test.js` cover upload, text-layer extraction, manual OCR trigger, list, move, delete, restore, search join, wikilink resolution, and title-collision suffixing.

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

Open questions from the proposal phase, with the agreed answers folded into the sections above:

1. **Title collisions in the same notebook** → auto-suffix `(2)`, `(3)`, … at upload time. No DB-level uniqueness constraint. See §6.
2. **PDF parsing library** → `pdfjs-dist` headless on the backend. Same library as the frontend viewer; one PDF parser project-wide; opens the door to thumbnail generation later. See §5 (text-extraction pipeline) and §6 (viewer).
3. **Auth for file streaming** → CR025 depends on **CR009 (signed attachment URLs) landing first**. Both `/documents/:id/file` and `/attachments/:id` then share the same signed-URL mechanism. No JWT-via-`?token=` for the new endpoint. See §5 and §10.
4. **OCR cost on large PDFs** → restructured entirely. Every upload extracts the embedded text layer (free, via `pdfjs-dist`). OCR is **never automatic** — only fires on explicit user confirmation via `POST /documents/:id/ocr` from the viewer banner. Documents with `page_count > 20` show a multi-minute warning in the confirm dialog. Drive imports never auto-OCR. See §5 (text-extraction pipeline) and §7.
