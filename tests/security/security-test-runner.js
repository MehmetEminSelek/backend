/**
 * =============================================
 * SECURITY TEST RUNNER - MASTER CONTROLLER
 * =============================================
 * 
 * Orchestrates all security tests and generates comprehensive reports
 */

const { SecurityTestSuite } = require('./automated-security-tests');
const { VulnerabilityScanner } = require('./vulnerability-scanner');
const { PerformanceSecurityTest } = require('./performance-security-test');
const fs = require('fs').promises;
const path = require('path');

class SecurityTestRunner {
    constructor(options = {}) {
        this.config = {
            baseURL: options.baseURL || 'http://localhost:3000',
            outputDir: options.outputDir || './security-test-results',
            verbose: options.verbose || false,
            testSuites: options.testSuites || ['automated', 'vulnerability', 'performance'],
            format: options.format || ['json', 'html']
        };

        this.results = {
            timestamp: new Date().toISOString(),
            testSuites: {},
            overallScore: 0,
            riskLevel: 'UNKNOWN',
            summary: {},
            recommendations: []
        };
    }

    /**
     * Run all security tests
     */
    async runAllTests() {
        console.log('🚀 COMPREHENSIVE SECURITY TESTING STARTED');
        console.log('==========================================\n');

        // Create output directory
        await this.createOutputDirectory();

        // Run test suites based on configuration
        if (this.config.testSuites.includes('automated')) {
            await this.runAutomatedTests();
        }

        if (this.config.testSuites.includes('vulnerability')) {
            await this.runVulnerabilityScanning();
        }

        if (this.config.testSuites.includes('performance')) {
            await this.runPerformanceTests();
        }

        // Generate comprehensive report
        await this.generateComprehensiveReport();

        console.log('\n🎉 SECURITY TESTING COMPLETED');
        console.log('==============================');
        this.displaySummary();
    }

    /**
     * Run automated security tests
     */
    async runAutomatedTests() {
        console.log('🔧 Running Automated Security Tests...\n');

        try {
            const testSuite = new SecurityTestSuite();

            // Mock app for testing (in real scenario, pass actual Express app)
            const mockApp = this.createMockApp();
            await testSuite.initialize(mockApp);

            // Capture test results
            const startTime = Date.now();
            await testSuite.runAllTests();
            const duration = Date.now() - startTime;

            this.results.testSuites.automated = {
                status: 'COMPLETED',
                duration: duration,
                passed: testSuite.testResults.passed,
                failed: testSuite.testResults.failed,
                vulnerabilities: testSuite.testResults.vulnerabilities,
                score: this.calculateAutomatedTestScore(testSuite.testResults)
            };

            console.log('✅ Automated Security Tests Completed\n');

        } catch (error) {
            console.error('❌ Automated Security Tests Failed:', error.message);
            this.results.testSuites.automated = {
                status: 'FAILED',
                error: error.message,
                score: 0
            };
        }
    }

    /**
     * Run vulnerability scanning
     */
    async runVulnerabilityScanning() {
        console.log('🔍 Running Vulnerability Scanning...\n');

        try {
            const scanner = new VulnerabilityScanner({
                baseURL: this.config.baseURL,
                output: path.join(this.config.outputDir, 'vulnerability-scan.json'),
                verbose: this.config.verbose
            });

            const startTime = Date.now();
            const scanResults = await scanner.runScan();
            const duration = Date.now() - startTime;

            this.results.testSuites.vulnerability = {
                status: 'COMPLETED',
                duration: duration,
                vulnerabilitiesFound: scanResults.vulnerabilitiesFound,
                riskScore: scanResults.riskScore,
                categories: scanResults.categories,
                score: this.calculateVulnerabilityScore(scanResults)
            };

            console.log('✅ Vulnerability Scanning Completed\n');

        } catch (error) {
            console.error('❌ Vulnerability Scanning Failed:', error.message);
            this.results.testSuites.vulnerability = {
                status: 'FAILED',
                error: error.message,
                score: 0
            };
        }
    }

    /**
     * Run performance security tests
     */
    async runPerformanceTests() {
        console.log('⚡ Running Performance Security Tests...\n');

        try {
            const perfTest = new PerformanceSecurityTest({
                baseURL: this.config.baseURL,
                iterations: 50, // Reduced for faster testing
                concurrency: 5
            });

            const startTime = Date.now();
            await perfTest.runTests();
            const duration = Date.now() - startTime;

            // Read the generated performance report
            const perfReport = JSON.parse(await fs.readFile('./performance-security-report.json', 'utf8'));

            this.results.testSuites.performance = {
                status: 'COMPLETED',
                duration: duration,
                averageResponseTime: perfReport.summary.overallAvg,
                throughput: perfReport.summary.overallThroughput,
                successRate: perfReport.summary.overallSuccessRate,
                grade: perfReport.summary.performanceGrade,
                score: this.calculatePerformanceScore(perfReport.summary)
            };

            console.log('✅ Performance Security Tests Completed\n');

        } catch (error) {
            console.error('❌ Performance Security Tests Failed:', error.message);
            this.results.testSuites.performance = {
                status: 'FAILED',
                error: error.message,
                score: 0
            };
        }
    }

    /**
     * Create output directory
     */
    async createOutputDirectory() {
        try {
            await fs.mkdir(this.config.outputDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create output directory:', error.message);
        }
    }

    /**
     * Create mock app for testing
     */
    createMockApp() {
        // This would be replaced with actual Express app in real scenario
        return {
            request: (method, path) => ({
                status: 200,
                data: { success: true }
            })
        };
    }

    /**
     * Calculate automated test score
     */
    calculateAutomatedTestScore(results) {
        const total = results.passed + results.failed;
        if (total === 0) return 0;

        const baseScore = (results.passed / total) * 100;
        const vulnerabilityPenalty = results.vulnerabilities.length * 10;

        return Math.max(0, baseScore - vulnerabilityPenalty);
    }

    /**
     * Calculate vulnerability score
     */
    calculateVulnerabilityScore(results) {
        // Score based on inverse of risk score (lower risk = higher score)
        const maxRisk = 100;
        return Math.max(0, ((maxRisk - results.riskScore) / maxRisk) * 100);
    }

    /**
     * Calculate performance score
     */
    calculatePerformanceScore(summary) {
        let score = 100;

        // Response time penalty
        if (summary.overallAvg > 500) score -= 30;
        else if (summary.overallAvg > 200) score -= 15;

        // Success rate penalty
        if (summary.overallSuccessRate < 95) score -= 20;
        else if (summary.overallSuccessRate < 98) score -= 10;

        return Math.max(0, score);
    }

    /**
     * Calculate overall security score
     */
    calculateOverallScore() {
        const scores = [];
        const weights = {
            automated: 0.4,    // 40% weight
            vulnerability: 0.4, // 40% weight
            performance: 0.2    // 20% weight
        };

        Object.entries(this.results.testSuites).forEach(([suite, results]) => {
            if (results.status === 'COMPLETED' && typeof results.score === 'number') {
                scores.push({
                    score: results.score,
                    weight: weights[suite] || 0
                });
            }
        });

        if (scores.length === 0) return 0;

        const weightedSum = scores.reduce((sum, s) => sum + (s.score * s.weight), 0);
        const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);

        return totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    /**
     * Determine risk level
     */
    determineRiskLevel(score) {
        if (score >= 90) return 'LOW';
        if (score >= 75) return 'MEDIUM';
        if (score >= 50) return 'HIGH';
        return 'CRITICAL';
    }

    /**
     * Generate comprehensive report
     */
    async generateComprehensiveReport() {
        console.log('📊 Generating Comprehensive Security Report...\n');

        // Calculate overall metrics
        this.results.overallScore = this.calculateOverallScore();
        this.results.riskLevel = this.determineRiskLevel(this.results.overallScore);
        this.results.summary = this.generateSummary();
        this.results.recommendations = this.generateRecommendations();

        // Generate reports in different formats
        if (this.config.format.includes('json')) {
            await this.generateJSONReport();
        }

        if (this.config.format.includes('html')) {
            await this.generateHTMLReport();
        }

        console.log('✅ Reports Generated\n');
    }

    /**
     * Generate summary
     */
    generateSummary() {
        const summary = {
            testSuitesRun: Object.keys(this.results.testSuites).length,
            testSuitesCompleted: Object.values(this.results.testSuites).filter(s => s.status === 'COMPLETED').length,
            overallScore: this.results.overallScore,
            riskLevel: this.results.riskLevel,
            securityGrade: this.getSecurityGrade(this.results.overallScore)
        };

        // Add specific metrics from each test suite
        if (this.results.testSuites.automated) {
            summary.automatedTests = {
                passed: this.results.testSuites.automated.passed || 0,
                failed: this.results.testSuites.automated.failed || 0,
                vulnerabilities: this.results.testSuites.automated.vulnerabilities?.length || 0
            };
        }

        if (this.results.testSuites.vulnerability) {
            summary.vulnerabilityScanning = {
                vulnerabilitiesFound: this.results.testSuites.vulnerability.vulnerabilitiesFound || 0,
                riskScore: this.results.testSuites.vulnerability.riskScore || 0
            };
        }

        if (this.results.testSuites.performance) {
            summary.performanceTesting = {
                averageResponseTime: this.results.testSuites.performance.averageResponseTime || 0,
                grade: this.results.testSuites.performance.grade || 'Unknown'
            };
        }

        return summary;
    }

    /**
     * Get security grade
     */
    getSecurityGrade(score) {
        if (score >= 95) return 'A+';
        if (score >= 90) return 'A';
        if (score >= 85) return 'B+';
        if (score >= 80) return 'B';
        if (score >= 75) return 'C+';
        if (score >= 70) return 'C';
        if (score >= 65) return 'D+';
        if (score >= 60) return 'D';
        return 'F';
    }

    /**
     * Generate recommendations
     */
    generateRecommendations() {
        const recommendations = [];

        // Based on overall score
        if (this.results.overallScore < 70) {
            recommendations.push({
                priority: 'CRITICAL',
                category: 'Overall Security',
                recommendation: 'Immediate security improvements required - overall score below acceptable threshold'
            });
        }

        // Based on automated test results
        if (this.results.testSuites.automated) {
            const auto = this.results.testSuites.automated;
            if (auto.failed > 0) {
                recommendations.push({
                    priority: 'HIGH',
                    category: 'Automated Testing',
                    recommendation: `Fix ${auto.failed} failed security tests`
                });
            }
            if (auto.vulnerabilities?.length > 0) {
                recommendations.push({
                    priority: 'HIGH',
                    category: 'Security Vulnerabilities',
                    recommendation: `Address ${auto.vulnerabilities.length} detected vulnerabilities`
                });
            }
        }

        // Based on vulnerability scanning
        if (this.results.testSuites.vulnerability) {
            const vuln = this.results.testSuites.vulnerability;
            if (vuln.vulnerabilitiesFound > 0) {
                recommendations.push({
                    priority: 'HIGH',
                    category: 'Vulnerability Management',
                    recommendation: `Remediate ${vuln.vulnerabilitiesFound} discovered vulnerabilities`
                });
            }
        }

        // Based on performance testing
        if (this.results.testSuites.performance) {
            const perf = this.results.testSuites.performance;
            if (perf.averageResponseTime > 500) {
                recommendations.push({
                    priority: 'MEDIUM',
                    category: 'Performance',
                    recommendation: 'Optimize application performance - response times exceed 500ms'
                });
            }
        }

        // General recommendations
        recommendations.push(
            {
                priority: 'MEDIUM',
                category: 'Continuous Security',
                recommendation: 'Implement automated security testing in CI/CD pipeline'
            },
            {
                priority: 'MEDIUM',
                category: 'Security Monitoring',
                recommendation: 'Set up continuous security monitoring and alerting'
            },
            {
                priority: 'LOW',
                category: 'Security Training',
                recommendation: 'Conduct regular security awareness training for development team'
            }
        );

        return recommendations;
    }

    /**
     * Generate JSON report
     */
    async generateJSONReport() {
        const reportPath = path.join(this.config.outputDir, 'comprehensive-security-report.json');
        await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));
        console.log(`   📄 JSON Report: ${reportPath}`);
    }

    /**
     * Generate HTML report
     */
    async generateHTMLReport() {
        const htmlContent = this.generateHTMLContent();
        const reportPath = path.join(this.config.outputDir, 'security-report.html');
        await fs.writeFile(reportPath, htmlContent);
        console.log(`   🌐 HTML Report: ${reportPath}`);
    }

    /**
     * Generate HTML content
     */
    generateHTMLContent() {
        const { summary } = this.results;

        return `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Assessment Report - Ömer Güllü Sipariş Sistemi</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }
        .score-card { display: flex; justify-content: space-around; margin: 20px 0; }
        .score-item { text-align: center; padding: 20px; border-radius: 8px; min-width: 150px; }
        .score-high { background: #d4edda; border: 1px solid #c3e6cb; }
        .score-medium { background: #fff3cd; border: 1px solid #ffeaa7; }
        .score-low { background: #f8d7da; border: 1px solid #f5c6cb; }
        .test-suite { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        .recommendations { background: #e9ecef; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .priority-critical { color: #dc3545; font-weight: bold; }
        .priority-high { color: #fd7e14; font-weight: bold; }
        .priority-medium { color: #ffc107; font-weight: bold; }
        .priority-low { color: #28a745; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Security Assessment Report</h1>
            <h2>Ömer Güllü Sipariş Sistemi</h2>
            <p>Generated: ${new Date(this.results.timestamp).toLocaleString('tr-TR')}</p>
        </div>

        <div class="score-card">
            <div class="score-item ${this.results.overallScore >= 80 ? 'score-high' : this.results.overallScore >= 60 ? 'score-medium' : 'score-low'}">
                <h3>Overall Security Score</h3>
                <div style="font-size: 2em; font-weight: bold;">${Math.round(this.results.overallScore)}/100</div>
                <div>Grade: ${summary.securityGrade}</div>
            </div>
            <div class="score-item ${this.results.riskLevel === 'LOW' ? 'score-high' : this.results.riskLevel === 'MEDIUM' ? 'score-medium' : 'score-low'}">
                <h3>Risk Level</h3>
                <div style="font-size: 1.5em; font-weight: bold;">${this.results.riskLevel}</div>
            </div>
            <div class="score-item score-high">
                <h3>Test Suites</h3>
                <div style="font-size: 1.5em;">${summary.testSuitesCompleted}/${summary.testSuitesRun}</div>
                <div>Completed</div>
            </div>
        </div>

        <h2>📊 Test Suite Results</h2>
        ${Object.entries(this.results.testSuites).map(([name, results]) => `
            <div class="test-suite">
                <h3>${name.charAt(0).toUpperCase() + name.slice(1)} Testing</h3>
                <p><strong>Status:</strong> ${results.status}</p>
                ${results.status === 'COMPLETED' ? `
                    <p><strong>Score:</strong> ${Math.round(results.score || 0)}/100</p>
                    <p><strong>Duration:</strong> ${Math.round((results.duration || 0) / 1000)}s</p>
                ` : `
                    <p><strong>Error:</strong> ${results.error || 'Unknown error'}</p>
                `}
            </div>
        `).join('')}

        <h2>💡 Security Recommendations</h2>
        <div class="recommendations">
            <table>
                <thead>
                    <tr>
                        <th>Priority</th>
                        <th>Category</th>
                        <th>Recommendation</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.results.recommendations.map(rec => `
                        <tr>
                            <td class="priority-${rec.priority.toLowerCase()}">${rec.priority}</td>
                            <td>${rec.category}</td>
                            <td>${rec.recommendation}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666;">
            <p>This report was generated by the Ömer Güllü Security Testing Suite</p>
            <p>For detailed information, review the individual test reports in the output directory</p>
        </div>
    </div>
</body>
</html>`;
    }

    /**
     * Display summary in console
     */
    displaySummary() {
        const { summary } = this.results;

        console.log(`\n🎯 SECURITY ASSESSMENT SUMMARY`);
        console.log(`Overall Score: ${Math.round(this.results.overallScore)}/100 (${summary.securityGrade})`);
        console.log(`Risk Level: ${this.results.riskLevel}`);
        console.log(`Test Suites Completed: ${summary.testSuitesCompleted}/${summary.testSuitesRun}`);

        if (summary.automatedTests) {
            console.log(`\n🔧 Automated Tests: ${summary.automatedTests.passed} passed, ${summary.automatedTests.failed} failed`);
        }

        if (summary.vulnerabilityScanning) {
            console.log(`🔍 Vulnerabilities Found: ${summary.vulnerabilityScanning.vulnerabilitiesFound}`);
        }

        if (summary.performanceTesting) {
            console.log(`⚡ Performance Grade: ${summary.performanceTesting.grade}`);
        }

        console.log(`\n📁 Results saved to: ${this.config.outputDir}`);

        // Show next steps based on results
        if (this.results.overallScore >= 90) {
            console.log(`\n🎉 Excellent security posture! Continue monitoring and regular testing.`);
        } else if (this.results.overallScore >= 75) {
            console.log(`\n✅ Good security level with room for improvement.`);
        } else if (this.results.overallScore >= 50) {
            console.log(`\n⚠️ Security improvements needed. Review recommendations carefully.`);
        } else {
            console.log(`\n🚨 Critical security issues detected. Immediate action required!`);
        }
    }
}

// Export for use
module.exports = { SecurityTestRunner };

// CLI usage
if (require.main === module) {
    const config = {
        baseURL: process.argv[2] || 'http://localhost:3000',
        outputDir: process.argv[3] || './security-test-results',
        verbose: process.argv.includes('--verbose'),
        testSuites: process.argv.includes('--quick') ? ['automated'] : ['automated', 'vulnerability', 'performance']
    };

    const runner = new SecurityTestRunner(config);
    runner.runAllTests().catch(console.error);
} 