# CR037 — Multi-Note Editor Tabs (Desktop)

**Status:** Completed (v0.16.0, 2026-07-10)
**Severity:** Feature (small)
**Origin:** User request, 2026-07-10

## Problem

The desktop Notes editor is strictly single-note. The route `/notes/:id` is the
source of truth for which note is open, and [NotesView.vue](frontend/src/views/NotesView.vue)
holds one set of editor refs (`editorContent`, `noteTitle`, `saveTimer`) that it
reloads on every switch. Opening a second note replaces the first — there is no
way to keep several notes open and move between them (e.g. cross-referencing
project credentials while writing another note). The ask: a browser/IDE-style tab
strip at the top of the editor so multiple notes stay open at once.

## Decision

**Lightweight approach — a tab strip that is pure UI over a list of open note
IDs.** The *active* tab stays equal to the route (`/notes/:id`); clicking a tab
navigates the route and reuses the existing autosave-then-load machinery. No
per-tab live buffers, no refactor of `currentNote` / `saveTimer` / `checkoutState`.

The existing route watcher already **flushes the outgoing note's save before
loading the next** ([NotesView.vue](frontend/src/views/NotesView.vue), the
`watch(() => [route.name, route.params.id], …)` block): it clears the pending
`saveTimer` and `await saveNote()` before `loadNote(newId)`. Because a tab click
navigates the route, this "save before switch" guarantee is inherited for free —
tab actions must route through this same path, never bypass it. Matches today's
behavior (cursor/scroll not preserved on switch), so no behavioral regression.

Confirmed with the user: **desktop only** (mobile keeps its full-screen
single-note flow), and **tabs persist across reloads** via `localStorage`, with
stale tabs (deleted/trashed/404 notes) pruned.

### Considered and rejected

- **Full per-tab live buffers** (each tab keeps its own unsaved content, cursor,
  scroll in memory; instant switching). Nicer UX, but requires turning every
  global editor ref into a per-note collection and reworking the autosave
  debounce + offline-checkout logic — a large, higher-risk change. Rejected for
  weight; autosave already fires at 500 ms so the practical gap is small.
- **Mobile tabs.** Mobile uses a separate component tree (`MobileEditor`,
  screen-swap navigation) where a horizontal strip doesn't fit. Deferred.

## Scope

### In scope (v1)

- New persisted Pinia store tracking the open-tab list `{ id, title, routeName }`.
- New tab-strip component above the editor toolbar (desktop editor pane only).
- Register a tab whenever a note successfully loads (covers list click, wikilink /
  backlink nav, direct URL); keep the label in sync on rename; prune on
  hard-load-failure and on trash.
- Tab select → route push (reuses save-then-load). Tab close → remove; if it was
  the active tab, jump to a neighbour, else fall back to the list route.

### Out of scope (deferred)

- Per-tab cursor/scroll/unsaved buffers (the rejected "full" option).
- Mobile tabs.
- Drag-to-reorder, pinned tabs, "reopen closed tab", tab overflow menu.

## Frontend

| File | Change |
|------|--------|
| [frontend/src/stores/openTabs.js](frontend/src/stores/openTabs.js) | **New.** `tabs` array + `ensureOpen` / `updateTitle` / `close` (returns neighbour) / `pruneMissing`; `localStorage`-persisted (`noted:open-tabs`), hydrated in a `try/catch`. |
| [frontend/src/components/editor/EditorTabs.vue](frontend/src/components/editor/EditorTabs.vue) | **New.** Horizontal, theme-aware strip; props `tabs` + `activeId`; emits `select` / `close`; per-tab close button; `overflow-x: auto`, no hard cap. |
| [frontend/src/views/NotesView.vue](frontend/src/views/NotesView.vue) | Mount `<EditorTabs>` at top of `editor-pane`. `loadNote` calls `ensureOpen` on success (server + checkout paths) and `pruneMissing` on hard failure. `saveNote` calls `updateTitle`. New `selectTab` (route push) / `closeTab` (close → neighbour or `/notes`) handlers. |
| [frontend/src/stores/notes.js](frontend/src/stores/notes.js) | `trashNote` lazily imports the open-tabs store and calls `pruneMissing(id)` so a trashed note doesn't linger as a tab. |

No backend change. No new dependency. No migration.

## Backend

None.

## Acceptance

- [x] Clicking several notes in the list opens each as a tab; active tab tracks
      the open note (`activeId === route.params.id`).
- [x] Reopening an already-open note does not create a duplicate tab or reorder.
- [x] Editing a note then immediately clicking another tab saves the outgoing
      note first (inherited flush-before-switch).
- [x] Closing an inactive tab leaves the editor untouched; closing the active tab
      jumps to a neighbour; closing the last tab falls back to the list view.
- [x] Open tabs persist across a page reload; malformed persisted data is ignored
      without breaking the strip.
- [x] Trashing a note removes its tab; a hard-load-failure (404) prunes the tab.
- [x] Renaming a note updates its tab label after autosave.
- [x] Mobile (`< 768px`) still shows the single-note editor with no tab strip.
- [x] On app open (list route, before any note is opened) the persisted tab strip
      is visible above the note list; clicking a tab routes to that note.
      *(v0.16.1 follow-up — the strip previously only rendered inside the editor
      pane, so restored tabs were invisible until a note was opened.)*
- [x] Production build passes (`npm run build`); tab state-machine logic unit-
      verified (dedup, neighbour-on-close, persistence round-trip, malformed JSON).

## Risks

1. **Route de-sync.** The active tab is derived from `route.params.id`; if a tab
   action mutated the store without routing, the highlight would drift.
   Mitigation: `selectTab` / `closeTab` always go through `router.push`.
2. **Offline-unavailable vs deleted.** Only hard failures prune a tab; an
   offline-unreachable note keeps its tab (it may still exist server-side).
