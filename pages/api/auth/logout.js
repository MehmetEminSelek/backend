import { auditLog } from '../../../lib/audit-logger.js';
import { withCorsOnly } from '../../../lib/cors-wrapper.js';

/**
 * Secure Logout API with Audit Logging
 */
async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Extract user info from token if available
        const token = req.headers.authorization?.replace('Bearer ', '');
        let user = null;

        if (token) {
            try {
                const jwt = await import('jsonwebtoken');
                const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
                user = decoded;
            } catch (tokenError) {
                console.log('⚠️ Token validation failed during logout:', tokenError.message);
            }
        }

        // ✅ AUDIT LOG: Logout
        if (user) {
            try {
                await auditLog({
                    personelId: user.personelId || user.id,
                    action: 'LOGOUT',
                    tableName: 'USER',
                    recordId: user.id,
                    oldValues: null,
                    newValues: { logoutTime: new Date(), ip: req.ip, userAgent: req.headers['user-agent'] },
                    description: `Çıkış yapıldı: ${user.ad || user.username}`,
                    req
                });
            } catch (auditError) {
                console.error('❌ Logout audit log failed:', auditError);
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Çıkış başarılı'
        });

    } catch (error) {
        console.error('❌ Logout error:', error);

        return res.status(500).json({
            error: 'Çıkış işlemi sırasında hata oluştu',
            code: 'LOGOUT_ERROR'
        });
    }
}

export default withCorsOnly(handler);