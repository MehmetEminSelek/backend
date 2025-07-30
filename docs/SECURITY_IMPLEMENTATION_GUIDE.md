# 🔒 Ömer Güllü Sipariş Sistemi - Güvenlik Uygulama Rehberi

## 📋 İçindekiler

1. [Güvenlik Mimarisi Genel Bakış](#güvenlik-mimarisi-genel-bakış)
2. [10-Katmanlı Güvenlik Sistemi](#10-katmanlı-güvenlik-sistemi)
3. [Backend Güvenlik Entegrasyonu](#backend-güvenlik-entegrasyonu)
4. [Frontend Güvenlik Entegrasyonu](#frontend-güvenlik-entegrasyonu)
5. [API Güvenlik Protokolleri](#api-güvenlik-protokolleri)
6. [Veri Koruma Stratejileri](#veri-koruma-stratejileri)
7. [Monitoring ve Audit](#monitoring-ve-audit)
8. [Performans Optimizasyonu](#performans-optimizasyonu)
9. [Troubleshooting](#troubleshooting)

---

## 📐 Güvenlik Mimarisi Genel Bakış

### 🎯 Amaç ve Kapsam

Ömer Güllü Sipariş Sistemi, **enterprise-level güvenlik standartlarında** geliştirilmiş bir baklavacı yönetim sistemidir. Sistem, aşağıdaki güvenlik prensipleri üzerine inşa edilmiştir:

- **Zero Trust Architecture** - Hiçbir isteğe varsayılan güven yoktur
- **Defense in Depth** - Çoklu güvenlik katmanları
- **Least Privilege** - Minimum yetki prensibi
- **Secure by Design** - Güvenlik öncelikli tasarım
- **Continuous Monitoring** - Sürekli izleme ve audit

### 🏗️ Mimari Bileşenler

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                           │
├─────────────────────────────────────────────────────────────┤
│  Frontend Security Layer (Vue.js + Security Utils)         │
│  ├─ Authentication Store                                    │
│  ├─ CSRF Token Management                                   │
│  ├─ Input Sanitization                                      │
│  ├─ Permission Checks                                       │
│  └─ Session Management                                      │
├─────────────────────────────────────────────────────────────┤
│                    API GATEWAY                              │
│  ├─ Rate Limiting                                           │
│  ├─ Request Validation                                      │
│  └─ Security Headers                                        │
├─────────────────────────────────────────────────────────────┤
│                 BACKEND SECURITY                            │
│  ├─ JWT Authentication                                      │
│  ├─ RBAC (Role-Based Access Control)                       │
│  ├─ API Security Wrapper                                    │
│  ├─ Input Validation & Sanitization                        │
│  ├─ CSRF Protection                                         │
│  ├─ SQL Injection Prevention                               │
│  └─ Audit Logging                                          │
├─────────────────────────────────────────────────────────────┤
│                   DATABASE LAYER                            │
│  ├─ Prisma Security Wrapper                                │
│  ├─ Row-Level Security                                      │
│  ├─ Query Sanitization                                     │
│  └─ Transaction Security                                    │
├─────────────────────────────────────────────────────────────┤
│                 MONITORING & AUDIT                          │
│  ├─ Security Event Logging                                 │
│  ├─ Performance Monitoring                                 │
│  └─ Real-time Alerting                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛡️ 10-Katmanlı Güvenlik Sistemi

### Katman 1: JWT Enhancement
```javascript
// Lokasyon: backend/lib/auth.js
// Özellikler:
✅ Kriptografik güçlü secret'lar (80+ karakter)
✅ Strict token validation
✅ No fallback secrets
✅ Token expiry checks
✅ Refresh token rotation
```

**Yapılandırma:**
```env
JWT_SECRET="[80+ karakter kriptografik secret]"
JWT_EXPIRES_IN="7d"
JWT_REFRESH_EXPIRES_IN="30d"
```

### Katman 2: Login Security
```javascript
// Lokasyon: backend/pages/api/auth/login.js
// Özellikler:
✅ Rate limiting (5 attempt/15min)
✅ Account lockout (30 minutes)
✅ IP tracking
✅ Device fingerprinting
✅ Audit logging
```

**Yapılandırma:**
```env
FAILED_LOGIN_THRESHOLD=5
ACCOUNT_LOCK_DURATION_MINUTES=30
LOGIN_RATE_LIMIT_MAX=5
```

### Katman 3: Input Validation
```javascript
// Lokasyon: backend/lib/validation.js
// Özellikler:
✅ XSS prevention
✅ SQL injection protection
✅ Field-level validation
✅ Custom sanitizers
✅ Business rule validation
```

### Katman 4: Security Middleware
```javascript
// Lokasyon: backend/lib/security-middleware.js
// Özellikler:
✅ CSRF protection
✅ Rate limiting per endpoint
✅ Security headers (Helmet.js)
✅ Session management
✅ Request size limits
```

### Katman 5: Enhanced RBAC
```javascript
// Lokasyon: backend/lib/rbac-enhanced.js
// Özellikler:
✅ 5-level hierarchy (VIEWER→OPERATOR→SUPERVISOR→MANAGER→ADMIN)
✅ Permission caching
✅ Real-time permission checks
✅ Role inheritance
✅ Branch-level access control
```

**Rol Seviyeleri:**
- **ADMIN (90):** Tam yetki
- **MANAGER (70):** Departman yönetimi
- **SUPERVISOR (60):** Ekip yönetimi  
- **OPERATOR (40):** Operasyonel işlemler
- **VIEWER (20):** Sadece görüntüleme

### Katman 6: API Security
```javascript
// Lokasyon: backend/lib/api-security.js
// Özellikler:
✅ Endpoint protection wrapper
✅ Automatic permission mapping
✅ Request validation & sanitization
✅ SQL injection prevention
✅ XSS protection
✅ File upload security
```

### Katman 7: Prisma Security
```javascript
// Lokasyon: backend/lib/prisma-security.js
// Özellikler:
✅ Row-level security
✅ Automatic audit logging
✅ Query result sanitization
✅ Field-level access control
✅ Transaction security
✅ GDPR compliance features
```

### Katman 8: Master Integration
```javascript
// Lokasyon: backend/middleware.js
// Özellikler:
✅ All security layers integrated
✅ Request pipeline processing
✅ Error handling
✅ Performance monitoring
```

### Katman 9: Environment Security
```bash
# Lokasyon: backend/.env
# Özellikler:
✅ Kriptografik güçlü secrets
✅ Domain configuration (ogsiparis.com)
✅ CORS setup
✅ Security policies
```

### Katman 10: Comprehensive Implementation
```javascript
// Lokasyon: Tüm API endpoints (33+ API)
// Özellikler:
✅ Every API secured with secureAPI wrapper
✅ Role-based data access
✅ Comprehensive audit logging
✅ Business rule enforcement
```

---

## 🔧 Backend Güvenlik Entegrasyonu

### API Endpoint Security Pattern

Her API endpoint aşağıdaki pattern ile korunur:

```javascript
import { secureAPI } from '../../lib/api-security.js';
import { withPrismaSecurity } from '../../lib/prisma-security.js';
import { PERMISSIONS } from '../../lib/rbac-enhanced.js';

async function apiHandler(req, res) {
    // API business logic
}

export default secureAPI(
    withPrismaSecurity(apiHandler),
    {
        permission: PERMISSIONS.REQUIRED_PERMISSION,
        allowedFields: ['field1', 'field2'],
        requiredFields: {
            POST: ['required1', 'required2']
        },
        preventSQLInjection: true,
        enableAuditLogging: true
    }
);
```

### Güvenlik Katmanlarının Uygulanması

#### 1. Authentication Check
```javascript
// Her istekte JWT token doğrulanır
const user = await validateJWTToken(req.headers.authorization);
```

#### 2. Permission Validation
```javascript
// Rol bazlı yetki kontrolü
if (!hasPermission(user, requiredPermission)) {
    throw new SecurityError('PERMISSION_DENIED');
}
```

#### 3. Input Validation
```javascript
// Tüm girdiler sanitize edilir
const validatedData = validateInput(req.body, {
    allowedFields: ['name', 'email'],
    requireSanitization: true
});
```

#### 4. Business Logic Execution
```javascript
// Güvenli transaction içinde iş mantığı
const result = await req.prisma.secureTransaction(async (tx) => {
    // Database operations with row-level security
});
```

#### 5. Audit Logging
```javascript
// Tüm işlemler loglanır
auditLog('ACTION_PERFORMED', 'Description', {
    userId: user.id,
    data: sensitiveDataMask(result)
});
```

### Veri Erişim Kontrolü

#### Role-Based Data Filtering
```javascript
const userData = await tx.secureQuery('kullanici', 'findMany', {
    select: {
        id: true,
        adiSoyadi: true,
        // Sensitive data only for managers+
        ...(user.roleLevel >= 70 && {
            gunlukUcret: true,
            telefon: true
        })
    }
});
```

#### Branch-Level Security
```javascript
const whereClause = {
    // Non-admin users see only their branch data
    ...(user.roleLevel < 80 && user.subeId && {
        subeId: user.subeId
    })
};
```

---

## 🖥️ Frontend Güvenlik Entegrasyonu

### Authentication Store Architecture

```javascript
// Lokasyon: frontend/src/stores/auth.js
const authStore = useAuthStore()

// Key Features:
✅ JWT token management with auto-refresh
✅ CSRF token auto-renewal
✅ Session timeout monitoring
✅ Activity tracking
✅ Security level management
✅ Account lockout handling
```

### API Security Layer

```javascript
// Lokasyon: frontend/src/utils/api.js
// Enhanced axios client with:
✅ Automatic CSRF token injection
✅ JWT refresh on 401 errors
✅ Input sanitization
✅ Request retry logic
✅ Security headers
✅ Error handling
```

### Component Security Features

#### SecurityProvider Component
```vue
<!-- Global security state management -->
<SecurityProvider>
    <!-- Session timeout warnings -->
    <SessionTimeoutWarning />
    
    <!-- Security alerts -->
    <SecurityAlertSystem />
    
    <!-- Account lock modals -->
    <AccountLockedModal />
    
    <!-- Your app content -->
    <router-view />
</SecurityProvider>
```

#### Permission-Based Rendering
```vue
<template>
    <!-- Conditional rendering based on permissions -->
    <div v-if="$security.checkPermission('VIEW_FINANCIAL')">
        <FinancialData />
    </div>
    
    <!-- Role-based UI -->
    <AdminPanel v-if="$security.hasRole('ADMIN')" />
</template>
```

### Security Composables

#### API Calls with Security
```javascript
// Permission-aware API calls
const { loading, error, execute } = useUserApi()

const createUser = async (userData) => {
    await execute(
        () => api.createUser(userData),
        {
            requirePermission: 'MANAGE_USERS',
            securityLevel: 'CRITICAL'
        }
    )
}
```

#### Input Validation
```javascript
import { InputSanitizer, SecurityValidator } from '@/utils/security'

// Sanitize user inputs
const cleanInput = InputSanitizer.sanitizeString(userInput)

// Validate file uploads
const fileValidation = SecurityValidator.validateFileUpload(file, {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png']
})
```

---

## 🔐 API Güvenlik Protokolleri

### Request Security Headers

```javascript
// Otomatik olarak eklenen güvenlik headers
{
    'Authorization': 'Bearer [JWT_TOKEN]',
    'X-CSRF-Token': '[CSRF_TOKEN]',
    'X-Request-Timestamp': '[TIMESTAMP]',
    'X-Security-Level': '[NORMAL|HIGH|CRITICAL]',
    'X-Device-Fingerprint': '[DEVICE_INFO]'
}
```

### Response Security Processing

```javascript
// Response'da kontrol edilen güvenlik bilgileri
{
    'X-CSRF-Token': 'new_token_if_refreshed',
    'X-Security-Warning': 'potential_security_issue',
    'X-Rate-Limit-Remaining': 'requests_left'
}
```

### Error Handling Protocol

```javascript
// Güvenlik hatalarının yönetimi
{
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'Permission denied',
    CSRF_TOKEN_MISSING: 'CSRF token refresh needed',
    RATE_LIMITED: 'Too many requests',
    ACCOUNT_LOCKED: 'Account temporarily locked',
    SECURITY_VIOLATION: 'Security breach detected'
}
```

---

## 🗃️ Veri Koruma Stratejileri

### PII (Personally Identifiable Information) Protection

```javascript
// Role-based PII masking
const customerData = {
    id: customer.id,
    musteriKodu: customer.musteriKodu,
    
    // PII only for managers+
    ...(user.roleLevel >= 70 && {
        ad: customer.ad,
        soyad: customer.soyad,
        telefon: customer.telefon
    }),
    
    // Sensitive contact only for admins
    ...(user.roleLevel >= 80 && {
        email: customer.email,
        adres: customer.adres
    })
}
```

### Financial Data Security

```javascript
// Financial data access control
const productPricing = {
    id: product.id,
    ad: product.ad,
    
    // Cost data only for managers+
    ...(user.roleLevel >= 70 && {
        maliyetFiyat: product.maliyetFiyat,
        karMarji: product.karMarji
    }),
    
    // Supplier costs only for admins
    ...(user.roleLevel >= 80 && {
        alisFiyati: product.alisFiyati,
        tedarikciMaliyet: product.tedarikciMaliyet
    })
}
```

### Business Intelligence Protection

```javascript
// Production secrets (recipes) protection
if (user.roleLevel < 50) {
    throw new Error('Insufficient permissions for production data')
}

// Recipe costs only for managers+
const recipeData = {
    ...basicRecipeInfo,
    ...(user.roleLevel >= 70 && {
        toplamMaliyet: recipe.toplamMaliyet,
        birimMaliyet: recipe.birimMaliyet,
        karMarji: recipe.karMarji
    })
}
```

### GDPR Compliance Features

```javascript
// GDPR compliant audit logging
auditLog('CUSTOMER_DATA_ACCESS', 'Customer PII accessed', {
    userId: user.id,
    customerId: customer.id,
    dataFields: ['name', 'phone', 'email'],
    gdprCompliant: true,
    legalBasis: 'legitimate_interest',
    retentionPeriod: '2_years'
})

// Data anonymization for non-authorized users
const anonymizeCustomerData = (customer, userRole) => {
    if (userRole < 70) {
        return {
            ...customer,
            ad: '***',
            soyad: '***',
            telefon: customer.telefon?.slice(-4).padStart(11, '*'),
            email: customer.email?.replace(/(.{2}).*@/, '$1***@')
        }
    }
    return customer
}
```

---

## 📊 Monitoring ve Audit

### Audit Log Structure

```javascript
// Comprehensive audit logging
{
    id: 'unique_audit_id',
    timestamp: '2024-01-11T10:30:00Z',
    action: 'USER_CREATED',
    entityType: 'kullanici',
    entityId: 'user_123',
    userId: 'admin_456',
    description: 'New user account created',
    severity: 'INFO', // DEBUG, INFO, WARN, ERROR, CRITICAL
    ipAddress: '192.168.1.100',
    userAgent: 'Browser info',
    sessionId: 'session_789',
    
    // Business context
    metadata: {
        roleLevel: 80,
        subeId: 1,
        operationType: 'CREATE',
        dataClassification: 'PERSONAL'
    },
    
    // GDPR compliance
    gdprCompliant: true,
    dataProcessingBasis: 'consent',
    retentionPeriod: '7_years'
}
```

### Security Event Monitoring

```javascript
// Critical security events
SECURITY_EVENTS = {
    LOGIN_FAILED: 'Failed login attempt',
    ACCOUNT_LOCKED: 'Account locked due to security',
    PERMISSION_DENIED: 'Unauthorized access attempt',
    SECURITY_VIOLATION: 'Security rule violation',
    DATA_BREACH_ATTEMPT: 'Suspicious data access',
    ADMIN_ACTION: 'Administrative action performed'
}
```

### Real-time Alerting

```javascript
// Alert triggers
const securityAlerts = {
    multipleFailedLogins: {
        threshold: 5,
        timeWindow: '15_minutes',
        action: 'lock_account'
    },
    
    suspiciousDataAccess: {
        threshold: 100, // records accessed
        timeWindow: '5_minutes',
        action: 'security_review'
    },
    
    privilegeEscalation: {
        event: 'role_change',
        action: 'admin_notification'
    }
}
```

---

## ⚡ Performans Optimizasyonu

### Security Performance Considerations

#### 1. Permission Caching
```javascript
// Permission cache to reduce database queries
const permissionCache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const getCachedPermissions = (userId) => {
    const cached = permissionCache.get(userId)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.permissions
    }
    return null
}
```

#### 2. JWT Token Optimization
```javascript
// Efficient token validation with caching
const tokenCache = new Map()

const validateTokenCached = (token) => {
    const cached = tokenCache.get(token)
    if (cached && cached.expiry > Date.now()) {
        return cached.user
    }
    
    const user = validateJWTToken(token)
    tokenCache.set(token, {
        user,
        expiry: Date.now() + (5 * 60 * 1000) // 5 min cache
    })
    
    return user
}
```

#### 3. Audit Log Optimization
```javascript
// Batch audit logging for performance
const auditQueue = []
const BATCH_SIZE = 100
const FLUSH_INTERVAL = 5000 // 5 seconds

const batchAuditLog = (entry) => {
    auditQueue.push(entry)
    
    if (auditQueue.length >= BATCH_SIZE) {
        flushAuditLogs()
    }
}

setInterval(flushAuditLogs, FLUSH_INTERVAL)
```

### Performance Monitoring

```javascript
// Security operation timing
const securityTimer = {
    start: (operation) => console.time(`security_${operation}`),
    end: (operation) => console.timeEnd(`security_${operation}`)
}

// Usage
securityTimer.start('permission_check')
const hasPermission = await checkUserPermission(userId, permission)
securityTimer.end('permission_check')
```

---

## 🔧 Troubleshooting

### Common Security Issues

#### 1. CSRF Token Mismatch
```bash
Error: "CSRF token mismatch"
Solution:
1. Frontend'de CSRF token otomatik refresh kontrol edin
2. Browser cache temizleyin
3. Login olup tekrar deneyin
```

#### 2. Permission Denied Errors
```bash
Error: "Insufficient permissions"
Diagnosis:
1. User role seviyesini kontrol edin: authStore.roleLevel
2. Required permission'ı doğrulayın
3. Branch-level access kontrolünü kontrol edin
```

#### 3. Session Timeout Issues
```bash
Error: "Session expired"
Solution:
1. Session timeout ayarlarını kontrol edin
2. Auto-refresh mechanism'ini doğrulayın
3. Server-client time sync kontrol edin
```

#### 4. Account Lockout
```bash
Error: "Account locked"
Solution:
1. Wait for lockout period to expire (30 minutes)
2. Check audit logs for failed attempts
3. Admin can manually unlock account
```

### Debug Tools

#### Development Security Tools
```javascript
// Browser console'da kullanılabilir
window.__SECURITY_DEBUG__ = {
    checkAuth: () => authStore.checkAuth(),
    clearAuth: () => authStore.clearAuth(),
    getPermissions: () => authStore.permissions,
    testPermission: (perm) => authStore.checkPermission(perm)
}
```

#### Logging Levels
```javascript
// Log level configuration
LOG_LEVELS = {
    DEBUG: 'Detailed debug information',
    INFO: 'General information',
    WARN: 'Warning conditions',
    ERROR: 'Error conditions',
    CRITICAL: 'Critical security events'
}
```

### Security Health Check

```bash
# Backend health check
curl -X GET /api/health/security
Response: {
    "status": "healthy",
    "timestamp": "2024-01-11T10:30:00Z",
    "security": {
        "authentication": "active",
        "authorization": "active", 
        "csrf_protection": "active",
        "audit_logging": "active",
        "rate_limiting": "active"
    }
}
```

---

## 📞 Destek ve İletişim

### Güvenlik Sorunları İçin
- **Acil Güvenlik:** security@ogsiparis.com
- **Teknik Destek:** support@ogsiparis.com
- **Dokümantasyon:** docs.ogsiparis.com

### Versiyon Bilgisi
- **Security Framework Version:** 1.0.0
- **Last Updated:** 2024-01-11
- **Next Review:** 2024-04-11

---

*Bu doküman Ömer Güllü Sipariş Sistemi güvenlik implementasyonunu açıklar. Düzenli olarak güncellenmelidir.* 