import prisma from '../../../lib/prisma.js';

// Yardımcı fonksiyon: Reçeteyi çöz ve malzemeleri bul
async function resolveRecipeMaterials(urunId, miktar) {
    const recipe = await prisma.recipe.findFirst({
        where: { urunId: urunId, aktif: true },
        include: {
            icerikelek: {
                include: {
                    material: true
                }
            }
        }
    });

    if (!recipe) {
        return [];
    }

    // Sipariş miktarını kilogram cinsine çevir
    const siparisKg = miktar; // Zaten kg cinsinden geliyor

    return recipe.icerikelek.map(ing => ({
        materialId: ing.material.id,
        materialKodu: ing.material.kod,
        materialAdi: ing.material.ad,
        gerekliMiktar: (ing.gerMiktarTB || ing.gerMiktar || ing.miktar) * siparisKg, // Sipariş miktarıyla çarp
        birim: ing.birim
    }));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { siparisId } = req.body;
    if (!siparisId) {
        return res.status(400).json({ message: 'siparisId gereklidir.' });
    }

    try {
        // Siparişi ve kalemlerini çek
        const siparis = await prisma.siparis.findUnique({
            where: { id: parseInt(siparisId) },
            include: {
                kalemler: {
                    include: {
                        urun: true
                    }
                }
            }
        });

        if (!siparis) {
            return res.status(404).json({ message: 'Sipariş bulunamadı.' });
        }

        // Sadece HAZIRLANDI durumundaki siparişler için stok düşülebilir
        if (siparis.durum !== 'HAZIRLANDI') {
            return res.status(400).json({
                message: 'Sadece HAZIRLANDI durumundaki siparişler için stok düşülebilir.'
            });
        }

        // Daha önce stok düşümü yapılmış mı kontrolü
        if (siparis.siparisNotu && siparis.siparisNotu.includes('[STOK DÜŞÜLDÜ]')) {
            return res.status(400).json({
                message: 'Bu sipariş için daha önce stok düşümü yapılmış.'
            });
        }

        let stokIhtiyaclari = {};
        const stokHatalari = [];
        const uyarilar = []; // Reçetesi olmayan ürünler için uyarı listesi

        // Her kalem için reçete malzemelerini hesapla
        for (const kalem of siparis.kalemler) {
            console.log(`📋 ${kalem.urun.ad} için reçete malzemeleri hesaplanıyor (${kalem.miktar} ${kalem.birim})`);

            const materials = await resolveRecipeMaterials(kalem.urun.id, kalem.miktar);

            if (materials.length === 0) {
                // ⚠️ UYARI: Reçete yok ama işleme devam et
                uyarilar.push(`⚠️ '${kalem.urun.ad}' için aktif reçete bulunamadı - stok düşümü yapılmadı`);
                console.warn(`⚠️ ${kalem.urun.ad} için reçete bulunamadı, stok düşümü atlanıyor`);
                continue;
            }

            for (const material of materials) {
                if (!stokIhtiyaclari[material.materialId]) {
                    stokIhtiyaclari[material.materialId] = {
                        materialId: material.materialId,
                        materialKodu: material.materialKodu,
                        materialAdi: material.materialAdi,
                        gerekliMiktar: 0,
                        birim: material.birim
                    };
                }
                stokIhtiyaclari[material.materialId].gerekliMiktar += material.gerekliMiktar;
            }
        }

        // Stok kontrolü ve düşümü
        const stokHareketleri = [];

        for (const materialId in stokIhtiyaclari) {
            const ihtiyac = stokIhtiyaclari[materialId];

            // Material'ı bul
            const material = await prisma.material.findUnique({
                where: { id: materialId }
            });

            if (!material) {
                stokHatalari.push(`${ihtiyac.materialKodu} kodlu malzeme bulunamadı`);
                continue;
            }

            // Stok yeterliliği kontrolü - YETERSİZ STOKTA DA DEVAM ET AMA UYARI VER
            if (material.mevcutStok < ihtiyac.gerekliMiktar) {
                uyarilar.push(
                    `⚠️ ${material.ad} için yetersiz stok! Gereken: ${ihtiyac.gerekliMiktar}${ihtiyac.birim}, Mevcut: ${material.mevcutStok}${material.birim} (Negatif stok oluşacak)`
                );
                console.warn(`⚠️ ${material.ad} için yetersiz stok, negatif stok oluşacak`);
                // İşleme devam et, stoku düş (negatif olabilir)
            }

            // Stoktan düş
            const oncekiStok = material.mevcutStok;
            const sonrakiStok = oncekiStok - ihtiyac.gerekliMiktar;

            await prisma.material.update({
                where: { id: materialId },
                data: { mevcutStok: sonrakiStok }
            });

            // Stok hareketi kaydet
            const stokHareket = await prisma.stokHareket.create({
                data: {
                    materialId: parseInt(materialId),
                    tip: 'CIKIS',
                    miktar: ihtiyac.gerekliMiktar,
                    birim: ihtiyac.birim || material.birim,
                    aciklama: `Sipariş #${siparisId} için manuel stok düşümü (reçete bazında)`,
                    oncekiStok: oncekiStok,
                    sonrakiStok: sonrakiStok,
                    toplamMaliyet: (material.birimFiyat || 0) * ihtiyac.gerekliMiktar,
                    birimMaliyet: material.birimFiyat || 0,
                    siparisKalemiId: null // Genel sipariş düşümü
                }
            });

            stokHareketleri.push({
                materialKodu: material.kod,
                materialAdi: material.ad,
                dusulenMiktar: ihtiyac.gerekliMiktar,
                birim: ihtiyac.birim,
                oncekiStok: oncekiStok,
                sonrakiStok: sonrakiStok
            });

            console.log(`✅ Stok düşüldü: ${material.ad} | ${oncekiStok} -> ${sonrakiStok} ${material.birim}`);
        }

        // Sadece kritik stok hataları varsa işlemi iptal et (yetersiz stok vs.)
        if (stokHatalari.length > 0) {
            return res.status(400).json({
                message: 'Stok düşme işlemi başarısız:',
                hatalar: stokHatalari
            });
        }

        // Sipariş açıklamasına işaret ve uyarıları ekle
        let siparisNotu = (siparis.siparisNotu || '') + ' [STOK DÜŞÜLDÜ]';

        if (uyarilar.length > 0) {
            siparisNotu += ` [UYARILAR: ${uyarilar.length} ürün reçetesi eksik]`;
            console.warn(`⚠️ ${uyarilar.length} ürün için reçete bulunamadı:`, uyarilar);
        }

        await prisma.siparis.update({
            where: { id: parseInt(siparisId) },
            data: {
                siparisNotu: siparisNotu
            }
        });

        console.log(`✅ Sipariş ${siparisId} için stok düşümü tamamlandı. ${stokHareketleri.length} malzeme düşüldü.`);

        return res.status(200).json({
            message: 'Stoklar başarıyla düşüldü.',
            hareketler: stokHareketleri,
            uyarilar: uyarilar,
            toplamDusulenMalzeme: stokHareketleri.length,
            toplamUyari: uyarilar.length
        });

    } catch (error) {
        console.error('❌ Stok düşümü hatası:', error);
        return res.status(500).json({
            message: 'Stok düşümü sırasında hata oluştu.',
            error: error.message
        });
    }
} 