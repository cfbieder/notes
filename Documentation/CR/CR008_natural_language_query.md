# CR008 — Natural Language Note Query ("Ask My Notes")

**Status:** Open
**Origin:** Phase 8.9 (LLM-Powered Intelligence)
**Depends on:** CR001 (pgvector embeddings), CR002 (semantic search)

## Goal

"Ask my notes" mode in the search palette — user types a question, gets a synthesized answer with citations to source notes.

## Scope

- `POST /api/v1/search/ask` — embeds the query, retrieves top-N relevant notes via pgvector, sends them as context to the gateway, returns answer + cited note IDs.
- Search palette gains an "Ask" mode toggle alongside keyword/semantic/hybrid.
- Citations render as clickable wikilinks back to the source notes.

## Acceptance Criteria

- Answer cites only notes returned by the retrieval step (no hallucinated sources).
- Token budget guard: truncates context blocks if combined size exceeds the model's window, with a visible truncation marker.
- Returns a useful "no relevant notes found" response when retrieval comes back empty.
- Ask mode hidden when LLM is disabled or embeddings haven't been backfilled.
