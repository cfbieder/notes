# CR024 — Task Inline Edit

**Status:** Completed (2026-05-09)
**Severity:** Feature (UX)
**Origin:** User report, 2026-05-09

## Problem

The Tasks view (`/tasks`) supported toggling done, setting a reminder, and deleting — but the task content, due date, and linked note were rendered read-only with no way to edit them after creation. Fixing a typo or relinking a task to a different note required deleting and re-creating it.

The backend already exposed `PUT /api/v1/tasks/:id` accepting `content`, `is_done`, `note_id`, `due_date`, and `reminder_at`, so this was a missing-frontend issue.

## Decision

Add inline edit on each task row. Pencil icon (or double-click on the row) puts that single row into edit mode where content, linked note, and due date become editable inputs. Save/Cancel buttons (or Enter / Esc) commit or revert. Reminder editing already had its own picker — left unchanged.

Also extend the backend PUT to:

1. Allow clearing `note_id` and `due_date` to `NULL` (the prior `COALESCE`-based update couldn't unset them).
2. Return `note_title` via `LEFT JOIN notes` so the local row stays correctly populated after relinking — matching the shape returned by `GET /tasks`.

### Considered and rejected

- **Modal editor.** More room for fields, but heavier and pulls focus away from the list. Inline keeps the editing surface where the user is already looking.
- **Click-anywhere-to-edit.** Conflicts with existing affordances (the "linked note" pill is a navigation button). Pencil + double-click is unambiguous.
- **Auto-save on blur.** Bug-prone (accidental edits, partial saves). Explicit Save/Cancel matches the rest of the app.

## Scope

### In scope

- Frontend: `TasksView.vue` desktop and mobile rows gain a `Pencil` button + double-click that swaps the row into an edit form. `Check`/`X` buttons (and Enter/Esc) save or cancel. Edit form mirrors the "Add a task" inputs: content text, linked-note `<select>`, due-date `<input type=date>`.
- Backend: `PUT /api/v1/tasks/:id` accepts `null` for `note_id` and `due_date` (clearing). Response now JOINs `notes.title` so callers see the resolved `note_title`.
- Reactive store: `useTasksStore.updateTask` already replaced the local row with the PUT response — now the response carries `note_title`, so the displayed linked-note pill updates immediately on relink.

### Out of scope

- Editing reminders inline — already handled by the existing `ReminderPicker` row control.
- Bulk edit / multi-select.
- Drag-to-reorder.

## Acceptance

- Pencil button appears on each task row in both desktop and mobile layouts.
- Clicking Pencil (or double-clicking a row) shows editable inputs for content, linked note, and due date with current values pre-filled.
- Pressing Enter, or clicking the green check, saves the changes via `PUT /api/v1/tasks/:id` and exits edit mode.
- Pressing Esc, or clicking the X, exits without persisting changes.
- Setting "No linked note" or clearing the due date clears the corresponding column in the DB.
- The displayed `note_title` updates immediately after relinking (no page refresh needed).
- Existing toggle / reminder / delete affordances continue to work unchanged.

## Implementation Notes

- `backend/src/routes/tasks.js` — replaced the COALESCE-only `SET` clause with explicit key-presence handling for `note_id`, `due_date`, and `reminder_at` (the existing `reminder_at` pattern, generalized). Wrapped the `UPDATE` in a CTE that re-JOINs `notes` to return `note_title`.
- `frontend/src/views/TasksView.vue` — added `editingTaskId` and `editDraft` refs, `startEdit` / `cancelEdit` / `saveEdit` handlers, and a `<template v-if/v-else>` swap for view-mode vs edit-mode in both desktop and mobile task rows. Added matching CSS for the editable inputs.
