import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

/**
 * XSS Protection - Clean HTML content
 */
export function sanitizeHTML(input) {
    if (typeof input !== 'string') return input;
    return DOMPurify.sanitize(input, {
        ALLOWED_TAGS: [], // No HTML tags allowed
        ALLOWED_ATTR: []
    });
}

/**
 * SQL Injection Protection - Escape special characters
 */
export function sanitizeSQL(input) {
    if (typeof input !== 'string') return input;
    return input
        .replace(/'/g, "''")  // Escape single quotes
        .replace(/;/g, '')    // Remove semicolons
        .replace(/--/g, '')   // Remove SQL comments
        .replace(/\/\*/g, '') // Remove block comment start
        .replace(/\*\//g, ''); // Remove block comment end
}

/**
 * General text sanitization
 */
export function sanitizeText(input, options = {}) {
    if (typeof input !== 'string') return input;

    let cleaned = input.trim();

    // Remove XSS patterns
    cleaned = sanitizeHTML(cleaned);

    // Remove null bytes
    cleaned = cleaned.replace(/\0/g, '');

    // Optional: Remove special characters (except allowed ones)
    if (options.alphanumericOnly) {
        cleaned = cleaned.replace(/[^a-zA-Z0-9\s]/g, '');
    }

    // Optional: Limit length
    if (options.maxLength) {
        cleaned = cleaned.substring(0, options.maxLength);
    }

    return cleaned;
}

/**
 * Email validation and sanitization
 */
export function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return { isValid: false, error: 'Email gereklidir' };
    }

    const sanitized = sanitizeText(email.toLowerCase().trim());

    if (!validator.isEmail(sanitized)) {
        return { isValid: false, error: 'Geçersiz email formatı' };
    }

    if (sanitized.length > 100) {
        return { isValid: false, error: 'Email çok uzun' };
    }

    return { isValid: true, value: sanitized };
}

/**
 * Phone number validation
 */
export function validatePhone(phone) {
    if (!phone || typeof phone !== 'string') {
        return { isValid: false, error: 'Telefon numarası gereklidir' };
    }

    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.length < 10 || cleaned.length > 15) {
        return { isValid: false, error: 'Geçersiz telefon numarası' };
    }

    return { isValid: true, value: cleaned };
}

/**
 * ID validation (for database IDs)
 */
export function validateID(id, fieldName = 'ID') {
    if (id === null || id === undefined) {
        return { isValid: false, error: `${fieldName} gereklidir` };
    }

    const numericId = parseInt(id);

    if (isNaN(numericId) || numericId <= 0) {
        return { isValid: false, error: `Geçersiz ${fieldName}` };
    }

    if (numericId > 2147483647) { // Max 32-bit integer
        return { isValid: false, error: `${fieldName} çok büyük` };
    }

    return { isValid: true, value: numericId };
}

/**
 * String validation with multiple options
 */
export function validateString(str, options = {}) {
    const {
        fieldName = 'Alan',
        required = true,
        minLength = 0,
        maxLength = 255,
        alphanumericOnly = false,
        allowedChars = null,
        forbiddenChars = null
    } = options;

    if (!str || typeof str !== 'string') {
        if (required) {
            return { isValid: false, error: `${fieldName} gereklidir` };
        }
        return { isValid: true, value: '' };
    }

    let cleaned = sanitizeText(str, { alphanumericOnly, maxLength });

    if (cleaned.length < minLength) {
        return { isValid: false, error: `${fieldName} en az ${minLength} karakter olmalıdır` };
    }

    if (cleaned.length > maxLength) {
        return { isValid: false, error: `${fieldName} en fazla ${maxLength} karakter olabilir` };
    }

    // Check allowed characters
    if (allowedChars) {
        const allowedRegex = new RegExp(`^[${allowedChars}]*$`);
        if (!allowedRegex.test(cleaned)) {
            return { isValid: false, error: `${fieldName} geçersiz karakter içeriyor` };
        }
    }

    // Check forbidden characters
    if (forbiddenChars) {
        const forbiddenRegex = new RegExp(`[${forbiddenChars}]`);
        if (forbiddenRegex.test(cleaned)) {
            return { isValid: false, error: `${fieldName} yasak karakter içeriyor` };
        }
    }

    return { isValid: true, value: cleaned };
}

/**
 * Number validation
 */
export function validateNumber(num, options = {}) {
    const {
        fieldName = 'Sayı',
        required = true,
        min = Number.MIN_SAFE_INTEGER,
        max = Number.MAX_SAFE_INTEGER,
        integer = false
    } = options;

    if (num === null || num === undefined || num === '') {
        if (required) {
            return { isValid: false, error: `${fieldName} gereklidir` };
        }
        return { isValid: true, value: null };
    }

    const parsed = parseFloat(num);

    if (isNaN(parsed)) {
        return { isValid: false, error: `${fieldName} geçerli bir sayı olmalıdır` };
    }

    if (integer && !Number.isInteger(parsed)) {
        return { isValid: false, error: `${fieldName} tam sayı olmalıdır` };
    }

    if (parsed < min) {
        return { isValid: false, error: `${fieldName} en az ${min} olmalıdır` };
    }

    if (parsed > max) {
        return { isValid: false, error: `${fieldName} en fazla ${max} olabilir` };
    }

    return { isValid: true, value: parsed };
}

/**
 * Date validation
 */
export function validateDate(dateStr, options = {}) {
    const {
        fieldName = 'Tarih',
        required = true,
        minDate = null,
        maxDate = null,
        format = 'YYYY-MM-DD'
    } = options;

    if (!dateStr) {
        if (required) {
            return { isValid: false, error: `${fieldName} gereklidir` };
        }
        return { isValid: true, value: null };
    }

    const date = new Date(dateStr);

    if (isNaN(date.getTime())) {
        return { isValid: false, error: `Geçersiz ${fieldName} formatı` };
    }

    if (minDate && date < new Date(minDate)) {
        return { isValid: false, error: `${fieldName} ${minDate} tarihinden sonra olmalıdır` };
    }

    if (maxDate && date > new Date(maxDate)) {
        return { isValid: false, error: `${fieldName} ${maxDate} tarihinden önce olmalıdır` };
    }

    return { isValid: true, value: date };
}

/**
 * Object validation - validate multiple fields at once
 */
export function validateObject(obj, schema) {
    const errors = [];
    const sanitized = {};

    for (const [fieldName, rules] of Object.entries(schema)) {
        const value = obj[fieldName];

        let result;

        switch (rules.type) {
            case 'string':
                result = validateString(value, { fieldName, ...rules });
                break;
            case 'email':
                result = validateEmail(value);
                break;
            case 'phone':
                result = validatePhone(value);
                break;
            case 'number':
                result = validateNumber(value, { fieldName, ...rules });
                break;
            case 'id':
                result = validateID(value, fieldName);
                break;
            case 'date':
                result = validateDate(value, { fieldName, ...rules });
                break;
            default:
                result = { isValid: true, value: sanitizeText(value) };
        }

        if (!result.isValid) {
            errors.push(result.error);
        } else {
            sanitized[fieldName] = result.value;
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        data: sanitized
    };
}

/**
 * Request body validation middleware creator
 */
export function createValidator(schema) {
    return function validateRequest(req, res, next) {
        const result = validateObject(req.body, schema);

        if (!result.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Geçersiz veri gönderildi',
                errors: result.errors
            });
        }

        // Replace req.body with sanitized data
        req.body = result.data;

        if (next) next();
        return result;
    };
}

/**
 * File upload validation
 */
export function validateFileUpload(file, options = {}) {
    const {
        maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
        allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'jpg', 'jpeg', 'png'],
        fieldName = 'Dosya'
    } = options;

    if (!file) {
        return { isValid: false, error: `${fieldName} gereklidir` };
    }

    if (file.size > maxSize) {
        return {
            isValid: false,
            error: `${fieldName} boyutu ${Math.round(maxSize / 1024 / 1024)}MB'den küçük olmalıdır`
        };
    }

    const fileExtension = file.name?.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(fileExtension)) {
        return {
            isValid: false,
            error: `${fieldName} türü desteklenmiyor. İzin verilen türler: ${allowedTypes.join(', ')}`
        };
    }

    return { isValid: true, value: file };
}

/**
 * URL validation
 */
export function validateURL(url, options = {}) {
    const { fieldName = 'URL', required = true } = options;

    if (!url) {
        if (required) {
            return { isValid: false, error: `${fieldName} gereklidir` };
        }
        return { isValid: true, value: null };
    }

    if (!validator.isURL(url, { protocols: ['http', 'https'] })) {
        return { isValid: false, error: `Geçersiz ${fieldName} formatı` };
    }

    return { isValid: true, value: url };
} 