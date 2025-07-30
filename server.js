// server.js - Custom NextJS Server with Socket.IO
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { initSocket } = require('./lib/socket-commonjs.js');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Tüm IP'lerde dinle
const port = process.env.PORT || 3000;

// ogsiparis.com domain konfigürasyonu
const allowedOrigins = dev
    ? ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173']
    : ['https://ogsiparis.com', 'https://www.ogsiparis.com'];

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        try {
            // Production güvenlik headers
            if (!dev) {
                // Server bilgilerini gizle
                res.removeHeader('X-Powered-By');
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('X-Frame-Options', 'SAMEORIGIN');
                res.setHeader('X-XSS-Protection', '1; mode=block');
                res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
                res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

                // HSTS
                if (req.headers['x-forwarded-proto'] === 'https') {
                    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
                }
            }

            // Hassas endpoint'leri engelle
            const blockedPaths = ['/.git', '/.env', '/config', '/docker', '/.DS_Store', '/node_modules'];
            const requestPath = req.url.toLowerCase();
            if (blockedPaths.some(path => requestPath.startsWith(path))) {
                res.statusCode = 404;
                res.end('Not Found');
                return;
            }

            // CORS headers
            const origin = req.headers.origin;
            console.log('CORS DEBUG - Origin:', origin, '| Method:', req.method, '| URL:', req.url);
            if (allowedOrigins.includes(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                console.log('CORS DEBUG - Allowed origin:', origin);
            } else {
                res.setHeader('Access-Control-Allow-Origin', '*');
                console.log('CORS DEBUG - Fallback origin: *');
            }
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, cache-control');
            res.setHeader('Access-Control-Allow-Credentials', 'true');

            // Preflight requests - OPTIONS method için özel handling
            if (req.method === 'OPTIONS') {
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': origin || '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, cache-control',
                    'Access-Control-Allow-Credentials': 'true'
                });
                res.end();
                return;
            }

            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    // Initialize Socket.IO
    initSocket(server);

    server.listen(port, hostname, (err) => {
        if (err) throw err;
        console.log(`🚀 Server ready on http://${hostname}:${port}`);
        console.log(`🌐 Domain: ${dev ? 'localhost' : 'ogsiparis.com'}`);
        console.log(`🔧 Environment: ${dev ? 'Development' : 'Production'}`);
    });
}); 