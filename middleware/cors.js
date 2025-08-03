/**
 * Comprehensive CORS Middleware for Next.js
 * Handles all CORS scenarios including preflight requests
 */

// CORS configuration based on environment
const getCorsConfig = () => {
    const isDev = process.env.NODE_ENV !== 'production';

    // Allowed origins
    const allowedOrigins = isDev
        ? [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3000'
        ]
        : [
            'https://ogsiparis.com',
            'https://www.ogsiparis.com',
            process.env.FRONTEND_URL
        ].filter(Boolean);

    return {
        origins: allowedOrigins,
        credentials: true,
        maxAge: 86400, // 24 hours
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'Accept-Language',
            'Cache-Control',
            'Pragma',
            'If-Modified-Since',
            'X-Security-Level',
            'X-Request-Timestamp',
            'X-Device-Fingerprint',
            'X-Client-Id',
            'X-API-Key',
            'X-CSRF-Token',
            'X-Real-IP',
            'X-Forwarded-For',
            'X-Forwarded-Proto',
            'User-Agent',
            'Referer',
            'Origin'
        ],
        exposedHeaders: [
            'X-Total-Count',
            'X-Page-Count',
            'X-Current-Page',
            'X-Per-Page',
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
            'X-RateLimit-Reset',
            'X-Response-Time'
        ]
    };
};

/**
 * Main CORS middleware function
 */
export const corsMiddleware = (req, res, next) => {
    const config = getCorsConfig();
    const origin = req.headers.origin;
    const method = req.method;

    // Log CORS attempts for debugging
    if (process.env.NODE_ENV !== 'production') {
        console.log(`CORS DEBUG - Origin: ${origin} | Method: ${method} | URL: ${req.url}`);
    }

    // Check if origin is allowed
    let isAllowedOrigin = false;
    if (!origin) {
        // Allow requests with no origin (e.g., mobile apps, Postman)
        isAllowedOrigin = true;
    } else if (config.origins.includes('*')) {
        isAllowedOrigin = true;
    } else if (config.origins.includes(origin)) {
        isAllowedOrigin = true;
    }

    // Set CORS headers
    if (isAllowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');

        if (process.env.NODE_ENV !== 'production') {
            console.log(`CORS DEBUG - Allowed origin: ${origin || '*'}`);
        }
    } else {
        // In development, be more permissive
        if (process.env.NODE_ENV !== 'production') {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            console.log(`CORS DEBUG - Development mode: Allowing origin: ${origin}`);
        } else {
            // In production, reject unauthorized origins
            console.warn(`CORS WARNING - Rejected origin: ${origin}`);
        }
    }

    // Always set these headers
    res.setHeader('Access-Control-Allow-Methods', config.methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
    res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', config.maxAge.toString());

    // Handle preflight requests
    if (method === 'OPTIONS') {
        // Preflight request - respond immediately
        res.setHeader('Content-Length', '0');
        res.statusCode = 204;
        res.end();
        return;
    }

    // Continue to next middleware
    next();
};

/**
 * Helper function to add CORS headers to API responses
 * Use this in API routes that need custom CORS handling
 */
export const setCorsHeaders = (req, res) => {
    const config = getCorsConfig();
    const origin = req.headers.origin;

    if (config.origins.includes(origin) || process.env.NODE_ENV !== 'production') {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', config.methods.join(', '));
        res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
    }
};

/**
 * Next.js API route wrapper with CORS
 * Usage: export default withCors(handler)
 */
export const withCors = (handler) => {
    return async (req, res) => {
        // Apply CORS
        await new Promise((resolve) => {
            corsMiddleware(req, res, resolve);
        });

        // If it was a preflight request, we're done
        if (req.method === 'OPTIONS') {
            return;
        }

        // Call the actual handler
        return handler(req, res);
    };
};

export default corsMiddleware;