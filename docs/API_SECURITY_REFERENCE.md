# 🔐 API Güvenlik Referans Dokümanı

## 📋 İçindekiler

1. [API Güvenlik Mimarisi](#api-güvenlik-mimarisi)
2. [Authentication & Authorization](#authentication--authorization)
3. [Güvenli API Endpoints](#güvenli-api-endpoints)
4. [Request/Response Security](#requestresponse-security)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Audit Logging](#audit-logging)
8. [Development Guidelines](#development-guidelines)

---

## 🏗️ API Güvenlik Mimarisi

### Security Layers Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                           │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Rate Limiting & Request Validation                │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: JWT Token Validation                              │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: CSRF Token Verification                           │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: Permission & Role Checking                        │
├─────────────────────────────────────────────────────────────┤
│ Layer 5: Input Validation & Sanitization                   │
├─────────────────────────────────────────────────────────────┤
│ Layer 6: Business Logic Execution                          │
├─────────────────────────────────────────────────────────────┤
│ Layer 7: Data Access Control (Row-Level Security)          │
├─────────────────────────────────────────────────────────────┤
│ Layer 8: Response Data Filtering                           │
├─────────────────────────────────────────────────────────────┤
│ Layer 9: Audit Logging                                     │
├─────────────────────────────────────────────────────────────┤
│ Layer 10: Security Headers & Response                      │
└─────────────────────────────────────────────────────────────┘
```

### Security Wrapper Implementation

```javascript
// Lokasyon: backend/lib/api-security.js
export const secureAPI = (handler, options = {}) => {
    return async (req, res) => {
        try {
            // Layer 1: Rate Limiting
            await checkRateLimit(req, options.rateLimit);
            
            // Layer 2: Authentication
            const user = await validateAuthentication(req, options);
            
            // Layer 3: CSRF Protection
            await validateCSRFToken(req);
            
            // Layer 4: Authorization
            await checkPermissions(user, options.permission);
            
            // Layer 5: Input Validation
            const validatedData = await validateInput(req, options);
            
            // Layer 6: Execute Handler
            req.user = user;
            req.validatedData = validatedData;
            const result = await handler(req, res);
            
            // Layer 7-10: Response processing, audit, security headers
            return await processSecureResponse(result, req, res, options);
            
        } catch (error) {
            return handleSecurityError(error, req, res);
        }
    };
};
```

---

## 🔑 Authentication & Authorization

### JWT Token Management

#### Token Structure
```javascript
// JWT Payload
{
    "sub": "user_id_123",           // Subject (User ID)
    "iat": 1641891600,              // Issued At
    "exp": 1642496400,              // Expiration
    "aud": "ogsiparis.com",         // Audience
    "iss": "auth.ogsiparis.com",    // Issuer
    "role": "MANAGER",              // User Role
    "roleLevel": 70,                // Role Level
    "subeId": 1,                    // Branch ID
    "permissions": [...],           // User Permissions
    "sessionId": "sess_456"         // Session ID
}
```

#### Token Validation Process
```javascript
// Lokasyon: backend/lib/auth.js
const validateJWTToken = async (token) => {
    try {
        // 1. Token format validation
        if (!token || !token.startsWith('Bearer ')) {
            throw new AuthError('INVALID_TOKEN_FORMAT');
        }
        
        // 2. JWT signature verification
        const decoded = jwt.verify(token.slice(7), JWT_SECRET);
        
        // 3. Token expiry check
        if (decoded.exp < Date.now() / 1000) {
            throw new AuthError('TOKEN_EXPIRED');
        }
        
        // 4. User existence validation
        const user = await getUserById(decoded.sub);
        if (!user || !user.aktif) {
            throw new AuthError('USER_NOT_FOUND');
        }
        
        // 5. Session validation
        const session = await getActiveSession(decoded.sessionId);
        if (!session) {
            throw new AuthError('SESSION_INVALID');
        }
        
        return user;
    } catch (error) {
        throw new AuthError('TOKEN_VALIDATION_FAILED', error);
    }
};
```

### CSRF Protection

#### CSRF Token Generation
```javascript
// Lokasyon: backend/lib/security-middleware.js
const generateCSRFToken = (user) => {
    const secret = process.env.CSRF_SECRET;
    const timestamp = Date.now();
    const data = `${user.id}:${timestamp}:${user.sessionId}`;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
};
```

#### CSRF Token Validation
```javascript
const validateCSRFToken = async (req) => {
    const token = req.headers['x-csrf-token'];
    const method = req.method.toLowerCase();
    
    // CSRF check for state-changing operations
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
        if (!token) {
            throw new SecurityError('CSRF_TOKEN_MISSING');
        }
        
        const isValid = await verifyCSRFToken(token, req.user);
        if (!isValid) {
            throw new SecurityError('CSRF_TOKEN_INVALID');
        }
    }
};
```

### Permission System

#### Permission Definitions
```javascript
// Lokasyon: backend/lib/rbac-enhanced.js
export const PERMISSIONS = {
    // Authentication & Users
    VIEW_USERS: 'view_users',
    MANAGE_USERS: 'manage_users',
    VIEW_AUDIT_LOGS: 'view_audit_logs',
    
    // Business Operations
    VIEW_ORDERS: 'view_orders',
    CREATE_ORDERS: 'create_orders',
    UPDATE_ORDERS: 'update_orders',
    DELETE_ORDERS: 'delete_orders',
    APPROVE_ORDERS: 'approve_orders',
    
    VIEW_CUSTOMERS: 'view_customers',
    MANAGE_CUSTOMERS: 'manage_customers',
    VIEW_CUSTOMER_PII: 'view_customer_pii',
    
    VIEW_PRODUCTS: 'view_products',
    MANAGE_PRODUCTS: 'manage_products',
    VIEW_PRODUCT_COSTS: 'view_product_costs',
    
    // Financial & Production
    VIEW_FINANCIAL: 'view_financial',
    MANAGE_PRICING: 'manage_pricing',
    VIEW_PROFIT_MARGINS: 'view_profit_margins',
    
    VIEW_PRODUCTION: 'view_production',
    MANAGE_RECIPES: 'manage_recipes',
    VIEW_RECIPE_COSTS: 'view_recipe_costs',
    
    // Reporting
    VIEW_REPORTS: 'view_reports',
    GENERATE_REPORTS: 'generate_reports',
    EXPORT_DATA: 'export_data'
};
```

#### Permission Checking
```javascript
const checkPermissions = async (user, requiredPermission) => {
    if (!requiredPermission) return; // No permission required
    
    // Admin bypass
    if (user.roleLevel >= 90) return;
    
    // Check specific permission
    const hasPermission = await userHasPermission(user.id, requiredPermission);
    if (!hasPermission) {
        throw new SecurityError('PERMISSION_DENIED', {
            userId: user.id,
            requiredPermission,
            userRole: user.rol
        });
    }
};
```

---

## 🛡️ Güvenli API Endpoints

### Authentication APIs

#### POST /api/auth/login
```javascript
// Endpoint: Kullanıcı giriş yapma
// Security: Rate limited, IP tracking, account lockout

ENDPOINT: POST /api/auth/login
REQUEST:
{
    "kullaniciAdi": "bari8",
    "sifre": "temp123",
    "deviceInfo": {
        "userAgent": "...",
        "ipAddress": "...",
        "fingerprint": "..."
    }
}

RESPONSE:
{
    "success": true,
    "data": {
        "token": "jwt_token_here",
        "refreshToken": "refresh_token_here",
        "csrfToken": "csrf_token_here",
        "user": {
            "id": "123",
            "adiSoyadi": "Barış Güngör",
            "rol": "ADMIN",
            "roleLevel": 90,
            "permissions": [...]
        },
        "sessionExpiry": "2024-01-18T10:30:00Z"
    }
}

SECURITY_FEATURES:
✅ Rate limiting: 5 attempts per 15 minutes
✅ Account lockout: 30 minutes after 5 failed attempts
✅ IP tracking and device fingerprinting
✅ Audit logging of all login attempts
✅ CAPTCHA after 3 failed attempts
```

#### POST /api/auth/refresh
```javascript
// Endpoint: JWT token yenileme
// Security: Refresh token validation, session checking

ENDPOINT: POST /api/auth/refresh
REQUEST:
{
    "refreshToken": "refresh_token_here"
}

RESPONSE:
{
    "success": true,
    "data": {
        "token": "new_jwt_token",
        "refreshToken": "new_refresh_token",
        "sessionExpiry": "2024-01-18T10:30:00Z"
    }
}

SECURITY_FEATURES:
✅ Refresh token rotation (old token invalidated)
✅ Session validity checking
✅ Rate limiting to prevent abuse
✅ Audit logging of token refresh events
```

#### GET /api/auth/csrf
```javascript
// Endpoint: CSRF token alma
// Security: Authenticated users only

ENDPOINT: GET /api/auth/csrf
HEADERS:
{
    "Authorization": "Bearer jwt_token"
}

RESPONSE:
{
    "success": true,
    "data": {
        "csrfToken": "csrf_token_here",
        "expiry": "2024-01-11T11:30:00Z"
    }
}

SECURITY_FEATURES:
✅ Authentication required
✅ Time-based token expiry
✅ User-specific token generation
```

### User Management APIs

#### GET /api/auth/users
```javascript
// Endpoint: Kullanıcı listesi alma
// Security: MANAGE_USERS permission required

ENDPOINT: GET /api/auth/users?page=1&limit=10&search=term
HEADERS:
{
    "Authorization": "Bearer jwt_token",
    "X-CSRF-Token": "csrf_token"
}

RESPONSE:
{
    "success": true,
    "data": {
        "users": [
            {
                "id": "123",
                "adiSoyadi": "Barış Güngör",
                "rol": "ADMIN",
                "aktif": true,
                "subeId": 1,
                // PII data filtered based on permissions
                "email": "***@***.com",      // Masked for non-managers
                "telefon": "05XX XXX XX 67"  // Partially masked
            }
        ],
        "pagination": {
            "total": 45,
            "page": 1,
            "limit": 10,
            "totalPages": 5
        }
    }
}

SECURITY_FEATURES:
✅ Permission-based data filtering
✅ PII masking based on role level
✅ Branch-level access control
✅ Search input sanitization
✅ Pagination to prevent data dumping
```

#### POST /api/auth/users
```javascript
// Endpoint: Yeni kullanıcı oluşturma
// Security: MANAGE_USERS permission, input validation

ENDPOINT: POST /api/auth/users
HEADERS:
{
    "Authorization": "Bearer jwt_token",
    "X-CSRF-Token": "csrf_token"
}

REQUEST:
{
    "adiSoyadi": "Ahmet Demir",
    "email": "ahmet@example.com",
    "telefon": "05321234567",
    "rol": "OPERATOR",
    "subeId": 1,
    "gunlukUcret": 350
}

RESPONSE:
{
    "success": true,
    "data": {
        "id": "456",
        "adiSoyadi": "Ahmet Demir",
        "rol": "OPERATOR",
        "tempPassword": "TempPass123!",
        "mustChangePassword": true
    }
}

SECURITY_FEATURES:
✅ Role hierarchy validation (can't create higher roles)
✅ Branch access validation
✅ Input sanitization and validation
✅ Temporary password generation
✅ Force password change on first login
✅ Email uniqueness validation
✅ Audit logging of user creation
```

### Business Operation APIs

#### GET /api/siparis
```javascript
// Endpoint: Sipariş listesi alma
// Security: VIEW_ORDERS permission, data filtering

ENDPOINT: GET /api/siparis?page=1&limit=20&durum=BEKLIYOR
HEADERS:
{
    "Authorization": "Bearer jwt_token",
    "X-CSRF-Token": "csrf_token"
}

RESPONSE:
{
    "success": true,
    "data": {
        "orders": [
            {
                "id": "789",
                "siparisNo": "SIP-2024-001",
                "musteriId": "123",
                "durum": "BEKLIYOR",
                "toplamTutar": 450.00,
                // Financial data filtered by role
                "maliyet": 315.00,        // Only for MANAGER+
                "karMarji": 30.0,         // Only for MANAGER+
                "teslimTarihi": "2024-01-15",
                "subeId": 1
            }
        ],
        "summary": {
            "totalRevenue": 12500.00,     // Only for SUPERVISOR+
            "totalCost": 8750.00,         // Only for MANAGER+
            "profitMargin": 30.0          // Only for MANAGER+
        }
    }
}

SECURITY_FEATURES:
✅ Branch-level data filtering
✅ Financial data access control
✅ Role-based summary information
✅ Input parameter validation
✅ SQL injection prevention
```

#### POST /api/siparis
```javascript
// Endpoint: Yeni sipariş oluşturma
// Security: CREATE_ORDERS permission, business validation

ENDPOINT: POST /api/siparis
REQUEST:
{
    "musteriId": "123",
    "items": [
        {
            "urunId": "456",
            "miktar": 2,
            "birimFiyat": 225.00
        }
    ],
    "teslimTarihi": "2024-01-15",
    "notlar": "Özel paketleme isteniyor"
}

RESPONSE:
{
    "success": true,
    "data": {
        "id": "890",
        "siparisNo": "SIP-2024-002",
        "durum": "ONAY_BEKLIYOR",
        "toplamTutar": 450.00
    }
}

SECURITY_FEATURES:
✅ Customer access validation (branch-based)
✅ Product availability checking
✅ Price manipulation prevention
✅ Business rule validation
✅ Stock level checking
✅ Input sanitization for notes field
✅ Automatic audit logging
```

### Customer Management APIs

#### GET /api/cari
```javascript
// Endpoint: Müşteri listesi alma
// Security: VIEW_CUSTOMERS permission, PII protection

ENDPOINT: GET /api/cari?search=mehmet&page=1
RESPONSE:
{
    "success": true,
    "data": {
        "customers": [
            {
                "id": "123",
                "musteriKodu": "MUS001",
                "musteriTipi": "BIREYSEL",
                // PII filtering based on role
                "ad": "Mehmet",              // MANAGER+ only
                "soyad": "Yılmaz",           // MANAGER+ only
                "telefon": "05XX XXX XX 67", // Masked for OPERATOR
                "email": "m***@email.com",   // Masked for OPERATOR
                "aktif": true,
                "bakiye": 0.00,              // SUPERVISOR+ only
                "krediLimiti": 5000.00       // MANAGER+ only
            }
        ]
    }
}

SECURITY_FEATURES:
✅ Progressive PII disclosure based on role
✅ Search input sanitization
✅ Branch-level customer filtering
✅ Financial data access control
✅ GDPR-compliant data masking
```

### Financial & Production APIs

#### GET /api/fiyatlar
```javascript
// Endpoint: Fiyat listesi alma
// Security: VIEW_PRODUCTS permission, cost data protection

ENDPOINT: GET /api/fiyatlar
RESPONSE:
{
    "success": true,
    "data": {
        "prices": [
            {
                "id": "456",
                "urunAdi": "Antep Baklavası",
                "satisFiyati": 25.50,
                "kdvDahilFiyat": 30.09,
                // Cost data only for authorized roles
                "maliyet": 18.75,          // MANAGER+ only
                "karMarji": 36.2,          // MANAGER+ only
                "tedarikciMaliyet": 15.25, // ADMIN only
                "guncellemeTarihi": "2024-01-10"
            }
        ]
    }
}

SECURITY_FEATURES:
✅ Cost data access control
✅ Supplier information protection
✅ Role-based profit margin visibility
✅ Historical price protection
```

#### GET /api/receteler/maliyet
```javascript
// Endpoint: Reçete maliyet bilgileri
// Security: VIEW_RECIPE_COSTS permission, production secrets protection

ENDPOINT: GET /api/receteler/maliyet/{id}
RESPONSE:
{
    "success": true,
    "data": {
        "receteId": "789",
        "urunAdi": "Antep Baklavası",
        // Recipe details only for authorized roles
        "malzemeler": [...],           // SUPERVISOR+ only
        "detayliMaliyetler": [...],    // MANAGER+ only
        "toplamMaliyet": 42.50,        // MANAGER+ only
        "birimMaliyet": 21.25,         // MANAGER+ only
        "karMarji": 36.2               // MANAGER+ only
    }
}

SECURITY_FEATURES:
✅ Production secret protection
✅ Cost data role-based access
✅ Recipe intellectual property protection
✅ Supplier cost information security
```

### File Operations APIs

#### POST /api/excel/upload/kullanici
```javascript
// Endpoint: Kullanıcı Excel dosyası yükleme
// Security: MANAGE_USERS permission, file validation

ENDPOINT: POST /api/excel/upload/kullanici
HEADERS:
{
    "Content-Type": "multipart/form-data",
    "Authorization": "Bearer jwt_token",
    "X-CSRF-Token": "csrf_token"
}

REQUEST: FormData with file

RESPONSE:
{
    "success": true,
    "data": {
        "processedRows": 25,
        "createdUsers": 20,
        "updatedUsers": 3,
        "errors": [
            {
                "row": 15,
                "error": "Email already exists",
                "data": {"email": "duplicate@example.com"}
            }
        ],
        "auditId": "audit_123"
    }
}

SECURITY_FEATURES:
✅ File type validation (Excel only)
✅ File size limits (max 10MB)
✅ Virus scanning integration
✅ Data validation for each row
✅ Batch processing with rollback
✅ Detailed error reporting
✅ Audit trail for bulk operations
```

### Audit & Monitoring APIs

#### GET /api/audit-logs
```javascript
// Endpoint: Audit log görüntüleme
// Security: VIEW_AUDIT_LOGS permission (ADMIN only)

ENDPOINT: GET /api/audit-logs?startDate=2024-01-01&endDate=2024-01-10
RESPONSE:
{
    "success": true,
    "data": {
        "logs": [
            {
                "id": "log_123",
                "timestamp": "2024-01-11T10:30:00Z",
                "action": "USER_CREATED",
                "entityType": "kullanici",
                "entityId": "456",
                "userId": "123",
                "userRole": "ADMIN",
                "description": "New user account created",
                "ipAddress": "192.168.1.100",
                "severity": "INFO",
                "metadata": {
                    "affectedFields": ["adiSoyadi", "email", "rol"],
                    "changes": {
                        "rol": {"from": null, "to": "OPERATOR"}
                    }
                }
            }
        ],
        "stats": {
            "totalEvents": 1247,
            "securityEvents": 23,
            "criticalEvents": 2
        }
    }
}

SECURITY_FEATURES:
✅ Admin-only access
✅ Date range filtering
✅ Severity-based filtering
✅ Comprehensive event tracking
✅ Metadata preservation
✅ Security event highlighting
```

---

## 📡 Request/Response Security

### Request Headers

#### Required Security Headers
```javascript
// Tüm authenticated requests için gerekli
{
    "Authorization": "Bearer jwt_token_here",
    "X-CSRF-Token": "csrf_token_here",
    "Content-Type": "application/json",
    "X-Request-Timestamp": "1641891600000",
    "X-Device-Fingerprint": "base64_encoded_device_info"
}
```

#### Optional Security Headers
```javascript
// Ek güvenlik için
{
    "X-Security-Level": "HIGH",          // NORMAL/HIGH/CRITICAL
    "X-Client-Version": "1.0.0",         // Client version tracking
    "X-Session-ID": "session_id_here"    // Session correlation
}
```

### Response Headers

#### Security Response Headers
```javascript
// Tüm responses'larda otomatik eklenen
{
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000",
    "Content-Security-Policy": "default-src 'self'",
    "X-Rate-Limit-Remaining": "99",
    "X-Rate-Limit-Reset": "1641891660"
}
```

#### Dynamic Security Headers
```javascript
// Duruma göre eklenen
{
    "X-CSRF-Token": "new_token_if_refreshed",
    "X-Security-Warning": "potential_issue_description",
    "X-Audit-ID": "audit_log_reference_id"
}
```

### Input Validation

#### Request Body Validation
```javascript
// Otomatik input validation
const validateInput = (data, schema) => {
    const errors = [];
    
    // Type validation
    Object.keys(schema).forEach(field => {
        const value = data[field];
        const rules = schema[field];
        
        // Required field check
        if (rules.required && !value) {
            errors.push(`${field} is required`);
        }
        
        // Type validation
        if (value && rules.type && typeof value !== rules.type) {
            errors.push(`${field} must be ${rules.type}`);
        }
        
        // Length validation
        if (value && rules.maxLength && value.length > rules.maxLength) {
            errors.push(`${field} exceeds maximum length`);
        }
        
        // Custom validation
        if (value && rules.validate && !rules.validate(value)) {
            errors.push(`${field} validation failed`);
        }
    });
    
    if (errors.length > 0) {
        throw new ValidationError('INPUT_VALIDATION_FAILED', errors);
    }
    
    return data;
};
```

#### Sanitization Process
```javascript
// Input sanitization
const sanitizeInput = (data) => {
    if (typeof data === 'string') {
        return data
            .trim()
            .replace(/[<>]/g, '')           // Remove HTML brackets
            .replace(/javascript:/gi, '')    // Remove javascript: protocol
            .replace(/on\w+=/gi, '');       // Remove event handlers
    }
    
    if (Array.isArray(data)) {
        return data.map(sanitizeInput);
    }
    
    if (typeof data === 'object' && data !== null) {
        const sanitized = {};
        Object.keys(data).forEach(key => {
            sanitized[key] = sanitizeInput(data[key]);
        });
        return sanitized;
    }
    
    return data;
};
```

---

## ⚠️ Error Handling

### Security Error Types

```javascript
// Error type definitions
const SECURITY_ERRORS = {
    // Authentication Errors
    INVALID_TOKEN: {
        code: 'AUTH_001',
        message: 'Invalid or malformed token',
        httpStatus: 401,
        userMessage: 'Lütfen tekrar giriş yapın'
    },
    
    TOKEN_EXPIRED: {
        code: 'AUTH_002',
        message: 'Token has expired',
        httpStatus: 401,
        userMessage: 'Oturumunuz sona ermiş, lütfen tekrar giriş yapın'
    },
    
    // Authorization Errors
    PERMISSION_DENIED: {
        code: 'AUTHZ_001',
        message: 'Insufficient permissions',
        httpStatus: 403,
        userMessage: 'Bu işlem için yetkiniz bulunmamaktadır'
    },
    
    // CSRF Errors
    CSRF_TOKEN_MISSING: {
        code: 'CSRF_001',
        message: 'CSRF token is missing',
        httpStatus: 403,
        userMessage: 'Güvenlik hatası, sayfayı yenileyin'
    },
    
    // Rate Limiting
    RATE_LIMIT_EXCEEDED: {
        code: 'RATE_001',
        message: 'Rate limit exceeded',
        httpStatus: 429,
        userMessage: 'Çok fazla istek gönderdiniz, lütfen bekleyin'
    },
    
    // Input Validation
    VALIDATION_FAILED: {
        code: 'VAL_001',
        message: 'Input validation failed',
        httpStatus: 422,
        userMessage: 'Girdiğiniz bilgileri kontrol edin'
    }
};
```

### Error Response Format

```javascript
// Standardized error response
{
    "success": false,
    "error": {
        "code": "AUTH_001",
        "message": "Lütfen tekrar giriş yapın",
        "type": "AUTHENTICATION_ERROR",
        "timestamp": "2024-01-11T10:30:00Z",
        "requestId": "req_123456",
        "details": {
            // Additional error context (development only)
            "field": "email",
            "constraint": "Email format invalid"
        }
    },
    "meta": {
        "rateLimitRemaining": 45,
        "retryAfter": 300 // seconds
    }
}
```

### Error Logging

```javascript
// Comprehensive error logging
const logSecurityError = (error, req) => {
    const logData = {
        timestamp: new Date().toISOString(),
        errorCode: error.code,
        errorType: error.type,
        message: error.message,
        httpStatus: error.httpStatus,
        
        // Request context
        requestId: req.id,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        
        // User context
        userId: req.user?.id,
        userRole: req.user?.rol,
        sessionId: req.user?.sessionId,
        
        // Security context
        authMethod: req.authMethod,
        csrfTokenPresent: !!req.headers['x-csrf-token'],
        securityLevel: req.securityLevel,
        
        // Stack trace (development only)
        ...(process.env.NODE_ENV === 'development' && {
            stack: error.stack
        })
    };
    
    // Log based on severity
    if (error.severity === 'CRITICAL') {
        logger.error('CRITICAL_SECURITY_ERROR', logData);
        // Send immediate alert
        sendSecurityAlert(logData);
    } else {
        logger.warn('SECURITY_ERROR', logData);
    }
    
    // Store in audit log
    auditLog('SECURITY_ERROR', error.message, logData);
};
```

---

## 🚦 Rate Limiting

### Rate Limit Configuration

```javascript
// Rate limit configurations per endpoint
const RATE_LIMITS = {
    // Authentication endpoints
    'POST:/api/auth/login': {
        maxRequests: 5,
        windowMs: 15 * 60 * 1000,    // 15 minutes
        skipSuccessfulRequests: true,
        skipFailedRequests: false
    },
    
    'POST:/api/auth/refresh': {
        maxRequests: 10,
        windowMs: 5 * 60 * 1000      // 5 minutes
    },
    
    // User management
    'POST:/api/auth/users': {
        maxRequests: 20,
        windowMs: 60 * 60 * 1000     // 1 hour
    },
    
    // File uploads
    'POST:/api/excel/upload/*': {
        maxRequests: 5,
        windowMs: 60 * 60 * 1000     // 1 hour
    },
    
    // Default for all other endpoints
    'default': {
        maxRequests: 100,
        windowMs: 15 * 60 * 1000     // 15 minutes
    }
};
```

### Rate Limit Implementation

```javascript
// Rate limit middleware
const rateLimit = (endpoint, options = {}) => {
    const config = RATE_LIMITS[endpoint] || RATE_LIMITS.default;
    
    return async (req, res, next) => {
        const key = `rate_limit:${req.ip}:${endpoint}`;
        const current = await redis.get(key) || 0;
        
        if (current >= config.maxRequests) {
            const ttl = await redis.ttl(key);
            
            // Log rate limit violation
            auditLog('RATE_LIMIT_EXCEEDED', `Rate limit exceeded for ${endpoint}`, {
                ip: req.ip,
                endpoint,
                currentRequests: current,
                limit: config.maxRequests
            });
            
            return res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_001',
                    message: 'Rate limit exceeded',
                    retryAfter: ttl
                }
            });
        }
        
        // Increment counter
        await redis.multi()
            .incr(key)
            .expire(key, config.windowMs / 1000)
            .exec();
        
        // Add headers
        res.set({
            'X-Rate-Limit-Limit': config.maxRequests,
            'X-Rate-Limit-Remaining': Math.max(0, config.maxRequests - current - 1),
            'X-Rate-Limit-Reset': new Date(Date.now() + config.windowMs).toISOString()
        });
        
        next();
    };
};
```

---

## 📋 Audit Logging

### Audit Event Types

```javascript
// Comprehensive audit event categories
const AUDIT_EVENTS = {
    // Authentication Events
    LOGIN_SUCCESS: 'User successfully logged in',
    LOGIN_FAILED: 'Failed login attempt',
    LOGOUT: 'User logged out',
    TOKEN_REFRESH: 'JWT token refreshed',
    SESSION_EXPIRED: 'User session expired',
    
    // User Management Events
    USER_CREATED: 'New user account created',
    USER_UPDATED: 'User account modified',
    USER_DELETED: 'User account deleted',
    USER_ACTIVATED: 'User account activated',
    USER_DEACTIVATED: 'User account deactivated',
    ROLE_CHANGED: 'User role modified',
    
    // Business Operations
    ORDER_CREATED: 'New order created',
    ORDER_UPDATED: 'Order modified',
    ORDER_DELETED: 'Order deleted',
    ORDER_APPROVED: 'Order approved',
    
    CUSTOMER_CREATED: 'New customer created',
    CUSTOMER_UPDATED: 'Customer information modified',
    CUSTOMER_PII_ACCESSED: 'Customer personal information accessed',
    
    PRODUCT_CREATED: 'New product created',
    PRODUCT_UPDATED: 'Product information modified',
    PRICE_CHANGED: 'Product price modified',
    
    // Financial Events
    FINANCIAL_DATA_ACCESSED: 'Financial data accessed',
    COST_DATA_VIEWED: 'Cost information accessed',
    PROFIT_MARGIN_VIEWED: 'Profit margin information accessed',
    
    // Security Events
    PERMISSION_DENIED: 'Access denied due to insufficient permissions',
    SECURITY_VIOLATION: 'Security policy violation detected',
    SUSPICIOUS_ACTIVITY: 'Suspicious user activity detected',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
    
    // Data Events
    DATA_EXPORT: 'Data exported',
    BULK_IMPORT: 'Bulk data import performed',
    REPORT_GENERATED: 'Report generated',
    
    // System Events
    SYSTEM_CONFIG_CHANGED: 'System configuration modified',
    BACKUP_CREATED: 'System backup created',
    BACKUP_RESTORED: 'System backup restored'
};
```

### Audit Log Structure

```javascript
// Comprehensive audit log entry
const auditLogEntry = {
    // Basic information
    id: 'audit_' + generateUniqueId(),
    timestamp: new Date().toISOString(),
    action: 'USER_CREATED',
    entityType: 'kullanici',
    entityId: '456',
    
    // User context
    userId: '123',
    userRole: 'ADMIN',
    userName: 'Barış Güngör',
    sessionId: 'sess_789',
    
    // Request context
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0...',
    requestId: 'req_abc123',
    endpoint: '/api/auth/users',
    method: 'POST',
    
    // Description and details
    description: 'New user account created for Ahmet Demir',
    severity: 'INFO', // DEBUG, INFO, WARN, ERROR, CRITICAL
    
    // Metadata
    metadata: {
        // Changed fields
        affectedFields: ['adiSoyadi', 'email', 'rol', 'subeId'],
        
        // Before/after values (for updates)
        changes: {
            rol: { from: null, to: 'OPERATOR' },
            aktif: { from: null, to: true }
        },
        
        // Business context
        subeId: 1,
        departmentId: 'sales',
        
        // Security context
        authMethod: 'JWT',
        csrfTokenUsed: true,
        securityLevel: 'HIGH',
        
        // Data classification
        dataClassification: 'PERSONAL',
        sensitiveDataAccessed: true,
        
        // GDPR compliance
        gdprCompliant: true,
        legalBasis: 'consent',
        dataProcessingPurpose: 'user_management',
        retentionPeriod: '7_years'
    },
    
    // Additional context
    tags: ['user_management', 'creation', 'security'],
    correlationId: 'corr_xyz456', // For related events
    
    // Integrity verification
    checksum: 'sha256_hash_of_entry'
};
```

### Audit Query API

```javascript
// Audit log query capabilities
ENDPOINT: GET /api/audit-logs

QUERY_PARAMETERS:
{
    // Time range
    startDate: '2024-01-01',
    endDate: '2024-01-10',
    
    // Filtering
    action: 'USER_CREATED',
    entityType: 'kullanici',
    userId: '123',
    severity: ['WARN', 'ERROR', 'CRITICAL'],
    
    // Text search
    search: 'search term',
    
    // Pagination
    page: 1,
    limit: 50,
    
    // Sorting
    sort: 'timestamp',
    order: 'DESC'
}
```

---

## 💻 Development Guidelines

### API Security Checklist

#### ✅ Authentication & Authorization
```
□ JWT token validation implemented
□ CSRF protection enabled
□ Permission checking in place
□ Role-based access control configured
□ Session management working
```

#### ✅ Input Validation
```
□ Request body validation schema defined
□ Input sanitization applied
□ SQL injection prevention implemented
□ XSS protection enabled
□ File upload security configured
```

#### ✅ Error Handling
```
□ Consistent error response format
□ Security error logging implemented
□ User-friendly error messages
□ Stack trace hidden in production
□ Error correlation IDs added
```

#### ✅ Audit & Monitoring
```
□ All operations audit logged
□ Security events properly categorized
□ GDPR compliance metadata included
□ Performance metrics tracked
□ Rate limiting configured
```

### Security Code Patterns

#### Secure API Handler Template
```javascript
// Template for secure API endpoint
import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';

async function handleBusinessLogic(req, res) {
    // Access validated user and data
    const { user, validatedData } = req;
    
    // Business logic here
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Database operations with automatic security
        return await tx.secureQuery('model', 'operation', {
            // Query parameters
        });
    });
    
    return res.json({
        success: true,
        data: result
    });
}

export default secureAPI(
    withPrismaSecurity(handleBusinessLogic),
    {
        // Security configuration
        permission: PERMISSIONS.REQUIRED_PERMISSION,
        allowedFields: ['field1', 'field2'],
        requiredFields: {
            POST: ['required1', 'required2']
        },
        rateLimit: {
            maxRequests: 50,
            windowMs: 15 * 60 * 1000
        },
        auditLogging: true,
        dataClassification: 'SENSITIVE'
    }
);
```

#### Input Validation Schema
```javascript
// Validation schema example
const userValidationSchema = {
    adiSoyadi: {
        type: 'string',
        required: true,
        maxLength: 100,
        validate: (value) => /^[a-zA-ZçğıöşüÇĞIÖŞÜ\s]+$/.test(value)
    },
    email: {
        type: 'string',
        required: true,
        maxLength: 255,
        validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    },
    telefon: {
        type: 'string',
        required: true,
        validate: (value) => /^05\d{9}$/.test(value)
    },
    rol: {
        type: 'string',
        required: true,
        validate: (value) => ['VIEWER', 'OPERATOR', 'SUPERVISOR', 'MANAGER', 'ADMIN'].includes(value)
    }
};
```

### Testing Security Features

#### Security Test Cases
```javascript
// Security test examples
describe('API Security Tests', () => {
    test('should reject requests without authentication', async () => {
        const response = await request(app)
            .get('/api/auth/users')
            .expect(401);
        
        expect(response.body.error.code).toBe('AUTH_001');
    });
    
    test('should enforce permission-based access', async () => {
        const operatorToken = await getTokenForRole('OPERATOR');
        
        const response = await request(app)
            .post('/api/auth/users')
            .set('Authorization', `Bearer ${operatorToken}`)
            .send(validUserData)
            .expect(403);
        
        expect(response.body.error.code).toBe('AUTHZ_001');
    });
    
    test('should validate and sanitize input', async () => {
        const adminToken = await getTokenForRole('ADMIN');
        
        const response = await request(app)
            .post('/api/auth/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                adiSoyadi: '<script>alert("xss")</script>',
                email: 'invalid-email'
            })
            .expect(422);
        
        expect(response.body.error.code).toBe('VAL_001');
    });
});
```

---

## 📞 Support & References

### API Documentation
- **Base URL:** `https://api.ogsiparis.com`
- **Version:** `v1`
- **Documentation:** `https://docs.ogsiparis.com/api`

### Security Contact
- **Security Issues:** security@ogsiparis.com
- **Technical Support:** support@ogsiparis.com
- **Emergency:** +90 XXX XXX XX XX

### Version History
- **v1.0.0:** Initial secure implementation
- **Last Updated:** 2024-01-11
- **Next Security Review:** 2024-04-11

---

*Bu doküman API güvenlik implementasyonu için kapsamlı referanstır. Yeni endpoint eklerken bu standartlara uyulmalıdır.* 