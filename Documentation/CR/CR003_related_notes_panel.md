# CR003 — Related Notes Panel

**Status:** Open
**Origin:** Phase 8.4 (LLM-Powered Intelligence)
**Depends on:** CR001 (pgvector embeddings)

## Goal

Show a panel of semantically similar notes alongside any note, similar to the existing Backlinks panel.

## Scope

- `GET /api/v1/notes/:id/related` — top 5 notes by embedding cosine similarity, excluding self.
- `RelatedNotesPanel.vue` — collapsible panel in the editor view, click-through to navigate.
- Toggle visibility via the same focus-mode controls as Backlinks/LocalGraph.

## Acceptance Criteria

- Panel returns plausibly related notes for a representative sample.
- Empty state when no notes meet a similarity threshold.
- Hidden cleanly when LLM is disabled or embeddings are missing for the current note.
