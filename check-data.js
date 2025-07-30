// Veritabanında sipariş kontrolü
import prisma from './lib/prisma.js';

async function checkData() {
    try {
        console.log('🔍 Veritabanı kontrol ediliyor...\n');

        // 1. Toplam sipariş sayısı
        const toplamSiparis = await prisma.siparis.count();
        console.log('📦 Toplam Sipariş Sayısı:', toplamSiparis);

        // 2. Durum bazında sipariş sayıları
        const durumlar = await prisma.siparis.groupBy({
            by: ['durum'],
            _count: { id: true }
        });
        console.log('📊 Durum Bazında:');
        durumlar.forEach(durum => {
            console.log(`  - ${durum.durum}: ${durum._count.id} sipariş`);
        });

        // 3. En eski ve en yeni sipariş tarihleri
        const enEski = await prisma.siparis.findFirst({
            orderBy: { tarih: 'asc' },
            select: { tarih: true, durum: true }
        });

        const enYeni = await prisma.siparis.findFirst({
            orderBy: { tarih: 'desc' },
            select: { tarih: true, durum: true }
        });

        console.log('\n📅 Tarih Aralığı:');
        if (enEski) console.log('  En eski:', enEski.tarih.toISOString().slice(0, 10), enEski.durum);
        if (enYeni) console.log('  En yeni:', enYeni.tarih.toISOString().slice(0, 10), enYeni.durum);

        // 4. Güncel ayda siparişler (2025 Ocak)
        const ocak2025 = await prisma.siparis.count({
            where: {
                tarih: {
                    gte: new Date('2025-01-01'),
                    lte: new Date('2025-01-31')
                }
            }
        });
        console.log('📊 Ocak 2025 Siparişleri:', ocak2025);

        // 5. Onaylanmış siparişler (ONAY_BEKLEYEN hariç)
        const onaylanmis = await prisma.siparis.count({
            where: {
                durum: { not: 'ONAY_BEKLEYEN' }
            }
        });
        console.log('✅ Onaylanmış Siparişler:', onaylanmis);

        // 6. Son 5 sipariş örneği
        const sonSiparisler = await prisma.siparis.findMany({
            take: 5,
            orderBy: { tarih: 'desc' },
            select: {
                id: true,
                tarih: true,
                durum: true,
                toplamTutar: true,
                gonderenAdi: true
            }
        });

        console.log('\n🔍 Son 5 Sipariş:');
        sonSiparisler.forEach(sip => {
            console.log(`  ID: ${sip.id}, Tarih: ${sip.tarih.toISOString().slice(0, 10)}, Durum: ${sip.durum}, Tutar: ${sip.toplamTutar}, Müşteri: ${sip.gonderenAdi}`);
        });

    } catch (error) {
        console.error('❌ Veritabanı hatası:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkData(); 