import helmet from 'helmet';

export const securityMiddleware = (req, res, next) => {
    // Production'da güvenlik headers'ları ekle
    if (process.env.NODE_ENV === 'production') {
        // Server bilgilerini gizle
        res.removeHeader('X-Powered-By');
        res.removeHeader('Server');

        // Güvenlik headers'ları
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

        // HSTS (HTTPS kullanıyorsak)
        if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
    }

    next();
};

// Helmet konfigürasyonu
export const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https:", "wss:"],
            frameAncestors: ["'self'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
});

// Hassas endpoint'leri gizle
export const hideSensitiveEndpoints = (req, res, next) => {
    const blockedPaths = [
        '/.git',
        '/.env',
        '/config',
        '/docker',
        '/.DS_Store',
        '/node_modules',
        '/package-lock.json',
        '/yarn.lock',
    ];

    const requestPath = req.path.toLowerCase();

    if (blockedPaths.some(path => requestPath.startsWith(path))) {
        return res.status(404).json({ message: 'Not Found' });
    }

    next();
};

// API anahtarı doğrulama (opsiyonel)
export const apiKeyValidation = (req, res, next) => {
    // Production'da API key kontrolü yapabiliriz
    if (process.env.NODE_ENV === 'production' && process.env.API_KEY_REQUIRED === 'true') {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey || apiKey !== process.env.API_KEY) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
    }

    next();
}; 