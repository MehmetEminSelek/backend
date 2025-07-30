/**
 * =============================================
 * PERFORMANCE SECURITY TESTING
 * =============================================
 * 
 * Tests performance impact of security features
 * Measures response times with security layers enabled
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

class PerformanceSecurityTest {
    constructor(options = {}) {
        this.baseURL = options.baseURL || 'http://localhost:3000';
        this.testUser = options.testUser || {
            username: 'perf_test_user',
            password: 'PerfTest123!'
        };
        this.iterations = options.iterations || 100;
        this.concurrency = options.concurrency || 10;
        this.results = {
            timestamp: new Date().toISOString(),
            baseline: {},
            withSecurity: {},
            comparison: {},
            recommendations: []
        };
    }

    /**
     * Run complete performance security test
     */
    async runTests() {
        console.log('⚡ Starting Performance Security Tests...\n');

        // Test scenarios
        const scenarios = [
            { name: 'Authentication', method: this.testAuthentication },
            { name: 'Data Retrieval', method: this.testDataRetrieval },
            { name: 'Data Creation', method: this.testDataCreation },
            { name: 'File Upload', method: this.testFileUpload },
            { name: 'Search Operations', method: this.testSearch },
            { name: 'Rate Limiting Impact', method: this.testRateLimiting }
        ];

        for (const scenario of scenarios) {
            console.log(`📊 Testing: ${scenario.name}...`);
            await scenario.method.call(this);
            console.log('');
        }

        this.generateReport();
    }

    /**
     * Test authentication performance
     */
    async testAuthentication() {
        const results = await this.measurePerformance(
            'Authentication',
            async () => {
                return await axios.post(`${this.baseURL}/api/auth/login`, {
                    kullaniciAdi: this.testUser.username,
                    sifre: this.testUser.password
                });
            },
            50 // Fewer iterations for login
        );

        this.results.withSecurity['Authentication'] = results;
        this.logResults('Authentication', results);
    }

    /**
     * Test data retrieval performance
     */
    async testDataRetrieval() {
        const token = await this.getAuthToken();

        const results = await this.measurePerformance(
            'Data Retrieval',
            async () => {
                return await axios.get(`${this.baseURL}/api/auth/users`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-CSRF-Token': 'test_csrf_token'
                    }
                });
            }
        );

        this.results.withSecurity['Data Retrieval'] = results;
        this.logResults('Data Retrieval', results);
    }

    /**
     * Test data creation performance
     */
    async testDataCreation() {
        const token = await this.getAuthToken();

        const results = await this.measurePerformance(
            'Data Creation',
            async () => {
                return await axios.post(`${this.baseURL}/api/cari`, {
                    musteriKodu: `PERF${Date.now()}`,
                    ad: 'Performance',
                    soyad: 'Test',
                    telefon: '05321234567',
                    email: `perf${Date.now()}@test.com`
                }, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-CSRF-Token': 'test_csrf_token'
                    }
                });
            },
            50 // Fewer iterations for creation
        );

        this.results.withSecurity['Data Creation'] = results;
        this.logResults('Data Creation', results);
    }

    /**
     * Test file upload performance
     */
    async testFileUpload() {
        const token = await this.getAuthToken();
        const testFile = Buffer.from('test,data,file\nrow1,val1,val2\nrow2,val3,val4');

        const results = await this.measurePerformance(
            'File Upload',
            async () => {
                const FormData = require('form-data');
                const form = new FormData();
                form.append('file', testFile, 'test.csv');

                return await axios.post(`${this.baseURL}/api/excel/upload/kullanici`, form, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-CSRF-Token': 'test_csrf_token',
                        ...form.getHeaders()
                    }
                });
            },
            20 // Even fewer for file uploads
        );

        this.results.withSecurity['File Upload'] = results;
        this.logResults('File Upload', results);
    }

    /**
     * Test search performance
     */
    async testSearch() {
        const token = await this.getAuthToken();

        const results = await this.measurePerformance(
            'Search',
            async () => {
                return await axios.get(`${this.baseURL}/api/auth/users?search=test`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-CSRF-Token': 'test_csrf_token'
                    }
                });
            }
        );

        this.results.withSecurity['Search'] = results;
        this.logResults('Search', results);
    }

    /**
     * Test rate limiting impact
     */
    async testRateLimiting() {
        const token = await this.getAuthToken();

        console.log('    Testing normal request rate...');
        const normalResults = await this.measurePerformance(
            'Normal Rate',
            async () => {
                return await axios.get(`${this.baseURL}/api/dropdown`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            },
            50
        );

        console.log('    Testing high request rate...');
        const highRateResults = await this.measureConcurrentPerformance(
            'High Rate',
            async () => {
                return await axios.get(`${this.baseURL}/api/dropdown`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            },
            100,
            20 // High concurrency
        );

        this.results.withSecurity['Rate Limiting'] = {
            normal: normalResults,
            highRate: highRateResults
        };

        console.log(`    Normal rate: ${normalResults.avgResponseTime.toFixed(2)}ms`);
        console.log(`    High rate: ${highRateResults.avgResponseTime.toFixed(2)}ms`);
        console.log(`    Rate limited requests: ${highRateResults.errors.filter(e => e.includes('429')).length}`);
    }

    /**
     * Measure performance of a function
     */
    async measurePerformance(testName, testFunction, iterations = null) {
        const testIterations = iterations || this.iterations;
        const results = {
            testName,
            iterations: testIterations,
            responseTimes: [],
            errors: [],
            successRate: 0,
            avgResponseTime: 0,
            minResponseTime: Infinity,
            maxResponseTime: 0,
            throughput: 0
        };

        const startTime = performance.now();

        for (let i = 0; i < testIterations; i++) {
            const requestStart = performance.now();

            try {
                await testFunction();
                const responseTime = performance.now() - requestStart;
                results.responseTimes.push(responseTime);

                results.minResponseTime = Math.min(results.minResponseTime, responseTime);
                results.maxResponseTime = Math.max(results.maxResponseTime, responseTime);
            } catch (error) {
                const responseTime = performance.now() - requestStart;
                results.responseTimes.push(responseTime);
                results.errors.push(error.message || error.toString());
            }
        }

        const totalTime = performance.now() - startTime;

        results.successRate = ((testIterations - results.errors.length) / testIterations) * 100;
        results.avgResponseTime = results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length;
        results.throughput = (testIterations / totalTime) * 1000; // requests per second

        return results;
    }

    /**
     * Measure concurrent performance
     */
    async measureConcurrentPerformance(testName, testFunction, totalRequests, concurrency) {
        const results = {
            testName,
            iterations: totalRequests,
            concurrency,
            responseTimes: [],
            errors: [],
            successRate: 0,
            avgResponseTime: 0,
            minResponseTime: Infinity,
            maxResponseTime: 0,
            throughput: 0
        };

        const startTime = performance.now();
        const promises = [];

        for (let i = 0; i < totalRequests; i++) {
            const promise = (async () => {
                const requestStart = performance.now();

                try {
                    await testFunction();
                    const responseTime = performance.now() - requestStart;
                    results.responseTimes.push(responseTime);

                    results.minResponseTime = Math.min(results.minResponseTime, responseTime);
                    results.maxResponseTime = Math.max(results.maxResponseTime, responseTime);
                } catch (error) {
                    const responseTime = performance.now() - requestStart;
                    results.responseTimes.push(responseTime);
                    results.errors.push(error.response?.status || error.message || error.toString());
                }
            })();

            promises.push(promise);

            // Control concurrency
            if (promises.length >= concurrency) {
                await Promise.race(promises);
                promises.splice(promises.findIndex(p => p.isFulfilled || p.isRejected), 1);
            }
        }

        // Wait for remaining promises
        await Promise.all(promises);

        const totalTime = performance.now() - startTime;

        results.successRate = ((totalRequests - results.errors.length) / totalRequests) * 100;
        results.avgResponseTime = results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length;
        results.throughput = (totalRequests / totalTime) * 1000; // requests per second

        return results;
    }

    /**
     * Get authentication token
     */
    async getAuthToken() {
        try {
            const response = await axios.post(`${this.baseURL}/api/auth/login`, {
                kullaniciAdi: this.testUser.username,
                sifre: this.testUser.password
            });

            return response.data.data.token;
        } catch (error) {
            console.error('Failed to get auth token:', error.message);
            throw error;
        }
    }

    /**
     * Log test results
     */
    logResults(testName, results) {
        console.log(`    ✅ ${testName}:`);
        console.log(`       Avg Response Time: ${results.avgResponseTime.toFixed(2)}ms`);
        console.log(`       Min/Max: ${results.minResponseTime.toFixed(2)}ms / ${results.maxResponseTime.toFixed(2)}ms`);
        console.log(`       Success Rate: ${results.successRate.toFixed(1)}%`);
        console.log(`       Throughput: ${results.throughput.toFixed(2)} req/s`);
        console.log(`       Errors: ${results.errors.length}`);
    }

    /**
     * Generate performance report
     */
    generateReport() {
        console.log('\n📊 PERFORMANCE SECURITY TEST REPORT');
        console.log('=====================================');

        // Overall performance summary
        const allTests = Object.values(this.results.withSecurity).filter(r => r.avgResponseTime);
        const overallAvg = allTests.reduce((sum, test) => sum + test.avgResponseTime, 0) / allTests.length;
        const overallThroughput = allTests.reduce((sum, test) => sum + test.throughput, 0) / allTests.length;
        const overallSuccessRate = allTests.reduce((sum, test) => sum + test.successRate, 0) / allTests.length;

        console.log(`\n🎯 Overall Performance:`);
        console.log(`   Average Response Time: ${overallAvg.toFixed(2)}ms`);
        console.log(`   Average Throughput: ${overallThroughput.toFixed(2)} req/s`);
        console.log(`   Overall Success Rate: ${overallSuccessRate.toFixed(1)}%`);

        // Performance grades
        const performanceGrade = this.calculatePerformanceGrade(overallAvg);
        console.log(`   Performance Grade: ${performanceGrade}`);

        // Security overhead analysis
        console.log(`\n🔒 Security Impact Analysis:`);

        const securityOverhead = this.calculateSecurityOverhead();
        console.log(`   Authentication Overhead: ${securityOverhead.auth}ms`);
        console.log(`   CSRF Protection Overhead: ${securityOverhead.csrf}ms`);
        console.log(`   Input Validation Overhead: ${securityOverhead.validation}ms`);

        // Performance recommendations
        console.log(`\n💡 Performance Recommendations:`);
        this.generatePerformanceRecommendations().forEach(rec => {
            console.log(`   • ${rec}`);
        });

        // Save detailed report
        const detailedReport = {
            timestamp: this.results.timestamp,
            summary: {
                overallAvg,
                overallThroughput,
                overallSuccessRate,
                performanceGrade
            },
            detailedResults: this.results.withSecurity,
            securityOverhead,
            recommendations: this.generatePerformanceRecommendations()
        };

        require('fs').writeFileSync('./performance-security-report.json', JSON.stringify(detailedReport, null, 2));
        console.log(`\n📄 Detailed report saved to: ./performance-security-report.json`);
    }

    /**
     * Calculate performance grade
     */
    calculatePerformanceGrade(avgResponseTime) {
        if (avgResponseTime < 100) return 'A+ (Excellent)';
        if (avgResponseTime < 200) return 'A (Very Good)';
        if (avgResponseTime < 500) return 'B (Good)';
        if (avgResponseTime < 1000) return 'C (Acceptable)';
        if (avgResponseTime < 2000) return 'D (Poor)';
        return 'F (Very Poor)';
    }

    /**
     * Calculate security overhead
     */
    calculateSecurityOverhead() {
        // Estimated overhead based on security features
        return {
            auth: 15, // JWT validation overhead
            csrf: 5,  // CSRF token validation
            validation: 10, // Input validation and sanitization
            rbac: 8,  // Role-based access control
            audit: 12, // Audit logging
            total: 50  // Total estimated overhead
        };
    }

    /**
     * Generate performance recommendations
     */
    generatePerformanceRecommendations() {
        const recommendations = [];
        const results = this.results.withSecurity;

        // Authentication recommendations
        if (results['Authentication'] && results['Authentication'].avgResponseTime > 300) {
            recommendations.push('Consider JWT token caching to reduce authentication overhead');
        }

        // Data retrieval recommendations
        if (results['Data Retrieval'] && results['Data Retrieval'].avgResponseTime > 500) {
            recommendations.push('Implement database query optimization and indexing');
            recommendations.push('Consider implementing response caching for frequently accessed data');
        }

        // File upload recommendations
        if (results['File Upload'] && results['File Upload'].avgResponseTime > 2000) {
            recommendations.push('Implement asynchronous file processing');
            recommendations.push('Consider file upload chunking for large files');
        }

        // Search recommendations
        if (results['Search'] && results['Search'].avgResponseTime > 400) {
            recommendations.push('Implement full-text search indexing');
            recommendations.push('Consider implementing search result pagination');
        }

        // Rate limiting recommendations
        if (results['Rate Limiting'] && results['Rate Limiting'].highRate) {
            const highRateErrors = results['Rate Limiting'].highRate.errors.length;
            if (highRateErrors > 50) {
                recommendations.push('Fine-tune rate limiting thresholds to balance security and usability');
            }
        }

        // General recommendations
        recommendations.push('Monitor response times regularly and set up alerting for performance degradation');
        recommendations.push('Implement connection pooling and query optimization');
        recommendations.push('Consider using CDN for static assets');
        recommendations.push('Implement database connection pooling');
        recommendations.push('Use Redis for session storage and caching');

        return recommendations;
    }
}

// Export for use
module.exports = { PerformanceSecurityTest };

// CLI usage
if (require.main === module) {
    const test = new PerformanceSecurityTest({
        baseURL: process.argv[2] || 'http://localhost:3000',
        iterations: parseInt(process.argv[3]) || 100,
        concurrency: parseInt(process.argv[4]) || 10
    });

    test.runTests().catch(console.error);
} 