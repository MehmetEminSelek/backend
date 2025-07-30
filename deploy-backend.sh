#!/bin/bash

# Ömer Güllü Sipariş Sistemi - Backend + Database Deployment Script
# Bu script /home/ogsiparis.com/backend dizininde çalıştırılmalıdır

set -e

echo "🚀 Ömer Güllü Backend + Database Deployment Başlıyor..."

# Renk tanımlamaları
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Çalışma dizini kontrolü
EXPECTED_DIR="/home/ogsiparis.com/backend"
CURRENT_DIR=$(pwd)

if [ "$CURRENT_DIR" != "$EXPECTED_DIR" ]; then
    echo -e "${YELLOW}⚠️  Uyarı: Bu script $EXPECTED_DIR dizininde çalıştırılmalı${NC}"
    echo -e "${YELLOW}Şu anki dizin: $CURRENT_DIR${NC}"
    read -p "Devam etmek istiyor musunuz? (e/h): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ee]$ ]]; then
        exit 1
    fi
fi

# Gerekli dizinleri oluştur
echo "📁 Backend dizinleri oluşturuluyor..."
mkdir -p certs
mkdir -p logs/nginx
mkdir -p backups
mkdir -p uploads
mkdir -p logs

# Environment dosyası kontrolü
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env dosyası bulunamadı. Örnek dosya oluşturuluyor...${NC}"
    cat > .env << EOL
# Backend Environment Variables
DB_PASSWORD=secure-db-password-$(openssl rand -hex 16)
JWT_SECRET=secure-jwt-secret-$(openssl rand -hex 32)
CORS_ORIGIN=https://ogsiparis.com
API_URL=https://api.ogsiparis.com
EOL
    echo -e "${GREEN}✅ .env dosyası oluşturuldu. Lütfen şifreleri güncelleyin!${NC}"
fi

# Backend .env.production kontrolü
if [ ! -f ".env.production" ]; then
    echo -e "${YELLOW}⚠️  .env.production dosyası bulunamadı. Örnek dosya oluşturuluyor...${NC}"
    
    # .env dosyasından değerleri al
    if [ -f ".env" ]; then
        DB_PASSWORD=$(grep "DB_PASSWORD=" .env | cut -d '=' -f2)
        JWT_SECRET=$(grep "JWT_SECRET=" .env | cut -d '=' -f2)
        CORS_ORIGIN=$(grep "CORS_ORIGIN=" .env | cut -d '=' -f2)
        API_URL=$(grep "API_URL=" .env | cut -d '=' -f2)
    else
        DB_PASSWORD="secure-db-password-$(openssl rand -hex 16)"
        JWT_SECRET="secure-jwt-secret-$(openssl rand -hex 32)"
        CORS_ORIGIN="https://ogsiparis.com"
        API_URL="https://api.ogsiparis.com"
    fi

    cat > .env.production << EOL
# OG Backend API - Production Environment
NODE_ENV=production
DATABASE_URL="postgresql://ogform:${DB_PASSWORD}@database:5432/ogformdb?schema=public"
JWT_SECRET="${JWT_SECRET}"
CORS_ORIGIN="${CORS_ORIGIN}"
NEXT_PUBLIC_API_URL="${API_URL}"

# SMS Settings (opsiyonel)
SMS_API_KEY=""
SMS_API_SECRET=""
SMS_SENDER=""

# WhatsApp Settings (opsiyonel)
WHATSAPP_API_URL=""
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""
EOL
    echo -e "${GREEN}✅ .env.production oluşturuldu${NC}"
fi

# Backup script oluştur
if [ ! -f "backup-script.sh" ]; then
    cat > backup-script.sh << 'EOL'
#!/bin/bash
# Database Backup Script
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ogformdb_$DATE.sql"

echo "Starting database backup..."
pg_dump -h database -U ogform -d ogformdb > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    gzip "$BACKUP_FILE"
    echo "Backup completed: ${BACKUP_FILE}.gz"
    
    # Clean old backups (keep last 7 days)
    find "$BACKUP_DIR" -name "ogformdb_*.sql.gz" -mtime +7 -delete
    echo "Old backups cleaned up"
else
    echo "Backup failed!"
    exit 1
fi
EOL
    chmod +x backup-script.sh
    echo -e "${GREEN}✅ Backup script oluşturuldu${NC}"
fi

# Docker kurulum kontrolü
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker kurulu değil! Lütfen önce Docker'ı kurun.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose kurulu değil! Lütfen önce Docker Compose'u kurun.${NC}"
    exit 1
fi

# Docker servis kontrolü
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker servisi çalışmıyor!${NC}"
    echo "Başlatmak için: sudo systemctl start docker"
    exit 1
fi

# Mevcut container'ları durdur
echo "🛑 Mevcut backend container'ları durduruluyor..."
docker-compose down || true

# Docker image'ları build et
echo "🔨 Backend Docker image'ları build ediliyor..."
docker-compose build --no-cache

# Database ve Backend servislerini başlat
echo "🚀 Backend servisleri başlatılıyor..."
docker-compose up -d database backend nginx

# Container durumlarını kontrol et
echo "📊 Container durumları kontrol ediliyor..."
sleep 15
docker-compose ps

# Database health check
echo "🏥 Database health check yapılıyor..."
for i in {1..30}; do
    if docker exec og-backend-database pg_isready -U ogform -d ogformdb > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Database çalışıyor!${NC}"
        break
    else
        echo "⏳ Database başlatılıyor... ($i/30)"
        sleep 2
    fi
done

# Backend API health check
echo "🏥 Backend API health check yapılıyor..."
for i in {1..60}; do
    if curl -s http://localhost:3000/api/dropdown > /dev/null; then
        echo -e "${GREEN}✅ Backend API çalışıyor!${NC}"
        break
    else
        echo "⏳ Backend API başlatılıyor... ($i/60)"
        sleep 3
    fi
done

# Nginx health check
echo "🏥 Nginx health check yapılıyor..."
if curl -s http://localhost:3080/health > /dev/null; then
    echo -e "${GREEN}✅ Nginx API Gateway çalışıyor!${NC}"
else
    echo -e "${RED}❌ Nginx API Gateway erişilemiyor!${NC}"
fi

# SSL Sertifikası hatırlatması
echo ""
echo -e "${YELLOW}📌 SSL Sertifikası Kurulumu:${NC}"
echo "1. Let's Encrypt ile ücretsiz SSL:"
echo "   sudo certbot certonly --webroot -w /var/www/certbot -d api.ogsiparis.com"
echo ""
echo "2. Sertifikaları certs/ dizinine kopyalayın:"
echo "   sudo cp /etc/letsencrypt/live/api.ogsiparis.com/fullchain.pem ./certs/"
echo "   sudo cp /etc/letsencrypt/live/api.ogsiparis.com/privkey.pem ./certs/"
echo ""
echo "3. nginx konteynerini yeniden başlatın:"
echo "   docker-compose restart nginx"
echo ""

# Backup service başlatma hatırlatması
echo -e "${YELLOW}📌 Backup Service:${NC}"
echo "Otomatik backup'ı başlatmak için:"
echo "   docker-compose --profile backup up -d backup"
echo ""

echo ""
echo -e "${GREEN}🎉 Backend + Database Deployment tamamlandı!${NC}"
echo ""
echo "📝 Backend Bilgileri:"
echo "   - Backend API: http://localhost:3000"
echo "   - API Gateway (HTTP): http://localhost:3080"
echo "   - API Gateway (HTTPS): https://api.ogsiparis.com:3443"
echo "   - Database: localhost:5432"
echo "   - Health Check: http://localhost:3080/health"
echo ""
echo "🔧 Yönetim Komutları:"
echo "   - Logları görüntüle: docker-compose logs -f"
echo "   - Restart: docker-compose restart"
echo "   - Durdur: docker-compose down"
echo "   - Database backup: docker-compose exec backup /backup-script.sh"
echo "   - Database connect: docker-compose exec database psql -U ogform -d ogformdb"
echo ""
echo "🔒 Güvenlik Önerileri:"
echo "   1. SSL sertifikası kurun"
echo "   2. .env dosyalarındaki şifreleri güncelleyin"
echo "   3. Firewall kurallarını ayarlayın"
echo "   4. Regular backup alın"
echo ""