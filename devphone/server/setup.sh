#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04/24.04 server (x86_64 or arm64). Run as root from devphone/server/.
set -euo pipefail

echo "== kernel modules redroid needs (binder; ashmem is optional on new kernels) =="
apt-get update -y
apt-get install -y "linux-modules-extra-$(uname -r)" || echo "linux-modules-extra not found; binder may already be built in"
modprobe binder_linux devices="binder,hwbinder,vndbinder"
modprobe ashmem_linux 2>/dev/null || true
cat > /etc/modules-load.d/redroid.conf <<'MODS'
binder_linux
ashmem_linux
MODS
echo 'options binder_linux devices=binder,hwbinder,vndbinder' > /etc/modprobe.d/redroid.conf

echo "== docker =="
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi

echo "== tokens =="
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^DEVPHONE_TOKEN=.*/DEVPHONE_TOKEN=$(openssl rand -hex 24)/" .env
  sed -i "s/^DEVPHONE_VIEW_TOKEN=.*/DEVPHONE_VIEW_TOKEN=$(openssl rand -hex 24)/" .env
  echo "Created .env with fresh tokens. Set DEVPHONE_DOMAIN in it, then run this script again."
  exit 0
fi

echo "== start =="
docker compose --env-file .env up -d --build
docker compose ps
. ./.env
echo
echo "Phone viewer (watch only): https://$DEVPHONE_DOMAIN/?token=$DEVPHONE_VIEW_TOKEN"
echo "Drive token is in .env (DEVPHONE_TOKEN). Keep it secret."
