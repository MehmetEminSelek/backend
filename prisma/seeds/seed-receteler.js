// ===================================================================
// 🧾 REÇETELER SEED SCRIPT
// CSV'den reçete ve reçete içeriklerini kaydetme
// ===================================================================

const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// CSV dosya yolu
const CSV_PATH = path.join(__dirname, '../../veriler/Reçeteler.csv');

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
 * Stok adını Material koduna eşleştirir
 */
function mapStokToMaterialKod(stokAdi) {
    const materialMap = {
        // Hammaddeler
        'SADE YAG': 'HM012',  // SADEYAĞ
        'ANTEP PEYNIRI': 'HM001',
        'MAYDANOZ': 'HM010',
        'FISTIK': 'HM006',    // İÇ FISTIK
        'TOZ SEKER': 'HM017',
        'SU': 'HM014',
        'GLIKOZ': 'HM003',
        'IRMIK NO:0': 'HM004',
        'IRMIK NO:3': 'HM005',
        'YOGURT': 'HM019',    // YOĞURT
        'SODA GR': 'HM013',
        'KARAKOYUNLU UN': 'HM008',
        'KADAYIF': 'HM007',
        'CEVIZ': 'HM002',
        'TEKSIN UN': 'HM016',
        'YUMURTA': 'HM020',
        'TUZ': 'HM018',
        'NISASTA': 'HM011',   // NIŞASTA
        'LIMON': 'HM009',
        'SUT': 'HM015',       // SÜT

        // Yarı Mamuller
        'HAMUR (YM)': 'YM001',
        'SERBET (YM)': 'YM003',
        'KAYMAK (YM)': 'YM002'
    };

    return materialMap[stokAdi] || null;
}

/**
 * Birim standardizasyonu (hepsini standard birimlere çevir)
 */
function standardizeBirim(birim, miktar) {
    const birimMap = {
        'kg': { standardBirim: 'KG', carpan: 1 },
        'gr': { standardBirim: 'KG', carpan: 0.001 },  // gram -> kg
        'lt': { standardBirim: 'LITRE', carpan: 1 },
        'ml': { standardBirim: 'LITRE', carpan: 0.001 }, // ml -> lt
        'Adet': { standardBirim: 'ADET', carpan: 1 }
    };

    const mapping = birimMap[birim] || { standardBirim: 'KG', carpan: 1 };

    return {
        standardBirim: mapping.standardBirim,
        standardMiktar: miktar * mapping.carpan
    };
}

/**
 * Fire oranını parse eder (6.00% -> 0.06)
 */
function parseFireOrani(fireStr) {
    if (!fireStr || fireStr === '0.00%') return 0;
    return parseFloat(fireStr.replace('%', '')) / 100;
}

/**
 * CSV'den reçeteleri parse eder
 */
function parseReceteler(csvData) {
    const receteler = [];
    let currentRecipe = null;
    let currentIngredients = [];

    console.log('🔍 Reçeteler parse ediliyor...\n');

    csvData.forEach((row, index) => {
        const firstCol = Object.values(row)[0]; // İlk kolonun değeri

        // Yeni reçete başlangıcı kontrolü (ürün adı içeren satırlar)
        if (firstCol && firstCol.includes('(UR)') || firstCol.includes('(YM)')) {
            // Önceki reçeteyi kaydet
            if (currentRecipe) {
                currentRecipe.ingredients = [...currentIngredients];
                receteler.push(currentRecipe);
            }

            // Yeni reçete başlat
            const recipeAdi = firstCol.trim();
            const recipeKodu = generateRecipeKod(recipeAdi);

            currentRecipe = {
                ad: recipeAdi,
                kod: recipeKodu,
                tip: firstCol.includes('(UR)') ? 'URUN' : 'YARI_MAMUL',
                aktif: true,
                aciklama: `${recipeAdi} reçetesi`
            };

            currentIngredients = [];
            console.log(`📝 ${recipeAdi} reçetesi başladı (${recipeKodu})`);

        } else if (row['Stok Adı'] && row['Stok Adı'] !== 'Stok Adı' && row['Stok Adı'].trim()) {
            // Malzeme satırı
            const stokAdi = row['Stok Adı'].trim();
            const birim = row['Birim'];
            const netMiktar = parseFloat(row['Net Miktar']) || 0;
            const fire1 = parseFireOrani(row['Fire1']);
            const fire2 = parseFireOrani(row['Fire2']);
            const gerMiktar = parseFloat(row['Ger Mktr']) || netMiktar;

            if (netMiktar > 0) {
                const materialKod = mapStokToMaterialKod(stokAdi);

                if (materialKod) {
                    const birimInfo = standardizeBirim(birim, netMiktar);
                    const gerMiktarInfo = standardizeBirim(birim, gerMiktar);

                    const ingredient = {
                        stokAdi: stokAdi,
                        materialKod: materialKod,
                        miktar: birimInfo.standardMiktar,
                        birim: birimInfo.standardBirim,
                        fire1: fire1,
                        fire2: fire2,
                        gerMiktar: gerMiktarInfo.standardMiktar,
                        originalBirim: birim,
                        originalMiktar: netMiktar
                    };

                    currentIngredients.push(ingredient);
                    console.log(`   ✅ ${stokAdi} -> ${materialKod} (${birimInfo.standardMiktar} ${birimInfo.standardBirim})`);
                } else {
                    console.log(`   ⚠️  ${stokAdi} için material mapping bulunamadı`);
                }
            }
        }
    });

    // Son reçeteyi kaydet
    if (currentRecipe) {
        currentRecipe.ingredients = [...currentIngredients];
        receteler.push(currentRecipe);
    }

    return receteler;
}

/**
 * Reçete kodu oluşturur
 */
function generateRecipeKod(recipeAdi) {
    // Basit kod oluşturma
    const kodMap = {
        'PEYNIRLI SU BOREGI (UR)': 'RCP001',
        'EZME (UR)': 'RCP002',
        'FISTIKLI KURABİYE': 'RCP003',
        'SADE KURABIYE': 'RCP004',
        'DOLAMA (UR)': 'RCP005',
        'BURMA KADAYIF (UR)': 'RCP006',
        'MIDYE (UR)': 'RCP007',
        'HAVUC DILIMI (UR)': 'RCP008',
        'SOBIYET (UR)': 'RCP009',
        'BULBUL YUVASI (UR)': 'RCP010',
        'OZEL KARE BAKLAVA (UR)': 'RCP011',
        'FISTIKLI KURU BAKLAVA (UR)': 'RCP012',
        'FISTIKLI YAS BAKLAVA (UR)': 'RCP013',
        'CEVIZLI BAKLAVA (UR)': 'RCP014',
        'HAMUR (YM)': 'YM_RCP001',
        'SERBET (YM)': 'YM_RCP002',
        'KAYMAK (YM)': 'YM_RCP003'
    };

    return kodMap[recipeAdi] || `RCP${String(Date.now()).substr(-3)}`;
}

/**
 * Maliyet hesaplama helper'ı
 */
async function calculateRecipeCost(recipe) {
    let toplamMaliyet = 0;

    for (const ingredient of recipe.ingredients) {
        try {
            // Material'ı bul
            const material = await prisma.material.findUnique({
                where: { kod: ingredient.materialKod }
            });

            if (material && material.birimFiyat > 0) {
                const malzemeMaliyeti = ingredient.gerMiktar * material.birimFiyat;
                toplamMaliyet += malzemeMaliyeti;
                ingredient.sonFiyat = material.birimFiyat;
                ingredient.maliyet = malzemeMaliyeti;
            }
        } catch (error) {
            console.warn(`Material ${ingredient.materialKod} maliyeti hesaplanamadı:`, error.message);
        }
    }

    return toplamMaliyet;
}

/**
 * Ana seed fonksiyonu
 */
async function main() {
    console.log('🧾 Reçeteler seed işlemi başlıyor...\n');

    try {
        // 1. CSV dosyasını oku
        console.log('📖 CSV dosyası okunuyor...');
        const csvData = await readCSV(CSV_PATH);

        // 2. Reçeteleri parse et
        const receteler = parseReceteler(csvData);

        console.log(`\n✅ ${receteler.length} reçete parse edildi`);

        // Kategorilere ayır
        const urunReceteler = receteler.filter(r => r.tip === 'URUN');
        const yariMamulReceteler = receteler.filter(r => r.tip === 'YARI_MAMUL');

        console.log(`   📋 ${urunReceteler.length} ürün reçetesi`);
        console.log(`   🔧 ${yariMamulReceteler.length} yarı mamul reçetesi\n`);

        // 3. Reçeteleri ve içeriklerini kaydet
        console.log('💾 Reçeteler kaydediliyor...');

        for (const recipe of receteler) {
            try {
                // Mevcut reçeteyi kontrol et
                const existingRecipe = await prisma.recipe.findUnique({
                    where: { kod: recipe.kod }
                });

                let savedRecipe;

                if (!existingRecipe) {
                    // Yeni reçete oluştur
                    savedRecipe = await prisma.recipe.create({
                        data: {
                            ad: recipe.ad,
                            kod: recipe.kod,
                            aciklama: recipe.aciklama,
                            aktif: recipe.aktif,
                            test: false,
                            versiyon: '1.0'
                        }
                    });

                    console.log(`   ✅ ${recipe.ad} (${recipe.kod}) oluşturuldu`);
                } else {
                    savedRecipe = existingRecipe;
                    console.log(`   ℹ️  ${recipe.ad} (${recipe.kod}) zaten mevcut`);
                }

                // 4. Reçete içeriklerini kaydet
                for (const ingredient of recipe.ingredients) {
                    try {
                        // Material'ı bul
                        const material = await prisma.material.findUnique({
                            where: { kod: ingredient.materialKod }
                        });

                        if (material) {
                            // Mevcut içerik var mı kontrol et
                            const existingIngredient = await prisma.recipeIngredient.findUnique({
                                where: {
                                    recipeId_materialId: {
                                        recipeId: savedRecipe.id,
                                        materialId: material.id
                                    }
                                }
                            });

                            if (!existingIngredient) {
                                await prisma.recipeIngredient.create({
                                    data: {
                                        recipeId: savedRecipe.id,
                                        materialId: material.id,
                                        miktar: ingredient.miktar,
                                        birim: ingredient.birim,
                                        fire1: ingredient.fire1,
                                        fire2: ingredient.fire2,
                                        gerMiktar: ingredient.gerMiktar,
                                        sonFiyat: material.birimFiyat || 0,
                                        maliyet: (ingredient.gerMiktar * (material.birimFiyat || 0)),
                                        zorunlu: true
                                    }
                                });

                                console.log(`      ✅ ${ingredient.stokAdi} eklendi`);
                            }
                        } else {
                            console.warn(`      ⚠️  Material bulunamadı: ${ingredient.materialKod}`);
                        }
                    } catch (error) {
                        console.error(`      ❌ ${ingredient.stokAdi} eklenirken hata:`, error.message);
                    }
                }

                // 5. Toplam maliyeti hesapla ve güncelle
                const toplamMaliyet = await calculateRecipeCost(recipe);

                await prisma.recipe.update({
                    where: { id: savedRecipe.id },
                    data: {
                        toplamMaliyet: toplamMaliyet,
                        birimMaliyet: toplamMaliyet, // 1 kg için maliyet
                        guncellemeTarihi: new Date()
                    }
                });

                console.log(`      💰 Toplam maliyet: ${toplamMaliyet.toFixed(2)} TL\n`);

            } catch (error) {
                console.error(`❌ ${recipe.ad} kaydedilirken hata:`, error.message);
            }
        }

        // 6. Final özet
        console.log('🎉 REÇETELER SEED İŞLEMİ TAMAMLANDI!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ ${receteler.length} reçete işlendi`);
        console.log(`📋 ${urunReceteler.length} ürün reçetesi`);
        console.log(`🔧 ${yariMamulReceteler.length} yarı mamul reçetesi`);
        console.log(`💰 Maliyet hesaplamaları tamamlandı`);

    } catch (error) {
        console.error('❌ Hata:', error);
        process.exit(1);
    }
}

// Export function
module.exports = { seedReceteler: main }; 