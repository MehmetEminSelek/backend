// ===================================================================
// 📝 PERSONEL TAKİP & AUDIT LOGGING SİSTEMİ
// Her işlemi kim yaptı, ne zaman yaptı, ne değiştirdi?
// ===================================================================

import prisma from './prisma.js';

/**
 * 🔍 AUDIT LOG OLUŞTURMA (Ana fonksiyon)
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
        // personelId null ise audit log yazmayı skip et (foreign key constraint için)
        if (!action) {
            throw new Error('Argument `action` is missing.');
        }

        const resolvedPersonelId = (req?.user?.personelId) ? String(req.user.personelId)
            : (personelId ? String(personelId) : null);

        await prisma.auditLog.create({
            data: {
                personelId: resolvedPersonelId,
                action: normalizeAction(action),
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

        if (process.env.NODE_ENV !== 'production') {
            console.log(`📝 AUDIT LOG: ${personelId || 'null'} ${action} ${tableName}#${recordId}`);
        }
    } catch (error) {
        console.error('❌ Audit log hatası:', error);
        // Audit log hatası ana işlemi durdurmamalı
    }
}

function normalizeAction(action) {
    if (!action || typeof action !== 'string') return 'CREATE';
    const a = action.toUpperCase();
    const map = {
        CREATE: 'CREATE',
        UPDATE: 'UPDATE',
        DELETE: 'DELETE',
        APPROVE: 'APPROVE',
        CANCEL: 'CANCEL',
        COMPLETE: 'COMPLETE',
        TRANSFER: 'TRANSFER',
        PAYMENT: 'PAYMENT',
        LOGIN: 'LOGIN',
        LOGIN_SUCCESS: 'LOGIN_SUCCESS',
        LOGIN_FAILED: 'LOGIN_FAILED',
        LOGOUT: 'LOGOUT',
        PASSWORD_CHANGE: 'PASSWORD_CHANGE',
        PERMISSION_CHANGE: 'PERMISSION_CHANGE',
        BULK_UPDATE: 'BULK_UPDATE',
        BULK_DELETE: 'BULK_DELETE',
        IMPORT: 'IMPORT',
        EXPORT: 'EXPORT'
    };
    // Fallback heuristics for custom strings
    if (map[a]) return map[a];
    if (a.includes('CREATE')) return 'CREATE';
    if (a.includes('UPDATE')) return 'UPDATE';
    if (a.includes('DELETE')) return 'DELETE';
    if (a.includes('LOGIN') && a.includes('FAILED')) return 'LOGIN_FAILED';
    if (a.includes('LOGIN') && a.includes('SUCCESS')) return 'LOGIN_SUCCESS';
    if (a.includes('LOGIN')) return 'LOGIN';
    if (a.includes('LOGOUT')) return 'LOGOUT';
    return 'CREATE';
}

/**
 * Geriye dönük uyumlu auditLog sarmalayıcısı
 * - Yeni kullanım: auditLog({ personelId, action, tableName, recordId, oldValues, newValues, description, req })
 * - Eski kullanım: auditLog(action, description, details)
 */
async function auditLogCompat(...args) {
    try {
        if (args.length === 1 && typeof args[0] === 'object') {
            return await createAuditLog(args[0]);
        }

        if (typeof args[0] === 'string') {
            const [action, description, details = {}] = args;

            // Heuristics to infer fields from legacy calls
            const tableName = details.tableName || 'API';
            const recordId = (
                details.recordId ??
                details.recipeId ??
                details.materialId ??
                details.userId ??
                details.createdUserId ??
                details.materialCode ??
                details.productId ??
                'unknown'
            );

            const req = details.req || null;
            const resolvedPersonelId = req?.user?.personelId || details.personelId || null;

            return await createAuditLog({
                personelId: resolvedPersonelId,
                action: normalizeAction(action),
                tableName,
                recordId: String(recordId),
                oldValues: null,
                newValues: details,
                description,
                req
            });
        }

        // Unknown usage, skip silently
    } catch (e) {
        console.error('❌ auditLogCompat error:', e);
    }
}

/**
 * 🔄 TABLO GÜNCELLEMESİ İLE PERSONEL TAKİBİ
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
            const personelKey = `${log.personel?.ad || ''} ${log.personel?.soyad || ''} (${log.personelId})`.trim();
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
 */
async function generatePersonelId() {
    try {
        const lastUser = await prisma.user.findFirst({
            where: { personelId: { startsWith: 'P' } },
            orderBy: { personelId: 'desc' }
        });

        let nextNumber = 1;
        if (lastUser && lastUser.personelId) {
            const lastNumber = parseInt(lastUser.personelId.substring(1));
            nextNumber = lastNumber + 1;
        }

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
    auditLogCompat as auditLog,
    updateWithTracking,
    approveSiparis,
    updateUrunFiyati,
    getAuditReport,
    generatePersonelId
};

// Default export
export default {
    createAuditLog,
    auditLog: auditLogCompat,
    updateWithTracking,
    approveSiparis,
    updateUrunFiyati,
    getAuditReport,
    generatePersonelId
}; 