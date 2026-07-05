# CR036 — Export Note as PDF (Markdown + HTML)

**Status:** Completed (v0.15.0, 2026-07-05) · fidelity fix v0.15.2
**Severity:** Feature (small)
**Origin:** User request, 2026-07-05

## Problem

Users can already get a PDF of a note, but only indirectly: the toolbar
**Print** button opens the styled print window ([printNote.js](frontend/src/lib/printNote.js))
and the user must then know to change the print destination to "Save as PDF".
The capability is real but undiscoverable — it is labelled "Print" with a printer
icon, and printing notes on paper is not the actual use case for a self-hosted
personal knowledge app. The ask: make **Export as PDF** a first-class, obvious
action that works for a note in either format (`markdown` or `html`) and writes a
`.pdf` to the local drive.

## Decision

**Reuse the existing print-window pipeline; relabel it as "Export as PDF."** No
new dependencies, no backend change, no bundle growth. `printNote.js` already
renders both formats to a clean, vector-quality print document (markdown via
markdown-it, HTML via DOMPurify — see [CR023](docs/cr/cr-023-html-format-notes.md)),
sets the note title as the document `<title>` (which browsers use as the default
PDF filename), and includes a title header + date. The browser's print dialog
converts that to a real `.pdf` with **selectable, searchable text** — the highest
fidelity available without shipping headless Chrome.

The only change is presentation: swap the printer icon/label for a PDF-oriented
icon/label/tooltip on both the desktop and mobile editor toolbars. Physical
printing remains available inside the same dialog for anyone who wants it.

### Considered and rejected

- **Server-side Puppeteer (headless Chrome) render route.** Gives a genuine
  one-click silent `.pdf` download at full fidelity, but adds ~300 MB of Chromium
  to the backend Docker image plus a new dependency and route — a steep cost to
  remove a single dialog click on a personal app. Rejected for weight.
- **Client-side library (`html2pdf.js` / jsPDF + html2canvas).** One click, no
  server change, but ~500 KB of bundle and — critically — **rasterized** output:
  text is not selectable or searchable, and page-break control is weak. Rejected
  because text quality is the thing that matters most in a notes PDF.
- **A separate third "Export as PDF" button** alongside Print + Download. Would
  duplicate Print's behavior exactly (both open the same print window) — clutter
  for no new capability. Rejected; we relabel the one button instead.
- **Batch / multi-select export.** Materially bigger feature (multi-select UI in
  the notes list; browsers block rapid `window.open`/`print` loops, or you need a
  real PDF-merge step, which pulls back toward the server engine we declined).
  Deferred to its own follow-up CR.

## Scope

### In scope (v1)

- Rename the desktop editor toolbar's **Print** control to **Export as PDF**:
  new icon (`FileDown` / document-download, replacing `Printer`), new visible
  label, updated tooltip. Same click → same `printNote(...)` flow.
- Same relabel on the mobile editor toolbar's print button for consistency.
- Confirm both formats route correctly: markdown notes render via markdown-it,
  HTML notes via `sanitizeNoteHtml` — already handled by the `format` argument
  passed from `NotesView.vue`. (Mobile currently calls `printNote` without the
  format argument — pass `noteFormat` so HTML notes on mobile export correctly.)
- Minor copy polish in `printNote.js`: change the on-page "Printed &lt;date&gt;"
  line to "Exported &lt;date&gt;" so the PDF reads as an export, not a printout.

### Out of scope (deferred)

- Batch / multi-note PDF export (own CR).
- True one-click silent download (would require the server or client PDF engine
  we rejected above).
- Combined "merge N notes into one PDF."
- Custom PDF page size / margins / header-footer configuration UI.
- Changing the raw-source **Download** button (`.md`/`.html`) — unrelated, stays.

## Frontend

| File | Change |
|------|--------|
| [frontend/src/components/editor/EditorToolbar.vue](frontend/src/components/editor/EditorToolbar.vue) | Line ~144–149: replace `Printer` icon with `FileDown`, label `Print` → `Export as PDF`, tooltip → `Export this note as a PDF`. Import swap in the `lucide-vue-next` line. Keep the `@click="$emit('print')"` emit name unchanged (internal). Rename `.print-btn` CSS class optionally — not required. |
| [frontend/src/components/mobile/MobileEditor.vue](frontend/src/components/mobile/MobileEditor.vue) | Line ~300–301: same icon/label/tooltip swap; and pass the note format: `printNote(noteTitle.value, editorContent.value, noteFormat.value)` (line ~245) so HTML notes export with formatting on mobile. Confirm `noteFormat` is available in this component; thread it in if not. |
| [frontend/src/lib/printNote.js](frontend/src/lib/printNote.js) | Line ~190: "Printed" → "Exported" in the `.print-date` line. No structural change. |

No backend change. No new dependency. No migration.

## Backend

None.

## Acceptance

- [x] Desktop editor toolbar shows an **Export as PDF** button (`FileDown`
      icon, not a printer) with a PDF-oriented tooltip.
- [x] Mobile editor toolbar shows the same relabelled action.
- [x] Clicking **Export as PDF** on a **markdown** note opens the styled print
      window; the browser's "Save as PDF" produces a `.pdf` with the note title
      as the default filename and selectable text.
- [x] Clicking **Export as PDF** on an **HTML-format** note (CR023) exports with
      its formatting preserved (sanitized render), on both desktop and mobile
      (mobile now passes `notesStore.currentNote.format`).
- [x] The exported page shows the note title header and an "Exported &lt;date&gt;"
      line (not "Printed").
- [x] Physical printing is still reachable from the same dialog (no capability
      lost).
- [x] Raw-source **Download** button is unchanged.
- [x] No new npm dependency added; production build passes (`npm run build`).

## Risks

1. **Discoverability vs. reality mismatch.** The label says "Export as PDF" but
   the user still lands in the print dialog and must choose "Save as PDF" as the
   destination. Mitigation: this is standard browser behavior users recognize;
   the tooltip sets the expectation. If it proves confusing, a follow-up can add
   a one-line hint in the print window ("Choose 'Save as PDF' as the destination")
   — cheap and non-blocking.
2. **Mobile format regression.** Mobile currently drops the `format` arg, so an
   HTML note would export as escaped markdown. Passing `noteFormat` fixes it; add
   a manual check for an HTML note on the mobile path.

## Post-release fixes

- **v0.15.2 — HTML notes now export with their own styling.** The initial
  implementation rendered HTML notes in the print window via `sanitizeNoteHtml()`,
  which *extracts and discards every `<style>` block* — so an HTML note's own CSS
  (dark theme, cards, timeline, colored badges) was dropped and the PDF was
  flattened, unstyled markup that didn't match the on-screen render. Fixed in
  [printNote.js](frontend/src/lib/printNote.js) to use `sanitizeNoteHtmlSplit()`
  with the same `.note-html` scope + container as `NotesView.vue`, re-inject the
  note's scoped CSS into the print `<head>`, add `print-color-adjust: exact` so
  background colors/graphics render in the PDF, and let HTML notes drive their own
  layout (no 800px markdown-column clamp; markdown notes unchanged). Verified: the
  discarded-CSS path captured 0 rules, the fixed path preserves all scoped rules.

## Follow-ups (separate CRs)

- Batch / multi-select PDF export (server- or client-side engine).
- Optional in-print-window hint text guiding the "Save as PDF" destination choice.
