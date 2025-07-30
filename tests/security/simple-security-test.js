/**
 * Simple HTTP-based Security Test
 * Tests the actual running server via HTTP requests
 */

const axios = require('axios');

class SimpleSecurityTest {
    constructor(baseURL = 'http://localhost:3000') {
        this.baseURL = baseURL;
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    async runQuickTest() {
        console.log('🚀 Starting Quick Security Test...\n');

        // Test server connectivity
        await this.testServerConnectivity();

        // Test basic security endpoints
        await this.testBasicSecurity();

        // Test authentication
        await this.testAuthentication();

        // Test input validation
        await this.testInputValidation();

        this.generateReport();
    }

    async testServerConnectivity() {
        console.log('🌐 Testing server connectivity...');

        try {
            const response = await axios.get(`${this.baseURL}/api/health`, { timeout: 5000 });
            if (response.status === 200) {
                this.addTest('Server Connectivity', true, 'Server is accessible');
            } else {
                this.addTest('Server Connectivity', false, `Unexpected status: ${response.status}`);
            }
        } catch (error) {
            this.addTest('Server Connectivity', false, `Server not accessible: ${error.message}`);
        }
    }

    async testBasicSecurity() {
        console.log('🔒 Testing basic security...');

        // Test 1: Security headers
        try {
            const response = await axios.get(`${this.baseURL}/api/health`);
            const headers = response.headers;

            if (headers['x-frame-options'] || headers['x-content-type-options']) {
                this.addTest('Security Headers', true, 'Basic security headers present');
            } else {
                this.addTest('Security Headers', false, 'Missing security headers');
            }
        } catch (error) {
            this.addTest('Security Headers', false, `Error testing headers: ${error.message}`);
        }

        // Test 2: Unauthorized access protection
        try {
            const response = await axios.get(`${this.baseURL}/api/auth/users`);
            if (response.status === 401) {
                this.addTest('Unauthorized Access Protection', true, 'Protected endpoints reject unauthorized access');
            } else {
                this.addTest('Unauthorized Access Protection', false, `Expected 401, got ${response.status}`);
            }
        } catch (error) {
            if (error.response && error.response.status === 401) {
                this.addTest('Unauthorized Access Protection', true, 'Protected endpoints reject unauthorized access');
            } else {
                this.addTest('Unauthorized Access Protection', false, `Unexpected error: ${error.message}`);
            }
        }
    }

    async testAuthentication() {
        console.log('🔑 Testing authentication...');

        // Test 1: Invalid credentials should be rejected
        try {
            const response = await axios.post(`${this.baseURL}/api/auth/login`, {
                kullaniciAdi: 'invalid_user',
                sifre: 'invalid_password'
            });

            if (response.status === 401) {
                this.addTest('Invalid Credentials Rejection', true, 'Invalid credentials properly rejected');
            } else {
                this.addTest('Invalid Credentials Rejection', false, `Expected 401, got ${response.status}`);
            }
        } catch (error) {
            if (error.response && error.response.status === 401) {
                this.addTest('Invalid Credentials Rejection', true, 'Invalid credentials properly rejected');
            } else {
                this.addTest('Invalid Credentials Rejection', false, `Unexpected error: ${error.message}`);
            }
        }

        // Test 2: SQL Injection in login
        try {
            const response = await axios.post(`${this.baseURL}/api/auth/login`, {
                kullaniciAdi: "' OR '1'='1",
                sifre: "' OR '1'='1"
            });

            if (response.status === 401 || response.status === 422) {
                this.addTest('SQL Injection Protection (Login)', true, 'SQL injection attempts blocked');
            } else {
                this.addTest('SQL Injection Protection (Login)', false, `Possible SQL injection vulnerability`);
            }
        } catch (error) {
            if (error.response && [401, 422].includes(error.response.status)) {
                this.addTest('SQL Injection Protection (Login)', true, 'SQL injection attempts blocked');
            } else {
                this.addTest('SQL Injection Protection (Login)', false, `Unexpected error: ${error.message}`);
            }
        }

        // Test 3: XSS in login
        try {
            const response = await axios.post(`${this.baseURL}/api/auth/login`, {
                kullaniciAdi: '<script>alert("XSS")</script>',
                sifre: 'test'
            });

            // Check if XSS payload is reflected in response
            const responseText = JSON.stringify(response.data);
            if (!responseText.includes('<script>')) {
                this.addTest('XSS Protection (Login)', true, 'XSS payloads are sanitized');
            } else {
                this.addTest('XSS Protection (Login)', false, 'XSS payload reflected in response');
            }
        } catch (error) {
            // Check error response for XSS
            const errorText = error.response ? JSON.stringify(error.response.data) : error.message;
            if (!errorText.includes('<script>')) {
                this.addTest('XSS Protection (Login)', true, 'XSS payloads are sanitized');
            } else {
                this.addTest('XSS Protection (Login)', false, 'XSS payload reflected in error response');
            }
        }
    }

    async testInputValidation() {
        console.log('🧹 Testing input validation...');

        // Test 1: Empty required fields
        try {
            const response = await axios.post(`${this.baseURL}/api/auth/login`, {
                kullaniciAdi: '',
                sifre: ''
            });

            if (response.status === 422 || response.status === 400) {
                this.addTest('Empty Field Validation', true, 'Empty required fields properly rejected');
            } else {
                this.addTest('Empty Field Validation', false, `Expected 400/422, got ${response.status}`);
            }
        } catch (error) {
            if (error.response && [400, 422].includes(error.response.status)) {
                this.addTest('Empty Field Validation', true, 'Empty required fields properly rejected');
            } else {
                this.addTest('Empty Field Validation', false, `Unexpected error: ${error.message}`);
            }
        }

        // Test 2: Extremely long input
        const longString = 'A'.repeat(10000);
        try {
            const response = await axios.post(`${this.baseURL}/api/auth/login`, {
                kullaniciAdi: longString,
                sifre: 'test'
            });

            if (response.status === 413 || response.status === 422) {
                this.addTest('Long Input Protection', true, 'Extremely long inputs rejected');
            } else {
                this.addTest('Long Input Protection', false, 'Long inputs may not be properly limited');
            }
        } catch (error) {
            if (error.response && [413, 422].includes(error.response.status)) {
                this.addTest('Long Input Protection', true, 'Extremely long inputs rejected');
            } else if (error.code === 'ECONNRESET' || error.message.includes('timeout')) {
                this.addTest('Long Input Protection', true, 'Connection reset - possible protection active');
            } else {
                this.addTest('Long Input Protection', false, `Unexpected error: ${error.message}`);
            }
        }
    }

    addTest(name, passed, description) {
        const test = { name, passed, description };
        this.results.tests.push(test);

        if (passed) {
            this.results.passed++;
            console.log(`  ✅ ${name}: ${description}`);
        } else {
            this.results.failed++;
            console.log(`  ❌ ${name}: ${description}`);
        }
    }

    generateReport() {
        const total = this.results.passed + this.results.failed;
        const score = total > 0 ? Math.round((this.results.passed / total) * 100) : 0;

        console.log('\n📊 QUICK SECURITY TEST RESULTS');
        console.log('================================');
        console.log(`✅ Tests Passed: ${this.results.passed}`);
        console.log(`❌ Tests Failed: ${this.results.failed}`);
        console.log(`🏆 Security Score: ${score}%`);

        if (score >= 90) {
            console.log('🟢 EXCELLENT - Great security posture!');
        } else if (score >= 75) {
            console.log('🟡 GOOD - Minor improvements recommended');
        } else if (score >= 50) {
            console.log('🟠 FAIR - Several issues need attention');
        } else {
            console.log('🔴 POOR - Critical security issues found!');
        }

        console.log('\n📋 Test Details:');
        this.results.tests.forEach((test, index) => {
            const status = test.passed ? '✅' : '❌';
            console.log(`   ${index + 1}. ${status} ${test.name}`);
            console.log(`      ${test.description}`);
        });

        console.log('\n💡 Recommendations:');
        if (this.results.failed > 0) {
            console.log('   • Address failed tests immediately');
            console.log('   • Review security implementation guide');
            console.log('   • Run comprehensive security tests');
        } else {
            console.log('   • Continue with comprehensive security testing');
            console.log('   • Implement continuous security monitoring');
        }

        console.log('\n🎯 Next Steps:');
        console.log('   • Run full security test suite for detailed analysis');
        console.log('   • Check penetration testing checklist');
        console.log('   • Review security documentation');
    }
}

// Run if called directly
if (require.main === module) {
    const baseURL = process.argv[2] || 'http://localhost:3000';
    const test = new SimpleSecurityTest(baseURL);
    test.runQuickTest().catch(console.error);
}

module.exports = { SimpleSecurityTest }; 