import { PrismaClient } from '@prisma/client'

// 🚀 CONCURRENCY OPTIMIZED PRISMA CLIENT
let prisma;

const prismaConfig = {
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },

    // 🔥 CONNECTION POOL OPTIMIZATION
    __internal: {
        engine: {
            // Connection pool for concurrent users
            connection_limit: 20,        // Up from default 5
            pool_timeout: 10000,         // 10s timeout
            schema_cache_size: 1000,     // Cache optimization
        }
    },

    // 📊 PERFORMANCE LOGGING
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],

    // ⚡ TRANSACTION SETTINGS
    transactionOptions: {
        maxWait: 5000,        // 5s max wait for transaction
        timeout: 10000,       // 10s transaction timeout
        isolationLevel: 'ReadCommitted'  // Optimal for concurrent reads
    }
};

if (process.env.NODE_ENV === 'production') {
    // Production: Single instance with connection pooling
    prisma = new PrismaClient(prismaConfig);

    // 🔄 CONNECTION HEALTH CHECK
    prisma.$on('beforeExit', async () => {
        console.log('💾 Prisma connection closing...');
        await prisma.$disconnect();
    });

} else {
    // Development: Global instance to prevent connection leaks
    if (!global.prisma) {
        global.prisma = new PrismaClient(prismaConfig);

        // 📈 DEVELOPMENT MONITORING
        global.prisma.$on('query', (e) => {
            if (e.duration > 1000) {  // Log slow queries
                console.warn(`🐌 Slow query detected: ${e.duration}ms`);
                console.log(e.query);
            }
        });
    }
    prisma = global.prisma;
}

// 🛡️ CONNECTION POOL MONITORING
export const getConnectionStats = async () => {
    try {
        const result = await prisma.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) filter (where state = 'active') as active_connections,
        count(*) filter (where state = 'idle') as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
        return result[0];
    } catch (error) {
        console.error('Connection stats error:', error);
        return null;
    }
};

// 📊 TRANSACTION PERFORMANCE WRAPPER
export const performanceTransaction = async (operation, label = 'transaction') => {
    const startTime = Date.now();

    try {
        const result = await prisma.$transaction(operation, {
            maxWait: 5000,
            timeout: 10000
        });

        const duration = Date.now() - startTime;

        if (duration > 2000) {
            console.warn(`⚠️ Slow ${label}: ${duration}ms`);
        } else {
            console.log(`✅ ${label} completed: ${duration}ms`);
        }

        return result;

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ ${label} failed after ${duration}ms:`, error.message);
        throw error;
    }
};

// 🔒 CONCURRENT ORDER SAFE CREATION
export const createOrderSafe = async (orderData) => {
    const startTime = Date.now();

    return await performanceTransaction(async (tx) => {
        // 1. Optimistic concurrency check
        const concurrentOrderCount = await tx.siparis.count({
            where: {
                createdAt: {
                    gte: new Date(Date.now() - 5000) // Last 5 seconds
                }
            }
        });

        if (concurrentOrderCount > 10) {
            throw new Error('🚨 High concurrent load detected. Please try again.');
        }

        // 2. Create order with batch operations
        const newOrder = await tx.siparis.create({
            data: orderData.order
        });

        // 3. Batch create order items (more efficient than loop)
        if (orderData.items && orderData.items.length > 0) {
            await tx.siparisKalemi.createMany({
                data: orderData.items.map(item => ({
                    ...item,
                    siparisId: newOrder.id
                }))
            });
        }

        return newOrder;

    }, `Order Creation (${orderData.items?.length || 0} items)`);
};

export default prisma; 