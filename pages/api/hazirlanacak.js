/**
 * =============================================
 * SECURED PRODUCTION QUEUE API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../lib/api-security.js';
import { withPrismaSecurity } from '../../lib/prisma-security.js';
import { PERMISSIONS } from '../../lib/rbac-enhanced.js';
import { auditLog } from '../../lib/audit-logger.js';
import { validateInput } from '../../lib/validation.js';

/**
 * Production Queue API Handler with Full Security Integration
 */
async function productionQueueHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getProductionQueue(req, res);
            case 'PATCH':
                return await updateProductionStatus(req, res);
            default:
                res.setHeader('Allow', ['GET', 'PATCH']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'PATCH']
                });
        }
    } catch (error) {
        console.error('Production Queue API Error:', error);

        auditLog('PRODUCTION_QUEUE_API_ERROR', 'Production queue API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Production queue operation failed',
            code: 'PRODUCTION_QUEUE_ERROR'
        });
    }
}

/**
 * Get Production Queue with Enhanced Security and Filtering
 */
async function getProductionQueue(req, res) {
    // Permission check - Production data requires production staff access
    if (req.user.roleLevel < 50) {
        return res.status(403).json({
            error: 'Insufficient permissions to view production queue'
        });
    }

    const {
        status = 'HAZIRLLANACAK',
        priority = 'all',
        subeId,
        dateFrom,
        dateTo,
        limit = 50
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: ['status', 'priority', 'subeId', 'dateFrom', 'dateTo', 'limit'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid query parameters',
            details: validationResult.errors
        });
    }

    console.log('GET /api/hazirlanacak request received...');

    // Enhanced security transaction for production queue data
    const queueData = await req.prisma.secureTransaction(async (tx) => {
        // Build where clause for production queue
        const whereClause = {
            durum: status
        };

        // Branch filtering for non-admin users
        if (req.user.roleLevel < 80 && req.user.subeId) {
            whereClause.subeId = req.user.subeId;
        } else if (subeId) {
            whereClause.subeId = parseInt(subeId);
        }

        // Date range filtering
        if (dateFrom || dateTo) {
            whereClause.tarih = {};
            if (dateFrom) {
                whereClause.tarih.gte = new Date(dateFrom);
            }
            if (dateTo) {
                whereClause.tarih.lte = new Date(dateTo);
            }
        }

        // Priority filtering
        if (priority !== 'all') {
            whereClause.oncelik = priority;
        }

        // Get production queue orders
        const siparisler = await tx.secureQuery('siparis', 'findMany', {
            where: whereClause,
            select: {
                id: true,
                siparisNo: true,
                tarih: true,
                teslimTarihi: true,
                durum: true,
                oncelik: true,
                toplamTutar: true,
                notlar: true,

                // Customer information with privacy controls
                cariMusteri: {
                    select: {
                        id: true,
                        musteriKodu: true,

                        // PII only for managers+
                        ...(req.user.roleLevel >= 70 && {
                            ad: true,
                            soyad: true,
                            sirketAdi: true
                        }),

                        // Contact only for supervisors+
                        ...(req.user.roleLevel >= 60 && {
                            telefon: true
                        })
                    }
                },

                // Order items for production planning
                siparisKalemleri: {
                    select: {
                        id: true,
                        adet: true,
                        birimFiyat: true,
                        urunId: true,
                        ozelNot: true,

                        // Product information
                            urun: {
                                select: {
                                id: true,
                                    ad: true,
                                    kod: true,
                                kategori: true,
                                birim: true,

                                // Production info for production staff
                                uretimSuresi: true,
                                aktif: true
                                        }
                                    }
                                }
                            },

                // Branch information
                sube: {
                    select: {
                        id: true,
                        ad: true,
                        kod: true
                    }
                },

                // Production tracking info for supervisors+
                ...(req.user.roleLevel >= 60 && {
                    uretimBaslangic: true,
                    tahminiTeslim: true,
                    uretimPersoneli: true
                })
            },
            orderBy: [
                { oncelik: 'desc' },
                { teslimTarihi: 'asc' },
                { tarih: 'asc' }
            ],
            take: Math.min(parseInt(limit), 100) // Max 100 orders
        });

        // Calculate production statistics
        const productionStats = {
            totalOrders: siparisler.length,
            totalItems: siparisler.reduce((sum, s) => sum + s.siparisKalemleri.length, 0),
            totalValue: siparisler.reduce((sum, s) => sum + (s.toplamTutar || 0), 0),
            urgentOrders: siparisler.filter(s => s.oncelik === 'YUKSEK').length,
            overdueOrders: siparisler.filter(s => {
                return s.teslimTarihi && new Date(s.teslimTarihi) < new Date();
            }).length
        };

        // Production capacity analysis (for managers+)
        let capacityAnalysis = null;
        if (req.user.roleLevel >= 70) {
            const productionLoad = siparisler.reduce((total, siparis) => {
                return total + siparis.siparisKalemleri.reduce((itemTotal, kalem) => {
                    const estimatedTime = kalem.urun.uretimSuresi || 60; // Default 60 min
                    return itemTotal + (kalem.adet * estimatedTime);
                }, 0);
            }, 0);

            capacityAnalysis = {
                totalProductionMinutes: productionLoad,
                totalProductionHours: Math.round(productionLoad / 60 * 100) / 100,
                estimatedDays: Math.ceil(productionLoad / (8 * 60)), // 8-hour workday
                avgOrderComplexity: siparisler.length > 0 ? productionLoad / siparisler.length : 0
            };
        }

        return {
            orders: siparisler,
            statistics: productionStats,
            capacityAnalysis
        };
    });

    // Enhanced audit logging
    auditLog('PRODUCTION_QUEUE_ACCESS', 'Production queue accessed', {
        userId: req.user.userId,
        status,
        priority,
        subeId: subeId || req.user.subeId,
        totalOrders: queueData.statistics.totalOrders,
        urgentOrders: queueData.statistics.urgentOrders,
        roleLevel: req.user.roleLevel
    });

    return res.status(200).json({
        success: true,
        message: 'Production queue retrieved successfully',
        data: queueData.orders,
        statistics: queueData.statistics,
        ...(queueData.capacityAnalysis && {
            capacityAnalysis: queueData.capacityAnalysis
        }),
        metadata: {
            generatedAt: new Date(),
            userRole: req.user.rol,
            accessLevel: req.user.roleLevel,
            filters: { status, priority, subeId }
        }
    });
}

/**
 * Update Production Status with Enhanced Security
 */
async function updateProductionStatus(req, res) {
    // Permission check - Only production staff+ can update production status
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to update production status'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        requiredFields: ['siparisId', 'newStatus'],
        allowedFields: ['siparisId', 'newStatus', 'estimatedCompletion', 'notes'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid update data',
            details: validationResult.errors
        });
    }

    const { siparisId, newStatus, estimatedCompletion, notes } = req.body;

    // Validate status transitions
    const validStatuses = ['HAZIRLLANACAK', 'HAZIRLANIYOR', 'HAZIR', 'KARGOLANDI', 'TESLIM_EDILDI'];
    if (!validStatuses.includes(newStatus)) {
        return res.status(400).json({
            error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
        });
    }

    // Update production status with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Get current order
        const currentOrder = await tx.secureQuery('siparis', 'findUnique', {
            where: { id: parseInt(siparisId) },
            select: {
                id: true,
                siparisNo: true,
                durum: true,
                subeId: true,
                cariMusteri: {
                    select: {
                        ad: true,
                        soyad: true
                        }
                    }
                }
            });

        if (!currentOrder) {
            throw new Error('Order not found');
        }

        // Branch access check for non-admin users
        if (req.user.roleLevel < 80 && req.user.subeId &&
            currentOrder.subeId !== req.user.subeId) {
            throw new Error('Access denied: Order belongs to different branch');
        }

        // Update order status
        const updatedOrder = await tx.secureQuery('siparis', 'update', {
            where: { id: parseInt(siparisId) },
            data: {
                durum: newStatus,
                ...(estimatedCompletion && { tahminiTeslim: new Date(estimatedCompletion) }),
                ...(notes && { uretimNotlari: notes }),
                ...(newStatus === 'HAZIRLANIYOR' && { uretimBaslangic: new Date() }),
                ...(newStatus === 'HAZIR' && { hazirlanmaTarihi: new Date() }),
                guncellemeTarihi: new Date(),
                guncelleyenKullanici: req.user.userId
            }
        }, 'PRODUCTION_STATUS_UPDATED');

        return updatedOrder;
    });

    // Enhanced audit logging
    auditLog('PRODUCTION_STATUS_UPDATED', 'Production status updated', {
        userId: req.user.userId,
        siparisId: parseInt(siparisId),
        oldStatus: result.durum,
        newStatus,
        estimatedCompletion,
        notes: !!notes
    });

    return res.status(200).json({
        success: true,
        message: 'Production status updated successfully',
        orderId: result.id,
        newStatus
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(productionQueueHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_PRODUCTION, // Production access permission

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_PRODUCTION (Production Staff+)
        // PATCH: UPDATE_PRODUCTION (Supervisor+)

        // Input Validation Configuration
        allowedFields: [
            'status', 'priority', 'subeId', 'dateFrom', 'dateTo', 'limit',
            'siparisId', 'newStatus', 'estimatedCompletion', 'notes'
        ],
        requiredFields: {
            PATCH: ['siparisId', 'newStatus']
        },

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true,
        operationalData: true // Mark as operational production data
    }
);