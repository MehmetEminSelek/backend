/**
 * =============================================
 * SECURED USER TEMPLATE DOWNLOAD API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../../lib/audit-logger.js';
import { validateInput } from '../../../../lib/validation.js';
import XLSX from 'xlsx';

/**
 * User Template Download API Handler with Full Security Integration
 */
async function userTemplateHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await generateUserTemplate(req, res);
            default:
                res.setHeader('Allow', ['GET']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET']
                });
        }
    } catch (error) {
        console.error('User Template API Error:', error);

        auditLog('USER_TEMPLATE_ERROR', 'User template download failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'User template operation failed',
            code: 'USER_TEMPLATE_ERROR'
        });
    }
}

/**
 * Generate User Template with Enhanced Security
 */
async function generateUserTemplate(req, res) {
    // Permission check - Only administrators can download user templates
    if (req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Insufficient permissions to download user template'
        });
    }

    const {
        includeExamples = false,
        includeInstructions = true,
        format = 'xlsx'
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: ['includeExamples', 'includeInstructions', 'format'],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid template parameters',
            details: validationResult.errors
        });
    }

    // Validate format
    const validFormats = ['xlsx', 'xls'];
    const fileFormat = validFormats.includes(format) ? format : 'xlsx';

    console.log('GET /api/excel/template/kullanici request received...');

    try {
        // Template headers with Turkish names for user upload
        const headers = [
            'ADI SOYADI',           // Required
            'SGK DURUMU',           // Optional
            'GİRİŞ YILI',          // Optional
            'ŞUBE',                 // Optional - will be created if not exists
            'ERP PASİF AKTİF',     // Optional - AKTİF/PASİF
            'ROL',                  // Optional - ADMIN/MANAGER/SUPERVISOR/OPERATOR/VIEWER
            'TELEFON',              // Optional but recommended
            'EMAIL',                // Optional but recommended
            'GÜNLÜK ÜCRET',        // Optional - numeric
            'BAŞLANGIÇ TARİHİ'     // Optional - date format
        ];

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Main template sheet
        const templateData = [headers];

        // Add example rows if requested
        if (includeExamples === 'true') {
            templateData.push(
                [
                    'Ahmet Yılmaz',
                    'Sigortalı',
                    2023,
                    'Merkez Şube',
                    'AKTİF',
                    'OPERATOR',
                    '+90 555 123 4567',
                    'ahmet.yilmaz@email.com',
                    350.50,
                    '2023-01-15'
                ],
                [
                    'Fatma Kaya',
                    'Sigortalı',
                    2022,
                    'İstanbul Şube',
                    'AKTİF',
                    'SUPERVISOR',
                    '+90 555 765 4321',
                    'fatma.kaya@email.com',
                    450.75,
                    '2022-06-01'
                ],
                [
                    'Mehmet Demir',
                    'Sigortasız',
                    2024,
                    'Ankara Şube',
                    'PASİF',
                    'MANAGER',
                    '+90 555 987 6543',
                    'mehmet.demir@email.com',
                    600.00,
                    '2024-01-01'
                ]
            );
        }

        // Create main worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(templateData);

        // Set column widths for better readability
        const columnWidths = [
            { wch: 20 }, // ADI SOYADI
            { wch: 15 }, // SGK DURUMU
            { wch: 12 }, // GİRİŞ YILI
            { wch: 18 }, // ŞUBE
            { wch: 15 }, // ERP PASİF AKTİF
            { wch: 12 }, // ROL
            { wch: 18 }, // TELEFON
            { wch: 25 }, // EMAIL
            { wch: 15 }, // GÜNLÜK ÜCRET
            { wch: 18 }  // BAŞLANGIÇ TARİHİ
        ];
        worksheet['!cols'] = columnWidths;

        // Add data validation and formatting
        const range = XLSX.utils.decode_range(worksheet['!ref']);

        // Header row formatting (would need additional styling library for full formatting)
        // For now, we'll add comments to guide users

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Kullanici_Sablonu');

        // Instructions sheet if requested
        if (includeInstructions === 'true') {
            const instructionsData = [
                ['KULLANICI TOPLU YÜKLEME TALİMATLARI'],
                [''],
                ['GENEL BİLGİLER:'],
                ['• Bu Excel dosyasını kullanarak sistemе toplu kullanıcı ekleyebilirsiniz'],
                ['• Dosya maksimum 1000 kullanıcı içerebilir'],
                ['• İlk satır başlık satırıdır, değiştirmeyin'],
                ['• Gerekli alan: ADI SOYADI'],
                [''],
                ['ALAN AÇIKLAMALARI:'],
                ['ADI SOYADI: Kullanıcının tam adı (Zorunlu)'],
                ['SGK DURUMU: Sigortalı/Sigortasız (İsteğe bağlı)'],
                ['GİRİŞ YILI: İşe giriş yılı, sayı olarak (İsteğe bağlı)'],
                ['ŞUBE: Şube adı, yoksa otomatik oluşturulur (İsteğe bağlı)'],
                ['ERP PASİF AKTİF: AKTİF veya PASİF (Varsayılan: AKTİF)'],
                ['ROL: ADMIN, MANAGER, SUPERVISOR, OPERATOR, VIEWER (Varsayılan: OPERATOR)'],
                ['TELEFON: +90 555 123 4567 formatında (İsteğe bağlı ama önerilen)'],
                ['EMAIL: Geçerli email adresi (İsteğe bağlı ama önerilen)'],
                ['GÜNLÜK ÜCRET: Sayısal değer, ondalık için nokta kullanın (İsteğe bağlı)'],
                ['BAŞLANGIÇ TARİHİ: YYYY-MM-DD formatında (İsteğe bağlı)'],
                [''],
                ['GÜVENLİK BİLGİLERİ:'],
                ['• Kullanıcılar varsayılan geçici şifre ile oluşturulur'],
                ['• İlk girişte şifre değişimi zorunludur'],
                ['• Aynı telefon/email/ad ile kullanıcı varsa eklenmez'],
                ['• Rol seviyeleri: ADMIN(90), MANAGER(70), SUPERVISOR(60), OPERATOR(40), VIEWER(20)'],
                [''],
                ['DOSYA GÜVENLİĞİ:'],
                ['• Sadece .xlsx ve .xls dosyaları kabul edilir'],
                ['• Maksimum dosya boyutu: 5MB'],
                ['• Virüs taraması yapılır'],
                ['• İşlem sonrası dosya güvenli şekilde silinir']
            ];

            const instructionsWorksheet = XLSX.utils.aoa_to_sheet(instructionsData);

            // Set column width for instructions
            instructionsWorksheet['!cols'] = [{ wch: 80 }];

            XLSX.utils.book_append_sheet(workbook, instructionsWorksheet, 'Talimatlar');
        }

        // Generate file buffer
        const fileBuffer = XLSX.write(workbook, {
            type: 'buffer',
            bookType: fileFormat,
            compression: true
        });

        // Set secure response headers
        const fileName = `kullanici-yukle-sablonu-${new Date().toISOString().split('T')[0]}.${fileFormat}`;

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Enhanced audit logging for template download
        auditLog('USER_TEMPLATE_DOWNLOAD', 'User template downloaded', {
            userId: req.user.userId,
            fileName,
            fileSize: fileBuffer.length,
            includeExamples: includeExamples === 'true',
            includeInstructions: includeInstructions === 'true',
            format: fileFormat,
            templateDownload: true
        });

        return res.send(fileBuffer);

    } catch (error) {
        console.error('User Template Generation Error:', error);

        auditLog('USER_TEMPLATE_ERROR', 'User template generation failed', {
            userId: req.user.userId,
            error: error.message,
            templateAttempt: true
        });

        return res.status(500).json({
            error: 'Template generation failed',
            details: error.message
        });
    }
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(userTemplateHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.MANAGE_USERS, // User management permission

        // Method-specific permissions will be checked in handlers
        // GET: USER_TEMPLATE_DOWNLOAD (Admin+)

        // Input Validation Configuration
        allowedFields: ['includeExamples', 'includeInstructions', 'format'],
        requiredFields: {},

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true,
        templateGeneration: true, // Special flag for template operations
        userDataAccess: true // Mark as user data operation
    }
); 