// ===================================================================
// 🔄 UYUMLULUK ALIASI - ESKİ SATIŞ RAPORU ENDPOINT'İ
// Frontend uyumluluğu için eski endpoint'i koruyor, yeni API'ye yönlendiriyor
// ===================================================================

import { getSiparislerByDateRange, calculateBasicKPIs, calculateDailySalesTrend, calculateSubePerformance, calculateProductPerformance, calculateHourlySales } from '../../lib/reports/common';
import { createAuditLog } from '../../lib/audit-logger';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    console.log('⚠️  ESKİ ENDPOINT KULLANILIYOR: /api/satis-raporu - Yeni /api/reports/sales kullanılması önerilir');

    try {
        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                message: 'Başlangıç ve bitiş tarihi gereklidir.'
            });
        }

        // Siparişleri getir
        const siparisler = await getSiparislerByDateRange(startDate, endDate, {
            includeDetails: true,
            onlyApproved: true
        });

        console.log(`📊 ${siparisler.length} sipariş bulundu (ESKİ ENDPOINT)`);

        // Eski formatta response oluştur - FRONTEND UYUMLULUĞU İÇİN
        const satisDetay = [];
        for (const sip of siparisler) {
            for (const kalem of sip.kalemler) {
                const tutar = (kalem.birimFiyat || 0) * (kalem.miktar || 0);
                satisDetay.push({
                    tarih: sip.tarih.toISOString().slice(0, 10),
                    urunAd: kalem.urun?.ad || '-',
                    sube: sip.sube?.ad || '-',
                    musteri: sip.gorunecekAd || sip.gonderenAdi || sip.aliciAdi || '-',
                    miktar: kalem.miktar,
                    tutar: Math.round(tutar * 100) / 100
                });
            }
        }

        // Temel KPI'lar
        const kpis = calculateBasicKPIs(siparisler);
        const gunlukTrend = calculateDailySalesTrend(siparisler);
        const subePerformans = calculateSubePerformance(siparisler);
        const urunPerformans = calculateProductPerformance(siparisler);
        const saatlikData = calculateHourlySales(siparisler);

        // Frontend'in beklediği format
        const ciro = gunlukTrend.map(item => ({
            tarih: item.tarih,
            ciro: item.ciro
        }));

        const urunlerCiro = urunPerformans.slice(0, 10).map(urun => ({
            urunAd: urun.urunAdi,
            ciro: urun.toplamCiro
        }));

        const urunlerAdet = urunPerformans.slice(0, 10).map(urun => ({
            urunAd: urun.urunAdi,
            adet: urun.toplamMiktar
        }));

        const subelerCiro = subePerformans.map(sube => ({
            sube: sube.subeAd,  // Frontend'in beklediği field name
            ciro: sube.ciro
        }));

        const subelerAdet = subePerformans.map(sube => ({
            sube: sube.subeAd,  // Frontend'in beklediği field name
            adet: sube.siparisAdeti
        }));

        const saatlikCiro = saatlikData.map(saat => ({
            saat: saat.saat,
            ciro: saat.ciro
        }));

        // 📝 AUDIT LOG: Eski endpoint kullanımı
        await createAuditLog({
            personelId: 'P001',
            action: 'READ',
            tableName: 'SALES_REPORT_LEGACY',
            recordId: 'legacy-endpoint',
            oldValues: null,
            newValues: {
                endpoint: '/api/satis-raporu',
                newEndpoint: '/api/reports/sales',
                siparisAdeti: siparisler.length,
                toplamCiro: kpis.toplamCiro
            },
            description: `ESKİ endpoint kullanıldı: /api/satis-raporu → /api/reports/sales kullanılması önerilir`,
            req
        });

        // Frontend'in tam olarak beklediği format - BACKWARD COMPATIBILITY
        return res.status(200).json({
            success: true,
            ciro,
            urunlerAdet,
            urunlerCiro,
            subelerCiro,
            subelerAdet,
            satisDetay,
            ortalamaSepetTutari: kpis.ortalamaSiparisDeğeri,
            saatlikCiro,
            // Bonus data
            toplamCiro: kpis.toplamCiro,
            toplamSiparis: kpis.toplamSiparis,
            warning: 'Bu endpoint yakında kaldırılacak. Lütfen /api/reports/sales kullanın.',
            generatedAt: new Date()
        });

    } catch (error) {
        console.error('❌ Satış raporu hatası (ESKİ ENDPOINT):', error);
        return res.status(500).json({
            message: 'Satış raporu oluşturulurken hata oluştu',
            error: error.message
        });
    }
} 