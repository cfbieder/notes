# CR041 — Share Screenshots to Noted (PWA Share Target)

**Status:** Open — design decided, ready to build
**Severity:** Feature (small–medium)
**Origin:** User request, 2026-11-13

## Problem

On a phone, the way to get a screenshot into a quick note today takes two steps. First you
save a text-only Quick Capture ([QuickCapture.vue](frontend/src/components/ui/QuickCapture.vue)
supports text and voice only). Then you open the note from the Inbox and use **Upload** in the
attachments panel ([AttachmentZone.vue](frontend/src/components/editor/AttachmentZone.vue)).
Noted does not appear in the phone's Share sheet, so the usual phone habit of "screenshot → Share →
app" doesn't work.

## Proposal

Register the installed PWA as a **Web Share Target** for images. Sharing a screenshot to Noted
creates a new Inbox note with the image attached and shown inline.

### Flow

1. The user takes a screenshot, taps **Share**, then picks **Noted** (only offered once the PWA is installed).
2. The OS sends a `POST` (multipart) to `/share-target`. The **service worker** intercepts it, stores
   the shared file(s) and any shared text in Cache Storage under a one-time key, and answers
   `303` → `/share?id=<key>`.
3. The `/share` route (a new small Vue view, behind auth) reads the pending files from the cache,
   shows a preview, a caption box (pre-filled from shared text/URL) and a Note / Idea toggle, and on **Save**:
   - `POST /api/v1/notes` (Note: no `notebook_id` → default notebook → appears in the Inbox;
     Idea: `note_type='idea'`), title from the caption's first line, otherwise `Screenshot <date time>`;
   - `POST /api/v1/notes/:id/attachments` for each file (existing endpoint; OCR runs as for any upload);
   - updates the body with `![filename](/api/v1/attachments/<id>)` for each image;
   - deletes the cache entry, then opens the new note.
4. **Cancel** deletes the cache entry and goes to the Inbox.

### Why the page uploads, not the service worker

The access token lives only in page memory ([client.js](frontend/src/api/client.js)), and the
service worker can't read it. Leaving the upload to the page keeps auth in one place: the same
refresh-on-401 path and the same `OfflineError` handling as every other call.

## Implementation sketch

- `frontend/vite.config.js` — add to the manifest:
  ```js
  share_target: {
    action: '/share-target',
    method: 'POST',
    enctype: 'multipart/form-data',
    params: { title: 'title', text: 'text', url: 'url',
              files: [{ name: 'files', accept: ['image/*'] }] }
  }
  ```
  and `workbox.importScripts: ['share-target-sw.js']`. No switch away from generateSW.
- `frontend/public/share-target-sw.js` — `fetch` listener for `POST /share-target`: read
  `formData()`, write each file into cache `share-target` under `/share-pending/<key>/<n>`
  (with filename + type in headers), plus shared text, then `Response.redirect('/share?id=<key>', 303)`.
- `frontend/src/components/mobile/MobileHome.vue` — pending-share banner (lists `share-target` cache keys).
- `frontend/src/views/ShareView.vue` + route `/share` (auth-guarded; a logged-out user goes to login and
  returns to it, and the pending files wait in the cache).
- No backend or schema change. Uses the existing notes and attachments endpoints and the 25 MB `MAX_FILE_SIZE` cap.

## Platform limits

- **Android (Chrome-installed PWA):** supported. Only the **installed** PWA appears in the Share
  sheet, not a browser tab. Memory notes that the installed Android PWA has been flaky for
  offline capture, so acceptance must be tested on the installed app itself.
- **iOS / iPadOS Safari:** Web Share Target is **not supported**. On iPhone, the Upload button
  remains the path.
- **Desktop:** Chrome on Windows/ChromeOS supports it; not a target use case.
- The manifest change only takes effect after the PWA **picks up the update** (sometimes a
  reinstall). Note this in the release notes.

## Decisions (owner, 2026-11-13)

1. **Landing step: a confirm screen.** `/share` shows the image preview(s), an optional caption box,
   and **Save** / **Cancel**. No item is created until Save.
2. **Note type: a Note / Idea toggle** on the confirm screen, the same buttons as Quick Capture,
   defaulting to **Note** (Inbox). An Idea is created with `note_type='idea'`.
3. **Text and links are accepted too.** Shared `title` / `text` / `url` pre-fill the caption box.
   A share with no image is fine (it becomes a text note). This creates a plain note, **not** a
   Research source.
4. **Offline at share time: keep it pending and retry.** If Save fails with `OfflineError`, the files
   stay in the `share-target` cache and the screen says it's saved on this device, to tap Save
   once back online. A pending share can be reopened later: Mobile Home shows a
   "*N* pending share(s)" banner linking to `/share?id=<key>`. There is **no** automatic
   background upload (the offline outbox doesn't carry files). A pending share is deleted only
   on a successful Save or on Cancel.

## Out of scope

- Non-image files (PDFs, documents). This is easy to add later by widening `accept`.
- Sharing into an **existing** note.
- iOS support (the platform has no API for it).

## Acceptance

1. On the installed Android PWA, Noted appears in the Share sheet for an image.
2. Sharing one screenshot creates an Inbox note whose body shows the image inline; the attachment
   is OCR'd and its text is findable in search.
3. Sharing several images at once attaches all of them, in order.
4. Cancel leaves no note and no orphaned attachment; the pending cache entry is removed either way.
5. Sharing while logged out ends at login, then back on the share screen with the image still there.
6. A share larger than 25 MB shows a clear error and creates no empty note.
7. The Note / Idea toggle creates the chosen type; Idea lands in Ideas, not the Inbox.
8. Sharing a link from Chrome opens the confirm screen with the URL in the caption; Save makes a text note.
9. Sharing in airplane mode → Save reports offline and keeps the share; Mobile Home shows the
   pending-share banner; back online, Save from the banner creates the note.
10. Existing PWA behaviour (offline caching, install prompt, update prompt) is unchanged.
