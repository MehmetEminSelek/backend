// ===================================================================
// 🚀 PM2 ECOSYSTEM CONFIG - OG Siparis Backend + Webhook
// Backend klasöründen çalışacak şekilde yapılandırıldı
// ===================================================================

module.exports = {
    apps: [{
        name: 'og-backend',
        script: 'server.js',
        instances: 'max',
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000,
            DATABASE_URL: process.env.DATABASE_URL
        },
        error_file: '/var/log/pm2/og-backend-error.log',
        out_file: '/var/log/pm2/og-backend-out.log',
        log_file: '/var/log/pm2/og-backend.log',
        time: true,
        watch: false,
        max_restarts: 10,
        restart_delay: 5000,
        min_uptime: '10s',
        max_memory_restart: '1G',
        autorestart: true,
        // Graceful shutdown
        kill_timeout: 5000,
        listen_timeout: 8000,
        // Health monitoring
        health_check_grace_period: 3000,
        health_check_interval: 30000,
        // Log settings
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        // Process management
        exp_backoff_restart_delay: 100
    }]
}; 