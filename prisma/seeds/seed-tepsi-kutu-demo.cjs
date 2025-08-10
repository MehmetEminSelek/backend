const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🥤 Tepsi/Kutu demo seed...');

    const tepsiAdlari = [
        'Demo Tepsi 1', 'Demo Tepsi 2', 'Demo Tepsi 3'
    ];
    const kutuAdlari = [
        'Demo Kutu 1', 'Demo Kutu 2', 'Demo Kutu 3'
    ];

    for (const ad of tepsiAdlari) {
        await prisma.tepsiTava.upsert({
            where: { ad },
            update: {},
            create: { ad, kod: `TP-DEMO-${ad.split(' ').pop()}`, aktif: true }
        });
    }

    for (const ad of kutuAdlari) {
        await prisma.kutu.upsert({
            where: { ad },
            update: {},
            create: { ad, kod: `KT-DEMO-${ad.split(' ').pop()}`, aktif: true, fiyat: 5 }
        });
    }

    console.log('✅ Tepsi/Kutu demo seed tamam.');
}

if (require.main === module) {
    main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
}

module.exports = { seedTepsiKutuDemo: main };

