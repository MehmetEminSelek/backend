/**
 * Urunler API - SIMPLIFIED
 */

import prisma from '../../../lib/prisma.js';
import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';

export default withCorsAndAuth(async function handler(req, res) {

    console.log(`🔍 URUNLER API: ${req.method} request received`);

    try {
        switch (req.method) {
            case 'GET':
                return await getProducts(req, res);
            case 'POST':
                return await createProduct(req, res);
            case 'PUT':
                return await updateProduct(req, res);
            case 'DELETE':
                return await deleteProduct(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST', 'PUT', 'DELETE']
                });
        }
    } catch (error) {
        console.error('❌ Urunler API Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            code: 'URUNLER_ERROR',
            details: error.message
        });
    }
});

/**
 * Get Products
 */
async function getProducts(req, res) {
    const {
        page = 1,
        limit = 50,
        search,
        kategori,
        aktif
    } = req.query;

    console.log('🔍 GET Products - params:', { page, limit, search, kategori, aktif });

    // Basic pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause (exclude soft-deleted)
    const whereClause = { deletedAt: null };

    // Active status filtering
    if (aktif !== undefined) {
        whereClause.aktif = aktif === 'true';
    }

    // Category filtering
    if (kategori) {
        whereClause.kategoriId = parseInt(kategori);
    }

    // Search filtering
    if (search) {
        whereClause.OR = [
            { ad: { contains: search, mode: 'insensitive' } },
            { kod: { contains: search, mode: 'insensitive' } },
            { aciklama: { contains: search, mode: 'insensitive' } }
        ];
    }

    try {
        const [productsRaw, totalCount] = await Promise.all([
            prisma.urun.findMany({
                where: whereClause,
                select: {
                    id: true,
                    ad: true,
                    kod: true,
                    kategoriId: true,
                    kategori: { select: { id: true, ad: true, kod: true } },
                    aciklama: true,
                    birim: true,
                    mevcutStok: true,
                    minStokSeviye: true,
                    maliyetFiyati: true,
                    karMarji: true,
                    karOrani: true,
                    satisaUygun: true,
                    aktif: true,
                    createdAt: true,
                    updatedAt: true,
                    receteler: { where: { deletedAt: null }, select: { id: true, ad: true, aktif: true } },
                    fiyatlar: {
                        where: { aktif: true, deletedAt: null },
                        orderBy: { baslangicTarihi: 'desc' },
                        take: 1,
                        select: {
                            id: true,
                            kgFiyati: true,
                            birim: true,
                            fiyatTipi: true,
                            baslangicTarihi: true,
                            bitisTarihi: true
                        }
                    }
                },
                orderBy: { ad: 'asc' },
                skip,
                take: limitNum
            }),
            prisma.urun.count({ where: whereClause })
        ]);

        const products = productsRaw.map(p => ({
            ...p,
            guncelFiyat: Array.isArray(p.fiyatlar) && p.fiyatlar.length > 0 ? p.fiyatlar[0] : null,
            recipeAssigned: Array.isArray(p.receteler) && p.receteler.some(r => r.aktif),
            recipeCount: Array.isArray(p.receteler) ? p.receteler.length : 0
        }));

        console.log(`✅ Found ${products.length} products (total: ${totalCount})`);

        return res.status(200).json({
            success: true,
            total: totalCount,
            activeTotal: productsRaw.filter(p => p.aktif).length,
            products: products,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                pages: Math.ceil(totalCount / limitNum)
            }
        });

    } catch (error) {
        console.error('❌ Error fetching products:', error);
        return res.status(500).json({
            error: 'Failed to fetch products',
            details: error.message
        });
    }
}

/**
 * Create Product
 */
async function createProduct(req, res) {
    console.log('🔍 POST Create Product:', req.body);

    const {
        ad,
        kod,
        kategoriId,
        aciklama,
        birim,
        minStokSeviye,
        satisaUygun
    } = req.body;

    // Basic validation
    if (!ad || !kod) {
        return res.status(400).json({
            error: 'ad and kod are required'
        });
    }

    try {
        // Map birim to enum SatisBirimi
        const unitMap = { 'KG': 'KG', 'KILO': 'KG', 'KİLO': 'KG', 'GRAM': 'GRAM', 'GR': 'GRAM', 'G': 'GRAM', 'ADET': 'ADET', 'AD': 'ADET' };
        const normalizedBirim = (birim || 'KG').toString().toUpperCase('tr-TR');
        const birimEnum = unitMap[normalizedBirim] || 'KG';

        const newProduct = await prisma.urun.create({
            data: {
                ad,
                kod: kod.toUpperCase(),
                kategoriId: kategoriId ? parseInt(kategoriId) : null,
                aciklama: aciklama || null,
                birim: birimEnum,
                minStokSeviye: minStokSeviye ? parseFloat(minStokSeviye) : 0,
                satisaUygun: satisaUygun !== undefined ? !!satisaUygun : true,
                aktif: true
            }
        });

        console.log(`✅ Product created: ${newProduct.id}`);

        return res.status(201).json({
            success: true,
            message: 'Product created successfully',
            product: newProduct
        });

    } catch (error) {
        console.error('❌ Error creating product:', error);
        return res.status(500).json({
            error: 'Failed to create product',
            details: error.message
        });
    }
}

/**
 * Update Product
 */
async function updateProduct(req, res) {
    console.log('🔍 PUT Update Product:', req.body);

    const { id, kategoriId, kategori, ...updateData } = req.body;

    if (!id) {
        return res.status(400).json({
            error: 'Product ID is required'
        });
    }

    // Map kategori -> kategoriId if provided
    if (!kategoriId && kategori) {
        updateData.kategoriId = parseInt(kategori);
    } else if (kategoriId) {
        updateData.kategoriId = parseInt(kategoriId);
    }

    try {
        const updatedProduct = await prisma.urun.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        console.log(`✅ Product updated: ${updatedProduct.id}`);

        return res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            product: updatedProduct
        });

    } catch (error) {
        console.error('❌ Error updating product:', error);
        return res.status(500).json({
            error: 'Failed to update product',
            details: error.message
        });
    }
}

/**
 * Delete Product
 */
async function deleteProduct(req, res) {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({
            error: 'Product ID is required'
        });
    }

    try {
        // Soft delete: mark deleted fields
        await prisma.urun.update({
            where: { id: parseInt(id) },
            data: {
                aktif: false,
                deletedAt: new Date(),
                deletedBy: String(req.user?.personelId || req.user?.id || req.user?.userId || ''),
                deleteReason: 'Yönetici silme işlemi'
            }
        });

        console.log(`✅ Product deleted: ${id}`);

        return res.status(200).json({
            success: true,
            message: 'Product deleted successfully'
        });

    } catch (error) {
        console.error('❌ Error deleting product:', error);
        return res.status(500).json({
            error: 'Failed to delete product',
            details: error.message
        });
    }
}