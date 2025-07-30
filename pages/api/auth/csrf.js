import { generateCSRFToken } from '../../../lib/security-middleware.js';
import { auditLogger } from '../../../lib/audit-logger.js';

/**
 * CSRF Token API Endpoint
 * Provides CSRF tokens for frontend security
 */
export default async function handler(req, res) {
    // Security headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'GET') {
        try {
            // Initialize session if not exists
            if (!req.session) {
                console.warn('⚠️ Session not initialized for CSRF token request');
                return res.status(500).json({
                    success: false,
                    message: 'Session initialization failed',
                    code: 'SESSION_ERROR'
                });
            }

            // Generate or retrieve existing CSRF token
            if (!req.session.csrfToken) {
                req.session.csrfToken = generateCSRFToken();
                console.log('🔑 New CSRF token generated for session:', req.sessionID?.substring(0, 8));
            }

            // Log CSRF token request for security monitoring
            await auditLogger.logSecurityEvent({
                event: 'CSRF_TOKEN_REQUESTED',
                ip: req.ip || req.connection?.remoteAddress,
                userAgent: req.get('User-Agent'),
                sessionId: req.sessionID,
                details: {
                    hasExistingToken: !!req.session.csrfToken,
                    timestamp: new Date().toISOString()
                }
            });

            return res.status(200).json({
                success: true,
                csrfToken: req.session.csrfToken,
                expiresIn: parseInt(process.env.SESSION_TIMEOUT_MINUTES || 480) * 60, // seconds
                message: 'CSRF token retrieved successfully'
            });

        } catch (error) {
            console.error('❌ CSRF token generation error:', error);

            await auditLogger.logSecurityEvent({
                event: 'CSRF_TOKEN_ERROR',
                ip: req.ip || req.connection?.remoteAddress,
                userAgent: req.get('User-Agent'),
                details: {
                    error: error.message,
                    timestamp: new Date().toISOString()
                }
            });

            return res.status(500).json({
                success: false,
                message: 'CSRF token generation failed',
                code: 'CSRF_TOKEN_ERROR'
            });
        }
    }

    // Method not allowed
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({
        success: false,
        message: `Method ${req.method} Not Allowed`,
        code: 'METHOD_NOT_ALLOWED'
    });
} 