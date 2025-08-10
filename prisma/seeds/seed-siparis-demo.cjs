// Demo sipariş seed'i: 20 sipariş oluşturur
// - 5 adet HAZIRLLANACAK
// - 8 adet ONAY_BEKLEYEN
// - 7 adet HAZIRLANDI
// Her siparişte en az 1 tepsi ve 1 kutu olacak (ilk kalemde her ikisini set ederiz)

/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function pickRandom(array, fallback = null) {
    if (!Array.isArray(array) || array.length === 0) return fallback;
    return array[Math.floor(Math.random() * array.length)];
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

async function getLatestPriceMap(urunIds) {
    const fiyatlar = await prisma.urunFiyat.findMany({
        where: { urunId: { in: urunIds }, aktif: true },
        orderBy: { baslangicTarihi: 'desc' },
        select: { urunId: true, kgFiyati: true }
    });
    const map = new Map();
    for (const f of fiyatlar) {
        if (!map.has(f.urunId)) map.set(f.urunId, Number(f.kgFiyati) || 0);
    }
    return map;
}

function calcLine(miktarKg, birimFiyat, iskonto = 0, kdvOrani = 18) {
    const araToplam = round2(miktarKg * birimFiyat);
    const kdvTutari = round2((araToplam * kdvOrani) / 100);
    const toplamTutar = round2(araToplam + kdvTutari - (Number(iskonto) || 0));
    const maliyetBirim = round2(birimFiyat * 0.7); // kaba maliyet varsayımı
    const toplamMaliyet = round2(maliyetBirim * miktarKg);
    const karMarji = round2(toplamTutar - toplamMaliyet);
    const karOrani = toplamTutar > 0 ? round2((karMarji / toplamTutar) * 100) : 0;
    return { araToplam, kdvTutari, toplamTutar, maliyetBirim, toplamMaliyet, karMarji, karOrani };
}

async function main() {
    console.log('🧪 Demo sipariş seed başlıyor...');

    const users = await prisma.user.findMany({ select: { id: true }, take: 50 });
    const teslimatlar = await prisma.teslimatTuru.findMany({ select: { id: true }, take: 20 });
    const cariler = await prisma.cariMusteri.findMany({ select: { id: true, cariAdi: true, telefon: true }, take: 200 });
    const urunler = await prisma.urun.findMany({ select: { id: true, ad: true, aktif: true }, where: { aktif: true }, take: 200 });
    const tepsiler = await prisma.tepsiTava.findMany({ select: { id: true }, take: 50 });
    const kutular = await prisma.kutu.findMany({ select: { id: true }, take: 50 });

    if (urunler.length === 0) throw new Error('Urun bulunamadı. Önce ürün seedlerini çalıştırın.');
    if (tepsiler.length === 0) throw new Error('Tepsi/Tava bulunamadı.');
    if (kutular.length === 0) throw new Error('Kutu bulunamadı.');
    if (teslimatlar.length === 0) throw new Error('Teslimat türü bulunamadı.');

    const fiyatMap = await getLatestPriceMap(urunler.map(u => u.id));

    // Dağılım
    const statuses = [
        ...Array(5).fill('HAZIRLLANACAK'),
        ...Array(8).fill('ONAY_BEKLEYEN'),
        ...Array(7).fill('HAZIRLANDI')
    ];

    let created = 0;
    for (let i = 0; i < statuses.length; i++) {
        const durum = statuses[i];
        const u1 = pickRandom(urunler);
        const u2 = pickRandom(urunler);
        const tepsi = pickRandom(tepsiler);
        const kutu = pickRandom(kutular);
        const teslim = pickRandom(teslimatlar);
        const user = pickRandom(users);
        const cm = pickRandom(cariler);

        const gonderenAdi = cm?.cariAdi || `Demo Müşteri ${String(i + 1).padStart(2, '0')}`;
        const gonderenTel = cm?.telefon || `0555${Math.floor(1000000 + Math.random() * 8999999)}`;

        // Tarihler: son 10 gün içinde
        const dayOffset = Math.floor(Math.random() * 10);
        const tarih = new Date();
        tarih.setDate(tarih.getDate() - dayOffset);

        const miktar1 = round2(Math.max(0.5, Math.random() * 2.5));
        const miktar2 = round2(Math.max(0.5, Math.random() * 1.5));
        const f1 = Number(fiyatMap.get(u1.id)) || 1200;
        const f2 = Number(fiyatMap.get(u2.id)) || 1000;
        const l1 = calcLine(miktar1, f1);
        const l2 = calcLine(miktar2, f2);

        const totalAmount = round2(l1.toplamTutar + l2.toplamTutar);
        const totalCost = round2(l1.toplamMaliyet + l2.toplamMaliyet);

        await prisma.$transaction(async (tx) => {
            // müşteri oluştur/yada al
            let musteriId = cm?.id;
            if (!musteriId) {
                const createdCari = await tx.cariMusteri.create({
                    data: { cariAdi: gonderenAdi, telefon: gonderenTel, musteriKodu: `AUTO-${Date.now()}-${i}` }
                });
                musteriId = createdCari.id;
            }

            const orderCount = await tx.siparis.count();
            const siparisNo = `SP-${new Date().getFullYear()}-${String(orderCount + 1).padStart(5, '0')}`;

            const newOrder = await tx.siparis.create({
                data: {
                    siparisNo,
                    tarih,
                    teslimTarihi: tarih,
                    teslimSaati: '14:30',
                    teslimatTuruId: teslim.id,
                    cariId: musteriId,
                    gonderenAdi,
                    gonderenTel,
                    teslimatAdresi: 'Demo Adres, Test Mah. No:1',
                    il: 'GAZIANTEP',
                    kargoDurumu: 'ADRESE_TESLIMAT',
                    durum,
                    odemeDurumu: 'bekliyor',
                    toplamTutar: totalAmount,
                    toplamMaliyet: totalCost,
                    karMarji: round2(totalAmount - totalCost),
                    createdBy: user?.id || null
                }
            });

            // İlk kaleme tepsi + kutu ekliyoruz (en az 1 tepsi/kutu koşulu)
            await tx.siparisKalemi.create({
                data: {
                    siparisId: newOrder.id,
                    urunId: u1.id,
                    urunAdi: u1.ad,
                    urunKodu: null,
                    miktar: miktar1,
                    birim: 'KG',
                    birimFiyat: f1,
                    kdvOrani: 18,
                    iskonto: 0,
                    araToplam: l1.araToplam,
                    kdvTutari: l1.kdvTutari,
                    toplamTutar: l1.toplamTutar,
                    birimMaliyet: l1.maliyetBirim,
                    toplamMaliyet: l1.toplamMaliyet,
                    karMarji: l1.karMarji,
                    karOrani: l1.karOrani,
                    tepsiTavaId: tepsi.id,
                    kutuId: kutu.id
                }
            });

            await tx.siparisKalemi.create({
                data: {
                    siparisId: newOrder.id,
                    urunId: u2.id,
                    urunAdi: u2.ad,
                    urunKodu: null,
                    miktar: miktar2,
                    birim: 'KG',
                    birimFiyat: f2,
                    kdvOrani: 18,
                    iskonto: 0,
                    araToplam: l2.araToplam,
                    kdvTutari: l2.kdvTutari,
                    toplamTutar: l2.toplamTutar,
                    birimMaliyet: l2.maliyetBirim,
                    toplamMaliyet: l2.toplamMaliyet,
                    karMarji: l2.karMarji,
                    karOrani: l2.karOrani
                }
            });
        });

        created++;
        console.log(`✅ Sipariş oluşturuldu (${created}/${statuses.length})`);
    }

    console.log('🎉 Demo sipariş seed tamamlandı.');
}

if (require.main === module) {
    main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
}

module.exports = { seedSiparisDemo: main };


