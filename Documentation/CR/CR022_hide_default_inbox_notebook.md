# CR022 — Hide Default "Inbox" Notebook from Sidebar

**Status:** Completed
**Severity:** UX bugfix
**Origin:** User report, 2026-05-03

## Problem

Two "Inbox" entries appeared in the sidebar:

1. **Top nav "Inbox"** — filters notes by `is_inbox = TRUE`.
2. **Notebooks → "Inbox"** — the default notebook (`is_default = TRUE`), filters by `notebook_id`.

The two were intended to be equivalent (per migration `015_inbox_default_notebook_sync.sql`), but capture paths that set `is_inbox=true` without writing `notebook_id` (e.g. AI Assist deep-think, web clipper `send_to_inbox`, voice/quick capture) caused the lists to diverge. Concrete drift observed at report time:

| Note | `is_inbox` | Notebook |
|---|---|---|
| Items to Move | ✓ | Inbox ✓ |
| House Sale Steps | ✓ | *(none)* |
| Scratch Pad | ✓ | Inbox ✓ |

Top "Inbox" view showed all 3; notebook "Inbox" view showed 2. Confusing and visually duplicated.

## Decision

Hide the default notebook from the sidebar. The top "Inbox" nav item becomes the single entry point (filters on `is_inbox=true`, so it sees the union of all inbox-flagged notes regardless of notebook FK).

Considered and rejected:
- **Drop the default-notebook concept entirely** — too invasive; picker UX, drag-drop, and the `015` invariant all depend on it.
- **Drop the top "Inbox" sidebar entry** — loses GTD prominence and breaks `is_inbox` filter UX.
- **Fix the invariant in every creation path** — fixes drift but leaves the duplicate sidebar entry.

## Implementation

`frontend/src/components/sidebar/AppSidebar.vue`:

- `unstackedNotebooks` computed now filters `!n.is_default` in addition to `!n.stack_id`.
- New `visibleStackNotebooks(stack)` helper filters `!n.is_default` from any stack's notebooks (defensive — default isn't normally stackable).
- Stack-group `v-for` switched from `stack.notebooks` to `visibleStackNotebooks(stack)`.

No backend, schema, route, or store changes. The default notebook still exists in the DB and is still:
- Selectable in the notebook picker (`NoteNotebooks.vue` line 47 — selecting it sets `is_inbox=true`).
- The route target for `/notebooks/<inbox-uuid>` (still works via deep links).
- Protected from deletion (existing `is_default` guard).

## Acceptance

- [x] Sidebar shows one "Inbox" entry only (top nav).
- [x] Top "Inbox" view shows all `is_inbox=true` notes (unchanged behavior).
- [x] Notebook picker still lists "Inbox" as an option in the picker UIs that expose it (e.g. `NoteNotebooks`, `IdeasView`).
- [x] `frontend` build passes with no warnings beyond pre-existing chunk-size advisory.

## Out of scope (possible follow-ups)

- Drag-and-drop onto the top "Inbox" nav item to set `is_inbox=true` (currently you can only drag onto a visible notebook).
- One-shot backfill to write `notebook_id = <default>` on existing `is_inbox=true` rows that lack a notebook FK — not strictly required since the surviving view ignores the FK, but would tidy the data.
- Tighten capture paths to always write the default notebook FK alongside `is_inbox=true`.
