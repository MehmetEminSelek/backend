#!/usr/bin/env node
// =================================================================
// 🚀 OG SİPARİŞ - HOSTINGER API DEPLOYMENT SCRIPT
// Terminal SSH sorunlarını bypass ederek API üzerinden deployment
// =================================================================

const https = require('https');
const fs = require('fs');

// Configuration
const CONFIG = {
    apiKey: '7m5Ge2ngPg4FrBy269otbsZF335XGBQrpi1IOKO1b0f25e37',
    apiBaseUrl: 'https://api.hostinger.com/v1',
    domain: 'ogsiparis.com',
    vpsIp: '147.93.123.161',
    backendPort: 3000,
    frontendPort: 5173,
    dbName: 'ogformdb',
    dbUser: 'ogform'
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// API Request Helper
function apiRequest(endpoint, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, CONFIG.apiBaseUrl);

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Authorization': `Bearer ${CONFIG.apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'OG-Siparis-Deployment/1.0'
            }
        };

        if (data && method !== 'GET') {
            const jsonData = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(jsonData);
        }

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`API Error: ${res.statusCode} - ${parsed.message || responseData}`));
                    }
                } catch (e) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(responseData);
                    } else {
                        reject(new Error(`Parse Error: ${e.message} - Response: ${responseData}`));
                    }
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Request Error: ${error.message}`));
        });

        if (data && method !== 'GET') {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

// VPS Information
async function getVPSInfo() {
    try {
        log('📊 VPS bilgileri alınıyor...', 'blue');
        const vpsData = await apiRequest('/vps');

        if (vpsData && vpsData.data) {
            log('✅ VPS bilgileri başarıyla alındı', 'green');
            return vpsData.data;
        }

        log('❌ VPS bulunamadı', 'red');
        return null;
    } catch (error) {
        log(`❌ VPS bilgisi alınamadı: ${error.message}`, 'red');
        return null;
    }
}

// Execute Command via API (if supported)
async function executeCommand(vpsId, command) {
    try {
        log(`🔧 Komut çalıştırılıyor: ${command}`, 'yellow');

        const result = await apiRequest(`/vps/${vpsId}/execute`, 'POST', {
            command: command,
            timeout: 300
        });

        log('✅ Komut başarıyla çalıştırıldı', 'green');
        return result;
    } catch (error) {
        log(`❌ Komut çalıştırılamadı: ${error.message}`, 'red');

        // Fallback: Generate script for manual execution
        return { fallback: true, command: command };
    }
}

// Generate Deployment Commands
function generateDeploymentCommands() {
    const dbPass = Math.random().toString(36).substring(2, 15);

    return [
        // System Update
        'dnf update -y',
        'dnf install -y curl wget git postgresql postgresql-server postgresql-contrib',

        // Node.js Installation
        'curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -',
        'dnf install -y nodejs',
        'npm install -g pm2',

        // PostgreSQL Setup
        'postgresql-setup --initdb',
        'systemctl enable postgresql',
        'systemctl start postgresql',

        // Database Creation
        `sudo -u postgres psql -c "CREATE DATABASE ${CONFIG.dbName};"`,
        `sudo -u postgres psql -c "CREATE USER ${CONFIG.dbUser} WITH ENCRYPTED PASSWORD '${dbPass}';"`,
        `sudo -u postgres psql -c "ALTER ROLE ${CONFIG.dbUser} SET client_encoding TO 'utf8';"`,
        `sudo -u postgres psql -c "ALTER ROLE ${CONFIG.dbUser} SET default_transaction_isolation TO 'read committed';"`,
        `sudo -u postgres psql -c "ALTER ROLE ${CONFIG.dbUser} SET timezone TO 'UTC';"`,
        `sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${CONFIG.dbName} TO ${CONFIG.dbUser};"`,

        // Backend Deployment
        `mkdir -p /home/${CONFIG.domain}/public_html/backend`,
        `cd /home/${CONFIG.domain}/public_html/backend`,
        'git clone https://github.com/MehmetEminSelek/ogBackend.git .',
        'npm install',

        // Backend .env Creation
        `cat > .env << 'EOF'
NODE_ENV=production
PORT=${CONFIG.backendPort}
DATABASE_URL="postgresql://${CONFIG.dbUser}:${dbPass}@localhost:5432/${CONFIG.dbName}?schema=public"
JWT_SECRET="og-siparis-super-secret-jwt-key-production-$(date +%s)"
NEXT_PUBLIC_API_URL=https://${CONFIG.domain}/api
CORS_ORIGIN=https://${CONFIG.domain}
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=admin@${CONFIG.domain}
SMTP_PASS=your-email-password
MAX_FILE_SIZE=10MB
UPLOAD_DIR=./uploads
BCRYPT_ROUNDS=12
EOF`,

        // Prisma Setup
        'npx prisma generate',
        'npx prisma db push',
        'npm run build',

        // Frontend Deployment
        `mkdir -p /home/${CONFIG.domain}/public_html/frontend`,
        `cd /home/${CONFIG.domain}/public_html/frontend`,
        'git clone https://github.com/MehmetEminSelek/ogFrontend.git .',
        'npm install',

        // Frontend .env Creation
        `cat > .env.production << 'EOF'
NEXT_PUBLIC_API_URL=https://${CONFIG.domain}/api
NEXT_PUBLIC_SITE_URL=https://${CONFIG.domain}
NODE_ENV=production
EOF`,

        'npm run build',

        // PM2 Configuration
        `cd /home/${CONFIG.domain}/public_html/backend`,
        'pm2 start npm --name "og-backend" -- start',

        `cd /home/${CONFIG.domain}/public_html/frontend`,
        `pm2 start npm --name "og-frontend" -- start -- -p ${CONFIG.frontendPort}`,

        'pm2 save',
        'pm2 startup',

        // Firewall
        'firewall-cmd --permanent --add-service=http',
        'firewall-cmd --permanent --add-service=https',
        `firewall-cmd --permanent --add-port=${CONFIG.backendPort}/tcp`,
        `firewall-cmd --permanent --add-port=${CONFIG.frontendPort}/tcp`,
        'firewall-cmd --reload'
    ];
}

// Main Deployment Function
async function deployApplication() {
    log('🚀 OG Sipariş Hostinger API Deployment Başlıyor...', 'cyan');
    log('═══════════════════════════════════════════════════', 'cyan');

    // Get VPS Information
    const vpsInfo = await getVPSInfo();
    if (!vpsInfo) {
        log('❌ VPS bilgisi alınamadı, manuel deployment gerekebilir', 'red');
    }

    // Generate Commands
    const commands = generateDeploymentCommands();
    log(`📝 ${commands.length} komut hazırlandı`, 'blue');

    // Try to execute via API
    const results = [];
    let fallbackCommands = [];

    for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        log(`\n[${i + 1}/${commands.length}] İşleniyor...`, 'yellow');

        if (vpsInfo && vpsInfo[0] && vpsInfo[0].id) {
            const result = await executeCommand(vpsInfo[0].id, command);
            results.push(result);

            if (result.fallback) {
                fallbackCommands.push(command);
            }
        } else {
            fallbackCommands.push(command);
        }

        // Kısa bekleme (API rate limiting için)
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Generate Fallback Script
    if (fallbackCommands.length > 0) {
        log('\n📄 API üzerinden çalıştırılamayan komutlar için script oluşturuluyor...', 'yellow');

        const scriptContent = `#!/bin/bash
# =================================================================
# 🚀 OG SİPARİŞ - HOSTINGER VPS DEPLOYMENT SCRIPT
# Generated by Hostinger API Deployment Tool
# =================================================================

set -e

echo "🚀 OG Sipariş Deployment Başlıyor..."

${fallbackCommands.join('\n\n')}

echo ""
echo "🎉 DEPLOYMENT TAMAMLANDI!"
echo "🌐 Website: https://${CONFIG.domain}"
echo "🔗 API: https://${CONFIG.domain}/api"
echo "🎛️ CyberPanel: https://${CONFIG.vpsIp}:8090"
echo ""
echo "📊 PM2 durumu kontrol edin: pm2 list"
echo "📜 PM2 logları: pm2 logs"
echo ""
echo "✅ Siteniz hazır: https://${CONFIG.domain}"
`;

        fs.writeFileSync('hostinger-deployment-script.sh', scriptContent);
        log('✅ hostinger-deployment-script.sh dosyası oluşturuldu', 'green');
        log('📋 Bu script\'i VPS\'te çalıştırın:', 'blue');
        log('   chmod +x hostinger-deployment-script.sh', 'cyan');
        log('   ./hostinger-deployment-script.sh', 'cyan');
    }

    // Summary
    log('\n═══════════════════════════════════════════════════', 'cyan');
    log('🎉 DEPLOYMENT SÜRECİ TAMAMLANDI!', 'green');
    log(`🌐 Website: https://${CONFIG.domain}`, 'blue');
    log(`🔗 API: https://${CONFIG.domain}/api`, 'blue');
    log(`🎛️ CyberPanel: https://${CONFIG.vpsIp}:8090`, 'blue');
    log('═══════════════════════════════════════════════════', 'cyan');

    return {
        success: true,
        apiResults: results,
        fallbackScript: fallbackCommands.length > 0 ? 'hostinger-deployment-script.sh' : null,
        commands: commands.length,
        fallbacks: fallbackCommands.length
    };
}

// Error Handler
process.on('unhandledRejection', (reason, promise) => {
    log(`❌ Unhandled Rejection: ${reason}`, 'red');
    process.exit(1);
});

// Run Deployment
if (require.main === module) {
    deployApplication()
        .then((result) => {
            log('\n✅ Deployment scripti başarıyla çalıştırıldı', 'green');
            if (result.fallbackScript) {
                log(`📋 ${result.fallbacks} komut için manuel script oluşturuldu: ${result.fallbackScript}`, 'yellow');
            }
            process.exit(0);
        })
        .catch((error) => {
            log(`❌ Deployment hatası: ${error.message}`, 'red');
            process.exit(1);
        });
}

module.exports = { deployApplication, apiRequest, CONFIG }; 