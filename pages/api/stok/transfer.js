import prisma from '../../../lib/prisma.js';
import { auditLoggingMiddleware } from '../../../middleware/audit-logging.js';
// import { verifyAuth } from '../../../lib/auth'; // GELİŞTİRME İÇİN GEÇİCİ OLARAK KAPALI

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        // Auth kontrolü - GELİŞTİRME İÇİN GEÇİCİ OLARAK KAPALI
        // let user;
        // try {
        //     user = verifyAuth(req);
        // } catch (e) {
        //     return res.status(401).json({ message: 'Yetkisiz.' });
        // }

        try {
            const { kaynakSubeId, hedefSubeId, materialId, urunId, miktar, birim, aciklama } = req.body;
            if (!miktar || miktar <= 0) {
                return res.status(400).json({ message: 'miktar > 0 zorunludur.' });
            }
            if (!materialId && !urunId) {
                return res.status(400).json({ message: 'materialId veya urunId zorunludur.' });
            }

            // Transfer işlemini gerçekleştir
            const transfer = await prisma.stokTransfer.create({
                data: {
                    kaynakSubeId,
                    hedefSubeId,
                    materialId,
                    urunId,
                    miktar,
                    birim: birim || 'KG',
                    aciklama,
                    createdBy: 1, // Geçici olarak admin user ID
                    durum: 'BEKLIYOR'
                }
            });

            return res.status(200).json({ message: 'Transfer başarılı.' });
        } catch (error) {
            return res.status(500).json({ message: 'Transfer sırasında hata oluştu.', error: error.message });
        }
    }

    if (req.method === 'GET') {
        try {
            const transfers = await prisma.stokTransfer.findMany({
                orderBy: { createdAt: 'desc' },
                take: 100,
                include: {
                    kaynakSube: { select: { ad: true, kod: true } },
                    hedefSube: { select: { ad: true, kod: true } },
                    urun: { select: { ad: true, kod: true } },
                    material: { select: { ad: true, kod: true, tipi: true } },
                    olusturan: { select: { ad: true, email: true } }
                }
            });
            return res.status(200).json(transfers);
        } catch (error) {
            return res.status(500).json({ message: 'Transfer geçmişi alınamadı.', error: error.message });
        }
    }

    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
} 