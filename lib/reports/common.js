// ===================================================================
// 📊 ORTAK RAPOR FONKSİYONLARI
// Tüm raporlama modüllerinde kullanılan utility fonksiyonlar
// ===================================================================

import prisma from '../prisma';

/**
 * 📅 Tarih aralığındaki siparişleri getir
 */
export async function getSiparislerByDateRange(startDate, endDate, options = {}) {
    const {
        includeDetails = true,
        onlyApproved = true,
        orderBy = { tarih: 'asc' }
    } = options;

    const whereClause = {
        tarih: {
            gte: new Date(startDate),
            lte: new Date(endDate)
        }
    };

    if (onlyApproved) {
        whereClause.durum = { 
            not: 'ONAY_BEKLEYEN' // Onay bekleyen hariç, onaylanmış siparişler
        };
    }

    return await prisma.siparis.findMany({
        where: whereClause,
        include: includeDetails ? {
            sube: { select: { ad: true, kod: true } },
            teslimatTuru: { select: { ad: true, kod: true } },
            cari: { select: { ad: true, musteriKodu: true } },
            kalemler: {
                include: {
                    urun: {
                        select: {
                            ad: true,
                            kod: true,
                            kategoriId: true,
                            kategori: { select: { ad: true } }
                        }
                    },
                    kutu: { select: { ad: true } }
                }
            },
            odemeler: {
                select: {
                    tutar: true,
                    odemeYontemi: true,
                    odemeTarihi: true
                }
            }
        } : {},
        orderBy
    });
}

/**
 * 💰 Temel finansal hesaplamalar
 */
export function calculateBasicKPIs(siparisler) {
    const kpis = {
        toplamSiparis: siparisler.length,
        toplamCiro: 0,
        toplamMaliyet: 0,
        toplamKar: 0,
        ortalamaSiparisDeğeri: 0,
        toplamUrunMiktari: 0
    };

    siparisler.forEach(siparis => {
        kpis.toplamCiro += siparis.toplamTutar || 0;
        kpis.toplamMaliyet += siparis.toplamMaliyet || 0;

        if (siparis.kalemler) {
            siparis.kalemler.forEach(kalem => {
                kpis.toplamUrunMiktari += kalem.miktar || 0;
            });
        }
    });

    kpis.toplamKar = kpis.toplamCiro - kpis.toplamMaliyet;
    kpis.ortalamaSiparisDeğeri = kpis.toplamSiparis > 0 ?
        Math.round(kpis.toplamCiro / kpis.toplamSiparis * 100) / 100 : 0;

    return kpis;
}

/**
 * 📈 Günlük satış trendi
 */
export function calculateDailySalesTrend(siparisler) {
    const dailyData = {};

    siparisler.forEach(siparis => {
        const tarih = siparis.tarih.toISOString().slice(0, 10);
        if (!dailyData[tarih]) {
            dailyData[tarih] = {
                tarih,
                siparisAdeti: 0,
                ciro: 0,
                urunMiktari: 0
            };
        }

        dailyData[tarih].siparisAdeti += 1;
        dailyData[tarih].ciro += siparis.toplamTutar || 0;

        if (siparis.kalemler) {
            siparis.kalemler.forEach(kalem => {
                dailyData[tarih].urunMiktari += kalem.miktar || 0;
            });
        }
    });

    return Object.values(dailyData).sort((a, b) =>
        new Date(a.tarih) - new Date(b.tarih)
    );
}

/**
 * 🏢 Şube performans analizi
 */
export function calculateSubePerformance(siparisler) {
    const subeData = {};

    siparisler.forEach(siparis => {
        const subeAd = siparis.sube?.ad || 'Bilinmeyen';
        if (!subeData[subeAd]) {
            subeData[subeAd] = {
                subeAd,
                siparisAdeti: 0,
                ciro: 0,
                maliyet: 0,
                kar: 0
            };
        }

        subeData[subeAd].siparisAdeti += 1;
        subeData[subeAd].ciro += siparis.toplamTutar || 0;
        subeData[subeAd].maliyet += siparis.toplamMaliyet || 0;
    });

    // Kar hesapla
    Object.values(subeData).forEach(sube => {
        sube.kar = sube.ciro - sube.maliyet;
        sube.karMarji = sube.ciro > 0 ?
            Math.round((sube.kar / sube.ciro) * 100 * 100) / 100 : 0;
    });

    return Object.values(subeData).sort((a, b) => b.ciro - a.ciro);
}

/**
 * 🛍️ Ürün performans analizi
 */
export function calculateProductPerformance(siparisler) {
    const urunData = {};

    siparisler.forEach(siparis => {
        if (siparis.kalemler) {
            siparis.kalemler.forEach(kalem => {
                const urunAd = kalem.urun?.ad || 'Bilinmeyen';
                if (!urunData[urunAd]) {
                    urunData[urunAd] = {
                        urunAd,
                        toplamMiktar: 0,
                        toplamCiro: 0,
                        siparisAdeti: 0,
                        kategori: kalem.urun?.kategori?.ad || 'Kategori Yok'
                    };
                }

                urunData[urunAd].toplamMiktar += kalem.miktar || 0;
                urunData[urunAd].toplamCiro += (kalem.miktar || 0) * (kalem.birimFiyat || 0);
                urunData[urunAd].siparisAdeti += 1;
            });
        }
    });

    return Object.values(urunData).sort((a, b) => b.toplamCiro - a.toplamCiro);
}

/**
 * 📊 Kategori dağılım analizi
 */
export function calculateCategoryDistribution(siparisler) {
    const kategoriData = {};

    siparisler.forEach(siparis => {
        if (siparis.kalemler) {
            siparis.kalemler.forEach(kalem => {
                const kategori = kalem.urun?.kategori?.ad || 'Kategori Yok';
                if (!kategoriData[kategori]) {
                    kategoriData[kategori] = {
                        kategori,
                        toplamMiktar: 0,
                        toplamCiro: 0,
                        urunCesitliligi: new Set()
                    };
                }

                kategoriData[kategori].toplamMiktar += kalem.miktar || 0;
                kategoriData[kategori].toplamCiro += (kalem.miktar || 0) * (kalem.birimFiyat || 0);
                if (kalem.urun?.ad) {
                    kategoriData[kategori].urunCesitliligi.add(kalem.urun.ad);
                }
            });
        }
    });

    // Set'i array'e çevir
    Object.values(kategoriData).forEach(kategori => {
        kategori.urunSayisi = kategori.urunCesitliligi.size;
        delete kategori.urunCesitliligi;
    });

    return Object.values(kategoriData).sort((a, b) => b.toplamCiro - a.toplamCiro);
}

/**
 * 💳 Ödeme yöntemi analizi  
 */
export function calculatePaymentMethodAnalysis(siparisler) {
    const odemeData = {};

    siparisler.forEach(siparis => {
        if (siparis.odemeler && siparis.odemeler.length > 0) {
            siparis.odemeler.forEach(odeme => {
                const yontem = odeme.odemeYontemi || 'Belirtilmemiş';
                if (!odemeData[yontem]) {
                    odemeData[yontem] = {
                        yontem,
                        toplamTutar: 0,
                        islemSayisi: 0
                    };
                }

                odemeData[yontem].toplamTutar += odeme.tutar || 0;
                odemeData[yontem].islemSayisi += 1;
            });
        }
    });

    return Object.values(odemeData).sort((a, b) => b.toplamTutar - a.toplamTutar);
}

/**
 * 🎯 Müşteri segmentasyon analizi
 */
export function calculateCustomerSegmentation(siparisler) {
    const musteriData = {};

    siparisler.forEach(siparis => {
        const musteriAd = siparis.cari?.ad || siparis.gonderenAdi || 'Misafir';
        if (!musteriData[musteriAd]) {
            musteriData[musteriAd] = {
                musteriAd,
                siparisAdeti: 0,
                toplamHarcama: 0,
                sonSiparisTarihi: null,
                ilkSiparisTarihi: null
            };
        }

        musteriData[musteriAd].siparisAdeti += 1;
        musteriData[musteriAd].toplamHarcama += siparis.toplamTutar || 0;

        const siparisTarihi = new Date(siparis.tarih);
        if (!musteriData[musteriAd].sonSiparisTarihi || siparisTarihi > musteriData[musteriAd].sonSiparisTarihi) {
            musteriData[musteriAd].sonSiparisTarihi = siparisTarihi;
        }
        if (!musteriData[musteriAd].ilkSiparisTarihi || siparisTarihi < musteriData[musteriAd].ilkSiparisTarihi) {
            musteriData[musteriAd].ilkSiparisTarihi = siparisTarihi;
        }
    });

    // Segmentasyon
    const customers = Object.values(musteriData);
    customers.forEach(musteri => {
        musteri.ortalamaSiparisDeğeri = musteri.siparisAdeti > 0 ?
            Math.round(musteri.toplamHarcama / musteri.siparisAdeti * 100) / 100 : 0;

        // Müşteri segmenti belirleme
        if (musteri.toplamHarcama >= 5000 && musteri.siparisAdeti >= 10) {
            musteri.segment = 'VIP';
        } else if (musteri.toplamHarcama >= 2000 && musteri.siparisAdeti >= 5) {
            musteri.segment = 'Sadık';
        } else if (musteri.siparisAdeti >= 3) {
            musteri.segment = 'Düzenli';
        } else {
            musteri.segment = 'Yeni';
        }
    });

    return customers.sort((a, b) => b.toplamHarcama - a.toplamHarcama);
}

/**
 * 📈 Haftalık trend analizi
 */
export function calculateWeeklyTrend(siparisler) {
    const weeklyData = {};

    siparisler.forEach(siparis => {
        const tarih = new Date(siparis.tarih);
        const yil = tarih.getFullYear();
        const hafta = getWeekNumber(tarih);
        const key = `${yil}-W${hafta.toString().padStart(2, '0')}`;

        if (!weeklyData[key]) {
            weeklyData[key] = {
                hafta: key,
                siparisAdeti: 0,
                ciro: 0,
                maliyet: 0
            };
        }

        weeklyData[key].siparisAdeti += 1;
        weeklyData[key].ciro += siparis.toplamTutar || 0;
        weeklyData[key].maliyet += siparis.toplamMaliyet || 0;
    });

    return Object.values(weeklyData).sort((a, b) => a.hafta.localeCompare(b.hafta));
}

/**
 * 🗓️ Haftanın numarasını hesapla
 */
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * ⏰ Saatlik satış analizi
 */
export function calculateHourlySales(siparisler) {
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        saat: i,
        siparisAdeti: 0,
        ciro: 0
    }));

    siparisler.forEach(siparis => {
        const saat = new Date(siparis.createdAt || siparis.tarih).getHours();
        hourlyData[saat].siparisAdeti += 1;
        hourlyData[saat].ciro += siparis.toplamTutar || 0;
    });

    return hourlyData;
}

/**
 * 🔄 Formatters
 */
export const formatters = {
    currency: (amount) => {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY'
        }).format(amount || 0);
    },

    percentage: (value) => {
        return `${Math.round((value || 0) * 100) / 100}%`;
    },

    number: (value) => {
        return new Intl.NumberFormat('tr-TR').format(value || 0);
    },

    date: (date) => {
        return new Date(date).toLocaleDateString('tr-TR');
    }
}; 