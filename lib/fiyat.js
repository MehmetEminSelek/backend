const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * TARİHSEL FİYAT SORGULAMA - Sipariş tarihine göre geçerli fiyatı bulur
 * @param {string} urunId - Product ID
 * @param {string} birim - Unit (KG or GRAM)
 * @param {Date} tarih - Sipariş tarihi (hangi tarihte fiyat geçerliydi?)
 * @returns {number} O tarihte geçerli olan fiyat
 */
async function getFiyatByBirim(urunId, birim, tarih = new Date()) {
    try {
        console.log(`🔍 Fiyat sorgusu: Ürün=${urunId}, Tarih=${tarih.toISOString().split('T')[0]}`);
        
        // Belirtilen tarihte geçerli olan fiyatı bul
        const fiyat = await prisma.urunFiyat.findFirst({
            where: {
                urunId: urunId,
                birim: 'KG', // Tüm fiyatlar KG olarak saklanır
                aktif: true,
                baslangicTarihi: {
                    lte: tarih  // Başlangıç tarihi <= sipariş tarihi
                },
                OR: [
                    { bitisTarihi: null },           // Açık uçlu fiyat (hala geçerli)
                    { bitisTarihi: { gte: tarih } }  // Bitiş tarihi >= sipariş tarihi
                ]
            },
            orderBy: {
                baslangicTarihi: 'desc'  // En son başlayan fiyatı al
            },
            include: {
                urun: { select: { ad: true, kod: true } }
            }
        });

        if (!fiyat) {
            console.warn(`❌ ${tarih.toISOString().split('T')[0]} tarihinde ürün ${urunId} için fiyat bulunamadı`);
            return 0;
        }

        console.log(`✅ Bulunan fiyat: ${fiyat.kgFiyati}₺ (${fiyat.baslangicTarihi?.toISOString().split('T')[0]} - ${fiyat.bitisTarihi?.toISOString().split('T')[0] || 'Süresiz'})`);

        const kgPrice = parseFloat(fiyat.kgFiyati);

        // GRAM fiyatı isteniyorsa KG'dan GRAM'a çevir (1000'e böl)
        if (birim === 'GRAM') {
            return kgPrice / 1000;
        }

        // KG fiyatını olduğu gibi döndür
        return kgPrice;

    } catch (error) {
        console.error('❌ getFiyatByBirim hatası:', error);
        return 0;
    }
}

/**
 * Calculate total price for order item with KDV
 * @param {string} urunId - Product ID
 * @param {number} miktar - Quantity
 * @param {string} birim - Unit (KG or GRAM)
 * @param {Date} tarih - Date
 * @returns {Object} { birimFiyat, araToplam, kdvOrani, kdvTutari, toplamFiyat }
 */
async function calculateOrderItemPrice(urunId, miktar, birim, tarih = new Date()) {
    try {
        const birimFiyat = await getFiyatByBirim(urunId, birim, tarih);
        const araToplam = birimFiyat * miktar;

        // KDV rate is fixed at 18% since it's not stored in Urun model
        const kdvOrani = 18.0;
        const kdvTutari = (araToplam * kdvOrani) / 100;
        const toplamFiyat = araToplam + kdvTutari;

        return {
            birimFiyat: parseFloat(birimFiyat.toFixed(4)),
            araToplam: parseFloat(araToplam.toFixed(2)),
            kdvOrani: parseFloat(kdvOrani.toFixed(2)),
            kdvTutari: parseFloat(kdvTutari.toFixed(2)),
            toplamFiyat: parseFloat(toplamFiyat.toFixed(2))
        };
    } catch (error) {
        console.error('Error in calculateOrderItemPrice:', error);
        return {
            birimFiyat: 0,
            araToplam: 0,
            kdvOrani: 18.0,
            kdvTutari: 0,
            toplamFiyat: 0
        };
    }
}

/**
 * Recalculate prices for existing order items (for fixing database)
 * @param {Array} orderItems - Array of order items
 * @param {Date} orderDate - Order date
 * @returns {Array} Updated order items with correct prices
 */
async function recalculateOrderItemPrices(orderItems, orderDate) {
    const updatedItems = [];

    for (const item of orderItems) {
        try {
            // Check if item has valid urunId
            if (!item.urunId) {
                console.warn(`Item ${item.id} has no urunId, skipping price recalculation`);
                updatedItems.push(item);
                continue;
            }

            const { birimFiyat, araToplam, kdvOrani, kdvTutari, toplamFiyat } = await calculateOrderItemPrice(
                item.urunId,
                item.miktar,
                item.birim,
                orderDate
            );

            updatedItems.push({
                ...item,
                birimFiyat,
                araToplam,
                kdvOrani,
                kdvTutari,
                toplamFiyat
            });
        } catch (error) {
            console.error(`Error recalculating price for item ${item.id}:`, error);
            updatedItems.push(item);
        }
    }

    return updatedItems;
}

module.exports = {
    getFiyatByBirim,
    calculateOrderItemPrice,
    recalculateOrderItemPrices
}; 