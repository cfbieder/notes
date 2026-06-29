# CR011 — Multi-User Workspaces (Shared Notebooks)

**Status:** Open
**Origin:** Backlog (Stage 3, archived dev plan § 11)
**Blocks:** CR012 (RBAC), CR018 (real-time collab)

## Goal

Introduce the concept of a workspace that multiple users can be members of, with shared notebooks within the workspace.

## Scope (high-level — needs design pass before implementation)

- Data model: `workspaces`, `workspace_members`. Notebooks gain a `workspace_id` (nullable for personal notebooks).
- Invitation flow (email or shareable link).
- Workspace switcher in the sidebar.
- Notes in shared notebooks visible to all members; per-note visibility may layer on later.

## Acceptance Criteria

- Single-user mode (today's behaviour) remains unchanged when no workspaces exist.
- Inviting a user to a workspace gives them read access to its notebooks.
- Notes/tags/wikilinks/graph all respect workspace boundaries.

## Open Questions

- Tag scoping: per-user, per-workspace, or both?
- How do wikilinks resolve across workspace boundaries?
- Does search default to current workspace or "all I can see"?
