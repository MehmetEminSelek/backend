/**
 * =============================================
 * MASTER SECURITY MIDDLEWARE - INTEGRATION
 * =============================================
 * ALL 10 SECURITY LAYERS INTEGRATED
 */

import { NextResponse } from 'next/server';
import { securityMiddleware } from './lib/security-middleware.js';
import { API_SECURITY_CONFIG } from './lib/api-security.js';
import { auditLog } from './lib/audit-logger.js';

export async function middleware(request) {
    const startTime = Date.now();
    const pathname = request.nextUrl.pathname;
    const method = request.method;
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';

    try {
        // ===== LAYER 1-6: BASIC SECURITY MIDDLEWARE =====
        // Apply enhanced security middleware (rate limiting, CSRF, headers, etc.)
        const securityResponse = await securityMiddleware(request);
        if (securityResponse) {
            // Security middleware blocked the request
            auditLog('SECURITY_BLOCKED', 'Request blocked by security middleware', {
                pathname,
                method,
                ip,
                reason: 'Security middleware rejection'
            });
            return securityResponse;
        }

        // ===== LAYER 7: API ENDPOINT CLASSIFICATION =====
        const isAPIRoute = pathname.startsWith('/api/');
        const isPublicEndpoint = API_SECURITY_CONFIG.PUBLIC_ENDPOINTS.some(endpoint =>
            pathname.startsWith(endpoint)
        );
        const requiresAuth = API_SECURITY_CONFIG.AUTH_REQUIRED.some(endpoint =>
            pathname.startsWith(endpoint)
        );

        // ===== LAYER 8: AUTHENTICATION REQUIREMENT CHECK =====
        if (isAPIRoute && requiresAuth && !isPublicEndpoint) {
            const authHeader = request.headers.get('authorization');
            const authToken = request.cookies.get('auth_token')?.value;

            if (!authHeader && !authToken) {
                auditLog('AUTH_REQUIRED', 'API endpoint requires authentication', {
                    pathname,
                    method,
                    ip
                });

                return NextResponse.json(
                    {
                        error: 'Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.',
                        code: 'AUTH_REQUIRED'
                    },
                    { status: 401 }
                );
            }
        }

        // ===== LAYER 9: REQUEST SIZE VALIDATION =====
        const contentLength = request.headers.get('content-length');
        if (contentLength) {
            const size = parseInt(contentLength);
            const maxSize = 50 * 1024 * 1024; // 50MB

            if (size > maxSize) {
                auditLog('REQUEST_TOO_LARGE', 'Request size exceeded limit', {
                    pathname,
                    method,
                    ip,
                    size
                });

                return NextResponse.json(
                    {
                        error: 'İstek boyutu çok büyük',
                        code: 'REQUEST_TOO_LARGE'
                    },
                    { status: 413 }
                );
            }
        }

        // ===== LAYER 10: SUSPICIOUS ACTIVITY DETECTION =====
        const userAgent = request.headers.get('user-agent') || '';
        const suspiciousPatterns = [
            /bot|crawler|spider/i,
            /curl|wget|python|postman/i,
            /sqlmap|nikto|nmap/i,
            /\b(union|select|insert|delete|drop)\b/i
        ];

        const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent)) ||
            suspiciousPatterns.some(pattern => pattern.test(pathname));

        if (isSuspicious && !isPublicEndpoint) {
            auditLog('SUSPICIOUS_ACTIVITY', 'Suspicious request pattern detected', {
                pathname,
                method,
                ip,
                userAgent,
                reason: 'Suspicious user agent or URL pattern'
            });

            // Don't block but monitor
            console.warn('Suspicious activity detected:', {
                pathname,
                ip,
                userAgent: userAgent.substring(0, 100)
            });
        }

        // ===== SUCCESS: CONTINUE TO ROUTE =====
        const duration = Date.now() - startTime;

        // Only audit for API routes to avoid noise
        if (isAPIRoute) {
            auditLog('MIDDLEWARE_SUCCESS', 'Request passed all security layers', {
                pathname,
                method,
                ip,
                duration,
                requiresAuth,
                isPublic: isPublicEndpoint
            });
        }

        return NextResponse.next();

    } catch (error) {
        const duration = Date.now() - startTime;

        auditLog('MIDDLEWARE_ERROR', 'Security middleware error', {
            pathname,
            method,
            ip,
            duration,
            error: error.message
        });

        console.error('Security Middleware Error:', error);

        // In case of error, allow request but log it
        return NextResponse.next();
    }
}

// ===== MIDDLEWARE CONFIGURATION =====
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder files
         */
        '/((?!_next/static|_next/image|favicon.ico|public/).*)',
    ],
};