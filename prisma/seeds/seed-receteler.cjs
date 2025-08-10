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
            .pipe(csv({ headers: false }))
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

function normalizeName(s) {
    if (!s) return '';
    let t = String(s).toUpperCase();
    t = t
        .replace(/İ/g, 'I').replace(/ı/g, 'I')
        .replace(/Ş/g, 'S').replace(/ş/g, 'S')
        .replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
        .replace(/Ü/g, 'U').replace(/ü/g, 'U')
        .replace(/Ö/g, 'O').replace(/ö/g, 'O')
        .replace(/Ç/g, 'C').replace(/ç/g, 'C');
    t = t.replace(/[^A-Z0-9 ()]/g, ' ').replace(/\s+/g, ' ').trim();
    return t;
}

/**
 * Stok adını Material koduna eşleştirir (normalize edilmiş isimle)
 */
function mapStokToMaterialKod(stokAdi) {
    const materialMapRaw = {
        // Hammaddeler
        'SADE YAG': 'HM012',  // SADEYAĞ
        'ANTEP PEYNIRI': 'HM001',
        'MAYDANOZ': 'HM010',
        'FISTIK': 'HM006',    // İÇ FISTIK
        'IC FISTIK': 'HM006',
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
        'TOZ Seker': 'HM017',
        'TOZ SEKER': 'HM017',

        // Yarı Mamuller
        'HAMUR (YM)': 'YM001',
        'SERBET (YM)': 'YM003',
        'KAYMAK (YM)': 'YM002'
    };

    // Normalize edilmiş keylerle lookup
    const normKey = normalizeName(stokAdi);
    // normalize edilmiş mapping oluştur
    if (!mapStokToMaterialKod._norm) {
        const m = {};
        Object.entries(materialMapRaw).forEach(([k, v]) => { m[normalizeName(k)] = v; });
        mapStokToMaterialKod._norm = m;
    }
    return mapStokToMaterialKod._norm[normKey] || null;
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
        const secondCol = Object.values(row)[1];
        const thirdCol = Object.values(row)[2];

        // Yeni reçete başlangıcı kontrolü:
        // Koşullar: (1) İlk kolonda (UR)/(YM) var, (2) 2. ve 3. kolon boş (ingredient satırından ayırt etmek için)
        const isRecipeHeader = !!firstCol && (firstCol.includes('(UR)') || firstCol.includes('(YM)')) && (!secondCol && !thirdCol);

        if (isRecipeHeader) {
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

        } else {
            // Hem header ismiyle hem indeksle erişimi destekle
            const stokAdiRaw = row['Stok Adı'] ?? row[0];
            const birimRaw = row['Birim'] ?? row[1];
            const netMiktarRaw = row['Net Miktar'] ?? row[2];
            const fire1Raw = row['Fire1'] ?? row[3];
            const fire2Raw = row['Fire2'] ?? row[4];
            const gerMktrRaw = row['Ger Mktr'] ?? row[5];

            if (stokAdiRaw && String(stokAdiRaw).trim() && String(stokAdiRaw).trim().toUpperCase() !== 'STOK ADI') {
                // Malzeme satırı
                const stokAdi = String(stokAdiRaw).trim();
                const birim = String(birimRaw || '').trim();
                const netMiktar = parseFloat(netMiktarRaw) || 0;
                const fire1 = parseFireOrani(fire1Raw);
                const fire2 = parseFireOrani(fire2Raw);
                const gerMiktar = parseFloat(gerMktrRaw) || netMiktar;

                if (netMiktar > 0) {
                    const materialKod = mapStokToMaterialKod(stokAdi);
                    const birimInfo = standardizeBirim(birim, netMiktar);
                    const gerMiktarInfo = standardizeBirim(birim, gerMiktar);

                    const ingredient = {
                        stokAdi: stokAdi,
                        materialKod: materialKod || null,
                        miktar: birimInfo.standardMiktar,
                        birim: birimInfo.standardBirim,
                        fire1: fire1,
                        fire2: fire2,
                        gerMiktar: gerMiktarInfo.standardMiktar,
                        originalBirim: birim,
                        originalMiktar: netMiktar
                    };

                    currentIngredients.push(ingredient);
                    if (materialKod) {
                        console.log(`   ✅ ${stokAdi} -> ${materialKod} (${birimInfo.standardMiktar} ${birimInfo.standardBirim})`);
                    } else {
                        console.log(`   ⚠️  ${stokAdi} için material mapping bulunamadı (fallback isim eşleştirme denenecek)`);
                    }
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
        // Materyalleri önceden çekip isimden eşleştirme için map hazırla
        const allMaterials = await prisma.material.findMany({
            select: { id: true, ad: true, kod: true }
        });
        const codeToMat = new Map(allMaterials.map(m => [String(m.kod).toUpperCase(), m]));
        const nameToMat = new Map(allMaterials.map(m => [normalizeName(m.ad), m]));

        for (const recipe of receteler) {
            try {
                // Kod çakışmasını önlemek için create path'te kullanılacak kodu belirle
                let kodForCreate = recipe.kod;
                const kodOwner = await prisma.recipe.findUnique({ where: { kod: recipe.kod } }).catch(() => null);
                if (kodOwner && kodOwner.ad !== recipe.ad) {
                    kodForCreate = `${recipe.kod}-DUP-${String(Date.now()).slice(-4)}`;
                }

                // ad unique olduğundan upsert kullanıyoruz
                const savedRecipe = await prisma.recipe.upsert({
                    where: { ad: recipe.ad },
                    update: {
                        aciklama: recipe.aciklama,
                        aktif: recipe.aktif,
                        test: false,
                        versiyon: '1.0'
                    },
                    create: {
                        ad: recipe.ad,
                        kod: kodForCreate,
                        aciklama: recipe.aciklama,
                        aktif: recipe.aktif,
                        test: false,
                        versiyon: '1.0'
                    }
                });
                console.log(`   ✅ ${recipe.ad} (${savedRecipe.kod}) kaydedildi`);

                // 4. Reçete içeriklerini kaydet (önce mevcut içerikleri temizle)
                await prisma.recipeIngredient.deleteMany({ where: { recipeId: savedRecipe.id } });
                for (const ingredient of recipe.ingredients) {
                    try {
                        // Material'ı bul: öncelik kod, sonra normalize isim, sonra partial include
                        let material = null;
                        if (ingredient.materialKod) {
                            material = codeToMat.get(String(ingredient.materialKod).toUpperCase()) || null;
                        }
                        if (!material) {
                            const norm = normalizeName(ingredient.stokAdi);
                            material = nameToMat.get(norm) || null;
                            if (!material) {
                                material = allMaterials.find(m => normalizeName(m.ad).includes(norm)) || null;
                            }
                        }

                        if (material) {
                            const price = Number(material.birimFiyat) || 0;
                            const miktarVal = Number(ingredient.miktar) || 0;
                            const usedQty = Number(ingredient.gerMiktar ?? ingredient.miktar) || 0;
                            await prisma.recipeIngredient.upsert({
                                where: { recipeId_materialId: { recipeId: savedRecipe.id, materialId: material.id } },
                                update: {
                                    miktar: { increment: miktarVal },
                                    ...(Number.isFinite(usedQty) ? { gerMiktar: { increment: usedQty } } : {}),
                                    sonFiyat: price,
                                    maliyet: { increment: usedQty * price }
                                },
                                create: {
                                    recipeId: savedRecipe.id,
                                    materialId: material.id,
                                    miktar: miktarVal,
                                    birim: ingredient.birim || material.birim,
                                    fire1: ingredient.fire1 ?? 0,
                                    fire2: ingredient.fire2 ?? 0,
                                    gerMiktar: Number(ingredient.gerMiktar) || null,
                                    sonFiyat: price,
                                    maliyet: usedQty * price,
                                    zorunlu: true
                                }
                            });

                            console.log(`      ✅ ${ingredient.stokAdi} -> ${material.kod} eklendi`);
                        } else {
                            console.warn(`      ⚠️  Material bulunamadı: ${ingredient.stokAdi}`);
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

// Skript doğrudan çalıştırılırsa main() çağır
if (require.main === module) {
    main().finally(async () => {
        await prisma.$disconnect();
    });
} 