import prisma from '../../../lib/prisma';
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '../../../lib/auth.js';
import { auditLogger } from '../../../lib/audit-logger.js';

// Security constants from environment
const FAILED_LOGIN_THRESHOLD = parseInt(process.env.FAILED_LOGIN_THRESHOLD) || 5;
const ACCOUNT_LOCK_DURATION = parseInt(process.env.ACCOUNT_LOCK_DURATION_MINUTES) || 30;
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

/**
 * Get client IP address safely
 */
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        'unknown';
}

/**
 * Log login attempt for security monitoring
 */
async function logLoginAttempt(kullaniciAdi, ip, success, reason = null, userId = null) {
    try {
        await auditLogger.logUserActivity({
            userId: userId,
            userEmail: kullaniciAdi,
            action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
            resource: 'AUTH',
            ip: ip,
            details: {
                kullaniciAdi,
                success,
                reason,
                timestamp: new Date().toISOString(),
                userAgent: null // Will be added from req if available
            }
        });
    } catch (error) {
        console.error('❌ Login attempt logging failed:', error);
    }
}

/**
 * Check if account is locked due to failed login attempts
 */
async function checkAccountLock(email) {
    try {
        // Count failed login attempts in the last lock duration period
        const lockTimeAgo = new Date(Date.now() - (ACCOUNT_LOCK_DURATION * 60 * 1000));

        const failedAttempts = await prisma.auditLog.count({
            where: {
                action: 'LOGIN_FAILED',
                userEmail: email,
                createdAt: {
                    gte: lockTimeAgo
                }
            }
        });

        return {
            isLocked: failedAttempts >= FAILED_LOGIN_THRESHOLD,
            attemptsCount: failedAttempts,
            threshold: FAILED_LOGIN_THRESHOLD,
            lockDuration: ACCOUNT_LOCK_DURATION
        };
    } catch (error) {
        console.error('❌ Account lock check failed:', error);
        return { isLocked: false, attemptsCount: 0 };
    }
}

/**
 * Input validation
 */
function validateLoginInput(kullaniciAdi, sifre) {
    const errors = [];

    if (!kullaniciAdi || typeof kullaniciAdi !== 'string') {
        errors.push('Kullanıcı adı veya email gereklidir');
    } else if (kullaniciAdi.length < 3) {
        errors.push('Kullanıcı adı en az 3 karakter olmalıdır');
    } else if (kullaniciAdi.length > 100) {
        errors.push('Kullanıcı adı çok uzun');
    }

    if (!sifre || typeof sifre !== 'string') {
        errors.push('Şifre gereklidir');
    } else if (sifre.length < 6) {
        errors.push('Şifre en az 6 karakter olmalıdır');
    } else if (sifre.length > 200) {
        errors.push('Şifre çok uzun');
    }

    return errors;
}

export default async function handler(req, res) {
    // Security headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: `Method ${req.method} Not Allowed`
        });
    }

    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
        const { kullaniciAdi, sifre } = req.body;

        // Input validation
        const validationErrors = validateLoginInput(kullaniciAdi, sifre);
        if (validationErrors.length > 0) {
            await logLoginAttempt(kullaniciAdi, clientIP, false, 'VALIDATION_ERROR');
            return res.status(400).json({
                success: false,
                message: 'Geçersiz giriş bilgileri.',
                errors: validationErrors
            });
        }

        // Normalize kullaniciAdi (trim and lowercase for email)
        const normalizedKullaniciAdi = kullaniciAdi.trim().toLowerCase();

        // Check account lock status
        const lockStatus = await checkAccountLock(normalizedKullaniciAdi);
        if (lockStatus.isLocked) {
            await logLoginAttempt(kullaniciAdi, clientIP, false, 'ACCOUNT_LOCKED');
            return res.status(423).json({
                success: false,
                message: `Hesap geçici olarak kilitlendi. ${lockStatus.attemptsCount} başarısız deneme nedeniyle ${ACCOUNT_LOCK_DURATION} dakika bekleyiniz.`,
                lockDuration: ACCOUNT_LOCK_DURATION,
                attemptsCount: lockStatus.attemptsCount
            });
        }

        // Find user by email or username
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: normalizedKullaniciAdi },
                    { username: normalizedKullaniciAdi }
                ],
                aktif: true // Only active users can login
            },
            select: {
                id: true,
                ad: true,
                email: true,
                username: true,
                password: true,
                rol: true,
                aktif: true,
                lastLogin: true
            }
        });

        if (!user) {
            await logLoginAttempt(kullaniciAdi, clientIP, false, 'USER_NOT_FOUND');
            return res.status(401).json({
                success: false,
                message: 'Geçersiz kullanıcı adı veya şifre.'
            });
        }

        // Password verification
        const valid = await bcrypt.compare(sifre, user.password);
        if (!valid) {
            await logLoginAttempt(kullaniciAdi, clientIP, false, 'INVALID_PASSWORD', user.id);
            return res.status(401).json({
                success: false,
                message: 'Geçersiz kullanıcı adı veya şifre.'
            });
        }

        // Login successful - generate tokens
        const tokenPayload = {
            id: user.id,
            ad: user.ad,
            email: user.email,
            rol: user.rol
        };

        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken({ id: user.id });

        // Update last login timestamp
        await prisma.user.update({
            where: { id: user.id },
            data: {
                lastLogin: new Date(),
                // Clear any previous login attempts on successful login
                updatedAt: new Date()
            }
        });

        // Log successful login
        await logLoginAttempt(user.email, clientIP, true, 'SUCCESS', user.id);

        // Get stock alerts for user
        let stokUyarilari = null;
        try {
            console.log(`📊 ${user.ad} için stok uyarıları kontrol ediliyor...`);

            const kritikStoklar = await prisma.material.findMany({
                where: {
                    aktif: true,
                    OR: [
                        { mevcutStok: { lte: 0 } },
                        {
                            AND: [
                                { kritikSeviye: { not: null } },
                                { mevcutStok: { lte: 10 } }
                            ]
                        }
                    ]
                },
                select: {
                    id: true,
                    kod: true,
                    ad: true,
                    mevcutStok: true,
                    kritikSeviye: true,
                    birim: true
                },
                orderBy: { mevcutStok: 'asc' },
                take: 10
            });

            if (kritikStoklar.length > 0) {
                const negatifCount = kritikStoklar.filter(m => m.mevcutStok <= 0).length;
                const dusukCount = kritikStoklar.filter(m => m.mevcutStok > 0).length;

                stokUyarilari = {
                    count: kritikStoklar.length,
                    negatifCount,
                    dusukCount,
                    message: negatifCount > 0
                        ? `${negatifCount} malzemede negatif stok!`
                        : `${dusukCount} malzemede düşük stok!`,
                    samples: kritikStoklar.slice(0, 5),
                    severity: negatifCount > 0 ? 'critical' : 'warning'
                };

                console.log(`⚠️ ${user.ad} için ${kritikStoklar.length} stok uyarısı bulundu`);
            }
        } catch (stokError) {
            console.error('❌ Stok uyarıları kontrol edilemedi:', stokError);
        }

        return res.status(200).json({
            success: true,
            message: 'Giriş başarılı',
            user: {
                id: user.id,
                ad: user.ad,
                email: user.email,
                rol: user.rol,
                lastLogin: user.lastLogin
            },
            accessToken,
            refreshToken,
            stokUyarilari
        });

    } catch (error) {
        console.error('❌ Login error:', error);

        await logLoginAttempt(req.body?.kullaniciAdi, clientIP, false, 'SERVER_ERROR');

        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası oluştu. Lütfen tekrar deneyin.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
} 