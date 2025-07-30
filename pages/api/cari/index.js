/**
 * =============================================
 * SECURED CUSTOMERS API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../lib/audit-logger.js';
import { validateInput } from '../../../lib/validation.js';

/**
 * Customers API Handler with Full Security Integration
 */
async function customersHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getCustomers(req, res);
            case 'POST':
                return await createCustomer(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST']
                });
        }
    } catch (error) {
        console.error('Customers API Error:', error);

        auditLog('CUSTOMERS_API_ERROR', 'Customers API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Customer operation failed',
            code: 'CUSTOMERS_ERROR'
        });
    }
}

/**
 * Get Customers List with Advanced Filtering
 */
async function getCustomers(req, res) {
    const {
        page = 1,
        limit = 50,
        search,
        tipi,
        il,
        subeId,
        aktif,
        sortBy = 'ad',
        sortOrder = 'asc'
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: [
            'page', 'limit', 'search', 'tipi', 'il', 'subeId', 'aktif', 'sortBy', 'sortOrder'
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

    // Type filtering
    if (tipi) {
        const validTypes = ['MUSTERI', 'TEDARIKCI', 'PERSONEL', 'DIGER'];
        if (validTypes.includes(tipi.toUpperCase())) {
            whereClause.tipi = tipi.toUpperCase();
        }
    }

    // City filtering
    if (il) {
        whereClause.il = { contains: il, mode: 'insensitive' };
    }

    // Branch filtering
    if (subeId) {
        whereClause.subeId = parseInt(subeId);
    }

    // Active status filtering
    if (aktif !== undefined) {
        whereClause.aktif = aktif === 'true';
    }

    // Search filtering
    if (search) {
        whereClause.OR = [
            { ad: { contains: search, mode: 'insensitive' } },
            { soyad: { contains: search, mode: 'insensitive' } },
            { unvan: { contains: search, mode: 'insensitive' } },
            { telefon: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
            { musteriKodu: { contains: search, mode: 'insensitive' } }
        ];
    }

    // Pagination and limits
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Sorting validation
    const validSortFields = ['ad', 'soyad', 'musteriKodu', 'tipi', 'olusturmaTarihi'];
    const validSortOrders = ['asc', 'desc'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'ad';
    const sortDirection = validSortOrders.includes(sortOrder) ? sortOrder : 'asc';

    // Enhanced query with security context
    const [customers, totalCount] = await Promise.all([
        req.prisma.secureQuery('cariMusteri', 'findMany', {
            where: whereClause,
            select: {
                id: true,
                ad: true,
                soyad: true,
                unvan: true,
                telefon: true,
                email: true,
                musteriKodu: true,
                tipi: true,
                aktif: true,
                olusturmaTarihi: true,

                // Sensitive data only for higher roles
                ...(req.user.roleLevel >= 60 && {
                    adres: true,
                    il: true,
                    ilce: true,
                    postaKodu: true,
                    vergiDairesi: true,
                    vergiNo: true
                }),

                sube: {
                    select: {
                        id: true,
                        ad: true,
                        kod: true
                    }
                }
            },
            orderBy: {
                [sortField]: sortDirection
            },
            skip,
            take: limitNum
        }),
        req.prisma.secureQuery('cariMusteri', 'count', {
            where: whereClause
        })
    ]);

    // Calculate summary statistics
    const customersSummary = await req.prisma.secureQuery('cariMusteri', 'groupBy', {
        by: ['tipi'],
        where: whereClause,
        _count: {
            id: true
        }
    });

    auditLog('CUSTOMERS_VIEW', 'Customers list accessed', {
        userId: req.user.userId,
        totalCustomers: totalCount,
        page: pageNum,
        limit: limitNum,
        filters: { search, tipi, il, subeId, aktif }
    });

    return res.status(200).json({
        success: true,
        customers,
        pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalCount / limitNum),
            totalItems: totalCount,
            itemsPerPage: limitNum
        },
        summary: customersSummary.reduce((acc, item) => {
            acc[item.tipi] = item._count.id;
            return acc;
        }, {})
    });
}

/**
 * Create New Customer with Enhanced Security and Validation
 */
async function createCustomer(req, res) {
    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['ad', 'telefon'],
        allowedFields: [
            'ad', 'soyad', 'unvan', 'telefon', 'email', 'adres', 'il', 'ilce',
            'postaKodu', 'musteriKodu', 'tipi', 'vergiDairesi', 'vergiNo',
            'subeId', 'notlar', 'aktif'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid customer data',
            details: validationResult.errors
        });
    }

    const {
        ad, soyad, unvan, telefon, email, adres, il, ilce, postaKodu,
        musteriKodu, tipi = 'MUSTERI', vergiDairesi, vergiNo,
        subeId, notlar, aktif = true
    } = req.body;

    // Business logic validation
    const phoneRegex = /^(\+90|0)?[5][0-9]{9}$/;
    if (!phoneRegex.test(telefon.replace(/\s/g, ''))) {
        return res.status(400).json({
            error: 'Invalid phone number format'
        });
    }

    // Email validation if provided
    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Invalid email format'
            });
        }
    }

    // Type validation
    const validTypes = ['MUSTERI', 'TEDARIKCI', 'PERSONEL', 'DIGER'];
    if (!validTypes.includes(tipi.toUpperCase())) {
        return res.status(400).json({
            error: 'Invalid customer type'
        });
    }

    // Enhanced transaction for customer creation
    const result = await req.prisma.secureTransaction(async (tx) => {
        // Check for existing customers by phone or email
        const existingCustomer = await tx.secureQuery('cariMusteri', 'findFirst', {
            where: {
                OR: [
                    { telefon },
                    ...(email ? [{ email }] : []),
                    ...(musteriKodu ? [{ musteriKodu }] : [])
                ]
            }
        });

        if (existingCustomer) {
            let field = 'telefon';
            if (existingCustomer.email === email) field = 'email';
            if (existingCustomer.musteriKodu === musteriKodu) field = 'musteriKodu';

            throw new Error(`Customer with this ${field} already exists`);
        }

        // Generate customer code if not provided
        const finalCustomerCode = musteriKodu || `MUS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

        // Create customer with audit trail
        const newCustomer = await tx.secureQuery('cariMusteri', 'create', {
            data: {
                ad,
                soyad: soyad || '',
                unvan: unvan || '',
                telefon,
                email: email || '',
                adres: adres || '',
                il: il || '',
                ilce: ilce || '',
                postaKodu: postaKodu || '',
                musteriKodu: finalCustomerCode,
                tipi: tipi.toUpperCase(),
                vergiDairesi: vergiDairesi || '',
                vergiNo: vergiNo || '',
                subeId: subeId ? parseInt(subeId) : null,
                notlar: notlar || '',
                aktif,
                olusturmaTarihi: new Date(),
                olusturanKullanici: req.user.userId
            },
            select: {
                id: true,
                ad: true,
                soyad: true,
                unvan: true,
                telefon: true,
                email: true,
                musteriKodu: true,
                tipi: true,
                aktif: true,
                olusturmaTarihi: true
            }
        }, 'CUSTOMER_CREATED');

        return newCustomer;
    });

    // Enhanced audit logging
    auditLog('CUSTOMER_CREATED', 'New customer created', {
        userId: req.user.userId,
        customerId: result.id,
        customerCode: result.musteriKodu,
        customerName: `${result.ad} ${result.soyad}`.trim(),
        customerType: result.tipi,
        customerPhone: telefon
    });

    return res.status(201).json({
        success: true,
        message: 'Customer created successfully',
        customer: result
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(customersHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_CUSTOMERS, // Base permission, individual operations check higher permissions

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_CUSTOMERS
        // POST: CREATE_CUSTOMERS

        // Input Validation Configuration
        allowedFields: [
            'ad', 'soyad', 'unvan', 'telefon', 'email', 'adres', 'il', 'ilce',
            'postaKodu', 'musteriKodu', 'tipi', 'vergiDairesi', 'vergiNo',
            'subeId', 'notlar', 'aktif',
            'page', 'limit', 'search', 'sortBy', 'sortOrder'
        ],
        requiredFields: {
            POST: ['ad', 'telefon']
        },

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true
    }
); 