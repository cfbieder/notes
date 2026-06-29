# CR030 — Sortable Notes List Columns (Title / Last Used)

**Status:** Completed
**Created:** 2026-05-25
**Shipped:** 2026-05-25 (v0.11.13)
**Author:** Feature request — user

---

## 1. Summary

The expanded notes list (rendered by [`NoteListPanel`](frontend/src/components/ui/NoteListPanel.vue) when no note is open — i.e. on `/notes`, `/notebooks/:id`, `/tags/:name`) currently shows stacked title-over-preview cards sorted by `pinned DESC, updated_at DESC`. Users have no way to find a note by name without scrolling or using search.

CR030 converts the expanded list into a two-column "table" — **Title** | **Last used** — with clickable column headers that toggle sort key and direction. The narrow sidebar list (when a note is open) keeps the current stacked-card style.

---

## 2. Goals / Non-Goals

### Goals
- In expanded mode: render a header row (`Title`, `Last used`) with click-to-sort and a direction arrow on the active column.
- Drop the body preview in expanded mode — title and last-used are the columns; the preview row is replaced by the date cell.
- Pinned notes remain grouped at the top regardless of sort key/direction (matches current behavior).
- Default sort stays `updated_at DESC` so the initial render matches today's order.
- Sort happens client-side on the already-fetched `notesStore.notes` array (the default `limit=50` and typical user data volume make this fine; no backend changes).

### Non-Goals (v1)
- Persisting sort preference across sessions (in-component state only — survives expanded↔collapsed transitions while on `/notes`, resets on hard navigation away).
- Adding a third column (e.g. `created_at`, `notebook`).
- Touching the narrow sidebar layout, IdeasView, InboxView, MobileNotesList, or TrashView.
- Backend `ORDER BY` changes or pagination-aware server-side sorting.

---

## 3. Implementation Notes

- New refs in `NoteListPanel.vue`: `sortKey` (`'title' | 'updated_at'`, default `'updated_at'`) and `sortDir` (`'asc' | 'desc'`, default `'desc'`).
- `sortedNotes` becomes a real sort instead of a passthrough: partition into pinned vs. unpinned, sort each group by the selected key/direction, concat pinned first.
- Title sort is case-insensitive (`localeCompare`).
- Clicking the active column flips direction; clicking the other column switches key and resets direction to its sensible default (`title` → `asc`, `updated_at` → `desc`).
- Expanded rows: a single horizontal row — title cell (flex: 1, with chips/icons inline) + date cell (fixed width, right-aligned). No `.note-preview`.
- Narrow rows: unchanged.

---

## 4. Acceptance

- [ ] Open `/notes` with no note selected — see a header row with "Title" and "Last used", arrow on "Last used" pointing down.
- [ ] Click "Title" — list re-sorts A→Z; arrow moves to "Title" pointing up. Pinned notes still on top.
- [ ] Click "Title" again — list re-sorts Z→A.
- [ ] Click "Last used" — list re-sorts newest→oldest; arrow moves back.
- [ ] Open a note (panel collapses to 280px sidebar) — narrow list still uses stacked-card layout, no header row.
- [ ] Pinned notes always lead each sort group.
