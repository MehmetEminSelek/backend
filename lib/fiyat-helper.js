// ===================================================================
// 💰 FİYAT YÖNETİMİ HELPER FUNCTIONS
// Tarihsel fiyat takibi ve sorgulama
// ===================================================================

import prisma from './prisma.js';

/**
 * Belirli bir tarihte ürünün geçerli fiyatını bulur
 */
async function getUrunFiyati(urunId, tarih = new Date(), fiyatTipi = 'NORMAL') {
    try {
        const fiyat = await prisma.urunFiyat.findFirst({
            where: {
                urunId: urunId,
                fiyatTipi: fiyatTipi,
                aktif: true,
                baslangicTarihi: { lte: tarih },
                OR: [{ bitisTarihi: null }, { bitisTarihi: { gte: tarih } }]
            },
            orderBy: { baslangicTarihi: 'desc' },
            include: { urun: { select: { ad: true, kod: true } } }
        });
        return fiyat;
    } catch (error) {
        console.error('Ürün fiyatı sorgulanırken hata:', error);
        return null;
    }
}

/**
 * Belirli bir tarihte tepsi/tava fiyatını bulur
 */
async function getTepsiFiyati(tepsiTavaId, tarih = new Date(), fiyatTipi = 'NORMAL') {
    try {
        const fiyat = await prisma.tepsiFiyat.findFirst({
            where: {
                tepsiTavaId: tepsiTavaId,
                fiyatTipi: fiyatTipi,
                aktif: true,
                baslangicTarihi: { lte: tarih },
                OR: [{ bitisTarihi: null }, { bitisTarihi: { gte: tarih } }]
            },
            orderBy: { baslangicTarihi: 'desc' },
            include: { tepsiTava: { select: { ad: true, kod: true } } }
        });
        return fiyat;
    } catch (error) {
        console.error('Tepsi fiyatı sorgulanırken hata:', error);
        return null;
    }
}

/**
 * Yeni ürün fiyatı ekler ve eskisini kapatır
 */
async function setUrunFiyati(urunId, yeniFiyat, baslangicTarihi = new Date(), personelId, sebep, fiyatTipi = 'NORMAL') {
    try {
        return await prisma.$transaction(async (tx) => {
            const mevcutFiyat = await tx.urunFiyat.findFirst({
                where: { urunId, fiyatTipi, aktif: true, bitisTarihi: null }
            });
            if (mevcutFiyat) {
                const bitisTarihi = new Date(baslangicTarihi);
                bitisTarihi.setDate(bitisTarihi.getDate() - 1);
                await tx.urunFiyat.update({
                    where: { id: mevcutFiyat.id },
                    data: { bitisTarihi, updatedBy: personelId }
                });
            }
            const yeniFiyatKaydi = await tx.urunFiyat.create({
                data: {
                    urunId,
                    kgFiyati: yeniFiyat,
                    fiyatTipi,
                    baslangicTarihi,
                    bitisTarihi: null,
                    aktif: true,
                    createdBy: personelId,
                    updatedBy: personelId,
                    degisiklikSebebi: sebep,
                    eskiFiyat: mevcutFiyat?.kgFiyati || null,
                    yuzdelik: mevcutFiyat ? ((yeniFiyat - mevcutFiyat.kgFiyati) / mevcutFiyat.kgFiyati * 100) : null
                }
            });
            return yeniFiyatKaydi;
        });
    } catch (error) {
        console.error('Ürün fiyatı eklenirken hata:', error);
        throw error;
    }
}

/**
 * Tepsi/Tava için yeni fiyat ekler
 */
async function setTepsiFiyati(tepsiTavaId, yeniFiyat, baslangicTarihi = new Date(), personelId, sebep, fiyatTipi = 'NORMAL') {
    try {
        return await prisma.$transaction(async (tx) => {
            const mevcutFiyat = await tx.tepsiFiyat.findFirst({
                where: { tepsiTavaId, fiyatTipi, aktif: true, bitisTarihi: null }
            });
            if (mevcutFiyat) {
                const bitisTarihi = new Date(baslangicTarihi);
                bitisTarihi.setDate(bitisTarihi.getDate() - 1);
                await tx.tepsiFiyat.update({
                    where: { id: mevcutFiyat.id },
                    data: { bitisTarihi, updatedBy: personelId }
                });
            }
            const yeniFiyatKaydi = await tx.tepsiFiyat.create({
                data: {
                    tepsiTavaId,
                    adetFiyati: yeniFiyat,
                    fiyatTipi,
                    baslangicTarihi,
                    bitisTarihi: null,
                    aktif: true,
                    createdBy: personelId,
                    updatedBy: personelId,
                    degisiklikSebebi: sebep,
                    eskiFiyat: mevcutFiyat?.adetFiyati || null,
                    yuzdelik: mevcutFiyat ? ((yeniFiyat - mevcutFiyat.adetFiyati) / mevcutFiyat.adetFiyati * 100) : null
                }
            });
            return yeniFiyatKaydi;
        });
    } catch (error) {
        console.error('Tepsi fiyatı eklenirken hata:', error);
        throw error;
    }
}

/**
 * Ürünün tüm fiyat geçmişini getirir
 */
async function getUrunFiyatGecmisi(urunId, fiyatTipi = null) {
    try {
        const where = { urunId };
        if (fiyatTipi) where.fiyatTipi = fiyatTipi;
        const fiyatlar = await prisma.urunFiyat.findMany({
            where,
            orderBy: { baslangicTarihi: 'desc' },
            include: { urun: { select: { ad: true, kod: true } } }
        });
        return fiyatlar;
    } catch (error) {
        console.error('Fiyat geçmişi sorgulanırken hata:', error);
        return [];
    }
}

/**
 * Belirli bir tarih aralığında fiyat değişikliklerini getirir
 */
async function getFiyatDegisiklikleri(baslangic, bitis) {
    try {
        const urunFiyatDegisiklikleri = await prisma.urunFiyat.findMany({
            where: { baslangicTarihi: { gte: baslangic, lte: bitis }, eskiFiyat: { not: null } },
            include: { urun: { select: { ad: true, kod: true } } },
            orderBy: { baslangicTarihi: 'desc' }
        });
        const tepsiFiyatDegisiklikleri = await prisma.tepsiFiyat.findMany({
            where: { baslangicTarihi: { gte: baslangic, lte: bitis }, eskiFiyat: { not: null } },
            include: { tepsiTava: { select: { ad: true, kod: true } } },
            orderBy: { baslangicTarihi: 'desc' }
        });
        return { urunFiyatlari: urunFiyatDegisiklikleri, tepsiFiyatlari: tepsiFiyatDegisiklikleri };
    } catch (error) {
        console.error('Fiyat değişiklikleri sorgulanırken hata:', error);
        return { urunFiyatlari: [], tepsiFiyatlari: [] };
    }
}

export {
    getUrunFiyati,
    getTepsiFiyati,
    setUrunFiyati,
    setTepsiFiyati,
    getUrunFiyatGecmisi,
    getFiyatDegisiklikleri
}; 