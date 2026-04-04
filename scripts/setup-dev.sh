#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log()  { echo -e "${BLUE}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# 1. Check Node.js
check_node() {
  if command -v node &>/dev/null && [[ "$(node --version)" == v2[0-9]* ]]; then
    ok "Node.js $(node --version) found"
  else
    die "Node.js 20+ is required. Install from https://nodejs.org/"
  fi
}

# 2. Check Docker
check_docker() {
  if command -v docker &>/dev/null; then
    ok "Docker found"
  else
    die "Docker is required. Install from https://docs.docker.com/engine/install/"
  fi
}

# 3. Create .env.dev from template
create_env() {
  local env_file="$PROJECT_ROOT/backend/.env.dev"
  if [[ -f "$env_file" ]]; then
    ok ".env.dev already exists"
    return
  fi
  log "Creating backend/.env.dev from .env.example ..."
  cp "$PROJECT_ROOT/backend/.env.example" "$env_file"
  # Generate real secrets
  if command -v openssl &>/dev/null; then
    sed -i "s|JWT_SECRET=CHANGE_ME|JWT_SECRET=$(openssl rand -hex 32)|" "$env_file"
    sed -i "s|JWT_REFRESH_SECRET=CHANGE_ME|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" "$env_file"
  else
    warn "openssl not found — update JWT secrets in backend/.env.dev manually"
  fi
  ok ".env.dev created with auto-generated secrets"
}

# 4. Install dependencies
install_deps() {
  log "Installing backend dependencies ..."
  (cd "$PROJECT_ROOT/backend" && npm install)
  log "Installing frontend dependencies ..."
  (cd "$PROJECT_ROOT/frontend" && npm install)
  ok "Dependencies installed"
}

# 5. Start dev DB
start_db() {
  log "Starting PostgreSQL dev container ..."
  docker compose -f "$PROJECT_ROOT/docker-compose.dev.yml" up -d

  log "Waiting for PostgreSQL to be ready ..."
  local retries=30
  until docker exec noted-db-dev pg_isready -U noteduser -d noted_dev &>/dev/null; do
    retries=$((retries - 1))
    [[ $retries -eq 0 ]] && die "PostgreSQL did not become ready"
    sleep 1
  done
  ok "PostgreSQL is ready"
}

# 6. Run migrations
run_migrations() {
  log "Running database migrations ..."
  (cd "$PROJECT_ROOT/backend" && npm run migrate:dev)
  ok "Migrations applied"
}

# 7. Seed dev data
seed_data() {
  local seed_file="$PROJECT_ROOT/db/seeds/001_dev_seed.sql"
  if [[ -f "$seed_file" ]]; then
    log "Seeding development data ..."
    docker exec -i noted-db-dev psql -U noteduser -d noted_dev < "$seed_file"
    ok "Dev data seeded"
  else
    warn "No seed file found, skipping"
  fi
}

main() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}  Noted — Dev Environment Setup${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""

  check_node
  check_docker
  create_env
  install_deps
  start_db
  run_migrations
  seed_data

  echo ""
  ok "Setup complete!"
  echo ""
  echo "  Start dev servers:"
  echo "    Terminal 1: cd backend && npm run dev"
  echo "    Terminal 2: cd frontend && npm run dev"
  echo ""
  echo "  Backend API:  http://localhost:3001"
  echo "  Frontend:     http://localhost:5173"
  echo "  Database:     localhost:5432 (noted_dev)"
  echo ""
  echo "  Test user:    dev / password123"
}

main "$@"
