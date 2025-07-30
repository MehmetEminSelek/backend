// ===================================================================
// 🔄 UYUMLULUK ALIASI - ESKİ CRM RAPORLAMA ENDPOINT'İ
// Frontend uyumluluğu için eski endpoint'i koruyor, yeni API'ye yönlendiriyor
// ===================================================================

import {
    getSiparislerByDateRange,
    calculateBasicKPIs,
    calculateCustomerSegmentation,
    calculatePaymentMethodAnalysis,
    calculateHourlySales
} from '../../lib/reports/common';
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

    console.log('⚠️  ESKİ ENDPOINT KULLANILIYOR: /api/crm-raporlama - Yeni /api/reports/crm kullanılması önerilir');

    try {
        const { startDate, endDate, reportType = 'tum' } = req.body;

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

        console.log(`🎯 ${siparisler.length} sipariş bulundu (ESKİ CRM ENDPOINT)`);

        // Temel analizler
        const kpiData = calculateBasicKPIs(siparisler);
        const musteriSegmentleri = calculateCustomerSegmentation(siparisler);
        const odemeAnalizi = calculatePaymentMethodAnalysis(siparisler);
        const saatlikSatislar = calculateHourlySales(siparisler);

        // Eski formatta response (sadeleştirilmiş)
        const response = {
            success: true,
            warning: 'Bu endpoint yakında kaldırılacak. Lütfen /api/reports/crm kullanın.',
            kpiData: {
                toplamSiparis: kpiData.toplamSiparis,
                toplamCiro: kpiData.toplamCiro,
                toplamKar: kpiData.toplamKar,
                ortalamaSepetTutari: kpiData.ortalamaSiparisDeğeri,
                toplamMusteriSayisi: musteriSegmentleri.length,
                vipMusteriSayisi: musteriSegmentleri.filter(m => m.segment === 'VIP').length
            },
            musteriSegmentleri: musteriSegmentleri.slice(0, 20), // En iyi 20 müşteri
            odemeYontemleri: odemeAnalizi,
            saatlikSatis: saatlikSatislar,
            generatedAt: new Date()
        };

        // 📝 AUDIT LOG: Eski endpoint kullanımı
        await createAuditLog({
            personelId: 'P001',
            action: 'READ',
            tableName: 'CRM_REPORT_LEGACY',
            recordId: 'legacy-endpoint',
            oldValues: null,
            newValues: {
                endpoint: '/api/crm-raporlama',
                newEndpoint: '/api/reports/crm',
                reportType,
                siparisAdeti: siparisler.length,
                musteriSayisi: musteriSegmentleri.length
            },
            description: `ESKİ endpoint kullanıldı: /api/crm-raporlama → /api/reports/crm kullanılması önerilir`,
            req
        });

        return res.status(200).json(response);

    } catch (error) {
        console.error('❌ CRM raporu hatası (ESKİ ENDPOINT):', error);
        return res.status(500).json({
            message: 'CRM raporu oluşturulurken hata oluştu',
            error: error.message
        });
    }
} 