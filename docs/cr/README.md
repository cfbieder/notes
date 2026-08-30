# Change Requests — Index

This table is the **single source of truth for what shipped when.** Other docs
([status.md](docs/current/status.md), [project-description.md](docs/current/project-description.md),
[project-roadmap.md](docs/current/project-roadmap.md)) link here — they do not restate dates or status.

Each row links to a per-feature design record. Shipped CRs stay in `docs/cr/` as
historical records (✓ Completed); they are not moved to `archive/`. New work gets
the next sequential number and starts from [cr-000-template.md](docs/cr/cr-000-template.md).

| CR | Title | Date / Version | Status |
|----|-------|----------------|--------|
| [001](docs/cr/cr-001-pgvector-embeddings.md) | pgvector + Embedding Pipeline | — | Open |
| [002](docs/cr/cr-002-semantic-hybrid-search.md) | Semantic / Hybrid Search | — | Open |
| [003](docs/cr/cr-003-related-notes-panel.md) | Related Notes Panel | — | Open |
| [004](docs/cr/cr-004-smart-tag-suggestions.md) | Smart Tag Suggestions | — | Open |
| [005](docs/cr/cr-005-auto-title-for-captures.md) | Auto-Title for Captures | — | Open |
| [006](docs/cr/cr-006-note-summarization.md) | Note Summarization | — | Open |
| [007](docs/cr/cr-007-task-extraction.md) | Task Extraction from Notes | — | Open |
| [008](docs/cr/cr-008-natural-language-query.md) | Natural Language Note Query ("Ask My Notes") | — | Open |
| [009](docs/cr/cr-009-signed-attachment-urls.md) | Replace Attachment Query-String JWT with Signed URLs | — | Open |
| [010](docs/cr/cr-010-user-settings-email-display.md) | User Settings: Email & Display Preferences | — | Open |
| [011](docs/cr/cr-011-multi-user-workspaces.md) | Multi-User Workspaces (Shared Notebooks) | — | Open |
| [012](docs/cr/cr-012-role-based-access-control.md) | Role-Based Access Control | — | Open |
| [013](docs/cr/cr-013-weekly-digest.md) | Weekly Digest | — | Open |
| [014](docs/cr/cr-014-link-suggestions.md) | Link Suggestions via Embeddings | — | Open |
| [015](docs/cr/cr-015-content-scaffolding.md) | Content Scaffolding | — | Open |
| [016](docs/cr/cr-016-electron-desktop-wrapper.md) | Electron Desktop App Wrapper | — | Open |
| [017](docs/cr/cr-017-react-native-mobile-app.md) | React Native Mobile App (iOS first) | — | Open |
| [018](docs/cr/cr-018-realtime-collaborative-editing.md) | Real-Time Collaborative Editing | — | Open |
| [019](docs/cr/cr-019-ai-assist-modes.md) | AI Assist: Quick / Deep-Think Modes + Async Inbox | 2026-04-26 | ✓ Completed |
| [020](docs/cr/cr-020-encrypted-password-vault.md) | Encrypted Password & Key Vault | 2026-04-30 | ✓ Completed |
| [021](docs/cr/cr-021-biometric-vault-unlock.md) | Biometric Vault Unlock (WebAuthn PRF) | v0.11.14 | ✓ Completed |
| [022](docs/cr/cr-022-hide-default-inbox-notebook.md) | Hide Default "Inbox" Notebook from Sidebar | — | ✓ Completed |
| [023](docs/cr/cr-023-html-format-notes.md) | HTML-Format Notes (Upload + Render) | 2026-05-09 | ✓ Completed |
| [024](docs/cr/cr-024-task-inline-edit.md) | Task Inline Edit | 2026-05-09 | ✓ Completed |
| [025](docs/cr/cr-025-pdf-document-management.md) | PDF Document Management (Import, View, Folder Storage) | — | Open |
| [026](docs/cr/cr-026-activity-rail-navigation.md) | Activity Rail + Contextual Panel Navigation | — | In progress |
| [027](docs/cr/cr-027-offline-note-checkout.md) | Per-Note Offline Checkout (Read + Edit) | v1, 2026-05-22 | ✓ Completed |
| [028](docs/cr/cr-028-offline-create-notes-and-ideas.md) | Offline Create for Notes & Ideas (+ Icon Sweep) | — | Open |
| [029](docs/cr/cr-029-vault-card-bank-entry-types.md) | Vault: Credit Card & Bank Account entry types | v0.11.12 | ✓ Completed |
| [030](docs/cr/cr-030-sortable-notes-list-columns.md) | Sortable Notes List Columns (Title / Last Used) | v0.11.13 | ✓ Completed |
| [031](docs/cr/cr-031-inline-pdf-attachment-embeds.md) | Inline PDF Attachment Embeds + Insert Action | — | ✓ Completed |
| [032](docs/cr/cr-032-drop-is-inbox-flag.md) | Drop `notes.is_inbox` flag; derive Inbox from default notebook | — | ✓ Completed |
| [033](docs/cr/cr-033-vault-entry-groups.md) | Vault: Optional Grouping Headers for Entries | v0.13.0 | ✓ Completed |
| [034](docs/cr/cr-034-drive-reconnect-startup-notice.md) | Google Drive Reconnect Notice at App Startup | v0.14.0 | ✓ Completed |
| [035](docs/cr/cr-035-vault-emergency-export.md) | Vault Emergency Export (self-decrypting HTML) | 2026-06-19 | ✓ Completed |
| [036](docs/cr/cr-036-export-note-as-pdf.md) | Export Note as PDF (Markdown + HTML) | v0.15.0 | ✓ Completed |
| [037](docs/cr/cr-037-multi-note-editor-tabs.md) | Multi-Note Editor Tabs (Desktop) | v0.16.0 | ✓ Completed |
| [038](docs/cr/cr-038-pluggable-ai-providers.md) | Pluggable AI Providers (Claude / OpenAI / Local) | — | Open |

> **Note:** CR035 was originally authored as a second "CR030" (duplicate number) and
> renumbered during the 2026-06-28 migration to the documentation standard.
