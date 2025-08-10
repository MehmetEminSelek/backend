// ===================================================================
// 🧰 STOK BAŞLANGIÇ BETİĞİ (5 TON)
// Hammadde ve Yarı Mamul materyaller için varsayılan stok girişi yapar
// ===================================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function calcFiveTonsByUnit(unit) {
    const u = String(unit || '').toUpperCase();
    if (u === 'KG' || u === 'LITRE') return 5000;           // 5 ton
    if (u === 'GRAM' || u === 'ML') return 5_000_000;       // 5.000.000 gram/ml
    // ADET, PAKET, TEPSI, KUTU vb. için makul bir sabit
    return 5000;
}

async function main() {
    console.log('🚚 5 Ton Stok Yükleme başlıyor (HAMMADDE & YARI_MAMUL)...');

    const materials = await prisma.material.findMany({
        where: { tipi: { in: ['HAMMADDE', 'YARI_MAMUL'] } },
        select: { id: true, ad: true, kod: true, birim: true, mevcutStok: true, tipi: true }
    });

    if (!materials.length) {
        console.log('ℹ️  Güncellenecek hammadde/yari mamul bulunamadı. Önce materyal seedini çalıştırın.');
        return;
    }

    let updated = 0;
    for (const m of materials) {
        const hedef = calcFiveTonsByUnit(m.birim);
        // Yalnızca stok 0 veya çok düşükse zorla yaz; isterseniz her durumda güncellemek için koşulu kaldırın
        try {
            await prisma.material.update({
                where: { id: m.id },
                data: { mevcutStok: hedef, updatedAt: new Date() }
            });
            updated += 1;
            if (updated % 100 === 0) console.log(`   ✅ ${updated} materyal güncellendi...`);
        } catch (e) {
            console.warn(`   ⚠️  Güncellenemedi: ${m.kod} - ${m.ad} (${m.birim}) -> ${e.message}`);
        }
    }

    console.log(`\n🎉 Tamamlandı. Güncellenen kayıt: ${updated}/${materials.length}`);
}

main()
    .catch((e) => { console.error('❌ Hata:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); }); 