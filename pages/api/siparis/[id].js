/**
 * =============================================
 * SECURED ORDER DETAIL API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../lib/audit-logger.js';
import { validateInput } from '../../../lib/validation.js';
import { calculateOrderItemPrice } from '../../../lib/fiyat.js';

/**
 * Order Detail API Handler with Full Security Integration
 */
async function orderDetailHandler(req, res) {
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
                return await getOrderDetail(req, res, parseInt(orderId));
            case 'PUT':
                return await updateOrder(req, res, parseInt(orderId));
            case 'DELETE':
                return await deleteOrder(req, res, parseInt(orderId));
            default:
                res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'PUT', 'DELETE']
                });
        }
    } catch (error) {
        console.error('Order Detail API Error:', error);

        auditLog('ORDER_DETAIL_API_ERROR', 'Order detail API operation failed', {
            userId: req.user?.userId,
            orderId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Order operation failed',
            code: 'ORDER_ERROR'
        });
    }
}

/**
 * Get Order Detail with Security-based Data Filtering
 */
async function getOrderDetail(req, res, orderId) {
    // Enhanced query with security-based field selection
    const orderDetail = await req.prisma.secureQuery('siparisFormu', 'findUnique', {
        where: { id: orderId },
        select: {
            id: true,
            sipariNo: true,
            siparisTarihi: true,
            durum: true,
            odemeDurumu: true,
            toplamTutar: true,
            musteriAd: true,
            musteriTelefon: true,
            musteriEmail: true,
            musteriAdres: true,
            musteriSehir: true,
            teslimatTarihi: true,
            teslimatSaati: true,
            aciklama: true,
            ozelTalepler: true,
            olusturmaTarihi: true,
            guncellemeTarihi: true,

            // Financial data only for higher roles
            ...(req.user.roleLevel >= 60 && {
                maliyetToplami: true,
                karMarji: true,
                indirimTutari: true,
                indirimSebebi: true
            }),

            // Customer details
            musteri: {
                select: {
                    id: true,
                    ad: true,
                    telefon: true,
                    email: true,
                    adres: true,
                    sehir: true,
                    musteriKodu: true
                }
            },

            // Branch info
            sube: {
                select: {
                    id: true,
                    ad: true,
                    kod: true
                }
            },

            // Order items with detailed info
            kalemler: {
                select: {
                    id: true,
                    miktar: true,
                    birim: true,
                    birimFiyat: true,
                    toplamFiyat: true,
                    aciklama: true,

                    // Cost data for higher roles
                    ...(req.user.roleLevel >= 60 && {
                        maliyetBirimFiyat: true,
                        maliyetToplam: true
                    }),

                    urun: {
                        select: {
                            id: true,
                            ad: true,
                            kod: true,
                            kategori: true,
                            birim: true
                        }
                    },
                    kutu: {
                        select: {
                            id: true,
                            ad: true,
                            ebat: true
                        }
                    },
                    tepsiTava: {
                        select: {
                            id: true,
                            ad: true,
                            ebat: true
                        }
                    }
                },
                orderBy: {
                    id: 'asc'
                }
            },

            // Payment info for authorized roles
            ...(req.user.roleLevel >= 50 && {
                odemeler: {
                    select: {
                        id: true,
                        miktar: true,
                        odemeTarihi: true,
                        odemeYontemi: true,
                        durum: true,
                        referansNo: true,
                        aciklama: true
                    },
                    orderBy: {
                        odemeTarihi: 'desc'
                    }
                }
            }),

            // Stock movements for inventory managers
            ...(req.user.roleLevel >= 60 && {
                stokHareketleri: {
                    select: {
                        id: true,
                        urunId: true,
                        hareketTipi: true,
                        miktar: true,
                        tarih: true,
                        aciklama: true,
                        urun: {
                            select: {
                                ad: true,
                                kod: true
                            }
                        }
                    },
                    orderBy: {
                        tarih: 'desc'
                    }
                }
            }),

            // Creator info for admins
            ...(req.user.roleLevel >= 80 && {
                olusturanUser: {
                    select: {
                        id: true,
                        ad: true,
                        soyad: true,
                        rol: true
                    }
                }
            })
        }
    });

    if (!orderDetail) {
        return res.status(404).json({
            error: 'Order not found'
        });
    }

    // Calculate order statistics
    const orderStats = {
        totalItems: orderDetail.kalemler?.length || 0,
        totalQuantity: orderDetail.kalemler?.reduce((sum, item) => sum + item.miktar, 0) || 0,
        totalPaid: orderDetail.odemeler?.reduce((sum, payment) => sum + payment.miktar, 0) || 0,
        remainingAmount: orderDetail.toplamTutar - (orderDetail.odemeler?.reduce((sum, payment) => sum + payment.miktar, 0) || 0)
    };

    auditLog('ORDER_DETAIL_VIEW', 'Order detail accessed', {
        userId: req.user.userId,
        orderId,
        orderNumber: orderDetail.sipariNo,
        customerName: orderDetail.musteriAd,
        orderAmount: orderDetail.toplamTutar
    });

    return res.status(200).json({
        success: true,
        order: orderDetail,
        stats: orderStats
    });
}

/**
 * Update Order with Enhanced Security and Validation
 */
async function updateOrder(req, res, orderId) {
    // Input validation
    const validationResult = validateInput(req.body, {
        allowedFields: [
            'durum', 'odemeDurumu', 'musteriAd', 'musteriTelefon', 'musteriEmail',
            'musteriAdres', 'musteriSehir', 'teslimatTarihi', 'teslimatSaati',
            'aciklama', 'ozelTalepler', 'kalemler', 'indirimTutari', 'indirimSebebi'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid update data',
            details: validationResult.errors
        });
    }

    // Get current order for comparison
    const currentOrder = await req.prisma.secureQuery('siparisFormu', 'findUnique', {
        where: { id: orderId },
        select: {
            id: true,
            durum: true,
            odemeDurumu: true,
            toplamTutar: true,
            musteriAd: true,
            olusturanKullanici: true,
            kalemler: {
                select: {
                    id: true,
                    urunId: true,
                    miktar: true,
                    birimFiyat: true,
                    toplamFiyat: true
                }
            }
        }
    });

    if (!currentOrder) {
        return res.status(404).json({
            error: 'Order not found'
        });
    }

    // Permission checks for different update types
    const isOwner = currentOrder.olusturanKullanici === req.user.userId;
    const canModifyStatus = req.user.roleLevel >= 60; // Supervisors+
    const canModifyFinancial = req.user.roleLevel >= 70; // Managers+
    const canModifyItems = req.user.roleLevel >= 60 || isOwner;

    // Status update validation
    if (req.body.durum && req.body.durum !== currentOrder.durum) {
        if (!canModifyStatus) {
            return res.status(403).json({
                error: 'Insufficient permissions to change order status'
            });
        }

        // Validate status transitions
        const validStatusTransitions = {
            'beklemede': ['onaylandi', 'iptal'],
            'onaylandi': ['hazirlaniyor', 'iptal'],
            'hazirlaniyor': ['hazir', 'beklemede'],
            'hazir': ['kargoda', 'teslim_edildi'],
            'kargoda': ['teslim_edildi'],
            'teslim_edildi': [], // Final state
            'iptal': [] // Final state
        };

        const allowedTransitions = validStatusTransitions[currentOrder.durum] || [];
        if (!allowedTransitions.includes(req.body.durum)) {
            return res.status(400).json({
                error: `Invalid status transition from ${currentOrder.durum} to ${req.body.durum}`
            });
        }
    }

    // Financial update validation
    if ((req.body.indirimTutari !== undefined || req.body.indirimSebebi) && !canModifyFinancial) {
        return res.status(403).json({
            error: 'Insufficient permissions to modify financial data'
        });
    }

    // Items update validation
    if (req.body.kalemler && !canModifyItems) {
        return res.status(403).json({
            error: 'Insufficient permissions to modify order items'
        });
    }

    // Enhanced transaction for order update
    const result = await req.prisma.secureTransaction(async (tx) => {
        const updateData = {};
        const changeLog = [];

        // Basic field updates
        const basicFields = ['durum', 'odemeDurumu', 'musteriAd', 'musteriTelefon', 'musteriEmail',
            'musteriAdres', 'musteriSehir', 'aciklama', 'ozelTalepler'];

        for (const field of basicFields) {
            if (req.body[field] !== undefined && req.body[field] !== currentOrder[field]) {
                updateData[field] = req.body[field];
                changeLog.push(`${field}: ${currentOrder[field]} → ${req.body[field]}`);
            }
        }

        // Date field updates
        if (req.body.teslimatTarihi) {
            updateData.teslimatTarihi = new Date(req.body.teslimatTarihi);
            changeLog.push('teslimatTarihi updated');
        }

        if (req.body.teslimatSaati) {
            updateData.teslimatSaati = req.body.teslimatSaati;
            changeLog.push('teslimatSaati updated');
        }

        // Financial updates
        if (req.body.indirimTutari !== undefined) {
            const discount = parseFloat(req.body.indirimTutari) || 0;
            if (discount > currentOrder.toplamTutar * 0.5) {
                throw new Error('Discount cannot exceed 50% of order total');
            }
            updateData.indirimTutari = discount;
            changeLog.push(`indirimTutari: ${currentOrder.indirimTutari || 0} → ${discount}`);
        }

        if (req.body.indirimSebebi) {
            updateData.indirimSebebi = req.body.indirimSebebi;
            changeLog.push('indirimSebebi updated');
        }

        // Order items update (complex operation)
        if (req.body.kalemler && Array.isArray(req.body.kalemler)) {
            // Validate all items first
            for (const kalem of req.body.kalemler) {
                if (!kalem.urunId || !kalem.miktar || kalem.miktar <= 0) {
                    throw new Error('Each order item must have valid product ID and quantity');
                }
            }

            // Delete existing items
            await tx.secureQuery('siparisKalem', 'deleteMany', {
                where: { siparisId: orderId }
            }, 'ORDER_ITEMS_DELETED');

            // Calculate new totals
            let newTotal = 0;
            let newCostTotal = 0;

            // Create new items
            for (const kalem of req.body.kalemler) {
                // Validate product
                const urun = await tx.secureQuery('urun', 'findUnique', {
                    where: { id: parseInt(kalem.urunId) },
                    select: { id: true, ad: true, aktif: true }
                });

                if (!urun || !urun.aktif) {
                    throw new Error(`Product ${kalem.urunId} not found or inactive`);
                }

                // Calculate pricing
                const priceResult = await calculateOrderItemPrice(
                    parseInt(kalem.urunId),
                    parseFloat(kalem.miktar),
                    kalem.birim || 'adet',
                    new Date()
                );

                if (!priceResult.success) {
                    throw new Error(`Price calculation failed for product ${kalem.urunId}`);
                }

                const itemTotal = priceResult.toplamFiyat;
                const itemCost = priceResult.maliyetToplami || 0;

                newTotal += itemTotal;
                newCostTotal += itemCost;

                await tx.secureQuery('siparisKalem', 'create', {
                    data: {
                        siparisId: orderId,
                        urunId: parseInt(kalem.urunId),
                        kutuId: kalem.kutuId ? parseInt(kalem.kutuId) : null,
                        tepsiTavaId: kalem.tepsiTavaId ? parseInt(kalem.tepsiTavaId) : null,
                        miktar: parseFloat(kalem.miktar),
                        birim: kalem.birim || 'adet',
                        birimFiyat: priceResult.birimFiyat,
                        toplamFiyat: itemTotal,
                        maliyetBirimFiyat: priceResult.maliyetBirimFiyat || 0,
                        maliyetToplam: itemCost,
                        aciklama: kalem.aciklama || ''
                    }
                }, 'ORDER_ITEM_CREATED');
            }

            // Apply discount if exists
            const finalDiscount = updateData.indirimTutari || currentOrder.indirimTutari || 0;
            const finalTotal = newTotal - finalDiscount;

            updateData.toplamTutar = finalTotal;
            updateData.maliyetToplami = newCostTotal;
            updateData.karMarji = finalTotal - newCostTotal;

            changeLog.push(`Items updated: ${req.body.kalemler.length} items, new total: ${finalTotal}`);
        }

        // Add update metadata
        updateData.guncellemeTarihi = new Date();
        updateData.guncelleyenKullanici = req.user.userId;

        // Update order
        const updatedOrder = await tx.secureQuery('siparisFormu', 'update', {
            where: { id: orderId },
            data: updateData,
            select: {
                id: true,
                sipariNo: true,
                durum: true,
                toplamTutar: true,
                musteriAd: true,
                guncellemeTarihi: true
            }
        }, 'ORDER_UPDATED');

        return {
            order: updatedOrder,
            changes: changeLog
        };
    });

    // Enhanced audit logging
    auditLog('ORDER_UPDATED', 'Order updated', {
        userId: req.user.userId,
        orderId,
        orderNumber: result.order.sipariNo,
        changes: result.changes,
        isOwner,
        userRole: req.user.rol
    });

    return res.status(200).json({
        success: true,
        message: 'Order updated successfully',
        order: result.order,
        changes: result.changes
    });
}

/**
 * Delete Order with Enhanced Security
 */
async function deleteOrder(req, res, orderId) {
    // Get order details for validation
    const orderToDelete = await req.prisma.secureQuery('siparisFormu', 'findUnique', {
        where: { id: orderId },
        select: {
            id: true,
            sipariNo: true,
            durum: true,
            toplamTutar: true,
            musteriAd: true,
            olusturanKullanici: true,
            odemeler: {
                select: { id: true, miktar: true }
            }
        }
    });

    if (!orderToDelete) {
        return res.status(404).json({
            error: 'Order not found'
        });
    }

    // Permission checks
    const isOwner = orderToDelete.olusturanKullanici === req.user.userId;
    const canDeleteAny = req.user.roleLevel >= 80; // Admin+

    if (!isOwner && !canDeleteAny) {
        return res.status(403).json({
            error: 'Insufficient permissions to delete this order'
        });
    }

    // Business rule checks
    if (orderToDelete.durum === 'teslim_edildi') {
        return res.status(400).json({
            error: 'Cannot delete delivered orders'
        });
    }

    if (orderToDelete.odemeler && orderToDelete.odemeler.length > 0) {
        const totalPaid = orderToDelete.odemeler.reduce((sum, payment) => sum + payment.miktar, 0);
        if (totalPaid > 0) {
            return res.status(400).json({
                error: 'Cannot delete orders with payments. Cancel payments first.'
            });
        }
    }

    // Soft delete with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Mark order as cancelled instead of hard delete
        const cancelledOrder = await tx.secureQuery('siparisFormu', 'update', {
            where: { id: orderId },
            data: {
                durum: 'iptal',
                iptalTarihi: new Date(),
                iptalEdenKullanici: req.user.userId,
                iptalSebebi: 'Sipariş silindi (yönetici işlemi)'
            }
        }, 'ORDER_CANCELLED');

        // Release any stock reservations
        await tx.secureQuery('stokHareket', 'updateMany', {
            where: {
                referansId: orderId,
                referansTip: 'SIPARIS',
                hareketTipi: 'REZERVE'
            },
            data: {
                hareketTipi: 'REZERVE_IPTAL',
                aciklama: 'Sipariş iptali - rezervasyon iptal edildi'
            }
        }, 'STOCK_RESERVATION_CANCELLED');

        return cancelledOrder;
    });

    auditLog('ORDER_DELETED', 'Order deleted (soft delete)', {
        userId: req.user.userId,
        orderId,
        orderNumber: orderToDelete.sipariNo,
        customerName: orderToDelete.musteriAd,
        orderAmount: orderToDelete.toplamTutar,
        isOwnerDelete: isOwner
    });

    return res.status(200).json({
        success: true,
        message: 'Order cancelled successfully'
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(orderDetailHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_ORDERS, // Base permission, individual operations check higher permissions

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_ORDERS
        // PUT: UPDATE_ORDERS (with role-based restrictions)
        // DELETE: DELETE_ORDERS (with ownership/admin checks)

        // Input Validation Configuration
        allowedFields: [
            'durum', 'odemeDurumu', 'musteriAd', 'musteriTelefon', 'musteriEmail',
            'musteriAdres', 'musteriSehir', 'teslimatTarihi', 'teslimatSaati',
            'aciklama', 'ozelTalepler', 'kalemler', 'indirimTutari', 'indirimSebebi'
        ],

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true
    }
);
