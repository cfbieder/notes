# CR009 — Replace Attachment Query-String JWT with Signed URLs

**Status:** Open
**Severity:** Security
**Origin:** Backlog (security item flagged in archived dev plan § 11)

## Problem

`GET /api/v1/attachments/:id` currently accepts the JWT access token via `?token=` so `<img>` and `<iframe>` tags can render inline. This leaks the access token into:

- Browser history
- Proxy / reverse-proxy access logs
- HTTP `Referer` headers when the page links to other origins

## Proposed Fix

Replace the query-string JWT with short-lived signed attachment URLs:

- On note fetch, the backend mints an opaque HMAC token scoped to `(attachment_id, user_id, exp ~5min)`, distinct from the JWT.
- The attachments route validates the signed token instead of the bearer.
- Keep the bearer-header path for upload / delete routes.

## Acceptance Criteria

- Inline `<img>` / `<iframe>` rendering still works in the editor, print view, attachment grid, and clipper screenshots.
- Access tokens no longer appear in any URL.
- Signed URL TTL is short enough that leaked links expire quickly (~5 min default).
- Tests cover: valid signed URL, expired URL, URL minted for a different user, URL minted for a different attachment.
