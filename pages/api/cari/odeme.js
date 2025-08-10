import prisma from '../../../lib/prisma.js';
import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';

export default withCorsAndAuth(async function handler(req, res) {

    if (req.method === 'POST') {
        console.log('POST /api/cari/odeme isteği alındı. Body:', req.body);
        const { cariId, tutar, odemeTarihi, odemeYontemi, aciklama, vadeTarihi } = req.body;

        // Gerekli alan kontrolü
        if (!cariId) {
            return res.status(400).json({ message: 'Müşteri ID\'si zorunlu.' });
        }
        if (tutar === undefined || tutar === null || typeof tutar !== 'number' || tutar <= 0) {
            return res.status(400).json({ message: 'Geçerli bir ödeme tutarı girilmelidir.' });
        }

        // Ödeme yöntemi değer dönüştürme (Frontend -> Prisma Enum)
        const odemeYontemiMap = {
            'Nakit': 'NAKIT',
            'NAKIT': 'NAKIT',
            'Kredi Kartı': 'KREDI_KARTI',
            'KREDI_KARTI': 'KREDI_KARTI',
            'Cari': 'CARI',
            'CARI': 'CARI',
            'Çek': 'CEK',
            'CEK': 'CEK',
            'Banka Havalesi': 'BANKA_HAVALESI',
            'BANKA_HAVALESI': 'BANKA_HAVALESI',
            'İkram': 'IKRAM',
            'IKRAM': 'IKRAM'
        };

        const validOdemeYontemi = odemeYontemiMap[odemeYontemi] || 'NAKIT';
        console.log(`Ödeme yöntemi dönüştürme: "${odemeYontemi}" -> "${validOdemeYontemi}"`);

        try {
            // Müşteriyi kontrol et
            const cari = await prisma.cariMusteri.findUnique({
                where: { id: Number(cariId) },
                select: { id: true, cariAdi: true, musteriKodu: true }
            });

            if (!cari) {
                return res.status(404).json({ message: 'Müşteri bulunamadı.' });
            }

            // Ödeme tarihini işle (gelmezse şimdiki zaman)
            let odemeTarihiDate = new Date();
            if (odemeTarihi) {
                odemeTarihiDate = new Date(odemeTarihi);
                if (isNaN(odemeTarihiDate.getTime())) {
                    throw new Error('Geçersiz ödeme tarihi formatı.');
                }
            }

            // Vade tarihini işle
            let vadeTarihiDate = null;
            if (vadeTarihi) {
                vadeTarihiDate = new Date(vadeTarihi);
                if (isNaN(vadeTarihiDate.getTime())) {
                    throw new Error('Geçersiz vade tarihi formatı.');
                }
            }

            // CariOdeme kaydı oluştur
            const yeniOdeme = await prisma.cariOdeme.create({
                data: {
                    cariId: Number(cariId),
                    tutar: Number(tutar),
                    odemeTarihi: odemeTarihiDate,
                    vadeTarihi: vadeTarihiDate,
                    odemeYontemi: validOdemeYontemi,
                    aciklama: aciklama || null,
                    durum: 'ODENDI'
                },
                include: {
                    cari: {
                        select: {
                            ad: true,
                            musteriKodu: true
                        }
                    }
                }
            });

            // CariHareket kaydı da oluştur (muhasebe için)
            await prisma.cariHareket.create({
                data: {
                    cariId: Number(cariId),
                    tip: 'ALACAK', // Ödeme alındığı için alacak
                    tutar: Number(tutar),
                    aciklama: `Ödeme: ${aciklama || 'Müşteri ödemesi'}`,
                    odemeId: yeniOdeme.id
                }
            });

            // Cari bakiyesini güncelle (ödeme alındığında bakiye artar)
            await prisma.cariMusteri.update({
                where: { id: Number(cariId) },
                data: {
                    bakiye: {
                        increment: Number(tutar)
                    }
                }
            });

            console.log(`✅ ${cari.ad} müşterisine ${tutar} TL ödeme kaydedildi`);
            return res.status(201).json({
                ...yeniOdeme,
                message: `${cari.ad} müşterisine ödeme başarıyla kaydedildi.`
            });

        } catch (error) {
            console.error('❌ POST /api/cari/odeme HATA:', error);
            let statusCode = 500;
            let message = 'Ödeme kaydedilirken bir hata oluştu.';

            if (error.message.includes('Geçersiz') && error.message.includes('tarihi')) {
                statusCode = 400;
                message = error.message;
            }

            return res.status(statusCode).json({
                message: message,
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    if (req.method === 'GET') {
        // Ödeme listesini getir
        const { cariId } = req.query;

        try {
            const whereClause = cariId ? { cariId: Number(cariId) } : {};

            const odemeler = await prisma.cariOdeme.findMany({
                where: whereClause,
                include: {
                    cari: {
                        select: {
                            ad: true,
                            musteriKodu: true
                        }
                    }
                },
                orderBy: {
                    odemeTarihi: 'desc'
                }
            });

            return res.status(200).json(odemeler);
        } catch (error) {
            console.error('❌ GET /api/cari/odeme HATA:', error);
            return res.status(500).json({ message: 'Ödemeler getirilirken hata oluştu.' });
        }
    }

    // Desteklenmeyen metot
    res.setHeader('Allow', ['POST', 'GET', 'OPTIONS']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}); 