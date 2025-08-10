/**
 * Health Check Endpoint
 */

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: '1.0.0',
            services: {
                api: 'operational',
                database: 'checking...'
            }
        };

        // Quick database check
        try {
            const prismaModule = await import('@prisma/client');
            const PrismaClient = prismaModule.PrismaClient;
            const prisma = new PrismaClient();

            await prisma.$queryRaw`SELECT 1`;
            health.services.database = 'operational';

            await prisma.$disconnect();
        } catch (dbError) {
            console.error('Database health check failed:', dbError);
            health.services.database = 'error';
            health.status = 'degraded';
        }

        const statusCode = health.status === 'healthy' ? 200 : 503;

        return res.status(statusCode).json(health);

    } catch (error) {
        console.error('Health check error:', error);
        return res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
}