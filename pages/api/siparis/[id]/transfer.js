/**
 * =============================================
 * SECURED TRANSFER API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../../lib/audit-logger.js';
import { validateInput } from '../../../../lib/validation.js';

/**
 * Transfer API Handler with Full Security Integration
 */
async function transferHandler(req, res) {
    const { method } = req;
    const { id: orderId } = req.query;

    if (!orderId || isNaN(parseInt(orderId))) {
        return res.status(400).json({
            error: 'Valid order ID is required'
        });
    }

    try {
        if (method === 'PATCH' || method === 'PUT') {
            return await updateTransferInfo(req, res, parseInt(orderId));
        } else {
            res.setHeader('Allow', ['PATCH', 'PUT']);
            return res.status(405).json({
                error: 'Method not allowed',
                allowed: ['PATCH', 'PUT']
            });
        }
    } catch (error) {
        console.error('Transfer API Error:', error);

        auditLog('TRANSFER_API_ERROR', 'Transfer API operation failed', {
            userId: req.user?.userId,
            orderId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Transfer operation failed',
            code: 'TRANSFER_ERROR'
        });
    }
}

/**
 * Update Transfer Information
 */
async function updateTransferInfo(req, res, orderId) {
    // Input validation
    const validationResult = validateInput(req.body, {
        allowedFields: ['transferDurumu', 'transferTarihi', 'transferNotu', 'hedefSubeId'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid transfer data',
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
            musteriAd: true,
            olusturanKullanici: true,
            hedefSubeId: true
        }
    });

    if (!currentOrder) {
        return res.status(404).json({
            error: 'Order not found'
        });
    }

    // Permission checks
    const isOwner = currentOrder.olusturanKullanici === req.user.userId;
    const canModifyTransfer = req.user.roleLevel >= 70 || isOwner; // Managers+ or owner

    if (!canModifyTransfer) {
        return res.status(403).json({
            error: 'Insufficient permissions to modify transfer information'
        });
    }

    // Prepare update data
    const updateData = {};
    const changeLog = [];

    if (req.body.transferDurumu) {
        updateData.durum = req.body.transferDurumu;
        changeLog.push(`Transfer status updated to: ${req.body.transferDurumu}`);
    }

    if (req.body.transferTarihi) {
        const transferDate = new Date(req.body.transferTarihi);
        if (!isNaN(transferDate.getTime())) {
            updateData.transferTarihi = transferDate;
            changeLog.push('Transfer date updated');
        }
    }

    if (req.body.transferNotu) {
        updateData.transferNotu = req.body.transferNotu;
        changeLog.push('Transfer note updated');
    }

    if (req.body.hedefSubeId) {
        updateData.hedefSubeId = parseInt(req.body.hedefSubeId);
        changeLog.push(`Target branch updated to: ${req.body.hedefSubeId}`);
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
                hedefSubeId: true,
                transferTarihi: true,
                transferNotu: true
            }
        }, 'TRANSFER_UPDATED');

        return updatedOrder;
    });

    // Enhanced audit logging
    auditLog('TRANSFER_UPDATED', 'Transfer information updated', {
        userId: req.user.userId,
        orderId,
        orderNumber: result.sipariNo,
        changes: changeLog,
        isOwner,
        userRole: req.user.rol
    });

    return res.status(200).json({
        success: true,
        message: 'Transfer information updated successfully',
        transfer: result,
        changes: changeLog
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(transferHandler),
    {
        permission: PERMISSIONS.UPDATE_ORDERS,
        allowedFields: ['transferDurumu', 'transferTarihi', 'transferNotu', 'hedefSubeId'],
        preventSQLInjection: true,
        enableAuditLogging: true
    }
); 