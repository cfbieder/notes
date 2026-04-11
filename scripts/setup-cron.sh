#!/usr/bin/env bash
set -euo pipefail

# Setup production cron jobs for Noted.
# Idempotent — removes existing Noted cron entries before adding.
#
# Cron schedule:
#   - Remote DB backup:  Every 2 days at 2 AM
#   - Cert renewal:      1st of each month at 3 AM
#   - Docker prune:      Sundays at 3 AM

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[cron]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }

MARKER="# noted-auto"

# Build new cron entries
CRON_ENTRIES="
# Noted — automated jobs ${MARKER}
0 2 */2 * * ${SCRIPT_DIR}/backup-to-remote.sh >> /var/log/noted-backup.log 2>&1 ${MARKER}
0 3 1 * * sudo ${SCRIPT_DIR}/setup-certs.sh >> /var/log/noted-certs.log 2>&1 ${MARKER}
0 3 * * 0 docker system prune -f >> /var/log/noted-prune.log 2>&1 ${MARKER}
"

log "Installing cron jobs ..."

# Remove existing Noted entries, add new ones
(crontab -l 2>/dev/null | grep -v "$MARKER"; echo "$CRON_ENTRIES") | crontab -

ok "Cron jobs installed:"
echo "  0 2 */2 * *  — Remote DB backup"
echo "  0 3 1 * *    — TLS cert renewal (tailscale cert)"
echo "  0 3 * * 0    — Docker system prune"
echo ""
echo "  View:   crontab -l"
echo "  Logs:   /var/log/noted-*.log"
