import prisma from '../../lib/prisma';
import { withRBAC, PERMISSIONS } from '../../lib/rbac';

async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Başlangıç ve bitiş tarihi gereklidir.' });
    }
    try {
        // 1. Siparişleri ve kalemleri çek
        const siparisler = await prisma.siparis.findMany({
            where: {
                tarih: { gte: new Date(startDate), lte: new Date(endDate) },
                onaylandiMi: true
            },
            include: {
                sube: { select: { ad: true } },
                kalemler: {
                    select: {
                        miktar: true,
                        birim: true,
                        birimFiyat: true,
                        urun: { select: { ad: true } }
                    }
                }
            }
        });
        // 2. Satış detaylarını düzleştir
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
        // 3. Günlük ciro
        const ciroMap = {};
        for (const s of satisDetay) {
            if (!ciroMap[s.tarih]) ciroMap[s.tarih] = 0;
            ciroMap[s.tarih] += s.tutar;
        }
        const ciro = Object.entries(ciroMap).map(([tarih, toplam]) => ({ tarih, toplam: Math.round(toplam * 100) / 100 })).sort((a, b) => a.tarih.localeCompare(b.tarih));
        // 4. Ürün bazlı satışlar (adet ve ciro)
        const urunMap = {};
        for (const s of satisDetay) {
            if (!urunMap[s.urunAd]) urunMap[s.urunAd] = { urunAd: s.urunAd, toplamMiktar: 0, toplamTutar: 0 };
            urunMap[s.urunAd].toplamMiktar += s.miktar;
            urunMap[s.urunAd].toplamTutar += s.tutar;
        }
        const urunlerAdet = Object.values(urunMap).sort((a, b) => b.toplamMiktar - a.toplamMiktar);
        const urunlerCiro = Object.values(urunMap).sort((a, b) => b.toplamTutar - a.toplamTutar);
        // 5. Şube bazlı satışlar (ciro ve sipariş adedi)
        const subeMap = {};
        for (const s of satisDetay) {
            if (!subeMap[s.sube]) subeMap[s.sube] = { sube: s.sube, toplamTutar: 0, toplamSiparis: 0 };
            subeMap[s.sube].toplamTutar += s.tutar;
            subeMap[s.sube].toplamSiparis += 1;
        }
        const subelerCiro = Object.values(subeMap).sort((a, b) => b.toplamTutar - a.toplamTutar);
        const subelerAdet = Object.values(subeMap).sort((a, b) => b.toplamSiparis - a.toplamSiparis);
        // Ortalama sepet tutarı (toplam ciro / toplam sipariş adedi)
        const toplamCiro = satisDetay.reduce((sum, s) => sum + s.tutar, 0);
        const toplamSiparis = new Set(satisDetay.map(s => s.tarih + '-' + s.musteri + '-' + s.sube)).size;
        const ortalamaSepetTutari = toplamSiparis > 0 ? Math.round((toplamCiro / toplamSiparis) * 100) / 100 : 0;
        // Saatlik satış dağılımı (her saat için toplam ciro)
        const saatlikMap = {};
        for (const sip of siparisler) {
            const saat = sip.tarih.getHours().toString().padStart(2, '0') + ':00';
            let siparisCiro = 0;
            for (const kalem of sip.kalemler) {
                siparisCiro += (kalem.birimFiyat || 0) * (kalem.miktar || 0);
            }
            if (!saatlikMap[saat]) saatlikMap[saat] = 0;
            saatlikMap[saat] += siparisCiro;
        }
        const saatlikCiro = Object.entries(saatlikMap).map(([saat, toplam]) => ({ saat, toplam: Math.round(toplam * 100) / 100 })).sort((a, b) => a.saat.localeCompare(b.saat));
        return res.status(200).json({
            ciro: Array.isArray(ciro) ? ciro : [],
            urunlerAdet: Array.isArray(urunlerAdet) ? urunlerAdet : [],
            urunlerCiro: Array.isArray(urunlerCiro) ? urunlerCiro : [],
            subelerCiro: Array.isArray(subelerCiro) ? subelerCiro : [],
            subelerAdet: Array.isArray(subelerAdet) ? subelerAdet : [],
            satisDetay: Array.isArray(satisDetay) ? satisDetay : [],
            ortalamaSepetTutari: typeof ortalamaSepetTutari === 'number' ? ortalamaSepetTutari : 0,
            saatlikCiro: Array.isArray(saatlikCiro) ? saatlikCiro : []
        });
    } catch (error) {
        // Log the full error for debugging
        console.error('Satış raporu hatası:', error);
        return res.status(500).json({ message: 'Satış raporu oluşturulurken hata oluştu.', error: error.message });
    }
}

// Export with RBAC protection
export default withRBAC(handler, {
    permission: PERMISSIONS.VIEW_REPORTS
}); 