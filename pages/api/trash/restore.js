import prisma from '../../../lib/prisma.js';
import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';

export default withCorsAndAuth(async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', ['POST']);
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // Authorization: allow managers and above to restore
        if (!req.user || (req.user.roleLevel ?? 0) < 70) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const { type, id } = req.body || {};
        if (!type || !id) return res.status(400).json({ error: 'type and id are required' });

        const restoreMap = {
            urun: async () => {
                const existing = await prisma.urun.findUnique({ where: { id: Number(id) }, select: { deletedAt: true } });
                if (!existing || !existing.deletedAt) return res.status(404).json({ error: 'Record not found or not deleted' });
                await prisma.urun.update({ where: { id: Number(id) }, data: { deletedAt: null, deletedBy: null, deleteReason: null, aktif: true } });
            },
            recipe: async () => {
                const existing = await prisma.recipe.findUnique({ where: { id: Number(id) }, select: { deletedAt: true } });
                if (!existing || !existing.deletedAt) return res.status(404).json({ error: 'Record not found or not deleted' });
                await prisma.recipe.update({ where: { id: Number(id) }, data: { deletedAt: null, deletedBy: null, deleteReason: null, aktif: true } });
            },
            fiyat: async () => {
                const existing = await prisma.urunFiyat.findUnique({ where: { id: Number(id) }, select: { deletedAt: true } });
                if (!existing || !existing.deletedAt) return res.status(404).json({ error: 'Record not found or not deleted' });
                await prisma.urunFiyat.update({ where: { id: Number(id) }, data: { deletedAt: null, deletedBy: null, deleteReason: null, aktif: true } });
            }
        };

        const fn = restoreMap[type];
        if (!fn) return res.status(400).json({ error: 'Invalid type' });

        await fn();

        return res.status(200).json({ success: true, message: 'Record restored' });
    } catch (error) {
        console.error('TRASH RESTORE API ERROR:', error);
        return res.status(500).json({ error: 'Failed to restore record' });
    }
});


