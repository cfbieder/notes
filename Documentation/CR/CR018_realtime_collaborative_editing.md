# CR018 — Real-Time Collaborative Editing

**Status:** Open
**Origin:** Backlog (Stage 3, archived dev plan § 11)
**Depends on:** CR011 (workspaces), CR012 (RBAC)

## Goal

Multiple users editing the same note simultaneously, Google-Docs style, within shared workspaces.

## Scope (high-level — needs design pass before implementation)

- CRDT-based document sync (Yjs is the leading candidate given the CodeMirror integration).
- WebSocket transport via the existing Fastify server (`@fastify/websocket`).
- Presence indicators (cursors, user color chips).
- Conflict-free with offline edits — the offline outbox merges cleanly into the CRDT on reconnect.

## Acceptance Criteria

- Two clients editing the same note converge to identical state without manual merge.
- Presence updates within a couple of seconds of a remote edit.
- Single-user editing performance unchanged from today.

## Open Questions

- Persist CRDT state per note vs. snapshot to current `notes.content` column on quiescence.
- How does the wikilink sync trigger interact with mid-flight CRDT updates?
