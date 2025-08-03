import prisma from '../lib/prisma.js';
import { auditLog } from '../lib/audit-logger.js';

/**
 * Production-Ready Audit Logging Middleware
 * Based on best practices from enterprise applications
 */

export function auditLoggingMiddleware(req, res, next) {
    // Get IP and user agent for context
    const ip = req.headers['x-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        'unknown';

    const userAgent = req.headers['user-agent'] || 'unknown';
    const origin = req.headers.origin || req.headers.referer || 'unknown';

    // Attach audit logging function to request
    req.audit = async (action, options = {}) => {
        const {
            targets = [],
            metadata = {},
            level = 'info',
            category = 'user_action'
        } = options;

        try {
            // Get user information from session/token
            const user = req.user || null;
            const userId = user?.id || 'anonymous';
            const userRole = user?.rol || 'unknown';
            const userName = user?.ad || user?.username || 'unknown';

            // Create audit log entry
            const auditEntry = {
                action,
                actor: {
                    id: userId,
                    type: userId === 'anonymous' ? 'anonymous' : 'user',
                    name: userName,
                    role: userRole
                },
                context: {
                    ip,
                    userAgent,
                    origin,
                    method: req.method,
                    url: req.url,
                    timestamp: new Date().toISOString()
                },
                targets: targets.map(target => ({
                    id: String(target.id),
                    type: target.type,
                    name: target.name || undefined
                })),
                metadata: {
                    ...metadata,
                    level,
                    category,
                    requestId: req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                },
                occurredAt: new Date()
            };

            // Log to database
            await auditLog(auditEntry);

            // Log to console in development
            if (process.env.NODE_ENV === 'development') {
                console.log(`🔍 Audit: ${action}`, {
                    user: userName,
                    ip: ip.substring(0, 10) + '...',
                    targets: targets.length
                });
            }

        } catch (error) {
            console.error('❌ Audit logging failed:', error.message);

            // Don't fail the request if audit logging fails
            // Log the error for monitoring
            try {
                await auditLog({
                    action: 'audit.log_failure',
                    actor: { id: 'system', type: 'system' },
                    context: {
                        originalAction: action,
                        error: error.message,
                        ip,
                        timestamp: new Date().toISOString()
                    },
                    targets: [],
                    metadata: { level: 'error', category: 'system_error' },
                    occurredAt: new Date()
                });
            } catch (fallbackError) {
                console.error('❌ Fallback audit logging also failed:', fallbackError.message);
            }
        }
    };

    // Attach quick audit functions for common actions
    req.auditLogin = (user) => req.audit('user.login', {
        targets: [{ id: user.id, type: 'user', name: user.ad }],
        metadata: { loginMethod: 'password' }
    });

    req.auditLogout = (user) => req.audit('user.logout', {
        targets: [{ id: user.id, type: 'user', name: user.ad }]
    });

    req.auditCreate = (resource, item) => req.audit(`${resource}.create`, {
        targets: [{ id: item.id, type: resource, name: item.ad || item.name }],
        metadata: { operation: 'create' }
    });

    req.auditUpdate = (resource, item, changes = {}) => req.audit(`${resource}.update`, {
        targets: [{ id: item.id, type: resource, name: item.ad || item.name }],
        metadata: { operation: 'update', changes }
    });

    req.auditDelete = (resource, item) => req.audit(`${resource}.delete`, {
        targets: [{ id: item.id, type: resource, name: item.ad || item.name }],
        metadata: { operation: 'delete' }
    });

    req.auditView = (resource, item) => req.audit(`${resource}.view`, {
        targets: [{ id: item.id, type: resource, name: item.ad || item.name }],
        metadata: { operation: 'read' },
        level: 'debug'
    });

    req.auditExport = (resource, count = 0) => req.audit(`${resource}.export`, {
        targets: [{ id: resource, type: 'collection' }],
        metadata: { operation: 'export', recordCount: count }
    });

    req.auditImport = (resource, count = 0) => req.audit(`${resource}.import`, {
        targets: [{ id: resource, type: 'collection' }],
        metadata: { operation: 'import', recordCount: count }
    });

    next();
}

/**
 * Higher-order function to wrap API routes with audit logging
 */
export function withAuditLogging(handler, action) {
    return async (req, res) => {
        try {
            // Execute the original handler
            const result = await handler(req, res);

            // Auto-audit successful operations if action is provided
            if (action && res.statusCode < 400) {
                await req.audit(action, {
                    metadata: {
                        statusCode: res.statusCode,
                        success: true
                    }
                });
            }

            return result;
        } catch (error) {
            // Audit failed operations
            if (action) {
                await req.audit(`${action}.failed`, {
                    metadata: {
                        error: error.message,
                        statusCode: 500,
                        success: false
                    },
                    level: 'error'
                });
            }
            throw error;
        }
    };
}

/**
 * Audit configuration for different environments
 */
export const auditConfig = {
    development: {
        logLevel: 'debug',
        logToConsole: true,
        logToDatabase: true
    },
    production: {
        logLevel: 'info',
        logToConsole: false,
        logToDatabase: true
    },
    test: {
        logLevel: 'error',
        logToConsole: false,
        logToDatabase: false
    }
};

// Export current environment config
export const currentAuditConfig = auditConfig[process.env.NODE_ENV] || auditConfig.development;