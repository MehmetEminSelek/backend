/**
 * =============================================
 * SECURED DELIVERY API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../../lib/audit-logger.js';

/**
 * Delivery API Handler with Full Security Integration
 */
async function deliveryHandler(req, res) {
    const { method } = req;
    const { id: orderId } = req.query;

    if (!orderId || isNaN(parseInt(orderId))) {
        return res.status(400).json({
            error: 'Valid order ID is required'
        });
    }

    try {
        if (method === 'PATCH' || method === 'PUT') {
            return await markAsDelivered(req, res, parseInt(orderId));
        } else {
            res.setHeader('Allow', ['PATCH', 'PUT']);
            return res.status(405).json({
                error: 'Method not allowed',
                allowed: ['PATCH', 'PUT']
            });
        }
    } catch (error) {
        console.error('Delivery API Error:', error);

        auditLog('DELIVERY_API_ERROR', 'Delivery API operation failed', {
            userId: req.user?.userId,
            orderId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Delivery operation failed',
            code: 'DELIVERY_ERROR'
        });
    }
}

/**
 * Mark Order as Delivered
 */
async function markAsDelivered(req, res, orderId) {
    // Check if order exists and get current state
    const currentOrder = await req.prisma.secureQuery('siparisFormu', 'findUnique', {
        where: { id: orderId },
        select: {
            id: true,
            sipariNo: true,
            durum: true,
            musteriAd: true,
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
    const canMarkDelivered = req.user.roleLevel >= 60 || isOwner; // Supervisors+ or owner

    if (!canMarkDelivered) {
        return res.status(403).json({
            error: 'Insufficient permissions to mark order as delivered'
        });
    }

    // Business rule validation
    if (currentOrder.durum === 'teslim_edildi') {
        return res.status(400).json({
            error: 'Order is already marked as delivered'
        });
    }

    if (currentOrder.durum === 'iptal') {
        return res.status(400).json({
            error: 'Cannot deliver cancelled orders'
        });
    }

    // Update order with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        const updatedOrder = await tx.secureQuery('siparisFormu', 'update', {
            where: { id: orderId },
            data: {
                durum: 'teslim_edildi',
                teslimTarihi: new Date(),
                guncellemeTarihi: new Date(),
                guncelleyenKullanici: req.user.userId
            },
            select: {
                id: true,
                sipariNo: true,
                durum: true,
                teslimTarihi: true,
                musteriAd: true
            }
        }, 'ORDER_DELIVERED');

        return updatedOrder;
    });

    // Enhanced audit logging
    auditLog('ORDER_DELIVERED', 'Order marked as delivered', {
        userId: req.user.userId,
        orderId,
        orderNumber: result.sipariNo,
        customerName: result.musteriAd,
        deliveryTime: result.teslimTarihi,
        isOwner,
        userRole: req.user.rol
    });

    return res.status(200).json({
        success: true,
        message: 'Order marked as delivered successfully',
        order: result
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(deliveryHandler),
    {
        permission: PERMISSIONS.UPDATE_ORDERS,
        preventSQLInjection: true,
        enableAuditLogging: true
    }
); 