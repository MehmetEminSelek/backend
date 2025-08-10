/**
 * =============================================
 * API TEST RUNNER - AUTH SYSTEM VALIDATION
 * =============================================
 * 
 * Backend API sistemini test etmek için:
 * node api-test.js
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';
const TEST_USER = {
    kullaniciAdi: 'baris.gullu',
    sifre: 'bar123'
};

// Test sonuçları
let testResults = {
    passed: 0,
    failed: 0,
    errors: []
};

/**
 * Test helper fonksiyonu
 */
async function runTest(testName, testFunction) {
    try {
        console.log(`\n🧪 ${testName} testi başlatılıyor...`);
        await testFunction();
        console.log(`✅ ${testName} - BAŞARILI`);
        testResults.passed++;
    } catch (error) {
        console.error(`❌ ${testName} - BAŞARISIZ:`, error.message);
        testResults.failed++;
        testResults.errors.push(`${testName}: ${error.message}`);
    }
}

/**
 * Auth token için global değişken
 */
let authToken = null;

/**
 * Login testi
 */
async function testLogin() {
    const response = await axios.post(`${API_BASE}/auth/login`, TEST_USER);

    if (response.status !== 200) {
        throw new Error(`Beklenmeyen status kodu: ${response.status}`);
    }

    if (!response.data.success) {
        throw new Error('Login başarısız olarak döndü');
    }

    if (!response.data.accessToken) {
        throw new Error('AccessToken döndürülmedi');
    }

    if (!response.data.user) {
        throw new Error('User bilgisi döndürülmedi');
    }

    // Token'ı sakla
    authToken = response.data.accessToken;

    console.log(`   Kullanıcı: ${response.data.user.ad}`);
    console.log(`   Rol: ${response.data.user.rol}`);
    console.log(`   Token: ${authToken.substring(0, 20)}...`);
}

/**
 * Token validation testi
 */
async function testTokenValidation() {
    if (!authToken) {
        throw new Error('Auth token yok, önce login yapın');
    }

    const response = await axios.post(`${API_BASE}/auth/validate`, {}, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.status !== 200) {
        throw new Error(`Beklenmeyen status kodu: ${response.status}`);
    }

    if (!response.data.success) {
        throw new Error('Token validation başarısız');
    }

    console.log(`   User ID: ${response.data.user.id}`);
    console.log(`   Role Level: ${response.data.user.roleLevel}`);
}

/**
 * Dropdown API testi
 */
async function testDropdownAPI() {
    if (!authToken) {
        throw new Error('Auth token yok, önce login yapın');
    }

    const response = await axios.get(`${API_BASE}/dropdown`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.status !== 200) {
        throw new Error(`Beklenmeyen status kodu: ${response.status}`);
    }

    if (!response.data.success) {
        throw new Error('Dropdown API başarısız');
    }

    const data = response.data.data;
    console.log(`   Dropdown kategorileri: ${Object.keys(data).join(', ')}`);
}

/**
 * Geçersiz token testi
 */
async function testInvalidToken() {
    try {
        await axios.get(`${API_BASE}/dropdown`, {
            headers: {
                'Authorization': 'Bearer invalid-token-12345'
            }
        });
        throw new Error('Geçersiz token kabul edildi!');
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('   Geçersiz token doğru şekilde reddedildi');
        } else {
            throw error;
        }
    }
}

/**
 * Logout testi
 */
async function testLogout() {
    if (!authToken) {
        throw new Error('Auth token yok, önce login yapın');
    }

    const response = await axios.post(`${API_BASE}/auth/logout`, {}, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    if (response.status !== 200) {
        throw new Error(`Beklenmeyen status kodu: ${response.status}`);
    }

    if (!response.data.success) {
        throw new Error('Logout başarısız');
    }

    console.log('   Logout başarılı');
}

/**
 * CORS testi
 */
async function testCORS() {
    // OPTIONS request testi
    const response = await axios.options(`${API_BASE}/auth/login`);

    if (response.status !== 204) {
        throw new Error(`CORS preflight başarısız: ${response.status}`);
    }

    console.log('   CORS preflight başarılı');
}

/**
 * Ana test runner
 */
async function runAllTests() {
    console.log('🚀 AUTH SYSTEM TEST RUNNER BAŞLATILIYOR...');
    console.log('='.repeat(50));

    // Test sırası önemli
    await runTest('CORS Preflight', testCORS);
    await runTest('Login', testLogin);
    await runTest('Token Validation', testTokenValidation);
    await runTest('Dropdown API', testDropdownAPI);
    await runTest('Invalid Token', testInvalidToken);
    await runTest('Logout', testLogout);

    // Sonuçları göster
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST SONUÇLARI:');
    console.log(`✅ Başarılı: ${testResults.passed}`);
    console.log(`❌ Başarısız: ${testResults.failed}`);

    if (testResults.failed > 0) {
        console.log('\n💥 HATALAR:');
        testResults.errors.forEach(error => {
            console.log(`   - ${error}`);
        });
        process.exit(1);
    } else {
        console.log('\n🎉 TÜM TESTLER BAŞARILI!');
        process.exit(0);
    }
}

// Test'leri çalıştır
runAllTests().catch(error => {
    console.error('💥 Test runner hatası:', error);
    process.exit(1);
});