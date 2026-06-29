# Deployment & Operations

Operational runbook for Noted. Conventions and the dev quickstart live in
[CLAUDE.md](CLAUDE.md); this guide holds the production lifecycle and gotchas.

## Production environment

- **URL:** `https://noted.tail413695.ts.net`
- **Containers:** `noted-db`, `noted-api`, `noted-web`
- **Env file:** `backend/.env.prod` (not committed — copy from `.env.prod.example`)

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

## Docker build gotchas

- Healthchecks must use `127.0.0.1`, not `localhost` (Alpine resolves to IPv6).
- Frontend Dockerfile must `rm .env` before build — Vite `.env` files override Docker `ENV`.
- `VITE_ENV_LABEL` must be **unset** in production builds (any truthy string triggers dev mode).
