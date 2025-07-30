/**
 * =============================================
 * SECURED PRODUCTS API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../lib/audit-logger.js';
import { validateInput } from '../../../lib/validation.js';

/**
 * Products API Handler with Full Security Integration
 */
async function productsHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
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
        console.error('Products API Error:', error);

        auditLog('PRODUCTS_API_ERROR', 'Products API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Product operation failed',
            code: 'PRODUCTS_ERROR'
        });
    }
}

/**
 * Get Products List with Advanced Filtering and Security
 */
async function getProducts(req, res) {
    const {
        page = 1,
        limit = 50,
        search,
        kategori,
        aktif,
        satisaUygun,
        ozelUrun,
        yeniUrun,
        indirimliUrun,
        minFiyat,
        maxFiyat,
        sortBy = 'ad',
        sortOrder = 'asc'
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: [
            'page', 'limit', 'search', 'kategori', 'aktif', 'satisaUygun',
            'ozelUrun', 'yeniUrun', 'indirimliUrun', 'minFiyat', 'maxFiyat',
            'sortBy', 'sortOrder'
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

    // Category filtering
    if (kategori) {
        whereClause.kategori = { contains: kategori, mode: 'insensitive' };
    }

    // Status filtering
    if (aktif !== undefined) {
        whereClause.aktif = aktif === 'true';
    }

    if (satisaUygun !== undefined) {
        whereClause.satisaUygun = satisaUygun === 'true';
    }

    if (ozelUrun !== undefined) {
        whereClause.ozelUrun = ozelUrun === 'true';
    }

    if (yeniUrun !== undefined) {
        whereClause.yeniUrun = yeniUrun === 'true';
    }

    if (indirimliUrun !== undefined) {
        whereClause.indirimliUrun = indirimliUrun === 'true';
    }

    // Price range filtering (only for higher roles)
    if ((minFiyat || maxFiyat) && req.user.roleLevel >= 60) {
        whereClause.guncelFiyat = {};
        if (minFiyat) {
            whereClause.guncelFiyat.gte = parseFloat(minFiyat);
        }
        if (maxFiyat) {
            whereClause.guncelFiyat.lte = parseFloat(maxFiyat);
        }
    }

    // Search filtering
    if (search) {
        whereClause.OR = [
            { ad: { contains: search, mode: 'insensitive' } },
            { kod: { contains: search, mode: 'insensitive' } },
            { aciklama: { contains: search, mode: 'insensitive' } },
            { kategori: { contains: search, mode: 'insensitive' } }
        ];
    }

    // Pagination and limits
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Sorting validation
    const validSortFields = ['ad', 'kod', 'kategori', 'guncelFiyat', 'olusturmaTarihi'];
    const validSortOrders = ['asc', 'desc'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'ad';
    const sortDirection = validSortOrders.includes(sortOrder) ? sortOrder : 'asc';

    // Enhanced query with security context
    const [products, totalCount] = await Promise.all([
        req.prisma.secureQuery('urun', 'findMany', {
            where: whereClause,
                    select: {
                        id: true,
                kod: true,
                ad: true,
                aciklama: true,
                kategori: true,
                birim: true,
                        aktif: true,
                satisaUygun: true,
                ozelUrun: true,
                yeniUrun: true,
                indirimliUrun: true,
                olusturmaTarihi: true,
                guncellemeTarihi: true,

                // Price and cost data only for higher roles
                ...(req.user.roleLevel >= 60 && {
                    guncelFiyat: true,
                    maliyetFiyat: true,
                    karMarji: true,
                    minStok: true,
                    maxStok: true
                }),

                // Sensitive data only for managers+
                ...(req.user.roleLevel >= 70 && {
                    tedarikciKodu: true,
                    tedarikciAdi: true,
                    alisFiyati: true
                }),

                // Stock info for inventory managers
                ...(req.user.roleLevel >= 60 && {
                    mevcutStok: true,
                    rezerveStok: true,
                    stokUyariSeviyesi: true
                })
            },
            orderBy: {
                [sortField]: sortDirection
            },
            skip,
            take: limitNum
        }),
        req.prisma.secureQuery('urun', 'count', {
            where: whereClause
        })
    ]);

    // Calculate summary statistics
    const productsSummary = await req.prisma.secureQuery('urun', 'aggregate', {
        where: whereClause,
                _count: {
            id: true
        },
        ...(req.user.roleLevel >= 60 && {
            _avg: {
                guncelFiyat: true
            },
            _sum: {
                mevcutStok: true
            }
        })
    });

    auditLog('PRODUCTS_VIEW', 'Products list accessed', {
        userId: req.user.userId,
        totalProducts: totalCount,
        page: pageNum,
        limit: limitNum,
        filters: { search, kategori, aktif, satisaUygun }
    });

        return res.status(200).json({
        success: true,
        products,
            pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalCount / limitNum),
            totalItems: totalCount,
            itemsPerPage: limitNum
        },
        summary: {
            totalProducts: productsSummary._count.id,
            ...(req.user.roleLevel >= 60 && {
                averagePrice: productsSummary._avg?.guncelFiyat || 0,
                totalStock: productsSummary._sum?.mevcutStok || 0
            })
        }
    });
}

/**
 * Create New Product with Enhanced Security and Validation
 */
async function createProduct(req, res) {
    // Permission check
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to create products'
        });
    }

    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['kod', 'ad', 'kategori', 'birim'],
        allowedFields: [
            'kod', 'ad', 'aciklama', 'kategori', 'birim', 'guncelFiyat',
            'maliyetFiyat', 'alisFiyati', 'tedarikciKodu', 'tedarikciAdi',
            'minStok', 'maxStok', 'stokUyariSeviyesi', 'aktif', 'satisaUygun',
            'ozelUrun', 'yeniUrun', 'indirimliUrun', 'notlar'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid product data',
            details: validationResult.errors
        });
    }

    const {
        kod, ad, aciklama, kategori, birim, guncelFiyat = 0, maliyetFiyat = 0,
        alisFiyati = 0, tedarikciKodu, tedarikciAdi, minStok = 0, maxStok = 0,
        stokUyariSeviyesi = 0, aktif = true, satisaUygun = true, ozelUrun = false,
        yeniUrun = false, indirimliUrun = false, notlar
    } = req.body;

    // Business logic validation
    if (kod.length < 2) {
        return res.status(400).json({
            error: 'Product code must be at least 2 characters long'
        });
    }

    if (ad.length < 2) {
        return res.status(400).json({
            error: 'Product name must be at least 2 characters long'
        });
    }

    // Price validation
    if (guncelFiyat < 0 || maliyetFiyat < 0 || alisFiyati < 0) {
        return res.status(400).json({
            error: 'Prices cannot be negative'
        });
    }

    // Stock validation
    if (minStok < 0 || maxStok < 0 || stokUyariSeviyesi < 0) {
        return res.status(400).json({
            error: 'Stock values cannot be negative'
        });
    }

    if (maxStok > 0 && minStok > maxStok) {
        return res.status(400).json({
            error: 'Minimum stock cannot be greater than maximum stock'
        });
    }

    // Enhanced transaction for product creation
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Check for existing product by code
        const existingProduct = await tx.secureQuery('urun', 'findFirst', {
            where: {
                kod: { equals: kod, mode: 'insensitive' }
            }
        });

        if (existingProduct) {
            throw new Error('Product with this code already exists');
        }

        // Calculate profit margin
        const karMarji = guncelFiyat > 0 && maliyetFiyat > 0
            ? ((guncelFiyat - maliyetFiyat) / guncelFiyat) * 100
            : 0;

        // Create product with audit trail
        const newProduct = await tx.secureQuery('urun', 'create', {
            data: {
                kod: kod.toUpperCase(),
                ad,
                aciklama: aciklama || '',
                kategori,
                birim,
                guncelFiyat: parseFloat(guncelFiyat),
                maliyetFiyat: parseFloat(maliyetFiyat),
                alisFiyati: parseFloat(alisFiyati),
                karMarji,
                tedarikciKodu: tedarikciKodu || '',
                tedarikciAdi: tedarikciAdi || '',
                minStok: parseInt(minStok),
                maxStok: parseInt(maxStok),
                stokUyariSeviyesi: parseInt(stokUyariSeviyesi),
                mevcutStok: 0, // Initial stock is 0
                rezerveStok: 0,
                aktif,
                satisaUygun,
                ozelUrun,
                yeniUrun,
                indirimliUrun,
                notlar: notlar || '',
                olusturmaTarihi: new Date(),
                olusturanKullanici: req.user.userId
            },
            select: {
                id: true,
                kod: true,
                ad: true,
                kategori: true,
                birim: true,
                guncelFiyat: true,
                aktif: true,
                olusturmaTarihi: true
            }
        }, 'PRODUCT_CREATED');

        return newProduct;
    });

    // Enhanced audit logging
    auditLog('PRODUCT_CREATED', 'New product created', {
        userId: req.user.userId,
        productId: result.id,
        productCode: result.kod,
        productName: result.ad,
        category: kategori,
        price: guncelFiyat
    });

        return res.status(201).json({
        success: true,
        message: 'Product created successfully',
        product: result
    });
}

/**
 * Update Product with Enhanced Security and Validation
 */
async function updateProduct(req, res) {
    // Permission check
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to update products'
        });
    }

    // Input validation
    const validationResult = validateInput(req.body, {
        requiredFields: ['id'],
        allowedFields: [
            'id', 'kod', 'ad', 'aciklama', 'kategori', 'birim', 'guncelFiyat',
            'maliyetFiyat', 'alisFiyati', 'tedarikciKodu', 'tedarikciAdi',
            'minStok', 'maxStok', 'stokUyariSeviyesi', 'aktif', 'satisaUygun',
            'ozelUrun', 'yeniUrun', 'indirimliUrun', 'notlar'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
            return res.status(400).json({
            error: 'Invalid update data',
            details: validationResult.errors
        });
    }

    const { id: productId, ...updateFields } = req.body;

    // Get current product for comparison
    const currentProduct = await req.prisma.secureQuery('urun', 'findUnique', {
        where: { id: parseInt(productId) },
        select: {
            id: true,
            kod: true,
            ad: true,
            guncelFiyat: true,
            maliyetFiyat: true,
            aktif: true
        }
    });

    if (!currentProduct) {
        return res.status(404).json({
            error: 'Product not found'
        });
    }

    // Price update permission check
    if ((updateFields.guncelFiyat !== undefined || updateFields.maliyetFiyat !== undefined)
        && req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to update product prices'
        });
    }

    // Prepare update data
    const updateData = {};
    const changeLog = [];

    const allowedFields = [
        'kod', 'ad', 'aciklama', 'kategori', 'birim', 'tedarikciKodu', 'tedarikciAdi',
        'minStok', 'maxStok', 'stokUyariSeviyesi', 'aktif', 'satisaUygun',
        'ozelUrun', 'yeniUrun', 'indirimliUrun', 'notlar'
    ];

    for (const field of allowedFields) {
        if (updateFields[field] !== undefined) {
            updateData[field] = updateFields[field];
            changeLog.push(`${field} updated`);
        }
    }

    // Price updates with margin recalculation
    if (updateFields.guncelFiyat !== undefined || updateFields.maliyetFiyat !== undefined) {
        const newGuncelFiyat = parseFloat(updateFields.guncelFiyat || currentProduct.guncelFiyat);
        const newMaliyetFiyat = parseFloat(updateFields.maliyetFiyat || currentProduct.maliyetFiyat);

        updateData.guncelFiyat = newGuncelFiyat;
        updateData.maliyetFiyat = newMaliyetFiyat;

        // Recalculate profit margin
        updateData.karMarji = newGuncelFiyat > 0 && newMaliyetFiyat > 0
            ? ((newGuncelFiyat - newMaliyetFiyat) / newGuncelFiyat) * 100
            : 0;

        changeLog.push('prices and margin updated');
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
            error: 'No valid updates provided'
        });
    }

    // Update with transaction
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Check for code uniqueness if code is being updated
        if (updateData.kod && updateData.kod !== currentProduct.kod) {
            const existingProduct = await tx.secureQuery('urun', 'findFirst', {
                where: {
                    kod: { equals: updateData.kod, mode: 'insensitive' },
                    id: { not: parseInt(productId) }
                }
            });

            if (existingProduct) {
                throw new Error('Product with this code already exists');
            }
        }

        const updatedProduct = await tx.secureQuery('urun', 'update', {
            where: { id: parseInt(productId) },
            data: {
                ...updateData,
                guncellemeTarihi: new Date(),
                guncelleyenKullanici: req.user.userId
            },
            select: {
                id: true,
                kod: true,
                ad: true,
                kategori: true,
                guncelFiyat: true,
                aktif: true,
                guncellemeTarihi: true
            }
        }, 'PRODUCT_UPDATED');

        return updatedProduct;
    });

    // Enhanced audit logging
    auditLog('PRODUCT_UPDATED', 'Product updated', {
        userId: req.user.userId,
        productId: parseInt(productId),
        productCode: result.kod,
        productName: result.ad,
        changes: changeLog,
        userRole: req.user.rol
    });

        return res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        product: result,
        changes: changeLog
    });
}

/**
 * Delete Product with Enhanced Security
 */
async function deleteProduct(req, res) {
    // Permission check - Only admins can delete products
    if (req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Insufficient permissions to delete products'
        });
    }

    const { id: productId } = req.body;

    if (!productId) {
            return res.status(400).json({
            error: 'Product ID is required'
        });
    }

    // Get product details for validation
    const productToDelete = await req.prisma.secureQuery('urun', 'findUnique', {
        where: { id: parseInt(productId) },
        select: {
            id: true,
            kod: true,
            ad: true,
            aktif: true,
            mevcutStok: true
        }
    });

    if (!productToDelete) {
        return res.status(404).json({
            error: 'Product not found'
        });
    }

    // Business rule checks
    if (productToDelete.mevcutStok > 0) {
        return res.status(400).json({
            error: 'Cannot delete products with existing stock'
        });
    }

    // Check if product is used in any orders (simplified check)
    const orderUsage = await req.prisma.secureQuery('siparisKalem', 'count', {
        where: { urunId: parseInt(productId) }
    });

    if (orderUsage > 0) {
        return res.status(400).json({
            error: 'Cannot delete products that have been used in orders. Consider deactivating instead.'
        });
    }

    // Soft delete (deactivate) instead of hard delete
    const result = await req.prisma.secureTransaction(async (tx) => {
        const deactivatedProduct = await tx.secureQuery('urun', 'update', {
            where: { id: parseInt(productId) },
            data: {
                aktif: false,
                silinmeTarihi: new Date(),
                silenKullanici: req.user.userId,
                silmeSebebi: 'Yönetici silme işlemi'
            }
        }, 'PRODUCT_DEACTIVATED');

        return deactivatedProduct;
    });

    auditLog('PRODUCT_DELETED', 'Product deleted (soft delete)', {
        userId: req.user.userId,
        productId: parseInt(productId),
        productCode: productToDelete.kod,
        productName: productToDelete.ad
    });

        return res.status(200).json({
        success: true,
        message: 'Product deactivated successfully'
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(productsHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_PRODUCTS, // Base permission, individual operations check higher permissions

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_PRODUCTS
        // POST: CREATE_PRODUCTS (Manager+)
        // PUT: UPDATE_PRODUCTS (Supervisor+)
        // DELETE: DELETE_PRODUCTS (Admin+)

        // Input Validation Configuration
        allowedFields: [
            'id', 'kod', 'ad', 'aciklama', 'kategori', 'birim', 'guncelFiyat',
            'maliyetFiyat', 'alisFiyati', 'tedarikciKodu', 'tedarikciAdi',
            'minStok', 'maxStok', 'stokUyariSeviyesi', 'aktif', 'satisaUygun',
            'ozelUrun', 'yeniUrun', 'indirimliUrun', 'notlar',
            'page', 'limit', 'search', 'sortBy', 'sortOrder'
        ],
        requiredFields: {
            POST: ['kod', 'ad', 'kategori', 'birim'],
            PUT: ['id'],
            DELETE: ['id']
        },

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true
    }
); 