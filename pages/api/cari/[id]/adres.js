import prisma from '../../../../lib/prisma.js';
import { withRBAC, PERMISSIONS } from '../../../../lib/rbac';

async function handler(req, res) {
    const { id: cariId } = req.query;

    // Cari'nin varlığını kontrol et
    const cari = await prisma.cari.findUnique({
        where: { id: parseInt(cariId) }
    });

    if (!cari) {
        return res.status(404).json({ error: 'Cari bulunamadı' });
    }

    if (req.method === 'GET') {
        // Carinin tüm adreslerini getir
        const adresler = await prisma.cariAdres.findMany({
            where: {
                cariId: parseInt(cariId),
                aktif: true
            },
            orderBy: [
                { varsayilan: 'desc' },
                { createdAt: 'asc' }
            ]
        });
        return res.status(200).json(adresler);
    }

    if (req.method === 'POST') {
        // Yeni adres ekle
        const { tip, adres, il, ilce, mahalle, postaKodu, tarif, varsayilan } = req.body;

        if (!adres) {
            return res.status(400).json({ error: 'Adres zorunlu' });
        }

        // Eğer varsayılan adres yapılıyorsa, diğerlerini false yap
        if (varsayilan) {
            await prisma.cariAdres.updateMany({
                where: { cariId: parseInt(cariId) },
                data: { varsayilan: false }
            });
        }

        const yeniAdres = await prisma.cariAdres.create({
            data: {
                cariId: parseInt(cariId),
                tip: tip || 'DIGER',
                adres,
                il,
                ilce,
                mahalle,
                postaKodu,
                tarif,
                varsayilan: varsayilan || false
            }
        });

        // Eğer bu ilk adres ise varsayılan yap
        const adresSayisi = await prisma.cariAdres.count({
            where: { cariId: parseInt(cariId), aktif: true }
        });

        if (adresSayisi === 1) {
            await prisma.cariAdres.update({
                where: { id: yeniAdres.id },
                data: { varsayilan: true }
            });
        }

        return res.status(201).json(yeniAdres);
    }

    if (req.method === 'PUT') {
        // Adres güncelle
        const { adresId, ...updateData } = req.body;

        if (!adresId) {
            return res.status(400).json({ error: 'Adres ID gerekli' });
        }

        // Adresin bu cariye ait olduğunu kontrol et
        const mevcutAdres = await prisma.cariAdres.findFirst({
            where: {
                id: parseInt(adresId),
                cariId: parseInt(cariId),
                aktif: true
            }
        });

        if (!mevcutAdres) {
            return res.status(404).json({ error: 'Adres bulunamadı' });
        }

        // Eğer varsayılan yapılıyorsa, diğerlerini false yap
        if (updateData.varsayilan) {
            await prisma.cariAdres.updateMany({
                where: {
                    cariId: parseInt(cariId),
                    id: { not: parseInt(adresId) }
                },
                data: { varsayilan: false }
            });
        }

        const guncellenenAdres = await prisma.cariAdres.update({
            where: { id: parseInt(adresId) },
            data: updateData
        });

        return res.status(200).json(guncellenenAdres);
    }

    if (req.method === 'DELETE') {
        // Adres sil (soft delete)
        const { adresId } = req.body;

        if (!adresId) {
            return res.status(400).json({ error: 'Adres ID gerekli' });
        }

        // Adresin bu cariye ait olduğunu kontrol et
        const mevcutAdres = await prisma.cariAdres.findFirst({
            where: {
                id: parseInt(adresId),
                cariId: parseInt(cariId),
                aktif: true
            }
        });

        if (!mevcutAdres) {
            return res.status(404).json({ error: 'Adres bulunamadı' });
        }

        // Soft delete
        await prisma.cariAdres.update({
            where: { id: parseInt(adresId) },
            data: { aktif: false }
        });

        // Eğer varsayılan adres siliniyorsa, başka birini varsayılan yap
        if (mevcutAdres.varsayilan) {
            const yeniVarsayilan = await prisma.cariAdres.findFirst({
                where: {
                    cariId: parseInt(cariId),
                    aktif: true,
                    id: { not: parseInt(adresId) }
                },
                orderBy: { createdAt: 'asc' }
            });

            if (yeniVarsayilan) {
                await prisma.cariAdres.update({
                    where: { id: yeniVarsayilan.id },
                    data: { varsayilan: true }
                });
            }
        }

        return res.status(204).end();
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
}

export default withRBAC(handler, {
    permission: PERMISSIONS.VIEW_CUSTOMERS
}); 