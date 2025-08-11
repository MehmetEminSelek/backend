import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';
import prisma from '../../../lib/prisma.js';

export default withCorsAndAuth(async function handler(req, res) {
    try {
        switch (req.method) {
            case 'GET':
                return listExpenses(req, res);
            case 'POST':
                return createExpense(req, res);
            case 'PUT':
                return updateExpense(req, res);
            case 'DELETE':
                return deleteExpense(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
                return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (e) {
        console.error('Expenses API error:', e);
        return res.status(500).json({ error: 'Internal error', details: e.message });
    }
});

async function listExpenses(req, res) {
    const { start, end, kategoriId, includePayroll } = req.query;
    const where = { aktif: true };
    if (start || end) where.tarih = { ...(start ? { gte: new Date(start) } : {}), ...(end ? { lte: new Date(end) } : {}) };
    if (kategoriId) where.kategoriId = Number(kategoriId);
    if (!prisma?.masraf?.findMany) {
        return res.status(500).json({ error: 'Masraf modeli bulunamadı. Lütfen backend dizininde `npx prisma migrate dev` ve `npx prisma generate` çalıştırın.' });
    }
    let items = await prisma.masraf.findMany({ where, include: { kategori: true, personel: true, fatura: true }, orderBy: { tarih: 'desc' } });

    // Aktif personel maaşlarını (tahmini) dahil et opsiyonu
    const shouldIncludePayroll = String(includePayroll || '').toLowerCase() === 'true';
    if (shouldIncludePayroll && prisma?.user?.findMany) {
        const startDate = start ? new Date(start) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const endDate = end ? new Date(end) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        const msInDay = 1000 * 60 * 60 * 24;
        const days = Math.max(1, Math.ceil((endDate - startDate) / msInDay) + 1);

        const users = await prisma.user.findMany({ where: { aktif: true, gunlukUcret: { gt: 0 } }, select: { id: true, ad: true, soyad: true, gunlukUcret: true } });
        const alreadyPaid = new Set(items.filter(i => i.maasMi && i.personelId).map(i => i.personelId));

        const synthetic = users
            .filter(u => !alreadyPaid.has(u.id))
            .map(u => ({
                id: -u.id,
                kategoriId: null,
                kategori: { ad: 'Personel' },
                tutar: Number(u.gunlukUcret || 0) * days,
                paraBirimi: 'TRY',
                tarih: endDate,
                aciklama: 'Otomatik: Aktif personel maaşı (tahmini)',
                personelId: u.id,
                personel: { id: u.id, ad: u.ad, soyad: u.soyad },
                kiraMi: false,
                maasMi: true,
                aktif: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                sanal: true
            }));

        items = [...items, ...synthetic].sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
    }

    const toplam = items.reduce((a, b) => a + (b.tutar || 0), 0);
    const toplamMaas = items.filter(i => i.maasMi).reduce((a, b) => a + (b.tutar || 0), 0);
    const toplamKira = items.filter(i => i.kiraMi).reduce((a, b) => a + (b.tutar || 0), 0);
    return res.status(200).json({ success: true, items, toplam, toplamMaas, toplamKira, includePayroll: shouldIncludePayroll });
}

async function createExpense(req, res) {
    const { kategoriId, tutar, tarih, aciklama, belgeUrl, personelId, kiraMi, maasMi, faturaId, paraBirimi } = req.body || {};
    if (!kategoriId || !tutar) return res.status(400).json({ error: 'kategoriId ve tutar zorunludur' });
    const created = await prisma.masraf.create({
        data: {
            kategoriId: Number(kategoriId),
            tutar: Number(tutar),
            paraBirimi: paraBirimi || 'TRY',
            tarih: tarih ? new Date(tarih) : undefined,
            aciklama: aciklama || null,
            belgeUrl: belgeUrl || null,
            personelId: personelId ? Number(personelId) : null,
            kiraMi: Boolean(kiraMi),
            maasMi: Boolean(maasMi),
            faturaId: faturaId ? Number(faturaId) : null,
        }
    });
    return res.status(201).json({ success: true, item: created });
}

async function updateExpense(req, res) {
    const { id, ...data } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id zorunludur' });
    const allowed = ['kategoriId', 'tutar', 'paraBirimi', 'tarih', 'aciklama', 'belgeUrl', 'personelId', 'kiraMi', 'maasMi', 'faturaId', 'aktif'];
    const payload = {};
    for (const k of allowed) if (data[k] !== undefined) payload[k] = data[k];
    if (payload.kategoriId) payload.kategoriId = Number(payload.kategoriId);
    if (payload.tutar) payload.tutar = Number(payload.tutar);
    if (payload.personelId) payload.personelId = Number(payload.personelId);
    if (payload.faturaId) payload.faturaId = Number(payload.faturaId);
    if (payload.tarih) payload.tarih = new Date(payload.tarih);
    const updated = await prisma.masraf.update({ where: { id: Number(id) }, data: payload });
    return res.status(200).json({ success: true, item: updated });
}

async function deleteExpense(req, res) {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id zorunludur' });
    await prisma.masraf.update({ where: { id: Number(id) }, data: { aktif: false } });
    return res.status(200).json({ success: true });
}

