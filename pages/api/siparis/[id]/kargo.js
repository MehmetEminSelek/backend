/**
 * =============================================
 * SECURED CARGO API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../../lib/audit-logger.js';
import { validateInput } from '../../../../lib/validation.js';

/**
 * Cargo API Handler with Full Security Integration
 */
async function cargoHandler(req, res) {
    const { method } = req;
    const { id: orderId } = req.query;

    // Validate order ID
    if (!orderId || isNaN(parseInt(orderId))) {
        return res.status(400).json({
            error: 'Valid order ID is required'
        });
    }

    try {
        switch (method) {
            case 'GET':
                return await getCargoInfo(req, res, parseInt(orderId));
            case 'PATCH':
            case 'PUT':
                return await updateCargoInfo(req, res, parseInt(orderId));
            default:
                res.setHeader('Allow', ['GET', 'PATCH', 'PUT']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'PATCH', 'PUT']
                });
        }
    } catch (error) {
        console.error('Cargo API Error:', error);

        auditLog('CARGO_API_ERROR', 'Cargo API operation failed', {
            userId: req.user?.userId,
            orderId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Cargo operation failed',
            code: 'CARGO_ERROR'
        });
    }
}

/**
 * Get Cargo Information
 */
async function getCargoInfo(req, res, orderId) {
    const cargoInfo = await req.prisma.secureQuery('siparisFormu', 'findUnique', {
        where: { id: orderId },
        select: {
            id: true,
            sipariNo: true,
            durum: true,
            kargoDurumu: true,
            kargoSirketi: true,
            kargoTakipNo: true,
            kargoNotu: true,
            kargoTarihi: true,
            teslimTarihi: true,
            teslimatTarihi: true,
            hedefSubeId: true,
            musteriAd: true,
            musteriAdres: true,
            hedefSube: {
                select: {
                    id: true,
                    ad: true,
                    adres: true
                }
            }
        }
    });

    if (!cargoInfo) {
        return res.status(404).json({
            error: 'Order not found'
        });
    }

    auditLog('CARGO_INFO_VIEW', 'Cargo information accessed', {
        userId: req.user.userId,
        orderId,
        orderNumber: cargoInfo.sipariNo
    });

    return res.status(200).json({
        success: true,
        cargo: cargoInfo
    });
}

/**
 * Update Cargo Information with Security Validation
 */
async function updateCargoInfo(req, res, orderId) {
    // Input validation
    const validationResult = validateInput(req.body, {
        allowedFields: [
            'kargoDurumu', 'kargoSirketi', 'kargoTakipNo', 'kargoNotu',
            'kargoTarihi', 'teslimTarihi', 'hedefSubeId'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid cargo data',
            details: validationResult.errors
        });
    }

    // Check if order exists and get current state
    const currentOrder = await req.prisma.secureQuery('siparisFormu', 'findUnique', {
        where: { id: orderId },
        select: {
            id: true,
            sipariNo: true,
            durum: true,
            kargoDurumu: true,
            kargoSirketi: true,
            kargoTakipNo: true,
            olusturanKullanici: true
        }
    });

    if (!currentOrder) {
        return res.status(404).json({
            error: 'Order not found'
        });
    }

    // Permission checks
    const isOwner = currentOrder.olusturanKullanici === req.user.userId;
    const canModifyCargo = req.user.roleLevel >= 60 || isOwner; // Supervisors+ or owner

    if (!canModifyCargo) {
        return res.status(403).json({
            error: 'Insufficient permissions to modify cargo information'
        });
    }

    // Business rule validation
    const validCargoStatuses = [
        'HAZIRLANACAK', 'HAZIRLANIYOR', 'KARGOYA_VERILECEK', 'KARGODA',
        'SUBEDE_TESLIM', 'ADRESE_TESLIMAT', 'TESLIM_EDILDI'
    ];

    if (req.body.kargoDurumu && !validCargoStatuses.includes(req.body.kargoDurumu)) {
        return res.status(400).json({
            error: 'Invalid cargo status'
        });
    }

    // Tracking number validation
    if (req.body.kargoTakipNo && req.body.kargoTakipNo.length > 50) {
                    return res.status(400).json({
            error: 'Tracking number too long (max 50 characters)'
        });
    }

    // Prepare update data
    const updateData = {};
    const changeLog = [];

    const allowedFields = [
        'kargoDurumu', 'kargoSirketi', 'kargoTakipNo', 'kargoNotu', 'hedefSubeId'
    ];

    for (const field of allowedFields) {
        if (req.body[field] !== undefined && req.body[field] !== currentOrder[field]) {
            updateData[field] = req.body[field];
            changeLog.push(`${field}: ${currentOrder[field] || 'null'} → ${req.body[field] || 'null'}`);
        }
    }

    // Date field handling
    if (req.body.kargoTarihi) {
        const cargoDate = new Date(req.body.kargoTarihi);
        if (!isNaN(cargoDate.getTime())) {
            updateData.kargoTarihi = cargoDate;
            changeLog.push('kargoTarihi updated');
        }
    }

    if (req.body.teslimTarihi) {
        const deliveryDate = new Date(req.body.teslimTarihi);
        if (!isNaN(deliveryDate.getTime())) {
            updateData.teslimTarihi = deliveryDate;
            changeLog.push('teslimTarihi updated');

            // Auto-update order status if delivered
            updateData.durum = 'teslim_edildi';
            changeLog.push('durum: auto-updated to teslim_edildi');
        }
    }

    // Auto-update order status based on cargo status
    if (req.body.kargoDurumu) {
        switch (req.body.kargoDurumu) {
            case 'KARGODA':
                updateData.durum = 'kargoda';
                break;
            case 'TESLIM_EDILDI':
                updateData.durum = 'teslim_edildi';
                if (!updateData.teslimTarihi) {
                    updateData.teslimTarihi = new Date();
                }
                break;
        }
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
            error: 'No valid updates provided'
        });
    }

    // Update with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        const updatedOrder = await tx.secureQuery('siparisFormu', 'update', {
            where: { id: orderId },
            data: {
                ...updateData,
                guncellemeTarihi: new Date(),
                guncelleyenKullanici: req.user.userId
            },
            select: {
                id: true,
                sipariNo: true,
                durum: true,
                kargoDurumu: true,
                kargoSirketi: true,
                kargoTakipNo: true,
                kargoTarihi: true,
                teslimTarihi: true
            }
        }, 'CARGO_UPDATED');

        return updatedOrder;
    });

    // Enhanced audit logging
    auditLog('CARGO_UPDATED', 'Cargo information updated', {
        userId: req.user.userId,
        orderId,
        orderNumber: result.sipariNo,
        changes: changeLog,
        isOwner,
        userRole: req.user.rol
    });

    return res.status(200).json({
        success: true,
        message: 'Cargo information updated successfully',
        cargo: result,
        changes: changeLog
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(cargoHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.UPDATE_ORDERS,

        // Input Validation Configuration
        allowedFields: [
            'kargoDurumu', 'kargoSirketi', 'kargoTakipNo', 'kargoNotu',
            'kargoTarihi', 'teslimTarihi', 'hedefSubeId'
        ],

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true
    }
); 