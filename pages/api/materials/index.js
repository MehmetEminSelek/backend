/**
 * =============================================
 * SECURED MATERIALS API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../lib/audit-logger.js';
import { validateInput } from '../../../lib/validation.js';
import prisma from '../../../lib/prisma.js';

/**
 * Materials API Handler with Full Security Integration
 */
async function materialsHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getMaterials(req, res);
            case 'POST':
                return await createMaterial(req, res);
            case 'PUT':
                return await updateMaterial(req, res);
            case 'DELETE':
                return await deleteMaterial(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PUT', 'DELETE']
                });
        }
    } catch (error) {
        console.error('Materials API Error:', error);

        auditLog('MATERIALS_API_ERROR', 'Materials API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Material operation failed',
            code: 'MATERIALS_ERROR'
        });
    }
}

/**
 * Get Materials List with Advanced Filtering and Security
 */
async function getMaterials(req, res) {
    const {
        page = 1,
        limit = 50,
        search,
        tipi,
        birim,
        aktif,
        lowStockOnly,
        sortBy = 'ad',
        sortOrder = 'asc'
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: [
            'page', 'limit', 'search', 'tipi', 'birim', 'aktif',
            'lowStockOnly', 'sortBy', 'sortOrder'
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
        whereClause.tipi = tipi; // enum
    }

    // Unit filtering
    if (birim) {
        whereClause.birim = birim; // enum
    }

    // Low stock filtering
    if (lowStockOnly === 'true') {
        // mevcutStok <= minStokSeviye
        whereClause.AND = [
            { mevcutStok: { lte: 0 } },
            { minStokSeviye: { gt: 0 } }
        ];
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
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Sorting validation
    const validSortFields = ['ad', 'kod', 'tipi', 'birim', 'mevcutStok', 'birimFiyat', 'updatedAt'];
    const validSortOrders = ['asc', 'desc'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'ad';
    const sortDirection = validSortOrders.includes(sortOrder) ? sortOrder : 'asc';

    // Enhanced query with security context
    const [materials, totalCount] = await Promise.all([
        prisma.material.findMany({
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
                createdAt: true
            },
            orderBy: {
                [sortField]: sortDirection
            },
            skip,
            take: limitNum
        }),
        prisma.material.count({
            where: whereClause
        })
    ]);

    // Get materials by type
    const typeBreakdown = await prisma.material.groupBy({
        by: ['tipi'],
        where: whereClause,
        _count: { id: true }
    });

    auditLog('MATERIALS_VIEW', 'Materials list accessed', {
        userId: req.user.userId,
        totalMaterials: totalCount,
        page: pageNum,
        limit: limitNum,
        filters: { search, tipi, birim, aktif, lowStockOnly }
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
        breakdown: {
            byType: typeBreakdown
        }
    });
}

/**
 * Create New Material with Enhanced Security and Validation
 */
async function createMaterial(req, res) {
    // Permission check
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to create materials'
        });
    }

    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['ad', 'kod', 'tipi', 'birim'],
        allowedFields: [
            'ad', 'kod', 'tipi', 'birim', 'birimFiyat', 'aciklama',
            'tedarikci', 'minStokSeviye', 'maxStokSeviye', 'kritikSeviye',
            'rafOmru', 'saklamaKosullari', 'aktif'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid material data',
            details: validationResult.errors
        });
    }

    const {
        ad, kod, tipi, birim, birimFiyat = 0, aciklama,
        tedarikci,
        minStokSeviye = 0, maxStokSeviye = 0, kritikSeviye = 0,
        rafOmru, saklamaKosullari, aktif = true
    } = req.body;

    // Business logic validation
    if (kod.length < 2) {
        return res.status(400).json({ error: 'Material code must be at least 2 characters long' });
    }
    if (ad.length < 2) {
        return res.status(400).json({ error: 'Material name must be at least 2 characters long' });
    }

    // Material type validation (enum in schema: HAMMADDE, YARI_MAMUL, YARDIMCI_MADDE)
    const validTypes = ['HAMMADDE', 'YARI_MAMUL', 'YARDIMCI_MADDE'];
    if (!validTypes.includes(tipi)) {
        return res.status(400).json({ error: 'Invalid material type' });
    }

    if (birimFiyat < 0) {
        return res.status(400).json({ error: 'Unit price cannot be negative' });
    }

    if (minStokSeviye < 0 || maxStokSeviye < 0 || kritikSeviye < 0) {
        return res.status(400).json({ error: 'Stock levels cannot be negative' });
    }

    if (maxStokSeviye > 0 && minStokSeviye > maxStokSeviye) {
        return res.status(400).json({ error: 'Minimum stock level cannot be greater than maximum' });
    }

    const result = await prisma.$transaction(async (tx) => {
        const existingMaterial = await tx.material.findFirst({
            where: { kod: { equals: kod.toUpperCase(), mode: 'insensitive' } }
        });
        if (existingMaterial) {
            throw new Error('Material with this code already exists');
        }

        const newMaterial = await tx.material.create({
            data: {
                ad,
                kod: kod.toUpperCase(),
                tipi,
                birim,
                birimFiyat: parseFloat(birimFiyat),
                aciklama: aciklama || '',
                tedarikci: tedarikci || '',
                minStokSeviye: parseInt(minStokSeviye),
                maxStokSeviye: parseInt(maxStokSeviye),
                kritikSeviye: parseInt(kritikSeviye),
                mevcutStok: 0,
                rafOmru: rafOmru || null,
                saklamaKosullari: saklamaKosullari || '',
                aktif
            },
            select: {
                id: true,
                ad: true,
                kod: true,
                tipi: true,
                birim: true,
                birimFiyat: true,
                aktif: true,
                createdAt: true
            }
        });

        return newMaterial;
    });

    auditLog('MATERIAL_CREATED', 'New material created', {
        userId: req.user.userId,
        materialId: result.id,
        materialCode: result.kod,
        materialName: result.ad,
        materialType: tipi,
        unitPrice: birimFiyat
    });

    return res.status(201).json({
        success: true,
        message: 'Material created successfully',
        material: result
    });
}

/**
 * Update Material with Enhanced Security and Validation
 */
async function updateMaterial(req, res) {
    if (req.user.roleLevel < 60) {
        return res.status(403).json({ error: 'Insufficient permissions to update materials' });
    }

    const validationResult = validateInput(req.body, {
        requiredFields: ['id'],
        allowedFields: [
            'id', 'ad', 'kod', 'tipi', 'birim', 'birimFiyat', 'aciklama',
            'tedarikci', 'minStokSeviye', 'maxStokSeviye', 'kritikSeviye',
            'rafOmru', 'saklamaKosullari', 'aktif'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({ error: 'Invalid update data', details: validationResult.errors });
    }

    const { id: materialId, ...updateFields } = req.body;

    const currentMaterial = await prisma.material.findUnique({
        where: { id: parseInt(materialId) },
        select: { id: true, kod: true, ad: true, birimFiyat: true, aktif: true }
    });

    if (!currentMaterial) {
        return res.status(404).json({ error: 'Material not found' });
    }

    if (updateFields.birimFiyat !== undefined && req.user.roleLevel < 70) {
        return res.status(403).json({ error: 'Insufficient permissions to update material prices' });
    }

    const updateData = {};
    const changeLog = [];

    const allowedFields = [
        'ad', 'kod', 'tipi', 'birim', 'birimFiyat', 'aciklama',
        'tedarikci', 'minStokSeviye', 'maxStokSeviye', 'kritikSeviye',
        'rafOmru', 'saklamaKosullari', 'aktif'
    ];

    for (const field of allowedFields) {
        if (updateFields[field] !== undefined) {
            updateData[field] = updateFields[field];
            changeLog.push(`${field} updated`);
        }
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid updates provided' });
    }

    const result = await prisma.$transaction(async (tx) => {
        if (updateData.kod && updateData.kod !== currentMaterial.kod) {
            const existingMaterial = await tx.material.findFirst({
                where: { kod: { equals: updateData.kod, mode: 'insensitive' }, id: { not: parseInt(materialId) } }
            });
            if (existingMaterial) {
                throw new Error('Material with this code already exists');
            }
        }

        const updatedMaterial = await tx.material.update({
            where: { id: parseInt(materialId) },
            data: { ...updateData, updatedAt: new Date() },
            select: { id: true, kod: true, ad: true, tipi: true, birim: true, birimFiyat: true, aktif: true, updatedAt: true }
        });

        return updatedMaterial;
    });

    auditLog('MATERIAL_UPDATED', 'Material updated', {
        userId: req.user.userId,
        materialId: parseInt(materialId),
        materialCode: result.kod,
        materialName: result.ad,
        changes: changeLog,
        userRole: req.user.rol
    });

    return res.status(200).json({
        success: true,
        message: 'Material updated successfully',
        material: result,
        changes: changeLog
    });
}

/**
 * Delete Material with Enhanced Security
 */
async function deleteMaterial(req, res) {
    if (req.user.roleLevel < 80) {
        return res.status(403).json({ error: 'Insufficient permissions to delete materials' });
    }

    const { id: materialId } = req.body;

    if (!materialId) {
        return res.status(400).json({ error: 'Material ID is required' });
    }

    const materialToDelete = await prisma.material.findUnique({
        where: { id: parseInt(materialId) },
        select: { id: true, kod: true, ad: true, aktif: true, mevcutStok: true }
    });

    if (!materialToDelete) {
        return res.status(404).json({ error: 'Material not found' });
    }

    if (materialToDelete.mevcutStok > 0) {
        return res.status(400).json({ error: 'Cannot delete materials with existing stock' });
    }

    // Check if material is used in any recipes or stock movements
    const [recipeUsage, movementHistory] = await Promise.all([
        prisma.recipeIngredient.count({ where: { materialId: parseInt(materialId) } }),
        prisma.stokHareket.count({ where: { materialId: parseInt(materialId) } })
    ]);

    if (recipeUsage > 0 || movementHistory > 0) {
        return res.status(400).json({ error: 'Cannot delete materials that have been used in recipes or have movement history. Consider deactivating instead.' });
    }

    await prisma.$transaction(async (tx) => {
        await tx.material.update({
            where: { id: parseInt(materialId) },
            data: { aktif: false, updatedAt: new Date() }
        });
    });

    auditLog('MATERIAL_DELETED', 'Material deleted (soft delete)', {
        userId: req.user.userId,
        materialId: parseInt(materialId),
        materialCode: materialToDelete.kod,
        materialName: materialToDelete.ad
    });

    return res.status(200).json({ success: true, message: 'Material deactivated successfully' });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(materialsHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_MATERIALS, // Base permission, individual operations check higher permissions

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_MATERIALS
        // POST: CREATE_MATERIALS (Manager+)
        // PUT: UPDATE_MATERIALS (Supervisor+)
        // DELETE: DELETE_MATERIALS (Admin+)

        // Input Validation Configuration
        allowedFields: [
            'id', 'ad', 'kod', 'tipi', 'birim', 'birimFiyat', 'aciklama',
            'tedarikci', 'minStokSeviye', 'maxStokSeviye', 'kritikSeviye',
            'rafOmru', 'saklamaKosullari', 'aktif',
            'page', 'limit', 'search', 'sortBy', 'sortOrder'
        ],
        requiredFields: {
            POST: ['ad', 'kod', 'tipi', 'birim'],
            PUT: ['id'],
            DELETE: ['id']
        },

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true
    }
); 