/**
 * ULTRA SIMPLE Siparis [id] API - DEBUG VERSION
 */

import prisma from '../../../lib/prisma.js';
import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';

async function handler(req, res) {
    const { id } = req.query;
    const orderId = parseInt(id);
    if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Invalid order id' });
    }

    if (req.method !== 'PUT') {
        res.setHeader('Allow', ['PUT']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Permissions
    if (!req.user || (req.user.roleLevel ?? 0) < 50) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { onaylandiMi, kalemler } = req.body || {};

    try {
        await prisma.$transaction(async (tx) => {
            // Update item quantities if provided
            if (Array.isArray(kalemler) && kalemler.length > 0) {
                for (const k of kalemler) {
                    const itemId = parseInt(k.id);
                    const miktar = parseFloat(k.miktar);
                    if (!Number.isInteger(itemId) || !Number.isFinite(miktar) || miktar < 0) {
                        throw new Error('Invalid item payload');
                    }
                    await tx.siparisKalemi.update({
                        where: { id: itemId },
                        data: { miktar }
                    });
                }
            }

            // Approve order if requested
            if (onaylandiMi === true) {
                await tx.siparis.update({
                    where: { id: orderId },
                    data: { durum: 'HAZIRLLANACAK' }
                });
            }
        });

        return res.status(200).json({ success: true });
    } catch (e) {
        console.error('PUT /siparis/:id error:', e);
        return res.status(500).json({ error: 'Order update failed', details: e.message });
    }
}

export default withCorsAndAuth(handler);