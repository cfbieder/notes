# Noted

A self-hosted, Markdown-first personal knowledge & task app. Write notes and tasks
in Markdown, link them together, search full-text, and (optionally) layer AI-powered
OCR, translation, and text generation on top — all running on your own hardware.

> **Status:** actively developed. See [docs/current/status.md](docs/current/status.md)
> for the current snapshot and [docs/cr/README.md](docs/cr/README.md) for the change log.

## Features

- **Markdown editor** with live rendering (CodeMirror 6)
- **Notes & tasks** with tagging, linking, and full-text search (PostgreSQL `tsvector`)
- **Attachments** including inline PDF preview
- **Graph view** of note links (D3.js)
- **Progressive Web App** with offline capture
- **Google Drive integration** (optional)
- **AI features** (optional) — OCR, translation, and text generation via a
  self-hosted LLM gateway. Fully gated behind `LLM_ENABLED`; the app runs fine
  without it.
- **Web clipper** browser extension (in [clipper/](clipper/))

## Tech stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | Vue 3 (Composition API), Vite, Pinia, Vue Router, CodeMirror 6, D3.js |
| Backend   | Node.js, Fastify, JWT auth, `pg` (node-postgres) |
| Database  | PostgreSQL 16 (`tsvector` search) |
| Infra     | Docker, Nginx, TLS via Tailscale |

## Quick start (development)

Requires Docker and Node.js 20+.

```bash
# 1. Start the dev database
docker compose -f docker-compose.dev.yml up -d

# 2. Backend (port 3001)
cd backend
cp .env.example .env.dev        # then edit: set JWT_SECRET / JWT_REFRESH_SECRET
npm install
npm run dev

# 3. Frontend (port 5173, proxies /api to the backend)
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev database seed creates a test user — see
[db/seeds/](db/seeds/).

> **Generate secrets** for `JWT_SECRET` and `JWT_REFRESH_SECRET` with:
> `openssl rand -hex 32`

## Configuration

All backend configuration is via environment variables. Copy the example file
and fill it in — **never commit your real `.env` files** (they are git-ignored):

- Development: [backend/.env.example](backend/.env.example) → `backend/.env.dev`
- Production: [backend/.env.prod.example](backend/.env.prod.example) → `backend/.env.prod`

Key variables:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Auth token signing — **required**, generate your own |
| `DB_*` | PostgreSQL connection |
| `CORS_ORIGIN` | Allowed frontend origin |
| `LLM_ENABLED` | Set `false` to disable all AI features |
| `LLM_GATEWAY_URL` | URL of your LLM gateway (only if `LLM_ENABLED=true`) |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google Drive integration (optional) |

### A note on AI features

The AI/OCR/translation features talk to a separate self-hosted **LLM gateway**.
This is **not** included in this repository and is not required to run Noted. If
you don't have one, set `LLM_ENABLED=false` and everything else works normally.

## Production deployment

Noted ships with a Docker Compose production stack (Nginx + API + PostgreSQL) and
a deploy script. See [docs/guides/deployment.md](docs/guides/deployment.md) for
the full walkthrough. In brief:

```bash
cp backend/.env.prod.example backend/.env.prod   # fill in ALL secrets
./scripts/deploy-to-production.sh
```

The reference setup uses [Tailscale](https://tailscale.com/) for TLS
(`tailscale cert`), but you can adapt [nginx/noted.conf](nginx/noted.conf) to
any hostname and certificate.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the
workflow, coding conventions, and pull-request checklist.

## License

[MIT](LICENSE) © 2026 OCME IT Systems
