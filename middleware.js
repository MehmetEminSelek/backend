/**
 * =============================================
 * BASIC MIDDLEWARE - SIMPLIFIED
 * =============================================
 * Basic security and CORS handling
 */

import { NextResponse } from 'next/server';

export async function middleware(request) {
    const startTime = Date.now();
    const pathname = request.nextUrl.pathname;
    const method = request.method;
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';

    try {
        // Basic CORS headers
        const response = NextResponse.next();

        // CORS configuration
        const origin = request.headers.get('origin');
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'https://ogsiparis.com',
            'https://www.ogsiparis.com'
        ];

        if (allowedOrigins.includes(origin)) {
            response.headers.set('Access-Control-Allow-Origin', origin);
        }

        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        response.headers.set('Access-Control-Allow-Credentials', 'true');

        // Basic security headers
        response.headers.set('X-Frame-Options', 'DENY');
        response.headers.set('X-Content-Type-Options', 'nosniff');
        response.headers.set('X-XSS-Protection', '1; mode=block');

        // Handle preflight requests
        if (method === 'OPTIONS') {
            return new Response(null, { status: 200, headers: response.headers });
        }

        return response;

    } catch (error) {
        console.error('❌ Middleware error:', error);
        return NextResponse.next();
    }
}

export const config = {
    matcher: [
        '/api/:path*',
        '/((?!_next|favicon.ico).*)'
    ]
};