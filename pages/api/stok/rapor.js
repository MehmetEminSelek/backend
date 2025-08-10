import prisma from '../../../lib/prisma.js';
import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';

export default withCorsAndAuth(async function handler(req, res) {

    if (req.method === 'GET') {
        try {
            const { start, end } = req.query;
            const where = {};
            if (start || end) {
                where.createdAt = {};
                if (start) where.createdAt.gte = new Date(start);
                if (end) where.createdAt.lte = new Date(end);
            }

            // Toplamlar
            const [giris, cikis, transfer] = await Promise.all([
                prisma.stokHareket.aggregate({
                    _sum: { miktar: true },
                    where: { ...where, tip: 'GIRIS' }
                }),
                prisma.stokHareket.aggregate({
                    _sum: { miktar: true },
                    where: { ...where, tip: 'CIKIS' }
                }),
                prisma.stokHareket.aggregate({
                    _sum: { miktar: true },
                    where: { ...where, tip: 'TRANSFER' }
                })
            ]);

            // En çok hareket gören ürünler
            const enCokMovingUrunler = await prisma.stokHareket.groupBy({
                by: ['urunId'],
                where: { ...where, urunId: { not: null } },
                _sum: { miktar: true },
                orderBy: { _sum: { miktar: 'desc' } },
                take: 5
            });

            // En çok hareket gören materyaller
            const enCokMovingMateryaller = await prisma.stokHareket.groupBy({
                by: ['materialId'],
                where: { ...where, materialId: { not: null } },
                _sum: { miktar: true },
                orderBy: { _sum: { miktar: 'desc' } },
                take: 5
            });

            // Kritik seviyedeki materyaller
            const kritikMateryaller = await prisma.material.findMany({
                where: {
                    mevcutStok: { lte: prisma.material.fields.kritikSeviye }
                },
                select: {
                    id: true,
                    ad: true,
                    kod: true,
                    mevcutStok: true,
                    kritikSeviye: true,
                    birimFiyat: true,
                    tipi: true
                }
            });

            return res.status(200).json({
                toplamGiris: giris._sum.miktar || 0,
                toplamCikis: cikis._sum.miktar || 0,
                toplamTransfer: transfer._sum.miktar || 0,
                enCokHareketGoren: {
                    urunler: enCokMovingUrunler,
                    materyaller: enCokMovingMateryaller
                },
                kritikMateryaller,
                tarihAraligi: { start, end }
            });
        } catch (error) {
            return res.status(500).json({ message: 'Rapor alınamadı.', error: error.message });
        }
    }

    res.setHeader('Allow', ['GET', 'OPTIONS']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}); 