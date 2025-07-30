/**
 * =============================================
 * SECURED BRANCH TRANSFER API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../../lib/audit-logger.js';
import { validateInput } from '../../../../lib/validation.js';

/**
 * Branch Transfer API Handler with Full Security Integration
 */
async function branchTransferHandler(req, res) {
    const { method } = req;
    const { id: orderId } = req.query;

    if (!orderId || isNaN(parseInt(orderId))) {
        return res.status(400).json({
            error: 'Valid order ID is required'
        });
    }

    try {
        if (method === 'PATCH' || method === 'PUT') {
            return await updateBranchTransfer(req, res, parseInt(orderId));
        } else {
            res.setHeader('Allow', ['PATCH', 'PUT']);
            return res.status(405).json({
                error: 'Method not allowed',
                allowed: ['PATCH', 'PUT']
            });
        }
    } catch (error) {
        console.error('Branch Transfer API Error:', error);

        auditLog('BRANCH_TRANSFER_API_ERROR', 'Branch transfer API operation failed', {
            userId: req.user?.userId,
            orderId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Branch transfer operation failed',
            code: 'BRANCH_TRANSFER_ERROR'
        });
    }
}

/**
 * Update Branch Transfer Information
 */
async function updateBranchTransfer(req, res, orderId) {
    // Input validation
    const validationResult = validateInput(req.body, {
        allowedFields: [
            'subeNeredenId', 'subeNereyeId', 'transferDurumu',
            'transferTarihi', 'transferNotu', 'kargoDurumu'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid branch transfer data',
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
            subeNeredenId: true,
            subeNereyeId: true
        }
    });

    if (!currentOrder) {
        return res.status(404).json({
            error: 'Order not found'
        });
    }

    // Permission checks - Only managers+ can handle branch transfers
    const isOwner = currentOrder.olusturanKullanici === req.user.userId;
    const canModifyBranchTransfer = req.user.roleLevel >= 70; // Managers+ only

    if (!canModifyBranchTransfer) {
        return res.status(403).json({
            error: 'Insufficient permissions to modify branch transfer information'
        });
    }

    // Validate branch IDs if provided
    if (req.body.subeNeredenId) {
        const sourceExists = await req.prisma.secureQuery('sube', 'findUnique', {
            where: { id: parseInt(req.body.subeNeredenId) },
            select: { id: true, ad: true }
        });
        if (!sourceExists) {
            return res.status(400).json({
                error: 'Source branch not found'
            });
        }
    }

    if (req.body.subeNereyeId) {
        const targetExists = await req.prisma.secureQuery('sube', 'findUnique', {
            where: { id: parseInt(req.body.subeNereyeId) },
            select: { id: true, ad: true }
        });
        if (!targetExists) {
            return res.status(400).json({
                error: 'Target branch not found'
            });
        }
    }

    // Prepare update data
    const updateData = {};
    const changeLog = [];

    if (req.body.subeNeredenId) {
        updateData.subeNeredenId = parseInt(req.body.subeNeredenId);
        changeLog.push(`Source branch updated to: ${req.body.subeNeredenId}`);
    }

    if (req.body.subeNereyeId) {
        updateData.subeNereyeId = parseInt(req.body.subeNereyeId);
        changeLog.push(`Target branch updated to: ${req.body.subeNereyeId}`);
    }

    if (req.body.transferDurumu) {
        updateData.durum = req.body.transferDurumu;
        changeLog.push(`Transfer status updated to: ${req.body.transferDurumu}`);
    }

    if (req.body.kargoDurumu) {
        updateData.kargoDurumu = req.body.kargoDurumu;
        changeLog.push(`Cargo status updated to: ${req.body.kargoDurumu}`);
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
                subeNeredenId: true,
                subeNereyeId: true,
                transferTarihi: true,
                transferNotu: true,
                subeNereden: {
                    select: { id: true, ad: true }
                },
                subeNereye: {
                    select: { id: true, ad: true }
                }
            }
        }, 'BRANCH_TRANSFER_UPDATED');

        return updatedOrder;
    });

    // Enhanced audit logging
    auditLog('BRANCH_TRANSFER_UPDATED', 'Branch transfer information updated', {
        userId: req.user.userId,
        orderId,
        orderNumber: result.sipariNo,
        changes: changeLog,
        sourceBranch: result.subeNeredenId,
        targetBranch: result.subeNereyeId,
        userRole: req.user.rol
    });

    return res.status(200).json({
        success: true,
        message: 'Branch transfer information updated successfully',
        transfer: result,
        changes: changeLog
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(branchTransferHandler),
    {
        permission: PERMISSIONS.MANAGE_ORDERS, // Higher permission for branch transfers
        allowedFields: [
            'subeNeredenId', 'subeNereyeId', 'transferDurumu',
            'transferTarihi', 'transferNotu', 'kargoDurumu'
        ],
        preventSQLInjection: true,
        enableAuditLogging: true
    }
); 