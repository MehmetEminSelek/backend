const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Manuel eşleştirme tablosu
const manualMappings = {
    "BULBUL YUVASI (UR)": ["Bülbül Yuvası", "Cevizli Bülbül Yuvası"],
    "BURMA KADAYIF (UR)": ["Burma Kadayıf"],
    "CEVIZLI BAKLAVA (UR)": ["Cevizli Yaş Baklava"],
    "EZME (UR)": ["Fıstık Ezmesi", "Kare Fıstık Ezmesi", "Sargılı Fıstık Ezmesi"],
    "FISTIKLI YAS BAKLAVA (UR)": ["Yaş Baklava"],
    "HAVUC DILIMI (UR)": ["Havuç Dilimi", "Kaymaklı Havuç Dilimi"],
    "SOBIYET (UR)": ["Şöbiyet", "Cevizli Şöbiyet", "Özel Şöbiyet", "Yaprak Şöbiyet"],
    "OZEL KARE BAKLAVA (UR)": ["Özel Kare", "Cevizli Özel Kare"]
};

async function linkRecipesToProducts() {
    console.log('🔗 Reçeteler ve ürünler ilişkilendiriliyor...\n');

    try {
        // Önce mevcut durumu kontrol et
        const totalRecipes = await prisma.recipe.count();
        const linkedRecipes = await prisma.recipe.count({ where: { urunId: { not: null } } });

        console.log(`📊 Mevcut durum:`);
        console.log(`   - Toplam reçete: ${totalRecipes}`);
        console.log(`   - Ürüne bağlı: ${linkedRecipes}`);
        console.log(`   - Bağlanacak: ${totalRecipes - linkedRecipes}\n`);

        // Ürünleri ve reçeteleri çek
        const urunler = await prisma.urun.findMany({
            select: { id: true, ad: true, kod: true }
        });

        const receteler = await prisma.recipe.findMany({
            where: { urunId: null }, // Sadece bağlı olmayanları al
            select: { id: true, ad: true, kod: true }
        });

        console.log(`🔍 ${urunler.length} ürün ve ${receteler.length} bağlanmamış reçete bulundu.\n`);

        let basarili = 0;
        let eslesmeBulunamadi = 0;

        // Her reçete için ürün eşleştirmesi yap
        for (const recete of receteler) {
            let eslesenUrunler = [];

            // 1. Manuel eşleştirme kontrolü
            if (manualMappings[recete.ad]) {
                const urunAdlari = manualMappings[recete.ad];
                for (const urunAdi of urunAdlari) {
                    const urun = urunler.find(u => u.ad === urunAdi);
                    if (urun) {
                        eslesenUrunler.push(urun);
                    }
                }
            }

            // 2. Otomatik eşleştirme (manuel bulunamadıysa)
            if (eslesenUrunler.length === 0) {
                // İsim benzerliği
                const receteAdiClean = recete.ad.replace(' (UR)', '').replace(' (YM)', '').toLowerCase();

                // Tam eşleşme
                let eslesenUrun = urunler.find(u =>
                    u.ad.toLowerCase() === receteAdiClean
                );

                // Kısmi eşleşme
                if (!eslesenUrun) {
                    eslesenUrun = urunler.find(u =>
                        u.ad.toLowerCase().includes(receteAdiClean) ||
                        receteAdiClean.includes(u.ad.toLowerCase())
                    );
                }

                if (eslesenUrun) {
                    eslesenUrunler.push(eslesenUrun);
                }
            }

            // Eşleşme bulunduysa ilkini kullan (ileride kullanıcı seçebilir)
            if (eslesenUrunler.length > 0) {
                const secilenUrun = eslesenUrunler[0];

                // Güncelle
                await prisma.recipe.update({
                    where: { id: recete.id },
                    data: { urunId: secilenUrun.id }
                });

                console.log(`✅ "${recete.ad}" → "${secilenUrun.ad}"`);
                if (eslesenUrunler.length > 1) {
                    console.log(`   ℹ️  Diğer seçenekler: ${eslesenUrunler.slice(1).map(u => u.ad).join(', ')}`);
                }
                basarili++;
            } else {
                console.log(`❌ "${recete.ad}" için ürün bulunamadı`);
                eslesmeBulunamadi++;
            }
        }

        console.log(`\n📊 İlişkilendirme Özeti:`);
        console.log(`   ✅ Başarılı: ${basarili}`);
        console.log(`   ❌ Eşleşme bulunamadı: ${eslesmeBulunamadi}`);

        // Son durumu göster
        const finalLinkedCount = await prisma.recipe.count({ where: { urunId: { not: null } } });
        console.log(`\n🎯 Toplam bağlı reçete sayısı: ${finalLinkedCount}/${totalRecipes}`);

        // Yarı mamul reçeteleri hakkında bilgi
        const yariMamulRecipes = await prisma.recipe.count({ where: { ad: { contains: '(YM)' } } });
        if (yariMamulRecipes > 0) {
            console.log(`\nℹ️  Not: ${yariMamulRecipes} adet yarı mamül reçetesi (YM) ürünlerle ilişkilendirilmedi.`);
        }

    } catch (error) {
        console.error('❌ Hata:', error);
    } finally {
        await prisma.$disconnect();
    }
}

linkRecipesToProducts(); 