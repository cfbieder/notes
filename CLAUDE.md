# Noted — Claude Code Project Context

## Before Starting Any Task

Read `Documentation/NOTED_PROJECT_DESCRIPTION.md` for the full spec and `Documentation/NOTED_DEVELOPMENT_PLAN.md` for current phase and backlog.

## After Completing Any Task

Update all applicable:
1. **`Documentation/NOTED_DEVELOPMENT_PLAN.md`** — Mark completed items, add new issues/backlog items
2. **`Documentation/NOTED_PROJECT_DESCRIPTION.md`** — Update feature descriptions, data model, API docs
3. If schema, routes, or structure changed, note it in the relevant section of both docs

## Tech Stack

- **Frontend:** Vue.js 3 (Composition API), Vite, Pinia, Vue Router, CodeMirror 6, D3.js
- **Backend:** Node.js, Fastify, JWT (jsonwebtoken), pg (node-postgres)
- **Database:** PostgreSQL 16, tsvector for search, pgvector future
- **Infrastructure:** Docker, Nginx, Tailscale (TLS via `tailscale cert`)

## Conventions

- **JavaScript:** camelCase for variables and functions
- **Database:** snake_case for columns and tables
- **API responses:** `{ data, meta }` for success; `{ error, message, statusCode }` for errors
- **API prefix:** All routes under `/api/v1/`
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- **Migrations:** Forward-only numbered SQL files in `backend/migrations/`

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/app.js` | Fastify server entry point |
| `backend/src/plugins/db.js` | PostgreSQL connection pool |
| `backend/src/utils/migrate.js` | Migration runner |
| `backend/migrations/` | SQL migration files |
| `frontend/src/main.js` | Vue app entry point |
| `frontend/src/router/index.js` | Route definitions |
| `frontend/src/api/client.js` | API fetch wrapper with JWT handling |
| `frontend/src/styles/theme.css` | Sapphire Slate theme variables |
| `docker-compose.dev.yml` | Dev PostgreSQL container |
| `docker-compose.prod.yml` | Production stack (DB + API + Nginx) |
| `backend/Dockerfile` | Backend multi-stage build |
| `frontend/Dockerfile` | Frontend multi-stage build (Vite → Nginx) |
| `nginx/noted.conf` | Nginx SSL, SPA routing, API proxy |
| `scripts/deploy-to-production.sh` | Full deploy orchestration |
| `scripts/setup-certs.sh` | TLS cert provisioning via `tailscale cert` |
| `scripts/backup-db.sh` | Local pg_dump backup |
| `scripts/backup-to-remote.sh` | SSH remote backup |
| `scripts/setup-cron.sh` | Cron job installer |
| `backend/src/services/driveImporter.js` | Google Drive file import logic |
| `backend/src/services/drivePoller.js` | Google Drive polling scheduler |
| `backend/src/routes/integrations.js` | Google Drive OAuth + config + scan API |
| `frontend/src/views/SettingsView.vue` | Settings page (Google Drive integration) |
| `backend/src/services/wikilinkParser.js` | Wikilink extraction and resolution |
| `backend/src/routes/links.js` | Backlinks, unlinked mentions, local graph APIs |
| `backend/src/routes/graph.js` | Full knowledge graph API |
| `frontend/src/views/GraphView.vue` | D3.js knowledge graph visualization |
| `backend/src/routes/clips.js` | Web clipper ingestion endpoint (`POST /api/v1/clips`) |
| `backend/src/services/llmService.js` | LLM gateway client (OCR now, embeddings/generation later) |
| `backend/tests/phase7-clips.test.js` | Web clipper API integration tests |
| `clipper/` | Chrome MV3 web-clipper extension (manifest, background, popup, options, vendor libs) |
| `frontend/src/stores/toasts.js` | Global toast notification store |
| `frontend/src/components/ui/ToastContainer.vue` | Toast notification renderer (bottom-right stack) |
| `frontend/src/components/ui/ReminderPicker.vue` | Reusable reminder datetime picker with presets |
| `backend/tests/phase4-reminders.test.js` | Reminders enhancement tests (29 assertions) |
| `backend/src/routes/voice.js` | Voice note capture endpoint (`POST /api/v1/notes/voice`) |
| `backend/tests/phase8-voice.test.js` | Voice note capture tests (19 assertions) |
| `frontend/src/lib/codemirror/wikilinkRendering.js` | Wikilink rendering in editor |
| `frontend/src/lib/codemirror/wikilinkAutocomplete.js` | `[[` autocomplete in editor |
| `frontend/src/lib/codemirror/tableKeymap.js` | Source-mode Enter auto-row + Tab auto-extend inside GFM pipe tables |
| `frontend/src/lib/codemirror/markdownRendering.js` | Normal-mode decoration plugins (headings, lists, checkboxes, images, GFM table block widget) |
| `frontend/src/lib/tableParser.js` | Shared GFM pipe-table parse/serialize/align helpers (renderer, keymap, table editor modal) |
| `frontend/src/components/ui/InsertTableModal.vue` | Rows/cols/alignment modal for inserting a new table |
| `frontend/src/components/ui/TableEditorModal.vue` | Click-to-edit grid editor for existing tables (`<input>` cells, add/del row/col, per-col align) |
| `frontend/src/lib/printNote.js` | Print/PDF export — renders markdown to HTML via markdown-it, opens styled print window |

## Dev Environment

```bash
# Start dev DB
docker compose -f docker-compose.dev.yml up -d

# Backend (port 3001)
cd backend && npm run dev

# Frontend (port 5173, proxies /api to backend)
cd frontend && npm run dev
```

## Production Environment

```bash
# Deploy (builds, migrates, starts, verifies health)
./scripts/deploy-to-production.sh

# Provision/renew TLS certs
sudo ./scripts/setup-certs.sh

# Install cron jobs (backup, cert renewal, prune)
./scripts/setup-cron.sh

# Logs
docker compose -f docker-compose.prod.yml logs -f

# Manual backup
./scripts/backup-db.sh --prune 10
```

- **URL:** `https://noted.tail413695.ts.net`
- **Containers:** `noted-db`, `noted-api`, `noted-web`
- **Env file:** `backend/.env.prod` (not committed — copy from `.env.prod.example`)

## Docker Build Gotchas

- Healthchecks must use `127.0.0.1`, not `localhost` (Alpine resolves to IPv6)
- Frontend Dockerfile must `rm .env` before build — Vite `.env` files override Docker `ENV`
- `VITE_ENV_LABEL` must be **unset** in production builds (any truthy string triggers dev mode)

## When Prompting for Questions
1. Always go through questions one at a time
2. Always present a series of options, plus your recommendation and rationale
