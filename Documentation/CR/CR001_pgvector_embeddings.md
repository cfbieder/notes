# CR001 — pgvector + Embedding Pipeline

**Status:** Open
**Origin:** Phase 8.2 (LLM-Powered Intelligence)
**Depends on:** llmService.js (in place)
**Blocks:** CR002 (semantic search), CR003 (related notes), CR014 (link suggestions)

## Goal

Add a pgvector-backed embedding pipeline so notes can be retrieved by semantic similarity, not just keyword match.

## Scope

- Migration: enable `pgvector` extension; add `embedding vector(768)` column to `notes`.
- On note save (debounced), call Ollama `nomic-embed-text` via the LLM gateway and persist the embedding.
- Background job for initial backfill of existing notes.
- Graceful degradation: if the gateway is unreachable, save proceeds without an embedding and the note is queued for retry.

## Acceptance Criteria

- New notes get an embedding written within a few seconds of save.
- Existing notes are backfilled idempotently by a one-shot script.
- Migration applies cleanly in dev and prod.
- App functions normally when `LLM_ENABLED=false` or the gateway is down.

## References

- Embedding model decision: see `Archive/NOTED_DEVELOPMENT_PLAN_2026-04-25.md` § 12 (2026-04-10).
- Gateway: `http://100.66.213.40:8080`, model `nomic-embed-text` (768-dim).
