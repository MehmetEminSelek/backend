// ===================================================================
// 💰 FİYAT YÖNETİMİ HELPER FUNCTIONS
// Tarihsel fiyat takibi ve sorgulama
// ===================================================================

import prisma from './prisma.js';

/**
 * Belirli bir tarihte ürünün geçerli fiyatını bulur
 * @param {number} urunId - Ürün ID'si
 * @param {Date} tarih - Hangi tarihte fiyat geçerliydi (default: bugün)
 * @param {string} fiyatTipi - Fiyat tipi (NORMAL, KAMPANYA, vb.)
 * @returns {Promise<Object|null>} Fiyat bilgisi veya null
 */
async function getUrunFiyati(urunId, tarih = new Date(), fiyatTipi = 'NORMAL') {
    try {
        const fiyat = await prisma.urunFiyat.findFirst({
            where: {
                urunId: urunId,
                fiyatTipi: fiyatTipi,
                aktif: true,
                baslangicTarihi: {
                    lte: tarih  // Başlangıç tarihi <= sorgulanan tarih
                },
                OR: [
                    { bitisTarihi: null },           // Hiç bitmemiş (hala geçerli)
                    { bitisTarihi: { gte: tarih } }  // Bitiş tarihi >= sorgulanan tarih
                ]
            },
            orderBy: {
                baslangicTarihi: 'desc'  // En son geçerli olan fiyat
            },
            include: {
                urun: {
                    select: { ad: true, kod: true }
                }
            }
        });

        return fiyat;
    } catch (error) {
        console.error('Ürün fiyatı sorgulanırken hata:', error);
        return null;
    }
}

/**
 * Belirli bir tarihte tepsi/tava fiyatını bulur
 * @param {number} tepsiTavaId - Tepsi/Tava ID'si
 * @param {Date} tarih - Hangi tarihte fiyat geçerliydi
 * @param {string} fiyatTipi - Fiyat tipi
 * @returns {Promise<Object|null>} Fiyat bilgisi veya null
 */
async function getTepsiFiyati(tepsiTavaId, tarih = new Date(), fiyatTipi = 'NORMAL') {
    try {
        const fiyat = await prisma.tepsiFiyat.findFirst({
            where: {
                tepsiTavaId: tepsiTavaId,
                fiyatTipi: fiyatTipi,
                aktif: true,
                baslangicTarihi: { lte: tarih },
                OR: [
                    { bitisTarihi: null },
                    { bitisTarihi: { gte: tarih } }
                ]
            },
            orderBy: {
                baslangicTarihi: 'desc'
            },
            include: {
                tepsiTava: {
                    select: { ad: true, kod: true }
                }
            }
        });

        return fiyat;
    } catch (error) {
        console.error('Tepsi fiyatı sorgulanırken hata:', error);
        return null;
    }
}

/**
 * Yeni ürün fiyatı ekler ve eskisini kapatır
 * @param {number} urunId - Ürün ID'si
 * @param {number} yeniFiyat - Yeni KG fiyatı
 * @param {Date} baslangicTarihi - Yeni fiyatın başlangıç tarihi
 * @param {string} personelId - Değişikliği yapan personel
 * @param {string} sebep - Değişiklik sebebi
 * @param {string} fiyatTipi - Fiyat tipi
 * @returns {Promise<Object>} Yeni fiyat kaydı
 */
async function setUrunFiyati(urunId, yeniFiyat, baslangicTarihi = new Date(), personelId, sebep, fiyatTipi = 'NORMAL') {
    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Mevcut geçerli fiyatı bul
            const mevcutFiyat = await tx.urunFiyat.findFirst({
                where: {
                    urunId: urunId,
                    fiyatTipi: fiyatTipi,
                    aktif: true,
                    bitisTarihi: null
                }
            });

            // 2. Eğer mevcut fiyat varsa, onu bitir
            if (mevcutFiyat) {
                const bitisTarihi = new Date(baslangicTarihi);
                bitisTarihi.setDate(bitisTarihi.getDate() - 1); // Bir gün öncesi

                await tx.urunFiyat.update({
                    where: { id: mevcutFiyat.id },
                    data: {
                        bitisTarihi: bitisTarihi,
                        updatedBy: personelId
                    }
                });
            }

            // 3. Yeni fiyatı ekle
            const yeniFiyatKaydi = await tx.urunFiyat.create({
                data: {
                    urunId: urunId,
                    kgFiyati: yeniFiyat,
                    fiyatTipi: fiyatTipi,
                    baslangicTarihi: baslangicTarihi,
                    bitisTarihi: null, // Yeni fiyat açık uçlu
                    aktif: true,
                    createdBy: personelId,
                    updatedBy: personelId,
                    degisiklikSebebi: sebep,
                    eskiFiyat: mevcutFiyat?.kgFiyati || null,
                    yuzdelik: mevcutFiyat ?
                        ((yeniFiyat - mevcutFiyat.kgFiyati) / mevcutFiyat.kgFiyati * 100) : null
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
 * @param {number} tepsiTavaId - Tepsi/Tava ID'si
 * @param {number} yeniFiyat - Yeni adet fiyatı
 * @param {Date} baslangicTarihi - Başlangıç tarihi
 * @param {string} personelId - Personel ID'si
 * @param {string} sebep - Değişiklik sebebi
 * @param {string} fiyatTipi - Fiyat tipi
 * @returns {Promise<Object>} Yeni fiyat kaydı
 */
async function setTepsiFiyati(tepsiTavaId, yeniFiyat, baslangicTarihi = new Date(), personelId, sebep, fiyatTipi = 'NORMAL') {
    try {
        return await prisma.$transaction(async (tx) => {
            // Mevcut fiyatı bitir
            const mevcutFiyat = await tx.tepsiFiyat.findFirst({
                where: {
                    tepsiTavaId: tepsiTavaId,
                    fiyatTipi: fiyatTipi,
                    aktif: true,
                    bitisTarihi: null
                }
            });

            if (mevcutFiyat) {
                const bitisTarihi = new Date(baslangicTarihi);
                bitisTarihi.setDate(bitisTarihi.getDate() - 1);

                await tx.tepsiFiyat.update({
                    where: { id: mevcutFiyat.id },
                    data: {
                        bitisTarihi: bitisTarihi,
                        updatedBy: personelId
                    }
                });
            }

            // Yeni fiyat ekle
            const yeniFiyatKaydi = await tx.tepsiFiyat.create({
                data: {
                    tepsiTavaId: tepsiTavaId,
                    adetFiyati: yeniFiyat,
                    fiyatTipi: fiyatTipi,
                    baslangicTarihi: baslangicTarihi,
                    bitisTarihi: null,
                    aktif: true,
                    createdBy: personelId,
                    updatedBy: personelId,
                    degisiklikSebebi: sebep,
                    eskiFiyat: mevcutFiyat?.adetFiyati || null,
                    yuzdelik: mevcutFiyat ?
                        ((yeniFiyat - mevcutFiyat.adetFiyati) / mevcutFiyat.adetFiyati * 100) : null
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
 * @param {number} urunId - Ürün ID'si
 * @param {string} fiyatTipi - Fiyat tipi (optional)
 * @returns {Promise<Array>} Fiyat geçmişi
 */
async function getUrunFiyatGecmisi(urunId, fiyatTipi = null) {
    try {
        const where = { urunId: urunId };
        if (fiyatTipi) where.fiyatTipi = fiyatTipi;

        const fiyatlar = await prisma.urunFiyat.findMany({
            where: where,
            orderBy: { baslangicTarihi: 'desc' },
            include: {
                urun: {
                    select: { ad: true, kod: true }
                }
            }
        });

        return fiyatlar;
    } catch (error) {
        console.error('Fiyat geçmişi sorgulanırken hata:', error);
        return [];
    }
}

/**
 * Belirli bir tarih aralığında fiyat değişikliklerini getirir
 * @param {Date} baslangic - Başlangıç tarihi
 * @param {Date} bitis - Bitiş tarihi
 * @returns {Promise<Array>} Fiyat değişiklikleri
 */
async function getFiyatDegisiklikleri(baslangic, bitis) {
    try {
        const urunFiyatDegisiklikleri = await prisma.urunFiyat.findMany({
            where: {
                baslangicTarihi: {
                    gte: baslangic,
                    lte: bitis
                },
                eskiFiyat: { not: null } // Sadece değişiklik olan kayıtlar
            },
            include: {
                urun: {
                    select: { ad: true, kod: true }
                }
            },
            orderBy: { baslangicTarihi: 'desc' }
        });

        const tepsiFiyatDegisiklikleri = await prisma.tepsiFiyat.findMany({
            where: {
                baslangicTarihi: {
                    gte: baslangic,
                    lte: bitis
                },
                eskiFiyat: { not: null }
            },
            include: {
                tepsiTava: {
                    select: { ad: true, kod: true }
                }
            },
            orderBy: { baslangicTarihi: 'desc' }
        });

        return {
            urunFiyatlari: urunFiyatDegisiklikleri,
            tepsiFiyatlari: tepsiFiyatDegisiklikleri
        };
    } catch (error) {
        console.error('Fiyat değişiklikleri sorgulanırken hata:', error);
        return { urunFiyatlari: [], tepsiFiyatlari: [] };
    }
}

module.exports = {
    getUrunFiyati,
    getTepsiFiyati,
    setUrunFiyati,
    setTepsiFiyati,
    getUrunFiyatGecmisi,
    getFiyatDegisiklikleri
}; 