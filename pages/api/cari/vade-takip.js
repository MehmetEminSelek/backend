import prisma from '../../../lib/prisma.js';
import { sendWhatsApp } from '../../../lib/whatsapp.js';

export default async function handler(req, res) {
    try {
        console.log('Vade takip endpointi çağrıldı');

        // Bugünün tarihi ve 30 gün öncesi
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);

        console.log('30 gün öncesi:', thirtyDaysAgo.toISOString());

        // Vadesi 30+ gün geçmiş borç hareketleri
        const hareketler = await prisma.cariHareket.findMany({
            where: {
                direction: 'borc',
                vadeTarihi: { lte: thirtyDaysAgo },
            },
            include: {
                cari: {
                    select: {
                        id: true,
                        ad: true,
                        telefon: true,
                        email: true,
                    },
                },
            },
            orderBy: { vadeTarihi: 'asc' },
        });

        console.log('Bulunan hareketler:', hareketler);

        // Aynı carinin toplam borcunu ve kalan borcunu hesapla
        const carilerMap = {};

        // Önce borçları ekle
        for (const hareket of hareketler) {
            const id = hareket.cariId;
            if (!carilerMap[id]) {
                carilerMap[id] = {
                    cariId: id,
                    ad: hareket.cari.ad,
                    telefon: hareket.cari.telefon,
                    email: hareket.cari.email,
                    toplamBorc: 0,
                    toplamAlacak: 0,
                    kalanBorc: 0,
                    vadeTarihi: hareket.vadeTarihi,
                };
            }
            carilerMap[id].toplamBorc += hareket.tutar;
            if (hareket.vadeTarihi < carilerMap[id].vadeTarihi) {
                carilerMap[id].vadeTarihi = hareket.vadeTarihi;
            }
        }

        // Sonra alacakları ekle
        const cariIds = Object.keys(carilerMap).map(Number);
        if (cariIds.length > 0) {
            const alacaklar = await prisma.cariHareket.findMany({
                where: {
                    direction: 'alacak',
                    cariId: { in: cariIds },
                },
            });

            console.log('Bulunan alacaklar:', alacaklar);

            for (const alacak of alacaklar) {
                if (carilerMap[alacak.cariId]) {
                    carilerMap[alacak.cariId].toplamAlacak += alacak.tutar;
                }
            }
        }

        // Kalan borçları hesapla
        for (const cari of Object.values(carilerMap)) {
            cari.kalanBorc = cari.toplamBorc - cari.toplamAlacak;
        }

        // Sadece borcu kalanları döndür
        const vadesiGecenler = Object.values(carilerMap)
            .filter(c => c.kalanBorc > 0)
            .map(c => ({
                ...c,
                vadeTarihi: c.vadeTarihi.toISOString().split('T')[0],
                toplamBorc: Number(c.toplamBorc.toFixed(2)),
                toplamAlacak: Number(c.toplamAlacak.toFixed(2)),
                kalanBorc: Number(c.kalanBorc.toFixed(2)),
            }));

        console.log('Vadesi geçenler:', vadesiGecenler);

        if (req.method === 'POST') {
            // WhatsApp gönderilecek cariler body'den alınır
            const { cariIds } = req.body;
            if (!cariIds || !Array.isArray(cariIds)) {
                return res.status(400).json({ error: 'cariIds zorunlu ve array olmalı' });
            }

            const results = [];

            for (const cariId of cariIds) {
                const cari = vadesiGecenler.find(c => c.cariId === cariId);
                if (cari?.telefon) {
                    const message = `Sayın '${cari.ad}', öncelikle bizi tercih ettiğiniz için teşekkür ederiz, son siparişinizden kalan ${cari.kalanBorc} TL miktarı kadar bir bakiyenizi hatırlatırız. İyi günler`;
                    const whatsappResult = await sendWhatsApp({ to: cari.telefon, message });
                    results.push({
                        cariId: cari.cariId,
                        telefon: cari.telefon,
                        success: whatsappResult.success,
                        mock: whatsappResult.mock
                    });
                }
            }
            return res.status(200).json({ sent: results });
        }

        res.status(200).json(vadesiGecenler);
    } catch (error) {
        console.error('Vade takip hatası:', error);
        res.status(500).json({ error: 'Vade takip işlemi sırasında bir hata oluştu', details: error.message });
    } finally {
        await prisma.$disconnect();
    }
} 