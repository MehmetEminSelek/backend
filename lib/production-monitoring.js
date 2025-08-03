/**
 * =====================================================
 * ENTERPRISE PRODUCTION MONITORING SYSTEM
 * Real-time Performance & Health Monitoring
 * =====================================================
 */

import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { EventEmitter } from 'events';

class ProductionMonitoring extends EventEmitter {
    constructor() {
        super();
        this.monitoringId = crypto.randomUUID();
        this.startTime = Date.now();
        this.metrics = {
            requests: {
                total: 0,
                successful: 0,
                failed: 0,
                averageResponseTime: 0,
                responseTimeHistory: []
            },
            system: {
                cpuUsage: 0,
                memoryUsage: 0,
                diskUsage: 0,
                uptime: 0
            },
            database: {
                connections: 0,
                queries: 0,
                slowQueries: 0,
                averageQueryTime: 0
            },
            errors: {
                total: 0,
                byType: {},
                recent: []
            },
            alerts: []
        };

        this.thresholds = {
            responseTime: 5000, // 5 seconds
            errorRate: 0.05, // 5%
            cpuUsage: 80, // 80%
            memoryUsage: 85, // 85%
            diskUsage: 90, // 90%
            slowQueryTime: 1000 // 1 second
        };

        this.collectors = [];
        this.alertHandlers = [];
        this.isRunning = false;

        this.initializeCollectors();
        this.setupAlertHandlers();
    }

    /**
     * Initialize all metric collectors
     */
    initializeCollectors() {
        // System metrics collector
        this.collectors.push({
            name: 'system',
            interval: 30000, // 30 seconds
            collect: () => this.collectSystemMetrics()
        });

        // Database metrics collector
        this.collectors.push({
            name: 'database',
            interval: 60000, // 1 minute
            collect: () => this.collectDatabaseMetrics()
        });

        // Error metrics collector
        this.collectors.push({
            name: 'errors',
            interval: 10000, // 10 seconds
            collect: () => this.processErrorMetrics()
        });

        // Performance metrics collector
        this.collectors.push({
            name: 'performance',
            interval: 15000, // 15 seconds
            collect: () => this.analyzePerformance()
        });
    }

    /**
     * Setup alert handlers for different channels
     */
    setupAlertHandlers() {
        // Console alert handler
        this.alertHandlers.push({
            name: 'console',
            handle: (alert) => {
                const emoji = this.getAlertEmoji(alert.severity);
                console.log(`${emoji} ALERT [${alert.severity}]: ${alert.message}`);
                console.log(`   Time: ${alert.timestamp}`);
                console.log(`   Metric: ${alert.metric} = ${alert.value}`);
                console.log(`   Threshold: ${alert.threshold}`);
            }
        });

        // File alert handler
        this.alertHandlers.push({
            name: 'file',
            handle: (alert) => {
                const alertLog = `${alert.timestamp} [${alert.severity}] ${alert.message}\n`;
                fs.appendFileSync('./logs/alerts.log', alertLog);
            }
        });

        // Event emission for external handlers
        this.alertHandlers.push({
            name: 'event',
            handle: (alert) => {
                this.emit('alert', alert);
            }
        });
    }

    /**
     * Start monitoring system
     */
    start() {
        if (this.isRunning) return;

        console.log(`🚀 Starting Production Monitoring System (ID: ${this.monitoringId})`);

        // Ensure logs directory exists
        fs.mkdirSync('./logs', { recursive: true });

        // Start all collectors
        this.collectors.forEach(collector => {
            collector.intervalId = setInterval(() => {
                try {
                    collector.collect();
                } catch (error) {
                    console.error(`Error in ${collector.name} collector:`, error);
                }
            }, collector.interval);

            console.log(`📊 Started ${collector.name} collector (${collector.interval}ms interval)`);
        });

        // Initial metrics collection
        this.collectAllMetrics();

        this.isRunning = true;
        console.log('✅ Production monitoring system started');
    }

    /**
     * Stop monitoring system
     */
    stop() {
        if (!this.isRunning) return;

        console.log('⏹️ Stopping Production Monitoring System...');

        // Stop all collectors
        this.collectors.forEach(collector => {
            if (collector.intervalId) {
                clearInterval(collector.intervalId);
                delete collector.intervalId;
            }
        });

        this.isRunning = false;
        console.log('✅ Production monitoring system stopped');
    }

    /**
     * Request monitoring middleware
     */
    requestMiddleware() {
        return (req, res, next) => {
            const startTime = Date.now();
            const requestId = crypto.randomUUID();

            // Add monitoring context to request
            req.monitoring = {
                requestId,
                startTime,
                path: req.path,
                method: req.method,
                userAgent: req.headers['user-agent'],
                ip: req.ip
            };

            // Monitor response completion
            res.on('finish', () => {
                const endTime = Date.now();
                const responseTime = endTime - startTime;

                this.recordRequestMetrics({
                    requestId,
                    path: req.path,
                    method: req.method,
                    statusCode: res.statusCode,
                    responseTime,
                    success: res.statusCode < 400,
                    timestamp: new Date().toISOString()
                });
            });

            next();
        };
    }

    /**
     * Record request metrics
     */
    recordRequestMetrics(requestData) {
        this.metrics.requests.total++;

        if (requestData.success) {
            this.metrics.requests.successful++;
        } else {
            this.metrics.requests.failed++;
        }

        // Update response time metrics
        this.metrics.requests.responseTimeHistory.push(requestData.responseTime);

        // Keep only last 1000 response times for memory efficiency
        if (this.metrics.requests.responseTimeHistory.length > 1000) {
            this.metrics.requests.responseTimeHistory.shift();
        }

        this.metrics.requests.averageResponseTime =
            this.metrics.requests.responseTimeHistory.reduce((a, b) => a + b, 0) /
            this.metrics.requests.responseTimeHistory.length;

        // Check for slow requests
        if (requestData.responseTime > this.thresholds.responseTime) {
            this.triggerAlert({
                type: 'slow_request',
                severity: 'warning',
                message: `Slow request detected: ${requestData.method} ${requestData.path}`,
                metric: 'response_time',
                value: requestData.responseTime,
                threshold: this.thresholds.responseTime,
                data: requestData
            });
        }

        // Check error rate
        const errorRate = this.metrics.requests.failed / this.metrics.requests.total;
        if (errorRate > this.thresholds.errorRate) {
            this.triggerAlert({
                type: 'high_error_rate',
                severity: 'critical',
                message: `High error rate detected: ${(errorRate * 100).toFixed(2)}%`,
                metric: 'error_rate',
                value: errorRate,
                threshold: this.thresholds.errorRate
            });
        }
    }

    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;

        this.metrics.system = {
            cpuUsage: this.getCPUUsage(),
            memoryUsage: (usedMemory / totalMemory) * 100,
            diskUsage: this.getDiskUsage(),
            uptime: process.uptime(),
            processMemory: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external
            }
        };

        // Check system thresholds
        this.checkSystemThresholds();
    }

    /**
     * Get CPU usage percentage
     */
    getCPUUsage() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        const usage = 100 - ~~(100 * idle / total);

        return usage;
    }

    /**
     * Get disk usage (simplified for demo)
     */
    getDiskUsage() {
        try {
            const stats = fs.statSync('./');
            // This is a simplified implementation
            // In production, you'd use a proper disk usage library
            return 45; // Placeholder percentage
        } catch (error) {
            return 0;
        }
    }

    /**
     * Check system resource thresholds
     */
    checkSystemThresholds() {
        const { cpuUsage, memoryUsage, diskUsage } = this.metrics.system;

        if (cpuUsage > this.thresholds.cpuUsage) {
            this.triggerAlert({
                type: 'high_cpu',
                severity: 'warning',
                message: `High CPU usage detected: ${cpuUsage.toFixed(2)}%`,
                metric: 'cpu_usage',
                value: cpuUsage,
                threshold: this.thresholds.cpuUsage
            });
        }

        if (memoryUsage > this.thresholds.memoryUsage) {
            this.triggerAlert({
                type: 'high_memory',
                severity: 'critical',
                message: `High memory usage detected: ${memoryUsage.toFixed(2)}%`,
                metric: 'memory_usage',
                value: memoryUsage,
                threshold: this.thresholds.memoryUsage
            });
        }

        if (diskUsage > this.thresholds.diskUsage) {
            this.triggerAlert({
                type: 'high_disk',
                severity: 'critical',
                message: `High disk usage detected: ${diskUsage.toFixed(2)}%`,
                metric: 'disk_usage',
                value: diskUsage,
                threshold: this.thresholds.diskUsage
            });
        }
    }

    /**
     * Collect database metrics
     */
    async collectDatabaseMetrics() {
        try {
            // This would integrate with your specific database monitoring
            // For Prisma, you might use metrics from the Prisma client
            this.metrics.database = {
                connections: 10, // Placeholder
                queries: this.metrics.database.queries || 0,
                slowQueries: this.metrics.database.slowQueries || 0,
                averageQueryTime: 50 // Placeholder
            };
        } catch (error) {
            console.error('Database metrics collection failed:', error);
        }
    }

    /**
     * Process error metrics
     */
    processErrorMetrics() {
        // Clean up old errors (keep last 100)
        if (this.metrics.errors.recent.length > 100) {
            this.metrics.errors.recent = this.metrics.errors.recent.slice(-100);
        }

        // Analyze error patterns
        const recentErrors = this.metrics.errors.recent.filter(
            error => Date.now() - error.timestamp < 600000 // Last 10 minutes
        );

        if (recentErrors.length > 10) {
            this.triggerAlert({
                type: 'error_spike',
                severity: 'warning',
                message: `Error spike detected: ${recentErrors.length} errors in 10 minutes`,
                metric: 'error_count',
                value: recentErrors.length,
                threshold: 10
            });
        }
    }

    /**
     * Analyze performance trends
     */
    analyzePerformance() {
        const { responseTimeHistory } = this.metrics.requests;

        if (responseTimeHistory.length < 10) return;

        // Calculate performance trend
        const recent = responseTimeHistory.slice(-10);
        const older = responseTimeHistory.slice(-20, -10);

        if (older.length === 0) return;

        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const degradation = ((recentAvg - olderAvg) / olderAvg) * 100;

        if (degradation > 50) { // 50% performance degradation
            this.triggerAlert({
                type: 'performance_degradation',
                severity: 'warning',
                message: `Performance degradation detected: ${degradation.toFixed(2)}% slower`,
                metric: 'performance_trend',
                value: degradation,
                threshold: 50
            });
        }
    }

    /**
     * Record error occurrence
     */
    recordError(error, context = {}) {
        const errorRecord = {
            timestamp: Date.now(),
            message: error.message,
            stack: error.stack,
            type: error.constructor.name,
            context
        };

        this.metrics.errors.total++;
        this.metrics.errors.recent.push(errorRecord);

        if (!this.metrics.errors.byType[errorRecord.type]) {
            this.metrics.errors.byType[errorRecord.type] = 0;
        }
        this.metrics.errors.byType[errorRecord.type]++;

        // Trigger alert for critical errors
        if (this.isCriticalError(error)) {
            this.triggerAlert({
                type: 'critical_error',
                severity: 'critical',
                message: `Critical error: ${error.message}`,
                metric: 'error_occurrence',
                value: error.message,
                threshold: 'any',
                data: errorRecord
            });
        }
    }

    /**
     * Determine if error is critical
     */
    isCriticalError(error) {
        const criticalTypes = [
            'DatabaseError',
            'AuthenticationError',
            'SecurityError',
            'SystemError'
        ];

        return criticalTypes.includes(error.constructor.name) ||
            error.message.toLowerCase().includes('critical') ||
            error.message.toLowerCase().includes('security');
    }

    /**
     * Trigger alert through all configured handlers
     */
    triggerAlert(alertData) {
        const alert = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            monitoringId: this.monitoringId,
            ...alertData
        };

        this.metrics.alerts.push(alert);

        // Keep only last 1000 alerts
        if (this.metrics.alerts.length > 1000) {
            this.metrics.alerts.shift();
        }

        // Send through all alert handlers
        this.alertHandlers.forEach(handler => {
            try {
                handler.handle(alert);
            } catch (error) {
                console.error(`Alert handler ${handler.name} failed:`, error);
            }
        });
    }

    /**
     * Get alert emoji based on severity
     */
    getAlertEmoji(severity) {
        const emojis = {
            info: '📘',
            warning: '⚠️',
            critical: '🚨',
            error: '❌'
        };
        return emojis[severity] || '📊';
    }

    /**
     * Get current metrics snapshot
     */
    getMetrics() {
        return {
            ...this.metrics,
            timestamp: new Date().toISOString(),
            monitoringId: this.monitoringId,
            uptime: Date.now() - this.startTime
        };
    }

    /**
     * Generate monitoring report
     */
    generateReport() {
        const metrics = this.getMetrics();
        const report = {
            summary: {
                status: this.getOverallStatus(),
                uptime: metrics.uptime,
                totalRequests: metrics.requests.total,
                errorRate: (metrics.requests.failed / metrics.requests.total) * 100 || 0,
                averageResponseTime: metrics.requests.averageResponseTime,
                activeAlerts: metrics.alerts.filter(a =>
                    Date.now() - new Date(a.timestamp).getTime() < 3600000 // Last hour
                ).length
            },
            detailed: metrics
        };

        return report;
    }

    /**
     * Get overall system status
     */
    getOverallStatus() {
        const { system, requests, alerts } = this.metrics;
        const recentAlerts = alerts.filter(a =>
            Date.now() - new Date(a.timestamp).getTime() < 3600000
        );

        const criticalAlerts = recentAlerts.filter(a => a.severity === 'critical');
        const errorRate = (requests.failed / requests.total) * 100 || 0;

        if (criticalAlerts.length > 0 || errorRate > 10) return 'critical';
        if (recentAlerts.length > 5 || errorRate > 5) return 'warning';
        return 'healthy';
    }

    /**
     * Collect all metrics immediately
     */
    collectAllMetrics() {
        this.collectSystemMetrics();
        this.collectDatabaseMetrics();
        this.processErrorMetrics();
        this.analyzePerformance();
    }
}

// Export singleton instance
const productionMonitoring = new ProductionMonitoring();

export default productionMonitoring;
export { ProductionMonitoring };