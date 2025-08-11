import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';
import prisma from '../../../lib/prisma.js';

export default withCorsAndAuth(async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            res.setHeader('Allow', ['GET']);
            return res.status(405).json({ error: 'Method not allowed' });
        }
        const items = await prisma.user.findMany({ where: { aktif: true }, select: { id: true, ad: true, soyad: true } });
        const mapped = items.map(u => ({ id: u.id, ad: `${u.ad}${u.soyad ? ' ' + u.soyad : ''}` }));
        return res.status(200).json({ success: true, items: mapped });
    } catch (e) {
        console.error('Personel API error:', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});


