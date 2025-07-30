/**
 * =============================================
 * SECURED USER EXCEL UPLOAD API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../../lib/audit-logger.js';
import { validateInput } from '../../../../lib/validation.js';
import formidable from 'formidable';
import XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// Enhanced API configuration for file upload security
export const config = {
    api: {
        bodyParser: false,
        externalResolver: true,
        responseLimit: '10mb'
    }
};

/**
 * Enhanced form parser with security validations
 */
function parseFormSecurely(req) {
    return new Promise((resolve, reject) => {
        const form = formidable({
            multiples: false,
            maxFileSize: 5 * 1024 * 1024, // 5MB max
            maxFieldsSize: 1024 * 1024, // 1MB fields max
            allowEmptyFiles: false,
            filter: function ({ name, originalFilename, mimetype }) {
                // Only allow Excel files
                const allowedMimeTypes = [
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-excel',
                    'application/xlsx'
                ];

                const allowedExtensions = ['.xlsx', '.xls'];
                const fileExt = path.extname(originalFilename || '').toLowerCase();

                return allowedMimeTypes.includes(mimetype) && allowedExtensions.includes(fileExt);
            }
        });

        form.parse(req, (err, fields, files) => {
            if (err) {
                reject(new Error(`File parsing error: ${err.message}`));
            } else {
                resolve({ fields, files });
            }
        });
    });
}

/**
 * Validate Excel file content for security threats
 */
function validateExcelFile(filePath) {
    try {
        // Check file size
        const stats = fs.statSync(filePath);
        if (stats.size > 5 * 1024 * 1024) { // 5MB
            throw new Error('File size exceeds 5MB limit');
        }

        // Try to parse Excel file to validate structure
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;

        if (!sheetNames || sheetNames.length === 0) {
            throw new Error('Excel file contains no sheets');
        }

        // Get first sheet
        const worksheet = workbook.Sheets[sheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            blankrows: false
        });

        if (!data || data.length < 2) { // At least header + 1 data row
            throw new Error('Excel file must contain at least header and one data row');
        }

        // Validate max rows (prevent memory exhaustion)
        if (data.length > 1000) {
            throw new Error('Excel file cannot contain more than 1000 rows');
        }

        return {
            workbook,
            worksheet,
            data,
            sheetName: sheetNames[0]
        };
    } catch (error) {
        throw new Error(`Excel validation failed: ${error.message}`);
    }
}

/**
 * User Excel Upload API Handler with Full Security Integration
 */
async function userExcelUploadHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'POST':
                return await uploadUsersFromExcel(req, res);
            default:
                res.setHeader('Allow', ['POST']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['POST']
                });
        }
    } catch (error) {
        console.error('User Excel Upload API Error:', error);

        auditLog('USER_EXCEL_UPLOAD_ERROR', 'User Excel upload failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'User Excel upload operation failed',
            code: 'USER_EXCEL_UPLOAD_ERROR'
        });
    }
}

/**
 * Upload Users from Excel with Enhanced Security
 */
async function uploadUsersFromExcel(req, res) {
    // Permission check - Only administrators can bulk upload users
    if (req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Insufficient permissions for bulk user upload'
        });
    }

    console.log('POST /api/excel/upload/kullanici request received...');

    let tempFilePath = null;
    let uploadedFile = null;

    try {
        // Parse form with security validations
        const { fields, files } = await parseFormSecurely(req);

        // Get uploaded file
        uploadedFile = files.file;
        if (!uploadedFile) {
            return res.status(400).json({
                error: 'No file uploaded'
            });
        }

        // Validate file path security
        tempFilePath = uploadedFile.filepath;
        if (!tempFilePath || !fs.existsSync(tempFilePath)) {
            return res.status(400).json({
                error: 'Invalid file upload'
            });
        }

        // Validate Excel file and extract data
        const { data } = validateExcelFile(tempFilePath);

        // Expected headers for user import
        const expectedHeaders = [
            'ADI SOYADI', 'SGK DURUMU', 'GİRİŞ YILI', 'ŞUBE',
            'ERP PASİF AKTİF', 'ROL', 'TELEFON', 'EMAIL',
            'GÜNLÜK ÜCRET', 'BAŞLANGIÇ TARİHİ'
        ];

        // Validate headers
        const headers = data[0] || [];
        const missingHeaders = expectedHeaders.filter(header =>
            !headers.some(h => h && h.toString().trim().toUpperCase().includes(header.toUpperCase()))
        );

        if (missingHeaders.length > 0) {
            return res.status(400).json({
                error: 'Missing required headers',
                missingHeaders
            });
        }

        // Process rows with enhanced validation
        const processResults = await req.prisma.secureTransaction(async (tx) => {
            const results = {
                successful: [],
                failed: [],
                duplicates: [],
                statistics: {
                    totalRows: data.length - 1, // Exclude header
                    processed: 0,
                    created: 0,
                    errors: 0,
                    duplicates: 0
                }
            };

            // Process each data row
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                const rowNumber = i + 1;

                try {
                    // Extract and validate row data
                    const userData = {
                        adiSoyadi: row[0] ? row[0].toString().trim() : '',
                        sgkDurumu: row[1] ? row[1].toString().trim() : '',
                        girisYili: row[2] ? parseInt(row[2]) : null,
                        sube: row[3] ? row[3].toString().trim() : '',
                        erpDurum: row[4] ? row[4].toString().trim().toUpperCase() : 'AKTİF',
                        rol: row[5] ? row[5].toString().trim().toUpperCase() : 'OPERATOR',
                        telefon: row[6] ? row[6].toString().trim() : '',
                        email: row[7] ? row[7].toString().trim().toLowerCase() : '',
                        gunlukUcret: row[8] ? parseFloat(row[8]) : null,
                        baslangicTarihi: row[9] ? new Date(row[9]) : new Date()
                    };

                    // Validate required fields
                    if (!userData.adiSoyadi) {
                        throw new Error('Name is required');
                    }

                    // Validate email format if provided
                    if (userData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
                        throw new Error('Invalid email format');
                    }

                    // Validate phone format if provided
                    if (userData.telefon && !/^[\d\s\-\+\(\)]{10,15}$/.test(userData.telefon)) {
                        throw new Error('Invalid phone format');
                    }

                    // Validate role
                    const validRoles = ['ADMIN', 'MANAGER', 'SUPERVISOR', 'OPERATOR', 'VIEWER'];
                    if (!validRoles.includes(userData.rol)) {
                        userData.rol = 'OPERATOR'; // Default to OPERATOR
                    }

                    // Check for existing user (by email or phone)
                    const existingUser = await tx.secureQuery('kullanici', 'findFirst', {
                        where: {
                            OR: [
                                ...(userData.email ? [{ email: userData.email }] : []),
                                ...(userData.telefon ? [{ telefon: userData.telefon }] : []),
                                { adiSoyadi: userData.adiSoyadi }
                            ]
                        },
                        select: {
                            id: true,
                            adiSoyadi: true,
                            email: true,
                            telefon: true
                        }
                    });

                    if (existingUser) {
                        results.duplicates.push({
                            row: rowNumber,
                            userData,
                            existing: existingUser,
                            reason: 'User already exists'
                        });
                        results.statistics.duplicates++;
                continue;
            }

                    // Generate secure password (will be changed on first login)
                    const defaultPassword = `User${Date.now()}${Math.random().toString(36).substring(2, 8)}`;
                    const hashedPassword = await bcrypt.hash(defaultPassword, 12);

                    // Find or create branch
                    let subeId = null;
                    if (userData.sube) {
                        let sube = await tx.secureQuery('sube', 'findFirst', {
                            where: {
                                OR: [
                                    { ad: { contains: userData.sube, mode: 'insensitive' } },
                                    { kod: { contains: userData.sube, mode: 'insensitive' } }
                                ]
                            },
                            select: { id: true }
                        });

                        if (!sube) {
                            // Create new branch if it doesn't exist
                            sube = await tx.secureQuery('sube', 'create', {
                                data: {
                                    ad: userData.sube,
                                    kod: userData.sube.substring(0, 10).toUpperCase(),
                                    aktif: true,
                                    olusturmaTarihi: new Date(),
                                    olusturanKullanici: req.user.userId
                                },
                                select: { id: true }
                            }, 'BRANCH_CREATED');
                        }

                        subeId = sube.id;
                    }

                    // Create user
                    const newUser = await tx.secureQuery('kullanici', 'create', {
            data: {
                            adiSoyadi: userData.adiSoyadi,
                            email: userData.email || null,
                            telefon: userData.telefon || null,
                            password: hashedPassword,
                            rol: userData.rol,
                            roleLevel: getRoleLevel(userData.rol),
                            subeId,
                            sgkDurumu: userData.sgkDurumu || null,
                            girisYili: userData.girisYili,
                            gunlukUcret: userData.gunlukUcret,
                            baslangicTarihi: userData.baslangicTarihi,
                            aktif: userData.erpDurum === 'AKTİF',
                            ilkGiris: true, // Force password change on first login
                            olusturmaTarihi: new Date(),
                            olusturanKullanici: req.user.userId
                        },
                        select: {
                            id: true,
                            adiSoyadi: true,
                            rol: true,
                            email: true,
                            telefon: true
                        }
                    }, 'USER_CREATED');

                    results.successful.push({
                        row: rowNumber,
                        userData,
                        user: newUser,
                        tempPassword: defaultPassword // Include in response for admin
                    });

                    results.statistics.created++;

                } catch (error) {
                    results.failed.push({
                        row: rowNumber,
                        userData: row,
                        error: error.message
                    });
                    results.statistics.errors++;
                }

                results.statistics.processed++;
            }

            return results;
        });

        // Enhanced audit logging for bulk user creation
        auditLog('BULK_USER_UPLOAD', 'Bulk user upload from Excel', {
            userId: req.user.userId,
            fileName: uploadedFile.originalFilename,
            fileSize: uploadedFile.size,
            totalRows: processResults.statistics.totalRows,
            created: processResults.statistics.created,
            errors: processResults.statistics.errors,
            duplicates: processResults.statistics.duplicates,
            bulkOperation: true,
            userDataCreation: true
        });

        return res.status(200).json({
            success: true,
            message: `User upload completed. ${processResults.statistics.created} users created, ${processResults.statistics.errors} errors, ${processResults.statistics.duplicates} duplicates.`,
            results: processResults,
            metadata: {
                uploadedAt: new Date(),
                uploadedBy: req.user.userId,
                fileName: uploadedFile.originalFilename,
                fileSize: uploadedFile.size
            }
        });

    } catch (error) {
        console.error('User Excel Upload Error:', error);

        // Enhanced audit logging for upload errors
        auditLog('USER_EXCEL_UPLOAD_ERROR', 'User Excel upload failed', {
            userId: req.user.userId,
            fileName: uploadedFile?.originalFilename,
            error: error.message,
            uploadAttempt: true
        });

        return res.status(400).json({
            error: 'User Excel upload failed',
            details: error.message
        });
    } finally {
        // Clean up temporary file
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (cleanupError) {
                console.error('File cleanup error:', cleanupError);
            }
        }
    }
}

/**
 * Get role level for RBAC
 */
function getRoleLevel(role) {
    const roleLevels = {
        'ADMIN': 90,
        'MANAGER': 70,
        'SUPERVISOR': 60,
        'OPERATOR': 40,
        'VIEWER': 20
    };
    return roleLevels[role] || 40; // Default to OPERATOR level
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(userExcelUploadHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.MANAGE_USERS, // User management permission

        // Method-specific permissions will be checked in handlers
        // POST: BULK_USER_CREATION (Admin+)

        // Input Validation Configuration
        allowedFields: [], // File upload doesn't use standard fields
        requiredFields: {},

        // Security Options for File Upload
        preventSQLInjection: true,
        enableAuditLogging: true,
        fileUploadSecurity: true, // Special flag for file uploads
        bulkOperationSecurity: true, // Mark as bulk operation
        userDataAccess: true // Mark as user data operation
    }
); 