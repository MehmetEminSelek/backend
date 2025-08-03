import prisma from '../../../lib/prisma.js';
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '../../../lib/auth.js';
import { auditLog } from '../../../lib/audit-logger.js';

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
async function logLoginAttempt(kullaniciAdi, ip, success, reason = null, userId = null, req = null) {
    try {
        await auditLog({
            personelId: userId || 'SYSTEM',
            action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
            tableName: 'USER',
            recordId: userId ? String(userId) : 'null',
            description: `${success ? 'Başarılı' : 'Başarısız'} giriş denemesi: ${kullaniciAdi}${reason ? ` - ${reason}` : ''}`,
            oldValues: null,
            newValues: { ip, userAgent: req?.headers?.['user-agent'], kullaniciAdi },
            req
        });
    } catch (error) {
        console.error('❌ Audit log hatası:', error);
    }
}

/**
 * Check if account is locked due to failed login attempts
 */
async function checkAccountLock(email) {
    try {
        // Count failed login attempts in the last lock duration period
        const lockTimeAgo = new Date(Date.now() - (ACCOUNT_LOCK_DURATION * 60 * 1000));

        // Audit log'dan failed attempt check - description içinde arama
        const failedAttempts = await prisma.auditLog.count({
            where: {
                action: 'LOGIN_FAILED',
                description: {
                    contains: email
                },
                timestamp: {
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

async function handler(req, res) {
    // Security headers for caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: `Method ${req.method} Not Allowed`
        });
    }

    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
        // Accept both field name formats (frontend compatibility)
        const kullaniciAdi = req.body.kullaniciAdi || req.body.username || req.body.email;
        const sifre = req.body.sifre || req.body.password;

        console.log('Login attempt:', { kullaniciAdi, hasPassword: !!sifre, body: Object.keys(req.body) });

        // Input validation
        const validationErrors = validateLoginInput(kullaniciAdi, sifre);
        if (validationErrors.length > 0) {
            // Try to find user for audit log even with validation error
            let userId = null;
            try {
                const normalizedKullaniciAdi = kullaniciAdi?.trim()?.toLowerCase();
                if (normalizedKullaniciAdi) {
                    const user = await prisma.user.findFirst({
                        where: {
                            OR: [
                                { email: normalizedKullaniciAdi },
                                { username: normalizedKullaniciAdi }
                            ]
                        },
                        select: { personelId: true }
                    });
                    userId = user?.personelId || null;
                }
            } catch (error) {
                // Ignore user lookup errors for audit log
            }

            await logLoginAttempt(kullaniciAdi, clientIP, false, 'VALIDATION_ERROR', userId, req);
            return res.status(400).json({
                success: false,
                message: 'Geçersiz giriş bilgileri.',
                errors: validationErrors
            });
        }

        // Normalize kullaniciAdi (trim and lowercase for email)
        const normalizedKullaniciAdi = kullaniciAdi.trim().toLowerCase();

        // Check account lock status - temporarily disabled
        const lockStatus = { isLocked: false, attemptsCount: 0 }; // await checkAccountLock(normalizedKullaniciAdi);
        if (false && lockStatus.isLocked) {
            // Try to find user for audit log
            let userId = null;
            try {
                const user = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { email: normalizedKullaniciAdi },
                            { username: normalizedKullaniciAdi },
                            { personelId: normalizedKullaniciAdi }
                        ]
                    },
                    select: { personelId: true }
                });
                userId = user?.personelId || null;
            } catch (error) {
                // Ignore user lookup errors for audit log
            }

            await logLoginAttempt(kullaniciAdi, clientIP, false, 'ACCOUNT_LOCKED', userId, req);
            return res.status(423).json({
                success: false,
                message: `Hesap geçici olarak kilitlendi. ${lockStatus.attemptsCount} başarısız deneme nedeniyle ${ACCOUNT_LOCK_DURATION} dakika bekleyiniz.`,
                lockDuration: ACCOUNT_LOCK_DURATION,
                attemptsCount: lockStatus.attemptsCount
            });
        }

        // Find user by email, username, or personelId
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: normalizedKullaniciAdi },
                    { username: normalizedKullaniciAdi },
                    { personelId: normalizedKullaniciAdi }
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
                personelId: true
            }
        });

        if (!user) {
            // Kullanıcı bulunamasa bile deaktif kullanıcıyı bul personelId için
            const inactiveUser = await prisma.user.findFirst({
                where: {
                    OR: [
                        { email: normalizedKullaniciAdi },
                        { username: normalizedKullaniciAdi },
                        { personelId: normalizedKullaniciAdi }
                    ]
                },
                select: { personelId: true }
            });

            await logLoginAttempt(kullaniciAdi, clientIP, false, 'USER_NOT_FOUND', inactiveUser?.personelId || null, req);
            return res.status(401).json({
                success: false,
                message: 'Geçersiz kullanıcı adı veya şifre.'
            });
        }

        // Password verification
        const valid = await bcrypt.compare(sifre, user.password);
        if (!valid) {
            await logLoginAttempt(kullaniciAdi, clientIP, false, 'INVALID_PASSWORD', user.personelId, req);
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

        // Update user timestamp
        await prisma.user.update({
            where: { id: user.id },
            data: {
                // Clear any previous login attempts on successful login
                updatedAt: new Date()
            }
        });

        // Log successful login
        await logLoginAttempt(user.email, clientIP, true, 'SUCCESS', user.personelId, req);

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
                                {
                                    mevcutStok: {
                                        lte: 10  // Kritik seviyenin altında olan stoklar
                                    }
                                }
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

        // Generate session expiry (24 hours from now)
        const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // Generate CSRF token
        const crypto = await import('crypto');
        const csrfToken = crypto.randomBytes(32).toString('hex');

        // Calculate role level based on role
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
            'PERSONEL': 30
            // VIEWER rolü schema'da yok - kaldırıldı
        };

        // ✅ AUDIT LOG: Successful login
        try {
            await auditLog({
                personelId: user.personelId,
                action: 'LOGIN_SUCCESS',
                tableName: 'USER',
                recordId: user.id,
                oldValues: null,
                newValues: { loginTime: new Date(), ip: req.ip, userAgent: req.headers['user-agent'] },
                description: `Başarılı giriş: ${user.ad} (${user.rol})`,
                req
            });
        } catch (auditError) {
            console.error('❌ Login audit log failed:', auditError);
        }

        return res.status(200).json({
            success: true,
            message: 'Giriş başarılı',
            user: {
                id: user.id,
                ad: user.ad,
                email: user.email,
                rol: user.rol,
                roleLevel: roleLevels[user.rol] || 30,
                personelId: user.personelId,
                username: user.username
            },
            accessToken,
            refreshToken,
            sessionExpiry,
            csrfToken,
            stokUyarilari
        });

    } catch (error) {
        console.error('❌ Login error:', error);

        // Try to find user for audit log even in error case
        let userId = null;
        try {
            const kullaniciAdi = req.body?.kullaniciAdi || req.body?.username || req.body?.email;
            if (kullaniciAdi) {
                const user = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { email: kullaniciAdi.toLowerCase() },
                            { username: kullaniciAdi.toLowerCase() }
                        ]
                    },
                    select: { personelId: true }
                });
                userId = user?.personelId || null;
            }
        } catch (auditError) {
            // Ignore audit lookup errors
        }

        await logLoginAttempt(req.body?.kullaniciAdi || req.body?.username || req.body?.email, clientIP, false, 'SERVER_ERROR', userId, req);

        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası oluştu. Lütfen tekrar deneyin.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// Export with CORS wrapper
import { withCorsOnly } from '../../../lib/cors-wrapper.js';
export default withCorsOnly(handler); 