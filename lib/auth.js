import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Environment validation on startup
if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}

if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
}

// JWT Configuration
const JWT_CONFIG = {
    secret: process.env.JWT_SECRET,
    accessTokenExpiry: process.env.JWT_EXPIRES_IN || '7d',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    issuer: 'ogsiparis.com',
    audience: 'og-siparis-users'
};

/**
 * Verify and decode JWT token
 * @param {Object} req - Request object
 * @returns {Object} Decoded token payload
 * @throws {Error} Authentication errors
 */
export function verifyAuth(req) {
    try {
        const auth = req.headers.authorization || req.headers.Authorization;

        if (!auth) {
            throw new Error('Authorization header is required');
        }

        if (!auth.startsWith('Bearer ')) {
            throw new Error('Authorization header must start with Bearer');
        }

        const token = auth.replace('Bearer ', '').trim();

        if (!token) {
            throw new Error('Token is required');
        }

        // Verify token with comprehensive options
        const decoded = jwt.verify(token, JWT_CONFIG.secret, {
            issuer: JWT_CONFIG.issuer,
            audience: JWT_CONFIG.audience,
            algorithms: ['HS256'], // Only allow HMAC SHA-256
            clockTolerance: 30 // 30 seconds clock tolerance
        });

        // Validate token payload structure
        if (!decoded.id || !decoded.rol) {
            throw new Error('Invalid token payload structure');
        }

        return decoded;

    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            throw new Error('Invalid token');
        }
        if (error instanceof jwt.TokenExpiredError) {
            throw new Error('Token has expired');
        }
        if (error instanceof jwt.NotBeforeError) {
            throw new Error('Token not yet valid');
        }

        throw error;
    }
}

/**
 * Generate secure JWT access token
 * @param {Object} payload - Token payload
 * @returns {string} JWT token
 */
export function generateAccessToken(payload) {
    const tokenPayload = {
        ...payload,
        iat: Math.floor(Date.now() / 1000), // Issued at
        jti: crypto.randomUUID() // Unique token ID
    };

    return jwt.sign(tokenPayload, JWT_CONFIG.secret, {
        expiresIn: JWT_CONFIG.accessTokenExpiry,
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience,
        algorithm: 'HS256'
    });
}

/**
 * Generate secure refresh token
 * @param {Object} payload - Token payload
 * @returns {string} Refresh JWT token
 */
export function generateRefreshToken(payload) {
    const tokenPayload = {
        id: payload.id,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID()
    };

    return jwt.sign(tokenPayload, JWT_CONFIG.secret, {
        expiresIn: JWT_CONFIG.refreshTokenExpiry,
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience,
        algorithm: 'HS256'
    });
}

/**
 * Verify refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Object} Decoded refresh token
 */
export function verifyRefreshToken(refreshToken) {
    try {
        const decoded = jwt.verify(refreshToken, JWT_CONFIG.secret, {
            issuer: JWT_CONFIG.issuer,
            audience: JWT_CONFIG.audience,
            algorithms: ['HS256']
        });

        if (decoded.type !== 'refresh') {
            throw new Error('Invalid refresh token type');
        }

        return decoded;

    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            throw new Error('Invalid refresh token');
        }
        if (error instanceof jwt.TokenExpiredError) {
            throw new Error('Refresh token has expired');
        }

        throw error;
    }
}

/**
 * Extract token from request headers safely
 * @param {Object} req - Request object
 * @returns {string|null} Token or null
 */
export function extractToken(req) {
    const auth = req.headers.authorization || req.headers.Authorization;

    if (!auth || !auth.startsWith('Bearer ')) {
        return null;
    }

    return auth.replace('Bearer ', '').trim() || null;
}

/**
 * Check if token is about to expire (within 1 hour)
 * @param {Object} decoded - Decoded token
 * @returns {boolean} True if token is about to expire
 */
export function isTokenExpiringSoon(decoded) {
    const currentTime = Math.floor(Date.now() / 1000);
    const expiryTime = decoded.exp;
    const oneHour = 3600; // 1 hour in seconds

    return (expiryTime - currentTime) <= oneHour;
} 