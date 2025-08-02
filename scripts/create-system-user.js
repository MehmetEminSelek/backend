const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createSystemUser() {
    try {
        // SYSTEM kullanıcısı zaten var mı kontrol et
        const existingSystem = await prisma.user.findFirst({
            where: { personelId: 'SYSTEM' }
        });

        if (existingSystem) {
            console.log('✅ SYSTEM kullanıcısı zaten mevcut');
            return;
        }

        // SYSTEM kullanıcısı oluştur
        const systemUser = await prisma.user.create({
            data: {
                personelId: 'SYSTEM',
                username: 'system',
                email: 'system@ogsiparis.com',
                password: '$2b$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', // Invalid hash
                ad: 'System',
                soyad: 'User',
                rol: 'PERSONEL',
                aktif: false // Login yapamaması için
            }
        });

        console.log('✅ SYSTEM kullanıcısı oluşturuldu:', systemUser.personelId);
    } catch (error) {
        console.error('❌ SYSTEM kullanıcısı oluşturulamadı:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createSystemUser();