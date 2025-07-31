// ===================================================================
// 📝 PERSONEL TAKİP & AUDIT LOGGING SİSTEMİ
// Her işlemi kim yaptı, ne zaman yaptı, ne değiştirdi?
// ===================================================================

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 🔍 AUDIT LOG OLUŞTURMA
 * Her CRUD operasyonu için otomatik log kaydı
 * 
 * @param {string} personelId - İşlemi yapan personelin ID'si (P001, P002, vb.)
 * @param {string} action - Ne yapıldı? (CREATE, UPDATE, DELETE, APPROVE, vb.)
 * @param {string} tableName - Hangi tablo? ("Siparis", "Urun", "Material", vb.)
 * @param {string|number} recordId - Hangi kayıt?
 * @param {object} oldValues - Eski değerler (UPDATE için)
 * @param {object} newValues - Yeni değerler (CREATE/UPDATE için)
 * @param {string} description - Açıklama ("Sipariş onaylandı", "Fiyat güncellendi", vb.)
 * @param {object} req - HTTP request object (IP, userAgent için)
 */
async function createAuditLog({
    personelId,
    action,
    tableName,
    recordId,
    oldValues = null,
    newValues = null,
    description = null,
    req = null
}) {
    try {
        await prisma.auditLog.create({
            data: {
                personelId,
                action,
                tableName,
                recordId: String(recordId),
                oldValues: oldValues ? JSON.stringify(oldValues) : null,
                newValues: newValues ? JSON.stringify(newValues) : null,
                description,
                ipAddress: req?.ip || req?.connection?.remoteAddress || 'localhost',
                userAgent: req?.headers?.[`user-agent`] || req?.get?.('User-Agent') || 'Unknown',
                sessionId: req?.sessionID || null
            }
        });

        console.log(`📝 AUDIT LOG: ${personelId} ${action} ${tableName}#${recordId}`);
    } catch (error) {
        console.error('❌ Audit log hatası:', error);
        // Audit log hatası ana işlemi durdurmamalı
    }
}

/**
 * 🔄 TABLO GÜNCELLEMESİ İLE PERSONEL TAKİBİ
 * Herhangi bir tabloyu güncellerken otomatik personel tracking
 * 
 * @param {string} tableName - Tablo adı ("siparis", "urun", "cari", vb.)
 * @param {string|number} recordId - Kayıt ID'si
 * @param {object} updateData - Güncellenecek veriler
 * @param {string} personelId - İşlemi yapan personelin ID'si
 * @param {string} action - Yapılan işlem açıklaması
 * @param {object} req - HTTP request object
 */
async function updateWithTracking({
    tableName,
    recordId,
    updateData,
    personelId,
    action,
    req = null
}) {
    try {
        // Eski veriyi al
        const oldRecord = await prisma[tableName].findUnique({
            where: { id: parseInt(recordId) }
        });

        // Yeni tracking bilgilerini ekle
        const dataWithTracking = {
            ...updateData,
            lastModifiedBy: personelId,
            lastModifiedAt: new Date(),
            lastAction: action
        };

        // Güncelle
        const updatedRecord = await prisma[tableName].update({
            where: { id: parseInt(recordId) },
            data: dataWithTracking
        });

        // Audit log oluştur
        await createAuditLog({
            personelId,
            action: 'UPDATE',
            tableName: tableName.toUpperCase(),
            recordId,
            oldValues: oldRecord,
            newValues: updatedRecord,
            description: action,
            req
        });

        return updatedRecord;

    } catch (error) {
        console.error(`❌ ${tableName} güncelleme hatası:`, error);
        throw error;
    }
}

/**
 * ✅ SİPARİŞ ONAYLAMA İŞLEMİ
 * Örnek: Sipariş onaylama işlemi nasıl loglanır
 */
async function approveSiparis(siparisId, personelId, req) {
    try {
        const result = await updateWithTracking({
            tableName: 'siparis',
            recordId: siparisId,
            updateData: {
                durum: 'HAZIRLLANACAK',
                onaylanmaTarihi: new Date(),
                onaylayanId: personelId // Eski sistem için de compat
            },
            personelId,
            action: 'SİPARİŞ_ONAYLANDI',
            req
        });

        console.log(`✅ Sipariş #${siparisId} ${personelId} tarafından onaylandı`);
        return result;

    } catch (error) {
        console.error('❌ Sipariş onaylama hatası:', error);
        throw error;
    }
}

/**
 * 💰 ÜRÜN FİYATI GÜNCELLEMESİ
 * Örnek: Ürün fiyatı değişikliği nasıl loglanır
 */
async function updateUrunFiyati(urunId, yeniFiyat, personelId, req) {
    try {
        const result = await updateWithTracking({
            tableName: 'urun',
            recordId: urunId,
            updateData: {
                kgFiyati: yeniFiyat,
                guncellemeTarihi: new Date()
            },
            personelId,
            action: `FİYAT_GÜNCELLENDİ: ₺${yeniFiyat}`,
            req
        });

        console.log(`💰 Ürün #${urunId} fiyatı ₺${yeniFiyat} olarak güncellendi (${personelId})`);
        return result;

    } catch (error) {
        console.error('❌ Ürün fiyatı güncelleme hatası:', error);
        throw error;
    }
}

/**
 * 📊 AUDIT RAPORU OLUŞTURMA
 * Belirli bir tarih aralığında hangi personel ne yaptı?
 */
async function getAuditReport(startDate, endDate, personelId = null, tableName = null) {
    try {
        const whereClause = {
            timestamp: {
                gte: new Date(startDate),
                lte: new Date(endDate)
            }
        };

        if (personelId) whereClause.personelId = personelId;
        if (tableName) whereClause.tableName = tableName.toUpperCase();

        const auditLogs = await prisma.auditLog.findMany({
            where: whereClause,
            include: {
                personel: {
                    select: {
                        personelId: true,
                        ad: true,
                        soyad: true,
                        rol: true
                    }
                }
            },
            orderBy: { timestamp: 'desc' },
            take: 1000 // Limit 1000 kayıt
        });

        // Özet istatistikler
        const summary = {
            totalActions: auditLogs.length,
            actionsByPersonel: {},
            actionsByTable: {},
            actionsByType: {}
        };

        auditLogs.forEach(log => {
            // Personel bazında
            const personelKey = `${log.personel.ad} ${log.personel.soyad} (${log.personelId})`;
            summary.actionsByPersonel[personelKey] = (summary.actionsByPersonel[personelKey] || 0) + 1;

            // Tablo bazında
            summary.actionsByTable[log.tableName] = (summary.actionsByTable[log.tableName] || 0) + 1;

            // İşlem tipi bazında
            summary.actionsByType[log.action] = (summary.actionsByType[log.action] || 0) + 1;
        });

        return {
            summary,
            logs: auditLogs
        };

    } catch (error) {
        console.error('❌ Audit raporu hatası:', error);
        throw error;
    }
}

/**
 * 👤 PERSONEL ID OLUŞTURMA
 * Yeni personel eklenirken otomatik P001, P002, P003... formatında ID oluştur
 */
async function generatePersonelId() {
    try {
        // Son personel ID'sini bul
        const lastUser = await prisma.user.findFirst({
            where: {
                personelId: {
                    startsWith: 'P'
                }
            },
            orderBy: {
                personelId: 'desc'
            }
        });

        let nextNumber = 1;
        if (lastUser && lastUser.personelId) {
            const lastNumber = parseInt(lastUser.personelId.substring(1));
            nextNumber = lastNumber + 1;
        }

        // P001, P002, P003... formatında
        const newPersonelId = `P${nextNumber.toString().padStart(3, '0')}`;

        console.log(`👤 Yeni personel ID oluşturuldu: ${newPersonelId}`);
        return newPersonelId;

    } catch (error) {
        console.error('❌ Personel ID oluşturma hatası:', error);
        throw error;
    }
}

// ===================================================================
// ES6 EXPORTS
// ===================================================================

export {
    createAuditLog,
    updateWithTracking,
    approveSiparis,
    updateUrunFiyati,
    getAuditReport,
    generatePersonelId
};

// auditLog alias for backward compatibility
export const auditLog = createAuditLog;

// Default export
export default {
    createAuditLog,
    auditLog: createAuditLog,
    updateWithTracking,
    approveSiparis,
    updateUrunFiyati,
    getAuditReport,
    generatePersonelId
}; 