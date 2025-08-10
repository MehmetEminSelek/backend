// ===================================================================
// 🔄 UYUMLULUK ALIASI - ESKİ ÜRETİM PLANI ENDPOINT'İ
// Frontend uyumluluğu için eski endpoint'i koruyor, yeni API'ye yönlendiriyor
// ===================================================================

import prisma from '../../lib/prisma.js';
import { withCorsAndAuth } from '../../lib/cors-wrapper.js';
import { createAuditLog } from '../../lib/audit-logger.js';
// Removed missing cost-calculator import; not used here

export default withCorsAndAuth(async function handler(req, res) {

    console.log('⚠️  ESKİ ENDPOINT KULLANILIYOR: /api/uretim-plani - Yeni /api/production/plans kullanılması önerilir');

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

            // Malzeme özetleri
            const hazirlanacakMalzemeIhtiyaci = aggregateMaterials(hazirlanacakSiparisler);
            const hazirlananKullanilanMalzeme = aggregateMaterials(hazirlanenSiparisler);

            // Tüm ürünleri da ekle (frontend'de fallback gösterim için)
            const allProducts = await prisma.urun.findMany({
                where: { deletedAt: null },
                select: {
                    id: true,
                    ad: true,
                    kod: true,
                    aktif: true,
                    receteler: { where: { deletedAt: null }, select: { id: true, aktif: true } }
                },
                orderBy: { ad: 'asc' }
            });
            // Frontend özet kartlar için toplam sipariş sayısı 0 ise dahi doğru görünsün
            if (!Number.isFinite(summary.toplamCiro)) summary.toplamCiro = 0;
            if (!Number.isFinite(summary.toplamKar)) summary.toplamKar = 0;

            const payload = {
                genel: {
                    bekleyenMaliyet: summary.bekleyenMaliyet,
                    toplamCiro: summary.toplamCiro,
                    toplamKar: summary.toplamKar,
                    toplamSiparis: (hazirlanacakSiparisler.length + hazirlanenSiparisler.length)
                },
                hazirlanacaklar: {
                    toplam: { malzemeIhtiyaci: hazirlanacakMalzemeIhtiyaci },
                    siparisler: hazirlanacakSiparisler
                },
                hazırlananlar: {
                    toplam: { kullanılanMalzemeler: hazirlananKullanilanMalzeme },
                    siparisler: hazirlanenSiparisler
                },
                urunler: allProducts.map(p => ({
                    id: p.id,
                    ad: p.ad,
                    kod: p.kod,
                    aktif: p.aktif,
                    recipeAssigned: Array.isArray(p.receteler) && p.receteler.some(r => r.aktif),
                    recipeCount: Array.isArray(p.receteler) ? p.receteler.length : 0
                }))
            };

            // 📝 AUDIT LOG: Eski endpoint kullanımı
            await createAuditLog({
                personelId: 'P001',
                action: 'READ',
                tableName: 'PRODUCTION_PLAN_LEGACY',
                recordId: 'legacy-endpoint',
                oldValues: null,
                newValues: {
                    endpoint: '/api/uretim-plani',
                    newEndpoint: '/api/production/plans',
                    hazirlanacakSiparisler: summary.hazirlanacakSiparisler,
                    hazirlanenSiparisler: summary.hazirlanenSiparisler
                },
                description: `ESKİ endpoint kullanıldı: /api/uretim-plani → /api/production/plans kullanılması önerilir`,
                req
            });

            return res.status(200).json({
                success: true,
                warning: 'Bu endpoint yakında kaldırılacak. Lütfen /api/production/plans kullanın.',
                data: payload,
                generatedAt: new Date()
            });

        } catch (error) {
            console.error('❌ Üretim planı hatası:', error);
            return res.status(500).json({
                message: 'Üretim planı hesaplanırken hata oluştu',
                error: error.message
            });
        }
    }

    return res.status(405).json({ message: 'Method Not Allowed' });
});

// Aynı fonksiyonlar - eski uyumluluk için
async function getHazirlanacakSiparisler(startDate, endDate) {
    try {
        const siparisler = await prisma.siparis.findMany({
            where: {
                tarih: { gte: startDate, lte: endDate },
                // Onay bekleyenler de üretim planı için aday kabul edilir
                durum: { in: ['ONAY_BEKLEYEN', 'HAZIRLLANACAK'] }
            },
            include: {
                cari: { select: { id: true, cariAdi: true } },
                sube: { select: { ad: true } },
                teslimatTuru: { select: { ad: true } },
                kalemler: {
                    include: {
                        urun: {
                            select: {
                                id: true, ad: true, kod: true, receteler: {
                                    where: { aktif: true, deletedAt: null },
                                    select: { id: true, ad: true, icerikelek: { include: { material: { select: { id: true, ad: true, kod: true, birimFiyat: true } } } } }
                                }
                            }
                        },
                        kutu: { select: { ad: true, fiyat: true } }
                    }
                }
            },
            orderBy: { tarih: 'asc' }
        });

        // Her sipariş için maliyet hesapla
        for (const siparis of siparisler) {
            if (siparis.cari && siparis.cari.cariAdi && !siparis.cari.ad) {
                siparis.cari.ad = siparis.cari.cariAdi;
            }
            const maliyetToplam = await hesaplaSiparisMaliyeti(siparis.kalemler);
            siparis.toplamMaliyet = maliyetToplam;
            siparis.maliyet = { toplam: maliyetToplam };
            siparis.satis = { toplam: siparis.toplamTutar || 0 };
            siparis.kar = (siparis.toplamTutar || 0) - maliyetToplam;
        }

        return siparisler;

    } catch (error) {
        console.error('❌ Hazırlanacak siparişler hatası:', error);
        return [];
    }
}

async function getHazirlanenSiparisler(startDate, endDate) {
    try {
        const siparisler = await prisma.siparis.findMany({
            where: {
                tarih: { gte: startDate, lte: endDate },
                durum: 'HAZIRLANDI' // Hazırlanmış siparişler
            },
            include: {
                cari: { select: { id: true, cariAdi: true } },
                sube: { select: { ad: true } },
                teslimatTuru: { select: { ad: true } },
                kalemler: {
                    include: {
                        urun: {
                            select: {
                                id: true, ad: true, kod: true, receteler: {
                                    where: { aktif: true, deletedAt: null },
                                    select: { id: true, ad: true, icerikelek: { include: { material: { select: { id: true, ad: true, kod: true, birimFiyat: true } } } } }
                                }
                            }
                        },
                        kutu: { select: { ad: true, fiyat: true } }
                    }
                }
            },
            orderBy: { tarih: 'asc' }
        });

        // Her sipariş için maliyet hesapla
        for (const siparis of siparisler) {
            if (siparis.cari && siparis.cari.cariAdi && !siparis.cari.ad) {
                siparis.cari.ad = siparis.cari.cariAdi;
            }
            const maliyetToplam = await hesaplaSiparisMaliyeti(siparis.kalemler);
            siparis.toplamMaliyet = maliyetToplam;
            siparis.maliyet = { toplam: maliyetToplam };
            siparis.satis = { toplam: siparis.toplamTutar || 0 };
            siparis.kar = (siparis.toplamTutar || 0) - maliyetToplam;
        }

        return siparisler;

    } catch (error) {
        console.error('❌ Hazırlanan siparişler hatası:', error);
        return [];
    }
}

async function hesaplaSiparisMaliyeti(kalemler) {
    let toplamMaliyet = 0;

    for (const kalem of kalemler) {
        try {
            // Hammadde maliyeti - aktif ilk reçete üzerinden
            const recipe = Array.isArray(kalem.urun?.receteler) ? kalem.urun.receteler[0] : null;
            if (recipe?.icerikelek) {
                for (const ing of recipe.icerikelek) {
                    const qtyPerUnit = Number(ing.miktar) || 0; // ingredient quantity in its own unit
                    // Convert ingredient unit to KG-equivalent when needed
                    let ingQtyKg = qtyPerUnit;
                    // If ingredient unit is grams, convert to kg (assuming birim string)
                    // We included material.birimFiyat only, so cost is per ingredient unit; treat kg as base
                    // If units differ, keep proportionality simple
                    // Convert order quantity if in GRAM
                    let orderQty = Number(kalem.miktar) || 0;
                    if (String(kalem.birim) === 'GRAM') orderQty = orderQty / 1000;
                    // Ingredient unit
                    if (String(ing.birim) === 'GRAM') ingQtyKg = ingQtyKg / 1000;
                    const usedKg = orderQty * ingQtyKg;
                    const unitPrice = Number(ing.material?.birimFiyat) || 0;
                    toplamMaliyet += usedKg * unitPrice;
                }
            }

            // Kutu maliyeti
            if (kalem.kutu) {
                toplamMaliyet += (Number(kalem.miktar) || 0) * (Number(kalem.kutu.fiyat) || 0);
            }

        } catch (error) {
            console.error('❌ Kalem maliyet hesaplama hatası:', error);
        }
    }

    return Math.round(toplamMaliyet * 100) / 100;
}

function aggregateMaterials(siparisler) {
    const map = new Map();
    for (const s of siparisler) {
        for (const k of s.kalemler || []) {
            const recipe = Array.isArray(k.urun?.receteler) ? k.urun.receteler[0] : null;
            if (!recipe?.icerikelek) continue;
            let orderQty = Number(k.miktar) || 0;
            if (String(k.birim) === 'GRAM') orderQty = orderQty / 1000;
            for (const ing of recipe.icerikelek) {
                let ingQtyKg = Number(ing.miktar) || 0;
                if (String(ing.birim) === 'GRAM') ingQtyKg = ingQtyKg / 1000;
                const usedKg = orderQty * ingQtyKg;
                const key = ing.material?.kod || ing.material?.ad || String(ing.material?.id);
                const prev = map.get(key) || { ad: ing.material?.ad, stokKod: ing.material?.kod, miktar: 0, toplamMaliyet: 0 };
                const unitPrice = Number(ing.material?.birimFiyat) || 0;
                prev.miktar += usedKg * 1000; // store grams for UI
                prev.toplamMaliyet += usedKg * unitPrice;
                map.set(key, prev);
            }
        }
    }
    return Array.from(map.values()).sort((a, b) => b.miktar - a.miktar);
}