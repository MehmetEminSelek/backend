import prisma from '../../../lib/prisma.js';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const { cariId } = req.query;
        if (!cariId) return res.status(400).json({ error: 'Cari ID zorunlu' });
        const hareketler = await prisma.cariHareket.findMany({
            where: { cariMusteriId: Number(cariId) },
            orderBy: { createdAt: 'desc' },
        });
        return res.status(200).json(hareketler);
    }
    if (req.method === 'POST') {
        const { cariId, tip, tutar, aciklama, vadeTarihi, direction } = req.body;
        if (!cariId || !tip || tutar === undefined || !direction) {
            return res.status(400).json({ error: 'cariId, tip, tutar ve direction zorunlu' });
        }
        const hareket = await prisma.cariHareket.create({
            data: { cariMusteriId: Number(cariId), tip, tutar: Number(tutar), aciklama, vadeTarihi: vadeTarihi ? new Date(vadeTarihi) : null, direction },
        });
        return res.status(201).json(hareket);
    }
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
} 