const axios = require('axios');

async function testSiparisAPI() {
    console.log('🧪 Sipariş API Final Test Başlıyor...\n');
    
    const testData = {
        gonderenAdi: "Test User",
        gonderenTel: "05551234567", 
        kalemler: [
            {
                urunId: 1,
                miktar: 500,
                birim: "Gram", // Test: Frontend'den gelen format
                tepsiTavaId: 3
            }
        ]
    };

    try {
        console.log('📝 Test Data:');
        console.log(JSON.stringify(testData, null, 2));
        console.log('\n🚀 Sending POST /api/siparis...\n');

        const response = await axios.post('http://localhost:3000/api/siparis', testData, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test' // Dummy token for test
            }
        });

        console.log('✅ SUCCESS Response:');
        console.log(`Status: ${response.status}`);
        console.log(`Data:`, response.data);
        
    } catch (error) {
        console.log('❌ ERROR Response:');
        console.log(`Status: ${error.response?.status || 'No Response'}`);
        console.log(`Error:`, error.response?.data || error.message);
    }
}

testSiparisAPI();