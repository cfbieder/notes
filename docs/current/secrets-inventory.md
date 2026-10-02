# Secrets Inventory

> **Names and locations ONLY — never values.** This file is in a public repo. Handling rules:
> [.claude/rules/env-secrets.md](.claude/rules/env-secrets.md). Every secret below must also
> appear in [backend/.env.prod.example](backend/.env.prod.example) with a `CHANGE_ME` value and
> be mapped explicitly in the `environment:` block of
> [docker-compose.prod.yml](docker-compose.prod.yml) — the api service has no `env_file:`, so a
> value sitting in `.env.prod` alone never reaches the container.

| Secret (env var) | Used by | Lives in | Rotation trigger | Notes |
|---|---|---|---|---|
| `DB_PASSWORD` | `noted-db`, `noted-api` | `backend/.env.prod` on the prod host | host migration / 24 mo | also in `backend/.env.dev` for the dev stack |
| `JWT_SECRET` | `noted-api` | `backend/.env.prod` | 12 mo / on exposure | rotating invalidates all access tokens |
| `JWT_REFRESH_SECRET` | `noted-api` | `backend/.env.prod` | 12 mo / on exposure | rotating logs every device out |
| `AI_KEYS_ENC_KEY` | `noted-api` | `backend/.env.prod` | on exposure only | encrypts per-user provider keys at rest (CR-038 — pluggable AI providers). **Rotating it makes every stored provider key undecryptable**, so a rotation needs a re-entry flow first. Mapped in `docker-compose.prod.yml` as `${AI_KEYS_ENC_KEY:-}` since 2026-10-02 (was missing, so saving a provider key failed on prod); `scripts/ci-guards.sh` guard 7 now fails CI if a secret here is left unmapped |
| `OCR_LLM_CLIENT_KEY` | `noted-api` → `ocr-llm` gateway | `backend/.env.prod` **and** the repo-root `.env` (the handoff CLI does not read `backend/.env.dev`) | when the gateway reissues | empty default is deliberate: AI stays off until configured |
| `GOOGLE_CLIENT_SECRET` | `noted-api` (Drive import) | `backend/.env.prod` | on exposure / Google console rotation | paired with the non-secret `GOOGLE_CLIENT_ID` |

## Not secrets, but environment-specific
`LLM_GATEWAY_URL`, `CORS_ORIGIN`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CLIENT_ID` — configuration,
not credentials. They still differ per environment; keep them out of committed defaults that
name a real host.

## Escrow
There is no separate escrow for these: the prod `.env` files are recoverable only from the
host and from whatever backup covers it. `scripts/backup-db.sh` and `backup-to-remote.sh` back
up **the database, not the env files** — a host loss without a copy of `backend/.env.prod`
means `AI_KEYS_ENC_KEY` is gone and every stored provider key with it.

## When adding a secret
1. Add it here (name + location only).
2. Add it to `backend/.env.example` and/or `backend/.env.prod.example` with `CHANGE_ME`.
3. Map it in `docker-compose.prod.yml`'s `environment:` block.
4. Read it fail-loud where the app genuinely cannot run without it; an empty default
   (`${VAR:-}`) is fine and deliberate where it means "feature off until configured".
