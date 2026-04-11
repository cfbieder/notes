# Development Plan — Noted

> Personal Knowledge & Task Management App
> Status: Phases 0–5, 9 complete | Last updated: 2026-04-11

---

## Table of Contents

1. [Project Objective](#1-project-objective)
2. [Architecture Summary](#2-architecture-summary)
3. [Phase 0 — Project Scaffold & Infrastructure](#3-phase-0--project-scaffold--infrastructure)
4. [Phase 1 — Core Backend (Auth, Notes, Notebooks)](#4-phase-1--core-backend-auth-notes-notebooks)
5. [Phase 2 — Editor & Frontend Shell](#5-phase-2--editor--frontend-shell)
6. [Phase 3 — Tags, Search, Inbox & Tasks](#6-phase-3--tags-search-inbox--tasks)
7. [Phase 4 — Attachments, Reminders & PWA](#7-phase-4--attachments-reminders--pwa)
8. [Phase 5 — Production Deployment](#8-phase-5--production-deployment)
9. [Phase 6 — Knowledge Graph (Stage 2)](#9-phase-6--knowledge-graph-stage-2)
10. [Phase 7 — Web Clipper & OCR (Stage 2)](#10-phase-7--web-clipper--ocr-stage-2)
11. [Phase 8 — LLM-Powered Intelligence (Stage 2)](#105-phase-8--llm-powered-intelligence-stage-2)
12. [Backlog & Future (Stage 3)](#11-backlog--future-stage-3)
12. [Known Issues & Decisions](#12-known-issues--decisions)
13. [Infrastructure Notes](#13-infrastructure-notes)
14. [Completed Phases](#14-completed-phases)

---

## 1. Project Objective

Build a self-hosted, Markdown-first note-taking app that combines Evernote's organizational depth (notebooks, stacks, tags, tasks, attachments) with Obsidian's knowledge graph model (bidirectional wikilinks, graph view). Hosted on a KVM VM, accessed via Tailscale.

**Tech stack:** Vue.js 3 + Vite (frontend), Fastify + Node.js (backend), PostgreSQL (database), CodeMirror 6 (editor), D3.js (graph view).

---

## 2. Architecture Summary

```
Browser / PWA
     │
     ▼
  Vue.js 3 SPA ──── CodeMirror 6 (editor) + D3.js (graph)
     │ HTTP/REST
     ▼
  Fastify API (Node.js)
     ├── Auth (JWT)
     ├── Notes / Notebooks / Stacks
     ├── Tags / Links / Tasks
     ├── Search / Attachments / Reminders
     │
     ▼
  PostgreSQL (JSONB content, tsvector search, pgvector future)
```

**Dev environment:** PostgreSQL in Docker, backend + frontend run locally (fast HMR).
**Production:** Full Docker stack (DB + backend + Nginx) behind Tailscale.

---

## 3. Phase 0 — Project Scaffold & Infrastructure

**Goal:** Establish monorepo structure, Docker dev environment, database migrations, and CI-ready project skeleton.

| # | Task | Details |
|---|------|---------|
| 0.1 | Initialize monorepo structure | Create `frontend/`, `backend/`, `db/`, `scripts/`, `nginx/`, `attachments/` directories per folder structure spec |
| 0.2 | Backend scaffold | `npm init`, install Fastify, dotenv, pg, node-pg-migrate; create `src/app.js` with `/health` endpoint |
| 0.3 | Frontend scaffold | `npm create vite@latest` with Vue 3 + TypeScript template; install Pinia, Vue Router |
| 0.4 | Environment files | Create `backend/.env.example` with all config vars; `.gitignore` for `.env`, `.env.dev`, uploads, logs, certs, Backups |
| 0.5 | Docker dev compose | `docker-compose.dev.yml` — PostgreSQL 16 Alpine, healthcheck, named volume |
| 0.6 | Migration runner | `backend/src/utils/migrate.js` — tracks applied migrations in `migrations_applied` table, runs `.sql` files in order |
| 0.7 | Initial migration (001) | `users`, `notebooks`, `stacks`, `notes`, `tags`, `note_tags`, `note_links`, `tasks`, `attachments` tables + indexes + triggers |
| 0.8 | Dev seed data | `db/seeds/` — create test user, sample notebooks, notes, tags |
| 0.9 | setup-dev.sh | One-command dev bootstrap: install Node 20, Docker, generate `.env.dev`, npm install, start DB, run migrations |
| 0.10 | CLAUDE.md | Project context file for Claude Code with tech stack, conventions, and workflow instructions |
| 0.11 | Vite proxy config | `vite.config.js` — proxy `/api` to `http://localhost:3001` for dev |

**Acceptance criteria:**
- `bash scripts/setup-dev.sh` bootstraps a working dev environment from a fresh clone
- `npm run dev` starts both backend (port 3001) and frontend (port 5173)
- `/health` endpoint returns `{ status: "ok" }`
- Database has all tables created via migration

---

## 4. Phase 1 — Core Backend (Auth, Notes, Notebooks)

**Goal:** Functional REST API for authentication and core CRUD operations.

| # | Task | Details |
|---|------|---------|
| 1.1 | JWT auth plugin | Fastify plugin: access token (15 min) + refresh token (30 days, httpOnly cookie); bcrypt password hashing |
| 1.2 | Auth routes | `POST /api/v1/auth/login`, `/refresh`, `/logout` |
| 1.3 | Auth middleware | Route decorator that validates JWT on all `/api/v1/*` except auth routes |
| 1.4 | Users CRUD | Registration endpoint (for initial setup), user profile |
| 1.5 | Notebooks routes | Full CRUD: `GET/POST/PUT/DELETE /api/v1/notebooks`; enforce default "Inbox" notebook per user |
| 1.6 | Stacks routes | Full CRUD: `GET/POST/PUT/DELETE /api/v1/stacks` |
| 1.7 | Notes routes | `GET/POST/PUT/DELETE /api/v1/notes`; query filters for `notebook_id`, `tag_id`, `is_inbox`, `search`, pagination (`limit`, `offset`) |
| 1.8 | Input validation | Fastify schema validation (or Joi) on all route inputs |
| 1.9 | Error handling | Centralized error handler plugin; consistent error response format `{ error, message, statusCode }` |
| 1.10 | Rate limiting | `@fastify/rate-limit` on auth endpoints |
| 1.11 | CORS config | `@fastify/cors` configured for dev (localhost:5173) and prod origins |
| 1.12 | Structured logging | Fastify's built-in Pino logger with file transport for production |

**Acceptance criteria:**
- Can register a user, log in, receive JWT, and use it to create/read/update/delete notebooks and notes
- Refresh token rotation works correctly
- All endpoints return proper error responses for invalid input

---

## 5. Phase 2 — Editor & Frontend Shell

**Goal:** Three-pane layout with a working Markdown editor.

| # | Task | Details |
|---|------|---------|
| 2.1 | Vue Router setup | Routes per spec: `/`, `/login`, `/notes`, `/notes/:id`, `/inbox`, `/tasks`, `/tags/:name`, `/notebooks/:id`, `/graph`, `/search` |
| 2.2 | Pinia stores | `useAuthStore`, `useNotesStore`, `useNotebooksStore`, `useUIStore` (sidebar state, editor mode) |
| 2.3 | API client layer | `frontend/src/api/` — fetch wrappers with JWT token injection, refresh-on-401 logic |
| 2.4 | Login page | Username + password form; redirect to `/notes` on success |
| 2.5 | App shell & layout | Three-pane layout: sidebar (260px) \| note list (280px) \| editor (flex: 1) |
| 2.6 | Sapphire Slate theme | Global CSS custom properties, `theme.css` with full color palette per UI design spec |
| 2.7 | Typography setup | Inter (body), Plus Jakarta Sans (headings), JetBrains Mono (code) via Google Fonts |
| 2.8 | Sidebar component | `AppSidebar.vue` — collapsible stacks → notebooks tree with note counts |
| 2.9 | Note list panel | `NoteListPanel.vue` — filterable note list, sorted by updated_at |
| 2.10 | CodeMirror 6 editor | `CodeMirrorEditor.vue` — Markdown editing with Sapphire theme integration |
| 2.11 | Normal Mode rendering | Inline Markdown rendering (headings, bold, italic, lists, checkboxes, code blocks, tables) |
| 2.12 | Source Mode toggle | Toggle between rendered and raw Markdown view |
| 2.13 | Editor toolbar | `EditorToolbar.vue` — formatting buttons, mode toggle, save indicator |
| 2.14 | Autosave | Debounced save (500ms after last keystroke) with visual save indicator |
| 2.15 | Dev/Prod visual differentiation | Dev: orange favicon, `[DEV]` tab title, env badge in sidebar; Prod: clean Sapphire theme |

**Acceptance criteria:**
- User can log in, see notebooks in sidebar, select a notebook, see notes, open a note in the editor
- Editor supports Normal Mode (inline rendering) and Source Mode toggle
- Autosave persists changes without manual action
- Sapphire Slate theme applied consistently across all components

---

## 6. Phase 3 — Tags, Search, Inbox & Tasks

**Goal:** Complete the Stage 1 feature set for organization and capture.

| # | Task | Details |
|---|------|---------|
| 3.1 | Tags API routes | `GET/POST/PUT/DELETE /api/v1/tags`; returns tags with note counts |
| 3.2 | Tags store & sidebar | `useTagsStore`; `SidebarTags.vue` — tag browser with counts, click to filter |
| 3.3 | Tag assignment in editor | Add/remove tags on notes via tag pills in editor toolbar or note metadata |
| 3.4 | Full-text search API | `GET /api/v1/search` — PostgreSQL `tsvector` search across titles and content; filters by notebook, tag, date range |
| 3.5 | Search UI | `SearchView.vue` — `Ctrl+K` command palette, result navigation with arrow keys |
| 3.6 | Quick capture inbox API | Notes with `is_inbox = true`; `GET /api/v1/tasks/inbox` for inbox tasks |
| 3.7 | Quick capture modal | `SidebarQuickCapture.vue` — `Ctrl+Shift+N` floating modal; capture types: note, task, idea |
| 3.8 | Inbox view | `InboxView.vue` — unallocated captures in reverse chronological order; process actions (convert, move, discard) |
| 3.9 | Tasks API routes | `GET/POST/PUT/DELETE /api/v1/tasks`; query filters for `note_id`, `is_done`, `due_before`, `due_after` |
| 3.10 | Inline checkboxes | `- [ ]` / `- [x]` render as interactive checkboxes in Normal Mode; toggle updates note content |
| 3.11 | Tasks view | `TasksView.vue` — all tasks across all notes, filterable by status and due date |
| 3.12 | Due dates & date picker | Inline or panel-based date picker for task due dates |

**Acceptance criteria:**
- Tags can be created, assigned to notes, and used to filter the note list
- `Ctrl+K` opens search; results are accurate and filterable
- `Ctrl+Shift+N` opens quick capture; items appear in inbox and can be processed
- Tasks with due dates appear in the dedicated tasks view

---

## 7. Phase 4 — Attachments, Reminders & PWA

**Goal:** File management, time-based notifications, and offline-capable PWA.

| # | Task | Details |
|---|------|---------|
| 4.1 | Attachments API | `POST /api/v1/notes/:id/attachments` (multipart), `GET /api/v1/attachments/:id` (stream), `DELETE` |
| 4.2 | File storage | Structured directory: `attachments/{year}/{month}/{note_id}/`; metadata in `attachments` table |
| 4.3 | Upload UI | Drag-and-drop into editor body + toolbar upload button |
| 4.4 | Inline image rendering | Images render inline in Normal Mode; PDFs show thumbnail |
| 4.5 | Reminders system | `reminder_at` field on tasks and notes; backend cron or polling for due reminders |
| 4.6 | Reminders panel | UI panel showing upcoming and overdue reminders |
| 4.7 | PWA manifest | `public/manifest.json` — app name, icons, theme color, display: standalone |
| 4.8 | Service worker | Vite PWA plugin — offline shell, asset caching |
| 4.9 | Drag-and-drop notes | Move notes between notebooks via drag-and-drop in sidebar |
| 4.10 | Mobile FAB button | Floating action button (bottom-right) for quick capture on touch/narrow viewports; replaces `Alt+N` keyboard shortcut on mobile |
| 4.11 | Quick capture type differentiation | Differentiate Note vs Task vs Idea capture types (deferred from Phase 3 — currently all three are functional but Idea is identical to Note) |
| 4.12 | Mobile Home Screen | Responsive mobile dashboard (`< 768px`): Quick Note hero card (full-width), Tasks/Inbox/Search cards (2x2 grid, 4th slot reserved for Reminders), collapsible recent notes (last 5), hamburger → sidebar slide-out overlay. Full-screen editor with back + Source/Normal toggle. |

**Acceptance criteria:**
- Files can be uploaded to notes and rendered inline (images) or as thumbnails (PDFs)
- Reminders surface in a dedicated panel when due
- App installable as PWA; loads offline shell when network unavailable
- Quick capture accessible on mobile via FAB button
- Mobile home screen renders at `< 768px` with action cards, collapsible recent notes, and hamburger navigation
- Editor goes full-screen on mobile with back button and Source/Normal toggle

---

## 8. Phase 5 — Production Deployment

**Goal:** Secure, automated deployment to KVM VM.

| # | Task | Details |
|---|------|---------|
| 5.1 | ✅ Docker production compose | `docker-compose.prod.yml` — PostgreSQL + Fastify backend + Nginx; healthchecks on all services |
| 5.2 | ✅ Backend Dockerfile | Multi-stage build; non-root `noted` user; wget healthcheck |
| 5.3 | ✅ Frontend Dockerfile | Multi-stage build (Vite build → Nginx 1.27 Alpine); version build arg |
| 5.4 | ✅ Nginx config | `nginx/noted.conf` — SSL termination, SPA `try_files`, API reverse proxy, asset caching (1y immutable), gzip, security headers |
| 5.5 | ✅ TLS certificates | `scripts/setup-certs.sh` — `tailscale cert` for `noted.tail413695.ts.net`; auto-reloads Nginx if running |
| 5.6 | ✅ deploy-to-production.sh | Pre-flight checks (Docker, Tailscale, env, certs), auto backup, Docker build, migrations, service start, health verification |
| 5.7 | ✅ update_version.sh | Semantic versioning with date stamp; git tags — `scripts/update_version.sh <major\|minor\|patch\|X.Y.Z>` updates VERSION, package.json files, frontend/.env, creates git commit + annotated tag |
| 5.8 | ✅ backup-db.sh | Local `pg_dump` with gzip, optional `--prune N` retention |
| 5.9 | ✅ backup-to-remote.sh | SSH-based remote backup with configurable retention (REMOTE_HOST, REMOTE_KEEP) |
| 5.10 | ✅ Cron jobs | `scripts/setup-cron.sh` — idempotent cron installer: remote backup (every 2 days 2 AM), cert renewal (monthly 3 AM), Docker prune (weekly Sunday 3 AM) |
| 5.11 | ✅ Version display in UI | Show `VITE_APP_VERSION` in sidebar footer — already implemented in `AppSidebar.vue` |

**Acceptance criteria:**
- `./scripts/deploy-to-production.sh` performs a zero-downtime deploy with automatic DB backup
- App accessible via HTTPS over Tailscale
- Automated backups running on schedule

---

## 9. Phase 6 — Knowledge Graph (Stage 2)

**Goal:** Bidirectional links and interactive graph visualization.

| # | Task | Details |
|---|------|---------|
| 6.1 | Wikilink parser service | `backend/src/services/linkParser.js` — extract `[[Note Title]]` from Markdown, resolve to UUIDs |
| 6.2 | note_links population | On note save, parse content for wikilinks and upsert into `note_links` table with context snippets |
| 6.3 | Wikilink autocomplete | `[[` trigger in CodeMirror — autocomplete dropdown of existing note titles |
| 6.4 | Backlinks API | `GET /api/v1/notes/:id/backlinks` — notes linking to current note with context snippets |
| 6.5 | Backlinks panel | `BacklinksPanel.vue` — collapsible panel listing backlinks and unlinked mentions |
| 6.6 | Unlinked mentions | Scan all notes for title mentions without `[[]]` wrapper |
| 6.7 | Broken link detection | Flag links to deleted notes visually in editor |
| 6.8 | Graph API | `GET /api/v1/graph` — all nodes (notes + tags) and edges for user; `GET /api/v1/notes/:id/graph` for local graph |
| 6.9 | Graph service | `backend/src/services/graphService.js` — build node/edge data from notes, tags, and links tables |
| 6.10 | Full graph view | `GraphView.vue` — D3.js force-directed layout; note nodes, tag nodes, edge rendering |
| 6.11 | Graph interactions | Click to open note, hover for title/count, drag to reposition, filter toggles |
| 6.12 | Local graph | Mini graph in note view showing 1-degree connections |
| 6.13 | Tag nodes in graph | Tags rendered as distinct smaller nodes connecting all tagged notes |

**Acceptance criteria:**
- Typing `[[` shows autocomplete of note titles; selecting creates a tracked bidirectional link
- Backlinks panel shows all notes linking to the current note
- Full graph view renders all notes and tags as an interactive force-directed graph
- Each note has a local graph showing its immediate connections

---

## 10. Phase 7 — Web Clipper & OCR (Stage 2)

**Goal:** Capture external content and make attachments searchable. Leverages existing LLM gateway OCR (Gemini 2.5 Flash → Claude Sonnet vision fallback) instead of Tesseract.

| # | Task | Details |
|---|------|---------|
| 7.1 | Web clipper extension | Chrome extension — capture full page, article (Readability.js), selection, or screenshot |
| 7.2 | Clipper API endpoint | Accept clipped content with URL, timestamp, notebook, tags |
| 7.3 | Clipper destination UI | Popup with notebook/tag selection or "send to inbox" |
| 7.4 | OCR integration | Backend calls LLM gateway `POST /ocr` for text extraction and `POST /ocr/json` for structured data extraction from PDF/image attachments. No local Tesseract dependency. |
| 7.5 | OCR text storage | Populate `attachments.ocr_text` column on upload — triggered automatically when image/PDF attachments are saved |
| 7.6 | OCR in search index | Include `ocr_text` in full-text search tsvector |
| 7.7 | OCR + translate on clip | Optional translation of clipped/OCR'd content via gateway `POST /ocr/translate` — useful for foreign-language documents |

**Acceptance criteria:**
- Browser extension can clip pages to the app with notebook/tag selection
- Uploaded PDFs and images have extracted text (via LLM gateway OCR) searchable via full-text search
- OCR works without any local ML dependencies — calls existing gateway at `100.66.213.40:8080`

---

## 10.5. Phase 8 — LLM-Powered Intelligence (Stage 2)

**Goal:** Add AI-powered features using the existing local LLM gateway (dual-GPU Ollama + cloud fallback). All LLM features degrade gracefully when the gateway is unreachable — the app remains fully functional without AI.

**LLM Gateway:** `http://100.66.213.40:8080` (Tailscale) — phi4:14b (fast), qwen3:32b (deep reasoning), nomic-embed-text (embeddings)

| # | Task | Details |
|---|------|---------|
| 8.1 | LLM service layer | `backend/src/services/llmService.js` — centralized HTTP client for the LLM gateway. Health check on startup, circuit breaker pattern, timeout handling (300s). All LLM features route through this service. Config via env vars (`LLM_GATEWAY_URL`, `LLM_ENABLED`). |
| 8.2 | pgvector + embedding pipeline | Migration: enable `pgvector` extension, add `embedding vector(768)` column to `notes` table. On note save (debounced), call Ollama `nomic-embed-text` via gateway to generate embedding, store in pgvector. Background job for initial backfill of existing notes. |
| 8.3 | Semantic search | Augment existing tsvector search with pgvector cosine similarity (`<=>`). `GET /api/v1/search` gains `mode` param: `keyword` (existing), `semantic` (embedding), `hybrid` (both, RRF-merged). Frontend search palette (`Ctrl+K`) gets a toggle for search mode. |
| 8.4 | Related notes panel | `GET /api/v1/notes/:id/related` — top 5 notes by embedding similarity (excluding self). `RelatedNotesPanel.vue` — collapsible panel in editor view, similar to planned Backlinks panel. Click to navigate. |
| 8.5 | Smart tag suggestions | On note save, send content + user's existing tag list to gateway `POST /llm/generate` (phi4:14b). Returns 2-3 suggested tags. Frontend shows as ghost/dashed pills in the tag bar — one click to accept, dismiss on hover. `POST /api/v1/notes/:id/suggest-tags`. |
| 8.6 | Auto-title for captures | Quick captures with empty/generic titles get an LLM-generated title suggestion. Runs after save via gateway (phi4:14b). UI shows suggestion inline with accept/dismiss. Non-blocking — title appears after a short delay. |
| 8.7 | Note summarization | `POST /api/v1/notes/:id/summarize` — generates 2-3 sentence summary via gateway (phi4:14b). `NoteSummary.vue` — collapsible summary block at top of editor. Also used in note list panel as preview text (cached, regenerated on content change). |
| 8.8 | Task extraction | "Extract tasks" button in editor toolbar. Sends note content to gateway (phi4:14b) with prompt to identify action items. Returns proposed tasks in a review modal — user can accept/edit/dismiss each before creation. `POST /api/v1/notes/:id/extract-tasks`. |
| 8.9 | Natural language note query | "Ask my notes" mode in search palette. User types a question → backend embeds query → pgvector retrieves top-N relevant notes → sends to gateway with context for synthesis → returns answer with note citations (clickable links). `POST /api/v1/search/ask`. |
| 8.10 | Audio note capture | Record audio in quick capture modal (MediaRecorder API) or upload audio file. Backend sends to gateway `POST /transcribe` (Whisper). Transcribed text becomes note content. Mobile FAB gets microphone option. Supports OGG, MP3, WAV, M4A. |
| 8.11 | Note translation | Translate note content via gateway `POST /translate`. UI: toolbar button → language picker → side-by-side or in-place translation. `POST /api/v1/notes/:id/translate`. Supports ~40 languages via LLM-based translation. |

**Acceptance criteria:**
- `Ctrl+K` search supports semantic mode — finds conceptually related notes even without keyword matches
- Related notes panel shows semantically similar notes when viewing any note
- Smart tag suggestions appear as ghost pills after saving a note; one click to accept
- Quick captures get auto-generated titles when saved without one
- "Extract tasks" identifies action items from note content and creates tasks after user review
- "Ask my notes" returns synthesized answers with citations to source notes
- Audio capture creates notes from voice recordings via Whisper transcription
- All LLM features degrade gracefully — app works normally when gateway is down

---

## 10.6. Phase 9 — Google Drive Import

**Goal:** Import files from a designated Google Drive folder into the Noted inbox, via OAuth + polling.

| # | Task | Details |
|---|------|---------|
| 9.1 | ✅ Database migration | `004_google_drive_integration.sql` — `integrations` table (OAuth tokens, JSONB config) + `import_history` table (dedup, status log) |
| 9.2 | ✅ Drive importer service | `backend/src/services/driveImporter.js` — downloads Drive files, creates inbox notes + attachments. Text files become note body; images/PDFs/Google Docs become attachments. |
| 9.3 | ✅ Drive poller service | `backend/src/services/drivePoller.js` — 60s tick interval, checks poll_interval_minutes per integration, dedup via import_history, best-effort move to "Processed" subfolder |
| 9.4 | ✅ Poller Fastify plugin | `backend/src/plugins/drivePoller.js` — registers poller on `onReady`, exposes `fastify.drivePoller` for manual scan trigger |
| 9.5 | ✅ Integration routes | `backend/src/routes/integrations.js` — 7 endpoints: OAuth auth-url, callback, status, config, scan, disconnect, history |
| 9.6 | ✅ Frontend settings view | `frontend/src/views/SettingsView.vue` — Google Drive connection, folder config, poll interval, manual scan button, import history |
| 9.7 | ✅ Frontend integrations store | `frontend/src/stores/integrations.js` — Pinia store for Drive status, config, scan, history |
| 9.8 | ✅ Router + sidebar | Settings nav item added to sidebar and router |
| 9.9 | ✅ Docker/prod config | Google OAuth env vars in `docker-compose.prod.yml` and `.env.prod.example` |

**Prerequisites:** Google Cloud project with Drive API enabled + OAuth2 credentials (Web application type). Redirect URI must include Tailscale domain.

**Acceptance criteria:**
- User can connect Google Drive from Settings page via OAuth
- User designates a Drive folder by name; backend validates it exists
- Backend polls folder on configurable interval (1–30 min) and imports new files to inbox
- Manual "Scan Now" button triggers immediate import
- Import history shows file name, status, timestamp, and link to created note
- Imported files moved to "Processed" subfolder in Drive (best-effort; import succeeds even if move fails)
- `.md`/`.txt` content imported as note body; other files attached to inbox notes
- App works normally when Google credentials are not configured (graceful degradation)

---

## 11. Backlog & Future (Stage 3)

These items are out of scope for Stages 1–2 but documented for future planning:

- [x] ~~Notebook & Stack management UI~~ — completed 2026-04-06
- [x] ~~pgvector semantic search~~ — moved to Phase 8.2/8.3 (uses Ollama nomic-embed-text via LLM gateway, no Python microservice needed)
- [x] ~~AI summarization of notes~~ — moved to Phase 8.7 (local LLM via gateway, no cloud API cost)
- [x] ~~Smart tag suggestions~~ — moved to Phase 8.5
- [ ] User settings page — change password, email, display preferences
- [ ] Multi-user workspaces (shared notebooks)
- [ ] Role-based access control (viewer / editor / admin)
- [ ] Weekly digest — scheduled job summarizes week's captures, completed tasks, emerging themes; generates a "Weekly Review" note
- [ ] Link suggestions — use embeddings to suggest wikilinks between semantically related notes (enhances Phase 6 graph)
- [ ] Content scaffolding — type a one-liner prompt, LLM expands into a structured note skeleton
- [ ] Electron desktop app wrapper
- [ ] React Native mobile app (iOS first)
- [ ] Real-time collaborative editing

---

## 12. Known Issues & Decisions

| Date | Decision / Issue | Context |
|------|-----------------|---------|
| 2026-04-04 | Fastify over Express | Lower overhead, built-in schema validation, Pino logging out of the box |
| 2026-04-04 | Vue.js over React | PROJECT_DESCRIPTION specifies Vue 3 with Composition API; DEVELOPMENT_PRACTICES reference uses React/Express patterns — adapt infrastructure patterns (Docker, scripts, env separation) to Vue/Fastify stack |
| 2026-04-04 | node-pg-migrate for migrations | Forward-only migrations with numbered SQL files; no rollbacks in production |
| 2026-04-04 | Naming convention | camelCase in JavaScript, snake_case in database columns |
| 2026-04-04 | API response format | `{ data, meta }` for success; `{ error, message, statusCode }` for errors |
| 2026-04-05 | Quick capture shortcut | Changed from `Ctrl+Shift+N` to `Alt+N` — browser intercepts Ctrl+Shift+N as "new incognito window" |
| 2026-04-05 | API client Content-Type | DELETE and GET requests must not send `Content-Type: application/json` header — Fastify rejects empty body with that content type |
| 2026-04-05 | Inbox dropdown | Changed Move dropdown from hover-based to click-based — hover menus are unreliable for nested interactions |
| 2026-04-06 | Mobile breakpoint | `< 768px` triggers mobile home screen; desktop three-pane layout at `≥ 768px` |
| 2026-04-06 | Attachment storage | Files stored in `uploads/{year}/{month}/{noteId}/` with timestamp prefix to avoid collisions |
| 2026-04-06 | PWA caching | Workbox CacheFirst for attachments (30-day TTL), NetworkFirst for API (5-min TTL) |
| 2026-04-06 | Idea capture | Ideas get "💡" title prefix and blockquote content wrapper to distinguish from regular notes |
| 2026-04-10 | TLS via Tailscale | Using `tailscale cert` (Let's Encrypt) instead of manual cert management — Nginx handles SSL termination, Tailscale handles provisioning/renewal |
| 2026-04-10 | Docker prod architecture | Three containers (noted-db, noted-api, noted-web) on internal bridge network; only Nginx exposes ports 80/443 |
| 2026-04-10 | Alpine IPv6 healthcheck | Alpine's `wget` resolves `localhost` to `::1` (IPv6) but Node binds `0.0.0.0` (IPv4 only) — all Docker healthchecks must use `127.0.0.1` explicitly |
| 2026-04-10 | Vite .env in Docker builds | Vite reads `.env` files at build time, overriding `ENV` directives — frontend Dockerfile must `rm -f .env` before `npm run build` and omit `VITE_ENV_LABEL` so production builds have no dev label |
| 2026-04-10 | Dev/prod favicon | Dev: orange background + dark blue "N" (dynamically swapped via data URI in `main.js`). Prod: dark blue background + orange "N" (static `favicon.svg`). Controlled by `VITE_ENV_LABEL` being set/unset |
| 2026-04-10 | LLM gateway integration | All LLM/OCR/transcription routed through existing gateway at `100.66.213.40:8080` (Tailscale: `100.66.213.40:8080`) via `/task` and `/llm/generate` endpoints. No embedded ML dependencies in Noted. Embeddings via Ollama `nomic-embed-text` (768-dim), stored in pgvector. Features degrade gracefully when gateway is unreachable. |
| 2026-04-10 | OCR via cloud vision | Replaced planned Tesseract.js OCR with LLM gateway's Gemini 2.5 Flash → Claude Sonnet vision fallback chain. Higher accuracy, no local model dependency. |
| 2026-04-10 | Embedding model | `nomic-embed-text` on GPU 0 via Ollama — 768-dimension vectors stored in pgvector. Chosen for speed and local-only operation. |
| 2026-04-11 | Google Drive OAuth behind Tailscale | OAuth redirect URI uses Tailscale domain (`noted.tail413695.ts.net`). Works because the user's browser is on the Tailnet. Google consent screen in "testing" mode with user's Gmail as test user. |
| 2026-04-11 | Drive import polling vs webhooks | Chose polling over Google push notifications since the app has no public URL (Tailscale only). 60s tick interval with configurable per-integration poll frequency (1–30 min). |
| 2026-04-11 | Drive file processing | Imported files moved to a "Processed" subfolder (not deleted) for safety — best-effort, import succeeds even if move fails. Google Docs/Sheets/Slides exported as PDF. Files exceeding MAX_FILE_SIZE are skipped and logged. |
| 2026-04-11 | OAuth callback auth bypass | Fastify plugin-level `addHook('onRequest')` cannot be overridden per-route with `onRequest: []`. Fixed by using Fastify encapsulation: callback in its own `register()` block without auth, other routes in a separate `register()` block with auth. |
| 2026-04-11 | PWA service worker intercepts API | Workbox `navigateFallback` serves `index.html` for all navigation requests including `/api/` callback redirects. Fixed by adding `navigateFallbackDenylist: [/^\/api\//]` to Vite PWA workbox config. After deploy, users must unregister old service worker in DevTools. |
| 2026-04-11 | Google Drive OAuth scope | `drive.file` scope only grants write access to files the app created. Changed to `drive` scope for full read/write. Move-to-processed is best-effort — import counted as success regardless. |
| 2026-04-11 | Sidebar notebook count stale after delete | `GET /notebooks` SQL counted all notes including soft-deleted (trashed) ones. Fixed by adding `deleted_at IS NULL` to the JOIN. Also added `fetchNotebooks()` call after trashing from editor toolbar (NoteListPanel already had it). |

---

## 13. Infrastructure Notes

### Cron Jobs (Production)

| Schedule | Script | Purpose |
|----------|--------|---------|
| `0 2 */2 * *` | `backup-to-remote.sh` | Remote DB backup every 2 days at 2 AM |
| `0 3 1 * *` | `setup-certs.sh` + nginx reload | TLS certificate renewal monthly |
| `0 3 * * 0` | Docker prune | Weekly Docker disk cleanup |

### Port Assignments

| Service | Dev Port | Prod Port |
|---------|----------|-----------|
| Frontend (Vite) | 5173 | 80/443 (Nginx) |
| Backend (Fastify) | 3001 | 3001 (internal) |
| PostgreSQL | 5432 | 5432 (internal) |

### Docker Container Names

| Container | Dev | Prod |
|-----------|-----|------|
| Database | `noted-db-dev` | `noted-db` |
| Backend | — (local) | `noted-api` |
| Nginx | — (local) | `noted-web` |

---

## 14. Completed Phases

### Phase 0 — Project Scaffold & Infrastructure ✅
Completed: 2026-04-04
Notes: Monorepo structure, Fastify backend with `/health`, Vue 3 + Vite frontend, PostgreSQL Docker dev compose, migration runner, initial schema (8 tables), seed data, `setup-dev.sh` bootstrap script, CLAUDE.md.

### Phase 1 — Core Backend (Auth, Notes, Notebooks) ✅
Completed: 2026-04-04
Notes: JWT auth with refresh tokens (httpOnly cookie), bcrypt, auth middleware decorator, full CRUD for notes/notebooks/stacks with filtering/pagination, rate limiting on auth, global error handler, all endpoints tested via curl.

### Phase 2 — Editor & Frontend Shell ✅
Completed: 2026-04-05
Notes: Three-pane layout (sidebar + note list + editor), Pinia stores (auth, notes, notebooks, UI), CodeMirror 6 with custom Sapphire theme, Normal Mode (hides Markdown syntax, inline rendering) + Source Mode toggle, interactive checkboxes that update note content, 500ms debounced autosave, route guards, API client with JWT refresh, login page, Lucide icons, dev/prod visual differentiation.

### Phase 3 — Tags, Search, Inbox & Tasks ✅
Completed: 2026-04-05
Notes: Tags CRUD with note counts + sidebar tag browser + tag pills in editor, PostgreSQL `websearch_to_tsquery` search with highlighted snippets, `Ctrl+K` search palette with arrow key navigation, `Alt+N` quick capture modal (Note/Task/Idea), Inbox view with Move/Convert/Discard actions (click-based dropdown), Tasks view with add/toggle/delete/filter/linked notes. Bugs fixed during E2E: checkbox persistence, API client Content-Type on DELETE, form submit handling.

---

### E2E Edge Case Testing ✅
Completed: 2026-04-06
Features added during testing:
- Soft delete (trash can) — migration 002 (`deleted_at` column), trash/restore/permanent delete/empty trash API + UI
- Trash view with Restore and Delete buttons, Empty Trash with ConfirmModal
- Trash icon in editor toolbar, right-click "Move to Trash" on note list
- Session persistence across browser refresh (refresh token auto-restore in route guard)
- Reusable ConfirmModal component replacing all browser `confirm()` calls
- Notebook note counts on stacked notebooks + auto-refresh after move/trash operations
- Right-click "Move to..." on notes with notebook submenu

### Stack & Notebook Management UI ✅
Completed: 2026-04-06
Features:
- Create notebook from sidebar ("+" button → Notebook tab, inline form with stack selector)
- Create stack from sidebar ("+" button → Stack tab)
- Rename notebook via right-click context menu
- Rename stack via right-click context menu
- Delete notebook with ConfirmModal showing note count + Inbox migration
- Delete stack with ConfirmModal showing notebook count (notebooks become unstacked)
- Move notebook to/from stack via right-click → "Move to stack..." submenu
- Backend PUT /notebooks/:id updated to support explicit `stack_id: null` (remove from stack)

### E2E Test Status (as of 2026-04-06)

All Phase 0–3 features + edge cases + stack/notebook management tested and passing:
- [x] Health check, Login/Logout, Auth guard
- [x] Session persistence across browser refresh
- [x] Sidebar navigation, notebook filtering, stacks expand/collapse
- [x] Editor Normal/Source mode, autosave, interactive checkboxes
- [x] New note creation
- [x] Tag assignment, tag filtering
- [x] Search palette (Ctrl+K), Search page
- [x] Quick capture (Alt+N) — Note and Task types
- [x] Inbox view — Move, Convert, Discard actions
- [x] Tasks view — Add, Toggle, Delete, Filter tabs, Linked notes
- [x] Trash — soft delete from editor + right-click, restore, permanent delete, empty trash
- [x] Create/rename/delete notebook from sidebar
- [x] Create/rename/delete stack from sidebar
- [x] Move notebook to/from stack
- [x] Move note to notebook via right-click context menu
- [x] Delete notebook with note migration to Inbox
- [x] Notebook counts update on all operations
- [x] Error state — app degrades gracefully when backend down

### E2E Test Status (as of 2026-04-06, Phase 4)

All Phase 4 features tested and passing:
- [x] Attachment upload (text, image, PDF), list, download, delete
- [x] MIME type validation + extension-based fallback for octet-stream
- [x] Inline image rendering in Normal Mode (regex-based, cursor-aware)
- [x] Attachment reference cleanup on delete
- [x] Token-based attachment access for `<img>` tags (`?token=` query param)
- [x] Reminders panel — overdue (red), upcoming, empty state, badge count
- [x] Reminders 60s background polling (deferred start)
- [x] Drag-and-drop notes between notebooks with visual highlight
- [x] Idea capture differentiation (💡 prefix + blockquote)
- [x] Mobile home screen (< 768px) — hero card, action grid, collapsible recent
- [x] Mobile hamburger sidebar overlay
- [x] Mobile full-screen editor with back + Source/Normal toggle
- [x] Mobile FAB button on all sub-views
- [x] Mobile-optimized Tasks, Inbox, Search, Trash views (MobileLayout)
- [x] Quick Note hero card triggers capture modal
- [x] PWA manifest + service worker generated in production build
- [x] Desktop regression — three-pane layout, autosave, search, tags all working
- [x] Console clean — no errors on load

### Phase 9 — Google Drive Import ✅
Completed: 2026-04-11
Notes: Google Drive OAuth2 integration with polling-based file import. Backend: `googleapis` npm package, `integrations` + `import_history` tables (migration 004), DriveImporter service (text → note body, binary → attachment), DrivePoller service (60s tick, configurable poll interval), Fastify plugin for lifecycle management. Frontend: Settings view with connect/disconnect, folder config, poll interval selector, manual scan button, import history with status badges. 7 API endpoints under `/api/v1/integrations/google-drive/`. Files moved to "Processed" subfolder after import (best-effort). Google Docs exported as PDF. Graceful degradation when Google credentials not configured.

Bugs fixed during E2E testing:
- OAuth callback returned 401 — Fastify `addHook` at plugin level applies to all routes; fixed with encapsulated `register()` blocks
- Callback page showed SPA instead of API response — PWA service worker intercepted `/api/` navigation; fixed with `navigateFallbackDenylist`
- Move-to-processed failed with 403 — `drive.file` scope insufficient; changed to `drive` scope, made move best-effort
- Sidebar notebook note count didn't update after deleting a note — `GET /notebooks` query counted trashed notes; fixed SQL JOIN filter and added missing `fetchNotebooks()` in editor toolbar delete path

**Next up:** Phase 6 (Knowledge Graph).

### Phase 4 — Attachments, Reminders & PWA ✅
Completed: 2026-04-06
Features:
- **Attachments API** (4.1–4.2): `POST /notes/:id/attachments` (multipart), `GET /attachments/:id` (stream), `DELETE /attachments/:id`, `GET /notes/:id/attachments` (list). Files stored in `uploads/{year}/{month}/{noteId}/`. MIME type whitelist (images, PDF, Office, text). 25MB size limit. Migration 003 applied.
- **Upload UI** (4.3): `AttachmentZone.vue` — drag-and-drop into editor + toolbar upload button. Expandable attachment list with delete. Auto-inserts Markdown image syntax for uploaded images.
- **Inline image rendering** (4.4): Uploaded images referenced via `![alt](/api/v1/attachments/:id)` render in Normal Mode.
- **Reminders backend** (4.5): `GET /api/v1/reminders` (overdue/upcoming/dismissed), `GET /api/v1/reminders/due` (polling). `reminder_at` column on notes (migration 003). Tasks already had `reminder_at`.
- **Reminders panel** (4.6): `RemindersPanel.vue` — overlay panel showing overdue (red border) and upcoming reminders. Click to navigate to note. Sidebar "Reminders" nav item with red badge for overdue count. 60s background polling.
- **PWA manifest** (4.7): `vite-plugin-pwa` configured with manifest (name, icons, theme_color, standalone). Icons generated.
- **Service worker** (4.8): Workbox with generateSW — precaches app shell, CacheFirst for attachments, NetworkFirst for API.
- **Drag-and-drop notes** (4.9): Notes in NoteListPanel are draggable. Notebooks in sidebar accept drops with visual highlight. Moves note to target notebook, updates counts.
- **Mobile FAB** (4.10): `MobileFAB.vue` — fixed bottom-right orange "+" button, visible only at `< 768px`, triggers Quick Capture.
- **Capture type differentiation** (4.11): Idea capture prefixes title with "💡" and wraps content in blockquote. Note and Task unchanged.
- **Mobile Home Screen** (4.12): `MobileHome.vue` — responsive at `< 768px`. Full-width Quick Note hero card, Tasks/Inbox/Search cards with badges (4th slot reserved for Reminders), collapsible recent notes (last 5). Hamburger → sidebar slides in as overlay. `MobileEditor.vue` — full-screen editor with back button + Source/Normal toggle. Desktop three-pane layout unchanged at `≥ 768px`.

### Phase 5 — Production Deployment ✅
Completed: 2026-04-10
Features:
- **Backend Dockerfile** (5.2): Multi-stage build (deps → production). Non-root `noted` user, wget healthcheck on `/health`, uploads/logs directories.
- **Frontend Dockerfile** (5.3): Multi-stage build (node build → Nginx 1.27 Alpine). `VITE_APP_VERSION` and `VITE_ENV_LABEL` build args.
- **Nginx config** (5.4): `nginx/noted.conf` — HTTP→HTTPS redirect, TLS termination (Tailscale certs), SPA `try_files` fallback, API reverse proxy to `noted-api:3001`, static asset caching (1y immutable for `/assets/`), no-cache for service worker and HTML, gzip, security headers (X-Frame-Options, X-Content-Type-Options, HSTS-ready), 25MB upload limit.
- **docker-compose.prod.yml** (5.1): Three services (postgres, api, web) on `noted-network`. Environment sourced from `.env.prod`. Named volumes for data, uploads, logs. All services have healthchecks with `depends_on: condition: service_healthy`.
- **TLS via Tailscale** (5.5): `scripts/setup-certs.sh` — runs `tailscale cert` to provision Let's Encrypt certs for `noted.tail413695.ts.net`. Writes to `/etc/noted/certs/`. Auto-reloads Nginx if container is running. Requires root.
- **Deploy script** (5.6): `scripts/deploy-to-production.sh` — pre-flight checks (Docker, Tailscale, env file, no CHANGE_ME placeholders, certs), auto-backup if DB running, Docker build, migration via `docker compose run`, service start, health verification (container status, API endpoint, HTTPS). Flags: `--skip-backup`, `--build-only`.
- **Local backup** (5.8): `scripts/backup-db.sh` — `pg_dump` via `noted-db` container, gzipped to `backups/noted_YYYYMMDD_HHMMSS.sql.gz`. Optional `--prune N` to retain last N backups.
- **Remote backup** (5.9): `scripts/backup-to-remote.sh` — runs local backup first (keeps 7), then SCP to `REMOTE_HOST:REMOTE_DIR` with remote retention pruning.
- **Cron jobs** (5.10): `scripts/setup-cron.sh` — idempotent cron installer with marker-based cleanup. Schedule: remote backup every 2 days at 2 AM, cert renewal monthly at 3 AM, Docker prune weekly Sunday 3 AM.
- **.env.prod.example**: Production env template with all config vars. `.dockerignore` files for both backend and frontend.

---

### Remaining Development Phases

| Phase | Focus | Status |
|-------|-------|--------|
| ~~Phase 4~~ | ~~Attachments, Reminders, PWA, Mobile~~ | ✅ Complete |
| ~~Phase 5~~ | ~~Production launch — Docker prod stack, Nginx, TLS, deploy script, backups, cron~~ | ✅ Complete |
| **Phase 6** | **Knowledge Graph** — wikilinks, backlinks, D3.js graph (Stage 2) | Next |
| Phase 7 | Web Clipper & OCR — uses LLM gateway OCR (Gemini Flash → Claude vision) instead of Tesseract (Stage 2) | Future |
| Phase 8 | LLM Intelligence — semantic search (pgvector), related notes, smart tags, summarization, task extraction, audio capture, natural language queries (Stage 2) | Future |

---

*Development approach: Claude Code AI-assisted, steady pace alongside other projects.*
*Target: Stage 1 MVP in ~10 weeks, Stage 2 Knowledge Graph + LLM Intelligence in ~14 weeks after.*
