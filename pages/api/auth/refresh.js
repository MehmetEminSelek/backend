import prisma from '../../../lib/prisma.js'
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from '../../../lib/auth.js'
import { auditLog } from '../../../lib/audit-logger.js'
import { withCorsOnly } from '../../../lib/cors-wrapper.js'

/**
 * Secure Token Refresh Endpoint
 * POST /api/auth/refresh
 * Body: { refreshToken: string }
 */
async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { refreshToken } = req.body || {}

        if (!refreshToken || typeof refreshToken !== 'string') {
            return res.status(400).json({ error: 'Refresh token is required', code: 'NO_REFRESH_TOKEN' })
        }

        // Verify refresh token
        let decoded
        try {
            decoded = verifyRefreshToken(refreshToken)
        } catch (err) {
            return res.status(401).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH' })
        }

        // Load user and ensure account is active
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                ad: true,
                email: true,
                username: true,
                rol: true,
                personelId: true,
                aktif: true
            }
        })

        if (!user || !user.aktif) {
            return res.status(401).json({ error: 'User not authorized', code: 'USER_NOT_AUTHORIZED' })
        }

        // Generate new tokens
        const tokenPayload = {
            id: user.id,
            ad: user.ad,
            email: user.email,
            rol: user.rol
        }

        const newAccessToken = generateAccessToken(tokenPayload)
        const newRefreshToken = generateRefreshToken({ id: user.id })

        // New session expiry (24h)
        const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

        // Audit
        try {
            await auditLog({
                personelId: user.personelId,
                action: 'TOKEN_REFRESH',
                tableName: 'USER',
                recordId: user.id,
                oldValues: null,
                newValues: { refresh: true, ip: req.ip, userAgent: req.headers['user-agent'] },
                description: `Access token refreshed for ${user.ad} (${user.rol})`,
                req
            })
        } catch (auditError) {
            // Do not block on audit failure
            console.error('Audit log failed (TOKEN_REFRESH):', auditError)
        }

        return res.status(200).json({
            success: true,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            sessionExpiry
        })
    } catch (error) {
        console.error('Token refresh error:', error)
        return res.status(500).json({ error: 'Token refresh failed', code: 'REFRESH_ERROR' })
    }
}

export default withCorsOnly(handler) 