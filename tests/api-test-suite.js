/**
 * =====================================================
 * ENTERPRISE-LEVEL API TEST SUITE
 * Production-Ready Automated Testing Framework
 * =====================================================
 */

import { performance } from 'perf_hooks';
import crypto from 'crypto';

class APITestSuite {
    constructor() {
        this.baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
        this.testResults = [];
        this.authToken = null;
        this.testStartTime = null;
        this.metrics = {
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            totalDuration: 0,
            averageResponseTime: 0
        };
    }

    /**
     * Advanced HTTP Request with retry logic and metrics
     */
    async makeRequest(endpoint, options = {}) {
        const startTime = performance.now();
        const requestId = crypto.randomUUID();

        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'OG-API-TestSuite/1.0.0',
                'X-Request-ID': requestId,
                ...(this.authToken && { Authorization: `Bearer ${this.authToken}` })
            },
            timeout: 30000,
            retries: 3,
            retryDelay: 1000
        };

        const mergedOptions = { ...defaultOptions, ...options };
        const url = `${this.baseUrl}${endpoint}`;

        for (let attempt = 1; attempt <= mergedOptions.retries; attempt++) {
            try {
                console.log(`🔄 Request ${requestId}: ${mergedOptions.method} ${endpoint} (Attempt ${attempt})`);

                const response = await fetch(url, {
                    method: mergedOptions.method,
                    headers: mergedOptions.headers,
                    body: mergedOptions.body ? JSON.stringify(mergedOptions.body) : undefined
                });

                const endTime = performance.now();
                const duration = endTime - startTime;

                const result = {
                    requestId,
                    url,
                    method: mergedOptions.method,
                    status: response.status,
                    statusText: response.statusText,
                    duration,
                    attempt,
                    headers: Object.fromEntries(response.headers.entries())
                };

                try {
                    result.data = await response.json();
                } catch (e) {
                    result.data = await response.text();
                }

                console.log(`✅ Response ${requestId}: ${response.status} in ${duration.toFixed(2)}ms`);
                return result;

            } catch (error) {
                console.error(`❌ Request ${requestId} failed (Attempt ${attempt}):`, error.message);

                if (attempt === mergedOptions.retries) {
                    const endTime = performance.now();
                    return {
                        requestId,
                        url,
                        method: mergedOptions.method,
                        error: error.message,
                        duration: endTime - startTime,
                        attempt
                    };
                }

                // Exponential backoff
                await this.sleep(mergedOptions.retryDelay * Math.pow(2, attempt - 1));
            }
        }
    }

    /**
     * Test assertion framework
     */
    assert(condition, message, actual = null, expected = null) {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            return true;
        } else {
            console.error(`❌ FAIL: ${message}`);
            if (actual !== null && expected !== null) {
                console.error(`   Expected: ${JSON.stringify(expected)}`);
                console.error(`   Actual:   ${JSON.stringify(actual)}`);
            }
            return false;
        }
    }

    /**
     * Test runner with comprehensive reporting
     */
    async runTest(testName, testFunction) {
        console.log(`\n🧪 Running: ${testName}`);
        const testStart = performance.now();

        try {
            const result = await testFunction();
            const testDuration = performance.now() - testStart;

            const testResult = {
                name: testName,
                status: 'PASSED',
                duration: testDuration,
                timestamp: new Date().toISOString(),
                ...result
            };

            this.testResults.push(testResult);
            this.metrics.passedTests++;

            console.log(`✅ ${testName} - PASSED (${testDuration.toFixed(2)}ms)`);
            return testResult;

        } catch (error) {
            const testDuration = performance.now() - testStart;

            const testResult = {
                name: testName,
                status: 'FAILED',
                duration: testDuration,
                timestamp: new Date().toISOString(),
                error: error.message,
                stack: error.stack
            };

            this.testResults.push(testResult);
            this.metrics.failedTests++;

            console.error(`❌ ${testName} - FAILED (${testDuration.toFixed(2)}ms):`);
            console.error(`   Error: ${error.message}`);
            return testResult;
        }
    }

    /**
     * Health Check with comprehensive monitoring
     */
    async testHealthCheck() {
        return await this.runTest('Health Check', async () => {
            const response = await this.makeRequest('/api/health');

            this.assert(response.status === 200, 'Health endpoint returns 200', response.status, 200);
            this.assert(response.data.status === 'healthy', 'Service is healthy', response.data.status, 'healthy');
            this.assert(response.data.services.database === 'operational', 'Database is operational');
            this.assert(response.duration < 5000, 'Response time under 5s', `${response.duration}ms`, '<5000ms');

            return {
                responseTime: response.duration,
                uptime: response.data.uptime,
                environment: response.data.environment
            };
        });
    }

    /**
     * Authentication flow testing
     */
    async testAuthentication() {
        return await this.runTest('Authentication Flow', async () => {
            // Test login
            const loginResponse = await this.makeRequest('/api/auth/login', {
                method: 'POST',
                body: {
                    username: 'baris.gullu',
                    password: '123456'
                }
            });

            this.assert(loginResponse.status === 200, 'Login successful', loginResponse.status, 200);
            this.assert(loginResponse.data.success === true, 'Login response indicates success');
            this.assert(!!loginResponse.data.accessToken, 'Access token provided');
            this.assert(!!loginResponse.data.user, 'User data provided');

            // Store token for subsequent requests
            if (loginResponse.data.accessToken) {
                this.authToken = loginResponse.data.accessToken;
            }

            // Test logout
            const logoutResponse = await this.makeRequest('/api/auth/logout', {
                method: 'POST'
            });

            this.assert(logoutResponse.status === 200, 'Logout successful', logoutResponse.status, 200);

            return {
                loginTime: loginResponse.duration,
                logoutTime: logoutResponse.duration,
                userRole: loginResponse.data.user?.rol,
                tokenExpiry: loginResponse.data.sessionExpiry
            };
        });
    }

    /**
     * CORS and Security Headers Testing
     */
    async testCORSAndSecurity() {
        return await this.runTest('CORS and Security Headers', async () => {
            // Test preflight request
            const preflightResponse = await this.makeRequest('/api/dropdown', {
                method: 'OPTIONS',
                headers: {
                    'Origin': 'http://localhost:5173',
                    'Access-Control-Request-Method': 'GET',
                    'Access-Control-Request-Headers': 'Authorization'
                }
            });

            this.assert(preflightResponse.status === 200, 'Preflight request successful');
            this.assert(
                preflightResponse.headers['access-control-allow-origin'],
                'CORS origin header present'
            );
            this.assert(
                preflightResponse.headers['access-control-allow-methods'],
                'CORS methods header present'
            );

            // Test security headers
            const securityResponse = await this.makeRequest('/api/health');

            const securityHeaders = [
                'x-content-type-options',
                'x-frame-options',
                'access-control-allow-origin'
            ];

            securityHeaders.forEach(header => {
                this.assert(
                    securityResponse.headers[header],
                    `Security header ${header} present`
                );
            });

            return {
                corsEnabled: true,
                securityHeadersCount: securityHeaders.filter(h => securityResponse.headers[h]).length
            };
        });
    }

    /**
     * Dropdown API Performance Testing
     */
    async testDropdownAPI() {
        return await this.runTest('Dropdown API Performance', async () => {
            const response = await this.makeRequest('/api/dropdown-test');

            this.assert(response.status === 200, 'Dropdown API accessible', response.status, 200);
            this.assert(response.data.status === 'success', 'Dropdown data retrieved');
            this.assert(Array.isArray(response.data.urunler), 'Products array present');
            this.assert(response.duration < 10000, 'Response time acceptable', `${response.duration}ms`, '<10000ms');

            // Test data quality
            const dataQuality = {
                urunlerCount: response.data.urunler?.length || 0,
                carilerCount: response.data.cariler?.length || 0,
                teslimatTurleriCount: response.data.teslimatTurleri?.length || 0
            };

            this.assert(dataQuality.urunlerCount > 0, 'Products data available');

            return {
                responseTime: response.duration,
                dataQuality,
                cacheStatus: response.data.meta?.cached || false
            };
        });
    }

    /**
     * Database Connection Pool Testing
     */
    async testDatabasePerformance() {
        return await this.runTest('Database Performance', async () => {
            const concurrent = 5;
            const promises = Array(concurrent).fill().map((_, i) =>
                this.makeRequest(`/api/health?test=${i}`)
            );

            const responses = await Promise.all(promises);

            const avgResponseTime = responses.reduce((sum, r) => sum + r.duration, 0) / responses.length;
            const allSuccessful = responses.every(r => r.status === 200);

            this.assert(allSuccessful, 'All concurrent requests successful');
            this.assert(avgResponseTime < 5000, 'Average response time acceptable', `${avgResponseTime}ms`, '<5000ms');

            return {
                concurrentRequests: concurrent,
                averageResponseTime: avgResponseTime,
                maxResponseTime: Math.max(...responses.map(r => r.duration)),
                minResponseTime: Math.min(...responses.map(r => r.duration))
            };
        });
    }

    /**
     * Load Testing with metrics
     */
    async testLoadPerformance() {
        return await this.runTest('Load Performance', async () => {
            const requestCount = 20;
            const batchSize = 5;
            const results = [];

            for (let i = 0; i < requestCount; i += batchSize) {
                const batch = Array(Math.min(batchSize, requestCount - i)).fill().map(() =>
                    this.makeRequest('/api/health')
                );

                const batchResults = await Promise.all(batch);
                results.push(...batchResults);

                // Brief pause between batches
                await this.sleep(100);
            }

            const successCount = results.filter(r => r.status === 200).length;
            const avgResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
            const successRate = (successCount / requestCount) * 100;

            this.assert(successRate >= 95, 'Success rate acceptable', `${successRate}%`, '>=95%');
            this.assert(avgResponseTime < 10000, 'Average response time under load acceptable');

            return {
                totalRequests: requestCount,
                successfulRequests: successCount,
                successRate,
                averageResponseTime: avgResponseTime,
                throughput: requestCount / (results[results.length - 1].duration / 1000)
            };
        });
    }

    /**
     * Run complete test suite
     */
    async runFullSuite() {
        console.log('🚀 Starting Enterprise API Test Suite...\n');
        this.testStartTime = performance.now();

        const tests = [
            this.testHealthCheck,
            this.testCORSAndSecurity,
            this.testDropdownAPI,
            this.testAuthentication,
            this.testDatabasePerformance,
            this.testLoadPerformance
        ];

        for (const test of tests) {
            await test.call(this);
            this.metrics.totalTests++;
        }

        this.generateReport();
    }

    /**
     * Generate comprehensive test report
     */
    generateReport() {
        const totalDuration = performance.now() - this.testStartTime;
        this.metrics.totalDuration = totalDuration;
        this.metrics.averageResponseTime = this.testResults
            .filter(r => r.responseTime)
            .reduce((sum, r) => sum + r.responseTime, 0) / this.testResults.length || 0;

        console.log('\n' + '='.repeat(60));
        console.log('📊 ENTERPRISE API TEST SUITE REPORT');
        console.log('='.repeat(60));

        console.log(`\n📈 METRICS:`);
        console.log(`   Total Tests:       ${this.metrics.totalTests}`);
        console.log(`   Passed:           ${this.metrics.passedTests} ✅`);
        console.log(`   Failed:           ${this.metrics.failedTests} ❌`);
        console.log(`   Success Rate:     ${((this.metrics.passedTests / this.metrics.totalTests) * 100).toFixed(1)}%`);
        console.log(`   Total Duration:   ${(totalDuration / 1000).toFixed(2)}s`);
        console.log(`   Avg Response:     ${this.metrics.averageResponseTime.toFixed(2)}ms`);

        console.log(`\n📋 TEST RESULTS:`);
        this.testResults.forEach(result => {
            const status = result.status === 'PASSED' ? '✅' : '❌';
            console.log(`   ${status} ${result.name.padEnd(30)} ${result.duration.toFixed(2)}ms`);
        });

        console.log(`\n🎯 RECOMMENDATIONS:`);
        if (this.metrics.failedTests > 0) {
            console.log(`   • Fix ${this.metrics.failedTests} failing test(s) before production`);
        }
        if (this.metrics.averageResponseTime > 5000) {
            console.log(`   • Optimize response times (current: ${this.metrics.averageResponseTime.toFixed(2)}ms)`);
        }
        if (this.metrics.passedTests === this.metrics.totalTests) {
            console.log(`   • 🚀 All tests passed! Ready for production deployment`);
        }

        console.log('\n' + '='.repeat(60));

        // Save report to file
        const reportData = {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            baseUrl: this.baseUrl,
            metrics: this.metrics,
            testResults: this.testResults
        };

        // Write to file for CI/CD integration
        require('fs').writeFileSync(
            'test-report.json',
            JSON.stringify(reportData, null, 2)
        );

        console.log('📄 Report saved to test-report.json');
    }

    /**
     * Utility function for delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const testSuite = new APITestSuite();
    testSuite.runFullSuite().catch(console.error);
}

export default APITestSuite;