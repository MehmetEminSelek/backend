import prisma from '../lib/prisma.js';

/**
 * Production-Ready Audit Logging Middleware (CommonJS)
 * Based on best practices from enterprise applications
 */

function auditLoggingMiddleware(req, res, next) {
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

            // Log to database using traditional auditLog
            const { auditLog } = await import('../lib/audit-logger.js');
            await auditLog({
                personelId: userId,
                action,
                tableName: 'SYSTEM',
                recordId: targets[0]?.id || 'unknown',
                oldValues: null,
                newValues: auditEntry,
                description: `${action} - ${metadata.operation || 'operation'}`,
                req
            });

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

    next();
}

// Export for ES6
export {
    auditLoggingMiddleware
};