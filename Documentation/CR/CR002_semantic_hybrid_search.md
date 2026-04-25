# CR002 — Semantic / Hybrid Search

**Status:** Open
**Origin:** Phase 8.3 (LLM-Powered Intelligence)
**Depends on:** CR001 (pgvector embeddings)

## Goal

Augment the existing tsvector search with pgvector cosine similarity so users can find conceptually related notes even without keyword matches.

## Scope

- `GET /api/v1/search` gains a `mode` param: `keyword` (existing), `semantic` (embedding cosine `<=>`), `hybrid` (RRF-merged).
- Frontend search palette (`Ctrl+K`) gets a mode toggle.
- Falls back to keyword mode when LLM is unavailable.

## Acceptance Criteria

- `Ctrl+K` search supports semantic mode.
- Hybrid mode beats keyword-only on a small evaluation set of paraphrased queries.
- Mode toggle persists across sessions.
- All existing keyword-search behaviour unchanged in `keyword` mode.
