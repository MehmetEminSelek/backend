#!/bin/bash
# =================================================================
# 🚀 OG SİPARİŞ - CYBERPANEL VPS DEPLOYMENT SCRIPT
# LiteSpeed + CyberPanel + Node.js + PostgreSQL
# =================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 OG Sipariş CyberPanel VPS Deployment Başlıyor...${NC}"

# Configuration
DOMAIN=${1:-"ogsiparis.com"}
BACKEND_DIR="/home/$DOMAIN/public_html/backend"
FRONTEND_DIR="/home/$DOMAIN/public_html/frontend"
DB_NAME="ogformdb"
DB_USER="ogform"
DB_PASS=${2:-"$(openssl rand -base64 32)"}

echo -e "${YELLOW}📋 Konfigürasyon:${NC}"
echo "Domain: $DOMAIN"
echo "Backend: $BACKEND_DIR (Port 3000)"
echo "Frontend: $FRONTEND_DIR (Port 5173)"
echo "Database: $DB_NAME"

# =================================================================
# 1. SYSTEM DEPENDENCIES UPDATE
# =================================================================
echo -e "${BLUE}📦 Sistem güncelleniyor...${NC}"

dnf update -y
dnf install -y curl wget git postgresql postgresql-server postgresql-contrib

# =================================================================
# 2. NODE.JS INSTALLATION
# =================================================================
echo -e "${BLUE}📦 Node.js kuruluyor...${NC}"

# Node.js 18.x kurulumu (AlmaLinux için)
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
dnf install -y nodejs

# PM2 kurulumu
npm install -g pm2

# Versiyonları kontrol et
echo "Node.js: $(node --version)"
echo "NPM: $(npm --version)"
echo "PM2: $(pm2 --version)"

# =================================================================
# 3. POSTGRESQL SETUP
# =================================================================
echo -e "${BLUE}🗄️ PostgreSQL yapılandırılıyor...${NC}"

# PostgreSQL başlat
postgresql-setup --initdb
systemctl enable postgresql
systemctl start postgresql

# Database ve kullanıcı oluştur
sudo -u postgres psql << EOF
CREATE DATABASE $DB_NAME;
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';
ALTER ROLE $DB_USER SET client_encoding TO 'utf8';
ALTER ROLE $DB_USER SET default_transaction_isolation TO 'read committed';
ALTER ROLE $DB_USER SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
\q
EOF

echo -e "${GREEN}✅ PostgreSQL kuruldu - DB: $DB_NAME, User: $DB_USER${NC}"

# =================================================================
# 4. CYBERPANEL DOMAIN CHECK & CREATE
# =================================================================
echo -e "${BLUE}🌐 CyberPanel domain kontrolü...${NC}"

# Domain var mı kontrol et
if [ ! -d "/home/$DOMAIN" ]; then
    echo "❌ Domain $DOMAIN bulunamadı! CyberPanel'den domain oluşturun."
    echo "1. https://147.93.123.161:8090 adresine gidin"
    echo "2. Websites > Create Website > $DOMAIN ekleyin"
    echo "3. Script'i tekrar çalıştırın"
    exit 1
else
    echo -e "${GREEN}✅ Domain $DOMAIN mevcut${NC}"
fi

# =================================================================
# 5. BACKEND DEPLOYMENT
# =================================================================
echo -e "${BLUE}🔧 Backend deploy ediliyor...${NC}"

# Backend klasörünü oluştur
mkdir -p $BACKEND_DIR
cd $BACKEND_DIR

# GitHub'dan backend'i klonla
if [ ! -d ".git" ]; then
    git clone https://github.com/MehmetEminSelek/ogBackend.git .
else
    git pull origin main
fi

# Dependencies kur
npm install

# Production .env oluştur
cat > .env << EOF
# OG Backend API - Production Environment
NODE_ENV=production
PORT=3000

# Database Configuration
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public"

# JWT Secret
JWT_SECRET="og-siparis-super-secret-jwt-key-production-$(date +%s)"

# API Domain Configuration  
NEXT_PUBLIC_API_URL=https://$DOMAIN/api
CORS_ORIGIN=https://$DOMAIN

# Email Configuration (Hostinger SMTP)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=admin@$DOMAIN
SMTP_PASS=your-email-password

# File Upload
MAX_FILE_SIZE=10MB
UPLOAD_DIR=./uploads

# Security
BCRYPT_ROUNDS=12
EOF

# Prisma generate ve migrate
npx prisma generate
npx prisma db push

# Build project
npm run build

echo -e "${GREEN}✅ Backend hazır!${NC}"

# =================================================================
# 6. FRONTEND DEPLOYMENT  
# =================================================================
echo -e "${BLUE}🎨 Frontend deploy ediliyor...${NC}"

# Frontend klasörünü oluştur
mkdir -p $FRONTEND_DIR
cd $FRONTEND_DIR

# GitHub'dan frontend'i klonla
if [ ! -d ".git" ]; then
    git clone https://github.com/MehmetEminSelek/ogFrontend.git .
else
    git pull origin main
fi

# Dependencies kur
npm install

# Production .env oluştur
cat > .env.production << EOF
NEXT_PUBLIC_API_URL=https://$DOMAIN/api
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
NODE_ENV=production
EOF

# Build project
npm run build

echo -e "${GREEN}✅ Frontend hazır!${NC}"

# =================================================================
# 7. PM2 CONFIGURATION
# =================================================================
echo -e "${BLUE}⚙️ PM2 yapılandırılıyor...${NC}"

# Backend PM2 başlat
cd $BACKEND_DIR
pm2 start npm --name "og-backend" -- start

# Frontend PM2 başlat (Port 5173)
cd $FRONTEND_DIR  
pm2 start npm --name "og-frontend" -- start -- -p 5173

# PM2 kaydet ve startup
pm2 save
pm2 startup

echo -e "${GREEN}✅ PM2 çalışıyor!${NC}"

# =================================================================
# 8. LITESPEED VIRTUAL HOST CONFIGURATION
# =================================================================
echo -e "${BLUE}⚡ LiteSpeed yapılandırılıyor...${NC}"

# LiteSpeed vhost config dosyası
VHOST_CONFIG="/usr/local/lsws/conf/vhosts/$DOMAIN/vhconf.conf"

# Virtual Host ayarları (proxy setup)
cat > /tmp/vhost_proxy.conf << EOF
docRoot                   /home/$DOMAIN/public_html/
vhDomain                  $DOMAIN
vhAliases                 www.$DOMAIN
adminEmails               admin@$DOMAIN
enableGzip                1
enableIpGeo               1

errorlog $SERVER_ROOT/logs/error.log {
  useServer               1
  logLevel                DEBUG
  rollingSize             10M
}

accesslog $SERVER_ROOT/logs/access.log {
  useServer               1
  logFormat               "%h %l %u %t \"%r\" %>s %b"
  logHeaders              5
  rollingSize             10M
  keepDays                10
}

index  {
  useServer               0
  indexFiles              index.html, index.php
}

# Frontend Proxy (Ana sayfa)
context / {
  type                    proxy
  uri                     /
  extraHeaders            X-Forwarded-Proto $scheme
  proxyHeadersInput       1
  proxyHeadersOutput      1
  addDefaultCharset       off
  
  phpIniOverride  {
  }
}

# Backend API Proxy  
context /api {
  type                    proxy
  uri                     /api/
  webAddr                 127.0.0.1:3000
  extraHeaders            X-Forwarded-Proto $scheme
  proxyHeadersInput       1
  proxyHeadersOutput      1
  addDefaultCharset       off
}

# Static files için frontend proxy
context /_next {
  type                    proxy
  uri                     /_next/
  webAddr                 127.0.0.1:5173
  extraHeaders            X-Forwarded-Proto $scheme
  proxyHeadersInput       1
  proxyHeadersOutput      1
  addDefaultCharset       off
}

rewrite  {
  enable                  1
  autoLoadHtaccess        1
}
EOF

# Config'i kopyala (backup alarak)
if [ -f "$VHOST_CONFIG" ]; then
    cp "$VHOST_CONFIG" "$VHOST_CONFIG.backup"
fi

# Yeni config'i yerleştir
mkdir -p "/usr/local/lsws/conf/vhosts/$DOMAIN"
cp /tmp/vhost_proxy.conf "$VHOST_CONFIG"

# LiteSpeed'i yeniden başlat
systemctl restart lsws

echo -e "${GREEN}✅ LiteSpeed yapılandırıldı!${NC}"

# =================================================================
# 9. SSL CERTIFICATE SETUP
# =================================================================
echo -e "${BLUE}🔐 SSL sertifikası kuruluyor...${NC}"

# CyberPanel SSL komutu
/usr/local/CyberCP/bin/python /usr/local/CyberCP/plogical/acme.py --domain $DOMAIN --email admin@$DOMAIN

echo -e "${GREEN}✅ SSL kuruldu!${NC}"

# =================================================================
# 10. FIREWALL CONFIGURATION
# =================================================================
echo -e "${BLUE}🔒 Firewall ayarları...${NC}"

firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --permanent --add-port=8090/tcp
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --permanent --add-port=5173/tcp
firewall-cmd --reload

echo -e "${GREEN}✅ Firewall yapılandırıldı!${NC}"

# =================================================================
# 11. DEPLOYMENT INFO
# =================================================================
echo -e "${GREEN}🎉 CYBERPANEL DEPLOYMENT TAMAMLANDI!${NC}"
echo -e "${YELLOW}📋 Bilgiler:${NC}"
echo "🌐 Website: https://$DOMAIN"
echo "🔗 API: https://$DOMAIN/api"
echo "🎛️ CyberPanel: https://147.93.123.161:8090"
echo "🗄️ Database: $DB_NAME (User: $DB_USER)"
echo ""
echo -e "${YELLOW}🔧 Yönetim Komutları:${NC}"
echo "📊 PM2 durumu: pm2 list"
echo "📜 PM2 logları: pm2 logs"
echo "⚡ LiteSpeed yeniden başlat: systemctl restart lsws"
echo "🔄 SSL yenile: /usr/local/CyberCP/bin/python /usr/local/CyberCP/plogical/acme.py --domain $DOMAIN"
echo ""
echo -e "${YELLOW}📁 Klasörler:${NC}"
echo "🔧 Backend: $BACKEND_DIR (Port 3000)"
echo "🎨 Frontend: $FRONTEND_DIR (Port 5173)"
echo ""
echo -e "${GREEN}✅ Siteniz hazır: https://$DOMAIN${NC}"
echo -e "${BLUE}🎛️ CyberPanel'den domain ve SSL ayarlarını kontrol edin!${NC}" 