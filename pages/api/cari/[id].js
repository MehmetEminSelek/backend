import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
    const id = Number(req.query.id);
    if (!id) return res.status(400).json({ error: 'ID zorunlu' });

    if (req.method === 'GET') {
        // Cari detay
        const cari = await prisma.cari.findUnique({
            where: { id },
            include: { hareketler: true, siparisler: true },
        });
        if (!cari) return res.status(404).json({ error: 'Cari bulunamadı' });
        return res.status(200).json(cari);
    }
    if (req.method === 'PUT') {
        // Cari güncelle
        const data = req.body;
        const guncellenen = await prisma.cari.update({
            where: { id },
            data,
        });
        return res.status(200).json(guncellenen);
    }
    if (req.method === 'DELETE') {
        // Cari sil
        await prisma.cari.delete({ where: { id } });
        return res.status(204).end();
    }
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
} 