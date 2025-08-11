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

    if (req.method === 'PUT') {
        // Permissions
        if (!req.user || (req.user.roleLevel ?? 0) < 50) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        const { onaylandiMi, kalemler, ...rest } = req.body || {};

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

                // Update top-level order fields if provided
                const allowedTopLevel = [
                    'tarih', 'teslimatTuruId', 'subeId', 'gonderenTipiId', 'gonderenAdi', 'gonderenTel',
                    'aliciAdi', 'aliciTel', 'teslimatAdresi', 'il', 'ilce', 'postaKodu', 'aciklama', 'subeNeredenId', 'subeNereyeId'
                ];
                const updateData = {};
                for (const key of allowedTopLevel) {
                    if (rest[key] !== undefined) updateData[key] = rest[key];
                }
                if (rest.adres !== undefined && updateData.teslimatAdresi === undefined) {
                    updateData.teslimatAdresi = rest.adres;
                }
                if (Object.keys(updateData).length > 0) {
                    // Coerce types
                    if (updateData.tarih) updateData.tarih = new Date(updateData.tarih);
                    ['teslimatTuruId', 'subeId', 'gonderenTipiId', 'subeNeredenId', 'subeNereyeId'].forEach(f => {
                        if (updateData[f] !== undefined && updateData[f] !== null) updateData[f] = Number(updateData[f]);
                    });
                    const updated = await tx.siparis.update({ where: { id: orderId }, data: updateData, select: { id: true, cariId: true, teslimatAdresi: true, il: true, ilce: true, postaKodu: true } });

                    // If linked to a customer and address fields changed, update default fields on customer as well (lightweight sync)
                    if (updated.cariId) {
                        const customerUpdate = {};
                        if (updateData.teslimatAdresi) customerUpdate['adres'] = updateData.teslimatAdresi;
                        if (updateData.il) customerUpdate['il'] = updateData.il;
                        if (updateData.ilce) customerUpdate['ilce'] = updateData.ilce;
                        if (updateData.postaKodu) customerUpdate['postaKodu'] = updateData.postaKodu;
                        if (Object.keys(customerUpdate).length > 0) {
                            try { await tx.cariMusteri.update({ where: { id: updated.cariId }, data: customerUpdate }); } catch { }
                        }
                    }
                }
            });

            return res.status(200).json({ success: true });
        } catch (e) {
            console.error('PUT /siparis/:id error:', e);
            return res.status(500).json({ error: 'Order update failed', details: e.message });
        }
    }

    if (req.method === 'DELETE') {
        // Permission: manager+
        if (!req.user || (req.user.roleLevel ?? 0) < 60) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        try {
            const paymentCount = await prisma.cariOdeme.count({ where: { siparisId: orderId } });
            const force = String(req.query.force || '').toLowerCase() === 'true' || req.body?.force === true;
            if (paymentCount > 0 && !force) {
                return res.status(409).json({ error: 'Bu siparişe ait ödeme kayıtları var. Önce ödemeleri kaldırın veya force=true ile silin.' });
            }
            // Force delete requires higher privilege
            if (paymentCount > 0 && force && (req.user.roleLevel ?? 0) < 70) {
                return res.status(403).json({ error: 'Force silme için yetki yetersiz' });
            }

            await prisma.$transaction(async (tx) => {
                if (force) {
                    // Delete payments and their movements
                    const odemeler = await tx.cariOdeme.findMany({ where: { siparisId: orderId }, select: { id: true } });
                    const odemeIds = odemeler.map(o => o.id);
                    if (odemeIds.length > 0) {
                        await tx.cariHareket.deleteMany({ where: { OR: [{ siparisId: orderId }, { odemeId: { in: odemeIds } }] } });
                        await tx.cariOdeme.deleteMany({ where: { id: { in: odemeIds } } });
                    } else {
                        await tx.cariHareket.deleteMany({ where: { siparisId: orderId } });
                    }
                } else {
                    // No payments: clear movements linked to order
                    await tx.cariHareket.deleteMany({ where: { siparisId: orderId } });
                }
                await tx.siparisKalemi.deleteMany({ where: { siparisId: orderId } });
                await tx.siparis.delete({ where: { id: orderId } });
            });

            return res.status(200).json({ success: true });
        } catch (e) {
            console.error('DELETE /siparis/:id error:', e);
            return res.status(500).json({ error: 'Order delete failed', details: e.message });
        }
    }

    res.setHeader('Allow', ['PUT', 'DELETE']);
    return res.status(405).json({ error: 'Method not allowed' });
}

export default withCorsAndAuth(handler);