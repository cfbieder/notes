# CR013 — Weekly Digest

**Status:** Open
**Origin:** Backlog (Stage 3, archived dev plan § 11)

## Goal

Scheduled job summarizes the user's week — captures, completed tasks, emerging themes — and writes a "Weekly Review" note.

## Scope

- Cron-driven (Sunday evening default), optional opt-out per user.
- Pulls last 7 days of notes, completed tasks, top tags, new wikilinks.
- LLM-summarized themes (depends on llmService.js, already in place).
- Writes a new note titled `Weekly Review YYYY-MM-DD` with sections for each.

## Acceptance Criteria

- Generated note links back to the source notes/tasks via wikilinks.
- Run is idempotent for a given week (re-running overwrites or skips).
- Job logs failures without preventing future runs.
- Disabled when LLM is unavailable.
