/**
 * =============================================
 * SECURED AUDIT LOGS API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../lib/api-security.js';
import { withPrismaSecurity } from '../../lib/prisma-security.js';
import { PERMISSIONS } from '../../lib/rbac-enhanced.js';
import { auditLog } from '../../lib/audit-logger.js';
import { validateInput } from '../../lib/validation.js';

/**
 * Audit Logs API Handler with Full Security Integration
 */
async function auditLogsHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getAuditLogs(req, res);
            case 'POST':
                return await exportAuditLogs(req, res);
            case 'DELETE':
                return await purgeOldAuditLogs(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'DELETE']
                });
        }
    } catch (error) {
        console.error('Audit Logs API Error:', error);

        // Note: We don't log audit log API errors to avoid infinite loops
        // These errors are logged to console and application logs instead

        return res.status(500).json({
            error: 'Audit logs operation failed',
            code: 'AUDIT_LOGS_ERROR'
        });
    }
}

/**
 * Get Audit Logs with Enhanced Security and Filtering
 */
async function getAuditLogs(req, res) {
    // Permission check - Only administrators can view audit logs
    if (req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Insufficient permissions to view audit logs'
        });
    }

    const {
        startDate,
        endDate,
        userId,
        action,
        tableName,
        severity = 'all',
        ipAddress,
        source = 'all',
        page = 1,
        limit = 50,
        sortBy = 'timestamp',
        sortOrder = 'desc',
        search,
        includeDetails = false,
        exportFormat
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: [
            'startDate', 'endDate', 'userId', 'action', 'tableName', 'severity',
            'ipAddress', 'source', 'page', 'limit', 'sortBy', 'sortOrder',
            'search', 'includeDetails', 'exportFormat'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid query parameters',
            details: validationResult.errors
        });
    }

    // Detailed access requires super admin
    if (includeDetails === 'true' && req.user.roleLevel < 90) {
        return res.status(403).json({
            error: 'Detailed audit log access requires super administrator permissions'
        });
    }

    console.log('GET /api/audit-logs request received...');

    // Enhanced security transaction for audit log retrieval
    const auditData = await req.prisma.secureTransaction(async (tx) => {
        // Build comprehensive where clause
        const whereClause = {};

        // Date range filtering with security limits
        const maxDaysBack = req.user.roleLevel >= 90 ? 365 : 90; // Super admin: 1 year, Admin: 3 months
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30); // Default: last 30 days

        const startDateObj = startDate ? new Date(startDate) : defaultStartDate;
        const endDateObj = endDate ? new Date(endDate) : new Date();

        // Enforce maximum date range
        const daysBack = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
        if (daysBack > maxDaysBack) {
            throw new Error(`Date range cannot exceed ${maxDaysBack} days for your permission level`);
        }

        whereClause.timestamp = {
            gte: startDateObj,
            lte: endDateObj
        };

        // User filtering
        if (userId) {
            whereClause.userId = parseInt(userId);
        }

        // Action filtering
        if (action) {
            whereClause.action = { contains: action, mode: 'insensitive' };
        }

        // Table/Entity filtering
        if (tableName) {
            whereClause.entityType = { contains: tableName, mode: 'insensitive' };
        }

        // Severity filtering
        if (severity !== 'all') {
            const severityLevels = {
                'low': ['INFO', 'DEBUG'],
                'medium': ['WARN'],
                'high': ['ERROR', 'CRITICAL'],
                'critical': ['CRITICAL']
            };

            if (severityLevels[severity]) {
                whereClause.severity = { in: severityLevels[severity] };
            }
        }

        // IP address filtering
        if (ipAddress) {
            whereClause.ipAddress = { contains: ipAddress };
        }

        // Source filtering (API, UI, SYSTEM, etc.)
        if (source !== 'all') {
            whereClause.source = source.toUpperCase();
        }

        // Search filtering across multiple fields
        if (search) {
            whereClause.OR = [
                { action: { contains: search, mode: 'insensitive' } },
                { entityType: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { userAgent: { contains: search, mode: 'insensitive' } }
            ];
        }

        // Pagination and sorting
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(Math.max(1, parseInt(limit)), 200); // Max 200 per page
        const skip = (pageNum - 1) * limitNum;

        const validSortFields = ['timestamp', 'action', 'userId', 'severity', 'entityType'];
        const validSortOrders = ['asc', 'desc'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'timestamp';
        const sortDirection = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';

        // Get audit logs with security filtering
        const [auditLogs, totalCount] = await Promise.all([
            tx.secureQuery('auditLog', 'findMany', {
                where: whereClause,
                select: {
                    id: true,
                    timestamp: true,
                    action: true,
                    entityType: true,
                    entityId: true,
                    userId: true,
                    description: true,
                    severity: true,
                    ipAddress: true,
                    source: true,

                    // User information (basic)
                    kullanici: {
                        select: {
                            id: true,
                            adiSoyadi: true,
                            rol: true
                        }
                    },

                    // Detailed information only for super admins
                    ...(includeDetails === 'true' && req.user.roleLevel >= 90 && {
                        userAgent: true,
                        sessionId: true,
                        metadata: true,
                        oldValues: true,
                        newValues: true,
                        errorDetails: true
                    })
                },
                orderBy: {
                    [sortField]: sortDirection
                },
                skip,
                take: limitNum
            }),
            tx.secureQuery('auditLog', 'count', {
                where: whereClause
            })
        ]);

        // Calculate audit statistics
        const auditStats = await tx.secureQuery('auditLog', 'groupBy', {
            by: ['action'],
            where: {
                ...whereClause,
                timestamp: {
                    gte: startDateObj,
                    lte: endDateObj
                }
            },
            _count: {
                action: true
            },
            orderBy: {
                _count: {
                    action: 'desc'
                }
            },
            take: 10
        });

        // Security events summary
        const securityEvents = await tx.secureQuery('auditLog', 'count', {
            where: {
                ...whereClause,
                OR: [
                    { action: { contains: 'LOGIN_FAILED' } },
                    { action: { contains: 'UNAUTHORIZED' } },
                    { action: { contains: 'PERMISSION_DENIED' } },
                    { action: { contains: 'SECURITY_VIOLATION' } },
                    { severity: 'CRITICAL' }
                ]
            }
        });

        return {
            auditLogs,
            totalCount,
            statistics: {
                totalEntries: totalCount,
                dateRange: {
                    start: startDateObj,
                    end: endDateObj,
                    days: daysBack
                },
                topActions: auditStats.map(stat => ({
                    action: stat.action,
                    count: stat._count.action
                })),
                securityEvents
            }
        };
    });

    // Self-audit: Log access to audit logs (meta-auditing)
    auditLog('AUDIT_LOGS_ACCESSED', 'Audit logs viewed', {
        userId: req.user.userId,
        dateRange: {
            start: auditData.statistics.dateRange.start,
            end: auditData.statistics.dateRange.end
        },
        totalEntries: auditData.statistics.totalEntries,
        filters: { userId, action, tableName, severity, search },
        includeDetails: includeDetails === 'true',
        sensitiveOperation: true,
        auditAccess: true
    });

    return res.status(200).json({
        success: true,
        message: 'Audit logs retrieved successfully',
        logs: auditData.auditLogs,
        pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(auditData.totalCount / limitNum),
            totalItems: auditData.totalCount,
            itemsPerPage: limitNum
        },
        statistics: auditData.statistics,
        metadata: {
            generatedAt: new Date(),
            userRole: req.user.rol,
            accessLevel: req.user.roleLevel,
            detailsIncluded: includeDetails === 'true'
        }
    });
}

/**
 * Export Audit Logs with Enhanced Security
 */
async function exportAuditLogs(req, res) {
    // Permission check - Only super administrators can export audit logs
    if (req.user.roleLevel < 90) {
        return res.status(403).json({
            error: 'Insufficient permissions to export audit logs'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        allowedFields: ['format', 'startDate', 'endDate', 'filters', 'includeDetails'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid export parameters',
            details: validationResult.errors
        });
    }

    const {
        format = 'csv',
        startDate,
        endDate,
        filters = {},
        includeDetails = false
    } = req.body;

    // Validate export format
    const validFormats = ['csv', 'json', 'xlsx'];
    if (!validFormats.includes(format)) {
        return res.status(400).json({
            error: 'Invalid export format',
            validFormats
        });
    }

    // Export implementation would go here
    // For now, return a structured response
    const exportResult = {
        exportId: `audit_export_${Date.now()}`,
        format,
        status: 'prepared',
        message: 'Audit log export functionality requires additional implementation',
        estimatedRecords: 0,
        securityNote: 'Audit log exports are logged and monitored'
    };

    // Enhanced audit logging for export attempts
    auditLog('AUDIT_LOGS_EXPORT', 'Audit logs export requested', {
        userId: req.user.userId,
        format,
        dateRange: { startDate, endDate },
        filters,
        includeDetails,
        exportId: exportResult.exportId,
        sensitiveOperation: true,
        dataExport: true
    });

    return res.status(200).json({
        success: true,
        message: 'Audit log export prepared',
        export: exportResult
    });
}

/**
 * Purge Old Audit Logs with Enhanced Security
 */
async function purgeOldAuditLogs(req, res) {
    // Permission check - Only super administrators can purge audit logs
    if (req.user.roleLevel < 90) {
        return res.status(403).json({
            error: 'Insufficient permissions to purge audit logs'
        });
    }

    const {
        retentionDays = 365,
        dryRun = true,
        confirmPurge = false
    } = req.body;

    // Input validation
    if (retentionDays < 90) {
        return res.status(400).json({
            error: 'Minimum retention period is 90 days'
        });
    }

    if (!confirmPurge && !dryRun) {
        return res.status(400).json({
            error: 'Purge operation requires explicit confirmation'
        });
    }

    // Calculate purge date
    const purgeDate = new Date();
    purgeDate.setDate(purgeDate.getDate() - parseInt(retentionDays));

    // Enhanced security transaction for purge operation
    const purgeResult = await req.prisma.secureTransaction(async (tx) => {
        // Count records to be purged
        const recordsToDelete = await tx.secureQuery('auditLog', 'count', {
            where: {
                timestamp: {
                    lt: purgeDate
                }
            }
        });

        let deletedCount = 0;

        // Perform actual deletion if not dry run and confirmed
        if (!dryRun && confirmPurge) {
            const deleteResult = await tx.secureQuery('auditLog', 'deleteMany', {
                where: {
                    timestamp: {
                        lt: purgeDate
                    }
                }
            }, 'AUDIT_LOGS_PURGED');

            deletedCount = deleteResult.count;
        }

        return {
            recordsFound: recordsToDelete,
            recordsDeleted: deletedCount,
            purgeDate,
            retentionDays: parseInt(retentionDays),
            dryRun,
            confirmed: confirmPurge
        };
    });

    // Enhanced audit logging for purge operations
    auditLog('AUDIT_LOGS_PURGE', 'Audit logs purge operation', {
        userId: req.user.userId,
        recordsFound: purgeResult.recordsFound,
        recordsDeleted: purgeResult.recordsDeleted,
        purgeDate: purgeResult.purgeDate,
        retentionDays: purgeResult.retentionDays,
        dryRun: purgeResult.dryRun,
        confirmed: purgeResult.confirmed,
        sensitiveOperation: true,
        dataDestruction: !purgeResult.dryRun && purgeResult.confirmed
    });

    return res.status(200).json({
        success: true,
        message: purgeResult.dryRun ?
            'Purge simulation completed' :
            purgeResult.confirmed ? 'Audit logs purged successfully' : 'Purge prepared',
        result: purgeResult
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(auditLogsHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_AUDIT_LOGS, // Audit access permission

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_AUDIT_LOGS (Admin+)
        // POST: EXPORT_AUDIT_LOGS (Super Admin+)
        // DELETE: PURGE_AUDIT_LOGS (Super Admin+)

        // Input Validation Configuration
        allowedFields: [
            'startDate', 'endDate', 'userId', 'action', 'tableName', 'severity',
            'ipAddress', 'source', 'page', 'limit', 'sortBy', 'sortOrder',
            'search', 'includeDetails', 'exportFormat', 'format', 'filters',
            'retentionDays', 'dryRun', 'confirmPurge'
        ],
        requiredFields: {},

        // Security Options for Audit Data
        preventSQLInjection: true,
        enableAuditLogging: true,
        sensitiveDataAccess: true, // Audit logs are highly sensitive
        auditDataAccess: true, // Special flag for audit data operations
        requireHighestSecurity: true // Maximum security measures
    }
); 