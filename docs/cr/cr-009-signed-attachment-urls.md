# CR009 — Replace Attachment Query-String JWT with Signed URLs

**Status:** In progress — shipped in v0.28.0 (see the CR index); awaiting on-device acceptance (images, PDF embeds, print)
**Severity:** Security
**Origin:** Backlog (security item flagged in archived dev plan § 11)

## Problem

`GET /api/v1/attachments/:id` currently accepts the JWT access token via `?token=` so `<img>` and `<iframe>` tags can render inline. This leaks the access token into:

- Browser history
- Proxy / reverse-proxy access logs
- HTTP `Referer` headers when the page links to other origins

## Proposed Fix (original — superseded, see Decision)

~~Replace the query-string JWT with short-lived (~5 min) per-attachment HMAC-signed URLs minted on note fetch.~~

## Decision (owner, 2026-11-14): attachment cookie instead of signed URLs

Signed URLs that change every few minutes defeat the PWA's `CacheFirst` attachment cache
(keyed by URL, so offline images stop working) and break an image re-rendered in a note left
open past the TTL. A cookie avoids both and needs no per-note minting:

- On **login** and **refresh** the server sets `attachmentToken`: an HttpOnly, `SameSite=Strict`
  cookie (`Secure` in production) with `Path=/api/v1/attachments`, valid 24 h, renewed on every
  refresh. Its JWT is signed with a key **derived from `JWT_SECRET`** (no new env var), so it is
  not accepted as a Bearer token anywhere else — it can only read attachments.
- **Logout** clears it.
- `GET /attachments/:id` accepts a Bearer header (clipper, `fetch` callers) or the cookie.
  **`?token=` is no longer accepted.**
- The frontend's four `?token=` shims (editor images, PDF embeds, attachment grid, print) are
  removed; every attachment URL is the plain `/api/v1/attachments/<id>`.
- 24 h rather than the access token's 15 min: the access token is refreshed only when an API
  call gets a 401, which an `<img>` load never triggers, so a short cookie would blank images in
  an idle tab.

## Acceptance Criteria

- Inline `<img>` / `<iframe>` rendering still works in the editor, print view, attachment grid, and clipper screenshots.
- Access tokens no longer appear in any URL.
- ~~Signed URL TTL ~5 min~~ — n/a (no token in any URL to leak); cookie TTL 24 h.
- Tests (`backend/tests/cr009-attachment-cookie.test.js`, in `test:ci`): login and refresh set the cookie; the cookie serves an own attachment; another user's attachment is 404; `?token=` is rejected; a garbage cookie is 401; the cookie is not accepted as a Bearer token on another route; a rejected refresh and logout both clear it; responses are `Cache-Control: private, no-cache`.

## Outcome (2026-11-14)

- **Backend:** `plugins/auth.js` — `setAttachmentCookie` / `clearAttachmentCookie` / `verifyAttachmentCookie`, key `HMAC-SHA256(JWT_SECRET, 'noted-attachment-cookie')`. `routes/auth.js` sets it on login and refresh, clears it on logout and on every rejected refresh. `routes/attachments.js` takes Bearer or cookie; `?token=` removed.
- **Frontend:** the `?token=` shims are gone from `stores/attachments.js` (grid), `lib/codemirror/markdownRendering.js` (editor images), `lib/codemirror/pdfEmbedRendering.js` (PDF iframes) and `lib/printNote.js` (print).
- **Security review findings, fixed in this CR:**
  - *Medium — cache outlives the session.* With no token in the URL, a cached attachment would be served to the next person on a shared browser. Logout and session expiry now delete the PWA's `attachment-cache-v2` (`stores/auth.js`), and the server sends `Cache-Control: private, no-cache` instead of a one-year `max-age`, so the browser revalidates (and the cookie is checked again) rather than serving its HTTP cache.
  - *Low — a rejected refresh left the 24 h cookie.* `/auth/refresh` now clears it on every 401.
- **Follow-ups, not in scope (roadmap "Security"):** `GET /notes/export/:title` still accepts `?token=` (API tokens, for curl); `JWT_SECRET` / `JWT_REFRESH_SECRET` fall back to the public dev default if unset in prod — the attachment key derives from it too.
- **Verified:** full `test:ci`; a headless Chromium run through the Vite proxy — login sets the HttpOnly cookie, the editor and the attachment grid render a PNG from a plain `/api/v1/attachments/<id>`, no request carries `token=`, and images still load after a reload. **Not verified in a browser:** the PDF iframe (headless shell has no PDF viewer) and the print window — check both on prod.
