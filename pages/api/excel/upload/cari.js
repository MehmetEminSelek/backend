/**
 * =============================================
 * SECURED CUSTOMER EXCEL UPLOAD API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../../lib/audit-logger.js';
import { validateInput } from '../../../../lib/validation.js';
import formidable from 'formidable';
import XLSX from 'xlsx';
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
};

const cleanRow = (row) => {
    const clean = {};
    Object.keys(row).forEach(k => { clean[k.trim()] = row[k]; });
    return clean;
};

// Yeni müşteri kodu oluştur
async function generateNextMusteriKodu() {
    // En son müşteri kodunu bul
    const lastCari = await prisma.cari.findFirst({
        where: {
            musteriKodu: {
                startsWith: 'MS'
            }
        },
        orderBy: {
            musteriKodu: 'desc'
        }
    });

    if (!lastCari) {
        return 'MS000001';
    }

    // MS000001 formatından sayıyı çıkar
    const lastNumber = parseInt(lastCari.musteriKodu.substring(2));
    const nextNumber = lastNumber + 1;

    // Yeni kodu oluştur (6 hane, başında sıfırlar)
    return `MS${String(nextNumber).padStart(6, '0')}`;
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
        if (data.length > 2000) {
            throw new Error('Excel file cannot contain more than 2000 rows');
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
 * Customer Excel Upload API Handler with Full Security Integration
 */
async function customerExcelUploadHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'POST':
                return await uploadCustomersFromExcel(req, res);
            default:
                res.setHeader('Allow', ['POST']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['POST']
                });
        }
    } catch (error) {
        console.error('Customer Excel Upload API Error:', error);

        auditLog('CUSTOMER_EXCEL_UPLOAD_ERROR', 'Customer Excel upload failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Customer Excel upload operation failed',
            code: 'CUSTOMER_EXCEL_UPLOAD_ERROR'
        });
    }
}

/**
 * Upload Customers from Excel with Enhanced Security
 */
async function uploadCustomersFromExcel(req, res) {
    // Permission check - Managers+ can bulk upload customers
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions for bulk customer upload'
        });
    }

    console.log('POST /api/excel/upload/cari request received...');

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

        // Expected headers for customer import
        const expectedHeaders = [
            'CARİ ADI', 'MÜŞTERİ KODU', 'ŞUBE ADI', 'TEL',
            'EMAIL', 'ADRES', 'İL', 'İLÇE', 'MÜŞTERİ TİPİ', 'BÖLGE'
        ];

        // Validate headers (flexible matching)
        const headers = data[0] || [];
        const headerMapping = {};

        expectedHeaders.forEach(expectedHeader => {
            const matchedIndex = headers.findIndex(h =>
                h && h.toString().trim().toUpperCase().includes(expectedHeader.toUpperCase())
            );
            if (matchedIndex !== -1) {
                headerMapping[expectedHeader] = matchedIndex;
            }
        });

        // Check for required headers
        const requiredHeaders = ['CARİ ADI', 'TEL'];
        const missingRequired = requiredHeaders.filter(header => !headerMapping[header]);

        if (missingRequired.length > 0) {
            return res.status(400).json({
                error: 'Missing required headers',
                required: requiredHeaders,
                missing: missingRequired
            });
        }

        // Process rows with enhanced validation
        const processResults = await prisma.$transaction(async (tx) => {
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

            // Track customer codes to ensure uniqueness within the upload
            const usedCodes = new Set();

            // Process each data row
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                const rowNumber = i + 1;

                try {
                    // Extract and validate row data using header mapping
                    const customerData = {
                        ad: row[headerMapping['CARİ ADI']] ? row[headerMapping['CARİ ADI']].toString().trim() : '',
                        musteriKodu: row[headerMapping['MÜŞTERİ KODU']] ? row[headerMapping['MÜŞTERİ KODU']].toString().trim() : '',
                        subeAdi: row[headerMapping['ŞUBE ADI']] ? row[headerMapping['ŞUBE ADI']].toString().trim() : '',
                        telefon: row[headerMapping['TEL']] ? row[headerMapping['TEL']].toString().trim() : '',
                        email: row[headerMapping['EMAIL']] ? row[headerMapping['EMAIL']].toString().trim().toLowerCase() : '',
                        adres: row[headerMapping['ADRES']] ? row[headerMapping['ADRES']].toString().trim() : '',
                        il: row[headerMapping['İL']] ? row[headerMapping['İL']].toString().trim() : '',
                        ilce: row[headerMapping['İLÇE']] ? row[headerMapping['İLÇE']].toString().trim() : '',
                        musteriTipi: row[headerMapping['MÜŞTERİ TİPİ']] ? row[headerMapping['MÜŞTERİ TİPİ']].toString().trim().toUpperCase() : 'BIREYSEL',
                        bolge: row[headerMapping['BÖLGE']] ? row[headerMapping['BÖLGE']].toString().trim() : ''
                    };

                    // Validate required fields
                    if (!customerData.ad) {
                        throw new Error('Customer name is required');
                    }

                    if (!customerData.telefon) {
                        throw new Error('Phone number is required');
                    }

                    // Validate phone format
                    if (!/^[\d\s\-\+\(\)]{10,15}$/.test(customerData.telefon)) {
                        throw new Error('Invalid phone format');
                    }

                    // Validate email format if provided
                    if (customerData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerData.email)) {
                        throw new Error('Invalid email format');
                    }

                    // Validate customer type
                    const validTypes = ['BIREYSEL', 'KURUMSAL', 'BAYİ', 'DİĞER'];
                    if (!validTypes.includes(customerData.musteriTipi)) {
                        customerData.musteriTipi = 'BIREYSEL'; // Default
                    }

                    // Generate unique customer code if not provided
                    if (!customerData.musteriKodu) {
                        // Generate from name and phone
                        const namePrefix = customerData.ad.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
                        const phonePostfix = customerData.telefon.replace(/[^\d]/g, '').slice(-3);
                        customerData.musteriKodu = `${namePrefix}${phonePostfix}${String(Date.now()).slice(-3)}`;
                    }

                    // Check for duplicate customer code within this upload
                    if (usedCodes.has(customerData.musteriKodu)) {
                        customerData.musteriKodu += `_${Math.random().toString(36).substring(2, 5)}`;
                    }
                    usedCodes.add(customerData.musteriKodu);

                    // Check for existing customer (by phone, email, or code)
                    const existingCustomer = await tx.cariMusteri.findFirst({
                        where: {
                            OR: [
                                { telefon: customerData.telefon },
                                ...(customerData.email ? [{ email: customerData.email }] : []),
                                { musteriKodu: customerData.musteriKodu }
                            ]
                        },
                        select: {
                            id: true,
                            ad: true,
                            soyad: true,
                            telefon: true,
                            email: true,
                            musteriKodu: true
                        }
                    });

                    if (existingCustomer) {
                        results.duplicates.push({
                            row: rowNumber,
                            customerData,
                            existing: existingCustomer,
                            reason: 'Customer already exists'
                        });
                        results.statistics.duplicates++;
                        continue;
                    }

                    // Find or create branch
                    let subeId = null;
                    if (customerData.subeAdi) {
                        let sube = await tx.sube.findFirst({
                            where: {
                                OR: [
                                    { ad: { contains: customerData.subeAdi, mode: 'insensitive' } },
                                    { kod: { contains: customerData.subeAdi, mode: 'insensitive' } }
                                ]
                            },
                            select: { id: true }
                        });

                        if (!sube) {
                            // Create new branch if it doesn't exist
                            sube = await tx.sube.create({
                                data: {
                                    ad: customerData.subeAdi,
                                    kod: customerData.subeAdi.substring(0, 10).toUpperCase(),
                                    aktif: true,
                                    olusturmaTarihi: new Date(),
                                    olusturanKullanici: req.user.userId
                                },
                                select: { id: true }
                            }, 'BRANCH_CREATED');
                        }

                        subeId = sube.id;
                    }

                    // Split name if it contains space
                    const nameParts = customerData.ad.split(' ');
                    const ad = nameParts[0] || '';
                    const soyad = nameParts.slice(1).join(' ') || '';

                    // Create customer
                    const newCustomer = await tx.cariMusteri.create({
                        data: {
                            ad,
                            soyad,
                            telefon: customerData.telefon,
                            email: customerData.email || null,
                            musteriKodu: customerData.musteriKodu,
                            musteriTipi: customerData.musteriTipi,
                            bolge: customerData.bolge || null,
                            subeId,
                            aktif: true,
                            olusturmaTarihi: new Date(),
                            olusturanKullanici: req.user.userId
                        },
                        select: {
                            id: true,
                            ad: true,
                            soyad: true,
                            telefon: true,
                            email: true,
                            musteriKodu: true,
                            musteriTipi: true
                        }
                    }, 'CUSTOMER_CREATED');

                    // Create default address if provided
                    if (customerData.adres) {
                        await tx.cariAdres.create({
                            data: {
                                cariMusteriId: newCustomer.id,
                                tip: 'EV',
                                adres: customerData.adres,
                                il: customerData.il || '',
                                ilce: customerData.ilce || '',
                                varsayilan: true,
                                aktif: true,
                                olusturmaTarihi: new Date(),
                                olusturanKullanici: req.user.userId
                            }
                        }, 'CUSTOMER_ADDRESS_CREATED');
                    }

                    results.successful.push({
                        row: rowNumber,
                        customerData,
                        customer: newCustomer
                    });

                    results.statistics.created++;

                } catch (error) {
                    results.failed.push({
                        row: rowNumber,
                        customerData: row,
                        error: error.message
                    });
                    results.statistics.errors++;
                }

                results.statistics.processed++;
            }

            return results;
        });

        // Enhanced audit logging for bulk customer creation
        auditLog('BULK_CUSTOMER_UPLOAD', 'Bulk customer upload from Excel', {
            userId: req.user.userId,
            fileName: uploadedFile.originalFilename,
            fileSize: uploadedFile.size,
            totalRows: processResults.statistics.totalRows,
            created: processResults.statistics.created,
            errors: processResults.statistics.errors,
            duplicates: processResults.statistics.duplicates,
            bulkOperation: true,
            customerDataCreation: true
        });

        return res.status(200).json({
            success: true,
            message: `Customer upload completed. ${processResults.statistics.created} customers created, ${processResults.statistics.errors} errors, ${processResults.statistics.duplicates} duplicates.`,
            results: processResults,
            metadata: {
                uploadedAt: new Date(),
                uploadedBy: req.user.userId,
                fileName: uploadedFile.originalFilename,
                fileSize: uploadedFile.size
            }
        });

    } catch (error) {
        console.error('Customer Excel Upload Error:', error);

        // Enhanced audit logging for upload errors
        auditLog('CUSTOMER_EXCEL_UPLOAD_ERROR', 'Customer Excel upload failed', {
            userId: req.user.userId,
            fileName: uploadedFile?.originalFilename,
            error: error.message,
            uploadAttempt: true
        });

        return res.status(400).json({
            error: 'Customer Excel upload failed',
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

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(customerExcelUploadHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.MANAGE_CUSTOMERS, // Customer management permission

        // Method-specific permissions will be checked in handlers
        // POST: BULK_CUSTOMER_CREATION (Manager+)

        // Input Validation Configuration
        allowedFields: [], // File upload doesn't use standard fields
        requiredFields: {},

        // Security Options for File Upload
        preventSQLInjection: true,
        enableAuditLogging: true,
        fileUploadSecurity: true, // Special flag for file uploads
        bulkOperationSecurity: true, // Mark as bulk operation
        customerDataAccess: true // Mark as customer data operation
    }
); 