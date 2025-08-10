#!/bin/bash

# Full Deployment Script for Hostinger (Backend + Frontend)
# Usage: bash deploy-full.sh [--domain yourdomain.com] [--backend-only] [--frontend-only]

set -e

echo "🚀 Starting Full Deployment for Hostinger..."

# Parse arguments
DOMAIN=""
BACKEND_ONLY=false
FRONTEND_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --backend-only)
            BACKEND_ONLY=true
            shift
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
        *)
            echo "Unknown option $1"
            echo "Usage: $0 [--domain yourdomain.com] [--backend-only] [--frontend-only]"
            exit 1
            ;;
    esac
done

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Auto-detect domain if not provided
if [ -z "$DOMAIN" ]; then
    PROJECT_PATH=$(dirname $(dirname "$SCRIPT_DIR"))
    if [[ "$PROJECT_PATH" == *"/var/www/"* ]]; then
        DOMAIN=$(echo "$PROJECT_PATH" | sed 's|/var/www/||' | cut -d'/' -f1)
        echo "🔍 Auto-detected domain: $DOMAIN"
    fi
fi

# Deploy backend
if [ "$FRONTEND_ONLY" != true ]; then
    echo ""
    echo "🔧 Deploying Backend..."
    bash "$SCRIPT_DIR/deploy-backend.sh"
fi

# Deploy frontend
if [ "$BACKEND_ONLY" != true ]; then
    echo ""
    echo "🎨 Deploying Frontend..."
    if [ ! -z "$DOMAIN" ]; then
        bash "$SCRIPT_DIR/deploy-frontend.sh" --domain "$DOMAIN"
    else
        bash "$SCRIPT_DIR/deploy-frontend.sh"
    fi
fi

echo ""
echo "🎉 Full deployment completed successfully!"
[ ! -z "$DOMAIN" ] && echo "🌐 Application available at: http://$DOMAIN"
echo "🔧 Backend API: http://127.0.0.1:3000"

echo ""
echo "📋 Post-deployment checklist:"
echo "  ✓ Backend health check"
echo "  ✓ Frontend build and deployment"
[ ! -z "$DOMAIN" ] && echo "  ✓ Nginx configuration"
echo "  📝 TODO: SSL certificate (run: certbot --nginx -d $DOMAIN)"
echo "  📝 TODO: Configure firewall rules if needed"
echo ""
echo "🔍 Monitoring commands:"
echo "  pm2 status              # Check backend status"
echo "  pm2 logs og-backend     # View backend logs"
echo "  nginx -t                # Test nginx config"
echo "  systemctl status nginx  # Check nginx status"
