import crypto from 'crypto';
import session from 'express-session';
import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { auditLogger } from './audit-logger.js';

// Environment-based configuration
const SESSION_CONFIG = {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    name: 'ogSiparis.sid',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true, // Prevent XSS
        maxAge: parseInt(process.env.SESSION_TIMEOUT_MINUTES || 480) * 60 * 1000, // 8 hours default
        sameSite: 'strict' // CSRF protection
    }
};

const CSRF_CONFIG = {
    secret: process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex'),
    tokenLength: 32,
    headerName: 'x-csrf-token',
    cookieName: '_csrf'
};

/**
 * Generate CSRF token
 */
export function generateCSRFToken() {
    return crypto.randomBytes(CSRF_CONFIG.tokenLength).toString('hex');
}

/**
 * Verify CSRF token
 */
export function verifyCSRFToken(token, sessionToken) {
    if (!token || !sessionToken) return false;

    try {
        // Use crypto.timingSafeEqual to prevent timing attacks
        const tokenBuffer = Buffer.from(token, 'hex');
        const sessionBuffer = Buffer.from(sessionToken, 'hex');

        if (tokenBuffer.length !== sessionBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(tokenBuffer, sessionBuffer);
    } catch {
        return false;
    }
}

/**
 * CSRF Protection Middleware
 */
export function csrfProtection(options = {}) {
    const {
        excludePaths = ['/api/auth/login', '/api/health'],
        methods = ['POST', 'PUT', 'DELETE', 'PATCH']
    } = options;

    return function (req, res, next) {
        // Skip CSRF for excluded paths
        if (excludePaths.includes(req.path)) {
            return next();
        }

        // Skip CSRF for safe methods
        if (!methods.includes(req.method)) {
            return next();
        }

        // Generate CSRF token for new sessions
        if (!req.session.csrfToken) {
            req.session.csrfToken = generateCSRFToken();
        }

        // Get token from header or body
        const clientToken = req.headers[CSRF_CONFIG.headerName] ||
            req.body._csrf ||
            req.query._csrf;

        // Verify token
        if (!verifyCSRFToken(clientToken, req.session.csrfToken)) {
            auditLogger.logSecurityEvent({
                event: 'CSRF_TOKEN_INVALID',
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                path: req.path,
                method: req.method,
                details: {
                    hasToken: !!clientToken,
                    hasSessionToken: !!req.session.csrfToken
                }
            });

            return res.status(403).json({
                success: false,
                message: 'Invalid CSRF token',
                code: 'CSRF_INVALID'
            });
        }

        next();
    };
}

/**
 * Enhanced Security Headers
 */
export function securityHeaders() {
    return helmet({
        // Content Security Policy
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                imgSrc: ["'self'", "data:", "https:"],
                scriptSrc: ["'self'", "'unsafe-eval'"], // Required for webpack dev
                connectSrc: ["'self'", "wss:", "ws:"],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"]
            }
        },

        // HTTP Strict Transport Security
        hsts: {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true
        },

        // X-Frame-Options
        frameguard: { action: 'deny' },

        // X-Content-Type-Options
        noSniff: true,

        // X-XSS-Protection
        xssFilter: true,

        // Referrer Policy
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

        // Feature Policy / Permissions Policy
        permittedCrossDomainPolicies: false,

        // Remove X-Powered-By header
        hidePoweredBy: true
    });
}

/**
 * Rate Limiting Configuration
 */
export const rateLimiters = {
    // General API rate limiting
    general: rateLimit({
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
        message: {
            success: false,
            message: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.',
            retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            auditLogger.logSecurityEvent({
                event: 'RATE_LIMIT_EXCEEDED',
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                path: req.path,
                method: req.method
            });

            res.status(429).json({
                success: false,
                message: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.',
                code: 'RATE_LIMIT_EXCEEDED'
            });
        }
    }),

    // Strict rate limiting for authentication
    auth: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
        skipSuccessfulRequests: true, // Don't count successful logins
        message: {
            success: false,
            message: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.',
            retryAfter: 900
        },
        handler: (req, res) => {
            auditLogger.logSecurityEvent({
                event: 'LOGIN_RATE_LIMIT_EXCEEDED',
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                path: req.path,
                details: { username: req.body?.kullaniciAdi }
            });

            res.status(429).json({
                success: false,
                message: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.',
                code: 'LOGIN_RATE_LIMIT_EXCEEDED'
            });
        }
    }),

    // File upload rate limiting
    upload: rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 10, // 10 uploads per minute
        message: {
            success: false,
            message: 'Çok fazla dosya yükleme denemesi. Lütfen bekleyin.',
            code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
        }
    })
};

/**
 * Input Sanitization Middleware
 */
export function sanitizeInputs() {
    return [
        // HTTP Parameter Pollution protection
        hpp({
            whitelist: ['tags', 'categories'] // Allow arrays for these fields
        }),

        // MongoDB/NoSQL injection protection
        mongoSanitize({
            replaceWith: '_',
            onSanitize: ({ req, key }) => {
                auditLogger.logSecurityEvent({
                    event: 'NOSQL_INJECTION_ATTEMPT',
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    path: req.path,
                    details: { sanitizedField: key }
                });
            }
        })
    ];
}

/**
 * Session Configuration
 */
export function sessionMiddleware() {
    // Note: In production, you should use Redis or another session store
    return session({
        ...SESSION_CONFIG,
        genid: () => crypto.randomUUID(), // Generate secure session IDs

        // Session store configuration (add Redis in production)
        store: process.env.NODE_ENV === 'production' ? undefined : undefined,

        // Security callback
        cookie: {
            ...SESSION_CONFIG.cookie,
            secure: process.env.NODE_ENV === 'production'
        }
    });
}

/**
 * Security Event Logger
 */
export function logSecurityEvent(eventType, req, details = {}) {
    auditLogger.logSecurityEvent({
        event: eventType,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        sessionId: req.sessionID,
        timestamp: new Date().toISOString(),
        details
    });
}

/**
 * IP Whitelist/Blacklist Middleware
 */
export function ipFilter(options = {}) {
    const { whitelist = [], blacklist = [] } = options;

    return function (req, res, next) {
        const clientIP = req.ip ||
            req.connection?.remoteAddress ||
            req.headers['x-forwarded-for']?.split(',')[0]?.trim();

        // Check blacklist
        if (blacklist.length > 0 && blacklist.includes(clientIP)) {
            logSecurityEvent('IP_BLACKLISTED', req, { ip: clientIP });
            return res.status(403).json({
                success: false,
                message: 'Access denied',
                code: 'IP_BLACKLISTED'
            });
        }

        // Check whitelist (if configured)
        if (whitelist.length > 0 && !whitelist.includes(clientIP)) {
            logSecurityEvent('IP_NOT_WHITELISTED', req, { ip: clientIP });
            return res.status(403).json({
                success: false,
                message: 'Access denied',
                code: 'IP_NOT_WHITELISTED'
            });
        }

        next();
    };
}

/**
 * Complete Security Middleware Stack
 */
export function applySecurityMiddleware(app) {
    // Basic security headers
    app.use(securityHeaders());

    // Input sanitization
    app.use(sanitizeInputs());

    // Session management
    app.use(sessionMiddleware());

    // General rate limiting
    app.use('/api/', rateLimiters.general);

    // Auth-specific rate limiting
    app.use('/api/auth/', rateLimiters.auth);

    // Upload rate limiting
    app.use('/api/upload/', rateLimiters.upload);

    // CSRF protection (after session)
    app.use('/api/', csrfProtection());

    console.log('✅ Security middleware applied successfully');
}

/**
 * CSRF Token endpoint for frontend
 */
export function csrfTokenEndpoint(req, res) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateCSRFToken();
    }

    res.json({
        success: true,
        csrfToken: req.session.csrfToken
    });
} 