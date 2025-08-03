// Fix baris.gullu role to GENEL_MUDUR
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixUserRole() {
    try {
        console.log('🔄 Updating baris.gullu role to GENEL_MUDUR...');

        const updatedUser = await prisma.user.update({
            where: {
                personelId: 'baris.gullu'
            },
            data: {
                rol: 'GENEL_MUDUR'
            }
        });

        console.log('✅ User role updated:', {
            personelId: updatedUser.personelId,
            ad: updatedUser.ad,
            oldRole: 'PERSONEL',
            newRole: updatedUser.rol
        });

    } catch (error) {
        console.error('❌ Role update error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

fixUserRole();