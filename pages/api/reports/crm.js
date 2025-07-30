/**
 * =============================================
 * SECURED CRM REPORTS API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../../lib/api-security.js';
import { withPrismaSecurity } from '../../../lib/prisma-security.js';
import { PERMISSIONS } from '../../../lib/rbac-enhanced.js';
import { auditLog } from '../../../lib/audit-logger.js';
import { validateInput } from '../../../lib/validation.js';
import {
    getSiparislerByDateRange,
    calculateBasicKPIs,
    calculateCustomerSegmentation,
    calculatePaymentMethodAnalysis,
    calculateHourlySales,
    formatters
} from '../../../lib/reports/common.js';

/**
 * CRM Reports API Handler with Full Security Integration
 */
async function crmReportsHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getCRMReportList(req, res);
            case 'POST':
                return await generateCRMReport(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST']
                });
        }
    } catch (error) {
        console.error('CRM Reports API Error:', error);

        auditLog('CRM_REPORTS_API_ERROR', 'CRM reports API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'CRM report operation failed',
            code: 'CRM_REPORTS_ERROR'
        });
    }
}

/**
 * Get Available CRM Reports and Metadata
 */
async function getCRMReportList(req, res) {
    // Permission check - CRM reports contain sensitive customer data
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to view CRM reports'
        });
    }

    // Get available CRM report types
    const crmReportMetadata = {
        availableReportTypes: [
            {
                id: 'genel',
                name: 'Genel CRM Raporu',
                description: 'Müşteri davranışları ve temel metrikleri',
                requiredPermission: 60
            },
            {
                id: 'musteri_segmentasyon',
                name: 'Müşteri Segmentasyonu',
                description: 'Müşteri grupları ve satın alma kalıpları',
                requiredPermission: 70
            },
            {
                id: 'odeme_analizi',
                name: 'Ödeme Yöntemi Analizi',
                description: 'Ödeme tercihleri ve finansal davranış',
                requiredPermission: 70
            },
            {
                id: 'musteri_yasam_dongusu',
                name: 'Müşteri Yaşam Döngüsü',
                description: 'Müşteri değeri ve sadakat analizi',
                requiredPermission: 80
            },
            {
                id: 'detayli_musteri',
                name: 'Detaylı Müşteri Profili',
                description: 'Bireysel müşteri analizi (PII erişimi)',
                requiredPermission: 80
            }
        ].filter(report => req.user.roleLevel >= report.requiredPermission),

        availableSegments: [
            { id: 'yeni_musteri', name: 'Yeni Müşteriler', description: 'Son 30 günde ilk alışveriş' },
            { id: 'sadik_musteri', name: 'Sadık Müşteriler', description: '5+ sipariş verenler' },
            { id: 'yuksek_deger', name: 'Yüksek Değer', description: 'Ortalama üzeri harcayanlar' },
            { id: 'kayip_musteri', name: 'Kayıp Müşteriler', description: '90+ gün sipariş vermeyenler' }
        ],

        privacyNotice: {
            dataRetention: '24 months',
            anonymization: req.user.roleLevel < 80,
            piiAccess: req.user.roleLevel >= 80,
            gdprCompliant: true
        }
    };

    // Get quick CRM statistics
    const quickCRMStats = await req.prisma.secureQuery('cariMusteri', 'aggregate', {
        where: {
            aktif: true,
            kayitTarihi: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
        },
        _count: { id: true }
    });

    auditLog('CRM_REPORTS_METADATA_VIEW', 'CRM reports metadata accessed', {
        userId: req.user.userId,
        availableReports: crmReportMetadata.availableReportTypes.length,
        userRoleLevel: req.user.roleLevel,
        piiAccess: req.user.roleLevel >= 80
    });

    return res.status(200).json({
        success: true,
        metadata: crmReportMetadata,
        quickStats: {
            newCustomersLast30Days: quickCRMStats._count.id
        }
    });
}

/**
 * Generate CRM Report with Enhanced Security and Privacy Protection
 */
async function generateCRMReport(req, res) {
    // Permission check - CRM reports contain sensitive customer data
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to generate CRM reports'
        });
    }

    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['startDate', 'endDate'],
        allowedFields: [
            'startDate', 'endDate', 'reportType', 'detayLevel', 'customerSegment',
            'includePII', 'anonymizeData', 'exportFormat', 'customerId'
        ],
        requireSanitization: true
    });

    if (!validationResult.isValid) {
        return res.status(400).json({
            error: 'Invalid report parameters',
            details: validationResult.errors
        });
    }

    const {
        startDate, endDate, reportType = 'genel', detayLevel = 'ozet',
        customerSegment, includePII = false, anonymizeData = true, customerId
    } = req.body;

    // Date range validation
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);

    if (start >= end) {
        return res.status(400).json({
            error: 'End date must be after start date'
        });
    }

    // Role-based date range limits
    const maxDays = req.user.roleLevel >= 80 ? 365 : req.user.roleLevel >= 70 ? 90 : 30;
    if (daysDiff > maxDays) {
        return res.status(400).json({
            error: `Date range too large. Maximum ${maxDays} days allowed for your role.`
        });
    }

    // Privacy and permission checks
    if (includePII && req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'PII access requires administrator permissions'
        });
    }

    if (reportType === 'musteri_yasam_dongusu' && req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Customer lifecycle reports require administrator permissions'
        });
    }

    if (customerId && req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Individual customer reports require administrator permissions'
        });
    }

    console.log(`🎯 Generating CRM report: ${startDate} to ${endDate}, Type: ${reportType}, User: ${req.user.userId}`);

    // Enhanced transaction for CRM report generation with privacy protection
    const reportData = await req.prisma.secureTransaction(async (tx) => {
        // Build where clause for orders
        const orderWhereClause = {
            durum: { not: 'IPTAL' },
            onaylanmaTarihi: {
                gte: start,
                lte: end
            }
        };

        // Single customer filter
        if (customerId) {
            orderWhereClause.cariMusteriId = parseInt(customerId);
        }

        // Get orders with customer data (with privacy controls)
        const siparisler = await tx.secureQuery('siparis', 'findMany', {
            where: orderWhereClause,
            select: {
                id: true,
                siparisNo: true,
                toplamTutar: true,
                durum: true,
                onaylanmaTarihi: true,
                cariMusteriId: true,

                // Customer information with privacy filtering
                cariMusteri: {
                    select: {
                        id: true,

                        // PII data only for administrators
                        ...(req.user.roleLevel >= 80 && includePII && {
                            ad: true,
                            soyad: true,
                            telefon: true,
                            email: true
                        }),

                        // Non-PII customer data
                        musteriTipi: true,
                        bolge: true,
                        kayitTarihi: true,
                        aktif: true,

                        // Anonymized identifier for non-admin users
                        ...(req.user.roleLevel < 80 && {
                            musteriKodu: true // Use this as anonymized ID
                        })
                    }
                },

                // Order items for product analysis
                siparisKalemleri: {
                    select: {
                        id: true,
                        adet: true,
                        birimFiyat: true,
                        toplamTutar: true,
                        urun: {
                            select: {
                                id: true,
                                kod: true,
                                ad: true,
                                kategori: true
                            }
                        }
                    }
                },

                // Payment information (financial data for managers+)
                ...(req.user.roleLevel >= 70 && {
                    odemeler: {
                        select: {
                            id: true,
                            tutar: true,
                            odemeYontemi: true,
                            odemeTarihi: true
                        }
                    }
                })
            }
        });

        console.log(`🎯 Found ${siparisler.length} orders for CRM analysis`);

        // Calculate CRM analytics based on type and permission level
        const crmResults = {};

        // Basic customer metrics (available for all authorized users)
        crmResults.customerMetrics = {
            totalCustomers: new Set(siparisler.map(s => s.cariMusteriId)).size,
            totalOrders: siparisler.length,
            averageOrdersPerCustomer: siparisler.length > 0 ?
                siparisler.length / new Set(siparisler.map(s => s.cariMusteriId)).size : 0,
            totalRevenue: siparisler.reduce((sum, s) => sum + (s.toplamTutar || 0), 0)
        };

        // Customer segmentation analysis
        if (req.user.roleLevel >= 70) {
            const customerGroups = {};
            siparisler.forEach(siparis => {
                const customerId = siparis.cariMusteriId;
                if (!customerGroups[customerId]) {
                    customerGroups[customerId] = {
                        customerId,
                        customer: siparis.cariMusteri,
                        orderCount: 0,
                        totalSpent: 0,
                        lastOrderDate: null,
                        orders: []
                    };
                }

                customerGroups[customerId].orderCount += 1;
                customerGroups[customerId].totalSpent += siparis.toplamTutar;
                customerGroups[customerId].orders.push(siparis);

                if (!customerGroups[customerId].lastOrderDate ||
                    siparis.onaylanmaTarihi > customerGroups[customerId].lastOrderDate) {
                    customerGroups[customerId].lastOrderDate = siparis.onaylanmaTarihi;
                }
            });

            // Customer segments
            const customerList = Object.values(customerGroups);
            const avgSpending = customerList.reduce((sum, c) => sum + c.totalSpent, 0) / customerList.length;

            crmResults.customerSegmentation = {
                newCustomers: customerList.filter(c => {
                    const daysSinceFirst = (new Date() - new Date(c.customer.kayitTarihi)) / (1000 * 60 * 60 * 24);
                    return daysSinceFirst <= 30;
                }).length,

                loyalCustomers: customerList.filter(c => c.orderCount >= 5).length,

                highValueCustomers: customerList.filter(c => c.totalSpent > avgSpending * 1.5).length,

                lostCustomers: customerList.filter(c => {
                    const daysSinceLastOrder = (new Date() - new Date(c.lastOrderDate)) / (1000 * 60 * 60 * 24);
                    return daysSinceLastOrder > 90;
                }).length,

                averageSpending: avgSpending,
                totalSegments: customerList.length
            };

            // Top customers (anonymized for non-admins)
            crmResults.topCustomers = customerList
                .sort((a, b) => b.totalSpent - a.totalSpent)
                .slice(0, 10)
                .map(customer => ({
                    customerId: req.user.roleLevel >= 80 ? customer.customerId : `CUST_${customer.customerId}`,
                    ...(req.user.roleLevel >= 80 && includePII && {
                        name: `${customer.customer.ad} ${customer.customer.soyad}`,
                        contact: customer.customer.telefon
                    }),
                    orderCount: customer.orderCount,
                    totalSpent: customer.totalSpent,
                    averageOrderValue: customer.totalSpent / customer.orderCount,
                    lastOrderDate: customer.lastOrderDate,
                    customerType: customer.customer.musteriTipi
                }));
        }

        // Payment method analysis for managers+
        if (req.user.roleLevel >= 70) {
            const paymentMethods = {};
            siparisler.forEach(siparis => {
                if (siparis.odemeler) {
                    siparis.odemeler.forEach(odeme => {
                        const method = odeme.odemeYontemi || 'BELIRTILMEMIS';
                        if (!paymentMethods[method]) {
                            paymentMethods[method] = {
                                count: 0,
                                totalAmount: 0
                            };
                        }
                        paymentMethods[method].count += 1;
                        paymentMethods[method].totalAmount += odeme.tutar;
                    });
                }
            });

            crmResults.paymentAnalysis = Object.entries(paymentMethods).map(([method, data]) => ({
                method,
                count: data.count,
                totalAmount: data.totalAmount,
                percentage: (data.count / siparisler.length) * 100
            }));
        }

        // Product preferences analysis
        const productStats = {};
        siparisler.forEach(siparis => {
            siparis.siparisKalemleri.forEach(kalem => {
                const key = kalem.urun.kategori || 'DIGER';
                if (!productStats[key]) {
                    productStats[key] = {
                        category: key,
                        orderCount: 0,
                        totalQuantity: 0,
                        totalRevenue: 0
                    };
                }
                productStats[key].orderCount += 1;
                productStats[key].totalQuantity += kalem.adet;
                productStats[key].totalRevenue += kalem.toplamTutar;
            });
        });

        crmResults.categoryPreferences = Object.values(productStats)
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 10);

        return {
            reportInfo: {
                generatedAt: new Date(),
                generatedBy: req.user.userId,
                reportType,
                detayLevel,
                dateRange: { startDate, endDate },
                totalOrders: siparisler.length,
                dataPrivacy: {
                    anonymized: req.user.roleLevel < 80 || anonymizeData,
                    piiIncluded: req.user.roleLevel >= 80 && includePII,
                    gdprCompliant: true
                }
            },
            data: crmResults
        };
    });

    // Enhanced audit logging for sensitive customer data access
    auditLog('CRM_REPORT_GENERATED', 'CRM report generated', {
        userId: req.user.userId,
        reportType,
        detayLevel,
        dateRange: { startDate, endDate },
        totalOrders: reportData.reportInfo.totalOrders,
        piiAccess: includePII && req.user.roleLevel >= 80,
        customerSpecific: !!customerId,
        sensitiveOperation: true,
        businessIntelligence: true,
        customerDataAccess: true
    });

    return res.status(200).json({
        success: true,
        message: 'CRM report generated successfully',
        report: reportData
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(crmReportsHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_REPORTS, // Base permission for viewing reports

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_REPORTS (Supervisor+)
        // POST: GENERATE_REPORTS (Supervisor+, with role-based PII limitations)

        // Input Validation Configuration
        allowedFields: [
            'startDate', 'endDate', 'reportType', 'detayLevel', 'customerSegment',
            'includePII', 'anonymizeData', 'exportFormat', 'customerId'
        ],
        requiredFields: {
            POST: ['startDate', 'endDate']
        },

        // Security Options for Customer Data
        preventSQLInjection: true,
        enableAuditLogging: true,
        sensitiveDataAccess: true, // Mark as sensitive customer data
        businessIntelligence: true, // Special flag for BI data
        customerDataAccess: true, // Special flag for customer PII
        gdprCompliant: true // GDPR compliance flag
    }
); 