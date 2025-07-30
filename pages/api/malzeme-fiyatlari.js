/**
 * =============================================
 * SECURED MATERIAL PRICING API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../lib/api-security.js';
import { withPrismaSecurity } from '../../lib/prisma-security.js';
import { PERMISSIONS } from '../../lib/rbac-enhanced.js';
import { auditLog } from '../../lib/audit-logger.js';
import { validateInput } from '../../lib/validation.js';

/**
 * Material Pricing API Handler with Full Security Integration
 */
async function materialPricingHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getMaterialPricing(req, res);
            case 'POST':
                return await updateMaterialPricing(req, res);
            case 'PUT':
                return await bulkUpdateMaterialPricing(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PUT']
                });
        }
    } catch (error) {
        console.error('Material Pricing API Error:', error);

        auditLog('MATERIAL_PRICING_API_ERROR', 'Material pricing API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Material pricing operation failed',
            code: 'MATERIAL_PRICING_ERROR'
        });
    }
}

/**
 * Get Material Pricing Data with Enhanced Security
 */
async function getMaterialPricing(req, res) {
    // Permission check - Material pricing is sensitive financial data
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to view material pricing data'
        });
    }

    const {
        kod,
        id,
        page = 1,
        limit = 50,
        search,
        tipi,
        aktif,
        lowPrice,
        highPrice,
        sortBy = 'ad',
        sortOrder = 'asc'
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: [
            'kod', 'id', 'page', 'limit', 'search', 'tipi', 'aktif',
            'lowPrice', 'highPrice', 'sortBy', 'sortOrder'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid query parameters',
            details: validationResult.errors
        });
    }

    // Single material lookup by code or ID
    if (kod || id) {
        const whereCondition = kod
            ? { kod: { equals: kod, mode: 'insensitive' } }
            : { id: parseInt(id) };

        const material = await req.prisma.secureQuery('material', 'findUnique', {
            where: whereCondition,
                    select: {
                        id: true,
                        ad: true,
                        kod: true,
                        tipi: true,
                        birim: true,
                        mevcutStok: true,
                        minStokSeviye: true,
                        kritikSeviye: true,
                        aciklama: true,
                aktif: true,
                updatedAt: true,

                // Price data only for authorized users
                ...(req.user.roleLevel >= 60 && {
                    birimFiyat: true,
                    sonAlisFiyati: true,
                    ortalamaMaliyet: true
                }),

                // Sensitive supplier data only for managers+
                ...(req.user.roleLevel >= 70 && {
                        tedarikci: true,
                    tedarikciKodu: true,
                    minSiparisMiktari: true
                })
                    }
                });

                if (!material) {
                    return res.status(404).json({
                error: 'Material not found',
                searchKey: kod || id
            });
        }

        auditLog('MATERIAL_PRICING_VIEW_SINGLE', 'Single material pricing accessed', {
            userId: req.user.userId,
            materialId: material.id,
            materialCode: material.kod,
            materialName: material.ad,
            sensitiveAccess: req.user.roleLevel >= 70
        });

                return res.status(200).json({
            success: true,
            material: {
                id: material.id,
                    kod: material.kod,
                    ad: material.ad,
                tipi: material.tipi,
                birim: material.birim,
                    fiyat: material.birimFiyat || 0,
                sonAlisFiyati: material.sonAlisFiyati || 0,
                ortalamaMaliyet: material.ortalamaMaliyet || 0,
                    mevcutStok: material.mevcutStok,
                    minStokSeviye: material.minStokSeviye,
                kritikSeviye: material.kritikSeviye,
                aciklama: material.aciklama,
                aktif: material.aktif,
                ...(req.user.roleLevel >= 70 && {
                    tedarikci: material.tedarikci,
                    tedarikciKodu: material.tedarikciKodu,
                    minSiparisMiktari: material.minSiparisMiktari
                })
            }
        });
    }

    // Multi-material listing with filtering
    const whereClause = {};

    // Status filtering
    if (aktif !== undefined) {
        whereClause.aktif = aktif === 'true';
    }

    // Type filtering
    if (tipi) {
        whereClause.tipi = { contains: tipi, mode: 'insensitive' };
    }

    // Price range filtering (only for authorized users)
    if ((lowPrice || highPrice) && req.user.roleLevel >= 60) {
        whereClause.birimFiyat = {};
        if (lowPrice) {
            whereClause.birimFiyat.gte = parseFloat(lowPrice);
        }
        if (highPrice) {
            whereClause.birimFiyat.lte = parseFloat(highPrice);
        }
    }

    // Search filtering
    if (search) {
        whereClause.OR = [
            { ad: { contains: search, mode: 'insensitive' } },
            { kod: { contains: search, mode: 'insensitive' } },
            { aciklama: { contains: search, mode: 'insensitive' } },
            { tedarikci: { contains: search, mode: 'insensitive' } }
        ];
    }

    // Pagination and limits
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Sorting validation
    const validSortFields = ['ad', 'kod', 'tipi', 'birimFiyat', 'mevcutStok', 'updatedAt'];
    const validSortOrders = ['asc', 'desc'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'ad';
    const sortDirection = validSortOrders.includes(sortOrder) ? sortOrder : 'asc';

    // Enhanced query with security context
    const [materials, totalCount] = await Promise.all([
        req.prisma.secureQuery('material', 'findMany', {
            where: whereClause,
                    select: {
                        id: true,
                        ad: true,
                        kod: true,
                        tipi: true,
                        birim: true,
                        mevcutStok: true,
                        minStokSeviye: true,
                        kritikSeviye: true,
                aktif: true,
                updatedAt: true,

                // Price data only for authorized users
                ...(req.user.roleLevel >= 60 && {
                    birimFiyat: true,
                    sonAlisFiyati: true,
                    ortalamaMaliyet: true
                }),

                // Sensitive supplier data only for managers+
                ...(req.user.roleLevel >= 70 && {
                        tedarikci: true,
                    tedarikciKodu: true
                })
            },
            orderBy: {
                [sortField]: sortDirection
            },
            skip,
            take: limitNum
        }),
        req.prisma.secureQuery('material', 'count', {
            where: whereClause
        })
    ]);

    // Calculate pricing statistics (only for managers+)
    const pricingStats = req.user.roleLevel >= 70 ? await req.prisma.secureQuery('material', 'aggregate', {
        where: { ...whereClause, birimFiyat: { gt: 0 } },
        _count: { id: true },
        _avg: {
            birimFiyat: true,
            sonAlisFiyati: true,
            ortalamaMaliyet: true
        },
        _min: {
            birimFiyat: true
        },
        _max: {
            birimFiyat: true
        }
    }) : null;

    auditLog('MATERIAL_PRICING_VIEW_LIST', 'Material pricing list accessed', {
        userId: req.user.userId,
        totalMaterials: totalCount,
        page: pageNum,
        limit: limitNum,
        filters: { search, tipi, aktif, lowPrice, highPrice },
        sensitiveAccess: req.user.roleLevel >= 70
                });

                return res.status(200).json({
        success: true,
        materials,
        pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalCount / limitNum),
            totalItems: totalCount,
            itemsPerPage: limitNum
        },
        ...(pricingStats && {
            pricingStatistics: {
                totalMaterialsWithPricing: pricingStats._count.id,
                averagePrice: pricingStats._avg?.birimFiyat || 0,
                averagePurchasePrice: pricingStats._avg?.sonAlisFiyati || 0,
                averageCost: pricingStats._avg?.ortalamaMaliyet || 0,
                priceRange: {
                    min: pricingStats._min?.birimFiyat || 0,
                    max: pricingStats._max?.birimFiyat || 0
                }
            }
        })
    });
}

/**
 * Update Single Material Pricing
 */
async function updateMaterialPricing(req, res) {
    // Permission check - Only managers+ can update material pricing
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to update material pricing'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        requiredFields: ['materialId'],
        allowedFields: [
            'materialId', 'birimFiyat', 'sonAlisFiyati', 'ortalamaMaliyet',
            'minSiparisMiktari', 'tedarikciKodu', 'aciklama'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid pricing update data',
            details: validationResult.errors
        });
    }

    const {
        materialId, birimFiyat, sonAlisFiyati, ortalamaMaliyet,
        minSiparisMiktari, tedarikciKodu, aciklama
    } = req.body;

    // Business logic validation
    if (birimFiyat !== undefined && birimFiyat < 0) {
        return res.status(400).json({
            error: 'Unit price cannot be negative'
        });
    }

    if (sonAlisFiyati !== undefined && sonAlisFiyati < 0) {
        return res.status(400).json({
            error: 'Purchase price cannot be negative'
        });
    }

    if (ortalamaMaliyet !== undefined && ortalamaMaliyet < 0) {
                return res.status(400).json({
            error: 'Average cost cannot be negative'
        });
    }

    // Update material pricing with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Verify material exists
        const material = await tx.secureQuery('material', 'findUnique', {
            where: { id: parseInt(materialId) },
            select: {
                id: true,
                ad: true,
                kod: true,
                aktif: true,
                birimFiyat: true
            }
            });

            if (!material) {
            throw new Error('Material not found');
        }

        if (!material.aktif) {
            throw new Error('Cannot update pricing for inactive materials');
        }

        // Prepare update data
        const updateData = {};
        const changeLog = [];

        if (birimFiyat !== undefined) {
            updateData.birimFiyat = parseFloat(birimFiyat);
            changeLog.push(`unit price: ${material.birimFiyat} → ${birimFiyat}`);
        }

        if (sonAlisFiyati !== undefined) {
            updateData.sonAlisFiyati = parseFloat(sonAlisFiyati);
            changeLog.push('purchase price updated');
        }

        if (ortalamaMaliyet !== undefined) {
            updateData.ortalamaMaliyet = parseFloat(ortalamaMaliyet);
            changeLog.push('average cost updated');
        }

        if (minSiparisMiktari !== undefined) {
            updateData.minSiparisMiktari = parseInt(minSiparisMiktari);
            changeLog.push('minimum order quantity updated');
        }

        if (tedarikciKodu !== undefined) {
            updateData.tedarikciKodu = tedarikciKodu;
            changeLog.push('supplier code updated');
        }

        if (aciklama !== undefined) {
            updateData.aciklama = aciklama;
            changeLog.push('description updated');
        }

        if (Object.keys(updateData).length === 0) {
            throw new Error('No valid updates provided');
        }

        // Update material
        const updatedMaterial = await tx.secureQuery('material', 'update', {
            where: { id: parseInt(materialId) },
            data: {
                ...updateData,
                updatedAt: new Date(),
                guncelleyenKullanici: req.user.userId
            },
            select: {
                id: true,
                kod: true,
                ad: true,
                birimFiyat: true,
                sonAlisFiyati: true,
                ortalamaMaliyet: true,
                updatedAt: true
            }
        }, 'MATERIAL_PRICING_UPDATED');

        return { material: updatedMaterial, changes: changeLog };
    });

    // Enhanced audit logging for sensitive financial data
    auditLog('MATERIAL_PRICING_UPDATED', 'Material pricing updated', {
        userId: req.user.userId,
        materialId: parseInt(materialId),
        materialCode: result.material.kod,
        materialName: result.material.ad,
        changes: result.changes,
        newPricing: {
            birimFiyat: result.material.birimFiyat,
            sonAlisFiyati: result.material.sonAlisFiyati,
            ortalamaMaliyet: result.material.ortalamaMaliyet
        },
        sensitiveOperation: true
    });

    return res.status(200).json({
        success: true,
        message: 'Material pricing updated successfully',
        material: result.material,
        changes: result.changes
    });
}

/**
 * Bulk Update Material Pricing
 */
async function bulkUpdateMaterialPricing(req, res) {
    // Permission check - Only administrators can bulk update pricing
    if (req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Insufficient permissions for bulk pricing updates'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        requiredFields: ['updates'],
        allowedFields: ['updates', 'applyPercentageIncrease', 'percentage'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid bulk update data',
            details: validationResult.errors
        });
    }

    const { updates, applyPercentageIncrease, percentage } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
            error: 'Updates array is required and cannot be empty'
        });
    }

    if (applyPercentageIncrease && (!percentage || percentage <= -100)) {
        return res.status(400).json({
            error: 'Valid percentage is required for percentage increase'
        });
    }

    // Bulk update with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        const updatedMaterials = [];
        const errors = [];

        for (const update of updates) {
            try {
                const { materialId, birimFiyat } = update;

                if (!materialId) {
                    errors.push({ materialId, error: 'Material ID is required' });
                    continue;
                }

                // Calculate new price
                let newPrice = birimFiyat;
                if (applyPercentageIncrease && percentage) {
                    const currentMaterial = await tx.secureQuery('material', 'findUnique', {
                        where: { id: parseInt(materialId) },
                        select: { birimFiyat: true }
                    });

                    if (currentMaterial) {
                        newPrice = currentMaterial.birimFiyat * (1 + percentage / 100);
                    }
                }

                if (newPrice <= 0) {
                    errors.push({ materialId, error: 'Price must be positive' });
                    continue;
                }

                const updatedMaterial = await tx.secureQuery('material', 'update', {
                    where: { id: parseInt(materialId) },
                    data: {
                        birimFiyat: parseFloat(newPrice),
                        updatedAt: new Date(),
                        guncelleyenKullanici: req.user.userId
                    },
                    select: {
                        id: true,
                        kod: true,
                        ad: true,
                        birimFiyat: true
                    }
                }, 'MATERIAL_PRICING_BULK_UPDATED');

                updatedMaterials.push(updatedMaterial);
            } catch (error) {
                errors.push({ materialId: update.materialId, error: error.message });
            }
        }

        return { updatedMaterials, errors };
    });

    // Enhanced audit logging for bulk operation
    auditLog('MATERIAL_PRICING_BULK_UPDATED', 'Bulk material pricing update', {
        userId: req.user.userId,
        totalUpdates: updates.length,
        successfulUpdates: result.updatedMaterials.length,
        errors: result.errors.length,
        percentageIncrease: applyPercentageIncrease ? percentage : null,
        sensitiveOperation: true
    });

    return res.status(200).json({
        success: true,
        message: `Bulk pricing update completed. ${result.updatedMaterials.length} materials updated, ${result.errors.length} errors.`,
        updatedMaterials: result.updatedMaterials,
        errors: result.errors,
        summary: {
            total: updates.length,
            successful: result.updatedMaterials.length,
            failed: result.errors.length
        }
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(materialPricingHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_FINANCIAL, // Base permission for viewing financial data

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_FINANCIAL (Supervisor+)
        // POST: MANAGE_PRICING (Manager+)
        // PUT: BULK_MANAGE_PRICING (Admin+)

        // Input Validation Configuration
        allowedFields: [
            'kod', 'id', 'materialId', 'birimFiyat', 'sonAlisFiyati', 'ortalamaMaliyet',
            'minSiparisMiktari', 'tedarikciKodu', 'aciklama', 'updates',
            'applyPercentageIncrease', 'percentage', 'page', 'limit', 'search',
            'tipi', 'aktif', 'lowPrice', 'highPrice', 'sortBy', 'sortOrder'
        ],
        requiredFields: {
            POST: ['materialId'],
            PUT: ['updates']
        },

        // Security Options for Financial Data
        preventSQLInjection: true,
        enableAuditLogging: true,
        sensitiveDataAccess: true // Mark as sensitive financial data
    }
); 