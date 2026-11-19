#!/usr/bin/env bash
# Installed as /usr/local/bin/aurasentinel-autodeploy (a copy, so git reset never rewrites the running script).
# Pull-based deploy, run every 2 minutes by aurasentinel-deploy.timer as the `deploy` user.
# Does nothing unless main has a NEW commit whose `ci-pass` check succeeded:
#   1. git ls-remote main (one cheap call). Same SHA as the last deploy, or a SHA that already failed -> exit.
#   2. Ask the GitHub API (public repo, no token) for that commit's `ci-pass`. Still running -> exit, retry next tick.
#      Failed -> remember the SHA and never retry it.
#   3. Reset to the SHA, compose up --build --wait, check /api/health, record the SHA.
# No secret involved: GitHub never logs into the server. Logs: journalctl -u aurasentinel-deploy
set -euo pipefail

APP_DIR="/opt/aurasentinel"
REPO="KidCute1412/AuraSentinel"
STATE="$HOME/.autodeploy"
COMPOSE=(docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod)

cd "$APP_DIR"
mkdir -p "$STATE"
exec 9>"$STATE/lock"
flock -n 9 || { echo "another deploy is running"; exit 0; }

sha="$(git ls-remote origin refs/heads/main | cut -f1)"
[ -n "$sha" ] || { echo "could not read origin/main"; exit 1; }
[ "$sha" = "$(cat "$STATE/deployed" 2>/dev/null || true)" ] && exit 0
[ "$sha" = "$(cat "$STATE/failed" 2>/dev/null || true)" ] && exit 0

ci="$(curl -fsS -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$REPO/commits/$sha/check-runs?check_name=ci-pass" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["check_runs"]; print(r[0]["conclusion"] or r[0]["status"] if r else "missing")')"
case "$ci" in
  success) ;;
  queued|in_progress|missing|pending|waiting) echo "main ${sha:0:7}: ci-pass is $ci, waiting"; exit 0 ;;
  *) echo "main ${sha:0:7}: ci-pass is $ci, not deploying"; echo "$sha" > "$STATE/failed"; exit 0 ;;
esac

echo "deploying main ${sha:0:7}"
test -f infra/.env.prod || { echo "infra/.env.prod missing"; exit 1; }
git fetch -q --depth 1 origin "$sha"
git reset -q --hard "$sha"
if "${COMPOSE[@]}" up -d --build --wait --remove-orphans && curl -fsS http://127.0.0.1:8080/api/health; then
  echo "$sha" > "$STATE/deployed"
  docker image prune -f >/dev/null
  echo; echo "deployed ${sha:0:7}"
else
  echo "$sha" > "$STATE/failed"
  echo "deploy of ${sha:0:7} failed; fix and push a new commit (or: rm ~deploy/.autodeploy/failed)"
  exit 1
fi
