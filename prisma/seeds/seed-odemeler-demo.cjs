const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('💳 Demo ödemeler seed başlıyor...');

    // Son 20 siparişi çek
    const siparisler = await prisma.siparis.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, cariId: true, toplamTutar: true, durum: true, odemeDurumu: true, createdAt: true }
    });
    if (siparisler.length === 0) {
        console.log('Sipariş bulunamadı. Önce sipariş seedini çalıştırın.');
        return;
    }

    // İlk 6 sipariş: tamamen ödenmiş
    const fullPaid = siparisler.slice(0, 6);
    // Sonraki 5: kısmi ödenmiş (50%)
    const partialPaid = siparisler.slice(6, 11);
    // Kalanlar: bekliyor (ödeme yok)

    const now = new Date();

    await prisma.$transaction(async (tx) => {
        for (const s of fullPaid) {
            await tx.cariOdeme.create({
                data: {
                    cariMusteriId: s.cariId,
                    tutar: Number(s.toplamTutar) || 0,
                    odemeYontemi: 'NAKIT',
                    aciklama: 'Demo tam ödeme',
                    siparisId: s.id,
                    odemeTarihi: now,
                    durum: 'ODENDI'
                }
            });
            await tx.siparis.update({ where: { id: s.id }, data: { odemeDurumu: 'tamamlandi' } });
        }

        for (const s of partialPaid) {
            const tutar = Math.round(((Number(s.toplamTutar) || 0) * 0.5) * 100) / 100;
            await tx.cariOdeme.create({
                data: {
                    cariMusteriId: s.cariId,
                    tutar,
                    odemeYontemi: 'KREDI_KARTI',
                    aciklama: 'Demo kısmi ödeme',
                    siparisId: s.id,
                    odemeTarihi: now,
                    durum: 'ODENDI'
                }
            });
            await tx.siparis.update({ where: { id: s.id }, data: { odemeDurumu: 'kismi' } });
        }
    });

    console.log(`✅ Ödemeler eklendi: tam=${fullPaid.length}, kısmi=${partialPaid.length}`);
}

if (require.main === module) {
    main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
}

module.exports = { seedOdemelerDemo: main };


