# CR012 — Role-Based Access Control

**Status:** Open
**Origin:** Backlog (Stage 3, archived dev plan § 11)
**Depends on:** CR011 (multi-user workspaces)

## Goal

Layer roles on top of workspace membership: Viewer (read-only), Editor (read + write), Admin (manage members + settings).

## Scope

- `workspace_members.role` enum.
- Backend route guards: enforce role on every notebook/note/attachment write.
- Frontend: hide / disable write actions for Viewers.
- Admin UI for managing members and roles.

## Acceptance Criteria

- Viewers cannot create, edit, or trash notes/notebooks/tags in shared workspaces.
- Editors can do everything except member management.
- Admins can promote/demote/remove members.
- Role changes take effect on the user's next request, not their next login.
