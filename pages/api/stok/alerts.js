import prisma from '../../../lib/prisma.js';

// Stok Uyarıları API - Kritik ve Negatif Stokları Döndürür
export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        console.log('🔍 Stok uyarıları kontrol ediliyor...');

        // Tüm aktif materialleri al
        const tumMateriallar = await prisma.material.findMany({
            where: {
                aktif: true
            },
            select: {
                id: true,
                kod: true,
                ad: true,
                mevcutStok: true,
                kritikSeviye: true,
                minStokSeviye: true,
                birim: true,
                tipi: true
            },
            orderBy: {
                mevcutStok: 'asc' // En düşük stoktan başla
            }
        });

        // JavaScript ile kritik stok filtreleme
        const kritikStoklar = tumMateriallar.filter(m => {
            const mevcutStok = m.mevcutStok || 0;
            const kritikSeviye = m.kritikSeviye || m.minStokSeviye || 10;

            // Negatif veya kritik seviyenin altında
            return mevcutStok <= 0 || mevcutStok <= kritikSeviye;
        });

        // Uyarıları kategorilere ayır
        const negatifStoklar = kritikStoklar.filter(m => m.mevcutStok <= 0);
        const kritikSeviyeStoklar = kritikStoklar.filter(m => {
            const mevcutStok = m.mevcutStok || 0;
            const kritikSeviye = m.kritikSeviye || m.minStokSeviye || 10;
            return mevcutStok > 0 && mevcutStok <= kritikSeviye;
        });

        // Uyarı sayıları
        const toplamUyari = kritikStoklar.length;
        const kritikUyariSayisi = negatifStoklar.length;
        const dusukStokSayisi = kritikSeviyeStoklar.length;

        console.log(`📊 Stok uyarı durumu: ${toplamUyari} toplam, ${kritikUyariSayisi} kritik, ${dusukStokSayisi} düşük`);

        return res.status(200).json({
            success: true,
            toplamUyari,
            kritikUyariSayisi,
            dusukStokSayisi,
            uyarilar: {
                negatifStoklar,
                kritikSeviyeStoklar,
                tumKritikStoklar: kritikStoklar
            },
            // Özet bilgiler (UI için)
            ozet: {
                kritikDurum: kritikUyariSayisi > 0,
                uyariMesaji: kritikUyariSayisi > 0
                    ? `${kritikUyariSayisi} malzemede negatif stok var!`
                    : dusukStokSayisi > 0
                        ? `${dusukStokSayisi} malzemede düşük stok uyarısı!`
                        : 'Stok durumu normal',
                seviyeRengi: kritikUyariSayisi > 0 ? 'error' : dusukStokSayisi > 0 ? 'warning' : 'success'
            }
        });

    } catch (error) {
        console.error('❌ Stok uyarıları alınırken hata:', error);
        return res.status(500).json({
            success: false,
            message: 'Stok uyarıları alınırken hata oluştu',
            error: error.message
        });
    }
} 