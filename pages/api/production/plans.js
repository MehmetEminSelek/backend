// ===================================================================
// 🏭 ÜRETİM PLANI YÖNETİMİ - MODÜLER CRUD API
// Sadeleştirilmiş ve audit log entegreli üretim planı yönetimi
// ===================================================================

import prisma from '../../../lib/prisma';
import { createAuditLog } from '../../../lib/audit-logger';
import { calculateProductionPlanCost, calculateMaterialRequirements } from '../../../lib/reports/cost-calculator';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        switch (req.method) {
            case 'GET':
                return await getProductionPlans(req, res);
            case 'POST':
                return await createProductionPlan(req, res);
            case 'PUT':
                return await updateProductionPlan(req, res);
            case 'DELETE':
                return await deleteProductionPlan(req, res);
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
                return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
        }
    } catch (error) {
        console.error('❌ Üretim Planı API Hatası:', error);
        return res.status(500).json({
            message: 'Sunucu hatası oluştu',
            error: error.message
        });
    }
}

// GET - Üretim planlarını listele
async function getProductionPlans(req, res) {
    try {
        const { startDate, endDate, status, page = 1, limit = 20 } = req.query;

        const whereClause = {};

        if (startDate && endDate) {
            whereClause.planTarihi = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        if (status) {
            whereClause.durum = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [plans, totalCount] = await Promise.all([
            prisma.productionPlan.findMany({
                where: whereClause,
                include: {
                    planItems: {
                        include: {
                            urun: {
                                select: {
                                    ad: true,
                                    kod: true,
                                    kategori: { select: { ad: true } }
                                }
                            }
                        }
                    },
                    olusturan: {
                        select: {
                            ad: true,
                            soyad: true,
                            personelId: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit)
            }),
            prisma.productionPlan.count({ where: whereClause })
        ]);

        return res.status(200).json({
            success: true,
            data: {
                plans,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalCount,
                    pages: Math.ceil(totalCount / parseInt(limit))
                }
            },
            message: `${plans.length} üretim planı bulundu`
        });

    } catch (error) {
        console.error('❌ Üretim planları listesi hatası:', error);
        return res.status(500).json({
            message: 'Üretim planları listelenirken hata oluştu',
            error: error.message
        });
    }
}

// POST - Yeni üretim planı oluştur
async function createProductionPlan(req, res) {
    try {
        const {
            ad,
            aciklama,
            planTarihi,
            hedefTarih,
            oncelikSeviyesi = 'NORMAL',
            planItems = []
        } = req.body;

        // Validation
        if (!ad) {
            return res.status(400).json({ message: 'Plan adı zorunludur' });
        }

        if (!planItems || planItems.length === 0) {
            return res.status(400).json({ message: 'En az bir plan kalemi eklemelisiniz' });
        }

        // Transaction ile plan ve kalemlerini oluştur
        const yeniPlan = await prisma.$transaction(async (tx) => {
            // Ana planı oluştur
            const plan = await tx.productionPlan.create({
                data: {
                    ad,
                    aciklama,
                    planTarihi: new Date(planTarihi),
                    hedefTarih: hedefTarih ? new Date(hedefTarih) : null,
                    oncelikSeviyesi,
                    durum: 'TASLAK',
                    olusturanId: 1 // TODO: JWT'den gerçek user ID'si alınacak
                }
            });

            // Plan kalemlerini oluştur
            for (const item of planItems) {
                await tx.productionPlanItem.create({
                    data: {
                        planId: plan.id,
                        urunId: parseInt(item.urunId),
                        miktar: parseFloat(item.miktar),
                        birim: item.birim || 'KG',
                        hedefTarih: item.hedefTarih ? new Date(item.hedefTarih) : new Date(hedefTarih),
                        oncelik: item.oncelik || 'NORMAL',
                        notlar: item.notlar
                    }
                });
            }

            // Tam bilgilerle planı döndür
            return await tx.productionPlan.findUnique({
                where: { id: plan.id },
                include: {
                    planItems: {
                        include: {
                            urun: {
                                select: {
                                    ad: true,
                                    kod: true
                                }
                            }
                        }
                    }
                }
            });
        });

        // Maliyet hesapla
        const maliyetAnalizi = await calculateProductionPlanCost(yeniPlan);

        // 📝 AUDIT LOG: Üretim planı oluşturma
        await createAuditLog({
            personelId: 'P001', // TODO: JWT'den gerçek personel ID'si alınacak
            action: 'CREATE',
            tableName: 'PRODUCTION_PLAN',
            recordId: yeniPlan.id,
            oldValues: null,
            newValues: {
                ad: yeniPlan.ad,
                planTarihi: yeniPlan.planTarihi,
                oncelikSeviyesi: yeniPlan.oncelikSeviyesi,
                kalemSayisi: yeniPlan.planItems?.length || 0,
                toplamMaliyet: maliyetAnalizi.toplamMaliyet
            },
            description: `Yeni üretim planı oluşturuldu: ${yeniPlan.ad} - ${yeniPlan.planItems?.length || 0} kalem (₺${maliyetAnalizi.toplamMaliyet})`,
            req
        });

        console.log(`📝 AUDIT: Yeni üretim planı oluşturuldu - ${yeniPlan.ad}`);

        return res.status(201).json({
            message: 'Üretim planı başarıyla oluşturuldu',
            plan: yeniPlan,
            maliyetAnalizi
        });

    } catch (error) {
        console.error('❌ Üretim planı oluşturma hatası:', error);
        return res.status(500).json({
            message: 'Üretim planı oluşturulurken hata oluştu',
            error: error.message
        });
    }
}

// PUT - Üretim planı güncelle
async function updateProductionPlan(req, res) {
    try {
        const {
            id,
            ad,
            aciklama,
            planTarihi,
            hedefTarih,
            oncelikSeviyesi,
            durum,
            planItems = []
        } = req.body;

        if (!id) {
            return res.status(400).json({ message: 'Plan ID gerekli' });
        }

        // 📝 Güncelleme öncesi mevcut veriyi al (audit için)
        const mevcutPlan = await prisma.productionPlan.findUnique({
            where: { id: parseInt(id) },
            include: {
                planItems: {
                    include: {
                        urun: { select: { ad: true } }
                    }
                }
            }
        });

        if (!mevcutPlan) {
            return res.status(404).json({ message: 'Üretim planı bulunamadı' });
        }

        // Transaction ile güncelle
        const guncellenenPlan = await prisma.$transaction(async (tx) => {
            // Ana planı güncelle
            const plan = await tx.productionPlan.update({
                where: { id: parseInt(id) },
                data: {
                    ad,
                    aciklama,
                    planTarihi: planTarihi ? new Date(planTarihi) : undefined,
                    hedefTarih: hedefTarih ? new Date(hedefTarih) : null,
                    oncelikSeviyesi,
                    durum,
                    updatedAt: new Date()
                }
            });

            // Mevcut plan kalemlerini sil
            await tx.productionPlanItem.deleteMany({
                where: { planId: parseInt(id) }
            });

            // Yeni plan kalemlerini ekle
            for (const item of planItems) {
                await tx.productionPlanItem.create({
                    data: {
                        planId: parseInt(id),
                        urunId: parseInt(item.urunId),
                        miktar: parseFloat(item.miktar),
                        birim: item.birim || 'KG',
                        hedefTarih: item.hedefTarih ? new Date(item.hedefTarih) : new Date(hedefTarih),
                        oncelik: item.oncelik || 'NORMAL',
                        notlar: item.notlar
                    }
                });
            }

            // Güncellenmiş planı döndür
            return await tx.productionPlan.findUnique({
                where: { id: parseInt(id) },
                include: {
                    planItems: {
                        include: {
                            urun: { select: { ad: true } }
                        }
                    }
                }
            });
        });

        // 📝 AUDIT LOG: Üretim planı güncelleme
        await createAuditLog({
            personelId: 'P001', // TODO: JWT'den gerçek personel ID'si alınacak
            action: 'UPDATE',
            tableName: 'PRODUCTION_PLAN',
            recordId: id,
            oldValues: {
                ad: mevcutPlan.ad,
                durum: mevcutPlan.durum,
                kalemSayisi: mevcutPlan.planItems?.length || 0
            },
            newValues: {
                ad: guncellenenPlan.ad,
                durum: guncellenenPlan.durum,
                kalemSayisi: guncellenenPlan.planItems?.length || 0
            },
            description: `Üretim planı güncellendi: ${guncellenenPlan.ad} (${guncellenenPlan.durum})`,
            req
        });

        console.log(`📝 AUDIT: Üretim planı güncellendi - ${guncellenenPlan.ad}`);

        return res.status(200).json({
            message: 'Üretim planı başarıyla güncellendi',
            plan: guncellenenPlan
        });

    } catch (error) {
        console.error('❌ Üretim planı güncelleme hatası:', error);
        return res.status(500).json({
            message: 'Üretim planı güncellenirken hata oluştu',
            error: error.message
        });
    }
}

// DELETE - Üretim planı sil
async function deleteProductionPlan(req, res) {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({ message: 'Plan ID gerekli' });
        }

        // 📝 Silme öncesi plan bilgilerini al (audit için)
        const silinecekPlan = await prisma.productionPlan.findUnique({
            where: { id: parseInt(id) },
            include: {
                planItems: {
                    include: {
                        urun: { select: { ad: true } }
                    }
                }
            }
        });

        if (!silinecekPlan) {
            return res.status(404).json({ message: 'Üretim planı bulunamadı' });
        }

        // Transaction ile sil
        await prisma.$transaction(async (tx) => {
            // Plan kalemlerini sil
            await tx.productionPlanItem.deleteMany({
                where: { planId: parseInt(id) }
            });

            // Planı sil
            await tx.productionPlan.delete({
                where: { id: parseInt(id) }
            });
        });

        // 📝 AUDIT LOG: Üretim planı silme
        await createAuditLog({
            personelId: 'P001', // TODO: JWT'den gerçek personel ID'si alınacak
            action: 'DELETE',
            tableName: 'PRODUCTION_PLAN',
            recordId: id,
            oldValues: {
                ad: silinecekPlan.ad,
                durum: silinecekPlan.durum,
                planTarihi: silinecekPlan.planTarihi,
                kalemSayisi: silinecekPlan.planItems?.length || 0,
                kalemler: silinecekPlan.planItems?.map(item => `${item.urun.ad} (${item.miktar} ${item.birim})`).join(', ')
            },
            newValues: null,
            description: `Üretim planı silindi: ${silinecekPlan.ad} - ${silinecekPlan.planItems?.length || 0} kalem`,
            req
        });

        console.log(`📝 AUDIT: Üretim planı silindi - ${silinecekPlan.ad}`);

        return res.status(200).json({
            message: 'Üretim planı başarıyla silindi'
        });

    } catch (error) {
        console.error('❌ Üretim planı silme hatası:', error);
        return res.status(500).json({
            message: 'Üretim planı silinirken hata oluştu',
            error: error.message
        });
    }
}

// BONUS: Plan durumu güncelleme endpoint'i
export async function updatePlanStatus(req, res) {
    try {
        const { id, durum, notlar } = req.body;

        const plan = await prisma.productionPlan.update({
            where: { id: parseInt(id) },
            data: {
                durum,
                notlar,
                updatedAt: new Date()
            }
        });

        // Audit log
        await createAuditLog({
            personelId: 'P001',
            action: 'UPDATE',
            tableName: 'PRODUCTION_PLAN',
            recordId: id,
            oldValues: { durum: 'ÖNCEKI_DURUM' },
            newValues: { durum },
            description: `Üretim planı durumu güncellendi: ${plan.ad} → ${durum}`,
            req
        });

        return res.status(200).json({
            message: 'Plan durumu güncellendi',
            plan
        });

    } catch (error) {
        console.error('❌ Plan durum güncelleme hatası:', error);
        return res.status(500).json({
            message: 'Plan durumu güncellenirken hata oluştu',
            error: error.message
        });
    }
} 