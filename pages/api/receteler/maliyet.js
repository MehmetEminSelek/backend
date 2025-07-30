/**
 * =============================================
 * SECURED RECIPE COST CALCULATION API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../lib/audit-logger.js';
import { validateInput } from '../../../lib/validation.js';

/**
 * Recipe Cost Calculation API Handler with Full Security Integration
 */
async function recipeCostHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getRecipeCost(req, res);
            case 'POST':
                return await calculateRecipeCost(req, res);
            case 'PUT':
                return await recalculateAllRecipeCosts(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PUT']
                });
        }
    } catch (error) {
        console.error('Recipe Cost API Error:', error);

        auditLog('RECIPE_COST_API_ERROR', 'Recipe cost API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Recipe cost operation failed',
            code: 'RECIPE_COST_ERROR'
        });
    }
}

/**
 * Get Recipe Cost Analysis with Enhanced Security
 */
async function getRecipeCost(req, res) {
    // Permission check - Recipe costs are highly sensitive financial data
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to view recipe cost data'
        });
    }

    const {
        recipeId,
        includeBreakdown = false,
        includeMarginAnalysis = false,
        includeHistoricalCosts = false
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: ['recipeId', 'includeBreakdown', 'includeMarginAnalysis', 'includeHistoricalCosts'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid query parameters',
            details: validationResult.errors
        });
    }

    // Advanced analysis requires administrator permissions
    if ((includeMarginAnalysis === 'true' || includeHistoricalCosts === 'true') && req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Advanced cost analysis requires administrator permissions'
        });
    }

    if (!recipeId) {
        return res.status(400).json({
            error: 'Recipe ID is required'
        });
    }

    console.log('GET /api/receteler/maliyet request received...');

    // Enhanced security transaction for cost analysis
    const costData = await req.prisma.secureTransaction(async (tx) => {
        // Get recipe with cost details
        const recipe = await tx.secureQuery('recete', 'findUnique', {
            where: { id: parseInt(recipeId) },
            select: {
                id: true,
                ad: true,
                porsiyon: true,
                toplamMaliyet: true,
                birimMaliyet: true,
                karMarji: true,
                olusturmaTarihi: true,
                guncellemeTarihi: true,

                // Product information
                urun: {
                    select: {
                        id: true,
                        ad: true,
                        kod: true,
                        guncelFiyat: true,
                        maliyetFiyat: true,
                        kategori: true
                    }
                },

                // Recipe items for breakdown
                ...(includeBreakdown === 'true' && {
                    receteKalemleri: {
                        select: {
                            id: true,
                            miktar: true,
                            birim: true,
                            birimMaliyet: true,
                            toplamMaliyet: true,
                            sira: true,

                            // Material information
                            material: {
                                select: {
                                    id: true,
                                    ad: true,
                                    kod: true,
                                    tipi: true,
                                    birim: true,
                                    birimFiyat: true,
                                    ortalamaMaliyet: true
                                }
                            }
                        },
                        orderBy: { sira: 'asc' }
                    }
                })
            }
        });

        if (!recipe) {
            throw new Error('Recipe not found');
        }

        // Calculate current cost if breakdown is requested
        let currentCostBreakdown = null;
        if (includeBreakdown === 'true') {
            let totalCurrentCost = 0;
            const itemBreakdown = recipe.receteKalemleri.map(item => {
                const currentItemCost = (item.material.birimFiyat || 0) * item.miktar;
                totalCurrentCost += currentItemCost;

                return {
                    materialId: item.material.id,
                    materialName: item.material.ad,
                    materialCode: item.material.kod,
                    materialType: item.material.tipi,
                    quantity: item.miktar,
                    unit: item.birim,
                    unitPrice: item.material.birimFiyat || 0,
                    totalCost: currentItemCost,
                    costPercentage: 0, // Will be calculated after totals
                    storedCost: item.toplamMaliyet,
                    costVariance: currentItemCost - (item.toplamMaliyet || 0)
                };
            });

            // Calculate percentages
            itemBreakdown.forEach(item => {
                item.costPercentage = totalCurrentCost > 0 ? (item.totalCost / totalCurrentCost) * 100 : 0;
            });

            currentCostBreakdown = {
                totalCost: totalCurrentCost,
                unitCost: totalCurrentCost / recipe.porsiyon,
                storedTotalCost: recipe.toplamMaliyet,
                costVariance: totalCurrentCost - (recipe.toplamMaliyet || 0),
                items: itemBreakdown
            };
        }

        // Margin analysis for administrators
        let marginAnalysis = null;
        if (includeMarginAnalysis === 'true' && req.user.roleLevel >= 80) {
            const sellingPrice = recipe.urun.guncelFiyat || 0;
            const currentCost = currentCostBreakdown ? currentCostBreakdown.unitCost : recipe.birimMaliyet;

            marginAnalysis = {
                sellingPrice,
                unitCost: currentCost,
                grossProfit: sellingPrice - currentCost,
                marginPercentage: sellingPrice > 0 ? ((sellingPrice - currentCost) / sellingPrice) * 100 : 0,
                markupPercentage: currentCost > 0 ? ((sellingPrice - currentCost) / currentCost) * 100 : 0,
                breakEvenQuantity: currentCost > 0 ? Math.ceil(1000 / (sellingPrice - currentCost)) : null, // Break even for 1000 TL fixed cost
                profitabilityRating: sellingPrice > currentCost * 1.3 ? 'HIGH' :
                    sellingPrice > currentCost * 1.1 ? 'MEDIUM' : 'LOW'
            };
        }

        // Historical cost trends for administrators
        let historicalCosts = null;
        if (includeHistoricalCosts === 'true' && req.user.roleLevel >= 80) {
            // Get material price history for last 6 months
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            // Simplified historical cost calculation
            historicalCosts = {
                dataAvailable: false,
                note: 'Historical cost tracking requires price history implementation',
                currentTrend: 'STABLE', // This would be calculated from actual price history
                volatilityScore: 'LOW'
            };
        }

        return {
            recipe: {
                id: recipe.id,
                name: recipe.ad,
                portion: recipe.porsiyon,
                storedTotalCost: recipe.toplamMaliyet,
                storedUnitCost: recipe.birimMaliyet,
                marginPercent: recipe.karMarji,
                lastUpdated: recipe.guncellemeTarihi,
                product: recipe.urun
            },
            currentCostBreakdown,
            marginAnalysis,
            historicalCosts
        };
    });

    // Enhanced audit logging for sensitive cost data access
    auditLog('RECIPE_COST_VIEW', 'Recipe cost data accessed', {
        userId: req.user.userId,
        recipeId: parseInt(recipeId),
        recipeName: costData.recipe.name,
        includeBreakdown: includeBreakdown === 'true',
        includeMarginAnalysis: includeMarginAnalysis === 'true',
        includeHistoricalCosts: includeHistoricalCosts === 'true',
        currentCost: costData.currentCostBreakdown?.totalCost,
        sensitiveOperation: true,
        financialDataAccess: true
    });

    return res.status(200).json({
        success: true,
        message: 'Recipe cost analysis retrieved successfully',
        data: costData,
        metadata: {
            generatedAt: new Date(),
            userRole: req.user.rol,
            accessLevel: req.user.roleLevel,
            analysisLevel: req.user.roleLevel >= 80 ? 'FULL' : 'BASIC'
        }
    });
}

/**
 * Calculate Recipe Cost with Real-time Material Prices
 */
async function calculateRecipeCost(req, res) {
    // Permission check - Only managers+ can trigger cost calculations
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to calculate recipe costs'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        allowedFields: ['recipeId', 'recipeItems', 'portion', 'updateStored'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid calculation data',
            details: validationResult.errors
        });
    }

    const {
        recipeId,
        recipeItems, // Array of {materialId, quantity, unit}
        portion = 1,
        updateStored = false
    } = req.body;

    // Either recipeId or recipeItems must be provided
    if (!recipeId && (!recipeItems || !Array.isArray(recipeItems))) {
        return res.status(400).json({
            error: 'Either recipeId or recipeItems array is required'
        });
    }

    // Enhanced transaction for cost calculation
    const result = await req.prisma.secureTransaction(async (tx) => {
        let itemsToCalculate = [];

        if (recipeId) {
            // Get existing recipe items
            const recipe = await tx.secureQuery('recete', 'findUnique', {
                where: { id: parseInt(recipeId) },
                select: {
                    id: true,
                    ad: true,
                    porsiyon: true,
                    receteKalemleri: {
                        select: {
                            materialId: true,
                            miktar: true,
                            birim: true
                        }
                    }
                }
            });

            if (!recipe) {
                throw new Error('Recipe not found');
            }

            itemsToCalculate = recipe.receteKalemleri.map(item => ({
                materialId: item.materialId,
                quantity: item.miktar,
                unit: item.birim
            }));
        } else {
            itemsToCalculate = recipeItems;
        }

        // Calculate costs for each item
        let totalCost = 0;
        const calculationBreakdown = await Promise.all(
            itemsToCalculate.map(async (item) => {
                const material = await tx.secureQuery('material', 'findUnique', {
                    where: { id: parseInt(item.materialId) },
                    select: {
                        id: true,
                        ad: true,
                        kod: true,
                        tipi: true,
                        birim: true,
                        birimFiyat: true,
                        ortalamaMaliyet: true,
                        sonAlisFiyati: true,
                        aktif: true
                    }
                });

                if (!material) {
                    throw new Error(`Material with ID ${item.materialId} not found`);
                }

                if (!material.aktif) {
                    throw new Error(`Material ${material.ad} is inactive`);
                }

                // Use the most appropriate price
                const effectivePrice = material.birimFiyat || material.ortalamaMaliyet || material.sonAlisFiyati || 0;
                const itemTotalCost = effectivePrice * parseFloat(item.quantity);
                totalCost += itemTotalCost;

                return {
                    materialId: material.id,
                    materialName: material.ad,
                    materialCode: material.kod,
                    materialType: material.tipi,
                    quantity: parseFloat(item.quantity),
                    unit: item.unit || material.birim,
                    unitPrice: effectivePrice,
                    totalCost: itemTotalCost,
                    priceSource: material.birimFiyat ? 'CURRENT' :
                        material.ortalamaMaliyet ? 'AVERAGE' :
                            material.sonAlisFiyati ? 'LAST_PURCHASE' : 'DEFAULT'
                };
            })
        );

        const unitCost = totalCost / parseInt(portion);

        // Update stored costs if requested and user has permission
        let updatedRecipe = null;
        if (updateStored && recipeId && req.user.roleLevel >= 70) {
            updatedRecipe = await tx.secureQuery('recete', 'update', {
                where: { id: parseInt(recipeId) },
                data: {
                    toplamMaliyet: totalCost,
                    birimMaliyet: unitCost,
                    guncellemeTarihi: new Date(),
                    guncelleyenKullanici: req.user.userId
                }
            }, 'RECIPE_COST_UPDATED');

            // Update individual recipe items
            await Promise.all(
                calculationBreakdown.map(async (item) => {
                    return await tx.secureQuery('receteKalem', 'updateMany', {
                        where: {
                            receteId: parseInt(recipeId),
                            materialId: item.materialId
                        },
                        data: {
                            birimMaliyet: item.unitPrice,
                            toplamMaliyet: item.totalCost
                        }
                    }, 'RECIPE_ITEM_COST_UPDATED');
                })
            );
        }

        return {
            calculation: {
                totalCost,
                unitCost,
                portion: parseInt(portion),
                calculatedAt: new Date(),
                breakdown: calculationBreakdown
            },
            updatedRecipe: updatedRecipe ? {
                id: updatedRecipe.id,
                totalCost: updatedRecipe.toplamMaliyet,
                unitCost: updatedRecipe.birimMaliyet,
                updated: true
            } : null
        };
    });

    // Enhanced audit logging for cost calculation
    auditLog('RECIPE_COST_CALCULATED', 'Recipe cost calculated', {
        userId: req.user.userId,
        recipeId: recipeId ? parseInt(recipeId) : null,
        totalCost: result.calculation.totalCost,
        unitCost: result.calculation.unitCost,
        itemCount: result.calculation.breakdown.length,
        storedUpdated: updateStored && !!result.updatedRecipe,
        calculationType: recipeId ? 'EXISTING_RECIPE' : 'CUSTOM_ITEMS',
        sensitiveOperation: true,
        financialDataAccess: true
    });

    return res.status(200).json({
        success: true,
        message: updateStored && result.updatedRecipe ?
            'Recipe cost calculated and stored costs updated' :
            'Recipe cost calculated successfully',
        data: result,
        metadata: {
            calculatedAt: new Date(),
            userRole: req.user.rol,
            updatePermission: req.user.roleLevel >= 70
        }
    });
}

/**
 * Recalculate All Recipe Costs (Bulk Operation)
 */
async function recalculateAllRecipeCosts(req, res) {
    // Permission check - Only administrators can perform bulk recalculation
    if (req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Insufficient permissions for bulk cost recalculation'
        });
    }

    const {
        recipeIds,
        onlyActive = true,
        includeStatistics = true
    } = req.body;

    // Input validation
    const validationResult = validateInput(req.body, {
        allowedFields: ['recipeIds', 'onlyActive', 'includeStatistics'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid bulk recalculation data',
            details: validationResult.errors
        });
    }

    // Enhanced transaction for bulk recalculation
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Build where clause
        const whereClause = {};
        if (recipeIds && Array.isArray(recipeIds)) {
            whereClause.id = { in: recipeIds.map(id => parseInt(id)) };
        }
        if (onlyActive) {
            whereClause.aktif = true;
        }

        // Get all recipes to recalculate
        const recipes = await tx.secureQuery('recete', 'findMany', {
            where: whereClause,
            select: {
                id: true,
                ad: true,
                porsiyon: true,
                toplamMaliyet: true,
                receteKalemleri: {
                    select: {
                        materialId: true,
                        miktar: true,
                        material: {
                            select: {
                                birimFiyat: true,
                                ortalamaMaliyet: true,
                                aktif: true
                            }
                        }
                    }
                }
            }
        });

        const recalculationResults = [];
        let successCount = 0;
        let errorCount = 0;
        let totalCostChange = 0;

        for (const recipe of recipes) {
            try {
                // Calculate new cost
                let newTotalCost = 0;
                for (const item of recipe.receteKalemleri) {
                    if (!item.material.aktif) continue;

                    const effectivePrice = item.material.birimFiyat || item.material.ortalamaMaliyet || 0;
                    newTotalCost += effectivePrice * item.miktar;
                }

                const newUnitCost = newTotalCost / recipe.porsiyon;
                const costChange = newTotalCost - (recipe.toplamMaliyet || 0);
                totalCostChange += costChange;

                // Update recipe
                await tx.secureQuery('recete', 'update', {
                    where: { id: recipe.id },
                    data: {
                        toplamMaliyet: newTotalCost,
                        birimMaliyet: newUnitCost,
                        guncellemeTarihi: new Date(),
                        guncelleyenKullanici: req.user.userId
                    }
                }, 'RECIPE_BULK_COST_UPDATED');

                recalculationResults.push({
                    recipeId: recipe.id,
                    recipeName: recipe.ad,
                    oldCost: recipe.toplamMaliyet || 0,
                    newCost: newTotalCost,
                    costChange,
                    success: true
                });

                successCount++;
            } catch (error) {
                recalculationResults.push({
                    recipeId: recipe.id,
                    recipeName: recipe.ad,
                    error: error.message,
                    success: false
                });

                errorCount++;
            }
        }

        const statistics = includeStatistics ? {
            totalRecipes: recipes.length,
            successfulUpdates: successCount,
            failedUpdates: errorCount,
            totalCostChange,
            averageCostChange: successCount > 0 ? totalCostChange / successCount : 0,
            significantChanges: recalculationResults.filter(r => r.success && Math.abs(r.costChange) > 10).length
        } : null;

        return {
            results: recalculationResults,
            statistics
        };
    });

    // Enhanced audit logging for bulk operation
    auditLog('RECIPE_BULK_COST_RECALCULATED', 'Bulk recipe cost recalculation', {
        userId: req.user.userId,
        totalRecipes: result.statistics?.totalRecipes || 0,
        successfulUpdates: result.statistics?.successfulUpdates || 0,
        failedUpdates: result.statistics?.failedUpdates || 0,
        totalCostChange: result.statistics?.totalCostChange || 0,
        bulkOperation: true,
        sensitiveOperation: true,
        financialDataAccess: true
    });

    return res.status(200).json({
        success: true,
        message: `Bulk recalculation completed. ${result.statistics?.successfulUpdates || 0} recipes updated, ${result.statistics?.failedUpdates || 0} errors.`,
        data: result,
        metadata: {
            completedAt: new Date(),
            userRole: req.user.rol,
            bulkOperation: true
        }
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(recipeCostHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_FINANCIAL, // Financial data access permission

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_FINANCIAL (Manager+)
        // POST: CALCULATE_COSTS (Manager+)
        // PUT: BULK_COST_OPERATIONS (Admin+)

        // Input Validation Configuration
        allowedFields: [
            'recipeId', 'includeBreakdown', 'includeMarginAnalysis', 'includeHistoricalCosts',
            'recipeItems', 'portion', 'updateStored', 'recipeIds', 'onlyActive', 'includeStatistics'
        ],
        requiredFields: {},

        // Security Options for Financial Data
        preventSQLInjection: true,
        enableAuditLogging: true,
        sensitiveDataAccess: true, // Mark as sensitive financial data
        financialDataAccess: true, // Special flag for financial calculations
        productionDataAccess: true // Also production-sensitive
    }
); 