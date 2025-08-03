// server.js - Custom NextJS Server with Socket.IO
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initSocket } from './lib/socket-commonjs.js';
import corsMiddleware from './middleware/cors.js';
import { auditLoggingMiddleware } from './middleware/audit-logging-commonjs.js';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Tüm IP'lerde dinle
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        try {
            // Apply CORS middleware first
            await new Promise((resolve) => {
                corsMiddleware(req, res, resolve);
            });

            // If it was a preflight request, we're done
            if (req.method === 'OPTIONS') {
                return;
            }
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