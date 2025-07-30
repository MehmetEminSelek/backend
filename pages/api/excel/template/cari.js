/**
 * =============================================
 * SECURED CUSTOMER TEMPLATE DOWNLOAD API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../../lib/audit-logger.js';
import { validateInput } from '../../../../lib/validation.js';
import XLSX from 'xlsx';

/**
 * Customer Template Download API Handler with Full Security Integration
 */
async function customerTemplateHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await generateCustomerTemplate(req, res);
            default:
                res.setHeader('Allow', ['GET']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET']
                });
        }
    } catch (error) {
        console.error('Customer Template API Error:', error);

        auditLog('CUSTOMER_TEMPLATE_ERROR', 'Customer template download failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Customer template operation failed',
            code: 'CUSTOMER_TEMPLATE_ERROR'
        });
    }
}

/**
 * Generate Customer Template with Enhanced Security
 */
async function generateCustomerTemplate(req, res) {
    // Permission check - Managers+ can download customer templates
    if (req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Insufficient permissions to download customer template'
        });
    }

    const {
        includeExamples = false,
        includeInstructions = true,
        format = 'xlsx',
        includeAddressFields = true
    } = req.query;

    // Input validation
    const validationResult = validateInput(req.query, {
        allowedFields: ['includeExamples', 'includeInstructions', 'format', 'includeAddressFields'],
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

    console.log('GET /api/excel/template/cari request received...');

    try {
        // Template headers with Turkish names for customer upload
        const basicHeaders = [
            'CARİ ADI',             // Required
            'MÜŞTERİ KODU',        // Optional - auto-generated if empty
            'ŞUBE ADI',             // Optional - will be created if not exists
            'TEL',                  // Required
            'EMAIL',                // Optional but recommended
            'MÜŞTERİ TİPİ',        // Optional - BIREYSEL/KURUMSAL/BAYİ/DİĞER
            'BÖLGE'                 // Optional
        ];

        const addressHeaders = [
            'ADRES',                // Optional
            'İL',                   // Optional
            'İLÇE'                  // Optional
        ];

        // Combine headers based on options
        const headers = [
            ...basicHeaders,
            ...(includeAddressFields === 'true' ? addressHeaders : [])
        ];

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Main template sheet
        const templateData = [headers];

        // Add example rows if requested
        if (includeExamples === 'true') {
            const exampleRows = [
                [
                    'Ahmet Yılmaz',
                    'AY001',
                    'Merkez Şube',
                    '+90 555 123 4567',
                    'ahmet.yilmaz@email.com',
                    'BIREYSEL',
                    'İstanbul',
                    ...(includeAddressFields === 'true' ? [
                        'Kadıköy Mahallesi, Bağdat Caddesi No:123',
                        'İstanbul',
                        'Kadıköy'
                    ] : [])
                ],
                [
                    'ABC Şirketi',
                    'ABC001',
                    'İstanbul Şube',
                    '+90 212 555 0123',
                    'info@abcsirketi.com',
                    'KURUMSAL',
                    'Marmara',
                    ...(includeAddressFields === 'true' ? [
                        'Atatürk Mahallesi, İş Merkezi Blok A Kat:5',
                        'İstanbul',
                        'Şişli'
                    ] : [])
                ],
                [
                    'Fatma Kaya Pastanesi',
                    '',  // Will be auto-generated
                    'Ankara Şube',
                    '+90 312 555 7890',
                    'fatma@pastane.com',
                    'BAYİ',
                    'İç Anadolu',
                    ...(includeAddressFields === 'true' ? [
                        'Çankaya Mahallesi, Pastane Sokak No:45',
                        'Ankara',
                        'Çankaya'
                    ] : [])
                ]
            ];

            templateData.push(...exampleRows);
        }

        // Create main worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(templateData);

        // Set column widths for better readability
        const basicWidths = [
            { wch: 25 }, // CARİ ADI
            { wch: 15 }, // MÜŞTERİ KODU
            { wch: 18 }, // ŞUBE ADI
            { wch: 18 }, // TEL
            { wch: 30 }, // EMAIL
            { wch: 15 }, // MÜŞTERİ TİPİ
            { wch: 15 }  // BÖLGE
        ];

        const addressWidths = [
            { wch: 40 }, // ADRES
            { wch: 12 }, // İL
            { wch: 15 }  // İLÇE
        ];

        const columnWidths = [
            ...basicWidths,
            ...(includeAddressFields === 'true' ? addressWidths : [])
        ];

        worksheet['!cols'] = columnWidths;

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Cari_Sablonu');

        // Instructions sheet if requested
        if (includeInstructions === 'true') {
            const instructionsData = [
                ['CARİ MÜŞTERİ TOPLU YÜKLEME TALİMATLARI'],
                [''],
                ['GENEL BİLGİLER:'],
                ['• Bu Excel dosyasını kullanarak sisteme toplu müşteri ekleyebilirsiniz'],
                ['• Dosya maksimum 2000 müşteri içerebilir'],
                ['• İlk satır başlık satırıdır, değiştirmeyin'],
                ['• Gerekli alanlar: CARİ ADI, TEL'],
                [''],
                ['ALAN AÇIKLAMALARI:'],
                ['CARİ ADI: Müşterinin tam adı veya firma adı (Zorunlu)'],
                ['MÜŞTERİ KODU: Eşsiz müşteri kodu, boşsa otomatik oluşturulur (İsteğe bağlı)'],
                ['ŞUBE ADI: Şube adı, yoksa otomatik oluşturulur (İsteğe bağlı)'],
                ['TEL: Telefon numarası +90 555 123 4567 formatında (Zorunlu)'],
                ['EMAIL: Geçerli email adresi (İsteğe bağlı ama önerilen)'],
                ['MÜŞTERİ TİPİ: BIREYSEL, KURUMSAL, BAYİ, DİĞER (Varsayılan: BIREYSEL)'],
                ['BÖLGE: Müşterinin bulunduğu bölge (İsteğe bağlı)'],
                ...(includeAddressFields === 'true' ? [
                    ['ADRES: Detaylı adres bilgisi (İsteğe bağlı)'],
                    ['İL: İl adı (İsteğe bağlı)'],
                    ['İLÇE: İlçe adı (İsteğe bağlı)']
                ] : []),
                [''],
                ['DOĞRULAMA KURALLARI:'],
                ['• Telefon numarası benzersiz olmalıdır'],
                ['• Email adresi benzersiz olmalıdır (varsa)'],
                ['• Müşteri kodu benzersiz olmalıdır (varsa)'],
                ['• Telefon formatı: 10-15 haneli, +, -, (, ), boşluk içerebilir'],
                ['• Email formatı: geçerli email adresi olmalıdır'],
                [''],
                ['OTOMATİK İŞLEMLER:'],
                ['• Müşteri kodu boşsa: Ad(3harf) + Telefon(3rakam) + Zaman(3rakam) ile oluşturulur'],
                ['• Şube yoksa: Girilen şube adı ile yeni şube oluşturulur'],
                ['• Ad boşlukla ayrılırsa: İlk kelime "ad", geri kalanı "soyad" olur'],
                ['• Varsayılan adres oluşturulur (adres bilgisi varsa)'],
                [''],
                ['GÜVENLİK BİLGİLERİ:'],
                ['• Aynı telefon/email/kod ile müşteri varsa eklenmez'],
                ['• Tüm veriler güvenli şekilde şifrelenir'],
                ['• GDPR uyumlu veri işleme yapılır'],
                ['• İşlem logları tutulur'],
                [''],
                ['DOSYA GÜVENLİĞİ:'],
                ['• Sadece .xlsx ve .xls dosyaları kabul edilir'],
                ['• Maksimum dosya boyutu: 5MB'],
                ['• Virüs taraması yapılır'],
                ['• İşlem sonrası dosya güvenli şekilde silinir'],
                [''],
                ['ÖRNEK VERİLER:'],
                ['Bireysel: Ahmet Yılmaz | AY001 | +90 555 123 4567 | BİREYSEL'],
                ['Kurumsal: ABC Şirketi | ABC001 | +90 212 555 0123 | KURUMSAL'],
                ['Bayi: Fatma Pastanesi | [otomatik] | +90 312 555 7890 | BAYİ']
            ];

            const instructionsWorksheet = XLSX.utils.aoa_to_sheet(instructionsData);

            // Set column width for instructions
            instructionsWorksheet['!cols'] = [{ wch: 85 }];

            XLSX.utils.book_append_sheet(workbook, instructionsWorksheet, 'Talimatlar');
        }

        // Customer types reference sheet
        const customerTypesData = [
            ['MÜŞTERİ TİPLERİ REHBERİ'],
            [''],
            ['Tip', 'Açıklama', 'Örnek'],
            ['BIREYSEL', 'Bireysel müşteriler', 'Ahmet Yılmaz'],
            ['KURUMSAL', 'Kurumsal müşteriler', 'ABC Şirketi Ltd.'],
            ['BAYİ', 'Bayi ve distribütörler', 'XYZ Bayi'],
            ['DİĞER', 'Diğer müşteri tipleri', 'Dernekler, Vakıflar']
        ];

        const customerTypesWorksheet = XLSX.utils.aoa_to_sheet(customerTypesData);
        customerTypesWorksheet['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 25 }];

        XLSX.utils.book_append_sheet(workbook, customerTypesWorksheet, 'Musteri_Tipleri');

        // Generate file buffer
        const fileBuffer = XLSX.write(workbook, {
            type: 'buffer',
            bookType: fileFormat,
            compression: true
        });

        // Set secure response headers
        const fileName = `cari-musteri-yukle-sablonu-${new Date().toISOString().split('T')[0]}.${fileFormat}`;

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Enhanced audit logging for template download
        auditLog('CUSTOMER_TEMPLATE_DOWNLOAD', 'Customer template downloaded', {
            userId: req.user.userId,
            fileName,
            fileSize: fileBuffer.length,
            includeExamples: includeExamples === 'true',
            includeInstructions: includeInstructions === 'true',
            includeAddressFields: includeAddressFields === 'true',
            format: fileFormat,
            templateDownload: true
        });

        return res.send(fileBuffer);

    } catch (error) {
        console.error('Customer Template Generation Error:', error);

        auditLog('CUSTOMER_TEMPLATE_ERROR', 'Customer template generation failed', {
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
    withPrismaSecurity(customerTemplateHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.MANAGE_CUSTOMERS, // Customer management permission

        // Method-specific permissions will be checked in handlers
        // GET: CUSTOMER_TEMPLATE_DOWNLOAD (Manager+)

        // Input Validation Configuration
        allowedFields: ['includeExamples', 'includeInstructions', 'format', 'includeAddressFields'],
        requiredFields: {},

        // Security Options
        preventSQLInjection: true,
        enableAuditLogging: true,
        templateGeneration: true, // Special flag for template operations
        customerDataAccess: true // Mark as customer data operation
    }
); 