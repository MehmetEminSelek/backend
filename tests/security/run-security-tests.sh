#!/bin/bash

# =============================================
# SECURITY TEST RUNNER SCRIPT
# =============================================
# 
# Automated security testing for Ömer Güllü Sipariş Sistemi
# Runs comprehensive security assessment including:
# - Automated security tests
# - Vulnerability scanning
# - Performance security testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
BASE_URL="http://localhost:3000"
OUTPUT_DIR="./security-test-results"
TEST_MODE="full"
VERBOSE=false

# Print banner
print_banner() {
    echo -e "${BLUE}"
    echo "======================================================"
    echo "🔒 ÖMER GÜLLÜ SİPARİŞ SİSTEMİ - GÜVENLİK TESTLERİ"
    echo "======================================================"
    echo -e "${NC}"
}

# Print help
print_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -u, --url URL          Target URL (default: http://localhost:3000)"
    echo "  -o, --output DIR       Output directory (default: ./security-test-results)"
    echo "  -m, --mode MODE        Test mode: quick|full|custom (default: full)"
    echo "  -v, --verbose          Enable verbose output"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Test Modes:"
    echo "  quick     - Only automated security tests (5-10 minutes)"
    echo "  full      - All security tests (15-30 minutes)"
    echo "  custom    - Interactive mode to select specific tests"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Run full test suite on localhost"
    echo "  $0 -u https://test.ogsiparis.com     # Test production environment"
    echo "  $0 -m quick -v                       # Quick test with verbose output"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            BASE_URL="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -m|--mode)
            TEST_MODE="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_help
            exit 1
            ;;
    esac
done

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is required but not installed${NC}"
        exit 1
    fi
    
    # Check npm packages
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ package.json not found. Run from project root directory${NC}"
        exit 1
    fi
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}📦 Installing dependencies...${NC}"
        npm install
    fi
    
    # Check if target is accessible
    echo -e "${BLUE}🌐 Testing connection to ${BASE_URL}...${NC}"
    if curl -f -s "$BASE_URL/api/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Target is accessible${NC}"
    else
        echo -e "${YELLOW}⚠️ Target may not be accessible. Continuing anyway...${NC}"
    fi
    
    echo ""
}

# Create output directory
setup_output_dir() {
    echo -e "${BLUE}📁 Setting up output directory: ${OUTPUT_DIR}${NC}"
    mkdir -p "$OUTPUT_DIR"
    
    # Create timestamp subdirectory
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    RESULT_DIR="$OUTPUT_DIR/security_test_$TIMESTAMP"
    mkdir -p "$RESULT_DIR"
    
    echo -e "${GREEN}✅ Results will be saved to: ${RESULT_DIR}${NC}"
    echo ""
}

# Interactive test selection
interactive_mode() {
    echo -e "${BLUE}🎯 Interactive Test Selection${NC}"
    echo ""
    echo "Available test suites:"
    echo "  1) Automated Security Tests (Fast, comprehensive)"
    echo "  2) Vulnerability Scanning (Medium, detailed)"  
    echo "  3) Performance Security Tests (Medium, performance impact)"
    echo "  4) All Tests (Slow, complete assessment)"
    echo ""
    
    read -p "Select tests to run (1,2,3 or 4): " selection
    
    case $selection in
        1)
            TEST_SUITES="automated"
            ;;
        2)
            TEST_SUITES="vulnerability"
            ;;
        3)
            TEST_SUITES="performance"
            ;;
        4)
            TEST_SUITES="automated,vulnerability,performance"
            ;;
        *)
            echo -e "${RED}❌ Invalid selection${NC}"
            exit 1
            ;;
    esac
    
    echo -e "${GREEN}✅ Selected test suites: ${TEST_SUITES}${NC}"
    echo ""
}

# Run security tests
run_tests() {
    echo -e "${BLUE}🚀 Starting Security Tests...${NC}"
    echo -e "${BLUE}Target: ${BASE_URL}${NC}"
    echo -e "${BLUE}Mode: ${TEST_MODE}${NC}"
    echo ""
    
    # Determine test suites based on mode
    case $TEST_MODE in
        quick)
            TEST_SUITES="automated"
            ;;
        full)
            TEST_SUITES="automated,vulnerability,performance"
            ;;
        custom)
            interactive_mode
            ;;
        *)
            echo -e "${RED}❌ Invalid test mode: $TEST_MODE${NC}"
            exit 1
            ;;
    esac
    
    # Build command arguments
    ARGS="$BASE_URL $RESULT_DIR"
    if [ "$VERBOSE" = true ]; then
        ARGS="$ARGS --verbose"
    fi
    
    # Add test suite selection
    if [ "$TEST_MODE" = "quick" ]; then
        ARGS="$ARGS --quick"
    fi
    
    # Run the test runner
    echo -e "${BLUE}🧪 Executing test runner...${NC}"
    
    if [ "$VERBOSE" = true ]; then
        node tests/security/security-test-runner.js $ARGS
    else
        node tests/security/security-test-runner.js $ARGS 2>/dev/null || {
            echo -e "${RED}❌ Security tests failed. Run with -v for details.${NC}"
            exit 1
        }
    fi
}

# Generate summary report
generate_summary() {
    echo -e "${BLUE}📊 Generating Test Summary...${NC}"
    
    # Check if comprehensive report exists
    REPORT_FILE="$RESULT_DIR/comprehensive-security-report.json"
    
    if [ -f "$REPORT_FILE" ]; then
        # Extract key metrics using jq (if available)
        if command -v jq &> /dev/null; then
            OVERALL_SCORE=$(jq -r '.overallScore // 0' "$REPORT_FILE")
            RISK_LEVEL=$(jq -r '.riskLevel // "UNKNOWN"' "$REPORT_FILE")
            VULNERABILITIES=$(jq -r '.testSuites.vulnerability.vulnerabilitiesFound // 0' "$REPORT_FILE")
            
            echo ""
            echo -e "${BLUE}════════════════════════════════════════${NC}"
            echo -e "${BLUE}🎯 SECURITY ASSESSMENT SUMMARY${NC}"
            echo -e "${BLUE}════════════════════════════════════════${NC}"
            echo -e "${GREEN}Overall Security Score: ${OVERALL_SCORE}/100${NC}"
            echo -e "${GREEN}Risk Level: ${RISK_LEVEL}${NC}"
            echo -e "${GREEN}Vulnerabilities Found: ${VULNERABILITIES}${NC}"
            echo ""
            
            # Risk level specific messages
            case $RISK_LEVEL in
                "LOW")
                    echo -e "${GREEN}🎉 Excellent security posture!${NC}"
                    ;;
                "MEDIUM")
                    echo -e "${YELLOW}⚠️ Good security with room for improvement${NC}"
                    ;;
                "HIGH")
                    echo -e "${YELLOW}🔶 Security improvements recommended${NC}"
                    ;;
                "CRITICAL")
                    echo -e "${RED}🚨 Critical security issues detected!${NC}"
                    ;;
            esac
        fi
    fi
    
    echo ""
    echo -e "${BLUE}📁 Detailed results available in:${NC}"
    echo -e "${GREEN}   JSON Report: $RESULT_DIR/comprehensive-security-report.json${NC}"
    echo -e "${GREEN}   HTML Report: $RESULT_DIR/security-report.html${NC}"
    
    # Check if HTML report exists and offer to open
    HTML_REPORT="$RESULT_DIR/security-report.html"
    if [ -f "$HTML_REPORT" ]; then
        echo ""
        read -p "Open HTML report in browser? (y/n): " open_browser
        if [[ $open_browser =~ ^[Yy]$ ]]; then
            if command -v xdg-open &> /dev/null; then
                xdg-open "$HTML_REPORT"
            elif command -v open &> /dev/null; then
                open "$HTML_REPORT"
            else
                echo -e "${YELLOW}⚠️ Cannot auto-open browser. Please open manually: $HTML_REPORT${NC}"
            fi
        fi
    fi
}

# Cleanup function
cleanup() {
    echo -e "${BLUE}🧹 Cleaning up temporary files...${NC}"
    # Remove any temporary files if needed
}

# Main execution
main() {
    print_banner
    
    # Set up trap for cleanup
    trap cleanup EXIT
    
    # Run all steps
    check_prerequisites
    setup_output_dir
    run_tests
    generate_summary
    
    echo ""
    echo -e "${GREEN}✅ Security testing completed successfully!${NC}"
    echo -e "${BLUE}💡 Next steps:${NC}"
    echo -e "${BLUE}   1. Review the generated reports${NC}"
    echo -e "${BLUE}   2. Address any critical vulnerabilities${NC}"
    echo -e "${BLUE}   3. Schedule regular security testing${NC}"
    echo ""
}

# Run main function
main 