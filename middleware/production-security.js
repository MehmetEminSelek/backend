/**
 * =====================================================
 * ENTERPRISE PRODUCTION SECURITY MIDDLEWARE
 * Advanced Security Layer for Production Environment
 * =====================================================
 */

import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { auditLog } from '../lib/audit-logger.js';

class ProductionSecurity {
    constructor() {
        this.securityConfig = {
            rateLimit: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 100, // limit each IP to 100 requests per windowMs
                message: 'Too many requests from this IP',
                standardHeaders: true,
                legacyHeaders: false
            },
            ipWhitelist: process.env.IP_WHITELIST?.split(',') || [],
            maxRequestSize: '10mb',
            allowedOrigins: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
            securityHeaders: true,
            requestValidation: true,
            auditAllRequests: process.env.AUDIT_ALL_REQUESTS === 'true'
        };

        this.initializeRateLimiter();
        this.initializeSecurityRules();
    }

    initializeRateLimiter() {
        // Different rate limits for different endpoints
        this.rateLimiters = {
            auth: rateLimit({
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 5, // 5 login attempts per 15 minutes
                message: { error: 'Too many authentication attempts', retryAfter: '15 minutes' },
                standardHeaders: true,
                legacyHeaders: false,
                keyGenerator: (req) => {
                    return req.ip + ':' + (req.body?.username || req.body?.email || 'unknown');
                }
            }),
            api: rateLimit({
                windowMs: 1 * 60 * 1000, // 1 minute
                max: 60, // 60 requests per minute
                message: { error: 'API rate limit exceeded', retryAfter: '1 minute' },
                standardHeaders: true,
                legacyHeaders: false
            }),
            strict: rateLimit({
                windowMs: 1 * 60 * 1000, // 1 minute
                max: 10, // 10 requests per minute for sensitive endpoints
                message: { error: 'Strict rate limit exceeded', retryAfter: '1 minute' },
                standardHeaders: true,
                legacyHeaders: false
            })
        };
    }

    initializeSecurityRules() {
        this.suspiciousPatterns = [
            /\b(union|select|insert|delete|drop|create|alter|exec|script)\b/i,
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/i,
            /vbscript:/i,
            /onload|onerror|onclick|onmouseover/i,
            /\.\.\/|\.\.\\/, // Path traversal
            /proc\/|etc\/|var\//, // System file access
            /cmd|powershell|bash|sh|exec/i
        ];

        this.blockedUserAgents = [
            /bot|crawler|spider|scraper/i,
            /curl|wget|python-requests/i,
            /postman|insomnia/i // Block API testing tools in production
        ];
    }

    /**
     * Comprehensive request validation and security checks
     */
    validateRequest(req, res, next) {
        const startTime = Date.now();
        const requestId = crypto.randomUUID();

        req.securityContext = {
            requestId,
            timestamp: new Date().toISOString(),
            ip: this.getClientIP(req),
            userAgent: req.headers['user-agent'] || 'unknown',
            origin: req.headers.origin || req.headers.referer || 'direct',
            path: req.path,
            method: req.method,
            threatLevel: 'low'
        };

        try {
            // IP Whitelist check (if configured)
            if (this.securityConfig.ipWhitelist.length > 0) {
                if (!this.securityConfig.ipWhitelist.includes(req.securityContext.ip)) {
                    return this.blockRequest(req, res, 'IP_NOT_WHITELISTED', 403);
                }
            }

            // User Agent validation
            if (this.isBlockedUserAgent(req.securityContext.userAgent)) {
                return this.blockRequest(req, res, 'BLOCKED_USER_AGENT', 403);
            }

            // Request size validation
            const contentLength = parseInt(req.headers['content-length'] || '0');
            if (contentLength > this.parseSize(this.securityConfig.maxRequestSize)) {
                return this.blockRequest(req, res, 'REQUEST_TOO_LARGE', 413);
            }

            // Suspicious request pattern detection
            const threatLevel = this.analyzeThreatLevel(req);
            req.securityContext.threatLevel = threatLevel;

            if (threatLevel === 'high') {
                return this.blockRequest(req, res, 'HIGH_THREAT_DETECTED', 403);
            }

            // Origin validation for API requests
            if (req.path.startsWith('/api/') && req.method !== 'GET') {
                if (!this.isValidOrigin(req.securityContext.origin)) {
                    return this.blockRequest(req, res, 'INVALID_ORIGIN', 403);
                }
            }

            // Add security headers
            this.addSecurityHeaders(req, res);

            // Audit logging for production
            if (this.securityConfig.auditAllRequests || threatLevel !== 'low') {
                this.auditRequest(req).catch(error => {
                    console.error('Audit logging failed:', error);
                });
            }

            // Performance monitoring
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                if (duration > 5000) { // Log slow requests
                    console.warn(`🐌 Slow request detected: ${req.method} ${req.path} - ${duration}ms`);
                }
            });

            next();

        } catch (error) {
            console.error('Security validation error:', error);
            return this.blockRequest(req, res, 'SECURITY_ERROR', 500);
        }
    }

    /**
     * Advanced threat level analysis
     */
    analyzeThreatLevel(req) {
        let threatScore = 0;
        const factors = [];

        // Check URL for suspicious patterns
        this.suspiciousPatterns.forEach(pattern => {
            if (pattern.test(req.url)) {
                threatScore += 3;
                factors.push('suspicious_url_pattern');
            }
        });

        // Check headers for suspicious content
        Object.values(req.headers).forEach(headerValue => {
            if (typeof headerValue === 'string') {
                this.suspiciousPatterns.forEach(pattern => {
                    if (pattern.test(headerValue)) {
                        threatScore += 2;
                        factors.push('suspicious_header');
                    }
                });
            }
        });

        // Check request body for suspicious content
        if (req.body) {
            const bodyString = JSON.stringify(req.body);
            this.suspiciousPatterns.forEach(pattern => {
                if (pattern.test(bodyString)) {
                    threatScore += 4;
                    factors.push('suspicious_body_content');
                }
            });
        }

        // Check for common attack signatures
        if (req.url.includes('../') || req.url.includes('..\\')) {
            threatScore += 5;
            factors.push('path_traversal');
        }

        if (req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].split(',').length > 5) {
            threatScore += 2;
            factors.push('suspicious_proxy_chain');
        }

        // Determine threat level
        if (threatScore >= 8) return 'high';
        if (threatScore >= 4) return 'medium';
        return 'low';
    }

    /**
     * Enhanced security headers for production
     */
    addSecurityHeaders(req, res) {
        if (!this.securityConfig.securityHeaders) return;

        // Remove server identification
        res.removeHeader('X-Powered-By');

        // Content Security Policy
        res.setHeader('Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https:; " +
            "connect-src 'self'; " +
            "font-src 'self'; " +
            "object-src 'none'; " +
            "media-src 'self'; " +
            "frame-src 'none';"
        );

        // Additional security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

        // HSTS for HTTPS
        if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }

        // Custom security headers
        res.setHeader('X-Request-ID', req.securityContext.requestId);
        res.setHeader('X-Response-Time', Date.now());
    }

    /**
     * Advanced audit logging for security events
     */
    async auditRequest(req) {
        try {
            await auditLog({
                personelId: req.user?.personelId || 'ANONYMOUS',
                action: 'SECURITY_REQUEST',
                tableName: 'SECURITY',
                recordId: req.securityContext.requestId,
                oldValues: null,
                newValues: {
                    method: req.method,
                    path: req.path,
                    ip: req.securityContext.ip,
                    userAgent: req.securityContext.userAgent,
                    origin: req.securityContext.origin,
                    threatLevel: req.securityContext.threatLevel,
                    timestamp: req.securityContext.timestamp
                },
                description: `Security audit: ${req.method} ${req.path} - Threat Level: ${req.securityContext.threatLevel}`,
                req
            });
        } catch (error) {
            console.error('Security audit logging failed:', error);
        }
    }

    /**
     * Block request with comprehensive logging
     */
    async blockRequest(req, res, reason, statusCode = 403) {
        const blockEvent = {
            timestamp: new Date().toISOString(),
            ip: req.securityContext?.ip || this.getClientIP(req),
            reason,
            path: req.path,
            method: req.method,
            userAgent: req.headers['user-agent'],
            origin: req.headers.origin
        };

        console.warn(`🚫 Request blocked: ${reason}`, blockEvent);

        // Enhanced audit logging for blocked requests
        try {
            await auditLog({
                personelId: 'SECURITY_SYSTEM',
                action: 'REQUEST_BLOCKED',
                tableName: 'SECURITY',
                recordId: crypto.randomUUID(),
                oldValues: null,
                newValues: blockEvent,
                description: `Security block: ${reason} - ${req.method} ${req.path}`,
                req
            });
        } catch (error) {
            console.error('Block audit logging failed:', error);
        }

        return res.status(statusCode).json({
            error: 'Request blocked by security policy',
            reason,
            timestamp: blockEvent.timestamp,
            requestId: req.securityContext?.requestId || crypto.randomUUID()
        });
    }

    /**
     * Utility methods
     */
    getClientIP(req) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.headers['x-real-ip'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            'unknown';
    }

    isBlockedUserAgent(userAgent) {
        return this.blockedUserAgents.some(pattern => pattern.test(userAgent));
    }

    isValidOrigin(origin) {
        if (origin === 'direct') return true;
        return this.securityConfig.allowedOrigins.some(allowed =>
            origin.startsWith(allowed)
        );
    }

    parseSize(size) {
        const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
        const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
        if (!match) return 0;
        return parseFloat(match[1]) * (units[match[2] || 'b'] || 1);
    }

    /**
     * Rate limiter selection based on endpoint
     */
    getRateLimiter(req) {
        if (req.path.startsWith('/api/auth/')) {
            return this.rateLimiters.auth;
        }
        if (req.path.includes('/admin/') || req.path.includes('/sensitive/')) {
            return this.rateLimiters.strict;
        }
        return this.rateLimiters.api;
    }

    /**
     * Main middleware function
     */
    middleware() {
        return (req, res, next) => {
            // Apply rate limiting first
            const rateLimiter = this.getRateLimiter(req);
            rateLimiter(req, res, (err) => {
                if (err) {
                    return this.blockRequest(req, res, 'RATE_LIMIT_EXCEEDED', 429);
                }

                // Then apply security validation
                this.validateRequest(req, res, next);
            });
        };
    }
}

// Export singleton instance
const productionSecurity = new ProductionSecurity();

export default productionSecurity;
export { ProductionSecurity };