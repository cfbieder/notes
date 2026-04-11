#!/usr/bin/env bash
set -euo pipefail

# Remote database backup via SSH.
# Runs a local backup first, then copies to a remote host.
#
# Usage: ./backup-to-remote.sh
#
# Configure via environment or edit defaults below:
#   REMOTE_HOST     — SSH destination (user@host)
#   REMOTE_DIR      — Remote backup directory
#   REMOTE_KEEP     — Number of remote backups to retain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"

# Defaults — override via env vars
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_DIR="${REMOTE_DIR:-/home/cfbieder/backups/noted}"
REMOTE_KEEP="${REMOTE_KEEP:-15}"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[remote-backup]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

[[ -n "$REMOTE_HOST" ]] || die "REMOTE_HOST not set. Export it or edit this script."

# Step 1: Run local backup (keep 7 locally)
log "Running local backup ..."
bash "$SCRIPT_DIR/backup-db.sh" --prune 7

# Step 2: Find the latest backup
LATEST=$(ls -1t "$BACKUP_DIR"/noted_*.sql.gz 2>/dev/null | head -1)
[[ -n "$LATEST" ]] || die "No local backup found"

FILENAME=$(basename "$LATEST")

# Step 3: Transfer to remote
log "Transferring $FILENAME to $REMOTE_HOST:$REMOTE_DIR ..."
ssh "$REMOTE_HOST" "mkdir -p $REMOTE_DIR"
scp -q "$LATEST" "$REMOTE_HOST:$REMOTE_DIR/$FILENAME"
ok "Transferred to remote"

# Step 4: Prune old remote backups
if [[ "$REMOTE_KEEP" -gt 0 ]]; then
  log "Pruning remote backups (keeping $REMOTE_KEEP) ..."
  ssh "$REMOTE_HOST" "cd $REMOTE_DIR && ls -1t noted_*.sql.gz 2>/dev/null | tail -n +$((REMOTE_KEEP + 1)) | xargs -r rm -f"
  ok "Remote pruning complete"
fi

ok "Remote backup finished: $REMOTE_HOST:$REMOTE_DIR/$FILENAME"
