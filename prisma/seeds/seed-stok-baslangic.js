const { PrismaClient } = require('@prisma/client');

async function seedStokBaslangic() {
    const prisma = new PrismaClient();

    console.log('📦 Başlangıç stok kayıtları oluşturuluyor...');

    try {
        // Tüm malzemeleri al
        const malzemeler = await prisma.material.findMany();
        console.log(`📊 ${malzemeler.length} malzeme bulundu`);

        // Ana Depo'yu bul
        const anaDepo = await prisma.sube.findFirst({
            where: { kod: 'OP001' }
        });

        if (!anaDepo) {
            console.log('❌ Ana Depo (OP001) bulunamadı!');
            return;
        }

        console.log(`🏢 Stoklar ${anaDepo.ad} (${anaDepo.kod}) lokasyonuna eklenecek`);

        let eklenenStok = 0;
        let atlanantok = 0;

        // Her malzeme için stok oluştur
        for (const malzeme of malzemeler) {
            // Mevcut stok kontrolü
            const mevcutStok = await prisma.stok.findFirst({
                where: {
                    malzemeId: malzeme.id,
                    subeId: anaDepo.id
                }
            });

            if (mevcutStok) {
                atlanantok++;
                continue;
            }

            // Başlangıç değerleri
            let miktar = 100;
            let minimumStok = 20;
            let maximumStok = 500;

            if (malzeme.tip === 'HAMMADDE') {
                miktar = Math.floor(Math.random() * 100) + 100; // 100-200
                minimumStok = 50;
                maximumStok = 1000;
            } else if (malzeme.tip === 'YARI_MAMUL') {
                miktar = Math.floor(Math.random() * 50) + 50; // 50-100
                minimumStok = 20;
                maximumStok = 300;
            }

            // Stok oluştur
            const yeniStok = await prisma.stok.create({
                data: {
                    malzemeId: malzeme.id,
                    subeId: anaDepo.id,
                    miktar: miktar,
                    birim: malzeme.birim || 'KG',
                    minimumStok: minimumStok,
                    maximumStok: maximumStok,
                    aktif: true
                }
            });

            // Stok hareketi
            await prisma.stokHareket.create({
                data: {
                    stokId: yeniStok.id,
                    malzemeId: malzeme.id,
                    subeId: anaDepo.id,
                    hareketTipi: 'GIRIS',
                    miktar: miktar,
                    birim: malzeme.birim || 'KG',
                    aciklama: 'Başlangıç stoğu',
                    referansTip: 'MANUEL',
                    createdBy: 'SYSTEM'
                }
            });

            console.log(`✅ ${malzeme.ad} - ${miktar} ${malzeme.birim || 'KG'}`);
            eklenenStok++;
        }

        console.log('\n📊 ÖZET:');
        console.log(`✅ Eklenen stok: ${eklenenStok}`);
        console.log(`⏭️  Atlanan (mevcut): ${atlanantok}`);

    } catch (error) {
        console.error('❌ Hata:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

module.exports = { seedStokBaslangic };

if (require.main === module) {
    seedStokBaslangic()
        .catch(console.error)
        .finally(() => process.exit());
} 