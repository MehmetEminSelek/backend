/**
 * CariMusteri API - Schema Aligned
 */

import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';
import prisma from '../../../lib/prisma.js';

async function cariHandler(req, res) {
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
        console.error('Cari API Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            code: 'CARI_ERROR'
        });
    }
}

/**
 * Get Customers List
 */
async function getCustomers(req, res) {
    const {
        page = 1,
        limit = 50,
        search,
        aktif
    } = req.query;

    // Basic pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const whereClause = {};

    // Active status filtering
    if (aktif !== undefined) {
        whereClause.aktif = aktif === 'true';
    }

    // Search filtering using correct CariMusteri fields
    if (search) {
        whereClause.OR = [
            { cariAdi: { contains: search, mode: 'insensitive' } },
            { irtibatAdi: { contains: search, mode: 'insensitive' } },
            { subeAdi: { contains: search, mode: 'insensitive' } },
            { telefon: { contains: search } },
            { musteriKodu: { contains: search, mode: 'insensitive' } }
        ];
    }

    // Execute query
    const [customers, totalCount] = await Promise.all([
        prisma.cariMusteri.findMany({
            where: whereClause,
            select: {
                id: true,
                cariAdi: true,
                musteriKodu: true,
                telefon: true,
                aktif: true,
                createdAt: true,
                subeAdi: true,
                irtibatAdi: true,
                cariGrubu: true,
                fiyatGrubu: true
            },
            orderBy: { cariAdi: 'asc' },
            skip,
            take: limitNum
        }),
        prisma.cariMusteri.count({ where: whereClause })
    ]);

    console.log('CUSTOMERS_VIEW: Accessed by', req.user?.personelId, {
        totalCustomers: totalCount,
        page: pageNum,
        limit: limitNum
    });

    return res.status(200).json({
        success: true,
        customers,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalCount,
            pages: Math.ceil(totalCount / limitNum)
        }
    });
}

/**
 * Create New Customer
 */
async function createCustomer(req, res) {
    const {
        cariAdi, telefon, musteriKodu, subeAdi, irtibatAdi,
        cariGrubu, fiyatGrubu, aktif = true
    } = req.body;

    // Validation
    if (!cariAdi || !telefon) {
        return res.status(400).json({
            error: 'cariAdi and telefon are required fields'
        });
    }

    // Check for existing customer
    const existingCustomer = await prisma.cariMusteri.findFirst({
        where: {
            OR: [
                { telefon },
                ...(musteriKodu ? [{ musteriKodu }] : [])
            ]
        }
    });

    if (existingCustomer) {
        const field = existingCustomer.telefon === telefon ? 'telefon' : 'musteriKodu';
        return res.status(409).json({
            error: `Customer with this ${field} already exists`
        });
    }

    // Generate customer code if not provided
    const finalCustomerCode = musteriKodu || `MUS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    // Create customer
    const newCustomer = await prisma.cariMusteri.create({
        data: {
            cariAdi,
            musteriKodu: finalCustomerCode,
            telefon,
            subeAdi: subeAdi || '',
            irtibatAdi: irtibatAdi || '',
            cariGrubu: cariGrubu || '',
            fiyatGrubu: fiyatGrubu || '',
            aktif
        }
    });

    console.log('CUSTOMER_CREATED: Created by', req.user?.personelId, {
        customerId: newCustomer.id,
        customerCode: newCustomer.musteriKodu,
        customerName: newCustomer.cariAdi
    });

    return res.status(201).json({
        success: true,
        message: 'Customer created successfully',
        customer: newCustomer
    });
}

export default withCorsAndAuth(cariHandler);