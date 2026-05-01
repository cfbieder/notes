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
| [CR021](CR/CR021_biometric_vault_unlock.md) | Biometric Vault Unlock (WebAuthn PRF) — planning only |

### Settings & UX

| CR | Title |
|----|-------|
| [CR010](CR/CR010_user_settings_email_display.md) | User Settings — Email & Display Preferences |
| [CR019](CR/CR019_ai_assist_modes.md) | AI Assist — Quick / Deep-Think Modes + Async Inbox Delivery — **Completed** |

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
