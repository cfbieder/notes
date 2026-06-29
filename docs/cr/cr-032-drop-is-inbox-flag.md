## CR032 — Drop `notes.is_inbox` flag; derive Inbox from default notebook

**Status:** Completed
**Created:** 2026-05-29
**Completed:** 2026-05-29
**Author:** Implementation following user request

---

### 1. Problem

The system carries two redundant signals for "this note belongs in the Inbox":

1. `notes.is_inbox BOOLEAN` — explicit flag set on insert/update
2. `notebooks.is_default = TRUE` — the user's per-user default notebook (named "Inbox" by convention)

The policy (codified in migration 015) is: a note in the default notebook is in the Inbox. But the policy is enforced by ~6 hand-written code paths (frontend pickers, drag-drop, list-panel context menu, mobile, backend INSERT statements), each setting `is_inbox` based on the target notebook's `is_default`. Any path that forgets to set it leaves the note silently invisible to the Inbox view.

Concrete bug observed (2026-05-29): notes moved to the default notebook via the right-click "Move to notebook" submenu in `NoteListPanel.vue:103` had `is_inbox=false` hardcoded. Three production notes were stuck — they showed "Inbox" in the notebook picker but did not appear in `/inbox`. Migration 015 fixed two earlier code paths but missed this one.

### 2. Approach

Drop `is_inbox` entirely. The Inbox is *exactly* the set of notes whose `notebook_id` references the user's default notebook **or** whose `notebook_id IS NULL` (covers voice notes, drive imports, and clipper sends without a target notebook).

This collapses the dual signal into one source of truth.

### 3. Scope

**Backend:**
- New migration `019_drop_is_inbox.sql`: backfill broken state once more, then `ALTER TABLE notes DROP COLUMN is_inbox`.
- `backend/src/routes/notes.js` — list endpoint: drop `is_inbox` query param + condition; new derivation `notebook IS NULL OR notebook.is_default`. Drop column from SELECT and from INSERT/UPDATE.
- `backend/src/routes/search.js` — remove `n.is_inbox` from SELECTs (callers don't rely on it).
- `backend/src/routes/voice.js`, `clips.js`, `import.js` — drop is_inbox from INSERTs (state is derivable from notebook_id).
- `backend/src/routes/notebooks.js` — when deleting a notebook, reassign notes to default notebook (already does); drop the `is_inbox = TRUE` SET clause.
- `backend/src/services/aiAssistJobRunner.js`, `driveImporter.js` — drop from INSERTs.
- Tests: update `phase7-clips.test.js`, `phase8-voice.test.js`, `phase8-translate.test.js`, `phase10-ideas.test.js` to not assert on `is_inbox`.

**Frontend:**
- `frontend/src/stores/notes.js` — drop `is_inbox` from filter state and the param plumbing.
- `frontend/src/views/InboxView.vue` — replace `setFilter('is_inbox', 'true')` with a new filter `in_inbox=true` that the backend interprets as "notebook IS NULL OR default".
- `frontend/src/components/editor/NoteNotebooks.vue`, `sidebar/panels/NotesPanel.vue`, `ui/NoteListPanel.vue` — drop `is_inbox: …` from updateNote payloads (no longer a field).
- `frontend/src/components/ui/QuickCapture.vue` — drop `is_inbox` from createNote payloads (server derives Inbox from absence of notebook_id).
- `frontend/src/components/mobile/MobileHome.vue` — same filter change as InboxView.
- `frontend/src/stores/ideas.js` — drop `is_inbox: false` from idea create (ideas live outside Inbox anyway by `note_type='idea'`).

**Clipper:**
- `clipper/popup.js`, `background.js` — the `send_to_inbox` payload field already means "don't assign a notebook". Server now derives this from `notebook_id IS NULL`. The clipper-side flag is still useful UX (user toggle), but server collapses it: if `send_to_inbox=true`, ignore any notebook_id from client.

### 4. Inbox query shape

Replace the existing `is_inbox = TRUE` filter with a `LEFT JOIN notebooks` clause that also excludes ideas (which live in their own `/ideas` surface):

```sql
WHERE n.note_type <> 'idea'
  AND (n.notebook_id IS NULL OR nb.is_default = TRUE)
  AND n.user_id = $1
  AND n.deleted_at IS NULL
```

The `note_type <> 'idea'` clause matters: voice captures and other notebook-less ideas would otherwise be swept into the Inbox by the `notebook_id IS NULL` branch.

The list endpoint accepts a new query param `in_inbox=true` that the backend translates into this clause. (Keeping the param name distinct from the column name avoids any "we deleted the column but the param still tries to filter on it" confusion.)

### 5. Acceptance

- The three stuck notes (`Project Notes`, `ocr-llm-architecture`, `Voice Note — May 11`) appear in `/inbox`.
- Migration is forward-only and idempotent.
- Tests pass.
- `is_inbox` no longer appears anywhere in `backend/src/`, `frontend/src/`, or `backend/tests/`.
- Manual: create a new note via Quick Capture, voice, clipper, AI Assist → all appear in Inbox. Move via picker / drag / right-click → state matches the visible notebook.

### 6. Non-Goals

- Keeping `is_inbox` as a deprecated alias. Forward-only — column dropped.
- Migration of the clipper's `send_to_inbox` field. That's a client-side toggle; its server-side effect changes (sets notebook_id=NULL instead of is_inbox=true) but the wire format is unchanged.
