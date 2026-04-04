# Noted — Claude Code Project Context

## Before Starting Any Task

Read `Documentation/PROJECT_DESCRIPTION.md` for the full spec and `Documentation/DEVELOPMENT_PLAN.md` for current phase and backlog.

## After Completing Any Task

Update both:
1. **`Documentation/DEVELOPMENT_PLAN.md`** — Mark completed items, add new issues/backlog items
2. If schema, routes, or structure changed, note it in the relevant plan section

## Tech Stack

- **Frontend:** Vue.js 3 (Composition API), Vite, Pinia, Vue Router, CodeMirror 6, D3.js
- **Backend:** Node.js, Fastify, JWT (jsonwebtoken), pg (node-postgres)
- **Database:** PostgreSQL 16, tsvector for search, pgvector future
- **Infrastructure:** Docker, Nginx, PM2, Tailscale

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

## Dev Environment

```bash
# Start dev DB
docker compose -f docker-compose.dev.yml up -d

# Backend (port 3001)
cd backend && npm run dev

# Frontend (port 5173, proxies /api to backend)
cd frontend && npm run dev
```

## When Prompting for Questions
1. Always go through questions one at a time
2. Always present a series of options, plus your recommendation and rationale
