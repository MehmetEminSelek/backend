#!/usr/bin/env bash
set -euo pipefail

# Hostinger/VPS one-click deploy script for OG Sipariş
# - Deploys BOTH backend (Next.js API) and frontend (Vue build) under /var/www/ogsiparis.com
# - Requires: git, node (>=18), npm, pm2, nginx, certbot (for SSL)
#
# Usage (on server):
#   bash /var/www/ogsiparis.com/backend/scripts/deploy-hostinger.sh \
#     --domain ogsiparis.com \
#     --backend-repo <git-remote-url> \
#     --frontend-repo <git-remote-url>
#
# Notes:
# - Script is idempotent. Re-running will pull latest main and rebuild.
# - Expects .env.production files to exist and be source of truth (per project rule).
# - Keeps existing PostgreSQL setup intact. Runs `prisma migrate deploy` only.

DOMAIN=""
BACKEND_REPO=""
FRONTEND_REPO=""
NODE_BIN="node"
NPM_BIN="npm"
PM2_BIN="pm2"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2;;
    --backend-repo) BACKEND_REPO="$2"; shift 2;;
    --frontend-repo) FRONTEND_REPO="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "$DOMAIN" ]]; then
  echo "[ERROR] --domain is required"; exit 1
fi

WEB_ROOT="/var/www/${DOMAIN}"
BACKEND_DIR="${WEB_ROOT}/backend"
FRONTEND_DIR="${WEB_ROOT}/frontend"
BACKEND_NAME="ogsiparis-backend"

echo "[i] Ensuring directories exist: ${WEB_ROOT}"
sudo mkdir -p "$BACKEND_DIR" "$FRONTEND_DIR"
sudo chown -R "$USER":"$USER" "$WEB_ROOT"

echo "[i] Checking base packages (git, nginx, pm2)"
if ! command -v git >/dev/null 2>&1; then
  sudo apt-get update -y && sudo apt-get install -y git
fi
if ! command -v nginx >/dev/null 2>&1; then
  sudo apt-get update -y && sudo apt-get install -y nginx
fi
if ! command -v $PM2_BIN >/dev/null 2>&1; then
  sudo npm i -g pm2
fi

echo "[i] Node version: $($NODE_BIN -v || echo 'missing')"
echo "[i] NPM version: $($NPM_BIN -v || echo 'missing')"

############################
# Clone or update repos
############################
cd "$WEB_ROOT"

if [[ -n "$BACKEND_REPO" && ! -d "$BACKEND_DIR/.git" ]]; then
  echo "[i] Cloning backend -> $BACKEND_DIR"
  git clone "$BACKEND_REPO" "$BACKEND_DIR"
fi
if [[ -n "$FRONTEND_REPO" && ! -d "$FRONTEND_DIR/.git" ]]; then
  echo "[i] Cloning frontend -> $FRONTEND_DIR"
  git clone "$FRONTEND_REPO" "$FRONTEND_DIR"
fi

echo "[i] Pulling latest main (backend)"
cd "$BACKEND_DIR"
git fetch --all --prune
git checkout main
git pull --ff-only

echo "[i] Pulling latest main (frontend)"
cd "$FRONTEND_DIR"
git fetch --all --prune
git checkout main
git pull --ff-only

############################
# Backend build & run
############################
cd "$BACKEND_DIR"

if [[ ! -f .env.production ]]; then
  echo "[ERROR] backend .env.production not found. Aborting per project rule."; exit 2
fi
cp -f .env.production .env

echo "[i] Installing backend deps"
$NPM_BIN ci --omit=dev

echo "[i] Prisma generate + migrate deploy"
npx prisma generate
npx prisma migrate deploy

echo "[i] Building backend"
$NPM_BIN run build || { echo "[ERROR] Backend build failed"; exit 3; }

echo "[i] Starting/Reloading PM2 service: $BACKEND_NAME"
$PM2_BIN startOrReload <<'PM2_JSON'
{
  "apps": [
    {
      "name": "ogsiparis-backend",
      "cwd": "__CWD__",
      "script": "npm",
      "args": "start",
      "env": {
        "NODE_ENV": "production",
        "PORT": "3000"
      }
    }
  ]
}
PM2_JSON

# replace placeholder __CWD__ in pm2 process
$PM2_BIN delete ogsiparis-backend >/dev/null 2>&1 || true
$PM2_BIN start npm --name "$BACKEND_NAME" -- start
$PM2_BIN save

echo "[i] Backend health check"
sleep 2
if curl -fsS "http://127.0.0.1:3000/api/health" | grep -q 'healthy'; then
  echo "[OK] Backend healthy"
else
  echo "[WARN] Backend health check did not return expected content"
fi

############################
# Frontend build
############################
cd "$FRONTEND_DIR"

if [[ -f .env.production ]]; then
  echo "[i] Using frontend .env.production"
else
  echo "[WARN] frontend .env.production not found. Proceeding with defaults."
fi

echo "[i] Installing frontend deps"
$NPM_BIN ci --omit=dev

echo "[i] Building frontend"
$NPM_BIN run build || { echo "[ERROR] Frontend build failed"; exit 4; }

if [[ ! -d dist ]]; then
  echo "[ERROR] Frontend build folder 'dist' not found"; exit 5
fi

############################
# Nginx config & SSL (optional)
############################
NG_CONF_PATH="/etc/nginx/sites-available/${DOMAIN}.conf"
NG_CONF_LINK="/etc/nginx/sites-enabled/${DOMAIN}.conf"

echo "[i] Writing nginx config -> $NG_CONF_PATH"
sudo bash -c "cat > '$NG_CONF_PATH'" <<NGINX
server {
  listen 80;
  server_name ${DOMAIN} www.${DOMAIN};
  # Redirect HTTP to HTTPS if certificate will be installed later
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name ${DOMAIN} www.${DOMAIN};

  # SSL placeholders – run certbot after first deploy
  ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

  # Increase upload size if needed
  client_max_body_size 20m;

  # Static frontend
  root ${WEB_ROOT}/frontend/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # Backend API
  location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
NGINX

if [[ ! -L "$NG_CONF_LINK" ]]; then
  sudo ln -s "$NG_CONF_PATH" "$NG_CONF_LINK" || true
fi

echo "[i] Testing nginx config"
sudo nginx -t
echo "[i] Reloading nginx"
sudo systemctl reload nginx

echo "[i] (Optional) Install SSL if not present)"
if [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  echo " - To install SSL: sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
fi

echo "[DONE] Deployment complete for ${DOMAIN}"

