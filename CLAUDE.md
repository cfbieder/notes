# Noted — Claude Code Project Context

Self-hosted, Markdown-first personal knowledge & task app (Vue 3 + Fastify + PostgreSQL).

## 4 Key Rules
- Think before coding: state assumptions, ask when unsure, never guess
- Simplicity first: write the minimum code that solves the problem, nothing extra
- Surgical changes: every changed line must trace back to your request
- Goal-driven: turn vague instructions into verifiable success criteria before starting

## Required Reading at Session Start
Always read first: [docs/current/status.md](docs/current/status.md) (session snapshot — links onward).
Read on demand: [docs/current/project-description.md](docs/current/project-description.md) (full state),
[docs/current/project-roadmap.md](docs/current/project-roadmap.md) (planning),
[docs/cr/README.md](docs/cr/README.md) (canonical ship dates / versions / status).
Ship dates and versions live ONLY in the CR index — link, don't restate.

Other pointers: [docs/guides/key-files.md](docs/guides/key-files.md) (source map),
[docs/guides/deployment.md](docs/guides/deployment.md) (prod/ops),
[docs/documentation-standard.md](docs/documentation-standard.md) (docs conventions).

## After Completing Any Task
Update what applies — keep the CR index the single source of truth for "what shipped when":
1. **Relevant CR** (`docs/cr/cr-NNN-*.md`) — flip `Status:`; update scope/acceptance if it evolved. Never delete completed CRs.
2. **[docs/cr/README.md](docs/cr/README.md)** — mark the row ✓ / add a row for new work (next number, zero-padded).
3. **[docs/current/project-description.md](docs/current/project-description.md)** — reflect shipped features, data model, API, schema, routes.
4. **[docs/current/project-roadmap.md](docs/current/project-roadmap.md)** — update planned/in-progress items.
5. **[docs/current/status.md](docs/current/status.md)** — refresh the snapshot headlines if they changed.

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
- **Docs:** follow [docs/documentation-standard.md](docs/documentation-standard.md) — lowercase kebab-case filenames, workspace-root-relative links, one fact one home.
- **UI:** always use the `ConfirmModal` component — never native `confirm()` / `alert()`.

## Dev Environment
```bash
docker compose -f docker-compose.dev.yml up -d   # dev DB
cd backend && npm run dev                          # backend, port 3001
cd frontend && npm run dev                         # frontend, port 5173 (proxies /api)
```
Production deploy, backups, and Docker build gotchas: [docs/guides/deployment.md](docs/guides/deployment.md).

## When Prompting for Questions
1. Always go through questions one at a time
2. Always present a series of options, plus your recommendation and rationale

## Integration with ocr-llm
`ocr-llm/` is a **separate integrated repo** (own git + `Documentation/`). Do not reorganize or
rename anything under it; cross-repo links stay spelled the way that repo names them.

- **First-read primer:** `ocr-llm/Documentation/Guides/AI_IMPLEMENTATION_GUIDE.md`
- **Pinned contract version:** v1 · **Base URL:** `http://llm-gateway.example.com:8080` (Tailscale)

Before non-trivial API work:
1. `(cd ocr-llm && git pull --ff-only)`
2. Read the tail of `ocr-llm/HANDOFFS.md` for `[ocr-llm → noted]` or `[ocr-llm → *]`.
3. Fetch the live spec: `curl -s http://llm-gateway.example.com:8080/contracts/v1/gateway`.

When this client needs the server to change something, append an entry to
`ocr-llm/HANDOFFS.md` with `## YYYY-MM-DD [noted → ocr-llm] subject`.
