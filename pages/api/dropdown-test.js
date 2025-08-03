/**
 * Test endpoint for dropdown - NO AUTH
 */

import { PrismaClient } from '@prisma/client';

// Create a local instance for this endpoint
const prisma = new PrismaClient();

async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('📍 Dropdown test endpoint called');

        // Test simple query first
        const carilerCount = await prisma.cari.count();
        console.log('📊 Cari count:', carilerCount);

        // Get basic dropdown data
        const [cariler, urunler] = await Promise.all([
            prisma.cari.findMany({
                where: { durum: 'AKTIF' },
                select: { id: true, ad: true, kod: true },
                orderBy: { ad: 'asc' },
                take: 10
            }).catch(err => {
                console.error('Cari query error:', err);
                return [];
            }),
            prisma.urun.findMany({
                where: { aktif: true },
                select: { id: true, ad: true, kod: true },
                orderBy: { ad: 'asc' },
                take: 10
            }).catch(err => {
                console.error('Urun query error:', err);
                return [];
            })
        ]);

        const response = {
            status: 'success',
            cariler,
            urunler,
            teslimatTurleri: [
                { id: 1, ad: 'Kapıda Teslim' },
                { id: 2, ad: 'Şubeden Teslim' }
            ],
            odemeSekilleri: [
                { id: 1, ad: 'Nakit' },
                { id: 2, ad: 'Kredi Kartı' }
            ],
            aliciTipleri: [
                { id: 'TRENDYOL', ad: 'Trendyol' },
                { id: 'HEPSIBURADA', ad: 'Hepsiburada' },
                { id: 'AMAZON', ad: 'Amazon' },
                { id: 'DIGER', ad: 'Diğer' }
            ],
            meta: {
                timestamp: new Date().toISOString(),
                carilerCount,
                urunlerCount: urunler.length
            }
        };

        console.log('✅ Dropdown test response:', {
            cariler: cariler.length,
            urunler: urunler.length,
            success: true
        });

        return res.status(200).json(response);
    } catch (error) {
        console.error('❌ Dropdown test error:', error);
        return res.status(500).json({
            error: 'Failed to fetch dropdown data',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

export default handler;