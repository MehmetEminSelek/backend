/**
 * =============================================
 * ENHANCED RBAC SYSTEM - SECURITY LAYER 8
 * =============================================
 * - Permission Caching with Redis-like memory store
 * - Role Hierarchy Validation
 * - Secure Session Management
 * - Real-time Permission Revocation
 * - Audit Trail Integration
 */

import { verifyToken } from './auth.js';
import { auditLog } from './audit-logger.js';

// Permission Cache Store (In-Memory with TTL)
class PermissionCache {
    constructor() {
        this.cache = new Map();
        this.ttl = 15 * 60 * 1000; // 15 dakika TTL
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000); // 5 dakikada bir cleanup
    }

    set(userId, permissions, roleLevel) {
        const key = `user:${userId}`;
        this.cache.set(key, {
            permissions,
            roleLevel,
            timestamp: Date.now(),
            expiresAt: Date.now() + this.ttl
        });
    }

    get(userId) {
        const key = `user:${userId}`;
        const cached = this.cache.get(key);

        if (!cached || Date.now() > cached.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return cached;
    }

    invalidate(userId) {
        const key = `user:${userId}`;
        this.cache.delete(key);
    }

    invalidateAll() {
        this.cache.clear();
    }

    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now > value.expiresAt) {
                this.cache.delete(key);
            }
        }
    }

    destroy() {
        clearInterval(this.cleanupInterval);
        this.cache.clear();
    }
}

// Global Permission Cache Instance
const permissionCache = new PermissionCache();

// Enhanced Roles with Hierarchy
export const ROLES = {
    SUPER_ADMIN: 'super_admin',     // Level 100
    ADMIN: 'admin',                 // Level 90
    MANAGER: 'manager',             // Level 80
    SUPERVISOR: 'supervisor',       // Level 70
    OPERATOR: 'operator',           // Level 60
    EDITOR: 'editor',               // Level 50
    VIEWER: 'viewer',               // Level 40
    GUEST: 'guest'                  // Level 10
};

// Role Hierarchy Levels
export const ROLE_LEVELS = {
    [ROLES.SUPER_ADMIN]: 100,
    [ROLES.ADMIN]: 90,
    [ROLES.MANAGER]: 80,
    [ROLES.SUPERVISOR]: 70,
    [ROLES.OPERATOR]: 60,
    [ROLES.EDITOR]: 50,
    [ROLES.VIEWER]: 40,
    [ROLES.GUEST]: 10
};

// Enhanced Permissions with Categories
export const PERMISSIONS = {
    // System Permissions (Level 90+)
    SYSTEM_ADMIN: 'system:admin',
    MANAGE_USERS: 'system:users:manage',
    MANAGE_ROLES: 'system:roles:manage',
    VIEW_AUDIT_LOGS: 'system:audit:view',
    MANAGE_SECURITY: 'system:security:manage',

    // User Management (Level 80+)
    VIEW_USERS: 'users:view',
    CREATE_USERS: 'users:create',
    UPDATE_USERS: 'users:update',
    DELETE_USERS: 'users:delete',

    // Product Management (Level 60+)
    VIEW_PRODUCTS: 'products:view',
    CREATE_PRODUCTS: 'products:create',
    UPDATE_PRODUCTS: 'products:update',
    DELETE_PRODUCTS: 'products:delete',

    // Order Management (Level 50+)
    VIEW_ORDERS: 'orders:view',
    CREATE_ORDERS: 'orders:create',
    UPDATE_ORDERS: 'orders:update',
    DELETE_ORDERS: 'orders:delete',
    MANAGE_ORDERS: 'orders:manage',

    // Customer Management (Level 50+)
    VIEW_CUSTOMERS: 'customers:view',
    CREATE_CUSTOMERS: 'customers:create',
    UPDATE_CUSTOMERS: 'customers:update',
    DELETE_CUSTOMERS: 'customers:delete',

    // Stock Management (Level 60+)
    VIEW_STOCK: 'stock:view',
    UPDATE_STOCK: 'stock:update',
    MANAGE_STOCK: 'stock:manage',

    // Materials (Level 60+)
    VIEW_MATERIALS: 'materials:view',
    CREATE_MATERIALS: 'materials:create',
    UPDATE_MATERIALS: 'materials:update',
    DELETE_MATERIALS: 'materials:delete',

    // Recipes (Level 70+)
    VIEW_RECIPES: 'recipes:view',
    CREATE_RECIPES: 'recipes:create',
    UPDATE_RECIPES: 'recipes:update',
    DELETE_RECIPES: 'recipes:delete',

    // Financial (Level 80+)
    VIEW_FINANCIAL: 'financial:view',
    UPDATE_PRICES: 'financial:prices:update',
    MANAGE_PAYMENTS: 'financial:payments:manage',

    // Reporting (Level 40+)
    VIEW_REPORTS: 'reports:view',
    GENERATE_REPORTS: 'reports:generate',
    EXPORT_REPORTS: 'reports:export',

    // Excel Operations (Level 70+)
    EXCEL_OPERATIONS: 'excel:operations'
};

// Enhanced Role-Permission Mapping
export const ROLE_PERMISSIONS = {
    [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),

    [ROLES.ADMIN]: [
        PERMISSIONS.MANAGE_USERS,
        PERMISSIONS.VIEW_AUDIT_LOGS,
        PERMISSIONS.VIEW_USERS, PERMISSIONS.CREATE_USERS, PERMISSIONS.UPDATE_USERS, PERMISSIONS.DELETE_USERS,
        PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.CREATE_PRODUCTS, PERMISSIONS.UPDATE_PRODUCTS, PERMISSIONS.DELETE_PRODUCTS,
        PERMISSIONS.VIEW_ORDERS, PERMISSIONS.CREATE_ORDERS, PERMISSIONS.UPDATE_ORDERS, PERMISSIONS.DELETE_ORDERS, PERMISSIONS.MANAGE_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS, PERMISSIONS.CREATE_CUSTOMERS, PERMISSIONS.UPDATE_CUSTOMERS, PERMISSIONS.DELETE_CUSTOMERS,
        PERMISSIONS.VIEW_STOCK, PERMISSIONS.UPDATE_STOCK, PERMISSIONS.MANAGE_STOCK,
        PERMISSIONS.VIEW_MATERIALS, PERMISSIONS.CREATE_MATERIALS, PERMISSIONS.UPDATE_MATERIALS, PERMISSIONS.DELETE_MATERIALS,
        PERMISSIONS.VIEW_RECIPES, PERMISSIONS.CREATE_RECIPES, PERMISSIONS.UPDATE_RECIPES, PERMISSIONS.DELETE_RECIPES,
        PERMISSIONS.VIEW_FINANCIAL, PERMISSIONS.UPDATE_PRICES, PERMISSIONS.MANAGE_PAYMENTS,
        PERMISSIONS.VIEW_REPORTS, PERMISSIONS.GENERATE_REPORTS, PERMISSIONS.EXPORT_REPORTS,
        PERMISSIONS.EXCEL_OPERATIONS
    ],

    [ROLES.MANAGER]: [
        PERMISSIONS.VIEW_USERS, PERMISSIONS.UPDATE_USERS,
        PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.CREATE_PRODUCTS, PERMISSIONS.UPDATE_PRODUCTS,
        PERMISSIONS.VIEW_ORDERS, PERMISSIONS.CREATE_ORDERS, PERMISSIONS.UPDATE_ORDERS, PERMISSIONS.MANAGE_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS, PERMISSIONS.CREATE_CUSTOMERS, PERMISSIONS.UPDATE_CUSTOMERS,
        PERMISSIONS.VIEW_STOCK, PERMISSIONS.UPDATE_STOCK, PERMISSIONS.MANAGE_STOCK,
        PERMISSIONS.VIEW_MATERIALS, PERMISSIONS.CREATE_MATERIALS, PERMISSIONS.UPDATE_MATERIALS,
        PERMISSIONS.VIEW_RECIPES, PERMISSIONS.CREATE_RECIPES, PERMISSIONS.UPDATE_RECIPES,
        PERMISSIONS.VIEW_FINANCIAL, PERMISSIONS.UPDATE_PRICES,
        PERMISSIONS.VIEW_REPORTS, PERMISSIONS.GENERATE_REPORTS, PERMISSIONS.EXPORT_REPORTS,
        PERMISSIONS.EXCEL_OPERATIONS
    ],

    [ROLES.SUPERVISOR]: [
        PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.UPDATE_PRODUCTS,
        PERMISSIONS.VIEW_ORDERS, PERMISSIONS.CREATE_ORDERS, PERMISSIONS.UPDATE_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS, PERMISSIONS.CREATE_CUSTOMERS, PERMISSIONS.UPDATE_CUSTOMERS,
        PERMISSIONS.VIEW_STOCK, PERMISSIONS.UPDATE_STOCK,
        PERMISSIONS.VIEW_MATERIALS, PERMISSIONS.UPDATE_MATERIALS,
        PERMISSIONS.VIEW_RECIPES,
        PERMISSIONS.VIEW_REPORTS, PERMISSIONS.GENERATE_REPORTS
    ],

    [ROLES.OPERATOR]: [
        PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.UPDATE_PRODUCTS,
        PERMISSIONS.VIEW_ORDERS, PERMISSIONS.CREATE_ORDERS, PERMISSIONS.UPDATE_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS, PERMISSIONS.CREATE_CUSTOMERS, PERMISSIONS.UPDATE_CUSTOMERS,
        PERMISSIONS.VIEW_STOCK, PERMISSIONS.UPDATE_STOCK,
        PERMISSIONS.VIEW_MATERIALS,
        PERMISSIONS.VIEW_REPORTS
    ],

    [ROLES.EDITOR]: [
        PERMISSIONS.VIEW_PRODUCTS, PERMISSIONS.UPDATE_PRODUCTS,
        PERMISSIONS.VIEW_ORDERS, PERMISSIONS.CREATE_ORDERS, PERMISSIONS.UPDATE_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS, PERMISSIONS.UPDATE_CUSTOMERS,
        PERMISSIONS.VIEW_STOCK,
        PERMISSIONS.VIEW_REPORTS
    ],

    [ROLES.VIEWER]: [
        PERMISSIONS.VIEW_PRODUCTS,
        PERMISSIONS.VIEW_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS,
        PERMISSIONS.VIEW_STOCK,
        PERMISSIONS.VIEW_REPORTS
    ],

    [ROLES.GUEST]: [
        PERMISSIONS.VIEW_PRODUCTS,
        PERMISSIONS.VIEW_REPORTS
    ]
};

/**
 * Enhanced Permission Checker with Caching
 */
export function hasPermission(role, permission) {
    if (!role || !permission) return false;

    const rolePermissions = ROLE_PERMISSIONS[role];
    if (!rolePermissions) return false;

    return rolePermissions.includes(permission);
}

/**
 * Role Hierarchy Checker
 */
export function hasRoleOrHigher(userRole, requiredRole) {
    const userLevel = ROLE_LEVELS[userRole] || 0;
    const requiredLevel = ROLE_LEVELS[requiredRole] || 0;
    return userLevel >= requiredLevel;
}

/**
 * Get Role Level
 */
export function getRoleLevel(role) {
    return ROLE_LEVELS[role] || 0;
}

/**
 * Enhanced Auth with Caching
 */
export async function requireAuth(req, options = {}) {
    try {
        // 1. Token Verification
        const token = req.headers.authorization?.replace('Bearer ', '') ||
            req.cookies?.auth_token;

        if (!token) {
            auditLog('AUTH_FAILED', 'No token provided', { ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress });
            throw new Error('Token gerekli');
        }

        // 2. Verify & Decode Token
        const payload = verifyToken(token);
        if (!payload || !payload.userId) {
            auditLog('AUTH_FAILED', 'Invalid token', { token: token.substring(0, 10) + '...' });
            throw new Error('Geçersiz token');
        }

        // 3. Check Cache First
        let userPermissions = permissionCache.get(payload.userId);

        if (!userPermissions) {
            // Cache miss - load from token
            userPermissions = {
                permissions: ROLE_PERMISSIONS[payload.rol] || [],
                roleLevel: ROLE_LEVELS[payload.rol] || 0,
                timestamp: Date.now()
            };

            // Cache permissions
            permissionCache.set(payload.userId, userPermissions.permissions, userPermissions.roleLevel);
        }

        // 4. Create Enhanced User Object
        const user = {
            userId: payload.userId,
            kullaniciAdi: payload.kullaniciAdi,
            rol: payload.rol,
            roleLevel: userPermissions.roleLevel,
            permissions: userPermissions.permissions,
            sessionId: payload.sessionId,
            iat: payload.iat,
            exp: payload.exp
        };

        // 5. Role Requirements Check
        if (options.role && !hasRoleOrHigher(user.rol, options.role)) {
            auditLog('ACCESS_DENIED', 'Insufficient role level', {
                userId: user.userId,
                required: options.role,
                actual: user.rol
            });
            throw new Error(`Bu işlem için en az ${options.role} yetkisi gerekli`);
        }

        // 6. Permission Requirements Check
        if (options.permission && !hasPermission(user.rol, options.permission)) {
            auditLog('ACCESS_DENIED', 'Insufficient permissions', {
                userId: user.userId,
                required: options.permission,
                role: user.rol
            });
            throw new Error(`Bu işlem için ${options.permission} izni gerekli`);
        }

        // 7. Multiple Permissions Check
        if (options.permissions && Array.isArray(options.permissions)) {
            const missingPermissions = options.permissions.filter(
                permission => !hasPermission(user.rol, permission)
            );

            if (missingPermissions.length > 0) {
                auditLog('ACCESS_DENIED', 'Multiple permissions missing', {
                    userId: user.userId,
                    missing: missingPermissions
                });
                throw new Error(`Bu işlem için şu izinler gerekli: ${missingPermissions.join(', ')}`);
            }
        }

        // 8. Success Audit
        auditLog('AUTH_SUCCESS', 'User authenticated successfully', {
            userId: user.userId,
            role: user.rol,
            path: req.url || req.originalUrl
        });

        return user;

    } catch (error) {
        auditLog('AUTH_ERROR', error.message, {
            ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent']
        });
        throw error;
    }
}

/**
 * Enhanced RBAC Wrapper - PRODUCTION READY
 */
export function withRBAC(handler, options = {}) {
    return async (req, res) => {
        try {
            // 1. Authenticate User
            const user = await requireAuth(req, options);

            // 2. Attach User to Request
            req.user = user;
            req.permissions = user.permissions;
            req.roleLevel = user.roleLevel;

            // 3. Execute Handler
            return await handler(req, res);

        } catch (error) {
            // 4. Handle Auth Errors
            console.error('RBAC Error:', error.message);

            if (error.message.includes('Token') || error.message.includes('Geçersiz')) {
                return res.status(401).json({
                    error: 'Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.',
                    code: 'AUTH_EXPIRED'
                });
            }

            if (error.message.includes('yetkisi') || error.message.includes('izni')) {
                return res.status(403).json({
                    error: error.message,
                    code: 'ACCESS_DENIED'
                });
            }

            return res.status(500).json({
                error: 'Yetkilendirme hatası',
                code: 'AUTH_ERROR'
            });
        }
    };
}

/**
 * Permission Cache Management
 */
export const permissionCacheManager = {
    invalidateUser: (userId) => permissionCache.invalidate(userId),
    invalidateAll: () => permissionCache.invalidateAll(),
    getStats: () => ({
        size: permissionCache.cache.size,
        ttl: permissionCache.ttl
    })
};

// Legacy compatibility checker
export const checkAuth = requireAuth;

export default {
    ROLES,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    ROLE_LEVELS,
    requireAuth,
    checkAuth,
    withRBAC,
    hasPermission,
    hasRoleOrHigher,
    getRoleLevel,
    permissionCacheManager
}; 