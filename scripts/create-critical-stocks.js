const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createCriticalStocks() {
    console.log('🚨 Kritik stok durumları oluşturuluyor...\n');

    try {
        // Bazı malzemeleri kritik seviyeye düşür
        const malzemeler = await prisma.material.findMany({
            take: 5,
            orderBy: { kod: 'asc' }
        });

        for (let i = 0; i < malzemeler.length; i++) {
            const malzeme = malzemeler[i];
            let yeniStok = 0;
            let kritikSeviye = 50;

            if (i === 0) {
                // İlk malzeme negatif stok
                yeniStok = -10;
            } else if (i === 1) {
                // İkinci malzeme 0 stok
                yeniStok = 0;
            } else if (i < 4) {
                // 3. ve 4. malzemeler kritik seviyede
                yeniStok = 5;
                kritikSeviye = 20;
            }

            await prisma.material.update({
                where: { id: malzeme.id },
                data: {
                    mevcutStok: yeniStok,
                    kritikSeviye: kritikSeviye,
                    minStokSeviye: kritikSeviye
                }
            });

            console.log(`✅ ${malzeme.kod} - ${malzeme.ad}: ${yeniStok} ${malzeme.birim} (Kritik: ${kritikSeviye})`);
        }

        // Tüm kritik stokları listele
        const kritikStoklar = await prisma.material.findMany({
            where: {
                OR: [
                    { mevcutStok: { lte: 0 } },
                    { mevcutStok: { lte: prisma.material.fields.kritikSeviye } }
                ]
            }
        });

        console.log(`\n🚨 Toplam ${kritikStoklar.length} kritik stok oluşturuldu`);

    } catch (error) {
        console.error('❌ Hata:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Çalıştır
createCriticalStocks(); 