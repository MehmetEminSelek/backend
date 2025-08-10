/**
 * =============================================
 * SECURED PAYMENT API - ALL LAYERS INTEGRATED
 * =============================================
 * Example implementation of comprehensive security
 */

import { secureAPI } from '../../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../../lib/audit-logger.js';
import { validateInput } from '../../../../lib/validation.js';
import prisma from '../../../../lib/prisma.js';

/**
 * Payment API Handler with Full Security Integration
 */
async function paymentHandler(req, res) {
    const { method } = req;
    const { id: siparisId } = req.query;

    try {
        switch (method) {
            case 'GET':
                return await getPayments(req, res, siparisId);
            case 'POST':
                return await createPayment(req, res, siparisId);
            case 'PUT':
                return await updatePayment(req, res, siparisId);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PUT']
                });
        }
    } catch (error) {
        console.error('Payment API Error:', error);

        auditLog('PAYMENT_API_ERROR', 'Payment API operation failed', {
            userId: req.user?.userId,
            siparisId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Payment operation failed',
            code: 'PAYMENT_ERROR'
        });
    }
}

/**
 * Get Payments for Order
 */
async function getPayments(req, res, siparisId) {
    const payments = await prisma.cariOdeme.findMany({
        where: { siparisId: parseInt(siparisId) },
        orderBy: { odemeTarihi: 'desc' },
        select: {
            id: true,
            tutar: true,
            odemeYontemi: true,
            odemeTarihi: true,
            aciklama: true
        }
    });

    auditLog('PAYMENT_VIEW', 'Payment records accessed', {
        userId: req.user.userId,
        siparisId,
        paymentCount: payments.length
    });

    return res.status(200).json({
        success: true,
        payments
    });
}

/**
 * Create New Payment
 */
async function createPayment(req, res, siparisId) {
    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['tutar', 'odemeYontemi'],
        allowedFields: ['tutar', 'odemeYontemi', 'aciklama', 'referansNo'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Geçersiz veri formatı',
            details: validationResult.errors
        });
    }

    const { tutar, odemeYontemi, aciklama, referansNo } = req.body;

    // Business logic validation
    if (!tutar || tutar <= 0) {
        return res.status(400).json({
            error: 'Ödeme tutarı 0’dan büyük olmalı'
        });
    }

    // Secure transaction with enhanced logging
    const result = await prisma.$transaction(async (tx) => {
        // 1. Get order details
        const siparis = await tx.siparis.findUnique({
            where: { id: parseInt(siparisId) },
            select: { id: true, cariId: true, toplamTutar: true, durum: true }
        });

        if (!siparis) {
            throw new Error('Order not found');
        }

        if (!siparis.cariId) {
            throw new Error('Sipariş bir cari ile ilişkilendirilmemiş');
        }

        // 3. Calculate payment totals
        const existingPayments = await tx.cariOdeme.findMany({ where: { siparisId: parseInt(siparisId) } });

        const totalPaid = existingPayments.reduce((sum, p) => sum + (p.tutar || 0), 0);
        const newTotal = totalPaid + parseFloat(tutar);

        if (newTotal > (siparis.toplamTutar || 0)) {
            throw new Error('Payment amount exceeds order total');
        }

        // 4. Create payment record (CariOdeme)
        const payment = await tx.cariOdeme.create({
            data: {
                cariMusteriId: siparis.cariId,
                siparisId: parseInt(siparisId),
                tutar: parseFloat(tutar),
                odemeYontemi: odemeYontemi || 'NAKIT',
                odemeTarihi: new Date(),
                aciklama: aciklama || ''
            },
            select: { id: true, tutar: true, odemeYontemi: true, odemeTarihi: true, aciklama: true }
        });

        // 5. Update order status if fully paid
        const isFullyPaid = newTotal >= (siparis.toplamTutar || 0);
        if (isFullyPaid) {
            await tx.siparis.update({ where: { id: parseInt(siparisId) }, data: { odemeDurumu: 'tamamlandi' } });
        }

        return {
            payment,
            order: siparis,
            totalPaid: newTotal,
            isFullyPaid
        };
    });

    // Enhanced audit logging
    auditLog('PAYMENT_CREATED', 'New payment created', {
        userId: req.user.userId,
        siparisId,
        paymentId: result.payment.id,
        amount: tutar,
        paymentMethod: odemeYontemi,
        customerCreated: !!result.customer,
        isFullyPaid: result.isFullyPaid
    });

    return res.status(201).json({ success: true, payment: result.payment, totalPaid: result.totalPaid, isFullyPaid: result.isFullyPaid });
}

/**
 * Update Payment
 */
async function updatePayment(req, res, siparisId) {
    const { paymentId } = req.body;

    if (!paymentId) {
        return res.status(400).json({
            error: 'Payment ID is required'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        allowedFields: ['paymentId', 'miktar', 'aciklama', 'durum'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid update data',
            details: validationResult.errors
        });
    }

    const updateData = {};
    if (req.body.miktar) updateData.miktar = parseFloat(req.body.miktar);
    if (req.body.aciklama) updateData.aciklama = req.body.aciklama;
    if (req.body.durum) updateData.durum = req.body.durum;

    // Update with security context
    const updatedPayment = await prisma.odeme.update({
        where: {
            id: parseInt(paymentId),
            siparisId: parseInt(siparisId) // Ensure payment belongs to this order
        },
        data: updateData
    }, 'PAYMENT_UPDATED');

    auditLog('PAYMENT_UPDATED', 'Payment record updated', {
        userId: req.user.userId,
        siparisId,
        paymentId,
        changes: Object.keys(updateData)
    });

    return res.status(200).json({
        success: true,
        message: 'Payment updated successfully',
        payment: updatedPayment
    });
}

// ===== SECURITY INTEGRATION =====
// Layer 1-6: Basic security (handled by middleware)
// Layer 7-8: RBAC with payment permissions
// Layer 9: API security with input validation  
// Layer 10: Prisma security with audit logging

export default secureAPI(
    withPrismaSecurity(paymentHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.MANAGE_PAYMENTS,

        // Input Validation Configuration
        allowedFields: ['tutar', 'odemeYontemi', 'aciklama', 'referansNo', 'paymentId', 'durum'],
        requiredFields: {
            POST: ['tutar', 'odemeYontemi'],
            PUT: ['paymentId']
        },

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true
    }
);
