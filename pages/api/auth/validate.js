/**
 * Token Validation Endpoint
 */

import { requireAuth } from '../../../lib/simple-auth.js';

async function validateHandler(req, res) {
    // requireAuth zaten token'ı doğruladı ve user'ı req'e ekledi
    return res.status(200).json({
        valid: true,
        user: req.user
    });
}

export default requireAuth(validateHandler);