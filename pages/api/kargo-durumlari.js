/**
 * =============================================
 * SECURED CARGO STATUS API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../lib/api-security.js';
import { withPrismaSecurity } from '../../lib/prisma-security.js';
import { PERMISSIONS } from '../../lib/rbac-enhanced.js';
import { auditLog } from '../../lib/audit-logger.js';
import { validateInput } from '../../lib/validation.js';

/**
 * Cargo Status API Handler with Full Security Integration
 */
async function cargoStatusHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getCargoStatuses(req, res);
            case 'POST':
                return await updateCargoStatus(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST']
                });
        }
    } catch (error) {
        console.error('Cargo Status API Error:', error);

        auditLog('CARGO_STATUS_API_ERROR', 'Cargo status API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Cargo status operation failed',
            code: 'CARGO_STATUS_ERROR'
        });
    }
}

/**
 * Get Cargo Statuses with Enhanced Security and Real-time Data
 */
async function getCargoStatuses(req, res) {
    // Permission check - Cargo status requires shipping/logistics access
    if (req.user.roleLevel < 50) {
        return res.status(403).json({
            error: 'Insufficient permissions to view cargo statuses'
        });
    }

    const {
        siparisId,
        kargoDurumu,
        dateFrom,
        dateTo,
        subeId,
        includeSummary = false
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: ['siparisId', 'kargoDurumu', 'dateFrom', 'dateTo', 'subeId', 'includeSummary'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid query parameters',
            details: validationResult.errors
        });
    }

    console.log('GET /api/kargo-durumlari request received...');

    // Enhanced security transaction for cargo status data
    const cargoData = await req.prisma.secureTransaction(async (tx) => {
        // Static cargo status definitions
            const kargoDurumlari = [
                {
                    kod: 'KARGOYA_VERILECEK',
                    ad: 'Kargoya Verilecek',
                    renk: 'primary',
                aciklama: 'Sipariş hazırlandı, kargoya verilmeyi bekliyor',
                sira: 1,
                aktif: true
                },
                {
                kod: 'KARGOYA_VERILDI',
                ad: 'Kargoya Verildi',
                    renk: 'info',
                aciklama: 'Sipariş kargo firmasına teslim edildi',
                sira: 2,
                aktif: true
            },
            {
                kod: 'KARGO_MERKEZINDE',
                ad: 'Kargo Merkezinde',
                renk: 'warning',
                aciklama: 'Paket kargo merkezinde işlem bekliyor',
                sira: 3,
                aktif: true
            },
            {
                kod: 'DAGITIMDA',
                ad: 'Dağıtımda',
                renk: 'orange',
                aciklama: 'Paket dağıtım aracında, teslimata gidiyor',
                sira: 4,
                aktif: true
                },
                {
                    kod: 'TESLIM_EDILDI',
                    ad: 'Teslim Edildi',
                    renk: 'success',
                aciklama: 'Paket başarıyla teslim edildi',
                sira: 5,
                aktif: true
            },
            {
                kod: 'TESLIM_EDILEMEDI',
                ad: 'Teslim Edilemedi',
                renk: 'error',
                aciklama: 'Paket teslim edilemedi, tekrar deneniyor',
                sira: 6,
                aktif: true
            },
            {
                kod: 'IADE',
                ad: 'İade',
                renk: 'secondary',
                aciklama: 'Paket geri iade edildi',
                sira: 7,
                aktif: true
            },
            {
                kod: 'KAYIP',
                ad: 'Kayıp',
                renk: 'red',
                aciklama: 'Paket kayboldu veya hasar gördü',
                sira: 8,
                aktif: true
            }
        ];

        // If requesting just status definitions
        if (!siparisId && !includeSummary) {
            return {
                statuses: kargoDurumlari,
                totalStatuses: kargoDurumlari.length
            };
        }

        // Build where clause for order filtering
        const whereClause = {
            durum: { in: ['KARGOLANDI', 'TESLIM_EDILDI'] } // Only shipped orders
        };

        // Single order lookup
        if (siparisId) {
            whereClause.id = parseInt(siparisId);
        }

        // Branch filtering for non-admin users
        if (req.user.roleLevel < 80 && req.user.subeId) {
            whereClause.subeId = req.user.subeId;
        } else if (subeId) {
            whereClause.subeId = parseInt(subeId);
        }

        // Date range filtering
        if (dateFrom || dateTo) {
            whereClause.kargolama_tarihi = {};
            if (dateFrom) {
                whereClause.kargolama_tarihi.gte = new Date(dateFrom);
            }
            if (dateTo) {
                whereClause.kargolama_tarihi.lte = new Date(dateTo);
            }
        }

        // Cargo status filtering
        if (kargoDurumu) {
            whereClause.kargoDurumu = kargoDurumu;
        }

        // Get orders with cargo information
        const orders = await tx.secureQuery('siparis', 'findMany', {
            where: whereClause,
            select: {
                id: true,
                siparisNo: true,
                durum: true,
                kargoDurumu: true,
                kargolama_tarihi: true,
                takip_no: true,
                kargo_firmasi: true,
                teslim_tarihi: true,

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

                        // Contact for logistics
                        ...(req.user.roleLevel >= 60 && {
                            telefon: true
                        })
                    }
                },

                // Delivery address info for logistics staff
                ...(req.user.roleLevel >= 50 && {
                    teslimat_adresi: true,
                    teslimat_sehir: true,
                    teslimat_ilce: true
                }),

                // Branch information
                sube: {
                    select: {
                        id: true,
                        ad: true,
                        kod: true
                    }
                }
            },
            orderBy: { kargolama_tarihi: 'desc' },
            take: siparisId ? 1 : 100
        });

        // Calculate cargo summary statistics
        let summary = null;
        if (includeSummary === 'true' && req.user.roleLevel >= 60) {
            const statusCounts = {};
            kargoDurumlari.forEach(status => {
                statusCounts[status.kod] = orders.filter(order =>
                    order.kargoDurumu === status.kod
                ).length;
            });

            const now = new Date();
            const deliveredToday = orders.filter(order => {
                if (order.teslim_tarihi) {
                    const deliveryDate = new Date(order.teslim_tarihi);
                    return deliveryDate.toDateString() === now.toDateString();
                }
                return false;
            }).length;

            const overdueDeliveries = orders.filter(order => {
                if (order.kargolama_tarihi && !order.teslim_tarihi) {
                    const daysSinceShipped = (now - new Date(order.kargolama_tarihi)) / (1000 * 60 * 60 * 24);
                    return daysSinceShipped > 7; // More than 7 days
                }
                return false;
            }).length;

            summary = {
                totalShippedOrders: orders.length,
                statusBreakdown: statusCounts,
                deliveredToday,
                overdueDeliveries,
                averageDeliveryTime: orders.filter(o => o.teslim_tarihi && o.kargolama_tarihi).length > 0 ?
                    orders
                        .filter(o => o.teslim_tarihi && o.kargolama_tarihi)
                        .reduce((sum, o) => {
                            const days = (new Date(o.teslim_tarihi) - new Date(o.kargolama_tarihi)) / (1000 * 60 * 60 * 24);
                            return sum + days;
                        }, 0) / orders.filter(o => o.teslim_tarihi && o.kargolama_tarihi).length
                    : 0
            };
        }

                return {
            statuses: kargoDurumlari,
            orders: orders,
            summary
                };
            });

    // Enhanced audit logging
    auditLog('CARGO_STATUS_ACCESS', 'Cargo status accessed', {
        userId: req.user.userId,
        siparisId: siparisId || 'all',
        kargoDurumu: kargoDurumu || 'all',
        includeSummary,
        totalOrders: cargoData.orders?.length || 0,
        roleLevel: req.user.roleLevel
    });

            return res.status(200).json({
        success: true,
        message: 'Cargo status data retrieved successfully',
        data: {
            statuses: cargoData.statuses,
            ...(cargoData.orders && { orders: cargoData.orders }),
            ...(cargoData.summary && { summary: cargoData.summary })
        },
        metadata: {
            generatedAt: new Date(),
            userRole: req.user.rol,
            accessLevel: req.user.roleLevel,
            filters: { siparisId, kargoDurumu, dateFrom, dateTo }
        }
    });
}

/**
 * Update Cargo Status with Enhanced Security and Validation
 */
async function updateCargoStatus(req, res) {
    // Permission check - Only logistics staff+ can update cargo status
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to update cargo status'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        requiredFields: ['siparisId', 'kargoDurumu'],
        allowedFields: [
            'siparisId', 'kargoDurumu', 'takipNo', 'kargoFirmasi',
            'aciklama', 'teslimTarihi', 'teslimAlan'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid cargo update data',
            details: validationResult.errors
        });
    }

    const {
        siparisId, kargoDurumu, takipNo, kargoFirmasi,
        aciklama, teslimTarihi, teslimAlan
    } = req.body;

    // Validate cargo status
    const validStatuses = [
        'KARGOYA_VERILECEK', 'KARGOYA_VERILDI', 'KARGO_MERKEZINDE',
        'DAGITIMDA', 'TESLIM_EDILDI', 'TESLIM_EDILEMEDI', 'IADE', 'KAYIP'
    ];

    if (!validStatuses.includes(kargoDurumu)) {
        return res.status(400).json({
            error: 'Invalid cargo status. Must be one of: ' + validStatuses.join(', ')
        });
    }

    // Update cargo status with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Get current order
        const currentOrder = await tx.secureQuery('siparis', 'findUnique', {
            where: { id: parseInt(siparisId) },
            select: {
                id: true,
                siparisNo: true,
                durum: true,
                kargoDurumu: true,
                subeId: true
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

        // Prepare update data
        const updateData = {
            kargoDurumu,
            ...(takipNo && { takip_no: takipNo }),
            ...(kargoFirmasi && { kargo_firmasi: kargoFirmasi }),
            ...(aciklama && { kargo_aciklama: aciklama }),
            guncellemeTarihi: new Date(),
            guncelleyenKullanici: req.user.userId
        };

        // Handle delivery completion
        if (kargoDurumu === 'TESLIM_EDILDI') {
            updateData.durum = 'TESLIM_EDILDI';
            updateData.teslim_tarihi = teslimTarihi ? new Date(teslimTarihi) : new Date();
            updateData.teslim_alan = teslimAlan || '';
        }

        // Handle return/lost cases
        if (['IADE', 'KAYIP'].includes(kargoDurumu)) {
            updateData.durum = kargoDurumu;
        }

        // Update order
        const updatedOrder = await tx.secureQuery('siparis', 'update', {
            where: { id: parseInt(siparisId) },
            data: updateData
        }, 'CARGO_STATUS_UPDATED');

        return updatedOrder;
    });

    // Enhanced audit logging
    auditLog('CARGO_STATUS_UPDATED', 'Cargo status updated', {
        userId: req.user.userId,
        siparisId: parseInt(siparisId),
        oldStatus: result.kargoDurumu,
        newStatus: kargoDurumu,
        takipNo,
        kargoFirmasi,
        delivered: kargoDurumu === 'TESLIM_EDILDI'
    });

    return res.status(200).json({
        success: true,
        message: 'Cargo status updated successfully',
        orderId: result.id,
        newStatus: kargoDurumu
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(cargoStatusHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_SHIPPING, // Shipping/logistics access permission

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_SHIPPING (Logistics Staff+)
        // POST: UPDATE_SHIPPING (Supervisor+)

        // Input Validation Configuration
        allowedFields: [
            'siparisId', 'kargoDurumu', 'dateFrom', 'dateTo', 'subeId', 'includeSummary',
            'takipNo', 'kargoFirmasi', 'aciklama', 'teslimTarihi', 'teslimAlan'
        ],
        requiredFields: {
            POST: ['siparisId', 'kargoDurumu']
        },

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true,
        operationalData: true // Mark as operational logistics data
    }
); 