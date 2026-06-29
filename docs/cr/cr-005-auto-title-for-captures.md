# CR005 — Auto-Title for Captures

**Status:** Open
**Origin:** Phase 8.6 (LLM-Powered Intelligence)

## Goal

Quick captures saved with empty or generic titles get an LLM-generated title suggestion.

## Scope

- After save, if title is empty/generic, call gateway (`phi4:14b`) for a suggested title.
- UI shows the suggestion inline with accept/dismiss controls.
- Non-blocking — title appears after a short delay; user can keep editing.

## Acceptance Criteria

- Suggestion generated only for captures with no user-supplied title.
- Accept replaces the title in place; dismiss leaves it untouched.
- Failure modes (gateway down, LLM disabled) silently skip the suggestion — capture flow is unaffected.
