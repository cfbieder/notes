# Project Roadmap

> **Document role:** Roadmap of all outstanding work. The detail for each item lives in its own [change-request file](docs/cr/) with a `Status:` header (Open / In progress / Completed); the canonical status / ship-date table is [docs/cr/README.md](docs/cr/README.md). Implemented features are described in [docs/current/project-description.md](docs/current/project-description.md).

Last reorganised: 2026-04-25 (extracted from [docs/archive/noted-development-plan_2026-04-25.md](docs/archive/noted-development-plan_2026-04-25.md)).

---

## How This File Is Maintained

- One CR per outstanding piece of work, named `docs/cr/cr-NNN-short-name.md` (zero-padded to 3 digits).
- Each CR file starts with a `Status:` header — keep it accurate as work progresses.
- When a CR is completed, flip its status header to `Completed`, mark its row ✓ in [docs/cr/README.md](docs/cr/README.md), and reflect the shipped feature in [docs/current/project-description.md](docs/current/project-description.md). Do not delete the CR file.
- New work: add a new CR with the next sequential number (`cr-036-…`, etc.), add a row to [docs/cr/README.md](docs/cr/README.md), and link it from the appropriate section below.

---

## Active Roadmap

### Phase 8 — LLM-Powered Intelligence (Stage 2, in progress)

The LLM service layer (`backend/src/services/llmService.js`), translation (8.11), voice capture (8.10), and AI Assist (8.12 + enhancements) are already shipped — see `project-description.md`. Remaining sub-phases:

| CR | Title | Notes |
|----|-------|-------|
| [CR001](docs/cr/cr-001-pgvector-embeddings.md) | pgvector + Embedding Pipeline | Foundation; blocks CR002, CR003, CR008, CR014 |
| [CR002](docs/cr/cr-002-semantic-hybrid-search.md) | Semantic / Hybrid Search | Depends on CR001 |
| [CR003](docs/cr/cr-003-related-notes-panel.md) | Related Notes Panel | Depends on CR001 |
| [CR004](docs/cr/cr-004-smart-tag-suggestions.md) | Smart Tag Suggestions | |
| [CR005](docs/cr/cr-005-auto-title-for-captures.md) | Auto-Title for Captures | |
| [CR006](docs/cr/cr-006-note-summarization.md) | Note Summarization | |
| [CR007](docs/cr/cr-007-task-extraction.md) | Task Extraction from Notes | |
| [CR008](docs/cr/cr-008-natural-language-query.md) | Natural Language Note Query ("Ask My Notes") | Depends on CR001, CR002 |

### Security

| CR | Title |
|----|-------|
| [CR009](docs/cr/cr-009-signed-attachment-urls.md) | Replace Attachment Query-String JWT with Signed URLs |
| [CR020](docs/cr/cr-020-encrypted-password-vault.md) | Encrypted Password & Key Vault (client-side, zero-knowledge) — **Completed** |
| [CR021](docs/cr/cr-021-biometric-vault-unlock.md) | Biometric Vault Unlock (WebAuthn PRF) — **Completed** |
| [CR029](docs/cr/cr-029-vault-card-bank-entry-types.md) | Vault: Credit Card & Bank Account entry types — **Completed** |
| [CR035](docs/cr/cr-035-vault-emergency-export.md) | Vault: Emergency export (self-decrypting HTML) — **Completed** |
| [CR033](docs/cr/cr-033-vault-entry-groups.md) | Vault: Optional grouping headers for entries — **Completed** |

### Settings & UX

| CR | Title |
|----|-------|
| [CR010](docs/cr/cr-010-user-settings-email-display.md) | User Settings — Email & Display Preferences |
| [CR019](docs/cr/cr-019-ai-assist-modes.md) | AI Assist — Quick / Deep-Think Modes + Async Inbox Delivery — **Completed** |
| [CR022](docs/cr/cr-022-hide-default-inbox-notebook.md) | Hide Default "Inbox" Notebook from Sidebar — **Completed** |
| [CR023](docs/cr/cr-023-html-format-notes.md) | HTML-Format Notes (Upload + Render) — **Completed** |
| [CR024](docs/cr/cr-024-task-inline-edit.md) | Task Inline Edit (content / due date / linked note) — **Completed** |
| [CR025](docs/cr/cr-025-pdf-document-management.md) | PDF Document Management (import, in-app viewer, folder storage in notebooks, Drive import) — depends on CR009 |
| [CR026](docs/cr/cr-026-activity-rail-navigation.md) | Activity Rail + Contextual Panel Navigation (replace tall sidebar; VS Code/Obsidian pattern) — **In progress** (foundation shipped v0.10.9; mobile drawer→list patch v0.10.10; richer panel content + mobile tab bar deferred) |
| [CR030](docs/cr/cr-030-sortable-notes-list-columns.md) | Sortable Notes List Columns — expanded `NoteListPanel` becomes Title + Last-used columns with click-to-sort headers; narrow sidebar unchanged — **Completed** |
| [CR031](docs/cr/cr-031-inline-pdf-attachment-embeds.md) | Inline PDF attachment embeds (`![[file.pdf]]` → iframe) + "Insert into document" button on attachment rows — **Completed** |
| [CR032](docs/cr/cr-032-drop-is-inbox-flag.md) | Drop `notes.is_inbox` flag; derive Inbox from default notebook (`notebook_id IS NULL OR is_default = TRUE`) and exclude `note_type='idea'` — **Completed** |
| [CR036](docs/cr/cr-036-export-note-as-pdf.md) | Export Note as PDF (Markdown + HTML) — relabel the print flow as "Export as PDF"; reuse the existing print-window pipeline (no new deps) — **Completed** |

### Offline & Sync

| CR | Title |
|----|-------|
| [CR027](docs/cr/cr-027-offline-note-checkout.md) | Per-Note Offline Checkout (Read + Edit) — soft-sync IndexedDB cache + `/checkin` endpoint + conflict diff modal — **Completed (v1)** |
| [CR028](docs/cr/cr-028-offline-create-notes-and-ideas.md) | Offline Create for Notes & Ideas (+ IdeasView icon parity) — route "+ New" buttons through the existing outbox, surface pending items in lists with a `CloudUpload` badge |

### Stage 3 — Multi-User & Beyond

| CR | Title | Notes |
|----|-------|-------|
| [CR011](docs/cr/cr-011-multi-user-workspaces.md) | Multi-User Workspaces (Shared Notebooks) | Blocks CR012, CR018 |
| [CR012](docs/cr/cr-012-role-based-access-control.md) | Role-Based Access Control | Depends on CR011 |
| [CR018](docs/cr/cr-018-realtime-collaborative-editing.md) | Real-Time Collaborative Editing | Depends on CR011, CR012 |

### Stage 3 — Intelligence Add-Ons

| CR | Title | Notes |
|----|-------|-------|
| [CR013](docs/cr/cr-013-weekly-digest.md) | Weekly Digest | |
| [CR014](docs/cr/cr-014-link-suggestions.md) | Link Suggestions via Embeddings | Depends on CR001 |
| [CR015](docs/cr/cr-015-content-scaffolding.md) | Content Scaffolding | |

### Stage 3 — Native Apps

| CR | Title |
|----|-------|
| [CR016](docs/cr/cr-016-electron-desktop-wrapper.md) | Electron Desktop App Wrapper |
| [CR017](docs/cr/cr-017-react-native-mobile-app.md) | React Native Mobile App (iOS first) |

---

## Recently Completed

Tracked in `project-description.md` under the relevant feature section. The full pre-reorg history of completed phases is preserved in [Archive/NOTED_DEVELOPMENT_PLAN_2026-04-25.md](docs/archive/noted-development-plan_2026-04-25.md).

### Released v0.15.1 (2026-07-05)

- **fix(drive): Google Drive import of `.html` files now creates HTML-format notes instead of a placeholder.** The Drive importer's text-file check ([driveImporter.js](backend/src/services/driveImporter.js)) only matched `.md`/`.txt`, so `.html`/`.htm` files fell through to the binary-attachment path — the note body was just `"Imported from Google Drive: <name>.html"` and the real HTML was stashed as an opaque attachment (rendered as nothing). CR023 had taught only the *manual* uploader about HTML. Now the Drive importer detects `text/html` / `.html` / `.htm`, reads the content, derives the title from `<title>` (falling back to filename), normalizes the body (strips `<head>`/`<meta>` boilerplate, preserves `<head>` `<style>` blocks), and creates a `format='html'` note; wikilink sync is skipped for HTML (parser is markdown-only). The title/body normalization was extracted from `routes/import.js` into a shared `backend/src/utils/htmlImport.js` so the two import paths can't drift. Verified: CR023 integration suite 24/24 passing after the refactor; helper logic checked directly. **Note:** existing notes imported before this fix don't self-heal — re-import (move the file back out of the Drive "Processed" folder) to pick up the fix.

### Released v0.15.0 (2026-07-05)

- **[CR036](docs/cr/cr-036-export-note-as-pdf.md) — Export Note as PDF (Markdown + HTML).** The editor toolbar's "Print" button (printer icon) is now **"Export as PDF"** (`FileDown` icon) on both desktop ([EditorToolbar.vue](frontend/src/components/editor/EditorToolbar.vue)) and mobile ([MobileEditor.vue](frontend/src/components/mobile/MobileEditor.vue)) editors, making PDF export a discoverable first-class action for the actual use case (self-hosted notes are rarely printed on paper). It reuses the existing print-window pipeline ([printNote.js](frontend/src/lib/printNote.js)) verbatim — markdown notes rendered via markdown-it, HTML-format notes via DOMPurify — so the browser's "Save as PDF" produces a real, vector-quality, selectable-text `.pdf` with the note title as the default filename, and physical printing stays available from the same dialog. **No new dependency, no backend, no migration.** Also fixed a latent mobile bug: `MobileEditor.handlePrint` dropped the `format` argument, so an HTML note would have exported as escaped markdown — it now passes `notesStore.currentNote.format`. On-page header copy changed "Printed <date>" → "Exported <date>". Rejected the heavier alternatives (server-side Puppeteer / ~300 MB Chromium; client-side `html2pdf.js` / rasterized non-selectable text) — see the CR. Batch/multi-note export deferred to a follow-up. See [§5 Export as PDF in project-description.md](docs/current/project-description.md).

### Released v0.14.0 (2026-06-28)

- **[CR034](docs/cr/cr-034-drive-reconnect-startup-notice.md) — Google Drive reconnect notice at app startup.** Previously the "Reconnect required" prompt only lived inside the Settings → Google Drive card, so a user who never opened Settings had no signal that their Drive sync had silently paused on token expiry/revocation. Now `App.vue` fetches integration status on load and, if `needsReconnect` is true, shows a non-blocking **sticky warning toast** with a **Reconnect** action that routes to Settings; a persistent **amber dot on the Settings activity-rail icon** survives toast dismissal so the prompt stays discoverable. Both indicators auto-clear when a successful scan/reconnect flips `needsReconnect` back to false. Zero backend change — detection already existed via `GET /integrations/google-drive/status`. Touches [frontend/src/App.vue](frontend/src/App.vue), [frontend/src/components/sidebar/ActivityRail.vue](frontend/src/components/sidebar/ActivityRail.vue). See [§5.13 in project-description.md](docs/current/project-description.md#513-google-drive-import-implemented).
  - **Known follow-on:** the toast reappears on every app load while reconnect stays pending (no per-session suppression yet). Intentional for now; add a session-storage guard if it proves noisy.

### Released v0.13.0 (2026-06-27)

- **[CR033](docs/cr/cr-033-vault-entry-groups.md) — Vault: optional grouping headers for entries.** Every vault entry gains an optional free-text **group**. Within a type tab (Passwords / Keys / Cards / Bank), entries that share a group name render under a `.group-header` (name + count pill); named groups sort alphabetically and ungrouped entries trail in an "Ungrouped" bucket. When nothing in the active tab has a group, the list renders flat exactly as before (no visual change). The entry modal's Group input autocompletes from group names already used for that type. Because the vault is zero-knowledge, `group` lives inside the encrypted record like every other field — **no backend, API, migration, or schema change.** Touches [frontend/src/stores/vault.js](frontend/src/stores/vault.js), [frontend/src/components/ui/VaultEntryModal.vue](frontend/src/components/ui/VaultEntryModal.vue), [frontend/src/views/VaultView.vue](frontend/src/views/VaultView.vue), [frontend/src/lib/vaultExport.js](frontend/src/lib/vaultExport.js). See [§5.17 in project-description.md](docs/current/project-description.md#517-encrypted-vault-cr020--cr029--cr021--cr030--cr033-implemented).

### Released v0.12.0 (2026-06-19)

- **[CR035](docs/cr/cr-035-vault-emergency-export.md) — Vault emergency export (self-decrypting HTML).** An "Export" button in the unlocked vault header produces a single `noted-vault-emergency-YYYY-MM-DD.html` file the user can save offline and open in any browser with no Noted app and no installed tools. The file embeds only ciphertext; opening it prompts for an **export passphrase** (separate from the master password, chosen at export time, never stored), derives a key in-browser, and renders all entries grouped by type with a filter + Print/Save-as-PDF. Crypto is native WebCrypto only — PBKDF2-HMAC-SHA-256 (600 000 iters, 16-byte salt) + AES-256-GCM (12-byte IV) — so the file carries no Argon2 wasm dependency. Runs entirely client-side from the already-unlocked vault; **no backend, API, or schema change.** Undecryptable stubs are dropped and only type-relevant fields are exported. Roundtrip + plaintext-leak verified. New files [frontend/src/lib/vaultExport.js](frontend/src/lib/vaultExport.js), [frontend/src/components/ui/VaultExportModal.vue](frontend/src/components/ui/VaultExportModal.vue); wired into [frontend/src/views/VaultView.vue](frontend/src/views/VaultView.vue). See [§5.17 in project-description.md](docs/current/project-description.md#517-encrypted-vault-cr020--cr021--cr029--cr033--cr035-implemented).

### Released v0.11.28 (2026-06-18)

- **fix(editor): Normal mode no longer blanks on notes with YAML frontmatter.** A note beginning with a `---` … `---` frontmatter block (e.g. a pasted slash-command / prompt file) rendered as a completely empty Normal-mode editor. The closing `---` parses as a *setext-H2 underline* — a `HeaderMark` sitting at the **end** of its line — and the marker-hiding decoration extended `node.to + 1` to also swallow the trailing space after ATX markers (`## `). On a setext underline that `+1` consumed the *newline*, and a ViewPlugin-provided decoration replacing a line break is illegal in CodeMirror, so `new EditorView(...)` threw and the editor never mounted. Source mode was unaffected (it skips the render plugins), which is why the raw text was always intact. Fixed by only extending past the marker when the next char is actually a space, mirroring the existing `QuoteMark` guard. ([frontend/src/lib/codemirror/markdownRendering.js](frontend/src/lib/codemirror/markdownRendering.js))
- **fix(editor): mode toggle button now shows the mode you're in.** The Normal/Source toggle was labelled with the mode it would switch *to*, so it read "Source" while you were actually in Normal mode (and vice-versa) — the root of the "where did my text go" confusion above. The label and icon now reflect the current mode; the tooltip says what clicking does. ([frontend/src/components/editor/EditorToolbar.vue](frontend/src/components/editor/EditorToolbar.vue))

### Released v0.11.27 (2026-06-08)

- **feat(auth): redirect to login on genuine session expiry.** Completes the v0.11.25 follow-on. When `/auth/refresh` is *rejected* by the server (refresh token expired/invalid — distinct from an offline network failure, which keeps the session), the API client now clears the in-memory token and dispatches a `noted:session-expired` event. `App.vue` listens, clears local session state via a new `authStore.expireSession()` (no API call — a logout POST would just 401), shows an info toast, and routes to `/login`. The handler is idempotent (no-op once already on `/login` or once the session hint is cleared) so a burst of failed calls can't loop the redirect or stack toasts. Replaces the previous broken-page-full-of-401s experience on a timed-out session. ([frontend/src/api/client.js](frontend/src/api/client.js), [frontend/src/stores/auth.js](frontend/src/stores/auth.js), [frontend/src/App.vue](frontend/src/App.vue))

### Released v0.11.26 (2026-06-08)

- **fix(notes): collapsed note-list no longer blanks the All Notes page.** On list-only routes (`Notes` / `Ideas` / `NotebookNotes` / `TagNotes`) the main pane renders only `NoteListPanel` — the editor pane is `isDetailRoute`-gated (v0.11.8). But the panel itself was gated on `!uiStore.noteListCollapsed`, so if the user had ever collapsed the list (persisted in `localStorage` as `noted.ui.noteListCollapsed`), landing on All Notes showed a completely blank pane — no list, no editor, no empty-state. Collapse only makes sense on a *detail* route (hide the list to focus the open note); on a list-only route there's nothing to fall back to. Gated the panel with `!uiStore.noteListCollapsed || !isDetailRoute` so the list always renders when it *is* the page. ([frontend/src/views/NotesView.vue](frontend/src/views/NotesView.vue))

### Released v0.11.25 (2026-06-08)

- **fix(auth): stop the cold-start 401 storm.** On load, `authStore.init()` deliberately fires the session refresh in the *background* (fire-and-forget) and renders the shell immediately — the fast-path that prevents the ~30s iPad-offline hang. But the in-memory access token lives in `client.js` and isn't set until that refresh resolves, so the sidebar/home components mounted and fired ~7 data calls (`notebooks`, `stacks`, `tags`, `reminders`, `notes`, ideas) with **no `Authorization` header**, all 401'ing before the token landed. Confirmed from a prod Network capture: data calls 401, then `/auth/refresh` returns 200 — the requests were racing ahead of the token. Two fixes in `apiFetch`: (1) a **cold-start guard** — when a persisted session hint exists but no token is in memory yet, establish the token *before* firing the request (bounded by a 4s race so a stalled refresh can't re-introduce the offline hang); (2) **refresh dedup** — concurrent callers now share a single in-flight `/auth/refresh` instead of each firing their own. The backend auth path was never at fault — `generate`/`verifyAccessToken` share one `JWT_SECRET` in-process, so an *attached* token always verifies; the 401s were purely missing-token races. ([frontend/src/api/client.js](frontend/src/api/client.js))
- **Known follow-on (resolved in v0.11.27):** on a *genuine* session expiry (refresh returns 401), the app still surfaced failed data calls rather than redirecting to the login screen.

### Released v0.11.24 (2026-06-08)

- **fix(inbox): "Discard" now actually works.** `InboxView.discardNote` called `notesStore.deleteNote(noteId)` — a method that doesn't exist on the notes store — so discarding an inbox item threw `TypeError: …deleteNote is not a function` and silently did nothing. Pointed it at the real `trashNote` action, which soft-deletes via `DELETE /api/v1/notes/:id` (recoverable from Trash) and refreshes the notes/notebooks/ideas state. ([frontend/src/views/InboxView.vue](frontend/src/views/InboxView.vue))

### Released v0.11.23 (2026-06-08)

Mobile performance — two measured bottlenecks behind the "waiting for data / laggy" feel:

- **perf(api): notes list no longer ships full note bodies.** `GET /api/v1/notes` selected `n.content` for every row (up to 50), so a list fetch carried ~250 KB of markdown the UI never showed — it only renders a ~100-char preview. Switched to `LEFT(n.content, 300) AS content`, shrinking the list payload ~10×. The detail endpoint `GET /api/v1/notes/:id` still returns full `n.*`, and the editor always opens a note via that endpoint (`fetchNote`), so nothing loses access to full content. ([backend/src/routes/notes.js](backend/src/routes/notes.js))
- **perf(bundle): CodeMirror + D3 no longer parsed on the mobile first paint.** `NotesView.vue` statically imported `CodeMirrorEditor` (and `MobileEditor` did too) plus the D3-backed `LocalGraph`, bundling ~600 KB of editor/graph engine into the single route chunk every mobile user downloaded just to see `/home` or the notes list. Switched both to `defineAsyncComponent(() => import(...))`. Result: the `NotesView` chunk drops **797 KB → 206 KB** (282 → 79 KB gzipped); CodeMirror (592 KB) splits into its own chunk that loads on demand when a note is opened, and D3 only loads with the desktop local-graph panel. ([frontend/src/views/NotesView.vue](frontend/src/views/NotesView.vue), [frontend/src/components/mobile/MobileEditor.vue](frontend/src/components/mobile/MobileEditor.vue))
- **Known follow-ons (not yet done):** `notesStore`/`notebooksStore` still refetch on every navigation (no in-memory cache guard); `api/client.js` has no in-flight request dedup; `NotesView` detail load fetches notes-list → note → attachments serially rather than in parallel. Candidate for a dedicated perf CR if mobile still drags.

### Released v0.11.22 (2026-06-08)

- **fix(mobile): cut redundant fetches on the mobile Home dashboard.** `MobileHome.vue` had two separate `onMounted` hooks that raced — between them open-tasks were fetched twice and the notes list three times on every visit to `/home`. Collapsed into a single hook that fetches each thing once: open tasks (1×), then the inbox-filtered notes query for the badge count and the unfiltered query for the five recent rows (2× — genuinely distinct queries), then ideas. Net: tasks 2→1, notes 3→2 requests per load, which is most of the perceived "waiting for data" on the mobile home screen. Removed the now-dead `loadRecentNotes` helper. ([frontend/src/components/mobile/MobileHome.vue](frontend/src/components/mobile/MobileHome.vue))
- **fix(mobile): stop the viewport jumping when the on-screen keyboard opens.** The four full-height mobile shells (`MobileHome`, `MobileNotesList`, `MobileLayout`, `MobileEditor`) used `100vh`, which on mobile Safari/Chrome is the *large* viewport height and ignores the keyboard/toolbar — so opening the keyboard left content shifted or clipped. Switched to `100dvh` (dynamic viewport height) so the shells track the actually-visible area. ([frontend/src/components/mobile/MobileHome.vue](frontend/src/components/mobile/MobileHome.vue), [MobileNotesList.vue](frontend/src/components/mobile/MobileNotesList.vue), [MobileLayout.vue](frontend/src/components/mobile/MobileLayout.vue), [MobileEditor.vue](frontend/src/components/mobile/MobileEditor.vue))
- **fix(mobile): respect the notch / home-indicator safe areas.** The PWA runs with `apple-mobile-web-app-status-bar-style: black-translucent`, so content drew under the status bar and home indicator. Added `viewport-fit=cover` to the viewport meta and `env(safe-area-inset-*)` padding to the home container, the shared view header, and the editor — headers no longer hide under the notch and the editor footer clears the home indicator. ([frontend/index.html](frontend/index.html))

### Released v0.11.21 (2026-05-25)

- **[CR032](docs/cr/cr-032-drop-is-inbox-flag.md) — Drop `notes.is_inbox` flag.** Two redundant signals (`notes.is_inbox` boolean + `notebooks.is_default`) were kept in sync by ~6 hand-written code paths; a path missed in `NoteListPanel.vue` left notes filed to Inbox via the right-click "Move to" menu invisible in `/inbox`. Migration `019_drop_is_inbox.sql` removes the column. The Inbox is now derived: `note_type <> 'idea' AND (notebook_id IS NULL OR notebook.is_default = TRUE)`. The `note_type <> 'idea'` clause matters — notebook-less voice captures are ideas and belong in `/ideas`, not the Inbox. List API gains `?in_inbox=true|false` to expose the derived filter. Backend tests (`phase7-clips`, `phase8-voice`, `phase8-translate`, `phase10-ideas`) updated to match. ([backend/migrations/019_drop_is_inbox.sql](backend/migrations/019_drop_is_inbox.sql), [backend/src/routes/notes.js](backend/src/routes/notes.js))

### Released v0.11.20 (2026-05-25)

- **fix(mobile): wire `noteMap`/`noteTitles`/`attachmentMap` into the mobile `CodeMirrorEditor`.** Without these props the CR031 embed plugin sees an empty attachment map and every `![[file.pdf]]` falls through to the "broken" widget that renders the raw `![[…]]` text — which is exactly what users saw on Android. Also added an `onInsertAttachment` handler so the new attachment-row Insert button works on mobile. Note: even with this fix, Android Chrome has no native inline PDF viewer — the iframe will render but the browser may show a blank frame or download prompt for PDFs. Inline rendering works fully on desktop Chrome. ([frontend/src/components/mobile/MobileEditor.vue](frontend/src/components/mobile/MobileEditor.vue))

### Released v0.11.19 (2026-05-25)

- **fix(editor): hide embedded PDF viewer chrome for CR031 inline embeds.** Iframe `src` now appends `#toolbar=0&navpanes=0&scrollbar=0` — PDF Open Parameters honoured by Chrome's built-in viewer (and most others) — so inline PDF embeds render flush against the editor without the viewer's filename bar, page-nav, and zoom controls. ([frontend/src/lib/codemirror/pdfEmbedRendering.js](frontend/src/lib/codemirror/pdfEmbedRendering.js))

### Released v0.11.18 (2026-05-25)

- **fix(nginx): `X-Frame-Options: DENY` → `SAMEORIGIN` so CR031 inline PDF embeds load.** `DENY` blocks all framing — including same-origin — so the `![[file.pdf]]` iframe rendered "refused to connect" against its own host. `SAMEORIGIN` keeps clickjacking protection from external sites while letting the editor frame its own `/api/v1/attachments/:id` endpoint. ([nginx/noted.conf](nginx/noted.conf))

### Released v0.11.17 (2026-05-25)

- **[CR031](docs/cr/cr-031-inline-pdf-attachment-embeds.md) — Inline PDF attachment embeds + Insert button.** New Obsidian-style `![[filename.pdf]]` syntax renders PDF attachments as an inline `<iframe>` in Normal Mode (browser-native PDF viewer; ~640 px tall, full editor width). Each row in the `AttachmentZone` gets a corner-down-left **Insert** button that drops the right markdown at the cursor — `![filename](url)` for images, `![[filename]]` for PDFs, `[filename](url)` for everything else. Wikilink regex (frontend renderer + backend `wikilinkParser`) now uses a negative lookbehind `(?<!!)` so embed syntax is no longer mis-classified as a broken wikilink. Source Mode still shows raw `![[…]]`. Out of scope: PDF.js viewer, standalone documents, print/export rendering — those remain CR025. See `docs/cr/cr-031-inline-pdf-attachment-embeds.md`.

### Released v0.11.16 (2026-05-25)

- **fix(vault): biometric enrollment now retrieves the PRF secret via a follow-up `get()` when `create()` doesn't evaluate it.** Chrome (and most platform authenticators) register PRF support on `navigator.credentials.create()` but only evaluate `eval.first` on subsequent `get()` assertions — so the v0.11.14 enrollment code threw "PRF unsupported" even on Chrome 132+ where it actually works fine. Take the `create()` PRF result if present; otherwise immediately run an assertion against the just-registered credential to retrieve the secret. One extra biometric tap during enrollment only; unlock stays single-tap. ([frontend/src/lib/biometricUnlock.js](frontend/src/lib/biometricUnlock.js))

### Released v0.11.15 (2026-05-25)

- **fix(settings): biometric vault card now appears in the desktop Settings page too.** SettingsView has separate mobile (`<MobileLayout v-if="isMobile">`) and desktop templates; the v0.11.14 CR021 enrollment card landed only in the mobile branch, so desktop users saw nothing between "Change Vault Password" and "Google Drive Import". Mirrored the section into the desktop branch. ([frontend/src/views/SettingsView.vue](frontend/src/views/SettingsView.vue))

### Released v0.11.14 (2026-05-25)

- **[CR021](docs/cr/cr-021-biometric-vault-unlock.md) — Biometric Vault Unlock via WebAuthn PRF.** Opt-in per device: enrollment runs a WebAuthn ceremony with the PRF extension on the platform authenticator (Touch ID / Windows Hello / Android fingerprint), wraps a copy of the 32-byte master key under the PRF secret (AES-256-GCM), and stores the wrapped blob in `localStorage["noted.vaultBiometric"]`. Lock screen gains a "Use biometric unlock" button when a wrapped key is present; master password remains primary and mandatory. Master-password rotation auto-clears the local wrapped key; a stale wrap (e.g. password rotated on another device) is detected via verifier check after unwrap and auto-cleared. Zero backend changes — wrapped key blobs live in the browser only; the server has no awareness of biometric enrollment. New file `frontend/src/lib/biometricUnlock.js`; `vaultCrypto.js` extended with `deriveRawKey` / `importMasterKey` / `wrapBytes` / `unwrapBytes`; Settings card under Vault for enroll/disable. See [§5.17 in project-description.md](docs/current/project-description.md#517-encrypted-vault-cr020--cr029--cr021-implemented).

### Released v0.11.13 (2026-05-25)

- **[CR030](docs/cr/cr-030-sortable-notes-list-columns.md) — Sortable Notes List Columns.** The expanded `NoteListPanel` (shown on `/notes`, `/notebooks/:id`, `/tags/:name` when no note is open) is now a two-column table with **Title** and **Last used** as clickable sticky headers. Clicking a header toggles sort direction; switching columns resets to that column's sensible default (`title` → asc, `updated_at` → desc, matching the prior order). Pinned notes always lead each sort group. Sorting is client-side over `notesStore.notes` (case-insensitive `localeCompare` for titles); the narrow sidebar layout used while editing a note is unchanged. See [§5 Desktop list-only layout entry in project-description.md](docs/current/project-description.md).

### Released v0.11.12 (2026-05-25)

- **[CR029](docs/cr/cr-029-vault-card-bank-entry-types.md) — Vault gains Credit Card & Bank Account entry types.** Two new `type` discriminators (`card`, `bank`) added alongside the existing `password` / `key`. Card fields: name, card number (masked + reveal + copy), expiration date, security code (masked + reveal + copy), comments. Bank fields: account name, account number / IBAN (masked + reveal + copy), routing number, SWIFT / BIC code, comments. List view replaced the dropdown filter with a 4-tab segmented control; list rows show a type-specific badge icon + two quick-copy buttons per row (Card → CVV + Number; Bank → Routing + Acct). Zero backend changes — the server is strictly zero-knowledge so new types are an encrypted-blob shape only. ([CR020](docs/cr/cr-020-encrypted-password-vault.md)'s `changePassword` rotation already re-encrypts all blobs opaquely, so it works unchanged for the new types.) See [§5.17 in project-description.md](docs/current/project-description.md#517-encrypted-vault-cr020--cr029-implemented).

### Released v0.11.11 (2026-05-25)

- **fix(ui): notebook picker dropdown no longer clips off the right edge of the editor toolbar.** The "Inbox" pill at the top-right of [NoteNotebooks.vue](frontend/src/components/editor/NoteNotebooks.vue) anchored its 200px dropdown with `left: 0`, so on narrow / right-positioned toolbars the "New notebook name…" input was pushed past the viewport and unreachable when creating a notebook from a note. Switched the anchor to `right: 0` so the panel expands leftward from the button's right edge.
- **fix(scripts): `update_version.sh` tolerates gitignored `frontend/.env`.** The version bumper writes `VITE_APP_VERSION` to `frontend/.env`, which is gitignored — under `set -e` the staging `git add` aborted before commit + tag were created. Split it off and pipe to `/dev/null || true`, matching how lock files are handled. ([scripts/update_version.sh](scripts/update_version.sh))
- **chore(docs):** CLAUDE.md "4 Key Rules" preamble + `/close` release-finalisation skill in `.claude/commands/`.

### Released v0.11.10 (2026-05-22)

- **fix(offline): tap-to-open a checked-out note no longer hangs on iPad Safari.** `fetchNote()`'s checkout branch previously did a best-effort `api.get('/notes/:id')` for fresh server metadata. iPad Safari leaves `navigator.onLine === true` in Airplane mode, so the fast-fail in [api/client.js](frontend/src/api/client.js) didn't trigger and the actual `fetch()` hung ~30s before the OS gave up — during that time `MobileEditor.loadNote` was awaiting and the editor stayed blank with the "Untitled" placeholder. For a checked-out note the local IDB snapshot is the canonical view by design; users who want fresh metadata use the **Refresh offline copy** toolbar button. Drop the server fetch from the hot path — the editor now renders instantly regardless of platform. ([stores/notes.js](frontend/src/stores/notes.js))

### Released v0.11.9 (2026-05-22)

Two compounding offline bugs:
- **fix(offline): cold-start no longer renders a blank screen on iPad Safari.** Same `navigator.onLine === true` in Airplane mode pattern — `authStore.init()` was awaiting `api.post('/auth/refresh')` from the router's `beforeEach`, which hung ~30s before resolving, so no route view ever rendered (just the themed body). Fast-path: when `localStorage` has a session hint (`noted.hasSession === '1'`), `init()` returns immediately and the refresh runs as a fire-and-forget background promise. ([stores/auth.js](frontend/src/stores/auth.js))
- **fix(offline): tap-to-open from `/offline` no longer shows a blank "Untitled".** `fetchNote()` used to throw `OfflineError` when there was no local checkout AND the server was unreachable; `MobileEditor.loadNote` silently bailed and the editor refs stayed at their initialized empty values. Now `fetchNote()` returns an `_unavailableOffline` sentinel instead of throwing, and both `MobileEditor.loadNote` and `NotesView.loadNote` got try/catch + direct `getCheckout()` fallback, then a friendly "Not available offline. Reconnect to load this note." markdown message — never a silent blank. ([stores/notes.js](frontend/src/stores/notes.js), [components/mobile/MobileEditor.vue](frontend/src/components/mobile/MobileEditor.vue), [views/NotesView.vue](frontend/src/views/NotesView.vue))

### Released v0.11.8 (2026-05-22)

- **fix(nav): Desktop list-only routes hide the editor pane.** On `Notes` / `NotebookNotes` / `TagNotes` / `Ideas` the `<main class="editor-pane">` is now `v-if="isDetailRoute"`-gated and [NoteListPanel](frontend/src/components/ui/NoteListPanel.vue) takes a new `expanded` prop that switches it from fixed 280px to `flex: 1`. No more leftover toolbar/empty-editor showing when no note is selected — the list reads like Inbox.
- **feat(mobile): Dedicated `/home` route + Home button.** Resolves the v0.11.7 known follow-on. New route `name: 'Home'` at `/home` renders `MobileHome` on mobile (and falls through to the standard list layout on desktop). Home icon button added to [MobileNotesList.vue](frontend/src/components/mobile/MobileNotesList.vue) header (top-left) and [MobileLayout.vue](frontend/src/components/mobile/MobileLayout.vue) header (between Back and title) so the dashboard is reachable from All Notes / Inbox / etc.

### Released v0.11.7 (2026-05-22)

- **fix(nav): All Notes on mobile renders the notes list, not the dashboard.** [NotesView.vue](frontend/src/views/NotesView.vue) `mobileShowList` now matches the `Notes` route alongside `NotebookNotes`/`TagNotes`, with `mobileListTitle` defaulting to `"All Notes"`. `onMounted` clears stale notebook/tag filters when landing directly on `/notes` (covers deep links + refresh). The legacy `MobileHome` dashboard is no longer reached via `/notes`; its cards (Tasks, Inbox, Ideas, Search, Reminders, Voice, Vault, Offline) remain reachable from the drawer.
- **Known follow-on (resolved in v0.11.8):** `MobileHome` is now orphaned (no route renders it). Decide whether to re-home it under a dedicated `/home` route or remove it.

### Released v0.11.0 (2026-05-22)

- **[CR027](docs/cr/cr-027-offline-note-checkout.md) — Per-Note Offline Checkout (Read + Edit).** Soft-sync offline editing for existing notes: per-note "Make available offline" toggle → local IndexedDB copy → edit offline → check in on reconnect with optimistic concurrency. New `POST /api/v1/notes/:id/checkin` endpoint (200 on match, 409 with full server row on stale `base_version`). Conflict modal offers Keep local / Keep server / Hand-merge. New `/offline` route + activity rail icon + OfflinePanel listing dirty / clean checkouts. IDB schema bumped 1 → 2 (`checkouts` store added alongside the existing outbox). Backend tests: 20/20 passing in [`backend/tests/cr027-checkout.test.js`](backend/tests/cr027-checkout.test.js). See [§5.14a in project-description.md](docs/current/project-description.md#514a-per-note-offline-checkout-cr027-implemented) for the feature spec.
- **Known follow-ons:** inline-image Blob caching (renderer change is its own concern), greyed-out wikilinks while offline, vitest scaffolding for `checkouts.js` / `checkoutSync.js` (manual walkthrough in CR027 §13.2 is the v1 regression spec).
