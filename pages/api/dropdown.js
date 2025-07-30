// pages/api/dropdown.js
// Bu dosya SADECE dropdown seçeneklerini getirmek (GET) içindir.

import prisma from '../../lib/prisma';

export default async function handler(req, res) {
  // CORS ve OPTIONS Handling
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    console.log('OPTIONS /api/dropdown isteği yanıtlandı.');
    return res.status(200).end();
  }

  // Sadece GET isteklerini işle
  if (req.method === 'GET') {
    console.log('GET /api/dropdown isteği alındı...');
    try {
      // Verileri paralel çek - AMBALAJ MODELİ KALDIRILDI
      const [
        teslimatTurleri,
        subeler,
        urunler,
        tepsiTavalar,
        kutular,
        materials,
        cariler,
        kategoriler,
        odemeYontemleri
      ] = await Promise.all([
        prisma.teslimatTuru.findMany({ where: { aktif: true }, orderBy: { ad: 'asc' } }),
        prisma.sube.findMany({ where: { aktif: true }, orderBy: { ad: 'asc' } }),
        prisma.urun.findMany({ where: { aktif: true }, orderBy: { ad: 'asc' } }),
        prisma.tepsiTava.findMany({ where: { aktif: true }, orderBy: { ad: 'asc' } }),
        prisma.kutu.findMany({ where: { aktif: true }, orderBy: { ad: 'asc' } }),
        prisma.material.findMany({ where: { aktif: true }, orderBy: { ad: 'asc' } }),
        prisma.cari.findMany({
          where: { aktif: true },
          orderBy: { ad: 'asc' },
          select: {
            id: true,
            ad: true,
            soyad: true,
            telefon: true,
            email: true,
            musteriKodu: true,
            adres: true,
            il: true,
            ilce: true,
            cariGrubu: true,
            fiyatGrubu: true,
            subeAdi: true,
            irtibatAdi: true,
            adresler: {
              where: { aktif: true },
              orderBy: [{ varsayilan: 'desc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                tip: true,
                adres: true,
                il: true,
                ilce: true,
                mahalle: true,
                postaKodu: true,
                tarif: true,
                varsayilan: true
              }
            }
          }
        }),
        prisma.urunKategori.findMany({ where: { aktif: true }, orderBy: { ad: 'asc' } }),
        prisma.systemSetting.findMany({ 
          where: { 
            category: 'ODEME_YONTEMLERI',
            key: { startsWith: 'ODEME_YONTEMI_' }
          },
          orderBy: { key: 'asc' } 
        })
      ]);

      console.log('Veritabanından dropdown verileri başarıyla çekildi.');

      // Materials'ı tipine göre grupla - AMBALAJ_MALZEMESI enum'u kaldırıldı
      const hammaddeler = materials.filter(m => m.tipi === 'HAMMADDE');
      const yariMamuller = materials.filter(m => m.tipi === 'YARI_MAMUL');
      const yardimciMaddeler = materials.filter(m => m.tipi === 'YARDIMCI_MADDE');

      // Yanıtı formatla (ID ve Ad ile)
      const responseData = {
        teslimatTurleri: teslimatTurleri.map(item => ({
          id: item.id,
          ad: item.ad,
          fiyat: item.fiyat || 0,
          aciklama: item.aciklama
        })),
        subeler: subeler.map(item => ({
          id: item.id,
          ad: item.ad,
          kod: item.kod,
          telefon: item.telefon,
          adres: item.adres
        })),
        // Ambalaj modeli kaldırıldı - TepsiTava ve Kutu kullanılıyor
        urunler: urunler.map(item => ({
          id: item.id,
          ad: item.ad,
          kod: item.kod,
          kategoriId: item.kategoriId,
          fiyat: item.fiyat || 0
        })),
        tepsiTavalar: tepsiTavalar.map(item => ({
          id: item.id,
          ad: item.ad,
          fiyat: item.fiyat || 0,
          aciklama: item.aciklama
        })),
        kutular: kutular.map(item => ({
          id: item.id,
          ad: item.ad,
          fiyat: item.fiyat || 0,
          aciklama: item.aciklama
        })),
        // Alıcı tipleri için sabit değerler (enum-like)
        aliciTipleri: [
          { id: 1, ad: 'Sadece Gönderen' },
          { id: 2, ad: 'Gönderen ve Alıcı' }
        ],
        kategoriler: kategoriler.map(item => ({
          id: item.id,
          ad: item.ad,
          kod: item.kod,
          aciklama: item.aciklama
        })),
        odemeYontemleri: odemeYontemleri.map(item => {
          const data = JSON.parse(item.value);
          return {
            id: item.id,
            ad: data.ad,
            kod: data.kod,
            enumValue: data.enumValue,
            aciklama: data.aciklama
          };
        }),
        // Material sisteminden gelen veriler
        hammaddeler: hammaddeler.map(item => ({
          id: item.id,
          kod: item.kod,
          ad: item.ad,
          birim: item.birim,
          birimFiyat: item.birimFiyat || 0
        })),
        yariMamuller: yariMamuller.map(item => ({
          id: item.id,
          kod: item.kod,
          ad: item.ad,
          birim: item.birim,
          birimFiyat: item.birimFiyat || 0
        })),
        yardimciMaddeler: yardimciMaddeler.map(item => ({
          id: item.id,
          kod: item.kod,
          ad: item.ad,
          birim: item.birim,
          birimFiyat: item.birimFiyat || 0
        })),
        // Tüm materyaller birleşik liste
        materials: materials.map(item => ({
          id: item.id,
          kod: item.kod,
          ad: item.ad,
          tipi: item.tipi,
          birim: item.birim,
          birimFiyat: item.birimFiyat || 0,
          mevcutStok: item.mevcutStok || 0
        })),
        cariler: cariler.map(item => ({
          id: item.id,
          ad: item.ad,
          soyad: item.soyad || '',
          tamAd: `${item.ad} ${item.soyad || ''}`.trim(),
          telefon: item.telefon ? String(item.telefon) : '',
          email: item.email || '',
          musteriKodu: item.musteriKodu || '',
          adres: item.adres || '',
          il: item.il || '',
          ilce: item.ilce || '',
          adresler: item.adresler || [],
          // CSV'den gelen ek alanlar
          subeAdi: item.subeAdi || '',
          irtibatAdi: item.irtibatAdi || '',
          cariGrubu: item.cariGrubu || '',
          fiyatGrubu: item.fiyatGrubu || ''
        }))
      };

      // Başarılı yanıtı gönder
      return res.status(200).json(responseData);

    } catch (error) {
      console.error('❌ /api/dropdown HATA:', error);
      // Hata yanıtını gönder
      return res.status(500).json({
        message: 'Dropdown verileri alınırken bir sunucu hatası oluştu.',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } else {
    // Desteklenmeyen metot için 405 hatası
    console.log(`Desteklenmeyen metot: ${req.method} for /api/dropdown`);
    res.setHeader('Allow', ['GET', 'OPTIONS']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}

