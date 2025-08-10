import prisma from '../../../lib/prisma.js';
import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';

export default withCorsAndAuth(async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            res.setHeader('Allow', ['GET']);
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // Authorization: allow supervisors and above to view trash
        if (!req.user || (req.user.roleLevel ?? 0) < 60) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const { type = 'urun', page = 1, limit = 50, search } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const skip = (pageNum - 1) * limitNum;

        const map = {
            urun: {
                model: prisma.urun,
                where: (search) => ({
                    deletedAt: { not: null },
                    ...(search
                        ? {
                            OR: [
                                { ad: { contains: search, mode: 'insensitive' } },
                                { kod: { contains: search, mode: 'insensitive' } },
                                { aciklama: { contains: search, mode: 'insensitive' } }
                            ]
                        }
                        : {})
                }),
                select: {
                    id: true,
                    ad: true,
                    kod: true,
                    aciklama: true,
                    deletedAt: true,
                    deletedBy: true,
                    deleteReason: true,
                    updatedAt: true
                }
            },
            recipe: {
                model: prisma.recipe,
                where: (search) => ({
                    deletedAt: { not: null },
                    ...(search
                        ? {
                            OR: [
                                { ad: { contains: search, mode: 'insensitive' } },
                                { kod: { contains: search, mode: 'insensitive' } }
                            ]
                        }
                        : {})
                }),
                select: {
                    id: true,
                    ad: true,
                    kod: true,
                    deletedAt: true,
                    deletedBy: true,
                    deleteReason: true,
                    updatedAt: true
                }
            },
            fiyat: {
                model: prisma.urunFiyat,
                where: (search) => ({
                    deletedAt: { not: null },
                    ...(search
                        ? {
                            OR: [
                                { urun: { ad: { contains: search, mode: 'insensitive' } } },
                                { urun: { kod: { contains: search, mode: 'insensitive' } } }
                            ]
                        }
                        : {})
                }),
                select: {
                    id: true,
                    urunId: true,
                    fiyatTipi: true,
                    kgFiyati: true,
                    deletedAt: true,
                    deletedBy: true,
                    deleteReason: true,
                    updatedAt: true,
                    urun: { select: { id: true, ad: true, kod: true } }
                }
            }
        };

        const cfg = map[type] || map.urun;
        const where = cfg.where(search);

        const [items, total] = await Promise.all([
            cfg.model.findMany({ where, select: cfg.select, orderBy: { deletedAt: 'desc' }, skip, take: limitNum }),
            cfg.model.count({ where })
        ]);

        return res.status(200).json({
            success: true,
            type: type,
            items,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('TRASH API ERROR:', error);
        return res.status(500).json({ error: 'Failed to load trash' });
    }
});


