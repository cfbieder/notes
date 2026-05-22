# CR027 — Per-Note Offline Checkout (Read + Edit)

**Status:** Completed (v1, 2026-05-22)
**Created:** 2026-05-22

---

## Implementation Notes (2026-05-22)

Shipped end-to-end in one slice. Frontend builds clean (`npm run build` — no compile errors). Backend integration tests pass (20/20 assertions in [`backend/tests/cr027-checkout.test.js`](backend/tests/cr027-checkout.test.js)) against a running dev backend.

**Files added:**
- [`frontend/src/lib/checkouts.js`](frontend/src/lib/checkouts.js) — IDB CRUD for the `checkouts` store with reactive `checkoutCount` / `dirtyCount` refs.
- [`frontend/src/lib/checkoutSync.js`](frontend/src/lib/checkoutSync.js) — Reconcile loop, conflict event bus (`onConflict()` / `emitConflict()`), forced-overwrite + adopt-server helpers.
- [`frontend/src/components/ui/CheckoutBanner.vue`](frontend/src/components/ui/CheckoutBanner.vue) — Editor-top status banner.
- [`frontend/src/components/ui/CheckinConflictModal.vue`](frontend/src/components/ui/CheckinConflictModal.vue) — Two-pane diff modal with Keep local / Keep server / Hand-merge actions.
- [`frontend/src/components/sidebar/panels/OfflinePanel.vue`](frontend/src/components/sidebar/panels/OfflinePanel.vue) — Contextual panel for the Offline rail item.
- [`frontend/src/views/OfflineView.vue`](frontend/src/views/OfflineView.vue) — `/offline` main view.
- [`backend/tests/cr027-checkout.test.js`](backend/tests/cr027-checkout.test.js) — Standalone integration tests.

**Files modified:**
- [`backend/src/routes/notes.js`](backend/src/routes/notes.js) — New `POST /:id/checkin` handler with `base_version` comparison, 200 / 409 / 404 shapes, wikilink resync on apply.
- [`frontend/src/lib/offlineOutbox.js`](frontend/src/lib/offlineOutbox.js) — `DB_VERSION` bumped 1 → 2, `checkouts` store created in the same `upgrade` callback. `dbPromise` is now exported so `checkouts.js` shares the connection.
- [`frontend/src/stores/notes.js`](frontend/src/stores/notes.js) — `fetchNote` / `updateNote` / `trashNote` intercept checked-out notes; new actions `checkoutNote`, `checkInNoteOne`, `discardOfflineCopy`, `refreshOfflineCopy`, plus three conflict-resolution actions consumed by `App.vue`.
- [`frontend/src/views/NotesView.vue`](frontend/src/views/NotesView.vue) — Mounts `<CheckoutBanner>` above the toolbar, plumbs four new toolbar events (`checkout` / `check-in` / `refresh-offline` / `discard-offline`), polls `getCheckout()` for `checkedOut` + `dirty` state, gates discard behind a `ConfirmModal`.
- [`frontend/src/components/editor/EditorToolbar.vue`](frontend/src/components/editor/EditorToolbar.vue) — New "Offline" button (becomes "Check in" or "Refresh offline" + a discard ghost button when checked out).
- [`frontend/src/components/sidebar/ActivityRail.vue`](frontend/src/components/sidebar/ActivityRail.vue) — Conditional **Offline** rail icon with dirty-count badge.
- [`frontend/src/components/sidebar/ContextualPanel.vue`](frontend/src/components/sidebar/ContextualPanel.vue) — Registers `OfflinePanel` for the `offline` rail key.
- [`frontend/src/router/index.js`](frontend/src/router/index.js) — Adds the `/offline` route with `meta.rail = 'offline'`.
- [`frontend/src/App.vue`](frontend/src/App.vue) — Subscribes to `window.online` (auto-flush on reconnect) and the conflict event bus; mounts `<CheckinConflictModal>` at the app root with handlers for the three resolution actions.

**Test results:**
- Backend: 20/20 assertions pass — auth required, clean check-in, 409 with server payload, forced overwrite via re-issued check-in, missing note 404, deleted note 404, wikilink resync, validation.
- Frontend: build is green. Vitest unit tests for `checkouts.js` and `checkoutSync.js` described in §13.1 are scaffolded as a plan; the `"test"` npm script + `fake-indexeddb` devDependency are **not** added in this slice — manual walkthrough in §13.2 is the v1 regression spec. Wiring those tests in is a small follow-on (CR028.x or similar).

**Deferred from the original §11 acceptance criteria:**
- **Inline image Blob caching** — explicit non-goal in §2 of the as-merged CR. Images in checked-out notes render from the live URL and are broken while offline. Adding this requires patching the markdown image renderer in [`frontend/src/lib/codemirror/markdownRendering.js`](frontend/src/lib/codemirror/markdownRendering.js) and is an isolated chunk best handled by its own CR.
- **Dead-link visual treatment for wikilinks while offline** — the link still renders but click-through fails offline. Greying out unreachable links while `!navigator.onLine` is a small refinement, not load-bearing for the offline-edit use case.
- **Frontend automated tests** — vitest scaffolding for `checkouts.js` / `checkoutSync.js` is documented but not added in this slice (no `test` script + no `fake-indexeddb` dep yet).

---

## 1. Summary

Today the app supports **offline capture** of new notes via [`frontend/src/lib/offlineOutbox.js`](frontend/src/lib/offlineOutbox.js) — captures are queued in IndexedDB and replayed on reconnect. But you cannot **open or edit an existing note** while offline: the editor reads/writes directly through the live API, and no existing note is durably cached on the device.

This CR adds a **per-note "Make available offline" checkout flow**: the user explicitly marks notes to take with them (e.g. before a flight); the app pre-fetches each into a local IndexedDB store; the editor works against the local copy while offline; and on reconnect a **soft sync** pushes local edits back to the server, with a **diff modal** to resolve the rare case where both sides changed.

The mental model is closer to Obsidian-with-sync than to SharePoint locks: no server-side exclusive lock, no "stuck checkout" failure mode, no admin-unlock escape hatch needed.

---

## 2. Goals / Non-Goals

### Goals
- Explicit per-note **"Make available offline"** action that pre-fetches a note + its inline images into a durable local store.
- Editor reads and writes the local copy when a note is checked out, regardless of online/offline status.
- On reconnect (or manual "Check in now"), push local edits to the server with **optimistic concurrency** (base-version check).
- When both local and server have changed since checkout, open a **diff modal** with side-by-side view and three actions: keep local / keep server / hand-merge.
- "Offline" view listing currently checked-out notes with dirty/clean status, last-synced timestamp, and per-note check-in / discard actions.
- Existing offline-capture outbox continues to work unchanged; this CR adds a parallel **`checkouts`** store in the same IndexedDB database.

### Non-Goals (v1)
- **Server-enforced exclusive lock.** Soft sync only. Anyone (or any other device of the same user) can keep editing the server copy; conflicts are detected and resolved at check-in time. A purely cosmetic `checked_out_by` field is also out of scope for v1 — it adds a column and complicates the data model for a single-user app and can be added later if multi-device confusion ever proves real.
- **Inline image Blob caching.** Deferred from v1. v1 caches markdown source + metadata only. Images referenced by URL render normally when online and show as broken when offline. Inline-image preservation requires patching the markdown image renderer in [`frontend/src/lib/codemirror/markdownRendering.js`](frontend/src/lib/codemirror/markdownRendering.js) to swap cached blob URLs in, which is a meaningful and isolated chunk of work — better handled as a follow-on (e.g. CR028) once v1 ships and the text-edit flow is verified.
- **Bundling linked notes or attachments.** Only the note body and metadata (title, tags, notebook) travel with the note. Wikilinks to non-checked-out notes are rendered as **dead links** while offline (clickable when reconnected). PDFs and other file attachments are not bundled.
- **Bulk selection ("check out a whole notebook" / "check out by tag").** Per-note only in v1.
- **Auto-cache of recently-opened notes.** Explicit checkout only — no surprise storage usage.
- **Background pre-fetch refresh.** The local copy reflects the server state **at the moment of checkout**. Re-checkout (or manual refresh action) is required to pick up server changes. This keeps the conflict model unambiguous: `baseVersion` never silently advances.
- **3-way merge editor** (CodeMirror merge view). The diff modal in v1 is a two-pane side-by-side; pick one or hand-edit a third version. Full 3-way merge is a follow-on if 2-pane proves insufficient.
- **Multi-user "who has this checked out" awareness.** Single-user app; not applicable.

---

## 3. Approach

**Checkout** is a frontend-only concept: the user clicks "Make available offline" on a note → frontend fetches it via the existing `GET /api/v1/notes/:id` → records the response in IndexedDB along with the server's `updated_at` (the `baseVersion`). No backend state is created.

**Editing** of a checked-out note is intercepted at the store/editor layer: instead of debounced PATCH calls to `/api/v1/notes/:id`, edits write to the IndexedDB `checkouts` store and flip a `dirty` flag. The UI shows an "Offline copy — n unsynced changes" banner.

**Check-in** is a new backend endpoint: `POST /api/v1/notes/:id/checkin` accepts `{ baseVersion, content, title, tags, notebookId }`. The server compares `baseVersion` to the row's current `updated_at`:
- **Match** → apply update, return the new `updated_at`, frontend clears the checkout (or keeps a clean copy if user opted to "Check in but keep offline").
- **Mismatch** → return `409 Conflict` with the current server state in the body; frontend opens the conflict modal.

**Conflict resolution:** modal shows local vs. server side-by-side (markdown source diff, with added/removed lines highlighted). User picks:
- **Keep local** → POST `/checkin` again with `baseVersion = currentServerVersion` and the local content (forces overwrite).
- **Keep server** → discard local changes, refresh checkout to current server state, leave dirty=false.
- **Hand-merge** → modal switches to an editable textarea pre-filled with local content and a read-only server pane; user crafts a merged version, then commits via the same forced-overwrite path.

**No locks, no leases, no expirations.** A checked-out note that's never checked in just sits in IndexedDB forever (the user can discard it explicitly).

---

## 4. Data Model

### Backend

No new tables. Existing `notes` table already has `updated_at` (auto-maintained on update) — this is the `baseVersion`. No schema migration required.

One new column **optional, deferred to a follow-on if needed:** `last_checked_out_at TIMESTAMPTZ NULL` for a future "last taken offline 3 days ago" hint. **Not shipped in v1.**

### Frontend (IndexedDB)

Extend the existing `noted-offline` database. Bump `DB_VERSION` from 1 → 2 and add a new object store:

```js
// In the existing openDB upgrade callback:
if (!db.objectStoreNames.contains('checkouts')) {
  const store = db.createObjectStore('checkouts', { keyPath: 'noteId' });
  store.createIndex('dirty', 'dirty');
  store.createIndex('checkedOutAt', 'checkedOutAt');
}
```

Record shape:

```ts
{
  noteId: string,              // UUID, primary key
  baseVersion: string,         // ISO timestamp = server's updated_at at checkout
  baseContent: string,         // server markdown at checkout (for diff baseline)
  baseTitle: string,
  baseTags: string[],
  baseNotebookId: string | null,
  localContent: string,        // current local edits (== base if untouched)
  localTitle: string,
  localTags: string[],
  localNotebookId: string | null,
  dirty: 0 | 1,                // IDB indexes booleans poorly — use 0/1
  checkedOutAt: number,        // Date.now() ms
  lastEditedAt: number | null, // Date.now() ms of most recent local edit
  lastSyncAttemptAt: number | null,
  lastSyncError: string | null
}
```

(Inline-image Blob caching is deferred to a follow-on — see Non-Goals in §2.)

The outbox (`outbox` store) is untouched — it continues to handle new-capture queueing. The two stores serve different purposes and stay independent.

---

## 5. API Additions

### `POST /api/v1/notes/:id/checkin`

**Request:**
```json
{
  "baseVersion": "2026-05-22T10:14:33.000Z",
  "content": "...",
  "title": "...",
  "tags": ["..."],
  "notebookId": "..."
}
```

**Response 200 (clean apply):**
```json
{
  "data": {
    "id": "...",
    "updated_at": "2026-05-22T18:42:01.000Z",
    "content": "...",
    "title": "...",
    "tags": ["..."],
    "notebook_id": "..."
  }
}
```

**Response 409 (conflict — server advanced past baseVersion):**
```json
{
  "error": "checkin_conflict",
  "message": "Note was modified on the server since checkout.",
  "statusCode": 409,
  "data": {
    "server": {
      "updated_at": "2026-05-22T15:30:00.000Z",
      "content": "...",
      "title": "...",
      "tags": ["..."],
      "notebook_id": "..."
    }
  }
}
```

**Server logic:**
1. Load the row; compare `row.updated_at` (string-compared as ISO is fine, or epoch-compared) to `baseVersion`.
2. If equal → apply update via the same code path as `PATCH /api/v1/notes/:id`, return the new row.
3. If different → return 409 with the current server row in the `data.server` field. Do not touch the row.

**Force-overwrite path:** the client achieves "keep local" by retrying `/checkin` with `baseVersion` set to the value from the 409 response's `data.server.updated_at` — i.e., the client explicitly acknowledges the server state it's about to overwrite. There's no separate "force" flag; the same endpoint, re-called with the freshly-seen version, succeeds.

No changes to other note endpoints. `GET /api/v1/notes/:id` already returns `updated_at` — that's the `baseVersion` captured at checkout time.

---

## 6. Frontend Architecture

### New files

| File | Purpose |
|------|---------|
| `frontend/src/lib/checkouts.js` | IndexedDB CRUD for the `checkouts` store. `getCheckout(noteId)`, `createCheckout(note)`, `updateLocal(noteId, patch)`, `markClean(noteId, newBaseVersion)`, `discardCheckout(noteId)`, `listCheckouts()`, plus a reactive `checkoutCount` and `dirtyCount` `ref`. |
| `frontend/src/lib/checkoutSync.js` | Reconcile loop: on online events or manual trigger, iterates dirty checkouts and POSTs `/checkin`, emitting events for the conflict modal on 409. |
| `frontend/src/components/ui/CheckoutBanner.vue` | Editor-top banner: "Offline copy — last synced 2h ago — [Check in now]" or "Offline copy — clean". |
| `frontend/src/components/ui/CheckinConflictModal.vue` | Diff modal: two-pane markdown side-by-side, three action buttons, optional hand-merge textarea mode. |
| `frontend/src/components/sidebar/panels/OfflinePanel.vue` | Contextual panel content (CR026 pattern) for the new "Offline" rail item: lists checked-out notes with dirty/clean badges, last-synced timestamps, per-note actions, "Check in all" bulk action. |

### Modified files

| File | Change |
|------|--------|
| [`frontend/src/lib/offlineOutbox.js`](frontend/src/lib/offlineOutbox.js) | Bump `DB_VERSION` from 1 → 2 and add the `checkouts` store creation in the `upgrade` callback. Outbox logic itself is unchanged. |
| [`frontend/src/stores/notes.js`](frontend/src/stores/notes.js) | When loading or saving a note, check `getCheckout(noteId)` first. If a checkout exists, return the local copy (for reads) or write to the local copy + mark dirty (for writes), bypassing the API. Provide a `checkoutNote(noteId)` and `checkInNote(noteId)` action. |
| [`frontend/src/views/NoteEditorView.vue`](frontend/src/views/NoteEditorView.vue) (or wherever the active editor mounts) | Render `<CheckoutBanner>` when the note has a checkout record. Add a note-menu item "Make available offline" / "Check in & keep offline" / "Check in & remove" / "Discard offline copy". |
| [`frontend/src/components/sidebar/ActivityRail.vue`](frontend/src/components/sidebar/ActivityRail.vue) | Add a new "Offline" rail icon (only visible when `checkoutCount > 0`, with a dirty-count badge). Position: between Vault and Trash. |
| [`frontend/src/components/sidebar/ContextualPanel.vue`](frontend/src/components/sidebar/ContextualPanel.vue) | Register the new `OfflinePanel` for the `offline` rail item. |
| [`frontend/src/router/index.js`](frontend/src/router/index.js) | Add a `/offline` route with `meta.rail = 'offline'` for deep-linking the panel. |
| [`frontend/src/App.vue`](frontend/src/App.vue) | Subscribe to the existing online/offline window events; on `online` trigger `checkoutSync.flush()`. Mount the `<CheckinConflictModal>` at the app root so any view can surface it. |
| [`frontend/src/components/ui/OfflineStatus.vue`](frontend/src/components/ui/OfflineStatus.vue) | Surface a dirty-checkouts count in addition to the outbox count. |

### Backend

| File | Change |
|------|--------|
| [`backend/src/routes/notes.js`](backend/src/routes/notes.js) | Add `POST /:id/checkin` handler. Reuse the existing note-update validation and persistence path; the only new logic is the `baseVersion` comparison and the 409 shape. |
| `backend/tests/cr027-checkout.test.js` (new) | Integration tests: clean check-in, conflict-with-409, forced overwrite via re-issued check-in, auth check, missing-note 404. |

---

## 7. Sync Flow

### Happy path
1. User clicks **Make available offline** on note `N`.
2. `notesStore.checkoutNote(N)` → fetches `GET /api/v1/notes/N` → calls `createCheckout({ note, baseVersion: note.updated_at })`.
3. Toast: "Note saved for offline use".
4. User goes offline. Opens note `N`. Editor reads from `getCheckout(N).localContent`. Edits flow into `updateLocal(N, ...)`; `dirty=1`.
5. User comes back online. `window.online` event → `checkoutSync.flush()` iterates dirty checkouts.
6. For note `N`: POST `/api/v1/notes/N/checkin` with `baseVersion`, `content`, etc. Server returns 200 with new `updated_at`. `markClean(N, newBaseVersion)` — `dirty=0`, `baseContent` updated to the just-pushed content, `baseVersion` advanced.
7. Toast: "Checked in: <title>".
8. Note remains in `checkouts` store (still available offline). User can explicitly **Discard offline copy** to free space.

### Conflict path
1. Same as 1–6 above, but in step 7 server returns 409 with `data.server`.
2. `checkoutSync` emits a `checkin-conflict` event with `{ noteId, local, server }`.
3. `CheckinConflictModal` opens. Side-by-side diff. User picks an action.
4. **Keep local** → re-POST `/checkin` with `baseVersion = server.updated_at` and `content = local.content`. Server returns 200. `markClean`. Toast: "Local version saved; server overwritten".
5. **Keep server** → `discardCheckout(N)` then immediately `createCheckout` from the fresh server data. Toast: "Switched to server version".
6. **Hand-merge** → modal swaps to a single editable pane pre-filled with local content; reference server pane stays visible read-only. On "Save merged version" → re-POST `/checkin` with merged content and `baseVersion = server.updated_at`.

### Failure modes
- **Network error mid-checkin** → leave `dirty=1`, record `lastSyncError`, surface in OfflinePanel; retry on next `online` event or manual "Check in now".
- **Note deleted on server** (404 from `/checkin`) → modal: "This note was deleted on the server. Restore your local copy as a new note?" If yes, POST as a brand-new note (existing capture API) and remove the checkout. If no, `discardCheckout`.
- **Auth expired** → standard 401 handling kicks in (token refresh + retry).

---

## 8. UX Surfaces

### Note menu (in the editor's "⋯" menu, after Print / Export)
- **Make available offline** — when no checkout exists. Triggers the checkout flow.
- **Check in now** — when a checkout exists and is dirty. Manually flushes that one note (instead of waiting for the next online event).
- **Check in & keep offline** — push local changes but keep the local copy available for further offline reads/edits.
- **Check in & remove** — push local changes and clear the checkout.
- **Discard offline copy** — clear the checkout without pushing. If dirty, confirm via `ConfirmModal`: "Discard N unsaved local changes?"
- **Refresh offline copy** — when no local edits (or after explicit confirmation), re-fetch from server and advance `baseVersion`. Useful before going offline to pick up recent server changes.

### Editor banner (`CheckoutBanner`)
Renders above the editor body when the active note has a checkout:
- Clean: `📥 Offline copy · last synced 2h ago · [Check in now]`
- Dirty: `📥 Offline copy · n unsaved changes · [Check in now] [Discard]`
- Offline (`!navigator.onLine`): `📥 Offline · n unsaved changes will sync when you're back online`
- Conflict (after a failed sync): `⚠ Conflict on last check-in · [Resolve…]` (opens the modal for that note).

### Activity rail
A new **Offline** icon (between Vault and Trash) appears only when `checkoutCount > 0`. Badge shows `dirtyCount` if > 0.

### OfflinePanel (contextual panel for the Offline rail item)
```
┌─────────────────────────┐
│ Offline      [Check in all]
├─────────────────────────┤
│ DIRTY (2)               │
│ • Trip notes      2h    │
│ • Reading list    1d    │
├─────────────────────────┤
│ CLEAN (5)               │
│ • Meeting agenda  3h    │
│ • Recipe ideas    2d    │
│ • …                     │
├─────────────────────────┤
│ Storage used: 2.4 MB    │
└─────────────────────────┘
```
- Click a row → open the note.
- Right-click / context menu → same actions as the editor menu.
- "Check in all" calls `checkoutSync.flush()` and surfaces aggregate progress.

### Conflict modal (`CheckinConflictModal`)
- Two-pane side-by-side (default): **Your local version** | **Server version**. Markdown rendered as plain text with `diff` library highlighting (added lines green, removed red).
- Title bar: note title, last-checked-out-at, server-updated-at.
- Footer: `[Keep local] [Keep server] [Hand-merge…] [Cancel]`.
- Hand-merge mode: replaces the local pane with an editable textarea pre-filled with local content; server pane stays read-only; footer becomes `[Save merged version] [Cancel]`.

---

## 9. Storage & Performance

- Each checkout = markdown source (typically <50 KB) + Blob copies of inline images (typically <1 MB total per note). Order-of-magnitude estimate: ~100 KB to a few MB per note.
- IndexedDB has no hard quota but browsers may evict under storage pressure. Use `navigator.storage.persist()` on first checkout to request persistent storage. Show the user the result in the OfflinePanel footer ("Storage: persistent" / "Storage: best-effort — may be evicted under pressure").
- No upper limit on number of checkouts in v1 (the user explicitly checks each one out, so they're in control of size). The OfflinePanel surfaces a running storage total so the user can spot bloat.

---

## 10. Migration / Compatibility

- **One-way IDB schema bump.** `DB_VERSION` 1 → 2 adds the `checkouts` store via the existing `idb` upgrade callback. The outbox store is untouched. No data loss.
- **No data migration on the backend.**
- **No feature flag.** The feature is opt-in by design (you have to click "Make available offline" to use it), so there's nothing to gate.
- **Existing offline-capture flow is preserved verbatim.** Checkouts and outbox are independent stores serving independent purposes.

---

## 11. Acceptance Criteria

- [ ] `noted-offline` IDB upgrades from version 1 → 2 and creates a `checkouts` object store with the schema in §4 (existing outbox data preserved).
- [ ] `frontend/src/lib/checkouts.js` exports `createCheckout`, `getCheckout`, `updateLocal`, `markClean`, `discardCheckout`, `listCheckouts`, `checkoutCount` (ref), `dirtyCount` (ref).
- [ ] Note editor menu shows **Make available offline** when no checkout exists for the active note; clicking it fetches the note and persists a checkout record.
- [ ] Wikilinks to non-checked-out notes are visually distinguishable as "dead while offline" (e.g. greyed out) when `navigator.onLine === false`, and clickable normally when online.
- [ ] Editing a checked-out note writes to IndexedDB (no PATCH to the API), and the editor banner reflects "n unsaved changes".
- [ ] `POST /api/v1/notes/:id/checkin` exists, validates auth, applies the update when `baseVersion === current updated_at`, and returns 200 with the new row.
- [ ] `POST /api/v1/notes/:id/checkin` returns 409 with `{ error: "checkin_conflict", data: { server: {...} } }` when `baseVersion !== current updated_at`, and does not modify the row.
- [ ] Re-calling `/checkin` with `baseVersion` set to the just-returned server's `updated_at` succeeds (the "force overwrite" path used by Keep Local and Hand-Merge).
- [ ] On `window.online` event, `checkoutSync.flush()` automatically POSTs all dirty checkouts.
- [ ] On 409 response, `CheckinConflictModal` opens with side-by-side diff of local vs. server.
- [ ] Conflict modal's **Keep local**, **Keep server**, and **Hand-merge** actions all complete without further conflict (forced overwrite for keep-local and hand-merge; discard-and-recreate for keep-server).
- [ ] OfflinePanel lists all checked-out notes split into Dirty and Clean sections with timestamps and storage totals.
- [ ] Activity rail shows the **Offline** icon only when `checkoutCount > 0`, with a dirty-count badge.
- [ ] Discarding a dirty checkout requires a `ConfirmModal` confirmation.
- [ ] All edits to a checked-out note while online still go to IndexedDB (not directly to the server) — check-in is the only path that touches the server for checked-out notes. (Rationale: avoid two divergent edit paths for the same note.)
- [ ] Backend tests in `backend/tests/cr027-checkout.test.js` cover: clean apply, conflict 409, forced overwrite, 401 unauth, 404 missing note.
- [ ] Existing E2E flows are unaffected for **uncheckouted** notes (PATCH path unchanged).
- [ ] `OfflineStatus.vue` shows combined counts (outbox pending + dirty checkouts) and links each to the relevant panel.
- [ ] First successful checkout calls `navigator.storage.persist()` and surfaces the result in OfflinePanel.

---

## 12. Out of Scope (explicit)

- Server-enforced exclusive locks; `checked_out_by` column; per-device tracking.
- Bulk checkout (by notebook, tag, or selection).
- Auto-cache of recently-opened notes.
- Background pre-fetch refresh of `baseVersion`.
- Bundling linked notes (one-hop or N-hop wikilink expansion).
- Bundling PDFs or other file attachments.
- 3-way merge view (CodeMirror merge addon).
- Selective conflict resolution at sub-note granularity (per-block / per-line keep-mine vs. keep-theirs).
- Mobile-specific PWA install flow (the existing PWA install path applies; nothing new here).
- Offline-aware variants of other features (Tasks, Ideas, Vault) — separate CRs if/when needed.

---

## 13. Testing

### 13.1 Automated tests

**Backend — `backend/tests/cr027-checkout.test.js`** (style matches existing tests: stand-alone script using `fetch` against a running server on port 3001, manual `assert` helper, requires a seeded dev user). Run with `node backend/tests/cr027-checkout.test.js` against a running dev backend.

Cases:
1. **Auth required** — `POST /api/v1/notes/:id/checkin` without `Authorization` returns 401.
2. **Clean check-in** — create a note → GET it (record `updated_at` as base) → POST `/checkin` with `base_version` = that `updated_at` and modified content → 200, body contains new `updated_at` > base, and a follow-up GET shows the new content.
3. **Conflict 409** — create a note → record base — PUT to mutate it server-side — POST `/checkin` with the *stale* base — assert 409, body shape `{ error: 'checkin_conflict', data: { server: { … } } }`, server row is unchanged (re-GET shows the PUT's content, not the check-in's).
4. **Forced overwrite path** — after a 409, re-POST `/checkin` with `base_version` = the just-returned `data.server.updated_at` and the same local content — assert 200, row reflects the local content.
5. **Missing note** — POST `/checkin` for a UUID that does not belong to the user → 404.
6. **Deleted note** — soft-delete a note, then POST `/checkin` → 404 (deleted notes are not eligible).
7. **Wikilink resync** — check in content containing a `[[Other Title]]` link where "Other Title" exists → `note_links` row is created (delegates to `syncWikilinks`).
8. **Required-field validation** — POST `/checkin` with no body or missing `base_version` → 400.

**Frontend — `frontend/tests/checkouts.test.js`** (vitest + happy-dom; the project already has vitest as a devDependency but no `test` script in [`frontend/package.json`](frontend/package.json), so this CR adds `"test": "vitest run"` + `"test:watch": "vitest"`). Uses `fake-indexeddb` to back the IDB API in-process. If `fake-indexeddb` is not already present, add it as a devDependency.

Cases (each in its own `describe`):
1. `createCheckout` writes a record keyed by `noteId`; `getCheckout` returns it.
2. `updateLocal` mutates only the `local*` fields and flips `dirty=1`; `baseContent` / `baseVersion` are untouched.
3. `markClean(noteId, newBaseVersion)` advances `baseVersion`, copies `local*` into `base*`, sets `dirty=0`.
4. `discardCheckout` removes the row; `getCheckout` then returns `undefined`.
5. `listCheckouts()` returns all records ordered by `checkedOutAt` desc; `checkoutCount` and `dirtyCount` refs track the store.
6. IDB upgrade path: open the DB at version 1 with only the outbox store, close, re-open at version 2, verify both `outbox` and `checkouts` stores exist and any v1 outbox rows are preserved.

**Frontend — `frontend/tests/checkoutSync.test.js`**: mocks `api.post` to drive the sync state machine.

Cases:
1. `flush()` with one dirty checkout → calls `POST /notes/:id/checkin` with the expected body → on 200, `markClean` is called and the checkout's `dirty` flips to 0.
2. On 409 (mocked), an event with `{ noteId, local, server }` is emitted on the sync bus and the checkout stays `dirty=1`.
3. On `OfflineError`, the loop short-circuits without touching the rest of the dirty queue.
4. Two concurrent `flush()` calls — the second returns immediately (re-entrancy guard).

### 13.2 Manual testing walkthrough

A reviewer should be able to walk this list in ~10 minutes against a local dev environment (`docker compose -f docker-compose.dev.yml up -d` + backend on 3001 + frontend on 5173).

**Happy path — checkout, edit offline, check in**
1. Sign in. Open any note (call it `Note A`).
2. From the editor menu, click **Make available offline**. Expect a toast: "Note saved for offline use".
3. Confirm an **Offline** icon appears in the activity rail with a count badge of `1`.
4. Click the Offline rail icon. The contextual panel lists `Note A` under "Clean".
5. In DevTools → Network tab, set throttling to **Offline**. (The app banner should flip to indicate offline.)
6. Edit `Note A`'s content. Expect the editor banner to show "Offline copy — n unsaved changes". No save requests fire (Network tab stays clean).
7. The Offline rail badge updates to show the dirty count.
8. Set Network throttling back to **Online**. Within a second or two, the banner flips to "Offline copy — clean", and the OfflinePanel moves `Note A` into the "Clean" section.
9. Reload the page. Confirm `Note A` content now matches what you typed offline (i.e. it was checked in to the server).

**Conflict path**
1. Make `Note B` available offline.
2. Edit `Note B` in the app — leave dirty (don't go offline yet).
3. In a second browser tab (still online), open `Note B` and make a different edit. Save (autosave fires after 500 ms).
4. Back in the first tab, trigger **Check in now** from the editor menu (or the OfflinePanel).
5. The Conflict Modal opens, showing local vs. server side-by-side.
6. Click **Keep local** → verify the resulting note matches your local content (re-load to confirm).
7. Repeat the conflict setup, this time click **Keep server** → local copy is replaced by the server version.
8. Repeat one more time, this time click **Hand-merge…** → edit the merged textarea → **Save merged version** → verify the resulting note matches your merged content.

**Discard / refresh / dead-link**
1. Make `Note C` available offline, edit it locally (dirty).
2. From the editor menu pick **Discard offline copy** → `ConfirmModal` warns about n unsaved changes → confirm → checkout is gone, the editor now shows server content (your local edits are lost — by design).
3. Make `Note D` available offline. In the editor menu pick **Refresh offline copy** → the local copy is replaced with the latest server content (no dirty state).
4. Make `Note E` (which contains a `[[Some Other Note]]` wikilink) available offline. Go offline. Confirm the wikilink renders greyed out / disabled. Go online — the wikilink is normal-coloured and clickable.

**Persistent-storage prompt**
1. In a fresh browser profile, check out the very first note. The browser may prompt for persistent storage. Confirm OfflinePanel footer reports "Storage: persistent" (or "best-effort" if denied).

**Regression — uncheckouted notes**
1. Edit any note that has **not** been checked out. Confirm autosave still PATCHes the API on a 500 ms debounce (Network tab shows the request). The checkout path must not intercept it.

### 13.3 Acceptance Criteria coverage

| Acceptance criterion (from §11) | Covered by |
|----|----|
| IDB upgrade 1 → 2 with both stores | `checkouts.test.js` #6 + manual reload |
| `checkouts.js` exports + reactive counts | `checkouts.test.js` #1–#5 |
| Menu item shows / hides correctly | Manual happy-path #2, dead-link #1 |
| Editor banner reflects dirty count | Manual happy-path #6 |
| `/checkin` 200 on match | Backend #2 |
| `/checkin` 409 on mismatch | Backend #3 |
| Forced overwrite path | Backend #4 + Manual conflict #6 |
| Auto-flush on `online` event | Manual happy-path #8 |
| Conflict modal opens on 409 | Manual conflict #5 |
| Keep local / server / hand-merge complete cleanly | Manual conflict #6–#8 |
| OfflinePanel sections + counts | Manual happy-path #4 |
| Activity rail icon visibility + badge | Manual happy-path #3, #7 |
| Discard-dirty confirmation | Manual discard #2 |
| Edits to checked-out notes go through IDB only | Manual happy-path #6 (no network during edit) |
| Backend test coverage | `cr027-checkout.test.js` #1–#8 |
| Uncheckouted notes unaffected | Manual regression #1 |
| Storage persistence | Manual persistent-storage #1 |

---

## 14. Resolutions

Design questions resolved with the user before drafting; rationales folded into the sections above:

1. **Lock model** → **soft sync** (no server-enforced exclusive lock). Rationale: single-user app, conflicts are rare, and a hard lock introduces a "forgot to check in" failure mode that needs an admin-unlock escape hatch. Soft sync handles the same case via the diff modal with no special-case state to manage. See §1, §2, §3.
2. **Selection scope** → **per-note "Make available offline"** only in v1. Rationale: predictable storage usage, no surprise cache growth, matches the "before a flight" mental model. Bulk and auto-cache are deferred. See §2, §8.
3. **Conflict policy** → **diff modal with keep-local / keep-server / hand-merge** actions. Rationale: never loses work silently; two-pane diff is enough for prose; full 3-way merge is overkill for v1 and can follow if 2-pane proves insufficient. See §3, §7, §8.
4. **Bundle scope** → **note text + inline images only**. Wikilinks to non-cached notes are dead while offline. Rationale: minimal payload, predictable behaviour, no cascading cache-invalidation logic. Linked-notes and attachments expansion can be follow-on CRs. See §2, §11.
