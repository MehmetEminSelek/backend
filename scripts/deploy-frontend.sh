#!/bin/bash

# Frontend Deployment Script for Hostinger
# Usage: bash deploy-frontend.sh [--domain yourdomain.com]

set -e

echo "🚀 Starting Frontend Deployment..."

# Parse arguments
DOMAIN=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        *)
            echo "Unknown option $1"
            exit 1
            ;;
    esac
done

# Get current directory and paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$BACKEND_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo "📂 Frontend directory: $FRONTEND_DIR"
echo "📂 Project root: $PROJECT_ROOT"

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    echo "❌ Frontend directory not found: $FRONTEND_DIR"
    exit 1
fi

# Navigate to frontend directory
cd "$FRONTEND_DIR"

# Install dependencies
echo "📦 Installing frontend dependencies..."
npm ci --silent

# Build frontend
echo "🔨 Building frontend..."
npm run build

# Copy build files to web root
WEB_ROOT="/var/www/$DOMAIN"
if [ -z "$DOMAIN" ]; then
    # Auto-detect domain from current path
    if [[ "$PROJECT_ROOT" == *"/var/www/"* ]]; then
        DOMAIN=$(echo "$PROJECT_ROOT" | sed 's|/var/www/||' | cut -d'/' -f1)
        WEB_ROOT="/var/www/$DOMAIN"
    else
        WEB_ROOT="$PROJECT_ROOT"
    fi
fi

echo "🌐 Deploying to: $WEB_ROOT"

# Backup existing files
if [ -d "$WEB_ROOT/assets" ]; then
    echo "💾 Backing up existing files..."
    mkdir -p "$WEB_ROOT/backup-$(date +%Y%m%d-%H%M%S)"
    cp -r "$WEB_ROOT"/index.html "$WEB_ROOT"/assets "$WEB_ROOT/backup-$(date +%Y%m%d-%H%M%S)/" 2>/dev/null || true
fi

# Copy built files
echo "📁 Copying built files..."
cp -r dist/* "$WEB_ROOT/"

# Ensure proper permissions
echo "🔒 Setting permissions..."
chown -R nobody:nobody "$WEB_ROOT"
find "$WEB_ROOT" -type f -exec chmod 644 {} \;
find "$WEB_ROOT" -type d -exec chmod 755 {} \;

# Configure Nginx if needed
NGINX_AVAILABLE="/etc/nginx/sites-available/$DOMAIN"
NGINX_ENABLED="/etc/nginx/sites-enabled/$DOMAIN"

if [ ! -z "$DOMAIN" ] && [ ! -f "$NGINX_AVAILABLE" ]; then
    echo "🔧 Creating Nginx configuration..."
    cat > "$NGINX_AVAILABLE" << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    root $WEB_ROOT;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Main location
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy to backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
EOF

    # Enable site
    ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
    
    echo "🔄 Reloading Nginx..."
    nginx -t && systemctl reload nginx
    
    echo "📝 SSL Certificate setup:"
    echo "   Run: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# Test deployment
echo "🏥 Testing deployment..."
if [ ! -z "$DOMAIN" ]; then
    if curl -f -s "http://$DOMAIN" > /dev/null; then
        echo "✅ Frontend deployment successful!"
        echo "🌐 Frontend available at: http://$DOMAIN"
    else
        echo "⚠️  Frontend deployed but HTTP test failed"
    fi
else
    echo "✅ Frontend files deployed successfully!"
fi

echo ""
echo "🎉 Frontend deployment completed!"
echo "📁 Files deployed to: $WEB_ROOT"
[ ! -z "$DOMAIN" ] && echo "🌐 Domain: http://$DOMAIN"

