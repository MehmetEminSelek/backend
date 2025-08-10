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
import prisma from '../../../lib/prisma.js';
import { getUrunFiyati } from '../../../lib/fiyat-helper.js';

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

        auditLog('RECIPE_COST_ERROR', 'Recipe cost API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message,
            req
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
        return res.status(403).json({ error: 'Insufficient permissions to view recipe cost data' });
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
        return res.status(400).json({ error: 'Invalid query parameters', details: validationResult.errors });
    }

    if (!recipeId) {
        return res.status(400).json({ error: 'Recipe ID is required' });
    }

    // Enhanced security transaction for cost analysis
    const costData = await prisma.$transaction(async (tx) => {
        // Get recipe with cost details
        const recipe = await tx.recipe.findUnique({
            where: { id: parseInt(recipeId) },
            select: {
                id: true,
                ad: true,
                porsiyon: true,
                toplamMaliyet: true,
                birimMaliyet: true,
                createdAt: true,
                updatedAt: true,
                urun: {
                    select: {
                        id: true,
                        ad: true,
                        kod: true,
                        maliyetFiyati: true,
                        kategori: { select: { ad: true } }
                    }
                },
                ...(includeBreakdown === 'true' && {
                    icerikelek: {
                        select: {
                            id: true,
                            miktar: true,
                            birim: true,
                            sonFiyat: true,
                            maliyet: true,
                            siraNo: true,
                            material: {
                                select: {
                                    id: true,
                                    ad: true,
                                    kod: true,
                                    tipi: true,
                                    birim: true,
                                    birimFiyat: true
                                }
                            }
                        },
                        orderBy: { siraNo: 'asc' }
                    }
                })
            }
        });

        if (!recipe) {
            throw new Error('Recipe not found');
        }

        // Build current cost breakdown if requested
        let currentCostBreakdown = null;
        if (includeBreakdown === 'true') {
            const list = Array.isArray(recipe.icerikelek) ? recipe.icerikelek : [];
            let totalCurrentCost = 0;
            const items = await Promise.all(list.map(async (item) => {
                let unitPrice = item?.material?.birimFiyat || 0;
                const miktar = item?.miktar ? Number(item.miktar) : 0;

                // Fallback: aynı isimli aktif ürün fiyatını kullan
                if (!unitPrice || unitPrice === 0) {
                    try {
                        const product = await prisma.urun.findFirst({
                            where: { aktif: true, ad: { equals: item?.material?.ad || '', mode: 'insensitive' } },
                            select: { id: true }
                        });
                        if (product?.id) {
                            const fiyat = await getUrunFiyati(product.id, new Date(), 'NORMAL');
                            if (fiyat?.kgFiyati) unitPrice = Number(fiyat.kgFiyati) || 0;
                        }
                    } catch { }
                }

                const totalCost = unitPrice * miktar;
                totalCurrentCost += totalCost;
                return {
                    materialId: item?.material?.id || null,
                    materialName: item?.material?.ad || null,
                    materialCode: item?.material?.kod || null,
                    materialType: item?.material?.tipi || null,
                    quantity: miktar,
                    unit: item?.birim || null,
                    unitPrice,
                    totalCost,
                    costPercentage: 0,
                    storedCost: item?.maliyet || 0,
                    costVariance: totalCost - (item?.maliyet || 0)
                };
            }));

            // Calculate percentages
            items.forEach(i => { i.costPercentage = totalCurrentCost > 0 ? (i.totalCost / totalCurrentCost) * 100 : 0; });

            currentCostBreakdown = {
                totalCost: totalCurrentCost,
                unitCost: totalCurrentCost / (recipe.porsiyon || 1),
                storedTotalCost: recipe.toplamMaliyet || 0,
                costVariance: totalCurrentCost - (recipe.toplamMaliyet || 0),
                items
            };
        }

        // Margin analysis for administrators
        let marginAnalysis = null;
        if (includeMarginAnalysis === 'true' && req.user.roleLevel >= 80) {
            let sellingPrice = 0;
            try {
                if (recipe?.urun?.id) {
                    const fiyat = await getUrunFiyati(recipe.urun.id, new Date(), 'NORMAL');
                    sellingPrice = fiyat?.kgFiyati || 0;
                }
            } catch { }
            const currentUnitCost = currentCostBreakdown ? currentCostBreakdown.unitCost : (recipe.birimMaliyet || 0);

            marginAnalysis = {
                sellingPrice,
                unitCost: currentUnitCost,
                grossProfit: sellingPrice - currentUnitCost,
                marginPercentage: sellingPrice > 0 ? ((sellingPrice - currentUnitCost) / sellingPrice) * 100 : 0,
                markupPercentage: currentUnitCost > 0 ? ((sellingPrice - currentUnitCost) / currentUnitCost) * 100 : 0
            };
        }

        // Historical costs placeholder
        let historicalCosts = null;
        if (includeHistoricalCosts === 'true' && req.user.roleLevel >= 80) {
            historicalCosts = { dataAvailable: false };
        }

        return {
            recipe: {
                id: recipe.id,
                name: recipe.ad,
                portion: recipe.porsiyon,
                storedTotalCost: recipe.toplamMaliyet,
                storedUnitCost: recipe.birimMaliyet,
                lastUpdated: recipe.updatedAt,
                product: recipe.urun
            },
            currentCostBreakdown,
            marginAnalysis,
            historicalCosts
        };
    });

    // Audit logging
    auditLog('RECIPE_COST_VIEW', 'Recipe cost data accessed', {
        userId: req.user.userId,
        recipeId: parseInt(recipeId),
        recipeName: costData.recipe.name,
        includeBreakdown: includeBreakdown === 'true',
        includeMarginAnalysis: includeMarginAnalysis === 'true',
        includeHistoricalCosts: includeHistoricalCosts === 'true',
        currentCost: costData.currentCostBreakdown?.totalCost,
        req
    });

    return res.status(200).json({
        success: true,
        message: 'Recipe cost analysis retrieved successfully',
        data: costData,
        metadata: {
            generatedAt: new Date(),
            userRole: req.user.rol
        }
    });
}

/**
 * Calculate Recipe Cost with Real-time Material Prices
 */
async function calculateRecipeCost(req, res) {
    // Permission check - Only managers+ can trigger cost calculations
    if (req.user.roleLevel < 70) {
        return res.status(403).json({ error: 'Insufficient permissions to calculate recipe costs' });
    }

    const validationResult = validateInput(req.body, {
        allowedFields: ['recipeId', 'recipeItems', 'portion', 'updateStored'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({ error: 'Invalid calculation data', details: validationResult.errors });
    }

    const { recipeId, recipeItems, portion = 1, updateStored = false } = req.body;

    if (!recipeId && (!recipeItems || !Array.isArray(recipeItems))) {
        return res.status(400).json({ error: 'Either recipeId or recipeItems array is required' });
    }

    const result = await prisma.$transaction(async (tx) => {
        let itemsToCalculate = [];

        if (recipeId) {
            const recipe = await tx.recipe.findUnique({
                where: { id: parseInt(recipeId) },
                select: {
                    id: true,
                    ad: true,
                    porsiyon: true,
                    icerikelek: { select: { materialId: true, miktar: true, birim: true } }
                }
            });
            if (!recipe) {
                // No recipe: return zero-cost calc
                return { calculation: { totalCost: 0, unitCost: 0, portion: Number(portion) || 1, calculatedAt: new Date(), breakdown: [] }, updatedRecipe: null };
            }
            itemsToCalculate = Array.isArray(recipe.icerikelek)
                ? recipe.icerikelek.map(i => ({ materialId: i.materialId, quantity: i.miktar, unit: i.birim }))
                : [];
        } else {
            itemsToCalculate = Array.isArray(recipeItems) ? recipeItems : [];
        }

        let totalCost = 0;
        const breakdown = [];
        for (const item of itemsToCalculate) {
            try {
                if (!item?.materialId) continue;
                const material = await tx.material.findUnique({
                    where: { id: parseInt(item.materialId) },
                    select: { id: true, ad: true, kod: true, tipi: true, birim: true, birimFiyat: true, aktif: true }
                });
                if (!material || !material.aktif) continue;
                let unitPrice = material.birimFiyat || 0;
                if (!unitPrice || unitPrice === 0) {
                    // Fallback: aynı isimli ürün var ise geçerli fiyatını kullan
                    try {
                        const product = await tx.urun.findFirst({
                            where: { aktif: true, ad: { equals: material.ad, mode: 'insensitive' } },
                            select: { id: true }
                        });
                        if (product?.id) {
                            const fiyat = await tx.urunFiyat.findFirst({
                                where: {
                                    urunId: product.id,
                                    aktif: true,
                                    baslangicTarihi: { lte: new Date() },
                                    OR: [{ bitisTarihi: null }, { bitisTarihi: { gte: new Date() } }]
                                },
                                orderBy: { baslangicTarihi: 'desc' },
                                select: { kgFiyati: true }
                            });
                            if (fiyat?.kgFiyati) unitPrice = Number(fiyat.kgFiyati) || 0;
                        }
                    } catch { }
                }
                const quantity = item?.quantity ? Number(item.quantity) : 0;
                const itemTotal = unitPrice * quantity;
                totalCost += itemTotal;
                breakdown.push({
                    materialId: material.id,
                    materialName: material.ad,
                    materialCode: material.kod,
                    materialType: material.tipi,
                    quantity,
                    unit: item.unit || material.birim,
                    unitPrice,
                    totalCost: itemTotal
                });
            } catch {
                // skip problematic items
            }
        }

        const unitCost = totalCost / (Number(portion) || 1);

        let updatedRecipe = null;
        if (updateStored && recipeId && req.user.roleLevel >= 70) {
            try {
                updatedRecipe = await tx.recipe.update({
                    where: { id: parseInt(recipeId) },
                    data: { toplamMaliyet: totalCost, birimMaliyet: unitCost, updatedAt: new Date() },
                    select: { id: true, toplamMaliyet: true, birimMaliyet: true }
                });

                await Promise.all(
                    breakdown.map(async (i) => tx.recipeIngredient.updateMany({
                        where: { recipeId: parseInt(recipeId), materialId: i.materialId },
                        data: { sonFiyat: i.unitPrice, maliyet: i.totalCost }
                    }))
                );
            } catch {
                // ignore update errors, still return calculation
            }
        }

        return {
            calculation: { totalCost, unitCost, portion: Number(portion) || 1, calculatedAt: new Date(), breakdown },
            updatedRecipe: updatedRecipe ? { id: updatedRecipe.id, totalCost: updatedRecipe.toplamMaliyet, unitCost: updatedRecipe.birimMaliyet, updated: true } : null
        };
    });

    auditLog('RECIPE_COST_CALCULATED', 'Recipe cost calculated', {
        userId: req.user.userId,
        recipeId: recipeId ? parseInt(recipeId) : null,
        totalCost: result.calculation.totalCost,
        unitCost: result.calculation.unitCost,
        itemCount: result.calculation.breakdown.length,
        storedUpdated: updateStored && !!result.updatedRecipe,
        calculationType: recipeId ? 'EXISTING_RECIPE' : 'CUSTOM_ITEMS',
        req
    });

    return res.status(200).json({
        success: true,
        message: updateStored && result.updatedRecipe ? 'Recipe cost calculated and stored costs updated' : 'Recipe cost calculated successfully',
        data: result
    });
}

/**
 * Recalculate All Recipe Costs (Bulk Operation)
 */
async function recalculateAllRecipeCosts(req, res) {
    if (req.user.roleLevel < 80) {
        return res.status(403).json({ error: 'Insufficient permissions for bulk cost recalculation' });
    }

    const { recipeIds, onlyActive = true } = req.body || {};
    if (recipeIds && !Array.isArray(recipeIds)) {
        return res.status(400).json({ error: 'recipeIds must be an array' });
    }

    const result = await prisma.$transaction(async (tx) => {
        const where = onlyActive ? { aktif: true } : {};
        if (recipeIds && recipeIds.length > 0) where.id = { in: recipeIds.map(id => parseInt(id)) };

        const recipes = await tx.recipe.findMany({ where, select: { id: true, porsiyon: true } });

        let updated = 0;
        for (const r of recipes) {
            const ingredients = await tx.recipeIngredient.findMany({ where: { recipeId: r.id }, select: { miktar: true, material: { select: { birimFiyat: true } } } });
            const totalCost = ingredients.reduce((sum, i) => sum + (i.material.birimFiyat || 0) * i.miktar, 0);
            const unitCost = totalCost / (r.porsiyon || 1);
            await tx.recipe.update({ where: { id: r.id }, data: { toplamMaliyet: totalCost, birimMaliyet: unitCost, updatedAt: new Date() } });
            updated += 1;
        }

        return { updated };
    });

    auditLog('BULK_UPDATE', 'Bulk recipe cost recalculation', { userId: req.user.userId, count: result.updated, req });

    return res.status(200).json({ success: true, message: 'Bulk recalculation completed', data: result });
}

export default secureAPI(
    withPrismaSecurity(recipeCostHandler),
    {
        permission: PERMISSIONS.VIEW_RECIPES,
        preventSQLInjection: true,
        enableAuditLogging: true
    }
); 