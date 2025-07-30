import prisma from '../../lib/prisma';

export default async function handler(req, res) {
    // CORS ayarları
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET' || req.method === 'POST') {
        try {
            const { startDate, endDate } = req.method === 'POST' ? req.body : req.query;

            const start = startDate ? new Date(startDate) : new Date();
            const end = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            console.log('🔄 Üretim planı hesaplanıyor...', { start, end });

            // Hazırlanacak ve Hazırlanan siparişleri getir
            const [hazirlanacakSiparisler, hazirlanenSiparisler] = await Promise.all([
                getHazirlanacakSiparisler(start, end),
                getHazirlanenSiparisler(start, end)
            ]);

            // Summary hesapla
            const summary = {
                hazirlanacakSiparisler: hazirlanacakSiparisler.length,
                hazirlanenSiparisler: hazirlanenSiparisler.length,
                bekleyenMaliyet: hazirlanacakSiparisler.reduce((sum, s) => sum + (s.toplamMaliyet || 0), 0),
                tamamlanmisMaliyet: hazirlanenSiparisler.reduce((sum, s) => sum + (s.toplamMaliyet || 0), 0),
                toplamCiro: [...hazirlanacakSiparisler, ...hazirlanenSiparisler].reduce((sum, s) => sum + (s.toplamTutar || 0), 0),
                toplamKar: 0 // Hesaplanacak
            };

            // Kar hesaplama
            summary.toplamKar = summary.toplamCiro - (summary.bekleyenMaliyet + summary.tamamlanmisMaliyet);

            console.log('✅ Üretim planı tamamlandı', summary);

            // DEBUG: Sipariş kalemlerini kontrol et
            console.log('🔍 DEBUG - Hazırlanacak sipariş sayısı:', hazirlanacakSiparisler.length);
            if (hazirlanacakSiparisler.length > 0) {
                console.log('🔍 DEBUG - İlk sipariş kalemleri:', hazirlanacakSiparisler[0].kalemler?.length || 0);
            }
            console.log('🔍 DEBUG - Hazırlanan sipariş sayısı:', hazirlanenSiparisler.length);
            if (hazirlanenSiparisler.length > 0) {
                console.log('🔍 DEBUG - İlk sipariş kalemleri:', hazirlanenSiparisler[0].kalemler?.length || 0);
            }

            // Frontend'in beklediği format
            const formattedData = {
                genel: {
                    bekleyenMaliyet: summary.bekleyenMaliyet,
                    tamamlanmisMaliyet: summary.tamamlanmisMaliyet,
                    toplamCiro: summary.toplamCiro,
                    toplamKar: summary.toplamKar,
                    toplamSiparis: hazirlanacakSiparisler.length + hazirlanenSiparisler.length
                },
                hazirlanacaklar: {
                    siparisler: hazirlanacakSiparisler.map(siparis => ({
                        ...siparis,
                        cariAdi: siparis.cariAdi,
                        // Kalem seviyesinde maliyet hesaplama
                        kalemler: siparis.kalemler.map(kalem => ({
                            ...kalem,
                            birimMaliyet: calculateKalemBirimMaliyet(kalem, siparis.maliyetDetay),
                            toplamMaliyet: calculateKalemToplamMaliyet(kalem, siparis.maliyetDetay)
                        }))
                    }))
                },
                hazırlananlar: {
                    siparisler: hazirlanenSiparisler.map(siparis => ({
                        ...siparis,
                        cariAdi: siparis.cariAdi,
                        // Kalem seviyesinde maliyet hesaplama
                        kalemler: siparis.kalemler.map(kalem => ({
                            ...kalem,
                            birimMaliyet: calculateKalemBirimMaliyet(kalem, siparis.maliyetDetay),
                            toplamMaliyet: calculateKalemToplamMaliyet(kalem, siparis.maliyetDetay)
                        }))
                    }))
                }
            };

            return res.status(200).json({
                success: true,
                data: formattedData,
                tarihalAraligi: { start, end }
            });

        } catch (error) {
            console.error('❌ Üretim planı hatası:', error);
            return res.status(500).json({
                success: false,
                error: 'Üretim planı hesaplanırken hata oluştu',
                details: error.message
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// Hazırlanacak siparişleri getir (Onay bekleyen ve hazırlanacak durumunda)
async function getHazirlanacakSiparisler(startDate, endDate) {
    const siparisler = await prisma.siparis.findMany({
        where: {
            durum: {
                in: ['ONAY_BEKLEYEN', 'HAZIRLLANACAK']
            },
            tarih: {
                gte: startDate,
                lte: endDate
            }
        },
        include: {
            cari: {
                select: { ad: true, soyad: true, musteriKodu: true, telefon: true }
            },
            teslimatTuru: {
                select: { ad: true }
            },
            sube: {
                select: { ad: true }
            },
            kalemler: {
                include: {
                    urun: {
                        include: {
                            receteler: {
                                where: { aktif: true },
                                include: {
                                    icerikelek: {
                                        include: {
                                            material: {
                                                select: { ad: true, kod: true, birimFiyat: true, birim: true }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    kutu: { select: { ad: true } },
                    tepsiTava: { select: { ad: true } } // fiyat alanı yok
                }
            }
        },
        orderBy: { tarih: 'asc' }
    });

    // Her sipariş için maliyet hesaplama
    const enrichedSiparisler = await Promise.all(
        siparisler.map(async (siparis) => {
            const maliyetDetay = await hesaplaSiparisMaliyeti(siparis.kalemler);

            return {
                ...siparis,
                cariAdi: siparis.cari ? `${siparis.cari.ad} ${siparis.cari.soyad || ''}`.trim() : siparis.gonderenAdi,
                maliyetDetay,
                toplamMaliyet: maliyetDetay.toplamMaliyet,
                karMarji: siparis.toplamTutar - maliyetDetay.toplamMaliyet,
                karOrani: siparis.toplamTutar > 0 ? ((siparis.toplamTutar - maliyetDetay.toplamMaliyet) / siparis.toplamTutar * 100) : 0
            };
        })
    );

    return enrichedSiparisler;
}

// Hazırlanan siparişleri getir
async function getHazirlanenSiparisler(startDate, endDate) {
    const siparisler = await prisma.siparis.findMany({
        where: {
            durum: 'HAZIRLANDI',
            tarih: {
                gte: startDate,
                lte: endDate
            }
        },
        include: {
            cari: {
                select: { ad: true, soyad: true, musteriKodu: true, telefon: true }
            },
            teslimatTuru: {
                select: { ad: true }
            },
            sube: {
                select: { ad: true }
            },
            kalemler: {
                include: {
                    urun: {
                        include: {
                            receteler: {
                                where: { aktif: true },
                                include: {
                                    icerikelek: {
                                        include: {
                                            material: {
                                                select: { ad: true, kod: true, birimFiyat: true, birim: true }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    kutu: { select: { ad: true } },
                    tepsiTava: { select: { ad: true } } // fiyat alanı yok
                }
            }
        },
        orderBy: { updatedAt: 'desc' }
    });

    // Her sipariş için maliyet hesaplama
    const enrichedSiparisler = await Promise.all(
        siparisler.map(async (siparis) => {
            const maliyetDetay = await hesaplaSiparisMaliyeti(siparis.kalemler);

            return {
                ...siparis,
                cariAdi: siparis.cari ? `${siparis.cari.ad} ${siparis.cari.soyad || ''}`.trim() : siparis.gonderenAdi,
                maliyetDetay,
                toplamMaliyet: maliyetDetay.toplamMaliyet,
                karMarji: siparis.toplamTutar - maliyetDetay.toplamMaliyet,
                karOrani: siparis.toplamTutar > 0 ? ((siparis.toplamTutar - maliyetDetay.toplamMaliyet) / siparis.toplamTutar * 100) : 0
            };
        })
    );

    return enrichedSiparisler;
}

// Sipariş maliyet hesaplama
async function hesaplaSiparisMaliyeti(kalemler) {
    let toplamMaliyet = 0;
    let malzemeDetaylari = [];
    let ambalajMaliyeti = 0;

    for (const kalem of kalemler) {
        // Ürün recetesi var mı?
        const recete = kalem.urun.receteler && kalem.urun.receteler.length > 0
            ? kalem.urun.receteler[0]
            : null;

        let kalemMaliyet = 0;

        if (recete) {
            // Recete bazlı maliyet hesaplama
            for (const ingredient of recete.icerikelek) {
                const malzemeFiyat = ingredient.material.birimFiyat || 0;
                const birimCarpan = getBirimCarpan(ingredient.birim, ingredient.material.birim);

                // Sipariş miktarına göre ölçekle
                const siparisKg = convertToKg(kalem.miktar, kalem.birim);
                const ihtiyacMiktar = (ingredient.miktar * birimCarpan) * siparisKg;
                const malzemeMaliyet = ihtiyacMiktar * malzemeFiyat;

                kalemMaliyet += malzemeMaliyet;
                malzemeDetaylari.push({
                    malzemeAdi: ingredient.material.ad,
                    malzemeKodu: ingredient.material.kod,
                    ihtiyacMiktar,
                    birimFiyat: malzemeFiyat,
                    toplamMaliyet: malzemeMaliyet,
                    kalemId: kalem.id
                });
            }
        } else {
            // Recete yoksa ürün maliyet fiyatını kullan
            const urunMaliyeti = kalem.urun.maliyetFiyati || 0;
            const siparisKg = convertToKg(kalem.miktar, kalem.birim);
            kalemMaliyet = urunMaliyeti * siparisKg;
        }

        // Ambalaj maliyeti (kutu ve tepsi/tava)
        if (kalem.kutu) {
            // Kutu için fiyat bilgisi şu an yok, ihtiyaç olursa eklenir
        }
        if (kalem.tepsiTava) {
            // TepsiTava için fiyat bilgisi ayrı tabloda
        }

        toplamMaliyet += kalemMaliyet;
    }

    toplamMaliyet += ambalajMaliyeti;

    return {
        toplamMaliyet,
        malzemeDetaylari,
        ambalajMaliyeti,
        urunSayisi: kalemler.length
    };
}

// Birim çevrim çarpanı
function getBirimCarpan(kaynakBirim, hedefBirim) {
    const birimler = {
        'GRAM': 0.001,
        'KG': 1,
        'LITRE': 1,
        'ML': 0.001,
        'ADET': 1,
        'PAKET': 1
    };

    const kaynak = birimler[kaynakBirim] || 1;
    const hedef = birimler[hedefBirim] || 1;

    return kaynak / hedef;
}

// KG'a çevir
function convertToKg(miktar, birim) {
    const carpanlar = {
        'KG': 1,
        'GRAM': 0.001,
        'ADET': 1, // Adet için 1 kg varsayıyoruz
        'PAKET': 1,
        'KUTU': 1,
        'TEPSI': 1
    };

    return miktar * (carpanlar[birim] || 1);
}

// Kalem birim maliyet hesaplama
function calculateKalemBirimMaliyet(kalem, maliyetDetay) {
    if (!maliyetDetay || !maliyetDetay.malzemeDetaylari) {
        return 0;
    }

    // Bu kalem için toplam maliyet
    const kalemMaliyeti = maliyetDetay.malzemeDetaylari
        .filter(m => m.kalemId === kalem.id)
        .reduce((sum, m) => sum + m.toplamMaliyet, 0);

    // Birim maliyet = toplam maliyet / miktar
    const siparisKg = convertToKg(kalem.miktar, kalem.birim);
    return siparisKg > 0 ? kalemMaliyeti / siparisKg : 0;
}

// Kalem toplam maliyet hesaplama
function calculateKalemToplamMaliyet(kalem, maliyetDetay) {
    if (!maliyetDetay || !maliyetDetay.malzemeDetaylari) {
        return 0;
    }

    // Bu kalem için toplam maliyet
    const kalemMaliyeti = maliyetDetay.malzemeDetaylari
        .filter(m => m.kalemId === kalem.id)
        .reduce((sum, m) => sum + m.toplamMaliyet, 0);

    // Ambalaj maliyeti de ekle (kalem başına paylaştır)
    const ambalajPayi = maliyetDetay.ambalajMaliyeti / maliyetDetay.urunSayisi;

    return kalemMaliyeti + ambalajPayi;
} 