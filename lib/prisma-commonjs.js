// CommonJS wrapper for Prisma singleton
const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient({
        log: ['error'],
        datasources: {
            db: {
                url: process.env.DATABASE_URL
            }
        }
    });
} else {
    if (!global.prisma) {
        global.prisma = new PrismaClient({
            log: ['query', 'error', 'warn'],
            datasources: {
                db: {
                    url: process.env.DATABASE_URL
                }
            }
        });
    }
    prisma = global.prisma;
}

module.exports = prisma;