// ===================================================================
// 🧾 REÇETELER CSV SEED (V2)
// Tüm reçeteleri temizleyip `backend/veriler/Reçeteler.csv`'den yeniden yükler
// ===================================================================

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const CSV_PATH = path.join(__dirname, '../../veriler/Reçeteler.csv');
const MATERIALS_CSV_PATH = path.join(__dirname, '../../veriler/Hammade ve Yarı Mamüller Kodlar.csv');

function readCSV(filePath, encoding = 'utf8') {
    return new Promise((resolve, reject) => {
        const results = [];
        if (!fs.existsSync(filePath)) {
            reject(new Error(`CSV bulunamadı: ${filePath}`));
            return;
        }
        fs.createReadStream(filePath, { encoding })
            .pipe(csv())
            .on('data', (row) => results.push(row))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

function mapStokToMaterialKod(stokAdiRaw) {
    if (!stokAdiRaw) return null;
    const stokAdi = String(stokAdiRaw).trim().toUpperCase();
    const map = {
        // Hammaddeler (örnekler; CSV’nize göre genişletilebilir)
        'SADE YAG': 'HM012',
        'ANTEP PEYNIRI': 'HM001',
        'MAYDANOZ': 'HM010',
        'FISTIK': 'HM006',
        'TOZ SEKER': 'HM017',
        'SU': 'HM014',
        'GLIKOZ': 'HM003',
        'IRMIK NO:0': 'HM004',
        'IRMIK NO:3': 'HM005',
        'YOGURT': 'HM019',
        'SODA GR': 'HM013',
        'KARAKOYUNLU UN': 'HM008',
        'KADAYIF': 'HM007',
        'CEVIZ': 'HM002',
        'TEKSIN UN': 'HM016',
        'YUMURTA': 'HM020',
        'TUZ': 'HM018',
        'NISASTA': 'HM011',
        'LIMON': 'HM009',
        'SUT': 'HM015',
        // Yarı mamuller
        'HAMUR (YM)': 'YM001',
        'SERBET (YM)': 'YM003',
        'KAYMAK (YM)': 'YM002'
    };
    return map[stokAdi] || null;
}

function standardizeBirim(birimRaw, miktar) {
    const b = String(birimRaw || '').toLowerCase();
    if (b === 'kg') return { birim: 'KG', miktar: miktar };
    if (b === 'gr' || b === 'g') return { birim: 'GRAM', miktar: miktar };
    if (b === 'lt' || b === 'l') return { birim: 'LITRE', miktar: miktar };
    if (b === 'ml') return { birim: 'ML', miktar: miktar };
    if (b === 'adet') return { birim: 'ADET', miktar: miktar };
    if (b === 'paket') return { birim: 'PAKET', miktar: miktar };
    // Default
    return { birim: 'KG', miktar: miktar };
}

function parseFireOrani(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const s = String(val).trim();
    if (!s) return 0;
    if (s.endsWith('%')) {
        const f = parseFloat(s.replace('%', ''));
        return isNaN(f) ? 0 : f / 100;
    }
    const f = parseFloat(s);
    return isNaN(f) ? 0 : f;
}

function parseReceteler(csvRows) {
    const receteler = [];
    let current = null;
    let items = [];

    const getFirstCol = (row) => Object.values(row)[0];

    for (const row of csvRows) {
        const first = getFirstCol(row);

        // Yeni reçete başlangıcı: ürün satırı (ör: "BURMA KADAYIF (UR)")
        if (first && (String(first).includes('(UR)') || String(first).includes('(YM)'))) {
            if (current) {
                current.ingredients = items.slice();
                receteler.push(current);
            }
            const ad = String(first).trim();
            current = {
                ad,
                kod: `RCP_${Date.now()}_${receteler.length + 1}`,
                aktif: true,
                aciklama: `${ad} reçetesi`
            };
            items = [];
            continue;
        }

        // Malzeme satırı
        const stokAdi = row['Stok Adı'];
        if (stokAdi && stokAdi !== 'Stok Adı') {
            const birim = row['Birim'];
            const netMiktar = parseFloat(row['Net Miktar']) || 0;
            const fire1 = parseFireOrani(row['Fire1']);
            const fire2 = parseFireOrani(row['Fire2']);
            const gerMktr = parseFloat(row['Ger Mktr']) || netMiktar;

            if (netMiktar > 0) {
                const materialKod = mapStokToMaterialKod(stokAdi);
                items.push({ stokAdi, materialKod, birim, netMiktar, fire1, fire2, gerMktr });
            }
        }
    }
    if (current) {
        current.ingredients = items.slice();
        receteler.push(current);
    }
    return receteler;
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
    t = t.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    return t;
}

async function main() {
    console.log('🧾 Reçete CSV seed (V2) başlıyor...');

    // 1) Temizle
    console.log('🧹 Mevcut tüm reçeteler siliniyor...');
    await prisma.recipeIngredient.deleteMany({});
    await prisma.recipe.deleteMany({});

    // 2) CSV oku ve parse et
    const rows = await readCSV(CSV_PATH);
    const parsed = parseReceteler(rows);
    console.log(`📄 Toplam parse edilen reçete: ${parsed.length}`);

    // 2.1) Material indekslerini hazırla
    const allMaterials = await prisma.material.findMany({
        select: { id: true, kod: true, ad: true, birimFiyat: true }
    });
    const codeToMat = new Map();
    const nameToMat = new Map();
    for (const m of allMaterials) {
        if (m.kod) codeToMat.set(String(m.kod).toUpperCase(), m);
        nameToMat.set(normalizeName(m.ad), m);
    }

    // 2.2) Materials CSV’den isim→kod haritası
    let csvNameToCode = new Map();
    try {
        const mats = await readCSV(MATERIALS_CSV_PATH);
        for (const row of mats) {
            const hm = row['HAMMADDE ADI'] || row['Hammadde Adı'] || row['Hammade Adı'];
            const ym = row['YARI MAMUL ADI '] || row['Yarı Mamul Adı'] || row['Yari Mamul Adi'];
            if (hm && hm.trim()) csvNameToCode.set(normalizeName(hm), null); // kodu bilmesek de ad eşleştirmesi için
            if (ym && ym.trim()) csvNameToCode.set(normalizeName(ym), null);
        }
    } catch (e) {
        console.log('ℹ️  Materials CSV okunamadı (opsiyonel):', e.message);
    }

    let created = 0; let ingCreated = 0;

    for (const r of parsed) {
        try {
            // Reçete oluştur
            const recipe = await prisma.recipe.create({
                data: {
                    ad: r.ad,
                    kod: r.kod,
                    aciklama: r.aciklama || '',
                    aktif: true,
                    porsiyon: 1
                },
                select: { id: true }
            });
            created++;

            // İçerikleri ekle
            let rowNo = 0;
            for (const ing of r.ingredients) {
                try {
                    let material = null;
                    // 1) Kod ile eşleştir
                    if (ing.materialKod) {
                        material = codeToMat.get(String(ing.materialKod).toUpperCase()) || null;
                    }
                    // 2) İsim ile eşleştir (normalize)
                    if (!material) {
                        const norm = normalizeName(ing.stokAdi);
                        material = nameToMat.get(norm) || null;
                        // 2a) Materials CSV ad eşleşmesi varsa DB’de en yakın adı bul
                        if (!material && csvNameToCode.size) {
                            if (csvNameToCode.has(norm)) {
                                // DB'de normalize adı eşleşen ilk materyali seç
                                const candidate = allMaterials.find(m => normalizeName(m.ad) === norm);
                                if (candidate) material = candidate;
                            }
                        }
                        // 3) Yakın eşleşme: contains
                        if (!material) {
                            const candidate = allMaterials.find(m => normalizeName(m.ad).includes(norm));
                            if (candidate) material = candidate;
                        }
                    }
                    if (!material) { console.log(`   ⚠️ Material bulunamadı/eşleşmedi: ${ing.stokAdi}`); continue; }

                    const std = standardizeBirim(ing.birim, parseFloat(ing.netMiktar) || 0);
                    const costUnitPrice = material.birimFiyat || 0;
                    const costTotal = (parseFloat(ing.gerMktr) || std.miktar) * costUnitPrice;
                    rowNo += 1;

                    await prisma.recipeIngredient.create({
                        data: {
                            recipeId: recipe.id,
                            materialId: material.id,
                            miktar: std.miktar,
                            birim: std.birim,
                            fire1: ing.fire1 || 0,
                            fire2: ing.fire2 || 0,
                            gerMiktar: ing.gerMktr || std.miktar,
                            sonFiyat: costUnitPrice,
                            maliyet: costTotal,
                            siraNo: rowNo
                        }
                    });
                    ingCreated++;
                } catch (ie) {
                    console.warn('   ⚠️ Ingredient eklenemedi:', ie.message);
                }
            }
        } catch (e) {
            console.warn('❌ Reçete oluşturulamadı:', r.ad, e.message);
        }
    }

    console.log(`\n✅ Oluşturulan reçete: ${created}, eklenen kalem: ${ingCreated}`);

    // 3) Toplam maliyetleri güncelle
    console.log('💰 Toplam maliyetler güncelleniyor...');
    const all = await prisma.recipe.findMany({ select: { id: true } });
    for (const rec of all) {
        const ings = await prisma.recipeIngredient.findMany({ where: { recipeId: rec.id }, select: { maliyet: true } });
        const total = ings.reduce((s, i) => s + (i.maliyet || 0), 0);
        await prisma.recipe.update({ where: { id: rec.id }, data: { toplamMaliyet: total, birimMaliyet: total, guncellemeTarihi: new Date() } });
    }

    console.log('🎉 Reçete CSV seed (V2) tamamlandı.');
}

main()
    .catch((e) => { console.error('❌ Hata:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); }); 