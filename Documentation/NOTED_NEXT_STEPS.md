# NOTED_NEXT_STEPS.md

> **Document role:** Roadmap of all outstanding work. The detail for each item lives in its own [CR/](CR/) file with a `Status:` header (Open / In progress / Completed). Implemented features are described in [NOTED_CURRENT_STATE.md](NOTED_CURRENT_STATE.md).

Last reorganised: 2026-04-25 (extracted from `Archive/NOTED_DEVELOPMENT_PLAN_2026-04-25.md`).

---

## How This File Is Maintained

- One CR per outstanding piece of work, named `CR/CR00X_short_name.md`.
- Each CR file starts with a `Status:` header — keep it accurate as work progresses.
- When a CR is completed, flip its status header to `Completed` and reflect the shipped feature in `NOTED_CURRENT_STATE.md`. Do not delete the CR file.
- New work: add a new CR with the next sequential number (`CR019_…`, etc.) and link it from the appropriate section below.

---

## Active Roadmap

### Phase 8 — LLM-Powered Intelligence (Stage 2, in progress)

The LLM service layer (`backend/src/services/llmService.js`), translation (8.11), voice capture (8.10), and AI Assist (8.12 + enhancements) are already shipped — see `NOTED_CURRENT_STATE.md`. Remaining sub-phases:

| CR | Title | Notes |
|----|-------|-------|
| [CR001](CR/CR001_pgvector_embeddings.md) | pgvector + Embedding Pipeline | Foundation; blocks CR002, CR003, CR008, CR014 |
| [CR002](CR/CR002_semantic_hybrid_search.md) | Semantic / Hybrid Search | Depends on CR001 |
| [CR003](CR/CR003_related_notes_panel.md) | Related Notes Panel | Depends on CR001 |
| [CR004](CR/CR004_smart_tag_suggestions.md) | Smart Tag Suggestions | |
| [CR005](CR/CR005_auto_title_for_captures.md) | Auto-Title for Captures | |
| [CR006](CR/CR006_note_summarization.md) | Note Summarization | |
| [CR007](CR/CR007_task_extraction.md) | Task Extraction from Notes | |
| [CR008](CR/CR008_natural_language_query.md) | Natural Language Note Query ("Ask My Notes") | Depends on CR001, CR002 |

### Security

| CR | Title |
|----|-------|
| [CR009](CR/CR009_signed_attachment_urls.md) | Replace Attachment Query-String JWT with Signed URLs |
| [CR020](CR/CR020_encrypted_password_vault.md) | Encrypted Password & Key Vault (client-side, zero-knowledge) — **Completed** |
| [CR021](CR/CR021_biometric_vault_unlock.md) | Biometric Vault Unlock (WebAuthn PRF) — **Completed** |
| [CR029](CR/CR029_vault_card_bank_entry_types.md) | Vault: Credit Card & Bank Account entry types — **Completed** |

### Settings & UX

| CR | Title |
|----|-------|
| [CR010](CR/CR010_user_settings_email_display.md) | User Settings — Email & Display Preferences |
| [CR019](CR/CR019_ai_assist_modes.md) | AI Assist — Quick / Deep-Think Modes + Async Inbox Delivery — **Completed** |
| [CR022](CR/CR022_hide_default_inbox_notebook.md) | Hide Default "Inbox" Notebook from Sidebar — **Completed** |
| [CR023](CR/CR023_html_format_notes.md) | HTML-Format Notes (Upload + Render) — **Completed** |
| [CR024](CR/CR024_task_inline_edit.md) | Task Inline Edit (content / due date / linked note) — **Completed** |
| [CR025](CR/CR025_pdf_document_management.md) | PDF Document Management (import, in-app viewer, folder storage in notebooks, Drive import) — depends on CR009 |
| [CR026](CR/CR026_activity_rail_navigation.md) | Activity Rail + Contextual Panel Navigation (replace tall sidebar; VS Code/Obsidian pattern) — **In progress** (foundation shipped v0.10.9; mobile drawer→list patch v0.10.10; richer panel content + mobile tab bar deferred) |
| [CR030](CR/CR030_sortable_notes_list_columns.md) | Sortable Notes List Columns — expanded `NoteListPanel` becomes Title + Last-used columns with click-to-sort headers; narrow sidebar unchanged — **Completed** |
| [CR031](CR/CR031_inline_pdf_attachment_embeds.md) | Inline PDF attachment embeds (`![[file.pdf]]` → iframe) + "Insert into document" button on attachment rows — **Completed** |

### Offline & Sync

| CR | Title |
|----|-------|
| [CR027](CR/CR027_offline_note_checkout.md) | Per-Note Offline Checkout (Read + Edit) — soft-sync IndexedDB cache + `/checkin` endpoint + conflict diff modal — **Completed (v1)** |
| [CR028](CR/CR028_offline_create_notes_and_ideas.md) | Offline Create for Notes & Ideas (+ IdeasView icon parity) — route "+ New" buttons through the existing outbox, surface pending items in lists with a `CloudUpload` badge |

### Stage 3 — Multi-User & Beyond

| CR | Title | Notes |
|----|-------|-------|
| [CR011](CR/CR011_multi_user_workspaces.md) | Multi-User Workspaces (Shared Notebooks) | Blocks CR012, CR018 |
| [CR012](CR/CR012_role_based_access_control.md) | Role-Based Access Control | Depends on CR011 |
| [CR018](CR/CR018_realtime_collaborative_editing.md) | Real-Time Collaborative Editing | Depends on CR011, CR012 |

### Stage 3 — Intelligence Add-Ons

| CR | Title | Notes |
|----|-------|-------|
| [CR013](CR/CR013_weekly_digest.md) | Weekly Digest | |
| [CR014](CR/CR014_link_suggestions.md) | Link Suggestions via Embeddings | Depends on CR001 |
| [CR015](CR/CR015_content_scaffolding.md) | Content Scaffolding | |

### Stage 3 — Native Apps

| CR | Title |
|----|-------|
| [CR016](CR/CR016_electron_desktop_wrapper.md) | Electron Desktop App Wrapper |
| [CR017](CR/CR017_react_native_mobile_app.md) | React Native Mobile App (iOS first) |

---

## Recently Completed

Tracked in `NOTED_CURRENT_STATE.md` under the relevant feature section. The full pre-reorg history of completed phases is preserved in [Archive/NOTED_DEVELOPMENT_PLAN_2026-04-25.md](Archive/NOTED_DEVELOPMENT_PLAN_2026-04-25.md).

### Released v0.11.20 (2026-05-25)

- **fix(mobile): wire `noteMap`/`noteTitles`/`attachmentMap` into the mobile `CodeMirrorEditor`.** Without these props the CR031 embed plugin sees an empty attachment map and every `![[file.pdf]]` falls through to the "broken" widget that renders the raw `![[…]]` text — which is exactly what users saw on Android. Also added an `onInsertAttachment` handler so the new attachment-row Insert button works on mobile. Note: even with this fix, Android Chrome has no native inline PDF viewer — the iframe will render but the browser may show a blank frame or download prompt for PDFs. Inline rendering works fully on desktop Chrome. ([frontend/src/components/mobile/MobileEditor.vue](../frontend/src/components/mobile/MobileEditor.vue))

### Released v0.11.19 (2026-05-25)

- **fix(editor): hide embedded PDF viewer chrome for CR031 inline embeds.** Iframe `src` now appends `#toolbar=0&navpanes=0&scrollbar=0` — PDF Open Parameters honoured by Chrome's built-in viewer (and most others) — so inline PDF embeds render flush against the editor without the viewer's filename bar, page-nav, and zoom controls. ([frontend/src/lib/codemirror/pdfEmbedRendering.js](../frontend/src/lib/codemirror/pdfEmbedRendering.js))

### Released v0.11.18 (2026-05-25)

- **fix(nginx): `X-Frame-Options: DENY` → `SAMEORIGIN` so CR031 inline PDF embeds load.** `DENY` blocks all framing — including same-origin — so the `![[file.pdf]]` iframe rendered "refused to connect" against its own host. `SAMEORIGIN` keeps clickjacking protection from external sites while letting the editor frame its own `/api/v1/attachments/:id` endpoint. ([nginx/noted.conf](../nginx/noted.conf))

### Released v0.11.17 (2026-05-25)

- **[CR031](CR/CR031_inline_pdf_attachment_embeds.md) — Inline PDF attachment embeds + Insert button.** New Obsidian-style `![[filename.pdf]]` syntax renders PDF attachments as an inline `<iframe>` in Normal Mode (browser-native PDF viewer; ~640 px tall, full editor width). Each row in the `AttachmentZone` gets a corner-down-left **Insert** button that drops the right markdown at the cursor — `![filename](url)` for images, `![[filename]]` for PDFs, `[filename](url)` for everything else. Wikilink regex (frontend renderer + backend `wikilinkParser`) now uses a negative lookbehind `(?<!!)` so embed syntax is no longer mis-classified as a broken wikilink. Source Mode still shows raw `![[…]]`. Out of scope: PDF.js viewer, standalone documents, print/export rendering — those remain CR025. See `Documentation/CR/CR031_inline_pdf_attachment_embeds.md`.

### Released v0.11.16 (2026-05-25)

- **fix(vault): biometric enrollment now retrieves the PRF secret via a follow-up `get()` when `create()` doesn't evaluate it.** Chrome (and most platform authenticators) register PRF support on `navigator.credentials.create()` but only evaluate `eval.first` on subsequent `get()` assertions — so the v0.11.14 enrollment code threw "PRF unsupported" even on Chrome 132+ where it actually works fine. Take the `create()` PRF result if present; otherwise immediately run an assertion against the just-registered credential to retrieve the secret. One extra biometric tap during enrollment only; unlock stays single-tap. ([frontend/src/lib/biometricUnlock.js](../frontend/src/lib/biometricUnlock.js))

### Released v0.11.15 (2026-05-25)

- **fix(settings): biometric vault card now appears in the desktop Settings page too.** SettingsView has separate mobile (`<MobileLayout v-if="isMobile">`) and desktop templates; the v0.11.14 CR021 enrollment card landed only in the mobile branch, so desktop users saw nothing between "Change Vault Password" and "Google Drive Import". Mirrored the section into the desktop branch. ([frontend/src/views/SettingsView.vue](../frontend/src/views/SettingsView.vue))

### Released v0.11.14 (2026-05-25)

- **[CR021](CR/CR021_biometric_vault_unlock.md) — Biometric Vault Unlock via WebAuthn PRF.** Opt-in per device: enrollment runs a WebAuthn ceremony with the PRF extension on the platform authenticator (Touch ID / Windows Hello / Android fingerprint), wraps a copy of the 32-byte master key under the PRF secret (AES-256-GCM), and stores the wrapped blob in `localStorage["noted.vaultBiometric"]`. Lock screen gains a "Use biometric unlock" button when a wrapped key is present; master password remains primary and mandatory. Master-password rotation auto-clears the local wrapped key; a stale wrap (e.g. password rotated on another device) is detected via verifier check after unwrap and auto-cleared. Zero backend changes — wrapped key blobs live in the browser only; the server has no awareness of biometric enrollment. New file `frontend/src/lib/biometricUnlock.js`; `vaultCrypto.js` extended with `deriveRawKey` / `importMasterKey` / `wrapBytes` / `unwrapBytes`; Settings card under Vault for enroll/disable. See [§5.17 in NOTED_CURRENT_STATE.md](NOTED_CURRENT_STATE.md#517-encrypted-vault-cr020--cr029--cr021-implemented).

### Released v0.11.13 (2026-05-25)

- **[CR030](CR/CR030_sortable_notes_list_columns.md) — Sortable Notes List Columns.** The expanded `NoteListPanel` (shown on `/notes`, `/notebooks/:id`, `/tags/:name` when no note is open) is now a two-column table with **Title** and **Last used** as clickable sticky headers. Clicking a header toggles sort direction; switching columns resets to that column's sensible default (`title` → asc, `updated_at` → desc, matching the prior order). Pinned notes always lead each sort group. Sorting is client-side over `notesStore.notes` (case-insensitive `localeCompare` for titles); the narrow sidebar layout used while editing a note is unchanged. See [§5 Desktop list-only layout entry in NOTED_CURRENT_STATE.md](NOTED_CURRENT_STATE.md).

### Released v0.11.12 (2026-05-25)

- **[CR029](CR/CR029_vault_card_bank_entry_types.md) — Vault gains Credit Card & Bank Account entry types.** Two new `type` discriminators (`card`, `bank`) added alongside the existing `password` / `key`. Card fields: name, card number (masked + reveal + copy), expiration date, security code (masked + reveal + copy), comments. Bank fields: account name, account number / IBAN (masked + reveal + copy), routing number, SWIFT / BIC code, comments. List view replaced the dropdown filter with a 4-tab segmented control; list rows show a type-specific badge icon + two quick-copy buttons per row (Card → CVV + Number; Bank → Routing + Acct). Zero backend changes — the server is strictly zero-knowledge so new types are an encrypted-blob shape only. ([CR020](CR/CR020_encrypted_password_vault.md)'s `changePassword` rotation already re-encrypts all blobs opaquely, so it works unchanged for the new types.) See [§5.17 in NOTED_CURRENT_STATE.md](NOTED_CURRENT_STATE.md#517-encrypted-vault-cr020--cr029-implemented).

### Released v0.11.11 (2026-05-25)

- **fix(ui): notebook picker dropdown no longer clips off the right edge of the editor toolbar.** The "Inbox" pill at the top-right of [NoteNotebooks.vue](../frontend/src/components/editor/NoteNotebooks.vue) anchored its 200px dropdown with `left: 0`, so on narrow / right-positioned toolbars the "New notebook name…" input was pushed past the viewport and unreachable when creating a notebook from a note. Switched the anchor to `right: 0` so the panel expands leftward from the button's right edge.
- **fix(scripts): `update_version.sh` tolerates gitignored `frontend/.env`.** The version bumper writes `VITE_APP_VERSION` to `frontend/.env`, which is gitignored — under `set -e` the staging `git add` aborted before commit + tag were created. Split it off and pipe to `/dev/null || true`, matching how lock files are handled. ([scripts/update_version.sh](../scripts/update_version.sh))
- **chore(docs):** CLAUDE.md "4 Key Rules" preamble + `/close` release-finalisation skill in `.claude/commands/`.

### Released v0.11.10 (2026-05-22)

- **fix(offline): tap-to-open a checked-out note no longer hangs on iPad Safari.** `fetchNote()`'s checkout branch previously did a best-effort `api.get('/notes/:id')` for fresh server metadata. iPad Safari leaves `navigator.onLine === true` in Airplane mode, so the fast-fail in [api/client.js](../frontend/src/api/client.js) didn't trigger and the actual `fetch()` hung ~30s before the OS gave up — during that time `MobileEditor.loadNote` was awaiting and the editor stayed blank with the "Untitled" placeholder. For a checked-out note the local IDB snapshot is the canonical view by design; users who want fresh metadata use the **Refresh offline copy** toolbar button. Drop the server fetch from the hot path — the editor now renders instantly regardless of platform. ([stores/notes.js](../frontend/src/stores/notes.js))

### Released v0.11.9 (2026-05-22)

Two compounding offline bugs:
- **fix(offline): cold-start no longer renders a blank screen on iPad Safari.** Same `navigator.onLine === true` in Airplane mode pattern — `authStore.init()` was awaiting `api.post('/auth/refresh')` from the router's `beforeEach`, which hung ~30s before resolving, so no route view ever rendered (just the themed body). Fast-path: when `localStorage` has a session hint (`noted.hasSession === '1'`), `init()` returns immediately and the refresh runs as a fire-and-forget background promise. ([stores/auth.js](../frontend/src/stores/auth.js))
- **fix(offline): tap-to-open from `/offline` no longer shows a blank "Untitled".** `fetchNote()` used to throw `OfflineError` when there was no local checkout AND the server was unreachable; `MobileEditor.loadNote` silently bailed and the editor refs stayed at their initialized empty values. Now `fetchNote()` returns an `_unavailableOffline` sentinel instead of throwing, and both `MobileEditor.loadNote` and `NotesView.loadNote` got try/catch + direct `getCheckout()` fallback, then a friendly "Not available offline. Reconnect to load this note." markdown message — never a silent blank. ([stores/notes.js](../frontend/src/stores/notes.js), [components/mobile/MobileEditor.vue](../frontend/src/components/mobile/MobileEditor.vue), [views/NotesView.vue](../frontend/src/views/NotesView.vue))

### Released v0.11.8 (2026-05-22)

- **fix(nav): Desktop list-only routes hide the editor pane.** On `Notes` / `NotebookNotes` / `TagNotes` / `Ideas` the `<main class="editor-pane">` is now `v-if="isDetailRoute"`-gated and [NoteListPanel](../frontend/src/components/ui/NoteListPanel.vue) takes a new `expanded` prop that switches it from fixed 280px to `flex: 1`. No more leftover toolbar/empty-editor showing when no note is selected — the list reads like Inbox.
- **feat(mobile): Dedicated `/home` route + Home button.** Resolves the v0.11.7 known follow-on. New route `name: 'Home'` at `/home` renders `MobileHome` on mobile (and falls through to the standard list layout on desktop). Home icon button added to [MobileNotesList.vue](../frontend/src/components/mobile/MobileNotesList.vue) header (top-left) and [MobileLayout.vue](../frontend/src/components/mobile/MobileLayout.vue) header (between Back and title) so the dashboard is reachable from All Notes / Inbox / etc.

### Released v0.11.7 (2026-05-22)

- **fix(nav): All Notes on mobile renders the notes list, not the dashboard.** [NotesView.vue](../frontend/src/views/NotesView.vue) `mobileShowList` now matches the `Notes` route alongside `NotebookNotes`/`TagNotes`, with `mobileListTitle` defaulting to `"All Notes"`. `onMounted` clears stale notebook/tag filters when landing directly on `/notes` (covers deep links + refresh). The legacy `MobileHome` dashboard is no longer reached via `/notes`; its cards (Tasks, Inbox, Ideas, Search, Reminders, Voice, Vault, Offline) remain reachable from the drawer.
- **Known follow-on (resolved in v0.11.8):** `MobileHome` is now orphaned (no route renders it). Decide whether to re-home it under a dedicated `/home` route or remove it.

### Released v0.11.0 (2026-05-22)

- **[CR027](CR/CR027_offline_note_checkout.md) — Per-Note Offline Checkout (Read + Edit).** Soft-sync offline editing for existing notes: per-note "Make available offline" toggle → local IndexedDB copy → edit offline → check in on reconnect with optimistic concurrency. New `POST /api/v1/notes/:id/checkin` endpoint (200 on match, 409 with full server row on stale `base_version`). Conflict modal offers Keep local / Keep server / Hand-merge. New `/offline` route + activity rail icon + OfflinePanel listing dirty / clean checkouts. IDB schema bumped 1 → 2 (`checkouts` store added alongside the existing outbox). Backend tests: 20/20 passing in [`backend/tests/cr027-checkout.test.js`](../backend/tests/cr027-checkout.test.js). See [§5.14a in NOTED_CURRENT_STATE.md](NOTED_CURRENT_STATE.md#514a-per-note-offline-checkout-cr027-implemented) for the feature spec.
- **Known follow-ons:** inline-image Blob caching (renderer change is its own concern), greyed-out wikilinks while offline, vitest scaffolding for `checkouts.js` / `checkoutSync.js` (manual walkthrough in CR027 §13.2 is the v1 regression spec).
