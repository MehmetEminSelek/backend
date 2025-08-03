// pages/api/urunler/[id]/recete-maliyet.js
// Ürün reçetesi ve maliyet hesaplama API'si

import prisma from '../../../../lib/prisma.js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { id } = req.query;
        const { gramaj } = req.query; // Ara gramaj parametresi

        // Ürün bilgilerini al
        const urun = await prisma.urun.findUnique({
            where: { id: parseInt(id) },
            include: {
                fiyatlar: {
                    where: { aktif: true },
                    orderBy: { gecerliTarih: 'desc' },
                    take: 1
                },
                recipes: {
                    include: {
                        ingredients: true
                    }
                }
            }
        });

        if (!urun) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        // Satış fiyatı (KG bazında)
        const kgSatisFiyati = urun.fiyatlar[0]?.fiyat || 0;

        // Ara gramaj hesaplaması
        const hedefGramaj = gramaj ? parseInt(gramaj) : 1000; // Varsayılan 1000g (1KG)
        const araGramajSatisFiyati = (hedefGramaj * kgSatisFiyati) / 1000;

        // Reçete analizi
        const receteAnalizi = [];
        let toplamReceteMaliyeti = 0;
        let toplamReceteGrami = 0;

        for (const recete of urun.recipes) {
            let receteMaliyeti = 0;
            let receteGrami = 0;
            const malzemeler = [];

            for (const malzeme of recete.ingredients) {
                // Malzeme maliyeti (₺/KG)
                const malzemeMaliyeti = getMalzemeMaliyeti(malzeme.stokKod);

                // Malzeme toplam maliyeti (TL)
                const malzemeToplam = (malzeme.miktarGram * malzemeMaliyeti) / 1000;

                receteMaliyeti += malzemeToplam;
                receteGrami += malzeme.miktarGram;

                malzemeler.push({
                    stokKod: malzeme.stokKod,
                    miktarGram: malzeme.miktarGram,
                    birimMaliyet: malzemeMaliyeti, // ₺/KG
                    toplamMaliyet: malzemeToplam,  // TL
                    yuzde: 0 // RecipeIngredient modelinde percentage field'ı yok
                });
            }

            // Reçete başına maliyet (₺/KG)
            const receteKgMaliyeti = receteGrami > 0 ? (receteMaliyeti * 1000) / receteGrami : 0;

            // Ara gramaj için reçete maliyeti
            const araGramajReceteMaliyeti = (hedefGramaj * receteKgMaliyeti) / 1000;

            receteAnalizi.push({
                id: recete.id,
                name: recete.name,
                description: recete.description,
                toplamMaliyet: receteMaliyeti,      // TL (reçete toplam)
                toplamGram: receteGrami,            // gram
                kgMaliyeti: receteKgMaliyeti,       // ₺/KG
                araGramajMaliyeti: araGramajReceteMaliyeti, // Hedef gramaj için maliyet
                malzemeler: malzemeler
            });

            toplamReceteMaliyeti += receteMaliyeti;
            toplamReceteGrami += receteGrami;
        }

        // Genel maliyet analizi
        const ortalamaMaliyet = toplamReceteGrami > 0 ? (toplamReceteMaliyeti * 1000) / toplamReceteGrami : 0;
        const araGramajToplamMaliyet = (hedefGramaj * ortalamaMaliyet) / 1000;

        // Kar analizi
        const karMiktari = araGramajSatisFiyati - araGramajToplamMaliyet;
        const karMarji = araGramajSatisFiyati > 0 ? (karMiktari / araGramajSatisFiyati * 100) : 0;

        // Maliyet dağılımı
        const maliyetDagilimi = {};
        receteAnalizi.forEach(recete => {
            recete.malzemeler.forEach(malzeme => {
                if (!maliyetDagilimi[malzeme.stokKod]) {
                    maliyetDagilimi[malzeme.stokKod] = {
                        toplamMaliyet: 0,
                        toplamGram: 0,
                        birimMaliyet: malzeme.birimMaliyet
                    };
                }
                maliyetDagilimi[malzeme.stokKod].toplamMaliyet += malzeme.toplamMaliyet;
                maliyetDagilimi[malzeme.stokKod].toplamGram += malzeme.miktarGram;
            });
        });

        const response = {
            urun: {
                id: urun.id,
                kodu: urun.kodu,
                ad: urun.ad,
                kgSatisFiyati: kgSatisFiyati,
                hedefGramaj: hedefGramaj,
                araGramajSatisFiyati: araGramajSatisFiyati
            },
            maliyet: {
                toplamMaliyet: araGramajToplamMaliyet,      // Hedef gramaj için toplam maliyet
                kgMaliyeti: ortalamaMaliyet,                // ₺/KG maliyet
                gramMaliyeti: ortalamaMaliyet / 1000,       // ₺/gram maliyet
                karMiktari: karMiktari,                     // TL kar
                karMarji: karMarji,                         // % kar marjı
                maliyetDagilimi: maliyetDagilimi
            },
            receteler: receteAnalizi,
            hesaplamaDetayi: {
                formul: `(${hedefGramaj}g × ${ortalamaMaliyet.toFixed(2)}₺/KG) ÷ 1000 = ${araGramajToplamMaliyet.toFixed(2)}₺`,
                aciklama: `${hedefGramaj} gram ürün için maliyet hesaplaması`,
                kgBazindaHesaplama: {
                    satisFiyati: `${kgSatisFiyati}₺/KG`,
                    maliyet: `${ortalamaMaliyet.toFixed(2)}₺/KG`,
                    kar: `${(kgSatisFiyati - ortalamaMaliyet).toFixed(2)}₺/KG`
                }
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('Reçete maliyet hesaplama hatası:', error);
        res.status(500).json({
            error: 'Maliyet hesaplaması yapılırken hata oluştu',
            details: error.message
        });
    }
}

// Malzeme maliyeti hesaplama fonksiyonu
function getMalzemeMaliyeti(stokKod) {
    const malzemeMaliyetleri = {
        // Hammaddeler (₺/KG) - Güncel piyasa fiyatları
        'UN': 8,                    // Un
        'SEKER': 12,               // Şeker  
        'TEREYAG': 45,             // Tereyağı
        'YUMURTA': 25,             // Yumurta
        'SUT': 15,                 // Süt
        'ANTEP_FISTIK': 180,       // Antep Fıstığı
        'CEVIZ': 80,               // Ceviz
        'FINDIK': 90,              // Fındık
        'PHYLLO': 20,              // Yufka
        'SERBETLIK_SEKER': 12,     // Şerbet için şeker
        'LIMON': 8,                // Limon
        'VANILYA': 150,            // Vanilya
        'KAKAO': 35,               // Kakao
        'CIKOLATA': 60,            // Çikolata
        'PEYNIR': 40,              // Peynir
        'MAYDANOZ': 15,            // Maydanoz
        'SADE_YAG': 25,            // Sade Yağ
        'BADEM': 120,              // Badem
        'SUSAM': 30,               // Susam
        'HINDISTAN_CEVIZI': 40,    // Hindistan Cevizi
        'KREMA': 35,               // Krema
        'YOGURT': 18,              // Yoğurt
        'PEKMEZ': 25,              // Pekmez
        'BAL': 80,                 // Bal
        'TARÇIN': 200,             // Tarçın
        'KARANFIL': 300,           // Karanfil
        'ZENCEFIL': 150            // Zencefil
    };

    return malzemeMaliyetleri[stokKod] || 10; // Varsayılan 10₺/KG
} 