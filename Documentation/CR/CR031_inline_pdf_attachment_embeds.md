# CR031 — Inline PDF Attachment Embeds + Attachment Insert Action

**Status:** Completed
**Created:** 2026-05-25
**Completed:** 2026-05-25
**Author:** Implementation following user request

---

## 1. Summary

Two small additions to the note editor's attachment surface:

1. **Inline PDF rendering** in Normal Mode via the new `![[filename.ext]]` embed syntax — PDF attachments resolve to an `<iframe>` using the browser's native PDF viewer. Other types (images already render via standard `![](url)` markdown; non-PDF non-image embeds remain raw).
2. **"Insert into document" action** on each row of the `AttachmentZone` — a small corner-down-left icon button next to the trash icon. Click inserts the right markdown for the file's mime type at the editor's cursor position.

Scope is deliberately small and does not introduce a Library surface, PDF.js, or standalone documents — those are CR025's remit.

---

## 2. Goals / Non-Goals

### Goals
- See a PDF attachment's contents inside its host note, in Normal Mode, without leaving the editor.
- One-click insertion of any attachment at the cursor (image, PDF, other) into the note body.
- Reuse existing token-via-`?token=` shim already used by inline images.
- Do not regress `[[wikilinks]]` — `![[…]]` is distinguished from `[[…]]` at parse time.

### Non-Goals
- PDF.js viewer (page nav, search, theme tint) — covered by CR025.
- Cross-note PDF resolution / standalone documents.
- Signed-URL auth (CR009 / CR025).
- PDF rendering in source mode, print export, or HTML notes.

---

## 3. Approach

### Markdown syntax
- `![[filename.pdf]]` — Obsidian-style embed. Filename is matched (case-insensitive) against the current note's attachments. Distinguishes from `[[filename]]` (wikilink) via the leading `!`.

### CodeMirror plugin
- `frontend/src/lib/codemirror/pdfEmbedRendering.js` — `ViewPlugin` with `RangeSetBuilder`-based decorations:
  - Regex `/!\[\[([^\]]+)\]\]/g` finds embed candidates.
  - Lookup against `attachmentMap` (filename → `{ id, mime_type }`) provided by `NotesView`.
  - PDF match → `Decoration.replace` with `PdfEmbedWidget` (block-styled `<div>` wrapping a token-suffixed `<iframe>`).
  - Unknown name → `BrokenEmbedWidget` (red dashed underline).
  - Non-PDF resolved attachments → no decoration (raw text remains).
- Mirrors the existing `wikilinkRendering.js` pattern (cursor-line raw-text fallback, viewport-scoped rebuild, getter-based dependency injection so the editor never re-instantiates).
- Iframe `src` includes `?token=<jwt>` (same shim as image rendering in [markdownRendering.js:74-78](frontend/src/lib/codemirror/markdownRendering.js#L74-L78)).

### Wikilink regex
- `frontend/src/lib/codemirror/wikilinkRendering.js` and `backend/src/services/wikilinkParser.js` both change `/\[\[([^\]]+)\]\]/g` → `/(?<!!)\[\[([^\]]+)\]\]/g` so embed syntax is skipped by both renderer and backlinks indexer.

### Insert action
- `AttachmentZone.vue` — new `↪` (CornerDownLeft) icon button on each row, emits `insert-attachment` with the attachment object.
- `NotesView.vue` — `onInsertAttachment(att)` chooses syntax by mime type:
  - `image/*` → `![filename](/api/v1/attachments/<id>)`
  - `application/pdf` → `![[filename]]`
  - anything else → `[filename](/api/v1/attachments/<id>)`

  and calls `editorRef.value.insertAtCursor()` to drop it at the caret.

### Editor wiring
- `CodeMirrorEditor.vue` gains an `attachmentMap` prop and registers `pdfEmbedRenderPlugin(() => props.attachmentMap)` after the wikilink plugin (Normal Mode only).
- `NotesView.vue` computes `attachmentMap` from `attachmentsStore.attachments` (mirrors the existing `noteMap` pattern).

### Styling
- `sapphireTheme.js` adds three rules: `.cm-pdf-embed` (block container, rounded border), `.cm-pdf-embed iframe` (full-width, fixed 640px height, white bg), `.cm-embed-broken` (red dashed underline, monospace).

---

## 4. Files Touched

| File | Change |
|------|--------|
| `frontend/src/lib/codemirror/pdfEmbedRendering.js` | New — embed plugin + widget |
| `frontend/src/lib/codemirror/wikilinkRendering.js` | Wikilink regex now excludes `!`-prefixed embeds |
| `frontend/src/lib/codemirror/sapphireTheme.js` | Embed iframe + broken-embed styles |
| `frontend/src/components/editor/CodeMirrorEditor.vue` | Register embed plugin; new `attachmentMap` prop |
| `frontend/src/components/editor/AttachmentZone.vue` | Insert button + `insert-attachment` emit |
| `frontend/src/views/NotesView.vue` | `attachmentMap` computed; `onInsertAttachment`; pass map; wire emit |
| `backend/src/services/wikilinkParser.js` | Same regex change — embeds are not note links |
| `nginx/noted.conf` | `X-Frame-Options: DENY` → `SAMEORIGIN` (v0.11.18 hotfix) so the same-origin iframe can render |
| `frontend/src/components/mobile/MobileEditor.vue` | Wire `noteMap`/`noteTitles`/`attachmentMap` + `onInsertAttachment` (v0.11.20 mobile fix) |

---

## 5. Acceptance Criteria

- [x] Frontend builds without errors.
- [x] `![[filename.pdf]]` on its own line (Normal Mode) renders as an inline iframe of the matching PDF attachment.
- [x] Source Mode shows raw `![[…]]` text (plugin is Normal-Mode only).
- [x] Cursor placed on the embed line shows raw text (so it remains editable), matching wikilink behaviour.
- [x] `![[name-not-found]]` renders as a red dashed "broken embed" indicator instead of silently disappearing.
- [x] Existing `[[wikilinks]]` continue to render and resolve correctly; backend `note_links` is no longer polluted by `![[…]]` references.
- [x] Each attachment row in `AttachmentZone` has an insert button (between size and trash). Click inserts type-appropriate markdown at the cursor.
- [x] Embedded PDF viewer chrome (filename bar, page-nav, zoom) is hidden via `#toolbar=0&navpanes=0&scrollbar=0` Open Parameters appended to the iframe `src` (v0.11.19).
- [x] Nginx allows the same-origin iframe (`X-Frame-Options: SAMEORIGIN`, not `DENY`) — applied as v0.11.18 hotfix when the first deploy of CR031 showed "refused to connect."
- [x] Mobile editor renders embeds and supports the Insert button — `MobileEditor.vue` threads `attachmentMap` into `CodeMirrorEditor` (v0.11.20). Known limitation: Android Chrome has no native inline PDF viewer, so the iframe may render blank or trigger a download on Android; desktop Chrome renders fully inline.

---

## 6. Out of Scope / Follow-ons

- PDF.js viewer with page/search/zoom — see CR025. Would also solve the Android inline-render gap noted above.
- Cross-note `[[doc:Title]]` resolution — see CR025.
- Right-click context menu on attachment rows — not requested; current dedicated button is discoverable.
- Print/PDF-export rendering for embeds — `printNote.js` would need its own embed substitution pass; deferred.
