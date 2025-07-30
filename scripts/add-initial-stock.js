const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addInitialStock() {
    console.log('📦 Malzeme stokları güncelleniyor...\n');

    try {
        // Tüm malzemeleri al
        const malzemeler = await prisma.material.findMany({
            orderBy: { kod: 'asc' }
        });

        console.log(`📊 ${malzemeler.length} malzeme stok bilgisi güncellenecek\n`);

        let guncellenen = 0;
        let zatenVar = 0;

        for (const malzeme of malzemeler) {
            // Eğer zaten stok varsa atla
            if (malzeme.mevcutStok > 0) {
                zatenVar++;
                continue;
            }

            // Stok miktarları
            let miktar = 100;
            let minStok = 20;
            let maxStok = 500;

            if (malzeme.tipi === 'HAMMADDE') {
                miktar = 150;
                minStok = 50;
                maxStok = 1000;
            } else if (malzeme.tipi === 'YARI_MAMUL') {
                miktar = 75;
                minStok = 25;
                maxStok = 300;
            }

            // Material'ı güncelle
            await prisma.material.update({
                where: { id: malzeme.id },
                data: {
                    mevcutStok: miktar,
                    minStokSeviye: minStok,
                    maxStokSeviye: maxStok
                }
            });

            // Stok hareketi oluştur (Ana Depo için)
            const anaDepo = await prisma.sube.findFirst({
                where: { kod: 'OP001' }
            });

            if (anaDepo) {
                await prisma.stokHareket.create({
                    data: {
                        materialId: malzeme.id,
                        tip: 'GIRIS',
                        miktar: miktar,
                        birim: malzeme.birim || 'KG',
                        aciklama: 'Başlangıç stoğu',
                        oncekiStok: 0,
                        sonrakiStok: miktar,
                        createdBy: 1 // System user
                    }
                });
            }

            console.log(`✅ ${malzeme.kod} - ${malzeme.ad}: ${miktar} ${malzeme.birim || 'KG'}`);
            guncellenen++;
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ Güncellenen: ${guncellenen}`);
        console.log(`ℹ️  Zaten stoklu: ${zatenVar}`);
        console.log(`📦 Toplam: ${malzemeler.length}`);

        // Özet bilgi
        const hammaddeler = await prisma.material.findMany({
            where: { tipi: 'HAMMADDE', mevcutStok: { gt: 0 } }
        });

        const yariMamuller = await prisma.material.findMany({
            where: { tipi: 'YARI_MAMUL', mevcutStok: { gt: 0 } }
        });

        console.log('\n📊 STOK ÖZETİ:');
        console.log(`🥚 Hammadde: ${hammaddeler.length} adet`);
        console.log(`🔧 Yarı Mamül: ${yariMamuller.length} adet`);

    } catch (error) {
        console.error('❌ Hata:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Çalıştır
addInitialStock(); 