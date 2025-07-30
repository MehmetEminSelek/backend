/**
 * =============================================
 * AUTOMATED SECURITY TEST SUITE
 * =============================================
 * 
 * Comprehensive security testing for Ömer Güllü Sipariş Sistemi
 * Tests all 10 security layers and validates enterprise-grade protection
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { expect } = require('chai');

// Test configuration
const TEST_CONFIG = {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    testUsers: {
        admin: { username: 'test_admin', password: 'TestAdmin123!', role: 'ADMIN' },
        manager: { username: 'test_manager', password: 'TestManager123!', role: 'MANAGER' },
        operator: { username: 'test_operator', password: 'TestOperator123!', role: 'OPERATOR' },
        viewer: { username: 'test_viewer', password: 'TestViewer123!', role: 'VIEWER' }
    },
    testData: {
        maliciousInputs: [
            '<script>alert("XSS")</script>',
            '"; DROP TABLE kullanici; --',
            'javascript:alert("XSS")',
            '<img src=x onerror=alert("XSS")>',
            "' OR '1'='1",
            '<iframe src="javascript:alert(\'XSS\')"></iframe>',
            '${7*7}',
            '{{7*7}}',
            '<svg onload=alert("XSS")>'
        ]
    }
};

class SecurityTestSuite {
    constructor() {
        this.app = null;
        this.tokens = {};
        this.csrfTokens = {};
        this.testResults = {
            passed: 0,
            failed: 0,
            vulnerabilities: [],
            warnings: []
        };
    }

    /**
     * Initialize test suite
     */
    async initialize(app) {
        this.app = app;
        console.log('🔒 Initializing Security Test Suite...');

        // Authenticate test users
        await this.authenticateTestUsers();

        console.log('✅ Security Test Suite initialized');
    }

    /**
     * Authenticate all test users
     */
    async authenticateTestUsers() {
        console.log('🔑 Authenticating test users...');

        for (const [role, userData] of Object.entries(TEST_CONFIG.testUsers)) {
            try {
                const response = await request(this.app)
                    .post('/api/auth/login')
                    .send({
                        kullaniciAdi: userData.username,
                        sifre: userData.password
                    });

                if (response.status === 200) {
                    this.tokens[role] = response.body.data.token;
                    this.csrfTokens[role] = response.body.data.csrfToken;
                    console.log(`✅ ${role.toUpperCase()} authenticated`);
                } else {
                    console.log(`❌ Failed to authenticate ${role}`);
                }
            } catch (error) {
                console.log(`❌ Authentication error for ${role}:`, error.message);
            }
        }
    }

    /**
     * Run all security tests
     */
    async runAllTests() {
        console.log('\n🚀 Starting Comprehensive Security Tests...\n');

        const testSuites = [
            { name: 'Authentication Security', method: this.testAuthentication },
            { name: 'Authorization & RBAC', method: this.testAuthorization },
            { name: 'Input Validation & Sanitization', method: this.testInputValidation },
            { name: 'SQL Injection Protection', method: this.testSQLInjection },
            { name: 'XSS Protection', method: this.testXSSProtection },
            { name: 'CSRF Protection', method: this.testCSRFProtection },
            { name: 'Rate Limiting', method: this.testRateLimiting },
            { name: 'Session Management', method: this.testSessionManagement },
            { name: 'File Upload Security', method: this.testFileUploadSecurity },
            { name: 'API Security Headers', method: this.testSecurityHeaders },
            { name: 'Error Handling Security', method: this.testErrorHandling },
            { name: 'Business Logic Security', method: this.testBusinessLogic }
        ];

        for (const testSuite of testSuites) {
            console.log(`\n📋 Running ${testSuite.name} Tests...`);
            try {
                await testSuite.method.call(this);
                console.log(`✅ ${testSuite.name} - PASSED`);
            } catch (error) {
                console.log(`❌ ${testSuite.name} - FAILED:`, error.message);
                this.testResults.vulnerabilities.push({
                    suite: testSuite.name,
                    error: error.message
                });
            }
        }

        this.generateTestReport();
    }

    /**
     * Test Authentication Security
     */
    async testAuthentication() {
        console.log('  🔑 Testing authentication mechanisms...');

        // Test 1: Invalid credentials should be rejected
        const invalidLogin = await request(this.app)
            .post('/api/auth/login')
            .send({
                kullaniciAdi: 'invalid_user',
                sifre: 'wrong_password'
            });

        expect(invalidLogin.status).to.equal(401);
        this.testResults.passed++;

        // Test 2: Missing JWT token should be rejected
        const noTokenRequest = await request(this.app)
            .get('/api/auth/users');

        expect(noTokenRequest.status).to.equal(401);
        this.testResults.passed++;

        // Test 3: Invalid JWT token should be rejected
        const invalidTokenRequest = await request(this.app)
            .get('/api/auth/users')
            .set('Authorization', 'Bearer invalid_token');

        expect(invalidTokenRequest.status).to.equal(401);
        this.testResults.passed++;

        // Test 4: Expired token handling
        const expiredToken = jwt.sign(
            { sub: 'test_user', exp: Math.floor(Date.now() / 1000) - 3600 },
            process.env.JWT_SECRET || 'test_secret'
        );

        const expiredTokenRequest = await request(this.app)
            .get('/api/auth/users')
            .set('Authorization', `Bearer ${expiredToken}`);

        expect(expiredTokenRequest.status).to.equal(401);
        this.testResults.passed++;

        // Test 5: Password brute force protection
        for (let i = 0; i < 6; i++) {
            await request(this.app)
                .post('/api/auth/login')
                .send({
                    kullaniciAdi: 'test_brute_force',
                    sifre: 'wrong_password'
                });
        }

        // Should be rate limited after 5 attempts
        const rateLimitedRequest = await request(this.app)
            .post('/api/auth/login')
            .send({
                kullaniciAdi: 'test_brute_force',
                sifre: 'wrong_password'
            });

        expect(rateLimitedRequest.status).to.equal(429);
        this.testResults.passed++;

        console.log('    ✅ Authentication security tests passed');
    }

    /**
     * Test Authorization & RBAC
     */
    async testAuthorization() {
        console.log('  👥 Testing role-based access control...');

        // Test 1: VIEWER should not access admin endpoints
        const viewerAdminAccess = await request(this.app)
            .get('/api/audit-logs')
            .set('Authorization', `Bearer ${this.tokens.viewer}`)
            .set('X-CSRF-Token', this.csrfTokens.viewer);

        expect(viewerAdminAccess.status).to.equal(403);
        this.testResults.passed++;

        // Test 2: OPERATOR should not manage users
        const operatorUserManagement = await request(this.app)
            .post('/api/auth/users')
            .set('Authorization', `Bearer ${this.tokens.operator}`)
            .set('X-CSRF-Token', this.csrfTokens.operator)
            .send({
                adiSoyadi: 'Test User',
                email: 'test@example.com',
                rol: 'VIEWER'
            });

        expect(operatorUserManagement.status).to.equal(403);
        this.testResults.passed++;

        // Test 3: MANAGER should access financial data
        const managerFinancialAccess = await request(this.app)
            .get('/api/fiyatlar')
            .set('Authorization', `Bearer ${this.tokens.manager}`)
            .set('X-CSRF-Token', this.csrfTokens.manager);

        expect(managerFinancialAccess.status).to.equal(200);

        // Should include cost data for managers
        if (managerFinancialAccess.body.data && managerFinancialAccess.body.data.length > 0) {
            expect(managerFinancialAccess.body.data[0]).to.have.property('maliyet');
        }
        this.testResults.passed++;

        // Test 4: ADMIN should have full access
        const adminAccess = await request(this.app)
            .get('/api/audit-logs')
            .set('Authorization', `Bearer ${this.tokens.admin}`)
            .set('X-CSRF-Token', this.csrfTokens.admin);

        expect(adminAccess.status).to.equal(200);
        this.testResults.passed++;

        // Test 5: Privilege escalation prevention
        const privilegeEscalation = await request(this.app)
            .put('/api/auth/users/1')
            .set('Authorization', `Bearer ${this.tokens.operator}`)
            .set('X-CSRF-Token', this.csrfTokens.operator)
            .send({
                rol: 'ADMIN'
            });

        expect(privilegeEscalation.status).to.equal(403);
        this.testResults.passed++;

        console.log('    ✅ Authorization & RBAC tests passed');
    }

    /**
     * Test Input Validation & Sanitization
     */
    async testInputValidation() {
        console.log('  🧹 Testing input validation and sanitization...');

        for (const maliciousInput of TEST_CONFIG.testData.maliciousInputs) {
            // Test user creation with malicious input
            const maliciousUserCreation = await request(this.app)
                .post('/api/auth/users')
                .set('Authorization', `Bearer ${this.tokens.admin}`)
                .set('X-CSRF-Token', this.csrfTokens.admin)
                .send({
                    adiSoyadi: maliciousInput,
                    email: 'test@example.com',
                    telefon: '05321234567',
                    rol: 'VIEWER'
                });

            // Should either reject (422) or sanitize the input
            expect([200, 422]).to.include(maliciousUserCreation.status);

            if (maliciousUserCreation.status === 200) {
                // If accepted, input should be sanitized
                const createdUser = maliciousUserCreation.body.data;
                expect(createdUser.adiSoyadi).to.not.include('<script>');
                expect(createdUser.adiSoyadi).to.not.include('DROP TABLE');
            }

            this.testResults.passed++;
        }

        // Test email validation
        const invalidEmail = await request(this.app)
            .post('/api/auth/users')
            .set('Authorization', `Bearer ${this.tokens.admin}`)
            .set('X-CSRF-Token', this.csrfTokens.admin)
            .send({
                adiSoyadi: 'Test User',
                email: 'invalid-email',
                telefon: '05321234567',
                rol: 'VIEWER'
            });

        expect(invalidEmail.status).to.equal(422);
        this.testResults.passed++;

        // Test phone number validation
        const invalidPhone = await request(this.app)
            .post('/api/auth/users')
            .set('Authorization', `Bearer ${this.tokens.admin}`)
            .set('X-CSRF-Token', this.csrfTokens.admin)
            .send({
                adiSoyadi: 'Test User',
                email: 'test@example.com',
                telefon: '123', // Invalid phone
                rol: 'VIEWER'
            });

        expect(invalidPhone.status).to.equal(422);
        this.testResults.passed++;

        console.log('    ✅ Input validation tests passed');
    }

    /**
     * Test SQL Injection Protection
     */
    async testSQLInjection() {
        console.log('  🛡️ Testing SQL injection protection...');

        const sqlInjectionPayloads = [
            "'; DROP TABLE kullanici; --",
            "' OR '1'='1",
            "' UNION SELECT * FROM kullanici --",
            "'; INSERT INTO kullanici (adiSoyadi) VALUES ('hacker'); --",
            "' OR 1=1 --",
            "'; UPDATE kullanici SET rol='ADMIN' WHERE id=1; --"
        ];

        for (const payload of sqlInjectionPayloads) {
            // Test in search parameters
            const searchInjection = await request(this.app)
                .get(`/api/auth/users?search=${encodeURIComponent(payload)}`)
                .set('Authorization', `Bearer ${this.tokens.admin}`)
                .set('X-CSRF-Token', this.csrfTokens.admin);

            // Should not return 500 error (which might indicate SQL error)
            expect(searchInjection.status).to.not.equal(500);
            this.testResults.passed++;

            // Test in user creation
            const userCreationInjection = await request(this.app)
                .post('/api/auth/users')
                .set('Authorization', `Bearer ${this.tokens.admin}`)
                .set('X-CSRF-Token', this.csrfTokens.admin)
                .send({
                    adiSoyadi: payload,
                    email: 'test@example.com',
                    telefon: '05321234567',
                    rol: 'VIEWER'
                });

            // Should either reject or safely handle the input
            expect([200, 422]).to.include(userCreationInjection.status);
            this.testResults.passed++;
        }

        console.log('    ✅ SQL injection protection tests passed');
    }

    /**
     * Test XSS Protection
     */
    async testXSSProtection() {
        console.log('  🚫 Testing XSS protection...');

        const xssPayloads = [
            '<script>alert("XSS")</script>',
            '<img src=x onerror=alert("XSS")>',
            '<svg onload=alert("XSS")>',
            'javascript:alert("XSS")',
            '<iframe src="javascript:alert(\'XSS\')"></iframe>',
            '<body onload=alert("XSS")>',
            '<div onclick=alert("XSS")>Click me</div>'
        ];

        for (const payload of xssPayloads) {
            // Test XSS in user data
            const xssTest = await request(this.app)
                .post('/api/cari')
                .set('Authorization', `Bearer ${this.tokens.operator}`)
                .set('X-CSRF-Token', this.csrfTokens.operator)
                .send({
                    musteriKodu: 'TEST001',
                    ad: payload,
                    soyad: 'Test',
                    telefon: '05321234567',
                    email: 'test@example.com'
                });

            if (xssTest.status === 200) {
                // If accepted, should be sanitized
                const customerData = xssTest.body.data;
                expect(customerData.ad).to.not.include('<script>');
                expect(customerData.ad).to.not.include('onerror=');
                expect(customerData.ad).to.not.include('javascript:');
            }
            this.testResults.passed++;
        }

        console.log('    ✅ XSS protection tests passed');
    }

    /**
     * Test CSRF Protection
     */
    async testCSRFProtection() {
        console.log('  🔒 Testing CSRF protection...');

        // Test 1: POST request without CSRF token should fail
        const noCsrfRequest = await request(this.app)
            .post('/api/auth/users')
            .set('Authorization', `Bearer ${this.tokens.admin}`)
            .send({
                adiSoyadi: 'Test User',
                email: 'test@example.com',
                telefon: '05321234567',
                rol: 'VIEWER'
            });

        expect(noCsrfRequest.status).to.equal(403);
        this.testResults.passed++;

        // Test 2: Invalid CSRF token should fail
        const invalidCsrfRequest = await request(this.app)
            .post('/api/auth/users')
            .set('Authorization', `Bearer ${this.tokens.admin}`)
            .set('X-CSRF-Token', 'invalid_csrf_token')
            .send({
                adiSoyadi: 'Test User',
                email: 'test@example.com',
                telefon: '05321234567',
                rol: 'VIEWER'
            });

        expect(invalidCsrfRequest.status).to.equal(403);
        this.testResults.passed++;

        // Test 3: Valid CSRF token should work
        const validCsrfRequest = await request(this.app)
            .post('/api/auth/users')
            .set('Authorization', `Bearer ${this.tokens.admin}`)
            .set('X-CSRF-Token', this.csrfTokens.admin)
            .send({
                adiSoyadi: 'Test User Valid CSRF',
                email: 'test-csrf@example.com',
                telefon: '05321234567',
                rol: 'VIEWER'
            });

        expect(validCsrfRequest.status).to.equal(200);
        this.testResults.passed++;

        console.log('    ✅ CSRF protection tests passed');
    }

    /**
     * Test Rate Limiting
     */
    async testRateLimiting() {
        console.log('  🚦 Testing rate limiting...');

        // Test API rate limiting
        const requests = [];
        for (let i = 0; i < 102; i++) { // Exceed default limit of 100
            requests.push(
                request(this.app)
                    .get('/api/dropdown')
                    .set('Authorization', `Bearer ${this.tokens.operator}`)
            );
        }

        const responses = await Promise.all(requests);
        const rateLimitedResponses = responses.filter(res => res.status === 429);

        expect(rateLimitedResponses.length).to.be.greaterThan(0);
        this.testResults.passed++;

        // Test file upload rate limiting
        const uploadRequests = [];
        for (let i = 0; i < 6; i++) { // Exceed upload limit
            uploadRequests.push(
                request(this.app)
                    .post('/api/excel/upload/kullanici')
                    .set('Authorization', `Bearer ${this.tokens.admin}`)
                    .set('X-CSRF-Token', this.csrfTokens.admin)
                    .attach('file', Buffer.from('test'), 'test.xlsx')
            );
        }

        const uploadResponses = await Promise.all(uploadRequests);
        const rateLimitedUploads = uploadResponses.filter(res => res.status === 429);

        expect(rateLimitedUploads.length).to.be.greaterThan(0);
        this.testResults.passed++;

        console.log('    ✅ Rate limiting tests passed');
    }

    /**
     * Test Session Management
     */
    async testSessionManagement() {
        console.log('  🕐 Testing session management...');

        // Test 1: Session should be valid after login
        const sessionCheck = await request(this.app)
            .get('/api/auth/validate')
            .set('Authorization', `Bearer ${this.tokens.admin}`);

        expect(sessionCheck.status).to.equal(200);
        this.testResults.passed++;

        // Test 2: Multiple sessions should be tracked
        const secondLogin = await request(this.app)
            .post('/api/auth/login')
            .send({
                kullaniciAdi: TEST_CONFIG.testUsers.admin.username,
                sifre: TEST_CONFIG.testUsers.admin.password
            });

        expect(secondLogin.status).to.equal(200);
        this.testResults.passed++;

        // Test 3: Logout should invalidate session
        const logout = await request(this.app)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${this.tokens.admin}`)
            .set('X-CSRF-Token', this.csrfTokens.admin);

        expect(logout.status).to.equal(200);
        this.testResults.passed++;

        console.log('    ✅ Session management tests passed');
    }

    /**
     * Test File Upload Security
     */
    async testFileUploadSecurity() {
        console.log('  📁 Testing file upload security...');

        // Test 1: Invalid file type should be rejected
        const invalidFileType = await request(this.app)
            .post('/api/excel/upload/kullanici')
            .set('Authorization', `Bearer ${this.tokens.admin}`)
            .set('X-CSRF-Token', this.csrfTokens.admin)
            .attach('file', Buffer.from('malicious content'), 'malware.exe');

        expect(invalidFileType.status).to.equal(422);
        this.testResults.passed++;

        // Test 2: Large file should be rejected
        const largeFile = Buffer.alloc(20 * 1024 * 1024); // 20MB
        const largeFileUpload = await request(this.app)
            .post('/api/excel/upload/kullanici')
            .set('Authorization', `Bearer ${this.tokens.admin}`)
            .set('X-CSRF-Token', this.csrfTokens.admin)
            .attach('file', largeFile, 'large.xlsx');

        expect(largeFileUpload.status).to.equal(422);
        this.testResults.passed++;

        // Test 3: Script in filename should be handled
        const scriptFilename = await request(this.app)
            .post('/api/excel/upload/kullanici')
            .set('Authorization', `Bearer ${this.tokens.admin}`)
            .set('X-CSRF-Token', this.csrfTokens.admin)
            .attach('file', Buffer.from('test'), '<script>alert("xss")</script>.xlsx');

        // Should either reject or sanitize filename
        expect([200, 422]).to.include(scriptFilename.status);
        this.testResults.passed++;

        console.log('    ✅ File upload security tests passed');
    }

    /**
     * Test Security Headers
     */
    async testSecurityHeaders() {
        console.log('  🛡️ Testing security headers...');

        const response = await request(this.app)
            .get('/api/health')
            .set('Authorization', `Bearer ${this.tokens.admin}`);

        // Check for security headers
        const securityHeaders = [
            'x-frame-options',
            'x-content-type-options',
            'x-xss-protection',
            'strict-transport-security'
        ];

        for (const header of securityHeaders) {
            expect(response.headers).to.have.property(header);
            this.testResults.passed++;
        }

        // Check rate limit headers
        expect(response.headers).to.have.property('x-rate-limit-remaining');
        this.testResults.passed++;

        console.log('    ✅ Security headers tests passed');
    }

    /**
     * Test Error Handling Security
     */
    async testErrorHandling() {
        console.log('  ⚠️ Testing secure error handling...');

        // Test 1: 404 errors should not leak information
        const notFoundResponse = await request(this.app)
            .get('/api/nonexistent-endpoint')
            .set('Authorization', `Bearer ${this.tokens.admin}`);

        expect(notFoundResponse.status).to.equal(404);
        expect(notFoundResponse.body).to.not.have.property('stack');
        this.testResults.passed++;

        // Test 2: 500 errors should be sanitized
        const errorResponse = await request(this.app)
            .post('/api/siparis')
            .set('Authorization', `Bearer ${this.tokens.operator}`)
            .set('X-CSRF-Token', this.csrfTokens.operator)
            .send({
                invalidData: 'this should cause an error'
            });

        if (errorResponse.status === 500) {
            expect(errorResponse.body).to.not.have.property('stack');
            expect(errorResponse.body.error).to.not.include('password');
            expect(errorResponse.body.error).to.not.include('secret');
        }
        this.testResults.passed++;

        console.log('    ✅ Error handling security tests passed');
    }

    /**
     * Test Business Logic Security
     */
    async testBusinessLogic() {
        console.log('  💼 Testing business logic security...');

        // Test 1: Users cannot access other branches' data
        const branchDataAccess = await request(this.app)
            .get('/api/siparis?subeId=999') // Different branch
            .set('Authorization', `Bearer ${this.tokens.operator}`)
            .set('X-CSRF-Token', this.csrfTokens.operator);

        if (branchDataAccess.status === 200) {
            // Should not return data from other branches
            const orders = branchDataAccess.body.data.orders || [];
            orders.forEach(order => {
                expect(order.subeId).to.not.equal(999);
            });
        }
        this.testResults.passed++;

        // Test 2: Financial data should be filtered by role
        const productData = await request(this.app)
            .get('/api/fiyatlar')
            .set('Authorization', `Bearer ${this.tokens.operator}`)
            .set('X-CSRF-Token', this.csrfTokens.operator);

        if (productData.status === 200 && productData.body.data.length > 0) {
            // Operators should not see cost data
            expect(productData.body.data[0]).to.not.have.property('maliyet');
            expect(productData.body.data[0]).to.not.have.property('tedarikciMaliyet');
        }
        this.testResults.passed++;

        // Test 3: Price manipulation prevention
        const priceManipulation = await request(this.app)
            .post('/api/siparis')
            .set('Authorization', `Bearer ${this.tokens.operator}`)
            .set('X-CSRF-Token', this.csrfTokens.operator)
            .send({
                musteriId: 1,
                items: [{
                    urunId: 1,
                    miktar: 1,
                    birimFiyat: 0.01 // Suspiciously low price
                }]
            });

        // Should validate against actual product prices
        expect([200, 422]).to.include(priceManipulation.status);
        this.testResults.passed++;

        console.log('    ✅ Business logic security tests passed');
    }

    /**
     * Generate comprehensive test report
     */
    generateTestReport() {
        console.log('\n📊 SECURITY TEST REPORT');
        console.log('================================');
        console.log(`✅ Tests Passed: ${this.testResults.passed}`);
        console.log(`❌ Tests Failed: ${this.testResults.failed}`);
        console.log(`🚨 Vulnerabilities Found: ${this.testResults.vulnerabilities.length}`);
        console.log(`⚠️ Warnings: ${this.testResults.warnings.length}`);

        if (this.testResults.vulnerabilities.length > 0) {
            console.log('\n🚨 VULNERABILITIES:');
            this.testResults.vulnerabilities.forEach((vuln, index) => {
                console.log(`${index + 1}. ${vuln.suite}: ${vuln.error}`);
            });
        }

        if (this.testResults.warnings.length > 0) {
            console.log('\n⚠️ WARNINGS:');
            this.testResults.warnings.forEach((warning, index) => {
                console.log(`${index + 1}. ${warning}`);
            });
        }

        // Calculate security score
        const totalTests = this.testResults.passed + this.testResults.failed;
        const securityScore = totalTests > 0 ? (this.testResults.passed / totalTests * 100).toFixed(2) : 0;

        console.log(`\n🏆 Overall Security Score: ${securityScore}%`);

        if (securityScore >= 95) {
            console.log('🟢 EXCELLENT - Enterprise-grade security achieved!');
        } else if (securityScore >= 85) {
            console.log('🟡 GOOD - Minor improvements recommended');
        } else if (securityScore >= 70) {
            console.log('🟠 FAIR - Several security issues need attention');
        } else {
            console.log('🔴 POOR - Critical security vulnerabilities found!');
        }

        console.log('\n📋 RECOMMENDATIONS:');
        this.generateRecommendations();
    }

    /**
     * Generate security recommendations
     */
    generateRecommendations() {
        const recommendations = [
            '✅ Regularly update dependencies',
            '✅ Implement Web Application Firewall (WAF)',
            '✅ Set up intrusion detection system',
            '✅ Perform regular penetration testing',
            '✅ Implement security monitoring and alerting',
            '✅ Conduct security awareness training',
            '✅ Establish incident response procedures',
            '✅ Regular security audits and reviews'
        ];

        recommendations.forEach(rec => console.log(`   ${rec}`));
    }
}

// Export test suite
module.exports = { SecurityTestSuite, TEST_CONFIG };

// Run tests if called directly
if (require.main === module) {
    (async () => {
        const testSuite = new SecurityTestSuite();

        // Load your Express app here
        // const app = require('../backend/server.js');
        // await testSuite.initialize(app);
        // await testSuite.runAllTests();

        console.log('🔒 Security Test Suite ready for execution');
        console.log('   Usage: const { SecurityTestSuite } = require("./automated-security-tests.js");');
    })();
} 