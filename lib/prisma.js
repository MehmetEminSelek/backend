import { PrismaClient } from '@prisma/client';

/**
 * Production-ready Prisma Client with singleton pattern
 * Based on Prisma best practices for Next.js applications
 */

// Global type declaration for development
const globalForPrisma = globalThis;

// Create a single instance with proper configuration
function createPrismaClient() {
    return new PrismaClient({
        log: process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
        datasources: {
            db: {
                url: process.env.DATABASE_URL
            }
        }
    });
}

// Use singleton pattern to prevent multiple instances
const prisma = globalForPrisma.prisma ?? createPrismaClient();

// In development, save to global to prevent hot-reload issues
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

// Connection management
async function connectWithRetry(retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            await prisma.$connect();
            console.log('✅ Database connected successfully');
            return;
        } catch (error) {
            console.error(`❌ Database connection attempt ${i + 1} failed:`, error.message);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Graceful shutdown handler
process.on('beforeExit', async () => {
    await prisma.$disconnect();
    console.log('🔌 Database disconnected');
});

export default prisma;
export { connectWithRetry };
