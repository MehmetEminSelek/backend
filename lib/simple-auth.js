/**
 * Simple Authentication Middleware
 * Profesyonel ve çalışan bir auth sistemi
 */

import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Basit auth middleware - token kontrolü yapar
 */
export function requireAuth(handler) {
    return async (req, res) => {
        try {
            // OPTIONS requests için auth bypass
            if (req.method === 'OPTIONS') {
                return res.status(200).end();
            }

            // Token'ı al
            const token = req.headers.authorization?.replace('Bearer ', '') ||
                req.headers['x-auth-token'] ||
                req.cookies?.token;

            if (!token) {
                return res.status(401).json({
                    error: 'Yetkilendirme gerekli',
                    code: 'NO_TOKEN'
                });
            }

            // Token'ı doğrula
            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET);
            } catch (error) {
                return res.status(401).json({
                    error: 'Geçersiz veya süresi dolmuş token',
                    code: 'INVALID_TOKEN'
                });
            }

            // Kullanıcıyı veritabanından al
            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: {
                    id: true,
                    personelId: true,
                    ad: true,
                    soyad: true,
                    email: true,
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

            // User'ı request'e ekle
            req.user = user;

            // Handler'ı çalıştır
            return handler(req, res);

        } catch (error) {
            console.error('Auth middleware error:', error);
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