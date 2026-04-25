# CR006 — Note Summarization

**Status:** Open
**Origin:** Phase 8.7 (LLM-Powered Intelligence)

## Goal

Generate a 2–3 sentence summary for any note, displayed at the top of the editor and reused as preview text in note lists.

## Scope

- `POST /api/v1/notes/:id/summarize` — generates a summary via gateway (`phi4:14b`), persists it.
- `NoteSummary.vue` — collapsible summary block at the top of the editor.
- Cached on the note row; regenerated on substantial content change.
- Used as preview text in note list panels, replacing the current first-line snippet when present.

## Acceptance Criteria

- Summary stored alongside the note; survives page reload without re-call.
- Stale-summary detection (e.g., content hash) triggers regeneration on next view.
- Falls back to the existing snippet when summary is missing or LLM is disabled.
