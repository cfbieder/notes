# CR004 — Smart Tag Suggestions

**Status:** Open
**Origin:** Phase 8.5 (LLM-Powered Intelligence)

## Goal

On note save, propose 2–3 tags drawn from the user's existing tag vocabulary, surfaced as ghost pills in the tag bar.

## Scope

- `POST /api/v1/notes/:id/suggest-tags` — sends content + existing tag list to the gateway (`phi4:14b`), returns suggestions.
- Frontend renders ghost/dashed pills in the tag bar; one click to accept, dismiss on hover.
- Suggestions debounced behind autosave so we don't hammer the gateway on every keystroke.

## Acceptance Criteria

- Suggestions only contain tags the user has already created (no LLM hallucinations of new tags).
- Accepting a suggestion attaches the tag and removes the ghost pill.
- Suggestion call is non-blocking; the editor stays responsive.
- No suggestions shown when LLM is disabled.
