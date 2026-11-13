#!/usr/bin/env bash
# Local dev from a fresh clone (macOS / Linux twin of start.bat):
# env files -> deps -> shared build -> docker infra -> migrations -> api + worker + web -> health.
#   ./start.sh               everything (dev servers in the background, logs in .dev-logs/)
#   ./start.sh --setup-only  stop after migrations
# Production on one laptop is a different file: docs/runbook/production.md
set -euo pipefail
cd "$(dirname "$0")"
PNPM="corepack pnpm"
die() { echo; echo "[ERROR] $*"; exit 1; }

command -v node >/dev/null || die "Node.js not found. Install Node 20+."
command -v docker >/dev/null || die "Docker not found."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || die "Node 20+ required."

echo "[1/6] Checking env files..."
for f in infra/.env apps/server/.env apps/web/.env; do
  [ -f "$f" ] || { cp "$f.example" "$f"; echo "      created $f"; }
done

echo "[2/6] Installing dependencies..."
$PNPM install --frozen-lockfile --prefer-offline || die "pnpm install failed."
echo "[3/6] Building packages/shared..."
$PNPM --filter @agentshield/shared build >/dev/null || die "Building packages/shared failed."

echo "[4/6] Checking Docker..."
docker info >/dev/null 2>&1 || die "Docker is not running. Start it and re-run."
echo "[5/6] Starting postgres, redis, anvil (waiting until healthy)..."
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build --wait \
  || die "docker compose failed. Check FORK_URL in infra/.env"

echo "[6/6] Applying database migrations..."
(cd apps/server && $PNPM db:migrate) || die "drizzle migrate failed."

if [ "${1:-}" = "--setup-only" ]; then echo; echo "Setup done (--setup-only)."; exit 0; fi

mkdir -p .dev-logs
echo "Starting api + worker and web in the background (logs in .dev-logs/)..."
(cd apps/server && $PNPM dev > ../../.dev-logs/server.log 2>&1 &)
(cd apps/web && $PNPM dev > ../../.dev-logs/web.log 2>&1 &)

echo "Waiting for the API (the first start compiles both apps: up to 4 minutes)..."
for _ in $(seq 1 120); do
  if curl -fs http://localhost:4000/api/health; then echo; break; fi
  sleep 2
done
echo
echo "  Web:        http://localhost:5173"
echo "  API health: http://localhost:4000/api/health"
echo "  Logs:       tail -f .dev-logs/server.log .dev-logs/web.log"
echo "  Stop:       pkill -f 'nest start'; pkill -f vite; docker compose -f infra/docker-compose.yml down"
