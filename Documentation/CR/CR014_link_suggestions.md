# CR014 — Link Suggestions via Embeddings

**Status:** Open
**Origin:** Backlog (Stage 3, archived dev plan § 11)
**Depends on:** CR001 (pgvector embeddings)

## Goal

Surface suggested wikilinks between semantically related notes, enhancing the existing graph view.

## Scope

- For a given note, retrieve top-N semantically similar notes that are not already linked.
- Inline suggestion UI in the editor: "These notes look related — link them?" with one-click insertion of `[[Title]]`.
- Optional graph-view overlay showing suggested edges as ghost lines.

## Acceptance Criteria

- Suggestions exclude trashed notes and notes already wikilinked from the current note.
- Accepting a suggestion inserts `[[Title]]` at cursor (or at the end of the note, configurable).
- Suggestions refresh when the note's content changes substantially.
