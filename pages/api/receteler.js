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
    if (req.user.roleLevel < 50) {
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
    const recipeData = await req.prisma.secureTransaction(async (tx) => {
        // Build where clause for recipes
        const whereClause = {};

        // Status filtering
        if (aktif !== undefined) {
            whereClause.aktif = aktif === 'true';
        }

        // Product filtering
        if (urunId) {
            whereClause.urunId = parseInt(urunId);
        }

        // Category filtering through product
        if (kategori) {
            whereClause.urun = {
                kategori: { contains: kategori, mode: 'insensitive' }
            };
        }

        // Search filtering
        if (search) {
            whereClause.OR = [
                { ad: { contains: search, mode: 'insensitive' } },
                { aciklama: { contains: search, mode: 'insensitive' } },
                {
                    urun: {
                        ad: { contains: search, mode: 'insensitive' }
                    }
                }
            ];
        }

        // Pagination and limits
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 per page
        const skip = (pageNum - 1) * limitNum;

        // Sorting validation
        const validSortFields = ['ad', 'olusturmaTarihi', 'guncellemeTarihi', 'toplamMaliyet'];
        const validSortOrders = ['asc', 'desc'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'ad';
        const sortDirection = validSortOrders.includes(sortOrder) ? sortOrder : 'asc';

        // Get recipes with security filtering
        const [recipes, totalCount] = await Promise.all([
            tx.secureQuery('recete', 'findMany', {
                where: whereClause,
                select: {
                    id: true,
                    ad: true,
                    aciklama: true,
                    porsiyon: true,
                    hazirlamaSuresi: true,
                    pisirmeSuresi: true,
                    zorlukSeviyesi: true,
                    aktif: true,
                    olusturmaTarihi: true,
                    guncellemeTarihi: true,

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

                    // Recipe items with material info
                    receteKalemleri: {
                        select: {
                            id: true,
                            miktar: true,
                            birim: true,
                            aciklama: true,
                            sira: true,

                            // Material information
                            material: {
                                select: {
                                    id: true,
                                    ad: true,
                                    kod: true,
                                    tipi: true,
                                    birim: true,

                                    // Cost data only for managers+
                                    ...(req.user.roleLevel >= 70 && includeCosts === 'true' && {
                                        birimFiyat: true,
                                        ortalamaMaliyet: true
                                    })
                                }
                            }
                        },
                        orderBy: { sira: 'asc' }
                    },

                    // Cost information only for managers+
                    ...(req.user.roleLevel >= 70 && includeCosts === 'true' && {
                        toplamMaliyet: true,
                        birimMaliyet: true,
                        karMarji: true,
                        guncellemeTarihi: true
                    }),

                    // Creator information for supervisors+
                    ...(req.user.roleLevel >= 60 && {
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
            tx.secureQuery('recete', 'count', {
                where: whereClause
            })
        ]);

        // Calculate recipe statistics (for managers+)
        let recipeStats = null;
        if (req.user.roleLevel >= 70 && includeCosts === 'true') {
            recipeStats = await tx.secureQuery('recete', 'aggregate', {
                where: { ...whereClause, aktif: true },
                _count: { id: true },
                _avg: {
                    toplamMaliyet: true,
                    birimMaliyet: true,
                    karMarji: true
                },
                _min: {
                    toplamMaliyet: true
                },
                _max: {
                    toplamMaliyet: true
                }
            });
        }

        return {
            recipes,
            totalCount,
            recipeStats
        };
    });

    // Enhanced audit logging for production data access
    auditLog('RECIPES_VIEW', 'Recipes accessed', {
        userId: req.user.userId,
        totalRecipes: recipeData.totalCount,
        page: pageNum,
        limit: limitNum,
        includeCosts: includeCosts === 'true',
        filters: { search, urunId, aktif, kategori },
        roleLevel: req.user.roleLevel,
        productionDataAccess: true
    });

    return res.status(200).json({
        success: true,
        message: 'Recipes retrieved successfully',
        recipes: recipeData.recipes,
        pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(recipeData.totalCount / limitNum),
            totalItems: recipeData.totalCount,
            itemsPerPage: limitNum
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
        requiredFields: ['ad', 'urunId', 'porsiyon', 'receteKalemleri'],
        allowedFields: [
            'ad', 'aciklama', 'urunId', 'porsiyon', 'hazirlamaSuresi',
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
        ad, aciklama, urunId, porsiyon, hazirlamaSuresi, pisirmeSuresi,
        zorlukSeviyesi, receteKalemleri, aktif = true
    } = req.body;

    // Business logic validation
    if (porsiyon <= 0) {
        return res.status(400).json({
            error: 'Portion size must be positive'
        });
    }

    if (!Array.isArray(receteKalemleri) || receteKalemleri.length === 0) {
        return res.status(400).json({
            error: 'Recipe must contain at least one ingredient'
        });
    }

    // Validate recipe items
    for (const item of receteKalemleri) {
        if (!item.materialId || !item.miktar || item.miktar <= 0) {
            return res.status(400).json({
                error: 'All recipe items must have valid material and positive quantity'
            });
        }
    }

    // Enhanced transaction for recipe creation
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
            throw new Error('Cannot create recipe for inactive product');
        }

        // Check for existing recipe for this product
        const existingRecipe = await tx.secureQuery('recete', 'findFirst', {
            where: {
                urunId: parseInt(urunId),
                aktif: true
            }
        });

        if (existingRecipe) {
            throw new Error('Active recipe already exists for this product');
        }

        // Verify all materials exist and calculate total cost
        let totalCost = 0;
        const materialValidations = await Promise.all(
            receteKalemleri.map(async (item) => {
                const material = await tx.secureQuery('material', 'findUnique', {
                    where: { id: parseInt(item.materialId) },
                    select: {
                        id: true,
                        ad: true,
                        kod: true,
                        birim: true,
                        birimFiyat: true,
                        aktif: true
                    }
                });

                if (!material) {
                    throw new Error(`Material with ID ${item.materialId} not found`);
                }

                if (!material.aktif) {
                    throw new Error(`Material ${material.ad} is inactive`);
                }

                const itemCost = (material.birimFiyat || 0) * parseFloat(item.miktar);
                totalCost += itemCost;

                return {
                    ...item,
                    material,
                    itemCost
                };
            })
        );

        // Create recipe
        const newRecipe = await tx.secureQuery('recete', 'create', {
            data: {
                ad,
                aciklama: aciklama || '',
                urunId: parseInt(urunId),
                porsiyon: parseInt(porsiyon),
                hazirlamaSuresi: hazirlamaSuresi ? parseInt(hazirlamaSuresi) : null,
                pisirmeSuresi: pisirmeSuresi ? parseInt(pisirmeSuresi) : null,
                zorlukSeviyesi: zorlukSeviyesi || 'ORTA',
                toplamMaliyet: totalCost,
                birimMaliyet: totalCost / parseInt(porsiyon),
                aktif,
                olusturmaTarihi: new Date(),
                olusturanKullanici: req.user.userId
            },
            select: {
                id: true,
                ad: true,
                porsiyon: true,
                toplamMaliyet: true,
                birimMaliyet: true,
                olusturmaTarihi: true
            }
        }, 'RECIPE_CREATED');

        // Create recipe items
        const recipeItems = await Promise.all(
            materialValidations.map(async (item, index) => {
                return await tx.secureQuery('receteKalem', 'create', {
                    data: {
                        receteId: newRecipe.id,
                        materialId: parseInt(item.materialId),
                        miktar: parseFloat(item.miktar),
                        birim: item.birim || item.material.birim,
                        aciklama: item.aciklama || '',
                        sira: index + 1,
                        birimMaliyet: item.material.birimFiyat || 0,
                        toplamMaliyet: item.itemCost
                    }
                }, 'RECIPE_ITEM_CREATED');
            })
        );

        return {
            recipe: newRecipe,
            items: recipeItems,
            totalItems: recipeItems.length
        };
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

    // Get current recipe
    const currentRecipe = await req.prisma.secureQuery('recete', 'findUnique', {
        where: { id: parseInt(recipeId) },
        select: {
            id: true,
            ad: true,
            porsiyon: true,
            toplamMaliyet: true,
            urun: {
                select: {
                    ad: true,
                    kod: true
                        }
                    }
                }
            });

    if (!currentRecipe) {
        return res.status(404).json({
            error: 'Recipe not found'
        });
    }

    // Update recipe with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        let updatedCost = null;

        // If recipe items are being updated, recalculate costs
        if (receteKalemleri && Array.isArray(receteKalemleri)) {
            // Delete existing items
            await tx.secureQuery('receteKalem', 'deleteMany', {
                where: { receteId: parseInt(recipeId) }
            }, 'RECIPE_ITEMS_DELETED');

            // Calculate new total cost
            let totalCost = 0;
            const materialValidations = await Promise.all(
                receteKalemleri.map(async (item) => {
                    const material = await tx.secureQuery('material', 'findUnique', {
                        where: { id: parseInt(item.materialId) },
                        select: {
                            id: true,
                            ad: true,
                            birimFiyat: true,
                            aktif: true
                        }
                    });

                    if (!material || !material.aktif) {
                        throw new Error(`Invalid or inactive material: ${item.materialId}`);
                    }

                    const itemCost = (material.birimFiyat || 0) * parseFloat(item.miktar);
                    totalCost += itemCost;

                    return {
                        ...item,
                        material,
                        itemCost
                    };
                })
            );

            // Create new items
            await Promise.all(
                materialValidations.map(async (item, index) => {
                    return await tx.secureQuery('receteKalem', 'create', {
                        data: {
                            receteId: parseInt(recipeId),
                            materialId: parseInt(item.materialId),
                            miktar: parseFloat(item.miktar),
                            birim: item.birim || item.material.birim,
                            aciklama: item.aciklama || '',
                            sira: index + 1,
                            birimMaliyet: item.material.birimFiyat || 0,
                            toplamMaliyet: item.itemCost
                        }
                    }, 'RECIPE_ITEM_CREATED');
                })
            );

            updatedCost = {
                toplamMaliyet: totalCost,
                birimMaliyet: totalCost / (updateFields.porsiyon || currentRecipe.porsiyon)
            };
        }

        // Update recipe
        const updatedRecipe = await tx.secureQuery('recete', 'update', {
            where: { id: parseInt(recipeId) },
            data: {
                ...updateFields,
                ...updatedCost,
                guncellemeTarihi: new Date(),
                guncelleyenKullanici: req.user.userId
            },
            select: {
                id: true,
                ad: true,
                porsiyon: true,
                toplamMaliyet: true,
                birimMaliyet: true,
                guncellemeTarihi: true
            }
        }, 'RECIPE_UPDATED');

        return updatedRecipe;
    });

    // Enhanced audit logging
    auditLog('RECIPE_UPDATED', 'Recipe updated', {
        userId: req.user.userId,
        recipeId: parseInt(recipeId),
        recipeName: result.ad,
        productName: currentRecipe.urun.ad,
        oldCost: currentRecipe.toplamMaliyet,
        newCost: result.toplamMaliyet,
        itemsUpdated: !!receteKalemleri,
        productionDataModification: true
    });

        return res.status(200).json({
        success: true,
        message: 'Recipe updated successfully',
        recipe: result
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
    const recipeToDelete = await req.prisma.secureQuery('recete', 'findUnique', {
        where: { id: parseInt(recipeId) },
        select: {
            id: true,
            ad: true,
            aktif: true,
            urun: {
                select: {
                    ad: true,
                    kod: true
                }
            }
        }
    });

    if (!recipeToDelete) {
        return res.status(404).json({
            error: 'Recipe not found'
        });
    }

    // Business rule checks - Check if recipe is used in active production
    const productionUsage = await req.prisma.secureQuery('siparis', 'count', {
        where: {
            durum: { in: ['ONAYLANDI', 'HAZIRLANIYOR'] },
            siparisKalemleri: {
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
    const result = await req.prisma.secureTransaction(async (tx) => {
        const deactivatedRecipe = await tx.secureQuery('recete', 'update', {
            where: { id: parseInt(recipeId) },
            data: {
                aktif: false,
                silinmeTarihi: new Date(),
                silenKullanici: req.user.userId,
                silmeSebebi: 'Yönetici silme işlemi'
            }
        }, 'RECIPE_DEACTIVATED');

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
        permission: PERMISSIONS.VIEW_PRODUCTION, // Production data access permission

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
            POST: ['ad', 'urunId', 'porsiyon', 'receteKalemleri'],
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