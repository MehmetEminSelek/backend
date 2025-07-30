/**
 * =============================================
 * SECURED SALES REPORTS API - FULL SECURITY INTEGRATION
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
    calculateDailySalesTrend,
    calculateSubePerformance,
    calculateProductPerformance,
    calculateCategoryDistribution,
    formatters
} from '../../../lib/reports/common.js';

/**
 * Sales Reports API Handler with Full Security Integration
 */
async function salesReportsHandler(req, res) {
    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                return await getSalesReportList(req, res);
            case 'POST':
                return await generateSalesReport(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST']);
                return res.status(405).json({
                    error: 'Method not allowed',
                    allowed: ['GET', 'POST']
                });
        }
    } catch (error) {
        console.error('Sales Reports API Error:', error);

        auditLog('SALES_REPORTS_API_ERROR', 'Sales reports API operation failed', {
            userId: req.user?.userId,
            method,
            error: error.message
        });

        return res.status(500).json({
            error: 'Sales report operation failed',
            code: 'SALES_REPORTS_ERROR'
        });
    }
}

/**
 * Get Available Sales Reports and Metadata
 */
async function getSalesReportList(req, res) {
    // Permission check - Sales reports are sensitive business data
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to view sales reports'
        });
    }

    // Get available report types and date ranges
    const reportMetadata = {
        availableReportTypes: [
            {
                id: 'genel',
                name: 'Genel Satış Raporu',
                description: 'Toplu satış verileri ve KPI\'lar',
                requiredPermission: 60
            },
            {
                id: 'detayli',
                name: 'Detaylı Satış Analizi',
                description: 'Ürün bazlı detaylı satış analizi',
                requiredPermission: 70
            },
            {
                id: 'finansal',
                name: 'Finansal Performans',
                description: 'Kar/zarar ve maliyet analizi',
                requiredPermission: 80
            },
            {
                id: 'sube',
                name: 'Şube Performansı',
                description: 'Şube bazlı satış karşılaştırması',
                requiredPermission: 70
            }
        ].filter(report => req.user.roleLevel >= report.requiredPermission),

        availableDetailLevels: [
            { id: 'ozet', name: 'Özet', description: 'Temel KPI\'lar' },
            { id: 'orta', name: 'Orta', description: 'Kategori ve ürün bazlı' },
            { id: 'detayli', name: 'Detaylı', description: 'Tüm veriler (sadece yöneticiler)' }
        ].filter(level => level.id !== 'detayli' || req.user.roleLevel >= 80),

        dateRangeInfo: {
            maxRangeDays: req.user.roleLevel >= 80 ? 365 : req.user.roleLevel >= 70 ? 90 : 30,
            suggestedRanges: [
                { name: 'Son 7 Gün', days: 7 },
                { name: 'Son 30 Gün', days: 30 },
                { name: 'Bu Ay', type: 'currentMonth' },
                { name: 'Geçen Ay', type: 'lastMonth' }
            ]
        }
    };

    // Get quick statistics for dashboard
    const quickStats = await req.prisma.secureQuery('siparis', 'aggregate', {
        where: {
            durum: { not: 'IPTAL' },
            onaylanmaTarihi: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
        },
        _count: { id: true },
        _sum: { toplamTutar: true },
        _avg: { toplamTutar: true }
    });

    auditLog('SALES_REPORTS_METADATA_VIEW', 'Sales reports metadata accessed', {
        userId: req.user.userId,
        availableReports: reportMetadata.availableReportTypes.length,
        userRoleLevel: req.user.roleLevel
    });

    return res.status(200).json({
        success: true,
        metadata: reportMetadata,
        quickStats: {
            last30Days: {
                totalOrders: quickStats._count.id,
                totalRevenue: quickStats._sum.toplamTutar || 0,
                averageOrderValue: quickStats._avg.toplamTutar || 0
            }
        }
    });
}

/**
 * Generate Sales Report with Enhanced Security and Validation
 */
async function generateSalesReport(req, res) {
    // Permission check - Sales reports are sensitive business data
    if (req.user.roleLevel < 60) {
        return res.status(403).json({
            error: 'Insufficient permissions to generate sales reports'
        });
    }

    // Input validation with security checks
    const validationResult = validateInput(req.body, {
        requiredFields: ['startDate', 'endDate'],
        allowedFields: [
            'startDate', 'endDate', 'reportType', 'detayLevel', 'subeId',
            'kategoriId', 'urunId', 'includeFinancials', 'exportFormat'
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
        subeId, kategoriId, urunId, includeFinancials = false, exportFormat = 'json'
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

    // Permission checks for advanced report types
    if (reportType === 'finansal' && req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Financial reports require administrator permissions'
        });
    }

    if (detayLevel === 'detayli' && req.user.roleLevel < 80) {
        return res.status(403).json({
            error: 'Detailed reports require administrator permissions'
        });
    }

    if (includeFinancials && req.user.roleLevel < 70) {
        return res.status(403).json({
            error: 'Financial data access requires manager permissions'
        });
    }

    console.log(`📊 Generating sales report: ${startDate} to ${endDate}, Type: ${reportType}, User: ${req.user.userId}`);

    // Enhanced transaction for report generation
    const reportData = await req.prisma.secureTransaction(async (tx) => {
        // Get orders with security filtering
        const whereClause = {
            durum: { not: 'IPTAL' },
            onaylanmaTarihi: {
                gte: start,
                lte: end
            }
        };

        // Add filters based on parameters
        if (subeId) {
            whereClause.subeId = parseInt(subeId);
        }

        // Get orders data
        const siparisler = await tx.secureQuery('siparis', 'findMany', {
            where: whereClause,
            select: {
                id: true,
                siparisNo: true,
                toplamTutar: true,
                durum: true,
                onaylanmaTarihi: true,
                subeId: true,

                // Include financial data only for authorized users
                ...(req.user.roleLevel >= 70 && {
                    maliyetToplami: true,
                    karMarji: true,
                    indirimTutari: true
                }),

                // Order items with security filtering
                siparisKalemleri: {
                    select: {
                        id: true,
                        adet: true,
                        birimFiyat: true,
                        toplamTutar: true,
                        urunId: true,

                        // Product information
                        urun: {
                            select: {
                                id: true,
                                ad: true,
                                kod: true,
                                kategori: true,

                                // Include cost data only for managers+
                                ...(req.user.roleLevel >= 70 && {
                                    maliyetFiyat: true
                                })
                            }
                        }
                    },
                    where: {
                        ...(kategoriId && { urun: { kategoriId: parseInt(kategoriId) } }),
                        ...(urunId && { urunId: parseInt(urunId) })
                    }
                },

                // Branch information (if accessible)
                ...(req.user.roleLevel >= 60 && {
                    sube: {
                        select: {
                            id: true,
                            ad: true,
                            kod: true
                        }
                    }
                })
            }
        });

        console.log(`📊 Found ${siparisler.length} orders for report`);

        // Calculate report data based on type and permission level
        const reportResults = {};

        // Basic KPIs (available for all authorized users)
        reportResults.basicKPIs = calculateBasicKPIs(siparisler);

        // Daily sales trend
        reportResults.dailyTrend = calculateDailySalesTrend(siparisler, start, end);

        // Advanced analytics for managers+
        if (req.user.roleLevel >= 70) {
            reportResults.subePerformance = calculateSubePerformance(siparisler);
            reportResults.productPerformance = calculateProductPerformance(siparisler);
            reportResults.categoryDistribution = calculateCategoryDistribution(siparisler);
        }

        // Financial analytics for administrators only
        if (req.user.roleLevel >= 80 && includeFinancials) {
            reportResults.financialAnalysis = {
                totalRevenue: siparisler.reduce((sum, s) => sum + (s.toplamTutar || 0), 0),
                totalCosts: siparisler.reduce((sum, s) => sum + (s.maliyetToplami || 0), 0),
                totalProfitMargin: siparisler.reduce((sum, s) => sum + (s.karMarji || 0), 0),
                averageOrderValue: siparisler.length > 0 ?
                    siparisler.reduce((sum, s) => sum + (s.toplamTutar || 0), 0) / siparisler.length : 0
            };
        }

        // Top selling products
        const productStats = {};
        siparisler.forEach(siparis => {
            siparis.siparisKalemleri.forEach(kalem => {
                const key = kalem.urun.kod;
                if (!productStats[key]) {
                    productStats[key] = {
                        urun: kalem.urun,
                        totalQuantity: 0,
                        totalRevenue: 0,
                        orderCount: 0
                    };
                }
                productStats[key].totalQuantity += kalem.adet;
                productStats[key].totalRevenue += kalem.toplamTutar;
                productStats[key].orderCount += 1;
            });
        });

        reportResults.topProducts = Object.values(productStats)
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
                filters: { subeId, kategoriId, urunId }
            },
            data: reportResults
            };
        });

    // Enhanced audit logging for sensitive business intelligence access
    auditLog('SALES_REPORT_GENERATED', 'Sales report generated', {
        userId: req.user.userId,
        reportType,
        detayLevel,
        dateRange: { startDate, endDate },
        totalOrders: reportData.reportInfo.totalOrders,
        includeFinancials,
        filters: { subeId, kategoriId, urunId },
        sensitiveOperation: true,
        businessIntelligence: true
    });

    return res.status(200).json({
        success: true,
        message: 'Sales report generated successfully',
        report: reportData
    });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
    withPrismaSecurity(salesReportsHandler),
    {
        // RBAC Configuration
        permission: PERMISSIONS.VIEW_REPORTS, // Base permission for viewing reports

        // Method-specific permissions will be checked in handlers
        // GET: VIEW_REPORTS (Supervisor+)
        // POST: GENERATE_REPORTS (Supervisor+, with role-based limitations)

        // Input Validation Configuration
        allowedFields: [
            'startDate', 'endDate', 'reportType', 'detayLevel', 'subeId',
            'kategoriId', 'urunId', 'includeFinancials', 'exportFormat'
        ],
        requiredFields: {
            POST: ['startDate', 'endDate']
        },

        // Security Options for Business Intelligence Data
        preventSQLInjection: true,
        enableAuditLogging: true,
        sensitiveDataAccess: true, // Mark as sensitive business intelligence
        businessIntelligence: true // Special flag for BI data
    }
); 