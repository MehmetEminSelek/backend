/**
 * CariMusteri API - SIMPLIFIED
 */

import prisma from '../../../lib/prisma.js';
import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';

// Simple in-memory cache with TTL
const responseCache = new Map();
function cacheKeyFromQuery(query) {
    // Only include keys that affect data
    const { page = 1, limit = 100, search = '', aktif = undefined, all = 'false', sortBy = '', sortDir = 'asc' } = query || {};
    return JSON.stringify({ page: Number(page) || 1, limit: Number(limit) || 100, search, aktif, all, sortBy, sortDir });
}
function getCached(key) {
    const entry = responseCache.get(key);
    if (!entry) return null;
    const ttlLeft = entry.expiresAt - Date.now();
    if (ttlLeft <= 0) {
        responseCache.delete(key);
        return null;
    }
    return { value: entry.value, ttlLeft };
}
function setCached(key, value, ttlMs = 30_000) {
    responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export default withCorsAndAuth(async function handler(req, res) {

    console.log(`🔍 CARI API: ${req.method} request received`);

    try {
        switch (req.method) {
            case 'GET':
                return await getCustomers(req, res);
            case 'POST':
                return await createCustomer(req, res);
            case 'PUT':
                return await updateCustomer(req, res);
            case 'DELETE':
                return await deleteCustomer(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PUT', 'DELETE']
                });
        }
    } catch (error) {
        console.error('❌ Cari API Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            code: 'CARI_ERROR',
            details: error.message
        });
    }
});

/**
 * Get Customers
 */
async function getCustomers(req, res) {
    const {
        page = 1,
        limit = 100,
        search,
        aktif,
        all,
        sortBy = 'cariAdi',
        sortDir = 'asc'
    } = req.query;

    console.log('🔍 GET Customers - params:', { page, limit, search, aktif });

    // Basic pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const whereClause = {};

    // Active status filtering
    if (aktif !== undefined) {
        whereClause.aktif = aktif === 'true';
    }

    // Search filtering using correct CariMusteri fields
    if (search) {
        whereClause.OR = [
            { cariAdi: { contains: search, mode: 'insensitive' } },
            { musteriKodu: { contains: search, mode: 'insensitive' } },
            { telefon: { contains: search } },
            { irtibatAdi: { contains: search, mode: 'insensitive' } }
        ];
    }

    try {
        // Cache lookup
        const key = cacheKeyFromQuery(req.query);
        const cached = getCached(key);
        if (cached) {
            return res.status(200).json(cached);
        }
        // Base filters without explicit aktif flag for summary counts
        const { aktif: _aktifFlag, ...restFilters } = whereClause;

        let customersRaw = [];
        let totalCount = 0;
        let activeCount = 0;
        let allIds = [];

        const isBalanceSort = String(sortBy).toLowerCase() === 'bakiye';
        if (isBalanceSort) {
            // Use a single SQL to compute balances and order by balance
            const dir = String(sortDir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
            const params = [];
            const cond = [];
            if (aktif !== undefined) {
                params.push(aktif === 'true');
                cond.push(`AND c.aktif = $${params.length}`);
            }
            if (search) {
                params.push(`%${search}%`);
                const idx = params.length;
                cond.push(`AND (c."cariAdi" ILIKE $${idx} OR c."musteriKodu" ILIKE $${idx} OR c.telefon ILIKE $${idx} OR c."irtibatAdi" ILIKE $${idx})`);
            }
            if (all !== 'true') {
                params.push(skip);
                params.push(limitNum);
            }
            const raw = await prisma.$queryRawUnsafe(
                `
                WITH filtered AS (
                  SELECT c.id, c."cariAdi", c."musteriKodu", c.telefon, c."irtibatAdi", c."subeAdi", c.aktif
                  FROM "CariMusteri" c
                  WHERE 1=1
                  ${cond.join('\n')}
                ),
                order_sum AS (
                  SELECT s."cariId" AS id, COALESCE(SUM(s."toplamTutar"),0) AS toplam
                  FROM "Siparis" s
                  WHERE s.durum <> 'IPTAL'
                  GROUP BY s."cariId"
                ),
                payment_sum AS (
                  SELECT p."cariMusteriId" AS id, COALESCE(SUM(p.tutar),0) AS toplam
                  FROM "CariOdeme" p
                  WHERE p.durum <> 'IPTAL'
                  GROUP BY p."cariMusteriId"
                )
                SELECT f.id, f."cariAdi", f."musteriKodu", f.telefon, f."irtibatAdi", f."subeAdi", f.aktif,
                       COALESCE(o.toplam,0) - COALESCE(pm.toplam,0) AS bakiye
                FROM filtered f
                LEFT JOIN order_sum o ON o.id = f.id
                LEFT JOIN payment_sum pm ON pm.id = f.id
                ORDER BY bakiye ${dir}
                ${all === 'true' ? '' : `OFFSET $${params.length - 1} LIMIT $${params.length}`}
                `,
                ...params
            );
            // Type cast
            customersRaw = raw.map(r => ({
                id: r.id,
                cariAdi: r.cariAdi,
                musteriKodu: r.musteriKodu,
                telefon: r.telefon,
                irtibatAdi: r.irtibatAdi,
                subeAdi: r.subeAdi,
                aktif: r.aktif,
                bakiye: Number(r.bakiye) || 0
            }));
            [totalCount, activeCount, allIds] = await Promise.all([
                prisma.cariMusteri.count({ where: whereClause }),
                prisma.cariMusteri.count({ where: { ...restFilters, aktif: true } }),
                prisma.cariMusteri.findMany({ where: whereClause, select: { id: true } })
            ]);
        } else {
            // Default path: sort by a basic field via Prisma
            const prismaOrder = ['cariAdi', 'musteriKodu', 'telefon', 'irtibatAdi', 'createdAt', 'updatedAt'].includes(sortBy) ? { [sortBy]: sortDir === 'desc' ? 'desc' : 'asc' } : { cariAdi: 'asc' };
            [customersRaw, totalCount, activeCount, allIds] = await Promise.all([
                prisma.cariMusteri.findMany({
                    where: whereClause,
                    select: {
                        id: true,
                        cariAdi: true,
                        musteriKodu: true,
                        telefon: true,
                        irtibatAdi: true,
                        subeAdi: true,
                        cariGrubu: true,
                        fiyatGrubu: true,
                        aktif: true,
                        createdAt: true,
                        updatedAt: true
                    },
                    orderBy: prismaOrder,
                    ...(all === 'true' ? {} : { skip, take: limitNum })
                }),
                prisma.cariMusteri.count({ where: whereClause }),
                prisma.cariMusteri.count({ where: { ...restFilters, aktif: true } }),
                prisma.cariMusteri.findMany({ where: whereClause, select: { id: true } })
            ]);
        }

        // Compute balances from Siparis and CariOdeme
        const customerIds = customersRaw.map(c => c.id);
        const [ordersAgg, paymentsAgg, openOrders] = customerIds.length > 0 ? await Promise.all([
            prisma.siparis.groupBy({
                by: ['cariId'],
                where: { cariId: { in: customerIds }, durum: { not: 'IPTAL' } },
                _sum: { toplamTutar: true }
            }),
            prisma.cariOdeme.groupBy({
                by: ['cariMusteriId'],
                where: { cariMusteriId: { in: customerIds }, durum: { not: 'IPTAL' } },
                _sum: { tutar: true }
            }),
            prisma.siparis.findMany({
                where: {
                    cariId: { in: customerIds },
                    durum: { not: 'IPTAL' },
                    odemeDurumu: { not: 'tamamlandi' }
                },
                select: { cariId: true, tarih: true }
            })
        ]) : [[], [], []];

        const cariIdToOrderSum = new Map(ordersAgg.map(o => [o.cariId, Number(o._sum.toplamTutar) || 0]));
        const cariIdToPaymentSum = new Map(paymentsAgg.map(p => [p.cariMusteriId, Number(p._sum.tutar) || 0]));

        // Compute nearest due date per customer: end-of-month of order date for unpaid orders
        function endOfMonth(d) {
            const dt = new Date(d);
            const due = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
            due.setHours(23, 59, 59, 999);
            return due;
        }
        const cariIdToDue = new Map();
        for (const o of openOrders) {
            const due = endOfMonth(o.tarih);
            const prev = cariIdToDue.get(o.cariId);
            if (!prev || due < prev) cariIdToDue.set(o.cariId, due);
        }

        // Adapt fields for frontend expectations (ad vs cariAdi, defaults)
        const customers = customersRaw.map(c => ({
            ...c,
            ad: c.cariAdi,
            email: c.email || null,
            bakiye: typeof c.bakiye === 'number' ? c.bakiye : (cariIdToOrderSum.get(c.id) || 0) - (cariIdToPaymentSum.get(c.id) || 0),
            adresler: Array.isArray(c.adresler) ? c.adresler : [],
            enYakinVade: cariIdToDue.get(c.id) ? cariIdToDue.get(c.id).toISOString() : null
        }));

        // Global financial summary across ALL matched customers (not just current page)
        const allCariIds = allIds.map(x => x.id);
        let summaryFinancial = { totalReceivable: 0, totalPayments: 0, totalBalance: 0 };
        let overdueCount = 0;
        if (allCariIds.length > 0) {
            const [allOrdersAgg, allPaymentsAgg] = await Promise.all([
                prisma.siparis.aggregate({
                    where: { cariId: { in: allCariIds }, durum: { not: 'IPTAL' } },
                    _sum: { toplamTutar: true }
                }),
                prisma.cariOdeme.aggregate({
                    where: { cariMusteriId: { in: allCariIds }, durum: { not: 'IPTAL' } },
                    _sum: { tutar: true }
                })
            ]);
            const totalReceivable = Number(allOrdersAgg._sum.toplamTutar) || 0;
            const totalPayments = Number(allPaymentsAgg._sum.tutar) || 0;
            summaryFinancial = {
                totalReceivable,
                totalPayments,
                totalBalance: totalReceivable - totalPayments
            };

            // Overdue: customers with a due date in the past and positive balance
            const allOrderSumsById = await prisma.siparis.groupBy({
                by: ['cariId'],
                where: { cariId: { in: allCariIds }, durum: { not: 'IPTAL' } },
                _sum: { toplamTutar: true }
            });
            const allPaymentSumsById = await prisma.cariOdeme.groupBy({
                by: ['cariMusteriId'],
                where: { cariMusteriId: { in: allCariIds }, durum: { not: 'IPTAL' } },
                _sum: { tutar: true }
            });
            const mapOrder = new Map(allOrderSumsById.map(o => [o.cariId, Number(o._sum.toplamTutar) || 0]));
            const mapPay = new Map(allPaymentSumsById.map(p => [p.cariMusteriId, Number(p._sum.tutar) || 0]));
            const now = new Date();
            const dueIds = new Set();
            for (const [cid, due] of cariIdToDue.entries()) {
                const bal = (mapOrder.get(cid) || 0) - (mapPay.get(cid) || 0);
                if (due < now && bal > 0) dueIds.add(cid);
            }
            overdueCount = dueIds.size;
        }

        console.log(`✅ ${customers.length} cari bulundu (toplam: ${totalCount})`, summaryFinancial);

        const payload = {
            success: true,
            customers,
            cariler: customers,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                pages: Math.ceil(totalCount / limitNum)
            },
            summary: {
                total: totalCount,
                totalActive: activeCount,
                totalInactive: Math.max(totalCount - activeCount, 0),
                overdueCount
            },
            summaryFinancial
        };
        setCached(key, payload);
        return res.status(200).json(payload);

    } catch (error) {
        console.error('❌ Error fetching customers:', error);
        return res.status(500).json({
            error: 'Failed to fetch customers',
            details: error.message
        });
    }
}

/**
 * Create Customer
 */
async function createCustomer(req, res) {
    console.log('🔍 POST Create Customer:', req.body);

    const {
        cariAdi,
        musteriKodu,
        telefon,
        irtibatAdi,
        subeAdi,
        cariGrubu,
        fiyatGrubu
    } = req.body;

    // Basic validation
    if (!cariAdi || !musteriKodu) {
        return res.status(400).json({
            error: 'cariAdi and musteriKodu are required'
        });
    }

    try {
        const newCustomer = await prisma.cariMusteri.create({
            data: {
                cariAdi,
                musteriKodu,
                telefon: telefon || null,
                irtibatAdi: irtibatAdi || null,
                subeAdi: subeAdi || null,
                cariGrubu: cariGrubu || null,
                fiyatGrubu: fiyatGrubu || null,
                aktif: true
            }
        });

        console.log(`✅ Customer created: ${newCustomer.id}`);

        return res.status(201).json({
            success: true,
            message: 'Customer created successfully',
            customer: newCustomer
        });

    } catch (error) {
        console.error('❌ Error creating customer:', error);
        return res.status(500).json({
            error: 'Failed to create customer',
            details: error.message
        });
    }
}

/**
 * Update Customer
 */
async function updateCustomer(req, res) {
    console.log('🔍 PUT Update Customer:', req.body);

    const { id, ...rawUpdate } = req.body;

    if (!id) {
        return res.status(400).json({
            error: 'Customer ID is required'
        });
    }

    try {
        const customerId = parseInt(id);

        // Whitelist and map incoming fields to Prisma model fields
        const allowedFields = [
            'cariAdi',
            'musteriKodu',
            'telefon',
            'irtibatAdi',
            'subeAdi',
            'cariGrubu',
            'fiyatGrubu',
            'aktif'
        ];

        const updateData = {};

        // Map frontend "ad" to prisma "cariAdi"
        if (typeof rawUpdate.ad === 'string' && rawUpdate.ad.trim() !== '') {
            updateData.cariAdi = rawUpdate.ad.trim();
        }

        // Copy allowed fields only
        for (const key of allowedFields) {
            if (rawUpdate[key] !== undefined) {
                updateData[key] = rawUpdate[key];
            }
        }

        // Build nested address update if provided
        let adreslerMutation = undefined;
        if (Array.isArray(rawUpdate.adresler)) {
            const toCreate = rawUpdate.adresler
                .filter(a => a && typeof a.adres === 'string' && a.adres.trim() !== '')
                .map(a => ({
                    tip: String(a.tip || '').toUpperCase().startsWith('E') ? 'EV' : (String(a.tip || '').toUpperCase().startsWith('I') ? 'IS' : 'DIGER'),
                    adres: a.adres.trim(),
                    il: a.il || null,
                    ilce: a.ilce || null,
                    mahalle: a.mahalle || null,
                    postaKodu: a.postaKodu || null,
                    tarif: a.tarif || null,
                    varsayilan: Boolean(a.varsayilan),
                    aktif: a.aktif === false ? false : true
                }));

            adreslerMutation = {
                // Nested deleteMany without filter removes all children of this parent
                deleteMany: {},
                create: toCreate
            };
        }

        const updatedCustomer = await prisma.cariMusteri.update({
            where: { id: customerId },
            data: {
                ...updateData,
                ...(adreslerMutation ? { adresler: adreslerMutation } : {})
            }
        });

        console.log(`✅ Customer updated: ${updatedCustomer.id}`);

        // Invalidate simple cache after mutation
        try { responseCache.clear(); } catch { }

        return res.status(200).json({
            success: true,
            message: 'Customer updated successfully',
            customer: updatedCustomer
        });

    } catch (error) {
        console.error('❌ Error updating customer:', error);
        return res.status(500).json({
            error: 'Failed to update customer',
            details: error.message
        });
    }
}

/**
 * Delete Customer
 */
async function deleteCustomer(req, res) {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({
            error: 'Customer ID is required'
        });
    }

    try {
        await prisma.cariMusteri.delete({
            where: { id: parseInt(id) }
        });

        console.log(`✅ Customer deleted: ${id}`);

        return res.status(200).json({
            success: true,
            message: 'Customer deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting customer:', error);
        return res.status(500).json({
            error: 'Failed to delete customer',
            details: error.message
        });
    }
}