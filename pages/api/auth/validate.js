import jwt from 'jsonwebtoken';
import prisma from '../../../lib/prisma.js';
import { withCorsOnly } from '../../../lib/cors-wrapper.js';

/**
 * Token Validation Endpoint
 */
async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Token required',
                code: 'NO_TOKEN'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify JWT token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            console.log('🔐 Token verification failed:', error.message);
            return res.status(401).json({
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }

        // Get fresh user data from database
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
        });

        if (!user) {
            return res.status(401).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        if (!user.aktif) {
            return res.status(401).json({
                error: 'User account disabled',
                code: 'USER_DISABLED'
            });
        }

        // Calculate role level
        const roleLevels = {
            'GENEL_MUDUR': 100,
            'SUBE_MUDURU': 90,
            'URETIM_MUDURU': 80,
            'SEVKIYAT_MUDURU': 80,
            'CEP_DEPO_MUDURU': 80,
            'SUBE_PERSONELI': 50,
            'URETIM_PERSONEL': 50,
            'SEVKIYAT_PERSONELI': 50,
            'SOFOR': 40,
            'PERSONEL': 30
        };

        return res.status(200).json({
            success: true,
            user: {
                id: user.id,
                ad: user.ad,
                email: user.email,
                username: user.username,
                rol: user.rol,
                personelId: user.personelId,
                roleLevel: roleLevels[user.rol] || 30
            },
            tokenValid: true
        });

    } catch (error) {
        console.error('❌ Token validation error:', error);
        return res.status(500).json({
            error: 'Token validation failed',
            code: 'VALIDATION_ERROR'
        });
    }
}

export default withCorsOnly(handler);