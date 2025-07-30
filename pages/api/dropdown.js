/**
 * =============================================
 * SECURED DROPDOWN API - FULL SECURITY INTEGRATION
 * =============================================
 */

import { secureAPI } from '../../lib/api-security.js';
import { withPrismaSecurity } from '../../lib/prisma-security.js';
import { PERMISSIONS } from '../../lib/rbac-enhanced.js';
import { auditLog } from '../../lib/audit-logger.js';
import { validateInput } from '../../lib/validation.js';

/**
 * Dropdown API Handler with Full Security Integration
 */
async function dropdownHandler(req, res) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET':
        return await getDropdownData(req, res);
      default:
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({
          error: 'Method not allowed',
          allowed: ['GET']
        });
    }
  } catch (error) {
    console.error('Dropdown API Error:', error);

    auditLog('DROPDOWN_API_ERROR', 'Dropdown API operation failed', {
      userId: req.user?.userId,
      method,
      error: error.message
    });

    return res.status(500).json({
      error: 'Dropdown data operation failed',
      code: 'DROPDOWN_ERROR'
    });
  }
}

/**
 * Get Dropdown Data with Role-based Filtering
 */
async function getDropdownData(req, res) {
  const {
    category,
    includeInactive = false,
    format = 'detailed'
  } = req.query;

  // Input validation
  const validationResult = validateInput(req.query, {
    allowedFields: ['category', 'includeInactive', 'format'],
    requireSanitization: true
  });

  if (!validationResult.isValid) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: validationResult.errors
    });
  }

  console.log('GET /api/dropdown request received...');

  // Enhanced security transaction for dropdown data
  const dropdownData = await req.prisma.secureTransaction(async (tx) => {
    const results = {};

    // Base where clause for active records
    const activeWhere = includeInactive === 'true' ? {} : { aktif: true };

    // Delivery types - Available for all users
    if (!category || category === 'teslimat') {
      results.teslimatTurleri = await tx.secureQuery('teslimatTuru', 'findMany', {
        where: activeWhere,
        select: {
          id: true,
          ad: true,
          kod: true,
          aktif: true,
          ...(format === 'detailed' && {
            aciklama: true,
            varsayilan: true
          })
        },
        orderBy: { ad: 'asc' }
      });
    }

    // Branches - Role-based access
    if ((!category || category === 'subeler') && req.user.roleLevel >= 50) {
      results.subeler = await tx.secureQuery('sube', 'findMany', {
        where: activeWhere,
        select: {
          id: true,
          ad: true,
          kod: true,
          aktif: true,
          ...(format === 'detailed' && req.user.roleLevel >= 60 && {
            adres: true,
            telefon: true,
            email: true
          })
        },
        orderBy: { ad: 'asc' }
      });
    }

    // Products - Basic info for operators+
    if ((!category || category === 'urunler') && req.user.roleLevel >= 40) {
      results.urunler = await tx.secureQuery('urun', 'findMany', {
        where: {
          ...activeWhere,
          satisaUygun: true
        },
        select: {
          id: true,
          ad: true,
          kod: true,
          kategori: true,
          birim: true,
          aktif: true,

          // Price info only for supervisors+
          ...(req.user.roleLevel >= 60 && {
            guncelFiyat: true
          }),

          // Stock info for inventory managers
          ...(req.user.roleLevel >= 60 && format === 'detailed' && {
            mevcutStok: true,
            minStok: true
          })
        },
        orderBy: [
          { kategori: 'asc' },
          { ad: 'asc' }
        ]
      });
    }

    // Materials - For production staff+
    if ((!category || category === 'materials') && req.user.roleLevel >= 50) {
      results.materials = await tx.secureQuery('material', 'findMany', {
        where: activeWhere,
        select: {
          id: true,
          ad: true,
          kod: true,
          tipi: true,
          birim: true,
          aktif: true,

          // Price and supplier info only for managers+
          ...(req.user.roleLevel >= 70 && format === 'detailed' && {
            birimFiyat: true,
            tedarikci: true
          })
        },
        orderBy: [
          { tipi: 'asc' },
          { ad: 'asc' }
        ]
      });
    }

    // Customers - Role-based PII protection
    if ((!category || category === 'cariler') && req.user.roleLevel >= 50) {
      results.cariler = await tx.secureQuery('cariMusteri', 'findMany', {
        where: activeWhere,
          select: {
            id: true,
          musteriKodu: true,
          musteriTipi: true,
          bolge: true,
          aktif: true,

          // PII data only for managers+
          ...(req.user.roleLevel >= 70 && {
            ad: true,
            soyad: true,
            sirketAdi: true
          }),

          // Contact info only for administrators
          ...(req.user.roleLevel >= 80 && format === 'detailed' && {
            telefon: true,
            email: true
          })
        },
        orderBy: { musteriKodu: 'asc' }
      });
    }

    // Categories - Available for all users
    if (!category || category === 'kategoriler') {
      results.kategoriler = await tx.secureQuery('kategori', 'findMany', {
        where: activeWhere,
              select: {
                id: true,
          ad: true,
          kod: true,
          aktif: true,
          ...(format === 'detailed' && {
            aciklama: true,
            parentId: true
          })
        },
        orderBy: { ad: 'asc' }
      });
    }

    // Payment methods - Financial data for supervisors+
    if ((!category || category === 'odeme_yontemleri') && req.user.roleLevel >= 60) {
      results.odemeYontemleri = [
        { kod: 'NAKIT', ad: 'Nakit', aktif: true },
        { kod: 'KART', ad: 'Kredi/Banka Kartı', aktif: true },
        { kod: 'HAVALE', ad: 'Havale/EFT', aktif: true },
        { kod: 'CEK', ad: 'Çek', aktif: true },
        { kod: 'VADELI', ad: 'Vadeli Ödeme', aktif: true },
        { kod: 'DIGER', ad: 'Diğer', aktif: true }
      ];
    }

    // Order statuses - Operational data
    if (!category || category === 'siparis_durumlari') {
      const orderStatuses = [
        { kod: 'TASLAK', ad: 'Taslak', renk: 'grey', aciklama: 'Henüz onaylanmamış sipariş' },
        { kod: 'ONAYLANDI', ad: 'Onaylandı', renk: 'blue', aciklama: 'Sipariş onaylandı, üretime geçecek' },
        { kod: 'HAZIRLANIYOR', ad: 'Hazırlanıyor', renk: 'orange', aciklama: 'Sipariş üretimde' },
        { kod: 'HAZIR', ad: 'Hazır', renk: 'green', aciklama: 'Sipariş hazır, teslimat bekliyor' },
        { kod: 'KARGOLANDI', ad: 'Kargolandı', renk: 'purple', aciklama: 'Sipariş kargoya verildi' },
        { kod: 'TESLIM_EDILDI', ad: 'Teslim Edildi', renk: 'success', aciklama: 'Sipariş teslim edildi' },
        { kod: 'IPTAL', ad: 'İptal', renk: 'red', aciklama: 'Sipariş iptal edildi' }
      ];

      results.siparisDurumlari = orderStatuses;
    }

    return results;
  });

  // Enhanced audit logging
  auditLog('DROPDOWN_DATA_ACCESS', 'Dropdown data accessed', {
    userId: req.user.userId,
    category: category || 'all',
    includeInactive,
    format,
    dataKeys: Object.keys(dropdownData),
    roleLevel: req.user.roleLevel
  });

  return res.status(200).json({
    success: true,
    message: 'Dropdown data retrieved successfully',
    data: dropdownData,
    metadata: {
      generatedAt: new Date(),
      userRole: req.user.rol,
      accessLevel: req.user.roleLevel,
      category: category || 'all',
      format
    }
  });
}

// ===== SECURITY INTEGRATION =====
export default secureAPI(
  withPrismaSecurity(dropdownHandler),
  {
    // RBAC Configuration
    permission: PERMISSIONS.VIEW_BASIC_DATA, // Basic permission for dropdown access

    // Input Validation Configuration
    allowedFields: ['category', 'includeInactive', 'format'],
    requiredFields: {},

    // Security Options
    preventSQLInjection: true,
    enableAuditLogging: true,
    cacheResults: true // Dropdown data can be cached
  }
);

