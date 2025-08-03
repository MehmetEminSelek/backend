// Database'deki kullanıcıları kontrol et
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUsers() {
    try {
        console.log('🔍 Database kullanıcıları kontrol ediliyor...\n');
        
        const users = await prisma.user.findMany({
            take: 10,
            select: {
                personelId: true,
                username: true,
                ad: true,
                soyad: true,
                email: true,
                rol: true,
                aktif: true
            },
            orderBy: {
                personelId: 'asc'
            }
        });

        console.log(`📊 Toplam ${users.length} kullanıcı bulundu:\n`);
        
        users.forEach((user, index) => {
            const expectedPassword = user.ad.substring(0, 3).toLowerCase() + '123';
            console.log(`${index + 1}. ${user.personelId} | ${user.username} | ${user.ad} ${user.soyad || ''}`);
            console.log(`   📧 Email: ${user.email || 'yok'}`);
            console.log(`   🎭 Rol: ${user.rol}`);
            console.log(`   ✅ Aktif: ${user.aktif}`);
            console.log(`   🔑 Beklenen şifre: ${expectedPassword}`);
            console.log('   ─────────────────────────────────\n');
        });

        // Test user'ı kontrol et
        const testUser = await prisma.user.findFirst({
            where: { username: 'test.user' },
            select: {
                personelId: true,
                username: true,
                ad: true,
                password: true,
                aktif: true
            }
        });

        if (testUser) {
            console.log('🧪 TEST USER bulundu:');
            console.log(`   PersonelId: ${testUser.personelId}`);
            console.log(`   Username: ${testUser.username}`);
            console.log(`   Ad: ${testUser.ad}`);
            console.log(`   Aktif: ${testUser.aktif}`);
            console.log(`   Password hash: ${testUser.password.substring(0, 20)}...`);
        } else {
            console.log('❌ TEST USER bulunamadı');
        }

    } catch (error) {
        console.error('❌ Hata:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUsers();