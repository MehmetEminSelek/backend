/**
 * =============================================
 * SIMPLIFIED DROPDOWN API - WORKING VERSION
 * =============================================
 */

// import { createAuditLog } from '../../lib/audit-logger.js';
import prisma from '../../lib/prisma.js';

/**
 * Dropdown API Handler with Full Security Integration
 */
async function dropdownHandler(req, res) {
  const { method } = req;

  console.log('🔍 Dropdown API called:', {
    method,
    hasUser: !!req.user,
    userId: req.user?.id,
    userRole: req.user?.rol,
    headers: {
      authorization: req.headers.authorization?.substring(0, 20) + '...',
      origin: req.headers.origin
    }
  });

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

    console.error('🚨 DROPDOWN_API_ERROR:', 'Dropdown API operation failed', {
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

  // Basit input validation
  const allowedCategories = ['teslimat', 'subeler', 'urunler', 'materials', 'cariler', 'kategoriler', 'odeme_yontemleri', 'siparis_durumlari'];
  if (category && !allowedCategories.includes(category)) {
    return res.status(400).json({
      error: 'Geçersiz kategori',
      allowedCategories
    });
  }

  console.log('GET /api/dropdown request received...');

  try {
    const results = {};

    // Base where clause for active records
    const activeWhere = includeInactive === 'true' ? {} : { aktif: true };

    // Delivery types - Available for all users
    if (!category || category === 'teslimat') {
      results.teslimatTurleri = await prisma.teslimatTuru.findMany({
        where: activeWhere,
        select: {
          id: true,
          ad: true,
          kod: true,
          aktif: true,
          ...(format === 'detailed' && {
            aciklama: true,
            varsayilanKargo: true
          })
        },
        orderBy: { ad: 'asc' }
      });
    }

    // Branches - Role-based access
    if ((!category || category === 'subeler') && req.user.roleLevel >= 50) {
      results.subeler = await prisma.sube.findMany({
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
      results.urunler = await prisma.urun.findMany({
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
          aciklama: true
        },
        orderBy: [
          { kategori: { ad: 'asc' } },
          { ad: 'asc' }
        ]
      });
    }

    // Materials - For production staff+ and VIEWER (read-only)
    if ((!category || category === 'materials') && (req.user.roleLevel >= 50 || req.user.rol === 'VIEWER')) {
      results.materials = await prisma.material.findMany({
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

    // Customers - Role-based PII protection, VIEWER can see basic info
    if ((!category || category === 'cariler') && (req.user.roleLevel >= 50 || req.user.rol === 'VIEWER')) {
      results.cariler = await prisma.cariMusteri.findMany({
        where: activeWhere,
        select: {
          id: true,
          musteriKodu: true,
          aktif: true,

          // Basic data for managers+
          ...(req.user.roleLevel >= 70 && {
            cariAdi: true,
            subeAdi: true,
            cariGrubu: true,
            fiyatGrubu: true
          }),

          // Contact info only for administrators
          ...(req.user.roleLevel >= 80 && format === 'detailed' && {
            telefon: true,
            irtibatAdi: true
          })
        },
        orderBy: { musteriKodu: 'asc' }
      });
    }

    // Categories - Available for all users
    if (!category || category === 'kategoriler') {
      results.kategoriler = await prisma.urunKategori.findMany({
        where: activeWhere,
        select: {
          id: true,
          ad: true,
          kod: true,
          aktif: true,
          ...(format === 'detailed' && {
            aciklama: true
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

    // Basit audit logging - geçici olarak comment
    /*
    try {
      await createAuditLog(
        req.user.personelId,
        'LOGIN', // Geçici olarak LOGIN kullanıyoruz
        'DROPDOWN',
        category || 'all',
        null,
        { dataKeys: Object.keys(results) },
        `Dropdown verisi erişimi: ${category || 'all'}`,
        req
      );
    } catch (auditError) {
      console.error('❌ Audit log hatası:', auditError);
    }
    */

    return res.status(200).json({
      success: true,
      message: 'Dropdown data retrieved successfully',
      data: results,
      metadata: {
        generatedAt: new Date(),
        userRole: req.user.rol,
        accessLevel: req.user.roleLevel,
        category: category || 'all',
        format
      }
    });
  } catch (error) {
    console.error('Dropdown data fetch error:', error);
    throw error;
  }
}

// ===== AUTH INTEGRATION =====
import { withCorsAndAuth } from '../../lib/cors-wrapper.js';

export default withCorsAndAuth(dropdownHandler);

