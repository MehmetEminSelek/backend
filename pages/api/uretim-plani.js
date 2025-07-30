// ===================================================================
// 🔄 UYUMLULUK ALIASI - ESKİ ÜRETİM PLANI ENDPOINT'İ
// Frontend uyumluluğu için eski endpoint'i koruyor, yeni API'ye yönlendiriyor
// ===================================================================

import prisma from '../../lib/prisma';
import { createAuditLog } from '../../lib/audit-logger';
import { calculateOrderCost, calculatePeriodCostAnalysis } from '../../lib/reports/cost-calculator';

export default async function handler(req, res) {
    // CORS ayarları
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

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
                summary,
                hazirlanacakSiparisler,
                hazirlanenSiparisler,
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
}

// Aynı fonksiyonlar - eski uyumluluk için
async function getHazirlanacakSiparisler(startDate, endDate) {
    try {
        const siparisler = await prisma.siparis.findMany({
            where: {
                tarih: { gte: startDate, lte: endDate },
                durum: 'HAZIRLLANACAK' // Onaylanmış ama henüz hazırlanmamış
            },
            include: {
                sube: { select: { ad: true } },
                teslimatTuru: { select: { ad: true } },
                kalemler: {
                    include: {
                        urun: {
                            select: { ad: true, kod: true },
                            include: {
                                recipes: {
                                    where: { aktif: true },
                                    include: {
                                        icerikelek: {
                                            include: {
                                                material: {
                                                    select: { ad: true, birimFiyat: true }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        kutu: { select: { ad: true, maliyeti: true } }
                    }
                }
            },
            orderBy: { tarih: 'asc' }
        });

        // Her sipariş için maliyet hesapla
        for (const siparis of siparisler) {
            siparis.toplamMaliyet = await hesaplaSiparisMaliyeti(siparis.kalemler);
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
                sube: { select: { ad: true } },
                teslimatTuru: { select: { ad: true } },
                kalemler: {
                    include: {
                        urun: {
                            select: { ad: true, kod: true },
                            include: {
                                recipes: {
                                    where: { aktif: true },
                                    include: {
                                        icerikelek: {
                                            include: {
                                                material: {
                                                    select: { ad: true, birimFiyat: true }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        kutu: { select: { ad: true, maliyeti: true } }
                    }
                }
            },
            orderBy: { tarih: 'asc' }
        });

        // Her sipariş için maliyet hesapla
        for (const siparis of siparisler) {
            siparis.toplamMaliyet = await hesaplaSiparisMaliyeti(siparis.kalemler);
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
            // Hammadde maliyeti
            if (kalem.urun?.recipes?.[0]?.icerikelek) {
                for (const malzeme of kalem.urun.recipes[0].icerikelek) {
                    const malzemeMiktar = (kalem.miktar || 0) * (malzeme.miktar || 0) / 1000; // Gram'dan KG'a
                    const malzemeMaliyet = malzemeMiktar * (malzeme.material?.birimFiyat || 0);
                    toplamMaliyet += malzemeMaliyet;
                }
            }

            // Kutu maliyeti
            if (kalem.kutu) {
                toplamMaliyet += (kalem.miktar || 0) * (kalem.kutu.maliyeti || 0);
            }

        } catch (error) {
            console.error('❌ Kalem maliyet hesaplama hatası:', error);
        }
    }

    return Math.round(toplamMaliyet * 100) / 100;
} 