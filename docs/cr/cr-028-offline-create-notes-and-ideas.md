# CR028 — Offline Create for Notes & Ideas (+ Icon Sweep)

**Status:** Open
**Created:** 2026-05-22
**Author:** Proposal — design questions resolved with user, pending scheduling

---

## 1. Summary

CR027 shipped "soft-sync offline editing" for **existing** notes. The complementary half — **creating brand-new notes or ideas while offline** — is partially working today via the `QuickCapture` modal (Alt+N / Alt+I), which has used the [`offlineOutbox`](frontend/src/lib/offlineOutbox.js) since before CR027 and already queues new captures with a `client_id` for idempotent replay. However, the **"+ New Idea"** button in [`IdeasView`](frontend/src/views/IdeasView.vue), the **"+ New Note"** button in [`NotesPanel`](frontend/src/components/sidebar/panels/NotesPanel.vue), and the **"Quick Note"** card in [`MobileHome`](frontend/src/components/mobile/MobileHome.vue) all bypass the outbox — they call `notesStore.createNote()` → `api.post('/notes', …)` directly. Offline, these throw `OfflineError` and the user's input is lost.

CR028 routes those creation surfaces through the same outbox pattern so a user on a plane can: open IdeasView → tap **+ New Idea** → type → save → see the idea immediately in the list (with a "pending sync" badge) → reconnect → the badge disappears and the idea becomes a normal server-backed entry.

Also bundles a small cleanup: the CR027 "available offline" indicator (CloudDownload icon next to a note's title) is currently shown in `NoteListPanel`, `MobileNotesList`, and `InboxView` — but **not** in `IdeasView`. CR028 adds it there for visual parity.

---

## 2. Goals / Non-Goals

### Goals
- New notes / ideas created offline are persisted locally to the outbox and replayed via `POST /api/v1/notes` on reconnect (already true for QuickCapture — extend to the other creation surfaces).
- Pending-sync items appear **in the relevant list view** (Ideas, Notes, Inbox) immediately, marked with a distinct **CloudUpload** badge and an "offline · pending sync" tooltip. They are visually distinct from CR027's CloudDownload indicator ("cached server note").
- After replay, the pending row is replaced by the server-backed row with no visible flicker (use `client_id` for de-duplication).
- IdeasView gets the CR027 CloudDownload indicator next to checked-out idea titles (parity with NoteListPanel / MobileNotesList / InboxView).

### Non-Goals (v1)
- **Editing a queued outbox item before it syncs.** Read-only until replay. Rationale: the outbox payload is currently immutable, and editing-then-replay introduces an in-place mutation pattern the outbox wasn't designed for. Users can wait the few seconds for replay to complete, then edit the server-backed copy normally.
- **Offline create for tasks beyond what QuickCapture already supports.** Tasks created from inside TasksView (if any non-QuickCapture path exists) are out of scope; only notes / ideas in v1.
- **Offline create for non-content entities** — notebooks, stacks, tags. Organizational structure should be created online.
- **Conflict resolution for pending-sync items.** They can't conflict — they're brand-new, no server-side counterpart exists. If the same `client_id` is replayed twice (network flake), the backend's existing idempotency (unique index on `(user_id, client_id)`) makes the second `POST` a no-op.
- **Inline edit of an idea promoted-to-note while offline.** Promotion (`POST /notes/:id/promote`) requires a server-side note ID, which a queued idea doesn't have until replay. Hide / disable the Promote action for pending-sync rows.
- **Search visibility for pending-sync items.** Server-side full-text search won't find them. Client-side filtering is a follow-on.

---

## 3. Approach

**No backend changes.** Server already accepts `POST /api/v1/notes` with `client_id` and de-duplicates on retry (`unique (user_id, client_id)` from migration `006_offline_client_id.sql`). The replay path inside `offlineOutbox.flush()` already POSTs idea captures successfully — proof: today's `QuickCapture` "Idea" tab.

**Three frontend changes:**

1. **Wire the three "+ New" surfaces through `enqueue()` when offline.** Each surface's save handler tries `api.post('/notes', payload)` first; on `OfflineError`, falls back to `enqueue(KIND_NOTE, payload)`. The store action that backs this lives in `notesStore.createNote()`, so the change is concentrated in that single function — the three UI buttons inherit it for free.

2. **Surface pending-sync items in the relevant list view.** Extend `offlineOutbox.js` with a reactive `pendingItems` ref (parallel to CR027's `cachedNoteIds`) holding the in-flight outbox rows. List views read from it and merge into their visible list, with each pending item rendered as a non-clickable row with the **CloudUpload** badge.

3. **Add the CR027 indicator to IdeasView.** Trivial — same pattern as the InboxView fix in v0.11.6.

---

## 4. Data Model

### Backend
**No changes.** `notes` table already has `client_id UUID`, `is_inbox`, `note_type`, etc.

### Frontend (IndexedDB)
**No schema changes.** The existing `outbox` object store (DB version 2, from CR027's bump) already holds:

```ts
{
  id: string,          // UUID — outbox row primary key
  kind: 'note' | 'task',
  payload: {
    title, content, notebook_id?, is_inbox?, note_type?,
    client_id: string  // UUID, used for idempotent replay
  },
  createdAt: number,   // Date.now()
  attempts: number,
  lastError: string | null
}
```

CR028 adds one **read-side helper** to [`offlineOutbox.js`](frontend/src/lib/offlineOutbox.js):

```ts
// Reactive ref<Array<OutboxRow>> — refreshed alongside pendingCount.
// List views filter by kind/note_type to find their pending items.
export const pendingItems = ref([]);
```

`refreshPending()` populates both `pendingCount` (already exists) and `pendingItems` (new) on every outbox mutation.

---

## 5. API Additions

**None.** All work is frontend.

---

## 6. Frontend Architecture

### New helpers

| File | Change |
|------|--------|
| [`frontend/src/lib/offlineOutbox.js`](frontend/src/lib/offlineOutbox.js) | Add `pendingItems` reactive ref. Update `refreshPending()` to also populate it via `getAllFromIndex(STORE, 'createdAt')`. |
| [`frontend/src/stores/notes.js`](frontend/src/stores/notes.js) | `createNote()` wraps `api.post('/notes', data)` in try/catch; on `OfflineError`, calls `enqueue(KIND_NOTE, { …data, client_id })` and returns a stub note shaped like the server response (so caller code doesn't need to know whether it queued or POSTed). The stub has `_pendingSync: true` so views can render it correctly. |
| [`frontend/src/stores/ideas.js`](frontend/src/stores/ideas.js) (if applicable — existing actions for "+ New Idea") | Same wrapping. |

### Modified views (list rendering)

| File | Change |
|------|--------|
| [`frontend/src/views/IdeasView.vue`](frontend/src/views/IdeasView.vue) | (a) Add CloudDownload indicator next to checked-out idea titles (CR027 parity). (b) Merge `pendingItems.filter(r => r.payload.note_type === 'idea')` into the rendered list. Pending rows render with a `CloudUpload` badge + "Pending sync" tooltip and are not clickable (no server ID yet). |
| [`frontend/src/components/ui/NoteListPanel.vue`](frontend/src/components/ui/NoteListPanel.vue) | Merge `pendingItems.filter(r => r.payload.note_type !== 'idea')` for note-list parity. CloudUpload badge. |
| [`frontend/src/views/InboxView.vue`](frontend/src/views/InboxView.vue) | Merge `pendingItems.filter(r => r.payload.is_inbox === true)`. |
| [`frontend/src/components/mobile/MobileNotesList.vue`](frontend/src/components/mobile/MobileNotesList.vue) | Same as NoteListPanel. |

### Modified creation surfaces (save handlers)

Once `notesStore.createNote()` is offline-aware (single change point in §6), these buttons get offline behaviour for free, but each call site should:
- Surface a "Saved offline — will sync when online" toast on the `_pendingSync: true` return.
- Suppress any post-create navigation that requires a server-side ID (e.g. `router.push('/notes/:id')` — there is no `:id` yet).

| File | Buttons |
|------|---------|
| [`frontend/src/views/IdeasView.vue`](frontend/src/views/IdeasView.vue) | "+ New Idea" |
| [`frontend/src/components/sidebar/panels/NotesPanel.vue`](frontend/src/components/sidebar/panels/NotesPanel.vue) | "+ New Note" |
| [`frontend/src/components/mobile/MobileHome.vue`](frontend/src/components/mobile/MobileHome.vue) | "Quick Note" hero card (currently opens QuickCapture — already outbox-aware — but worth confirming) |

### Reused

- `offlineOutbox.flush()` — already replays on reconnect, no change.
- `App.vue` online listener — already triggers `flushCheckouts` + `notesStore.fetchNotes()`; the latter will pick up the newly-replayed notes from the server, replacing the pending stubs.
- `CR027` `cachedNoteIds` / `dirtyNoteIds` reactive sets — unchanged.

---

## 7. Sync Flow

### Happy path
1. User is offline. Opens IdeasView. Taps **+ New Idea**.
2. Inputs title + content. Taps **Save**.
3. `notesStore.createNote()` tries `api.post('/notes', …)` → throws `OfflineError`.
4. Catch block calls `enqueue(KIND_NOTE, { …payload, note_type: 'idea', client_id })` — a fresh `client_id` UUID is generated client-side. Returns a stub `{ id: client_id, ...payload, _pendingSync: true }`.
5. Toast: **"Saved offline — will sync when online"**.
6. IdeasView reactively updates: `pendingItems` now includes this row → it renders in the list with the **CloudUpload** badge and "Pending sync" tooltip.
7. Time passes. User reconnects.
8. `App.vue`'s `online` listener fires `flushCheckouts()` (no-op if no CR027 dirty items) then `notesStore.fetchNotes()`. In parallel, `offlineOutbox.flush()` runs (triggered by `OfflineStatus.vue`'s existing watcher) and replays the outbox row via `POST /api/v1/notes` with the `client_id`.
9. Server creates the note, returns `{ data: { id, … } }`. Outbox row is `remove()`'d.
10. `pendingItems` shrinks; `notesStore.notes` (refreshed by `fetchNotes()`) now contains the server-backed note. The list re-renders with the same item, but the badge is gone (and CR027 indicators apply normally if applicable).

### Idempotency
If `flush()` retries after a partial failure (network flake mid-POST), the server's `unique (user_id, client_id)` index makes the second POST return the existing row instead of creating a duplicate. This is already in place.

### Edge cases
- **App reloaded between capture and sync:** the outbox is persistent (IndexedDB), and `pendingItems` is repopulated on module load via `refreshPending()`. Pending rows reappear in the list after reload.
- **User trashes a pending-sync row:** not allowed in v1 — trash actions are hidden on `_pendingSync` rows. If they need to discard, they can clear it via a new "Discard" action in OfflinePanel's pending-sync section. (Out of scope for v1; deferred to a follow-on if it proves needed.)
- **User opens the "Offline" view while a pending idea exists:** the OfflinePanel currently shows CR027 checkouts. v1 keeps it that way. Pending-sync items live in the regular Ideas/Notes lists where the user created them. A future enhancement might add a "Pending Sync" section to OfflinePanel.

---

## 8. UX Surfaces

### Visual vocabulary (after this CR)

| State | Icon | Tint | Meaning |
|---|---|---|---|
| Cached offline, clean | `CloudDownload` | muted (`--text-muted`) | Existing server note pulled offline, no local edits (CR027) |
| Cached offline, dirty | `CloudDownload` | amber (`--accent-warn`) | Existing server note with unsaved offline edits (CR027) |
| **Pending sync (new)** | **`CloudUpload`** | **amber (`--accent-warn`)** | **Brand-new note/idea created offline, not yet posted to server (CR028)** |

Three glyphs, three meanings, no overlap.

### Pending row rendering

A pending row looks visually similar to a normal row but with:
- The **CloudUpload** badge in the title row (where CloudDownload would be).
- The title is **not** a clickable link (no server `:id` to route to). Optionally render as a disabled card with the cursor `default`.
- Subtitle / preview from `payload.content` slice.
- Timestamp uses `outbox.createdAt` (local).
- No context menu / move / trash actions.

### Toasts

- On offline save: **"Saved offline — will sync when online"** (info / blue).
- On successful replay (driven by `offlineOutbox.flush()` — already exists for QuickCapture): **"Synced n offline capture(s)"** (success / green). May need a small message tweak to distinguish from CR027's "Synced n offline notes".

### Empty-state messaging

If IdeasView has zero server-backed ideas but one or more pending ones, the existing empty state should not show. Render the pending rows normally.

---

## 9. Storage & Performance

- Each outbox row is small (markdown source + metadata, typically < 50 KB).
- `pendingItems` is a single reactive array re-built on every outbox mutation. Cost: a single IDB `getAllFromIndex` per mutation. Same cost as `refreshPending()` already pays.
- No new persistent storage — reuses the existing `outbox` store.

---

## 10. Migration / Compatibility

- **No IDB schema change.** The `outbox` store schema is unchanged; only a new in-memory reactive ref is added.
- **No backend change.** `POST /notes` with `client_id` already supports the full payload shape.
- **No feature flag.** The change is purely additive (queues take effect only when `api.post` throws `OfflineError`; online path is unchanged).
- **CR027 unaffected.** Checkouts and outbox remain independent stores serving independent purposes. CR027 indicators continue to work exactly as before.

---

## 11. Acceptance Criteria

- [ ] `offlineOutbox.js` exports a `pendingItems` reactive ref that is populated on module load and on every mutation (`enqueue`, `remove`, `flush`).
- [ ] `notesStore.createNote()` catches `OfflineError` from `api.post('/notes', …)`, calls `enqueue(KIND_NOTE, { …data, client_id })`, and returns a stub note with `_pendingSync: true` (so callers don't need a separate code path).
- [ ] Tapping **+ New Idea** in [`IdeasView`](frontend/src/views/IdeasView.vue) while offline saves the idea to the outbox and shows it in the IdeasView list with a **CloudUpload** badge.
- [ ] Tapping **+ New Note** in [`NotesPanel`](frontend/src/components/sidebar/panels/NotesPanel.vue) while offline behaves the same way — appears in [`NoteListPanel`](frontend/src/components/ui/NoteListPanel.vue) with the badge.
- [ ] [`MobileHome`](frontend/src/components/mobile/MobileHome.vue) "Quick Note" hero card opens `QuickCapture`, which is **already** outbox-aware — confirm no regression. (No code change expected here; just confirm.)
- [ ] Pending-sync rows are non-clickable, have no context menu, and tooltip reads "Pending sync — will be saved when you're back online".
- [ ] Toast on offline save: "Saved offline — will sync when online".
- [ ] On reconnect, pending rows are replaced (via `client_id` idempotency) with server-backed rows without flicker or duplicates.
- [ ] Replay survives reload: a pending row created, then page reloaded while still offline, reappears on next load.
- [ ] IdeasView shows the CR027 `CloudDownload` indicator next to any checked-out (not pending) idea — parity with NoteListPanel / MobileNotesList / InboxView.
- [ ] `CloudUpload` and `CloudDownload` indicators on the same row are mutually exclusive (a note can't be both freshly captured offline AND a CR027 checkout).
- [ ] Existing offline-capture flow via `QuickCapture` (Alt+N / Alt+I) is unaffected (regression check).
- [ ] Existing CR027 check-in / refresh / discard flows are unaffected (regression check).
- [ ] Build is clean. Manual walkthrough in §13.2 passes.

---

## 12. Out of Scope (explicit)

- Editing a pending-sync item before it replays (deferred — outbox payload remains immutable in v1).
- Conflict resolution for pending-sync items (impossible by design — no server counterpart yet).
- Pending-sync rows in TasksView / SearchView / Trash / Vault / Reminders.
- Promotion / merge / convert-to-task actions on a pending-sync idea (require server ID — hide or disable on pending rows).
- Adding a dedicated "Pending Sync" section to the OfflinePanel.
- Offline create for notebooks, stacks, tags (organizational structure stays online-only).
- Client-side search across pending rows (the existing server-side search misses them by definition).

---

## 13. Testing

### 13.1 Automated tests

**Frontend — `frontend/tests/outboxPending.test.js`** (vitest + fake-indexeddb). Same prerequisites as the deferred CR027 vitest scaffolding — adds the `"test"` npm script + `fake-indexeddb` devDep if not already present.

Cases:
1. `enqueue` adds a row; `pendingItems` ref contains it.
2. `remove` clears the row; `pendingItems` ref no longer contains it.
3. After module reload (simulated by re-importing the module with a populated IDB), `pendingItems` is repopulated from disk.
4. `notesStore.createNote()` on a network-success path posts normally and does NOT touch the outbox.
5. `notesStore.createNote()` on a simulated `OfflineError` writes to the outbox and returns a stub with `_pendingSync: true`.
6. After a simulated `flush()` success, the stub is removed and `notesStore.fetchNotes()` would return the server-backed row.

**No backend tests required.** The `/notes` endpoint and `(user_id, client_id)` unique index are pre-existing and already covered by [`backend/tests/phase4-api.test.js`](backend/tests/phase4-api.test.js) and the offline outbox's pre-CR027 capture coverage.

### 13.2 Manual walkthrough

~5 minutes against the production tablet + PC pair.

**A. Idea created offline appears in IdeasView**
1. Tablet: go offline (Airplane mode).
2. Open IdeasView. Tap **+ New Idea**. Type "Plane idea — read the offline CR". Save.
3. Toast: "Saved offline — will sync when online".
4. The new idea appears in the IdeasView list with a **CloudUpload** badge and "Pending sync" tooltip. Title is non-clickable.
5. Refresh the page (still offline). The idea is still there (loaded from IDB on mount).
6. Reconnect.
7. Within ~2 seconds the badge disappears; the idea is now a normal clickable entry. Server-backed `id` is now in place.
8. Open the idea: editor works normally.

**B. Same on PC, different surface**
1. PC: go offline (DevTools → Network → Offline).
2. In NotesPanel, tap **+ New Note**. Save.
3. Same expected behaviour: appears in NoteListPanel with CloudUpload badge, replayed on reconnect.

**C. CR027 + CR028 coexistence**
1. Online: make an existing note "available offline" (CR027 checkout). Verify CloudDownload badge appears in the list.
2. Go offline. Create a new idea (CR028 path). Verify CloudUpload badge appears.
3. Both badges visible in their respective list rows simultaneously, with no visual overlap or confusion.
4. Reconnect. CR027 checkout still cached (CloudDownload remains). CR028 pending idea syncs (CloudUpload disappears, replaced by normal entry).

**D. Existing QuickCapture flow unchanged**
1. Offline. Hit **Alt+I**. Type an idea via QuickCapture. Save.
2. Same as before CR028: outbox row queued, replayed on reconnect. Confirm no regression.

**E. IdeasView indicator (Part 1 of this CR)**
1. Online. Open an idea, click **Make available offline** (CR027 toolbar action).
2. Return to IdeasView. The idea card now shows a **CloudDownload** icon next to the title.
3. Edit the idea body offline. The CloudDownload icon tints amber (dirty).
4. Check in. Tint returns to muted.

---

## 14. Resolutions

Open questions from the review phase, with the agreed answers folded into the sections above:

1. **Scope of "+ New" surfaces to make offline-aware** → **All three** (IdeasView "+ New Idea", NotesPanel "+ New Note", MobileHome "Quick Note"). Rationale: parity matters more than scope creep; the code-change per surface is tiny because `notesStore.createNote()` is the single intercept point. See §3 and §6.
2. **UX during the queued-but-not-yet-synced gap** → **Show in list with a "Pending sync" badge** (option ii from the review). Rationale: users get instant feedback that the capture worked; the badge makes the state obvious; no need for a dedicated destination. Uses `CloudUpload` to distinguish from CR027's `CloudDownload`. See §7 and §8.
3. **Editability of queued items before sync** → **Read-only until sync** (option i). Rationale: keeps the outbox payload immutable, avoids in-place mutation patterns the outbox wasn't designed for. Users can wait the seconds for replay then edit normally. See §2 (Non-Goals) and §8.
4. **Promote / merge / convert-to-task on pending-sync ideas** → **Hidden / disabled.** Those actions require a server-side note ID, which doesn't exist until replay. See §12.
5. **OfflinePanel changes** → **No.** OfflinePanel stays scoped to CR027 checkouts in v1. Pending-sync items live in the lists where they were created. A "Pending Sync" section in OfflinePanel could be a follow-on if it proves useful. See §12.
