// ===================================================================
// 💰 MALİYET HESAPLAMA MOTORU
// Üretim planı ve maliyet analizleri için utility fonksiyonlar
// ===================================================================

import prisma from '../prisma';

/**
 * 🏭 Sipariş maliyet hesaplama
 */
export async function calculateOrderCost(siparisId) {
    try {
        const siparis = await prisma.siparis.findUnique({
            where: { id: siparisId },
            include: {
                kalemler: {
                    include: {
                        urun: {
                            include: {
                                recipes: {
                                    where: { aktif: true },
                                    include: {
                                        icerikelek: {
                                            include: {
                                                material: {
                                                    select: {
                                                        ad: true,
                                                        kod: true,
                                                        birimFiyat: true,
                                                        birim: true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        kutu: {
                            select: {
                                ad: true,
                                maliyeti: true
                            }
                        }
                    }
                }
            }
        });

        if (!siparis) {
            throw new Error(`Sipariş bulunamadı: ${siparisId}`);
        }

        let toplamMaliyet = 0;
        const maliyetDetaylari = [];

        for (const kalem of siparis.kalemler) {
            const kalemMaliyet = await calculateOrderItemCost(kalem);
            toplamMaliyet += kalemMaliyet.toplamMaliyet;
            maliyetDetaylari.push(kalemMaliyet);
        }

        return {
            siparisId: siparis.id,
            toplamMaliyet: Math.round(toplamMaliyet * 100) / 100,
            maliyetDetaylari,
            hesaplamaTarihi: new Date()
        };

    } catch (error) {
        console.error('❌ Sipariş maliyet hesaplama hatası:', error);
        throw error;
    }
}

/**
 * 📦 Sipariş kalemi maliyet hesaplama
 */
export async function calculateOrderItemCost(kalem) {
    const maliyetDetay = {
        kalemId: kalem.id,
        urunAdi: kalem.urun?.ad || 'Bilinmeyen',
        miktar: kalem.miktar || 0,
        birim: kalem.birim || 'KG',
        hammaddeMaliyeti: 0,
        kutuMaliyeti: 0,
        toplamMaliyet: 0,
        hammaddeDetaylari: []
    };

    // Hammadde maliyeti hesapla (reçeteden)
    if (kalem.urun?.recipes && kalem.urun.recipes.length > 0) {
        const recipe = kalem.urun.recipes[0]; // İlk aktif reçeteyi al

        for (const ingredient of recipe.icerikelek) {
            const malzemeMiktar = (kalem.miktar || 0) * (ingredient.miktar || 0) / 1000; // Gram'dan KG'a
            const malzemeMaliyet = malzemeMiktar * (ingredient.material?.birimFiyat || 0);

            maliyetDetay.hammaddeMaliyeti += malzemeMaliyet;
            maliyetDetay.hammaddeDetaylari.push({
                malzemeAdi: ingredient.material?.ad || 'Bilinmeyen',
                malzemeKodu: ingredient.material?.kod || '',
                gerekliMiktar: malzemeMiktar,
                birimFiyat: ingredient.material?.birimFiyat || 0,
                maliyet: Math.round(malzemeMaliyet * 100) / 100
            });
        }
    }

    // Kutu maliyeti hesapla
    if (kalem.kutu) {
        maliyetDetay.kutuMaliyeti = (kalem.miktar || 0) * (kalem.kutu.maliyeti || 0);
    }

    // Toplam maliyet
    maliyetDetay.toplamMaliyet = maliyetDetay.hammaddeMaliyeti + maliyetDetay.kutuMaliyeti;
    maliyetDetay.toplamMaliyet = Math.round(maliyetDetay.toplamMaliyet * 100) / 100;

    return maliyetDetay;
}

/**
 * 📊 Dönemsel maliyet analizi
 */
export async function calculatePeriodCostAnalysis(startDate, endDate) {
    try {
        const siparisler = await prisma.siparis.findMany({
            where: {
                tarih: {
                    gte: new Date(startDate),
                    lte: new Date(endDate)
                },
                onaylandiMi: true
            },
            include: {
                kalemler: {
                    include: {
                        urun: {
                            include: {
                                recipes: {
                                    where: { aktif: true },
                                    include: {
                                        icerikelek: {
                                            include: {
                                                material: {
                                                    select: {
                                                        ad: true,
                                                        kod: true,
                                                        birimFiyat: true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        let toplamHammaddeMaliyeti = 0;
        let toplamKutuMaliyeti = 0;
        const malzemeKullanimlari = {};
        const urunMaliyetleri = {};

        for (const siparis of siparisler) {
            for (const kalem of siparis.kalemler) {
                const kalemMaliyet = await calculateOrderItemCost(kalem);

                toplamHammaddeMaliyeti += kalemMaliyet.hammaddeMaliyeti;
                toplamKutuMaliyeti += kalemMaliyet.kutuMaliyeti;

                // Ürün bazında maliyet toplama
                const urunAdi = kalem.urun?.ad || 'Bilinmeyen';
                if (!urunMaliyetleri[urunAdi]) {
                    urunMaliyetleri[urunAdi] = {
                        urunAdi,
                        toplamMiktar: 0,
                        toplamMaliyet: 0,
                        toplamCiro: 0
                    };
                }

                urunMaliyetleri[urunAdi].toplamMiktar += kalem.miktar || 0;
                urunMaliyetleri[urunAdi].toplamMaliyet += kalemMaliyet.toplamMaliyet;
                urunMaliyetleri[urunAdi].toplamCiro += (kalem.miktar || 0) * (kalem.birimFiyat || 0);

                // Malzeme kullanımları toplama
                for (const hammadde of kalemMaliyet.hammaddeDetaylari) {
                    const malzemeKodu = hammadde.malzemeKodu;
                    if (!malzemeKullanimlari[malzemeKodu]) {
                        malzemeKullanimlari[malzemeKodu] = {
                            malzemeAdi: hammadde.malzemeAdi,
                            malzemeKodu: hammadde.malzemeKodu,
                            toplamMiktar: 0,
                            toplamMaliyet: 0,
                            birimFiyat: hammadde.birimFiyat
                        };
                    }

                    malzemeKullanimlari[malzemeKodu].toplamMiktar += hammadde.gerekliMiktar;
                    malzemeKullanimlari[malzemeKodu].toplamMaliyet += hammadde.maliyet;
                }
            }
        }

        // Kar marjı hesaplamaları
        Object.values(urunMaliyetleri).forEach(urun => {
            urun.karMarji = urun.toplamCiro > 0 ?
                Math.round(((urun.toplamCiro - urun.toplamMaliyet) / urun.toplamCiro) * 100 * 100) / 100 : 0;
        });

        return {
            donem: { startDate, endDate },
            ozet: {
                toplamSiparisAdeti: siparisler.length,
                toplamHammaddeMaliyeti: Math.round(toplamHammaddeMaliyeti * 100) / 100,
                toplamKutuMaliyeti: Math.round(toplamKutuMaliyeti * 100) / 100,
                toplamMaliyet: Math.round((toplamHammaddeMaliyeti + toplamKutuMaliyeti) * 100) / 100
            },
            urunMaliyetleri: Object.values(urunMaliyetleri).sort((a, b) => b.toplamMaliyet - a.toplamMaliyet),
            malzemeKullanimlari: Object.values(malzemeKullanimlari).sort((a, b) => b.toplamMaliyet - a.toplamMaliyet),
            hesaplamaTarihi: new Date()
        };

    } catch (error) {
        console.error('❌ Dönemsel maliyet analizi hatası:', error);
        throw error;
    }
}

/**
 * 🏭 Üretim planı maliyet projeksiyonu
 */
export async function calculateProductionPlanCost(productionPlan) {
    try {
        const { planItems } = productionPlan;
        let toplamMaliyet = 0;
        const planMaliyetleri = [];

        for (const planItem of planItems) {
            const { urunId, miktar, planlanantarih } = planItem;

            // Ürün reçetesini al
            const urun = await prisma.urun.findUnique({
                where: { id: urunId },
                include: {
                    recipes: {
                        where: { aktif: true },
                        include: {
                            icerikelek: {
                                include: {
                                    material: {
                                        select: {
                                            ad: true,
                                            kod: true,
                                            birimFiyat: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (!urun) {
                console.warn(`Ürün bulunamadı: ${urunId}`);
                continue;
            }

            let urunMaliyeti = 0;
            const hammaddeListesi = [];

            if (urun.recipes && urun.recipes.length > 0) {
                const recipe = urun.recipes[0];

                for (const ingredient of recipe.icerikelek) {
                    const gerekliMiktar = miktar * (ingredient.miktar || 0) / 1000; // Gram'dan KG'a
                    const malzemeMaliyet = gerekliMiktar * (ingredient.material?.birimFiyat || 0);

                    urunMaliyeti += malzemeMaliyet;
                    hammaddeListesi.push({
                        malzemeAdi: ingredient.material?.ad || 'Bilinmeyen',
                        gerekliMiktar: Math.round(gerekliMiktar * 100) / 100,
                        birimFiyat: ingredient.material?.birimFiyat || 0,
                        maliyet: Math.round(malzemeMaliyet * 100) / 100
                    });
                }
            }

            toplamMaliyet += urunMaliyeti;
            planMaliyetleri.push({
                urunId,
                urunAdi: urun.ad,
                planlanantarih,
                miktar,
                birimMaliyet: urun.recipes?.[0]?.birimMaliyet || 0,
                toplamMaliyet: Math.round(urunMaliyeti * 100) / 100,
                hammaddeListesi
            });
        }

        return {
            planId: productionPlan.id || 'new',
            toplamMaliyet: Math.round(toplamMaliyet * 100) / 100,
            planMaliyetleri,
            hesaplamaTarihi: new Date()
        };

    } catch (error) {
        console.error('❌ Üretim planı maliyet hesaplama hatası:', error);
        throw error;
    }
}

/**
 * 📈 Maliyet trend analizi
 */
export async function calculateCostTrend(startDate, endDate, granularity = 'daily') {
    try {
        const siparisler = await prisma.siparis.findMany({
            where: {
                tarih: {
                    gte: new Date(startDate),
                    lte: new Date(endDate)
                },
                onaylandiMi: true
            },
            include: {
                kalemler: {
                    include: {
                        urun: {
                            include: {
                                recipes: {
                                    where: { aktif: true },
                                    include: {
                                        icerikelek: {
                                            include: {
                                                material: {
                                                    select: {
                                                        birimFiyat: true
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { tarih: 'asc' }
        });

        const trendData = {};

        for (const siparis of siparisler) {
            let periodKey;
            const tarih = new Date(siparis.tarih);

            switch (granularity) {
                case 'daily':
                    periodKey = tarih.toISOString().slice(0, 10);
                    break;
                case 'weekly':
                    const weekStart = new Date(tarih);
                    weekStart.setDate(tarih.getDate() - tarih.getDay());
                    periodKey = weekStart.toISOString().slice(0, 10);
                    break;
                case 'monthly':
                    periodKey = `${tarih.getFullYear()}-${(tarih.getMonth() + 1).toString().padStart(2, '0')}`;
                    break;
                default:
                    periodKey = tarih.toISOString().slice(0, 10);
            }

            if (!trendData[periodKey]) {
                trendData[periodKey] = {
                    period: periodKey,
                    siparisAdeti: 0,
                    toplamMaliyet: 0,
                    toplamCiro: 0,
                    hammaddeMaliyeti: 0,
                    kutuMaliyeti: 0
                };
            }

            trendData[periodKey].siparisAdeti += 1;
            trendData[periodKey].toplamCiro += siparis.toplamTutar || 0;

            for (const kalem of siparis.kalemler) {
                const kalemMaliyet = await calculateOrderItemCost(kalem);
                trendData[periodKey].toplamMaliyet += kalemMaliyet.toplamMaliyet;
                trendData[periodKey].hammaddeMaliyeti += kalemMaliyet.hammaddeMaliyeti;
                trendData[periodKey].kutuMaliyeti += kalemMaliyet.kutuMaliyeti;
            }
        }

        // Kar marjı hesaplamaları
        Object.values(trendData).forEach(period => {
            period.kar = period.toplamCiro - period.toplamMaliyet;
            period.karMarji = period.toplamCiro > 0 ?
                Math.round((period.kar / period.toplamCiro) * 100 * 100) / 100 : 0;
        });

        return Object.values(trendData).sort((a, b) => a.period.localeCompare(b.period));

    } catch (error) {
        console.error('❌ Maliyet trend analizi hatası:', error);
        throw error;
    }
}

/**
 * 🎯 En yüksek maliyetli ürünler
 */
export async function getHighCostProducts(limit = 10) {
    try {
        const urunler = await prisma.urun.findMany({
            include: {
                recipes: {
                    where: { aktif: true },
                    include: {
                        icerikelek: {
                            include: {
                                material: {
                                    select: {
                                        ad: true,
                                        birimFiyat: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        const urunMaliyetleri = [];

        for (const urun of urunler) {
            if (urun.recipes && urun.recipes.length > 0) {
                const recipe = urun.recipes[0];
                let urunMaliyeti = 0;

                for (const ingredient of recipe.icerikelek) {
                    const malzemeMaliyet = (ingredient.miktar || 0) / 1000 * (ingredient.material?.birimFiyat || 0);
                    urunMaliyeti += malzemeMaliyet;
                }

                urunMaliyetleri.push({
                    urunId: urun.id,
                    urunAdi: urun.ad,
                    birimMaliyet: Math.round(urunMaliyeti * 100) / 100,
                    hammaddeSayisi: recipe.icerikelek.length
                });
            }
        }

        return urunMaliyetleri
            .sort((a, b) => b.birimMaliyet - a.birimMaliyet)
            .slice(0, limit);

    } catch (error) {
        console.error('❌ Yüksek maliyetli ürünler analizi hatası:', error);
        throw error;
    }
}

/**
 * 📋 Malzeme ihtiyaç listesi
 */
export async function calculateMaterialRequirements(productionPlan) {
    try {
        const malzemeIhtiyaclari = {};

        for (const planItem of productionPlan.planItems) {
            const { urunId, miktar } = planItem;

            const urun = await prisma.urun.findUnique({
                where: { id: urunId },
                include: {
                    recipes: {
                        where: { aktif: true },
                        include: {
                            icerikelek: {
                                include: {
                                    material: {
                                        select: {
                                            ad: true,
                                            kod: true,
                                            birim: true,
                                            mevcutStok: true,
                                            minStokSeviye: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (urun?.recipes?.[0]) {
                const recipe = urun.recipes[0];

                for (const ingredient of recipe.icerikelek) {
                    const malzemeKodu = ingredient.material?.kod;
                    if (!malzemeKodu) continue;

                    const gerekliMiktar = miktar * (ingredient.miktar || 0) / 1000; // Gram'dan KG'a

                    if (!malzemeIhtiyaclari[malzemeKodu]) {
                        malzemeIhtiyaclari[malzemeKodu] = {
                            malzemeAdi: ingredient.material.ad,
                            malzemeKodu: malzemeKodu,
                            birim: ingredient.material.birim,
                            toplamIhtiyac: 0,
                            mevcutStok: ingredient.material.mevcutStok || 0,
                            minStokSeviye: ingredient.material.minStokSeviye || 0,
                            eksikMiktar: 0,
                            kullanimDetaylari: []
                        };
                    }

                    malzemeIhtiyaclari[malzemeKodu].toplamIhtiyac += gerekliMiktar;
                    malzemeIhtiyaclari[malzemeKodu].kullanimDetaylari.push({
                        urunAdi: urun.ad,
                        planlanantarih: planItem.planlanantarih,
                        miktar: gerekliMiktar
                    });
                }
            }
        }

        // Eksik miktar hesapla
        Object.values(malzemeIhtiyaclari).forEach(malzeme => {
            malzeme.eksikMiktar = Math.max(0, malzeme.toplamIhtiyac - malzeme.mevcutStok);
            malzeme.yeterliStok = malzeme.eksikMiktar === 0;
        });

        return {
            malzemeIhtiyaclari: Object.values(malzemeIhtiyaclari),
            ozet: {
                toplamMalzemeSayisi: Object.keys(malzemeIhtiyaclari).length,
                eksikMalzemeSayisi: Object.values(malzemeIhtiyaclari).filter(m => !m.yeterliStok).length,
                yeterliMalzemeSayisi: Object.values(malzemeIhtiyaclari).filter(m => m.yeterliStok).length
            }
        };

    } catch (error) {
        console.error('❌ Malzeme ihtiyaç hesaplama hatası:', error);
        throw error;
    }
} 