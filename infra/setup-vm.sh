#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VM (Hetzner) for the AuraSentinel server. Run as root from the repo checkout:
#   scp -r infra/setup-vm.sh infra/autodeploy root@<IP>:/root/   (from the laptop)
#   bash /root/setup-vm.sh
# Installs Docker, 4 GB swap and Caddy (HTTPS on <ip>.sslip.io -> nginx on 127.0.0.1:8080), creates the `deploy`
# user (docker group, no SSH login), clones the repo to /opt/aurasentinel and installs the pull-based auto deploy
# (infra/autodeploy: every 2 minutes, deploys main only when it has a new commit with ci-pass green). Safe to run twice.
# It never touches secrets: copy infra/.env.prod yourself afterwards (scp); the next timer tick brings the stack up.
set -euo pipefail

REPO_URL="https://github.com/KidCute1412/AuraSentinel.git"
APP_DIR="/opt/aurasentinel"
SRC="$(cd "$(dirname "$0")" && pwd)/autodeploy"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git caddy python3

# Docker Engine + compose plugin
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

# 4 GB swap: the monorepo build needs more than the 4 GB of a CX23
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# deploy user: runs the stack (docker group), no password, no sudo, no SSH key
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
rm -f /home/deploy/.ssh/authorized_keys

# Repo
if [ ! -d "$APP_DIR/.git" ]; then git clone --branch main "$REPO_URL" "$APP_DIR"; fi
chown -R deploy:deploy "$APP_DIR"

# Auto deploy (pull based): a copy of the script, so `git reset` never rewrites it while it runs
install -m 755 "$SRC/autodeploy.sh" /usr/local/bin/aurasentinel-autodeploy
install -m 644 "$SRC/aurasentinel-deploy.service" "$SRC/aurasentinel-deploy.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now aurasentinel-deploy.timer

# HTTPS without buying a domain: 1.2.3.4 -> 1-2-3-4.sslip.io, Let's Encrypt via Caddy
IP="$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
DOMAIN="${IP//./-}.sslip.io"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:8080
}
EOF
systemctl enable --now caddy
systemctl reload caddy

echo
echo "Done. API_ORIGIN for Vercel: https://$DOMAIN"
echo "Next: scp infra/.env.prod root@$IP:$APP_DIR/infra/.env.prod && ssh root@$IP 'chown deploy $APP_DIR/infra/.env.prod && chmod 600 $APP_DIR/infra/.env.prod'"
echo "Deploy log: journalctl -u aurasentinel-deploy -f"
