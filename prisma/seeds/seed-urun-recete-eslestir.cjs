// Ürünleri reçetelerle eşleştirir: aynı adı taşıyan reçete varsa urunId set eder
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🔗 Ürün-Recepte eşleştirme başlıyor...');
    const urunler = await prisma.urun.findMany({ select: { id: true, ad: true } });
    const receteler = await prisma.recipe.findMany({ select: { id: true, ad: true, urunId: true } });

    // Ad -> reçete map (birebir ad eşleşmesi)
    const nameToRecipe = new Map();
    const normalize = s => (s || '').toUpperCase()
        .replace(/İ/g, 'I').replace(/ı/g, 'I').replace(/Ş/g, 'S').replace(/ş/g, 'S')
        .replace(/Ğ/g, 'G').replace(/ğ/g, 'G').replace(/Ü/g, 'U').replace(/ü/g, 'U')
        .replace(/Ö/g, 'O').replace(/ö/g, 'O').replace(/Ç/g, 'C').replace(/ç/g, 'C')
        .replace(/\s+/g, ' ').trim();
    receteler.forEach(r => { nameToRecipe.set(normalize(r.ad), r); });

    let linked = 0;
    for (const u of urunler) {
        const un = normalize(u.ad)
            .replace('CEVIZLI ', '')
            .replace('FISTIKLI ', '')
            .replace('ESKI USUL ', '')
            .replace('OZEL ', '')
            .replace(' YAS', '')
            .replace(' BULBUL', ' BULBUL')
            .replace(' BOREGI', ' (UR)')
            ;
        // ürün türlere göre basit mapping
        const candidates = [
            un,
            un + ' (UR)',
            un + ' (YM)'
        ];
        let r = null;
        for (const c of candidates) {
            if (nameToRecipe.has(c)) { r = nameToRecipe.get(c); break; }
        }
        if (r && !r.urunId) {
            await prisma.recipe.update({ where: { id: r.id }, data: { urunId: u.id } });
            console.log(`   ✅ ${u.ad} -> recipe ${r.id}`);
            linked++;
        }
    }
    console.log(`✔️ Eşleştirilen reçete sayısı: ${linked}`);
}

if (require.main === module) {
    main().finally(() => prisma.$disconnect());
}

module.exports = { seedUrunReceteEslestir: main };


