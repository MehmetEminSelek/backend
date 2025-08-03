/**
 * Unified Authentication Middleware
 * Ana auth sistemi - lib/auth.js ile tutarlı
 */

import { verifyAuth } from './auth.js';
import prisma from './prisma.js';

/**
 * Auth middleware - ana auth.js sistemini kullanır
 */
export function requireAuth(handler, options = {}) {
    return async (req, res) => {
        try {
            // OPTIONS requests için auth bypass
            if (req.method === 'OPTIONS') {
                return res.status(200).end();
            }

            // Ana auth sistemini kullan
            const decoded = verifyAuth(req);

            // Kullanıcıyı veritabanından al (fresh data)
            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: {
                    id: true,
                    personelId: true,
                    ad: true,
                    soyad: true,
                    email: true,
                    username: true,
                    rol: true,
                    aktif: true
                }
            });

            if (!user || !user.aktif) {
                return res.status(401).json({
                    error: 'Kullanıcı bulunamadı veya aktif değil',
                    code: 'USER_NOT_FOUND'
                });
            }

            // Role level hesapla
            const roleLevels = {
                'GENEL_MUDUR': 100,
                'ADMIN': 95,  // Yeni ADMIN rolü
                'SUBE_MUDURU': 90,
                'URETIM_MUDURU': 80,
                'SEVKIYAT_MUDURU': 80,
                'CEP_DEPO_MUDURU': 80,
                'SUBE_PERSONELI': 50,
                'URETIM_PERSONEL': 50,
                'SEVKIYAT_PERSONELI': 50,
                'SOFOR': 40,
                'PERSONEL': 30,
                'VIEWER': 25  // VIEWER rolü eklendi
            };

            // User'ı request'e ekle (roleLevel ile birlikte)
            req.user = {
                ...user,
                roleLevel: roleLevels[user.rol] || 30
            };

            // Handler'ı çalıştır
            return handler(req, res);

        } catch (error) {
            console.error('Auth middleware error:', error);

            // Auth hatalarını tutarlı şekilde döndür
            if (error.message.includes('Token') || error.message.includes('expired')) {
                return res.status(401).json({
                    error: error.message,
                    code: 'INVALID_TOKEN'
                });
            }

            return res.status(500).json({
                error: 'Sunucu hatası',
                code: 'SERVER_ERROR'
            });
        }
    };
}

/**
 * Rol bazlı yetkilendirme
 */
export function requireRole(roles) {
    return (handler) => {
        return requireAuth(async (req, res) => {
            const userRole = req.user.rol;

            if (!roles.includes(userRole)) {
                return res.status(403).json({
                    error: 'Bu işlem için yetkiniz yok',
                    code: 'INSUFFICIENT_PERMISSION'
                });
            }

            return handler(req, res);
        });
    };
}

/**
 * Public endpoint - auth gerektirmez
 */
export function publicEndpoint(handler) {
    return async (req, res) => {
        try {
            return handler(req, res);
        } catch (error) {
            console.error('Public endpoint error:', error);
            return res.status(500).json({
                error: 'Sunucu hatası',
                code: 'SERVER_ERROR'
            });
        }
    };
}