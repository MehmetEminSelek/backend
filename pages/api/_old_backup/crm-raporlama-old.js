import prisma from '../../lib/prisma';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { startDate, endDate, reportType = 'tum' } = req.body;

    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Başlangıç ve bitiş tarihi gereklidir.' });
    }

    try {
        console.log(`📊 CRM Raporlama başlatılıyor: ${startDate} - ${endDate}, Tip: ${reportType}`);

        // 1. Temel sipariş verilerini çek
        const siparisler = await prisma.siparis.findMany({
            where: {
                tarih: { gte: new Date(startDate), lte: new Date(endDate) },
                onaylandiMi: true
            },
            include: {
                sube: { select: { ad: true } },
                teslimatTuru: { select: { ad: true } },
                kalemler: {
                    include: {
                        urun: { select: { ad: true, kategoriId: true } },
                        kutu: { select: { ad: true } }
                    }
                },
                odemeler: true
            },
            orderBy: { tarih: 'asc' }
        });

        console.log(`📊 ${siparisler.length} sipariş bulundu`);

        // 2. KPI Hesaplamaları
        const kpiData = await calculateKPI(siparisler, startDate, endDate);

        // 3. Satış Trendi
        const satisTrend = await calculateSatisTrend(siparisler);

        // 4. Saatlik Satış Dağılımı
        const saatlikSatis = await calculateSaatlikSatis(siparisler);

        // 5. Müşteri Segmentasyonu
        const musteriSegment = await calculateMusteriSegment(siparisler);

        // 6. En Değerli Müşteriler
        const degerliMusteri = await calculateDegerliMusteri(siparisler);

        // 7. En Çok Satan Ürünler
        const enCokSatan = await calculateEnCokSatan(siparisler);

        // 8. Kategori Dağılımı
        const kategoriDagilim = await calculateKategoriDagilim(siparisler);

        // 9. Şube Performansı
        const subePerformans = await calculateSubePerformans(siparisler);

        // 10. Kargo Durumu Dağılımı
        const kargoDurum = await calculateKargoDurum(siparisler);

        // 11. Gelir/Gider Analizi
        const gelirGider = await calculateGelirGider(siparisler);

        // 12. Kar Marjı Analizi
        const karMarji = await calculateKarMarji(siparisler);

        // 13. Müşteri Kazanım Trendi
        const musteriKazanim = await calculateMusteriKazanim(siparisler);

        // 14. Müşteri Kaybı Analizi
        const musteriKayip = await calculateMusteriKayip(siparisler);

        // 15. Detaylı Tablo Verileri
        const satisDetay = await generateSatisDetay(siparisler);
        const musteriAnaliz = await generateMusteriAnaliz(siparisler);
        const urunPerformans = await generateUrunPerformans(siparisler);
        const stokDurum = await generateStokDurum();
        const finansalAnaliz = await generateFinansalAnaliz(siparisler);
        const kampanyaPerformans = await generateKampanyaPerformans();

        const response = {
            kpi: kpiData,
            satisTrend,
            saatlikSatis,
            musteriSegment,
            degerliMusteri,
            enCokSatan,
            kategoriDagilim,
            subePerformans,
            kargoDurum,
            gelirGider,
            karMarji,
            musteriKazanim,
            musteriKayip,
            satisDetay,
            musteriAnaliz,
            urunPerformans,
            stokDurum,
            finansalAnaliz,
            kampanyaPerformans
        };

        console.log('📊 CRM Raporlama tamamlandı');
        return res.status(200).json(response);

    } catch (error) {
        console.error('❌ CRM Raporlama hatası:', error);
        return res.status(500).json({
            message: 'CRM raporu oluşturulurken hata oluştu.',
            error: error.message
        });
    }
}

// KPI Hesaplama
async function calculateKPI(siparisler, startDate, endDate) {
    const toplamCiro = siparisler.reduce((sum, sip) => {
        return sum + sip.kalemler.reduce((kalemSum, kalem) => {
            return kalemSum + ((kalem.birimFiyat || 0) * (kalem.miktar || 0));
        }, 0);
    }, 0);

    const toplamSiparis = siparisler.length;
    const ortalamaSepetTutari = toplamSiparis > 0 ? toplamCiro / toplamSiparis : 0;

    // Benzersiz müşteri sayısı
    const musteriSet = new Set();
    siparisler.forEach(sip => {
        const musteri = sip.gorunecekAd || sip.gonderenAdi || sip.aliciAdi;
        if (musteri) musteriSet.add(musteri);
    });
    const aktifMusteriSayisi = musteriSet.size;

    // Geçen dönem karşılaştırması (30 gün öncesi)
    const gecenDonemStart = new Date(startDate);
    gecenDonemStart.setDate(gecenDonemStart.getDate() - 30);
    const gecenDonemEnd = new Date(startDate);
    gecenDonemEnd.setDate(gecenDonemEnd.getDate() - 1);

    const gecenDonemSiparisler = await prisma.siparis.findMany({
        where: {
            tarih: { gte: gecenDonemStart, lte: gecenDonemEnd },
            onaylandiMi: true
        },
        include: {
            kalemler: true
        }
    });

    const gecenDonemCiro = gecenDonemSiparisler.reduce((sum, sip) => {
        return sum + sip.kalemler.reduce((kalemSum, kalem) => {
            return kalemSum + ((kalem.birimFiyat || 0) * (kalem.miktar || 0));
        }, 0);
    }, 0);

    const gecenDonemSiparis = gecenDonemSiparisler.length;
    const gecenDonemOrtalama = gecenDonemSiparis > 0 ? gecenDonemCiro / gecenDonemSiparis : 0;

    return {
        toplamCiro: Math.round(toplamCiro * 100) / 100,
        ciroArtis: gecenDonemCiro > 0 ? Math.round(((toplamCiro - gecenDonemCiro) / gecenDonemCiro) * 100) : 0,
        toplamSiparis,
        siparisArtis: gecenDonemSiparis > 0 ? Math.round(((toplamSiparis - gecenDonemSiparis) / gecenDonemSiparis) * 100) : 0,
        ortalamaSepetTutari: Math.round(ortalamaSepetTutari * 100) / 100,
        sepetArtis: gecenDonemOrtalama > 0 ? Math.round(((ortalamaSepetTutari - gecenDonemOrtalama) / gecenDonemOrtalama) * 100) : 0,
        aktifMusteriSayisi,
        musteriArtis: 0 // Bu hesaplama daha karmaşık olabilir
    };
}

// Satış Trendi
function calculateSatisTrend(siparisler) {
    const gunlukMap = {};

    siparisler.forEach(sip => {
        const tarih = sip.tarih.toISOString().slice(0, 10);
        if (!gunlukMap[tarih]) gunlukMap[tarih] = 0;

        const siparisCiro = sip.kalemler.reduce((sum, kalem) => {
            return sum + ((kalem.birimFiyat || 0) * (kalem.miktar || 0));
        }, 0);

        gunlukMap[tarih] += siparisCiro;
    });

    const labels = Object.keys(gunlukMap).sort();
    const data = labels.map(tarih => Math.round(gunlukMap[tarih] * 100) / 100);

    return {
        labels,
        datasets: [{
            label: 'Günlük Ciro (₺)',
            data,
            borderColor: '#1976D2',
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
            tension: 0.4,
            fill: true
        }]
    };
}

// Saatlik Satış Dağılımı
function calculateSaatlikSatis(siparisler) {
    const saatlikMap = {};

    siparisler.forEach(sip => {
        const saat = sip.tarih.getHours();
        if (!saatlikMap[saat]) saatlikMap[saat] = 0;

        const siparisCiro = sip.kalemler.reduce((sum, kalem) => {
            return sum + ((kalem.birimFiyat || 0) * (kalem.miktar || 0));
        }, 0);

        saatlikMap[saat] += siparisCiro;
    });

    const labels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
    const data = labels.map((_, i) => Math.round(saatlikMap[i] * 100) / 100);

    return {
        labels,
        datasets: [{
            label: 'Saatlik Ciro (₺)',
            data,
            backgroundColor: 'rgba(76, 175, 80, 0.8)',
            borderColor: '#4CAF50',
            borderWidth: 1
        }]
    };
}

// Müşteri Segmentasyonu
function calculateMusteriSegment(siparisler) {
    const musteriMap = {};

    siparisler.forEach(sip => {
        const musteri = sip.gorunecekAd || sip.gonderenAdi || sip.aliciAdi;
        if (!musteri) return;

        if (!musteriMap[musteri]) {
            musteriMap[musteri] = {
                toplamHarcama: 0,
                siparisSayisi: 0
            };
        }

        const siparisCiro = sip.kalemler.reduce((sum, kalem) => {
            return sum + ((kalem.birimFiyat || 0) * (kalem.miktar || 0));
        }, 0);

        musteriMap[musteri].toplamHarcama += siparisCiro;
        musteriMap[musteri].siparisSayisi += 1;
    });

    // Segmentasyon: VIP (>1000₺), Premium (500-1000₺), Regular (<500₺)
    const segmentler = { VIP: 0, Premium: 0, Regular: 0 };

    Object.values(musteriMap).forEach(musteri => {
        if (musteri.toplamHarcama > 1000) segmentler.VIP++;
        else if (musteri.toplamHarcama > 500) segmentler.Premium++;
        else segmentler.Regular++;
    });

    return {
        labels: Object.keys(segmentler),
        datasets: [{
            data: Object.values(segmentler),
            backgroundColor: ['#FFD700', '#C0C0C0', '#CD7F32'],
            borderWidth: 2,
            borderColor: '#fff'
        }]
    };
}

// En Değerli Müşteriler
function calculateDegerliMusteri(siparisler) {
    const musteriMap = {};

    siparisler.forEach(sip => {
        const musteri = sip.gorunecekAd || sip.gonderenAdi || sip.aliciAdi;
        if (!musteri) return;

        if (!musteriMap[musteri]) musteriMap[musteri] = 0;

        const siparisCiro = sip.kalemler.reduce((sum, kalem) => {
            return sum + ((kalem.birimFiyat || 0) * (kalem.miktar || 0));
        }, 0);

        musteriMap[musteri] += siparisCiro;
    });

    const sortedMusteriler = Object.entries(musteriMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

    return {
        labels: sortedMusteriler.map(([musteri]) => musteri),
        datasets: [{
            label: 'Toplam Harcama (₺)',
            data: sortedMusteriler.map(([, harcama]) => Math.round(harcama * 100) / 100),
            backgroundColor: 'rgba(255, 193, 7, 0.8)',
            borderColor: '#FFC107',
            borderWidth: 1
        }]
    };
}

// En Çok Satan Ürünler
function calculateEnCokSatan(siparisler) {
    const urunMap = {};

    siparisler.forEach(sip => {
        sip.kalemler.forEach(kalem => {
            const urunAd = kalem.urun?.ad || 'Bilinmeyen Ürün';
            if (!urunMap[urunAd]) urunMap[urunAd] = 0;
            urunMap[urunAd] += kalem.miktar || 0;
        });
    });

    const sortedUrunler = Object.entries(urunMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

    return {
        labels: sortedUrunler.map(([urun]) => urun),
        datasets: [{
            label: 'Satış Miktarı',
            data: sortedUrunler.map(([, miktar]) => Math.round(miktar * 100) / 100),
            backgroundColor: 'rgba(76, 175, 80, 0.8)',
            borderColor: '#4CAF50',
            borderWidth: 1
        }]
    };
}

// Kategori Dağılımı
function calculateKategoriDagilim(siparisler) {
    const kategoriMap = {};

    siparisler.forEach(sip => {
        sip.kalemler.forEach(kalem => {
            const kategori = kalem.urun?.kategoriId ? `Kategori ${kalem.urun.kategoriId}` : 'Kategorisiz';
            if (!kategoriMap[kategori]) kategoriMap[kategori] = 0;
            kategoriMap[kategori] += kalem.miktar || 0;
        });
    });

    return {
        labels: Object.keys(kategoriMap),
        datasets: [{
            data: Object.values(kategoriMap),
            backgroundColor: [
                '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
            ],
            borderWidth: 2,
            borderColor: '#fff'
        }]
    };
}

// Şube Performansı
function calculateSubePerformans(siparisler) {
    const subeMap = {};

    siparisler.forEach(sip => {
        const subeAd = sip.sube?.ad || 'Şube Yok';
        if (!subeMap[subeAd]) subeMap[subeAd] = 0;

        const siparisCiro = sip.kalemler.reduce((sum, kalem) => {
            return sum + ((kalem.birimFiyat || 0) * (kalem.miktar || 0));
        }, 0);

        subeMap[subeAd] += siparisCiro;
    });

    const sortedSubeler = Object.entries(subeMap)
        .sort(([, a], [, b]) => b - a);

    return {
        labels: sortedSubeler.map(([sube]) => sube),
        datasets: [{
            label: 'Şube Ciro (₺)',
            data: sortedSubeler.map(([, ciro]) => Math.round(ciro * 100) / 100),
            backgroundColor: 'rgba(33, 150, 243, 0.8)',
            borderColor: '#2196F3',
            borderWidth: 1
        }]
    };
}

// Kargo Durumu Dağılımı
function calculateKargoDurum(siparisler) {
    const durumMap = {};

    siparisler.forEach(sip => {
        const durum = sip.kargoDurumu || 'Belirsiz';
        durumMap[durum] = (durumMap[durum] || 0) + 1;
    });

    return {
        labels: Object.keys(durumMap),
        datasets: [{
            data: Object.values(durumMap),
            backgroundColor: [
                '#4CAF50', '#2196F3', '#FF9800', '#F44336',
                '#9C27B0', '#607D8B'
            ],
            borderWidth: 2,
            borderColor: '#fff'
        }]
    };
}

// Gelir/Gider Analizi
function calculateGelirGider(siparisler) {
    const aylikMap = {};

    siparisler.forEach(sip => {
        const ay = sip.tarih.toISOString().slice(0, 7); // YYYY-MM formatı
        if (!aylikMap[ay]) aylikMap[ay] = { gelir: 0, gider: 0 };

        const siparisCiro = sip.kalemler.reduce((sum, kalem) => {
            return sum + ((kalem.birimFiyat || 0) * (kalem.miktar || 0));
        }, 0);

        aylikMap[ay].gelir += siparisCiro;
        // Gider hesaplaması (örnek: ciro'nun %60'ı)
        aylikMap[ay].gider += siparisCiro * 0.6;
    });

    const labels = Object.keys(aylikMap).sort();
    const gelirData = labels.map(ay => Math.round(aylikMap[ay].gelir * 100) / 100);
    const giderData = labels.map(ay => Math.round(aylikMap[ay].gider * 100) / 100);

    return {
        labels,
        datasets: [
            {
                label: 'Gelir (₺)',
                data: gelirData,
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                tension: 0.4
            },
            {
                label: 'Gider (₺)',
                data: giderData,
                borderColor: '#F44336',
                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                tension: 0.4
            }
        ]
    };
}

// Kar Marjı Analizi
function calculateKarMarji(siparisler) {
    const urunMap = {};

    siparisler.forEach(sip => {
        sip.kalemler.forEach(kalem => {
            const urunAd = kalem.urun?.ad || 'Bilinmeyen Ürün';
            if (!urunMap[urunAd]) urunMap[urunAd] = { satis: 0, maliyet: 0 };

            const satisTutari = (kalem.birimFiyat || 0) * (kalem.miktar || 0);
            const maliyet = satisTutari * 0.7; // Örnek maliyet hesaplaması

            urunMap[urunAd].satis += satisTutari;
            urunMap[urunAd].maliyet += maliyet;
        });
    });

    const karMarjiData = Object.entries(urunMap)
        .map(([urun, data]) => ({
            urun,
            karMarji: data.satis > 0 ? ((data.satis - data.maliyet) / data.satis) * 100 : 0
        }))
        .sort((a, b) => b.karMarji - a.karMarji)
        .slice(0, 10);

    return {
        labels: karMarjiData.map(item => item.urun),
        datasets: [{
            label: 'Kar Marjı (%)',
            data: karMarjiData.map(item => Math.round(item.karMarji * 100) / 100),
            backgroundColor: 'rgba(255, 193, 7, 0.8)',
            borderColor: '#FFC107',
            borderWidth: 1
        }]
    };
}

// Müşteri Kazanım Trendi
function calculateMusteriKazanim(siparisler) {
    const gunlukMap = {};

    siparisler.forEach(sip => {
        const tarih = sip.tarih.toISOString().slice(0, 10);
        if (!gunlukMap[tarih]) gunlukMap[tarih] = new Set();

        const musteri = sip.gorunecekAd || sip.gonderenAdi || sip.aliciAdi;
        if (musteri) gunlukMap[tarih].add(musteri);
    });

    const labels = Object.keys(gunlukMap).sort();
    const data = labels.map(tarih => gunlukMap[tarih].size);

    return {
        labels,
        datasets: [{
            label: 'Yeni Müşteri Sayısı',
            data,
            borderColor: '#9C27B0',
            backgroundColor: 'rgba(156, 39, 176, 0.1)',
            tension: 0.4,
            fill: true
        }]
    };
}

// Müşteri Kaybı Analizi
function calculateMusteriKayip(siparisler) {
    // Son 30 günde sipariş vermeyen müşteriler
    const musteriSonSiparis = {};

    siparisler.forEach(sip => {
        const musteri = sip.gorunecekAd || sip.gonderenAdi || sip.aliciAdi;
        if (!musteri) return;

        if (!musteriSonSiparis[musteri] || sip.tarih > musteriSonSiparis[musteri]) {
            musteriSonSiparis[musteri] = sip.tarih;
        }
    });

    const simdi = new Date();
    const kayipMusteriler = Object.entries(musteriSonSiparis)
        .filter(([, sonSiparis]) => {
            const gunFarki = (simdi - sonSiparis) / (1000 * 60 * 60 * 24);
            return gunFarki > 30;
        })
        .slice(0, 10);

    return {
        labels: kayipMusteriler.map(([musteri]) => musteri),
        datasets: [{
            label: 'Kayıp Müşteri (Gün)',
            data: kayipMusteriler.map(([, sonSiparis]) => {
                const gunFarki = (simdi - sonSiparis) / (1000 * 60 * 60 * 24);
                return Math.round(gunFarki);
            }),
            backgroundColor: 'rgba(244, 67, 54, 0.8)',
            borderColor: '#F44336',
            borderWidth: 1
        }]
    };
}

// Detaylı Tablo Verileri
async function generateSatisDetay(siparisler) {
    const detay = [];

    siparisler.forEach(sip => {
        sip.kalemler.forEach(kalem => {
            const tutar = (kalem.birimFiyat || 0) * (kalem.miktar || 0);
            detay.push({
                tarih: sip.tarih.toISOString().slice(0, 10),
                musteri: sip.gorunecekAd || sip.gonderenAdi || sip.aliciAdi || '-',
                urun: kalem.urun?.ad || '-',
                miktar: kalem.miktar || 0,
                tutar: Math.round(tutar * 100) / 100
            });
        });
    });

    return detay;
}

async function generateMusteriAnaliz(siparisler) {
    const musteriMap = {};

    siparisler.forEach(sip => {
        const musteri = sip.gorunecekAd || sip.gonderenAdi || sip.aliciAdi;
        if (!musteri) return;

        if (!musteriMap[musteri]) {
            musteriMap[musteri] = {
                musteri,
                toplamSiparis: 0,
                toplamHarcama: 0,
                sonSiparis: sip.tarih,
                segment: 'Regular'
            };
        }

        const siparisCiro = sip.kalemler.reduce((sum, kalem) => {
            return sum + ((kalem.birimFiyat || 0) * (kalem.miktar || 0));
        }, 0);

        musteriMap[musteri].toplamSiparis += 1;
        musteriMap[musteri].toplamHarcama += siparisCiro;

        if (sip.tarih > musteriMap[musteri].sonSiparis) {
            musteriMap[musteri].sonSiparis = sip.tarih;
        }
    });

    // Segment belirleme
    Object.values(musteriMap).forEach(musteri => {
        if (musteri.toplamHarcama > 1000) musteri.segment = 'VIP';
        else if (musteri.toplamHarcama > 500) musteri.segment = 'Premium';
    });

    return Object.values(musteriMap).sort((a, b) => b.toplamHarcama - a.toplamHarcama);
}

async function generateUrunPerformans(siparisler) {
    const urunMap = {};

    siparisler.forEach(sip => {
        sip.kalemler.forEach(kalem => {
            const urunAd = kalem.urun?.ad || 'Bilinmeyen Ürün';
            if (!urunMap[urunAd]) {
                urunMap[urunAd] = {
                    urun: urunAd,
                    satisAdedi: 0,
                    toplamCiro: 0,
                    karMarji: 0,
                    stokDurumu: 'Yeterli'
                };
            }

            const satisTutari = (kalem.birimFiyat || 0) * (kalem.miktar || 0);
            const maliyet = satisTutari * 0.7;

            urunMap[urunAd].satisAdedi += kalem.miktar || 0;
            urunMap[urunAd].toplamCiro += satisTutari;
            urunMap[urunAd].karMarji = urunMap[urunAd].toplamCiro > 0 ?
                ((urunMap[urunAd].toplamCiro - (urunMap[urunAd].toplamCiro * 0.7)) / urunMap[urunAd].toplamCiro) * 100 : 0;
        });
    });

    return Object.values(urunMap).sort((a, b) => b.toplamCiro - a.toplamCiro);
}

async function generateStokDurum() {
    try {
        const stoklar = await prisma.stok.findMany({
            include: {
                hammadde: true,
                yariMamul: true,
                operasyonBirimi: true
            }
        });

        return stoklar.map(stok => ({
            stokAdi: stok.hammadde?.ad || stok.yariMamul?.ad || 'Bilinmeyen',
            mevcutStok: stok.miktarGram || 0,
            minimumStok: stok.minimumMiktarGram || 0,
            kritikSeviye: (stok.miktarGram || 0) < (stok.minimumMiktarGram || 0),
            sonGuncelleme: stok.updatedAt?.toISOString().slice(0, 10) || '-'
        }));
    } catch (error) {
        console.error('Stok durumu alınamadı:', error);
        return [];
    }
}

async function generateFinansalAnaliz(siparisler) {
    const aylikMap = {};

    siparisler.forEach(sip => {
        const ay = sip.tarih.toISOString().slice(0, 7);
        if (!aylikMap[ay]) aylikMap[ay] = { toplamGelir: 0, toplamGider: 0 };

        const siparisCiro = sip.kalemler.reduce((sum, kalem) => {
            return sum + ((kalem.birimFiyat || 0) * (kalem.miktar || 0));
        }, 0);

        aylikMap[ay].toplamGelir += siparisCiro;
        aylikMap[ay].toplamGider += siparisCiro * 0.6; // Örnek gider oranı
    });

    return Object.entries(aylikMap).map(([donem, data]) => ({
        donem,
        toplamGelir: Math.round(data.toplamGelir * 100) / 100,
        toplamGider: Math.round(data.toplamGider * 100) / 100,
        netKar: Math.round((data.toplamGelir - data.toplamGider) * 100) / 100,
        karMarji: data.toplamGelir > 0 ? Math.round(((data.toplamGelir - data.toplamGider) / data.toplamGelir) * 100) : 0
    }));
}

async function generateKampanyaPerformans() {
    // Örnek kampanya verileri
    return [
        {
            kampanya: 'Yılbaşı Kampanyası',
            baslangic: '2024-12-01',
            bitis: '2024-12-31',
            maliyet: 5000,
            gelir: 25000,
            roi: 400
        },
        {
            kampanya: 'Bahar Kampanyası',
            baslangic: '2024-03-01',
            bitis: '2024-03-31',
            maliyet: 3000,
            gelir: 18000,
            roi: 500
        }
    ];
} 