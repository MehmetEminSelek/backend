// Test Satış Raporu API
const axios = require('axios');

async function testSalesReport() {
    try {
        console.log('📊 Satış Raporu API test ediliyor...');

        const response = await axios.post('http://localhost:3000/api/satis-raporu', {
            startDate: '2025-01-01',
            endDate: '2025-01-31'
        }, { timeout: 10000 });

        console.log('✅ Status:', response.status);
        console.log('📊 Response Keys:', Object.keys(response.data));

        const data = response.data;

        console.log('\n📈 Veri Kontrolü:');
        console.log('- Ciro Array:', Array.isArray(data.ciro), data.ciro?.length || 0, 'item');
        console.log('- Ürünler Adet:', Array.isArray(data.urunlerAdet), data.urunlerAdet?.length || 0, 'item');
        console.log('- Ürünler Ciro:', Array.isArray(data.urunlerCiro), data.urunlerCiro?.length || 0, 'item');
        console.log('- Şubeler Ciro:', Array.isArray(data.subelerCiro), data.subelerCiro?.length || 0, 'item');
        console.log('- Şubeler Adet:', Array.isArray(data.subelerAdet), data.subelerAdet?.length || 0, 'item');
        console.log('- Satış Detay:', Array.isArray(data.satisDetay), data.satisDetay?.length || 0, 'item');
        console.log('- Saatlik Ciro:', Array.isArray(data.saatlikCiro), data.saatlikCiro?.length || 0, 'item');
        console.log('- Ortalama Sepet:', typeof data.ortalamaSepetTutari, '=', data.ortalamaSepetTutari);

        // Örnek veri
        if (data.satisDetay && data.satisDetay.length > 0) {
            console.log('\n📋 Örnek Satış Detay:', JSON.stringify(data.satisDetay[0], null, 2));
        }

        if (data.ciro && data.ciro.length > 0) {
            console.log('\n📈 Örnek Ciro:', JSON.stringify(data.ciro[0], null, 2));
        }

    } catch (error) {
        console.log('❌ HATA:', error.message);
        if (error.response) {
            console.log('   Status:', error.response.status);
            console.log('   Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testSalesReport(); 