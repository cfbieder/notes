# Development Plan — Noted

> Personal Knowledge & Task Management App
> Status: Pre-development | Last updated: 2026-04-04

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
11. [Backlog & Future (Stage 3)](#11-backlog--future-stage-3)
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

**Acceptance criteria:**
- Files can be uploaded to notes and rendered inline (images) or as thumbnails (PDFs)
- Reminders surface in a dedicated panel when due
- App installable as PWA; loads offline shell when network unavailable

---

## 8. Phase 5 — Production Deployment

**Goal:** Secure, automated deployment to KVM VM.

| # | Task | Details |
|---|------|---------|
| 5.1 | Docker production compose | `docker-compose.prod.yml` — PostgreSQL + Fastify backend + Nginx; healthchecks on all services |
| 5.2 | Backend Dockerfile | Multi-stage build; non-root user; healthcheck endpoint |
| 5.3 | Frontend Dockerfile | Multi-stage build (Vite build → Nginx Alpine); version build arg |
| 5.4 | Nginx config | SSL termination, SPA routing (`try_files`), API reverse proxy, static asset caching |
| 5.5 | TLS certificates | `scripts/setup-certs.sh` — provision certs for Tailscale domain |
| 5.6 | deploy-to-production.sh | Pre-flight checks, auto backup, Docker build, migrations, health verification |
| 5.7 | update_version.sh | Semantic versioning with date stamp; git tags |
| 5.8 | backup-db.sh | Local pg_dump with optional retention pruning |
| 5.9 | backup-to-remote.sh | SSH-based remote backup with retention cleanup |
| 5.10 | Cron jobs | Remote backup (every 2 days), cert renewal (monthly), Docker prune (weekly) |
| 5.11 | Version display in UI | Show `VITE_APP_VERSION` in sidebar footer |

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

**Goal:** Capture external content and make attachments searchable.

| # | Task | Details |
|---|------|---------|
| 7.1 | Web clipper extension | Chrome extension — capture full page, article (Readability.js), selection, or screenshot |
| 7.2 | Clipper API endpoint | Accept clipped content with URL, timestamp, notebook, tags |
| 7.3 | Clipper destination UI | Popup with notebook/tag selection or "send to inbox" |
| 7.4 | OCR pipeline | Tesseract.js (or pytesseract microservice) for PDF/image text extraction |
| 7.5 | OCR text storage | Populate `attachments.ocr_text` column on upload |
| 7.6 | OCR in search index | Include `ocr_text` in full-text search tsvector |

**Acceptance criteria:**
- Browser extension can clip pages to the app with notebook/tag selection
- Uploaded PDFs and images have extracted text searchable via full-text search

---

## 11. Backlog & Future (Stage 3)

These items are out of scope for Stages 1–2 but documented for future planning:

- [ ] Multi-user workspaces (shared notebooks)
- [ ] Role-based access control (viewer / editor / admin)
- [ ] pgvector semantic search (Python microservice for embeddings)
- [ ] AI summarization of notes (Claude API integration)
- [ ] Smart tag suggestions
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

*No phases completed yet. Entries will be added as:*

```
### Phase X — Name ✅
Completed: YYYY-MM-DD
Notes: Any relevant notes about the phase completion.
```

---

*Development approach: Claude Code AI-assisted, steady pace alongside other projects.*
*Target: Stage 1 MVP in ~10 weeks, Stage 2 Knowledge Graph in ~10 weeks after.*
