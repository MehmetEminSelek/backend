/**
 * =============================================
 * API SECURITY LAYER 9 - ENDPOINT PROTECTION
 * =============================================
 * - Enhanced RBAC Integration
 * - Automatic Permission Mapping
 * - Rate Limiting Per Endpoint
 * - Request Validation & Sanitization
 * - SQL Injection Prevention
 * - XSS Protection
 */

import { withRBAC, PERMISSIONS } from './rbac-enhanced.js';
import { validateInput, sanitizeInput } from './validation.js';
import { auditLog } from './audit-logger.js';

// API Endpoint Security Configuration
export const API_SECURITY_CONFIG = {
    // Authentication Required Endpoints
    AUTH_REQUIRED: [
        '/api/auth/users',
        '/api/siparis',
        '/api/stok',
        '/api/cari',
        '/api/urunler',
        '/api/receteler',
        '/api/fiyatlar',
        '/api/materials',
        '/api/production',
        '/api/reports',
        '/api/excel'
    ],

    // Public Endpoints (No Auth Required)
    PUBLIC_ENDPOINTS: [
        '/api/auth/login',
        '/api/auth/csrf',
        '/api/health',
        '/api/ping'
    ],

    // Rate Limiting Configuration Per Endpoint
    RATE_LIMITS: {
        '/api/auth/login': {
            windowMs: 15 * 60 * 1000, // 15 dakika
            max: 5, // 5 deneme
            message: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.'
        },
        '/api/excel/upload': {
            windowMs: 5 * 60 * 1000, // 5 dakika
            max: 3, // 3 upload
            message: 'Çok fazla dosya yükleme. 5 dakika bekleyin.'
        },
        '/api/reports': {
            windowMs: 1 * 60 * 1000, // 1 dakika
            max: 10, // 10 rapor
            message: 'Çok fazla rapor talebi. 1 dakika bekleyin.'
        },
        'DEFAULT': {
            windowMs: 1 * 60 * 1000, // 1 dakika
            max: 60, // 60 istek
            message: 'Çok fazla istek. Lütfen bekleyin.'
        }
    }
};

// Enhanced Page-Level Permissions with Method-Specific Controls
export const API_PERMISSIONS = {
    // User Management
    '/api/auth/users': {
        GET: { permission: PERMISSIONS.VIEW_USERS },
        POST: { permission: PERMISSIONS.CREATE_USERS },
        PUT: { permission: PERMISSIONS.UPDATE_USERS },
        DELETE: { permission: PERMISSIONS.DELETE_USERS }
    },

    // Product Management
    '/api/urunler': {
        GET: { permission: PERMISSIONS.VIEW_PRODUCTS },
        POST: { permission: PERMISSIONS.CREATE_PRODUCTS },
        PUT: { permission: PERMISSIONS.UPDATE_PRODUCTS },
        DELETE: { permission: PERMISSIONS.DELETE_PRODUCTS }
    },

    // Order Management
    '/api/siparis': {
        GET: { permission: PERMISSIONS.VIEW_ORDERS },
        POST: { permission: PERMISSIONS.CREATE_ORDERS },
        PUT: { permission: PERMISSIONS.UPDATE_ORDERS },
        DELETE: { permission: PERMISSIONS.DELETE_ORDERS }
    },
    '/api/siparis/[id]/odemeler': {
        GET: { permission: PERMISSIONS.VIEW_ORDERS },
        POST: { permission: PERMISSIONS.MANAGE_PAYMENTS },
        PUT: { permission: PERMISSIONS.MANAGE_PAYMENTS }
    },
    '/api/siparis/[id]/kargo': {
        GET: { permission: PERMISSIONS.VIEW_ORDERS },
        POST: { permission: PERMISSIONS.UPDATE_ORDERS },
        PUT: { permission: PERMISSIONS.UPDATE_ORDERS }
    },

    // Stock Management
    '/api/stok': {
        GET: { permission: PERMISSIONS.VIEW_STOCK },
        POST: { permission: PERMISSIONS.UPDATE_STOCK },
        PUT: { permission: PERMISSIONS.UPDATE_STOCK }
    },
    '/api/stok/transfer': {
        POST: { permission: PERMISSIONS.MANAGE_STOCK },
        PUT: { permission: PERMISSIONS.MANAGE_STOCK }
    },

    // Customer Management
    '/api/cari': {
        GET: { permission: PERMISSIONS.VIEW_CUSTOMERS },
        POST: { permission: PERMISSIONS.CREATE_CUSTOMERS },
        PUT: { permission: PERMISSIONS.UPDATE_CUSTOMERS },
        DELETE: { permission: PERMISSIONS.DELETE_CUSTOMERS }
    },

    // Materials Management
    '/api/materials': {
        GET: { permission: PERMISSIONS.VIEW_MATERIALS },
        POST: { permission: PERMISSIONS.CREATE_MATERIALS },
        PUT: { permission: PERMISSIONS.UPDATE_MATERIALS },
        DELETE: { permission: PERMISSIONS.DELETE_MATERIALS }
    },

    // Recipe Management
    '/api/receteler': {
        GET: { permission: PERMISSIONS.VIEW_RECIPES },
        POST: { permission: PERMISSIONS.CREATE_RECIPES },
        PUT: { permission: PERMISSIONS.UPDATE_RECIPES },
        DELETE: { permission: PERMISSIONS.DELETE_RECIPES }
    },
    '/api/receteler/maliyet': {
        GET: { permission: PERMISSIONS.VIEW_RECIPES },
        POST: { permission: PERMISSIONS.VIEW_FINANCIAL }
    },

    // Financial Management
    '/api/fiyatlar': {
        GET: { permission: PERMISSIONS.VIEW_FINANCIAL },
        POST: { permission: PERMISSIONS.UPDATE_PRICES },
        PUT: { permission: PERMISSIONS.UPDATE_PRICES },
        DELETE: { permission: PERMISSIONS.UPDATE_PRICES }
    },
    '/api/malzeme-fiyatlari': {
        GET: { permission: PERMISSIONS.VIEW_FINANCIAL },
        POST: { permission: PERMISSIONS.UPDATE_PRICES },
        PUT: { permission: PERMISSIONS.UPDATE_PRICES }
    },

    // Production Management
    '/api/production/plans': {
        GET: { permission: PERMISSIONS.VIEW_REPORTS },
        POST: { permission: PERMISSIONS.MANAGE_ORDERS },
        PUT: { permission: PERMISSIONS.MANAGE_ORDERS },
        DELETE: { permission: PERMISSIONS.DELETE_ORDERS }
    },

    // Reporting
    '/api/reports/sales': {
        GET: { permission: PERMISSIONS.VIEW_REPORTS },
        POST: { permission: PERMISSIONS.GENERATE_REPORTS }
    },
    '/api/reports/crm': {
        GET: { permission: PERMISSIONS.VIEW_REPORTS },
        POST: { permission: PERMISSIONS.GENERATE_REPORTS }
    },
    '/api/satis-raporu': {
        POST: { permission: PERMISSIONS.VIEW_REPORTS }
    },
    '/api/crm-raporlama': {
        POST: { permission: PERMISSIONS.VIEW_REPORTS }
    },
    '/api/uretim-plani': {
        GET: { permission: PERMISSIONS.VIEW_REPORTS },
        POST: { permission: PERMISSIONS.VIEW_REPORTS }
    },

    // Excel Operations
    '/api/excel/upload': {
        POST: { permission: PERMISSIONS.EXCEL_OPERATIONS }
    },
    '/api/excel/template': {
        GET: { permission: PERMISSIONS.EXCEL_OPERATIONS }
    },

    // System Management
    '/api/audit-logs': {
        GET: { permission: PERMISSIONS.VIEW_AUDIT_LOGS }
    }
};

/**
 * Enhanced Security Wrapper for API Routes
 */
export function secureAPI(handler, options = {}) {
    return withRBAC(async (req, res) => {
        try {
            // 1. URL Path Extraction
            const path = req.url?.split('?')[0] || '';
            const method = req.method?.toUpperCase();

            // 2. Input Validation & Sanitization
            if (req.body && typeof req.body === 'object') {
                // Validate critical fields
                if (method === 'POST' || method === 'PUT') {
                    const validationResult = validateInput(req.body, {
                        requireSanitization: true,
                        allowedFields: options.allowedFields,
                        requiredFields: options.requiredFields
                    });

                    if (!validationResult.isValid) {
                        auditLog('INPUT_VALIDATION_FAILED', 'Invalid input data', {
                            userId: req.user?.userId,
                            path,
                            errors: validationResult.errors
                        });
                        return res.status(400).json({
                            error: 'Geçersiz veri formatı',
                            details: validationResult.errors
                        });
                    }

                    // Sanitize input
                    req.body = sanitizeInput(req.body);
                }
            }

            // 3. Query Parameter Sanitization
            if (req.query && typeof req.query === 'object') {
                req.query = sanitizeInput(req.query);
            }

            // 4. SQL Injection Prevention for Dynamic Queries
            if (options.preventSQLInjection !== false) {
                const suspiciousPatterns = [
                    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
                    /(--|;|\/\*|\*\/)/,
                    /('|(\\'))/,
                    /(\b(OR|AND)\b.*=.*)/i
                ];

                const checkForSQLInjection = (obj) => {
                    for (const key in obj) {
                        const value = obj[key];
                        if (typeof value === 'string') {
                            for (const pattern of suspiciousPatterns) {
                                if (pattern.test(value)) {
                                    auditLog('SQL_INJECTION_ATTEMPT', 'Suspicious SQL pattern detected', {
                                        userId: req.user?.userId,
                                        path,
                                        field: key,
                                        value: value.substring(0, 100)
                                    });
                                    return true;
                                }
                            }
                        }
                    }
                    return false;
                };

                if (checkForSQLInjection(req.body || {}) || checkForSQLInjection(req.query || {})) {
                    return res.status(400).json({
                        error: 'Geçersiz veri formatı',
                        code: 'INVALID_INPUT'
                    });
                }
            }

            // 5. File Upload Security
            if (req.files || req.file) {
                const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'jpg', 'jpeg', 'png', 'xlsx', 'csv'];
                const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB

                const validateFile = (file) => {
                    const ext = file.originalname?.split('.').pop()?.toLowerCase();
                    if (!allowedTypes.includes(ext)) {
                        return { valid: false, error: 'Desteklenmeyen dosya türü' };
                    }
                    if (file.size > maxSize) {
                        return { valid: false, error: 'Dosya boyutu çok büyük' };
                    }
                    return { valid: true };
                };

                const files = req.files ? (Array.isArray(req.files) ? req.files : [req.files]) : [req.file];
                for (const file of files) {
                    if (file) {
                        const validation = validateFile(file);
                        if (!validation.valid) {
                            auditLog('FILE_UPLOAD_REJECTED', 'Invalid file upload attempt', {
                                userId: req.user?.userId,
                                filename: file.originalname,
                                reason: validation.error
                            });
                            return res.status(400).json({
                                error: validation.error,
                                code: 'INVALID_FILE'
                            });
                        }
                    }
                }
            }

            // 6. Request Size Limiting
            const requestSize = parseInt(req.headers['content-length'] || '0');
            const maxRequestSize = 50 * 1024 * 1024; // 50MB
            if (requestSize > maxRequestSize) {
                auditLog('REQUEST_TOO_LARGE', 'Request size exceeded limit', {
                    userId: req.user?.userId,
                    path,
                    size: requestSize
                });
                return res.status(413).json({
                    error: 'İstek boyutu çok büyük',
                    code: 'REQUEST_TOO_LARGE'
                });
            }

            // 7. Success Audit
            auditLog('API_ACCESS', 'API endpoint accessed', {
                userId: req.user?.userId,
                method,
                path,
                userAgent: req.headers['user-agent'],
                ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress
            });

            // 8. Execute Handler
            return await handler(req, res);

        } catch (error) {
            // 9. Error Handling & Audit
            auditLog('API_ERROR', 'API endpoint error', {
                userId: req.user?.userId,
                path: req.url,
                error: error.message,
                stack: error.stack?.substring(0, 500)
            });

            console.error('API Security Error:', error);

            // Don't expose internal errors to client
            return res.status(500).json({
                error: 'Sunucu hatası',
                code: 'INTERNAL_ERROR'
            });
        }
    }, {
        // Determine permission requirements
        ...options,
        permission: options.permission || getRequiredPermission(req?.url, req?.method)
    });
}

/**
 * Get Required Permission for API Endpoint
 */
function getRequiredPermission(url, method) {
    if (!url || !method) return null;

    const path = url.split('?')[0];
    const upperMethod = method.toUpperCase();

    // Find exact match first
    const exactMatch = API_PERMISSIONS[path];
    if (exactMatch && exactMatch[upperMethod]) {
        return exactMatch[upperMethod].permission;
    }

    // Find pattern match (for dynamic routes like [id])
    for (const [pattern, permissions] of Object.entries(API_PERMISSIONS)) {
        const regex = new RegExp('^' + pattern.replace(/\[id\]/g, '[^/]+') + '$');
        if (regex.test(path) && permissions[upperMethod]) {
            return permissions[upperMethod].permission;
        }
    }

    return null;
}

/**
 * Database Security Helpers
 */
export const dbSecurity = {
    // Prevent SQL injection in Prisma queries
    sanitizeQueryParams: (params) => {
        const sanitized = {};
        for (const [key, value] of Object.entries(params || {})) {
            if (typeof value === 'string') {
                // Remove potentially dangerous characters
                sanitized[key] = value.replace(/['"\\;\-\-]/g, '');
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    },

    // Validate and limit query results
    limitQueryResults: (limit, maxLimit = 1000) => {
        const numLimit = parseInt(limit) || 50;
        return Math.min(numLimit, maxLimit);
    },

    // Secure field selection for Prisma
    getSecureSelect: (userRole, entityType) => {
        const baseFields = {
            user: ['id', 'kullaniciAdi', 'rol', 'aktif', 'olusturmaTarihi'],
            order: ['id', 'siparisTarihi', 'durum', 'toplamTutar', 'musteriId'],
            customer: ['id', 'ad', 'telefon', 'email', 'adres'],
            product: ['id', 'ad', 'kategori', 'fiyat', 'stokMiktari']
        };

        // Admins can see sensitive fields
        const sensitiveFields = {
            user: ['email', 'sonGirisTarihi', 'ipAdresi'],
            order: ['indirimTutari', 'karMarji', 'maliyetTutari'],
            customer: ['tcNo', 'vergiNo', 'krediLimiti'],
            product: ['maliyetFiyati', 'karMarji', 'tedarikciId']
        };

        const fields = baseFields[entityType] || [];

        if (userRole === 'admin' || userRole === 'super_admin') {
            return [...fields, ...(sensitiveFields[entityType] || [])];
        }

        return fields;
    }
};

export default {
    secureAPI,
    API_PERMISSIONS,
    API_SECURITY_CONFIG,
    dbSecurity,
    getRequiredPermission
}; 