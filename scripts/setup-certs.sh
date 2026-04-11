#!/usr/bin/env bash
set -euo pipefail

# Provision TLS certificates via Tailscale for noted.tail413695.ts.net
# Idempotent — safe to re-run (cert renewal) via cron.

CERT_DIR="/etc/noted/certs"
DOMAIN="noted.tail413695.ts.net"

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[certs]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# Must run as root (tailscale cert writes to /etc)
[[ $EUID -eq 0 ]] || die "Must run as root (sudo)"

# Check tailscale is available and connected
command -v tailscale &>/dev/null || die "tailscale CLI not found"
tailscale status &>/dev/null || die "Tailscale is not connected"

# Create cert directory
mkdir -p "$CERT_DIR"

log "Provisioning TLS certificate for $DOMAIN ..."
tailscale cert \
  --cert-file "$CERT_DIR/noted.crt" \
  --key-file "$CERT_DIR/noted.key" \
  "$DOMAIN"

# Secure permissions
chmod 644 "$CERT_DIR/noted.crt"
chmod 600 "$CERT_DIR/noted.key"

ok "Certificate written to $CERT_DIR/"
ok "  noted.crt (certificate)"
ok "  noted.key (private key)"

# Reload Nginx if running
if docker ps --format '{{.Names}}' | grep -q "noted-web"; then
  log "Reloading Nginx ..."
  docker exec noted-web nginx -s reload
  ok "Nginx reloaded with new certificate"
fi
