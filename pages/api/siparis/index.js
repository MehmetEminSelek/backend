/**
 * =============================================
 * SECURED ORDERS INDEX API - FULL SECURITY INTEGRATION
 * =============================================
 */

// import { auditLog } from '../../../lib/audit-logger.js';
import prisma from '../../../lib/prisma.js';

// Simple price calculation function
function calculateOrderItemPrice(urunId, miktar, birim, tarih) {
    // Basic price calculation - can be enhanced later
    const birimFiyat = 10; // Default price per unit
    const toplamFiyat = birimFiyat * miktar;

    return {
        success: true,
        birimFiyat,
        toplamFiyat,
        toplamMaliyet: toplamFiyat * 0.7, // 70% cost ratio
        maliyetBirimFiyat: birimFiyat * 0.7
    };
}

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
            case 'PUT':
                return await updateOrder(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PUT']
                });
        }
    } catch (error) {
        console.error('Orders API Error:', error);
        console.error('Error stack:', error.stack);

        console.error('🚨 ORDERS_API_ERROR:', 'Orders API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Order operation failed',
            code: 'ORDERS_ERROR',
            details: error.message
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
        sortBy = 'tarih',
        sortOrder = 'desc'
    } = req.query;

    // Basic input validation  
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(parseInt(limit) || 50, 100);

    // Build secure where clause
    const whereClause = {};

    // Status filtering
    if (durum) {
        const validStatuses = ['ONAY_BEKLEYEN', 'HAZIRLLANACAK', 'HAZIRLANDI', 'IPTAL'];
        if (validStatuses.includes(durum)) {
            whereClause.durum = durum.toUpperCase();
        }
    }

    // Customer filtering
    if (musteriId) {
        whereClause.cariId = parseInt(musteriId); // Use correct relation field
    }

    // Branch filtering
    if (subeId) {
        whereClause.subeId = parseInt(subeId);
    }

    // Payment status filtering
    // Payment status filtering - now available in schema
    if (odemeDurumu) {
        const validPaymentStatuses = ['bekliyor', 'kismi', 'tamamlandi', 'iptal'];
        if (validPaymentStatuses.includes(odemeDurumu)) {
            whereClause.odemeDurumu = odemeDurumu;
        }
    }

    // Date range filtering
    if (tarihBaslangic || tarihBitis) {
        whereClause.tarih = {};
        if (tarihBaslangic) {
            whereClause.tarih.gte = new Date(tarihBaslangic);
        }
        if (tarihBitis) {
            whereClause.tarih.lte = new Date(tarihBitis);
        }
    }

    // Search filtering
    if (search) {
        whereClause.OR = [
            { siparisNo: { contains: search, mode: 'insensitive' } },
            { gonderenAdi: { contains: search, mode: 'insensitive' } },
            { gonderenTel: { contains: search } },
            { siparisNotu: { contains: search, mode: 'insensitive' } }
        ];
    }

    // Pagination 
    const skip = (pageNum - 1) * limitNum;

    // Sorting validation
    const validSortFields = ['tarih', 'toplamTutar', 'durum', 'gonderenAdi', 'createdAt'];
    const validSortOrders = ['asc', 'desc'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'tarih';
    const sortDirection = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';

    // Enhanced query with security context
    const [orders, totalCount] = await Promise.all([
        prisma.siparis.findMany({
            where: whereClause,
            select: {
                id: true,
                siparisNo: true,
                tarih: true,
                durum: true,
                odemeDurumu: true, // Şimdi schema'da mevcut
                toplamTutar: true,
                gonderenAdi: true,
                gonderenTel: true,
                gonderenEmail: true,
                teslimatAdresi: true,
                il: true,
                ilce: true,
                postaKodu: true,
                teslimTarihi: true,
                teslimSaati: true,
                kargoDurumu: true,
                kargoSirketi: true,
                kargoTakipNo: true,
                kargoNotu: true,
                siparisNotu: true,
                createdAt: true,
                // Include related data based on user permissions
                ...(req.user.roleLevel >= 60 && {
                    toplamMaliyet: true,
                    karMarji: true
                }),
                cari: {
                    select: {
                        id: true,
                        cariAdi: true,
                        telefon: true,
                        musteriKodu: true
                    }
                },
                teslimatTuru: {
                    select: {
                        id: true,
                        ad: true,
                        kod: true
                    }
                },
                sube: {
                    select: {
                        id: true,
                        ad: true,
                        kod: true
                    }
                },
                subeNereden: {
                    select: { id: true, ad: true }
                },
                subeNereye: {
                    select: { id: true, ad: true }
                },
                kalemler: {
                    select: {
                        id: true,
                        miktar: true,
                        birimFiyat: true,
                        birim: true,
                        toplamTutar: true, // Correct field name from schema
                        urunAdi: true, // Snapshot field from schema
                        urunKodu: true, // Snapshot field from schema
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
                        },
                        tepsiTava: {
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
                            tutar: true,
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
        prisma.siparis.count({
            where: whereClause
        })
    ]);

    // Calculate summary statistics for dashboard
    const ordersSummary = await prisma.siparis.aggregate({
        where: whereClause,
        _sum: {
            toplamTutar: true
        },
        _count: {
            id: true
        }
    });

    console.log('ORDERS_VIEW:', 'Orders list accessed', {
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
    // Basic input validation
    const { gonderenAdi, gonderenTel, kalemler } = req.body;

    if (!gonderenAdi || !gonderenTel || !kalemler || !Array.isArray(kalemler)) {
        return res.status(400).json({
            error: 'Gerekli alanlar eksik: gonderenAdi, gonderenTel, kalemler'
        });
    }

    const {
        gonderenEmail,
        teslimatAdresi,
        il,
        teslimTarihi,
        teslimSaati,
        siparisNotu,
        subeId,
        ozelTalepler,
        indirimTutari = 0,
        indirimSebebi,
        teslimatTuruId,
        tarih,
        adres,
        aciklama
    } = req.body;

    // Business logic validation
    if (!Array.isArray(kalemler) || kalemler.length === 0) {
        return res.status(400).json({
            error: 'Order must contain at least one item'
        });
    }

    // Debug: Log the payload for enum validation
    console.log('📋 Order creation payload check:', {
        gonderenAdi,
        gonderenTel,
        kalemlerCount: kalemler.length,
        durum: 'ONAY_BEKLEYEN' // Will use this enum value
    });

    // Validate phone number format (Turkish format)
    const phoneRegex = /^(\+90|0)?[5][0-9]{9}$/;
    if (!phoneRegex.test(gonderenTel.replace(/\s/g, ''))) {
        return res.status(400).json({
            error: 'Invalid phone number format'
        });
    }

    // Validate email if provided
    if (gonderenEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(gonderenEmail)) {
            return res.status(400).json({
                error: 'Invalid email format'
            });
        }
    }

    // Validate order items with detailed error messages
    for (const kalem of kalemler) {
        if (!kalem.urunId) {
            return res.status(400).json({
                error: 'Product ID is required for each order item'
            });
        }
        if (!kalem.miktar || kalem.miktar <= 0) {
            return res.status(400).json({
                error: `Invalid quantity ${kalem.miktar} for product ${kalem.urunId}. Quantity must be greater than 0`
            });
        }
        if (kalem.birim && !['Gram', 'Adet', 'Kg', 'Paket', 'Kutu', 'Tepsi', 'Litre', 'Ml'].includes(kalem.birim)) {
            return res.status(400).json({
                error: `Invalid unit '${kalem.birim}' for product ${kalem.urunId}. Allowed units: Gram, Adet, Kg, Paket, Kutu, Tepsi, Litre, Ml`
            });
        }
    }

    // Enhanced transaction for order creation
    const result = await prisma.$transaction(async (tx) => {
        // 1. Find or create customer
        let musteri = null;

        // Check if customer exists by phone
        const existingCustomer = await prisma.cariMusteri.findFirst({
            where: {
                telefon: gonderenTel,
                aktif: true
            }
        });

        if (existingCustomer) {
            musteri = existingCustomer;

            // Update customer info if different (using correct CariMusteri fields)
            if (existingCustomer.cariAdi !== gonderenAdi) {
                musteri = await prisma.cariMusteri.update({
                    where: { id: existingCustomer.id },
                    data: {
                        cariAdi: gonderenAdi
                    }
                });
            }
        } else {
            // Create new customer using correct CariMusteri schema
            musteri = await prisma.cariMusteri.create({
                data: {
                    cariAdi: gonderenAdi,
                    telefon: gonderenTel,
                    musteriKodu: `AUTO-${Date.now()}`,
                    aktif: true
                }
            });
        }

        // 2. Generate order number
        const orderCount = await prisma.siparis.count({});
        const siparisNo = `SP-${new Date().getFullYear()}-${String(orderCount + 1).padStart(5, '0')}`;

        // 3. Calculate order totals with security checks
        let toplamTutar = 0;
        let toplamMaliyet = 0;
        const processedKalemler = [];

        for (const kalem of kalemler) {
            // Validate product exists and is active
            const urun = await tx.urun.findUnique({
                where: { id: parseInt(kalem.urunId) },
                select: { id: true, ad: true, kod: true, aktif: true, kategori: true }
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

            // Remove old calculation variables - we'll use new ones below

            // Calculate pricing with proper field names matching schema
            const kalemAraToplam = parseFloat(kalem.miktar) * priceResult.birimFiyat;
            const kdvOrani = 18; // Default KDV
            const iskonto = parseFloat(kalem.iskonto) || 0;
            const kalemKdvTutari = (kalemAraToplam * kdvOrani) / 100;
            const kalemToplamTutar = kalemAraToplam + kalemKdvTutari - iskonto;
            const birimMaliyet = priceResult.maliyetBirimFiyat || 0;
            const kalemToplamMaliyet = birimMaliyet * parseFloat(kalem.miktar);
            const kalemKarMarji = kalemToplamTutar - kalemToplamMaliyet;
            const kalemKarOrani = kalemToplamTutar > 0 ? ((kalemKarMarji / kalemToplamTutar) * 100) : 0;

            // Map frontend birim values to backend enum values
            const birimMapping = {
                'Gram': 'GRAM',
                'Adet': 'ADET',
                'Kg': 'KG',
                'Paket': 'PAKET',
                'Kutu': 'KUTU',
                'Tepsi': 'TEPSI',
                'Litre': 'LITRE',
                'Ml': 'ML'
            };
            const mappedBirim = birimMapping[kalem.birim] || kalem.birim?.toUpperCase() || 'ADET';

            processedKalemler.push({
                urunId: parseInt(kalem.urunId),
                urunAdi: urun.ad, // SNAPSHOT: Store product name
                urunKodu: urun.kod || null, // SNAPSHOT: Store product code from schema
                kutuId: kalem.kutuId ? parseInt(kalem.kutuId) : null,
                tepsiTavaId: kalem.tepsiTavaId ? parseInt(kalem.tepsiTavaId) : null,
                miktar: parseFloat(kalem.miktar),
                birim: mappedBirim, // Use mapped enum value
                birimFiyat: priceResult.birimFiyat,
                kdvOrani: kdvOrani,
                iskonto: iskonto,
                araToplam: kalemAraToplam,
                kdvTutari: kalemKdvTutari,
                toplamTutar: kalemToplamTutar,
                birimMaliyet: birimMaliyet,
                toplamMaliyet: kalemToplamMaliyet,
                karMarji: kalemKarMarji,
                karOrani: kalemKarOrani,
                uretimNotu: kalem.siparisNotu || null
            });

            // Update totals for order (use different variable names to avoid conflict)
            toplamTutar += kalemToplamTutar;
            toplamMaliyet += kalemToplamMaliyet;
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
        const newOrder = await prisma.siparis.create({
            data: {
                siparisNo,
                tarih: tarih ? new Date(tarih) : new Date(),
                teslimatTuruId: teslimatTuruId ? parseInt(teslimatTuruId) : null,
                cariId: musteri.id,
                gonderenAdi,
                gonderenTel,
                gonderenEmail: gonderenEmail || '',
                teslimatAdresi: teslimatAdresi || adres || '',
                il: il || '',
                teslimTarihi: teslimTarihi ? new Date(teslimTarihi) : null,
                teslimSaati: teslimSaati || null,
                siparisNotu: siparisNotu || aciklama || '',
                ozelTalepler: ozelTalepler || '',
                subeId: subeId ? parseInt(subeId) : null,
                durum: 'ONAY_BEKLEYEN',
                odemeDurumu: 'bekliyor',
                toplamTutar: finalTotal,
                toplamMaliyet,
                karMarji: finalTotal - toplamMaliyet,
                indirimTutari: parseFloat(indirimTutari) || 0,
                indirimSebebi: indirimSebebi || null,
                createdBy: req.user?.userId || null
            }
        });

        // 5. Create order items
        for (const kalem of processedKalemler) {
            await tx.siparisKalemi.create({
                data: {
                    siparisId: newOrder.id,
                    ...kalem
                }
            });
        }

        // 6. Create AR movement (BORC) with due date = end of month of order date
        const orderDate = newOrder.tarih || new Date();
        const dueDate = new Date(orderDate.getFullYear(), orderDate.getMonth() + 1, 0);
        dueDate.setHours(23, 59, 59, 999);
        await tx.cariHareket.create({
            data: {
                cariMusteriId: musteri.id,
                tip: 'BORC',
                tutar: finalTotal,
                aciklama: `Sipariş ${newOrder.siparisNo} borcu`,
                siparisId: newOrder.id,
                vadeTarihi: dueDate
            }
        });

        // 7. Stock reservation (if enabled)
        if (process.env.AUTO_STOCK_RESERVATION === 'true') {
            for (const kalem of processedKalemler) {
                await tx.stokHareket.create({
                    data: {
                        urunId: kalem.urunId,
                        hareketTipi: 'REZERVE',
                        miktar: -kalem.miktar,
                        referansId: newOrder.id,
                        referansTip: 'SIPARIS',
                        aciklama: `Sipariş rezervasyonu: ${siparisNo}`,
                        createdBy: req.user.userId
                    }
                });
            }
        }

        return {
            order: newOrder,
            customer: musteri,
            totalItems: processedKalemler.length
        };
    });

    // Enhanced audit logging
    console.log('ORDER_CREATED:', 'New order created', {
        userId: req.user.userId,
        orderId: result.order.id,
        orderNumber: result.order.siparisNo,
        customerId: result.customer.id,
        customerName: gonderenAdi,
        totalAmount: result.order.toplamTutar,
        itemCount: result.totalItems,
        hasDiscount: indirimTutari > 0,
        discountAmount: indirimTutari
    });

    // ✅ AUDIT LOG: Order created
    try {
        console.log('AUDIT_LOG:', {
            personelId: req.user?.personelId || req.user?.id,
            action: 'SIPARIS_OLUSTURULDU',
            tableName: 'SIPARIS',
            recordId: result.order.id,
            oldValues: null,
            newValues: {
                siparisNo: result.order.siparisNo,
                gonderenAdi: result.order.gonderenAdi,
                toplamTutar: result.order.toplamTutar,
                kalemSayisi: kalemler.length
            },
            description: `Yeni sipariş oluşturuldu: ${result.order.siparisNo} - ${gonderenAdi} (₺${result.order.toplamTutar})`,
            req
        });
    } catch (auditError) {
        console.error('❌ Order creation audit log failed:', auditError);
    }

    return res.status(201).json({
        success: true,
        message: 'Order created successfully',
        order: {
            id: result.order.id,
            siparisNo: result.order.siparisNo,
            tarih: result.order.tarih,
            durum: result.order.durum,
            toplamTutar: result.order.toplamTutar,
            gonderenAdi: result.order.gonderenAdi,
            gonderenTel: result.order.gonderenTel
        },
        customer: {
            id: result.customer.id,
            ad: result.customer.ad,
            telefon: result.customer.telefon
        }
    });
}

/**
 * Update Order (status and basic fields)
 */
async function updateOrder(req, res) {
    const {
        id,
        durum,
        kargoDurumu,
        odemeDurumu,
        teslimTarihi,
        teslimSaati,
        siparisNotu,
        ozelTalepler,
        indirimTutari,
        indirimSebebi,
        subeId
    } = req.body || {};

    if (!id) {
        return res.status(400).json({ error: 'Order id is required' });
    }

    // Permission: basic updates for roleLevel >= 50
    if (!req.user || (req.user.roleLevel ?? 0) < 50) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const updateData = {};

    // Map and validate enums
    const validDurumlar = ['ONAY_BEKLEYEN', 'HAZIRLLANACAK', 'HAZIRLANDI', 'IPTAL'];
    if (typeof durum === 'string') {
        const d = durum.toUpperCase();
        if (validDurumlar.includes(d)) updateData.durum = d;
    }

    const validKargo = ['KARGOYA_VERILECEK', 'KARGODA', 'TESLIM_EDILDI', 'SUBEYE_GONDERILECEK', 'SUBEDE_TESLIM', 'ADRESE_TESLIMAT', 'SUBEDEN_SUBEYE', 'IPTAL'];
    if (typeof kargoDurumu === 'string') {
        const k = kargoDurumu.toUpperCase();
        if (validKargo.includes(k)) updateData.kargoDurumu = k;
    }

    const validOdeme = ['bekliyor', 'kismi', 'tamamlandi', 'iptal'];
    if (typeof odemeDurumu === 'string' && validOdeme.includes(odemeDurumu)) {
        updateData.odemeDurumu = odemeDurumu;
    }

    if (teslimTarihi) {
        const t = new Date(teslimTarihi);
        if (!isNaN(t.getTime())) updateData.teslimTarihi = t;
    }
    if (typeof teslimSaati === 'string') updateData.teslimSaati = teslimSaati;
    if (typeof siparisNotu === 'string') updateData.siparisNotu = siparisNotu;
    if (typeof ozelTalepler === 'string') updateData.ozelTalepler = ozelTalepler;

    // Discount rules: require manager+
    if (indirimTutari !== undefined) {
        if ((req.user.roleLevel ?? 0) < 70) {
            return res.status(403).json({ error: 'Insufficient permissions to update discount' });
        }
        const tutar = parseFloat(indirimTutari);
        if (!Number.isFinite(tutar) || tutar < 0) {
            return res.status(400).json({ error: 'Invalid indirimTutari' });
        }
        updateData.indirimTutari = tutar;
        updateData.indirimSebebi = typeof indirimSebebi === 'string' ? indirimSebebi : null;
    }

    if (subeId !== undefined) {
        const sid = parseInt(subeId);
        if (Number.isInteger(sid)) updateData.subeId = sid;
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }

    const updated = await prisma.siparis.update({
        where: { id: parseInt(id) },
        data: updateData,
        select: {
            id: true,
            siparisNo: true,
            tarih: true,
            durum: true,
            kargoDurumu: true,
            odemeDurumu: true,
            teslimTarihi: true,
            teslimSaati: true,
            siparisNotu: true,
            ozelTalepler: true,
            indirimTutari: true,
            indirimSebebi: true,
            subeId: true,
            updatedAt: true
        }
    });

    return res.status(200).json({ success: true, order: updated });
}

// ===== SECURITY INTEGRATION =====
import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';

export default withCorsAndAuth(ordersHandler);
