const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Rol eşleme fonksiyonu
function mapPersonelRol(csvRol) {
    const rolMap = {
        'GENEL MÜDÜR': 'GENEL_MUDUR',
        'ŞUBE MÜDÜRÜ': 'SUBE_MUDURU',
        'ÜRETİM MÜDÜRÜ': 'URETIM_MUDURU',
        'SEVKİYAT MÜDÜRÜ': 'SEVKIYAT_MUDURU',
        'CEP DEPO MÜDÜRÜ': 'CEP_DEPO_MUDURU',
        'ŞUBE PERSONELİ': 'SUBE_PERSONELI',
        'ÜRETİM PERSONEL': 'URETIM_PERSONEL',
        'SEVKİYAT PERSONELİ': 'SEVKIYAT_PERSONELI',
        'ŞOFÖR': 'SOFOR',
        'YÖNETİCİ': 'GENEL_MUDUR',
        '': 'PERSONEL'
    };

    return rolMap[csvRol] || 'PERSONEL';
}

// SGK durumu eşleme
function mapSgkDurumu(csvSgk) {
    return csvSgk === 'VAR' ? 'VAR' : 'YOK';
}

// ERP durum eşleme
function mapErpDurum(csvErp) {
    return csvErp === 'AKTİF' ? 'AKTIF' : 'PASIF';
}

// Tarih parse etme
function parseTarih(csvTarih) {
    if (!csvTarih || csvTarih.trim() === '') return null;

    try {
        // CSV'de "1/13/2024" formatında tarihler var
        const [ay, gun, yil] = csvTarih.split('/');

        // Geçersiz tarih kontrolü
        if (parseInt(yil) < 1900 || parseInt(yil) > 2030) {
            return null;
        }

        return new Date(parseInt(yil), parseInt(ay) - 1, parseInt(gun));
    } catch (error) {
        return null;
    }
}

// Ücret parse etme
function parseUcret(csvUcret) {
    if (!csvUcret || csvUcret.trim() === '') return 0;

    try {
        // "1.000,00" formatından "1000.00" formatına çevir
        const cleanedUcret = csvUcret.replace(/\./g, '').replace(',', '.');
        return parseFloat(cleanedUcret) || 0;
    } catch (error) {
        return 0;
    }
}

// Username oluşturma
function generateUsername(adSoyad) {
    return adSoyad.toLowerCase()
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ü/g, 'u')
        .replace(/ç/g, 'c')
        .replace(/\s+/g, '.')
        .replace(/[^a-z0-9.]/g, '');
}

// Personel ID oluşturma
function generatePersonelId(index) {
    return `P${String(index).padStart(3, '0')}`;
}

async function seedPersonelBilgileri() {
    console.log('🌱 Personel Bilgileri seed başlatılıyor...');

    const csvPath = path.join(__dirname, '../../veriler/Personel Bilgileri.csv');

    if (!fs.existsSync(csvPath)) {
        console.error('❌ CSV dosyası bulunamadı:', csvPath);
        return { eklenen: 0, atlanan: 0 };
    }

    // Şube eşleştirmesi için mevcut şubeleri al
    const mevcutSubeler = await prisma.sube.findMany();
    const subeMap = {};
    mevcutSubeler.forEach(sube => {
        subeMap[sube.ad.toLowerCase()] = sube.id;
    });

    const personelData = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(csvPath)
            .pipe(csv())
            .on('data', (row) => {
                // CSV başlıklarını temizle
                const cleanRow = {};
                Object.keys(row).forEach(key => {
                    const cleanKey = key.trim().replace(/\uFEFF/g, '');
                    cleanRow[cleanKey] = row[key];
                });

                // #REF! hatalarını ve boş satırları filtrele
                if (cleanRow['ADI SOYADI'] &&
                    cleanRow['ADI SOYADI'].trim() !== '' &&
                    !cleanRow['ADI SOYADI'].includes('#REF!')) {

                    const adSoyad = cleanRow['ADI SOYADI'].trim();
                    const [ad, ...soyadParts] = adSoyad.split(' ');
                    const soyad = soyadParts.join(' ');

                    // Şube eşleştir
                    const subeAdi = cleanRow['ŞUBE']?.trim().toLowerCase();
                    let subeId = null;

                    if (subeAdi) {
                        // Şube adını normalize et
                        const normalizedSube = subeAdi
                            .replace('hava-1', 'hava 1')
                            .replace('hava-3', 'hava 3');

                        subeId = subeMap[normalizedSube] || subeMap[subeAdi];
                    }

                    personelData.push({
                        adSoyad,
                        ad,
                        soyad: soyad || null,
                        sgkDurumu: mapSgkDurumu(cleanRow['SGK DURUMU']),
                        girisYili: parseTarih(cleanRow['GİRİŞ YILI']),
                        subeAdi: cleanRow['ŞUBE']?.trim() || null,
                        subeId,
                        erpDurum: mapErpDurum(cleanRow['ERP PASİF AKTİF']),
                        rol: mapPersonelRol(cleanRow['ROL']?.trim()),
                        gunlukUcret: parseUcret(cleanRow['GÜNLÜK ÜCRET'])
                    });
                }
            })
            .on('end', async () => {
                try {
                    console.log(`📄 CSV'den ${personelData.length} personel kaydı okundu`);

                    let eklenen = 0;
                    let atlanan = 0;
                    let guncellenenen = 0;

                    for (let i = 0; i < personelData.length; i++) {
                        const personel = personelData[i];

                        try {
                            const personelId = generatePersonelId(i + 1);
                            const username = generateUsername(personel.adSoyad);

                            // Şifre: ilk 3 karakter + 123
                            const defaultPassword = personel.ad.substring(0, 3).toLowerCase() + '123';
                            const hashedPassword = await bcrypt.hash(defaultPassword, 10);

                            // Mevcut kaydı kontrol et
                            const existing = await prisma.user.findFirst({
                                where: {
                                    OR: [
                                        { personelId },
                                        { ad: personel.ad, soyad: personel.soyad }
                                    ]
                                }
                            });

                            if (existing) {
                                // Güncelleme
                                await prisma.user.update({
                                    where: { id: existing.id },
                                    data: {
                                        username: existing.username || username,
                                        ad: personel.ad,
                                        soyad: personel.soyad,
                                        sgkDurumu: personel.sgkDurumu,
                                        girisYili: personel.girisYili,
                                        subeId: personel.subeId,
                                        erpDurum: personel.erpDurum,
                                        rol: personel.rol,
                                        gunlukUcret: personel.gunlukUcret,
                                        aktif: personel.erpDurum === 'AKTIF'
                                    }
                                });
                                guncellenenen++;
                            } else {
                                // Yeni kayıt
                                await prisma.user.create({
                                    data: {
                                        personelId,
                                        username,
                                        password: hashedPassword,
                                        ad: personel.ad,
                                        soyad: personel.soyad,
                                        sgkDurumu: personel.sgkDurumu,
                                        girisYili: personel.girisYili,
                                        subeId: personel.subeId,
                                        erpDurum: personel.erpDurum,
                                        rol: personel.rol,
                                        gunlukUcret: personel.gunlukUcret,
                                        aktif: personel.erpDurum === 'AKTIF'
                                    }
                                });
                                eklenen++;
                            }

                        } catch (error) {
                            console.error(`❌ Personel eklenemedi (${personel.adSoyad}):`, error.message);
                            atlanan++;
                        }
                    }

                    console.log('\n✅ Personel Bilgileri seed tamamlandı!');
                    console.log(`   📈 Eklenen: ${eklenen}`);
                    console.log(`   🔄 Güncellenen: ${guncellenenen}`);
                    console.log(`   ⏭️  Atlanan: ${atlanan}`);

                    // Özet bilgiler
                    const toplamPersonel = await prisma.user.count();
                    const aktifPersonel = await prisma.user.count({ where: { aktif: true } });
                    const pasifPersonel = await prisma.user.count({ where: { aktif: false } });

                    console.log(`\n📊 Sistem Özeti:`);
                    console.log(`   👥 Toplam Personel: ${toplamPersonel}`);
                    console.log(`   ✅ Aktif: ${aktifPersonel}`);
                    console.log(`   ❌ Pasif: ${pasifPersonel}`);

                    resolve({ eklenen, guncellenenen, atlanan });

                } catch (error) {
                    console.error('❌ Seed işlemi sırasında hata:', error);
                    reject(error);
                }
            })
            .on('error', (error) => {
                console.error('❌ CSV okuma hatası:', error);
                reject(error);
            });
    });
}

// Direkt çalıştırma
if (require.main === module) {
    seedPersonelBilgileri()
        .catch(console.error)
        .finally(async () => {
            await prisma.$disconnect();
        });
}

module.exports = { seedPersonelBilgileri }; 