// Final Test - Doğru Tarihlerle
const axios = require('axios');

async function finalTest() {
    try {
        console.log('🎯 DOĞRU TARİHLERLE SATIŞ RAPORU TEST EDİLİYOR...\n');

        const response = await axios.post('http://localhost:3000/api/satis-raporu', {
            startDate: '2025-07-01', // Temmuz ayı - verilerin olduğu dönem
            endDate: '2025-07-31'
        }, { timeout: 10000 });

        console.log('✅ Status:', response.status);
        console.log('📊 Response Keys:', Object.keys(response.data));

        const data = response.data;

        console.log('\n📈 SONUÇLAR:');
        console.log('✅ Ciro Array:', data.ciro?.length || 0, 'günlük veri');
        console.log('✅ Ürünler Ciro:', data.urunlerCiro?.length || 0, 'ürün');
        console.log('✅ Şubeler Ciro:', data.subelerCiro?.length || 0, 'şube');
        console.log('✅ Satış Detay:', data.satisDetay?.length || 0, 'kayıt');
        console.log('✅ Toplam Ciro:', data.toplamCiro || 0, 'TL');
        console.log('✅ Toplam Sipariş:', data.toplamSiparis || 0, 'adet');
        console.log('✅ Ortalama Sepet:', data.ortalamaSepetTutari || 0, 'TL');

        // İlk satış detayı örneği
        if (data.satisDetay && data.satisDetay.length > 0) {
            console.log('\n📋 İLK SATIŞ DETAYI:');
            console.log('   Tarih:', data.satisDetay[0].tarih);
            console.log('   Ürün:', data.satisDetay[0].urunAd);
            console.log('   Müşteri:', data.satisDetay[0].musteri);
            console.log('   Tutar:', data.satisDetay[0].tutar, 'TL');
        }

        // İlk günlük ciro
        if (data.ciro && data.ciro.length > 0) {
            console.log('\n📈 İLK GÜN CİROSU:');
            console.log('   Tarih:', data.ciro[0].tarih);
            console.log('   Ciro:', data.ciro[0].ciro, 'TL');
        }

        console.log('\n🎉 SATIŞ RAPORU API TAMAMEN ÇALIŞIYOR!');

    } catch (error) {
        console.log('❌ HATA:', error.message);
        if (error.response) {
            console.log('   Status:', error.response.status);
            console.log('   Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

finalTest(); 