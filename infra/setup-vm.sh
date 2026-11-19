#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VM (Hetzner) for the AuraSentinel server. Run as root:
#   scp infra/setup-vm.sh root@<IP>:/root/   (from the laptop)
#   bash /root/setup-vm.sh "<contents of aurasentinel_deploy.pub>"
# Installs Docker, 4 GB swap and Caddy (HTTPS on <ip>.sslip.io -> nginx on 127.0.0.1:8080), creates the `deploy`
# user that GitHub Actions logs in as, and clones the repo to /opt/aurasentinel. Safe to run twice.
# It never touches secrets: copy infra/.env.prod yourself afterwards (scp), then the first deploy brings the stack up.
set -euo pipefail

DEPLOY_PUBKEY="${1:?usage: setup-vm.sh \"ssh-ed25519 AAAA... aurasentinel-deploy\"}"
REPO_URL="https://github.com/KidCute1412/AuraSentinel.git"
APP_DIR="/opt/aurasentinel"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git caddy

# Docker Engine + compose plugin
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

# 4 GB swap: the monorepo build needs more than the 4 GB of a CX23
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# deploy user: GitHub Actions only (docker group, no password, no sudo)
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "$DEPLOY_PUBKEY" > /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys

# Repo
if [ ! -d "$APP_DIR/.git" ]; then git clone --branch main "$REPO_URL" "$APP_DIR"; fi
chown -R deploy:deploy "$APP_DIR"

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
