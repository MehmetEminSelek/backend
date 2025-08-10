#!/bin/bash

# Backend Deployment Script for Hostinger
# Usage: bash deploy-backend.sh

set -e

echo "🚀 Starting Backend Deployment..."

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo "📂 Backend directory: $BACKEND_DIR"

# Navigate to backend directory
cd "$BACKEND_DIR"

# Stop existing PM2 processes
echo "⏹️  Stopping existing PM2 processes..."
pm2 stop og-backend || echo "No existing processes to stop"
pm2 delete og-backend || echo "No existing processes to delete"

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --omit=dev --silent

# Copy production environment
if [ -f ".env.production" ]; then
    echo "🔧 Copying production environment..."
    cp .env.production .env
else
    echo "⚠️  Warning: .env.production not found!"
fi

# Generate Prisma client
echo "🛠️  Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "🗄️  Running database migrations..."
npx prisma migrate deploy

# Check if this is a fresh installation (no data)
USER_COUNT=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) as count FROM \"User\";" | grep -o '[0-9]*' | tail -1)

if [ "$USER_COUNT" = "0" ]; then
    echo "🌱 Fresh installation detected, seeding database..."
    
    # Seed basic data
    echo "  📋 Seeding materials..."
    node prisma/seeds/seed-materials-from-csv.cjs || echo "Materials already exist"
    
    echo "  📦 Seeding default stock..."
    node prisma/seeds/seed-stok-default-5ton.cjs || echo "Stock already set"
    
    echo "  🥘 Seeding recipes..."
    node prisma/seeds/seed-receteler.cjs || echo "Recipes already exist"
    
    echo "  🔗 Linking products to recipes..."
    node prisma/seeds/seed-urun-recete-eslestir.cjs || echo "Links already exist"
    
    echo "  📦 Seeding demo containers..."
    node prisma/seeds/seed-tepsi-kutu-demo.cjs || echo "Containers already exist"
    
    echo "  📋 Seeding demo orders..."
    node prisma/seeds/seed-siparis-demo.cjs || echo "Orders already exist"
    
    echo "  💰 Seeding demo payments..."
    node prisma/seeds/seed-odemeler-demo.cjs || echo "Payments already exist"
else
    echo "📊 Existing data found ($USER_COUNT users), skipping seeding"
fi

# Build the project
echo "🔨 Building project..."
npm run build

# Start with PM2
echo "🚀 Starting with PM2..."
pm2 start ecosystem.config.js --env production
pm2 save

# Health check
echo "🏥 Performing health check..."
sleep 5
if curl -f http://127.0.0.1:3000/api/health; then
    echo ""
    echo "✅ Backend deployment successful!"
    echo "🌐 Backend running on: http://127.0.0.1:3000"
else
    echo ""
    echo "❌ Health check failed!"
    echo "📋 PM2 status:"
    pm2 status
    echo "📋 Recent logs:"
    pm2 logs og-backend --lines 20
    exit 1
fi

echo ""
echo "🎉 Backend deployment completed successfully!"
