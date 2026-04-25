# CR007 — Task Extraction from Notes

**Status:** Open
**Origin:** Phase 8.8 (LLM-Powered Intelligence)

## Goal

"Extract tasks" button in the editor toolbar identifies action items in a note and proposes them as new tasks for user review.

## Scope

- `POST /api/v1/notes/:id/extract-tasks` — sends note content to the gateway (`phi4:14b`) with an action-item prompt.
- Returns proposed tasks in a review modal — user can accept / edit / dismiss each before creation.
- Created tasks link back to the source note.

## Acceptance Criteria

- Modal shows each proposed task with editable title and due-date hint where the LLM provided one.
- Accept-all and per-row accept both work.
- Created tasks appear in TasksView with a link to the source note.
- Hidden / disabled when LLM is unavailable.
