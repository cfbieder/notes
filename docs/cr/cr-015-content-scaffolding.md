# CR015 — Content Scaffolding

**Status:** Open
**Origin:** Backlog (Stage 3, archived dev plan § 11)

## Goal

Type a one-liner prompt and have the LLM expand it into a structured note skeleton (headings, sections, bullet placeholders).

## Scope

- New action in the editor or Quick Capture — "Scaffold from prompt".
- Calls gateway with a structured-output prompt.
- Inserts the scaffold at cursor (or as a new note from Quick Capture).

## Acceptance Criteria

- Output is markdown with headings, lists, and placeholder text the user can fill in.
- Scaffold respects the user's current note's context if invoked from inside an existing note.
- No silent overwrite — scaffold is inserted, never replaces existing content without confirmation.
