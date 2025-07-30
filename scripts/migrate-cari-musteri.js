const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateCariMusteri() {
    console.log('🔄 CariMusteri verilerini Cari tablosuna aktarma başlıyor...');

    try {
        // Tüm CariMusteri kayıtlarını al
        const cariMusteriler = await prisma.cariMusteri.findMany({
            orderBy: { id: 'asc' }
        });

        console.log(`📊 Toplam ${cariMusteriler.length} kayıt bulundu.`);

        let basarili = 0;
        let hata = 0;
        let mevcut = 0;

        for (const cm of cariMusteriler) {
            try {
                // Aynı müşteri koduna sahip kayıt var mı kontrol et
                const existing = await prisma.cari.findUnique({
                    where: { musteriKodu: cm.musteriKodu }
                });

                if (existing) {
                    mevcut++;
                    console.log(`⏭️  Mevcut: ${cm.musteriKodu} - ${cm.cariAdi}`);
                    continue;
                }

                // Yeni Cari kaydı oluştur
                await prisma.cari.create({
                    data: {
                        ad: cm.cariAdi,
                        musteriKodu: cm.musteriKodu,
                        telefon: cm.telefon,
                        subeAdi: cm.subeAdi,
                        irtibatAdi: cm.irtibatAdi,
                        cariGrubu: cm.cariGrubu,
                        fiyatGrubu: cm.fiyatGrubu,
                        tipi: 'MUSTERI',
                        aktif: cm.aktif
                    }
                });

                basarili++;

                if (basarili % 100 === 0) {
                    console.log(`✅ ${basarili} kayıt aktarıldı...`);
                }

            } catch (error) {
                hata++;
                console.error(`❌ Hata (${cm.musteriKodu}):`, error.message);
            }
        }

        console.log('\n📊 Migration Özeti:');
        console.log(`✅ Başarılı: ${basarili}`);
        console.log(`⏭️  Mevcut: ${mevcut}`);
        console.log(`❌ Hatalı: ${hata}`);
        console.log(`📊 Toplam: ${cariMusteriler.length}`);

    } catch (error) {
        console.error('❌ Migration hatası:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Script'i çalıştır
migrateCariMusteri(); 