/**
 * CariMusteri Adres API - Simple & Clean
 */

import { withCorsAndAuth } from '../../../../lib/cors-wrapper.js';
import prisma from '../../../../lib/prisma.js';

async function handler(req, res) {
    const { id: cariMusteriId } = req.query;

    console.log('Adres API - Received ID:', cariMusteriId, 'Method:', req.method);

    // Validate and parse ID
    const parsedId = parseInt(cariMusteriId);
    if (!parsedId || isNaN(parsedId)) {
        return res.status(400).json({ 
            error: 'Invalid cari ID',
            received: cariMusteriId 
        });
    }

    // Check if CariMusteri exists
    const cariMusteri = await prisma.cariMusteri.findUnique({
        where: { id: parsedId }
    });

    if (!cariMusteri) {
        return res.status(404).json({ error: 'Cari müşteri bulunamadı' });
    }

    try {
        switch (req.method) {
            case 'GET':
                return await getAdresler(req, res, parsedId);
            case 'POST':
                return await createAdres(req, res, parsedId);
            default:
                res.setHeader('Allow', ['GET', 'POST']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST']
                });
        }
    } catch (error) {
        console.error('Adres API Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
}

/**
 * Get customer addresses
 */
async function getAdresler(req, res, cariMusteriId) {
    const adresler = await prisma.cariAdres.findMany({
        where: {
            cariMusteriId,
            aktif: true
        },
        orderBy: [
            { varsayilan: 'desc' },
            { createdAt: 'asc' }
        ]
    });

    console.log('ADRES_LIST: Retrieved', adresler.length, 'addresses for cariMusteriId:', cariMusteriId);

    return res.status(200).json(adresler);
}

/**
 * Create new address
 */
async function createAdres(req, res, cariMusteriId) {
    const { tip = 'DIGER', adres, il, ilce, mahalle, postaKodu, tarif, varsayilan = false } = req.body;

    // Validation
    if (!adres) {
        return res.status(400).json({ error: 'Adres zorunlu' });
    }

    // If this will be default, make others false
    if (varsayilan) {
        await prisma.cariAdres.updateMany({
            where: { cariMusteriId },
            data: { varsayilan: false }
        });
    }

    // Create new address
    const yeniAdres = await prisma.cariAdres.create({
        data: {
            cariMusteriId,
            tip,
            adres,
            il: il || '',
            ilce: ilce || '',
            mahalle: mahalle || '',
            postaKodu: postaKodu || '',
            tarif: tarif || '',
            varsayilan,
            aktif: true
        }
    });

    // If this is the first address, make it default
    const adresCount = await prisma.cariAdres.count({
        where: { cariMusteriId, aktif: true }
    });

    if (adresCount === 1) {
        await prisma.cariAdres.update({
            where: { id: yeniAdres.id },
            data: { varsayilan: true }
        });
        yeniAdres.varsayilan = true;
    }

    console.log('ADRES_CREATED: Created address for cariMusteriId:', cariMusteriId, 'adresId:', yeniAdres.id);

    return res.status(201).json(yeniAdres);
}

export default withCorsAndAuth(handler);