/**
 * =============================================
 * PRISMA SECURITY WRAPPER - LAYER 10 FINAL
 * =============================================
 * - SQL Injection Prevention
 * - Row-Level Security (RLS)
 * - Automatic Audit Logging
 * - Query Result Sanitization
 * - Field-Level Access Control
 * - Transaction Security
 */

import { PrismaClient } from '@prisma/client';
import { auditLog } from './audit-logger.js';
import { dbSecurity } from './api-security.js';

// Global Prisma instance with enhanced security
let prismaInstance = null;

/**
 * Enhanced Prisma Client with Security Layer
 */
class SecurePrismaClient extends PrismaClient {
    constructor(options = {}) {
        super({
            log: ['error', 'warn'],
            ...options
        });

        this.currentUser = null;
        this.securityContext = {};
    }

    /**
     * Set Security Context for Current Request
     */
    setSecurityContext(user, request = {}) {
        this.currentUser = user;
        this.securityContext = {
            userId: user?.userId,
            userRole: user?.rol,
            roleLevel: user?.roleLevel,
            permissions: user?.permissions || [],
            ip: request.ip || request.headers?.['x-forwarded-for'] || 'unknown',
            userAgent: request.headers?.['user-agent'] || 'unknown',
            path: request.url || request.originalUrl || 'unknown'
        };
        return this;
    }

    /**
     * Enhanced Query with Security Checks
     */
    async secureQuery(model, operation, args = {}, auditAction = null) {
        try {
            // 1. Pre-Query Security Validation
            this._validateSecurityContext();
            this._sanitizeQueryArgs(args);

            // 2. Apply Row-Level Security
            const securedArgs = this._applyRowLevelSecurity(model, operation, args);

            // 3. Execute Query
            const startTime = Date.now();
            const result = await this[model][operation](securedArgs);
            const duration = Date.now() - startTime;

            // 4. Post-Query Processing
            const sanitizedResult = this._sanitizeQueryResult(result, model, operation);

            // 5. Audit Logging
            if (auditAction || this._shouldAuditQuery(model, operation)) {
                auditLog(auditAction || `DB_${operation.toUpperCase()}`, `Database ${operation} on ${model}`, {
                    ...this.securityContext,
                    model,
                    operation,
                    duration,
                    recordCount: Array.isArray(sanitizedResult) ? sanitizedResult.length : 1
                });
            }

            return sanitizedResult;

        } catch (error) {
            // Error Audit
            auditLog('DB_ERROR', `Database error during ${operation} on ${model}`, {
                ...this.securityContext,
                model,
                operation,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Secure Transaction Wrapper
     */
    async secureTransaction(callback, options = {}) {
        const startTime = Date.now();

        try {
            const result = await this.$transaction(async (tx) => {
                // Set security context for transaction
                tx.setSecurityContext = this.setSecurityContext.bind(tx);
                tx.secureQuery = this.secureQuery.bind(tx);
                tx.currentUser = this.currentUser;
                tx.securityContext = this.securityContext;

                return await callback(tx);
            }, options);

            const duration = Date.now() - startTime;

            auditLog('DB_TRANSACTION_SUCCESS', 'Database transaction completed', {
                ...this.securityContext,
                duration,
                transactionType: options.isolationLevel || 'default'
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;

            auditLog('DB_TRANSACTION_ERROR', 'Database transaction failed', {
                ...this.securityContext,
                duration,
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Validate Security Context
     */
    _validateSecurityContext() {
        if (!this.currentUser || !this.securityContext.userId) {
            throw new Error('Security context not set - user authentication required');
        }

        if (!this.securityContext.userRole) {
            throw new Error('User role not defined in security context');
        }
    }

    /**
     * Sanitize Query Arguments
     */
    _sanitizeQueryArgs(args) {
        if (!args || typeof args !== 'object') return args;

        // Recursively sanitize string values
        const sanitize = (obj) => {
            for (const key in obj) {
                const value = obj[key];
                if (typeof value === 'string') {
                    obj[key] = value.replace(/['"\\;\-\-]/g, '').trim();
                } else if (typeof value === 'object' && value !== null) {
                    sanitize(value);
                }
            }
        };

        sanitize(args);
        return args;
    }

    /**
     * Apply Row-Level Security
     */
    _applyRowLevelSecurity(model, operation, args) {
        const securedArgs = { ...args };
        const userRole = this.securityContext.userRole;
        const userId = this.securityContext.userId;

        // Define row-level security rules
        const rlsRules = {
            // Users can only see their own data unless admin
            Kullanici: {
                nonAdmin: {
                    where: { id: userId }
                }
            },

            // Orders - restricted based on role
            SiparisFormu: {
                viewer: {
                    where: {
                        OR: [
                            { olusturanKullanici: userId },
                            { durum: { not: 'iptal' } }
                        ]
                    }
                }
            },

            // Customer data - some fields restricted
            CariMusteri: {
                viewer: {
                    select: {
                        id: true,
                        ad: true,
                        telefon: true,
                        email: true,
                        // Sensitive fields excluded for viewers
                        tcNo: false,
                        vergiNo: false
                    }
                }
            },

            // Financial data - highly restricted
            FiyatTarihsel: {
                nonAdmin: {
                    where: {
                        aktif: true
                    }
                }
            }
        };

        const modelRules = rlsRules[model];
        if (!modelRules) return securedArgs;

        // Apply role-based restrictions
        const isAdmin = ['admin', 'super_admin'].includes(userRole);
        const isViewer = userRole === 'viewer' || userRole === 'guest';

        if (!isAdmin && modelRules.nonAdmin) {
            // Merge non-admin restrictions
            if (modelRules.nonAdmin.where) {
                securedArgs.where = {
                    ...securedArgs.where,
                    ...modelRules.nonAdmin.where
                };
            }
        }

        if (isViewer && modelRules.viewer) {
            // Apply viewer restrictions
            if (modelRules.viewer.where) {
                securedArgs.where = {
                    ...securedArgs.where,
                    ...modelRules.viewer.where
                };
            }

            if (modelRules.viewer.select && operation === 'findMany') {
                securedArgs.select = modelRules.viewer.select;
            }
        }

        return securedArgs;
    }

    /**
     * Sanitize Query Results
     */
    _sanitizeQueryResult(result, model, operation) {
        if (!result) return result;

        const userRole = this.securityContext.userRole;
        const isAdmin = ['admin', 'super_admin'].includes(userRole);

        // Get secure field selection
        const allowedFields = dbSecurity.getSecureSelect(userRole, model.toLowerCase());

        const sanitizeRecord = (record) => {
            if (!record || typeof record !== 'object') return record;

            // For non-admins, filter sensitive fields
            if (!isAdmin && allowedFields.length > 0) {
                const sanitized = {};
                for (const field of allowedFields) {
                    if (record.hasOwnProperty(field)) {
                        sanitized[field] = record[field];
                    }
                }

                // Always include id field
                if (record.id) {
                    sanitized.id = record.id;
                }

                return sanitized;
            }

            return record;
        };

        // Apply sanitization
        if (Array.isArray(result)) {
            return result.map(sanitizeRecord);
        } else {
            return sanitizeRecord(result);
        }
    }

    /**
     * Determine if Query Should Be Audited
     */
    _shouldAuditQuery(model, operation) {
        const auditOperations = ['create', 'update', 'delete', 'deleteMany', 'updateMany'];
        const sensitiveModels = ['Kullanici', 'SiparisFormu', 'CariMusteri', 'FiyatTarihsel'];

        return auditOperations.includes(operation) || sensitiveModels.includes(model);
    }
}

/**
 * Get Secure Prisma Instance
 */
export function getSecurePrisma() {
    if (!prismaInstance) {
        prismaInstance = new SecurePrismaClient({
            log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error', 'warn']
        });
    }
    return prismaInstance;
}

/**
 * Prisma Security Middleware
 */
export function withPrismaSecurity(handler) {
    return async (req, res) => {
        try {
            // Get secure Prisma instance
            const prisma = getSecurePrisma();

            // Set security context from request user
            if (req.user) {
                prisma.setSecurityContext(req.user, req);
            }

            // Attach secure Prisma to request
            req.prisma = prisma;

            // Execute handler
            return await handler(req, res);

        } catch (error) {
            console.error('Prisma Security Error:', error);
            throw error;
        }
    };
}

/**
 * Quick Secure Database Operations
 */
export const secureDB = {
    // Secure find operations
    async findMany(model, args = {}, auditAction = null) {
        const prisma = getSecurePrisma();
        return await prisma.secureQuery(model, 'findMany', args, auditAction);
    },

    async findUnique(model, args = {}, auditAction = null) {
        const prisma = getSecurePrisma();
        return await prisma.secureQuery(model, 'findUnique', args, auditAction);
    },

    async findFirst(model, args = {}, auditAction = null) {
        const prisma = getSecurePrisma();
        return await prisma.secureQuery(model, 'findFirst', args, auditAction);
    },

    // Secure write operations
    async create(model, args = {}, auditAction = null) {
        const prisma = getSecurePrisma();
        return await prisma.secureQuery(model, 'create', {
            ...args,
            data: {
                ...args.data,
                olusturanKullanici: prisma.securityContext.userId,
                olusturmaTarihi: new Date()
            }
        }, auditAction);
    },

    async update(model, args = {}, auditAction = null) {
        const prisma = getSecurePrisma();
        return await prisma.secureQuery(model, 'update', {
            ...args,
            data: {
                ...args.data,
                guncelleyenKullanici: prisma.securityContext.userId,
                guncellemeTarihi: new Date()
            }
        }, auditAction);
    },

    async delete(model, args = {}, auditAction = null) {
        const prisma = getSecurePrisma();
        return await prisma.secureQuery(model, 'delete', args, auditAction);
    },

    // Secure transaction
    async transaction(callback, options = {}) {
        const prisma = getSecurePrisma();
        return await prisma.secureTransaction(callback, options);
    }
};

export default {
    getSecurePrisma,
    withPrismaSecurity,
    secureDB,
    SecurePrismaClient
}; 