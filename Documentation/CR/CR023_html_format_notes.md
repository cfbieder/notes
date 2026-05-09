# CR023 — HTML-Format Notes (Upload + Render)

**Status:** Completed (2026-05-09)
**Severity:** Feature (security-sensitive)
**Origin:** User request, 2026-05-08

## Problem

Notes are markdown-only. Markdown handles prose, lists, tables, and basic embeds well, but is poor for richly formatted "documents" — multi-column layouts, custom typography, inline SVG diagrams, styled callouts, exported web pages. Users currently have no way to bring such a document into Noter as a first-class note: the web clipper converts HTML→markdown (lossy), Drive import handles `.md`/`.txt` only, and the attachment uploader rejects `text/html`.

The ask: be able to upload a `.html` file and have it render as a note, preserving its formatting.

## Decision

Add a per-note `format` column (`'markdown' | 'html'`) and a render branch that runs HTML notes through DOMPurify before display. HTML notes default to a **read mode** (sanitized render); an explicit "Edit source" action swaps in CodeMirror as a plain-text editor for raw HTML. Editor stays CodeMirror; no WYSIWYG in v1. New `.html` import endpoint creates HTML-format notes; existing markdown paths are unchanged.

### Considered and rejected

- **Render-only HTML inside markdown notes** (turn on `html: true` in markdown-it). Smaller change, but mixes markdown and HTML in one body and forces sanitizer over every note render — broader attack surface for the same outcome.
- **Full WYSIWYG editor (TipTap / ProseMirror)**. Best authoring UX, but a major frontend refactor and loses plain-text portability. Not justified by the current need.
- **Server-side HTML→markdown conversion on upload** (Turndown). Lossy by design — would defeat the "preserve formatting" goal.
- **Source/preview toggle or split pane for HTML notes.** Toggle hides formatting while editing; split pane is a non-trivial layout change. Read-mode default with an explicit "Edit source" swap matches the markdown experience (you see formatted output most of the time) with the smallest UI change.

## Scope

### In scope (v1)

- New `notes.format` column with `markdown`/`html` constraint, default `markdown`.
- File upload → create note: accepts `.html` and `.md`; `format` set from MIME / extension.
- Render branch in `NotesView.vue` + print/export: HTML notes render via DOMPurify in a read-mode container; markdown notes use the existing CodeMirror-with-decorations pipeline.
- "Edit source" affordance on HTML notes that swaps the read-mode container for CodeMirror in plain-text mode (markdown lang plugin and all markdown decoration / wikilink / table-keymap extensions disabled when `format = 'html'`).
- Sidebar / list views show a small badge or icon distinguishing HTML notes.
- Search snippet generation strips HTML tags for `format='html'` rows so [SearchView.vue:76](../../frontend/src/views/SearchView.vue#L76) doesn't `v-html` raw markup into the result list.

### Out of scope (deferred)

- WYSIWYG editor for HTML notes.
- Wikilinks, backlinks, and `[[autocomplete` inside HTML notes (parser is markdown-only). HTML notes will not appear in graph/backlink views. Documented as a v1 limitation.
- Conversion between formats (HTML ↔ markdown) on existing notes.
- Editing image/asset references inside uploaded HTML — relative paths and `<img src="...">` referencing external assets render as-is; broken links are the user's problem.
- AI Assist on HTML notes (LLM prompts assume markdown).
- Format-aware tsvector cleaning — HTML tags will pollute the search index slightly. Acceptable for v1; tracked as follow-up.

## Sanitization Policy

DOMPurify with default config plus deliberate allow/deny:

- **Allowed by default (kept):** standard block + inline tags, tables, headings, lists, images, links.
- **Explicitly allowed:** `<style>` (scoped via prefix), `<svg>` and SVG children, `data:` URIs in `<img src>` (for self-contained pages).
- **Explicitly blocked:** `<script>`, `<iframe>`, `<object>`, `<embed>`, all `on*` event handlers, `javascript:` URIs, `<meta http-equiv>`, `<link>`.
- **Style scoping:** prepend a per-note container class to all selectors in any allowed `<style>` block, to prevent uploaded CSS from bleeding into the app shell. (Use `dompurify` `uponSanitizeElement` hook + a tiny CSS rewriter, or fall back to stripping `<style>` if scoping turns out fiddly — decide during implementation.)

Sanitize on **render**, not on **store**. Storing the raw upload preserves user intent and lets us re-sanitize if the policy changes.

## Data Model

Forward-only migration `018_note_format.sql`:

```sql
ALTER TABLE notes
  ADD COLUMN format TEXT NOT NULL DEFAULT 'markdown'
    CHECK (format IN ('markdown','html'));

CREATE INDEX notes_format_idx ON notes(format) WHERE format <> 'markdown';
```

No backfill needed — every existing row stays `markdown`.

## API

### New endpoint

`POST /api/v1/notes/import` (multipart, JWT auth)

- Accepts a single file: `.md`/`.markdown` (text/markdown, text/plain) or `.html`/`.htm` (text/html).
- Body fields: `notebook_id` (optional), `title` (optional override).
- Title precedence when not supplied: parsed `<title>` tag (HTML only) → filename without extension → `"Untitled"`.
- For HTML uploads of full documents (`<html><head><body>…`), keep the body content only; the sanitizer's parser already extracts body content by default, but the import path should normalize to body content before storing so the source view doesn't show `<head>`/`<meta>` boilerplate.
- Server reads bytes, sniffs MIME (do not trust client), enforces an upload size limit matching the existing attachments cap (audit `backend/src/routes/attachments.js` and reuse the same constant), creates a note with `format` set accordingly.
- Returns `{ data: { id, title, format }, meta: {} }`.

### Existing endpoints

- `POST /api/v1/notes`, `PATCH /api/v1/notes/:id` — accept optional `format` field; default `markdown`. Validate against the same constraint.
- `GET /api/v1/notes/:id` — response includes `format`.

## Frontend

### New / modified files

| File | Change |
|------|--------|
| `frontend/package.json` | Add `dompurify` |
| `frontend/src/lib/htmlSanitize.js` | New — wraps DOMPurify with the policy above; exports `sanitizeNoteHtml(raw)` |
| `frontend/src/views/NotesView.vue` | Branch on `note.format`. Markdown: existing CodeMirror-with-decorations path. HTML: render-mode `<article class="note-html" v-html="sanitized">` with an "Edit source" toggle in the toolbar. |
| `frontend/src/components/editor/EditorToolbar.vue` | Add "Edit source" / "Done editing" toggle visible only when `format='html'`. |
| `frontend/src/components/editor/CodeMirrorEditor.vue` | Accept a `format` prop. When `'html'`: skip markdown lang plugin and all markdown-specific extensions (`markdownRendering`, `wikilinkRendering`, `wikilinkAutocomplete`, `tableKeymap`). Plain text editing only. |
| `frontend/src/lib/printNote.js` | Same branch — HTML notes skip markdown-it, run through `sanitizeNoteHtml`, then write to the print window. |
| `frontend/src/components/sidebar/AppSidebar.vue` (or wherever the note list renders) | Show a small `HTML` badge for `format = 'html'`. |
| `frontend/src/views/SearchView.vue` | Strip HTML tags from search snippets for `format='html'` rows before rendering. |
| `frontend/src/components/ui/ImportNoteModal.vue` | New — file picker, optional notebook + title, calls `/notes/import`. |
| Note list toolbar (in `NotesView.vue`) | "New Note" becomes a split-button dropdown (`Markdown` default / `HTML`); new "Import" button alongside. |

### Creating a blank note

The existing "New Note" action becomes a split-button: clicking the main label creates a Markdown note (current behavior, one click). The dropdown caret offers `Markdown` / `HTML`, with the last-used choice remembered per session (UI-store, not persisted) so a user working on a series of HTML notes isn't forced through the dropdown each time. The chosen format is sent as `format` on `POST /api/v1/notes`.

### Rendering container

```html
<article class="note-html" :data-note-id="note.id" v-html="sanitized"></article>
```

CSS resets inside `.note-html` (max-width, default font, image fluidity) so uploaded pages display reasonably without overriding app chrome.

### View / edit modes for HTML notes

- **Default = read mode.** Opening an HTML note shows the sanitized render in the `.note-html` container — no editor surface visible.
- **Edit source.** Toolbar button swaps the read-mode container for `CodeMirrorEditor` configured for plain text (no markdown extensions). Save persists `body` and `format` unchanged; "Done editing" returns to read mode and re-runs the sanitizer.
- Markdown notes are unchanged — they keep the current inline-decorated CodeMirror experience and have no toggle.

## Backend

| File | Change |
|------|--------|
| `backend/migrations/018_note_format.sql` | New |
| `backend/src/routes/notes.js` | Accept/validate `format` on create + patch; return in GET responses |
| `backend/src/routes/import.js` | New — `POST /notes/import`, multipart, MIME sniff, 5 MiB limit |
| `backend/src/app.js` | Register import route |

No new dependencies needed server-side (multipart already supported via `@fastify/multipart` per attachments route).

## Acceptance

- [ ] Migration `018_note_format.sql` applies cleanly on a copy of prod DB; existing notes unaffected.
- [ ] `POST /api/v1/notes/import` with a `.html` file creates a note with `format='html'`; upload of a `.md` file creates `format='markdown'`.
- [ ] Uploads of disallowed MIME types return 400; > 5 MiB returns 413.
- [ ] Note view renders HTML notes with formatting preserved (inline `<style>`, basic SVG, tables, images).
- [ ] `<script>`, `on*` handlers, and `javascript:` URLs are stripped by sanitizer (verified by a small test fixture: `phase11-html-notes.test.js`).
- [ ] Sanitizer runs on every render, not just on upload (re-render after policy update reflects the new policy).
- [ ] Markdown notes render exactly as before (no regression in existing snapshot).
- [ ] HTML notes open in read mode by default (sanitized render visible, no editor surface).
- [ ] "Edit source" toggle swaps to `CodeMirrorEditor` in plain-text mode (no markdown extensions active); "Done editing" returns to read mode and re-renders.
- [ ] Saving an edited HTML note persists `body` with `format='html'` preserved.
- [ ] HTML notes show a badge in note list / sidebar.
- [ ] "New Note" split-button creates a Markdown note on main click and an HTML note when `HTML` is chosen from the dropdown; last-used choice is remembered for the session.
- [ ] Search snippets for HTML notes contain no raw markup (tags stripped before render).
- [ ] HTML import title precedence works: `<title>` tag → filename → `"Untitled"`; full-document uploads are stored as body content (no `<head>`/`<meta>` boilerplate in the source view).
- [ ] Print/export of an HTML note produces a styled print window matching the on-screen render.
- [ ] Documented limitations (no wikilinks, no AI Assist, no graph) are listed in `NOTED_CURRENT_STATE.md`.

## Risks

1. **XSS via sanitizer bypass.** Mitigation: DOMPurify is the industry default and actively maintained; we sanitize on render so the policy is the only attack surface and is upgradable. Add a small fixture test of known XSS payloads.
2. **Style bleed from uploaded `<style>` blocks.** Mitigation: scope to `.note-html` container, or strip if scoping is unreliable.
3. **Search noise from HTML tags in `content_tsv`.** Acceptable in v1 — small follow-up to strip tags before tsvector update.
4. **Backup/export consumers expecting markdown** (e.g. anything that re-renders note bodies outside the app). Audit during implementation; export endpoint should include `format` in the response.

## Follow-ups (separate CRs)

- WYSIWYG HTML editor.
- HTML ↔ markdown conversion utility.
- Wikilink/backlink support in HTML notes.
- tsvector cleaning for HTML.
- AI Assist support for HTML notes.
