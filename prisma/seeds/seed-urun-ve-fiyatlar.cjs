// ===================================================================
// 🎯 ÜRÜN VE FİYAT SEED SCRIPT
// CSV'lerden ürünleri ve fiyatlarını tarihsel sistem ile kaydetme
// ===================================================================

const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// CSV dosya yolları
const CSV_PATHS = {
    DROPDOWN_LISTESI: path.join(__dirname, '../../veriler/Sipari Formu Dropdown Listeleri.csv'),
    URUN_FIYATLARI: path.join(__dirname, '../../veriler/Ürün ve Tepsi Fiyatları.csv')
};

/**
 * CSV dosyasını okuyan Promise-based helper
 */
function readCSV(filePath, encoding = 'utf8') {
    return new Promise((resolve, reject) => {
        const results = [];

        if (!fs.existsSync(filePath)) {
            reject(new Error(`CSV dosyası bulunamadı: ${filePath}`));
            return;
        }

        fs.createReadStream(filePath, { encoding })
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

/**
 * Dropdown listesinden ürünleri parse eder
 */
function parseDropdownProducts(csvData) {
    const products = [];

    csvData.forEach(row => {
        const urunAdi = row['Ürün Listesi'];
        const urunKodu = row['Ürün Kodu'];

        if (urunAdi && urunKodu && urunAdi.trim() && urunKodu.trim()) {
            products.push({
                ad: urunAdi.trim(),
                kod: urunKodu.trim(),
                aktif: true,
                satisaUygun: true,
                birim: 'KG'
            });
        }
    });

    return products;
}

/**
 * Fiyat listesinden ürün fiyatlarını parse eder
 */
function parseProductPrices(csvData) {
    const prices = [];

    csvData.forEach(row => {
        const urunAdi = row['ÜRÜN ADI'];
        const urunKodu = row['KOD'];
        const kgFiyati = parseFloat(row['KG FİYATI']);

        if (urunAdi && urunKodu && !isNaN(kgFiyati)) {
            prices.push({
                urunAdi: urunAdi.trim(),
                urunKodu: urunKodu.trim(),
                kgFiyati: kgFiyati
            });
        }
    });

    return prices;
}

/**
 * Fiyat listesinden tepsi/tava fiyatlarını parse eder
 */
function parseTepsiPrices(csvData) {
    const prices = [];

    csvData.forEach(row => {
        const tepsiAdi = row['Tepsi/Tava Listesi'];
        const tepsiKodu = row['Tepsi/Tava Kodu'];
        const adetFiyati = parseFloat(row['Adet Fiyatı']);

        if (tepsiAdi && tepsiKodu && !isNaN(adetFiyati)) {
            prices.push({
                tepsiAdi: tepsiAdi.trim(),
                tepsiKodu: tepsiKodu.trim(),
                adetFiyati: adetFiyati
            });
        }
    });

    return prices;
}

/**
 * Ana seed fonksiyonu
 */
async function main() {
    console.log('🎯 Ürün ve Fiyat seed işlemi başlıyor...\n');

    try {
        // 1. CSV dosyalarını oku
        console.log('📖 CSV dosyaları okunuyor...');
        const [dropdownData, fiyatData] = await Promise.all([
            readCSV(CSV_PATHS.DROPDOWN_LISTESI),
            readCSV(CSV_PATHS.URUN_FIYATLARI)
        ]);

        // 2. Verileri parse et
        console.log('🔍 Veriler parse ediliyor...');
        const products = parseDropdownProducts(dropdownData);
        const productPrices = parseProductPrices(fiyatData);
        const tepsiPrices = parseTepsiPrices(fiyatData);

        console.log(`   ✅ ${products.length} ürün bulundu`);
        console.log(`   ✅ ${productPrices.length} ürün fiyatı bulundu`);
        console.log(`   ✅ ${tepsiPrices.length} tepsi fiyatı bulundu\n`);

        // 3. Ürünleri kaydet
        console.log('💾 Ürünler kaydediliyor...');
        let urunSayisi = 0;

        for (const product of products) {
            const existingProduct = await prisma.urun.findUnique({
                where: { kod: product.kod }
            });

            if (!existingProduct) {
                await prisma.urun.create({
                    data: product
                });
                urunSayisi++;
                console.log(`   ✅ ${product.ad} (${product.kod}) kaydedildi`);
            } else {
                console.log(`   ℹ️  ${product.ad} (${product.kod}) zaten mevcut`);
            }
        }

        // 4. Ürün fiyatlarını kaydet
        console.log('\n💰 Ürün fiyatları kaydediliyor...');
        let fiyatSayisi = 0;
        const bugün = new Date();

        for (const priceData of productPrices) {
            // Ürünü bul
            const urun = await prisma.urun.findUnique({
                where: { kod: priceData.urunKodu }
            });

            if (urun) {
                // Mevcut aktif fiyat var mı kontrol et
                const mevcutFiyat = await prisma.urunFiyat.findFirst({
                    where: {
                        urunId: urun.id,
                        fiyatTipi: 'NORMAL',
                        aktif: true,
                        bitisTarihi: null
                    }
                });

                if (!mevcutFiyat) {
                    await prisma.urunFiyat.create({
                        data: {
                            urunId: urun.id,
                            kgFiyati: priceData.kgFiyati,
                            birim: 'KG',
                            fiyatTipi: 'NORMAL',
                            baslangicTarihi: bugün,
                            bitisTarihi: null,
                            aktif: true,
                            createdBy: 'SYSTEM',
                            degisiklikSebebi: 'İLK KAYIT - CSV VERİSİ'
                        }
                    });
                    fiyatSayisi++;
                    console.log(`   ✅ ${priceData.urunAdi} fiyatı: ${priceData.kgFiyati} TL/KG`);
                } else {
                    console.log(`   ℹ️  ${priceData.urunAdi} fiyatı zaten mevcut`);
                }
            } else {
                console.log(`   ❌ Ürün bulunamadı: ${priceData.urunKodu}`);
            }
        }

        // 5. Dropdown'dan tepsi/tava'ları kaydet
        console.log('\n🥤 Tepsi/Tava kayıtları kontrol ediliyor...');
        const dropdownTepsiData = [];

        dropdownData.forEach(row => {
            const tepsiAdi = row['Tepsi/Tava Listesi'];
            const tepsiKodu = row['Tepsi/Tava Kodu'];

            if (tepsiAdi && tepsiKodu && tepsiAdi.trim() && tepsiKodu.trim()) {
                dropdownTepsiData.push({
                    ad: tepsiAdi.trim(),
                    kod: tepsiKodu.trim(),
                    aktif: true
                });
            }
        });

        let tepsiSayisi = 0;
        for (const tepsi of dropdownTepsiData) {
            const existingTepsi = await prisma.tepsiTava.findUnique({
                where: { kod: tepsi.kod }
            });

            if (!existingTepsi) {
                await prisma.tepsiTava.create({
                    data: tepsi
                });
                tepsiSayisi++;
                console.log(`   ✅ ${tepsi.ad} (${tepsi.kod}) kaydedildi`);
            } else {
                console.log(`   ℹ️  ${tepsi.ad} (${tepsi.kod}) zaten mevcut`);
            }
        }

        // 6. Tepsi fiyatlarını kaydet
        console.log('\n🥤💰 Tepsi/Tava fiyatları kaydediliyor...');
        let tepsiFiyatSayisi = 0;

        for (const priceData of tepsiPrices) {
            // Tepsi/Tava'yı bul
            const tepsi = await prisma.tepsiTava.findUnique({
                where: { kod: priceData.tepsiKodu }
            });

            if (tepsi) {
                // Mevcut aktif fiyat var mı kontrol et
                const mevcutFiyat = await prisma.tepsiFiyat.findFirst({
                    where: {
                        tepsiTavaId: tepsi.id,
                        fiyatTipi: 'NORMAL',
                        aktif: true,
                        bitisTarihi: null
                    }
                });

                if (!mevcutFiyat) {
                    await prisma.tepsiFiyat.create({
                        data: {
                            tepsiTavaId: tepsi.id,
                            adetFiyati: priceData.adetFiyati,
                            fiyatTipi: 'NORMAL',
                            baslangicTarihi: bugün,
                            bitisTarihi: null,
                            aktif: true,
                            createdBy: 'SYSTEM',
                            degisiklikSebebi: 'İLK KAYIT - CSV VERİSİ'
                        }
                    });
                    tepsiFiyatSayisi++;
                    console.log(`   ✅ ${priceData.tepsiAdi} fiyatı: ${priceData.adetFiyati} TL/Adet`);
                } else {
                    console.log(`   ℹ️  ${priceData.tepsiAdi} fiyatı zaten mevcut`);
                }
            } else {
                console.log(`   ❌ Tepsi/Tava bulunamadı: ${priceData.tepsiKodu}`);
            }
        }

        // 7. Özet
        console.log('\n🎉 SEED İŞLEMİ TAMAMLANDI!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ ${urunSayisi} yeni ürün kaydedildi`);
        console.log(`✅ ${fiyatSayisi} ürün fiyatı kaydedildi`);
        console.log(`✅ ${tepsiSayisi} yeni tepsi/tava kaydedildi`);
        console.log(`✅ ${tepsiFiyatSayisi} tepsi fiyatı kaydedildi`);
        console.log(`📅 Tüm fiyatlar ${bugün.toLocaleDateString('tr-TR')} tarihinden itibaren geçerli`);

    } catch (error) {
        console.error('❌ Hata:', error);
        process.exit(1);
    }
}

// Export function
module.exports = { seedGuncelUrunFiyatlari: main }; 