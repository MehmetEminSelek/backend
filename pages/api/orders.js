// pages/api/orders.js
import prisma from '../../lib/prisma.js';
import { withCorsAndAuth } from '../../lib/cors-wrapper.js';
import { Prisma } from '@prisma/client';
import { recalculateOrderItemPrices } from '../../lib/fiyat'; // Yeni fiyatlandırma sistemi

export default withCorsAndAuth(async function handler(req, res) {

  if (req.method === 'GET') {
    try {
      const { status, startDate, endDate } = req.query;
      console.log(`GET /api/orders isteği alındı. Parametreler:`, req.query);

      const whereClause = {};
      // Yeni basitleştirilmiş status sistemi
      if (status === 'pending') { whereClause.durum = 'ONAY_BEKLEYEN'; }
      else if (status === 'approved') { whereClause.durum = 'HAZIRLLANACAK'; }
      else if (status === 'ready') { whereClause.durum = 'HAZIRLANDI'; }

      // Kargo durumu filtresi ekle
      if (req.query.kargoDurumu) {
        const kargoDurumuMapping = {
          'Kargoya Verilecek': 'KARGOYA_VERILECEK',
          'Kargoda': 'KARGODA',
          'Teslim Edildi': 'TESLIM_EDILDI',
          'Şubeye Gönderilecek': 'SUBEYE_GONDERILECEK',
          'Şubede Teslim': 'SUBEDE_TESLIM',
          'Adrese Teslimat': 'ADRESE_TESLIMAT',
          'Şubeden Şubeye': 'SUBEDEN_SUBEYE',
          'İptal': 'IPTAL'
        };
        whereClause.kargoDurumu = kargoDurumuMapping[req.query.kargoDurumu] || req.query.kargoDurumu;
      }

      if (startDate && endDate) {
        try {
          const start = new Date(startDate); start.setHours(0, 0, 0, 0);
          const end = new Date(endDate); end.setHours(23, 59, 59, 999);
          if (isNaN(start.getTime()) || isNaN(end.getTime())) { throw new Error('Geçersiz tarih formatı.'); }
          whereClause.tarih = { gte: start, lte: end };
        } catch (dateError) {
          console.error("Tarih aralığı hatası:", dateError);
          return res.status(400).json({ message: 'Geçersiz tarih formatı. YYYY-MM-DD kullanın.' });
        }
      }

      const siparisler = await prisma.siparis.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          teslimatTuru: { select: { ad: true } },
          sube: { select: { ad: true } },
          cari: { select: { id: true, cariAdi: true, musteriKodu: true, telefon: true } },
          odemeler: {
            orderBy: { odemeTarihi: 'desc' },
            select: {
              id: true,
              tutar: true,
              odemeTarihi: true,
              odemeYontemi: true,
              aciklama: true
            }
          },
          kalemler: {
            orderBy: { id: 'asc' },
            select: {
              id: true,
              miktar: true,
              birim: true,
              birimFiyat: true,
              urun: { select: { id: true, ad: true } },
              urunId: true,
              kutu: { select: { id: true, ad: true } },
              tepsiTava: { select: { id: true, ad: true } }, // fiyat alanı yok
              kutuId: true,
              tepsiTavaId: true
            }
          }
        }
      });

      // Fiyatları yeni sistem ile yeniden hesapla
      const duzeltilmisSiparisler = await Promise.all(
        siparisler.map(async (siparis) => {
          try {
            const correctedKalemler = await recalculateOrderItemPrices(siparis.kalemler, siparis.tarih);
            return {
              ...siparis,
              kalemler: correctedKalemler
            };
          } catch (error) {
            console.warn(`Sipariş ${siparis.id} fiyat düzeltmesi yapılamadı:`, error.message);
            return siparis; // Hata durumunda orijinal siparişi döndür
          }
        })
      );

      console.log(`${duzeltilmisSiparisler.length} adet sipariş bulundu.`);
      return res.status(200).json({ success: true, orders: duzeltilmisSiparisler });

    } catch (error) {
      console.error('❌ GET /api/orders HATA:', error);
      return res.status(500).json({ message: 'Siparişler listelenirken hata oluştu.', error: error.message });
    }
  }

  console.log(`Desteklenmeyen metot: ${req.method} for /api/orders`);
  res.setHeader('Allow', ['GET', 'OPTIONS']);
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
});
