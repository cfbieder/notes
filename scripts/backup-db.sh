#!/usr/bin/env bash
set -euo pipefail

# Local PostgreSQL backup via pg_dump inside the noted-db container.
# Usage: ./backup-db.sh [--prune N]
#   --prune N  Keep only the last N backups (default: no pruning)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"
CONTAINER="noted-db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/noted_${TIMESTAMP}.sql.gz"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[backup]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# Parse args
PRUNE=0
while [[ $# -gt 0 ]]; do
  case $1 in
    --prune) PRUNE="$2"; shift 2 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

# Check container is running
docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$" \
  || die "Container '$CONTAINER' is not running"

mkdir -p "$BACKUP_DIR"

log "Dumping database from $CONTAINER ..."
docker exec "$CONTAINER" pg_dump -U noteduser -d noted_prod \
  --no-owner --no-privileges \
  | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
ok "Backup saved: $BACKUP_FILE ($SIZE)"

# Optional pruning
if [[ "$PRUNE" -gt 0 ]]; then
  BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/noted_*.sql.gz 2>/dev/null | wc -l)
  if [[ "$BACKUP_COUNT" -gt "$PRUNE" ]]; then
    REMOVE_COUNT=$((BACKUP_COUNT - PRUNE))
    log "Pruning $REMOVE_COUNT old backup(s) (keeping $PRUNE) ..."
    ls -1t "$BACKUP_DIR"/noted_*.sql.gz | tail -n "$REMOVE_COUNT" | xargs rm -f
    ok "Pruned to $PRUNE backups"
  fi
fi
