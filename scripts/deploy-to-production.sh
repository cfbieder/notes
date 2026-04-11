#!/usr/bin/env bash
set -euo pipefail

# deploy-to-production.sh — Full production deployment for Noted
#
# Steps:
#   1. Pre-flight checks (Docker, Tailscale, env file, certs)
#   2. Auto-backup existing database (if container running)
#   3. Build Docker images
#   4. Run database migrations
#   5. Start/restart services
#   6. Health verification
#
# Usage: ./deploy-to-production.sh [--skip-backup] [--build-only]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"
ENV_FILE="$PROJECT_ROOT/backend/.env.prod"
CERT_DIR="/etc/noted/certs"
DOMAIN="noted.tail413695.ts.net"

RED='\033[0;31m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# Parse args
SKIP_BACKUP=false
BUILD_ONLY=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-backup) SKIP_BACKUP=true; shift ;;
    --build-only) BUILD_ONLY=true; shift ;;
    *) die "Unknown argument: $1" ;;
  esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Noted — Production Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# --- 1. Pre-flight checks ---
log "Running pre-flight checks ..."

command -v docker &>/dev/null || die "Docker not found"
docker info &>/dev/null || die "Docker daemon not running"
ok "Docker available"

command -v tailscale &>/dev/null || die "Tailscale not found"
tailscale status &>/dev/null || die "Tailscale not connected"
ok "Tailscale connected"

[[ -f "$ENV_FILE" ]] || die "Production env file not found: $ENV_FILE\n  Copy backend/.env.prod.example to backend/.env.prod and fill in secrets"
ok "Environment file found"

# Check for CHANGE_ME values in env
if grep -q "CHANGE_ME" "$ENV_FILE"; then
  die "Found CHANGE_ME in $ENV_FILE — update all secrets before deploying"
fi
ok "No placeholder secrets"

# Ensure TLS certs exist (provision if missing)
if [[ ! -f "$CERT_DIR/noted.crt" ]] || [[ ! -f "$CERT_DIR/noted.key" ]]; then
  log "TLS certificates not found — provisioning via Tailscale ..."
  sudo bash "$SCRIPT_DIR/setup-certs.sh"
fi
[[ -f "$CERT_DIR/noted.crt" ]] || die "TLS certificate not found at $CERT_DIR/noted.crt"
ok "TLS certificates present"

# Read version
VERSION="unknown"
[[ -f "$PROJECT_ROOT/VERSION" ]] && VERSION=$(cat "$PROJECT_ROOT/VERSION")
log "Deploying version: $VERSION"

# --- 2. Auto-backup ---
if [[ "$SKIP_BACKUP" == "false" ]] && docker ps --format '{{.Names}}' | grep -q "^noted-db$"; then
  log "Backing up existing database ..."
  bash "$SCRIPT_DIR/backup-db.sh" --prune 10
else
  if [[ "$SKIP_BACKUP" == "true" ]]; then
    warn "Skipping backup (--skip-backup)"
  else
    warn "No existing database container — skipping backup"
  fi
fi

# --- 3. Load env and build ---
log "Loading environment from $ENV_FILE ..."
set -a
source "$ENV_FILE"
set +a
export APP_VERSION="$VERSION"

log "Building Docker images ..."
docker compose -f "$COMPOSE_FILE" build --no-cache
ok "Images built"

if [[ "$BUILD_ONLY" == "true" ]]; then
  ok "Build complete (--build-only). Exiting."
  exit 0
fi

# --- 4. Start database and run migrations ---
log "Starting database ..."
docker compose -f "$COMPOSE_FILE" up -d postgres

log "Waiting for PostgreSQL to be healthy ..."
RETRIES=30
until docker exec noted-db pg_isready -U "$DB_USER" -d "$DB_NAME" &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  [[ $RETRIES -eq 0 ]] && die "PostgreSQL did not become ready"
  sleep 1
done
ok "PostgreSQL is ready"

log "Running database migrations ..."
docker compose -f "$COMPOSE_FILE" run --rm \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME="$DB_NAME" \
  -e DB_USER="$DB_USER" \
  -e DB_PASSWORD="$DB_PASSWORD" \
  api node src/utils/migrate.js prod
ok "Migrations complete"

# --- 5. Start all services ---
log "Starting all services ..."
docker compose -f "$COMPOSE_FILE" up -d
ok "Services started"

# --- 6. Health verification ---
log "Verifying service health ..."
sleep 5

# Check each container is running
for CONTAINER in noted-db noted-api noted-web; do
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    ok "$CONTAINER is running"
  else
    die "$CONTAINER failed to start. Check: docker logs $CONTAINER"
  fi
done

# Check API health endpoint (via Docker network)
RETRIES=10
until docker exec noted-api wget -qO- http://127.0.0.1:3001/health &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  [[ $RETRIES -eq 0 ]] && die "API health check failed"
  sleep 2
done
ok "API health check passed"

# Check HTTPS (resolve domain to Tailscale IP for local verification)
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
RETRIES=5
if [[ -n "$TAILSCALE_IP" ]]; then
  until curl -sfk --resolve "${DOMAIN}:443:${TAILSCALE_IP}" "https://$DOMAIN/health" &>/dev/null; do
    RETRIES=$((RETRIES - 1))
    [[ $RETRIES -eq 0 ]] && warn "HTTPS check failed — verify Nginx and certs"
    sleep 2
  done
  if [[ $RETRIES -gt 0 ]]; then
    ok "HTTPS check passed"
  fi
else
  warn "Could not determine Tailscale IP — skipping HTTPS check"
fi

echo ""
ok "Deployment complete!"
echo ""
echo "  Version:  $VERSION"
echo "  URL:      https://$DOMAIN"
echo "  API:      https://$DOMAIN/api/v1/"
echo "  Health:   https://$DOMAIN/health"
echo ""
echo "  Logs:     docker compose -f docker-compose.prod.yml logs -f"
echo "  Status:   docker compose -f docker-compose.prod.yml ps"
echo ""
