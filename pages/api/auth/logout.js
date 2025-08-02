/**
 * Logout Handler
 */

import { requireAuth } from '../../../lib/simple-auth.js';

async function logoutHandler(req, res) {
    // Burada token blacklist'e eklenebilir veya session sonlandırılabilir
    // Şimdilik sadece success dönüyoruz, frontend localStorage'ı temizleyecek

    return res.status(200).json({
        success: true,
        message: 'Çıkış başarılı'
    });
}

export default requireAuth(logoutHandler);