#!/usr/bin/env bash
# ci-guards.sh — mechanical enforcement of Noted's conventions.
#
# The rule: if a violation would block a merge, enforce it here; if it would merely raise
# an eyebrow, leave it a written convention in CLAUDE.md. Instructions to an agent are
# guidance, not enforcement.
#
# Run locally the same way CI does:  bash scripts/ci-guards.sh
set -euo pipefail

fail() { echo "CI-GUARD FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok  $*"; }

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "ci-guards: running"

# --- 1. No weak secret defaults in non-dev compose ---------------------------------------
# A `${VAR:-something}` on a secret means a missing env var silently becomes a known value.
# An empty default (`${VAR:-}`) is allowed: it means "feature off unless configured", which
# is how OCR_LLM_CLIENT_KEY is deliberately wired.
for f in docker-compose*.yml; do
  [ "$f" = docker-compose.dev.yml ] && continue
  [ -e "$f" ] || continue
  if grep -nE '\$\{[A-Z_]*(PASSWORD|SECRET|TOKEN|KEY)[A-Z_]*:-[^}]' "$f"; then
    fail "$f gives a secret a non-empty default — use \${VAR:?msg} instead"
  fi
done
ok "no weak secret defaults in prod compose"

# --- 2. Migrations are forward-only ------------------------------------------------------
# Adding a migration is fine; MODIFYING one that already shipped is not — it has already run
# against dev and prod, so the edit never applies there and CI diverges silently.
if git rev-parse origin/main >/dev/null 2>&1; then
  if git diff --diff-filter=M --name-only origin/main...HEAD -- 'backend/migrations/*' | grep -q .; then
    git diff --diff-filter=M --name-only origin/main...HEAD -- 'backend/migrations/*' >&2
    fail "an existing migration was modified — migrations are forward-only, write a new one"
  fi
fi
ok "migrations forward-only"

# --- 3. Migration numbering is unique ----------------------------------------------------
if ls backend/migrations/*.sql >/dev/null 2>&1; then
  dupes=$(ls backend/migrations/ | cut -c1-3 | sort | uniq -d || true)
  [ -n "$dupes" ] && fail "duplicate migration number(s): $dupes"
fi
ok "migration numbering unique"

# --- 4. No secrets or private config tracked in git --------------------------------------
# This repo is PUBLIC — anything committed is committed to the world, and history keeps it.
if git ls-files | grep -E '(^|/)\.env(\.|$)' | grep -vE '\.(example|sample)$' ; then
  fail "a .env file is tracked in git"
fi
git ls-files | grep -qE '(^|/)\.claude/' && fail ".claude/ is tracked — it is personal workflow config"
git ls-files | grep -qiE 'starter-pack' && fail "the private starter pack is tracked in git"
ok "no env files, .claude/, or starter pack tracked"

# --- 5. No database dumps in git ---------------------------------------------------------
# A committed pg_dump is user data in public git history, forever.
git check-ignore -q 'Backups/x.dump' || fail "Backups/ is not gitignored"
if git ls-files | grep -E '(^|/)[Bb]ackups/|\.dump$|\.sql\.gz$'; then
  fail "a database dump is tracked in git"
fi
ok "no database dumps tracked"

# --- 6. RATCHET: native confirm()/alert() in the frontend --------------------------------
# CLAUDE.md: always use the ConfirmModal component, never native confirm()/alert().
# There are known violations today (see docs/current/project-roadmap.md); this count may
# SHRINK, never grow. When it reaches 0, turn this into a hard fail.
NATIVE_DIALOG_BASELINE=3
count=$(grep -rnE '(^|[^.[:alnum:]_])(window\.)?(confirm|alert)[[:space:]]*\(' \
          frontend/src --include=*.vue --include=*.js 2>/dev/null \
        | grep -vE 'ConfirmModal|showConfirm|confirmModal' | wc -l | tr -d ' ')
if [ "$count" -gt "$NATIVE_DIALOG_BASELINE" ]; then
  grep -rnE '(^|[^.[:alnum:]_])(window\.)?(confirm|alert)[[:space:]]*\(' \
    frontend/src --include=*.vue --include=*.js | grep -vE 'ConfirmModal|showConfirm|confirmModal' >&2
  fail "native confirm()/alert() count rose to $count (baseline $NATIVE_DIALOG_BASELINE) — use ConfirmModal"
fi
if [ "$count" -lt "$NATIVE_DIALOG_BASELINE" ]; then
  echo "  note  native-dialog count is down to $count — lower NATIVE_DIALOG_BASELINE in this file"
fi
ok "native-dialog ratchet ($count/$NATIVE_DIALOG_BASELINE)"

# --- What these guards CANNOT see (the blind spot is where the next bug lands) -----------
# * Missing `user_id` scoping in a query — the isolation model is enforced in application
#   SQL with no RLS backstop, and no grep can tell a correctly-scoped query from a wrong
#   one. That is what .claude/agents/security-reviewer.md is for.
# * Prod compose still passes secrets as bare `${JWT_SECRET}` rather than fail-loud
#   `${JWT_SECRET:?...}` — a missing var substitutes empty instead of aborting the deploy.
#   Not yet enforced: fixing it is a prod-behaviour change, tracked as a known gap.
# * Compose project names are not pinned (`name:` absent from both files, so both derive
#   `noter` from the directory). Pinning them now would rename the volumes and orphan the
#   live prod database — the fix needs a deliberate volume migration, not a guard.
# * A secret pasted into a doc or a fixture rather than a .env file.

echo "ci-guards: all green"
