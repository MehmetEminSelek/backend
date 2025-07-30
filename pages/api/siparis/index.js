/**
 * =============================================
 * SECURED ORDERS INDEX API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../lib/audit-logger.js';
import { validateInput } from '../../../lib/validation.js';
import { calculateOrderItemPrice } from '../../../lib/fiyat.js';

/**
 * Orders API Handler with Full Security Integration
 */
async function ordersHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getOrders(req, res);
            case 'POST':
                return await createOrder(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST']
                });
        }
    } catch (error) {
        console.error('Orders API Error:', error);

        auditLog('ORDERS_API_ERROR', 'Orders API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Order operation failed',
            code: 'ORDERS_ERROR'
        });
    }
}

/**
 * Get Orders List with Advanced Filtering and Security
 */
async function getOrders(req, res) {
    const {
        page = 1,
        limit = 50,
        durum,
        musteriId,
        tarihBaslangic,
        tarihBitis,
        subeId,
        search,
        odemeDurumu,
        sortBy = 'siparisTarihi',
        sortOrder = 'desc'
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: [
            'page', 'limit', 'durum', 'musteriId', 'tarihBaslangic', 'tarihBitis',
            'subeId', 'search', 'odemeDurumu', 'sortBy', 'sortOrder'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid query parameters',
            details: validationResult.errors
        });
    }

    // Build secure where clause
    const whereClause = {};

    // Status filtering
    if (durum) {
        const validStatuses = ['beklemede', 'onaylandi', 'hazirlaniyor', 'hazir', 'kargoda', 'teslim_edildi', 'iptal'];
        if (validStatuses.includes(durum)) {
            whereClause.durum = durum;
        }
    }

    // Customer filtering
    if (musteriId) {
        whereClause.musteriId = parseInt(musteriId);
    }

    // Branch filtering
    if (subeId) {
        whereClause.subeId = parseInt(subeId);
    }

    // Payment status filtering
    if (odemeDurumu) {
        const validPaymentStatuses = ['bekliyor', 'kismi', 'tamamlandi'];
        if (validPaymentStatuses.includes(odemeDurumu)) {
            whereClause.odemeDurumu = odemeDurumu;
        }
    }

    // Date range filtering
    if (tarihBaslangic || tarihBitis) {
        whereClause.siparisTarihi = {};
        if (tarihBaslangic) {
            whereClause.siparisTarihi.gte = new Date(tarihBaslangic);
        }
        if (tarihBitis) {
            whereClause.siparisTarihi.lte = new Date(tarihBitis);
        }
    }

    // Search filtering
    if (search) {
        whereClause.OR = [
            { sipariNo: { contains: search, mode: 'insensitive' } },
            { musteriAd: { contains: search, mode: 'insensitive' } },
            { musteriTelefon: { contains: search } },
            { aciklama: { contains: search, mode: 'insensitive' } }
        ];
    }

    // Pagination and limits
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Sorting validation
    const validSortFields = ['siparisTarihi', 'toplamTutar', 'durum', 'musteriAd', 'olusturmaTarihi'];
    const validSortOrders = ['asc', 'desc'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'siparisTarihi';
    const sortDirection = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';

    // Enhanced query with security context
    const [orders, totalCount] = await Promise.all([
        req.prisma.secureQuery('siparisFormu', 'findMany', {
            where: whereClause,
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
                aciklama: true,
                olusturmaTarihi: true,
                // Include related data based on user permissions
                ...(req.user.roleLevel >= 60 && {
                    maliyetToplami: true,
                    karMarji: true
                }),
                musteri: {
                    select: {
                        id: true,
                        ad: true,
                        telefon: true,
                        email: true
                    }
                },
                sube: {
                    select: {
                        id: true,
                        ad: true,
                        kod: true
                    }
                },
                kalemler: {
                    select: {
                        id: true,
                        miktar: true,
                        birimFiyat: true,
                        toplamFiyat: true,
                        urun: {
                            select: {
                                id: true,
                                ad: true,
                                kod: true
                            }
                        },
                        kutu: {
                            select: {
                                id: true,
                                ad: true
                            }
                        }
                    }
                },
                // Payment info for higher roles
                ...(req.user.roleLevel >= 50 && {
                    odemeler: {
                        select: {
                            id: true,
                            miktar: true,
                            odemeTarihi: true,
                            odemeYontemi: true
                        }
                    }
                })
            },
            orderBy: {
                [sortField]: sortDirection
            },
            skip,
            take: limitNum
        }),
        req.prisma.secureQuery('siparisFormu', 'count', {
            where: whereClause
        })
    ]);

    // Calculate summary statistics for dashboard
    const ordersSummary = await req.prisma.secureQuery('siparisFormu', 'aggregate', {
        where: whereClause,
        _sum: {
            toplamTutar: true
        },
        _count: {
            id: true
        }
    });

    auditLog('ORDERS_VIEW', 'Orders list accessed', {
        userId: req.user.userId,
        totalOrders: totalCount,
        page: pageNum,
        limit: limitNum,
        filters: { durum, musteriId, subeId, search, odemeDurumu },
        userRole: req.user.rol
    });

    return res.status(200).json({
        success: true,
        orders,
        pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalCount / limitNum),
            totalItems: totalCount,
            itemsPerPage: limitNum
        },
        summary: {
            totalAmount: ordersSummary._sum.toplamTutar || 0,
            totalOrders: ordersSummary._count.id || 0
        }
    });
}

/**
 * Create New Order with Enhanced Security and Validation
 */
async function createOrder(req, res) {
    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['musteriAd', 'musteriTelefon', 'kalemler'],
        allowedFields: [
            'musteriAd', 'musteriTelefon', 'musteriEmail', 'musteriAdres', 'musteriSehir',
            'teslimatTarihi', 'teslimatSaati', 'aciklama', 'subeId', 'kalemler',
            'ozelTalepler', 'indirimTutari', 'indirimSebebi'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid order data',
            details: validationResult.errors
        });
    }

    const {
        musteriAd,
        musteriTelefon,
        musteriEmail,
        musteriAdres,
        musteriSehir,
        teslimatTarihi,
        teslimatSaati,
        aciklama,
        subeId,
        kalemler,
        ozelTalepler,
        indirimTutari = 0,
        indirimSebebi
    } = req.body;

    // Business logic validation
    if (!Array.isArray(kalemler) || kalemler.length === 0) {
        return res.status(400).json({
            error: 'Order must contain at least one item'
        });
    }

    // Validate phone number format (Turkish format)
    const phoneRegex = /^(\+90|0)?[5][0-9]{9}$/;
    if (!phoneRegex.test(musteriTelefon.replace(/\s/g, ''))) {
        return res.status(400).json({
            error: 'Invalid phone number format'
        });
    }

    // Validate email if provided
    if (musteriEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(musteriEmail)) {
            return res.status(400).json({
                error: 'Invalid email format'
            });
        }
    }

    // Validate order items
    for (const kalem of kalemler) {
        if (!kalem.urunId || !kalem.miktar || kalem.miktar <= 0) {
            return res.status(400).json({
                error: 'Each order item must have valid product ID and quantity'
            });
        }
    }

    // Enhanced transaction for order creation
    const result = await req.prisma.secureTransaction(async (tx) => {
        // 1. Find or create customer
        let musteri = null;

        // Check if customer exists by phone
        const existingCustomer = await tx.secureQuery('cariMusteri', 'findFirst', {
            where: {
                telefon: musteriTelefon,
                aktif: true
            }
        });

        if (existingCustomer) {
            musteri = existingCustomer;

            // Update customer info if different
            if (existingCustomer.ad !== musteriAd ||
                existingCustomer.email !== musteriEmail ||
                existingCustomer.adres !== musteriAdres) {

                musteri = await tx.secureQuery('cariMusteri', 'update', {
                    where: { id: existingCustomer.id },
                    data: {
                        ad: musteriAd,
                        email: musteriEmail || existingCustomer.email,
                        adres: musteriAdres || existingCustomer.adres,
                        sehir: musteriSehir || existingCustomer.sehir
                    }
                }, 'CUSTOMER_UPDATED');
            }
        } else {
            // Create new customer
            musteri = await tx.secureQuery('cariMusteri', 'create', {
                data: {
                    ad: musteriAd,
                    telefon: musteriTelefon,
                    email: musteriEmail || '',
                    adres: musteriAdres || '',
                    sehir: musteriSehir || '',
                    musteriKodu: `AUTO-${Date.now()}`,
                    tipi: 'MUSTERI',
                    aktif: true
                }
            }, 'CUSTOMER_CREATED');
        }

        // 2. Generate order number
        const orderCount = await tx.secureQuery('siparisFormu', 'count', {});
        const sipariNo = `SP-${new Date().getFullYear()}-${String(orderCount + 1).padStart(5, '0')}`;

        // 3. Calculate order totals with security checks
        let toplamTutar = 0;
        let maliyetToplami = 0;
        const processedKalemler = [];

        for (const kalem of kalemler) {
            // Validate product exists and is active
            const urun = await tx.secureQuery('urun', 'findUnique', {
                where: { id: parseInt(kalem.urunId) },
                select: { id: true, ad: true, aktif: true, kategori: true }
            });

            if (!urun || !urun.aktif) {
                throw new Error(`Product ${kalem.urunId} not found or inactive`);
            }

            // Calculate secure pricing
            const priceResult = await calculateOrderItemPrice(
                parseInt(kalem.urunId),
                parseFloat(kalem.miktar),
                kalem.birim || 'adet',
                new Date()
            );

            if (!priceResult.success) {
                throw new Error(`Price calculation failed for product ${kalem.urunId}`);
            }

            const kalemToplam = priceResult.toplamFiyat;
            const kalemMaliyet = priceResult.maliyetToplami || 0;

            toplamTutar += kalemToplam;
            maliyetToplami += kalemMaliyet;

            processedKalemler.push({
                urunId: parseInt(kalem.urunId),
                    kutuId: kalem.kutuId ? parseInt(kalem.kutuId) : null,
                    tepsiTavaId: kalem.tepsiTavaId ? parseInt(kalem.tepsiTavaId) : null,
                miktar: parseFloat(kalem.miktar),
                birim: kalem.birim || 'adet',
                birimFiyat: priceResult.birimFiyat,
                toplamFiyat: kalemToplam,
                maliyetBirimFiyat: priceResult.maliyetBirimFiyat || 0,
                maliyetToplam: kalemMaliyet,
                aciklama: kalem.aciklama || ''
            });
        }

        // Apply discount if provided and user has permission
        let finalTotal = toplamTutar;
        if (indirimTutari > 0) {
            if (req.user.roleLevel < 70) {
                throw new Error('Insufficient permissions to apply discounts');
            }

            if (indirimTutari > toplamTutar * 0.5) {
                throw new Error('Discount cannot exceed 50% of order total');
            }

            if (!indirimSebebi) {
                throw new Error('Discount reason is required');
            }

            finalTotal = toplamTutar - parseFloat(indirimTutari);
        }

        // 4. Create order
        const newOrder = await tx.secureQuery('siparisFormu', 'create', {
            data: {
                sipariNo,
                siparisTarihi: new Date(),
                musteriId: musteri.id,
                musteriAd,
                musteriTelefon,
                musteriEmail: musteriEmail || '',
                musteriAdres: musteriAdres || '',
                musteriSehir: musteriSehir || '',
                teslimatTarihi: teslimatTarihi ? new Date(teslimatTarihi) : null,
                teslimatSaati: teslimatSaati || null,
                aciklama: aciklama || '',
                ozelTalepler: ozelTalepler || '',
                subeId: subeId ? parseInt(subeId) : null,
                durum: 'beklemede',
                odemeDurumu: 'bekliyor',
                toplamTutar: finalTotal,
                maliyetToplami,
                karMarji: finalTotal - maliyetToplami,
                indirimTutari: parseFloat(indirimTutari) || 0,
                indirimSebebi: indirimSebebi || null,
                olusturanKullanici: req.user.userId
            }
        }, 'ORDER_CREATED');

        // 5. Create order items
        for (const kalem of processedKalemler) {
            await tx.secureQuery('siparisKalem', 'create', {
                data: {
                    siparisId: newOrder.id,
                    ...kalem
                }
            }, 'ORDER_ITEM_CREATED');
        }

        // 6. Stock reservation (if enabled)
        if (process.env.AUTO_STOCK_RESERVATION === 'true') {
            for (const kalem of processedKalemler) {
                await tx.secureQuery('stokHareket', 'create', {
                    data: {
                        urunId: kalem.urunId,
                        hareketTipi: 'REZERVE',
                        miktar: -kalem.miktar,
                        referansId: newOrder.id,
                        referansTip: 'SIPARIS',
                        aciklama: `Sipariş rezervasyonu: ${sipariNo}`,
                        olusturanKullanici: req.user.userId
                    }
                }, 'STOCK_RESERVED');
            }
        }

        return {
            order: newOrder,
            customer: musteri,
            totalItems: processedKalemler.length
        };
    });

    // Enhanced audit logging
    auditLog('ORDER_CREATED', 'New order created', {
        userId: req.user.userId,
        orderId: result.order.id,
        orderNumber: result.order.sipariNo,
        customerId: result.customer.id,
        customerName: musteriAd,
        totalAmount: result.order.toplamTutar,
        itemCount: result.totalItems,
        hasDiscount: indirimTutari > 0,
        discountAmount: indirimTutari
    });

    return res.status(201).json({
        success: true,
        message: 'Order created successfully',
        order: {
            id: result.order.id,
            sipariNo: result.order.sipariNo,
            siparisTarihi: result.order.siparisTarihi,
            durum: result.order.durum,
            toplamTutar: result.order.toplamTutar,
            musteriAd: result.order.musteriAd,
            musteriTelefon: result.order.musteriTelefon
        },
        customer: {
            id: result.customer.id,
            ad: result.customer.ad,
            telefon: result.customer.telefon
        }
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(ordersHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_ORDERS, // Base permission, individual operations check higher permissions

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_ORDERS
        // POST: CREATE_ORDERS

        // Input Validation Configuration
        allowedFields: [
            'musteriAd', 'musteriTelefon', 'musteriEmail', 'musteriAdres', 'musteriSehir',
            'teslimatTarihi', 'teslimatSaati', 'aciklama', 'subeId', 'kalemler',
            'ozelTalepler', 'indirimTutari', 'indirimSebebi',
            'page', 'limit', 'durum', 'musteriId', 'tarihBaslangic', 'tarihBitis',
            'search', 'odemeDurumu', 'sortBy', 'sortOrder'
        ],
        requiredFields: {
            POST: ['musteriAd', 'musteriTelefon', 'kalemler']
        },

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true
    }
);
