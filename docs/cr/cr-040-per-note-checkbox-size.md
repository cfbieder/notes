# CR040 — Per-Note Checkbox Size (S / M / L)

**Status:** Completed (v0.26.0, 2026-10-12)
**Severity:** Feature (small)
**Origin:** User request, 2026-10-12

## Problem

Checklist notes (packing lists, shopping lists) render `- [ ]` / `- [x]` as the
browser's default-size checkbox (~13px). It is a small tap target on a phone and
hard to scan in a long list. The ask: let a note use a larger checkbox for every
box on it.

## Decision

**Per-note setting, stored in the database** (owner's choice over a per-device or
account-wide preference — a packing list should be large on every device).

- **Schema:** `notes.checkbox_size TEXT NOT NULL DEFAULT 'sm'` with
  `CHECK (checkbox_size IN ('sm', 'md', 'lg'))` — migration `024`. `sm` is today's
  size, so existing notes are unchanged.
- **API:** `PUT /api/v1/notes/:id` accepts `checkbox_size` (`sm` | `md` | `lg`).
  Reads already return it via `n.*`.
- **UI:** a toolbar button, shown only when the note contains a checkbox, cycles
  S → M → L. The editor body takes a `cb-size-<value>` class and CSS sizes
  `.cm-checkbox` (sm = browser default, md = 18px, lg = 24px).

## Out of scope

Rendered HTML notes and Export-as-PDF keep their default checkbox size. The button
is hidden on a note checked out for offline use (its edits go to the local copy,
which does not carry this field).

## Migration safety

`024` is additive with a default that matches today's rendering — safe to apply
before the UI ships.

## Implementation

- `backend/migrations/024_note_checkbox_size.sql`; `backend/src/routes/notes.js` (PUT field)
- `frontend/src/components/editor/EditorToolbar.vue` (button), `frontend/src/views/NotesView.vue`
  (cycle handler, `cb-size-*` class, CSS)
- `backend/tests/cr040-checkbox-size.test.js` (6 assertions, in `test:ci`)

## Acceptance

1. A note with checkboxes shows the size button; one without does not.
2. Clicking cycles S → M → L → S; every checkbox on the note resizes immediately.
3. Reloading the note (or opening it on another device) keeps the chosen size.
4. Other notes are unaffected; existing notes render at today's size.
