# Noted — Claude Code Project Context

## Documentation Layout

- **`Documentation/NOTED_CURRENT_STATE.md`** — Authoritative description of what's built (features, data model, APIs).
- **`Documentation/NOTED_NEXT_STEPS.md`** — Roadmap of outstanding work; indexes into `Documentation/CR/`.
- **`Documentation/CR/CR00X_*.md`** — One Change Request per outstanding (or recently completed) work item. Each has a `Status:` header (Open / In progress / Completed). New work gets the next sequential number.
- **`Documentation/Reference/`** — External templates and API docs reused by this project.
- **`Documentation/Archive/`** — Stale / historical material no longer maintained.

## Before Starting Any Task

Read `Documentation/NOTED_CURRENT_STATE.md` for the full description of the current system, and `Documentation/NOTED_NEXT_STEPS.md` (plus the relevant CR file under `Documentation/CR/`) for the work currently planned or in progress.

## After Completing Any Task

Update all applicable:
1. **The relevant CR file** (`Documentation/CR/CR00X_*.md`) — flip `Status:` to `Completed` (or `In progress`), update scope/acceptance notes if they evolved during the work. Do not delete completed CRs.
2. **`Documentation/NOTED_CURRENT_STATE.md`** — Update feature descriptions, data model, API docs to reflect what shipped.
3. **`Documentation/NOTED_NEXT_STEPS.md`** — If new work was discovered, add a new CR file with the next sequential number and link it from this index.
4. If schema, routes, or structure changed, note it in the relevant section of `NOTED_CURRENT_STATE.md`.

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
| `frontend/src/styles/theme.css` | Sapphire/Dark/Light theme palettes (CSS vars under `:root[data-theme="..."]`) |
| `frontend/src/stores/ui.js` | UI store — includes `theme` + `setTheme()`, `applyTheme()` + `loadTheme()` helpers, dispatches `noted:theme-change` event |
| `frontend/src/lib/codemirror/sapphireTheme.js` | CodeMirror editor theme (uses CSS vars, adapts to active theme) |
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
| `frontend/src/views/SettingsView.vue` | Settings page (theme picker, password, Google Drive integration) |
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

| `backend/src/routes/export.js` | Note export endpoint (`GET /api/v1/notes/export/:title`) |
| `backend/src/routes/system.js` | System stats endpoint (`GET /api/v1/system/stats`) — storage, content, server, integrations, backup |
| `frontend/src/components/ui/SystemStatusCard.vue` | Settings-page System Status card (fetch on mount + manual refresh) |
| `backend/src/routes/vault.js` | Encrypted vault endpoints (CR020) — `/api/v1/vault/{meta,entries}` |
| `backend/migrations/017_vault.sql` | `vault_meta` + `vault_entries` schema (zero-knowledge ciphertext storage) |
| `frontend/src/lib/vaultCrypto.js` | Argon2id KDF + AES-256-GCM encrypt/decrypt for vault entries |
| `frontend/src/stores/vault.js` | Vault Pinia store — master key in module closure, 15-min idle timer |
| `frontend/src/views/VaultView.vue` | Vault setup / unlock / list view |
| `frontend/src/components/ui/VaultEntryModal.vue` | Vault entry create/edit modal |

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

## Integration with ocr-llm

- **First-read primer:** `ocr-llm/Documentation/Guides/AI_IMPLEMENTATION_GUIDE.md`
- **Pinned contract version:** v1
- **Base URL:** `http://100.66.213.40:8080` (Tailscale)

Before non-trivial API work:
1. `(cd ocr-llm && git pull --ff-only)`
2. Read the tail of `ocr-llm/HANDOFFS.md` for `[ocr-llm → noted]` or `[ocr-llm → *]`.
3. Fetch the live spec: `curl -s http://100.66.213.40:8080/contracts/v1/gateway`.

When this client needs the server to change something, append an entry to
`ocr-llm/HANDOFFS.md` with `## YYYY-MM-DD [noted → ocr-llm] subject`.