// Basit başlangıç birim fiyatları girer (düzenlenebilir)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Kod -> fiyat (₺/KG)
const PRICE_MAP = {
    HM012: 300, // SADEYAĞ
    HM006: 800, // İÇ FISTIK
    HM008: 15,  // KARAKOYUNLU UN
    HM017: 25,  // TOZ ŞEKER
    HM004: 12,  // IRMIK NO:0
    HM005: 13,  // IRMIK NO:3
    HM015: 18,  // SÜT (lt≈kg kabul)
    HM014: 1,   // SU
    HM011: 20,  // NIŞASTA
    HM018: 5,   // TUZ
    HM001: 120, // ANTEP PEYNİRİ
    HM002: 200, // CEVİZ
    HM003: 30,  // GLİKOZ
    HM007: 40,  // KADAYIF
    HM009: 8,   // LİMON kg karşılığı
    HM010: 10,  // MAYDANOZ tahmini
    HM016: 16,  // TEKSİN UN
    HM019: 30,  // YOĞURT
    HM020: 3    // YUMURTA (adet→kg kaba karşılığı)
};

async function main() {
    console.log('💰 Hammadde birim fiyatları güncelleniyor...');
    let updated = 0;
    for (const [kod, fiyat] of Object.entries(PRICE_MAP)) {
        try {
            const m = await prisma.material.findUnique({ where: { kod } });
            if (!m) continue;
            await prisma.material.update({ where: { id: m.id }, data: { birimFiyat: fiyat } });
            console.log(`   ✅ ${kod} -> ${fiyat} ₺/KG`);
            updated++;
        } catch (e) {
            console.warn(`   ⚠️  ${kod} fiyat güncellenemedi: ${e.message}`);
        }
    }
    console.log(`✔️ Güncellenen kayıt: ${updated}`);
}

if (require.main === module) {
    main().finally(() => prisma.$disconnect());
}

module.exports = { seedHammaddeFiyatGirisi: main };



