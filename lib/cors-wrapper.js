/**
 * CORS wrapper for API routes
 * Combines authentication and CORS handling
 */

import { withCors } from '../middleware/cors.js';
import { requireAuth } from './simple-auth.js';

/**
 * Wrap API handler with both CORS and authentication
 * @param {Function} handler - API route handler
 * @param {Object} options - Options for authentication
 * @returns {Function} Wrapped handler
 */
export const withCorsAndAuth = (handler, options = {}) => {
    // First apply CORS, then authentication
    return withCors(requireAuth(handler, options));
};

/**
 * Wrap API handler with CORS only (for public endpoints)
 * @param {Function} handler - API route handler
 * @returns {Function} Wrapped handler
 */
export const withCorsOnly = (handler) => {
    return withCors(handler);
};

export default withCorsAndAuth;