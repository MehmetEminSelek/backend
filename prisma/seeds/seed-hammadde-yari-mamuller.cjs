// ===================================================================
// 🧪 HAMMADDE VE YARI MAMUL SEED SCRIPT
// CSV'den malzeme verilerini kaydetme
// ===================================================================

const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// CSV dosya yolu
const CSV_PATH = path.join(__dirname, '../../veriler/Hammade ve Yarı Mamüller Kodlar.csv');

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
 * CSV'den hammadde ve yarı mamülleri parse eder
 * CSV'de sorun olduğu için manuel kod assignment yapıyoruz
 */
function parseMaterials(csvData) {
    const materials = [];

    // Doğru hammadde listesi
    const hammaddeListesi = [
        'ANTEP PEYNİRİ', 'CEVİZ', 'GLİKOZ', 'IRMIK NO:0', 'IRMIK NO:3',
        'İÇ FISTIK', 'KADAYIF', 'KARAKOYUNLU UN', 'LİMON', 'MAYDANOZ',
        'NIŞASTA', 'SADEYAĞ', 'SODA GR', 'SU', 'SÜT',
        'TEKSİN UN', 'TOZ ŞEKER', 'TUZ', 'YOĞURT', 'YUMURTA'
    ];

    // Yarı mamul listesi
    const yariMamulListesi = [
        'HAMUR (YM)', 'KAYMAK (YM)', 'SERBET (YM)'
    ];

    csvData.forEach((row, index) => {
        const hammaddeAdi = row['HAMMADDE ADI'];
        const yariMamulAdi = row['YARI MAMUL ADI '];

        // Hammadde işleme
        if (hammaddeAdi && hammaddeAdi.trim()) {
            const hammaddeIndex = hammaddeListesi.indexOf(hammaddeAdi.trim());
            if (hammaddeIndex !== -1) {
                const hammaddeKodu = `HM${String(hammaddeIndex + 1).padStart(3, '0')}`;

                materials.push({
                    ad: hammaddeAdi.trim(),
                    kod: hammaddeKodu,
                    tipi: 'HAMMADDE',
                    birim: determineBirim(hammaddeAdi.trim()),
                    aktif: true,
                    birimFiyat: 0,
                    mevcutStok: 0,
                    minStokSeviye: 0,
                    kritikSeviye: 10
                });

                console.log(`✅ Hammadde: ${hammaddeAdi.trim()} -> ${hammaddeKodu}`);
            }
        }

        // Yarı mamul işleme (sadece ilk 3 satırda)
        if (yariMamulAdi && yariMamulAdi.trim() && index < 3) {
            const yariMamulIndex = yariMamulListesi.indexOf(yariMamulAdi.trim());
            if (yariMamulIndex !== -1) {
                const yariMamulKodu = `YM${String(yariMamulIndex + 1).padStart(3, '0')}`;

                materials.push({
                    ad: yariMamulAdi.trim(),
                    kod: yariMamulKodu,
                    tipi: 'YARI_MAMUL',
                    birim: 'KG',
                    aktif: true,
                    birimFiyat: 0,
                    mevcutStok: 0,
                    minStokSeviye: 0,
                    kritikSeviye: 5
                });

                console.log(`✅ Yarı Mamul: ${yariMamulAdi.trim()} -> ${yariMamulKodu}`);
            }
        }
    });

    return materials;
}

/**
 * Malzeme tipine göre açıklama oluşturur
 */
function createDescription(material) {
    const descriptions = {
        'ANTEP PEYNİRİ': 'Baklava ve börek yapımında kullanılan özel peynir',
        'CEVİZ': 'Baklava ve tatlı yapımında kullanılan iç ceviz',
        'GLİKOZ': 'Şerbet ve şeker çözeltilerinde kullanılan glikoz şurubu',
        'İÇ FISTIK': 'Antep fıstığı, baklava ve tatlılarda kullanılır',
        'KADAYIF': 'Tel kadayıf, kadayıf tatlısı yapımında kullanılır',
        'SADEYAĞ': 'Geleneksel tereyağı, hamur ve pişirmede kullanılır',
        'HAMUR (YM)': 'Hazırlanmış hamur, yarı mamul olarak kullanılır',
        'KAYMAK (YM)': 'Hazırlanmış kaymak, tatlı üstünde kullanılır',
        'SERBET (YM)': 'Hazırlanmış şerbet, tatlılara dökülür'
    };

    return descriptions[material.ad] || `${material.tipi} - ${material.ad}`;
}

/**
 * Malzeme tipine göre uygun birim belirler
 */
function determineBirim(materialName) {
    const birimMap = {
        'YUMURTA': 'ADET',
        'LİMON': 'ADET',
        'SODA GR': 'GRAM',
        'TUZ': 'GRAM',
        'NIŞASTA': 'GRAM',
        'SU': 'LITRE',
        'SÜT': 'LITRE',
        'YOĞURT': 'KG'
    };

    return birimMap[materialName] || 'KG';
}

/**
 * Ana seed fonksiyonu
 */
async function main() {
    console.log('🧪 Hammadde ve Yarı Mamul seed işlemi başlıyor...\n');

    try {
        // 1. CSV dosyasını oku
        console.log('📖 CSV dosyası okunuyor...');
        const csvData = await readCSV(CSV_PATH);

        // 2. Verileri parse et
        console.log('🔍 Veriler parse ediliyor...');
        const materials = parseMaterials(csvData);

        console.log(`   ✅ ${materials.length} malzeme bulundu`);

        // Türlere göre sayıları göster
        const hammaddeler = materials.filter(m => m.tipi === 'HAMMADDE');
        const yariMamuller = materials.filter(m => m.tipi === 'YARI_MAMUL');

        console.log(`   📦 ${hammaddeler.length} hammadde`);
        console.log(`   🔧 ${yariMamuller.length} yarı mamul\n`);

        // 3. Malzemeleri kaydet
        console.log('💾 Malzemeler kaydediliyor...');
        let kayitSayisi = 0;

        for (const material of materials) {
            // Mevcut kaydı kontrol et
            const existing = await prisma.material.findUnique({
                where: { kod: material.kod }
            });

            if (!existing) {
                // Açıklama ve birim ayarla
                const materialData = {
                    ...material,
                    aciklama: createDescription(material),
                    birim: determineBirim(material.ad)
                };

                await prisma.material.create({
                    data: materialData
                });

                kayitSayisi++;
                const tipIcon = material.tipi === 'HAMMADDE' ? '📦' : '🔧';
                console.log(`   ✅ ${tipIcon} ${material.ad} (${material.kod}) kaydedildi`);
            } else {
                console.log(`   ℹ️  ${material.ad} (${material.kod}) zaten mevcut`);
            }
        }

        // 4. Özet rapor
        console.log('\n📊 MALZEME KATEGORİLERİ:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Hammadde kategorileri
        const hammaddeKategorileri = {
            'UN ve Tahıl': ['IRMIK NO:0', 'IRMIK NO:3', 'KARAKOYUNLU UN', 'TEKSİN UN'],
            'Süt Ürünleri': ['ANTEP PEYNİRİ', 'SÜT', 'YOĞURT'],
            'Yağlar': ['SADEYAĞ'],
            'Kuruyemiş': ['CEVİZ', 'İÇ FISTIK'],
            'Şeker Grubu': ['GLİKOZ', 'TOZ ŞEKER'],
            'Sebze-Meyve': ['LİMON', 'MAYDANOZ'],
            'Diğer': ['KADAYIF', 'NIŞASTA', 'SODA GR', 'SU', 'TUZ', 'YUMURTA']
        };

        for (const [kategori, urunler] of Object.entries(hammaddeKategorileri)) {
            const mevcutUrunler = urunler.filter(urun =>
                hammaddeler.some(h => h.ad === urun)
            );
            if (mevcutUrunler.length > 0) {
                console.log(`📦 ${kategori}: ${mevcutUrunler.length} ürün`);
            }
        }

        console.log(`🔧 Yarı Mamuller: ${yariMamuller.length} ürün`);

        // 5. Final özet
        console.log('\n🎉 SEED İŞLEMİ TAMAMLANDI!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ ${kayitSayisi} yeni malzeme kaydedildi`);
        console.log(`📦 Toplam hammadde: ${hammaddeler.length}`);
        console.log(`🔧 Toplam yarı mamul: ${yariMamuller.length}`);
        console.log(`📋 Toplam malzeme: ${materials.length}`);

        // Sonraki adımlar önerisi
        console.log('\n🚀 SONRAKİ ADIMLAR:');
        console.log('   1. Malzeme fiyatlarını güncelle');
        console.log('   2. Tedarikçi bilgilerini ekle');
        console.log('   3. Reçete bağlantılarını oluştur');

    } catch (error) {
        console.error('❌ Hata:', error);
        process.exit(1);
    }
}

// Export function
module.exports = { seedHammadeYariMamuller: main }; 