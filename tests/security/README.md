# 🔒 Güvenlik Test Paketi - Kullanım Rehberi

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Kurulum ve Gereksinimler](#kurulum-ve-gereksinimler)
3. [Test Türleri](#test-türleri)
4. [Hızlı Başlangıç](#hızlı-başlangıç)
5. [Detaylı Kullanım](#detaylı-kullanım)
6. [Test Sonuçlarını Anlama](#test-sonuçlarını-anlama)
7. [Sorun Giderme](#sorun-giderme)
8. [Gelişmiş Seçenekler](#gelişmiş-seçenekler)

---

## 🎯 Genel Bakış

Bu güvenlik test paketi, **Ömer Güllü Sipariş Sistemi** için kapsamlı güvenlik değerlendirmesi yapar. Enterprise-grade güvenlik testleri ile sisteminizin 10-katmanlı güvenlik mimarisini doğrular.

### ✨ Özellikler

- **🔧 Automated Security Tests** - 100+ otomatik güvenlik testi
- **🔍 Vulnerability Scanning** - Kapsamlı zafiyet taraması
- **⚡ Performance Security Tests** - Güvenlik katmanlarının performans etkisi
- **📊 Comprehensive Reporting** - HTML ve JSON raporlar
- **🎯 Risk Assessment** - Detaylı risk değerlendirmesi

---

## 📦 Kurulum ve Gereksinimler

### Sistem Gereksinimleri

```bash
Node.js: >= 16.0.0
npm: >= 8.0.0
RAM: En az 4GB (test sırasında)
Disk: 500MB boş alan (raporlar için)
```

### Gerekli Paketler

```bash
# Test dependencies
npm install --save-dev \
  axios \
  chai \
  supertest \
  form-data \
  jsonwebtoken

# Opsiyonel (daha iyi raporlar için)
sudo apt install jq curl  # Linux
brew install jq curl      # macOS
```

### Test Ortamı Hazırlığı

```bash
# 1. Test kullanıcıları oluşturun
# Backend'de test kullanıcıları:
# - test_admin / TestPass123!
# - test_manager / TestPass123!
# - test_operator / TestPass123!
# - test_viewer / TestPass123!

# 2. Test veritabanı ayarlayın
createdb ogsiparis_test

# 3. Environment değişkenlerini ayarlayın
export TEST_BASE_URL="http://localhost:3000"
export NODE_ENV="test"
```

---

## 🧪 Test Türleri

### 1. Automated Security Tests (5-10 dakika)
```
✅ Authentication & Session Management
✅ Authorization & RBAC Testing
✅ Input Validation & Sanitization
✅ SQL Injection Protection
✅ XSS Protection
✅ CSRF Protection
✅ File Upload Security
✅ API Security Headers
✅ Error Handling Security
✅ Business Logic Security
```

### 2. Vulnerability Scanning (10-15 dakika)
```
🔍 Information Disclosure
🔍 Authentication Vulnerabilities
🔍 SQL Injection Detection
🔍 XSS Vulnerability Detection
🔍 File Inclusion Testing
🔍 Command Injection Testing
🔍 SSL/TLS Configuration
🔍 Security Headers Analysis
🔍 Access Control Testing
🔍 Rate Limiting Assessment
```

### 3. Performance Security Tests (5-10 dakika)
```
⚡ Authentication Performance
⚡ Data Retrieval Performance
⚡ Security Overhead Analysis
⚡ Rate Limiting Impact
⚡ Concurrent Request Handling
⚡ File Upload Performance
```

---

## 🚀 Hızlı Başlangıç

### Windows Kullanıcıları

```powershell
# 1. Hızlı test (sadece otomatik testler)
node tests/security/security-test-runner.js --quick

# 2. Tam test paketi
node tests/security/security-test-runner.js

# 3. Belirli URL için test
node tests/security/security-test-runner.js https://test.ogsiparis.com

# 4. Verbose output ile
node tests/security/security-test-runner.js --verbose
```

### Linux/macOS Kullanıcıları

```bash
# Script'i çalıştırılabilir yapın
chmod +x tests/security/run-security-tests.sh

# 1. Hızlı test
./tests/security/run-security-tests.sh -m quick

# 2. Tam test paketi
./tests/security/run-security-tests.sh

# 3. Özel URL ile test
./tests/security/run-security-tests.sh -u https://test.ogsiparis.com

# 4. Verbose output ile
./tests/security/run-security-tests.sh -v
```

---

## 📖 Detaylı Kullanım

### Test Runner Seçenekleri

```bash
node tests/security/security-test-runner.js [URL] [OUTPUT_DIR] [OPTIONS]

Parametreler:
  URL           - Test edilecek sistem URL'i (default: http://localhost:3000)
  OUTPUT_DIR    - Sonuçların kaydedileceği klasör (default: ./security-test-results)

Seçenekler:
  --quick       - Sadece otomatik testleri çalıştır
  --verbose     - Detaylı çıktı göster
  --help        - Yardım mesajını göster
```

### Bireysel Test Modülleri

#### 1. Sadece Automated Tests
```javascript
const { SecurityTestSuite } = require('./automated-security-tests');

const testSuite = new SecurityTestSuite();
await testSuite.initialize(app);
await testSuite.runAllTests();
```

#### 2. Sadece Vulnerability Scanning
```javascript
const { VulnerabilityScanner } = require('./vulnerability-scanner');

const scanner = new VulnerabilityScanner({
    baseURL: 'http://localhost:3000',
    output: './vuln-report.json'
});
await scanner.runScan();
```

#### 3. Sadece Performance Testing
```javascript
const { PerformanceSecurityTest } = require('./performance-security-test');

const perfTest = new PerformanceSecurityTest({
    baseURL: 'http://localhost:3000',
    iterations: 100
});
await perfTest.runTests();
```

---

## 📊 Test Sonuçlarını Anlama

### Genel Güvenlik Skoru

```
🏆 Score Derecelendirmesi:
95-100: A+ (Mükemmel)
90-94:  A  (Çok İyi)
85-89:  B+ (İyi)
80-84:  B  (Kabul Edilebilir)
75-79:  C+ (Geliştirilmeli)
70-74:  C  (Zayıf)
60-69:  D  (Kötü)
0-59:   F  (Kritik)
```

### Risk Seviyeleri

```
🟢 LOW Risk:
   • Score: 90+
   • Durum: Excellent security posture
   • Aksiyon: Continue monitoring

🟡 MEDIUM Risk:
   • Score: 75-89
   • Durum: Good security with improvements needed
   • Aksiyon: Plan improvements

🟠 HIGH Risk:
   • Score: 50-74
   • Durum: Security improvements required
   • Aksiyon: Immediate improvements

🔴 CRITICAL Risk:
   • Score: <50
   • Durum: Critical security issues
   • Aksiyon: Immediate action required
```

### Rapor Dosyaları

```
📁 security-test-results/
├── 📄 comprehensive-security-report.json    # Ana rapor (JSON)
├── 🌐 security-report.html                  # Görsel rapor (HTML)
├── 📊 vulnerability-scan.json               # Zafiyet taraması
├── ⚡ performance-security-report.json      # Performans analizi
└── 📋 automated-test-results.json           # Otomatik test sonuçları
```

#### JSON Rapor Yapısı

```json
{
  "timestamp": "2024-01-11T10:30:00Z",
  "overallScore": 87,
  "riskLevel": "MEDIUM",
  "testSuites": {
    "automated": {
      "status": "COMPLETED",
      "passed": 45,
      "failed": 3,
      "score": 90
    },
    "vulnerability": {
      "status": "COMPLETED",
      "vulnerabilitiesFound": 2,
      "riskScore": 15,
      "score": 85
    },
    "performance": {
      "status": "COMPLETED",
      "averageResponseTime": 180,
      "grade": "A",
      "score": 88
    }
  },
  "recommendations": [...]
}
```

---

## 🔧 Sorun Giderme

### Yaygın Sorunlar ve Çözümleri

#### 1. Bağlantı Hataları
```
❌ Error: ECONNREFUSED
✅ Çözüm:
   - Backend servisinin çalıştığını kontrol edin
   - URL'nin doğru olduğunu kontrol edin
   - Firewall ayarlarını kontrol edin
```

#### 2. Authentication Hataları
```
❌ Error: Authentication failed
✅ Çözüm:
   - Test kullanıcılarının oluşturulduğunu kontrol edin
   - Kullanıcı bilgilerinin doğru olduğunu kontrol edin
   - Database'in erişilebilir olduğunu kontrol edin
```

#### 3. Timeout Hataları
```
❌ Error: Request timeout
✅ Çözüm:
   - Test iterasyon sayısını azaltın
   - Network bağlantısını kontrol edin
   - Sistem kaynaklarını kontrol edin
```

#### 4. Permission Hataları
```
❌ Error: Permission denied
✅ Çözüm:
   - Output directory yazma izinlerini kontrol edin
   - Test kullanıcısının rollerini kontrol edin
```

### Debug Modu

```bash
# Detaylı debug bilgisi için
DEBUG=security:* node tests/security/security-test-runner.js --verbose

# Sadece belirli modül için debug
DEBUG=security:auth node tests/security/automated-security-tests.js
```

### Log Seviyeleri

```javascript
// Test runner'da log seviyesi ayarlama
const runner = new SecurityTestRunner({
    verbose: true,
    logLevel: 'DEBUG' // DEBUG, INFO, WARN, ERROR
});
```

---

## ⚙️ Gelişmiş Seçenekler

### Custom Test Configuration

```javascript
// tests/security/custom-config.js
module.exports = {
    testUsers: {
        admin: { username: 'custom_admin', password: 'CustomPass123!' },
        // ... diğer kullanıcılar
    },
    testEndpoints: [
        '/api/custom-endpoint',
        // ... özel endpoint'ler
    ],
    securityPayloads: {
        customXSS: ['<custom>payload</custom>'],
        // ... özel payload'lar
    }
};
```

### CI/CD Integration

```yaml
# .github/workflows/security-tests.yml
name: Security Tests
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      
      - name: Install dependencies
        run: npm install
      
      - name: Start test server
        run: npm run start:test &
        
      - name: Wait for server
        run: sleep 30
        
      - name: Run security tests
        run: node tests/security/security-test-runner.js --quick
        
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: security-test-results
          path: security-test-results/
```

### Custom Vulnerability Checks

```javascript
// tests/security/custom-checks.js
class CustomSecurityChecks {
    async checkCustomVulnerability() {
        // Özel güvenlik kontrolü
        const response = await this.makeRequest('GET', '/api/custom-endpoint');
        
        if (response.data.includes('sensitive-info')) {
            this.addVulnerability({
                category: 'Custom',
                severity: 'HIGH',
                title: 'Custom Information Disclosure',
                description: 'Sensitive information exposed in custom endpoint'
            });
        }
    }
}
```

### Performance Profiling

```javascript
// Performance profiling için ek metrikler
const { PerformanceSecurityTest } = require('./performance-security-test');

class CustomPerformanceTest extends PerformanceSecurityTest {
    async measureMemoryUsage() {
        const memBefore = process.memoryUsage();
        await this.runSecurityOperation();
        const memAfter = process.memoryUsage();
        
        return {
            heapDelta: memAfter.heapUsed - memBefore.heapUsed,
            rssDelta: memAfter.rss - memBefore.rss
        };
    }
}
```

---

## 📞 Destek ve Katkı

### Teknik Destek
- **Email:** security@ogsiparis.com
- **Dokümantasyon:** [Security Implementation Guide](../docs/SECURITY_IMPLEMENTATION_GUIDE.md)
- **Incident Response:** [Incident Response Procedures](../docs/INCIDENT_RESPONSE_PROCEDURES.md)

### Test Geliştirme
- Yeni güvenlik testleri eklemek için: `tests/security/automated-security-tests.js`
- Yeni zafiyet kontrolleri için: `tests/security/vulnerability-scanner.js`
- Performans testleri için: `tests/security/performance-security-test.js`

### Güvenlik Bildirimi
Güvenlik açığı bulduysanız, lütfen **responsible disclosure** ilkesine uyarak security@ogsiparis.com adresine bildiriniz.

---

## 📝 Versiyon Geçmişi

- **v1.0.0** - İlk tam sürüm (Ocak 2024)
  - 10-katmanlı güvenlik testleri
  - Kapsamlı zafiyet taraması
  - Performans güvenlik analizi
  - HTML/JSON raporlama

---

## 📄 Lisans

Bu güvenlik test paketi, Ömer Güllü Sipariş Sistemi için özel olarak geliştirilmiştir. Kullanım izni projeye katılan güvenlik ekipleri ile sınırlıdır.

---

*Son güncelleme: 2024-01-11*
*Doküman versiyonu: 1.0.0* 