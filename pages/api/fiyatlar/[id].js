import prisma from '../../../lib/prisma';
import { createAuditLog } from '../../../lib/audit-logger';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const id = parseInt(req.query.id);
    if (isNaN(id)) {
        return res.status(400).json({ message: 'Geçersiz fiyat ID.' });
    }

    if (req.method === 'PUT') {
        try {
            const { urunId, birim, kgFiyati, baslangicTarihi, bitisTarihi, fiyatTipi, aktif } = req.body;
            console.log('🔍 PUT Request Body:', req.body);

            if (!urunId || !birim || typeof kgFiyati !== 'number') {
                return res.status(400).json({
                    message: 'urunId, birim, kgFiyati (number) zorunludur.',
                    received: { urunId, birim, kgFiyati, type: typeof kgFiyati }
                });
            }

            // Basit update işlemi - mevcut kaydı güncelle
            const updatedPrice = await prisma.urunFiyat.update({
                where: { id },
                data: {
                    urunId: parseInt(urunId),
                    birim,
                    kgFiyati: kgFiyati,
                    fiyatTipi: fiyatTipi || 'NORMAL',
                    baslangicTarihi: baslangicTarihi ? new Date(baslangicTarihi) : undefined,
                    bitisTarihi: bitisTarihi ? new Date(bitisTarihi) : null,
                    aktif: aktif !== undefined ? aktif : true,
                    updatedAt: new Date()
                },
                include: {
                    urun: { select: { id: true, ad: true, kod: true } }
                }
            });

            return res.status(200).json({
                message: 'Fiyat başarıyla güncellendi',
                fiyat: updatedPrice
            });
        } catch (error) {
            console.error('❌ PUT /api/fiyatlar/[id] HATA:', error);
            let status = 500;
            let message = 'Fiyat güncellenirken hata oluştu.';
            if (error.code === 'P2025') {
                status = 404;
                message = 'Güncellenecek fiyat kaydı bulunamadı.';
            }
            if (error.code === 'P2002') {
                status = 400;
                message = 'Bu ürün ve tarih için zaten bir fiyat kaydı mevcut.';
            }
            return res.status(status).json({ message, error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            // 📝 Silme öncesi fiyat bilgilerini al (audit log için)
            const existingPrice = await prisma.urunFiyat.findUnique({
                where: { id },
                include: {
                    urun: { select: { id: true, ad: true, kod: true } }
                }
            });

            if (!existingPrice) {
                return res.status(404).json({ message: 'Fiyat kaydı bulunamadı.' });
            }

            // 🗑️ Fiyat kaydını sil
            await prisma.urunFiyat.delete({ where: { id } });

            // 📝 AUDIT LOG: Fiyat silme işlemini kaydet
            await createAuditLog({
                personelId: 'P001', // TODO: JWT'den gerçek personel ID'si alınacak
                action: 'DELETE',
                tableName: 'URUN_FIYAT',
                recordId: id,
                oldValues: {
                    urunId: existingPrice.urunId,
                    urunAdi: existingPrice.urun.ad,
                    urunKodu: existingPrice.urun.kod,
                    birim: existingPrice.birim,
                    fiyatTipi: existingPrice.fiyatTipi,
                    kgFiyati: existingPrice.kgFiyati,
                    baslangicTarihi: existingPrice.baslangicTarihi,
                    bitisTarihi: existingPrice.bitisTarihi,
                    aktif: existingPrice.aktif
                },
                newValues: null, // Silme işlemi için null
                description: `${existingPrice.urun.ad} ürününün ${existingPrice.kgFiyati}₺ (${existingPrice.fiyatTipi}) fiyat kaydı silindi`,
                req
            });

            console.log(`📝 AUDIT: Fiyat silindi - ${existingPrice.urun.ad} (${existingPrice.kgFiyati}₺)`);

            return res.status(200).json({
                message: 'Fiyat başarıyla silindi ve audit log\'a kaydedildi',
                success: true
            });
        } catch (error) {
            console.error('❌ DELETE /api/fiyatlar/[id] HATA:', error);
            let status = 500;
            let message = 'Fiyat silinirken hata oluştu.';
            if (error.code === 'P2025') { status = 404; message = 'Fiyat kaydı bulunamadı.'; }
            return res.status(status).json({ message, error: error.message });
        }
    }

    // New: GET /api/fiyatlar/[id]/orders - return count and IDs of orders that used this price
    if (req.method === 'GET' && req.query.orders === 'true') {
        try {
            const price = await prisma.urunFiyat.findUnique({ where: { id } });
            if (!price) return res.status(404).json({ message: 'Fiyat kaydı bulunamadı.' });
            // Find orders with tarih >= baslangicTarihi and (bitisTarihi is null or tarih < bitisTarihi)
            const orders = await prisma.siparis.findMany({
                where: {
                    tarih: {
                        gte: price.baslangicTarihi,
                        ...(price.bitisTarihi ? { lt: price.bitisTarihi } : {})
                    },
                    kalemler: {
                        some: {
                            urunId: price.urunId,
                            birim: price.birim
                        }
                    }
                },
                select: { id: true, tarih: true }
            });
            return res.status(200).json({ count: orders.length, orders });
        } catch (error) {
            return res.status(500).json({ message: 'Siparişler sorgulanırken hata oluştu.', error: error.message });
        }
    }

    res.setHeader('Allow', ['PUT', 'DELETE', 'OPTIONS']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
} 