/**
 * Hazırlanacak Siparişler API
 * DB destekli üretim kuyruğu
 */

import prisma from '../../lib/prisma.js';
import { withCorsAndAuth } from '../../lib/cors-wrapper.js';

export default withCorsAndAuth(async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            const rawOrders = await prisma.siparis.findMany({
                where: { durum: 'HAZIRLLANACAK' },
                orderBy: { tarih: 'asc' },
                select: {
                    id: true,
                    tarih: true,
                    gonderenAdi: true,
                    teslimatTuru: { select: { ad: true, kod: true } },
                    kargoDurumu: true,
                    sube: { select: { id: true, ad: true } },
                    kalemler: {
                        orderBy: { id: 'asc' },
                        select: {
                            id: true,
                            miktar: true,
                            birim: true,
                            urun: { select: { id: true, ad: true } },
                            kutu: { select: { id: true, ad: true } },
                            tepsiTava: { select: { id: true, ad: true } }
                        }
                    }
                }
            });
            // Backward compatibility: add gorunecekAd fallback
            const orders = rawOrders.map(o => ({ ...o, gorunecekAd: o.gonderenAdi }));
            return res.status(200).json({ success: true, count: orders.length, orders });
        } catch (error) {
            console.error('❌ Hazırlanacak siparişler hatası:', error);
            return res.status(500).json({ success: false, message: 'Hazırlanacak siparişler getirilemedi', error: error.message });
        }
    }
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
});