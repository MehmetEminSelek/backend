/**
 * =============================================
 * SECURED STOCK API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../lib/audit-logger.js';
import { validateInput } from '../../../lib/validation.js';

/**
 * Stock API Handler with Full Security Integration
 */
async function stockHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getStockList(req, res);
            case 'POST':
                return await createStockMovement(req, res);
            case 'PATCH':
                return await updateStockLevels(req, res);
            case 'PUT':
                return await updateMaterial(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'PUT']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PATCH', 'PUT']
                });
        }
    } catch (error) {
        console.error('Stock API Error:', error);

        auditLog('STOCK_API_ERROR', 'Stock API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Stock operation failed',
            code: 'STOCK_ERROR'
        });
    }
}

/**
 * Get Stock List with Advanced Filtering and Security
 */
async function getStockList(req, res) {
    const {
        page = 1,
        limit = 50,
        search,
        tipi,
        aktif,
        kritikStokOnly,
        lowStockOnly,
        sortBy = 'ad',
        sortOrder = 'asc'
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: [
            'page', 'limit', 'search', 'tipi', 'aktif',
            'kritikStokOnly', 'lowStockOnly', 'sortBy', 'sortOrder'
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
    if (aktif !== undefined) {
        whereClause.aktif = aktif === 'true';
    }

    // Type filtering
    if (tipi) {
        whereClause.tipi = { contains: tipi, mode: 'insensitive' };
    }

    // Critical stock filtering
    if (kritikStokOnly === 'true') {
        whereClause.mevcutStok = { lte: { field: 'kritikSeviye' } };
    }

    // Low stock filtering
    if (lowStockOnly === 'true') {
        whereClause.mevcutStok = { lte: { field: 'minStokSeviye' } };
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
    const validSortFields = ['ad', 'kod', 'tipi', 'mevcutStok', 'birimFiyat', 'updatedAt'];
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
                maxStokSeviye: true,
                kritikSeviye: true,
                aciklama: true,
                aktif: true,
                updatedAt: true,

                // Price and cost data only for higher roles
                ...(req.user.roleLevel >= 60 && {
                    birimFiyat: true,
                    sonAlisFiyati: true,
                    ortalamaMaliyet: true
                }),

                // Sensitive supplier info only for managers+
                ...(req.user.roleLevel >= 70 && {
                    tedarikci: true,
                    tedarikciKodu: true,
                    minSiparisMiktari: true
                }),

                // Storage and shelf-life info
                rafOmru: true,
                saklamaKosullari: true
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

    // Calculate stock alerts and statistics
    const stockAlerts = await req.prisma.secureQuery('material', 'findMany', {
        where: {
            aktif: true,
            OR: [
                { mevcutStok: { lte: { field: 'kritikSeviye' } } },
                { mevcutStok: { lte: { field: 'minStokSeviye' } } }
            ]
        },
        select: {
            id: true,
            ad: true,
            kod: true,
            mevcutStok: true,
            kritikSeviye: true,
            minStokSeviye: true
        }
    });

    // Stock summary statistics (only for higher roles)
    const stockSummary = req.user.roleLevel >= 60 ? await req.prisma.secureQuery('material', 'aggregate', {
        where: whereClause,
        _count: { id: true },
        _sum: {
            mevcutStok: true,
            birimFiyat: true
        },
        _avg: {
            birimFiyat: true
        }
    }) : null;

    auditLog('STOCK_VIEW', 'Stock list accessed', {
        userId: req.user.userId,
        totalMaterials: totalCount,
        page: pageNum,
        limit: limitNum,
        filters: { search, tipi, aktif, kritikStokOnly, lowStockOnly }
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
        alerts: {
            criticalStock: stockAlerts.filter(m => m.mevcutStok <= m.kritikSeviye),
            lowStock: stockAlerts.filter(m => m.mevcutStok <= m.minStokSeviye),
            totalAlerts: stockAlerts.length
        },
        ...(stockSummary && {
            summary: {
                totalMaterials: stockSummary._count.id,
                totalStockValue: stockSummary._sum?.birimFiyat || 0,
                averageUnitPrice: stockSummary._avg?.birimFiyat || 0
            }
        })
    });
}

/**
 * Create Stock Movement (Add/Remove Stock)
 */
async function createStockMovement(req, res) {
    // Permission check
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to create stock movements'
        });
    }

    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['materialId', 'miktar', 'tip'],
        allowedFields: [
            'materialId', 'miktar', 'tip', 'aciklama', 'referansNo',
            'birimFiyat', 'siparisId', 'tedarikciId'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid stock movement data',
            details: validationResult.errors
        });
    }

    const {
        materialId, miktar, tip, aciklama, referansNo,
        birimFiyat, siparisId, tedarikciId
    } = req.body;

    // Business logic validation
    if (!['GIRIS', 'CIKIS', 'TRANSFER', 'FIRE', 'SAYIM'].includes(tip)) {
        return res.status(400).json({
            error: 'Invalid movement type. Must be: GIRIS, CIKIS, TRANSFER, FIRE, SAYIM'
        });
    }

    if (miktar <= 0) {
        return res.status(400).json({
            error: 'Quantity must be positive'
        });
    }

    // Enhanced transaction for stock movement
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Get current material data
        const material = await tx.secureQuery('material', 'findUnique', {
            where: { id: parseInt(materialId) },
            select: {
                id: true,
                ad: true,
                kod: true,
                mevcutStok: true,
                birimFiyat: true,
                aktif: true
            }
        });

        if (!material) {
            throw new Error('Material not found');
        }

        if (!material.aktif) {
            throw new Error('Cannot create movements for inactive materials');
        }

        // Calculate new stock based on movement type
        let yeniStok = material.mevcutStok;
        let stokDeğişimi = 0;

        switch (tip) {
            case 'GIRIS':
                yeniStok += parseFloat(miktar);
                stokDeğişimi = parseFloat(miktar);
                break;
            case 'CIKIS':
            case 'FIRE':
                if (material.mevcutStok < parseFloat(miktar)) {
                    throw new Error('Insufficient stock for outbound movement');
                }
                yeniStok -= parseFloat(miktar);
                stokDeğişimi = -parseFloat(miktar);
                break;
            case 'SAYIM':
                stokDeğişimi = parseFloat(miktar) - material.mevcutStok;
                yeniStok = parseFloat(miktar);
                break;
            case 'TRANSFER':
                // For transfers, we'll handle both source and target in the future
                if (material.mevcutStok < parseFloat(miktar)) {
                    throw new Error('Insufficient stock for transfer');
                }
                yeniStok -= parseFloat(miktar);
                stokDeğişimi = -parseFloat(miktar);
                break;
        }

        // Create stock movement record
        const movement = await tx.secureQuery('stokHareket', 'create', {
            data: {
                materialId: parseInt(materialId),
                tip,
                miktar: parseFloat(miktar),
                öncekiStok: material.mevcutStok,
                yeniStok,
                stokDeğişimi,
                birimFiyat: birimFiyat ? parseFloat(birimFiyat) : material.birimFiyat,
                toplamTutar: (birimFiyat ? parseFloat(birimFiyat) : material.birimFiyat) * parseFloat(miktar),
                aciklama: aciklama || '',
                referansNo: referansNo || '',
                siparisId: siparisId ? parseInt(siparisId) : null,
                tedarikciId: tedarikciId ? parseInt(tedarikciId) : null,
                olusturmaTarihi: new Date(),
                olusturanKullanici: req.user.userId
            }
        }, 'STOCK_MOVEMENT_CREATED');

        // Update material stock
        const updatedMaterial = await tx.secureQuery('material', 'update', {
            where: { id: parseInt(materialId) },
            data: {
                mevcutStok: yeniStok,
                ...(birimFiyat && { birimFiyat: parseFloat(birimFiyat) }),
                sonHareketTarihi: new Date(),
                updatedAt: new Date()
            }
        }, 'MATERIAL_STOCK_UPDATED');

        return { movement, material: updatedMaterial };
    });

    // Enhanced audit logging
    auditLog('STOCK_MOVEMENT_CREATED', 'Stock movement created', {
        userId: req.user.userId,
        materialId: parseInt(materialId),
        movementType: tip,
        quantity: miktar,
        referenceNo: referansNo,
        movementId: result.movement.id
    });

    return res.status(201).json({
        success: true,
        message: 'Stock movement created successfully',
        movement: result.movement,
        newStock: result.material.mevcutStok
    });
}

/**
 * Update Stock Levels (Min/Max thresholds)
 */
async function updateStockLevels(req, res) {
    // Permission check
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to update stock levels'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        requiredFields: ['materialId'],
        allowedFields: ['materialId', 'minStokSeviye', 'maxStokSeviye', 'kritikSeviye'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid stock level data',
            details: validationResult.errors
        });
    }

    const { materialId, minStokSeviye, maxStokSeviye, kritikSeviye } = req.body;

    // Business logic validation
    if (minStokSeviye !== undefined && minStokSeviye < 0) {
        return res.status(400).json({
            error: 'Minimum stock level cannot be negative'
        });
    }

    if (maxStokSeviye !== undefined && maxStokSeviye < 0) {
        return res.status(400).json({
            error: 'Maximum stock level cannot be negative'
        });
    }

    if (kritikSeviye !== undefined && kritikSeviye < 0) {
        return res.status(400).json({
            error: 'Critical stock level cannot be negative'
        });
    }

    if (minStokSeviye !== undefined && maxStokSeviye !== undefined && minStokSeviye > maxStokSeviye) {
        return res.status(400).json({
            error: 'Minimum stock level cannot be greater than maximum'
        });
    }

    // Prepare update data
    const updateData = {};
    if (minStokSeviye !== undefined) updateData.minStokSeviye = parseFloat(minStokSeviye);
    if (maxStokSeviye !== undefined) updateData.maxStokSeviye = parseFloat(maxStokSeviye);
    if (kritikSeviye !== undefined) updateData.kritikSeviye = parseFloat(kritikSeviye);

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
            error: 'No valid updates provided'
        });
    }

    // Update material stock levels
    const result = await req.prisma.secureTransaction(async (tx) => {
        const updatedMaterial = await tx.secureQuery('material', 'update', {
            where: { id: parseInt(materialId) },
            data: {
                ...updateData,
                updatedAt: new Date(),
                guncelleyenKullanici: req.user.userId
            },
            select: {
                id: true,
                ad: true,
                kod: true,
                minStokSeviye: true,
                maxStokSeviye: true,
                kritikSeviye: true,
                mevcutStok: true
            }
        }, 'MATERIAL_LEVELS_UPDATED');

        return updatedMaterial;
    });

    auditLog('STOCK_LEVELS_UPDATED', 'Stock levels updated', {
        userId: req.user.userId,
        materialId: parseInt(materialId),
        updates: Object.keys(updateData),
        newLevels: updateData
    });

            return res.status(200).json({
        success: true,
        message: 'Stock levels updated successfully',
        material: result
    });
}

/**
 * Update Material Information
 */
async function updateMaterial(req, res) {
    // Permission check - Only managers+ can update material info
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to update material information'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        requiredFields: ['id'],
        allowedFields: [
            'id', 'ad', 'kod', 'tipi', 'birim', 'birimFiyat', 'aciklama',
            'tedarikci', 'tedarikciKodu', 'rafOmru', 'saklamaKosullari',
            'minSiparisMiktari', 'aktif'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid material data',
            details: validationResult.errors
        });
    }

    const { id: materialId, ...updateFields } = req.body;

    // Get current material for comparison
    const currentMaterial = await req.prisma.secureQuery('material', 'findUnique', {
        where: { id: parseInt(materialId) },
        select: {
            id: true,
            kod: true,
            ad: true,
            birimFiyat: true
        }
    });

    if (!currentMaterial) {
        return res.status(404).json({
            error: 'Material not found'
        });
    }

    // Prepare update data
    const updateData = {};
    const changeLog = [];

    const allowedFields = [
        'ad', 'kod', 'tipi', 'birim', 'birimFiyat', 'aciklama',
        'tedarikci', 'tedarikciKodu', 'rafOmru', 'saklamaKosullari',
        'minSiparisMiktari', 'aktif'
    ];

    for (const field of allowedFields) {
        if (updateFields[field] !== undefined) {
            updateData[field] = updateFields[field];
            changeLog.push(`${field} updated`);
        }
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
            error: 'No valid updates provided'
        });
    }

    // Update material with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Check for code uniqueness if code is being updated
        if (updateData.kod && updateData.kod !== currentMaterial.kod) {
            const existingMaterial = await tx.secureQuery('material', 'findFirst', {
                where: {
                    kod: { equals: updateData.kod, mode: 'insensitive' },
                    id: { not: parseInt(materialId) }
                }
            });

            if (existingMaterial) {
                throw new Error('Material with this code already exists');
            }
        }

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
                tipi: true,
                birim: true,
                birimFiyat: true,
                aktif: true,
                updatedAt: true
            }
        }, 'MATERIAL_UPDATED');

        return updatedMaterial;
    });

    auditLog('MATERIAL_UPDATED', 'Material information updated', {
        userId: req.user.userId,
        materialId: parseInt(materialId),
        materialCode: result.kod,
        materialName: result.ad,
        changes: changeLog
    });

    return res.status(200).json({
        success: true,
        message: 'Material updated successfully',
        material: result,
        changes: changeLog
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(stockHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_STOCK, // Base permission, individual operations check higher permissions

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_STOCK
        // POST: MANAGE_STOCK (Supervisor+)
        // PATCH: MANAGE_STOCK (Supervisor+)
        // PUT: UPDATE_MATERIALS (Manager+)

        // Input Validation Configuration
        allowedFields: [
            'materialId', 'miktar', 'tip', 'aciklama', 'referansNo',
            'birimFiyat', 'siparisId', 'tedarikciId', 'minStokSeviye',
            'maxStokSeviye', 'kritikSeviye', 'id', 'ad', 'kod', 'tipi',
            'birim', 'tedarikci', 'tedarikciKodu', 'rafOmru',
            'saklamaKosullari', 'minSiparisMiktari', 'aktif',
            'page', 'limit', 'search', 'sortBy', 'sortOrder'
        ],
        requiredFields: {
            POST: ['materialId', 'miktar', 'tip'],
            PATCH: ['materialId'],
            PUT: ['id']
        },

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true
    }
); 