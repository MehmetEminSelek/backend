// pages/api/kategoriler/index.js
// Ürün Kategorileri Yönetimi API'si

import prisma from '../../../lib/prisma.js';
import { withCorsAndAuth } from '../../../lib/cors-wrapper.js';

export default withCorsAndAuth(async function handler(req, res) {

    try {
        switch (req.method) {
            case 'GET':
                return await getKategoriler(req, res);
            case 'POST':
                return await createKategori(req, res);
            case 'PUT':
                return await updateKategori(req, res);
            case 'DELETE':
                return await deleteKategori(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
                return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
        }
    } catch (error) {
        console.error('❌ Kategori API Hatası:', error);
        return res.status(500).json({
            error: 'Sunucu hatası oluştu',
            details: error.message
        });
    }
});

// Kategorileri listele
async function getKategoriler(req, res) {
    const { aktif = '', search = '' } = req.query;

    try {
        const where = {};

        // Aktif filtresi
        if (aktif !== '') {
            where.aktif = aktif === 'true';
        }

        // Arama filtresi
        if (search) {
            where.OR = [
                { ad: { contains: search, mode: 'insensitive' } },
                { aciklama: { contains: search, mode: 'insensitive' } }
            ];
        }

        const kategoriler = await prisma.urunKategori.findMany({
            where,
            orderBy: [
                { ad: 'asc' }
            ],
            include: {
                _count: {
                    select: {
                        urunler: true
                    }
                }
            }
        });

        // Kategorileri formatla
        const formattedKategoriler = kategoriler.map(kategori => ({
            ...kategori,
            urunSayisi: kategori._count.urunler
        }));

        return res.status(200).json({
            kategoriler: formattedKategoriler
        });

    } catch (error) {
        console.error('❌ Kategori listesi hatası:', error);
        return res.status(500).json({ error: 'Kategoriler listelenirken hata oluştu' });
    }
}

// Yeni kategori oluştur
async function createKategori(req, res) {
    const {
        ad,
        aciklama,
        aktif = true
    } = req.body;

    // Zorunlu alanları kontrol et
    if (!ad) {
        return res.status(400).json({ error: 'Kategori adı zorunludur' });
    }

    try {
        const yeniKategori = await prisma.urunKategori.create({
            data: {
                ad,
                aciklama,
                aktif
            }
        });

        return res.status(201).json({
            message: 'Kategori başarıyla oluşturuldu',
            kategori: yeniKategori
        });

    } catch (error) {
        console.error('❌ Kategori oluşturma hatası:', error);

        if (error.code === 'P2002') {
            return res.status(400).json({
                error: 'Bu kategori adı zaten kullanımda'
            });
        }

        return res.status(500).json({ error: 'Kategori oluşturulurken hata oluştu' });
    }
}

// Kategori güncelle
async function updateKategori(req, res) {
    const { id } = req.query;
    const updateData = req.body;

    if (!id) {
        return res.status(400).json({ error: 'Kategori ID gerekli' });
    }

    try {
        const guncellenenKategori = await prisma.urunKategori.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                _count: {
                    select: {
                        urunler: true
                    }
                }
            }
        });

        return res.status(200).json({
            message: 'Kategori başarıyla güncellendi',
            kategori: {
                ...guncellenenKategori,
                urunSayisi: guncellenenKategori._count.urunler
            }
        });

    } catch (error) {
        console.error('❌ Kategori güncelleme hatası:', error);

        if (error.code === 'P2002') {
            return res.status(400).json({
                error: 'Bu kategori adı zaten kullanımda'
            });
        }
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Kategori bulunamadı' });
        }

        return res.status(500).json({ error: 'Kategori güncellenirken hata oluştu' });
    }
}

// Kategori sil
async function deleteKategori(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'Kategori ID gerekli' });
    }

    try {
        // Kategorinin kullanımda olup olmadığını kontrol et
        const kategori = await prisma.urunKategori.findUnique({
            where: { id: parseInt(id) },
            include: {
                _count: {
                    select: {
                        urunler: true
                    }
                }
            }
        });

        if (!kategori) {
            return res.status(404).json({ error: 'Kategori bulunamadı' });
        }

        // Kullanımda olan kategoriyi silmeye izin verme
        if (kategori._count.urunler > 0) {
            return res.status(400).json({
                error: 'Bu kategori kullanımda olduğu için silinemez',
                details: {
                    urunSayisi: kategori._count.urunler
                }
            });
        }

        await prisma.urunKategori.delete({
            where: { id: parseInt(id) }
        });

        return res.status(200).json({
            message: 'Kategori başarıyla silindi'
        });

    } catch (error) {
        console.error('❌ Kategori silme hatası:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Kategori bulunamadı' });
        }

        return res.status(500).json({ error: 'Kategori silinirken hata oluştu' });
    }
} 