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
    // Database query with security context
    const payments = await req.prisma.secureQuery('odeme', 'findMany', {
        where: {
            siparisId: parseInt(siparisId)
        },
        include: {
            odemeYontemi: true,
            siparis: {
                select: {
                    id: true,
                    siparisTarihi: true,
                    toplamTutar: true,
                    durum: true
                }
            }
        },
        orderBy: {
            odemeTarihi: 'desc'
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
        requiredFields: ['miktar', 'odemeYontemiId'],
        allowedFields: ['miktar', 'odemeYontemiId', 'aciklama', 'referansNo'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid payment data',
            details: validationResult.errors
        });
    }

    const { miktar, odemeYontemiId, aciklama, referansNo } = req.body;

    // Business logic validation
    if (!miktar || miktar <= 0) {
        return res.status(400).json({
            error: 'Payment amount must be greater than 0'
        });
    }

    // Secure transaction with enhanced logging
    const result = await req.prisma.secureTransaction(async (tx) => {
        // 1. Get order details
        const siparis = await tx.secureQuery('siparisFormu', 'findUnique', {
            where: { id: parseInt(siparisId) },
            include: {
                cari: {
                    select: {
                        id: true,
                        ad: true,
                        telefon: true,
                        email: true
                    }
                }
            }
        });

        if (!siparis) {
            throw new Error('Order not found');
        }

        // 2. Create customer if missing (enhanced security)
        let cariMusteri = siparis.cari;
        if (!cariMusteri && siparis.musteriAd) {
            cariMusteri = await tx.secureQuery('cariMusteri', 'create', {
                data: {
                    ad: siparis.musteriAd,
                    telefon: siparis.musteriTelefon || '',
                    email: siparis.musteriEmail || '',
                    adres: siparis.musteriAdres || '',
                    sehir: siparis.musteriSehir || '',
                    aktif: true
                }
            }, 'CUSTOMER_AUTO_CREATED');

            // Link customer to order
            await tx.secureQuery('siparisFormu', 'update', {
                where: { id: parseInt(siparisId) },
                data: { musteriId: cariMusteri.id }
            }, 'ORDER_CUSTOMER_LINKED');
        }

        // 3. Calculate payment totals
        const existingPayments = await tx.secureQuery('odeme', 'findMany', {
            where: { siparisId: parseInt(siparisId) }
        });

        const totalPaid = existingPayments.reduce((sum, payment) => sum + payment.miktar, 0);
        const newTotal = totalPaid + parseFloat(miktar);

        if (newTotal > siparis.toplamTutar) {
            throw new Error('Payment amount exceeds order total');
        }

        // 4. Create payment record
        const payment = await tx.secureQuery('odeme', 'create', {
            data: {
                siparisId: parseInt(siparisId),
                miktar: parseFloat(miktar),
                odemeYontemiId: parseInt(odemeYontemiId),
                odemeTarihi: new Date(),
                aciklama: aciklama || '',
                referansNo: referansNo || '',
                durum: 'tamamlandi'
            }
        }, 'PAYMENT_CREATED');

        // 5. Update order status if fully paid
        const isFullyPaid = newTotal >= siparis.toplamTutar;
        if (isFullyPaid && siparis.durum !== 'odeme_tamamlandi') {
            await tx.secureQuery('siparisFormu', 'update', {
                where: { id: parseInt(siparisId) },
                data: {
                    durum: 'odeme_tamamlandi',
                    odemeDurumu: 'tamamlandi'
                }
            }, 'ORDER_PAYMENT_COMPLETED');
        }

        return {
            payment,
            order: siparis,
            customer: cariMusteri,
            totalPaid: newTotal,
            isFullyPaid
        };
    });

    // Enhanced audit logging
    auditLog('PAYMENT_CREATED', 'New payment created', {
        userId: req.user.userId,
        siparisId,
        paymentId: result.payment.id,
        amount: miktar,
        paymentMethod: odemeYontemiId,
        customerCreated: !!result.customer,
        isFullyPaid: result.isFullyPaid
    });

    return res.status(201).json({
        success: true,
        message: 'Payment saved successfully',
        payment: result.payment,
        totalPaid: result.totalPaid,
        isFullyPaid: result.isFullyPaid
    });
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
    const updatedPayment = await req.prisma.secureQuery('odeme', 'update', {
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
        allowedFields: ['miktar', 'odemeYontemiId', 'aciklama', 'referansNo', 'paymentId', 'durum'],
        requiredFields: {
            POST: ['miktar', 'odemeYontemiId'],
            PUT: ['paymentId']
        },

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true
    }
);
