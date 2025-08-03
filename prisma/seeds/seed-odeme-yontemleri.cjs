// ===================================================================
// 💳 ÖDEME YÖNTEMLERİ SEED SCRIPT
// CSV'den ödeme yöntemlerini kaydetme
// ===================================================================

const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// CSV dosya yolu
const CSV_PATH = path.join(__dirname, '../../veriler/Ödeme Yöntemi Kodları.csv');

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
 * CSV'den ödeme yöntemlerini parse eder
 */
function parseOdemeYontemleri(csvData) {
    const odemeYontemleri = [];

    csvData.forEach((row, index) => {
        const ad = row['Ödeme Yöntemi Adı'];
        const kod = row['Ödeme Yöntemi Kodu'];

        if (ad && kod && ad.trim() && kod.trim()) {
            // Enum value belirleme
            const enumValue = getEnumValue(ad.trim());

            odemeYontemleri.push({
                ad: ad.trim(),
                kod: kod.trim(),
                enumValue: enumValue,
                aktif: true,
                siraNo: index + 1
            });

            console.log(`✅ ${ad.trim()} -> ${kod.trim()} (${enumValue})`);
        }
    });

    return odemeYontemleri;
}

/**
 * Ödeme yöntemi adından enum value belirler
 */
function getEnumValue(odemeYontemiAdi) {
    const enumMap = {
        'Nakit': 'NAKIT',
        'Kredi Kartı': 'KREDI_KARTI',
        'Cari': 'CARI',
        'Çek': 'CEK',
        'Banka Havalesi': 'BANKA_HAVALESI',
        'İkram': 'IKRAM'
    };

    return enumMap[odemeYontemiAdi] || 'NAKIT';
}

/**
 * Ödeme yöntemi açıklaması oluşturur
 */
function createDescription(odemeYontemi) {
    const descriptions = {
        'Nakit': 'Peşin nakit ödeme',
        'Kredi Kartı': 'Kredi kartı ile ödeme (POS cihazı)',
        'Cari': 'Cari hesap üzerinden vadeli ödeme',
        'Çek': 'Çek ile ödeme (ileri tarihli)',
        'Banka Havalesi': 'Banka havalesi/EFT ile ödeme',
        'İkram': 'İkram/Hediye ürün (ödeme yok)'
    };

    return descriptions[odemeYontemi.ad] || `${odemeYontemi.ad} ile ödeme`;
}

/**
 * Ana seed fonksiyonu
 */
async function main() {
    console.log('💳 Ödeme Yöntemleri seed işlemi başlıyor...\n');

    try {
        // 1. CSV dosyasını oku
        console.log('📖 CSV dosyası okunuyor...');
        const csvData = await readCSV(CSV_PATH);

        // 2. Verileri parse et
        console.log('🔍 Veriler parse ediliyor...');
        const odemeYontemleri = parseOdemeYontemleri(csvData);

        console.log(`   ✅ ${odemeYontemleri.length} ödeme yöntemi bulundu\n`);

        // 3. Önce SystemSetting tablosuna ödeme yöntemlerini kaydet
        console.log('⚙️ Sistem ayarlarına kaydediliyor...');

        for (const odeme of odemeYontemleri) {
            const settingKey = `ODEME_YONTEMI_${odeme.kod}`;
            const settingValue = JSON.stringify({
                ad: odeme.ad,
                kod: odeme.kod,
                enumValue: odeme.enumValue,
                aciklama: createDescription(odeme),
                aktif: odeme.aktif,
                siraNo: odeme.siraNo
            });

            // Mevcut ayarı kontrol et
            const existing = await prisma.systemSetting.findUnique({
                where: { key: settingKey }
            });

            if (!existing) {
                await prisma.systemSetting.create({
                    data: {
                        key: settingKey,
                        value: settingValue,
                        dataType: 'JSON',
                        category: 'ODEME_YONTEMLERI',
                        description: `${odeme.ad} ödeme yöntemi tanımı`
                    }
                });

                console.log(`   ✅ ${odeme.ad} (${odeme.kod}) sistem ayarlarına eklendi`);
            } else {
                // Güncelle
                await prisma.systemSetting.update({
                    where: { key: settingKey },
                    data: {
                        value: settingValue,
                        description: `${odeme.ad} ödeme yöntemi tanımı`
                    }
                });

                console.log(`   🔄 ${odeme.ad} (${odeme.kod}) güncellendi`);
            }
        }

        // 4. Ana ödeme yöntemi listesi ayarı
        const odemeYontemiListesi = {
            NAKIT: { kod: 'OY001', ad: 'Nakit', siraNo: 1 },
            KREDI_KARTI: { kod: 'OY002', ad: 'Kredi Kartı', siraNo: 2 },
            CARI: { kod: 'OY003', ad: 'Cari', siraNo: 3 },
            CEK: { kod: 'OY004', ad: 'Çek', siraNo: 4 },
            BANKA_HAVALESI: { kod: 'OY005', ad: 'Banka Havalesi', siraNo: 5 },
            IKRAM: { kod: 'OY006', ad: 'İkram', siraNo: 6 }
        };

        const mainListSetting = await prisma.systemSetting.findUnique({
            where: { key: 'ODEME_YONTEMLERI_LISTESI' }
        });

        if (!mainListSetting) {
            await prisma.systemSetting.create({
                data: {
                    key: 'ODEME_YONTEMLERI_LISTESI',
                    value: JSON.stringify(odemeYontemiListesi),
                    dataType: 'JSON',
                    category: 'ODEME_YONTEMLERI',
                    description: 'Tüm ödeme yöntemleri listesi (enum mapping)'
                }
            });

            console.log(`   ✅ Ana ödeme yöntemi listesi oluşturuldu`);
        } else {
            await prisma.systemSetting.update({
                where: { key: 'ODEME_YONTEMLERI_LISTESI' },
                data: {
                    value: JSON.stringify(odemeYontemiListesi)
                }
            });

            console.log(`   🔄 Ana ödeme yöntemi listesi güncellendi`);
        }

        // 5. Özet rapor
        console.log('\n📊 ÖDEME YÖNTEMİ KATEGORİLERİ:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const kategoriler = {
            'Anında Ödeme': ['Nakit', 'Kredi Kartı'],
            'Vadeli Ödeme': ['Cari', 'Çek', 'Banka Havalesi'],
            'Özel Durumlar': ['İkram']
        };

        for (const [kategori, yontemler] of Object.entries(kategoriler)) {
            const mevcutYontemler = yontemler.filter(yontem =>
                odemeYontemleri.some(o => o.ad === yontem)
            );
            console.log(`💳 ${kategori}: ${mevcutYontemler.join(', ')}`);
        }

        // 6. Final özet
        console.log('\n🎉 SEED İŞLEMİ TAMAMLANDI!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ ${odemeYontemleri.length} ödeme yöntemi kaydedildi`);
        console.log(`⚙️ Sistem ayarlarında saklandı`);
        console.log(`🔗 Enum ile mapping yapıldı`);

        // API kullanım örnekleri
        console.log('\n🚀 KULLANIM ÖRNEKLERİ:');
        console.log('   Frontend\'de: await getOdemeYontemleri()');
        console.log('   Backend\'de: OdemeYontemi.NAKIT');
        console.log('   Kod ile: getOdemeYontemiByKod("OY001")');

    } catch (error) {
        console.error('❌ Hata:', error);
        process.exit(1);
    }
}

// Export function
module.exports = { seedOdemeYontemleri: main }; 