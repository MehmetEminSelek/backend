/**
 * =====================================================
 * PRODUCTION DEPLOYMENT SCRIPT
 * Enterprise-Level Deployment Automation
 * =====================================================
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

class ProductionDeployment {
    constructor() {
        this.deploymentId = crypto.randomUUID();
        this.startTime = new Date();
        this.config = {
            environment: 'production',
            nodeVersion: '18.x',
            npmVersion: '8.x',
            buildTimeout: 300000, // 5 minutes
            healthCheckTimeout: 60000, // 1 minute
            rollbackOnFailure: true,
            backupDatabase: true,
            runTests: true,
            enableMonitoring: true
        };
        this.deploymentLog = [];
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level}] ${message}`;
        console.log(logEntry);
        this.deploymentLog.push({ timestamp, level, message });
    }

    async executeCommand(command, description) {
        this.log(`Executing: ${description}`, 'INFO');
        try {
            const output = execSync(command, {
                encoding: 'utf8',
                timeout: this.config.buildTimeout,
                env: { ...process.env, NODE_ENV: 'production' }
            });
            this.log(`✅ ${description} - SUCCESS`, 'SUCCESS');
            return output;
        } catch (error) {
            this.log(`❌ ${description} - FAILED: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async validateEnvironment() {
        this.log('🔍 Validating Production Environment...', 'INFO');

        // Check Node.js version
        const nodeVersion = process.version;
        if (!nodeVersion.startsWith('v18.')) {
            throw new Error(`Node.js 18.x required, found ${nodeVersion}`);
        }

        // Check required environment variables
        const requiredEnvVars = [
            'DATABASE_URL',
            'JWT_SECRET',
            'CORS_ORIGIN',
            'PORT'
        ];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable: ${envVar}`);
            }
        }

        // Validate DATABASE_URL format
        if (!process.env.DATABASE_URL.includes('postgresql://')) {
            throw new Error('Invalid DATABASE_URL format');
        }

        // Check JWT_SECRET strength
        if (process.env.JWT_SECRET.length < 32) {
            throw new Error('JWT_SECRET must be at least 32 characters');
        }

        this.log('✅ Environment validation passed', 'SUCCESS');
    }

    async backupDatabase() {
        if (!this.config.backupDatabase) return;

        this.log('💾 Creating database backup...', 'INFO');

        const backupName = `backup_${this.deploymentId}_${Date.now()}.sql`;
        const backupPath = path.join('./backups', backupName);

        // Ensure backup directory exists
        fs.mkdirSync('./backups', { recursive: true });

        try {
            // Create database backup
            await this.executeCommand(
                `pg_dump ${process.env.DATABASE_URL} > ${backupPath}`,
                'Database backup creation'
            );

            this.log(`✅ Database backup created: ${backupName}`, 'SUCCESS');
            return backupPath;
        } catch (error) {
            this.log(`⚠️ Database backup failed: ${error.message}`, 'WARNING');
            // Continue deployment without backup in some cases
            if (this.config.rollbackOnFailure) {
                throw error;
            }
        }
    }

    async runPreDeploymentTests() {
        if (!this.config.runTests) return;

        this.log('🧪 Running pre-deployment tests...', 'INFO');

        try {
            // Install test dependencies
            await this.executeCommand('npm ci', 'Installing dependencies');

            // Run Prisma client generation
            await this.executeCommand('npx prisma generate', 'Generating Prisma client');

            // Run database migration check
            await this.executeCommand('npx prisma migrate status', 'Checking database migrations');

            // Run comprehensive API tests
            await this.executeCommand('node tests/api-test-suite.js', 'Running API test suite');

            // Run security tests
            if (fs.existsSync('./tests/security')) {
                await this.executeCommand('node tests/security/automated-security-tests.js', 'Running security tests');
            }

            this.log('✅ All pre-deployment tests passed', 'SUCCESS');
        } catch (error) {
            this.log(`❌ Pre-deployment tests failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async optimizeForProduction() {
        this.log('⚡ Optimizing for production...', 'INFO');

        // Clear any existing build artifacts
        if (fs.existsSync('./.next')) {
            fs.rmSync('./.next', { recursive: true, force: true });
        }

        // Install production dependencies only
        await this.executeCommand('npm ci --only=production', 'Installing production dependencies');

        // Build Next.js application
        await this.executeCommand('npm run build', 'Building Next.js application');

        // Run Prisma optimization
        await this.executeCommand('npx prisma generate --no-engine', 'Optimizing Prisma client');

        // Compress static assets if possible
        if (fs.existsSync('./public')) {
            this.log('🗜️ Compressing static assets...', 'INFO');
            // Add compression logic here
        }

        this.log('✅ Production optimization completed', 'SUCCESS');
    }

    async deployApplication() {
        this.log('🚀 Deploying application...', 'INFO');

        // Set production environment
        process.env.NODE_ENV = 'production';

        // Start the application in background for health check
        const serverProcess = execSync('npm start &', {
            encoding: 'utf8',
            env: { ...process.env, NODE_ENV: 'production' }
        });

        // Wait for application to start
        await this.sleep(5000);

        this.log('✅ Application deployment initiated', 'SUCCESS');
        return serverProcess;
    }

    async performHealthCheck() {
        this.log('🏥 Performing health check...', 'INFO');

        const maxRetries = 10;
        const retryDelay = 6000; // 6 seconds

        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch('http://localhost:3000/api/health', {
                    method: 'GET',
                    timeout: 5000
                });

                if (response.ok) {
                    const healthData = await response.json();

                    if (healthData.status === 'healthy' &&
                        healthData.services.database === 'operational') {
                        this.log('✅ Health check passed', 'SUCCESS');
                        return true;
                    }
                }
            } catch (error) {
                this.log(`🔄 Health check attempt ${i + 1}/${maxRetries} failed: ${error.message}`, 'WARNING');
            }

            if (i < maxRetries - 1) {
                await this.sleep(retryDelay);
            }
        }

        throw new Error('Health check failed after maximum retries');
    }

    async setupMonitoring() {
        if (!this.config.enableMonitoring) return;

        this.log('📊 Setting up production monitoring...', 'INFO');

        // Create monitoring configuration
        const monitoringConfig = {
            deployment: {
                id: this.deploymentId,
                timestamp: this.startTime.toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                environment: 'production'
            },
            alerts: {
                responseTime: { threshold: 5000, enabled: true },
                errorRate: { threshold: 0.05, enabled: true },
                memoryUsage: { threshold: 0.85, enabled: true },
                cpuUsage: { threshold: 0.80, enabled: true }
            },
            logging: {
                level: 'warn',
                retention: '30d',
                format: 'json'
            }
        };

        fs.writeFileSync('./monitoring-config.json', JSON.stringify(monitoringConfig, null, 2));

        this.log('✅ Monitoring configuration created', 'SUCCESS');
    }

    async generateDeploymentReport() {
        const endTime = new Date();
        const duration = endTime - this.startTime;

        const report = {
            deployment: {
                id: this.deploymentId,
                startTime: this.startTime.toISOString(),
                endTime: endTime.toISOString(),
                duration: `${(duration / 1000).toFixed(2)}s`,
                status: 'SUCCESS',
                environment: 'production'
            },
            configuration: this.config,
            logs: this.deploymentLog,
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                memory: process.memoryUsage(),
                uptime: process.uptime()
            },
            checksums: {
                packageJson: this.generateFileChecksum('./package.json'),
                prismaSchema: this.generateFileChecksum('./prisma/schema.prisma')
            }
        };

        const reportPath = `./deployment-reports/deployment_${this.deploymentId}.json`;
        fs.mkdirSync('./deployment-reports', { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        this.log(`📄 Deployment report saved: ${reportPath}`, 'SUCCESS');
        return report;
    }

    generateFileChecksum(filePath) {
        if (!fs.existsSync(filePath)) return null;
        const content = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    async rollback(backupPath) {
        this.log('🔄 Initiating rollback procedure...', 'ERROR');

        try {
            // Stop current application
            execSync('pkill -f "node.*server.js"', { encoding: 'utf8' });

            // Restore database if backup exists
            if (backupPath && fs.existsSync(backupPath)) {
                await this.executeCommand(
                    `psql ${process.env.DATABASE_URL} < ${backupPath}`,
                    'Database rollback'
                );
            }

            // Restore previous deployment
            // This would typically involve reverting to previous Docker image or git commit
            this.log('⚠️ Manual intervention required for complete rollback', 'WARNING');

        } catch (error) {
            this.log(`❌ Rollback failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async deploy() {
        this.log(`🚀 Starting production deployment ${this.deploymentId}...`, 'INFO');

        let backupPath = null;

        try {
            // Pre-deployment steps
            await this.validateEnvironment();
            backupPath = await this.backupDatabase();
            await this.runPreDeploymentTests();

            // Deployment steps
            await this.optimizeForProduction();
            await this.deployApplication();
            await this.performHealthCheck();
            await this.setupMonitoring();

            // Post-deployment
            const report = await this.generateDeploymentReport();

            this.log('🎉 Production deployment completed successfully!', 'SUCCESS');
            this.log(`📊 Deployment took ${report.deployment.duration}`, 'INFO');
            this.log(`🆔 Deployment ID: ${this.deploymentId}`, 'INFO');

            return report;

        } catch (error) {
            this.log(`💥 Deployment failed: ${error.message}`, 'ERROR');

            if (this.config.rollbackOnFailure && backupPath) {
                await this.rollback(backupPath);
            }

            throw error;
        }
    }
}

// Run deployment if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const deployment = new ProductionDeployment();
    deployment.deploy()
        .then(report => {
            console.log('\n✅ Deployment completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Deployment failed:', error.message);
            process.exit(1);
        });
}

export default ProductionDeployment;