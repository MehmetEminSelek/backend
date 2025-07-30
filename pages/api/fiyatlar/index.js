/**
 * =============================================
 * SECURED PRICING API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../lib/audit-logger.js';
import { validateInput } from '../../../lib/validation.js';

/**
 * Pricing API Handler with Full Security Integration
 */
async function pricingHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getPricing(req, res);
            case 'POST':
                return await createPricing(req, res);
            case 'PUT':
                return await updatePricing(req, res);
            case 'DELETE':
                return await deletePricing(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PUT', 'DELETE']
                });
        }
    } catch (error) {
        console.error('Pricing API Error:', error);

        auditLog('PRICING_API_ERROR', 'Pricing API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Pricing operation failed',
            code: 'PRICING_ERROR'
        });
    }
}

/**
 * Get Pricing Data with Advanced Filtering and Security
 */
async function getPricing(req, res) {
    // Permission check - Pricing is sensitive financial data
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to view pricing data'
        });
    }

    const {
        page = 1,
        limit = 50,
        search,
        urunId,
        aktif,
        fiyatTipi,
        dateFrom,
        dateTo,
        sortBy = 'baslangicTarihi',
        sortOrder = 'desc'
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: [
            'page', 'limit', 'search', 'urunId', 'aktif', 'fiyatTipi',
            'dateFrom', 'dateTo', 'sortBy', 'sortOrder'
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

    // Product filtering
    if (urunId) {
        whereClause.urunId = parseInt(urunId);
    }

    // Status filtering
    if (aktif !== undefined) {
        whereClause.aktif = aktif === 'true';
    }

    // Price type filtering
    if (fiyatTipi) {
        whereClause.fiyatTipi = { contains: fiyatTipi, mode: 'insensitive' };
    }

    // Date range filtering
    if (dateFrom || dateTo) {
        whereClause.baslangicTarihi = {};
        if (dateFrom) {
            whereClause.baslangicTarihi.gte = new Date(dateFrom);
        }
        if (dateTo) {
            whereClause.baslangicTarihi.lte = new Date(dateTo);
        }
    }

    // Search filtering (product names/codes)
    if (search) {
        whereClause.urun = {
            OR: [
                { ad: { contains: search, mode: 'insensitive' } },
                { kod: { contains: search, mode: 'insensitive' } }
            ]
        };
    }

    // Pagination and limits
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Sorting validation
    const validSortFields = ['baslangicTarihi', 'bitisTarihi', 'kgFiyati', 'birimFiyat', 'fiyatTipi'];
    const validSortOrders = ['asc', 'desc'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'baslangicTarihi';
    const sortDirection = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';

    // Enhanced query with security context
    const [pricingList, totalCount] = await Promise.all([
        req.prisma.secureQuery('urunFiyat', 'findMany', {
            where: whereClause,
            select: {
                id: true,
                urunId: true,
                fiyatTipi: true,
                kgFiyati: true,
                birimFiyat: true,
                birim: true,
                aktif: true,
                baslangicTarihi: true,
                bitisTarihi: true,
                olusturmaTarihi: true,

                // Product information
                urun: {
                    select: {
                        id: true,
                        ad: true,
                        kod: true,
                        kategori: true,
                        birim: true
                    }
                },

                // Sensitive cost data only for managers+
                ...(req.user.roleLevel >= 70 && {
                    maliyetFiyati: true,
                    karMarji: true,
                    olusturanKullanici: true,
                    guncelleyenKullanici: true
                })
            },
            orderBy: {
                [sortField]: sortDirection
            },
            skip,
            take: limitNum
        }),
        req.prisma.secureQuery('urunFiyat', 'count', {
            where: whereClause
        })
    ]);

    // Calculate pricing statistics (only for higher roles)
    const pricingStats = req.user.roleLevel >= 70 ? await req.prisma.secureQuery('urunFiyat', 'aggregate', {
        where: { ...whereClause, aktif: true },
        _count: { id: true },
        _avg: {
            kgFiyati: true,
            birimFiyat: true,
            karMarji: true
        },
        _min: {
            kgFiyati: true,
            baslangicTarihi: true
        },
        _max: {
            kgFiyati: true,
            baslangicTarihi: true
        }
    }) : null;

    auditLog('PRICING_VIEW', 'Pricing data accessed', {
        userId: req.user.userId,
        totalPrices: totalCount,
        page: pageNum,
        limit: limitNum,
        filters: { search, urunId, aktif, fiyatTipi, dateFrom, dateTo },
        sensitiveAccess: req.user.roleLevel >= 70
        });

        return res.status(200).json({
        success: true,
        pricing: pricingList,
        pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalCount / limitNum),
            totalItems: totalCount,
            itemsPerPage: limitNum
        },
        ...(pricingStats && {
            statistics: {
                totalActivePrices: pricingStats._count.id,
                averageKgPrice: pricingStats._avg?.kgFiyati || 0,
                averageUnitPrice: pricingStats._avg?.birimFiyat || 0,
                averageMargin: pricingStats._avg?.karMarji || 0,
                priceRange: {
                    min: pricingStats._min?.kgFiyati || 0,
                    max: pricingStats._max?.kgFiyati || 0
                },
                dateRange: {
                    earliest: pricingStats._min?.baslangicTarihi,
                    latest: pricingStats._max?.baslangicTarihi
                }
            }
        })
    });
}

/**
 * Create New Pricing with Enhanced Security and Validation
 */
async function createPricing(req, res) {
    // Permission check - Only managers+ can create pricing
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to create pricing'
        });
    }

    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['urunId', 'fiyatTipi', 'kgFiyati', 'birimFiyat', 'birim'],
        allowedFields: [
            'urunId', 'fiyatTipi', 'kgFiyati', 'birimFiyat', 'birim',
            'maliyetFiyati', 'karMarji', 'baslangicTarihi', 'bitisTarihi',
            'aktif', 'aciklama'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid pricing data',
            details: validationResult.errors
        });
    }

    const {
        urunId, fiyatTipi, kgFiyati, birimFiyat, birim,
        maliyetFiyati, karMarji, baslangicTarihi, bitisTarihi,
        aktif = true, aciklama
    } = req.body;

    // Business logic validation
    if (kgFiyati <= 0 || birimFiyat <= 0) {
        return res.status(400).json({
            error: 'Prices must be positive'
        });
    }

    if (maliyetFiyati && maliyetFiyati < 0) {
        return res.status(400).json({
            error: 'Cost price cannot be negative'
        });
    }

    // Date validation
    const startDate = baslangicTarihi ? new Date(baslangicTarihi) : new Date();
    const endDate = bitisTarihi ? new Date(bitisTarihi) : null;

    if (endDate && startDate >= endDate) {
        return res.status(400).json({
            error: 'End date must be after start date'
        });
    }

    // Price type validation
    const validPriceTypes = ['SATIS', 'ALIS', 'TRANSFER', 'OZEL'];
    if (!validPriceTypes.includes(fiyatTipi.toUpperCase())) {
        return res.status(400).json({
            error: 'Invalid price type. Must be: ' + validPriceTypes.join(', ')
        });
    }

    // Enhanced transaction for pricing creation
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Verify product exists
        const product = await tx.secureQuery('urun', 'findUnique', {
            where: { id: parseInt(urunId) },
            select: {
                id: true,
                ad: true,
                kod: true,
                aktif: true
            }
        });

        if (!product) {
            throw new Error('Product not found');
        }

        if (!product.aktif) {
            throw new Error('Cannot create pricing for inactive products');
        }

        // Check for overlapping active prices
        const overlappingPrices = await tx.secureQuery('urunFiyat', 'findMany', {
                where: {
                    urunId: parseInt(urunId),
                fiyatTipi: fiyatTipi.toUpperCase(),
                    aktif: true,
                    OR: [
                    { bitisTarihi: null }, // Never expires
                    { bitisTarihi: { gte: startDate } } // Expires after our start date
                ]
            }
        });

        if (overlappingPrices.length > 0 && aktif) {
            throw new Error('Active price already exists for this product and price type in the date range');
        }

        // Calculate margin if not provided
        let calculatedMargin = karMarji;
        if (!calculatedMargin && maliyetFiyati && kgFiyati > 0) {
            calculatedMargin = ((kgFiyati - maliyetFiyati) / kgFiyati) * 100;
        }

        // Create pricing with audit trail
        const newPricing = await tx.secureQuery('urunFiyat', 'create', {
                        data: {
                urunId: parseInt(urunId),
                fiyatTipi: fiyatTipi.toUpperCase(),
                kgFiyati: parseFloat(kgFiyati),
                birimFiyat: parseFloat(birimFiyat),
                birim,
                maliyetFiyati: maliyetFiyati ? parseFloat(maliyetFiyati) : null,
                karMarji: calculatedMargin || 0,
                baslangicTarihi: startDate,
                bitisTarihi: endDate,
                aktif,
                aciklama: aciklama || '',
                olusturmaTarihi: new Date(),
                olusturanKullanici: req.user.userId
            },
            select: {
                id: true,
                urunId: true,
                fiyatTipi: true,
                kgFiyati: true,
                birimFiyat: true,
                birim: true,
                aktif: true,
                baslangicTarihi: true,
                bitisTarihi: true,
                olusturmaTarihi: true,
                urun: {
                    select: {
                        ad: true,
                        kod: true
                    }
                }
            }
        }, 'PRICING_CREATED');

        return newPricing;
    });

    // Enhanced audit logging for sensitive financial data
    auditLog('PRICING_CREATED', 'New pricing created', {
        userId: req.user.userId,
        pricingId: result.id,
        productId: result.urunId,
        productCode: result.urun.kod,
        productName: result.urun.ad,
        priceType: result.fiyatTipi,
        kgPrice: result.kgFiyati,
        unitPrice: result.birimFiyat,
        active: result.aktif,
        sensitiveOperation: true
    });

    return res.status(201).json({
        success: true,
        message: 'Pricing created successfully',
        pricing: result
    });
}

/**
 * Update Pricing with Enhanced Security and Validation
 */
async function updatePricing(req, res) {
    // Permission check - Only managers+ can update pricing
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to update pricing'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        requiredFields: ['id'],
        allowedFields: [
            'id', 'fiyatTipi', 'kgFiyati', 'birimFiyat', 'birim',
            'maliyetFiyati', 'karMarji', 'baslangicTarihi', 'bitisTarihi',
            'aktif', 'aciklama'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid update data',
            details: validationResult.errors
        });
    }

    const { id: pricingId, ...updateFields } = req.body;

    // Get current pricing for comparison
    const currentPricing = await req.prisma.secureQuery('urunFiyat', 'findUnique', {
        where: { id: parseInt(pricingId) },
        select: {
            id: true,
            urunId: true,
            fiyatTipi: true,
            kgFiyati: true,
            birimFiyat: true,
                    aktif: true,
                    urun: {
                        select: {
                            ad: true,
                            kod: true
                        }
                    }
                }
            });

    if (!currentPricing) {
        return res.status(404).json({
            error: 'Pricing not found'
        });
    }

    // Prepare update data
    const updateData = {};
    const changeLog = [];

    const allowedFields = [
        'fiyatTipi', 'kgFiyati', 'birimFiyat', 'birim',
        'maliyetFiyati', 'karMarji', 'baslangicTarihi', 'bitisTarihi',
        'aktif', 'aciklama'
    ];

    for (const field of allowedFields) {
        if (updateFields[field] !== undefined) {
            updateData[field] = updateFields[field];
            changeLog.push(`${field} updated`);
        }
    }

    // Recalculate margin if prices are updated
    if (updateData.kgFiyati && updateData.maliyetFiyati) {
        updateData.karMarji = ((updateData.kgFiyati - updateData.maliyetFiyati) / updateData.kgFiyati) * 100;
        changeLog.push('margin recalculated');
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
            error: 'No valid updates provided'
        });
    }

    // Update pricing with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        const updatedPricing = await tx.secureQuery('urunFiyat', 'update', {
            where: { id: parseInt(pricingId) },
            data: {
                ...updateData,
                guncellemeTarihi: new Date(),
                guncelleyenKullanici: req.user.userId
            },
            select: {
                id: true,
                urunId: true,
                fiyatTipi: true,
                kgFiyati: true,
                birimFiyat: true,
                aktif: true,
                guncellemeTarihi: true,
                urun: {
                    select: {
                        ad: true,
                        kod: true
                    }
                }
            }
        }, 'PRICING_UPDATED');

        return updatedPricing;
    });

    // Enhanced audit logging for sensitive financial data
    auditLog('PRICING_UPDATED', 'Pricing updated', {
        userId: req.user.userId,
        pricingId: parseInt(pricingId),
        productCode: result.urun.kod,
        productName: result.urun.ad,
        changes: changeLog,
        newPrices: {
            kgFiyati: result.kgFiyati,
            birimFiyat: result.birimFiyat
        },
        sensitiveOperation: true
        });

        return res.status(200).json({
        success: true,
        message: 'Pricing updated successfully',
        pricing: result,
        changes: changeLog
    });
}

/**
 * Delete Pricing with Enhanced Security
 */
async function deletePricing(req, res) {
    // Permission check - Only admins can delete pricing
    if (req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Insufficient permissions to delete pricing'
        });
    }

    const { id: pricingId } = req.body;

    if (!pricingId) {
        return res.status(400).json({
            error: 'Pricing ID is required'
        });
    }

    // Get pricing details for validation
    const pricingToDelete = await req.prisma.secureQuery('urunFiyat', 'findUnique', {
        where: { id: parseInt(pricingId) },
        select: {
            id: true,
            urunId: true,
            fiyatTipi: true,
            kgFiyati: true,
            aktif: true,
            urun: {
                select: {
                    ad: true,
                    kod: true
                }
            }
        }
    });

    if (!pricingToDelete) {
        return res.status(404).json({
            error: 'Pricing not found'
        });
    }

    // Business rule checks - Check if pricing is being used in active orders
    const usageInOrders = await req.prisma.secureQuery('siparisKalem', 'count', {
        where: {
            urunId: pricingToDelete.urunId,
            siparis: {
                durum: { not: 'IPTAL' }
            }
        }
    });

    if (usageInOrders > 0) {
        return res.status(400).json({
            error: 'Cannot delete pricing that is being used in active orders. Consider deactivating instead.'
        });
    }

    // Soft delete (deactivate) instead of hard delete for financial records
    const result = await req.prisma.secureTransaction(async (tx) => {
        const deactivatedPricing = await tx.secureQuery('urunFiyat', 'update', {
            where: { id: parseInt(pricingId) },
            data: {
                aktif: false,
                bitisTarihi: new Date(), // Set end date to now
                silinmeTarihi: new Date(),
                silenKullanici: req.user.userId,
                silmeSebebi: 'Yönetici silme işlemi'
            }
        }, 'PRICING_DEACTIVATED');

        return deactivatedPricing;
    });

    auditLog('PRICING_DELETED', 'Pricing deleted (soft delete)', {
        userId: req.user.userId,
        pricingId: parseInt(pricingId),
        productCode: pricingToDelete.urun.kod,
        productName: pricingToDelete.urun.ad,
        priceType: pricingToDelete.fiyatTipi,
        kgPrice: pricingToDelete.kgFiyati,
        sensitiveOperation: true
    });

    return res.status(200).json({
        success: true,
        message: 'Pricing deactivated successfully'
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(pricingHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_FINANCIAL, // Base permission for viewing financial data

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_FINANCIAL (Supervisor+)
        // POST: MANAGE_PRICING (Manager+)
        // PUT: MANAGE_PRICING (Manager+)
        // DELETE: DELETE_PRICING (Admin+)

        // Input Validation Configuration
        allowedFields: [
            'id', 'urunId', 'fiyatTipi', 'kgFiyati', 'birimFiyat', 'birim',
            'maliyetFiyati', 'karMarji', 'baslangicTarihi', 'bitisTarihi',
            'aktif', 'aciklama', 'page', 'limit', 'search', 'sortBy', 'sortOrder'
        ],
        requiredFields: {
            POST: ['urunId', 'fiyatTipi', 'kgFiyati', 'birimFiyat', 'birim'],
            PUT: ['id'],
            DELETE: ['id']
        },

        // Security Options for Financial Data
        preventSQLInjection: true,
        enableAuditLogging: true,
        sensitiveDataAccess: true // Mark as sensitive financial data
    }
); 