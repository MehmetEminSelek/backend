/**
 * =============================================
 * SECURED RECIPES API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../lib/api-security.js';
import { withPrismaSecurity } from '../../lib/prisma-security.js';
import { PERMISSIONS } from '../../lib/rbac-enhanced.js';
import { auditLog } from '../../lib/audit-logger.js';
import { validateInput } from '../../lib/validation.js';
import prisma from '../../lib/prisma.js';

/**
 * Recipes API Handler with Full Security Integration
 */
async function recipesHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getRecipes(req, res);
            case 'POST':
                return await createRecipe(req, res);
            case 'PUT':
                return await updateRecipe(req, res);
            case 'DELETE':
                return await deleteRecipe(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PUT', 'DELETE']
                });
        }
    } catch (error) {
        console.error('Recipes API Error:', error);

        auditLog('RECIPES_API_ERROR', 'Recipes API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Recipe operation failed',
            code: 'RECIPES_ERROR'
        });
    }
}

/**
 * Get Recipes with Enhanced Security and Cost Protection
 */
async function getRecipes(req, res) {
    // Permission check - Recipes are production secrets
    if (req.user.roleLevel < 30) {
        return res.status(403).json({
            error: 'Insufficient permissions to view recipes'
        });
    }

    const {
        page = 1,
        limit = 50,
        search,
        urunId,
        aktif,
        includeCosts = false,
        kategori,
        sortBy = 'ad',
        sortOrder = 'asc'
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: [
            'page', 'limit', 'search', 'urunId', 'aktif', 'includeCosts',
            'kategori', 'sortBy', 'sortOrder'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid query parameters',
            details: validationResult.errors
        });
    }

    // Cost access permission check
    if (includeCosts === 'true' && req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Cost information requires manager permissions'
        });
    }

    console.log('GET /api/receteler request received...');

    // Enhanced security transaction for recipe data
    const recipeData = await prisma.$transaction(async (tx) => {
        // Build where clause for recipes
        const whereClause = {};

        if (aktif !== undefined) {
            whereClause.aktif = aktif === 'true';
        }
        if (urunId) {
            whereClause.urunId = parseInt(urunId);
        }
        if (kategori) {
            whereClause.urun = {
                kategori: { ad: { contains: kategori, mode: 'insensitive' } }
            };
        }
        if (search) {
            whereClause.OR = [
                { ad: { contains: search, mode: 'insensitive' } },
                { aciklama: { contains: search, mode: 'insensitive' } },
                { urun: { ad: { contains: search, mode: 'insensitive' } } }
            ];
        }

        // Pagination and sorting
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(Math.max(1, parseInt(limit)), 100);
        const skip = (pageNum - 1) * limitNum;

        const validSortFields = ['ad', 'createdAt', 'updatedAt'];
        const validSortOrders = ['asc', 'desc'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'ad';
        const sortDirection = validSortOrders.includes(sortOrder) ? sortOrder : 'asc';

        const [recipes, totalCount] = await Promise.all([
            tx.recipe.findMany({
                where: { ...whereClause, deletedAt: null },
                select: {
                    id: true,
                    ad: true,
                    urunId: true,
                    urun: { select: { id: true, ad: true } },
                    icerikelek: {
                        select: {
                            id: true,
                            miktar: true,
                            birim: true,
                            material: { select: { id: true, ad: true, kod: true } }
                        }
                    },
                    createdAt: true,
                    updatedAt: true
                },
                orderBy: { [sortField]: sortDirection },
                skip,
                take: limitNum
            }),
            tx.recipe.count({ where: { ...whereClause, deletedAt: null } })
        ]);

        return { recipes, totalCount, pageNum, limitNum };
    });

    // Enhanced audit logging for production data access
    auditLog('RECIPES_VIEW', 'Recipes accessed', {
        userId: req.user.userId,
        totalRecipes: recipeData.totalCount,
        page: recipeData.pageNum,
        limit: recipeData.limitNum,
        includeCosts: includeCosts === 'true',
        filters: { search, urunId, aktif, kategori },
        roleLevel: req.user.roleLevel,
        productionDataAccess: true
    });

    // Legacy flat array support for frontend
    const legacy = recipeData.recipes.map(r => ({
        id: r.id,
        name: r.ad,
        urunId: r.urunId,
        urunAd: r.urun?.ad || null,
        ingredients: r.icerikelek.map(k => ({
            stokKod: k.material?.kod,
            stokAd: k.material?.ad,
            miktarGram: k.miktar
        }))
    }));

    return res.status(200).json({
        success: true,
        recipes: recipeData.recipes,
        legacy,
        pagination: {
            currentPage: recipeData.pageNum,
            totalPages: Math.ceil(recipeData.totalCount / recipeData.limitNum),
            totalItems: recipeData.totalCount,
            itemsPerPage: recipeData.limitNum
        },
        ...(recipeData.recipeStats && {
            statistics: {
                totalActiveRecipes: recipeData.recipeStats._count.id,
                averageCost: recipeData.recipeStats._avg?.toplamMaliyet || 0,
                averageUnitCost: recipeData.recipeStats._avg?.birimMaliyet || 0,
                averageMargin: recipeData.recipeStats._avg?.karMarji || 0,
                costRange: {
                    min: recipeData.recipeStats._min?.toplamMaliyet || 0,
                    max: recipeData.recipeStats._max?.toplamMaliyet || 0
                }
            }
        }),
        metadata: {
            generatedAt: new Date(),
            userRole: req.user.rol,
            accessLevel: req.user.roleLevel,
            costDataIncluded: includeCosts === 'true' && req.user.roleLevel >= 70
        }
    });
}

/**
 * Create Recipe with Enhanced Security and Validation
 */
async function createRecipe(req, res) {
    // Permission check - Only production managers+ can create recipes
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to create recipes'
        });
    }

    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['ad', 'porsiyon', 'receteKalemleri'],
        allowedFields: [
            'ad', 'aciklama', 'urunId', 'urun', 'porsiyon', 'hazirlamaSuresi',
            'pisirmeSuresi', 'zorlukSeviyesi', 'receteKalemleri', 'aktif'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid recipe data',
            details: validationResult.errors
        });
    }

    const {
        ad, aciklama, urunId: incomingUrunId, urun: incomingUrun, porsiyon,
        hazirlamaSuresi, pisirmeSuresi, zorlukSeviyesi, receteKalemleri, aktif = true
    } = req.body;

    if (!Array.isArray(receteKalemleri) || receteKalemleri.length === 0) {
        return res.status(400).json({ error: 'Recipe must contain at least one ingredient' });
    }

    const result = await prisma.$transaction(async (tx) => {
        let productId = incomingUrunId ? parseInt(incomingUrunId) : null;
        if (!productId && incomingUrun && incomingUrun.ad) {
            const kod = (incomingUrun.kod || incomingUrun.ad).toString().toUpperCase().replace(/\s+/g, '_');
            const created = await tx.urun.create({
                data: {
                    ad: incomingUrun.ad,
                    kod,
                    aciklama: incomingUrun.aciklama || null,
                    birim: (incomingUrun.birim || 'KG').toUpperCase(),
                    minStokSeviye: incomingUrun.minStokSeviye ? parseFloat(incomingUrun.minStokSeviye) : 0,
                    satisaUygun: incomingUrun.satisaUygun !== false,
                    aktif: true
                },
                select: { id: true }
            });
            productId = created.id;
        }
        const product = await tx.urun.findUnique({ where: { id: parseInt(productId) }, select: { id: true, ad: true, kod: true, aktif: true } });
        if (!product || !product.aktif) throw new Error('Invalid or inactive product');

        let totalCost = 0;
        const materialValidations = await Promise.all(
            receteKalemleri.map(async (item) => {
                const material = await tx.material.findUnique({ where: { id: parseInt(item.materialId) }, select: { id: true, ad: true, kod: true, birim: true, birimFiyat: true, aktif: true } });
                if (!material || !material.aktif) throw new Error(`Invalid or inactive material: ${item.materialId}`);
                const itemCost = (material.birimFiyat || 0) * parseFloat(item.miktar);
                totalCost += itemCost;
                return { ...item, material, itemCost };
            })
        );

        const newRecipe = await tx.recipe.create({
            data: {
                ad,
                kod: `RC${Date.now()}`,
                aciklama: aciklama || '',
                urunId: parseInt(productId),
                porsiyon: parseFloat(porsiyon),
                hazirlamaSuresi: hazirlamaSuresi ? parseInt(hazirlamaSuresi) : null,
                pisirmeSuresi: pisirmeSuresi ? parseInt(pisirmeSuresi) : null,
                toplamMaliyet: totalCost,
                birimMaliyet: totalCost / parseFloat(porsiyon),
                aktif
            },
            select: { id: true, ad: true, porsiyon: true, toplamMaliyet: true, birimMaliyet: true, createdAt: true }
        });

        await Promise.all(
            materialValidations.map(async (item, index) => tx.recipeIngredient.create({
                data: {
                    recipeId: newRecipe.id,
                    materialId: parseInt(item.materialId),
                    miktar: parseFloat(item.miktar),
                    birim: item.birim || item.material.birim,
                    fire1: item.fire1 ? parseFloat(item.fire1) : 0,
                    fire2: item.fire2 ? parseFloat(item.fire2) : 0,
                    gerMiktar: item.gerMiktar ? parseFloat(item.gerMiktar) : null,
                    gerMiktarTB: item.gerMiktarTB ? parseFloat(item.gerMiktarTB) : null,
                    sonFiyat: item.material.birimFiyat || 0,
                    maliyet: item.itemCost,
                    siraNo: index + 1
                }
            }))
        );

        return { recipe: newRecipe, totalItems: materialValidations.length };
    });

    // Enhanced audit logging for production data creation
    auditLog('RECIPE_CREATED', 'New recipe created', {
        userId: req.user.userId,
        recipeId: result.recipe.id,
        recipeName: result.recipe.ad,
        productId: urunId,
        totalCost: result.recipe.toplamMaliyet,
        totalItems: result.totalItems,
        porsiyon: result.recipe.porsiyon,
        productionDataCreation: true
    });

    return res.status(201).json({
        success: true,
        message: 'Recipe created successfully',
        recipe: result.recipe,
        totalItems: result.totalItems
    });
}

/**
 * Update Recipe with Enhanced Security and Cost Recalculation
 */
async function updateRecipe(req, res) {
    // Permission check - Only production managers+ can update recipes
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to update recipes'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        requiredFields: ['id'],
        allowedFields: [
            'id', 'ad', 'aciklama', 'porsiyon', 'hazirlamaSuresi',
            'pisirmeSuresi', 'zorlukSeviyesi', 'receteKalemleri', 'aktif'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid update data',
            details: validationResult.errors
        });
    }

    const { id: recipeId, receteKalemleri, ...updateFields } = req.body;

    const currentRecipe = await prisma.recipe.findUnique({
        where: { id: parseInt(recipeId) },
        select: { id: true, ad: true, porsiyon: true, toplamMaliyet: true, urun: { select: { ad: true, kod: true } } }
    });

    if (!currentRecipe) {
        return res.status(404).json({ error: 'Recipe not found' });
    }

    const result = await prisma.$transaction(async (tx) => {
        let updatedCost = null;
        if (receteKalemleri && Array.isArray(receteKalemleri)) {
            await tx.recipeIngredient.deleteMany({ where: { recipeId: parseInt(recipeId) } });

            let totalCost = 0;
            const materialValidations = await Promise.all(
                receteKalemleri.map(async (item) => {
                    const material = await tx.material.findUnique({ where: { id: parseInt(item.materialId) }, select: { id: true, ad: true, birimFiyat: true, aktif: true, birim: true } });
                    if (!material || !material.aktif) throw new Error(`Invalid or inactive material: ${item.materialId}`);
                    const itemCost = (material.birimFiyat || 0) * parseFloat(item.miktar);
                    totalCost += itemCost;
                    return { ...item, material, itemCost };
                })
            );

            await Promise.all(
                materialValidations.map(async (item, index) => tx.recipeIngredient.create({
                    data: {
                        recipeId: parseInt(recipeId),
                        materialId: parseInt(item.materialId),
                        miktar: parseFloat(item.miktar),
                        birim: item.birim || item.material.birim,
                        sonFiyat: item.material.birimFiyat || 0,
                        maliyet: item.itemCost,
                        siraNo: index + 1
                    }
                }))
            );

            updatedCost = totalCost;
        }

        const updatedRecipe = await tx.recipe.update({
            where: { id: parseInt(recipeId) },
            data: {
                ...updateFields,
                ...(updatedCost !== null && { toplamMaliyet: updatedCost, birimMaliyet: updatedCost / (updateFields.porsiyon ? parseFloat(updateFields.porsiyon) : currentRecipe.porsiyon) })
            },
            select: { id: true, ad: true, porsiyon: true, toplamMaliyet: true, birimMaliyet: true, updatedAt: true }
        });

        return { updatedRecipe, itemsUpdated: !!receteKalemleri };
    });

    // Enhanced audit logging
    auditLog('RECIPE_UPDATED', 'Recipe updated', {
        userId: req.user.userId,
        recipeId: parseInt(recipeId),
        recipeName: result.updatedRecipe.ad,
        productName: currentRecipe.urun.ad,
        oldCost: currentRecipe.toplamMaliyet,
        newCost: result.updatedRecipe.toplamMaliyet,
        itemsUpdated: !!receteKalemleri,
        productionDataModification: true
    });

    return res.status(200).json({
        success: true,
        message: 'Recipe updated successfully',
        recipe: result.updatedRecipe
    });
}

/**
 * Delete Recipe with Enhanced Security
 */
async function deleteRecipe(req, res) {
    // Permission check - Only administrators can delete recipes
    if (req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Insufficient permissions to delete recipes'
        });
    }

    const { id: recipeId } = req.body;

    if (!recipeId) {
        return res.status(400).json({
            error: 'Recipe ID is required'
        });
    }

    // Get recipe details for validation
    const recipeToDelete = await prisma.recipe.findUnique({
        where: { id: parseInt(recipeId) },
        select: {
            id: true,
            ad: true,
            aktif: true,
            deletedAt: true,
            urun: {
                select: {
                    ad: true,
                    kod: true
                }
            }
        }
    });

    if (!recipeToDelete || recipeToDelete.deletedAt) {
        return res.status(404).json({
            error: 'Recipe not found'
        });
    }

    // Business rule checks - Check if recipe is used in active production
    const productionUsage = await prisma.siparis.count({
        where: {
            // Active production-like statuses according to schema
            durum: { in: ['HAZIRLLANACAK', 'HAZIRLANDI'] },
            // Relation name in schema is `kalemler`, not `siparisKalemleri`
            kalemler: {
                some: {
                    urun: {
                        receteler: {
                            some: {
                                id: parseInt(recipeId),
                                aktif: true
                            }
                        }
                    }
                }
            }
        }
    });

    if (productionUsage > 0) {
        return res.status(400).json({
            error: 'Cannot delete recipes that are used in active production orders. Consider deactivating instead.'
        });
    }

    // Soft delete (deactivate) instead of hard delete for production records
    const result = await prisma.$transaction(async (tx) => {
        const deactivatedRecipe = await tx.recipe.update({
            where: { id: parseInt(recipeId) },
            data: {
                aktif: false,
                updatedAt: new Date(),
                deletedAt: new Date(),
                deletedBy: String(req.user?.personelId || req.user?.id || req.user?.userId || ''),
                deleteReason: 'Yönetici silme işlemi'
            }
        });

        return deactivatedRecipe;
    });

    auditLog('RECIPE_DELETED', 'Recipe deleted (soft delete)', {
        userId: req.user.userId,
        recipeId: parseInt(recipeId),
        recipeName: recipeToDelete.ad,
        productName: recipeToDelete.urun.ad,
        productionDataDeletion: true
    });

    return res.status(200).json({
        success: true,
        message: 'Recipe deactivated successfully'
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(recipesHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_RECIPES,

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_PRODUCTION (Production Staff+)
        // POST: CREATE_RECIPES (Manager+)
        // PUT: UPDATE_RECIPES (Manager+)
        // DELETE: DELETE_RECIPES (Admin+)

        // Input Validation Configuration
        allowedFields: [
            'id', 'ad', 'aciklama', 'urunId', 'porsiyon', 'hazirlamaSuresi',
            'pisirmeSuresi', 'zorlukSeviyesi', 'receteKalemleri', 'aktif',
            'page', 'limit', 'search', 'includeCosts', 'kategori', 'sortBy', 'sortOrder'
        ],
        requiredFields: {
            POST: ['ad', 'porsiyon', 'receteKalemleri'],
            PUT: ['id'],
            DELETE: ['id']
        },

        // Security Options for Production Data
        preventSQLInjection: true,
        enableAuditLogging: true,
        productionDataAccess: true, // Mark as production-sensitive data
        sensitiveDataAccess: true // Cost data is sensitive
    }
);