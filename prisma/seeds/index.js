// ===================================================================
// 🌱 ÖMER GÜLLÜ SİSTEMİ - ANA SEED DOSYASI
// Tüm CSV verilerini sıralı olarak veritabanına yükler
// ===================================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Seed dosyalarını import et
const { seedPersonelBilgileri } = require('./seed-personel-bilgileri');
const { seedOdemeYontemleri } = require('./seed-odeme-yontemleri');
const { seedSubeOperasyonBirimleri } = require('./seed-sube-operasyon');
const { seedHammadeYariMamuller } = require('./seed-hammadde-yari-mamuller');
const { seedGuncelUrunFiyatlari } = require('./seed-urun-ve-fiyatlar');
const { seedReceteler } = require('./seed-receteler');
const { seedSiparisDropdownListeleri } = require('./seed-teslimat-turu');
const { seedCariMusteriler } = require('./seed-cari-musteriler');
// const { seedStokBaslangic } = require('./seed-stok-baslangic');

async function main() {
    console.log('🚀 Ömer Güllü Sistemi - Toplu Seed İşlemi Başlatılıyor...\n');

    try {
        // 1. Temel veriler
        console.log('1️⃣ Temel veriler yükleniyor...');
        await seedPersonelBilgileri();
        await seedOdemeYontemleri();
        await seedSubeOperasyonBirimleri();

        // 2. Ürün ve malzeme verileri
        console.log('\n2️⃣ Ürün ve malzeme verileri yükleniyor...');
        await seedHammadeYariMamuller();
        await seedGuncelUrunFiyatlari();
        await seedReceteler();

        // 3. Sipariş sistemi verileri
        console.log('\n3️⃣ Sipariş sistemi verileri yükleniyor...');
        await seedSiparisDropdownListeleri();

        // 4. Müşteri verileri
        console.log('\n4️⃣ Müşteri verileri yükleniyor...');
        await seedCariMusteriler();

        // 5. Stok verileri - GEÇİCİ OLARAK DEVRE DIŞI
        // console.log('\n5️⃣ Stok verileri yükleniyor...');
        // await seedStokBaslangic();

        console.log('\n🎉 TÜM SEED İŞLEMLERİ BAŞARIYLA TAMAMLANDI!');
        console.log('📊 Sistem kullanıma hazır.');
        console.log('\n⚠️  NOT: Stok verileri manuel olarak yüklenmelidir!');

    } catch (error) {
        console.error('\n❌ Seed işlemi sırasında hata oluştu:', error);
        throw error;
    }
}

// Ana fonksiyonu çalıştır
main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

module.exports = { main }; 