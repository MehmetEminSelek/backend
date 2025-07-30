#!/bin/bash
# =================================================================
# 🔧 OG SİPARİŞ - ENVIRONMENT CONFIGURATION HELPER
# Production ve Development ortamları otomatik ayarlama
# =================================================================

DOMAIN=${1:-"ogsiparis.com"}
ENV=${2:-"production"}

echo "🔧 Environment ayarlanıyor: $ENV için $DOMAIN"

# =================================================================
# BACKEND .ENV CONFIGURATION
# =================================================================
create_backend_env() {
    local env_type=$1
    local domain=$2
    
    if [ "$env_type" = "development" ]; then
        # Development Environment
        cat > .env << EOF
# OG Backend API - Development Environment
NODE_ENV=development
PORT=3000

# Database Configuration (Local)
DATABASE_URL="postgresql://ogform:secret@localhost:5432/ogformdb?schema=public"

# JWT Secret
JWT_SECRET="og-siparis-dev-secret-2024"

# API Domain Configuration (Development)
NEXT_PUBLIC_API_URL=http://localhost:3000/api
CORS_ORIGIN=http://localhost:5173

# Email Configuration (Development - Test Mode)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=admin@$domain
SMTP_PASS=your-email-password

# File Upload
MAX_FILE_SIZE=10MB
UPLOAD_DIR=./uploads

# Security
BCRYPT_ROUNDS=8
EOF
    else
        # Production Environment
        local db_pass="${3:-$(openssl rand -base64 32)}"
        cat > .env << EOF
# OG Backend API - Production Environment
NODE_ENV=production
PORT=3000

# Database Configuration (Production)
DATABASE_URL="postgresql://ogform:$db_pass@localhost:5432/ogformdb?schema=public"

# JWT Secret
JWT_SECRET="og-siparis-super-secret-jwt-key-production-$(date +%s)"

# API Domain Configuration (Production)
NEXT_PUBLIC_API_URL=https://$domain/api
CORS_ORIGIN=https://$domain

# Email Configuration (Hostinger SMTP)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=admin@$domain
SMTP_PASS=your-email-password

# File Upload
MAX_FILE_SIZE=10MB
UPLOAD_DIR=./uploads

# Security
BCRYPT_ROUNDS=12
EOF
    fi
}

# =================================================================
# FRONTEND .ENV CONFIGURATION
# =================================================================
create_frontend_env() {
    local env_type=$1
    local domain=$2
    
    if [ "$env_type" = "development" ]; then
        # Development Environment
        cat > .env.local << EOF
# Frontend Development Environment
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_SITE_URL=http://localhost:5173
NODE_ENV=development
EOF
        
        cat > .env.development << EOF
# Frontend Development Environment
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_SITE_URL=http://localhost:5173
NODE_ENV=development
EOF
    else
        # Production Environment
        cat > .env.production << EOF
# Frontend Production Environment
NEXT_PUBLIC_API_URL=https://$domain/api
NEXT_PUBLIC_SITE_URL=https://$domain
NODE_ENV=production
EOF
        
        cat > .env.local << EOF
# Frontend Production Environment
NEXT_PUBLIC_API_URL=https://$domain/api
NEXT_PUBLIC_SITE_URL=https://$domain
NODE_ENV=production
EOF
    fi
}

# =================================================================
# PACKAGE.JSON UPDATE SCRIPTS
# =================================================================
update_package_scripts() {
    local env_type=$1
    
    if [ "$env_type" = "development" ]; then
        # Development scripts
        echo "📦 Development scripts güncelleniyor..."
        
        # Backend package.json'a development scriptleri ekle
        cat >> package.json.tmp << 'EOF'
  "scripts": {
    "dev": "NODE_ENV=development node server.js",
    "dev:nextjs": "next dev",
    "build": "next build",
    "start": "NODE_ENV=production node server.js",
    "start:dev": "NODE_ENV=development node server.js",
    "start:prod": "NODE_ENV=production node server.js",
    "dev:frontend": "cd ../og-frontend && npm run dev",
    "dev:full": "concurrently \"npm run dev\" \"npm run dev:frontend\"",
    "generate": "prisma generate",
    "pull": "prisma db pull",
    "postinstall": "prisma generate"
  }
EOF
    fi
}

# =================================================================
# MAIN EXECUTION
# =================================================================
case "$ENV" in
    "development")
        echo "🔧 Development environment ayarlanıyor..."
        create_backend_env "development" "$DOMAIN"
        create_frontend_env "development" "$DOMAIN"
        ;;
    "production")
        echo "🔧 Production environment ayarlanıyor..."
        create_backend_env "production" "$DOMAIN" "$3"
        create_frontend_env "production" "$DOMAIN"
        ;;
    *)
        echo "❌ Geçersiz environment: $ENV"
        echo "Kullanım: ./env-config.sh [domain] [development|production] [db_password]"
        exit 1
        ;;
esac

echo "✅ Environment configuration tamamlandı: $ENV"
echo "📁 .env dosyaları oluşturuldu"
echo ""
echo "🔄 Kullanım:"
echo "  Development: ./env-config.sh ogsiparis.com development"
echo "  Production:  ./env-config.sh ogsiparis.com production" 