import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';
import prisma from '../../../lib/prisma.js';

export default withCorsAndAuth(async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', ['POST']);
            return res.status(405).json({ error: 'Method not allowed' });
        }
        if (!prisma?.masraf?.createMany) {
            return res.status(500).json({ error: 'Masraf modeli hazır değil. `prisma migrate` ve `prisma generate` çalıştırın.' });
        }

        const { start, end } = req.body || {};

        const now = new Date();
        const startDate = start ? new Date(start) : new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = end ? new Date(end) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
        if (isNaN(startDate) || isNaN(endDate) || startDate > endDate) {
            return res.status(400).json({ error: 'Geçersiz tarih aralığı' });
        }

        // Gün sayısı (her gün ücret varsayımı)
        const msInDay = 1000 * 60 * 60 * 24;
        const days = Math.max(1, Math.ceil((endDate - startDate) / msInDay) + 1);

        // Personel kategorisi id'si
        let kategori = await prisma.masrafKategori.findFirst({ where: { ad: 'Personel', aktif: true } });
        if (!kategori) {
            kategori = await prisma.masrafKategori.create({ data: { ad: 'Personel' } });
        }

        // Aktif ve günlük ücreti olan personeller
        const users = await prisma.user.findMany({
            where: { aktif: true, gunlukUcret: { gt: 0 } },
            select: { id: true, ad: true, soyad: true, gunlukUcret: true }
        });

        if (users.length === 0) {
            return res.status(200).json({ success: true, created: 0, skipped: 0, details: [] });
        }

        // Bu aralıkta zaten maaş kaydı olanları atla
        const existing = await prisma.masraf.findMany({
            where: {
                maasMi: true,
                personelId: { in: users.map(u => u.id) },
                tarih: { gte: startDate, lte: endDate },
                aktif: true
            },
            select: { personelId: true }
        });
        const already = new Set(existing.map(e => e.personelId));

        const toCreate = users
            .filter(u => !already.has(u.id))
            .map(u => ({
                kategoriId: kategori.id,
                tutar: Number(u.gunlukUcret || 0) * days,
                paraBirimi: 'TRY',
                tarih: endDate,
                aciklama: `Maaş (${u.ad}${u.soyad ? ' ' + u.soyad : ''}) ${startDate.toISOString().slice(0, 10)} - ${endDate.toISOString().slice(0, 10)}`,
                personelId: u.id,
                kiraMi: false,
                maasMi: true,
                aktif: true
            }));

        if (toCreate.length === 0) {
            return res.status(200).json({ success: true, created: 0, skipped: users.length, details: [] });
        }

        await prisma.masraf.createMany({ data: toCreate });
        return res.status(201).json({ success: true, created: toCreate.length, skipped: already.size });
    } catch (e) {
        console.error('Payroll create error:', e);
        return res.status(500).json({ error: 'Maaş oluşturma başarısız', details: e.message });
    }
});


