#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# start.sh — Paysys WhatsApp Data Reporting Agent startup script
# Usage: ./deploy/start.sh [--dry-run]
# ---------------------------------------------------------------------------
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DEPLOY_DIR"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# ── Preflight checks ────────────────────────────────────────────────────────

echo "[start.sh] Working directory: $DEPLOY_DIR"

if [[ ! -f "orgs/paysys/.env" ]]; then
  echo "[ERROR] orgs/paysys/.env not found."
  echo "        Copy orgs/paysys/.env.example → orgs/paysys/.env and fill in real values."
  exit 1
fi

if [[ ! -f "dist/main.js" ]]; then
  echo "[INFO] dist/ not found — running build..."
  npm run build
fi

# Create runtime directories
mkdir -p orgs/paysys/runtime/logs
mkdir -p output/reports
mkdir -p data
mkdir -p logs

# ── Dry-run mode ────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[start.sh] DRY_RUN mode — WHATSAPP_DRY_RUN will be forced to true"
  export WHATSAPP_DRY_RUN=true
fi

# ── Launch ──────────────────────────────────────────────────────────────────

echo "[start.sh] Starting paysys-agent (ORG=paysys)..."
export ORG=paysys

# If PM2 is available, use it; otherwise fall back to direct node
if command -v pm2 &>/dev/null; then
  echo "[start.sh] Using PM2..."
  pm2 start pm2.config.cjs --only paysys-agent
  pm2 save
  echo "[start.sh] Agent started. View logs: pm2 logs paysys-agent"
else
  echo "[start.sh] PM2 not found — starting directly (not production-safe)..."
  # shellcheck disable=SC1091
  set -a; source orgs/paysys/.env; set +a
  node dist/main.js
fi
