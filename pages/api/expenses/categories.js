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
                return remove(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
                return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (e) {
        console.error('Expense categories API error:', e);
        return res.status(500).json({ error: 'Internal error', details: e.message });
    }
});

async function list(req, res) {
    let items = await prisma.masrafKategori.findMany({ where: { aktif: true }, orderBy: { ad: 'asc' } });
    if (!items || items.length === 0) {
        const defaults = [
            'Personel', 'Kira', 'Elektrik', 'Su', 'Doğalgaz', 'Bakım', 'İletişim', 'Vergi', 'Ofis', 'Diğer'
        ];
        await prisma.masrafKategori.createMany({ data: defaults.map(ad => ({ ad })) });
        items = await prisma.masrafKategori.findMany({ where: { aktif: true }, orderBy: { ad: 'asc' } });
    }
    return res.status(200).json({ success: true, items });
}

async function create(req, res) {
    const { ad, aciklama } = req.body || {};
    if (!ad) return res.status(400).json({ error: 'ad zorunludur' });
    const created = await prisma.masrafKategori.create({ data: { ad, aciklama: aciklama || null } });
    return res.status(201).json({ success: true, item: created });
}

async function update(req, res) {
    const { id, ...data } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id zorunludur' });
    const payload = {};
    if (data.ad !== undefined) payload.ad = data.ad;
    if (data.aciklama !== undefined) payload.aciklama = data.aciklama;
    if (data.aktif !== undefined) payload.aktif = Boolean(data.aktif);
    const updated = await prisma.masrafKategori.update({ where: { id: Number(id) }, data: payload });
    return res.status(200).json({ success: true, item: updated });
}

async function remove(req, res) {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id zorunludur' });
    await prisma.masrafKategori.update({ where: { id: Number(id) }, data: { aktif: false } });
    return res.status(200).json({ success: true });
}

