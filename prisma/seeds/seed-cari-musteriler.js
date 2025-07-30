const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const prisma = new PrismaClient();

async function seedCariMusteriler() {
    console.log('🌱 Cari Müşteriler seed başlatılıyor...');

    const csvPath = path.join(__dirname, '../../veriler/Cari Müşteri Kodları.csv');

    if (!fs.existsSync(csvPath)) {
        console.error('❌ CSV dosyası bulunamadı:', csvPath);
        return;
    }

    const cariData = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(csvPath)
            .pipe(csv())
            .on('data', (row) => {
                // CSV başlıklarını temizle ve normalize et
                const cleanRow = {};
                Object.keys(row).forEach(key => {
                    const cleanKey = key.trim().replace(/\uFEFF/g, ''); // BOM karakterini temizle
                    cleanRow[cleanKey] = row[key];
                });

                const cariAdi = cleanRow['CARİ ADI'] || cleanRow['4CARİ ADI'];
                const musteriKodu = cleanRow['MÜŞTERİ KODU'];
                const subeAdi = cleanRow['ŞUBE ADI'];
                const tel = cleanRow['TEL'];
                const irtibatAdi = cleanRow['İRTİBAT ADI'];
                const cariGrubu = cleanRow['CARİ GRUBU'];
                const fiyatGrubu = cleanRow['FİYAT GRUBU'];

                if (cariAdi && musteriKodu) {
                    cariData.push({
                        cariAdi: cariAdi.trim(),
                        musteriKodu: musteriKodu.trim(),
                        subeAdi: subeAdi ? subeAdi.trim() : null,
                        telefon: tel ? tel.trim() : null,
                        irtibatAdi: irtibatAdi ? irtibatAdi.trim() : null,
                        cariGrubu: cariGrubu ? cariGrubu.trim() : null,
                        fiyatGrubu: fiyatGrubu ? fiyatGrubu.trim() : null
                    });
                }
            })
            .on('end', async () => {
                try {
                    console.log(`📊 ${cariData.length} cari müşteri verisi işleniyor...`);

                    // Toplu ekleme işlemi
                    let addedCount = 0;
                    let skippedCount = 0;

                    for (const cari of cariData) {
                        try {
                            // Müşteri koduna göre kontrol et
                            const existing = await prisma.cariMusteri.findUnique({
                                where: { musteriKodu: cari.musteriKodu }
                            });

                            if (!existing) {
                                await prisma.cariMusteri.create({
                                    data: {
                                        cariAdi: cari.cariAdi,
                                        musteriKodu: cari.musteriKodu,
                                        subeAdi: cari.subeAdi,
                                        telefon: cari.telefon,
                                        irtibatAdi: cari.irtibatAdi,
                                        cariGrubu: cari.cariGrubu,
                                        fiyatGrubu: cari.fiyatGrubu,
                                        aktif: true
                                    }
                                });
                                addedCount++;
                            } else {
                                skippedCount++;
                            }
                        } catch (error) {
                            console.error(`❌ Cari müşteri eklenirken hata (${cari.musteriKodu}):`, error.message);
                        }
                    }

                    console.log(`✅ Cari Müşteriler seed tamamlandı!`);
                    console.log(`   📈 Eklenen: ${addedCount}`);
                    console.log(`   ⏭️  Atlanan: ${skippedCount}`);

                    resolve();
                } catch (error) {
                    console.error('❌ Cari müşteriler seed hatası:', error);
                    reject(error);
                }
            })
            .on('error', (error) => {
                console.error('❌ CSV okuma hatası:', error);
                reject(error);
            });
    });
}

// Eğer doğrudan çalıştırılıyorsa seed'i başlat
if (require.main === module) {
    seedCariMusteriler()
        .catch((e) => {
            console.error(e);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}

module.exports = { seedCariMusteriler }; 