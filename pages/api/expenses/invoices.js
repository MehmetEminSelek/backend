import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';
import prisma from '../../../lib/prisma.js';

export default withCorsAndAuth(async function handler(req, res) {
    try {
        switch (req.method) {
            case 'GET':
                return list(req, res);
            case 'POST':
                return create(req, res);
            case 'PUT':
                return update(req, res);
            case 'DELETE':
                return removeInvoice(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
                return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (e) {
        console.error('Expense invoices API error:', e);
        return res.status(500).json({ error: 'Internal error', details: e.message });
    }
});

async function list(req, res) {
    const items = await prisma.masrafFatura.findMany({ orderBy: { tarih: 'desc' }, include: { kalemler: true } });
    return res.status(200).json({ success: true, items });
}

async function create(req, res) {
    const { faturaNo, tarih, toplamTutar, paraBirimi, aciklama, dosyaUrl, kalemIds = [] } = req.body || {};
    if (!faturaNo || !toplamTutar) return res.status(400).json({ error: 'faturaNo ve toplamTutar zorunludur' });
    if (!prisma?.masrafFatura?.create) {
        return res.status(500).json({ error: 'Prisma client hazır değil. Lütfen prisma generate/migrate çalıştırın.' });
    }
    const created = await prisma.masrafFatura.create({
        data: {
            faturaNo,
            tarih: tarih ? new Date(tarih) : undefined,
            toplamTutar: Number(toplamTutar),
            paraBirimi: paraBirimi || 'TRY',
            aciklama: aciklama || null,
            dosyaUrl: dosyaUrl || null,
            kalemler: kalemIds.length > 0 ? { connect: kalemIds.map(id => ({ id: Number(id) })) } : undefined
        },
        include: { kalemler: true }
    });
    return res.status(201).json({ success: true, item: created });
}

async function update(req, res) {
    const { id, ...data } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id zorunludur' });
    const payload = {};
    if (data.faturaNo !== undefined) payload.faturaNo = data.faturaNo;
    if (data.tarih !== undefined) payload.tarih = new Date(data.tarih);
    if (data.toplamTutar !== undefined) payload.toplamTutar = Number(data.toplamTutar);
    if (data.paraBirimi !== undefined) payload.paraBirimi = data.paraBirimi;
    if (data.aciklama !== undefined) payload.aciklama = data.aciklama;
    if (data.dosyaUrl !== undefined) payload.dosyaUrl = data.dosyaUrl;
    const updated = await prisma.masrafFatura.update({ where: { id: Number(id) }, data: payload, include: { kalemler: true } });
    return res.status(200).json({ success: true, item: updated });
}

async function removeInvoice(req, res) {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id zorunludur' });
    await prisma.masrafFatura.delete({ where: { id: Number(id) } });
    return res.status(200).json({ success: true });
}

